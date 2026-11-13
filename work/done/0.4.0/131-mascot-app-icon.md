---
id: 131
title: Replace the app icon with the full-colour sunglasses mascot
status: done
priority: normal
type: design
areas:
  - frontend
  - desktop
  - branding
created: 2026-09-26
completed: 2026-10-05
parent:
queue:
---

# Goal

Replace the current monochrome crocodile head with the new full-colour
mascot supplied by the user: the full-body crocodile with sunglasses for most
uses, and the head-only "mini" variant where the body can no longer be read.
Both come from one hand-built drawing that drives every packaged native icon
and the mascot inside the app.

# User outcome

GitOdile is recognisable by its mascot everywhere it appears: taskbar, dock,
Start menu, installer, the no-project welcome screen and About. At tiny sizes
the icon stays a clear crocodile face instead of an unreadable green sliver.

# Context

On 2026-09-26 the user supplied two raster drawings and asked for an analysis
of possible errors and improvements, plus this task. The originals are kept
as references in
[`work/assets/131-mascot-app-icon/`](../../assets/131-mascot-app-icon):

- `mascot-body-reference.png` — full body, 1536 × 1024, drawing 1373 × 662
  (about 2.07 : 1).
- `mascot-head-reference.png` — head only, 1254 × 1254, drawing 1052 × 642
  (about 1.64 : 1).

The user chose `#a8f442` as the mascot's fill because it sits well on most
backgrounds and themes. Outlines are black; the lens highlights are white.

This replaces the direction of task
[102](../0.3.0/102-refine-crocodile-brand-mark.md), which refined the old head mark
and never reached an approved design.

## Analysis of the supplied PNGs

Findings from pixel inspection and renders at 16, 24, 32, 48, 64 and 128 px
on light and dark surfaces:

### Raster defects (fixed by redrawing, relevant if anything is traced)

- The artwork is not fully opaque: fill and outline pixels have alpha 253–254
  instead of 255, and the outline is `#010000`/`#000000` mixed. A trace or
  crop would inherit a faint see-through edge.
- Stray near-invisible pixels (alpha 1) sit far outside the drawing (for
  example at the top centre and bottom-right of the head PNG). Automatic
  trimming would include them and shift the centring.
- The outlines are hand-drawn and uneven: measured outline thickness on the
  body varies between about 47 and 68 px, with visible polygonal steps along
  the curves. An automatic trace (potrace or similar) would reproduce that
  wobble; the SVG must be redrawn with smooth curves and one outline weight.

### Consistency between the two drawings

The head is not a crop of the body; the two disagree in details that should
match for one brand:

- Sunglasses: the body's frame has a straight top bar that overhangs the eye
  bumps; the head's frame has a lowered bridge between the lenses and a
  different lens shape.
- Smile: on the body it runs into the jaw outline at the snout tip; on the
  head it ends in a separate curl before the snout.
- Snout proportions, nostril size and highlight angles differ slightly.

Choose one design for glasses, smile, nostril and highlights and use it in
both variants.

### Small-size legibility

- With the body's 2 : 1 proportion, a square icon leaves it about half the
  canvas height. At 32 px the crocodile is about 15 px tall; at 16 px it is a
  green dash. The body therefore needs the head variant below a threshold.
- The outline is about 4–5 % of the drawing width. Proportional reduction
  makes it 0.6–0.8 px at 16 px and 1.3–1.6 px at 32 px, so the black edge
  that separates the lime from light backgrounds fades out. `#a8f442` on
  white is very low contrast by itself; the outline carries the silhouette.
  The small variant needs an optically thicker outline, not a scaled one.
- The overlapping rear legs create a thin lime sliver that becomes noise
  below about 64 px; separate legs read better.
- The white lens highlights still read as "sunglasses" at 24–32 px but turn to
  single-pixel noise at 16 px; the 16 px drawing may need one wider highlight
  per lens or none.

### Brand and documentation conflicts

- The current in-app mark is a single-colour CSS mask (`currentColor` with
  transparent cutouts). A three-colour mascot cannot use that mask; the
  in-app mark must render the SVG in its own colours.
- `DESIGN.md` still describes the old mascot (simple eye, restrained teeth,
  monochrome-adaptable, lime tile `#80dc2e` with a black mark) and the
  theme-aware in-app treatment. It must be rewritten for the new mascot.
- The current native icon is a lime tile with a dark mark. Putting a
  `#a8f442` crocodile on a lime tile would erase it; the tile question below
  must be decided.
