---
id: 065-4-5
title: Audit the integration workflow end to end
status: active
priority: high
type: audit
areas:
  - sync
  - conflicts
  - platform
  - testing
created: 2026-10-29
completed:
parent: "065-4"
queue: "01"
---

# Goal

Verify epic [065-4](065-4-integrate-branches.md) in the running app on
temporary repositories: every outcome, entry and blocker, the hand-off to the
resolver, restart mid-merge, linked worktrees, hooks, signing, credentials and
a rejecting remote.

# Acceptance criteria

- [ ] Every parent criterion is checked with linked evidence.
- [ ] README, roadmap, release notes and docs match the delivered behavior.
- [ ] `pnpm run check` passes.

# Dependencies

[065-4-1](../done/065-4-1-bring-in-changes-core.md) through
[065-4-4](../done/065-4-4-get-diverged-overlaps.md).

# Implementation notes

# Validation
