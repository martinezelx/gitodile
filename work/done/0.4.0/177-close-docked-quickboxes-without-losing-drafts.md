---
id: 177
title: Close the Changes and Branches quickboxes without losing drafts
status: done
priority: normal
type: design
areas:
  - frontend
  - ux
created: 2026-10-16
completed: 2026-10-16
parent:
queue:
---

# Goal

Give the save-version composer in Changes and the create-branch composer in
Branches a small, consistent close button that folds them without losing work.

# User outcome

People can close either expanded quickbox with a visible X or Escape, then
return to the same draft and options with a click or the keyboard.

# Context

The user requested a small X in both quickboxes and approved placing it at
the right of the existing plan/source row. Previously, Escape folded the
composers and cleared their drafts; closing should preserve what was typed.

# Scope

- An expanded-only Lucide X alongside the plan or source selector.
- Shared compact close styling, localized accessible names and Close tooltips.
- X and Escape preserve the draft and options and refuse closing while busy.
- Explicit focus placement and inactive hidden fields when folded.
- Tests and the durable interaction rule in [DESIGN.md](../../../DESIGN.md).

# Out of scope

- Changing Git operations, the save dialog or the quick-switch popup.
- Persisting branch-name drafts across application restarts.

# Acceptance criteria

- [x] Both expanded composers show the same quiet X in their top-right corner.
- [x] The compact row remains available after closing.
- [x] X and Escape retain the text and options.
- [x] Closing is disabled during saving or branch creation.
- [x] Clicking or tabbing back to the field reopens the composer.
- [x] Folded header and extra controls are inert and cannot receive focus.
- [x] Existing scroll anchoring and quick-switch behavior remain covered.
- [x] Light and dark appearance and the actual desktop flow were checked.

# Relevant files

- `src/features/changes/QuickCommitBox.tsx` and its tests/translations.
- `src/features/branches/BranchQuickCreateBox.tsx` and its
  tests/translations.
- `src/shared/ui/primitives.css`.
- `DESIGN.md`.

# Dependencies

None.

# Decisions

- Reuse the existing header row and shared composer styling. The X is 14px
  inside a 32px transparent target with the item radius; coarse pointers get
  the existing 44px tier.
- Closing preserves text and choices. Escape follows the same behavior.
- Focus moves to the composer before folding, so the disappearing button
  does not lose focus and the field does not reopen immediately.
- The shared branch fields accept an optional close callback; the quick-switch
  frame keeps its own header and behavior.

# Implementation notes

- Both close handlers retain the existing busy guards and scroll anchoring.
- Hidden header and extra content use `inert` to keep keyboard navigation on
  visible controls.
- Changes retains its existing persisted message draft; Branches retains its
  existing component-local name and options.

# Validation

- Focused Vitest run of `QuickCommitBox.test.tsx`,
  `BranchQuickCreateBox.test.tsx` and `BranchQuickSwitch.test.tsx`:
  3 files / 63 tests passed, including a repeat after the focus adjustment.
- `pnpm run check`: passed in full, including documentation, architecture,
  TypeScript, 143 frontend test files / 1536 tests, production build, Rust
  formatting, Clippy, 604 library tests and 1 credential-helper integration
  test; 1 Rust library test was ignored.
- The first aggregate attempt encountered Windows' executable lock while
  development GitOdile was open. Closing it allowed the complete rerun to pass.
- Windows desktop validation checked both composers, retained drafts,
  reopening, keyboard navigation and light/dark appearance. Temporary test
  text was removed without saving a version or creating a branch. The user
  stopped Computer Use during the final application-reopening check.
- `git diff --check`: passed.
- Final review found no actionable defects. A focused repeat including the
  shared composer focus tests and style-composition guards passed: 5 files /
  93 tests. Documentation validation passed over 312 files and 227 task IDs.
