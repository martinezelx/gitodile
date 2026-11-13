//! Conflict sessions and their snapshots against real paused operations
//! (ADR 0041). Each fixture builds one conflicted repository and asks every
//! question it can of it, because a Git process costs about 50 ms on Windows.

use crate::changes::{DiffLineKind, FileDiff};
use crate::conflicts::merge;
use crate::conflicts::resolve::*;
use crate::conflicts::*;
use crate::error::{AppError, AppErrorCode};
use crate::git_command::{git_command, in_test_frame};
use crate::recovery::*;
use crate::repository::git_operation_in_progress;
use crate::repository_access::{self, AccessMode, RepositoryContext};
use crate::status::{read_working_tree_status, ChangeCategory};
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

fn expected(file: &ConflictFile) -> ExpectedStages {
    ExpectedStages {
        base: file.base.clone(),
        current: file.current.clone(),
        incoming: file.incoming.clone(),
    }
}

/// `(stage, mode, object)` of every index entry of one path.
fn index_of(path: &str, name: &str) -> Vec<(u8, String, String)> {
    let output = git(
        path,
        &["ls-files", "-s", "-z", "--", &format!(":(literal){name}")],
    );
    output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .map(|record| {
            let text = String::from_utf8_lossy(record);
            let (meta, _) = text.split_once('\t').unwrap();
            let mut fields = meta.split(' ');
            let mode = fields.next().unwrap().to_string();
            let object = fields.next().unwrap().to_string();
            (fields.next().unwrap().parse().unwrap(), mode, object)
        })
        .collect()
}

fn keep(
    path: &str,
    session: &ConflictSession,
    name: &str,
    choice: SideChoice,
) -> Result<ConflictSession, AppError> {
    resolve_conflict_side(
        path.to_string(),
        name.to_string(),
        choice,
        expected(file(session, name)),
        session.state_token.clone(),
    )
    .map(Option::unwrap)
}

fn mark(
    path: &str,
    session: &ConflictSession,
    name: &str,
    allow_markers: bool,
) -> Result<ConflictSession, AppError> {
    mark_conflict_resolved(
        path.to_string(),
        name.to_string(),
        expected(file(session, name)),
        session.state_token.clone(),
        allow_markers,
        None,
    )
    .map(Option::unwrap)
}

fn reset(path: &str, session: &ConflictSession, name: &str) -> Result<ConflictSession, AppError> {
    reset_conflict_file(
        path.to_string(),
        name.to_string(),
        session.state_token.clone(),
        false,
    )
    .map(Option::unwrap)
}

