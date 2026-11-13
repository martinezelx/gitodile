---
id: 072
title: Bound speculative diff IPC and require repository session epochs
status: done
priority: high
type: chore
areas:
  - rust
  - frontend
  - architecture
  - performance
created: 2026-08-24
completed: 2026-08-25
parent:
queue:
---

# Goal

Harden the two remaining boundaries identified in the architecture review:
keep speculative Changes cache warming from turning the backend's 16 MiB
emergency diff cap into a normal renderer payload, and remove the residual
compatibility path that allows repository-scoped IPC calls to omit their
`sessionEpoch`.

# User outcome

Large working trees remain responsive without hidden multi-megabyte speculative
IPC and renderer-memory spikes, while requests and cleanup from an older project
incarnation cannot be accepted against the currently open repository session.

# Context

The current Rust/React split is already correct: Rust owns Git execution and
unified-diff parsing, while React consumes typed `FileDiff` values and keeps
presentation caches. The remaining work is hardening those boundaries rather
than redesigning them.

`src-tauri/src/changes.rs` currently bounds the aggregate tracked-diff command
with:

```rust
MAX_BATCH_DIFF_OUTPUT_BYTES = 16 * 1024 * 1024;
```

That is a useful native safety ceiling, but `ChangesController.warm` currently
calls `readWorkingTreeDiffs` speculatively for every non-clean working tree.
The returned typed diffs are serialized over IPC and inserted into renderer
caches. A changeset approaching the 16 MiB Git-output ceiling can therefore
expand further while parsed, serialized and represented as JavaScript objects,
even when the user never opens most of those files. The selected-file path
already has a bounded on-demand fallback through `read_file_diff`.

Separately, most mutation and History commands already require a concrete
`sessionEpoch`, but some repository reads still expose `sessionEpoch?` in
`docs/architecture/025-ipc-contract.json`. `SessionRegistry::validate` still
contains the compatibility behavior:

```rust
let Some(epoch) = epoch else {
    return Ok(());
};
```

The contract now reports `optionalSessionEpochConsumers: []`, so compatibility
optionality should no longer be the reason a post-open repository call can skip
session validation. Optionality that is semantically required must remain
explicit: `open_repository` needs to create or resume a session when no epoch
exists yet, and commands such as `get_line_endings` can operate globally when
no repository path is supplied.

# Scope

## Adaptive speculative diff warming

- Keep Git execution, diff parsing and payload-safety decisions in Rust; do not
  move aggregate-diff processing into React.
- Separate the backend's 16 MiB emergency hard cap from the amount of data that
  is considered acceptable for speculative cache warming.
- Introduce a documented, bounded eligibility/budget decision for aggregate
  warming. The implementation may use estimated diff size, file/change counts,
  an explicit warm budget, or an equivalent backend-owned signal, but the
  speculative threshold must be materially below the emergency ceiling and
  covered by tests.
- Return enough typed information for the frontend to distinguish a completed
  batch warm from a deliberately deferred/skipped/truncated warm instead of
  treating an oversized aggregate response as ordinary preloaded data.
- When a changeset is not eligible for aggregate warming, do not fan out into
  one IPC request per changed file. Skip/defer the speculative warm and let the
  existing selected-file `read_file_diff` path load content on demand.
- Preserve the existing per-file diff safeguards and renderer cache bounds.
- Update the IPC contract if the batch command response shape changes.

## Strict repository session epochs

- Remove the compatibility behavior that treats a missing epoch as valid for
  repository-scoped post-open validation.
- Make `sessionEpoch` required across Rust IPC signatures, TypeScript
  ports/adapters and callers for commands that act on an already-open repository
  incarnation.
- Preserve the semantic exception for `open_repository`: an initial open may
  have no requested epoch, while a refresh/reopen with an epoch must still prove
  that it is current.
- Preserve global command modes that genuinely have no repository session. In
  particular, `get_line_endings` may remain callable without an epoch when no
  repository path is provided, but supplying a repository path must require and
  validate the matching epoch. Use explicit conditional validation or split the
  boundary only if that produces a clearer contract.
- Scope `watch_repository` and `unwatch_repository` to the exact session epoch
  so cleanup from an old renderer/session cannot detach a watcher belonging to
  a newer incarnation.
