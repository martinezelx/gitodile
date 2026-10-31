---
id: 042
title: Let features subscribe to repository invalidation instead of being wired in
status: done
priority: normal
type: chore
areas:
  - frontend
  - architecture
created: 2026-08-10
completed: 2026-08-11
parent: "038"
---

# Goal

Replace the read coordinator's positional per-feature parameters with registered
invalidation subscribers, so adding a screen that needs freshness does not mean
editing another feature.

# User outcome

No visible change. Freshness behavior — watcher coalescing, mutation
supersession, deferral during unsettled operations — must stay identical.

# Context

`createRepositoryReadCoordinator(repository, status, branches)` in
`src/features/repository/readCoordinator.ts` takes one positional controller per
dependent feature, and `refreshAll` and `refreshAfterMutation` call each by name:

```ts
void branches.refresh({ projectId: path, sessionEpoch: epoch });
...
branches.supersede(query);
```

Task 031's greenfield proof built a History-shaped screen and found this is the
one place a new screen cannot avoid touching another feature. Adding it meant a
fourth parameter plus two hardcoded calls, so the repository feature ends up
knowing about every feature that consumes invalidation, and the list grows with
each screen.

It is compile-checked and it works. It did not block History. But it is the only
seam in the architecture that gets worse with each addition, which makes it the
right thing to fix before History, Recovery and conflicts each add a line.

The refactor has a real trap. `refreshAll` is ordered on purpose: it reopens the
repository and dispatches identity first, then refreshes branches, then
awaits status. A naive subscriber list that fans out concurrently would change
which snapshot wins a race. Whatever replaces it must preserve ordering and the
await points, or prove with a test that the new order is equivalent.

ADR 0003 rejects "indirection with one concrete use". This has three consumers
today and a fourth arriving with History, so a registry here is justified —
but it must stay a list of subscribers, not a framework.

# Scope

- Introduce a narrow invalidation-subscriber contract — enough for `refresh` and
  `supersede` against a project/epoch query, and nothing more.
- Let the composition root register the status, branches and any future
  feature controllers as subscribers.
- Preserve `refreshAll`'s ordering guarantees and its identity-first dispatch.
- Keep the existing mutation-supersession, watcher-deferral and
  session-close semantics exactly as they are.
- Cover the ordering with a test that would fail if subscribers fanned out
  concurrently.
- Update the frontend feature guide §8, which currently records this as the one
  remaining gap for greenfield screens.

# Out of scope

- Changing what any feature does on invalidation.
- A general event bus, dependency container or plugin system.
- Moving the coordinator out of `features/repository`. Repository identity is
  genuinely the freshness owner; only the fan-out mechanism is at issue.

# Acceptance criteria

- [x] Adding a feature that consumes invalidation requires no edit inside
      `features/repository`.
- [x] `refreshAll` ordering and await points are preserved, with a test that
      catches reordering.
- [x] Existing repository, status and branches controller tests pass
      unchanged.
- [x] Watcher burst deferral, mutation supersession and session-close cleanup
      behave identically.
- [x] The frontend feature guide no longer lists this as a gap.
- [x] Full `AGENTS.md` validation passes.

# Relevant files

- `src/features/repository/readCoordinator.ts`
- `src/features/repository/controller.test.ts`
- `src/main.tsx`
- `docs/architecture/frontend-feature-guide.md`

# Dependencies

None. Should land before task 015 (History) if History is worked in parallel,
so History is not wired in by hand and then migrated.

# Decisions

- Subscribers, not an event bus. The coordinator keeps deciding *when* and *in
  what order* to refresh; it stops needing to know *who*.

# Implementation notes

## The contract

`RepositoryReadSubscriber` is `{ id, refreshOn, blocking, refresh(query),
supersede(query) }`. The factory is now
`createRepositoryReadCoordinator(repository, subscribers)` — a list, not
positional parameters, so a new feature appends in `main.tsx` and nothing inside
`features/repository` changes.

Everything a feature needs beyond the query is captured by the closure the
composition root registers. That is what kept the contract at "query in,
refresh or supersede out" as the task asked: the status subscriber closes over
the project runtime and the error mapper, so neither leaks into the type. It
also removed `mapError` from five coordinator signatures.

`readCoordinator.ts` no longer imports `../status` or `../branches`.

## Two fields that used to be invisible

The old code encoded both distinctions as syntax rather than data:

- **`blocking`** was a single `void` keyword. `branches.refresh(...)` was
  fire-and-forget while `status.refresh(...)` was awaited, and nothing said so.
- **`refreshOn`** was the `refreshAll` / `refreshStatus` split at the call site.
  It is now a property of the subscriber, and `refreshStatus` was renamed
  `refreshWorktree` because the scope, not the feature, is what it selects.

## Preserving the order, and proving it

`notify` runs two passes: start non-blocking subscribers, then await blocking
ones in registration order. That reproduces the previous sequence exactly —
identity dispatched first, branches started, status awaited — rather than
relying on registration order to imply it.

The ordering test was verified by breaking the code, not by reading it.
Replacing the two passes with `await Promise.all(selected.map(refresh))` fails
three tests: identity-before-refresh, background-starts-first-and-is-not-awaited,
and supersede-before-refresh. Without that check the suite would have passed a
concurrent fan-out.

## A related seam left alone, deliberately

`features/repository/cacheWarming.ts` still takes `ChangesController` and
`BranchesController` as named options, so a feature wanting speculative
warming on project activation does still edit `features/repository`. That is a
different mechanism from invalidation fan-out and the task scoped itself to the
latter; no consumer is asking for it yet. Recorded in the feature guide §9 so it
is a known boundary rather than a surprise.

## Desktop verification

The watcher path is the one that broke in task 031, so it was exercised in the
real app rather than only in tests. With the release build and the task-023
standard fixture, creating a file externally moved the reported count from 15 to
16 with no interaction and no console errors — `handleInvalidation` →
`refreshWorktree` → the status subscriber, end to end.

Warmed protocol unchanged: first diff 293 ms, warm switch p50 30.8 / p95
31.9 ms, 0 Git processes on warmed revisit, 0 console errors.

# Validation

```text
pnpm run check:frontend                   pass (248 tests, 29 files)
pnpm run build                            entry 376.11 kB raw / 107.88 kB gzip
cargo fmt --check / clippy -D warnings    pass
cargo test --all-targets --all-features   pass (199 tests)
```

Entry chunk grew 0.28 kB for the two subscriber literals in `main.tsx`, against
a 378 kB warning.
