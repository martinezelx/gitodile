//! Finishing or abandoning a paused merge (task 037-5, ADR 0041 §9).
//!
//! Two actions, each planned on its own and separate from leaving the
//! screen, saving a version and marking a file resolved. A plan is read-only
//! and answers with a token; execution takes the write lock, proves the token
//! again, runs Git's own command and verifies what Git left before it
//! reports. Neither publishes, and neither repairs an outcome it cannot
//! verify: it reports what it observed and keeps every copy it made.

use super::{
    describe_session, read_session, stage_entries, stale, ConflictOrigin, ConflictSession,
    ConflictSnapshotSummary, SessionAction, SessionRead, SideLabel, UnmergedPath,
};
use crate::application::{self, in_parallel};
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{
    git_stdout, run_git, run_git_capped, run_git_with_env, run_git_with_env_and_input,
};
use crate::index::copy_project_index;
use crate::operation::truncate_detail;
use crate::recovery::{create_conflict_snapshot, record_conflict_abandon};
use crate::repository_access::RepositoryContext;
use crate::save_version::{
    classify_commit_failure, identity_configured, SaveVersionFile, SAVE_PLAN_FILE_LIMIT,
};
use crate::status::ChangeCategory;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

/// Output cap for the index and working-tree listings a plan reads, the same
/// bound as the unmerged listing.
const MAX_LISTING_BYTES: usize = 16 * 1024 * 1024;

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FinishMergePlan {
    pub(crate) state_token: String,
    pub(crate) session_id: String,
    pub(crate) current: SideLabel,
    pub(crate) incoming: SideLabel,
    /// Files the reader resolved in this session.
    pub(crate) resolved_files: usize,
    /// Files the saved version changes on the current branch; `files` holds
    /// the first `SAVE_PLAN_FILE_LIMIT` of them.
    pub(crate) total_files: usize,
    pub(crate) files: Vec<SaveVersionFile>,
    /// Files with changes Git has not been told about, which the saved
    /// version leaves out and which stay as they are.
    pub(crate) unsaved_files: usize,
    /// Resolved files edited again after they were marked: the version takes
    /// what was marked, and the later edit stays unsaved.
    pub(crate) edited_after_resolving: usize,
    /// The message Git prepared (`MERGE_MSG`), its comment lines left out.
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    /// Whether Git will sign the saved version (`commit.gpgSign`).
    pub(crate) signs: bool,
    pub(crate) snapshot: Option<ConflictSnapshotSummary>,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FinishMergeResult {
    pub(crate) commit: String,
    pub(crate) short_commit: String,
    pub(crate) title: String,
    pub(crate) branch: Option<String>,
}

/// Whether abandoning the merge can promise the project comes back exactly
/// as it was before the merge (ADR 0041 §6).
#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Restoration {
    /// GitOdile started the merge on a state it recorded, and its snapshot is
    /// complete.
    Exact,
    /// Started elsewhere: what was unsaved before the merge is unknown, and
    /// Git may not be able to bring all of it back.
    BestEffort,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AbortMergePlan {
    pub(crate) state_token: String,
    pub(crate) session_id: String,
    pub(crate) origin: ConflictOrigin,
    pub(crate) restoration: Restoration,
    pub(crate) current: SideLabel,
    pub(crate) incoming: SideLabel,
    /// Overlapping files, resolved or not, whose content goes back.
    pub(crate) files: usize,
    pub(crate) unresolved_files: usize,
    /// Changes the merge brought in that are staged now.
    pub(crate) staged_files: usize,
    /// Unsaved changes outside the overlapping files, which Git keeps or
    /// refuses to abandon the merge over.
    pub(crate) unsaved_files: usize,
    pub(crate) snapshot: Option<ConflictSnapshotSummary>,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AbortMergeResult {
    pub(crate) restoration: Restoration,
    /// The snapshot's ref and the ref of the index as it stood before.
    pub(crate) snapshot_reference: Option<String>,
    pub(crate) abandoned_reference: Option<String>,
}

fn unsupported() -> AppError {
    AppError::new(
        AppErrorCode::ConflictActionUnavailable,
        "GitOdile can't finish or abandon this paused operation.",
    )
    .with_remediation("Read the overlapping changes again to see what is paused.")
}

fn files_left() -> AppError {
    AppError::new(
        AppErrorCode::UnresolvedConflicts,
        "Some files still have overlapping changes.",
    )
    .with_remediation("Mark every file resolved, then finish the merge.")
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn token(parts: &[&[u8]]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update((part.len() as u64).to_le_bytes());
        hasher.update(part);
    }
    hex(&hasher.finalize()[..16])
}

/// One record of `diff-index --raw -z`: its status letter and raw path.
#[derive(Debug, PartialEq)]
pub(crate) struct StagedChange {
    pub(crate) status: u8,
    pub(crate) path: Vec<u8>,
}

/// Parses `git diff-index --cached --raw -z --no-renames HEAD`:
/// `:<mode> <mode> <object> <object> <status>\0<path>\0` per change.
pub(crate) fn parse_staged_changes(output: &[u8]) -> Vec<StagedChange> {
    let mut changes = Vec::new();
    let mut fields = output.split(|byte| *byte == 0);
    while let Some(meta) = fields.next() {
        if meta.is_empty() {
            continue;
        }
        let Some(path) = fields.next() else {
            break;
        };
        let Some(status) = meta.iter().rev().find(|byte| byte.is_ascii_alphabetic()) else {
            continue;
        };
        changes.push(StagedChange {
            status: *status,
            path: path.to_vec(),
        });
    }
    changes
}

fn category(status: u8) -> ChangeCategory {
    match status {
        b'A' => ChangeCategory::New,
        b'D' => ChangeCategory::Deleted,
        b'U' => ChangeCategory::Conflicted,
        _ => ChangeCategory::Changed,
    }
}

/// The title and details of the message Git prepared for the merge: comment
/// lines go, as Git's own cleanup would drop them, and the first line left is
/// the title.
pub(crate) fn merge_message(text: &str) -> (Option<String>, Option<String>) {
    let lines = text
        .lines()
        .filter(|line| !line.starts_with('#'))
        .map(str::trim_end)
        .collect::<Vec<_>>();
    let Some(first) = lines.iter().position(|line| !line.trim().is_empty()) else {
        return (None, None);
    };
    let details = lines[first + 1..].join("\n");
    let details = details.trim();
    (
        Some(lines[first].trim().to_string()),
        (!details.is_empty()).then(|| details.to_string()),
    )
}

/// Raw listing output, or an unreadable-project error.
fn listing(path: &str, args: &[&str]) -> Result<Vec<u8>, AppError> {
    let output = run_git_capped(path, args, MAX_LISTING_BYTES)?;
    if !output.status.success() {
        return Err(super::unreadable());
    }
    Ok(output.stdout)
}

fn staged_listing(path: &str) -> Result<Vec<u8>, AppError> {
    listing(
        path,
        &[
            "diff-index",
            "--cached",
            "--raw",
            "-z",
            "--no-renames",
            "HEAD",
        ],
    )
}

/// The porcelain `diff` rather than `diff-files`: it compares content where
/// the index's file times are stale, as they are for every entry Mark
/// resolved staged through `--index-info`, and with `GIT_OPTIONAL_LOCKS=0`
/// it writes nothing back.
fn unsaved_listing(path: &str) -> Result<Vec<u8>, AppError> {
    listing(path, &["diff", "--name-only", "-z"])
}

fn signs(path: &str) -> Result<bool, AppError> {
    let output = run_git(path, &["config", "--bool", "commit.gpgSign"])?;
    Ok(output.status.success() && git_stdout(&output) == "true")
}

/// Unsaved paths split into those outside the session's files and those
/// inside it.
fn unsaved_counts(raw: &[u8], session: &ConflictSession) -> (usize, usize) {
    let listed = session
        .files
        .iter()
        .map(|file| file.path.as_bytes())
        .collect::<HashSet<_>>();
    raw.split(|byte| *byte == 0)
        .filter(|name| !name.is_empty())
        .fold((0, 0), |(outside, inside), name| {
            if listed.contains(name) {
                (outside, inside + 1)
            } else {
                (outside + 1, inside)
            }
        })
}

/// A supported merge, read now, with the one merge head and the `HEAD` it
/// paused on.
struct PausedMerge {
    head: String,
    merge_head: String,
    unmerged: Vec<UnmergedPath>,
    session: ConflictSession,
}

fn paused_merge(path: &str, repository: &RepositoryContext) -> Result<PausedMerge, AppError> {
    let read: SessionRead = read_session(path, repository)?.ok_or_else(stale)?;
    let head = read.head.clone().ok_or_else(stale)?;
    let unmerged = read.listing.paths.clone();
    let session = describe_session(repository, read);
    if !session.operation.supported {
        return Err(unsupported());
    }
    let [merge_head] = session.operation.operation_heads.as_slice() else {
        return Err(unsupported());
    };
    Ok(PausedMerge {
        head,
        merge_head: merge_head.clone(),
        unmerged,
        session,
    })
}

fn check_finish(
    path: &str,
    repository: &RepositoryContext,
    identity_override: Option<&str>,
) -> Result<(FinishMergePlan, PausedMerge), AppError> {
    let merge = paused_merge(path, repository)?;
    if !merge
        .session
        .allowed_actions
        .contains(&SessionAction::FinishMerge)
    {
        return Err(files_left());
    }
    let ((staged, unsaved), (identity, signs)) = in_parallel(
        || in_parallel(|| staged_listing(path), || unsaved_listing(path)),
        || {
            in_parallel(
                || identity_configured(path, identity_override),
                || signs(path),
            )
        },
    );
    let (staged, unsaved, signs) = (staged?, unsaved?, signs?);
    if !identity? {
        return Err(AppError::new(
            AppErrorCode::MissingIdentity,
            "GitOdile doesn't know who is saving this version yet.",
        )
        .with_remediation("Add a name and email for Git, then try again."));
    }
    let changes = parse_staged_changes(&staged);
    let message = std::fs::read(repository.git_dir.backend_path().join("MERGE_MSG"))
        .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
        .unwrap_or_default();
    let (title, description) = merge_message(&message);
    let (unsaved_files, edited_after_resolving) = unsaved_counts(&unsaved, &merge.session);
    let incoming = &merge.session.operation.incoming;
    let title = title.unwrap_or_else(|| {
        format!(
            "Merge {}",
            incoming.name.as_deref().unwrap_or(&merge.merge_head)
        )
    });
    let plan = FinishMergePlan {
        state_token: token(&[
            merge.session.state_token.as_bytes(),
            merge.head.as_bytes(),
            &staged,
        ]),
        session_id: merge.session.session_id.clone(),
        current: merge.session.operation.current.clone(),
        incoming: incoming.clone(),
        resolved_files: merge.session.files.len(),
        total_files: changes.len(),
        files: changes
            .iter()
            .take(SAVE_PLAN_FILE_LIMIT)
            .map(|change| SaveVersionFile {
                path: String::from_utf8_lossy(&change.path).into_owned(),
                original_path: None,
                category: category(change.status),
            })
            .collect(),
        unsaved_files,
        edited_after_resolving,
        title,
        description,
        signs,
        snapshot: merge.session.snapshot.clone(),
    };
    Ok((plan, merge))
}

/// What the project holds right after Git ran, read without trusting Git's
/// exit status. Every question that cannot be answered is answered
/// conservatively, so an unreadable state is never taken for success.
#[derive(Debug, PartialEq, Default)]
pub(crate) struct Observed {
    pub(crate) head: Option<String>,
    pub(crate) parents: Vec<String>,
    pub(crate) merge_head: bool,
    pub(crate) unmerged: bool,
    pub(crate) index_matches_head: bool,
}

fn observe(path: &str, repository: &RepositoryContext) -> Observed {
    let commits = run_git(path, &["rev-list", "--parents", "-n", "1", "HEAD"])
        .ok()
        .filter(|output| output.status.success())
        .map(|output| {
            git_stdout(&output)
                .split_whitespace()
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let unmerged = run_git_capped(path, &["ls-files", "-u", "-z"], 1)
        .map(|output| !output.status.success() || !output.stdout.is_empty())
        .unwrap_or(true);
    let index_matches_head = run_git(path, &["diff-index", "--cached", "--quiet", "HEAD", "--"])
        .is_ok_and(|output| output.status.success());
    Observed {
        head: commits.first().cloned(),
        parents: commits.iter().skip(1).cloned().collect(),
        merge_head: repository
            .git_dir
            .backend_path()
            .join("MERGE_HEAD")
            .exists(),
        unmerged,
        index_matches_head,
    }
}

/// How an attempt ended, from what it left rather than what Git said.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub(crate) enum Outcome {
    Done,
    Unchanged,
    Uncertain,
}

/// Finishing is done when `HEAD` is a new version whose parents are the
/// paused `HEAD` and the merge head, the merge's marker is gone and the index
/// is that version. It changed nothing when `HEAD` and the marker are as they
/// were.
pub(crate) fn finish_outcome(
    before: &str,
    merge_head: &str,
    observed: &Observed,
    succeeded: bool,
) -> Outcome {
    if observed.parents == [before, merge_head]
        && !observed.merge_head
        && !observed.unmerged
        && observed.index_matches_head
    {
        return Outcome::Done;
    }
    if !succeeded && observed.head.as_deref() == Some(before) && observed.merge_head {
        return Outcome::Unchanged;
    }
    Outcome::Uncertain
}

/// Abandoning is done when the marker is gone, `HEAD` never moved and
/// nothing overlaps; an exact restoration also needs the index back at
/// `HEAD`. It changed nothing when the session reads exactly as before.
pub(crate) fn abort_outcome(
    before: &str,
    restoration: Restoration,
    observed: &Observed,
    succeeded: bool,
    session_unchanged: bool,
) -> Outcome {
    let head_kept = observed.head.as_deref() == Some(before);
    if head_kept
        && !observed.merge_head
        && !observed.unmerged
        && (restoration == Restoration::BestEffort || observed.index_matches_head)
    {
        return Outcome::Done;
    }
    if !succeeded && head_kept && observed.merge_head && session_unchanged {
        return Outcome::Unchanged;
    }
    Outcome::Uncertain
}

fn describe(observed: &Observed) -> String {
    let yes_no = |value: bool| if value { "yes" } else { "no" };
    format!(
        "HEAD: {}; parents: {}; merge head present: {}; unmerged entries: {}; index matches HEAD: {}",
        observed.head.as_deref().unwrap_or("unreadable"),
        if observed.parents.is_empty() {
            "none".to_string()
        } else {
            observed.parents.join(" ")
        },
        yes_no(observed.merge_head),
        yes_no(observed.unmerged),
        yes_no(observed.index_matches_head),
    )
}

fn uncertain(message: &str, observed: &Observed) -> AppError {
    AppError::new(AppErrorCode::MergeOutcomeUncertain, message)
        .with_remediation(
            "Read the overlapping changes again before going on. GitOdile changed nothing else and kept its copy of the overlap.",
        )
        .with_detail(describe(observed))
}

/// What finishing would save, read-only. Refuses while any file overlaps, the
/// listing is partial, or Git has no identity to save with.
pub(crate) fn plan_finish_merge(path: String) -> Result<FinishMergePlan, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "plan_finish_merge", None)?;
    plan_finish_merge_with(&path, &repository, None)
}

/// [`plan_finish_merge`] once authorized, with [`finish_merge_with`]'s
/// identity override.
pub(crate) fn plan_finish_merge_with(
    path: &str,
    repository: &RepositoryContext,
    identity_override: Option<&str>,
) -> Result<FinishMergePlan, AppError> {
    check_finish(path, repository, identity_override).map(|(plan, _)| plan)
}

pub(crate) fn finish_merge(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    run_hooks: bool,
) -> Result<FinishMergeResult, AppError> {
    let (repository, _access) = application::authorize_repository(&path, "finish_merge", None)?;
    finish_merge_with(
        &path,
        &repository,
        &title,
        description.as_deref(),
        &state_token,
        run_hooks,
        None,
    )
}

/// [`finish_merge`] once authorized; `identity_override` points
/// `GIT_CONFIG_GLOBAL` elsewhere, as Save version's tests do.
pub(crate) fn finish_merge_with(
    path: &str,
    repository: &RepositoryContext,
    title: &str,
    description: Option<&str>,
    state_token: &str,
    run_hooks: bool,
    identity_override: Option<&str>,
) -> Result<FinishMergeResult, AppError> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::new(
            AppErrorCode::EmptyTitle,
            "Write a short name before saving.",
        ));
    }
    if title.contains(['\r', '\n']) {
        return Err(AppError::new(
            AppErrorCode::InvalidTitle,
            "Keep the version name on one line.",
        ));
    }
    let message = match description.map(str::trim).filter(|text| !text.is_empty()) {
        Some(details) => format!("{title}\n\n{details}"),
        None => title.to_string(),
    };
    let (plan, merge) = check_finish(path, repository, identity_override)?;
    if plan.state_token != state_token {
        return Err(stale());
    }

    // `git commit` concludes the merge Git paused: the parents come from
    // `MERGE_HEAD`, the project's commit hooks run and `commit.gpgSign` is
    // honoured. `--no-verify` only when hooks are off in Settings.
    let mut args = vec!["commit"];
    if !run_hooks {
        args.push("--no-verify");
    }
    args.extend(["-m", message.as_str()]);
    let envs = identity_override
        .map(|global| vec![("GIT_CONFIG_GLOBAL", global)])
        .unwrap_or_default();
    let output = run_git_with_env(path, args, &envs);
    let succeeded = output.as_ref().is_ok_and(|output| output.status.success());
    let observed = observe(path, repository);
    match finish_outcome(&merge.head, &merge.merge_head, &observed, succeeded) {
        Outcome::Done => {}
        Outcome::Unchanged => {
            return Err(match output {
                Ok(output) => classify_commit_failure(
                    path,
                    &String::from_utf8_lossy(&output.stderr),
                    run_hooks,
                ),
                Err(error) => error,
            });
        }
        Outcome::Uncertain => {
            return Err(uncertain(
                "GitOdile couldn't confirm how finishing the merge ended.",
                &observed,
            ));
        }
    }
    let commit = observed.head.clone().unwrap_or_default();
    let short_commit = run_git(path, &["rev-parse", "--short", &commit])
        .ok()
        .filter(|output| output.status.success())
        .map(|output| git_stdout(&output))
        .unwrap_or_else(|| commit.chars().take(7).collect());
    Ok(FinishMergeResult {
        commit,
        short_commit,
        title: title.to_string(),
        branch: plan.current.name,
    })
}

