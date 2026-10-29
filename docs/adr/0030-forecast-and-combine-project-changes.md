# ADR 0030: Forecast incoming changes and combine them when nothing overlaps

- Status: accepted
- Date: 2026-10-11
- Extends: [ADR 0008](0008-store-history-recovery-as-versioned-hidden-refs.md)
  with a snapshot of combined unsaved content
- Amended by: [ADR 0041](0041-conflict-sessions-and-their-recovery.md), §7 —
  a real overlap the user chooses to resolve becomes a paused `git merge`
- Amended 2026-10-29: any local or remote-tracking branch as the source
  (task 065-4-1), below

## Context

Get project changes (task 014, widened by task 074) only advanced a branch that
was strictly behind its remote. Everything else stopped: a branch with its own
unpublished versions was sent to "another Git tool", Publish answered "get the
changes first", and an unsaved edit to any file the remote also changed
blocked the update even when the edits were on different lines. Overlap was
decided per path, so the person could not tell a real overlap from a
harmless one until an update was refused. Planning and execution each fetched,
so every update waited on the network twice before anything happened.

The roadmap and task 065-4 already chose a merge-based model for 1.0 and
ruled out rebase. Task 037 owns real overlaps (conflict resolution), which
does not exist yet, so a real overlap must still be refused, but named.

## Decision

1. **Forecast locally, before anything is pressed.** Every team-sync read of
   a branch that is behind or diverged carries an `IncomingForecast`: clear,
   overlap or blocked, the overlapping paths with whether the local side is
   saved or unsaved, the incoming authors and file count, and how many
   unsaved files are carried or combined. It is computed with
   `git merge-tree --write-tree` (in memory; it writes only unreferenced
   objects) and path comparison, and never changes files, the index or refs.
   The plan and the execution also prove that separate unsaved changes can be
   carried with `read-tree --dry-run`, run against a copy of the index so it
   never takes `index.lock` beside other reads; the forecast in every status
   read relies on the path comparison alone.
2. **Plan without the network; execute what was planned.** The plan reads
   the remote as of the last check, so the dialog opens at once. The dialog
   asks the remote in the background only when the session's last check is
   older than a minute and re-plans in place if it moved. Execution never
   fetches: it applies exactly the reviewed remote commit, and a moved
   tracking ref or changed local state makes the plan stale.
3. **Combine with a merge version.** When both sides have saved versions and
   `merge-tree` reports no conflict, GitOdile builds a merge commit from the
   predicted tree with `commit-tree` (parents: the previous local tip and the
   reviewed remote commit; message `Merge remote-tracking branch '<remote>/<branch>'`).
   Before anything in the project moves it runs the hooks Git would run for a
   merge commit — `pre-merge-commit`, `prepare-commit-msg merge` and
   `commit-msg` — through `git hook run`, against a temporary index holding
   the merge result, unless hooks are turned off in Settings; it honours
   `commit.gpgSign` by passing `-S`. A hook, identity or signing failure
   leaves the project untouched. Then the recovery point is created and the
   existing two-tree `read-tree -u -m` plus compare-and-swap `update-ref`
   apply the merge version. Fast-forward keeps running no hooks, as before.
4. **Combine unsaved edits line by line.** An unsaved, unstaged edit to a
   regular file that the remote also edits in place is merged with
   `merge-tree --merge-base=HEAD <worktree tree> <target tree>`, where the
   worktree tree comes from a temporary index holding the file's working
   content. When clean, execution keeps a snapshot commit of that content,
   hands the file back to its saved content (`checkout-index`), runs the
   update, and writes the combined content back through Git's filters as an
   unsaved change. A staged edit to an incoming file, a local deletion, an
   incoming rename or deletion still block.
5. **Keep the unsaved snapshot with the history record.** The record gains
   optional `unsavedReference` and `unsavedSnapshot` fields. The snapshot ref
   lives in the sibling namespace
   `refs/gitodile/recovery/v1/get-team-changes-unsaved/<owner>/<id>`, outside
   the record namespace so retention still counts records only. It is created
   and verified before the record is published, verified with it, reconciled
   with an interrupted record and removed when its record expires.
