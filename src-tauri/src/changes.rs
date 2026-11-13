use crate::application;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{git_stdout, run_git, run_git_capped, CappedOutput};
use crate::status::{
    checked_status_records, find_status_entry, ChangeCategory, LineTotals, RawStatusEntry,
    MAX_REPORTED_ENTRIES, STATUS_ARGS,
};
use std::{
    io::{ErrorKind, Read},
    path::Path,
};

#[cfg(test)]
use crate::git_command::base_git_command;

// ---- File diff (task 009) ----

/// Git's well-known hash of the empty tree. It needs no lookup — an empty
/// tree has no entries — so it is always usable as a diff base, which lets an
/// unborn branch's files be diffed as additions instead of failing because
/// `HEAD` does not exist yet.
pub(crate) const EMPTY_TREE_HASH: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// Bounds the raw `git diff` output read into memory before parsing. Chosen
/// to comfortably fit ordinary reviewable diffs while capping worst-case
/// memory and IPC payload for pathological files. Hitting it returns an
/// explicit `too-large` result rather than a partial or frozen one.
pub(crate) const MAX_DIFF_OUTPUT_BYTES: usize = 2 * 1024 * 1024;

/// Bounds the number of parsed diff lines returned to the frontend. Only
/// reachable by very large hunks that already survived the byte cap above.
pub(crate) const MAX_DIFF_LINES: usize = 5000;

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub(crate) enum DiffLineKind {
    Context,
    Addition,
    Deletion,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiffLine {
    pub(crate) kind: DiffLineKind,
    pub(crate) content: String,
    pub(crate) old_line_number: Option<u32>,
    pub(crate) new_line_number: Option<u32>,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiffHunk {
    pub(crate) header: String,
    pub(crate) old_start: u32,
    pub(crate) old_lines: u32,
    pub(crate) new_start: u32,
    pub(crate) new_lines: u32,
    pub(crate) lines: Vec<DiffLine>,
}

/// Product-shaped diff result. Rust owns Git's unified-diff grammar entirely;
/// React only renders typed hunks and lines, never raw patch text.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum FileDiff {
    Text {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
        hunks: Vec<DiffHunk>,
        truncated: bool,
    },
    Binary {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
    },
    /// A binary file in a format the webview draws by itself. It deliberately
    /// carries no pixels: classification happens for every changed file in a
    /// batch, and a folder of screenshots must not turn a diff payload into a
    /// gallery. The bytes are fetched per file, on demand, by
    /// `read_file_image_preview` once the user actually opens it.
    Image {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
    },
    #[serde(rename = "too-large")]
    TooLarge {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
        limit_bytes: u64,
    },
    Conflict {
        path: String,
        hunks: Vec<DiffHunk>,
        truncated: bool,
        detail: Option<String>,
    },
    /// Git reports a difference (a pure rename, or a mode-only change) but
    /// there is no content to render as hunks. An empty `hunks` array on
    /// `Text` would look like an unexplained parsing failure instead.
    Unchanged {
        path: String,
        original_path: Option<String>,
        change: ChangeCategory,
    },
}

pub(crate) struct ParsedDiff {
    pub(crate) hunks: Vec<DiffHunk>,
    pub(crate) truncated: bool,
}

pub(crate) fn parse_range(value: &str) -> Option<(u32, u32)> {
    if let Some((start, count)) = value.split_once(',') {
        Some((start.parse().ok()?, count.parse().ok()?))
    } else {
        Some((value.parse().ok()?, 1))
    }
}

/// Parses a hunk header line, e.g. `@@ -3,7 +3,6 @@ optional section text`.
/// A side's count is omitted by Git when it is exactly 1 (`@@ -3 +3,2 @@`).
pub(crate) fn parse_hunk_header(line: &str) -> Option<(u32, u32, u32, u32)> {
    let rest = line.strip_prefix("@@ -")?;
    let close = rest.find(" @@")?;
    let ranges = &rest[..close];
    let (old, new) = ranges.split_once(" +")?;
    let (old_start, old_lines) = parse_range(old)?;
    let (new_start, new_lines) = parse_range(new)?;
    Some((old_start, old_lines, new_start, new_lines))
}

/// Parses unified-diff text into typed hunks and lines. Git always separates
/// diff lines with `\n`, even for files whose *content* uses CRLF, so
/// splitting on `\n` alone is correct: a trailing `\r` that belongs to the
/// file's own line ending is left in the line content rather than stripped.
/// Everything before the first hunk header (`diff --git`, `index`, `---`,
/// `+++`, `similarity index`, `rename from/to`, ...) is skipped.
pub(crate) fn parse_diff_body(text: &str) -> ParsedDiff {
    let mut hunks: Vec<DiffHunk> = Vec::new();
    let mut truncated = false;
    let mut total_lines = 0usize;
    let mut old_line = 0u32;
    let mut new_line = 0u32;

    for line in text.split('\n') {
        if truncated {
            break;
        }

        if line.starts_with("@@ -") {
            if let Some((old_start, old_lines, new_start, new_lines)) = parse_hunk_header(line) {
                old_line = old_start;
                new_line = new_start;
                hunks.push(DiffHunk {
                    header: line.to_string(),
                    old_start,
                    old_lines,
                    new_start,
                    new_lines,
                    lines: Vec::new(),
                });
            }
            continue;
        }

        let Some(current_hunk) = hunks.last_mut() else {
            continue;
        };

        let (kind, content, old_number, new_number) = if let Some(content) = line.strip_prefix(' ')
        {
            let numbers = (Some(old_line), Some(new_line));
            old_line += 1;
            new_line += 1;
            (DiffLineKind::Context, content, numbers.0, numbers.1)
        } else if let Some(content) = line.strip_prefix('+') {
            let number = new_line;
            new_line += 1;
            (DiffLineKind::Addition, content, None, Some(number))
        } else if let Some(content) = line.strip_prefix('-') {
            let number = old_line;
            old_line += 1;
            (DiffLineKind::Deletion, content, Some(number), None)
        } else {
            // `\ No newline at end of file`, or anything else this parser
            // does not model, is not a content line.
            continue;
        };

        current_hunk.lines.push(DiffLine {
            kind,
            content: content.to_string(),
            old_line_number: old_number,
            new_line_number: new_number,
        });
        total_lines += 1;
        if total_lines >= MAX_DIFF_LINES {
            truncated = true;
        }
    }

    ParsedDiff { hunks, truncated }
}

pub(crate) fn is_binary_diff_output(text: &str) -> bool {
    text.lines()
        .any(|line| line.starts_with("Binary files ") && line.trim_end().ends_with(" differ"))
}

pub(crate) enum DiffStrategy {
    /// The ordinary case: compare the worktree against `HEAD` (or the empty
    /// tree on an unborn branch). `git diff <base> -- <path>` reflects the
    /// complete unsaved change regardless of whether it is staged, unstaged,
    /// or both, because Git compares the worktree file to `<base>` directly.
    AgainstBase,
    /// A file `git status` reports as untracked has no entry in the index or
    /// `HEAD`, so `git diff HEAD` silently ignores it. `git diff --no-index`
    /// against a genuinely empty temporary file produces a pure-addition
    /// diff without relying on `/dev/null`, which is not a reliable sentinel
    /// path across platforms.
    Untracked,
    /// Restricts the base comparison to both the old and new paths so Git's
    /// rename pairing has both sides of the pair to match.
    Rename,
}

/// Resolves the base revision for `AgainstBase`/`Rename` diffs: `HEAD` when
/// it exists, otherwise the empty tree so new files on an unborn branch
/// render as additions instead of failing.
pub(crate) fn diff_base_rev(path: &str) -> Result<String, AppError> {
    let head = run_git(path, &["rev-parse", "--verify", "-q", "HEAD"])?;
    Ok(if head.status.success() {
        "HEAD".to_string()
    } else {
        EMPTY_TREE_HASH.to_string()
    })
}

/// Writes a genuinely empty temporary file and runs `git diff --no-index`
/// against it, then removes the temporary file. The temporary path is
/// absolute and outside the repository; `--no-index` accepts arbitrary
/// filesystem paths on either side, so this does not depend on the
/// repository's working directory.
pub(crate) fn run_untracked_diff(path: &str, file_path: &str) -> Result<CappedOutput, AppError> {
    let mut temp_path = std::env::temp_dir();
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    temp_path.push(format!(
        "gitodile-empty-{}-{unique}.tmp",
        std::process::id()
    ));
    std::fs::write(&temp_path, b"").map_err(|_| {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this file's difference.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable.")
    })?;
    let temp_path_string = temp_path.to_string_lossy().to_string();

    let result = run_git_capped(
        path,
        &[
            "diff",
            "--no-color",
            "--no-ext-diff",
            "--no-index",
            "--",
            &temp_path_string,
            file_path,
        ],
        MAX_DIFF_OUTPUT_BYTES,
    );
    let _ = std::fs::remove_file(&temp_path);
    result
}

pub(crate) fn run_diff_command(
    path: &str,
    strategy: &DiffStrategy,
    entry: &RawStatusEntry,
) -> Result<CappedOutput, AppError> {
    match strategy {
        DiffStrategy::AgainstBase => {
            let base = diff_base_rev(path)?;
            run_git_capped(
                path,
                &[
                    "diff",
                    "--no-color",
                    "--no-ext-diff",
                    &base,
                    "--",
                    &entry.path,
                ],
                MAX_DIFF_OUTPUT_BYTES,
            )
        }
        DiffStrategy::Rename => {
            let base = diff_base_rev(path)?;
            let original = entry.original_path.as_deref().unwrap_or(&entry.path);
            run_git_capped(
                path,
                &[
                    "diff",
                    "--no-color",
                    "--no-ext-diff",
                    "-M",
                    &base,
                    "--",
                    original,
                    &entry.path,
                ],
                MAX_DIFF_OUTPUT_BYTES,
            )
        }
        DiffStrategy::Untracked => run_untracked_diff(path, &entry.path),
    }
}

/// `git diff --no-index` mirrors the standalone `diff` command's exit codes:
/// 0 means no differences, 1 means differences were found (not an error), and
/// 2+ means real trouble. Every other diff invocation in this module uses
/// Git's ordinary in-repository exit convention, where 0 always means success
/// regardless of whether differences were found.
pub(crate) fn diff_output_is_success(strategy: &DiffStrategy, output: &CappedOutput) -> bool {
    match strategy {
        DiffStrategy::Untracked => matches!(output.status.code(), Some(0) | Some(1)),
        DiffStrategy::AgainstBase | DiffStrategy::Rename => output.status.success(),
    }
}

/// Shared by the single-file (`read_file_diff`) and batched
/// (`read_working_tree_diffs`) paths, so a file's classification (binary,
/// too-large, unchanged, text-with-hunks) never depends on which path fetched
/// it. `too_large` is decided by the caller: the single-file path checks
/// `CappedOutput::limit_exceeded` from its own dedicated-size invocation,
/// while the batch path checks each file's *section* length against the same
/// `MAX_DIFF_OUTPUT_BYTES` threshold, since the whole combined invocation is
/// capped much higher.
pub(crate) fn diff_result_from_text(
    entry: &RawStatusEntry,
    text: &str,
    too_large: bool,
) -> FileDiff {
    if too_large {
        return FileDiff::TooLarge {
            path: entry.path.clone(),
            original_path: entry.original_path.clone(),
            change: entry.category,
            limit_bytes: MAX_DIFF_OUTPUT_BYTES as u64,
        };
    }

    if is_binary_diff_output(text) {
        // Git has already decided this file is binary; the only remaining
        // question is whether it is one the webview can draw. The answer is
        // taken from the path, because a tracked file's bytes are not in
        // hand here — Git printed a one-line marker instead of them. Content
        // still gets the last word: `read_file_image_preview` sniffs the real
        // bytes and reports an unrecognized format as unsupported, so a text
        // file named `.png` degrades to this same note rather than to a
        // broken frame.
        if is_binary_image_path(&entry.path) {
            return FileDiff::Image {
                path: entry.path.clone(),
                original_path: entry.original_path.clone(),
                change: entry.category,
            };
        }
        return FileDiff::Binary {
            path: entry.path.clone(),
            original_path: entry.original_path.clone(),
            change: entry.category,
        };
    }

    let parsed = parse_diff_body(text);
    if parsed.hunks.is_empty() {
        return FileDiff::Unchanged {
            path: entry.path.clone(),
            original_path: entry.original_path.clone(),
            change: entry.category,
        };
    }

    FileDiff::Text {
        path: entry.path.clone(),
        original_path: entry.original_path.clone(),
        change: entry.category,
        hunks: parsed.hunks,
        truncated: parsed.truncated,
    }
}

pub(crate) fn build_text_result(entry: &RawStatusEntry, output: &CappedOutput) -> FileDiff {
    diff_result_from_text(
        entry,
        &String::from_utf8_lossy(&output.stdout),
        output.limit_exceeded,
    )
}

/// Conflict inspection is informational only (see task decisions), so a
/// diff that cannot be produced is reported as an honest conflict-specific
/// explanation rather than failing the whole command.
pub(crate) fn build_conflict_result(path: &str, entry: &RawStatusEntry) -> FileDiff {
    let unavailable = || FileDiff::Conflict {
        path: entry.path.clone(),
        hunks: Vec::new(),
        truncated: false,
        detail: Some("unavailable".to_string()),
    };

    let Ok(base) = diff_base_rev(path) else {
        return unavailable();
    };
    let Ok(output) = run_git_capped(
        path,
        &[
            "diff",
            "--no-color",
            "--no-ext-diff",
            &base,
            "--",
            &entry.path,
        ],
        MAX_DIFF_OUTPUT_BYTES,
    ) else {
        return unavailable();
    };
    if output.limit_exceeded {
        return FileDiff::Conflict {
            path: entry.path.clone(),
            hunks: Vec::new(),
            truncated: false,
            detail: Some("too-large".to_string()),
        };
    }
    if !output.status.success() {
        return unavailable();
    }

    let text = String::from_utf8_lossy(&output.stdout);
    if is_binary_diff_output(&text) {
        return FileDiff::Conflict {
            path: entry.path.clone(),
            hunks: Vec::new(),
            truncated: false,
            detail: Some("binary".to_string()),
        };
    }

    let parsed = parse_diff_body(&text);
    FileDiff::Conflict {
        path: entry.path.clone(),
        hunks: parsed.hunks,
        truncated: parsed.truncated,
        detail: None,
    }
}

/// Rejects absolute paths, parent traversal, and Windows drive/UNC prefixes
/// before the path is ever considered for lookup. Membership in the freshly
/// read status (checked afterwards) is the authoritative containment check;
/// this is a cheap, fast-failing first line of defense.
pub(crate) fn validate_repo_relative_path(file_path: &str) -> Result<(), AppError> {
    let invalid = || {
        AppError::new(AppErrorCode::PathInvalid, "That file path isn't valid.")
            .with_remediation("Refresh the changes list and choose the file again.")
    };
    if file_path.is_empty() {
        return Err(invalid());
    }
    let path = Path::new(file_path);
    if path.is_absolute() {
        return Err(invalid());
    }
    let has_unsafe_component = path.components().any(|component| {
        matches!(
            component,
            std::path::Component::ParentDir
                | std::path::Component::Prefix(_)
                | std::path::Component::RootDir
        )
    });
    if has_unsafe_component {
        return Err(invalid());
    }
    Ok(())
}

pub(crate) fn read_file_diff(path: String, file_path: String) -> Result<FileDiff, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "read_file_diff", None)?;
    validate_repo_relative_path(&file_path)?;

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

    let status_output = run_git(&path, &STATUS_ARGS)?;
    if !status_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't check what changed in this project.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }

    let entry = find_status_entry(&status_output.stdout, &file_path)?.ok_or_else(|| {
        AppError::new(
            AppErrorCode::PathNotChanged,
            "This file is no longer part of the unsaved changes.",
        )
        .with_remediation("Refresh the list and choose a file that is still listed.")
    })?;

    if entry.category == ChangeCategory::Conflicted {
        return Ok(build_conflict_result(&path, &entry));
    }

    let strategy = if entry.category == ChangeCategory::Renamed {
        DiffStrategy::Rename
    } else if entry.is_untracked {
        DiffStrategy::Untracked
    } else {
        DiffStrategy::AgainstBase
    };

    let output = run_diff_command(&path, &strategy, &entry)?;
    if output.limit_exceeded {
        return Ok(build_text_result(&entry, &output));
    }
    if !diff_output_is_success(&strategy, &output) {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this file's difference.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }

    Ok(build_text_result(&entry, &output))
}

