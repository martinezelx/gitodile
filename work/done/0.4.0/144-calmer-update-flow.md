---
id: 144
title: Confirm a finished update with a toast and fix the update dialog's rough states
status: done
priority: high
type: feature
areas:
  - frontend
  - documentation
created: 2026-10-01
completed: 2026-10-01
parent:
queue:
---

# Goal

Replace the dialog that opens on its own after a successful update with a
short toast, and fix the update dialog states that say confusing, duplicated
or unhelpful things.

# User outcome

- After an update, the app opens straight onto the person's work. A toast says
  "Updated to vX.Y.Z" and, when the version has highlights, offers
  "See what's new", which opens What's new.
- The dialog only opens on its own when the update could not be confirmed, and
  then it says so once, under a title that names the problem.
- Every other state says what is happening, offers only actions that can help,
  and names its state in the title.

# Context

A user-style update from 0.3.0 to 0.3.1 opened the update dialog on first
launch. It showed "Updated to v0.3.1" next to "Not checked yet". The only
button was "Check for updates", and five seconds later the automatic check
rewrote the open dialog with a spinner and a Cancel button. DESIGN.md
§ Dialogs already says that a result with no next step is a toast.

The review that found this, together with the other issues below, mapped every
dialog state from `UpdateDialog.tsx`, `translations.ts` and the startup effect
in `App.tsx`.

# Scope

1. **Startup receipt.** A confirmed update shows a toast with "See what's new"
   (only when the running release has highlights) instead of opening the
   dialog. The dialog no longer shows a "Updated to…" line. An unconfirmed
   update still opens the dialog.
2. **Unconfirmed update.** One message instead of two, the title "The update
   didn't finish", a sentence that still reads when the native side reports no
   expected version, and both "Check for updates" and "Manual download".
3. **Blocked install.** Show which unfinished edit blocks the install in every
   language. Blocker labels become localized names written by their owning
   feature. The generic sentence no longer points to a list that is not shown.
   The title names the state. No manual download is offered for work the
   reader can finish.
4. **Verifying.** The title and a visible line say the download is being
   verified, instead of a silent indeterminate bar under "Downloading".
5. **Manual download.** Offered only for the error codes whose copy points to
   it, not for offline, timeout, install-blocked and similar cases.
6. **Ready to install.** The ready state is the confirmation itself: the
   consequence sentence, "Not now" and "Install and restart". The separate
   "Install…" step goes away.
7. **Titles.** Up to date, installing and blocked each get a title that names
   the state.
8. **Up to date.** The primary action is "Close". Checking again becomes the
   secondary action.
9. **Install consequence copy.** Say that project files are not touched, as
   well as that drafts are kept.

# Out of scope

- Starting a check automatically when the dialog opens from the "Check for
  updates" command (already the case from the menu and the palette).
- Resuming a cancelled download without a fresh check (native candidate
  lifetime).
- Cumulative highlights when someone skips several versions.
- A notification-centre entry for a finished update.
- About's "Updates unavailable" label for failed and cancelled checks.
- Showing native English safe detail to non-English readers (DESIGN.md keeps
  that rule).

# Acceptance criteria

- [x] A confirmed startup handoff shows a toast instead of opening the update dialog; its action opens What's new and is present only when the running release has highlights.
- [x] An unconfirmed startup handoff opens the dialog once, with one status line, its own title, and the manual download and check actions; an empty expected version reads naturally.
- [x] A renderer-side install block names the unfinished edit in the reader's language; a native or unlabelled block uses a generic sentence that refers to nothing missing; neither offers the manual download.
- [x] Verifying shows its state as visible text and in the title.
- [x] Manual download appears only for the codes whose copy recommends it.
- [x] Ready shows the consequence, "Not now" and "Install and restart"; install runs only from that button.
- [x] Up to date, installing and blocked titles name the state; up to date offers Close as primary.
- [x] Tests cover each changed state; DESIGN.md describes the new behaviour.
- [x] `pnpm run check` passes.

