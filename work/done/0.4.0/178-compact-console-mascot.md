---
id: 178
title: Restore the compact console mascot footprint with the v5 drawing
status: done
priority: normal
type: bug
areas:
  - frontend
  - design
created: 2026-10-16
completed: 2026-10-16
parent:
queue:
---

# Goal

Keep the v5 console mascot at roughly the compact size of the v4 welcome.
The user explicitly requested this task and its immediate implementation.

# Context

The v5 change raised sampling from 64 to 96 columns while lowering the font
from 7px to 6px. After trimming, v4 was 64 by 34 characters and v5 was 94 by
49: about 26% wider and 24% taller at the same monospace font metrics.

# Scope

- Restore 64-column sampling and 7px text with line-height 1.
- Regenerate the ASCII, tone and silhouette-cover arrays from the v5 source.
- Update the design documentation and verify the console artwork.
- Follow-up requested by the user: compact the adjacent summary frames and
  theme palette to balance the smaller mascot.

# Acceptance criteria

- [x] The console uses the v5 drawing at the compact v4 footprint.
- [x] Generated art, tone and cover arrays remain aligned; rain stays behind it.
- [x] The design documentation records the sampling and display size.
- [x] Run `pnpm run check` and record the result.
- [x] Summary frames and palette match the compact mascot at normal text size
  while keeping the text size and allowing larger text and long values to grow.

# Relevant files

- [Generator](../../../scripts/icons/mascot.mjs)
- [Generated art](../../../src/features/console/mascotAscii.ts)
- [Console styles](../../../src/features/console/console.css)
- [Design](../../../DESIGN.md)

# Decisions

Restore the prior sampling and font size rather than shrinking 96 columns
into smaller glyphs. Keep the v5 source, theme colours and rain behavior.
This is a frontend-only change using the same generated data on every OS.

# Implementation notes

The regenerated v5 art is 62 columns by 33 rows after trimming. At 7px and
line-height 1 its nominal height is 231px, close to v4's 238px, compared with
294px before this fix. Only the console's generated arrays change; the SVGs,
application icons and shared React artwork remain identical after generation.

Added a regression test bounding the welcome art to 64 columns and 34 rows.
Existing tests check rectangular text, aligned tone/cover masks, white holes,
run reconstruction and rain bounds.

Follow-up: summary rows use snug leading without reducing font size, frames
use 8px/12px/6px padding, and the frame/palette gaps are 12px. The palette
dots shrink from 14px to 10px with 4px gaps and stay aligned with the row
icons. The summary's minimum width drops from 44ch to 40ch and its gap to
the mascot from 24px to 16px. No fixed height, transform or overflow clipping
is introduced.

# Validation

- `node scripts/icons/mascot.mjs`: regenerated source successfully.
- `git diff --check`: passed.
- Windows Tauri dev app, already running at localhost:1420: opened Console,
  visually checked the compact silhouette, eyes, teeth, belly and rain in
  GitOdile Light and Dark. The summary and prompt remain clear beside/below
  the art. Restored the original light theme. No Git commands were run in
  the console. macOS and Linux were not exercised interactively.
- First `pnpm run check`: documentation, icons, architecture, TypeScript,
  1,537 frontend tests, build, Rust formatting and Clippy passed. Rust tests
  could not replace `target/debug/gitodile.exe` while the dev app was open
  (Windows error 5). Closed the app through its normal window close control.
- Second `pnpm run check`: passed with exit code 0, including 143 frontend
  test files / 1,537 tests and 605 Rust tests. Vite retains its existing
  advisory about chunks over 500kB. Git fixture line-ending warnings are
  non-failing.
- Follow-up Windows Tauri dev validation: checked the compact summary and
  palette in GitOdile Dark and Light; restored Dark and closed the dev window
  before Rust tests to release the Windows executable lock. At normal text
  size the palette sits near the mascot's base and the text size is unchanged.
- Follow-up `pnpm run check`: passed with exit code 0, including 1,537 frontend
  tests and 605 Rust tests, documentation, architecture, build, formatting and
  Clippy. The existing Vite chunk-size advisory and Git fixture line-ending
  warnings remain non-failing.
- Final pre-commit review: no actionable issues found in the generator,
  aligned text/tone/cover arrays, compact CSS, regression test or task state.
  Rechecked the generator with `node scripts/icons/mascot.mjs --check`,
  documentation with `node scripts/check-docs.mjs` and whitespace with
  `git diff --check`; all passed. Re-ran the console/art tests with
  `pnpm exec vitest run src/features/console/mascotArt.test.ts src/features/console/ConsoleScreen.test.tsx`:
  2 files / 32 tests passed. The full Rust run above also retained one
  intentionally ignored test.
