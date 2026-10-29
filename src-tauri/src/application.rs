//! Tauri-independent application boundary for execution policy, cancellation
//! and repository authorization. Every registered IPC command enters a checked
//! command frame here before a domain workflow can reach Git; `lib.rs` owns
//! builder/registration and process/platform adapter wiring, not product
//! workflows.

use crate::error::{AppError, AppErrorCode};
use crate::git::{
    CancellationPolicy, CancellationToken, ConcurrencyClass, ExecutionPolicy,
    InstallAdmissionPolicy, OperationClass, PromptPolicy, DEFAULT_STDERR_CAP, DEFAULT_STDOUT_CAP,
};
use crate::repository_access::{self, AccessGuard, AccessMode, RepositoryContext};
use std::cell::RefCell;
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

const fn no_process(command: &'static str) -> ExecutionPolicy {
    no_process_with_class(command, OperationClass::ReadOnly)
}

const fn control(command: &'static str) -> ExecutionPolicy {
    ExecutionPolicy {
        install_admission: InstallAdmissionPolicy::Allow,
        ..no_process(command)
    }
}

const fn no_process_with_class(command: &'static str, class: OperationClass) -> ExecutionPolicy {
    ExecutionPolicy {
        command,
        class,
        stdout_cap: 0,
        stderr_cap: 0,
        timeout: Duration::ZERO,
        cancellation: CancellationPolicy::NotSupported,
        prompt: PromptPolicy::Disabled,
        concurrency: ConcurrencyClass::None,
        install_admission: match class {
            OperationClass::ReadOnly => InstallAdmissionPolicy::Drain,
            _ => InstallAdmissionPolicy::Block,
        },
    }
}

const fn global_process(
    command: &'static str,
    class: OperationClass,
    timeout_secs: u64,
) -> ExecutionPolicy {
    ExecutionPolicy {
        command,
        class,
        stdout_cap: DEFAULT_STDOUT_CAP,
        stderr_cap: DEFAULT_STDERR_CAP,
        timeout: Duration::from_secs(timeout_secs),
        cancellation: CancellationPolicy::KillProcess,
        prompt: PromptPolicy::Disabled,
        concurrency: ConcurrencyClass::None,
        install_admission: match class {
            OperationClass::ReadOnly => InstallAdmissionPolicy::Drain,
            _ => InstallAdmissionPolicy::Block,
        },
    }
}

const fn global_clone(command: &'static str) -> ExecutionPolicy {
    ExecutionPolicy {
        command,
        class: OperationClass::LocalMutation,
        stdout_cap: DEFAULT_STDOUT_CAP,
        stderr_cap: DEFAULT_STDERR_CAP,
        timeout: Duration::from_secs(20 * 60),
        cancellation: CancellationPolicy::KillProcess,
        // Git credential helpers and SSH agents remain available, while the
        // clone domain sets GIT_TERMINAL_PROMPT=0 so an invisible terminal
        // question can never stall the desktop flow.
        prompt: PromptPolicy::PreserveGitBehavior,
        concurrency: ConcurrencyClass::None,
        install_admission: InstallAdmissionPolicy::Block,
    }
}

const fn read(command: &'static str) -> ExecutionPolicy {
    ExecutionPolicy::repository_read(command)
}

/// The console's small output budget: enough to read, bounded so a long log
/// or diff never floods the renderer.
const fn console_read(command: &'static str) -> ExecutionPolicy {
    ExecutionPolicy {
        stdout_cap: 64 * 1024,
        stderr_cap: 8 * 1024,
        timeout: Duration::from_secs(15),
        ..read(command)
    }
}

/// gh/glab shortcuts: read-only and on the console's output budget, with
/// time for the provider's API to answer.
const fn console_hosting() -> ExecutionPolicy {
    ExecutionPolicy {
        timeout: Duration::from_secs(30),
        ..console_read("run_console_hosting_query")
    }
}

/// Typed console changes: local changes and remote transfers, exclusive
/// like every mutation, on the console's output budget. Remote is the widest
/// class one can have until history and destructive commands arrive.
const fn console_change() -> ExecutionPolicy {
    ExecutionPolicy {
        stdout_cap: 64 * 1024,
        stderr_cap: 8 * 1024,
        ..ExecutionPolicy::repository_write("run_console_change", OperationClass::RemoteMutation)
    }
}

