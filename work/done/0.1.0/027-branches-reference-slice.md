---
id: 027
title: Migrate Branches as the reference vertical slice
status: done
priority: high
type: chore
areas:
  - frontend
  - rust
  - branches
  - performance
  - safety
created: 2026-08-01
completed: 2026-08-09
parent: "022"
---

# Goal

Prove the architecture from Tauri adapter through Rust service and frontend
controller by migrating Branches without changing discovery, create,
switch or delete behavior.

# User outcome

Branches behave exactly as before while providing a complete example for
new read and mutation features.

# Scope

- Create a Version-branches frontend feature with UI, controller/store, domain
  types, typed port and Tauri adapter.
- Register its `ScreenModule` through task 026's single path.
- Implement the standard bounded project-snapshot lifecycle: session epoch,
  one in-flight request per query, dedupe, monotonic generation/cancellation,
  stale rejection, cache/no-loading-flash, stable equality, last-snapshot error,
  explicit invalidation and bounded eviction.
- Keep feature-specific equality, tokens and invalidation decisions in the
  feature rather than a catch-all cache.
- Migrate the Rust Version-branches DTOs, parser, planner, service, domain errors
  and tests behind task 024's runner/access boundaries.
- Preserve command names/payloads through task 025's compatibility contracts.
- Keep create/switch/delete previews, common-Git-dir exclusion, dirty-tree
  checks, state tokens and unique-work safety intact.
- Preserve the closed Version-branches interaction contract: search, filters,
  `Local-only first` semantics, viewport-bounded filter content, shared popup
  focus/dismissal behavior, Arrow/Home/End/Escape/typeahead keyboard support,
  and English/Spanish copy.
- Document the reference slice and which parts are mandatory versus
  feature-specific.

# Out of scope

- Renaming Branches or changing UI/copy.
- History or a general branch graph.
- Generalizing the cache beyond behavior proven here.

# Acceptance criteria

- [x] Branches no longer places UI, lifecycle or IPC orchestration in
      `main.tsx`.
- [x] Its Rust parser/planners/workflows no longer live in `lib.rs`.
- [x] Concurrent dedupe, mutation supersession, cached unchanged/changed/error,
      project switch and close/reopen epoch tests pass.
- [x] Watcher worktree/shared-ref invalidation follows task 025's taxonomy.
- [x] Navigation never invokes a Version-branches command by itself.
- [x] Create/switch/delete safety and temporary-repository tests remain
      behaviorally equivalent.
- [x] Related worktrees cannot execute conflicting mutations through direct
      IPC calls.
- [x] Hidden screen behavior, memory, chunks, switch timings and Git process
      counts satisfy task 023's budgets.
- [x] Popup, filtering, sorting, keyboard and focus tests remain behaviorally
      equivalent after UI/controller ownership moves.
- [x] A short implementation guide explains how History should use the proven
      contracts without copying feature-specific policy.

# Relevant files

- `src/branches.ts`
- `src/branchesPanel.tsx`
- `src/branchesDialog.tsx`
- `src/popupMenu.tsx`
- `src/branchesPanel.test.tsx`
- `work/done/0.1.0/036-three-screen-closure-audit.md`
- `src/projectSessions.ts`
- `src/main.tsx`
- `src-tauri/src/lib.rs`
- tasks 024–026 outputs

# Dependencies

Tasks 024, 025 and 026.

# Decisions

- Branches is the full read+mutation pilot because it exercises every
  important boundary.
- Only proven lifecycle mechanics become reusable policy.

# Implementation notes

- The frontend slice now lives under `src/features/branches/`: `domain.ts`
  owns feature types, `port.ts` is the seven-operation typed boundary,
  `tauriAdapter.ts` is the sole renderer owner of Version-branches command names,
  and `controller.ts`/`store.ts`/`hooks.ts` own the snapshot lifecycle. The
  screen and dialogs remain lazy through the feature `ScreenModule`; `main.tsx`
  only composes the controller, screen and cross-feature callbacks.
- Controller queries are keyed by canonical project id plus Rust-issued
  session epoch. They deduplicate one in-flight read, reject superseded
  generations, retain equal snapshots and the last good snapshot on errors,
  freeze hidden-screen subscriptions, evict on close/reopen and cap inactive
  cache entries at eight. A mutation result commits its fresh snapshot before
  shared repository facts refresh.
- Worktree-only invalidations do not reread Branches. Head/ref and shared
  repository invalidations schedule an idle refresh for the matching epoch;
  shared events continue to fan out through task 025's session registry.
- Rust DTOs, parser, plans, workflows, error classification and their 31 tests
  moved intact to `src-tauri/src/branches.rs`. Tauri command adapters stay
  in `ipc.rs`; task 024's application authorization and common-Git-dir
  coordinator remain the authoritative serialization boundary. A syntax-based
  architecture test prevents Version-branches code from returning to `lib.rs` or
  depending on IPC, watcher, session or Tauri modules.
- The task-025 contract retains all command names and exact payload casing,
  including `switch` and `sessionEpoch`. The compatibility inventory now has
  no legacy Version-branches renderer consumer.
- [The reference-slice guide](../../../docs/architecture/branches-reference-slice.md)
  separates mandatory runtime/port/adapter/Rust-boundary mechanics from
  Version-branches-specific equality, invalidation, tokens and mutation policy,
  and gives History a short adoption path without adding work to a composition
  root.
- The keep-alive slot key now uses the session epoch rather than the active
  path, so close/reopen cannot retain an old screen incarnation. This is part
  of the required epoch lifecycle, not a user-visible behavior change.

## Measurements

- Production build: entry JavaScript 368.62 kB raw / 107.46 kB gzip, below
  the 378/110 kB warning budget; Changes stayed 59.38 kB and `fileIcons`
  stayed deferred at 255.22 kB. Version-branches screen plus dialog chunks total
  31.23 kB raw, below the 36 kB warning budget.
- Windows 11/WebView2 development profile, standard five-branch fixture, one
  warm-up then 20 cycles each way: Overview to Branches p50 31.6 ms,
  p95 32.4 ms, max 33.2 ms; Branches to Overview p50 31.0 ms, p95
  32.6 ms, max 32.7 ms. Both directions are below the 40 ms warning and
  50 ms failure budgets. Visible descendant counts were 158/220, below 1,200.
- A task-scoped `GIT_TRACE2_EVENT` capture around a separate 20-cycle warm
  navigation sample recorded zero Git process starts. The raw trace was
  deleted after aggregating the count.
- Task 023 permits tasks 024-030 to report memory as informational when screen
  retention does not change. This migration preserves the one-slot-per-visited
  screen keep-alive model, suspends the hidden subscription and bounds its new
  snapshot cache to eight inactive entries; release memory remains for task
  031's required cross-platform final measurement.

# Validation

- `pnpm run check:frontend` passed: dependency architecture guard, strict
  typecheck, 22 test files / 219 tests and production build.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
  passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features`
  passed: 195 library tests and 0 binary tests. The focused Version-branches set
  contains 31 passing temporary-repository/parser/planner/workflow tests; the
  repository-access suite also passes its related-worktree serialization test.
- Automated UI coverage passes for no-read-on-arrival, hidden freeze and
  reactivation, popup dismissal/focus, keyboard navigation/typeahead,
  viewport-bounded filters, sorting and English/Spanish behavior.
- Native smoke testing at 1280x720 showed one visible screen slot, no
  horizontal overflow and no console warnings/errors.
