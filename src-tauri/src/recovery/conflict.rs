//! The durable snapshot of a paused operation, taken before its first change.
//!
//! ADR 0041 fixes the format: per worktree under
//! `<git-dir>/gitodile/conflicts/v1/<session-id>/`, a versioned manifest of
//! every unmerged stage plus each path's working content, published by a
//! rename, and a hidden ref in the common repository pinning the stage blobs
//! so `gc` cannot prune an original side after it is resolved. The first
//! snapshot of a session is the original and is never replaced.
//!
//! What the user changes after that is kept by the record's journal
//! (ADR 0041 §8): before a resolution action replaces working bytes or index
//! entries the snapshot does not already hold, they are copied or pinned
//! here, and the entry then records what the action left on disk.

use super::{now_ms, worktree_owner_id};
use crate::changes::validate_repo_relative_path;
use crate::conflicts::{
    is_object_id, read_session, working_fingerprint, ConflictOrigin, PausedOperationKind,
    WorkingKind,
};
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{run_git, run_git_with_input_capped};
use crate::repository_access::{self, AccessMode, RepositoryContext};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

pub(crate) const CONFLICT_SNAPSHOT_SCHEMA_VERSION: u32 = 1;
/// Working bytes one snapshot may copy; a path past it is `omitted`.
pub(crate) const MAX_CONFLICT_SNAPSHOT_BYTES: u64 = 512 * 1024 * 1024;
pub(crate) const CONFLICT_JOURNAL_SCHEMA_VERSION: u32 = 1;
/// Ended sessions' snapshots kept per worktree, newest first.
const MAX_ENDED_SNAPSHOTS: usize = 10;
const ENDED_SNAPSHOT_RETENTION_MS: u128 = 30 * 24 * 60 * 60 * 1000;
/// A pending folder this old belongs to a creation that cannot still run.
const PENDING_ABANDONED_MS: u128 = 60 * 60 * 1000;
const PENDING_PREFIX: &str = ".pending-";

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SnapshotStageEntry {
    pub(crate) path: String,
    pub(crate) stage: u8,
    pub(crate) mode: String,
    pub(crate) object_id: String,
}

