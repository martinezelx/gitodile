use crate::error::{AppError, AppErrorCode};
use std::ffi::OsStr;
use std::io::{ErrorKind, Read, Write};
use std::path::Path;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(crate) const DEFAULT_STDOUT_CAP: usize = 16 * 1024 * 1024;
pub(crate) const DEFAULT_STDERR_CAP: usize = 256 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum OperationClass {
    ReadOnly,
    LocalMutation,
    HistoryMutation,
    RemoteMutation,
    Destructive,
    PlatformMutation,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PromptPolicy {
    Disabled,
    PreserveGitBehavior,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ConcurrencyClass {
    None,
    RepositoryRead,
    RepositoryWrite,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum CancellationPolicy {
    KillProcess,
    NotSupported,
}

/// Required relationship between one application operation and installer
/// handoff. This deliberately lives on every execution policy: a future Git
/// command, helper, conflict workflow or stash path cannot compile a policy
/// without deciding how installation treats it.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum InstallAdmissionPolicy {
    /// Safe read/background work. Installation asks it to cancel through its
    /// normal token when possible, then waits for its guard to drain.
    Drain,
    /// Work that may mutate files, Git state, a remote, platform state, run a
    /// hook or interact with credentials. Installation never cancels it.
    Block,
    /// Lifecycle/control work needed while admission is closed. This is a
    /// narrow exception, not a default for commands that merely run quickly.
    Allow,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct ExecutionPolicy {
    pub(crate) command: &'static str,
    pub(crate) class: OperationClass,
    pub(crate) stdout_cap: usize,
    pub(crate) stderr_cap: usize,
    pub(crate) timeout: Duration,
    pub(crate) cancellation: CancellationPolicy,
    pub(crate) prompt: PromptPolicy,
    pub(crate) concurrency: ConcurrencyClass,
    pub(crate) install_admission: InstallAdmissionPolicy,
}

impl ExecutionPolicy {
    pub(crate) const fn repository_read(command: &'static str) -> Self {
        Self {
            command,
            class: OperationClass::ReadOnly,
            stdout_cap: DEFAULT_STDOUT_CAP,
            stderr_cap: DEFAULT_STDERR_CAP,
            timeout: Duration::from_secs(60),
            cancellation: CancellationPolicy::KillProcess,
            prompt: PromptPolicy::Disabled,
            concurrency: ConcurrencyClass::RepositoryRead,
            install_admission: InstallAdmissionPolicy::Drain,
        }
    }

    pub(crate) const fn repository_write(command: &'static str, class: OperationClass) -> Self {
        Self {
            command,
            class,
            stdout_cap: DEFAULT_STDOUT_CAP,
            stderr_cap: DEFAULT_STDERR_CAP,
            timeout: Duration::from_secs(120),
            cancellation: CancellationPolicy::KillProcess,
            prompt: PromptPolicy::PreserveGitBehavior,
            concurrency: ConcurrencyClass::RepositoryWrite,
            install_admission: InstallAdmissionPolicy::Block,
        }
    }
}

#[derive(Clone, Default)]
pub(crate) struct CancellationToken(Arc<AtomicBool>);

impl CancellationToken {
    #[cfg_attr(not(test), allow(dead_code))]
    pub(crate) fn cancel(&self) {
        self.0.store(true, Ordering::Release);
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }

    pub(crate) fn same_instance(&self, other: &Self) -> bool {
        Arc::ptr_eq(&self.0, &other.0)
    }
}

#[derive(Debug)]
pub(crate) struct BoundedOutput {
    pub(crate) status: ExitStatus,
    pub(crate) stdout: Vec<u8>,
    pub(crate) stderr: Vec<u8>,
    pub(crate) stdout_truncated: bool,
    pub(crate) stderr_truncated: bool,
}

pub(crate) fn command() -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new("git");
    #[cfg(target_os = "windows")]
    command.args(["-c", "core.longpaths=true"]);
    command
        .env("LC_ALL", "C")
        .env("LANG", "C")
        .env("GIT_OPTIONAL_LOCKS", "0");
    // App diagnostics are bounded and redacted. Inherited Git trace modes can
    // dump credential/cURL traffic before that boundary has a chance to redact.
    for name in [
        "GIT_TRACE",
        "GIT_TRACE_CURL",
        "GIT_CURL_VERBOSE",
        "GIT_TRACE_PACKET",
        "GIT_TRACE2",
        "GIT_TRACE2_EVENT",
        "GIT_TRACE2_PERF",
    ] {
        command.env_remove(name);
    }
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn read_bounded(mut reader: impl Read, limit: usize) -> (Vec<u8>, bool) {
    let mut kept = Vec::with_capacity(limit.min(8192));
    let mut buffer = [0_u8; 8192];
    let mut truncated = false;
    loop {
        match reader.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(read) => {
                let remaining = limit.saturating_sub(kept.len());
                let retain = remaining.min(read);
                kept.extend_from_slice(&buffer[..retain]);
                truncated |= retain < read;
            }
        }
    }
    (kept, truncated)
}

fn start_reader<R: Read + Send + 'static>(
    reader: R,
    limit: usize,
) -> thread::JoinHandle<(Vec<u8>, bool)> {
    thread::spawn(move || read_bounded(reader, limit))
}

fn terminate(child: &mut Child) {
    #[cfg(target_os = "windows")]
    {
        // Git hooks and credential helpers may be descendants. `taskkill` is
        // invoked directly (never through a shell) to request tree cleanup;
        // `Child::kill` remains the fallback if it is unavailable.
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn start_error(error: std::io::Error) -> AppError {
    if error.kind() == ErrorKind::NotFound {
        AppError::new(
            AppErrorCode::GitMissing,
            "Git isn't installed, or isn't available on PATH.",
        )
        .with_remediation("Install Git, then reopen GitOdile and try again.")
    } else {
        AppError::new(AppErrorCode::GitUnusable, "Git couldn't be started.")
            .with_remediation("Check the Git installation and try again.")
    }
}

pub(crate) fn run<I, S>(
    cwd: Option<&Path>,
    args: I,
    policy: ExecutionPolicy,
    cancellation: Option<&CancellationToken>,
) -> Result<BoundedOutput, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_with_env(cwd, args, &[], policy, cancellation)
}

pub(crate) fn run_with_env<I, S>(
    cwd: Option<&Path>,
    args: I,
    envs: &[(&str, &str)],
    policy: ExecutionPolicy,
    cancellation: Option<&CancellationToken>,
) -> Result<BoundedOutput, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_with_env_and_input(cwd, args, envs, None, policy, cancellation)
}

/// Runs Git with a bounded byte payload on standard input. This is reserved
/// for machine protocols such as `cat-file --batch`, where sending many
/// object ids through one process is both safer and substantially cheaper
/// than one process per object.
pub(crate) fn run_with_input<I, S>(
    cwd: Option<&Path>,
    args: I,
    input: &[u8],
    policy: ExecutionPolicy,
    cancellation: Option<&CancellationToken>,
) -> Result<BoundedOutput, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    run_with_env_and_input(cwd, args, &[], Some(input), policy, cancellation)
}

