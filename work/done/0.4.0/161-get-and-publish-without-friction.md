---
id: 161
title: Get and publish project changes without friction when nothing overlaps
status: done
priority: high
type: feature
areas:
  - sync
  - recovery
  - frontend
  - rust
  - design
created: 2026-10-11
completed: 2026-10-11
parent:
queue:
---

# Goal

Make **Get project changes** fast, short and explicit about overlaps: predict
on this computer whether what is waiting on the remote overlaps any local work,
let the update (or a publish that needs it first) go through whenever nothing
overlaps, and stop with a clear warning naming the files whenever something
does.

# User outcome

The Overview card already knows, before anything is pressed, whether getting is
direct, needs combining with saved versions that are not published yet, or
overlaps local work. Getting opens instantly, says in one line what comes in
and what of the user's stays as it is, and needs one confirmation. When both
sides have new versions that do not overlap, GitOdile combines them with a
merge version instead of sending the user to another Git tool, and Publish can
get, combine and publish in one confirmation. Real overlaps are refused with
the overlapping files listed, until guided conflict resolution (task 037)
exists.

# Context

Task 014 shipped a strict fast-forward update and task 074 let it carry
separate tracked changes. The review in this session (see the "Traer sin
fricción" artifact) found:

- Planning and execution each ran their own `fetch`, so every update waited on
  the network twice and the dialog opened on a spinner.
- A diverged branch was a dead end: Overview offered **Review and get**, the
  dialog answered "Combine them in another Git tool", and Publish answered "Get
  project changes first".
- Overlap was decided per path: a local edit to line 4 and a team edit to line
  80 of the same file were refused with the same message as a real overlap.
- The collision check compared local work with the incoming file list *after*
  it had been capped at 100 for display, so any local change blocked a large
  update.
- With unsaved changes, Overview only offered to save first, which leads into
  the diverged dead end.
- The dialog was large: three steps, two unrelated lists, two sentences and
  eight technical fields for a yes/no decision.

[Task 065-4](../0.5.0/065-4-integrate-branches.md) already decided
that 1.0 combines branches with a merge and never rebases. This task takes over
the clean, configured-upstream half of that work; 065-4 keeps "bring in changes
from another branch" and the hand-off of a real overlap into task 037.

# Scope

Phase 1 — fast and clear, no new Git operation:

- Plan from the already-fetched tracking ref (no network); the dialog renders
  at once and refreshes the remote in the background only when the last check
  is older than a minute, re-planning in place if the remote moved.
- Execute without a second fetch: apply exactly the reviewed remote commit, and
  re-plan in the dialog (instead of failing) if the tracking ref moved.
- Compare local work against every incoming path; cap only what crosses IPC.
- Medium dialog: one title, one subtitle (who, how many files), the safety
  facts, a collapsed "What comes in" list of versions with authors and file
  counts, and technical details collapsed at the bottom.
- Overview offers Get beside Save when unsaved changes do not overlap the
  update, and stops offering a button that is known to fail.

Phase 2 — predict and combine:

- `TeamSyncStatus.forecast`: after every local read and check of a behind or
  diverged branch, predict the update with `git merge-tree --write-tree` (no
  files, index or refs touched) and report clear / overlap / blocked, the
  overlapping paths with whether the local side is saved or unsaved, the
  incoming authors, file count and how many unsaved files are carried or
  combined.
- Overview card: "N new versions on origin" with Get N, "origin has N new and
  you have M unpublished" with Get and combine, or "Your changes and origin's
  overlap" with the files and no way through.
- Combine a diverged, non-overlapping branch with a merge version
  (`Merge remote-tracking branch 'origin/main'`), created with
  `commit-tree` from the predicted tree after the project's `pre-merge-commit`,
  `prepare-commit-msg` and `commit-msg` hooks (unless hooks are off in
  Settings) and with `commit.gpgSign` honoured; recovery first, compare-and-swap
  branch move, verification after.
- Publish with the remote ahead: one confirmation gets, combines and then
  publishes.
- ADR for the integration operation.

Phase 3 — same file, different lines:

- Predict unsaved changes against the update with a temporary index holding
  the worktree content of the overlapping files and
  `merge-tree --merge-base=HEAD`.
- Apply without stash: keep a recovery snapshot of the unsaved content under its
  own hidden ref next to the history recovery point, update the index to the
  incoming version, and write the combined content back as an unsaved change.
- Prepared (staged) changes to an overlapping file still block, with a message
  that says why.

# Out of scope

- Resolving real overlaps (task 037) and bringing in another branch
  (065-4).
- Rebase, squash, force push, auto-stash or automatic publish without a
  confirmation.
- A recovery center that restores these recovery points from the app (065-5).

# Acceptance criteria

- [x] Opening Get project changes shows the plan without waiting on the
      network; at most one fetch happens per update, in the background.
- [x] Execution applies the reviewed remote commit only; a moved tracking ref
      re-plans in the dialog instead of failing or applying something unseen.
- [x] Local work is compared with every incoming path, however many there are.
- [x] `TeamSyncStatus.forecast` predicts clear, overlap and blocked outcomes for
      behind and diverged branches, with bounded paths and totals, without changing
      files, index or refs.
- [x] A diverged branch without overlaps is combined with a merge version whose
      parents are the previous local tip and the reviewed remote commit, after a
      verified recovery point, running merge hooks unless they are turned off
      and honouring commit signing; hook, identity and signing failures leave
      the project untouched and are reported as such.
- [x] Unsaved edits to an incoming file on different lines are kept as unsaved
      edits on top of the incoming version, with a recovery snapshot of their
      previous content; staged edits to an incoming file still block.
- [x] Overlaps (saved or unsaved) and untracked collisions are refused with the
      files listed, in the Overview card and in the dialog.
- [x] Publish with the remote ahead and no overlap gets, combines and publishes
      after one confirmation.
- [x] Overview never offers an action that the forecast already knows will
      fail.
- [x] Rust integration tests cover fast-forward, merge, line-level unsaved
      merge, overlap, staged overlap, untracked collision, hook rejection and a
      large incoming list; frontend tests cover the card states and the dialog.
- [x] English and Spanish copy, ARCHITECTURE.md, an ADR and the release notes
      are updated, and `pnpm run check` passes.

# Relevant files

- `src-tauri/src/sync/mod.rs`
- `src-tauri/src/sync/get_team_changes.rs`
- `src-tauri/src/recovery/history.rs`
- `src-tauri/src/index.rs`
- `src-tauri/src/application.rs`
- `src-tauri/src/ipc.rs`
- `src-tauri/src/tests/sync_tests.rs`
- `src/features/sync/`
- `src/features/overview/nextStep.ts`, `NextStepCard.tsx`, `journey.ts`
- `src/app/App.tsx`
- `docs/ARCHITECTURE.md`

# Dependencies

- Task 014 and 074 (fast-forward update with separate local changes).
- Git 2.40 or newer for `merge-tree --write-tree --merge-base`; older Git keeps
  the fast-forward behaviour and the forecast says so.

# Decisions

- Combining uses a merge version, not rebase, as task 065-4 and the roadmap
  already decided for 1.0 (confirmed by the user on 2026-10-11).
- The merge commit is created with `commit-tree` from the predicted tree so
  every check (hooks, signing, identity) happens before any file, index or ref
  changes; the hooks Git would run for a merge commit are run with
  `git hook run`, with a temporary index holding the merge result.
- Fast-forward keeps running no hooks, as before.
- A clean fast-forward still asks for one confirmation in a medium dialog: the
  plan is the preview AGENTS.md requires before changing history.
- Publish with the remote ahead is one confirmation for both steps.
- `plan_get_team_changes` is a repository read now (it never fetches); its
  `read-tree --dry-run` proof runs against a copy of the index so it can't
  collide with a status refresh holding `index.lock`.
- The forecast is part of every team-sync read of a behind or diverged branch,
  and an idle `sync-forecast` read subscriber refreshes it after file saves
  while versions are waiting, since unsaved edits change it.

# Implementation notes

Rust (`src-tauri/src/sync/get_team_changes.rs`, rewritten):

- One `analyze` drives the forecast, the plan and the execution. It reads the
  tracking ref (no network), predicts the target tree (`<remote>^{tree}` or
  `merge-tree --write-tree HEAD <remote>`), lists every changed path towards it
  uncapped, then checks untracked/ignored collisions, prepared overlaps and
  unsaved overlaps. Unsaved, unstaged in-place edits of a regular file the
  remote also edits in place are combined with
  `merge-tree --merge-base=HEAD <W> <T>`, where `W` comes from
  `index::prepare_tree_index` (temporary index with `git add -A -- <paths>`).
  Exit 129 from `merge-tree` is reported as `gitTooOld`.
- `forecast_incoming` is the read model's one door into the module;
  `sync/mod.rs` attaches it to `TeamSyncStatus.forecast` for behind/diverged
  branches, and `ReviewAndGet` is now also a next action for diverged branches.
- Execution: revalidate (token binds trees and the combination), build the
  merge version (`git hook run` for `pre-merge-commit`, `prepare-commit-msg`,
  `commit-msg` with `GIT_INDEX_FILE` = merge tree, message cleaned like Git's
  whitespace mode, `commit-tree … [-S]`), create recovery with an optional
  unsaved snapshot commit (fixed GitOdile identity, never signed), release
  combined files with `checkout-index -f -u`, prove carry, `read-tree -u -m`,
  CAS `update-ref`, write combined blobs back with `cat-file --filters`, then
  verify carried records/bytes, combined blobs, recovery refs and the relation.
- `recovery/history.rs`: records gain optional `unsavedReference` /
  `unsavedSnapshot`; the snapshot ref lives under
  `refs/gitodile/recovery/v1/get-team-changes-unsaved/` and is created,
  verified, reconciled and pruned with its record (ADR 0030).
- `index.rs`: `prepare_tree_index` and `copy_project_index`.
- IPC: `plan_get_team_changes(path, sessionEpoch)` lost its progress channel;
  `get_team_changes` gained `runHooks`. `incoming_path_collision` is gone (an
  untracked collision is a forecast blocker now). Contract JSON updated.

Frontend:

- `features/sync`: new domain types (`IncomingForecast`, `IntegrationKind`, …),
  `isRemoteCheckRecent`, `forecastBlockerCopy`, and a rewritten medium
  `GetTeamChangesDialog`: opens on the local plan, background check when the
  session's last check is older than a minute, in-place re-plan with a notice
  (also on `stale_get_team_changes_plan`), overlap/blocked alerts with files,
  phase label with a loading bar, toast results, and Get and publish with a
  retry when only the publish fails.
- `features/overview`: `journey.publish.forecast`; `nextStep` adds `overlap`
  and `incomingBlocked` kinds, `explainIncoming` and `getAndPublish` actions,
  and a `note` line; `NextStepCard` renders the note and the counted labels.
- `App.tsx`: Get intent state, `isRemoteCheckRecent`-gated background check,
  `recordPublished` shared by the publish dialog and Get and publish, diverged
  Publish routed through Get, the publish → get hand-over, notifications for
  diverged branches with a forecast, and the `sync-forecast` read subscriber.
- `PublishDialog`: `onGetFirst` turns `behind_remote` / `diverged_histories`
  into "Get and publish".

Follow-ups: identity and signing failures of the merge version are classified
but not covered by an integration test; the `sync-forecast` subscriber can
read local sync status a second time after a shared change (the plain `sync`
subscriber already did); a Recovery center (065-5) is still needed to restore
these recovery points from the app.

# Validation

- `cargo test --manifest-path src-tauri/Cargo.toml --lib sync`: 43 passed,
  including the new merge, saved overlap, line-level unsaved combination,
  same-line unsaved overlap, prepared overlap, merge-hook rejection and split
  index cases; the updated fast-forward, collision and large-list cases.
- `npx vitest run` for sync, overview, publish and app: all passed, with new
  tests for the dialog states, the card states, Publish's get-first path and
  Recent history grouping after a merge.
- Visual check of the card and the dialog (light and dark) through a throwaway
  browser harness rendering them from fixtures; removed afterwards.
- Manual check by the user in the running app: getting from origin with
  unpublished, non-overlapping local versions produced the merge version. It
  exposed Recent history grouping by date order (fixed: grouped by
  publication) and a test broken by the merged commits themselves (a scrollbar
  marker moved from a class to `data-pointer-active` on the remote side).
- Review pass: execution now restores combined unsaved content when releasing
  or proving the carry fails with an error, not only when it reports "no";
  a pending record kept for inspection keeps its unsaved snapshot ref.
- `pnpm run check`: docs, architecture, typecheck, 1437 frontend tests,
  build, `cargo fmt` and `clippy` passed. Its `cargo test` step could not
  replace `target/debug/gitodile.exe` while the app was open for manual
  testing, so the same `cargo test --all-targets --all-features` ran with a
  separate `CARGO_TARGET_DIR`: 592 passed, 1 ignored.
