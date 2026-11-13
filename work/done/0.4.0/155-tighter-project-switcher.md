---
id: 155
title: Tighter project switcher with branches and a scrolling list
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
  - ux
created: 2026-10-08
completed: 2026-10-08
parent:
queue:
---

# Goal

Make the rail's project switcher compact, scannable and sized to what it holds.

# User outcome

Opening the switcher shows the open project first, each project's branch
under its name, and no strip of idle icons. The panel grows with the number of
projects and scrolls inside itself once there are more than about six.

# Context

The owner reviewed screenshots and an HTML artifact with five alternatives and
chose two-line rows, no "add project" row (the rail's "+" covers it), and the
common in-app scrollbar. Group headings were tried and dropped: the star
already says what is a favourite.

# Scope

- Widen the panel to 340px; size it by its rows; cap it at 324px (six 44px
  rows plus search) and scroll only the list, with the search field fixed.
- Show `contextLabel · branch` under the name.
- Hide settings, favourite and close at rest by collapsing them to zero width;
  open them on row hover or focus. A marked star keeps its slot. Touch pointers
  always show them.
- Open project first, then favourites, then the rest; display order only.
- Do not repeat the open project's status on its row in the rail popover (the
  trigger badge shows it); keep it on other rows and in the compact switcher.

# Out of scope

- A keyboard shortcut or arrow-key navigation for the switcher.
- Changing the order `Ctrl/Cmd+Tab` cycles through.

# Acceptance criteria

- [x] The open project is the first row, ahead of favourites.
- [x] Other projects keep their unsaved, error and operation indicators.
- [x] The list scrolls inside the panel past six rows; search stays visible.
- [x] Trailing controls stay reachable by keyboard and are not clipped.
- [x] Tests cover the order, the indicators and the row names.

# Relevant files

- `src/app/project-switcher/ProjectSwitcher.tsx`, `ProjectSwitcher.test.tsx`
- `src/app/app-shell.css`, `src/app/App.tsx`, `src/app/App.test.tsx`
- `DESIGN.md` (rail navigation)

# Dependencies

None.

# Decisions

- The scroll belongs to the list, not the popover, so the search field never
  scrolls away. The popover is `overflow: hidden`.
- The branch is an optional entry field fed from the session's project, so the
  component stays free of session types.
- Row names now include the branch, so tests match by prefix.

# Implementation notes

`withActiveFirst` reorders after `orderByFavourite`. `scrollable` on
`ProjectSwitcherRows` switches on the scroll list and the active-row status
rule, which only the rail popover uses.

# Validation

`pnpm run check`, 2026-10-08:

- Docs, frontend architecture, TypeScript, Vitest and the production build
  passed; `cargo fmt --check` and Clippy passed.
- `cargo test` could not finish: Windows denied replacing
  `src-tauri/target/debug/gitodile.exe` while the development app was running.
  No Rust file changed in this task.
- Not checked in the running app; the layout was reviewed in an HTML mock only.
