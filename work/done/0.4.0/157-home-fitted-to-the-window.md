---
id: 157
title: Home fitted to the window — optical centre and continuous scale
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
  - ux
created: 2026-10-10
completed: 2026-10-10
parent:
queue:
---

# Goal

Make Home follow the window the way Overview does since task 156: the
launcher sits at the optical centre of the work area and grows or shrinks with
it, instead of a fixed 720px column pinned to the top.

# User outcome

On a large screen Home no longer looks like a small card stuck to the top of
an empty window. Whatever
size the person gives the window, the greeting and launcher keep their
proportions and sit a little above the middle.

# Context

Home was top-anchored so the greeting would never move while results grew and
shrank under typing, and only a `max-height: 820px` rule shrank the mascot and
greeting. At 1920×1080 and above the block read as undersized and high. The
direction was chosen from an interactive mockup comparing optical centre (2:3)
with exact centre, and a continuous scale with fixed steps.

# Scope

- Split the work area's free height 2:3 above and below the launcher.
- Scale the whole launcher with one factor: `min(width ÷ 1240, height ÷ 800)`,
  kept between 1 and 1.5, rounded to a hundredth.
- Keep the greeting still while typing or browsing an account tab by holding
  the space above at what the rest state had.
- A launcher taller than the area starts at its top and the workspace scrolls.

# Out of scope

- Fitting the number of recent rows to the height (the resting list stays at 5;
  a window shorter than the launcher scrolls).
- Scaling other screens or dialogs.

# Acceptance criteria

- [x] At rest the space above and below the launcher is 2:3.
- [x] The launcher scales continuously with the work area between 1 and 1.5.
- [x] Typing in the field or switching to an account tab does not move the
      greeting; emptying the field returns to the centred rest layout.
- [x] A window shorter than the launcher scrolls instead of clipping.
- [x] Overview's no-project fallback, which renders the same launcher, behaves
      the same way.
- [x] Unit tests cover the scale and the held position.

# Relevant files

- `src/features/home/fit.ts`
- `src/features/home/fit.test.ts`
- `src/features/home/HomeLauncher.tsx`
- `src/features/home/home.css`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- **Optical centre, 2:3.** Exact centre reads as low on a front door; the 2:3
  split puts the block where the eye expects it.
- **Continuous scale through `zoom`.** One factor on the launcher scales type,
  icons, rows, radii and the column's width together, without rewriting every
  size in home.css as `calc(… * var(--s))`. Chromium (WebView2) and WebKit
  (macOS, WebKitGTK) all support `zoom`. The factor is computed in JS because
  CSS cannot divide a length into a number reliably in every webview.
- **Measure only unscaled boxes.** The hook reads the frame and an empty first
  grid row, never the zoomed launcher, so no reading depends on how a webview
  reports a zoomed box.
- **Hold rather than re-centre while typing.** The rest state (empty field,
  Recent tab) owns the position; any other state holds the space above, which
  is recomputed from the resting height only when the window changes.
- **Minimum scale 1.** A first version went down to 0.85, which put micro
  text at 8.5px, under DESIGN.md's 10px floor. The launcher only grows; a
  small window scrolls. The `max-height: 820px` rule that shrank the greeting
  is gone as well, for the same reason.

# Implementation notes

- `fit.ts` exports `homeScale`, `homeTop` and `useHomeFit`. A `ResizeObserver`
  on the frame and the launcher feeds the work area and, at rest, the resting
  height; a hidden screen reports no size and is left alone.
- `HomeLauncher` wraps its content in `.home-launcher__body` (scaled) under an
  unscaled `.home-launcher` frame with an empty `.home-launcher__above` row.
- `DESIGN.md` Home section now describes the fitted layout.

# Validation

- `npx vitest run src/features/home` — 4 files, 74 tests passed.
- Browser at `http://localhost:1420` (welcome screen, no Tauri):
  - 1452×936: scale 0.99, space above/below 138/206 px.
  - 1920×1080: scale 1.17; typing "mi-proyecto" kept the greeting at 163 px
    from the top, and emptying the field returned to the rest layout.
  - 2560×1440: scale 1.5, 248/372 px, launcher 1080 px wide.
  - 960×620: scale 1, 10/14 px, no scroll (36/54 px with the first minimum
    of 0.85).
- `pnpm run check` — documentation, architecture (587 modules), typecheck,
  frontend tests (139 files, 1403 tests) and build passed; `cargo fmt` and
  `cargo clippy` passed. `cargo test` could not relink because a running
  `gitodile.exe` (the dev app) held `src-tauri/target/debug/gitodile.exe`
  ("Acceso denegado", os error 5). The task changes no Rust code.
