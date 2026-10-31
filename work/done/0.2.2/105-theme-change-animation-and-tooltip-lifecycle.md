---
id: 105
title: Unify the theme-change animation, ring the bell, fix the tooltip lifecycle
status: done
priority: normal
type: bug
areas:
  - frontend
  - accessibility
created: 2026-09-02
completed: 2026-09-03
parent:
queue: "19"
---

# Goal

Make a theme change animate the same way from every control, and stop the shared
tooltip from appearing and disappearing on its own.

# User outcome

Switching the theme from the titlebar reads as one calm change of the whole
window, with the sun/moon glyph turning over rather than being swapped out from
under the pointer. And a tooltip now appears when the pointer asks for it and
stays put until the pointer leaves, instead of blinking while the pointer rests
on a control, or reappearing 150ms after a click that just dismissed it.

# Context

Reported as a regression: the titlebar theme toggle's animation "used to be
fluid" and had started to stall part-way and then finish in a jump. Nothing in
the reveal had been touched. `styles/theme-transition.css` and
`app/themeTransition.ts` had exactly one commit each in their whole history
(`bb94528`), which is why the change did not look like a change to anyone.

Two separate defects turned out to be tangled together here, and only one of
them was the reported one.

**The tooltip.** Task 099 rewrote `TooltipHost` to fix its lifecycle, and in
doing so gave it a two-pass render: a hidden pass that reads `offsetWidth` and
`offsetHeight` (a forced synchronous layout), then a second pass with the
resolved placement. That was correct and cheap in isolation. What made it
expensive was that `focusin` was already wired straight to the show path, so
every click on a control re-armed the tooltip that `pointerdown` had just
dismissed. Measured in the running app, the tooltip was reinserted 213ms after
the click on the theme toggle, inside the sweep. Fifty-odd controls carry
`data-tooltip`, so this was every one of them, not just the theme toggle.

A second tooltip defect surfaced while investigating, and the user confirmed it
independently: `mouseover` and `mouseout` bubble, so crossing between two
children of the same control (the glyph inside a button, one path inside that
glyph) dismissed and re-scheduled the tooltip with the pointer barely moving.

**The sweep.** The tooltip fixes did not resolve the reported stall. Two
hypotheses were formed and both were disproved by the user testing them:

1. *The tooltip was the cause.* Disproved: the stall persisted after the fix,
   and instrumenting the running app with `long-animation-frame` and `longtask`
   observers across the whole animation returned zero entries. Nothing was
   blocking the main thread.
2. *Rasterising a growing clip on a live layer.* `::view-transition-new(root)`
   is a live rendering rather than a cached texture, and the clipped area grows
   with the square of the radius, so the cost should peak at the end. Disproved:
   the user reproduced the stall identically in a much smaller window.

What survived both tests was the geometry. The origin sat at `(280, 22)` in a
1280x720 window, so the furthest corner was at 100% of the radius while the
whole rest of the window was already covered by 82% of it. Under the house
`cubic-bezier(0.4, 0, 0.2, 1)` the radius reached that 82% at barely half the
duration and spent the remaining 46% crawling over one corner. Scale-invariant
and duration-proportional, which matched both of the user's observations.

Curve tuning improved it but never closed it: `linear` removed the jump and left
a slow tail, `ease-in` fixed the tail and put a visible sprint on the last frame.
Then the user reported the origin itself was wrong, that the circle did not grow
from the icon. That was never reproduced locally: the button rect and icon rect
agreed exactly, there was one theme button in the DOM, and the null-origin
fallback in `revealCenter` had no path to run from the toggle's own `onClick`.

At that point the user made the call to drop the reveal and use the fade that
Settings and the command palette already used. This task records that decision
rather than a sixth round of tuning an effect that could not be reproduced.

# Scope

- Point the titlebar toggle at `startThemeFade`.
- Remove the reveal outright rather than leaving it unreachable: its function,
  its geometry helpers, its CSS, its keyframes and its duration token.
- Give the sun/moon glyph its own view-transition layer so it turns over during
  the fade instead of dissolving with the window.
- Stop `focusin` re-arming the tooltip when focus arrived from a click.
- Stop `mouseover` and `mouseout` bubbling from dismissing and re-scheduling a
  tooltip while the pointer stays inside one control.
- Hold the tooltip's direction class until its placement is measured, so the
  hidden pass does not start an entry animation on a side nothing has chosen.
- Tie each measured placement to the tooltip it was measured for, so one
  control's coordinates and side cannot be inherited by the next.
- Correct `DESIGN.md`, which documented the removed duration token and the
  reveal as a deliberate exception to the motion range.
- Give the titlebar notification bell one gesture, for an arriving
  notification, since it had none and read as flat.

# Out of scope

