//! Application-aware Git command facade.
//!
//! `git.rs` owns process execution. This module binds that infrastructure to
//! the execution policy and cancellation frame selected by `application.rs`.
//! Domain modules depend on this facade instead of reaching into Tauri or
//! constructing processes themselves.

use crate::application;
use crate::diagnostics;
use crate::error::{AppError, AppErrorCode};
use crate::git;
use std::ffi::{OsStr, OsString};
use std::path::Path;
#[cfg(test)]
use std::process::Command;
use std::process::{ExitStatus, Output};
use std::time::Instant;

fn owned_args<I, S>(args: I) -> Vec<OsString>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    args.into_iter()
        .map(|argument| argument.as_ref().to_owned())
        .collect()
}

/// Provider selection is added at the policy facade, never in the bounded
/// process runner. Query header names only; secret header values are not read.
pub(crate) fn prepare_transfer_args(
    cwd: Option<&Path>,
    args: &[OsString],
) -> Result<Vec<OsString>, AppError> {
    let mut prepared = crate::credentials::transfer_args(cwd, args)?;
    if prepared == args {
        return Ok(prepared);
    }
    crate::credentials::validate_transfer_urls(args, &prepared)?;
    let mut policy = require_policy()?;
    if cwd.is_some() {
        policy.stdout_cap = 64 * 1024;
        policy.timeout = std::time::Duration::from_secs(10);
        let remotes = git::run(
            cwd,
            ["remote", "-v"],
            policy,
            application::current_cancellation().as_ref(),
        )?;
        if remotes.stdout_truncated || !remotes.status.success() {
            return Err(AppError::new(
                AppErrorCode::AuthenticationFailed,
                "GitOdile couldn't verify this project's remote authentication settings.",
            ));
        }
        crate::credentials::validate_remote_urls(&remotes.stdout, &prepared)?;
    }
    policy.stdout_cap = 16 * 1024;
    policy.timeout = std::time::Duration::from_secs(10);
    let headers = git::run(
        cwd,
        [
            "config",
            "-z",
            "--name-only",
            "--get-regexp",
            "^http\\..*(extraheader|followredirects)$",
        ],
        policy,
        application::current_cancellation().as_ref(),
    )?;
    if headers.stdout_truncated || (!headers.status.success() && headers.status.code() != Some(1)) {
        return Err(AppError::new(
            AppErrorCode::AuthenticationFailed,
            "GitOdile couldn't verify this project's HTTPS authentication settings.",
        ));
    }
    let mut overrides = crate::credentials::header_overrides(&headers.stdout, &prepared)?;
    overrides.append(&mut prepared);
    Ok(overrides)
}

fn record_result(
    policy: git::ExecutionPolicy,
    subcommand: &'static str,
    started: Instant,
    result: &Result<git::BoundedOutput, AppError>,
) {
    match result {
        Ok(output) => diagnostics::record_git(
            policy.class,
            policy.command,
            subcommand,
            output.status.code(),
            started.elapsed().as_millis(),
            Some(&output.stderr),
        ),
        Err(_) => diagnostics::record_git(
            policy.class,
            policy.command,
            subcommand,
            None,
            started.elapsed().as_millis(),
            None,
        ),
    }
}

#[cfg(test)]
pub(crate) fn base_git_command() -> Command {
    git::command()
}

#[cfg(test)]
pub(crate) fn git_command(repo_path: &str) -> Command {
    let mut command = base_git_command();
    command.arg("-C").arg(repo_path);
    command
}

/// Returns the execution policy of the command this thread is running.
///
/// There is deliberately no fallback: a Git call without an application
/// frame would also bypass repository-access coordination.
pub(crate) fn require_policy() -> Result<git::ExecutionPolicy, AppError> {
    match application::current_policy() {
        Some(policy) => Ok(policy),
        None => {
            debug_assert!(
                false,
                "a Git process was started outside a registered command; \
                 enter `application::enter` or `application::authorize_repository` first",
            );
            Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "GitOdile couldn't run this Git command safely.",
            )
            .with_remediation("Restart GitOdile, and please report this if it happens again."))
        }
    }
}

#[cfg(test)]
pub(crate) fn test_git(repo_path: &str, args: &[&str]) -> Result<Output, AppError> {
    let _frame = application::enter_test_frame();
    run_git(repo_path, args)
}

#[cfg(test)]
pub(crate) fn in_test_frame<T>(run: impl FnOnce() -> T) -> T {
    let _frame = application::enter_test_frame();
    run()
}

pub(crate) fn run_git(repo_path: &str, args: &[&str]) -> Result<Output, AppError> {
    run_git_with_env(repo_path, args, &[])
}

/// Preserve both truncation flags for the console's intentionally small output
/// budget. The caller supplies only fixed, reviewed argument templates.
pub(crate) fn run_git_bounded_with_env(
    repo_path: &str,
    args: &[&str],
    envs: &[(&str, &str)],
) -> Result<git::BoundedOutput, AppError> {
    let policy = require_policy()?;
    let cancellation = application::current_cancellation();
    let subcommand = diagnostics::safe_git_subcommand(args.first().map(OsStr::new));
    let started = Instant::now();
    let args = prepare_transfer_args(Some(Path::new(repo_path)), &owned_args(args))?;
    let result = git::run_with_env(
        Some(Path::new(repo_path)),
        &args,
        envs,
        policy,
        cancellation.as_ref(),
    );
    record_result(policy, subcommand, started, &result);
    result
}

