---
id: 047
title: Make the frontend architecture guard actually inspect src
status: done
priority: high
type: chore
areas:
  - frontend
  - architecture
created: 2026-08-11
completed: 2026-08-11
parent: "038"
---

# Goal

Make `pnpm run check:architecture` cruise production code instead of nothing,
and resolve the violations that become visible once it does.

# User outcome

No visible change. The guard that three tasks and one ADR cite as the reason
dependency direction "is enforced automatically" starts actually enforcing it.

# Context

Task 041 discovered that `scripts/check-frontend-architecture.mjs` cruises
**zero modules** for `src`. Measured directly:

```text
with config, src            -> modules: 0
no config,  src             -> modules: 0
no config,  fixtures        -> modules: 5
src/**/*.{ts,tsx}           -> modules: 198
```

`dependency-cruiser` 18.1.1 expands a bare directory argument using its own
default extension list, which does not include `.ts`/`.tsx`. The seeded fixture
directory contains `.mjs` files, so the self-test has always passed — which is
exactly why nobody noticed the production half was inert. **Every rule in the
script has passed vacuously for `src` since task 026 created it.**

This matters beyond the script. Epic 022's criterion "Frontend and Rust
dependency directions are enforced automatically and have no production cycles"
was marked met, and ADR 0003 records `dependency-cruiser` as the accepted
mechanism. The Rust half (`architecture.rs`) is genuinely enforced; the frontend
half was not.

Switching the target to `src/**/*.{ts,tsx}` makes the guard see the code and
immediately reports findings that need triage rather than a blanket fix:

- **Type-only edges are not detected.** `isTypeOnly()` looks for
  `dependencyTypes` values `type-only`/`type-import`; this version reports
  `["local","import"]` for `import type` and never emits either. Setting
  `tsPreCompilationDeps: "specify"` did **not** help — the documented `typeOnly`
  and `preCompilationOnly` attributes were absent from all 425 dependencies.
  This needs real investigation: a resolver/config issue, or a defect in
  18.1.1.
- **Consequences of that.** `projectSessions.ts` type-imports
  `features/publish`, so the entry-to-`fileIcons` walk reports a static path
  that does not exist at runtime, and several feature-internal cycles
  (`tauriAdapter -> port`) are reported that are type-only.
- **Dynamic imports are detected correctly** (`dynamic: true`), and this one is
  a genuine design question rather than a false positive: Overview's
  `additionalPreloads` dynamically import `../publish/PublishDialog` and
  `../branches/BranchesDialog` — other features' internals. ADR 0003
  says ownership rules apply to dynamic edges. Routing them through each
  feature's `index.ts` is the obvious fix, but it changes what lands in which
  chunk, so it needs a before/after measurement, not just an edit.

Task 041 deliberately did not fix this. Triaging other features' violations
inside a task about moving primitives is how a scoped task becomes an
unscheduled migration — the failure mode epic 038's own decisions call out.

# Scope

- Change the cruise target so the guard sees `src`, and assert a plausible
  module count so a future glob typo fails loudly instead of silently passing.
- Diagnose type-only detection properly. Options to evaluate: a newer
  `dependency-cruiser`, a different `tsConfig`/resolver setting, or deriving
  type-only edges from the TypeScript compiler instead.
- Triage every violation the working guard reports. For each: fix the code, or
  record why the rule should not apply and adjust the rule with a comment
  explaining the case.
- Re-measure chunk sizes before and after any import reshaping; the entry chunk
  had 2.2 kB of headroom against the task-023 warning when this was written.
- Add a self-test proving the guard fails when `src` genuinely violates a rule,
  not only when the `.mjs` fixture does.

# Out of scope

- Weakening a rule to make a finding disappear. If a rule is wrong, say so in
  the task and change it deliberately.
- Rust's `architecture.rs`, which is genuinely enforced.

# Acceptance criteria

- [x] `pnpm run check:architecture` cruises the real `src` module graph, and
      fails if it ever cruises implausibly few modules again.
- [x] Type-only edges are classified correctly, or the inability to classify
      them is documented with the rules adjusted accordingly.
- [x] Every reported violation is fixed or explicitly, individually justified.
- [x] A seeded violation inside `src` (not only in the `.mjs` fixtures) proves
      the production half of the guard fails.
- [x] Chunk budgets re-measured and inside task-023 limits.
- [x] Epic 022's "dependency directions are enforced automatically" criterion is
      re-verified rather than assumed, and ADR 0003 records what the guard
      actually checked before this task.
- [x] Full `AGENTS.md` validation passes.

# Relevant files

- `scripts/check-frontend-architecture.mjs`
- `.dependency-cruiser.mjs`
- `scripts/architecture-fixtures/`
- `docs/adr/0003-adopt-a-modular-feature-architecture.md`
- `work/done/0.1.0/022-modular-feature-architecture.md`

