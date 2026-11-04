//! Read-only saved-version history.
//!
//! The timeline is deliberately narrower than a full repository graph: it
//! follows commits reachable from a scope's tips in stable topological / date
//! order. The scope is the current `HEAD`, one named local branch, or
//! every local branch at once; it decides *which* graph is walked, while
//! `HistoryFilters` decides how much of that graph is returned. Page cursors
//! bind the offset to the exact scope/local/upstream snapshot so a changed
//! history is rejected instead of silently skipping or duplicating rows.
//!
//! Scoping to a branch means "reachable from that branch's tip", never "these
//! commits belong to that branch". A commit reachable from five branches belongs to
//! all of them, and Git will not cheaply say which branch it is "on", so nothing
//! here stamps a branch name onto a row: decorations keep meaning only that a ref
//! points at that commit.

use crate::application;
use crate::changes::{
    diff_result_from_text, read_saved_markdown, validate_markdown_path,
    validate_repo_relative_path, FileDiff, MarkdownPreview, SavedMarkdown, EMPTY_TREE_HASH,
    MAX_DIFF_OUTPUT_BYTES,
};
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{git_stdout, run_git, run_git_capped, run_git_with_input_capped};
use crate::repository::HeadState;
use crate::status::{ChangeCategory, RawStatusEntry};
use crate::sync::{list_configured_remotes, resolve_commit, resolve_upstream};
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::sync::Mutex;

pub(crate) const DEFAULT_HISTORY_PAGE_SIZE: usize = 50;
pub(crate) const MAX_HISTORY_PAGE_SIZE: usize = 100;
pub(crate) const MAX_SUMMARY_SUBJECT_CHARS: usize = 240;
pub(crate) const MAX_SUMMARY_DESCRIPTION_CHARS: usize = 2_048;
pub(crate) const MAX_DETAIL_DESCRIPTION_CHARS: usize = 16_384;
pub(crate) const MAX_PAGE_COMMIT_OBJECT_BYTES: usize = 256 * 1024;
pub(crate) const MAX_PAGE_COMMIT_BATCH_BYTES: usize = 4 * 1024 * 1024;
pub(crate) const MAX_DETAIL_COMMIT_BYTES: usize = 512 * 1024;
pub(crate) const MAX_DECORATION_OUTPUT_BYTES: usize = 4 * 1024 * 1024;
pub(crate) const MAX_DECORATIONS_PER_VERSION: usize = 32;
pub(crate) const MAX_DETAIL_FILE_OUTPUT_BYTES: usize = 8 * 1024 * 1024;
pub(crate) const MAX_DETAIL_FILES: usize = 1_000;
const MAX_CACHED_HISTORY_SNAPSHOTS: usize = 4;
const MAX_CACHED_HISTORY_COMMITS: usize = 1_000;
const MAX_CACHED_HISTORY_DETAILS: usize = 8;
const MAX_CACHED_HISTORY_DETAIL_BYTES: usize = 512 * 1024;
const MAX_FILTER_AUTHOR_CHARS: usize = 200;
const MAX_FILTER_PATH_CHARS: usize = 1_024;
/// How many local branches `AllBranches` will walk from. A repository with
/// more than this many branches gets the first `MAX_SCOPE_BRANCHES` by name plus a
/// warning, rather than an unbounded argv and an unbounded walk.
const MAX_SCOPE_BRANCHES: usize = 500;
const MAX_BRANCH_NAME_CHARS: usize = 255;
const MAX_SCOPE_REF_OUTPUT_BYTES: usize = 2 * 1024 * 1024;

type PageObjects = (
    HashMap<String, Vec<u8>>,
    HashMap<String, MessageUnavailableReason>,
);
type DecorationSnapshot = (
    HashMap<String, Vec<HistoryDecoration>>,
    HashSet<String>,
    bool,
    bool,
);

