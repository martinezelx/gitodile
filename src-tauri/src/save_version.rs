use crate::application::{self, in_parallel};
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{checked_git_stdout, git_stdout, run_git, run_git_with_env};
#[cfg(test)]
use crate::index::selection_index_path;
use crate::index::{index_unavailable_error, prepare_index, PreparedIndex};
use crate::operation::{truncate_detail, OperationKind};
use crate::repository::{
    classify_head, display_path, git_operation_in_progress, normalized_path, read_head_commit,
    HeadState,
};
use crate::status::{
    read_working_tree_status_without_line_totals, ChangeCategory, WorkingTreeCounts,
    WorkingTreeEntry, WorkingTreeStatus,
};
use std::{
    fs::{File, OpenOptions},
    io::{self, Read},
    path::{Path, PathBuf},
    process::Output,
    sync::atomic::{AtomicU64, Ordering},
};

// ---- Save version planning (task 010) ----
//
// This is the read-only preview half of the save-version flow. It never
// mutates the repository; `save_version` (execution) is a separate, narrower
// command so the risky, history-mutating code path stays small and auditable
// on its own.

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveVersionPlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) summary: String,
    pub(crate) steps: Vec<String>,
    pub(crate) risks: Vec<String>,
    pub(crate) recovery: String,
    pub(crate) requires_confirmation: bool,
    /// Opaque fingerprint of everything that would change the outcome of a
    /// save. Execution must refuse to proceed if a freshly computed token no
    /// longer matches this one.
    pub(crate) state_token: String,
    pub(crate) branch: Option<String>,
    pub(crate) is_first_version: bool,
    pub(crate) total_files: usize,
    pub(crate) remaining_files: usize,
    pub(crate) is_partial: bool,
    pub(crate) has_prepared_changes: bool,
    pub(crate) counts: WorkingTreeCounts,
    /// The files this version takes, for the dialog's "Show files": the first
    /// `SAVE_PLAN_FILE_LIMIT` of them, in the order Changes lists them. The
    /// count above is always the whole of it; the dialog says how many more
    /// there are rather than carry an unbounded list across the bridge.
    pub(crate) files: Vec<SaveVersionFile>,
}

/// One file of a plan: where it is, where it came from if it was renamed, and
/// what happened to it. The index details stay behind in `WorkingTreeEntry`.
#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveVersionFile {
    pub(crate) path: String,
    pub(crate) original_path: Option<String>,
    pub(crate) category: ChangeCategory,
}

/// A dialog's list, not the Changes screen: enough to recognise the change,
/// small enough to draw without virtualising.
pub(crate) const SAVE_PLAN_FILE_LIMIT: usize = 50;

/// Same env-override pattern as `write_global_git_config`: production always
/// passes `None` (the user's real global config); tests point `GIT_CONFIG_GLOBAL`
/// at a temporary file so they never depend on, or mutate, the machine's real
/// Git identity.
fn run_git_with_global_override(
    repo_path: &str,
    args: &[&str],
    config_override: Option<&str>,
) -> Result<Output, AppError> {
    let envs = config_override
        .map(|global| vec![("GIT_CONFIG_GLOBAL", global)])
        .unwrap_or_default();
    run_git_with_env(repo_path, args, &envs)
}

/// Checks the *effective* identity (local config overriding global, exactly
/// like `git commit` resolves it), not just the global identity `get_git_identity`
/// exposes in Settings. A single `--get-regexp` call resolves both keys at
/// once — same effective-value precedence as two separate `--get` calls,
/// one fewer Git process on a path that runs on every plan and save.
pub(crate) fn identity_configured(
    path: &str,
    config_override: Option<&str>,
) -> Result<bool, AppError> {
    let output = run_git_with_global_override(
        path,
        &["config", "--get-regexp", "^user\\.(name|email)$"],
        config_override,
    )?;
    if !output.status.success() {
        // A nonzero exit means no matching keys at all (git's convention for
        // `--get`/`--get-regexp` when nothing matches), not a real failure.
        return Ok(false);
    }

    let mut has_name = false;
    let mut has_email = false;
    for line in git_stdout(&output).lines() {
        let Some((key, value)) = line.split_once(' ') else {
            continue;
        };
        if value.trim().is_empty() {
            continue;
        }
        match key {
            "user.name" => has_name = true,
            "user.email" => has_email = true,
            _ => {}
        }
    }
    Ok(has_name && has_email)
}

