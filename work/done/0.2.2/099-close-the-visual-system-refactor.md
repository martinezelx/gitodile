---
id: 099
title: Close the visual-system refactor across the whole app
status: done
priority: high
type: audit
areas:
  - frontend
  - design-system
  - accessibility
  - platform
created: 2026-09-01
completed: 2026-09-01
parent:
queue: "17"
---

# Goal

Audit every shipped GitOdile surface against the settled Friendly Card visual
system, fix all drift left by or introduced after the radius/control-geometry
refactor, and leave one coherent, enforceable component language before release
hardening begins.

# User outcome

Every screen, menu, dialog, popover, button, field, icon control, list row, and
state feels like part of the same application. Users do not encounter an older
square control, an incorrectly rounded icon, mismatched spacing, or an
unpolished secondary surface while moving through an otherwise updated UI.

# Context

Commits `1f9e655` and `e92c2e1` established role-based radii, circular glyph
tiles and action-row icon buttons, and capsules for labelled single-line
controls. Tasks 080, 081, and 083 documented that direction and added useful
CSS guards, but their visual validation could not cover every populated Tauri
surface. Tasks 084–098 then added or substantially changed the status bar,
quick branch switchers, changelog, welcome launcher, recent projects,
message dialogs, application Settings, and per-project Settings.

This is a bounded closure pass over the current product, not a new redesign.
[`DESIGN.md`](../../../DESIGN.md) is the authority: opaque Friendly Card surfaces,
role-based concentric radii, capsules for labelled one-line controls, circles
for square glyph tiles, and the documented distinction between standalone
icon actions and controls attached to a host.

# Scope

- Build an inventory from `src/app/screens.tsx`, `AppOverlays`, shared UI,
  feature-owned panels, and every menu/dialog/popover trigger so hidden and
  secondary surfaces are reviewed as deliberately as the main screens.
- Compare the complete CSS cascade with the rules from tasks 081 and 083;
  inspect radius role, shape, height, inline padding, alignment, border,
  elevation, focus, hover, pressed, selected, disabled, loading, and error
  treatments rather than treating token usage alone as proof of consistency.
- Review the titlebar, navigation rail and jump menu, project switcher and add
  menu, status bar and quick switcher, command palette, Overview, Changes,
  Branches, History, Settings, per-project Settings, welcome/recents launcher,
  Changelog/About, and every save/publish/sync/clone/create/discard/close
  dialog that can currently be opened.
- Exercise representative populated, empty, loading, success, warning, error,
  disabled, long-content, overflow, and unavailable states. Use real temporary
  repositories where cached or browser-only data would hide the true desktop
  layout.
- Fix every in-scope inconsistency found. Prefer existing tokens and shared
  primitives; consolidate repeated styling only when the components genuinely
  share semantics and behavior.
- Strengthen focused tests or style-composition guards for every reusable class
  of defect found, so the same shape/geometry drift cannot return silently.
- Update `DESIGN.md` only when the implementation exposes a missing durable
  rule; do not duplicate settled design guidance in this task.
- Perform one bounded visual inspection round across the required matrix, fix
  the findings in one batch, then run one confirmation round.

# Out of scope

- Replacing the Friendly Card direction, introducing a new visual language, or
  changing the brand palette, typography, information architecture, or product
  vocabulary without a separate approved task.
- Adding new Git capabilities or redesigning workflows that do not need to
  change to resolve a visual, interaction-state, responsive, or accessibility
  inconsistency.
- Polishing screens that do not exist yet. New conflict, recovery, restore,
  integration, and set-aside surfaces remain responsible for adopting the
  established system when their owning tasks implement them.
- Claiming release readiness, native parity, or broad accessibility
  conformance; task 065-8 owns the final platform and release evidence.
- Large-scale component extraction for its own sake or a dependency/UI
  framework migration.

# Acceptance criteria

- [x] A checked inventory maps every registered screen, eager overlay, dialog,
      flyout/menu/popover, shell region, and shared control family to visual
      evidence or an explicit reason it cannot currently be reached.
- [x] No shipped labelled single-line button, input, search field, select,
      selector, or trigger uses the old intermediate rounded-rectangle shape;
      every documented exception is still semantically justified.
- [x] Square glyph tiles are circular, standalone square icon actions follow
      the action-row rule, and icon controls attached to a host retain the
      documented subordinate shape consistently.
- [x] Nested surfaces, rows, segmented controls, menus, and dialogs use the
      correct role tokens and remain visually concentric at their real computed
      sizes; no raw radius or one-off color/shape value bypasses the system.
- [x] Control height, inline padding, icon/text alignment, gaps, focus rings,
      and hover/pressed/selected/disabled/busy states are coherent across shared
      and feature-owned variants without reducing comfortable pointer targets.
- [x] Menus, popovers, dialogs, scroll/overflow states, destructive actions,
      and secondary/quiet actions retain clear hierarchy and are not visually
      mistaken for cards, links, primary actions, or unavailable controls.
- [x] The audited surfaces pass a bounded visual matrix in light and dark
      themes, English and Spanish, keyboard-only navigation, reduced motion,
      forced colors, 1024px minimum window width, constrained window height,
      200% zoom, and coarse-pointer sizing where applicable.
- [x] Empty, populated, loading, success, warning, error, disabled, long-label,
      long-path, overflow, detached-branch, and not-yet-saved states receive
      representative coverage without clipping, accidental wrapping in
      capsules, obscured focus, or unreachable actions.
- [x] Reusable defects found during the audit have focused regression tests or
      architecture/style guards; existing virtualization, keep-alive lifecycle,
      keyboard behavior, and feature ownership remain intact.
