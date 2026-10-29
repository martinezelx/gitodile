import { describe, expect, it } from "vitest";
import contract from "../../docs/architecture/025-ipc-contract.json";
import { APP_ERROR_CODES } from "../shared/i18n";

describe("IPC contract snapshot", () => {
  it("keeps command names, arguments, response names, errors and watcher payload stable", () => {
    expect(contract.version).toBe(1);
    expect(contract.commands).toHaveLength(148);
    expect(contract.commands.map((command) => command.name)).toEqual([
      "app_status", "show_main_window", "get_app_update_state", "get_startup_update_confirmation",
      "check_app_update", "download_app_update", "cancel_app_update", "install_app_update",
      "open_repository", "reveal_project_file", "open_project_folder", "plan_clone", "check_clone_source", "cancel_clone_source_check", "clone_repository",
      "cancel_clone", "cleanup_clone", "plan_initialize_project", "initialize_project",
      "cleanup_initialize_project", "read_working_tree_status", "run_console_query",
      "plan_console_command", "run_console_plan", "run_console_change", "read_console_host", "run_console_hosting_query",
      "get_console_settings",
      "set_console_confirm_changes", "read_file_diff", "read_file_image_preview", "read_file_lines", "read_file_markdown", "read_working_tree_diffs",
      "plan_discard_changes",
      "discard_changes", "get_discard_recovery", "list_discard_recoveries",
      "restore_discarded_changes", "delete_discard_recovery",
      "read_conflict_session", "read_conflict_stage", "read_conflict_side_diff",
      "resolve_conflict_side", "mark_conflict_resolved", "reset_conflict_file",
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
      "add_hosting_server", "remove_hosting_server", "add_hosting_token", "remove_hosting_token",
      "get_hosting_cli_state", "check_hosting_cli", "start_hosting_cli_login", "logout_hosting_cli", "cancel_hosting_cli", "open_hosting_device_page",
      "gh_diagnostics", "get_account_catalog", "add_github_token", "remove_github_token", "list_hosting_repositories", "cancel_hosting_request", "check_account_catalog", "read_project_account", "set_project_account", "get_github_auth_state", "check_github_auth", "start_github_login", "cancel_github_auth",
      "logout_github_account",
      "switch_github_account",
      "install_gh", "update_gh", "check_gh_update", "git_diagnostics", "git_installation_details", "reveal_git_location",
      "install_git", "update_git", "check_git_update", "get_git_identity",
      "render_diagnostic_report", "save_diagnostic_report", "set_git_identity",
      "get_line_endings", "set_line_endings", "get_default_branch", "set_default_branch",
      "plan_save_version", "save_version", "discover_remotes", "plan_connect_remote",
      "connect_remote", "read_project_remotes", "read_remote_home", "open_remote_home", "set_remote_url", "read_project_identity",
      "set_project_identity", "clear_project_identity", "read_ignore_file", "write_ignore_file",
      "read_project_technology",
      "read_team_sync_status",
      "check_team_changes", "stop_tracking_remote", "plan_get_team_changes", "get_team_changes", "list_unpublished_versions", "list_incoming_versions",
      "read_commit_file_changes", "read_commit_file_diff", "read_history_page",
      "read_saved_version_detail", "read_saved_version_file_diff", "plan_publish", "publish",
      "get_branches", "get_branch_history", "plan_create_branch", "create_branch",
      "plan_switch_branch", "switch_branch", "plan_delete_branch",
      "delete_branch", "plan_clean_up_branches", "clean_up_branches",
      "plan_rename_branch", "rename_branch",
      "watch_repository", "unwatch_repository", "close_project_session",
    ]);
    expect(contract.commands.find((command) => command.name === "save_version")).toEqual({
      name: "save_version",
      arguments: ["path", "title", "description?", "stateToken", "selectedPaths?", "runHooks", "sessionEpoch"],
      response: "SaveVersionResult",
    });
    for (const commandName of [
      "read_working_tree_status", "run_console_query", "read_console_host", "run_console_hosting_query",
      "plan_console_command", "run_console_plan", "run_console_change",
      "read_file_diff", "read_file_image_preview", "read_file_lines", "read_file_markdown",
      "read_working_tree_diffs",
      "discover_remotes", "list_unpublished_versions", "list_incoming_versions", "read_commit_file_changes",
      "read_commit_file_diff", "get_branches", "get_branch_history",
      "watch_repository", "unwatch_repository",
      "close_project_session",
      "plan_save_version", "save_version", "read_team_sync_status", "check_team_changes", "stop_tracking_remote",
      "plan_connect_remote", "connect_remote",
      "read_project_remotes", "set_remote_url", "read_project_identity", "set_project_identity",
      "read_project_account", "set_project_account",
      "clear_project_identity", "read_ignore_file", "write_ignore_file",
      "plan_get_team_changes", "get_team_changes",
      "plan_publish", "publish",
      "plan_create_branch", "create_branch", "plan_switch_branch",
      "switch_branch", "plan_delete_branch", "delete_branch",
      "plan_clean_up_branches", "clean_up_branches",
      "plan_rename_branch", "rename_branch",
      "plan_discard_changes", "discard_changes", "get_discard_recovery", "list_discard_recoveries",
      "restore_discarded_changes", "delete_discard_recovery",
      "read_conflict_session", "read_conflict_stage", "read_conflict_side_diff",
      "resolve_conflict_side", "mark_conflict_resolved", "reset_conflict_file",
      "read_history_page", "read_saved_version_detail", "read_saved_version_file_diff",
    ]) {
      const command = contract.commands.find(({ name }) => name === commandName);
      expect(command?.arguments, commandName).toContain("sessionEpoch");
      expect(command?.arguments, commandName).not.toContain("sessionEpoch?");
    }
    expect(contract.commands.find((command) => command.name === "read_working_tree_diffs")).toEqual({
      name: "read_working_tree_diffs",
      arguments: ["path", "sessionEpoch"],
      response: "WorkingTreeDiffBatch",
    });
    // Session-epoch optionality is semantic or it does not exist: an optional
    // epoch must be exactly the documented exceptions, never a leftover
    // compatibility allowance.
    expect(contract.sessionEpoch.requiredForOpenRepositoryCommands).toBe(true);
    const optionalEpochCommands = contract.commands
      .filter((command) => command.arguments.includes("sessionEpoch?"))
      .map((command) => command.name);
    expect(optionalEpochCommands).toEqual(["open_repository", "get_line_endings"]);
    expect(contract.sessionEpoch.semanticExceptions.map(({ command }) => command)).toEqual(
      optionalEpochCommands,
    );
    for (const exception of contract.sessionEpoch.semanticExceptions) {
      expect(exception.reason.length, exception.command).toBeGreaterThan(0);
    }
    expect(contract.errorCodes).toEqual(APP_ERROR_CODES);
    // The renderer cannot hand native code a feed, URL, key or target.
    for (const command of contract.commands.filter(({ name }) => name.endsWith("_app_update") || name.includes("app_update_"))) {
      for (const forbidden of ["url", "feed", "publicKey", "endpoint", "target", "headers"]) {
        expect(command.arguments, command.name).not.toContain(forbidden);
      }
    }
    expect(contract.watchEvent).toEqual({
      name: "repository-changed",
      fields: ["projectId", "sessionEpoch", "sequence", "kind"],
      kinds: ["worktree", "head_or_refs", "shared_repository"],
    });
  });
});
