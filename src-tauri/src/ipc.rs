//! Thin Tauri transport adapters.
//!
//! These functions own only framework extraction/serialization and delegate
//! immediately. Repository authorization, execution policy and workflows stay
//! behind the application boundary.

use crate::{
    app_updates::{
        AppUpdateService, InstallUpdateRequest, StartupUpdateConfirmation, UpdateAction,
        UpdateCheckSource, UpdateState,
    },
    application,
    azure_access::AzureOrganizations,
    bitbucket_access::BitbucketAccessService,
    branches::{
        self, BranchHistory, BranchesSnapshot, CleanUpBranchRequest, CleanUpBranchesPlan,
        CleanUpBranchesResult, CreateBranchPlan, DeleteBranchPlan, DeleteBranchResult,
        RenameBranchPlan, SwitchBranchPlan,
    },
    changes::{
        self, CommitFileChange, FileDiff, FileLines, ImagePreview, MarkdownPreview,
        WorkingTreeDiffBatch,
    },
    clone::{
        self, CloneOperationRegistry, ClonePlan, CloneProgressPhase, CloneResult, CloneSourceAccess,
    },
    conflicts::{
        self,
        merge::{AbortMergePlan, AbortMergeResult, FinishMergePlan, FinishMergeResult},
        resolve::{ExpectedStages, SideChoice},
        ConflictSession, ConflictSide, ConflictStageContent, WorkingFileCheck,
    },
    console::{
        self, ConsoleHost, ConsoleHostingResult, ConsoleModes, ConsolePlan, ConsoleQueryResult,
        ConsoleRunResult, ConsoleSettings,
    },
    credentials::{self, AccountCatalog, AccountService, ProjectAccount},
    desktop,
    diagnostics::{self, DiagnosticsLog},
    error::AppError,
    github_access::{GitHubAccessService, RepositoryPage},
    github_auth::{GitHubAuthService, GitHubAuthSnapshot},
    gitlab_access::GitLabAccessService,
    gitlab_auth::{GitLabAuthService, GitLabAuthSnapshot},
    history::{self, HistoryPage, SavedVersionDetail},
    hosting::{CliAction, HostingCliSnapshot, HostingServers},
    initialize::{
        self, InitializeProgressPhase, InitializeProjectPlan, InitializeProjectResult,
        InitializeTargetKind,
    },
    project_settings::{self, IgnoreFile, ProjectIdentity},
    publish_domain::{self, PublishPlan, PublishResult},
    recovery::{self, DiscardPlan, DiscardRecovery, DiscardRecoveryRecord, DiscardResult},
    repository::{self, RepositoryInfo},
    save_version::{self, SaveVersionPlan, SaveVersionResult},
    session,
    status::{self, PendingVersionsResult, WorkingTreeStatus},
    sync::{
        self, BringInChangesPlan, BringInChangesResult, ConnectRemotePlan, ConnectRemoteResult,
        GetTeamChangesPhase, GetTeamChangesPlan, GetTeamChangesResult, IntegrationSource,
        IntegrationSources, OverlappingMergeSource, ProjectRemotes, RemoteDiscovery, RemoteHome,
        StartOverlappingMergeResult, TeamSyncStatus,
    },
    technology::{self, ProjectTechnology},
    tooling::{
        self, GitDefaultBranch, GitDiagnostics, GitIdentity, GitInstallationDetails,
        GitInstallationResult, GitLineEndings, GitUpdateLaunchResult, GitUpdateStatus,
    },
    watch,
};

#[tauri::command]
pub(crate) async fn add_azure_token(
    service: tauri::State<'_, AzureOrganizations>,
    organization: String,
    token: String,
    request_id: String,
) -> Result<String, AppError> {
    report_result(
        "add_azure_token",
        service.add(organization, token, request_id).await,
    )
}
#[tauri::command(async)]
pub(crate) fn remove_azure_token(
    service: tauri::State<'_, AzureOrganizations>,
    account_id: String,
) -> Result<(), AppError> {
    let _command = application::enter("remove_azure_token");
    report_result("remove_azure_token", service.remove(&account_id))
}
#[tauri::command]
pub(crate) fn cancel_azure_request(
    service: tauri::State<'_, AzureOrganizations>,
    request_id: String,
) {
    let _command = application::enter("cancel_azure_request");
    service.cancel(&request_id);
}

#[tauri::command]
pub(crate) async fn add_github_token(
    service: tauri::State<'_, GitHubAccessService>,
    token: String,
    request_id: String,
) -> Result<String, AppError> {
    report_result("add_github_token", service.add(token, request_id).await)
}

#[tauri::command(async)]
pub(crate) fn remove_github_token(
    service: tauri::State<'_, GitHubAccessService>,
    account_id: String,
) -> Result<(), AppError> {
    let _command = application::enter("remove_github_token");
    report_result("remove_github_token", service.remove(&account_id))
}

#[tauri::command]
pub(crate) async fn add_bitbucket_token(
    service: tauri::State<'_, BitbucketAccessService>,
    token: String,
    request_id: String,
) -> Result<String, AppError> {
    report_result("add_bitbucket_token", service.add(token, request_id).await)
}

#[tauri::command(async)]
pub(crate) fn remove_bitbucket_token(
    service: tauri::State<'_, BitbucketAccessService>,
    account_id: String,
) -> Result<(), AppError> {
    let _command = application::enter("remove_bitbucket_token");
    report_result("remove_bitbucket_token", service.remove(&account_id))
}

#[tauri::command]
pub(crate) async fn list_hosting_repositories(
    service: tauri::State<'_, GitHubAccessService>,
    gitlab: tauri::State<'_, GitLabAccessService>,
    bitbucket: tauri::State<'_, BitbucketAccessService>,
    servers: tauri::State<'_, HostingServers>,
    account_id: String,
    page: u32,
    request_id: String,
) -> Result<RepositoryPage, AppError> {
    report_result(
        "list_hosting_repositories",
        crate::hosting::repositories(
            &service, &gitlab, &bitbucket, &servers, account_id, page, request_id,
        )
        .await,
    )
}

#[tauri::command]
pub(crate) fn cancel_hosting_request(
    service: tauri::State<'_, GitHubAccessService>,
    gitlab: tauri::State<'_, GitLabAccessService>,
    bitbucket: tauri::State<'_, BitbucketAccessService>,
    servers: tauri::State<'_, HostingServers>,
    request_id: String,
) {
    let _command = application::enter("cancel_hosting_request");
    service.cancel(&request_id);
    gitlab.cancel(&request_id);
    bitbucket.cancel(&request_id);
    servers.cancel(&request_id);
}

#[tauri::command]
pub(crate) fn get_account_catalog(
    service: tauri::State<'_, std::sync::Arc<AccountService>>,
) -> AccountCatalog {
    let _command = application::enter("get_account_catalog");
    report_value("get_account_catalog", service.catalog())
}

#[tauri::command]
pub(crate) fn check_account_catalog(
    service: tauri::State<'_, std::sync::Arc<AccountService>>,
    provider: String,
) -> Result<AccountCatalog, AppError> {
    let _command = application::enter("check_account_catalog");
    report_result("check_account_catalog", service.check(&provider))
}