/// A compact fingerprint of everything that would change the outcome of a
/// save between preview and execution. Counts are folded in alongside the
/// (possibly capped) entry list, so drift beyond the reported-entries cap on
/// a very large changeset still invalidates the token. This only needs to
/// detect drift, not to be reversible or collision-proof, so a non-cryptographic
/// hash of a deterministic string is enough — no extra crate required.
fn compute_state_token(
    head: Option<&str>,
    branch: Option<&str>,
    tree: &str,
    selected_paths: Option<&[String]>,
) -> String {
    use std::hash::{Hash, Hasher};

    let mut fingerprint = format!(
        "head:{}|branch:{}|tree:{}|selection:{}|",
        head.unwrap_or("unborn"),
        branch.unwrap_or("detached"),
        tree,
        if selected_paths.is_some() {
            "partial"
        } else {
            "all"
        },
    );
    if let Some(paths) = selected_paths {
        for path in paths {
            fingerprint.push_str(path);
            fingerprint.push('\0');
        }
    }

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    fingerprint.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn counts_for_entries(entries: &[WorkingTreeEntry]) -> WorkingTreeCounts {
    let mut counts = WorkingTreeCounts::default();
    for entry in entries {
        match entry.category {
            ChangeCategory::Changed => counts.changed += 1,
            ChangeCategory::New => counts.new_files += 1,
            ChangeCategory::Deleted => counts.deleted += 1,
            ChangeCategory::Renamed => counts.renamed += 1,
            ChangeCategory::Conflicted => counts.conflicted += 1,
        }
        counts.total += 1;
    }
    counts
}

struct ResolvedSelection {
    paths: Option<Vec<String>>,
    entries: Option<Vec<WorkingTreeEntry>>,
}

fn resolve_selection(
    status: &WorkingTreeStatus,
    selected_paths: Option<Vec<String>>,
) -> Result<ResolvedSelection, AppError> {
    let Some(mut paths) = selected_paths else {
        return Ok(ResolvedSelection {
            paths: None,
            entries: None,
        });
    };
    paths.sort();
    paths.dedup();
    if paths.is_empty() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "Choose at least one file to save.",
        ));
    }

    let mut entries = Vec::with_capacity(paths.len());
    for selected in &paths {
        let Some(entry) = status.entries.iter().find(|entry| entry.path == *selected) else {
            return Err(AppError::new(
                AppErrorCode::StalePreview,
                "The selected files changed since they were shown.",
            )
            .with_remediation("Refresh the changes and choose the files again."));
        };
        entries.push(entry.clone());
    }
    Ok(ResolvedSelection {
        paths: Some(paths),
        entries: Some(entries),
    })
}

/// Everything a fresh plan/execution pass needs, plus the live temporary
/// index (`prepared`) that produced its tree hash. Both `plan_save_version`
/// and `save_version` call `validate_and_prepare_save` exactly once each —
/// they used to run this whole sequence independently (execution re-checked
/// every blocker *and* rebuilt a second temporary index from scratch after
/// already calling the full planning function once), doubling roughly ten
/// Git process spawns into twenty for a single save. Sharing one function
/// keeps the safety property ("execution revalidates everything fresh
/// immediately before mutating") while only ever doing that validation once
/// per call.
struct ValidatedSave {
    branch: Option<String>,
    is_first_version: bool,
    selected_counts: WorkingTreeCounts,
    remaining_files: usize,
    is_partial: bool,
    has_prepared_changes: bool,
    files: Vec<SaveVersionFile>,
    state_token: String,
    prepared: PreparedIndex,
}

