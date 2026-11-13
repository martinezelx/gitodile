---
id: 048
title: Split the diff renderer out of ChangesPanel so Overview can import it properly
status: done
priority: low
type: chore
areas:
  - frontend
  - architecture
  - performance
created: 2026-08-11
completed: 2026-08-12
parent: "038"
---

# Goal

Let `features/changes` export `DiffResultView` through its public entry point
without putting the 255 kB icon set on the entry chunk's static path, so the one
allowed cross-feature exception in the architecture guard can be removed.

# User outcome

No visible change. It removes the only entry in the guard's allowance list,
which is the list that quietly becomes a pattern if it grows.

# Context

Overview renders the same diff for a pending version that Changes renders for a
working-tree file, so `PendingVersionsSection.tsx` imports `DiffResultView` from
`features/changes/ChangesPanel.tsx` — another feature's internal module.

Task 047 tried the correct ownership fix and measured why it does not work
today. Adding `export { DiffResultView } from "./ChangesPanel"` to
`features/changes/index.ts` creates a **static** edge from the barrel to
`ChangesPanel.tsx`, which imports `../../fileIcons`. `main.tsx` imports the
changes barrel for its controller, so the entry chunk immediately gains a static
path to the icon set and the task-023 bundle rule fails. Today the barrel
reaches `ChangesPanel.tsx` only through `screen.tsx`'s lazy container, which is
what keeps the icons deferred.

Both modules in the current edge are lazy, so nothing reaches the entry chunk;
the exception is recorded in `ALLOWED_FEATURE_EDGES` with this reasoning rather
than left as a silent violation.

Two routes out, and the cheap-looking one has a catch:

- **Extract the diff renderer.** `DiffResultView` and its subtree
  (`EmptyDiffNote`, `AccessibleDiffText`, `DiffHunkList`) span roughly lines
  236–1015 of `ChangesPanel.tsx`. `getFileTypeIcon` is used only at line 1366,
  inside `FileListItem` — so the diff subtree does not touch the icon set and
  the extraction genuinely removes the static path. It is ~800 lines to move
  with shared helpers to trace.
- **Make the file-list icon lazy.** `FileListItem` is the only consumer;
  `features/overview` already wraps `getFileTypeIcon` in `lazy()` with a
  category glyph as the immediate fallback. That is a much smaller change, but
  it adds a Suspense boundary per row in a list that task 031 virtualized and
  holds to a 400-row DOM budget, so it needs the large-fixture measurement
  rerun rather than an assumption.

# Scope

- Pick one route, with the reason recorded.
- Export `DiffResultView` from `features/changes/index.ts` and point
  `PendingVersionsSection` at it.
- Remove the entry from `ALLOWED_FEATURE_EDGES`; the guard must pass with an
  empty list.
- Re-measure the entry chunk and, if the lazy-icon route is taken, the large
  fixture's rendered row count and DOM budget.

# Out of scope

- Redesigning the diff viewer or changing what it renders.
- Any other allowance-list entry. There is exactly one; keep it that way.

# Acceptance criteria

- [x] `ALLOWED_FEATURE_EDGES` is empty and the guard passes.
- [x] No feature imports another feature's internal module.
- [x] The entry chunk has no static path to `fileIcons`, proven by the guard.
- [x] Entry chunk stays below the task-023 warning of 378 kB.
- [x] If the file list changed, the 5,000-change fixture still renders well
      under the 400-row failure budget.
- [x] Full `AGENTS.md` validation passes.

# Relevant files

- `src/features/changes/ChangesPanel.tsx`, `src/features/changes/index.ts`
- `src/features/overview/PendingVersionsSection.tsx`
- `scripts/check-frontend-architecture.mjs`
- `docs/architecture/023-performance-baseline.md`

# Dependencies

Task 047, which made the guard able to see this at all.

# Decisions

- Filed rather than folded into task 047: an ~800-line component extraction is
  not part of making a guard run, and the alternative route needs a desktop
  measurement to choose between.
- Chose the renderer extraction, not a lazy icon per file row. The extracted
  subtree has no `fileIcons` dependency, preserves the existing renderer DOM
  and virtualizer, and avoids adding a Suspense boundary to every virtualized
  file row. The file-list implementation therefore did not change.

# Implementation notes

- Moved `DiffResultView`, its empty/conflict/binary/too-large states, accessible
  text view, split/unified row builders, gap expansion, row measurement and
  diff virtualizer into `features/changes/DiffResultView.tsx` without changing
  their markup or behavior.
- Exported `DiffResultView` and `DiffViewMode` from `features/changes/index.ts`.
  Overview now imports the renderer and `FileDiff` only through that public
  entry point.
- Left `getFileTypeIcon`, `FileListItem` and file-list virtualization in
  `ChangesPanel.tsx`. `main.tsx` was not modified and remains 1,977 lines.
- Emptied `ALLOWED_FEATURE_EDGES` and added an architecture fixture that pins a
  public cross-feature import as valid while a seeded internal import remains
  forbidden in both the unit test and the guard's CLI self-test.
- Recorded the before/after build measurements in
  `docs/architecture/023-performance-baseline.md`. Entry raw/gzip changed from
  373.09/106.76 kB to 282.27/83.01 kB; `fileIcons` stayed
  255.25/86.23 kB. `ChangesPanel` plus the new `DiffResultView` chunk totals
  64.76/19.39 kB, below the 69 kB raw warning. The after build's complete
  initial JavaScript module-preload closure is 424.56/126.51 kB; no equivalent
  before total was retained, so the physical entry reduction is not claimed
  as a startup-transfer improvement.

# Validation

- Precondition: clean `main` at `382b5ac`. GitHub Actions run 31590152884 for
  that commit completed successfully on Frontend, Ubuntu, Windows and macOS.
- `pnpm run typecheck` — pass.
- `pnpm run test` — pass, 30 files and 256 tests.
- `pnpm run build` — pass, 1,940 modules transformed; measurements above.
- `pnpm run check:architecture` — pass over 208 modules.
- Focused `vitest` run for `changes.test.ts`, `changesPanel.test.tsx` and
  `architectureGuard.test.ts` — pass, 74 tests.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — pass.
- The file-list path did not change, so the conditional new desktop
  large-fixture measurement was not required. Its existing 5,000-change
  virtualization regression test passed in the full suite with its rendered
  row assertion capped at 40, well below the 400-row failure budget.
