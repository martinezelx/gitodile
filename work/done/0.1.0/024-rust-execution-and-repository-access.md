---
id: 024
title: Establish safe Rust execution and repository access boundaries
status: done
priority: high
type: chore
areas:
  - rust
  - git
  - security
  - performance
created: 2026-08-01
completed: 2026-08-08
parent: "022"
---

# Goal

Create the Rust foundation that every domain service uses for repository
identity, concurrency, process execution, errors and diagnostics, while keeping
all public Tauri behavior compatible.

# User outcome

Concurrent or cancelled UI work cannot accidentally overlap incompatible Git
operations, hang indefinitely, consume unbounded output, or expose secrets.

# Scope

- Extract an application/domain API independent of Tauri; leave commands as
  thin validation and delegation adapters.
- Introduce a validated repository context retaining worktree root, Git dir,
  common Git dir, bare state and platform/path facts. Do not rediscover a
  repository inside domain helpers.
- Define path normalization per platform instead of assuming one canonical
  spelling is accepted by every backend. Preserve macOS `/var` versus
  `/private/var` aliases and Windows normal versus `\\?\` path behavior when
  matching repository identities and filesystem events.
- Add a Rust repository-access coordinator keyed by canonical `commonGitDir`:
  shared/read access where safe and exclusive access for mutations.
- Acquire guards at the command/application boundary and pass narrow read/write
  permission evidence downward; detect accidental lock re-entry in tests/debug.
- Preserve state-token validation for external changes and multi-step plans.
- Consolidate Git execution behind argument vectors, explicit working
  directory and deterministic locale without shell interpolation.
- Give each command an execution policy covering operation classification,
  stdout/stderr caps, timeout, cancellation, prompt policy, concurrency and
  diagnostic redaction.
- Distinguish logical stale-response rejection from actual process
  cancellation. Ensure timeout/cancel cleanup handles child processes as safely
  as each supported OS permits and document limitations.
- Preserve hook and signing behavior; do not silently bypass either.
- Keep the public error envelope stable while allowing domain-owned errors to
  convert through one transport error taxonomy.
- Move focused runner/access/error tests with the new owners without weakening
  temporary-repository coverage.

# Out of scope

- Changing command names or serialized payloads.
- Inter-process locking against unrelated Git clients unless separately
  justified; GitOdile's own in-process safety is required here.
- Migrating every domain out of `lib.rs`; later tasks consume this foundation.
- Moving away from system Git.

# Acceptance criteria

- [x] Tauri adapters do not contain Git workflows or acquire nested locks.
- [x] Two worktrees sharing a common Git directory cannot run conflicting
      GitOdile mutations concurrently even if the frontend calls them directly.
- [x] Unrelated repositories are not serialized behind one global lock.
- [x] Read/write coordination, fairness assumptions, cancellation and
      re-entry behavior have focused tests.
- [x] Every registered process-launching command appears in a checked execution
      inventory with caps, timeout, cancellation and prompt policy.
- [x] Superseded/cancelled commands cannot accumulate unbounded Git processes.
- [x] stdout/stderr and diagnostic redaction tests cover remote credentials,
      query tokens, hook output and malformed/non-UTF-8 data.
- [x] Existing plan, recovery, index restoration, hook and signing tests pass.
- [x] No shell string is constructed from user or repository data.
- [x] Windows process behavior passes; macOS/Linux cleanup limitations are
      tested where available or explicitly documented for task 031.
- [x] Repository/path tests cover platform aliases without introducing a path
      representation that a watcher or command backend cannot match.

# Relevant files

- `src-tauri/src/lib.rs`
- `src-tauri/src/watch.rs`
- `docs/ARCHITECTURE.md`
- `work/active/architecture/022-modular-feature-architecture.md`
- ADR from task 023

# Dependencies

Task 023.

# Decisions

- Rust enforcement is authoritative; frontend mutation blockers remain UX.
- Start with the smallest in-process coordinator appropriate to GitOdile.
- Domain errors convert into one stable public error envelope.

# Implementation notes

- `src-tauri/src/ipc.rs` is now the only Tauri command surface. All 30 adapters
  extract framework inputs and delegate immediately; their command names,
  argument names, result shapes and `AppError` serialization are unchanged.
- `src-tauri/src/application.rs` owns the checked 30-command execution
  inventory and command-scoped authorization. Each entry records operation
  class, stdout/stderr caps, timeout, cancellation, prompt and concurrency
  policy. The inventory test fails on a missing, duplicate or incomplete
  registration.
- `src-tauri/src/repository_access.rs` owns `RepositoryContext`, `PathIdentity`
  and the fair in-process coordinator. The lock key is the canonical
  `commonGitDir`; queued writers block later readers, related worktrees share
  exclusion and unrelated repositories use different locks. Intentional
  nested reads inherit evidence; raw re-entry and read-to-write upgrades fail.
- Opening a project registers its resolved worktree root, Git dir and common
  Git dir so normal reads/mutations do not add discovery processes. A fallback
  discovery path remains for tests and legacy internal callers that have not
  opened the project through IPC. Windows normal/verbatim spellings share a
  comparison key while backend paths stay non-verbatim; macOS selected aliases
  are retained alongside canonical spellings for event matching.
- `src-tauri/src/git.rs` is the only production constructor of the Git
  executable. It receives argument vectors and an explicit working directory,
  applies deterministic locale and `GIT_OPTIONAL_LOCKS=0`, drains stdout and
  stderr concurrently, retains only policy caps, polls timeout/cancellation
  and reaps the tracked process. Temporary-index, commit, global-config,
  diagnostics, capped-diff and network paths all use it. No dependency was
  added.
- A newer equivalent read cancels the prior command token and the runner kills
  and reaps its Git child. Logical frontend generation/state-token rejection
  remains separate. Mutations are deliberately not auto-cancelled because an
  interrupted commit/publish can leave an uncertain result.
- Windows cancellation/timeout requests descendant cleanup through a direct
  argument-vector `taskkill /T /F` call, then kills/reaps the tracked child.
  macOS/Linux currently kill/reap the tracked child only; descendants from
  hooks, credentials or signing remain best effort and must be exercised in
  task 031. This limitation is recorded durably in `docs/ARCHITECTURE.md`.
- `src-tauri/src/error.rs` owns the unchanged public error taxonomy. Safe
  details are bounded and redact URL userinfo, queries and fragments after
  lossy decoding, including malformed/non-UTF-8 bytes. Hook/signing failures
  remain secondary detail with the same primary codes and remediation.
- Existing state-token revalidation, temporary-index restoration, hooks,
  signing and Git prompt behavior are preserved. Watch establishment now uses
  the retained repository context instead of launching two redundant
  `rev-parse` processes.

# Validation

- `pnpm run typecheck` — pass.
- `pnpm run test` — pass, 16 files and 206 tests.
- `pnpm run build` — pass, 1,881 modules. Frontend output is exactly the task
  023 baseline: entry 360.36 kB raw / 104.60 kB gzip, Changes 59.86 kB,
  Branches panel+dialog 30.75 kB and deferred `fileIcons` 255.22 kB; no
  warning/failure budget moved and no static entry path to `fileIcons` changed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — pass, no warnings.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features
  -- --test-threads=1` — pass, 194 library tests and 0 binary tests. The 14 new
  tests cover the policy inventory, read supersession, bounded output,
  redaction/malformed bytes, timeout/cancel reaping, related/unrelated
  repository coordination, writer fairness, waiter cancellation, lock
  re-entry and Windows path aliases. Existing plan, recovery, index, hook,
  signing and temporary-repository integration tests all passed.
- Windows 11 execution was covered by the complete suite. No macOS/Linux host
  was available in this session; their descendant-process limitation and
  platform verification obligation are explicitly recorded for task 031, as
  allowed by this task's acceptance criterion.
