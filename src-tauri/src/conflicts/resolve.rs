//! Resolving one overlapping file (ADR 0041 §8).
//!
//! Three local mutations, each separate from the others: keep a whole side
//! (or delete the path) in the working tree, mark the file resolved in the
//! index, and reset it to its original overlap. None implies another, and
//! none finishes the merge.
//!
//! Every one takes the repository write lock, revalidates the state token
//! and the path's stages against what the screen read, checks that the
//! session allows the action, creates the session's snapshot when it has
//! none, and records what it is about to replace in the journal before
//! replacing it. Paths reach Git as separate, literal pathspecs; content is
//! written beside its target and renamed over it.

use super::{
    describe_session, exact_working_path, fresh_session, is_object_id, is_regular_file_mode,
    kept_side, read_blob_capped, read_session, scan_working_markers, stage_entries, stale,
    unreadable, working_fingerprint, ConflictAction, ConflictFacet, ConflictFile, ConflictSession,
    ConflictStage, KeptSide, MarkerScan, UnmergedPath, WorkingKind, MODE_EXECUTABLE, MODE_GITLINK,
    MODE_SYMLINK,
};
use crate::application;
use crate::changes::validate_repo_relative_path;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{
    run_git, run_git_to_file, run_git_with_env, run_git_with_env_and_input,
    run_git_with_input_capped,
};
use crate::index::copy_project_index;
use crate::operation::truncate_detail;
use crate::recovery::{
    begin_conflict_journal_entry, conflict_snapshot_file, create_conflict_snapshot, file_sha256,
    finish_conflict_journal_entry, last_written, read_conflict_journal, working_state,
    ConflictSnapshotManifest, JournalAction, SnapshotStageEntry, SnapshotWorking,
};
use crate::repository_access::RepositoryContext;
use std::fs::{self, OpenOptions};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(serde::Deserialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum SideChoice {
    KeepCurrent,
    KeepIncoming,
    Delete,
}

/// The stages the screen read. Every mutation proves they are still the
/// path's, so a choice never applies to objects the reader did not see.
#[derive(serde::Deserialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExpectedStages {
    pub(crate) base: Option<ConflictStage>,
    pub(crate) current: Option<ConflictStage>,
    pub(crate) incoming: Option<ConflictStage>,
}

fn unavailable(message: &str) -> AppError {
    AppError::new(AppErrorCode::ConflictActionUnavailable, message)
        .with_remediation("Read the overlapping changes again to see what this file allows.")
}

fn uncertain(message: &str) -> AppError {
    AppError::new(AppErrorCode::GitCommandFailed, message).with_remediation(
        "Read the overlapping changes again before going on; a copy of what was replaced is kept.",
    )
}

/// A working-tree write that failed. On Windows another program holding the
/// file open is the usual reason, and the one the reader can fix.
fn write_failed(error: &std::io::Error) -> AppError {
    let locked = matches!(error.raw_os_error(), Some(32 | 33))
        || (cfg!(windows) && error.kind() == ErrorKind::PermissionDenied);
    if locked {
        AppError::new(
            AppErrorCode::FileLocked,
            "Another program is using this file, so GitOdile couldn't change it.",
        )
        .with_remediation("Close the file in that program, then try again. Nothing was changed.")
    } else if error.kind() == ErrorKind::PermissionDenied {
        AppError::new(
            AppErrorCode::PermissionDenied,
            "GitOdile isn't allowed to change this file.",
        )
        .with_remediation("Check the file's permissions, then try again. Nothing was changed.")
    } else {
        AppError::new(
            AppErrorCode::PathUnusable,
            "GitOdile couldn't write this file.",
        )
        .with_remediation("Check free disk space and permissions, then try again.")
    }
}

fn git_failed(message: &str, output: &std::process::Output) -> AppError {
    AppError::new(AppErrorCode::GitCommandFailed, message)
        .with_remediation("Read the overlapping changes again, then try again.")
        .with_detail(truncate_detail(&String::from_utf8_lossy(&output.stderr)))
}

fn literal(relative: &str) -> String {
    format!(":(literal){relative}")
}

/// Everything an action needs once its inputs are proved current.
struct Prepared {
    repository: RepositoryContext,
    file: ConflictFile,
    /// The path's unmerged stages now; `None` once it was marked resolved.
    unmerged: Option<UnmergedPath>,
    snapshot: ConflictSnapshotManifest,
}

