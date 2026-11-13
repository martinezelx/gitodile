---
id: 037-1
title: Establish conflict truth and durable recovery
status: done
priority: high
type: architecture
areas:
  - conflicts
  - rust
  - recovery
created: 2026-08-18
completed: 2026-10-28
parent: "037"
queue:
---

# Goal

Define and prove the backend conflict-session contract before any editable UI
can mutate conflicted files or the index.

# User outcome

GitOdile can recognize an interrupted merge accurately, preserve its original
state, and expose bounded current/incoming/base evidence without changing it.

# Context

This is slice 1 of epic 037. Index stages and operation markers are authoritative;
working-tree conflict markers are not.

GitOdile's own integration (task 161,
[ADR 0030](../../../docs/adr/0030-forecast-and-combine-project-changes.md))
forecasts with `git merge-tree` and builds merge versions with
`git commit-tree`, so it never leaves a paused `git merge`, and it refuses real
overlaps. Merges started outside GitOdile (a terminal, an editor, a coding
agent) do leave one. The ADR must cover both.

# Scope

- Write the conflict-session/recovery ADR, including operation roles, ownership,
  restart, linked worktrees, retention, privacy, and incomplete evidence.
- Decide in that ADR how an overlap GitOdile detects (task 161 now, task 065-4
  next) becomes a resolvable session: start a real `git merge` that pauses, or
  build the session from `merge-tree` output. State the consequences for hooks
  (ADR 0030 runs merge hooks through `git hook run`), recovery refs, and abort.
