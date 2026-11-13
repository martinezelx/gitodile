---
id: 150
title: Reopen the last project at launch without flashing other screens
status: done
priority: normal
type: fix
areas:
  - frontend
  - overview
created: 2026-10-07
completed: 2026-10-07
parent:
queue:
---

# Goal

With **Reopen projects** on, launch goes straight to the project the user
left active. No other open project and no launcher appears on the way.

# User outcome

Someone who closed GitOdile on project B (with A and C also open) opens the
app and sees Overview's own shape, then B. The first frames show neither A
and C nor the Home launcher with its recent projects.

# Context

The owner reported two flashes of a few milliseconds at launch, each making
the start feel unpolished:

1. **Other projects.** Restore revalidated each stored path in turn and
   dispatched `open` for it. `open` makes the opened project active, so
   Overview drew A, then B, then C, and only at the end activated the stored
   active project. Each transient activation could also start reads for a
   project that was about to be hidden.
2. **The launcher.** The first view is already Overview when restore is on,
   but Overview without a project falls back to `WelcomeScreen`, the same
   launcher as Home. Until revalidation answered, that launcher showed.

This is a standalone fix, outside any epic.

# Scope

- A `restore` action in the project-sessions reducer that adds every
  revalidated project and sets the active one in one transition.
- Revalidate the stored paths concurrently, keeping their stored order.
- While restore is running, Overview draws a loading placeholder in its own
  shape (header, journey band, Changed files and Recent history) instead of
  the launcher.
- Share the Changed files and Recent history first-load lists between their
  cards and that placeholder.

# Out of scope

- Opening the active project first and adding the rest in the background
  while it is shown. Proposed during the change and left out, because
  restore now takes as long as the slowest project instead of the sum of
  all of them.
- Restore-time behavior of screens other than Overview, which launch never
  shows first.

# Acceptance criteria

- [x] Launch with several stored projects activates only the stored active
      project; no other project becomes active on the way.
- [x] A stored active project that no longer opens falls back to the last
      restored project, as before.
- [x] A project the user opens while restore is still revalidating is kept
      as it is and stays active over the stored one.
- [x] Skipped projects are still counted for the restore notice.
- [x] While restore runs, Overview never shows the launcher; it shows a
      placeholder in its own shape that appears only after 320ms, like the
      app's other first-load placeholders.
- [x] Assistive tech hears only the placeholder's label ("Opening
      project…"), not the shape's static titles.
- [x] Reducer and App tests cover these cases.
- [x] `pnpm run check` passes.

# Relevant files

- `src/runtime/project/sessions.ts`, `src/runtime/project/sessions.test.ts`
- `src/app/App.tsx`, `src/app/App.test.tsx`
- `src/features/overview/OverviewPlaceholder.tsx` (new),
  `OverviewPanel.tsx`, `ChangedFilesSection.tsx`,
  `HistorySummarySection.tsx`, `overview.css`

# Dependencies

None.

# Decisions

- 2026-10-07: one `restore` dispatch rather than `open` per project, so the
  active project is decided once. `open` keeps its "activate what was just
  opened" meaning for every other caller.
- 2026-10-07: `Promise.allSettled` over the stored order. `open_repository`
  is an async Tauri command, so revalidation no longer waits on each
  project in turn.
- 2026-10-07 (review): a project the user opens while restore is still
  running stays active. The first version of `restore` switched to the
  stored active project once revalidation finished, which is the jump this
  task removes. The user's choice now outranks the one from the last session.
- 2026-10-07 (owner): a loading placeholder instead of a spinner. Overview's
  shape is known before the project is, so the project lands in the space
  that was waiting for it, with nothing moving. The first version was a
  spinner delayed by 400ms.

# Implementation notes

- `projectSessionsReducer`'s `restore` appends the projects that are not
  open yet, in stored order. It keeps the current active project when there
  is one (the user opened it during restore). Otherwise it activates the
  stored id when that project opened, or else the last restored project.
- Concurrent revalidation is safe in Rust: `SessionRegistry::open` hands out
  one epoch per canonical path under a mutex, so two aliases of the same
  project still get one session.
- `OverviewPanel` takes `isRestoring` (`!hasCompletedSessionRestore` from
  `App`) and renders `OverviewPlaceholder` instead of `WelcomeScreen` while
  it is true.
- `OverviewPlaceholder` uses the real classes. Only text that does not
  depend on the project is written out (step names, card titles,
  descriptions). Its header, band and columns are `aria-hidden`; the
  wrapping `LoadingPlaceholder` announces "Opening project…".
- `ChangedFilesPlaceholderList` and `HistoryPlaceholderList` moved into
  `OverviewPlaceholder.tsx`. The eager module owns them, and the lazy
  History summary chunk imports them from there.
- Three `overview-placeholder__*` rules size the header's tile, name and
  branch switch, and keep the path row and the band's note at their
  real 28px.

# Validation

- `pnpm exec vitest run src/runtime/project/sessions.test.ts src/app/App.test.tsx src/features/overview`:
  passed.
- Visual check in a throwaway browser harness (deleted afterwards). It
  booted the real app with a stubbed Tauri bridge and an 8s
  `open_repository`. During restore it showed the placeholder and never the
  launcher; then the project replaced it. Measured with
  `getBoundingClientRect`, the placeholder header (68px), band position and
  step height (82.5px) match the loaded Overview.
- The owner confirmed in the running app that launch now goes straight to
  the project.
- `pnpm run check` (2026-10-07): docs 282 Markdown files / 200 task ids;
  frontend architecture 566 modules; Vitest 130 files / 1282 tests passed;
  Vite build; `cargo fmt` passed. Clippy then stopped with exit 101 because
  the running dev app held `target/debug/gitodile.exe` open, not because of
  a code problem. Clippy (`-D warnings`) and `cargo test --all-targets
  --all-features` were rerun with a separate `CARGO_TARGET_DIR`: both exit 0,
  Rust 573 passed, 1 ignored.
