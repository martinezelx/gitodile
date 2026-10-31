---
id: 019
title: Instant screen switching inside an open project
status: done
priority: normal
type: chore
areas:
  - frontend
created: 2026-07-31
completed: 2026-08-01
---

# Goal

Once a project is open, moving between its screens (Overview, Changes,
Branches) renders from already-known state instead of showing a loading
state and re-reading the repository. Paying to load a project the first time
it becomes active stays acceptable; paying again on every navigation does not.

# User outcome

Reported directly by the user: "si cargas un proyecto y estás en el overview
y pasas al changes y después a las ramas siempre carga cuando cambias entre
pantallas... una vez estás dentro de un mismo proyecto y cambias de pantalla
debería de ser instantáneo."

After this task, navigating between screens of the already-active project is
visually instant: the previous content is on screen immediately and any
freshness check happens in the background.

# Context

Task 012 already lifted the per-project repository facts into
`ProjectSession` (`workingTree`, `pendingVersions`, `changesSelection`,
`lastView`), and `navigateToView` performs no fetch. Overview is therefore
already instant. Three separate causes remain:

1. **Branches has no cache at all.** `BranchesPanel` starts in
   `{ status: "loading" }` and calls `get_branches` from a mount effect.
   The panel unmounts when the view changes, so every entry is a full spinner
   plus a fresh Git read.
2. **The Changes diff cache dies with the component.** `DiffStore` lives in a
   `useRef` inside `ChangesPanel`. Leaving the screen discards the per-file
   cache, the in-flight request map, and the `read_working_tree_diffs`
   batch warm-up, so returning re-runs all of it. The working-tree *list*
   itself is already instant (it comes from the session).
3. **Two lazy chunks are never prefetched.** Task 018 added an idle-time
   `prefetchLazyPanels`, but `branchesPanel` and `branchesDialog`
   (added later, in task 016) were never added to it, so the first navigation
   to Branches pays a chunk fetch and shows `ViewLoadingFallback`.
4. **Overview's branch menu reads branches on every open.** Reported by
   the user after the first three were fixed.
   `OverviewBranchQuickActions` blanked itself to a spinner and ran its
   own `get_branches` each time the dropdown opened — the same data the
   session now caches. Folded into this task because it is the same cache and
   the same fix, not a new problem.

Constraint stated by the user: the fast launch delivered by task 018 must not
regress. Nothing here may move work before first paint, and startup must not
gain extra Git reads.

# Scope

- Move the branches snapshot into `ProjectSession`, guarded by its own
  generation counter, and make `BranchesPanel` a controlled component that
  renders the cached snapshot immediately and revalidates in the background
  (stale-while-revalidate). The spinner appears only when there is nothing
  cached to show.
- Move the Changes diff cache out of `ChangesPanel` into an app-owned,
  per-project store that survives unmount, and evict a project's entry when
  its session closes. Keep the existing invalidation rule (a new working-tree
  snapshot resets the store) unchanged.
- Seed the panel's initial diff state from that cache so a warm return paints
  the diff on the first frame, with no intermediate empty state.
- Prefetch the branches snapshot for the active project during idle time,
  and add the two missing chunks to task 018's existing idle prefetch.
- Point Overview's quick-switch menu at the same cached snapshot, revalidating
  in the background when it opens.
- Investigate (design only, see "Follow-up: live working-tree updates" below)
  what it would take to refresh the Changes screen automatically when files
  change on disk, so "Check changes" stops being a manual step.

# Out of scope

- Persisting any of these caches to disk. They stay in memory, per session,
  exactly like `workingTree` today.
- Changing the invalidation rules for `workingTree`/`pendingVersions`, or how
  often `checkWorkingTree` runs.
- Lifting `excludedPaths` (the save-version checkboxes) into the session.
  Task 012 recorded a deliberate decision to keep it local to the panel; it is
  a working selection for the next save, not navigation state. Left as a
  possible follow-up.
