---
id: 141
title: Adopt the v4 mascot, one amber app icon, and its motion and console art
status: done
priority: normal
type: design
areas:
  - frontend
  - desktop
  - branding
created: 2026-09-30
completed: 2026-10-01
parent:
queue:
---

# Goal

Replace the v3 mascot (a lime crocodile in profile with sunglasses) with the
v4 character and carry it everywhere the brand appears: one application icon
for every platform and size, the welcome screen and About, and the console's
welcome.

# User outcome

GitOdile has a mascot with more character and a meaning of its own: a seated
crocodile whose crest is a commit graph. The app icon is the same object on
every desktop and at every size, and the brand moments — the welcome, About
and the console — move in ways that say what the product does.

# Context

The user sketched v4 on 2026-09-30 and iterated on it with side-by-side
renders (eyes, teeth, crest, plates, sunglasses, poses, tiles and crops) until
choosing "r14": the seated crocodile with arms and legs, big wayfarer
sunglasses without a brow bar, a white belly with amber plates, and a crest
drawn as a commit graph — white commits along an amber line ending in an
amber HEAD at the neck. Task [131](../0.4.0/131-mascot-app-icon.md)
introduced the v3 drawing and the pipeline this task rebuilds; its remaining
native-rendering check now applies to the v4 icon.

The durable decision is [ADR 0018](../../../docs/adr/0018-v4-mascot-and-one-amber-application-icon.md).

# Scope

- Redraw the mascot in `scripts/icons/mascot.mjs` as one element tree and
  crop it three ways: body, head and portrait.
