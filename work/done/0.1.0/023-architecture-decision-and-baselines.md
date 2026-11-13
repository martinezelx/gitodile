---
id: 023
title: Decide module boundaries and record reproducible architecture baselines
status: done
priority: high
type: chore
areas:
  - architecture
  - performance
  - security
created: 2026-08-01
completed: 2026-08-08
parent: "022"
---

# Goal

Produce the evidence and ADR needed to execute epic 022 without guessing about
module ownership, dependencies, migration order, performance, or external-code
licensing.

# User outcome

The refactor starts from measurable behavior and an agreed design, reducing the
risk of a long rewrite whose regressions are discovered only at the end.

# Scope

- Map frontend and Rust imports, responsibilities, production/test cycles,
  Tauri commands, IPC call sites, watcher events, Git process counts, and shared
  concepts.
- Define the final dependency matrix and public entry point of each module.
- Compare vertical feature slices, technical layers, state subscription
  options, and strangler versus big-bang migration.
- Evaluate every proposed new dependency by benefit, bundle/runtime cost,
  maintenance cost, and the alternative without it.
- Record the GitButler revision studied, its FSL-1.1-MIT restriction, the small
  subsystems inspected, and principles that may be independently reimplemented.
- Record current file/test/command/chunk baselines and a reproducible desktop
  measurement protocol.
- Use `bce8db0` as the architecture-refactor starting point. Its known sanity
  snapshot is 206 frontend tests, 180 Rust tests and 30 registered Tauri
  commands; remeasure rather than copying these numbers into final evidence.
- Record the current lazy-boundary shape, including the separately deferred
  `fileIcons` chunk used by Overview and Changes, so feature extraction cannot
  pull the icon set back into the entry chunk unnoticed.
- Record the current screen-owned `read_working_tree_diffs` warm-up separately:
  trigger point, elapsed time, Git process count, output size and behavior on a
  first Changes visit versus a warmed revisit.
- Select numeric warning/failure budgets for startup ordering, entry and screen
  chunks, warmed switch p50/p95, memory after visiting all screens, DOM bounds,
  and Git process counts.
- Define how dependency rules will be checked in CI, including type-only,
  dynamic, and test-only edges.
- Add the ADR under `docs/adr/` and update `docs/ARCHITECTURE.md` only with
  decisions settled here.

# Out of scope

- Moving production modules.
- Adding a state library or dependency guard before its ADR decision.
- Treating GitButler's current folder/crate structure as GitOdile's target.

# Acceptance criteria

- [x] ADR records module structure, dependency rules, state approach,
      migration sequence, rejected alternatives, and dependency policy.
- [x] Dependency map distinguishes production, tests, dynamic imports and
      transport boundaries and identifies every existing cycle.
- [x] Baseline records exact test counts, 30-command inventory, chunk sizes,
      startup sequence, process counts, screen timings and memory protocol.
- [x] Baseline records the entry/Changes/`fileIcons` chunk relationship and
      detects a feature migration that makes the icon set eager.
- [x] The Changes baseline identifies `read_working_tree_diffs` as speculative
      screen-mount work and captures its first-visit/warmed timing and process
      cost before ownership moves.
- [x] Numeric budgets and measurement environment are recorded.
- [x] GitButler research is tied to an exact revision and includes a clear
      no-copy/FSL constraint.
- [x] Proposed child-task boundaries are confirmed or updated in epic 022.

# Relevant files

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/PRODUCT_STRATEGY.md`
- `work/active/architecture/022-modular-feature-architecture.md`
- `src/main.tsx`
- `src/screens.tsx`
- `src-tauri/src/lib.rs`

# Dependencies

Tasks 018–021.

# Decisions

- Architecture enforcement and budgets are designed before production moves.
- External reference use must be traceable by repository revision and license.

# Implementation notes

- Accepted [ADR 0003](../../../docs/adr/0003-adopt-a-modular-feature-architecture.md):
  vertical frontend features, durable Rust application domains, thin
  transport/composition roots, a project-scoped reducer runtime with session
  epochs, and an incremental strangler migration.
- Recorded the pre-migration
  [dependency/responsibility map](../../../docs/architecture/023-dependency-map.md)
  and [performance baseline](../../../docs/architecture/023-performance-baseline.md).
- Selected a pinned `dependency-cruiser` development dependency for frontend
  rules and a repository-owned `syn`-based Rust architecture test, both to be
  introduced with enforceable boundaries in task 026 rather than task 023.
  No runtime dependency was added.
- Inspected GitButler revision
  `b98b6dc84a6d8a33332eb41543f20d97cab676a9`; the exact files, independent
  principles and FSL-1.1-MIT no-copy constraint are in the
  [research record](../../../docs/architecture/023-gitbutler-research.md).
- Confirmed the 023-031 child order in epic 022. No production module moved and
  task 024 was not started.

# Validation

Completed on Windows 11 Home 10.0.26200 with the detailed environment and
fixture recorded in the baseline:

- `pnpm run typecheck`: passed.
- `pnpm run test`: passed, 16 files and 206 tests.
- `pnpm run build`: passed, 1,881 modules; entry 360.36 kB raw / 104.60 kB
  gzip, Changes 59.86 kB and deferred `fileIcons` 255.22 kB.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features`: passed, 180 library tests and 0 binary tests.
- `pnpm run tauri build --no-bundle`: passed during baseline capture; its
  production chunks are recorded separately from the comparison build.
- Desktop probe: 60 warmed screen transitions, p50 32.4 ms and p95 35.5 ms;
  maximum visible descendants 340 on the standard fixture.
- Changes probe: nine native batch samples, median 196.204 ms and p95
  234.607 ms; 15 diffs / 7,731 serialized bytes / 2 Git processes. First
  selected-file visit used 5 Git processes; warmed revisit used 0.
- Instrumented debug memory was 487.4 MiB working set / 299.9 MiB private.
  It is explicitly not reported as a packaged-release baseline; task 031 owns
  the documented five-sample cross-platform release protocol.
