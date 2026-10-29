//! Conflict sessions: what is paused, which files overlap, and what each side
//! holds (ADR 0041).
//!
//! Nothing in this file changes the project. The index (`ls-files -u`) and Git's
//! operation markers are the only truth; conflict markers in the working tree
//! decide nothing. The durable snapshot taken before a session's first change
//! is a recovery owner, [`crate::recovery`], which reads the session from
//! here. The per-file mutations (keep a side, mark resolved, reset) live in
//! [`resolve`], whose write helpers nothing else may call. Opening a file in
//! the user's own application and checking it for markers are here: neither
//! writes, and both reach the file through the exact-path check writes use.

pub(crate) mod merge;
pub(crate) mod resolve;

use crate::application;
use crate::changes::{
    is_binary_diff_output, parse_diff_body, validate_repo_relative_path, FileDiff,
    MAX_DIFF_OUTPUT_BYTES,
};
use crate::desktop;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{run_git, run_git_capped, run_git_with_input_capped};
use crate::recovery::{
    create_conflict_snapshot, last_written, read_conflict_journal, read_conflict_snapshot,
    ConflictJournal, ConflictSnapshotManifest, JournalAction, SnapshotPath, SnapshotStageEntry,
    SnapshotWorking,
};
use crate::repository_access::RepositoryContext;
use crate::status::ChangeCategory;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{self, File};
use std::io::{ErrorKind, Read};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Paths listed in one session; a session past it says its list is partial.
pub(crate) const MAX_CONFLICT_FILES: usize = 5000;
/// Output cap for the unmerged listing: three stages of 5,000 long paths fit
/// many times over, and a runaway listing cannot flood memory.
const MAX_UNMERGED_LISTING_BYTES: usize = 16 * 1024 * 1024;
/// Git's own binary probe: a NUL byte in the first 8,000 bytes.
const BINARY_PROBE_BYTES: usize = 8000;

pub(crate) const MODE_SYMLINK: &str = "120000";
const MODE_REGULAR: &str = "100644";
pub(crate) const MODE_EXECUTABLE: &str = "100755";
pub(crate) const MODE_GITLINK: &str = "160000";

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PausedOperationKind {
    Merge,
    Rebase,
    CherryPick,
    Revert,
    /// `git am` applying a series of emailed patches.
    Am,
    /// Unmerged entries with no operation marker, as `git stash pop` or
    /// `git checkout -m` leave them. `stash-apply` and `apply-patch` will be
    /// told apart from this once Git exposes a marker for them.
    Unmerged,
}

impl PausedOperationKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Merge => "merge",
            Self::Rebase => "rebase",
            Self::CherryPick => "cherry-pick",
            Self::Revert => "revert",
            Self::Am => "am",
            Self::Unmerged => "unmerged",
        }
    }

    /// The exact commands that continue or abort the operation with Git
    /// itself, for the technical details. GitOdile never runs them for an
    /// operation it does not support.
    fn commands(self) -> (Option<&'static str>, Option<&'static str>) {
        match self {
            Self::Merge => (Some("git merge --continue"), Some("git merge --abort")),
            Self::Rebase => (Some("git rebase --continue"), Some("git rebase --abort")),
            Self::CherryPick => (
                Some("git cherry-pick --continue"),
                Some("git cherry-pick --abort"),
            ),
            Self::Revert => (Some("git revert --continue"), Some("git revert --abort")),
            Self::Am => (Some("git am --continue"), Some("git am --abort")),
            Self::Unmerged => (None, None),
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ConflictOrigin {
    /// GitOdile started the operation and recorded the state before it.
    Gitodile,
    /// Started by another tool; the state before it is unknown.
    External,
}

#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum UnsupportedOperationReason {
    /// GitOdile explains this operation but cannot continue or abort it.
    NotAMerge,
    /// An octopus merge: detected and explained, resolution blocked.
    SeveralMergeHeads,
}

#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OperationStep {
    pub(crate) current: u32,
    pub(crate) total: u32,
}

/// One side of the overlap, named by a real branch, remote branch or tag when
/// one points at it, otherwise by its commit alone.
#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SideLabel {
    pub(crate) name: Option<String>,
    pub(crate) commit: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PausedOperation {
    pub(crate) kind: PausedOperationKind,
    pub(crate) supported: bool,
    pub(crate) unsupported_reason: Option<UnsupportedOperationReason>,
    pub(crate) step: Option<OperationStep>,
    /// Stage 2 (see ADR 0041 §2 for what that means per operation).
    pub(crate) current: SideLabel,
    /// Stage 3.
    pub(crate) incoming: SideLabel,
    pub(crate) operation_heads: Vec<String>,
    pub(crate) continue_command: Option<String>,
    pub(crate) abort_command: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConflictStage {
    pub(crate) mode: String,
    pub(crate) object_id: String,
}

#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ConflictShape {
    BothChanged,
    BothAdded,
    DeletedByCurrent,
    DeletedByIncoming,
    DeletedByBoth,
    /// Only the current side has the path: the residue of a rename or of a
    /// file/directory conflict. Git records no link to the other path.
    AddedByCurrent,
    AddedByIncoming,
}

#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ConflictFacet {
    ModeChange,
    SymbolicLink,
    Submodule,
    /// The sides disagree on what the path is (file, link, submodule).
    TypeChange,
    /// The path is a directory on disk while the index holds a file.
    FileDirectory,
    /// Another overlapping path differs from this one only by case, on a
    /// file system that cannot hold both.
    CaseCollision,
}

#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ConflictFileState {
    Unresolved,
    EditedOutside,
    MarkedResolved,
    Stale,
    Unsupported,
}

#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ConflictAction {
    KeepCurrent,
    KeepIncoming,
    Delete,
    OpenInEditor,
    MarkResolved,
    ResetFile,
}

#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum SessionAction {
    FinishMerge,
    AbortMerge,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum WorkingKind {
    Absent,
    File,
    SymbolicLink,
    Directory,
    Other,
}

