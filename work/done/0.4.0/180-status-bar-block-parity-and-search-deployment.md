---
id: 180
title: The status bar's blocks and the app search, from strip to Console
status: done
priority: normal
type: design
areas:
  - frontend
  - ux
created: 2026-10-16
completed: 2026-10-17
parent:
---

# Goal

The two blocks of the status bar behave as one component, and the app search is
one system from the strip to Console: the field, the results it deploys, the
keyboard that walks them, and where the focus goes when a destination is
chosen.

# User outcome

Hovering or pressing either block of the strip does the same thing; searching
from the strip shows the results beside the field that opened them; Console has
its own field in its terminal status line with the same query and keyboard; the
results there read as a pane of the terminal; the list follows the arrows; and
after a destination the keyboard continues on the screen that opened, not in
the chrome that asked for it.

# Context

Task 176 made the strip a card. The work that led into this task rebuilt it as
two equal blocks — `project │ branch` and `remote │ check` — around a field that
opens the command palette, and dropped the app's version tag. What followed:

- The remote block filled **permanently** while a current relation called for a
  sync, while the project block never held a fill at rest: the "two systems"
  complaint 176 set out to end.
- The palette was a modal centred at `14vh`, a position chosen for the titlebar
  search button it used to hang from. Opened from the strip's field, its results
  appeared far above the control that produced them.
- Console hides the strip and draws its own 34px status line, so the palette's
  only field was absent there: `Ctrl/Cmd+K` opened a panel at the window's foot
  with no owner for the query or the keyboard, and the Console prompt kept
  eating the keys.
- After a palette destination, the field (which survives navigation) kept the
  focus on a screen it no longer described.
- The palette's list never followed the keyboard selection past its visible
  rows, and its material was the app's raised card even in the terminal.

# Scope

## The strip

- Both blocks share one behaviour: no persistent fill, the same hover and press;
  the remote fact is pressable at rest and asks for a check, becoming the sync
  verb when a current relation calls for one.
- The strip is a 44px card with three tracks, the field a real input in the
  middle, and no version tag.
- The results deploy from the field: an anchored popover (480px, 8px above,
  centred and clamped inside the window), grouped with glyphs, a shortcut per
  row, a centred key footer, rise/leave motion, and a clipped scrollbar.

## The Console

- Its status line carries the app search: a small raised card in the terminal's
  mono type, in the middle of a three-track line, with the compact confirmation
  chip on the left and the split keyboard hint around it.
- The project facts move back to the welcome; the line keeps the chip, the
  search, the hint halves and the actions.
- `Ctrl/Cmd+K` focuses that field; `Esc` closes the palette and gives the
  keyboard back to the prompt; `Ctrl+L` in the field does not clear the
  transcript. Both palette fields opt out of browser autocomplete and
  spellcheck.
- The results, on this screen only, wear the shortcut pane's material: the
  console surface, the mono face, accent action names, dashed rules and console
  keycaps. The strip's palette keeps the app's raised card.

## Shared behaviour

- The list follows the chosen row with the arrows and on a query change.
- A `go-*` command hands the focus to the active screen's own target: Home's
  launcher, Console's prompt, the Work tab, or the Overview and Branches headings.
- Docs and tests.

# Out of scope

- The notification centre and the update flows.
- Virtualizing the palette list (the palettes are short).
- Non-destination commands' focus: dialogs keep their own, and the field stays
  after a theme change.
- Focus movement for rail clicks, Back/Forward and project activation, whose
  control already holds the focus.
- Rust.

# Acceptance criteria

- [x] Both blocks of the strip share one hover and press behaviour, and neither
      holds a fill at rest.
- [x] An HTML artifact compares at least four deployments of the field's
      results, each shown at rest and while searching, with filtering working.
- [x] The chosen deployment is implemented: the panel is anchored to the field,
      grouped, 480px wide, with the centred key footer and rise/leave motion.
- [x] The strip carries no version tag; the changelog and updates live in the
      notification centre and the menu.
- [x] The strip's field is a real input that owns the query, the selection and
      the keyboard; `aria-controls`/`aria-activedescendant` appear only while
      the panel is open.
- [x] Console's status line has its own search field; `Ctrl/Cmd+K` focuses it,
      the palette anchors to it, and the screen keeps its query and selection.
- [x] Console's line is centred, the confirmation chip is compact (glyph plus a
      short word, full sentence for hover and the screen reader), the project
      facts stay in the welcome, and the hint is split around the field and
      hidden below 1040px rather than clipped.