#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoryTimestamp {
    pub(crate) unix_seconds: i64,
    pub(crate) offset_minutes: i16,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedVersionAuthor {
    pub(crate) name: String,
    pub(crate) email: String,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PublicationState {
    LocalOnly,
    Published,
    Unknown,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum DecorationKind {
    Head,
    LocalBranch,
    RemoteBranch,
    Tag,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoryDecoration {
    pub(crate) kind: DecorationKind,
    pub(crate) name: String,
    pub(crate) full_ref: String,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum MessageUnavailableReason {
    TooLarge,
    PageBudget,
    Malformed,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedVersionSummary {
    pub(crate) commit: String,
    pub(crate) short_commit: String,
    pub(crate) parents: Vec<String>,
    pub(crate) subject: String,
    pub(crate) description: String,
    pub(crate) author: Option<SavedVersionAuthor>,
    pub(crate) authored_at: Option<HistoryTimestamp>,
    pub(crate) committed_at: Option<HistoryTimestamp>,
    pub(crate) decorations: Vec<HistoryDecoration>,
    pub(crate) is_root: bool,
    pub(crate) is_merge: bool,
    pub(crate) publication: PublicationState,
    pub(crate) subject_truncated: bool,
    pub(crate) description_truncated: bool,
    pub(crate) decorations_truncated: bool,
    pub(crate) message_unavailable: Option<MessageUnavailableReason>,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpstreamBoundary {
    pub(crate) remote: String,
    pub(crate) destination_branch: String,
    pub(crate) tracking_ref: String,
    pub(crate) commit: String,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum HistoryWarningCode {
    ShallowRepository,
    DecorationsTruncated,
    MessagesTruncated,
    UnreadableMetadata,
    UpstreamUnavailable,
    BranchesTruncated,
}

/// Which history is being read.
///
/// Deliberately not a field of `HistoryFilters`. A filter narrows the graph the
/// scope selected, and the two are cleared by different gestures: clearing every
/// filter must not quietly walk the reader back to the current branch.
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub(crate) enum HistoryScope {
    /// Whatever `HEAD` points at, including a detached one. The default, and
    /// the only scope that existed before this was introduced.
    #[default]
    CurrentBranch,
    /// One named local branch, read without checking anything out.
    Branch { name: String },
    /// Every local branch at once, deduplicated by `rev-list`.
    AllBranches,
}

/// A scope after it has been resolved against the repository: the commits to
/// walk from, and the refs that produced them.
///
/// `tips` is what the snapshot token hashes, so a branch that moves, is renamed
/// or is deleted while a reader is paging invalidates the cursor instead of
/// mixing two histories into one list.
#[derive(Debug, Clone, PartialEq, Eq)]
struct ResolvedScope {
    scope: HistoryScope,
    roots: Vec<String>,
    tips: Vec<(String, String)>,
    truncated: bool,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoryPage {
    pub(crate) repository_id: String,
    pub(crate) snapshot_token: String,
    /// The scope this page was read at, echoed so the screen can tell what it
    /// actually got when a requested branch has gone.
    pub(crate) scope: HistoryScope,
    /// `HEAD`'s own branch, whatever the scope is. The timeline uses it to mark
    /// which decoration is the branch being stood on, which stays true under a
    /// scope that is looking somewhere else.
    pub(crate) branch: Option<String>,
    pub(crate) head_state: HeadState,
    pub(crate) head_commit: Option<String>,
    /// The publication boundary the versions below were classified against —
    /// the scope's own upstream, not always `HEAD`'s. `None` under `AllBranches`,
    /// where no single boundary can answer the question.
    pub(crate) upstream: Option<UpstreamBoundary>,
    pub(crate) versions: Vec<SavedVersionSummary>,
    pub(crate) next_cursor: Option<String>,
    pub(crate) has_more: bool,
    pub(crate) shallow: bool,
    pub(crate) warnings: Vec<HistoryWarningCode>,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoryFileChange {
    pub(crate) path: String,
    pub(crate) original_path: Option<String>,
    pub(crate) category: ChangeCategory,
}

#[derive(serde::Serialize, Debug, Clone, Copy, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoryFileCounts {
    pub(crate) changed: usize,
    pub(crate) new: usize,
    pub(crate) deleted: usize,
    pub(crate) renamed: usize,
    pub(crate) total: usize,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedVersionDetail {
    pub(crate) version: SavedVersionSummary,
    pub(crate) comparison_base: String,
    pub(crate) comparison_is_empty_tree: bool,
    pub(crate) comparison_is_first_parent: bool,
    pub(crate) files: Vec<HistoryFileChange>,
    pub(crate) file_counts: HistoryFileCounts,
    pub(crate) files_truncated: bool,
    pub(crate) counts_are_minimum: bool,
}

#[derive(Debug, Clone)]
struct HeadContext {
    branch: Option<String>,
    head_state: HeadState,
    head_commit: Option<String>,
}

#[derive(Debug, Clone)]
struct SnapshotContext {
    head: HeadContext,
    scope: ResolvedScope,
    upstream: Option<UpstreamBoundary>,
    shallow: bool,
    token: String,
}

#[derive(Clone)]
struct CachedCommitContext {
    row: CommitGraphRow,
    version: SavedVersionSummary,
    detail: Option<SavedVersionDetail>,
    used_at: u64,
}

struct CachedSnapshotContext {
    snapshot: SnapshotContext,
    commits: HashMap<String, CachedCommitContext>,
    used_at: u64,
}

#[derive(Default)]
struct HistoryReadCacheData {
    clock: u64,
    snapshots: HashMap<(String, String), CachedSnapshotContext>,
}

/// Bounded native read-through cache for metadata that a history page already
/// proved. Detail and patch reads still verify the current `HEAD`, but they do
/// not need to rediscover the commit graph, message, decorations, publication
/// state, or changed-file list on every click.
#[derive(Default)]
pub(crate) struct HistoryReadCache {
    data: Mutex<HistoryReadCacheData>,
}

#[derive(Clone)]
struct CachedHistoryRead {
    snapshot: SnapshotContext,
    row: CommitGraphRow,
    version: SavedVersionSummary,
    detail: Option<SavedVersionDetail>,
}

impl HistoryReadCache {
    fn record_page(
        &self,
        repository_id: &str,
        snapshot: &SnapshotContext,
        rows: &[CommitGraphRow],
        versions: &[SavedVersionSummary],
    ) {
        let mut data = self
            .data
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        data.clock = data.clock.wrapping_add(1);
        let used_at = data.clock;
        let key = (repository_id.to_string(), snapshot.token.clone());
        let cached = data
            .snapshots
            .entry(key)
            .or_insert_with(|| CachedSnapshotContext {
                snapshot: snapshot.clone(),
                commits: HashMap::new(),
                used_at,
            });
        cached.snapshot = snapshot.clone();
        cached.used_at = used_at;
        for (row, version) in rows.iter().zip(versions) {
            cached
                .commits
                .entry(row.commit.clone())
                .and_modify(|value| {
                    value.row = row.clone();
                    value.version = version.clone();
                    value.used_at = used_at;
                })
                .or_insert_with(|| CachedCommitContext {
                    row: row.clone(),
                    version: version.clone(),
                    detail: None,
                    used_at,
                });
        }
        while cached.commits.len() > MAX_CACHED_HISTORY_COMMITS {
            let Some(oldest) = cached
                .commits
                .iter()
                .min_by_key(|(_, value)| value.used_at)
                .map(|(commit, _)| commit.clone())
            else {
                break;
            };
            cached.commits.remove(&oldest);
        }
        while data.snapshots.len() > MAX_CACHED_HISTORY_SNAPSHOTS {
            let Some(oldest) = data
                .snapshots
                .iter()
                .min_by_key(|(_, value)| value.used_at)
                .map(|(key, _)| key.clone())
            else {
                break;
            };
            data.snapshots.remove(&oldest);
        }
    }

    fn read(
        &self,
        repository_id: &str,
        snapshot_token: &str,
        commit: &str,
    ) -> Option<CachedHistoryRead> {
        let mut data = self
            .data
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        data.clock = data.clock.wrapping_add(1);
        let used_at = data.clock;
        let snapshot = data
            .snapshots
            .get_mut(&(repository_id.to_string(), snapshot_token.to_string()))?;
        snapshot.used_at = used_at;
        let cached = snapshot.commits.get_mut(commit)?;
        cached.used_at = used_at;
        Some(CachedHistoryRead {
            snapshot: snapshot.snapshot.clone(),
            row: cached.row.clone(),
            version: cached.version.clone(),
            detail: cached.detail.clone(),
        })
    }

    fn record_detail(
        &self,
        repository_id: &str,
        snapshot_token: &str,
        commit: &str,
        detail: &SavedVersionDetail,
    ) {
        if estimate_detail_bytes(detail) > MAX_CACHED_HISTORY_DETAIL_BYTES {
            return;
        }
        let mut data = self
            .data
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        data.clock = data.clock.wrapping_add(1);
        let used_at = data.clock;
        let Some(snapshot) = data
            .snapshots
            .get_mut(&(repository_id.to_string(), snapshot_token.to_string()))
        else {
            return;
        };
        snapshot.used_at = used_at;
        let Some(cached) = snapshot.commits.get_mut(commit) else {
            return;
        };
        cached.detail = Some(detail.clone());
        cached.used_at = used_at;
        while snapshot
            .commits
            .values()
            .filter(|value| value.detail.is_some())
            .count()
            > MAX_CACHED_HISTORY_DETAILS
        {
            let Some(oldest) = snapshot
                .commits
                .iter()
                .filter(|(key, value)| key.as_str() != commit && value.detail.is_some())
                .min_by_key(|(_, value)| value.used_at)
                .map(|(key, _)| key.clone())
            else {
                break;
            };
            if let Some(value) = snapshot.commits.get_mut(&oldest) {
                value.detail = None;
            }
        }
    }
}

fn estimate_detail_bytes(detail: &SavedVersionDetail) -> usize {
    let version = &detail.version;
    let mut bytes = version.commit.len()
        + version.subject.len()
        + version.description.len()
        + detail.comparison_base.len();
    for file in &detail.files {
        bytes += file.path.len() + file.original_path.as_ref().map_or(0, String::len);
    }
    bytes
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CommitGraphRow {
    commit: String,
    parents: Vec<String>,
}

#[derive(Debug, Clone)]
struct ParsedIdentity {
    author: SavedVersionAuthor,
    timestamp: HistoryTimestamp,
}

#[derive(Debug, Clone)]
struct ParsedCommit {
    author: Option<ParsedIdentity>,
    committer: Option<ParsedIdentity>,
    subject: String,
    description: String,
    subject_truncated: bool,
    description_truncated: bool,
    malformed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct HistoryCursor {
    offset: usize,
    local_only_seen: usize,
    snapshot_token: String,
}

fn is_valid_oid(value: &str) -> bool {
    (value.len() == 40 || value.len() == 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn short_oid(value: &str) -> String {
    value.chars().take(10).collect()
}

fn truncate_chars(value: &str, limit: usize) -> (String, bool) {
    if value.chars().count() <= limit {
        return (value.to_string(), false);
    }
    (value.chars().take(limit).collect(), true)
}

fn parse_timezone(value: &str) -> Option<i16> {
    let bytes = value.as_bytes();
    if bytes.len() != 5 || !matches!(bytes[0], b'+' | b'-') {
        return None;
    }
    let hours: i16 = value[1..3].parse().ok()?;
    let minutes: i16 = value[3..5].parse().ok()?;
    if hours > 23 || minutes > 59 {
        return None;
    }
    let total = hours * 60 + minutes;
    Some(if bytes[0] == b'-' { -total } else { total })
}

fn parse_identity(value: &[u8]) -> Option<ParsedIdentity> {
    let text = String::from_utf8_lossy(value);
    let (identity, time) = text.rsplit_once('>')?;
    let (name, email) = identity.rsplit_once(" <")?;
    let mut time_fields = time.split_ascii_whitespace();
    let unix_seconds = time_fields.next()?.parse().ok()?;
    let offset_minutes = parse_timezone(time_fields.next()?)?;
    let (name, _) = truncate_chars(name, 256);
    let (email, _) = truncate_chars(email, 320);
    Some(ParsedIdentity {
        author: SavedVersionAuthor { name, email },
        timestamp: HistoryTimestamp {
            unix_seconds,
            offset_minutes,
        },
    })
}

fn parse_commit_object(data: &[u8], detail: bool) -> ParsedCommit {
    let split = data.windows(2).position(|pair| pair == b"\n\n");
    let (headers, message, malformed) = match split {
        Some(index) => (&data[..index], &data[index + 2..], false),
        None => (data, &[][..], true),
    };
    let mut author = None;
    let mut committer = None;
    for line in headers.split(|byte| *byte == b'\n') {
        if let Some(value) = line.strip_prefix(b"author ") {
            author = parse_identity(value);
        } else if let Some(value) = line.strip_prefix(b"committer ") {
            committer = parse_identity(value);
        }
    }
    let decoded = String::from_utf8_lossy(message);
    let decoded_was_lossy = matches!(decoded, std::borrow::Cow::Owned(_));
    let message = decoded.trim_end_matches(['\n', '\r']);
    let (subject, description) = message
        .split_once('\n')
        .map(|(subject, body)| (subject, body.trim_matches(['\n', '\r'])))
        .unwrap_or((message, ""));
    let (subject, subject_truncated) = truncate_chars(subject, MAX_SUMMARY_SUBJECT_CHARS);
    let description_limit = if detail {
        MAX_DETAIL_DESCRIPTION_CHARS
    } else {
        MAX_SUMMARY_DESCRIPTION_CHARS
    };
    let (description, description_truncated) = truncate_chars(description, description_limit);
    ParsedCommit {
        author,
        committer,
        subject,
        description,
        subject_truncated: subject_truncated || decoded_was_lossy,
        description_truncated: description_truncated || decoded_was_lossy,
        malformed,
    }
}

fn encode_cursor(cursor: &HistoryCursor) -> String {
    format!(
        "v1:{}:{}:{}",
        cursor.offset, cursor.local_only_seen, cursor.snapshot_token
    )
}

/// `splitn(4)` rather than `split`: a snapshot token names its scope and so
/// carries `:` separators of its own, and the token is the last field.
fn decode_cursor(value: &str) -> Result<HistoryCursor, AppError> {
    let mut fields = value.splitn(4, ':');
    if fields.next() != Some("v1") {
        return Err(stale_cursor_error());
    }
    let offset = fields
        .next()
        .and_then(|field| field.parse().ok())
        .ok_or_else(stale_cursor_error)?;
    let local_only_seen = fields
        .next()
        .and_then(|field| field.parse().ok())
        .ok_or_else(stale_cursor_error)?;
    let snapshot_token = fields
        .next()
        .filter(|field| !field.is_empty())
        .ok_or_else(stale_cursor_error)?;
    Ok(HistoryCursor {
        offset,
        local_only_seen,
        snapshot_token: snapshot_token.to_string(),
    })
}

fn stale_cursor_error() -> AppError {
    AppError::new(
        AppErrorCode::StaleHistoryCursor,
        "This history changed while the next page was loading.",
    )
    .with_remediation("Refresh History to continue from the current saved versions.")
}

fn read_head_context(path: &str) -> Result<HeadContext, AppError> {
    let branch_output = run_git(path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    let branch = branch_output
        .status
        .success()
        .then(|| git_stdout(&branch_output));
    let head_output = run_git(path, &["rev-parse", "--verify", "HEAD^{commit}"])?;
    let head_commit = head_output
        .status
        .success()
        .then(|| git_stdout(&head_output));
    let head_state = match (&branch, &head_commit) {
        (_, None) => HeadState::Unborn,
        (None, Some(_)) => HeadState::Detached,
        (Some(_), Some(_)) => HeadState::Branch,
    };
    Ok(HeadContext {
        branch,
        head_state,
        head_commit,
    })
}

fn read_shallow(path: &str) -> Result<bool, AppError> {
    let output = run_git(path, &["rev-parse", "--is-shallow-repository"])?;
    if !output.status.success() {
        return Ok(false);
    }
    Ok(git_stdout(&output) == "true")
}

fn read_upstream(path: &str, branch: Option<&str>) -> Result<Option<UpstreamBoundary>, AppError> {
    let Some(branch) = branch else {
        return Ok(None);
    };
    let remotes = list_configured_remotes(path)?;
    let Some(upstream) = resolve_upstream(path, branch, &remotes)? else {
        return Ok(None);
    };
    let Some(commit) = resolve_commit(path, &upstream.tracking_ref)? else {
        return Ok(None);
    };
    Ok(Some(UpstreamBoundary {
        remote: upstream.remote,
        destination_branch: upstream.destination_branch,
        tracking_ref: upstream.tracking_ref,
        commit,
    }))
}

fn missing_branch_error(name: &str) -> AppError {
    AppError::new(
        AppErrorCode::BranchMissing,
        format!("The branch \"{name}\" isn't in this project any more."),
    )
    .with_remediation("Choose another branch, or go back to the current one.")
}

/// A local branch name as it arrives from the interface.
///
/// It is never handed to `rev-list` as a revision: it is prefixed to
/// `refs/heads/`, which is what keeps a name that looks like an option, a tag,
/// or a path from being read as one. This only bounds it and rejects what Git
/// refuses in a ref name anyway, so the failure is a sentence rather than exit
/// 128.
fn validated_branch_name(name: &str) -> Result<&str, AppError> {
    let rejected = name.is_empty()
        || name.chars().count() > MAX_BRANCH_NAME_CHARS
        || name.chars().any(|value| {
            value.is_control()
                || value.is_whitespace()
                || matches!(value, '~' | '^' | ':' | '?' | '*' | '[' | '\\')
        })
        || name.starts_with('-')
        || name.starts_with('/')
        || name.ends_with('/')
        || name.contains("..")
        || name.contains("//")
        || name.contains("@{");
    if rejected {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That isn't a branch this project can show.",
        )
        .with_remediation("Choose a branch from the list."));
    }
    Ok(name)
}

/// Every local branch and the commit it points at, oldest name first.
///
/// One `for-each-ref`, capped like every other read here — never one process
/// per branch.
fn read_local_branch_tips(path: &str) -> Result<(Vec<(String, String)>, bool), AppError> {
    let output = run_git_capped(
        path,
        &[
            "for-each-ref",
            "--format=%(objectname)%00%(refname)%00",
            "--sort=refname",
            "refs/heads",
        ],
        MAX_SCOPE_REF_OUTPUT_BYTES,
    )?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't list this project's branches.",
        )
        .with_remediation("Refresh History and try again."));
    }
    let mut tips = Vec::new();
    let fields = output.stdout.split(|byte| *byte == 0).collect::<Vec<_>>();
    for record in fields.chunks(2) {
        if record.len() < 2 {
            break;
        }
        let (Ok(commit), Ok(reference)) = (
            std::str::from_utf8(strip_record_newline(record[0])),
            std::str::from_utf8(strip_record_newline(record[1])),
        ) else {
            continue;
        };
        if !is_valid_oid(commit) || !reference.starts_with("refs/heads/") {
            continue;
        }
        tips.push((reference.to_string(), commit.to_string()));
    }
    let truncated = output.limit_exceeded || tips.len() > MAX_SCOPE_BRANCHES;
    tips.truncate(MAX_SCOPE_BRANCHES);
    Ok((tips, truncated))
}

fn resolve_scope(
    path: &str,
    scope: HistoryScope,
    head: &HeadContext,
) -> Result<ResolvedScope, AppError> {
    match &scope {
        HistoryScope::CurrentBranch => Ok(ResolvedScope {
            roots: head.head_commit.iter().cloned().collect(),
            // `HEAD` is already hashed into the token by itself, so the current
            // branch adds no tips of its own.
            tips: Vec::new(),
            truncated: false,
            scope,
        }),
        HistoryScope::Branch { name } => {
            let name = validated_branch_name(name)?;
            let reference = format!("refs/heads/{name}");
            let commit =
                resolve_commit(path, &reference)?.ok_or_else(|| missing_branch_error(name))?;
            Ok(ResolvedScope {
                roots: vec![commit.clone()],
                tips: vec![(reference, commit)],
                truncated: false,
                scope,
            })
        }
        HistoryScope::AllBranches => {
            let (tips, truncated) = read_local_branch_tips(path)?;
            let mut roots = tips
                .iter()
                .map(|(_, commit)| commit.clone())
                .collect::<Vec<_>>();
            // `rev-list` deduplicates the walk itself; deduplicating the roots
            // only keeps the argv proportional to distinct tips rather than to
            // branches, which two branches on one commit would otherwise double.
            roots.sort();
            roots.dedup();
            Ok(ResolvedScope {
                roots,
                tips,
                truncated,
                scope,
            })
        }
    }
}

/// The branch a scope's publication boundary should be read from: `HEAD`'s branch
/// for the current scope, the named branch for itself, and nothing for the union.
///
/// `AllBranches` has no honest single boundary — each branch answers to its own
/// upstream — so publication is reported as unknown there rather than measured
/// against a boundary that only describes one of them.
fn scope_upstream_branch<'a>(scope: &'a HistoryScope, head: &'a HeadContext) -> Option<&'a str> {
    match scope {
        HistoryScope::CurrentBranch => head.branch.as_deref(),
        HistoryScope::Branch { name } => Some(name.as_str()),
        HistoryScope::AllBranches => None,
    }
}

/// The scope half of a snapshot token, which is also how a later detail read
/// recovers the scope a page was taken at without the interface having to carry
/// it through every request. `:` cannot appear in a ref name, so the name field
/// is unambiguous.
fn scope_tag(scope: &HistoryScope) -> String {
    match scope {
        HistoryScope::CurrentBranch => "c".to_string(),
        HistoryScope::Branch { name } => format!("b:{name}"),
        HistoryScope::AllBranches => "a".to_string(),
    }
}

fn scope_from_token(token: &str) -> Option<HistoryScope> {
    let mut fields = token.splitn(3, ':');
    match fields.next()? {
        "c" => Some(HistoryScope::CurrentBranch),
        "a" => Some(HistoryScope::AllBranches),
        "b" => {
            let name = fields.next().filter(|value| !value.is_empty())?;
            Some(HistoryScope::Branch {
                name: name.to_string(),
            })
        }
        _ => None,
    }
}

fn compute_snapshot_token(
    repository_id: &str,
    head: &HeadContext,
    scope: &ResolvedScope,
    upstream: Option<&UpstreamBoundary>,
    remote_tips: Option<&str>,
    shallow: bool,
) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    repository_id.hash(&mut hasher);
    head.branch.hash(&mut hasher);
    head.head_state.hash(&mut hasher);
    head.head_commit.hash(&mut hasher);
    shallow.hash(&mut hasher);
    upstream
        .map(|value| (&value.tracking_ref, &value.commit))
        .hash(&mut hasher);
    // The tips, not merely the scope's name: a page and the pages after it
    // describe one history only while the refs they were walked from still
    // point where they did.
    scope.tips.hash(&mut hasher);
    scope.truncated.hash(&mut hasher);
    // "All branches" measures publication against every remote-tracking branch, so
    // a publish that moves one of them is a new answer even when no local tip
    // moved — a detail cached under the old token would still say "local".
    remote_tips.hash(&mut hasher);
    format!("{}:{:016x}", scope_tag(&scope.scope), hasher.finish())
}

fn read_snapshot(
    path: &str,
    repository_id: &str,
    scope: HistoryScope,
) -> Result<(SnapshotContext, bool), AppError> {
    let head = read_head_context(path)?;
    let scope = resolve_scope(path, scope, &head)?;
    let shallow = read_shallow(path)?;
    let (upstream, upstream_unavailable) =
        match read_upstream(path, scope_upstream_branch(&scope.scope, &head)) {
            Ok(value) => (value, false),
            Err(_) => (None, true),
        };
    let remote_tips = if matches!(scope.scope, HistoryScope::AllBranches) {
        Some(read_remote_tips(path)?)
    } else {
        None
    };
    let token = compute_snapshot_token(
        repository_id,
        &head,
        &scope,
        upstream.as_ref(),
        remote_tips.as_deref(),
        shallow,
    );
    Ok((
        SnapshotContext {
            head,
            scope,
            upstream,
            shallow,
            token,
        },
        upstream_unavailable,
    ))
}

fn parse_graph_rows(output: &[u8]) -> Result<Vec<CommitGraphRow>, AppError> {
    let text = std::str::from_utf8(output).map_err(|_| {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git returned commit identifiers that couldn't be represented safely.",
        )
    })?;
    let mut rows = Vec::new();
    for line in text.lines() {
        let mut fields = line.split_ascii_whitespace();
        let Some(commit) = fields.next() else {
            continue;
        };
        if !is_valid_oid(commit) {
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "Git returned an invalid saved-version identifier.",
            ));
        }
        let parents = fields
            .map(str::to_string)
            .filter(|parent| is_valid_oid(parent))
            .collect();
        rows.push(CommitGraphRow {
            commit: commit.to_string(),
            parents,
        });
    }
    Ok(rows)
}

/// What the caller asked the timeline to be narrowed to.
///
/// Every field becomes an argument to the same `rev-list` that pages the
/// timeline, so a filter applies to the whole reachable history rather than to
/// the rows the client happens to be holding. That distinction is the reason
/// the old client-side ordering control was withdrawn: a control that operates
/// on the loaded page stops telling the truth the moment the history is longer
/// than the page, and it does so silently.
#[derive(serde::Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct HistoryFilters {
    pub(crate) author: Option<String>,
    pub(crate) since: Option<String>,
    pub(crate) until: Option<String>,
    pub(crate) path: Option<String>,
    pub(crate) no_merges: bool,
    pub(crate) unpublished_only: bool,
    pub(crate) tagged_only: bool,
}

/// Validated filters, each already shaped as the argument it will be passed as
/// — one owned `String` per flag, so building the argv is a borrow rather than
/// a second round of formatting.
#[derive(Debug, Clone, Default)]
struct PreparedFilters {
    author: Option<String>,
    since: Option<String>,
    until: Option<String>,
    path: Option<String>,
    no_merges: bool,
    unpublished_only: bool,
    tagged_only: bool,
}

impl PreparedFilters {
    /// Whether anything was actually asked for. Publication is classified by a
    /// cheaper windowed walk while this holds; see `read_history_page_impl`.
    fn is_inert(&self) -> bool {
        self.author.is_none()
            && self.since.is_none()
            && self.until.is_none()
            && self.path.is_none()
            && !self.no_merges
            && !self.unpublished_only
            && !self.tagged_only
    }
}

fn invalid_filter(message: &str) -> AppError {
    AppError::new(AppErrorCode::InvalidSelection, message)
        .with_remediation("Change the filters and try again.")
}

/// Trims, bounds, and rejects control characters. A value reaches Git as one
/// argv element after `=`, never through a shell, so the danger is not quoting
/// but an unbounded or unprintable string reaching a subprocess.
fn text_filter(
    value: Option<&str>,
    limit: usize,
    message: &str,
) -> Result<Option<String>, AppError> {
    let Some(value) = value else { return Ok(None) };
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.chars().count() > limit || trimmed.chars().any(char::is_control) {
        return Err(invalid_filter(message));
    }
    Ok(Some(trimmed.to_string()))
}

/// `YYYY-MM-DD` and nothing else. Git's date parser accepts a great deal more,
/// including relative phrasing that would make the filter mean different things
/// on different days; the interface only ever sends a calendar day.
fn date_filter(value: Option<&str>, flag: &str) -> Result<Option<String>, AppError> {
    let Some(value) = text_filter(value, 10, "That date isn't a valid filter.")? else {
        return Ok(None);
    };
    let bytes = value.as_bytes();
    let shaped = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && [0, 1, 2, 3, 5, 6, 8, 9]
            .iter()
            .all(|index| bytes[*index].is_ascii_digit());
    if !shaped {
        return Err(invalid_filter("That date isn't a valid filter."));
    }
    Ok(Some(format!("{flag}={value}")))
}

fn prepare_filters(filters: Option<HistoryFilters>) -> Result<PreparedFilters, AppError> {
    let filters = filters.unwrap_or_default();
    let path = text_filter(
        filters.path.as_deref(),
        MAX_FILTER_PATH_CHARS,
        "That file or folder isn't a valid filter.",
    )?;
    if let Some(path) = path.as_deref() {
        validate_repo_relative_path(path)?;
    }
    Ok(PreparedFilters {
        author: text_filter(
            filters.author.as_deref(),
            MAX_FILTER_AUTHOR_CHARS,
            "That author isn't a valid filter.",
        )?
        .map(|value| format!("--author={value}")),
        since: date_filter(filters.since.as_deref(), "--since")?,
        until: date_filter(filters.until.as_deref(), "--until")?,
        path,
        no_merges: filters.no_merges,
        unpublished_only: filters.unpublished_only,
        tagged_only: filters.tagged_only,
    })
}

/// How much `rev-list` may print while classifying a page: one line per
/// unpublished version reachable from it, about 200,000 of them.
const CLASSIFY_OUTPUT_LIMIT: usize = 8 * 1024 * 1024;

/// Which of `commits` are not reachable from `published` — the upstream tip of
/// one branch, or `--remotes` for every remote-tracking branch at once. `None` when
/// more versions are unpublished than `CLASSIFY_OUTPUT_LIMIT` lets Git list.
///
/// Per commit rather than by the windowed walk in `read_local_only_commits`,
/// which assumes the page is the next `limit` commits in order — a filtered
/// page, or the union "All branches" walks, is not. Git ignores `--no-walk` once
/// a negative revision is given, so this lists every unpublished version
/// reachable from the page and keeps the page's own; it used to be capped at
/// the page's size and failed once more than a page's worth was unpublished.
fn classify_local_only(
    path: &str,
    commits: &[String],
    published: &str,
) -> Result<Option<HashSet<String>>, AppError> {
    if commits.is_empty() {
        return Ok(Some(HashSet::new()));
    }
    let mut args = vec!["rev-list"];
    args.extend(commits.iter().map(String::as_str));
    args.push("--not");
    args.push(published);
    let output = run_git_capped(path, &args, CLASSIFY_OUTPUT_LIMIT)?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't classify saved versions against what is published.",
        ));
    }
    if output.limit_exceeded {
        return Ok(None);
    }
    let page = commits.iter().map(String::as_str).collect::<HashSet<_>>();
    Ok(Some(
        git_stdout(&std::process::Output {
            status: output.status,
            stdout: output.stdout,
            stderr: Vec::new(),
        })
        .lines()
        .filter(|commit| is_valid_oid(commit) && page.contains(commit))
        .map(str::to_string)
        .collect(),
    ))
}

/// Every remote-tracking branch and where it points, as one string for the
/// snapshot token of "All branches".
fn read_remote_tips(path: &str) -> Result<String, AppError> {
    let output = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname) %(objectname)",
            "refs/remotes",
        ],
    )?;
    Ok(if output.status.success() {
        git_stdout(&output)
    } else {
        String::new()
    })
}

