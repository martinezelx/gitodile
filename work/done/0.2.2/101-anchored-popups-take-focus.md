---
id: 101
title: Anchored popups actually take focus when they open
status: done
priority: normal
type: bug
areas:
  - frontend
  - accessibility
created: 2026-09-01
completed: 2026-09-01
parent:
queue: "18"
---

# Goal

Make `usePortalFlyout` focus the control it aims for, and prove it with a test
that cannot pass while the bug is present.

# User outcome

Opening the project switcher puts the caret in its search field, and opening a
rail menu lands on its first item — for everyone, but decisively for anyone
navigating by keyboard, who today opens a panel and finds focus sitting on
`<body>` with no way into the thing that just appeared except Tab from the top
of the document.

# Context

`usePortalFlyout` measures its anchor in a `useLayoutEffect` and renders the
popup `visibility: hidden` until that measurement lands — deliberately, so the
panel never paints in the wrong place. In the same synchronous block it then
calls `target?.focus()`.

At that moment `position` is still `null`, so the popup on screen is still
hidden, and **a `visibility: hidden` element cannot take focus**. The call is a
no-op and focus stays where it was.

jsdom does not implement that rule, so every existing test that asserts
focus-on-open passes while the real application focuses nothing. This is the
failure mode the repository's visual-verification habit exists for: the tests
were green, the behaviour was absent, and only measuring `document.activeElement`
in a running browser showed it.

Found while building the notification centre (task 100), whose panel hit exactly
this and now carries a local workaround gated on the resolved visibility. That
workaround is a second mechanism for the same job and comes out as part of this
task.

# Scope

- Fix `usePortalFlyout` so the focus attempt happens once the popup is visible.
- Focus at most once per opening, so a later reposition cannot steal focus back
  from wherever the user has moved it.
- Remove the local workaround and its comment from
  `src/features/notifications/NotificationCenter.tsx`, leaving one mechanism.
- Add a regression test that asserts the *precondition* — what the popup's
  visibility was at the moment focus was called — rather than only the outcome,
  which jsdom answers correctly either way.
- Verify in a running browser, by measuring `document.activeElement`, on every
  call site reachable without a Tauri backend.

# Out of scope

- Changing how the hook hides or positions the popup. The measure-then-place
  design is deliberate and is not what is broken.
- `useAnchoredPopup`, the sibling hook for non-portalled popups. It focuses from
  a layout effect too, but its popups are never hidden while it does so.
- Focus behaviour on close, dismissal, or the roving-tabindex keyboard model.

# Acceptance criteria

- [x] The popup's computed visibility is `visible` at the moment
      `usePortalFlyout` calls `focus()`, asserted by a test that fails against
      the current implementation.
- [x] Both focus targets are covered: `selected-menu-item` and `first-control`.
- [x] Focus is attempted once per opening, not on every reposition.
- [x] `NotificationCenter.tsx` no longer carries its own focus effect.
- [x] Verified in a running browser on the call sites reachable without a Tauri
      backend, with the measured `document.activeElement` recorded honestly, and
      the unreachable ones named as such rather than claimed.
- [x] `pnpm run check` passes.

# Relevant files

- `src/shared/ui/popupMenu.tsx`
- `src/features/notifications/NotificationCenter.tsx`
- `src/app/App.tsx`
- `src/app/RailNav.tsx`
- `src/app/project-switcher/ProjectSwitcher.tsx`
- `src/features/branches/BranchQuickSwitch.tsx`

# Dependencies

None. Task 100 found the bug but does not have to land first.

# Decisions

**Two passes, not one.** The measurement stays where it was — a layout effect,
before paint, so the popup never appears in the wrong place. Focus moved into a
second layout effect keyed on the resolved `position`. React has committed the
`visibility: visible` style by the time that one runs, so focus still lands
before the frame is painted; it is one render later, not one frame later.

**Focus once per opening, guarded by a ref.** `position` is a fresh object every
time the anchor is re-measured — a changed alignment does it today, and a future
reposition-on-scroll would too. Without the guard the popup would take focus
back from wherever the reader had since moved it. The ref resets on close.

