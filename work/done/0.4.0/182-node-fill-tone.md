---
id: 182
title: Soften the version node fill to 65% ink in every theme
status: done
priority: normal
type: design
areas:
  - frontend
  - design
  - ux
created: 2026-10-18
completed: 2026-10-18
parent:
queue:
---

# Goal

The filled and half-filled version nodes use one derived fill: 65% of the
primary ink mixed into the panel. It applies in light and dark, so Changes,
Overview, History and Branches all read with the same softer charcoal instead of
a near-black or near-white disc.

# User outcome

A column of included or published nodes stops out-shouting the one accent node
that says which file or version is open. The filled state is still a clear
solid disc, and the half moon still reads at a glance, but the accent regains
its role as the loudest mark in the list.

# Context

The design review at
`node-fill-options.html` (a retired review prototype) compared
100%, 85%, 75%, 65% and 55% of the primary ink over the panel across the four
version lists. At 100%, the full node measures 17.5:1 on the official light
panel while the selected accent measures 5.4:1; the neutral dots win the eye
before the selection. At 65% the fill measures 5.4:1 and the accent wins by
hue, row tint and halo. The same mix in dark keeps the two schemes alike
(7.6:1 on the official dark panel, against an 8.2:1 accent).

Task [179](179-published-version-node-colour.md) chose the primary ink
for the published node. Its shape and hover logic stay; only the fill colour
moves to the derived token.

# Scope

- Add `--node-fill` to `tokens.css` as
  `color-mix(in srgb, var(--text-primary-color) 65%, var(--surface-panel))`,
  with no per-theme values.
- Use it for both border and fill of:
  - Changes' checked and indeterminate node;
  - History's `--local` and `--published` node;
  - Overview's `--local` and `--published` node, including the publishable
    row's hover half moon;
  - Branches' recent `--local-only` and `--published` node.
- Leave the selected/active accent rules, the secondary ring for an unknown
  state, the forced-colors fallbacks and the hover halos untouched.
- Update the node comments and `DESIGN.md` from "primary ink" to the node fill,
  and record the 65% choice in the tokens/theme prose.
- Add a contrast test: the fill stays at least 3:1 over the panel in every
  registered theme.

# Out of scope

- The decorative scene dot in Overview and the route dots in Branches; they are
  drawings, not version nodes.
- The Overview incoming/Now dashed rings and the History local-group cloud.
- Changing shapes, sizes, hover/selection accents or forced-colors mapping.
- Light-only treatment: the mix applies to both schemes by decision.

# Acceptance criteria

- [x] A single `--node-fill` token at 65% is defined and used by the four
      version lists in both themes.
- [x] Filled nodes are the soft ink; half moons use the same fill; rings and
      selected/active accents are unchanged.
- [x] The 65% fill measures at least 3:1 over `--surface-panel` in every theme.
- [x] Existing tests pass; the new contrast test covers every theme.
- [x] `DESIGN.md` describes the derived fill and no longer calls the published
      node primary ink.
- [x] `check:docs` and `check:frontend` pass, and the Rust step's `fmt`/`clippy`
      pass. `cargo test` could not relink `gitodile.exe` because a debug
      instance was running (Access denied); Rust is untouched.

# Relevant files

- `src/styles/tokens.css`
- `src/features/changes/changes.css`
- `src/features/history/history.css`
- `src/features/overview/overview.css`
- `src/features/branches/branches.css`
- `src/architecture/themeContrast.test.ts`
- `DESIGN.md`
- `work/assets/node-fill/node-fill-options.html`

# Dependencies

None. The review asset is evidence, not a runtime dependency.

# Decisions

- **65%, both schemes.** It matches the selected accent's contrast in light
  (5.4:1) and stays above the accent in dark (7.6:1 against 8.2:1), while
  remaining a solid disc rather than a grey ring.
- **One derived token, not fourteen values.** `color-mix` from each theme's own
  ink and panel keeps the community palettes coherent and avoids a new
  per-theme colour to maintain.
- **Shape and accent do not move.** Only the fill of the filled and half states
  changes; the ring, hover halo, selected/active accent and forced-colors
  fallbacks stay.
- **Decorative dots stay out.** The scene and route drawings are not version
  nodes and would make the change wider than the reviewed scope.

# Implementation notes

- `tokens.css`: added `--node-fill` as
  `color-mix(in srgb, var(--text-primary-color) 65%, var(--surface-panel))`.
  It is derived once, not a per-theme value, and is the same recipe in light
  and dark.
- `changes.css`, `history.css`, `overview.css`, `branches.css`: the
  filled and half states use `var(--node-fill)` for both border and fill. The
  Overview publishable row's hover half moon uses it too. Selected/active
  accent rules, the unknown ring, the hover halos and the forced-colors
  fallbacks are untouched.
- `themeContrast.test.ts`: parses the mix from `tokens.css` and checks it at
  3:1 against `--surface-panel` in every registered theme. The 65% fill passes
  in all 14 themes.
- `DESIGN.md`: the Overview, History, Branches and Changes node paragraphs now
  describe the node fill and the 65% recipe instead of the primary ink.
  `work/README.md` advances the next unused ID to 183.
- `work/assets/node-fill/node-fill-options.html`: the review page now defaults
  to 65% in both themes (`Mezcla también en oscuro` checked) and records the
  decision in its verdict/token card.

# Validation

- `pnpm run check` reached documentation and frontend successfully:
  documentation over 317 Markdown files and 232 task ids; 144 test files /
  1551 tests, including the 23 style-composition tests and the 10
  theme-contrast tests (the new node-fill test covers every theme); Vite
  production build. `cargo fmt` and `cargo clippy -D warnings` passed.
  `cargo test` failed only when it tried to replace the running
  `src-tauri/target/debug/gitodile.exe` (`Access denied`); Rust is untouched
  and the app was open for review.
- The real `changes.css` (tokens, themes, base, primitives) was rendered at
  320 px in Chrome light: the included and select-all nodes now read as the
  soft charcoal, the active row stays accent green, the excluded row keeps its
  ring and the folder keeps its half moon.
- The node-fill page was rendered light and dark at 1440 px; the stage's
  summary reads #6b6a68 / 5.4:1 in light and #acabaa / 7.6:1 with the accent at
  8.2:1 in dark. The page now shows the selected 65% both-themes decision.