pub(crate) fn run_with_env_and_input<I, S>(
    cwd: Option<&Path>,
    args: I,
    envs: &[(&str, &str)],
    input: Option<&[u8]>,
    policy: ExecutionPolicy,
    cancellation: Option<&CancellationToken>,
) -> Result<BoundedOutput, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut process = command();
    if let Some(cwd) = cwd {
        process.arg("-C").arg(cwd);
    }
    process.args(args).envs(envs.iter().copied());
    run_bounded(process, input, None, policy, cancellation).map_err(git_failure)
}

/// Runs Git with its standard output written straight into `stdout` rather
/// than held in memory, for content whose size is not ours to bound: a side
/// of an overlapping file comes through Git's filters, and an LFS smudge can
/// turn a small pointer into a large file. The policy's timeout and
/// cancellation still apply; standard error stays capped.
pub(crate) fn run_to_file<I, S>(
    cwd: Option<&Path>,
    args: I,
    stdout: std::fs::File,
    policy: ExecutionPolicy,
    cancellation: Option<&CancellationToken>,
) -> Result<BoundedOutput, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut process = command();
    if let Some(cwd) = cwd {
        process.arg("-C").arg(cwd);
    }
    process.args(args);
    run_bounded(process, None, Some(stdout), policy, cancellation).map_err(git_failure)
}

fn git_failure(failure: ProgramFailure) -> AppError {
    match failure {
        ProgramFailure::Start(error) => start_error(error),
        ProgramFailure::Output => {
            AppError::new(AppErrorCode::GitUnusable, "Git's output couldn't be read.")
        }
        ProgramFailure::InputUnavailable => {
            AppError::new(AppErrorCode::GitUnusable, "Git's input couldn't be opened.")
        }
        ProgramFailure::InputRejected => AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't receive its input.",
        ),
        ProgramFailure::Cancelled => AppError::new(
            AppErrorCode::OperationCancelled,
            "The Git operation was cancelled.",
        ),
        ProgramFailure::TimedOut => AppError::new(
            AppErrorCode::GitTimeout,
            "Git took too long and was stopped.",
        )
        .with_remediation("Check the project and try again."),
        ProgramFailure::Wait => AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't finish the operation.",
        ),
    }
}

