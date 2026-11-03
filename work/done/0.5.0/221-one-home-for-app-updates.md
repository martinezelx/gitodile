---
id: 221
title: Give application updates one home in Settings
status: done
priority: normal
type: feature
areas:
  - frontend
  - docs
created: 2026-11-03
completed: 2026-11-03
parent:
queue:
---

# Goal

Application updates live in one place, Settings › Updates. Every other way in
leads there, a quiet mark says when there is something to do, and the
notification centre keeps announcing a release found in the background.

# User outcome

Whether someone opens the menu, the command palette, a notification, About or
the startup toast, they land on the same section, which shows the state, the
next step, the progress and what the new version brings. Checking for updates
no longer opens a modal that usually just says "You have the latest version".
When a release is waiting, the More actions button carries a dot and its entry
names the next step ("Update to 0.6.0…", "Install 0.6.0…").

# Context

On 2026-11-03 the update flow was mapped. Eight entry points (the titlebar
menu, the macOS menu, the command palette, the notification, the startup toast,
What's new, About and the Settings rail) ended on four surfaces: the update
dialog, the changelog dialog, About and Settings › Updates. Three of the four
were modals, two of them opened another modal, and three different functions
described the same `UpdateState`. What's new existed twice: the changelog
dialog and the integrated list in Settings. Once a download was ready and its
dialog closed, the only reminder left was the dot on the Settings rail.

Other clients were compared. VS Code marks the Manage gear and renames its menu
entry to "Restart to Update". Chrome tints its menu button and keeps the
progress inline in Settings › About. Zed moved its prompt to the title bar and
then had to add the in-progress states. GitHub Desktop opens no dialog to check.
The maintainer reviewed the comparison artifact and accepted the recommended
options on 2026-11-03.

# Scope

- Every entry point opens Settings › Updates. A check starts only from a
  settled state with nothing to act on, so opening the section from "Ready to
  install" never drops the downloaded candidate.
- The Settings row carries the whole lifecycle in place: check, cancel,
  download with its size, determinate and indeterminate progress, the install
  explanation beside "Install and restart", retry for a blocked install and a
  failed check, and the manual download where the cause recommends it.
- What's new is reached at its own group inside the section (menu, palette,
  macOS Help, About, the startup toast). The changelog dialog goes away, and an
  offered release with no highlights shows its notes as plain text there.
- The update dialog stays only for a restart that did not land on the new
  version. It is the one case that interrupts.
- The More actions trigger carries a dot while a release can be downloaded,
  installed or retried, and the menu entry's label follows the state. The macOS
  menu entry's label follows it too.
- `DESIGN.md`, `docs/ARCHITECTURE.md` and an ADR record the rule.

# Out of scope

- A notification for a download that finishes while Settings is closed.
- Downloading or installing without the reader pressing the button.
- Git and gh tool updates in Settings, which keep their own rows.

# Acceptance criteria

- [x] Menu, macOS menu, palette, notification, About, the startup toast and the
      rail all open Settings › Updates; none opens a modal.
- [x] A check runs only from idle, current, cancelled, unavailable or failed
      states; available, downloading, verifying, ready, blocked and installing
      open the section without a check.
- [x] Download, cancel, progress, install and retry work from the Settings row
      with no dialog.
- [x] What's new opens at its group in the section; `ChangelogDialog` is removed.
- [x] A wrong-version restart still opens its own dialog with Check again and
      the manual download.
- [x] The More actions trigger shows a dot, with an accessible name, while an
      update needs attention, and the entry names the next step.
- [x] Tests cover the routing guard, the inline lifecycle and the menu label.
- [x] `pnpm run check` passes.

# Relevant files

