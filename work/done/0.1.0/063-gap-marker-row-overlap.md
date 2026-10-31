---
id: 063
title: Stop the gap marker overlapping the line under it
status: done
priority: low
type: bug
areas:
  - frontend
created: 2026-08-15
completed: 2026-08-18
---

# Goal

Make the "N unchanged lines" marker occupy the height it actually renders at,
so the diff line after it is not drawn 7px on top of it.

# User outcome

The chip that opens a collapsed gap stops being clipped along its bottom edge.

# Context

Found while verifying task 058 against a real virtualized diff in the browser.
It is not caused by that task: it reproduces with every reading preference at
its default, and identically with wrapping on and off, so no preference
influences it.

`ESTIMATED_MARKER_ROW_HEIGHT` in `DiffResultView.tsx` is `32`. A marker row
measures **39.25px** in the current theme — 27.25px for
`.diff-hunk__marker` plus its own 6px vertical margins, which do not collapse
out because `.diff-row` is absolutely positioned and therefore establishes a
block formatting context.

Measured across four scroll depths and both wrap modes, the row after every
marker sits exactly −7.25px from the marker's bottom edge. The constant
difference is the whole story: `39.25 - 32 = 7.25`.

What is not yet explained is why `measureElement` does not correct it. Every
row carries `ref={virtualizer.measureElement}` and `measureDiffRowHeight` does
account for the row's own `margin-top`, so the measured value should replace
the estimate. Ordinary line rows *are* contiguous to the pixel, so measurement
is working for them. Establishing why the marker row keeps its estimate is the
first step of this task, not an assumption to code around.

# Scope

- Find out why the measured height of a marker row does not replace its
  estimate.
- Fix the overlap at its cause. If the cause turns out to be the estimate
  alone, derive it from the same CSS the marker uses rather than hardcoding a
  second magic number that can drift again.

# Out of scope

- The reading preferences from task 058.
- Any other virtualizer tuning — `overscan`, the wrap estimate, or the
  split-view gutters.

# Acceptance criteria

- [x] The row after a gap marker starts at the marker's bottom edge, measured
      at several scroll depths and in both wrap modes.
- [x] The marker chip is not visually clipped.
- [x] Whatever the estimate ends up being, changing the marker's CSS padding
      or margin does not silently reintroduce the drift.
- [x] Full `pnpm run check` passes.

# Relevant files

- `src/features/changes/DiffResultView.tsx`
  (`FALLBACK_MARKER_ROW_HEIGHT`, `markerRowHeight`, `measureRow`,
  `measureDiffRowHeight`)
- `src/features/changes/changes.css` (`.diff-hunk__marker`, `.diff-row`)

# Dependencies

None. Predates task
[058](058-diff-reading-preferences.md), which is where it was noticed.

# Decisions

**The estimate was never wrong for long — it was simply never replaced.**
`virtualizer.measure()`, called whenever the wrap point, line height, tab size
or view mode changes, clears `itemSizeCache` outright. The rows already on
screen stay in the virtualizer's `elementsCache` and stay observed, but their
height did not change, so their `ResizeObserver` never fires again and the
measurement taken when they mounted is gone for good. From that moment the
list runs on estimates only. Ordinary line rows never show it because their
estimate is exact by construction — `estimateLineRows` times `lineHeight`
over a monospace font — so "line rows are contiguous to the pixel" was never
evidence that measurement worked. The marker was the one row whose estimate
was a guess, so it was the one row that drifted.

Proved rather than assumed. With `ESTIMATED_MARKER_ROW_HEIGHT` set to 200 the
gap after a marker became 160.75px — exactly 200 minus 39.25 — so the
measured value was contributing nothing at all. Suppressing the
`virtualizer.measure()` call put every marker at 39.25px with a 0px gap, the
200 fully corrected. That is both halves of the mechanism.