/// Why a bounded program did not produce an exit status. Each caller names
/// its own program in the error it builds from this.
#[derive(Debug)]
pub(crate) enum ProgramFailure {
    Start(std::io::Error),
    Output,
    InputUnavailable,
    InputRejected,
    Cancelled,
    TimedOut,
    Wait,
}

/// Runs a program other than Git under an execution policy: the same output
/// caps, timeout, cancellation and process-tree cleanup as Git, with standard
/// input closed. The caller builds the command, its arguments and its
/// environment; this never goes through a shell.
pub(crate) fn run_program(
    process: Command,
    policy: ExecutionPolicy,
    cancellation: Option<&CancellationToken>,
) -> Result<BoundedOutput, ProgramFailure> {
    #[cfg(target_os = "windows")]
    let process = {
        let mut process = process;
        process.creation_flags(CREATE_NO_WINDOW);
        process
    };
    run_bounded(
        process,
        None,
        None,
        ExecutionPolicy {
            prompt: PromptPolicy::Disabled,
            ..policy
        },
        cancellation,
    )
}

fn run_bounded(
    mut process: Command,
    input: Option<&[u8]>,
    stdout_file: Option<std::fs::File>,
    policy: ExecutionPolicy,
    cancellation: Option<&CancellationToken>,
) -> Result<BoundedOutput, ProgramFailure> {
    // An already-cancelled operation must not start Git or its descendants.
    // On Windows they can outlive the parent and keep its output pipes open.
    if policy.cancellation == CancellationPolicy::KillProcess
        && cancellation.is_some_and(CancellationToken::is_cancelled)
    {
        return Err(ProgramFailure::Cancelled);
    }
    process
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            match policy.prompt {
                PromptPolicy::Disabled => Stdio::null(),
                PromptPolicy::PreserveGitBehavior => Stdio::inherit(),
            }
        })
        .stdout(stdout_file.map_or_else(Stdio::piped, Stdio::from))
        .stderr(Stdio::piped());

    let mut child = process.spawn().map_err(ProgramFailure::Start)?;
    let Some(stderr) = child.stderr.take() else {
        terminate(&mut child);
        return Err(ProgramFailure::Output);
    };
    // Drain output before writing even a bounded input batch. Some machine
    // protocols answer one record at a time, so filling stdout while the
    // parent is still filling stdin must not deadlock on a small OS pipe.
    // Output sent to a file has no pipe to drain.
    let readers = [
        child
            .stdout
            .take()
            .map(|stdout| start_reader(stdout, policy.stdout_cap)),
        Some(start_reader(stderr, policy.stderr_cap)),
    ];
    if let Some(input) = input {
        let Some(mut stdin) = child.stdin.take() else {
            return stop(&mut child, readers, ProgramFailure::InputUnavailable);
        };
        if stdin.write_all(input).is_err() {
            return stop(&mut child, readers, ProgramFailure::InputRejected);
        }
        drop(stdin);
    }
    let started = Instant::now();

    let status = loop {
        if policy.cancellation == CancellationPolicy::KillProcess
            && cancellation.is_some_and(CancellationToken::is_cancelled)
        {
            return stop(&mut child, readers, ProgramFailure::Cancelled);
        }
        if started.elapsed() >= policy.timeout {
            return stop(&mut child, readers, ProgramFailure::TimedOut);
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(10)),
            Err(_) => return stop(&mut child, readers, ProgramFailure::Wait),
        }
    };

    let [stdout_reader, stderr_reader] = readers;
    let (stdout, stdout_truncated) = stdout_reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    let (stderr, stderr_truncated) = stderr_reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default();
    Ok(BoundedOutput {
        status,
        stdout,
        stderr,
        stdout_truncated,
        stderr_truncated,
    })
}

/// A run's stdout and stderr readers; stdout has none when it goes to a file.
type OutputReaders = [Option<thread::JoinHandle<(Vec<u8>, bool)>>; 2];

/// Ends a run that will not report an exit status, and its output readers.
fn stop(
    child: &mut Child,
    readers: OutputReaders,
    failure: ProgramFailure,
) -> Result<BoundedOutput, ProgramFailure> {
    terminate(child);
    for reader in readers.into_iter().flatten() {
        let _ = reader.join();
    }
    Err(failure)
}

