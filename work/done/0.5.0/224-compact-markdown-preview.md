---
id: 224
title: Make the Markdown preview compact and join its blocks
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

The Markdown preview gives its room to the document: one quiet line of notice,
tighter spacing, and changed blocks that read as one piece.

# User outcome

A changed code block fills with its tint and joins its replacement, instead of
a stripe behind each line on a grey card. Two or three lines of explanation
become one, with the detail behind an info mark. The change the arrows stand on
is marked in the view's own language, headings sit at the app's scale, and an
image that is not loaded looks like an object.

# Context

On 2026-11-03 the maintainer sent a capture of `DESIGN.md` in the partial
preview: too much space, too much informative text, and red and green rows that
did not integrate. The last of these was a bug. `mdast-util-to-hast` applies a
code node's properties to the inner `<code>`, so the mark never reached the
`<pre>` and the rules written for it never matched.

# Scope

- `rehypeMarkCodeBlocks` lifts the change class and stop onto the `<pre>`.
- `MarkdownNotice`: one line, the rest in a keyboard-reachable tooltip.
- `Line 801` as a small divider in the partial view.
- Spacing: document padding, code blocks, fragment gaps.
- A marked block takes `--radius-item` and gives up its corners at a join.
- The current change deepens to `--tint-halo` with a capsule of
  `--diff-bar-width-current`, over its whole run.
- Headings one step down the scale; an unloaded image as a neutral capsule.

# Out of scope

- Word-level marks and folding, in
  [226](226-changed-words-and-folds-in-markdown.md).
- History, in [225](225-markdown-preview-in-history.md).

# Acceptance criteria

- [x] No element below a `<pre>` carries a change class.
- [x] A removed code block followed by its addition joins as other blocks do.
- [x] The preview shows one line above the document in both its modes.
- [x] Deletion and omitted changes stay visible on that line.
- [x] The detail is reachable by keyboard.
- [x] A stop's whole run is marked, not only its first block.
- [x] Forced colours keep an outline on the current change.
- [x] `DESIGN.md` describes all of it.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/changes/markdownChanges.ts`
- `src/features/changes/markdownPreview.tsx`
- `src/features/changes/changes.css`
- `src/features/changes/translations.*.ts`
- `src/styles/tokens.css`
- `DESIGN.md`

# Dependencies

Builds on [212](212-status-bar-avatar-and-markdown-change-signs.md) and
[217](217-diff-capsules-and-joined-replacements.md).

# Decisions

- Option A of three mock-ups: one quiet line and a reading column. Putting the
  notice in every fragment repeated it, and edge-to-edge blocks made prose lines
  too long on a wide window.
- "Partial" stays in sight. `DESIGN.md` requires it, because omitted context can
  change formatting. Only its explanation moved to the tooltip.
- The source line of the old side is gone from the divider. The current line
  answers where a fragment is, and a hunk with no new side (a deleted file) gives
  the old one rather than `Line 0`.

# Implementation notes

- `changesMarkdownCounts` became `−3 +5 lines`; the block-level granularity moved
  to the tooltip as `changesMarkdownBlocks`.
- `--diff-added-fill`, `--diff-removed-fill` and `--diff-fill-middle` are
  redefined on the current block, so plain and joined blocks deepen alike.

# Validation

- `markdownPreview.test.tsx` asserts the mark on the `<pre>`, the keyboard stop
  and the marked run.
- Browser harness with the real preview, GitOdile Light and Dark, partial and
  complete documents, headings, image chip and current change.
- The tooltip was read from its attribute, not seen: a harness does not mount
  the app's tooltip. `.app-tooltip` wraps at 260px.
