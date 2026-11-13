---
id: 028
title: Migrate repository, status, changes and diff read features
status: done
priority: high
type: chore
areas:
  - frontend
  - rust
  - repository
  - status
  - changes
  - performance
created: 2026-08-01
completed: 2026-08-09
parent: "022"
---

# Goal

Move the established read-only repository features onto the architecture
proven by Branches while retaining batching, virtualization and freshness.

# User outcome

Opening projects, reading status and reviewing diffs remain responsive and
truthful while their implementation gains clear ownership.

# Scope

- Migrate repository discovery/identity, working-tree status, pending-version
  summaries, changed-file lists and diff caches into owned frontend/Rust
  modules.
- Reuse task 027's lifecycle mechanics without forcing feature-specific tokens,
  equality or eviction into a generic abstraction.
- Preserve project/session epoch isolation and worktree versus shared-repository
  invalidation.
- Keep Git reads batched and bounded; never one process per visible row.
- Keep large diff output caps, binary/large/malformed states and virtualization.
- Preserve the complete opt-in Accessible text representation alongside the
  virtualized visual diff, including selectable/findable loaded content and
  truthful accessibility semantics.
- Preserve the shared Changes popup keyboard/focus contract and Overview's
  file-type icons. The `fileIcons` implementation must remain behind a lazy
  boundary rather than returning to the initial entry chunk.
- Preserve cached content during background refresh and stable identity for
  unchanged snapshots.
- Move the full working-tree diff warm-up out of the Changes component. Project
  activation or repository invalidation owns it, speculative execution is
  idle-deferred, and the screen only consumes the bounded cache.
- Move focused parsers/tests with their owning Rust domains and keep Tauri
  adapters thin.

# Out of scope

- Save, publish or another mutation flow.
- History implementation.
- UI redesign or copy changes.

# Acceptance criteria

- [x] Repository/status/changes/diff lifecycles no longer live in `main.tsx` or
      visual components.
- [x] Corresponding parsers/workflows no longer live in Rust `lib.rs`.
- [x] Repeated navigation performs no repository IPC calls.
- [x] First arrival at Changes does not start `read_working_tree_diffs`; the
      session runtime warms or invalidates that cache independently of screen
      visibility and retains the batching/output bounds measured in task 023.
- [x] Watcher bursts coalesce and refresh only the affected feature scopes.
- [x] Close/reopen and project-switch success/failure races are covered.
- [x] Diff caches are bounded, released on epoch eviction and never return a
      different project's content.
- [x] Long lists and diffs retain bounded DOM/process/output work.
- [x] Virtualized and Accessible text diff modes, shared popup keyboard/focus
      behavior and Overview/Changes file-type icons retain their current tests.
- [x] Overview's file icons do not make the `fileIcons` chunk eager or regress
      task 023's entry-chunk budget.
- [x] Existing parser and temporary-repository scenarios remain equivalent.
- [x] Performance and process counts stay within task 023's budgets.

# Relevant files

- `src/repositoryOverview.ts`
- `src/changes.tsx`
- `src/diffCache.ts`
- `src/pendingVersions.tsx`
- `src/fileIcons.ts`
- `src/popupMenu.tsx`
- `src/changesPanel.test.tsx`
- `work/done/0.1.0/036-three-screen-closure-audit.md`
- `src/main.tsx`
- `src-tauri/src/lib.rs`

# Dependencies

Task 027.

# Decisions

- Share lifecycle protocol, not domain equality or cache keys.
- Dense repository data remains on opaque, virtualized surfaces.

# Implementation notes

- Frontend ownership now lives under `features/repository`, `features/status`
  and `features/changes`. Their controllers own open/status generations,
  epoch-aware snapshot identity, watcher-scope refresh and diff warming. The
  Overview pending-version detail reader moved under `features/overview`.
  Root modules remain only as compatibility re-exports for task 029.
- Project activation and typed repository invalidation schedule the batched
  working-tree diff warm-up during idle time. Changes navigation consumes the
  cache and does not start `read_working_tree_diffs`; concurrent reads are
  deduplicated and invalidation during a mutation is deferred and coalesced.
- Diff retention is bounded to four project/session epochs, 256 entries and
  approximately 40 MiB per epoch. Closing an epoch releases it immediately;
  response generations prevent a closed or superseded session from populating
  a replacement epoch.
- Rust repository discovery/identity, status/pending summaries and changes/diff
  parsing/workflows moved to `repository.rs`, `status.rs` and `changes.rs`.
  `ipc.rs` remains the session-validating adapter and `lib.rs` temporarily
  re-exports mutation dependencies required by task 029.
- Existing exceptional states remain explicit: binary, oversized, truncated,
  malformed, pure-rename, conflict, symlink-escape and inaccessible-path cases.
  Native caps remain 2 MiB and 5,000 lines per file, 16 MiB per batch and 500
  lines per expansion. Status remains one Git process and a tracked batch at
  most two; screen arrival and warmed revisits add zero Git processes.
- The final Windows build produced entry JS 373.65 kB raw / 108.96 kB gzip,
  Changes 59.51 kB and `fileIcons` 255.22 kB. All are below task 023 warning
  budgets and `fileIcons` remains a separate lazy chunk.

# Validation

- `pnpm run check:frontend` passed: dependency guard, strict typecheck, 25 test
  files / 228 tests and production build.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features`
  passed: 195 tests, including focused parser caps, real temporary repositories,
  watcher bursts and close/reopen isolation.
- The existing large-diff/list tests retained virtualization, the complete
  Accessible text representation, popup keyboard/focus behavior and file icons;
  new controller tests cover cache entry/epoch/byte eviction and stale races.
- A bounded standalone browser smoke check mounted the Overview shell and empty
  state with its navigation semantics and reported no console warnings/errors.
