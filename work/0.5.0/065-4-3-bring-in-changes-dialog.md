---
id: 065-4-3
title: Bring in changes from another branch on screen
status: active
priority: high
type: feature
areas:
  - branches
  - sync
  - frontend
created: 2026-10-29
completed:
parent: "065-4"
queue: "02"
---

# Goal

A medium **Bring in changes** dialog, modelled on Get project changes, that
previews and runs the plan of [065-4-1](../done/065-4-1-bring-in-changes-core.md) and
hands overlaps to [065-4-2](065-4-2-pause-on-overlaps.md) and the
overlapping-changes screen.

# Scope

- Entries: the Branches row menu, the branch detail's actions and the quick
  switch rows that bring a branch into the current one (today marked `Soon`),
  and a palette command with a branch picker.
- A remote branch is checked in the background when the dialog opens and the
  last check is older than a minute, then re-planned in place.
- States: contained, fast-forward, merge, empty merge, overlap with Resolve in
  GitOdile, each blocker with its guidance, stale re-plan, uncertain with only
  Close; English and Spanish; light and dark.

# Out of scope

- Rebase, compare and merging into another branch stay `Soon`.

# Acceptance criteria

- [ ] Every state is reachable and tested at the component level.
- [ ] A paused merge opens the overlapping-changes screen.
- [ ] Checked running beside Get project changes in both themes, with the
      keyboard, and `pnpm run check` passes.

# Dependencies

[065-4-1](../done/065-4-1-bring-in-changes-core.md), [065-4-2](065-4-2-pause-on-overlaps.md).

# Implementation notes

# Validation
