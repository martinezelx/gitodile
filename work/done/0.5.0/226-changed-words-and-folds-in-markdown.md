---
id: 226
title: Mark changed words, fold unchanged runs and align the two viewers
status: done
priority: normal
type: feature
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

The Markdown preview opens on what changed and shows exactly what changed, and
the text diff and the preview behave alike where they do the same job.

# User outcome

A one-word edit in a long paragraph shows that word. A long document opens on its
changes, with their section headings, and the rest is one click away. The arrows
leave the same mark in both viewers.

# Context

The maintainer chose these from a list of improvements on 2026-11-03, then asked
whether the two viewers were aligned. They were not: the first folds were a new
dashed divider although the diff already had a gap marker, a miss of the "start
from the closest equivalent" rule, and the diff's arrows drew a contour that
vanished after 2.4 seconds where the preview kept a tint.

# Scope

- `markChangedWords`, on the budget of the text diff's exact fragments.
- `foldUnchanged` and `applyFolds`, with a row per fold and "Show all".
- The preview's folds drawn with `.diff-hunk__marker`.
- `.diff-row--current` replacing the arrival contour in text diffs.

# Out of scope

- Word marks in code blocks, which stay marked whole.
- Compensating the scroll when a fold above the view opens.
- Keeping folds open across a re-read of the document: a refresh remounts the
  view, and block positions may no longer mean the same blocks.
- Marking the first change before the arrows are used.

# Acceptance criteria

- [x] Paragraphs, headings, table cells and one-paragraph list items mark what
      differs, through emphasis and links, and inline code whole.
- [x] Words split only by spaces are one mark; spacing alone marks nothing.
- [x] Blocks sharing under 40% of their text stay marked whole.
- [x] A fold leaves a block of context each side and the section's heading, and
      never holds a change.
- [x] A run shorter than four blocks does not fold.
- [x] A changed footnote keeps the document unfolded.
- [x] Opening a fold keeps focus in the document and keeps the current change.
- [x] A text diff's current change stays until the arrows or the file move.
- [x] `DESIGN.md` no longer defers word-level changes.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/changes/markdownChanges.ts`
- `src/features/changes/markdownPreview.tsx`
- `src/features/changes/DiffResultView.tsx`
- `src/features/changes/changes.css`
- `DESIGN.md`

# Dependencies

[224](224-compact-markdown-preview.md).

# Decisions

- Two blocks with marked words (1A) over one merged block with strikethrough: it
  keeps the capsule, and a struck word reads like Markdown's own `~~`.
- Folded by default (2A) over a "Changes only" switch: the toolbar is full, and
  the reader came for the change.
- 40% is a judgement, not a measure, and sits in `MIN_SHARED_TEXT`. The text diff
  only asks for one shared word, which is right for a line and marks too much in
  a paragraph.
- The persistent mark replaces the contour. It also says where you are after the
  2.4 seconds, and it is one rule for both viewers.

# Implementation notes

- A word is an `emphasis` node with `hName: "span"`: typed mdast with no custom
  node. A fold is a `paragraph` with `hName: "button"`, safe because raw HTML is
  skipped, so no repository content can produce one.
- Word marks run after the merge on their own budget, so they can never turn a
  comparison into a refusal. `changedWordRanges` and `WORD_DIFF_LIMITS` are shared
  with `buildDiffDetails`, so both viewers measure a changed word the same way.
- `currentHunk` also clears when `hunks` changes: an index means another change
  once the file is read again, which a mark that stays would otherwise show.
- Opening a fold re-renders over the same elements, so `MarkdownPreviewView`
  re-runs its stop effect, whose cleanup clears the old marks first.

# Validation

- `markdownChanges.test.ts`: word cases, rewrites, spacing, folding rules.
- `markdownPreview.test.tsx`: a fold, "Show all", focus.
- `ChangesPanel.test.tsx`: the current change and its clearing on a file switch.
- Browser harness, GitOdile Light and Dark: both viewers side by side, a fold
  opened by click. Split view was not looked at; it shares the same variables.
- Clearing the mark on a re-read has no test: the virtualized rows do not render
  under the `DiffResultView` tests, and it rests on the effect's dependency.
