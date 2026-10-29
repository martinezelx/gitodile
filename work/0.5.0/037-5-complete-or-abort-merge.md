---
id: 037-5
title: Complete or abort a conflicted merge safely
status: active
priority: high
type: feature
areas:
  - conflicts
  - rust
  - frontend
  - recovery
created: 2026-08-18
completed:
parent: "037"
queue: "03"
---

# Goal

Add explicit, independently planned merge completion and abort workflows with
fresh validation, recovery, hooks/signing, and uncertain-outcome handling.

# User outcome

After resolving files, the user can finish the merge or deliberately abandon it
without losing resolved work or relying on a terminal.

# Context

Leaving the workspace is never completion or abort. This slice closes the merge
lifecycle established by 037-1, 037-3 and 037-6. Until the recovery center
ships in `0.6.0`, the finish and abort plans themselves name the recovery
evidence and how to use it.

# Scope

- Enable completion only after Rust observes no unmerged entries and all session
  evidence is fresh; preview the merge saved version and local history effect.
- Run normal hooks/signing/identity behavior, verify the commit/ref/index/
  worktree result, and preserve resolved work on failure.
- Plan abort separately, explain limits for externally started dirty merges,
  use verified GitOdile snapshots where available, and require confirmation.
- Handle retry, stale, lock, hook/signing, missing identity, external mutation,
  restart, interruption, partial, and uncertain outcomes without auto-repair.
- Return success to the initiating workflow without publishing automatically.

# Out of scope

- Starting merges, publishing results, or continue/abort semantics for rebase,
  cherry-pick, revert, and stash apply.

# Acceptance criteria

- [ ] Completion cannot run with any unmerged entry or stale session state.
- [ ] Successful completion creates/verifies the intended merge saved version,
      runs hooks/signing, refreshes once, and never publishes.
- [ ] Failed hooks/signing/identity preserve staged resolutions and support retry.
- [ ] Abort preview distinguishes exact GitOdile recovery from best-effort
      external merge behavior and never promises unsupported restoration.
- [ ] Partial/uncertain completion or abort retains snapshots and observed state.
- [ ] Complete/retry/abort/restart journeys pass Rust/frontend/desktop tests.

# Relevant files

- [Epic 037](037-guided-conflict-resolution.md)
- [037-6](037-6-resolve-files.md)
- `src-tauri/src/save_version.rs`
- `src-tauri/src/recovery/`

# Dependencies

Tasks 037-1, 037-3 and 037-6.

# Decisions

Completion, abort, leave, save, and mark-resolved remain five distinct actions.

# Implementation notes

Record planner tokens, Git commands, message behavior, hook/signing integration,
return routing, and failure classification.

# Validation

Record merge fixtures, hook/signing/identity and interruption injection,
restart/desktop journeys, and focused command output.
