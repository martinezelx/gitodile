use crate::*;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// How long a run's fixture directory may outlive its process before a later
/// run removes it. No test run lasts this long, so an older root is garbage.
const STALE_TEST_RUN: Duration = Duration::from_secs(60 * 60);

/// The directory every fixture of this test process lives under:
/// `<temp>/gitodile-tests/<pid>-<start>`. libtest has no teardown hook, and a
/// failing test skips its own cleanup, so instead each run sweeps the roots
/// that earlier runs left behind. Fixtures never reach the shared temp
/// directory itself, where they used to pile up by the hundred thousand.
pub(crate) fn test_temp_root() -> &'static Path {
    static ROOT: OnceLock<PathBuf> = OnceLock::new();
    ROOT.get_or_init(|| {
        let parent = std::env::temp_dir().join("gitodile-tests");
        if let Ok(entries) = fs::read_dir(&parent) {
            for entry in entries.flatten() {
                let stale = entry
                    .metadata()
                    .and_then(|metadata| metadata.modified())
                    .ok()
                    .and_then(|modified| modified.elapsed().ok())
                    .is_some_and(|age| age > STALE_TEST_RUN);
                if stale {
                    let _ = fs::remove_dir_all(entry.path());
                }
            }
        }
        let started = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|elapsed| elapsed.as_millis())
            .unwrap_or_default();
        let root = parent.join(format!("{}-{started}", std::process::id()));
        fs::create_dir_all(&root).expect("create the test run's temp root");
        root
    })
}

pub(crate) fn unique_temp_dir(label: &str) -> String {
    let dir = test_temp_root().join(label);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("create temp dir for test");
    dir.to_string_lossy().to_string()
}

pub(crate) fn git_init(path: &str) {
    let status = git_command(path)
        .args(["init", "-q"])
        .status()
        .expect("run git init");
    assert!(status.success(), "git init should succeed");
}

pub(crate) fn git_commit_empty(path: &str) {
    let status = git_command(path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "commit",
            "--allow-empty",
            "-q",
            "-m",
            "init",
        ])
        .status()
        .expect("run git commit");
    assert!(status.success(), "git commit --allow-empty should succeed");
}

pub(crate) fn write_file(repo_path: &str, name: &str, contents: &str) {
    fs::write(Path::new(repo_path).join(name), contents).expect("write test file");
}

pub(crate) fn git_add(path: &str, file: &str) {
    let status = git_command(path)
        .args(["add", "--", file])
        .status()
        .expect("run git add");
    assert!(status.success(), "git add should succeed");
}

pub(crate) fn git_add_all(path: &str) {
    let status = git_command(path)
        .args(["add", "-A"])
        .status()
        .expect("run git add -A");
    assert!(status.success(), "git add -A should succeed");
}

pub(crate) fn git_commit(path: &str, message: &str) {
    let status = git_command(path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "commit",
            "-q",
            "-m",
            message,
        ])
        .status()
        .expect("run git commit");
    assert!(status.success(), "git commit should succeed");
}

pub(crate) fn current_branch(path: &str) -> String {
    let output = git_command(path)
        .args(["symbolic-ref", "--short", "HEAD"])
        .output()
        .expect("read current branch");
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

/// A `GIT_CONFIG_GLOBAL` file with an identity set, so planner tests don't
/// depend on (or risk reading) the real machine's global Git identity.
pub(crate) fn write_test_identity_config(label: &str) -> String {
    let path = test_temp_root().join(format!("identity-{label}.gitconfig"));
    fs::write(
        &path,
        "[user]\n\tname = GitOdile Test\n\temail = test@gitodile.local\n",
    )
    .expect("write temp identity config");
    path.to_string_lossy().to_string()
}

/// A `GIT_CONFIG_GLOBAL` path that does not exist, so `git config --get`
/// finds no identity there and (with no local repo config set either)
/// reports none configured, deterministically.
pub(crate) fn empty_identity_override(label: &str) -> String {
    let path = test_temp_root().join(format!("no-identity-{label}.gitconfig"));
    let _ = fs::remove_file(&path);
    path.to_string_lossy().to_string()
}

/// A pre-commit hook that always rejects, written the same way on every
/// platform: Git for Windows executes shebang scripts through its bundled
/// `sh`, so no `.exe`/`.bat` wrapper or executable bit is needed there.
/// Unix needs the executable bit set explicitly.
pub(crate) fn write_failing_hook(git_dir: &Path, name: &str) {
    let hooks_dir = git_dir.join("hooks");
    fs::create_dir_all(&hooks_dir).expect("create hooks dir");
    let hook_path = hooks_dir.join(name);
    fs::write(
        &hook_path,
        "#!/bin/sh\necho 'rejected by test hook' 1>&2\nexit 1\n",
    )
    .expect("write failing hook");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&hook_path).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&hook_path, perms).unwrap();
    }
}

