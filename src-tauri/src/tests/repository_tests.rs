use crate::test_support::*;
use crate::*;
use std::fs;

#[test]
fn open_repository_recognizes_a_valid_repository() {
    let path = unique_temp_dir("valid-repo");
    git_init(&path);

    let info = open_repository(path.clone(), None).expect("a git init'd folder should open");
    assert!(matches!(info.kind, RepositoryKind::Repository));
    assert_eq!(
        info.path,
        display_path(Path::new(&path).canonicalize().unwrap())
    );
    assert_eq!(info.selected_path, info.path);
    assert_eq!(info.head_state, HeadState::Unborn);
    assert!(info.branch.is_some());

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn open_repository_resolves_a_nested_selection_to_the_worktree_root() {
    let path = unique_temp_dir("nested-repo");
    git_init(&path);
    let nested = Path::new(&path).join("one").join("two");
    fs::create_dir_all(&nested).expect("create nested folder");

    let info = open_repository(nested.to_string_lossy().to_string(), None)
        .expect("a folder inside a repository should open");
    assert_eq!(
        info.name,
        Path::new(&path).file_name().unwrap().to_string_lossy()
    );
    assert_eq!(
        info.path,
        display_path(Path::new(&path).canonicalize().unwrap())
    );
    assert_eq!(
        info.selected_path,
        display_path(nested.canonicalize().unwrap())
    );
    assert!(matches!(info.kind, RepositoryKind::Repository));
    assert_eq!(info.git_dir, info.common_git_dir);

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn open_repository_rejects_a_non_repository_folder() {
    let path = unique_temp_dir("non-repo");

    let error = open_repository(path.clone(), None).expect_err("a plain folder isn't a repo");
    assert_eq!(error.code, AppErrorCode::NotRepository);
    assert!(error.remediation.is_some());

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn open_repository_rejects_a_missing_folder() {
    let mut path = crate::test_support::test_temp_root().to_path_buf();
    path.push(format!(
        "gitodile-test-does-not-exist-{}",
        std::process::id()
    ));
    let path = path.to_string_lossy().to_string();

    let error = open_repository(path, None).expect_err("a missing folder can't be opened");
    assert_eq!(error.code, AppErrorCode::PathMissing);
    assert!(error.remediation.is_some());
}

#[test]
fn open_repository_rejects_a_bare_repository() {
    let path = unique_temp_dir("bare-repo");
    let status = git_command(&path)
        .args(["init", "--bare", "-q"])
        .status()
        .expect("run git init --bare");
    assert!(status.success(), "git init --bare should succeed");

    let error = open_repository(path.clone(), None).expect_err("a bare repo has no working files");
    assert_eq!(error.code, AppErrorCode::BareRepository);

    let _ = fs::remove_dir_all(&path);
}

#[test]
fn open_repository_detects_a_linked_worktree() {
    let main_path = unique_temp_dir("worktree-main");
    git_init(&main_path);
    git_commit_empty(&main_path);

    let mut worktree_buf = crate::test_support::test_temp_root().to_path_buf();
    worktree_buf.push(format!(
        "gitodile-test-worktree-linked-{}",
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&worktree_buf);
    let worktree_path = worktree_buf.to_string_lossy().to_string();

    let status = git_command(&main_path)
        .args([
            "worktree",
            "add",
            "-q",
            &worktree_path,
            "-b",
            "gitodile-test-branch",
        ])
        .status()
        .expect("run git worktree add");
    assert!(status.success(), "git worktree add should succeed");

    let info =
        open_repository(worktree_path.clone(), None).expect("the linked worktree should open");
    assert!(matches!(info.kind, RepositoryKind::Worktree));
    assert_eq!(info.head_state, HeadState::Branch);
    assert_eq!(info.branch.as_deref(), Some("gitodile-test-branch"));
    assert_ne!(info.git_dir, info.common_git_dir);

    let _ = git_command(&main_path)
        .args(["worktree", "remove", "--force", &worktree_path])
        .status();
    let _ = fs::remove_dir_all(&main_path);
    let _ = fs::remove_dir_all(&worktree_path);
}

#[test]
fn open_repository_reports_a_branch_and_a_detached_head() {
    let path = unique_temp_dir("detached-head");
    git_init(&path);
    git_commit_empty(&path);
    // A file called `HEAD` must not make the combined read ambiguous, and a
    // tag sharing the branch's name must never rename it to `heads/shared`.
    fs::write(Path::new(&path).join("HEAD"), "not a ref").expect("write HEAD file");
    for args in [&["checkout", "-q", "-b", "shared"][..], &["tag", "shared"]] {
        let status = git_command(&path).args(args).status().expect("run git");
        assert!(status.success(), "git {args:?} should succeed");
    }
    let info = open_repository(path.clone(), None).expect("a repository on a branch should open");
    assert_eq!(info.head_state, HeadState::Branch);
    assert_eq!(info.branch.as_deref(), Some("shared"));

    let status = git_command(&path)
        .args(["checkout", "--detach", "-q"])
        .status()
        .expect("detach HEAD");
    assert!(status.success(), "git checkout --detach should succeed");

    let info = open_repository(path.clone(), None).expect("a detached repository should open");
    assert_eq!(info.head_state, HeadState::Detached);
    assert_eq!(info.branch, None);

    let _ = fs::remove_dir_all(&path);
}
