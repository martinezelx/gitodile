---
id: 065-4-2
title: Turn overlaps into a paused merge that task 037 resolves
status: done
priority: high
type: feature
areas:
  - sync
  - conflicts
  - recovery
  - rust
created: 2026-10-29
completed: 2026-10-30
parent: "065-4"
queue:
---

# Goal

When bringing in a branch or a diverged upstream overlaps and the user chooses
to resolve it, start a real `git merge` that pauses on the overlaps, as
[ADR 0041](../../docs/adr/0041-conflict-sessions-and-their-recovery.md) §7
decides, with GitOdile as the session's origin.

# User outcome

None visible yet; [065-4-3](065-4-3-bring-in-changes-dialog.md) and
[065-4-4](../0.5.0/065-4-4-get-diverged-overlaps.md) offer it. Abandoning such a merge
can promise an exact return.

# Scope

- `start_overlapping_merge(path, sessionEpoch, source, stateToken,
  recoveryReference)`, a local history mutation: refuse prepared changes,
  unsaved changes to a path the merge touches, untracked collisions, a
  paused operation and `branch.<name>.mergeOptions` (`unsupported_merge_setup`); write a start record, then the history recovery point,
  then run `git -c rerere.enabled=false merge --no-ff --no-commit
  --no-autostash -m <message> <commit>`, then take the conflict snapshot with
  origin `gitodile`.
- A start record matching `HEAD` and `MERGE_HEAD` makes the session's origin
  `gitodile` even when the app stopped before the snapshot.
- Verify the pause against the plan (unchanged `HEAD`, `MERGE_HEAD` is the
  source, the overlapping paths, carried work untouched, recovery and
  snapshot present); a refusal that changed nothing is named, anything else
  is uncertain and keeps every record.
- Lift ADR 0030's refusal of real overlaps for this explicit choice; amend
  ADR 0041 with the start record.

# Out of scope

- Any UI; resolving, finishing or abandoning (task 037).

# Acceptance criteria

- [x] A local-branch and an upstream overlap pause as a merge the resolver
      reads with origin `gitodile`, real names and every overlapping file.
- [x] Abandoning it returns exactly; finishing it runs the commit hooks.
- [x] A stop between the merge and the snapshot still reads origin `gitodile`.
- [x] Refusals and uncertain outcomes keep recovery and conflict evidence.
- [x] Docs and IPC are current and `pnpm run check` passes.

# Dependencies

[065-4-1](065-4-1-bring-in-changes-core.md) and epic
[037](../0.5.0/037-guided-conflict-resolution.md).

# Implementation notes

2026-10-30:

- `start_overlapping_merge` is registered in IPC and the execution inventory
  as a repository-write history mutation. Its source is `{kind: "branch",
  source: IntegrationSource}` or `{kind: "upstream"}`; the latter reuses Get's
  token and recovery operation. Both stay local and hold the common Git
  directory permit through snapshot and verification.
- `sync/integrate.rs` retains merge-tree's provisional tree and exact stages
  internally. Both existing plan tokens bind that prediction; Get also binds
  its existing merge title. The clean execution remains separate and refuses
  overlaps. Only saved-version overlaps can start a real merge.
- Preflight checks all staged changes, affected unsaved paths, untracked and
  ignored collisions, operation markers, index lock, full/shared history and
  all branch mergeOptions (including empty values). Paths changed identically
  on both branches are allowed to carry unsaved work when the actual merge
  result does not touch them.
- The conflict recovery owner publishes a flushed schema-1 start record
  create-only in the worktree's Git directory, then history recovery is
  created and verified, then Git runs with the exact arguments in Scope.
  Configured rerere/autoupdate, merge.ff and merge.autoStash are never written.
- Session reads derive GitOdile origin from a matching start even without a
  snapshot. A start ID distinguishes repeated merges of the same pair of
  commits, preventing reuse of an earlier attempt's snapshot and journal.
  Start evidence also participates in the conflict token.
- Successful pause verification proves HEAD, the sole MERGE_HEAD, all predicted
  unmerged stages, carried content and a complete snapshot plus recovery ref.
  Proven unchanged Git refusals are `merge_start_refused`; any other failure
  is `merge_outcome_uncertain` with observed state, start and recovery IDs.
  No repair, abort, commit, stage, fetch or publish follows an uncertain result.
- History retention protects live/interrupted/uncertain starts across linked
  worktrees, conservatively retaining unknown evidence. Start retention and
  bounded recursive hashing of carried untracked directories are specified in ADR 0041
  §10. Finish/Abandon record a verified end; exact Abandon additionally checks
  carried work, and its plan becomes best effort if that work changed later.
- Durable rules are in ADR 0041 §10, amended ADR 0030 §7 and ARCHITECTURE.md;
  no new UI or frontend port is introduced in this slice.
