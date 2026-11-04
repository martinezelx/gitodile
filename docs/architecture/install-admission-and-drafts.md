# Install admission and draft protection

This is the durable implementation contract delivered by task 065-9-2 and
consumed by the native lifecycle in task 065-9-3. It still does not define the
update UI or publish releases.

## Native admission boundary

`application::InstallAdmissionCoordinator` is the single process-wide owner.
Starting ordinary work and closing the install gate both use the same mutex:
either an operation registers first and the install attempt observes it, or the
install gate closes first and the new operation waits. Per-repository locks
still protect Git consistency, but never stand in for this application-wide
boundary.

Every `ExecutionPolicy` must select one `InstallAdmissionPolicy`:

- `Block`: local, history, remote, destructive and platform mutations. An
  active blocker rejects installation with `install_blocked`; it is never
  cancelled. New blockers wait while a successful admission guard is held.
- `Drain`: safe reads. Admission cancels the operation's normal cancellation
  token and waits up to five seconds for its activity guard to drop. Timing out
  rejects installation and reopens the gate.
- `Allow`: bounded control/lifecycle work that cannot start Git or another
  external process. It remains usable during preparation.

`InstallPreparation` owns both the admission guard and suspended native watch
registrations. Any error or dropped preparation restores watchers before
reopening admission. The native updater holds it continuously until
the installer accepts handoff; failed revalidation or handoff drops it.

### Current operation inventory

The executable source of truth is `application::EXECUTION_INVENTORY`. Its
current commands have these policies:

| Policy | Current commands | Reason |
| --- | --- | --- |
| `Allow` | `app_status`, `show_main_window`, `get_app_update_state`, `get_startup_update_confirmation`, `cancel_app_update`, `render_diagnostic_report` | In-memory/window control only; no Git or external process starts. Exact cancellation only signals the owned check/download. |
| `Drain` | `check_app_update`, `open_repository`, `reveal_project_file`, `plan_clone`, `plan_initialize_project`, `read_working_tree_status`, `read_file_diff`, `read_file_image_preview`, `read_file_lines`, `read_working_tree_diffs`, `plan_discard_changes`, `get_discard_recovery`, `list_discard_recoveries`, `git_diagnostics`, `check_git_update`, `get_git_identity`, `get_line_endings`, `get_default_branch`, `plan_save_version`, `discover_remotes`, `plan_connect_remote`, `read_project_remotes`, `read_project_identity`, `read_ignore_file`, `read_team_sync_status`, `list_unpublished_versions`, `read_commit_file_changes`, `read_commit_file_diff`, `read_history_page`, `read_saved_version_detail`, `read_saved_version_file_diff`, `read_saved_version_file_markdown`, `get_branches`, `get_branch_history`, `plan_create_branch`, `plan_switch_branch`, `plan_delete_branch`, `plan_clean_up_branches`, `plan_rename_branch`, `watch_repository` | Read-only work may stop through its existing token. Persistent watch registrations are additionally suspended as described below. |
| `Block` | `download_app_update`, `install_app_update`, `clone_repository`, `cancel_clone`, `cleanup_clone`, `initialize_project`, `cleanup_initialize_project`, `discard_changes`, `restore_discarded_changes`, `delete_discard_recovery`, `install_git`, `update_git`, `save_diagnostic_report`, `set_git_identity`, `set_line_endings`, `set_default_branch`, `save_version`, `connect_remote`, `set_remote_url`, `set_project_identity`, `clear_project_identity`, `write_ignore_file`, `check_team_changes`, `plan_get_team_changes`, `get_team_changes`, `plan_publish`, `publish`, `create_branch`, `switch_branch`, `delete_branch`, `clean_up_branches`, `rename_branch`, `unwatch_repository`, `close_project_session` | These change repository, remote, platform, persisted application state, retained update bytes, or owned operation state. Planning sync/publish commands may fetch, invoke credentials, or update refs, so they are mutations despite their names. Watch/session teardown waits so suspended registrations cannot be resurrected after their session closes. `install_app_update` is the gate owner: it invokes `begin_install_admission` instead of registering itself as a blocker. |

Repository authorization registers admission before repository discovery, so a
discovery Git process cannot race installation. All production Git processes
then pass through `git_command.rs` and the bounded runner. Hooks and credential
helpers are descendants of those guarded commands: because their parent
operation is `Block` whenever either may mutate or prompt, they are never
terminated for app installation. Clone/create are global blockers even before
a project exists, and the registry covers unrelated projects at once.

