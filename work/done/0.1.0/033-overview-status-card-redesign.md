---
id: 033
title: Overview status card redesign — merged card, categorized file preview, publish timeline
status: done
priority: normal
type: feature
areas:
  - frontend
  - backend
created: 2026-08-05
completed: 2026-08-05
---

# Goal

Rebuild the top of the Overview screen from three separate cards (project
identity, working-tree status, branch "spotlight") into one integrated
status card closer to a standard git-client dashboard, using a mockup the
user supplied as the starting reference, then iterating on it directly rather
than matching it pixel-for-pixel.

# User outcome

Requested directly by the user across a single long conversation, roughly in
this order:

1. Disable "Report an issue" in the titlebar's "More actions" menu until it's
   actually implemented, matching History/Recovery's existing disabled state.
2. Fix Overview going narrow-and-centered instead of using the full width the
   collapsed sidebar frees up (Changes and Branches already did this
   correctly).
3. From a mockup screenshot: merge the branch card, the working-tree
   status card, and the saved-but-unpublished list into one integrated
   status card; show a summary of which files changed, not just counts.
4. Iterate on the changed-files preview's layout across several rounds: a
   flat grid → grouped by category → capped at 8 in a 2×4 mini-grid per
   category → capped at 4 in a single column, side by side with dividers
   (the version that stuck) — each round driven by a concrete visual problem
   the user pointed out (illegible truncation, a category inheriting its
   tallest neighbor's height, categories getting merged across unrelated
   columns).
5. Move "Publish changes" out of the status card into the saved-versions
   section as "Publish all N" — publishing acts on saved versions, not raw
   working-tree edits.
6. Wire "Save version" into Overview for the first time (it previously only
   existed on the Changes screen).
7. Add a commit-graph visual to the saved-versions list: a connecting line
   with the newest version marked active, using an off-the-shelf icon
   (`GitCommitVertical`) rather than custom SVG, at the user's explicit
   request to keep it simple.
8. Add a saved date and an author chip to each saved version (scoped down
   from the mockup's "N files" per version, which would have needed a
   heavier backend change — the user picked "date only" when asked).
9. Remove the commit hash from each row as unnecessary.
10. A round of visual QA against real screenshots from the running app,
    fixing: a real color-collision bug (renamed reused the same hex as
    added/success), a real accessibility/legibility bug (divider lines too
    faint in dark mode), icon/text size mismatches between the two "icon +
    heading" openings, vertical misalignment (the status icon and the action
    buttons both sinking below the title once the actions column grew a
    second tier), an oversized branch selector, and two near-identical
    branch icons flanking the selector.
11. A responsive gap: between 800–1100px window width, the action buttons
    fell into the content column instead of getting their own row.

# Context

- The user supplied three successive mockup screenshots over the course of
  the conversation (an initial "how could this look" reference, a refined
  version, and real screenshots of the in-progress result) — the brief was
  explicitly "as close as reasonable, not pixel-perfect," and several
  concrete deviations were discussed and agreed on rather than assumed
  (see Decisions).
- `SavedVersionSummary` (the Rust struct behind the saved-versions list) had
  no date or author field. Adding the date mirrors the format already used
  for a branch's tip (`%cI`, matching `committerdate:iso-strict`).
  Adding a file count per version was scoped out — it would have meant a
  different, more invasive `git log` invocation (or eagerly fetching each
  commit's file list up front, defeating the deliberate lazy-load design of
  `CommitFilesList`) rather than a one-field addition to the existing format
  string.
- `--accent-primary` and `--status-success` happen to share the exact same
  hex value in this palette (`#4f751e` light / `#9bd65a` dark). The
  "renamed" file category borrowed `--accent-primary` for its tint, which
  meant it rendered as literally the same color as "new"/"added" everywhere
  that category color appears (Overview's grouped preview, the Changes
  screen's file list, and the diff view's category pill) — not a matter of
  taste, a real bug once traced to its cause.
- `--border-subtle` (`#27272a` in dark mode) is used for both container
  borders (cards, buttons, inputs — meant to be quiet) and divider lines
  (meant to be seen). The user only wanted dividers boosted, not every
  border in the app, which is why this added a second token rather than
  changing `--border-subtle` itself.

