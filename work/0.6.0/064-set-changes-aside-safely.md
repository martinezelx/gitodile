---
id: 064
title: Set changes aside and restore them safely
status: active
priority: high
type: epic
areas:
  - changes
  - rust
  - frontend
  - recovery
  - conflicts
  - accessibility
  - performance
created: 2026-08-18
completed:
---

# Goal

Add an interoperable, plain-language stash workflow that lets users temporarily
remove unfinished work from the project, inspect every saved set later, restore
it without silently losing its safety copy, and deliberately remove entries
through a recoverable plan.

# User outcome

The user can set all or selected changes aside, continue with a clean project,
and later understand, preview, restore, or remove any saved set without needing
to know Git's stash stack, reflog syntax, index semantics, or conflict behavior.

# Context

GitOdile already uses **Set changes aside** as its simple-mode wording for
`git stash`, but no workflow exists. Branch switching and team updates
correctly refuse to hide or move unsaved work automatically, so users currently
have to save an unfinished version or leave the app.

The product problem is broader than exposing `git stash` as a button:

- creating a stash changes `refs/stash`, the real index, and the working tree;
- `refs/stash` is shared by linked worktrees, while the files being removed
  belong to one selected worktree;
- older entries live in the `refs/stash` reflog and their numeric selectors
  change whenever another entry is created or removed;
- stashes created by the CLI and other clients must remain visible and usable;
- applying a stash can overlap with current files and leave conflicts;
- `pop` couples restoration to deletion, while `drop`/`clear` can make work
  unreachable and eventually impossible to recover;
- `--include-untracked` removes new files from the worktree and has documented
  edge cases around ignored descendants, so it needs exact preflight rather
  than a reassuring label alone.

## Competitive findings

