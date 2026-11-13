---
id: 073
title: Reorganize frontend ownership and audit Rust module boundaries
status: done
priority: normal
type: refactor
areas:
  - frontend
  - rust
  - architecture
  - documentation
  - testing
created: 2026-08-24
completed: 2026-08-25
parent:
queue:
---

# Goal

Make the physical source tree reflect GitOdile's already-delivered modular
architecture: keep only true entrypoints at the frontend root, give app shell,
project/screen runtime, shared primitives and architecture tests explicit
owners, colocate feature tests with the code they verify, and audit the Rust
crate for modules that have genuinely outgrown the current flat-module rule.

This is an ownership and maintainability refactor, not a product or behavioral
change.

# User outcome

The repository becomes easier to understand and navigate by inspection. A
contributor can tell where new code belongs without treating `src/` as an
implicit miscellaneous layer, tests sit beside their owners, and large Rust
modules are split only when doing so creates a real private boundary rather
than cosmetic symmetry with the frontend.

# Context

The architecture migration successfully established vertical frontend features,
typed ports/adapters, project-scoped runtime state, thin Rust IPC, and explicit
Rust domain modules. The dependency guards are green and the current
architecture is sound.

The remaining debt is mostly physical organization. `src/` still contains a
number of top-level modules that are neither entrypoints nor product features:

- `projectRuntime.ts`
- `projectSessions.ts`
- `repositoryInvalidation.ts`
- `screenModule.tsx`
- `projectSwitcher.tsx`
- `projectAvatar.ts`
- `i18n.tsx`
- `tooltip.tsx`
- `contextMenu.ts`
- `fileIcons.ts`
- architecture/style/feature tests at the root

Those files are not one generic concern. They form several distinct owners:
application composition/shell, project runtime, screen runtime, shared UI,
translation composition and architecture validation. Introducing a generic
`common/`, `utils/` or `shared/types/` bucket would only move the ambiguity one
level down and is explicitly not the target.

The current durable architecture also says Rust should remain flat until a
module genuinely needs internal submodules. Several product modules are now
large enough to deserve review (`branches.rs`, `sync.rs`, `history.rs`,
`changes.rs`, `clone.rs`, `recovery.rs`), but line count alone is not a reason
to split them.

# Target frontend shape

Use this as the intended direction, not as a requirement to create empty
folders or force every name exactly as written when the existing dependency
rules make a nearby name clearer:

```text
src/
  bootstrap.tsx
  styles.css
  vite-env.d.ts
  raw-icons.d.ts

  app/
    App.tsx
    screens.tsx
    ...existing shell modules
    project-switcher/
      ProjectSwitcher.tsx
      projectAvatar.ts
      colocated tests

  runtime/
    project/
      runtime.ts
      sessions.ts
      invalidation.ts
      colocated tests
    screen/
      module.tsx
      colocated tests

  i18n/
    index.tsx
    colocated composition/runtime tests

  features/
    <feature>/
      implementation + owner tests

  shared/
    ui/
      tooltip.tsx
      clipboard.ts
      ...existing primitives
    file-icons/
      index.ts
      colocated tests

  architecture/
    frontend guard/IPC contract tests that are genuinely cross-cutting

  assets/
  styles/
```

The root should contain true build/application entrypoints and declarations,
not be artificially empty.

# Scope

## Frontend source-tree reorganization

- Move `main.tsx` to an explicit app-composition owner such as
  `src/app/App.tsx`; keep `bootstrap.tsx` as the renderer entrypoint.
- Move `screens.tsx` under `src/app/` because it is the global screen registry,
  keep-alive host, prefetch coordinator and switch profiler.
- Group the neutral project lifecycle modules under an explicit runtime owner:
  `projectRuntime.ts`, `projectSessions.ts` and `repositoryInvalidation.ts`.
- Group `screenModule.tsx` under a neutral screen-runtime owner rather than a
  product feature or generic shared bucket.
- Move `projectSwitcher.tsx`, `projectAvatar.ts` and their owner tests into the
  app shell, preferably a focused `project-switcher/` subfolder.
