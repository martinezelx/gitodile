use crate::application;
use crate::application::in_parallel;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{
    checked_git_stdout, git_stdout, run_git, run_git_capped, run_git_with_input_capped,
};
use crate::index::prepare_index;
use crate::operation::{truncate_detail, OperationKind};
use crate::recovery::{
    create_history_recovery_for, plan_history_recovery_for, verify_history_recovery,
    HistoryRecoveryMetadata, HistoryRecoveryOperation, HistoryRecoveryPreview,
    MAX_CLEAN_UP_RECOVERY_RECORDS,
};
use crate::repository::{
    display_path, git_operation_in_progress, resolve_head_state, validate_branch_ref_name,
    HeadState,
};
use crate::repository_access::RepositoryContext;
use crate::status::{read_working_tree_status, ChangeCategory, WorkingTreeStatus};
use crate::tooling::parse_git_version;
use std::{path::PathBuf, process::Output};

// ---- Branches (task 016) ----
//
// "Branch" is simple-mode wording for a local Git branch. This section
// owns discovery (read-only) and the create/switch/delete plan-then-execute
// contracts. Every mutation here requires `git switch` support (Git >= 2.23,
// see `require_git_switch_support`) — this is the first Git-version floor
// enforced anywhere in the app; task 002 deliberately left minimum-version
// enforcement out of scope, so the check stays local to these commands
// instead of a global gate.

/// Safety cap on how many local branches a single discovery call reports in
/// full. Chosen to comfortably cover ordinary projects while keeping the
/// per-branch reachability/uniqueness queries below bounded; counts stay
/// exact even when the list itself is truncated.
pub(crate) const BRANCH_LIST_CAP: usize = 300;

pub(crate) fn git_version_at_least(version: &str, minimum: (u32, u32, u32)) -> bool {
    let mut parts = version
        .split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty());
    let major: u32 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let minor: u32 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    let patch: u32 = parts.next().and_then(|part| part.parse().ok()).unwrap_or(0);
    (major, minor, patch) >= minimum
}

pub(crate) fn git_supports_switch(path: &str) -> Result<bool, AppError> {
    let output = run_git(path, &["--version"])?;
    if !output.status.success() {
        return Ok(false);
    }
    Ok(git_version_at_least(
        &parse_git_version(&git_stdout(&output)),
        (2, 23, 0),
    ))
}

/// Gate shared by create/switch/delete. Discovery (`get_branches`) never
/// calls this — read-only listing stays available regardless of Git version.
pub(crate) fn require_git_switch_support(path: &str) -> Result<(), AppError> {
    if git_supports_switch(path)? {
        Ok(())
    } else {
        Err(AppError::new(
            AppErrorCode::GitVersionTooOld,
            "This version of Git is too old for GitOdile to change branches safely.",
        )
        .with_remediation("Update Git to version 2.23 or newer, then try again."))
    }
}

pub(crate) struct WorktreeEntry {
    pub(crate) path: String,
    pub(crate) branch: Option<String>,
}

/// Parses `git worktree list --porcelain`: repeated blocks of `key value`
/// lines separated by a blank line, one block per worktree (the main one
/// first). A block with no `branch` line is detached there, which is simply
/// reported as no occupied branch for that worktree.
pub(crate) fn parse_worktree_list_porcelain(text: &str) -> Vec<WorktreeEntry> {
    let mut entries = Vec::new();
    let mut current_path: Option<String> = None;
    let mut current_branch: Option<String> = None;
    for line in text.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            if let Some(path) = current_path.take() {
                entries.push(WorktreeEntry {
                    path,
                    branch: current_branch.take(),
                });
            }
            current_path = Some(path.to_string());
        } else if let Some(branch_ref) = line.strip_prefix("branch ") {
            current_branch = branch_ref.strip_prefix("refs/heads/").map(str::to_string);
        } else if line.is_empty() {
            if let Some(path) = current_path.take() {
                entries.push(WorktreeEntry {
                    path,
                    branch: current_branch.take(),
                });
            }
        }
    }
    if let Some(path) = current_path.take() {
        entries.push(WorktreeEntry {
            path,
            branch: current_branch.take(),
        });
    }
    entries
}

pub(crate) fn list_worktrees(path: &str) -> Result<Vec<WorktreeEntry>, AppError> {
    let output = checked_git_stdout(run_git(path, &["worktree", "list", "--porcelain"])?)?;
    Ok(parse_worktree_list_porcelain(&output))
}

/// Local branch names that this app can represent exactly. See
/// `parse_branch_refs` for why unrepresentable names are skipped rather
/// than lossily converted.
pub(crate) fn list_branch_names(path: &str) -> Result<Vec<String>, AppError> {
    let output = run_git(
        path,
        &["for-each-ref", "--format=%(refname:short)%00", "refs/heads"],
    )?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect this project's branch names.",
        )
        .with_remediation("Check that the project's Git references are readable."));
    }
    Ok(output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty() && *field != b"\n" && *field != b"\r\n")
        .filter_map(|field| {
            let field = field.strip_prefix(b"\n").unwrap_or(field);
            let field = field.strip_suffix(b"\r").unwrap_or(field);
            // Skipping an unrepresentable name is safe for every caller here:
            // this list exists to reject an exact or case-only duplicate of a
            // *new* name, and a new name is always valid UTF-8, so it can
            // never collide with bytes that are not.
            std::str::from_utf8(field).ok().map(str::to_string)
        })
        .collect())
}

/// Refs (local branches or remote-tracking refs) other than `name` itself
/// whose history already contains `tip` — the "is this work retained
/// elsewhere" proof required before any deletion, and the same signal used
/// to flag a branch as safely retained in discovery.
pub(crate) fn retaining_refs(path: &str, name: &str, tip: &str) -> Result<Vec<String>, AppError> {
    let own_ref = format!("refs/heads/{name}");
    let output = run_git(
        path,
        &[
            "for-each-ref",
            "--contains",
            tip,
            "--format=%(refname)",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    Ok(git_stdout(&output)
        .lines()
        .filter(|branch| *branch != own_ref)
        .map(str::to_string)
        .collect())
}

/// The branches a remote calls its default, read from `refs/remotes/<remote>/HEAD`.
///
/// This is the only signal for it that is both cheap and true: `init.defaultBranch`
/// is a *global* preference for repositories yet to be created, and a name like
/// `main` or `master` is a guess. A project with no remote — or one whose remote
/// HEAD was never fetched — simply has no default branch, and nothing is protected
/// on the strength of a guess.
pub(crate) fn default_branch_names(path: &str) -> Result<Vec<String>, AppError> {
    Ok(default_branch_refs(path)?
        .into_iter()
        .map(|(name, _)| name)
        .collect())
}

/// Each remote default branch with the remote-tracking ref that holds it and
/// that ref's commit (`main`, `refs/remotes/origin/main`, `abc…`). The
/// remote's copy is where a merged pull request lands first, before the local
/// branch has been brought up to it.
pub(crate) fn default_branch_refs(path: &str) -> Result<Vec<(String, String)>, AppError> {
    Ok(default_branch_refs_with_commits(path)?
        .into_iter()
        .map(|(name, remote, _)| (name, remote))
        .collect())
}

pub(crate) fn default_branch_refs_with_commits(
    path: &str,
) -> Result<Vec<(String, String, String)>, AppError> {
    let output = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(symref)%00%(objectname)",
            "refs/remotes/*/HEAD",
        ],
    )?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    let mut defaults: Vec<(String, String, String)> = Vec::new();
    for line in git_stdout(&output).lines() {
        let mut fields = line.split('\0');
        let (Some(refname), Some(symref), Some(commit)) =
            (fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        // `refs/remotes/origin/HEAD` minus `HEAD` is the prefix every branch of
        // that remote carries, so stripping it is exact even for a branch whose
        // own name looks like a remote's.
        let Some(prefix) = refname.strip_suffix("HEAD") else {
            continue;
        };
        if let Some(name) = symref.strip_prefix(prefix) {
            if !name.is_empty() && !defaults.iter().any(|(known, _, _)| known == name) {
                defaults.push((name.to_string(), symref.to_string(), commit.to_string()));
            }
        }
    }
    Ok(defaults)
}

/// Refuses a change that would take a remote's default branch out from under the
/// project. Shared by delete and rename, which are the two ways to do it.
pub(crate) fn ensure_not_default_branch(path: &str, name: &str) -> Result<(), AppError> {
    if default_branch_names(path)?
        .iter()
        .any(|known| known == name)
    {
        return Err(default_branch_error(name));
    }
    Ok(())
}

pub(crate) fn add_reaching_ref(references: &mut Vec<String>, reference: &str) {
    if references.iter().any(|existing| existing == reference) {
        return;
    }
    // Inventory only needs to know whether at least one *other* ref reaches a
    // branch tip. Keeping two distinct names is sufficient to answer that for
    // every branch while bounding memory even in repositories with many refs.
    if references.len() < 2 {
        references.push(reference.to_string());
    }
}

/// Computes the refs that can reach every commit in one graph walk. This
/// replaces one `for-each-ref --contains` process per listed branch during
/// discovery; delete planning still asks Git for the exact retained-by list.
///
/// `merge-base --independent` over the ref tips answers the same question
/// and was measured as a replacement: on 30,600 versions and 400 refs it took
/// 0.2 s with a commit-graph but 1.5 s without one, against 0.3 s for this
/// walk either way. The walk stays; discovery runs it beside the inventory
/// instead, since neither needs the other.
pub(crate) fn reaching_refs_by_commit(
    path: &str,
) -> Result<std::collections::HashMap<String, Vec<String>>, AppError> {
    use std::collections::HashMap;

    let refs_output = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(objectname)%00%(refname)%00",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    if !refs_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect which references retain these branches.",
        ));
    }

    let mut reaching: HashMap<String, Vec<String>> = HashMap::new();
    let mut fields = refs_output.stdout.split(|byte| *byte == 0);
    while let Some(commit_bytes) = fields.next() {
        if commit_bytes.is_empty() || commit_bytes == b"\n" || commit_bytes == b"\r\n" {
            continue;
        }
        let commit_bytes = commit_bytes.strip_prefix(b"\n").unwrap_or(commit_bytes);
        let Some(reference_bytes) = fields.next() else {
            break;
        };
        let reference_bytes = reference_bytes
            .strip_suffix(b"\r")
            .unwrap_or(reference_bytes);
        // A ref this app cannot name is dropped rather than failing the walk.
        // That errs toward "we cannot prove this branch is retained elsewhere",
        // which shows the branch as carrying unique work — the cautious
        // answer. Deletion safety does not rest on it either way:
        // `git branch -d` remains the actual enforcement.
        let (Ok(commit), Ok(reference)) = (
            std::str::from_utf8(commit_bytes),
            std::str::from_utf8(reference_bytes),
        ) else {
            continue;
        };
        add_reaching_ref(reaching.entry(commit.to_string()).or_default(), reference);
    }

    let graph = run_git(
        path,
        &[
            "rev-list",
            "--topo-order",
            "--parents",
            "--branches",
            "--remotes",
        ],
    )?;
    if !graph.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect branch reachability.",
        ));
    }
    let graph_text = std::str::from_utf8(&graph.stdout).map_err(|_| {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git returned commit identifiers that couldn't be represented safely.",
        )
    })?;
    for line in graph_text.lines() {
        let mut commits = line.split_ascii_whitespace();
        let Some(commit) = commits.next() else {
            continue;
        };
        let sources = reaching.get(commit).cloned().unwrap_or_default();
        if sources.is_empty() {
            continue;
        }
        for parent in commits {
            let parent_sources = reaching.entry(parent.to_string()).or_default();
            for source in &sources {
                add_reaching_ref(parent_sources, source);
            }
        }
    }
    Ok(reaching)
}

/// A branch whose saved work is on the main branch, and the main-branch ref that
/// holds it, waiting for the proof that the work was its own.
pub(crate) struct FinishCandidate {
    pub(crate) name: String,
    pub(crate) tip: String,
    pub(crate) upstream_gone: bool,
    pub(crate) merged_into: String,
}

/// The reflog subjects Git writes when a version is saved on the branch itself.
fn is_own_work_entry(subject: &str) -> bool {
    subject.starts_with("commit")
        || subject.starts_with("cherry-pick")
        || subject.starts_with("revert")
}

/// Which merged branches are *finished*: their work reached the main branch, and it
/// was work of their own. A branch merely sitting on the main branch — just
/// created, never saved on — is where a reader is about to start, not
/// something to clear away. The proof, cheapest first:
///
/// 1. its remote branch was deleted — a merged pull request, usually;
/// 2. its reflog records a version saved on it, which also covers a branch
///    fast-forwarded into the main branch;
/// 3. its tip is not on the main branch's first-parent history, so it came in
///    through a merge rather than being the main branch itself at some point.
///
/// One process for every branch's reflog, and one first-parent walk per main
/// ref, whatever the number of branches.
pub(crate) fn finished_branches(
    path: &str,
    candidates: &[FinishCandidate],
) -> Result<std::collections::HashSet<String>, AppError> {
    use std::collections::{HashMap, HashSet};

    let mut finished = HashSet::new();
    let mut open: Vec<&FinishCandidate> = Vec::new();
    for candidate in candidates {
        if candidate.upstream_gone {
            finished.insert(candidate.name.clone());
        } else {
            open.push(candidate);
        }
    }

    // Reflogs, in chunks so a long list never outgrows the command line.
    for chunk in open.chunks(100) {
        let refs: Vec<String> = chunk
            .iter()
            .map(|candidate| format!("refs/heads/{}", candidate.name))
            .collect();
        let mut args = vec!["log", "-g", "--format=%gd%x00%gs"];
        args.extend(refs.iter().map(String::as_str));
        args.push("--");
        let output = run_git(path, &args)?;
        // No reflog to read is no evidence, never a failure: the next proof
        // still applies.
        if !output.status.success() {
            continue;
        }
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let Some((selector, subject)) = line.split_once('\0') else {
                continue;
            };
            let Some((name, _)) = selector.rsplit_once("@{") else {
                continue;
            };
            if is_own_work_entry(subject) {
                finished.insert(name.to_string());
            }
        }
    }

    let mut by_base: HashMap<&str, Vec<&FinishCandidate>> = HashMap::new();
    for candidate in open {
        if !finished.contains(&candidate.name) {
            by_base
                .entry(candidate.merged_into.as_str())
                .or_default()
                .push(candidate);
        }
    }
    for (base, waiting) in by_base {
        let output = run_git(path, &["rev-list", "--first-parent", base])?;
        if !output.status.success() {
            continue;
        }
        let first_parent: HashSet<&str> = std::str::from_utf8(&output.stdout)
            .unwrap_or_default()
            .lines()
            .collect();
        for candidate in waiting {
            if !first_parent.contains(candidate.tip.as_str()) {
                finished.insert(candidate.name.clone());
            }
        }
    }
    Ok(finished)
}

/// The main branch's two homes: the local branch, when there is one, and the
/// remote's copy of it.
pub(crate) struct MainBranchRefs {
    pub(crate) name: Option<String>,
    pub(crate) local: Option<String>,
    pub(crate) remote: Option<String>,
    /// The remote's copy holds versions the local branch does not. Only then is
    /// it worth a second count in the inventory's walk: anything merged into
    /// a remote copy the local branch already contains is merged locally too.
    pub(crate) remote_ahead_of_local: bool,
}

pub(crate) fn main_branch_refs(path: &str) -> Result<(Vec<String>, MainBranchRefs), AppError> {
    let defaults = default_branch_refs_with_commits(path)?;
    let names: Vec<String> = defaults.iter().map(|(name, _, _)| name.clone()).collect();
    for (name, remote, remote_commit) in &defaults {
        let local = format!("refs/heads/{name}");
        let Some(local_commit) = rev_parse_commit(path, &["rev-parse", "--verify", &local])? else {
            continue;
        };
        let remote_ahead_of_local = remote_commit != &local_commit
            && !run_git(
                path,
                &["merge-base", "--is-ancestor", remote_commit, &local_commit],
            )?
            .status
            .success();
        return Ok((
            names,
            MainBranchRefs {
                name: Some(name.clone()),
                local: Some(local),
                remote: Some(remote.clone()),
                remote_ahead_of_local,
            },
        ));
    }
    let remote = defaults.first().map(|(_, remote, _)| remote.clone());
    Ok((
        names,
        MainBranchRefs {
            name: None,
            local: None,
            remote_ahead_of_local: remote.is_some(),
            remote,
        },
    ))
}

/// The finished branches among `names`, asked fresh: what a clean-up offers and
/// what it rechecks before it deletes. Branches that no longer exist are simply
/// not finished. One `for-each-ref` over just these branches answers their tips,
/// whether their remote branch is gone and how far each is from the main
/// branch's two homes; Git before 2.41, without `ahead-behind`, asks the last
/// question branch by branch.
pub(crate) fn finished_among(
    path: &str,
    names: &[String],
) -> Result<std::collections::HashSet<String>, AppError> {
    let (_, main) = main_branch_refs(path)?;
    let bases: Vec<&str> = [main.local.as_deref(), main.remote.as_deref()]
        .into_iter()
        .flatten()
        .collect();
    if bases.is_empty() || names.is_empty() {
        return Ok(Default::default());
    }
    let wanted: std::collections::HashSet<String> = names
        .iter()
        .filter(|name| main.name.as_deref() != Some(name.as_str()))
        .map(|name| format!("refs/heads/{name}"))
        .collect();
    if wanted.is_empty() {
        return Ok(Default::default());
    }

    let base_format = "%(refname)%00%(objectname)%00%(upstream)%00%(upstream:track)";
    let atoms: String = bases
        .iter()
        .map(|base| format!("%00%(ahead-behind:{base})"))
        .collect();
    let read = |format: String| -> Result<Output, AppError> {
        let format = format!("--format={format}");
        let mut args = vec!["for-each-ref", format.as_str()];
        args.extend(wanted.iter().map(String::as_str));
        run_git(path, &args)
    };
    let mut batched = true;
    let mut output = read(format!("{base_format}{atoms}"))?;
    if !output.status.success() {
        batched = false;
        output = read(base_format.to_string())?;
        if !output.status.success() {
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "Git couldn't inspect these branches.",
            ));
        }
    }

    let mut candidates = Vec::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let fields: Vec<&str> = line.split('\0').collect();
        let (Some(refname), Some(tip), Some(upstream), Some(track)) =
            (fields.first(), fields.get(1), fields.get(2), fields.get(3))
        else {
            continue;
        };
        // A pattern also matches the refs under it (`a` matches `a/b`): only
        // the branches asked for count.
        if !wanted.contains(*refname) {
            continue;
        }
        let Some(name) = refname.strip_prefix("refs/heads/") else {
            continue;
        };
        let merged_into = bases.iter().enumerate().find_map(|(index, base)| {
            let merged = if batched {
                fields
                    .get(4 + index)
                    .and_then(|counts| counts.split_ascii_whitespace().next())
                    == Some("0")
            } else {
                run_git(path, &["merge-base", "--is-ancestor", tip, base])
                    .is_ok_and(|output| output.status.success())
            };
            merged.then_some(*base)
        });
        let Some(merged_into) = merged_into else {
            continue;
        };
        candidates.push(FinishCandidate {
            name: name.to_string(),
            tip: tip.to_string(),
            upstream_gone: !upstream.is_empty() && parse_upstream_track(track).gone,
            merged_into: merged_into.to_string(),
        });
    }
    finished_branches(path, &candidates)
}

/// Versions reachable from `tip` and not from `base` — the main branch's ref.
pub(crate) fn branch_unique_commit_count(path: &str, base: Option<&str>, tip: &str) -> Option<u32> {
    let base = base?;
    let output = run_git(path, &["rev-list", "--count", &format!("{base}..{tip}")]).ok()?;
    if !output.status.success() {
        return None;
    }
    git_stdout(&output).parse().ok()
}

pub(crate) fn split_nul_list(output: &Output) -> Vec<String> {
    String::from_utf8_lossy(&output.stdout)
        .split('\0')
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
        .collect()
}

/// Cheap, deterministic fingerprint of a typed working-tree status. Reuses
/// the status this command already fetched for its own validation, so
/// building a state token never costs an extra Git process — unlike
/// save-version's `compute_state_token`, which needs a real tree hash because
/// it must detect drift in a *selected subset* of files.
pub(crate) fn status_fingerprint(status: &WorkingTreeStatus) -> String {
    let mut fingerprint = format!("clean:{}|total:{}|", status.is_clean, status.counts.total);
    for entry in &status.entries {
        fingerprint.push_str(&entry.path);
        fingerprint.push(':');
        fingerprint.push_str(match entry.category {
            ChangeCategory::Changed => "c",
            ChangeCategory::New => "n",
            ChangeCategory::Deleted => "d",
            ChangeCategory::Renamed => "r",
            ChangeCategory::Conflicted => "x",
        });
        fingerprint.push(if entry.is_prepared { '1' } else { '0' });
        fingerprint.push('|');
    }
    fingerprint
}

/// Fingerprint used when creating a branch with unsaved/prepared work. The
/// status shape alone cannot detect editing the same already-modified file
/// after preview, so include both the complete worktree tree and the exact
/// staged-content tree. `prepare_index` uses a temporary index and never
/// mutates the user's real one; `write-tree` reads the real index without
/// depending on volatile stat-cache bytes.
pub(crate) fn create_branch_state_fingerprint(
    path: &str,
    head_state: &HeadState,
    status: &WorkingTreeStatus,
) -> Result<String, AppError> {
    let prepared_index = prepare_index(path, head_state, None)?;
    let worktree_tree = &prepared_index.tree;
    let index_tree = checked_git_stdout(run_git(path, &["write-tree"])?)?;
    Ok(format!(
        "{}|worktree-tree:{worktree_tree}|index-tree:{index_tree}",
        status_fingerprint(status),
    ))
}

