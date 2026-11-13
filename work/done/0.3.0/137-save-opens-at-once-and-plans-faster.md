---
id: 137
title: Save opens at once, and its plan is cheaper
status: done
priority: normal
type: feature
areas:
  - frontend
  - backend
created: 2026-09-28
completed: 2026-09-28
parent:
queue:
---

# Goal

Make pressing Save feel immediate, the way task 136 did for Publish: the dialog
opens in its final shape, and the plan behind it runs fewer Git processes.

# User outcome

The Save dialog opens straight into the form — name, description, the "also
publish" checkbox, Cancel and Save — with the name field focused, so typing can
start while Git is still answering. The summary ("3 files on *main*" and the
breakdown) is filled at once from what the project already knows, or by faint
placeholders where it will be. Save is held back as "Checking…" until the fresh
plan confirms or corrects the summary; a block (conflicts, no identity, nothing
to save, detached branch) replaces the form as it does today.

# Context

- `SaveVersionDialog` shows a spinner note while `planning`; the fields, the
  focus and the summary only exist once the plan arrives, so the dialog changes
  shape after opening (`SaveVersionDialog.tsx`, `status === "planning"`).
- `plan_save_version` (`src-tauri/src/save_version.rs`,
  `validate_and_prepare_save`) runs about eight to ten Git processes in
  series: the full working-tree status (including the diff's line totals and a
  read of every new file, only to learn the counts), the operation-in-progress
  check, HEAD, the identity check, then `prepare_index` (`read-tree`,
  `add -A`, `write-tree` on a temporary index) whose only product the plan uses
  is the tree hash folded into `stateToken`.
- The person needs seconds to type a name, so the plan can finish while they
  do; the wait only shows because the form is hidden behind it.
- Task 136 is the pattern: `previewFromPendingVersions`, `LoadingPlaceholder`,
  the held-back primary, `in_parallel` in `application.rs`, and a lean status
  read (`read_publish_status`).
- `useSaveVersionFlow` is shared with Changes' `QuickCommitBox`, which is docked
  under the file list and has its own shape.

# Scope

- Dialog: opens in its final shape with the name field focused on open; a
  `previewFromWorkingTree` in `domain.ts` builds the summary from the session's
  cached working-tree status while the plan runs; placeholders stand where the
  summary goes when no preview applies; the primary reads "Checking…" and is
  disabled until the fresh plan replaces the preview; blocks still replace the
  form.
- Preview is `null` (placeholders instead) when the cache cannot stand for the
  plan: a partial selection, conflicts, a clean tree, a detached `HEAD`, or no
  cached status.
- The preview is the dialog's, not the flow's: `SaveVersionDialog` takes it as
  a prop and draws it only until the plan arrives; `useSaveVersionFlow` and
  `save()` still know only confirmed plans.
- `plan_save_version`: a lean status read without line totals where the
  selection logic allows it; status, operation-in-progress, `HEAD` and identity
  asked side by side with `in_parallel`, errors still checked in today's order.
- `prepare_index` stays as it is (see Decisions).
- The dialog's layout, from a second review with screenshots: the summary in
  one voice with a "Show files" list the plan carries, details folded behind
  "Add details", and Enter / Ctrl+Enter to save.
- English and Spanish strings, tests, `work/README.md` next ID.

# Out of scope

- Changing how `stateToken` is computed or removing the temporary-index tree
  from it: that is the plan/execute safety contract and needs its own decision.
- Changing Changes' `QuickCommitBox` layout; it only benefits from the cheaper
  plan.
- Changing what a save writes, the hook and signing handling, or the failure
  classification.

# Acceptance criteria

- [x] The Save dialog opens directly in its final form with the name field
      focused; no intermediate loading dialog.
- [x] With a usable cached status, the summary shows at once and Save stays
      disabled as "Checking…" until the fresh plan arrives; a different count
      replaces the preview's, and a block replaces the form.
- [x] Without a usable preview (partial selection, conflicts, clean tree,
      detached branch, no cache), placeholders stand where the summary will be.
- [x] Save can never write on a preview: only a confirmed plan's state token is
      sent.
- [x] What was typed while the plan ran is kept when the plan arrives, and the
      draft behaviour is unchanged.
- [x] The plan runs fewer Git processes in series and no line-total diff where
      the selection allows; error precedence is unchanged.
