---
id: 095
title: Star a recent project to keep it on the welcome screen
status: done
priority: normal
type: improvement
areas:
  - frontend
  - accessibility
created: 2026-08-30
completed: 2026-08-30
parent:
queue:
---

# Goal

Let the welcome screen's recent-projects rows carry the app's existing project
favourite, and sort favourites to the top so a starred project stays on the
front door after it has aged out of the newest few.

# User outcome

The two or three projects someone actually lives in stop sliding off the
welcome screen every time they open something else. And it is the same star
they already know from the rail and the switcher — marking a project in either
place marks it in both, so there is one answer to "is this one of mine".

# Context

Task 092 listed recent projects newest-first and showed five. That is right for
recency and wrong for attachment: open four throwaway repositories and the
project you work in every day is gone from the list.

The app already had project favourites — `useStoredFavouriteProjects`, keyed by
the same canonical path, drawn by the rail and the switcher and ordered by
`orderByFavourite`. A second, list-local "pinned" concept would have meant two
marks on one project and two rules for which comes first.

# Scope

- Show the existing project favourite as a star on each recent row, with the
  switcher's own strings and behaviour.
- Order the list favourites-first before the screen takes its slice.
- Generalize `orderByFavourite` so both lists share one ordering rule.

# Out of scope

- Any new favourites store, and any change to what favourites mean elsewhere.
- A favourites-only filter on the welcome screen (the switcher has one; four
  rows do not need one).
- Unfavouriting a project when its row is removed from recents.

# Acceptance criteria

- [x] Starring a row writes to `gitodile-favourite-projects`, the same store
      the rail and the switcher read.
- [x] A starred project sorts above newer unstarred ones, and both groups keep
      their own recency order.
- [x] The star is `aria-pressed` and readable at rest, not on hover only.
- [x] No new strings: the switcher's favourite/unfavourite copy is reused.

# Relevant files

- `src/app/App.tsx`
- `src/app/project-switcher/ProjectSwitcher.tsx`
- `src/features/overview/OverviewPanel.tsx`
- `src/features/overview/overview.css`
- `DESIGN.md`

# Dependencies

Task 092 built the list this sits in.

# Decisions

- **The app's favourite, not a new "pinned" mark.** One project, one mark, one
  store. A separate pin would have raised "starred here but not there" as a
  real state, and doubled the ordering rules.
- **`orderByFavourite` became generic rather than copied.** It carries the
  doc that display order is not `sessionsState.order`; two copies of
  "favourites first, stable within group" is exactly how two lists that show
  the same favourites start disagreeing. The switcher's call site is unchanged
  — `Entry` infers from its own type.
- **Ordering happens in the composition root**, before the slice. The panel
  renders what it is handed; App owns both the recents and the favourites and
  is where the two meet. It also means the star's effect on order is visible
  in one place rather than inside a render.
- **Removing a row does not unfavourite the project.** The two controls answer
  different questions ("don't list this here" vs "this is one of mine"), and
  reopening a forgotten favourite brings it back correctly starred.

# Implementation notes

The star sits before Remove, so the destructive control stays last in reading
and tab order — the same arrangement, footprint and rest/hover split the
switcher already uses.

# Validation

Measured in the running dev preview with four seeded recents and one seeded
favourite: the starred project rendered first with `aria-pressed="true"`, a
filled `--accent-primary` star at 11.46:1 on the app surface and full opacity,
while unmarked stars stayed outlined at 0.55 in `--text-secondary`; all four
32px at `--radius-item`. Clicking a second star wrote both paths to
`gitodile-favourite-projects` and reordered to
`[project-gitodile, web corporativa, tienda-online, api-pedidos]` — both
favourites first, each group still in recency order. Labels resolved to the
switcher's own Spanish strings.

Covered by an App test asserting the shared store, `aria-pressed`, and the
reorder.

```bash
pnpm run check
```

Passed on 2026-08-30: documentation, frontend architecture, TypeScript, 492
frontend tests over 60 files, the Vite build, `cargo fmt --check`, Clippy with
`-D warnings`, and the Rust test suites.
