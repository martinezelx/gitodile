---
id: 085
title: Add a safe status-bar branch switcher and improve legibility
status: done
priority: normal
type: improvement
areas:
  - frontend
  - branches
  - accessibility
  - documentation
created: 2026-08-28
completed: 2026-08-28
parent:
queue:
---

# Goal

Turn the active branch fact in the status bar into a safe quick-switch
entry point and make the now-interactive strip easier to read and operate.

# User outcome

People can move to another branch from any project screen without losing
the existing safety preview, while the status text and remote-check control are
comfortable to scan and target.

# Context

Task 084 made the status bar truthful. The active branch is now useful enough to
invite interaction, but it remains static and the original visual-preview
dimensions leave its 11.5px copy and 20px refresh control too small for a
standing interactive surface.

Overview already has a bounded quick-switch menu backed by the shared cached
branch snapshot. The status bar should reuse that behavior rather than
create a second selector with different ordering, focus handling, or safety.

# Scope

- Extract the bounded branch selector into its owning feature and reuse
  it in Overview and the status bar.
- Open the status-bar menu upward and keep its resting treatment quiet.
- Route a selected branch through the existing safe switch dialog and operation
  coordination; never switch directly from the menu.
- Keep detached and unborn branch labels non-interactive when switching is not
  available.
- Increase status-bar text, icons, height, and refresh target modestly.
- Keep the status-bar refresh scoped to the explicit project comparison.
- Update durable design documentation and focused tests.

# Out of scope

- A second project switcher in the status bar.
- A global refresh that replaces feature-owned refresh and retry controls.
- Changing branch safety policy or adding Rust commands.
- Redesigning the Branches screen or Overview summary card.

# Acceptance criteria

- [x] The branch label opens one bounded, keyboard-accessible menu on every
      project screen and exposes its expanded state.
- [x] The selector uses the shared cached branch snapshot and offers at most six
      switch targets plus a route to the full Branches screen.
- [x] Choosing a branch opens the existing safe switch flow and preserves dirty
      work, mutation blocking, confirmation, and recovery behavior.
- [x] Detached/unborn or unavailable states remain truthful and non-clickable.
- [x] Overview and the status bar share one selector implementation.
- [x] The strip and refresh control are visibly larger without overflow at the
      1024px supported width in English or Spanish.
- [x] The refresh action remains a remote-only team check with a precise
      accessible name and tooltip.
- [x] `pnpm run check` passes.

# Relevant files

- `src/app/App.tsx`
- `src/app/StatusBar.tsx`
- `src/app/app-shell.css`
- `src/features/overview/OverviewPanel.tsx`
- `src/features/overview/overview.css`
- `src/features/branches/`
- `DESIGN.md`

# Dependencies

Task 084, completed.

# Decisions

**Branch is the only new status-bar selector.** The project already has
a persistent switcher in the rail and a collapsed-rail jump menu. Adding the
project name here would consume the horizontal budget and turn the strip into
a duplicate toolbar.

**Quick selection does not mean immediate mutation.** The menu only chooses a
target. The existing plan and confirmation dialog still owns the switch and
all dirty-worktree or linked-worktree blockers.

**Refresh remains local to its fact cluster.** The button beside the cloud
state checks project changes only. Changes, Branches, History, and Overview keep
their own refresh/retry controls because they have different freshness owners
and failure recovery.

# Implementation notes

- Added `BranchQuickSwitch` to the branches feature and reused it in
  Overview and the app status bar. It reads the already-owned cached snapshot,
  omits the active branch and branches open in another worktree, and caps the menu at
  six targets.
- The portal flyout chooses its available side, so the same component opens
  below the Overview control and above the bottom status bar. Shared popup-menu
  keyboard handling supplies initial focus, arrow-key movement, Enter, Home,
  End, and Escape focus restoration.
- Selection only sets the app-owned target. `BranchesDialog` still plans
  and executes the operation, including dirty-worktree hand-offs and mutation
  coordination.
- Raised the strip to 34px with 13px copy, 14px icons, and a 28px remote-check
  target; coarse pointers retain 44px targets. Flex bounds and ellipsis protect
  the 1024px horizontal budget.
- The refresh copy now explicitly says it checks for project changes. No project
  picker or global refresh behavior was added.

# Validation

- `pnpm exec vitest run src/app/StatusBar.test.tsx src/features/branches/BranchQuickSwitch.test.tsx src/app/App.test.tsx`
  — 36 tests passed.
- `pnpm run check` — documentation and architecture checks passed; 461 frontend
  tests passed; the production build completed; Rust formatting and Clippy
  passed; 306 Rust tests passed.
- Local browser inspection confirmed the status bar renders at 34px with 13px
  type, centered alignment, and the intended quiet chrome treatment.
