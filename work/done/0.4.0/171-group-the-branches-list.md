---
id: 171
title: Group the Branches list by what can be done with each branch
status: done
priority: normal
type: feature
areas:
  - frontend
  - ux
created: 2026-10-14
completed: 2026-10-14
parent:
queue:
---

# Goal

The Branches list stops being one flat wall of branch names. The current branch
and the main branch head it; the rest falls into "In progress" and a folded
"Ready to clean up", each clustered by name prefix, with the part of each name
that tells branches apart drawn loud and the shared prefix quiet.

# User outcome

A project with dozens of `feature/…`, `fix/…` and `codex/…` branches reads at a
glance: what is still work is open, what is safe to clear away is one folded
heading that says so, and a crowded prefix folds instead of filling the
column. Folds survive a restart, and a search never hides what it found.

# Context

Reported from a screenshot of Branches: the list was hard to scan, the filters
did not give it structure, and GitKraken's tree and GitHub Desktop's simple
sections were the references. Seven mockups were compared in an artifact;
the chosen one (F) groups by state first and by prefix inside, with the
prefix muted. A second round shortened the clean-up hint, moved it into the
heading, and added remembered folds, scroll-into-view and folded large
clusters. Bulk clean-up behind "Review" is deliberately left for its own task.

# Scope

- Pure grouping in `branchGroups.ts`: pinned branches, the two buckets by
  `deletabilityOf`, prefix clusters of two or more branches, loose branches first,
  order kept from the reader's sort; the visible tree and the headings above
  a branch.
- `BranchesPanel`: the list as a `tree` with bucket and cluster headings,
  muted name parts, arrow/Home/End/Left/Right keyboard model, a single tab
  stop, folds kept apart while searching or filtering, a branch asked for by
  another screen or just renamed unfolded.
- Folds remembered per project in local storage (`branchFolds.ts`).
- A block opened near the column's foot scrolls into view.
- Clusters of more than eight branches start folded.
- Remove the "Safe to delete" / "Can't be deleted yet" state filters.
- English and Spanish copy; styles; DESIGN.md and README.

# Out of scope

- Deleting several branches at once from "Review" (needs a Rust batch plan and
  recovery record; next task).
- The quick-switch popup, which keeps its own list.
- Virtualizing the list (Rust caps it at 300 branches, under the 400-row DOM
  budget, and the folded block draws fewer rows still).

# Acceptance criteria

- [x] The active and main branches head the list without a heading.
- [x] "In progress" opens by default; "Ready to clean up" is folded and shows
      its count once and "Safe to delete · Review" as the heading's second
      branch, in English and Spanish.
- [x] Prefixes shared by two or more branches in a block are clustered; others
      stay loose with a quiet prefix; clustered rows drop the prefix.
- [x] A cluster of more than eight branches starts folded.
- [x] Searching or filtering opens every heading; clearing restores the
      reader's folds; folds persist per project across launches.
- [x] Keyboard: arrows walk visible items, Right/Left open, fold and move
      between levels, Tab lands on the selection or the heading above it.
- [x] A branch selected from another screen or renamed is unfolded.
- [x] Opening a block near the foot scrolls it into view, respecting reduced
      motion.
- [x] Unit tests for grouping and stored folds; panel tests for the tree.

# Relevant files

- `src/features/branches/branchGroups.ts`
- `src/features/branches/branchFolds.ts`
- `src/features/branches/BranchesPanel.tsx`
- `src/features/branches/branches.css`
- `src/features/branches/translations.ts`
- `DESIGN.md`
- `README.md`

# Dependencies

None.

# Decisions

- Buckets come from the delete plan's own proof (`isRetainedElsewhere`), so
  "Ready to clean up" never promises a delete Rust refuses. The copy says
  "Safe to delete", not "already in main", because the proof is "kept by
  another ref", not "merged into main".
- A `tree` rather than a `listbox`: foldable headings inside a listbox are
  nested interactive controls; a tree gives them `aria-expanded` and levels.
- A prefix with one branch gets no heading; a heading over one row repeats it.
- The deletability filters were removed rather than kept: the blocks are that
  filter, and keeping both hid one block to show the other.
- "Review" only opens the block in this task.
- Folds are keyed by project path; only the reader's changes against the
  defaults are stored, so untouched headings follow the defaults.

# Implementation notes

- `branchGroups.ts`: `groupBranches`, `bucketOf`, `prefixOf`,
  `branchNameParts`, `visibleBranchTree` (takes each heading's default, so the
  clean-up bucket and clusters over `LARGE_CLUSTER_SIZE` start folded) and
  `headingsAbove`.
- `branchFolds.ts`: `useStoredBranchFolds(projectPath)` under
  `gitodile-branch-folds`; unreadable entries are dropped and a refused
  write keeps the folds for the session only.
- `BranchesPanel.tsx`: `BranchesGroupHeading`; rows take `level`,
  `clusterPrefix` and `onTreeKey`; `handleTreeKey` replaces `moveSelection`;
  `tabStop` follows the focused heading, the selection, or the heading above
  a folded selection; `revealOpened` scrolls by what the opened block needs,
  capped so its heading stays; `unfoldFor` serves History's intent and rename.
- Review fixes before completion: the intent now clears heading focus, a
  renamed branch is unfolded, the first bucket heading has no top margin when
  nothing is pinned, the heading comment was reflowed.
- Tests: `BranchesPanel.test.tsx` moved from `option` to `treeitem`,
  reads row names by title, opens "Ready to clean up" in its helper, and
  clears local storage between tests; new grouping, fold-memory, intent and
  keyboard tests. `App.test.tsx`'s reopened-session branches became work in
  progress so they stay visible, and are found by title.
- Follow-up: bulk clean-up behind "Review" (Rust batch plan, recovery record).

# Validation

- `pnpm run check:docs` — passed.
- `pnpm run check:frontend` — architecture, typecheck, 142 files / 1497 tests
  and build passed.
- `cargo fmt -- --check` and `cargo clippy --all-targets --all-features -D
  warnings` — passed.
- `cargo test --all-targets --all-features` — 601 passed, 1 ignored, run with
  a separate `CARGO_TARGET_DIR` because the running app locked
  `target/debug/gitodile.exe`; no Rust code changed.
- Visual check in a throwaway Vite harness (dark theme, Spanish): headings,
  quiet prefixes, folded large cluster, clean-up hint, and scroll on open.
  Light theme not seen.
