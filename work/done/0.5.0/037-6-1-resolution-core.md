---
id: 037-6-1
title: Choose a side, mark resolved and reset a file in Rust
status: done
priority: high
type: feature
areas:
  - conflicts
  - rust
  - recovery
created: 2026-10-29
completed: 2026-10-29
parent: "037-6"
queue:
---

# Goal

The native half of resolving one overlapping file: keep a whole side or delete
the path in the working tree, mark the file resolved in the index, and reset it
to its original overlap, each a stale-safe, verified local mutation that keeps
what it replaces.

# User outcome

None visible yet; task [037-6-2](037-6-2-resolution-actions-ui.md) puts these
commands on the screen. Every later action has a tested, recoverable contract.

# Context

Builds on the session, state token and snapshot of
[037-1](037-1-conflict-domain-and-recovery.md) and
[ADR 0041](../../../docs/adr/0041-conflict-sessions-and-their-recovery.md), whose
`create_conflict_snapshot` has its first caller here. Decisions are recorded in
the parent [037-6](037-6-resolve-files.md).

# Scope

- Split `conflicts.rs` into `conflicts/mod.rs` (the reads and shared types)
  and `conflicts/resolve.rs` (the mutations, whose write helpers stay private).
- A resolution journal beside the snapshot (an amendment to ADR 0041): before
  an action replaces working content or an index entry that the snapshot does
  not already hold, the replaced bytes are copied into it; it also records the
  side each path was set to and what that write left on disk.
- `resolve_conflict_side(path, filePath, choice, expected, stateToken)`:
  `keep-current`, `keep-incoming` or `delete`, writing the working tree only.
  Content comes through Git's own filters (`cat-file --filters`) into a
  temporary file beside the target, flushed and renamed over it; mode and
  symbolic links follow the side and the project's `core.symlinks`.
- `mark_conflict_resolved(path, filePath, expected, stateToken, allowMarkers)`:
  the exact stage of a side whose write is untouched through
  `update-index --index-info`; otherwise `git add` (or `git rm --cached` when
  the path is gone) with literal pathspecs, then the resulting mode verified.
  Conflict markers left in a text file refuse unless `allowMarkers`.
- `reset_conflict_file(path, filePath, stateToken)`: the original stages,
  proved on a copy of the index first and then applied through
  `update-index --index-info`, and the original working content from the
  snapshot, checked against its SHA-256 and written atomically.
- A submodule's side is set in the index only (`--cacheinfo 160000`).
- Every command takes the write lock, revalidates the session epoch, state
  token, the path's stages (mode and object ID), the action's permission and
  the snapshot, creates the snapshot first when there is none, and verifies the
  result before answering.
- IPC, execution policies, error codes with English and Spanish copy, the IPC
  contract, `docs/ARCHITECTURE.md` § Conflict sessions.

# Out of scope

- Any screen change (037-6-2), opening an editor and its reconciliation,
  case-collision and folder-in-the-way blocks (037-6-3), finishing or aborting
  the merge (037-5).

# Acceptance criteria

- [x] Side, delete, mark and reset bind the exact stage objects, modes and
      paths they were planned with, and a moved token changes nothing.
- [x] Nothing a mutation replaces is lost: the snapshot or the journal holds it.
- [x] Reset restores exact stages, content and mode; it refuses, changing
      nothing, when the evidence to do so is missing.
- [x] Marking resolved never deletes a working file and never resolves a file
      with markers left unless asked to.
- [x] Windows file locks are reported with nothing changed; unrelated content
      and Git metadata stay byte-for-byte.
- [x] Rust unit and temporary-repository tests, the IPC contract and
      `pnpm run check` pass.

# Relevant files

- `src-tauri/src/conflicts.rs`, `src-tauri/src/recovery/conflict.rs`
- `src-tauri/src/index.rs`, `src-tauri/src/ipc.rs`, `src-tauri/src/application.rs`
- `src-tauri/src/tests/conflict_tests.rs`
- `docs/architecture/025-ipc-contract.json`

# Dependencies

Tasks 037-1 and 037-3.

# Decisions

See the parent's decisions of 2026-10-29.

# Implementation notes

2026-10-29:

- **Modules.** `conflicts.rs` became `conflicts/mod.rs` (reads, shared types)
  and `conflicts/resolve.rs` (the three mutations; its write helpers are
  private). The journal lives with the snapshot in `recovery/conflict.rs`.
  [ADR 0041](../../../docs/adr/0041-conflict-sessions-and-their-recovery.md) §8
  records the write path and the journal; `docs/ARCHITECTURE.md` § Conflict
  sessions describes them.