fn prepare(
    path: &str,
    repository: RepositoryContext,
    file_path: &str,
    state_token: &str,
    expected: Option<&ExpectedStages>,
    action: ConflictAction,
) -> Result<Prepared, AppError> {
    validate_repo_relative_path(file_path)?;
    let read = read_session(path, &repository)?.ok_or_else(stale)?;
    if read.state_token != state_token {
        return Err(stale());
    }
    if !read.operation.supported {
        return Err(unavailable(
            "GitOdile can't resolve files of this paused operation.",
        ));
    }
    let unmerged = read
        .listing
        .paths
        .iter()
        .find(|unmerged| unmerged.path == file_path.as_bytes())
        .cloned();
    if let Some(expected) = expected {
        let now = unmerged.as_ref().ok_or_else(stale)?;
        if (&now.base, &now.current, &now.incoming)
            != (&expected.base, &expected.current, &expected.incoming)
        {
            return Err(stale());
        }
    }
    let session = describe_session(&repository, read);
    let file = session
        .files
        .into_iter()
        .find(|file| file.path == file_path && file.path_is_exact)
        .ok_or_else(stale)?;
    if !file.allowed_actions.contains(&action) {
        return Err(unavailable("This file doesn't allow that right now."));
    }
    let snapshot = create_conflict_snapshot(path, &repository, state_token, session.origin)?;
    Ok(Prepared {
        repository,
        file,
        unmerged,
        snapshot,
    })
}

/// Every index entry of one path, stage 0 included.
fn index_entries(
    path: &str,
    relative: &str,
    envs: &[(&str, &str)],
) -> Result<Vec<SnapshotStageEntry>, AppError> {
    let output = run_git_with_env(
        path,
        ["ls-files", "-s", "-z", "--", &literal(relative)],
        envs,
    )?;
    if !output.status.success() {
        return Err(unreadable());
    }
    let mut entries = Vec::new();
    for record in output.stdout.split(|byte| *byte == 0) {
        if record.is_empty() {
            continue;
        }
        let tab = record
            .iter()
            .position(|byte| *byte == b'\t')
            .ok_or_else(unreadable)?;
        if &record[tab + 1..] != relative.as_bytes() {
            continue;
        }
        let meta = std::str::from_utf8(&record[..tab]).map_err(|_| unreadable())?;
        let mut fields = meta.split(' ');
        let (Some(mode), Some(object_id), Some(stage)) =
            (fields.next(), fields.next(), fields.next())
        else {
            return Err(unreadable());
        };
        let stage = stage.parse::<u8>().map_err(|_| unreadable())?;
        if stage > 3 || !is_object_id(object_id) {
            return Err(unreadable());
        }
        entries.push(SnapshotStageEntry {
            path: relative.to_string(),
            stage,
            mode: mode.to_string(),
            object_id: object_id.to_string(),
        });
    }
    Ok(entries)
}

/// `update-index --index-info` input that removes every entry of `relative`
/// and then adds `entries` (stage 0, or stages 1–3).
pub(crate) fn index_info(
    relative: &str,
    entries: &[SnapshotStageEntry],
    hash_len: usize,
) -> Vec<u8> {
    let mut input = Vec::new();
    input.extend_from_slice(format!("0 {}\t{relative}\0", "0".repeat(hash_len)).as_bytes());
    for entry in entries {
        input.extend_from_slice(
            format!(
                "{} {} {}\t{relative}\0",
                entry.mode, entry.object_id, entry.stage
            )
            .as_bytes(),
        );
    }
    input
}

fn set_index_entries(
    path: &str,
    relative: &str,
    entries: &[SnapshotStageEntry],
    hash_len: usize,
    envs: &[(&str, &str)],
) -> Result<(), AppError> {
    let input = index_info(relative, entries, hash_len);
    let args = ["update-index", "-z", "--index-info"];
    let output = if envs.is_empty() {
        run_git_with_input_capped(path, &args, &input, 4096)?
    } else {
        run_git_with_env_and_input(path, &args, envs, &input, 4096)?
    };
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::IndexUnavailable,
            "Git couldn't update this file in its index.",
        )
        .with_remediation(
            "Another Git program may be using the project. Close it, then try again.",
        ));
    }
    Ok(())
}

