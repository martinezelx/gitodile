---
id: 058
title: Let people set how diffs are read
status: done
priority: normal
type: feature
areas:
  - frontend
  - ux
created: 2026-08-15
completed: 2026-08-15
---

# Goal

Give the diff viewer the four reading preferences users of a Git client
reach for first — line wrapping, whitespace, tab width, syntax highlighting —
and a Settings section to set them in.

# User outcome

A long line can be read without a horizontal scrollbar, or kept on one line if
that is what you prefer. A commit that only re-indented a file stops looking
like a rewrite. Tabs render at the width the project actually uses.

# Context

Task 057 right-sized Settings but added nothing to it. This is the first group
worth adding: every one of these is a preference about reading, which is what
the Changes screen is for, and the renderer already exists to honor them.

Today all four are hard-coded. `DiffResultView` renders with
`white-space: pre-wrap` and `overflow-wrap: anywhere`, and `syntaxHighlight.ts`
always runs.

The catch, and the reason this is its own task rather than four toggles: the
diff list is virtualized with `@tanstack/react-virtual`, and its row-height
estimates are computed *from the wrap point*. `DiffResultView` carries a
detailed comment about sampling character advances to guess how many visual
rows a wrapped line occupies. Turning wrapping off changes every estimate, and
the side-by-side view already derives its own wrap point because it halves the
space a line has. A wrap toggle is therefore a change to the virtualizer's
measurement path, not a CSS switch.

# Scope

