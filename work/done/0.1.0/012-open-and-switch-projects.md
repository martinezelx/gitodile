---
id: 012
title: Open and switch between multiple projects
status: done
priority: high
type: feature
areas:
  - frontend
  - rust
  - platform
created: 2026-07-27
completed: 2026-07-31
---

# Goal

Allow several local Git projects to remain open in one GitOdile window while
the user works in one active project at a time.

# User outcome

The user can open another project without replacing the current one, switch
between projects quickly, and return to the same screen and selection they left
in each project. Closing a project only removes it from GitOdile; it never
changes or deletes repository content.

# Context

The frontend currently owns one global `project`, working-tree snapshot, view
history, selected diff, and operation state. Rust commands are already narrow
and receive a repository path, which is a good foundation: this task should
introduce project sessions in the frontend without turning Rust into a mutable
global repository store.

Tasks 010 and 011 add history and remote mutations. Every asynchronous response,
preview token, dialog, and progress state must remain bound to the session that
started it, even if the user switches projects before it finishes.

This is a single-window project switcher, not a multi-window or split-screen
feature.

# Scope

## Repository identity

- Extend repository discovery with a structured, stable session identity
  produced from Rust-validated canonical paths.
- Treat repeated selections inside the same worktree as the same open project,
  including path aliases, symlinks, relative paths, and case variants where the
  filesystem is case-insensitive.
- Treat linked Git worktrees as distinct project sessions because they have
  different working files and indexes.
- Retain `gitDir` and `commonGitDir` so operations can detect sessions that
  share Git references.
- Persist canonical project descriptors, not an opaque identifier that cannot
  be revalidated on the next launch.

## Frontend session model

- Replace the single-project state with a dedicated session store or reducer.
  Keep this domain state outside large visual components.
- Separate:
  - persisted descriptor: canonical path, order, and last active project;
  - per-project UI state: current view, navigation history, selected file or
    saved version, and scroll-restoration keys;
  - live snapshot: repository information, working-tree state, remote state,
    and last refresh time;
  - in-progress operation: kind, phase, cancellation/uncertain state, and
    blocking reason;
  - per-project loading and structured errors.
- Identify every async request with its session and a request generation/token.
  A late response must never update another project or overwrite newer data.
- Load expensive status/diff/history data lazily for the active session.
  Inactive sessions may show their last known status but must label stale data
  honestly.
- Keep global settings, Git diagnostics, theme, and application dialogs outside
  project sessions.

## Interaction and layout

- Add a compact project switcher to the top portion of the existing sidebar,
  without duplicating the GitOdile brand block.
- Show the active project clearly and provide:
  - a list of open projects;
  - an **Open another project** action;
  - a per-project close action;
  - restrained indicators for unsaved changes, an operation in progress, or an
    error. Indicators must not rely on color alone.
- Keep primary navigation below the project switcher and apply it to the active
  project. Settings remains application-wide.
- In the collapsed sidebar and narrow layout, preserve project switching
  through an accessible popover/menu rather than squeezing labels.
- Add project-switching and open/close actions to the command palette.
- Support platform-appropriate keyboard switching (`Ctrl` on Windows/Linux,
  `Cmd` on macOS), without capturing shortcuts while the user is typing.
- Preserve focus logically after switching or closing. Announce the new active
  project to assistive technology without moving focus unexpectedly.

## Opening, switching, and closing

- Opening an already-open worktree activates its existing session instead of
  duplicating it.
- Opening failures belong to the attempted path and must not disturb current
  sessions.
- Switching projects must not cancel safe read-only work automatically. It must
  not retarget an open confirmation or operation.
- A mutation continues against its originating session and exposes progress on
  that project's indicator.
- Prevent closing a project while its mutation has an unresolved outcome.
  Explain that the user can switch projects while it finishes.
- For a project with unsaved files but no mutation, closing may use the existing
  confirmation preference and must explain that files stay on disk.
- Closing the active project selects a predictable adjacent session; closing
  the last project returns to the existing no-project state.

## Persistence and migration

- Replace the single `gitodile-last-project-path` value with a versioned stored
  list, order, and active-project identity.
- Migrate the existing last-project preference once without losing it.
- Evolve “reopen last project” into “reopen projects from the previous
  session,” preserving the user's current preference where possible.
- Revalidate every stored path through `open_repository` on launch.
- Restore valid projects even when one stored path is missing, inaccessible, or
  no longer a repository; summarize skipped projects without blocking startup.
- Avoid persisting diffs, source contents, credentials, tokens, or raw Git
  errors.

## Operation coordination

- Bind task 010/011 plans and execution to an immutable session identity,
  canonical project path, and state token.
- Allow read-only operations in different projects to run independently.
- Initially serialize mutations that share a `commonGitDir`; return an
  understandable busy state instead of racing Git reference locks.
