---
id: 022
title: Introduce a modular feature architecture and a performance-safe screen blueprint
status: done
priority: high
type: epic
areas:
  - architecture
  - frontend
  - rust
  - performance
  - security
created: 2026-08-01
completed: 2026-08-10
---

# Goal

Refactor GitOdile into an incremental modular monolith organized around its
durable product domains, with thin application-shell and Tauri composition
roots. This epic coordinates the behavior-preserving tasks 023–031; it is not
implemented as one repository-wide rewrite.

# User outcome

The app behaves exactly as it does now, while new screens and workflows inherit
safe repository access, bounded native execution, project isolation, typed
freshness events, lazy loading, keep-alive behavior, accessibility, and
performance instrumentation from supported architectural contracts.

# Context

The current application has outgrown its scaffold. At the `bce8db0` starting
point for this epic (exact reproducible measurements belong to task 023):

- `src-tauri/src/lib.rs` is approximately 9,900 lines and combines transport,
  Git execution, parsing, domain decisions, mutations, errors, and tests.
- `src/main.tsx` is approximately 3,370 lines and combines shell UI, project
  sessions, request lifecycles, navigation, dialogs, and feature composition.
- `src/styles.css` is approximately 2,950 lines and `src/i18n.tsx` is
  approximately 1,880 lines. These counts are context, not success metrics.
- tasks 018–021 established performance and freshness guarantees that must not
  be rediscovered or weakened during each feature migration.

The architecture audit performed on 2026-08-01 found additional invariants the
original task did not make enforceable: Rust-side repository concurrency,
session incarnations distinct from canonical paths, bounded and cancellable
process execution, contract-tested IPC, domain-typed watcher events, inactive
screen lifecycle control, single-source lazy/preload declarations, numeric
performance budgets, and license-safe use of external references.

# Architectural direction

Use a modular monolith with vertical frontend feature slices, durable Rust
domain modules, and explicit ports only at real boundaries:

```text
app composition / screen registry
  -> feature UI + feature controller
    -> typed feature port
      -> frontend Tauri adapter
        -> thin Tauri command adapter
          -> Rust application/domain service
            -> repository access coordinator
              -> Git runner / filesystem / platform adapter
```

Dependency direction must be enforced in CI. Product-domain types stay with
their owner. Shared code is admitted only after two real consumers share a
stable concept; `shared/` must not become a miscellaneous directory.

# Non-negotiable invariants

1. Preserve user-visible behavior, command names, payloads, structured errors,
   state-token validation, recovery behavior, hook/signing failures, and local
   data handling until an independently approved task changes them.
2. First paint wins over speculative work. Screens remain lazy and prefetch
   only during idle time after startup restoration.
3. Screen arrival never triggers a repository read.
4. Cached snapshots remain visible during background refresh and preserve
   identity when unchanged.
5. A canonical worktree path identifies a project, but a distinct session
   epoch identifies each open/close/reopen incarnation.
6. Watcher events and responses cannot cross session epochs. Shared repository
   changes fan out to every open worktree with the same `commonGitDir`.
7. Rust, not the renderer, owns repository access authorization and
   concurrency. Related worktrees cannot execute conflicting mutations merely
   because frontend coordination failed.
8. Every native command has an explicit execution policy: classification,
   output caps, timeout, cancellation behavior, prompt policy, safe diagnostics,
   and concurrency limit where applicable.
9. `hidden` and `inert` provide accessibility hiding but do not by themselves
   suspend effects or subscriptions. Screen lifecycle must explicitly cover
   active, hidden, and evicted states.
10. Lazy loading and its primary preload use one source of truth so metadata
    cannot silently drift from the imported chunk.
11. Long lists/diffs retain bounded DOM work and virtualization.
12. Performance comparisons use recorded numeric budgets and a reproducible
    protocol, not the phrase “no material regression” alone.