fn same_entries(left: &[SnapshotStageEntry], right: &[SnapshotStageEntry]) -> bool {
    let key =
        |entry: &SnapshotStageEntry| (entry.stage, entry.mode.clone(), entry.object_id.clone());
    let mut left = left.iter().map(key).collect::<Vec<_>>();
    let mut right = right.iter().map(key).collect::<Vec<_>>();
    left.sort();
    right.sort();
    left == right
}

/// Whether the project checks links out as links. Git's own default is true;
/// on Windows an unset value is read as false, because creating a link there
/// needs a privilege most accounts lack (`git init` probes for it and writes
/// false when it is missing), and a file holding the target is what Git
/// itself writes when links are off.
fn symlinks_enabled(path: &str) -> Result<bool, AppError> {
    let output = run_git(path, &["config", "--bool", "core.symlinks"])?;
    if !output.status.success() {
        return Ok(!cfg!(windows));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim() == "true")
}

fn temporary_beside(target: &Path) -> PathBuf {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let name = target
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_default();
    target.with_file_name(format!(
        ".{name}.gitodile-{}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ))
}

#[cfg(unix)]
fn make_executable(path: &Path, executable: bool) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)?.permissions();
    let mode = permissions.mode();
    permissions.set_mode(if executable {
        mode | ((mode & 0o444) >> 2)
    } else {
        mode & !0o111
    });
    fs::set_permissions(path, permissions)
}

#[cfg(not(unix))]
fn make_executable(_path: &Path, _executable: bool) -> std::io::Result<()> {
    // Windows has no executable bit; the index keeps the mode exactly.
    Ok(())
}

#[cfg(unix)]
fn create_link(target: &str, at: &Path) -> std::io::Result<()> {
    std::os::unix::fs::symlink(target, at)
}

#[cfg(windows)]
fn create_link(target: &str, at: &Path) -> std::io::Result<()> {
    std::os::windows::fs::symlink_file(target.replace('/', "\\"), at)
}

/// Moves a finished temporary file over its target. The temporary file is
/// removed whatever happens, so a failed write leaves only the original. A
/// read-only target refuses the same way a locked one does on Windows, and
/// is reported for what it is.
fn publish(temporary: &Path, target: &Path) -> Result<(), AppError> {
    fs::rename(temporary, target).map_err(|error| {
        let _ = fs::remove_file(temporary);
        let read_only = fs::symlink_metadata(target)
            .is_ok_and(|metadata| metadata.is_file() && metadata.permissions().readonly());
        if read_only {
            AppError::new(
                AppErrorCode::PermissionDenied,
                "This file is read-only, so GitOdile couldn't change it.",
            )
            .with_remediation("Make the file writable, then try again. Nothing was changed.")
        } else {
            write_failed(&error)
        }
    })
}

fn create_parent(root: &Path, target: &Path) -> Result<(), AppError> {
    let parent = target.parent().ok_or_else(unreadable)?;
    if !parent.starts_with(root.canonicalize().map_err(|_| unreadable())?) {
        return Err(unreadable());
    }
    fs::create_dir_all(parent).map_err(|error| write_failed(&error))
}

/// Writes one stage to the working tree as Git's checkout would: a regular
/// file through the project's filters, a link as a link where the project
/// allows them and as a file holding its target where it does not.
fn write_stage(
    path: &str,
    root: &Path,
    relative: &str,
    stage: &ConflictStage,
) -> Result<(), AppError> {
    let target = exact_working_path(root, relative)?;
    if fs::symlink_metadata(&target).is_ok_and(|metadata| metadata.is_dir()) {
        return Err(unavailable("A folder is in the way of this file."));
    }
    create_parent(root, &target)?;
    let temporary = temporary_beside(&target);
    let result = (|| {
        if stage.mode == MODE_SYMLINK {
            let (_, content) = read_blob_capped(path, &stage.object_id)?;
            let link = content.ok_or_else(unreadable)?;
            if symlinks_enabled(path)? {
                let link = String::from_utf8(link).map_err(|_| unreadable())?;
                create_link(&link, &temporary).map_err(|error| write_failed(&error))?;
            } else {
                OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&temporary)
                    .and_then(|mut file| {
                        std::io::Write::write_all(&mut file, &link)?;
                        file.sync_all()
                    })
                    .map_err(|error| write_failed(&error))?;
            }
            return Ok(());
        }
        if !is_regular_file_mode(&stage.mode) {
            return Err(unavailable("This side can't be written as a file."));
        }
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| write_failed(&error))?;
        let path_argument = format!("--path={relative}");
        let output = run_git_to_file(
            path,
            &["cat-file", "--filters", &path_argument, &stage.object_id],
            file,
        )?;
        if !output.status.success() {
            return Err(git_failed(
                "Git couldn't write this side of the file.",
                &output,
            ));
        }
        // Flushing needs a handle that may write, on Windows at least.
        make_executable(&temporary, stage.mode == MODE_EXECUTABLE)
            .and_then(|_| OpenOptions::new().write(true).open(&temporary)?.sync_all())
            .map_err(|error| write_failed(&error))
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    publish(&temporary, &target)
}