// ---- Batched working-tree diffs (extra optimization, task 010) ----
//
// `read_file_diff` spawns at least two Git processes per call (a fresh
// status re-validation plus a dedicated `git diff` for that one path), which
// is the dominant cost when switching between files quickly — not IPC, not
// parsing. This command answers "the diff for every currently changed file"
// with one `git status` and, for ordinary tracked changes, exactly one more
// `git diff` process covering all of them at once. The frontend uses it to
// warm its cache right after the working tree loads, so most clicks become
// pure cache hits instead of a fresh process spawn. It is a read-only,
// best-effort *supplement* to `read_file_diff`, not a replacement: entries it
// cannot or does not cover (conflicts, a file whose section did not fit
// before the combined output was capped, or a failed batch) are simply
// absent from the result, and the frontend falls back to `read_file_diff`
// for exactly those paths.

/// Emergency ceiling for one combined `git diff` invocation, higher than
/// `MAX_DIFF_OUTPUT_BYTES` (which bounds one file) because this covers every
/// ordinary tracked change in the project at once. It exists so a pathological
/// changeset can't block the UI or exhaust memory in the Git reader; it is
/// deliberately *not* the size of a normal response. Callers pass their own
/// budget and `batch_output_cap` clamps it here; see `batch_tracked_diffs` for
/// how a cap reached mid-file is handled safely.
pub(crate) const MAX_BATCH_DIFF_OUTPUT_BYTES: usize = 16 * 1024 * 1024;

/// How much aggregate diff data a *speculative* warm may pull across IPC and
/// into renderer caches. An eighth of the emergency ceiling: enough that an
/// ordinary changeset is warmed whole, small enough that a huge one cannot
/// turn a cache convenience into a multi-megabyte payload nobody asked for.
/// Anything past it is reported as truncated, and the selected file still
/// loads on demand through `read_file_diff`.
pub(crate) const MAX_WARM_DIFF_OUTPUT_BYTES: usize = 2 * 1024 * 1024;

