---
id: 065-4-2
title: Turn overlaps into a paused merge that task 037 resolves
status: active
priority: high
type: feature
areas:
  - sync
  - conflicts
  - recovery
  - rust
created: 2026-10-29
completed:
parent: "065-4"
queue: "01"
---

# Goal

When bringing in a branch or a diverged upstream overlaps and the user chooses
to resolve it, start a real `git merge` that pauses on the overlaps, as
[ADR 0041](../../docs/adr/0041-conflict-sessions-and-their-recovery.md) §7
decides, with GitOdile as the session's origin.

# User outcome

None visible yet; [065-4-3](065-4-3-bring-in-changes-dialog.md) and
[065-4-4](065-4-4-get-diverged-overlaps.md) offer it. Abandoning such a merge
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

- [ ] A local-branch and an upstream overlap pause as a merge the resolver
      reads with origin `gitodile`, real names and every overlapping file.
- [ ] Abandoning it returns exactly; finishing it runs the commit hooks.
- [ ] A stop between the merge and the snapshot still reads origin `gitodile`.
- [ ] Refusals and uncertain outcomes keep recovery and conflict evidence.
- [ ] Docs and IPC are current and `pnpm run check` passes.

# Dependencies

[065-4-1](../done/065-4-1-bring-in-changes-core.md) and epic
[037](037-guided-conflict-resolution.md).

# Implementation notes

# Validation
