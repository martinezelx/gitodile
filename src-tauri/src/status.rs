use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{checked_git_stdout, run_git};
use crate::repository::{resolve_head_state, HeadState};
use crate::sync::{list_remotes, resolve_remote_selection};
use std::{io::ErrorKind, path::Path};

/// Product-level meaning of a change, rather than Git's index/worktree split.
/// The staging model belongs to the save-version flow, not to this summary.
#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ChangeCategory {
    Changed,
    New,
    Deleted,
    Renamed,
    Conflicted,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkingTreeEntry {
    pub(crate) path: String,
    /// Only set for renames: where the file came from.
    pub(crate) original_path: Option<String>,
    pub(crate) category: ChangeCategory,
    /// Kept as structured metadata for save planning and advanced tooling.
    /// Simple mode deliberately does not expose Git's index vocabulary.
    pub(crate) is_prepared: bool,
    pub(crate) has_unprepared_changes: bool,
}

/// Added and removed line counts across the working tree, as the status bar
/// shows them. Carried as `Option` on `WorkingTreeStatus`: `None` means the
/// number could not be trusted rather than that it is zero. See
/// `changes::working_tree_line_totals` for what makes it untrustworthy.
#[derive(serde::Serialize, Debug, PartialEq, Eq, Default, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LineTotals {
    pub(crate) added: u64,
    pub(crate) removed: u64,
}

#[derive(serde::Serialize, Debug, PartialEq, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkingTreeCounts {
    pub(crate) changed: usize,
    #[serde(rename = "new")]
    pub(crate) new_files: usize,
    pub(crate) deleted: usize,
    pub(crate) renamed: usize,
    pub(crate) conflicted: usize,
    pub(crate) total: usize,
}

/// Captured because `--branch` provides it for free. Task 007 does not present
/// it: explaining ahead/behind needs the remote contracts from a later phase.
#[derive(serde::Serialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpstreamStatus {
    pub(crate) branch: Option<String>,
    pub(crate) upstream: Option<String>,
    pub(crate) ahead: u32,
    pub(crate) behind: u32,
}

#[derive(serde::Serialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkingTreeStatus {
    pub(crate) is_clean: bool,
    pub(crate) counts: WorkingTreeCounts,
    /// Added and removed line counts, or `None` when they cannot be trusted.
    pub(crate) line_totals: Option<LineTotals>,
    pub(crate) entries: Vec<WorkingTreeEntry>,
    /// True when more files changed than `MAX_REPORTED_ENTRIES`. The counts
    /// stay exact; only the per-file list is capped.
    pub(crate) truncated: bool,
    pub(crate) has_prepared_changes: bool,
    pub(crate) has_unprepared_changes: bool,
    pub(crate) upstream: UpstreamStatus,
    /// True while Git's markers say a merge, rebase, cherry-pick, revert or
    /// patch series is paused, even once no file overlaps any more: a merge
    /// whose files are all resolved still has to be finished or abandoned.
    /// Read from the marker files alone, with no Git process.
    pub(crate) paused_operation: bool,
}

/// Enough to populate a file list without shipping a pathological status
/// (a fresh clone of a huge tree, a reformatting commit) across the IPC
/// boundary. Counts are never truncated, so the summary stays truthful.
pub(crate) const MAX_REPORTED_ENTRIES: usize = 1000;

/// Shared by `read_working_tree_status` and `read_file_diff`, so both commands
/// always classify the working tree the same way. `--renames` is explicit so
/// a repository configured with `status.renames=false` still reports a rename
/// as a rename rather than a delete plus an add.
pub(crate) const STATUS_ARGS: [&str; 6] = [
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=all",
    "--renames",
    "-z",
];

/// Classifies an ordinary `1 <XY>` record. `X` is the index status and `Y` the
/// worktree status; either may be `.` for "unchanged there".
pub(crate) fn categorize_ordinary(index_status: u8, worktree_status: u8) -> ChangeCategory {
    if index_status == b'D' || worktree_status == b'D' {
        ChangeCategory::Deleted
    } else if index_status == b'A' {
        ChangeCategory::New
    } else {
        ChangeCategory::Changed
    }
}

