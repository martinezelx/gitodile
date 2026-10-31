---
id: 044
title: Keep test-only modules out of production space and teach the guard to see them
status: done
priority: low
type: chore
areas:
  - frontend
  - architecture
created: 2026-08-10
completed: 2026-08-11
parent: "038"
---

# Goal

Move `src/testScreenModule.tsx` where the architecture guard recognizes it as
test-only, so the existing "production must not import a test module" rule can
actually fire.

# User outcome

No visible change. It closes a hole in a guard the project already relies on.

# Context

`scripts/check-frontend-architecture.mjs` reports a violation when a production
module imports a test-only one. It decides what is test-only with:

```js
/(?:^|\/)(?:test-fixtures|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/
```

`src/testScreenModule.tsx` matches none of those. It is a fixture that exists
purely so `screenModule.test.tsx` can prove the runtime contract without giving
a real feature a test-only responsibility — a good reason for it to exist, and
the wrong place for it to live. The guard currently classifies it as production,
so if a production file imported it the check would pass.

Nothing imports it from production today. This is about the rule being
enforceable, not about a live defect. It is filed as low priority for exactly
that reason.

`src/testSetup.ts` is referenced by the Vitest config rather than imported by
application code and is a different case; check it while here but do not assume
it needs the same treatment.

# Scope

- Move the fixture somewhere the guard classifies as test-only — a
  `__tests__` directory or a `.test.` suffix — and update its importers.
- Add a seeded self-test proving the production-imports-test rule fires, the way
  the feature-to-app edge is already self-tested in
  `scripts/architecture-fixtures/`. A rule with no self-test is how this hole
  survived.
- Review `src/testSetup.ts` and any other root module that exists only for
  tests, and record the decision for each.

# Out of scope

- Changing what the fixture does or the contract it proves.
- Reorganizing real test files. Colocated `*.test.tsx` beside their subject is
  the established convention and stays.

# Acceptance criteria

- [x] No module that exists solely for tests is classified as production by the
      architecture check.
- [x] A seeded fixture proves the production-imports-test rule fires, and the
      check fails if that self-test stops reporting.
- [x] All 242 frontend tests still pass, across the same 28 files.
- [x] Full `AGENTS.md` validation passes.

# Relevant files

- `src/testScreenModule.tsx`
- `src/screenModule.test.tsx`
- `scripts/check-frontend-architecture.mjs`
- `scripts/architecture-fixtures/`

# Dependencies

None.

# Decisions

- Add the self-test even though the move alone fixes the instance. The seeded
  feature-to-app edge is why that rule is trustworthy; this one deserves the
  same.

# Implementation notes

## What moved

`src/test-fixtures/` now holds both modules that exist only for tests:

- `runtimeTestScreen.tsx`, formerly `src/testScreenModule.tsx`, imported by
  `screenModule.test.tsx`.
- `testSetup.ts`, named by `vite.config.ts` as the vitest `setupFiles` entry.

`testSetup.ts` was not found by an import search — nothing in `src` imports it,
because the test runner loads it from config. It had exactly the same hole the
task was filed about: the guard classified it as production, so a production
file importing it would not have been reported. Moving it was the consistent
call rather than leaving one of the two behind.

`test-fixtures` is already in the guard's test-file pattern, so no rule needed
changing — the modules simply stopped lying about what they are.

## The seeded self-test caught its own mistake

The first attempt named the fixture `probe.test.mjs`. That satisfies the guard's
pattern, but it also matches vitest's collection glob, so vitest picked it up
and failed with "No test suite found" — and the failure was invisible because
`package.json`'s test script passes `--passWithNoTests`. The suite silently went
from 28 files to 29.

The fixture now lives in `features/history/test-fixtures/probe.mjs`: test-only
by directory for the guard, invisible to vitest. Worth recording because
`--passWithNoTests` will mask the same mistake again for anyone who adds a
fixture with a `.test.` name. Left in place rather than removed speculatively;
it is not this task's call.

## Honest scope of the guarantee

The seeded fixture proves the rule fires, and the guard fails if that self-test
ever stops reporting. It does **not** yet protect `src`, because the guard
cruises zero modules there — the defect task 041 found and task 047 owns. When
047 lands, this rule starts guarding production with no further work here.

Three seeded self-tests now run: feature to app composition, deep import past
`shared/ui`, and production to test-only.

# Validation

```text
pnpm run check:frontend                   pass (242 tests, 28 files, 3 seeded guards)
pnpm run build                            entry 375.83 kB raw / 107.78 kB gzip
cargo fmt --check / clippy -D warnings    pass
cargo test --all-targets --all-features   pass (199 tests)
```