/// The whole-file choice an action wrote, while the path still holds exactly
/// what it wrote.
#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum KeptSide {
    Current,
    Incoming,
    Deleted,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConflictFile {
    pub(crate) path: String,
    /// False when the path is not valid UTF-8 and `path` is a lossy display
    /// name; GitOdile never writes to a path it cannot name exactly.
    pub(crate) path_is_exact: bool,
    pub(crate) shape: ConflictShape,
    pub(crate) facets: Vec<ConflictFacet>,
    pub(crate) base: Option<ConflictStage>,
    pub(crate) current: Option<ConflictStage>,
    pub(crate) incoming: Option<ConflictStage>,
    pub(crate) working: WorkingKind,
    pub(crate) state: ConflictFileState,
    /// The side the user kept, until the file is edited or reset.
    pub(crate) kept: Option<KeptSide>,
    pub(crate) allowed_actions: Vec<ConflictAction>,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConflictSnapshotSummary {
    pub(crate) session_id: String,
    pub(crate) created_at_ms: u128,
    pub(crate) complete: bool,
    pub(crate) pin_reference: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConflictSession {
    pub(crate) session_id: String,
    pub(crate) state_token: String,
    pub(crate) origin: ConflictOrigin,
    pub(crate) operation: PausedOperation,
    pub(crate) files: Vec<ConflictFile>,
    pub(crate) unresolved_count: usize,
    /// False when the listing hit a bound; `files` then holds what was read.
    pub(crate) listing_complete: bool,
    pub(crate) snapshot: Option<ConflictSnapshotSummary>,
    pub(crate) allowed_actions: Vec<SessionAction>,
}

#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum StageContentKind {
    Text,
    /// No NUL byte but not valid UTF-8; `text` is a lossy rendering.
    NonUtf8Text,
    Binary,
    TooLarge,
    SymbolicLink,
    Submodule,
}

#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum LineEndings {
    None,
    Lf,
    Crlf,
    Mixed,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConflictStageContent {
    pub(crate) stage: u8,
    pub(crate) object_id: String,
    pub(crate) mode: String,
    pub(crate) size: u64,
    pub(crate) kind: StageContentKind,
    pub(crate) text: Option<String>,
    pub(crate) line_endings: Option<LineEndings>,
}

/// One raw `ls-files -u -z` entry.
#[derive(Debug, PartialEq, Eq, Clone)]
pub(crate) struct UnmergedEntry {
    pub(crate) mode: String,
    pub(crate) object_id: String,
    pub(crate) stage: u8,
    pub(crate) path: Vec<u8>,
}

/// The entries of one path, stage by stage. A missing stage is valid.
#[derive(Debug, PartialEq, Eq, Clone, Default)]
pub(crate) struct UnmergedPath {
    pub(crate) path: Vec<u8>,
    pub(crate) base: Option<ConflictStage>,
    pub(crate) current: Option<ConflictStage>,
    pub(crate) incoming: Option<ConflictStage>,
}

#[derive(Debug, PartialEq)]
pub(crate) struct UnmergedListing {
    pub(crate) paths: Vec<UnmergedPath>,
    pub(crate) complete: bool,
}

/// Everything a session read learns before it is shaped for IPC. The
/// snapshot owner captures from exactly this, so what it preserves is what
/// the state token describes.
pub(crate) struct SessionRead {
    pub(crate) session_id: String,
    pub(crate) state_token: String,
    pub(crate) operation: PausedOperation,
    pub(crate) head: Option<String>,
    pub(crate) listing: UnmergedListing,
    /// The session's published snapshot, read once per session read.
    pub(crate) snapshot: Option<ConflictSnapshotManifest>,
    /// What resolution actions recorded since the snapshot.
    pub(crate) journal: Option<ConflictJournal>,
}

pub(crate) fn stale() -> AppError {
    AppError::new(
        AppErrorCode::StaleConflictSession,
        "The overlapping changes changed since GitOdile last read them.",
    )
    .with_remediation("Review the overlapping files again, then retry.")
}

pub(crate) fn unreadable() -> AppError {
    AppError::new(
        AppErrorCode::GitCommandFailed,
        "GitOdile couldn't read the overlapping changes.",
    )
    .with_remediation("Check that the project and its Git metadata are readable, then try again.")
}

/// A name Git spells one way that the disk holds spelled another way: on a
/// file system that ignores case, `Readme.md` would land on `README.md`,
/// which is another path to Git.
pub(crate) fn case_collision() -> AppError {
    AppError::new(
        AppErrorCode::ConflictCaseCollision,
        "This file's name differs only by capital letters from one on disk.",
    )
    .with_remediation(
        "Rename or remove the other file yourself, then read the overlapping changes again.",
    )
}

/// The working path of `relative`, inside the project and spelled on disk
/// exactly as Git spells it, with no folder of it a link. Writing, opening
/// and checking a file all go through it, so none of them reaches a
/// different file than the one Git names.
pub(crate) fn exact_working_path(root: &Path, relative: &str) -> Result<PathBuf, AppError> {
    let invalid = || {
        AppError::new(
            AppErrorCode::PathInvalid,
            "GitOdile won't use this file where Git expects it.",
        )
        .with_remediation("Read the overlapping changes again.")
    };
    let root = root.canonicalize().map_err(|_| invalid())?;
    let mut current = root.clone();
    let components = relative.split('/').collect::<Vec<_>>();
    for (index, component) in components.iter().enumerate() {
        let next = current.join(component);
        match fs::symlink_metadata(&next) {
            Ok(metadata) => {
                let spelled = fs::read_dir(&current)
                    .map_err(|_| invalid())?
                    .filter_map(Result::ok)
                    .any(|entry| entry.file_name().to_str() == Some(*component));
                if !spelled {
                    return Err(case_collision());
                }
                let is_last = index + 1 == components.len();
                if !is_last && metadata.file_type().is_symlink() {
                    // A folder of the path is a link: following it could
                    // land outside the project.
                    return Err(invalid());
                }
            }
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(_) => return Err(invalid()),
        }
        current = next;
    }
    Ok(current)
}

/// Whether the file system holding `probe` ignores case: one look at the
/// nearest of its names that has letters, spelled with their case flipped.
pub(crate) fn ignores_case(probe: &Path) -> bool {
    for candidate in probe.ancestors() {
        let (Some(name), Some(parent)) = (
            candidate.file_name().and_then(|name| name.to_str()),
            candidate.parent(),
        ) else {
            continue;
        };
        let flipped = name
            .chars()
            .flat_map(|letter| {
                if letter.is_lowercase() {
                    letter.to_uppercase().collect::<Vec<_>>()
                } else {
                    letter.to_lowercase().collect()
                }
            })
            .collect::<String>();
        if flipped == name {
            continue;
        }
        return fs::symlink_metadata(candidate).is_ok()
            && fs::symlink_metadata(parent.join(flipped)).is_ok();
    }
    false
}

/// The paths among `paths` that another one equals but for case: a file
/// system that ignores case holds only one of them, so no whole-file choice
/// can write either without landing on the other. Folders spelled two ways
/// are caught when a write or an open checks the exact spelling.
pub(crate) fn case_collisions<'a>(paths: impl IntoIterator<Item = &'a str>) -> HashSet<String> {
    let mut groups: HashMap<String, Vec<&str>> = HashMap::new();
    for path in paths {
        groups.entry(path.to_lowercase()).or_default().push(path);
    }
    groups
        .into_values()
        .filter(|group| group.len() > 1)
        .flatten()
        .map(ToString::to_string)
        .collect()
}

/// Bytes read from a working file to look for conflict markers; a larger
/// file is not scanned, and marking it resolved does not stop on markers.
const MAX_MARKER_SCAN_BYTES: u64 = 32 * 1024 * 1024;
/// Git's default `conflict-marker-size`.
const MARKER_SIZE: usize = 7;

/// Why a working file could not be scanned for conflict markers.
#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum MarkerScanLimit {
    Binary,
    Utf16,
    TooLarge,
    Unreadable,
}

/// What a scan of a working file for conflict markers found.
#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub(crate) enum MarkerScan {
    /// Complete `<<<<<<<` … `=======` … `>>>>>>>` blocks.
    Found {
        blocks: usize,
    },
    None,
    /// Nothing can be said, and why.
    Unknown {
        limit: MarkerScanLimit,
    },
}

fn marker_line(line: &[u8], marker: u8) -> bool {
    line.len() >= MARKER_SIZE
        && line[..MARKER_SIZE].iter().all(|byte| *byte == marker)
        && line
            .get(MARKER_SIZE)
            .is_none_or(|next| matches!(next, b' ' | b'\t' | b'\r'))
}

/// Counts whole conflict blocks. A lone `=======` (a Markdown underline) or
/// a stray opening line is not a block. UTF-16 is told apart from binary by
/// its byte-order mark, since its text holds NUL bytes too.
pub(crate) fn scan_conflict_markers(content: &[u8]) -> MarkerScan {
    if content.starts_with(&[0xff, 0xfe]) || content.starts_with(&[0xfe, 0xff]) {
        return MarkerScan::Unknown {
            limit: MarkerScanLimit::Utf16,
        };
    }
    if content[..content.len().min(BINARY_PROBE_BYTES)].contains(&0) {
        return MarkerScan::Unknown {
            limit: MarkerScanLimit::Binary,
        };
    }
    let mut blocks = 0;
    // 0: outside, 1: after <<<<<<<, 2: after =======
    let mut state = 0;
    for line in content.split(|byte| *byte == b'\n') {
        match state {
            0 if marker_line(line, b'<') => state = 1,
            1 if marker_line(line, b'<') => state = 1,
            1 if marker_line(line, b'=') => state = 2,
            2 if marker_line(line, b'>') => {
                blocks += 1;
                state = 0;
            }
            _ => {}
        }
    }
    if blocks == 0 {
        MarkerScan::None
    } else {
        MarkerScan::Found { blocks }
    }
}

pub(crate) fn scan_working_markers(target: &Path) -> MarkerScan {
    let unreadable = MarkerScan::Unknown {
        limit: MarkerScanLimit::Unreadable,
    };
    let Ok(file) = File::open(target) else {
        return unreadable;
    };
    match file.metadata() {
        Ok(metadata) if metadata.len() > MAX_MARKER_SCAN_BYTES => {
            return MarkerScan::Unknown {
                limit: MarkerScanLimit::TooLarge,
            }
        }
        Ok(_) => {}
        Err(_) => return unreadable,
    }
    let mut content = Vec::new();
    if file
        .take(MAX_MARKER_SCAN_BYTES)
        .read_to_end(&mut content)
        .is_err()
    {
        return unreadable;
    }
    scan_conflict_markers(&content)
}

/// One overlapping file of the session as it is on disk now: a regular file
/// at its exact path, which `action` (when given) is allowed on.
struct SessionWorkingFile {
    origin: ConflictOrigin,
    state_token: String,
    target: PathBuf,
    metadata: fs::Metadata,
}

fn session_working_file(
    path: &str,
    repository: &RepositoryContext,
    file_path: &str,
    action: Option<ConflictAction>,
) -> Result<SessionWorkingFile, AppError> {
    validate_repo_relative_path(file_path)?;
    let read = read_session(path, repository)?.ok_or_else(stale)?;
    let session = describe_session(repository, read);
    let file = session
        .files
        .iter()
        .find(|file| file.path == file_path && file.path_is_exact)
        .ok_or_else(stale)?;
    if action.is_some_and(|action| !file.allowed_actions.contains(&action)) {
        return Err(AppError::new(
            AppErrorCode::ConflictActionUnavailable,
            "This file doesn't allow that right now.",
        )
        .with_remediation("Read the overlapping changes again to see what this file allows."));
    }
    let target = exact_working_path(repository.worktree_root.backend_path(), file_path)?;
    let metadata = fs::symlink_metadata(&target)
        .ok()
        .filter(fs::Metadata::is_file)
        .ok_or_else(|| {
            AppError::new(
                AppErrorCode::ConflictActionUnavailable,
                "This path isn't a file on disk right now.",
            )
            .with_remediation("Read the overlapping changes again.")
        })?;
    Ok(SessionWorkingFile {
        origin: session.origin,
        state_token: session.state_token,
        target,
        metadata,
    })
}

