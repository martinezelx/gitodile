---
id: "016"
title: "Create, switch, and safely delete branches"
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
  - repository
  - recovery
created: 2026-07-28
completed: 2026-08-01
---

# 016 — Create, switch, and safely delete branches

## Goal

Let the user inspect local Git branches, create a new branch from the current
work, switch between existing branches, and delete branches whose saved work is
provably retained elsewhere.

Simple mode uses **branch** as the primary term and explains that Git
calls it a **branch** through progressive disclosure. The feature must expose
the consequences of changing `HEAD`, the index, working files, and local refs
without requiring the user to understand checkout semantics.

## User outcome

A user can:

1. see which branch is active and which other local branches exist;
2. start a new branch from the current point, optionally carrying current
   unsaved work with it;
3. preview and switch to an existing branch when doing so is safe;
4. understand why a switch is blocked when unsaved work or another Git
   operation makes it unsafe;
5. delete an inactive local branch only when its saved work remains
   reachable from another known reference;
6. recover from detached `HEAD` by creating a named branch at the current
   commit.

## Context and audit findings

The current application already:

- returns the active branch, `branch`/`unborn`/`detached` head state,
  `gitDir`, and `commonGitDir` from repository discovery;
- parses the current branch and upstream metadata while reading working-tree
  status;
- detects merge, rebase, cherry-pick, revert, and bisect operations for the
  save-version flow;
- binds save and publish operations to the current branch and rejects detached
  or stale state;
- distinguishes normal repositories from linked worktrees;
- has established **branch** as the simple-mode wording.

It does not currently:

- inventory local branches or show where else a branch is checked out;
- expose a Branches/Branches destination in the sidebar or compact
  navigation, despite the product design reserving this area;
- plan or execute branch creation, switching, or deletion;
- invalidate all branch-dependent snapshots after `HEAD` changes;
- provide a safe route out of detached `HEAD`.

Task 012 explicitly excludes branch management. Tasks 013–015 all derive their
truth from the active branch and already mention branch changes as an
invalidation event. This task therefore owns the missing branch boundary rather
than spreading branch mutations across project switching, sync, and history.

## Scheduling

Keep the permanent ID `016`; do not renumber existing tasks.

Recommended execution order:

1. finish and manually validate task 011;
2. implement task 016;
3. continue with tasks 012–015.

Task 012 is architecturally independent but should consume task 016's
path-scoped operation state when it introduces project sessions. Tasks 013,
014, and 015 must treat a successful branch change as a hard invalidation
and should not be considered complete without that integration.

## Product model and vocabulary

- Use **Branches** / **Ramas** as the navigation and page
  title in simple mode.
- Introduce the exact term **branch** / **rama** once in the page explanation
  and retain exact ref names in technical details.
- A branch is a local branch. A linked Git worktree remains a **separate
  workspace** and is not itself a branch.
- Do not merge local branches and remote-tracking branches into one visually
  ambiguous list.
- Remote-only branch discovery, creation of tracking branches, and remote
  deletion remain outside this task. Existing locally known upstream metadata
  may be shown as secondary, potentially stale detail.

## Scope

### Branch discovery

Add a narrow, read-only Rust command that returns a typed
`BranchesSnapshot` containing at least:

- repository/worktree identity;
- `branch`, `unborn`, or `detached` head state;
- current commit when one exists;
- ordered local branches with:
  - full, lossless local branch name;
  - tip commit ID and bounded subject/date metadata;
  - whether it is active in this worktree;
  - configured upstream, when present;
  - whether its exact tip is reachable from another retained local or
    remote-tracking ref;
  - unique-commit count relative to the active branch where meaningful;
  - linked-worktree path when it is checked out elsewhere;
- total count and honest truncation metadata when safety limits apply.

Use a stable, machine-readable ref format. Do not parse human-formatted
`git branch` output, terminal decoration, localized dates, colors, or current
branch markers.

The list must distinguish:

- ordinary active branch;
- unborn active branch;
- detached `HEAD`;
- branch checked out in another linked worktree;
- local branch with and without an upstream;
- branch whose tip is retained elsewhere;
- branch with unique saved work.

