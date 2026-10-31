---
id: 165
title: A calmer status bar — project / branch, an unsaved dot, one action recipe
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
created: 2026-10-13
completed: 2026-10-13
parent:
queue:
---

# Goal

Make the status bar quieter without losing a fact: drop the working-tree
count badge and the `+N −N` line totals, read the project and its branch as one
sentence, and give every action on the strip the same shape.

# User outcome

The strip reads `project / branch ●`, then the remote and the version. Unsaved
work is a dot after the branch's name; "up to date" is a grey cloud with its
age; every action — Publish, Get, Get and publish, New version, Ready to
install — is the same neutral capsule with only its glyph in colour.

# Context

The strip showed six control shapes in 34px. In the most common state
(working with unsaved changes and versions to publish) it drew three greens
with three meanings — `+142`, the up-to-date cloud and the sync pill's glyph —
and the diff's `−38` was the only red in the window, reading as an error. The
gear sat between the project and its branch, splitting the sentence, and the
update tag wore an amber pill while the sync action wore a neutral one.

Reviewed in an artifact that replicated the current bar and offered six
redesigns (two conservative, two intermediate, two disruptive) across eight
project states. The user chose the recommendation: option C ("sentence and
dot") with option F's quiet "up to date", then asked for a single action
recipe.

# Scope

- `StatusBar`: the project name is the project-settings button (the gear is
  gone), a quiet `/` joins it to the branch, and the working-tree item, its
  count badge and the line totals are removed.
- `BranchQuickSwitch`: an optional `workingTree` prop draws the unsaved
  dot (danger tone when the tree could not be read), turns the branch glyph into
  the spinner while the tree is read, and adds the sentence to the trigger's
  title. The trigger's accessible name is unchanged; the strip keeps the
  sentence for the screen reader.
- The remote fact is in the quiet ink, amber only when the reader should
  doubt or act; "up to date" shows its cloud and age with the word visually
  hidden; "no remote connected" is no longer a warning.
- The release tag is text alone at rest (the house mark is gone) and takes a
  glyph only for a download ring or the what's-new sparkle; its action state
  uses the sync action's neutral capsule with the glyph in the warning tone.
- Both action capsules use the label size.
- The round refresh stays beside the remote fact in every state.
- DESIGN.md's status-bar section rewritten around "a fact or an action".

# Out of scope

- The console's own status line, which keeps its diff stat.
- Overview's band and the Changes screen, which keep the counts in full.
- Any backend change: `lineTotals` stays in the working-tree payload for its
  other readers.

# Acceptance criteria

- [x] No `+N −N` and no count badge on the strip.
- [x] A dirty tree draws the accent dot after the branch's name; a clean tree
      draws none; an unreadable tree draws the danger dot.
- [x] The project name opens project settings and prefetches them on hover
      and focus.
- [x] "Up to date" keeps its word for the screen reader and its tooltip.
- [x] Sync and update actions share one capsule recipe.
- [x] The refresh is visible and enabled beside the sync action.
- [x] Touch targets stay 44px at `pointer: coarse`.

# Relevant files

- `src/app/StatusBar.tsx`
- `src/app/StatusBar.test.tsx`
- `src/app/app-shell.css`
- `src/app/translations.ts`
- `src/features/branches/BranchQuickSwitch.tsx`
- `DESIGN.md`

# Dependencies

[163](163-status-bar-sync-button.md) for the sync action.

# Decisions

- The dot is in the accent, not amber: unsaved work is the reader's own work
  in progress, not a problem.
- A first pass made the remote fact the check itself (its cloud turned into
  the refresh under the pointer) and removed the round refresh. The user asked
  for the button back: nothing showed the fact could be pressed, touch has no
  hover, the check disappeared whenever the sync action took the fact's place,
  and with automatic checks set to manual it is the strip's only way to ask.
- The update action keeps its one breath on arrival but loses its amber fill:
  amber is the glyph's job, as green is the sync glyph's.

# Implementation notes

- `statusBarLinesAdded` and `statusBarLinesRemoved` were removed from the
  translations; nothing else read them.
- `.status-bar__sync--success` keeps its class as a state hook but has no
  colour of its own.

# Validation

- `pnpm exec vitest run src/app/StatusBar.test.tsx src/app/App.test.tsx
  src/features/branches` — 10 files, 189 tests passed.
- Visual check in the built-in browser through a throwaway harness rendering
  15 states in dark mode; the harness was deleted afterwards.
- `pnpm run check` — passed: 139 frontend test files (1,444 tests), build,
  `cargo fmt`, Clippy and Rust tests (592 passed, 1 ignored).
