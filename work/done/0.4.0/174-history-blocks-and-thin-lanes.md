---
id: 174
title: History timeline reads in two foldable blocks and draws its branches as thin lanes
status: done
priority: normal
type: feature
areas:
  - frontend
  - ux
  - rust
created: 2026-10-15
completed: 2026-10-16
parent:
queue:
---

# Goal

History's timeline gains the structure Branches got in task
[171](171-group-the-branches-list.md): what is only on this computer and
what the remote has read as two foldable blocks headed "Local" and
"Published", and the rail opens into thin lanes where the history really
branches — the current branch straight, with each merge able to show what it
brought in, and every branch drawn at once under "All branches".

# User outcome

The column stops feeling like one wall of rows: two short headings say where
the versions are, and either block folds. Someone who comes from GitKraken or
Sourcetree sees where branches leave and come back; someone new to Git still
sees one straight line until they ask for more.

# Context

Reviewed in an artifact (History Timeline Groupings): the chosen design is
"F" (blocks, muted prefix) with lanes "H" for a single branch and "G" for all
branches, drawn thin (1px strokes, 9px apart, small nodes). The muted
Conventional Commits prefix, the local head with Publish and the published
boundary already existed in Overview's style. Lanes reuse the vocabulary of
the Branches detail's Route: the branch you read is the trunk, other branches take
quiet tints. The mockup's one-pixel drift taught that lane pieces must be
drawn at their row's real height, from the same edge.

Review on the running build changed three things: the block headings became
Branches' block headings and foldable; their names shrank to "Local" and
"origin", then "Published" ("Not published" was cut off); and per-day headings, tried first,
were taken out again — rows keep their relative date.

# Scope

- Pure model in `src/features/history/timelineLanes.ts`: first-parent chain of
  the scoped tip; what each merge on it brought in; visible versions (chain
  plus opened detours on a single branch, everything under All branches); lane
  layout per version, capped at a few lanes.
- `HistoryTimeline`: the list as a tree of fixed-height pieces (local head,
  boundary, version); both block headings in Branches' style, foldable by
  pointer and keyboard, drawn only together; lanes drawn per piece as SVG at
  its real height when more than one lane is in use, the CSS rail otherwise;
  smaller nodes on lanes.
- Detours: a merge row on a single-branch scope says how many versions it
  brought in and opens them on a second lane (pointer: a capsule on the row;
  keyboard: Right/Left); a selected version hidden in a detour opens it.
