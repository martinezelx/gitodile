---
id: 193
title: Review and finalize the living ASCII console mascot
status: done
priority: normal
type: quality
areas:
  - frontend
  - console
created: 2026-10-21
completed: 2026-10-21
parent:
queue:
---

# Goal

Review the uncommitted implementation of task 192, resolve concrete defects
and worthwhile small improvements, validate the result, and commit it.

# Context

The user approved the visual result and explicitly requested a final review,
a task marked done after validation, and a commit. This request selects this
task ahead of the existing queue; task 192 records the implementation scope.

# Scope

- Review the complete mascot diff, lifecycle behavior, reduced motion, theme
  handling, keyboard flow, layout bounds and tests.
- Fix reproducible issues and keep the approved appearance.
- Record validation and commit the implementation plus the review evidence.

# Out of scope

- Unrelated repository cleanup, new animations or dependencies, Git execution
  policy changes, publishing and remote pushes.

# Acceptance criteria

- [x] Review findings and resolutions are recorded.
- [x] Lifecycle, motion, theme and foot/ground behavior are checked.
- [x] `pnpm run check` passes and documentation is consistent.
- [x] The task is moved to done and the reviewed changes are committed.

# Relevant files

- [Implementation task](192-console-living-ascii-mascot.md)
- [Console mascot](../../../src/features/console/ConsoleMascot.tsx)
- [Console styles](../../../src/features/console/console.css)

# Decisions

Review is bounded to this change. Report detected defects and verification
limits rather than claiming that any software can be proved free of all bugs
or future improvements.

# Review findings

- Reproduced a lifecycle defect in Chromium: a completed CSS entrance restarted
  after the kept-alive screen's ancestor changed from `display: none` back to
  visible. React retained the same element, so the previous identity-only test
  did not detect the restart.
- Retire the entrance class on its own animation end/cancellation and when the
  screen becomes inactive. Child animation events cannot retire it early.
  A fresh mount after clear/Ctrl+L still reveals normally. Reduced-motion
  mounts never queue an entrance, and CSS cancellation also retires one when
  the motion preference changes during it. An active-only OS preference
  listener also covers changes before CSS starts, when cancellation cannot
  fire; its subscription is removed while hidden and on unmount.
- Precompute the two eye patches alongside the existing static rows and rain.
  No frame timers, dependencies, backend changes or new repository reads.
- Reviewed theme scheme precedence, decorative accessibility, full-width text,
  pointer/selection behavior, row timing and foot/rain bounds. No further
  concrete defects found within this change's scope.

# Validation

- Reproduced the screen-revisit bug before the fix, then passed the same
  Chromium/Playwright check with the real React component and production CSS.
- Extended that harness to switch OS reduced motion during an entrance and
  back again. No replay; clear/Ctrl+L still starts a fresh entrance.
- Rechecked blink frames, output scrolling, retained drawing, welcome setting,
  all 12 theme schemes, foot/rain alignment and viewport sizes 1180x760,
  900x620, 520x480 and 320x320, including the shortcut pane: passed.
- Focused frontend run: 65 tests passed before the final OS preference
  regression test was added. The full frontend run includes that test:
  147 files and 1,580 tests passed.
- Production build passed with the existing main-entry chunk size warning.
  Windows browser validation passed; native macOS/Linux validation was not run.
- Final `RUST_TEST_THREADS=4 pnpm run check`: passed (exit 0). Documentation,
  architecture, TypeScript, all 1,580 frontend tests, production build, Rust
  formatting, Clippy, 620 native unit tests (one pre-existing ignored test)
  and one native integration test passed. No native source was changed.
- Commit includes implementation task 192, these review corrections, tests
  and documentation. No further concrete improvements were needed for the
  approved behavior; this is not a claim of exhaustive bug absence.