- **Implementing** a file watcher or any push-based invalidation. Revalidation
  stays navigation- and action-triggered in this task; the design work is
  recorded below and belongs in its own task.
- Caching anything for a project that is not the active one beyond what is
  already retained.

# Acceptance criteria

- [x] Returning to Branches within the same project renders the previous
      snapshot with no loading spinner, while a background refresh runs.
- [x] A failed background refresh keeps the last known snapshot visible and
      says it is stale, rather than replacing it with an error screen. An
      error screen is still shown when there is nothing cached.
- [x] Returning to Changes within the same project and working-tree snapshot
      issues no new `read_file_diff`/`read_working_tree_diffs` calls, and the
      selected file's diff is on screen from the first frame.
- [x] A new working-tree snapshot still resets the diff cache.
- [x] Closing a project drops its cached diffs.
- [x] No Git command runs before first paint, and startup restore issues no
      branches reads; the prefetch is idle-time only and gated on restore
      having finished.
- [x] Tests cover: the new reducer actions, the branches panel's cached/
      stale/error rendering, and a Changes unmount→remount that does not
      refetch.
- [x] Reopening Overview's branch menu shows the branches immediately,
      with no spinner, and no read on open beyond a background revalidation.
- [x] `pnpm run typecheck`, `pnpm run test`, and `pnpm run build` pass.

# Relevant files

- `src/projectSessions.ts`
- `src/branchesPanel.tsx`
- `src/changes.tsx`
- `src/diffCache.ts` (new)
- `src/main.tsx`

# Dependencies

Builds on task 012 (per-project sessions), task 016 (branches), and task
018 (launch performance and the idle prefetch it introduced).

# Decisions

- **Stale-while-revalidate, not a cache with a lifetime.** Branches and files
  change from outside GitOdile (an agent, another terminal), so a cache that
  suppresses reads would eventually lie. Every entry to a screen still
  revalidates; what changed is that the cached answer is what the user looks
  at while it happens. The freshness guarantee is unchanged — only the
  spinner is gone.
- **A separate generation counter for branches.** Reusing
  `statusGeneration` would have let a working-tree refresh invalidate an
  unrelated in-flight branch read (and vice versa), silently dropping results.
  The counter follows the existing rule that ownership lives with the caller,
  not the reducer.
- **The diff cache moved to a new `diffCache.ts`, not into `changes.tsx`'s
  exports.** `main.tsx` has to own the cache for it to outlive the screen, but
  importing it from `changes.tsx` would statically pull that module — and the
  ~70-icon file-type set — back into the entry chunk, undoing task 018.
  `diffCache.ts` imports `FileDiff` as a type only, which is erased at
  compile time, so the lazy boundary survives. Verified in the build output:
  the `changes` chunk is still 301.88 kB on its own.
- **The cache is keyed by project path and invalidated by working-tree
  identity, unchanged from before.** Structural comparison was considered and
  rejected: a file can be edited again without its status line changing, so
  equal statuses do not imply equal diffs. Identity is the only rule that
  cannot serve a stale diff.
- **Prefetching is gated on `hasCompletedSessionRestore` and deferred through
  `scheduleIdleTask`.** The user's explicit constraint was not to regress
  task 018's launch. Nothing here runs before first paint, and startup restore
  issues no branch reads — a project's inventory is read on idle after restore
  finishes, or on arrival at the screen, whichever comes first.
- **`BranchesPanel` became fully controlled rather than keeping a fetch
  with an optional cache seed.** Two fetch paths for the same data (the panel
  and the prefetch) would have needed their own dedupe and generation rules.
  As a presentational component it also matches AGENTS.md's "keep domain logic
  out of visual components", and its tests got simpler.
- **`excludedPaths` deliberately left local.** Task 012 recorded that decision
  and nothing here contradicts it; the reported problem is loading, not lost
  checkbox state. Noted as a follow-up instead of silently reversing a prior
  decision.

# Implementation notes

