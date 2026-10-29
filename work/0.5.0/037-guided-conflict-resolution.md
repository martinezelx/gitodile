---
id: 037
title: Resolve overlapping changes at GitHub Desktop level, safely
status: active
priority: high
type: epic
areas:
  - conflicts
  - frontend
  - rust
  - recovery
  - accessibility
created: 2026-08-08
completed:
---

# Scope change (2026-10-27)

The original epic asked for an IntelliJ/VS Code-quality three-way editor. By
user decision, `1.0.0` targets GitHub Desktop's level instead: understand the
conflict, choose one whole side per file or edit it in the user's own editor,
mark it resolved, and finish or abort the merge with a plan. Every safety rule
of the original epic is kept. The three-pane editor, per-region choices and the
editor dependency spike move after `1.0.0` to epic
[206](../after-1.0/206-three-way-conflict-editor.md), with tasks
[037-2](../after-1.0/037-2-editor-foundation-spike.md) and
[037-4](../after-1.0/037-4-resolve-text-conflicts.md). The original text is in
Git history.

# Goal

Let a user understand, resolve, finish, or safely abandon a conflicted merge
without leaving GitOdile and without interpreting conflict markers or index
stages, at the level of GitHub Desktop and with GitOdile's recovery model.

The first implementation resolves ordinary Git merge conflicts. Its domain
model stays extensible to rebase, cherry-pick, revert, stash-apply and patch
conflicts, but their continue/skip/abort workflows are not implemented here.
Those other paused operations are still **detected and explained read-only**
(decided 2026-10-27): coding agents rebase, cherry-pick and pop stashes often,
and GitOdile must never be blind to the state they leave behind.

# User outcome

When two sets of work overlap, the user can:

- see that a merge is paused, which branches are involved, and that their work
  is safe;
- find every affected file and understand, in plain language, what kind of
  overlap it is;
- inspect what each side changed in that file using real branch names rather
  than `ours`/`theirs`;
- keep the current or the incoming version of a whole file, or open it in their
  own editor and come back;
- mark a file resolved, and reset a file to its original overlap if they change
  their mind;
- finish the merge through a plan that shows the saved version it creates, or
  abort it through a plan that says what can and cannot be restored;
- leave and resume later without cancelling anything;
- when a rebase, cherry-pick, revert or stash apply is paused instead of a
  merge, see what is paused, which files overlap, that GitOdile cannot finish
  it yet, and how to finish or abort it with the tool that started it.

# Context

Conflict resolution is where a beginner most needs technical truth translated
into a safe workflow, and where coding agents leave people most often: a merge
an agent started and abandoned is a primary case, not an edge case.

Today GitOdile detects conflicted status entries, orders them first, gives
Overview a `conflicts` state with a list of conflicted files
(`src/features/overview/`), shows a conflict-specific diff state in the
Changes tab of the Workbench screen, detects Git operations in progress and
blocks save/branch operations while conflicts remain. It does not read index
stages, keep a resolution session, stage a result, complete a merge or abort
one.

GitOdile's own team integration (task 161,
[ADR 0030](../../docs/adr/0030-forecast-and-combine-project-changes.md))
forecasts with `git merge-tree` and builds the merge version with
`git commit-tree`. It never leaves a paused `git merge` behind, and it refuses
real overlaps by name. Task 037-1 must decide how an overlap GitOdile itself
detects (from 161 or 065-4) becomes a resolvable session; see its scope.

## Navigation

**No permanent navigation entry for conflicts.** A conflict is a temporary,
paused operation, not a place.

1. Overview's existing `conflicts` state leads with **Resolve overlapping
   changes** and the progress.
2. The Changes tab of the Workbench groups conflicted files first and offers the
   same action instead of a passive note.
3. A merge started inside GitOdile that pauses on overlaps explains the pause
   and offers to open the resolver.
4. A merge started outside GitOdile (a terminal, an editor, a coding agent) is
   detected through repository invalidation; the app shows a non-destructive
   attention state and the user decides when to open the resolver.
5. The search palette offers **Continue resolving overlapping changes** only
   while a supported session exists.
6. The resolver is a project-scoped screen registered in `src/app/screens.tsx`
   but kept out of the navigation rail. Back returns to the originating screen
   and cancels nothing. **Leave** and **Abort merge…** are always separate.