fn remove_working(root: &Path, relative: &str) -> Result<(), AppError> {
    let target = exact_working_path(root, relative)?;
    match fs::symlink_metadata(&target) {
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(write_failed(&error)),
        Ok(metadata) if metadata.is_dir() => {
            Err(unavailable("A folder is in the way of this file."))
        }
        Ok(metadata) => fs::remove_file(&target)
            .or_else(|error| {
                // A Windows link to a folder is removed as a folder, though
                // it is only the link that goes.
                if cfg!(windows) && metadata.file_type().is_symlink() {
                    fs::remove_dir(&target)
                } else {
                    Err(error)
                }
            })
            .map_err(|error| write_failed(&error)),
    }
}

/// Keeps one whole side of an overlapping file, or deletes the path when a
/// side deleted it, in the working tree only: the file still overlaps until
/// it is marked resolved. A submodule has nothing on disk to write, so its
/// side is set in the index, which also marks it resolved.
pub(crate) fn resolve_conflict_side(
    path: String,
    file_path: String,
    choice: SideChoice,
    expected: ExpectedStages,
    state_token: String,
) -> Result<Option<ConflictSession>, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "resolve_conflict_side", None)?;
    let action = match choice {
        SideChoice::KeepCurrent => ConflictAction::KeepCurrent,
        SideChoice::KeepIncoming => ConflictAction::KeepIncoming,
        SideChoice::Delete => ConflictAction::Delete,
    };
    let prepared = prepare(
        &path,
        repository,
        &file_path,
        &state_token,
        Some(&expected),
        action,
    )?;
    let unmerged = prepared.unmerged.clone().ok_or_else(stale)?;
    let root = prepared.repository.worktree_root.backend_path();
    let stage = match choice {
        SideChoice::KeepCurrent => unmerged.current.clone(),
        SideChoice::KeepIncoming => unmerged.incoming.clone(),
        SideChoice::Delete => None,
    };
    let submodule = prepared.file.facets.contains(&ConflictFacet::Submodule)
        && stage
            .as_ref()
            .is_none_or(|stage| stage.mode == MODE_GITLINK);
    let journal_action = match choice {
        SideChoice::KeepCurrent => JournalAction::KeepCurrent,
        SideChoice::KeepIncoming => JournalAction::KeepIncoming,
        SideChoice::Delete => JournalAction::Delete,
    };
    let replaced_index = stage_entries(&file_path, &unmerged);
    let sequence = begin_conflict_journal_entry(
        &path,
        &prepared.repository,
        &prepared.snapshot,
        &file_path,
        journal_action,
        replaced_index.clone(),
    )?;

    if submodule {
        let entries = stage
            .iter()
            .map(|stage| SnapshotStageEntry {
                path: file_path.clone(),
                stage: 0,
                mode: stage.mode.clone(),
                object_id: stage.object_id.clone(),
            })
            .collect::<Vec<_>>();
        let hash_len = replaced_index
            .first()
            .map_or(40, |entry| entry.object_id.len());
        set_index_entries(&path, &file_path, &entries, hash_len, &[])?;
        if !same_entries(&index_entries(&path, &file_path, &[])?, &entries) {
            return Err(uncertain(
                "Git reported success, but the submodule's version isn't what was chosen.",
            ));
        }
    } else {
        match &stage {
            Some(stage) => write_stage(&path, root, &file_path, stage)?,
            None => remove_working(root, &file_path)?,
        }
        // The side was written exactly: its bytes must be what Git's filters
        // produce now, and the index must still hold the overlap.
        if !same_entries(&index_entries(&path, &file_path, &[])?, &replaced_index) {
            return Err(uncertain(
                "The file's overlap changed while GitOdile was writing it.",
            ));
        }
    }
    finish_conflict_journal_entry(
        &prepared.repository,
        &prepared.snapshot.session_id,
        sequence,
        working_state(root, &file_path),
    )?;
    fresh_session(&path, &prepared.repository)
}

