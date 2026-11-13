---
id: 020
title: Live working-tree updates without pressing Check changes
status: done
priority: normal
type: feature
areas:
  - frontend
  - desktop
created: 2026-07-31
completed: 2026-08-01
---

# Goal

When files change on disk, GitOdile notices by itself. The Changes screen
and Overview's counts reflect the working tree without the user pressing
"Check changes".

# User outcome

Requested directly by the user: "podemos hacer que si los ficheros cambian no
haga falta darle al check changes? que se actualice en tiempo real tipo
vscode? esto aplicaria creo unicamente al panel de changes."

Editing a file in another editor, or an AI agent writing to the repository,
updates the file list while GitOdile is open. "Check changes" stays as a
manual fallback for the cases a watch cannot cover.

# Context

Split out of task 019, which cached per-project state so screen switching is
instant but left refreshing entirely navigation- and action-triggered. The
design investigation lives in that task's "Follow-up: live working-tree
updates" section; this task implements it.

`work/backlog.md` already carried "Design repository watching, cancellation,
and large-repository performance tests before adding continuous background
refresh" — that design is what task 019 recorded, so this task is its
promotion, not a bypass.

The consuming side already exists: `checkWorkingTree` in `main.tsx` is
generation-guarded, writes into the project session, and is exactly what the
manual button calls. A watcher only has to call it. Because `workingTree` is
shared with Overview, its counts go live for free.

# Scope

- A Rust watcher built on `notify`, owned by managed Tauri state, keyed by the
  same canonical worktree root the frontend uses as a session id.
- `watch_repository` / `unwatch_repository` commands, driven by the session
  lifecycle (open, restore, close) for the active project.
- Event coalescing in the watcher thread: a trailing debounce so a build or an
  install produces one refresh, not thousands.
- Path filtering so GitOdile's own Git reads cannot retrigger the watcher,
  including `GIT_OPTIONAL_LOCKS=0` so a status read stops rewriting
  `.git/index`.
- A `repository-changed` event, and a frontend listener that refreshes the
  named project's working tree — suppressed while that session has a
  save/publish operation in flight.
- Tests: the pure decision functions (what counts as a relevant path, what the
  debounce does with a burst) as unit tests, plus one integration test that
  writes a file in a temporary repository and asserts a refresh is requested.

# Out of scope

- Watching projects that are not active. Inactive sessions already refresh
  when activated; adding them multiplies the OS-level cost for state nobody is
  looking at.
- `.gitignore`-aware filtering via the `ignore` crate. The debounce is the
  first-order fix; ignore rules are the next lever if profiling asks for one.
- Live-updating the branches inventory or the pending-versions list from
  watch events. This task is about the working tree.
- Any change to how diffs are read or cached.
- Large-repository performance *tests* as a deliverable. Measured informally
  here; the benchmark suite is its own backlog item.

# Acceptance criteria

- [x] Editing, creating, or deleting a file in a watched project updates the
      Changes list and Overview's counts with no user action.
- [x] GitOdile's own reads do not retrigger the watcher — no refresh loop when
      the app is left idle on the Changes screen.
- [x] A burst of filesystem activity produces a bounded number of refreshes.
- [x] Refreshes are suppressed while a save, publish, or branch
      operation is in flight for that project, and replayed when it ends
      rather than being dropped.
- [x] Closing a project stops its watcher; no watcher outlives its session.
- [x] A path that cannot be watched (a network drive, a permission failure)
      degrades to today's manual behavior instead of erroring at the user.
- [x] The selected file in Changes is not moved by an automatic refresh.
- [x] `pnpm run typecheck`, `pnpm run test`, `pnpm run build`,
      `cargo fmt --check`, `cargo clippy -- -D warnings`, and `cargo test` pass.

# Relevant files

- `src-tauri/Cargo.toml`
- `src-tauri/src/watch.rs` (new)
- `src-tauri/src/lib.rs`
- `src/projectSessions.ts`
- `src/main.tsx`
- `work/active/019-instant-screen-switching.md` (design notes)

# Dependencies

Task 019 for the session-level caching this refreshes into.

# Decisions

- **`GIT_OPTIONAL_LOCKS=0` on every Git invocation, rather than filtering
  `.git/index` out of the watch.** A status read refreshes the index's stat
  cache, which rewrites the file, which the watcher sees, which triggers
  another status read — a loop that never settles. Filtering `index` out would
  break the loop, but would also mean a `git add` run in a terminal never
  showed up. The environment variable stops GitOdile's *reads* from writing
  at all, which fixes it at the source and leaves the signal intact. Required
  locks (commit, checkout) are unaffected; only optional ones are disabled.
- **`notify` alone, no `notify-debouncer-full`.** The debounce needed here is
  a trailing quiet period with a ceiling — about fifteen lines in the watcher
  thread, and pure enough to unit-test as `burst_step`. A second dependency
  would have added file-id tracking this does not use, to a binary task 018
  spent effort shrinking.
- **The event carries the project path and one boolean, never a path list.**
  No file names, no contents. The frontend answers it by running the same
  `read_working_tree_status` the manual button runs, so the watcher cannot
  become a second, divergent source of truth about what changed — and nothing
  about the user's files crosses the process boundary because of a watch. The
  boolean (`repositoryStateChanged`, set for `HEAD`/`refs`/`packed-refs`)
  exists so an ordinary file save does not also re-read repository identity
  and the branch inventory; it says *which kind* of thing moved, not what.
