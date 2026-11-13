---
id: 049
title: Resolve the TypeScript 7 incompatibility instead of working around it
status: done
priority: high
type: chore
areas:
  - frontend
  - architecture
  - platform
created: 2026-08-12
completed: 2026-08-12
parent: "038"
---

# Goal

Put the toolchain back on a combination where the architecture guard works
natively, and delete the two workarounds task 047 had to write to keep it
running on TypeScript 7.

# User outcome

No visible change. The guard that protects dependency direction stops depending
on a homemade classifier and a hand-picked glob, both of which have already
needed a bug fix each.

# Context

`dependency-cruiser` cannot load TypeScript 7's compiler API — it is built
against TypeScript 5's, and TypeScript 7 is the Go rewrite. It does not fail; it
degrades. Two symptoms, one cause:

1. It does not know `.ts`/`.tsx` are source files, so a bare `src` directory
   expands to **zero modules**. That is why every rule passed vacuously from
   task 026 until task 047.
2. It cannot distinguish `import type`, so `tsPreCompilationDeps` is a no-op and
   every erased edge looks like a runtime edge.

Task 047 worked around both: an explicit glob, and a classifier that reads
import statements to decide which edges compile away. That workaround has now
needed one correctness fix of its own — multi-line `import type` statements were
classified as runtime edges, silently, for 22 imports.

## The experiment

Measured in an isolated probe and then against this repository:

| dependency-cruiser | TypeScript | modules from bare `src` | `type-only` emitted |
| --- | --- | ---: | --- |
| 18.1.1 (pinned) | 7.0.2 (current) | 0 | no |
| 18.2.0 | 7.0.2 | 0 | no |
| 18.1.1 (pinned) | 6.0.3 | 3 | yes |
| 18.2.0 | 6.0.3 | 3 | yes |

**TypeScript is the only variable that matters.** Upgrading dependency-cruiser
to 18.2.0 changes nothing on TypeScript 7, and the pinned 18.1.1 already works
correctly on TypeScript 6. The upgrade is optional and independent.

Against this repository on TypeScript 6.0.3: a bare `src` cruises **205
modules** and dependency-cruiser reports **109 `type-only` edges** of 444
natively.

The codebase compiles unchanged under TypeScript 6.0.3. A forced full
typecheck took **5.5 s** against **2.0 s** on TypeScript 7 — 2.75× slower, and
3.5 seconds in absolute terms.

## One finding, and a correction to it

**Written when this task was filed, and wrong.** Comparing the homemade
classifier against the native flag over 444 edges showed 439 agreeing and 5
where dependency-cruiser called an edge `type-only` that is plainly a runtime
import — `modalFocus.ts -> react`, which imports `useEffect` as a value beside
`type React`. The conclusion drawn was that the native flag is unreliable and
the homemade classifier had to stay.

That was a measurement error, found during implementation. dependency-cruiser
emits **one record per import statement**, not one per edge: `react` arrives
twice, once flagged `type-only` and once not. The comparison script iterated
records and compared each against a per-specifier set, so the type-only record
of a mixed import always looked like a disagreement. The native data was correct
the whole time.

What survives from the finding is the rule, which still matters: **an edge is
erased only if every import of it is type-only.** Aggregate the records per
edge before deciding. Reading either record alone erases an edge the bundler
still follows — the direction that hides a real cycle or a real static path to
the icon set. With that aggregation the homemade classifier is redundant and is
deleted.

# Scope

- Move `typescript` to `6.0.3` and verify the codebase compiles unchanged.
- Move `dependency-cruiser` to 18.2.0. Not required by this change and taken on
  its own merits at the maintainer's decision; applied and verified *after* the
  TypeScript change so a failure would be attributable.
- Drop the explicit `SOURCE_GLOB` workaround if a bare `src` is equivalent, or
  keep it and say why. Keep the cruised-module floor either way — it is what
  makes a future regression loud.
- Take type-only classification from dependency-cruiser's `dependencyTypes`,
  aggregated per edge, and delete the homemade classifier. (Filed as "keep it";
  see the correction above.)
- Re-run task 047's triage from scratch on the new toolchain and confirm it
  still reports zero violations; record the module and edge counts.
- Record the compile-time cost, and the condition for going back to TypeScript
  7, in an ADR — this is deliberate, temporary debt, not a preference.

# Out of scope