pub(crate) fn parse_ahead_behind(value: &str) -> (u32, u32) {
    let mut ahead = 0;
    let mut behind = 0;
    for field in value.split_whitespace() {
        let (sign, digits) = field.split_at(1);
        let parsed = digits.parse::<u32>().unwrap_or(0);
        match sign {
            "+" => ahead = parsed,
            "-" => behind = parsed,
            _ => {}
        }
    }
    (ahead, behind)
}

/// A parsed status record before it is folded into the public
/// `WorkingTreeStatus` shape. `is_untracked` is deliberately not part of
/// `WorkingTreeEntry`: the Overview and Changes list only ever need the
/// product category, but the diff command needs to know whether a "new" file
/// is untracked (never `git add`ed, so `git diff HEAD` won't see it) or
/// staged (already visible to `git diff HEAD`) to choose a diff strategy.
#[derive(Debug, PartialEq)]
pub(crate) struct RawStatusEntry {
    pub(crate) path: String,
    pub(crate) original_path: Option<String>,
    pub(crate) category: ChangeCategory,
    pub(crate) is_untracked: bool,
    pub(crate) is_prepared: bool,
    pub(crate) has_unprepared_changes: bool,
}

pub(crate) struct ParsedStatusRecords {
    pub(crate) entries: Vec<RawStatusEntry>,
    pub(crate) upstream: UpstreamStatus,
    pub(crate) has_unsupported_path_encoding: bool,
}

/// Parses `git status --porcelain=v2 --branch -z` output into raw records and
/// the upstream header, without folding them into aggregate counts. Shared by
/// `parse_status_porcelain_v2` (task 007) and `find_status_entry` (task 009),
/// so the record grammar is decoded in exactly one place.
///
/// The `-z` form is NUL-separated and leaves paths verbatim, which is the only
/// way to survive paths containing spaces, quotes, or newlines. Note that a
/// rename record spans two NUL-separated fields: the record itself and the
/// original path.
pub(crate) fn parse_status_records(stdout: &[u8]) -> ParsedStatusRecords {
    let mut upstream = UpstreamStatus::default();
    let mut entries = Vec::new();
    let mut has_unsupported_path_encoding = false;
    let mut fields = stdout
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());

    while let Some(field) = fields.next() {
        let record = match std::str::from_utf8(field) {
            Ok(record) => record,
            Err(_) => {
                has_unsupported_path_encoding = true;
                // A rename consumes a second NUL field even when its primary
                // record cannot be represented.
                if field.starts_with(b"2 ") {
                    let _ = fields.next();
                }
                continue;
            }
        };

        if let Some(header) = record.strip_prefix("# ") {
            if let Some(head) = header.strip_prefix("branch.head ") {
                // `(detached)` is Git's placeholder, not a branch name.
                upstream.branch = match head {
                    "(detached)" => None,
                    value => Some(value.to_string()),
                };
            } else if let Some(value) = header.strip_prefix("branch.upstream ") {
                upstream.upstream = Some(value.to_string());
            } else if let Some(ab) = header.strip_prefix("branch.ab ") {
                let (ahead, behind) = parse_ahead_behind(ab);
                upstream.ahead = ahead;
                upstream.behind = behind;
            }
            continue;
        }

        let (category, path, original_path, is_untracked, is_prepared, has_unprepared_changes) =
            match record.as_bytes().first() {
                // `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`
                Some(b'1') => {
                    let Some(rest) = record.strip_prefix("1 ") else {
                        continue;
                    };
                    let mut parts = rest.splitn(8, ' ');
                    let Some(xy) = parts.next() else { continue };
                    let Some(path) = parts.nth(6) else { continue };
                    let xy = xy.as_bytes();
                    if xy.len() < 2 {
                        continue;
                    }
                    (
                        categorize_ordinary(xy[0], xy[1]),
                        path.to_string(),
                        None,
                        false,
                        xy[0] != b'.',
                        xy[1] != b'.',
                    )
                }
                // `2 ... <path>` followed by a separate NUL-terminated original path.
                Some(b'2') => {
                    let Some(rest) = record.strip_prefix("2 ") else {
                        continue;
                    };
                    let mut parts = rest.splitn(9, ' ');
                    let Some(xy) = parts.next() else { continue };
                    let Some(path) = parts.nth(7) else {
                        continue;
                    };
                    let original = match fields.next() {
                        Some(value) => match std::str::from_utf8(value) {
                            Ok(value) => Some(value.to_string()),
                            Err(_) => {
                                has_unsupported_path_encoding = true;
                                continue;
                            }
                        },
                        None => None,
                    };
                    let xy = xy.as_bytes();
                    (
                        ChangeCategory::Renamed,
                        path.to_string(),
                        original,
                        false,
                        xy.first().is_some_and(|value| *value != b'.'),
                        xy.get(1).is_some_and(|value| *value != b'.'),
                    )
                }
                // `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`
                Some(b'u') => {
                    let Some(rest) = record.strip_prefix("u ") else {
                        continue;
                    };
                    let Some(path) = rest.splitn(10, ' ').nth(9) else {
                        continue;
                    };
                    (
                        ChangeCategory::Conflicted,
                        path.to_string(),
                        None,
                        false,
                        true,
                        true,
                    )
                }
                Some(b'?') => {
                    let Some(path) = record.strip_prefix("? ") else {
                        continue;
                    };
                    (
                        ChangeCategory::New,
                        path.to_string(),
                        None,
                        true,
                        false,
                        true,
                    )
                }
                // `!` ignored entries are never requested, and anything else is
                // output this parser does not model.
                _ => continue,
            };

        entries.push(RawStatusEntry {
            path,
            original_path,
            category,
            is_untracked,
            is_prepared,
            has_unprepared_changes,
        });
    }

    ParsedStatusRecords {
        entries,
        upstream,
        has_unsupported_path_encoding,
    }
}

