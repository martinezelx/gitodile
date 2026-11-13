---
id: 154
title: Keep Changed files at History's height when clean, with next steps
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
  - ux
created: 2026-10-08
completed: 2026-10-08
parent:
queue:
---

# Goal

On Overview, the Changed files card keeps Recent history's height when there is
nothing to list, and its empty state offers the same next steps as the Changes
screen.

# User outcome

- The two cards stay a pair whether or not files changed; the layout no longer
  jumps when the last change is saved.
- A clean project says what to do next: publish saved versions, get project
  changes, open history, or open project settings when there is no remote.

# Context

The clean state used to shrink the card to a tick, two lines and a long tip, and
widen History beside it. The owner reviewed a mockup (an HTML artifact) and
approved it, asking only for a shorter tip that does not wrap.

# Scope

- Drop the clean-state column variant (`overview-columns--clean`); both cards
  always share one height.
- Centre the tile, title, description and actions in the card; hold the tip at
  its foot.
- Reuse `getChangesEmptyState` and the `changesEmpty*` strings, so both screens
  answer the same situation in the same words: ahead, behind, no remote,
  up to date, detached, unborn.
- Shorten the tip: "Files you change will show up here." /
  "Los archivos que cambies aparecerán aquí."

# Out of scope

- The "restore discarded work" link the Changes empty state carries.
- Any change to the Changes screen itself.

# Acceptance criteria

- [x] The card keeps History's height with no changes.
- [x] Each clean situation shows the Changes screen's title, description and
      actions; only "publish" and "get project changes" lead as primary.
- [x] The tip fits on one line in English and Spanish at the usual width.
- [x] Actions are real buttons wired to the existing publish, sync, history and
      project-settings handlers.
- [x] Tests cover each situation's actions.

# Relevant files

- `src/features/overview/ChangedFilesSection.tsx`, `OverviewPanel.tsx`,
  `overview.css`, `translations.ts`
- `src/features/changes/emptyState.ts`, `index.ts`
- `DESIGN.md` (Overview's last row)

# Dependencies

None.

# Decisions

- The state is derived with `getChangesEmptyState`, exported from the changes
  feature index, rather than copied.
- Actions use the global `primary-button` / `secondary-button`, as Changes does.

# Implementation notes

`CleanState` in `ChangedFilesSection.tsx` builds the content per situation.
`OverviewPanel` passes `headState` and the publish, sync, history and settings
handlers it already held.

# Validation

`pnpm run check`, 2026-10-08:

- Docs, frontend architecture, TypeScript, Vitest (134 files, 1364 tests) and
  the production build passed.
- `cargo fmt --check` and Clippy passed; `cargo test` could not finish because
  Windows denied replacing `src-tauri/target/debug/gitodile.exe` while the
  development app was running. No Rust file changed in this task, so the Rust
  tests were not re-run.
- Removed the now-unused `statusCleanMessage` string; re-ran TypeScript, the
  overview, status and changes tests, docs and architecture checks: passed.
- Rendered the card in a throwaway browser page (Spanish and English, light and
  dark, ahead and no-remote): same height as History, tip on one line, no clipping.
- Not checked in the running app; only in that page.