/// What the working tree held at a path. `Unreadable` and `Omitted` are
/// recorded evidence gaps, never silently dropped.
#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum SnapshotWorking {
    Absent,
    File {
        sequence: usize,
        executable: bool,
        sha256: String,
    },
    SymbolicLink {
        target: String,
    },
    Directory,
    Unreadable,
    Omitted,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SnapshotPath {
    pub(crate) path: String,
    pub(crate) working: SnapshotWorking,
    pub(crate) size: u64,
    pub(crate) modified_ns: u128,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConflictSnapshotManifest {
    pub(crate) schema_version: u32,
    pub(crate) session_id: String,
    pub(crate) origin: ConflictOrigin,
    pub(crate) operation: PausedOperationKind,
    pub(crate) head: Option<String>,
    pub(crate) operation_heads: Vec<String>,
    pub(crate) created_at_ms: u128,
    /// False when the unmerged listing hit its bound.
    pub(crate) listing_complete: bool,
    /// False when any evidence is missing: a bounded listing, a path that is
    /// not UTF-8, an unreadable or omitted working path, or no pin.
    pub(crate) complete: bool,
    pub(crate) pin_reference: Option<String>,
    pub(crate) entries: Vec<SnapshotStageEntry>,
    pub(crate) paths: Vec<SnapshotPath>,
}

fn failed(message: &str) -> AppError {
    AppError::new(AppErrorCode::RecoveryFailed, message)
        .with_remediation("Nothing was changed. Check disk space and permissions, then try again.")
}

fn stale() -> AppError {
    AppError::new(
        AppErrorCode::StaleConflictSession,
        "The overlapping changes changed while GitOdile was preserving them.",
    )
    .with_remediation("Review the overlapping files again, then retry.")
}

pub(crate) fn conflict_snapshot_root(git_dir: &Path) -> PathBuf {
    git_dir.join("gitodile").join("conflicts").join("v1")
}

/// Session IDs are GitOdile's own (`<operation>-<hex>`); anything else in the
/// folder is not a snapshot and is never read or removed.
fn valid_session_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn read_manifest(record: &Path) -> Option<ConflictSnapshotManifest> {
    let bytes = fs::read(record.join("manifest.json")).ok()?;
    let manifest: ConflictSnapshotManifest = serde_json::from_slice(&bytes).ok()?;
    (manifest.schema_version == CONFLICT_SNAPSHOT_SCHEMA_VERSION).then_some(manifest)
}

/// The published snapshot of `session_id`, if one exists and is readable.
pub(crate) fn read_conflict_snapshot(
    git_dir: &Path,
    session_id: &str,
) -> Option<ConflictSnapshotManifest> {
    if !valid_session_id(session_id) {
        return None;
    }
    read_manifest(&conflict_snapshot_root(git_dir).join(session_id))
        .filter(|manifest| manifest.session_id == session_id)
}

fn unique_pending_name() -> String {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    format!(
        "{PENDING_PREFIX}{}-{}-{}",
        now_ms(),
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}

/// Refuses a path that leaves the project through a symbolic link before its
/// bytes are copied into the snapshot.
fn contained_target(root: &Path, relative: &str) -> Option<PathBuf> {
    validate_repo_relative_path(relative).ok()?;
    let root = root.canonicalize().ok()?;
    let target = root.join(relative);
    let mut parent = target.parent();
    while let Some(candidate) = parent {
        if candidate.exists() {
            return candidate
                .canonicalize()
                .ok()
                .filter(|canonical| canonical.starts_with(&root))
                .map(|_| target);
        }
        parent = candidate.parent();
    }
    None
}

fn copy_file(source: &Path, destination: &Path) -> std::io::Result<String> {
    let mut input = File::open(source)?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let read = input.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        output.write_all(&buffer[..read])?;
    }
    output.sync_all()?;
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

#[cfg(unix)]
fn is_executable(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
fn is_executable(_metadata: &fs::Metadata) -> bool {
    false
}

fn capture_working(
    root: &Path,
    record: &Path,
    relative: &str,
    sequence: usize,
    budget: &mut u64,
) -> SnapshotWorking {
    let Some(target) = contained_target(root, relative) else {
        return SnapshotWorking::Unreadable;
    };
    let metadata = match fs::symlink_metadata(&target) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return SnapshotWorking::Absent
        }
        Err(_) => return SnapshotWorking::Unreadable,
    };
    if metadata.file_type().is_symlink() {
        return match fs::read_link(&target) {
            Ok(link) => match link.to_str() {
                Some(text) => SnapshotWorking::SymbolicLink {
                    target: text.replace('\\', "/"),
                },
                None => SnapshotWorking::Unreadable,
            },
            Err(_) => SnapshotWorking::Unreadable,
        };
    }
    if metadata.is_dir() {
        return SnapshotWorking::Directory;
    }
    if !metadata.is_file() {
        return SnapshotWorking::Unreadable;
    }
    if metadata.len() > *budget {
        return SnapshotWorking::Omitted;
    }
    match copy_file(&target, &record.join("files").join(sequence.to_string())) {
        Ok(sha256) => {
            *budget -= metadata.len();
            SnapshotWorking::File {
                sequence,
                executable: is_executable(&metadata),
                sha256,
            }
        }
        Err(_) => SnapshotWorking::Unreadable,
    }
}

fn pin_reference_name(repository: &RepositoryContext, session_id: &str) -> String {
    format!(
        "refs/gitodile/recovery/v1/conflict/{}/{session_id}",
        worktree_owner_id(repository)
    )
}

/// Pins every stage blob with a tree under a hidden ref. A tree needs no
/// identity and never appears in history; gitlinks are recorded but not
/// pinned, because their commits live in another repository.
fn pin_stage_objects(
    path: &str,
    repository: &RepositoryContext,
    session_id: &str,
    entries: &[SnapshotStageEntry],
) -> Option<String> {
    let mut blobs = entries
        .iter()
        .filter(|entry| entry.mode != "160000")
        .map(|entry| entry.object_id.as_str())
        .collect::<Vec<_>>();
    blobs.sort_unstable();
    blobs.dedup();
    if blobs.is_empty() {
        return None;
    }
    let mut input = Vec::new();
    for (index, object_id) in blobs.iter().enumerate() {
        input.extend_from_slice(format!("100644 blob {object_id}\ts{index:06}\0").as_bytes());
    }
    let output = run_git_with_input_capped(path, &["mktree", "-z"], &input, 1024).ok()?;
    let tree = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() || !is_object_id(&tree) {
        return None;
    }
    let reference = pin_reference_name(repository, session_id);
    run_git(path, &["update-ref", &reference, &tree])
        .ok()
        .filter(|result| result.status.success())
        .map(|_| reference)
}

fn write_manifest(record: &Path, manifest: &ConflictSnapshotManifest) -> Result<(), AppError> {
    let value = serde_json::to_vec_pretty(manifest)
        .map_err(|_| failed("GitOdile couldn't encode the overlap snapshot."))?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(record.join("manifest.json"))
        .map_err(|_| failed("GitOdile couldn't create the overlap snapshot."))?;
    file.write_all(&value)
        .and_then(|_| file.sync_all())
        .map_err(|_| failed("GitOdile couldn't finish writing the overlap snapshot."))
}

fn pending_age_ms(name: &str, now: u128) -> Option<u128> {
    let created = name
        .strip_prefix(PENDING_PREFIX)?
        .split('-')
        .next()?
        .parse::<u128>()
        .ok()?;
    Some(now.saturating_sub(created))
}

/// Removes abandoned pending folders and the snapshots of ended sessions past
/// their retention, with their refs. The live session's snapshot is never
/// touched, and nothing that is not GitOdile's own is read or removed.
fn trim(path: &str, root: &Path, live_session: &str) {
    let Ok(children) = fs::read_dir(root) else {
        return;
    };
    let now = now_ms();
    let mut ended = Vec::new();
    for child in children.filter_map(Result::ok) {
        let name = child.file_name().to_string_lossy().to_string();
        if pending_age_ms(&name, now).is_some_and(|age| age > PENDING_ABANDONED_MS) {
            let _ = fs::remove_dir_all(child.path());
            continue;
        }
        if name == live_session || !valid_session_id(&name) {
            continue;
        }
        if let Some(manifest) = read_manifest(&child.path()) {
            let journal_pin =
                read_journal_at(&child.path()).and_then(|journal| journal.pin_reference);
            ended.push((
                manifest.created_at_ms,
                child.path(),
                [manifest.pin_reference, journal_pin],
            ));
        }
    }
    ended.sort_by_key(|item| std::cmp::Reverse(item.0));
    for (index, (created_at_ms, folder, pins)) in ended.into_iter().enumerate() {
        let expired = now.saturating_sub(created_at_ms) > ENDED_SNAPSHOT_RETENTION_MS;
        if index >= MAX_ENDED_SNAPSHOTS || expired {
            for reference in pins.into_iter().flatten() {
                let _ = run_git(path, &["update-ref", "-d", &reference]);
            }
            let _ = fs::remove_dir_all(folder);
        }
    }
}

/// Creates the session's durable snapshot, or returns the one that already
/// exists: the first snapshot is the original and is never replaced.
///
/// The caller holds the repository write lock — this is the first step of a
/// mutation, never a read — and passes the state token its plan was made
/// with. The token is revalidated before and after capture, so what is
/// preserved is exactly what the plan described.
pub(crate) fn create_conflict_snapshot(
    path: &str,
    repository: &RepositoryContext,
    state_token: &str,
    origin: ConflictOrigin,
) -> Result<ConflictSnapshotManifest, AppError> {
    create_snapshot(
        path,
        repository,
        state_token,
        origin,
        MAX_CONFLICT_SNAPSHOT_BYTES,
    )
}

/// [`create_conflict_snapshot`] with a smaller byte budget, so tests can
/// prove that an omitted path is recorded without writing 512 MiB.
#[cfg(test)]
pub(crate) fn create_conflict_snapshot_within(
    path: &str,
    repository: &RepositoryContext,
    state_token: &str,
    budget: u64,
) -> Result<ConflictSnapshotManifest, AppError> {
    create_snapshot(
        path,
        repository,
        state_token,
        ConflictOrigin::External,
        budget,
    )
}

fn create_snapshot(
    path: &str,
    repository: &RepositoryContext,
    state_token: &str,
    origin: ConflictOrigin,
    budget: u64,
) -> Result<ConflictSnapshotManifest, AppError> {
    if repository_access::held_mode(repository.common_git_dir.match_key())
        != Some(AccessMode::Write)
    {
        return Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "GitOdile tried to preserve overlapping changes without holding the project.",
        )
        .with_remediation("Restart GitOdile, and please report this if it happens again."));
    }
    let read = read_session(path, repository)?.ok_or_else(stale)?;
    if read.state_token != state_token {
        return Err(stale());
    }
    let git_dir = repository.git_dir.backend_path();
    if let Some(existing) = read.snapshot.clone() {
        return Ok(existing);
    }
    let root = conflict_snapshot_root(git_dir);
    fs::create_dir_all(&root)
        .map_err(|_| failed("GitOdile couldn't create the overlap snapshot folder."))?;
    trim(path, &root, &read.session_id);

    let pending = root.join(unique_pending_name());
    fs::create_dir_all(pending.join("files"))
        .map_err(|_| failed("GitOdile couldn't create the overlap snapshot folder."))?;
    let result = capture(path, repository, &read, &pending, origin, budget).and_then(|manifest| {
        let fresh = read_session(path, repository)?.ok_or_else(stale)?;
        if fresh.state_token != state_token {
            return Err(stale());
        }
        write_manifest(&pending, &manifest)?;
        Ok(manifest)
    });
    let manifest = match result {
        Ok(manifest) => manifest,
        Err(error) => {
            let _ = fs::remove_dir_all(&pending);
            // A pin with no published manifest would never be trimmed. Keep
            // it only if another process published this session meanwhile,
            // since the ref name is the same.
            let published = read_conflict_snapshot(git_dir, &read.session_id).is_some();
            if !published {
                let _ = run_git(
                    path,
                    &[
                        "update-ref",
                        "-d",
                        &pin_reference_name(repository, &read.session_id),
                    ],
                );
            }
            return Err(error);
        }
    };
    let final_path = root.join(&read.session_id);
    if fs::rename(&pending, &final_path).is_err() {
        let _ = fs::remove_dir_all(&pending);
        // Another GitOdile process published this session's snapshot first;
        // that one is the original.
        return read_conflict_snapshot(git_dir, &read.session_id)
            .ok_or_else(|| failed("GitOdile couldn't publish the overlap snapshot."));
    }
    Ok(manifest)
}

