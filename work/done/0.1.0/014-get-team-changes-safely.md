---
id: 014
title: Review and get team changes through a recoverable fast-forward
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
  - sync
  - recovery
created: 2026-07-27
completed: 2026-08-16
---

# Goal

Let the user review and bring newer upstream versions into the current project
when Git can advance the active branch through a clean, verified,
recoverable fast-forward.

# User outcome

When the Team changes section reports newer versions, the user can inspect the
incoming saved versions and bounded file impact, understand exactly which
local files and history will change, and confirm a safe update. If local work,
repository state, or the remote makes that unsafe, GitOdile stops and explains
the next step instead of merging, rebasing, stashing, or discarding.

# Current context

Task 013 owns the shared `sync` domain, fresh/cached remote relation, explicit
network check, and Overview's Team changes section. This task extends that same
native domain and `src/features/sync/`; it does not create another feature,
screen, remote parser, or fetch implementation.

The app already provides the architecture this flow must reuse:

- session epochs and immutable per-project runtime snapshots;
- fair Rust read/write coordination by canonical `commonGitDir`;
- checked execution policies and bounded Git output;
- operation-in-progress detection;
- plan/confirm/execute/verify mutation patterns and state-token validation;
- feature-owned controllers, ports, adapters, styles, and translations;
- mutation supersession and one shared post-mutation refresh;
- persistent discard recovery records as evidence, but not a reusable
  history-recovery reference contract.

For the MVP, **Get team changes** means a fresh fetch followed by an explicit
fast-forward-only update. It is not a generic `git pull`.

# Scope

## Recovery-reference decision first

- Before implementing the mutation, add an ADR defining the durable recovery
  reference contract used by this flow and future History/Recovery work.
- The ADR must define:
  - exact ref namespace and versioning;
  - collision-resistant naming;
  - worktree/common-repository ownership;
  - metadata required for human-language recovery;
  - creation and atomicity guarantees;
  - visibility in ordinary branch/ref listings;
  - retention limits and cleanup eligibility;
  - behavior after project moves, branch deletion, linked worktrees, and app
    upgrades;
  - how the Recovery center will enumerate and act on the record;
  - failure behavior when ref or metadata creation fails.
- Do not create immortal refs while declaring lifecycle/cleanup out of scope.
  The ADR may defer a full Recovery UI, but this task must implement enough
  retention policy to avoid unbounded hidden references.
- Reuse safe filesystem/atomic-write primitives from `recovery.rs` where their
  contract fits, but do not treat discard snapshots as if they already
  preserve a previous commit.
- Update or remove the matching unresolved recovery-lifecycle backlog item when
  the ADR settles the durable decision.

## Eligibility and blockers

An executable plan requires all of the following:

- an active project/session on a named, born branch;
- a configured and resolvable upstream;
- a fresh task-013 fetch proving the local branch is strictly behind with zero
  local-ahead commits;
- no merge, rebase, cherry-pick, revert, or bisect in progress;
- no staged or unstaged changes;
- no untracked path that could be overwritten by the incoming tree;
- no ignored path that the update could replace without an explicit safety
  proof;
- no conflicting mutation in the same project or a linked worktree sharing
  its `commonGitDir`;
- readable refs, object database, index, and working tree;
- a supported non-bare system-Git repository.

If local changes exist, direct the user to review and save them through the
existing Changes/Save version flow. Never stash, discard, stage, or silently
include them.

Ignored-only content may remain when it provably cannot collide with the
incoming update. If collision safety cannot be established cheaply and
truthfully, block rather than overwrite it.

## Planning contract

- Add `plan_get_team_changes` using task 013's shared fetch and relation code.
- Planning performs a fresh fetch because it presents network-dependent
  consequences. It holds exclusive `commonGitDir` coordination for the fetch
  and all state reads that must form one coherent plan.
- Return a typed `GetTeamChangesPlan` with at least:
  - operation kind: `history-mutation`;
  - `requiresConfirmation: true`;
  - project/session identity and opaque state token;
  - current branch, upstream remote/destination/tracking ref;
  - current local commit and freshly observed upstream commit;
  - incoming saved-version count and bounded summaries/truncation;
  - bounded changed-file/category summary and total/truncation;
  - ordered steps, risks, local consequences, and verification promise;
  - planned recovery reference and recovery explanation;
  - explicit statements that no merge commit, rebase, stash, force, or
    automatic conflict resolution will occur.
- Generate summaries through bounded machine-readable Git output. Reuse
  existing summary/diff parsing where ownership permits; do not add one Git
  process per incoming commit or a second diff renderer.
- Treat commit messages, authors, paths, refs, and remote output as untrusted.

## Execution contract