- Sunglasses give the mascot a "cool, relaxed" personality that fits "Git
  without the fear". They also hide the eyes, so the smile alone carries the
  friendliness; keep it prominent at small sizes.

# Scope

- Redraw both variants as clean, editable SVG masters with the shared
  details decided above: `#a8f442` fill, black outline, white highlights, one
  consistent outline weight, full opacity, no stray points.
- Document the size threshold in `DESIGN.md`.
- Update the icon pipeline (`pnpm icons`) so each native size is rendered from
  the correct variant instead of scaling one source.
- Regenerate PNG, ICO, ICNS, Windows Store logos and the NSIS installer
  images.
- Replace the in-app CSS-mask mark with the colour mascot, decorative
  (`aria-hidden`), with its fill following the theme.
- Added during the task at the user's request: move the mascot out of the
  titlebar into the no-project welcome screen and About, give each place its
  own glasses animation, and centre the titlebar's first control over the
  rail's icon column.
- Update `DESIGN.md` (mascot, application mark, icon sizes) and any
  architecture note about the icon pipeline.
- Close task 102 as superseded once this task is accepted.

# Out of scope

- Wordmark, onboarding illustrations, or mascots in other empty states.
- A way back to the welcome screen while projects are open (task 132).
- Palette or theme-token changes beyond the mascot's own colours.
- New features, dependencies or packaging and release changes.

# Open questions

- Whether Tauri can bundle an Icon Composer (`.icon`) file so macOS 26
  applies its layered Liquid Glass treatment and generates dark/tinted
  variants from separate background and mascot layers. If not, ship the
  flattened `.icns` with the emerald tile; macOS accepts it.

# Acceptance criteria

- [x] Both SVG masters are redrawn by hand, share the same glasses, smile,
      nostril and highlight design, and use `#a8f442`, black and white at
      full opacity.
- [x] The user has approved the drawings and the size threshold from an
      actual-size comparison (16–256 px, light and dark surfaces).
- [x] The user has chosen the macOS tile background (emerald gradient).
- [x] `pnpm icons` regenerates every native asset reproducibly from the SVG
      sources: the head for sizes under 48 px, the body from 48 px.
- [x] ICO layers 16/24/32/48/64/256, ICNS, PNG, Store logos and NSIS images
      are regenerated, checked for size and transparency, and inspected at
      actual size.
- [x] The welcome screen and About show the new mascot in every theme,
      decorative, with reduced motion honoured; About stays reachable from
      the ··· menu and the palette once the titlebar mark is gone.
- [x] `DESIGN.md` describes the new mascot, colours, variants and
      thresholds; stale guidance about the old mark is removed.
- [x] Native rendering is checked on Windows; macOS and Linux checks are done
      or recorded as not done.
- [x] Task 102 is closed as superseded.
- [x] `pnpm run check` passes.

# Relevant files

- [Body reference](../../assets/131-mascot-app-icon/mascot-body-reference.png)
- [Head reference](../../assets/131-mascot-app-icon/mascot-head-reference.png)
- [Mascot source](../../../scripts/icons/mascot.mjs)
- [In-app body](../../../src/assets/gitodile-mascot.svg)
- [In-app head](../../../src/assets/gitodile-mascot-head.svg)
- [Icon generator](../../../scripts/icons/generate-icons.mjs)
- [Icon pipeline tests](../../../scripts/icons/generate-icons.test.mjs)
- [ICO builder](../../../scripts/icons/build-windows-ico.mjs)
- [NSIS images](../../../scripts/icons/build-nsis-images.mjs)
- [Mascot component](../../../src/shared/ui/mascot.tsx)
- [Mascot tests](../../../src/shared/ui/mascot.test.tsx)
- [Mascot styles and motion](../../../src/shared/ui/primitives.css)
- [Welcome screen](../../../src/features/overview/OverviewPanel.tsx)
- [Titlebar and About styles](../../../src/app/app-shell.css)
- [ADR 0013](../../../docs/adr/0013-themes-own-the-actionable-accent.md)
- [Style composition test](../../../src/architecture/styleComposition.test.ts)
- [Design direction](../../../DESIGN.md)
- [Previous brand task](../0.3.0/102-refine-crocodile-brand-mark.md)

# Dependencies

None. The user approved the redrawn SVGs, the threshold and the macOS tile.

# Decisions

- The v3 drawing, icon pipeline and welcome motion recorded below were
  replaced by the v4 mascot and one amber icon in task
  [141](../0.3.0/141-v4-mascot-amber-icon-and-console-art.md) (ADR 0018). The
  open native-rendering criterion now applies to the v4 icon.
