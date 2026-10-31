---
id: 008
title: Replace the placeholder application icon
status: done
priority: high
type: feature
areas:
  - frontend
  - desktop
created: 2026-07-25
completed: 2026-07-25
---

# Goal

Replace the temporary OpenMoji crocodile with the supplied GitOdile app mark
as a polished, scalable vector and regenerate every native application icon.

# User outcome

GitOdile has a distinctive, professional icon that remains crisp at every
size and whose monochrome mark can be placed on any background color.

# Context

The user supplied a brand-direction infographic and a small raster reference
for the compact app icon. The current OpenMoji line-art mark is explicitly a
placeholder and must be replaced everywhere at the same time. This task was
approved directly by the user while task 007 was already active.

# Scope

- Reconstruct the supplied compact crocodile mark as a clean SVG.
- Use one adaptable monochrome mark in the sidebar, compact titlebar, and
  About dialog.
- Generate Windows, macOS, Linux, and store icon assets from a branded vector
  source.
- Update the durable design documentation to record the final app mark.

# Out of scope

- The full horizontal logo and wordmark.
- The expressive mascot shown in the infographic.
- Further palette or layout changes.

# Acceptance criteria

- [x] The mark preserves the supplied silhouette, eye placement, and smile.
- [x] The UI mark inherits its foreground color and reveals any background
      through its facial cutouts.
- [x] Every placeholder OpenMoji instance and attribution is removed.
- [x] Tauri icon assets are regenerated from the new SVG source.
- [x] The mark remains legible in the smallest generated native icon.
- [x] Required frontend and Rust validation commands pass.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/PRODUCT_STRATEGY.md`
- `src/assets/gitodile-mark.svg`
- `src/main.tsx`
- `src/styles.css`
- `src-tauri/icons/source.svg`

# Dependencies

None.

# Decisions

- The reusable mark is a single-color silhouette with true transparent
  cutouts, so it can inherit any foreground/background pairing.
- The native app icon uses the fixed brand-lime rounded tile and a dark mark;
  transparent outer corners preserve platform-appropriate icon shaping, while
  the facial cutouts reveal the tile color.

# Implementation notes

- Added `src/assets/gitodile-mark.svg` as the reusable monochrome source for
  the UI. CSS masking makes the mark inherit `currentColor` while the eye and
  smile cutouts reveal the surface underneath.
- Replaced the inline OpenMoji drawing in `src/main.tsx`; the sidebar, compact
  titlebar, and About dialog now share the same vector asset.
- Scoped the sidebar tagline styles to a dedicated `.brand-copy` wrapper so
  they cannot override the mark's dark brand color in either theme.
- Added a dedicated `--brand-mark-foreground` token so the decorative in-app
  crocodile uses warm pearl in light mode and dark ink in dark mode without
  changing the accessible contrast color used by primary actions.
- Rebuilt `src-tauri/icons/source.svg` as the brand-lime rounded application
  tile with a dark mark and regenerated all existing Windows, macOS, Linux,
  and Appx icon files with the Tauri icon generator. A follow-up review
  confirmed that the native tile should use the same fixed brand lime as the
  in-app surfaces.
- Visually verified the brand mark in the live app in light and dark themes,
  in the About dialog, and below the 800px compact breakpoint. Also inspected
  the generated 32px, 64px, and 512px native assets.
- Updated `DESIGN.md` to replace the temporary OpenMoji guidance with the
  durable application-mark specification.

# Validation

- Historical UI scan — passed with no findings.
- `pnpm run typecheck` — passed.
- `pnpm run test` — passed, 13 tests across 2 files.
- `pnpm run build` — passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — passed.
- Parsed both SVG sources as XML and verified the generated PNG dimensions
  and RGBA color mode.
