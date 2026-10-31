---
id: "139"
title: History and destructive console commands with recovery points
status: blocked
priority: normal
type: feature
areas:
  - rust
  - recovery
  - frontend
  - accessibility
created: 2026-09-29
completed:
---

# Blocked

Waits for the Recovery Center of
[task 065-5](065-5-recovery-center.md): the recovery
points this task creates must be visible and restorable there. It was the
third child of [epic 138](../done/0.3.0/138-console-git-commands.md), taken out on
2026-09-29 so that epic closes with the read-only console (138-1) and advanced
mode for local and remote changes (138-2). The open decision recorded below
must be settled before this task is picked up.

# Goal

Run the **History change** and **Destructive** tiers of ADR 0017 (there is
no advanced mode since [ADR 0028](../../docs/adr/0028-console-runs-changes-without-a-read-only-mode.md)),
each only after its exact effects are shown and a verified recovery point
exists, with a typed confirmation for anything that discards work.

# User outcome

In advanced mode someone can `git commit --amend -m …`, `git reset --soft
HEAD~1`, `git rebase main`, `git merge try`, `git branch -D old`,
`git reset --hard`, `git clean -fd` or `git push --force-with-lease`. The
console first prints exactly what will be lost or rewritten — the files,
changes or versions — and the recovery point it will keep, then asks for the
target's name to go ahead. Afterwards it prints where the recovery point is,
and the Recovery Center can bring the work back.

# Context

Implements section 5 of
[ADR 0017](../../docs/adr/0017-console-git-commands-by-permission-tier.md)
on the advanced mode and plans of
[138-2](../done/0.3.0/138-2-advanced-mode-local-and-remote-changes.md). Recovery reuses the
ADR 0008/0016 hidden-ref protocol and the ADR 0007 discard store.

# Scope

- **History tier**: `commit --amend`, `reset --soft/--mixed`, non-interactive
  `rebase` (conflicts stop and are handed to the conflict experience of task
  037 when it exists, never auto-resolved), `merge` with `--no-edit`,
  `branch -m/-f`, `tag -f`. Each records the previous commit of every moved ref
  under a new `console` recovery operation with its own namespace, manifest
  folder and retention, and refuses to run if the record cannot be verified.
- **Destructive tier**: `reset --hard`, `restore <path>`, `checkout -- <path>`,
  `clean` (with `-n` computed for the preview; `-x` shows ignored files that
  would go), `branch -d/-D`, `tag -d`, `stash drop` (not `stash clear`),
  `push --force-with-lease`, `push --force`, `push --delete`. Working-tree and
  index content is snapshotted first with the ADR 0007 store and the
  temporary-index preparation of `index.rs`, including the untracked files
  `clean` would delete; a force push or remote delete keeps the remote's
  previous tip as a local recovery ref.
- **Preview**: the exact effects from a pre-flight read — the diff `reset
  --hard` discards, the files `clean` removes, the versions a rebase rewrites
  or a force push drops from the remote — and the recovery point to be kept.
- **Confirmation**: the target's name (branch, tag, remote branch, or the path
  for a single file), or a shown word where there is no single target; a wrong
  answer cancels.
- **Result**: the recovery reference printed in the console block, and the
  record listed in the Recovery Center with a way to restore it.

# Out of scope

- `stash clear`, `gc`, `prune`, `reflog expire`, `update-ref`, `filter-branch`,
  interactive rebase, and anything else ADR 0017 places in Never.

# Acceptance criteria

- [ ] No History or Destructive command runs unless its recovery point was
      created and verified first; a failure to create it refuses the run.
- [ ] For each command in scope, a temporary-repository test runs it and then
      restores the previous state from the recovery point alone.
- [ ] `clean` recovery includes untracked files it removed; `reset --hard`
      recovery includes staged and unstaged changes.
- [ ] Force pushes against a bare remote keep the previous remote tip locally
      and can re-publish it.
- [ ] A stale plan, a wrong confirmation, and a conflict mid-rebase each leave
      the repository recoverable and say what happened.
- [ ] Recovery records appear in the Recovery Center with the console as
      their origin, and retention never deletes a record under 20 per operation.
- [ ] The Windows Tauri app is exercised for each confirmation, a recovery,
      and a refused run.
- [ ] `pnpm run check` passes.

# Relevant files

- [ADR 0017](../../docs/adr/0017-console-git-commands-by-permission-tier.md),
  [ADR 0016](../../docs/adr/0016-keep-a-recovery-point-when-deleting-a-copied-branch.md),
  [ADR 0008](../../docs/adr/0008-store-history-recovery-as-versioned-hidden-refs.md),
  [ADR 0007](../../docs/adr/0007-store-discard-recovery-in-worktree-git-metadata.md)
- `src-tauri/src/recovery/`, `src-tauri/src/index.rs`
- `src/features/console/`

# Dependencies

[138-2](../done/0.3.0/138-2-advanced-mode-local-and-remote-changes.md) and the Recovery
Center inventory of [task 065-5](065-5-recovery-center.md).
Rebase conflicts hand over to [task 037](../done/0.5.0/037-guided-conflict-resolution.md)
once it exists; until then a conflicted rebase is stopped and left for the
user with its recovery point.

# Decisions

- Typed confirmation of the target's name for every destructive command.
- `stash clear` and the other Never commands stay refused whatever the console's settings.
- Open, from 2026-09-29: the user wants to go ahead without recovery points
  while task 065-5 is not implemented, so a discard from the console is final,
  and wants the "Confirm each change" switch of 138-2 to cover these tiers as
  well. Both conflict with the AGENTS.md rule that destructive operations need
  explicit confirmation and a recovery strategy, and with ADR 0017 section 5.
  Before this task starts, either AGENTS.md and the ADR are amended for the
  console, or the scope above stands. Since 2026-10-06 (ADR 0028, task 149)
  every change tier runs without an advanced mode, so lifting this would make
  final discards available to everyone, not only to people who opted in.

# Validation

Record the recovery round-trip fixtures, the force-push and conflict cases, the
Recovery Center check, the Windows desktop check, and `pnpm run check`.