/// Pre-flight eligibility: past this many changed entries the warm is skipped
/// before a single diff process is spawned. A changeset this size is one the
/// user navigates file by file, so paying for the aggregate read (and holding
/// its result) buys nothing. Well under the 1,000-entry working-tree payload
/// cap, so a deferred warm is still a normal, fully usable Changes screen.
pub(crate) const MAX_WARM_CHANGED_FILES: usize = 250;

/// The requested budget, never above the emergency ceiling.
pub(crate) fn batch_output_cap(requested_bytes: usize) -> usize {
    requested_bytes.min(MAX_BATCH_DIFF_OUTPUT_BYTES)
}

/// Why a speculative warm produced what it produced. The frontend needs to
/// tell "these are all the diffs" from "this was deliberately cut short",
/// because the second case must not be mistaken for preloaded completeness —
/// and must not trigger a per-file fallback storm either.
#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum DiffWarmOutcome {
    /// Every eligible change is present in `diffs`.
    Completed,
    /// The budget was reached; `diffs` holds what fit, in Git's own order.
    Truncated,
    /// The changeset was not eligible, so no aggregate diff was read at all.
    Deferred,
}

/// Response of `read_working_tree_diffs`: the warmed diffs plus the policy
/// decision that produced them.
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkingTreeDiffBatch {
    pub(crate) outcome: DiffWarmOutcome,
    pub(crate) diffs: Vec<FileDiff>,
    /// Changed entries the working tree reported, warmed or not.
    pub(crate) changed_files: u32,
    /// The speculative budget this decision was made against, so the renderer
    /// reports the same number the backend enforced.
    pub(crate) budget_bytes: u64,
}

/// Git's own heuristic for "treat this as binary": a NUL byte anywhere in a
/// bounded prefix. Only needed for untracked files, which this command reads
/// directly from disk instead of spawning `git diff --no-index` per file;
/// every other path's binary detection still goes through Git's own output
/// (`is_binary_diff_output`), which stays authoritative there.
pub(crate) const BINARY_SNIFF_BYTES: usize = 8000;

pub(crate) fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(BINARY_SNIFF_BYTES).any(|&byte| byte == 0)
}

/// Splits `text` into per-file sections at each line beginning with
/// `diff --git `, without needing to parse (and possibly un-quote) the path
/// on that branch. Sections are returned in the same order Git printed them,
/// which — for the identical base/flags/pathspec — is also the order
/// `--name-only -z` reports, so the two can be zipped positionally.
pub(crate) fn split_diff_sections(text: &str) -> Vec<&str> {
    const MARKER: &str = "diff --git ";
    let mut starts: Vec<usize> = Vec::new();
    if text.starts_with(MARKER) {
        starts.push(0);
    }
    let mut search_from = 0;
    while let Some(relative) = text[search_from..].find("\ndiff --git ") {
        let start = search_from + relative + 1;
        starts.push(start);
        search_from = start + MARKER.len();
    }
    starts
        .iter()
        .enumerate()
        .map(|(index, &start)| {
            let end = starts.get(index + 1).copied().unwrap_or(text.len());
            &text[start..end]
        })
        .collect()
}

/// Splits file content into lines the same way `parse_diff_body` treats
/// hunk lines: on `\n` only (never touching a lone `\r`, which belongs to the
/// file's own CRLF line endings), and without fabricating a phantom trailing
/// empty line for a file that ends with a newline.
pub(crate) fn split_content_lines(content: &str) -> Vec<&str> {
    if content.is_empty() {
        return Vec::new();
    }
    let mut lines: Vec<&str> = content.split('\n').collect();
    if content.ends_with('\n') {
        lines.pop();
    }
    lines
}

/// Builds an untracked file's diff by reading it directly from disk instead
/// of spawning `git diff --no-index` — an untracked file's diff is always
/// "every line is an addition," which needs no Git process to compute.
pub(crate) fn untracked_file_diff(repo_path: &Path, entry: &RawStatusEntry) -> FileDiff {
    let full_path = repo_path.join(&entry.path);
    let Ok(bytes) = std::fs::read(&full_path) else {
        // Unreadable (permissions, a broken symlink, a race with deletion):
        // report it as absent from the batch rather than guessing; the
        // frontend's per-file fallback will surface a proper error.
        return FileDiff::Unchanged {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
        };
    };

    if bytes.len() as u64 > MAX_DIFF_OUTPUT_BYTES as u64 {
        return FileDiff::TooLarge {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
            limit_bytes: MAX_DIFF_OUTPUT_BYTES as u64,
        };
    }
    // An untracked file arrives with its bytes already read, so both halves of
    // the question can be answered at once. Naming and content must agree:
    // the extension decides how the preview will be requested, and the magic
    // bytes confirm the file really is that. Requiring both keeps this path's
    // classification identical to the tracked one, which only has the name.
    if is_binary_image_path(&entry.path) && sniff_image_media_type(&bytes).is_some() {
        return FileDiff::Image {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
        };
    }
    if looks_binary(&bytes) {
        return FileDiff::Binary {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
        };
    }

    let text = String::from_utf8_lossy(&bytes);
    let lines = split_content_lines(&text);
    if lines.is_empty() {
        return FileDiff::Unchanged {
            path: entry.path.clone(),
            original_path: None,
            change: entry.category,
        };
    }

    let truncated = lines.len() > MAX_DIFF_LINES;
    let included = if truncated {
        &lines[..MAX_DIFF_LINES]
    } else {
        &lines[..]
    };
    let diff_lines = included
        .iter()
        .enumerate()
        .map(|(index, content)| DiffLine {
            kind: DiffLineKind::Addition,
            content: (*content).to_string(),
            old_line_number: None,
            new_line_number: Some(index as u32 + 1),
        })
        .collect::<Vec<_>>();

    FileDiff::Text {
        path: entry.path.clone(),
        original_path: None,
        change: entry.category,
        hunks: vec![DiffHunk {
            header: format!("@@ -0,0 +1,{} @@", diff_lines.len()),
            old_start: 0,
            old_lines: 0,
            new_start: 1,
            new_lines: diff_lines.len() as u32,
            lines: diff_lines,
        }],
        truncated,
    }
}

/// Added and removed line counts for a whole working tree, or `None` when the
/// number would be a floor rather than the answer.
///
/// Tracked changes come from one `git diff --numstat`, which is numeric and
/// therefore locale-independent; binary files print `-` counts and contribute
/// nothing, which is a fact rather than a gap. Untracked files have no index
/// or `HEAD` entry, so Git's own diff ignores them: their every line is
/// counted as an addition, exactly the way the Changes view draws them, by
/// reading the file from disk.
///
/// `None` is the honest answer when any part of the tree could not be counted
/// — an oversize or truncated untracked file, or a status whose entry list was
/// itself capped — because a total the reader would take as exact must never
/// quietly understate a large change set. The frontend hides the numbers in
/// that case rather than showing a partial sum.
pub(crate) fn working_tree_line_totals(
    path: &str,
    entries: &[RawStatusEntry],
) -> Result<Option<LineTotals>, AppError> {
    if entries.is_empty() || entries.len() > MAX_REPORTED_ENTRIES {
        return Ok(None);
    }
    let base = diff_base_rev(path)?;
    let output = run_git(
        path,
        &["diff", "--no-color", "--numstat", "-z", "-M", &base, "--"],
    )?;
    if !output.status.success() {
        return Ok(None);
    }
    let mut totals = parse_numstat(&String::from_utf8_lossy(&output.stdout));
    let repo_path = Path::new(path);
    for entry in entries.iter().filter(|entry| entry.is_untracked) {
        match untracked_file_diff(repo_path, entry) {
            FileDiff::Text {
                hunks,
                truncated: false,
                ..
            } => {
                for hunk in hunks {
                    totals.added += hunk
                        .lines
                        .iter()
                        .filter(|line| line.kind == DiffLineKind::Addition)
                        .count() as u64;
                }
            }
            // A truncated read or an oversize file is a floor, not the total.
            FileDiff::Text { .. } | FileDiff::TooLarge { .. } => return Ok(None),
            _ => {}
        }
    }
    Ok(Some(totals))
}

/// Sums one `git diff --numstat -z` pass: `<added>\t<removed>\t<path>\0` per
/// file, with a rename's two paths emitted as their own NUL fields. Those
/// trailing path fields carry no leading counts and are skipped, and so is a
/// binary file's `-` count. Strictly numeric, so no locale handling is needed.
pub(crate) fn parse_numstat(text: &str) -> LineTotals {
    let mut totals = LineTotals::default();
    for record in text.split('\0') {
        let mut fields = record.splitn(3, '\t');
        let (Some(added), Some(removed)) = (fields.next(), fields.next()) else {
            continue;
        };
        if let (Ok(added), Ok(removed)) =
            (added.trim().parse::<u64>(), removed.trim().parse::<u64>())
        {
            totals.added += added;
            totals.removed += removed;
        }
    }
    totals
}