/// Opens one overlapping file in the application the system uses for its
/// type, never `GIT_EDITOR` or `core.editor`. Opening never changes the
/// file's state: what the user does there is read back from the working
/// tree once the watcher reports it.
///
/// A type the system would run rather than open is refused before anything
/// is written. Otherwise the session's snapshot is taken first when it has
/// none, as before any change: the user's editor is where the next change
/// comes from, and without a snapshot an edit made there would become the
/// "original" that Reset returns to, and could not be told apart from it.
pub(crate) fn open_conflict_file(
    path: String,
    file_path: String,
    state_token: String,
) -> Result<(), AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "open_conflict_file", None)?;
    let working = session_working_file(
        &path,
        &repository,
        &file_path,
        Some(ConflictAction::OpenInEditor),
    )?;
    if working.state_token != state_token {
        return Err(stale());
    }
    desktop::ensure_opens_as_document(
        &working.target,
        desktop::has_executable_bit(&working.metadata),
    )?;
    create_conflict_snapshot(&path, &repository, &state_token, working.origin)?;
    desktop::open_in_default_application(&working.target)
}

/// What a check of one overlapping file found, as of the session read it
/// was made against.
#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkingFileCheck {
    pub(crate) state_token: String,
    pub(crate) markers: MarkerScan,
}

/// Whether an overlapping file still holds conflict markers, read with the
/// same bound as Mark resolved. Read-only; the screen asks it after a session
/// read shows the file edited, never because the file became visible.
pub(crate) fn check_conflict_working_file(
    path: String,
    file_path: String,
) -> Result<WorkingFileCheck, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "check_conflict_working_file", None)?;
    let working = session_working_file(&path, &repository, &file_path, None)?;
    Ok(WorkingFileCheck {
        markers: scan_working_markers(&working.target),
        state_token: working.state_token,
    })
}

/// Parses `git ls-files -u -z`: `<mode> SP <object> SP <stage> TAB <path> NUL`.
/// Paths stay raw bytes; nothing here assumes they are UTF-8.
pub(crate) fn parse_unmerged_entries(output: &[u8]) -> Result<Vec<UnmergedEntry>, AppError> {
    let mut entries = Vec::new();
    for record in output.split(|byte| *byte == 0) {
        if record.is_empty() {
            continue;
        }
        let tab = record
            .iter()
            .position(|byte| *byte == b'\t')
            .ok_or_else(unreadable)?;
        let (meta, path) = (&record[..tab], &record[tab + 1..]);
        let meta = std::str::from_utf8(meta).map_err(|_| unreadable())?;
        let mut fields = meta.split(' ');
        let (Some(mode), Some(object_id), Some(stage), None) =
            (fields.next(), fields.next(), fields.next(), fields.next())
        else {
            return Err(unreadable());
        };
        let stage = match stage {
            "1" => 1,
            "2" => 2,
            "3" => 3,
            _ => return Err(unreadable()),
        };
        let valid_mode = mode.len() == 6 && mode.bytes().all(|byte| (b'0'..=b'7').contains(&byte));
        if !valid_mode || !is_object_id(object_id) || path.is_empty() {
            return Err(unreadable());
        }
        entries.push(UnmergedEntry {
            mode: mode.to_string(),
            object_id: object_id.to_string(),
            stage,
            path: path.to_vec(),
        });
    }
    Ok(entries)
}

/// Groups entries by path in Git's order (it lists a path's stages together).
/// Stops after `limit` paths; a truncated listing is reported as incomplete.
pub(crate) fn group_unmerged_paths(entries: Vec<UnmergedEntry>, limit: usize) -> UnmergedListing {
    let mut paths: Vec<UnmergedPath> = Vec::new();
    let mut complete = true;
    for entry in entries {
        if paths.last().is_none_or(|last| last.path != entry.path) {
            if paths.len() == limit {
                complete = false;
                break;
            }
            paths.push(UnmergedPath {
                path: entry.path.clone(),
                ..UnmergedPath::default()
            });
        }
        let current = paths.last_mut().expect("a path was just pushed");
        let stage = Some(ConflictStage {
            mode: entry.mode,
            object_id: entry.object_id,
        });
        match entry.stage {
            1 => current.base = stage,
            2 => current.current = stage,
            _ => current.incoming = stage,
        }
    }
    UnmergedListing { paths, complete }
}

pub(crate) fn is_object_id(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub(crate) fn classify_shape(path: &UnmergedPath) -> ConflictShape {
    match (
        path.base.is_some(),
        path.current.is_some(),
        path.incoming.is_some(),
    ) {
        (true, true, true) => ConflictShape::BothChanged,
        (false, true, true) => ConflictShape::BothAdded,
        (true, false, true) => ConflictShape::DeletedByCurrent,
        (true, true, false) => ConflictShape::DeletedByIncoming,
        (true, false, false) => ConflictShape::DeletedByBoth,
        (false, true, false) => ConflictShape::AddedByCurrent,
        // Git never writes a path with no stage at all; treat the remaining
        // shape as the incoming-only residue it would be closest to.
        (false, false, _) => ConflictShape::AddedByIncoming,
    }
}

fn object_type(mode: &str) -> &'static str {
    match mode {
        MODE_SYMLINK => "link",
        MODE_GITLINK => "submodule",
        _ => "file",
    }
}

pub(crate) fn classify_facets(path: &UnmergedPath, working: WorkingKind) -> Vec<ConflictFacet> {
    let stages = [&path.base, &path.current, &path.incoming]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let mut facets = Vec::new();
    let sides = [&path.current, &path.incoming]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let mut types = stages.iter().map(|stage| object_type(&stage.mode));
    let first_type = types.next();
    if types.any(|kind| Some(kind) != first_type) {
        facets.push(ConflictFacet::TypeChange);
    }
    let file_modes = stages
        .iter()
        .filter(|stage| object_type(&stage.mode) == "file")
        .map(|stage| stage.mode.as_str())
        .collect::<Vec<_>>();
    if file_modes.windows(2).any(|pair| pair[0] != pair[1]) {
        facets.push(ConflictFacet::ModeChange);
    }
    if sides.iter().any(|stage| stage.mode == MODE_SYMLINK) {
        facets.push(ConflictFacet::SymbolicLink);
    }
    if sides.iter().any(|stage| stage.mode == MODE_GITLINK) {
        facets.push(ConflictFacet::Submodule);
    }
    let holds_submodule = facets.contains(&ConflictFacet::Submodule);
    if working == WorkingKind::Directory && !holds_submodule {
        facets.push(ConflictFacet::FileDirectory);
    }
    facets
}

/// The whole-file choices each shape allows (epic 037 §3). Choosing a side
/// that deleted the path is `Delete`, never a "keep" of nothing.
///
/// A folder in the way of a file gets no choice at all: every one of them
/// would have to replace the folder. Neither does a path that another one
/// equals but for case where the disk can hold only one of them: a choice
/// would write over the other. Reset stays, since it restores evidence the
/// snapshot already holds. A link, a submodule or a change of kind
/// has no text to edit, so it is marked resolved only once a side was kept.
pub(crate) fn allowed_file_actions(
    path: &UnmergedPath,
    facets: &[ConflictFacet],
    working: WorkingKind,
    state: ConflictFileState,
    in_snapshot: bool,
    kept: Option<KeptSide>,
) -> Vec<ConflictAction> {
    if state == ConflictFileState::Unsupported {
        return Vec::new();
    }
    let mut actions = Vec::new();
    let blocked = facets.contains(&ConflictFacet::FileDirectory)
        || facets.contains(&ConflictFacet::CaseCollision);
    if state != ConflictFileState::MarkedResolved && !blocked {
        if path.current.is_some() {
            actions.push(ConflictAction::KeepCurrent);
        }
        if path.incoming.is_some() {
            actions.push(ConflictAction::KeepIncoming);
        }
        if path.current.is_none() || path.incoming.is_none() {
            actions.push(ConflictAction::Delete);
        }
        let not_text = [
            ConflictFacet::Submodule,
            ConflictFacet::SymbolicLink,
            ConflictFacet::TypeChange,
        ]
        .iter()
        .any(|facet| facets.contains(facet));
        if working == WorkingKind::File && !not_text {
            actions.push(ConflictAction::OpenInEditor);
        }
        if !not_text || kept.is_some() {
            actions.push(ConflictAction::MarkResolved);
        }
    }
    let changed_since_snapshot = matches!(
        state,
        ConflictFileState::EditedOutside
            | ConflictFileState::MarkedResolved
            | ConflictFileState::Stale
    );
    if in_snapshot && changed_since_snapshot {
        actions.push(ConflictAction::ResetFile);
    }
    actions
}

