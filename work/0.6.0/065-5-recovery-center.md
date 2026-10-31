---
id: 065-5
title: Make recovery records visible and safely actionable
status: active
priority: high
type: feature
areas:
  - recovery
  - frontend
  - rust
  - accessibility
created: 2026-08-18
completed:
parent: "065"
queue: "01"
---

# Goal

Turn the disabled Recovery destination into an honest inventory of the local
recovery evidence GitOdile creates and the restores it can still prove safe.

# User outcome

After a discard, team update, conflict operation, or later supported mutation,
the user can see what GitOdile protected, why it exists, how long it is kept,
and whether it can be restored automatically.

# Context

Persistent discard snapshots and hidden history recovery refs already exist,
but only the latest discard Undo is visible in Changes and history recovery has
no product surface. Conflict and stash work add more record types. One screen
must present these without pretending every Git state can be universally
restored.

# Scope

- Define a versioned, typed recovery inventory over discard, history-update,
  conflict-session, stash-removal, and future registered record adapters.
- List bounded summaries by project/common repository with operation, time,
  affected scope, protected state, retention, completeness, and eligibility.
- Enable Recovery navigation only when loading/empty/error/populated states are
  real; empty Recovery remains useful and explanatory.
- Show bounded technical evidence progressively without exposing source content
  by default, credentials, or authenticated URLs.
- Offer restore only through the owning domain's plan/revalidate/execute/verify
  contract. Read-only or ineligible records remain inspectable with a reason.
- Never delete unreadable, incomplete, unknown-version, or currently protected
  evidence automatically. Define explicit cleanup/retention behavior in an ADR
  before adding user removal.
- Coordinate shared-repository and worktree-specific invalidation, pagination,
  restart, linked worktrees, and stale eligibility.

# Out of scope

- A generic reflog browser or arbitrary Git repair console.
- Guessing how to restore unsupported/incomplete evidence.
- History actions owned by task 065-6 or stash content owned by task 064.
- Cloud backup or synchronization.

# Acceptance criteria

- [ ] Every supported GitOdile recovery record is discoverable with accurate
      ownership, operation, scope, retention, and current eligibility.
- [ ] Corrupt, incomplete, expired-ref, missing-object, unsupported-version,
      permission, and externally changed records remain truthful and preserved.
- [ ] Automatic restore is available only after the owning domain revalidates a
      state token and proves it will not overwrite newer work.
- [ ] Linked worktrees show shared and worktree-specific records without
      cross-restoring paths or duplicating common records.
- [ ] Lists/payloads are bounded and virtualized; refresh never scans or renders
      unbounded content or sends repository source data unnecessarily.
- [ ] Empty/loading/stale/error/partial/uncertain/success states, both locales
      and themes, keyboard/focus/screen reader, narrow layout, and 200% zoom pass.
- [ ] Recovery format/retention ADRs, IPC fixture, architecture, README, and
      tests match behavior and `pnpm run check` passes.

# Relevant files

- `src/screens.tsx`
- `src-tauri/src/recovery.rs`
- `docs/adr/0007-store-discard-recovery-in-worktree-git-metadata.md`
- `docs/adr/0008-store-history-recovery-as-versioned-hidden-refs.md`
- `work/done/0.5.0/037-guided-conflict-resolution.md`
- `work/0.6.0/064-set-changes-aside-safely.md`

# Dependencies

- Task 065-1 baseline audit.
- Existing discard and get-team-changes recovery implementations.
- Task 037's conflict recovery format before conflict records are marked fully
  supported. The screen may land adapters incrementally without guessing.

# Decisions

- Recovery is an inventory of typed domain-owned records, not one universal
  restore algorithm.
- Incomplete evidence is kept and explained.
- A record's presence does not imply current automatic-restore eligibility.
- Design seed for the post-`1.0.0` safety net
  ([ADR 0039](../../docs/adr/0039-position-gitodile-for-humans-and-their-agents.md), 2026-10-27):
  the record model, inventory and restore path must not assume GitOdile
  created the record, so a future record of a change made outside GitOdile
  (another tool or a coding agent) fits without a rewrite. This adds no such
  record or capture to this task's scope.

# Implementation notes

Record adapter contract, pagination/retention rules, eligibility refresh,
privacy boundaries, and recovery format decisions.

# Validation

Record mixed/corrupt/restart/linked-worktree fixtures, restore journeys,
desktop/accessibility audit, and final check output.
