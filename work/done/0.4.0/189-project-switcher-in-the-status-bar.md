---
id: 189
title: Switch projects from the status bar and move the theme toggle to the rail
status: done
priority: normal
type: ux
areas:
  - frontend
  - ux
created: 2026-10-20
completed: 2026-10-20
parent:
queue:
---

# Goal

The status bar's `project · branch` block becomes the one place to change
either: the project name opens a project popup that is the twin of the branch
popup, and the project switcher leaves the rail and the compact navigation
row. The slash between the two segments goes, and they sit as two equal
segments. The theme toggle moves from the title bar to the foot of the rail,
above Settings.

# User outcome

What is open and how to change it are read and changed in the same place, at
the foot of the window, the way IntelliJ shows its project and branch. The
rail keeps only destinations and the app's own controls, so it reads as
"where in this project" with "the app" at its foot.

# Context

Explored with Luis on 2026-10-20 in two artifacts:

- Canvas: https://claude.ai/artifact/PtG7AtxXm9ijqUFuysUY98
- Interactive comparison of seven options (A–G) and four places for the theme
  toggle: https://claude.ai/artifact/EiuGwjrw5NxwtzC5Tctivp

Option G ("Híbrida") was recommended and accepted: the anatomy of the branch
popup (option A) with the current project and its actions at the head, and the
recently closed projects under the open ones. Luis then asked for the same head
on the branch popup.

Queued at the end of the active queue, but taken next by explicit request
because it belongs to release 0.3.1.

The status bar does not render on Home and Console. Home lists every project
itself; Console keeps Ctrl/Cmd+Tab and the palette's project commands.

# Scope

- `ProjectQuickSwitch` in `src/app/project-switcher/ProjectSwitcher.tsx`,
  replacing `ProjectSwitcherRail` and `ProjectSwitcherCompact`:
  - trigger: the project's avatar, name and a chevron, with a mark on the
    avatar for the active project's own state;
  - head: the active project with Settings, Show in folder and Close;
  - search, then "Open" (other open projects, favourites first, with star and
    a chevron into the project's actions) and "Recent" (closed projects from
    the recent list);
  - a project's actions in place of the list: go to it, settings, show in
    folder, copy its path, close it;
  - foot: Add project (open, create, clone, docked at the foot) and All in Home.
- Status bar: the project segment is the popup trigger; no slash; both
  segments share height, padding, glyph and chevron metrics.
- Rail: the project group and its "+" leave the tray; the jump menu of the
  hidden rail drops its project group.
- Theme toggle: a round button in the rail foot above Settings; the title bar
  keeps its copy only while the rail is not showing (rail hidden, or the
  compact layout under 800px).
- Translations (en, es), DESIGN.md and tests.

# Out of scope