/// Working-tree facts about one path, cheap enough to take for every
/// unmerged path on every read: no content is hashed here.
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub(crate) struct WorkingFingerprint {
    pub(crate) kind: WorkingKind,
    pub(crate) size: u64,
    pub(crate) modified_ns: u128,
}

pub(crate) fn working_fingerprint(root: &Path, relative: &str) -> WorkingFingerprint {
    match fs::symlink_metadata(root.join(relative)) {
        Ok(metadata) => WorkingFingerprint {
            kind: if metadata.file_type().is_symlink() {
                WorkingKind::SymbolicLink
            } else if metadata.is_file() {
                WorkingKind::File
            } else if metadata.is_dir() {
                WorkingKind::Directory
            } else {
                WorkingKind::Other
            },
            size: metadata.len(),
            modified_ns: metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |elapsed| elapsed.as_nanos()),
        },
        Err(_) => WorkingFingerprint {
            kind: WorkingKind::Absent,
            size: 0,
            modified_ns: 0,
        },
    }
}

fn read_marker(git_dir: &Path, name: &str) -> Option<String> {
    fs::read(git_dir.join(name))
        .ok()
        .map(|bytes| String::from_utf8_lossy(&bytes).trim().to_string())
}

fn marker_number(directory: &Path, name: &str) -> Option<u32> {
    read_marker(directory, name)?.parse().ok()
}

fn object_lines(value: Option<String>) -> Vec<String> {
    value
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| is_object_id(line))
        .map(ToString::to_string)
        .collect()
}

fn short_ref_name(reference: &str) -> &str {
    ["refs/heads/", "refs/remotes/", "refs/tags/"]
        .into_iter()
        .find_map(|prefix| reference.strip_prefix(prefix))
        .unwrap_or(reference)
}

/// The branch, remote branch or tag pointing at `commit`. `hint` (from an
/// editable file such as `MERGE_MSG`) only chooses between real candidates.
fn ref_label(path: &str, commit: &str, hint: Option<&str>) -> Result<Option<String>, AppError> {
    let output = run_git(
        path,
        &[
            "for-each-ref",
            "--format=%(refname)",
            &format!("--points-at={commit}"),
            "refs/heads",
            "refs/remotes",
            "refs/tags",
        ],
    )?;
    if !output.status.success() {
        return Ok(None);
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let candidates = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.ends_with("/HEAD"))
        .collect::<Vec<_>>();
    if let Some(hint) = hint {
        if let Some(found) = candidates
            .iter()
            .find(|candidate| short_ref_name(candidate) == hint)
        {
            return Ok(Some(short_ref_name(found).to_string()));
        }
    }
    Ok(["refs/heads/", "refs/remotes/", "refs/tags/"]
        .into_iter()
        .find_map(|prefix| {
            candidates
                .iter()
                .find(|candidate| candidate.starts_with(prefix))
        })
        .map(|found| short_ref_name(found).to_string()))
}

/// The name a merge message gives its incoming side, e.g.
/// `Merge branch 'feature' into main` or `Merge remote-tracking branch 'origin/x'`.
pub(crate) fn merge_message_hint(message: &str) -> Option<String> {
    let first = message.lines().next()?;
    let rest = [
        "Merge branch '",
        "Merge remote-tracking branch '",
        "Merge tag '",
    ]
    .into_iter()
    .find_map(|prefix| first.strip_prefix(prefix))?;
    let end = rest.find('\'')?;
    Some(rest[..end].to_string())
}

/// `HEAD`'s commit and its branch, in one process. `None` commit on an unborn
/// branch; `None` branch when detached. (`--verify` would refuse the second
/// argument, so an unborn branch is the failure case instead.)
fn read_head(path: &str, git_dir: &Path) -> Result<(Option<String>, Option<String>), AppError> {
    let output = run_git(path, &["rev-parse", "HEAD", "--symbolic-full-name", "HEAD"])?;
    if output.status.success() {
        let text = String::from_utf8_lossy(&output.stdout);
        let mut lines = text.lines().map(str::trim);
        let commit = lines
            .next()
            .filter(|line| is_object_id(line))
            .map(ToString::to_string);
        let branch = lines
            .next()
            .and_then(|reference| reference.strip_prefix("refs/heads/"))
            .map(ToString::to_string);
        return Ok((commit, branch));
    }
    let branch = read_marker(git_dir, "HEAD").and_then(|head| {
        head.strip_prefix("ref: refs/heads/")
            .map(ToString::to_string)
    });
    Ok((None, branch))
}

/// The operation Git's own markers say is paused in this worktree. Every
/// GitOdile mutation that refuses to run during one asks this, so the
/// resolver and the refusal can never disagree about what is paused.
///
/// The rebase folders come first: a rebase that replays a merge
/// (`--rebase-merges`) pauses with `MERGE_HEAD` too, and finishing that as a
/// merge would leave the rebase half done.
pub(crate) fn paused_operation_marker(git_dir: &Path) -> Option<PausedOperationKind> {
    if git_dir.join("rebase-merge").is_dir() {
        Some(PausedOperationKind::Rebase)
    } else if git_dir.join("rebase-apply").is_dir() {
        // `git am` shares the folder with `git rebase --apply`.
        if git_dir.join("rebase-apply").join("applying").exists() {
            Some(PausedOperationKind::Am)
        } else {
            Some(PausedOperationKind::Rebase)
        }
    } else if git_dir.join("MERGE_HEAD").is_file() {
        Some(PausedOperationKind::Merge)
    } else if git_dir.join("CHERRY_PICK_HEAD").is_file() {
        Some(PausedOperationKind::CherryPick)
    } else if git_dir.join("REVERT_HEAD").is_file() {
        Some(PausedOperationKind::Revert)
    } else {
        None
    }
}

struct OperationEvidence {
    operation: PausedOperation,
    /// The marker contents the state token binds.
    marker_bytes: Vec<u8>,
}

fn read_operation(
    path: &str,
    git_dir: &Path,
    kind: PausedOperationKind,
    head: Option<&str>,
    branch: Option<&str>,
) -> Result<OperationEvidence, AppError> {
    let (continue_command, abort_command) = kind.commands();
    let mut marker_bytes = kind.as_str().as_bytes().to_vec();
    let mut current = SideLabel {
        name: branch.map(ToString::to_string),
        commit: head.map(ToString::to_string),
    };
    let mut incoming = SideLabel::default();
    let mut step = None;
    let operation_heads;
    match kind {
        PausedOperationKind::Merge => {
            operation_heads = object_lines(read_marker(git_dir, "MERGE_HEAD"));
            if let [only] = operation_heads.as_slice() {
                let hint = read_marker(git_dir, "MERGE_MSG")
                    .as_deref()
                    .and_then(merge_message_hint);
                incoming = SideLabel {
                    name: ref_label(path, only, hint.as_deref())?,
                    commit: Some(only.clone()),
                };
            }
        }
        PausedOperationKind::Rebase => {
            let directory = if git_dir.join("rebase-merge").is_dir() {
                git_dir.join("rebase-merge")
            } else {
                git_dir.join("rebase-apply")
            };
            let (current_step, total) = if directory.ends_with("rebase-merge") {
                (
                    marker_number(&directory, "msgnum"),
                    marker_number(&directory, "end"),
                )
            } else {
                (
                    marker_number(&directory, "next"),
                    marker_number(&directory, "last"),
                )
            };
            step = current_step
                .zip(total)
                .map(|(current, total)| OperationStep { current, total });
            let onto = read_marker(&directory, "onto").filter(|value| is_object_id(value));
            let replayed = read_marker(git_dir, "REBASE_HEAD").filter(|value| is_object_id(value));
            let head_name = read_marker(&directory, "head-name");
            if let Some(onto) = &onto {
                current.name = ref_label(path, onto, None)?;
            }
            incoming = SideLabel {
                name: head_name
                    .as_deref()
                    .and_then(|name| name.strip_prefix("refs/heads/"))
                    .map(ToString::to_string),
                commit: replayed.clone(),
            };
            for name in ["msgnum", "end", "next", "last", "head-name", "onto"] {
                if let Some(value) = read_marker(&directory, name) {
                    marker_bytes.extend_from_slice(name.as_bytes());
                    marker_bytes.extend_from_slice(value.as_bytes());
                }
            }
            operation_heads = onto.into_iter().chain(replayed).collect();
        }
        PausedOperationKind::CherryPick | PausedOperationKind::Revert => {
            let marker = if kind == PausedOperationKind::CherryPick {
                "CHERRY_PICK_HEAD"
            } else {
                "REVERT_HEAD"
            };
            operation_heads = object_lines(read_marker(git_dir, marker));
            incoming.commit = operation_heads.first().cloned();
        }
        PausedOperationKind::Am => {
            let directory = git_dir.join("rebase-apply");
            step = marker_number(&directory, "next")
                .zip(marker_number(&directory, "last"))
                .map(|(current, total)| OperationStep { current, total });
            for name in ["next", "last"] {
                if let Some(value) = read_marker(&directory, name) {
                    marker_bytes.extend_from_slice(name.as_bytes());
                    marker_bytes.extend_from_slice(value.as_bytes());
                }
            }
            operation_heads = Vec::new();
        }
        PausedOperationKind::Unmerged => operation_heads = Vec::new(),
    }
    for head in &operation_heads {
        marker_bytes.extend_from_slice(head.as_bytes());
    }
    let unsupported_reason = match kind {
        PausedOperationKind::Merge if operation_heads.len() == 1 => None,
        PausedOperationKind::Merge => Some(UnsupportedOperationReason::SeveralMergeHeads),
        _ => Some(UnsupportedOperationReason::NotAMerge),
    };
    Ok(OperationEvidence {
        operation: PausedOperation {
            kind,
            supported: unsupported_reason.is_none(),
            unsupported_reason,
            step,
            current,
            incoming,
            operation_heads,
            continue_command: continue_command.map(ToString::to_string),
            abort_command: abort_command.map(ToString::to_string),
        },
        marker_bytes,
    })
}