**Two changes follow from that, not one.** Re-measuring the mounted rows after
`measure()` is the fix at the cause, and it is enough for what is on screen.
It is not enough for what is not: rows below the fold are still placed by
`estimateSize`, so a wrong marker estimate would still make the list reshuffle
as it scrolls — the exact failure the estimate comment in the file warns
about. So the estimate stops being a constant too. `markerRowHeight` takes the
height of the first marker row that renders, and every later marker is
estimated from that.

**Why not a hidden probe element.** Measuring a real marker needs no duplicate
markup to keep in sync, costs no extra DOM node, and cannot disagree with what
is actually rendered — including the difference between the interactive chip
and the static `.diff-hunk__marker--static` caption, which are separate markup
paths with their own padding. `FALLBACK_MARKER_ROW_HEIGHT` survives only as
the value for the frames before the first marker mounts.

**The marker's CSS was left alone.** A 39.25px row is what the design asks
for, and `measureDiffRowHeight` was already correct. Only the arithmetic that
placed the row was wrong.

# Implementation notes

All in `src/features/changes/DiffResultView.tsx`; no CSS changed.

- The `useLayoutEffect` that calls `virtualizer.measure()` now hands the
  mounted `.diff-row[data-index]` elements straight back to
  `virtualizer.measureElement`. Without it, the cache it has just emptied is
  never refilled for those rows.
- `ESTIMATED_MARKER_ROW_HEIGHT = 32` became `FALLBACK_MARKER_ROW_HEIGHT = 40`,
  used only until the first marker renders.
- New `markerRowHeight` state, fed by `measureRow` — a `useCallback`
  wrapping `virtualizer.measureElement` for every row that also, for a row
  tagged `data-row-kind="marker"`, reports what `measureDiffRowHeight` read.
  It is a dependency of the re-measure effect too, so a new marker height
  invalidates the estimates computed from the old one.

# Validation

`pnpm run check` — passed, exit 0: docs over 95 Markdown files and 63 task
ids, 42 test files / 361 frontend tests, `vite build`, `cargo fmt`, `clippy
-D warnings`, and 244 Rust tests.

Rebuilt the throwaway Vite entry (`diff-harness.html` + `src/diffHarness.tsx`)
as this task asked, mounting `DiffResultView` with a generated 40-hunk diff
— 30 hidden lines before each hunk, so every hunk opens with a marker —
and a `projectPath`, so the markers render as the interactive chip rather than
the static caption. Deleted after use; none of it is committed.

Every number below is a rect measured in the page, not an inspection:

| | before | after |
| --- | --- | --- |
| marker row height | 39.25px | 39.25px |
| height the virtualizer allotted it | 32px | 39.25px |
| gap between the marker row and the row after it | -7.25px | 0px |
| clearance between the chip's bottom edge and the next row | -1.25px | +6px |

The -1.25px is the clipping itself: the next row was drawn 1.25px *inside* the
chip, not merely inside the chip's margin. Afterwards the next row starts 6px
below it, which is the chip's own bottom margin.

Held across nine measurement points — unified and split, wrapping on and
off, four scroll depths including the very bottom — every one with a worst
marker gap of 0px, a worst line-row gap of 0px, and 6px of chip clearance.

For the third criterion the marker's CSS was changed under the fix and the
page reloaded: `margin: 6px` to `10px` gave a 47.25px row, and `padding: 5px`
to `12px` on `.diff-hunk__expand` gave 61.25px. In both cases the virtualizer
allotted exactly the measured height and the gap stayed 0px, with nothing in
the TypeScript touched.

One caveat, recorded because it bounds the evidence. Neither browser surface
available here composites frames — `document.visibilityState` is `hidden` in
both — so `ResizeObserver` notifications are never delivered to the page and
the RO leg of measurement could not be exercised. Everything above rests on
the mount-time measurement path and on the metrics layout effect, which run
synchronously. That is the path the bug lived on and the path the fix repairs,
but a resize that changes the wrap point was reproduced by toggling the wrap
preference — which calls `readMetrics` directly — rather than by an actual
pane resize. A first attempt to test it by narrowing the container looked like
a 40px line-row drift; it reproduced identically on unmodified `main`, and was
the suspended `ResizeObserver`, not a bug.
