---
id: 037-6
title: Resolve each overlapping file by side or in the user's editor
status: active
priority: high
type: epic
areas:
  - conflicts
  - frontend
  - rust
  - platform
created: 2026-08-18
completed:
parent: "037"
queue:
---

# Scope change (2026-10-27)

Originally "Handle non-text and structural conflicts honestly", after the text
editor of task 037-4. With `1.0.0` scoped to GitHub Desktop level (see epic
[037](037-guided-conflict-resolution.md)), this slice now resolves **every**
conflict class, text included, through whole-file choices and the user's own
editor. It absorbs the save/mark-resolved/reset contract that 037-4 used to
own; 037-4 moved to epic [206](../after-1.0/206-three-way-conflict-editor.md).

# Goal

Give every overlapping file a safe way to be resolved: keep one whole side,
delete or pick a rename destination where valid, or edit it in the user's
editor; then mark it resolved, or reset it to the original overlap.

# User outcome

The user resolves text, binary, rename, mode, symlink, directory/file and
submodule overlaps without a terminal, sees what each choice discards before
making it, and can change their mind.

# Context

Builds on the session, snapshot and stale-state contract of task 037-1 and the
read-only screen of task 037-3. Index stages are the source of truth; a file
is resolved only when the user marks it.

# Scope

- **Keep current version** / **Keep incoming version** for a whole file,
  **Delete** where a side is a deletion, and the valid rename destinations.
  Each action binds exact stage objects, modes and paths and shows a scoped
  preview of what is discarded.
- **Open in editor** (and file manager for formats GitOdile cannot show).
  Launch success is never resolution: GitOdile re-reads the file on return and
  warns when conflict markers remain.
- **Mark resolved** with path-separated `git add`/`git rm`; first-use
  explanation in plain language and the exact behaviour in technical details.
- **Reset this file** to its original stages and content from the snapshot,
  confirmed, refusing when newer work cannot be preserved.
- Revalidate object IDs, file state, mode, worktree hash, session epoch and
  snapshot before atomic, bounded writes or index changes.
- Symlink, submodule, invalid encoding, binary, rename/rename, directory/file
  and case-collision states get a working choice or an explicit, safe block
  with a next step.
- External edits are reconciled from fresh state; newer content wins on
  ambiguity.

# Out of scope

- In-app text editing, per-region choices and the three-pane editor (epic 206).
- Finishing or aborting the merge (037-5).
- Binary merging, semantic merging, recursive submodule resolution, automatic
  rename choice.

# Acceptance criteria

- [x] Every conflict class in epic 037 has a tested whole-file path or a
      deliberate limitation that cannot corrupt content, index, path or mode.
- [x] Side, delete and rename actions bind exact stage objects and paths, show
      what they discard, and are resettable.
- [x] Choosing a side, marking resolved and resetting are separate, stale-safe,
      verified local mutations; reset restores exact stages, content and mode.
- [x] Opening an editor never implies resolution; remaining markers are flagged.
- [x] Restart, external edit, watcher burst, project switch, linked worktree,
      lock, permission and interrupted outcomes keep their evidence.
- [ ] Cross-platform symlink, casing, mode, path, encoding and submodule fixtures
      preserve unrelated content byte-for-byte.
- [ ] Keyboard, focus, screen reader, both themes and locales, and narrow layout
      pass; Rust and frontend integration checks pass.

# Relevant files

- [Design](../../DESIGN.md) § Before designing a screen, dialog or panel, § Dialogs
- [Epic 037](037-guided-conflict-resolution.md)
- [037-1](../done/037-1-conflict-domain-and-recovery.md)
- [037-3](../done/037-3-read-only-conflict-workspace.md)
- `src-tauri/src/index.rs`
- `src-tauri/src/desktop.rs`

# Dependencies

Tasks 037-1 and 037-3.

# Decisions

- An honest blocked state is better than forcing unsupported content through a
  generic path.
- Choosing a side, marking resolved and finishing never imply one another.
- 2026-10-29 (user): split into three slices, each closing with
  `pnpm run check` green:
  [037-6-1](../done/037-6-1-resolution-core.md) (Rust commands and the resolution
  journal), [037-6-2](../done/037-6-2-resolution-actions-ui.md) (the actions on the
  screen) and [037-6-3](../done/037-6-3-editor-and-hard-classes.md) (the user's
  editor, reconciliation and the blocked classes, with the desktop pass).
- 2026-10-29 (user), from the mockup review: the file's actions sit in a bar
  under its header strip (Keep each side, Open in editor, a `⋯` menu with
  Reset, Mark resolved as the primary); choosing a side asks in place, as
  the forget row of Restore does, naming what the other side loses and
  dimming its column; Reset is an `s` dialog in the `danger` tone whose safe
  fact says the current version is kept.
- 2026-10-29 (user): Open in editor uses the system's default application
  for the file, never `GIT_EDITOR` (a shell command line), and refuses any
  type the system would run instead of open, offering Show in folder.
- 2026-10-29 (user): whatever an action replaces after the snapshot was taken
  is copied into a resolution journal beside it first (an amendment to
  ADR 0041), so no action loses an edit made in the user's editor.
- 2026-10-29 (user): a submodule's side is chosen in the index only
  (`update-index --cacheinfo 160000`), which also marks it resolved; its
  folder is never switched.

# Implementation notes

Record the class/action matrix, write and index paths, editor reconciliation,
and platform limitations.

# Validation

Record the fixture corpus, byte/mode/path assertions, desktop checks and
focused command output.

2026-10-29: each slice records its own; the
[037-7](../done/037-7-conflict-workflow-audit.md) audit checked the whole on Windows.
Two criteria stay open with epic 037's blocker: the cross-platform fixtures
(real links, the executable bit and a case-sensitive disk need macOS or
Linux) and a real screen reader.