- `src/app/App.tsx`
- `src/app/AppOverlays.tsx`
- `src/app/TitlebarMenu.tsx`
- `src/app/nativeAppMenu.ts`
- `src/features/app-updates/`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`

# Dependencies

None.

# Decisions

- Settings › Updates is the home because it already held the state, the
  manual download, What's new and the startup switch. Progress there was
  already drawn by the mascot.
- The update dialog stays only for the unconfirmed restart: the reader expected
  a new version and is not on it, which needs saying before anything else.
- The ambient signal is a dot on the More actions trigger, not a title-bar pill.
  It takes no room in the bar, and on macOS it becomes the menu entry's label.
- Implemented ahead of task 213 at the maintainer's request.

# Implementation notes

- `features/app-updates/domain.ts` gains `updateNeedsAttention` (available,
  ready, blocked) and `checksOnOpen` (idle, current, cancelled, failed, and
  unavailable outside a development build). `translations.ts` gains
  `updateMenuLabel`, which both menus read.
- `AppUpdateSettingsControl` carries the lifecycle in the shared installation
  row: progress in the `detail` slot (outside the announced status), the
  install consequence in `hint`, Cancel or the manual download in `recheck`,
  and one contextual primary. A block a retry cannot clear has no primary.
  What's new shows an offered release's plain notes when its feed has no
  highlights, and takes focus when opened from a "What's new".
- `AppUpdateDialog` became `AppUpdateRestartDialog`, which only the
  wrong-version startup receipt opens; its Check again closes onto Settings
  and checks there. `ChangelogDialog`, its styles and its five unused
  translation keys are removed; the release-model tests moved to
  `src/app/appRelease.test.ts`.
- `App.tsx` routes every entry through `openAppUpdates({ check, whatsNew })`.
  Opening another section or reopening Settings clears the What's new landing.
- `TitlebarMenu` drops its What's new entry, takes `appUpdateLabel` and
  `appUpdateAttention`, and draws the bell's dot on its trigger. The macOS
  menu entry's text follows the same label and updates in place.
- `DESIGN.md`, `docs/ARCHITECTURE.md` and
  [ADR 0044](../../../docs/adr/0044-give-application-updates-one-home.md)
  record the rule.
- Review follow-up the same day: the "Other ways to update" group folded into
  the row. The manual download is the row's quiet external-link button, like
  the Git and gh guides, and the labelled secondary where a cause recommends
  it, so it is never offered twice.
- Second review the same day: the chip names the offered version ("0.6.0
  available") with no second line; "up to date" says when it was checked;
  work in flight and a development build have no primary (no grey button
  repeating the chip), and work in flight hides the manual link; the
  startup switch joined the app's group, with What's new last. Every state
  was measured in the Settings layout at 852 and 1000 px, in English and
  Spanish, light and dark: no overlap, no wrapped chip or head.
- Third review the same day: the repeat check was a 24-hour timer that only
  fired in a session open for a whole day. The controller now asks every hour
  whether a wall-clock day has passed since the last check of any kind, so a
  laptop that slept for days with GitOdile open checks soon after waking, and
  a manual check resets the day. The switch became "Check for updates
  automatically" (it no longer only checks at startup), and its description
  fits one line in both languages at the narrowest dialog without repeating
  the label's verb or naming GitHub: "When GitOdile opens and once a day.
  Nothing from your projects is sent." ADR 0010 records the amendment.
- Fourth review the same day: the daily check, now that it fires, could run
  over a finished download and discard it (a native check replaces the
  offer). The automatic check skips "ready" and "blocked"; "available" may
  still be re-checked. A download that finishes while Settings is closed
  turns the update's notification into "X.Y.Z finished downloading", unread
  again even after the find was read (`finishedDownloadOutOfSight`, the
  optional `ready` field, stored only when true).
- Final review: the ready notification's title names the event rather than a
  state ("finished downloading", not "ready to install"), so the stored entry
  stays true after the install; a retryable failed automatic check (offline at
  launch) retries on the next hourly tick instead of a day later; the
  translation keys only the removed update dialog read (its titles, eyebrow,
  "Not now", "Release notes") are gone; two stale comments were corrected.

# Validation

- `pnpm vitest run src/features/app-updates src/app/appRelease.test.ts`:
  6 files, 58 tests passed.
- `pnpm vitest run src/app/App.test.tsx src/app/aboutDialog.test.tsx
  src/app/TitlebarMenu.test.tsx src/app/issueReportFlow.test.tsx
  src/app/nativeAppMenu.test.tsx src/app/CommandPalette.test.tsx
  src/app/appShell.test.tsx`: passed after the App test rewrite.
- Browser harness on the running Vite server (removed afterwards): the menu
  entry read "Actualizar a 0.6.0…" with the trigger's dot and accessible name;
  Download showed the bar, the filling mascot and Cancel in the row; Ready
  showed the install consequence beside "Instalar y reiniciar" and the dot
  returned. Checked in the light and dark GitOdile themes.
- Full gate on 2026-11-03: `pnpm run check:docs` and `pnpm run check:frontend`
  passed (166 files, 1,935 tests, build); `pnpm run check:rust` passed with
  `CARGO_TARGET_DIR` in a scratch folder because `tauri dev` held the shared
  target (694 tests). After the last Settings-section edit, `pnpm run typecheck`,
  the App and About tests (46) and `pnpm run check:docs` passed again.