pub(crate) const EXECUTION_INVENTORY: &[ExecutionPolicy] = &[
    control("app_status"),
    control("show_main_window"),
    control("get_app_update_state"),
    control("get_startup_update_confirmation"),
    global_process("check_app_update", OperationClass::ReadOnly, 15),
    global_process(
        "download_app_update",
        OperationClass::LocalMutation,
        30 * 60,
    ),
    control("cancel_app_update"),
    no_process_with_class("install_app_update", OperationClass::PlatformMutation),
    read("open_repository"),
    read("reveal_project_file"),
    read("open_project_folder"),
    no_process("plan_clone"),
    global_process("check_clone_source", OperationClass::ReadOnly, 20),
    control("cancel_clone_source_check"),
    global_clone("clone_repository"),
    no_process_with_class("cancel_clone", OperationClass::LocalMutation),
    no_process_with_class("cleanup_clone", OperationClass::Destructive),
    global_process("plan_initialize_project", OperationClass::ReadOnly, 30),
    global_process("initialize_project", OperationClass::LocalMutation, 120),
    no_process_with_class("cleanup_initialize_project", OperationClass::Destructive),
    read("read_working_tree_status"),
    console_read("run_console_query"),
    // Planning a read only parses and classifies the line; a change plan
    // also reads the repository for its preview and fingerprint.
    console_read("plan_console_command"),
    console_read("run_console_plan"),
    console_change(),
    // The project's provider is read from its own remotes; a hosting shortcut
    // runs gh or glab, which reach the provider, on a longer clock.
    console_read("read_console_host"),
    console_hosting(),
    no_process("get_console_settings"),
    no_process_with_class("set_console_confirm_changes", OperationClass::LocalMutation),
    read("read_file_diff"),
    read("read_file_image_preview"),
    read("read_file_lines"),
    read("read_file_markdown"),
    read("read_working_tree_diffs"),
    read("plan_discard_changes"),
    ExecutionPolicy::repository_write("discard_changes", OperationClass::Destructive),
    read("get_discard_recovery"),
    read("list_discard_recoveries"),
    ExecutionPolicy::repository_write("restore_discarded_changes", OperationClass::LocalMutation),
    ExecutionPolicy::repository_write("delete_discard_recovery", OperationClass::Destructive),
    read("read_conflict_session"),
    read("read_conflict_stage"),
    read("read_conflict_side_diff"),
    ExecutionPolicy::repository_write("resolve_conflict_side", OperationClass::LocalMutation),
    ExecutionPolicy::repository_write("mark_conflict_resolved", OperationClass::LocalMutation),
    ExecutionPolicy::repository_write("reset_conflict_file", OperationClass::Destructive),
    ExecutionPolicy::repository_write("open_conflict_file", OperationClass::LocalMutation),
    read("check_conflict_working_file"),
    global_process("glab_diagnostics", OperationClass::ReadOnly, 15),
    global_process("install_glab", OperationClass::PlatformMutation, 900),
    global_process("update_glab", OperationClass::PlatformMutation, 900),
    global_process("check_glab_update", OperationClass::ReadOnly, 15),
    control("get_gitlab_auth_state"),
    global_process("check_gitlab_auth", OperationClass::ReadOnly, 60),
    global_process("start_gitlab_login", OperationClass::PlatformMutation, 960),
    global_process(
        "logout_gitlab_account",
        OperationClass::PlatformMutation,
        90,
    ),
    control("cancel_gitlab_auth"),
    no_process_with_class("add_gitlab_token", OperationClass::PlatformMutation),
    no_process_with_class("remove_gitlab_token", OperationClass::PlatformMutation),
    no_process_with_class("add_azure_token", OperationClass::PlatformMutation),
    no_process_with_class("remove_azure_token", OperationClass::PlatformMutation),
    control("cancel_azure_request"),
    no_process_with_class("add_bitbucket_token", OperationClass::PlatformMutation),
    no_process_with_class("remove_bitbucket_token", OperationClass::PlatformMutation),
    no_process_with_class("add_hosting_server", OperationClass::PlatformMutation),
    no_process_with_class("remove_hosting_server", OperationClass::PlatformMutation),
    no_process_with_class("add_hosting_token", OperationClass::PlatformMutation),
    no_process_with_class("remove_hosting_token", OperationClass::PlatformMutation),
    control("get_hosting_cli_state"),
    global_process("check_hosting_cli", OperationClass::ReadOnly, 60),
    global_process(
        "start_hosting_cli_login",
        OperationClass::PlatformMutation,
        960,
    ),
    global_process("logout_hosting_cli", OperationClass::PlatformMutation, 90),
    control("cancel_hosting_cli"),
    no_process("open_hosting_device_page"),
    global_process("gh_diagnostics", OperationClass::ReadOnly, 15),
    control("get_account_catalog"),
    no_process_with_class("add_github_token", OperationClass::PlatformMutation),
    no_process_with_class("remove_github_token", OperationClass::PlatformMutation),
    no_process("list_hosting_repositories"),
    control("cancel_hosting_request"),
    global_process("check_account_catalog", OperationClass::ReadOnly, 60),
    read("read_project_account"),
    ExecutionPolicy::repository_write("set_project_account", OperationClass::LocalMutation),
    control("get_github_auth_state"),
    global_process("check_github_auth", OperationClass::ReadOnly, 60),
    global_process("start_github_login", OperationClass::PlatformMutation, 960),
    control("cancel_github_auth"),
    global_process(
        "logout_github_account",
        OperationClass::PlatformMutation,
        70,
    ),
    global_process(
        "switch_github_account",
        OperationClass::PlatformMutation,
        70,
    ),
    global_process("install_gh", OperationClass::PlatformMutation, 900),
    global_process("update_gh", OperationClass::PlatformMutation, 900),
    global_process("check_gh_update", OperationClass::ReadOnly, 15),
    global_process("git_diagnostics", OperationClass::ReadOnly, 15),
    global_process("git_installation_details", OperationClass::ReadOnly, 15),
    global_process("reveal_git_location", OperationClass::ReadOnly, 15),
    global_process("install_git", OperationClass::PlatformMutation, 900),
    global_process("update_git", OperationClass::PlatformMutation, 900),
    global_process("check_git_update", OperationClass::ReadOnly, 15),
    global_process("get_git_identity", OperationClass::ReadOnly, 15),
    control("render_diagnostic_report"),
    no_process_with_class("save_diagnostic_report", OperationClass::PlatformMutation),
    global_process("set_git_identity", OperationClass::LocalMutation, 30),
    // Reads the global config, and the open project's when there is one, so it
    // is a repository read rather than a purely global one.
    read("get_line_endings"),
    global_process("set_line_endings", OperationClass::LocalMutation, 30),
    global_process("get_default_branch", OperationClass::ReadOnly, 15),
    global_process("set_default_branch", OperationClass::LocalMutation, 30),
    read("plan_save_version"),
    ExecutionPolicy::repository_write("save_version", OperationClass::HistoryMutation),
    read("discover_remotes"),
    read("plan_connect_remote"),
    ExecutionPolicy::repository_write("connect_remote", OperationClass::LocalMutation),
    read("read_project_remotes"),
    read("read_remote_home"),
    read("open_remote_home"),
    ExecutionPolicy::repository_write("set_remote_url", OperationClass::LocalMutation),
    read("read_project_identity"),
    ExecutionPolicy::repository_write("set_project_identity", OperationClass::LocalMutation),
    ExecutionPolicy::repository_write("clear_project_identity", OperationClass::LocalMutation),
    read("read_ignore_file"),
    ExecutionPolicy::repository_write("write_ignore_file", OperationClass::LocalMutation),
    read("read_project_technology"),
    read("read_team_sync_status"),
    ExecutionPolicy::repository_write("check_team_changes", OperationClass::LocalMutation),
    ExecutionPolicy::repository_write("stop_tracking_remote", OperationClass::LocalMutation),
    // Local since task 161: it reads the last-checked remote and never fetches.
    read("plan_get_team_changes"),
    ExecutionPolicy::repository_write("get_team_changes", OperationClass::HistoryMutation),
    read("list_unpublished_versions"),
    read("list_incoming_versions"),
    read("read_commit_file_changes"),
    read("read_commit_file_diff"),
    read("read_history_page"),
    read("read_saved_version_detail"),
    read("read_saved_version_file_diff"),
    ExecutionPolicy::repository_write("plan_publish", OperationClass::LocalMutation),
    ExecutionPolicy::repository_write("publish", OperationClass::RemoteMutation),
    read("get_branches"),
    read("get_branch_history"),
    read("plan_create_branch"),
    ExecutionPolicy::repository_write("create_branch", OperationClass::LocalMutation),
    read("plan_switch_branch"),
    ExecutionPolicy::repository_write("switch_branch", OperationClass::LocalMutation),
    read("plan_delete_branch"),
    ExecutionPolicy::repository_write("delete_branch", OperationClass::Destructive),
    read("plan_clean_up_branches"),
    ExecutionPolicy::repository_write("clean_up_branches", OperationClass::Destructive),
    read("plan_rename_branch"),
    ExecutionPolicy::repository_write("rename_branch", OperationClass::LocalMutation),
    read("watch_repository"),
    no_process_with_class("unwatch_repository", OperationClass::LocalMutation),
    no_process_with_class("close_project_session", OperationClass::LocalMutation),
];

