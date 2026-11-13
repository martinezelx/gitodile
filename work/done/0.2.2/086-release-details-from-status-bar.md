---
id: 086
title: Open local release details from the status bar
status: done
priority: normal
type: improvement
areas:
  - frontend
  - accessibility
  - documentation
created: 2026-08-28
completed: 2026-08-28
parent:
queue:
---

# Goal

Turn the status-bar release metadata into the shared entry point for concise,
local release notes while keeping the About dialog ready for a future app
updater.

# Scope

- Make the complete version and lifecycle tag one accessible button.
- Open the existing About dialog from that button.
- Add a bounded, localized summary of the current build to About.
- Keep release metadata in one typed local source rather than hard-coding it in
  the status bar and dialog separately.
- Preserve the existing system diagnostics and About menu entry point.

# Boundaries

- Do not install or configure Tauri's updater plugin yet.
- Do not contact a release server or check for updates automatically.
- Do not invent a full historical changelog; ship only truthful notes for the
  current local build.

# Acceptance criteria

- [x] `v0.1.0 · alpha` has one visible hover/focus target and a precise
      accessible name.
- [x] Activating it opens the same About dialog as the application menu.
- [x] About shows a localized, three-item current-build summary before system
      diagnostics.
- [x] Version, channel, and note identifiers come from one typed release model.
- [x] Keyboard dismissal, focus trapping, diagnostics copy, and narrow-window
      layout still work.
- [x] `pnpm run check` passes.

# Validation

- `pnpm exec vitest run src/app/StatusBar.test.tsx src/app/aboutDialog.test.tsx src/app/App.test.tsx`
  — 45 focused tests passed.
- Visual inspection at 1280×720 and the supported 900×620 minimum confirmed
  the release button, dialog hierarchy, visible close action, and bounded
  scrolling.
- `pnpm run check` — documentation and architecture checks passed; 462 frontend
  tests passed; the production build completed; Rust formatting and Clippy
  passed; 306 Rust tests passed.

# Implementation notes

- `appRelease.ts` is the single local source for the installed version,
  lifecycle channel, and stable release-note identifiers. Opening About never
  contacts a server.
- The status-bar button and application menu both open the existing app-owned
  About state, preserving one focus-trapped dialog and one diagnostics flow.
- Tauri's application updater remains deliberately uninstalled. A future
  updater can compare its manifest against the typed installed release and add
  remote state below the local notes without changing either entry point.