- Add `get_team_changes` returning a typed `GetTeamChangesResult` with at least:
  - previous and resulting commit IDs;
  - branch, remote, destination, and tracking ref;
  - received version count;
  - recovery record/reference and retention information;
  - verified working-tree status and resulting fresh sync relation;
  - warnings for secondary metadata that could not be refreshed without
    making the primary result uncertain.
- Hold one exclusive Rust repository-write permit for the complete
  revalidate/create-reference/update/verify sequence.
- Execution must:
  1. revalidate project/session identity, branch, `HEAD`, upstream, operation
     state, index/worktree safety, collision safety, and plan token;
  2. perform a fresh fetch of the upstream remote;
  3. recompute ancestry and reject stale, up-to-date, ahead, diverged,
     disappeared, or rewritten targets;
  4. create and verify durable recovery for the previous local `HEAD`;
  5. run an explicit fast-forward-only update to the resolved upstream commit;
  6. verify `HEAD`, active branch, index/worktree, sync relation, and recovery;
  7. return the authoritative result for the originating session.
- Use system Git with separate arguments. Never use `pull`, force, reset,
  checkout of another branch, rebase, automatic stash, or conflict resolution.
- The update must not create a merge commit. Use the narrowest explicit Git
  operation whose native semantics guarantee fast-forward-only behavior and
  preserve ordinary configuration; record the final arguments in the task.

## Failure and uncertain outcomes

Return structured outcomes for at least:

- local status/collision, branch, `HEAD`, upstream, or operation state changed;
- remote became up to date, ahead-only, diverged, removed, or rewritten;
- authentication, host/proxy/network, timeout, cancellation, or rejection;
- recovery-reference or metadata creation/verification failure;
- file lock, permissions, disk space, index lock, or update failure;
- resulting `HEAD`, worktree, sync, or recovery verification failure.

Before recovery exists, every blocked/failing path must leave `HEAD`, index,
and working files unchanged. After it exists, retain it according to the ADR
even if update or verification fails.

If GitOdile cannot prove whether `HEAD` or files changed, report an uncertain
local outcome with the observed `HEAD`, recovery reference, and safe inspection
instructions. Never rewrite files automatically to repair uncertainty.

## Frontend flow

- Replace task 013's disabled **Review and get** control with a real action only
  for a fresh, behind-only status.
- Open one feature-owned confirmation dialog from the Team changes section.
  This overlay is eager; do not code-split it and introduce a click-to-fallback
  frame.
- Keep the dialog and operation bound to their originating session. Switching
  and closing follow existing blocking-operation rules instead of retargeting
  an open plan.
- Lead the preview with incoming versions, bounded file impact, destination,
  local consequences, fast-forward-only behavior, and recovery/retention.
- Put hashes, refs, remote, token evidence, and Git terminology in progressive
  technical details.
- Show honest phases: checking team state, checking local safety, creating
  recovery, updating files/history, and verifying. Add no artificial delay.
- On success, explain that the project includes the newer team versions and
  commit returned state before one shared repository refresh.
- On divergence, explain that both sides changed and guided integration is not
  available. Do not offer a retry that will deterministically fail unchanged.
- Reuse established focus, action, error, cursor, and Friendly Card patterns.

## Refresh and feature integration

- Extend project mutation vocabulary with a sync/get-team-changes kind;
  planning, executing, verifying, success, error, and uncertain remain scoped
  to the originating session.
- Success supersedes older reads, updates sync state, clears invalid pending
  assumptions, and performs exactly one coordinated follow-up refresh.
- Refresh repository identity, working-tree status, pending versions, Branches, and registered History through existing coordinator seams. Do not make
  `features/repository` import sync or history.
- Watcher events coalesce behind the mutation and never trigger another network
  check.
- Task 015 may consume invalidation, but History is not a prerequisite.

# Out of scope

- Merge commits, rebase, squash, or choosing an integration strategy.
- Guided divergence/conflict resolution.
- Automatic stash, stage, save, discard, or conflict resolution.
- Detached/unborn integration or arbitrary commit/branch/tag/remote selection.
- Submodule updating beyond a truthful blocker or warning.
- Force/reset recovery or automatic rollback after uncertainty.
- A full Recovery-center UI.
- Background, periodic, startup, or batch sync.
- A new Sync screen or navigation destination.

# Acceptance criteria

- [x] Only a freshly verified behind-only branch with safe local state and no
      conflicting operation can produce an executable plan.
- [x] The plan identifies incoming versions, bounded file impact, destination,
      exact fast-forward behavior, and recovery outcome.
- [x] Planning/execution reuse task 013's remote/fetch/relation code and use
      exclusive `commonGitDir` coordination while fetching or mutating refs.
