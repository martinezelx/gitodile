---
id: 163
title: The status bar's cloud becomes the one sync button — publish, get, or both
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
created: 2026-10-12
completed: 2026-10-12
parent:
queue:
---

# Goal

Give the status bar the equivalent of GitHub Desktop's Fetch / Pull / Push
button: one adaptive control beside the remote check that names the sync the
relation calls for, so a newer version on the remote can be received from any
screen, not only from Overview.

# User outcome

From any screen, the reader sees what to do with the remote and does it in one
click: "Publish 2 versions" when they are ahead, "Get 3 versions" when the
remote is ahead, "Get and publish" when both moved. When everything is up to
date, the strip says how long ago that was checked without hovering.

# Context

Before this task the status bar's remote cluster was the fact (a cloud and a
word) plus the refresh (`check_team_changes`, a real `git fetch` of the branch's
upstream). The fact turned into a Publish button only when ahead, still
wearing the plain `Cloud` glyph and the strip's neutral ink, so it read as a
fact rather than a button. Behind and diverged had no action at all: the strip
warned in amber but the Get flow (`GetTeamChangesDialog`) was reachable only
from Overview's next-step card and Changes.

Reviewed against GitHub Desktop with option widgets; the user chose option A
(one adaptive button, GitHub Desktop style) over ↓/↑ counters and a hybrid.

# Scope

- `StatusBar` derives one sync action from a known-current relation: ahead →
  publish (`CloudUpload`), behind → get (`CloudDownload`), diverged → get and
  publish (`CloudSync`).
- The action button shows its verb on a neutral pill with an accent glyph,
  and its tooltip adds the freshness line.
- "Up to date" shows its relative check time beside it.
- `App` wires `onGetChanges` and `onGetAndPublish` to the same session
  operations Overview's card uses.
- DESIGN.md records the button and the two new cloud glyphs.

# Out of scope

- A "Publish branch" action for `noUpstream`: the publish flow does not yet set
  an upstream for a branch that has none, so the strip must not offer it.
- Changing what the refresh fetches (still the branch's upstream only, no prune).
- Overview's next-step card, which keeps its own forecast-aware choices.

# Acceptance criteria

- [x] Ahead, behind and diverged each render one button whose name is the
      action and which calls only its own handler.
- [x] A stale, failed or loading relation never renders the action button.
- [x] The refresh stays enabled beside the action as the explicit check.
- [x] "Up to date" shows its relative age in the quiet ink.
- [x] Spanish copy: "Publicar N versiones", "Traer N versiones", "Traer y
      publicar".
- [x] The App-level tests drive Get from the status bar.

# Relevant files

- `src/app/StatusBar.tsx`
- `src/app/StatusBar.test.tsx`
- `src/app/App.tsx`
- `src/app/App.test.tsx`
- `src/app/app-shell.css`
- `src/app/translations.ts`
- `DESIGN.md`

# Dependencies

[161](161-get-and-publish-without-friction.md) for the get-and-publish flow.

# Decisions

- Diverged always offers "Get and publish": `openPublishDialog` already routes
  diverged there, and that dialog shows the forecast and refuses overlaps, so
  the strip does not duplicate Overview's forecast logic.
- `CloudDownload` (getting) and `CloudSync` (get and publish) keep "the cloud
  is the remote": every sync verb on the strip is a cloud with a direction.
- The pill is neutral — the strip's hover surface and ink — with only the glyph
  in the accent. A first pass tinted the whole pill green (12% / 19% / 25%), but
  on Overview with unsaved work it competed with "Save version" and joined the
  changes badge and `+265` as a third green in the strip; the user chose the
  neutral pill from three options (neutral, outline, text only).

# Implementation notes

- `teamSyncAction` in `StatusBar.tsx` maps the relation to `{ kind, label,
  icon, onClick }`; the old ahead-only `publishAction` is gone.
- Visible text in the action state is the verb, not the fact ("2 versions to
  publish" became "Publish 2 versions"); the fact words stay for every
  non-actionable state.
- App tests that read "1 newer version available" from the strip now look for
  the "Get 1 version" button, and the remote-check test clicks the status bar's
  Get rather than whichever one is found first.

# Validation

- `pnpm exec vitest run src/app/` — 14 files, 203 tests passed.
- Visual check in the built-in browser through a throwaway harness rendering
  the five states (up to date, ahead, behind, diverged, no upstream) in
  Spanish and English; the harness was deleted afterwards.
- First `pnpm run check`: everything up to `cargo test` passed, which could
  not link while the dev app held `src-tauri/target/debug/gitodile.exe`
  (os error 5). No Rust file changed in this task.
- Final `pnpm run check`, together with task 164 — passed: 139 frontend test
  files (1,445 tests), build, `cargo fmt`, Clippy and Rust tests (592 passed,
  1 ignored).
- The user checked the status bar in the running app and approved the neutral
  pill.
