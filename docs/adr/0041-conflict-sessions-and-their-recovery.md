# ADR 0041: Read conflict sessions from Git and snapshot them before any change

- Status: accepted
- Date: 2026-10-28
- Extends: [ADR 0007](0007-store-discard-recovery-in-worktree-git-metadata.md)
  and [ADR 0008](0008-store-history-recovery-as-versioned-hidden-refs.md)
  with a third recovery owner; amends point 7 of
  [ADR 0030](0030-forecast-and-combine-project-changes.md) for task 065-4

## Context

Epic 037 lets a user resolve a paused merge inside GitOdile at GitHub Desktop
level: keep one whole side per file or edit it in their own editor, mark it
resolved, reset it, and finish or abort the merge. Before any of that can
write to a conflicted file or to the index, GitOdile needs one contract for
what a paused operation is, who started it, which side is which, how a stale
view is detected, and what is preserved before the first change.

Most paused merges are not started by GitOdile. A terminal, an editor or a
coding agent leaves `MERGE_HEAD` and unmerged index entries behind, possibly
over uncommitted work whose earlier state nobody recorded. Coding agents also
rebase, cherry-pick, revert and pop stashes, and GitOdile must not be blind
to the states those leave, even though it will not continue them.

GitOdile's own integration (ADR 0030) builds merge versions with
`merge-tree` and `commit-tree` and refuses real overlaps. Task 065-4 will
integrate local branches and diverged upstreams, so an overlap GitOdile itself
finds must become a session the resolver can work on.

Git's conflict truth is the index: up to three stages per path (1 base,
2 current, 3 incoming), any of which may be absent. Conflict markers in the
working tree are only a rendering, may be edited away, and also appear in files
that are not conflicted.

## Decision

### 1. The index and Git's operation markers are the only truth