pub(crate) fn status_from_records(records: ParsedStatusRecords) -> WorkingTreeStatus {
    let mut status = WorkingTreeStatus {
        upstream: records.upstream,
        ..Default::default()
    };

    for raw in records.entries {
        status.has_prepared_changes |= raw.is_prepared;
        status.has_unprepared_changes |= raw.has_unprepared_changes;
        match raw.category {
            ChangeCategory::Changed => status.counts.changed += 1,
            ChangeCategory::New => status.counts.new_files += 1,
            ChangeCategory::Deleted => status.counts.deleted += 1,
            ChangeCategory::Renamed => status.counts.renamed += 1,
            ChangeCategory::Conflicted => status.counts.conflicted += 1,
        }
        status.counts.total += 1;

        if status.entries.len() < MAX_REPORTED_ENTRIES {
            status.entries.push(WorkingTreeEntry {
                path: raw.path,
                original_path: raw.original_path,
                category: raw.category,
                is_prepared: raw.is_prepared,
                has_unprepared_changes: raw.has_unprepared_changes,
            });
        } else {
            status.truncated = true;
        }
    }

    status.is_clean = status.counts.total == 0;
    status
}

#[cfg(test)]
pub(crate) fn parse_status_porcelain_v2(stdout: &[u8]) -> WorkingTreeStatus {
    status_from_records(parse_status_records(stdout))
}

pub(crate) fn unsupported_path_encoding_error() -> AppError {
    AppError::new(
        AppErrorCode::PathEncodingUnsupported,
        "This project contains a file path GitOdile can't represent safely.",
    )
    .with_remediation("Rename that file with a Unicode-compatible name, then refresh the project.")
}

pub(crate) fn checked_status_records(stdout: &[u8]) -> Result<ParsedStatusRecords, AppError> {
    let records = parse_status_records(stdout);
    if records.has_unsupported_path_encoding {
        Err(unsupported_path_encoding_error())
    } else {
        Ok(records)
    }
}

/// Finds the freshly-read status record for one repository-relative path.
/// Used by `read_file_diff` to re-validate a frontend-supplied path against
/// the *current* status rather than trusting a possibly-stale caller.
pub(crate) fn find_status_entry(
    stdout: &[u8],
    file_path: &str,
) -> Result<Option<RawStatusEntry>, AppError> {
    Ok(checked_status_records(stdout)?
        .entries
        .into_iter()
        .find(|entry| entry.path == file_path))
}

