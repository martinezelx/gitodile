---
id: 173
title: Clean up several branches at once from Branches
status: done
priority: normal
type: feature
areas:
  - frontend
  - rust
  - recovery
  - ux
created: 2026-10-15
completed: 2026-10-21
parent:
queue:
---

# Goal

"Review" on the Branches list's "Ready to clean up" block opens a preview that
deletes the chosen branches in one confirmed step, rechecking each one first and
reporting the result branch by branch.

# User outcome

A project with a dozen merged `fix/…` and `feature/…` branches is cleared in one
step instead of a dozen dialogs. The reader sees what will go, why each branch
is safe to delete, and whether the published copies go too, and can bring a
deleted branch back afterwards.

# Context

Task [171](171-group-the-branches-list.md) cut the Branches list into "In
progress" and a folded "Ready to clean up", whose "Review" only opens the
block. The bucket uses the same proof as the single delete plan
(`isRetainedElsewhere`: another local or remote-tracking ref holds the tip),
so every branch in it can already be deleted one at a time through
`plan_delete_branch` / `delete_branch`. That flow plans with a
`stateToken`, refuses the active branch, a branch open in another worktree and a
Git operation in progress, can clear the published copy (`deleteRemote`), and
keeps a verified recovery point only when the work survives as copies
(ADR 0016). A batch must not weaken any of those checks.

# Scope

- Rust: a batch plan and execute for deleting branches that are kept
  elsewhere, in `branches.rs` behind narrow commands in `ipc.rs`.
  - The plan takes the chosen names, validates each one as the single plan
    does, and returns per branch: tip, the refs that keep it, published copy
    (if any), and a reason when the branch is excluded.
  - Execute revalidates every branch against the plan's state token before
    removing anything; a branch that no longer qualifies is skipped with its
    reason, and the rest continue.
  - The published copy is removed only when asked, per branch that has one.
    Remote failures are reported per branch and never undo the local half.
  - The result lists each branch as deleted, skipped (reason), or deleted
    locally with a remote error, plus a fresh snapshot.
- Recovery: each deleted branch's name and tip is recorded so it can be
  recreated from Recovery, reusing the existing recovery reference mechanism.
  Confirm during implementation whether that needs an ADR.
- Frontend: "Review" opens a dialog listing the block's branches with
  checkboxes (all on), each with where its work is kept and its sync glyphs;
  a "Delete on the remote too" switch, off by default and only offered when
  at least one chosen branch has a published copy; the plan's summary and
  consequences before the confirmation; a result toast or summary that says
  how many were deleted, skipped and remote failures.
- The dialog goes through the feature's port and `tauriAdapter.ts`, takes the
  mutation slot like the other Branches dialogs, and works by keyboard.
- English and Spanish copy; DESIGN.md (Branches) and README updated.

# Out of scope

- Deleting branches that are not safe to delete (unique work, other worktree,
  the active or main branch).
- Deleting remote-only branches that have no local branch.
- Scheduling or automatic clean-up.
- Changing the single-branch delete dialog beyond sharing code with the batch.

# Acceptance criteria

- [x] "Review" opens the batch dialog; the block heading still folds.
- [x] The plan excludes any branch that fails the single-delete checks, with a
      reason, and offers only branches kept elsewhere.
- [x] Execute refuses a stale plan and revalidates each branch; a branch that no
      longer qualifies is skipped and reported, the rest are deleted.
- [x] Remote copies are removed only when asked; a remote failure is reported
      for that branch and the local deletion stands.
- [x] Every deleted branch can be recreated from Recovery: a verified record
      with its name and tip is kept per branch (ADR 0034). Listing and
      recreating them on screen is the Recovery center's, task 065-5.
- [x] The result names what was deleted, skipped and failed, in both
      languages, and Branches refreshes from the returned snapshot.
- [x] Rust unit tests for the planner; integration tests on temporary
      repositories (all deletable, one became active between plan and
      execute, one open in a worktree, remote delete refused).
- [x] Frontend tests for the dialog: selection, remote switch, plan errors,
      partial results, keyboard and empty states.
