---
id: 082
title: Name the branch on saved-version rows, and drop the titlebar wordmark
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design-system
created: 2026-08-27
completed: 2026-08-27
parent:
queue: "18"
---

# Goal

Give every saved-version row in History and in the Overview history summary a
third piece of metadata next to the author and the time: the branch or
tag that points at it, rendered so it cannot be misread as more prose.

Remove the `GitOdile` wordmark from the titlebar in the same pass. It is dead
weight at desktop width and leaks into the narrow layout.

# User outcome

Scanning the timeline answers "where is `main` right now?" and "which saved
version is `v1.2.0`?" without opening the detail panel. The reference reads as
a Git name, not as part of the sentence the author and the date form.

The titlebar stops carrying a second name for the app under 800px, where the
mark beside it already says the same thing.

# Context

`SavedVersionSummary.decorations` already ships from Rust with every ref that
points at a commit on the page (`head`, `localBranch`, `remoteBranch`, `tag`),
sorted by that same rank and capped per version. Today the frontend only spends
it in the detail header (`history-ref-chip`, up to three) and in the technical
references list. The timeline rows and the Overview summary rows show author
and relative time and nothing else, so the answer to "which of these is the
tip of my branch" is three clicks away.

Two honest limits shape the design:

- Git cannot cheaply say "this commit belongs to branch X". A ref points at
  exactly one commit. So a badge appears only on the commits a ref actually
  points at — the tips — and every other row keeps the metadata it has today.
  This is what every Git client shows in a timeline and it is the only claim
  the data supports.
- A commit can carry several refs. A dense row has space for one, so the row
  shows the highest-ranked one and the full ref set stays in the detail panel.

The titlebar wordmark (`.window-titlebar__name`) was written as the
narrow-window affordance: hidden by default, `display: inline` under 800px. But
the crocodile mark sits immediately to its left at every width and is the
identity; a second, redundant name only appears at the width with the least
room for it, right where the compact nav needs the space.

# Scope

- Add a shared reference badge to the History feature and render it in both
  `TimelineRow` (History) and `HistorySummarySection` (Overview).
- Pick one decoration per version: local branch first, then tag, then
  remote branch. Skip the synthetic `HEAD` marker — it names no branch.
- Mark the badge of the checked-out branch with the accent color, using the
  version's own `head` decoration, so the current tip reads differently from
  every other tip.
- Give the badge its own copy keys so the accessible name of the row says
  "Branch main" / "Tag v1.2.0" rather than reciting a bare ref.
- Delete the titlebar wordmark: the span, its base rule, and its 800px
  override, plus the declarations on `.window-titlebar__brand` that only
  existed to style text.
- Cover both in unit tests.

# Out of scope

- Any Rust or IPC change. The decorations are already on the wire.
- Rendering more than one reference per row, or a "+N" overflow count. The
  detail panel owns the full set.
- Graph lanes, ref filtering, or clicking a badge to filter the timeline.
- Touching `history-ref-chip` in the detail header.

# Acceptance criteria

- [x] A saved version that a local branch points at shows a badge with
      that branch's name in the History timeline and in the Overview history
      summary.
- [x] A saved version that only a tag points at shows a tag badge with a
      distinct glyph; a version with no refs shows author and time exactly as
      before.
- [x] The badge for the checked-out branch is visually distinct from an
      ordinary branch badge.
- [x] The row's accessible name includes the reference, and the badge's
      `title` carries the full ref.
- [x] The badge is a `--radius-pill` capsule and adds no raw radius, keeping
      `styleComposition.test.ts` green.