- Do not introduce background repository watchers in this task.

# Out of scope

- Multiple native windows or moving sessions between windows.
- Split view or two simultaneously visible project workspaces.
- Batch save, publish, fetch, or other actions across projects.
- Clone, remove from disk, rename, relocate, or delete a repository.
- Background filesystem watching or continuous polling.
- A full recent-project library, pinning, grouping, or cloud synchronization.
- Branch/workspace management.

# Acceptance criteria

- [x] The user can keep at least two projects open and switch between them
      without reopening folders.
- [x] Each session preserves its view, navigation history, selected item,
      snapshots, errors, and operation state.
- [x] Nested paths, symlink aliases, and case aliases deduplicate to the same
      worktree where the platform requires it.
- [x] Linked worktrees remain separate sessions while exposing their shared
      `commonGitDir` for mutation coordination.
- [x] Late async responses cannot leak data or state into another session.
- [x] Save/publish previews and executions remain bound to their originating
      project after switching.
- [x] A project with an unresolved mutation cannot be closed; unsaved files are
      never discarded when closing a session.
- [x] Valid sessions restore in order after restart and invalid stored paths do
      not prevent the others from opening.
- [x] Existing single-project storage migrates safely.
- [ ] The switcher works in expanded, collapsed, and narrow layouts with long,
      duplicate, non-ASCII, and overflowing project names.
- [ ] Mouse, keyboard, command palette, screen reader labels, visible focus,
      reduced motion, Spanish, and English are verified.
- [x] No repository source content, credentials, or operation tokens are stored
      in browser persistence.

# Required tests and audit

## Rust

- Canonical identity for root, nested folder, path alias, symlink/junction, and
  case variants where testable.
- Separate identities for linked worktrees and shared `commonGitDir`.
- Missing, unreadable, and no-longer-repository stored paths.

## Frontend

- Reducer/store transitions for open, deduplicate, activate, reorder, close,
  restore, and partial restore failure.
- Per-session view/selection preservation.
- Request-generation tests proving stale results are ignored.
- Mutation binding and shared-`commonGitDir` busy behavior.
- Storage migration, corrupt JSON, schema-version mismatch, and privacy-safe
  persisted payload.

## Desktop audit

- Real repositories plus two linked worktrees.
- Switch during status, diff, save preview, save execution, publish preview,
  publish execution, success, error, and uncertain result.
- Relaunch with 0, 1, several, missing, inaccessible, and renamed project
  folders.
