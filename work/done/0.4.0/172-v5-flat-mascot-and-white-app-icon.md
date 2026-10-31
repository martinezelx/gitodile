---
id: 172
title: Adopt the flat v5 mascot, a white app icon, and new mascot motion
status: done
priority: normal
type: design
areas:
  - frontend
  - desktop
  - branding
created: 2026-10-14
completed: 2026-10-15
parent:
queue:
---

# Goal

Replace the v4 mascot with the flat v5 silhouette everywhere the brand
appears: the application icon on every platform and size, the Windows
installer, the welcome screen and About, and the console welcome.

# User outcome

GitOdile's mascot reads at every size: one flat crocodile with no outline or
glasses, whose belly and eyes show the surface behind it inside the app. The
app icon is that crocodile in ink on a white tile, the same object on every
desktop and in the Dock beside other white-tiled tools. Home greets with a
drawing entrance and an occasional blink; About winks in step with the
wordmark's light.

# Context

The v4 mascot carried character at hero size but turned to noise at 16–32px:
outline, sunglasses, a commit-graph crest and amber plates. The v5 exploration
redrew it as a silhouette and refined it over several rounds (a straightened
snout, matching pointed teeth and fingers, one radius scale for every corner,
a five-lobe crest on the v5 outline, thicker belly plates and edge line,
plates starting on one vertical). An outline, six kinds of sunglasses, a head
icon, several crops and many tile colours were compared and set aside; see
ADR 0031.

Also fixed while reviewing: the Changes image diff's "fade" mode jumped back
to the original picture when the slider reached 100%.

# Scope

- Traced v5 shapes in `scripts/icons/mascot-shapes.mjs`; `mascot.mjs` builds
  the body and its head crop from them.
- One application icon: the whole body in ink on a white tile (`#ffffff` to
  `#e8e8e8`), centred, the tail cut by the tile's corner; macOS on Apple's
  grid. Regenerate every packaged icon, the ICO, the ICNS and the brand PNGs.
- Windows installer bitmaps on the same white: the body on the side panel, the
  head crop on the header strip.
- In-app mark: the themed body with the belly, toes and eyes as holes; the
  eyes cut by a per-mark mask so they can close.
- Home: the one-time entrance (every edge traces, then the colours fill in)
  and a `blink` motion at an uneven pace. About: a `wink` in step with the
  "Odile" light sweep. Remove the crest's commit wave and the lens sweep.
- Console welcome: ASCII art sampled from the v5 body in one tone.
- Remove the crest colour token and the v4 motion styles.
- ADR 0031 (superseding 0018 and 0029), DESIGN.md, ARCHITECTURE.md,
  PRODUCT.md, notes in ADR 0013, and a 0.3.1 release highlight.
- Changes image diff: keep the updated picture above the original in fade and
  swipe at every position.

# Out of scope

- A separate small-size icon drawing (one icon at every size stands).
- Sunglasses or an outline on the mascot.
- Redrawing the mascot in parts to animate a tail or jaw.

# Acceptance criteria

- [x] Every packaged icon, the ICO and the ICNS show the v5 body on the white
      tile; `check:icons` passes.
- [x] Both installer bitmaps are on the white tile, the body on the side panel
      and the head crop on the header.
- [x] Home draws the mascot on the first visit of a session and then blinks;
      About winks in step with the wordmark; reduced motion stops both.
- [x] The in-app belly, toes and eyes show the surface behind them in light
      and dark themes.
- [x] The console welcome prints the v5 mascot generated from the drawing.
- [x] The head variant is a crop of the body, not a separate drawing.
- [x] Fade at 100% shows the updated picture.
- [x] Docs and ADRs describe the v5 mascot and white icon.

# Relevant files

- `scripts/icons/mascot.mjs`, `scripts/icons/mascot-shapes.mjs`
- `scripts/icons/generate-icons.mjs`, `scripts/icons/build-nsis-images.mjs`
- `src/shared/ui/mascot.tsx`, `src/shared/ui/primitives.css`
- `src/features/home/HomeLauncher.tsx`, `src/app/AppOverlays.tsx`,
  `src/app/app-shell.css`
- `src/features/console/console.css`, `src/features/console/mascotArt.ts`
- `src/features/changes/changes.css`
- `docs/adr/0031-v5-flat-mascot-and-white-icon.md`

# Dependencies

None.

# Decisions

- One drawing: the head is a crop of the body, cut a little under the teeth.
  A separately traced closed head was tried and dropped so two drawings never
  drift apart.
- The icon is the centred whole body rather than the head: the head alone in a
  square tile read as a floating head and left empty space; closer crops cut
  the crest into a heavy block.
- A white tile with a soft gradient, as Slack, Chrome and Teams use and as
  Apple advises for light icons, rather than flat white (which vanished on a
  white desktop) or the brand lime (louder than a professional tool).
- In-app the white parts are holes rather than white fills, so the mascot sits
  on any surface; the icon and installer keep warm white fills because there
  is no surface to show through.
- The eyes are a mask so a scaled eye lets the body fill its hole; if a
  webview did not repaint an animated mask, the eyes would simply stay open.
- The console art stays generated from the drawing, not hand-made, so it
  cannot drift from it.

# Implementation notes

- `mascot.mjs`: `bodyDrawing(body, light)` for standalone SVGs, icon and
  installer; `placed()` clips a crop to its box; `iconSourceSvg` places the
  body by its path bounds (0.8 tile px per unit, height centred, snout 4% from
  the right edge); `artworkModule` writes one holed body path, the entrance
  outline and the eye paths; `consoleAsciiModule` samples the body with one
  tone.
- `mascot.tsx`: the eye mask per mark (`useId`), `wink` and `blink` motions.
- `primitives.css`: `mascot-wink` (6.5s, 1.2s start, like the wordmark),
  `mascot-blink` (17s cycle: single, double, single), the entrance trace that
  fades out, reduced-motion overrides.
- `changes.css`: the after layer is positioned in fade and swipe, so it no
  longer relies on opacity or clip-path to paint above the positioned
  original.
- Removed `--mascot-brand-crest` and the crest, commit, glasses and sweep
  styles.

# Validation

- `pnpm icons`: regenerated `src-tauri/icons/*`, `icon.ico` (16–256),
  `icon.icns`, the brand PNGs and both installer BMPs.
- `pnpm run check:docs`, `check:architecture`, `check:frontend`: passed
  (142 test files, 1497 tests; icon checks 21 passed).
- `pnpm run check:rust` with a separate `CARGO_TARGET_DIR`, because a running
  `tauri dev` held `gitodile.exe`: fmt and clippy clean, 601 passed, 1 ignored.
- Browser harness (Vite dev server, removed afterwards): entrance ends with
  the fill shown and the trace hidden; wink and blink close the eyes when
  frozen mid-cycle; holes show the surface in GitOdile light and dark; fade at
  99% and 100% both show the updated picture.