/// Whether the project has any remote-tracking branch at all. Without one there
/// is nothing a version could have been published to, and "All branches" says
/// publication is unknown rather than calling every version local.
fn has_remote_tracking_branches(path: &str) -> Result<bool, AppError> {
    let output = run_git(
        path,
        &[
            "for-each-ref",
            "--count=1",
            "--format=%(refname)",
            "refs/remotes",
        ],
    )?;
    Ok(output.status.success() && !git_stdout(&output).trim().is_empty())
}

/// What a scope's publication is measured against when it has no single
/// upstream: under "All branches" each branch answers to its own remote, so a
/// version is published once any remote-tracking branch holds it.
fn publication_against_remotes(
    path: &str,
    scope: &HistoryScope,
    upstream: Option<&UpstreamBoundary>,
) -> Result<bool, AppError> {
    Ok(upstream.is_none()
        && matches!(scope, HistoryScope::AllBranches)
        && has_remote_tracking_branches(path)?)
}

fn read_graph_page(
    path: &str,
    roots: &[String],
    offset: usize,
    limit: usize,
    filters: &PreparedFilters,
    unpublished_upstream: Option<&str>,
) -> Result<(Vec<CommitGraphRow>, bool, usize), AppError> {
    let max_count = format!("--max-count={}", limit + 1);
    let skip = format!("--skip={offset}");
    // "Only tagged" is the one question `rev-list` cannot ask: it keeps the
    // commits a tag points at, which is `--simplify-by-decoration` narrowed by
    // `--decorate-refs`, and only `log` takes the second. `%H %P` prints the
    // same `commit parent…` branch `--parents` does, so the parser is shared;
    // color and signatures are pinned off so no user config can add branches.
    // Git keeps a root commit through the simplification whether or not a tag
    // points at it, so `%D` — narrowed by the same `--decorate-refs` — rides
    // after a tab and an empty one drops the row.
    let mut args = if filters.tagged_only {
        vec![
            "log",
            "--no-color",
            "--no-show-signature",
            "--format=%H %P%x09%D",
            "--simplify-by-decoration",
            "--decorate-refs=refs/tags/",
            "--topo-order",
            "--date-order",
            max_count.as_str(),
            skip.as_str(),
        ]
    } else {
        vec![
            "rev-list",
            "--topo-order",
            "--date-order",
            "--parents",
            max_count.as_str(),
            skip.as_str(),
        ]
    };
    if let Some(author) = filters.author.as_deref() {
        // A name is text, not a pattern. Git reads `--author` as a regular
        // expression by default, so a bracket typed into the name field —
        // `a[` — is an invalid expression and fails the whole read with exit
        // 128, which the screen can only report as an error. `--fixed-strings`
        // makes it the substring match the field looks like it is, and
        // `--regexp-ignore-case` makes "ada" find "Ada Lovelace", which is
        // what someone who does not know Git will expect of a name box.
        args.push("--fixed-strings");
        args.push("--regexp-ignore-case");
        args.push(author);
    }
    if let Some(since) = filters.since.as_deref() {
        args.push(since);
    }
    if let Some(until) = filters.until.as_deref() {
        args.push(until);
    }
    if filters.no_merges {
        args.push("--no-merges");
    }
    // Several roots are one walk, not several: `rev-list` returns their union
    // in one order, visiting a commit reachable from more than one of them
    // exactly once. That is what makes "all branches" a deduplicated history
    // rather than a concatenation of branches.
    for root in roots {
        args.push(root.as_str());
    }
    // "Not published yet" is an exclusion of everything the upstream already
    // has, which is the same question `--not` answers — so it is a filter over
    // the whole history like the others, not a predicate over loaded rows.
    if let Some(upstream) = unpublished_upstream {
        args.push("--not");
        args.push(upstream);
    }
    // Last, and behind `--`: a pathspec, never an option, whatever it contains.
    if let Some(path_spec) = filters.path.as_deref() {
        args.push("--");
        args.push(path_spec);
    }
    let output = run_git_capped(path, &args, 256 * 1024)?;
    if !output.status.success() || output.limit_exceeded {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this part of the saved-version history.",
        )
        .with_remediation("Refresh History and try again."));
    }
    // What Git walked and what the page keeps can differ under "only tagged",
    // which drops an untagged root after the walk. Paging counts what Git
    // walked — `--skip` does — so the cursor advances by that, and the next
    // page neither repeats a row nor skips one.
    let (text, tagged): (Vec<u8>, Option<Vec<bool>>) = if filters.tagged_only {
        let mut text = Vec::new();
        let mut tagged = Vec::new();
        for line in output.stdout.split(|byte| *byte == b'\n') {
            let Some(tab) = line.iter().position(|byte| *byte == b'\t') else {
                continue;
            };
            text.extend_from_slice(&line[..tab]);
            text.push(b'\n');
            tagged.push(
                line[tab + 1..]
                    .iter()
                    .any(|byte| !byte.is_ascii_whitespace()),
            );
        }
        (text, Some(tagged))
    } else {
        (output.stdout, None)
    };
    let mut rows = parse_graph_rows(&text)?;
    let has_more = rows.len() > limit;
    rows.truncate(limit);
    let walked = rows.len();
    if let Some(tagged) = tagged {
        let mut kept = tagged.into_iter();
        rows.retain(|_| kept.next().unwrap_or(false));
    }
    Ok((rows, has_more, walked))
}

