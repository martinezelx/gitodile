---
id: 029
title: Migrate save and publish mutation flows behind safe domain boundaries
status: done
priority: high
type: chore
areas:
  - frontend
  - rust
  - save
  - sync
  - recovery
  - security
created: 2026-08-01
completed: 2026-08-09
parent: "022"
---

# Goal

Move the existing Save version and Publish changes workflows onto the modular
architecture without weakening preview, recovery, concurrency or uncertain
remote outcome handling.

# User outcome

Saving and publishing remain predictable and recoverable even when background
refreshes, linked worktrees or slow remote operations overlap the UI.

# Scope

- Create owned frontend feature controllers/ports and Rust application/domain
  modules for existing save and publish behavior.
- Keep operation planning separate from execution and bind both to repository
  identity, session epoch and immutable state token.
- Enforce mutation exclusion in Rust by common Git directory; frontend
  blockers continue to explain conflicts before invocation.
- Define how watcher events are suppressed/coalesced during planning,
  execution, verification, uncertain, error and success phases.
- Let successful mutation results update relevant caches directly and
  supersede older reads before issuing any necessary follow-up invalidation.
- Preserve temporary-index behavior, exact index restoration, recovery paths,
  selected-file semantics, hooks, signing and structured failures.
- Preserve remote selection, upstream behavior, authentication/timeout/
  rejection classification, no-terminal-prompt behavior and publish
  uncertainty.
- Keep current command names/payloads compatible.
- Retire the mutation-side epoch compatibility bypass from task 025: legacy
  payload support may remain only where it cannot authorize a mutation.

# Out of scope

- Implementing task 013 or 014 remote features.
- Adding force push, history rewriting or silent conflict resolution.
- Changing save/publish UI or vocabulary.

# Acceptance criteria

- [x] Save/publish UI and request orchestration no longer live in `main.tsx` or
      generic shell code.
- [x] Rust planners/workflows no longer live in `lib.rs`.
- [x] Direct concurrent IPC mutations against related worktrees serialize or
      fail safely under the Rust coordinator.
- [x] Stale session epochs and state tokens reject execution before mutation.
- [x] Every save/publish/branch mutation requires a Rust-validated epoch;
      invoking a legacy payload directly cannot bypass that check.
- [x] Mutation results supersede older discovery reads and invalidate every
      affected feature exactly once.
- [x] Cancel/timeout behavior does not claim a remote mutation failed when its
      outcome is uncertain.
- [x] Hook/signing failures, index byte restoration, recovery behavior and
      publish uncertainty tests remain equivalent.
- [x] No credential or authenticated remote URL appears in logs/errors.
- [x] Git process counts and UI responsiveness satisfy task 023's budgets.

# Relevant files

- `src/saveVersion.ts`
- `src/saveVersionDialog.tsx`
- `src/publish.ts`
- `src/publishDialog.tsx`
- `src/main.tsx`
- `src-tauri/src/lib.rs`

# Dependencies

Tasks 027 and 028.

# Decisions

- Mutation safety is enforced in Rust and explained in frontend.
- Cancellation of remote work must preserve an explicit uncertain outcome when
  the remote may already have accepted the change.

# Implementation notes

Save version and Publish changes now own their UI, domain types, typed ports,
controllers and Tauri adapters under `src/features/save-version/` and
`src/features/publish/`. `main.tsx` only composes dialogs with the active
project session and cross-feature completion callbacks. The temporary generic
facades for changes, pending versions and repository overview were removed;
the stable change-category visual moved to its status-domain owner.

Rust save planning/execution moved to `src-tauri/src/save_version.rs`, and
publish discovery/planning/execution moved to `src-tauri/src/publish.rs`.
`ipc.rs` remains the thin transport/application boundary and the task-024
repository coordinator still holds the mutation permit by canonical common Git
directory for the complete workflow. This preserves serialization across
linked worktrees, temporary-index isolation and byte-exact restoration,
selected-file behavior, hook/signing classification, recovery references,
upstream selection, prompt suppression and structured remote failures.

All ten save, publish and branch planner/executor commands now require a
non-optional `sessionEpoch`. Rust validates it before entering the mutation
workflow, the shared IPC contract checks the Rust signature and TypeScript
payload, and the mutation compatibility inventory is empty. Immutable state
tokens remain a second execution-time check after session authorization.

Watcher invalidations remain coalesced while a mutation is planning,
executing, verifying or uncertain and may refresh after success or a known
error. On success the read coordinator discards deferred watcher work,
supersedes older status and branch reads, then performs one coordinated
refresh. Publish additionally commits its authoritative remaining-version
count to the status cache before that refresh. Save deliberately does not
synthesize working-tree state because hooks may have changed files. Remote
transport timeouts after push begins retain the existing `publish_uncertain`
classification; the UI never turns that into a definite failure claim.

The migration does not add Git invocations or synchronous renderer work.
Planning/execution still runs through the bounded async native runner, and
navigation/read lifecycles are unchanged. The production build remained within
task 023's warning budgets: the entry chunk was 374.86 kB raw / 109.31 kB gzip,
Changes 59.47 kB, file icons 255.22 kB and Branches 31.23 kB combined.

# Validation

Completed on Windows 2026-08-09:

- Focused save/publish/status/session suites: 56 tests passed.
- `pnpm run check:frontend`: architecture checks, TypeScript, 230 tests in 25
  files and the production build passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 195 tests passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings`: passed.
- `git diff --check`: passed.

The repository-wide CI matrix remains the cross-platform confirmation and is
checked after this task's single commit is pushed.
