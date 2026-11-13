---
id: 160
title: The console welcome keeps its height while the project is re-read
status: done
priority: normal
type: bug
areas:
  - frontend
  - design
created: 2026-10-11
completed: 2026-10-11
parent:
queue:
---

# Goal

Stop the console's welcome from jumping when files change in the open
project: the ASCII mascot moved and the prompt under it shifted every time the
watcher re-read the working tree.

# User outcome

With the console open on an empty transcript, editing files in the project
updates the "changes" figure in place. No row comes and goes, the mascot stays
where it is, and the prompt does not move.

# Context

Every watched edit starts a working-tree read, and while it ran
`consoleProjectStatus` dropped the tree it already had (`isCheckingChanges`),
so `changes` became `null`. The welcome left out the "changes" row while it was
`null`, and the "publish" row the same way during a remote check. The summary
lost a row and got it back a moment later. Because `.console-welcome__fetch`
centred its items vertically, the mascot re-centred each time and the tip and
prompt below moved with it. The provider row did the same once, when the host
was read after first paint. The console's status line blinked for the same
reason.

The session store already keeps the last `workingTree` and `teamSync.status`
while a re-check runs (`src/runtime/project/sessions.ts`). Only the console's
projection threw them away.

# Scope

- `consoleProjectStatus` keeps the last known tree and remote comparison while
  a re-check is in flight. It returns `null` only when the fact is unknown, the
  read failed, or the remote comparison is marked stale. It no longer takes
  `isCheckingChanges`.
- The welcome always draws the changes, publish and provider rows, with a dim
  "—" (`.console-welcome__unknown`) while the reading is unknown or failed.
- `.console-welcome__fetch` aligns its items to the top
  (`align-items: flex-start`), so a change in the summary's height can never
  move the mascot.
- DESIGN.md's console welcome paragraph describes the steady height.

# Out of scope

- The status bar, which already shows a spinner while it checks and is not
  drawn on the console screen.
- The branch row, which is absent only on a detached head or an unborn
  repository. That is a lasting state, not a reading in flight.

# Acceptance criteria

- [x] A watched edit no longer removes and restores the welcome's "changes" row.
- [x] A remote check no longer removes and restores the "publish" row.
- [x] The provider row is held with a dash until the host is read.
- [x] Unknown, failed and stale facts show a dash, never a stale number read as current.
- [x] The mascot is top-aligned with the summary.
- [x] Tests cover the projection while checking and the rows' constant count.
- [x] DESIGN.md describes the behavior.
- [x] `pnpm run check` run and recorded.

# Relevant files

- [Console status projection](../../../src/app/consoleProjectStatus.ts) and [its tests](../../../src/app/consoleProjectStatus.test.ts)
- [Console screen](../../../src/features/console/ConsoleScreen.tsx) and [its tests](../../../src/features/console/ConsoleScreen.test.tsx)
- [Console styles](../../../src/features/console/console.css)
- [App composition root](../../../src/app/App.tsx)
- `DESIGN.md` (console welcome)

# Dependencies

None.

# Decisions

- **Keep the last value rather than show "checking".** A watched edit re-reads
  the tree constantly, so marking every read would make the welcome flicker
  in a different way. The status bar is where the app shows that a check is
  running. A stale remote comparison (after a publish or a failed check) still
  clears to a dash, so a count is never shown as current when it may be wrong.
- **A dash over leaving rows out.** A row that waits on a reading keeps its
  place, so the summary's height does not depend on timing. For a project with
  no remote, "publish —" stays permanently. It reads as "nothing to compare",
  which is accurate.
- **Top alignment as well.** With every reading-dependent row held, the
  summary's height is already steady. Top alignment also covers rows that
  change for lasting reasons, such as the branch row on a detached head.

# Implementation notes

- After a console change, the status line can show the previous count for the
  moment the follow-up read takes. That is the same window the status bar
  covers with its spinner elsewhere.
- Review before committing found the provider row arriving after first paint
  with the same effect. It is now held with a dash too, and its test checks the
  dash before the read lands.
- `src/app/App.tsx` is CRLF in the working copy and LF in the index
  (`eol=lf`). It was edited in place and Git normalizes it.

# Validation

- `pnpm run check`, 2026-10-11: documentation (293 files, 210 task ids),
  app-update contract, release highlights, frontend architecture (587
  modules), TypeScript, Vitest (139 files, 1418 tests) and the production
  build passed. `cargo fmt --check` and Clippy passed. `cargo test
  --all-targets` could not start because the running development app held
  `src-tauri/target/debug/gitodile.exe` (`Acceso denegado`, os error 5). No
  Rust file changed.
- Not yet watched in the running app with live edits.
