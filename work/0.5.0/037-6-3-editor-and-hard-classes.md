---
id: 037-6-3
title: Open overlapping files in the user's editor and block the hard classes
status: active
priority: high
type: feature
areas:
  - conflicts
  - frontend
  - rust
  - platform
created: 2026-10-29
completed:
parent: "037-6"
queue: "02"
---

# Goal

Open an overlapping file in the user's own application, reconcile what they
did there from fresh state, and give the classes no whole-file choice can
handle an explicit, safe block with a next step.

# User outcome

The user edits a file in their editor, comes back, and is told if conflict
markers remain; a folder in the way, a case-only collision or an unreadable
path explains what to do instead of failing.

# Context

Completes the parent [037-6](037-6-resolve-files.md) after
[037-6-1](../done/037-6-1-resolution-core.md) and
[037-6-2](037-6-2-resolution-actions-ui.md). Today only
`reveal_project_file` exists; nothing opens a file in an application.

# Scope

- `open_conflict_file(path, filePath)`: the system's default application for
  the file, behind the containment check of `reveal_project_file`; a type the
  system would run instead of open (Windows `PATHEXT` and shortcut types,
  macOS applications and `.command`, Linux executables and `.desktop`) is
  refused and offered Show in folder. Opening never changes a file's state.
- `check_conflict_working_file(path, filePath)`: a bounded read saying whether
  conflict markers remain, read after an invalidation shows the file edited.
- Blocks with a next step: a folder in the way, two paths that differ only by
  case where the file system cannot hold both (and a write-time check that the
  name on disk matches exactly), a non-UTF-8 path, a marker check that cannot
  be made (UTF-16, binary).
- The desktop pass of the whole parent: a real conflicted merge made in a
  terminal, each side kept, files opened in the editor, marked resolved and
  reset, in the light and dark themes.

# Out of scope

- Choosing an editor in Settings; finishing or aborting the merge.

# Acceptance criteria

- [ ] Opening an editor never implies resolution; remaining markers are flagged.
- [ ] Nothing the system would execute is opened.
- [ ] Every class in epic 037 has a tested whole-file path or a deliberate,
      explained limitation.
- [ ] Desktop validation in both themes is recorded; `pnpm run check` passes.

# Relevant files

- `src-tauri/src/desktop.rs`, `src-tauri/src/conflicts/`
- `src/features/conflicts/`

# Dependencies

Tasks 037-6-1 and 037-6-2.

# Decisions

See the parent's decisions of 2026-10-29.

# Implementation notes

# Validation
