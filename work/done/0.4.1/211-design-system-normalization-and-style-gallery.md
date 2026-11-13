---
id: 211
title: Normalize the visual system on role tokens, guard it, and add a style gallery
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
  - docs
created: 2026-10-28
completed: 2026-10-28
parent:
queue:
---

# Goal

Make the app's current look the specification future design work follows:
every visual value comes from a role token, `pnpm run check` fails when one
does not, `DESIGN.md` opens with the checklist a new screen or dialog starts
from, and a development-only gallery shows every shared primitive and state in
every theme without Tauri.

# User outcome

The same kind of thing looks the same on every screen: icons, spacing, focus,
selected rows, notices, disabled controls, small icon buttons, empty states and
spinners no longer vary by a few pixels or percent from one screen to the next.
For people building GitOdile, a screen or dialog added in 0.5.0 inherits the
current style by default instead of depending on whoever writes it.

# Context

Before 0.5.0, whose conflict screens and dialogs are mostly new UI, the user
asked to make sure design work would respect the current style. The review
found `DESIGN.md` thorough (3,500 lines) but opening with feature specs placed
before its design goal, with three internal contradictions, and no entry point
for "I am building a screen or dialog". The guards in `styleComposition.test.ts`
already held radius, type, weight, leading, tracking and button size; measuring
the cascade showed drift on every other axis: 14 icon sizes, about 570 spacing
literals off the scale, 6 easing curves, z-index from 1 to 1000, 14 strengths
of the accent tint, 7 disabled opacities, 9 icon-button sizes, 9 non-square
control heights, 3 copies of the empty-state block, 11 empty-list lines and 3
identical spin keyframes.

Every visible change was shown first as a before/after mockup with options;
the user chose the recommended option each time.

# Scope

- `DESIGN.md`: move feature specs into their sections; add "Before designing a
  screen, dialog or panel"; fix the contradictions (sheet elevation,
  `--radius-field` missing from the token block, "line" for branch); document
  every new scale, the popover recipe, the empty-state variants and the gallery.
- `AGENTS.md`: any screen, dialog, panel, menu or notice starts from that
  checklist; under Hermes the main agent decides the look before delegating.
- Tasks 037-3, 037-6 and 065-4 link `DESIGN.md`.
- Role tokens and migration: layers (`--layer-*`), motion (`--ease-emphasized`,
  `--duration-exit`), icons (`--icon-*`), spacing on a 4px grid, one focus
  colour in the field's own shape, tints (`--tint-*`), opacity
  (`--opacity-disabled`, `--opacity-muted`), icon buttons (`--icon-button-*`),
  control heights (`--control-height-xs`, `--control-height-compact`).
