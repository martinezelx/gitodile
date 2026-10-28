//! Conflict sessions and their snapshots against real paused operations
//! (ADR 0041). Each fixture builds one conflicted repository and asks every
//! question it can of it, because a Git process costs about 50 ms on Windows.

use crate::changes::{DiffLineKind, FileDiff};
use crate::conflicts::*;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{git_command, in_test_frame};
use crate::recovery::*;
use crate::repository::git_operation_in_progress;
use crate::repository_access::{self, AccessMode, RepositoryContext};
use crate::status::ChangeCategory;
use crate::test_support::*;
use std::fs;
use std::path::Path;
use std::process::Output;

const SUB_BASE: &str = "1111111111111111111111111111111111111111";
const SUB_FEATURE: &str = "2222222222222222222222222222222222222222";
const SUB_MAIN: &str = "3333333333333333333333333333333333333333";

fn git(path: &str, args: &[&str]) -> Output {
    git_command(path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
        ])
        .args(args)
        .output()
        .expect("run git")
}

fn git_ok(path: &str, args: &[&str]) -> String {
    let output = git(path, args);
    assert!(
        output.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

fn write_bytes(path: &str, name: &str, bytes: &[u8]) {
    fs::write(Path::new(path).join(name), bytes).unwrap();
}

fn link_blob(path: &str, target: &str) -> String {
    let output = git_command(path)
        .args(["hash-object", "-w", "--stdin"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write;
            child.stdin.take().unwrap().write_all(target.as_bytes())?;
            child.wait_with_output()
        })
        .unwrap();
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

/// One side of the fixture: every file it writes, deletes, and the symbolic
/// link and submodule entries it records straight into the index.
struct Side<'a> {
    files: &'a [(&'a str, &'a [u8])],
    removed: &'a [&'a str],
    link_target: &'a str,
    submodule: &'a str,
    executable: Option<&'a str>,
    message: &'a str,
}

fn commit_side(path: &str, side: &Side<'_>) {
    for (name, bytes) in side.files {
        write_bytes(path, name, bytes);
    }
    let mut add = vec!["add", "--"];
    add.extend(side.files.iter().map(|(name, _)| *name));
    git_ok(path, &add);
    if !side.removed.is_empty() {
        let mut remove = vec!["rm", "-q", "--"];
        remove.extend(side.removed);
        git_ok(path, &remove);
    }
    let link = format!("120000,{},link", link_blob(path, side.link_target));
    let submodule = format!("160000,{},sub", side.submodule);
    let mut index = vec![
        "update-index",
        "--add",
        "--cacheinfo",
        &link,
        "--cacheinfo",
        &submodule,
    ];
    if let Some(name) = side.executable {
        index.extend(["--chmod=+x", name]);
    }
    git_ok(path, &index);
    // Keep the working link in step with the index, or the next merge would
    // refuse to overwrite it.
    git_ok(path, &["checkout", "-q", "--", "link"]);
    git_ok(path, &["commit", "-q", "-m", side.message]);
}

/// A merge of `feature` into `main` paused on ten overlapping paths, one per
/// conflict class GitOdile represents.
fn conflicted_merge(label: &str) -> String {
    let path = unique_temp_dir(label);
    git_ok(&path, &["init", "-q", "-b", "main"]);
    git_ok(&path, &["config", "core.autocrlf", "false"]);
    commit_side(
        &path,
        &Side {
            files: &[
                ("content.txt", b"a\nb\nc\n"),
                ("modify-delete.txt", b"keep\n"),
                ("delete-modify.txt", b"keep\n"),
                ("mode.sh", b"echo\n"),
                ("spaced \u{f1}ame.txt", b"base\n"),
                ("crlf.txt", b"one\r\ntwo\r\n"),
                ("bin.dat", b"\0\x01\x02\0"),
            ],
            removed: &[],
            link_target: "target-a",
            submodule: SUB_BASE,
            executable: None,
            message: "base",
        },
    );
    git_ok(&path, &["checkout", "-q", "-b", "feature"]);
    commit_side(
        &path,
        &Side {
            files: &[
                ("content.txt", b"a\nFEATURE\nc\n"),
                ("delete-modify.txt", b"feature\n"),
                ("mode.sh", b"echo feature\n"),
                ("spaced \u{f1}ame.txt", b"feature\n"),
                ("crlf.txt", b"one\r\nfeature\r\n"),
                ("bin.dat", b"\0\x09\x09\0"),
                ("new.txt", b"feature new\n"),
            ],
            removed: &["modify-delete.txt"],
            link_target: "target-b",
            submodule: SUB_FEATURE,
            executable: Some("mode.sh"),
            message: "feature",
        },
    );
    git_ok(&path, &["checkout", "-q", "-f", "main"]);
    commit_side(
        &path,
        &Side {
            files: &[
                ("content.txt", b"a\nMAIN\nc\n"),
                ("modify-delete.txt", b"main\n"),
                ("mode.sh", b"echo main\n"),
                ("spaced \u{f1}ame.txt", b"main\n"),
                ("crlf.txt", b"one\r\nmain\r\n"),
                ("bin.dat", b"\0\x07\x07\0"),
                ("new.txt", b"main new\n"),
            ],
            removed: &["delete-modify.txt"],
            link_target: "target-c",
            submodule: SUB_MAIN,
            executable: None,
            message: "main",
        },
    );
    assert!(!git(&path, &["merge", "feature"]).status.success());
    assert!(Path::new(&path).join(".git/MERGE_HEAD").is_file());
    path
}

fn file<'a>(session: &'a ConflictSession, name: &str) -> &'a ConflictFile {
    session
        .files
        .iter()
        .find(|file| file.path == name)
        .unwrap_or_else(|| panic!("{name} is not in the session"))
}

