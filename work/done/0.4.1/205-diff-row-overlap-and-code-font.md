---
id: 205
title: Keep wrapped diff lines from overlapping and draw them in the chosen code font
status: done
priority: high
type: bug
areas:
  - frontend
  - changes
created: 2026-10-27
completed: 2026-10-27
parent:
queue:
---

# Goal

Long diff lines that wrap onto several rows never paint over the line below
them, and the diff's text is drawn in the code font chosen in Settings.

# User outcome

Reading a change to a long line — a wide import list, say — shows every row
of it clearly instead of two lines printed on top of each other, at any pane
width and after resizing. Choosing Atkinson Hyperlegible Mono, JetBrains Mono
or IBM Plex Mono for code actually changes how the diff looks.

# Context

The user reported, with a screenshot on 2026-10-27, that the added side of a
changed 449-character import line in `HistoryPanel.tsx` was unreadable: its
first row was drawn over the last row of the removed side above it.

The visual diff is virtualized (`DiffHunkList` in `DiffResultView.tsx`): each
row is absolutely positioned at a start computed from the heights before it,
estimated by `estimateLineRows` until the browser measures the row. Reproduced
in a throwaway browser harness with the real hunk, it came from two faults:

- After a width change, `virtualizer.measure()` empties the size cache and the
  effect hands the mounted rows back to `measureElement`. TanStack Virtual
  3.17.11 compares each measurement with the positions it last computed, which
  still hold the old sizes until something reads them; a row whose height
  survived the resize compared equal, was never written back, and the rebuild
  then placed it at its estimate. Its `ResizeObserver` never fires again,
  because the row did not resize, so the overlap stayed until it scrolled out.
- The estimate filled every row to the last column, while `pre-wrap` with
  `overflow-wrap: anywhere` moves a word that does not fit down whole. On long
  wrapped lines that left the estimate a row short — the size the first fault
  then kept.

Investigating it surfaced a third: the lines sit in a `<code>`, which the
browser's own stylesheet sets to generic `monospace`, so the code-font
preference set on `.diff-code` never reached the text. The character-width
probe, appended to the `<pre>`, did get the chosen font. Its cache was keyed by
the font's CSS name, identical while `font-display: swap` paints the fallback,
so the first width cached was the fallback's for the whole session — which, by
coincidence, was the font the text really used.

# Scope

- Make the re-measure after a width change stick.
- Estimate wrapped rows the way the browser breaks them.
- Let the diff text inherit the chosen code font.
- Cache a character width only once its font has loaded, and re-measure when
  a face finishes loading.

# Out of scope

- Emoji and other glyphs drawn from a system fallback font, which advance
  wider than the two columns the estimate gives them; the live measurement
  already corrects those rows.
- Synthetic bold for syntax keywords (only weight 400 is bundled); the
  measurement already accounts for it.

# Acceptance criteria

- [x] A row whose real height does not change across a resize keeps its
      measured height instead of falling back to its estimate.
- [x] `estimateLineRows` moves whole words down, lets spaces hang, splits a
      word only when it is longer than a row, and treats a wide glyph as its
      own break opportunity.
- [x] The diff text renders in each of the four code-font choices.
- [x] A character width measured before its font loads is not cached.
- [x] Unit and regression tests cover the estimate, the re-measure, the width
      cache and the CSS rule.
- [x] Verified in a browser harness across widths and fonts; aggregate gate
      passes.

# Relevant files

- `src/features/changes/DiffResultView.tsx`
- `src/features/changes/changes.css`
- `src/features/changes/DiffResultView.test.tsx`
- `src/features/changes/changesDomain.test.ts`
- `src/architecture/styleComposition.test.ts`

# Dependencies

None.

# Decisions

- The re-measure reads `virtualizer.getTotalSize()` between `measure()` and
  `measureElement`: it is the public read that rebuilds the positions
  (`getMeasurements` is private), so each row is compared with its new
  estimate and every row that differs is recorded. The regression test fails
  without it, which is what catches a TanStack update that changes the
  comparison.
- `.diff-code > code { font-family: inherit; }` rather than moving the font to
  each row: one rule covers the unified, split and accessible views, which
  all render `<pre class="diff-code"><code>`.
- Font readiness comes from `document.fonts.check(font)`, and re-measuring
  also listens for `loadingdone`, because `fonts.ready` can settle before the
  face is requested: the request only starts once the diff's text is laid out
  in it.

# Implementation notes

- Re-measure: `DiffHunkList`'s width effect calls `virtualizer.getTotalSize()`
  after `measure()` and before handing the mounted rows back.
- Estimate: `estimateLineRows` collects each word's column widths and places
  it whole; spaces and tabs hang and only push the next word down; a word
  wider than a row is split by column; a two-column glyph is a word of its
  own. The word buffer is reused across words, since the estimate runs for
  every row of the file on each re-estimate.
- Font: `.diff-code > code { font-family: inherit; }` in `changes.css`.
- Width cache: `measureCharWidth(element, font, letterSpacing)` caches only
  when `document.fonts.check(font)` reports the faces loaded; the metrics
  effect also re-reads on `document.fonts` `loadingdone`.
- Because the text now really uses the chosen font, the default Atkinson
  Hyperlegible Mono (7.58px per character at 12px) is wider than the system
  monospace it used to fall back to (6.60px), so long lines wrap a little
  sooner than before.
- Review pass before completion: read the whole diff. No defects found; the
  word buffer reuse above was the one improvement. Known limits, all corrected
  by the live measurement: emoji are drawn from the system emoji font at about
  2.2–2.5 columns against the estimate's two, and break opportunities other
  than spaces and wide glyphs (after a hyphen, for instance) are not modelled.
- The browser harness was a throwaway `harness/` folder served by the running
  Vite server, deleted before committing.

# Validation

- Reproduction (before the fix), harness with the real hunk: after resizing
  930 → 1100px the added line measured 4 rows but was placed in 3; the size
  cache was empty and `resizeItem` had compared each measurement with the
  stale 4-row position.
- `npx vitest run src/features/changes/DiffResultView.test.tsx -t "wrapped row heights"`
  fails without the `getTotalSize()` read (next row at 38.4px, expected
  76.8px) and passes with it.
- Harness sweep after the fix, 13 widths from 600 to 1250px plus 930 → 1100:
  no overlaps; the new estimate matched the measured rows of every line,
  where the old one missed by a row at 9 of those widths.
- Harness per font on a fresh load (Atkinson, JetBrains, Plex, system): the
  text's computed family is the chosen one, the measured character width
  equals the rendered one (7.585/7.584, 7.2/7.2, 7.2/7.2, 6.598/6.598px), no
  overlaps, no estimate misses.
- `pnpm run check` (Rust with a scratch `CARGO_TARGET_DIR` while
  `tauri dev` held the debug exe): passed — docs, architecture, typecheck,
  1752 frontend tests, build, Rust fmt/Clippy and 642 Rust tests.