/// Tells Git a file is done, as it is now. A side kept and untouched since is
/// staged as that exact stage, with its mode, because `git add` would take the
/// mode from the current side where the project ignores modes or links;
/// anything else goes through `git add`, or `git rm --cached` when the path is
/// gone, which never touches the disk. Markers left in a text file refuse
/// unless `allow_markers`.
///
/// `executable` names the permission when the sides disagree on it and the
/// file was edited rather than kept.
pub(crate) fn mark_conflict_resolved(
    path: String,
    file_path: String,
    expected: ExpectedStages,
    state_token: String,
    allow_markers: bool,
    executable: Option<bool>,
) -> Result<Option<ConflictSession>, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "mark_conflict_resolved", None)?;
    let prepared = prepare(
        &path,
        repository,
        &file_path,
        &state_token,
        Some(&expected),
        ConflictAction::MarkResolved,
    )?;
    let unmerged = prepared.unmerged.clone().ok_or_else(stale)?;
    let root = prepared.repository.worktree_root.backend_path();
    let git_dir = prepared.repository.git_dir.backend_path();
    let replaced_index = stage_entries(&file_path, &unmerged);
    let hash_len = replaced_index
        .first()
        .map_or(40, |entry| entry.object_id.len());
    let fingerprint = working_fingerprint(root, &file_path);
    let journal = read_conflict_journal(git_dir, &prepared.snapshot.session_id);
    let kept = kept_side(journal.as_ref(), &file_path, fingerprint);

    enum Plan {
        Exact(ConflictStage),
        Add,
        Remove,
    }
    let plan = match kept {
        Some(KeptSide::Current | KeptSide::Incoming) => {
            // The fingerprint matches; the bytes must too.
            let written = journal
                .as_ref()
                .and_then(|journal| last_written(journal, &file_path))
                .and_then(|entry| entry.left.clone())
                .ok_or_else(stale)?;
            if working_state(root, &file_path).sha256 != written.sha256 {
                return Err(stale());
            }
            let stage = if kept == Some(KeptSide::Current) {
                unmerged.current.clone()
            } else {
                unmerged.incoming.clone()
            };
            Plan::Exact(stage.ok_or_else(stale)?)
        }
        Some(KeptSide::Deleted) => Plan::Remove,
        None => match fingerprint.kind {
            WorkingKind::Absent => Plan::Remove,
            WorkingKind::File | WorkingKind::SymbolicLink => {
                if fingerprint.kind == WorkingKind::File && !allow_markers {
                    if let MarkerScan::Found { blocks } =
                        scan_working_markers(&root.join(&file_path))
                    {
                        return Err(AppError::new(
                            AppErrorCode::ConflictMarkersRemain,
                            format!(
                                "This file still has {blocks} overlapping part(s) marked in it."
                            ),
                        )
                        .with_remediation(
                            "Edit them out in your editor, or mark the file resolved anyway.",
                        ));
                    }
                }
                if prepared.file.facets.contains(&ConflictFacet::ModeChange) && executable.is_none()
                {
                    return Err(AppError::new(
                        AppErrorCode::ConflictChoiceNeeded,
                        "The two sides disagree on whether this file runs as a program.",
                    )
                    .with_remediation("Choose which permission to keep, then mark it resolved."));
                }
                Plan::Add
            }
            WorkingKind::Directory | WorkingKind::Other => {
                return Err(unavailable("A folder is in the way of this file."));
            }
        },
    };

    let sequence = begin_conflict_journal_entry(
        &path,
        &prepared.repository,
        &prepared.snapshot,
        &file_path,
        JournalAction::MarkResolved,
        replaced_index,
    )?;
    let pathspec = literal(&file_path);
    let expected_entry = match &plan {
        Plan::Exact(stage) => {
            let entry = SnapshotStageEntry {
                path: file_path.clone(),
                stage: 0,
                mode: stage.mode.clone(),
                object_id: stage.object_id.clone(),
            };
            set_index_entries(
                &path,
                &file_path,
                std::slice::from_ref(&entry),
                hash_len,
                &[],
            )?;
            Some(entry)
        }
        Plan::Add => {
            // The chosen permission goes in with the content, in one
            // command, so the file is never staged with the other one.
            let mut args = vec!["add"];
            match executable {
                Some(true) => args.push("--chmod=+x"),
                Some(false) => args.push("--chmod=-x"),
                None => {}
            }
            args.extend(["--", pathspec.as_str()]);
            let output = run_git(&path, &args)?;
            if !output.status.success() {
                return Err(git_failed("Git couldn't mark this file resolved.", &output));
            }
            None
        }
        Plan::Remove => {
            let output = run_git(&path, &["rm", "--cached", "--quiet", "--", &pathspec])?;
            if !output.status.success() {
                return Err(git_failed("Git couldn't mark this file resolved.", &output));
            }
            None
        }
    };

    let entries = index_entries(&path, &file_path, &[])?;
    let verified = match (&plan, expected_entry) {
        (_, Some(entry)) => same_entries(&entries, std::slice::from_ref(&entry)),
        (Plan::Remove, None) => entries.is_empty(),
        _ => {
            let wanted_mode = executable.map(|executable| {
                if executable {
                    MODE_EXECUTABLE
                } else {
                    "100644"
                }
            });
            matches!(entries.as_slice(), [entry] if entry.stage == 0
                && wanted_mode.is_none_or(|mode| entry.mode == mode))
        }
    };
    if !verified {
        return Err(uncertain(
            "Git reported success, but the file isn't recorded as resolved as expected.",
        ));
    }
    finish_conflict_journal_entry(
        &prepared.repository,
        &prepared.snapshot.session_id,
        sequence,
        working_state(root, &file_path),
    )?;
    fresh_session(&path, &prepared.repository)
}