// About 10 s alone on Windows: one fixture walks every action through every
// class it holds, and each action re-reads the session to prove it current.
#[test]
fn each_file_is_kept_marked_and_reset_exactly() {
    let path = conflicted_merge("conflict-resolve");
    let read_bytes = |name: &str| fs::read(Path::new(&path).join(name)).unwrap();
    let untouched = ["new.txt", "bin.dat"].map(|name| (name, read_bytes(name)));
    let first = session(&path);
    let crlf = file(&first, "crlf.txt").clone();
    let crlf_original = read_bytes("crlf.txt");

    // Keeping a side writes it through Git's filters and leaves the overlap.
    let kept = keep(&path, &first, "crlf.txt", SideChoice::KeepIncoming).unwrap();
    assert_eq!(read_bytes("crlf.txt"), b"one\r\nfeature\r\n");
    let now = file(&kept, "crlf.txt");
    assert_eq!(
        (now.kept, now.state),
        (Some(KeptSide::Incoming), ConflictFileState::EditedOutside)
    );
    assert_eq!(index_of(&path, "crlf.txt").len(), 3, "still overlapping");
    assert!(
        kept.snapshot.is_some(),
        "the first change took the snapshot"
    );

    // The token the screen read before that is stale now: nothing changes.
    let content_before = read_bytes("content.txt");
    assert_eq!(
        keep(&path, &first, "content.txt", SideChoice::KeepCurrent)
            .unwrap_err()
            .code,
        AppErrorCode::StaleConflictSession
    );
    assert_eq!(read_bytes("content.txt"), content_before);

    // Marking it resolved stages exactly the kept stage.
    let marked = mark(&path, &kept, "crlf.txt", false).unwrap();
    let incoming = crlf.incoming.clone().unwrap();
    assert_eq!(
        index_of(&path, "crlf.txt"),
        [(0, incoming.mode.clone(), incoming.object_id.clone())]
    );
    assert_eq!(
        file(&marked, "crlf.txt").state,
        ConflictFileState::MarkedResolved
    );
    // Its sides still read from the snapshot once the index holds stage 0.
    let side = read_conflict_side_diff(
        path.clone(),
        "crlf.txt".to_string(),
        ConflictSide::Incoming,
        crlf.base.as_ref().map(|stage| stage.object_id.clone()),
        incoming.object_id.clone(),
    );
    assert!(matches!(side, Ok(FileDiff::Text { .. })), "{side:?}");

    // The executable side keeps its mode in the index, whatever the file
    // system can say about it; a link stays a link in the index.
    let mut current = marked;
    for (name, choice) in [
        ("mode.sh", SideChoice::KeepIncoming),
        ("link", SideChoice::KeepIncoming),
    ] {
        let side = file(&current, name).incoming.clone().unwrap();
        current = keep(&path, &current, name, choice).unwrap();
        current = mark(&path, &current, name, false).unwrap();
        assert_eq!(
            index_of(&path, name),
            [(0, side.mode, side.object_id)],
            "{name}"
        );
    }

    // Edited rather than kept, a file whose sides disagree on running as a
    // program asks which permission to keep, and gets exactly that one.
    current = reset(&path, &current, "mode.sh").unwrap();
    assert_eq!(
        mark(&path, &current, "mode.sh", true).unwrap_err().code,
        AppErrorCode::ConflictChoiceNeeded
    );
    current = mark_conflict_resolved(
        path.clone(),
        "mode.sh".to_string(),
        expected(file(&current, "mode.sh")),
        current.state_token.clone(),
        true,
        Some(true),
    )
    .map(Option::unwrap)
    .unwrap();
    assert_eq!(index_of(&path, "mode.sh")[0].1, "100755");

    // A link has no text to edit: it needs a side before it can be marked.
    assert!(!file(&first, "link")
        .allowed_actions
        .contains(&ConflictAction::MarkResolved));

    // A submodule's side is chosen in the index alone, which resolves it.
    current = keep(&path, &current, "sub", SideChoice::KeepCurrent).unwrap();
    assert_eq!(
        index_of(&path, "sub"),
        [(0, "160000".to_string(), SUB_MAIN.to_string())]
    );
    assert_eq!(
        file(&current, "sub").state,
        ConflictFileState::MarkedResolved
    );

    // Delete, where a side deleted the path, then `git rm --cached`.
    current = keep(&path, &current, "delete-modify.txt", SideChoice::Delete).unwrap();
    assert!(!Path::new(&path).join("delete-modify.txt").exists());
    current = mark(&path, &current, "delete-modify.txt", false).unwrap();
    assert!(index_of(&path, "delete-modify.txt").is_empty());

    // Markers the merge wrote refuse, changing nothing, until confirmed.
    assert_eq!(
        mark(&path, &current, "content.txt", false)
            .unwrap_err()
            .code,
        AppErrorCode::ConflictMarkersRemain
    );
    assert_eq!(index_of(&path, "content.txt").len(), 3);
    current = mark(&path, &current, "content.txt", true).unwrap();
    assert_eq!(index_of(&path, "content.txt")[0].0, 0);

    // An edit made after a choice is copied into the journal before the
    // next choice replaces it.
    let spaced = "spaced \u{f1}ame.txt";
    keep(&path, &current, spaced, SideChoice::KeepCurrent).unwrap();
    write_bytes(&path, spaced, b"my own edit\n");
    current = session(&path);
    assert_eq!(file(&current, spaced).kept, None, "edited since");
    current = keep(&path, &current, spaced, SideChoice::KeepIncoming).unwrap();
    assert_eq!(read_bytes(spaced), b"feature\n");
    let git_dir = Path::new(&path).join(".git");
    let journal = read_conflict_journal(&git_dir, &current.session_id).unwrap();
    let copy = journal
        .entries
        .iter()
        .find_map(|entry| match &entry.replaced_working {
            JournalWorking::File {
                stored: Some(stored),
                ..
            } if entry.path == spaced => Some(*stored),
            _ => None,
        })
        .expect("the edit was kept");
    let journal_file = conflict_snapshot_root(&git_dir)
        .join(&current.session_id)
        .join("journal/files")
        .join(copy.to_string());
    assert_eq!(fs::read(journal_file).unwrap(), b"my own edit\n");

    // Reset brings back the exact stages and the bytes, and reads as
    // untouched again.
    current = reset(&path, &current, "crlf.txt").unwrap();
    let stages = index_of(&path, "crlf.txt");
    let original = [
        (1, crlf.base.clone().unwrap()),
        (2, crlf.current.clone().unwrap()),
        (3, incoming),
    ]
    .map(|(stage, value)| (stage, value.mode, value.object_id))
    .to_vec();
    assert_eq!(stages, original);
    assert_eq!(read_bytes("crlf.txt"), crlf_original);
    let back = file(&current, "crlf.txt");
    assert_eq!(
        (back.state, back.kept),
        (ConflictFileState::Unresolved, None)
    );

    // Resetting only the overlap leaves the file as the user left it.
    let content_now = read_bytes("content.txt");
    let content_stages = file(&current, "content.txt").clone();
    current = reset_conflict_file(
        path.clone(),
        "content.txt".into(),
        current.state_token.clone(),
        true,
    )
    .unwrap()
    .unwrap();
    assert_eq!(
        index_of(&path, "content.txt"),
        [
            (1, content_stages.base.unwrap()),
            (2, content_stages.current.unwrap()),
            (3, content_stages.incoming.unwrap()),
        ]
        .map(|(stage, value)| (stage, value.mode, value.object_id))
        .to_vec()
    );
    assert_eq!(read_bytes("content.txt"), content_now);
    assert_eq!(
        file(&current, "content.txt").state,
        ConflictFileState::Unresolved
    );

    // Locked by another program: reported, nothing changed.
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Readable by others, as an editor holding a file usually leaves it,
        // but neither writable nor replaceable.
        const FILE_SHARE_READ: u32 = 1;
        let holder = fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .open(Path::new(&path).join("bin.dat"))
            .unwrap();
        let error = keep(&path, &current, "bin.dat", SideChoice::KeepIncoming).unwrap_err();
        drop(holder);
        assert_eq!(error.code, AppErrorCode::FileLocked);
        assert_eq!(index_of(&path, "bin.dat").len(), 3);
        let leftovers = fs::read_dir(&path)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains(".gitodile-"))
            .count();
        assert_eq!(leftovers, 0, "the temporary file is removed");
    }

    for (name, bytes) in untouched {
        assert_eq!(read_bytes(name), bytes, "{name} is left alone");
    }
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