- [x] The final task notes record the exact surfaces and states inspected,
      before/after findings, any intentionally accepted exceptions, and the
      two bounded visual-verification passes.
- [x] `pnpm run check` passes after the fixes.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/PRODUCT_STRATEGY.md`
- `docs/ARCHITECTURE.md`
- `src/app/screens.tsx`
- `src/app/AppOverlays.tsx`
- `src/app/app-shell.css`
- `src/shared/ui/primitives.css`
- `src/styles/tokens.css`
- `src/architecture/styleComposition.test.ts`
- `src/features/`
- `work/done/0.1.0/080-polish-overview-project-summary.md`
- `work/done/0.1.0/081-radius-roles-not-sizes.md`
- `work/done/0.2.2/083-capsule-single-line-controls.md`

# Dependencies

Tasks 080, 081, and 083 define the visual system being audited. Run this task
after the remaining functional UI tasks and task 065-7, and before task 065-8,
so the closure pass covers the release-candidate surface without claiming the
release gate itself.

# Decisions

- **Audit and fix, not report only.** Completion means the inconsistencies are
  resolved and guarded, not merely listed for later work.
- **The current design is the authority.** This pass preserves the Friendly
  Card direction and tests actual computed UI against it; it does not reopen
  settled aesthetic decisions.
- **Secondary surfaces are first-class scope.** Menus, popovers, dialogs,
  overlays, contextual actions, and exceptional states are the likeliest place
  for pre-refactor styling to survive, so the inventory must begin from
  reachability rather than from a short list of primary screens.
- **Actual desktop evidence is required.** Browser-only rendering is useful for
  component states but cannot prove populated Tauri flows, native window
  chrome, or repository-backed layouts.
- **One bounded correction cycle.** Inspect the full matrix once, correct all
  findings together, confirm once, and stop instead of polishing indefinitely.

# Implementation notes

Completed as one bounded audit/correction cycle against the existing Friendly
Card rules. The audit began from `screens.tsx`, `AppOverlays`, feature-owned
containers, shell regions and the shared UI layer rather than from CSS token
searches alone.

## Checked surface matrix

| Family | Runtime evidence and representative states |
| --- | --- |
| Shell | Native Windows titlebar, expanded/collapsed navigation, More flyout, project switcher/add menu, status bar and upward-opening quick branch switcher; narrow 1022 x 614 and maximized layouts |
| Primary screens | Overview, Changes, Branches and History with the repository-backed populated fixture; loading, long file/ref names, scrolling and selection states |
| Global/application surfaces | Empty welcome/recents launcher, command palette keyboard navigation, About, shortcuts, changelog and all six application Settings sections |
| Project surfaces | Remote, ignored files and identity project Settings in loading and populated states |
| Mutations and safety | Save-version validation, publish preview and divergent error, get-team-changes preview, discard preview, create/switch/delete branch dialogs, close-project confirmation, clone and create-local-project dialogs |
| Repository exceptions | Unborn project, detached HEAD, ahead, behind, divergent, clean, dirty, invalid-folder error and long-content fixtures |
| Accessibility/variants | Light/dark, English/Spanish, keyboard-only palette, forced colors active, reduced motion, 200% OS text scale, disabled/busy/error/success/warning states |

Coarse-pointer hardware was not attached to this Windows desktop. The audited
controls instead retain the existing coarse-pointer media rules, and the new
style guards require the 44 px minimum target geometry used by compact shell
and feature controls. This is the one matrix cell covered by computed/source
evidence rather than a physical pointer device.

## Findings and corrections

- Reassigned old intermediate radii to their semantic roles: capsules for
  labels and chips, circles for square glyph tiles/nodes, and surface radii for
  nested confirmation content.
- Made menu and popover insets concentric, removed a one-sided footer divider,
  and aligned compact footer/menu actions to the shared 44 px target floor.
- Extended comfortable pointer targets across the titlebar, navigation,
  project switcher, settings, history, changes and branch surfaces.
- Removed the generic `nav` styling escape hatch, the sidebar layout
  transition, and non-semantic pointer cursors; the save-version disclosure is
  the sole intentional link-like cursor exception.
- Fixed two runtime state leaks found in the first visual pass. A tooltip now
  clears on interaction, scroll/resize, focus loss, visibility change or target
  removal. The command palette closes before an action runs and whenever its
  active-project context changes.
- No durable design rule was missing, so `DESIGN.md` remains the single
  unchanged authority rather than receiving duplicate guidance.

## Bounded visual passes

1. **Audit pass:** exercised the full matrix above in the real Tauri debug app
   backed by temporary Git repositories. Findings were collected without
   iterative spot-polishing.
2. **Confirmation pass:** rechecked the corrected palette/tooltip lifecycles,
   compact More and quick-switch flyouts, constrained welcome launcher,
   project restoration and final populated Overview. No additional visual
   correction round was needed.

# Validation

- Visual runtime: Windows 11, Tauri 2 debug shell and Edge WebView2. No claim is
  made for macOS or Linux visual verification.
- Focused regression run:
  `pnpm exec vitest run src/shared/ui/tooltip.test.tsx src/app/appShell.test.tsx src/architecture/styleComposition.test.ts`
  — 3 files, 18 tests passed.
- Frontend gate while iterating: `pnpm run check:frontend` — architecture,
  TypeScript, 65 test files / 575 tests, and production build passed.
- Static detector/style composition: no remaining raw-radius, generic-nav,
  layout-transition, cursor-role, menu-inset or reusable control-shape finding;
  `git diff --check` passed (Git reported only existing line-ending notices).
- Completion gate: `pnpm run check` passed after the task record was moved to
  `work/done/`.