- A session is read with `git ls-files -u -z` (mode, object ID, stage and raw
  path per entry) and the operation markers in the worktree's own Git
  directory: `MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `rebase-merge/`,
  `rebase-apply/` (with `applying` inside it for `git am`). Working-tree
  markers never decide anything. The rebase directories are checked first: a
  rebase that replays a merge (`--rebase-merges`) also writes `MERGE_HEAD`,
  and finishing that pause as a merge would leave the rebase half done.
- Operations: `merge`, `rebase`, `cherry-pick`, `revert`, `am`, and `unmerged`
  (unmerged entries with no marker, as `git stash pop` or `git checkout -m`
  leave). The domain also names `stash-apply` and `apply-patch` for later; Git
  exposes no marker that tells them apart from `unmerged` today.
- Only a merge with exactly one merge head is **supported**. Every other
  operation, and a merge with several heads (octopus), is read and explained
  with its files, its step where Git records one (`msgnum`/`end`,
  `next`/`last`), and the exact commands to continue or abort with the tool
  that started it. It has no allowed action.
- Reading a session is read-only: no `git status` refresh that rewrites the
  index, no lock files, no marker or ref writes. Opening, refreshing and
  revisiting the resolver therefore cannot change the project.

### 2. Roles come from the operation and real names, not `ours`/`theirs`

| Operation | Stage 2 (current) | Stage 3 (incoming) |
| --- | --- | --- |
| merge | the checked-out branch | the merge head |
| rebase | the branch being rebased onto | the version being replayed (the user's own work) |
| cherry-pick | the checked-out branch | the picked version |
| revert | the checked-out branch | the reverted version's parent side |

The current label is the checked-out branch, or the short commit when
detached. The incoming label of a merge is the branch, remote branch or tag
pointing at `MERGE_HEAD`, found with one `for-each-ref --points-at`; the name in
`MERGE_MSG` is only a hint that must match one of them, because that file is
editable. With no such name the label is the short commit. A rebase reads
`head-name` and `onto` from its own directory.

### 3. File shapes and the classes of epic 037

Each path is classified from which stages exist and their modes: both
changed, both added, deleted by current or by incoming, deleted by both, added
by one side only (the residue of a rename or a file/directory conflict), and
the facets mode change, symbolic link, submodule (gitlink), type change,
file/directory (the path is a directory on disk), and case collision (another
overlapping path equals it but for case, on a file system that ignores case;
added by the 2026-10-29 amendment in §8). Binary content, encoding and
line endings are facts of a stage's content and are reported when that stage
is read.

Git records a rename conflict under each path separately, with no link
between them in the index. GitOdile shows such paths as their per-path
shapes and does not infer renames; every whole-file choice stays correct per
path. A path that is not valid UTF-8 is listed with a lossy display name and is
`unsupported`: GitOdile will not write to a path it cannot name exactly.

Per-file states are `unresolved` (still unmerged), `editedOutside` (working
content differs from the snapshot), `markedResolved` (in the snapshot, no longer
unmerged), `stale` (unmerged, but its stages differ from the snapshot), and
`unsupported`. Without a snapshot only `unresolved` and `unsupported` can be
told apart.

### 4. Bounds and lazy content

- The unmerged listing is read with a 16 MiB output cap and at most 5,000
  paths; a session past either bound says the list is partial and how many
  paths it read. The file list is virtualized in the frontend.
- Stage content is never part of the session. It is read per file and stage
  with one `cat-file --batch`, capped at 2 MiB (the diff cap), after the
  requested object ID is checked against that path's current stage, so the IPC
  boundary can never read an arbitrary object. Content is returned as text when
  it has no NUL byte in its first 8,000 bytes and is valid UTF-8, otherwise as
  binary with its size.
- Diagnostics carry object IDs, counts and phases, never content or paths.

### 5. Session identity, state token and invalidation

- **Session ID**: a hash of the worktree's Git directory, the operation, the
  `HEAD` commit at the pause, and the operation's head commit(s). It is stable
  across restarts and differs for every new pause.
- **State token**: SHA-256 over the repository identity, the operation markers'
  contents, `HEAD`, the raw unmerged listing, and the working type, size and
  modification time of each unmerged path and of each snapshot path resolved
  since (what a reset of that file would replace). Every later mutation (037-6, 037-5) takes
  the token, revalidates it under the repository write lock and re-reads the
  bytes of the paths it touches; a mismatch is `stale_conflict_session`.
- The IPC layer validates the project session epoch as for every command.
- Invalidation: the watcher already reports `index`, `HEAD`, refs and the
  merge/cherry-pick/revert heads; it now also reports `rebase-merge/` and
  `rebase-apply/`. GitOdile's own `gitodile/` directory never invalidates.
  Overview and the Changes tab read the same cached session summary, refreshed
  on activation and on those invalidations, never on visibility.

### 6. A durable snapshot precedes the first change

Before the first mutation of a session, GitOdile writes a snapshot. A
discard record (ADR 0007) cannot serve: it copies the index file, which may be
a split index, and restores whole working trees rather than one file's stages.

```text
<git-dir>/gitodile/conflicts/v1/<session-id>/
  manifest.json
  files/<sequence>