pub(crate) fn read_working_tree_status(path: String) -> Result<WorkingTreeStatus, AppError> {
    read_status_snapshot(path, true)
}

/// The same snapshot without its line totals. A caller that needs the counts
/// and the file list but not the diff's `+`/`-` numbers (a save plan) skips
/// `git diff --numstat` and the read of every new file that the totals cost.
pub(crate) fn read_working_tree_status_without_line_totals(
    path: String,
) -> Result<WorkingTreeStatus, AppError> {
    read_status_snapshot(path, false)
}

fn read_status_snapshot(
    path: String,
    with_line_totals: bool,
) -> Result<WorkingTreeStatus, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "read_working_tree_status", None).map_err(
            |error| match error.code {
                AppErrorCode::PathUnusable if !Path::new(&path).exists() => AppError::new(
                    AppErrorCode::PathMissing,
                    "That project folder doesn't exist anymore.",
                )
                .with_remediation("Reopen the project or remove it from the project list."),
                AppErrorCode::NotRepository => AppError::new(
                    AppErrorCode::GitCommandFailed,
                    "Git couldn't read the changes in this project.",
                )
                .with_remediation("Check that this is still a Git project and try again."),
                _ => error,
            },
        )?;
    let repo_path = Path::new(&path);
    let metadata = repo_path.metadata().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(
                AppErrorCode::PathMissing,
                "This project's folder is no longer there.",
            )
            .with_remediation("Open the project again, or choose another folder.")
        } else {
            AppError::new(
                AppErrorCode::PathUnusable,
                "This project's folder can't be read.",
            )
            .with_remediation("Check the folder permissions and try again.")
        }
    })?;
    if !metadata.is_dir() {
        return Err(AppError::new(
            AppErrorCode::PathUnusable,
            "This project's path isn't a folder any more.",
        )
        .with_remediation("Open the project again."));
    }

    let output = run_git(&path, &STATUS_ARGS)?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't check what changed in this project.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }

    let records = checked_status_records(&output.stdout)?;
    // The line totals are a summary of the same snapshot, so they are read
    // here rather than fetched separately; a failure to compute them only
    // hides the numbers, it never fails the status. Counting lines is diff
    // work, so the implementation lives in the changes module.
    let line_totals = if with_line_totals {
        crate::changes::working_tree_line_totals(&path, &records.entries).unwrap_or(None)
    } else {
        None
    };
    let mut status = status_from_records(records);
    status.line_totals = line_totals;
    status.paused_operation =
        crate::conflicts::paused_operation_marker(repository.git_dir.backend_path()).is_some();
    Ok(status)
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedVersionSummary {
    pub(crate) commit: String,
    pub(crate) short_commit: String,
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    /// `%cI` (committer date, ISO 8601 strict) — the same format already used
    /// for a branch's tip (`committerdate:iso-strict` in
    /// `for-each-ref`'s format string), so the frontend parses both the same
    /// way.
    pub(crate) committed_at: String,
    /// `%an` — the commit's author name, exactly as Git has it configured
    /// (may be empty on a malformed/legacy commit; the frontend hides its
    /// display rather than showing a blank chip).
    pub(crate) author: String,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PendingVersionsResult {
    pub(crate) total_count: u32,
    pub(crate) versions: Vec<SavedVersionSummary>,
    pub(crate) is_truncated: bool,
}

/// How many saved versions a `git log` summary call reports at most, whether
/// for the Overview's passive pending list or a publish plan's preview. Not a
/// hard guarantee against a much larger real gap — just enough for a
/// quick-glance list without shipping an unbounded payload.
pub(crate) const MAX_LISTED_SAVED_VERSIONS: usize = 50;

pub(crate) fn parse_saved_version_summaries(text: &str) -> Vec<SavedVersionSummary> {
    let fields = text.split('\0').collect::<Vec<_>>();
    fields
        .chunks(6)
        .filter(|parts| parts.len() == 6)
        .filter_map(|parts| {
            let commit = parts[0].trim();
            let short_commit = parts[1].trim();
            let title = parts[2].trim();
            let committed_at = parts[4].trim();
            if commit.is_empty()
                || short_commit.is_empty()
                || title.is_empty()
                || committed_at.is_empty()
            {
                return None;
            }
            let description = parts[3].trim();
            let author = parts[5].trim();
            Some(SavedVersionSummary {
                commit: commit.to_string(),
                short_commit: short_commit.to_string(),
                title: title.to_string(),
                description: (!description.is_empty()).then(|| description.to_string()),
                committed_at: committed_at.to_string(),
                author: author.to_string(),
            })
        })
        .collect()
}

/// Runs `git log` for `revisions` — a range, or a tip with its exclusions as
/// separate arguments — with hash/short-hash/subject/body/committer-date/
/// author-name in one machine-parseable pass, newest first and up to the
/// shared cap. NUL separates both fields and records because Git commit
/// messages cannot contain NUL bytes, while their bodies may contain any
/// number of ordinary lines. A failing range (e.g. a configured upstream that has never
/// been fetched locally, so Git can't resolve it as a revision yet) is
/// treated as "nothing reliable to report", not an error — callers show an
/// empty list rather than surfacing a spurious failure for something that
/// isn't actually broken.
pub(crate) fn git_log_summaries(
    path: &str,
    revisions: &[&str],
) -> Result<Vec<SavedVersionSummary>, AppError> {
    let cap = MAX_LISTED_SAVED_VERSIONS.to_string();
    let mut args = vec![
        "log",
        "-z",
        "--pretty=format:%H%x00%h%x00%s%x00%b%x00%cI%x00%an",
        "-n",
        &cap,
    ];
    args.extend_from_slice(revisions);
    let output = run_git(path, &args)?;
    let text = checked_git_stdout(output)?;
    if text.is_empty() {
        return Ok(Vec::new());
    }
    Ok(parse_saved_version_summaries(&text))
}

/// Read-only and local-only: never fetches. When an upstream is configured,
/// this only reflects the last-known remote-tracking ref (as of the most
/// recent fetch or publish) — the same "cached, possibly optimistic" signal
/// documented for the Overview's publish entry point, not a fresh preflight.
/// With no upstream configured yet, every local saved version is reported as
/// unpublished, since nothing is locally known to contradict that.
pub(crate) fn list_unpublished_versions(path: String) -> Result<PendingVersionsResult, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "list_unpublished_versions", None)?;
    let status = read_working_tree_status(path.clone())?;
    let (head_state, _) = resolve_head_state(&path, status.upstream.branch.clone())?;
    if head_state != HeadState::Branch {
        return Ok(PendingVersionsResult {
            total_count: 0,
            versions: Vec::new(),
            is_truncated: false,
        });
    }

    let upstream = status.upstream.upstream.as_deref();
    let revisions = match upstream {
        Some(upstream) if upstream_resolves(&path, upstream)? => {
            vec![format!("{upstream}..HEAD")]
        }
        // No upstream, or one whose tracking ref is gone (Git's `[gone]`):
        // what publishing would send is what no branch of the remote it would
        // choose holds — the same count the publish plan shows. A range over
        // a missing ref would fail, and plain `HEAD` would count every version
        // the remote's other branches already have.
        _ => {
            let remotes = list_remotes(&path)?;
            match resolve_remote_selection(&remotes, upstream, None) {
                Ok(remote) => {
                    let branch = upstream
                        .and_then(|upstream| upstream.strip_prefix(&format!("{remote}/")))
                        .unwrap_or("");
                    if branch.is_empty() {
                        vec![
                            "HEAD".to_string(),
                            "--not".to_string(),
                            format!("--remotes={remote}"),
                        ]
                    } else {
                        not_on_remote_revisions("HEAD", &remote, branch)
                    }
                }
                // No remote, or several with none chosen: nothing to compare
                // against, so every version is still only here.
                Err(_) => vec!["HEAD".to_string()],
            }
        }
    };
    let revisions = revisions.iter().map(String::as_str).collect::<Vec<_>>();
    versions_in_range(&path, &revisions)
}