`tooling.rs` is the only other production process owner. Read-only `winget`
checks and `gh --version` receive the ordinary drain token. `gh_diagnostics`
and `check_gh_update` use `Drain`; `install_gh` and `update_gh` use `Block`, just
like their Git counterparts. A Windows Git or GitHub CLI install/update launches a
visible `winget` process that outlives its IPC response, so its reaper thread
holds a second background `Block` guard until the child exits. No successful
install admission can overlap that helper.

`WatcherRegistry::suspend_all` removes every project's registrations, drops the
native watcher backends, disconnects their debounce workers normally, and
retains enough registration data to restore them on drop. Renderer-owned
automatic remote-check intervals and project cache warmers implement
`InstallParticipant`; preparation stops them and returns an idempotent resume
function. UI-only clocks, tooltip/copy delays, scroll persistence and menu event
listeners do not initiate repository or platform work and need no participant.

## Extension rules

A new native command cannot omit `ExecutionPolicy.install_admission`.

1. Conflict completion/abort, integration, stash creation/application/removal,
   recovery, and any operation that may run a hook, credential helper or write
   refs/index/worktree/config use `Block`.
2. A safe read may use `Drain` only when every process and wait it starts owns
   and observes the command's cancellation token, then drops its activity after
   normal cleanup.
3. A child process or worker that outlives its initiating IPC must move an
   `OperationActivity` into its actual owner/reaper. Returning from IPC is not
   completion.
4. Long-lived native watchers and renderer timers that can initiate work must
   implement suspend/restore ownership. `Allow` is restricted to controls that
   cannot reach Git, credentials, user files, or an external process.
5. The implemented updater order is: synchronously prepare renderer drafts; suspend
   renderer participants; acquire native admission and drain reads; suspend
   native watchers; revalidate the candidate; hand off. Any failure releases
   the completed steps in reverse order.

## Draft inventory and restart contract

The renderer draft registry uses versioned, bounded (128 KiB per envelope),
synchronous `localStorage` records. Records contain a stable owner identifier,
a safe label and the draft value. Preparation reparses every record instead of
trusting a previous write. A quota/write/parse failure becomes an actionable
blocker. The registry never writes a tracked or untracked project file, Git
index, ref, history or Git configuration.

Owner IDs remain renderer-local because their storage keys may contain project
paths. The updater adapter forwards only a protected-owner count and bounded safe
blocker labels to native `DraftPreparation`; malformed records use a generic
label rather than reflecting their key.

| Draft/state owner | Protection | Install consequence |
| --- | --- | --- |
| Save Version title/details and Changes quick-save title/description | Persisted per project; restored after project switch, component unmount or restart; cleared only after success or explicit discard | Protected owner is reported to native preparation. Persistence failure blocks. |
| Application identity, custom remote-check cadence and custom default-branch input | Existing panel close guard requires save/discard; live draft registers a blocker. Other preferences already persist immediately in application storage. | User must save or discard before install. |
| Project remote edits/connect URL, ignore editor and project identity | Existing project-settings close guard protects ignore/identity; all dirty sections register blockers. Remote URLs are deliberately not copied into install storage because they may contain credentials. | User must save or discard before install. |
| Clone and project-creation forms | Operation itself is a native blocker once started; an unfinished form registers a blocker. Remote URLs are not persisted. | User must finish or explicitly close/discard the form. |
| Branch quick create, create dialog and rename dialog | Non-empty names register blockers. | User must finish or discard the edit. |
| Publish/Get Changes/Discard dialogs | No unsubmitted free-text content; selection is a transient confirmation of a freshly planned operation. | Replan after restart; no user-authored draft is lost. |
| History/change/branch filters, searches, selected tabs/rows, scroll offsets, notices and menus | Navigation/view state, not authored project work. Durable preferences and existing scroll state keep their current owners. | Disposable; never delays install. |

The updater controller calls renderer preparation before it closes or
replaces any overlay. Thus a blocker cannot disappear merely because updater UI
unmounted its owner. Persisted version messages are proven independently of a
mounted component. Later conflict editors must persist a bounded draft together
with the exact base/input identity needed to validate restoration, or register
an actionable blocker; stash/integration message fields follow the same rule.
Sensitive credentials and remote URLs must use blockers, never browser draft
storage.
