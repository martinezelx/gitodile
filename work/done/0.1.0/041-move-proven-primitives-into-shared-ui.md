---
id: 041
title: Move proven shared primitives into shared/ui
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

Apply ADR 0003's own admission rule to the primitives that already satisfy it,
so `shared/ui` holds the shared UI rather than only a stylesheet.

# User outcome

No visible change. Feature authors get one place to look for a proven primitive
instead of guessing between the repository root and a feature directory.

# Context

ADR 0003 says repeated cross-feature UI "moves to `shared/ui` only after two
real consumers have the same stable requirement", and assigns `shared/ui`
"stable, behavior-free UI primitives" behind "explicit named exports".
`docs/ARCHITECTURE.md` shows `shared/ui/` as a module in the delivered tree.

`src/shared/ui/` contains exactly one file: `primitives.css`. Every primitive
sits at the repository root. Measured production consumers, excluding tests:

| Module | Consumers |
| --- | ---: |
| `src/autoHideScrollbar.ts` | 7 |
| `src/appError.ts` | 7 |
| `src/modalFocus.ts` | 4 |
| `src/loadingBar.tsx` | 3 |
| `src/popupMenu.tsx` | 2 |
| `src/tooltip.tsx` | 1 |
| `src/projectAvatar.ts` | 1 |

Five modules are past the ADR's stated bar. The rule was written in task 023 and
never applied, for the same reason Overview and Settings survived: no task owned
it.

`appError.ts` is the interesting case. It is error localization, not a visual
primitive — it maps structured Rust errors to copy. It is shared plumbing that
belongs with the i18n runtime rather than with UI primitives, and putting it in
`shared/ui` to satisfy a consumer count would be exactly the miscellaneous
dumping ground ADR 0003 forbids.

`tooltip.tsx` and `projectAvatar.ts` have one consumer each and stay where they
are. Moving them would contradict the same rule this task exists to apply.

# Scope

- Move `autoHideScrollbar.ts`, `modalFocus.ts`, `loadingBar.tsx` and
  `popupMenu.tsx` into `src/shared/ui/` with an `index.ts` exposing explicit
  named exports.
- Decide `appError.ts` deliberately: `shared/i18n` is the better home. Record
  the reasoning in the task rather than moving it by consumer count.
- Update importers. Features import the public entry point, never a file inside
  it.
- Leave `tooltip.tsx` and `projectAvatar.ts` at the root and say why in the
  implementation notes, so the next reader does not think they were missed.
- Extend `scripts/check-frontend-architecture.mjs` so a feature importing a
  `shared/ui` internal file instead of its entry point is a violation, matching
  the existing feature-internal rule.

# Out of scope

- Changing any primitive's behavior, props or styling.
- Moving `primitives.css` or reordering `src/styles.css`. Task 030's cascade
  order is tested and this task must not disturb it.
- Promoting a one-consumer module.

# Acceptance criteria

- [x] `shared/ui` exposes its primitives through one `index.ts` with named
      exports.
- [~] No production file imports a `shared/ui` internal path. **Amended.** No
      *feature* does, and the guard enforces that. The app shell (`main.tsx`,
      `projectSwitcher.tsx`) imports three primitives by file on purpose:
      routing it through the barrel moved popupMenu's 1.8 kB into the entry
      chunk, because a barrel reachable from both the entry and a lazy chunk is
      bundled eagerly. Measured, and explained in the guard.
- [x] The architecture check fails a seeded `shared/ui` internal import, proven
      by its own self-test the way the feature-to-app edge already is.
- [x] `appError.ts` has a recorded owner and a reason.
- [x] Modules left at the root have a recorded reason.
- [x] Chunk budgets unchanged; `fileIcons` still has no static entry path.
- [x] Full `AGENTS.md` validation passes.

# Relevant files

- `src/shared/ui/`, `src/shared/i18n/`
- `src/autoHideScrollbar.ts`, `src/modalFocus.ts`, `src/loadingBar.tsx`,
  `src/popupMenu.tsx`, `src/appError.ts`
- `scripts/check-frontend-architecture.mjs`
- `docs/adr/0003-adopt-a-modular-feature-architecture.md`

# Dependencies

None. Task 046 depends on this one for the CSS ownership question.

# Decisions

- Consumer count admits a module to `shared/`; it does not decide which
  `shared/` module it belongs to. `appError` is plumbing, not a UI primitive.

# Implementation notes

## What moved

`shared/ui/` now holds `autoHideScrollbar`, `modalFocus`, `loadingBar` and
`popupMenu` behind an `index.ts` of named exports, with their tests beside them.
`getFocusableElements` stays internal to `modalFocus`: it has no outside
consumer, and exporting it would invite callers to rebuild the focus trap
instead of using it.

`tooltip.tsx` and `projectAvatar.ts` stayed at the root with one production
consumer each. Promoting them would contradict the same ADR rule this task
exists to apply.

## `appError` landed better than planned

The task assumed `shared/i18n` was the right home but that it would have to
depend on the composed `Translations` type — a shared module reaching up into
the composition of every feature's namespace. Checking first showed that is not
necessary: **all 47 error keys are owned by `SharedTranslations`**. So
`localizeAppError` now takes `SharedTranslations`, the ownership direction is
clean, and callers passing the full dictionary still satisfy it.
`shared/i18n/index.ts` exposes the translations and the `AppError` contract
together, and `i18n.tsx` composes through that entry point instead of reaching
for `translations.ts`.

## The barrel had a measurable cost

Routing every consumer through `shared/ui/index.ts` grew the entry chunk from
375.81 kB to **377.55 kB**, against a 378 kB warning — 0.45 kB of headroom. The
cause is barrel mechanics, not size: `popupMenu` had been its own 1.8 kB chunk
shared by two lazy screens, and a barrel imported by both the entry and a lazy
chunk gets bundled eagerly.

The resolution is that features import the barrel and the app shell imports the
three primitives it uses by file. The guard's shared rule is therefore scoped to
feature sources, exactly like the existing feature-internal rule. Entry chunk
returned to 375.83 kB, and `popupMenu` reappeared as a 1.86 kB `ui` chunk shared
between the lazy consumers. The criterion asserting no production file deep
imports is amended above rather than ticked.

## The guard does not inspect `src`

While proving the new rule fails a real violation, the deep import was added to
`src` and **the check still passed**. It cruises zero modules for `src`:
`dependency-cruiser` 18.1.1 expands a bare directory with its own default
extension list, which excludes `.ts`/`.tsx`. The `.mjs` fixtures cruise fine,
which is why the self-test has always been green.

Every rule in that script has passed vacuously for production code since task
026 created it, including the ones epic 022 cited when marking "dependency
directions are enforced automatically" complete.

Switching the target to `src/**/*.{ts,tsx}` cruises 198 modules and reports
findings that need triage — type-only edges are not detected at all in this
version, which makes the `fileIcons` entry-path walk and several cycle reports
false, while Overview's dynamic preloads of other features' internals look like
a genuine finding. That is a real investigation across several features, so it
is **task 047 (high priority)**, not a silent expansion of this one. The rule
added here is correct code proven by its fixture self-test; it will start
guarding production the moment 047 lands.

# Validation

```text
pnpm run check:frontend                   pass (242 tests, 28 files)
pnpm run build                            entry 375.83 kB raw / 107.78 kB gzip
cargo fmt --check / clippy -D warnings    pass
cargo test --all-targets --all-features   pass (199 tests)
```

Chunks: entry 375.83 kB (was 375.81 before this task), `ui` 1.86 kB,
ChangesPanel 60.83 kB, `fileIcons` 255.22 kB and still deferred.