/// Whether the upstream `git status` names still resolves: a remote-tracking
/// ref, or a local branch for a branch that tracks one (`remote = .`).
fn upstream_resolves(path: &str, upstream: &str) -> Result<bool, AppError> {
    let revision = format!("{upstream}^{{commit}}");
    Ok(
        run_git(path, &["rev-parse", "--verify", "--quiet", &revision])?
            .status
            .success(),
    )
}

/// Revisions for "the versions at `tip` that no branch of `remote` has": a
/// destination with no remote branch — never published, or deleted on the
/// remote — receives these, not the whole history. The destination's own
/// tracking ref is excluded, because a kept ref for a branch the remote
/// deleted still names every version it used to hold. Branch names cannot
/// contain glob characters, so the exclusion matches exactly that ref.
pub(crate) fn not_on_remote_revisions(
    tip: &str,
    remote: &str,
    destination_branch: &str,
) -> Vec<String> {
    vec![
        tip.to_string(),
        "--not".to_string(),
        format!("--exclude={remote}/{destination_branch}"),
        format!("--remotes={remote}"),
    ]
}

/// Read-only and local-only, the mirror of [`list_unpublished_versions`]: the
/// versions the last-known remote-tracking ref has and this branch does not —
/// what the last remote check brought down, never a fresh fetch. Overview
/// names them before the user chooses to get them. Without an upstream there
/// is nothing to receive.
pub(crate) fn list_incoming_versions(path: String) -> Result<PendingVersionsResult, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "list_incoming_versions", None)?;
    let status = read_working_tree_status(path.clone())?;
    let (head_state, _) = resolve_head_state(&path, status.upstream.branch.clone())?;
    let Some(upstream) = status
        .upstream
        .upstream
        .filter(|_| head_state == HeadState::Branch)
    else {
        return Ok(PendingVersionsResult {
            total_count: 0,
            versions: Vec::new(),
            is_truncated: false,
        });
    };
    versions_in_range(&path, &[&format!("HEAD..{upstream}")])
}