- Searching or filtering keeps the plain rail.
- "This branch" / "All branches" as a two-state glyph beside the filters (like
  Changes' list/folders toggle); the filter panel keeps only "another branch".
- One node and stroke for both scopes: 10px node with a 1.5px ring, 1px
  strokes 11px apart, the rail in the trunk's ink.
- Pointing at a lane lifts it and shows a card with the branch's name and
  whether its versions are in another branch; pointing at a row lifts its lane.
- The local head's disc matches the remote mark's, in History and Overview.
- Rust: under "All branches" publication is classified against every
  remote-tracking branch (unknown only without any remote, or when too much is
  unpublished to list); the LOCAL / PUBLISHED blocks are drawn there only
  when every local version comes before every published one.
- English and Spanish copy; DESIGN.md (History) updated.

# Out of scope

- Overview's timeline layout (only its local disc changes).

# Acceptance criteria

- [x] Headings "LOCAL" (with its count and Publish) and "PUBLISHED" in
      Branches' block-heading style; drawn only when both blocks exist.
- [x] Either block folds and opens by pointer and keyboard; a folded
      published block neither loads nor offers older versions.
- [x] A straight history looks as before (CSS rail, same nodes).
- [x] On a single-branch scope merges are folded by default; each says how many
      versions it brought in and opens them on a second lane and folds them
      again, by pointer and by keyboard.
- [x] "All branches" draws every branch on its own lane with a stable tint, thin
      strokes, curves where lines part and merge, and a capped lane count.
- [x] Search and filters fall back to the plain rail.
- [x] The scope toggle switches This branch / All branches and says its state;
      All branches needs no chip; another branch is still chosen in the filters.
- [x] Nodes and strokes look the same in both scopes.
- [x] All branches shows each version as local or published (Rust test on a
      cloned repository with a local-only branch), and draws the blocks only
      when they hold one kind each.
- [x] The published block is headed "Published"; the remote is on its
      tooltip, which also says when its branch is gone.
- [x] Lane pieces line up across rows, the local head and the boundary.
- [x] Pointing at a lane names its branch and says, in one fact, whether its
      versions are in another branch; the highlight stays within its timeline.
- [x] Unit tests for chain, detours, visibility and layout; panel tests for
      blocks, detours and the fallback.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/history/HistoryPanel.tsx`
- `src/features/history/timelineLanes.ts`
- `src/features/history/history.css`
- `src/features/history/translations.ts`
- `src/features/overview/overview.css`
- `DESIGN.md`

# Dependencies

- [171](171-group-the-branches-list.md) (done).

# Decisions

- Lanes are computed in the frontend from `parents` and the pages'
  topological order; no new Git read.
- One lane keeps the CSS rail and the selection's filled stretch; lanes
  replace them only where there is more than one.
- Lane tints come from the brand avatar palette mixed toward the divider ink,
  so every theme gets quiet, distinct lanes without new theme tokens.
- The timeline is a `tree`, as Branches' list is: block headings and merges with
  detours are expandable items, which a `listbox` cannot hold.
- Day headings were removed after review: they split the column more than
  they helped read it.

# Implementation notes

- `timelineLanes.ts`: `firstParentChain`, `mergedBy` (everything reachable
  from a merge's other parents up to the chain, nested merges included,
  never claimed twice), `versionsWithDetours` (a version no merge accounts for
  stays visible), `detourHolding`, `layoutLanes` (a tip starts at its node;
  parents outside the versions end the lane; width capped at `MAX_LANES`).
- `HistoryPanel.tsx`: the virtual list holds pieces of fixed height — local
  head, boundary, version (`PIECE_HEIGHT`) — instead of a row carrying the head
  or the boundary on top of it; each piece knows the lanes crossing it from
  above, so a folded block keeps them running. `LaneDrawing` draws a piece's
  stretch; `LocalGroupHead` and the boundary are `treeitem` toggles; rows are
  `treeitem`s with a level and, on merges, `aria-expanded`.
- `history.css`: lane tints, lanes mode (rails hidden, 8px nodes, inset by lane
  count), the detour capsule, block headings; the boundary and the local head
  carry the rows' transparent border and their rails and discs moved to the
  same edge (this also fixed the discs sitting half a pixel off the rail).
- Lane hover, prototyped in an artifact against a copy of `src` before it
  reached the code: `layoutLanes` also returns `branches` (name from a reference
  or the merging subject; the newest merge into another lane and how many
  versions came after it); strokes carry `data-tint` and a 9px invisible hit
  path; `LaneCard` and `laneFact` render the card; the highlight is a `<style>`
  scoped by `data-lanes` (a `useId` key) so two timelines never dim each
  other. Review fixes: the card said "not in any other branch" when the target
  branch had no name — it now says "another branch" — and it is kept inside the
  window.
- Scope toggle: `HistoryScopeToggle` (`GitCommitVertical` / `GitGraph`,
  `filter-control__trigger--active` when pressed) in the search box's
  trailing slot; `HistoryScopeGroup` keeps only the branch picker; the chip
  shows only for `{ kind: "branch" }`; `historyScopeCurrentBranch` and
  `historyScopeAllBranchesHint` went unused and were removed. Prototyped first in
  an artifact (variant D of four placements).
- One drawing: `.history-row__node` is 10px / 1.5px everywhere (lanes only move
  it via `--history-node-x`), `LANE_GAP` 11, and the CSS rails take
  `--history-lane-0`. The lane card's dot was missing in the app because the
  lane colours lived on the scroller and the card sits outside it; they now
  live on `.history-timeline`.
- Rust (`history.rs`): `publication_against_remotes` and
  `has_remote_tracking_lines`; page and detail classify against `--remotes`
  under "All branches". `classify_local_only` dropped `--no-walk` (Git ignores it
  once a negative revision is given, so it listed every unpublished version
  reachable from the page under a cap sized for the page — a filtered page
  over more than about 30 unpublished versions failed); it now keeps the
  page's own commits under an 8 MiB cap, and only the upstream path treats an
  overflow as an error. Tests: `all_lines_classifies_publication_against_every_remote_line`,
  `a_filtered_page_classifies_more_unpublished_work_than_it_holds`.
- Final review fixes: the "All branches" snapshot token now hashes every
  remote-tracking tip, so a publish that moves no local tip still invalidates
  the detail cached under the old token (it kept saying "local"); a scroll
  clears the lane card, which would otherwise name the lane that used to be
  under the pointer; README describes the timeline as it now is.
- Found while validating: an earlier `mergedBy` followed only first parents
  and a version reachable only through a nested merge was hidden for good;
  now nested merges fold with their detour, and anything unattributed stays.

# Validation

- `pnpm run check:docs` and `pnpm run check:frontend` (architecture,
  typecheck, 143 files / 1530 tests, build) — passed on 2026-10-16.
- `cargo fmt -- --check`, `cargo clippy --all-targets --all-features -D
  warnings` and `cargo test --all-targets --all-features` (604 passed, 1
  ignored; run with a separate `CARGO_TARGET_DIR` because the running app
  locks `target/debug/gitodile.exe`) — passed on 2026-10-16.
- Visual checks in throwaway Vite harnesses and in artifacts built from the
  code (152 simulated versions, 12 branches): blocks folded and opened, detours,
  All branches, lane hover, the scope toggle, light and dark; measured in the
  page that every lane drawing starts at the same x, consecutive pieces meet
  with no gap, and 10px nodes sit on lanes 0 and 11px in both scopes.