- [x] The badge keeps a visible outline under `forced-colors: active`.
- [x] `GitOdile` no longer renders in the titlebar at any width, and no CSS
      rule for it remains.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/history/HistoryRefBadge.tsx`
- `src/features/history/HistoryPanel.tsx`
- `src/features/history/history.css`
- `src/features/history/translations.ts`
- `src/features/history/index.ts`
- `src/features/overview/HistorySummarySection.tsx`
- `src/features/overview/overview.css`
- `src/architecture/styleComposition.test.ts`
- `src/app/App.tsx`
- `src/app/app-shell.css`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- **The badge lives in the History feature, not in `shared/ui`.** Overview
  already consumes History through its public entry, and the badge is bound to
  `SavedVersionSummary`, so it is History's vocabulary. `history.css` also
  loads after `overview.css`, so one class styles both rows with no override.
  `styleComposition.test.ts` now pins both halves of that: History defines the
  badge, Overview does not, and the sheet order that makes it safe stays.
- **One decoration per row, ranked: tag, then local branch, then remote branch.**
  The tag leads because it is the only one of the three that cannot be
  inferred by looking — a branch's name is implied by standing on it and moves
  with every saved version, while a tag is permanent and marks something
  someone chose to mark. The remote tracking ref comes last: it usually points
  at the same commit as the local branch it tracks and repeats its name with a
  prefix. Tagging `v0.1.0` on this repository's own tip is what surfaced the
  original order — it hid the tag behind `main`, which is exactly the fact the
  row was added to show.
- **`head` never becomes a badge.** Its name is the literal string `HEAD`,
  which names no branch. It is used only to confirm that a version is the tip the
  working tree sits on.
- **The checked-out branch breaks ties inside its rank, and it is the only thing
  the accent marks.** Several branches can point at one commit — this
  repository's own tip carries `main` and the branch it was merged from — so
  the badge takes `currentBranch` from the page snapshot and names the branch
  the user is standing on rather than whichever sorts first. It is a tie-break,
  not a jump over the ranking: a tag on that same commit still wins, and is
  never accented. Ranking alphabetically and tinting on the mere presence of
  `head` would have put the accent on a sibling branch and named the wrong one;
  caught by checking the implementation against this repository's real refs
  rather than a fixture.
- **No status color for tags.** `--status-warning` would read as a warning.
  Branch and tag differ by glyph, and the only color the badge spends is
  `--accent-primary` for the current branch — a state, not a category.
- **The row's `aria-label` carries the reference.** Both rows are buttons with
  an explicit `aria-label`, which replaces their subtree for assistive tech, so
  a badge inside them would otherwise be silent.
- **Both rows read `author · reference · time`, in that order.** They had
  drifted: History justified the date to the trailing edge with
  `space-between` — two columns rather than one line — while Overview packed
  author and date together with a `·`. Two rows showing the same three facts
  in different orders is a bug in the reading, so History adopted Overview's
  packed sentence and Overview moved the badge into the middle. A test in each
  host pins the sequence so neither can drift from the other again.
- **The separator is a real element, not a `::before`.** The badge is an
  `inline-flex` capsule, so a pseudo-element on it is laid out as a flex child
  *inside* its border — the dot would render within the pill. `HistoryMetaDot`
  is rendered by the badge itself, so a row cannot show the capsule without the
  separator that seats it.
- **Only the author gives up width.** It is the longest of the three, the most
  repetitive down the column, and the other two are already as short as they
  can be said; it carries a `title` with the full name for the narrow case.
- **The badge sizes itself in `em`.** The two hosts set their meta branch at
  10.5px and 11.5px. A fixed badge size read correct in one and undersized in
  the other; `.9em` resolves to 9.45px and 10.35px and belongs to both branches.

# Implementation notes

`HistoryRefBadge.tsx` is the whole new surface: `primaryDecoration` ranks a
version's refs, `decorationLabel` gives the spoken form, and the component
renders the capsule. All three are exported from the feature entry, because
Overview needs the first two to build its row label and the third to render.

Both take `currentBranch`, threaded from `HistoryPage.branch` through
`HistoryTimeline` into `TimelineRow`, and read directly from the snapshot in
Overview. Without it the badge could only ask "is this the tip", not "is this
the branch I am on", which are different questions on a commit that several
branches point at.

`.history-row__meta` stopped using `justify-content: space-between`. That rule
described a two-child row and quietly stops describing it once a third child
can appear between the ends, so the date now takes `margin-left: auto` and the
author keeps its `62%` cap. Rows without a reference measure identically to
before the change.

Layout and contrast were verified by measurement against the real sheets rather
than by eye:

- A badged timeline row's body measures 57.75px inside the 59px content box of
  the row the virtualizer pins at 80px — the badge was cut from 18px to 17px to
  buy that headroom back. Unbadged rows are unchanged at 37.48px.
- The badge resolves to `border-radius: 999px`, `9.45px` in History and
  `10.35px` in Overview.
- The packed branch fits at both ends of the timeline column's own range
  (`minmax(280px, 330px)`). At 280px a badged row uses all 217px of its meta
  branch and the author truncates from 97px to 86px; at 330px it uses 228 of 267
  and the author is whole. Rows without a badge use 123 of 217. Overview, at
  326px, uses 245.
- Contrast against the composited surface: current-branch badge 4.77:1 light /
  7.47:1 dark; ordinary badge 5.36:1 / 6.79:1, which is the author text's own
  ratio, since it is the author's own color.

The titlebar wordmark is gone: the span, the base rule, its 800px override, and
the four declarations on `.window-titlebar__brand` that only existed to style
text. The mark is the identity at every width, and the width where the wordmark
used to appear is the one with the least room to say the same thing twice.

# Validation

```
pnpm run typecheck                     passed
pnpm exec vitest run src/features/history src/features/overview
                                       10 files, 63 tests passed
pnpm run check:docs                    passed (135 files, 102 task ids)
pnpm run check:architecture            passed (291 modules)
pnpm run check                         see below
```
