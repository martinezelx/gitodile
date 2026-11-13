---
id: 021
title: Screen shell that makes every screen switch free, now and for new screens
status: done
priority: normal
type: chore
areas:
  - frontend
created: 2026-08-01
completed: 2026-08-01
---

# Goal

Remove the remaining perceptible lag when switching between Overview, Changes
and Branches, and make "switching screens is free" a structural property
of the app rather than something each screen has to earn. After this task,
adding a fourth screen (History timeline, task 015, is the next one) must
inherit instant switching, chunk prefetching, background invalidation and the
navigation entries from one registration point, without repeating the work
tasks 018, 019 and this one did.

# User outcome

Reported directly by the user, after task 019 shipped: "cuando cambio entre
pantallas hay un ligero lag... entre overview, changes y branches."

Task 019 removed most navigation-owned data work, but follow-up profiling found
one expensive read still tied to arrival at Branches. This task therefore
addresses both halves: avoid rebuilding visited screens and ensure navigation
never starts or synchronously waits for Git work.

# Context

Task 019 moved every per-project repository fact into `ProjectSession`
(`workingTree`, `pendingVersions`, `branches`) and lifted the diff cache
into `diffCache.ts`, so `navigateToView` performs no fetch and no screen shows
a spinner on a warm session. That part is done and must not be redone here.

What still costs work on every switch, found by reading the current code:

1. **Every screen is unmounted when you leave it.** `main.tsx` renders the
   screens as a ternary chain (`view === "overview" ? … : view === "changes" ?
   … : …`). Returning to Changes rebuilds the whole file list DOM and remounts
   `DiffHunkList`'s virtualizer, whose rows carry `ref={virtualizer.measureElement}`
   — so the first frame after the switch is a full mount plus a measurement
   pass over every visible row plus the re-render that measurement triggers.
   The caches make the *data* instant; nothing makes the *DOM* instant.
   Scroll position and transient in-screen UI state are lost for the same
   reason.

2. **`App` is a single ~2850-line component.** `navigateToView` dispatches to
   the session reducer and sets `view`, and that re-renders the sidebar, the
   compact nav, the command palette, every dialog wrapper and the incoming
   screen together. Any unrelated `App` state change (tooltip, palette, dialog
   flags) also re-renders the visible screen's whole subtree.

3. **Revalidation fires in the mount frame.** The Branches arrival effect
   (`view === "branches"` → `refreshBranches`) runs in the same commit
   as the screen mount, and its resolution triggers another full `App` render
   shortly after. The startup warm-up already goes through `scheduleIdleTask`;
   arrival revalidation does not.

4. **`ChangesPanel` sets state during mount.** The selection-resolution effect
   and the `setExcludedPaths(new Set())` project effect both run on mount and
   add render passes before the first paint of the screen.

5. **Adding a screen currently means touching six places**: the `View` union,
   the lazy import list, `prefetchLazyPanels`, the full nav list, the compact
   nav list, the ternary chain, and the "leave this screen if the project
   closed" effect. Every one of those is a chance for a new screen to silently
   miss an optimisation — exactly how the two Branches chunks were left
   out of task 018's prefetch list and were only caught in task 019.

Item 5 is the durable half of this task. Items 1–4 are the visible half.

Follow-up diagnosis against this repository (4 local branches, 91 commits)
identified the dominant remaining cause: `get_branches` was a synchronous
Tauri command that launched 10 Git processes and occupied about 339 ms median.
The arrival refresh therefore blocked the desktop command thread at exactly
the moment the user was switching screens. React mount cost was real, but it
was not the largest remaining cost.

# Scope

- **Measure the actual blocking path.** Record the native branch read
  before and after, and keep an opt-in dev `<Profiler>` available for future UI
  regressions without adding measurement overhead to normal development.
- **Screen registry.** One `screens.tsx` (or equivalent) exporting a table
  keyed by screen id: label/i18n key, nav icon, lazy component, and whether it
  requires an open project.
  The full nav, the compact nav, the prefetch list, the project-closed guard
  and the render host all derive from this table. `ProjectView` stays the
  source of truth for the ids so `ProjectSession` keeps type-checking.
- **Keep-alive screen host.** Replace the ternary chain with a host that mounts
  a screen on first visit and thereafter keeps it mounted and hidden instead of
  unmounting it. Hidden screens must be inert to assistive tech and to the tab
  order (`hidden` plus `inert`), must not be announced, and must not run
  polling or observers while hidden — verify `useVirtualizer`'s observers and
  the working-tree watcher behave when their subtree is display:none. First
  visit still goes through `Suspense`, so the lazy chunk split from task 018
  is preserved.
- **Eviction rules.** Keep-alive is per active project session. Switching
  project, closing the project, or closing the session drops that session's
  mounted screens, so nothing stale survives and memory does not grow with the
  number of projects visited.