/// Removes credentials and token-bearing URL components from safe diagnostic
/// excerpts. Lossy decoding is deliberate: malformed process bytes must not
/// bypass redaction or make diagnostics fail.
pub(crate) fn redact_diagnostic(bytes: &[u8], limit: usize) -> String {
    let text = String::from_utf8_lossy(bytes);
    if text.to_ascii_uppercase().contains("PRIVATE KEY-----") {
        return "[redacted private key material]".to_string();
    }
    let mut words = Vec::new();
    let mut redact_next = false;
    for word in text.split_whitespace() {
        let lower = word.to_ascii_lowercase();
        if redact_next {
            if matches!(lower.as_str(), "bearer" | "basic") {
                words.push(word.to_string());
                continue;
            }
            words.push("[redacted]".to_string());
            redact_next = false;
            continue;
        }
        if matches!(
            lower.as_str(),
            "authorization:" | "authorization" | "bearer" | "basic"
        ) {
            words.push(word.to_string());
            redact_next = true;
            continue;
        }
        if [
            "username=",
            "password=",
            "passwd=",
            "credential=",
            "secret=",
            "token=",
            "oauth_token=",
            "authorization=",
        ]
        .iter()
        .any(|prefix| lower.starts_with(prefix))
        {
            words.push("[redacted]".to_string());
            continue;
        }
        let without_fragment = word.split('#').next().unwrap_or_default();
        let without_query = without_fragment.split('?').next().unwrap_or_default();
        let redacted = if let Some(scheme) = without_query.find("://") {
            let authority_start = scheme + 3;
            let tail = &without_query[authority_start..];
            if let Some(at) = tail.find('@') {
                format!(
                    "{}[redacted]@{}",
                    &without_query[..authority_start],
                    &tail[at + 1..]
                )
            } else {
                without_query.to_string()
            }
        } else {
            without_query.to_string()
        };
        words.push(redacted);
    }
    let joined = words.join(" ");
    joined.chars().take(limit).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_git_commands_enable_long_paths_without_writing_user_config() {
        let command = command();
        let args = command
            .get_args()
            .map(|argument| argument.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        assert_eq!(args, ["-c", "core.longpaths=true"]);
    }

    #[test]
    fn diagnostics_redact_credentials_queries_and_malformed_bytes() {
        let raw = b"hook: https://alice:secret@example.test/repo.git?token=abc#x username=alice password=hunter2 Bearer abc123 \xff";
        let redacted = redact_diagnostic(raw, 256);
        assert!(!redacted.contains("secret"));
        assert!(!redacted.contains("token"));
        assert!(!redacted.contains("hunter2"));
        assert!(!redacted.contains("abc123"));
        assert!(!redacted.contains("username="));
        assert!(redacted.contains("[redacted]@example.test/repo.git"));
        assert!(redacted.contains('\u{fffd}'));
    }

    #[test]
    fn diagnostics_drop_private_key_material_as_one_redacted_notice() {
        let raw = b"-----BEGIN OPENSSH PRIVATE KEY----- secret -----END OPENSSH PRIVATE KEY-----";
        assert_eq!(
            redact_diagnostic(raw, 256),
            "[redacted private key material]"
        );
    }

    #[test]
    fn bounded_reader_drains_but_retains_only_the_cap() {
        let data = vec![b'x'; 4096];
        let (kept, truncated) = read_bounded(data.as_slice(), 32);
        assert_eq!(kept.len(), 32);
        assert!(truncated);
    }

    #[test]
    fn cancellation_is_distinct_from_a_logically_stale_response() {
        let token = CancellationToken::default();
        token.cancel();
        assert!(token.is_cancelled());
        assert_eq!(
            CancellationPolicy::KillProcess,
            CancellationPolicy::KillProcess
        );
    }

    #[test]
    fn a_cancelled_command_is_reaped() {
        let token = CancellationToken::default();
        token.cancel();
        let result = run(
            None,
            ["--version"],
            ExecutionPolicy::repository_read("cancel_test"),
            Some(&token),
        );
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert_eq!(error.code, AppErrorCode::OperationCancelled);
        assert!(error.message.contains("cancelled"));
    }

    #[test]
    fn pre_cancelled_work_never_attempts_to_spawn_but_respects_non_cancellable_policy() {
        let missing = crate::test_support::test_temp_root().join(format!(
            "gitodile-missing-cancellation-fixture-{}",
            std::process::id()
        ));
        assert!(!missing.exists());
        let token = CancellationToken::default();
        token.cancel();
        let mut policy = ExecutionPolicy::repository_read("cancel_before_spawn_test");
        assert!(matches!(
            run_program(Command::new(&missing), policy, Some(&token)),
            Err(ProgramFailure::Cancelled)
        ));
        policy.cancellation = CancellationPolicy::NotSupported;
        assert!(matches!(
            run_program(Command::new(&missing), policy, Some(&token)),
            Err(ProgramFailure::Start(error)) if error.kind() == ErrorKind::NotFound
        ));
    }

    #[test]
    fn a_timed_out_command_is_reaped() {
        let mut policy = ExecutionPolicy::repository_read("timeout_test");
        policy.timeout = Duration::ZERO;
        let result = run(None, ["--version"], policy, None);
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert_eq!(error.code, AppErrorCode::GitTimeout);
        assert!(error.message.contains("too long"));
    }
}
