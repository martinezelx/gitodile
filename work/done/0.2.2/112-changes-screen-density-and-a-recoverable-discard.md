---
id: 112
title: Give Changes its space back, and make discarding truly recoverable
status: done
priority: normal
type: improvement
areas:
  - frontend
  - desktop
created: 2026-09-06
completed: 2026-09-06
parent:
queue:
---

# Goal

Two outcomes on one screen. First, hand the Changes screen's room back to the
thing it exists to show: the changed files and their diff, instead of three
bands of chrome above them. Second, make discarding a change something a person
can actually undo — from a list of what is stored, on their own schedule, not
only as the one step immediately after the act.

# User outcome

Someone reviewing a change sees roughly 100px more of it per panel, and finds
the file list where the search box now has the whole strip to itself.

Someone who discards work by mistake opens *Restore discarded changes*, sees
every copy GitOdile is holding — when, how many files, which ones — and picks
the one to bring back. Before this, the app could only ever offer the newest
copy, and refused even that as soon as any file anywhere in the project was
touched. In a repository being worked in, that meant the promise on the discard
dialog — *"so you can undo it"* — expired within seconds of making it.

Someone who no longer wants a copy sitting in their project's Git metadata can
delete it, after being told exactly what goes with it.

# Context

The Changes screen carried two stacked strips per panel: a header over a
toolbar, on the file list and on the diff alike, each pair kept level by its own
height contract. Task 106 had already had to unpick one drifting size token in
that arrangement.

The discard side had a subtler problem. Recovery records were written correctly
— up to ten per worktree, on disk under the worktree's own `.git` (ADR 0007) —
but only the `latest` pointer was ever readable, so a second discard hid the
first behind it, and pressing *Restore* twice retried the same record rather
than stepping back twice. Worse, applicability was judged by a fingerprint of
the *entire* working tree and index: editing any unrelated file made every
stored record unrestorable, permanently in practice. The check was far broader
than the harm it protects against, which is overwriting work at the paths a
restore would write.

# Scope

Visual:

- Fold each panel's header and toolbar into one strip, paired by a single
  height contract derived from the control tier.
- Put the screen title and its state on one line.
- Name the open file the way its row does (name, then folder) with the
  file-type icon, rather than one bold path.
- Move the reading-mode picker to the right edge of the diff strip, with the
  file and change arrows to its left and no counters.
- Move the discard/restore menu from beside Save into the file list's strip,
  at the row size, and move the selection count up to the screen's own summary
  line so the search box has the strip to itself.
- Fix the step arrows' hover shape and centring.

Discard flow:

- Read every stored recovery, not only the newest (`list_discard_recoveries`).
- Judge applicability per path instead of over the whole tree, and restore only
  the files in that mode — never the index.
- Replace an existing record when a new discard protects identical content.
- Delete one stored recovery on request, with confirmation.
- One picker dialog for all of it, in the app's dialog shell.
- A copy pass over every string in the flow, in both languages.

# Out of scope

- Restoring individual files from within one record. Considered and deferred:
  it needs a per-path after-state in the manifest and a rule for what happens
  to the rest of the record, and the whole-record restore covers the reported
  need.
- A Recovery screen. ADR 0007 still anticipates one; this task only gives the
  Changes screen the door it was missing.
- Any change to how discarding itself mutates the working tree.

# Acceptance criteria

- [x] Each panel opens with exactly one strip, and the two strips' bottom rules
      land on the same pixel row at every width.
- [x] The diff strip holds the file, its folder, its category, both step
      controls and the reading-mode picker without overlapping at the app's
      minimum window width.
- [x] Every stored recovery is listed, newest first, with when, how many files
      and which ones.
- [x] A record is applicable while nothing has been written at its own paths,
      whatever else has changed in the project.
- [x] A record that would overwrite newer work at one of its paths is refused,
      and says why on the card rather than only in an error.
- [x] Only an exact whole-tree match restores the index; the scoped restore
      says on the card that prepared changes stay as they are.