fn session(path: &str) -> ConflictSession {
    read_conflict_session(path.to_string()).unwrap().unwrap()
}

fn context(path: &str) -> RepositoryContext {
    RepositoryContext::discover(Path::new(path)).unwrap()
}

fn snapshot(path: &str, token: &str) -> Result<ConflictSnapshotManifest, AppError> {
    let repository = context(path);
    let _guard = repository_access::global()
        .acquire(&repository, AccessMode::Write, None)
        .unwrap();
    in_test_frame(|| create_conflict_snapshot(path, &repository, token, ConflictOrigin::External))
}

fn git_metadata(path: &str) -> Vec<Vec<u8>> {
    ["index", "MERGE_HEAD", "MERGE_MSG", "MERGE_MODE"]
        .iter()
        .map(|name| fs::read(Path::new(path).join(".git").join(name)).unwrap_or_default())
        .collect()
}

#[test]
fn a_paused_merge_is_read_by_class_without_writing_anything() {
    let path = conflicted_merge("conflict-read-classes");
    let before = git_metadata(&path);
    let session = session(&path);

    assert_eq!(session.operation.kind, PausedOperationKind::Merge);
    assert!(session.operation.supported);
    assert_eq!(session.operation.current.name.as_deref(), Some("main"));
    assert_eq!(
        session.operation.current.commit.as_deref(),
        Some(git_ok(&path, &["rev-parse", "HEAD"]).as_str())
    );
    assert_eq!(session.operation.incoming.name.as_deref(), Some("feature"));
    assert_eq!(session.origin, ConflictOrigin::External);
    assert_eq!(session.unresolved_count, 10);
    assert!(session.listing_complete);
    assert_eq!(session.allowed_actions, [SessionAction::AbortMerge]);
    for (name, shape, facets) in [
        ("content.txt", ConflictShape::BothChanged, &[][..]),
        ("modify-delete.txt", ConflictShape::DeletedByIncoming, &[]),
        ("delete-modify.txt", ConflictShape::DeletedByCurrent, &[]),
        (
            "mode.sh",
            ConflictShape::BothChanged,
            &[ConflictFacet::ModeChange],
        ),
        ("spaced \u{f1}ame.txt", ConflictShape::BothChanged, &[]),
        ("new.txt", ConflictShape::BothAdded, &[]),
        (
            "link",
            ConflictShape::BothChanged,
            &[ConflictFacet::SymbolicLink],
        ),
        (
            "sub",
            ConflictShape::BothChanged,
            &[ConflictFacet::Submodule],
        ),
    ] {
        let found = file(&session, name);
        assert_eq!(
            (found.shape, found.facets.as_slice()),
            (shape, facets),
            "{name}"
        );
        assert_eq!(found.state, ConflictFileState::Unresolved, "{name}");
    }
    assert_eq!(
        file(&session, "modify-delete.txt").allowed_actions,
        [
            ConflictAction::KeepCurrent,
            ConflictAction::Delete,
            ConflictAction::OpenInEditor,
            ConflictAction::MarkResolved
        ]
    );
    assert!(!file(&session, "sub")
        .allowed_actions
        .contains(&ConflictAction::OpenInEditor));

    let stage = |name: &str, number: u8| {
        let found = file(&session, name);
        let side = match number {
            1 => &found.base,
            2 => &found.current,
            _ => &found.incoming,
        };
        read_conflict_stage(
            path.clone(),
            name.to_string(),
            number,
            side.as_ref().unwrap().object_id.clone(),
        )
    };
    let crlf = stage("crlf.txt", 2).unwrap();
    assert_eq!(
        (crlf.kind, crlf.line_endings, crlf.text.as_deref()),
        (
            StageContentKind::Text,
            Some(LineEndings::Crlf),
            Some("one\r\nmain\r\n")
        )
    );
    assert_eq!(stage("bin.dat", 3).unwrap().kind, StageContentKind::Binary);
    assert_eq!(stage("sub", 2).unwrap().kind, StageContentKind::Submodule);
    let link = stage("link", 3).unwrap();
    assert_eq!(
        (link.kind, link.text.as_deref()),
        (StageContentKind::SymbolicLink, Some("target-b"))
    );
    assert_eq!(
        stage("spaced \u{f1}ame.txt", 1).unwrap().text.as_deref(),
        Some("base\n")
    );
    let other_side = file(&session, "content.txt").incoming.clone().unwrap();
    let wrong = read_conflict_stage(path.clone(), "content.txt".into(), 2, other_side.object_id);
    assert_eq!(wrong.unwrap_err().code, AppErrorCode::StaleConflictSession);
    assert!(read_conflict_stage(path.clone(), "content.txt".into(), 4, SUB_BASE.into()).is_err());
    assert!(read_conflict_stage(path.clone(), "../escape".into(), 1, SUB_BASE.into()).is_err());

    // What each side changed against the base, as the Changes tab's diff.
    let side_diff = |name: &str, side: ConflictSide| {
        let found = file(&session, name);
        let changed = match side {
            ConflictSide::Current => &found.current,
            ConflictSide::Incoming => &found.incoming,
        };
        read_conflict_side_diff(
            path.clone(),
            name.to_string(),
            side,
            found.base.as_ref().map(|stage| stage.object_id.clone()),
            changed.as_ref().unwrap().object_id.clone(),
        )
    };
    let changed_lines = |diff: FileDiff| match diff {
        FileDiff::Text { hunks, change, .. } => (
            change,
            hunks
                .into_iter()
                .flat_map(|hunk| hunk.lines)
                .filter(|line| line.kind != DiffLineKind::Context)
                .map(|line| line.content)
                .collect::<Vec<_>>(),
        ),
        other => panic!("expected a text diff, got {other:?}"),
    };
    assert_eq!(
        changed_lines(side_diff("content.txt", ConflictSide::Current).unwrap()),
        (ChangeCategory::Changed, vec!["b".into(), "MAIN".into()])
    );
    assert_eq!(
        changed_lines(side_diff("new.txt", ConflictSide::Incoming).unwrap()),
        (ChangeCategory::New, vec!["feature new".into()])
    );
    assert!(matches!(
        side_diff("bin.dat", ConflictSide::Incoming).unwrap(),
        FileDiff::Binary { .. }
    ));
    assert_eq!(
        side_diff("link", ConflictSide::Current).unwrap_err().code,
        AppErrorCode::InvalidSelection
    );
    let content = file(&session, "content.txt");
    let crossed = read_conflict_side_diff(
        path.clone(),
        "content.txt".into(),
        ConflictSide::Current,
        content.base.as_ref().map(|stage| stage.object_id.clone()),
        content.incoming.as_ref().unwrap().object_id.clone(),
    );
    assert_eq!(
        crossed.unwrap_err().code,
        AppErrorCode::StaleConflictSession
    );

    assert_eq!(git_metadata(&path), before, "reading must not write");
    assert!(!Path::new(&path).join(".git/index.lock").exists());
    assert!(!Path::new(&path).join(".git/gitodile").exists());
    assert_eq!(
        in_test_frame(|| git_operation_in_progress(&path)).unwrap(),
        Some("merge")
    );

    // A changed working file or a resolved path makes the token stale.
    write_file(&path, "content.txt", "edited by hand, longer than before\n");
    let edited = self::session(&path);
    assert_ne!(edited.state_token, session.state_token);
    assert_eq!(
        snapshot(&path, &session.state_token).unwrap_err().code,
        AppErrorCode::StaleConflictSession
    );
    assert!(!Path::new(&path).join(".git/gitodile").exists());

    // A path past the byte budget is recorded as omitted, never dropped.
    let repository = context(&path);
    let _guard = repository_access::global()
        .acquire(&repository, AccessMode::Write, None)
        .unwrap();
    let partial = in_test_frame(|| {
        create_conflict_snapshot_within(&path, &repository, &edited.state_token, 4)
    })
    .unwrap();
    assert!(!partial.complete);
    let omitted = partial
        .paths
        .iter()
        .find(|item| item.path == "content.txt")
        .unwrap();
    assert_eq!(omitted.working, SnapshotWorking::Omitted);
    let _ = fs::remove_dir_all(path);
}

