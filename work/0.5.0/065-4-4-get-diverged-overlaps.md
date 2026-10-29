---
id: 065-4-4
title: Resolve a diverged upstream's overlaps from Get project changes
status: active
priority: high
type: feature
areas:
  - sync
  - overview
  - frontend
created: 2026-10-29
completed:
parent: "065-4"
queue: "03"
---

# Goal

Get project changes and the Overview card stop being a dead end when the
remote's versions overlap local saved work: they offer to resolve the overlap
in GitOdile through [065-4-2](065-4-2-pause-on-overlaps.md).

# Scope

- The overlap banner in the Get dialog gains Resolve in GitOdile; the Overview
  card's overlap state leads to it.
- Unsaved or prepared overlaps keep their guidance (save or discard first).
- A paused merge opens the overlapping-changes screen; nothing is published.

# Acceptance criteria

- [ ] Card and dialog states tested; the hand-off is tested in the app shell.
- [ ] `pnpm run check` passes.

# Dependencies

[065-4-2](065-4-2-pause-on-overlaps.md).

# Implementation notes

# Validation