fn validate_and_prepare_save(
    path: &str,
    selected_paths: Option<Vec<String>>,
    identity_override: Option<&str>,
) -> Result<ValidatedSave, AppError> {
    // Four questions that don't depend on one another, asked side by side: on
    // Windows the wait is the process launches, not the reads. Their answers
    // are still checked in the order they always were, so the error a project
    // gets doesn't depend on which process finished first. The status is the
    // one task 007's Changes screen reads, minus the diff's line totals (a
    // plan needs the counts and the files, not the `+`/`-` numbers), so both
    // surfaces still agree about what "current changes" means.
    let (status, (operation, (head, identity))) = in_parallel(
        || read_working_tree_status_without_line_totals(path.to_string()),
        || {
            in_parallel(
                || git_operation_in_progress(path),
                || {
                    in_parallel(
                        || read_head_commit(path),
                        || identity_configured(path, identity_override),
                    )
                },
            )
        },
    );
    let status = status?;

    if let Some(operation) = operation? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation(
            "Finish or abort that operation in Git, then try saving a version again.",
        ));
    }

    let branch = status.upstream.branch.clone();
    let head = head?;
    let head_state = classify_head(branch.is_some(), head.is_some());
    if head_state == HeadState::Detached {
        return Err(AppError::new(
            AppErrorCode::DetachedHead,
            "This project isn't on a branch right now.",
        )
        .with_remediation("Switch to a branch before saving a version."));
    }

    if status.counts.conflicted > 0 {
        return Err(AppError::new(
            AppErrorCode::UnresolvedConflicts,
            "Some files have overlapping changes that need to be resolved first.",
        )
        .with_remediation("Resolve the overlapping changes, then try saving again."));
    }

    if status.is_clean {
        return Err(AppError::new(
            AppErrorCode::NothingToSave,
            "There's nothing to save right now.",
        )
        .with_remediation("Make some changes, then come back to save a version."));
    }

    if !identity? {
        return Err(AppError::new(
            AppErrorCode::MissingIdentity,
            "GitOdile doesn't know who is saving this version yet.",
        )
        .with_remediation("Add a name and email for Git, then try again."));
    }

    let selection = resolve_selection(&status, selected_paths)?;
    let selected_paths = selection.paths;
    let selected_entries = selection.entries;
    let selected_counts = selected_entries
        .as_deref()
        .map(counts_for_entries)
        .unwrap_or_else(|| status.counts.clone());
    if selected_counts.conflicted > 0 {
        return Err(AppError::new(
            AppErrorCode::UnresolvedConflicts,
            "Some selected files have overlapping changes that need to be resolved first.",
        )
        .with_remediation("Resolve the overlapping changes, then try saving again."));
    }

    let is_first_version = head_state == HeadState::Unborn;
    let prepared = prepare_index(path, &head_state, selected_entries.as_deref())?;
    let state_token = compute_state_token(
        head.as_deref(),
        branch.as_deref(),
        &prepared.tree,
        selected_paths.as_deref(),
    );
    let is_partial = selected_paths.is_some() && selected_counts.total < status.counts.total;
    let remaining_files = status.counts.total.saturating_sub(selected_counts.total);
    let has_prepared_changes = selected_entries
        .as_deref()
        .map(|entries| entries.iter().any(|entry| entry.is_prepared))
        .unwrap_or(status.has_prepared_changes);
    let files = selected_entries
        .as_deref()
        .unwrap_or(&status.entries)
        .iter()
        .take(SAVE_PLAN_FILE_LIMIT)
        .map(|entry| SaveVersionFile {
            path: entry.path.clone(),
            original_path: entry.original_path.clone(),
            category: entry.category,
        })
        .collect();

    Ok(ValidatedSave {
        branch,
        is_first_version,
        selected_counts,
        remaining_files,
        is_partial,
        has_prepared_changes,
        files,
        state_token,
        prepared,
    })
}