fn read_unmerged_listing(path: &str) -> Result<(Vec<u8>, UnmergedListing), AppError> {
    let output = run_git_capped(path, &["ls-files", "-u", "-z"], MAX_UNMERGED_LISTING_BYTES)?;
    if !output.status.success() {
        return Err(unreadable());
    }
    // A truncated listing ends mid-record; parse only the whole records.
    let whole = if output.limit_exceeded {
        let end = output
            .stdout
            .iter()
            .rposition(|byte| *byte == 0)
            .map_or(0, |index| index + 1);
        &output.stdout[..end]
    } else {
        &output.stdout[..]
    };
    let mut listing = group_unmerged_paths(parse_unmerged_entries(whole)?, MAX_CONFLICT_FILES);
    if output.limit_exceeded {
        // The last path may be missing some of its stages.
        listing.paths.pop();
        listing.complete = false;
    }
    Ok((output.stdout, listing))
}

fn session_id(
    repository: &RepositoryContext,
    kind: PausedOperationKind,
    head: Option<&str>,
    operation_heads: &[String],
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(repository.git_dir.match_key().as_bytes());
    hasher.update([0]);
    hasher.update(kind.as_str().as_bytes());
    hasher.update([0]);
    hasher.update(head.unwrap_or("unborn").as_bytes());
    for head in operation_heads {
        hasher.update([0]);
        hasher.update(head.as_bytes());
    }
    let digest = hasher.finalize();
    format!("{}-{}", kind.as_str(), hex(&digest[..12]))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn display_path(path: &[u8]) -> (String, bool) {
    match std::str::from_utf8(path) {
        Ok(text) => (text.to_string(), true),
        Err(_) => (String::from_utf8_lossy(path).into_owned(), false),
    }
}

/// Reads what is paused, without writing anything. `None` when nothing is
/// paused and nothing is unmerged.
pub(crate) fn read_session(
    path: &str,
    repository: &RepositoryContext,
) -> Result<Option<SessionRead>, AppError> {
    let git_dir = repository.git_dir.backend_path();
    let marked = paused_operation_marker(git_dir);
    let (raw_listing, listing) = read_unmerged_listing(path)?;
    let Some(kind) =
        marked.or_else(|| (!listing.paths.is_empty()).then_some(PausedOperationKind::Unmerged))
    else {
        return Ok(None);
    };
    let (head, branch) = read_head(path, git_dir)?;
    let evidence = read_operation(path, git_dir, kind, head.as_deref(), branch.as_deref())?;
    let root = repository.worktree_root.backend_path();

    let mut hasher = Sha256::new();
    for part in [
        repository.common_git_dir.match_key().as_bytes(),
        repository.git_dir.match_key().as_bytes(),
        head.as_deref().unwrap_or("unborn").as_bytes(),
        &evidence.marker_bytes,
        &raw_listing,
    ] {
        hasher.update((part.len() as u64).to_le_bytes());
        hasher.update(part);
    }
    let session_id = session_id(
        repository,
        kind,
        head.as_deref(),
        &evidence.operation.operation_heads,
    );
    let snapshot = read_conflict_snapshot(git_dir, &session_id);
    let journal = read_conflict_journal(git_dir, &session_id);
    // Paths the snapshot holds that are no longer unmerged were resolved
    // since; their working state is part of what a reset would replace.
    let listed = listing
        .paths
        .iter()
        .filter_map(|unmerged| std::str::from_utf8(&unmerged.path).ok())
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    let listed_set = listed.iter().map(String::as_str).collect::<HashSet<_>>();
    let resolved = snapshot
        .iter()
        .flat_map(|manifest| manifest.paths.iter())
        .map(|item| item.path.clone())
        .filter(|path| !listed_set.contains(path.as_str()))
        .collect::<Vec<_>>();
    for relative in listed.iter().chain(&resolved) {
        let fingerprint = working_fingerprint(root, relative);
        hasher.update((relative.len() as u64).to_le_bytes());
        hasher.update(relative.as_bytes());
        hasher.update([fingerprint.kind as u8]);
        hasher.update(fingerprint.size.to_le_bytes());
        hasher.update(fingerprint.modified_ns.to_le_bytes());
    }
    let state_token = hex(&hasher.finalize()[..16]);

    Ok(Some(SessionRead {
        session_id,
        state_token,
        operation: evidence.operation,
        head,
        listing,
        snapshot,
        journal,
    }))
}

/// The snapshot indexed by path: what each path held and its stages, so a
/// session of thousands of paths is shaped in one pass.
struct SnapshotIndex<'a> {
    paths: HashMap<&'a str, &'a SnapshotPath>,
    stages: BTreeMap<&'a str, UnmergedPath>,
}

fn index_snapshot(manifest: &ConflictSnapshotManifest) -> SnapshotIndex<'_> {
    let mut stages = BTreeMap::new();
    for entry in &manifest.entries {
        let stages: &mut UnmergedPath =
            stages
                .entry(entry.path.as_str())
                .or_insert_with(|| UnmergedPath {
                    path: entry.path.as_bytes().to_vec(),
                    ..UnmergedPath::default()
                });
        let stage = Some(ConflictStage {
            mode: entry.mode.clone(),
            object_id: entry.object_id.clone(),
        });
        match entry.stage {
            1 => stages.base = stage,
            2 => stages.current = stage,
            _ => stages.incoming = stage,
        }
    }
    SnapshotIndex {
        paths: manifest
            .paths
            .iter()
            .map(|item| (item.path.as_str(), item))
            .collect(),
        stages,
    }
}

fn snapshot_state(
    snapshot: Option<&SnapshotIndex>,
    relative: &str,
    unmerged: &UnmergedPath,
    fingerprint: WorkingFingerprint,
) -> ConflictFileState {
    let Some(index) = snapshot else {
        return ConflictFileState::Unresolved;
    };
    let Some(captured) = index.paths.get(relative) else {
        return ConflictFileState::Unresolved;
    };
    let same_stages = index.stages.get(relative).is_some_and(|stages| {
        (&stages.base, &stages.current, &stages.incoming)
            == (&unmerged.base, &unmerged.current, &unmerged.incoming)
    });
    if !same_stages {
        return ConflictFileState::Stale;
    }
    let untouched = captured.size == fingerprint.size
        && captured.modified_ns == fingerprint.modified_ns
        && working_matches(&captured.working, fingerprint.kind);
    if untouched {
        ConflictFileState::Unresolved
    } else {
        ConflictFileState::EditedOutside
    }
}

/// The side an action kept at `relative`, while the path still holds exactly
/// what that action left there (the same facts the state token covers).
pub(crate) fn kept_side(
    journal: Option<&ConflictJournal>,
    relative: &str,
    fingerprint: WorkingFingerprint,
) -> Option<KeptSide> {
    let entry = last_written(journal?, relative)?;
    let side = match entry.action {
        JournalAction::KeepCurrent => KeptSide::Current,
        JournalAction::KeepIncoming => KeptSide::Incoming,
        JournalAction::Delete => KeptSide::Deleted,
        JournalAction::MarkResolved | JournalAction::Reset | JournalAction::Abandon => return None,
    };
    let left = entry.left.as_ref()?;
    (left.kind == fingerprint.kind
        && left.size == fingerprint.size
        && left.modified_ns == fingerprint.modified_ns)
        .then_some(side)
}

