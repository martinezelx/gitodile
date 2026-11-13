---
id: 078
title: Rework the navigation rail, window chrome, and project switcher
status: done
priority: normal
type: improvement
areas:
  - frontend
  - desktop
  - accessibility
  - documentation
created: 2026-08-26
completed: 2026-08-26
parent:
queue:
---

# Goal

Make the window chrome read as one continuous surface — rail, titlebar, and a
new status bar — instead of a panel beside a panel, and give the rail back the
width and height it was spending on things that never change.

# User outcome

The rail is narrower and quieter, so more of the window belongs to the project.
It can be collapsed entirely and still reached without expanding it. Project
state that used to require navigating to Overview is visible at a glance on
every screen, and people who keep many projects open can star the ones they
actually switch between.

# Context

The rail was an 88px card sitting beside the content card, carrying a 40px
brand lockup at its top and unlabelled circles at its foot. Two decisions in
`DESIGN.md` were in tension: "Friendly Card" is the language for content
surfaces, but the rail is chrome, and giving chrome the same treatment made the
window read as two competing panels.

The width was also not a designed number. It turned out to be a function of the
longest unbreakable label in the widest language, which nobody had written
down — so shortening two Spanish words was worth 24px of content.

# Scope

- Rail: remove its panel surface; derive its width; add a group divider;
  collapse to `display: none` with a persisted preference and `Ctrl`/`Cmd`+`B`.
- Brand: move the mark to the titlebar permanently, as a bare silhouette.
- Destination names: one word each, in both shipped languages.
- Status bar: a visual preview, deliberately not wired to any data.
- Project favourites: star, sort, filter, and a filtered jump menu.
- Fix the project switcher's and add-project menu's sizing.
- Keep `DESIGN.md` true throughout.

# Out of scope

- Wiring the status bar to real repository state.
- Tooltips for the rail's now-unlabelled utility controls.
- Any change to the Rust side.

# Acceptance criteria

- [x] Rail carries no fill, border, radius, or shadow, and no brand block.
- [x] Rail width derives from the longest label; icons-only narrows to the icon
      square rather than keeping a labelled column's width.
- [x] No rail label wraps to two lines in either language.
- [x] Collapse removes the rail from the tab order, not merely from view.
- [x] The collapsed rail is reachable from the titlebar control by hover, with
      a grace period across the gap between control and menu.
- [x] Status bar spans the content column, shares its inset, and states plainly
      in code that it is not wired.
- [x] Favourites survive restarts and closing their project.
- [x] Every text/background pair introduced meets 4.5:1 in both themes.
- [x] `pnpm run check:frontend` and `check:docs` pass.

# Relevant files

- `src/app/App.tsx`
- `src/app/StatusBar.tsx` (new)
- `src/app/RailNav.tsx`
- `src/app/app-shell.css`
- `src/app/preferences.ts`
- `src/app/project-switcher/ProjectSwitcher.tsx`
- `src/app/translations.ts`
- `src/styles/tokens.css`
- `DESIGN.md`

# Dependencies

None.

# Decisions

**The rail width is a measured value, not a chosen one.** 64px is 8px of
padding either side of the longest unbreakable destination label across both
languages — "Overview", 46.3px. It sat at 88px only because "Configuración"
(69.7px) and "Recuperación" (66.7px) were rail labels; Chromium ships no
Spanish hyphenation dictionary (verified: `hyphens: auto` changes no line box
at any width), so a narrower column could only have broken them mid-syllable.
Renaming them was the way down. Treat a new long destination name as a width
decision.

**Destination names are one word; prose keeps the full term.** "Branches" shows
branches and the prose still says "branch" — an abbreviation, not a
second vocabulary. "Branches" was rejected for the opposite reason: it would
have made the user learn that two words mean one thing.

**The mark is corner-anchored, not centred over the rail.** Centring required a
rail-wide brand column, and the ~60px of it the mark did not fill pushed every
titlebar control right by the same amount.

**The mark uses `--accent-primary`, not `--accent-brand`.** The brand lime is
one fixed value in both themes, which works behind a tile that supplies its own
contrast; painted bare on the light app surface it measures 1.95:1. The
per-theme green measures 5.09:1 light and 11.46:1 dark.