- [x] Quick commit box in Changes still works with the cheaper plan.
- [x] English and Spanish strings; keyboard focus and announcements checked.
- [x] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/save_version.rs`
- `src-tauri/src/status.rs`
- `src-tauri/src/index.rs`
- `src-tauri/src/application.rs`
- `src-tauri/src/publish.rs` (the pattern)
- `src/features/save-version/SaveVersionDialog.tsx`
- `src/features/save-version/useSaveVersionFlow.ts`
- `src/features/save-version/domain.ts`
- `src/features/save-version/translations.ts`
- `src/features/changes/QuickCommitBox.tsx`
- `src/app/App.tsx`
- `src/shared/ui/loadingPlaceholder.tsx`
- `work/done/0.3.0/136-publish-opens-at-once-and-loading-draws-the-shape.md`

# Dependencies

- Task 136 (done): the placeholders, `in_parallel` and the publish pattern.

# Decisions

- **One task, one commit**, by the user's request: the dialog and the plan
  change together.
- **Preview from the session's cached status, held-back primary.** Same
  reasoning as 136: a preview is something true to read, and the fresh plan
  still decides before anything is written.
- **Leave `prepare_index` alone, unmeasured.** It carries the state-token
  guarantee; speeding the reads around it comes first. It was not timed in
  this task, so whether it is worth its own work is still open.
- **The preview is a prop, not a flow state.** The quick commit box never
  shows one, so teaching the shared flow about it would have given both frames
  a state only one draws; the dialog alone decides what to paint while it
  waits.
- **The plan lists its files, capped at 50** (`SAVE_PLAN_FILE_LIMIT`, in Rust
  and mirrored in `domain.ts`). The list is the dialog's reassurance, not the
  Changes screen: a bounded plain list under the DOM budget, with "And N more"
  pointing to Changes, rather than a virtualised list or an unbounded payload.
- **Key hint as a tooltip, not a keycap in the button.** The label already
  has to fit beside Cancel in both languages (see the button note below).
- **The publish checkbox keeps its style.** It already wears the light
  "done" tint (`.app-checkbox`), not the solid accent, so it does not compete
  with the primary. Naming the remote was left out: the plan does not know
  it without another Git process, and Publish's own plan names it next.

# Implementation notes

- `SaveVersionDialog` renders its form for every state but a block or the
  success screen, so it opens in its final shape. The name field is focused
  once when the form appears (on open, and again when a retry brings it back
  after a block) and is not refocused when the plan lands. The primary reads
  "Checking…" and stays disabled until a plan has arrived; `handleConfirm`
  (which the keyboard reaches without the button, so it checks the same
  conditions) and `save()` still take only the fresh plan, so its state token
  is the only one ever sent. The "Checking…" live region stays mounted with the
  form and only its text changes, so it is announced.
- `previewFromWorkingTree` (`domain.ts`) reads branch, counts, the prepared
  flag and "first version" (an unborn `HEAD`) from the session's cached status
  and project. Its `SaveVersionPreview` is a `Pick` of the plan, so
  `PlanSummary` and `getSaveVersionNotes` take either. It is `null` for a
  partial selection, a clean tree, conflicts, a detached `HEAD` or an unnamed
  branch; the summary then shows `PlanSummaryPlaceholder`.
- `validate_and_prepare_save` asks status, operation-in-progress, `HEAD` and
  identity side by side (`in_parallel`, nested) and checks their answers in the
  old order: status, operation, `HEAD`/detached, conflicts, clean, identity.
  Execution shares this function, so a save benefits as well.
- The lean status is `read_working_tree_status_without_line_totals`, a flag on
  the shared snapshot read in `status.rs`. It keeps `--untracked-files=all`
  and `--renames` on purpose, unlike Publish's read: the counts are shown to
  the reader and a selection is matched against entry paths, so they must be
  the ones Changes shows. Only the numstat and the reads of new files go.
- The dialog's buttons read like the quick commit box's: "Save" (or "Save and
  publish"), "Saving…" and "Checking…". "Save version" and "Saving your
  version…" were wider than the row, so the actions wrapped onto a line of
  their own mid-save, the same fault `QuickCommitBox` already documents.
  `saveVersionDialogConfirm` is gone; the title still says "Save version".
- The dialog's footer was reworked after a review with screenshots: the
  publish choice now carries its own help line ("Only on this computer until
  you publish", or "You'll review it before anything is published" once
  checked), read as the checkbox's description rather than part of its name.
  The footer holds only the actions, so its note no longer wraps beside the
  buttons. `saveVersionSummary` became `saveVersionFilesCount`.
- A second review reworked the summary: the count is the headline and the
  breakdown follows it as text ("12 edited · 1 new", the categories' colours as
  ink) instead of pills, with the branch on a quieter line of its own
  (ellipsis, full name on hover). "Show files" unfolds the plan's `files`
  (kind and path, a rename as "old → new") in a solid scrolling panel. The
  details field is folded behind "Add details" and opens unfolded when the
  draft has details; once edited it stays open, so clearing a drafted text
  does not fold it away under the cursor. Enter in the name saves, as in the quick commit box, and
  Ctrl/⌘+Enter saves from the details.
- `prepare_index` is untouched; it carries the state-token guarantee.
- The placeholder draws the same two lines as the summary (`.save-version-summary`),
  so it sits within one pixel of the loaded one (checked in the browser
  against a throwaway harness, removed afterwards).

# Validation

- `cargo test status` and `cargo test save` — passed.
- `pnpm exec vitest run src/features/save-version src/features/changes` —
  passed.
- `pnpm run check` — passed (docs, frontend architecture, TypeScript,
  frontend tests and build, Rust format, Clippy and tests). Its first runs
  caught an import of another feature's internal module, and invalid UTF-8
  in `SaveVersionDialog.tsx` from a scratch edit; both fixed.
