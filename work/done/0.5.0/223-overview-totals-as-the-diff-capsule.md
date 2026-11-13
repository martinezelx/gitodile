---
id: 223
title: Draw Overview's line totals as the diff's capsule
status: done
priority: normal
type: design
areas:
  - frontend
  - design
  - docs
created: 2026-11-03
completed: 2026-11-04
parent:
queue:
---

# Goal

Overview's line totals and the text diff speak one capsule language, and a
capsule reads as one shape from end to end.

# User outcome

The bar beside `+N −N` in "What you'll save" looks like the marks in Changes: a
filled added share joined to an outlined removed share. In a diff, a run of
changed lines no longer shows faint seams between its rows.

# Context

On 2026-11-03 the maintainer asked for Overview's bar to match Changes in colour
and form. It was a 2px gradient at 65% opacity, a mark of its own. Looking at the
result, the maintainer then noticed lines across the capsules in Changes and
asked whether they were a decision. They were not: `DESIGN.md` asks for one
capsule per run, but each line paints its own piece.

# Scope

- `.overview-detail__bar` as the capsule on its side, joined when both sides
  exist, one capsule when only one does, drawn in native borders under forced
  colours.
- `--diff-bar-width`, `--diff-bar-outline` and `--diff-bar-middle` moved to
  `tokens.css`, so Overview and Changes share them.
- A capsule piece that does not open its run reaches 1px into the one before.

# Out of scope

- The counts themselves, which stay ink so the card does not open on red.

# Acceptance criteria

- [x] The bar is 5px at full opacity, filled for the added share and outlined
      for the removed share.
- [x] With both sides they join through the OKLCH midpoint, with no cap at the
      join; with one side it is a single capsule; with neither no bar is drawn.
- [x] The diff still reads the three tokens after the move.
- [x] A piece that opens a run keeps its cap; every other piece overlaps by 1px.
- [x] `DESIGN.md` describes the bar.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/overview/OverviewDetail.tsx`
- `src/features/overview/overview.css`
- `src/features/changes/changes.css`
- `src/styles/tokens.css`
- `DESIGN.md`

# Dependencies

Builds on [217](217-diff-capsules-and-joined-replacements.md).

# Decisions

- The joined capsule, among three mock-ups: two separate capsules and a capsule
  filled on both sides were the alternatives. Only the joined one says what the
  diff says.
- The overlap goes upward. Rows are absolutely positioned and paint in order, so
  a piece reaching up lies over the edge of the one before; reaching down it
  would be painted under the next row's tint.

# Implementation notes

- The seam is antialiasing: two boxes meeting on a fractional pixel each cover
  only part of it. Rows sit at the virtualizer's measured `translateY`.
- The rule also reaches rendered Markdown, where only an addition joined to its
  removal is affected; every other block there is a closed capsule.
- The empty side is `display: none`, not a zero width: under forced colours a box
  cannot shrink below its borders, and it left a stub.

# Validation

- Browser harness on the running Vite server, GitOdile Light and Dark: five
  shares including 0 and 100%.
- Computed margins in a harness: `-1px` on continuing pieces, `4px` on capped
  ones. The built-in browser's captures are too coarse to show the seam itself,
  so its disappearance rests on the maintainer's eye in the running app.