/// What one batched tracked-diff pass produced, and what it cost against the
/// caller's budget.
pub(crate) struct BatchedTrackedDiffs {
    pub(crate) diffs: Vec<FileDiff>,
    /// True when Git's combined output reached the cap, so some changed files
    /// have no diff here and must be loaded on demand.
    pub(crate) truncated: bool,
    /// Bytes of Git output actually read, for budgeting the rest of the batch.
    pub(crate) output_bytes: usize,
}

/// Batches every ordinary (non-conflicted, tracked) change into one `git
/// diff` process. Renamed entries contribute both their old and new path to
/// the pathspec, matching the single-file `Rename` strategy, so Git's rename
/// pairing still has both sides to match.
///
/// `budget_bytes` is the caller's own ceiling for this response — a
/// speculative warm asks for much less than the emergency cap — and is clamped
/// by `batch_output_cap` so no caller can raise it above
/// `MAX_BATCH_DIFF_OUTPUT_BYTES`.
pub(crate) fn batch_tracked_diffs(
    path: &str,
    base: &str,
    entries: &[&RawStatusEntry],
    budget_bytes: usize,
) -> Result<BatchedTrackedDiffs, AppError> {
    if entries.is_empty() {
        return Ok(BatchedTrackedDiffs {
            diffs: Vec::new(),
            truncated: false,
            output_bytes: 0,
        });
    }

    let mut pathspecs: Vec<&str> = Vec::with_capacity(entries.len() * 2);
    for entry in entries {
        if let Some(original) = &entry.original_path {
            pathspecs.push(original);
        }
        pathspecs.push(&entry.path);
    }

    // Pass 1: the ordered, unambiguous list of paths this exact diff will
    // emit sections for. `-z` keeps it NUL-separated so no path (however it
    // would otherwise need quoting) can be misread.
    let mut name_args = vec![
        "diff",
        "--no-color",
        "--no-ext-diff",
        "-M",
        "-z",
        "--name-only",
        base,
        "--",
    ];
    name_args.extend(pathspecs.iter().copied());
    let name_output = run_git(path, &name_args)?;
    if !name_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't list which files changed.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }
    let ordered_paths: Vec<String> = name_output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|segment| !segment.is_empty())
        .map(|segment| String::from_utf8_lossy(segment).into_owned())
        .collect();

    // Pass 2: the actual patch text, from the identical base/flags/pathspec,
    // so Git computes and orders it identically to pass 1.
    let mut diff_args = vec!["diff", "--no-color", "--no-ext-diff", "-M", base, "--"];
    diff_args.extend(pathspecs.iter().copied());
    let capped = run_git_capped(path, &diff_args, batch_output_cap(budget_bytes))?;
    if !capped.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read these files' differences.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }

    let text = String::from_utf8_lossy(&capped.stdout);
    let mut sections = split_diff_sections(&text);
    if capped.limit_exceeded {
        // The combined output was cut mid-stream, so the last section (if
        // any) may be an incomplete file rather than a real one. Dropping it
        // is always safe: every path it would have covered still gets a
        // result from the frontend's per-file fallback.
        sections.pop();
    }

    let mut results = Vec::with_capacity(sections.len());
    for (name, section) in ordered_paths.iter().zip(sections.iter()) {
        let Some(entry) = entries.iter().find(|entry| &entry.path == name) else {
            // A rename's *old* path can appear here if similarity fell below
            // Git's detection threshold and it downgraded to a delete+add;
            // that old path isn't one of our known entries, so skip it.
            continue;
        };
        let too_large = section.len() > MAX_DIFF_OUTPUT_BYTES;
        results.push(diff_result_from_text(entry, section, too_large));
    }
    Ok(BatchedTrackedDiffs {
        diffs: results,
        truncated: capped.limit_exceeded,
        output_bytes: capped.stdout.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASHES: &str =
        "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";

    fn porcelain_v2(records: &[&str]) -> Vec<u8> {
        let mut bytes = Vec::new();
        for record in records {
            bytes.extend_from_slice(record.as_bytes());
            bytes.push(0);
        }
        bytes
    }

    fn sample_entry(path: &str, category: ChangeCategory) -> RawStatusEntry {
        RawStatusEntry {
            path: path.to_string(),
            original_path: None,
            category,
            is_untracked: false,
            is_prepared: false,
            has_unprepared_changes: true,
        }
    }

    /// A real exit status with fabricated stdout, for testing the pure
    /// stdout, for testing the pure functions that turn `git diff` output
    /// into a `FileDiff` without needing a matching real diff to produce it.
    fn fake_output(stdout: &str) -> CappedOutput {
        let real = base_git_command()
            .arg("--version")
            .output()
            .expect("run git --version");
        CappedOutput {
            stdout: stdout.as_bytes().to_vec(),
            status: real.status,
            limit_exceeded: stdout.len() > MAX_DIFF_OUTPUT_BYTES,
        }
    }

    #[test]
    fn parse_hunk_header_parses_standard_and_omitted_counts() {
        assert_eq!(
            parse_hunk_header("@@ -3,7 +3,6 @@ fn foo() {"),
            Some((3, 7, 3, 6))
        );
        assert_eq!(parse_hunk_header("@@ -1 +1,2 @@"), Some((1, 1, 1, 2)));
        assert_eq!(parse_hunk_header("@@ -0,0 +1,3 @@"), Some((0, 0, 1, 3)));
        assert_eq!(parse_hunk_header("not a header"), None);
    }

    #[test]
    fn parse_diff_body_numbers_context_addition_and_deletion_lines() {
        let text = "diff --git a/f.txt b/f.txt\nindex 111..222 100644\n--- a/f.txt\n+++ b/f.txt\n@@ -1,3 +1,3 @@\n context\n-old\n+new\n context2\n";
        let parsed = parse_diff_body(text);

        assert_eq!(parsed.hunks.len(), 1);
        let lines = &parsed.hunks[0].lines;
        assert_eq!(
            lines[0],
            DiffLine {
                kind: DiffLineKind::Context,
                content: "context".to_string(),
                old_line_number: Some(1),
                new_line_number: Some(1),
            }
        );
        assert_eq!(
            lines[1],
            DiffLine {
                kind: DiffLineKind::Deletion,
                content: "old".to_string(),
                old_line_number: Some(2),
                new_line_number: None,
            }
        );
        assert_eq!(
            lines[2],
            DiffLine {
                kind: DiffLineKind::Addition,
                content: "new".to_string(),
                old_line_number: None,
                new_line_number: Some(2),
            }
        );
        assert_eq!(
            lines[3],
            DiffLine {
                kind: DiffLineKind::Context,
                content: "context2".to_string(),
                old_line_number: Some(3),
                new_line_number: Some(3),
            }
        );
        assert!(!parsed.truncated);
    }

    #[test]
    fn parse_numstat_sums_records_and_ignores_binary_counts_and_rename_paths() {
        let text = concat!(
            "3\t1\tmodified.txt\0",
            // A binary file reports `-` counts and contributes nothing.
            "-\t-\timage.png\0",
            // A rename's added/removed pair carries an empty path, with the
            // two real paths in their own count-less NUL fields.
            "1\t0\t\0old name.txt\0new name.txt\0",
        );
        let totals = parse_numstat(text);

        assert_eq!(totals.added, 4);
        assert_eq!(totals.removed, 1);
    }

    #[test]
    fn parse_numstat_returns_zero_for_no_records() {
        assert_eq!(parse_numstat(""), LineTotals::default());
    }

    #[test]
    fn parse_diff_body_handles_multiple_hunks() {
        let text = "@@ -1,1 +1,1 @@\n-a\n+b\n@@ -10,1 +10,1 @@\n-c\n+d\n";
        let parsed = parse_diff_body(text);

        assert_eq!(parsed.hunks.len(), 2);
        assert_eq!(parsed.hunks[0].old_start, 1);
        assert_eq!(parsed.hunks[1].old_start, 10);
    }

    #[test]
    fn parse_diff_body_ignores_the_no_newline_marker() {
        let text = "@@ -1,1 +1,1 @@\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n";
        let parsed = parse_diff_body(text);

        assert_eq!(parsed.hunks[0].lines.len(), 2);
    }

    #[test]
    fn parse_diff_body_truncates_after_the_line_cap() {
        let mut text = String::from("@@ -1,1 +1,20000 @@\n");
        for index in 0..MAX_DIFF_LINES + 50 {
            text.push_str(&format!("+line {index}\n"));
        }

        let parsed = parse_diff_body(&text);

        assert!(parsed.truncated);
        assert_eq!(parsed.hunks[0].lines.len(), MAX_DIFF_LINES);
    }

    #[test]
    fn build_text_result_flags_binary_marker_output() {
        let entry = sample_entry("archive.bin", ChangeCategory::Changed);
        let output = fake_output("Binary files a/archive.bin and b/archive.bin differ\n");

        assert!(matches!(
            build_text_result(&entry, &output),
            FileDiff::Binary { .. }
        ));
    }

    #[test]
    fn build_text_result_calls_a_binary_image_an_image() {
        let entry = sample_entry("logo.PNG", ChangeCategory::Changed);
        let output = fake_output("Binary files a/logo.PNG and b/logo.PNG differ\n");

        assert!(matches!(
            build_text_result(&entry, &output),
            FileDiff::Image { .. }
        ));
    }

    #[test]
    fn image_media_type_covers_the_formats_the_webview_draws() {
        assert_eq!(image_media_type_for_path("a/logo.png"), Some("image/png"));
        assert_eq!(image_media_type_for_path("photo.JPEG"), Some("image/jpeg"));
        assert_eq!(image_media_type_for_path("icon.svg"), Some("image/svg+xml"));
        assert_eq!(image_media_type_for_path("notes.txt"), None);
        assert_eq!(image_media_type_for_path("png"), None);
    }

    #[test]
    fn sniffing_answers_from_content_not_from_the_name() {
        assert_eq!(
            sniff_image_media_type(b"\x89PNG\r\n\x1a\nrest"),
            Some("image/png")
        );
        assert_eq!(sniff_image_media_type(b"GIF89a..."), Some("image/gif"));
        assert_eq!(
            sniff_image_media_type(b"RIFF\0\0\0\0WEBPVP8 "),
            Some("image/webp")
        );
        assert_eq!(
            sniff_image_media_type(b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"),
            Some("image/svg+xml")
        );
        assert_eq!(sniff_image_media_type(b"just text"), None);
    }

    #[test]
    fn base64_encodes_with_the_expected_padding() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64_encode(&[0xFF, 0xEE, 0xDD]), "/+7d");
    }

    #[test]
    fn build_text_result_flags_output_over_the_byte_limit() {
        let entry = sample_entry("huge.txt", ChangeCategory::Changed);
        let big = "a".repeat(MAX_DIFF_OUTPUT_BYTES + 1);
        let output = fake_output(&big);

        match build_text_result(&entry, &output) {
            FileDiff::TooLarge { limit_bytes, .. } => {
                assert_eq!(limit_bytes, MAX_DIFF_OUTPUT_BYTES as u64);
            }
            other => panic!("expected too-large, got {other:?}"),
        }
    }

    #[test]
    fn build_text_result_returns_unchanged_for_a_pure_rename_header() {
        let entry = RawStatusEntry {
            path: "new.txt".to_string(),
            original_path: Some("old.txt".to_string()),
            category: ChangeCategory::Renamed,
            is_untracked: false,
            is_prepared: true,
            has_unprepared_changes: false,
        };
        let output = fake_output(
            "diff --git a/old.txt b/new.txt\nsimilarity index 100%\nrename from old.txt\nrename to new.txt\n",
        );

        assert!(matches!(
            build_text_result(&entry, &output),
            FileDiff::Unchanged { .. }
        ));
    }

    #[test]
    fn validate_repo_relative_path_rejects_absolute_and_traversal_paths() {
        assert_eq!(
            validate_repo_relative_path("").unwrap_err().code,
            AppErrorCode::PathInvalid
        );
        assert_eq!(
            validate_repo_relative_path("/etc/passwd").unwrap_err().code,
            AppErrorCode::PathInvalid
        );
        assert_eq!(
            validate_repo_relative_path("../outside.txt")
                .unwrap_err()
                .code,
            AppErrorCode::PathInvalid
        );
        assert_eq!(
            validate_repo_relative_path("src/../../outside.txt")
                .unwrap_err()
                .code,
            AppErrorCode::PathInvalid
        );
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn validate_repo_relative_path_rejects_a_windows_drive_path() {
        assert_eq!(
            validate_repo_relative_path("C:/Windows/system.ini")
                .unwrap_err()
                .code,
            AppErrorCode::PathInvalid
        );
    }

    #[test]
    fn validate_repo_relative_path_accepts_ordinary_relative_paths() {
        assert!(validate_repo_relative_path("src/main.rs").is_ok());
        assert!(validate_repo_relative_path("a file — ñ.txt").is_ok());
    }

    #[test]
    fn checked_status_rejects_a_path_that_cannot_be_represented_losslessly() {
        let stdout = b"? invalid-\xff-name.txt\0";
        let error = checked_status_records(stdout)
            .err()
            .expect("invalid UTF-8 should return a structured error");

        assert_eq!(error.code, AppErrorCode::PathEncodingUnsupported);
    }

    #[test]
    fn find_status_entry_distinguishes_untracked_from_staged_new() {
        let stdout = porcelain_v2(&[
            &format!("1 A. N... 100644 100644 100644 {HASHES} staged-new.txt"),
            "? untracked-new.txt",
        ]);

        let staged = find_status_entry(&stdout, "staged-new.txt")
            .expect("status should parse")
            .expect("staged entry should be found");
        assert_eq!(staged.category, ChangeCategory::New);
        assert!(!staged.is_untracked);

        let untracked = find_status_entry(&stdout, "untracked-new.txt")
            .expect("status should parse")
            .expect("untracked entry should be found");
        assert_eq!(untracked.category, ChangeCategory::New);
        assert!(untracked.is_untracked);
    }

    #[test]
    fn find_status_entry_keeps_both_sides_of_a_rename() {
        let stdout = porcelain_v2(&[
            &format!("2 R. N... 100644 100644 100644 {HASHES} R100 new name.txt"),
            "old name.txt",
        ]);

        let entry = find_status_entry(&stdout, "new name.txt")
            .expect("status should parse")
            .expect("rename entry should be found");
        assert_eq!(entry.category, ChangeCategory::Renamed);
        assert_eq!(entry.original_path.as_deref(), Some("old name.txt"));
    }
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommitFileChange {
    pub(crate) path: String,
    /// Only set for a detected rename/copy: where the file came from.
    pub(crate) original_path: Option<String>,
    pub(crate) category: ChangeCategory,
}

/// Classifies one `git show --name-status` line. Reuses the same
/// `ChangeCategory` vocabulary (and, on the frontend, the same icons) as the
/// working-tree Changes list, so a saved version's file summary and the
/// Changes screen can never disagree about what a category means. A type
/// change (`T`) is presented as `Changed` — GitOdile doesn't have a distinct
/// category for that rare case, and it *is* still a modification to the file.
pub(crate) fn parse_name_status_line(line: &str) -> Option<CommitFileChange> {
    let mut parts = line.split('\t');
    let status = parts.next()?;
    let first_path = parts.next()?;
    match status.as_bytes().first()? {
        b'A' => Some(CommitFileChange {
            path: first_path.to_string(),
            original_path: None,
            category: ChangeCategory::New,
        }),
        b'D' => Some(CommitFileChange {
            path: first_path.to_string(),
            original_path: None,
            category: ChangeCategory::Deleted,
        }),
        b'R' | b'C' => {
            let new_path = parts.next()?.to_string();
            Some(CommitFileChange {
                path: new_path,
                original_path: Some(first_path.to_string()),
                category: ChangeCategory::Renamed,
            })
        }
        _ => Some(CommitFileChange {
            path: first_path.to_string(),
            original_path: None,
            category: ChangeCategory::Changed,
        }),
    }
}

/// A commit hash reaching any of these commands always comes from GitOdile's
/// own previously displayed list (`SavedVersionSummary`/`CommitFileChange`),
/// never free-typed by the user — but since it still becomes a `git` process
/// argument, this rejects the one shape that could be misread as a flag
/// instead of a revision.
pub(crate) fn validate_commit_ish(commit: &str) -> Result<(), AppError> {
    if commit.is_empty() || commit.starts_with('-') {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That saved version couldn't be identified.",
        ));
    }
    Ok(())
}