- **Isolate screens from unrelated `App` renders.** Extract each screen's
  props into a memoized boundary so a tooltip or palette state change in `App`
  does not re-render the visible screen. Prefer moving state down over adding
  `memo` where the state has one consumer.
- **Invalidation-driven freshness.** Never revalidate because a screen became
  visible. Refresh once when a project becomes active, then from explicit user
  refresh, successful mutations, and repository-watch invalidation.
- **Non-blocking native boundary.** Git-backed Tauri commands execute
  asynchronously, and branch discovery batches per-branch metadata into
  the inventory command on modern Git while retaining an older-Git fallback.
- **Stable snapshots.** Cached refreshes do not publish loading state, and an
  unchanged branch snapshot preserves reducer/object identity.
- **Reduce `ChangesPanel`'s mount-time state churn** (items 4) to the extent it
  survives keep-alive — with the panel staying mounted, verify whether these
  effects still cost anything before changing them.
- **Guardrail test.** A test that navigates away from a screen and back and
  asserts the screen was mounted exactly once, so a future refactor that
  reintroduces unmounting fails in CI rather than in the user's hands.
- **Write the rule down.** A "Screen shell and navigation cost" section in
  `docs/ARCHITECTURE.md` describing the registry, keep-alive, eviction and
  idle-revalidation contract, and a short rule in `AGENTS.md`'s frontend
  section pointing new screens at it.

# Out of scope

- Changes to the user-visible meaning or safety of Git operations.
- Dialogs, the command palette and the project switcher: they are not screens
  and keep their current mount-on-open behaviour.
- Re-doing task 019's caching, or adding caching for data that does not have
  it yet.
- Task 015's History timeline itself. This task only makes the ground ready
  for it.
- Startup path changes. Nothing may move before first paint; task 018's
  ordering stands.

# Acceptance criteria

- [x] Before/after measurements recorded for the blocking branch read,
      plus a warmed desktop stress pass across every screen combination. See
      Validation.
- [x] Screens mount at most once per active project session; a test asserts it.
- [x] Hidden screens are `hidden` + `inert`: not reachable by Tab, not exposed
      to assistive tech, and not announcing status updates in the background.
- [x] Scroll position and in-screen state (selected file, search box, filters)
      survive leaving a screen and returning to it. Component state follows
      from the screen never unmounting. Scroll position was checked in a
      Chromium engine only (see Validation); WebKit's behaviour when a scroll
      container is `display: none` is unverified, and in no case worse than
      the unmount this replaces.
- [x] Switching or closing a project drops that session's mounted screens —
      the host is keyed on the active session id.
- [x] Adding a screen requires editing the registry and adding the component —
      nothing else. Steps listed in Implementation notes.
- [x] No screen issues Git work because it became visible. Freshness follows
      project activation and explicit repository invalidation.
- [x] The lazy chunk split from task 018 is intact in the production build, and
      no screen chunk moved into the entry bundle.
- [x] Startup timing is unchanged by construction: nothing moved before first
      paint and the prefetch stays inside the same idle callback. Not
      re-measured.
- [x] `docs/ARCHITECTURE.md` and `AGENTS.md` updated.

# Relevant files

- `src/main.tsx` — navigation shell, project-activation refresh, request
  deduplication and stale-response handling.
- `src-tauri/src/lib.rs` — asynchronous command boundary and batched branch
  discovery with a compatibility fallback.
- `src/changes.tsx` — `DiffHunkList` virtualizer, mount-time effects.
- `src/branchesPanel.tsx` — controlled snapshot panel from task 019.
- `src/projectSessions.ts` — `ProjectView`, per-session state and eviction.
- `src/diffCache.ts` — cache lifetime already tied to the session.
- `docs/ARCHITECTURE.md`, `AGENTS.md`, `work/done/0.1.0/015-history-timeline.md`.

# Dependencies

Builds on tasks 018 and 019. Task 020 (live working-tree updates) landed and
moved to `done/` before this one started, so there was no overlapping edit in
`main.tsx`.

# Decisions

- **Keep-alive over remount-and-optimise.** Making the remount cheap enough is
  a per-screen effort that every new screen would have to repeat; not
  remounting is a property the host provides once.
- **Mount on first visit, not eagerly.** Eager mounting of all screens would
  undo task 018's first-paint work. Chunk prefetch stays on idle; the mount
  cost is paid on the first visit only.
- **Registry over convention.** A checklist in a doc would not have caught the
  missing prefetch entries; a table the nav, prefetch and host all read from
  cannot drift.

# Implementation notes