- Move translation composition/runtime (`i18n.tsx` and its runtime tests) into
  an explicit `i18n/` owner while preserving feature-owned translation files
  and `shared/i18n` for shared copy/error localization.
- Move `tooltip.tsx` to `shared/ui`.
- Rename/rehome `contextMenu.ts` according to what it actually owns. Its
  current exported behavior is clipboard copying, so do not preserve a
  misleading context-menu filename merely for path compatibility.
- Move `fileIcons.ts` and its test to a dedicated shared owner while preserving
  its intentionally deferred bundle boundary. Do not route it through a barrel
  that makes the icon set statically reachable from the entry chunk.
- Keep `styles.css` at the root as the deliberate eager cascade manifest unless
  a measured/architectural reason says otherwise.
- Keep `bootstrap.tsx` at the root as the renderer entrypoint unless moving it
  materially improves the build boundary; do not move it merely for symmetry.

## Test ownership cleanup

- Inventory every top-level `src/*.test.*` file and assign it to the module or
  architectural concern it actually verifies.
- Colocate feature-specific tests with their feature owner.
- Split mixed root tests when one file currently verifies multiple owners; for
  example, do not move a mixed repository/status test wholesale into one
  feature if its assertions can be cleanly separated.
- Keep truly cross-cutting architecture/contract tests in a clearly named
  architecture owner rather than pretending they belong to one feature.
- Preserve test intent and coverage; this task must not delete tests simply to
  simplify the tree.

## Dependency and documentation updates

- Update all imports, dynamic imports, type-only imports and test paths after
  moves without weakening current public-entry-point rules.
- Update `scripts/check-frontend-architecture.mjs` and its self-tests so the
  same architectural guarantees remain enforced after the new paths.
- Preserve the rule that feature code cannot import app composition.
- Preserve the rule that Tauri APIs are owned by the approved adapters or
  composition boundaries.
- Preserve the entry-chunk guard around the file icon set after its move.
- Update `AGENTS.md`, `docs/ARCHITECTURE.md`,
  `docs/architecture/frontend-feature-guide.md`, ADR follow-up notes where
  necessary, and any path-sensitive documentation so the documented tree
  matches reality.
- Avoid introducing aliases solely to hide the moves. Prefer normal explicit
  imports unless an existing build alias already owns the same responsibility.

## Composition-root review

- Keep `App.tsx` as an explicit composition root: controller construction,
  feature wiring, watcher/session lifecycle and cross-feature orchestration are
  valid there.
- Review whether any remaining block in the current `main.tsx` is clearly shell
  presentation or a cohesive helper that already has an obvious owner and can
  move without adding indirection.
- Do not split composition into factories/containers merely to reduce line
  count. A large explicit composition root is preferable to opaque dependency
  wiring with one implementation.

## Rust module-boundary audit

- Review the current flat Rust production modules, with particular attention to
  the largest product owners (`branches.rs`, `sync.rs`, `history.rs`,
  `changes.rs`, `clone.rs`, `recovery.rs`).
- For each reviewed module, identify whether it contains multiple stable,
  private responsibilities that would benefit from a Rust submodule boundary.
  Examples may include parsing, planning, validation, read models, mutations or
  provider/platform-specific helpers, but use the code's actual responsibilities
  rather than a predetermined template.
- Split a Rust module only when there is a concrete benefit such as:
  - clearer private ownership;
  - reduced accidental sibling access;
  - easier focused testing;
  - materially simpler navigation/review;
  - a cohesive implementation unit with a narrow private/public boundary.
- If no Rust split is justified, record that conclusion in the implementation
  notes and leave the flat layout unchanged.
- If a split is justified, preserve the owning module's external API and keep
  IPC/application registration behavior unchanged.
- Update `src-tauri/src/architecture.rs` if path/module guards need to understand
  a new legitimate submodule structure; do not weaken forbidden dependency
  directions.

# Out of scope

