---
id: 070
title: One way out of a dialog, one way into a project
status: done
priority: normal
type: chore
areas:
  - frontend
created: 2026-08-23
completed: 2026-08-23
parent:
---

# Goal

Make the two project-entry dialogs agree on how a person leaves them and how a
required field is answered, and stop spending three rows of sidebar on the
three ways to get a project.

# User outcome

Clone and Create local project close the same way, from the same place, at
every step of their wizard. An empty required field is answered in the app's
own language and theme, next to the field, instead of by the browser's grey
bubble — and the primary action is never a dead grey button that will not say
what is missing. In the sidebar, one "+ Add project" replaces three stacked
buttons, which is 88px of the panel back on a laptop screen.

# Context

The two dialogs were built weeks apart (tasks 065-2 and 065-3) and drifted:

| | Create local project | Clone |
| --- | --- | --- |
| Leaving | X in the header | *Cancel* in the first step only |
| Leaving from the review step | yes | no button; Escape or backdrop only |
| Empty required field | primary button disabled | browser's native bubble |

Neither half of that table is a matter of taste. The clone dialog's review step
had no visible way out at all, and a disabled primary button is the one control
that cannot explain why it is disabled. The native validation bubble ignores
the app's theme and language, and disappears on the next keystroke.

`DialogCloseButton` already existed and was already worn by Settings and by
Create local project, so the header X was the established line; the footer was
left for actions that *mean* something.

Separately, create/open/clone appeared as three side-by-side controls in four
switcher surfaces (expanded sidebar with projects, empty sidebar, collapsed
36px rail, compact row), plus the Overview hero and the titlebar menu. The
titlebar already folded them into a menu.

# Scope

- Give the clone dialog the same header X, gated on the one step where closing
  is not allowed, routed through the same `requestOpenChange` as Escape and the
  backdrop; drop the now-redundant footer *Cancel* from its input step.
- Add a shared submit-time validation primitive to `shared/ui` and adopt it in
  both dialogs, replacing the native bubble and the disabled primary button.
- Fold create/open/clone into one "+ Add project" trigger and menu across all
  four project-switcher surfaces.

# Out of scope

- The Overview empty state's three buttons. It is the product's front door and
  a hero deserves its options laid out.
- The titlebar menu, which already groups the same three actions.
- Any change to what the three actions do, or to the dialogs' own steps.
- Migrating the other dialogs (`SaveVersionDialog`, `BranchesDialog`) off
  their `required` attributes. The primitive is built for them; adopting it is
  their own change.

# Acceptance criteria

- [x] Both dialogs close from a header X, present at every step where closing
      is permitted, and absent where it is not.
- [x] The clone dialog can be left from its review step.
- [x] An empty required field renders an in-app message next to the field, in
      the active language, with `aria-invalid` and the message linked through
      `aria-describedby` alongside any existing help text.
- [x] Submitting an incomplete form focuses the first invalid control and does
      not reach the controller.
- [x] Editing a field clears its own message and no other.
- [x] Neither dialog's primary action is disabled for incomplete input.
- [x] One "+ Add project" trigger in all four switcher surfaces, with the
      three actions as menu items and the app's usual menu keyboard model.
- [x] The menu is not clipped by the sidebar, including on the collapsed rail.
- [x] Escape closes the menu without closing the popover that hosts it.
- [x] Full `pnpm run check` passes.

# Relevant files

- `src/shared/ui/fieldErrors.tsx` (new)
- `src/shared/ui/index.ts`
- `src/shared/ui/primitives.css`
- `src/shared/i18n/translations.ts`
- `src/features/clone/CloneDialog.tsx`
- `src/features/clone/clone.css`
- `src/features/initialize-project/InitializeProjectDialog.tsx`
- `src/projectSwitcher.tsx`
- `src/app/app-shell.css`
- `src/app/translations.ts`

# Dependencies

None. Follows 065-2 and 065-3, which built the two dialogs.

# Decisions

- **The header X won, not the footer Cancel.** Both were defensible; the X is
  what Settings and Create local project already used, it sits in the same
  place at every step of a wizard whose footer changes shape, and it leaves the
  footer for actions with meaning. Clone's *Cancel* during execution stays —
  it cancels the clone, it does not close the window.
- **`required` stays on the control; `noValidate` goes on the form.** The
  attribute is what tells assistive technology the field is required; only the
  browser's *rendering* of the failure is being replaced.
- **Errors clear from one `onInput` on the form, not per input.** Consumers
  spread `formProps` once and keep their own `onChange` handlers untouched.