Discovery is read-only and must not contact a remote. Any ahead/behind or
upstream reachability information is based on locally available refs and must
not be presented as freshly verified remote truth.

### Version-branches screen

- Add **Branches** to project navigation between Changes and History in
  the expanded sidebar and the narrow/compact navigation.
- Disable it honestly when no project is open.
- Add the same destination and relevant create/switch actions to the command
  palette without duplicating operation logic.
- Build a dedicated project screen with:
  - the active branch clearly identified;
  - a short plain-language explanation of what branches do;
  - a searchable local-branch list;
  - configured upstream and linked-worktree occupancy as secondary details;
  - a primary **New branch** action;
  - contextual **Switch to this branch** and **Delete branch** actions;
  - technical branch/ref details through progressive disclosure.
- Keep the active item visible but non-switchable.
- For branches checked out in another worktree, show the workspace path and why
  this window cannot switch to or delete them.
- Preserve readable names, focus, and actions with long, nested
  (`feature/name`), duplicate-looking, and non-ASCII ref names.
- Provide loading, empty, truncated, detached, unborn, blocked, error, and
  success states in English and Spanish.

### Overview quick switch

- Extend the existing "Current branch" card on Overview
  (`overviewCurrentBranch`) with a bounded quick-switch entry point (e.g.
  a **Change** button opening a small popover/menu of recent local branches,
  distinct from the full searchable list on the Branches screen).
- The quick switch must trigger the exact same `SwitchBranchPlan`,
  confirmation dialog, and revalidation used by the Branches screen — no
  parallel switch implementation, matching the existing pattern where
  Overview's "Review changes" and "Publish changes" buttons enter the same
  flows owned by Changes/Publish rather than reimplementing them.
- The quick switch is bounded to a small, recent/searchable subset of local
  branches; it does not replace the full list, which stays on the dedicated
  screen.
- When the working tree is not clean, the quick switch surfaces the same
  block and the same **Save version** / **New branch with this work**
  next actions as the dedicated screen — it must never offer a shortcut that
  bypasses the clean-tree requirement.
- Add a bounded **New branch** quick action alongside it, entering the
  same `CreateBranchPlan` flow.
- The quick-switch list excludes the active branch and any branch checked out in
  another worktree, same as the dedicated screen; overflow past the bounded
  count links to the full Branches screen instead of silently truncating.

### Create a branch

Create a typed `CreateBranchPlan` and execution result. The plan contains
at least:

- operation kind: `local-mutation`;
- `requiresConfirmation` based on the consequences below;
- validated proposed name;
- current head state and starting commit;
- whether the new branch will become active;
- whether unsaved/prepared work exists and will remain byte-for-byte present;
- state token covering repository identity, `HEAD`, index, working-tree
  snapshot, and conflicting Git-operation state;
- plain-language steps, consequences, and recovery information.

Creation rules:

- Create only from the current `HEAD` in this task; do not expose arbitrary
  commit selection.
- Default to **Create and switch**, with an explicit option to create without
  switching.
- Allow creation while ordinary non-conflicted work is unsaved. Explain that
  the same unsaved files and prepared state remain present, but future saved
  versions will belong to the new branch.
- Revalidate and prove that create-and-switch does not alter working-file or
  index bytes. Stop if state changed after preview.
- Allow detached `HEAD` with a valid commit to create and switch to a named
  branch, preserving otherwise hard-to-find work.
- Block creation during unresolved conflicts or merge, rebase, cherry-pick,
  revert, or bisect operations.
- For an unborn branch, explain that the first version should be saved before
  another branch is created. Do not silently rename or replace the unborn ref.
- Validate names through Git ref rules and explicit argument boundaries. Never
  interpolate a name into a shell command.
- Detect existing names, case-folding collisions on relevant filesystems,
  reserved/ref-lock conflicts, and branches already active in another
  worktree.
- Do not generate a name automatically in this task. ADR 0002 remains proposed
  and any future suggestion must remain editable and explicitly confirmed.

Creating a ref is a local mutation. The submitted form is sufficient
confirmation when the project is clean and remains on the current branch.
Create-and-switch, detached-head recovery, and creation carrying unsaved work
must show an explicit consequence preview before execution.

### Switch to an existing branch