- "Open in editor": GitOdile has no editor integration yet.
- A Home button in the rail (task 184 keeps Home out of the rail's
  destinations; the popup's foot and the overflow menu reach it).

# Acceptance criteria

- [x] Pressing the project in the status bar opens the project popup; choosing
      a project activates it; Escape and an outside press close it and return
      focus to the trigger.
- [x] The popup's head acts on the active project: settings, folder, close.
- [x] A row's chevron shows that project's actions in place of the list, with
      a way back.
- [x] Closed recent projects open from the popup.
- [x] Add project offers open, create and clone; All in Home goes to Home.
- [x] Switching is disabled while a blocking dialog is open, and says why.
- [x] No slash between project and branch; the two segments align.
- [x] The rail has no project group; the theme toggle sits above Settings and
      keeps today's three meanings; the title bar shows it only while the
      rail is hidden.
- [x] Tests cover the popup, the status bar trigger and the rail.
- [x] `pnpm run check` passes.

# Relevant files

- `src/app/project-switcher/ProjectSwitcher.tsx`
- `src/app/StatusBar.tsx`
- `src/app/App.tsx`
- `src/app/app-shell.css`
- `src/app/translations.ts`
- `DESIGN.md`

# Dependencies

None.

# Decisions

1. **Option G.** The branch popup's anatomy, so both halves of the block are
   learnt once; the active project's actions at the head so settings do not
   cost a chevron; recently closed projects so reopening one does not need
   Home.
2. **No slash.** With both segments wearing a glyph and a chevron, they read
   as two controls; a slash beside branch names that carry their own slashes
   was noise.
3. **Theme toggle in the rail foot.** The foot holds the app's own controls
   (Settings, Account); the theme is the app's, not the project's. It takes the
   room the project group gave back.
4. **Home stays out of the rail** (task 184). It is the popup's foot action,
   and still in the overflow menu and the palette.

# Implementation notes

- `ProjectQuickSwitch` replaces `ProjectSwitcherRail`, `ProjectSwitcherCompact`
  and the old add-project menu in `project-switcher/ProjectSwitcher.tsx`. The
  trigger is the status bar's project segment itself (`status-bar__seg
  status-bar__project`), so `StatusBar` takes one `projectSwitch` prop instead
  of the settings callbacks. With no project open the same segment reads "No
  project open" and opens the recent projects and the three ways to add one.
- The popup uses `usePortalFlyout` with no focus target of its own and focuses
  the search once visible: the head's buttons come first in the DOM, and
  "first-control" would have focused the gear.
- `.app-menu.project-quick-switch` doubles the class: `primitives.css` loads
  after `app-shell.css`, and `.app-menu`'s 320px cap won the width otherwise.
- "Show in folder" reuses `open_project_folder` (Overview's "Open folder"),
  now one `openProjectFolder(id)` in `App.tsx` for both. "Copy path" uses
  `copyTextToClipboard` and says "Path copied" for 1.6s.
- Recent projects are Home's list without the open ones, five at most.
- The hidden rail's jump menu drops its project group; the status bar stays on
  screen while the rail is collapsed.
- The titlebar's theme toggle carries `titlebar-theme-toggle--in-rail` while
  the rail shows (hidden by CSS, shown again under 800px).
- Removed: the rail chip, its badge (and the 7px badge count, the typography
  exception it needed), the compact switcher, `statusBarProjectTooltip`, the
  favourites-only filter strings and `projectSwitcherHomeHint`.
  `projectSwitcherRailTrigger` is now `projectSwitcherTrigger`.
- The branch popup takes the project popup's head (asked for during the task):
  the current branch's glyph, name and latest saved version with "Copy name",
  over a hairline. Both popups are 400px tall now; the search still takes
  focus (`usePortalFlyout` with no focus target and a layout effect, as in
  the project popup). New branch and Manage branches stay at the foot, the
  counterparts of Add project and All in Home.
- The rail's foot loses its tray (compared in
  https://claude.ai/artifact/5WQM5oZyXAJrQaebbyaJQ9, option B): no
  `.sidebar-tray` wrapper or pill; the three circles keep their fill and
  hover steps up to `--surface-active`.
- Hover motion on the foot (option 1 of the same artifact): gear 60°, sun
  45°, moon −18°, account 2px up once sign-in is enabled. Only under
  `prefers-reduced-motion: no-preference` and without the app's own
  reduced-motion setting.
- The foot's turn runs on `cubic-bezier(0.45, 0, 0.25, 1)` (option B of
  the speed comparison in the same artifact): the rail's ease-out
  front-loaded it and read as too fast for the gear and the sun.
- Status marks (https://claude.ai/artifact/FYeS7Bg4rvN7RtYH8fVbWK, option B
  with the popup's alert glyph): the project mark speaks for the active
  project only — `activeProjectStatus` in `App.tsx` ranks a failed or
  uncertain operation, overlapping changes and an unreadable history
  (`resolve`, `CircleAlert`), then a running operation (`busy`, a turning
  ring). Another project's state no longer marks the trigger; `projectSwitcherAttention` is
  gone. The branch's unreadable-tree marker is the alert glyph instead of a red
  dot. New marks breathe once with `.attention-breathe`.
- A missing Git name or email was designed as a third mark ("set up", an
  empty ring) and left out at the final review: `get_git_identity` reads only
  the global configuration, and a project can set its own identity in its
  settings, so the mark would have raised a false alarm there. It needs the
  project's effective identity first (follow-up).
- Final review fixes: the branch popup's head finds the current branch by name
  rather than by `isActive`, so a cached snapshot that still marks the branch
  just left cannot put that branch's latest version under the new name.
- Console has no status bar: switching projects there is Ctrl/Cmd+Tab or the
  palette's project commands, as before for keyboard users.

# Validation

- `pnpm run check` passed on 2026-10-20 after the final review: docs,
  frontend architecture, typecheck, 144 test files / 1549 tests, production
  build, `cargo fmt`, Clippy and the Rust tests (608 passed, 1 ignored).
- Checked in a throwaway browser harness (removed afterwards) rendering the
  real `StatusBar` with fixtures: both segments are 30px tall at the same
  top, 8px padding, 6px gap, 13px chevrons on the same line, 4px apart; the
  popup opens at 380 × 400 above the trigger with the search focused; the
  actions view keeps the popup's size and focuses Back.
- An earlier `pnpm run check:rust` could not finish while `tauri dev` held
  `src-tauri/target/debug/gitodile.exe`; the final gate above ran it in full.
- Checked by the owner in the running app (`tauri dev`) during the work: the
  status bar block, the avatar's ring, the rail's foot and its hover motion.
  The status marks were also checked in a harness with every state.