- Update `docs/architecture/025-ipc-contract.json`, its snapshot tests, and Rust
  session/IPC tests so optionality is documented only where it is semantic, not
  compatibility scaffolding.

# Out of scope

- Replacing the Rust Git backend or moving Git/diff work into the frontend.
- Redesigning the Changes or History UI.
- Removing the 16 MiB native emergency cap; this task changes how speculative
  warming approaches it, not the need for a final hard ceiling.
- Reworking the existing per-file diff limit or frontend cache budgets unless
  implementation measurements reveal a concrete defect that must be recorded
  as a follow-up.
- Making the initial `open_repository` call require an epoch that does not yet
  exist.
- Changing the representation or lifecycle model of session epoch identities.
- Adding background N-file prefetch as a replacement for the aggregate batch.

# Acceptance criteria

- [x] A small ordinary working tree still benefits from aggregate speculative
      diff warming, and opening a warmed file can use the existing cache.
- [x] A large/oversized working tree does not send an aggregate speculative
      renderer payload that grows toward the 16 MiB emergency Git-output cap;
      the warm is explicitly deferred/skipped/truncated according to the new
      bounded policy.
- [x] Deferring a batch warm does not trigger an N-files/N-IPC fallback storm;
      selecting a file loads only the needed diff through the existing
      on-demand path.
- [x] The 16 MiB backend emergency cap remains in place and tested, while the
      lower speculative-warm policy is documented and regression-tested.
- [x] Frontend diff caches remain bounded and stale warm responses still cannot
      populate a newer store generation.
- [x] Missing `sessionEpoch` is no longer accepted by repository-scoped
      post-open IPC validation; missing and stale epochs fail with the existing
      `stale_session` behavior.
- [x] Every repository-session-bound command in the checked IPC contract uses a
      required epoch, with semantic exceptions documented and tested.
- [x] `open_repository` still supports initial session creation without a prior
      epoch and validates a supplied epoch when one exists.
- [x] Global no-repository calls such as global line-ending reads remain valid,
      while their repository-scoped form requires the current epoch.
- [x] A stale `unwatch_repository` request cannot remove the watcher registered
      for a newer session epoch.
- [x] IPC contract snapshots and relevant frontend/Rust tests cover the new
      batch-warm and epoch rules.
- [x] `pnpm run check` passes before this task is marked done.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/025-ipc-contract.json`
- `src/ipcContract.test.ts`
- `src-tauri/src/changes.rs`
- `src-tauri/src/ipc.rs`
- `src-tauri/src/session.rs`
- `src-tauri/src/watch.rs`
- `src-tauri/src/tests/changes_tests.rs`
- `src/features/changes/controller.ts`
- `src/features/changes/controller.test.ts`
- `src/features/changes/port.ts`
- `src/features/changes/tauriAdapter.ts`
- `src/features/repository/cacheWarming.ts`
- `src/projectSessions.test.ts`

# Dependencies

None. Queue ordering places this after the currently scheduled release-hardening
work.

# Decisions

- Keep 16 MiB as the native emergency ceiling, not the target size of a normal
  speculative IPC response.
- Prefer a skipped/deferred warm plus selected-file on-demand loading over a
  fallback that issues one request for every changed file.
- Treat epoch optionality as a semantic API property only; do not keep optional
  epochs solely for compatibility with consumers that have already migrated.
- Preserve `open_repository` initial-session semantics and explicitly handle
  commands that have both global and repository-scoped forms.

# Implementation notes

## Speculative warm policy

Two backend-owned bounds, both in `src-tauri/src/changes.rs`, kept separate
from the 16 MiB emergency ceiling:

- `MAX_WARM_CHANGED_FILES = 250` — pre-flight eligibility. Past this many
  changed entries the warm returns `deferred` after the single `git status`
  it already ran, so no diff process is spawned at all.
- `MAX_WARM_DIFF_OUTPUT_BYTES = 2 MiB` (an eighth of the emergency cap) —
  the byte budget for one speculative response. It caps the combined
  `git diff` output *and* the untracked bytes read from disk, which
  previously had no aggregate bound at all (only a 2 MiB per-file cap, so
  N untracked files could reach N × 2 MiB).

`MAX_BATCH_DIFF_OUTPUT_BYTES` stays at 16 MiB and stays enforced:
`batch_tracked_diffs` now takes the caller's `budget_bytes` and passes it
through `batch_output_cap`, which clamps any request to the emergency
ceiling. The clamp is unit-tested at 2 MiB, at 16 MiB and at `usize::MAX`.

## IPC response shape

`read_working_tree_diffs` now answers `WorkingTreeDiffBatch` instead of
`FileDiff[]`:

```ts
{ outcome: "completed" | "truncated" | "deferred";
  diffs: FileDiff[]; changedFiles: number; budgetBytes: number }