fn working_matches(working: &SnapshotWorking, kind: WorkingKind) -> bool {
    match working {
        SnapshotWorking::Absent => kind == WorkingKind::Absent,
        SnapshotWorking::File { .. } => kind == WorkingKind::File,
        SnapshotWorking::SymbolicLink { .. } => kind == WorkingKind::SymbolicLink,
        SnapshotWorking::Directory => kind == WorkingKind::Directory,
        // Nothing to compare against, so the path cannot count as untouched.
        SnapshotWorking::Unreadable | SnapshotWorking::Omitted => false,
    }
}

/// Shapes a session read for IPC, folding in the snapshot so files resolved
/// or edited since it keep their place in the list.
pub(crate) fn describe_session(
    repository: &RepositoryContext,
    read: SessionRead,
) -> ConflictSession {
    let root = repository.worktree_root.backend_path();
    let snapshot = read.snapshot;
    let journal = read.journal;
    let index = snapshot.as_ref().map(index_snapshot);
    let supported = read.operation.supported;
    // Only a file system that ignores case can be asked to hold two of
    // these paths in one place, so only there do they collide. The disk is
    // asked only when two names fold together at all.
    let listed = read
        .listing
        .paths
        .iter()
        .filter_map(|unmerged| std::str::from_utf8(&unmerged.path).ok());
    let resolved = index.iter().flat_map(|index| index.stages.keys().copied());
    let mut collisions = case_collisions(listed.chain(resolved).collect::<HashSet<_>>());
    if !collisions.is_empty() && !ignores_case(repository.git_dir.backend_path()) {
        collisions.clear();
    }
    let facets_of = |stages: &UnmergedPath, relative: &str, kind: WorkingKind| {
        let mut facets = classify_facets(stages, kind);
        if collisions.contains(relative) {
            facets.push(ConflictFacet::CaseCollision);
        }
        facets
    };
    let mut files = Vec::with_capacity(read.listing.paths.len());
    for unmerged in &read.listing.paths {
        let (relative, exact) = display_path(&unmerged.path);
        let fingerprint = if exact {
            working_fingerprint(root, &relative)
        } else {
            WorkingFingerprint {
                kind: WorkingKind::Other,
                size: 0,
                modified_ns: 0,
            }
        };
        let facets = facets_of(unmerged, &relative, fingerprint.kind);
        let state = if exact && validate_repo_relative_path(&relative).is_ok() {
            snapshot_state(index.as_ref(), &relative, unmerged, fingerprint)
        } else {
            ConflictFileState::Unsupported
        };
        let in_snapshot = index
            .as_ref()
            .is_some_and(|index| index.paths.contains_key(relative.as_str()));
        let kept = exact
            .then(|| kept_side(journal.as_ref(), &relative, fingerprint))
            .flatten();
        files.push(ConflictFile {
            allowed_actions: if supported {
                allowed_file_actions(
                    unmerged,
                    &facets,
                    fingerprint.kind,
                    state,
                    in_snapshot,
                    kept,
                )
            } else {
                Vec::new()
            },
            shape: classify_shape(unmerged),
            facets,
            base: unmerged.base.clone(),
            current: unmerged.current.clone(),
            incoming: unmerged.incoming.clone(),
            working: fingerprint.kind,
            path: relative,
            path_is_exact: exact,
            state,
            kept,
        });
    }
    let unresolved_count = files.len();
    if let Some(index) = &index {
        // Paths the snapshot holds that are no longer unmerged were marked
        // resolved since; they stay listed so they can still be reset.
        let listed = files
            .iter()
            .map(|file| file.path.clone())
            .collect::<HashSet<_>>();
        let resolved = index
            .stages
            .iter()
            .filter(|(path, _)| !listed.contains(**path))
            .map(|(path, stages)| (path.to_string(), stages.clone()))
            .collect::<Vec<_>>();
        for (relative, stages) in resolved {
            let fingerprint = working_fingerprint(root, &relative);
            let facets = facets_of(&stages, &relative, fingerprint.kind);
            let state = ConflictFileState::MarkedResolved;
            let kept = kept_side(journal.as_ref(), &relative, fingerprint);
            files.push(ConflictFile {
                allowed_actions: if supported {
                    allowed_file_actions(&stages, &facets, fingerprint.kind, state, true, kept)
                } else {
                    Vec::new()
                },
                shape: classify_shape(&stages),
                facets,
                base: stages.base,
                current: stages.current,
                incoming: stages.incoming,
                working: fingerprint.kind,
                path: relative,
                path_is_exact: true,
                state,
                kept,
            });
        }
    }
    let allowed_actions = if supported {
        let finishable = read.listing.complete && read.listing.paths.is_empty();
        finishable
            .then_some(SessionAction::FinishMerge)
            .into_iter()
            .chain([SessionAction::AbortMerge])
            .collect()
    } else {
        Vec::new()
    };
    ConflictSession {
        origin: snapshot
            .as_ref()
            .map_or(ConflictOrigin::External, |manifest| manifest.origin),
        snapshot: snapshot.as_ref().map(|manifest| ConflictSnapshotSummary {
            session_id: manifest.session_id.clone(),
            created_at_ms: manifest.created_at_ms,
            complete: manifest.complete,
            pin_reference: manifest.pin_reference.clone(),
        }),
        session_id: read.session_id,
        state_token: read.state_token,
        operation: read.operation,
        unresolved_count,
        listing_complete: read.listing.complete,
        files,
        allowed_actions,
    }
}

/// The paused operation and its overlapping files, read-only. `None` when
/// nothing is paused.
pub(crate) fn read_conflict_session(path: String) -> Result<Option<ConflictSession>, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "read_conflict_session", None)?;
    Ok(read_session(&path, &repository)?.map(|read| describe_session(&repository, read)))
}

/// The session as it is now, after a change.
pub(crate) fn fresh_session(
    path: &str,
    repository: &RepositoryContext,
) -> Result<Option<ConflictSession>, AppError> {
    Ok(read_session(path, repository)?.map(|read| describe_session(repository, read)))
}

/// One unmerged path's stages as index entries.
pub(crate) fn stage_entries(relative: &str, unmerged: &UnmergedPath) -> Vec<SnapshotStageEntry> {
    [
        (1, &unmerged.base),
        (2, &unmerged.current),
        (3, &unmerged.incoming),
    ]
    .into_iter()
    .filter_map(|(stage, value)| {
        value.as_ref().map(|value| SnapshotStageEntry {
            path: relative.to_string(),
            stage,
            mode: value.mode.clone(),
            object_id: value.object_id.clone(),
        })
    })
    .collect()
}

pub(crate) fn line_endings(text: &[u8]) -> LineEndings {
    let mut crlf = 0_usize;
    let mut lf = 0_usize;
    for (index, byte) in text.iter().enumerate() {
        if *byte == b'\n' {
            if index > 0 && text[index - 1] == b'\r' {
                crlf += 1;
            } else {
                lf += 1;
            }
        }
    }
    match (crlf > 0, lf > 0) {
        (false, false) => LineEndings::None,
        (false, true) => LineEndings::Lf,
        (true, false) => LineEndings::Crlf,
        (true, true) => LineEndings::Mixed,
    }
}

/// One blob's size and bytes through `cat-file --batch`, or its size alone
/// when it is past the diff cap.
pub(crate) fn read_blob_capped(
    path: &str,
    object_id: &str,
) -> Result<(u64, Option<Vec<u8>>), AppError> {
    let request = format!("{object_id}\n");
    let output = run_git_with_input_capped(
        path,
        &["cat-file", "--batch"],
        request.as_bytes(),
        MAX_DIFF_OUTPUT_BYTES + 256,
    )?;
    if !output.status.success() {
        return Err(unreadable());
    }
    let header_end = output
        .stdout
        .iter()
        .position(|byte| *byte == b'\n')
        .ok_or_else(unreadable)?;
    let header = String::from_utf8_lossy(&output.stdout[..header_end]).to_string();
    let size = header
        .rsplit(' ')
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|_| header.split(' ').nth(1) == Some("blob"))
        .ok_or_else(unreadable)?;
    if size > MAX_DIFF_OUTPUT_BYTES as u64 || output.limit_exceeded {
        return Ok((size, None));
    }
    let start = header_end + 1;
    let content = output
        .stdout
        .get(start..start + size as usize)
        .ok_or_else(unreadable)?;
    Ok((size, Some(content.to_vec())))
}