- **The disabled primary button in Create local project was replaced, not
  kept.** It was the surviving half of the old approach, and a grey button that
  cannot say what is missing is worse than a button that answers on click.
- **The add-project menu is portaled and `position: fixed`.** Both `.sidebar`
  and `.sidebar-scroll` clip their overflow, so an absolutely positioned menu
  would be cut at the panel edge, and the 76px collapsed rail has no room for
  one at all. `tooltip.tsx` already makes this escape; the same trade comes
  with it — the anchor rect is measured once, so scroll and resize dismiss the
  menu rather than let it drift off its trigger.
- **Field names are plain slugs** because `validate` uses them as
  `[name="…"]` selectors to focus the first invalid control.

# Implementation notes

**`useFieldErrors` / `FieldError`.** One hook returning `formProps` (a ref,
`noValidate`, and the clearing `onInput`), `fieldProps(field, describedBy)`
(name, `aria-invalid`, a chained `aria-describedby`), `validate(checks)` and
`reset`. `validate` publishes the failing messages, focuses the first invalid
control through the form ref, and returns whether everything passed. Both
dialogs call `reset` from their existing `resetTransientState`, so reopening a
dialog never shows a stale message. The message itself is
`commonRequiredField` in shared translations, not a literal.

`FieldError` renders a `<span>`, not a `<p>`: every consumer places it inside
the field's `<label>`, which only admits phrasing content.

**Clone dialog.** The X is hidden only during `opening`, the one step where
closing is refused; during `executing` it routes to the same cancel-then-close
path Escape already took. `.clone-dialog__header` became the same
`44px minmax(0, 1fr) auto` grid as the initialize dialog's, and its icon sizing
was narrowed to `> span svg` so the 21px header rule stopped inflating the
close button's own 18px icon.

**Initialize dialog.** `localInputIncomplete` is gone; the same checks now run
on submit, conditional on mode and on which optional sections are enabled. Both
of its forms share one hook instance — they are separate steps and never render
at once.

**Add-project menu.** `AddProjectMenu` in `projectSwitcher.tsx` takes a variant
that only chooses the trigger's class (row / rail / compact); the menu is
identical everywhere and wears the shared `.app-menu` surface with
`handlePopupMenuKeyDown` for arrows, Home/End and first-letter search. It is
placed in a layout effect — measured and positioned in the frame it mounts,
rendered `visibility: hidden` until then — flying out sideways on the rail and
aligning to the trigger's left edge elsewhere, clamped to the viewport.

Nesting it inside the compact popover needed two guards, both on the popover
side: its outside-click check ignores mousedown inside `[data-add-project-menu]`
(the portaled menu is, structurally, outside the popover, so without this the
popover unmounted on mousedown and the chosen action never fired), and its
Escape handler defers while that menu is open (both listen on `document`, and
the popover's listener is registered first, so one Escape closed both layers).

Choosing an item restores focus to the trigger before running the action, so
the dialog that follows has something meaningful to hand focus back to when it
closes.

# Validation

`pnpm run check` — passed, exit code 0 (`check:docs` over 122 files and 90 task
ids, `check:architecture` over 281 modules, `typecheck`, `test` 405 passed /
49 files, `build`, `check:rust` 294 passed).

Seven of those tests are new: inline message and header close in the clone
dialog, submit-time validation in the initialize dialog, and four over the
add-project menu (folding and choosing, Escape restoring the trigger, the
portaled menu inside the compact popover, and Escape not closing both layers).
The last two fail without their respective guards.

Measured in the running app (dev server, dialog and sidebar open):

| | Before | After |
| --- | --- | --- |
| Empty sidebar switcher | ~167px of buttons | **79px** |
| Collapsed rail | 3 squares | **1**, 36×36 |

Clone header: close button 36×36 at the panel's right edge with an 18px icon,
title spanning 364→924 without reaching it, `elementFromPoint` over its centre
returning the button. Submitting the empty form renders both messages, focuses
the first invalid control, and sets `aria-invalid="true"` with
`aria-describedby="clone-source-help clone-source-error"`; the message colour
measures 5.55:1 against the dialog surface in the dark theme. The rail's menu
opens at x=74, past the 76px sidebar's right edge at x=88, with a hit test on
its corner confirming it paints there rather than being clipped.

Two legs stayed unverified by measurement because the browser pane is not
composited (`document.hasFocus()` is false, and style recalculation is
throttled there): the danger border on an invalid input, and the menu's initial
focus landing on its first item. Both are covered by tests, the border rule was
checked against the CSSOM instead, and the user confirmed both surfaces by hand
in the packaged app.
