---
id: 191
title: Overview's discarded-changes card, always offered and shaped like its siblings
status: done
priority: normal
type: ux
areas:
  - frontend
  - ux
created: 2026-10-21
completed: 2026-10-21
parent:
queue:
---

# Goal

A discard that can still be restored is offered on Overview whatever the
next step is, in the same card shape as "Recent history" and the step's
detail card, one step smaller, listing each copy so one can be restored
straight from the row.

# User outcome

Someone who discards changes by mistake and keeps working still sees, on
Overview, that the copy can be brought back, and which one. The column no
longer switches between two unrelated shapes.

# Context

Explored with Luis on 2026-10-21 in an artifact comparing today's column
with the proposal in three scenarios (everything saved, unsaved work, ready
to publish): https://claude.ai/artifact/266f1WWjs7PQS2qsDbirPf

What it found:

- The card was hidden whenever the working tree was not clean, the moment a
  mistaken discard is most likely to be noticed.
- Alone in the column it was a detail card with a figure; under a detail
  card it became a different object, a compact row with a lifted tile, a
  badge and a filled button.

Accepted from the artifact with three changes: no explanatory note under
the copies, a card one step smaller than the step's, and no accent stripe.

The Rust listing (`recovery/discard.rs`) already marks a copy `restorable`
only while nothing has been written at its paths, so offering it beside
unsaved work cannot restore over that work.

# Scope

- `workDetail.ts`: `newestRestorableDiscard` keeps up to
  `RECOVERY_LIST_LIMIT` (50) newest restorable copies with their
  `previewPaths`, plus the total count.
- `App.tsx`: the recovery read no longer bails out on an unclean tree; it
  runs once on project activation and on working-tree invalidations,
  idle-deferred. The restore picker is opened with a request that names a
  copy.
- `DiscardChangesDialog`: `DiscardDialogRequest.recoveryId` selects that
  copy when it can be restored, else the newest that can.
- `OverviewDetail`: one `DetailCard` with a `compact` modifier, no figure,
  a row per copy (clock, when, file count and names) that opens the picker
  on that copy; the list scrolls while the screen fits and "Restore" takes
  the lead at its end, as "Review" does.
- `overview.css`: the compact card's sizes; the fitted column gives the
  step's card the height and the discarded-changes card about four rows
  under it, or the whole column alone; `.overview-restore` removed.
- The line-totals bar is one element whose green eases into red around the
  added share.
- The column's file and copy rows drop their tooltips, as the timeline's
  rows had.
- DESIGN.md and tests.

# Out of scope

- The restore picker's own layout.
- The `title` tooltips of "What you'll get" versions and the timeline's
  subjects.

# Acceptance criteria

- [x] The card shows whenever a copy is restorable, with or without unsaved
      work or conflicts.
- [x] One card shape in every position, one step smaller than the step's.
- [x] Each copy is a row that opens the picker on that copy.
- [x] Fitted to the window, both the step's list and the copies scroll; the
      card's link breathes at the end of its list.
- [x] The line bar blends its two colours; one side alone is one colour.
- [x] Column rows carry no tooltip.
- [x] Tests cover the copies, their scroll and the picker's chosen copy.
- [x] `pnpm run check` passes (bar `cargo test`, see the notes).

# Relevant files

- `src/features/overview/OverviewDetail.tsx`
- `src/features/overview/workDetail.ts`
- `src/features/overview/overview.css`
- `src/features/overview/translations.ts`
- `src/features/changes/DiscardChangesDialog.tsx`
- `src/app/App.tsx`
- `DESIGN.md`

# Dependencies

None.

# Decisions

1. **Offered whatever the step.** Restorable already means no path of the
   copy was written since, so unsaved work elsewhere is not at risk, and the
   picker states what each copy brings back.
2. **No figure.** The count and "latest …" line repeated the first row; without
   it the card holds more copies in the same height.
3. **Reading with unsaved work.** Telling which copies still apply reads the
   status and hashes the changed files. That now also happens while work is
   unsaved, but only when copies are stored and always at an idle moment;
   with none stored the listing returns before reading anything.
4. **Blend width.** 14px either side of the added share keeps the bar
   readable as two parts at the 328px column while removing the hard edge.

# Implementation notes

- The scroll of "What you'll save" was lost in the first pass: adding
  `:not(.overview-detail--compact)` to the rule that sets `overflow: hidden`
  on the list made it outweigh the later `--scroll` rule. The fitted rules
  now share one specificity and the scroll rule comes last.
- Checked in a throwaway harness under Vite at 1200×760: with 30 files and
  8 copies both lists scroll (212px and 110px tall); with everything saved
  and 40 copies the card takes the 520px column and scrolls; pressing a row
  passes its copy's id. The bar was checked at 70%, 50%, 10%, 0% and 100%.
- Not yet watched in `tauri dev`: port 1420 was held by Luis's own server.
- Follow-up, same day: the card's entrance replayed each time Overview was
  shown again (a screen back from `display: none` restarts its animations),
  and its 3px rise pushed the card past the workspace's foot, flashing the
  workspace's scrollbar and narrowing the screen for 260ms. It now fades in
  once, opacity only, on an `--arriving` class that goes when the fade ends.
- Follow-up, same day: under a detail card the two now share the column
  instead of the copies keeping a fixed 110px. The detail card takes its
  rows' height and what is left; the copies take theirs up to 232px; past
  four copies they give way first (shrink weight 999) down to 4.5 rows,
  and only then does the detail card's list scroll. Measured in the harness
  in a 560px column: 2 files/8 copies 53px + 183px (all shown); 30/8 252px
  scrolling + 110px; 5/20 134px + 228px (capped); 30/3 keeps 3 rows; 0/8
  takes the column.
- `pnpm run check` again for the follow-ups: docs, architecture, TypeScript,
  the frontend tests (145 files, 1558 tests) and build, `cargo fmt` and
  `cargo clippy` passed; `cargo test` again could not relink past the
  running `tauri dev`. No Rust changed.
- `pnpm run check` on 2026-10-21: docs, architecture, TypeScript, the
  frontend tests (145 files, 1558 tests) and build, `cargo fmt` and
  `cargo clippy` passed. `cargo test` could not relink: the running
  `tauri dev` held `gitodile.exe`. This change touches no Rust.
