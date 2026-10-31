---
id: 190
title: One seam and an unfolding motion for the search palette
status: done
priority: normal
type: ux
areas:
  - frontend
  - ux
created: 2026-10-20
completed: 2026-10-20
parent:
queue:
---

# Goal

The status bar's search and its results read as one object that unfolds out
of the field and folds back into it: the field keeps its open shape until the
panel has gone, both halves share one corner radius, the seam shows no doubled
halo or cut shadow, and every destination in the palette wears its own glyph.

# User outcome

Opening and closing the search no longer jumps. Closing with Escape does not
flash a thick focus ring, the results never cover the query while they
arrive, and the lines round the panel and the field meet cleanly.

# Context

Explored with Luis on 2026-10-20 in an artifact with a live test bench of the
current motion and four proposals (A–D), a 3× zoom of the seam and a
millisecond timeline: https://claude.ai/artifact/KW1UvcrMoNjDq3WVSv1xxH

Option A ("Despliegue") was accepted with every other tweak in the artifact.

What the artifact found:

- The field dropped its open state on the first frame of the close, while
  the panel held for 90ms, so the panel faded square-bottomed over a pill and
  the focus ring (3px of ink) snapped on.
- The field's radius animated from `--radius-pill` (999px) to 14px, which
  reads as a jump at the end of the transition.
- The panel entered 6px low over the field, covering the query.
- The panel's top corners were 18px and the field's bottom corners 14px; the
  field's halo rose above the seam and doubled the panel's; the panel's
  `--shadow-lg` was cut flat at the seam; Work and Changes shared `FileDiff`,
  and Overview fell back to `GitBranch`, the glyph of Branches.

# Scope

- `CommandPalette`: the field carries `data-palette-state` (open, closing)
  through the panel's whole life; the panel learns the field's corner radius;
  the exit hold covers the 90ms fold.
- `app-shell.css` and `home.css`: fields rest at `--radius-field`, half their
  height, instead of `--radius-pill`; the fused panel unfolds from the seam (120ms) and folds back
  (90ms), on Console's clock and curve; the field's halo is clipped at the seam; the fused panel casts
  `--shadow-up`; an inner divider marks the seam; a focused field wears the
  object's edge and halo instead of the ink ring; the chosen row's `↵` is a
  small key; the narrow-window field stays unfolded while the panel leaves.
- `tokens.css`: `--radius-field`. `themes.css`: `--shadow-up` beside
  `--shadow-lg` in every theme.
- Reduced motion (system): an 80ms fade with no movement instead of nothing.
- Glyphs: the rail's own — Overview `LayoutDashboard`, Work `Layers`, Console
  `SquareTerminal`.
- DESIGN.md and tests.

# Out of scope

- Console's terminal-pane results and the floating panel of a narrow field:
  they keep today's rise.
- The app's own reduced-motion preference, which still removes every
  animation.

# Acceptance criteria

- [x] The field keeps its open shape until the panel has left.
- [x] Panel and field share one radius, derived from the field's height.
- [x] The fused panel unfolds from the seam and folds back, at the pace of
      the app's menus, its rows coming with it.
- [x] No doubled halo and no cut shadow at the seam.
- [x] Overview, Work, Changes and Branches each wear a distinct glyph.
- [x] The chosen row's `↵` is a key.
- [x] System reduced motion fades without movement.
- [x] Tests cover the field state and the glyphs.
- [x] `pnpm run check` passes.

# Relevant files

- `src/app/CommandPalette.tsx`
- `src/app/app-shell.css`
- `src/features/home/home.css`
- `src/styles/themes.css`
- `DESIGN.md`

# Dependencies

None.

# Decisions

1. **Option A, unfold from the seam.** Nothing moves out of place, so the
   object reads as growing out of the field. B (scale) squashes text for an
   instant, C (fade) does not say where the panel comes from, and D (spring)
   is too long and playful for something opened dozens of times a day.
2. **Radius from the field's height.** At rest a 32px field with 16px corners
   is the same pill, and opening only changes its two top corners; Home's
   28px field gets 14px the same way.
3. **Upward shadow.** A shadow cast upward leaves nothing to cut at the seam;
   `--shadow-up` is a per-theme token so it keeps each theme's shadow colour.
4. **The rail's glyphs, not new ones.** The artifact proposed `PencilLine`
   for Work; the screen descriptors already give Work `Layers` and Console
   `SquareTerminal`, so the palette now wears the same glyph the rail does.
5. **`--radius-field` is a role token.** The style composition test allows
   only role tokens for radii; the token is the search field's capsule, and a
   field of another height sets its own half (Home 14px, a coarse pointer
   22px). The fused panel receives the measured value inline.

# Implementation notes

- `CommandPalette` writes `data-palette-state` (`open`, `closing`) on the
  field and removes it once closed; the fused field's CSS keys off it with
  `data-palette-fused`, so the field stays the object's foot through the
  90ms fold. `EXIT_MS` is 120.
- First shipped at 210ms in / 140ms out with the rows staggered nearest the
  field first (40ms + 12ms a row, 150ms each). Tried in the app, Luis found
  it slower than the rest of GitOdile — the last row settled near 260ms
  against the menus' 120ms — so the timings moved to 150ms / 100ms and the
  stagger went: the rows unfold with the panel. Luis then preferred
  Console's pace, so the unfold took its 120ms in (`--duration-fast`,
  `cubic-bezier(.16,1,.3,1)`) and 90ms out (`ease-in`); the movement stays
  the unfold, because Console's rise would slide over the field.
- A command that changes the screen or the project (`go-…`, `switch-…`)
  closes the palette with `leaveAtOnce`: the panel goes without folding back
  and the field drops its open shape with transitions off for a frame
  (`data-palette-snap`). Folding back while the next screen drew read as a
  stray contraction (found by Luis in the app). Escape, an outside press and
  commands that stay on the screen keep the fold.
- The narrow-window fold waits for `data-palette-state` to go, so the field
  does not shrink to its circle under a panel that is still folding.
- Under the system's reduced motion the panel no longer closes at once: it
  goes through `closing` with an 80ms fade. The app's own preference still
  closes it immediately and its global rule removes every animation.
- Checked in a throwaway harness under Vite (dark theme, 1280px): seam
  edges flush to the pixel, field `0 0 16px 16px` while open and through the
  close, panel `16px 16px 0 0`, the soft halo after Escape instead of the ink
  ring, and seven distinct glyphs. The browser pane was hidden, so the
  motion itself was not watched there; it needs a look in `tauri dev`.
- A command that changes the screen or the project — or a project switch
  from anywhere else — closes the palette at once; every `closePalette` call
  states its mode, so a flag left by one close cannot make a later Escape
  abrupt (reopening by typing does not pass through `openPalette`).
- Under the system's reduced motion every panel fades out over the exit
  hold, the floating and Console ones included, instead of sitting frozen
  for 120ms.
- Luis watched the final motion in `tauri dev` on 2026-10-20 and confirmed
  it, including the switch to another screen.
- `pnpm run check` on 2026-10-20: docs, architecture, TypeScript, the
  frontend tests (144 files, 1552 tests) and build, `cargo fmt` and
  `cargo clippy` passed. `cargo test` could not relink: the running
  `tauri dev` held `gitodile.exe`. This change touches no Rust; the last full
  run earlier the same day passed (608 passed, 1 ignored).