fn git_with_input(path: &str, args: &[&str], input: &[u8]) -> String {
    let output = git_command(path)
        .args(args)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            use std::io::Write;
            child.stdin.take().unwrap().write_all(input)?;
            child.wait_with_output()
        })
        .unwrap();
    assert!(output.status.success(), "git {args:?} failed");
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

/// A paused merge whose overlapping paths are written straight into the
/// index, so it can hold what a real merge on this disk could not: two paths
/// equal but for case, and a folder where a file overlaps.
fn synthetic_merge(label: &str, names: &[&str]) -> String {
    let path = unique_temp_dir(label);
    git_ok(&path, &["init", "-q", "-b", "main"]);
    git_ok(&path, &["config", "core.autocrlf", "false"]);
    git_ok(&path, &["commit", "-q", "--allow-empty", "-m", "base"]);
    let head = git_ok(&path, &["rev-parse", "HEAD"]);
    let blobs = ["base\n", "current\n", "incoming\n"]
        .map(|text| git_with_input(&path, &["hash-object", "-w", "--stdin"], text.as_bytes()));
    let mut input = Vec::new();
    for name in names {
        for (stage, blob) in blobs.iter().enumerate() {
            input.extend(format!("100644 {blob} {}\t{name}\0", stage + 1).into_bytes());
        }
    }
    git_with_input(&path, &["update-index", "-z", "--index-info"], &input);
    fs::write(
        Path::new(&path).join(".git/MERGE_HEAD"),
        format!("{head}\n"),
    )
    .unwrap();
    path
}