fn capture(
    path: &str,
    repository: &RepositoryContext,
    read: &crate::conflicts::SessionRead,
    record: &Path,
    origin: ConflictOrigin,
    mut budget: u64,
) -> Result<ConflictSnapshotManifest, AppError> {
    let root = repository.worktree_root.backend_path();
    let mut entries = Vec::new();
    let mut paths = Vec::new();
    let mut complete = read.listing.complete;
    for (sequence, unmerged) in read.listing.paths.iter().enumerate() {
        let Ok(relative) = std::str::from_utf8(&unmerged.path) else {
            complete = false;
            continue;
        };
        for (stage, value) in [
            (1, &unmerged.base),
            (2, &unmerged.current),
            (3, &unmerged.incoming),
        ] {
            if let Some(value) = value {
                entries.push(SnapshotStageEntry {
                    path: relative.to_string(),
                    stage,
                    mode: value.mode.clone(),
                    object_id: value.object_id.clone(),
                });
            }
        }
        let fingerprint = working_fingerprint(root, relative);
        let working = capture_working(root, record, relative, sequence, &mut budget);
        if matches!(
            working,
            SnapshotWorking::Unreadable | SnapshotWorking::Omitted
        ) {
            complete = false;
        }
        let (size, modified_ns) = if fingerprint.kind == WorkingKind::Absent {
            (0, 0)
        } else {
            (fingerprint.size, fingerprint.modified_ns)
        };
        paths.push(SnapshotPath {
            path: relative.to_string(),
            working,
            size,
            modified_ns,
        });
    }
    let pin_reference = pin_stage_objects(path, repository, &read.session_id, &entries);
    let needs_pin = entries.iter().any(|entry| entry.mode != "160000");
    if needs_pin && pin_reference.is_none() {
        complete = false;
    }
    Ok(ConflictSnapshotManifest {
        schema_version: CONFLICT_SNAPSHOT_SCHEMA_VERSION,
        session_id: read.session_id.clone(),
        origin,
        operation: read.operation.kind,
        head: read.head.clone(),
        operation_heads: read.operation.operation_heads.clone(),
        created_at_ms: now_ms(),
        listing_complete: read.listing.complete,
        complete,
        pin_reference,
        entries,
        paths,
    })
}

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum JournalAction {
    KeepCurrent,
    KeepIncoming,
    Delete,
    MarkResolved,
    Reset,
}

