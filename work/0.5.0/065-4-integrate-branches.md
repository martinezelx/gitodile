---
id: 065-4
title: Integrate branches and diverged project changes safely
status: active
priority: high
type: feature
areas:
  - sync
  - branches
  - conflicts
  - recovery
  - frontend
  - rust
created: 2026-08-18
completed:
parent: "065"
queue: "05"
---

# Goal

Add one previewed merge-based integration workflow for a local branch or
a diverged upstream, completing both clean results and overlaps in-app.

# User outcome

The user can bring another branch of work into the current branch and can get team
changes even when both sides have new saved versions, without choosing between
technical Git strategies or falling back to a terminal.

# Context

Task 014 started with strict fast-forward team updates; task 161
([ADR 0030](../../docs/adr/0030-forecast-and-combine-project-changes.md)) added
clean non-fast-forward integration of the configured upstream, built with
`merge-tree` and `commit-tree`, and refuses real overlaps by name. Task 037
owns conflict truth, per-file resolution, completion, and abort. This task
initiates the merge and connects clean/conflicting outcomes to those contracts,
using the overlap-to-session path that task 037-1's ADR decides.

# Scope

- Offer **Bring in changes from...** for another local/remote branch and
  extend **Get project changes** when the configured upstream has diverged.
- Fetch only on explicit remote planning/execution; local merge planning never
  contacts the network.
- Preview source/destination commits, relation, changed-file evidence, local and
  remote consequences, expected fast-forward/merge result, and recovery.
- Block unresolved operations and unsafe dirty states; never auto-stash. Task 064
  (set changes aside) ships in `0.6.0`, after this task, so for now the guidance
  is to save or discard first; offer 064 once it exists.
- Revalidate under the common-repository mutation lock and create a verified
  durable recovery point before changing history/index/worktree.
- Use a normal merge strategy that preserves existing history. Never rebase,
  squash, force push, silently resolve, or automatically publish.
- Verify clean/empty/already-integrated outcomes. Route overlaps into task 037
  with correct roles, origin, recovery evidence, and resume/complete/abort
  behavior, and lift ADR 0030's refusal of real overlaps for the configured
  upstream once that path exists.
- Report interrupted or partially observed mutation as uncertain and preserve
  all recovery/conflict evidence.

# Out of scope

- Rebase, squash merge, octopus merge, cherry-pick, force push, pull requests,
  or automatic publish.
- Choosing arbitrary merge strategies or editing Git configuration.
- Duplicating any conflict editor or completion/abort implementation.

# Acceptance criteria

- [ ] Local branch and configured-upstream integration handle already-contained,
      fast-forward, clean merge, empty merge, and conflict outcomes accurately.
- [ ] Planning and execution bind exact refs/commits/status/fetch evidence;
      moved refs or changed work produce a stale result, never a retargeted merge.
- [ ] Dirty, unborn, detached, shallow, locked, in-progress, missing-upstream,
      and unsupported states block with actionable guidance.
- [ ] Recovery is verified before mutation and remains discoverable after
      success, conflict, failure, interruption, or restart.
- [ ] Conflicts enter task 037 without losing source roles or performing an
      automatic stage, resolution, abort, commit, or publish.
- [ ] Hooks, signing, identity, credential, remote rejection, and uncertain
      outcomes remain truthful and bounded.
- [ ] Linked worktrees serialize common-ref mutations while refreshing only the
      correct worktree content plus shared refs.
- [ ] Full temporary-repository, frontend, accessibility, and cross-platform
      tests pass, IPC/docs are current, and `pnpm run check` passes.

# Relevant files

- [Design](../../DESIGN.md) § Before designing a screen, dialog or panel, § Dialogs
- `src-tauri/src/sync/`
- `src-tauri/src/branches.rs`
- `src-tauri/src/recovery/`
- `src-tauri/src/repository_access.rs`
- [Epic 037](037-guided-conflict-resolution.md)
- [ADR 0030](../../docs/adr/0030-forecast-and-combine-project-changes.md)
- [Epic 064](../0.6.0/064-set-changes-aside-safely.md)

# Dependencies

- Task 065-1 baseline audit.
- Task 037 conflict session, recovery, per-file resolution, completion, and
  abort contracts, including 037-1's decision on turning a detected overlap
  into a session.
- Existing task-014 fast-forward integration remains the narrow fast path.

# Decisions

- `1.0.0` provides one safe merge-based model; rebase and force push are
  progressive-power features.
- Integration never auto-stashes or auto-publishes.
- This task owns initiation; task 037 owns a conflict once one exists.
- 2026-10-11: [Task 161](../done/161-get-and-publish-without-friction.md) shipped the
  clean configured-upstream half: a local forecast with `merge-tree`, a merge
  version built with `commit-tree` after the merge hooks, and Get-and-publish
  ([ADR 0030](../../docs/adr/0030-forecast-and-combine-project-changes.md)).
  This task keeps bringing in another branch and handing a real
  overlap to task 037, reusing that forecast and merge-version path.

# Implementation notes

Record ancestry/path algorithms, merge arguments, recovery ownership,
conflict handoff, invalidation, and platform findings.

# Validation

Record clean/diverged/conflicting remote fixtures, injected failures, desktop
journeys, platform coverage, and final check output.
