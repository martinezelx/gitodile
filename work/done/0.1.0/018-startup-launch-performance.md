---
id: 018
title: Faster, flash-free app launch
status: done
priority: normal
type: chore
areas:
  - frontend
  - desktop
  - tooling
created: 2026-07-28
completed: 2026-07-28
---

# Goal

Remove the few moments of blank window the user sees on launch, in both
`tauri dev` and the built `.exe`, and reduce real launch-time work where
possible — not just mask the flash.

# User outcome

Launching GitOdile (dev or the packaged app) no longer shows a blank/white
window before the UI appears; the app also has a smaller initial JS payload
and a smaller installed binary to load from disk.

# Context

Reported directly by the user: "al arrancar la app, se queda por unos
momentos en blanco como cargando... para cuando lo enchufo en tauri dev pero
al hacer el build y crear el exe también pasa." Investigated and found the
main window was created visible by default, so the OS-level window appeared
before the webview had loaded and React had mounted — a blank frame followed
by the real UI popping in. Separately, the production bundle was a single
608 KB (gzip 189 KB) JS chunk, and the release binary carried default Rust
release-profile settings (no LTO, no strip, opt-level 3), both adding to the
work done before first paint.

# Scope

- Hide the main window until the first UI frame has actually painted, then
  show it.
- Split rarely-needed-at-launch frontend code (Changes screen, publish
  dialog, pending-versions section, and the ~70-icon file-type set they pull
  in) out of the initial JS chunk, and prefetch it in the background once the
  app is idle so normal navigation afterward is unaffected.
- Tune the Rust release profile for a smaller, faster-to-load binary.

# Out of scope

- A dedicated splashscreen window — Tauri's own guidance treats that as
  "admission of defeat" that the app itself isn't fast enough; not pursued.
- Bundling a Fixed Version WebView2 runtime on Windows (avoids depending on
  the system Evergreen runtime, but meaningfully bloats the installer) —
  flagged as a possible future option, not applied.
- Any change to runtime behavior once the app is open (git status/diff
  parsing, batching, etc.) — out of scope for a launch-time task.

# Acceptance criteria

- [x] Main window is created hidden and only shown after the frontend has
      painted (both `tauri dev` and a built `.exe`).
- [x] Production JS entry chunk is meaningfully smaller than before.
- [x] Deferred code (Changes/Publish/pending versions) is prefetched during
      idle time so normal use after launch sees no extra latency navigating
      to those screens.
- [x] Release binary is smaller after the Cargo profile change.
- [x] `tsc -b`, `vitest run`, `vite build`, and `cargo test --release` all
      still pass.

# Relevant files

- `src-tauri/tauri.conf.json`
- `src-tauri/src/lib.rs`
- `src-tauri/Cargo.toml`
- `src/main.tsx`

# Dependencies

None.

# Decisions

- **Hide-then-show over a splashscreen window.** Tauri's official
  splashscreen guide (`https://v2.tauri.app/learn/splashscreen/`) explicitly
  frames a splashscreen as a fallback for an app that can't load fast enough,
  recommending instead to launch straight into the main window. Matched that
  guidance rather than adding a second window.
- **Two `requestAnimationFrame` calls, not a fixed delay, gate showing the
  window.** A `setTimeout` guess would either flash too early on a slow
  machine or add unnecessary delay on a fast one; two rAFs is the standard
  guarantee that the browser has actually composited a frame.
- **`React.lazy` + idle-time prefetch, not a plain dynamic import on click.**
  A pure on-demand import would introduce a small first-navigation delay the
  user explicitly asked about; prefetching during `requestIdleCallback` (with
  a `setTimeout` fallback) warms the chunk in the background after first
  paint, so normal use is unaffected while the initial chunk still ships
  without that code.
- **`opt-level = "s"`, not `"3"`, for the release profile.** GitOdile's
  runtime cost is dominated by spawning and waiting on `git` subprocesses
  (I/O-bound), not Rust-side computation, so trading peak CPU optimization
  for a smaller binary was judged a safe, effectively free trade. Documented
  as the one change in this task that is not purely launch-time — it applies
  to all Rust code, including diff-parsing during normal use — flagged to the
  user explicitly rather than glossed over.
- **`panic = "abort"` accepted** per Tauri's own size-optimization guidance;
  no code in this app relies on unwinding across a panic.

# Implementation notes

- `src-tauri/tauri.conf.json`: main window now has `"visible": false`.
- `src-tauri/src/lib.rs`: added `show_main_window` (uses `tauri::Manager` to
  look up the `"main"` webview window and call `.show()` + `.set_focus()`),
  registered in `invoke_handler`.
- `src/main.tsx`: after `ReactDOM.createRoot(...).render(...)`, two nested
  `requestAnimationFrame` calls invoke `show_main_window` (guarded by
  `"__TAURI_INTERNALS__" in window` so it's a no-op outside Tauri, e.g. in
  tests). `ChangesPanel`, `PublishDialog`, and `PendingVersionsSection` were
  converted from static imports to `React.lazy(() => import(...).then(...))`
  (each is a named, not default, export) and wrapped in `Suspense`; a new
  `ViewLoadingFallback` component (reusing the existing
  `empty-state__icon--loading` spin animation) is the fallback for the
  Changes view specifically, since it's the one full-screen swap a user could
  plausibly hit before the idle prefetch finishes. `PublishDialog` already
  returns `null` when `isOpen` is false, so its `Suspense` fallback staying
  `null` has no visible effect. A `prefetchLazyPanels` function (three
  `import()` calls) runs via `requestIdleCallback({ timeout: 2000 })`, or
  `setTimeout(..., 1000)` where unavailable.
- `src-tauri/Cargo.toml`: added `[profile.release]` with `codegen-units = 1`,
  `lto = true`, `opt-level = "s"`, `panic = "abort"`, `strip = true`.
- Production bundle: single 607.68 KB (gzip 188.66 KB) chunk became a
  296.19 KB (gzip 87.64 KB) entry chunk plus separate `changes` (300.15 KB),
  `publishDialog` (9.28 KB), and `pendingVersions` (4.62 KB) chunks loaded on
  demand/prefetch.
- Release binary: `gitodile.exe` went from 9.8 MB to 3.4 MB.

# Validation

- `pnpm run typecheck` (`tsc -b --pretty false`) — pass, after each frontend
  change.
- `pnpm run test` (`vitest run`) — pass, 71 tests.
- `pnpm run build` (`tsc -b && vite build`) — pass; used to confirm the chunk
  split and measure bundle sizes before/after.
- `cargo check` (in `src-tauri/`) — pass, after each Rust change.
- `cargo build --release` (in `src-tauri/`) — pass, ~4m; used to measure the
  binary size before/after the profile change (9.8 MB → 3.4 MB).
- `cargo test --release` (in `src-tauri/`) — pass, 129 tests; confirms
  `panic = "abort"` introduces no regressions.
- No live Tauri `tauri dev`/packaged-`.exe` visual verification was performed
  by the agent in this session; the user tested the window-visibility change
  directly ("lo he probado y parece que carga mucho más rápido") and it is
  reflected here as user-confirmed rather than agent-verified.