/// Copies the snapshot's bytes of a path beside it, checking them against
/// the hash the snapshot recorded, and moves them over the working path. The
/// copy gets the original's modification time back, so the session reads
/// the file as untouched again rather than as edited since.
fn restore_snapshot_file(
    source: &Path,
    root: &Path,
    relative: &str,
    executable: bool,
    sha256: &str,
    modified_ns: u128,
) -> Result<(), AppError> {
    let target = exact_working_path(root, relative)?;
    create_parent(root, &target)?;
    let temporary = temporary_beside(&target);
    let result = fs::copy(source, &temporary)
        .map_err(|error| write_failed(&error))
        .and_then(|_| {
            let copied = file_sha256(&temporary).map_err(|error| write_failed(&error))?;
            if copied != sha256 {
                return Err(AppError::new(
                    AppErrorCode::RecoveryUnavailable,
                    "The snapshot's copy of this file is damaged.",
                )
                .with_remediation(
                    "Nothing was changed. Reset only the overlap, or fix the file yourself.",
                ));
            }
            let modified = std::time::UNIX_EPOCH
                + std::time::Duration::from_nanos(u64::try_from(modified_ns).unwrap_or(0));
            make_executable(&temporary, executable)
                .and_then(|_| {
                    let file = OpenOptions::new().write(true).open(&temporary)?;
                    file.set_modified(modified)?;
                    file.sync_all()
                })
                .map_err(|error| write_failed(&error))
        });
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    publish(&temporary, &target)
}

