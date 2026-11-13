---
id: 212
title: Fit the status bar's project initials and mark Markdown changes by bar and tint
status: done
priority: normal
type: bug
areas:
  - frontend
  - changes
created: 2026-10-29
completed: 2026-10-29
parent:
queue:
---

# Goal

The project chip in the status bar holds two initials with room around them,
and the Markdown change view marks a changed block by its bar and tint alone,
with the text a little off the bar.

# User outcome

The status bar's project chip reads as a tidy badge whatever the project's
initials ("TW", "MW"), and a rendered Markdown change reads as the document
itself: a coloured bar and tint, then the text, with no diff signs in the prose.

# Context

The user reported both on 2026-10-29, with a screenshot of the status bar
showing `tienda-web`'s "TW" filling its chip edge to edge.

- `.status-bar__avatar` was 18px with 10px bold initials and wide tracking.
  Measured in the style gallery, "MW" ran to 20px and spilled past the chip.
  `--text-micro` (10px) is the type floor (DESIGN.md § Typography), so the
  chip has to grow rather than the type shrink.
- In the Markdown preview the sign was an inline `::before` with no padding
  on the block, so it touched the 3px bar, and wrapped lines started under it.

# Scope

- Status bar project chip: 26px, so its initials take the same share of the
  chip as Overview's (about 62% of its width); weight, tracking and type size
  unchanged.
- Markdown change blocks: the `+`/`−` sign removed; the bar and the tint
  stay, with `.75em` between the bar and the text, and the removed bar is
  dashed. Table rows keep their cells' own padding.

# Out of scope

- The other project avatars (rail, switcher, Home), which already fit.
- The Markdown change colours, bar width and tint.

# Acceptance criteria

- [x] Two-letter initials fit inside the status bar chip with visible space on
      both sides, in light and dark themes, in the running app.
- [x] The corner state mark still sits on the chip's corner.
- [x] In Changes → Markdown view, each added or removed block shows the bar,
      the tint and a gap before the text, with no sign; wrapped lines align
      with the first. The removed bar is dashed, the added one solid.
- [x] Headings, list items, code blocks and table rows keep their bar and tint.

# Relevant files

- `src/app/app-shell.css` (`.status-bar__avatar`)
- `src/features/changes/changes.css` (`.markdown-preview__added`/`__removed`)
- `DESIGN.md` § Typography (the 10px floor)

# Dependencies

None.

# Decisions

- Grow the chip, not shrink the type: 10px is the floor. Overview's chip
  (32px, 12px initials), which the user judged right, sets the proportion;
  at 10px that proportion is a 26px chip.
- No sign (option B of the comparison the user reviewed on 2026-10-29: twelve
  treatments, from the current signs to word-level track changes). The user
  judged the colour enough. A first pass kept the sign in a gutter of its own.
  DESIGN.md § Accessibility says file state is not told by colour alone, so
  the removed bar is dashed: the two differ by shape as well. A hidden
  "Added:"/"Removed:" label for screen readers was offered and declined for
  now; the blocks announce no state since the signs went.

# Implementation notes

Implemented ahead of the queue at the user's request. Passes at 20px and
22px without tracking still looked crowded in the running app with "TW"
beside Overview's chip, so the chip went to 26px and kept its tracking.
Measured in the gallery, "TW" spans 16.5px of 26 (0.63) against 19.8 of 32
(0.62) in Overview.

# Validation

- Style gallery (`/gallery.html`), light and dark: Markdown blocks (heading,
  wrapped paragraphs, list item, code block, table row) and two-letter chips
  checked by screenshot and `getBoundingClientRect`.
- `pnpm vitest run src/features/changes/markdownPreview.test.tsx src/architecture/styleComposition.test.ts`: 53 passed.
- DESIGN.md § Changes (Markdown preview) updated: bar and tint, no sign, the
  removed bar dashed.
- The user checked both in the running app (`tauri dev`) on 2026-10-29.
- Review: a changed code block kept its own 16px padding (`:not(tr, pre)`);
  the first draft had shrunk it to `.75em`.
- `pnpm run check:docs`: passed. `pnpm run check:frontend`: architecture and
  typecheck passed; the test run had 3 timeouts in `App.home.test.tsx` and
  `ConsoleScreen.test.tsx` while the Rust gate compiled in parallel, and both
  files passed on their own (45 tests); `pnpm run build` passed.
- `pnpm run check:rust` with a scratch `CARGO_TARGET_DIR` (the running
  `tauri dev` locks the shared one): fmt, Clippy and 684 tests passed.
