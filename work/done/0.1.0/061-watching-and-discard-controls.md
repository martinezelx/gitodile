---
id: 061
title: Put change watching and discard confirmation under the user's control
status: done
priority: normal
type: feature
areas:
  - frontend
  - ux
  - safety
created: 2026-08-15
completed: 2026-08-17
---

# Goal

Two controls the app currently decides on its own: whether it watches the
working tree for changes, and whether discarding changes asks first.

# User outcome

Someone working on a huge repository or a network drive can stop the automatic
refresh instead of living with it. Someone who discards changes often can stop
being asked — deliberately, once, rather than by clicking through a dialog
every time.

# Context

These two are grouped because each is small on its own and both are about the
same thing: a behavior the app currently fixes, that a user has a legitimate
reason to want the other way.

Task 019 designed watching and task 020 delivered it. `work/backlog.md` already
flags the open risk — "Design repository watching, cancellation, and
large-repository performance tests before adding continuous background
refresh" — and the large-repository test suite is still unrefined there. A
switch is the honest interim answer while that measurement is outstanding.

`DiscardChangesDialog` always confirms. That is the right default and must
stay the default; this task only makes it a choice.

# Scope

- A "watch this project for changes" preference in the Settings General
  section, default on, honored by the watcher orchestration.
- A "confirm before discarding changes" preference in the Safety group,
  default on, honored by the Changes discard flow.
- When watching is off, the Changes screen must say so and offer a manual
  refresh — an unwatched screen that looks live is worse than no watching.
- Extend the task-057 "reset this section" to cover both.

# Out of scope

- A configurable watch interval or debounce. Off/on first; a number needs the
  benchmark from the backlog to pick a range honestly.
- Turning the discard confirmation off *by default*, now or later.
- The large-repository performance suite itself, which stays in the backlog.

# Acceptance criteria

- [x] With watching off, no filesystem watcher is registered for the project —
      asserted, not assumed.
- [x] With watching off, the Changes screen states that it is not updating
      itself and offers a refresh.
- [x] Turning watching back on re-registers the watcher and refreshes once,
      without requiring the project to be reopened.
- [x] With the discard confirmation off, discarding proceeds directly; with it
      on, the existing dialog is unchanged.
- [x] Both preferences default to on and survive a restart.
- [x] Full `pnpm run check` passes.

# Relevant files

- `src/features/changes/ChangesPanel.tsx`, `directDiscard.ts` (new),
  `translations.ts`, `changes.css`
- `src/features/settings/SettingsPanel.tsx`, `translations.ts`
- `src/app/preferences.ts`, `watcherPlan.ts` (new), `AppOverlays.tsx`
- `src/main.tsx`
- `src-tauri/src/watch.rs`, `lib.rs` — read, unchanged; see the decision below

# Dependencies

Extends the General and Safety groups from task
[057](057-right-size-settings-and-about.md).

# Decisions

- **With the confirmation off there is no dialog at all, not a dialog that
  only reports.** Keeping `DiscardChangesDialog` in an auto-confirm mode was
  the smaller change, but it still costs the click this task exists to remove:
  "stop being asked" is not satisfied by being told and then having to close a
  modal. The discard runs and the Changes header reports the outcome in place.
- **The Undo stays, and that is what keeps this inside the safety rules.**
  AGENTS.md requires explicit confirmation *and* a recovery strategy for
  destructive operations. Turning the preference off is the explicit consent,
  given once and deliberately; Rust still creates the recovery record it
  always did, and the header notice offers Undo beside the result. Nothing in
  Rust's plan/validate/recover path changed.
- **Restoring keeps its dialog whatever the preference says.** The preference
  is about being asked before throwing work away. Restoring is the recovery
  action, not the destructive one, so `mode: "restore"` never takes the direct
  path.
- **The watch preference is app-wide, not per project.** The scope wording
  says "this project", but the watcher registers every open session from one
  effect and the motivating case (a huge repo, a network drive) is about the
  machine the user is on. A per-project switch would need per-project storage
  that nothing else here has. The copy says "open projects" so the control
  does not claim a scope it does not have.
