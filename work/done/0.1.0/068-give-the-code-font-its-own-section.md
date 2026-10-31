---
id: 068
title: Give the code font its own group with a real sample
status: done
priority: normal
type: feature
areas:
  - frontend
created: 2026-08-23
completed: 2026-08-23
parent:
---

# Goal

Move the code-font choice out of the diff-reading list into its own group
inside the Reading section, and present each option as a sample of the font
rather than as a word in a segmented control.

# User outcome

The choice reads as what it is — picking a typeface — instead of sitting as a
fifth row among wrapping, whitespace, highlighting and tab width. Each option
shows the actual glyphs, including the characters that are the whole reason to
prefer one monospaced font over another: `0` against `O`, `1` against `l` and
`I`.

# Context

Task 067 added `codeFont` to `DiffPreferences` and put its control in the
Reading section's **Diffs** group, as a `segmented-control` row matching tab
width. That was the cheap placement, and it is the wrong one twice over.

First, grouping. The other four controls in that group answer "how should this
diff be laid out": wrap or not, collapse whitespace or not, how wide a tab is,
colour by language or not. The font answers a different question, and it is the
only one of the five whose value the user cannot judge from its label.

Second, presentation. A segmented control shows a word. But nobody picks a code
font by its name — they pick it by whether `0` and `O` are distinguishable at
12.5px. Task 067 already rendered each option in its own family, which was the
right instinct in the wrong container: four words in four fonts is a hint, not
a sample.

Where the setting applies is unchanged and worth stating, because it is easy to
assume it is broader than it is. `DiffResultView` is the only consumer, and it
is reached from exactly three places: the Changes panel, the History panel, and
the pending-versions list under Overview. The application's own text keeps the
system sans-serif stack in `tokens.css`, and the roughly fourteen hardcoded
`ui-monospace` uses elsewhere — clone URLs, project paths, version hashes, the
Git version, branch names, sync file paths — are identifiers rather than
code and deliberately stay outside this setting.

# Scope

- Add a second group to the Reading section for the code font, after the diffs
  group, with its own heading and description.
- Replace the segmented control with a picker whose options each show the
  family name and a code sample rendered in that family.
- Choose a sample string that exercises the glyphs the choice actually turns
  on: zero against capital O, one against lowercase l and capital I, and the
  punctuation a diff depends on.
- Keep the radio-group semantics, the roving tabindex, and the arrow/Home/End
  keyboard behavior the previous control had.
- Keep the group inside the Reading section's existing reset.
- Verify the change reaches a rendered diff immediately and without a stall,
  from whichever screen is behind the dialog.

# Out of scope

- Widening the setting to the application's own text, which keeps the system
  sans-serif stack.
- Widening it to the hardcoded monospaced identifiers listed above.
- Adding, removing or reordering the four families.
- Font size and line height.
- The identity and line-ending read latency, still recorded in the backlog.

# Acceptance criteria

- [x] Reading shows two groups: the diff options, then the code font.
- [x] Each option renders its family name and a code sample in that family,
      and the selected one is visually distinct.
- [x] The picker is one Tab stop; arrows move within it; Home and End reach the
      ends; Space and Enter activate.
- [x] The options fit without horizontal scrolling at the 900px minimum window
      width.
- [x] Selecting a font updates an open diff on the screen behind the dialog in
      the same frame budget as any other preference, with no visible stall.
- [x] "Reset this section" still returns the font along with the diff options.
- [x] Full `pnpm run check` passes.

# Relevant files

- `src/features/settings/SettingsPanel.tsx`
- `src/features/settings/settings.css`
- `src/features/settings/translations.ts`
- `src/features/settings/SettingsPanel.test.tsx`

# Dependencies

Refines task 067.

# Decisions

- Two columns rather than a row of four. The sample line is the point of the
  card, and four across squeezes it to where it stops being readable — which
  would defeat the change. Single column below the existing 800px breakpoint.
