---
id: 075
title: Unify Overview refresh and compact its supporting sections
status: done
priority: normal
type: improvement
areas:
  - frontend
  - overview
  - sync
  - history
  - accessibility
created: 2026-08-24
completed: 2026-08-24
parent:
queue:
---

# Goal

Give Overview one screen-level refresh action, place Team changes and Recent
history in a compact responsive row, and make their section headers share the
same icon, title, subtitle, and alignment rules.

# User outcome

Overview is easier to scan and uses less vertical space. A user no longer has
to decide which of several refresh/check controls updates which card: the one
refresh in the project header re-reads local project facts and performs the
explicit remote comparison used by Team changes.

# Context

Overview currently exposes a working-tree refresh in its main status card and
a separate remote check inside Team changes. Retry buttons may also appear in
pending versions and recent history error states. Changes and History already
establish the clearer screen pattern: one icon-only refresh in the screen
header.

Team changes and Recent history are both supporting awareness sections, but
they are stacked vertically and use different header geometry. Team changes
uses a 42px icon, a small section label, and a larger dynamic status heading;
Recent history uses a 40px icon with a 16px title and 12.5px subtitle. The
difference makes equivalent cards look unrelated.

# Scope

- Reuse the shared `RefreshIconButton` in the Overview project header.
- Make the screen-level action refresh local repository snapshots and initiate
  the user-requested remote team check.
- Remove card-level refresh/check/retry affordances from the Overview hero,
  Team changes, pending versions, and recent history.
- Keep publish, review/get, save, review changes, and navigation actions beside
  the content they operate on.
- Place Team changes and Recent history in a two-column supporting grid at
  ordinary desktop widths and stack them when each column would become too
  narrow.
- Standardize both supporting headers on the same 40px icon, 16px title,
  12.5px subtitle, gap, and top-left alignment.
- Preserve cached truth during loading/errors, keyboard order, live
  announcements, English/Spanish wrapping, reduced motion, and forced colors.

# Decisions

- The refresh belongs at the right side of the project header because its
  scope is the whole screen, matching Changes and History rather than any one
  card.
- Overview refresh includes the remote check. Network access remains explicit:
  it only occurs from this user-initiated button, never from screen visibility
  or cache warming.
- Team changes remains first in DOM/focus order and becomes the left column;
  Recent history is the right column. The same order is retained when stacked.
- The two-column layout collapses below 980px so localized copy and actions do
  not compete for unusably narrow columns.
- Error messages remain in their owning section, but recovery uses the single
  screen refresh instead of adding conditional duplicate buttons.

# Acceptance criteria

- [x] Exactly one refresh/check control is rendered on Overview.
- [x] The control reuses `RefreshIconButton`, exposes localized accessible busy
      text, and stays busy while local or remote status is checking.
- [x] A refresh checks the remote and refreshes Overview's repository-derived
      snapshots without making screen visibility a fetch trigger.
- [x] Team changes and Recent history share one row above 980px and stack below
      it without changing DOM or keyboard order.
- [x] Their icon boxes, titles, subtitles, spacing, and top-left alignment are
      visually consistent.
- [x] Card-specific operational actions remain available and refresh/retry
      duplicates are absent in normal and error states.
- [x] Focused frontend tests, architecture checks, the mechanical layout scan,
      and `pnpm run check` pass.

# Relevant files

- `src/main.tsx`
- `src/features/overview/OverviewPanel.tsx`
- `src/features/overview/PendingVersionsSection.tsx`
- `src/features/overview/HistorySummarySection.tsx`
- `src/features/overview/overview.css`
- `src/features/sync/TeamChangesSection.tsx`
- `src/features/sync/sync.css`
- `src/shared/ui/refreshIconButton.tsx`

# Implementation notes

- `OverviewPanel` now renders the shared icon-only refresh beside the current
  branch controls. Its busy state combines the local working-tree read
  and the explicit remote team check.
- `main.tsx` starts the coordinated local refresh and remote check together.
  The existing successful-fetch invalidation still runs afterward, so cached
  snapshots derived from remote-tracking refs are refreshed after Git updates
  them.
