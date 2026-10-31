---
id: 056
title: Animate theme changes from their origin
status: done
priority: low
type: feature
areas:
  - frontend
  - design
created: 2026-08-13
completed: 2026-08-13
---

# Goal

Make switching theme read as one deliberate change of the whole window, animated
from whichever control asked for it.

# User outcome

Pressing the titlebar toggle sweeps the new theme across the window from that
button, and the sun/moon glyph turns over as it goes. Choosing a theme in
Settings or from the command palette cross-fades the window instead. In every
case the entire surface changes together.

# Context

The theme flipped by writing `data-theme` on the document element, with a single
`transition` on `body` covering colour and background. That left the change
half-animated: the app background faded over 180ms while every panel, border and
icon sitting on top of it snapped in one frame. The seam was the complaint that
started this task, described as "fast but abrupt".

WebView2 on the target machine reports Chromium 151, so the View Transitions API
(Chromium 111+) is available with no fallback matrix to manage — one engine, one
code path, plus the reduced-motion and no-API guards.

# Scope

- Circular reveal anchored on the titlebar toggle, with the toggle icon
  animating on its own layer.
- Cross-fade for the theme controls in Settings and the command palette.
- Suppress the per-component colour transitions that would otherwise run inside
  the incoming layer.
- Cover the module with unit tests and the wiring with an integration test.

# Out of scope

- Any change to how the preference is stored, resolved or persisted.
- Animating anything other than a theme change; no other view transitions were
  introduced.
- The `ThemePreference` contract or the Settings panel markup.

# Acceptance criteria

- [x] The titlebar toggle reveals the new theme from the button's centre,
      reaching the furthest window corner.
- [x] Settings and the command palette cross-fade the window at
      `--duration-normal`.
- [x] No component animates its own colours underneath a transition.
- [x] `prefers-reduced-motion` and a missing API both fall back to an instant
      change rather than a zero-duration animation.
- [x] The root is left with no attribute, custom properties or inline style once
      an animation ends, including when one change interrupts another.
- [x] Re-picking the theme already in effect starts no transition.
- [x] Full `pnpm run check` passes.

# Relevant files

- `src/app/themeTransition.ts`, `src/app/themeTransition.test.ts`
- `src/styles/theme-transition.css`, `src/styles.css`, `src/styles/base.css`
- `src/app/preferences.ts`, `src/app/app-shell.css`
- `src/main.tsx`, `src/main.test.tsx`, `src/styleComposition.test.ts`
- `DESIGN.md`, `docs/ARCHITECTURE.md`

# Dependencies

None.

# Decisions

- **Two modes, chosen by origin.** A wipe anchored on the Settings segmented
  control would sweep across the very panel the user is reading, and "system"
  has no direction to come from. Settings and the palette cross-fade; only the
  titlebar toggle, a single control at a known point, sweeps.
- **420ms for the reveal, against the 120-220ms house rule.** The radius crosses
  the window diagonal, so the usual range reads as a flash rather than a
  movement. Recorded as an explicit exception in `DESIGN.md` with its own token,
  `--duration-theme-reveal`; the fade stays inside the range at
  `--duration-normal`. The reveal was tried at both timings before choosing.
- **Suppress every transition during a change, not just `body`'s.** Nineteen
  rules across the app transition their own background and colour over
  `--duration-fast`, and they re-ran inside the incoming layer — the first 120ms
  of a change exposed half-migrated colours on exactly the controls nearest the
  origin. Enumerating those selectors would regress silently the next time a
  component gains a transition, so the rule is `:root[data-theme-transition] *`
  with `!important`, scoped to an attribute that exists only while animating.
  The forced style recalc was measured first at 0.1ms median over 173 elements
  against a 16.7ms frame, and the recalc on the way out lands after the
  animation on an idle frame.
- **The toggle icon's `view-transition-name` is granted only during a reveal.**
  A bare name would enlist that icon in every future view transition in the app,
  and during a fade — where the icon often does not change at all — it would
  spin for nothing.
- **`applyTheme` is exported and called inside the capture callback.** The
  preference hook applies the attribute from a passive effect, which is not
  guaranteed to have run by the time the transition captures the DOM. The
  callback also wraps the state update in `flushSync` so the toggle's own glyph
  swap lands in the captured new state instead of popping in afterwards.
- **Animation choice lives at the composition root.** `SettingsPanel` and the
  palette report the preference the user picked; `main.tsx` decides what that
  looks like. Neither feature imports the transition module.

# Implementation notes

- `src/app/themeTransition.ts` (new) owns both modes behind `startThemeReveal`
  and `startThemeFade`. It tags the root with `data-theme-transition`, publishes
  the origin and radius as custom properties, tracks the transition in flight so
  a rapid second change skips the first without its late cleanup stripping the
  newer one's state, and cleans up on both settle paths.
- `src/styles/theme-transition.css` (new) holds the choreography. It started
  inside `base.css` and was extracted once it outgrew it: that file is the
  reset, body and focus foundation, not the larger half of an effect.
  `styleComposition.test.ts` now pins the split, including that `base.css`
  contains no `view-transition` rules.
- The `body` colour transition in `base.css` stays as the no-API fallback for a
  plain browser during `pnpm dev`, now commented as such — in the shipped app it
  is never seen.
- `src/main.test.tsx` asserts that the toggle captures under `reveal`, Settings
  under `fade`, and that re-picking the active option captures nothing. Verified
  to fail when the Settings wiring is reverted to the raw setter.

# Validation

- `pnpm run check` (docs, architecture, typecheck, test, build, Rust fmt, clippy
  and tests).
- Browser verification against the running dev server, by measurement rather
  than screenshot: the reveal's published origin and radius match the button's
  centre and the furthest corner to four decimals; all 11 choreography rules are
  parsed by the engine, including the compound `:root[…]::view-transition-*`
  selectors; a nav item reports `0.12s` idle, `0s` during either mode and
  `0.12s` again after cleanup; the toggle icon holds its
  `view-transition-name` only during a reveal; and a real command-palette
  command tagged the root `fade`, changed and persisted the theme, closed the
  palette and left no attribute or inline style behind.
- The animations themselves were reviewed in the running app by the user, in
  both modes. They could not be observed from the automated browser session:
  the pane was not compositing frames, and a hidden document skips view
  transitions outright.