- The specimen renders at full text contrast on every card, selected or not.
  Dimming the unselected ones measured 4.91:1 in light — passing, but the
  sample *is* the thing being judged, and showing it fainter than it will
  really render is a misleading preview rather than a de-emphasised one.
- Selection is stated by the card's border and fill, not by a tick in the
  corner. The card is already a specimen; a glyph laid over it would compete
  with the thing being judged. This is also the device the section rail already
  uses for its active item.
- The sample is `aria-hidden`. A screen reader cannot convey a glyph shape, so
  reading "zero oh one ell eye" into every option's accessible name would add
  noise and no information; the family name carries the choice.
- The setting stays out of the application's own text and out of the roughly
  fourteen hardcoded `ui-monospace` identifiers. Those are hashes, paths and
  URLs — things that must not be confused with each other, but not code the
  user sits and reads.

# Implementation notes

The Reading section now holds two groups: **Diffs**, unchanged, and **Code
font**. The `segmented-control` became a `.font-picker` grid of cards, each
carrying the family name and a specimen line, the whole card set in the family
it selects.

The specimen is `0O 1lI {}[] != =>`: zero against capital O, one against
lowercase l and capital I, and the punctuation a diff turns on. It renders at
12.5px/1.6 on `--surface-code` — the diff's own size and surface — so what the
card shows is what the diff will give.

`--surface-code` sits within 1.04:1 of the card in light and 1.00:1 in dark, so
the "well" is not a visible device. That is deliberate rather than an oversight:
it is the colour the code will actually sit on, and choosing a more visible
background would make the preview less true.

The description copy now states the scope in the UI itself — only diffs in
Changes, History and pending versions, the rest of the app unaffected — because
that was the exact thing a reader would otherwise have to guess.

# Validation

`pnpm run check` — passed, exit code 0 (`check:docs` over 120 files and 88 task
ids, `check:architecture` over 279 modules, `typecheck`, `test` 399 passed /
49 files, `build`, `check:rust` 290 passed).

Measured against the running dev server:

- Reading renders two groups: "Cambios" with the four layout controls, then
  "Fuente del código" with the picker and no rows of its own.
- Each card's computed `font-family`, and its sample's, start with the family
  the card names; every sample computes to 12.5px.
- At the 900px minimum window width the grid is `293px 293px`, two by two, no
  sample clipped (`scrollWidth === clientWidth` on all four), and neither the
  section view nor the document scrolls horizontally. Below 800px it collapses
  to one column.
- Keyboard: focus starts on the selected card; ArrowDown/ArrowUp/Home/End walk
  Hyperlegible → JetBrains → Plex → Sistema and wrap, the group holds exactly
  one Tab stop, and arrowing across the options does **not** change the
  selection.
- Contrast, with alpha composited against the real ancestor stack:
  light — names 15.47:1 (selected) and 17.49:1, samples 16.03:1 on every card;
  dark — names 12.35:1 and 16.67:1, samples 16.67:1 on every card. All pass AA
  for normal text with margin. The first pass measured the unselected samples
  at 4.91:1 in light, which is what prompted the full-contrast decision above.
- Cost of switching: 14.9–20.2 ms from click to flushed React commit plus
  forced layout. The control matters more than the number — the tab-width radio
  measured 17.6–18.7 ms and the wrap switch 14.5–17.9 ms on the same page, so
  the font costs what every other reading preference costs. The ~17 ms floor is
  the dev build re-rendering the app tree under `React.StrictMode`, not
  anything the font does.
- Why it cannot degrade with a large diff mounted: `measureCharWidth` caches by
  computed font string in a module-level map, so each family is measured once
  per session (0.3–0.4 ms, measured) and every later switch is a map lookup.
  `widestRowColumns`, the only walk over every loaded row, depends on
  `[rows, wrapLines, metrics.tabSize]` and not on character width, so a font
  change does not trigger it.
- Not verified in the browser: this environment cannot display the pane, so no
  paint-timing or screenshot was possible, and no repository can be opened
  without the Tauri IPC — the diff-mounted path rests on the unit tests and the
  caching argument above rather than on a live observation.