/// What a path held on disk before an action replaced it.
#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum JournalWorking {
    Absent,
    /// `stored` names the copy under `journal/files/`. `None` when the bytes
    /// were the snapshot's or what an earlier action wrote from a pinned
    /// stage, both of which can be had again.
    File {
        stored: Option<usize>,
        executable: bool,
        sha256: String,
        size: u64,
    },
    SymbolicLink {
        target: String,
    },
    Directory,
    Unreadable,
}

/// What a path holds on disk: enough to tell later whether it is still what
/// an action left there.
#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkingState {
    pub(crate) kind: WorkingKind,
    pub(crate) size: u64,
    pub(crate) modified_ns: u128,
    /// The file's bytes, or a link's target; `None` for anything else.
    pub(crate) sha256: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct JournalEntry {
    pub(crate) sequence: usize,
    pub(crate) path: String,
    pub(crate) action: JournalAction,
    pub(crate) at_ms: u128,
    pub(crate) replaced_working: JournalWorking,
    /// The path's index entries before the action, stage 0 included.
    pub(crate) replaced_index: Vec<SnapshotStageEntry>,
    /// What the action left on disk; `None` until it finished.
    pub(crate) left: Option<WorkingState>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConflictJournal {
    pub(crate) schema_version: u32,
    pub(crate) session_id: String,
    pub(crate) stored_bytes: u64,
    pub(crate) pin_reference: Option<String>,
    pub(crate) entries: Vec<JournalEntry>,
}

fn journal_dir(git_dir: &Path, session_id: &str) -> PathBuf {
    conflict_snapshot_root(git_dir)
        .join(session_id)
        .join("journal")
}

fn read_journal_at(record: &Path) -> Option<ConflictJournal> {
    let bytes = fs::read(record.join("journal").join("journal.json")).ok()?;
    let journal: ConflictJournal = serde_json::from_slice(&bytes).ok()?;
    (journal.schema_version == CONFLICT_JOURNAL_SCHEMA_VERSION).then_some(journal)
}

/// The session's resolution journal, if any action has written one.
pub(crate) fn read_conflict_journal(git_dir: &Path, session_id: &str) -> Option<ConflictJournal> {
    if !valid_session_id(session_id) {
        return None;
    }
    read_journal_at(&conflict_snapshot_root(git_dir).join(session_id))
        .filter(|journal| journal.session_id == session_id)
}

/// The snapshot's copy of a path's working bytes.
pub(crate) fn conflict_snapshot_file(git_dir: &Path, session_id: &str, sequence: usize) -> PathBuf {
    conflict_snapshot_root(git_dir)
        .join(session_id)
        .join("files")
        .join(sequence.to_string())
}

fn journal_failed() -> AppError {
    AppError::new(
        AppErrorCode::RecoveryFailed,
        "GitOdile couldn't keep a copy of this file before changing it.",
    )
    .with_remediation("Nothing was changed. Check disk space and permissions, then try again.")
}

/// Replaces `journal.json` through a rename, so a crash leaves the previous
/// journal or the new one, never half of either.
fn write_journal(directory: &Path, journal: &ConflictJournal) -> Result<(), AppError> {
    let value = serde_json::to_vec_pretty(journal).map_err(|_| journal_failed())?;
    let pending = directory.join(format!("journal.json{}", unique_pending_name()));
    let written = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&pending)
        .and_then(|mut file| {
            file.write_all(&value)?;
            file.sync_all()
        })
        .and_then(|_| fs::rename(&pending, directory.join("journal.json")));
    if written.is_err() {
        let _ = fs::remove_file(&pending);
        return Err(journal_failed());
    }
    Ok(())
}