**A third focus target instead of a second mechanism.** The notification centre
needs focus on the popup itself: its only header control is destructive, and
"first in the DOM" is a bad reason to put Enter on "Clear all". That was a local
effect in the feature; it is now `focusTarget: "container"` in the shared hook,
so there is one place that decides what each target means.

**A `none` target, because fixing the bug had a regression in it.** The sidebar
jump menu is the one flyout that opens on *hover*, and it closes itself again
260ms after the pointer leaves. Making focus work meant it would take the caret
because someone moved the mouse across the collapse button, then destroy the
element holding it — strictly worse than the no-op it had been. Every other
flyout opens from a click and does want focus, so the difference belongs to the
call site, not to the hook.

**The two hooks' selectors were left alone.** `useAnchoredPopup` and
`usePortalFlyout` resolve `selected-menu-item` differently — one prefers a
checked `menuitemradio`, the other skips disabled items. Unifying them would
change behaviour for existing consumers, which is a different task. Both now
handle `container` explicitly so the shared union stays honest, and nothing else
about either selector moved.

# Implementation notes

- `src/shared/ui/popupMenu.tsx`: the focus call left the measuring effect for
  one of its own; `PopupFocusTarget` gained `container`, handled explicitly in
  both hooks.
- `src/features/notifications/NotificationCenter.tsx`: its local focus effect
  and the `style.visibility` gate are gone, replaced by passing `"container"`.
  The panel keeps `tabIndex={-1}`, which is what makes that target work.
- `src/app/App.tsx`: the jump menu passes `"none"`, with the reason at the call
  site.
- `src/shared/ui/popupMenu.test.tsx` is new.

# Validation

```bash
pnpm run check
```

Exit code 0 on 2026-09-01, captured directly rather than through a pipe: docs
over 155 files, architecture over 330 modules, 614 frontend tests in 69 files,
build, and `cargo fmt` / `clippy -D warnings` / 319 Rust tests.

`tsc -b` caught one thing vitest did not: `const open = (): void => fireEvent
.click(...)` returns a boolean into a `void` annotation. The test suite runs
through esbuild, which strips types, so only the aggregate check saw it.

## The regression test is not vacuous

Proved rather than asserted. With the fix stashed, all five new tests fail
against the original hook:

```text
AssertionError: expected [ 'hidden' ] to deeply equal [ 'visible' ]   (x3)
AssertionError: expected [ 'hidden', 'visible' ] to have a length of 1 but got 2
AssertionError: expected [ 'hidden', 'hidden' ] to deeply equal [ 'visible', 'visible' ]
```

The failure names the bug directly: focus was being called while the popup was
still `visibility: hidden`. Asserting `document.activeElement` alone would have
passed in both versions, which is exactly how this survived.

## Measured in the running app

`document.activeElement` read in the browser, before and after, on every call
site reachable without a Tauri backend:

| Surface | Before | After |
| --- | --- | --- |
| Sidebar jump menu (`App.tsx`) | `BODY` | "Resumen" |
| Rail "More" menu (`RailNav.tsx`) | `BODY` | "Personalizar barra de navegación" |
| Add-project menu (`ProjectSwitcher.tsx:179`) | the previous button, outside | "Crear proyecto local" |
| Notification centre | `BODY` | the panel itself |
| Sidebar jump menu, hovered | — | caret stays on the trigger |

Each was confirmed open and `visibility: visible` at the moment of the reading,
so the old result was a genuine focus failure and not a closed popup.

The last row needed a second attempt to be worth anything: at the Browser pane's
own narrow width the collapse button is hidden by a media query, so `focus()` on
it was a no-op and the "caret did not move" reading was an artifact rather than
evidence. Re-measured at 1280x900, where the button is `display: grid`, 36px
wide and genuinely focusable, it holds.

**Not verified live:** `ProjectSwitcher.tsx:409` (the switcher's search field)
and `BranchQuickSwitch.tsx:72`. Both need an open project, and opening one
goes through Tauri IPC that a plain browser has no backend for. They take the
same hook through the same code path as the four above and are covered by the
same fix, but that is reasoning, not a measurement — check them the next time
the desktop app is driven for real.