- `src/diffCache.ts` (new): owns `DiffStore`, `DiffCache`, `createDiffCache`,
  `getDiffStore`, `releaseDiffCache`, and `fetchDiff` — all moved out of
  `changes.tsx` unchanged in behavior.
- `src/changes.tsx`: takes a `diffCache` prop and resolves its store through
  `getDiffStore` instead of holding a `useRef`. `diffState` is now seeded from
  the cache in the `useState` initializer, so a warm remount paints the diff
  on the first frame rather than after the effect. The batch warm-up's
  "is this result still current" check moved from comparing the old ref to
  comparing a `storeRef` — same semantics, including under StrictMode's
  double-invoke.
- `src/projectSessions.ts`: `ProjectSession` gained `branches`,
  `branchesError`, `isLoadingBranches`, and `branchesGeneration`,
  with `startBranchesLoad` / `applyBranches` / `applyBranchesError`
  mirroring the working-tree actions, including keeping the last known
  snapshot on a failed refresh.
- `src/branchesPanel.tsx`: no longer invokes anything. It renders
  `snapshot`/`error`/`isLoading` props, shows the spinner only with no cached
  snapshot, reuses `t.statusRefreshFailedNote` for the stale case, and hands
  a mutation's returned snapshot back through `onSnapshot`.
- `src/main.tsx`: added `refreshBranches` (generation-guarded and deduped
  per path via `branchesRequestsRef`, so the idle prefetch and a user
  arriving early share one Git process) and `commitBranches` (stores a
  snapshot a mutation already returned, bumping the generation first so an
  older read cannot land on top of it). Two effects drive it: an idle-time
  warm-up for an active project with nothing cached, and a revalidation on
  arriving at the Branches screen. `handleBranchChanged` now also
  refreshes the inventory, because Overview's quick switch/create reach the
  same commands from outside that screen. `scheduleIdleTask` was extracted
  from the existing module-level prefetch and now serves both; the prefetch
  list gained `branchesPanel` and `branchesDialog`, which task 016
  never added. `performCloseSession` calls `releaseDiffCache`; the generation
  counters intentionally survive a close, since resetting one mid-flight
  would let a stale response be accepted by a reopened session.
- `src/main.tsx` (Overview dropdown): `OverviewBranchQuickActions` no
  longer invokes anything. It takes `snapshot`/`isLoadingSnapshot` and derives
  the same bounded, worktree-filtered list of six from the session cache, and
  fires `onOpened` on each open so `App` can revalidate behind it. The spinner
  now needs both "no snapshot" and "still loading", so a failed first read
  falls through to the empty-state text instead of spinning forever, which
  the old `setBranches([])`-on-error path handled and a naive port would have
  lost. `OverviewPanel` gained `branches` / `isLoadingBranches` /
  `onQuickSwitchOpened` to pass it through.
- Follow-up not done here: `ChangesSelectionState.excludedPaths` exists in the
  session type but is still always empty, since the panel keeps that state
  locally. Either wire it or drop the field.

# Follow-up: live working-tree updates (design only, not implemented here)

Requested by the user alongside the dropdown fix: "podemos hacer que si los
ficheros cambian no haga falta darle al check changes? que se actualice en
tiempo real tipo vscode?". Investigated here, implemented in **task 020** —
this is a Rust subsystem with a new dependency, and `work/backlog.md` already
carried "Design repository watching, cancellation, and large-repository
performance tests **before** adding continuous background refresh". The user
chose to split it so this frontend task stays closable. The findings below
are what task 020 was written from.

## Where it would plug in

Nothing new is needed on the consuming side. `checkWorkingTree` in
`main.tsx` is already generation-guarded, already writes into the session,
and is already what the "Check changes" button calls. A watcher only has to
call it. Because `workingTree` is shared, Overview's counts would go live for
free — so the user's guess that this "only applies to the Changes panel" is
right about where it is *noticed*, not about where it lands.

## Approach