- The PNGs are references, not production sources. They are redrawn as SVG
  by hand rather than auto-traced, so curves and outline weight are clean.
- Full body for most uses, head-only mini variant for small sizes (user
  direction, 2026-09-26).
- Mascot fill `#a8f442` (user choice).
- The user approved draft v1's body and head over the supplied PNGs,
  including the separated far leg and the body-derived head (2026-09-26).
- No thick-outline small variant: the regular head reads well down to 16 px,
  so one head drawing serves every small size (user decision, 2026-09-26).
- Threshold: the body at 48 px and above; the head for icons under 48 px
  (the 16/24/32 px layers and the 30/44 px Store logos). At 32 px the body is
  about 15 px tall and loses its legs and ridge, while the head fills the
  square and keeps the glasses and smile readable. The same rule applies
  inside the macOS tile: its 16 and 32 px layers show the head.
- The titlebar carries no mascot at all (user decision, 2026-09-26, after
  comparing seven corner options in `mascot-placement-options.html`): a
  colour illustration in a row of line icons broke the toolbar's look and
  drew the eye to a spot that does nothing. The mascot lives in the
  no-project welcome screen (full body, hops in once, then the glasses
  shine) and in About; About opens from the ··· menu and the palette. This
  supersedes the next decision.
- Superseded: the titlebar showed the full body at 44 × 22 px: it is not a square icon
  slot, so the body reads at that size. Square icons under 48 px, such
  as the Windows taskbar, keep the head, where the body would be a 12–15 px
  tall sliver (user decision after the HTML comparison, 2026-09-26).
- Windows and Linux icons are transparent, free-form mascots (user decision,
  2026-09-26).
- Inside the app the mascot's fill follows the theme, as ADR 0013 already
  required for the old mark; the first production pass had fixed it to lime
  by mistake and the user asked to theme it (2026-09-26). Outline, glasses
  and glints stay black and white; packaged icons stay lime.
- macOS uses a rounded-square tile with a vertical emerald gradient,
  `#3f7c58` at the top to `#1b4631` at the bottom, and no drawn glow,
  highlight or shadow; macOS adds its own effects (user decision,
  2026-09-26, "for now"). Near-black tiles were rejected because the black
  outline disappears on them, light tiles because the lime loses strength,
  and a free-form icon because macOS expects a tile. The comparisons are in
  `macos-backgrounds-v1.png` and `macos-backgrounds-v2.png`; Apple's
  guidance is in the [HIG app icons page](https://developer.apple.com/design/human-interface-guidelines/app-icons).

# Implementation notes

## Draft v1 (2026-09-26, for review)

The drafts were drawn over the references in the body PNG's 1536 × 1024
space from shared parts (crown, glasses, glints, smile, nostril, strap), as
centre-line paths stroked at one weight (50 units). The body matched the
reference silhouette within a few pixels, with the far front leg drawn behind
the body and a gap from the near leg. The head is the body's head with a
rounded skull behind it; its snout is the body's, shorter than in the
supplied head PNG. A thick-outline small head was tried and dropped.
`review-v1.png` records that review. The draft script and SVGs were replaced
by the production source below.

## Production

Icons and drawing:

- `scripts/icons/mascot.mjs` is the single source. It draws the mascot from
  shared parts and writes `src/assets/gitodile-mascot.svg` (body),
  `src/assets/gitodile-mascot-head.svg` (head) and
  `src/shared/ui/mascotArtwork.ts` (the same element tree for the in-app
  component). It also builds the four 1024 px icon sources: transparent with
  a 24 px margin, and on the macOS tile (Apple's 824 px grid, radius 185,
  vertical emerald gradient). The strap is drawn inside the glasses group so
  it moves with the frame; at rest it sits where it always did.
- `scripts/icons/generate-icons.mjs` renders each source with `tauri icon`,
  keeps the transparent body set, and swaps in the head under 48 px
  (`BODY_MIN_SIZE`): `32x32.png`, `Square30x30Logo.png`,
  `Square44x44Logo.png` and the 16/24/32 px ICO layers. It builds `icon.icns`
  from the tiled body with the tiled head in `is32`/`s8mk`/`il32`/`l8mk`/`ic11`.
  `src-tauri/icons/source.svg` is gone.
- The NSIS side panel uses the mid emerald `#2d6144` instead of near-black,
  which would swallow the outline.
- `check:icons` also runs `mascot.mjs --check`; `generate-icons.test.mjs`
  covers the ICO/ICNS mixing, the committed ICNS entries and generated-file
  drift.

In the app:

- `src/shared/ui/mascot.tsx` (`Mascot`, exported from `shared/ui`) renders
  the mascot inline so its fill can follow the theme.
  `src/assets/gitodile-mark.svg` and the old `CROCODILE_MARK` are removed;
  `branding.tsx` keeps only the modifier-key helpers.
- Themed fill (`primitives.css`): `--mascot-fill` is the theme's
  `--accent-primary-fill` lifted to at least OKLCH lightness 0.72; the
  GitOdile themes and the system default use the new brand token
  `--mascot-brand-fill` (`#a8f442`). `forced-color-adjust: none` keeps the
  illustration's own colours in Windows high contrast. ADR 0013 records the
  update.
- History of the titlebar mark: the colour head at 24 px, then the body at
  44 × 22 px, then removed. The titlebar now starts with the ··· menu,
  centred over the rail's icon column (`--titlebar-lead-button`, falling back
  to the 10 px edge inset without a rail).