## Interaction structure

A focused screen on the Friendly Sheet
([ADR 0032](../../docs/adr/0032-one-sheet-per-screen.md)):

```text
┌ Resolve overlapping changes ─ 2 of 5 files resolved ────────────────┐
│ Merge paused: feature/login → main          [Leave] [Abort merge…]  │
├───────────────┬──────────────────────────────────────────────────────┤
│ File list     │ src/login.ts — both branches changed this file       │
│ ✓ resolved    │ [What main changed] [What feature/login changed]     │
│ ● selected    │  (read-only diff, existing renderer)                 │
│ ○ unresolved  │ [Keep main's version] [Keep feature/login's version] │
│               │ [Open in editor]  [Mark resolved]  [Reset this file] │
└───────────────┴──────────────────────────────────────────────────────┘
                                         [Finish merge…] (when none left)
```

- Each side's change is shown against the common base with the existing typed
  diff renderer. No three-pane editor and no editor dependency in `1.0.0`.
- Narrow windows use the established list/detail transition of the Changes tab.
- Never rely on hover, colour or horizontal scrolling to reveal an action.

# Scope

## 1. Conflict domain and session model

- An operation-neutral conflict domain that represents `merge` now and can
  represent `rebase`, `cherryPick`, `revert`, `stashApply` and `applyPatch`
  later without changing file-side semantics, plus externally started
  conflicts with no trusted pre-operation snapshot.
- Model the operation, source refs/commits, common base, merge head(s), start
  origin, repository/session epoch, state token, recovery evidence, progress
  and allowed next actions.
- Per-file states: `unresolved`, `editedOutside`, `markedResolved`, `stale`,
  `unsupported`.
- Human labels come from operation roles and actual refs, never only from
  `ours`/`theirs`.
- Git's unmerged index entries are authoritative; working-tree markers are not.
  Read stages 1–3 through bounded, machine-safe plumbing (`git ls-files -u -z`
  and batched object reads). A missing stage is valid.
- Preserve raw bytes, object IDs, modes, symlink information and paths; treat
  repository content and names as untrusted. Bound payloads and read content
  lazily per file.
- Persist only the minimum metadata needed to resume; fresh Git state stays
  authoritative after a restart.

## 1b. Other paused operations, read-only

- Detect a paused rebase (`rebase-merge/`, `rebase-apply/`), cherry-pick
  (`CHERRY_PICK_HEAD`), revert (`REVERT_HEAD`), and unmerged entries with no
  operation marker (for example after `git stash pop` or `git checkout -m`),
  including in linked worktrees.
- Show them in the same contextual entries and screen, read-only: the operation
  in plain language, its step when Git exposes one, the overlapping files, and
  what each side changed where the roles are known.
- Offer no resolution, finish or abort action for them. Explain that GitOdile
  cannot finish this operation yet, that nothing is lost by leaving it, and how
  to continue or abort it with the tool that started it; technical details show
  the exact Git commands. Never run those commands for the user.
- Keep blocking incompatible GitOdile mutations while any operation is paused,
  as today, with this explanation instead of a generic one.

## 2. Conflict classes

Represent and test text content, add/add, modify/delete and delete/modify,
rename/rename, rename/delete, file/directory, mode, symlink, binary,
submodule/gitlink, missing base, paths with spaces/newlines/non-ASCII/
decomposed Unicode/case-only collisions, line-ending and encoding variants, and
multiple merge heads (detected and explained, octopus resolution blocked).

Every class gets a safe whole-file path or an explicit, honest limitation.
"Complete" does not mean every byte sequence can be merged.

## 3. Resolving a file

- **Keep current version** / **Keep incoming version** for the whole file,
  **Delete** where that is a valid side, and the valid rename destinations. Each
  binds exact stage objects, modes and paths, and shows a scoped preview when it
  discards one side's content.
- **Open in editor** launches the user's editor or file manager. Launching is
  never resolution: GitOdile re-reads the file and, if it still has conflict
  markers, says so before marking it resolved.
- **Mark resolved** updates the index (`git add`/`git rm` with path-separated
  arguments); the first time, explain it in plain language, and show the exact
  behaviour in technical details.
- **Reset this file** restores its original unmerged stages and content from the
  session snapshot, with confirmation, and refuses if newer work cannot be kept.