Create a typed `SwitchBranchPlan` containing at least:

- operation kind: `local-mutation`;
- `requiresConfirmation: true`;
- source and destination branch names and commit IDs;
- state token covering repository identity, source/destination tips, `HEAD`,
  index, complete working-tree state, and conflicting Git-operation state;
- bounded count/list of files expected to change between the two tips;
- confirmation that the destination is not checked out in another worktree;
- plain-language steps and consequences.

MVP switching rules:

- Require a completely clean working tree and index, including no untracked or
  conflicted files.
- If work is unsaved, do not rely on Git's situational ability to carry changes
  across branches. Offer two truthful next actions:
  - **Save version**, using task 010;
  - **New branch with this work**, using this task's creation flow.
- Block during merge, rebase, cherry-pick, revert, or bisect operations.
- Block a destination checked out in another linked worktree and show its path.
- Revalidate immediately before execution and stop on any changed ref,
  worktree, index, or operation state.
- Switch only to the exact confirmed local ref. Disable Git's ambiguous
  remote-name guessing.
- Never stash, reset, clean, discard, merge, rebase, or resolve conflicts as
  part of switching.
- If Git refuses the switch because an ignored/untracked file, lock, sparse
  checkout, submodule, or platform constraint was missed by planning, surface
  the structured reason without claiming success or attempting cleanup.

### Safely delete a local branch

Create a typed `DeleteBranchPlan` containing at least:

- operation kind: `destructive`;
- `requiresConfirmation: true`;
- exact branch name and tip commit;
- proof of the retained ref(s) that still reach the tip;
- locally known upstream metadata;
- state token covering branch tip, current `HEAD`, retained reachability, and
  linked-worktree occupancy;
- clear consequences and recovery evidence.

Deletion rules:

- Never delete the active branch.
- Never delete a branch checked out in any linked worktree.
- Never delete a remote branch or remote-tracking ref.
- Never force-delete (`git branch -D`, ref deletion, or equivalent).
- Permit deletion only when Git's safe-delete semantics succeed and the tip is
  provably reachable from another retained local branch or an exact known
  remote-tracking ref.
- Block deletion when the branch has unique saved versions or when reachability
  cannot be proven. Explain where the unique work is and keep it intact.
- Revalidate tip, reachability, worktree occupancy, and repository state
  immediately before deletion.
- Show the exact retained branch/upstream that preserves the work. Do not promise
  a recovery workflow that has not yet been implemented.
- If recovery refs are introduced later, define their namespace, retention, and
  cleanup policy in the Recovery domain before allowing destructive deletion
  of unique work.

### Operation coordination and refresh

- Keep all Rust commands path-scoped and stateless; do not introduce a mutable
  global current repository.
- Serialize branch mutations against other mutations sharing the same
  `commonGitDir`, including linked worktrees.
- A successful create, switch, or delete must refresh repository discovery and
  working-tree status.
- A successful switch must invalidate:
  - selected file and diff caches;
  - save-version and publish plans/tokens;
  - locally cached remote relation;
  - history snapshot and selection;
  - branch inventory and overview metadata;
  - navigation entries whose selected content no longer exists.
- Late responses created before a switch must not overwrite the new branch's
  state.
- Task 012 must later bind these snapshots, plans, dialogs, and mutations to
  the originating project session.

## Safety model

| Action | Classification | Confirmation and recovery |
| --- | --- | --- |
| List branches | Read-only | No confirmation; no remote contact |
| Create without switching | Local mutation | Explicit form submission |
| Create and switch | Local mutation | Consequence preview; state revalidation |
| Switch existing branch | Local mutation affecting files/index | Required preview and clean-tree proof |
| Delete local branch | Destructive local-ref mutation | Required confirmation and retained-reachability proof |

No flow in this task may run reset, clean, forced checkout, forced branch
deletion, automatic stash, merge, rebase, or remote mutation.

## States and UX copy

Cover at least:

- loading and ready inventory;
- no project;
- ordinary current branch;
- no other local branches;
- detached `HEAD` with recovery action;
- unborn branch with save-first guidance;
- valid/invalid/duplicate/case-colliding name;
- creating with clean or unsaved work;
- creation carrying prepared changes from another Git tool;
- switch preview and progress;
- switch blocked by unsaved work, conflicts, operation in progress, another
  worktree, ref movement, lock, or filesystem obstruction;