- Hero, Team changes, pending-version error, and recent-history error states no
  longer render their own refresh/retry controls. Their operational actions
  remain local to each card.
- `overview-support-grid` places Team changes before Recent history in a
  two-column grid and collapses at 980px without changing DOM order.
- Team changes now shares Recent history's card surface, 40px/19px icon scale,
  16px title, 12.5px subtitle, spacing, and header alignment.
- Focused tests assert the single screen-level control, coordinated local and
  remote reads, and the absence of conditional card-level retries.

## Follow-up polish

The second Overview pass keeps the main status deliberately more prominent
than its supporting cards: Unsaved changes uses a 52px icon container, 24px
glyph, and 18px title, while Team changes and Recent history share the
secondary 40px, 19px, and 16px scale. All three section icons now swap to the
same reduced-motion-safe spinner while their part of the coordinated refresh
is in progress, without hiding cached content.

Recent history no longer displays commit hashes or publication badges in its
compact rows. Each row now reserves its secondary line for author and relative
time only, and the navigation label is shortened to “View all” / “Ver todo”.
The full History screen continues to own technical identifiers and publication
status.

Team changes replaces its Overview-only technical disclosure with a compact,
plain-language relationship between the current branch and its team
destination. Exact branch/destination names remain visible because they answer
where the comparison applies; commit hashes, tracking references, and raw
ahead/behind fields are omitted because the human-readable status above
already explains the actionable result. The detailed get-team flow retains
its technical disclosure for advanced inspection before mutation.

## Coordinated refresh and performance follow-up

The third pass gives Overview an explicit three-section refresh activity. One
click marks Unsaved changes, Team changes, and Recent history busy in the same
React render, so all three header icons begin their spinner together. Each
section clears independently: local project/worktree facts when their read
finishes, Team changes when the remote check finishes, and Recent history when
the post-check shared snapshots finish.

The read plan now also avoids the redundant second full repository refresh:

- repository identity and working-tree facts run once, in parallel with the
  explicit remote check;
- history, branches, and cached sync facts run once after those two reads,
  against the final remote-tracking state;
- the explicit Overview path therefore performs one `open_repository` and one
  `read_working_tree_status`, where the previous fresh-remote path could
  perform two of each.

This preserves the local-first cached first paint: opening Overview still
renders existing snapshots immediately and does not fetch merely because the
screen became visible. The optimization applies only to the user-requested
Refresh action.

The Current branch / Team branch relationship now uses a fixed compact desktop
grid (132px + arrow + 168px) instead of flexible `1fr` columns. The pair stays
together and anchored while the window resizes; below 440px it deliberately
returns to equal fluid columns so long localized or branch text can truncate
without overflowing.

# Validation

Passed on 2026-08-25:

```text
pnpm exec tsc --noEmit
pnpm exec vitest run src/features/repository/readCoordinator.test.ts \
  src/features/overview/HistorySummarySection.test.tsx \
  src/features/sync/TeamChangesSection.test.tsx src/main.test.tsx
  4 files, 43 tests passed

Historical UI scan                                  passed (0 findings)

pnpm run check
  documentation: 127 Markdown files, 95 task ids
  frontend architecture: 289 modules
  frontend: 52 files, 428 tests; production build passed
  Rust: fmt and Clippy passed; 297 tests passed
```

The real Tauri window was inspected with this repository open. At desktop
width it showed one Refresh control in the project header, Team changes and
Recent history in one row, matching header geometry, and Team changes before
Recent history in the accessibility tree. The 980px collapse remains a CSS
media-query/source verification because the existing desktop window could not
be reliably resized to that exact width through the available automation.

The follow-up pass was also inspected in the maximized Tauri window. The
accessibility tree confirmed author/time-only Recent history rows, the shorter
View all label, and the current-branch/team-branch relationship. Focused tests now
cover the History and Team icon spinners while cached content remains visible;
the full gate above was rerun with the updated total of 428 frontend tests.