#[test]
fn a_working_file_is_checked_for_markers_and_blocked_classes_offer_nothing() {
    let names = [
        "notes.txt",
        "wide.txt",
        "bin.dat",
        "dir.txt",
        "Guide.md",
        "Readme.md",
        "README.md",
        "app.jar",
    ];
    let path = synthetic_merge("conflict-check", &names);
    let root = Path::new(&path);
    write_bytes(
        &path,
        "notes.txt",
        b"a\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> f\n",
    );
    write_bytes(&path, "wide.txt", b"\xff\xfeh\0i\0");
    write_bytes(&path, "bin.dat", b"\0\x01");
    fs::create_dir(root.join("dir.txt")).unwrap();
    // On a disk that ignores case this is where Git's `Guide.md` lands.
    write_bytes(&path, "GUIDE.md", b"other\n");
    write_bytes(&path, "Readme.md", b"readme\n");
    write_bytes(&path, "app.jar", b"PK\x03\x04");
    let disk_ignores_case = root.join("readme.md").exists();
    // A name that is not valid UTF-8, which GitOdile cannot spell exactly.
    let blob = git_with_input(&path, &["hash-object", "-w", "--stdin"], b"odd\n");
    let mut odd = Vec::new();
    for stage in 1..=3 {
        odd.extend(format!("100644 {blob} {stage}\t").into_bytes());
        odd.extend(b"odd-\xff.txt\0");
    }
    git_with_input(&path, &["update-index", "-z", "--index-info"], &odd);

    let check = |name: &str| check_conflict_working_file(path.clone(), name.to_string());
    let first = session(&path);
    let found = check("notes.txt").unwrap();
    assert_eq!(found.state_token, first.state_token);
    assert_eq!(found.markers, MarkerScan::Found { blocks: 1 });
    for (name, limit) in [
        ("wide.txt", MarkerScanLimit::Utf16),
        ("bin.dat", MarkerScanLimit::Binary),
    ] {
        assert_eq!(check(name).unwrap().markers, MarkerScan::Unknown { limit });
    }
    write_bytes(&path, "notes.txt", b"a\nx and y\n");
    let edited = check("notes.txt").unwrap();
    assert_eq!(edited.markers, MarkerScan::None);
    assert_ne!(
        edited.state_token, first.state_token,
        "the edit moved the token"
    );
    assert_eq!(
        check("absent.txt").unwrap_err().code,
        AppErrorCode::StaleConflictSession
    );

    let inexact = first.files.iter().find(|file| !file.path_is_exact).unwrap();
    assert_eq!(inexact.state, ConflictFileState::Unsupported);
    assert!(inexact.allowed_actions.is_empty());

    // A folder in the way: no choice, nothing to check, nothing to open.
    let folder = file(&first, "dir.txt");
    assert!(folder.facets.contains(&ConflictFacet::FileDirectory));
    assert!(folder.allowed_actions.is_empty());
    assert_eq!(
        check("dir.txt").unwrap_err().code,
        AppErrorCode::ConflictActionUnavailable
    );
    assert_eq!(
        open_conflict_file(
            path.clone(),
            "dir.txt".to_string(),
            first.state_token.clone()
        )
        .unwrap_err()
        .code,
        AppErrorCode::ConflictActionUnavailable
    );

    // Every platform runs a `.jar` rather than opening it: refused before
    // the snapshot that opening would otherwise take, and with an old token
    // nothing is opened at all.
    let now = session(&path);
    let open = |name: &str, token: &str| {
        open_conflict_file(path.clone(), name.to_string(), token.to_string())
            .unwrap_err()
            .code
    };
    assert_eq!(
        open("app.jar", &now.state_token),
        AppErrorCode::FileRunsAsProgram
    );
    assert_eq!(
        open("app.jar", &first.state_token),
        AppErrorCode::StaleConflictSession
    );
    assert!(session(&path).snapshot.is_none());

    // Two paths equal but for case collide only where the disk ignores case.
    for name in ["Readme.md", "README.md"] {
        let twin = file(&first, name);
        assert_eq!(
            twin.facets.contains(&ConflictFacet::CaseCollision),
            disk_ignores_case,
            "{name}"
        );
        assert_eq!(twin.allowed_actions.is_empty(), disk_ignores_case, "{name}");
    }
    if disk_ignores_case {
        // Git's `Guide.md` is `GUIDE.md` on disk: nothing reaches it.
        let fresh = session(&path);
        assert_eq!(
            keep(&path, &fresh, "Guide.md", SideChoice::KeepCurrent)
                .unwrap_err()
                .code,
            AppErrorCode::ConflictCaseCollision
        );
        assert_eq!(fs::read(root.join("GUIDE.md")).unwrap(), b"other\n");
        assert_eq!(
            open_conflict_file(
                path.clone(),
                "Guide.md".to_string(),
                session(&path).state_token
            )
            .unwrap_err()
            .code,
            AppErrorCode::ConflictCaseCollision
        );
    }
    let _ = fs::remove_dir_all(path);
}

