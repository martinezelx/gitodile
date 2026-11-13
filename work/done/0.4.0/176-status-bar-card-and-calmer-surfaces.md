---
id: 176
title: The status bar becomes a card and every surface follows one calm recipe
status: done
priority: normal
type: design
areas:
  - frontend
  - ux
created: 2026-10-16
completed: 2026-10-16
parent:
queue:
---

# Goal

Make the window read as one consistent set of cards: the status bar is a card
on the content's edges with the remote beside the branch it belongs to, its sync
capsule keeps one shape in every state, every resting card wears the same edge
and surface on every screen, Overview spends colour only on signals, and the
gaps between cards and above the status bar are one size everywhere.

# User outcome

The status bar no longer floats loose at the bottom of the window; the unsaved
dot reads as "unsaved" rather than "all good"; checking the remote no longer
makes the sync capsule jump. Moving between Overview, Changes, History and
Branches no longer changes how cards are drawn or spaced, and Overview no longer
competes with its own primary button for attention.

# Context

Reviewed screen by screen from screenshots, choosing between options in
widgets and artifacts. The status bar was chrome on the window plane (no fill,
no border) while it held controls; Overview's cards used shadow without a
border on `--surface-raised`, while the workbench panes used a border without
a shadow on `--surface-panel`, so the two read as different materials in the
dark theme. DESIGN.md already asked for border and `--shadow-sm` together.
The Overview breadcrumb change (the branch in the name's sans, one step down,
without a pill) was made in the same review and landed with task 174.

# Scope

- Status bar: the unsaved dot in `--status-warning`; project and branch names in
  the same sans at `--weight-strong`; a 40px card on the workspace insets.
- The remote moves beside the branch; the refresh becomes the second half of one
  split capsule that is present in every state. While a check or the first
  read runs, the capsule keeps its last words in the quiet ink with one
  spinner; "Checking the remote…" is the tooltip and the screen reader's.
- One resting-card recipe — `--surface-panel`, `--border-subtle`,
  `--shadow-sm`, `--radius-surface` — on Overview's cards, the Changes, History
  and Branches panes, the workbench loading panel and the status bar; Overview's
  inner knockouts follow its cards to `--surface-panel`.
- Overview's calm colour: no wash or tinted edge on the next-step card, a
  neutral glyph circle and kicker, the current step alone in the state's tone;
  the "Now" count in ink (overlaps and errors keep their tone); the scene's
  places and path in the quiet ink with a success check on a neutral disc; the
  detail's head glyph and diff totals in the secondary ink with a 2px bar.
- Spacing: 16px between Overview's side cards, and 16px above the status bar
  on Changes, History, Branches and Overview once it fits the window, where the
  document inset and the fade are dropped.
- DESIGN.md records each rule.

# Out of scope

- Monochrome themes (explored in an artifact, not implemented).
- Notices, banners, dialogs, menus and popovers, which keep their own edges.
- The next-step card's one-time "breathe" on a step change.

# Acceptance criteria

- [x] The unsaved marker is amber in the status bar; errors stay red.
- [x] `project / branch` uses one typeface and weight in the status bar.
- [x] The status bar is a card on the content's edges; the mid-scroll fade
      still spans the whole column.
- [x] The sync capsule is one shape in every state, the refresh is always its
      second half, and only one spinner shows while checking.
- [x] A check keeps the last known label visible and announces "Checking the
      remote…" to the screen reader.
- [x] Resting cards share surface, border and shadow on every screen, in both
      themes.
- [x] Overview spends the state's colour only on glyphs, nodes and the current
      step; the primary button is the one filled colour.
- [x] Cards and the status bar are 16px apart on every fitted screen.
- [x] Unit tests cover the split capsule, the held label and the layout of the
      strip's two ends.

# Relevant files

- `src/app/StatusBar.tsx`, `src/app/StatusBar.test.tsx`, `src/app/App.tsx`
- `src/app/app-shell.css`
- `src/features/overview/overview.css`
- `src/features/changes/changes.css`, `src/features/history/history.css`,
  `src/features/branches/branches.css`,
  `src/features/workbench/workbench.css`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- **Amber dot, not the accent.** Green read as "all good"; the rail and the
  project switcher already give unsaved work the warning tone.
- **A card, not a floating dock or two islands.** A dock needs a stacking
  shadow and covers the end of lists; islands split the `project / branch`
  sentence. The card uses the control radius, since 18px on 40px is a pill.
- **Sync beside the branch, no animations.** The remote's state belongs to the
  branch; the user declined the proposed micro-animations.
- **One recipe for every screen, not a status bar that changes per screen.**
  The status bar is the one surface present everywhere, so the screens adopt
  the documented recipe instead.
- **Panel, not raised, for resting cards.** `--surface-raised` is for what
  floats; in the dark theme it is a step lighter than the panel.
- **Calm over muted.** Lowering saturation kept as many colour points; spending
  colour only on signals is what quietens the screen.

# Implementation notes

- `StatusBar` computes the sync action once (`knownAction`) and makes it a
  button only while the relation is current; `heldLabel` reuses it, the doubt
  label and the up-to-date age while `isWaiting`. `checkButton` is shared by
  every branch and no longer spins.
- The fitted-Overview rules live in `app-shell.css` under the same media query
  as `OVERVIEW_FIT_QUERY`, keyed on `app-shell--overview` from `App.tsx`.
- Under `pointer: coarse` the status bar grows to 52px and the capsule's halves
  to 44px.
- Review pass: removed duplicated action and age computation, merged two
  stacked JSX comments, and corrected a comment that still described the
  refresh as appearing only beside an action.

# Validation

- `pnpm run check:docs` — passed.
- `pnpm run check:frontend` (inside `pnpm run check`) — passed (architecture,
  typecheck, 143 files / 1533 tests, build).
- `cargo fmt --check` and `cargo clippy --all-targets --all-features -D
  warnings` — passed.
- `cargo test --lib --all-features` — 604 passed, 1 ignored.
- `pnpm run check` as a whole stopped at `cargo test --all-targets`: Windows
  denied replacing `target/debug/gitodile.exe` while the user's `tauri dev`
  was running it. No Rust code changed in this task.
- The user verified the status bar, the sync capsule and Overview in the
  running app from screenshots during the review.