fn hex_digest(hasher: Sha256) -> String {
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(crate) fn file_sha256(path: &Path) -> std::io::Result<String> {
    let mut input = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 64 * 1024];
    loop {
        let read = input.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex_digest(hasher))
}

/// What a path holds now. A link's hash is of its target, as Git stores it.
pub(crate) fn working_state(root: &Path, relative: &str) -> WorkingState {
    let fingerprint = working_fingerprint(root, relative);
    let target = root.join(relative);
    let sha256 = match fingerprint.kind {
        WorkingKind::File => file_sha256(&target).ok(),
        WorkingKind::SymbolicLink => fs::read_link(&target).ok().and_then(|link| {
            link.to_str().map(|text| {
                let mut hasher = Sha256::new();
                hasher.update(text.replace('\\', "/").as_bytes());
                hex_digest(hasher)
            })
        }),
        _ => None,
    };
    WorkingState {
        kind: fingerprint.kind,
        size: fingerprint.size,
        modified_ns: fingerprint.modified_ns,
        sha256,
    }
}

/// The last action that wrote `relative` (a side, a delete or a reset).
pub(crate) fn last_written<'a>(
    journal: &'a ConflictJournal,
    relative: &str,
) -> Option<&'a JournalEntry> {
    journal
        .entries
        .iter()
        .rev()
        .filter(|entry| entry.path == relative && entry.left.is_some())
        .find(|entry| entry.action != JournalAction::MarkResolved)
}