Rust-side `notify`, not the JS `@tauri-apps/plugin-fs` watch API: the plugin
route needs filesystem permissions scoped to arbitrary user-chosen paths,
which fights AGENTS.md's "keep Tauri capabilities minimal and explicit",
while a Rust watcher keeps the boundary at a narrow command as every other
feature here does. Shape:

- `notify` in `Cargo.toml`. Deliberately *not* `notify-debouncer-full`: a
  trailing debounce in the watcher thread is a few lines and avoids a second
  dependency, which matters given task 018's binary-size work.
- Managed `tauri::State` holding `Mutex<HashMap<String, Watcher>>`, keyed by
  the same canonical worktree root the frontend already uses as a session id.
- `watch_repository(path)` / `unwatch_repository(path)` commands, called
  where sessions open and close.
- The watcher thread coalesces bursts and emits one
  `repository-changed { path }` event per quiet period (~300 ms trailing).
- Frontend `listen("repository-changed")` → `checkWorkingTree(path)`. No new
  capability is required: `core:default` already includes `core:event:default`
  (listen/unlisten).

## The traps found while looking

- **`git status` feeds the watcher.** Running status refreshes `.git/index`'s
  stat cache, which writes the file, which fires the watcher, which runs
  status. Everything under `.git` must be ignored except a deliberate
  allowlist (`HEAD`, `refs/`, `MERGE_HEAD`, …) — those are what make a commit
  or branch switch made in a terminal show up.
- **Noise volume, not handle count, is the cost.** A recursive watch is one
  handle on Windows and macOS, but a `pnpm install` or a build in `target/`
  can produce thousands of events a second. The debounce is what makes this
  survivable; `.gitignore`-aware filtering (the `ignore` crate) is the next
  lever if profiling asks for it.
- **Windows buffer overflow.** `ReadDirectoryChangesW` can drop events under
  heavy churn; `notify` surfaces that as an error/rescan, which must be
  treated as "refresh everything" rather than ignored.
- **Refreshing mid-operation.** A refresh must be suppressed while that
  session has a save/publish in flight (`session.operation`), or the working
  tree can change under a plan the user is confirming.
- **The diff cache is invalidated by design.** Every auto-refresh produces a
  new `workingTree` object, which is exactly the signal that drops the diff
  cache from this task. Reading a diff while an unrelated file is saved would
  re-read it. Worth measuring before deciding whether the watcher should be
  scoped to the active project only, or paused while the Changes screen has
  an open diff.
- **Selection survives** — `resolveSelectedPath` already keeps the selected
  file when it is still present, so an auto-refresh will not move the user.

## Suggested scope for that task

Watch the active project only to start with (inactive projects already
refresh on activate), active-screen-agnostic, with the manual "Check changes"
button kept as the fallback for when a watch cannot be established — network
drives and some container mounts do not deliver events at all.

# Validation

- `pnpm run typecheck` (`tsc -b --pretty false`) — pass.
- `pnpm run test` (`vitest run`) — pass, 136 tests in 15 files (up from 128:
  3 new branches panel cases, 3 new reducer cases, 1 new Changes remount
  case, 1 new Overview dropdown case; several existing cases rewritten in
  place, none removed).
- `pnpm run build` (`tsc -b && vite build`) — pass. Chunking intact: entry
  335.61 kB (gzip 97.15), `changes` 301.88 kB, `branchesPanel` 7.74 kB,
  `branchesDialog` 11.90 kB. The `changes` chunk keeping its full size is
  the evidence that `diffCache.ts` did not drag it into the entry chunk. No
  clean before/after entry-size comparison was possible in this session, since
  the working tree also carries task 016's uncommitted work.
- No Rust changes, so `cargo` checks were not re-run.
- Not verified in a running app: the frontend needs Tauri's `invoke` for every
  screen involved, so a browser preview of the Vite dev server would only
  exercise error states. The behavior above is covered by tests, not by a
  live run.
