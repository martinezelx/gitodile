---
id: 132
title: Return to the welcome screen while projects are open
status: done
priority: normal
type: feature
areas:
  - frontend
  - navigation
created: 2026-09-27
completed: 2026-09-27
parent:
queue:
---

# Goal

Let someone reach the project-opening screen (internally `home`) on purpose, without closing
their open projects, from the titlebar's ··· menu and the command palette.

# User outcome

The Projects screen — create, open or clone a project, the recent-projects list
and the mascot's greeting — is no longer only a starting state. Someone
working in a project can go to Projects, reopen a project they closed earlier or
start a new one, and come back to what they were doing.

# Context

Today the home screen appears only when no project is open: when the app
starts without one, or with **Reopen last project** turned off in Settings,
or after closing every project. Closing a project activates the next open
one (`src/runtime/project/sessions.ts`), so `activeId` is `null` only when
none remain.

The project switcher already covers most of what the home screen offers for
open projects: switching, closing, favourites, project settings, and
create/open/clone. What only the home screen shows is the recent-projects
list, which includes projects that are no longer open (reopen, favourite,
forget). Reaching it today means closing everything.

The user asked for a discreet way back, not a permanent destination: an
entry in the ··· menu keeps it out of the rail and the titlebar while still
letting people navigate there. This follows the brand and titlebar decisions
of task [131](../0.4.0/131-mascot-app-icon.md), which left the titlebar as controls
only.

# Scope

- Add **Projects** ("Proyectos") with a project-folder icon as the first item of the ···
  menu's first group, before Open project, and the same command in the
  command palette.
- Show the Projects screen while projects stay open: no project is shown as
  active in the switcher and no rail destination is current. Choosing a
  project (open or recent) or a rail destination leaves Projects; Back returns to
  where the person was.
- Keep the underlying project session and its per-project navigation history
  intact. Back from Projects returns to the previous project screen; Forward can
  revisit Projects until another navigation replaces that step. Choosing the
  already-active project in the switcher also leaves Projects.
- Register home as a screen in `src/app/screens.tsx`, as `AGENTS.md`
  requires, so navigation, the palette, prefetching and keep-alive derive
  from the table. Separate "the home screen is showing" from "no project is
  open".
- With projects open, replace the "No project open" heading with copy that is
  true in that state (for example "What would you like to open?"), in both
  languages, and list only recent projects that are not already open.
- Play the welcome mascot's entrance once per application session, including
  a launch with no project open. Later visits keep its resting pose and
  periodic glint; reduced-motion settings still take precedence.
- On Projects, keep showing the active project's status and available actions
  while it remains open. Show the no-project state when none is open.
- Update `DESIGN.md` (titlebar menu, home screen states) and the architecture
  notes if the screen contract changes.

# Out of scope

- A Projects destination in the rail or a button in the titlebar.
- Recent (closed) projects inside the project switcher.
- Changes to the Reopen last project setting.

# Acceptance criteria

- [x] Projects appears first in the ··· menu and in the command palette, in
      English and Spanish, with keyboard access.
- [x] Opening Projects with projects open shows the launcher without closing
      or altering any project, and no project or rail item reads as current.
- [x] Choosing any open project (including the underlying active project), a
      recent project, a rail destination, or Back leaves Projects. Forward returns
      to Projects after Back until another navigation replaces that step. Project
      state and per-project history are unchanged by visiting Projects.
- [x] The heading and the recent list are correct both with and without open
      projects; open projects are not repeated in the recent list.
- [x] The status bar retains the active project's name, branch, working-tree and
      remote state, and actions while Projects is visible.
- [x] Home is registered in `src/app/screens.tsx`; hidden-screen rules
      (no polling or costly effects while hidden) hold.
- [x] Tests cover the menu and palette entries, leaving home, Back, the
      heading copy and the filtered recent list.
- [x] The native app shows the active project's status on Projects, opens a
      recent project with visible progress, and hides the recent list when it
      becomes empty. The failed-recent path and its error dialog are covered
      by integration tests. The recent list itself is read synchronously from
      local storage and has no loading or error state of its own.
- [x] `pnpm run check` passes.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/frontend-feature-guide.md`
- [Screen registry](../../../src/app/screens.tsx)
- [App shell](../../../src/app/App.tsx)
- [Titlebar menu](../../../src/app/TitlebarMenu.tsx)
- [Project sessions](../../../src/runtime/project/sessions.ts)
- [Welcome screen](../../../src/features/overview/OverviewPanel.tsx)
- [Home screen](../../../src/features/home/HomeScreen.tsx)

# Dependencies

Task [131](../0.4.0/131-mascot-app-icon.md) (committed): the welcome screen's mascot
and the titlebar layout this task builds on.

# Decisions

- The way home lives in the ··· menu and the palette, not in the rail or the
  titlebar (user direction, 2026-09-27).
- The visible destination is **Projects/Proyectos**, because it opens or chooses
  projects and should remain distinct from the project Overview. The switcher
  is the compact way to choose an already open project (user direction, 2026-09-27).
- The project status bar remains connected to the active session while the
  Projects screen is visible, including its available actions (user direction,
  2026-09-27).
- Home is an application location, separate from `activeId` and the project's
  `lastView`. It has a registered screen and app-session lifecycle, but does
  not join project navigation preferences.
- The welcome entrance plays once per application session; repeat visits keep
  the mascot still except for its existing periodic glint.
- Task 131's mascot and titlebar changes are committed, while task 131 itself
  remains active for native icon validation.

# Implementation notes

Home has an eager feature-owned container and descriptor with an application
session eviction scope. `inRail: false` keeps it in the registry and command
palette without adding it to navigation preferences. The shell tracks a Home
Back/Forward step separately from each project's own history and leaves the
underlying `activeId` intact. Both switchers receive a presentation-only null
selection on Home; the rail switcher now keeps its generic trigger when no
project is presented as active. The status bar still receives the active
project and its cached status, so its facts and actions stay available.

The launcher is reused from Overview's no-project fallback. Home filters open
sessions from recent projects before the visible five-row slice. The greeting
plays once per application session; repeat visits keep only the existing star
glint, and reduced-motion rules still suppress it.

# Validation

`pnpm run check` passed on 2026-09-27: documentation, architecture,
TypeScript, 1,017 frontend tests, production build, Rust formatting and
Clippy, and 437 Rust tests. Targeted frontend tests passed again after the
last navigation adjustments. The local Vite browser confirmed **Proyectos**
as the first, keyboard-focused menu item. The Windows Tauri app was then
checked with an open project: the status bar retained its project facts and
actions; opening a recent project showed progress and switched to it; the
recent list disappeared while that project was open. The original active
project and recent-project state were restored after validation. An App
integration test verifies that a failed recent open leaves the current
project active and presents an error dialog; that failure was not induced in
the native app.
