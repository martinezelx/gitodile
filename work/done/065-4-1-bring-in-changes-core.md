---
id: 065-4-1
title: Plan and bring in another branch's changes in Rust
status: done
priority: high
type: feature
areas:
  - sync
  - branches
  - recovery
  - rust
created: 2026-10-29
completed: 2026-10-29
parent: "065-4"
queue:
---

# Goal

The native half of bringing another local or remote branch into the current
branch when nothing overlaps: a read-only plan and a verified execution that
reuse the get-project-changes analysis of
[ADR 0030](../../docs/adr/0030-forecast-and-combine-project-changes.md) with
any source commit, not only the configured upstream.

# User outcome

None visible yet; [065-4-3](../0.5.0/065-4-3-bring-in-changes-dialog.md) puts the
commands on screen. Every later step has a tested, stale-safe contract.

# Context

`sync/get_team_changes.rs` already forecasts with `merge-tree`, carries and
combines unsaved changes, runs the merge hooks, builds a merge version with
`commit-tree` and moves the branch with a compare-and-swap `update-ref`, but
only towards the upstream's tracking ref. This slice generalizes the source
and adds the states a branch source can be in.

# Scope

- An `IntegrationSource`: a local branch or a remote-tracking branch,
  resolved to one exact commit when planned. The configured upstream keeps
  its own Get project changes commands, which share the same analysis.
- `plan_bring_in_changes(path, sessionEpoch, source)`: a repository read that
  never contacts the network and answers already contained, fast-forward,
  merge (clean or empty) or overlap, with the incoming versions, the files,
  the forecast and the recovery preview.
- `bring_in_changes(path, sessionEpoch, source, stateToken, recoveryReference,
  runHooks)`: a local history mutation under the write lock that revalidates
  the token and fast-forwards or builds the merge version, after a verified
  recovery point under its own `bring-in-changes` operation.
- The token binds the repository, the session epoch, the branch and its commit,
  the source kind, ref and commit, the predicted tree, the local-safety
  snapshot, the combination and the recovery reference; a moved ref or changed
  work is `stale_bring_in_plan`, never a retargeted merge.
- Blocks with guidance: detached, unborn, a source that is the current branch
  or missing, shallow clone, no shared history, an operation in progress,
  sparse checkout, Git too old, and every local-safety blocker the forecast
  already reports. (`branch.<name>.mergeOptions` moved to 065-4-2: see
  Decisions.)
- Overlaps are reported by name and refused; [065-4-2](065-4-2-pause-on-overlaps.md)
  turns them into a paused merge.

# Out of scope

- Pausing on overlaps, the dialog, the remote check for a remote branch, and
  any change to how Get project changes behaves today.

# Acceptance criteria

- [x] Already contained, fast-forward, clean merge and empty merge are planned
      and executed (the first only planned) and verified for a local and a
      remote-tracking source.
- [x] A moved source, a moved branch or changed work between plan and
      execution is stale and changes nothing.
- [x] Every blocking state refuses with a structured error and guidance.
- [x] The recovery point is verified before any change and stays after
      success or an uncertain result.
- [x] Hook, identity and signing failures of the merge version leave the
      project untouched.
- [x] A linked worktree brings changes in its own worktree, owns its recovery
      record, and leaves the main worktree's files alone.
- [x] IPC contract, ARCHITECTURE.md and an ADR 0030 amendment are current and
      `pnpm run check` passes.

# Relevant files

- `src-tauri/src/sync/get_team_changes.rs`, `src-tauri/src/sync/mod.rs`
- `src-tauri/src/recovery/history.rs`
- `src-tauri/src/application.rs`, `src-tauri/src/ipc.rs`, `src-tauri/src/lib.rs`
- `src-tauri/src/tests/sync_tests.rs`

# Dependencies

Task 161 (ADR 0030).

# Decisions

See the 2026-10-29 decisions in the parent [065-4](../0.5.0/065-4-integrate-branches.md).

- 2026-10-29: `branch.<name>.mergeOptions` is checked by 065-4-2, not here.
  The clean path builds the merge version with `commit-tree`, so that setting
  cannot change what was previewed; it only matters once `git merge` runs.
- 2026-10-29: the shallow block applies only when the two sides have no
  merge base on this computer. A shallow clone whose history reaches the
  point where the branches parted merges normally.
- Get project changes keeps its own commands and its `get-team-changes`
  recovery operation. The shallow, unrelated-history and sparse checks are
  not added to it here, to leave its behaviour untouched; 065-4-4 revisits
  that.

# Implementation notes

- `src-tauri/src/sync/get_team_changes.rs` became `sync/integrate.rs` (a
  `git mv`). It still owns one analysis (`analyze`) and now one execution
  (`apply_integration`). Get project changes and Bring in changes both call
  them. Get's behaviour is unchanged; its execution body moved into the
  shared function as it was.