fn batch_input<'a>(hashes: impl IntoIterator<Item = &'a str>) -> Vec<u8> {
    let mut input = Vec::new();
    for hash in hashes {
        input.extend_from_slice(hash.as_bytes());
        input.push(b'\n');
    }
    input
}

fn read_object_sizes(path: &str, hashes: &[String]) -> Result<HashMap<String, usize>, AppError> {
    if hashes.is_empty() {
        return Ok(HashMap::new());
    }
    let input = batch_input(hashes.iter().map(String::as_str));
    let output = run_git_with_input_capped(
        path,
        &[
            "cat-file",
            "--batch-check=%(objectname) %(objecttype) %(objectsize)",
        ],
        &input,
        hashes.len() * 160 + 1024,
    )?;
    if !output.status.success() || output.limit_exceeded {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect saved-version metadata safely.",
        ));
    }
    let text = std::str::from_utf8(&output.stdout).map_err(|_| {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git returned unreadable object metadata.",
        )
    })?;
    let mut sizes = HashMap::new();
    for line in text.lines() {
        let mut fields = line.split_ascii_whitespace();
        let (Some(hash), Some(kind), Some(size)) = (fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        if kind == "commit" && is_valid_oid(hash) {
            if let Ok(size) = size.parse() {
                sizes.insert(hash.to_string(), size);
            }
        }
    }
    Ok(sizes)
}