/// A merge of `feature` into `main` paused on two text files, with one file
/// the merge brings in cleanly and one unsaved edit it never touches.
fn small_merge(label: &str) -> (String, String) {
    let path = unique_temp_dir(label);
    git_ok(&path, &["init", "-q", "-b", "main"]);
    git_ok(&path, &["config", "core.autocrlf", "false"]);
    for name in ["a.txt", "b.txt", "clean.txt", "notes.txt"] {
        write_bytes(&path, name, b"base\n");
    }
    git_ok(&path, &["add", "."]);
    git_ok(&path, &["commit", "-q", "-m", "base"]);
    git_ok(&path, &["checkout", "-q", "-b", "feature"]);
    for name in ["a.txt", "b.txt", "clean.txt"] {
        write_bytes(&path, name, b"feature\n");
    }
    git_commit_all(&path, "feature");
    git_ok(&path, &["checkout", "-q", "main"]);
    for name in ["a.txt", "b.txt"] {
        write_bytes(&path, name, b"main\n");
    }
    git_commit_all(&path, "main");
    let head = git_ok(&path, &["rev-parse", "HEAD"]);
    write_bytes(&path, "notes.txt", b"unsaved\n");
    assert!(!git(&path, &["merge", "feature"]).status.success());
    (path, head)
}

fn hook(path: &str, name: &str, body: &str) {
    let hook = Path::new(path).join(".git/hooks").join(name);
    fs::create_dir_all(hook.parent().unwrap()).unwrap();
    fs::write(&hook, format!("#!/bin/sh\n{body}\n")).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    }
}

fn finish(
    path: &str,
    identity: &str,
    run_hooks: bool,
    token: Option<&str>,
) -> Result<merge::FinishMergeResult, AppError> {
    let repository = context(path);
    in_test_frame(|| {
        let plan = merge::plan_finish_merge_with(path, &repository, Some(identity))?;
        merge::finish_merge_with(
            path,
            &repository,
            &plan.title,
            None,
            token.unwrap_or(&plan.state_token),
            run_hooks,
            Some(identity),
        )
    })
}

fn code<T: std::fmt::Debug>(result: Result<T, AppError>) -> AppErrorCode {
    result.expect_err("expected a refusal").code
}