- [x] Execution repeats fetch and all safety checks immediately before change.
- [x] Verified recovery exists before local `HEAD` or files change, and its
      lifecycle follows an accepted ADR.
- [x] The update cannot create a merge, rebase, stash, force update, or
      automatic conflict resolution.
- [x] Up-to-date, ahead, diverged, detached, unborn, no-upstream,
      operation-in-progress, dirty, collision, stale, rewritten, and missing
      upstream states are blocked explicitly.
- [x] Staged, unstaged, untracked, and ignored collision content is never
      silently overwritten, discarded, stashed, or included.
- [x] Failures before recovery leave `HEAD`, index, and worktree unchanged;
      later failures retain and report recovery.
- [x] Uncertain outcomes report observed state without automatic repair.
- [x] Success updates the originating working-tree/sync snapshot before one
      coordinated follow-up refresh.
- [x] Spanish/English, keyboard, focus restoration, screen reader, loading,
      cancellation, stale/error/success/uncertain, responsive layouts,
      themes, forced colors, and reduced motion are complete.
- [x] The recovery ADR is accepted, implemented, linked here, and its backlog
      item is resolved or narrowed accurately.

# Required tests and audit

## Rust unit tests

- Eligibility/blocker and state-token mapping.
- Incoming commit/file parsing, caps, and truncation.
- Untracked/ignored incoming-path collision detection.
- Recovery naming, metadata, collision, retention, and verification.
- Fast-forward result and uncertain-outcome classification.
- IPC serialization and execution-policy inventory.

## Rust integration tests

Use bare remotes, separate clones, and linked worktrees for:

- one, many, and truncated incoming commits;
- up-to-date, ahead, behind, diverged, removed, and rewritten histories;
- branch/`HEAD`/upstream changed between status, preview, and execution;
- staged, unstaged, untracked, conflicting/non-conflicting ignored,
  conflicted, and operation-in-progress states;
- recovery created before success and retained after injected failure;
- retention/collision across repeated updates and restart;
- unchanged state for every blocker and pre-recovery failure;
- success exactly matching upstream without a merge commit;
- locks, permissions, timeout/cancellation, and uncertain outcomes;
- linked-worktree exclusion while unrelated repositories remain independent.

## Frontend and desktop audit

- Preview with one, many, truncated, renamed, deleted, binary, long, and
  non-ASCII incoming versions/files.
- Switch/close attempts during every phase and state changing during preview.
- File lock, offline, credentials, cancellation, stale plan, divergence,
  recovery/update/verification failure states.
- Direct success commit followed by exactly one refresh and no watcher-driven
  network duplicate.
