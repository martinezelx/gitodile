---
id: 051
title: Enforce feature-owned Tauri adapters
status: done
priority: normal
type: chore
areas:
  - frontend
  - architecture
created: 2026-08-12
completed: 2026-08-12
parent: "038"
---

# Goal

Move Overview's saved-version detail IPC behind its own typed adapter and make
the frontend architecture guard reject future feature code that imports Tauri
outside an adapter.

# User outcome

No visible change. Repository reads remain testable and future feature work
cannot quietly bypass the port/adapter boundary the architecture promises.

# Context

`src/features/overview/pendingVersionDetails.ts` currently owns three concerns:

- the `PendingVersionDetailsPort` contract;
- the React request/state hook;
- the production implementation, including two direct `invoke` calls.

The interface makes the hook substitutable, but the production boundary still
contradicts `AGENTS.md` and `docs/architecture/frontend-feature-guide.md`:
features reach Rust through a typed port and `tauriAdapter.ts`, and visual/domain
modules do not import Tauri directly.

The working architecture guard did not report this because it protects feature
ownership, cycles, test-only imports and the deferred icon path, but has no rule
for renderer transport imports. A move without a guard would repair the current
file while leaving the same silent regression available to the next feature.

# Scope

- Separate Overview's saved-version detail port from its React lifecycle and
  put the two `invoke` implementations in
  `src/features/overview/tauriAdapter.ts` (or another single adapter file if the
  feature already needs one public adapter composition).
- Keep `CommitFileChange`, `FilesState`, `DiffState` and the read argument/result
  types with the module that owns their meaning; do not duplicate wire shapes.
- Inject the typed production adapter into `usePendingVersionDetails` without
  changing its session-epoch behavior, loading/error states or public UI.
- Export only the capability needed by cross-feature/app consumers through
  `src/features/overview/index.ts`; keep adapter internals private where no
  external consumer exists.
- Extend `scripts/check-frontend-architecture.mjs` so a production module under
  `src/features/<owner>/` may import `@tauri-apps/api` only from that feature's
  designated `tauriAdapter` module. Tests may mock Tauri without being treated
  as production.
- Add both a seeded architecture fixture and a `src`-shaped unit test proving
  the new rule fails with an owning-module diagnostic.
- Sweep every production feature import of `@tauri-apps/api` and confirm all
  remaining imports are in typed adapters. Do not move app-owned watcher,
  window or session lifecycle wiring from `main.tsx`/`bootstrap.tsx`.
- Re-measure the entry and affected lazy chunks to prove the ownership move did
  not create a new static path to `fileIcons` or otherwise break a bundle
  budget.

# Out of scope

- Moving the app composition root's watcher/session/window calls; ADR 0003
  assigns those to the composition root.
- Changing the two IPC command names or their checked payloads.
- Redesigning pending-version expansion or moving the diff renderer; task 048
  owns that boundary.
- Broadening the guard to enforce the entire Rust dependency matrix; this task
  protects the concrete frontend transport escape it fixes.

# Acceptance criteria

- [x] `pendingVersionDetails.ts` and every other non-adapter production feature
      module contain no `invoke` call and no `@tauri-apps/api` import.
- [x] Overview's saved-version detail reads use a typed port implemented by its
      feature-owned Tauri adapter, with every request still carrying the
      project id and session epoch.
- [x] A seeded forbidden transport import makes
      `pnpm run check:architecture` fail with the feature owner and expected
      adapter boundary in the message.
- [x] A `src`-shaped unit test covers the rule, and production-to-test behavior
      remains unchanged.
- [x] The guard passes over the real module graph with no new allowance entry.
- [x] Entry and feature chunks remain within task-023 budgets and `fileIcons`
      stays off the static entry path.
- [x] Full `AGENTS.md` validation passes.

# Relevant files

- `src/features/overview/pendingVersionDetails.ts`
- `src/features/overview/index.ts`
- `src/features/overview/PendingVersionsSection.tsx`
- `scripts/check-frontend-architecture.mjs`
- `scripts/architecture-fixtures/`
- `src/architectureGuard.test.ts`
- `docs/architecture/frontend-feature-guide.md`

# Dependencies

Task 049, so the rule is implemented against dependency-cruiser's native
TypeScript graph rather than the retired TypeScript 7 workaround.

Task 043 runs after this task and records the adapter location and executable
rule in the final architecture documentation.

# Decisions

- Fix and enforce in the same task. A boundary that is repaired but not made
  executable is the failure mode tasks 047 and 049 just exposed.
- Scope the exception to app-owned composition files, not to arbitrary root
  modules. Feature transport belongs in its adapter even when it is not called
  directly from a JSX component.

# Implementation notes

Implemented and completed on 2026-08-12.

Overview now follows the same three-part boundary as the other migrated
features:

- `port.ts` owns the narrow `PendingVersionDetailsPort` contract;
- `tauriAdapter.ts` is the only Overview module importing
  `@tauri-apps/api/core` and implements the two checked IPC reads;
- `pendingVersionDetails.ts` owns only the React request state and accepts the
  typed port, defaulting to the production adapter.

The port reuses `FileDiff` from Changes and `CommitFileChange` from Publish,
the existing owners of those wire meanings. Overview's duplicate
`CommitFileChange` definition was removed. Nothing outside Overview consumes
the hook or port, so `features/overview/index.ts` no longer re-exports the
internal lifecycle module.

The frontend architecture guard now examines each dependency's original module
specifier. A production file under `features/<owner>/` importing
`@tauri-apps/api` is accepted only when the source is that owner's
`tauriAdapter.ts`. App composition remains outside the feature rule, and test
files remain free to import/mock Tauri. The rule has both a TypeScript-shaped
unit test and the `importsTauriDirectly.mjs` seeded fixture; the ordinary guard
output proves the fixture is reported with the owning feature and required
adapter path.

The production sweep found eight feature imports of `@tauri-apps/api`, all in
the eight feature-owned `tauriAdapter.ts` files. No allowance was added.

Moving the adapter edge into the already-lazy pending-versions subtree reduced
the entry chunk from 373.97 kB to 373.09 kB. The pending-versions chunk grew
from 6.00 kB to 6.87 kB, remaining far below the relevant screen budgets;
`fileIcons` remains a separate 255.25 kB deferred chunk.

# Validation

Local Windows validation on 2026-08-12:

```text
pnpm run check:architecture                 pass (207 modules; transport fixture reported)
pnpm run typecheck                          pass
pnpm run test                               pass (255 tests, 30 files)
pnpm run build                              pass (entry 373.09 kB raw)
cargo fmt --manifest-path ... -- --check    pass
cargo clippy ... --all-features -D warnings pass
cargo test ... --all-targets --all-features pass (202 tests)
```

Focused frontend validation passed 18 tests across
`architectureGuard.test.ts` and `pendingVersions.test.tsx`. The latter pins the
exact `path`, `sessionEpoch`, `commit` and `filePath` payloads.

The first full frontend run was executed concurrently with the complete Rust
suite and one pre-existing keep-alive test exceeded its five-second timeout;
254 other tests passed. The timed-out test passed alone, then the complete
frontend suite passed sequentially in 16.19 seconds. No assertion failed and no
timeout reproduced without the competing Rust workload.
