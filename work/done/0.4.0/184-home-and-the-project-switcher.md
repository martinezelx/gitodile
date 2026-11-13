---
id: 184
title: Reach Home from the project switcher, keep the open project in sight, and close without switching
status: done
priority: normal
type: ux
areas:
  - frontend
  - ux
created: 2026-10-19
completed: 2026-10-19
parent:
queue:
---

# Goal

Four fixes to how Home and the project switcher behave with projects open:

1. Home is reachable from the project switcher, not only from the overflow
   menu and the palette.
2. On Home the rail's project chip keeps showing the active project.
3. Closing the active project goes to Home with no project active, instead of
   moving the reader into the next open project.
4. Home's recent list keeps the open projects instead of leaving them out,
   and marks them.

# User outcome

Someone who does not know the "···" menu can still find Home: it is the first
row of the switcher, the control that already lists every project. On Home
they can still see which project they have open. Closing a project never
drops them into another repository they did not choose, so the next save or
publish cannot land in the wrong project.

# Context

Raised in the review of task 183. Home stays out of the rail's destinations
on purpose: those all belong to the active project, and Home is above any one
of them. The rail used to pass `activeId = null` on Home, so the chip showed a
generic folder and "Open projects" while the project was still open and
active, and Home's recent list excludes open projects, so nothing on screen
said which one was open. Closing the active project picked the adjacent
session like a browser tab; that rule was implicit in the reducer and in
neither DESIGN.md nor an ADR, and it conflicts with "safety before
cleverness".

# Scope

- `ProjectSwitcher.tsx`: an optional `onOpenHome` row at the head of the rail
  and compact popovers; `isHome` keeps the active project on the trigger and
  drops its `aria-current` mark.
- `App.tsx`: the switcher always gets the active project; closing the active
  project goes to Home and announces it.
- `sessions.ts`: closing the active session leaves no session active.
- DESIGN.md § Layout concept (overflow menu, switcher) and § Core screens
  (Home with projects open).

# Acceptance criteria

- [x] The rail and compact switchers open with a Home row; on Home it is
      marked current and the project row is not.
- [x] On Home the rail chip shows the active project's avatar and name.
- [x] Closing the active project, with others open, shows Home with no
      project active and announces the close; closing another project leaves
      the active one as it is.
- [x] Home's recent list keeps the open projects, tagged "Open now", with the
      active one ringed like in the switcher; choosing one switches to it.
- [x] Reducer, switcher and App tests cover the three cases.
- [x] Checked in the running app.

Checked by the owner in the running app (`tauri dev`) during the work, and
in a browser harness that rendered the real components on this repository's
own data, in the official light and dark themes.

# Implementation notes

- A restored session list with `activeId: null` still lands on the last
  project at launch: the restore reducer falls back to the last when the
  stored active is missing, which was already the behaviour.
- Ctrl/Cmd+Tab already handled no active project (it starts from the first).