fn parse_batch_objects(output: &[u8]) -> Result<HashMap<String, Vec<u8>>, AppError> {
    let mut cursor = 0usize;
    let mut objects = HashMap::new();
    while cursor < output.len() {
        let header_end = output[cursor..]
            .iter()
            .position(|byte| *byte == b'\n')
            .map(|position| cursor + position)
            .ok_or_else(|| {
                AppError::new(
                    AppErrorCode::GitCommandFailed,
                    "Git returned an incomplete object header.",
                )
            })?;
        let header = std::str::from_utf8(&output[cursor..header_end]).map_err(|_| {
            AppError::new(
                AppErrorCode::GitCommandFailed,
                "Git returned an unreadable object header.",
            )
        })?;
        let mut fields = header.split_ascii_whitespace();
        let (Some(hash), Some(kind), Some(size)) = (fields.next(), fields.next(), fields.next())
        else {
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "Git returned malformed object metadata.",
            ));
        };
        let size: usize = size.parse().map_err(|_| {
            AppError::new(
                AppErrorCode::GitCommandFailed,
                "Git returned an invalid object size.",
            )
        })?;
        let data_start = header_end + 1;
        let data_end = data_start
            .checked_add(size)
            .filter(|end| *end <= output.len())
            .ok_or_else(|| {
                AppError::new(
                    AppErrorCode::GitCommandFailed,
                    "Git returned an incomplete saved-version object.",
                )
            })?;
        if kind == "commit" && is_valid_oid(hash) {
            objects.insert(hash.to_string(), output[data_start..data_end].to_vec());
        }
        cursor = data_end;
        if output.get(cursor) == Some(&b'\n') {
            cursor += 1;
        }
    }
    Ok(objects)
}

fn read_page_objects(path: &str, rows: &[CommitGraphRow]) -> Result<PageObjects, AppError> {
    let hashes = rows
        .iter()
        .map(|row| row.commit.clone())
        .collect::<Vec<_>>();
    let sizes = read_object_sizes(path, &hashes)?;
    let mut selected = Vec::new();
    let mut unavailable = HashMap::new();
    let mut budget = 0usize;
    for hash in hashes {
        let Some(size) = sizes.get(&hash).copied() else {
            unavailable.insert(hash, MessageUnavailableReason::Malformed);
            continue;
        };
        if size > MAX_PAGE_COMMIT_OBJECT_BYTES {
            unavailable.insert(hash, MessageUnavailableReason::TooLarge);
        } else if budget.saturating_add(size) > MAX_PAGE_COMMIT_BATCH_BYTES {
            unavailable.insert(hash, MessageUnavailableReason::PageBudget);
        } else {
            budget += size;
            selected.push(hash);
        }
    }
    if selected.is_empty() {
        return Ok((HashMap::new(), unavailable));
    }
    let input = batch_input(selected.iter().map(String::as_str));
    let output = run_git_with_input_capped(
        path,
        &["cat-file", "--batch"],
        &input,
        budget + selected.len() * 100 + 1024,
    )?;
    if !output.status.success() || output.limit_exceeded {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read saved-version messages within the safety limit.",
        ));
    }
    Ok((parse_batch_objects(&output.stdout)?, unavailable))
}

fn strip_record_newline(mut value: &[u8]) -> &[u8] {
    while matches!(value.first(), Some(b'\n' | b'\r')) {
        value = &value[1..];
    }
    while matches!(value.last(), Some(b'\n' | b'\r')) {
        value = &value[..value.len() - 1];
    }
    value
}

fn decoration_for_ref(reference: &str) -> Option<HistoryDecoration> {
    let (kind, name) = if let Some(name) = reference.strip_prefix("refs/heads/") {
        (DecorationKind::LocalBranch, name)
    } else if let Some(name) = reference.strip_prefix("refs/remotes/") {
        (DecorationKind::RemoteBranch, name)
    } else {
        let name = reference.strip_prefix("refs/tags/")?;
        (DecorationKind::Tag, name)
    };
    Some(HistoryDecoration {
        kind,
        name: name.to_string(),
        full_ref: reference.to_string(),
    })
}

/// `head` is optional because a scope can list versions while `HEAD` itself has
/// none — a named branch in a project whose current branch is unborn. The synthetic
/// `HEAD` marker is only ever added where `HEAD` genuinely points.
fn read_decorations(
    path: &str,
    page_commits: &HashSet<String>,
    head: Option<&str>,
) -> Result<DecorationSnapshot, AppError> {
    let output = run_git_capped(
        path,
        &[
            "for-each-ref",
            "--format=%(objectname)%00%(*objectname)%00%(refname)%00",
            "refs/heads",
            "refs/remotes",
            "refs/tags",
        ],
        MAX_DECORATION_OUTPUT_BYTES,
    )?;
    if !output.status.success() {
        return Ok((HashMap::new(), HashSet::new(), false, true));
    }
    let mut by_commit: HashMap<String, Vec<HistoryDecoration>> = HashMap::new();
    let mut truncated_commits = HashSet::new();
    let mut unreadable = false;
    let fields = output.stdout.split(|byte| *byte == 0).collect::<Vec<_>>();
    for record in fields.chunks(3) {
        if record.len() < 3 {
            break;
        }
        let object = strip_record_newline(record[0]);
        let peeled = strip_record_newline(record[1]);
        let reference = strip_record_newline(record[2]);
        let commit_bytes = if !peeled.is_empty() { peeled } else { object };
        let (Ok(commit), Ok(reference)) = (
            std::str::from_utf8(commit_bytes),
            std::str::from_utf8(reference),
        ) else {
            unreadable = true;
            continue;
        };
        if !page_commits.contains(commit) {
            continue;
        }
        let Some(decoration) = decoration_for_ref(reference) else {
            continue;
        };
        let decorations = by_commit.entry(commit.to_string()).or_default();
        // Reserve one slot for the synthetic HEAD marker on the current tip,
        // so the documented per-version cap remains true after insertion.
        let limit = if Some(commit) == head {
            MAX_DECORATIONS_PER_VERSION - 1
        } else {
            MAX_DECORATIONS_PER_VERSION
        };
        if decorations.len() < limit {
            decorations.push(decoration);
        } else {
            truncated_commits.insert(commit.to_string());
        }
    }
    if let Some(head) = head {
        let head_decorations = by_commit.entry(head.to_string()).or_default();
        head_decorations.insert(
            0,
            HistoryDecoration {
                kind: DecorationKind::Head,
                name: "HEAD".to_string(),
                full_ref: "HEAD".to_string(),
            },
        );
    }
    for decorations in by_commit.values_mut() {
        decorations.sort_by(|left, right| {
            let rank = |kind| match kind {
                DecorationKind::Head => 0,
                DecorationKind::LocalBranch => 1,
                DecorationKind::RemoteBranch => 2,
                DecorationKind::Tag => 3,
            };
            rank(left.kind)
                .cmp(&rank(right.kind))
                .then_with(|| left.name.cmp(&right.name))
        });
    }
    Ok((
        by_commit,
        truncated_commits,
        output.limit_exceeded,
        unreadable,
    ))
}

fn read_local_only_commits(
    path: &str,
    roots: &[String],
    upstream: &str,
    skip: usize,
    limit: usize,
) -> Result<HashSet<String>, AppError> {
    let skip = format!("--skip={skip}");
    let max_count = format!("--max-count={limit}");
    let mut args = vec![
        "rev-list",
        "--topo-order",
        "--date-order",
        skip.as_str(),
        max_count.as_str(),
    ];
    for root in roots {
        args.push(root.as_str());
    }
    args.push("--not");
    args.push(upstream);
    let output = run_git_capped(path, &args, limit * 80 + 1024)?;
    if !output.status.success() || output.limit_exceeded {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't classify saved versions against the configured upstream.",
        ));
    }
    Ok(git_stdout(&std::process::Output {
        status: output.status,
        stdout: output.stdout,
        stderr: Vec::new(),
    })
    .lines()
    .filter(|commit| is_valid_oid(commit))
    .map(str::to_string)
    .collect())
}

