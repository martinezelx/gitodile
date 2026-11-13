---
id: 109
title: Let people turn off interface motion
status: done
priority: normal
type: feature
areas:
  - frontend
  - accessibility
  - documentation
created: 2026-09-03
completed: 2026-09-03
parent:
queue:
---

# Goal

Add an app-level reduced-motion preference for people who want GitOdile to
show state changes without animated movement.

# User outcome

Appearance settings now includes **Reduce motion**. It is off by default, so
GitOdile keeps its full motion language until someone deliberately turns it
on. Once enabled, transitions, keyframe animations and smooth scrolling stop
throughout the interface. The operating system's reduced-motion preference
continues to work independently.

# Context

GitOdile already had intentional `prefers-reduced-motion` alternatives for its
larger animations, but there was no in-app override. The request was for an
explicit setting that keeps all animations by default and lets a person turn
them off without changing an operating-system preference.

The completed motion inventory covered 41 animation declarations, 92
transition declarations, 20 keyframe definitions, the browser View Transition
used for theme changes and the notification bell's React-managed animation.
`requestAnimationFrame` uses were also inspected; the remaining calls schedule
focus, paint measurement or first-window presentation rather than visual
motion.

# Decisions

- **The preference is additive to the system setting.** Turning it on always
  removes GitOdile's movement. Leaving it off does not override an operating
  system request for reduced motion.
- **The default remains live rather than stored.** The value defaults to
  `false`, and local storage receives an entry only after the user changes it,
  following the existing preference contract.
- **One root attribute owns CSS motion.** `data-reduced-motion="true"` disables
  animations, transitions and smooth scrolling for every rendered descendant
  and pseudo-element, so a future component does not need to remember a second
  local media query merely to honor the app setting.
- **JavaScript checks the same signal.** The notification bell does not start
  an animation whose `animationend` cleanup could never run, and theme changes
  skip the View Transition API entirely while motion is reduced.
- **Turning motion off is immediate.** A theme transition already in flight is
  explicitly stopped because browser-owned View Transition snapshots are not
  descendants covered by the root CSS selector.
- **State remains visible.** The preference removes movement, not loading,
  selection, expanded, success or error states.

# Scope

- Add the bilingual Appearance setting and accessible switch.
- Persist an explicit choice locally, with full motion as the unstored default.
- Apply the preference before paint through the app composition root.
- Cover CSS motion, theme View Transitions and the notification bell.
- Keep `prefers-reduced-motion` behavior intact.
- Update current-capability and design documentation.
- Add preference, component, architecture and JavaScript-animation tests.

# Out of scope

- Changing the duration or easing of animations when full motion is enabled.
- Replacing progress indicators with a separate reduced-motion visual system.
- Changing the operating system's accessibility settings.

# Acceptance criteria

- [x] Reduce motion appears in Appearance in English and Spanish.
- [x] The switch is off by default and the untouched default is not persisted.
- [x] An explicit choice survives through the existing local preference store.
- [x] All current CSS animations and transitions stop while the setting is on.
- [x] Theme changes and notification gestures honor the same preference.
- [x] An already-running theme transition stops when the setting is enabled.
- [x] Operating-system reduced-motion behavior remains supported independently.
- [x] Keyboard and screen-reader semantics use the existing labelled switch.
- [x] Documentation describes the setting and its default.

# Relevant files

- `src/app/preferences.ts`
- `src/app/themeTransition.ts`
- `src/app/App.tsx`
- `src/app/AppOverlays.tsx`
- `src/features/settings/SettingsPanel.tsx`
- `src/features/settings/translations.ts`
- `src/features/notifications/NotificationCenter.tsx`
- `src/shared/ui/motionPreference.ts`
- `src/styles/base.css`
- `src/architecture/styleComposition.test.ts`
- `README.md`
- `DESIGN.md`

# Implementation notes

The app preference is applied with a layout effect so the frame that moves the
switch into its enabled state is already motionless. The shared
`isReducedMotionRequested` helper combines the app attribute and the operating
system media query for code-driven animations.

The pre-commit review found two task-local issues. First, browser-owned theme
snapshots could finish their 180ms animation if Reduce motion was enabled while
one was already running; `stopActiveThemeTransition` now ends that snapshot and
clears its lifecycle attribute. Second, the notification test cleaned the root
attribute only at the end of one successful test body; cleanup now runs from
`afterEach`, preventing a failed assertion from contaminating later tests.

# Validation

- UI detector over `src`: 0 findings.
- Static motion inventory: 41 animation declarations, 92 transition
  declarations and 20 keyframe definitions, all covered by the root override.
- Runtime browser inspection in Spanish: the switch renders off by default;
  after activation the root attribute is `true`, the switch transition is
  `0s`, and the rendered DOM contains no element with a running animation or
  non-zero transition duration.
- Focused suite after the hardening review: 5 files, 96 tests passed.
- `pnpm run check`: documentation, frontend architecture, TypeScript, frontend
  tests and production build, Rust formatting, Clippy and Rust tests passed.
- No macOS or Linux runtime claim is made; the behavior uses browser-standard
  CSS, `matchMedia` and feature-detected View Transitions.