```

`truncated` keeps the sections that fit, in Git's own order, so a partial warm
is still useful; `deferred` carries no diffs. Neither triggers a per-file
fallback: `ChangesController` records the outcome on the store and the
selected file still loads through the existing `read_file_diff` path, one
request for the file the user actually opened.

## Epoch contract changes

`SessionRegistry::validate` now takes `&str`, so a missing epoch fails with
`stale_session` exactly like a stale one. `ipc.rs` collapsed
`validate_mutation_session` into one `validate_session`; reads and mutations
share the same rule.

Changed from `sessionEpoch?` to a required `sessionEpoch`:
`read_working_tree_status`, `read_file_diff`, `read_file_lines`,
`read_working_tree_diffs`, `discover_remotes`, `list_unpublished_versions`,
`read_commit_file_changes`, `read_commit_file_diff`, `get_branches`,
`watch_repository`, `unwatch_repository`.

Semantic exceptions kept, now documented with their reason in
`025-ipc-contract.json` under `sessionEpoch.semanticExceptions` (the
`compatibility` block is gone):

- `open_repository` — an initial open has no epoch yet; a supplied one must
  still be current.
- `get_line_endings` — global when no project path is given. Supplying a path
  now requires the epoch explicitly (`ok_or_else(stale_session_error)`)
  instead of falling through the removed missing-epoch allowance.

Both Rust and TypeScript contract tests now assert that the set of optional
epochs equals the documented exception list, so a future optional epoch cannot
be added silently.

`WatcherRegistry::unwatch` takes `&str` and matches the exact epoch; the
"remove whatever is registered" form is a private `remove_watch`, used only
where a new registration immediately replaces the old one.

## Trade-offs

No frontend TypeScript port needed loosening: every adapter except
`open_repository` and `get_line_endings` already declared a required epoch, so
this change removed a Rust-side allowance the frontend had already stopped
relying on.

A 250-file changeset warmed whole is still allowed, so the eligibility rule
only bites where per-file navigation is the realistic interaction anyway. The
2 MiB budget is measured against Git's own output bytes rather than an
estimate, which costs nothing extra: the batch already ran capped, and the cap
value is simply lower now.

## Unrelated flake found while validating

`src/main.test.tsx` intermittently failed at
`findByRole("button", { name: "Get these versions" })` during full-suite runs.
Confirmed pre-existing: with this task's changes stashed, a clean tree failed
the same way once in five runs. The confirmation dialog opens behind an async
plan call, so the one-second `findBy` default is too tight under a loaded
parallel run; the assertion now uses `{ timeout: 3000 }`, the same idiom the
file already applies to its other post-async waits. Five consecutive full-suite
runs passed afterwards. No product code was changed for this.

# Validation

- `pnpm run check:docs` — passed (128 Markdown files, 96 task ids).
- `pnpm run check:architecture` — passed (289 modules).
- `pnpm run typecheck` — passed.
- `pnpm run test` — passed (52 files, 433 tests), including the new
  `changes controller` warm-outcome cases and the IPC contract snapshot.
- `pnpm run build` — passed.
- `cargo test --all-targets --all-features` — passed (305 tests), including the
  new `changes_tests` warm-budget cases and `ipc::session_boundary_tests`.
- `pnpm run check` — passed end to end (exit 0): docs, architecture, TypeScript,
  433 frontend tests, build, `cargo fmt --check`, Clippy with `-D warnings`, and
  305 Rust tests.