6. **Publish rides along.** When the remote has moved on, Publish opens the
   same dialog in a "get and publish" form: one confirmation gets, combines
   and then plans and pushes as Publish always does.
7. **Refuse real overlaps by name.** A saved or unsaved overlap is reported
   with the files and refused until task 037 can resolve it.

## Amendment (2026-10-29): bringing in another branch

Task 065-4-1 lets the person bring another branch into the current one with
the same analysis and execution, so there is one way to combine saved
versions rather than two.

1. **A source is a commit with a name.** Besides the configured upstream, the
   source may be a local branch (`refs/heads/<name>`) or a remote-tracking
   branch, found through that remote's own fetch mapping exactly as a check of
   it would update it. The plan reads it as this computer has it and never
   fetches; a remote branch is as fresh as its last check.
2. **Four answers.** Already contained (nothing to do, no button), fast-forward
   (as Get, no hooks), merge (a merge version built as in point 3), and an
   **empty merge**: a merge version whose tree is the current one, because
   the source's changes are already here in another form. It is offered and
   says that no file changes, as Git would record it.
3. **The token names the source.** It binds the workflow (`get` or
   `bring-in`), the source's remote, branch and ref and its exact commit,
   beside everything point 2 already bound; a moved source, branch or file is
   `stale_bring_in_plan`, never a retargeted merge.
4. **Its own recovery operation.** Records live under
   `refs/gitodile/recovery/v1/bring-in-changes/`, with the newest 20 kept, so
   bringing in branches never evicts a team update's record. The record's
   `remote`, `destinationBranch` and `trackingRef` name the source.
5. **States a merge cannot start from block by name**, before any analysis:
   no shared saved version (`no_shared_history`), a shallow copy that lacks
   the version both sides started from (`shallow_history`), and a sparse
   checkout (`unsupported_merge_setup`), besides the detached, unborn,
   in-progress, active-branch and missing-branch states. The merge message is
   the one `git merge` would write: `Merge branch '<name>'` or `Merge
   remote-tracking branch '<remote>/<name>'`, followed by ` into <branch>`
   unless the project's `merge.suppressDest` globs name the branch (only
   `master` when it is unset). The plan shows that message and its token
   binds it.

Because the merge version is still built with `commit-tree`,
`branch.<name>.mergeOptions` and `merge.ff` play no part here; they matter
only once a real `git merge` runs for overlaps (ADR 0041 §7, task 065-4-2).

## Consequences

- Overview can say before any click whether getting is direct, needs a merge
  version, or overlaps — and never offers a button that will refuse.
- The common update needs one confirmation and no network wait to open.
- History gains merge versions for diverged branches, as Git itself would make;
  nothing is rewritten and unpublished versions keep their identity.
- `merge-tree --write-tree --merge-base` needs Git 2.40. With an older Git the
  forecast reports `gitTooOld` for anything beyond a fast-forward without
  overlapping unsaved edits.
- Execution writes to unsaved files for the combined case. The snapshot ref
  keeps their previous content; a failure in that window is reported as an
  uncertain result naming both recovery refs.
- Hooks for a merge version run through `git hook run` rather than inside
  `git merge`; hooks that inspect `MERGE_HEAD` do not see one.

## Alternatives considered

- **Rebase the unpublished versions onto the remote.** Linear history, but
  the roadmap and task 065-4 exclude history rewriting from 1.0.
- **Run `git merge` itself.** It refuses with prepared changes, honours
  `merge.autoStash` and `branch.<name>.mergeOptions`, and a hook or signing
  failure leaves a half-finished merge (`MERGE_HEAD`) that GitOdile cannot
  finish or abort until task 037. Building the commit first keeps every
  failure before any change.
- **Auto-stash unsaved changes.** Rejected by AGENTS.md and task 065-4; the
  line-level combination touches only files that also change, keeps a
  verified snapshot, and leaves the rest of the working tree alone.
- **Forecast only when the dialog opens.** The card could not then tell a
  safe update from an overlapping one, which is the point of the change.