/// Read-only, local-only file summary for one already-saved commit — the
/// "very summarized" per-version detail shown inline in the publish preview,
/// deliberately not the full line-by-line diff the Changes screen shows.
/// `git show` handles a root commit (no parent) the same way it handles any
/// other commit, listing every file as added, so no special case is needed.
pub(crate) fn read_commit_file_changes(
    path: String,
    commit: String,
) -> Result<Vec<CommitFileChange>, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "read_commit_file_changes", None)?;
    validate_commit_ish(&commit)?;
    let output = run_git(
        &path,
        &[
            "show",
            "--no-color",
            "--format=",
            "--name-status",
            "-M",
            &commit,
        ],
    )?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "GitOdile couldn't read that saved version's changed files.",
        )
        .with_remediation("Refresh and try again."));
    }
    Ok(git_stdout(&output)
        .lines()
        .filter_map(parse_name_status_line)
        .collect())
}

/// The line-by-line diff for one file within one already-saved commit — the
/// second level of the Overview's "view changes" flow, once a specific file
/// from `read_commit_file_changes` is picked. Reuses the exact same
/// `RawStatusEntry`/`diff_result_from_text` pipeline the working-tree diff
/// commands use, so a file's classification (binary/too-large/unchanged/text)
/// can never disagree between an unsaved change and an already-saved one —
/// only the `git show`/`--name-status` step that determined `category` and
/// `original_path` here comes from a commit instead of the working tree.
pub(crate) fn read_commit_file_diff(
    path: String,
    commit: String,
    file_path: String,
) -> Result<FileDiff, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "read_commit_file_diff", None)?;
    validate_repo_relative_path(&file_path)?;
    validate_commit_ish(&commit)?;

    let status_output = run_git(
        &path,
        &[
            "show",
            "--no-color",
            "--format=",
            "--name-status",
            "-M",
            &commit,
            "--",
            &file_path,
        ],
    )?;
    if !status_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "GitOdile couldn't check that saved version's changes.",
        )
        .with_remediation("Refresh and try again."));
    }
    let Some(change) = git_stdout(&status_output)
        .lines()
        .find_map(parse_name_status_line)
    else {
        return Err(AppError::new(
            AppErrorCode::PathNotChanged,
            "This file isn't part of that saved version.",
        )
        .with_remediation("Refresh and choose a file that is still listed."));
    };
    let entry = RawStatusEntry {
        path: change.path,
        original_path: change.original_path,
        category: change.category,
        is_untracked: false,
        is_prepared: false,
        has_unprepared_changes: false,
    };

    let output = run_git_capped(
        &path,
        &[
            "show",
            "--no-color",
            "--no-ext-diff",
            "--format=",
            "-M",
            &commit,
            "--",
            &file_path,
        ],
        MAX_DIFF_OUTPUT_BYTES,
    )?;
    if output.limit_exceeded {
        return Ok(build_text_result(&entry, &output));
    }
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this file's difference.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }
    Ok(build_text_result(&entry, &output))
}

