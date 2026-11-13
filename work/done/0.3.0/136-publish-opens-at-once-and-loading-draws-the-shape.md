---
id: 136
title: Publish opens at once, and every first load draws the shape of what is coming
status: done
priority: normal
type: feature
areas:
  - frontend
  - backend
  - design
created: 2026-09-28
completed: 2026-09-28
parent:
queue:
---

# Goal

Make pressing Publish feel immediate, and give the whole app one way of
waiting for a first Git read: the content's own shape, where it will be, shown
only when the read is slow enough to need it.

# User outcome

Publish opens straight into its final dialog — title, the plan, Cancel and
Publish — instead of a "Checking…" dialog that another dialog later replaced.
When the branch tracks a remote, the plan is already filled in from what
the project knows (the pending versions as of the last check), with Publish
held back as "Checking the remote…" until the fresh plan confirms or corrects
it. Without that, faint placeholders stand where the plan will be.

Across the app, a list, sentence or form that is waiting for its first read
shows its real layout with faint text placeholders: the Overview's changed
files and recent history, the Changes file list, the History timeline and a
version's detail, the branches and a branch's route, project settings and
line endings. Nothing shows for the first 320ms, so a quick read never
flickers. Diffs and other content whose shape can't be guessed keep the
loading bar; refreshes keep what is on screen; buttons keep their spinner.

# Context

- Publish's plan (`plan_publish`) ran about ten Git processes in series plus a
  network fetch, and read the full working-tree status — including the diff's
  line totals, a `git diff --numstat` and a read of every new file — only to
  learn whether anything was unsaved.
- The dialog showed a loading note in its own shape, then swapped to the plan.
- The app waited in three visual languages: the loading bar (Changes, History,
  branches), spinners (all of Overview, settings) and, new in this task,
  placeholders — so one kind of wait looked different on each screen.

# Scope

- `plan_publish` / `publish` validation (`src-tauri/src/publish.rs`): a lean
  status read (`--untracked-files=normal --no-renames`, no line totals); the
  status, `HEAD` and remote list asked side by side, errors still checked in
  the old order; one ref-name check when the destination is the local branch;
  the commit count taken from the ahead/behind comparison when publishing
  everything; the two summary logs read side by side for a checkpoint publish.
- `in_parallel` moved from `branches.rs` to `application.rs` beside
  `inherit_command`; `resolve_head_state` split into `read_head_commit` and
  `classify_head`.
- Publish dialog: opens in its final shape; `previewFromPendingVersions`
  builds a preview from the session's cached pending list and status; the
  primary reads "Checking the remote…" until the fresh plan arrives; the
  dialog chunk is warmed after first paint.
- Shared `LoadingPlaceholder` and `TextPlaceholder` (`src/shared/ui`), with the
  320ms delayed appearance and reduced-motion handling in `primitives.css`.
- Placeholders in every first-load zone listed above, built from the real
  rows' classes so the content lands without moving.
- `DESIGN.md` loading rules; `LoadingBar`'s doc comment says when it still
  applies.

# Out of scope

- Removing the fetch from the plan: the preview covers the wait, and the fresh
  plan still decides before anything is published.
- Refresh indicators, button spinners, the status bar and the Journey band's
  step icons, which already keep content on screen.
- Git installation checks in Settings, whose answer ("installed" or "not
  found") has no single shape to draw.

# Acceptance criteria

- [x] Publish opens directly in its final dialog; no intermediate loading
      dialog.
- [x] With a tracked branch, the cached plan shows at once and Publish stays
      disabled as "Checking the remote…" until the fresh plan arrives; a
      different count replaces the preview's, and a block replaces the plan.
- [x] A remote picked in the dialog never shows the tracked remote's preview.
- [x] The plan runs fewer Git processes and no line-total diff.
- [x] Every first-load list, sentence and form listed above shows its shape
      after 320ms; diffs, lazy screens and "load more" keep the loading bar.
- [x] Placeholders sit where the loaded rows sit (checked in the browser for
      History and the Overview) and announce the read once to assistive tech.
- [x] English and Spanish strings for the new label.
- [x] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/publish.rs`
- `src-tauri/src/application.rs`
- `src-tauri/src/repository.rs`
- `src-tauri/src/branches.rs`
- `src/shared/ui/loadingPlaceholder.tsx`
- `src/shared/ui/primitives.css`
- `src/shared/ui/loadingBar.tsx`
- `src/features/publish/PublishDialog.tsx`
- `src/features/publish/domain.ts`
- `src/app/App.tsx`
- `src/features/overview/ChangedFilesSection.tsx`
- `src/features/overview/HistorySummarySection.tsx`
- `src/features/changes/ChangesPanel.tsx`
- `src/features/history/HistoryPanel.tsx`
- `src/features/branches/BranchesPanel.tsx`
- `src/features/branches/BranchRoute.tsx`
- `src/features/project-settings/ProjectSettingsPanel.tsx`
- `src/features/settings/SettingsPanel.tsx`
- `DESIGN.md`

# Dependencies

- None.

# Decisions

- **Keep the fetch in the plan; preview from the cache.** A plan read from the
  last known remote position could be stale, and publishing on it would only
  be refused by the execution's own re-check. Showing the cached list while the
  fetch runs gives the reader something true to read and leaves the decision
  with the fresh plan.
- **Preview only with a tracked branch.** Without one the pending list counts
  every local version and the destination is unknown until Rust resolves the
  remote.
- **Placeholders over the loading bar for known shapes, with a delay.** Chosen
  from a comparison page of eleven loading effects (bar, spinner, pulse,
  shimmer, cascade, delayed placeholder, window bar, text shimmer, dots, border
  beam). The delayed placeholder keeps the calm of the pulse and removes the
  flicker on fast local reads; `DESIGN.md` previously ruled skeletons out, and
  now says where each indicator belongs.
- **Round glyph placeholders.** `styleComposition.test.ts` requires radius
  tokens; `--radius-round` fits a single-glyph stand-in.

# Implementation notes

- `LoadingPlaceholder` takes an optional `label`; the unlabelled form is the
  second half of a shape another placeholder already announces (History's
  detail beside its timeline).
- `.loading-placeholder *` has `pointer-events: none`, so hover styles borrowed
  from the real rows never light up an empty one.
- Review fixes before committing: the tracked remote's preview is dropped once
  the reader picks another remote in the dialog; `App.tsx`'s new import moved
  into the import block; dead `.loading-state` and `--placeholder` rules
  removed; tests added for the primitive and the remote-pick case.
- Verified in the browser against fixtures through a throwaway harness under
  the Vite dev server, removed before finishing.

# Validation

- `cargo test publish` and `cargo test branch` — passed.
- `pnpm exec vitest run` (publish, history, architecture, shared UI) — passed.
- `pnpm run check` — passed (docs, architecture, frontend, Rust format, Clippy
  and tests).