// More than 5 s alone on Windows: one merge is refused, rejected by a hook, by
// signing and for want of an identity before it is finished, and each
// attempt re-plans as the dialog would.
#[test]
fn a_merge_is_finished_only_when_resolved_and_failures_keep_the_resolutions() {
    let (path, before) = small_merge("conflict-finish");
    let feature = git_ok(&path, &["rev-parse", "feature"]);
    let identity = write_test_identity_config("conflict-finish");
    assert_eq!(
        code(finish(&path, &identity, true, None)),
        AppErrorCode::UnresolvedConflicts
    );

    let first = session(&path);
    assert_eq!(first.allowed_actions, [SessionAction::AbortMerge]);
    let kept = keep(&path, &first, "a.txt", SideChoice::KeepCurrent).unwrap();
    let kept = mark(&path, &kept, "a.txt", false).unwrap();
    let kept = keep(&path, &kept, "b.txt", SideChoice::KeepIncoming).unwrap();
    let resolved = mark(&path, &kept, "b.txt", false).unwrap();
    assert_eq!(
        resolved.allowed_actions,
        [SessionAction::FinishMerge, SessionAction::AbortMerge]
    );
    // Nothing overlaps, yet the status still says the merge is open.
    let status = read_working_tree_status(path.clone()).unwrap();
    assert_eq!(status.counts.conflicted, 0);
    assert!(status.paused_operation);

    let repository = context(&path);
    let plan = in_test_frame(|| merge::plan_finish_merge_with(&path, &repository, Some(&identity)))
        .unwrap();
    assert_eq!(plan.title, "Merge branch 'feature'");
    assert_eq!(plan.resolved_files, 2);
    assert_eq!(
        plan.files
            .iter()
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>(),
        ["b.txt", "clean.txt"]
    );
    assert_eq!(plan.unsaved_files, 1);
    // Mark resolved staged both through `--index-info`, without file times;
    // neither is an edit until its content differs.
    assert_eq!(plan.edited_after_resolving, 0);
    assert!(!plan.signs);
    write_bytes(&path, "b.txt", b"edited after marking\n");
    let edited =
        in_test_frame(|| merge::plan_finish_merge_with(&path, &repository, Some(&identity)))
            .unwrap();
    assert_eq!(edited.edited_after_resolving, 1);
    write_bytes(&path, "b.txt", b"feature\n");
    let missing = empty_identity_override("conflict-finish");
    assert_eq!(
        code(in_test_frame(|| merge::plan_finish_merge_with(
            &path,
            &repository,
            Some(&missing)
        ))),
        AppErrorCode::MissingIdentity
    );
    // An empty local value overrides a valid inherited identity. It must
    // block before commit, rather than becoming a generic save/hook failure.
    for key in ["user.name", "user.email"] {
        git_ok(&path, &["config", key, ""]);
        assert_eq!(
            code(in_test_frame(|| merge::plan_finish_merge_with(
                &path,
                &repository,
                Some(&identity)
            ))),
            AppErrorCode::MissingIdentity
        );
        git_ok(&path, &["config", "--unset", key]);
        let config_path = Path::new(&path).join(".git/config");
        let original_config = fs::read(&config_path).unwrap();
        let valueless = format!(
            "{}\n[user]\n{}\n",
            String::from_utf8_lossy(&original_config),
            key.strip_prefix("user.").unwrap()
        );
        fs::write(&config_path, valueless).unwrap();
        assert!(!in_test_frame(|| crate::save_version::identity_configured(
            &path,
            Some(&identity)
        ))
        .unwrap());
        fs::write(&config_path, original_config).unwrap();
    }
    assert_eq!(
        code(finish(&path, &identity, true, Some("not-the-plan"))),
        AppErrorCode::StaleConflictSession
    );

    let staged = || (index_of(&path, "a.txt"), index_of(&path, "b.txt"));
    let resolutions = staged();
    hook(&path, "commit-msg", "echo 'say why' >&2\nexit 1");
    assert_eq!(
        code(finish(&path, &identity, true, None)),
        AppErrorCode::HookRejected
    );
    git_ok(&path, &["config", "commit.gpgSign", "true"]);
    git_ok(&path, &["config", "gpg.program", "gitodile-no-such-gpg"]);
    // Hooks off in Settings: the hook is skipped, signing still applies.
    assert_eq!(
        code(finish(&path, &identity, false, None)),
        AppErrorCode::SigningFailed
    );
    git_ok(&path, &["config", "--unset", "commit.gpgSign"]);
    assert!(Path::new(&path).join(".git/MERGE_HEAD").is_file());
    assert_eq!(staged(), resolutions);
    assert_eq!(git_ok(&path, &["rev-parse", "HEAD"]), before);

    hook(&path, "commit-msg", "touch .git/commit-msg-ran");
    let saved = finish(&path, &identity, true, None).unwrap();
    assert!(Path::new(&path).join(".git/commit-msg-ran").is_file());
    assert_eq!(
        git_ok(&path, &["rev-list", "--parents", "-n", "1", "HEAD"]),
        format!("{} {before} {feature}", saved.commit)
    );
    assert_eq!(saved.branch.as_deref(), Some("main"));
    assert!(!Path::new(&path).join(".git/MERGE_HEAD").exists());
    assert_eq!(
        fs::read(Path::new(&path).join("notes.txt")).unwrap(),
        b"unsaved\n"
    );
    assert_eq!(git_ok(&path, &["show", "HEAD:b.txt"]), "feature");
    assert!(read_conflict_session(path.clone()).unwrap().is_none());
    assert!(
        !read_working_tree_status(path.clone())
            .unwrap()
            .paused_operation
    );
    // The ended session's snapshot stays for recovery.
    assert!(conflict_snapshot_root(&Path::new(&path).join(".git"))
        .join(&first.session_id)
        .join("manifest.json")
        .is_file());
    let _ = fs::remove_dir_all(path);
}

