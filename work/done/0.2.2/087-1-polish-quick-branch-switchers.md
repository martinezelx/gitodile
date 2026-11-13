---
id: 087-1
title: Polish quick branch switcher details
status: done
priority: normal
type: improvement
areas:
  - frontend
  - branches
  - accessibility
  - documentation
created: 2026-08-29
completed: 2026-08-29
parent: 087
queue:
---

# Goal

Finish three interaction and consistency details discovered while using task
087's searchable branch selectors.

# Scope

- Remove the one-sided rule from **See all branches** and use the same
  quiet menu-row treatment as neighbouring actions.
- Keep a portaled selector open while its own results are scrolled, while
  continuing to dismiss it when an ancestor/window scroll would detach it from
  its trigger.
- Show the latest saved-version subject in both Overview and status-bar rows.
- Add focused regression coverage and update the durable design note.

# Acceptance criteria

- [x] The final action has no asymmetric border and retains normal hover/focus
      states.
- [x] Wheel, trackpad, scrollbar-thumb, and keyboard scrolling inside the
      results do not close the selector.
- [x] Scrolling outside the portal still dismisses it before it can drift away
      from the trigger.
- [x] Both variants show the same branch name and latest subject hierarchy.
- [x] Focused checks and `pnpm run check` pass.

# Relevant files

- `src/shared/ui/popupMenu.tsx`
- `src/features/branches/BranchQuickSwitch.test.tsx`
- `src/features/branches/branches.css`
- `DESIGN.md`

# Implementation notes

- Removed the local top border from the final route action. It now uses the
  shared quiet menu-item surface, radius, hover, and focus treatment without a
  one-sided rule.
- Split portal scroll handling into internal and external paths. A results
  scroll remains inside the flyout; a document, window, or ancestor scroll
  still dismisses the fixed panel before its measured anchor can drift.
- Removed the status-only rule that suppressed commit context. Both variants
  now render the same branch-name and latest-subject hierarchy; only the status
  glyph and overall panel dimensions remain compact.

# Validation

- `pnpm exec vitest run src/features/branches/BranchQuickSwitch.test.tsx src/app/StatusBar.test.tsx src/app/App.test.tsx`
  — 40 focused tests passed, including internal-scroll retention, external-
  scroll dismissal, and status commit context.
- UI layout detector — no findings.
- `pnpm run check` — documentation and architecture checks passed; 467 frontend
  tests passed; the production build completed; Rust formatting and Clippy
  passed; 306 Rust tests passed.