**Only unmarked controls are captioned.** The project avatar, "+", Settings and
account carry no visible label: the two that are not self-evident sit directly
under what they act on. Their accessible names stay on the buttons. Note they
have no tooltip either — if that proves to be a problem, add tooltips rather
than bringing captions back.

**The jump menu is driven by React state, not CSS `:hover`.** The first version
put `:hover` and `:has()` selectors in one comma-separated list; one
unsupported selector invalidates the whole rule, so on an engine without
`:has()` the hover silently did nothing. The `:has()` refinement now lives in
its own rule, where being skipped costs only itself.

**Favourites are keyed by the canonical worktree root**, the same identity the
session reducer uses — stable across restarts, path aliases, symlinks and case
variants, which a generated session id would not be. Sorting is display-only:
`sessionsState.order` stays canonical so starring never changes what
`Ctrl`/`Cmd`+`Tab` cycles through. The favourites *filter* is not persisted: a
filter is a way of looking at the list now, and projects hidden by a forgotten
one would look closed.

# Implementation notes

`.app-shell` became a grid so the status bar could span from the rail's edge to
the window's without wrapping the workspace in another element. The rail owns
column 1 across both rows; workspace and status bar stack in column 2. With the
rail hidden, column 1 measures zero and both stretch.

`--workspace-inset-left/right` were extracted so the workspace and the status
bar cannot drift apart at any breakpoint — they were two hard-coded numbers for
one decision, retuned in two media queries.

Two bugs were found by measuring rather than by looking:

- `.sidebar-project-flyout` declared a flat `height: 180px`, and the
  add-project menu borrowed the class, with a rule stretching its items to fill
  it. Three options were being spread across a panel built for a scrolling
  list. Both symptoms had one cause.
- The search-row filter button kept the UA's default `1px 6px` padding. With
  `border-box` that left a 12px content box for a 14px icon — too narrow to
  centre in, so the icon was pushed to the start and the hover fill sat 6px to
  its left and 4px to its right. The vertical axis hid it, having 22px of
  content box for the same icon.

`--brand-mark-foreground` and `navProjectTile` were removed once nothing
referenced them.

Follow-up work, none of it blocking:

- The status bar is a preview. `PREVIEW` in `StatusBar.tsx` is fixed sample
  data and the refresh control is disabled on purpose. It is the one surface in
  the app whose whole job is to be believed at a glance, so wire it before it
  ships: branch from the active session, counts from the changes feature, sync
  from the sync controller.
- Now that the utilities are uncaptioned, "Configuración" would fit the rail
  again; "Ajustes" was kept on its own merits.
- `Ctrl`/`Cmd`+`B` still toggles below the 800px breakpoint, where the rail is
  already hidden by the media query, so the state changes with no visible
  effect until the window is widened again.

# Validation

Run at the end of the work, on an otherwise idle machine:

- `npx tsc -b --pretty false` — passed, no output.
- `npx vitest run --passWithNoTests` — 438 passed (438), 53 files. Five tests
  were added: three for favourite ordering and marking, two for the switcher's
  favourites filter and its empty state.
- `node scripts/check-docs.mjs` — passed over 129 Markdown files, 97 task ids.
- `node scripts/check-frontend-architecture.mjs` — passed over 290 modules.
- `npx vite build` — built successfully.

`check:rust` was **not** run: this task touches no Rust. The full
`pnpm run check` therefore has not been executed end to end.

Geometry and contrast claims above were verified by measuring the rendered DOM
in a browser at 1280×800, 1100×520, 1000×800, 760×800 and 700×800, in both
themes and both languages, not by inspection.

Two limits on that verification, both from the environment rather than the
code: the browser has no Tauri APIs, so no project can be opened and the
project avatar, the switcher rows and the favourites flow were exercised only
through unit tests with fixtures; and the preview pane does not composite, so
`:hover` itself, CSS transitions, and focus events could not be driven — those
paths were verified through the state they set, and confirmed in the real app
by the user.