#[test]
fn an_external_merge_is_abandoned_only_after_its_resolutions_are_kept() {
    let (path, before) = small_merge("conflict-abort");
    let first = session(&path);
    let kept = keep(&path, &first, "a.txt", SideChoice::KeepIncoming).unwrap();
    mark(&path, &kept, "a.txt", false).unwrap();
    let resolved_blob = index_of(&path, "a.txt")[0].2.clone();
    write_bytes(&path, "b.txt", b"mine\n");

    let plan = merge::plan_abort_merge(path.clone()).unwrap();
    assert_eq!(plan.origin, ConflictOrigin::External);
    assert_eq!(plan.restoration, merge::Restoration::BestEffort);
    assert_eq!((plan.files, plan.unresolved_files), (2, 1));
    assert_eq!((plan.staged_files, plan.unsaved_files), (2, 1));
    assert_eq!(
        code(merge::abort_merge(path.clone(), "not-the-plan".into())),
        AppErrorCode::StaleConflictSession
    );

    // An edit to a file the merge brought in cleanly: Git won't overwrite it.
    write_bytes(&path, "clean.txt", b"edited\n");
    let plan = merge::plan_abort_merge(path.clone()).unwrap();
    assert_eq!(
        code(merge::abort_merge(path.clone(), plan.state_token)),
        AppErrorCode::MergeAbortRefused
    );
    assert!(Path::new(&path).join(".git/MERGE_HEAD").is_file());
    assert_eq!(
        fs::read(Path::new(&path).join("clean.txt")).unwrap(),
        b"edited\n"
    );
    git_ok(&path, &["checkout", "--", "clean.txt"]);

    let plan = merge::plan_abort_merge(path.clone()).unwrap();
    let result = merge::abort_merge(path.clone(), plan.state_token).unwrap();
    assert_eq!(result.restoration, merge::Restoration::BestEffort);
    // Two attempts, one copy of the hand edit.
    let copies = fs::read_dir(
        conflict_snapshot_root(&Path::new(&path).join(".git"))
            .join(&first.session_id)
            .join("journal/files"),
    )
    .unwrap()
    .count();
    assert_eq!(copies, 1);
    assert!(!Path::new(&path).join(".git/MERGE_HEAD").exists());
    assert_eq!(git_ok(&path, &["rev-parse", "HEAD"]), before);
    assert_eq!(fs::read(Path::new(&path).join("a.txt")).unwrap(), b"main\n");
    assert_eq!(
        fs::read(Path::new(&path).join("notes.txt")).unwrap(),
        b"unsaved\n"
    );
    assert!(read_conflict_session(path.clone()).unwrap().is_none());

    // What the abort replaced is kept: the resolved file in the abandoned
    // index's tree, the hand edit in the journal.
    let git_dir = Path::new(&path).join(".git");
    let journal = read_conflict_journal(&git_dir, &first.session_id).unwrap();
    let abandoned = journal.abandoned_index.unwrap();
    assert_eq!(
        result.abandoned_reference.as_deref(),
        Some(abandoned.reference.as_str())
    );
    assert_eq!(
        git_ok(&path, &["rev-parse", &abandoned.reference]),
        abandoned.tree
    );
    assert_eq!(
        git_ok(&path, &["rev-parse", &format!("{}:a.txt", abandoned.tree)]),
        resolved_blob
    );
    let entry = journal
        .entries
        .iter()
        .find(|entry| entry.path == "b.txt" && entry.action == JournalAction::Abandon)
        .unwrap();
    assert_eq!(entry.replaced_index.len(), 3);
    let JournalWorking::File {
        stored: Some(stored),
        ..
    } = entry.replaced_working
    else {
        panic!(
            "the edit to b.txt was not copied: {:?}",
            entry.replaced_working
        );
    };
    let copy = conflict_snapshot_root(&git_dir)
        .join(&first.session_id)
        .join("journal/files")
        .join(stored.to_string());
    assert_eq!(fs::read(copy).unwrap(), b"mine\n");
    let _ = fs::remove_dir_all(path);
}

#[test]
fn a_merge_gitodile_recorded_promises_and_proves_an_exact_return() {
    let (path, before) = small_merge("conflict-abort-exact");
    let first = session(&path);
    let repository = context(&path);
    {
        let _guard = repository_access::global()
            .acquire(&repository, AccessMode::Write, None)
            .unwrap();
        in_test_frame(|| {
            create_conflict_snapshot(
                &path,
                &repository,
                &first.state_token,
                ConflictOrigin::Gitodile,
            )
        })
        .unwrap();
    }
    let plan = merge::plan_abort_merge(path.clone()).unwrap();
    assert_eq!(plan.origin, ConflictOrigin::Gitodile);
    assert_eq!(plan.restoration, merge::Restoration::Exact);
    let result = merge::abort_merge(path.clone(), plan.state_token).unwrap();
    assert_eq!(result.restoration, merge::Restoration::Exact);
    assert_eq!(git_ok(&path, &["rev-parse", "HEAD"]), before);
    assert!(git(&path, &["diff-index", "--cached", "--quiet", "HEAD"])
        .status
        .success());
    let _ = fs::remove_dir_all(path);
}