13. GitButler is a research reference only. Its current FSL-1.1-MIT license
    prohibits copying code or creating a derivative competing architecture
    before the applicable future-license date. Record the studied revision and
    reimplement only independent principles.

# Child tasks and order

| Task | Status | Outcome | Depends on |
| --- | --- | --- | --- |
| 023 | Done 2026-08-08 | ADR, dependency map, legal research record, reproducible baselines and budgets | tasks 018–021 |
| 024 | Done 2026-08-08 | Rust application boundary, repository access coordinator and bounded Git execution | 023 |
| 025 | Done 2026-08-09 | Contract-tested IPC, session epochs and typed watcher invalidation protocol | 024 |
| 026 | Done 2026-08-09 | Frontend feature runtime, screen-module contract and dependency guardrails | 023, 025 |
| 027 | Done 2026-08-09 | Branches migrated as the reference vertical slice | 024–026 |
| 028 | Done 2026-08-09 | Repository/status/changes/diff reads migrated | 027 |
| 029 | Done 2026-08-09 | Save and publish mutation flows migrated without weakening safety | 027, 028 |
| 030 | Done 2026-08-09 | Feature-owned CSS and translations; deliberately outside the History critical path | 026–029 |
| 031 | Done 2026-08-10 | Integration audit, two defect fixes, Settings extraction, greenfield proof, measured closure and History unlock | 023–030 |

Execute dependency-ready tasks one at a time unless the user explicitly
approves parallel work. The preferred closure order is 023 through 031,
including task 030 before the final audit, so task 031 validates the complete
result and closes this epic once. Keep the application buildable and tests
green at every task/commit boundary.

## Task and commit boundaries

- One child task is one reviewed commit on `main`; epic-status and task-file
  updates belong to that same commit.
- Compatibility adapters stay in place until every consumer they protect has
  migrated. A task may not leave `main` requiring the next task to compile or
  restore existing behavior.
- Run the task's focused checks and the complete `AGENTS.md` command set before
  committing. Push and confirm CI before starting the next dependency step.
- Mark and move only the completed child task to `work/done/`; update this epic
  honestly without marking downstream criteria complete early.
- Commits are independently buildable checkpoints, not reorderable changes:
  dependency order remains authoritative.

# Out of scope

- A visual redesign or user-facing workflow change.
- History, Recovery, conflicts, pull/integration, or another new product flow.
- Replacing Tauri, React, system Git, or the local-first model.
- Copying GitButler code, macros, crate topology, tests, or product language.
- A crate per feature, an IoC container, abstract base classes, generic
  repositories, or indirection with one concrete use.
- Redux, Zustand, XState, React Query, or another dependency without the ADR's
  measured benefit and alternative analysis.

# Epic acceptance criteria

- [x] Tasks 023–031 are complete with their own validation recorded.
- [x] `main.tsx` and `src-tauri/src/lib.rs` are thin composition roots.
      `lib.rs` met it inside this epic (9,897 → 762 production lines).
      `main.tsx` needed two follow-up tasks it never assigned: task 031
      extracted Settings and task 040 extracted Overview, taking it from 3,367
      to 1,958 lines of app shell with no screen body. Satisfied 2026-08-11.
- [x] Frontend and Rust dependency directions are enforced automatically and
      have no production cycles. **This was marked complete prematurely.** The
      Rust guard was always real; the frontend guard cruised zero modules from
      the day task 026 created it, because dependency-cruiser cannot load
      TypeScript 7's compiler API and silently scanned nothing. Task 047 found
      it, made the guard inspect 202 real modules, and cleared the four genuine
      violations it then reported. True as of 2026-08-11.
- [x] Every command is classified and governed by Rust-side repository access
      and native-execution policies.
- [x] IPC payloads, error codes, session epochs, and watcher events have
      compatibility/serialization tests.
- [x] All functional screens inherit navigation, palette, lazy/preload,
      project guard, keep-alive, lifecycle, accessibility and profiling from
      one typed registration path.