#[test]
fn the_first_snapshot_is_durable_pinned_and_drives_file_states() {
    let path = conflicted_merge("conflict-snapshot");
    let first = session(&path);
    let root = conflict_snapshot_root(&Path::new(&path).join(".git"));
    fs::create_dir_all(root.join(".pending-1-1-1/files")).unwrap();
    let fresh_pending = root.join(format!(".pending-{}-1-1", u128::MAX / 2));
    fs::create_dir_all(&fresh_pending).unwrap();

    let repository = context(&path);
    let unlocked = in_test_frame(|| {
        create_conflict_snapshot(
            &path,
            &repository,
            &first.state_token,
            ConflictOrigin::External,
        )
    });
    assert_eq!(unlocked.unwrap_err().code, AppErrorCode::GitCommandFailed);

    let manifest = snapshot(&path, &first.state_token).unwrap();
    assert!(manifest.complete);
    assert_eq!(manifest.schema_version, CONFLICT_SNAPSHOT_SCHEMA_VERSION);
    assert_eq!(manifest.paths.len(), 10);
    assert!(
        !root.join(".pending-1-1-1").exists(),
        "abandoned creation is removed"
    );
    assert!(
        fresh_pending.exists(),
        "a creation that may still run is left alone"
    );
    let record = root.join(&first.session_id);
    let content = manifest
        .paths
        .iter()
        .find(|item| item.path == "content.txt")
        .unwrap();
    let SnapshotWorking::File { sequence, .. } = &content.working else {
        panic!("content.txt was captured as {:?}", content.working);
    };
    assert_eq!(
        fs::read(record.join("files").join(sequence.to_string())).unwrap(),
        fs::read(Path::new(&path).join("content.txt")).unwrap()
    );
    let pin = manifest.pin_reference.clone().unwrap();
    assert_eq!(git_ok(&path, &["cat-file", "-t", &pin]), "tree");
    let pinned = git_ok(&path, &["ls-tree", "--object-only", &pin]);
    let blob = file(&first, "content.txt")
        .current
        .clone()
        .unwrap()
        .object_id;
    assert!(pinned.lines().any(|line| line == blob));

    // Snapshotting again returns the original, untouched.
    assert_eq!(snapshot(&path, &first.state_token).unwrap(), manifest);

    git_ok(&path, &["add", "--", "content.txt"]);
    write_bytes(&path, "crlf.txt", b"resolved in an editor\r\n");
    let later = session(&path);
    assert_eq!(later.session_id, first.session_id);
    assert_ne!(
        later.state_token, first.state_token,
        "a staged path is stale"
    );
    assert_eq!(later.unresolved_count, 9);
    let resolved = file(&later, "content.txt");
    assert_eq!(resolved.state, ConflictFileState::MarkedResolved);
    assert_eq!(resolved.allowed_actions, [ConflictAction::ResetFile]);
    let edited = file(&later, "crlf.txt");
    assert_eq!(edited.state, ConflictFileState::EditedOutside);
    assert!(edited.allowed_actions.contains(&ConflictAction::ResetFile));
    assert!(later
        .snapshot
        .as_ref()
        .is_some_and(|summary| summary.complete));
    let _ = fs::remove_dir_all(path);
}

