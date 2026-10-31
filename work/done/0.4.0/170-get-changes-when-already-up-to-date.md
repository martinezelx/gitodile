---
id: 170
title: Get project changes ends calmly when nothing is newer
status: done
priority: normal
type: bug
areas:
  - frontend
  - sync
  - ux
created: 2026-10-14
completed: 2026-10-14
parent:
queue:
---

# Goal

Get project changes on a project that is already up to date answers with a
toast instead of swapping its loading dialog for a warning, waits for the
remote check before answering, says so when the remote could not be asked,
and is no longer offered by Changes where the last answer was "nothing is
waiting".

# User outcome

Pressing Get project changes when nothing is newer no longer shows one dialog
and then another: the project says it is up to date on a toast. When the last
check of the remote was old, the dialog keeps loading until the remote has
answered, so it never says "nothing" and then turns into a plan. When the
remote cannot be reached, the dialog says that and offers to try again rather
than claiming the project is up to date. On Changes, a settled or
unpublished-only branch offers "Check for project changes" — the same read-only
check as Overview and the status bar — instead of a get that can only find
nothing.

# Context

Reported from the Changes screen with nothing to download: the medium
loading dialog appeared and was replaced, a moment later, by the small
"The update stopped safely" alert. The local plan answers `nothing_to_get`
before the background check of the remote returns; the dialog treated that
answer as a block (warning tone, `error` phase) and, once the check finished,
planned again from the block — repeating the error, or turning the alert into
a plan when the remote did have versions. The flow and the fix were reviewed
in an artifact before implementation; the "Checking origin…" note during
loading was dropped in review — the loading bar is enough.

Overview already offers Get only when versions are known to be waiting and
leaves the check to the status bar's cloud. Changes' empty state offered Get
in its `up-to-date` and `ahead` states, which was the conceptual mismatch.

# Scope

- `GetTeamChangesDialog`: `nothing_to_get` closes on an up-to-date toast with
  the `success` phase; while a background check is pending it is held and the
  dialog keeps loading; the loading shell appears only after 150 ms.
- After the background check, plan again only from loading or from a
  non-deterministic block; `nothing_to_get` leaves the deterministic list.
- A failed background check that leaves nothing to get shows "Couldn't check
  project changes" with the reason, what is known locally, and `Try again`
  (which asks the remote again).
- `SyncController.checkBeforeGet`: the dialog's check, rejecting with the
  mapped reason when the remote could not be asked.
- Changes empty state: "Check for project changes" replaces Get in `ahead`
  and `up-to-date`, disabled with a spinner while a check runs; App shares
  one `checkTeamChanges` across Overview, the status bar and Changes.

# Out of scope

- Rust planning or error codes.
- What the dialog shows when a background check fails while a plan with
  versions is already on screen (unchanged: the plan stays).
- Overview and status bar behaviour.

# Acceptance criteria

- [x] Up to date with a recent check: a toast, no dialog, phase `success`.
- [x] Up to date with an old check: loading only, then the toast after the
      remote answers; no alert in between and no repeated `error` phase.
- [x] Old check that finds versions: loading, then the plan in the same shell.
- [x] Old check that fails: "Couldn't check project changes" with the reason
      and local knowledge; `Try again` checks the remote again.
- [x] Changes `up-to-date` and `ahead` offer "Check for project changes"
      instead of Get; it is disabled and busy while a check runs.
- [x] Tests for each case; English and Spanish copy.

# Relevant files

- `src/features/sync/GetTeamChangesDialog.tsx`
- `src/features/sync/controller.ts`
- `src/features/sync/translations.ts`
- `src/features/changes/ChangesPanel.tsx`
- `src/features/changes/translations.ts`
- `src/app/App.tsx`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- Up to date is a result, so it is a toast (DESIGN.md: a result with no next
  step is a toast). A failed remote check is a real failure that a retry may
  pass, so it is an alert with `Try again`.
- Changes offers the check rather than nothing (option b of the review): the
  screen keeps a way to ask, and a check that finds versions moves it to
  "behind", whose primary action is Get.
- The loading shell is delayed rather than skipped, so a slow plan or a remote
  check still shows progress.

# Implementation notes

- `GetTeamChangesDialog.tsx`: `planFailedRef` routes every plan failure.
  `nothing_to_get` is held as loading while `refreshPendingRef` is set (also
  when it comes from a stale update, which otherwise stayed on "Getting…" with
  nothing left to wake it), becomes the `unchecked` state when
  `refreshFailureRef` recorded a failed check, and otherwise closes on
  `getTeamUpToDateToast` with the `success` phase. `upToDateRef` keeps it to
  one toast. The shell is hidden for `SHELL_DELAY_MS` (150 ms) while planning,
  and `useModalFocus` follows the shell. The check effect re-runs with
  `Try again` (`retryToken`); its cleanup clears the pending flag and the
  refreshing note so a cancelled check never holds a plan back.
- `controller.ts`: `checkBeforeGet` wraps `check` and rejects with the mapped
  reason the runtime recorded. A superseded check still resolves to null
  (`startTeamSyncRequest` clears the error, so a stale reason cannot leak).
- `ChangesPanel.tsx`: `checkRemote` action with `busy`; `ahead` and
  `up-to-date` use it instead of Get.
- `App.tsx`: one `checkTeamChanges` for Overview, the status bar and Changes.
  Changes' check also re-reads the working tree when the watcher is not
  watching, because its ahead/behind comes from that snapshot and only the
  watcher hears the fetch move the tracking ref.
- Review fixes before completion: the stale-update dead state above, the
  cancelled-check flags, and the watcher-off refresh.
- `DESIGN.md`: "Being up to date is an answer, not a stop".

# Validation

- `pnpm exec vitest run src/features/sync src/features/changes/ChangesPanel.test.tsx src/app`
  — 18 files, 293 tests passed.
- The stale-update test was confirmed to fail with its fix removed.
- `pnpm run check:docs`, `pnpm run check:architecture` and
  `pnpm run check:frontend` passed (140 files, 1478 tests, build ok).
- `cargo fmt --check` and `cargo clippy -D warnings` passed; `cargo test` could
  not run because the running GitOdile instance locks
  `src-tauri/target/debug/gitodile.exe` (os error 5). No Rust code changed.
- Not exercised in the running app.