# Dependencies

None. Should run before task 043, which documents what the guards enforce.

# Decisions

- Filed separately from task 041 rather than folded into it: the fix requires
  triaging violations across several features and a real investigation into
  type-only detection, neither of which belongs in a task about moving four
  primitives.

# Implementation notes

## One root cause, not two symptoms

The task was filed expecting a resolver quirk plus a separate type-only defect.
They are the same thing: **this project is on TypeScript 7.0.2, and
dependency-cruiser 18.1.1 is built against TypeScript 5's JavaScript compiler
API.** It cannot load it, and it degrades silently rather than failing.

That single fact explains both symptoms. Without the TypeScript compiler it does
not know `.ts`/`.tsx` are source files, so a bare `src` directory expands to
nothing; and it cannot distinguish `import type`, so `tsPreCompilationDeps` has
no effect at all. Proof for the second: cruising with `true` and with `false`
produced byte-identical graphs — 199 modules and 430 edges either way. The
documented `typeOnly` and `preCompilationOnly` attributes never appeared on any
of the 430 dependencies.

## Classifying erased edges without a parser

ADR 0003 rejected writing a parser against TypeScript 7's unstable API, so this
does not. `typeOnlySpecifiers` reads each file and records which specifiers
appear **only** in `import type` / `export type` statements; a mixed
`import { type A, B }` binds a value and stays a runtime edge. It classifies
edges dependency-cruiser already found rather than discovering any.

One subtlety cost a round: filtering the reported edge is not enough.
dependency-cruiser marks an edge `circular` using its own graph, so a genuine
runtime edge is reported as circular when the path *home* runs through an
`import type`. Checking only the reported edge left 46 of 93 violations
standing; walking every hop of `dependency.cycle` cleared them.

## Triage

93 violations at the start. After per-hop type classification: **4**. Every
cycle was an artifact — there are no runtime cycles in this codebase.

| Finding | Resolution |
| --- | --- |
| `status/port.ts` deep-imports `overview/pendingVersionsDomain` | Real, and worse than it looked: `PendingVersionsResult` and `SavedVersionSummary` were **defined twice**, in `publish/domain.ts` and in overview. ADR 0003 gives publish "pending versions" and forbids duplicating a wire shape. Overview's copy is deleted and both consumers point at `features/publish`. |
| `overview/screen.tsx` preloads `../publish/PublishDialog` and `../branches/BranchesDialog` | Real. Preloads now name each feature's public entry. |
| `overview/PendingVersionsSection.tsx` imports `changes/ChangesPanel` for `DiffResultView` | Real, and the correct fix makes a different rule fail. Recorded as the single entry in `ALLOWED_FEATURE_EDGES` with its measurement; see below. |

## The one exception, and why it is not a workaround

Exporting `DiffResultView` from `features/changes/index.ts` is the right
ownership fix, and it was tried. It creates a *static* barrel edge to
`ChangesPanel.tsx`, which imports the 255 kB icon set, and `main.tsx` imports
that barrel — so the entry chunk immediately gained a static path to
`fileIcons`. **The guard caught a regression this task introduced**, which is
the most convincing evidence it now works.

Both modules in the current edge are lazy, so nothing reaches the entry chunk
today. The real fix is an ~800-line extraction of the diff renderer, or making
the file-list icon lazy; both need work and one needs a desktop measurement, so
they are task 048. The allowance list has exactly one entry, carries its reason,
and the guard must pass with it empty when 048 lands.

## Proving the production half

The `.mjs` fixtures prove each rule fires but exercise JavaScript in a
directory. `src/architectureGuard.test.ts` runs the rules against `src`-shaped
input with an injected source reader: feature-internal detection, a cycle
through an erased import ignored, a fully-runtime cycle still reported, a mixed
import treated as runtime, and the `fileIcons` entry path reported for a value
import but not a type import.

Two small changes made that possible and are worth keeping: `main()` now runs
only as the CLI entry so the module is importable, and
`check-frontend-architecture.d.mts` types its exported surface so the test needs
no `any`.

`main()` also asserts the cruised module count against a floor. The guard now
prints it — "passed over 202 modules" — so the number is reviewable instead of
implicit, which is exactly what was missing for two months.

## Measurements

Entry chunk **dropped** from 376.11 kB to **373.97 kB**: routing preloads
through feature entry points and deleting the duplicated domain module more than
paid for the change. `fileIcons` remains its own 255.25 kB chunk with no static
entry path, now verified rather than assumed.

# Validation

```text
pnpm run check:frontend                   pass (253 tests, 30 files, 202 modules cruised)
pnpm run build                            entry 373.97 kB raw / 107.05 kB gzip
cargo fmt --check / clippy -D warnings    pass
cargo test --all-targets --all-features   pass (199 tests)
```