#[test]
fn other_paused_operations_are_explained_but_never_offered_an_action() {
    let path = unique_temp_dir("conflict-other-operations");
    git_ok(&path, &["init", "-q", "-b", "main"]);
    write_file(&path, "f.txt", "base\n");
    git_add(&path, "f.txt");
    git_commit(&path, "base");
    git_ok(&path, &["checkout", "-q", "-b", "other"]);
    write_file(&path, "f.txt", "other\n");
    git_commit_all(&path, "other");
    git_ok(&path, &["checkout", "-q", "main"]);
    write_file(&path, "f.txt", "main\n");
    git_commit_all(&path, "main");

    let unsupported = |expected: PausedOperationKind, abort: &[&str]| {
        let session = session(&path);
        assert_eq!(session.operation.kind, expected);
        assert!(!session.operation.supported);
        assert!(session.allowed_actions.is_empty());
        assert_eq!(session.files.len(), 1);
        assert!(session.files[0].allowed_actions.is_empty());
        if !abort.is_empty() {
            git_ok(&path, abort);
        }
        session
    };

    assert!(!git(&path, &["cherry-pick", "other"]).status.success());
    assert_eq!(
        in_test_frame(|| git_operation_in_progress(&path)).unwrap(),
        Some("cherry-pick")
    );
    let picked = unsupported(PausedOperationKind::CherryPick, &["cherry-pick", "--abort"]);
    assert_eq!(
        picked.operation.abort_command.as_deref(),
        Some("git cherry-pick --abort")
    );

    assert!(!git(&path, &["revert", "--no-edit", "other"])
        .status
        .success());
    unsupported(PausedOperationKind::Revert, &["revert", "--abort"]);

    git_ok(&path, &["checkout", "-q", "other"]);
    assert!(!git(&path, &["rebase", "main"]).status.success());
    let rebase = unsupported(PausedOperationKind::Rebase, &["rebase", "--abort"]);
    assert_eq!(
        rebase.operation.step,
        Some(OperationStep {
            current: 1,
            total: 1
        })
    );
    assert_eq!(rebase.operation.current.name.as_deref(), Some("main"));
    // Detached while it replays: a commit, no branch of its own.
    assert!(rebase.operation.current.commit.is_some());
    assert_eq!(rebase.operation.incoming.name.as_deref(), Some("other"));
    git_ok(&path, &["checkout", "-q", "main"]);

    assert!(!git(&path, &["merge", "other"]).status.success());
    let merge_head = Path::new(&path).join(".git/MERGE_HEAD");
    let mut heads = fs::read_to_string(&merge_head).unwrap();
    heads.push_str(&format!("{}\n", git_ok(&path, &["rev-parse", "HEAD~1"])));
    fs::write(&merge_head, heads).unwrap();
    let octopus = unsupported(PausedOperationKind::Merge, &["merge", "--abort"]);
    assert_eq!(
        octopus.operation.unsupported_reason,
        Some(UnsupportedOperationReason::SeveralMergeHeads)
    );

    write_file(&path, "f.txt", "set aside\n");
    git_ok(&path, &["stash", "-q"]);
    write_file(&path, "f.txt", "after\n");
    git_commit_all(&path, "after");
    assert!(!git(&path, &["stash", "pop", "-q"]).status.success());
    let popped = unsupported(PausedOperationKind::Unmerged, &[]);
    assert_eq!(popped.operation.continue_command, None);
    assert_eq!(
        in_test_frame(|| git_operation_in_progress(&path)).unwrap(),
        None
    );
    let _ = fs::remove_dir_all(path);
}