- [GitHub Desktop](https://docs.github.com/en/desktop/making-changes-in-a-branch/stashing-changes-in-github-desktop)
  presents stashing as temporary work, keeps it close to Changes, and offers a
  clear restore/discard choice. Its one-stash/all-changes limit is approachable
  but does not meet GitOdile's interoperability or progressive-power goals.
- [GitKraken Desktop](https://help.gitkraken.com/gitkraken-desktop/stashing/)
  supports multiple named entries, apply versus pop, list management, and
  file-level partial stashes. This is a useful completeness benchmark, but its
  graph-first and Git-first presentation is too technical for the default UI.
- [Tower](https://www.git-tower.com/help/guides/working-copy/stash/windows)
  gives stashes a browsable list/detail view and exposes index restoration. Its
  warning about ignored content beneath untracked directories is a safety case
  GitOdile must test and block when it cannot prove preservation.
- [GitButler](https://docs.gitbutler.com/guide) avoids this context-switching
  problem with parallel applied branches. The reusable principle is to keep
  unfinished work visible and reversible; adopting its workflow model is not
  appropriate for this bounded GitOdile feature.
- The authoritative behavior remains the
  [`git stash` documentation](https://git-scm.com/docs/git-stash): stashes are
  standard commits rooted at `refs/stash`, `apply` keeps the entry, `pop` may
  conflict, and dropped/cleared entries have no dependable normal recovery.

# Product and interaction direction

Use a hybrid of the best competitor behaviors without copying any product:

- Keep creation as simple and contextual as GitHub Desktop: **Set changes
  aside...** lives in the existing Changes actions menu and command palette.
- Manage the full standard Git stash stack like Tower/GitKraken: multiple
  entries, user-provided names, bounded list/detail inspection, and explicit
  restore/remove actions.
- Keep management inside the Changes work surface. Add a compact switch between
  **Current changes** and **Saved for later (N)** above the existing list/detail
  layout; do not add another top-level navigation destination and do not mix
  user-created stashes into the future Recovery screen.
- Use standard system-Git stashes so the CLI and other clients remain
  interoperable. App metadata may enrich entries created by GitOdile, but the
  feature must remain correct when metadata is absent, stale, or deleted.
- Restore with `apply --index`, not `pop`. Keep the stash until the user removes
  it in a separate action, so a successful-looking restore never destroys the
  only safety copy.
- Never auto-stash before switching a branch, getting project changes,
  publishing, closing a project, or quitting. Those flows may link to this
  explicit action, but they must not invoke it silently.

# Scope

## Standard stash discovery and detail

- Add a narrow Rust stash domain (for example `stashes.rs`) and a feature-owned
  frontend contract rather than placing workflow logic in `changes.rs`,
  `ipc.rs`, `main.tsx`, or a visual component.
- Read the complete standard `refs/stash` reflog, including entries created by
  GitOdile, the CLI, and other clients. Do not invent a parallel private stash
  namespace for the primary data.
- Return a bounded, paginated, snapshot-aware `SetAsidePage`. Each entry has:
  - the stash commit ID and a display selector;
  - a stable action identity that does not rely on `stash@{n}` remaining fixed;
  - bounded message, creation time, base commit, and parent structure;
  - originating branch/worktree only when evidence makes it known;
  - changed-file totals and tracked/new/prepared-state evidence;
  - truncation, unsupported, and metadata-confidence flags.
- Treat reflog messages, commit messages, identities, paths, and metadata as
  untrusted. Use delimiter-safe/NUL-safe output and explicit caps; never parse
  the default human `git stash list` string.
- Selecting an entry loads its changed-file list and readable diff on demand.
  Reuse the established Changes diff domain/renderer through a public contract
  or extract only a genuinely shared primitive; do not build a third patch
  parser or an unbounded all-stashes payload.
- Include tracked, staged, untracked, binary, too-large, renamed, deleted,
  symlink, submodule, malformed, missing-object, and externally deleted states.
  Unsupported content remains visible with a truthful explanation.

## Plan and create “Set changes aside”

- Offer two explicit scopes when applicable:
  - **All current changes**: every item in the authoritative current status,
    never only the search results or visible virtual rows;
  - **Selected files**: the exact checked file selection already used by the
    Changes workflow, with rename source/destination paths bound into the plan.
- Accept an optional short name and generate a local, non-AI default when it is
  empty. Show the exact Git stash term and commit/ref evidence only under
  technical details.
- The default all-changes scope includes tracked, prepared/staged, and new
  untracked files because they are all presented as current work in GitOdile.
  Ignored files are never included. The plan must state exact counts, which
  prepared state will leave the index, that files will temporarily leave the
  project, that no branch commit or remote will change, and where the standard
  stash can be found.
- Before using `--include-untracked`, enumerate ignored descendants beneath
  every affected untracked directory with NUL-safe output. If ignored content
  exists, evidence is truncated, or the current Git/version/filesystem cannot
  prove it will remain byte-for-byte untouched, block the operation with an
  actionable explanation. Never substitute `--all`.
- Block creation for unresolved conflicts, unborn history, dirty/unsupported
  submodules, sparse/index states the implementation cannot preserve, or an
  already-running repository operation. Explain the safe next step instead of
  letting raw Git output become the product error.
- Planning returns a typed local-mutation plan with exact scope, risks,
  recovery, confirmation requirement, and an opaque token binding the session,
  common/worktree identity, `HEAD`, index, status, selected paths, and current
  stash tip/reflog state.
- Execution obtains the existing exclusive common-Git-directory permit,
  revalidates the complete plan, and passes user paths as literal argument
  vectors after `--`. Never construct a shell string, broaden a pathspec, or
  infer a partial scope from a truncated status payload.
- After `git stash push --include-untracked`, verify that a new, readable stash
  exists with the planned tracked/index/untracked content and that only the
  planned worktree paths/index entries changed. Preserve ignored and unrelated
  files exactly. A non-zero or interrupted process with an observed ref or
  worktree change is an uncertain local outcome, not a simple failure.

## Plan and restore

- The restore plan binds the stash object and current reflog snapshot, compares
  its base/origin with the active branch, lists affected paths, and
  explains that applying onto newer or different work may overlap.
- Require a clean working tree/index for the first release. If current work
  exists, offer **Set current changes aside first** rather than attempting a
  three-way combination the user did not request.
- Create and verify a persistent pre-apply recovery record for the affected
  paths and real index before mutation, using the existing recovery principles
  and without a branch commit or Git identity requirement.
- Apply the selected stash commit explicitly with index restoration and keep
  the stash entry. Never use `pop`; user Git configuration must not silently
  change the chosen index behavior.
- Verify the resulting status and distinguish success, conflicts, stale plan,
  unsupported state, pre-mutation failure, and uncertain post-mutation outcome.
  On conflict, preserve the stash and recovery record, identify the operation
  as `stashApply`, and route to task 037's guided conflict contract when it is
  available. Do not create a second conflict resolver in this feature.
- Offer **Undo restore** only while the recovery record's post-state token proves
  it cannot overwrite newer work. Refuse safely and retain evidence otherwise.

## Plan and remove a saved set

- Label the action **Remove saved copy...** in simple mode and **Drop stash**
  only in technical details. Never expose `git stash clear`.
- Treat removal as destructive. Show the exact selected set, state that files
  currently in the project are not changed, and require explicit confirmation.
- Before dropping the reflog entry, create and verify a durable hidden recovery
  ref plus versioned metadata that protects the stash commit from pruning and
  lets GitOdile reinsert it at the top of the standard stash stack. Add an ADR
  or an explicit extension to the recovery ADRs before implementing this
  record, including linked-worktree ownership, retention, atomicity, privacy,
  garbage collection, duplicate commit IDs, and failure behavior.
- Re-resolve the planned reflog entry under the mutation lock. Numeric selector
  drift, duplicate object IDs, or an externally changed stack must produce a
  stale-plan result, never removal of the entry currently occupying that
  number.
- After verified removal, offer **Undo remove** and explain truthfully that an
  undo restores the content as the newest standard stash rather than recreating
  the original reflog position.

## Freshness, composition, and performance

- Model set-aside operations as their own project mutation kind so watcher
  events cannot refresh under a half-finished index/worktree/ref change.
- A successful create/restore/undo invalidates status, diffs, stash pages, and
  relevant recovery data, supersedes stale reads, coalesces watcher work, and
  performs one shared follow-up refresh.
- `refs/stash` changes are shared-repository invalidations and must refresh
  every open linked-worktree session without treating another worktree's files
  as changed. Worktree mutations refresh only the selected session's status.
- Cache pages/details by common repository, session epoch, and stash snapshot;
  cancel or ignore superseded detail reads. Hidden Changes screens suspend
  subscriptions, effects, announcements, and speculative detail work.
- Virtualize lists that may grow with stash/file count. Verify 0, 1, 100, and
  1,000 entries plus large/binary diffs against the established screen and DOM
  budgets.
- Keep set-aside management within the lazy Changes screen path. Do not make
  first paint or Overview eagerly load stash parsing/diff code; measure any
  new Changes chunk against the retained performance baseline.

## UI, states, and accessibility

- Add **Set changes aside...** to the existing neutral Changes actions menu;
  it is neither a danger action nor another permanent full-size header button.
- The **Current changes / Saved for later (N)** switch preserves independent
  selection and scroll state per project and makes saved work discoverable even
  when the working tree is clean.
- The saved-for-later view uses the existing two-pane information hierarchy:
  compact virtualized entries on the left, selected summary/files/diff on the
  right, and restore/remove actions in the detail header.
- Provide loading, empty, populated, paginating, stale, partial-detail,
  conflict, success, uncertain, missing-object, unsupported-version,
  permission/lock, and externally changed states. Keep the last valid snapshot
  visible when a refresh fails.
- Use specific outcome copy: **Set changes aside**, **Restore changes and keep
  saved copy**, **Remove saved copy**, and **Undo restore/remove**. Avoid a bare
  **Stash**, **Pop**, **Apply**, or **Continue** in simple mode.
- Complete English/Spanish visible and accessible copy, keyboard list/detail
  navigation, visible focus, modal focus trap/restoration, screen-reader
  selection/count/live semantics, non-color warnings, light/dark themes,
  reduced motion, narrow desktop windows, and 200% text zoom.

## Delivery slices

This file is the product and safety epic. Implement it through these children
in order, keeping the end-to-end acceptance criteria here authoritative:

1. [`064-1`](064-1-discover-saved-sets.md): bounded discovery, details,
   pagination, external-client interoperability, and the read-only UI;
2. [`064-2`](064-2-set-changes-aside.md): plan, create, verify, and
   recoverably fail for all/selected current changes;
3. [`064-3`](064-3-restore-saved-set.md): clean-destination restore,
   retained stash, Undo, and task-037 conflict handoff;
4. [`064-4`](064-4-remove-and-recover-saved-set.md): durable protection,
   exact reflog-entry removal, and safe Undo;
5. [`064-5`](064-5-stash-workflow-audit.md): full interoperability,
   accessibility, performance, restart, linked-worktree, and platform audit.

No child may weaken the epic's ignored-file, index, recovery, stale-plan, or
uncertain-outcome rules. Incomplete mutating affordances remain unavailable.

# Out of scope

- Automatic or “magic” stashing during branch switch, sync, publish,
  project close, or app exit.
- Replacing GitOdile's branch model with GitButler-style parallel applied
  branches or adding linked worktrees as the solution to context switching.
- Ignored-file stashes (`git stash --all`).
- Partial-hunk/line stashes, interactive patch mode, or arbitrary manual Git
  pathspec entry.
- `git stash pop`, `git stash clear`, bulk deletion, stash export/import/share,
  or editing externally created stash commit messages.
- Automatically switching to the originating branch or creating a new
  branch with `git stash branch`.
- Building a duplicate conflict editor or the general Recovery screen.
- Remote/cloud storage, synchronization, AI naming, or repository content
  leaving the machine.

# Acceptance criteria

- [ ] Users can set all or selected current changes aside through a typed,
      confirmed plan and reach a verified clean/planned result without a branch
      commit or remote change.
- [ ] Standard CLI/client stashes and multiple GitOdile-created entries appear
      in a bounded, paginated list with names, dates, counts, origin confidence,
      technical evidence, and on-demand file/diff details.
- [ ] Actions target a stable planned reflog entry/object; creating/removing a
      different stash between plan and execution cannot retarget an operation.
- [ ] Tracked, staged-only, mixed, untracked, deleted, renamed, binary,
      too-large, symlink, and selected-file cases preserve exact intended
      content and prepared/index state.
- [ ] Ignored files and unrelated paths remain byte-for-byte unchanged;
      ignored descendants, truncated evidence, sparse/unsupported states,
      conflicts, unborn history, and dirty submodules block before mutation.
- [ ] Restore starts from a verified clean state, creates recovery first, uses
      apply-with-index semantics, keeps the stash, and accurately reports
      success, conflict, stale, failure, and uncertain outcomes.
- [ ] Stash-apply conflicts retain the stash/recovery evidence and use task
      037's operation contract without silently resolving or duplicating its UI.
- [ ] Removing one saved set is confirmed, protects its commit with a durable
      recovery record, never clears the stack, and Undo reinserts that content
      safely as the newest stash.
- [ ] Failures before mutation are no-ops; injected interruption/non-zero/lock
      failures after an observed ref, index, or worktree change report an
      uncertain outcome and preserve discoverable recovery evidence.
- [ ] Linked worktrees share one accurate stash list and mutation lock while
      worktree status/selection remains isolated to the affected project.
- [ ] Create, restore, remove, undo, external CLI changes, project switching,
      close/reopen, and watcher invalidation supersede stale reads and produce
      one coherent follow-up refresh without fetching from a remote.
- [ ] The Changes screen exposes a calm current/saved-for-later switch and
      contextual action without adding a new top-level screen or crowding the
      primary Refresh/Save hierarchy.
- [ ] Empty/loading/error/stale/conflict/uncertain states, English/Spanish copy,
      keyboard/focus/screen-reader behavior, both themes, reduced motion,
      narrow layouts, and 200% zoom are complete.
- [ ] Stash and file lists remain virtualized/bounded at large counts; lazy
      details and diff reuse stay inside the documented Changes performance and
      DOM budgets.
- [ ] The IPC fixture, execution-policy inventory, architecture documentation,
      recovery ADR, README capabilities, roadmap/task status, and tests match
      the delivered behavior, and `pnpm run check` passes.

# Required tests and audit

## Rust unit and temporary-repository integration tests

- Delimiter/NUL-safe reflog, metadata, message, identity, and path parsing with
  multiline/control/non-ASCII/bidirectional content and truncation.
- Empty, single, multiple, duplicate-object, externally created, externally
  changed, dropped, corrupt, expired/missing-object, and very large stacks.
- All/selected creation across tracked, staged-only, mixed, untracked,
  rename/delete, spaces, leading dashes, non-ASCII, symlinks, file/directory
  transitions, nested ignored descendants, sparse checkout, submodules,
  conflicts, and unborn repositories.
- Exact index bytes, ignored/unrelated files, `HEAD`, branch refs, remotes, and
  Git config remain unchanged except for the explicitly planned stash/index/
  worktree effects.
- Same-base, moved-base, different-branch, conflicting, stale, locked,
  interrupted, and injected mid-operation restore outcomes with retained stash
  and recovery evidence.
- Single-entry remove/undo with selector drift, duplicate OIDs, linked
  worktrees, retention, restart, permission failure, and garbage collection.
- Minimum supported Git on Windows, macOS, and Linux for every subcommand and
  option used; unsupported behavior returns structured guidance.

## Frontend and desktop audit

- Current/saved-for-later switching, selection/scroll retention, create plan,
  list pagination, details, restore, conflict, remove, and both Undo flows.
- 0/1/100/1,000 stashes and 1/50/1,000 files with bounded DOM and responsive
  switching; binary/large/truncated details never freeze first readable paint.
- External CLI stash changes while the app is open, linked-worktree sessions,
  stale dialogs, project close/reopen, and mutation-blocker behavior.
- Keyboard-only and screen-reader list/detail/dialog use, focus restoration,
  live announcements, long/duplicate names, non-ASCII paths, both locales and
  themes, narrow/large windows, reduced motion, and 200% text zoom.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `README.md`
- `docs/PRODUCT_STRATEGY.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/frontend-feature-guide.md`
- `docs/architecture/023-performance-baseline.md`
- `docs/adr/0007-store-discard-recovery-in-worktree-git-metadata.md`
- `docs/adr/0008-store-history-recovery-as-versioned-hidden-refs.md`
- `work/done/0.1.0/016-manage-branches.md`
- `work/done/0.1.0/054-make-changes-readable-copyable-and-safely-discardable.md`
- `work/done/0.5.0/037-guided-conflict-resolution.md`
- `src/features/changes/`
- `src/features/repository/readCoordinator.ts`
- `src/projectSessions.ts`
- `src-tauri/src/application.rs`
- `src-tauri/src/changes.rs`
- `src-tauri/src/recovery.rs`
- `src-tauri/src/repository_access.rs`
- `src-tauri/src/watch.rs`
- `src/ipcContract.test.ts`
- `docs/architecture/025-ipc-contract.json`

# Dependencies

- No dependency blocks standard stash discovery, creation, detail, safe
  restoration, or recoverable removal.
- Task 037 owns the guided UI for a restore that produces `stashApply`
  conflicts. This task must emit its extensible operation contract and preserve
  evidence; until task 037 lands, route the user to Changes with a truthful
  conflict state instead of duplicating the resolver.
- The existing discard recovery implementation and ADRs are reusable evidence,
  not permission to reuse a format whose ownership or restore semantics do not
  fit stash apply/drop. Record the new recovery decision explicitly.

# Decisions

- Use the standard Git stash stack for interoperability; optional GitOdile
  metadata can enrich but never own the saved work.
- Combine GitHub Desktop's simple entry point with Tower/GitKraken's multi-entry
  list, names, inspection, and explicit lifecycle.
- Keep the workflow in Changes rather than adding top-level navigation or
  conflating user-created temporary work with automatic Recovery records.
- Include displayed untracked work by default, exclude ignored content always,
  and block when ignored-descendant preservation cannot be proven.
- Restore with `apply --index` and keep the saved copy. Deletion is a separate,
  destructive, recovery-backed action; `pop` and `clear` are excluded.
- Never auto-stash. A blocked operation may offer this explicit workflow as a
  next step, but the user chooses its scope and confirms the consequences.
- Require a clean destination for the first restore implementation. Combining
  two unsaved states is a conflict workflow, not a convenience default.

# Implementation notes

Complete during implementation. Record the exact minimum-Git-compatible
commands, reflog cursor/action identity, ignored-descendant proof, metadata and
recovery formats, state-token inputs, linked-worktree behavior, cache limits,
diff reuse, chunk/DOM measurements, and cross-platform findings.

# Validation

Record exact focused checks, temporary-repository fixtures, minimum-Git runs,
desktop/accessibility/performance audits, cross-platform results, and the final
`pnpm run check` outcome. Do not claim an environment or scenario that was not
actually exercised.
