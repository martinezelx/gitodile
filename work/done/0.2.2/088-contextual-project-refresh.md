---
id: 088
title: Make project refresh contextual instead of repetitive
status: done
priority: normal
type: improvement
areas:
  - frontend
  - overview
  - status
  - history
  - branches
  - sync
  - accessibility
created: 2026-08-29
completed: 2026-08-29
parent:
queue:
---

# Goal

Replace the repeated, visually equivalent refresh controls with a truthful
model that distinguishes automatic local freshness, contextual recovery, and
the explicit remote check available from the status bar.

# User outcome

People no longer have to remember what the same circular-arrow icon means on
each screen. Local project data updates automatically while the watcher is
healthy, failed or stale sections offer recovery where the problem appears,
and checking the remote project remains one consistent action from any screen.

# Context

Overview, Changes, History, and the status bar currently reuse very similar
refresh affordances for materially different work. Overview coordinates
repository identity, working-tree status, pending versions, a network check,
branches, history, and cached sync facts. Changes reads local status,
History reloads its own timeline, and the status bar checks only the configured
remote destination.

Task 075 deliberately reduced Overview to one screen-level refresh. Tasks 084
and 085 later made the status bar an always-visible source of project truth and
kept its refresh remote-only. With watcher-driven invalidation now established,
the persistent local controls can be quieter without removing recovery paths.

# Scope

- Track the actual per-session watcher registration result rather than passing
  the watcher preference to project screens as if it proved availability.
- Remove Overview's permanent omnibus refresh.
- Add local, remote, and history retry actions only beside the Overview section
  whose initial or retained snapshot failed.
- Keep Changes' manual refresh inside the same rounded contextual notice used
  by History when automatic watching is off or unavailable, or when the
  current local snapshot failed to refresh.
- Remove History's permanent full-timeline refresh and expose it in the watcher
  notice or beside a failed snapshot.
- Add a retry beside the Branches stale-snapshot warning.
- Keep the status-bar action remote-only and give equivalent remote retry
  actions the same semantics and state.
- Add separate command-palette actions for local status, remote comparison, and
  the active screen where that screen owns a narrower refresh.
- Preserve cached data, loading feedback, keyboard access, live announcements,
  English/Spanish copy, forced colours, reduced motion, and narrow layouts.
- Update durable design documentation and focused tests.

# Out of scope

- Automatic remote polling.
- A universal status-bar refresh that mixes disk reads and network access.
- New Rust commands or changes to Git operation policy.
- Changing repository invalidation, history pagination, or cache limits.
- Adding a new Sync screen.

# Acceptance criteria

- [x] Overview has no permanent generic refresh control.
- [x] Overview errors retain direct, section-owned local, remote, and history
      recovery actions without duplicating them in healthy states.
- [x] Changes has no permanent checker or elapsed-time freshness label; its
      rounded notice owns manual recovery when watching is off or unavailable.
- [x] A failed or disabled watcher keeps a visible, keyboard-reachable local
      refresh and truthful explanatory copy.
- [x] History has no permanent refresh in a healthy state; watcher-off,
      watcher-unavailable, and failed-snapshot states retain contextual retry.
- [x] Branches can retry a failed background refresh while preserving the
      last known inventory.
- [x] The status bar continues to perform only an explicit remote comparison.
- [x] Command-palette labels expose the exact scope of every manual check.
- [x] Focused component/runtime tests and `pnpm run check` pass.

# Relevant files

- `src/app/App.tsx`
- `src/app/StatusBar.tsx`
- `src/app/translations.ts`
- `src/features/changes/ChangesPanel.tsx`
- `src/features/history/HistoryPanel.tsx`
- `src/features/overview/OverviewPanel.tsx`
- `src/features/overview/HistorySummarySection.tsx`
- `src/features/sync/TeamChangesSection.tsx`
- `src/features/branches/BranchesPanel.tsx`
- `DESIGN.md`

# Dependencies

- Task 075, completed.
- Task 084, completed.
- Task 085, completed.

# Decisions

**Separate local and remote freshness.** Local repository facts are maintained
by watcher invalidation and feature-owned caches. Remote knowledge changes only
after an explicit action and remains globally available in the status bar.

**Recovery stays with its owner.** A retry appears beside the failed fact or
screen. The app shell may expose accelerators, but it does not absorb feature
errors or reinterpret one generic refresh according to the current screen.

**Keep transitions quiet.** Watcher startup is transient and does not need a
checker or warning. Confirmed off/unavailable states and failed reads expose a
rounded, feature-owned notice with manual recovery.

# Implementation notes

- Replaced the Overview-wide refresh activity coordinator with per-session
  watcher registration state. The active Changes screen now distinguishes
  `starting`, `watching`, `off`, and `unavailable`, and only hides its local
  check after both the repository event listener and native watch registration
  are confirmed.
- Removed the permanent Overview refresh. Working-tree and unpublished-version
  errors retry the local status controller, remote unknown/stale/error states
  retry only the sync controller, and history errors retry the shared history
  controller while preserving cached content.
- Kept the status-bar cloud action remote-only and made that scope explicit in
  its accessible name. The command palette now exposes separate local and
  remote checks, plus History and Branches refresh commands only on their owning
  screens.
- Removed History's healthy-state refresh, added its manual action to the
  rounded watcher notice and failed snapshot, added a retained-snapshot retry
  to Branches, and kept healthy cards free of redundant checker buttons.
- Updated English and Spanish copy, live-region ownership, CSS for contextual
  error actions, `DESIGN.md`, integration tests, and component tests.

# Validation

- Follow-up contextual History refinement: `pnpm run check` passed with 56
  frontend files / 470 tests, production build, Rust formatting, Clippy, and
  306 Rust tests.
- Follow-up Changes refinement removes the elapsed-time label and its timer,
  and matches History's contextual notice hierarchy.
- Final aggregate validation after that refinement: `pnpm run check` passed
  with 56 frontend files / 465 tests, production build, Rust formatting,
  Clippy, and 306 Rust tests.
- Changes and History now share one automatic-updates notice above the screen
  title. Both use “Update now” and link directly to General settings so the
  watcher can be re-enabled without hunting through navigation.
- Both notice actions now use the same quiet-button treatment. Manual refresh
  keeps the notice visible and reports progress with “Updating…” plus a
  spinning icon; History's click path is covered against its real controller.
- Copy now consistently says “Automatic updates”. Settings briefly explains
  what changes trigger them and when disabling may help; notices avoid repeated
  instructions and say only that the current screen may be out of date.
- Final copy validation: `pnpm run check` passed with documentation and
  architecture checks, 56 frontend files / 465 tests, production build, Rust
  formatting, Clippy, and 306 Rust tests.

- `pnpm exec vitest run src/app/StatusBar.test.tsx src/features/changes/ChangesPanel.test.tsx src/features/sync/TeamChangesSection.test.tsx src/features/overview/HistorySummarySection.test.tsx src/features/overview/PendingVersionsSection.test.tsx src/features/branches/BranchesPanel.test.tsx src/features/history/HistoryPanel.test.tsx src/app/App.test.tsx` — 8 files, 123 tests passed.
- `pnpm run typecheck` — passed.
- Local browser inspection — the frontend shell rendered without console errors;
  repository-owned states were verified through the focused component and App
  integration fixtures because a plain browser cannot open a native project.
- `pnpm run check` — passed: documentation (143 Markdown files, 109 task IDs),
  frontend architecture (297 modules), TypeScript, 56 frontend files / 469
  tests, production build, Rust formatting, Clippy, and 306 Rust tests.