pub(crate) fn plan_save_version_selection_with_identity_override(
    path: String,
    selected_paths: Option<Vec<String>>,
    identity_override: Option<&str>,
) -> Result<SaveVersionPlan, AppError> {
    let validated = validate_and_prepare_save(&path, selected_paths, identity_override)?;
    let is_first_version = validated.is_first_version;
    let is_partial = validated.is_partial;

    let summary = if is_first_version {
        if is_partial {
            "This creates the project's first saved version from the selected changes."
        } else {
            "This creates the project's first saved version from every current change."
        }
    } else if is_partial {
        "This saves the selected changes as one new version."
    } else {
        "This saves every current change as one new version."
    }
    .to_string();

    let mut steps = vec![
        if is_partial {
            "Include only the selected changed, new, deleted, renamed, and copied files."
                .to_string()
        } else {
            "Include every changed, new, deleted, renamed, and copied file that isn't ignored."
                .to_string()
        },
        "Create one new saved version with the description you write.".to_string(),
    ];
    if !is_first_version {
        steps.push("Keep the project's earlier saved version reachable for recovery.".to_string());
    }

    let recovery = if is_first_version {
        "This is the first saved version, so there's no earlier version to recover.".to_string()
    } else {
        "The save is additive: the earlier saved version stays reachable through Git's history if you need to go back."
            .to_string()
    };

    Ok(SaveVersionPlan {
        operation_kind: OperationKind::HistoryMutation,
        summary,
        steps,
        risks: vec![
            "This only affects local history; nothing is sent to a remote project.".to_string(),
        ],
        recovery,
        requires_confirmation: true,
        state_token: validated.state_token,
        branch: validated.branch,
        is_first_version,
        total_files: validated.selected_counts.total,
        remaining_files: validated.remaining_files,
        is_partial,
        has_prepared_changes: validated.has_prepared_changes,
        counts: validated.selected_counts,
        files: validated.files,
    })
    // `validated.prepared`'s temporary index is dropped (and its backing
    // file removed) here — the plan only ever needed its tree hash, already
    // folded into `state_token` above.
}

pub(crate) fn plan_save_version(
    path: String,
    selected_paths: Option<Vec<String>>,
) -> Result<SaveVersionPlan, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "plan_save_version", None)?;
    plan_save_version_selection_with_identity_override(path, selected_paths, None)
}

/// Mirrors `plan_save_version`, including its authorization, so a test cannot
/// pass through a boundary the production entry point enforces. Only the
/// identity source differs, which is the point of the override.
#[cfg(test)]
pub(crate) fn plan_save_version_with_identity_override(
    path: String,
    identity_override: Option<&str>,
) -> Result<SaveVersionPlan, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "plan_save_version", None)?;
    plan_save_version_selection_with_identity_override(path, None, identity_override)
}

// ---- Save version execution (task 010) ----

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveVersionResult {
    pub(crate) commit: String,
    pub(crate) short_commit: String,
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) branch: Option<String>,
    pub(crate) saved_files: usize,
}

/// Resolves the *effective* index file for `path`, which may be a linked
/// worktree's own index rather than `.git/index`. `--git-path` already
/// accounts for that; it just doesn't guarantee an absolute result, so the
/// raw value is resolved relative to `path` the same way `open_repository`
/// resolves `--absolute-git-dir`'s output.
pub(crate) fn resolve_index_path(path: &str) -> Result<PathBuf, AppError> {
    let raw = checked_git_stdout(run_git(path, &["rev-parse", "--git-path", "index"])?)?;
    Ok(normalized_path(Path::new(path), &raw))
}

/// Holds what's needed to put the repository's index back exactly as it was,
/// including the case where no index file existed yet (a fresh, never-staged
/// repository) — restoring then means removing whatever `git add` created,
/// not overwriting it with empty content.
pub(crate) struct IndexBackup {
    pub(crate) index_path: PathBuf,
    pub(crate) backup_path: Option<PathBuf>,
}