#[derive(Default)]
struct AdmissionState {
    installing: bool,
    next_activity: u64,
    active: HashMap<u64, ActiveOperation>,
}

struct ActiveOperation {
    command: &'static str,
    policy: InstallAdmissionPolicy,
    cancellation: Option<CancellationToken>,
}

/// Process-wide owner for the atomic boundary between ordinary application
/// work and installer handoff. Repository locks remain responsible for Git
/// consistency; this coordinator is intentionally broader and sees unrelated
/// projects, acquisition workflows and global helpers together.
#[derive(Default)]
pub(crate) struct InstallAdmissionCoordinator {
    state: Mutex<AdmissionState>,
    changed: Condvar,
}

impl InstallAdmissionCoordinator {
    pub(crate) fn start_operation(
        self: &std::sync::Arc<Self>,
        command: &'static str,
        policy: InstallAdmissionPolicy,
        cancellation: Option<CancellationToken>,
    ) -> OperationActivity {
        if policy == InstallAdmissionPolicy::Allow {
            return OperationActivity {
                coordinator: None,
                activity_id: 0,
            };
        }
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        while state.installing {
            state = self
                .changed
                .wait(state)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
        }
        state.next_activity += 1;
        let activity_id = state.next_activity;
        state.active.insert(
            activity_id,
            ActiveOperation {
                command,
                policy,
                cancellation,
            },
        );
        OperationActivity {
            coordinator: Some(std::sync::Arc::clone(self)),
            activity_id,
        }
    }