- deletion confirmation;
- deletion blocked for active, checked-out-elsewhere, unique, stale, or
  unprovable work;
- successful create, switch, and delete;
- stale plan and structured generic failure.

Copy must say whether files, the index, local history, local refs, remote refs,
or teammates are affected. Branch operations in this task never publish
anything.

## Acceptance criteria

- [x] A project-level Branches destination exists in expanded and compact
      navigation and is available through the command palette.
- [x] Overview's current-branch card offers a bounded quick switch and
      quick create that reuse the same plans, dialogs, and revalidation as the
      dedicated screen, including the same clean-tree block and next actions.
- [x] Local branches are discovered through typed, machine-readable output and
      the active, detached, unborn, upstream, truncated, and checked-out-in-
      worktree states are represented honestly.
- [x] Simple mode uses branch language while exact Git branch names and
      terminology remain available.
- [x] A user can create a local branch from the current commit and choose whether
      to switch to it.
- [x] Create-and-switch preserves every working-file and index byte, including
      prepared and untracked work.
- [x] Detached `HEAD` can be recovered into a named local branch without losing
      its current commit.
- [x] Invalid, duplicate, case-colliding, locked, and non-representable names
      return structured errors without partial mutation.
- [x] Existing-branch switching requires a completely clean project and previews
      the exact source, destination, and bounded file impact.
- [x] Unsaved work blocks existing-branch switching and offers Save version or
      New branch with this work rather than stash/discard behavior.
- [x] Conflicts and in-progress Git operations block every unsafe mutation.
- [x] Branches active in another linked worktree cannot be switched to or
      deleted and their workspace path is explained.
- [x] The active branch, remote refs, and branches with unique/unprovable work
      cannot be deleted.
- [x] No force deletion, forced checkout, reset, clean, automatic stash, merge,
      rebase, remote guessing, or remote mutation is reachable.
- [x] Every plan is revalidated immediately before execution and stale plans
      stop without mutation.
- [x] Successful operations refresh and invalidate all branch-dependent state;
      late responses cannot reintroduce the previous branch's data.
- [x] Long, nested, non-ASCII, and overflowing names work without ambiguous
      truncation; non-UTF-8 refs fail honestly rather than being mutated through
      lossy text.
- [x] Keyboard navigation, focus restoration, screen-reader announcements,
      loading/error states, reduced motion, light/dark themes, narrow windows,
      Spanish, and English are verified.

## Required tests and audit

### Rust unit tests

- Machine-readable ref parsing with long, nested, non-ASCII, delimiter-like,
  malformed, and capped input.
- Current/detached/unborn state mapping.
- Name validation, duplicate detection, case-collision handling, argument
  boundaries, and non-UTF-8 failure.
- Linked-worktree occupancy parsing.
- Unique-commit and retained-reachability classification.
- Create/switch/delete state-token stability and invalidation.
- Structured mapping for operation-in-progress, dirty tree, stale ref, lock,
  worktree occupancy, unsupported Git behavior, and safe-delete refusal.

### Rust integration tests

Use temporary repositories and linked worktrees to cover:

- clean creation with and without switching;
- creation carrying modified, prepared, unprepared, untracked, renamed, and
  deleted work with byte-identical working files/index;
- detached-HEAD recovery;
- unborn creation blocked without changing `HEAD`;
- clean switch between branches with different trees;
- dirty, conflicted, and operation-in-progress switches blocked;
- ignored/untracked obstruction and stale destination tip;
- destination active in another linked worktree;
- deletion of a fully retained inactive branch;
- active, unique, stale, and worktree-active deletion blocked;
- exact refs before and after every operation, proving no tags, remotes, or
  unrelated branches changed;
- `commonGitDir` lock coordination across linked worktrees;
- non-ASCII refs and filesystem case behavior where supported.

For every mutation, snapshot working-file bytes, index bytes, `HEAD`, local
refs, remote-tracking refs, and tags as applicable. Assert that only the
explicitly planned state changes.

### Frontend and desktop audit

