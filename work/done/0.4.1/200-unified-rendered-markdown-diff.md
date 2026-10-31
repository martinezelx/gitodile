---
id: 200
title: Read rendered Markdown changes in one unified document
status: done
priority: normal
type: feature
areas:
  - frontend
  - changes
created: 2026-10-25
completed: 2026-10-25
parent:
queue:
---

# Goal

Replace task 199's two formatted versions with one Markdown document containing
unchanged context once and removed/added blocks interleaved at their position.

# Scope

- Preserve formatting and the existing red/green and minus/plus markers.
- Merge compatible lists, blockquotes and tables without duplicating unchanged
  items/rows; preserve numbering, reference definitions and footnotes.
- Retain native reads, safety, request lifecycle, limits and honest empty states.
- No Git mutation or remote behavior changes; review native read correctness.
- Default supported Markdown to formatted changes, persist explicit Markdown
  choices separately from code, and fall back to text with an explanation.
- Review the complete implementation from tasks 198–200 and prepare for commit.

# Acceptance criteria

- [x] One document and one reading scroll area, without before/after panes.
- [x] Unchanged context appears once; replacements show removed then added blocks.
- [x] Lists/tables/code/references/footnotes retain valid formatting and safety.
- [x] Unit/component tests, real desktop validation and `pnpm run check` pass.
- [x] Markdown defaults, independent persistence, fallback and retry are tested.

# Decisions

The user requested this refinement ahead of the existing queue. Merge parsed
Markdown trees instead of patching source snippets, which can lose reference
definitions or break a table/list/fence. Keep block-level change granularity.

# Validation

- Focused frontend suites: 100 tests passed (comparison, renderer, ChangesPanel,
  style composition). TypeScript and the documentation check passed.
- The first aggregate run found a strict type issue in ordered-list attributes.
  An explicit Markdown list type and string HTML `value` fixed it; the standalone
  `pnpm run typecheck` then passed (exit 0).
- Computer Use confirmed the existing README in one full-width document, with
  the removed heading followed by the added heading and formatted new section.
- `pnpm run check`: passed (exit 0), with the development app closed to avoid
  Windows executable locks. That original unified-view pass had no native changes;
  the final review below additionally corrects native symlink handling.
- The aggregate run passed (1,687 frontend tests, 628 native library tests and
  one example test; one existing native test ignored). A later keyboard-focus
  refinement adds one Tab stop for the unified article. Its frontend follow-up,
  run concurrently with the native suite, encountered two timing failures in
  App Settings tests (one timeout and one delayed watcher-refresh expectation).
  Frontend was rechecked after the native suite finished; no unrelated app
  behavior or test timeouts have been changed.
- The unconstrained frontend-only rerun passed those Settings cases but timed
  out in an unrelated Console shortcut test. The final frontend was rechecked with
  process-local `VITEST_MAX_WORKERS=2`; this changes neither app behavior nor test
  timeouts and is not a persisted repository setting.
- Final `VITEST_MAX_WORKERS=2 pnpm run check:frontend`: passed (exit 0), including
  architecture, TypeScript, all 152 files / 1,687 tests, and the production build.
  The existing non-fatal Vite chunk-size warning remains enabled.
- A direct Node smoke check confirmed that CRLF-only differences inside a
  fenced code block do not create rendered additions/deletions.

- Final desktop keyboard check: Tab reaches the document; Page Down scrolls the
  unified content and Ctrl+Home returns to its start. The development app remains
  open on the README preview for user review.
- Final default/preference review: desktop validation confirmed automatic Markdown,
  switching to Split, retaining Split in another Markdown document and after a
  reload, and switching back to Markdown. Closed the development application after
  validation; removed the temporary README content for commit preparation.
- Final `VITEST_MAX_WORKERS=2 pnpm run check`: passed (exit 0). Documentation,
  architecture, TypeScript, all 153 frontend files / 1,698 tests, production build,
  Rust formatting, Clippy, 629 native library tests and one example test passed;
  one pre-existing native test remains ignored. The existing non-fatal Vite
  chunk-size warning remains. Log: `.git/codex-markdown-default-check.log`.
- Full implementation review is complete. Changes are staged for a single
  commit; no commit or remote mutation has been made.

# Implementation notes

- Final follow-up: Markdown is the default for supported documents. Explicit
  Unified/Split/Accessible choices persist separately from code-file modes;
  storage failures retain the session choice. Read, size and comparison failures
  show the text diff without overwriting the preference; View can retry Markdown.
- Reviewed the full native read, IPC/policy contract, typed frontend port,
  async invalidation, renderer, AST merge, translations and styles. Regression
  coverage includes independent preferences across remounts, unavailable storage,
  all three fallback reasons and retry. Removed the temporary README demo before
  commit preparation, preserving the capability documentation.
- Corrected a frontend/native extension mismatch: a dotfile named exactly `.md`
  has no extension in Rust and must not offer a preview; `.notes.md` remains
  supported. Added regression coverage.
- Corrected symlink semantics: refuse both a working-tree symlink and a saved
  mode-120000 blob instead of comparing dereferenced content against a stored
  destination path. Tests cover saved blobs on every platform and actual links
  when the OS permits creating them. Existing text fallback handles the refusal.

- Parse both complete documents with the same CommonMark/GFM parser used by
  the renderer, then merge their trees. Unchanged blocks come from the current
  document once. Compatible containers merge children, including nested lists,
  while ordered items preserve their original/current numbers.
- Resolve reference links/images within their own full document. Namespace
  footnotes per version; include their definitions when deciding whether the
  referencing block is unchanged. Retain suppression of HTML, images and URLs.
- Reuse the bounded source-line comparison for the summary. AST preparation has
  a 150 ms per-version budget and an 80-level traversal bound; merging has a
  shared 60 ms / 4,000-edit budget. Complex input is refused explicitly.
- Removed the two panes, their extra scrolling regions, headings and obsolete
  styles/translations. Change markers remain minus/red and plus/green. Native
  reads, empty/deleted/oversized states and request lifecycle are retained.