- Product features, visual redesign, copy changes or new Git workflows.
- Changing IPC command names, payload shapes or behavior solely because files
  move.
- Changing project/session semantics, cache policies or repository freshness
  rules.
- Replacing React state/runtime architecture or introducing Redux, Zustand,
  React Query, XState or an IoC container.
- Introducing `common/`, generic `utils/`, generic `shared/types/` or another
  catch-all ownership bucket.
- Moving feature-domain types into generic shared files just to shorten import
  paths.
- Moving all frontend files into folders merely to achieve an empty `src/`
  root.
- Converting every Rust `.rs` file into a directory or mirroring frontend
  folders in Rust for visual symmetry.
- Splitting Rust modules based only on file size or line count.
- Broadly rewriting Rust APIs while auditing their physical module boundaries.

# Acceptance criteria

- [ ] The frontend root contains only deliberate entrypoints/declarations and
      no unexplained miscellaneous production modules.
- [ ] App-shell/composition code, project runtime, screen runtime, i18n runtime,
      shared UI and architecture validation have explicit, documented owners.
- [ ] `main.tsx` is replaced by or moved to the chosen app-composition path and
      `bootstrap.tsx` imports that owner cleanly.
- [ ] `screens.tsx` lives with app composition and retains one authoritative
      screen registry.
- [ ] Project runtime/session/invalidation modules live together without
      creating an ambient global current-project store.
- [ ] `screenModule` remains neutral and importable by features without causing
      a feature -> app composition dependency.
- [ ] Project switcher/avatar implementation and tests are colocated with their
      app-shell owner.
- [ ] Feature-specific root tests are moved/split into the corresponding
      feature directories, with no meaningful coverage removed.
- [ ] Cross-cutting architecture/IPC tests have an explicit architecture owner.
- [ ] `contextMenu.ts` no longer has a misleading name if it still only owns
      clipboard behavior.
- [ ] The file-icon set remains dynamically/deferred reachable as before; the
      architecture guard still fails on a static bootstrap-to-icons path.
- [ ] Existing feature public-entry-point and Tauri-adapter boundaries still
      fail loudly when violated.
- [ ] No generic catch-all source folder is introduced.
- [ ] Durable architecture documentation shows the delivered frontend tree and
      explains the runtime/app/shared distinction.
- [ ] The Rust audit records a reasoned decision for each large module reviewed.
- [ ] Any Rust module split performed by this task preserves the module's public
      API/IPC behavior and adds or updates focused tests where the new boundary
      merits them.
- [ ] If no Rust structural change is justified, the task explicitly records
      that keeping the flat Rust layout is the outcome rather than an omitted
      step.
- [ ] `pnpm run check:architecture` passes after all frontend moves.
- [ ] `pnpm run check` passes before this task is marked done.

