---
id: 175
title: The Updates row shows the whole mascot at work and a check that reads as one
status: done
priority: normal
type: design
areas:
  - frontend
  - desktop
  - ux
created: 2026-10-15
completed: 2026-10-15
parent:
queue:
---

# Goal

Make Settings › Updates feel alive and honest: the app's row shows the whole
mascot, which hops while an update is checked, verified or installed and fills
up with a download; a check the user presses stays visible long enough to read
as a check; and a development build says calmly that it does not update itself,
with nothing to press.

# User outcome

Pressing "Check for updates" visibly checks instead of flashing straight to a
verdict. A download shows its progress in the mascot itself. Someone running a
development build sees "Development build" and one short line, not a yellow
warning that looks like a failure, and is not offered a check that can only
give the same answer.

# Context

The row used the mascot's head in its 32px tile and stayed still in every
state. In a development build the native updater has no update key, so a
manual check answered `unavailable` / `not_configured` within milliseconds:
the row jumped from "Checking" to a warning chip, which read as a broken
check. Only the brand moments (Home, About, the console welcome) may decorate
(DESIGN.md § Motion), so the new motion must carry state, not decoration.

# Scope

- `Mascot` gains a `hop` motion and a `progress` fill (0–1, from the feet up
  over a faint silhouette); the Updates row shows the whole body and picks the
  motion from the update state.
- The update controller holds a manual check's verdict until it has been
  visible for `MANUAL_CHECK_MINIMUM_MS` (800ms), shows "checking" from the
  press, and never holds background checks or checks under reduced motion.
- `not_configured` reads as a neutral "Development build" with a short line;
  native starts in that state, the row's check button is disabled, and the
  controller refuses the check from every entry point.
- DESIGN.md records the mascot's state motion, the minimum and the calm
  development build.

# Out of scope

- Any other update state's wording or tone.
- The update dialog's layout and the status bar's release button.
- Hiding the update entry points (menu, palette) in development builds.

# Acceptance criteria

- [x] The row's mascot hops while checking, verifying, installing or
      downloading without a known size, and is still otherwise.
- [x] A download of known size fills the body with its progress.
- [x] Reduced motion (system or app) removes the hop and the hold; the fill
      stays.
- [x] A manual check shows "checking" at once and its verdict no sooner than
      800ms after the press; background checks are never held.
- [x] The held "checking" offers no Cancel until native names an operation.
- [x] A build without an update key starts as "Development build" in a neutral
      tone, its check button is disabled, and no check reaches native.
- [x] Every other "unavailable" keeps its warning tone.
- [x] Unit tests cover the mascot, the controller hold and refusal, the row's
      states and the native initial snapshot.

# Relevant files

- `src/shared/ui/mascot.tsx`, `src/shared/ui/primitives.css`
- `src/features/app-updates/controller.ts`, `domain.ts`, `UpdateDialog.tsx`,
  `translations.ts`
- `src-tauri/src/app_updates.rs`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- **Hop over eye-scan or a progress ring.** Chosen by the user from a widget of
  options: the hop reads as "waiting" even at 24px, where an eye movement is
  invisible.
- **The fill is state, not motion.** It stays under reduced motion and only
  loses its easing, because it is the download's progress itself.
- **Hold the verdict, not the work.** Native finishes at its own pace; only the
  publication of a manual check's result waits for the minimum, following the
  tool rows' 500ms recheck precedent.
- **Native knows a development build at startup.** `BuildUpdateIdentity` is
  local, so the initial snapshot can say `not_configured` without a network
  call; the alternative, discovering it on the first press, left a check button
  that could only ever fail.

# Implementation notes

- `Mascot` (`src/shared/ui/mascot.tsx`): `motion="hop"` adds
  `gitodile-mascot--hop`, animated from the feet in primitives.css under
  `prefers-reduced-motion: no-preference` (the app's own switch stops it in
  base.css). `progress` draws the artwork twice: a faint `__pending` copy and a
  copy clipped by a box-sized rect slid down by what is missing, eased by a
  transition that system reduced motion removes. `data-progress` exposes the
  clamped percentage for tests.
- `AppUpdateSettingsControl` maps the state to the mascot in
  `mascotForState`; the tile CSS keeps the 24px width, so the body fits the
  same 32px circle the head did. The head variant is no longer used in the app
  but stays for brand material.
- `createAppUpdatesController`: `check("manual")` publishes a placeholder
  `checking` with an empty operation id, then `publishSettled` holds the
  verdict until `MANUAL_CHECK_MINIMUM_MS` after the press. `cancel()` and the
  dialog's Cancel ignore the empty id. `manualCheckMinimumMs` is injectable so
  tests can turn the hold off.
- `isDevelopmentBuild` lives in `domain.ts` and drives the neutral chip and
  line, the disabled row button and the controller's refusal to check.
- `app_updates.rs`: `initial_snapshot` starts the service as
  `Unavailable { not_configured }` when `BuildUpdateIdentity::current()` says
  so; a failed post-install confirmation still wins.
- Review pass: added `transition: none` for the fill under system reduced
  motion, which the first version missed. The menu and palette entries still
  open the dialog in a development build, where it explains itself; hiding
  them stays out of scope.

# Validation

- `pnpm run check:docs` — passed.
- `pnpm run check:frontend` — passed (architecture, typecheck, 143 files /
  1529 tests, build).
- `cargo fmt --check` and `cargo clippy --all-targets --all-features -D warnings`
  — passed.
- `cargo test --lib --all-features` — 602 passed, 1 ignored.
- `pnpm run check` as a whole stopped at `cargo test --all-targets`: Windows
  denied replacing `target/debug/gitodile.exe` while the user's `tauri dev`
  was running it, so the binary's own test targets did not run.
- Browser harness (since deleted) confirmed the hop animation and the fill
  level at the tile's real size.