- [x] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/branches.rs`
- `src-tauri/src/ipc.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/recovery/`
- `src/features/branches/BranchesDialog.tsx`
- `src/features/branches/BranchesPanel.tsx`
- `src/features/branches/domain.ts`
- `src/features/branches/port.ts`
- `src/features/branches/tauriAdapter.ts`
- `src/features/branches/branchGroups.ts`
- `docs/adr/` (ADR 0016)
- `DESIGN.md`

# Dependencies

- [171](171-group-the-branches-list.md) (done).

# Decisions

- Batch delete is classified as destructive and keeps the preview and
  confirmation the single delete has.
- Branches that stop qualifying between plan and execute are skipped, not a
  reason to abort the whole batch; the result says which and why.
- "Delete on the remote too" is off by default.

# Implementation notes

- Rust: `plan_clean_up_branches` / `clean_up_branches` in
  `branches.rs`, behind narrow commands in `ipc.rs` (read / destructive
  repository write in `application.rs`). The single delete's checks were split
  into `read_delete_context` (once per call: Git version, operation in
  progress, active branch, main branches, worktrees) and `check_line_can_go` (per
  branch), which both flows now share, as is `remove_local_line`.
- Each planned branch carries its own state token (name, tip, published copy).
  The refs that keep it are deliberately not in the token: the other branches in
  the same clean-up change them as they go, so retention is rechecked live
  right before each deletion instead. A branch held by nothing any more is
  skipped as unique work.
- Review found the block's criterion wrong: "another ref holds the tip" is
  true of a published branch in progress (its own `origin/x`), a branch just
  created on main, and a branch another one grew from. "Ready to clean up" now
  means finished (`isFinished`, Rust's `finished_lines`): merged into the
  main branch (local or the remote's copy, from the inventory's `ahead-behind`
  atoms) and with its own work — remote branch deleted, a reflog entry for a
  version saved on it, or a tip off the main branch's first-parent history.
  Age is not a criterion. The batch rechecks it (`branch_not_finished`).
  Squash/rebase-merged branches are not detected in the list (patch-id per branch
  on every refresh is too dear); they stay in progress and the single delete
  still handles them (ADR 0016). `keptOnlyByCleanUp` went with the old
  criterion: a finished branch is always held by the main branch.
- Discovery cost, measured on a synthetic 30,600-version repository with
  400 refs: replacing the whole-history reachability walk (0.3 s) with
  `merge-base --independent` took 0.2 s with a commit-graph but 1.5 s without
  one, so the walk stays. It now runs beside the inventory instead of after
  it; the HEAD reads run beside the main-branch lookup; and the inventory's
  second `ahead-behind` (against the remote's main branch, +0.2 s on 300 branches)
  is asked only when that copy is ahead of the local main branch. The finished
  check adds one reflog read for the merged branches and one first-parent walk
  (0.17 s on 30,000 versions) only when some merged branch still needs it.
- Remote copies go after every local deletion, one `git push --porcelain
  --delete` per remote, read per ref; failures are reported per branch and never
  undo the local half.
- Recovery needed an ADR: [0034](../../../docs/adr/0034-one-recovery-point-per-branch-in-a-clean-up.md).
  A clean-up is its own history-recovery operation
  (`clean-up-branches`, newest 50 kept), one verified record per deleted
  branch with its name and tip; a clean-up asks for at most 50 branches, so it never
  evicts its own records or ADR 0016's.
- Frontend: `CleanUpBranchesDialog.tsx`, through the feature port and
  `tauriAdapter.ts`, taking the mutation slot like the other Branches dialogs.
  "Review" became its own button laid over the clean-up heading's hint branch
  (the heading still folds), and Delete on that heading opens it too. The row
  glyph helpers moved to `branchGlyphs.tsx` so the dialog can draw them.
- Recreating a branch from Recovery: the records are written and verified, and
  the clean-up result reports each reference, but no screen lists them yet;
  that is the Recovery center (065-5).
- Final review fixes:
  - A branch tracking a remote's default branch (created from `origin/main`)
    offered that branch as its "published copy", so "Delete on the remote
    too" could have deleted the project's main branch on the remote. The
    single delete had the same gap. `live_published_line` now never offers a
    remote default branch (`DeleteContext::default_remote_refs`).
  - `finished_among` ran about six Git processes per branch; it is now one
    `for-each-ref` over the chosen branches with `ahead-behind` against both
    homes of the main branch (branch-by-branch `merge-base --is-ancestor` only on
    Git before 2.41), plus the shared reflog and first-parent reads.
  - A failure reading the list back after branches were deleted turned the
    whole clean-up into an error. The result's `snapshot` is now optional;
    the screen refreshes itself when it is missing.
  - Known and accepted: when removing a branch fails after its recovery point
    was written, the point stays (it protects a branch that still exists).

# Validation

- `cargo test --lib clean_up` — 9 passed (planner, token, porcelain parser;
  temporary repositories: all deletable, one became active, one in a
  worktree, one moved since the preview, remote copy kept/deleted, remote
  delete refused). After the criterion change: branches on a real main branch,
  plus finished vs. fresh / published-in-progress / stacked branches, and a
  merged branch whose remote branch was deleted.
- `npx vitest run src/features/branches` — 160 passed, including the
  dialog's selection, remote switch, plan error, partial result, keyboard,
  empty and capped states, and the panel's Review button and Delete key.
- Browser harness (Vite, mocked IPC): the Review button, the dialog, and a
  partial result checked visually; harness removed afterwards.
- `pnpm run check` (2026-10-21, after the final review) — exit 0: docs and
  architecture checks, typecheck, 1572 frontend tests, production build,
  `cargo fmt`, `cargo clippy -D warnings` and 620 Rust tests. Run with a
  separate `CARGO_TARGET_DIR`, since a running `tauri dev` locks
  `target/debug/gitodile.exe`.
- Not run: the real Tauri app against a repository.
