use crate::error::{AppError, AppErrorCode};
use crate::git_command::{checked_git_stdout, git_stdout, run_git};
use crate::{application, conflicts, repository_access, session};
use std::{
    collections::HashSet,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

pub(crate) fn display_path(path: PathBuf) -> String {
    let value = path.to_string_lossy().to_string();
    #[cfg(target_os = "windows")]
    {
        value
            .strip_prefix(r"\\?\UNC\")
            .map(|rest| format!(r"\\{rest}"))
            .or_else(|| value.strip_prefix(r"\\?\").map(ToString::to_string))
            .unwrap_or(value)
    }
    #[cfg(not(target_os = "windows"))]
    {
        value
    }
}

pub(crate) fn normalized_path(base: &Path, raw_path: &str) -> PathBuf {
    let path = Path::new(raw_path);
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    };
    absolute.canonicalize().unwrap_or(absolute)
}

/// Resolves branch/detached/unborn state and the current HEAD SHA for a
/// project whose branch name is already known from a status snapshot.
pub(crate) fn resolve_head_state(
    path: &str,
    branch: Option<String>,
) -> Result<(HeadState, Option<String>), AppError> {
    let head_sha = read_head_commit(path)?;
    Ok((
        classify_head(branch.is_some(), head_sha.is_some()),
        head_sha,
    ))
}

/// The current `HEAD` commit, or `None` on an unborn branch. Split from
/// `resolve_head_state` so a caller can ask it alongside the status read that
/// names the branch instead of after it.
pub(crate) fn read_head_commit(path: &str) -> Result<Option<String>, AppError> {
    let verified_head = run_git(path, &["rev-parse", "--verify", "HEAD"])?;
    Ok(verified_head
        .status
        .success()
        .then(|| git_stdout(&verified_head)))
}

pub(crate) fn classify_head(has_branch: bool, has_commit: bool) -> HeadState {
    match (has_branch, has_commit) {
        (true, true) => HeadState::Branch,
        (false, true) => HeadState::Detached,
        (_, false) => HeadState::Unborn,
    }
}

/// Uses Git's own ref parser before a branch name enters a refspec or a
/// branch mutation.
pub(crate) fn validate_branch_ref_name(path: &str, name: &str) -> Result<(), AppError> {
    // Operations check the same few names again and again, and each check is
    // a Git process. Git's answer depends only on the name, except for an
    // `@{...}` shorthand that it resolves against the repository, so accepted
    // names without one are remembered (a bounded set; rejections are not).
    static ACCEPTED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    const ACCEPTED_LIMIT: usize = 256;
    let accepted = ACCEPTED.get_or_init(Default::default);
    let rememberable = !name.contains("@{");
    if rememberable
        && accepted
            .lock()
            .is_ok_and(|accepted| accepted.contains(name))
    {
        return Ok(());
    }
    let output = run_git(path, &["check-ref-format", "--branch", name])?;
    if output.status.success() {
        if rememberable {
            if let Ok(mut accepted) = accepted.lock() {
                if accepted.len() >= ACCEPTED_LIMIT {
                    accepted.clear();
                }
                accepted.insert(name.to_string());
            }
        }
        Ok(())
    } else {
        Err(AppError::new(
            AppErrorCode::InvalidRefName,
            "This branch's name isn't a valid Git reference.",
        )
        .with_remediation("Rename the branch to a valid Git branch name, then try again."))
    }
}

/// Detects an in-progress Git operation from Git's marker files rather than
/// guessing from porcelain status.
pub(crate) fn git_operation_in_progress(path: &str) -> Result<Option<&'static str>, AppError> {
    let git_dir_raw = checked_git_stdout(run_git(path, &["rev-parse", "--absolute-git-dir"])?)?;
    let git_dir = Path::new(&git_dir_raw);
    if let Some(operation) = conflicts::paused_operation_marker(git_dir) {
        return Ok(Some(operation.as_str()));
    }
    if git_dir.join("BISECT_LOG").is_file() {
        return Ok(Some("bisect"));
    }
    Ok(None)
}

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryInfo {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) selected_path: String,
    pub(crate) git_dir: String,
    pub(crate) common_git_dir: String,
    pub(crate) branch: Option<String>,
    pub(crate) head_state: HeadState,
    pub(crate) kind: RepositoryKind,
    pub(crate) session_epoch: String,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum RepositoryKind {
    Repository,
    Worktree,
}

#[derive(serde::Serialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub(crate) enum HeadState {
    Branch,
    Detached,
    Unborn,
}

/// What the combined discovery read learned about `HEAD`.
#[derive(Debug, PartialEq, Eq)]
enum HeadAnswer {
    Branch(String),
    Detached,
    /// The read failed on `HEAD` alone, so `HEAD` doesn't resolve.
    Unresolved,
    /// Nothing usable: ask the two head questions separately.
    Unknown,
}

/// Parses `rev-parse --is-inside-work-tree --show-toplevel --absolute-git-dir
/// --git-common-dir --symbolic-full-name HEAD --`: the worktree root, Git directory and
/// common Git directory as Git prints them, and what `HEAD` is. `None` for
/// anything but six clean lines from a working tree.
fn parse_discovery_with_head(output: &str) -> Option<(String, String, String, HeadAnswer)> {
    let lines = output.lines().collect::<Vec<_>>();
    let ["true", root, git_dir, common, head, "--"] = lines.as_slice() else {
        return None;
    };
    // Short refs become `heads/main` when a tag shares the branch's name.
    // Strip only the exact local-branch namespace. Detached HEAD names itself.
    let head = match *head {
        "" => return None,
        "HEAD" => HeadAnswer::Detached,
        name => HeadAnswer::Branch(name.strip_prefix("refs/heads/")?.to_string()),
    };
    Some((
        root.to_string(),
        git_dir.to_string(),
        common.to_string(),
        head,
    ))
}

/// The slow path for `HEAD`: whether it names a branch, then whether it
/// resolves to a version.
fn classify_head_one_question_at_a_time(
    path: &str,
) -> Result<(Option<String>, HeadState), AppError> {
    let symbolic_head = run_git(path, &["symbolic-ref", "--quiet", "HEAD"])?;
    let branch = symbolic_head
        .status
        .success()
        .then(|| {
            git_stdout(&symbolic_head)
                .strip_prefix("refs/heads/")
                .map(str::to_string)
        })
        .flatten();
    let verified_head = run_git(path, &["rev-parse", "--verify", "HEAD"])?;
    let head_state = match (verified_head.status.success(), branch.is_some()) {
        (true, true) => HeadState::Branch,
        (true, false) => HeadState::Detached,
        (false, _) => HeadState::Unborn,
    };
    Ok((branch, head_state))
}

/// The slow path of `open_repository`'s discovery: returns the worktree root,
/// Git directory and common Git directory as Git prints them, or the error
/// that says why the folder can't be opened.
fn discover_one_question_at_a_time(path: &str) -> Result<(String, String, String), AppError> {
    let is_repo = run_git(path, &["rev-parse", "--is-inside-work-tree"])?;
    if !is_repo.status.success() {
        return Err(AppError::new(
            AppErrorCode::NotRepository,
            "This folder isn't inside a Git project.",
        )
        .with_remediation("Choose a folder inside an existing Git project."));
    }
    if git_stdout(&is_repo) != "true" {
        let is_bare = run_git(path, &["rev-parse", "--is-bare-repository"])?;
        if is_bare.status.success() && git_stdout(&is_bare) == "true" {
            return Err(AppError::new(
                AppErrorCode::BareRepository,
                "Bare Git repositories aren't supported yet.",
            )
            .with_remediation("Choose a project folder with working files."));
        }
        return Err(AppError::new(
            AppErrorCode::NotRepository,
            "This folder isn't inside a Git project.",
        )
        .with_remediation("Choose a folder inside an existing Git project."));
    }
    let root = checked_git_stdout(run_git(path, &["rev-parse", "--show-toplevel"])?)?;
    let git_dir = checked_git_stdout(run_git(path, &["rev-parse", "--absolute-git-dir"])?)?;
    let common_dir = checked_git_stdout(run_git(path, &["rev-parse", "--git-common-dir"])?)?;
    Ok((root, git_dir, common_dir))
}

pub(crate) fn open_repository(
    path: String,
    session_epoch: Option<String>,
) -> Result<RepositoryInfo, AppError> {
    let _command = application::enter("open_repository");
    let repo_path = Path::new(&path);
    let metadata = repo_path.metadata().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(AppErrorCode::PathMissing, "That folder doesn't exist.")
                .with_remediation("Choose another folder.")
        } else {
            AppError::new(AppErrorCode::PathUnusable, "That folder can't be read.")
                .with_remediation("Check the folder permissions and try again.")
        }
    })?;
    if !metadata.is_dir() {
        return Err(
            AppError::new(AppErrorCode::PathUnusable, "That path isn't a folder.")
                .with_remediation("Choose a folder instead of a file."),
        );
    }
    let selected_path_buf = repo_path.canonicalize().map_err(|_| {
        AppError::new(AppErrorCode::PathUnusable, "That folder can't be resolved.")
            .with_remediation("Check the folder permissions and try again.")
    })?;
    let selected_path = display_path(selected_path_buf.clone());

    // One process answers the four discovery questions and names `HEAD` in a
    // working tree whose `HEAD` resolves, which is every open but a brand new
    // project's. This runs on every shared refresh, and naming `HEAD` used to
    // take two more processes (task 209). `--` keeps a file called `HEAD` from
    // making the name ambiguous.
    let with_head = run_git(
        &path,
        &[
            "rev-parse",
            "--is-inside-work-tree",
            "--show-toplevel",
            "--absolute-git-dir",
            "--git-common-dir",
            "--symbolic-full-name",
            "HEAD",
            "--",
        ],
    )?;
    let failed_on_exit = !with_head.status.success();
    let with_head = (!failed_on_exit)
        .then(|| git_stdout(&with_head))
        .and_then(|output| parse_discovery_with_head(&output));
    let (root, git_dir_raw, common_dir_raw, head) = match with_head {
        Some(found) => found,
        None => {
            // The four questions alone, still in one process. When they
            // succeed after the read above failed, `HEAD` is what failed it.
            // Anything but four clean lines (not a repository, a bare one, a
            // line break inside a path) asks them one at a time, which also
            // tells the failures apart.
            let combined = run_git(
                &path,
                &[
                    "rev-parse",
                    "--is-inside-work-tree",
                    "--show-toplevel",
                    "--absolute-git-dir",
                    "--git-common-dir",
                ],
            )?;
            let combined = combined.status.success().then(|| git_stdout(&combined));
            let answers = combined
                .as_deref()
                .map(|output| output.lines().collect::<Vec<_>>());
            match answers.as_deref() {
                Some(["true", root, git_dir, common]) => (
                    root.to_string(),
                    git_dir.to_string(),
                    common.to_string(),
                    if failed_on_exit {
                        HeadAnswer::Unresolved
                    } else {
                        HeadAnswer::Unknown
                    },
                ),
                _ => {
                    let (root, git_dir, common) = discover_one_question_at_a_time(&path)?;
                    (root, git_dir, common, HeadAnswer::Unknown)
                }
            }
        }
    };
    let root_path = normalized_path(repo_path, &root);
    let git_dir_path = normalized_path(&root_path, &git_dir_raw);
    // `--git-common-dir` is relative to the directory passed to `git -C`,
    // not necessarily to the worktree root. Resolving it from `root_path`
    // misclassified a normal repository when the user selected a nested
    // folder (for example, `src` yields `../.git`).
    let common_dir_path = normalized_path(&selected_path_buf, &common_dir_raw);

    let repository_context = repository_access::RepositoryContext::from_parts(
        &root_path,
        &git_dir_path,
        &common_dir_path,
        false,
    )?;
    repository_access::global().register(
        repository_context.clone(),
        &[selected_path_buf.as_path(), root_path.as_path()],
    );
    let _access = repository_access::global().acquire(
        &repository_context,
        repository_access::AccessMode::Read,
        None,
    )?;

    // A linked worktree has its own Git directory but shares a common Git
    // directory with the main checkout.
    let kind = if git_dir_path == common_dir_path {
        RepositoryKind::Repository
    } else {
        RepositoryKind::Worktree
    };

    let (branch, head_state) = match head {
        HeadAnswer::Branch(name) => (Some(name), HeadState::Branch),
        HeadAnswer::Detached => (None, HeadState::Detached),
        // A branch with no versions yet keeps its name; a `HEAD` that names
        // nothing at all has none to report.
        HeadAnswer::Unresolved => {
            let symbolic_head = run_git(&path, &["symbolic-ref", "--quiet", "HEAD"])?;
            let branch = symbolic_head
                .status
                .success()
                .then(|| {
                    git_stdout(&symbolic_head)
                        .strip_prefix("refs/heads/")
                        .map(str::to_string)
                })
                .flatten();
            (branch, HeadState::Unborn)
        }
        HeadAnswer::Unknown => classify_head_one_question_at_a_time(&path)?,
    };

    let name = root_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| display_path(root_path.clone()));

    let canonical_path = display_path(root_path.clone());
    let session_epoch = session::global().open(&canonical_path, session_epoch.as_deref())?;
    Ok(RepositoryInfo {
        name,
        path: canonical_path,
        selected_path,
        git_dir: display_path(git_dir_path),
        common_git_dir: display_path(common_dir_path),
        branch,
        head_state,
        kind,
        session_epoch,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_with_head_reads_a_branch_a_detached_head_and_rejects_the_rest() {
        let read =
            |head: &str| parse_discovery_with_head(&format!("true\n/p\n/p/.git\n.git\n{head}\n--"));
        assert_eq!(
            read("refs/heads/feature/a"),
            Some((
                "/p".to_string(),
                "/p/.git".to_string(),
                ".git".to_string(),
                HeadAnswer::Branch("feature/a".to_string()),
            ))
        );
        assert_eq!(
            read("HEAD").map(|found| found.3),
            Some(HeadAnswer::Detached)
        );
        assert_eq!(
            read("refs/heads/heads/main").map(|found| found.3),
            Some(HeadAnswer::Branch("heads/main".to_string()))
        );
        assert_eq!(read("refs/tags/main"), None);
        // Not a working tree, or a line break inside a path: the slow path.
        assert_eq!(
            parse_discovery_with_head("false\n/p/.git\n.git\nHEAD\n--"),
            None
        );
        assert_eq!(
            parse_discovery_with_head("true\n/a\nb\n/a/.git\n.git\nmain\n--"),
            None
        );
    }
}