fn check_abort(
    path: &str,
    repository: &RepositoryContext,
) -> Result<(AbortMergePlan, PausedMerge), AppError> {
    let merge = paused_merge(path, repository)?;
    if !merge
        .session
        .allowed_actions
        .contains(&SessionAction::AbortMerge)
    {
        return Err(unsupported());
    }
    let (staged, unsaved) = in_parallel(|| staged_listing(path), || unsaved_listing(path));
    let (staged, unsaved) = (staged?, unsaved?);
    let session = &merge.session;
    let restoration = match &session.snapshot {
        Some(snapshot) if session.origin == ConflictOrigin::Gitodile && snapshot.complete => {
            Restoration::Exact
        }
        _ => Restoration::BestEffort,
    };
    let plan = AbortMergePlan {
        state_token: token(&[
            session.state_token.as_bytes(),
            merge.head.as_bytes(),
            &staged,
            &unsaved,
        ]),
        session_id: session.session_id.clone(),
        origin: session.origin,
        restoration,
        current: session.operation.current.clone(),
        incoming: session.operation.incoming.clone(),
        files: session.files.len(),
        unresolved_files: session.unresolved_count,
        staged_files: parse_staged_changes(&staged)
            .iter()
            .filter(|change| change.status != b'U')
            .count(),
        unsaved_files: unsaved_counts(&unsaved, session).0,
        snapshot: session.snapshot.clone(),
    };
    Ok((plan, merge))
}