- [x] Branches proves the complete vertical slice and request lifecycle;
      History can be implemented without adding responsibilities to a
      composition root.
- [x] Existing behavior and safety tests remain intact.
- [x] Before/after bundle, startup, screen-switch, memory, process-count and
      cross-platform results satisfy the budgets selected in task 023. The
      memory metric was revised by ADR 0004; macOS and Linux desktop runs
      remain an owned, bounded gap.
- [x] Final module tree and new-feature guide are recorded in durable docs.

# Dependencies

- Builds on tasks 018, 019, 020, and 021.
- Must complete before task 015 begins implementation.
- Must preserve safety behavior from tasks 010, 011, 012, 016 and watcher
  hardening from task 020.

# Decisions

- Task 022 is an epic; implementation belongs to tasks 023–031.
- The migration is a strangler sequence, never a big-bang rewrite.
- Rust enforcement is authoritative; frontend coordination is UX, not a safety
  boundary.
- Branches is the migration pilot and History is the first greenfield
  consumer after epic completion.
- CSS/i18n migration is separate from the critical architecture path.
- External research contributes principles only and must be license-auditable.

# Implementation notes

Child tasks own their detailed notes. Keep this file updated with task status,
material scope changes, and the final architecture summary.

Task 023 confirmed the proposed child boundaries and order without a scope
change. [ADR 0003](../../../docs/adr/0003-adopt-a-modular-feature-architecture.md)
accepts the vertical-feature/Rust-domain modular monolith, project-scoped
session runtime and strangler sequence. Its
[dependency map](../../../docs/architecture/023-dependency-map.md),
[performance baseline](../../../docs/architecture/023-performance-baseline.md)
and [GitButler research record](../../../docs/architecture/023-gitbutler-research.md)
are the comparison evidence for tasks 024-031.

Task 024 established thin Tauri adapters in `src-tauri/src/ipc.rs`, a checked
30-command execution-policy inventory and application authorization boundary,
a fair coordinator keyed by canonical `commonGitDir`, retained worktree/Git
path identities, bounded/cancellable Git execution, and the stable error owner.
Related worktree mutations are serialized in Rust while unrelated repositories
remain independent. Existing IPC, state-token, recovery, hook and signing
behavior remains compatible. Windows descendant cleanup is covered; the
documented macOS/Linux descendant limitation remains an explicit task-031
audit item.

Task 025 added a shared, versioned 31-command IPC contract checked from Rust
and TypeScript, a Rust-issued session epoch with explicit close invalidation,
and a typed/sequenced repository invalidation envelope. Migrated responses,
operations, caches and watcher events reject old incarnations. Worktree events
stay isolated while common-ref/config events coalesce and fan out once to all
related open worktrees. Windows verbatim and macOS `/private/var` watcher
aliases preserve Git-churn filtering. The checked compatibility inventory
names the remaining direct consumers and requires reads to retire during
026-028 and mutations by 029.

Task 026 established an explicit selector-capable project runtime, the typed
`ScreenModule` registration path, single-source lazy/preload declarations and
active/hidden/evicted lifecycle semantics. Current functional screens now
inherit navigation, command-palette metadata, project guards, keep-alive,
accessibility and profiling from feature-owned descriptors. Speculative cache
warming is owned by project activation or repository invalidation and deferred
until idle; screen arrival does not start whole-tree diff reads. Automated
dependency-direction and cycle checks, a seeded forbidden-edge fixture and the
new-screen guide make the contract enforceable.

Task 027 completed the first full read-and-mutation vertical slice. Branches now owns its domain types, typed port and Tauri adapter, epoch-keyed
bounded snapshot controller, hidden-screen lifecycle and UI under
`src/features/branches/`; navigation performs no feature read. Rust
parser/planner/workflow code and 31 focused tests moved from `lib.rs` to the
domain module while task 024's authorization/coordinator and task 025's IPC
contract remain intact. Automated architecture checks protect both sides.
Windows profiling recorded warm switch p95 values of 32.4/32.6 ms, bounded DOM
counts and zero Git process starts during navigation; build chunks remained
inside task 023's budgets. The durable reference-slice guide identifies the
mandatory contracts History can reuse without inheriting branch-specific
policy.

