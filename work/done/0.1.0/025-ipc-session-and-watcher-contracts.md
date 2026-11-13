---
id: 025
title: Contract-test IPC, session identity and watcher invalidation
status: done
priority: high
type: chore
areas:
  - rust
  - frontend
  - repository
  - performance
  - security
created: 2026-08-01
completed: 2026-08-09
parent: "022"
---

# Goal

Make frontend/backend compatibility and repository freshness explicit through
tested contracts, session incarnations and typed domain invalidation events.

# User outcome

Closing, reopening or switching projects cannot let an old response or watcher
event corrupt the newly active project, including linked worktrees.

# Scope

- Snapshot the Tauri command inventory, argument names, serialized responses
  and structured error codes. Use schema generation only if task 023 justifies
  its dependency; otherwise use Rust serialization fixtures plus TypeScript
  contract tests.
- Introduce an opaque session epoch/incarnation distinct from canonical project
  path. Bind requests, responses, caches, operations and events to it while
  preserving compatibility wrappers for current IPC payloads during migration.
- Define the epoch rollout explicitly: Rust creates or validates the epoch;
  additive/optional compatibility fields may bridge unmigrated consumers, but
  the compatibility path must be inventoried and removed or restricted to
  safe reads once its consumer migrates. By task 029, no mutation may bypass
  epoch validation through a legacy payload.
- Define a typed watcher event envelope containing project identity, session
  epoch, monotonic sequence and domain event kind.
- Replace the ambiguous boolean invalidation with the smallest useful event
  taxonomy, such as worktree, HEAD/ref, shared repository and explicit refresh.
- Keep raw changed paths and repository content in Rust unless a feature has a
  concrete need and bounded safe contract.
- Fan shared ref/remote invalidations out to all open worktrees whose
  `commonGitDir` matches; keep worktree-only changes isolated.
- Coalesce watcher bursts without starvation, preserve event ordering within a
  session, and reject events after unwatch/close/reopen.
- Test listener teardown, watcher replacement, late callbacks and unavailable
  platform watchers.