/// What abandoning would put back and what it cannot promise, read-only.
pub(crate) fn plan_abort_merge(path: String) -> Result<AbortMergePlan, AppError> {
    let (repository, _access) = application::authorize_repository(&path, "plan_abort_merge", None)?;
    check_abort(&path, &repository).map(|(plan, _)| plan)
}

/// The index without its unmerged paths, as a tree: every file marked
/// resolved and everything the merge brought in cleanly. Built on a copy, so
/// the real index is never touched.
fn staged_tree(path: &str, unmerged: &[UnmergedPath]) -> Result<String, AppError> {
    let failed = || {
        AppError::new(
            AppErrorCode::RecoveryFailed,
            "GitOdile couldn't keep a copy of the merge before abandoning it.",
        )
        .with_remediation("Nothing was changed. Check disk space and permissions, then try again.")
    };
    let copy = copy_project_index(path)?;
    let copy_path = copy.path.to_string_lossy().to_string();
    let envs = [("GIT_INDEX_FILE", copy_path.as_str())];
    if !unmerged.is_empty() {
        let hash_len = unmerged
            .iter()
            .flat_map(|path| [&path.base, &path.current, &path.incoming])
            .flatten()
            .map(|stage| stage.object_id.len())
            .next()
            .unwrap_or(40);
        let mut input = Vec::new();
        for unmerged in unmerged {
            input.extend_from_slice(format!("0 {}\t", "0".repeat(hash_len)).as_bytes());
            input.extend_from_slice(&unmerged.path);
            input.push(0);
        }
        let removed = run_git_with_env_and_input(
            path,
            &["update-index", "-z", "--index-info"],
            &envs,
            &input,
            4096,
        )?;
        if !removed.status.success() {
            return Err(failed());
        }
    }
    let written = run_git_with_env(path, ["write-tree"], &envs)?;
    let tree = git_stdout(&written);
    if !written.status.success() || !super::is_object_id(&tree) {
        return Err(
            failed().with_detail(truncate_detail(&String::from_utf8_lossy(&written.stderr)))
        );
    }
    Ok(tree)
}