pub(crate) fn run_git_with_env<I, S>(
    repo_path: &str,
    args: I,
    envs: &[(&str, &str)],
) -> Result<Output, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let policy = require_policy()?;
    let cancellation = application::current_cancellation();
    let args = owned_args(args);
    let subcommand = diagnostics::safe_git_subcommand(args.first().map(OsString::as_os_str));
    let args = prepare_transfer_args(Some(Path::new(repo_path)), &args)?;
    let started = Instant::now();
    let result = git::run_with_env(
        Some(Path::new(repo_path)),
        &args,
        envs,
        policy,
        cancellation.as_ref(),
    );
    record_result(policy, subcommand, started, &result);
    let output = result?;
    let _stderr_was_truncated = output.stderr_truncated;
    Ok(Output {
        status: output.status,
        stdout: output.stdout,
        stderr: output.stderr,
    })
}

pub(crate) fn run_global_git_with_env<I, S>(
    args: I,
    envs: &[(&str, &str)],
) -> Result<Output, AppError>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let policy = require_policy()?;
    let cancellation = application::current_cancellation();
    let args = owned_args(args);
    let subcommand = diagnostics::safe_git_subcommand(args.first().map(OsString::as_os_str));
    let args = prepare_transfer_args(None, &args)?;
    let started = Instant::now();
    let result = git::run_with_env(None, &args, envs, policy, cancellation.as_ref());
    record_result(policy, subcommand, started, &result);
    let output = result?;
    Ok(Output {
        status: output.status,
        stdout: output.stdout,
        stderr: output.stderr,
    })
}

pub(crate) struct CappedOutput {
    pub(crate) status: ExitStatus,
    pub(crate) stdout: Vec<u8>,
    pub(crate) limit_exceeded: bool,
}

pub(crate) fn run_git_capped(
    repo_path: &str,
    args: &[&str],
    limit: usize,
) -> Result<CappedOutput, AppError> {
    let mut policy = require_policy()?;
    policy.stdout_cap = limit;
    let cancellation = application::current_cancellation();
    let subcommand = diagnostics::safe_git_subcommand(args.first().map(OsStr::new));
    let started = Instant::now();
    let result = git::run(
        Some(Path::new(repo_path)),
        prepare_transfer_args(Some(Path::new(repo_path)), &owned_args(args))?,
        policy,
        cancellation.as_ref(),
    );
    record_result(policy, subcommand, started, &result);
    let output = result?;
    Ok(CappedOutput {
        status: output.status,
        stdout: output.stdout,
        limit_exceeded: output.stdout_truncated,
    })
}

pub(crate) fn run_git_with_input_capped(
    repo_path: &str,
    args: &[&str],
    input: &[u8],
    limit: usize,
) -> Result<CappedOutput, AppError> {
    let mut policy = require_policy()?;
    policy.stdout_cap = limit;
    let cancellation = application::current_cancellation();
    let subcommand = diagnostics::safe_git_subcommand(args.first().map(OsStr::new));
    let started = Instant::now();
    let result = git::run_with_input(
        Some(Path::new(repo_path)),
        prepare_transfer_args(Some(Path::new(repo_path)), &owned_args(args))?,
        input,
        policy,
        cancellation.as_ref(),
    );
    record_result(policy, subcommand, started, &result);
    let output = result?;
    Ok(CappedOutput {
        status: output.status,
        stdout: output.stdout,
        limit_exceeded: output.stdout_truncated,
    })
}

/// [`run_git_with_input_capped`] against another index (`GIT_INDEX_FILE`),
/// for `update-index --index-info` proved on a copy before the real one.
pub(crate) fn run_git_with_env_and_input(
    repo_path: &str,
    args: &[&str],
    envs: &[(&str, &str)],
    input: &[u8],
    limit: usize,
) -> Result<CappedOutput, AppError> {
    let mut policy = require_policy()?;
    policy.stdout_cap = limit;
    let cancellation = application::current_cancellation();
    let subcommand = diagnostics::safe_git_subcommand(args.first().map(OsStr::new));
    let started = Instant::now();
    let result = git::run_with_env_and_input(
        Some(Path::new(repo_path)),
        prepare_transfer_args(Some(Path::new(repo_path)), &owned_args(args))?,
        envs,
        Some(input),
        policy,
        cancellation.as_ref(),
    );
    record_result(policy, subcommand, started, &result);
    let output = result?;
    Ok(CappedOutput {
        status: output.status,
        stdout: output.stdout,
        limit_exceeded: output.stdout_truncated,
    })
}

/// Runs Git with its standard output written into `stdout` instead of
/// memory; the exit status and capped standard error come back.
pub(crate) fn run_git_to_file(
    repo_path: &str,
    args: &[&str],
    stdout: std::fs::File,
) -> Result<Output, AppError> {
    let policy = require_policy()?;
    let cancellation = application::current_cancellation();
    let subcommand = diagnostics::safe_git_subcommand(args.first().map(OsStr::new));
    let started = Instant::now();
    let result = git::run_to_file(
        Some(Path::new(repo_path)),
        prepare_transfer_args(Some(Path::new(repo_path)), &owned_args(args))?,
        stdout,
        policy,
        cancellation.as_ref(),
    );
    record_result(policy, subcommand, started, &result);
    let output = result?;
    Ok(Output {
        status: output.status,
        stdout: Vec::new(),
        stderr: output.stderr,
    })
}

pub(crate) fn git_stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

pub(crate) fn checked_git_stdout(output: Output) -> Result<String, AppError> {
    if output.status.success() {
        Ok(git_stdout(&output))
    } else {
        Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git couldn't inspect this project.",
        )
        .with_remediation("Check that the folder and its Git metadata are readable."))
    }
}