fn summary_from_parts(
    row: &CommitGraphRow,
    parsed: Option<ParsedCommit>,
    unavailable: Option<MessageUnavailableReason>,
    decorations: Vec<HistoryDecoration>,
    decorations_truncated: bool,
    publication: PublicationState,
) -> SavedVersionSummary {
    let parsed = parsed.unwrap_or(ParsedCommit {
        author: None,
        committer: None,
        subject: String::new(),
        description: String::new(),
        subject_truncated: false,
        description_truncated: false,
        malformed: true,
    });
    let author = parsed.author.as_ref().map(|value| value.author.clone());
    let authored_at = parsed.author.as_ref().map(|value| value.timestamp.clone());
    let committed_at = parsed.committer.as_ref().and_then(|committer| {
        let materially_different = authored_at.as_ref().is_some_and(|authored| {
            authored.unix_seconds != committer.timestamp.unix_seconds
                || authored.offset_minutes != committer.timestamp.offset_minutes
        });
        materially_different.then(|| committer.timestamp.clone())
    });
    SavedVersionSummary {
        commit: row.commit.clone(),
        short_commit: short_oid(&row.commit),
        parents: row.parents.clone(),
        subject: parsed.subject,
        description: parsed.description,
        author,
        authored_at,
        committed_at,
        decorations,
        is_root: row.parents.is_empty(),
        is_merge: row.parents.len() > 1,
        publication,
        subject_truncated: parsed.subject_truncated,
        description_truncated: parsed.description_truncated,
        decorations_truncated,
        message_unavailable: unavailable.or(parsed
            .malformed
            .then_some(MessageUnavailableReason::Malformed)),
    }
}

#[cfg(test)]
pub(crate) fn read_history_page(
    path: String,
    cursor: Option<String>,
    page_size: Option<usize>,
    filters: Option<HistoryFilters>,
    scope: Option<HistoryScope>,
) -> Result<HistoryPage, AppError> {
    read_history_page_impl(path, cursor, page_size, filters, scope, None)
}

pub(crate) fn read_history_page_cached(
    cache: &HistoryReadCache,
    path: String,
    cursor: Option<String>,
    page_size: Option<usize>,
    filters: Option<HistoryFilters>,
    scope: Option<HistoryScope>,
) -> Result<HistoryPage, AppError> {
    read_history_page_impl(path, cursor, page_size, filters, scope, Some(cache))
}

fn read_history_page_impl(
    path: String,
    cursor: Option<String>,
    page_size: Option<usize>,
    filters: Option<HistoryFilters>,
    scope: Option<HistoryScope>,
    cache: Option<&HistoryReadCache>,
) -> Result<HistoryPage, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "read_history_page", None)?;
    let filters = prepare_filters(filters)?;
    let repository_id = repository.worktree_root.match_key().to_string();
    let (snapshot, upstream_unavailable) =
        read_snapshot(&path, &repository_id, scope.unwrap_or_default())?;
    let cursor = cursor.as_deref().map(decode_cursor).transpose()?;
    if cursor
        .as_ref()
        .is_some_and(|value| value.snapshot_token != snapshot.token)
    {
        return Err(stale_cursor_error());
    }
    let offset = cursor.as_ref().map_or(0, |value| value.offset);
    let local_only_seen = cursor.as_ref().map_or(0, |value| value.local_only_seen);
    let page_size = page_size
        .unwrap_or(DEFAULT_HISTORY_PAGE_SIZE)
        .clamp(1, MAX_HISTORY_PAGE_SIZE);
    let mut warnings = Vec::new();
    if snapshot.shallow {
        warnings.push(HistoryWarningCode::ShallowRepository);
    }
    if upstream_unavailable {
        warnings.push(HistoryWarningCode::UpstreamUnavailable);
    }
    if snapshot.scope.truncated {
        warnings.push(HistoryWarningCode::BranchesTruncated);
    }
    // Emptiness is a fact about the scope, not about `HEAD`: a named branch can
    // have versions in a project whose current branch is unborn, and "all branches"
    // in a project with none has nothing to walk from.
    if snapshot.scope.roots.is_empty() {
        return Ok(HistoryPage {
            repository_id,
            snapshot_token: snapshot.token,
            scope: snapshot.scope.scope,
            branch: snapshot.head.branch,
            head_state: snapshot.head.head_state,
            head_commit: snapshot.head.head_commit,
            upstream: snapshot.upstream,
            versions: Vec::new(),
            next_cursor: None,
            has_more: false,
            shallow: snapshot.shallow,
            warnings,
        });
    }
    let roots = snapshot.scope.roots.clone();
    // Asked for but unanswerable: without an upstream there is nothing to
    // compare against, every version below reads `Unknown`, and the screen
    // says so in a notice of its own. Narrowing to an empty list would be a
    // worse answer than not narrowing.
    let unpublished_upstream = filters
        .unpublished_only
        .then(|| {
            snapshot
                .upstream
                .as_ref()
                .map(|value| value.commit.as_str())
        })
        .flatten();
    let (rows, has_more, walked) = read_graph_page(
        &path,
        &roots,
        offset,
        page_size,
        &filters,
        unpublished_upstream,
    )?;
    let (objects, unavailable) = read_page_objects(&path, &rows)?;
    if !unavailable.is_empty() {
        warnings.push(HistoryWarningCode::MessagesTruncated);
    }
    let commits = rows
        .iter()
        .map(|row| row.commit.clone())
        .collect::<HashSet<_>>();
    let (mut decorations, decoration_truncations, decorations_truncated, unreadable_refs) =
        read_decorations(&path, &commits, snapshot.head.head_commit.as_deref())?;
    if decorations_truncated || !decoration_truncations.is_empty() {
        warnings.push(HistoryWarningCode::DecorationsTruncated);
    }
    if unreadable_refs {
        warnings.push(HistoryWarningCode::UnreadableMetadata);
    }
    let page_commits = rows
        .iter()
        .map(|row| row.commit.clone())
        .collect::<Vec<_>>();
    // "All branches": per commit, against every remote-tracking branch. Too much
    // unpublished work to list leaves publication unknown, as it was.
    let remotes_local_only =
        if publication_against_remotes(&path, &snapshot.scope.scope, snapshot.upstream.as_ref())? {
            classify_local_only(&path, &page_commits, "--remotes")?
        } else {
            None
        };
    let against_remotes = remotes_local_only.is_some();
    let local_only = match snapshot.upstream.as_ref() {
        None => remotes_local_only.unwrap_or_default(),
        // The windowed walk only lines up with a page that is the next
        // `page_size` commits in order. That is exactly what an unfiltered page
        // is, and exactly what a filtered one is not.
        Some(upstream) if filters.is_inert() => {
            read_local_only_commits(&path, &roots, &upstream.commit, local_only_seen, page_size)?
        }
        Some(upstream) => {
            classify_local_only(&path, &page_commits, &upstream.commit)?.ok_or_else(|| {
                AppError::new(
                    AppErrorCode::GitCommandFailed,
                    "Git couldn't classify saved versions against the configured upstream.",
                )
            })?
        }
    };
    let page_local_only = rows
        .iter()
        .filter(|row| local_only.contains(&row.commit))
        .count();
    let versions = rows
        .iter()
        .map(|row| {
            let parsed = objects
                .get(&row.commit)
                .map(|bytes| parse_commit_object(bytes, false));
            let publication = if snapshot.upstream.is_none() && !against_remotes {
                PublicationState::Unknown
            } else if local_only.contains(&row.commit) {
                PublicationState::LocalOnly
            } else {
                PublicationState::Published
            };
            summary_from_parts(
                row,
                parsed,
                unavailable.get(&row.commit).copied(),
                decorations.remove(&row.commit).unwrap_or_default(),
                decoration_truncations.contains(&row.commit),
                publication,
            )
        })
        .collect::<Vec<_>>();
    let next_cursor = has_more.then(|| {
        encode_cursor(&HistoryCursor {
            offset: offset + walked,
            local_only_seen: local_only_seen + page_local_only,
            snapshot_token: snapshot.token.clone(),
        })
    });
    if let Some(cache) = cache {
        cache.record_page(&repository_id, &snapshot, &rows, &versions);
    }
    Ok(HistoryPage {
        repository_id,
        snapshot_token: snapshot.token,
        scope: snapshot.scope.scope,
        branch: snapshot.head.branch,
        head_state: snapshot.head.head_state,
        head_commit: snapshot.head.head_commit,
        upstream: snapshot.upstream,
        versions,
        next_cursor,
        has_more,
        shallow: snapshot.shallow,
        warnings,
    })
}

fn validate_snapshot_and_commit(
    path: &str,
    repository_id: &str,
    snapshot_token: &str,
    commit: &str,
) -> Result<SnapshotContext, AppError> {
    if !is_valid_oid(commit) {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That saved version couldn't be identified.",
        ));
    }
    // The token names the scope it was taken at, so a detail read re-resolves
    // the same history the page walked without the request having to carry the
    // scope through every command. A token whose scope no longer resolves — a
    // branch deleted while its detail was open — is stale, not invalid input.
    let Some(scope) = scope_from_token(snapshot_token) else {
        return Err(stale_cursor_error());
    };
    let (snapshot, _) = match read_snapshot(path, repository_id, scope) {
        Ok(value) => value,
        Err(error) if error.code == AppErrorCode::BranchMissing => return Err(stale_cursor_error()),
        Err(error) => return Err(error),
    };
    if snapshot.token != snapshot_token {
        return Err(stale_cursor_error());
    }
    if snapshot.scope.roots.is_empty() {
        return Err(stale_cursor_error());
    }
    if !reachable_from_scope(path, commit, &snapshot.scope)? {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That saved version is no longer reachable from the history being shown.",
        )
        .with_remediation("Refresh History and choose a saved version that is still listed."));
    }
    Ok(snapshot)
}

/// Whether `commit` is still part of the history this scope walks.
///
/// One process whatever the scope's size. A single root is the ancestry test
/// `merge-base` already answered; a union asks Git which local tips reach the
/// commit and intersects that with the tips this scope was walked from, rather
/// than running one `merge-base` per branch.
fn reachable_from_scope(path: &str, commit: &str, scope: &ResolvedScope) -> Result<bool, AppError> {
    if let [only] = scope.roots.as_slice() {
        let output = run_git(path, &["merge-base", "--is-ancestor", commit, only])?;
        return Ok(output.status.success());
    }
    let contains = format!("--contains={commit}");
    let output = run_git_capped(
        path,
        &[
            "for-each-ref",
            "--format=%(refname)",
            &contains,
            "refs/heads",
        ],
        MAX_SCOPE_REF_OUTPUT_BYTES,
    )?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't check which branches still hold this saved version.",
        )
        .with_remediation("Refresh History and try again."));
    }
    let listed = git_stdout(&std::process::Output {
        status: output.status,
        stdout: output.stdout,
        stderr: Vec::new(),
    });
    let listed = listed.lines().collect::<HashSet<_>>();
    Ok(scope
        .tips
        .iter()
        .any(|(reference, _)| listed.contains(reference.as_str())))
}