# Scope

**Titlebar**
- "Report an issue" in the More actions menu is disabled with a "Coming
  soon" tooltip (`t.titlebarReportIssueTitle`), same pattern as the
  sidebar's disabled History/Recovery entries.

**Overview layout fix**
- `.project-overview` no longer sets `max-width: 1120px; margin: 0 auto`,
  which fights the flex/grid stretch the rest of the workspace already
  relies on.

**Merged status card** (`main.tsx`, `OverviewPanel`)
- Header: project identity on the left; on the right, a breadcrumb — a
  branch selector (`OverviewBranchQuickActions`, its branch icon now
  living inside the selector pill itself rather than floating beside it)
  plus an inline "N ready to publish" stat when saved versions exist.
- One `.project-hero` card holds: status icon + headline + message, the
  per-category chips (each color-coded to match the file preview below),
  the changed-files preview, and the saved-versions section — replacing
  three separate cards.
- Actions: "Check for changes" is now a quiet corner ghost button
  (`.project-hero__refresh`); "Review changes" and the newly-wired "Save
  version" are the two buttons that matter (`.project-hero__buttons`).
  "Publish changes" was removed from this card.

**Changed-files preview** (`OverviewChangesPreview` in `main.tsx`)
- One column per category (Edited/Added/Deleted/Renamed/Conflicts), each
  capped at `CHANGES_PREVIEW_CATEGORY_LIMIT = 4` files with a "See N more"
  link into Changes, side by side with a vertical divider
  (`.changes-preview__group:not(:first-child)`).
- `align-self: start`/`align-items: start` fix so a short category's row
  doesn't stretch to match a taller neighbor's height (the actual bug behind
  "Edited leaves empty space below it").
- Reuses `getOrderedChangeEntries`/`splitPath`, moved from `changes.tsx` to
  `repositoryOverview.ts` (re-exported from `changes.tsx` for its own
  existing callers) so Overview doesn't need to import the Changes screen's
  module — that would pull its file-type icon set into the initial bundle.

**Saved-versions section** (`PendingVersionsSection` in `pendingVersions.tsx`)
- Icon/title/description sized to match the status card's own opening
  (52px icon, 17px title, 13.5px description — was a smaller, separate
  scale).
- New "Publish all N" button in the header (`canPublish`/`onPublish` props,
  gated the same way the old top-level Publish button was).
- Per-row commit graph: a `GitCommitVertical` icon per version plus one
  shared connecting line behind the column (`.pending-versions__list::before`,
  spans first-node-center to last-node-center via `top`/`bottom`, not a
  fixed height, so it survives a row expanding). Newest version marked
  active (green); the rest neutral.