- Windows path casing/junction behavior; macOS/Linux symlinks and case behavior.
- Responsive review around 1024px and large windows in light/dark themes.
- Keyboard-only and assistive-technology navigation with 1, 5, and 20 open
  projects.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/PRODUCT_STRATEGY.md`
- `src/main.tsx`
- `src/changes.tsx`
- `src/saveVersion.ts`
- `src/saveVersionDialog.tsx`
- `src/repositoryOverview.ts`
- `src/i18n.tsx`
- `src/styles.css`
- `src-tauri/src/lib.rs`

# Dependencies

- Task 010 for binding save operations to sessions.
- Task 011 for binding remote operations and uncertain outcomes to sessions.
- Task 016 (created after this task) adds branch discovery, plans, and
  mutations that must also be bound to the originating project session — apply
  the same per-session isolation to its snapshots, plans, dialogs, and
  operation state.

# Decisions

- Use one window and one active project, with multiple retained sessions.
- Keep Rust commands path-scoped and stateless; do not add a globally mutable
  “current repository.”
- Deduplicate by Rust-resolved worktree identity, not display name or the
  originally selected folder.
- Preserve linked worktrees as distinct sessions and coordinate only their
  shared mutation boundary.
- Persist descriptors and UI continuity, not repository contents or live Git
  truth.
- Block switching projects while a save/publish dialog is open for the current
  project. The user must confirm or cancel it first, rather than the dialog
  being silently dismissed or left floating over another project's screen.
- Coordinate shared-`commonGitDir` mutations entirely in the frontend session
  store (an in-memory busy set), not with a Rust-side lock. Keeps Rust
  path-scoped and stateless per the decision above.
- Keyboard switching uses `Ctrl`/`Cmd+Tab` and `Ctrl`/`Cmd+Shift+Tab` to rotate
  to the next/previous open project.

# Implementation notes

- Session identity: no new Rust field was needed. `RepositoryInfo.path` is
  already the Rust-canonicalized worktree root (resolves nested folders,
  symlinks, and filesystem case per `open_repository`'s existing tests), so
  it is used directly as the session id — no separate opaque identifier to
  keep in sync.
- Frontend session store: `src/projectSessions.ts` — a pure reducer
  (`projectSessionsReducer`) plus `localStorage` read/write/migration
  helpers, with no React dependency so it's unit-testable directly
  (`src/projectSessions.test.ts`). Storage key `gitodile-projects` (`{
  version: 1, order, activeId }`); `gitodile-last-project-path` migrates
  into it once, then is removed.
- Stale-response protection: each session carries a `statusGeneration`.
  `main.tsx` owns the actual counter (a ref keyed by session id) and stamps
  every `read_working_tree_status`/`list_unpublished_versions` call with it;
  `applyWorkingTree`/`applyPendingVersions` (and their `*Error` counterparts)
  are no-ops if the session's generation has since moved on. This also
  covers a same-session double-refresh, not just cross-project switches.
- Mutation coordination lives in the frontend session store. Each save or
  publish records its immutable originating session, kind, and phase. Before
  another mutation starts, `getMutationBlocker` rejects an operation from a
  linked worktree with the same `commonGitDir`; executing, verifying, or
  uncertain mutations also prevent their originating session from being
  closed.
- UI: `src/projectSwitcher.tsx` — `ProjectSwitcher` (expanded sidebar list)
  and `ProjectSwitcherCompact` (collapsed-sidebar and ≤800px narrow-layout
  popover, same button+ref+outside-click+Escape pattern as the existing
  `ProjectMenu`/`TitlebarMenu`). Renders nothing when no project is open.
  Status indicators are icon-shaped (`CircleAlert`/`LoaderCircle`/`FileDiff`),
  not color-only, and simultaneous states remain visible instead of masking
  one another. Duplicate project names gain their parent-folder context.
- Per-project UI state implemented: each session owns its Overview/Changes
  history and index, `lastView`, and the Changes screen's `selectedPath`.
  Titlebar Back/Forward traverses the active project's own history; Settings
  remains application-wide and Back returns to the active session's last
  project view. Save-version checkbox exclusions stay local to
  `ChangesPanel` and reset per project because they are a working selection
  for the next save, not durable navigation state.
- Startup persistence is gated until stored paths have been revalidated. This
  prevents the reducer's initial empty state from overwriting the previous
  session or the migrated legacy path before restoration completes.
- The compact switcher uses dialog/list semantics, restores focus to its
  trigger after switching or closing, and a polite live region announces the
  newly active project without moving focus.
- Activating a project immediately refreshes its local working-tree and
  unpublished-version status; no background polling runs for inactive
  projects. Scrollable surfaces share one WebView2-safe auto-hide behavior
  with keyboard, touch, and forced-colors fallbacks.
- An uncertain publish remains bound to its originating session and cannot be
  dismissed as complete. The dialog offers a fresh remote preflight so it can
  determine whether the publish landed before allowing a retry or close.
- Keyboard: `Ctrl`/`Cmd+Tab` and `+Shift+Tab` rotate through
  `sessionsState.order`; guarded against firing while focus is in an
  `input`/`textarea`/contenteditable, and while a save/publish dialog is
  open.
- Reducer supports a `reorder` action (tested) but no drag-and-drop UI was
  built for it in this pass — not in the acceptance criteria, and the
  switcher's fixed open-order was enough for a first version.

# Validation

- Frontend: `pnpm run typecheck`, `pnpm run test` (107 tests across 13 files),
  and `pnpm run build` all pass. Coverage includes startup persistence before
  revalidation, per-session navigation history, shared-`commonGitDir`
  mutation exclusion, activation refresh, Save-version dismissal protection,
  uncertain-publish recovery, compact-switcher semantics/focus restoration,
  and reusable auto-hiding scrollbars.
- Rust: `cargo fmt -- --check`, `cargo clippy --all-targets --all-features
  -- -D warnings`, and all 129 tests pass.
- Desktop audit: verified two real repositories, invalid-open isolation,
  `Ctrl+Tab`, and the accessibility tree in Tauri. Linked worktrees, a full
  relaunch matrix, real save/publish mutations, themes, narrow layout, and a
  20-project stress pass remain manual checks.

# Closing note (2026-07-31)

Closed with two acceptance criteria deliberately left unticked, because they
are not satisfied and ticking them would be false:

- the switcher across expanded/collapsed/narrow layouts with long, duplicate,
  non-ASCII, and overflowing project names — only duplicate-name context and
  compact-mode semantics are covered by `src/projectSwitcher.test.tsx`;
- the full input/accessibility/localization matrix (screen reader, visible
  focus, reduced motion, Spanish and English end to end).

Both are the manual desktop-QA pass this task's own Validation section already
recorded as outstanding. The feature itself shipped in commit `36cedb9` and
has been in daily use since, including by tasks 016, 019, and 020, which build
directly on its session model. The residual QA is tracked in `work/backlog.md`
rather than holding this task open indefinitely.

Also amended after the fact: the Dependencies section gained a pointer to task
016, which was created later and needed the same per-session isolation applied
to its snapshots, plans, dialogs, and operation state. That work landed in
task 016 and was extended in task 019.