# Relevant files

- `src/app/App.tsx`, `src/app/AppOverlays.tsx`
- `src/features/app-updates/` (`UpdateDialog.tsx`, `translations.ts`, `controller.ts`, `install.ts`, `domain.ts`)
- Feature callers of `useInstallDraftBlocker`
- `DESIGN.md` (application updates, § Dialogs)

# Dependencies

None.

# Decisions

- The toast is raised from `AppOverlays`, which renders inside
  `ToastProvider` and already owns What's new and the update dialog. The
  composition root renders the provider, so it cannot call `useToast` itself.
- The ready state carries the install confirmation. The button names the
  consequence ("Install and restart") and the sentence above it explains it,
  so the click is still an explicit, informed consent, and nothing installs
  without it.
- Blocker labels are written by the feature that owns the edit, in the
  reader's language. A runtime-generated blocker (an unreadable stored draft,
  a background owner that refused to pause) has no user-facing name, so it
  gets the generic sentence.

# Implementation notes

- `features/app-updates/startupReceipt.tsx` adds `useStartupUpdateReceipt`.
  `AppOverlays` calls it with the startup confirmation, What's new as the
  toast action (only when `CURRENT_APP_RELEASE` has highlights) and the update
  dialog for an unconfirmed restart. The effect that opened the dialog from
  `App.tsx` is gone.
- `UpdateDialog.tsx`: the startup line is gone from the dialog. An
  unconfirmed restart (`failed` / `post_install_unconfirmed`) draws one
  warning line from the startup confirmation. The text falls back to
  `startupUnconfirmedUnknown` when the native side sends an empty expected
  version. The dialog offers "Check again", matching the sentence, and
  "Manual download".
- The ready state carries the install confirmation (`installExplanation`,
  "Not now", "Install and restart"). The `confirmingInstall` step and its
  unused `.app-update-confirm` CSS are removed.
- `MANUAL_DOWNLOAD_CODES` limits the manual download to the codes whose copy
  recommends it.
- Titles now name the verifying, up-to-date, installing, `install_blocked` and
  unconfirmed states. Verifying shows its line under the indeterminate bar.
  Up to date offers "Check again" (secondary) and "Close" (primary).
- Blocked installs: `UpdateError.blocker` is a renderer-only field. `install.ts`
  passes the first `requires-user-action` draft blocker's label, or `null` for
  runtime-generated blockers. Every `useInstallDraftBlocker` caller now
  passes the localized title of the dialog or section that holds the edit
  (a rename uses an unquoted label, because the update sentence adds the
  quotes).
  `install_blocked`'s generic sentence no longer refers to a list.
- DESIGN.md (application updates; § Dialogs copy) and
  `docs/release/updater-qualification.md` describe the new behaviour.
- Known behaviour kept: an unconfirmed restart's dialog still changes once the
  automatic startup check runs, because that check offers the version
  again, which is the way forward from that state. The Settings row still has
  no manual download of its own (unchanged design).

Follow-up candidates (out of scope above): resume a cancelled download,
cumulative highlights across skipped versions, and release highlights (planned
for later, so the 0.3.1 toast has no "See what's new").

# Validation

- 2026-10-01 `pnpm run check`: exit 0 (docs, architecture, typecheck, 117
  frontend test files / 1,121 tests, build, `cargo fmt`, Clippy, Rust tests
  479 passed).
- After the review fixes (the first blocker the reader can act on, an
  unquoted rename label, "Check again" for an unconfirmed restart, a
  controller test, and the qualification doc): `pnpm run check` exit 0 again
  (117 frontend test files / 1,122 tests, build, `cargo fmt`, Clippy, Rust
  tests 479 passed).
- Browser harness (Vite, Spanish, removed afterwards): checked the toast
  "Actualizado a v0.3.1 · Ver novedades", unconfirmed (with and without an
  expected version), ready, blocked with a named edit, verifying, up to date,
  and offline.