    pub(crate) fn begin_install(
        self: &std::sync::Arc<Self>,
        drain_timeout: Duration,
    ) -> Result<InstallAdmission, AppError> {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        while state.installing {
            state = self
                .changed
                .wait(state)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
        }
        // Closing the gate and inspecting active work happen under one mutex,
        // which is the race-free boundary the per-repository locks cannot
        // provide. A mutation that won first blocks this attempt; otherwise
        // every later operation waits behind this admission.
        state.installing = true;
        if let Some(active) = state
            .active
            .values()
            .find(|active| active.policy == InstallAdmissionPolicy::Block)
        {
            let command = active.command;
            state.installing = false;
            self.changed.notify_all();
            return Err(install_blocked_error(command));
        }
        for active in state.active.values() {
            if active.policy == InstallAdmissionPolicy::Drain {
                if let Some(cancellation) = &active.cancellation {
                    cancellation.cancel();
                }
            }
        }
        let deadline = Instant::now() + drain_timeout;
        while state
            .active
            .values()
            .any(|active| active.policy == InstallAdmissionPolicy::Drain)
        {
            let now = Instant::now();
            if now >= deadline {
                state.installing = false;
                self.changed.notify_all();
                return Err(AppError::new(
                    AppErrorCode::InstallBlocked,
                    "GitOdile is still finishing background work.",
                )
                .with_remediation("Wait a moment, then choose Install and restart again."));
            }
            let (next, _) = self
                .changed
                .wait_timeout(state, deadline - now)
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state = next;
        }
        Ok(InstallAdmission {
            coordinator: std::sync::Arc::clone(self),
        })
    }

    #[cfg(test)]
    pub(crate) fn active_count(&self) -> usize {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .active
            .len()
    }
}

fn install_blocked_error(command: &str) -> AppError {
    AppError::new(
        AppErrorCode::InstallBlocked,
        "GitOdile is still completing work that cannot be interrupted safely.",
    )
    .with_remediation(format!(
        "Wait for `{command}` to finish, then choose Install and restart again."
    ))
}

pub(crate) struct OperationActivity {
    coordinator: Option<std::sync::Arc<InstallAdmissionCoordinator>>,
    activity_id: u64,
}

impl Drop for OperationActivity {
    fn drop(&mut self) {
        let Some(coordinator) = &self.coordinator else {
            return;
        };
        let mut state = coordinator
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.active.remove(&self.activity_id);
        coordinator.changed.notify_all();
    }
}

pub(crate) struct InstallAdmission {
    coordinator: std::sync::Arc<InstallAdmissionCoordinator>,
}

impl Drop for InstallAdmission {
    fn drop(&mut self) {
        let mut state = self
            .coordinator
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        state.installing = false;
        self.coordinator.changed.notify_all();
    }
}

fn admission() -> &'static std::sync::Arc<InstallAdmissionCoordinator> {
    static ADMISSION: OnceLock<std::sync::Arc<InstallAdmissionCoordinator>> = OnceLock::new();
    ADMISSION.get_or_init(|| std::sync::Arc::new(InstallAdmissionCoordinator::default()))
}

pub(crate) fn begin_install_admission(
    drain_timeout: Duration,
) -> Result<InstallAdmission, AppError> {
    admission().begin_install(drain_timeout)
}

/// Registers an owned helper whose process outlives the IPC call that started
/// it. The returned guard is moved into the helper's reaper thread, closing the
/// gap between spawn and process exit without manufacturing a command frame on
/// the wrong thread.
#[cfg(target_os = "windows")]
pub(crate) fn begin_background_activity(command: &'static str) -> OperationActivity {
    let policy = *policy(command);
    admission().start_operation(command, policy.install_admission, None)
}

pub(crate) fn begin_background_activity_with_cancellation(
    command: &'static str,
    cancellation: CancellationToken,
) -> OperationActivity {
    let policy = *policy(command);
    admission().start_operation(command, policy.install_admission, Some(cancellation))
}

pub(crate) fn policy(command: &str) -> &'static ExecutionPolicy {
    let found = EXECUTION_INVENTORY
        .iter()
        .find(|item| item.command == command)
        .unwrap_or_else(|| panic!("registered command `{command}` is missing an execution policy"));
    debug_assert!(matches!(
        found.class,
        OperationClass::ReadOnly
            | OperationClass::LocalMutation
            | OperationClass::HistoryMutation
            | OperationClass::RemoteMutation
            | OperationClass::Destructive
            | OperationClass::PlatformMutation
    ));
    debug_assert!(
        found.cancellation == CancellationPolicy::NotSupported || !found.timeout.is_zero()
    );
    found
}

#[derive(Clone)]
struct CommandFrame {
    policy: ExecutionPolicy,
    cancellation: Option<CancellationToken>,
}

thread_local! {
    static POLICY_STACK: RefCell<Vec<CommandFrame>> = const { RefCell::new(Vec::new()) };
}