pub(crate) fn compute_branch_state_token(
    head: Option<&str>,
    branch: Option<&str>,
    status_fingerprint: &str,
    extra: &str,
) -> String {
    use std::hash::{Hash, Hasher};
    let fingerprint = format!(
        "head:{}|branch:{}|status:{status_fingerprint}|extra:{extra}|",
        head.unwrap_or("unborn"),
        branch.unwrap_or("detached"),
    );
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    fingerprint.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BranchTip {
    pub(crate) commit: String,
    pub(crate) short_commit: String,
    pub(crate) subject: String,
    pub(crate) committed_at: String,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Branch {
    pub(crate) name: String,
    pub(crate) tip: BranchTip,
    pub(crate) is_active: bool,
    pub(crate) upstream: Option<String>,
    pub(crate) is_retained_elsewhere: bool,
    /// Its work is on the main branch and was its own (`finished_branches`): what
    /// the list offers to clean up. Kept apart from `is_retained_elsewhere`,
    /// which only says deleting it loses nothing — true of a branch in progress
    /// that is merely published, too.
    pub(crate) is_finished: bool,
    pub(crate) unique_commit_count: Option<u32>,
    pub(crate) worktree_path: Option<String>,
    /// Commits on this branch not yet on `upstream`. `None` when there is no
    /// upstream to compare against; `Some(0)` means fully pushed.
    pub(crate) upstream_ahead: Option<u32>,
    /// Commits on `upstream` not yet on this branch. Same `None`/`Some(0)`
    /// convention as `upstream_ahead`.
    pub(crate) upstream_behind: Option<u32>,
    /// The configured upstream ref was deleted on the remote (Git reports
    /// this as `[gone]`). `ahead`/`behind` are meaningless in this state —
    /// there is nothing left to compare against.
    pub(crate) upstream_gone: bool,
    /// This is a remote's default branch (`refs/remotes/<remote>/HEAD` points at
    /// it). Deleting or renaming it locally is almost never what someone
    /// means, so both are refused and the screen does not offer them.
    pub(crate) is_default: bool,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BranchesSnapshot {
    pub(crate) branch: Option<String>,
    pub(crate) head_state: HeadState,
    pub(crate) current_commit: Option<String>,
    pub(crate) branches: Vec<Branch>,
    pub(crate) total_count: usize,
    pub(crate) is_truncated: bool,
    /// Local branches whose exact bytes this app cannot represent, and which
    /// are therefore absent from `branches`. Surfaced so the screen can say so
    /// instead of quietly showing an incomplete list.
    pub(crate) unreadable_count: usize,
}

#[derive(Debug)]
pub(crate) struct BranchRaw {
    pub(crate) name: String,
    pub(crate) commit: String,
    pub(crate) short_commit: String,
    pub(crate) subject: String,
    pub(crate) committed_at: String,
    pub(crate) upstream: Option<String>,
    /// Raw `%(upstream:track)` text, e.g. `[ahead 2, behind 1]` or `[gone]`.
    /// Empty when there is no upstream, or when the upstream is fully in
    /// sync — those two cases are told apart using `upstream` itself.
    pub(crate) upstream_track: String,
    pub(crate) unique_commit_count: Option<u32>,
    pub(crate) worktree_path: Option<String>,
    /// Versions on this branch not on the remote's copy of the main branch, from
    /// the same walk. `None` without a remote main branch or on the legacy path.
    pub(crate) remote_main_ahead: Option<u32>,
}

/// Parsed form of `%(upstream:track)`.
pub(crate) struct UpstreamTrack {
    pub(crate) ahead: u32,
    pub(crate) behind: u32,
    pub(crate) gone: bool,
}

/// Git has printed this atom as `[ahead N]`, `[behind N]`,
/// `[ahead N, behind M]`, `[gone]`, or empty (no drift, or no upstream —
/// callers that need to tell those two apart check `upstream` separately)
/// since long before this app's minimum supported Git version.
pub(crate) fn parse_upstream_track(raw: &str) -> UpstreamTrack {
    let inner = raw.trim().trim_start_matches('[').trim_end_matches(']');
    if inner == "gone" {
        return UpstreamTrack {
            ahead: 0,
            behind: 0,
            gone: true,
        };
    }
    let mut ahead = 0;
    let mut behind = 0;
    for part in inner.split(',') {
        let part = part.trim();
        if let Some(count) = part.strip_prefix("ahead ") {
            ahead = count.trim().parse().unwrap_or(0);
        } else if let Some(count) = part.strip_prefix("behind ") {
            behind = count.trim().parse().unwrap_or(0);
        }
    }
    UpstreamTrack {
        ahead,
        behind,
        gone: false,
    }
}

/// Parses one `for-each-ref` record per branch, fields separated by the literal
/// NUL bytes `%00` writes into the format string. Machine-readable and
/// version-agnostic — this is the read-only half of the feature and must stay
/// usable regardless of `require_git_switch_support`.
/// Parsed inventory plus the number of records skipped because their bytes
/// are not valid UTF-8.
pub(crate) struct ParsedBranches {
    pub(crate) branches: Vec<BranchRaw>,
    pub(crate) unreadable_count: usize,
}

/// Git ref names are bytes, not text, so a name this app cannot represent is
/// possible. Such a record is skipped and counted, never lossily converted:
/// showing a name peppered with replacement characters would invite the user
/// to act on something that does not exist, and every mutation is keyed by
/// exact name. Skipping one record rather than failing the whole read keeps
/// the other branches usable, which is the same "show what is true, say what is
/// missing" contract `is_truncated` already follows.
pub(crate) fn parse_branch_refs(bytes: &[u8]) -> ParsedBranches {
    let mut branches = Vec::new();
    let mut unreadable_count = 0;
    for branch in bytes.split(|byte| *byte == b'\n') {
        if branch.is_empty() {
            continue;
        }
        let branch = branch.strip_suffix(b"\r").unwrap_or(branch);
        let fields = branch.split(|byte| *byte == 0).collect::<Vec<_>>();
        if fields.len() < 3 {
            continue;
        }
        let decode = |field: &[u8]| -> Option<String> {
            std::str::from_utf8(field).ok().map(str::to_string)
        };
        // The ref name decides whether this record counts as unreadable; a
        // malformed record that is not a local branch at all is simply not ours.
        let Some(refname) = decode(fields[0]) else {
            unreadable_count += 1;
            continue;
        };
        let Some(name) = refname.strip_prefix("refs/heads/") else {
            continue;
        };
        let (Some(commit), Some(short_commit)) = (decode(fields[1]), decode(fields[2])) else {
            unreadable_count += 1;
            continue;
        };
        // Metadata that cannot be represented degrades to empty rather than
        // dropping an otherwise addressable branch: the name is what mutations
        // need, and the subject and date are decoration.
        branches.push(BranchRaw {
            name: name.to_string(),
            commit,
            short_commit,
            subject: fields
                .get(3)
                .and_then(|field| decode(field))
                .unwrap_or_default(),
            committed_at: fields
                .get(4)
                .and_then(|field| decode(field))
                .unwrap_or_default(),
            upstream: fields
                .get(5)
                .and_then(|field| decode(field))
                .filter(|value| !value.trim().is_empty()),
            upstream_track: fields
                .get(6)
                .and_then(|field| decode(field))
                .unwrap_or_default(),
            // Git >= 2.41 can calculate both values inside the inventory's
            // single graph walk. Older versions return only the base seven
            // fields and use the compatibility path in `get_branches`.
            unique_commit_count: fields
                .get(7)
                .and_then(|field| decode(field))
                .and_then(|counts| counts.split_ascii_whitespace().next()?.parse().ok()),
            worktree_path: fields
                .get(8)
                .and_then(|field| decode(field))
                .filter(|value| !value.trim().is_empty()),
            remote_main_ahead: fields
                .get(9)
                .and_then(|field| decode(field))
                .and_then(|counts| counts.split_ascii_whitespace().next()?.parse().ok()),
        });
    }
    ParsedBranches {
        branches,
        unreadable_count,
    }
}

/// `%(upstream:track)` has been available since long before this app's
/// minimum supported Git version (unlike `ahead-behind`/`worktreepath`
/// below), so it lives in the base format and is available on the legacy
/// path too.
pub(crate) const BRANCH_BASE_FORMAT: &str =
    "%(refname)%00%(objectname)%00%(objectname:short)%00%(contents:subject)%00%(committerdate:iso-strict)%00%(upstream:short)%00%(upstream:track)";

/// Git 2.41 added `ahead-behind:<committish>` to `for-each-ref`; together
/// with `worktreepath`, it folds the old one-process-per-branch count and the
/// separate worktree inventory into the branch inventory's existing graph
/// walk. Discovery still supports older Git versions: an unsupported atom
/// makes this first command fail without mutating anything, then the legacy
/// format and helpers provide exactly the previous answer.
///
/// `count_base` is what the ahead count is measured against: the main branch's
/// ref when the project has one, otherwise the current commit — whose counts
/// the caller then discards, keeping the one inventory walk for the worktree
/// paths it also answers. `remote_base`, the remote's copy of the main branch,
/// is counted in the same walk: a merged pull request reaches it first.
pub(crate) fn read_branch_refs(
    path: &str,
    count_base: Option<&str>,
    remote_base: Option<&str>,
) -> Result<(ParsedBranches, bool), AppError> {
    if let Some(base) = count_base {
        let remote_atom = remote_base
            .map(|remote| format!("%00%(ahead-behind:{remote})"))
            .unwrap_or_default();
        let format = format!(
            "--format={BRANCH_BASE_FORMAT}%00%(ahead-behind:{base})%00%(worktreepath){remote_atom}"
        );
        let batched = run_git(
            path,
            &[
                "for-each-ref",
                &format,
                "--sort=-committerdate",
                "refs/heads",
            ],
        )?;
        if batched.status.success() {
            return Ok((parse_branch_refs(&batched.stdout), true));
        }
    }

    let legacy_format = format!("--format={BRANCH_BASE_FORMAT}");
    let legacy = run_git(
        path,
        &[
            "for-each-ref",
            &legacy_format,
            "--sort=-committerdate",
            "refs/heads",
        ],
    )?;
    if !legacy.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect this project's branches.",
        ));
    }
    Ok((parse_branch_refs(&legacy.stdout), false))
}

/// Read-only, local-only branch inventory. Never contacts a remote; any
/// upstream/reachability information reflects only what is already known
/// from local refs, exactly like the rest of the app's "no fresh remote
/// truth" convention for non-network commands.
pub(crate) fn get_branches(path: String) -> Result<BranchesSnapshot, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "get_branches", None)?;
    // Where the project stands and which branch is its main one are
    // independent reads, so they run side by side.
    let ((symbolic_head, verified_head), main_branch) = in_parallel(
        || {
            (
                run_git(&path, &["symbolic-ref", "--quiet", "HEAD"]),
                // One verification answers both questions: whether HEAD exists
                // and which commit it names.
                run_git(&path, &["rev-parse", "--verify", "HEAD"]),
            )
        },
        || main_branch_refs(&path),
    );
    let (symbolic_head, verified_head) = (symbolic_head?, verified_head?);
    let branch = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head))
        .and_then(|reference| reference.strip_prefix("refs/heads/").map(str::to_string));
    let current_commit = verified_head
        .status
        .success()
        .then(|| git_stdout(&verified_head));
    let head_state = match (branch.is_some(), current_commit.is_some()) {
        (true, true) => HeadState::Branch,
        (false, true) => HeadState::Detached,
        (_, false) => HeadState::Unborn,
    };

    // Each branch's own versions are counted against the main branch — the
    // remote's default, held locally — the same branch the detail's route is
    // drawn against, so the two never disagree. Without one there is no
    // count: "not on the active branch" would be a different question with the
    // same words. The remote's copy of it is counted in the same walk, for
    // telling which branches are finished — only when it is ahead of the local
    // branch, since otherwise the local count already answers.
    let (default_names, main) = main_branch?;
    let main_ref = main.local.as_deref();
    let remote_main_ref = main
        .remote_ahead_of_local
        .then_some(main.remote.as_deref())
        .flatten();
    // The inventory and the reachability walk need nothing from each other:
    // the two slowest reads of a refresh run at once.
    let (inventory, reaching_refs) = in_parallel(
        || {
            read_branch_refs(
                &path,
                main_ref.or(current_commit.as_deref()),
                remote_main_ref,
            )
        },
        || reaching_refs_by_commit(&path),
    );
    let (parsed, has_batched_metadata) = inventory?;
    let reaching_refs = reaching_refs?;
    let worktrees = if has_batched_metadata {
        Vec::new()
    } else {
        list_worktrees(&path).unwrap_or_default()
    };
    let unreadable_count = parsed.unreadable_count;
    let mut raw_branches = parsed.branches;
    // Counts only what is actually representable; the skipped records are
    // reported separately rather than being folded into a total the list
    // cannot account for.
    let total_count = raw_branches.len();
    let is_truncated = total_count > BRANCH_LIST_CAP;
    raw_branches.truncate(BRANCH_LIST_CAP);

    let mut unique_counts_by_tip = std::collections::HashMap::new();
    let mut branches = Vec::with_capacity(raw_branches.len());
    let mut candidates = Vec::new();
    for raw in raw_branches {
        let is_active = branch.as_deref() == Some(raw.name.as_str());
        let is_default = default_names.contains(&raw.name);
        let worktree_path = if is_active {
            None
        } else if has_batched_metadata {
            raw.worktree_path
                .as_deref()
                .map(|worktree| display_path(PathBuf::from(worktree)))
        } else {
            worktrees
                .iter()
                .find(|worktree| worktree.branch.as_deref() == Some(raw.name.as_str()))
                .map(|worktree| display_path(PathBuf::from(&worktree.path)))
        };
        let is_main_branch = main.name.as_deref() == Some(raw.name.as_str());
        let unique_commit_count = if main_ref.is_none() || is_main_branch {
            None
        } else if has_batched_metadata {
            raw.unique_commit_count
        } else {
            *unique_counts_by_tip
                .entry(raw.commit.clone())
                .or_insert_with(|| branch_unique_commit_count(&path, main_ref, &raw.commit))
        };
        // Ahead/behind is only meaningful relative to a configured upstream;
        // an empty `upstream_track` on a branch with no upstream must not read
        // as "0 ahead, 0 behind" (fully in sync), which is a different fact.
        let track = raw
            .upstream
            .is_some()
            .then(|| parse_upstream_track(&raw.upstream_track));
        let upstream_gone = track.as_ref().is_some_and(|track| track.gone);
        // Only a branch that could be cleared away is a candidate: not where
        // the project is, not the main branch, not open in another worktree.
        if !is_active && !is_default && worktree_path.is_none() {
            let remote_main_ahead = if has_batched_metadata {
                raw.remote_main_ahead
            } else if unique_commit_count != Some(0) {
                branch_unique_commit_count(&path, remote_main_ref, &raw.commit)
            } else {
                None
            };
            let merged_into = if unique_commit_count == Some(0) {
                main_ref
            } else if remote_main_ahead == Some(0) {
                remote_main_ref
            } else {
                None
            };
            if let Some(merged_into) = merged_into {
                candidates.push(FinishCandidate {
                    name: raw.name.clone(),
                    tip: raw.commit.clone(),
                    upstream_gone,
                    merged_into: merged_into.to_string(),
                });
            }
        }
        branches.push(Branch {
            name: raw.name,
            tip: BranchTip {
                commit: raw.commit,
                short_commit: raw.short_commit,
                subject: raw.subject,
                committed_at: raw.committed_at,
            },
            is_active,
            upstream: raw.upstream,
            is_retained_elsewhere: false,
            is_finished: false,
            unique_commit_count,
            worktree_path,
            upstream_ahead: track.as_ref().map(|track| track.ahead),
            upstream_behind: track.as_ref().map(|track| track.behind),
            upstream_gone,
            is_default,
        });
    }

    let finished = finished_branches(&path, &candidates)?;
    for branch in &mut branches {
        let own_ref = format!("refs/heads/{}", branch.name);
        branch.is_retained_elsewhere = reaching_refs
            .get(&branch.tip.commit)
            .is_some_and(|references| references.iter().any(|reference| reference != &own_ref));
        branch.is_finished = finished.contains(&branch.name);
    }

    Ok(BranchesSnapshot {
        branch,
        head_state,
        current_commit,
        branches,
        total_count,
        is_truncated,
        unreadable_count,
    })
}

// ---- One branch's saved versions (read-only) ----
//
// The inventory above answers "which branches exist" for every branch at once,
// and deliberately stops at each branch's tip: anything deeper would cost one
// Git process per branch on every refresh. This asks the deeper question for
// exactly one branch — the one the user has selected — so the cost is two
// processes per selection rather than two per branch.

/// How many recent versions one call reports. The detail panel shows the tip
/// in full and the ones before it as a list, then hands the rest to History; a
/// longer list here would be paging, which is History's job and not this
/// screen's. Four left that list three rows long under a panel with room for
/// twice that, which is a preview too short to be worth the section.
pub(crate) const BRANCH_HISTORY_LIMIT: usize = 8;

/// `%s` is the subject — the first line of the message by definition — so a
/// record can be newline-delimited with NUL between its fields, the same
/// shape `parse_branch_refs` reads.
const BRANCH_HISTORY_FORMAT: &str = "%H%x00%h%x00%s%x00%an%x00%ae%x00%cI";

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BranchVersion {
    pub(crate) commit: String,
    pub(crate) short_commit: String,
    pub(crate) subject: String,
    pub(crate) author_name: String,
    /// Who saved it, so the strip can tell the user's own versions apart and
    /// key an author's colour on the address rather than the name.
    pub(crate) author_email: String,
    /// ISO 8601 (`%cI`), matching `BranchTip::committed_at`.
    pub(crate) committed_at: String,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BranchHistory {
    pub(crate) name: String,
    /// Saved versions reachable from this branch's tip. `None` in a shallow
    /// clone, where the history this machine holds is not the history that
    /// exists — a number that would be wrong is worse than no number.
    pub(crate) total_count: Option<u32>,
    pub(crate) versions: Vec<BranchVersion>,
    /// Whether the branch has versions beyond the ones listed. Read from one
    /// extra record rather than from `total_count`, so it stays true when the
    /// count is unavailable.
    pub(crate) has_more: bool,
    /// The listed versions not yet on the branch's upstream, by commit — asked
    /// of Git, not inferred from the ahead count by position, which a branch
    /// that merged another one interleaves by date. `None` when the branch
    /// tracks nothing or its tracking branch is gone: where the versions stand
    /// is then not known.
    pub(crate) unpublished: Option<Vec<String>>,
    /// Where this branch left the project's main branch, and how far each has
    /// moved since. `None` for the main branch itself, for a project with no
    /// main branch, in a shallow clone, and whenever Git cannot say — it is
    /// extra detail, and the rest of the answer stands without it.
    pub(crate) route: Option<BranchRoute>,
}

/// A branch's route against the project's main branch: the saved version where
/// the two parted and when, the versions each saved while apart, and — for a
/// branch that has come back — the merge that brought it in and what the main
/// branch has saved since. Every count comes with up to
/// `BRANCH_ROUTE_VERSIONS` of the versions it counts, newest first, so a
/// drawn dot is a real saved version the reader can hover.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BranchRoute {
    /// The main branch, by its local name.
    pub(crate) base: String,
    pub(crate) fork_commit: String,
    /// ISO 8601 (`%cI`) of the version where the two parted.
    pub(crate) forked_at: String,
    /// Versions this branch saved away from the main branch — still away from it,
    /// or until it came back. Zero for a branch whose versions were always the
    /// main branch's own (created and never saved to, or fast-forwarded into it).
    pub(crate) own_count: u32,
    pub(crate) own_versions: Vec<BranchVersion>,
    /// Versions the main branch saved after the parting: up to now, or, for a
    /// branch that came back, up to the merge that brought it in.
    pub(crate) base_count: u32,
    pub(crate) base_versions: Vec<BranchVersion>,
    /// The merge by which this branch's versions came back into the main branch.
    pub(crate) merge: Option<BranchMerge>,
    /// What the branch changes against the main branch — from the parting to its
    /// tip, the way a pull request compares — or, for a branch that came back,
    /// what it brought. `None` for a branch that never left the main branch, and
    /// when Git cannot say.
    pub(crate) changes: Option<BranchChanges>,
}

/// How much a branch changes since it parted from the main branch: how many
/// files, and the lines written and removed across them. Totals only — the
/// detail says them in one line beside "Compare", and the files themselves are
/// the comparison's to list.
#[derive(serde::Serialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BranchChanges {
    pub(crate) files_changed: u32,
    pub(crate) additions: u32,
    pub(crate) deletions: u32,
}

