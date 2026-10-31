---
id: 092
title: Offer recent projects on the welcome screen
status: done
priority: normal
type: feature
areas:
  - frontend
  - accessibility
created: 2026-08-30
completed: 2026-08-30
parent:
queue:
---

# Goal

Remember the projects this machine has opened and list them on the welcome
screen, so getting back into yesterday's work is one click instead of a trip
through the folder picker.

# User outcome

Someone who closed their project — or turned off "reopen last project" — comes
back to a front door that already knows what they work on. They recognize the
row by the project's own avatar colour and initials, the same ones the rail and
the switcher use, and a row they no longer want is removed on the spot.

# Context

`gitodile-projects` is the set of projects *currently open*, written on every
session change; closing a project erases it from storage, which is exactly the
moment a recents list becomes useful. So a recents list needs a store of its
own rather than a read of that one.

Task 091 turned this screen into a launcher for creating, opening and cloning.
All three are ways to start something *new*; the most common intent on a front
door — "let me back into the thing I had" — had no entry point at all.

# Scope

- A `gitodile-recent-projects` store: canonical path plus display name,
  newest first, capped, with corrupt or foreign JSON read as empty.
- Record a project when its session appears, so every route into a project
  (picker, clone, initialize, restore, drop) records it once.
- List the newest few under the welcome launcher, with the project's avatar,
  name and path.
- Open a row through the same path as the folder picker.
- Remove one row permanently.
- Localize every new string in English and Spanish.

# Out of scope

- Pinning, searching or grouping recents.
- Validating that a stored path still exists before showing it.
- A settings control to clear the whole list.

# Acceptance criteria

- [x] A project opened through any route appears at the top of the list.
- [x] Reopening a project promotes it instead of duplicating it.
- [x] A row's accessible name is the project name and its path is the
      description.
- [x] Removing a row updates both the screen and the store.
- [x] Opening a row never reaches the folder picker.

# Relevant files

- `src/runtime/project/recentProjects.ts`
- `src/app/App.tsx`
- `src/features/overview/OverviewPanel.tsx`
- `src/features/overview/overview.css`
- `src/shared/ui/projectAvatar.ts`

# Dependencies

Task 091 built the welcome screen this section sits under.

# Decisions

- **A separate store, not a read of the session store.** Same privacy envelope
  (canonical paths and display names, nothing else), opposite lifetime: the
  session store forgets a project on close, this one is *for* closed projects.
- **Recorded from sessions appearing, not per call site.** Opening a folder,
  finishing a clone, initializing a project, restoring last session and
  dropping a folder all end in the same `"open"` dispatch. One effect over
  `sessionsState.order` records them all; five `rememberRecentProject` calls
  would have to be kept in sync forever.
- **Stale rows are kept, not pruned.** A row whose folder has moved fails
  through the normal open path, with the normal message. Silently dropping
  rows would make an unmounted drive look like data loss.
- **`projectAvatar.ts` moved into `shared/ui`.** ADR 0003 admits a primitive
  there on its second real consumer; task 041 left this one in the project
  switcher for exactly that reason, and this list is the second consumer.
  Features may not import `src/app/**` (`check:architecture`), so the move is
  also what makes the avatar reachable from Overview at all. The barrel is
  already in the eager entry chunk through `branches`, so the two pure
  functions cost nothing extra there.
- **Open reuses `handleOpenProject` with a preselected path** rather than a
  second open routine, so a recent row inherits validation, already-open
  handling, the announcement and the "not a project yet" recovery.

# Implementation notes

`WELCOME_RECENTS_VISIBLE` (5) is what the screen shows; `RECENT_PROJECTS_LIMIT`
(12) is what the store keeps, so closing a project does not truncate the tail
of the list.

# Validation

Measured in the running dev preview with three seeded entries: rows 512×45,
avatars 24px circles at `--radius-round`, remove buttons 32px at
`--radius-item` (0.31 of the side, clear of the failed-circle band), no
horizontal overflow. Contrast in dark: name 18.97:1, path and section title
7.72:1, avatar initials 4.51–4.67:1 on their palette colours. Accessible names
resolved to the three project names with the three paths as descriptions.

Covered by `src/runtime/project/recentProjects.test.ts` and two App tests
(listing, opening without the picker, forgetting, and recording newest-first).

```bash
pnpm run check
```

Passed on 2026-08-30: documentation over 148 Markdown files and 115 task ids,
frontend architecture, TypeScript, 491 frontend tests over 60 files, the Vite
build, `cargo fmt --check`, Clippy with `-D warnings`, and the Rust test
suites.