Task 028 moved repository identity, status/pending summaries and working-tree
changes/diffs into owned frontend controllers and Rust domain modules. Project
activation and typed invalidation now own idle-deferred batch diff warming;
screen navigation performs no read IPC. Epoch/generation isolation, stable
unchanged snapshot identity and bounded four-epoch/256-entry/approximately
40-MiB diff caches are covered by focused races and eviction tests. Existing
virtualized and Accessible text diff modes, popup behavior and exceptional
native output states remain intact. Windows build chunks stayed below task
023 warning budgets and the file-icon implementation remains lazy. Task 029
was the final consumer of the temporary root read compatibility re-exports.

Task 029 moved Save version and Publish changes UI/orchestration into owned
frontend features and their planners/workflows into Rust domain modules. Every
save, publish and branch planner/executor now requires a Rust-validated
session epoch; the legacy mutation compatibility inventory is empty, while
immutable state tokens still reject repository drift. Successful mutations
supersede older reads and coalesce follow-up invalidation once; publish commits
its authoritative pending result directly, and save performs a safe readback
because hooks may alter files. Related worktrees remain serialized by the
common-Git-directory coordinator, temporary-index/recovery guarantees and
redacted structured failures remain covered, and uncertain remote outcomes are
still reported truthfully.

Task 030 turned `styles.css` and `i18n.tsx` into eager composition entries.
The tested CSS order is tokens/base, app shell, shared primitives and
feature-owned styles; all 796 rules remain represented once and the closed
three-screen visual contracts retain their rendered regression coverage.
App/shared/feature translation namespaces compose synchronously, while exact
English/Spanish interfaces enforce per-owner key and formatter parity without
changing `useLanguage` or copy. Production CSS/JavaScript chunks remain below
task-023 warning budgets and `fileIcons` stays deferred.

Task 031 audited the finished result rather than the implementation notes, and
found two defects the migration had introduced or left standing. A nested
authorized read inside `list_unpublished_versions` cancelled the concurrent
visible status read, so every project failed its first "check for changes" with
a generic error; nested frames now inherit the parent's cancellation token. The
working-tree file list was never virtualized, so the mandatory 5,000-change
fixture mounted 1,000 rows against a 400-row failure budget; it now renders 21.
The audit also extracted the Settings overlay into `features/settings` behind a
typed port, removing the last seven direct `invoke` calls from a visual
component.

A throwaway History-shaped screen proved the greenfield contract end to end and
was removed: `lib.rs` needed three declarative registration lines and `main.tsx`
three wiring points, with no workflow logic in either. One gap is recorded
rather than fixed — a screen consuming watcher invalidation must still be added
to the repository read coordinator by hand.

Every task-023 budget passes on the release build. The memory metric was revised
by ADR 0004 after measurement showed summed working set double-counts pages
shared across a seven-process WebView2 tree: an Overview-only session already
read 405.1 MiB, while keep-alive for all three screens added 10.5 MiB. Private
bytes settle at 221.8 MiB against a 400 MiB failure threshold.

The epic closed with one criterion partially met and said so plainly: `lib.rs`
was a thin composition root, `main.tsx` was not, because no child task ever
owned the Overview and Settings screens. Epic 038 finished the job — task 031
extracted Settings, task 040 extracted Overview — and the criterion is now met.
Task 015 (History) is unblocked.

The residue is scheduled as
[epic 038](038-close-out-the-architecture-migration.md),
which carries the composition-root criterion to completion. Two patterns caused
most of it and are the transferable lesson: work assigned by layer leaves
anything nobody named unowned, and scaffolding outlives the scaffold unless
retiring it is somebody's task.

# Validation

Epic validation is performed in task 031 after every child task has recorded
its focused checks.
