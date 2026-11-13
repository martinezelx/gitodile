---
id: 192
title: Keep the console ASCII mascot alive and reveal a compact watermark
status: done
priority: normal
type: feature
areas:
  - frontend
  - console
created: 2026-10-21
completed: 2026-10-21
parent:
queue:
---

# Goal

Implement the user-approved ASCII reveal from the console design exploration.

# User outcome

The welcome mascot blinks like Home. After the first submitted command, a
small, faint copy reveals itself by rows in the bottom-right corner and stays
there while the transcript scrolls, with its feet fully visible.

# Context

On 2026-10-21 the user chose **Revelado ASCII**, the fourth animation in the
interactive prototype, and explicitly requested implementation for iteration.
This direct request selects this task ahead of the existing queued work.

# Scope

- Natural ASCII eye frames, with Home's uneven blink and occasional double.
- Approximately 170px watermark at 20% opacity in light themes and 16% in dark
  themes, with its local character rain ending on the feet's last row.
- One row reveal per transition from the empty transcript; clear restores welcome.
- Full-width, selectable output above a decorative, non-interactive watermark.
- Lifecycle suspension, reduced motion, and a safe inset/padding for the feet.

# Out of scope

- Other prototype transitions or user-selectable animation settings.
- Git commands, permissions, IPC, dependencies, release metadata or publishing.

# Acceptance criteria

- [x] Welcome eyes blink without shifting the drawing or prompt.
- [x] Typing alone keeps the welcome; a submitted entry reveals the watermark.
- [x] Results and later commands preserve the same watermark instance.
- [x] Clear and Ctrl+L restore welcome with the same row reveal; a later command
  reveals the watermark again.
- [x] Disabling welcome also removes the watermark.
- [x] Hidden and reduced-motion states stop decorative motion.
- [x] Feet remain complete above the footer, including short/narrow panes.
- [x] Rain and the last foot row share a ground above the protective padding.
- [x] Tests, visual validation and `pnpm run check` are recorded honestly.

# Relevant files

- [Design direction](../../../DESIGN.md)
- [Console screen](../../../src/features/console/ConsoleScreen.tsx)
- [Console artwork](../../../src/features/console/mascotArt.ts)

# Dependencies

None.

# Decisions

Use CSS animation with precomputed eye glyphs; no per-frame React updates or
timers. Keep decorative art outside the scrolling/selectable log. Respect the
existing welcome preference rather than adding another setting.

Only presentation changes: Git operation classification and behavior are unchanged.
Work stays on the existing release branch. OS font metrics require padding under
the last ASCII row; character art must not share the rain's clipping mask.

During implementation the user requested stronger visibility, the same reveal
when Ctrl+L brings the mascot home, and a clear shared ground for the feet and
falling characters. These are part of this task's first iteration.

# Implementation notes

- `ConsoleMascot.tsx` owns the memoized drawing, seeded rain, row wrappers and
  small eye patches. Generated artwork stays untouched; CSS animates the eyes
  on Home's existing 17-second cadence.
- `ConsoleScreen.tsx` renders the watermark once outside the log's scroll area.
  Entry updates retain it; emptying the transcript unmounts it. Both appearances
  receive screen lifecycle state and share the welcome preference.
- `console.css` reveals the rows at 9ms intervals, settles the drawing over
  520ms, halves rain speed in the watermark, and keeps a 24px inset plus two
  spare glyph rows under the feet. A size container on the decorative overlay
  fits short panes without changing the text's width or layout.
- The same entrance applies when the welcome remounts on clear/Ctrl+L. Rain's
  clipping box ends on the last foot row, excluding the protective padding.
  Watermark opacity is 20% for light schemes and 16% for dark schemes; explicit
  theme classification takes precedence over the device's scheme.
- DESIGN.md owns the new behavior and the existing small-art typography
  exception now covers both sizes. README.md describes the capability.
- No native services, Git execution policy, settings schema, dependencies,
  repository reads or remote calls were added.

# Validation

- `pnpm exec vitest run src/features/console/ConsoleScreen.test.tsx
  src/features/console/mascotArt.test.ts`: 36 tests passed.
- `pnpm exec vitest run src/architecture/styleComposition.test.ts`: 24 passed.
  The first aggregate run caught literal leading values and the new art-size
  selectors; leading now uses the shared token, and the documented drawing
  exception explicitly includes the two art selectors.
- After the user's refinements, `pnpm exec vitest run
  src/features/console/ConsoleScreen.test.tsx src/features/console/mascotArt.test.ts
  src/architecture/styleComposition.test.ts`: 61 passed.
- Ad hoc Playwright harness against the real Vite-rendered React component and
  production CSS, with the console port mocked (no Git commands): passed blink
  frame visibility, submission/reveal/clear, retained watermark, scroll anchoring,
  lifecycle pause, system/app reduced motion and welcome preference. Feet fit at
  1180x760, 900x620, 520x480 and 320x320, including the shortcut pane. Populated
  help used 524 descendants against the screen's 1,000-element budget.
- Extended the visual harness for Ctrl+L's actual in-progress reveal, light/dark
  opacity and the rain/foot baseline in all 12 shipped themes, including a light
  theme selected on a dark device: passed.
- Inspected the already-running Windows Tauri app via Computer Use: the live
  console showed the new bottom-right watermark with complete feet above the
  footer. Existing processes and application settings were left in place.
- Native macOS/Linux runs were not performed; layout uses the shared monospace
  stack and CSS, without OS-specific commands or filesystem changes.
- Windows initially locked `target/debug/gitodile.exe` while the native app was
  open. Renamed that generated binary to `gitodile-running-192.exe` within the
  same ignored build directory so the existing process/session stayed open
  while Cargo could replace its build output. No source or user files moved.
- The standalone native suite passed 620 unit tests (one pre-existing ignored
  test) plus one integration test. An intermediate aggregate run with concurrent
  native tests hit two 5-second App focus timeouts; the final frontend run with
  the latest refinements passed all 1,575 tests. The final aggregate uses
  `RUST_TEST_THREADS=4` to bound native test concurrency on this Windows host.
- Final `RUST_TEST_THREADS=4 pnpm run check`: passed. Documentation, architecture,
  TypeScript, 1,575 frontend tests, production build, Rust formatting, Clippy,
  620 native unit tests (one ignored) and one native integration test passed.
  Vite reported the existing application's entry chunk above its 500kB warning
  threshold; the build succeeded and the warning threshold was not changed.