# Relevant files

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/frontend-feature-guide.md`
- `docs/adr/0003-adopt-a-modular-feature-architecture.md`
- `scripts/check-frontend-architecture.mjs`
- `src/bootstrap.tsx`
- `src/main.tsx`
- `src/screens.tsx`
- `src/screenModule.tsx`
- `src/projectRuntime.ts`
- `src/projectSessions.ts`
- `src/repositoryInvalidation.ts`
- `src/projectSwitcher.tsx`
- `src/projectAvatar.ts`
- `src/i18n.tsx`
- `src/tooltip.tsx`
- `src/contextMenu.ts`
- `src/fileIcons.ts`
- `src/architectureGuard.test.ts`
- `src/ipcContract.test.ts`
- `src/styles.css`
- `src-tauri/src/architecture.rs`
- `src-tauri/src/branches.rs`
- `src-tauri/src/sync.rs`
- `src-tauri/src/history.rs`
- `src-tauri/src/changes.rs`
- `src-tauri/src/clone.rs`
- `src-tauri/src/recovery.rs`

# Dependencies

None. Queue ordering places this after task 072 so the source-tree refactor does
not create avoidable path churn while session/diff hardening is still pending.

# Decisions

- Treat this as a physical ownership refactor over an already-correct modular
  architecture; do not redesign the architecture just to reorganize paths.
- Prefer named owners (`app`, `runtime/project`, `runtime/screen`, `shared/ui`)
  over a generic `common` directory.
- Keep real root entrypoints at `src/`; an empty root is not a goal.
- Colocate tests with their semantic owner except for intentionally
  cross-cutting architecture/contract tests.
- Keep the icon set as a special deferred shared module rather than exporting
  it through a broad eager barrel.
- Preserve explicit app composition instead of hiding controller wiring behind
  a container/factory abstraction.
- Keep Rust flat by default; introduce submodules only when the audit identifies
  a cohesive internal boundary with a concrete maintenance or correctness
  benefit.
# Implementation notes

## Frontend: before and after

Before, `src/` held eleven production modules and nine test files that were
neither entrypoints nor features. After, the root holds four files:

```text
src/
  bootstrap.tsx        # renderer entrypoint (retained: the Vite/index.html entry)
  styles.css           # eager cascade manifest (retained: tested, deliberate order)
  vite-env.d.ts        # build-tool ambient declarations (retained: not a module)
  raw-icons.d.ts       # `~icons/*` ambient declarations (retained: not a module)

  app/  App.tsx  screens.tsx  project-switcher/{ProjectSwitcher,projectAvatar}
        + the shell modules that already lived here
  runtime/project/{runtime,sessions,invalidation}.ts
  runtime/screen/module.tsx
  i18n/index.tsx
  shared/ui/{tooltip,clipboard}   shared/file-icons/index.ts
  architecture/{architectureGuard,ipcContract,styleComposition}.test.ts
