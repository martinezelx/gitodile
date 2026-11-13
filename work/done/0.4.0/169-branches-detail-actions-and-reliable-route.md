---
id: 169
title: Branches detail — branch actions, a versions rail, in-place rename and a route that always arrives
status: done
priority: normal
type: improvement
areas:
  - frontend
  - backend
  - branches
created: 2026-10-14
completed: 2026-10-14
parent:
queue:
---

# Goal

Rework the Branches detail panel so it says what the selected branch can do, draws
its saved versions the way Overview and History do, renames a branch in place
without the strip jumping, and always draws the route — quickly.

# User outcome

The detail panel reads like the rest of the app: the versions sit on History's
rail with its nodes and its published boundary, the branch's merge, rebase and
compare actions are stated where the branch is, Publish is beside what is
waiting, and renaming feels like editing the name rather than swapping it for
another control. The route no longer goes missing when the pointer rests on
another branch while it loads, and branches whose main branch has not moved draw it
noticeably faster.

# Context

Reviewed in two artifacts: the detail's redesign (variant A — action rows —
with the rail and the published boundary was chosen) and the rename strip
(variant A — the name edited in place — with every extra). Follow-ups asked
for in review: the quick switch's own action titles (Git's verb included),
the route's reliability and speed, no "N more in History", the unpublished
count said once, Publish in the panel, a relative byline date, per-branch
cancellation of history reads, and a versions list that never scrolls
sideways.

# Scope

- Replace "Changes compared to main" with "What you can do": the quick
  switch's three actions for another branch (merge into the active branch, rebase
  the active branch onto this one, compare), and for the active branch the same
  against the main branch (merge main into this, merge into main, compare).
  Stated and marked `Soon`; a row that cannot run says why ("Up to date").
- Saved versions on a rail with History's nodes (local-only half filled,
  published solid, unknown ring), the "Only on this computer" head and the
  "Published on origin" boundary; no publication chip; code on hover; the list
  scrolls vertically only; no "N more in History" footer.
- Publish (opens the existing publish flow) beside "N not published" and on
  the local head, on the active branch only.
- The route sentence leaves the unpublished count to the state above it.
- The strip's byline says when relatively, the exact date on its tooltip.
- Rename in place: same type, size and position as the name; last path
  segment selected; byline and actions cross-fade into the note and two
  circles; spinner in the check while saving; the name lights once in the
  strip and its row after saving; Cancel fades back.
- Route read: one `--numstat` for the totals only (no file list, no
  `--name-status`); the copy check only when the main branch moved since the
  parting; tip and shallow check side by side.
- History reads superseded per branch (`authorize_repository_read_of`), and a
  hover prefetch only while no other branch's read is out.

# Out of scope

- Building the merge, rebase and compare flows.
- A compare view between two branches.

# Acceptance criteria

- [x] "What you can do" replaces the comparison section, with the quick
  switch's wording for both the active branch and another branch.
- [x] Saved versions use History's nodes, rail, head and boundary, and never
  scroll horizontally.
- [x] Publish is offered beside what is waiting and on the local head, only on
  the active branch.
- [x] The unpublished count is said once; the byline date is relative.
- [x] Rename edits the name in place with the agreed motion, and respects
  reduced motion.
- [x] A history read for one branch never cancels another branch's.
- [x] The route read skips the copy check when the main branch has not moved,
  and no longer reads a file list nobody shows.