- **An event for the Git directory itself is ignored.** Windows reports a
  write to the parent directory of every changed file, so treating `.git` as
  relevant re-admitted all the `objects` and `*.lock` churn the allowlist
  exists to filter — the integration test caught exactly this. The cost is
  that a linked worktree's `.git` *file* being rewritten (a
  `git worktree repair`) is not noticed until the next real change.
- **Active project only.** Inactive sessions already refresh on activation, so
  watching them would multiply OS-level cost for state nobody is looking at.
  The watch follows `projectPath`, so switching or closing a project moves it
  with no separate bookkeeping.
- **Failure to watch is `Ok(false)`, not an error.** Network shares, some
  container mounts, and an exhausted inotify budget are ordinary, not
  something to interrupt the user about. Those projects keep working exactly
  as they did before this task, through the manual button that stays in place.
- **`watch_with` exists so the pipeline is testable.** An `AppHandle` needs a
  running Tauri app, and none of the interesting behavior — filtering,
  debouncing, thread lifetime — has anything to do with Tauri. `watch` is a
  one-line wrapper that reports by emitting.
- **A linked worktree needs three locations watched, not one.** Its `HEAD`
  and index live in `<common>/worktrees/<name>`, outside the worktree root,
  and branch creation/deletion lands in the shared common directory. Watching
  only the root would make `git add` and external branch changes invisible
  there. The extra watches are best-effort: if they fail, the root watch
  still covers ordinary edits.
- **The event filter matches the *most specific* Git directory, not the
  first.** The private worktree directory sits inside the common one, so
  first-match would read every private `HEAD`/`index` event as
  `worktrees/...`, which is not on the allowlist, and drop it — silently, and
  only for linked worktrees. `innermost_git_dir` makes the caller's ordering
  irrelevant, and a test asserts both orderings agree.
- **Events that arrive mid-mutation are queued, not dropped.** Suppressing a
  refresh while a save/publish/branch operation owns the working tree
  is right; losing it is not, because the change that arrived is exactly the
  one the user will want reflected when the dialog closes. They coalesce into
  a single pending entry per project and replay on `finishSessionOperation`,
  keeping the stronger `repositoryStateChanged` of whatever arrived.

# Implementation notes

- `src-tauri/Cargo.toml`: `notify` 8.2 with `default-features = false` — only
  the platform backends, no `serde` (events are never serialized) and none of
  the alternative channel crates.
- `src-tauri/src/watch.rs` (new): `is_relevant_path` and `burst_step` as pure,
  unit-tested decisions; `WatcherRegistry` as the managed state holding one
  `RecommendedWatcher` per project. Dropping a watcher closes its channel,
  which ends its debounce thread — so `unwatch` is the entire teardown and no
  thread can outlive its watch.
- `src-tauri/src/lib.rs`: `GIT_OPTIONAL_LOCKS=0` added to `base_git_command`
  (one line, affects every Git call); `watch_repository` /
  `unwatch_repository` commands; `WatcherRegistry` registered via `.manage()`.
  `watch_repository` resolves the Git directory itself with
  `rev-parse --absolute-git-dir` and passes both it and `<root>/.git` to the
  filter, so a linked worktree's Git churn is filtered as thoroughly as a
  normal repository's.
- `src/projectSessions.ts`: `shouldRefreshOnWatchEvent`, a pure predicate over
  a session's operation phase, so the suppression rule is unit-tested rather
  than buried inside an event handler.
- `src/main.tsx`: a mount-once `listen("repository-changed")` whose handler
  lives in a ref (so it never closes over stale state), and a watch lifecycle
  effect keyed on `projectPath` and gated on `hasCompletedSessionRestore`, so
  launch gains nothing. The listener is skipped entirely outside Tauri, where
  there is no event bus.
- No capability change was needed: `core:default` already includes
  `core:event:default`, which allows `listen`/`unlisten`. Verified against
  `src-tauri/gen/schemas/desktop-schema.json`.
- Known trade-off, accepted: every automatic refresh produces a new
  working-tree snapshot, which by design invalidates task 019's diff cache, so
  an external edit while the user is reading a diff re-reads it. That is
  correct — a status line can stay identical while a file's contents change
  again, so reusing a cached diff there would show stale content — and the
  batch warm-up keeps it to one Git process. Worth revisiting only if it
  proves noticeable in a large repository.

# Validation

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — pass, no warnings.
- `cargo test` (in `src-tauri/`) — pass, 167 tests, 10 of them new. The
  `GIT_OPTIONAL_LOCKS=0` change touches every Git call in the app, and the
  pre-existing suite exercises it.
- `pnpm run typecheck` — pass.
- `pnpm run test` — pass, 137 tests (one new reducer case for the suppression
  rule).
- `pnpm run build` — pass; entry chunk 336.16 kB (gzip 97.31), 0.55 kB more
  than task 019's for the listener and lifecycle effect. Chunk split unchanged.
- `a_written_file_reports_once_and_git_churn_reports_not_at_all` is the one
  timing-sensitive test here. It polls rather than sleeping a fixed amount,
  and returns early instead of failing on a platform that refuses to watch. It
  caught a real bug during development: events on the Git directory itself
  were being reported, which would have made the whole filter useless on
  Windows.
- **Not verified in a running app.** The watcher needs a real Tauri process
  and no `tauri dev` session was run here. The Rust pipeline is covered end to
  end by the integration test (real filesystem, real `notify`, real debounce);
  what is unverified is the last hop — the Tauri event reaching the webview
  and the refresh being visible on screen. This should be checked manually
  before the task is marked done.
- 2026-08-01: closed on the user's confirmation that the committed behavior
  was exercised in the running app. That last hop is therefore attested by the
  user, not by a check recorded in this session.