- [x] `Esc` leaves the Console search for the prompt; `Ctrl+L` in it leaves the
      transcript alone.
- [x] The Console results wear the shortcut pane's material; the strip's
      palette is unchanged.
- [x] `↑`/`↓` keep the chosen row in view, including after a query change.
- [x] A destination command moves focus to the active screen's target, even on
      the current screen; Home and Console keep their own inputs, and dialogs
      keep their own focus.
- [x] Tests cover the parity, the deployment, the Console field and Escape, the
      pane variant, the scroll follow, and the focus handoff.
- [x] `pnpm run check:docs` and `pnpm run check:frontend` pass.

# Relevant files

- `src/app/StatusBar.tsx`, `src/app/StatusBar.test.tsx`
- `src/app/CommandPalette.tsx`, `src/app/CommandPalette.test.tsx`
- `src/app/App.tsx`, `src/app/App.test.tsx`, `src/app/appShell.test.tsx`
- `src/app/app-shell.css`, `src/app/translations.ts`, `src/styles/base.css`
- `src/features/console/ConsoleScreen.tsx`, `ConsoleScreen.test.tsx`,
  `console.css`, `translations.ts`
- `src/features/workbench/WorkbenchTabs.tsx`
- `src/features/home/HomeLauncher.tsx`
- `src/features/overview/OverviewPanel.tsx`
- `src/features/branches/BranchesPanel.tsx`
- `src/features/sync/translations.ts`
- `DESIGN.md`, `work/assets/status-bar-review/`

# Dependencies

None.

# Decisions

- Neither block may hold a fill at rest: the fill is a hover/press state, and
  the sync action keeps its accent glyph and its verb in words instead.
- The results deploy from the field rather than from the window's top: a
  popover, not a modal, with no backdrop; the field keeps the query and the
  keyboard.
- The strip carries no version: a version is a fact about the app, not about
  the project.
- Console owns a field instead of the palette owning global keys: a popover with
  no focus trap can only be driven by an input that owns the query and
  `aria-activedescendant`. The anchor is chosen by the active screen, not by
  "last mounted" — Console stays mounted while hidden.
- The Console line uses three tracks with explicit placements; the chip keeps
  its full sentence in a visually hidden span and in `title`; the facts move to
  the welcome; the hint is split and hidden below 1040px.
- The Console field is a small raised card; the results on Console wear the
  shortcut pane's material (`variant="console"`), while the strip keeps the app
  card.
- The list follows `[aria-selected="true"]` with
  `scrollIntoView({ block: "nearest" })` in a layout effect, after the held
  results take the new index.