pub(crate) fn current_policy() -> Option<ExecutionPolicy> {
    POLICY_STACK.with(|stack| stack.borrow().last().map(|frame| frame.policy))
}

pub(crate) fn current_cancellation() -> Option<CancellationToken> {
    POLICY_STACK.with(|stack| {
        stack
            .borrow()
            .last()
            .and_then(|frame| frame.cancellation.clone())
    })
}

/// The running command's frame, carried into a scoped worker thread so the
/// Git processes a command splits across threads run under the same policy
/// and cancellation it does. The frame stack is thread-local, and a thread
/// that starts without it has no policy at all — `require_policy` refuses to
/// run Git there.
///
/// Only for a read that fans out inside one command and joins before the
/// command returns (`std::thread::scope`): the frame must never outlive the
/// command that pushed it.
pub(crate) struct InheritedCommand {
    frame: CommandFrame,
}

pub(crate) fn inherit_command() -> Option<InheritedCommand> {
    POLICY_STACK
        .with(|stack| stack.borrow().last().cloned())
        .map(|frame| InheritedCommand { frame })
}

impl InheritedCommand {
    /// Pushes the frame on the calling thread until the guard drops.
    pub(crate) fn enter(self) -> InheritedCommandGuard {
        POLICY_STACK.with(|stack| stack.borrow_mut().push(self.frame));
        InheritedCommandGuard { _private: () }
    }
}

pub(crate) struct InheritedCommandGuard {
    _private: (),
}

impl Drop for InheritedCommandGuard {
    fn drop(&mut self) {
        POLICY_STACK.with(|stack| {
            stack.borrow_mut().pop();
        });
    }
}

/// Runs `second` on a scoped worker thread while `first` runs here, and
/// returns both. The worker carries the running command's policy frame
/// (`inherit_command`), so its Git processes run under the same
/// policy and cancellation; it joins before this returns, so the frame never
/// outlives the command. Read-only questions only — nothing that mutates may
/// race another process.
pub(crate) fn in_parallel<A, B>(
    first: impl FnOnce() -> A,
    second: impl FnOnce() -> B + Send,
) -> (A, B)
where
    B: Send,
{
    let inherited = inherit_command();
    std::thread::scope(|scope| {
        let worker = scope.spawn(move || {
            let _frame = inherited.map(InheritedCommand::enter);
            second()
        });
        let first = first();
        let second = worker
            .join()
            .unwrap_or_else(|panic| std::panic::resume_unwind(panic));
        (first, second)
    })
}