const MAX_BACKUP_PATH_ATTEMPTS: usize = 128;

/// Produces a candidate name, not proof that the path is free. The caller must
/// reserve it with `create_new`: a stale file, PID reuse or another process can
/// still make any generated name collide.
fn backup_path_candidate() -> PathBuf {
    static BACKUP_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let sequence = BACKUP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let mut backup_path = std::env::temp_dir();
    backup_path.push(format!(
        "gitodile-index-backup-{}-{nanos}-{sequence}.bak",
        std::process::id(),
    ));
    backup_path
}

/// Copies `source` into a path this call reserved atomically. `create_new`
/// refuses existing files and symlinks instead of truncating them, which is the
/// safety boundary: generated names only reduce retries; they do not authorize
/// overwriting a recovery copy.
fn copy_to_exclusive_backup(
    source: &mut impl Read,
    mut next_candidate: impl FnMut() -> PathBuf,
) -> Result<PathBuf, AppError> {
    for _ in 0..MAX_BACKUP_PATH_ATTEMPTS {
        let backup_path = next_candidate();
        let mut backup_file = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&backup_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(index_unavailable_error().with_detail(error.to_string()));
            }
        };

        if let Err(error) = io::copy(source, &mut backup_file) {
            drop(backup_file);
            let _ = std::fs::remove_file(&backup_path);
            return Err(index_unavailable_error().with_detail(error.to_string()));
        }
        return Ok(backup_path);
    }

    Err(index_unavailable_error().with_detail(
        "GitOdile couldn't reserve a unique temporary index backup after repeated attempts.",
    ))
}

fn backup_index_with_candidates(
    index_path: &Path,
    next_candidate: impl FnMut() -> PathBuf,
) -> Result<IndexBackup, AppError> {
    let mut source = match File::open(index_path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(IndexBackup {
                index_path: index_path.to_path_buf(),
                backup_path: None,
            });
        }
        Err(error) => {
            return Err(index_unavailable_error().with_detail(error.to_string()));
        }
    };
    let backup_path = copy_to_exclusive_backup(&mut source, next_candidate)?;
    Ok(IndexBackup {
        index_path: index_path.to_path_buf(),
        backup_path: Some(backup_path),
    })
}

fn backup_index(index_path: &Path) -> Result<IndexBackup, AppError> {
    backup_index_with_candidates(index_path, backup_path_candidate)
}

/// Restores the index to its pre-save state. Errors here are reported but
/// deliberately not layered onto an already-in-flight failure: callers treat
/// this as best-effort cleanup after the primary error has been decided.
fn restore_index(backup: &IndexBackup) -> Result<(), AppError> {
    match &backup.backup_path {
        Some(backup_path) => {
            std::fs::copy(backup_path, &backup.index_path)
                .map_err(|_| index_unavailable_error())?;
            let _ = std::fs::remove_file(backup_path);
        }
        None => {
            let _ = std::fs::remove_file(&backup.index_path);
        }
    }
    Ok(())
}

fn cleanup_backup(backup: &IndexBackup) {
    if let Some(backup_path) = &backup.backup_path {
        let _ = std::fs::remove_file(backup_path);
    }
}

pub(crate) fn restore_or_report(backup: &IndexBackup, primary: AppError) -> AppError {
    match restore_index(backup) {
        Ok(()) => primary,
        Err(_) => AppError::new(
            AppErrorCode::IndexRestoreFailed,
            "GitOdile couldn't restore the project's prepared changes after the save failed.",
        )
        .with_remediation(
            "Your working files are still there. Keep the project open and review Git's prepared changes before trying again.",
        )
        .with_detail(
            backup
                .backup_path
                .as_ref()
                .map(|path| {
                    format!(
                        "The original index backup was kept at {}.",
                        display_path(path.clone())
                    )
                })
                .unwrap_or_else(|| {
                    "The project did not have an index before this save attempt.".to_string()
                }),
        ),
    }
}

fn stderr_text(output: &Output) -> String {
    String::from_utf8_lossy(&output.stderr).to_string()
}

