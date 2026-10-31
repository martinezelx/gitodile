---
id: 198
title: Read Markdown documents in Changes
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

Offer a read-only Markdown preview in Changes, alongside the existing View modes.

# Scope

- `.md` and `.markdown` files, case insensitive, showing their complete current working copy.
- CommonMark and GFM tables, task lists, fenced code, quotes and emphasis.
- Bounded native reads through the Changes port, with session and path validation.
- English/Spanish copy, theme-aware typography and loading/empty/error/oversized states.
- Keep the existing diff modes available. No preview for deleted or conflicted files.

# Out of scope

Editing, rendered before/after comparisons, History previews, MDX execution,
embedded HTML, local image resolution and remote resource loading.

Rendered comparison is implemented separately in the user's follow-up
[199](199-rendered-markdown-changes.md); the scope and validation below
record the original reading-only iteration.

# Acceptance criteria

- [x] Markdown preview is offered only for eligible selected files and reads only on demand.
- [x] Full content is rendered safely, including text outside diff hunks.
- [x] Switching files/projects and repository invalidation cannot display stale content.
- [x] Hidden views suspend effects and revisiting does not trigger another read.
- [x] Keyboard controls and normal, empty, error and size-limit states are covered.
- [x] Native path/encoding/size safety is tested in temporary repositories.
- [x] `pnpm run check` is run and its outcome recorded.

# Decisions

The user explicitly requested implementing this task ahead of the existing queue.
Continue on the existing `release/0.4.1` branch. The operation is read-only and
has no Git mutation or remote access. Preview means the current file on disk,
including staged and unstaged edits, rather than only the changed lines.

The concrete native-boundary problem is reading an entire current document
without trusting a repository-relative path or allocating an unbounded payload.
Studied the path verification and symlink handling in GitButler's
[`but-core` worktree diff](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/but-core/src/diff/worktree.rs).
The reusable principle is to verify filesystem paths before reading repository
content. This implementation independently follows GitOdile's existing
canonical-containment policy and bounds the actual file read; no source was copied.

# Implementation notes

- Added the session-validated read-only command, policy inventory and IPC contract.
- Rejects non-Markdown names, paths outside the canonical root, directories,
  binary/invalid UTF-8 content and oversized files. UTF-8 BOM and CRLF are supported.
- `react-markdown` and `remark-gfm` (MIT) supply a standards-based parser; raw
  HTML is skipped, every URL is removed, links become inert spans and images
  become text placeholders. No HTML injection or resource-fetching plugins.
- The one selected-document promise survives visibility changes and diff/preview
  toggles; a new diff snapshot or project epoch invalidates it. Stale replies
  cannot replace the current document. Unchanged document parsing is memoized.
- Changes owns the preview mode, leaving History's shared picker and diff modes
  unchanged. Find/hunk controls disappear only while previewing Markdown.
- The native application was rebuilt with the documented Tauri dev command,
  reusing the already running Vite server through a temporary `.git/` config.
  Computer Use verified the complete README in dark/light themes, switching to
  TypeScript's normal diff and returning to Markdown. Restored the original dark
  theme and cleared the temporary file filter. Leave the dev app open for review.

# Validation

- Focused frontend run: 89 tests passed (preview renderer/request lifecycle,
  ChangesPanel integration and style composition).
- `pnpm run check`: passed (exit 0). Documentation, architecture, TypeScript,
  all 151 frontend test files / 1,676 tests, production build, Rust formatting,
  Clippy with warnings denied, 626 library Rust tests and one example test passed;
  one pre-existing native test remains ignored. Vite reports its non-fatal
  entry-chunk size warning (526.39 kB; vendor 458.36 kB).
- Earlier runs caught task queue duplication, style-token violations and the
  native test's explicit command inventory; these were corrected. One Rust run
  was blocked by Windows locking the running app executable. The subsequent
  run was stopped after its inventory failure had been fixed; the full final
  gate ran successfully with the app closed.
- The symlink assertion follows the existing test convention: Windows can skip
  creating a symlink when the OS does not grant that privilege.
- Manual Windows validation used the Computer Use skill.
  Error/empty/oversized states and unsafe markup are covered by automated tests.
