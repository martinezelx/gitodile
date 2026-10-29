---
id: 037-7
title: Audit the complete conflict workflow
status: active
priority: high
type: audit
areas:
  - conflicts
  - accessibility
  - performance
  - platform
  - testing
created: 2026-08-18
completed:
parent: "037"
queue: "02"
---

# Goal

Independently verify epic 037 from conflict creation through inspect, resolve,
reset, restart, complete, abort, and recovery under real desktop conditions.

# User outcome

Conflict resolution is a reliable product workflow, not a collection of slices
that only pass in isolation.

# Context

This is the closure gate for epic 037 and the prerequisite for task 065-4 to
initiate conflicting integrations in normal product use.

# Scope

- Audit every parent acceptance criterion and conflict class end to end.
- Run large file-count, binary/structural, cancellation, external edit,
  restart/crash boundary, watcher, linked-worktree, and injected-failure cases,
  including a merge started outside GitOdile and abandoned, and a paused
  rebase, cherry-pick, revert and stash pop left by another tool.
- Measure lazy load, first open, process count, IPC/DOM caps, and normal-screen
  regressions against the baseline.
- Perform keyboard, screen reader, zoom, forced colors, reduced motion,
  locale/theme, narrow layout, and platform-specific audits.
- Fix closure defects or record a concrete blocker; remove development flags and
  enable only the complete supported workflow.

# Out of scope

- New operation variants or initiating non-fast-forward integration.

# Acceptance criteria

- [ ] Every acceptance criterion in epic 037 is checked with linked evidence.
- [ ] An independent end-to-end temporary-repository journey covers resolve,
      reset, restart, complete, abort, recovery, and uncertain outcomes.
- [ ] Performance/accessibility/platform results meet the baseline or the epic
      remains open with an explicit blocker.
- [ ] No incomplete resolver affordance ships and normal startup/navigation/
      Changes performance remains within baseline.
- [ ] README, roadmap, ADRs, architecture, IPC, tests, and task notes match the
      delivered behavior and `pnpm run check` passes.

# Relevant files

- [Epic 037](037-guided-conflict-resolution.md)
- [037-1](../done/037-1-conflict-domain-and-recovery.md)
- [037-3](../done/037-3-read-only-conflict-workspace.md)
- [037-6](037-6-resolve-files.md)
- [037-5](037-5-complete-or-abort-merge.md)
- [Performance baseline](../../docs/architecture/023-performance-baseline.md)

# Dependencies

Tasks 037-1, 037-3, 037-6 and 037-5.

# Decisions

The epic closes only on end-to-end evidence from the complete workflow.

# Implementation notes

Record audit ownership, defects, fixes, retained limitations, measurements, and
whether every parent criterion passed.

# Validation

Record the full command/desktop/platform/accessibility matrix and aggregate
check output.