```

Module moves:

| Before | After | Why this owner |
| --- | --- | --- |
| `main.tsx` | `app/App.tsx` | It is the composition root; the name said "entrypoint", which `bootstrap.tsx` already is. |
| `screens.tsx` | `app/screens.tsx` | The screen registry, keep-alive host, prefetch coordinator and switch profiler are all app composition. |
| `projectRuntime.ts` | `runtime/project/runtime.ts` | Features depend on it and may not depend on `app/`, so it cannot live in the composition layer. |
| `projectSessions.ts` | `runtime/project/sessions.ts` | Same owner as the store it feeds. |
| `repositoryInvalidation.ts` | `runtime/project/invalidation.ts` | Acceptance rules for an event keyed by project id and session epoch. |
| `screenModule.tsx` | `runtime/screen/module.tsx` | Neutral contract: importable by features without a feature-to-app edge. |
| `projectSwitcher.tsx`, `projectAvatar.ts` | `app/project-switcher/` | Shell UI plus the derivation only it uses. |
| `i18n.tsx` | `i18n/index.tsx` | Translation composition is neither a feature nor a shared primitive. Import specifiers (`../../i18n`) are unchanged. |
| `tooltip.tsx` | `shared/ui/tooltip.tsx` | A behavior-free primitive. Deliberately not re-exported from `shared/ui/index.ts`: the app mounts `TooltipHost` once, and adding it to the barrel risks pulling the portal into lazy feature chunks. |
| `contextMenu.ts` | `shared/ui/clipboard.ts` | Its only export is `copyTextToClipboard`; the old name described a caller. It is in the barrel, because a feature (`changes`) consumes it and a deep import would fail the guard. |
| `fileIcons.ts` | `shared/file-icons/index.ts` | A shared owner with its own directory. `index.ts` is the module itself, not a re-export barrel, so nothing new becomes statically reachable. |

`app/App.tsx` was reviewed for blocks that belong elsewhere. It contains one
exported `App` plus four `lazy()` declarations, two small local types and a
short `ViewLoadingFallback`. Earlier tasks already extracted the overlays,
command palette, rail nav, titlebar, preferences, watcher plan and theme
transition. Nothing left is a cohesive helper with an obvious other owner, so
no block moved: the file stays a large explicit composition root rather than
becoming opaque wiring.

## Tests moved or split by owner

| Before | After | Owner |
| --- | --- | --- |
| `main.test.tsx` | `app/App.test.tsx` | app composition |
| `projectSwitcher.test.tsx`, `projectAvatar.test.ts` | `app/project-switcher/` | app shell |
| `projectRuntime.test.tsx`, `projectSessions.test.ts`, `repositoryInvalidation.test.ts` | `runtime/project/` | project runtime |
| `screenModule.test.tsx` | `runtime/screen/module.test.tsx` | screen runtime |
| `i18n.test.ts`, `i18nFrames.test.tsx` | `i18n/composition.test.ts`, `i18n/frames.test.tsx` | translation composition |
| `contextMenu.test.ts`, `fileIcons.test.tsx` | `shared/ui/clipboard.test.ts`, `shared/file-icons/fileIcons.test.tsx` | shared |
| `changes.test.ts`, `changesPanel.test.tsx` | `features/changes/changesDomain.test.ts`, `features/changes/ChangesPanel.test.tsx` | changes |
| `pendingVersions.test.tsx` | `features/overview/PendingVersionsSection.test.tsx` | overview |
| `architectureGuard.test.ts`, `ipcContract.test.ts`, `styleComposition.test.ts` | `architecture/` | cross-cutting, no single feature |

`repositoryOverview.test.ts` was the one genuinely mixed file and was split,
not relocated wholesale: the `getRepositoryOverviewState` cases went to
`features/repository/domain.test.ts` and the working-tree summary/breakdown
cases to `features/status/domain.test.ts`. No assertion was dropped; the suite
count is unchanged at 433 tests.

## Architecture-guard path and rule changes

- The feature-to-app rule matched a list of named root files (`app/`,
  `bootstrap`, `main`, `screens`). It now matches `src/app/**` and
  `src/bootstrap.tsx`: the same boundary expressed as a location instead of a
  file list, so it cannot quietly stop protecting anything when a shell file is
  renamed.
- The entry-chunk rule's icon-set pattern moved from `src/fileIcons.tsx?` to
  `src/shared/file-icons/index.tsx?`.
- `src/architecture/architectureGuard.test.ts` re-points its `src`-shaped
  fixtures at the new paths, so both rules above are still proved against
  realistic input and not only against the seeded `.mjs` fixtures.
- No rule was weakened, `ALLOWED_FEATURE_EDGES` is still empty, and all five
  seeded self-tests still fire.

## Bundle impact

Production build before and after the move, same machine and flags:

| Chunk | Before | After |
| --- | --- | --- |
| entry `index` | 374.53 kB | 374.52 kB |
| icon set | `fileIcons` 238.88 kB / 85.51 kB gzip | `file-icons` 238.88 kB / 85.51 kB gzip |
| `i18n` | 146.36 kB | 146.36 kB |

The icon chunk kept its content hash, so the deferred boundary and the lazy
screen graph are byte-for-byte unchanged; only the chunk's file name follows its
new directory.

## Rust module audit

Reviewed the six largest product modules. Line count was not treated as a reason
to split; the question asked of each was whether it holds two owners whose
private helpers should stop being visible to each other.

| Module | Production shape | Decision |
| --- | --- | --- |
| `branches.rs` | 30 `pub(crate) fn`, 0 private fn | Keep flat. There is no private surface to protect. `tests/core_workflow_tests.rs` reaches its helpers through `crate::branches::`, so every item is already crate-visible; a submodule boundary could only widen visibility, never narrow it. |
| `changes.rs` | 25 `pub(crate) fn`, 0 private fn | Keep flat, same reason. Four other modules (`history`, `publish`, `recovery`, `sync`) import from it and `tests/changes_tests.rs` uses the crate-root glob. |
| `clone.rs` | 4 `pub(crate) fn`, 27 private fn | Keep flat. It is already the shape a split aims for: a narrow public API over a large private implementation. Splitting would force 27 private helpers up to `pub(super)`, the opposite of the goal. |
| `history.rs` | 6 `pub(crate) fn`, 39 private fn | Keep flat. Two clusters look separable (the read cache, and commit-object/cursor parsing), but neither boundary is narrow: the cache exports 4 types back to the read paths and needs 8 items from them, and the parsing cluster exports 10 items. That is a dense two-way seam, not an interface. |
| `sync.rs` | 2,178 production lines | Split; see below. |
| `recovery.rs` | 1,348 production lines | Split; see below. |

### `recovery.rs` becomes `recovery/{mod,discard,history}.rs`

Two owners had been sharing one namespace: working-tree discard snapshots
(ADR 0007) and pre-rewrite branch tips kept as hidden refs (ADR 0008).
Measured coupling before the split: the history half used exactly one item from
the discard half (`now_ms`, a six-line clock) and the discard half used none of
the history half's. The collision was already visible in the source —
`error`/`history_error`, `recovery_root`/`history_recovery_root`,
`unique_recovery_id`/`unique_history_recovery_id` — helpers prefixed to avoid a
neighbour they never call.

After the split, `mod.rs` holds the shared clock and the re-exports, and each
half keeps its helpers private to its own file. External callers are unchanged:
`sync` imports the three history-recovery entry points exactly as before and
`crate::recovery::*` still resolves through `pub(crate) use`.

### `sync.rs` becomes `sync/{mod,get_team_changes}.rs`

The largest module in the crate. `get team changes` is the one destructive
workflow in the domain, and its safety machinery — worktree fingerprinting,
binary-path parsing, collision rules, carry-forward checks, state-token
evidence — was 18 private helpers that the sync read model could call but has no
reason to. Measured coupling: nothing outside the cluster referenced any of
those 18; the cluster reads inward from the read model (`classify_sync`,
`resolve_upstream`, `relation_state` and so on) and the read model never reads
back.

The split hides those 18 helpers behind a two-function entry point
(`plan_get_team_changes`, `get_team_changes`) at the cost of widening exactly
two functions from private to `pub(super)`. `mod.rs` drops from 2,178 to 1,250
production lines and is now remotes plus the team-sync read model. The inline
unit tests followed their subject: the two exercising `paths_overlap` and
`parse_binary_paths` moved into the submodule.

IPC is untouched: no command name, argument list or payload shape changed, and
`ipc.rs`/`lib.rs` registration is identical.

### New Rust guard

`architecture.rs` gained `split_modules_keep_their_submodules_independent`,
which fails the build if one submodule of a directory module `use`s a sibling.
That is the property that makes a split worth its extra file: shared code moves
up into `mod.rs` rather than sideways, otherwise a directory is only a longer
path to the same flat namespace. The existing ownership loop now walks every
file of a directory module, so the forbidden-direction rules (`ipc`, `watch`,
`tauri`, `session`, crate-root globs) apply to `recovery/` and `sync/` in full.
Verified failing: temporarily adding `use super::discard::DiscardRecovery;` to
`recovery/history.rs` made the guard fail with the owning-file message.

# Validation

- `pnpm run check:docs` — passed over 128 Markdown files and 96 task ids.
- `pnpm run check:architecture` — passed over 289 modules; all five seeded
  guards fired (cross-feature internal import, feature-to-app composition, deep
  import past `shared/ui`, production-to-test-only module, feature transport
  outside `tauriAdapter`).
- `pnpm run typecheck` — clean.
- `pnpm run test` — 53 files, 433 tests, all passing. One earlier run failed
  `App.test.tsx`'s "Get these versions" lookup on its 3-second timeout; that
  assertion carries a task-072 comment saying it needs more than the default
  under a loaded parallel run, and it passes both on re-run and in isolation. A
  load flake, not a regression from the move.
- `pnpm run build` — succeeded; chunk comparison recorded above.
- `cargo fmt --check` and `cargo clippy --all-targets --all-features -D warnings`
  — clean.
- `cargo test --all-targets --all-features` — 306 passed, 0 failed, including
  both architecture guards and the full `sync_tests`/`recovery_tests` suites
  covering the two split modules.
- `pnpm run check` — passed end to end.