- Keyboard-only flow, focus restoration, screen-reader announcements,
  light/dark, approximately 1024px and large windows, forced colors, and
  reduced motion.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/frontend-feature-guide.md`
- `docs/architecture/025-ipc-contract.json`
- `docs/adr/`
- `work/active/013-check-team-changes.md`
- `work/done/0.1.0/015-history-timeline.md`
- `work/backlog.md`
- `work/done/0.1.0/010-save-version.md`
- `work/done/0.1.0/011-publish-changes.md`
- `work/done/0.1.0/012-open-and-switch-projects.md`
- `src/features/sync/`
- `src/features/overview/OverviewPanel.tsx`
- `src/features/repository/readCoordinator.ts`
- `src/features/status/`
- `src/features/branches/`
- `src/projectRuntime.ts`
- `src/projectSessions.ts`
- `src/main.tsx`
- `src/i18n.tsx`
- `src/styles.css`
- `src-tauri/src/sync.rs`
- `src-tauri/src/recovery.rs`
- `src-tauri/src/repository.rs`
- `src-tauri/src/repository_access.rs`
- `src-tauri/src/operation.rs`
- `src-tauri/src/application.rs`
- `src-tauri/src/ipc.rs`
- `src-tauri/src/error.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/tests/`

# Dependencies

- Task 013's shared sync domain, fresh status, snapshot, and Overview entry.
- Delivered Save version, session, mutation coordination, execution policy,
  and repository invalidation behavior.
- An accepted recovery-reference ADR produced first within this task.
- History and the Recovery-center UI are optional consumers, not blockers.

# Decisions

- Keep this task separate from 013 because it changes local history/files and
  introduces a durable recovery contract.
- Extend the same `sync` Rust/frontend feature; add no domain or screen.
- The first inbound integration supports fast-forward only.
- No-upstream and divergence are explained, never guessed or repaired.
- Planning and execution each use fresh remote knowledge; execution always
  revalidates under the exclusive mutation permit.
- Decide recovery lifecycle before creating refs; unbounded hidden refs are not
  an acceptable deferred consequence.
- Never stash, discard, stage, merge, rebase, or force-move user work.

# Implementation notes

Recovery is defined by accepted
[ADR 0008](../../../docs/adr/0008-store-history-recovery-as-versioned-hidden-refs.md).
It uses
`refs/gitodile/recovery/v1/get-team-changes/<owner-id>/<recovery-id>` and a
version-1 manifest below the common Git directory. The owner is a stable digest
of the worktree's relative administrative Git directory; metadata contains the
operation, branch, old/target commits, remote destination, tracking ref and
plan token without an absolute worktree path. Creation writes and flushes a
pending manifest, uses create-only `git update-ref <recovery-ref> <old> <zero>`
and verifies both ref and final manifest before mutation. The newest 20
complete records are retained across all linked worktrees; cleanup uses an
expected-old-value ref deletion and never guesses at unsupported evidence.

Planning and execution share task 013's exact configured-upstream resolution,
redaction, failure classification, ancestry and network executor. Each fresh
preflight runs:

```text
git fetch --no-prune --no-prune-tags <configured-remote> <configured-fetch-refspec>
git rev-parse FETCH_HEAD
```

`plan_get_team_changes` has repository-write/local-mutation execution policy
because fetch updates shared tracking metadata, while its returned plan is
classified `history-mutation`. `get_team_changes` has repository-write/
history-mutation policy. Both therefore hold the exclusive fair coordinator
permit keyed by canonical `commonGitDir`; Publish continues using the same
shared sync implementation.

The opaque state token covers canonical common-repository identity, session
epoch, branch, local commit, remote/destination/tracking ref, freshly fetched
remote commit, planned recovery ref, and the complete NUL-delimited porcelain
v2 safety output. Execution recomputes it after its own fresh fetch. Incoming
versions are limited to 25 and files to 100, with authoritative totals and
truncation flags. File impact comes from one `diff --name-status -z
--find-renames` and one `diff --numstat -z --find-renames` pass; categories are
added/modified/deleted/renamed plus binary evidence.

Collision checks compare complete path components in both directions for
every untracked or ignored path against incoming and rename-source paths. An
exact file, an incoming child below a local directory, or a local child below
an incoming path blocks. If file evidence is truncated and any untracked or
ignored content exists, safety cannot be proved and planning blocks.

After recovery, the exact local update is:

```text
git read-tree -u -m <old-commit> <fresh-target-commit>
git update-ref refs/heads/<active-branch> <fresh-target-commit> <old-commit>
```

The two-tree read updates only the index and tracked files for the reviewed
fast-forward; the compare-and-swap branch move then advances the active branch.
No `pull`, merge, rebase, reset, checkout, stash, force operation or automatic
resolution is used. Because the two local commands cannot be one transaction,
any failure after recovery is classified as a local uncertain result. It
retains recovery, reports observed `HEAD` when readable and gives inspection
instructions without repair or retry.

The eager sync-owned dialog keeps the originating project/session epoch,
shows the five native progress phases, blocks project close/switch while open,
and rejects late planning responses on close. On completion the controller
commits the authoritative fresh sync snapshot first, supersedes older
generations, clears invalid selection and calls `refreshAfterMutation` exactly
once. That coordinator coalesces watcher invalidations and all subscribers
perform local reads only, so no watcher can duplicate the fetch.

# Validation

- Historical UI scan — passed with no
  findings for the completed UI.
- Focused Vitest coverage passed for Team changes eligibility, the dialog's
  preview/phases/error/divergence/cancellation/success/uncertainty, controller
  epochs, IPC, project sessions and the one-refresh/no-extra-fetch app flow.
- Focused Rust tests passed for exact fast-forward/recovery, relationship and
  local-state blockers, stale upstream, pre-recovery and post-recovery locks,
  uncertain results, commit/file caps, collision categories and retention.
- Full Rust suite passed after serializing the heavy sync integration module to
  avoid Windows runner process saturation: **238 passed**, with linked-worktree
  exclusion and unrelated-repository concurrency covered by
  `repository_access` tests.
- Local Vite render was inspected in Spanish in the in-app browser with no
  console warnings/errors; the native dialog behavior is covered by jsdom and
  Tauri/Rust integration tests rather than a scripted live remote mutation.
- Final `pnpm run check` passed after moving this task to `work/done/`:
  documentation, frontend architecture, TypeScript, **302 Vitest tests**,
  production build, Rust formatting, Clippy with warnings denied and all 238
  Rust tests.
- Manual Windows/macOS/Linux native WebView, screen-reader, forced-colors and
  real credential/proxy/disk-full QA remain release validation gaps; automated
  DOM, focus, reduced-motion/forced-colors CSS, hermetic Git and CI platform
  checks are present and no claim of unperformed manual platform QA is made.