- Native OS-level theme following. Unchanged.
- The infinite loaders (`spin`, `loading-bar-sweep`, the breathe animations on
  history nodes) that keep running during a theme change, because
  `theme-transition.css` suppresses `transition` and not `animation`. Left
  deliberately: suppressing `animation` would freeze a spinner for the length of
  the change and then restart it from zero, which is worse than the cost.
- Press feedback anywhere in the titlebar. A press gesture for the bell was
  built, reviewed and removed: it made the bell the only control in that row
  answering a press. Giving the whole row press feedback is a decision about the
  titlebar, not a detail of notifications, and belongs to whoever takes that on.
- The two-pass measure-then-place shape shared by `usePortalFlyout` and
  `useAnchoredPopup`. Same pattern, but neither can be triggered by the click
  that starts a theme change, so neither had the defect.

# Acceptance criteria

- [x] Every theme control (titlebar toggle, Settings, command palette) reaches
      the same animation, asserted in `App.test.tsx`.
- [x] No reveal geometry survives anywhere in `src/`: no `startThemeReveal`, no
      `theme-reveal` keyframes, no `--duration-theme-reveal`, no orphaned class.
- [x] The architecture test asserts the reveal cannot creep back in beside the
      fade, instead of asserting that it exists.
- [x] The glyph's `view-transition-name` is granted only while a change is in
      flight, so it is not enlisted in unrelated view transitions. Verified in
      the running app: `none` before, `theme-toggle-icon` during, `none` after.
- [x] A click-driven focus does not show a tooltip; a keyboard focus still does.
- [x] The pointer crossing between children of one control does not disturb a
      showing tooltip, while leaving the control still dismisses it.
- [x] The tooltip flicker test was proved non-vacuous by removing the guard and
      watching it fail.
- [x] A tooltip moving between two controls on opposite sides measures from no
      side at all both times, proved non-vacuous the same way.
- [x] No stale reference to the reveal survives in code comments, `DESIGN.md`
      or `docs/`. Only `work/done/` keeps it, as history.
- [x] The bell rings when the unread count rises, and not when it falls.
- [x] A press moves nothing, so the bell still behaves like its neighbours.
- [x] The ring never starts under reduced motion, so the class that carries it
      always has an animation to clear it.
- [x] The ring's class is cleared after the animation and a later ring restarts
      it. Verified in a running browser, because jsdom cannot.

# Relevant files

- `src/app/themeTransition.ts`
- `src/app/themeTransition.test.ts`
- `src/app/App.tsx`
- `src/app/app-shell.css`
- `src/styles/theme-transition.css`
- `src/styles/tokens.css`
- `src/shared/ui/tooltip.tsx`
- `src/shared/ui/tooltip.test.tsx`
- `src/architecture/styleComposition.test.ts`
- `DESIGN.md`
- `src/features/notifications/NotificationCenter.tsx`
- `src/features/notifications/NotificationCenter.test.tsx`
- `src/features/notifications/notifications.css`

# Dependencies

None. Supersedes the titlebar half of the effect introduced in `bb94528`.

# Decisions

**The reveal is withdrawn, not disabled.** Leaving `startThemeReveal` in place
behind an unused call site would leave the next reader to work out whether it was
dead or dormant. The module header now records why it went, so a future attempt
at an origin-anchored wipe starts from what was learned rather than from scratch.

**`:focus-visible` decides whether focus is asking for a label.** The browser
already owns the distinction between a click-driven focus and a keyboard one,
and it is exactly the distinction the tooltip needs. jsdom's selector engine may
not know the pseudo-class, so a throw falls back to showing the tooltip rather
than suppressing it everywhere; the tests stub the predicate and assert the
branch, because the predicate itself is the browser's to decide.

**The glyph keeps its own layer even though the reveal is gone.** At 16px a
window-wide cross-fade reads as the icon simply being replaced. A quarter turn
and a small dip in scale, deliberately slight (a hinge and not a spin), say what
the theme changed to while the fade says that it changed. It shares
`--duration-normal` with the fade so neither outlives the other and stretches the
transition to its own length.

**No new suppression for animations during a change.** See Out of scope.

**The bell moves for arrivals, not for hover.** `DESIGN.md` § Motion opens with
"motion should communicate relationships and state changes, not decorate", and
the centre exists to report what happened while nobody was looking. A rise in
the unread count is that; a pointer passing over the bell is not. Hover motion
would also have broken the standing decision that the bell looks and behaves
like every other control in that row.

**One gesture, not two.** A second gesture answering a press was built first,
distinguished from the ring by property as well as length. It came out on
review: the bell borrows `.titlebar-icon-button` precisely so that it reads as
one of the row, and it would have been the only control there answering a press
while the palette, the history arrows and the theme toggle stayed still. The
ring is deliberately outside the 120-220ms house range — that range is for a
control answering an interaction, and an unprompted movement that brief
registers in the corner of the eye as a glitch rather than as a bell.