// About 1 s alone on Windows: 5,100 paths are written into the index in one
// command, and the session reads every one of them once.
#[test]
fn a_session_past_its_path_bound_says_it_is_partial() {
    let names = (0..5_100)
        .map(|index| format!("many/{index:05}.txt"))
        .collect::<Vec<_>>();
    let names = names.iter().map(String::as_str).collect::<Vec<_>>();
    let path = synthetic_merge("conflict-many", &names);
    let read = session(&path);
    assert!(!read.listing_complete);
    assert_eq!(read.files.len(), 5_000);
    assert!(!read.allowed_actions.contains(&SessionAction::FinishMerge));
    assert!(merge::plan_finish_merge(path.clone()).is_err());
    let _ = fs::remove_dir_all(path);
}

/// Two actions sent with the same token, a file another program holds open,
/// and a resolution made by another tool that a reset replaces: none of them
/// may lose or cross work.
#[test]
fn concurrent_locked_and_external_changes_keep_their_evidence() {
    let path = synthetic_merge("conflict-race", &["a.txt", "b.txt", "c.txt"]);
    // Shorter than either side, so a side written over it changes the
    // file's size, which the token covers even where file times are coarse.
    for name in ["a.txt", "b.txt", "c.txt"] {
        write_bytes(&path, name, b"w\n");
    }
    let first = session(&path);

    let racers = [
        ("a.txt", SideChoice::KeepCurrent),
        ("b.txt", SideChoice::KeepIncoming),
    ]
    .map(|(name, choice)| {
        let (path, first) = (path.clone(), first.clone());
        std::thread::spawn(move || keep(&path, &first, name, choice).map(|_| name))
    })
    .map(|racer| racer.join().unwrap());
    let won = racers.iter().filter(|result| result.is_ok()).count();
    assert_eq!(
        won, 1,
        "the write lock and the token let one action through"
    );
    let lost = racers.into_iter().find_map(Result::err).unwrap();
    assert_eq!(lost.code, AppErrorCode::StaleConflictSession);
    let read_bytes = |name: &str| fs::read(Path::new(&path).join(name)).unwrap();
    let changed = ["a.txt", "b.txt"]
        .iter()
        .filter(|name| read_bytes(name) != b"w\n")
        .count();
    assert_eq!(changed, 1, "the refused action wrote nothing");

    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // An editor that lets others read the file, and one that shares
        // nothing, which refuses even the copy kept before a change.
        for share in [1, 0] {
            let now = session(&path);
            let held = fs::OpenOptions::new()
                .read(true)
                .share_mode(share)
                .open(Path::new(&path).join("c.txt"))
                .unwrap();
            let locked = keep(&path, &now, "c.txt", SideChoice::KeepIncoming);
            drop(held);
            assert_eq!(code(locked), AppErrorCode::FileLocked, "share mode {share}");
            assert_eq!(
                read_bytes("c.txt"),
                b"w
"
            );
        }
        let leftovers = fs::read_dir(&path)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().unwrap().is_file())
            .count();
        assert_eq!(leftovers, 3, "no temporary file is left beside it");
    }

    // Another tool resolves c.txt with content the snapshot never saw; a
    // reset replaces that index entry, so the journal must pin its blob.
    write_bytes(&path, "c.txt", b"resolved elsewhere\n");
    git_ok(&path, &["add", "--", "c.txt"]);
    let outside = git_ok(&path, &["rev-parse", ":0:c.txt"]);
    let now = session(&path);
    assert_eq!(file(&now, "c.txt").state, ConflictFileState::MarkedResolved);
    let reset = reset(&path, &now, "c.txt").unwrap();
    assert_eq!(file(&reset, "c.txt").state, ConflictFileState::Unresolved);
    assert_eq!(index_of(&path, "c.txt").len(), 3);
    let journal = read_conflict_journal(&Path::new(&path).join(".git"), &reset.session_id).unwrap();
    let pinned = git_ok(
        &path,
        &["ls-tree", journal.pin_reference.as_deref().unwrap()],
    );
    assert!(
        pinned.contains(&outside),
        "the replaced resolution is pinned"
    );
    let _ = fs::remove_dir_all(path);
}