- **IPC** (all `repository_write`, epoch required, each returns the fresh
  `ConflictSession | null`):
  `resolve_conflict_side(path, filePath, choice, expected, stateToken)`
  (local mutation), `mark_conflict_resolved(path, filePath, expected,
  stateToken, allowMarkers, executable?)` (local mutation),
  `reset_conflict_file(path, filePath, stateToken, stagesOnly)` (destructive,
  with recovery). `expected` is the `{base, current, incoming}` stages the
  screen read. New error codes `conflict_action_unavailable`,
  `conflict_markers_remain`, `conflict_choice_needed` and `file_locked`, with
  English and Spanish copy.
- **Session read.** `ConflictFile.kept` (`current`, `incoming`, `deleted`)
  names the side an action wrote while the path's kind, size and modification
  time still match what it left. A folder in the way gets no action; a link,
  a submodule or a kind change get Mark resolved only after a side was kept,
  and no Open in editor.
- **Writes.** A regular side runs `cat-file --filters --path=<path> <object>`
  with its standard output going straight into a temporary file beside the
  target (`git_command::run_git_to_file`, a new runner variant in `git.rs`),
  sets the executable bit on Unix, flushes and renames. A link is a link where
  `core.symlinks` allows it, otherwise a file holding its target. Every
  component of the path must be spelled on disk exactly as Git spells it, and
  no folder of it may be a link. Reset gives the restored file its original
  modification time, so the session reads it as untouched again.
- **Index.** `update-index -z --index-info` removes the path's entries and
  adds the wanted ones; reset first proves them on `copy_project_index` with
  `GIT_INDEX_FILE` (`git_command::run_git_with_env_and_input`), restores the
  working file, then applies them to the real index. `git add` and
  `git rm --cached --quiet` take `:(literal)` pathspecs after `--`.
- **Markers.** Only whole blocks count (`<<<<<<<`, optional `|||||||`,
  `=======`, `>>>>>>>` at Git's default size of 7); a lone `=======` does
  not. Binary, UTF-16 and files over 32 MiB are not scanned. A custom
  `conflict-marker-size` attribute is not read yet.
- **Processes per action**, about: the session read (3) and its
  revalidation by the snapshot (3, or 1 when the snapshot exists), one or two
  for the change, one `ls-files -s` to verify, the journal's `mktree` and
  `update-ref` only when it pins something new, and the fresh session (3).

Not covered by a test, with the reason: a real symbolic link on disk
(Windows creates the fixture with `core.symlinks=false`, so the link side is
written as a file holding its target, which is what the test proves);
the journal pin of stages that moved since the snapshot is not exercised by
the fixture yet; it is left for the 037-7 audit's fixtures.

# Validation

2026-10-29, Windows 11, `tauri dev` not running:

- `cargo test --lib conflict`: 21 passed, among them the new
  `each_file_is_kept_marked_and_reset_exactly` (about 10 s alone, commented),
  and unit tests for the marker scan, the `--index-info` input and the
  per-class actions.
- `pnpm run check`: the first run failed on one test,
  `ipc::contract_tests::checked_contract_matches_registered_adapters_arguments_and_errors`,
  because its own list of error codes lacked the four new ones; once they
  were added, a second run passed with exit 0 (1,784 frontend tests;
  Rust 663 passed, 1 ignored).
- Platforms: Windows only; macOS and Linux (real links, the executable bit on
  disk) are still to be run.

# Review

2026-10-29, a code review before closing found and fixed:

- An unset `core.symlinks` was read as true everywhere; on Windows creating a
  link needs a privilege most accounts lack, so it is now read as false
  there, and a link side is written as a file holding its target, as Git
  does with links off.
- A read-only target was reported as "another program is using this file"
  on Windows, where both refuse the rename alike; it is now reported as
  read-only.
- Deleting a path that is a Windows link to a folder failed, since such a
  link is removed as a folder; only the link is removed.
- The file written for a link side with links off was not flushed before the
  rename; it is now, like every other side.
- The class test now also proves a reset of the overlap alone, which leaves
  the user's working file as it was.

After the review: `cargo test --lib conflict` 21 passed; Clippy with
`-D warnings` clean; `pnpm run check` exit 0 in one pass (1,784 frontend
tests; Rust 663 passed, 1 ignored).
