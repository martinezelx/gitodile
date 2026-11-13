---
id: 183
title: Put each screen's content on one sheet
status: done
priority: normal
type: design
areas:
  - frontend
  - design
  - ux
created: 2026-10-18
completed: 2026-10-19
parent:
queue:
---

# Goal

Column 2 of the app shell becomes one sheet per screen, as decided in
[ADR 0032](../../../docs/adr/0032-one-sheet-per-screen.md). The titlebar and
rail stay the flat frame. Overview, Work (Changes and History) and Branches lay
their panels edge to edge on the sheet, divided by hairlines instead of
floating as separate cards. The status bar becomes the sheet's foot, and
Home drops the global status bar in favour of its own "This computer" row
and, like Console, takes no sheet: its launcher floats on the plane alone.

# User outcome

Moving between Overview, Work, Branches and Home no longer changes what kind of
window it is: there is always one sheet on the same frame. The diff and the
lists get the 16px the gaps took, and Home reads as a launcher only, without
a strip of project facts it is not about.

# Context

The design review is the style lab in
`style-lab.html` (a retired review prototype; 36 styles over nine
screens). "Hoja en marco" (frame and sheet, after Arc and Dia) was chosen
there, then checked on the real app with this repository's own data before
this task was written. The frame keeps today's `--surface-app`: the lab's
first draft tinted it, and that was dropped.

# Scope

- `app-shell.css`: the sheet (a pseudo-element over column 2), the
  workspace and status bar inside it, the 10px frame, the hidden-rail and
  narrow-window cases.
- `App.tsx`: the shell class that turns the sheet on (every view but
  Console), and no global status bar on Home.
- Overview, Changes, History and Branches sheets: panels lose the card recipe;
  hairlines between panes and bands; forced-colours outlines that only
  existed for the cards.
- Home: no sheet; the launcher box keeps its own lift and floats alone.
- Home's "This computer" line carries the app search at its far end: the
  palette deploys from a field, and the strip's is not there (as on Console).
  The palette's results there take the field's width.
- DESIGN.md: § Visual character, § Layout concept (rail and status bar),
  § Elevation.

Out of scope: dialogs, Settings, menus and the palette (they float and do not
change); Console (stays as it is); a focus treatment for the next step to
replace its lost elevation (accent halo, separate task if wanted).

# Acceptance criteria

- [x] Overview, Work (both tabs) and Branches show one sheet on
      `--surface-panel` with `--border-subtle`, `--shadow-sm` and
      `--radius-surface`, with the same 16px frame on all four sides and
      `--shadow-md`.
- [x] Inside the sheet no panel wears a border, shadow or radius of its own;
      Changes, History and Branches panes meet on one 1px hairline and their
      strips stay level.
- [x] Overview reads as header, next step and body bands; the timeline and
      the side column are divided by a hairline, and the side column's
      sections by hairlines.
- [x] The status bar is the sheet's foot on Overview, Work and Branches; its
      fade over a scrolled workspace uses the sheet's colour.
- [x] Home has no global status bar and no sheet; the launcher floats on
      the plane with `--surface-raised` and `--shadow-md`.
- [x] On Home, `Ctrl`/`Cmd`+`K` opens the palette from the field in the
      "This computer" line, its results as wide as the field.
- [x] Console looks exactly as before.
- [x] With the rail hidden (`Ctrl`/`Cmd`+`B`) and below 800px the sheet keeps
      a frame on the left too.
- [x] Dialogs, Settings and menus are unchanged.
- [x] Light and dark official themes and a community dark theme checked in
      the running app.
- [x] DESIGN.md describes the sheet; `pnpm run check` passes.

Checked by the owner in the running app (`tauri dev`) during the work, and
in a browser harness that rendered the real components on this repository's
own data, in the official light and dark themes.

# Implementation notes

- The sheet is `.app-shell--sheet::before`, the first grid item of the shell,
  so it paints under the workspace and the status bar without a z-index and
  nothing inside the workspace is stacked beneath the strip. `App.tsx` sets
  the class on every view but Console, and `app-shell--home` closes the sheet
  on the workspace where there is no strip.
- The command palette deploys from a field, not a dialog of its own, so
  dropping the strip on Home would have left `Ctrl`/`Cmd`+`K` with nowhere to
  type. Home's "This computer" line now carries the field at its far end
  (`HomeSearch` in `HomeLauncher.tsx`), wired the way Console's is, and the
  palette's anchor follows the active screen (`paletteAnchorRef`).
- The workspace and the strip keep the surface radius rather than the inner
  `radius - 1px`: neither has a fill, and the role-token guard in
  `styleComposition.test.ts` allows only tokens.
- Validated against the real app components with this repository's own
  state in a throwaway browser harness at 1440×900 and 780×800 (geometry,
  no panel shadows inside the sheet, hairlines, Home's palette, the hidden
  rail, Console unchanged) and in the official light, official dark, Nord and
  Tokyo Night themes by token. A look through Computer Use at the `tauri dev`
  window was not possible: the Windows session was locked.
- Home left the sheet after the first review: a sheet round its single
  launcher only framed the frame. The launcher keeps `--surface-raised` and
  `--shadow-md` and floats alone, as before this task.
- The palette's results on Home take the field's width (`fitToField` in
  `CommandPalette.tsx`), measured on the whole field (`data-palette-field`)
  rather than its input, and its foot closes up so the keys stay on one line.
- The direction is named **Friendly Sheet** in DESIGN.md § Visual character,
  stated as four rules. A pass over the rest of the app found three surfaces
  still in the old recipe or on the floating fill: the in-screen notices
  (three different fills), the narrow window's compact navigation and Get
  project changes' version list. All three now rest on `--surface-card`
  without a shadow, and a guard in `styleComposition.test.ts` holds it.
- The search field and its results follow the sheet too (compared in
  `work/assets/style-lab/search-lab.html`): at rest the field is the closed
  object, on what floats' surface with the subtle edge and `--shadow-sm` and
  no keycap; open, the results grow out of it as one object — the field's
  width, on its top edge, an accent-mixed edge and a soft halo round both,
  capsule rows with glyphs in circles and `↵` on the chosen row, no key
  footer. The strip's field keeps at least 240px, and a field under 320px
  gets a floating panel instead of a fused one. Console keeps its own.
- `pnpm run check` passes.