- Inventory, search, truncation, empty, detached, unborn, loading, stale, and
  error states.
- Create forms and consequence previews for clean, dirty, and detached states.
- Switch preview, dirty-project guidance, progress, stale result, success, and
  focus restoration.
- Safe-delete confirmation and every blocked reason.
- Refresh/invalidation of Overview, Changes, publish state, and history stubs.
- Overview quick-switch/quick-create popover: focus trap, keyboard dismissal,
  identical blocked/preview states as the dedicated screen, and correct
  return focus to the Overview trigger button.
- Rapid branch selection and late-response races.
- Real linked worktrees and branches with identical final path segments.
- Keyboard-only and screen-reader completion.
- Windows, macOS, and Linux behavior where available; light/dark themes,
  approximately 1024px and large windows, text zoom, and reduced motion.

## Out of scope

- Renaming a branch.
- Creating a branch from an arbitrary historical commit or tag.
- Remote-only branch browsing or creating a local tracking branch from one.
- Fetching, pulling, merging, rebasing, cherry-picking, or resolving conflicts.
- Remote branch/tag creation or deletion beyond task 011 publishing the current
  confirmed branch.
- Force deletion of a branch with unique work.
- Automatic stash, discard, or worktree cleanup.
- Creating, moving, locking, repairing, or deleting linked worktrees.
- A visual multi-branch commit graph.
- Branch protection rules from hosting-provider APIs.
- AI or heuristic branch-name generation.

## Platform implications

- Git ref names are case-sensitive conceptually, but loose refs may live on a
  case-insensitive filesystem. Detect collisions before mutation and let Git's
  own ref locking remain authoritative.
- Preserve UTF-8 non-ASCII names. Do not round-trip non-UTF-8 ref bytes through
  lossy strings before a mutation.
- Expect Windows antivirus/indexer ref-lock interference and surface it without
  retrying destructively.
- Resolve linked-worktree occupancy from Git metadata rather than assuming
  `.git` is a directory.
- Do not assume slash direction, default branch names, `origin`, GitHub, or a
  case-sensitive filesystem.
- Choose an explicit system-Git compatibility strategy for branch switching.
  Prefer the unambiguous `git switch` command when the detected Git version
  supports it; any compatibility fallback must use separated arguments,
  disable remote guessing, and preserve the same safety contract.
- Decided: require Git >= 2.23 (the `git switch`/`git restore` split) for
  create, switch, and delete mutations in this task. No older-Git fallback
  path is implemented. When the detected Git version is older or unknown,
  block these mutations with a structured, honest error naming the required
  version; read-only discovery still uses version-agnostic plumbing. This is
  the first Git-version floor enforced anywhere in the app (task 002
  explicitly left minimum-version enforcement out of scope), so keep the
  check local to this task's commands rather than a global gate.

## Dependencies

- Task 001 repository identity and head-state discovery.
- Task 007 structured working-tree status.
- Task 010 Save version entry point and state invalidation.
- Task 011 publish planner/result invalidation and upstream terminology.
- Existing system-Git runner, operation-in-progress detection, typed errors,
  and linked-worktree metadata.

Downstream integration:

- Task 012 must bind branch state and mutations to project sessions.
- Task 013 must invalidate/recompute remote status after a branch change.
- Task 014 must plan only against the newly active branch and reject stale plans.
- Task 015 must refresh history and selection after a branch change.

## Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/PRODUCT_STRATEGY.md`
- `docs/adr/0002-heuristic-first-commit-and-branch-naming.md`
- `work/done/0.1.0/001-open-local-repository.md`
- `work/done/0.1.0/007-working-tree-status.md`
- `work/done/0.1.0/010-save-version.md`
- `work/done/0.1.0/011-publish-changes.md`
- `work/done/0.1.0/012-open-and-switch-projects.md`
- `work/active/013-check-team-changes.md`
- `work/active/014-get-team-changes-safely.md`
- `work/done/0.1.0/015-history-timeline.md`
- `src/main.tsx`
- `src/repositoryOverview.ts`
- `src/changes.tsx`
- `src/publish.ts`
- `src/publishDialog.tsx`
- `src/appError.ts`
- `src/i18n.tsx`
- `src/styles.css`
- `src-tauri/src/lib.rs`

