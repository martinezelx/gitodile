---
id: 218
title: Align diff navigation and fragment marks with the capsules
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

Carry task 217's capsule language into the rest of the text diff: an arrival
contour and changed fragments that match the capsules, and a gallery specimen
that no longer widens with long code.

# User outcome

The cue after a change-arrow jump and the exact-fragment marks read as part of
the same calm visual system as the gutter capsules.

# Context

After task 217 the maintainer asked for further improvements. Five were
compared before/after in an inline preview on 2026-11-02 and all were
approved. Two did not ship:

- A per-file added/removed proportion in the Changes list needs line counts
  the working-tree status does not carry yet (a Rust and IPC change), so it is
  left for its own task.
- A change map beside the scrollbar was implemented, first as an
  always-visible column and then, after the maintainer found it heavy and
  repetitive of the gutter, inside the scrollbar track, shown only with the
  thumb and only for changes outside the view. The maintainer was still not
  convinced and asked for it to be removed entirely; no code, style or design
  rule from it remains.

# Scope

- The change-arrow arrival contour is inset `--space-1` from the panel edges
  and rounded with `--radius-item` at the group's first and last line.
- Exact changed fragments use the 2px highlight radius.
- The style gallery's specimens never take their width from content.

# Out of scope

- The per-file proportion bar in the Changes list.
- Any scroll-side change map or overview ruler.

# Acceptance criteria

- [x] The arrival contour is rounded and inset; row geometry is unchanged.
- [x] Fragment marks use the 2px highlight radius allowed by the radius guard,
      rounded only at a fragment's real ends when it crosses syntax tokens.
- [x] The gallery's Markdown specimen fits its card with a long code line.
- [x] Running frontend checked in light and dark themes.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/changes/changes.css`
- `src/features/changes/DiffLineContent.tsx`
- `src/features/changes/DiffLineContent.test.tsx`
- `src/dev/gallery/gallery.css`
- `DESIGN.md`

# Dependencies

Task [217](217-diff-capsules-and-joined-replacements.md).

# Decisions

- The fragment radius reuses the 2px literal the radius guard already allows
  for highlights, rather than adding a new token.
- The contour stays a static outline with the existing attention lifetime; only
  its inset and corner shape change.

# Implementation notes

The arrival contour's `::after` keeps its row-by-row borders; the first and
last rows of the group carry the rounded corners. The gallery rule
`.gallery__specimen > * { min-width: 0; }` stops a specimen's content from
setting the card's width.

The pre-commit code review found that a changed fragment crossing syntax
tokens is rendered as one span per token, so a uniform radius notched it into
separately rounded pieces. `decorateDiffLine` now marks a piece that continues
before or after it (`diff-inline-change--continues-before`/`-after`), and only
the fragment's real ends are rounded; `DiffLineContent.test.tsx` covers it.

# Validation

- Running frontend: `/gallery.html` on the Vite server already serving the
  maintainer's `tauri dev` (port 1420), gitodile-dark and gitodile-light.
  "Jump to change" drew the contour with a 10px radius and 4px inset; fragment
  radius computed as 2px; the Markdown specimen fits its card (438 of 472px).
  No console errors.
- After removing the change map: no reference to it remains in `src/` or
  `DESIGN.md`. `git diff --check`, `pnpm run check:docs` and
  `pnpm run check:frontend` (architecture, typecheck, 1,928 frontend tests,
  build) passed.
- Final, after the pre-commit review fixes: `git diff --check` passed and
  `CARGO_TARGET_DIR=<scratch> pnpm run check` (a scratch target because
  `tauri dev` held the debug executable) exited 0 in one invocation — 1,929
  frontend tests, build, fmt, Clippy, 694 Rust unit and 2 credential-helper
  integration tests passed, 1 existing ignored.
