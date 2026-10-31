---
id: 199
title: Show additions and deletions in rendered Markdown
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

Extend task 198's Markdown view to show what changed, with formatted before/after
documents and explicit red removed / green added block highlights.

# Scope

The user subsequently requested replacing the two panes with a unified document;
that refinement is tracked in [200](200-unified-rendered-markdown-diff.md).
The notes below record this earlier comparison iteration.

- Compare the last saved version with the complete current file, including staged
  and unstaged edits, renamed paths, new files and deleted files.
- Preserve document structure and label changes in text as well as colour.
- Retain bounded local reads, inactive links/images, hidden-screen suspension
  and stale-request protection. Refuse partial or excessively costly comparisons.

# Acceptance criteria

- [x] Changed headings, paragraphs, lists, tables and code show removed/added blocks.
- [x] New, deleted, empty, unchanged and oversized documents have honest states.
- [x] Backend tests cover saved content, staged/unstaged changes, renames and deletions.
- [x] Frontend tests cover formatting-only changes, safety and bounded comparison work.
- [x] Validate the existing README example in the running app and run `pnpm run check`.

# Decisions

The user requested this follow-up ahead of the active queue. Compare full versions
instead of rendering isolated diff hunks, which can break tables, lists and code
fences. Highlight source-line changes at Markdown block boundaries; word-level
highlighting and History remain out of scope. No Git mutations or remote calls.

# Validation

- Focused frontend run: 95 tests passed across the comparison, preview,
  ChangesPanel and style-composition suites. TypeScript passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features read_file_markdown`: 5 passed.
- Computer Use confirmed the README's removed heading in red and its changed
  heading/new formatted section in green, with working tables, in dark/light
  themes. Restored the original dark theme. Both versions scroll independently
  and remain keyboard reachable; their labels stay visible while scrolling.
- `pnpm run check`: passed (exit 0), with the app closed to avoid Windows file
  locks. Documentation, architecture, TypeScript, 152 frontend test files /
  1,682 tests, production build, Rust formatting, Clippy, 628 library Rust tests
  and one example test passed. One existing native test remains ignored. Vite's
  non-fatal chunk-size warning remains enabled. The dev app is reopened for review.

# Implementation notes

- Extended the existing read command with explicit nullable current/saved
  documents. Git status supplies a renamed file's original path, then a pinned
  HEAD tree and bounded blob reads supply the saved version. Literal pathspecs
  handle spaces/brackets. Failed Git reads never masquerade as missing content.
- `diff` (BSD-3-Clause) calculates bounded line changes (60 ms / 4,000 edits).
  A remark AST annotation adds only trusted classes to complete affected blocks;
  both versions retain their full parsing context. A refused comparison is
  disclosed rather than shown as unchanged. CRLF and a final-newline difference
  do not create false rendered highlights.
- Retained HTML/URL suppression, source-size limits, request identity and hidden
  screen suspension from task 198. Highlighting is block-level, not word-level.
