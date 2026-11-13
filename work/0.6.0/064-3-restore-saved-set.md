---
id: 064-3
title: Restore a saved set and keep its copy
status: active
priority: high
type: feature
areas:
  - changes
  - rust
  - recovery
  - conflicts
  - frontend
created: 2026-08-18
completed:
parent: "064"
queue: "05"
---

# Goal

Implement clean-destination stash restoration with index intent, retained stash
evidence, recovery-backed Undo, and task-037 conflict handoff.

# User outcome

The user can bring saved work back without destroying its saved copy and can
recover or resolve overlaps safely.

# Context

This is slice 3 of epic 064. It consumes the conflict/recovery contracts rather
than creating a second resolver.

# Scope

- Plan/revalidate the exact stash object/reflog snapshot and require a clean
  destination for the first release.
- Create durable affected-path/index recovery before applying with index intent.
- Keep the stash entry, verify result, and classify clean/conflict/stale/failure/
  uncertain outcomes.
- Route `stashApply` conflicts to task 037 and offer state-token-safe Undo.

# Out of scope

- Pop, dirty-destination combination, automatic branch switch, or stash branch.

# Acceptance criteria

- [ ] Exact planned entry is applied with index intent and retained in the stack.
- [ ] Current work blocks with an explicit set-aside-first path.
- [ ] Recovery exists before mutation and Undo refuses to overwrite newer work.
- [ ] Conflicts preserve stash/recovery evidence and enter task 037 with correct
      roles and operation behavior.
- [ ] Clean/conflict/stale/failure/uncertain/restart journeys pass all checks.

# Relevant files

- `work/0.6.0/064-set-changes-aside-safely.md`
- `work/done/0.5.0/037-guided-conflict-resolution.md`
- `src-tauri/src/recovery.rs`

# Dependencies

Tasks 064-1, 064-2, and task 037's `stashApply` operation extension.

# Decisions

Apply and keep; removal remains a separate confirmed action.

# Implementation notes

Record recovery format, apply arguments, conflict handoff, and Undo eligibility.

# Validation

Record apply/conflict/restart/Undo fixtures, desktop audit, and checks.
