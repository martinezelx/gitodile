---
id: 040
title: Give Overview its own screen container and finish the composition root
status: done
priority: high
type: chore
areas:
  - frontend
  - architecture
  - performance
created: 2026-08-10
completed: 2026-08-11
parent: "038"
---

# Goal

Move the Overview panel out of `main.tsx` into `features/overview`, so every
functional screen owns its own container and `main.tsx` becomes a composition
root in fact rather than in intention.

# User outcome

No visible change. Overview must look and behave identically, including its
change preview, placeholder states and branch quick actions.

# Context

Epic 022's criterion "`main.tsx` and `src-tauri/src/lib.rs` are thin composition
roots" is the one criterion the epic could not mark complete. `lib.rs` reached
762 production lines from 9,897. `main.tsx` reached 2,730 from 3,367 — task 031
extracted Settings, but Overview remains.

`features/overview/screen.tsx` declares `container: { kind: "host-owned" }` with
a comment saying the shell still composes the visual panel. Its reads already
belong to repository, status and publish controllers, so what remains in
`main.tsx` is roughly 660 lines of presentation: `OverviewPanel`,
`OverviewChangesPreview`, `OverviewPlaceholderCard`,
`OverviewBranchQuickActions` and their icon and label tables.

The reason it survived is worth stating: no task in 023–030 was ever assigned
the Overview screen. The migrations were organized by layer, so a screen nobody
named was nobody's job.

Overview is the first-paint screen with no project open, so this task carries a
real performance constraint the other feature migrations did not. It must stay
in the entry path — making it lazy would put a chunk fetch in front of first
paint and break task 018's guarantee. `createLazyScreenContainer` is therefore
the wrong tool here; Overview needs a container that is eager.

# Scope

- Move the Overview panel and its private subcomponents into
  `src/features/overview/`, keeping props-and-callbacks shape so it receives
  values from `App` rather than reaching for controllers itself.
- Replace `container: { kind: "host-owned" }` with a real eager container, or
  extend the screen-module contract with an explicit eager container kind if
  none fits. Prefer extending the contract over leaving one screen special.
- Move Overview-owned copy into `features/overview/translations.ts` and any
  Overview-only rules into `features/overview/overview.css`, following task
  030's namespace and cascade rules.
- Reduce `App` to shell state, project session wiring and screen composition.
- Update `docs/ARCHITECTURE.md`'s "The tree epic 022 actually produced" section
  and ADR 0003's "Observed after the task-031 audit" so they no longer describe
  a residue that is gone.

# Out of scope

- Redesigning Overview. Task 033 closed its visual contract; this is a move.
- Making Overview lazy.
- `App`'s remaining `invoke` calls for watcher and session lifecycle. ADR 0003's
  dependency matrix assigns those to the composition root.

# Acceptance criteria

- [x] `main.tsx` contains no screen body and no feature presentation.
- [x] Overview is registered with a real container like every other functional
      screen; no descriptor declares `host-owned`.
- [x] Zero Git processes before the first content frame, re-measured with
      `scripts/031-cdp-probe.cjs`.
- [x] Entry chunk stays below the task-023 warning of 378 kB raw.
- [x] Warm switch p50/p95 and visible descendants stay inside task-023 budgets.
- [x] Overview's existing rendered regression coverage still passes unchanged.
- [x] Epic 022's composition-root criterion is updated from partial to met.
- [x] Full `AGENTS.md` validation passes.

# Relevant files

- `src/main.tsx`
- `src/features/overview/`
- `src/screenModule.tsx`
- `docs/ARCHITECTURE.md`, `docs/adr/0003-adopt-a-modular-feature-architecture.md`
- `work/done/0.1.0/022-modular-feature-architecture.md`

# Dependencies

None. Task 043 documents the result and should run after this.

# Decisions

- Overview stays eager. First paint outranks module tidiness, and task 018's
  no-work-before-first-paint guarantee is an acceptance constraint, not
  optional cleanup.

# Implementation notes

## What moved

`src/features/overview/OverviewPanel.tsx` (783 lines) now owns `OverviewPanel`
and everything only it used: `OverviewChangesPreview`,
`OverviewPlaceholderCard`, `OverviewBranchQuickActions`,
`StatusAnnouncement`, the lazy `OverviewFileTypeIcon`, the category label and
icon tables, `repositoryStatus`, and `ProjectPath` with its folder icon. All
three of those last helpers were used by nothing else, which is a decent sign
the seam was in the right place.

`main.tsx` went from 2,730 to **1,958 lines**. What is left is app shell:
command palette, titlebar menu, theme, keyboard shortcuts, project session
wiring and screen composition. No screen body, no feature presentation.

`ProjectPath` is exported from the feature because `main.test.tsx` tests it
directly; that import moved to `./features/overview`.

## The eager container

`createLazyScreenContainer` was the wrong tool. Overview is what the app paints
with no project open, so a lazy chunk would put a fetch in front of first paint
and break task 018's guarantee. Rather than leave one screen special, the
contract gained `createEagerScreenContainer`: same `{ Component, preload }`
shape, `preload` resolves to the component immediately, so
`prefetchScreenChunks` calls it blindly like any other screen.

With both container kinds real, `container: { kind: "host-owned" }` had no
remaining use, so **the variant was removed from `FunctionalScreenModule`
entirely**. A screen the shell composes by hand is now a type error rather than
a convention someone has to remember. That is the part of this task worth
keeping: the criterion was "no descriptor declares host-owned", and deleting the
option is stronger than deleting the usages.

## Translations and CSS were already done

The task listed moving Overview-owned copy and rules into the feature. Both were
already correct: every translation key Overview uses lives in the `overview` or
`status` namespace and none in `app`, and no Overview class is defined in
`app-shell.css`. Task 030 did that work. The only cross-feature detail left is
that Overview *uses* classes owned by `changes`, `status` and `branches`
(`.changes-preview__*`, `.status-breakdown`, `.branches-quick-switch__*`),
which is consumption rather than ownership and was left alone.

## Measurements

Release build, Windows 11, task-023 standard fixture, via
`scripts/031-cdp-probe.cjs`:

| Measure | Budget | Result |
| --- | --- | ---: |
| Git processes at first content frame | fail > 0 | **0** |
| First Git process after content painted | — | +24 ms |
| Warm switch p50 | warn > 40 ms | 28.8 ms |
| Warm switch p95 | warn > 50 ms | 30.2 ms |
| First Changes selected diff | warn > 750 ms | 397 ms |
| Warmed revisit Git processes | fail > 0 | 0 |
| Visible descendants, Changes | warn > 1,200 | 340 |
| Console errors | any | 0 |
| Entry chunk raw | warn > 378 kB | 375.81 kB |

The first-paint ordering was measured directly rather than inferred: with
`localStorage` cleared so no project restores, the trace holds zero Git
processes at the moment the Overview empty state is visible, and the startup
diagnostics check starts 24 ms later. Entry chunk grew 0.22 kB — the container
indirection — and `fileIcons` still has no static entry path.

# Validation

```text
pnpm run check:frontend                   pass (242 tests, 28 files)
pnpm run build                            entry 375.81 kB raw / 107.81 kB gzip
cargo fmt --check / clippy -D warnings    pass
cargo test --all-targets --all-features   pass (199 tests)
```

Release desktop run on Windows 11 with the task-023 standard fixture; results
above. macOS and Linux remain unmeasured — task 045.