/// A `gpg.program` replacement that always fails the way real GPG does,
/// so signing failures can be tested without a real GPG/SSH signing setup.
/// Written under the system temp directory rather than inside the test
/// repository, so the fixture script itself never shows up as an
/// untracked file in that repository's status.
#[cfg(target_os = "windows")]
pub(crate) fn write_fake_failing_gpg(label: &str) -> String {
    let path = test_temp_root().join(format!("fake-gpg-{label}.bat"));
    fs::write(
        &path,
        "@echo off\r\necho gpg failed to sign the data 1>&2\r\nexit /b 1\r\n",
    )
    .expect("write fake gpg script");
    path.to_string_lossy().replace('\\', "/")
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn write_fake_failing_gpg(label: &str) -> String {
    use std::os::unix::fs::PermissionsExt;
    let path = test_temp_root().join(format!("fake-gpg-{label}.sh"));
    fs::write(
        &path,
        "#!/bin/sh\necho 'gpg failed to sign the data' 1>&2\nexit 1\n",
    )
    .expect("write fake gpg script");
    let mut perms = fs::metadata(&path).unwrap().permissions();
    perms.set_mode(0o755);
    fs::set_permissions(&path, perms).unwrap();
    path.to_string_lossy().to_string()
}

pub(crate) fn find_diff<'a>(diffs: &'a [FileDiff], path: &str) -> Option<&'a FileDiff> {
    diffs.iter().find(|diff| match diff {
        FileDiff::Text { path: p, .. }
        | FileDiff::Binary { path: p, .. }
        | FileDiff::Image { path: p, .. }
        | FileDiff::TooLarge { path: p, .. }
        | FileDiff::Unchanged { path: p, .. } => p == path,
        FileDiff::Conflict { path: p, .. } => p == path,
    })
}

pub(crate) fn init_bare_remote(path: &str) {
    let status = git_command(path)
        .args(["init", "--bare", "-q"])
        .status()
        .expect("run git init --bare");
    assert!(status.success(), "git init --bare should succeed");
}

pub(crate) fn wire_remote(repo_path: &str, remote_name: &str, remote_path: &str) {
    let status = git_command(repo_path)
        .args(["remote", "add", remote_name, remote_path])
        .status()
        .expect("run git remote add");
    assert!(status.success(), "git remote add should succeed");
}

pub(crate) fn remote_branch_sha(remote_path: &str, branch: &str) -> Option<String> {
    let output = git_command(remote_path)
        .args(["rev-parse", "--verify", branch])
        .output()
        .expect("run git rev-parse on the remote");
    output.status.success().then(|| git_stdout(&output))
}

/// Sets up a repository with one commit already published to a fresh bare
/// remote under `origin`, with upstream tracking configured — the common
/// starting point most publish tests build on.
///
/// Building the pair takes about fifteen Git processes, the slowest part of
/// a test on Windows, and it is the same pair every time. The first call
/// builds it through the real publish flow; every call copies that finished
/// pair and points the copy's `origin` at its own remote.
pub(crate) fn published_repo_and_remote(label: &str) -> (String, String, String) {
    static TEMPLATE: OnceLock<(String, String, String)> = OnceLock::new();
    let (template_repo, template_remote, branch) = TEMPLATE.get_or_init(|| {
        let repo = unique_temp_dir("published-template");
        git_init(&repo);
        write_file(&repo, "a.txt", "hello\n");
        git_add_all(&repo);
        git_commit(&repo, "first");
        let branch = current_branch(&repo);

        let remote = unique_temp_dir("published-template-remote");
        init_bare_remote(&remote);
        wire_remote(&repo, "origin", &remote);

        let plan = plan_publish(repo.clone(), None, None).expect("first plan should succeed");
        publish(
            repo.clone(),
            plan.target.remote,
            plan.state_token,
            None,
            true,
        )
        .expect("first publish should succeed");
        (repo, remote, branch)
    });

    let repo = unique_temp_dir(&format!("publish-{label}"));
    let remote = unique_temp_dir(&format!("publish-{label}-remote"));
    copy_dir(Path::new(template_repo), Path::new(&repo));
    copy_dir(Path::new(template_remote), Path::new(&remote));
    let status = git_command(&repo)
        .args(["remote", "set-url", "origin", &remote])
        .status()
        .expect("run git remote set-url");
    assert!(status.success(), "git remote set-url should succeed");
    // The copied index still holds the template's file stat data. Refresh it
    // here, so a test that compares the index before and after an operation
    // never sees Git doing that refresh on the operation's behalf.
    let status = git_command(&repo)
        .args(["update-index", "-q", "--refresh"])
        .status()
        .expect("run git update-index");
    assert!(
        status.success(),
        "git update-index --refresh should succeed"
    );

    (repo, remote, branch.clone())
}

fn copy_dir(from: &Path, to: &Path) {
    fs::create_dir_all(to).expect("create fixture copy directory");
    for entry in fs::read_dir(from).expect("read fixture template") {
        let entry = entry.expect("read fixture template entry");
        let target = to.join(entry.file_name());
        if entry.file_type().expect("read fixture entry type").is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), &target).expect("copy fixture file");
        }
    }
}