- No "accept everything from one side" without a file count, consequences,
  confirmation and a recoverable pre-state. No silent or suggested automatic
  resolution.

## 4. Safe writes, staging and recovery

- Writing a chosen side and marking resolved are local mutations; finishing is a
  history mutation; abort is classified by what it can change.
- Every mutation takes the repository coordinator lock and revalidates identity,
  epoch, operation, path, object IDs, file and session tokens just before it
  runs. Writes are atomic where the filesystem allows and preserve mode,
  symlink, line endings and unchanged bytes. Windows file locks and uncertain
  outcomes are reported, never hidden.
- Before the first mutation, create a durable conflict-session snapshot of the
  unmerged index stages plus working content and mode, enough to reset a file,
  recover a failed write, and tell a GitOdile-started merge from an external one
  whose original dirty state is unknown. Its storage, lifetime, cleanup,
  privacy and linked-worktree behaviour are fixed by the 037-1 ADR. A branch or
  commit ref alone is not enough.
- Index stages are restored through a validated temporary-index strategy, never
  by patching the live index from the frontend.
- The snapshot is a recovery record whose origin may be outside GitOdile; keep
  it compatible with the recovery-center seed in
  [`ROADMAP.md`](../../docs/ROADMAP.md#design-seeds-in-100). Until the recovery
  center ships in `0.6.0`, the resolver itself names the snapshot and how to
  use it.

## 5. Finishing the merge

- **Finish merge…** is enabled only when a fresh backend read finds no unmerged
  entries.
- The plan shows the branches/commits, resolved file count, the saved version
  that will be created, hooks/signing implications, the recovery evidence, and
  that nothing is published.
- Explicit confirmation; revalidate everything immediately before completing.
- Reuse identity, message, hook, signing, structured-error, recovery and
  invalidation contracts. Never bypass hooks or signing.
- A hook/signing/identity failure keeps every resolved file and allows a retry.
- Verify `HEAD`, operation markers, index, working tree and recovery evidence
  before showing success, then return to Overview with a link to the new saved
  version. Publishing stays separate.

## 6. Leaving and aborting

- **Leave** only navigates away and says the merge stays paused.
- **Abort merge…** opens a Rust-produced plan: affected files/index/history,
  known pre-merge state, available snapshot, and whether exact reconstruction
  can be guaranteed. Explicit confirmation; revalidate; then `git merge --abort`
  or a safer equivalent justified by the 037-1 ADR.
- Never promise exact restoration of an externally started merge that had
  uncommitted changes. On an uncertain outcome keep every snapshot and report
  the observed state; no destructive "repair".

## 7. Integration with the app

- Register the resolver in `src/app/screens.tsx` through the feature
  descriptor/runtime; lazy loading, palette action, open-project guard,
  keep-alive and project-scoped eviction come from that one registration.
- Keep session state in the originating project session; switching projects
  cannot move progress, drafts, errors or announcements.
- Visibility never triggers a fetch; activation, explicit refresh, operation
  results and typed invalidations own freshness. Coalesce watcher bursts from
  writes and staging without hiding external changes.
- Rust rejects incompatible mutations while a merge is paused, even if the UI is
  bypassed. Overview and the Changes tab read the same cached session summary.
- English and Spanish copy together. Simple mode says "overlapping changes";
  technical details name merge, stages, refs, object IDs and exact commands.

## 8. Accessibility, performance and diagnostics

- Full keyboard operation with visible focus and focus return; restrained
  announcements of progress and results; meaning never by colour alone.
- Both themes, reduced motion, text scaling and forced colours where the WebView
  exposes them.
- Bounded processes, output, IPC and DOM: the file list is virtualized and
  thousands of conflicted files stay responsive. Reads are cancellable; a
  cancelled mutation reports whether it changed anything.
- Diagnostics may contain object IDs, phases and bounded Git errors, never
  source content, credentials or unbounded hook output.

## 9. Delivery slices

1. [037-1](../done/037-1-conflict-domain-and-recovery.md): session ADR, classification,
   stage reader, snapshot, paused-operation detection, and how
   GitOdile-detected overlaps become sessions.
2. [037-3](../done/037-3-read-only-conflict-workspace.md): contextual entry, file list,
   per-side read-only view, and the read-only view of other paused operations.
3. [037-6](037-6-resolve-files.md): whole-side choices, open in editor, mark
   resolved, reset.
4. [037-5](../done/037-5-complete-or-abort-merge.md): finish and abort plans.
5. [037-7](037-7-conflict-workflow-audit.md): end-to-end audit.

Slices may land behind honest disabled affordances or a development flag. Do not
ship a resolver that can change files but cannot reset, finish or abort.

# Out of scope

- The three-pane editor, per-region choices, in-app text editing of a result
  and the editor spike: epic [206](../after-1.0/206-three-way-conflict-editor.md).
- Initiating merges; task 065-4 owns that.
- Continue/skip/abort or resolution for rebase, cherry-pick, revert,
  stash-apply or patches; they are only detected and explained (§1b).
- Octopus merges, recursive submodule resolution, semantic merges.
- Automatic or silent resolution, and an AI resolver.
- Provider pull-request conflict resolution, cloud editing, publishing.
- Changing the user's `merge.tool`, `merge.conflictStyle`, editor, line-ending,
  attribute, hook or signing configuration.
- The recovery center screen (task 065-5, `0.6.0`).

# Acceptance criteria

## Product and navigation

- [ ] Conflicts are reachable from Overview, the Changes tab, the search
      palette and an app-started merge, with no navigation-rail entry.
- [ ] Leaving the resolver never aborts, stages, discards or completes anything.
- [ ] Simple mode uses plain language and real branch names; technical details
      show the exact operation, refs, commits, stages and commands.
- [ ] The screen follows the Friendly Sheet system in light and dark themes and
      at wide and narrow sizes.

## Domain and recovery

- [ ] A typed session distinguishes origin, roles, state, allowed actions,
      recovery evidence, file states, epochs and stale tokens.
- [ ] Index stages, not markers, are the source of truth; content is read lazily
      within explicit bounds.
- [ ] Every conflict class in Scope has a tested whole-file path or an honest
      limitation that cannot corrupt content, index, path or mode.
- [ ] Opening, refreshing or revisiting the resolver never writes anything.
- [ ] Paused rebase, cherry-pick, revert and marker-less unmerged states are
      detected, explained read-only with their files, and never offered an
      action GitOdile cannot complete safely.
- [ ] A durable, documented snapshot exists before the first mutation and can
      restore a file's original stages and content.
- [ ] External edits, restarts, watcher bursts, project switches, linked
      worktrees and concurrent IPC calls cannot silently lose or cross state.
- [ ] No conflict is resolved silently; bulk choices need consequences,
      confirmation and recovery.

## Finish and abort

- [ ] Finishing requires a fresh Rust check with no unmerged entries and a
      confirmed history-mutation plan.
- [ ] Finishing runs hooks and signing normally, verifies the result and never
      publishes.
- [ ] Hook, signing, identity, drift, lock and verification failures keep
      resolved work and allow a retry or recovery.
- [ ] Abort has its own plan and never promises exact recovery without evidence.
- [ ] Partial or uncertain outcomes keep recovery artifacts and report observed
      state without automatic repair.

## Quality

- [ ] Keyboard, focus, announcements, colour independence, both themes, reduced
      motion, text scaling, English and Spanish are audited.
- [ ] The resolver is lazy and does not regress startup or screen switching.
- [ ] Windows desktop validation passes; macOS and Linux are covered where
      available, with concrete residual risks.
- [ ] An independent end-to-end audit covers resolve, reset, resume, finish,
      abort, recover and restart from a real conflicted repository.

# Required tests

- **Rust unit:** unmerged-index parsing for every stage shape and class, role
  mapping, tokens and epochs, snapshot manifest and temporary-index
  reconstruction, atomic writes, finish/abort planners and structured errors.
- **Rust integration (temporary repositories, real Git):** every conflict class;
  merges started inside and outside GitOdile with clean and dirty pre-states;
  keep side, mark resolved, reset, restart/resume, finish, abort, failed abort
  and snapshot recovery; hooks, signing, missing identity, file locks,
  non-ASCII/newline paths, CRLF, non-UTF-8 bytes, linked worktrees, concurrent
  mutations and stale epochs; byte-for-byte preservation outside intended paths.
- **Frontend:** entry points and absence from the rail, file list states and
  progress, side choices, open-in-editor reconciliation, mark/reset, leave,
  finish and abort, project-switch isolation, all states in both locales,
  keyboard and focus.
- **Desktop:** real Tauri workflow on Windows plus available platforms, external
  edits while open, forced close at each mutation boundary.

# Relevant files

- `AGENTS.md`, `DESIGN.md`, `docs/PRODUCT_STRATEGY.md`, `docs/ARCHITECTURE.md`,
  `docs/ROADMAP.md`
- [ADR 0030](../../docs/adr/0030-forecast-and-combine-project-changes.md)
- `src/app/screens.tsx`
- `src/features/overview/`
- `src/features/changes/`
- `src/features/workbench/`
- `src-tauri/src/status.rs`
- `src-tauri/src/recovery/`
- `src-tauri/src/sync/`
- `src-tauri/src/index.rs`

# External references

- [Git: `git merge`](https://git-scm.com/docs/git-merge): index stages,
  operation markers, continue/abort, and the limit of abort after dirty changes.
- GitHub Desktop's conflict dialog: per-file whole-side choice, open in editor,
  continue or abort. Reference for scope, not a specification.
- [GitButler: Operations History](https://docs.gitbutler.com/features/timeline):
  pre-operation snapshots; reuse the principle, not its storage model.

# Dependencies

- The modular architecture (tasks 022–031) is complete.
- Task 161 / ADR 0030 refuses real overlaps today; 037-1 defines how they
  become sessions, and task 065-4 starts merges that can overlap.

# Decisions

- 2026-10-27: `1.0.0` resolves conflicts at GitHub Desktop level with
  GitOdile's safety model; the three-pane editor is epic 206 after `1.0.0`.
- No permanent navigation entry; contextual entries and a transient screen.
- Merge conflicts first; roles and states designed for future operations.
- 2026-10-27: other paused operations are detected and explained read-only,
  never resolved, so GitOdile is not blind to what a coding agent leaves.
- Index stages are truth; opening the resolver is read-only.
- Keep side, mark resolved, reset, finish, leave and abort are separate actions.
- A conflict-session snapshot precedes any mutation.
- No silent resolution, one-side bulk acceptance without a plan, Git-config
  rewrite, hook or signing bypass, automatic publish, or AI transmission.

# Implementation notes

Record child-task results, ADRs, module and port paths, IPC shapes, snapshot
format and retention, the state machine, invalidation rules, Git commands and
process counts, and platform deviations.

- 037-1 (2026-10-28): [ADR 0041](../../docs/adr/0041-conflict-sessions-and-their-recovery.md)
  fixes the session, roles, token, snapshot and the paused-`git merge` start
  for GitOdile-detected overlaps. `src-tauri/src/conflicts.rs` and
  `recovery/conflict.rs`; IPC `read_conflict_session` and
  `read_conflict_stage`. Details, caps and process counts are in
  [037-1](../done/037-1-conflict-domain-and-recovery.md).
- 037-3 (2026-10-28): the read-only overlapping-changes screen,
  `src/features/conflicts/`, registered without a rail entry and reached from
  Overview, Changes, the palette and the dialogs that refuse for a paused
  operation; a third read, `read_conflict_side_diff`, draws each side against
  the base with the Changes diff renderer, both sides at once as two columns.
  Details in [037-3](../done/037-3-read-only-conflict-workspace.md).
- 037-6-1 (2026-10-29): 037-6 split into three slices. The Rust half of
  resolving a file: `resolve_conflict_side`, `mark_conflict_resolved` and
  `reset_conflict_file` in `src-tauri/src/conflicts/resolve.rs`, and the
  resolution journal beside the snapshot (ADR 0041 §8). Details in
  [037-6-1](../done/037-6-1-resolution-core.md).

- 037-5 (2026-10-29): finishing and abandoning the merge,
  `src-tauri/src/conflicts/merge.rs` (`plan_finish_merge`, `finish_merge`,
  `plan_abort_merge`, `abort_merge`), the session header's actions and two
  dialogs in `src/features/conflicts/MergeDialogs.tsx`, and the status's
  `pausedOperation` so a merge whose files are all resolved is still found.
  ADR 0041 §9. Details in [037-5](../done/037-5-complete-or-abort-merge.md).

# Validation

Each child records its focused checks. The epic closes only after every
criterion and the independent end-to-end audit pass, with `pnpm run check`
green.