#[tauri::command(async)]
pub(crate) fn read_project_account(
    path: String,
    session_epoch: String,
    provider: String,
) -> Result<ProjectAccount, AppError> {
    report_result(
        "read_project_account",
        (|| {
            validate_session(&path, &session_epoch)?;
            credentials::read_project(&path, &provider)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn set_project_account(
    path: String,
    session_epoch: String,
    provider: String,
    account_id: Option<String>,
    expected_account_id: Option<String>,
) -> Result<ProjectAccount, AppError> {
    report_result(
        "set_project_account",
        (|| {
            validate_session(&path, &session_epoch)?;
            credentials::set_project(
                &path,
                &provider,
                account_id.as_deref(),
                expected_account_id.as_deref(),
            )
        })(),
    )
}

#[tauri::command]
pub(crate) fn get_app_update_state(service: tauri::State<'_, AppUpdateService>) -> UpdateState {
    report_value("get_app_update_state", service.snapshot())
}

#[tauri::command]
pub(crate) fn get_startup_update_confirmation(
    service: tauri::State<'_, AppUpdateService>,
) -> StartupUpdateConfirmation {
    report_value(
        "get_startup_update_confirmation",
        service.startup_confirmation(),
    )
}

#[tauri::command]
pub(crate) fn check_app_update(
    app: tauri::AppHandle,
    service: tauri::State<'_, AppUpdateService>,
    source: UpdateCheckSource,
) -> UpdateAction {
    report_value("check_app_update", service.start_check(app, source))
}

#[tauri::command]
pub(crate) fn download_app_update(
    service: tauri::State<'_, AppUpdateService>,
    candidate_id: String,
) -> UpdateAction {
    report_value("download_app_update", service.start_download(&candidate_id))
}

#[tauri::command]
pub(crate) fn cancel_app_update(
    service: tauri::State<'_, AppUpdateService>,
    operation_id: String,
) -> UpdateState {
    report_value("cancel_app_update", service.cancel(&operation_id))
}

#[tauri::command(async)]
pub(crate) fn install_app_update(
    app: tauri::AppHandle,
    service: tauri::State<'_, AppUpdateService>,
    watchers: tauri::State<'_, watch::WatcherRegistry>,
    request: InstallUpdateRequest,
) -> UpdateState {
    report_value(
        "install_app_update",
        service.install(&app, &watchers, request),
    )
}

fn report_result<T>(operation: &'static str, result: Result<T, AppError>) -> Result<T, AppError> {
    diagnostics::record_command(
        application::policy(operation).class,
        operation,
        result.as_ref().err(),
    );
    result
}

fn report_value<T>(operation: &'static str, value: T) -> T {
    diagnostics::record_command(application::policy(operation).class, operation, None);
    value
}

/// Every repository-scoped command that acts on an already-open project proves
/// its incarnation here. Reads and mutations share one rule; there is no
/// weaker read path and no missing-epoch allowance.
fn validate_session(path: &str, session_epoch: &str) -> Result<(), AppError> {
    session::global().validate(path, session_epoch)
}

#[tauri::command]
pub(crate) fn app_status() -> &'static str {
    report_value("app_status", desktop::app_status())
}

#[tauri::command]
pub(crate) fn show_main_window(window: tauri::Window) {
    desktop::show_main_window(window);
    report_value("show_main_window", ());
}

#[tauri::command(async)]
pub(crate) fn reveal_project_file(
    path: String,
    file_path: String,
    session_epoch: String,
) -> Result<(), AppError> {
    report_result(
        "reveal_project_file",
        (|| {
            validate_session(&path, &session_epoch)?;
            desktop::reveal_project_file(path, file_path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn open_project_folder(path: String, session_epoch: String) -> Result<(), AppError> {
    report_result(
        "open_project_folder",
        (|| {
            validate_session(&path, &session_epoch)?;
            desktop::open_project_folder(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn open_repository(
    path: String,
    session_epoch: Option<String>,
) -> Result<RepositoryInfo, AppError> {
    report_result(
        "open_repository",
        repository::open_repository(path, session_epoch),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_clone(
    source: String,
    destination_parent: String,
    destination_name: String,
    account_id: Option<String>,
) -> Result<ClonePlan, AppError> {
    report_result(
        "plan_clone",
        clone::plan_clone_with_account(source, destination_parent, destination_name, account_id),
    )
}

#[tauri::command(async)]
pub(crate) fn check_clone_source(
    registry: tauri::State<'_, CloneOperationRegistry>,
    source: String,
    account_id: Option<String>,
    request_id: String,
) -> Result<CloneSourceAccess, AppError> {
    report_result(
        "check_clone_source",
        clone::check_clone_source(&registry, source, account_id, request_id),
    )
}

#[tauri::command]
pub(crate) fn cancel_clone_source_check(
    registry: tauri::State<'_, CloneOperationRegistry>,
    request_id: String,
) -> Result<(), AppError> {
    report_result(
        "cancel_clone_source_check",
        clone::cancel_clone_source_check(&registry, request_id),
    )
}

#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub(crate) fn clone_repository(
    registry: tauri::State<'_, CloneOperationRegistry>,
    source: String,
    destination_parent: String,
    destination_name: String,
    operation_id: String,
    state_token: String,
    account_id: Option<String>,
    on_progress: tauri::ipc::Channel<CloneProgressPhase>,
) -> Result<CloneResult, AppError> {
    report_result(
        "clone_repository",
        clone::clone_repository_with_account(
            &registry,
            source,
            destination_parent,
            destination_name,
            operation_id,
            state_token,
            account_id,
            |phase| {
                let _ = on_progress.send(phase);
            },
        ),
    )
}

#[tauri::command]
pub(crate) fn cancel_clone(
    registry: tauri::State<'_, CloneOperationRegistry>,
    operation_id: String,
) -> Result<(), AppError> {
    report_result("cancel_clone", clone::cancel_clone(&registry, operation_id))
}

#[tauri::command]
pub(crate) fn cleanup_clone(
    destination_parent: String,
    operation_id: String,
) -> Result<(), AppError> {
    report_result(
        "cleanup_clone",
        clone::cleanup_clone(destination_parent, operation_id),
    )
}

#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub(crate) fn plan_initialize_project(
    target_kind: InitializeTargetKind,
    destination_parent: String,
    destination_name: String,
    existing_path: String,
    initial_branch: String,
    create_readme: bool,
    save_initial_version: bool,
) -> Result<InitializeProjectPlan, AppError> {
    report_result(
        "plan_initialize_project",
        initialize::plan_initialize_project(
            target_kind,
            destination_parent,
            destination_name,
            existing_path,
            initial_branch,
            create_readme,
            save_initial_version,
        ),
    )
}

#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub(crate) fn initialize_project(
    target_kind: InitializeTargetKind,
    destination_parent: String,
    destination_name: String,
    existing_path: String,
    initial_branch: String,
    create_readme: bool,
    save_initial_version: bool,
    operation_id: String,
    state_token: String,
    on_progress: tauri::ipc::Channel<InitializeProgressPhase>,
) -> Result<InitializeProjectResult, AppError> {
    report_result(
        "initialize_project",
        initialize::initialize_project(
            target_kind,
            destination_parent,
            destination_name,
            existing_path,
            initial_branch,
            create_readme,
            save_initial_version,
            operation_id,
            state_token,
            |phase| {
                let _ = on_progress.send(phase);
            },
        ),
    )
}

#[tauri::command]
pub(crate) fn cleanup_initialize_project(
    destination_path: String,
    target_kind: InitializeTargetKind,
    operation_id: String,
) -> Result<(), AppError> {
    report_result(
        "cleanup_initialize_project",
        initialize::cleanup_initialize_project(destination_path, target_kind, operation_id),
    )
}

#[tauri::command(async)]
pub(crate) fn read_working_tree_status(
    path: String,
    session_epoch: String,
) -> Result<WorkingTreeStatus, AppError> {
    report_result(
        "read_working_tree_status",
        (|| {
            validate_session(&path, &session_epoch)?;
            status::read_working_tree_status(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn run_console_query(
    path: String,
    session_epoch: String,
    operation_id: String,
) -> Result<ConsoleQueryResult, AppError> {
    report_result(
        "run_console_query",
        (|| {
            validate_session(&path, &session_epoch)?;
            console::run_console_query(path, operation_id)
        })(),
    )
}

/// The project's hosting provider for the console's welcome, read from its
/// own remotes without reaching the network.
#[tauri::command(async)]
pub(crate) fn read_console_host(
    path: String,
    session_epoch: String,
) -> Result<ConsoleHost, AppError> {
    report_result(
        "read_console_host",
        (|| {
            validate_session(&path, &session_epoch)?;
            console::read_console_host(path)
        })(),
    )
}

/// One fixed gh/glab shortcut, chosen by ID; the renderer never sends an
/// argument for either CLI.
#[tauri::command(async)]
pub(crate) fn run_console_hosting_query(
    path: String,
    session_epoch: String,
    operation_id: String,
) -> Result<ConsoleHostingResult, AppError> {
    report_result(
        "run_console_hosting_query",
        (|| {
            validate_session(&path, &session_epoch)?;
            console::run_console_hosting_query(path, operation_id)
        })(),
    )
}

/// The typed line crosses IPC only here, to be parsed and classified in Rust;
/// what may run comes back as a plan, never as arguments the renderer chose.
///
/// `run_hooks` is the Settings switch the guided flows receive the same way;
/// advanced mode is never a parameter, since Rust holds it.
#[tauri::command(async)]
pub(crate) fn plan_console_command(
    settings: tauri::State<'_, ConsoleSettings>,
    path: String,
    session_epoch: String,
    line: String,
    run_hooks: bool,
) -> Result<ConsolePlan, AppError> {
    report_result(
        "plan_console_command",
        (|| {
            validate_session(&path, &session_epoch)?;
            console::plan_console_command(&settings, path, session_epoch, line, run_hooks)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn run_console_plan(
    path: String,
    session_epoch: String,
    plan_id: String,
) -> Result<ConsoleRunResult, AppError> {
    report_result(
        "run_console_plan",
        (|| {
            validate_session(&path, &session_epoch)?;
            console::run_console_plan(path, session_epoch, plan_id)
        })(),
    )
}

/// Runs a change plan once the person answered its `[s/N]`; Rust checks the
/// answer, the confirmation setting and the repository against the plan again.
#[tauri::command(async)]
pub(crate) fn run_console_change(
    settings: tauri::State<'_, ConsoleSettings>,
    path: String,
    session_epoch: String,
    plan_id: String,
    answer: String,
) -> Result<ConsoleRunResult, AppError> {
    report_result(
        "run_console_change",
        (|| {
            validate_session(&path, &session_epoch)?;
            console::run_console_change(&settings, path, session_epoch, plan_id, answer)
        })(),
    )
}

#[tauri::command]
pub(crate) fn get_console_settings(settings: tauri::State<'_, ConsoleSettings>) -> ConsoleModes {
    report_value("get_console_settings", settings.modes())
}

/// Turning change confirmations off needs `confirmed`, the renderer's word
/// that the person accepted the dialog explaining it; turning them back on
/// does not.
#[tauri::command]
pub(crate) fn set_console_confirm_changes(
    settings: tauri::State<'_, ConsoleSettings>,
    enabled: bool,
    confirmed: bool,
) -> Result<ConsoleModes, AppError> {
    report_result(
        "set_console_confirm_changes",
        settings.set_confirm_changes(enabled, confirmed),
    )
}

#[tauri::command(async)]
pub(crate) fn read_file_diff(
    path: String,
    file_path: String,
    session_epoch: String,
) -> Result<FileDiff, AppError> {
    report_result(
        "read_file_diff",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_file_diff(path, file_path)
        })(),
    )
}

/// `commit` chooses which pair of versions to read: absent means the working
/// tree against `HEAD`, present means that saved version against its parent.
/// One command rather than two because the surfaces asking differ only in
/// that, and a second command would be the same body with a different name.
#[tauri::command(async)]
pub(crate) fn read_file_image_preview(
    path: String,
    file_path: String,
    original_path: Option<String>,
    commit: Option<String>,
    session_epoch: String,
) -> Result<ImagePreview, AppError> {
    report_result(
        "read_file_image_preview",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_file_image_preview(path, file_path, original_path, commit)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_file_markdown(
    path: String,
    file_path: String,
    session_epoch: String,
) -> Result<MarkdownPreview, AppError> {
    report_result(
        "read_file_markdown",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_file_markdown(path, file_path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_file_lines(
    path: String,
    file_path: String,
    start_line: u32,
    end_line: u32,
    session_epoch: String,
) -> Result<FileLines, AppError> {
    report_result(
        "read_file_lines",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_file_lines(path, file_path, start_line, end_line)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_working_tree_diffs(
    path: String,
    session_epoch: String,
) -> Result<WorkingTreeDiffBatch, AppError> {
    report_result(
        "read_working_tree_diffs",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_working_tree_diffs(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_discard_changes(
    path: String,
    selected_path: Option<String>,
    session_epoch: String,
) -> Result<DiscardPlan, AppError> {
    report_result(
        "plan_discard_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            recovery::plan_discard_changes(path, selected_path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn discard_changes(
    path: String,
    selected_path: Option<String>,
    state_token: String,
    session_epoch: String,
) -> Result<DiscardResult, AppError> {
    report_result(
        "discard_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            recovery::discard_changes(path, selected_path, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn get_discard_recovery(
    path: String,
    session_epoch: String,
) -> Result<DiscardRecovery, AppError> {
    report_result(
        "get_discard_recovery",
        (|| {
            validate_session(&path, &session_epoch)?;
            recovery::get_discard_recovery(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn list_discard_recoveries(
    path: String,
    session_epoch: String,
) -> Result<Vec<DiscardRecoveryRecord>, AppError> {
    report_result(
        "list_discard_recoveries",
        (|| {
            validate_session(&path, &session_epoch)?;
            recovery::list_discard_recoveries(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn delete_discard_recovery(
    path: String,
    recovery_id: String,
    session_epoch: String,
) -> Result<(), AppError> {
    report_result(
        "delete_discard_recovery",
        (|| {
            validate_session(&path, &session_epoch)?;
            recovery::delete_discard_recovery(path, recovery_id)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn restore_discarded_changes(
    path: String,
    recovery_id: String,
    state_token: String,
    session_epoch: String,
) -> Result<(), AppError> {
    report_result(
        "restore_discarded_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            recovery::restore_discarded_changes(path, recovery_id, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_conflict_session(
    path: String,
    session_epoch: String,
) -> Result<Option<ConflictSession>, AppError> {
    report_result(
        "read_conflict_session",
        (|| {
            validate_session(&path, &session_epoch)?;
            conflicts::read_conflict_session(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_conflict_stage(
    path: String,
    file_path: String,
    stage: u8,
    object_id: String,
    session_epoch: String,
) -> Result<ConflictStageContent, AppError> {
    report_result(
        "read_conflict_stage",
        (|| {
            validate_session(&path, &session_epoch)?;
            conflicts::read_conflict_stage(path, file_path, stage, object_id)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_conflict_side_diff(
    path: String,
    file_path: String,
    side: ConflictSide,
    base_object_id: Option<String>,
    side_object_id: String,
    session_epoch: String,
) -> Result<FileDiff, AppError> {
    report_result(
        "read_conflict_side_diff",
        (|| {
            validate_session(&path, &session_epoch)?;
            conflicts::read_conflict_side_diff(
                path,
                file_path,
                side,
                base_object_id,
                side_object_id,
            )
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn resolve_conflict_side(
    path: String,
    file_path: String,
    choice: SideChoice,
    expected: ExpectedStages,
    state_token: String,
    session_epoch: String,
) -> Result<Option<ConflictSession>, AppError> {
    report_result(
        "resolve_conflict_side",
        (|| {
            validate_session(&path, &session_epoch)?;
            conflicts::resolve::resolve_conflict_side(
                path,
                file_path,
                choice,
                expected,
                state_token,
            )
        })(),
    )
}

#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub(crate) fn mark_conflict_resolved(
    path: String,
    file_path: String,
    expected: ExpectedStages,
    state_token: String,
    allow_markers: bool,
    executable: Option<bool>,
    session_epoch: String,
) -> Result<Option<ConflictSession>, AppError> {
    report_result(
        "mark_conflict_resolved",
        (|| {
            validate_session(&path, &session_epoch)?;
            conflicts::resolve::mark_conflict_resolved(
                path,
                file_path,
                expected,
                state_token,
                allow_markers,
                executable,
            )
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn reset_conflict_file(
    path: String,
    file_path: String,
    state_token: String,
    stages_only: bool,
    session_epoch: String,
) -> Result<Option<ConflictSession>, AppError> {
    report_result(
        "reset_conflict_file",
        (|| {
            validate_session(&path, &session_epoch)?;
            conflicts::resolve::reset_conflict_file(path, file_path, state_token, stages_only)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn open_conflict_file(
    path: String,
    file_path: String,
    state_token: String,
    session_epoch: String,
) -> Result<(), AppError> {
    report_result(
        "open_conflict_file",
        (|| {
            validate_session(&path, &session_epoch)?;
            conflicts::open_conflict_file(path, file_path, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn check_conflict_working_file(
    path: String,
    file_path: String,
    session_epoch: String,
) -> Result<WorkingFileCheck, AppError> {
    report_result(
        "check_conflict_working_file",
        (|| {
            validate_session(&path, &session_epoch)?;
            conflicts::check_conflict_working_file(path, file_path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_finish_merge(
    path: String,
    session_epoch: String,
) -> Result<FinishMergePlan, AppError> {
    report_result(
        "plan_finish_merge",
        (|| {
            validate_session(&path, &session_epoch)?;
            conflicts::merge::plan_finish_merge(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn finish_merge(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    run_hooks: bool,
    session_epoch: String,
) -> Result<FinishMergeResult, AppError> {
    report_result(
        "finish_merge",
        (|| {
            validate_session(&path, &session_epoch)?;
            conflicts::merge::finish_merge(path, title, description, state_token, run_hooks)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_abort_merge(
    path: String,
    session_epoch: String,
) -> Result<AbortMergePlan, AppError> {
    report_result(
        "plan_abort_merge",
        (|| {
            validate_session(&path, &session_epoch)?;
            conflicts::merge::plan_abort_merge(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn abort_merge(
    path: String,
    state_token: String,
    session_epoch: String,
) -> Result<AbortMergeResult, AppError> {
    report_result(
        "abort_merge",
        (|| {
            validate_session(&path, &session_epoch)?;
            conflicts::merge::abort_merge(path, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn git_diagnostics() -> GitDiagnostics {
    report_value("git_diagnostics", tooling::git_diagnostics())
}

#[tauri::command(async)]
pub(crate) fn git_installation_details() -> GitInstallationDetails {
    report_value(
        "git_installation_details",
        tooling::git_installation_details(),
    )
}

#[tauri::command(async)]
pub(crate) fn reveal_git_location(target: String) -> Result<(), AppError> {
    report_result("reveal_git_location", desktop::reveal_git_location(target))
}

#[tauri::command(async)]
pub(crate) fn install_git() -> GitInstallationResult {
    report_value("install_git", tooling::install_git())
}

#[tauri::command(async)]
pub(crate) fn update_git() -> GitUpdateLaunchResult {
    report_value("update_git", tooling::update_git())
}

#[tauri::command(async)]
pub(crate) fn check_git_update() -> GitUpdateStatus {
    report_value("check_git_update", tooling::check_git_update())
}

#[tauri::command(async)]
pub(crate) fn get_git_identity() -> GitIdentity {
    report_value("get_git_identity", tooling::get_git_identity())
}

#[tauri::command]
pub(crate) fn render_diagnostic_report(
    log: tauri::State<'_, DiagnosticsLog>,
    environment: String,
) -> String {
    report_value(
        "render_diagnostic_report",
        diagnostics::render_report(&log, environment),
    )
}

#[tauri::command(async)]
pub(crate) fn save_diagnostic_report(path: String, report: String) -> Result<(), AppError> {
    let _command = application::enter("save_diagnostic_report");
    report_result(
        "save_diagnostic_report",
        diagnostics::save_report(path, report),
    )
}

#[tauri::command(async)]
pub(crate) fn set_git_identity(name: String, email: String) -> Result<(), AppError> {
    report_result("set_git_identity", tooling::set_git_identity(name, email))
}

/// The one Settings read that can be repository-scoped: a project can override
/// the global line-ending setting, so the open one is validated like any other
/// repository call and simply absent when no project is open.
#[tauri::command(async)]
pub(crate) fn get_line_endings(
    path: Option<String>,
    session_epoch: Option<String>,
) -> Result<GitLineEndings, AppError> {
    report_result(
        "get_line_endings",
        (|| {
            if let Some(path) = path.as_deref() {
                // Semantic optionality, not compatibility: without a project there is
                // no session to prove. With one, the epoch is required exactly like
                // any other repository read.
                let epoch = session_epoch
                    .as_deref()
                    .ok_or_else(session::stale_session_error)?;
                validate_session(path, epoch)?;
            }
            Ok(tooling::get_line_endings(path))
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn set_line_endings(mode: String) -> Result<(), AppError> {
    report_result("set_line_endings", tooling::set_line_endings(mode))
}

/// The name Git will give the first branch of the next project it
/// creates. Global like the identity, and absent when Git's own default
/// applies.
#[tauri::command(async)]
pub(crate) fn get_default_branch() -> GitDefaultBranch {
    report_value("get_default_branch", tooling::get_default_branch())
}

#[tauri::command(async)]
pub(crate) fn set_default_branch(name: String) -> Result<(), AppError> {
    report_result("set_default_branch", tooling::set_default_branch(name))
}

#[tauri::command(async)]
pub(crate) fn plan_save_version(
    path: String,
    selected_paths: Option<Vec<String>>,
    session_epoch: String,
) -> Result<SaveVersionPlan, AppError> {
    report_result(
        "plan_save_version",
        (|| {
            validate_session(&path, &session_epoch)?;
            save_version::plan_save_version(path, selected_paths)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn save_version(
    path: String,
    title: String,
    description: Option<String>,
    state_token: String,
    selected_paths: Option<Vec<String>>,
    run_hooks: bool,
    session_epoch: String,
) -> Result<SaveVersionResult, AppError> {
    report_result(
        "save_version",
        (|| {
            validate_session(&path, &session_epoch)?;
            save_version::save_version(
                path,
                title,
                description,
                state_token,
                selected_paths,
                run_hooks,
            )
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn discover_remotes(
    path: String,
    session_epoch: String,
) -> Result<RemoteDiscovery, AppError> {
    report_result(
        "discover_remotes",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::discover_remotes(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_connect_remote(
    path: String,
    session_epoch: String,
    remote_name: String,
    remote_url: String,
) -> Result<ConnectRemotePlan, AppError> {
    report_result(
        "plan_connect_remote",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::plan_connect_remote(path, session_epoch, remote_name, remote_url)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn connect_remote(
    path: String,
    session_epoch: String,
    remote_name: String,
    remote_url: String,
    state_token: String,
) -> Result<ConnectRemoteResult, AppError> {
    report_result(
        "connect_remote",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::connect_remote(path, session_epoch, remote_name, remote_url, state_token)
        })(),
    )
}

/// The project's own settings read the remotes with their editable detail,
/// which `discover_remotes` deliberately does not carry: Publish only needs a
/// name and a safe label.
#[tauri::command(async)]
pub(crate) fn read_project_remotes(
    path: String,
    session_epoch: String,
) -> Result<ProjectRemotes, AppError> {
    report_result(
        "read_project_remotes",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::read_project_remotes(path)
        })(),
    )
}

/// Where the project lives, for Overview's header: the service and path of
/// the remote its branch publishes to. Raw addresses stay on the Rust side.
#[tauri::command(async)]
pub(crate) fn read_remote_home(
    path: String,
    session_epoch: String,
) -> Result<Option<RemoteHome>, AppError> {
    report_result(
        "read_remote_home",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::read_remote_home(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn open_remote_home(
    path: String,
    session_epoch: String,
    remote: String,
) -> Result<(), AppError> {
    report_result(
        "open_remote_home",
        (|| {
            validate_session(&path, &session_epoch)?;
            desktop::open_remote_home(path, remote)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn set_remote_url(
    path: String,
    session_epoch: String,
    remote_name: String,
    remote_url: String,
) -> Result<ProjectRemotes, AppError> {
    report_result(
        "set_remote_url",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::set_remote_url(path, remote_name, remote_url)
        })(),
    )
}

/// The identity *this project* saves as, alongside the one it would inherit.
/// Global identity stays with `get_git_identity`; these three never touch it.
#[tauri::command(async)]
pub(crate) fn read_project_identity(
    path: String,
    session_epoch: String,
) -> Result<ProjectIdentity, AppError> {
    report_result(
        "read_project_identity",
        (|| {
            validate_session(&path, &session_epoch)?;
            project_settings::read_project_identity(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn set_project_identity(
    path: String,
    session_epoch: String,
    name: String,
    email: String,
) -> Result<ProjectIdentity, AppError> {
    report_result(
        "set_project_identity",
        (|| {
            validate_session(&path, &session_epoch)?;
            project_settings::set_project_identity(path, name, email)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn clear_project_identity(
    path: String,
    session_epoch: String,
) -> Result<ProjectIdentity, AppError> {
    report_result(
        "clear_project_identity",
        (|| {
            validate_session(&path, &session_epoch)?;
            project_settings::clear_project_identity(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_ignore_file(
    path: String,
    session_epoch: String,
    scope: String,
) -> Result<IgnoreFile, AppError> {
    report_result(
        "read_ignore_file",
        (|| {
            validate_session(&path, &session_epoch)?;
            project_settings::read_ignore_file(path, scope)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn write_ignore_file(
    path: String,
    session_epoch: String,
    scope: String,
    contents: String,
    state_token: String,
) -> Result<IgnoreFile, AppError> {
    report_result(
        "write_ignore_file",
        (|| {
            validate_session(&path, &session_epoch)?;
            project_settings::write_ignore_file(path, scope, contents, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_project_technology(
    path: String,
    session_epoch: String,
) -> Result<ProjectTechnology, AppError> {
    report_result(
        "read_project_technology",
        (|| {
            validate_session(&path, &session_epoch)?;
            technology::read_project_technology(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_team_sync_status(
    path: String,
    session_epoch: String,
) -> Result<TeamSyncStatus, AppError> {
    report_result(
        "read_team_sync_status",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::read_team_sync_status(path, session_epoch)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn check_team_changes(
    path: String,
    session_epoch: String,
) -> Result<TeamSyncStatus, AppError> {
    report_result(
        "check_team_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::check_team_changes(path, session_epoch)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn stop_tracking_remote(
    path: String,
    session_epoch: String,
) -> Result<TeamSyncStatus, AppError> {
    report_result(
        "stop_tracking_remote",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::stop_tracking_remote(path, session_epoch)
        })(),
    )
}

/// Local only: the plan reads the remote as of the last check and never
/// contacts the network, so the dialog can show it at once.
#[tauri::command(async)]
pub(crate) fn plan_get_team_changes(
    path: String,
    session_epoch: String,
) -> Result<GetTeamChangesPlan, AppError> {
    report_result(
        "plan_get_team_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::plan_get_team_changes(path, session_epoch)
        })(),
    )
}

/// `run_hooks` is the Settings switch the other guided flows follow: it
/// decides whether the project's merge hooks run for a merge version.
#[tauri::command(async)]
pub(crate) fn get_team_changes(
    path: String,
    session_epoch: String,
    state_token: String,
    recovery_reference: String,
    run_hooks: bool,
    on_progress: tauri::ipc::Channel<GetTeamChangesPhase>,
) -> Result<GetTeamChangesResult, AppError> {
    report_result(
        "get_team_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::get_team_changes(
                path,
                session_epoch,
                state_token,
                recovery_reference,
                run_hooks,
                |phase| {
                    let _ = on_progress.send(phase);
                },
            )
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn list_integration_sources(
    path: String,
    session_epoch: String,
) -> Result<IntegrationSources, AppError> {
    report_result(
        "list_integration_sources",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::list_integration_sources(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn check_integration_source(
    path: String,
    session_epoch: String,
    source: IntegrationSource,
) -> Result<(), AppError> {
    report_result(
        "check_integration_source",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::check_integration_source(path, source)
        })(),
    )
}

/// Local only, like Get's plan: the source is read as this computer has it,
/// a remote branch as of its last check.
#[tauri::command(async)]
pub(crate) fn plan_bring_in_changes(
    path: String,
    session_epoch: String,
    source: IntegrationSource,
) -> Result<BringInChangesPlan, AppError> {
    report_result(
        "plan_bring_in_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::plan_bring_in_changes(path, session_epoch, source)
        })(),
    )
}

/// `run_hooks` follows the Settings switch, as Get's does.
#[tauri::command(async)]
pub(crate) fn bring_in_changes(
    path: String,
    session_epoch: String,
    source: IntegrationSource,
    state_token: String,
    recovery_reference: String,
    run_hooks: bool,
    on_progress: tauri::ipc::Channel<GetTeamChangesPhase>,
) -> Result<BringInChangesResult, AppError> {
    report_result(
        "bring_in_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::bring_in_changes(
                path,
                session_epoch,
                source,
                state_token,
                recovery_reference,
                run_hooks,
                |phase| {
                    let _ = on_progress.send(phase);
                },
            )
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn start_overlapping_merge(
    path: String,
    session_epoch: String,
    source: OverlappingMergeSource,
    state_token: String,
    recovery_reference: String,
) -> Result<StartOverlappingMergeResult, AppError> {
    report_result(
        "start_overlapping_merge",
        (|| {
            validate_session(&path, &session_epoch)?;
            sync::start_overlapping_merge(
                path,
                session_epoch,
                source,
                state_token,
                recovery_reference,
            )
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn list_unpublished_versions(
    path: String,
    session_epoch: String,
) -> Result<PendingVersionsResult, AppError> {
    report_result(
        "list_unpublished_versions",
        (|| {
            validate_session(&path, &session_epoch)?;
            status::list_unpublished_versions(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn list_incoming_versions(
    path: String,
    session_epoch: String,
) -> Result<PendingVersionsResult, AppError> {
    report_result(
        "list_incoming_versions",
        (|| {
            validate_session(&path, &session_epoch)?;
            status::list_incoming_versions(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_commit_file_changes(
    path: String,
    commit: String,
    session_epoch: String,
) -> Result<Vec<CommitFileChange>, AppError> {
    report_result(
        "read_commit_file_changes",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_commit_file_changes(path, commit)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_commit_file_diff(
    path: String,
    commit: String,
    file_path: String,
    session_epoch: String,
) -> Result<FileDiff, AppError> {
    report_result(
        "read_commit_file_diff",
        (|| {
            validate_session(&path, &session_epoch)?;
            changes::read_commit_file_diff(path, commit, file_path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_history_page(
    cache: tauri::State<'_, history::HistoryReadCache>,
    path: String,
    cursor: Option<String>,
    page_size: Option<usize>,
    filters: Option<history::HistoryFilters>,
    scope: Option<history::HistoryScope>,
    session_epoch: String,
) -> Result<HistoryPage, AppError> {
    report_result(
        "read_history_page",
        (|| {
            validate_session(&path, &session_epoch)?;
            history::read_history_page_cached(&cache, path, cursor, page_size, filters, scope)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_saved_version_detail(
    cache: tauri::State<'_, history::HistoryReadCache>,
    path: String,
    snapshot_token: String,
    commit: String,
    session_epoch: String,
) -> Result<SavedVersionDetail, AppError> {
    report_result(
        "read_saved_version_detail",
        (|| {
            validate_session(&path, &session_epoch)?;
            history::read_saved_version_detail_cached(&cache, path, snapshot_token, commit)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn read_saved_version_file_diff(
    cache: tauri::State<'_, history::HistoryReadCache>,
    path: String,
    snapshot_token: String,
    commit: String,
    file_path: String,
    session_epoch: String,
) -> Result<FileDiff, AppError> {
    report_result(
        "read_saved_version_file_diff",
        (|| {
            validate_session(&path, &session_epoch)?;
            history::read_saved_version_file_diff_cached(
                &cache,
                path,
                snapshot_token,
                commit,
                file_path,
            )
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_publish(
    path: String,
    remote: Option<String>,
    up_to: Option<String>,
    session_epoch: String,
) -> Result<PublishPlan, AppError> {
    report_result(
        "plan_publish",
        (|| {
            validate_session(&path, &session_epoch)?;
            publish_domain::plan_publish(path, remote, up_to)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn publish(
    path: String,
    remote: String,
    state_token: String,
    up_to: Option<String>,
    run_hooks: bool,
    session_epoch: String,
) -> Result<PublishResult, AppError> {
    report_result(
        "publish",
        (|| {
            validate_session(&path, &session_epoch)?;
            publish_domain::publish(path, remote, state_token, up_to, run_hooks)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn get_branches(
    path: String,
    session_epoch: String,
) -> Result<BranchesSnapshot, AppError> {
    report_result(
        "get_branches",
        (|| {
            validate_session(&path, &session_epoch)?;
            branches::get_branches(path)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn get_branch_history(
    path: String,
    name: String,
    session_epoch: String,
) -> Result<BranchHistory, AppError> {
    report_result(
        "get_branch_history",
        (|| {
            validate_session(&path, &session_epoch)?;
            branches::get_branch_history(path, name)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_create_branch(
    path: String,
    name: String,
    switch: bool,
    start_commit: Option<String>,
    session_epoch: String,
) -> Result<CreateBranchPlan, AppError> {
    report_result(
        "plan_create_branch",
        (|| {
            validate_session(&path, &session_epoch)?;
            branches::plan_create_branch(path, name, switch, start_commit)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn create_branch(
    path: String,
    name: String,
    switch: bool,
    start_commit: Option<String>,
    state_token: String,
    session_epoch: String,
) -> Result<BranchesSnapshot, AppError> {
    report_result(
        "create_branch",
        (|| {
            validate_session(&path, &session_epoch)?;
            branches::create_branch(path, name, switch, start_commit, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_switch_branch(
    path: String,
    target: String,
    session_epoch: String,
) -> Result<SwitchBranchPlan, AppError> {
    report_result(
        "plan_switch_branch",
        (|| {
            validate_session(&path, &session_epoch)?;
            branches::plan_switch_branch(path, target)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn switch_branch(
    path: String,
    target: String,
    state_token: String,
    session_epoch: String,
) -> Result<BranchesSnapshot, AppError> {
    report_result(
        "switch_branch",
        (|| {
            validate_session(&path, &session_epoch)?;
            branches::switch_branch(path, target, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_delete_branch(
    path: String,
    name: String,
    session_epoch: String,
) -> Result<DeleteBranchPlan, AppError> {
    report_result(
        "plan_delete_branch",
        (|| {
            validate_session(&path, &session_epoch)?;
            branches::plan_delete_branch(path, name)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn delete_branch(
    path: String,
    name: String,
    delete_remote: bool,
    state_token: String,
    session_epoch: String,
) -> Result<DeleteBranchResult, AppError> {
    report_result(
        "delete_branch",
        (|| {
            validate_session(&path, &session_epoch)?;
            branches::delete_branch(path, name, delete_remote, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_clean_up_branches(
    path: String,
    names: Vec<String>,
    session_epoch: String,
) -> Result<CleanUpBranchesPlan, AppError> {
    report_result(
        "plan_clean_up_branches",
        (|| {
            validate_session(&path, &session_epoch)?;
            branches::plan_clean_up_branches(path, names)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn clean_up_branches(
    path: String,
    branches: Vec<CleanUpBranchRequest>,
    delete_remote: bool,
    session_epoch: String,
) -> Result<CleanUpBranchesResult, AppError> {
    report_result(
        "clean_up_branches",
        (|| {
            validate_session(&path, &session_epoch)?;
            branches::clean_up_branches(path, branches, delete_remote)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn plan_rename_branch(
    path: String,
    name: String,
    new_name: String,
    session_epoch: String,
) -> Result<RenameBranchPlan, AppError> {
    report_result(
        "plan_rename_branch",
        (|| {
            validate_session(&path, &session_epoch)?;
            branches::plan_rename_branch(path, name, new_name)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn rename_branch(
    path: String,
    name: String,
    new_name: String,
    state_token: String,
    session_epoch: String,
) -> Result<BranchesSnapshot, AppError> {
    report_result(
        "rename_branch",
        (|| {
            validate_session(&path, &session_epoch)?;
            branches::rename_branch(path, name, new_name, state_token)
        })(),
    )
}

#[tauri::command(async)]
pub(crate) fn watch_repository(
    app: tauri::AppHandle,
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
    session_epoch: String,
) -> Result<bool, AppError> {
    report_result(
        "watch_repository",
        (|| {
            validate_session(&path, &session_epoch)?;
            watch::watch_repository(app, registry, path, session_epoch)
        })(),
    )
}

#[tauri::command(async)]
/// Detaching is deliberately not validated — a renderer that has already lost
/// its session must still be able to release the watcher it registered — but it
/// is scoped to the exact epoch, so a late request from an older incarnation
/// cannot detach the watcher a newer one owns.
pub(crate) fn unwatch_repository(
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
    session_epoch: String,
) {
    watch::unwatch_repository(registry, path, session_epoch);
    report_value("unwatch_repository", ());
}

#[tauri::command(async)]
pub(crate) fn close_project_session(
    registry: tauri::State<'_, watch::WatcherRegistry>,
    path: String,
    session_epoch: String,
) -> Result<(), AppError> {
    let _command = application::enter("close_project_session");
    registry.unwatch(&path, &session_epoch);
    report_result(
        "close_project_session",
        session::global().close(&path, &session_epoch),
    )
}

#[cfg(test)]
mod session_boundary_tests {
    use super::*;
    use crate::error::AppErrorCode;
    use crate::test_support::{git_init, unique_temp_dir};

    #[test]
    fn line_endings_stay_global_without_a_project_and_are_epoch_checked_with_one() {
        let path = unique_temp_dir("ipc-line-endings-epoch");
        git_init(&path);

        // No project path: a genuinely global read, with no session to prove.
        assert!(get_line_endings(None, None).is_ok());

        // With one, the epoch is required. Missing is not a compatibility
        // case any more; it is a request that cannot name its session.
        assert_eq!(
            get_line_endings(Some(path.clone()), None).unwrap_err().code,
            AppErrorCode::StaleSession
        );
        assert_eq!(
            get_line_endings(Some(path.clone()), Some("not-an-epoch".into()))
                .unwrap_err()
                .code,
            AppErrorCode::StaleSession
        );

        let epoch = session::global().open(&path, None).unwrap();
        assert!(get_line_endings(Some(path.clone()), Some(epoch.clone())).is_ok());
        session::global().close(&path, &epoch).unwrap();
        assert_eq!(
            get_line_endings(Some(path.clone()), Some(epoch))
                .unwrap_err()
                .code,
            AppErrorCode::StaleSession
        );

        let _ = std::fs::remove_dir_all(&path);
    }

    #[test]
    fn a_repository_read_needs_the_current_epoch() {
        let path = unique_temp_dir("ipc-read-epoch");
        git_init(&path);
        let epoch = session::global().open(&path, None).unwrap();

        assert!(read_working_tree_status(path.clone(), epoch.clone()).is_ok());
        assert!(run_console_query(path.clone(), epoch.clone(), "status".into()).is_ok());
        assert_eq!(
            run_console_query(path.clone(), "not-an-epoch".into(), "status".into())
                .unwrap_err()
                .code,
            AppErrorCode::StaleSession
        );
        assert_eq!(
            run_console_query(path.clone(), epoch.clone(), "status --porcelain".into())
                .unwrap_err()
                .code,
            AppErrorCode::InvalidSelection
        );
        assert_eq!(
            read_working_tree_status(path.clone(), "not-an-epoch".into())
                .unwrap_err()
                .code,
            AppErrorCode::StaleSession
        );

        session::global().close(&path, &epoch).unwrap();
        assert_eq!(
            read_working_tree_diffs(path.clone(), epoch)
                .unwrap_err()
                .code,
            AppErrorCode::StaleSession
        );

        let _ = std::fs::remove_dir_all(&path);
    }
}

#[cfg(test)]
mod contract_tests {
    use super::*;
    use crate::{
        application,
        error::AppErrorCode,
        repository::{HeadState, RepositoryKind},
    };
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Contract {
        commands: Vec<CommandContract>,
        error_codes: Vec<String>,
        session_epoch: SessionEpochContract,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SessionEpochContract {
        required_for_open_repository_commands: bool,
        semantic_exceptions: Vec<SemanticException>,
    }

    #[derive(Deserialize)]
    struct SemanticException {
        command: String,
        reason: String,
    }

    #[derive(Deserialize)]
    struct CommandContract {
        name: String,
        arguments: Vec<String>,
        response: String,
    }

    fn snake_case(value: &str) -> String {
        value
            .trim_end_matches('?')
            .chars()
            .flat_map(|character| {
                if character.is_ascii_uppercase() {
                    vec!['_', character.to_ascii_lowercase()]
                } else {
                    vec![character]
                }
            })
            .collect()
    }

    fn response_name(signature: &str) -> String {
        let Some((_, response)) = signature.split_once("->") else {
            return "void".to_string();
        };
        let mut response = response
            .split('{')
            .next()
            .unwrap_or(response)
            .split_whitespace()
            .collect::<String>();
        if response.starts_with("Result<") && response.ends_with(",AppError>") {
            response = response[7..response.len() - 10].to_string();
        }
        match response.as_str() {
            "()" => "void".to_string(),
            "bool" => "boolean".to_string(),
            "String" => "string".to_string(),
            "&'staticstr" => "string".to_string(),
            value if value.starts_with("Vec<") && value.ends_with('>') => {
                format!("{}[]", &value[4..value.len() - 1])
            }
            value if value.starts_with("Option<") && value.ends_with('>') => {
                format!("{} | null", &value[7..value.len() - 1])
            }
            value => value.to_string(),
        }
    }

    #[test]
    fn checked_contract_matches_registered_adapters_arguments_and_errors() {
        let contract: Contract = serde_json::from_str(include_str!(
            "../../docs/architecture/025-ipc-contract.json"
        ))
        .unwrap();
        let registered = application::EXECUTION_INVENTORY
            .iter()
            .map(|policy| policy.command)
            .collect::<Vec<_>>();
        assert_eq!(
            contract
                .commands
                .iter()
                .map(|command| command.name.as_str())
                .collect::<Vec<_>>(),
            registered
        );

        assert!(contract.session_epoch.required_for_open_repository_commands);
        for exception in &contract.session_epoch.semantic_exceptions {
            assert!(
                !exception.reason.trim().is_empty(),
                "{} needs a documented reason for its optional epoch",
                exception.command
            );
        }

        let source = include_str!("ipc.rs");
        for command in &contract.commands {
            let marker = format!("fn {}(", command.name);
            let start = source
                .find(&marker)
                .unwrap_or_else(|| panic!("missing adapter {}", command.name));
            let tail = &source[start..];
            let end = tail.find('{').unwrap_or(tail.len());
            let signature = &tail[..end];
            let compact_signature = signature.split_whitespace().collect::<String>();
            for argument in &command.arguments {
                let rust_name = snake_case(argument);
                assert!(
                    signature.contains(&rust_name),
                    "{} missing argument {argument}",
                    command.name
                );
                if argument.trim_end_matches('?') == "sessionEpoch" {
                    let is_optional = compact_signature.contains("session_epoch:Option<String>");
                    assert_eq!(
                        is_optional,
                        argument.ends_with('?'),
                        "{} sessionEpoch optionality must match the checked contract",
                        command.name,
                    );
                    // Optionality is a semantic property now, never
                    // compatibility scaffolding: an optional epoch has to be
                    // documented, with its reason, in the contract.
                    let documented = contract
                        .session_epoch
                        .semantic_exceptions
                        .iter()
                        .any(|exception| exception.command == command.name);
                    assert_eq!(
                        is_optional, documented,
                        "{} must be listed under sessionEpoch.semanticExceptions exactly when its epoch is optional",
                        command.name,
                    );
                }
            }
            assert_eq!(
                response_name(signature),
                command.response,
                "{} response",
                command.name
            );
        }

        let codes = [
            AppErrorCode::StaleSession,
            AppErrorCode::PathMissing,
            AppErrorCode::PathUnusable,
            AppErrorCode::NotRepository,
            AppErrorCode::BareRepository,
            AppErrorCode::InvalidCloneSource,
            AppErrorCode::InvalidCloneDestination,
            AppErrorCode::CloneDestinationExists,
            AppErrorCode::CloneDestinationCollides,
            AppErrorCode::StaleClonePlan,
            AppErrorCode::CloneOperationBusy,
            AppErrorCode::CloneOperationMissing,
            AppErrorCode::CloneVerificationFailed,
            AppErrorCode::ClonePublishUncertain,
            AppErrorCode::CloneCleanupRequired,
            AppErrorCode::CloneCleanupUnavailable,
            AppErrorCode::CloneFailed,
            AppErrorCode::Offline,
            AppErrorCode::InvalidProjectName,
            AppErrorCode::ProjectDestinationExists,
            AppErrorCode::ProjectDestinationCollides,
            AppErrorCode::ExistingGitMetadata,
            AppErrorCode::LinkedWorktree,
            AppErrorCode::NestedRepository,
            AppErrorCode::InitializationInspectionIncomplete,
            AppErrorCode::InvalidInitialBranch,
            AppErrorCode::ReadmeAlreadyExists,
            AppErrorCode::StaleInitializePlan,
            AppErrorCode::InitializeFailed,
            AppErrorCode::InitializeVerificationFailed,
            AppErrorCode::InitializeCleanupRequired,
            AppErrorCode::InitializeCleanupUnavailable,
            AppErrorCode::CertificateFailed,
            AppErrorCode::HostKeyFailed,
            AppErrorCode::RemoteNotFound,
            AppErrorCode::DiskFull,
            AppErrorCode::PermissionDenied,
            AppErrorCode::PathTooLong,
            AppErrorCode::GitMissing,
            AppErrorCode::GitUnusable,
            AppErrorCode::GitCommandFailed,
            AppErrorCode::GitTimeout,
            AppErrorCode::InvalidIdentity,
            AppErrorCode::GitConfigWriteFailed,
            AppErrorCode::PathInvalid,
            AppErrorCode::PathNotChanged,
            AppErrorCode::PathEncodingUnsupported,
            AppErrorCode::NothingToSave,
            AppErrorCode::UnresolvedConflicts,
            AppErrorCode::DetachedHead,
            AppErrorCode::GitOperationInProgress,
            AppErrorCode::MissingIdentity,
            AppErrorCode::EmptyTitle,
            AppErrorCode::InvalidTitle,
            AppErrorCode::StalePreview,
            AppErrorCode::StaleHistoryCursor,
            AppErrorCode::HookRejected,
            AppErrorCode::SigningFailed,
            AppErrorCode::IndexUnavailable,
            AppErrorCode::IndexRestoreFailed,
            AppErrorCode::InvalidSelection,
            AppErrorCode::NoRemoteConfigured,
            AppErrorCode::RemoteSelectionRequired,
            AppErrorCode::UnbornBranchNoVersion,
            AppErrorCode::NothingToPublish,
            AppErrorCode::NothingToGet,
            AppErrorCode::BehindRemote,
            AppErrorCode::DivergedHistories,
            AppErrorCode::StalePublishPlan,
            AppErrorCode::StaleGetTeamChangesPlan,
            AppErrorCode::StaleBringInPlan,
            AppErrorCode::ShallowHistory,
            AppErrorCode::NoSharedHistory,
            AppErrorCode::UnsupportedMergeSetup,
            AppErrorCode::InvalidRefName,
            AppErrorCode::AuthenticationFailed,
            AppErrorCode::SecureStorageUnavailable,
            AppErrorCode::ProviderRateLimited,
            AppErrorCode::NetworkTimeout,
            AppErrorCode::OperationCancelled,
            AppErrorCode::InvalidRemoteConfiguration,
            AppErrorCode::RemoteRefMissing,
            AppErrorCode::RemoteRejected,
            AppErrorCode::InvalidRemoteUrl,
            AppErrorCode::RemoteNameExists,
            AppErrorCode::StaleConnectRemotePlan,
            AppErrorCode::RemoteConnectFailed,
            AppErrorCode::RemoteConnectUncertain,
            AppErrorCode::PublishUncertain,
            AppErrorCode::GetTeamChangesUncertain,
            AppErrorCode::GitVersionTooOld,
            AppErrorCode::BranchNameTaken,
            AppErrorCode::BranchNameCollides,
            AppErrorCode::BranchCheckedOutElsewhere,
            AppErrorCode::BranchIsActive,
            AppErrorCode::BranchIsDefault,
            AppErrorCode::BranchMissing,
            AppErrorCode::BranchUniqueWork,
            AppErrorCode::BranchNotFinished,
            AppErrorCode::BranchSwitchObstructed,
            AppErrorCode::StaleBranchPlan,
            AppErrorCode::DirtyWorkingTree,
            AppErrorCode::IncomingTrackedChangeCollision,
            AppErrorCode::RefLocked,
            AppErrorCode::NothingToDiscard,
            AppErrorCode::StaleDiscardPlan,
            AppErrorCode::RecoveryUnavailable,
            AppErrorCode::RecoveryConflict,
            AppErrorCode::RecoveryFailed,
            AppErrorCode::StaleConflictSession,
            AppErrorCode::ConflictActionUnavailable,
            AppErrorCode::ConflictMarkersRemain,
            AppErrorCode::ConflictChoiceNeeded,
            AppErrorCode::ConflictContentNotKept,
            AppErrorCode::FileLocked,
            AppErrorCode::ConflictCaseCollision,
            AppErrorCode::FileRunsAsProgram,
            AppErrorCode::MergeAbortRefused,
            AppErrorCode::MergeStartRefused,
            AppErrorCode::MergeOutcomeUncertain,
            AppErrorCode::IgnoreFileTooLarge,
            AppErrorCode::IgnoreFileNotText,
            AppErrorCode::StaleIgnoreFile,
            AppErrorCode::IgnoreFileWriteFailed,
            AppErrorCode::InstallBlocked,
            AppErrorCode::UnsupportedServer,
        ];
        let serialized = codes
            .iter()
            .map(|code| {
                serde_json::to_value(code)
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .to_string()
            })
            .collect::<Vec<_>>();
        assert_eq!(contract.error_codes, serialized);
    }

    #[test]
    fn representative_response_error_and_event_serialization_are_stable() {
        let repository = RepositoryInfo {
            name: "project".into(),
            path: "/repo".into(),
            selected_path: "/repo".into(),
            git_dir: "/repo/.git".into(),
            common_git_dir: "/repo/.git".into(),
            branch: Some("main".into()),
            head_state: HeadState::Branch,
            kind: RepositoryKind::Repository,
            session_epoch: "epoch-1".into(),
        };
        assert_eq!(
            serde_json::to_value(repository).unwrap(),
            serde_json::json!({
                "name":"project", "path":"/repo", "selectedPath":"/repo", "gitDir":"/repo/.git",
                "commonGitDir":"/repo/.git", "branch":"main", "headState":"branch",
                "kind":"repository", "sessionEpoch":"epoch-1"
            })
        );
        // The one shape whose field names the frontend reads out of a tagged
        // enum variant, and the shape that broke when they were left in
        // snake_case: a picture with no `mediaType` is drawn with an unusable
        // `data:` URL, and no `byteLength` prints as "NaN MB".
        assert_eq!(
            serde_json::to_value(changes::ImagePreview {
                before: Some(changes::ImagePreviewSide::Ready {
                    media_type: "image/png".into(),
                    byte_length: 747,
                    data: "iVBORw0KGgo=".into(),
                }),
                after: Some(changes::ImagePreviewSide::TooLarge {
                    byte_length: 20 * 1024 * 1024,
                    limit_bytes: 10 * 1024 * 1024,
                }),
            })
            .unwrap(),
            serde_json::json!({
                "before": {
                    "kind":"ready", "mediaType":"image/png", "byteLength":747,
                    "data":"iVBORw0KGgo="
                },
                "after": {
                    "kind":"too-large", "byteLength":20971520, "limitBytes":10485760
                }
            })
        );
        assert_eq!(
            serde_json::to_value(changes::WorkingTreeDiffBatch {
                outcome: changes::DiffWarmOutcome::Deferred,
                diffs: Vec::new(),
                changed_files: 900,
                budget_bytes: 2 * 1024 * 1024,
            })
            .unwrap(),
            serde_json::json!({
                "outcome":"deferred", "diffs":[], "changedFiles":900, "budgetBytes":2097152
            })
        );
        assert_eq!(
            serde_json::to_value(session::stale_session_error()).unwrap(),
            serde_json::json!({
                "code":"stale_session", "message":"This result belongs to a project session that is no longer open.",
                "remediation":"Use the currently open project and try again.", "detail": null
            })
        );
        assert_eq!(
            serde_json::to_value(watch::RepositoryInvalidation {
                project_id: "/repo".into(),
                session_epoch: "epoch-1".into(),
                sequence: 7,
                kind: watch::RepositoryInvalidationKind::SharedRepository,
            })
            .unwrap(),
            serde_json::json!({
                "projectId":"/repo", "sessionEpoch":"epoch-1", "sequence":7,
                "kind":"shared_repository"
            })
        );
    }
}

#[tauri::command(async)]
pub(crate) fn gh_diagnostics() -> GitDiagnostics {
    report_value("gh_diagnostics", tooling::gh_diagnostics())
}

#[tauri::command]
pub(crate) fn get_github_auth_state(
    service: tauri::State<'_, GitHubAuthService>,
) -> GitHubAuthSnapshot {
    // Frequent cached reads need not fill the diagnostic ring buffer.
    service.snapshot()
}

#[tauri::command(async)]
pub(crate) fn check_github_auth(
    service: tauri::State<'_, GitHubAuthService>,
) -> GitHubAuthSnapshot {
    report_value("check_github_auth", service.check())
}

#[tauri::command(async)]
pub(crate) fn start_github_login(
    service: tauri::State<'_, GitHubAuthService>,
) -> GitHubAuthSnapshot {
    report_value("start_github_login", service.login())
}

#[tauri::command]
pub(crate) fn cancel_github_auth(
    service: tauri::State<'_, GitHubAuthService>,
    operation_id: String,
) -> GitHubAuthSnapshot {
    report_value("cancel_github_auth", service.cancel(&operation_id))
}

#[tauri::command(async)]
pub(crate) fn install_gh() -> GitInstallationResult {
    report_value("install_gh", tooling::install_gh())
}

#[tauri::command(async)]
pub(crate) fn logout_github_account(
    service: tauri::State<'_, GitHubAuthService>,
    login: String,
) -> GitHubAuthSnapshot {
    report_value("logout_github_account", service.logout(login))
}

#[tauri::command(async)]
pub(crate) fn switch_github_account(
    service: tauri::State<'_, GitHubAuthService>,
    login: String,
) -> GitHubAuthSnapshot {
    report_value("switch_github_account", service.switch(login))
}

#[tauri::command(async)]
pub(crate) fn update_gh() -> GitUpdateLaunchResult {
    report_value("update_gh", tooling::update_gh())
}

#[tauri::command(async)]
pub(crate) fn check_gh_update() -> GitUpdateStatus {
    report_value("check_gh_update", tooling::check_gh_update())
}

#[tauri::command]
pub(crate) fn glab_diagnostics() -> GitDiagnostics {
    report_value("glab_diagnostics", tooling::glab_diagnostics())
}
#[tauri::command]
pub(crate) fn install_glab() -> GitInstallationResult {
    report_value("install_glab", tooling::install_glab())
}
#[tauri::command]
pub(crate) fn update_glab() -> GitUpdateLaunchResult {
    report_value("update_glab", tooling::update_glab())
}
#[tauri::command(async)]
pub(crate) fn check_glab_update() -> GitUpdateStatus {
    report_value("check_glab_update", tooling::check_glab_update())
}
#[tauri::command]
pub(crate) fn get_gitlab_auth_state(
    service: tauri::State<'_, GitLabAuthService>,
) -> GitLabAuthSnapshot {
    let _command = application::enter("get_gitlab_auth_state");
    report_value("get_gitlab_auth_state", service.snapshot())
}
#[tauri::command]
pub(crate) fn check_gitlab_auth(
    service: tauri::State<'_, GitLabAuthService>,
) -> GitLabAuthSnapshot {
    report_value("check_gitlab_auth", service.check_state())
}
#[tauri::command]
pub(crate) fn start_gitlab_login(
    service: tauri::State<'_, GitLabAuthService>,
) -> GitLabAuthSnapshot {
    report_value("start_gitlab_login", service.login())
}
#[tauri::command]
pub(crate) fn logout_gitlab_account(
    service: tauri::State<'_, GitLabAuthService>,
    account_id: String,
) -> GitLabAuthSnapshot {
    report_value("logout_gitlab_account", service.logout(account_id))
}
#[tauri::command]
pub(crate) fn cancel_gitlab_auth(
    service: tauri::State<'_, GitLabAuthService>,
    operation_id: String,
) -> GitLabAuthSnapshot {
    let _command = application::enter("cancel_gitlab_auth");
    report_value("cancel_gitlab_auth", service.cancel(&operation_id))
}
#[tauri::command]
pub(crate) async fn add_gitlab_token(
    service: tauri::State<'_, GitLabAccessService>,
    token: String,
    request_id: String,
) -> Result<String, AppError> {
    report_result("add_gitlab_token", service.add(token, request_id).await)
}
#[tauri::command(async)]
pub(crate) fn remove_gitlab_token(
    service: tauri::State<'_, GitLabAccessService>,
    account_id: String,
) -> Result<(), AppError> {
    let _command = application::enter("remove_gitlab_token");
    report_result("remove_gitlab_token", service.remove(&account_id))
}
#[tauri::command]
pub(crate) async fn add_hosting_server(
    servers: tauri::State<'_, HostingServers>,
    kind: String,
    address: String,
    request_id: String,
) -> Result<AccountCatalog, AppError> {
    report_result(
        "add_hosting_server",
        servers.add(kind, address, request_id).await,
    )
}
#[tauri::command(async)]
pub(crate) fn remove_hosting_server(
    servers: tauri::State<'_, HostingServers>,
    provider: String,
) -> Result<AccountCatalog, AppError> {
    let _command = application::enter("remove_hosting_server");
    report_result("remove_hosting_server", servers.remove(&provider))
}
#[tauri::command]
pub(crate) async fn add_hosting_token(
    servers: tauri::State<'_, HostingServers>,
    provider: String,
    token: String,
    request_id: String,
) -> Result<String, AppError> {
    report_result(
        "add_hosting_token",
        servers.add_token(&provider, token, request_id).await,
    )
}
#[tauri::command(async)]
pub(crate) fn remove_hosting_token(
    servers: tauri::State<'_, HostingServers>,
    account_id: String,
) -> Result<(), AppError> {
    let _command = application::enter("remove_hosting_token");
    report_result("remove_hosting_token", servers.remove_token(&account_id))
}
#[tauri::command]
pub(crate) fn get_hosting_cli_state(
    servers: tauri::State<'_, HostingServers>,
    provider: String,
) -> Result<HostingCliSnapshot, AppError> {
    let _command = application::enter("get_hosting_cli_state");
    report_result(
        "get_hosting_cli_state",
        servers.cli(&provider, CliAction::Read),
    )
}
#[tauri::command]
pub(crate) fn check_hosting_cli(
    servers: tauri::State<'_, HostingServers>,
    provider: String,
) -> Result<HostingCliSnapshot, AppError> {
    report_result(
        "check_hosting_cli",
        servers.cli(&provider, CliAction::Check),
    )
}
#[tauri::command]
pub(crate) fn start_hosting_cli_login(
    servers: tauri::State<'_, HostingServers>,
    provider: String,
) -> Result<HostingCliSnapshot, AppError> {
    report_result(
        "start_hosting_cli_login",
        servers.cli(&provider, CliAction::Login),
    )
}
#[tauri::command]
pub(crate) fn logout_hosting_cli(
    servers: tauri::State<'_, HostingServers>,
    provider: String,
    account: String,
) -> Result<HostingCliSnapshot, AppError> {
    report_result(
        "logout_hosting_cli",
        servers.cli(&provider, CliAction::Logout(account)),
    )
}
#[tauri::command]
pub(crate) fn open_hosting_device_page(
    servers: tauri::State<'_, HostingServers>,
    provider: String,
) -> Result<(), AppError> {
    let _command = application::enter("open_hosting_device_page");
    report_result(
        "open_hosting_device_page",
        servers.open_device_page(&provider),
    )
}
#[tauri::command]
pub(crate) fn cancel_hosting_cli(
    servers: tauri::State<'_, HostingServers>,
    provider: String,
    operation_id: String,
) -> Result<HostingCliSnapshot, AppError> {
    report_result(
        "cancel_hosting_cli",
        servers.cli(&provider, CliAction::Cancel(operation_id)),
    )
}