- New: `IntegrationSource` (tagged `localBranch` / `remoteBranch`),
  `ResolvedSource`, `BringInKind` (`alreadyContained`, `fastForward`, `merge`,
  `emptyMerge`), `BringInChangesPlan`, `BringInChangesResult`,
  `plan_bring_in_changes` (repository read) and `bring_in_changes`
  (repository write, history mutation, progress channel as Get's).
- Source resolution. A local branch is `refs/heads/<name>`. A remote branch
  goes through that remote's own `remote.<name>.fetch` mapping
  (`map_fetch_refspec`), so the plan reads the same ref a check updates.
- Token: `compute_integration_state_token` replaces Get's token function. It
  hashes the workflow name and the source's refs as a slice, so a Get token
  can never run as a bring-in or the reverse. The analysis is optional, for
  an already-contained source.
- Empty merge: the merge kind whose predicted tree equals `HEAD^{tree}`.
- Recovery: `HistoryRecoveryOperation::BringInChanges`, slug
  `bring-in-changes`, limit 20. The unused `create_history_recovery` wrapper
  was removed; its tests call `create_history_recovery_for`.
- Errors: `stale_bring_in_plan`, `shallow_history`, `no_shared_history` and
  `unsupported_merge_setup`, with English and Spanish messages.
- No TypeScript port yet; 065-4-3 adds it with the dialog. The IPC contract
  JSON, the Rust and TypeScript contract tests and the policy inventory list
  the two commands.
- Linked worktrees: serialization comes from the existing coordinator, keyed
  by the common Git directory (`repository_access`, tested there). The new
  test proves the linked worktree's own branch, files and recovery owner.

# Validation

2026-10-29, Windows 11 Home 10.0.26300, Git 2.55.0.windows.3:

- `cargo test --lib sync`: 59 passed, the six new tests included, and Get
  project changes' existing tests unchanged after its execution moved into
  `apply_integration`.
- New tests in `src-tauri/src/tests/sync_tests.rs`, with their time when run
  alone (2.5 s of each is the published-repository fixture; a comment above
  each says why it is not cheaper):
  - `bringing_in_a_local_branch_fast_forwards_merges_and_records_an_empty_merge`
    (about 9 s): fast-forward carrying an unsaved edit, already contained
    refusing to run, merge after a `pre-merge-commit` hook with Git's message,
    empty merge keeping the tree.
  - `bringing_in_a_remote_branch_reads_its_last_check_and_names_it_like_git`
    (about 5.5 s): the tracking ref as last fetched while the remote moved on,
    an unknown remote, and a branch that was never checked.
  - `bringing_in_is_stale_when_the_source_the_branch_or_the_work_moved_after_review`
    (about 6 s): moved source, edited file, moved branch; each leaves `HEAD`
    alone and creates no recovery ref.
  - `bringing_in_refuses_states_it_cannot_combine_safely` (about 5 s): active
    branch, missing branch, no shared history, sparse checkout, paused
    operation, detached, unborn, and a `--depth 1` clone (`shallow_history`).
  - `merge_version_failures_and_overlaps_leave_the_project_untouched`
    (about 7 s): hook, empty `user.name` and failing `gpg.program` against one
    plan, each with nothing changed; same-line overlap refused by name.
  - `a_linked_worktree_brings_changes_into_its_own_branch_and_owns_its_recovery`
    (about 5 s).
- `pnpm vitest run src/architecture/ipcContract.test.ts src/shared/i18n`:
  11 passed.
- `cargo fmt` and `cargo clippy --all-targets --all-features -- -D warnings`:
  clean.
- `pnpm run check`: exit 0. Docs and architecture checks, typecheck, 1,822
  frontend tests in 160 files, build, `cargo fmt`, `clippy`, and Rust 680
  passed, 1 ignored.
- Nothing to check in the running app yet: this slice has no screen.

# Review

2026-10-29, a code review of the slice before committing:

- The merge title left out ` into <branch>` for `main` and `master`, which
  is not what Git does: `git merge` follows `merge.suppressDest` (globs,
  `master` alone when unset). The title now reads that setting and matches
  its globs the way Git's `wildmatch` with `WM_PATHNAME` does. The plan
  computes it once, shows it, and binds it in the token, so a change of the
  setting between review and confirmation is a stale plan rather than a
  different message.
- An already-contained plan claimed to be a history mutation needing
  confirmation. It is now `read-only` with `requiresConfirmation: false`.
- The unsaved-content snapshot commit said "before getting project
  changes" for both workflows; it now says "before combining saved
  versions".
- Added unit tests for the title rule and for how `IntegrationSource`
  crosses IPC (tagged `localBranch` / `remoteBranch`, anything else
  refused).
- No other finding. The Get path keeps its behaviour: the moved execution
  is the same steps, and the only text changes are remediations that now
  name their workflow, plus a new remediation for an unborn branch.
- After the review: `pnpm run check` exit 0 (1,822 frontend tests; Rust
  682 passed, 1 ignored), `clippy` clean.