// ---- Expanding the unchanged lines between hunks (task 035) ----
//
// A diff carries only what changed plus its immediate context, so the gap a
// hunk marker announces ("122 unchanged lines") is not in the payload at all.
// Making that marker expandable therefore needs the file's own text.
//
// The working-tree copy is the right source: these branches are unchanged by
// definition, so both sides of the diff agree on them, and reading the file
// on disk needs no Git process. A deleted file has no working-tree copy, but
// a deletion has no unchanged gaps to expand either.
//
// Two bounds, for the same reason `MAX_DIFF_OUTPUT_BYTES` exists: a request
// is capped at `MAX_EXPANDED_LINES` lines so one click can't pull a whole
// generated file into the renderer, and the file itself is not opened past
// `MAX_EXPANDABLE_FILE_BYTES`.
pub(crate) const MAX_EXPANDED_LINES: usize = 500;
pub(crate) const MAX_EXPANDABLE_FILE_BYTES: u64 = 8 * 1024 * 1024;

/// Markdown parsing is more expensive than displaying a line range. Never
/// return a partial document: truncation could change its Markdown structure.
pub(crate) const MAX_MARKDOWN_PREVIEW_BYTES: u64 = 128 * 1024;

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub(crate) enum MarkdownPreview {
    Ready {
        content: Option<String>,
        #[serde(rename = "beforeContent")]
        before_content: Option<String>,
    },
    TooLarge {
        #[serde(rename = "limitBytes")]
        limit_bytes: u64,
    },
}

impl MarkdownPreview {
    pub(crate) fn too_large() -> Self {
        Self::TooLarge {
            limit_bytes: MAX_MARKDOWN_PREVIEW_BYTES,
        }
    }
}

pub(crate) fn read_file_markdown(
    path: String,
    file_path: String,
) -> Result<MarkdownPreview, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "read_file_markdown", None)?;
    validate_markdown_path(&file_path)?;
    let status = run_git(&path, &STATUS_ARGS)?;
    if !status.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't check this document's changes.",
        ));
    }
    let entry = find_status_entry(&status.stdout, &file_path)?;
    if entry
        .as_ref()
        .is_some_and(|entry| entry.category == ChangeCategory::Conflicted)
    {
        return Err(AppError::new(
            AppErrorCode::UnresolvedConflicts,
            "Resolve this document's overlapping changes before previewing it.",
        ));
    }
    let current = if entry
        .as_ref()
        .is_some_and(|entry| entry.category == ChangeCategory::Deleted)
        && !Path::new(&path).join(&file_path).exists()
    {
        MarkdownPreview::Ready {
            content: None,
            before_content: None,
        }
    } else {
        read_markdown_worktree(&path, &file_path)?
    };
    let MarkdownPreview::Ready { content, .. } = current else {
        return Ok(current);
    };
    let head = run_git(&path, &["rev-parse", "--verify", "-q", "HEAD"])?;
    let before_content = if head.status.success() {
        let base = entry
            .as_ref()
            .and_then(|entry| entry.original_path.as_deref())
            .unwrap_or(&file_path);
        validate_repo_relative_path(base)?;
        match read_saved_markdown(&path, git_stdout(&head).trim(), base)? {
            SavedMarkdown::Absent => None,
            SavedMarkdown::TooLarge => return Ok(MarkdownPreview::too_large()),
            SavedMarkdown::Text(text) => Some(text),
        }
    } else if head.status.code() == Some(1) {
        None // An unborn branch has no saved document yet.
    } else {
        return Err(markdown_read_error());
    };
    Ok(MarkdownPreview::Ready {
        content,
        before_content,
    })
}

/// One document as a saved tree holds it.
pub(crate) enum SavedMarkdown {
    Absent,
    TooLarge,
    Text(String),
}

pub(crate) fn validate_markdown_path(file_path: &str) -> Result<(), AppError> {
    validate_repo_relative_path(file_path)?;
    if !Path::new(file_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
    {
        return Err(AppError::new(
            AppErrorCode::PathInvalid,
            "Choose a Markdown document.",
        ));
    }
    Ok(())
}

pub(crate) fn read_saved_markdown(
    path: &str,
    tree: &str,
    file_path: &str,
) -> Result<SavedMarkdown, AppError> {
    // A successful tree lookup distinguishes an absent file from a broken
    // object/read. Literal pathspecs also handle names containing brackets.
    let listing = run_git(
        path,
        &[
            "--literal-pathspecs",
            "ls-tree",
            "-z",
            "--full-tree",
            tree,
            "--",
            file_path,
        ],
    )?;
    if !listing.status.success() {
        return Err(markdown_read_error());
    }
    if listing.stdout.is_empty() {
        return Ok(SavedMarkdown::Absent);
    }
    let header = listing
        .stdout
        .split(|byte| *byte == b'\t')
        .next()
        .ok_or_else(markdown_read_error)?;
    let header = std::str::from_utf8(header).map_err(|_| markdown_read_error())?;
    let fields: Vec<_> = header.split_whitespace().collect();
    if fields.len() != 3 || fields[1] != "blob" || !matches!(fields[0], "100644" | "100755") {
        return Err(markdown_read_error());
    }
    let spec = fields[2];
    let size = run_git(path, &["cat-file", "-s", spec])?;
    if !size.status.success() {
        return Err(markdown_read_error());
    }
    let bytes = git_stdout(&size)
        .trim()
        .parse::<u64>()
        .map_err(|_| markdown_read_error())?;
    if bytes > MAX_MARKDOWN_PREVIEW_BYTES {
        return Ok(SavedMarkdown::TooLarge);
    }
    let blob = run_git_capped(
        path,
        &["cat-file", "blob", spec],
        MAX_MARKDOWN_PREVIEW_BYTES as usize,
    )?;
    if !blob.status.success() || blob.limit_exceeded {
        return Err(markdown_read_error());
    }
    Ok(SavedMarkdown::Text(decode_markdown(blob.stdout)?))
}

fn markdown_read_error() -> AppError {
    AppError::new(
        AppErrorCode::GitCommandFailed,
        "The saved document couldn't be read.",
    )
    .with_remediation("Refresh the changes list and try again.")
}

fn decode_markdown(bytes: Vec<u8>) -> Result<String, AppError> {
    let text = String::from_utf8(bytes).map_err(|_| {
        AppError::new(
            AppErrorCode::PathEncodingUnsupported,
            "This document isn't UTF-8 text.",
        )
    })?;
    if text.contains('\0') {
        return Err(AppError::new(
            AppErrorCode::PathEncodingUnsupported,
            "This document isn't readable as text.",
        ));
    }
    Ok(text.strip_prefix('\u{feff}').unwrap_or(&text).to_string())
}

fn read_markdown_worktree(path: &str, file_path: &str) -> Result<MarkdownPreview, AppError> {
    let unreadable = || {
        AppError::new(AppErrorCode::PathUnusable, "This document can't be read.")
            .with_remediation("Refresh the changes list or open the document in your editor.")
    };
    let root = Path::new(path).canonicalize().map_err(|_| unreadable())?;
    // A Git symlink stores its destination, not the referenced document.
    // Dereferencing it would compare unrelated content against that path text.
    if std::fs::symlink_metadata(root.join(file_path))
        .map_err(|_| unreadable())?
        .file_type()
        .is_symlink()
    {
        return Err(unreadable());
    }
    let target = root
        .join(file_path)
        .canonicalize()
        .map_err(|_| unreadable())?;
    if !target.starts_with(&root) {
        return Err(AppError::new(
            AppErrorCode::PathInvalid,
            "That document is outside this project.",
        ));
    }
    // Check the resolved path before opening (including special files), then
    // recheck the opened handle and cap the actual read in case it grows.
    if !target.metadata().map_err(|_| unreadable())?.is_file() {
        return Err(unreadable());
    }
    let file = std::fs::File::open(&target).map_err(|_| unreadable())?;
    let metadata = file.metadata().map_err(|_| unreadable())?;
    if !metadata.is_file() {
        return Err(unreadable());
    }
    let too_large = || MarkdownPreview::TooLarge {
        limit_bytes: MAX_MARKDOWN_PREVIEW_BYTES,
    };
    if metadata.len() > MAX_MARKDOWN_PREVIEW_BYTES {
        return Ok(too_large());
    }
    let mut bytes = Vec::new();
    file.take(MAX_MARKDOWN_PREVIEW_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| unreadable())?;
    if bytes.len() as u64 > MAX_MARKDOWN_PREVIEW_BYTES {
        return Ok(too_large());
    }
    Ok(MarkdownPreview::Ready {
        content: Some(decode_markdown(bytes)?),
        before_content: None,
    })
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileLines {
    /// Echoed back 1-based, so a caller can confirm which range it received.
    pub(crate) start_line: u32,
    pub(crate) lines: Vec<String>,
    /// True when the requested range was cut short by `MAX_EXPANDED_LINES`.
    /// The Changes screen does not read it — it derives what is left from the
    /// gap size minus what it has already collected, which stays correct
    /// across repeated expansions — but it keeps the response self-describing
    /// for any caller that asks for a range in one go.
    pub(crate) truncated: bool,
}

pub(crate) fn read_file_lines(
    path: String,
    file_path: String,
    start_line: u32,
    end_line: u32,
) -> Result<FileLines, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "read_file_lines", None)?;
    validate_repo_relative_path(&file_path)?;
    if start_line == 0 || end_line < start_line {
        return Err(
            AppError::new(AppErrorCode::PathInvalid, "That branch range isn't valid.")
                .with_remediation("Refresh the changes list and try again."),
        );
    }

    // `validate_repo_relative_path` rejects `..` and absolute paths, but it
    // works on the string alone — a symlink committed inside the repository
    // would still resolve outside it. Unlike `read_file_diff`, which
    // re-validates its path against a fresh `git status`, this command runs on
    // a click and cannot afford a Git process, so it confirms containment by
    // resolving both ends instead.
    let repo_root = Path::new(&path).canonicalize().map_err(|_| {
        AppError::new(
            AppErrorCode::PathUnusable,
            "This project's folder can't be read.",
        )
        .with_remediation("Open the project again, or choose another folder.")
    })?;
    let full_path = repo_root.join(&file_path).canonicalize().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(AppErrorCode::PathMissing, "This file is no longer there.")
                .with_remediation("Refresh the changes list.")
        } else {
            AppError::new(AppErrorCode::PathUnusable, "This file can't be read.")
                .with_remediation("Check the file permissions and try again.")
        }
    })?;
    if !full_path.starts_with(&repo_root) {
        return Err(
            AppError::new(AppErrorCode::PathInvalid, "That file path isn't valid.")
                .with_remediation("Refresh the changes list and choose the file again."),
        );
    }

    let metadata = full_path.metadata().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(AppErrorCode::PathMissing, "This file is no longer there.")
                .with_remediation("Refresh the changes list.")
        } else {
            AppError::new(AppErrorCode::PathUnusable, "This file can't be read.")
                .with_remediation("Check the file permissions and try again.")
        }
    })?;
    if !metadata.is_file() {
        return Err(
            AppError::new(AppErrorCode::PathUnusable, "That path isn't a file.")
                .with_remediation("Refresh the changes list."),
        );
    }
    if metadata.len() > MAX_EXPANDABLE_FILE_BYTES {
        return Err(AppError::new(
            AppErrorCode::PathUnusable,
            "This file is too large to show more of here.",
        )
        .with_remediation("Open it in your editor to read the surrounding lines."));
    }

    let contents = std::fs::read(&full_path).map_err(|_| {
        AppError::new(AppErrorCode::PathUnusable, "This file can't be read.")
            .with_remediation("Check the file permissions and try again.")
    })?;
    let text = String::from_utf8(contents).map_err(|_| {
        AppError::new(
            AppErrorCode::PathEncodingUnsupported,
            "This file isn't readable as text.",
        )
        .with_remediation("Open it in your editor instead.")
    })?;

    // 1-based, inclusive, and clamped to the file rather than erroring: the
    // caller's range comes from a diff that may be a moment out of date, and
    // showing the lines that do exist beats refusing the whole request.
    let start_index = (start_line - 1) as usize;
    let end_index = end_line as usize;
    let all_lines: Vec<&str> = text.lines().collect();
    if start_index >= all_lines.len() {
        return Ok(FileLines {
            start_line,
            lines: Vec::new(),
            truncated: false,
        });
    }
    let available = &all_lines[start_index..end_index.min(all_lines.len())];
    let truncated = available.len() > MAX_EXPANDED_LINES;
    let lines = available
        .iter()
        .take(MAX_EXPANDED_LINES)
        .map(|line| (*line).to_string())
        .collect();

    Ok(FileLines {
        start_line,
        lines,
        truncated,
    })
}

