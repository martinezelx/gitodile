---
id: 065-6
title: Undo or reverse a saved version safely
status: active
priority: high
type: feature
areas:
  - history
  - recovery
  - conflicts
  - frontend
  - rust
created: 2026-08-18
completed:
parent: "065"
queue: "02"
---

# Goal

Add clear, reversible History actions for correcting an unpublished latest
saved version and for reversing a shared saved version without erasing history.

# User outcome

The user can recover from saving the wrong work or from a bad earlier change
without deciding between reset and revert or risking already-published history.

# Context

Task 015 is deliberately read-only. GitHub Desktop exposes several overlapping
history-editing commands; GitOdile `1.0.0` needs only two intent-based outcomes
with different consequences and recovery.

# Scope

- Offer **Undo this saved version** only for the current tip when publication
  evidence proves it is local-only. Move the branch back one commit while
  retaining that commit in recovery and returning its changes to the working
  tree/index without discarding bytes.
- Offer **Reverse the changes from this version** for a selected reachable
  single-parent version by creating a new saved version that applies its inverse;
  preserve the original history and run hooks/signing normally.
- Preview publication evidence, files, history/worktree/index effects, new
  saved-version message, recovery, confirmation, and conflict possibility.
- Revalidate exact HEAD, selected commit, upstream evidence, status, index, and
  recovery under the mutation lock. Require a clean destination for `1.0.0`.
- Route reverse-operation overlaps through an explicit `revert` extension of
  task 037's operation contract, including correct completion/abort semantics;
  never reuse merge labels blindly.
- Verify success and preserve recovery evidence for stale, failed, conflict,
  hook/signing, restart, and uncertain outcomes.

# Out of scope

- Resetting to an arbitrary commit, hard reset, editing/amending messages,
  reordering, squashing, cherry-picking, or reverting merge commits.
- Restoring arbitrary files from history or checking out a detached commit.
- Automatically publishing the corrective saved version.

# Acceptance criteria

- [ ] Undo is offered only for a latest provably unpublished non-root version;
      unknown/published/upstream-moved evidence blocks history removal.
- [ ] Undo preserves the exact commit in durable recovery and restores exact
      worktree/index intent without using `reset --hard` or losing untracked work.
- [ ] Reverse creates one normal saved version, leaves the original reachable,
      runs hooks/signing, and never publishes automatically.
- [ ] Reverse conflicts use correct revert roles and complete/abort behavior in
      task 037; unsupported merge commits block before mutation.
- [ ] Stale refs, dirty state, detached/unborn/shallow/missing-object, locks,
      failure, restart, and uncertain outcomes preserve truthful evidence.
- [ ] History, status, diffs, sync, and Recovery invalidate once coherently and
      stale dialogs cannot mutate a newer project state.
- [ ] Both workflows pass temporary-repository, frontend, accessibility, and
      platform tests; IPC/docs are current and `pnpm run check` passes.

# Relevant files

- `work/done/0.1.0/015-history-timeline.md`
- `work/done/0.5.0/037-guided-conflict-resolution.md`
- `src-tauri/src/recovery.rs`
- `src-tauri/src/save_version.rs`
- `src-tauri/src/sync.rs`

# Dependencies

- Task 015 History timeline.
- Task 065-5 Recovery center and durable record inventory.
- Task 037 merge resolver, extended here with the bounded revert operation
  variant rather than broad rebase/cherry-pick support.

# Decisions

- Separate unpublished-tip undo from shared-history reversal in wording,
  planning, and implementation.
- Unknown publication evidence is treated as shared, never as permission to
  remove history.
- No arbitrary reset-to-commit in `1.0.0`.
- Design seed for the post-`1.0.0` safety net
  ([ADR 0039](../../docs/adr/0039-position-gitodile-for-humans-and-their-agents.md), 2026-10-27):
  the restore planner should take a contiguous range of saved versions, not
  only one, so undoing a whole session later reuses it. The `1.0.0` interface
  may still offer a single saved version.

# Implementation notes

Record publication proof, temporary-index/recovery algorithm, revert-conflict
extension, message defaults, and verification strategy.

# Validation

Record local/published/unknown/conflicting fixtures, hooks/signing/failure
injection, desktop audits, and final check output.