fn read_one_commit(path: &str, commit: &str) -> Result<(ParsedCommit, bool), AppError> {
    let output = run_git_capped(
        path,
        &["cat-file", "commit", commit],
        MAX_DETAIL_COMMIT_BYTES,
    )?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read that saved version.",
        ));
    }
    let mut parsed = parse_commit_object(&output.stdout, true);
    if output.limit_exceeded {
        parsed.description_truncated = true;
    }
    Ok((parsed, output.limit_exceeded))
}

fn parse_name_status_z(bytes: &[u8]) -> (Vec<HistoryFileChange>, bool) {
    let fields = bytes.split(|byte| *byte == 0).collect::<Vec<_>>();
    let mut changes = Vec::new();
    let mut index = 0usize;
    let mut unreadable = false;
    while index < fields.len() {
        let status = strip_record_newline(fields[index]);
        index += 1;
        if status.is_empty() {
            continue;
        }
        let Some(first_path) = fields.get(index).map(|value| strip_record_newline(value)) else {
            break;
        };
        index += 1;
        let status_kind = status[0];
        let (path_bytes, original_bytes, category): (&[u8], Option<&[u8]>, ChangeCategory) =
            match status_kind {
                b'A' => (first_path, None, ChangeCategory::New),
                b'D' => (first_path, None, ChangeCategory::Deleted),
                b'R' | b'C' => {
                    let Some(new_path) = fields.get(index).map(|value| strip_record_newline(value))
                    else {
                        break;
                    };
                    index += 1;
                    (new_path, Some(first_path), ChangeCategory::Renamed)
                }
                _ => (first_path, None, ChangeCategory::Changed),
            };
        let Ok(path) = std::str::from_utf8(path_bytes) else {
            unreadable = true;
            continue;
        };
        let original_path = match original_bytes {
            Some(value) => match std::str::from_utf8(value) {
                Ok(value) => Some(value.to_string()),
                Err(_) => {
                    unreadable = true;
                    continue;
                }
            },
            None => None,
        };
        changes.push(HistoryFileChange {
            path: path.to_string(),
            original_path,
            category,
        });
    }
    (changes, unreadable)
}

fn count_files(changes: &[HistoryFileChange]) -> HistoryFileCounts {
    let mut counts = HistoryFileCounts::default();
    for change in changes {
        match change.category {
            ChangeCategory::Changed | ChangeCategory::Conflicted => counts.changed += 1,
            ChangeCategory::New => counts.new += 1,
            ChangeCategory::Deleted => counts.deleted += 1,
            ChangeCategory::Renamed => counts.renamed += 1,
        }
        counts.total += 1;
    }
    counts
}

fn read_detail_files(
    path: &str,
    base: &str,
    commit: &str,
) -> Result<(Vec<HistoryFileChange>, HistoryFileCounts, bool, bool), AppError> {
    let output = run_git_capped(
        path,
        &[
            "diff",
            "--name-status",
            "-z",
            "-M",
            "-C",
            base,
            commit,
            "--",
        ],
        MAX_DETAIL_FILE_OUTPUT_BYTES,
    )?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read the files changed by that saved version.",
        ));
    }
    let (all_changes, unreadable) = parse_name_status_z(&output.stdout);
    let counts = count_files(&all_changes);
    let mut files = all_changes;
    let over_entry_cap = files.len() > MAX_DETAIL_FILES;
    files.truncate(MAX_DETAIL_FILES);
    Ok((
        files,
        counts,
        output.limit_exceeded || over_entry_cap || unreadable,
        output.limit_exceeded,
    ))
}

fn graph_row_for_commit(path: &str, commit: &str) -> Result<CommitGraphRow, AppError> {
    let output = run_git(path, &["rev-list", "--parents", "--max-count=1", commit])?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect that saved version.",
        ));
    }
    parse_graph_rows(&output.stdout)?
        .into_iter()
        .next()
        .ok_or_else(|| {
            AppError::new(
                AppErrorCode::GitCommandFailed,
                "Git didn't return that saved version.",
            )
        })
}

/// Whether the cheap freshness check still holds for a cached read.
///
/// `HEAD` alone was enough while every history was `HEAD`'s. Under a scope it
/// is not: the branch being read can move while `HEAD` stands still, and serving
/// a cached detail then would answer for a history that no longer exists. The
/// current branch still costs one `rev-parse`; a scoped read costs one more
/// process, never one per branch.
fn cached_snapshot_is_current(path: &str, cached: &SnapshotContext) -> Result<bool, AppError> {
    let output = run_git(path, &["rev-parse", "--verify", "HEAD^{commit}"])?;
    let head = output.status.success().then(|| git_stdout(&output));
    if head.as_deref() != cached.head.head_commit.as_deref() {
        return Ok(false);
    }
    if cached.scope.tips.is_empty() {
        return Ok(matches!(cached.scope.scope, HistoryScope::CurrentBranch));
    }
    let (tips, truncated) = read_local_branch_tips(path)?;
    Ok(match cached.scope.scope {
        // The union is only the same history while the whole set is, including
        // a branch that has since been added.
        HistoryScope::AllBranches => {
            truncated == cached.scope.truncated && tips == cached.scope.tips
        }
        _ => cached
            .scope
            .tips
            .iter()
            .all(|entry| tips.iter().any(|current| current == entry)),
    })
}

fn detail_from_cached_read(
    path: &str,
    cached: CachedHistoryRead,
) -> Result<SavedVersionDetail, AppError> {
    if let Some(detail) = cached.detail {
        return Ok(detail);
    }
    let comparison_base = cached
        .row
        .parents
        .first()
        .cloned()
        .unwrap_or_else(|| EMPTY_TREE_HASH.to_string());
    let (files, file_counts, files_truncated, counts_are_minimum) =
        read_detail_files(path, &comparison_base, &cached.row.commit)?;
    Ok(SavedVersionDetail {
        version: cached.version,
        comparison_base,
        comparison_is_empty_tree: cached.row.parents.is_empty(),
        comparison_is_first_parent: cached.row.parents.len() > 1,
        files,
        file_counts,
        files_truncated,
        counts_are_minimum,
    })
}

#[cfg(test)]
pub(crate) fn read_saved_version_detail(
    path: String,
    snapshot_token: String,
    commit: String,
) -> Result<SavedVersionDetail, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "read_saved_version_detail", None)?;
    let repository_id = repository.worktree_root.match_key().to_string();
    read_saved_version_detail_authorized(&path, &repository_id, snapshot_token, commit)
}

pub(crate) fn read_saved_version_detail_cached(
    cache: &HistoryReadCache,
    path: String,
    snapshot_token: String,
    commit: String,
) -> Result<SavedVersionDetail, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "read_saved_version_detail", None)?;
    let repository_id = repository.worktree_root.match_key().to_string();
    if is_valid_oid(&commit) {
        if let Some(cached) = cache.read(&repository_id, &snapshot_token, &commit) {
            if cached_snapshot_is_current(&path, &cached.snapshot)? {
                let detail = detail_from_cached_read(&path, cached)?;
                cache.record_detail(&repository_id, &snapshot_token, &commit, &detail);
                return Ok(detail);
            }
        }
    }
    read_saved_version_detail_authorized(&path, &repository_id, snapshot_token, commit)
}

fn read_saved_version_detail_authorized(
    path: &str,
    repository_id: &str,
    snapshot_token: String,
    commit: String,
) -> Result<SavedVersionDetail, AppError> {
    let snapshot = validate_snapshot_and_commit(path, repository_id, &snapshot_token, &commit)?;
    let row = graph_row_for_commit(path, &commit)?;
    let (parsed, message_capped) = read_one_commit(path, &commit)?;
    let page_commits = HashSet::from([commit.clone()]);
    let (mut decorations, decoration_truncations, _, _) =
        read_decorations(path, &page_commits, snapshot.head.head_commit.as_deref())?;
    let publication = if let Some(upstream) = snapshot.upstream.as_ref() {
        let output = run_git(
            path,
            &["merge-base", "--is-ancestor", &commit, &upstream.commit],
        )?;
        if output.status.success() {
            PublicationState::Published
        } else {
            PublicationState::LocalOnly
        }
    } else if publication_against_remotes(path, &snapshot.scope.scope, None)? {
        match classify_local_only(path, std::slice::from_ref(&commit), "--remotes")? {
            Some(local) if local.is_empty() => PublicationState::Published,
            Some(_) => PublicationState::LocalOnly,
            None => PublicationState::Unknown,
        }
    } else {
        PublicationState::Unknown
    };
    let version = summary_from_parts(
        &row,
        Some(parsed),
        message_capped.then_some(MessageUnavailableReason::TooLarge),
        decorations.remove(&commit).unwrap_or_default(),
        decoration_truncations.contains(&commit),
        publication,
    );
    let comparison_base = row
        .parents
        .first()
        .cloned()
        .unwrap_or_else(|| EMPTY_TREE_HASH.to_string());
    let (files, file_counts, files_truncated, counts_are_minimum) =
        read_detail_files(path, &comparison_base, &commit)?;
    Ok(SavedVersionDetail {
        version,
        comparison_base,
        comparison_is_empty_tree: row.parents.is_empty(),
        comparison_is_first_parent: row.parents.len() > 1,
        files,
        file_counts,
        files_truncated,
        counts_are_minimum,
    })
}

#[cfg(test)]
pub(crate) fn read_saved_version_file_diff(
    path: String,
    snapshot_token: String,
    commit: String,
    file_path: String,
) -> Result<FileDiff, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "read_saved_version_file_diff", None)?;
    let repository_id = repository.worktree_root.match_key().to_string();
    let (base, change) =
        saved_version_change(&path, &repository_id, &snapshot_token, &commit, &file_path)?;
    read_file_diff_for_change(&path, &base, &commit, change)
}