/// Puts one file back as the merge left it: its original stages in the
/// index and its original working content, both from the session snapshot.
/// What the file holds now is copied into the journal first.
///
/// With `stages_only`, only the index is reset: the choice for a file whose
/// working content the snapshot could not keep.
pub(crate) fn reset_conflict_file(
    path: String,
    file_path: String,
    state_token: String,
    stages_only: bool,
) -> Result<Option<ConflictSession>, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "reset_conflict_file", None)?;
    let prepared = prepare(
        &path,
        repository,
        &file_path,
        &state_token,
        None,
        ConflictAction::ResetFile,
    )?;
    let root = prepared.repository.worktree_root.backend_path();
    let git_dir = prepared.repository.git_dir.backend_path();
    let snapshot = &prepared.snapshot;
    let original = snapshot
        .entries
        .iter()
        .filter(|entry| entry.path == file_path)
        .cloned()
        .collect::<Vec<_>>();
    let (captured, captured_modified_ns) = snapshot
        .paths
        .iter()
        .find(|item| item.path == file_path)
        .map(|item| (item.working.clone(), item.modified_ns))
        .ok_or_else(|| {
            AppError::new(
                AppErrorCode::RecoveryUnavailable,
                "GitOdile has no original of this file to go back to.",
            )
        })?;
    if original.is_empty() {
        return Err(AppError::new(
            AppErrorCode::RecoveryUnavailable,
            "GitOdile has no original of this file to go back to.",
        ));
    }
    let working_now = working_fingerprint(root, &file_path).kind;
    if !stages_only {
        let restorable = match &captured {
            SnapshotWorking::File { .. }
            | SnapshotWorking::SymbolicLink { .. }
            | SnapshotWorking::Absent => working_now != WorkingKind::Directory,
            SnapshotWorking::Directory => working_now == WorkingKind::Directory,
            SnapshotWorking::Unreadable | SnapshotWorking::Omitted => false,
        };
        if !restorable {
            return Err(AppError::new(
                AppErrorCode::ConflictContentNotKept,
                "The snapshot couldn't keep this file's original content.",
            )
            .with_remediation(
                "Nothing was changed. You can still put back the overlap without the content.",
            ));
        }
    }
    let hash_len = original[0].object_id.len();

    // Prove the stages on a copy of the index before the real one.
    let copy = copy_project_index(&path)?;
    let copy_path = copy.path.to_string_lossy().to_string();
    let envs = [("GIT_INDEX_FILE", copy_path.as_str())];
    set_index_entries(&path, &file_path, &original, hash_len, &envs)?;
    let proved = index_entries(&path, &file_path, &envs)?;
    drop(copy);
    if !same_entries(&proved, &original) {
        return Err(AppError::new(
            AppErrorCode::IndexRestoreFailed,
            "Git wouldn't take this file's original overlap back.",
        )
        .with_remediation("Nothing was changed."));
    }

    let replaced_index = index_entries(&path, &file_path, &[])?;
    let sequence = begin_conflict_journal_entry(
        &path,
        &prepared.repository,
        snapshot,
        &file_path,
        JournalAction::Reset,
        replaced_index,
    )?;
    // The working file first: it is what another program may hold open, and
    // failing there leaves the index as it was.
    if !stages_only {
        match &captured {
            SnapshotWorking::File {
                sequence,
                executable,
                sha256,
            } => restore_snapshot_file(
                &conflict_snapshot_file(git_dir, &snapshot.session_id, *sequence),
                root,
                &file_path,
                *executable,
                sha256,
                captured_modified_ns,
            )?,
            SnapshotWorking::SymbolicLink { target } => {
                let at = exact_working_path(root, &file_path)?;
                create_parent(root, &at)?;
                let temporary = temporary_beside(&at);
                create_link(target, &temporary).map_err(|error| write_failed(&error))?;
                publish(&temporary, &at)?;
            }
            SnapshotWorking::Absent => remove_working(root, &file_path)?,
            SnapshotWorking::Directory | SnapshotWorking::Unreadable | SnapshotWorking::Omitted => {
            }
        }
    }
    set_index_entries(&path, &file_path, &original, hash_len, &[]).map_err(|error| {
        if stages_only {
            error
        } else {
            uncertain(
                "The file's content is back, but Git's index couldn't take its overlap back. Reset it again.",
            )
        }
    })?;
    if !same_entries(&index_entries(&path, &file_path, &[])?, &original) {
        return Err(uncertain(
            "Git reported success, but the file's overlap isn't what it was.",
        ));
    }
    finish_conflict_journal_entry(
        &prepared.repository,
        &snapshot.session_id,
        sequence,
        working_state(root, &file_path),
    )?;
    fresh_session(&path, &prepared.repository)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn index_info_removes_the_path_before_adding_its_entries() {
        let entry = |stage: u8, object_id: &str| SnapshotStageEntry {
            path: "a b.txt".to_string(),
            stage,
            mode: "100644".to_string(),
            object_id: object_id.to_string(),
        };
        let one = "1".repeat(40);
        let two = "2".repeat(40);
        let input = index_info("a b.txt", &[entry(1, &one), entry(2, &two)], 40);
        assert_eq!(
            input,
            format!(
                "0 {}\ta b.txt\0100644 {one} 1\ta b.txt\0100644 {two} 2\ta b.txt\0",
                "0".repeat(40)
            )
            .into_bytes()
        );
    }
}