- [x] Discarding the same work twice leaves one entry, not two.
- [x] Deleting a copy asks first, names what is lost, and repoints `latest`.
- [x] A crafted recovery id cannot reach the filesystem.
- [x] The clean screen still offers a way to reach stored copies.
- [x] No dialog in the flow shows a Close button beside the corner control.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/changes/ChangesPanel.tsx`
- `src/features/changes/DiscardChangesDialog.tsx`
- `src/features/changes/changes.css`
- `src/features/changes/translations.ts`
- `src-tauri/src/recovery/discard.rs`
- `docs/adr/0007-store-discard-recovery-in-worktree-git-metadata.md`

# Dependencies

None. Builds on tasks 035, 054 (the paired strips this replaces), 106 (the
control-size scale the new height derives from) and 107 (the type scale).

# Decisions

**A restore is judged per path, not over the whole tree.** The original rule
refused unless the entire working tree and index still matched the discard's
after-state — a condition so much broader than the harm that it retired every
record within seconds of ordinary work. A discard leaves each of its targets in
the project's saved state or removes it, and Git reports both as unchanged, so
one of a record's own paths appearing in `status` is exactly the signal that
something has been written there since. That is now the test, and anything
inside a captured directory counts, because restoring replaces the directory
rather than merging into it. Recorded as a dated amendment to ADR 0007.

**The index is not restored in that mode.** It is the whole project's prepared
state, not the record's own; once anything else has moved on, the record's copy
is the older one. Only an exact whole-tree match restores it, and the picker
says which kind of restore each card offers before it is pressed.

**Verification narrows to match.** The exact restore still proves itself by
recomputing the whole-tree fingerprint against the recorded before-state. The
scoped restore cannot — the rest of the project has legitimately moved on — so
it verifies every path it wrote against the state the manifest recorded for it.

**A record identifies itself by what it would write.** Deduplication first
compared whole-tree before-states, which repeated the very mistake being fixed:
an unrelated edit between two discards made one recovery point look like two.
Records now carry a fingerprint of their own paths and bytes, computed at
capture, and a new record replaces an older one with the same fingerprint.
Records written before the field exists fall back to the before-state, which is
all they carry.

**Deleting validates the id's shape before building a path from it.** Every
other operation here would merely fail on a crafted id; this one removes a
directory tree, so the check runs first rather than after.

**No dialog in this flow has a Close button.** Dismissal is the corner control,
the backdrop and Escape — a Close button beside an X is the same door twice. A
finished action offers no button at all; a failure offers *Try again*, which
reloads the plan or the list and is what a stale state token actually needs.

**A finished dialog states its outcome instead of asking.** A heading reading
*"Discard this file's changes?"* over *"1 file went back to its last saved
version"* contradicts itself, and that heading is what a screen reader
announces when focus lands there.

**Records that cannot be applied are kept, shown, and folded away.** They are
not lost work — the snapshot is still on disk — and a list that omitted them
would read as if it were. Collapsed behind a count, they cost one line.

**The vocabulary is files, not paths.** *"GitOdile will restore the protected
state of 3 paths"* was internal language on a user-facing surface. The flow now
says files, and *"last saved version"* where it used to say *"latest saved
state"*, which is the term the rest of the app uses for a commit.

# Implementation notes

Rust (`src-tauri/src/recovery/discard.rs`) gained two commands —
`list_discard_recoveries` and `delete_discard_recovery` — plus
`record_paths_untouched`, `verify_restored_path`, `content_fingerprint` and
`validate_recovery_id`. `restore_snapshot` takes whether to restore the index.
`cleanup_old_records` now also drops the record a new one makes redundant. Both
commands are registered in `ipc.rs`, `lib.rs`, the execution policy table and
the documented IPC contract (67 commands); deleting is classed `Destructive`.

The frontend moved the whole restore experience into `DiscardChangesDialog`,
which already owned the mutation, its errors, focus and copy: the restore mode
now loads the list, offers the applicable records as the shared `choice-list`
option cards, folds the rest behind a disclosure, and carries the per-row
delete with its in-place confirmation. `ChangesPanel` lost two strips and
gained a shared `hasStoredRecoveries` probe used by both the file list's menu
and the clean empty state.

Two defects were found by writing the tests rather than by reading the code,
and both are worth remembering:

- The assumption that restoring the newest record always makes the previous one
  applicable again is false. It holds only when nothing was edited between the
  two discards; otherwise the earlier record's after-state is unreachable. The
  test that assumed otherwise was rewritten rather than the behaviour.
- Moving the actions menu into the file list removed the only route to stored
  copies exactly when it is most wanted: discarding everything empties the
  screen, and the list takes its menu with it. The clean empty state now
  carries a quiet route of its own.

Follow-up worth considering, not done here: per-file restore within a record,
and a Recovery screen that owns cleanup for every kind of recovery record
rather than only this one.

# Validation

```text
pnpm run check           # exit 0
  docs      Documentation check passed over 176 Markdown files and 141 task ids
  frontend  73 test files, 693 tests, build OK
  rust      354 tests, cargo fmt and clippy clean
```

Visual verification ran against the real stylesheet in the in-app browser at
1180×760 and at the 900px minimum window width, in light and dark themes:
paired strip heights measured at 52px each, both dialog flows in all their
states, the restore picker with its folded records and its delete
confirmation, and the clean empty state.