/// Reads one stage of one conflicted file, after proving the requested object
/// is still that stage, so the boundary can never read an arbitrary object.
pub(crate) fn read_conflict_stage(
    path: String,
    file_path: String,
    stage: u8,
    object_id: String,
) -> Result<ConflictStageContent, AppError> {
    let (_repository, _access) =
        application::authorize_repository_read_of(&path, "read_conflict_stage", &file_path)?;
    validate_repo_relative_path(&file_path)?;
    if !(1..=3).contains(&stage) || !is_object_id(&object_id) {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That side of the overlapping file doesn't exist.",
        ));
    }
    let pathspec = format!(":(literal){file_path}");
    let output = run_git(&path, &["ls-files", "-u", "-z", "--", &pathspec])?;
    if !output.status.success() {
        return Err(unreadable());
    }
    let entry = parse_unmerged_entries(&output.stdout)?
        .into_iter()
        .find(|entry| entry.path == file_path.as_bytes() && entry.stage == stage)
        .filter(|entry| entry.object_id == object_id)
        .ok_or_else(stale)?;

    if entry.mode == MODE_GITLINK {
        return Ok(ConflictStageContent {
            stage,
            object_id: entry.object_id,
            mode: entry.mode,
            size: 0,
            kind: StageContentKind::Submodule,
            text: None,
            line_endings: None,
        });
    }
    let (size, content) = read_blob_capped(&path, &object_id)?;
    let mut base = ConflictStageContent {
        stage,
        object_id: entry.object_id,
        mode: entry.mode.clone(),
        size,
        kind: StageContentKind::TooLarge,
        text: None,
        line_endings: None,
    };
    let Some(content) = content else {
        return Ok(base);
    };
    let content = content.as_slice();
    if entry.mode == MODE_SYMLINK {
        base.kind = StageContentKind::SymbolicLink;
        base.text = Some(String::from_utf8_lossy(content).into_owned());
        return Ok(base);
    }
    let probe = &content[..content.len().min(BINARY_PROBE_BYTES)];
    if probe.contains(&0) {
        base.kind = StageContentKind::Binary;
        return Ok(base);
    }
    base.line_endings = Some(line_endings(content));
    match std::str::from_utf8(content) {
        Ok(text) => {
            base.kind = StageContentKind::Text;
            base.text = Some(text.to_string());
        }
        Err(_) => {
            base.kind = StageContentKind::NonUtf8Text;
            base.text = Some(String::from_utf8_lossy(content).into_owned());
        }
    }
    Ok(base)
}

#[derive(serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ConflictSide {
    Current,
    Incoming,
}

pub(crate) fn is_regular_file_mode(mode: &str) -> bool {
    mode == MODE_REGULAR || mode == MODE_EXECUTABLE
}

/// A side that added a file with no common version: every line is new.
/// Git has no object to diff it against, so the hunk is built here from the
/// side's own bytes, with the same binary probe and caps as any diff.
fn added_file_diff(path: &str, file_path: String, object_id: &str) -> Result<FileDiff, AppError> {
    let (_, content) = read_blob_capped(path, object_id)?;
    let Some(content) = content else {
        return Ok(FileDiff::TooLarge {
            path: file_path,
            original_path: None,
            change: ChangeCategory::New,
            limit_bytes: MAX_DIFF_OUTPUT_BYTES as u64,
        });
    };
    if content[..content.len().min(BINARY_PROBE_BYTES)].contains(&0) {
        return Ok(FileDiff::Binary {
            path: file_path,
            original_path: None,
            change: ChangeCategory::New,
        });
    }
    if content.is_empty() {
        return Ok(FileDiff::Unchanged {
            path: file_path,
            original_path: None,
            change: ChangeCategory::New,
        });
    }
    let text = String::from_utf8_lossy(&content);
    let body = text.strip_suffix('\n').unwrap_or(&text);
    let count = body.split('\n').count();
    let mut patch = format!("@@ -0,0 +1,{count} @@\n");
    for line in body.split('\n') {
        patch.push('+');
        patch.push_str(line);
        patch.push('\n');
    }
    let parsed = parse_diff_body(&patch);
    Ok(FileDiff::Text {
        path: file_path,
        original_path: None,
        change: ChangeCategory::New,
        hunks: parsed.hunks,
        truncated: parsed.truncated,
    })
}