/// Pins every blob the journal's index evidence names that the snapshot does
/// not pin already, with one tree under the journal's own ref.
fn pin_journal_objects(
    path: &str,
    repository: &RepositoryContext,
    snapshot: &ConflictSnapshotManifest,
    journal: &ConflictJournal,
) -> Result<Option<String>, AppError> {
    let pinned = snapshot
        .entries
        .iter()
        .map(|entry| entry.object_id.as_str())
        .collect::<std::collections::HashSet<_>>();
    let mut blobs = journal
        .entries
        .iter()
        .flat_map(|entry| entry.replaced_index.iter())
        .filter(|entry| entry.mode != "160000" && !pinned.contains(entry.object_id.as_str()))
        .map(|entry| entry.object_id.as_str())
        .collect::<Vec<_>>();
    blobs.sort_unstable();
    blobs.dedup();
    if blobs.is_empty() {
        return Ok(journal.pin_reference.clone());
    }
    let mut input = Vec::new();
    for (index, object_id) in blobs.iter().enumerate() {
        input.extend_from_slice(format!("100644 blob {object_id}\tj{index:06}\0").as_bytes());
    }
    let output = run_git_with_input_capped(path, &["mktree", "-z"], &input, 1024)?;
    let tree = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() || !is_object_id(&tree) {
        return Err(journal_failed());
    }
    let reference = format!(
        "{}-journal",
        pin_reference_name(repository, &snapshot.session_id)
    );
    let updated = run_git(path, &["update-ref", &reference, &tree])?;
    if !updated.status.success() {
        return Err(journal_failed());
    }
    Ok(Some(reference))
}

fn replaced_working(
    target: Option<PathBuf>,
    relative: &str,
    snapshot: &ConflictSnapshotManifest,
    journal: &mut ConflictJournal,
    destination: &Path,
    sequence: usize,
) -> Result<JournalWorking, AppError> {
    let Some(target) = target else {
        return Ok(JournalWorking::Unreadable);
    };
    let metadata = match fs::symlink_metadata(&target) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(JournalWorking::Absent)
        }
        Err(_) => return Ok(JournalWorking::Unreadable),
    };
    if metadata.file_type().is_symlink() {
        return Ok(
            match fs::read_link(&target)
                .ok()
                .and_then(|link| link.to_str().map(|text| text.replace('\\', "/")))
            {
                Some(target) => JournalWorking::SymbolicLink { target },
                None => JournalWorking::Unreadable,
            },
        );
    }
    if metadata.is_dir() {
        return Ok(JournalWorking::Directory);
    }
    if !metadata.is_file() {
        return Ok(JournalWorking::Unreadable);
    }
    let sha256 = file_sha256(&target).map_err(|_| journal_failed())?;
    let in_snapshot = snapshot.paths.iter().any(|item| {
        item.path == relative
            && matches!(&item.working, SnapshotWorking::File { sha256: kept, .. } if *kept == sha256)
    });
    let written = last_written(journal, relative)
        .and_then(|entry| entry.left.as_ref())
        .is_some_and(|left| left.sha256.as_deref() == Some(sha256.as_str()));
    let stored = if in_snapshot || written {
        None
    } else {
        let size = metadata.len();
        if journal.stored_bytes.saturating_add(size) > MAX_CONFLICT_SNAPSHOT_BYTES {
            return Err(AppError::new(
                AppErrorCode::RecoveryFailed,
                "This file is too large for GitOdile to keep a copy before changing it.",
            )
            .with_remediation(
                "Nothing was changed. Copy the file somewhere safe yourself, then try again.",
            ));
        }
        let _ = fs::remove_file(destination);
        let copied = copy_file(&target, destination).map_err(|_| journal_failed())?;
        if copied != sha256 {
            // The file changed while it was being copied.
            let _ = fs::remove_file(destination);
            return Err(stale());
        }
        journal.stored_bytes += size;
        Some(sequence)
    };
    Ok(JournalWorking::File {
        stored,
        executable: is_executable(&metadata),
        sha256,
        size: metadata.len(),
    })
}