<git-dir>/gitodile/conflicts/v1/.pending-<unique>/   (never trusted)
refs/gitodile/recovery/v1/conflict/<owner>/<session-id>  -> tree
```

- The manifest (schema version 1) records the session, its origin, the
  operation's heads, every unmerged entry (path, stage, mode, object ID), and
  per path the working state: absent, regular file (bytes in `files/`, with the
  executable bit), symbolic link (target), directory (no contents), or
  `unreadable`/`omitted` when it could not be captured. Missing evidence is
  recorded, never papered over, and makes the manifest `complete: false`.
- Stage objects stay in the object database. A tree built with `mktree`, whose
  entries are the stage blobs, is pinned by a hidden ref in the common
  repository, so `gc` cannot prune an original side after it is resolved. The
  ref points at a tree, not a commit, so it needs no identity. Gitlinks are
  recorded but not pinned; their commits live in another repository.
- Creation runs under the repository write lock, revalidates the state token,
  writes into `.pending-<unique>`, flushes every file and the manifest, and
  publishes with a rename. If a snapshot for the session already exists, it is
  kept: the first snapshot is the original. A crash leaves only a pending
  folder, which is ignored and removed once it is an hour old.
- Total captured bytes are capped at 512 MiB per snapshot; a path past the cap
  is `omitted`, so its unmerged stages can still be reset but not its working
  edits.
- The snapshot is per worktree (its Git directory), and the ref carries the
  worktree's owner ID, as history recovery does. Linked worktrees never share
  sessions or snapshots; they do share the common-directory write lock.
- Retention: the snapshot of a live session is never removed. Snapshots of
  ended sessions are kept for 30 days and at most ten per worktree, and are
  trimmed only when a new snapshot is created, with their refs.
- Privacy: snapshots stay inside the repository's Git directory, are never
  transmitted, and nothing reads them except reset and the recovery center.

The record carries `origin: gitodile | external`. An external origin means
the pre-operation working state is unknown; abort (037-5) must never promise
exact restoration then. This makes the snapshot the first recovery record whose
origin may be outside GitOdile, as the recovery-center seed in `ROADMAP.md`
requires.

### 7. An overlap GitOdile finds becomes a real, paused `git merge`

When task 065-4 integrates a branch or a diverged upstream and `merge-tree`
predicts overlaps, and the user chooses to resolve them, GitOdile starts a real
`git merge` that stops on them, instead of writing stages and `MERGE_HEAD`
itself:

- It refuses first, by name, when there are prepared (staged) changes or an
  unsaved change to a path the merge touches, exactly as `git merge` would
  refuse to protect them, and when another operation is paused.
- It refuses any configured `branch.<name>.mergeOptions`, then runs
  `git -c rerere.enabled=false merge --no-ff --no-commit --no-autostash
  -m <reviewed-title> <commit>`. Explicit flags override `merge.ff` and
  `merge.autoStash`; rerere cannot apply or stage a remembered resolution. Nothing is
  written to the user's Git configuration.
- It writes a start record, then the history recovery point (ADR 0008),
  immediately before the merge, so the session's origin is `gitodile` and the
  pre-merge state is known.
- Once the merge has paused, the session is the same as one started elsewhere:
  the user's editor and other tools see an ordinary merge, `git merge --abort`
  means what it always means, and finishing runs the commit hooks Git runs
  when a paused merge is concluded (`pre-commit`, `prepare-commit-msg`,
  `commit-msg`, `post-commit`; `pre-merge-commit` belongs to `git merge` itself
  and does not run then), honours signing, and is never bypassed unless hooks
  are off in Settings. (Corrected by the amendment in §9.)

This amends ADR 0030's point 7 only for an explicit choice to resolve
overlaps. A clean combine still uses `merge-tree` and `commit-tree`, with every
failure before any change.

### 8. Amendment (2026-10-29): resolving a file, and the journal

Task 037-6 adds the per-file mutations. Each is a local mutation run under
the write lock that revalidates the session epoch, the state token, the path's
stages (mode and object ID per stage) and the action's permission, creates the
snapshot when the session has none, and verifies its own result.

- **Keep a side / delete** writes the working tree only; the index stays
  unmerged. A regular file's content comes from
  `git cat-file --filters --path=<path> <object>`, so line endings, `.gitattributes`
  and LFS behave exactly as a checkout, straight into a temporary file beside
  the target that is flushed and renamed over it. A symbolic link becomes a
  link where `core.symlinks` allows it and a file holding its target where it
  does not, as Git itself writes it. A submodule's side is set in the index
  alone (`update-index --index-info` with mode `160000`), which also marks it
  resolved; its folder is never switched. Delete removes a file or link, never
  a folder.
- **Mark resolved** stages the exact chosen stage (`update-index --index-info`)
  when the working file is still what that choice wrote, because `git add`
  would take the mode from stage 2 where `core.filemode` or `core.symlinks` is
  off. Otherwise it runs `git add` (or `git rm --cached` when the path is gone,
  never touching the disk) with literal pathspecs and checks the entry that
  results. Conflict markers left in a text file refuse unless the user
  confirms; a link, a kind change or an edited mode change needs the side or
  the mode named first.
- **Reset** applies the snapshot's stages to a copy of the index first, proves
  them there with `ls-files -u`, then applies them through
  `update-index --index-info`, which replaces the live index under Git's own
  `index.lock`; the working content comes back from `files/<sequence>` after its
  SHA-256 is checked. Missing evidence refuses, or resets the stages alone when
  the user asks for that.

The first snapshot stays the original, so what the user writes after it would
be lost by a later action. Each record therefore gains a **journal**:

```text
<git-dir>/gitodile/conflicts/v1/<session-id>/journal/
  journal.json          (schema 1, replaced by a rename on every append)
  files/<sequence>