/// A hook's presence doesn't guarantee it fired, and a missing one doesn't
/// rule out a server-side equivalent — this is a best-effort classification
/// hint, not a guarantee. Git gives no structured signal for "a hook
/// rejected this commit" versus any other nonzero exit.
fn hook_exists(path: &str) -> bool {
    let Ok(output) = run_git(path, &["rev-parse", "--absolute-git-dir"]) else {
        return false;
    };
    let Ok(git_dir_raw) = checked_git_stdout(output) else {
        return false;
    };
    let hooks_dir = Path::new(&git_dir_raw).join("hooks");
    ["pre-commit", "prepare-commit-msg", "commit-msg"]
        .iter()
        .any(|name| hooks_dir.join(name).is_file())
}

/// Best-effort classification of a failed `git commit`. Git does not expose a
/// structured reason for a nonzero exit, so this pattern-matches known GPG/SSH
/// signing failure text before falling back to "a hook rejected this" (when a
/// hook is actually present) and finally a generic failure. The raw stderr
/// always rides along as `detail`, never as the primary `message`.
pub(crate) fn classify_commit_failure(path: &str, stderr: &str, run_hooks: bool) -> AppError {
    let lowered = stderr.to_lowercase();
    let looks_like_signing_failure = lowered.contains("gpg failed to sign")
        || lowered.contains("unable to sign")
        || (lowered.contains("sign") && lowered.contains("fail"));

    if looks_like_signing_failure {
        return AppError::new(
            AppErrorCode::SigningFailed,
            "Git couldn't sign this version.",
        )
        .with_remediation("Check your Git commit-signing setup (GPG or SSH key), then try again.")
        .with_detail(truncate_detail(stderr));
    }

    // With hooks turned off GitOdile passed `--no-verify`, so no local hook
    // ran and none of them can be what rejected this — saying otherwise would
    // send the user to read the output of a hook that never fired.
    if run_hooks && hook_exists(path) {
        return AppError::new(
            AppErrorCode::HookRejected,
            "A Git hook rejected this version.",
        )
        .with_remediation("Check the hook's output, address what it's flagging, then try again.")
        .with_detail(truncate_detail(stderr));
    }

    AppError::new(
        AppErrorCode::GitCommandFailed,
        "Git couldn't save this version.",
    )
    .with_remediation("Check the project's Git configuration and try again.")
    .with_detail(truncate_detail(stderr))
}