- Shared patterns: `.empty-state--success` and `--compact` (Changes, the clone
  dialog's project list and the notification panel), `.empty-line` and
  `--menu` (nine lists), one `spin` keyframe.
- Guards in `src/architecture/styleComposition.test.ts` for each axis above.
- The style gallery: `gallery.html` and `src/dev/gallery/`, served by
  `pnpm run dev` at `/gallery.html`, outside the production build.
- The status bar's field yields width to the project and branch names in
  narrower windows (found during review, see Implementation notes).

# Out of scope

- Full screens (Changes, History, Branches) in the gallery: they need fixtures
  for their ports and controllers, a task of their own.
- Colour choice and layout, which stay with the checklist rather than a guard.
- Release notes and highlights for 0.4.1.

# Acceptance criteria

- [x] `DESIGN.md` opens with its scope and the design checklist, and no feature
      spec precedes "Design goal".
- [x] Every axis listed in Context has a token scale, the cascade uses it, and a
      guard fails on a new literal; each guard was shown to fail on a probe.
- [x] Values that are not the axis they resemble (timeline rails, search
      highlights, the theme miniature, decorative motion, touch-size overrides
      under `pointer: coarse`) are named exceptions in their guard.
- [x] The three empty-state copies and eleven empty lines use the shared
      block and line; there is one spinner keyframe.
- [x] The gallery renders tokens, controls, the status bar at three window
      widths, menus, every state, real dialogs, banners and toasts in all twelve
      themes, and `dist/` contains none of it.
- [x] The project and branch names in the status bar read in full from a
      window of about 1,100px.
- [x] `pnpm run check` passes.

# Relevant files

- `DESIGN.md`, `AGENTS.md`, `README.md`
- `work/0.5.0/037-3-read-only-conflict-workspace.md`,
  `work/done/0.5.0/037-6-resolve-files.md`, `work/done/0.5.0/065-4-integrate-branches.md`
- `src/styles/tokens.css` and every sheet in the `src/styles.css` cascade
- `src/architecture/styleComposition.test.ts`
- `src/features/changes/ChangesPanel.tsx`,
  `src/features/repository-browser/RepositoryBrowser.tsx`,
  `src/features/notifications/NotificationCenter.tsx` and the nine components
  whose empty lists take `.empty-line`
- `gallery.html`, `src/dev/gallery/`

# Dependencies

None.

# Decisions

- A tint's strength is a token used inside `color-mix`, so the colour still
  comes from the theme and only the strength is fixed per role.
- Spacing between two steps rounds up onto the 4px grid (6→8, 10→12, 14→16);
  1px (a hairline) and 2px (an optical nudge) are the only literals off it, and
  a length that is geometry (the History node column) is a named property.
- Focus is one colour in the field's own shape: a border for capsules and
  framed fields, the line for underlined ones; the Console's fields moved from
  the accent to `--focus-ring`.
- The gallery is a second Vite page, not a registered screen: it is never part
  of the app, so `src/app/screens.tsx` does not apply. It lives under `src` so
  TypeScript keeps it compiling as the primitives change.
- The status bar's field is `clamp(240px, 34cqi, 430px)`: `cqi` resolves to the
  window in the app, and lets the gallery's specimens stand in for narrower
  windows.
- The changes are grouped into three commits by file (docs, style, gallery):
  the visual steps touched the same sheets and `DESIGN.md`, so splitting them
  by step would mean splitting files hunk by hunk.

# Implementation notes

- Scripts in the migration made three mistakes that review caught: the timeline
  rails were taken for a tint, and two touch-size overrides under
  `pointer: coarse` were shrunk to the mouse size. All three were restored, and
  the icon-button and control-height guards skip `pointer: coarse`.
- After the control-height step the user saw the status bar cut the project
  and branch names. Measured in the gallery: the 2px wider glyph gap and 1px
  larger chevrons tipped names that already filled the left column, because the
  centred field took its full 430px first. The field now yields first and the
  glyph gap in the strip is 4px; at 1,100px both names went from 69/91 and
  49/73px visible to full.
- `.empty-state`'s heading and copy rules now target direct children, so a
  feature's own copy nested inside the block (the notification panel's) keeps
  its styling.
- A pre-commit review found and fixed: the status bar's project segment and
  blocks still at 30px beside the 32px branch selector (and the height guard
  not covering `__seg`/`__block`), no `vw` fallback for the field's `cqi`, the
  split diff's empty cells swept from 0.35 into the 0.55 muted opacity, 24px
  under the compact empty state's tile, the `pointer: coarse` stripper written
  twice in the guards, an over-broad `out` pattern in the icon guard, a blank
  gallery when its dictionary fails to load, and the project switcher's 30px
  header icon button, now `--icon-button-attached`.
- Follow-up: full screens in the gallery, with fixtures for their ports.

# Validation

- `pnpm vitest run src/architecture` after every step; each new guard was
  also run against a deliberately wrong probe rule and failed as expected.
- `pnpm run check:docs`, `pnpm run check:architecture`, `pnpm run typecheck`.
- `pnpm run check:frontend`: 157 files, 1,770 tests and the build passed.
  Earlier runs twice saw `App.projects.test.tsx` and `App.test.tsx` time out at
  5s under load; both files passed when rerun alone (23 tests) and in the final
  run.
- `pnpm run check:rust` with a scratch `CARGO_TARGET_DIR` (the running
  `tauri dev` locks the shared target): fmt, Clippy and 648 tests passed. No
  Rust changed.
- Browser: Home, Settings, the notification panel and the gallery in light and
  dark themes; computed sizes, tints and disabled opacity checked with
  scripts; the status bar measured at 1,280, 1,100 and 960px. The user
  reviewed the screens that need a project (Changes, History, Branches, the
  status bar) in their running app.