- [x] Tests cover the actions, the boundary, Publish, the rename selection and
  circles, prefetch, per-branch supersession and the totals parser.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/branches/BranchesPanel.tsx`
- `src/features/branches/BranchIntegrations.tsx`
- `src/features/branches/BranchRenameStrip.tsx`
- `src/features/branches/BranchRoute.tsx`
- `src/features/branches/controller.ts`
- `src/features/branches/branches.css`
- `src-tauri/src/branches.rs`
- `src-tauri/src/application.rs`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- Action titles reuse the quick switch's strings so an action is named the
  same wherever it is offered; the plain-language consequence goes under it.
- Actions are rows, not disabled buttons, until their flows exist.
- Publication per listed version is Git's answer (`<branch>@{upstream}..<branch>`,
  read beside the versions), not the ahead count by position: review found
  that a branch which merged another interleaves the two by date. The position
  is only the fallback until the read lands; with no remote copy to count
  against the node is the unknown ring.
- Publish is offered only where the status bar would offer it: never in a
  project with no remote at all.
- Supersession is scoped by branch rather than removed: a newer read of the same
  branch still cancels the older one.
- The hover prefetch stays limited to one read in flight, now for contention
  rather than correctness.

# Implementation notes

- `BranchIntegrations.tsx` replaces `BranchChanges.tsx`. Titles are
  `branchesMergeInto` / `branchesRebaseOnto` / `branchesCompareWith`
  and a new `branchesMergeFrom`; the comparison's totals moved under
  "Compare". Rows rather than disabled buttons until the flows exist.
- Versions list (`BranchesPanel.tsx`): rail, nodes, head with Publish and
  the boundary built from History's pieces in `branches.css`; the list is
  `overflow-x: hidden` and the head capsule lost a negative margin that pushed
  1px past the row.
- `BranchRenameStrip.tsx`: the field wears the name's typography with a
  hidden sizer; the last path segment is selected on arrival; Cancel fades out
  over 140ms before closing (skipped under reduced motion); the panel's
  `settled` state fades the resting strip back and lights the new name in the
  strip and its row for one animation.
- Rust: `BranchChanges` is totals only (`ChangedFile`, `ChangedFileStatus`,
  `--name-status` and the file list removed); `detect_copy` runs only when the
  left/right count says the main branch moved; tip and shallow checks run in
  parallel; `BranchHistory.unpublished` comes from one `rev-list` beside
  the listing; `application::authorize_repository_read_of` scopes read
  supersession to a subject, used with the branch name by
  `get_branch_history`.
- Frontend controller: `prefetchHistory` starts a hover read only when no
  other branch's read is out.

Review pass before closing found and fixed:

- **Publication by position was wrong after a merge** — now Git's answer
  (`unpublished`), with a panel test where the ahead count and the answer
  disagree.
- **"Up to date" was wrong for an active branch that came back** — the route's
  `baseCount` stops at the merge; the count now adds the merge and what main
  saved after it. Tested.
- **A cancelled rename could steal focus** — the 140ms close timer outlived the
  strip when another branch was chosen meanwhile, then focused the old row. The
  timer is cleared on unmount; a test fails without the fix.
- **The field's underline hid the letters** — an inset branch on a 10px radius
  over a box one line tall curved under the text. Now one straight accent
  branch just below the box, no fill and no radius (chosen from four options).
- **The note re-faded on every keystroke that switched it to an error** — the
  fade now belongs to a slot that mounts once.
- **The field took typing while it faded out** — read-only while leaving.
- **Publish was offered with no remote at all** — App passes `onPublish` only
  when the sync state is not `noRemote`, as the status bar does.

Follow-up not done here (agreed with the user): a real compare view between
two branches.

# Validation

- `CARGO_TARGET_DIR=<scratch> pnpm run check` — exit 0. Documentation check
  passed over 303 Markdown files and 219 task ids; docs tests 52 + 21 passed;
  frontend architecture check passed over 589 modules; TypeScript build
  passed; Vitest 140 files / 1470 tests passed; Vite build passed; `cargo fmt
  --check` and `cargo clippy` clean; Rust 601 passed, 1 ignored, plus 1
  integration test. (A separate target directory because the user's running
  `tauri dev` locks `target/debug/gitodile.exe`.)
- Checked in the built-in browser through a throwaway harness (deleted):
  the versions list at 1366 and 1000px wide (no element overhangs it), the
  rename field's text box measured identical to the name at rest (left, top,
  height, font), the last segment selected, spinner and read-only while
  saving, the strip and row lit together after saving, Escape fading out and
  back.