#[test]
fn linked_worktrees_own_their_sessions_and_share_the_common_lock() {
    let path = unique_temp_dir("conflict-linked");
    git_ok(&path, &["init", "-q", "-b", "main"]);
    write_file(&path, "f.txt", "base\n");
    git_add(&path, "f.txt");
    git_commit(&path, "base");
    git_ok(&path, &["checkout", "-q", "-b", "other"]);
    write_file(&path, "f.txt", "other\n");
    git_commit_all(&path, "other");
    git_ok(&path, &["checkout", "-q", "main"]);
    write_file(&path, "f.txt", "main\n");
    git_commit_all(&path, "main");
    let linked = format!("{path}-linked");
    let _ = fs::remove_dir_all(&linked);
    git_ok(
        &path,
        &["worktree", "add", "-q", "-b", "linked", &linked, "main"],
    );
    assert!(!git(&linked, &["merge", "other"]).status.success());

    assert_eq!(read_conflict_session(path.clone()).unwrap(), None);
    let linked_session = session(&linked);
    assert!(linked_session.operation.supported);

    let main_context = context(&path);
    let linked_context = context(&linked);
    assert_eq!(
        main_context.common_git_dir.match_key(),
        linked_context.common_git_dir.match_key()
    );
    // The write lock is the common repository's: holding it through the main
    // worktree is what authorizes a snapshot in the linked one.
    let _guard = repository_access::global()
        .acquire(&main_context, AccessMode::Write, None)
        .unwrap();
    let manifest = in_test_frame(|| {
        create_conflict_snapshot(
            &linked,
            &linked_context,
            &linked_session.state_token,
            ConflictOrigin::External,
        )
    })
    .unwrap();
    let linked_git_dir = linked_context.git_dir.backend_path();
    assert!(read_conflict_snapshot(linked_git_dir, &manifest.session_id).is_some());
    assert!(!Path::new(&path).join(".git/gitodile/conflicts").exists());
    let pin = manifest.pin_reference.unwrap();
    assert!(pin.starts_with("refs/gitodile/recovery/v1/conflict/worktree-"));
    assert!(pin.ends_with(&linked_session.session_id));
    assert_eq!(git_ok(&path, &["cat-file", "-t", &pin]), "tree");
    drop(_guard);
    let _ = fs::remove_dir_all(&linked);
    let _ = fs::remove_dir_all(path);
}

fn git_commit_all(path: &str, message: &str) {
    git_ok(path, &["commit", "-q", "-a", "-m", message]);
}
