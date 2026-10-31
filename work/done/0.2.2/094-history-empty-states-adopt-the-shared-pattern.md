---
id: 094
title: Give History's empty and error states the shared glyph tile
status: done
priority: normal
type: improvement
areas:
  - frontend
created: 2026-08-30
completed: 2026-08-30
parent:
queue:
---

# Goal

History's "no saved versions" and "history unavailable" states render the
shared empty-state pattern in full — a glyph in a bordered, shadowed circle and
an actions row — instead of a bare 24px icon floating above the headline.

# User outcome

The two states someone actually meets on a new or unreadable project look like
the rest of GitOdile rather than like an unfinished panel, and an error is
marked as one by colour instead of only by its wording.

# Context

`DESIGN.md` § Core screens prescribes one pattern for every screen's empty,
loading and error states, with `.empty-state__icon` as its glyph tile and
`--status-danger` swapped in for errors. History rendered `<CircleAlert />` and
`<GitCommitHorizontal />` directly, so it got the block and the typography but
not the tile — and there was no error variant in the stylesheet at all.

Task 091 removed the tile from the welcome screen, which was the pattern's only
caller. Adopting it here is what keeps the shared vocabulary in use rather than
documented and dead.

# Scope

- Wrap both History icons in `.empty-state__icon`.
- Add the pattern's error variant to `shared/ui/primitives.css`.
- Put History's retry button in `.empty-state__actions`.

# Out of scope

- The loading state, which correctly uses `LoadingBar` rather than a glyph.
- Any change to History's copy, layout or behaviour.

# Acceptance criteria

- [x] Both states render the tile with the pattern's border, fill and shadow.
- [x] The error state's tile carries `--status-danger` in both themes.
- [x] No string, role, or heading level changes.

# Relevant files

- `src/features/history/HistoryPanel.tsx`
- `src/shared/ui/primitives.css`

# Dependencies

None.

# Decisions

- **The variant rule lives with the pattern, not with History.** `.empty-state`
  is owned by `shared/ui/primitives.css`; an error tint defined in
  `history.css` would be the second screen's private copy of a shared state the
  moment Recovery or Conflicts needed it.
- **Border and glyph take the danger colour, the fill does not.** A filled red
  tile reads as a status badge; the pattern's tile is a glyph on a neutral
  surface, and swapping only the colour keeps the two states the same shape.

# Implementation notes

`--status-danger` is per-theme (#b3261e light, #ff6b5b dark), so the tile stays
legible on both `--surface-raised` values without a second token.

# Validation

Both states need a project open, which the browser preview cannot do, so they
were verified by reading the resulting markup and the rules it matches rather
than on screen; the tile's own geometry and contrast are unchanged from the
pattern that shipped with task 091.

```bash
pnpm run check
```

Passed on 2026-08-30: documentation over 148 Markdown files and 115 task ids,
frontend architecture, TypeScript, 491 frontend tests over 60 files, the Vite
build, `cargo fmt --check`, Clippy with `-D warnings`, and the Rust test
suites.
