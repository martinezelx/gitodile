#![allow(linker_messages)]

use tauri::Manager;

mod app_updates;
mod application;
#[cfg(test)]
mod architecture;
mod avatar;
mod azure_access;
mod bitbucket_access;
mod branches;
mod changes;
mod cli_auth;
mod clone;
mod conflicts;
mod console;
mod credentials;
mod desktop;
mod diagnostics;
mod encoding;
mod error;
mod git;
mod git_command;
mod github_access;
mod github_auth;
mod gitlab_access;
mod gitlab_auth;
mod history;
pub mod hosting;
mod hosting_access;
mod index;
mod initialize;
mod ipc;
mod operation;
mod platform;
mod project_settings;
#[path = "publish.rs"]
mod publish_domain;
mod recovery;
mod repository;
mod repository_access;
mod save_version;
mod session;
mod status;
mod sync;
mod technology;
mod tooling;
mod watch;

#[cfg(test)]
use changes::*;
#[cfg(test)]
use clone::*;
#[cfg(test)]
use error::{AppError, AppErrorCode};
#[cfg(test)]
use git_command::*;
#[cfg(test)]
use history::*;
#[cfg(test)]
use initialize::*;
#[cfg(test)]
use operation::*;
#[cfg(test)]
use publish_domain::*;
#[cfg(test)]
use recovery::*;
#[cfg(test)]
use repository::*;
#[cfg(test)]
use save_version::*;
#[cfg(test)]
use status::*;
#[cfg(test)]
use sync::*;