- The welcome screen shows `<Mascot motion="greet" className="welcome-mascot" />`
  at 168 px: a 620 ms hop, the glasses lift 22 units and settle once (900 ms,
  700 ms delay), then a four-point star glints on the right lens every 5.5 s
  while the glints scale up.
- About shows `<Mascot motion="sweep" />` at 132 px: two slanted white bands
  at 70 % opacity, clipped to the glasses, cross the lenses in about 0.9 s
  every 6.5 s after a 1.2 s delay.
- Both motions stop with `prefers-reduced-motion` and with the app's Reduce
  motion setting; the mascot then shows still.
- `DESIGN.md`, `docs/ARCHITECTURE.md`, `PRODUCT.md` and ADR 0013 describe the
  mascot, the pipeline and the placement.
- Final exports for other uses are in
  [`work/assets/131-mascot-app-icon/`](../../assets/131-mascot-app-icon):
  `gitodile-mascot-body.png` (1938 × 950), `gitodile-mascot-head.png`
  (1944 × 1227), both transparent, and `gitodile-icon-macos.png` (2048 px, on
  the tile). They are renders, not sources; regenerate them from
  `mascot.mjs` if the drawing changes. The HTML and PNG comparisons in the
  same folder record each decision above.

# Validation

- `pnpm icons` regenerated every icon. Every ICO layer, ICNS entry, PNG,
  Store logo and both installer bitmaps were inspected at actual size in a
  contact sheet: head at 16/24/32 (ICO) and 16/32 (ICNS), body at 48 and up,
  tile only in the ICNS, sizes and transparency as expected.
- In the running dev server (browser, not the Tauri window): no mascot in the
  titlebar; the ··· menu centred on the rail item (32 px normal, 28 px icons
  only, 10 px inset with the rail hidden); the welcome mascot in GitOdile
  light and in Dracula, paused mid-lift (strap follows the frame) and
  mid-star; About opened from the ··· menu with only the sweep; the fill
  measured in all 12 themes; motion and star gone with Reduce motion.
- The user reviewed the result in the running app.
- `pnpm run check` passed after the final review (2026-09-27): documentation
  and icon checks, frontend architecture, TypeScript, 1010 frontend tests in
  105 files (including the new `mascot.test.tsx`), the production build, Rust
  formatting and Clippy, and 437 Rust tests. That review unified the size
  threshold as "under 48 px takes the head" (the 44 px Store logo already
  did), added `forced-color-adjust: none`, updated ADR 0013 and the About
  wording in `DESIGN.md`, and added component tests for the strap group,
  unique clip ids and the star.
- Not yet done: the icon in a real Windows install (taskbar, Start, Explorer,
  installer) and any macOS or Linux rendering, so the task stays active.

## Status review (2026-10-05)

The implementation was superseded by completed task 141, but that task
explicitly delegates real installed-icon validation back here. Windows
taskbar, Start, Explorer and installer rendering is still unverified;
macOS/Linux rendering is also not recorded. Keep this task active for
its remaining native-rendering criterion.

## Owner-confirmed closure (2026-10-05)

The owner explicitly confirmed that tasks 131 and 145 are validated and
requested moving both to done. This confirmation supersedes the active-status
conclusion in the review above. No new platform or CI results are claimed
by the agent; historical evidence and its limitations remain recorded.

Closure checks: documentation, icon contracts, architecture, TypeScript,
1,236 frontend tests, frontend production build, Rust formatting and Clippy
passed. The aggregate `pnpm run check` stopped during Rust test compilation:
Windows denied removal of `src-tauri/target/debug/gitodile.exe` (OS error 5).
The Rust tests were not completed in this closure run.
