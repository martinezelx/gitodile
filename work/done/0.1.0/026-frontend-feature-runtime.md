---
id: 026
title: Build the frontend feature runtime and screen-module contract
status: done
priority: high
type: chore
areas:
  - frontend
  - architecture
  - accessibility
  - performance
created: 2026-08-01
completed: 2026-08-09
parent: "022"
---

# Goal

Create the frontend composition, state subscription and screen lifecycle
contracts that future features can consume without adding orchestration to
`main.tsx`.

# User outcome

Navigation stays instant and accessible as new screens are added, without
hidden work or repository reads caused by visiting a screen.

# Scope

- Reduce `main.tsx` toward providers, shell composition, project/session
  selection and top-level dialogs; do not migrate feature workflows yet.
- Place a dependency-neutral `ScreenModule` contract outside feature modules
  and let the app registry collect feature-owned descriptors.
- A functional descriptor owns stable id, translated labels, icon/section,
  project requirement, container, lifecycle/eviction policy, accessibility
  metadata and optional performance budget.
- Use one source of truth for the lazy component loader and its primary preload;
  declare only genuinely additional chunks separately.
- Make registration automatically cover expanded/compact navigation, command
  palette, idle preload, project guard, keep-alive, accessibility hiding and
  profiling.
- Define explicit `active`, `hidden` and `evicted` lifecycle semantics. Hidden
  screens retain local UI state but suspend polling, costly effects and direct
  store subscriptions; activation synchronizes with the current snapshot
  without treating visibility as invalidation.
- Select and implement the ADR-approved selector-capable state approach with
  atomic snapshots and React StrictMode behavior. Avoid ambient access to a
  different project session.
- Add CI dependency-direction checks that understand type-only, dynamic and
  test edges and fail on new production cycles.
- Add a new-screen implementation guide and minimal test module.

# Out of scope

- Moving Branches or other feature data lifecycles; task 027 is the pilot.
- Fetching merely because a screen became active.
- Introducing a general frontend framework inside GitOdile.
- Splitting CSS or translations; task 030 owns that work.

# Acceptance criteria

- [x] `main.tsx` contains shell composition but no new feature-specific request
      lifecycle.
- [x] Duplicate or incomplete functional screen descriptors fail tests/compile.
- [x] Lazy load and primary preload cannot refer to different modules.
- [x] Minimal screen test proves first-visit lazy mount, idle preload, warmed
      identity, `hidden`/`inert`, project eviction and no arrival IPC call.
- [x] The runtime exposes an activation/invalidation-owned, idle-deferred path
      for speculative cache warming; visibility alone never starts
      `read_working_tree_diffs` or another repository read.
- [x] Internal timer/store updates prove a hidden screen does not poll,
      announce or rerender; it synchronizes correctly on activation.
- [x] Selector tests prove unrelated project/feature state does not rerender an
      active or inactive screen and does not tear under concurrent rendering.
- [x] Import-direction guard finds a seeded forbidden edge and reports a clear
      owning-module error.
- [x] First-paint ordering and current chunk split remain within task 023's
      budgets.

# Relevant files

- `src/main.tsx`
- `src/screens.tsx`
- `src/projectSessions.ts`
- `src/main.test.tsx`
- `docs/ARCHITECTURE.md`
- ADR from task 023

# Dependencies

Tasks 023 and 025.

# Decisions

- `hidden`/`inert` is accessibility state, not effect suspension.
- Lazy loading and primary preloading share one loader declaration.
- Feature descriptors depend on a neutral contract; features do not import the
  app composition root.

# Implementation notes

- Added an explicit project-session reducer runtime with atomic snapshots,
  selector subscriptions and no ambient project access. `useProjectSelector`
  preserves selected identity, and the lifecycle-aware selector disconnects
  while hidden before synchronizing from the current snapshot on activation.
- Added the dependency-neutral `ScreenModule` contract and feature-owned
  descriptors for Overview, Changes and Branches. The registry now
  derives navigation, palette metadata, project guards, idle preloads,
  keep-alive slots, accessibility state and profiling from those descriptors.
  The lazy component and primary preload share the same cached loader promise.
- Defined `active`, `hidden` and `evicted` lifecycle behavior. Hidden slots keep
  their DOM and local state but stop lifecycle effects and runtime
  subscriptions; project-host eviction removes the slot and resets local
  state. The minimal test screen covers timers, announcements, selection,
  preloading and remount identity.
- Moved speculative whole-tree diff warming out of screen arrival and into the
  project activation/invalidation path. Warming is idle-deferred, deduplicated
  and cancellable; visiting Changes only consumes a cached snapshot and reads
  selected-file detail when explicitly needed.
- Added a dependency-cruiser-backed architecture check for production-to-test,
  feature-to-app, cross-feature internals, production cycles and the forbidden
  static entry-to-file-icons path. Its seeded fixture proves the diagnostic
  identifies the owning feature. The new-screen workflow is documented in
  `docs/architecture/frontend-feature-guide.md`.
- Kept task 027 out of scope: Branches has only gained its descriptor; its
  data lifecycle remains on the existing compatibility implementation.
- Production build comparison against task 023: entry `366.33 kB` raw /
  `106.73 kB` gzip (baseline `362.39/105.24`, below `378/110` warning and
  `397/116` failure); Changes `59.38 kB` raw (below `69`); Branches plus
  its dialog `30.74 kB` raw (below `36`); file icons `255.22 kB` raw (below
  `268`) and absent from the static entry graph. Bootstrap renders before the
  existing two-animation-frame native-window reveal; speculative work remains
  post-restoration and idle-deferred.

# Validation

- `pnpm run check:frontend` passed: architecture fixture/graph check,
  TypeScript, 20 Vitest files / 215 tests, and the production build.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- --test-threads=1` passed: 194 library tests and 0 binary tests.
- `git diff --check` passed.
- Local in-app browser smoke check passed at `http://127.0.0.1:1420`: the
  Spanish no-project shell rendered with the expected navigation guards,
  headings and accessible actions, with no visible layout regression.