- Reference study: GitButler's
  [but-oplog owner](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/but-oplog/src/lib.rs)
  separates operation evidence from the underlying repository state and
  explicitly bounds what its snapshots own. The reusable principle here is
  explicit ownership of durable evidence; GitOdile keeps its ordinary Git
  merge/session model and existing recovery owners. No source or assets reused.

# Validation

2026-10-30, Windows, system Git, temporary repositories only:

- `cargo test --lib sync -- --nocapture`: 68 passed, including the seven new
  end-to-end overlap tests and unchanged clean integration behavior.
- `cargo test --lib conflict`: 33 passed, including the existing resolver,
  finish/abort tests and two new filesystem-only evidence/retention tests.
- `pnpm vitest run src/architecture/ipcContract.test.ts src/shared/i18n`:
  11 passed after updating the command count and the new structured error.
- `cargo clippy --all-targets --all-features -- -D warnings`: passed during
  implementation; the aggregate gate below rechecks the final changes.
- New real-Git tests cover local/upstream pauses and workflow-specific tokens,
  exact abort with carried tracked/untracked work, commit hook refusal/retry
  and all four finish hooks, stale work/source/title, staged work, affected
  unsaved work, untracked/ignored collision, paused operation, index lock,
  custom/empty mergeOptions, trained rerere with autoupdate, unchanged Git
  refusal, incomplete snapshot/uncertain result, restart before snapshot and
  mismatched origin evidence, plus linked-worktree ownership.
- Follow-up verification also covers repeat attempts with separate snapshots,
  later edits changing an exact abort plan, and identical saved changes on
  both branches carrying unrelated unsaved work. Unsaved-only overlaps remain
  refused through both execution paths.
- Tests exceeding five seconds carry comments explaining their real-Git
  fixture cost; no timeout was raised. No personal project was used.
- No desktop validation: this backend slice has no screen; the UI handoffs
  belong to 065-4-3 and 065-4-4. macOS/Linux execution is not claimed.
- First aggregate run: docs/architecture/typecheck, 1,822 frontend tests and
  build passed; Clippy rejected a needless closure borrow. Corrected without
  changing behavior or relaxing the lint. Final `pnpm run check`: exit 0.
- Final gate: documentation and architecture checks, TypeScript, 1,822 frontend
  tests in 160 files, production build, Rust formatting, Clippy with warnings
  denied, and Rust library tests (691 passed, 1 ignored), plus example targets.
  Rust library tests took 124.68 s in the aggregate run. The expanded local
  pause/abort/repeat/later-edit test took 12.06 s alone on Windows; its comment
  explains the required Git fixture and recovery operations.

- After moving the task to `work/done` and updating release queues and links:
  `pnpm run check:docs` passed; `git diff --check` was clean.

# Pre-commit review

2026-10-30, requested by the user:

- Found that Finish/Abandon left a start marked paused. A later terminal merge
  of the same heads could inherit GitOdile origin and its old snapshot. Added
  explicit terminal states, excluded them from origin lookup, and extended
  the real pause/abort test with an external merge of the same heads. An
  uncertain ended attempt keeps its recovery protection without claiming
  another session; a failed end-record write is reported as uncertain.
- Verified all automatically combined stage-0 index entries against the
  provisional tree, not just the unmerged stages. The pure comparator covers
  changed modes/objects, missing/extra paths and malformed/unexpected stages.
- Preserved the actual pause's snapshot before deciding whether its evidence
  matches the forecast, so an unexpected merge result still keeps its first
  conflict bytes. Failure diagnostics re-read the observed session and
  carried work rather than using the first post-Git read.
- Removed a normal-project blocker: unrelated ignored dependency/build caches
  were recursively hashed and could exceed capture limits. Their paths are
  still checked for collisions, but contents outside Git's footprint are not
  scanned. The real pause/abort test now carries an ignored 5,001-file cache.
- Bounded directory enumeration before allocation, limited nesting to 128,
  and moved the 64 KiB file buffer out of recursive frames. Extended the
  existing filesystem evidence test for entry/depth bounds. Conflict path
  deduplication now uses a set rather than a quadratic scan.
- Focused review validation: the extended real-Git pause/abort test passed
  (15.64 s alone, including the ignored cache and external merge); the injected
  clean-index-drift/refusal/snapshot-failure test passed (11.09 s alone);
  all eight pure integration tests and four conflict recovery tests passed;
  Clippy with warnings denied passed. An initial focused recovery relink hit
  Windows LNK1104 while another focused Rust test held the executable; the
  sequential rerun passed, without changing timeouts or build settings.
- The newest matching start is selected before checking whether it is active,
  so a newer end also masks an older interrupted attempt. End/refusal markers that
  retire retained ambiguous evidence stay with it rather than expiring and
  reviving the earlier origin.
- Final post-review `pnpm run check`: exit 0. Documentation and architecture,
  TypeScript, 1,822 frontend tests in 160 files, production build, Rust format,
  Clippy with warnings denied, 692 Rust library tests passed and 1 ignored
  (159.28 s), plus the example targets. No test timeout was raised.
- The task remains done; release queues and links point to this completed file.
