---
id: 216
title: Keep project switching fresh and preserve console sessions
status: done
priority: high
type: bug
areas:
  - frontend
  - rust
created: 2026-11-02
completed: 2026-11-02
parent:
queue:
---

# Goal

Implement the five improvements approved after the project-switching audit,
without allowing background repository updates to select a project.

# User outcome

Returning to a project shows its actual branch and changes, restarting watching
does not miss new events, and a project's console survives visits to other projects.
Restarting GitOdile respects an explicitly saved state with no active project.

# Scope and acceptance criteria

- [x] Watcher sequences remain increasing across registration replacement,
  watching off/on and suspension/resumption. Old registrations and closed epochs
  remain unable to reach a new registration.
- [x] An invalidation during a status read triggers a coalesced follow-up read;
  superseded/closed requests cannot commit or schedule that follow-up.
- [x] Activating an existing project refreshes branch/HEAD identity and local
  status, without fetching or making identity refresh select another project.
- [x] Startup restore preserves an explicitly stored null active project and
  displays Home. A missing non-null active project retains the existing fallback.
- [x] Console transcript, command recall and draft survive A → B → A, remain
  isolated by project and epoch, memory-only, and evicted on close. In-flight
  results and pending confirmations stay with their originating session.
- [x] Add focused regressions, validate affected flows in the running Windows
  app, and run `pnpm run check`.

# Out of scope

The separately reported close-A/select-B/late-close navigation race remains a
follow-up requiring reproduction. No Git mutation semantics, visual redesign,
release preparation, new branch/worktree or remote publication is included.

# Relevant files

- `src-tauri/src/watch.rs`
- `src/features/status/controller.ts`
- `src/features/repository/readCoordinator.ts`
- `src/runtime/project/sessions.ts`
- `src/features/console/`
- `src/app/App.tsx`
- [Architecture](../../../docs/ARCHITECTURE.md)

# Decisions

The maintainer requested implementation ahead of the queue on 2026-11-02.
Work stays on `release/0.5.0`. Existing Console, Home and project switcher
surfaces define the look; there are no new visual surfaces or tokens.
These changes are read-only repository queries and local application state;
they do not change Git history, files or remotes.

# Implementation notes

- Rust uses a registry-lifetime event sequence; native registration generations
  and session epochs retain their independent stale-callback protections.
- Status keeps duplicate direct refreshes deduplicated. Coordinated invalidations
  mark an in-flight read dirty and await one trailing read per burst; stale results
  are not stamped fresh. Close/mutation supersession clears queued work.
- Existing-project activation reads identity and worktree through the repository
  coordinator without remote access. Restore derives the screen from the final
  reducer selection and preserves an explicitly stored null.
- An explicitly App-owned console store retains each epoch's existing bounded
  transcript/recall, draft, provider and command state. Screens still unmount on
  project switches; hidden screens suspend subscriptions. Late results update only
  their original store entry; close invalidates that entry's request counter.
- Inspected GitButler's [watcher handler](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/gitbutler-watcher/src/handler.rs)
  for the narrow project-addressed event boundary. Its current Fair Source terms
  were checked; no source or assets were adapted. GitOdile's independent solution
  preserves its existing watcher/session architecture, so no new ADR is needed.

# Validation

- Focused frontend run: 94 tests passed across status, project sessions, console
  sessions/screen and App project/Home wiring.
- `cargo test --manifest-path src-tauri/Cargo.toml watch::tests --lib`: 8 passed.
- `pnpm run check:architecture` and `node scripts/check-docs.mjs`: passed.
- Windows Tauri dev validation used two temporary local repositories and a separate
  WebView profile. Dark/light themes: A's internal `help` transcript and draft
  survived A → B → A; B started independently. With watching off, an external
  branch switch in B appeared as `side` and one changed file on activation. After
  watching was re-enabled, a background change in A left B active. A second off/on
  cycle detected a new file in B (two unsaved files). Enabling startup restore,
  closing B with A still open, then reloading the window stayed on Home without
  selecting A. The temporary dev instance was closed afterwards. This is Windows
  runtime evidence, not macOS/Linux qualification or a full process-restart test.
- The first aggregate run passed frontend checks but Rust's all-target build
  could not replace the running dev executable (Windows error 5). The dev instance
  was closed and the repeated `pnpm run check` passed with exit 0: documentation,
  architecture, TypeScript, 1,922 frontend tests, production build, Rust formatting,
  Clippy, 694 Rust unit tests and two credential-helper integration tests. One
  existing real credential-store qualification test remains ignored. Vite retains
  its existing entry-chunk size warning. No commit, push or release was performed.

# Post-implementation review — 2026-11-02

The maintainer requested a further correctness review of the five improvements.
Three additional defects were reproduced with failing regression tests before
fixing them:

- A dependent observer could queue an invalidation after the trailing-read
  decision but before the in-flight entry was removed. Status now removes that
  entry and consumes its dirty flag atomically in the same `finally` callback.
- Returning to Console while its command was still running remounted a disabled
  prompt that never regained keyboard focus when the command finished. The new
  component now inherits the pending refocus intent from its running session.
- A late identity result could restart feature reads after close/reopen, even
  though the reducer correctly rejected the old identity. Both coordinated
  identity refresh paths now recheck the live epoch before notifying features.

The expanded focused suite passes 80 tests across six files. The delayed console
case is verified with a mocked port in the real component; no new native pending
command timing evidence is claimed. The original Windows runtime evidence above
remains separate. The repeated `pnpm run check` passed with exit 0: 1,926 frontend
tests, production build, documentation/architecture/TypeScript checks, Rust
formatting and Clippy, 694 Rust unit tests and two credential-helper integration
tests. The same existing credential-store qualification test remains ignored.
The separately noted late-close navigation race remains out of scope.