- One application icon: the portrait on a rounded amber tile lit from above,
  identical on Windows, Linux and macOS (on Apple's 824 px grid), at every
  size including 16–32 px; regenerate PNG, ICO, ICNS, Store logos and the
  NSIS images.
- Brand assets beside the SVGs: the icon at every shipped size, the macOS
  icon, the mascot and the head as PNGs under `src/assets/brand/png`.
- Welcome motion: replace the v3 glasses lift and star with a wave that
  lights the crest's commits amber from the tail to the HEAD, each one
  breathing as it lights; replace the v3 hop entrance with the mascot drawing
  its outline, filling in and popping its commits in.
- Console welcome: replace the square-pixel head with the whole mascot as
  ASCII art in themed tones, and a dim rain of hex digits falling behind it.
- Tighten the console's tip and prompt into one group; align the welcome's
  palette with the frames; leave the mascot and palette unframed.
- Evaluate an amber brand accent for the official themes.
- Update `DESIGN.md`, `docs/ARCHITECTURE.md`, `PRODUCT.md` and the ADR.

# Out of scope

- Changing the official themes' accent (evaluated, not adopted; see Decisions).
- A separate simplified drawing for small icon sizes.
- A setting to turn off only the console rain.
- Native rendering checks on each OS (still open in task 131).

# Acceptance criteria

- [x] `mascot.mjs` is the single source for the v4 drawing, its SVGs, the
      in-app artwork, the console ASCII art and the icon sources;
      `mascot.mjs --check` guards drift.
- [x] Every packaged icon is the portrait on the amber tile, one image on
      every platform and size, regenerated reproducibly by `pnpm icons`.
- [x] The brand PNGs and SVGs are in `src/assets/brand`.
- [x] The welcome's first visit in a session draws the mascot and builds its
      commits; later visits only run the commits wave; About keeps its sweep.
- [x] The console prints the whole mascot in ASCII with tones that hold in
      all 12 themes, sunglasses included, and a rain that passes behind the
      silhouette and fades at the edges.
- [x] System and app reduced motion stop every mascot animation and the rain.
- [x] `DESIGN.md`, `docs/ARCHITECTURE.md`, `PRODUCT.md` and ADR 0018 describe
      the result.
- [x] `pnpm run check` passes.

# Relevant files

- [Mascot source](../../../scripts/icons/mascot.mjs)
- [ASCII sampler](../../../scripts/icons/ascii-art.mjs)
- [Icon generator](../../../scripts/icons/generate-icons.mjs)
- [NSIS images](../../../scripts/icons/build-nsis-images.mjs)
- [Mascot component](../../../src/shared/ui/mascot.tsx)
- [Mascot motion](../../../src/shared/ui/primitives.css)
- [Welcome screen](../../../src/features/overview/OverviewPanel.tsx)
- [Console screen](../../../src/features/console/ConsoleScreen.tsx)
- [Console art](../../../src/features/console/mascotArt.ts)
- [Console styles](../../../src/features/console/console.css)
- [Brand assets](../../../src/assets/brand)
- [ADR 0018](../../../docs/adr/0018-v4-mascot-and-one-amber-application-icon.md)
- [Design direction](../../../DESIGN.md)

# Dependencies

None.

# Decisions

- r14 is the v4 mascot (user choice, 2026-09-30), after rejecting sneakers,
  accessories, a floating "ghost" body and other poses.
- One icon for everything: the portrait crop ("cuerpo partido") on the
  "ámbar con brillo" tile, `#fbe3a0` to `#e0a032`. A simplified small-size
  drawing was tried and rejected: "prefiero el mismo icono para todo".
- The welcome's glasses lift and star are replaced by the commits wave; About
  keeps its sweep (user, 2026-09-30). The commits breathe as they light
  because the first wave read too faintly.
- The console's pixel head read as a blocky silhouette; the user proposed
  ASCII art from a reference, and the whole body fits beside the summary.
  The sunglasses got their own tones after they printed white on dark themes.
- The console rain uses hex digits like commit hashes rather than katakana, so
  it belongs to Git. The console welcome becomes a third brand moment in the
  Motion rules; no other workbench screen decorates.
- Mascot and palette stay unframed (the user's mockup framed both): a fetch
  tool's logo and palette sit bare, a panel would read as a widget, and the
  rain's edge is solved with a fade instead of a frame.
- Entrance: of ten candidates compared in a harness, the user chose
  "trazo + historia" (9 + 5). The outline draws in the text colour so it shows
  on dark themes, then turns ink.
- Amber accent for the official themes: evaluated with contrast figures and
  a side-by-side comparison (`accent-compare.png`), not adopted. Amber is the
  warning colour in both official themes, so primary actions would read as
  warnings unless warnings moved to orange, and green ties the accent to the
  body and to "saved/added". Amber stays the mark's highlight.

# Implementation notes

- `mascot.mjs` exports the SVGs, `mascotArtwork.ts`, `mascotAscii.ts` and two
  icon sources; the part groups `fill`, `outline`, `glasses`, `glints`,
  `commits` and `head-node` become `gitodile-mascot__<part>` classes. Outline
  paths carry `pathLength="1"` in the in-app tree so the entrance can draw
  them with one dash.
- `pixel-grid.mjs` became `ascii-art.mjs`: it shades each character cell by
  weighted coverage, picks a tone per cell and returns a cover mask (belly
  included) so the rain hides under the silhouette. `mascotPixels.ts` is gone.
- `generate-icons.mjs` renders one default set plus the macOS `icon.icns`, and
  the brand PNGs; `mixIco`, `mixIcns` and `BODY_MIN_SIZE` are gone.
- `Mascot` takes `motion` (`sweep` or `commits`) and `entrance`; the welcome's
  old hop and `welcome-mascot--settled` are gone.
- The console art uses `light-dark()` for its per-scheme tones, as the console
  root colour already does, with a plain fallback. Its 7px type is a named
  exception in the typography guard.
- Throwaway comparison pages lived in an untracked `harness/` folder and were
  deleted; the accent comparison image is kept in
  [`work/assets/141-v4-mascot/`](../../assets/141-v4-mascot).

## Review before commit

A full review of the diff found and fixed:

- Bug: under the system's reduced-motion setting (not the app's), the new
  entrance still played, because the `.gitodile-mascot--enter *` override was
  less specific than the entrance rules. The entrance now lives inside
  `@media (prefers-reduced-motion: no-preference)`; the app setting was
  already covered by the global `!important` rule in `base.css`.
- `MascotArt` re-rendered a few hundred spans on every keystroke in the
  console prompt while the welcome showed; it is memoised now.
- The installer panel used `#fcf8ec` while its comment and the docs said the
  light theme's warm white; it now uses `--surface-app`'s `#faf8f5` and the
  bitmap is regenerated.
- Stale comments in `mascot.mjs` and `generate-icons.mjs`, ADR 0013's "the
  packaged icons stay lime" (an update note now points to ADR 0018), and this
  version's release note, which now describes the v4 mascot and console.

# Validation

- `pnpm run check` passed on 2026-10-01: documentation and icon checks (53
  and 19 node tests), frontend architecture, TypeScript, 1110 frontend tests
  in 116 files, the production build, Rust formatting and Clippy, and 483
  Rust tests.
- In the dev server (browser, not the Tauri window): the welcome's entrance
  and wave sampled at several times in the dark theme; reduced motion leaves
  the mascot still and complete; the console ASCII viewed in all 12 themes;
  the rain's edge fade and the palette alignment measured.
- Installed-icon qualification was closed by the owner in task 131 on
  2026-10-05; that task records the confirmation and the agent's evidence limits.
