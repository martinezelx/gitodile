---
id: 215
title: Show exact text changes, changed spacing and comparison context
status: done
priority: normal
type: feature
areas:
  - frontend
  - changes
  - history
created: 2026-11-02
completed: 2026-11-02
parent:
queue:
---

# Goal

Implement the four approved diff improvements and review them in GitOdile.

# User outcome

Find the exact edited fragment, understand spacing edits, know which versions
the columns show, and locate the change reached with the navigation arrows.

# Context

The maintainer approved the interactive four-improvement comparison on
2026-11-02 after task 214. Match that preview and the existing text/Markdown
diffs under DESIGN.md's diff, tint, accessibility and motion rules.

# Scope

- Task 214's solid/dashed bars, soft row tints and normal syntax ink in both
  Changes and History, preserving gutters, line numbers and accessible labels.
- Bounded paired-line detail shared by unified and split rendering.
- Changed-space/tab glyphs that preserve source text and syntax/search marks.
- Persistent Before/After column labels with truthful comparison context.
- Temporary neutral outline after explicit change navigation.
- English/Spanish copy, gallery specimens and real desktop review.

# Out of scope

Git mutations, new preferences, binary/image changes and a new conflict editor.

# Acceptance criteria

- [x] Exact changed fragments and affected whitespace show in both views.
- [x] Copy, syntax/search, accessible text, whitespace filtering and virtualization survive.
- [x] Split headings identify the actual comparison in Changes and History.
- [x] Navigation cues explicit jumps without scrolling after background updates.
- [x] Light/dark desktop review and `pnpm run check` complete.

# Relevant files

- `src/features/changes/DiffResultView.tsx`
- `src/features/changes/diffDetails.ts`
- `src/features/history/HistoryPanel.tsx`
- `DESIGN.md`

# Dependencies

Task [214](214-text-diff-bars-and-tint.md).

# Decisions

Presentation-only, read-only work on the existing release/0.5.0 branch. Preserve
the ongoing task 214 changes. No new branches, dependencies or native commands.
Bound pair count, line size, edit distance and total comparison work; retain
whole-row marks when detail is unavailable. Logical CSS and original source
whitespace preserve cross-platform rendering and copy behavior.

# Implementation notes

`diffDetails.ts` pairs consecutive removed/added runs and uses the existing
`diff` package with a 256-pair, 4,096-character-per-pair, 65,536-character-total,
128-edit and 20ms aggregate budget (4ms per comparison), plus a shared limit
of 512 detailed source lines. Unpaired non-whitespace, unrelated
or excessive edits retain their line marks. Standalone spacing-only additions
and deletions show their source whitespace without inventing a counterpart. Detail is memoized off scrolling.
`DiffLineContent.tsx` decorates already-tokenized lines, retaining complete
string/comment tokens and nested search marks. Changed whitespace stays raw;
CSS adds nonselectable glyphs with an empty speech alternative. At most 64
spacing glyphs decorate each source line across all syntax/search fragments;
the rest remains original text with its changed tint.

Column headings stay outside the scrolling pre and do not change its row
geometry. History supplies its actual `comparisonBase` and selected short ID,
including the empty-project base. Navigation uses the existing explicit token,
cleans up its timer and file state, and draws a static contour at the existing
attention lifetime. No new motion or settings.

The existing ChangesPanel tests now match complete source lines across inline
spans; the navigation test additionally checks arrival and clearing on a file
switch. New pure tests cover pairing boundaries, whitespace, Unicode and bounds;
a small component test verifies source preservation and syntax/search nesting.

# Validation

- Focused renderer/detail/style suite: 4 files, 66 tests passed.
- `pnpm vitest run src/features/changes/ChangesPanel.test.tsx`: 64 passed after
  adapting the four assertions that expected an unsplit text node.
- Desktop validation through Computer Use in the real Tauri window on the
  current project: unified and split views, explicit next-change jumps,
  temporary contours, light/dark themes and fixed column headings while scrolling.
  History comparison visibly names `69545e71` before and `a9d97d087c` after.
- `pnpm run tauri dev` met an existing server on 1420; the attempted reuse
  configuration then met the running executable's Windows lock. Validation
  used the running Tauri app with the existing Vite server's updated frontend.
  Windows also blocked Cargo while those windows held the executable open;
  they were closed temporarily for the final aggregate gate. After the gate,
  `pnpm run dev` and Tauri dev with the existing-server override rebuilt and
  launched successfully (28.86s). One desktop window is left open on Changes
  for the maintainer's review.
- The maintainer approved all four improvements in the running app on
  2026-11-02. Temporary screenshots from tasks 214/215 were removed at their
  request before committing; no preview assets are shipped.
- `git diff --check`: passed.
- `pnpm run check`: passed (exit 0). 1,913 frontend tests; build; Rust format,
  Clippy, 693 unit tests and 2 integration tests passed. 1 existing ignored test.

# Final code review — 2026-11-02

Reviewed the complete task 214/215 diff, the paired-line algorithm, DOM/source
preservation, syntax/search composition, comparison identity, navigation
lifecycle, virtualization geometry, translated copy and archive links.

Fixed two performance defects found before commit:

- A changed line of 4,096 spaces or tabs created 4,096 decorative elements,
  bypassing row virtualization's protection. Share a 64-glyph budget across
  the whole source line, retaining all remaining source text. Regression tests
  cover both spaces and tabs split across token nodes, checking source and DOM size.
- Standalone spacing rows and paired replacements did not share their result
  limit, allowing more than 512 detailed lines. Enforce the shared limit before
  inserting a pair and stop scanning once full. Extend the pure behavior tests
  with mixed standalone/paired edits.

No Git mutations, IPC changes, dependencies or additional settings were added.
Both task records stay in `work/done/0.5.0/` with completed metadata and index
entries. Both deliverables and the review fixes are committed together.


# Final verification after review

- `pnpm run check`: passed, exit 0, on 2026-11-02 after the review fixes.
  Documentation, architecture, TypeScript, all 165 frontend files / 1,916 tests,
  production build, Rust formatting, Clippy and all Rust targets passed.
  Rust: 693 unit tests and 2 credential-helper integration tests passed;
  1 existing ignored test.
- Focused renderer/detail suite: 3 files / 32 tests passed. The mixed-budget
  regression also passed alone (8 domain tests), with a fixed test clock so
  machine speed cannot conceal a broken entry limit.
- `git diff --check`: passed. Archive metadata and links verified after removing
  temporary visual assets; none are included in the commit.