/// Appends one version per `(message, contents)` to the current branch in a
/// single `git fast-import`, each replacing `file` with its contents (or
/// leaving the tree as it is when `file` is `None`), then checks the last one
/// out. A loop of `add` + `commit` costs two processes per version; fixtures
/// that need hundreds of versions spent most of a minute on Windows there.
/// The working tree must be clean, as it is after any of the helpers above.
pub(crate) fn git_commit_series(path: &str, file: Option<&str>, versions: &[(String, String)]) {
    let branch = git_command(path)
        .args(["symbolic-ref", "HEAD"])
        .output()
        .expect("read the current branch ref");
    assert!(branch.status.success(), "the series needs a branch");
    let branch = git_stdout(&branch);
    let parent = git_command(path)
        .args(["rev-parse", "--verify", "--quiet", "HEAD"])
        .output()
        .expect("read the current version");
    let parent = parent.status.success().then(|| git_stdout(&parent));

    let when = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default();
    let mut stream = Vec::new();
    for (index, (message, contents)) in versions.iter().enumerate() {
        stream.extend_from_slice(format!("commit {branch}\n").as_bytes());
        stream.extend_from_slice(
            format!("committer GitOdile Test <test@gitodile.local> {when} +0000\n").as_bytes(),
        );
        stream.extend_from_slice(format!("data {}\n{message}\n", message.len()).as_bytes());
        if index == 0 {
            if let Some(parent) = &parent {
                stream.extend_from_slice(format!("from {parent}\n").as_bytes());
            }
        }
        if let Some(file) = file {
            stream.extend_from_slice(
                format!(
                    "M 100644 inline {file}\ndata {}\n{contents}\n",
                    contents.len()
                )
                .as_bytes(),
            );
        }
    }

    let mut import = git_command(path)
        .args(["fast-import", "--quiet"])
        .stdin(std::process::Stdio::piped())
        .spawn()
        .expect("run git fast-import");
    std::io::Write::write_all(&mut import.stdin.take().unwrap(), &stream)
        .expect("write the fast-import stream");
    assert!(
        import.wait().expect("wait for git fast-import").success(),
        "git fast-import should succeed"
    );
    if file.is_some() {
        let status = git_command(path)
            .args(["reset", "-q", "--hard"])
            .status()
            .expect("run git reset");
        assert!(status.success(), "checking out the series should succeed");
    }
}

/// A helper program from `src-tauri/examples/`. Cargo builds the examples next
/// to the test binaries for `cargo test` (not for `cargo test --lib`), so no
/// test compiles a fake executable while it runs. They are declared with
/// `harness = false` in `Cargo.toml`, so even the build `--all-targets` makes
/// runs their `main`.
pub(crate) fn example_binary(name: &str) -> PathBuf {
    let test_binary = std::env::current_exe().expect("locate the test binary");
    // A plain `cargo test` also links `<name>` beside the hashed
    // `<name>-<hash>` build; the newest of them is the current source.
    let built = |file: &str| {
        let stem = file.strip_suffix(std::env::consts::EXE_SUFFIX)?;
        let hash = stem.strip_prefix(name)?;
        (hash.is_empty()
            || hash.strip_prefix('-').is_some_and(|hash| {
                hash.len() == 16 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
            }))
        .then_some(())
    };
    let newest_in = |examples: PathBuf| {
        fs::read_dir(examples)
            .into_iter()
            .flatten()
            .flatten()
            .filter(|entry| built(&entry.file_name().to_string_lossy()).is_some())
            .max_by_key(|entry| {
                entry
                    .metadata()
                    .and_then(|metadata| metadata.modified())
                    .ok()
            })
            .map(|entry| entry.path())
    };
    // The test binary sits in `<profile>/deps` with Cargo's original layout
    // and deeper under `<profile>/build/` with the newer one, so the profile's
    // `examples` directory is found by walking up rather than at a fixed depth.
    test_binary
        .ancestors()
        .skip(1)
        .find_map(|directory| newest_in(directory.join("examples")))
        .unwrap_or_else(|| {
            panic!(
                "{name} is not built under {}: run `cargo test` without `--lib`, or `cargo build --examples` first",
                test_binary.display()
            )
        })
}

/// A scenario of a fake CLI: `<directory>/<scenario>`, which the fake reads
/// back from its `argv[0]`. On Unix it is a symlink, because a copy is open for
/// writing while other tests fork, and a child that inherits that descriptor
/// until it execs makes running the copy fail with "text file busy".
pub(crate) fn scenario_program(directory: &Path, example: &str, scenario: &str) -> String {
    let path = directory.join(format!("{scenario}{}", std::env::consts::EXE_SUFFIX));
    let _ = fs::remove_file(&path);
    #[cfg(unix)]
    std::os::unix::fs::symlink(example_binary(example), &path).expect("link the fake CLI");
    #[cfg(not(unix))]
    fs::copy(example_binary(example), &path).expect("copy the fake CLI");
    path.to_string_lossy().into_owned()
}