/// Records what an action is about to replace at `relative`, before it
/// replaces anything: working bytes neither the snapshot nor an earlier
/// action holds are copied, index entries the snapshot does not pin are
/// pinned. Returns the entry's sequence for [`finish_conflict_journal_entry`].
///
/// The caller holds the write lock and has created the session's snapshot.
pub(crate) fn begin_conflict_journal_entry(
    path: &str,
    repository: &RepositoryContext,
    snapshot: &ConflictSnapshotManifest,
    relative: &str,
    action: JournalAction,
    replaced_index: Vec<SnapshotStageEntry>,
) -> Result<usize, AppError> {
    if repository_access::held_mode(repository.common_git_dir.match_key())
        != Some(AccessMode::Write)
    {
        return Err(journal_failed());
    }
    let git_dir = repository.git_dir.backend_path();
    let directory = journal_dir(git_dir, &snapshot.session_id);
    fs::create_dir_all(directory.join("files")).map_err(|_| journal_failed())?;
    let mut journal =
        read_conflict_journal(git_dir, &snapshot.session_id).unwrap_or(ConflictJournal {
            schema_version: CONFLICT_JOURNAL_SCHEMA_VERSION,
            session_id: snapshot.session_id.clone(),
            stored_bytes: 0,
            pin_reference: None,
            entries: Vec::new(),
        });
    let sequence = journal.entries.last().map_or(0, |entry| entry.sequence + 1);
    let root = repository.worktree_root.backend_path();
    let working = replaced_working(
        contained_target(root, relative),
        relative,
        snapshot,
        &mut journal,
        &directory.join("files").join(sequence.to_string()),
        sequence,
    )?;
    journal.entries.push(JournalEntry {
        sequence,
        path: relative.to_string(),
        action,
        at_ms: now_ms(),
        replaced_working: working,
        replaced_index,
        left: None,
    });
    journal.pin_reference = pin_journal_objects(path, repository, snapshot, &journal)?;
    write_journal(&directory, &journal)?;
    Ok(sequence)
}

/// Records what the action of entry `sequence` left on disk.
pub(crate) fn finish_conflict_journal_entry(
    repository: &RepositoryContext,
    session_id: &str,
    sequence: usize,
    left: WorkingState,
) -> Result<(), AppError> {
    let git_dir = repository.git_dir.backend_path();
    let mut journal = read_conflict_journal(git_dir, session_id).ok_or_else(journal_failed)?;
    let entry = journal
        .entries
        .iter_mut()
        .find(|entry| entry.sequence == sequence)
        .ok_or_else(journal_failed)?;
    entry.left = Some(left);
    write_journal(&journal_dir(git_dir, session_id), &journal)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_gitodile_session_ids_name_a_snapshot() {
        assert!(valid_session_id("merge-0123456789abcdef01234567"));
        for bad in ["", "../escape", "Merge-ABC", "merge/one", &"a".repeat(65)] {
            assert!(!valid_session_id(bad), "{bad}");
        }
    }

    #[test]
    fn pending_folders_age_from_their_own_name() {
        assert_eq!(pending_age_ms(".pending-1000-7-0", 5000), Some(4000));
        assert_eq!(pending_age_ms("merge-abc", 5000), None);
        assert_eq!(pending_age_ms(".pending-notanumber", 5000), None);
        assert_ne!(unique_pending_name(), unique_pending_name());
    }
}