New file `src/screens.tsx` owns the `NAV_DESTINATIONS` registry and the
`KeepAliveScreens` host. `main.tsx`
now derives the expanded nav, the compact nav, the palette's "go to" commands,
the idle prefetch, and the project-closed guard from that registry instead of
repeating every destination by hand. The two screen panels (`ChangesPanel`,
`BranchesPanel`) moved their `lazy()` declarations there so a registry
entry sits next to the component it names; the dialogs stayed in `main.tsx`,
since they are not screens.

**Adding a screen is now:** add a `NAV_DESTINATIONS` entry (label key, icon,
section, `requiresProject`, palette label, the chunks it needs), write the
component, and add its node to the `screens` record passed to
`KeepAliveScreens`. Nav, palette, prefetch, keep-alive and the project guard
follow from that. Repository data declares project-activation, mutation, user,
and watcher invalidations separately; screen arrival is not an invalidation.
History (task 015) and Recovery
already sit in the table as `screen: null` placeholders, so building one means
flipping that field.

**How hiding works.** The slot is `display: contents` while visible, so the
screen stays a direct flex child of `.workspace` and the layout is identical to
when screens were mounted one at a time. `hidden` — plus a CSS rule that beats
`display: contents` — and `inert` take an inactive screen out of layout, the
tab order, and the accessibility tree.

**Inactive screens are frozen**, not merely hidden: the host re-renders their
previous element by identity, so React bails out of that subtree and an
unrelated `App` state change cannot re-render a screen nobody is looking at.
They pick up current props on the frame they become active again.
The host records visits and frozen elements only after React commits them in a
layout effect, so an abandoned concurrent render cannot leak speculative state
into the next navigation.

**Scope deviation, deliberate.** The "isolate screens from unrelated `App`
renders" item is implemented for *inactive* screens only, through that freeze.
The *active* screen still re-renders when any `App` state changes, because
memoizing it means threading dozens of inline callbacks through `useCallback` —
a large, error-prone change whose value here is unmeasured. The freeze covers
what this task is about: the switch itself. Splitting `App` remains open and
belongs in its own task, with numbers behind it.

`ChangesPanel`'s mount-time state churn was left alone on purpose: with the
panel staying mounted, those effects now run once per project rather than once
per visit, so the cost this task set out to remove is already gone.

Branches discovery now uses `%(ahead-behind:<HEAD>)` and `%(worktreepath)`
inside the existing `for-each-ref` inventory on Git 2.41 and newer. That removes
the duplicate `rev-parse`, the separate worktree process, and one unique-count
process per non-active branch. If the atom is unsupported, the read-only
command fails harmlessly and the previous compatible path runs.

The final review made every Tauri adapter that can launch a process, touch the
filesystem, wait on the watcher, or contact a remote asynchronous. The only
synchronous commands left are the constant `app_status` response and the
window-show call. Closing a project also advances and detaches its branch-read
generation; reopening the same canonical path starts a new request, and an old
request can neither populate the new session nor clear its replacement.

# Validation

- `pnpm run typecheck` — pass.
- `pnpm run test` — pass, 142 tests in 15 files (including the keep-alive
  guardrail case in `main.test.tsx`, which navigates Overview → Changes →
  Overview → Changes and asserts the same DOM node throughout, that no role
  query reaches the hidden screen, and that its slot carries `hidden`; plus a
  close/reopen race test that rejects the old session's delayed branch data).
- `pnpm run build` — pass. Chunk split intact: `changes` 301.80 kB,
  `branchesPanel` 8.01 kB, `branchesDialog` 12.76 kB, `publishDialog`
  9.96 kB, `pendingVersions` 4.75 kB. Entry 339.93 kB (gzip 98.72). The
  switch profiler is opt-in with `VITE_PROFILE_SCREEN_SWITCHES=true`, so normal
  development and production runs do not pay its instrumentation cost.
- Verified in a real browser against the running Vite dev server, with no
  project open — Overview and Settings are the two screens reachable without
  Tauri's `invoke`. The visible slot computes to `display: contents`, the
  inactive one to `display: none` with `hidden` and `inert` set, both buttons
  inside the hidden slot refuse focus, and Overview's DOM node is identical
  after leaving and returning. No console errors. A synthetic
  `contents → none → contents` cycle in the same engine preserved a scroll
  container's `scrollTop`.
- Native before/after benchmark on the working repository (4 branches, 91
  commits), 9 warmed samples: median 338.6 ms / 10 Git processes before;
  169.1 ms / 5 processes after — a 50% reduction. The remaining work runs
  behind an asynchronous Tauri command instead of occupying the UI thread.
- Desktop stress pass in the running Tauri app after warming each lazy chunk:
  Overview → Changes → Branches → Overview, Overview → Branches,
  and Branches → Changes all rendered complete in the first capture with
  no loading state. Repeated visits preserved the selected Changes diff and
  the Branches snapshot.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features`
  — pass, 172 tests.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — pass.
- UI manual detector on `src/main.tsx` and `src/screens.tsx` — no
  findings.