/// The versions in a `git log` range, counted in full and listed up to the
/// shared cap.
fn versions_in_range(path: &str, revisions: &[&str]) -> Result<PendingVersionsResult, AppError> {
    let mut args = vec!["rev-list", "--count"];
    args.extend_from_slice(revisions);
    let total_count = checked_git_stdout(run_git(path, &args)?)?
        .parse::<u32>()
        .map_err(|_| {
            AppError::new(
                AppErrorCode::GitCommandFailed,
                "GitOdile couldn't count the saved versions waiting to be published.",
            )
            .with_remediation("Refresh and try again.")
        })?;
    let versions = git_log_summaries(path, revisions)?;
    Ok(PendingVersionsResult {
        total_count,
        is_truncated: total_count as usize > versions.len(),
        versions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Joins porcelain-v2 records the way `-z` emits them: every record, and
    /// every rename's original path, is its own NUL-terminated field.
    fn porcelain_v2(records: &[&str]) -> Vec<u8> {
        let mut bytes = Vec::new();
        for record in records {
            bytes.extend_from_slice(record.as_bytes());
            bytes.push(0);
        }
        bytes
    }

    const HASHES: &str = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 \
                          e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";

    #[test]
    fn status_parser_reports_a_clean_repository() {
        let status = parse_status_porcelain_v2(&porcelain_v2(&[
            "# branch.oid 1234567890abcdef1234567890abcdef12345678",
            "# branch.head main",
        ]));

        assert!(status.is_clean);
        assert_eq!(status.counts, WorkingTreeCounts::default());
        assert!(status.entries.is_empty());
        assert!(!status.truncated);
        assert_eq!(status.upstream.branch, Some("main".to_string()));
    }

    #[test]
    fn status_parser_separates_staged_and_unstaged_modifications() {
        let staged = parse_status_porcelain_v2(&porcelain_v2(&[&format!(
            "1 M. N... 100644 100644 100644 {HASHES} staged.txt"
        )]));
        let unstaged = parse_status_porcelain_v2(&porcelain_v2(&[&format!(
            "1 .M N... 100644 100644 100644 {HASHES} unstaged.txt"
        )]));

        // Both are simply "changed" to the user: the index/worktree split is
        // not the product's primary concept.
        for status in [staged, unstaged] {
            assert!(!status.is_clean);
            assert_eq!(status.counts.changed, 1);
            assert_eq!(status.counts.total, 1);
            assert_eq!(status.entries[0].category, ChangeCategory::Changed);
        }
    }

    #[test]
    fn status_parser_classifies_every_category_in_a_mixed_status() {
        let status = parse_status_porcelain_v2(&porcelain_v2(&[
            "# branch.head main",
            "# branch.upstream origin/main",
            "# branch.ab +2 -3",
            &format!("1 .M N... 100644 100644 100644 {HASHES} changed.txt"),
            &format!("1 A. N... 100644 100644 100644 {HASHES} added.txt"),
            &format!("1 .D N... 100644 100644 000000 {HASHES} deleted.txt"),
            &format!("2 R. N... 100644 100644 100644 {HASHES} R100 renamed-new.txt"),
            "renamed-old.txt",
            &format!("u UU N... 100644 100644 100644 100644 {HASHES} e69de29 conflict.txt"),
            "? untracked.txt",
        ]));

        assert_eq!(
            status.counts,
            WorkingTreeCounts {
                changed: 1,
                new_files: 2,
                deleted: 1,
                renamed: 1,
                conflicted: 1,
                total: 6,
            }
        );
        assert!(!status.is_clean);
        assert_eq!(status.upstream.upstream, Some("origin/main".to_string()));
        assert_eq!(status.upstream.ahead, 2);
        assert_eq!(status.upstream.behind, 3);
    }

    #[test]
    fn status_parser_keeps_both_sides_of_a_rename() {
        let status = parse_status_porcelain_v2(&porcelain_v2(&[
            &format!("2 R. N... 100644 100644 100644 {HASHES} R100 new name.txt"),
            "old name.txt",
        ]));

        assert_eq!(status.counts.renamed, 1);
        assert_eq!(status.entries[0].category, ChangeCategory::Renamed);
        assert_eq!(status.entries[0].path, "new name.txt");
        assert_eq!(
            status.entries[0].original_path,
            Some("old name.txt".to_string())
        );
    }

    #[test]
    fn status_parser_preserves_paths_with_spaces_and_non_ascii_characters() {
        let status = parse_status_porcelain_v2(&porcelain_v2(&[
            &format!("1 .M N... 100644 100644 100644 {HASHES} src/a file — ñ.txt"),
            "? another new file.md",
        ]));

        assert_eq!(status.entries[0].path, "src/a file — ñ.txt");
        assert_eq!(status.entries[1].path, "another new file.md");
    }

    #[test]
    fn status_parser_does_not_present_a_detached_head_as_a_branch() {
        let status = parse_status_porcelain_v2(&porcelain_v2(&[
            "# branch.oid 1234567890abcdef1234567890abcdef12345678",
            "# branch.head (detached)",
        ]));

        assert_eq!(status.upstream.branch, None);
        assert!(status.is_clean);
    }

    #[test]
    fn status_parser_reports_an_unborn_branch_without_error() {
        let status = parse_status_porcelain_v2(&porcelain_v2(&[
            "# branch.oid (initial)",
            "# branch.head main",
            "? first.txt",
        ]));

        assert_eq!(status.upstream.branch, Some("main".to_string()));
        assert_eq!(status.counts.new_files, 1);
        assert!(!status.is_clean);
    }

    #[test]
    fn status_parser_caps_the_entry_list_but_never_the_counts() {
        let records: Vec<String> = (0..MAX_REPORTED_ENTRIES + 25)
            .map(|index| format!("? file-{index}.txt"))
            .collect();
        let borrowed: Vec<&str> = records.iter().map(String::as_str).collect();

        let status = parse_status_porcelain_v2(&porcelain_v2(&borrowed));

        assert!(status.truncated);
        assert_eq!(status.entries.len(), MAX_REPORTED_ENTRIES);
        assert_eq!(status.counts.new_files, MAX_REPORTED_ENTRIES + 25);
        assert_eq!(status.counts.total, MAX_REPORTED_ENTRIES + 25);
    }
}