/// Abandons the merge with Git's own `git merge --abort`, after keeping what
/// it is about to replace: the session's snapshot (taken now if it has
/// none), each overlapping file's stages and unsaved bytes in the journal,
/// and the rest of the index as a tree.
pub(crate) fn abort_merge(path: String, state_token: String) -> Result<AbortMergeResult, AppError> {
    let (repository, _access) = application::authorize_repository(&path, "abort_merge", None)?;
    let (plan, merge) = check_abort(&path, &repository)?;
    if plan.state_token != state_token {
        return Err(stale());
    }
    let snapshot = create_conflict_snapshot(
        &path,
        &repository,
        &merge.session.state_token,
        merge.session.origin,
    )?;
    let tree = staged_tree(&path, &merge.unmerged)?;
    let evidence = merge
        .unmerged
        .iter()
        .filter_map(|unmerged| {
            let relative = std::str::from_utf8(&unmerged.path).ok()?;
            Some((relative.to_string(), stage_entries(relative, unmerged)))
        })
        .collect();
    let journal = record_conflict_abandon(&path, &repository, &snapshot, evidence, &tree)?;

    // An entry Mark resolved staged through `--index-info` carries no file
    // times, so Git's reset would take its untouched file for an unsaved edit
    // and refuse. A refresh records the times and changes no content; files
    // really edited stay what they are, and the reset still refuses for them.
    let _ = run_git(&path, &["update-index", "-q", "--refresh"]);
    let output = run_git(&path, &["merge", "--abort"]);
    let succeeded = output.as_ref().is_ok_and(|output| output.status.success());
    let observed = observe(&path, &repository);
    let session_unchanged = !succeeded
        && read_session(&path, &repository)
            .ok()
            .flatten()
            .is_some_and(|read| read.state_token == merge.session.state_token);
    match abort_outcome(
        &merge.head,
        plan.restoration,
        &observed,
        succeeded,
        session_unchanged,
    ) {
        Outcome::Done => Ok(AbortMergeResult {
            restoration: plan.restoration,
            snapshot_reference: snapshot.pin_reference,
            abandoned_reference: journal.abandoned_index.map(|pinned| pinned.reference),
        }),
        Outcome::Unchanged => {
            let detail = match &output {
                Ok(output) => String::from_utf8_lossy(&output.stderr).into_owned(),
                Err(error) => error.message.clone(),
            };
            Err(AppError::new(
                AppErrorCode::MergeAbortRefused,
                "Git refused to abandon the merge, so nothing was changed.",
            )
            .with_remediation(
                "A file the merge changed may have unsaved edits Git won't overwrite. Save or set them aside, then try again.",
            )
            .with_detail(truncate_detail(&detail)))
        }
        Outcome::Uncertain => Err(uncertain(
            "GitOdile couldn't confirm how abandoning the merge ended.",
            &observed,
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_prepared_message_drops_comments_and_splits_title_from_details() {
        assert_eq!(
            merge_message("Merge branch 'feature'\n\n# Conflicts:\n#\tstory.txt\n"),
            (Some("Merge branch 'feature'".to_string()), None)
        );
        assert_eq!(
            merge_message("\n  Merge x  \nfirst\n\nsecond\n# note\n"),
            (
                Some("Merge x".to_string()),
                Some("first\n\nsecond".to_string())
            )
        );
        assert_eq!(merge_message("# only a comment\n"), (None, None));
    }

    #[test]
    fn staged_changes_are_read_from_raw_records() {
        let zero = "0".repeat(40);
        let one = "1".repeat(40);
        let raw = format!(
            ":100644 100644 {one} {one} M\0a b.txt\0:000000 100644 {zero} {one} A\0new\0:000000 000000 {zero} {zero} U\0both\0"
        );
        let changes = parse_staged_changes(raw.as_bytes());
        assert_eq!(
            changes
                .iter()
                .map(|change| (change.status, change.path.as_slice()))
                .collect::<Vec<_>>(),
            [
                (b'M', b"a b.txt".as_slice()),
                (b'A', b"new".as_slice()),
                (b'U', b"both".as_slice())
            ]
        );
        assert!(parse_staged_changes(b"").is_empty());
    }

    fn observed(head: &str, parents: &[&str], merge_head: bool, unmerged: bool) -> Observed {
        Observed {
            head: Some(head.to_string()),
            parents: parents.iter().map(|value| value.to_string()).collect(),
            merge_head,
            unmerged,
            index_matches_head: !unmerged,
        }
    }

    #[test]
    fn outcomes_come_from_what_git_left_not_its_exit_status() {
        let done = observed("c", &["a", "m"], false, false);
        assert_eq!(finish_outcome("a", "m", &done, true), Outcome::Done);
        // A post-commit failure still saved the version.
        assert_eq!(finish_outcome("a", "m", &done, false), Outcome::Done);
        let paused = observed("a", &["p"], true, false);
        assert_eq!(finish_outcome("a", "m", &paused, false), Outcome::Unchanged);
        // Git said yes, but nothing moved: never taken as success.
        assert_eq!(finish_outcome("a", "m", &paused, true), Outcome::Uncertain);
        let one_parent = observed("c", &["a"], false, false);
        assert_eq!(
            finish_outcome("a", "m", &one_parent, true),
            Outcome::Uncertain
        );
        assert_eq!(
            finish_outcome("a", "m", &Observed::default(), false),
            Outcome::Uncertain
        );

        let mut back = observed("a", &["p"], false, false);
        assert_eq!(
            abort_outcome("a", Restoration::BestEffort, &back, true, false),
            Outcome::Done
        );
        back.index_matches_head = false;
        assert_eq!(
            abort_outcome("a", Restoration::BestEffort, &back, true, false),
            Outcome::Done
        );
        assert_eq!(
            abort_outcome("a", Restoration::Exact, &back, true, false),
            Outcome::Uncertain
        );
        assert_eq!(
            abort_outcome("a", Restoration::Exact, &paused, false, true),
            Outcome::Unchanged
        );
        assert_eq!(
            abort_outcome("a", Restoration::Exact, &paused, false, false),
            Outcome::Uncertain
        );
    }
}