/// Speculative aggregate warm for the Changes screen. It is a convenience over
/// `read_file_diff`, never a replacement, so it is allowed to answer with less
/// than everything: the policy in `MAX_WARM_CHANGED_FILES` /
/// `MAX_WARM_DIFF_OUTPUT_BYTES` decides how much of a changeset is worth
/// pulling across IPC speculatively, and the typed outcome tells the caller
/// which decision was made. Whatever is missing is loaded on demand, one file
/// at a time, when the user actually opens it.
pub(crate) fn read_working_tree_diffs(path: String) -> Result<WorkingTreeDiffBatch, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "read_working_tree_diffs", None)?;
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

    let status_output = run_git(&path, &STATUS_ARGS)?;
    if !status_output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't check what changed in this project.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."));
    }
    let records = checked_status_records(&status_output.stdout)?;

    let changed_files = records.entries.len() as u32;
    let budget_bytes = MAX_WARM_DIFF_OUTPUT_BYTES as u64;
    if records.entries.len() > MAX_WARM_CHANGED_FILES {
        // Eligibility is decided before any diff process is spawned, so an
        // oversized changeset costs one `git status` and nothing else.
        return Ok(WorkingTreeDiffBatch {
            outcome: DiffWarmOutcome::Deferred,
            diffs: Vec::new(),
            changed_files,
            budget_bytes,
        });
    }

    let tracked_entries: Vec<&RawStatusEntry> = records
        .entries
        .iter()
        .filter(|entry| entry.category != ChangeCategory::Conflicted && !entry.is_untracked)
        .collect();
    let untracked_entries: Vec<&RawStatusEntry> = records
        .entries
        .iter()
        .filter(|entry| entry.is_untracked)
        .collect();

    let batched = if tracked_entries.is_empty() {
        BatchedTrackedDiffs {
            diffs: Vec::new(),
            truncated: false,
            output_bytes: 0,
        }
    } else {
        let base = diff_base_rev(&path)?;
        batch_tracked_diffs(&path, &base, &tracked_entries, MAX_WARM_DIFF_OUTPUT_BYTES)?
    };
    let mut truncated = batched.truncated;
    let mut results = batched.diffs;

    // Untracked files are read from disk rather than diffed, so they bypass
    // the Git output cap entirely and need their own share of the same
    // budget. Their on-disk size is checked before reading: a file that does
    // not fit is left to the on-demand path instead of being read anyway.
    let mut remaining = MAX_WARM_DIFF_OUTPUT_BYTES.saturating_sub(batched.output_bytes);
    for entry in &untracked_entries {
        let size = repo_path
            .join(&entry.path)
            .metadata()
            .map(|metadata| metadata.len())
            .unwrap_or(0);
        if size > remaining as u64 {
            truncated = true;
            continue;
        }
        remaining -= size as usize;
        results.push(untracked_file_diff(repo_path, entry));
    }

    Ok(WorkingTreeDiffBatch {
        outcome: if truncated {
            DiffWarmOutcome::Truncated
        } else {
            DiffWarmOutcome::Completed
        },
        diffs: results,
        changed_files,
        budget_bytes,
    })
}

// ---- Image previews (task 111) ----
//
// Classification says *that* a changed file is a drawable image; this section
// answers *what it looks like*, for one file, only once the user opens it.
// The two are deliberately separate: a diff payload covers every changed file
// at once, and a folder of screenshots must not turn it into a gallery.
//
// The bytes cross IPC base64-encoded and are drawn by the frontend as an
// `<img>` `data:` URL. That is the whole security model for the SVG half of
// the feature too: in an `img` context a browser engine runs no script and
// fetches no external resource, so repository content is rendered without ever
// becoming part of the application's own document.

/// Bounds one side of an image preview. Five times `MAX_DIFF_OUTPUT_BYTES`,
/// because a legitimate photograph is far larger than any legitimate diff —
/// and no higher, because base64 inflates what crosses IPC by a third, so
/// 10 MiB of pixels is already ~13 MiB of JSON.
pub(crate) const MAX_IMAGE_PREVIEW_BYTES: u64 = 10 * 1024 * 1024;

pub(crate) const SVG_MEDIA_TYPE: &str = "image/svg+xml";

/// Every format a webview decodes on its own, SVG included: the preview
/// command serves the drawing behind an SVG's text diff through exactly the
/// same path as a photograph, because from `<img>`'s point of view they are
/// the same thing.
pub(crate) fn image_media_type_for_path(file_path: &str) -> Option<&'static str> {
    let extension = Path::new(file_path)
        .extension()?
        .to_str()?
        .to_ascii_lowercase();
    Some(match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => SVG_MEDIA_TYPE,
        _ => return None,
    })
}

