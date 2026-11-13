---
id: 214
title: Mark all text diffs by bar and tint
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

Extend task 212's Markdown change marks to unified and split text diffs.

# User outcome

Read code changes with less repeated punctuation and the same visual language
as documents, while distinguishing additions from removals without colour alone.

# Context

The maintainer approved the interactive Actual/Propuesta preview on 2026-11-02
and requested implementation on the current release/0.5.0 branch.

# Scope

- Replace visual diff signs with solid added and dashed removed 3px bars.
- Retain tints, syntax colours, line numbers and accessible state labels.
- Use the shared Changes renderer so History receives the same treatment.
- Keep accessible plain-text patch signs, virtualized rows and existing gutters.

# Out of scope

Git operations, new settings, binary/image comparisons and conflict resolution.

# Acceptance criteria

- [x] Unified and split diffs show bar and tint without added/removed signs.
- [x] Empty lines and wrapped lines retain visible, distinguishable markers.
- [x] Syntax highlighting, screen-reader labels and plain-text diff survive.
- [x] Running frontend checked in light and dark themes beside Markdown.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/changes/DiffResultView.tsx`
- `src/features/changes/changes.css`
- `DESIGN.md`
- `README.md`

# Dependencies

Task [212](212-status-bar-avatar-and-markdown-change-signs.md).

# Decisions

The existing Markdown preview and DESIGN.md's diff/accessibility rules set the
look. Keep the existing 16px/14px gutters to preserve wrapping estimates and
virtualizer measurements. This is presentation-only on Windows, macOS and Linux;
no process, filesystem or native boundary changes. CSS logical borders follow
the existing document marker. No new dependencies or visual-only unit tests.

# Implementation notes

Visual markers are decorative; the existing localized hidden state labels stay.
Default code ink replaces whole-line red/green text, retaining token colours.
The four detail/orientation follow-ups and final review are recorded in
[215](215-text-diff-detail-and-orientation.md); both tasks ship in one focused commit.

# Validation

- Running frontend: `pnpm run dev --host 127.0.0.1`, `/gallery.html`.
  Checked the real virtualized unified/split renderer beside Markdown in
  gitodile-light and gitodile-dark at desktop width, plus the narrow layout.
  Empty additions/deletions, wrapped text and actual + / - code operators
  retain their markers and alignment. Accessibility tree retains Added/Removed.
  Read-only DOM inspection confirms dashed/solid pseudo-elements with nonzero
  height on empty and wrapped lines.
- The maintainer approved the running result on 2026-11-02. Temporary captures
  were removed at their request before committing; no visual assets are shipped.
- `git diff --check`: passed.
- `pnpm run check`: frontend 1,904 tests passed; build, formatting and Clippy
  passed. Rust: 693 unit tests and 2 credential-helper integration tests passed,
  1 existing ignored test. `pnpm run check` exited 0.