- Preserve platform-specific watcher path matching: macOS FSEvents may report
  `/private/var/...` for a `/var/...` watch, while Windows canonicalization may
  add a `\\?\` prefix that its watcher does not report. Git-internal churn must
  remain filtered under both representations.

# Out of scope

- Fetching repository data inside the watcher solely because a screen is open.
- Exposing a generic filesystem event stream to the renderer.
- Breaking existing command names or payloads before compatibility consumers
  migrate.

# Acceptance criteria

- [x] CI fails on accidental command, argument, response or error-code drift.
- [x] A session epoch, not canonical path alone, gates every migrated response
      and event.
- [x] Close/reopen of the same path rejects the previous session's response and
      queued watcher event.
- [x] Worktree changes remain isolated; shared Git/ref changes invalidate all
      related open worktrees exactly once per coalesced burst.
- [x] Watcher payloads are typed, bounded and contain no raw source content.
- [x] Sequence/coalescing tests cover long bursts without UI starvation.
- [x] Current manual refresh behavior remains available when watching fails.
- [x] Compatibility wrappers have named consumers and a removal task; direct
      IPC mutation cannot use a missing/stale epoch after task 029.
- [x] macOS and Windows watcher tests prove path aliases do not turn
      `.git/objects`, lock files or other Git churn into repository refreshes.

# Relevant files

- `src-tauri/src/watch.rs`
- `src-tauri/src/lib.rs`
- `src/main.tsx`
- `src/projectSessions.ts`
- ADR from task 023

# Dependencies

Task 024.

# Decisions

- Canonical path is project identity; session epoch is open-incarnation
  identity. Both are required.
- Events communicate domain invalidation, not arbitrary filesystem details.
- Use a checked JSON inventory plus Rust/TypeScript contract tests; task 023
  did not justify a schema-generation runtime or build dependency.
- Use three non-overlapping renderer actions (`worktree`, `head_or_refs`,
  `shared_repository`). An explicit refresh remains a direct user action, not
  a synthetic filesystem event.
- Watch every open session after startup restore. This is required for shared
  `commonGitDir` fan-out; it still performs no repository read until a typed
  invalidation arrives.
- Keep missing epoch arguments as a named, temporary compatibility bridge,
  while rejecting every supplied stale epoch immediately.

# Implementation notes

- Added the checked, versioned
  [`025-ipc-contract.json`](../../../docs/architecture/025-ipc-contract.json).
  It inventories all 31 commands, serialized argument names, response types,
  the complete structured error-code set, the watcher envelope and the named
  compatibility consumers. Rust tests compare it to the execution inventory
  and adapter signatures and snapshot representative repository/error/event
  serialization; TypeScript consumes the same artifact. No schema-generation
  dependency was justified or added.
- Rust now owns an opaque session registry. `open_repository` creates an epoch
  or validates the current one, every path-scoped IPC adapter accepts the
  additive `sessionEpoch`, and `close_project_session` invalidates the epoch
  and watcher before frontend teardown. `stale_session` is a stable structured
  error. The frontend reducer, status/branch responses, operations,
  watcher sequence state and diff stores are incarnation-scoped, so reopening
  one canonical path cannot accept the previous incarnation's work.
- Missing epochs remain temporarily accepted only as a strangler bridge. The
  checked contract names `pendingVersions.tsx`, `publishDialog.tsx`,
  `saveVersionDialog.tsx` and `branchesDialog.tsx`; tasks 026-028 remove
  the remaining read consumers and task 029 removes the mutation allowance.
  Stale supplied epochs are rejected now. Initial `open_repository` calls are
  intentionally epoch-free because they create the incarnation.
- Replaced `{path, repositoryStateChanged}` with the bounded
  `{projectId, sessionEpoch, sequence, kind}` event. Kinds are `worktree`,
  `head_or_refs` and `shared_repository`; raw paths and content stay in Rust.
  Each registration has a replacement generation and monotonic sequence.
  Dispatch rechecks the generation after debounce, and epoch-aware unwatch
  prevents an old cleanup from removing a replacement watcher.
- Watcher bursts use 300 ms trailing debounce with a two-second ceiling.
  Worktree/index/private-HEAD changes stay isolated; common refs, packed refs
  and config changes coalesce by canonical `commonGitDir` and fan out once to
  every related open worktree. All open sessions are watched after startup
  restore so related inactive worktrees can receive shared invalidations.
- Watcher comparison normalizes Windows normal/verbatim spellings and macOS
  `/var`/`/private/var` aliases without replacing backend paths. Objects,
  logs, hooks, modules and Git lock files remain filtered. Failed watch setup
  returns `false`; existing explicit refresh actions are unchanged.
- Watcher destruction happens outside the registry mutex, so a backend that
  waits for an in-flight callback cannot deadlock with late-callback rejection.
- Durable contract, compatibility, sequencing, taxonomy, fan-out and platform
  rules are recorded in `docs/ARCHITECTURE.md`.

# Validation

- `pnpm run typecheck` — pass.
- `pnpm run test` — pass, 18 files and 209 tests. New coverage includes the
  shared IPC snapshot, close/reopen reducer rejection and typed watcher epoch/
  sequence rejection.
- `pnpm run build` — pass, 1,882 modules. Entry 362.39 kB raw / 105.24 kB
  gzip, Changes 60.02 kB, Branches panel+dialog 30.75 kB and deferred
  `fileIcons` 255.22 kB. Every value remains below task-023 warning budgets;
  the icon set remains deferred.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — pass, no warnings.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features
  -- --test-threads=1` — pass, 194 library tests and 0 binary tests. New tests
  cover IPC/response/error/event serialization, epoch close/reopen, watcher
  taxonomy and aliases, replacement/unwatch/late callbacks, unavailable
  watchers, shared-worktree fan-out, monotonic sequences and the long-burst
  starvation ceiling.
- Local checks ran on Windows 11. GitHub Actions supplies the required Linux,
  macOS and Windows CI matrix before this task is considered published.