pub(crate) fn read_saved_version_file_diff_cached(
    cache: &HistoryReadCache,
    path: String,
    snapshot_token: String,
    commit: String,
    file_path: String,
) -> Result<FileDiff, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "read_saved_version_file_diff", None)?;
    let repository_id = repository.worktree_root.match_key().to_string();
    validate_repo_relative_path(&file_path)?;
    let (base, change) = saved_version_change_cached(
        cache,
        &path,
        &repository_id,
        &snapshot_token,
        &commit,
        &file_path,
    )?;
    read_file_diff_for_change(&path, &base, &commit, change)
}

/// Both sides of one document in a saved version: what it holds there, and
/// what the version it is compared with held, under its earlier name if it was
/// renamed. An absent side is a document added or deleted by this version.
pub(crate) fn read_saved_version_file_markdown_cached(
    cache: &HistoryReadCache,
    path: String,
    snapshot_token: String,
    commit: String,
    file_path: String,
) -> Result<MarkdownPreview, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "read_saved_version_file_markdown", None)?;
    let repository_id = repository.worktree_root.match_key().to_string();
    validate_markdown_path(&file_path)?;
    let (base, change) = saved_version_change_cached(
        cache,
        &path,
        &repository_id,
        &snapshot_token,
        &commit,
        &file_path,
    )?;
    let original = change.original_path.as_deref().unwrap_or(&change.path);
    validate_repo_relative_path(original)?;
    let content = match read_saved_markdown(&path, &commit, &change.path)? {
        SavedMarkdown::Absent => None,
        SavedMarkdown::TooLarge => return Ok(MarkdownPreview::too_large()),
        SavedMarkdown::Text(text) => Some(text),
    };
    let before_content = match read_saved_markdown(&path, &base, original)? {
        SavedMarkdown::Absent => None,
        SavedMarkdown::TooLarge => return Ok(MarkdownPreview::too_large()),
        SavedMarkdown::Text(text) => Some(text),
    };
    Ok(MarkdownPreview::Ready {
        content,
        before_content,
    })
}

/// The version a file is compared with, and its change, from the cached detail
/// while its snapshot is current.
fn saved_version_change_cached(
    cache: &HistoryReadCache,
    path: &str,
    repository_id: &str,
    snapshot_token: &str,
    commit: &str,
    file_path: &str,
) -> Result<(String, HistoryFileChange), AppError> {
    if is_valid_oid(commit) {
        if let Some(cached) = cache.read(repository_id, snapshot_token, commit) {
            if cached_snapshot_is_current(path, &cached.snapshot)? {
                let detail = detail_from_cached_read(path, cached)?;
                cache.record_detail(repository_id, snapshot_token, commit, &detail);
                let change = detail
                    .files
                    .iter()
                    .find(|change| change.path == file_path)
                    .cloned()
                    .ok_or_else(path_not_changed_error)?;
                return Ok((detail.comparison_base, change));
            }
        }
    }
    saved_version_change(path, repository_id, snapshot_token, commit, file_path)
}

fn saved_version_change(
    path: &str,
    repository_id: &str,
    snapshot_token: &str,
    commit: &str,
    file_path: &str,
) -> Result<(String, HistoryFileChange), AppError> {
    validate_snapshot_and_commit(path, repository_id, snapshot_token, commit)?;
    validate_repo_relative_path(file_path)?;
    let row = graph_row_for_commit(path, commit)?;
    let base = row
        .parents
        .first()
        .map(String::as_str)
        .unwrap_or(EMPTY_TREE_HASH);
    let (changes, _, _, _) = read_detail_files(path, base, commit)?;
    let change = changes
        .into_iter()
        .find(|change| change.path == file_path)
        .ok_or_else(path_not_changed_error)?;
    Ok((base.to_string(), change))
}

fn path_not_changed_error() -> AppError {
    AppError::new(
        AppErrorCode::PathNotChanged,
        "This file isn't part of that saved version.",
    )
    .with_remediation("Refresh History and choose a file that is still listed.")
}

fn read_file_diff_for_change(
    path: &str,
    base: &str,
    commit: &str,
    change: HistoryFileChange,
) -> Result<FileDiff, AppError> {
    let original = change.original_path.as_deref().unwrap_or(&change.path);
    let output = run_git_capped(
        path,
        &[
            "diff",
            "--no-color",
            "--no-ext-diff",
            "-M",
            base,
            commit,
            "--",
            original,
            &change.path,
        ],
        MAX_DIFF_OUTPUT_BYTES,
    )?;
    if !output.status.success() && !output.limit_exceeded {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't read this saved file's difference.",
        ));
    }
    let entry = RawStatusEntry {
        path: change.path,
        original_path: change.original_path,
        category: change.category,
        is_untracked: false,
        is_prepared: false,
        has_unprepared_changes: false,
    };
    Ok(diff_result_from_text(
        &entry,
        &String::from_utf8_lossy(&output.stdout),
        output.limit_exceeded,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_scope_wire_names_match_the_branch_contract() {
        assert_eq!(
            serde_json::to_value(HistoryWarningCode::BranchesTruncated).unwrap(),
            serde_json::json!("branchesTruncated")
        );
        for (scope, wire) in [
            (
                HistoryScope::CurrentBranch,
                serde_json::json!({ "kind": "currentBranch" }),
            ),
            (
                HistoryScope::Branch {
                    name: "feature/a".to_string(),
                },
                serde_json::json!({ "kind": "branch", "name": "feature/a" }),
            ),
            (
                HistoryScope::AllBranches,
                serde_json::json!({ "kind": "allBranches" }),
            ),
        ] {
            assert_eq!(serde_json::to_value(&scope).unwrap(), wire);
            assert_eq!(serde_json::from_value::<HistoryScope>(wire).unwrap(), scope);
        }
    }

    #[test]
    fn parses_multiline_unicode_and_control_messages_without_delimiter_rules() {
        let raw = b"tree 0123456789012345678901234567890123456789\nauthor Jos\xc3\xa9 \x1e Test <jose@example.test> 1720000000 +0230\ncommitter Jos\xc3\xa9 \x1e Test <jose@example.test> 1720000060 +0230\n\nT\xc3\xadtulo \xe2\x9c\x93\n\nL\xc3\xadnea uno\nL\xc3\xadnea \x1f dos\n";
        let parsed = parse_commit_object(raw, false);
        assert_eq!(parsed.subject, "Título ✓");
        assert_eq!(parsed.description, "Línea uno\nLínea \u{1f} dos");
        assert_eq!(parsed.author.unwrap().author.name, "José \u{1e} Test");
    }

    #[test]
    fn empty_commit_message_is_explicitly_empty() {
        let parsed = parse_commit_object(
            b"tree 0123456789012345678901234567890123456789\nauthor A <a@b> 1 +0000\ncommitter A <a@b> 1 +0000\n\n",
            false,
        );
        assert_eq!(parsed.subject, "");
        assert_eq!(parsed.description, "");
        assert!(!parsed.malformed);
    }

    #[test]
    fn embedded_nul_is_content_not_a_record_separator() {
        let parsed = parse_commit_object(
            b"tree 0123456789012345678901234567890123456789\nauthor A <a@b> 1 +0000\ncommitter A <a@b> 1 +0000\n\nsubject\nbody\0still body",
            true,
        );
        assert_eq!(parsed.description.as_bytes(), b"body\0still body");
    }

    #[test]
    fn parses_root_normal_and_multiparent_graph_rows() {
        let a = "a".repeat(40);
        let b = "b".repeat(40);
        let c = "c".repeat(40);
        let d = "d".repeat(40);
        let input = format!("{a}\n{b} {a}\n{c} {b} {a} {d}\n");
        let rows = parse_graph_rows(input.as_bytes()).unwrap();
        assert!(rows[0].parents.is_empty());
        assert_eq!(rows[1].parents, vec![a.clone()]);
        assert_eq!(rows[2].parents, vec![b, a, d]);
    }

    #[test]
    fn cursor_round_trip_and_validation_are_snapshot_bound() {
        let cursor = HistoryCursor {
            offset: 50,
            local_only_seen: 3,
            snapshot_token: "abc".into(),
        };
        assert_eq!(decode_cursor(&encode_cursor(&cursor)).unwrap(), cursor);
        assert!(decode_cursor("v2:50:3:abc").is_err());
        assert!(decode_cursor("v1:bad:3:abc").is_err());
    }

    #[test]
    fn name_status_z_keeps_newline_paths_and_renames_unambiguous() {
        let raw = b"M\0folder/line\nname.txt\0R100\0old\tname.txt\0new\nname.txt\0D\0gone.bin\0";
        let (changes, unreadable) = parse_name_status_z(raw);
        assert!(!unreadable);
        assert_eq!(changes.len(), 3);
        assert_eq!(changes[0].path, "folder/line\nname.txt");
        assert_eq!(changes[1].original_path.as_deref(), Some("old\tname.txt"));
        assert_eq!(changes[1].path, "new\nname.txt");
        assert_eq!(changes[2].category, ChangeCategory::Deleted);
    }

    #[test]
    fn truncation_flags_each_text_field_independently() {
        let subject = "s".repeat(MAX_SUMMARY_SUBJECT_CHARS + 10);
        let description = "d".repeat(MAX_SUMMARY_DESCRIPTION_CHARS + 10);
        let raw = format!("tree {}\nauthor A <a@b> 1 +0000\ncommitter A <a@b> 1 +0000\n\n{subject}\n{description}", "0".repeat(40));
        let parsed = parse_commit_object(raw.as_bytes(), false);
        assert!(parsed.subject_truncated);
        assert!(parsed.description_truncated);
        assert_eq!(parsed.subject.chars().count(), MAX_SUMMARY_SUBJECT_CHARS);
        assert_eq!(
            parsed.description.chars().count(),
            MAX_SUMMARY_DESCRIPTION_CHARS
        );
    }
}