## Decisions

- Introduce one dedicated Branches screen as the source of truth for
  branch inventory, technical details, and full-list search; Overview only
  gets a bounded quick-switch/quick-create entry point into the same plans,
  never a second implementation of the mutations.
- Model local branches and linked worktrees as related but distinct concepts.
- Allow dirty work to move only into a newly created branch; never carry it
  implicitly while switching to an existing branch.
- Keep existing-branch switching clean-only for the MVP.
- Use plan/revalidate/execute contracts for every branch mutation.
- Permit deletion only with safe-delete semantics and proof that the tip
  remains reachable; never force-delete unique work.
- Keep discovery local and provider-neutral. Task 013 owns fresh remote truth.
- Keep Rust commands repository-path-scoped so task 012 can add project
  sessions without a mutable backend singleton.
- Decided: the compact/narrow navigation currently has no History or Recovery
  placeholders at all (only Overview, Changes, Settings). This task adds only
  the Branches entry there; it does not backfill the pre-existing
  History/Recovery gap in compact nav, to stay within this task's scope.

## Implementation notes

Pre-declared before implementation:

- Git-version compatibility: require Git >= 2.23 for create/switch/delete;
  block older/unknown versions with a structured error (see Decisions above).
- Nav icon: use a `GitBranch`-style icon (lucide-react) for the Branches
  sidebar/compact-nav entry and command-palette item; add
  `navBranches` / `navBranchesTitle` (and Spanish equivalents) to
  `src/i18n.tsx` alongside the existing `navHistory`/`navRecovery` keys.
- Compact nav: add only the Branches entry; do not backfill the
  pre-existing History/Recovery gap there (see Decisions above).

Still to complete during implementation. Record:

- exact ref-list format and safety cap;
- plan-token inputs;
- worktree-occupancy and ref-lock handling;
- final navigation and responsive interaction;
- mutation coordination and cache invalidation boundaries;
- any platform behavior that could not be verified.

Implemented (first pass):

- Ref list: `git for-each-ref --format=%(refname)%00%(objectname)%00%(objectname:short)%00%(contents:subject)%00%(committerdate:iso-strict)%00%(upstream:short) --sort=-committerdate refs/heads`,
  NUL-separated fields, one record per branch. Capped at 300
  (`BRANCH_LIST_CAP`); `totalCount`/`isTruncated` stay exact.
- Worktree occupancy: `git worktree list --porcelain`, parsed into
  path/branch blocks; cross-referenced by branch name against the ref list.
- Retained-elsewhere / delete-safety proof: `git for-each-ref --contains
  <tip> --format=%(refname) refs/heads refs/remotes`, excluding the branch's
  own ref. Delete still calls `git branch -d` (never `-D`) as the actual
  enforcement; the reachability check only explains *why* it's expected to
  succeed.
- Plan-token inputs: HEAD sha, active branch name, a fingerprint of the
  already-fetched `WorkingTreeStatus` (clean flag + total + per-entry
  path/category/prepared), and an operation-specific string (name/target
  plus, for delete, the retained-by set). No extra Git process beyond what
  validation already needed.
- Git-version gate: `git --version` parsed and compared numerically
  (`git_version_at_least`); create/switch/delete all call
  `require_git_switch_support` first. Discovery does not.
- Mutation coordination: relies on Git's own ref locking plus the existing
  per-`commonGitDir` frontend session lock (`getMutationBlocker`) reused
  as-is; no new cross-session lock was added specifically for branch
  commands in this pass — see "Known gaps" below.
- Navigation: added between Changes and History in the expanded sidebar and
  compact nav (`main.tsx`); command palette gained "Go to Branches" and
  "New branch" (the latter opens the screen and auto-opens the create
  dialog). Overview's "Current branch" card gained bounded
  "Change"/"New" quick actions (`OverviewBranchQuickActions` in
  `main.tsx`) that reuse the exact same dialogs/plans as the dedicated
  screen. **Amended by task 019** — the menu read its own snapshot on every
  open in this pass; it now renders the session's cached one and revalidates
  behind it. The dialogs and plans it drives are unchanged.