const MAX_BRANCH_CHANGE_BYTES: usize = 8 * 1024 * 1024;

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BranchMerge {
    /// How the branch's work came back: its own versions, by a merge; or copies
    /// of them, squashed into one version or rebased one by one — in which
    /// case the branch's own versions still exist only on the branch.
    pub(crate) kind: MergeKind,
    /// The main branch's version that brought the work in: the merge, the
    /// squashed copy, or the newest of the rebased copies.
    pub(crate) commit: String,
    /// ISO 8601 (`%cI`) of that version.
    pub(crate) merged_at: String,
    /// Versions the main branch saved after the merge, and the newest of them.
    pub(crate) after_count: u32,
    pub(crate) after_versions: Vec<BranchVersion>,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum MergeKind {
    Merge,
    Squash,
    Rebase,
}

/// How much of the main branch's history, as patches, the copy check reads
/// before giving up: past this the branch is too far behind for "is its work
/// already there" to be worth the read, and the route says only what it knows.
const MAX_COPY_CHECK_COMMITS: usize = 1000;
const MAX_COPY_CHECK_BYTES: usize = 32 * 1024 * 1024;

/// How many of a lane's versions come with the route: the drawing shows at
/// most this many dots a lane, each one a real version.
pub(crate) const BRANCH_ROUTE_VERSIONS: usize = 8;

/// The first-parent walk that finds the merge is capped: a main branch whose
/// history since this branch's tip outgrows it is too far on to draw the return
/// anyway, and the route then says only that the work is on the main branch.
const MAX_ROUTE_WALK_BYTES: usize = 4 * 1024 * 1024;

/// The main branch is the remote's default (`default_branch_names`), and only a
/// local branch of that name — a route is drawn between two branches this project
/// holds. Only ever for the one branch the reader selected, cached with the rest
/// of its history read, and as few Git processes deep as the questions allow:
/// the ones that do not depend on each other run side by side (`in_parallel`),
/// because on Windows it is the process launches, not the walks, that the
/// reader waits for.
fn read_branch_route(
    path: &str,
    name: &str,
    branch_ref: &str,
    tip: &str,
) -> Result<Option<BranchRoute>, AppError> {
    let defaults = default_branch_names(path)?;
    // The main branch has no route: every other branch is measured against it.
    if defaults.iter().any(|default| default == name) {
        return Ok(None);
    }
    for base in defaults {
        let base_ref = format!("refs/heads/{base}");
        // Fails both for a main branch this project does not hold locally and
        // for two branches with no saved version in common: neither has a route.
        let Some(merge_base) = rev_parse_commit(path, &["merge-base", &base_ref, branch_ref])?
        else {
            continue;
        };
        if merge_base == tip {
            return read_returned_route(path, base, &base_ref, branch_ref, tip);
        }
        // Still away from the main branch: the two sides of the parting — and,
        // asked alongside them, whether its work came back anyway as copies.
        let own_range = format!("{base_ref}..{branch_ref}");
        let base_range = format!("{branch_ref}..{base_ref}");
        let ((forked_at, (own_versions, base_versions)), ((counts, copy), changes)) = in_parallel(
            || {
                in_parallel(
                    || commit_date(path, &merge_base),
                    || {
                        in_parallel(
                            || route_versions(path, &own_range),
                            || route_versions(path, &base_range),
                        )
                    },
                )
            },
            || {
                in_parallel(
                    || {
                        let counts = count_left_right(path, &format!("{base_ref}...{branch_ref}"));
                        // Work can only have come back as copies if the main
                        // branch saved something since the parting. Asked after
                        // the count, so a branch whose main branch has not moved
                        // skips the check's patch reads — the slowest part of
                        // this answer. A failed check is a question
                        // unanswered, not an error: the route then says what
                        // it knows — that the branch is still away.
                        let moved = matches!(counts, Ok(Some((base_count, _))) if base_count > 0);
                        let copy = if moved {
                            detect_copy(path, &base_ref, branch_ref, &merge_base).unwrap_or(None)
                        } else {
                            None
                        };
                        (counts, copy)
                    },
                    || read_branch_changes(path, &merge_base, branch_ref).unwrap_or(None),
                )
            },
        );
        let (
            Some((base_count, own_count)),
            Some(forked_at),
            Some(own_versions),
            Some(base_versions),
        ) = (counts?, forked_at?, own_versions?, base_versions?)
        else {
            return Ok(None);
        };
        let merge = match copy {
            Some((kind, commit)) => read_copy_return(path, &base_ref, branch_ref, kind, commit)?,
            None => None,
        };
        let (base_count, base_versions, merge) = match merge {
            Some((before_count, before_versions, merge)) => {
                (before_count, before_versions, Some(merge))
            }
            None => (base_count, base_versions, None),
        };
        return Ok(Some(BranchRoute {
            base,
            fork_commit: merge_base,
            forked_at,
            own_count,
            own_versions,
            base_count,
            base_versions,
            merge,
            changes,
        }));
    }
    Ok(None)
}

/// A branch whose every version is on the main branch. Either it came back by a
/// merge — the first commit on the main branch's first-parent chain that
/// descends from the tip, when the tip is not on that chain itself — and the
/// route is its excursion: where it left, what it saved, where it came back.
/// Or its versions were always the main branch's own (fast-forwarded into it, or
/// never saved to), and the route is a mark on the main branch at its tip.
fn read_returned_route(
    path: &str,
    base: String,
    base_ref: &str,
    branch_ref: &str,
    tip: &str,
) -> Result<Option<BranchRoute>, AppError> {
    let walk = run_git_capped(
        path,
        &[
            "rev-list",
            "--first-parent",
            "--ancestry-path",
            &format!("{branch_ref}..{base_ref}"),
            "--",
        ],
        MAX_ROUTE_WALK_BYTES,
    )?;
    let merge = (walk.status.success() && !walk.limit_exceeded)
        .then(|| {
            String::from_utf8_lossy(&walk.stdout)
                .lines()
                .map(str::trim)
                .rfind(|branch| is_object_id(branch))
                .map(str::to_string)
        })
        .flatten();

    if let Some(merge) = merge {
        let first_parent = format!("{merge}^1");
        let (fast_forwarded, fork) = in_parallel(
            || {
                run_git(
                    path,
                    &["merge-base", "--is-ancestor", branch_ref, &first_parent],
                )
            },
            || rev_parse_commit(path, &["merge-base", &first_parent, branch_ref]),
        );
        if !fast_forwarded?.status.success() {
            let Some(fork) = fork? else {
                return Ok(None);
            };
            let own_range = format!("{first_parent}..{branch_ref}");
            let base_range = format!("{branch_ref}..{first_parent}");
            let after_range = format!("{merge}..{base_ref}");
            let (
                (counts, (dates, changes)),
                ((own_versions, base_versions), (after_count, after_versions)),
            ) = in_parallel(
                || {
                    in_parallel(
                        || count_left_right(path, &format!("{first_parent}...{branch_ref}")),
                        || {
                            in_parallel(
                                || commit_dates(path, &[&fork, &merge]),
                                // What it brought: the branch's own change
                                // from the parting to its tip.
                                || read_branch_changes(path, &fork, branch_ref).unwrap_or(None),
                            )
                        },
                    )
                },
                || {
                    in_parallel(
                        || {
                            in_parallel(
                                || route_versions(path, &own_range),
                                || route_versions(path, &base_range),
                            )
                        },
                        || {
                            in_parallel(
                                || count_range(path, &after_range),
                                || route_versions(path, &after_range),
                            )
                        },
                    )
                },
            );
            let (
                Some((base_count, own_count)),
                Some([forked_at, merged_at]),
                Some(own_versions),
                Some(base_versions),
                Some(after_count),
                Some(after_versions),
            ) = (
                counts?,
                dates?.and_then(|dates| <[String; 2]>::try_from(dates).ok()),
                own_versions?,
                base_versions?,
                after_count?,
                after_versions?,
            )
            else {
                return Ok(None);
            };
            return Ok(Some(BranchRoute {
                base,
                fork_commit: fork,
                forked_at,
                own_count,
                own_versions,
                base_count,
                base_versions,
                merge: Some(BranchMerge {
                    kind: MergeKind::Merge,
                    commit: merge,
                    merged_at,
                    after_count,
                    after_versions,
                }),
                changes,
            }));
        }
    }

    // On the main branch's own history: a mark at the tip, and what the main
    // branch saved after it.
    let after_range = format!("{branch_ref}..{base_ref}");
    let (forked_at, (base_count, base_versions)) = in_parallel(
        || commit_date(path, tip),
        || {
            in_parallel(
                || count_range(path, &after_range),
                || route_versions(path, &after_range),
            )
        },
    );
    let (Some(forked_at), Some(base_count), Some(base_versions)) =
        (forked_at?, base_count?, base_versions?)
    else {
        return Ok(None);
    };
    Ok(Some(BranchRoute {
        base,
        fork_commit: tip.to_string(),
        forked_at,
        own_count: 0,
        own_versions: Vec::new(),
        base_count,
        base_versions,
        merge: None,
        changes: None,
    }))
}

/// Whether a branch still away from the main branch has come back anyway, as
/// copies of its versions: squashed into one version on the main branch (its
/// whole change since the parting is one of the main branch's changes since),
/// or rebased onto it one by one (each of its versions' changes is one of
/// them). Compared by `git patch-id --stable` — the change, not the commit —
/// and read only: nothing is written to the repository to ask it. Returns
/// how, and the main branch's version that brought the work in (the newest of
/// the copies, for a rebase).
fn detect_copy(
    path: &str,
    base_ref: &str,
    branch_ref: &str,
    fork: &str,
) -> Result<Option<(MergeKind, String)>, AppError> {
    let max_count = format!("--max-count={MAX_COPY_CHECK_COMMITS}");
    let base_log_range = format!("{fork}..{base_ref}");
    let own_log_range = format!("{base_ref}..{branch_ref}");
    let (base_patches, (whole_change, own_patches)) = in_parallel(
        || {
            run_git_capped(
                path,
                &[
                    "log",
                    "-p",
                    "--no-merges",
                    "--no-color",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--format=commit %H",
                    &max_count,
                    &base_log_range,
                    "--",
                ],
                MAX_COPY_CHECK_BYTES,
            )
        },
        || {
            in_parallel(
                || {
                    run_git_capped(
                        path,
                        &[
                            "diff",
                            "--no-color",
                            "--no-ext-diff",
                            "--no-textconv",
                            fork,
                            branch_ref,
                            "--",
                        ],
                        MAX_COPY_CHECK_BYTES,
                    )
                },
                || {
                    run_git_capped(
                        path,
                        &[
                            "log",
                            "-p",
                            "--no-merges",
                            "--no-color",
                            "--no-ext-diff",
                            "--no-textconv",
                            "--format=commit %H",
                            &max_count,
                            &own_log_range,
                            "--",
                        ],
                        MAX_COPY_CHECK_BYTES,
                    )
                },
            )
        },
    );
    let (base_patches, whole_change, own_patches) = (base_patches?, whole_change?, own_patches?);
    let complete = |output: &crate::git_command::CappedOutput| {
        output.status.success() && !output.limit_exceeded
    };
    if !complete(&base_patches) || !complete(&whole_change) || base_patches.stdout.is_empty() {
        return Ok(None);
    }

    // The main branch's changes since the parting, newest first: the first
    // commit to carry a change is the one that brought it in.
    let Some(base_ids) = patch_ids(path, &base_patches.stdout)? else {
        return Ok(None);
    };
    let find = |id: &str| {
        base_ids
            .iter()
            .find(|(patch, _)| patch == id)
            .map(|(_, commit)| commit.clone())
    };

    if let Some(whole) =
        patch_ids(path, &whole_change.stdout)?.and_then(|ids| ids.into_iter().next())
    {
        if let Some(commit) = find(&whole.0) {
            return Ok(Some((MergeKind::Squash, commit)));
        }
    }

    if !complete(&own_patches) {
        return Ok(None);
    }
    let Some(own_ids) = patch_ids(path, &own_patches.stdout)? else {
        return Ok(None);
    };
    if own_ids.is_empty() {
        return Ok(None);
    }
    // Every one of the branch's versions has its copy on the main branch: the
    // newest of those copies is where the work came back.
    let mut newest: Option<usize> = None;
    for (patch, _) in &own_ids {
        let Some(index) = base_ids
            .iter()
            .position(|(base_patch, _)| base_patch == patch)
        else {
            return Ok(None);
        };
        newest = Some(newest.map_or(index, |current| current.min(index)));
    }
    Ok(newest.map(|index| (MergeKind::Rebase, base_ids[index].1.clone())))
}

/// `git patch-id --stable` over a stream of patches: one `(patch id, commit)`
/// per change, in the stream's order. A bare diff has no commit, and Git names
/// it all zeros.
fn patch_ids(path: &str, patches: &[u8]) -> Result<Option<Vec<(String, String)>>, AppError> {
    if patches.is_empty() {
        return Ok(Some(Vec::new()));
    }
    let output = run_git_with_input_capped(
        path,
        &["patch-id", "--stable"],
        patches,
        MAX_COPY_CHECK_BYTES,
    )?;
    if !output.status.success() || output.limit_exceeded {
        return Ok(None);
    }
    Ok(Some(
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|branch| {
                let (patch, commit) = branch.trim().split_once(' ')?;
                (is_object_id(patch) && is_object_id(commit))
                    .then(|| (patch.to_string(), commit.to_string()))
            })
            .collect(),
    ))
}

/// The main branch around the version that brought a branch's copied work in:
/// what it saved between the parting and that version, and after it.
fn read_copy_return(
    path: &str,
    base_ref: &str,
    branch_ref: &str,
    kind: MergeKind,
    commit: String,
) -> Result<Option<(u32, Vec<BranchVersion>, BranchMerge)>, AppError> {
    let before_range = format!("{branch_ref}..{commit}^");
    let after_range = format!("{commit}..{base_ref}");
    let ((before_count, before_versions), ((after_count, after_versions), merged_at)) = in_parallel(
        || {
            in_parallel(
                || count_range(path, &before_range),
                || route_versions(path, &before_range),
            )
        },
        || {
            in_parallel(
                || {
                    in_parallel(
                        || count_range(path, &after_range),
                        || route_versions(path, &after_range),
                    )
                },
                || commit_date(path, &commit),
            )
        },
    );
    let (
        Some(before_count),
        Some(before_versions),
        Some(after_count),
        Some(after_versions),
        Some(merged_at),
    ) = (
        before_count?,
        before_versions?,
        after_count?,
        after_versions?,
        merged_at?,
    )
    else {
        return Ok(None);
    };
    Ok(Some((
        before_count,
        before_versions,
        BranchMerge {
            kind,
            commit,
            merged_at,
            after_count,
            after_versions,
        },
    )))
}

/// What a branch changes between `from` and `to`, from one `--numstat`.
/// Renames are followed, so a moved file is one change and not a deletion and
/// an addition. Read only; `None` when the answer is missing or too large.
fn read_branch_changes(
    path: &str,
    from: &str,
    to: &str,
) -> Result<Option<BranchChanges>, AppError> {
    let numstat = run_git_capped(
        path,
        &[
            "diff",
            "--numstat",
            "-z",
            "-M",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            from,
            to,
            "--",
        ],
        MAX_BRANCH_CHANGE_BYTES,
    )?;
    if !numstat.status.success() || numstat.limit_exceeded {
        return Ok(None);
    }
    Ok(Some(parse_branch_changes(&numstat.stdout)))
}

/// Totals `git diff --numstat -z`: one record per file, `added\tdeleted\tpath\0`,
/// or for a rename `added\tdeleted\t\0old\0new\0`. A binary file counts as a
/// file with no lines (`-\t-`).
pub(crate) fn parse_branch_changes(numstat: &[u8]) -> BranchChanges {
    let mut changes = BranchChanges::default();
    let mut records = numstat.split(|byte| *byte == 0);
    while let Some(record) = records.next() {
        if record.is_empty() {
            continue;
        }
        let mut parts = record.splitn(3, |byte| *byte == b'\t');
        let (Some(added), Some(deleted), Some(rest)) = (parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        if rest.is_empty() {
            // A rename: its two paths follow as records of their own.
            let _old = records.next();
            let _new = records.next();
        }
        let count = |value: &[u8]| {
            std::str::from_utf8(value)
                .ok()
                .and_then(|value| value.parse::<u32>().ok())
                .unwrap_or(0)
        };
        changes.files_changed = changes.files_changed.saturating_add(1);
        changes.additions = changes.additions.saturating_add(count(added));
        changes.deletions = changes.deletions.saturating_add(count(deleted));
    }
    changes
}

/// A command that prints one commit id, or `None` when it fails or prints
/// something else.
fn rev_parse_commit(path: &str, args: &[&str]) -> Result<Option<String>, AppError> {
    let output = run_git(path, args)?;
    let commit = git_stdout(&output);
    Ok((output.status.success() && is_object_id(&commit)).then_some(commit))
}

fn commit_date(path: &str, commit: &str) -> Result<Option<String>, AppError> {
    let output = run_git(path, &["show", "-s", "--format=%cI", commit, "--"])?;
    Ok(output.status.success().then(|| git_stdout(&output)))
}

/// The commit dates of several commits in one process, in the order asked.
fn commit_dates(path: &str, commits: &[&str]) -> Result<Option<Vec<String>>, AppError> {
    let mut args = vec!["show", "-s", "--format=%cI"];
    args.extend_from_slice(commits);
    args.push("--");
    let output = run_git(path, &args)?;
    Ok(output
        .status
        .success()
        .then(|| {
            git_stdout(&output)
                .lines()
                .map(str::trim)
                .filter(|branch| !branch.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .filter(|dates| dates.len() == commits.len()))
}

fn count_range(path: &str, range: &str) -> Result<Option<u32>, AppError> {
    let output = run_git(path, &["rev-list", "--count", range, "--"])?;
    Ok(output
        .status
        .success()
        .then(|| git_stdout(&output).parse().ok())
        .flatten())
}

fn count_left_right(path: &str, range: &str) -> Result<Option<(u32, u32)>, AppError> {
    let output = run_git(path, &["rev-list", "--left-right", "--count", range, "--"])?;
    Ok(output
        .status
        .success()
        .then(|| parse_left_right_count(&git_stdout(&output)))
        .flatten())
}

/// The newest versions in `range`, in the shape the history read lists them.
fn route_versions(path: &str, range: &str) -> Result<Option<Vec<BranchVersion>>, AppError> {
    let max_count = format!("--max-count={BRANCH_ROUTE_VERSIONS}");
    let format = format!("--format={BRANCH_HISTORY_FORMAT}");
    let output = run_git(
        path,
        &["log", &max_count, &format, "--no-color", range, "--"],
    )?;
    Ok(output
        .status
        .success()
        .then(|| parse_branch_history(&output.stdout, BRANCH_ROUTE_VERSIONS).0))
}

fn is_object_id(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

/// `rev-list --left-right --count A...B` prints the two sides separated by
/// whitespace: versions only on `A`, then versions only on `B`.
pub(crate) fn parse_left_right_count(text: &str) -> Option<(u32, u32)> {
    let mut parts = text.split_whitespace();
    let left = parts.next()?.parse().ok()?;
    let right = parts.next()?.parse().ok()?;
    parts.next().is_none().then_some((left, right))
}

/// Author names and subjects are bytes, and unlike a ref name nothing here is
/// used to address anything: the commit id beside them is hex. So a record
/// that is not valid UTF-8 is decoded lossily and still shown, rather than
/// being dropped the way an unrepresentable *branch name* has to be.
pub(crate) fn parse_branch_history(bytes: &[u8], limit: usize) -> (Vec<BranchVersion>, bool) {
    let mut versions = Vec::new();
    let mut has_more = false;
    for branch in bytes.split(|byte| *byte == b'\n') {
        if branch.is_empty() {
            continue;
        }
        let branch = branch.strip_suffix(b"\r").unwrap_or(branch);
        let fields = branch.split(|byte| *byte == 0).collect::<Vec<_>>();
        if fields.len() < 2 {
            continue;
        }
        if versions.len() == limit {
            has_more = true;
            break;
        }
        let text = |index: usize| -> String {
            fields
                .get(index)
                .map(|field| String::from_utf8_lossy(field).into_owned())
                .unwrap_or_default()
        };
        versions.push(BranchVersion {
            commit: text(0),
            short_commit: text(1),
            subject: text(2),
            author_name: text(3),
            author_email: text(4),
            committed_at: text(5),
        });
    }
    (versions, has_more)
}

pub(crate) fn get_branch_history(path: String, name: String) -> Result<BranchHistory, AppError> {
    // Superseded only by a newer read of the same branch: the next branch's read,
    // or one started ahead of a press, is a different question.
    let (_repository, _access) =
        application::authorize_repository_read_of(&path, "get_branch_history", &name)?;
    validate_branch_ref_name(&path, &name)?;
    let branch_ref = format!("refs/heads/{name}");
    // The fully qualified ref: a bare name could resolve to a tag or a
    // remote-tracking branch of the same name, and this screen is only ever
    // describing a local branch. One process answers both whether it exists and
    // which version it stands on — the route needs the second.
    let tip_spec = format!("{branch_ref}^{{commit}}");
    let (tip, shallow) = in_parallel(
        || rev_parse_commit(&path, &["rev-parse", "--verify", "--quiet", &tip_spec]),
        || run_git(&path, &["rev-parse", "--is-shallow-repository"]),
    );
    let Some(tip) = tip? else {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That branch no longer exists.",
        )
        .with_remediation("Refresh and try again."));
    };
    let shallow = shallow?;
    let is_shallow = shallow.status.success() && git_stdout(&shallow) == "true";

    // The versions and the route are separate questions, so they are asked
    // side by side: the route is most of this read's Git processes, and the
    // total count below can walk the whole history.
    let ((listed, unpublished), route) = in_parallel(
        || {
            in_parallel(
                || read_listed_versions(&path, &branch_ref, is_shallow),
                || read_unpublished(&path, &name, &branch_ref),
            )
        },
        || {
            // A shallow clone's merge base is where this machine's history
            // stops, not where the branches parted; a failed read is extra detail
            // missing, not an error for the whole answer.
            if is_shallow {
                None
            } else {
                read_branch_route(&path, &name, &branch_ref, &tip).unwrap_or(None)
            }
        },
    );
    let (versions, has_more, total_count) = listed?;

    Ok(BranchHistory {
        name,
        total_count,
        versions,
        has_more,
        unpublished,
        route,
    })
}

/// Which of a branch's newest versions its upstream does not hold yet. Walked
/// from the tip in the listing's own order, so every listed version not on the
/// upstream is within the first few the walk finds; a little past the listing
/// for slack. `None` without an upstream to ask (none configured, or its
/// tracking branch gone) or when Git cannot say.
fn read_unpublished(path: &str, name: &str, branch_ref: &str) -> Option<Vec<String>> {
    let range = format!("{name}@{{upstream}}..{branch_ref}");
    let max_count = format!("--max-count={}", BRANCH_HISTORY_LIMIT * 4);
    let output = run_git(path, &["rev-list", &max_count, &range, "--"]).ok()?;
    if !output.status.success() {
        return None;
    }
    Some(
        git_stdout(&output)
            .lines()
            .map(str::trim)
            .filter(|commit| is_object_id(commit))
            .map(str::to_string)
            .collect(),
    )
}

/// The newest versions on a branch, whether there are more, and how many there
/// are in all — `None` in a shallow clone.
fn read_listed_versions(
    path: &str,
    branch_ref: &str,
    is_shallow: bool,
) -> Result<(Vec<BranchVersion>, bool, Option<u32>), AppError> {
    // One more than the panel shows, so `has_more` is answered by the same
    // walk instead of a second one.
    let max_count = format!("--max-count={}", BRANCH_HISTORY_LIMIT + 1);
    let format = format!("--format={BRANCH_HISTORY_FORMAT}");
    let log = run_git(
        path,
        &["log", &max_count, &format, "--no-color", branch_ref, "--"],
    )?;
    if !log.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this branch's saved versions.",
        )
        .with_detail(truncate_detail(&String::from_utf8_lossy(&log.stderr))));
    }
    let (versions, has_more) = parse_branch_history(&log.stdout, BRANCH_HISTORY_LIMIT);

    let total_count = if is_shallow {
        None
    } else {
        let counted = run_git(path, &["rev-list", "--count", branch_ref, "--"])?;
        counted
            .status
            .success()
            .then(|| git_stdout(&counted).parse().ok())
            .flatten()
    };
    Ok((versions, has_more, total_count))
}

// ---- Create a branch ----

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateBranchPlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) summary: String,
    pub(crate) steps: Vec<String>,
    pub(crate) risks: Vec<String>,
    pub(crate) recovery: String,
    pub(crate) requires_confirmation: bool,
    pub(crate) state_token: String,
    pub(crate) name: String,
    pub(crate) head_state: HeadState,
    pub(crate) starting_commit: Option<String>,
    /// Whether `starting_commit` is a saved version the user picked rather than
    /// wherever the project happens to be standing. The preview says different
    /// things about the two, and only the first can be true while `HEAD` is
    /// somewhere else entirely.
    pub(crate) from_saved_version: bool,
    pub(crate) will_switch: bool,
    pub(crate) has_unsaved_work: bool,
}

pub(crate) struct ValidatedCreate {
    pub(crate) name: String,
    pub(crate) head_state: HeadState,
    pub(crate) starting_commit: Option<String>,
    pub(crate) from_saved_version: bool,
    pub(crate) will_switch: bool,
    pub(crate) has_unsaved_work: bool,
    pub(crate) state_token: String,
}

/// A starting point chosen from History, resolved to the exact commit it names.
///
/// Only a full object id is accepted, and it is verified to be a commit that
/// exists: a revision expression would let a name, a tag, or `@{upstream}` in
/// as a starting point, and the interface only ever sends what a saved version
/// row already holds.
fn resolve_start_commit(path: &str, value: &str) -> Result<String, AppError> {
    let shaped = (value.len() == 40 || value.len() == 64)
        && value.bytes().all(|byte| byte.is_ascii_hexdigit());
    if !shaped {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That saved version couldn't be identified.",
        )
        .with_remediation("Choose a saved version from History and try again."));
    }
    let revision = format!("{value}^{{commit}}");
    let output = run_git(path, &["rev-parse", "--verify", "--quiet", &revision])?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That saved version isn't in this project any more.",
        )
        .with_remediation("Refresh History and choose a saved version that is still listed."));
    }
    Ok(git_stdout(&output))
}