pub(crate) fn save_version_selection_with_identity_override(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    selected_paths: Option<Vec<String>>,
    run_hooks: bool,
    identity_override: Option<&str>,
) -> Result<SaveVersionResult, AppError> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err(AppError::new(
            AppErrorCode::EmptyTitle,
            "Write a short name before saving.",
        ));
    }
    if trimmed_title.contains(['\r', '\n']) {
        return Err(AppError::new(
            AppErrorCode::InvalidTitle,
            "Keep the version name on one line.",
        ));
    }
    // `None`/empty/whitespace-only all collapse to "no details" — the caller
    // (an optional textarea) can produce any of the three, and none of them
    // should append an empty trailing paragraph to the commit message.
    let trimmed_description = description
        .as_deref()
        .map(str::trim)
        .filter(|text| !text.is_empty());
    let commit_message = match trimmed_description {
        Some(details) => format!("{trimmed_title}\n\n{details}"),
        None => trimmed_title.to_string(),
    };

    // Revalidates every planning blocker (clean tree, conflicts, detached
    // HEAD, an operation in progress, missing identity) against the
    // *current* repository, so execution can never proceed on a state
    // preview already rejected. Comparing `state_token` on top of that
    // catches drift the blockers alone wouldn't (e.g. the same files
    // changed again). This used to happen twice — once via a full call to
    // the planning function, then again independently to get a fresh
    // temporary index to actually use — doubling roughly ten Git process
    // spawns into twenty. One call now does both jobs.
    let validated = validate_and_prepare_save(&path, selected_paths, identity_override)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StalePreview,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Review the updated changes, then try saving again."));
    }

    let index_path = resolve_index_path(&path)?;
    let backup = backup_index(&index_path)?;

    if let Err(error) = std::fs::copy(&validated.prepared.path, &index_path) {
        let primary = index_unavailable_error().with_detail(error.to_string());
        return Err(restore_or_report(&backup, primary));
    }

    let commit_env = identity_override
        .map(|global| vec![("GIT_CONFIG_GLOBAL", global)])
        .unwrap_or_default();
    // `--no-verify` is added rather than the project's hooks being disabled:
    // the choice is GitOdile's to make for its own commits, and writing
    // `core.hooksPath` would change what every other Git tool on the machine
    // does with this repository.
    let mut commit_args = vec!["commit"];
    if !run_hooks {
        commit_args.push("--no-verify");
    }
    commit_args.extend(["-m", commit_message.as_str()]);
    let commit_output = match run_git_with_env(&path, commit_args, &commit_env) {
        Ok(output) => output,
        Err(error) => return Err(restore_or_report(&backup, error)),
    };

    if !commit_output.status.success() {
        let primary = classify_commit_failure(&path, &stderr_text(&commit_output), run_hooks);
        return Err(restore_or_report(&backup, primary));
    }

    cleanup_backup(&backup);

    let full_commit = match run_git(&path, &["rev-parse", "HEAD"]) {
        Ok(output) if output.status.success() => git_stdout(&output),
        _ => {
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "The version was saved, but GitOdile couldn't read its identifier.",
            )
            .with_remediation("Refresh the project to see the saved version."));
        }
    };
    let short_commit = match run_git(&path, &["rev-parse", "--short", "HEAD"]) {
        Ok(output) if output.status.success() => git_stdout(&output),
        _ => full_commit.chars().take(7).collect(),
    };

    Ok(SaveVersionResult {
        commit: full_commit,
        short_commit,
        title: trimmed_title.to_string(),
        description: trimmed_description.map(str::to_string),
        branch: validated.branch,
        saved_files: validated.selected_counts.total,
    })
}

#[cfg(test)]
pub(crate) fn save_version_with_identity_override(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    identity_override: Option<&str>,
) -> Result<SaveVersionResult, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "save_version", None)?;
    save_version_selection_with_identity_override(
        path,
        title,
        description,
        state_token,
        None,
        true,
        identity_override,
    )
}

