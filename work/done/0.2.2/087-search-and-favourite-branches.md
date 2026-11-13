---
id: 087
title: Add search and favourites to quick branch switching
status: done
priority: normal
type: improvement
areas:
  - frontend
  - branches
  - overview
  - accessibility
  - documentation
created: 2026-08-28
completed: 2026-08-28
parent:
queue:
---

# Goal

Make the branch switchers in Overview and the status bar as easy to scan
as the project switcher by adding search and project-scoped favourites, while
giving each surface a deliberately sized flyout.

# User outcome

People can quickly find a long or frequently used branch from either
entry point without losing the existing previewed, state-checked switch flow.

# Scope

- Add a search field and favourites-only filter to the shared quick switcher.
- Let each available branch be added to or removed from favourites.
- Persist favourites per common Git directory so linked workspaces agree and
  unrelated projects do not share choices.
- Sort favourites first without changing the canonical branch snapshot.
- Give Overview a roomier selector and the bottom status bar a shorter,
  narrower selector that opens above the chrome.
- Keep loading, empty, no-match, keyboard, focus, long-name, English, Spanish,
  narrow-window, coarse-pointer, and forced-colour states usable.
- Update the durable design note and focused tests.

# Boundaries

- Choosing a target still opens the existing safe switch preview; the flyout
  never performs a Git mutation directly.
- Do not change branch discovery, switching policy, Rust commands, or the
  full Branches screen.
- Search and favourites are display-only and must not reorder the cached
  snapshot or affect repository state.

# Acceptance criteria

- [x] Both quick-switch entry points expose the same search and favourite
      controls with complete English and Spanish accessible copy.
- [x] Search can find any eligible branch in the cached snapshot, including one
      outside the initial visible rows.
- [x] Favourites appear first, can be filtered, persist per project, and stay
      synchronized between Overview and the status bar.
- [x] Active branches and branches checked out in another workspace remain excluded.
- [x] Overview and status-bar flyouts use context-appropriate bounded widths
      and heights without viewport overflow.
- [x] Keyboard focus enters the search field, Escape restores the trigger, and
      all row/favourite actions remain reachable without hover.
- [x] Selecting a branch still routes through the existing safe operation flow.
- [x] Focused tests and `pnpm run check` pass.

# Relevant files

- `src/app/App.tsx`
- `src/app/StatusBar.tsx`
- `src/app/app-shell.css`
- `src/features/overview/OverviewPanel.tsx`
- `src/features/overview/overview.css`
- `src/features/branches/BranchQuickSwitch.tsx`
- `src/features/branches/branches.css`
- `src/features/branches/translations.ts`
- `DESIGN.md`

# Decisions

- Favourites use the repository's common Git directory as their persistence
  scope. Linked workspaces therefore share the same branch inventory choices,
  while projects that happen to use the same branch names remain independent.
- The flyout is a searchable dialog rather than an ARIA menu: a text field and
  independent favourite buttons require normal dialog/tab semantics.
- The status-bar variant prioritizes compact reach from global chrome; the
  Overview variant has room for more visible rows. Both show the latest saved-
  version subject beneath the branch name.

# Implementation notes

- Reworked `BranchQuickSwitch` from a short ARIA menu into a searchable
  dialog with normal tab order, initial search focus, Escape restoration,
  favourites-only filtering, stable favourite-first ordering, row context, and
  bounded result caps of six (status) or nine (Overview).
- Added feature-owned local persistence keyed by `commonGitDir`. `App` owns one
  hook instance and passes the same set/toggle action to Overview and the
  status bar, so both mounted selectors update together.
- Kept active branches and branches checked out in another worktree out of every
  result before filtering. Search runs before the visible cap, so a branch beyond
  the initial rows remains directly findable.
- Sized the Overview flyout at a viewport-bounded 400×380px. The status flyout
  is 320×292px, uses denser icon sizing, and the shared portal placement opens
  it above the bottom chrome. Both variants include saved-version subjects.
- Added English/Spanish visible and accessible copy, auto-hiding result
  scrollbars, coarse-pointer targets, forced-colour favourite states, and the
  matching durable design rule.

# Validation

- `pnpm exec vitest run src/features/branches/BranchQuickSwitch.test.tsx src/features/branches/favourites.test.tsx src/app/StatusBar.test.tsx src/app/App.test.tsx`
  — 40 focused tests passed.
- UI layout detector over the touched switcher and surface styles — no
  findings before or after implementation.
- In-app browser inspection at 1280×720 and 900×620 confirmed Overview and
  status-bar placement, long-name ellipsis, bounded scrolling, search/favourite
  hierarchy, and viewport containment. Light and dark themes were inspected.
- `pnpm run check` — documentation and architecture checks passed; 466 frontend
  tests passed; the production build completed; Rust formatting and Clippy
  passed; 306 Rust tests passed.