/// What one side changed in a conflicted file against the common base, as
/// the same typed diff the Changes tab draws. Both object IDs are checked
/// against the path's current stages first, so the boundary can never diff
/// arbitrary objects.
pub(crate) fn read_conflict_side_diff(
    path: String,
    file_path: String,
    side: ConflictSide,
    base_object_id: Option<String>,
    side_object_id: String,
) -> Result<FileDiff, AppError> {
    let subject = format!("{file_path}:{side:?}");
    let (repository, _access) =
        application::authorize_repository_read_of(&path, "read_conflict_side_diff", &subject)?;
    validate_repo_relative_path(&file_path)?;
    let invalid = || {
        AppError::new(
            AppErrorCode::InvalidSelection,
            "That side of the overlapping file can't be compared as text.",
        )
    };
    if !is_object_id(&side_object_id)
        || base_object_id
            .as_deref()
            .is_some_and(|object_id| !is_object_id(object_id))
    {
        return Err(invalid());
    }
    let pathspec = format!(":(literal){file_path}");
    let output = run_git(&path, &["ls-files", "-u", "-z", "--", &pathspec])?;
    if !output.status.success() {
        return Err(unreadable());
    }
    let mut entries = parse_unmerged_entries(&output.stdout)?
        .into_iter()
        .filter(|entry| entry.path == file_path.as_bytes())
        .collect::<Vec<_>>();
    if entries.is_empty() {
        // Marked resolved since the snapshot: its sides are the stages the
        // snapshot recorded and pins, so the screen still shows what each
        // side changed, and nothing outside that record can be asked for.
        entries = read_session(&path, &repository)?
            .and_then(|read| read.snapshot)
            .map(|manifest| {
                manifest
                    .entries
                    .into_iter()
                    .filter(|entry| entry.path == file_path)
                    .map(|entry| UnmergedEntry {
                        mode: entry.mode,
                        object_id: entry.object_id,
                        stage: entry.stage,
                        path: entry.path.into_bytes(),
                    })
                    .collect()
            })
            .unwrap_or_default();
    }
    let side_stage = match side {
        ConflictSide::Current => 2,
        ConflictSide::Incoming => 3,
    };
    let base = entries.iter().find(|entry| entry.stage == 1);
    let changed = entries
        .iter()
        .find(|entry| entry.stage == side_stage)
        .ok_or_else(stale)?;
    if changed.object_id != side_object_id
        || base.map(|entry| entry.object_id.as_str()) != base_object_id.as_deref()
    {
        return Err(stale());
    }
    if !is_regular_file_mode(&changed.mode)
        || base.is_some_and(|entry| !is_regular_file_mode(&entry.mode))
    {
        return Err(invalid());
    }
    let Some(base) = base else {
        return added_file_diff(&path, file_path, &side_object_id);
    };
    let output = run_git_capped(
        &path,
        &[
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "--no-renames",
            &base.object_id,
            &side_object_id,
        ],
        MAX_DIFF_OUTPUT_BYTES,
    )?;
    // `git diff` between two blobs exits 1 when they differ.
    if !matches!(output.status.code(), Some(0 | 1)) {
        return Err(unreadable());
    }
    let change = ChangeCategory::Changed;
    if output.limit_exceeded {
        return Ok(FileDiff::TooLarge {
            path: file_path,
            original_path: None,
            change,
            limit_bytes: MAX_DIFF_OUTPUT_BYTES as u64,
        });
    }
    let text = String::from_utf8_lossy(&output.stdout);
    if is_binary_diff_output(&text) {
        return Ok(FileDiff::Binary {
            path: file_path,
            original_path: None,
            change,
        });
    }
    let parsed = parse_diff_body(&text);
    if parsed.hunks.is_empty() {
        return Ok(FileDiff::Unchanged {
            path: file_path,
            original_path: None,
            change,
        });
    }
    Ok(FileDiff::Text {
        path: file_path,
        original_path: None,
        change,
        hunks: parsed.hunks,
        truncated: parsed.truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: &str = "1111111111111111111111111111111111111111";
    const B: &str = "2222222222222222222222222222222222222222";
    const C: &str = "3333333333333333333333333333333333333333";

    fn stage(mode: &str, object_id: &str) -> Option<ConflictStage> {
        Some(ConflictStage {
            mode: mode.to_string(),
            object_id: object_id.to_string(),
        })
    }

    #[test]
    fn unmerged_listing_keeps_raw_paths_and_missing_stages() {
        let mut output = Vec::new();
        output.extend_from_slice(format!("100644 {A} 1\tboth.txt\0").as_bytes());
        output.extend_from_slice(format!("100644 {B} 2\tboth.txt\0").as_bytes());
        output.extend_from_slice(format!("100755 {C} 3\tboth.txt\0").as_bytes());
        for (object_id, stage) in [(A, 1), (B, 3)] {
            output.extend_from_slice(format!("100644 {object_id} {stage}\t").as_bytes());
            output.extend_from_slice(b"line\nbreak \xff.txt\0");
        }
        let listing = group_unmerged_paths(parse_unmerged_entries(&output).unwrap(), 10);

        assert!(listing.complete);
        assert_eq!(listing.paths.len(), 2);
        assert_eq!(listing.paths[0].incoming, stage("100755", C));
        let odd = &listing.paths[1];
        assert_eq!(odd.path, b"line\nbreak \xff.txt");
        assert_eq!(odd.current, None);
        assert_eq!(classify_shape(odd), ConflictShape::DeletedByCurrent);
        assert!(!display_path(&odd.path).1);
    }

    #[test]
    fn unmerged_listing_rejects_malformed_records_and_reports_its_bound() {
        for bad in [
            format!("100644 {A} 0\tstage-zero\0"),
            format!("100644 {A} 1 extra\tpath\0"),
            format!("10064x {A} 1\tpath\0"),
            "100644 nothex 1\tpath\0".to_string(),
            format!("100644 {A} 1 path-without-tab\0"),
        ] {
            assert!(parse_unmerged_entries(bad.as_bytes()).is_err(), "{bad}");
        }
        let output = format!("100644 {A} 2\tone\0100644 {A} 2\ttwo\0100644 {A} 2\tthree\0");
        let listing = group_unmerged_paths(parse_unmerged_entries(output.as_bytes()).unwrap(), 2);
        assert!(!listing.complete);
        assert_eq!(listing.paths.len(), 2);
    }

    #[test]
    fn every_stage_shape_has_one_classification() {
        let file = |base: bool, current: bool, incoming: bool| UnmergedPath {
            path: b"f".to_vec(),
            base: base.then(|| stage("100644", A)).flatten(),
            current: current.then(|| stage("100644", B)).flatten(),
            incoming: incoming.then(|| stage("100644", C)).flatten(),
        };
        for (shape, expected) in [
            ((true, true, true), ConflictShape::BothChanged),
            ((false, true, true), ConflictShape::BothAdded),
            ((true, false, true), ConflictShape::DeletedByCurrent),
            ((true, true, false), ConflictShape::DeletedByIncoming),
            ((true, false, false), ConflictShape::DeletedByBoth),
            ((false, true, false), ConflictShape::AddedByCurrent),
            ((false, false, true), ConflictShape::AddedByIncoming),
        ] {
            assert_eq!(classify_shape(&file(shape.0, shape.1, shape.2)), expected);
        }
    }

    #[test]
    fn facets_name_modes_links_submodules_and_directories() {
        let path = |base: Option<ConflictStage>, current, incoming| UnmergedPath {
            path: b"f".to_vec(),
            base,
            current,
            incoming,
        };
        let mode = path(stage("100644", A), stage("100755", B), stage("100644", C));
        assert_eq!(
            classify_facets(&mode, WorkingKind::File),
            [ConflictFacet::ModeChange]
        );
        let link = path(None, stage(MODE_SYMLINK, B), stage("100644", C));
        assert_eq!(
            classify_facets(&link, WorkingKind::File),
            [ConflictFacet::TypeChange, ConflictFacet::SymbolicLink]
        );
        let submodule = path(
            stage(MODE_GITLINK, A),
            stage(MODE_GITLINK, B),
            stage(MODE_GITLINK, C),
        );
        assert_eq!(
            classify_facets(&submodule, WorkingKind::Directory),
            [ConflictFacet::Submodule]
        );
        let directory = path(None, stage("100644", B), None);
        assert_eq!(
            classify_facets(&directory, WorkingKind::Directory),
            [ConflictFacet::FileDirectory]
        );
    }

    #[test]
    fn whole_file_choices_follow_the_shape_and_state() {
        let modify_delete = UnmergedPath {
            path: b"f".to_vec(),
            base: stage("100644", A),
            current: stage("100644", B),
            incoming: None,
        };
        use ConflictAction::*;
        use ConflictFileState::*;
        let actions = |facets: &[ConflictFacet],
                       working: WorkingKind,
                       state: ConflictFileState,
                       in_snapshot: bool,
                       kept: Option<KeptSide>| {
            allowed_file_actions(&modify_delete, facets, working, state, in_snapshot, kept)
        };
        assert_eq!(
            actions(&[], WorkingKind::File, Unresolved, false, None),
            [KeepCurrent, Delete, OpenInEditor, MarkResolved]
        );
        assert_eq!(
            actions(&[], WorkingKind::File, MarkedResolved, true, None),
            [ResetFile]
        );
        // A link or submodule has no text to edit, and is marked resolved
        // only once a side was kept.
        for facet in [ConflictFacet::Submodule, ConflictFacet::SymbolicLink] {
            assert_eq!(
                actions(&[facet], WorkingKind::File, Unresolved, false, None),
                [KeepCurrent, Delete]
            );
            assert_eq!(
                actions(
                    &[facet],
                    WorkingKind::File,
                    EditedOutside,
                    true,
                    Some(KeptSide::Current)
                ),
                [KeepCurrent, Delete, MarkResolved, ResetFile]
            );
        }
        // A folder in the way: no choice would leave the folder alone. A
        // case-only twin: any choice would write over the other path.
        for (facet, working) in [
            (ConflictFacet::FileDirectory, WorkingKind::Directory),
            (ConflictFacet::CaseCollision, WorkingKind::File),
        ] {
            assert_eq!(
                actions(&[facet], working, Unresolved, true, None),
                [] as [ConflictAction; 0]
            );
        }
        assert!(actions(&[], WorkingKind::File, Unsupported, true, None).is_empty());
    }

    #[test]
    fn only_paths_equal_but_for_case_collide() {
        let collisions = case_collisions(["README.md", "Readme.md", "src/a.rs", "src/b.rs"]);
        assert_eq!(
            collisions,
            HashSet::from(["README.md".to_string(), "Readme.md".to_string()])
        );
        assert!(case_collisions(["a.txt", "b.txt"]).is_empty());
    }

    #[test]
    fn only_whole_marker_blocks_count() {
        let unknown = |limit| MarkerScan::Unknown { limit };
        for (content, expected) in [
            (
                &b"a\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature\nb\n"[..],
                MarkerScan::Found { blocks: 1 },
            ),
            (
                b"<<<<<<< HEAD\r\nours\r\n||||||| base\r\nold\r\n=======\r\ntheirs\r\n>>>>>>> x\r\n",
                MarkerScan::Found { blocks: 1 },
            ),
            (b"Title\n=======\n\ntext\n", MarkerScan::None),
            (b"<<<<<<< HEAD\nnever closed\n", MarkerScan::None),
            (b"<<<<<<<<< not a marker\n=======\n>>>>>>>\n", MarkerScan::None),
            (b"\xff\xfe<\0<\0", unknown(MarkerScanLimit::Utf16)),
            (b"\xfe\xff\0<\0<", unknown(MarkerScanLimit::Utf16)),
            (b"bin\0ary", unknown(MarkerScanLimit::Binary)),
        ] {
            assert_eq!(scan_conflict_markers(content), expected);
        }
    }

    #[test]
    fn rebase_folders_decide_before_a_merge_marker() {
        let root =
            std::path::PathBuf::from(crate::test_support::unique_temp_dir("conflict-markers"));
        let marker = |setup: &[&str]| {
            let git_dir = root.join(setup.join("+").replace('/', "_"));
            for entry in setup {
                let target = git_dir.join(entry);
                if entry.ends_with('/') {
                    fs::create_dir_all(target).unwrap();
                } else {
                    fs::create_dir_all(target.parent().unwrap()).unwrap();
                    fs::write(target, "").unwrap();
                }
            }
            paused_operation_marker(&git_dir)
        };
        use PausedOperationKind::*;
        assert_eq!(marker(&["MERGE_HEAD"]), Some(Merge));
        assert_eq!(marker(&["rebase-merge/", "MERGE_HEAD"]), Some(Rebase));
        assert_eq!(marker(&["rebase-apply/"]), Some(Rebase));
        assert_eq!(marker(&["rebase-apply/applying"]), Some(Am));
        assert_eq!(marker(&["CHERRY_PICK_HEAD"]), Some(CherryPick));
        assert_eq!(marker(&["REVERT_HEAD"]), Some(Revert));
        assert_eq!(marker(&["index"]), None);
    }

    #[test]
    fn merge_message_hints_only_name_a_candidate() {
        for (message, expected) in [
            (
                "Merge branch 'feature/login' into main\n",
                Some("feature/login"),
            ),
            (
                "Merge remote-tracking branch 'origin/main'",
                Some("origin/main"),
            ),
            ("Merge tag 'v1.2'", Some("v1.2")),
            ("Merge commit 'abc'", None),
            ("edited by hand", None),
        ] {
            assert_eq!(merge_message_hint(message).as_deref(), expected);
        }
        assert_eq!(short_ref_name("refs/remotes/origin/x"), "origin/x");
    }

    #[test]
    fn line_endings_are_reported_per_stage() {
        for (text, expected) in [
            (&b"one"[..], LineEndings::None),
            (b"a\nb\n", LineEndings::Lf),
            (b"a\r\nb\r\n", LineEndings::Crlf),
            (b"a\r\nb\n", LineEndings::Mixed),
        ] {
            assert_eq!(line_endings(text), expected);
        }
    }
}