pub(crate) fn save_version(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    selected_paths: Option<Vec<String>>,
    run_hooks: bool,
) -> Result<SaveVersionResult, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "save_version", None)?;
    save_version_selection_with_identity_override(
        path,
        title,
        description,
        state_token,
        selected_paths,
        run_hooks,
        None,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;
    use std::io::Cursor;
    use std::sync::{Arc, Barrier};
    use std::thread;

    fn test_path(label: &str) -> PathBuf {
        static TEST_SEQUENCE: AtomicU64 = AtomicU64::new(0);
        crate::test_support::test_temp_root().join(format!(
            "gitodile-test-{label}-{}-{}",
            std::process::id(),
            TEST_SEQUENCE.fetch_add(1, Ordering::Relaxed),
        ))
    }

    #[test]
    fn concurrent_saves_never_share_a_temporary_index_path() {
        // Regression: the path was pid + `SystemTime` nanos only. Windows'
        // ~15 ms clock granularity made every call inside one tick produce the
        // same name, so a second save failed with `IndexUnavailable` because
        // Git's `index.lock` already existed. Threads here stand in for two
        // projects saving at once; the assertion is on uniqueness, not timing,
        // so it fails deterministically if the counter is removed.
        let handles: Vec<_> = (0..8)
            .map(|_| thread::spawn(|| (0..64).map(|_| selection_index_path()).collect::<Vec<_>>()))
            .collect();
        let paths: Vec<PathBuf> = handles
            .into_iter()
            .flat_map(|handle| handle.join().unwrap())
            .collect();

        let unique: BTreeSet<&PathBuf> = paths.iter().collect();
        assert_eq!(unique.len(), paths.len(), "temporary index paths collided");
    }

    #[test]
    fn concurrent_index_backups_keep_each_projects_original_bytes() {
        const THREADS: usize = 8;
        let barrier = Arc::new(Barrier::new(THREADS));
        let handles = (0..THREADS)
            .map(|index| {
                let barrier = Arc::clone(&barrier);
                thread::spawn(move || {
                    let index_path = test_path(&format!("index-backup-source-{index}"));
                    let expected = format!("project-{index}-original-index").into_bytes();
                    std::fs::write(&index_path, &expected).expect("write source index");
                    barrier.wait();
                    let backup = backup_index(&index_path).expect("back up index");
                    (
                        index_path,
                        backup.backup_path.expect("existing index has backup"),
                        expected,
                    )
                })
            })
            .collect::<Vec<_>>();

        let results = handles
            .into_iter()
            .map(|handle| handle.join().expect("backup thread"))
            .collect::<Vec<_>>();
        let unique = results
            .iter()
            .map(|(_, backup_path, _)| backup_path)
            .collect::<BTreeSet<_>>();
        assert_eq!(unique.len(), THREADS, "concurrent backups shared a path");

        for (index_path, backup_path, expected) in results {
            assert_eq!(
                std::fs::read(&backup_path).expect("read backup"),
                expected,
                "backup must contain its own project's index",
            );
            let _ = std::fs::remove_file(index_path);
            let _ = std::fs::remove_file(backup_path);
        }
    }

    #[test]
    fn an_existing_backup_candidate_is_never_overwritten() {
        let index_path = test_path("index-backup-collision-source");
        let occupied = test_path("index-backup-collision-occupied");
        let available = test_path("index-backup-collision-available");
        std::fs::write(&index_path, b"original index").expect("write source index");
        std::fs::write(&occupied, b"existing recovery data").expect("write occupied candidate");

        let mut candidates = [occupied.clone(), available.clone()].into_iter();
        let backup = backup_index_with_candidates(&index_path, || {
            candidates.next().expect("candidate retry budget")
        })
        .expect("reserve second candidate");

        assert_eq!(backup.backup_path.as_deref(), Some(available.as_path()));
        assert_eq!(
            std::fs::read(&occupied).expect("read occupied candidate"),
            b"existing recovery data",
            "an existing recovery copy must never be truncated",
        );
        assert_eq!(
            std::fs::read(&available).expect("read selected backup"),
            b"original index",
        );
        let _ = std::fs::remove_file(index_path);
        let _ = std::fs::remove_file(occupied);
        let _ = std::fs::remove_file(available);
    }

    struct FailingReader {
        first: Cursor<&'static [u8]>,
        failed: bool,
    }

    impl Read for FailingReader {
        fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
            if self.failed {
                return Err(io::Error::other("injected backup copy failure"));
            }
            let read = self.first.read(buffer)?;
            self.failed = true;
            Ok(read)
        }
    }

    #[test]
    fn a_failed_backup_copy_removes_only_its_incomplete_file() {
        let candidate = test_path("index-backup-incomplete");
        let unrelated = test_path("index-backup-unrelated");
        std::fs::write(&unrelated, b"keep me").expect("write unrelated file");
        let mut reader = FailingReader {
            first: Cursor::new(b"partial bytes"),
            failed: false,
        };

        let error = copy_to_exclusive_backup(&mut reader, || candidate.clone())
            .expect_err("copy failure must be reported");

        assert_eq!(error.code, AppErrorCode::IndexUnavailable);
        assert!(
            !candidate.exists(),
            "incomplete reserved backup must be removed"
        );
        assert_eq!(
            std::fs::read(&unrelated).expect("read unrelated file"),
            b"keep me",
            "cleanup must not remove any other path",
        );
        let _ = std::fs::remove_file(unrelated);
    }
}
