---
id: 071
title: Finish the Slack-style navigation rail
status: done
priority: normal
type: feature
areas:
  - frontend
  - desktop
  - testing
  - documentation
created: 2026-08-24
completed: 2026-08-24
parent:
---

# Goal

Replace the variable-width legacy sidebar with one calm, space-efficient
navigation rail whose destinations, project controls, utilities, overflow, and
personalization behave as one desktop interaction system.

# User outcome

GitOdile keeps the project workspace wide while the rail remains readable and
predictable. Destinations that do not fit move into More instead of scrolling,
projects switch from one stable control, Settings and account stay anchored,
and each person can choose which destinations stay visible and whether the rail
uses labels or icons only.

# Context

The previous sidebar mixed expanded and collapsed layouts, listed projects
directly in the narrow column, separated related actions inconsistently, and
opened its project menus from different vertical origins. Tooltips also covered
nearby rail controls, and a short window required an invisible scrollbar.

The refactor follows Slack's hierarchy and adaptive-overflow principle without
copying its visual assets or shrinking GitOdile's pointer targets. The product
still owns its 88px rounded rail, crocodile mark, vocabulary, project safety
states, and simple/advanced navigation registry.

# Scope

- Replace the expanded/collapsed sidebar pair with one fixed 88px rail.
- Separate brand, project destinations, active-project controls, and app-level
  utilities through spacing and stable placement.
- Keep Overview, Changes, Branches, History, Recovery, and More in registry
  order, moving destinations that do not fit into More without a scrollbar.
- Put the active project behind one searchable rail popover and keep the shared
  add-project menu directly below it.
- Use one portaled flyout placement/dismissal primitive for rail menus so they
  share an origin, escape clipping, restore focus, and support keyboard use.
- Keep Settings above account and remove intrusive tooltips from rail controls.
- Add restrained hover/press/open motion, including the persistent plus-to-X
  state while the add-project menu is open, with reduced-motion support.
- Add Navigation settings for visible destinations and Icons and text / Icons
  only presentation, persisted locally with validation and a section reset.
- Keep deselected destinations reachable through More and preserve accessible
  names in icons-only mode.
- Update English/Spanish copy, the durable design contract, and automated tests.

# Out of scope

- Implementing the Recovery screen or account sign-in.
- Reordering destinations through drag and drop.
- Changing any destination's Git behavior or screen lifecycle.
- Changing the compact navigation used below the narrow-window breakpoint.
- Changing the 88px rail width in icons-only mode.

# Acceptance criteria

- [x] The desktop shell uses one 88px rail with brand, destinations, project
      controls, Settings, and account in the agreed hierarchy.
- [x] Short windows move trailing destinations into More without scrolling,
      and enlarging the window restores them automatically.
- [x] History and Recovery are direct destinations; More contains only
      overflow/deselected destinations plus navigation customization.
- [x] Project, add-project, and More flyouts share correct positioning,
      dismissal, focus restoration, and keyboard behavior without clipping.
- [x] The add-project plus remains an X for the whole open interaction and
      closes from the X, outside click, or Escape.
- [x] Navigation settings persist visible destinations and presentation mode,
      keep hidden destinations in More, and reset to the complete labeled rail.
- [x] Icons-only mode removes labels without shrinking pointer targets or
      accessible names.
- [x] Rail tooltips do not obscure the navigation; disabled controls still
      explain their state to assistive technology.
- [x] English and Spanish layouts, reduced motion, pointer-coarse targets, and
      short-window behavior remain coherent.
- [x] `pnpm run check` passes.

# Relevant files

- `DESIGN.md`
- `src/main.tsx`
- `src/app/RailNav.tsx`
- `src/app/app-shell.css`
- `src/app/preferences.ts`
- `src/projectSwitcher.tsx`
- `src/shared/ui/popupMenu.tsx`
- `src/features/settings/SettingsPanel.tsx`
- `src/features/settings/settings.css`

# Dependencies

Task 070 supplied the shared add-project menu that this rail repositions and
animates.

# Decisions

- **One width, two presentation densities.** Icons only removes label height
  and tightens the vertical gap, but the rail remains 88px and the pointer
  target remains 40px (44px for a coarse pointer). Project controls therefore
  never jump horizontally when the setting changes.
- **Deselected means secondary, not unreachable.** Settings controls what stays
  in the rail; every deselected destination remains in More in registry order.
- **Overflow is measured from rendered content.** A hidden measurement copy and
  `ResizeObserver` use actual translated label heights instead of hard-coded
  viewport breakpoints.
- **One portal contract owns rail flyouts.** Menus escape the clipping sidebar,
  share its outer edge and project-group vertical origin, dismiss on outside
  input/resize/scroll, and restore focus deliberately.
- **No sidebar tooltips.** Visible labels or explicit accessible names carry
  destination meaning; icons-only is a deliberate user choice, not an excuse
  to cover adjacent controls on hover.
- **Local JSON owns navigation preferences.** Membership and display mode are
  validated and written atomically; unknown or duplicate ids cannot corrupt
  the rail.

# Implementation notes

`RailNav` owns the adaptive visible prefix and derives More from the complete
registry, so user-hidden and height-overflowed entries obey the same order and
active state. More stays useful at full height because its final action opens
Navigation settings.

`ProjectSwitcherRail` renders the active project as one square with its safety
badge and opens a searchable, portaled list for switching or closing projects.
Settings and account are stacked at the foot; the add-project trigger remains
directly under the project group.

`usePortalFlyout` centralizes side/below placement, shared rail origins,
focus-first behavior, outside-click/Escape handling, and scroll/resize
dismissal for the project, add-project, and More surfaces.

Navigation preferences are composed above Settings, validated in
`app/preferences.ts`, edited in the Settings feature without importing the
screen registry, and consumed by the rail. The final audit removed the obsolete
collapsed-sidebar storage key, temporary TBD styles/copy, and selectors for the
legacy rail while retaining 44px coarse-pointer targets on the new controls.

# Validation

`pnpm run check` passed: documentation over 123 Markdown files and 91 task ids,
frontend architecture over 283 modules, TypeScript, 416 frontend tests in 50
files, the production build, Rust formatting and Clippy, and 294 Rust tests.

The running Windows desktop app was also checked directly at normal and reduced
heights. Adaptive More, common flyout placement, outside/Escape dismissal,
icons-only presentation, destination visibility, reset behavior, and the
absence of rail tooltips behaved as specified. Default navigation preferences
were restored after the check.

`pnpm run check:docs` passed again after moving this record to `work/done`.