pub(crate) fn validate_and_prepare_create(
    path: &str,
    name: &str,
    switch: bool,
    start_commit: Option<&str>,
) -> Result<ValidatedCreate, AppError> {
    require_git_switch_support(path)?;

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation in Git, then try again."));
    }

    let symbolic_head = run_git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let branch = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    let (head_state, head_sha) = resolve_head_state(path, branch.clone())?;

    // A chosen saved version is a commit of its own, so it answers the
    // question an unborn `HEAD` cannot: there is something to start from even
    // when the current branch has nothing on it yet.
    let start_commit = start_commit
        .map(|value| resolve_start_commit(path, value))
        .transpose()?;
    if head_state == HeadState::Unborn && start_commit.is_none() {
        return Err(AppError::new(
            AppErrorCode::UnbornBranchNoVersion,
            "Save the first version before creating another branch.",
        )
        .with_remediation("Save a version, then create a new branch."));
    }

    validate_branch_ref_name(path, name)?;

    let existing = list_branch_names(path)?;
    if existing.iter().any(|existing_name| existing_name == name) {
        return Err(AppError::new(
            AppErrorCode::BranchNameTaken,
            "A branch with this exact name already exists.",
        )
        .with_remediation("Choose a different name."));
    }
    if let Some(collision) = existing
        .iter()
        .find(|existing_name| existing_name.eq_ignore_ascii_case(name))
    {
        return Err(AppError::new(
            AppErrorCode::BranchNameCollides,
            format!(
                "\"{collision}\" already exists and only differs by letter case, which some file systems can't tell apart."
            ),
        )
        .with_remediation("Choose a name that isn't just a different case of an existing one."));
    }

    let status = read_working_tree_status(path.to_string())?;
    if status.counts.conflicted > 0 {
        return Err(AppError::new(
            AppErrorCode::UnresolvedConflicts,
            "Some files have overlapping changes that need to be resolved first.",
        )
        .with_remediation("Resolve the overlapping changes, then try again."));
    }
    let has_unsaved_work = !status.is_clean;
    // A detached `HEAD` is recovered by switching onto the branch being created
    // at the commit it is standing on — but only when that is where the branch
    // starts. Creating a branch at a saved version somewhere else is not a
    // recovery, and switching to it would move the working tree away from the
    // commit the reader was on without being asked.
    let from_saved_version = start_commit.is_some();
    let will_switch = switch || (head_state == HeadState::Detached && !from_saved_version);
    let starting_commit = start_commit.or(head_sha.clone());

    let mutable_state = create_branch_state_fingerprint(path, &head_state, &status)?;
    let state_token = compute_branch_state_token(
        head_sha.as_deref(),
        branch.as_deref(),
        &mutable_state,
        &format!(
            "create:{name}:{will_switch}:{}",
            starting_commit.as_deref().unwrap_or("")
        ),
    );

    Ok(ValidatedCreate {
        name: name.to_string(),
        head_state,
        starting_commit,
        from_saved_version,
        will_switch,
        has_unsaved_work,
        state_token,
    })
}

pub(crate) fn plan_create_branch(
    path: String,
    name: String,
    switch: bool,
    start_commit: Option<String>,
) -> Result<CreateBranchPlan, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "plan_create_branch", None)?;
    let validated = validate_and_prepare_create(&path, &name, switch, start_commit.as_deref())?;
    let mut steps = vec![if validated.from_saved_version {
        format!(
            "Create the branch \"{}\" at the chosen saved version.",
            validated.name
        )
    } else {
        format!(
            "Create the branch \"{}\" at the current commit.",
            validated.name
        )
    }];
    if validated.will_switch {
        steps.push(format!("Switch this project to \"{}\".", validated.name));
    }
    let mut risks = Vec::new();
    if validated.has_unsaved_work {
        risks.push(
            "Unsaved files and prepared changes stay exactly as they are; future saved versions will belong to the new branch."
                .to_string(),
        );
    }
    if validated.head_state == HeadState::Detached && !validated.from_saved_version {
        risks.push(
            "This project isn't on a branch right now; creating one here keeps the current commit reachable by name."
                .to_string(),
        );
    }
    if validated.from_saved_version && !validated.will_switch {
        risks.push(
            "This project stays where it is; the new branch starts at the chosen saved version."
                .to_string(),
        );
    }
    let summary = if validated.will_switch {
        format!("Create \"{}\" and switch to it.", validated.name)
    } else {
        format!("Create \"{}\" without switching to it.", validated.name)
    };
    let requires_confirmation = validated.will_switch || validated.has_unsaved_work;
    Ok(CreateBranchPlan {
        operation_kind: OperationKind::LocalMutation,
        summary,
        steps,
        risks,
        recovery: "No files, saved versions, or other branches are changed by creating this one."
            .to_string(),
        requires_confirmation,
        state_token: validated.state_token,
        name: validated.name,
        head_state: validated.head_state,
        starting_commit: validated.starting_commit,
        from_saved_version: validated.from_saved_version,
        will_switch: validated.will_switch,
        has_unsaved_work: validated.has_unsaved_work,
    })
}

pub(crate) fn classify_ref_mutation_failure(output: &Output, generic_message: &str) -> AppError {
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stderr_lower = stderr.to_lowercase();
    if stderr_lower.contains("already exists") {
        AppError::new(
            AppErrorCode::BranchNameTaken,
            "That name is already used by another branch.",
        )
        .with_remediation("Choose a different name.")
    } else if stderr_lower.contains(".lock") || stderr_lower.contains("unable to create") {
        AppError::new(
            AppErrorCode::RefLocked,
            "Git couldn't update its references right now (another Git process may be using them).",
        )
        .with_remediation("Close other Git tools touching this project, then try again.")
    } else {
        AppError::new(AppErrorCode::GitCommandFailed, generic_message)
            .with_remediation("Check the project's Git state and try again.")
            .with_detail(truncate_detail(&stderr))
    }
}