refs/gitodile/recovery/v1/conflict/<owner>/<session-id>-journal  -> tree
```

Before an action replaces a working file whose bytes are neither the
snapshot's nor what an earlier action wrote, the bytes are copied into the
journal; index entries it replaces that the snapshot does not pin are pinned
by the journal's tree. Each entry records the path, the action, the replaced
evidence and what the action left on disk (kind, size, modification time,
SHA-256), which is how a kept side is recognised until the file is edited
again. The journal is bounded like the snapshot, at 512 MiB; an action whose
replaced content would not fit refuses and changes nothing. It is removed with
its record.

A rename over a file another program holds open fails on Windows; the action
reports `file_locked`, removes its temporary file and changes nothing. A
program that opened the file without sharing refuses even the read that
copies it into the journal; that is `file_locked` too, before anything
changes (found by the 037-7 audit).

**Opening a file in the user's own application** (task 037-6-3) uses the
system's default application for the file's type, never `GIT_EDITOR` or
`core.editor`, which are shell command lines. It reaches the file through the
same exact-path check as every write: inside the project, spelled on disk as
Git spells it, no folder of it a link, a regular file. A type the system would
run, install or follow instead of opening is refused before anything else
happens (`file_runs_as_program`) and the reader is offered the folder: on
Windows every `PATHEXT` extension plus shortcuts, installers, registry files,
scripts and control-panel items; on macOS applications, `.command`, `.tool`,
installer packages and location files; on Linux `.desktop`, AppImages and
`.run`; and on macOS and Linux any file with an executable bit. A conflicted
script that runs as a program is therefore shown in its folder rather than
opened. Opening takes the session's snapshot first when there is none, as
before any change: the reader's editor is where the next change comes from,
and an edit made there before the first GitOdile action would otherwise
become the original that Reset returns to. It changes neither the index nor
the file, and never implies resolution.

**What the reader did there** is read back from fresh state: the watcher
reports the edit, the session token moves and the file becomes
`editedOutside`. For such a file the screen asks
`check_conflict_working_file` once per token, a bounded read (32 MiB, the same
scan as Mark resolved) that answers markers found, none, or why it cannot say
(binary, UTF-16, too large, unreadable). It decides nothing: Mark resolved
still refuses on markers until the reader confirms.

**A path that equals another overlapping path but for case** is a collision
only where the file system ignores case, which one `stat` of the Git
directory's name with its case flipped tells. Both paths get no whole-file
choice, since writing either would land on the other; every write and open
also proves the name on disk is spelled exactly as Git spells it
(`conflict_case_collision`). Paths that differ in a folder's case, or only in
Unicode normalization, are caught by that write-time check rather than the
facet.

### 9. Amendment (2026-10-29): finishing and abandoning the merge

Task 037-5 adds the two session-level actions. Each has its own read-only
plan with a token, separate from leaving the screen, saving a version and
marking a file resolved, and neither publishes.

- **Finish** (`plan_finish_merge`, `finish_merge`, a history mutation) is
  allowed only when the session's listing is complete and nothing is
  unmerged. Its token adds `HEAD` and `git diff-index --cached --raw -z
  --no-renames HEAD` to the session token, so any change to what would be
  saved moves it. It runs `git commit -m <message>`, so Git takes the parents
  from `MERGE_HEAD`, runs the hooks of §7 and honours `commit.gpgSign`;
  `--no-verify` is passed only when hooks are off in Settings. The message
  starts from `MERGE_MSG` with its comment lines dropped. Nothing touches the
  index before the commit, so a hook, signing or identity failure leaves every
  resolution staged and the merge paused, and a retry is a new plan. The plan
  counts unsaved files with `git diff --name-only` (content, not file times)
  and names resolved files edited after they were marked, whose edits the
  version leaves out.
- **Abandon** (`plan_abort_merge`, `abort_merge`, destructive) promises an
  **exact** return only when the session's origin is `gitodile` and its
  snapshot is complete; every other merge is **best effort**, and the plan says
  that Git keeps the unsaved changes it can and refuses rather than overwrite
  one. Before Git runs, GitOdile takes the snapshot if there is none, records
  each unmerged path's stages and unsaved bytes in the journal as `abandon`
  entries, and keeps the rest of the index (built on a copy with the unmerged
  paths removed, then `write-tree`) under
  `refs/gitodile/recovery/v1/conflict/<owner>/<session-id>-abandoned`, recorded
  in the journal as `abandonedIndex` and trimmed with the record. It then
  refreshes the index's file times (`update-index -q --refresh`: an entry Mark
  resolved staged through `--index-info` has none, and Git's reset would take
  its untouched file for an edit) and runs `git merge --abort`.
- **Verification ignores Git's exit status.** Finishing is done when `HEAD`'s
  parents are the paused `HEAD` and the merge head, `MERGE_HEAD` is gone,
  nothing is unmerged and the index is `HEAD`'s tree; it changed nothing when
  `HEAD` and `MERGE_HEAD` are as they were, and the commit's failure is
  classified as Save version's is. Abandoning is done when `HEAD` never moved,
  `MERGE_HEAD` is gone and nothing is unmerged (and, for an exact return, the
  index is `HEAD`'s tree); a refusal that left the session token unchanged is
  `merge_abort_refused`. Anything else is `merge_outcome_uncertain`, reported
  with the observed `HEAD`, parents and markers, never repaired, and every
  snapshot, journal and ref is kept. A restart reads whatever Git left like
  any other state.

### 10. Amendment (2026-10-30): durable initiation of an overlapping merge

Task 065-4-2 adds `start_overlapping_merge`. Its source is either a branch
(`{kind: "branch", source: IntegrationSource}`) or the configured upstream
(`{kind: "upstream"}`). The branch uses Bring in changes' token and recovery
operation; the upstream uses Get's token and `get-team-changes` recovery.
There is no fetch. The IPC adapter validates the project epoch; execution is
a history mutation under the common-repository write permit, including the
snapshot and verification. Only saved-version overlaps can start this way.
Unsaved overlaps still require saving or discarding first.

The durable prefix, in order, is a **start record**, verified history recovery
(ADR 0008), then the real Git merge of §7. The record lives at:

```text
<git-dir>/gitodile/conflicts/v1/starts/<recovery-id>.json
```

Schema 1 records its ID, owner, timestamp, current branch and HEAD, source ref
and commit, reviewed title and token, history recovery ref, all predicted
unmerged paths and fingerprints of the carried work (relative path, type,
executable bit and SHA-256). It stores neither absolute paths nor file
contents. Files, links and the contents of carried untracked directories are verified
without following links, bounded at 512 MiB, 5,000 entries and 128 nested
directories per path; a capture beyond a bound refuses before Git runs. Directory enumeration is
bounded before collecting entries, and the streaming file buffer is kept out
of recursive frames. Ignored caches outside the footprint are not scanned:
the collision check proves that Git's merge cannot write to those paths, and
a dependency cache must not consume the conflict capture budget.
The JSON is capped at 16 MiB.
A temporary file is flushed and published create-only through a hard link
in the same directory, then read back; an existing ID is never replaced.
Outcome updates use a flushed temporary file and rename.

The session reader remains read-only. The newest matching record for that
worktree establishes `origin: gitodile` only while active, when its previous
HEAD and incoming commit match the paused HEAD and sole MERGE_HEAD, including after termination
between Git and the conflict snapshot. The unique start ID also participates
in the session ID: abandoning and restarting the same pair of heads must not
reuse an earlier attempt's snapshot or journal. External sessions keep §5's
identity. The start metadata participates in the state token. Every subsequent
resolver action that takes the first snapshot propagates this origin.

Starting refuses all staged work, unsaved work on any affected path,
untracked/ignored collisions (including path-component and rename endpoints),
an existing paused operation, sparse/unsupported history setups, an index
lock and any branch mergeOptions, including an empty value. The conflict
prediction retains merge-tree's provisional tree and exact per-path stages;
its digest participates in both existing plan tokens. The provisional tree's changes from HEAD,
their rename endpoints and unresolved paths define the safety footprint.

Verification does not trust Git's exit code. A pause needs unchanged HEAD and branch,
exactly the reviewed MERGE_HEAD, a complete unmerged listing with exactly the
predicted paths, stages, modes and object IDs, and unchanged carried work.
Every stage-0 entry outside the conflicts must also match the provisional
tree, including modes and paths; a missing or extra entry is uncertain.
The actual pause is snapshotted under the same permit even when its stages
or carried work differ from the forecast, preserving the first conflict
bytes before returning an uncertain result. Success requires a complete
snapshot; history recovery is verified again. A snapshot or verification
failure is `merge_outcome_uncertain`, with the merge left as Git left it.
A refusal is `merge_start_refused` only when HEAD, logical index entries,
operation markers (including ORIG_HEAD), affected working files and carried
work are proven unchanged. Unreadable evidence is uncertain. There is no
automatic abort, repair, retry, stage, commit or publish.

Records distinguish pending, paused, ended, refused, uncertain and
ended-uncertain attempts. Only pending/paused/uncertain records establish
origin: a merge GitOdile has already ended cannot claim a later external
merge between the same heads or reuse its old snapshot. A live
record never expires. Verified ended/refused attempts follow the conflict
owner's 30-day/ten-record retention, trimmed only when another start is
written. A newer ended or refused record is also retained while it retires an older
pending/uncertain record for the same heads; otherwise expiring the end could
revive that ambiguous attempt's origin. Pending/uncertain/ended-uncertain,
corrupt and unsupported records stay for inspection. Abandoned temporary files are removed after an hour. History
retention protects refs named by live or pending/uncertain starts across all
linked worktrees, and conservatively protects unknown evidence. A verified
Finish or Abandon records an explicit ended state and releases interruption
protection. If the merge ended but carried evidence differs, ended-uncertain
retains protection without claiming a future session. Failure to publish the
end is reported as uncertain and leaves the old evidence protected.
Abandon's exact-result verification also checks the recorded carried work: the plan promises best effort if later
edits made that evidence differ, and a change to that promise invalidates the
plan token. Exact execution verifies the carried work again after Git runs.
It never discards those later edits.

## Consequences

- One read path serves merges from GitOdile, a terminal, an editor or an agent,
  and the explanation of the operations GitOdile cannot continue.
- Every mutation in 037-6 and 037-5 has a token to revalidate and an original
  to return to, including when the merge was started elsewhere.
- Rename conflicts are shown per path. That is honest and safe, but less
  helpful than a linked rename view; a later task can add one without changing
  the snapshot.
- Snapshots of large conflicted files cost disk inside `.git` until they
  expire, bounded per snapshot and per worktree.
- A GitOdile-started merge can leave `MERGE_HEAD` behind if the app stops
  mid-merge. That is an ordinary paused merge, which the resolver reads like
  any other.

## Alternatives considered

- **Build the session from `merge-tree` output** by writing stages into the
  index and creating `MERGE_HEAD` ourselves. This avoids `git merge`'s refusals
  and configuration, but reimplements what `git merge` writes (`MERGE_MSG`,
  `MERGE_MODE`, `AUTO_MERGE`, conflict-marker content, rename residue) and
  leaves a state that other tools could read differently from Git's own.
- **Trust conflict markers in the working tree.** They can be edited, appear in
  files that are not conflicted, and cannot describe a deletion, a mode change,
  a symbolic link or a submodule.
- **Copy the index file into the snapshot**, as discard recovery does. A split
  index keeps entries in a shared file, and the copy would restore every path
  instead of one file's stages.
- **Pin stage objects with a commit.** A commit needs an identity and a message
  and would appear in history tools; a tree ref needs neither.
