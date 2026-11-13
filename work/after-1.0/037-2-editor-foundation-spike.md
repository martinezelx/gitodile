---
id: 037-2
title: Select the conflict editor foundation with measurements
status: planned
priority: high
type: spike
areas:
  - conflicts
  - frontend
  - performance
  - accessibility
created: 2026-08-18
completed:
parent: "206"
---

# Moved after 1.0.0 (2026-10-27)

`1.0.0` resolves conflicts at GitHub Desktop level (epic
[037](../done/0.5.0/037-guided-conflict-resolution.md)). This task now belongs to
epic [206](206-three-way-conflict-editor.md), the three-way editor after
`1.0.0`. It keeps its permanent ID. It consumes epic 037's session, snapshot
and stale-state contracts instead of defining them; re-read it against what
037 delivered before scheduling it.

# Goal

Choose the smallest editor/alignment architecture that can meet epic 037's
typing, accessibility, CSP, lazy-loading, and large-conflict requirements.

# User outcome

The eventual resolver remains responsive and understandable instead of
shipping an attractive but unusable three-pane prototype.

# Context

Epic 037 requires measured evidence before adding a code-editor dependency.

# Scope

- Prototype at least one dependency-backed and one minimal/custom approach.
- Measure first load, chunk size, memory, typing, scroll/alignment, large lines,
  worker/CSP behavior, IME, undo/redo, and screen-reader linear fallback.
- Decide where three-way alignment runs and how it is cancelled/superseded.
- Record the decision and budgets in an ADR; remove rejected prototype code.

# Out of scope

- Product UI, Rust mutation commands, saving/staging, completion, or abort.

# Acceptance criteria

- [ ] The ADR compares viable alternatives with reproducible measurements.
- [ ] The selected path meets or explicitly sets approved budgets for normal and
      stress fixtures, both themes, reduced motion, zoom, IME, and accessibility.
- [ ] Lazy loading does not affect first paint or unrelated screens.
- [ ] License, maintenance, CSP/worker, bundle, and cross-platform risks are
      documented and the repository contains no abandoned prototype path.

# Relevant files

- [Epic 206](206-three-way-conflict-editor.md)
- [Epic 037](../done/0.5.0/037-guided-conflict-resolution.md)
- [Performance baseline](../../docs/architecture/023-performance-baseline.md)
- `src/features/changes/`

# Dependencies

Task 037-1 supplies representative typed data and fixtures. The spike may begin
with static fixtures but cannot finalize a contract that contradicts 037-1.

# Decisions

No editor dependency is accepted without this measured ADR.

# Implementation notes

Record prototypes, versions, licenses, measurements, and selected architecture.

# Validation

Record build/profile/accessibility commands, hardware, and retained artifacts.