pub(crate) fn create_branch(
    path: String,
    name: String,
    switch: bool,
    start_commit: Option<String>,
    state_token: String,
) -> Result<BranchesSnapshot, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "create_branch", None)?;
    let validated = validate_and_prepare_create(&path, &name, switch, start_commit.as_deref())?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleBranchPlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }

    let starting = validated.starting_commit.as_deref().unwrap_or("HEAD");
    let output = if validated.will_switch {
        // `switch -c <name> <start>` is one operation: the branch is created at
        // the chosen version and checked out, or neither happens.
        run_git(&path, &["switch", "-c", &validated.name, starting])?
    } else {
        run_git(&path, &["branch", "--", &validated.name, starting])?
    };
    if !output.status.success() {
        return Err(classify_ref_mutation_failure(
            &output,
            "Git couldn't create this branch.",
        ));
    }
    get_branches(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git_command::{base_git_command, git_command, in_test_frame, test_git};
    use crate::publish_domain::{plan_publish, publish};
    use std::{fs, path::Path};

    #[test]
    fn snapshot_serialization_names_the_branch_inventory() {
        let snapshot = BranchesSnapshot {
            branch: Some("main".to_string()),
            head_state: HeadState::Unborn,
            current_commit: None,
            branches: vec![],
            total_count: 0,
            is_truncated: false,
            unreadable_count: 0,
        };
        let wire = serde_json::to_value(snapshot).unwrap();
        assert_eq!(wire["branch"], "main");
        assert_eq!(wire["branches"], serde_json::json!([]));
    }

    fn unique_temp_dir(label: &str) -> String {
        let mut dir = crate::test_support::test_temp_root().to_path_buf();
        dir.push(format!("gitodile-test-{label}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create temp dir for test");
        dir.to_string_lossy().to_string()
    }

    fn git_init(path: &str) {
        let status = git_command(path)
            .args(["init", "-q"])
            .status()
            .expect("run git init");
        assert!(status.success(), "git init should succeed");
    }

    fn write_file(repo_path: &str, name: &str, contents: &str) {
        fs::write(Path::new(repo_path).join(name), contents).expect("write test file");
    }

    fn git_add(path: &str, file: &str) {
        let status = git_command(path)
            .args(["add", "--", file])
            .status()
            .expect("run git add");
        assert!(status.success(), "git add should succeed");
    }

    fn git_add_all(path: &str) {
        let status = git_command(path)
            .args(["add", "-A"])
            .status()
            .expect("run git add -A");
        assert!(status.success(), "git add -A should succeed");
    }

    fn git_commit(path: &str, message: &str) {
        let status = git_command(path)
            .args([
                "-c",
                "user.name=GitOdile Test",
                "-c",
                "user.email=test@gitodile.local",
                "commit",
                "-q",
                "-m",
                message,
            ])
            .status()
            .expect("run git commit");
        assert!(status.success(), "git commit should succeed");
    }

    fn current_branch(path: &str) -> String {
        let output = git_command(path)
            .args(["symbolic-ref", "--short", "HEAD"])
            .output()
            .expect("read current branch");
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    fn init_bare_remote(path: &str) {
        let status = git_command(path)
            .args(["init", "--bare", "-q"])
            .status()
            .expect("run git init --bare");
        assert!(status.success(), "git init --bare should succeed");
    }

    fn wire_remote(repo_path: &str, remote_name: &str, remote_path: &str) {
        let status = git_command(repo_path)
            .args(["remote", "add", remote_name, remote_path])
            .status()
            .expect("run git remote add");
        assert!(status.success(), "git remote add should succeed");
    }

    fn published_repo_and_remote(label: &str) -> (String, String, String) {
        let repo = unique_temp_dir(&format!("publish-{label}"));
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        git_commit(&repo, "first");
        let branch = current_branch(&repo);
        let remote = unique_temp_dir(&format!("publish-{label}-remote"));
        init_bare_remote(&remote);
        wire_remote(&repo, "origin", &remote);
        let plan = plan_publish(repo.clone(), None, None).expect("first plan should succeed");
        publish(
            repo.clone(),
            plan.target.remote,
            plan.state_token,
            None,
            true,
        )
        .expect("first publish should succeed");
        (repo, remote, branch)
    }

    #[test]
    fn git_version_at_least_compares_numerically_not_lexically() {
        assert!(git_version_at_least("2.23.0", (2, 23, 0)));
        assert!(git_version_at_least("2.40.1", (2, 23, 0)));
        assert!(git_version_at_least("3.0.0", (2, 23, 0)));
        assert!(!git_version_at_least("2.9.0", (2, 23, 0)));
        assert!(!git_version_at_least("1.99.9", (2, 23, 0)));
        // A trailing platform suffix (as Git for Windows appends) must not
        // break parsing of the leading numeric triple.
        assert!(git_version_at_least("2.39.2.windows.1", (2, 23, 0)));
    }

    #[test]
    fn parse_worktree_list_porcelain_reports_each_block_and_its_branch() {
        let text = "worktree /repo/main\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo/linked\nHEAD def456\nbranch refs/heads/feature\n\nworktree /repo/detached\nHEAD 789abc\ndetached\n";
        let entries = parse_worktree_list_porcelain(text);
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].path, "/repo/main");
        assert_eq!(entries[0].branch.as_deref(), Some("main"));
        assert_eq!(entries[1].path, "/repo/linked");
        assert_eq!(entries[1].branch.as_deref(), Some("feature"));
        assert_eq!(entries[2].path, "/repo/detached");
        assert_eq!(entries[2].branch, None);
    }

    #[test]
    fn parse_branch_refs_reads_nul_delimited_fields() {
        let text = b"refs/heads/main\0abc123\0abc12\0First subject\x002024-01-01T00:00:00+00:00\0origin/main\nrefs/heads/feature/nested\0def456\0def45\0Nested branch\x002024-02-02T00:00:00+00:00\0\n";
        let branches = parse_branch_refs(text).branches;
        assert_eq!(branches.len(), 2);
        assert_eq!(branches[0].name, "main");
        assert_eq!(branches[0].commit, "abc123");
        assert_eq!(branches[0].upstream.as_deref(), Some("origin/main"));
        // A nested (`feature/name`) ref name and an empty upstream field
        // must both survive without being mistaken for malformed input.
        assert_eq!(branches[1].name, "feature/nested");
        assert_eq!(branches[1].upstream, None);
    }

    #[test]
    fn parse_branch_refs_reads_batched_counts_and_worktrees() {
        let text = b"refs/heads/feature\0def456\0def45\0Feature\x002024-02-02T00:00:00+00:00\0origin/feature\0[ahead 2, behind 1]\x003 7\0C:/repo-linked\n";
        let branches = parse_branch_refs(text).branches;
        assert_eq!(branches.len(), 1);
        assert_eq!(branches[0].upstream_track, "[ahead 2, behind 1]");
        assert_eq!(branches[0].unique_commit_count, Some(3));
        assert_eq!(branches[0].worktree_path.as_deref(), Some("C:/repo-linked"));
    }

    #[test]
    fn parse_branch_history_reads_records_and_reports_the_overflow() {
        let text = b"aaa111\0aaa1\0First subject\0Ada Lovelace\0ada@example.com\x002024-01-01T00:00:00+00:00\nbbb222\0bbb2\0Second\0Ada Lovelace\0ada@example.com\x002024-01-02T00:00:00+00:00\n";
        let (versions, has_more) = parse_branch_history(text, 4);
        assert_eq!(versions.len(), 2);
        assert!(!has_more);
        assert_eq!(versions[0].commit, "aaa111");
        assert_eq!(versions[0].short_commit, "aaa1");
        assert_eq!(versions[0].subject, "First subject");
        assert_eq!(versions[0].author_name, "Ada Lovelace");
        assert_eq!(versions[0].author_email, "ada@example.com");
        assert_eq!(versions[0].committed_at, "2024-01-01T00:00:00+00:00");

        // The walk asks for one more than it reports, and that extra record is
        // what says there is more rather than a second count.
        let (trimmed, overflowed) = parse_branch_history(text, 1);
        assert_eq!(trimmed.len(), 1);
        assert!(overflowed);
    }

    #[test]
    fn parse_branch_history_keeps_a_version_whose_metadata_is_not_utf8() {
        // Nothing here addresses anything — the commit id beside it is hex —
        // so an unrepresentable author is shown lossily rather than hiding a
        // saved version that genuinely exists.
        let text = b"aaa111\0aaa1\0Subject\0Ada \xff Lovelace\0ada@example.com\x002024-01-01T00:00:00+00:00\n";
        let (versions, _) = parse_branch_history(text, 4);
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].commit, "aaa111");
        assert!(versions[0].author_name.starts_with("Ada "));
    }

    #[test]
    fn parse_branch_changes_totals_every_file_renames_and_binaries_included() {
        let numstat = b"3\t1\tsrc/a.rs\x0010\t0\tsrc/new.rs\x00-\t-\tlogo.png\x002\t2\t\x00old/b.rs\x00new/b.rs\x00";
        let changes = parse_branch_changes(numstat);
        assert_eq!(
            changes,
            BranchChanges {
                files_changed: 4,
                additions: 15,
                deletions: 3,
            }
        );
        assert_eq!(parse_branch_changes(b""), BranchChanges::default());
    }

    #[test]
    fn parse_left_right_count_reads_both_sides_and_nothing_else() {
        assert_eq!(parse_left_right_count("3\t5"), Some((3, 5)));
        assert_eq!(parse_left_right_count("0 0"), Some((0, 0)));
        assert_eq!(parse_left_right_count("3"), None);
        assert_eq!(parse_left_right_count("3 5 7"), None);
        assert_eq!(parse_left_right_count("x 5"), None);
    }

    #[test]
    fn get_branch_history_names_the_versions_its_upstream_lacks() {
        let (repo, remote, main) = published_repo_and_remote("branch-unpublished");
        write_and_commit(&repo, "b.txt", "local\n", "only here");
        let tip = git_command(&repo)
            .args(["rev-parse", "HEAD"])
            .output()
            .expect("read the tip");
        let tip = String::from_utf8_lossy(&tip.stdout).trim().to_string();

        let history = get_branch_history(repo.clone(), main.clone()).expect("history should read");
        assert_eq!(history.unpublished, Some(vec![tip]));

        // A branch that tracks nothing: where its versions stand is not known.
        let status = git_command(&repo)
            .args(["branch", "-q", "local-only"])
            .status()
            .expect("create a branch");
        assert!(status.success());
        let local = get_branch_history(repo.clone(), "local-only".to_string())
            .expect("history should read");
        assert_eq!(local.unpublished, None);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn get_branch_history_draws_a_route_against_the_main_branch_only() {
        let (repo, remote, main) = published_repo_and_remote("branch-route");
        // What a clone writes, and what makes `main` the project's main branch.
        let status = git_command(&repo)
            .args(["remote", "set-head", "origin", &main])
            .status()
            .expect("run git remote set-head");
        assert!(status.success());

        let status = git_command(&repo)
            .args(["switch", "-q", "-c", "feature"])
            .status()
            .expect("create feature");
        assert!(status.success());
        write_and_commit(&repo, "b.txt", "one\n", "feature one");
        write_and_commit(&repo, "b.txt", "two\n", "feature two");
        let status = git_command(&repo)
            .args(["switch", "-q", &main])
            .status()
            .expect("switch back");
        assert!(status.success());
        write_and_commit(&repo, "c.txt", "main\n", "main moves on");

        let history =
            get_branch_history(repo.clone(), "feature".to_string()).expect("history should read");
        let route = history
            .route
            .expect("a branch off the main branch has a route");
        assert_eq!(route.base, main);
        assert_eq!(route.own_count, 2);
        assert_eq!(route.base_count, 1);
        let first = git_command(&repo)
            .args(["rev-parse", &format!("{main}~1")])
            .output()
            .expect("read the fork");
        assert_eq!(
            route.fork_commit,
            String::from_utf8_lossy(&first.stdout).trim()
        );
        assert!(!route.forked_at.is_empty());
        // Each dot is a real version, newest first.
        let subjects = |versions: &[BranchVersion]| {
            versions
                .iter()
                .map(|version| version.subject.clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(
            subjects(&route.own_versions),
            ["feature two", "feature one"]
        );
        assert_eq!(subjects(&route.base_versions), ["main moves on"]);
        assert!(route.merge.is_none());
        // What it changes against the main branch: one new file of one line.
        let changes = route.changes.expect("a branch away from main has changes");
        assert_eq!(
            changes,
            BranchChanges {
                files_changed: 1,
                additions: 1,
                deletions: 0,
            }
        );

        // The main branch itself is what the others are measured against.
        let main_history =
            get_branch_history(repo.clone(), main.clone()).expect("history should read");
        assert!(main_history.route.is_none());

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn get_branch_history_draws_the_way_back_of_a_merged_branch() {
        let (repo, remote, main) = published_repo_and_remote("branch-route-merged");
        let run = |args: &[&str]| {
            let status = git_command(&repo).args(args).status().expect("run git");
            assert!(status.success(), "git {args:?} should succeed");
        };
        run(&["remote", "set-head", "origin", &main]);
        run(&["switch", "-q", "-c", "feature"]);
        write_and_commit(&repo, "b.txt", "one\n", "feature one");
        write_and_commit(&repo, "b.txt", "two\n", "feature two");
        run(&["switch", "-q", &main]);
        write_and_commit(&repo, "c.txt", "main\n", "main before");
        run(&[
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "merge",
            "-q",
            "--no-ff",
            "-m",
            "bring feature in",
            "feature",
        ]);
        write_and_commit(&repo, "d.txt", "after\n", "main after");

        let history =
            get_branch_history(repo.clone(), "feature".to_string()).expect("history should read");
        let route = history.route.expect("a merged branch has a route");
        assert_eq!(route.own_count, 2);
        assert_eq!(route.base_count, 1);
        assert_eq!(route.base_versions[0].subject, "main before");
        let merge = route.merge.expect("it came back by a merge");
        assert_eq!(merge.after_count, 1);
        assert_eq!(merge.after_versions[0].subject, "main after");
        let merged = git_command(&repo)
            .args(["rev-parse", &format!("{main}~1")])
            .output()
            .expect("read the merge");
        assert_eq!(merge.commit, String::from_utf8_lossy(&merged.stdout).trim());

        // Fast-forwarded into the main branch, a branch never left it: a mark.
        run(&["switch", "-q", "-c", "quick"]);
        write_and_commit(&repo, "e.txt", "quick\n", "quick fix");
        run(&["switch", "-q", &main]);
        run(&["merge", "-q", "--ff-only", "quick"]);
        let quick = get_branch_history(repo.clone(), "quick".to_string())
            .expect("history should read")
            .route
            .expect("a branch on the main branch has a route");
        assert_eq!(quick.own_count, 0);
        assert!(quick.merge.is_none());

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn get_branch_history_sees_a_branch_squashed_or_rebased_into_the_main_branch() {
        let (repo, remote, main) = published_repo_and_remote("branch-route-copied");
        let run = |args: &[&str]| {
            let status = git_command(&repo).args(args).status().expect("run git");
            assert!(status.success(), "git {args:?} should succeed");
        };
        let commit_as = |args: &[&str]| {
            let mut full = vec![
                "-c",
                "user.name=GitOdile Test",
                "-c",
                "user.email=test@gitodile.local",
            ];
            full.extend_from_slice(args);
            run(&full);
        };
        run(&["remote", "set-head", "origin", &main]);

        // Squashed: two versions on the branch, one copy of their whole change
        // on the main branch, which then moves on.
        run(&["switch", "-q", "-c", "squashed"]);
        write_and_commit(&repo, "s.txt", "one\n", "squashed one");
        write_and_commit(&repo, "s.txt", "two\n", "squashed two");
        run(&["switch", "-q", &main]);
        write_and_commit(&repo, "m.txt", "main\n", "main meanwhile");
        commit_as(&["merge", "-q", "--squash", "squashed"]);
        commit_as(&["commit", "-q", "-m", "squashed in"]);
        write_and_commit(&repo, "n.txt", "after\n", "main after");

        let route = get_branch_history(repo.clone(), "squashed".to_string())
            .expect("history should read")
            .route
            .expect("a branch off the main branch has a route");
        assert_eq!(route.own_count, 2);
        assert_eq!(route.base_count, 1);
        assert_eq!(route.base_versions[0].subject, "main meanwhile");
        let merge = route.merge.expect("its work came back as a copy");
        assert_eq!(merge.kind, MergeKind::Squash);
        assert_eq!(merge.after_count, 1);
        assert_eq!(merge.after_versions[0].subject, "main after");

        // Rebased: each version copied onto the main branch one by one.
        run(&["switch", "-q", "-c", "rebased", &format!("{main}~3")]);
        write_and_commit(&repo, "r.txt", "one\n", "rebased one");
        write_and_commit(&repo, "r2.txt", "two\n", "rebased two");
        run(&["switch", "-q", &main]);
        commit_as(&["cherry-pick", "rebased~1", "rebased"]);
        let merge = get_branch_history(repo.clone(), "rebased".to_string())
            .expect("history should read")
            .route
            .expect("a branch off the main branch has a route")
            .merge
            .expect("its work came back as copies");
        assert_eq!(merge.kind, MergeKind::Rebase);
        assert_eq!(merge.after_count, 0);

        // Still away: a change the main branch does not have.
        run(&["switch", "-q", "-c", "away"]);
        write_and_commit(&repo, "a.txt", "away\n", "only here");
        run(&["switch", "-q", &main]);
        let away = get_branch_history(repo.clone(), "away".to_string())
            .expect("history should read")
            .route
            .expect("a branch off the main branch has a route");
        assert!(away.merge.is_none());

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn delete_branch_keeps_a_recovery_point_for_a_branch_squashed_into_main() {
        let (repo, remote, main) = published_repo_and_remote("branch-delete-squashed");
        let run = |args: &[&str]| {
            let status = git_command(&repo).args(args).status().expect("run git");
            assert!(status.success(), "git {args:?} should succeed");
        };
        let commit_as = |args: &[&str]| {
            let mut full = vec![
                "-c",
                "user.name=GitOdile Test",
                "-c",
                "user.email=test@gitodile.local",
            ];
            full.extend_from_slice(args);
            run(&full);
        };
        run(&["remote", "set-head", "origin", &main]);
        run(&["switch", "-q", "-c", "squashed"]);
        write_and_commit(&repo, "s.txt", "one\n", "squashed one");
        write_and_commit(&repo, "s.txt", "two\n", "squashed two");
        let tip = commit_at(&repo, "squashed");
        run(&["switch", "-q", &main]);
        commit_as(&["merge", "-q", "--squash", "squashed"]);
        commit_as(&["commit", "-q", "-m", "squashed in"]);

        // A branch whose work is only on itself stays refused.
        run(&["switch", "-q", "-c", "unique"]);
        write_and_commit(&repo, "u.txt", "only\n", "only here");
        run(&["switch", "-q", &main]);
        let refused = plan_delete_branch(repo.clone(), "unique".to_string())
            .expect_err("unique work is not deletable");
        assert_eq!(refused.code, AppErrorCode::BranchUniqueWork);

        // The squashed branch is offered, with a recovery point in the plan.
        let plan = plan_delete_branch(repo.clone(), "squashed".to_string())
            .expect("a squashed branch can be deleted");
        let copy = plan
            .copied_into
            .clone()
            .expect("its work is on main as a copy");
        assert_eq!(copy.kind, MergeKind::Squash);
        assert_eq!(copy.base, main);
        assert!(plan.retained_by.is_empty());
        assert!(plan.recovery_point.is_some());

        let result = delete_branch(
            repo.clone(),
            "squashed".to_string(),
            false,
            plan.state_token.clone(),
        )
        .expect("the delete should succeed");
        assert!(!result
            .snapshot
            .branches
            .iter()
            .any(|branch| branch.name == "squashed"));
        // The originals are kept, by a hidden ref that resolves to the old tip.
        let reference = result
            .recovery_reference
            .expect("a recovery point was kept");
        assert!(reference.starts_with("refs/gitodile/recovery/v1/delete-branch/"));
        assert_eq!(commit_at(&repo, &reference), tip);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn get_branches_counts_each_branches_own_versions_against_the_main_branch() {
        let (repo, remote, main) = published_repo_and_remote("branch-count-main");
        let status = git_command(&repo)
            .args(["remote", "set-head", "origin", &main])
            .status()
            .expect("run git remote set-head");
        assert!(status.success());
        let run = |args: &[&str]| {
            let status = git_command(&repo).args(args).status().expect("run git");
            assert!(status.success(), "git {args:?} should succeed");
        };
        run(&["switch", "-q", "-c", "feature"]);
        write_and_commit(&repo, "b.txt", "one\n", "feature one");
        write_and_commit(&repo, "b.txt", "two\n", "feature two");
        run(&["switch", "-q", "-c", "feature-child"]);
        write_and_commit(&repo, "c.txt", "child\n", "child one");
        // Standing on `feature`: against the active branch the child would have
        // one version of its own; against the main branch it has three.
        run(&["switch", "-q", "feature"]);

        let snapshot = get_branches(repo.clone()).expect("discovery should succeed");
        let count = |name: &str| {
            snapshot
                .branches
                .iter()
                .find(|branch| branch.name == name)
                .expect("branch listed")
                .unique_commit_count
        };
        assert_eq!(count("feature-child"), Some(3));
        // The active branch is counted too, against the same main branch.
        assert_eq!(count("feature"), Some(2));
        // The main branch is what the others are counted against.
        assert_eq!(count(&main), None);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn get_branch_history_has_no_route_without_a_main_branch() {
        let path = unique_temp_dir("branch-route-none");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["branch", "feature"])
            .status()
            .expect("run git branch feature");
        assert!(status.success());

        // No remote, so no main branch — and nothing is drawn on a guess.
        let history =
            get_branch_history(path.clone(), "feature".to_string()).expect("history should read");
        assert!(history.route.is_none());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn parse_upstream_track_reads_ahead_behind_and_gone() {
        assert!(matches!(
            parse_upstream_track(""),
            UpstreamTrack {
                ahead: 0,
                behind: 0,
                gone: false
            }
        ));
        assert!(matches!(
            parse_upstream_track("[ahead 3]"),
            UpstreamTrack {
                ahead: 3,
                behind: 0,
                gone: false
            }
        ));
        assert!(matches!(
            parse_upstream_track("[behind 2]"),
            UpstreamTrack {
                ahead: 0,
                behind: 2,
                gone: false
            }
        ));
        assert!(matches!(
            parse_upstream_track("[ahead 2, behind 1]"),
            UpstreamTrack {
                ahead: 2,
                behind: 1,
                gone: false
            }
        ));
        assert!(matches!(
            parse_upstream_track("[gone]"),
            UpstreamTrack {
                ahead: 0,
                behind: 0,
                gone: true
            }
        ));
    }

    #[test]
    fn parse_branch_refs_ignores_a_malformed_record() {
        let text = b"not-a-ref-branch-at-all\nrefs/heads/main\0abc\0ab\0subject\0date\0\n";
        let branches = parse_branch_refs(text).branches;
        assert_eq!(branches.len(), 1);
        assert_eq!(branches[0].name, "main");
    }

    #[test]
    fn parse_branch_refs_skips_a_non_utf8_name_without_lossy_replacement() {
        // One unrepresentable name must not cost the user the rest of the
        // inventory, and must never be shown as a name that does not exist:
        // every mutation is keyed by the exact bytes.
        let bytes = b"refs/heads/feature-\xff\0abc\0ab\0subject\0date\0\nrefs/heads/main\0def\0de\0ok\0date\0\n";
        let parsed = parse_branch_refs(bytes);
        assert_eq!(parsed.unreadable_count, 1);
        assert_eq!(parsed.branches.len(), 1);
        assert_eq!(parsed.branches[0].name, "main");
        assert!(
            !parsed
                .branches
                .iter()
                .any(|branch| branch.name.contains(char::REPLACEMENT_CHARACTER)),
            "a skipped name must never reappear as replacement characters"
        );
    }

    #[test]
    fn compute_branch_state_token_is_stable_then_changes_with_status() {
        let first = compute_branch_state_token(
            Some("abc"),
            Some("main"),
            "clean:true|total:0|",
            "switch:main->feature@def",
        );
        let same = compute_branch_state_token(
            Some("abc"),
            Some("main"),
            "clean:true|total:0|",
            "switch:main->feature@def",
        );
        assert_eq!(first, same);

        let after_dirty = compute_branch_state_token(
            Some("abc"),
            Some("main"),
            "clean:false|total:1|",
            "switch:main->feature@def",
        );
        assert_ne!(first, after_dirty);

        let after_head_moved = compute_branch_state_token(
            Some("zzz"),
            Some("main"),
            "clean:true|total:0|",
            "switch:main->feature@def",
        );
        assert_ne!(first, after_head_moved);
    }

    fn write_and_commit(path: &str, name: &str, contents: &str, message: &str) {
        write_file(path, name, contents);
        git_add_all(path);
        git_commit(path, message);
    }

    #[test]
    fn get_branches_reports_active_and_other_branches_with_reachability() {
        let path = unique_temp_dir("branch-discovery");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");

        let current = current_branch(&path);
        let status = git_command(&path)
            .args(["branch", "feature"])
            .status()
            .expect("run git branch feature");
        assert!(status.success());
        assert!(git_command(&path)
            .args(["tag", &current])
            .status()
            .unwrap()
            .success());

        let snapshot = get_branches(path.clone()).expect("discovery should succeed");
        assert_eq!(snapshot.branch, Some(current));
        assert_eq!(snapshot.branches.len(), 2);
        let active = snapshot
            .branches
            .iter()
            .find(|branch| branch.is_active)
            .unwrap();
        assert_eq!(active.name, snapshot.branch.clone().unwrap());
        let feature = snapshot
            .branches
            .iter()
            .find(|branch| branch.name == "feature")
            .unwrap();
        // "feature" points at the very same commit as the active branch, so
        // it must be reported as already retained elsewhere.
        assert!(feature.is_retained_elsewhere);
        assert!(!feature.is_active);
        assert!(feature.worktree_path.is_none());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn get_branches_flags_a_branch_checked_out_in_a_linked_worktree() {
        let path = unique_temp_dir("branch-worktree");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let branch = current_branch(&path);

        let worktree = Path::new(&path).join("linked");
        let status = git_command(&path)
            .args(["worktree", "add", "-q", "-b", "linked-branch"])
            .arg(&worktree)
            .status()
            .expect("run git worktree add");
        assert!(status.success());

        let snapshot = get_branches(path.clone()).expect("discovery should succeed");
        let linked = snapshot
            .branches
            .iter()
            .find(|branch| branch.name == "linked-branch")
            .unwrap();
        assert!(linked.worktree_path.is_some());
        let active = snapshot
            .branches
            .iter()
            .find(|candidate| candidate.name == branch)
            .unwrap();
        assert!(active.is_active);
        assert!(active.worktree_path.is_none());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn get_branches_reports_upstream_ahead_and_behind_after_diverging() {
        let (repo, remote, branch_name) = published_repo_and_remote("branch-track");

        let synced = get_branches(repo.clone()).expect("discovery should succeed");
        let branch = synced
            .branches
            .iter()
            .find(|candidate| candidate.name == branch_name)
            .unwrap();
        assert_eq!(branch.upstream_ahead, Some(0));
        assert_eq!(branch.upstream_behind, Some(0));
        assert!(!branch.upstream_gone);

        // repo gets an unpublished commit of its own...
        write_and_commit(&repo, "local.txt", "mine\n", "local only");

        // ...while a second clone publishes one the repo has never fetched.
        let other = unique_temp_dir("branch-track-other");
        let clone_status = base_git_command()
            .args(["clone", "-q", &remote, &other])
            .status()
            .expect("run git clone");
        assert!(clone_status.success());
        write_and_commit(&other, "theirs.txt", "theirs\n", "from the other clone");
        let push_status = git_command(&other)
            .args(["push", "-q", "origin", &branch_name])
            .status()
            .expect("run git push from the other clone");
        assert!(push_status.success());

        // Ahead/behind reads the locally known remote-tracking ref, so it
        // only reflects the second clone's push once repo fetches it.
        let fetch_status = git_command(&repo)
            .args(["fetch", "-q", "origin"])
            .status()
            .expect("run git fetch");
        assert!(fetch_status.success());

        let diverged = get_branches(repo.clone()).expect("discovery should succeed");
        let branch = diverged
            .branches
            .iter()
            .find(|candidate| candidate.name == branch_name)
            .unwrap();
        assert_eq!(branch.upstream_ahead, Some(1));
        assert_eq!(branch.upstream_behind, Some(1));
        assert!(!branch.upstream_gone);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
        let _ = fs::remove_dir_all(&other);
    }

    #[test]
    fn get_branches_reports_upstream_gone_after_the_remote_branch_is_deleted() {
        let (repo, remote, branch) = published_repo_and_remote("branch-track-gone");

        // The bare remote's HEAD still points at the branch this test is
        // about to delete, which Git refuses by default ("deletion of the
        // current branch prohibited"). There is no other branch to point it
        // at instead, so silence the guard the same way a real remote's
        // "delete branch" button does.
        let allow_delete_current = git_command(&remote)
            .args(["config", "receive.denyDeleteCurrent", "ignore"])
            .status()
            .expect("run git config receive.denyDeleteCurrent");
        assert!(allow_delete_current.success());

        let delete_status = git_command(&repo)
            .args(["push", "-q", "origin", "--delete", &branch])
            .status()
            .expect("run git push --delete");
        assert!(delete_status.success());
        let prune_status = git_command(&repo)
            .args(["fetch", "-q", "--prune", "origin"])
            .status()
            .expect("run git fetch --prune");
        assert!(prune_status.success());

        let snapshot = get_branches(repo.clone()).expect("discovery should succeed");
        let branch = snapshot
            .branches
            .iter()
            .find(|candidate| candidate.name == branch)
            .unwrap();
        // The upstream config still points at the deleted ref — that is
        // exactly the state worth flagging, so it must not disappear.
        assert!(branch.upstream.is_some());
        assert!(branch.upstream_gone);

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn create_branch_defaults_to_create_and_switch() {
        let path = unique_temp_dir("branch-create-switch");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let original_head = git_stdout(&test_git(&path, &["rev-parse", "HEAD"]).unwrap());

        let plan = plan_create_branch(path.clone(), "feature-x".to_string(), true, None)
            .expect("plan should succeed");
        assert!(plan.will_switch);
        assert!(plan.requires_confirmation);
        assert_eq!(plan.operation_kind, OperationKind::LocalMutation);

        let snapshot = create_branch(
            path.clone(),
            "feature-x".to_string(),
            true,
            None,
            plan.state_token,
        )
        .expect("create should succeed");
        assert_eq!(snapshot.branch.as_deref(), Some("feature-x"));
        assert_eq!(
            git_stdout(&test_git(&path, &["rev-parse", "HEAD"]).unwrap()),
            original_head,
            "creating a branch at the current commit must not move HEAD's target"
        );

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_branch_without_switching_stays_on_the_original_branch() {
        let path = unique_temp_dir("branch-create-no-switch");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let original_branch = current_branch(&path);

        let plan = plan_create_branch(path.clone(), "feature-y".to_string(), false, None)
            .expect("plan should succeed");
        assert!(!plan.will_switch);

        create_branch(
            path.clone(),
            "feature-y".to_string(),
            false,
            None,
            plan.state_token,
        )
        .expect("create should succeed");
        assert_eq!(current_branch(&path), original_branch);
        let branches = in_test_frame(|| list_branch_names(&path)).unwrap();
        assert!(branches.contains(&"feature-y".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_branch_preserves_unsaved_and_untracked_work() {
        let path = unique_temp_dir("branch-create-dirty");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        write_file(&path, "a.txt", "one\nmodified\n");
        write_file(&path, "new.txt", "untracked\n");

        let plan = plan_create_branch(path.clone(), "carrying-work".to_string(), true, None)
            .expect("plan should succeed");
        assert!(plan.has_unsaved_work);

        create_branch(
            path.clone(),
            "carrying-work".to_string(),
            true,
            None,
            plan.state_token,
        )
        .expect("create should succeed");

        assert_eq!(
            fs::read_to_string(Path::new(&path).join("a.txt")).unwrap(),
            "one\nmodified\n"
        );
        assert_eq!(
            fs::read_to_string(Path::new(&path).join("new.txt")).unwrap(),
            "untracked\n"
        );
        let status = read_working_tree_status(path.clone()).unwrap();
        assert!(!status.is_clean);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_branch_recovers_a_detached_head() {
        let path = unique_temp_dir("branch-create-detached");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let commit = git_stdout(&test_git(&path, &["rev-parse", "HEAD"]).unwrap());
        let status = git_command(&path)
            .args(["checkout", "-q", &commit])
            .status()
            .expect("detach HEAD");
        assert!(status.success());

        let plan = plan_create_branch(path.clone(), "recovered".to_string(), false, None)
            .expect("plan should succeed even without an explicit switch request");
        assert!(
            plan.will_switch,
            "detached HEAD must force create-and-switch"
        );

        create_branch(
            path.clone(),
            "recovered".to_string(),
            false,
            None,
            plan.state_token,
        )
        .expect("create should succeed");
        assert_eq!(current_branch(&path), "recovered");
        assert_eq!(
            git_stdout(&test_git(&path, &["rev-parse", "HEAD"]).unwrap()),
            commit
        );

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_branch_rejects_an_unborn_branch() {
        let path = unique_temp_dir("branch-create-unborn");
        git_init(&path);

        let error = plan_create_branch(path.clone(), "too-soon".to_string(), true, None)
            .expect_err("an unborn branch has nothing to branch from yet");
        assert_eq!(error.code, AppErrorCode::UnbornBranchNoVersion);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_branch_rejects_a_duplicate_name() {
        let path = unique_temp_dir("branch-create-dup");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let branch = current_branch(&path);

        let error = plan_create_branch(path.clone(), branch, true, None)
            .expect_err("the current branch's own name must be rejected as a duplicate");
        assert_eq!(error.code, AppErrorCode::BranchNameTaken);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_branch_rejects_a_case_only_collision() {
        let path = unique_temp_dir("branch-create-case");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["branch", "Feature-Z"])
            .status()
            .expect("run git branch");
        assert!(status.success());

        let error = plan_create_branch(path.clone(), "feature-z".to_string(), false, None)
            .expect_err("a case-only collision must be rejected before mutation");
        assert_eq!(error.code, AppErrorCode::BranchNameCollides);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_branch_rejects_a_stale_state_token() {
        let path = unique_temp_dir("branch-create-stale");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");

        let plan = plan_create_branch(path.clone(), "feature-stale".to_string(), false, None)
            .expect("plan should succeed");
        write_file(&path, "b.txt", "changed after preview\n");

        let error = create_branch(
            path.clone(),
            "feature-stale".to_string(),
            false,
            None,
            plan.state_token,
        )
        .expect_err("a state change after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleBranchPlan);
        assert!(!in_test_frame(|| list_branch_names(&path))
            .unwrap()
            .contains(&"feature-stale".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_branch_rejects_changed_content_with_the_same_status_shape() {
        let path = unique_temp_dir("branch-create-stale-content");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        write_file(&path, "pending.txt", "before preview\n");

        let plan = plan_create_branch(
            path.clone(),
            "feature-stale-content".to_string(),
            true,
            None,
        )
        .expect("plan should succeed with ordinary unsaved work");
        // The file remains untracked before and after, so the old status-only
        // token was identical even though the confirmed bytes had changed.
        write_file(&path, "pending.txt", "after preview\n");

        let error = create_branch(
            path.clone(),
            "feature-stale-content".to_string(),
            true,
            None,
            plan.state_token,
        )
        .expect_err("content drift after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleBranchPlan);
        assert!(!in_test_frame(|| list_branch_names(&path))
            .unwrap()
            .contains(&"feature-stale-content".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_branch_rejects_changed_staged_content_with_the_same_worktree() {
        let path = unique_temp_dir("branch-create-stale-index");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        write_file(&path, "a.txt", "staged before preview\n");
        git_add(&path, "a.txt");
        write_file(&path, "a.txt", "same final worktree\n");

        let plan = plan_create_branch(path.clone(), "feature-stale-index".to_string(), true, None)
            .expect("plan should capture both index and worktree content");
        write_file(&path, "a.txt", "different staged content\n");
        git_add(&path, "a.txt");
        write_file(&path, "a.txt", "same final worktree\n");

        let error = create_branch(
            path.clone(),
            "feature-stale-index".to_string(),
            true,
            None,
            plan.state_token,
        )
        .expect_err("staged-content drift must stop execution even when the worktree matches");
        assert_eq!(error.code, AppErrorCode::StaleBranchPlan);

        let _ = fs::remove_dir_all(&path);
    }

    fn make_two_branch_repo(label: &str) -> (String, String, String) {
        let path = unique_temp_dir(label);
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let from_branch = current_branch(&path);
        let status = git_command(&path)
            .args(["switch", "-c", "target-branch"])
            .status()
            .expect("run git switch -c");
        assert!(status.success());
        write_and_commit(&path, "b.txt", "two\n", "second");
        let status = git_command(&path)
            .args(["switch", &from_branch])
            .status()
            .expect("run git switch back");
        assert!(status.success());
        (path, from_branch, "target-branch".to_string())
    }

    #[test]
    fn switch_branch_moves_between_two_clean_branches() {
        let (path, from_branch, target) = make_two_branch_repo("branch-switch-clean");

        let plan = plan_switch_branch(path.clone(), target.clone())
            .expect("plan should succeed for a clean project");
        assert_eq!(plan.from, from_branch);
        assert_eq!(plan.to, target);
        assert_eq!(plan.changed_files, vec!["b.txt".to_string()]);
        assert!(plan.requires_confirmation);

        switch_branch(path.clone(), target.clone(), plan.state_token)
            .expect("switch should succeed");
        assert_eq!(current_branch(&path), target);
        assert!(Path::new(&path).join("b.txt").exists());

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn switch_branch_blocks_on_unsaved_work() {
        let (path, _from_branch, target) = make_two_branch_repo("branch-switch-dirty");
        write_file(&path, "uncommitted.txt", "oops\n");

        let error = plan_switch_branch(path.clone(), target)
            .expect_err("unsaved work must block switching to an existing branch");
        assert_eq!(error.code, AppErrorCode::DirtyWorkingTree);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn switch_branch_blocks_a_branch_checked_out_in_another_worktree() {
        let (path, _from_branch, target) = make_two_branch_repo("branch-switch-worktree");
        // Sibling of the repo, not nested inside it — a worktree created
        // inside the repo root would itself show up as an untracked
        // directory in the main worktree's own status.
        let mut worktree = crate::test_support::test_temp_root().to_path_buf();
        worktree.push(format!(
            "gitodile-test-vl-switch-worktree-linked-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&worktree);
        let status = git_command(&path)
            .args([
                "worktree",
                "add",
                "-q",
                &worktree.to_string_lossy(),
                &target,
            ])
            .status()
            .expect("run git worktree add");
        assert!(status.success());

        let error = plan_switch_branch(path.clone(), target)
            .expect_err("a branch checked out elsewhere must not be switchable here");
        assert_eq!(error.code, AppErrorCode::BranchCheckedOutElsewhere);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_dir_all(&worktree);
    }

    #[test]
    fn switch_branch_rejects_a_stale_state_token() {
        let (path, _from_branch, target) = make_two_branch_repo("branch-switch-stale");
        let plan = plan_switch_branch(path.clone(), target.clone()).expect("plan should succeed");

        // Something changes the project between preview and execution.
        write_and_commit(&path, "c.txt", "three\n", "third");

        let error = switch_branch(path.clone(), target, plan.state_token)
            .expect_err("a state change after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleBranchPlan);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_branch_removes_a_fully_retained_branch() {
        let path = unique_temp_dir("branch-delete-retained");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["branch", "mergeable"])
            .status()
            .expect("run git branch");
        assert!(status.success());

        let plan = plan_delete_branch(path.clone(), "mergeable".to_string())
            .expect("a branch identical to a retained ref must be deletable");
        assert!(!plan.retained_by.is_empty());
        assert_eq!(plan.operation_kind, OperationKind::Destructive);

        delete_branch(
            path.clone(),
            "mergeable".to_string(),
            false,
            plan.state_token,
        )
        .expect("delete should succeed");
        assert!(!in_test_frame(|| list_branch_names(&path))
            .unwrap()
            .contains(&"mergeable".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_branch_blocks_the_active_branch() {
        let path = unique_temp_dir("branch-delete-active");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let branch = current_branch(&path);

        let error = plan_delete_branch(path.clone(), branch)
            .expect_err("the active branch can never be deleted");
        assert_eq!(error.code, AppErrorCode::BranchIsActive);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_branch_blocks_unique_unretained_work() {
        let path = unique_temp_dir("branch-delete-unique");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["switch", "-c", "unique-work"])
            .status()
            .expect("run git switch -c");
        assert!(status.success());
        write_and_commit(&path, "only-here.txt", "unique\n", "unique commit");
        let status = git_command(&path)
            .args(["switch", "-"])
            .status()
            .expect("run git switch -");
        assert!(status.success());

        let error = plan_delete_branch(path.clone(), "unique-work".to_string())
            .expect_err("a branch with unreachable unique work must not be deletable");
        assert_eq!(error.code, AppErrorCode::BranchUniqueWork);
        assert!(in_test_frame(|| list_branch_names(&path))
            .unwrap()
            .contains(&"unique-work".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_branch_blocks_a_branch_checked_out_elsewhere() {
        let path = unique_temp_dir("branch-delete-worktree");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let worktree = Path::new(&path).join("linked");
        let status = git_command(&path)
            .args([
                "worktree",
                "add",
                "-q",
                &worktree.to_string_lossy(),
                "-b",
                "elsewhere",
            ])
            .status()
            .expect("run git worktree add");
        assert!(status.success());

        let error = plan_delete_branch(path.clone(), "elsewhere".to_string())
            .expect_err("a branch checked out in another worktree must not be deletable here");
        assert_eq!(error.code, AppErrorCode::BranchCheckedOutElsewhere);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn delete_branch_rejects_a_stale_state_token() {
        let path = unique_temp_dir("branch-delete-stale");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let status = git_command(&path)
            .args(["branch", "goes-away"])
            .status()
            .expect("run git branch");
        assert!(status.success());

        let plan =
            plan_delete_branch(path.clone(), "goes-away".to_string()).expect("plan should succeed");
        // Left uncommitted on purpose: a fresh commit alone would leave the
        // tree clean again and wouldn't move the state token, since the
        // token's status fingerprint only reflects working-tree drift.
        write_file(&path, "c.txt", "uncommitted change after preview\n");

        let error = delete_branch(
            path.clone(),
            "goes-away".to_string(),
            false,
            plan.state_token,
        )
        .expect_err("a state change after preview must stop execution");
        assert_eq!(error.code, AppErrorCode::StaleBranchPlan);
        assert!(in_test_frame(|| list_branch_names(&path))
            .unwrap()
            .contains(&"goes-away".to_string()));

        let _ = fs::remove_dir_all(&path);
    }

    fn commit_at(path: &str, revision: &str) -> String {
        git_stdout(
            &git_command(path)
                .args(["rev-parse", "--verify", revision])
                .output()
                .expect("run git rev-parse"),
        )
    }

    #[test]
    fn create_branch_can_start_at_a_chosen_saved_version() {
        let path = unique_temp_dir("branch-create-from-version");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let first = commit_at(&path, "HEAD");
        write_and_commit(&path, "a.txt", "one\ntwo\n", "second");
        let second = commit_at(&path, "HEAD");
        let original_branch = current_branch(&path);

        let plan = plan_create_branch(
            path.clone(),
            "from-first".to_string(),
            false,
            Some(first.clone()),
        )
        .expect("plan should succeed");
        assert!(plan.from_saved_version);
        assert_eq!(plan.starting_commit.as_deref(), Some(first.as_str()));
        assert!(!plan.will_switch);

        create_branch(
            path.clone(),
            "from-first".to_string(),
            false,
            Some(first.clone()),
            plan.state_token,
        )
        .expect("create should succeed");

        // The branch starts where it was told to, and the project has not moved.
        assert_eq!(commit_at(&path, "refs/heads/from-first"), first);
        assert_eq!(current_branch(&path), original_branch);
        assert_eq!(commit_at(&path, "HEAD"), second);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_branch_from_a_version_switches_only_when_asked() {
        let path = unique_temp_dir("branch-create-from-version-switch");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let first = commit_at(&path, "HEAD");
        write_and_commit(&path, "a.txt", "one\ntwo\n", "second");

        let plan = plan_create_branch(
            path.clone(),
            "moved-back".to_string(),
            true,
            Some(first.clone()),
        )
        .expect("plan should succeed");
        assert!(plan.will_switch);

        create_branch(
            path.clone(),
            "moved-back".to_string(),
            true,
            Some(first.clone()),
            plan.state_token,
        )
        .expect("create should succeed");
        assert_eq!(current_branch(&path), "moved-back");
        assert_eq!(commit_at(&path, "HEAD"), first);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn a_detached_head_is_not_recovered_by_a_branch_starting_somewhere_else() {
        let path = unique_temp_dir("branch-create-from-version-detached");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let first = commit_at(&path, "HEAD");
        write_and_commit(&path, "a.txt", "one\ntwo\n", "second");
        let second = commit_at(&path, "HEAD");
        assert!(git_command(&path)
            .args(["switch", "-q", "--detach", &second])
            .status()
            .unwrap()
            .success());

        // Creating a branch at the current commit still recovers the detached
        // HEAD by switching onto it...
        let here = plan_create_branch(path.clone(), "recovered".to_string(), false, None)
            .expect("plan should succeed");
        assert!(here.will_switch);

        // ...but a branch rooted at an older version is not a recovery, and
        // switching to it would move the working tree away unasked.
        let elsewhere = plan_create_branch(
            path.clone(),
            "elsewhere".to_string(),
            false,
            Some(first.clone()),
        )
        .expect("plan should succeed");
        assert!(!elsewhere.will_switch);
        assert_eq!(elsewhere.starting_commit.as_deref(), Some(first.as_str()));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn create_branch_refuses_a_starting_point_it_cannot_verify() {
        let path = unique_temp_dir("branch-create-from-bad-version");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");

        // A revision expression is not a saved version: only a full object id
        // this project actually holds is accepted.
        for candidate in ["HEAD~1", "main", "not-a-commit"] {
            let error = plan_create_branch(
                path.clone(),
                "nope".to_string(),
                false,
                Some(candidate.to_string()),
            )
            .expect_err("an unverifiable starting point should be refused");
            assert_eq!(error.code, AppErrorCode::InvalidSelection);
        }

        let missing = "0".repeat(40);
        let error = plan_create_branch(path.clone(), "nope".to_string(), false, Some(missing))
            .expect_err("a commit this project does not have should be refused");
        assert_eq!(error.code, AppErrorCode::InvalidSelection);

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn creating_from_a_version_rejects_a_state_token_from_another_starting_point() {
        let path = unique_temp_dir("branch-create-from-version-stale");
        git_init(&path);
        write_and_commit(&path, "a.txt", "one\n", "first");
        let first = commit_at(&path, "HEAD");
        write_and_commit(&path, "a.txt", "one\ntwo\n", "second");
        let second = commit_at(&path, "HEAD");

        let plan = plan_create_branch(path.clone(), "swapped".to_string(), false, Some(first))
            .expect("plan should succeed");

        // The token covers the starting point, so a preview of one version
        // cannot be executed against another.
        let error = create_branch(
            path.clone(),
            "swapped".to_string(),
            false,
            Some(second),
            plan.state_token,
        )
        .expect_err("a plan for another starting point should be refused");
        assert_eq!(error.code, AppErrorCode::StaleBranchPlan);

        let _ = fs::remove_dir_all(&path);
    }

    // ---- Clean up several branches at once ----

    fn run_ok(path: &str, args: &[&str]) {
        let status = git_command(path).args(args).status().expect("run git");
        assert!(status.success(), "git {args:?} should succeed");
    }

    fn requests(plan: &CleanUpBranchesPlan) -> Vec<CleanUpBranchRequest> {
        plan.branches
            .iter()
            .map(|branch| CleanUpBranchRequest {
                name: branch.name.clone(),
                state_token: branch.state_token.clone(),
            })
            .collect()
    }

    fn outcome_of<'a>(result: &'a CleanUpBranchesResult, name: &str) -> &'a CleanUpBranchResult {
        result
            .branches
            .iter()
            .find(|branch| branch.name == name)
            .unwrap_or_else(|| panic!("{name} should be reported"))
    }

    #[test]
    fn clean_up_names_refuse_empty_duplicate_unusable_and_oversized_selections() {
        let code = |names: &[&str]| {
            guard_clean_up_names(names.iter().copied())
                .expect_err("selection should be refused")
                .code
        };
        assert_eq!(code(&[]), AppErrorCode::InvalidSelection);
        assert_eq!(code(&["a", "b", "a"]), AppErrorCode::InvalidSelection);
        assert_eq!(code(&["--force"]), AppErrorCode::InvalidSelection);
        assert_eq!(code(&[""]), AppErrorCode::InvalidSelection);
        let many: Vec<String> = (0..=MAX_CLEAN_UP_BRANCHES)
            .map(|n| format!("l{n}"))
            .collect();
        assert!(guard_clean_up_names(many.iter().map(String::as_str)).is_err());
        assert!(
            guard_clean_up_names(many[..MAX_CLEAN_UP_BRANCHES].iter().map(String::as_str)).is_ok()
        );
    }

    #[test]
    fn clean_up_branch_token_moves_with_tip_and_published_copy_only() {
        let published = PublishedBranch {
            remote: "origin".to_string(),
            branch: "a".to_string(),
            short_name: "origin/a".to_string(),
        };
        let base = clean_up_branch_token("a", "abc", None);
        assert_eq!(base, clean_up_branch_token("a", "abc", None));
        assert_ne!(base, clean_up_branch_token("a", "abd", None));
        assert_ne!(base, clean_up_branch_token("b", "abc", None));
        assert_ne!(base, clean_up_branch_token("a", "abc", Some(&published)));
    }

    #[test]
    fn parse_porcelain_push_line_reads_deleted_and_rejected_refs() {
        assert_eq!(
            parse_porcelain_push_line("-\t:refs/heads/done\t[deleted]"),
            Some(("refs/heads/done", Ok(())))
        );
        assert_eq!(
            parse_porcelain_push_line(
                "!\t:refs/heads/kept\t[remote rejected] (deletion prohibited)"
            ),
            Some((
                "refs/heads/kept",
                Err("[remote rejected] (deletion prohibited)")
            ))
        );
        assert_eq!(parse_porcelain_push_line("To /tmp/remote"), None);
        assert_eq!(parse_porcelain_push_line("Done"), None);
    }

    /// A project with a remote whose default is its main branch, which is how
    /// GitOdile knows the main branch at all.
    fn repo_with_main_branch(label: &str) -> (String, String, String) {
        let (repo, remote, main) = published_repo_and_remote(label);
        run_ok(&repo, &["remote", "set-head", "origin", &main]);
        (repo, remote, main)
    }

    /// A branch with work of its own, merged back into the main branch with a
    /// merge version: finished. Returns its tip.
    fn finish_branch(path: &str, main: &str, name: &str) -> String {
        run_ok(path, &["switch", "-q", "-c", name, main]);
        let file = format!("{}.txt", name.replace('/', "-"));
        write_and_commit(
            path,
            &file,
            "done
",
            &format!("work on {name}"),
        );
        let tip = commit_at(path, "HEAD");
        run_ok(path, &["switch", "-q", main]);
        run_ok(
            path,
            &[
                "-c",
                "user.name=GitOdile Test",
                "-c",
                "user.email=test@gitodile.local",
                "merge",
                "-q",
                "--no-ff",
                "-m",
                &format!("merge {name}"),
                name,
            ],
        );
        tip
    }

    #[test]
    fn clean_up_deletes_every_retained_branch_and_keeps_a_recovery_point_for_each() {
        let (path, remote, main) = repo_with_main_branch("branch-clean-up-all");
        let mut tips = std::collections::HashMap::new();
        for name in ["fix/one", "fix/two", "feature/three"] {
            tips.insert(name, finish_branch(&path, &main, name));
        }
        run_ok(&path, &["switch", "-q", "-c", "unique"]);
        write_and_commit(&path, "u.txt", "only\n", "only here");
        run_ok(&path, &["switch", "-q", &main]);

        let plan = plan_clean_up_branches(
            path.clone(),
            vec![
                "fix/one".to_string(),
                "fix/two".to_string(),
                "feature/three".to_string(),
                "unique".to_string(),
                main.clone(),
            ],
        )
        .expect("the plan should succeed");
        assert_eq!(plan.operation_kind, OperationKind::Destructive);
        assert!(plan.requires_confirmation);
        let planned: Vec<&str> = plan
            .branches
            .iter()
            .map(|branch| branch.name.as_str())
            .collect();
        assert_eq!(planned, ["fix/one", "fix/two", "feature/three"]);
        assert!(plan
            .recovery_point
            .reference
            .starts_with("refs/gitodile/recovery/v1/clean-up-branches/"));
        let excluded: Vec<(&str, &AppErrorCode)> = plan
            .excluded
            .iter()
            .map(|branch| (branch.name.as_str(), &branch.reason.code))
            .collect();
        assert_eq!(
            excluded,
            [
                ("unique", &AppErrorCode::BranchUniqueWork),
                (main.as_str(), &AppErrorCode::BranchIsActive),
            ]
        );

        let result = clean_up_branches(path.clone(), requests(&plan), true)
            .expect("the clean-up should succeed");
        for name in ["fix/one", "fix/two", "feature/three"] {
            let branch = outcome_of(&result, name);
            assert_eq!(branch.outcome, CleanUpOutcome::Deleted);
            // Never published: nothing was asked of a remote.
            assert_eq!(branch.remote_deleted, None);
            let reference = branch
                .recovery_reference
                .as_deref()
                .expect("each deleted branch keeps a recovery point");
            assert!(reference.starts_with("refs/gitodile/recovery/v1/clean-up-branches/"));
            assert_eq!(&commit_at(&path, reference), &tips[name]);
            assert!(!result
                .snapshot
                .as_ref()
                .expect("the list is read after the clean-up")
                .branches
                .iter()
                .any(|entry| entry.name == name));
        }
        assert!(result
            .snapshot
            .as_ref()
            .expect("the list is read after the clean-up")
            .branches
            .iter()
            .any(|entry| entry.name == "unique"));

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn clean_up_offers_only_finished_branches_never_ones_merely_kept_elsewhere() {
        let (path, remote, main) = repo_with_main_branch("branch-clean-up-finished");
        finish_branch(&path, &main, "done");
        // Just created on the main branch: nothing of its own yet.
        run_ok(&path, &["branch", "fresh"]);
        // Work in progress, published: its own remote copy keeps it.
        run_ok(&path, &["switch", "-q", "-c", "in-review"]);
        write_and_commit(&path, "r.txt", "wip\n", "wip");
        run_ok(&path, &["push", "-q", "-u", "origin", "in-review"]);
        // A branch another branch grew from: kept by that branch, not merged.
        run_ok(&path, &["switch", "-q", "-c", "stacked-base", &main]);
        write_and_commit(&path, "s.txt", "base\n", "base");
        run_ok(&path, &["switch", "-q", "-c", "stacked-top"]);
        write_and_commit(&path, "t.txt", "top\n", "top");
        run_ok(&path, &["switch", "-q", &main]);

        let snapshot = get_branches(path.clone()).expect("discovery should succeed");
        let branch = |name: &str| {
            snapshot
                .branches
                .iter()
                .find(|branch| branch.name == name)
                .unwrap_or_else(|| panic!("{name} should be listed"))
        };
        assert!(branch("done").is_finished);
        for name in ["fresh", "in-review", "stacked-base"] {
            assert!(
                branch(name).is_retained_elsewhere,
                "{name} is kept elsewhere"
            );
            assert!(!branch(name).is_finished, "{name} is not finished");
        }
        assert!(!branch(&main).is_finished);

        let names = ["done", "fresh", "in-review", "stacked-base"]
            .map(str::to_string)
            .to_vec();
        let plan = plan_clean_up_branches(path.clone(), names).expect("the plan should succeed");
        let planned: Vec<&str> = plan
            .branches
            .iter()
            .map(|branch| branch.name.as_str())
            .collect();
        assert_eq!(planned, ["done"]);
        assert!(plan
            .excluded
            .iter()
            .all(|branch| branch.reason.code == AppErrorCode::BranchNotFinished));

        // A request for one anyway is refused branch by branch, not obeyed.
        let mut forged = requests(&plan);
        forged.push(CleanUpBranchRequest {
            name: "in-review".to_string(),
            state_token: "forged".to_string(),
        });
        let result =
            clean_up_branches(path.clone(), forged, false).expect("the clean-up should succeed");
        assert_eq!(outcome_of(&result, "done").outcome, CleanUpOutcome::Deleted);
        assert_eq!(
            outcome_of(&result, "in-review")
                .reason
                .as_ref()
                .map(|reason| &reason.code),
            Some(&AppErrorCode::BranchNotFinished)
        );

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn a_branch_whose_remote_branch_was_deleted_after_merging_is_finished() {
        let (path, remote, main) = repo_with_main_branch("branch-clean-up-gone");
        // Fast-forwarded into the main branch, published, then deleted on the
        // remote — what merging a pull request usually leaves behind.
        run_ok(&path, &["switch", "-q", "-c", "merged-pr"]);
        write_and_commit(&path, "p.txt", "pr\n", "pr");
        run_ok(&path, &["push", "-q", "-u", "origin", "merged-pr"]);
        run_ok(&path, &["switch", "-q", &main]);
        run_ok(&path, &["merge", "-q", "--ff-only", "merged-pr"]);
        run_ok(&path, &["push", "-q", "origin", "--delete", "merged-pr"]);

        let snapshot = get_branches(path.clone()).expect("discovery should succeed");
        let branch = snapshot
            .branches
            .iter()
            .find(|branch| branch.name == "merged-pr")
            .expect("merged-pr should be listed");
        assert!(branch.upstream_gone);
        assert!(branch.is_finished);

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn clean_up_skips_a_branch_that_became_active_and_deletes_the_rest() {
        let (path, remote, main) = repo_with_main_branch("branch-clean-up-active");
        finish_branch(&path, &main, "goes");
        finish_branch(&path, &main, "stays");
        let plan =
            plan_clean_up_branches(path.clone(), vec!["goes".to_string(), "stays".to_string()])
                .expect("the plan should succeed");
        assert_eq!(plan.branches.len(), 2);

        run_ok(&path, &["switch", "-q", "stays"]);
        let result = clean_up_branches(path.clone(), requests(&plan), false)
            .expect("one branch turning active skips only that branch");
        assert_eq!(outcome_of(&result, "goes").outcome, CleanUpOutcome::Deleted);
        let stays = outcome_of(&result, "stays");
        assert_eq!(stays.outcome, CleanUpOutcome::Skipped);
        assert_eq!(
            stays.reason.as_ref().map(|reason| &reason.code),
            Some(&AppErrorCode::BranchIsActive)
        );
        assert_eq!(stays.recovery_reference, None);
        assert!(in_test_frame(|| list_branch_names(&path))
            .unwrap()
            .contains(&"stays".to_string()));

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn clean_up_excludes_a_branch_open_in_another_worktree() {
        let (path, remote, main) = repo_with_main_branch("branch-clean-up-worktree");
        finish_branch(&path, &main, "free");
        finish_branch(&path, &main, "elsewhere");
        let worktree = Path::new(&path).join("linked");
        run_ok(
            &path,
            &[
                "worktree",
                "add",
                "-q",
                &worktree.to_string_lossy(),
                "elsewhere",
            ],
        );

        let plan = plan_clean_up_branches(
            path.clone(),
            vec!["free".to_string(), "elsewhere".to_string()],
        )
        .expect("the plan should succeed");
        assert_eq!(plan.branches.len(), 1);
        assert_eq!(plan.branches[0].name, "free");
        assert_eq!(plan.excluded.len(), 1);
        assert_eq!(plan.excluded[0].name, "elsewhere");
        assert_eq!(
            plan.excluded[0].reason.code,
            AppErrorCode::BranchCheckedOutElsewhere
        );

        // A request for it anyway is skipped, not obeyed.
        let mut forged = requests(&plan);
        forged.push(CleanUpBranchRequest {
            name: "elsewhere".to_string(),
            state_token: plan.branches[0].state_token.clone(),
        });
        let result =
            clean_up_branches(path.clone(), forged, false).expect("the clean-up should succeed");
        assert_eq!(outcome_of(&result, "free").outcome, CleanUpOutcome::Deleted);
        assert_eq!(
            outcome_of(&result, "elsewhere")
                .reason
                .as_ref()
                .map(|reason| &reason.code),
            Some(&AppErrorCode::BranchCheckedOutElsewhere)
        );

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn clean_up_skips_a_branch_that_moved_since_the_preview() {
        let (path, remote, main) = repo_with_main_branch("branch-clean-up-stale");
        finish_branch(&path, &main, "moved");
        finish_branch(&path, &main, "still");
        let plan =
            plan_clean_up_branches(path.clone(), vec!["moved".to_string(), "still".to_string()])
                .expect("the plan should succeed");

        // `moved` follows the main branch forward: still finished, but no
        // longer the branch the preview showed.
        write_and_commit(&path, "b.txt", "two\n", "second");
        run_ok(&path, &["branch", "-f", "moved", "HEAD"]);
        let result = clean_up_branches(path.clone(), requests(&plan), false)
            .expect("a moved branch skips only that branch");
        assert_eq!(
            outcome_of(&result, "moved")
                .reason
                .as_ref()
                .map(|reason| &reason.code),
            Some(&AppErrorCode::StaleBranchPlan)
        );
        assert_eq!(
            outcome_of(&result, "still").outcome,
            CleanUpOutcome::Deleted
        );

        let _ = fs::remove_dir_all(&path);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn clean_up_deletes_published_copies_only_when_asked() {
        let (repo, remote, main) = repo_with_main_branch("branch-clean-up-remote");
        for name in ["kept-remote", "gone-remote"] {
            finish_branch(&repo, &main, name);
            run_ok(&repo, &["push", "-q", "-u", "origin", name]);
        }
        let remote_has = |name: &str| {
            git_command(&remote)
                .args([
                    "show-ref",
                    "--verify",
                    "--quiet",
                    &format!("refs/heads/{name}"),
                ])
                .status()
                .expect("run git show-ref")
                .success()
        };

        let plan = plan_clean_up_branches(repo.clone(), vec!["kept-remote".to_string()])
            .expect("the plan should succeed");
        assert_eq!(
            plan.branches[0]
                .published
                .as_ref()
                .map(|entry| entry.short_name.as_str()),
            Some("origin/kept-remote")
        );
        let result = clean_up_branches(repo.clone(), requests(&plan), false)
            .expect("the clean-up should succeed");
        assert_eq!(outcome_of(&result, "kept-remote").remote_deleted, None);
        assert!(remote_has("kept-remote"));

        let plan = plan_clean_up_branches(repo.clone(), vec!["gone-remote".to_string()])
            .expect("the plan should succeed");
        let result = clean_up_branches(repo.clone(), requests(&plan), true)
            .expect("the clean-up should succeed");
        let branch = outcome_of(&result, "gone-remote");
        assert_eq!(branch.outcome, CleanUpOutcome::Deleted);
        assert_eq!(branch.remote_deleted, Some(true));
        assert!(!remote_has("gone-remote"));

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn a_branch_tracking_the_remote_main_branch_never_offers_to_delete_it() {
        let (repo, remote, main) = repo_with_main_branch("branch-clean-up-tracks-main");
        // Started from the remote's main branch, so it tracks it.
        run_ok(
            &repo,
            &[
                "switch",
                "-q",
                "-c",
                "hotfix",
                "--track",
                &format!("origin/{main}"),
            ],
        );
        write_and_commit(
            &repo, "h.txt", "fix
", "hotfix",
        );
        run_ok(&repo, &["switch", "-q", &main]);
        run_ok(
            &repo,
            &[
                "-c",
                "user.name=GitOdile Test",
                "-c",
                "user.email=test@gitodile.local",
                "merge",
                "-q",
                "--no-ff",
                "-m",
                "merge hotfix",
                "hotfix",
            ],
        );
        let remote_main = || {
            git_command(&remote)
                .args([
                    "show-ref",
                    "--verify",
                    "--quiet",
                    &format!("refs/heads/{main}"),
                ])
                .status()
                .expect("run git show-ref")
                .success()
        };

        let single = plan_delete_branch(repo.clone(), "hotfix".to_string())
            .expect("the single plan should succeed");
        assert_eq!(single.published, None);

        let plan = plan_clean_up_branches(repo.clone(), vec!["hotfix".to_string()])
            .expect("the plan should succeed");
        assert_eq!(plan.branches.len(), 1);
        assert_eq!(plan.branches[0].published, None);
        let result = clean_up_branches(repo.clone(), requests(&plan), true)
            .expect("the clean-up should succeed");
        let branch = outcome_of(&result, "hotfix");
        assert_eq!(branch.outcome, CleanUpOutcome::Deleted);
        assert_eq!(branch.remote_deleted, None);
        assert!(remote_main(), "the remote's main branch must survive");

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }

    #[test]
    fn clean_up_reports_a_refused_remote_delete_and_keeps_the_local_deletion() {
        let (repo, remote, main) = repo_with_main_branch("branch-clean-up-refused");
        for name in ["one", "two"] {
            finish_branch(&repo, &main, name);
            run_ok(&repo, &["push", "-q", "-u", "origin", name]);
        }
        run_ok(&remote, &["config", "receive.denyDeletes", "true"]);

        let plan = plan_clean_up_branches(repo.clone(), vec!["one".to_string(), "two".to_string()])
            .expect("the plan should succeed");
        let result = clean_up_branches(repo.clone(), requests(&plan), true)
            .expect("a refused remote delete is reported, not raised");
        for name in ["one", "two"] {
            let branch = outcome_of(&result, name);
            assert_eq!(branch.outcome, CleanUpOutcome::Deleted);
            assert_eq!(branch.remote_deleted, Some(false));
            assert!(branch.remote_error.is_some());
            assert!(!result
                .snapshot
                .as_ref()
                .expect("the list is read after the clean-up")
                .branches
                .iter()
                .any(|entry| entry.name == name));
            // The work the remote kept is also in the recovery point.
            assert!(branch.recovery_reference.is_some());
        }

        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(&remote);
    }
}

// ---- Switch to an existing branch ----

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SwitchBranchPlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) summary: String,
    pub(crate) steps: Vec<String>,
    pub(crate) risks: Vec<String>,
    pub(crate) recovery: String,
    pub(crate) requires_confirmation: bool,
    pub(crate) state_token: String,
    pub(crate) from: String,
    pub(crate) to: String,
    pub(crate) from_commit: String,
    pub(crate) to_commit: String,
    pub(crate) changed_files: Vec<String>,
    pub(crate) changed_files_total: usize,
}

pub(crate) struct ValidatedSwitch {
    pub(crate) from: String,
    pub(crate) to: String,
    pub(crate) from_commit: String,
    pub(crate) to_commit: String,
    pub(crate) changed_files: Vec<String>,
    pub(crate) changed_files_total: usize,
    pub(crate) state_token: String,
}

pub(crate) fn validate_and_prepare_switch(
    path: &str,
    target: &str,
) -> Result<ValidatedSwitch, AppError> {
    require_git_switch_support(path)?;

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation in Git, then try again."));
    }

    let status = read_working_tree_status(path.to_string())?;
    if !status.is_clean {
        return Err(AppError::new(
            AppErrorCode::DirtyWorkingTree,
            "This project has unsaved changes, so GitOdile can't switch branches yet.",
        )
        .with_remediation(
            "Save a version, or start a new branch with this work, then try again.",
        ));
    }

    let symbolic_head = run_git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let from = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    let (head_state, from_commit) = resolve_head_state(path, from.clone())?;
    if head_state == HeadState::Detached {
        return Err(AppError::new(
            AppErrorCode::DetachedHead,
            "This project isn't on a branch right now.",
        )
        .with_remediation("Create a branch at this commit first."));
    }
    if head_state == HeadState::Unborn {
        return Err(AppError::new(
            AppErrorCode::UnbornBranchNoVersion,
            "There's no saved version on this branch yet.",
        )
        .with_remediation("Save a version before switching branches."));
    }
    let from = from.expect("a branch head has a name");
    let from_commit = from_commit.expect("a branch head has a commit");

    validate_branch_ref_name(path, target)?;
    if target == from {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "This is already the active branch.",
        ));
    }

    let target_ref = format!("refs/heads/{target}");
    let target_exists = run_git(path, &["show-ref", "--verify", "--quiet", &target_ref])?;
    if !target_exists.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That branch no longer exists.",
        )
        .with_remediation("Refresh and try again."));
    }
    let to_commit = checked_git_stdout(run_git(path, &["rev-parse", &target_ref])?)?;

    let worktrees = list_worktrees(path)?;
    if let Some(occupied) = worktrees
        .iter()
        .find(|worktree| worktree.branch.as_deref() == Some(target))
    {
        return Err(AppError::new(
            AppErrorCode::BranchCheckedOutElsewhere,
            format!(
                "\"{target}\" is already open in another workspace at {}.",
                occupied.path
            ),
        )
        .with_remediation("Switch to it from that workspace instead."));
    }

    let diff_output = run_git(
        path,
        &[
            "diff",
            "--name-only",
            "-z",
            &format!("{from_commit}..{to_commit}"),
        ],
    )?;
    let all_changed_files = if diff_output.status.success() {
        split_nul_list(&diff_output)
    } else {
        Vec::new()
    };
    let changed_files_total = all_changed_files.len();
    let changed_files = all_changed_files.into_iter().take(50).collect();

    let state_token = compute_branch_state_token(
        Some(&from_commit),
        Some(&from),
        &status_fingerprint(&status),
        &format!("switch:{from}->{target}@{to_commit}"),
    );

    Ok(ValidatedSwitch {
        from,
        to: target.to_string(),
        from_commit,
        to_commit,
        changed_files,
        changed_files_total,
        state_token,
    })
}

pub(crate) fn plan_switch_branch(
    path: String,
    target: String,
) -> Result<SwitchBranchPlan, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "plan_switch_branch", None)?;
    let validated = validate_and_prepare_switch(&path, &target)?;
    Ok(SwitchBranchPlan {
        operation_kind: OperationKind::LocalMutation,
        summary: format!(
            "Switch from \"{}\" to \"{}\".",
            validated.from, validated.to
        ),
        steps: vec![
            format!(
                "Update this project's files and index to match \"{}\".",
                validated.to
            ),
            "Local history and every other branch stay unchanged.".to_string(),
        ],
        risks: Vec::new(),
        recovery: format!(
            "\"{}\" stays exactly as it is; switching back returns these files.",
            validated.from
        ),
        requires_confirmation: true,
        state_token: validated.state_token,
        from: validated.from,
        to: validated.to,
        from_commit: validated.from_commit,
        to_commit: validated.to_commit,
        changed_files: validated.changed_files,
        changed_files_total: validated.changed_files_total,
    })
}

pub(crate) fn classify_switch_failure(output: &Output) -> AppError {
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stderr_lower = stderr.to_lowercase();
    if stderr_lower.contains("would be overwritten")
        || stderr_lower.contains("please commit your changes")
    {
        AppError::new(
            AppErrorCode::BranchSwitchObstructed,
            "Git found local changes in the way of this switch that weren't visible in the preview.",
        )
        .with_remediation("Save or discard those changes in Git directly, then try again.")
        .with_detail(truncate_detail(&stderr))
    } else if stderr_lower.contains(".lock") || stderr_lower.contains("unable to") {
        AppError::new(
            AppErrorCode::RefLocked,
            "Git couldn't update its references right now (another Git process may be using them).",
        )
        .with_remediation("Close other Git tools touching this project, then try again.")
    } else {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't switch branches.",
        )
        .with_remediation("Check the project's Git state and try again.")
        .with_detail(truncate_detail(&stderr))
    }
}

pub(crate) fn switch_branch(
    path: String,
    target: String,
    state_token: String,
) -> Result<BranchesSnapshot, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "switch_branch", None)?;
    let validated = validate_and_prepare_switch(&path, &target)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleBranchPlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }
    let output = run_git(&path, &["switch", "--no-guess", &validated.to])?;
    if !output.status.success() {
        return Err(classify_switch_failure(&output));
    }
    get_branches(path)
}

// ---- Safely delete a local branch ----

fn default_branch_error(name: &str) -> AppError {
    AppError::new(
        AppErrorCode::BranchIsDefault,
        format!("\"{name}\" is this project's main branch."),
    )
    .with_remediation("It's where the project's shared work lives, so GitOdile keeps it as it is.")
}

/// Where a branch is published, when it is. Both halves come from the branch's own
/// Git configuration rather than from splitting `origin/name` on a slash: a
/// remote may be named with a slash in it, and a branch certainly may.
#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PublishedBranch {
    pub(crate) remote: String,
    pub(crate) branch: String,
    /// `origin/feature-x` — what the rest of the app calls the upstream.
    pub(crate) short_name: String,
}

pub(crate) fn published_branch(
    path: &str,
    name: &str,
) -> Result<Option<PublishedBranch>, AppError> {
    let remote_key = format!("branch.{name}.remote");
    let merge_key = format!("branch.{name}.merge");
    let remote_output = run_git(path, &["config", "--get", &remote_key])?;
    let merge_output = run_git(path, &["config", "--get", &merge_key])?;
    if !remote_output.status.success() || !merge_output.status.success() {
        return Ok(None);
    }
    let remote = git_stdout(&remote_output);
    let merge = git_stdout(&merge_output);
    // A remote named `.` means "this repository": there is nothing to publish
    // to and nothing to delete there.
    if remote.is_empty() || remote == "." {
        return Ok(None);
    }
    let branch = merge
        .strip_prefix("refs/heads/")
        .unwrap_or(&merge)
        .to_string();
    if branch.is_empty() {
        return Ok(None);
    }
    let short_name = format!("{remote}/{branch}");
    Ok(Some(PublishedBranch {
        remote,
        branch,
        short_name,
    }))
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteBranchPlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) summary: String,
    pub(crate) steps: Vec<String>,
    pub(crate) risks: Vec<String>,
    pub(crate) recovery: String,
    pub(crate) requires_confirmation: bool,
    pub(crate) state_token: String,
    pub(crate) name: String,
    pub(crate) tip_commit: String,
    pub(crate) retained_by: Vec<String>,
    pub(crate) upstream: Option<String>,
    /// The remote copy this delete can clear away as well, when there is one
    /// and it still exists. `None` for a branch that was never published, or one
    /// whose remote branch is already gone.
    pub(crate) published: Option<PublishedBranch>,
    /// Set when no other branch holds this one's versions but its work reached
    /// the main branch as copies — squashed or rebased. Deleting it then removes
    /// the only ref to its original versions, so the delete keeps a recovery
    /// point first (`recovery_point`).
    pub(crate) copied_into: Option<CopiedInto>,
    /// The local recovery point this delete creates before removing the branch.
    /// `Some` exactly when `copied_into` is.
    pub(crate) recovery_point: Option<HistoryRecoveryPreview>,
}

/// Where a branch's work reached the main branch as copies.
#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CopiedInto {
    /// The main branch, by its local name.
    pub(crate) base: String,
    pub(crate) kind: MergeKind,
    /// The main branch's version that brought the work in.
    pub(crate) commit: String,
}

/// What a delete actually did. The local half and the remote half can succeed
/// separately, and a screen that reports only the first would leave the user
/// believing a branch is gone from the project when their team still sees it.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteBranchResult {
    pub(crate) snapshot: BranchesSnapshot,
    /// `None` when no remote delete was asked for.
    pub(crate) remote_deleted: Option<bool>,
    /// Set when a remote delete was asked for and refused. The local branch is
    /// gone either way; this says the shared copy is not.
    pub(crate) remote_error: Option<AppError>,
    /// The recovery point kept before the branch was removed, when its versions
    /// were held nowhere else.
    pub(crate) recovery_reference: Option<String>,
}

pub(crate) struct ValidatedDelete {
    pub(crate) name: String,
    pub(crate) tip: String,
    pub(crate) retained_by: Vec<String>,
    pub(crate) upstream: Option<String>,
    pub(crate) published: Option<PublishedBranch>,
    pub(crate) copied_into: Option<CopiedInto>,
    pub(crate) state_token: String,
}

/// Whether a branch's work reached the main branch as copies — squashed or
/// rebased — the same check the route draws (`detect_copy`), against the same
/// main branch. `None` for the main branch itself, for a project with none, and
/// for a branch whose work is not there.
fn find_copy_into_main(path: &str, name: &str) -> Result<Option<CopiedInto>, AppError> {
    let defaults = default_branch_names(path)?;
    if defaults.iter().any(|default| default == name) {
        return Ok(None);
    }
    let branch_ref = format!("refs/heads/{name}");
    for base in defaults {
        let base_ref = format!("refs/heads/{base}");
        let Some(merge_base) = rev_parse_commit(path, &["merge-base", &base_ref, &branch_ref])?
        else {
            continue;
        };
        return Ok(detect_copy(path, &base_ref, &branch_ref, &merge_base)?
            .map(|(kind, commit)| CopiedInto { base, kind, commit }));
    }
    Ok(None)
}

/// What every delete checks once, whichever branches it is for. A clean-up reads
/// it once for all its branches rather than once per branch.
pub(crate) struct DeleteContext {
    active: Option<String>,
    defaults: Vec<String>,
    /// The remote-tracking refs of the remotes' default branches
    /// (`refs/remotes/origin/main`): published copies no delete may remove.
    default_remote_refs: Vec<String>,
    worktrees: Vec<WorktreeEntry>,
}

/// Refuses outright what blocks every delete: a Git too old to switch branches
/// safely, and a Git operation left half done.
pub(crate) fn read_delete_context(path: &str) -> Result<DeleteContext, AppError> {
    require_git_switch_support(path)?;

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation in Git, then try again."));
    }

    let symbolic_head = run_git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let active = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    let default_refs = default_branch_refs(path)?;
    Ok(DeleteContext {
        active,
        defaults: default_refs.iter().map(|(name, _)| name.clone()).collect(),
        default_remote_refs: default_refs.into_iter().map(|(_, remote)| remote).collect(),
        worktrees: list_worktrees(path)?,
    })
}

/// One branch against the checks every delete makes of it, in this order: not
/// the active branch, not the main branch, still there, not open in another
/// worktree. Returns its tip and the refs that still hold that tip, which
/// may be none; what to do then is the caller's rule.
pub(crate) fn check_branch_can_go(
    path: &str,
    context: &DeleteContext,
    name: &str,
) -> Result<(String, Vec<String>), AppError> {
    if context.active.as_deref() == Some(name) {
        return Err(AppError::new(
            AppErrorCode::BranchIsActive,
            "The active branch can't be deleted.",
        )
        .with_remediation("Switch to a different branch first."));
    }
    if context.defaults.iter().any(|known| known == name) {
        return Err(default_branch_error(name));
    }

    let target_ref = format!("refs/heads/{name}");
    let target_exists = run_git(path, &["show-ref", "--verify", "--quiet", &target_ref])?;
    if !target_exists.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That branch no longer exists.",
        )
        .with_remediation("Refresh and try again."));
    }
    let tip = checked_git_stdout(run_git(path, &["rev-parse", &target_ref])?)?;

    if let Some(occupied) = context
        .worktrees
        .iter()
        .find(|worktree| worktree.branch.as_deref() == Some(name))
    {
        return Err(AppError::new(
            AppErrorCode::BranchCheckedOutElsewhere,
            format!(
                "\"{name}\" is open in another workspace at {}.",
                occupied.path
            ),
        )
        .with_remediation(
            "Close that workspace, or switch it to a different branch, before deleting.",
        ));
    }

    let retained_by = retaining_refs(path, name, &tip)?;
    Ok((tip, retained_by))
}

fn unique_work_error(name: &str) -> AppError {
    AppError::new(
        AppErrorCode::BranchUniqueWork,
        format!(
            "\"{name}\" has saved work that isn't reachable from any other branch or remote yet."
        ),
    )
    .with_remediation("Merge or publish this work, or keep the branch, before deleting it.")
}

/// The branch's published copy, only when the remote branch is actually still
/// there: a branch whose upstream is `[gone]` has nothing left to delete, and
/// offering it would fail for a reason the user cannot act on.
///
/// Never a remote's default branch, either. A branch created from `origin/main`
/// tracks it, so "its published copy" would be the project's main branch on
/// the remote — and deleting that is not what deleting a finished branch means.
/// GitHub refuses it; a bare remote or another server may not.
fn live_published_branch(
    path: &str,
    context: &DeleteContext,
    name: &str,
) -> Result<Option<PublishedBranch>, AppError> {
    match published_branch(path, name)? {
        Some(entry) => {
            let tracking = format!("refs/remotes/{}", entry.short_name);
            if context.default_remote_refs.contains(&tracking) {
                return Ok(None);
            }
            let exists = run_git(path, &["show-ref", "--verify", "--quiet", &tracking])?;
            Ok(exists.status.success().then_some(entry))
        }
        None => Ok(None),
    }
}

pub(crate) fn validate_and_prepare_delete(
    path: &str,
    name: &str,
) -> Result<ValidatedDelete, AppError> {
    let context = read_delete_context(path)?;
    let (tip, retained_by) = check_branch_can_go(path, &context, name)?;
    // No other branch holds these versions — but if their work reached the main
    // branch as copies, the branch can go, with a recovery point for the
    // originals. Otherwise it is work that exists nowhere else.
    let copied_into = if retained_by.is_empty() {
        find_copy_into_main(path, name)?
    } else {
        None
    };
    if retained_by.is_empty() && copied_into.is_none() {
        return Err(unique_work_error(name));
    }

    let published = live_published_branch(path, &context, name)?;
    let upstream = published.as_ref().map(|entry| entry.short_name.clone());

    let status = read_working_tree_status(path.to_string())?;
    let state_token = compute_branch_state_token(
        Some(&tip),
        Some(name),
        &status_fingerprint(&status),
        &format!(
            "delete:{name}:{}:{}",
            retained_by.join(","),
            copied_into
                .as_ref()
                .map(|copy| copy.commit.as_str())
                .unwrap_or("")
        ),
    );

    Ok(ValidatedDelete {
        name: name.to_string(),
        tip,
        retained_by,
        upstream,
        published,
        copied_into,
        state_token,
    })
}

pub(crate) fn plan_delete_branch(path: String, name: String) -> Result<DeleteBranchPlan, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "plan_delete_branch", None)?;
    let validated = validate_and_prepare_delete(&path, &name)?;
    let recovery_point = validated
        .copied_into
        .as_ref()
        .map(|_| plan_history_recovery_for(&repository, HistoryRecoveryOperation::DeleteBranch));
    let (mut steps, mut risks, recovery) = match (&validated.copied_into, &recovery_point) {
        (Some(copy), Some(point)) => (
            vec![
                format!(
                    "Keep a local recovery point with \"{}\"'s original saved versions.",
                    validated.name
                ),
                format!(
                    "Remove the local reference \"{}\"; its work is already on {} as {}.",
                    validated.name,
                    copy.base,
                    match copy.kind {
                        MergeKind::Squash => "one squashed version",
                        _ => "copies of its versions",
                    }
                ),
            ],
            vec![format!(
                "The original versions will then live only in that recovery point. {}",
                point.retention
            )],
            format!("Local recovery point: {}", point.reference),
        ),
        _ => (
            vec![format!(
                "Remove the local reference \"{}\"; its saved work stays reachable from {}.",
                validated.name,
                validated.retained_by.join(", ")
            )],
            vec![
                "This can't be undone from GitOdile; the retained reference(s) above are the only guaranteed way back to this work."
                    .to_string(),
            ],
            format!("Reachable from: {}", validated.retained_by.join(", ")),
        ),
    };
    if let Some(published) = &validated.published {
        steps.push(format!(
            "Optionally delete \"{}\" on the remote as well.",
            published.short_name
        ));
        risks.push(format!(
            "Deleting \"{}\" on the remote removes it for everyone who works on this project.",
            published.short_name
        ));
    }
    Ok(DeleteBranchPlan {
        operation_kind: OperationKind::Destructive,
        summary: format!("Delete the branch \"{}\".", validated.name),
        steps,
        risks,
        recovery,
        requires_confirmation: true,
        state_token: validated.state_token,
        name: validated.name,
        tip_commit: validated.tip,
        retained_by: validated.retained_by,
        upstream: validated.upstream,
        published: validated.published,
        copied_into: validated.copied_into,
        recovery_point,
    })
}

pub(crate) fn classify_delete_failure(output: &Output) -> AppError {
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stderr_lower = stderr.to_lowercase();
    if stderr_lower.contains("not fully merged") {
        AppError::new(
            AppErrorCode::BranchUniqueWork,
            "Git found work on this branch that isn't safely reachable elsewhere yet.",
        )
        .with_remediation("Merge or publish this work, or keep the branch, before deleting it.")
    } else if stderr_lower.contains(".lock") || stderr_lower.contains("unable to") {
        AppError::new(
            AppErrorCode::RefLocked,
            "Git couldn't update its references right now (another Git process may be using them).",
        )
        .with_remediation("Close other Git tools touching this project, then try again.")
    } else {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't delete this branch.",
        )
        .with_remediation("Check the project's Git state and try again.")
        .with_detail(truncate_detail(&stderr))
    }
}

pub(crate) fn classify_remote_delete_failure(output: &Output) -> AppError {
    classify_remote_delete_message(&String::from_utf8_lossy(&output.stderr))
}

/// Git's words for a refused remote deletion, from a push's stderr or from
/// the reason a `--porcelain` push gives for one ref.
fn classify_remote_delete_message(stderr: &str) -> AppError {
    let stderr_lower = stderr.to_lowercase();
    if stderr_lower.contains("remote ref does not exist") {
        AppError::new(
            AppErrorCode::InvalidSelection,
            "That branch is already gone from the remote.",
        )
        .with_remediation("Nothing else to do — get project changes to refresh what's published.")
    } else if stderr_lower.contains("authentication")
        || stderr_lower.contains("permission denied")
        || stderr_lower.contains("could not read")
        || stderr_lower.contains("access denied")
    {
        AppError::new(
            AppErrorCode::AuthenticationFailed,
            "The remote wouldn't accept the deletion with the credentials on this computer.",
        )
        .with_remediation("Check your access to the project's remote, then try again.")
    } else if stderr_lower.contains("protected branch")
        || stderr_lower.contains("pre-receive hook declined")
        || stderr_lower.contains("deletion of the current branch prohibited")
    {
        AppError::new(
            AppErrorCode::RemoteRejected,
            "The remote refused to delete this branch.",
        )
        .with_remediation("It may be protected there; ask whoever administers the remote.")
        .with_detail(truncate_detail(stderr))
    } else {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't delete this branch on the remote.",
        )
        .with_remediation("Check your connection and your access to the remote, then try again.")
        .with_detail(truncate_detail(stderr))
    }
}

/// Removes a branch already proved safe to delete.
fn remove_local_branch(path: &str, name: &str) -> Result<(), AppError> {
    // `-d` first, always: Git's own refusal is the outer safety net and it
    // costs nothing to ask for it.
    //
    // Its rule is narrower than this app's, though, and that gap used to be a
    // lie on screen. Git accepts `-d` only for a branch merged into HEAD or
    // into its own upstream; GitOdile calls a branch safe when its tip is
    // reachable from *any* other local or remote-tracking ref, which is the
    // question that actually decides whether work can be lost. A feature branch
    // already merged and published, sitting beside a local `main` that has not
    // been pulled yet, satisfies the second and not the first — so the screen
    // said "Safe to delete", the dialog agreed, and Git then refused.
    //
    // So a `not fully merged` refusal is answered with `-D`, and only ever
    // after the caller has just proved again (`check_branch_can_go`) that the
    // work survives — retained by another ref, or copied into the main branch
    // with a recovery point verified first — and its state token has
    // confirmed nothing moved since the preview. Every other refusal stands.
    let output = run_git(path, &["branch", "-d", "--", name])?;
    if !output.status.success() {
        let failure = classify_delete_failure(&output);
        if failure.code != AppErrorCode::BranchUniqueWork {
            return Err(failure);
        }
        let forced = run_git(path, &["branch", "-D", "--", name])?;
        if !forced.status.success() {
            return Err(classify_delete_failure(&forced));
        }
    }
    Ok(())
}

pub(crate) fn delete_branch(
    path: String,
    name: String,
    delete_remote: bool,
    state_token: String,
) -> Result<DeleteBranchResult, AppError> {
    let (repository, _access) = application::authorize_repository(&path, "delete_branch", None)?;
    let validated = validate_and_prepare_delete(&path, &name)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleBranchPlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }

    // A branch whose versions are held nowhere else — its work reached the main
    // branch only as copies — keeps a verified recovery point before anything is
    // removed (ADR 0016). No recovery point, no delete.
    let recovery_reference = match &validated.copied_into {
        Some(copy) => {
            let point =
                plan_history_recovery_for(&repository, HistoryRecoveryOperation::DeleteBranch);
            let record = create_history_recovery_for(
                &repository,
                HistoryRecoveryOperation::DeleteBranch,
                &point.reference,
                HistoryRecoveryMetadata {
                    branch: validated.name.clone(),
                    previous_commit: validated.tip.clone(),
                    target_commit: copy.commit.clone(),
                    remote: validated
                        .published
                        .as_ref()
                        .map(|published| published.remote.clone())
                        .unwrap_or_default(),
                    destination_branch: copy.base.clone(),
                    tracking_ref: validated.upstream.clone().unwrap_or_default(),
                    state_token: state_token.clone(),
                    unsaved_snapshot: None,
                },
            )?;
            verify_history_recovery(&path, &record)?;
            Some(record.reference)
        }
        None => None,
    };

    remove_local_branch(&path, &validated.name)?;

    let mut remote_deleted = None;
    let mut remote_error = None;
    if delete_remote {
        match &validated.published {
            Some(published) => {
                let push = run_git(
                    &path,
                    &[
                        "push",
                        "--porcelain",
                        &published.remote,
                        "--delete",
                        &format!("refs/heads/{}", published.branch),
                    ],
                )?;
                if push.status.success() {
                    remote_deleted = Some(true);
                } else {
                    remote_deleted = Some(false);
                    remote_error = Some(classify_remote_delete_failure(&push));
                }
            }
            // Asked for, but there is nothing published to delete. Reported as
            // "not done" rather than as a failure: the local branch is gone and
            // the remote never had a copy.
            None => remote_deleted = Some(false),
        }
    }

    Ok(DeleteBranchResult {
        snapshot: get_branches(path)?,
        remote_deleted,
        remote_error,
        recovery_reference,
    })
}

// ---- Clean up several branches at once (task 173) ----

/// The most branches one clean-up deletes. Each keeps a recovery point, and the
/// clean-up namespace keeps this many, so one clean-up never evicts its own.
pub(crate) const MAX_CLEAN_UP_BRANCHES: usize = MAX_CLEAN_UP_RECOVERY_RECORDS;

/// One branch a clean-up will delete, with what keeps its work.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CleanUpBranch {
    pub(crate) name: String,
    pub(crate) tip_commit: String,
    /// Exact ref names that hold this branch's tip.
    pub(crate) retained_by: Vec<String>,
    /// The published copy the clean-up can delete too, when it still exists.
    pub(crate) published: Option<PublishedBranch>,
    /// This branch's own token: execution skips it, and only it, when its tip
    /// or its published copy moved since the preview.
    pub(crate) state_token: String,
}

/// A branch asked for and left out, with the reason the single delete would
/// give for it.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExcludedBranch {
    pub(crate) name: String,
    pub(crate) reason: AppError,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CleanUpBranchesPlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) summary: String,
    pub(crate) steps: Vec<String>,
    pub(crate) risks: Vec<String>,
    pub(crate) recovery: String,
    pub(crate) requires_confirmation: bool,
    pub(crate) branches: Vec<CleanUpBranch>,
    pub(crate) excluded: Vec<ExcludedBranch>,
    /// How the recovery points are kept. Each deleted branch gets its own.
    pub(crate) recovery_point: HistoryRecoveryPreview,
}

/// One branch the user confirmed, echoed from the plan.
#[derive(serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CleanUpBranchRequest {
    pub(crate) name: String,
    pub(crate) state_token: String,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum CleanUpOutcome {
    Deleted,
    Skipped,
}

/// What happened to one branch. A skipped branch is untouched, locally and on the
/// remote; a deleted one may still have a remote error.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CleanUpBranchResult {
    pub(crate) name: String,
    pub(crate) outcome: CleanUpOutcome,
    pub(crate) reason: Option<AppError>,
    /// `None` when the remote copy was not asked for or the branch had none.
    pub(crate) remote_deleted: Option<bool>,
    pub(crate) remote_error: Option<AppError>,
    pub(crate) recovery_reference: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CleanUpBranchesResult {
    /// The list after the clean-up. `None` only when reading it failed after
    /// branches were already deleted: that is no reason to report the clean-up
    /// itself as failed, and the screen refreshes on its own.
    pub(crate) snapshot: Option<BranchesSnapshot>,
    pub(crate) branches: Vec<CleanUpBranchResult>,
}

fn guard_clean_up_names<'a>(names: impl Iterator<Item = &'a str>) -> Result<(), AppError> {
    let mut seen = std::collections::HashSet::new();
    for name in names {
        if name.is_empty() || name.starts_with('-') || name.contains('\0') {
            return Err(AppError::new(
                AppErrorCode::InvalidSelection,
                "One of the chosen branches has a name GitOdile can't use.",
            )
            .with_remediation("Refresh and try again."));
        }
        if !seen.insert(name) {
            return Err(AppError::new(
                AppErrorCode::InvalidSelection,
                format!("\"{name}\" was chosen twice."),
            )
            .with_remediation("Refresh and try again."));
        }
    }
    if seen.is_empty() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "Choose at least one branch to clean up.",
        ));
    }
    if seen.len() > MAX_CLEAN_UP_BRANCHES {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            format!("A clean-up deletes at most {MAX_CLEAN_UP_BRANCHES} branches at once."),
        )
        .with_remediation("Choose fewer branches, then clean up the rest afterwards."));
    }
    Ok(())
}

/// Covers what makes this branch's preview untrue: its tip and where it is
/// published. Not the refs that keep it, which the other branches in the same
/// clean-up change as they go; those are checked live instead.
fn clean_up_branch_token(name: &str, tip: &str, published: Option<&PublishedBranch>) -> String {
    compute_branch_state_token(
        Some(tip),
        Some(name),
        "",
        &format!(
            "clean-up:{}",
            published
                .map(|entry| entry.short_name.as_str())
                .unwrap_or("")
        ),
    )
}

fn not_finished_error(name: &str) -> AppError {
    AppError::new(
        AppErrorCode::BranchNotFinished,
        format!("\"{name}\" isn't finished: its work isn't on the main branch yet."),
    )
    .with_remediation("Keep it, or delete it on its own from its details if you're sure.")
}

/// The branch's last check before deletion: whatever the single delete
/// refuses, and a branch that is not finished (`finished_branches`) — a clean-up
/// clears away finished work, never a branch in progress that merely could be
/// deleted without loss.
fn check_clean_up_branch(
    path: &str,
    context: &DeleteContext,
    finished: &std::collections::HashSet<String>,
    name: &str,
) -> Result<(String, Vec<String>, Option<PublishedBranch>), AppError> {
    let (tip, retained_by) = check_branch_can_go(path, context, name)?;
    if retained_by.is_empty() {
        return Err(unique_work_error(name));
    }
    if !finished.contains(name) {
        return Err(not_finished_error(name));
    }
    let published = live_published_branch(path, context, name)?;
    Ok((tip, retained_by, published))
}

pub(crate) fn plan_clean_up_branches(
    path: String,
    names: Vec<String>,
) -> Result<CleanUpBranchesPlan, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "plan_clean_up_branches", None)?;
    guard_clean_up_names(names.iter().map(String::as_str))?;
    let context = read_delete_context(&path)?;
    let finished = finished_among(&path, &names)?;

    let mut branches = Vec::new();
    let mut excluded = Vec::new();
    for name in names {
        match check_clean_up_branch(&path, &context, &finished, &name) {
            Ok((tip, retained_by, published)) => branches.push(CleanUpBranch {
                state_token: clean_up_branch_token(&name, &tip, published.as_ref()),
                name,
                tip_commit: tip,
                retained_by,
                published,
            }),
            Err(reason) => excluded.push(ExcludedBranch { name, reason }),
        }
    }

    let recovery_point =
        plan_history_recovery_for(&repository, HistoryRecoveryOperation::CleanUpBranches);
    let count = branches.len();
    let published = branches
        .iter()
        .filter(|branch| branch.published.is_some())
        .count();
    let mut steps = vec![
        "Keep a local recovery point with each branch's name and last saved version.".to_string(),
        format!(
            "Remove {count} finished local branch(s); their work is already on the main branch."
        ),
    ];
    let mut risks = Vec::new();
    if published > 0 {
        steps.push(format!(
            "Optionally delete the published copies of {published} of them on the remote as well."
        ));
        risks.push(
            "Deleting published copies removes them for everyone who works on this project."
                .to_string(),
        );
    }
    Ok(CleanUpBranchesPlan {
        operation_kind: OperationKind::Destructive,
        summary: format!("Delete {count} finished branch(s)."),
        steps,
        risks,
        recovery: recovery_point.retention.clone(),
        requires_confirmation: true,
        branches,
        excluded,
        recovery_point,
    })
}

/// Deletes one confirmed branch: rechecked, matched against its preview, a
/// verified recovery point kept, then removed.
fn clean_up_one_branch(
    path: &str,
    repository: &RepositoryContext,
    context: &DeleteContext,
    finished: &std::collections::HashSet<String>,
    request: &CleanUpBranchRequest,
) -> Result<(String, Option<PublishedBranch>), AppError> {
    let (tip, retained_by, published) =
        check_clean_up_branch(path, context, finished, &request.name)?;
    if clean_up_branch_token(&request.name, &tip, published.as_ref()) != request.state_token {
        return Err(AppError::new(
            AppErrorCode::StaleBranchPlan,
            format!("\"{}\" changed since the preview was shown.", request.name),
        )
        .with_remediation("Review the clean-up again to include it."));
    }

    let point = plan_history_recovery_for(repository, HistoryRecoveryOperation::CleanUpBranches);
    let record = create_history_recovery_for(
        repository,
        HistoryRecoveryOperation::CleanUpBranches,
        &point.reference,
        HistoryRecoveryMetadata {
            branch: request.name.clone(),
            previous_commit: tip.clone(),
            // Nothing moves anywhere: the branch's tip is all there is to keep.
            target_commit: tip,
            remote: published
                .as_ref()
                .map(|entry| entry.remote.clone())
                .unwrap_or_default(),
            destination_branch: retained_by
                .first()
                .map(|reference| short_ref_name(reference).to_string())
                .unwrap_or_default(),
            tracking_ref: published
                .as_ref()
                .map(|entry| entry.short_name.clone())
                .unwrap_or_default(),
            state_token: request.state_token.clone(),
            unsaved_snapshot: None,
        },
    )?;
    verify_history_recovery(path, &record)?;

    remove_local_branch(path, &request.name)?;
    Ok((record.reference, published))
}

fn short_ref_name(reference: &str) -> &str {
    reference
        .strip_prefix("refs/heads/")
        .or_else(|| reference.strip_prefix("refs/remotes/"))
        .unwrap_or(reference)
}

/// Reads one `git push --porcelain` ref line, `<flag>\t<from>:<to>\t<summary>`,
/// as the destination ref and whether it was deleted, or the reason it was not.
fn parse_porcelain_push_line(line: &str) -> Option<(&str, Result<(), &str>)> {
    let mut fields = line.splitn(3, '\t');
    let flag = fields.next()?;
    let refspec = fields.next()?;
    let summary = fields.next().unwrap_or("");
    let (_, to) = refspec.split_once(':')?;
    match flag {
        "-" => Some((to, Ok(()))),
        "!" => Some((to, Err(summary))),
        _ => None,
    }
}

/// Deletes published copies, one push per remote, and answers for each copy in
/// the order given. A refusal never touches the local half, already done.
fn delete_published_copies(path: &str, copies: &[&PublishedBranch]) -> Vec<Result<(), AppError>> {
    let mut answers: Vec<Option<Result<(), AppError>>> = copies.iter().map(|_| None).collect();
    let mut remotes: Vec<&str> = Vec::new();
    for copy in copies {
        if !remotes.contains(&copy.remote.as_str()) {
            remotes.push(&copy.remote);
        }
    }
    for remote in remotes {
        let indices: Vec<usize> = (0..copies.len())
            .filter(|&index| copies[index].remote == remote)
            .collect();
        let refs: Vec<String> = indices
            .iter()
            .map(|&index| format!("refs/heads/{}", copies[index].branch))
            .collect();
        let mut args = vec!["push", "--porcelain", remote, "--delete"];
        args.extend(refs.iter().map(String::as_str));
        // A push that could not even start answers for every ref it carried;
        // the local deletions it follows stand either way.
        let push = match run_git(path, &args) {
            Ok(push) => push,
            Err(error) => {
                for &index in &indices {
                    answers[index] = Some(Err(error.clone()));
                }
                continue;
            }
        };
        let stdout = String::from_utf8_lossy(&push.stdout).to_string();
        let reported: Vec<(&str, Result<(), &str>)> = stdout
            .lines()
            .filter_map(parse_porcelain_push_line)
            .collect();
        for (&index, reference) in indices.iter().zip(&refs) {
            let answer = match reported.iter().find(|(to, _)| to == reference) {
                Some((_, Ok(()))) => Ok(()),
                Some((_, Err(reason))) => Err(classify_remote_delete_message(reason)),
                None if push.status.success() => Ok(()),
                // No word on this ref: the push failed before it got that far,
                // and its stderr is the reason for every ref it carried.
                None => Err(classify_remote_delete_failure(&push)),
            };
            answers[index] = Some(answer);
        }
    }
    answers
        .into_iter()
        .map(|answer| answer.unwrap_or(Ok(())))
        .collect()
}

pub(crate) fn clean_up_branches(
    path: String,
    branches: Vec<CleanUpBranchRequest>,
    delete_remote: bool,
) -> Result<CleanUpBranchesResult, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "clean_up_branches", None)?;
    guard_clean_up_names(branches.iter().map(|branch| branch.name.as_str()))?;
    // What blocks every branch refuses the whole clean-up; what blocks one
    // branch skips that branch.
    let context = read_delete_context(&path)?;
    // Asked fresh, once: deleting one finished branch never changes whether
    // another one is.
    let names: Vec<String> = branches.iter().map(|branch| branch.name.clone()).collect();
    let finished = finished_among(&path, &names)?;

    let mut results = Vec::new();
    let mut published = Vec::new();
    for request in &branches {
        match clean_up_one_branch(&path, &repository, &context, &finished, request) {
            Ok((recovery_reference, copy)) => {
                if delete_remote {
                    if let Some(copy) = copy {
                        published.push((results.len(), copy));
                    }
                }
                results.push(CleanUpBranchResult {
                    name: request.name.clone(),
                    outcome: CleanUpOutcome::Deleted,
                    reason: None,
                    remote_deleted: None,
                    remote_error: None,
                    recovery_reference: Some(recovery_reference),
                });
            }
            Err(reason) => results.push(CleanUpBranchResult {
                name: request.name.clone(),
                outcome: CleanUpOutcome::Skipped,
                reason: Some(reason),
                remote_deleted: None,
                remote_error: None,
                recovery_reference: None,
            }),
        }
    }

    if !published.is_empty() {
        let copies: Vec<&PublishedBranch> = published.iter().map(|(_, copy)| copy).collect();
        let answers = delete_published_copies(&path, &copies);
        for ((index, _), answer) in published.iter().zip(answers) {
            let result = &mut results[*index];
            match answer {
                Ok(()) => result.remote_deleted = Some(true),
                Err(error) => {
                    result.remote_deleted = Some(false);
                    result.remote_error = Some(error);
                }
            }
        }
    }

    Ok(CleanUpBranchesResult {
        snapshot: get_branches(path).ok(),
        branches: results,
    })
}

// ---- Rename a branch ----

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RenameBranchPlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) summary: String,
    pub(crate) steps: Vec<String>,
    pub(crate) risks: Vec<String>,
    pub(crate) recovery: String,
    pub(crate) requires_confirmation: bool,
    pub(crate) state_token: String,
    pub(crate) name: String,
    pub(crate) new_name: String,
    pub(crate) is_active: bool,
    /// The branch is published under its old name, which this rename does not
    /// touch. The screen says so rather than letting the user assume the
    /// remote followed along.
    pub(crate) upstream: Option<String>,
}

pub(crate) struct ValidatedRename {
    pub(crate) name: String,
    pub(crate) new_name: String,
    pub(crate) is_active: bool,
    pub(crate) upstream: Option<String>,
    pub(crate) state_token: String,
}

pub(crate) fn validate_and_prepare_rename(
    path: &str,
    name: &str,
    new_name: &str,
) -> Result<ValidatedRename, AppError> {
    require_git_switch_support(path)?;

    if let Some(operation) = git_operation_in_progress(path)? {
        return Err(AppError::new(
            AppErrorCode::GitOperationInProgress,
            format!("A Git {operation} is already in progress in this project."),
        )
        .with_remediation("Finish or abort that operation in Git, then try again."));
    }

    validate_branch_ref_name(path, name)?;
    validate_branch_ref_name(path, new_name)?;
    ensure_not_default_branch(path, name)?;

    let target_ref = format!("refs/heads/{name}");
    let target_exists = run_git(path, &["show-ref", "--verify", "--quiet", &target_ref])?;
    if !target_exists.status.success() {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That branch no longer exists.",
        )
        .with_remediation("Refresh and try again."));
    }

    if new_name == name {
        return Err(AppError::new(
            AppErrorCode::BranchNameTaken,
            "That's already this branch's name.",
        )
        .with_remediation("Choose a different name."));
    }

    let existing = list_branch_names(path)?;
    if existing.iter().any(|known| known == new_name) {
        return Err(AppError::new(
            AppErrorCode::BranchNameTaken,
            "A branch with this exact name already exists.",
        )
        .with_remediation("Choose a different name."));
    }
    if let Some(collision) = existing
        .iter()
        .filter(|known| *known != name)
        .find(|known| known.eq_ignore_ascii_case(new_name))
    {
        return Err(AppError::new(
            AppErrorCode::BranchNameCollides,
            format!(
                "\"{collision}\" already exists and only differs by letter case, which some file systems can't tell apart."
            ),
        )
        .with_remediation("Choose a name that isn't just a different case of an existing one."));
    }

    // A branch open in another workspace is renamed *there* as far as that
    // window is concerned: Git rewrites the ref under it without telling it.
    // Refused for the same reason switching and deleting are.
    let worktrees = list_worktrees(path)?;
    let symbolic_head = run_git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let active = symbolic_head
        .status
        .success()
        .then(|| git_stdout(&symbolic_head));
    let is_active = active.as_deref() == Some(name);
    if !is_active {
        if let Some(occupied) = worktrees
            .iter()
            .find(|worktree| worktree.branch.as_deref() == Some(name))
        {
            return Err(AppError::new(
                AppErrorCode::BranchCheckedOutElsewhere,
                format!(
                    "\"{name}\" is open in another workspace at {}.",
                    occupied.path
                ),
            )
            .with_remediation(
                "Close that workspace, or switch it to a different branch, before renaming.",
            ));
        }
    }

    let upstream = published_branch(path, name)?.map(|entry| entry.short_name);
    let tip = checked_git_stdout(run_git(path, &["rev-parse", &target_ref])?)?;
    let status = read_working_tree_status(path.to_string())?;
    let state_token = compute_branch_state_token(
        Some(&tip),
        Some(name),
        &status_fingerprint(&status),
        &format!("rename:{name}:{new_name}"),
    );

    Ok(ValidatedRename {
        name: name.to_string(),
        new_name: new_name.to_string(),
        is_active,
        upstream,
        state_token,
    })
}

pub(crate) fn plan_rename_branch(
    path: String,
    name: String,
    new_name: String,
) -> Result<RenameBranchPlan, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "plan_rename_branch", None)?;
    let validated = validate_and_prepare_rename(&path, &name, &new_name)?;
    let mut steps = vec![format!(
        "Rename the local branch \"{}\" to \"{}\".",
        validated.name, validated.new_name
    )];
    let mut risks = Vec::new();
    if let Some(upstream) = &validated.upstream {
        steps.push(format!(
            "Keep tracking \"{upstream}\", which keeps its own name."
        ));
        risks.push(format!(
            "The published copy stays called \"{upstream}\"; renaming it there is a separate decision."
        ));
    }
    Ok(RenameBranchPlan {
        // Nothing is lost and nothing leaves this computer: the saved versions
        // are the same commits under a different local name.
        operation_kind: OperationKind::LocalMutation,
        summary: format!(
            "Rename \"{}\" to \"{}\".",
            validated.name, validated.new_name
        ),
        steps,
        risks,
        recovery: format!(
            "Rename it back to \"{}\" at any time; no saved version is touched.",
            validated.name
        ),
        requires_confirmation: false,
        state_token: validated.state_token,
        name: validated.name,
        new_name: validated.new_name,
        is_active: validated.is_active,
        upstream: validated.upstream,
    })
}

pub(crate) fn rename_branch(
    path: String,
    name: String,
    new_name: String,
    state_token: String,
) -> Result<BranchesSnapshot, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "rename_branch", None)?;
    let validated = validate_and_prepare_rename(&path, &name, &new_name)?;
    if validated.state_token != state_token {
        return Err(AppError::new(
            AppErrorCode::StaleBranchPlan,
            "This project changed since the preview was shown.",
        )
        .with_remediation("Refresh and try again."));
    }
    // `-m`, never `-M`: the forcing variant overwrites an existing branch of
    // the target name, and losing a branch to a rename is exactly the surprise
    // the name check above exists to prevent.
    let output = run_git(
        &path,
        &["branch", "-m", "--", &validated.name, &validated.new_name],
    )?;
    if !output.status.success() {
        return Err(classify_ref_mutation_failure(
            &output,
            "Git couldn't rename this branch.",
        ));
    }
    get_branches(path)
}