- Invalidation: a successful create/switch/delete calls
  `handleBranchChanged` (`main.tsx`), which re-runs `open_repository`
  (refreshes branch/head state via the existing session `"open"` action),
  clears the Changes screen's selected file/diff, and re-runs
  `checkWorkingTree` (working-tree status + pending/publish list). Branch
  inventory needs no separate refetch: every mutation command already
  returns the fresh `BranchesSnapshot` its own screen renders directly.
  **Superseded by task 019** — the inventory is now cached on the project
  session rather than owned by the screen, so `handleBranchChanged`
  does re-read it. The screen's own dialogs still hand their returned
  snapshot straight back, but Overview's quick switch/create reach the same
  commands from outside that screen and would otherwise leave the cache
  stale. See task 019's implementation notes.
- Tests: 22 new Rust unit/integration tests (parsing, git-version
  comparison, create/switch/delete happy paths and every listed block
  reason, stale-token rejection) plus frontend tests for the panel and the
  three dialogs. `cargo fmt --check`, `cargo clippy --all-targets
  --all-features -- -D warnings`, `pnpm run typecheck`, `pnpm run test`, and
  `pnpm run build` all pass.

Known gaps (flagged for manual review, not silently dropped):

- No dedicated frontend history stub/search-empty/keyboard-audit pass beyond
  what the automated tests above exercise — the desktop verification this
  task requires (real linked worktrees, screen reader, reduced motion,
  Windows/macOS/Linux) has not been done and must happen before this task is
  marked done.
- ~~Version-branch mutations do not yet have their own cross-session "blocked
  by another session's operation" UI lock the way save/publish do.~~
  **Closed.** They now register through the same
  `startSessionOperation`/`getMutationBlocker` contract, under a third
  mutation kind (`branch`), so two linked worktrees sharing a
  `commonGitDir` block each other before Git's ref locking has to.
- ~~Unique-commit-count and retained-elsewhere are computed with one extra
  Git process per listed branch.~~ **Mostly closed.** Retained-elsewhere is
  now answered for every branch in a single `rev-list --branches --remotes`
  walk (`reaching_refs_by_commit`), and unique-commit-count is memoised per
  distinct tip, so branches sharing a tip cost one process between them.
  Still unbenchmarked at the 300-branch cap, and the graph walk now holds an
  entry per reachable commit — see `work/backlog.md`.

## Amendments after the first pass

- **Plans expire on content, not only on shape.** The create state token
  originally fingerprinted the working-tree *status*, which cannot tell that
  an already-modified file was edited again between preview and confirm, nor
  that the staged content changed while the final worktree stayed identical.
  It now also carries the full worktree tree and the exact index tree
  (`create_branch_state_fingerprint`). The cost is a `git add -A` into
  a temporary index during planning, not just execution.
- **Unrepresentable ref names are skipped, not converted and not fatal.** Git
  ref names are bytes, so a name GitOdile cannot represent is possible.
  Showing it with replacement characters would invite the user to act on a
  name that does not exist, and every mutation is keyed by exact name — so
  those records are dropped. Dropping them individually, rather than failing
  the whole read, keeps the remaining branches usable; the screen reports how
  many are missing (`unreadableCount`). `list_branch_names` skips them too,
  which is safe because a *new* name is always valid UTF-8 and can therefore
  never collide with bytes that are not.

## Validation

Automated checks, run when the work was committed (146d4be) and again as part
of tasks 019 and 020, which build on this code:

- `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` — pass.
- `pnpm run typecheck`, `pnpm run test`, `pnpm run build` — pass. The
  branches panel and dialogs carry their own suites
  (`branchesPanel.test.tsx`, `branchesDialog.test.tsx`).

Desktop verification: **attested by the user on 2026-08-01**, not recorded in
an agent session. The commit message for 146d4be deliberately kept this task
active pending real desktop checks of create, switch, and safe delete —
including linked worktrees, screen reader, reduced motion, themes, narrow
windows, and Spanish/English. The user confirmed that verification and
approved closing the task; the acceptance criteria above are checked on that
basis. Recorded here so the provenance of those checkmarks stays honest:
anything later found unverified should be reopened as a follow-up task rather
than treated as a regression of this one.