- A "Reading" section in Settings with:
  - wrap long lines (on/off, default on — today's behavior);
  - ignore whitespace-only changes (on/off, default off);
  - tab width (2/4/8, default 8 — see the decision below);
  - syntax highlighting (on/off, default on).
- Persist all four in `src/app/preferences.ts` beside the existing
  preferences, and deliver them to the Changes feature.
- Honor them in `DiffResultView`, including re-measuring the virtualizer when
  the wrap preference or tab width changes.
- Extend the task-057 "reset this section" to cover the new controls.

# Out of scope

- Side-by-side versus unified as a *preference*. The view picker already
  chooses that per diff; making it sticky is a separate question.
- Font size or density for diffs and file lists. Related, but it is an
  accessibility change with its own scope — keep it out of this one.
- Whitespace handling in the Rust diff generation. "Ignore whitespace-only
  changes" here means what the viewer displays; changing what Git is asked for
  (`-w`) is a different, larger change.

# Acceptance criteria

- [x] Each of the four preferences changes the rendered diff and survives a
      restart.
- [x] With wrapping off, a line longer than the viewport scrolls horizontally
      inside the diff body and the page itself does not.
- [x] Toggling wrapping or tab width on an open diff leaves no gap or overlap
      in the virtualized list — measured on a file with more rows than fit.
- [x] Turning syntax highlighting off removes the token markup rather than
      merely recoloring it.
- [x] Defaults reproduce today's rendering exactly, so an existing user sees
      no change until they ask for one.
- [x] A file whose every change is whitespace says so instead of rendering an
      empty pane.
- [x] Every Settings section still fills at least 60% of the panel and none of
      them scrolls at 1280x840.
- [x] Full `pnpm run check` passes.

# Relevant files

- `src/features/changes/DiffResultView.tsx`
- `src/features/changes/diffPreferences.tsx`, `ignoreWhitespace.ts` (new)
- `src/features/changes/changes.css`, `translations.ts`, `index.ts`
- `src/features/settings/SettingsPanel.tsx`, `domain.ts`, `translations.ts`
- `src/app/preferences.ts`, `src/app/AppOverlays.tsx`, `src/app/app-shell.css`
- `src/main.tsx`

# Dependencies

Builds on task [057](057-right-size-settings-and-about.md), which
established the group layout and the reset action this extends.

# Decisions

- **Tab width defaults to 8, not the 4 this task originally specified.** The
  two requirements collided: "default 4" against "defaults reproduce today's
  rendering exactly". `.diff-code` never set `tab-size`, so the diff has
  always rendered at CSS's initial value of 8 — and `estimateLineRows` and
  `.diff-code--accessible` both already hardcoded 8 to match. Changing the
  default would have moved every tab-indented line for every existing user on
  first launch. The no-change criterion wins; 4 is one click away.
- **"Reading" became its own rail section rather than a group inside
  Interface.** Measured: the four controls took Interface from 79% fill to
  162%, so it scrolled and half the section sat below the fold. The
  alternative was growing the dialog back toward the 720px height task 057
  had just cut it down from, which would have pushed General back under the
  60% floor. Four sections is not a regression of 057 — that task collapsed
  four into three because two of them held *one control each*; a section with
  four controls earns its place. Final fill: 67 / 76 / 82 / 78%, nothing
  scrolls.
- **Delivered through React context, not props.** The two consumers sit in
  different features and reach `DiffResultView` through unrelated panels — the
  Changes screen, and the pending-versions list under Overview via
  `OverviewPanel`. Threading four values through both would have touched
  panels that have no interest in them. `useDiffPreferences` falls back to the
  defaults with no provider, so a diff rendered outside the shell still works.
- **Settings imports the type from `features/changes`.** The architecture
  guard permits feature-to-feature imports through a public entry, and this is
  an honest dependency: the panel offers controls for the diff viewer, so the
  viewer owns what they mean. The app stores them, as it does every other
  preference.
- **Ignoring whitespace drops a hunk that ends up all-context.** Collapsing a
  re-indented pair turns it into an unchanged line; a hunk with nothing but
  unchanged lines is not a change, and `git diff -w` would never have emitted
  it. Its lines remain reachable through the neighbouring gap markers like any
  other unchanged context.
- **A file with nothing but whitespace changes gets an explanation.** Found
  while writing the tests: filtering the only hunk away left a blank pane for
  a file the list says has changed, which reads as a bug rather than as the
  preference working.

# Implementation notes

- `diffPreferences.tsx` (new) holds the type, the defaults, the provider and
  the hook. `ignoreWhitespace.ts` (new) holds the collapsing transform as pure
  functions, which is what made its edge cases — unequal runs, a mismatch
  partway through a run — testable without rendering anything.
- The transform is applied once in `DiffResultView` and passed down, so the
  virtualized view, the accessible view and the "is there anything left"
  check cannot disagree about what the diff contains.
- **Wrapping off falls out of the existing estimator.** `estimateLineRows`
  already returns 1 for `charsPerLine <= 0`, so `readMetrics` sets the wrap
  point to 0 instead of adding a branch, and the virtualizer's re-measure
  effect already keys on those metrics — it invalidates itself for free.
- `readMetrics` gained `[wrapLines, tabWidth]` dependencies. It reads
  `tab-size` back off the computed style, and changing that resizes nothing,
  so the `ResizeObserver` would never have fired.
- `width: 100%` moved off the row's inline style into `.diff-row` so the wrap
  mode can decide it in CSS.
- **The unwrapped layout needed a second pass after QA — see below.** Rows are
  absolutely positioned, so they contribute nothing to their container's
  intrinsic width and the container cannot size itself to its widest row. It
  is now told: `widestRowColumns` walks the loaded lines with the same tab and
  Unicode column model `estimateLineRows` uses, and `<code>` gets a `minWidth`
  from that times the measured character advance. The split view gets one
  shared column width through a `--diff-split-column` custom property. The
  walk is skipped entirely when wrapping is on, where it would be wasted work.
- Turning syntax highlighting off skips the dynamic `import()` rather than
  importing and discarding — the chunk is not fetched at all.
- The stored value is one JSON object, validated field by field on read, so a
  hand-edited or older-shaped entry degrades per field instead of resetting
  everything.

Found and filed, not fixed here: every gap marker row overlaps the line under
it by 7.25px. It is unrelated to this task — it reproduces with every
preference at its default and identically in both wrap modes — and is now task
[063](063-gap-marker-row-overlap.md).

# Validation

- `pnpm run check` — recorded below.

**The diff viewer could not be verified through the app.** Opening a project
needs Tauri, so the Changes screen is unreachable in a plain browser, and the
virtualized views render nothing under jsdom because the `ResizeObserver` stub
in `testSetup.ts` never fires — the virtualizer never learns its viewport size.
Component tests therefore assert structure (classes, `tab-size`) on the
virtualized view and route every *content* assertion through the accessible
view, which is one plain `<pre>`.

To cover the rest, a throwaway Vite entry (`diff-harness.html` +
`src/diffHarness.tsx`) mounted `DiffResultView` with a generated 40-hunk diff
containing long lines, tab indentation and a whitespace-only pair. Deleted
after use; none of it is committed. Measured there at 700x800:

| | wrap on | wrap off |
| --- | --- | --- |
| `white-space` on `.diff-line__content` | `pre-wrap` | `pre` |
| long row width vs 694px viewport | 694px | 946px |
| `scrollWidth` | 694px | 946px |
| long row height | 40px (two visual rows) | 20px |

- **No gaps or overlaps between line rows** in either mode, at three scroll
  depths and across a wrap toggle: every consecutive pair of ordinary rows is
  contiguous to the pixel. The only discontinuity is after a gap marker, which
  is task 063 and predates this work.
- **Syntax highlighting**: 14 rendered tokens → 0 → 14 across a toggle, so it
  is removed rather than recoloured, and comes back.
- **Tab width**: a tab-indented line's content box is 151px at 8 and 110px
  at 2.
- **Ignore whitespace**: rendered deletions 5 → 0 and additions 10 → 5 as the
  whitespace-only pairs collapsed to context, with the virtualizer's total
  size dropping 8448px → 7648px.
- A first run of the whitespace check showed no effect; the harness fixture
  was wrong — the two lines carried different numbers, so they were a real
  change. Fixed the fixture, not the code.

Settings, in the app at 1280x840: the four sections fill 67 / 76 / 82 / 78%
with zero overflow, after nudging the dialog from 480px to 496px because
Reading overflowed by exactly 1px.

## Found by the user's QA pass, then fixed

Reported as "some options knock the text out of line, and you have to
maximize the window". Both halves of it were real, and both came from the
first unwrapped layout sizing rows against the viewport or against their own
content instead of against one shared geometry. Reproduced in the harness at
760px wide:

| | before | after |
| --- | --- | --- |
| unified, row widths (`scrollWidth` 1152px) | `754px` and `1138px` | `1152px`, one width |
| split, divider offset per row | `54 / 116 / 123 / 130px` | `1113px`, one offset |

The first meant short rows stopped painting their background partway across
the scrollable area, so scrolling sideways made the diff come apart — and
maximizing the window hid it by removing the need to scroll, which is exactly
the symptom described. The second put the side-by-side divider in a different
place on every row.

Re-verified afterwards across all four combinations of wrap on/off and tab
2/8, plus split: one row width per mode, `scrollWidth` matching, wrapping
still producing no horizontal scroll at all, and vertical contiguity
unchanged. The only remaining discontinuity is still the −7.25px after a gap
marker, which is task 063.

`lineColumns` and `widestRowColumns` are exported and unit-tested — tab stops,
wide glyphs, combining marks, and the split view taking one width for both
halves. The widths themselves cannot be asserted in jsdom, where the measured
character advance is 0.