#[cfg(test)]
use std::path::Path;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(diagnostics::install_global())
        .manage(watch::WatcherRegistry::default())
        .manage(clone::CloneOperationRegistry::default())
        .manage(history::HistoryReadCache::default())
        .manage(github_auth::GitHubAuthService::default())
        .manage(gitlab_auth::GitLabAuthService::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            avatar::install(app.path().app_cache_dir()?.join("avatars"));
            let github = app
                .state::<github_auth::GitHubAuthService>()
                .inner()
                .clone();
            let access = github_access::GitHubAccessService::new(
                github,
                app.path()
                    .app_config_dir()?
                    .join("github-token-accounts.json"),
            );
            app.manage(access.clone());
            let gitlab = gitlab_access::GitLabAccessService::new(
                app.state::<gitlab_auth::GitLabAuthService>()
                    .inner()
                    .clone(),
                app.path()
                    .app_config_dir()?
                    .join("gitlab-token-accounts.json"),
            );
            app.manage(gitlab.clone());
            let bitbucket = bitbucket_access::BitbucketAccessService::new(
                app.path()
                    .app_config_dir()?
                    .join("bitbucket-token-accounts.json"),
            );
            app.manage(bitbucket.clone());
            let accounts = credentials::install(
                app.path().app_config_dir()?.join("account-selections.json"),
                hosting::providers(access, gitlab, bitbucket),
            );
            app.manage(hosting::HostingServers::load(
                app.path().app_config_dir()?,
                accounts.clone(),
            ));
            app.manage(azure_access::AzureOrganizations::load(
                app.path().app_config_dir()?,
                accounts.clone(),
            ));
            hosting::sync_accounts_after_launch(accounts.clone());
            app.manage(accounts);
            app.manage(app_updates::AppUpdateService::new(app.handle()));
            app.manage(console::ConsoleSettings::for_app(app.handle()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::add_azure_token,
            ipc::remove_azure_token,
            ipc::cancel_azure_request,
            ipc::app_status,
            ipc::show_main_window,
            ipc::get_app_update_state,
            ipc::get_startup_update_confirmation,
            ipc::check_app_update,
            ipc::download_app_update,
            ipc::cancel_app_update,
            ipc::install_app_update,
            ipc::reveal_project_file,
            ipc::open_project_folder,
            ipc::open_repository,
            ipc::plan_clone,
            ipc::check_clone_source,
            ipc::cancel_clone_source_check,
            ipc::clone_repository,
            ipc::cancel_clone,
            ipc::cleanup_clone,
            ipc::plan_initialize_project,
            ipc::initialize_project,
            ipc::cleanup_initialize_project,
            ipc::read_working_tree_status,
            ipc::run_console_query,
            ipc::read_console_host,
            ipc::run_console_hosting_query,
            ipc::plan_console_command,
            ipc::run_console_plan,
            ipc::run_console_change,
            ipc::get_console_settings,
            ipc::set_console_confirm_changes,
            ipc::read_file_diff,
            ipc::read_file_image_preview,
            ipc::read_file_lines,
            ipc::read_file_markdown,
            ipc::read_working_tree_diffs,
            ipc::plan_discard_changes,
            ipc::discard_changes,
            ipc::get_discard_recovery,
            ipc::list_discard_recoveries,
            ipc::restore_discarded_changes,
            ipc::delete_discard_recovery,
            ipc::read_conflict_session,
            ipc::read_conflict_stage,
            ipc::read_conflict_side_diff,
            ipc::resolve_conflict_side,
            ipc::mark_conflict_resolved,
            ipc::reset_conflict_file,
            ipc::open_conflict_file,
            ipc::check_conflict_working_file,
            ipc::plan_finish_merge,
            ipc::finish_merge,
            ipc::plan_abort_merge,
            ipc::abort_merge,
            ipc::glab_diagnostics,
            ipc::install_glab,
            ipc::update_glab,
            ipc::check_glab_update,
            ipc::get_gitlab_auth_state,
            ipc::check_gitlab_auth,
            ipc::start_gitlab_login,
            ipc::logout_gitlab_account,
            ipc::cancel_gitlab_auth,
            ipc::add_gitlab_token,
            ipc::remove_gitlab_token,
            ipc::add_bitbucket_token,
            ipc::remove_bitbucket_token,
            ipc::add_hosting_server,
            ipc::remove_hosting_server,
            ipc::add_hosting_token,
            ipc::remove_hosting_token,
            ipc::get_hosting_cli_state,
            ipc::check_hosting_cli,
            ipc::start_hosting_cli_login,
            ipc::logout_hosting_cli,
            ipc::cancel_hosting_cli,
            ipc::open_hosting_device_page,
            ipc::gh_diagnostics,
            ipc::get_account_catalog,
            ipc::add_github_token,
            ipc::remove_github_token,
            ipc::list_hosting_repositories,
            ipc::cancel_hosting_request,
            ipc::check_account_catalog,
            ipc::read_project_account,
            ipc::set_project_account,
            ipc::get_github_auth_state,
            ipc::check_github_auth,
            ipc::start_github_login,
            ipc::cancel_github_auth,
            ipc::logout_github_account,
            ipc::switch_github_account,
            ipc::install_gh,
            ipc::update_gh,
            ipc::check_gh_update,
            ipc::git_diagnostics,
            ipc::git_installation_details,
            ipc::reveal_git_location,
            ipc::install_git,
            ipc::update_git,
            ipc::check_git_update,
            ipc::get_git_identity,
            ipc::render_diagnostic_report,
            ipc::save_diagnostic_report,
            ipc::set_git_identity,
            ipc::get_line_endings,
            ipc::set_line_endings,
            ipc::get_default_branch,
            ipc::set_default_branch,
            ipc::plan_save_version,
            ipc::save_version,
            ipc::discover_remotes,
            ipc::plan_connect_remote,
            ipc::connect_remote,
            ipc::read_project_remotes,
            ipc::read_remote_home,
            ipc::open_remote_home,
            ipc::set_remote_url,
            ipc::read_project_identity,
            ipc::set_project_identity,
            ipc::clear_project_identity,
            ipc::read_ignore_file,
            ipc::write_ignore_file,
            ipc::read_project_technology,
            ipc::read_team_sync_status,
            ipc::check_team_changes,
            ipc::stop_tracking_remote,
            ipc::plan_get_team_changes,
            ipc::get_team_changes,
            ipc::list_integration_sources,
            ipc::check_integration_source,
            ipc::plan_bring_in_changes,
            ipc::bring_in_changes,
            ipc::start_overlapping_merge,
            ipc::list_unpublished_versions,
            ipc::list_incoming_versions,
            ipc::read_commit_file_changes,
            ipc::read_commit_file_diff,
            ipc::read_history_page,
            ipc::read_saved_version_detail,
            ipc::read_saved_version_file_diff,
            ipc::plan_publish,
            ipc::publish,
            ipc::get_branches,
            ipc::get_branch_history,
            ipc::plan_create_branch,
            ipc::create_branch,
            ipc::plan_switch_branch,
            ipc::switch_branch,
            ipc::plan_delete_branch,
            ipc::delete_branch,
            ipc::plan_clean_up_branches,
            ipc::clean_up_branches,
            ipc::plan_rename_branch,
            ipc::rename_branch,
            ipc::watch_repository,
            ipc::unwatch_repository,
            ipc::close_project_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running GitOdile");
}

#[cfg(test)]
#[path = "tests/changes_tests.rs"]
mod changes_tests;
#[cfg(test)]
#[path = "tests/clone_tests.rs"]
mod clone_tests;
#[cfg(test)]
#[path = "tests/conflict_tests.rs"]
mod conflict_tests;
#[cfg(test)]
#[path = "tests/core_workflow_tests.rs"]
mod core_workflow_tests;
#[cfg(test)]
#[path = "tests/git_command_tests.rs"]
mod git_command_tests;
#[cfg(test)]
#[path = "tests/history_tests.rs"]
mod history_tests;
#[cfg(test)]
#[path = "tests/initialize_tests.rs"]
mod initialize_tests;
#[cfg(test)]
#[path = "tests/publish_tests.rs"]
mod publish_tests;
#[cfg(test)]
#[path = "tests/recovery_tests.rs"]
mod recovery_tests;
#[cfg(test)]
#[path = "tests/repository_tests.rs"]
mod repository_tests;
#[cfg(test)]
#[path = "tests/save_version_tests.rs"]
mod save_version_tests;
#[cfg(test)]
#[path = "tests/status_tests.rs"]
mod status_tests;
#[cfg(test)]
#[path = "tests/sync_tests.rs"]
mod sync_tests;
#[cfg(test)]
mod test_support;
