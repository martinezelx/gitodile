---
id: 156
title: Overview redesign — next step, living history, the scene and a screen fitted to the window
status: done
priority: normal
type: improvement
areas:
  - frontend
  - backend
  - design
  - ux
created: 2026-10-08
completed: 2026-10-10
parent:
queue:
---

# Goal

Turn Overview from a band of three tiles and a list of facts into one page
that says what to do now, where the work is, and what the next step will move,
fitted to the window it is shown in.

# User outcome

Opening a project shows one card with the next step and its button, a
timeline of where every version is — waiting on the remote, unsaved now, only
on this computer, published — and beside it a small drawing of this computer
and the remote with what the next step will move under it. Nothing flashes
while the project is read, the drawing moves once when something changes, and
a bigger window simply shows more.

# Context

The owner reviewed the redesign in an HTML artifact over many rounds
(sections 3.x to 4.6), with conservative and disruptive variants, and chose
each piece there before it was built: the B+D winner (next-step card plus
living history), the breadcrumb header, the side column that follows the card,
the scene ("where your work is"), its one-shot motion, the skeleton loading,
and the window-fitted layout with whole rows and a fading rail.

# Scope

- **Header** as breadcrumbs: the project's icon (opens its icon settings),
  name, a slash and the branch's quick switch; folder and settings
  buttons at the far end. No path and no technology chip (the path is the
  folder button's tooltip).
- **Next-step card** (`nextStep.ts`, `NextStepCard.tsx`): one state, one
  colour from the theme's status tokens as a diagonal wash, one primary
  button, a three-segment progress caption, and a neutral "Then:" pill for
  what comes after so the card never mixes two hues. Every case has its own
  words: first save, save, conflicts, publish, behind, diverged, checking,
  not checked, unavailable (calm, failure on the glyph), no remote (connect),
  no upstream, detached (open branches), unborn, up to date.
- **Living history** (`HistorySummarySection.tsx`, `OverviewNow.tsx`): the
  versions waiting on the remote with a "Get" action, the one-line "Now"
  row, the group of versions only on this computer, the mark where the
  remote's copy begins, and the published versions, on one rail.
- **Side column** (`OverviewDetail.tsx`, `workDetail.ts`): the scene first,
  then one card that follows the next step — what you'll save, decide, get
  or publish — closing on its consequence in one line. With nothing waiting,
  the scene takes the column, and a restorable discard is its own card whose
  "Restore" opens Changes with the restore picker open.
- **The scene**: this computer and the remote, the dashed path between them,
  dots for versions travelling, a check when they match, an opaque "?" when
  the remote could not be asked, an empty dashed cloud with "Connect" when
  there is none. Large when calm, small while there is work.
- **Motion** (`sceneMotion.ts`): one short animation per state change —
  published dots travel out, got dots travel in, news slides in, a new
  version is born, check and "?" swap, a connected cloud fills in. Never on
  the first drawing, never while hidden (a change made elsewhere plays on
  return), never with reduced motion.
- **Loading**: every part draws its own shape in placeholder text — card,
  "Now" row, timeline, scene, a detail card's list — and the whole screen's
  launch placeholder is built from the same pieces. The remote side's first
  local read is its own "reading" state, so "not checked" no longer flashes.
- **Fitted to the window** (`fit.ts`): from 620×981px the screen has no
  scroll; the timeline and the detail list show as many whole rows as fit,
  and when versions are left out the rail runs on and fades instead of a
  count. Smaller, the page scrolls with lists of a fixed length.
- **Rust**: `list_incoming_versions` (local only, `HEAD..upstream`, sharing
  `versions_in_range` with `list_unpublished_versions`) and
  `open_project_folder` (only an authorised project's own root).

# Out of scope

- Fetching to name incoming versions: they come from the tracking ref the
  last check moved.
- A second "View all" under the timeline, or any count of hidden versions.
- Animating rows while the window is resized.

# Acceptance criteria

- [x] One card, one colour and at most one primary button in every state.
- [x] The side column follows the card, with the scene above the detail.
- [x] Incoming versions are named without a fetch.
- [x] "Restore" on a discard opens Changes with the restore picker open.
- [x] Every part loads as its own shape; nothing shows a guessed state.
- [x] The scene animates each state change once, and never on first drawing,
      while hidden, or with reduced motion.
- [x] A tall window shows more versions and files, whole rows only, with no
      page scroll; a short one scrolls as before.
- [x] Tests cover the step derivation, the card, the detail modes, the
      incoming read, the motion triggers, the placeholders and the fitting.

# Relevant files

- `src/features/overview/` — `OverviewPanel.tsx`, `NextStepCard.tsx`,
  `nextStep.ts`, `journey.ts`, `HistorySummarySection.tsx`, `OverviewNow.tsx`,
  `OverviewDetail.tsx`, `workDetail.ts`, `sceneMotion.ts`, `fit.ts`,
  `OverviewPlaceholder.tsx`, `overview.css`, `translations.ts`; removed
  `JourneySection`, `ChangedFilesSection` and `ProjectPath`.
- `src/app/App.tsx` — the work-detail controller, its idle reads and the
  restore intent; `src/features/changes/ChangesPanel.tsx` — `restoreIntent`.
- `src/features/status`, `src/features/repository` — the two new ports.
- `src-tauri/src/status.rs`, `desktop.rs`, `ipc.rs`, `lib.rs`,
  `application.rs`; `docs/architecture/025-ipc-contract.json`.
- `DESIGN.md` — Overview.

# Dependencies

None.

# Decisions

- The detail column and the incoming versions are read by the composition
  root on project activation and repository invalidations, idle-deferred;
  Overview only renders what is cached.
- The scene's animations are pure Web Animations on the drawn DOM, with
  short-lived ghosts for what has left it, so React stays the only owner of
  the scene's state.
- Fitting measures the rows already drawn inside a clipping box and keeps the
  whole ones; resizing never reads Git. The media query lives in both
  `fit.ts` and `overview.css` and must agree.
- The remote's unread state is "reading", distinct from "not checked": a
  status that has never been read is not a remote that was never asked.

# Implementation notes

`overviewDetailMode` picks the column's card; `deriveNextStep` the card's
kind, tone, actions and "then" pill. `useSceneMotion` keeps the last facts
seen while active and plays the difference; `useFitCount` measures
`data-fit-row` rows against its box and reserves room for the fading rail or
the "and N more" line.

Review before committing fixed: the work-detail cache was never released when
a project closed; `open_project_folder` handed Windows' verbatim `\\?\` path
to the file manager; the "What you'll get" card said nothing when its
versions could not be read; and the dead `ProjectPath` component, its copy
error wiring, and stale CSS and comments were removed.

# Validation

`pnpm run check`, 2026-10-10:

- Docs, frontend architecture, TypeScript, Vitest (137 files, 1391 tests) and
  the production build passed; `cargo fmt --check` and Clippy passed.
- `cargo test` first could not replace `src-tauri/target/debug/gitodile.exe`
  while the development app was open; with it closed, `pnpm run check:rust`
  passed (582 library tests, 1 ignored, plus the integration target).
- Checked in the running app by the owner through the redesign's rounds
  (states, loading, scene motion). The window-fitted layout was measured in a
  browser harness at 580, 700, 860 and 1100px tall; live resizing was not
  observable there and is left to the running app.