- **No Rust change.** `watch_repository` is the only way a filesystem watcher
  comes into existence and the composition root is its only caller, so
  honoring the preference in the frontend *is* honoring it in the watcher
  orchestration. `watch.rs` and `lib.rs` were read and left alone.
- **The reconciliation loop became a pure function.** The criterion asks for
  "asserted, not assumed", and the effect it lived in is gated on
  `__TAURI_INTERNALS__`, which no test sets — asserting through `App` would
  have meant stubbing the Tauri global and, with it, the window and event
  APIs. `planWatcherChanges` is the whole rule and is tested directly.

# Implementation notes

- `src/app/preferences.ts`: two keys and two defaults, both `true`, beside the
  existing pair.
- `src/app/watcherPlan.ts` (new): `planWatcherChanges` decides what to
  register and unregister. With watching off the desired set is empty, so the
  same code path tears everything down and asks for nothing — which is also
  why turning it back on re-registers with no reopening.
- `src/main.tsx`: the watcher effect gained `watchProjects` as a dependency
  and delegates to the plan. A second, small effect watches the off→on edge
  and calls `repositoryReads.refreshAll` once for the active project;
  re-registering alone would only catch what changes *next*.
- `src/features/changes/directDiscard.ts` (new): the discard flow with the
  confirmation step removed. It still reads the plan first — that is what
  produces the state token the mutation is checked against — and claims the
  same session mutation slot the dialog does, so project switching and closing
  stay blocked while it runs.
- `ChangesPanel` gained `isWatching` and `confirmBeforeDiscarding`, one
  `requestDiscard` that both menus call, a warning line under the heading when
  watching is off, and a result notice with Undo under the header.
- The result notice is its own local component (`DiscardOutcomeNotice`), the
  shape this file already uses for its header widgets, and carries one fixed
  `role="status"`. The first draft swapped that role to `alert` for the
  failure case — but the region is already on screen showing "Discarding…" by
  then, and changing a live region's role in place is the update screen
  readers are least reliable about announcing. The danger border and icon
  carry the severity instead.
- Settings: a "Live updates" group in General and a second row in Safety.
  "Reset this section" covers all four General controls.
- README's capability list and the backlog's watching entry were updated;
  the backlog keeps the large-repository suite, which a measured watch
  *interval* still depends on.

# Validation

- `pnpm run check` — exit 0. Documentation check over 95 Markdown files and 63
  task ids; frontend architecture check over 247 modules; 42 frontend test
  files / 361 tests passed; Vite build; `cargo fmt --check`, Clippy with
  `-D warnings`, and 244 Rust tests passed.

Measured in the running dev server at 1280x840, Spanish (the longer of the two
languages), with the Settings dialog at 880x640 and its panel 559px tall:

| Section | `scrollHeight − clientHeight` |
| --- | ---: |
| General | 0 |
| Interface | 0 |
| Reading | 0 |
| Git | 0 |
| Line endings | 0 |

The first draft of the two new descriptions was two lines each and pushed
General 9px past its panel — the first version of this measurement caught it.
Both were cut to one sentence, which took the rows from 61px back to 42px and
brought the section back inside. Toggling watching off wrote
`gitodile-watch-projects=false`, and "Reset this section" put it back to
`true` and disabled itself again.

**The Changes screen itself could not be opened through the app.** Opening a
project needs Tauri, so that screen is unreachable in a plain browser — the
same limit task 058 recorded. The watch-off notice, the direct discard, its
Undo, and the unchanged dialog path are covered by component tests in
`src/changesPanel.test.tsx` instead.

Its two new pieces were still measured rather than assumed, by mounting them
inside the running shell so the real tokens applied:

- `.changes-notice` lays out as one row at 956x65 — icon 18px, message taking
  the flexible middle at 696px, Undo at 146px, dismiss at 26px. Nothing
  collapses, wraps, or overlaps.
- `.changes-header__watch-off` renders as a 13px flex row and contrasts
  **5.54:1** on the light background and **10.31:1** on the dark one, both
  above the 4.5:1 AA floor for text that size.
