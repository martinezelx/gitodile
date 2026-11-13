---
id: 201
title: Navigate formatted Markdown changes and preview oversized excerpts
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

Keep previous/next change navigation in Markdown and show bounded changed
fragments when a document exceeds the full-preview limit.

# Scope

- Group adjacent removed/added blocks into navigation stops in document order.
- Reuse the already-loaded text diff for oversized documents: no extra full reads.
- Isolate complete hunks, disclose missing context/formatting and omitted changes.
- Bound excerpt source, lines, chunk count and comparison work; retain text fallback.
- Preserve inert links/images/HTML and suspend navigation effects while hidden.

# Acceptance criteria

- [x] Arrow controls navigate rendered changes and reset for another file/snapshot.
- [x] DESIGN.md opens as a partial Markdown preview with a clear notice.
- [x] Partial/truncated or excessive hunks never appear as a complete document.
- [x] Regression tests, desktop validation and `pnpm run check` pass.

# Decisions

The user requested this follow-up ahead of the existing queue. Complete preview
remains the preferred representation. Oversized documents use independent diff
fragments with explicitly approximate formatting; they cannot recover Markdown
definitions or syntax that starts outside the available context. Native payload
limits and transport are unchanged. No Git or remote mutation is added.

# Validation

- Focused comparison/renderer/ChangesPanel suites: 86 tests passed. The initial
  renderer run exposed test fixtures without a screen host; fixtures now use the
  real lifecycle contract. Production navigation suspends while hidden and does
  not scroll again merely because the screen becomes visible.
- Desktop validation: DESIGN.md opens as partial Markdown with its context and
  notice. Next change selects its sole added block, scrolls to it and highlights
  it; both end controls then disable and the spoken position reads 1 of 1.
- Aggregate `pnpm run check` is running with process-local
  `VITEST_MAX_WORKERS=2`; no persisted test settings have changed.
- The normal Tauri development command encountered an already-running Vite
  server on port 1420. Desktop validation used the running local server and
  GitOdile window; no development configuration was changed.
- Full-document desktop navigation exposed pre-existing false changes in
  multiline CRLF/LF paragraphs and code. Normalising the source before parsing
  fixes semantic AST keys as well as raw slices. The eight comparison tests,
  including that regression, passed. Desktop revalidation reduced work/README
  from four apparent groups to its one actual contiguous change group.
- Interrupted the earlier aggregate run to include the CRLF fix in a fresh
  `pnpm run check`; the final log is `.git/codex-markdown-navigation-final-check.log`.
- That run passed all 1,705 frontend tests, the build, Rust formatting and
  Clippy, but native test compilation stopped with Windows error 5 while the
  development executable was open. Closed only that workspace executable and
  restarted the aggregate gate; final log:
  `.git/codex-markdown-navigation-complete-check.log`.
- A further renderer regression ensures repeated footnotes in independent
  excerpts have unique DOM IDs and remain inert. All 16 renderer tests passed
  after that refinement; the final aggregate includes the new case.
- Final `VITEST_MAX_WORKERS=2 pnpm run check`: passed (exit 0), including
  documentation, architecture, TypeScript, all 153 frontend files / 1,706 tests,
  production build, Rust formatting, Clippy, 629 native library tests and one
  example test. One pre-existing native test remains ignored. The existing
  non-fatal Vite chunk-size warning remains enabled.

# Final review

Re-read the complete combined implementation from tasks 198–201 after the
user's final review request: native path/size/encoding and symlink handling,
session-validated transport, async invalidation, persistent reading preferences,
AST merge and references, excerpt limits, navigation lifecycle, accessibility,
inert rendering, translations, styles and tests. No known required correction
remains after the CRLF/LF and excerpt footnote-ID fixes. The user explicitly
authorised committing the completed implementation after successful checks.