**Reduced motion is refused in the component, not in CSS.** The ring's class is
cleared by `animationend`, and an animation suppressed to `none` never fires
one — the class would stick for the rest of the session and no later ring could
restart it. The badge keeps its CSS rule, because nothing clears that one.
Found by reasoning about the clearing path, not by a test.

# Implementation notes

`themeTransition.ts` went from 90 lines to 55: `startThemeReveal`,
`revealCenter`, `revealRadius`, `ORIGIN_PROPERTIES` and the two-valued mode type
are gone, and with one caller left the mode parameter went with them. The root
now carries `data-theme-transition="fade"` and no inline style at all, which
`themeTransition.test.ts` asserts directly.

`tooltip.tsx` gained a `pendingTarget` alongside `activeTarget`, so `onOver` can
recognise "this hover is already accounted for" whether the tooltip is showing or
still counting down, and `onOut` now checks `relatedTarget` containment before
dismissing. The direction class is withheld until `placement` resolves; before,
the hidden pass rendered as `app-tooltip--below` and then restarted the keyframe
as `app-tooltip--above` once the real side landed, which is two entry animations
for one tooltip.

A self-review before commit turned up two defects in this task's own work, both
now fixed and covered. First, `placement` was never reset when the tooltip moved
to a new control, so the "hold the direction class until measured" fix only ever
worked on the first tooltip of a session; every later one rendered once with the
previous control's coordinates and side, which is the animation restart the fix
was meant to remove. A placement now carries the state it was measured for, and a
mismatch reads as no placement. Second, the doc comment on `isKeyboardFocus`
explained the bug in terms of the 420ms sweep and `::view-transition-new(root)`,
neither of which exists any more.

`DESIGN.md` was the only other place still describing the reveal as current: it
listed `--duration-theme-reveal` among the motion tokens and named it the one
deliberate exception to the 120-220ms range. `check:docs` validates links,
frontmatter and folder consistency, not whether prose is still true, so nothing
would have caught it.

The bell's clearing path is the one thing here that jsdom cannot answer:
`animationend` never reaches a React handler under it, proved with a scratch
probe that dispatched the event natively and bubbling and still saw no update.
A test would have asserted a listener that never fires and passed for the wrong
reason, which is precisely the failure task 101 was about, so there is no test
for it — the clearing is verified in a running browser and recorded below
instead. What the suite does cover is the reason the clearing can be trusted:
the ring is only ever started when an animation will really run.

Diagnosis was done against the running dev server through the in-app browser.
Worth recording for the next person: that surface does not reliably produce
frames, and it manufactured two convincing artefacts, a reveal circle frozen
mid-sweep and `data-theme-transition` apparently never cleaned up. Both
evaporated once painting was forced. Neither was a real defect, and both cost
time. Frame-level timing has to be measured in the Tauri window.

The reported wrong origin is unresolved rather than fixed. It was never
reproduced: measured in the running app, the button and icon centres agreed
exactly (`centerX: 154` for both) and only one theme button existed in the DOM.
Removing the reveal removes the surface, so there is nothing left to anchor
wrongly, but no root cause was established. If an origin-anchored effect is ever
attempted again, start there.

# Validation

- Tooltip flicker test proved non-vacuous: removing the `relatedTarget` guard
  from `onOut` and re-running `tooltip.test.tsx` fails
  "survives the pointer crossing between children of one control" (1 failed,
  8 passed), and it passes with the guard restored.
- Stale-placement test proved non-vacuous the same way: replacing the
  `measuredFor` identity check with the raw `placement` fails
  "does not carry one control's placement over to the next" (1 failed, 9
  passed), and it passes with the check restored.
- Runtime verification in the in-app browser against the dev server: the
  titlebar toggle reaches `startViewTransition` with mode `fade` and no inline
  style on the root; `view-transition-name` on the glyph reads `none` before a
  change, `theme-toggle-icon` during, `none` after.
- Runtime verification of the tooltip fix with real pointer events: before the
  fix, `pointerdown` dismissed the tooltip and `focusin` reinserted it 213ms
  later; after, a two-second window following the click records no tooltip.
- Runtime verification of the bell's clearing path in the in-app browser, with
  painting forced so the animation actually runs: the gesture class is applied,
  and once the animation ends the glyph is back to `lucide lucide-bell`, so a
  later ring starts clean. An earlier reading that showed the class stuck was
  the same non-painting artefact described above, not a defect. Measured against
  the press gesture that has since been removed; the ring uses the identical
  class-and-`animationend` path.
- No claim is made for macOS or Linux visual verification.
- Completion gate: `pnpm run check` passed (exit 0) on 2026-09-03 — documentation
  check over 160 Markdown files and 126 task ids, frontend architecture over 335
  modules, 70 frontend test files / 632 tests, production build, and 321 Rust
  tests with fmt and clippy clean.