/// Which images stop being text. An SVG *is* text — it has a real line-by-line
/// diff worth keeping, and rendering it is a second way to read that diff, not
/// a different classification. Everything else in the list has no text to show
/// at all, so for those the picture replaces the diff rather than joining it.
pub(crate) fn is_binary_image_path(file_path: &str) -> bool {
    matches!(image_media_type_for_path(file_path), Some(media_type) if media_type != SVG_MEDIA_TYPE)
}

/// What the bytes actually are, which is what the `data:` URL must declare.
/// A file's name is a claim; this is the evidence. When the two disagree the
/// preview is reported unsupported rather than handed to the webview with a
/// media type it will refuse to decode.
pub(crate) fn sniff_image_media_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" && matches!(&bytes[8..12], b"avif" | b"avis") {
        return Some("image/avif");
    }
    if bytes.starts_with(b"BM") {
        return Some("image/bmp");
    }
    if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
        return Some("image/x-icon");
    }
    if looks_like_svg(bytes) {
        return Some(SVG_MEDIA_TYPE);
    }
    None
}

/// SVG has no magic number, so this is a shape test rather than a signature:
/// the document must *begin* like XML or SVG — after an optional byte-order
/// mark and whitespace — and carry an `<svg` tag near the top. Requiring the
/// opening keeps an arbitrary text file that merely mentions `<svg` somewhere
/// from being handed to the webview as a drawing.
fn looks_like_svg(bytes: &[u8]) -> bool {
    let head = bytes.get(..SVG_SNIFF_BYTES).unwrap_or(bytes);
    let text = String::from_utf8_lossy(head);
    let trimmed = text.trim_start_matches('\u{feff}').trim_start();
    let opens_as_markup = trimmed.starts_with("<?xml")
        || trimmed.starts_with("<!--")
        || trimmed.starts_with("<svg")
        // `get` rather than slicing: the head may end mid-character, and a
        // doctype is spelled either way in the wild.
        || trimmed
            .get(..9)
            .is_some_and(|head| head.eq_ignore_ascii_case("<!doctype"));
    opens_as_markup && trimmed.contains("<svg")
}

/// Enough to clear an XML declaration, a licence comment and a doctype before
/// the root element, and short enough that the check stays cheap.
pub(crate) const SVG_SNIFF_BYTES: usize = 4096;

pub(crate) use crate::encoding::base64_encode;

/// One version of one image. `Ready` carries the picture; the other two are
/// the honest answers that keep a frame from being drawn empty — the file is
/// past the preview limit, or its bytes are not an image the webview knows.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum ImagePreviewSide {
    // `rename_all` on the enum renames the *variants*; a struct variant's own
    // fields need saying again, or they cross IPC in snake_case and every
    // reader of `mediaType`/`byteLength` silently gets `undefined`.
    #[serde(rename_all = "camelCase")]
    Ready {
        media_type: String,
        byte_length: u64,
        /// Base64, ready to be placed in a `data:` URL unmodified.
        data: String,
    },
    #[serde(rename = "too-large", rename_all = "camelCase")]
    TooLarge { byte_length: u64, limit_bytes: u64 },
    #[serde(rename_all = "camelCase")]
    Unsupported { byte_length: u64 },
}

/// `None` on a side means that side does not exist — an added image has no
/// before, a deleted one has no after. It is not an error and must not be
/// drawn as one.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImagePreview {
    pub(crate) before: Option<ImagePreviewSide>,
    pub(crate) after: Option<ImagePreviewSide>,
}

pub(crate) fn image_preview_side(bytes: Vec<u8>) -> ImagePreviewSide {
    let byte_length = bytes.len() as u64;
    match sniff_image_media_type(&bytes) {
        Some(media_type) => ImagePreviewSide::Ready {
            media_type: media_type.to_string(),
            byte_length,
            data: base64_encode(&bytes),
        },
        None => ImagePreviewSide::Unsupported { byte_length },
    }
}

/// `None` means this side does not exist, which the frontend states as added
/// or removed. Nothing that merely *failed* may return it: telling someone a
/// picture was deleted when it was only unreadable is worse than saying
/// nothing, so every failure past a resolvable object is an error.
fn unreadable_picture(code: AppErrorCode) -> AppError {
    AppError::new(code, "GitOdile couldn't read this picture.")
        .with_remediation("Check that the file is readable and try again.")
}

/// Reads one blob by `<rev>:<path>` spec. The size is asked for first and
/// separately: an object past the limit must be reported without ever being
/// read into memory, which is the entire point of having a limit.
///
/// A spec that does not resolve is `Ok(None)` — that is exactly what an added
/// file's before side and a deleted file's after side look like.
fn blob_preview_side(path: &str, spec: &str) -> Result<Option<ImagePreviewSide>, AppError> {
    let size_output = run_git(path, &["cat-file", "-s", spec])?;
    if !size_output.status.success() {
        return Ok(None);
    }
    let Ok(byte_length) = git_stdout(&size_output).trim().parse::<u64>() else {
        return Err(unreadable_picture(AppErrorCode::GitCommandFailed));
    };
    if byte_length > MAX_IMAGE_PREVIEW_BYTES {
        return Ok(Some(ImagePreviewSide::TooLarge {
            byte_length,
            limit_bytes: MAX_IMAGE_PREVIEW_BYTES,
        }));
    }
    let output = run_git_capped(
        path,
        &["cat-file", "blob", spec],
        MAX_IMAGE_PREVIEW_BYTES as usize,
    )?;
    // The object resolved a moment ago, so a failure here is a failure, not an
    // absent version.
    if !output.status.success() || output.limit_exceeded {
        return Err(unreadable_picture(AppErrorCode::GitCommandFailed));
    }
    Ok(Some(image_preview_side(output.stdout)))
}

/// The working-tree copy, which needs no Git process at all.
///
/// `validate_repo_relative_path` rejects `..` and absolute paths, but it works
/// on the string alone — a symlink committed inside the repository still
/// resolves outside it. Containment is therefore confirmed by resolving both
/// ends, the same check and for the same reason as `read_file_lines`: without
/// it, a repository could put any picture on the user's disk on screen by
/// naming a link after one of its own files.
fn disk_preview_side(
    repo_path: &Path,
    file_path: &str,
) -> Result<Option<ImagePreviewSide>, AppError> {
    let repo_root = repo_path.canonicalize().map_err(|_| {
        AppError::new(
            AppErrorCode::PathUnusable,
            "This project's folder can't be read.",
        )
        .with_remediation("Open the project again, or choose another folder.")
    })?;
    let full_path = match repo_root.join(file_path).canonicalize() {
        Ok(resolved) => resolved,
        // Genuinely absent: this is the deleted side, and not an error.
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(unreadable_picture(AppErrorCode::PathUnusable)),
    };
    if !full_path.starts_with(&repo_root) {
        return Err(
            AppError::new(AppErrorCode::PathInvalid, "That file path isn't valid.")
                .with_remediation("Refresh the changes list and choose the file again."),
        );
    }
    let metadata = full_path
        .metadata()
        .map_err(|_| unreadable_picture(AppErrorCode::PathUnusable))?;
    if !metadata.is_file() {
        return Err(
            AppError::new(AppErrorCode::PathUnusable, "That path isn't a file.")
                .with_remediation("Refresh the changes list."),
        );
    }
    if metadata.len() > MAX_IMAGE_PREVIEW_BYTES {
        return Ok(Some(ImagePreviewSide::TooLarge {
            byte_length: metadata.len(),
            limit_bytes: MAX_IMAGE_PREVIEW_BYTES,
        }));
    }
    let bytes =
        std::fs::read(&full_path).map_err(|_| unreadable_picture(AppErrorCode::PathUnusable))?;
    Ok(Some(image_preview_side(bytes)))
}

/// Both versions of one changed image, for whichever surface asked.
///
/// `commit` selects the pair: `None` compares `HEAD` with the file on disk,
/// which is what the Changes screen shows; `Some(commit)` compares that saved
/// version with its parent, which is what History and the pending-versions
/// list show. `original_path` is the pre-rename name and is used for the
/// before side only, so a renamed image still finds the version it came from.
pub(crate) fn read_file_image_preview(
    path: String,
    file_path: String,
    original_path: Option<String>,
    commit: Option<String>,
) -> Result<ImagePreview, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "read_file_image_preview", None)?;
    validate_repo_relative_path(&file_path)?;
    if let Some(original) = original_path.as_deref() {
        validate_repo_relative_path(original)?;
    }
    if let Some(commit) = commit.as_deref() {
        validate_commit_ish(commit)?;
    }
    if image_media_type_for_path(&file_path).is_none() {
        return Err(AppError::new(
            AppErrorCode::PathInvalid,
            "That file isn't an image GitOdile can show.",
        )
        .with_remediation("Choose a PNG, JPEG, GIF, WebP, AVIF, BMP or ICO file."));
    }
    let base_path = original_path.as_deref().unwrap_or(&file_path);

    match commit {
        Some(commit) => Ok(ImagePreview {
            before: blob_preview_side(&path, &format!("{commit}^:{base_path}"))?,
            after: blob_preview_side(&path, &format!("{commit}:{file_path}"))?,
        }),
        None => Ok(ImagePreview {
            before: blob_preview_side(&path, &format!("HEAD:{base_path}"))?,
            after: disk_preview_side(Path::new(&path), &file_path)?,
        }),
    }
}