- Changing any application code to suit the compiler. If the codebase does not
  compile under 6.0.3, stop and report rather than reshaping code around a
  tooling constraint.
- Replacing dependency-cruiser. If the answer turns out to be a different tool,
  that is a new ADR and a new task.

# Acceptance criteria

- [x] `typescript` is `6.0.3`, `pnpm run typecheck` passes with no source
      changes, and the measured cost is recorded.
- [x] The guard cruises the real module graph with no glob workaround, or the
      glob is kept with a recorded reason.
- [x] The cruised-module floor still fails loudly if the target stops matching.
- [x] Type-only classification is cross-checked against the native flag, with
      the mixed-import disagreements understood and covered by a test.
- [x] Task 047's triage rerun reports zero violations; counts recorded.
- [x] An ADR records the downgrade, its cost, and what would let the project
      return to TypeScript 7.
- [x] Full `AGENTS.md` validation passes, and CI is green on all three runners.

# Relevant files

- `package.json`, `pnpm-lock.yaml`
- `scripts/check-frontend-architecture.mjs`, `.dependency-cruiser.mjs`
- `src/architectureGuard.test.ts`
- `docs/adr/`

# Dependencies

Task 047, which produced the diagnosis and the workarounds this removes.

Task 043 should run after this one: it documents what the guards enforce, and
that description changes here.

# Decisions

- The downgrade is justified by the guard, not by the compiler. TypeScript 7 is
  the faster and more current choice; the 3.5 s it saves on a full typecheck is
  worth less than an architectural control that has already spent two months
  enforcing nothing. Revisit the moment dependency-cruiser supports TypeScript
  7.

# Implementation notes

## Applied in sequence, not together

`typescript` went to 6.0.3 first and was verified on its own: the codebase
compiles unchanged, and the guard immediately cruised 205 modules from a plain
`src` target with 109 of 444 edges reported `type-only`. Only then did
`dependency-cruiser` go to 18.2.0, which changed nothing observable — as
expected, since it already worked on TypeScript 6.

Keeping them apart cost nothing and means a failure would have been
attributable. They are separate commits for the same reason.

## Both workarounds are gone

- The explicit `src/**/*.{ts,tsx}` glob is replaced by the plain `src`
  directory. Identical result, 205 modules.
- `typeOnlySpecifiers` — the regex that read import statements — is deleted,
  along with the injected `readSource` seam that existed only to test it.
  Classification now comes from `dependencyTypes`.

The **cruised-module floor stays**, and the guard still prints the count. The
failure this whole thread is about was silent; a target that stops matching must
be loud regardless of which tool version is underneath.

## What replaced the classifier

One aggregation, and it is the part that must not be simplified later:

```js
erasedEdges.set(key, (erasedEdges.get(key) ?? true) && typeOnly);
```

An edge is erased only if *every* record for it is type-only. See the correction
above for why reading a single record is wrong.

## Verified by failing

The guard was made to fail before it was trusted. Seeding a real deep import in
`src/features/status/ChangeCategoryIcon.tsx` produced:

```text
Frontend architecture check failed:
- Feature "status" imports internal module src/shared/ui/autoHideScrollbar.ts owned by shared/ui.
```

and passed again on restore. Task 047's triage rerun on the new toolchain
reports **zero violations** over 205 modules and 444 edges.

## Cost

Forced full typecheck: **4.5 s** on TypeScript 6.0.3 against **2.0 s** on 7.0.2.
Slightly better than the 5.5 s measured during the analysis. Bundle output is
byte-identical — entry 373.97 kB, `fileIcons` 255.25 kB still deferred — which
is the expected result for a compiler change that emits the same JavaScript.

[ADR 0005](../../../docs/adr/0005-pin-typescript-6-until-the-architecture-guard-supports-7.md)
records the decision and the exit condition: return to TypeScript 7 when
dependency-cruiser can load its compiler API, checkable in ten minutes with a
scratch project.

# Validation

```text
pnpm run check:frontend                   pass (253 tests, 30 files, 205 modules cruised)
pnpm run build                            entry 373.97 kB raw / 107.05 kB gzip
cargo fmt --check / clippy -D warnings    pass
cargo test --all-targets --all-features   pass (199 tests)
```

Guard baseline on the new toolchain: 205 modules, 444 edges, 109 reported
`type-only`, 0 violations.