- Keep the snapshot compatible with the recovery-center seed in
  [`ROADMAP.md`](../../../docs/ROADMAP.md#design-seeds-in-100): a record whose
  origin may be outside GitOdile.
- Parse/classify every in-scope unmerged-index shape and active merge state.
- Detect, read-only, a paused rebase, cherry-pick or revert and unmerged entries
  with no operation marker, with their step and roles where Git exposes them,
  so task 037-3 can explain them (epic 037 §1b). No mutation contract for them.
- Define typed session, file summary, allowed-action, snapshot, state-token,
  error, and invalidation contracts.
- Read stage object metadata/content lazily within explicit process/IPC caps.
- Create and verify a durable pre-mutation snapshot format for unmerged index
  stages plus working content/mode; this slice does not restore or mutate it.

# Out of scope

- Editor choice, frontend workspace, writing resolutions, staging, completion,
  abort, or any mutation for non-merge operation variants.

# Acceptance criteria

- [x] ADR and typed domain cover roles, origin, state, recovery, lifecycle, and
      every conflict class in epic 037 without source-content logging.
- [x] Opening/refreshing a session is read-only and session/ref/index/state-token
      stale checks are proved with temporary repositories.
- [x] Snapshots are collision-safe, durable, versioned, bounded, restart-safe,
      and preserve incomplete/unreadable evidence.
- [x] Linked-worktree ownership and common-repository locking are tested.
- [x] IPC/policy/architecture tests and focused Rust checks pass.

# Relevant files

- [Epic 037](037-guided-conflict-resolution.md)
- [ADR 0030](../../../docs/adr/0030-forecast-and-combine-project-changes.md)
- `src-tauri/src/recovery/`
- `src-tauri/src/sync/`
- `src-tauri/src/status.rs`
- `src-tauri/src/index.rs`
- `src-tauri/src/repository_access.rs`

# Dependencies

None open; the modular architecture (tasks 022–031) is complete.

# Decisions

The ADR produced here is the gate for all later conflict mutations:
[ADR 0041](../../../docs/adr/0041-conflict-sessions-and-their-recovery.md).

- 2026-10-28: an overlap GitOdile finds (task 065-4) becomes a real, paused
  `git merge --no-ff --no-commit --no-autostash <reviewed commit>`, started
  after a start record and the history recovery point, instead of a session
  built from `merge-tree` output (user decision; ADR 0041 §7, which amends
  ADR 0030 point 7). One read path then serves merges from GitOdile and from
  any other tool.
- Rename conflicts are shown per path, not inferred: the index keeps no link
  between the two paths, and every whole-file choice stays correct per path.
- A path that is not valid UTF-8 is listed with a lossy name and is
  `unsupported`; GitOdile never writes to a path it cannot name exactly.
- The snapshot does not copy the index file (a split index keeps entries
  elsewhere); it records each stage and pins the blobs with a tree ref, which
  needs no identity and never appears in history.
- The origin is read from the snapshot; until task 065-4 writes start records,
  every session without a GitOdile snapshot is `external`.
- `create_conflict_snapshot` has no IPC command in this slice. It requires the
  caller to hold the repository write lock, so its first caller is the
  mutation workflow of task 037-6.

# Implementation notes

Modules:

- `src-tauri/src/conflicts.rs` (new, the `conflicts` boundary of `AGENTS.md`):
  operation detection, `ls-files -u -z` parsing and grouping, shape and facet
  classification, role labels, allowed actions, the state token, the session
  read and the lazy stage read. `repository::git_operation_in_progress` now
  asks `conflicts::paused_operation_marker`, so the existing refusals and the
  session agree on what is paused.
- `src-tauri/src/recovery/conflict.rs` (new, third recovery owner): manifest
  schema v1, capture, pin, publish, trim. `recovery/mod.rs` now holds
  `worktree_owner_id` and `stable_fnv1a`, which history recovery and the
  conflict snapshot share (moved from `history.rs`, unchanged).
- IPC: `read_conflict_session(path, sessionEpoch) -> ConflictSession | null`
  and `read_conflict_stage(path, filePath, stage, objectId, sessionEpoch) ->
  ConflictStageContent`, both repository reads; the stage read supersedes
  only an earlier read of the same file. New error code
  `stale_conflict_session`, with English and Spanish copy.
- Watcher: `rebase-merge/` and `rebase-apply/` invalidate the worktree.

Parsing: each `ls-files -u -z` record is `<mode> <object> <stage>\t<path>\0`;
modes must be six octal digits, object IDs 40 or 64 hex digits, stages 1–3.
A path's stages arrive together and are grouped in order; a missing stage is
valid. Paths stay raw bytes until display.

Processes per session read: `ls-files -u -z`, one `rev-parse` for `HEAD` and
its branch, and one `for-each-ref --points-at` per side that needs a name
(one for a merge, one for a rebase's `onto`). A stage read is one literal
pathspec `ls-files -u -z` (to prove the object is that stage) and one
`cat-file --batch`. A snapshot adds one `mktree -z` and one `update-ref`, plus
the two session reads that revalidate its token.

State token inputs (SHA-256, 128 bits kept): common and worktree Git directory
keys, `HEAD`, the operation's marker contents (heads, rebase step, head-name,
onto), the raw unmerged listing, and each listed path's working kind, size and
modification time. Session ID: worktree Git directory, operation, `HEAD` and
the operation heads, so it is stable across restarts and new for every pause.

Caps: 5,000 paths and 16 MiB of listing (a truncated listing drops its last,
possibly partial path and says it is incomplete); 2 MiB per stage read (the
diff cap); 8,000-byte binary probe; 512 MiB of working bytes per snapshot;
ten ended snapshots per worktree, 30 days; pending folders abandoned after
one hour.

Fixtures (`src-tauri/src/tests/conflict_tests.rs`): one merge paused on ten
paths — content, modify/delete, delete/modify, mode, a path with a space and
`ñ`, CRLF, binary, add/add, symbolic link and submodule (link and gitlink
entries written with `update-index --cacheinfo`); a small two-branch repository
that pauses a cherry-pick, a revert, a rebase, a faked octopus merge (a second
line in `MERGE_HEAD`) and a conflicting `stash pop`; and a linked worktree
with its own paused merge.

Not covered by a temporary repository, with the reason:

- File/directory conflicts: merge-ort moves the file aside under a new name,
  so the facet (a directory on disk where the index holds a file) is proved
  by a unit test only.
- Non-UTF-8 paths: Windows cannot create them; parsing and the `unsupported`
  state are unit-tested.
- An unreadable working path or one that escapes through a symbolic link:
  creating either needs privileges on Windows. The `omitted` evidence of the
  same code path is proved with a small byte budget.
- The project session epoch is checked by the IPC adapter, as for every
  repository command, and is covered by the IPC contract tests.

# Review

2026-10-28, a code review before closing found and fixed:

- `HEAD` was never read: `rev-parse --verify` refuses a second argument, so
  every session fell back to the `HEAD` file, with no commit. The session ID
  and state token missed `HEAD`, and a detached `HEAD` had no current side.
  The merge and rebase fixtures now assert the current commit.
- A rebase that replays a merge (`--rebase-merges`) also writes `MERGE_HEAD`
  and was read as a supported merge. The rebase directories are now checked
  first, and `git am` (`rebase-apply/applying`) is its own operation, `am`,
  with its own commands instead of the rebase ones.
- The state token did not cover snapshot paths that were resolved since, so
  a later edit to one would not make a reset stale. It now does, and each
  path's part is length-prefixed.
- A failed capture left its pin ref behind with no manifest, so nothing would
  ever trim it. It is now removed unless another process published that
  session meanwhile.
- Shaping a session looked up the snapshot per path in a list (quadratic at
  5,000 paths); it is now indexed once, and the session read passes the
  snapshot it already read instead of reading it twice.

# Validation

2026-10-28, Windows 11, Git 2.55.0, `tauri dev` not running:

- After the review: `cargo test --lib conflict`: 18 passed (a new unit test
  for the marker order).
- `cargo test --lib conflict`: 17 passed (13 unit tests in `conflicts.rs`,
  `recovery/conflict.rs` and `watch.rs`'s taxonomy test, plus the four
  integration tests). Each integration test takes about 3 s alone.
- `pnpm run check:rust` (fmt, Clippy with `-D warnings`, every Rust test):
  exit 0, 659 passed, 1 ignored.
- `pnpm vitest run src/architecture/ipcContract.test.ts src/shared/i18n`:
  pass (144 commands, the new error code in both locales).
- `pnpm run check` in one pass: not green yet. Two of three runs stopped on a
  5 s timeout in `App.projects.test.tsx` ("refreshes a project's local status
  whenever it becomes active"; once also `App.test.tsx`, "wires the status
  bar…"). Both files pass alone, three times in a row; this change touches no
  frontend runtime code. In the run that passed every frontend test
  (1,770), the gate then stopped only on `cargo fmt`, fixed since.
- The App timeouts came from each App test file's first test paying the cold
  load of every screen chunk; the shared App test hooks now load them once per
  file before the first test. `pnpm run check` then passed in one pass, and
  the frontend suite passed again on a second run.
- Platforms: Windows only. Symbolic links are stored as plain files there
  (`core.symlinks=false`), so the link fixture proves the index stages and the
  stage read, not a real link on disk; macOS and Linux remain to be run.
