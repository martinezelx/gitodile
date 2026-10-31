---
id: 076
title: Polish History timeline motion across History and Overview
status: done
priority: normal
type: improvement
areas:
  - frontend
  - history
  - overview
  - accessibility
created: 2026-08-25
completed: 2026-08-25
parent:
queue:
---

# Goal

Give the saved-version timeline a restrained, directional motion language and
make the compact Overview history use the same node and connector geometry as
the full History screen.

# User outcome

Moving through saved versions now has a clear sense of direction. Timeline
nodes remain clean and readable, respond gently before selection, and use the
same continuous center-aligned connector in History and Overview.

# Scope

- Remove the inner dot from selected and unselected timeline nodes.
- Add a low-cost breathing response while an unselected node is hovered or
  keyboard-focused.
- Animate one short energy trace toward the active or hovered node.
- Derive upward/downward travel from the previous selected or hovered row.
- Fill Overview nodes on hover/focus and match the full History node scale,
  timing, line intensity, and interaction language.
- Join Overview connectors exactly from one node center to the next, including
  the row gap and half-pixel alignment required by a one-pixel line.
- Disable the nonessential motion under `prefers-reduced-motion`.

# Decisions

- Use CSS transforms, opacity, and bounded shadows rather than canvas, SVG
  animation, filters, a motion dependency, or per-frame JavaScript.
- Track only the last selected and hovered row. Pointer entry triggers one
  React state update; no animation work remains active after interaction ends.
- Keep the full History selection as the only persistent filled state.
  Overview fills a node only while it is hovered or focused, then opens the
  selected version in History.
- Draw Overview's one-pixel connector at `17.5px`, whose center is the node's
  exact `18px` horizontal axis. Its vertical span runs from `50%` of one row to
  `50%` of the next row.

# Acceptance criteria

- [x] Timeline nodes contain no decorative inner dot.
- [x] Unselected History nodes breathe only while hovered or focused.
- [x] Overview nodes fill completely while hovered or focused.
- [x] Moving down through rows sends the trace downward; moving up sends it
      upward in both History and Overview.
- [x] Overview connectors form one continuous line through every node center.
- [x] Reduced-motion users receive the same static states without the trace,
      halo, arrival, or breathing animations.
- [x] Directional behavior is covered by focused frontend tests.

# Relevant files

- `src/features/history/HistoryPanel.tsx`
- `src/features/history/HistoryPanel.test.tsx`
- `src/features/history/history.css`
- `src/features/overview/HistorySummarySection.tsx`
- `src/features/overview/HistorySummarySection.test.tsx`
- `src/features/overview/overview.css`

# Validation

- Focused History and Overview suites passed: 2 files, 19 tests.
- TypeScript project build and `git diff --check` passed after the final
  center-alignment adjustment.
- The aggregate gate passed before the final CSS-only half-pixel alignment:
  documentation and architecture checks, 431 frontend tests, production build,
  Rust formatting and Clippy, and 297 Rust tests.
- A later aggregate rerun encountered Vitest worker-start timeouts in unrelated
  Changes, app-shell, context-menu, theme, project-session, branch, and
  clone tests after the runner stalled for approximately 49 minutes. No
  assertion related to History or Overview failed; the focused suites remained
  green.

