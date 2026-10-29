---
id: 037-6-2
title: Put the resolve actions on the overlapping-changes screen
status: done
priority: high
type: feature
areas:
  - conflicts
  - frontend
  - accessibility
created: 2026-10-29
completed: 2026-10-29
parent: "037-6"
queue:
---

# Goal

Let the user keep a side, delete, mark a file resolved and reset it from the
overlapping-changes screen, seeing what a choice discards before making it.

# User outcome

The user resolves a merge's files without a terminal, can change their mind,
and is never surprised by what a button did.

# Context

Uses the commands of [037-6-1](037-6-1-resolution-core.md) on the screen of
[037-3](037-3-read-only-conflict-workspace.md). The look was decided in
the mockup review recorded in the parent [037-6](../0.5.0/037-6-resolve-files.md).

# Scope

- An action bar under the file's header strip: Keep each side (named by its
  branch), Delete where a side deleted the path, a `⋯` menu holding Reset, and
  Mark resolved as the primary.
- Choosing a side asks in place, replacing the bar: what the other side loses,
  with its column dimmed and labelled, Cancel and the verb.
- After a choice the row and bar say which side was kept and that the file is
  not marked resolved yet.
- Mark resolved: a plain-language explanation the first time, technical
  details with the exact command, and a confirmation when markers remain.
- Reset: an `s` dialog in the `danger` tone, the safe fact last.
- Loading, running, stale, blocked and error states; the project mutation
  slot; one coordinated refresh; focus returns to the file.
- English and Spanish; `DESIGN.md` § Overlapping changes updated.

# Out of scope

- Opening the user's editor and the classes 037-6-3 blocks.

# Acceptance criteria

- [x] Every allowed action is reachable with the keyboard and announces its
      result; nothing relies on hover or colour alone.
- [x] A side choice names what it discards before it runs.
- [x] Stale, locked and refused outcomes keep the screen honest and offer the
      way out.
- [x] Both themes, both locales and the narrow layout are checked running.
- [x] Frontend tests and `pnpm run check` pass.

# Relevant files

- `src/features/conflicts/`
- `DESIGN.md` § Dialogs, § Overlapping changes

# Dependencies

Task 037-6-1.

# Decisions

See the parent's decisions of 2026-10-29.

# Implementation notes

2026-10-29:

- **Port and controller.** `ConflictsPort` gained `keepSide`, `markResolved`
  and `resetFile`, each answering with the fresh session. The controller's
  `mutate` publishes that session as the cached one and bumps the generation,
  so a read started before the mutation can no longer overwrite it; a
  failure leaves the session the reader decided from.
- **Slot and refresh.** `ProjectMutationKind` gained `resolve`. The screen
  takes the slot through `startLocalOperation(path, "resolve")` (the branch
  path's lock, refused while another project's operation runs), reports its
  phases, and on success calls `handleMutationSucceeded` — the one
  coordinated refresh. That refresh's status snapshot reads the session once
  more (about 3 Git processes); a shortcut around it was not worth a second
  freshness rule. `hasBlockingDialog` holds project switching while it runs.
- **Rust.** A reset whose snapshot could not keep the working content now
  fails as `conflict_content_not_kept` (was `recovery_unavailable`, which
  also meant "no original at all"), so the screen offers the overlap alone
  only when that is the case. English and Spanish copy, IPC contract.
- **Screen.** `FileResolution.tsx` owns the bar, the questions asked in its
  place, the notices and the Reset dialog; `fileActions`, `discardedSide`,
  `keptChoice` and `executableSide` in `domain.ts` decide what it offers
  from `allowedActions` and `kept`. The first-use explanation of Mark
  resolved is remembered in `localStorage`
  (`gitodile.conflicts.markResolvedExplained`), per computer. The selected
  file is pinned when an action starts, so a file that moves to the
  resolved group stays selected. Open in editor stays for 037-6-3.

# Validation

2026-10-29, Windows 11:

- `pnpm vitest run src/features/conflicts`: 3 files, 28 tests, each under
  400 ms.
- Browser harness (fixtures, fake port, since removed): keep a side with
  its in-place question and the dimmed column, delete, Mark resolved with
  the first-use explanation, markers and the permission question, Reset
  and Reset the overlap only; light and dark GitOdile themes, English and
  Spanish, 1400 px and 600 px wide, keyboard only for the menu and dialog.
  Focus returns to the asking button on Cancel/Escape and to the file's
  name after a change.
- Running app (`tauri dev`, driven through WebView2's remote debugging,
  since screen capture does not see the webview), on a real merge made in
  a terminal with five overlaps (two text, markers left, delete/modify, an
  executable bit on one side): kept “feature” in a file and marked it
  (`M` in the index, the kept stage exactly); marked a file with markers
  left after the warning; marked the executable one after the permission
  question (`100755` at stage 0); kept “main” and marked it; deleted the
  delete/modify file and marked it; reset a resolved file and a marked one
  back to their three original stages and the merge's bytes. Dark and
  light themes, a 720 px window (stacked sides, no horizontal scroll),
  Escape returning focus to the button that asked. Spanish was checked in
  the harness only.
- The running app found two bugs the harness and tests had not:
  - The bar stayed busy for good after any action in development:
    StrictMode mounts effects twice and the mounted flag was only ever set
    to false. Fixed, and the screen tests now render under StrictMode,
    which fails four of them on the old code.
  - Mark resolved with a chosen permission staged the file with `git add`
    and then failed: `update-index --chmod` was given the `:(literal)`
    pathspec, which it reads as a file name, leaving the file staged with
    the other permission. The permission now goes in with the content in
    one command (`git add --chmod=±x -- :(literal)<path>`, Git 2.9+); the
    class test marks an edited `mode.sh` as a program and checks `100755`
    (it fails on the old code).
- `pnpm run check`: exit 0 before these fixes (1,798 frontend tests; Rust
  663 passed, 1 ignored), and again after them in one pass (same counts).

# Review

2026-10-29, a code review before closing:

- `git add --chmod` replaced the two-step `add` then `update-index`, so a
  failure can no longer leave a file staged with the wrong permission.
- `keptSide` in `domain.ts` replaced four copies of the choice-to-side
  expression; the Reset dialog's close guard is a plain `useCallback`.
- After the review: `pnpm vitest run src/features/conflicts` 28 passed;
  the Rust class test passed; `pnpm run check` exit 0.