- The palette's horizontal clamp mirrors the CSS measure (`min(480px,
  100vw - 48px)`) instead of measuring the panel: the panel is positioned
  before paint, and a test's DOM reports a stubbed box for every element.
- A destination hands the focus to a target each screen names with
  `data-screen-focus`; only `go-*` commands arm it, the retry covers a lazy
  chunk for 1.5s, and an open modal keeps its own focus.
- `Esc` is also handled at the document while the palette is open: it is the
  one key that must work when no field is mounted (a lazy chunk).

# Implementation notes

## The strip and its palette

- `StatusBar.tsx`: the remote state is a `button` in every non-held state. At
  rest it asks for the remote check (its accessible name is the state plus
  "Check remote project changes"); with a current relation it becomes the verb.
  The held state stays a span, as does the refresh's disabled state.
- `app-shell.css`: the strip is a 44px card with
  `minmax(0, 1fr) minmax(0, 430px) minmax(0, 1fr)`, the blocks split by one
  1px hairline each, no fill at rest, and the field a 32px `--surface-control`
  well with the shortcut keycap.
- `CommandPalette.tsx` is the results surface only: a panel anchored to the
  field, measured in a `useLayoutEffect` before paint (no centre-to-field jump),
  with sections, glyphs, row shortcuts, a centred footer and a closing phase
  that keeps the last results while it fades. Reduced motion drops the motion.
- The panel is 480px (the first iteration used 620), clips its own scrollbar
  (`overflow: hidden`, `min-height: 0`), and stays inside the window's edges.
- With no field to hang from (a lazy screen), it opens at the window's foot;
  Escape at the document closes it while nothing owns the keyboard.
- `App.tsx` owns the query, the selection, the matches, the dismissal effects
  and the project-switch close; the palette's commands reach the strip and the
  Console through the same contract.

## The Console

- `ConsoleScreen.tsx`: the status line is a three-track grid — the compact chip
  and the first hint half, the search slot, the second hint half and the
  actions. The field is a 28px raised card with the mono input and the shortcut
  keycap; its open state adds the accent edge and focus ring.
- The chip uses `ShieldCheck`/`ShieldOff` + a short label; the full sentence is
  visually hidden and in `title`.
- The unsaved/publish/incoming facts left the line; the welcome already carries
  them. `consoleHint` became `consoleHintComplete` and `consoleHintNavigate`.
- `Ctrl+L` stops at the field; `Esc` forwards to the palette and then focuses
  the prompt. The field is the palette's anchor while Console is active.
- `translations.ts` gained `consoleSearch`, `consoleSearchLabel`, the short chip
  labels, and lost the now-unused `consoleStatusUnpublished`.
- The results wear `palette-panel--console` (variant chosen by `view`):
  `--surface-app`, no shadow, the item radius, mono groups with `> `, accent
  labels, dashed row rules, a mono footer and console keycaps.

## Shared

- `CommandPalette.tsx`: `listRef` + a layout effect scrolls the selected option
  into view when the held results change; the call is optional for test DOMs.
- `App.tsx`: `paletteFocusPending` + `paletteFocusTick`, armed by `go-*`
  commands; an effect on the tick and view focuses the active screen's
  `[data-screen-focus]` after the commit; an open modal keeps its focus.
- Targets: Home input, Console prompt, active Work tab, Overview h1, Branches main
  and error h1s (`tabIndex={-1}`); `base.css` gives a focused heading the same
  ring controls use.

## Review fixes

- The strip's middle track is a measure (`minmax(0, 430px)`), not `auto`, which
  had collapsed to the input's default 235px.
- The held label no longer says "Check again" while a check runs; the fact only
  shows the last known state with the spinner.
- `aria-controls`/`aria-activedescendant` appear only while the panel is open;
  Escape keeps the strip's focus by design, and Enter/arrows in a closed field
  are inert.
- The dismissal and project-switch effects list their values; the media-query
  read is guarded for environments without `matchMedia`; coarse pointers grow
  the blocks to 44px.
- Dead palette metadata and dead keys (`statusBarVersion`, `statusBarOpenChangelog`,
  `statusBarOpenUpdates`, `titlebarOpenCommandPalette`, `titlebarJumpToHint`,
  `palettePlaceholder`) are gone; `base.css` kept its focus-visible list intact
  without `.palette-dialog`.
- The Console field width, the compressed chip and the hint split followed the
  reader's review in the running app; the results then took the shortcut pane's
  material from the attached capture. The hint is split and hidden below
  1040px.
- The focus handoff does not treat a screen's own search field as "the screen
  already has focus": a destination still focuses the screen's target when the
  palette field lives inside that screen's slot (Console → Console). The hint
  breakpoint moved to 1040px so the halves hide before a long translation can
  clip at the boundary.
- The results panel keeps the surface it opened with while it fades: a
  destination that changes screens no longer flips the material under the exit
  animation.

# Validation

- `pnpm run check:docs` — passed (315 Markdown files, 230 task ids).
- `pnpm run check:frontend` — passed: architecture, typecheck, 144 files /
  1,549 tests, and the production build.
- Focused suites passed on their own: `StatusBar.test.tsx`,
  `CommandPalette.test.tsx`, `App.test.tsx`, `appShell.test.tsx`, and
  `ConsoleScreen.test.tsx`, including the parity, deployment, Console field and
  Escape, pane variant, scroll follow, and focus-handoff tests.
- `pnpm run check` — docs, architecture, typecheck, the 1,549 tests and the
  build passed. The Rust leg could not finish because a running GitOdile
  instance holds `src-tauri/target/debug/gitodile.exe` on Windows (os error 5);
  no Rust file changed. Close the app and rerun the aggregate before
  committing.
- The round-7 artifact was exercised headlessly (jsdom over 36 state
  combinations plus a deployment assertion per variant) and checked in
  Chromium in both themes and at the narrow width; round 8 compared the motion
  candidates.
- The running app was exercised by the reader during the review (screenshots
  at window widths in both themes), which is where the stale-label wording, the
  narrowed strip field, the Console layout, the hint split and the pane style
  came from. No automated GUI pass was run in this session.