fn cancellations() -> &'static Mutex<HashMap<(String, &'static str), CancellationToken>> {
    static CANCELLATIONS: OnceLock<Mutex<HashMap<(String, &'static str), CancellationToken>>> =
        OnceLock::new();
    CANCELLATIONS.get_or_init(Mutex::default)
}

pub(crate) struct CommandAccess {
    _guard: Option<AccessGuard>,
    _activity: Option<OperationActivity>,
    cancellation_key: Option<(String, &'static str)>,
    cancellation: Option<CancellationToken>,
}

impl Drop for CommandAccess {
    fn drop(&mut self) {
        if let (Some(key), Some(token)) = (&self.cancellation_key, &self.cancellation) {
            let mut active = cancellations()
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if active
                .get(key)
                .is_some_and(|current| current.same_instance(token))
            {
                active.remove(key);
            }
        }
        POLICY_STACK.with(|stack| {
            stack.borrow_mut().pop();
        });
    }
}

pub(crate) fn enter(command: &'static str) -> CommandAccess {
    let policy = *policy(command);
    let cancellation = (policy.install_admission == InstallAdmissionPolicy::Drain
        && policy.cancellation == CancellationPolicy::KillProcess)
        .then(CancellationToken::default);
    let activity =
        admission().start_operation(command, policy.install_admission, cancellation.clone());
    POLICY_STACK.with(|stack| {
        stack.borrow_mut().push(CommandFrame {
            policy,
            cancellation: cancellation.clone(),
        })
    });
    CommandAccess {
        _guard: None,
        _activity: Some(activity),
        cancellation_key: None,
        cancellation,
    }
}

/// Enters a global command with a caller-owned cancellation token. Clone uses
/// this because it has no repository context yet, but still needs a second IPC
/// command to stop the exact process that belongs to its operation id.
pub(crate) fn enter_with_cancellation(
    command: &'static str,
    cancellation: CancellationToken,
) -> CommandAccess {
    let policy = *policy(command);
    let activity = admission().start_operation(
        command,
        policy.install_admission,
        Some(cancellation.clone()),
    );
    POLICY_STACK.with(|stack| {
        stack.borrow_mut().push(CommandFrame {
            policy,
            cancellation: Some(cancellation.clone()),
        })
    });
    CommandAccess {
        _guard: None,
        _activity: Some(activity),
        cancellation_key: None,
        cancellation: Some(cancellation),
    }
}

/// A command frame for test code that reads repository state to verify what a
/// workflow did — `git log -1`, `git ls-files`, `git show HEAD:file`.
///
/// Those calls are assertions, not product behavior, so they have no registered
/// command and must not borrow one: naming a real command here would let a test
/// pass under a policy the production path never uses. The policy is built
/// directly rather than taken from `EXECUTION_INVENTORY`, which stays exactly
/// the registered commands.
///
/// This exists because `require_policy` in `lib.rs` has no fallback. Before
/// task 039 these calls silently received a default read policy, and so would
/// any production call that forgot its frame.
#[cfg(test)]
pub(crate) fn enter_test_frame() -> CommandAccess {
    POLICY_STACK.with(|stack| {
        stack.borrow_mut().push(CommandFrame {
            policy: ExecutionPolicy::repository_read("test_assertion"),
            cancellation: None,
        })
    });
    CommandAccess {
        _guard: None,
        _activity: None,
        cancellation_key: None,
        cancellation: None,
    }
}

pub(crate) fn authorize_repository(
    path: &str,
    command: &'static str,
    cancellation: Option<&CancellationToken>,
) -> Result<(RepositoryContext, CommandAccess), AppError> {
    authorize_repository_scoped(path, command, cancellation, None)
}

/// A read that supersedes only an earlier read of the same `subject`, not
/// every read of the command. A newer read of a command is normally a newer
/// copy of the same question — the status, the inventory — and cancels the
/// one still out. Some reads ask a different question each time: one branch's
/// history is not superseded by the next branch's, and a read started ahead of a
/// press must not cancel the read the screen is waiting on.
pub(crate) fn authorize_repository_read_of(
    path: &str,
    command: &'static str,
    subject: &str,
) -> Result<(RepositoryContext, CommandAccess), AppError> {
    authorize_repository_scoped(path, command, None, Some(subject))
}

fn authorize_repository_scoped(
    path: &str,
    command: &'static str,
    cancellation: Option<&CancellationToken>,
    subject: Option<&str>,
) -> Result<(RepositoryContext, CommandAccess), AppError> {
    let policy = *policy(command);
    let parent_cancellation = current_cancellation();
    let initial_cancellation = if policy.install_admission == InstallAdmissionPolicy::Drain {
        parent_cancellation
            .clone()
            .or_else(|| Some(CancellationToken::default()))
    } else {
        cancellation.cloned()
    };
    let activity = admission().start_operation(
        command,
        policy.install_admission,
        initial_cancellation.clone(),
    );
    POLICY_STACK.with(|stack| {
        stack.borrow_mut().push(CommandFrame {
            policy,
            cancellation: initial_cancellation.clone(),
        })
    });
    let mut access = CommandAccess {
        _guard: None,
        _activity: Some(activity),
        cancellation_key: None,
        cancellation: initial_cancellation.clone(),
    };
    let context = repository_access::global()
        .context_with_cancellation(Path::new(path), initial_cancellation.as_ref())?;
    if context.bare {
        return Err(AppError::new(
            AppErrorCode::BareRepository,
            "Bare Git repositories aren't supported yet.",
        ));
    }
    let requested = match policy.concurrency {
        ConcurrencyClass::RepositoryRead => AccessMode::Read,
        ConcurrencyClass::RepositoryWrite => AccessMode::Write,
        ConcurrencyClass::None => {
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "This command has no repository concurrency policy.",
            ))
        }
    };
    let repository_key = context.common_git_dir.match_key().to_string();
    let (guard, inherited_access) = match repository_access::held_mode(&repository_key) {
        Some(AccessMode::Write) => (None, true),
        Some(AccessMode::Read) if requested == AccessMode::Read => (None, true),
        Some(AccessMode::Read) => {
            return Err(AppError::new(
                AppErrorCode::GitCommandFailed,
                "A repository read cannot be upgraded to a mutation.",
            ))
        }
        None => (
            Some(repository_access::global().acquire(
                &context,
                requested,
                initial_cancellation.as_ref(),
            )?),
            false,
        ),
    };
    let (cancellation_key, command_cancellation) = if inherited_access {
        // A domain workflow may call another authorized helper while it owns
        // the repository permit. That helper is part of the same command, not
        // a newer equivalent renderer request. Reuse the parent's token so an
        // internal status read cannot cancel a concurrent visible status
        // refresh (or the workflow that called it).
        (None, parent_cancellation)
    } else if requested == AccessMode::Read {
        let key = match subject {
            Some(subject) => (format!("{repository_key}\0{subject}"), command),
            None => (repository_key, command),
        };
        let token = initial_cancellation
            .clone()
            .unwrap_or_else(CancellationToken::default);
        let mut active = cancellations()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(superseded) = active.insert(key.clone(), token.clone()) {
            superseded.cancel();
        }
        (Some(key), Some(token))
    } else {
        (None, cancellation.cloned())
    };
    POLICY_STACK.with(|stack| {
        if let Some(frame) = stack.borrow_mut().last_mut() {
            frame.cancellation = command_cancellation.clone();
        }
    });
    access._guard = guard;
    access.cancellation_key = cancellation_key;
    access.cancellation = command_cancellation;
    Ok((context, access))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;
    use std::sync::mpsc;
    use std::thread;
    const REGISTERED: &[&str] = &[
        "app_status",
        "show_main_window",
        "get_app_update_state",
        "get_startup_update_confirmation",
        "check_app_update",
        "download_app_update",
        "cancel_app_update",
        "install_app_update",
        "open_repository",
        "reveal_project_file",
        "open_project_folder",
        "plan_clone",
        "check_clone_source",
        "cancel_clone_source_check",
        "clone_repository",
        "cancel_clone",
        "cleanup_clone",
        "plan_initialize_project",
        "initialize_project",
        "cleanup_initialize_project",
        "read_working_tree_status",
        "run_console_query",
        "plan_console_command",
        "run_console_plan",
        "run_console_change",
        "read_console_host",
        "run_console_hosting_query",
        "get_console_settings",
        "set_console_confirm_changes",
        "read_file_diff",
        "read_file_image_preview",
        "read_file_lines",
        "read_file_markdown",
        "read_working_tree_diffs",
        "plan_discard_changes",
        "discard_changes",
        "get_discard_recovery",
        "list_discard_recoveries",
        "restore_discarded_changes",
        "delete_discard_recovery",
        "read_conflict_session",
        "read_conflict_stage",
        "read_conflict_side_diff",
        "resolve_conflict_side",
        "mark_conflict_resolved",
        "reset_conflict_file",
        "open_conflict_file",
        "check_conflict_working_file",
        "glab_diagnostics",
        "install_glab",
        "update_glab",
        "check_glab_update",
        "get_gitlab_auth_state",
        "check_gitlab_auth",
        "start_gitlab_login",
        "logout_gitlab_account",
        "cancel_gitlab_auth",
        "add_gitlab_token",
        "remove_gitlab_token",
        "add_azure_token",
        "remove_azure_token",
        "cancel_azure_request",
        "add_bitbucket_token",
        "remove_bitbucket_token",
        "add_hosting_server",
        "remove_hosting_server",
        "add_hosting_token",
        "remove_hosting_token",
        "get_hosting_cli_state",
        "check_hosting_cli",
        "start_hosting_cli_login",
        "logout_hosting_cli",
        "cancel_hosting_cli",
        "open_hosting_device_page",
        "gh_diagnostics",
        "get_account_catalog",
        "add_github_token",
        "remove_github_token",
        "list_hosting_repositories",
        "cancel_hosting_request",
        "check_account_catalog",
        "read_project_account",
        "set_project_account",
        "get_github_auth_state",
        "check_github_auth",
        "start_github_login",
        "cancel_github_auth",
        "logout_github_account",
        "switch_github_account",
        "install_gh",
        "update_gh",
        "check_gh_update",
        "git_diagnostics",
        "git_installation_details",
        "reveal_git_location",
        "install_git",
        "update_git",
        "check_git_update",
        "get_git_identity",
        "render_diagnostic_report",
        "save_diagnostic_report",
        "set_git_identity",
        "get_line_endings",
        "set_line_endings",
        "get_default_branch",
        "set_default_branch",
        "plan_save_version",
        "save_version",
        "discover_remotes",
        "plan_connect_remote",
        "connect_remote",
        "read_project_remotes",
        "read_remote_home",
        "open_remote_home",
        "set_remote_url",
        "read_project_identity",
        "set_project_identity",
        "clear_project_identity",
        "read_ignore_file",
        "write_ignore_file",
        "read_project_technology",
        "read_team_sync_status",
        "check_team_changes",
        "stop_tracking_remote",
        "plan_get_team_changes",
        "get_team_changes",
        "list_unpublished_versions",
        "list_incoming_versions",
        "read_commit_file_changes",
        "read_commit_file_diff",
        "read_history_page",
        "read_saved_version_detail",
        "read_saved_version_file_diff",
        "plan_publish",
        "publish",
        "get_branches",
        "get_branch_history",
        "plan_create_branch",
        "create_branch",
        "plan_switch_branch",
        "switch_branch",
        "plan_delete_branch",
        "delete_branch",
        "plan_clean_up_branches",
        "clean_up_branches",
        "plan_rename_branch",
        "rename_branch",
        "watch_repository",
        "unwatch_repository",
        "close_project_session",
    ];

    #[test]
    fn every_registered_command_has_one_complete_policy() {
        assert_eq!(EXECUTION_INVENTORY.len(), REGISTERED.len());
        for command in REGISTERED {
            let matches: Vec<_> = EXECUTION_INVENTORY
                .iter()
                .filter(|item| item.command == *command)
                .collect();
            assert_eq!(matches.len(), 1, "policy inventory for {command}");
            if matches[0].cancellation != CancellationPolicy::NotSupported {
                assert!(matches[0].stdout_cap > 0 && matches[0].stderr_cap > 0);
                assert!(!matches[0].timeout.is_zero());
            }
        }
    }

    #[test]
    fn mutations_are_exclusive_and_preserve_git_prompts() {
        for command in [
            "save_version",
            "plan_publish",
            "check_team_changes",
            "get_team_changes",
            "publish",
            "create_branch",
            "switch_branch",
            "delete_branch",
            "clean_up_branches",
            "discard_changes",
            "restore_discarded_changes",
            "resolve_conflict_side",
            "mark_conflict_resolved",
            "reset_conflict_file",
        ] {
            assert_eq!(
                policy(command).concurrency,
                ConcurrencyClass::RepositoryWrite
            );
            assert_eq!(policy(command).prompt, PromptPolicy::PreserveGitBehavior);
        }
        assert_eq!(policy("plan_publish").class, OperationClass::LocalMutation);
        assert_eq!(
            policy("check_team_changes").class,
            OperationClass::LocalMutation
        );
        assert_eq!(
            policy("get_team_changes").class,
            OperationClass::HistoryMutation
        );
        // The plan reads the last-checked remote; only the check fetches.
        assert_eq!(
            policy("plan_get_team_changes").concurrency,
            ConcurrencyClass::RepositoryRead
        );
        assert_eq!(
            policy("close_project_session").class,
            OperationClass::LocalMutation
        );
        assert_eq!(
            policy("close_project_session").concurrency,
            ConcurrencyClass::None
        );
    }

    #[test]
    fn a_new_read_cancels_the_superseded_process_token() {
        let path = crate::test_support::test_temp_root()
            .join(format!("gitodile-supersede-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        assert!(Command::new("git")
            .arg("init")
            .arg("-q")
            .arg(&path)
            .status()
            .unwrap()
            .success());

        let path_text = path.to_string_lossy().to_string();
        let (ready_tx, ready_rx) = mpsc::channel();
        let (finish_tx, finish_rx) = mpsc::channel();
        let first_path = path_text.clone();
        let first = thread::spawn(move || {
            let (_context, _access) =
                authorize_repository(&first_path, "read_working_tree_status", None).unwrap();
            let token = current_cancellation().unwrap();
            ready_tx.send(token.clone()).unwrap();
            finish_rx.recv().unwrap();
            token.is_cancelled()
        });
        let first_token = ready_rx.recv().unwrap();
        let (_context, _access) =
            authorize_repository(&path_text, "read_working_tree_status", None).unwrap();
        assert!(first_token.is_cancelled());
        finish_tx.send(()).unwrap();
        assert!(first.join().unwrap());
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn a_read_of_another_subject_does_not_supersede_the_first() {
        let path = crate::test_support::test_temp_root()
            .join(format!("gitodile-subject-read-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        assert!(Command::new("git")
            .arg("init")
            .arg("-q")
            .arg(&path)
            .status()
            .unwrap()
            .success());

        let path_text = path.to_string_lossy().to_string();
        let (ready_tx, ready_rx) = mpsc::channel();
        let (finish_tx, finish_rx) = mpsc::channel();
        let first_path = path_text.clone();
        let first = thread::spawn(move || {
            let (_context, _access) =
                authorize_repository_read_of(&first_path, "get_branch_history", "main").unwrap();
            let token = current_cancellation().unwrap();
            ready_tx.send(token.clone()).unwrap();
            finish_rx.recv().unwrap();
            token.is_cancelled()
        });
        let first_token = ready_rx.recv().unwrap();
        {
            // Another branch's history leaves the first read alone…
            let (_context, _access) =
                authorize_repository_read_of(&path_text, "get_branch_history", "feature").unwrap();
            assert!(!first_token.is_cancelled());
        }
        // …and a newer read of the same branch still supersedes it.
        let (_context, _access) =
            authorize_repository_read_of(&path_text, "get_branch_history", "main").unwrap();
        assert!(first_token.is_cancelled());
        finish_tx.send(()).unwrap();
        assert!(first.join().unwrap());
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn an_inherited_read_does_not_supersede_an_independent_peer() {
        let path = crate::test_support::test_temp_root()
            .join(format!("gitodile-inherited-read-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        assert!(Command::new("git")
            .arg("init")
            .arg("-q")
            .arg(&path)
            .status()
            .unwrap()
            .success());

        let path_text = path.to_string_lossy().to_string();
        let (ready_tx, ready_rx) = mpsc::channel();
        let (finish_tx, finish_rx) = mpsc::channel();
        let peer_path = path_text.clone();
        let peer = thread::spawn(move || {
            let (_context, _access) =
                authorize_repository(&peer_path, "read_working_tree_status", None).unwrap();
            let token = current_cancellation().unwrap();
            ready_tx.send(token.clone()).unwrap();
            finish_rx.recv().unwrap();
            token.is_cancelled()
        });
        let peer_token = ready_rx.recv().unwrap();

        let (_context, _outer) =
            authorize_repository(&path_text, "list_unpublished_versions", None).unwrap();
        let outer_token = current_cancellation().unwrap();
        {
            let (_context, _nested) =
                authorize_repository(&path_text, "read_working_tree_status", None).unwrap();
            let nested_token = current_cancellation().unwrap();
            assert!(nested_token.same_instance(&outer_token));
            assert!(!peer_token.is_cancelled());
        }

        finish_tx.send(()).unwrap();
        assert!(!peer.join().unwrap());
        let _ = fs::remove_dir_all(path);
    }
}