- Saved date (`toLocaleDateString`, same pattern as `branchesPanel.tsx`)
  and an author chip (icon + name, `max-width: 140px` with an ellipsis,
  full name in the tooltip and the element's own text) added to each row's
  summary; the commit hash was removed.
- Restructured each `<li>` into a node column plus a `.pending-versions__card`
  (the row's previous bordered-box styling, now one level deeper to make
  room for the node beside it).

**Backend** (`src-tauri/src/lib.rs`)
- `SavedVersionSummary` gained `committed_at` (`%cI`) and `author` (`%an`).
  `git_log_summaries`'s pretty-format string and `parse_saved_version_summaries`
  updated together (6 NUL-separated fields per commit, was 4).

**Color system**
- `--status-renamed` (new token, distinct from `--accent-primary`/
  `--status-success`) applied everywhere a renamed file's category color
  appears: `.status-breakdown__item--renamed`, `.changes-preview__group--renamed`,
  `.changes-file-item__category-icon--renamed` (Changes screen), and
  `.changes-diff__category--renamed` (diff view).
- `--border-divider` (new token) applied to actual dividers — menus, section
  breaks, the new commit-graph line — as opposed to container borders,
  which keep `--border-subtle`.

**Responsive**
- At 800–1100px, `.project-hero__actions` now spans the full card width
  (`grid-column: 1 / -1`) instead of falling into the content column below
  the description text.

**Copy**
- "N versions ahead" → "N ready to publish" (EN/ES).

# Out of scope

- Pixel-exact match to the mockup — explicitly not the goal; several
  deviations were discussed and kept (see Decisions).
- Per-version file count — would need a heavier backend change than the
  date/author addition; the user chose "date only" when offered the choice.
- Unifying the "Publish all" and "Publish up to here" button styles — kept
  deliberately different (primary vs. quiet per-row action) as a hierarchy
  signal; raised as an option and the user agreed to leave it.
- A fully bespoke SVG commit graph — an off-the-shelf icon was used at the
  user's explicit request to avoid the complexity.
- Any change to the modular-feature-architecture epic (tasks 022–031) or to
  `015-history-timeline.md`'s epic-dependency note — out of scope for this
  task by the user's own instruction, tracked separately.

# Acceptance criteria

- [x] Overview uses the collapsed sidebar's full width, matching Changes and
      Branches.
- [x] "Report an issue" is disabled with a tooltip, matching History/Recovery.
- [x] Overview's top section is one status card, not three.
- [x] Changed files are grouped by category, each category's height
      independent of its neighbors.
- [x] "Save version" works from Overview.
- [x] Publishing lives in the saved-versions section ("Publish all N"),
      not the status card.
- [x] Saved versions show a connecting commit-graph line, a saved date, and
      an author chip (truncated, with a tooltip, for long names); no chip at
      all when Git reports no author.
- [x] The commit hash is no longer shown per row.
- [x] "Renamed" and "Added" render as genuinely different colors.
- [x] Divider lines are visibly distinct from the page background in dark
      mode.
- [x] The action-button row doesn't fall into the content column between
      800–1100px width.
- [x] No visual regression confirmed at 375/760/950/1100/1280px widths (no
      horizontal overflow at any of them).

# Relevant files

- `AGENTS.md`
- `src/main.tsx`
- `src/pendingVersions.tsx`, `src/pendingVersions.test.tsx`
- `src/changes.tsx`
- `src/repositoryOverview.ts`
- `src/publish.ts`, `src/publishDialog.test.tsx`
- `src/i18n.tsx`
- `src/styles.css`
- `src-tauri/src/lib.rs`

# Dependencies

None. Independent of the modular-feature-architecture epic (022–031); all
work here is inside the existing `main.tsx`/`lib.rs` structure that epic is
planning to replace.

# Decisions

- **Iterated on the mockup instead of copying it exactly.** The user was
  explicit about this from the first mockup ("no hace falta que sea 100%
  igual") and again for the commit graph specifically ("no hace falta que
  sea 100% igual" once more, opting for an existing lucide icon over a
  custom SVG). Every deviation below was a live back-and-forth, not an
  assumption.
- **Changed-files preview went through three real layouts before landing**:
  a flat grid (all files mixed) → grouped by category, capped at 8 files in
  a 2-column-by-4-row mini-grid per category → capped at 4 in a single
  column, side by side with dividers. The middle version was rejected for
  being too cramped (mini-columns as narrow as 31px, unreadable file names)
  and, in one iteration, for accidentally packing unrelated short categories
  into shared masonry columns via CSS multi-column layout — reverted back to
  one-row-per-category-side-by-side once the user pushed back that it didn't
  read as related items anymore, then diagnosed and fixed the real
  underlying bug (grid's `align-items: stretch` default) so a fixed-column
  side-by-side layout could work without one category stretching to match
  another's height.
- **`--status-renamed` is a new token, not a reuse of an existing one.**
  Confirmed via computed styles in-browser that `--accent-primary` and
  `--status-success` are literally the same hex in both themes before
  concluding this needed a dedicated color rather than picking a
  differently-named existing variable.
- **`--border-divider` only touches things that are actually dividers.**
  The user asked to fix "las líneas separadoras" specifically, after
  acknowledging the low dark-mode contrast affects the whole app — container
  borders (buttons, cards, inputs) were deliberately left on
  `--border-subtle`.
- **Date only, not file count, for saved versions.** Offered explicitly via
  a scoped question (minimal backend change vs. a heavier one vs. no backend
  change at all); the user picked the middle option.
- **Two icon fixes, then a revert, then a further icon fix, on the
  saved-versions section header.** `Layers` (thin, sparse stacked-chevron
  strokes) read visually lighter than `FileDiff` (a single solid closed
  shape) at the same default stroke width — traced to icon geometry, not a
  CSS bug, and first "fixed" by swapping to `Archive`. The user preferred
  the original `Layers` once its color was corrected to match the other
  icon's brightness (`--text-primary` instead of `--text-secondary`), so it
  was reverted back.
- **The branch icon moved inside the selector, not just recolored.** Two
  near-identical branch glyphs flanking the selector pill (the leading icon,
  and the "New" button's `GitBranchPlus`) read as a repeated shape. Moving
  the leading icon inside the pill (as `.branch-selector__icon`,
  `currentColor` instead of `--accent-primary`) left only one branch glyph
  in the row; the "New" button's icon was intentionally left as-is (only
  option 1 of two proposed fixes was approved).

# Implementation notes

- `getOrderedChangeEntries`/`splitPath` moved from `changes.tsx` to
  `repositoryOverview.ts` and re-exported from `changes.tsx`, so
  `main.tsx` can use them for the Overview preview without importing the
  Changes screen module (which is lazily loaded specifically to keep its
  file-type icon set out of the initial bundle).
- `SavedVersionSummary`'s two new fields required updating every test
  fixture across `pendingVersions.test.tsx` and `publishDialog.test.tsx`
  that constructs the type as a literal (TypeScript's structural typing
  caught every site via `tsc`).
- The commit-graph connecting line is one shared `::before` element on the
  list (`.pending-versions__list::before`), not one segment per row — this
  is what lets it survive a row expanding (no fixed height, just `top`/
  `bottom` insets) without gapping at a row boundary.
- `cargo fmt` caught one real formatting issue (a long `if` condition on one
  line) introduced by the `author`/`committed_at` field additions — fixed
  before this task was marked done.

# Validation

Run from the repository root against the final diff:

```bash
pnpm run typecheck   # clean
pnpm run test        # 158 passed, 16 suites
pnpm run build        # clean, 82.90 kB CSS / 357.14 kB main JS (gzip 13.10 kB / 102.66 kB)
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check      # clean (after one fix)
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings   # clean
cargo test --manifest-path src-tauri/Cargo.toml                # 172 passed
```

- Manually reviewed the full diff of every changed file (`git diff`) for
  dead code, orphaned CSS selectors, and duplicate rule definitions —
  grepped for every class touched more than once this session
  (`.pending-versions__*`, `.project-hero*`, `.changes-preview__*`,
  `.overview-meta*`) to confirm exactly one definition of each survives.
  Confirmed no leftover references to removed classes (`.branch-card`
  minus its still-used `__value`, `.changes-preview__dir`,
  `.pending-versions__hash`, `.branches-quick-switch--spotlight`,
  `.secondary-button--large`, `.branch-selector__value--action`).
- Verified in-browser (Chromium preview, no Tauri backend available) via
  computed-style/`getBoundingClientRect` assertions rather than eyeballing,
  at each point a visual claim was made: icon sizes/colors matching between
  the status card and saved-versions section, action-button alignment to
  the card's top-right corner, the divider-line color difference between
  `--border-subtle` and `--border-divider` in dark mode, the commit-graph
  line's position against each node's center, the author chip's truncation
  and full-text tooltip, and no horizontal overflow at 375/760/950/1100/1280px.
- A real repository (`C:\workspace\gitodile-sandbox\repo`) was set up with
  every file category represented at once (edited, added, deleted, a
  Git-detected rename via `git mv`, and a genuine unresolved merge conflict
  via two temporary branches adding the same new file) to confirm the
  category-grouped preview and its divider/color rules render correctly
  together, not just individually.
- Not verified: the full Overview screen against a real open project inside
  the actual Tauri app — the sandboxed browser preview has no Tauri backend,
  so every DOM-level check above used hand-constructed markup matching the
  real components' class structure rather than the live React tree.
