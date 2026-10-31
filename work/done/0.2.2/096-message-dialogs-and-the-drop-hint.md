---
id: 096
title: Give message dialogs the app's own shell, and say that folders can be dropped
status: done
priority: normal
type: improvement
areas:
  - frontend
  - accessibility
created: 2026-08-30
completed: 2026-08-30
parent:
queue:
---

# Goal

Two loose ends from the welcome-screen work. The open-failure alert stops
borrowing the About dialog's identity shell and reads like the rest of the app,
and the welcome screen finally says that a folder can be dropped on the window.

# User outcome

The dialog someone meets when they open the wrong folder looks like GitOdile
instead of like a product splash: a heading sized for a sentence, an error mark
they can recognize before reading, and the green button on the way *out* of the
problem rather than on dismissing it. And the drag-and-drop shortcut stops
being a secret.

# Context

`.about-dialog` is the product-identity surface — hero mark, 28px heading, 32px
padding. The close-project confirmation and the open-failure alert both reached
for it because it was the only small-dialog shell in the app shell, so a
two-line sentence arrived under a heading sized for a logo. The backdrop had
the same problem in its name: `.about-backdrop` was carrying five dialogs.

Task 093 made the window take a dropped folder. Nothing on screen said so, and
a gesture nobody is told about is a gesture nobody uses.

# Scope

- A `.message-dialog` shell in the app shell, following the vocabulary the
  app's other dialogs already use.
- A circular `--status-danger` glyph on the error dialog.
- Make the recovery action primary and Close secondary; keep Close primary when
  it is the only action.
- Rename `secondaryAction` to `recoveryAction`, since it is now the primary
  button.
- Describe the alert with `aria-describedby` instead of a nested `role="alert"`.
- Rename `.about-backdrop` to `.dialog-backdrop`.
- Add a one-line drag-and-drop hint under the welcome launcher, localized.

# Out of scope

- The About, changelog and shortcut dialogs, which keep their own shells.
- Any change to `.dialog-actions`, which is shared with feature dialogs.

# Acceptance criteria

- [x] The error and close-confirmation dialogs use the 22px/28px house shell.
- [x] The error dialog carries a danger glyph tile.
- [x] The recovery action is the primary button, Close the secondary, in that
      reading order; Close stays primary when alone.
- [x] The alert announces its message once, as its description.
- [x] No action label can wrap inside its capsule, in any language.
- [x] The welcome screen names the drop gesture.
- [x] The restyled dialogs keep the focus ring the About shell gave them.

# Relevant files

- `src/app/AppOverlays.tsx`
- `src/app/app-shell.css`
- `src/styles/base.css`
- `src/app/App.tsx`
- `src/features/overview/OverviewPanel.tsx`
- `src/features/overview/overview.css`
- `src/features/overview/translations.ts`
- `DESIGN.md`

# Dependencies

Tasks 091 and 093.

# Decisions

- **A new shell, not a fix to `.about-dialog`.** About is genuinely a hero
  surface; the bug was two dialogs borrowing it. Editing About's own type scale
  to suit an alert would have broken the one screen that is supposed to look
  like that.
- **The dialog keeps the app's 16px button and body text.** Every other dialog
  in the app inherits the same, so shrinking this one would have replaced one
  inconsistency with another. The Spanish recovery label is handled by width
  (480px fits Close plus a 318px label with room to spare), plus `nowrap` on
  the buttons and a wrapping actions row so a longer translation takes its own
  line instead of wrapping inside the pill.
- **The hint is a line, not a fourth card.** Dropping a folder is another way
  to reach one of the three actions, not a fourth thing to do.
- **`aria-describedby` over `role="alert"`.** An `alertdialog` already
  announces its body when it opens; the nested live region made screen readers
  read the failure twice.

# Implementation notes

`.message-dialog` sets `outline: none`, copied from `.about-dialog` — which
means it also has to join `.about-dialog` in `base.css`'s `:focus-visible`
list. Without that second half the two dialogs lose their focus ring
altogether, which is how the first draft of this change shipped a silent
keyboard regression; caught in review by checking which rules the class
actually matches.

`.welcome-drop-hint` has to be selected as `.empty-state--welcome
.welcome-drop-hint`: the shared `.empty-state p` rule is specificity (0,1,1)
and would otherwise win over a bare class, silently restoring 14px text and a
22px bottom margin.

# Validation

Measured in the running dev preview by mounting the dialog's real markup and
classes: 480×261 at `--radius-surface`, 28px padding, 22px heading with no
margin, a 40px circular tile at 5.55:1 in dark, body at 6.06:1, and both
actions on one row as single-line 43px capsules (the recovery label measures
318px; before the width change it wrapped to two lines inside the pill at 64px
tall). The drop hint renders at 12px in `--text-secondary`, 12px under the
cards and 30px above the recents divider.

Covered by the existing not-a-repository App test, extended to assert the
button hierarchy and the alert's accessible description.

```bash
pnpm run check
```

Passed on 2026-08-30: documentation, frontend architecture, TypeScript, 492
frontend tests over 60 files, the Vite build, `cargo fmt --check`, Clippy with
`-D warnings`, and the Rust test suites.
