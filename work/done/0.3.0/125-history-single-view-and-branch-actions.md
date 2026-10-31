---
id: 125
title: History in one view, a shared diff find, and branch actions from the switcher
status: done
priority: normal
type: improvement
areas:
  - frontend
  - accessibility
created: 2026-09-21
completed: 2026-09-21
parent:
queue:
---

# Goal

Three things, all in the workbench the Changes/History series (114–124) had been
shaping:

1. Make the History detail card **one view**. The Overview/Diff tabs forced a
   choice between reading a version's story and reading its diff, when the diff
   is the working surface and the story belongs behind one control.
2. Make the **diff's find** a shared control, so Changes and History carry the
   same search in the same place instead of History alone having one.
3. Let the **branch switcher** state what can be done with a branch —
   merge, rebase, compare — from the row itself.

# User outcome

Opening a saved version shows the file list and the diff immediately, with the
subject, author and the reference that points at it on the strip above. The full
message, what the diff is compared against, and the commit's facts are one click
away in `Details`, and the version's own actions are one click away in `More`.
Searching inside a difference is the same gesture on either screen. And a version
branch can be asked what it can do with another one without leaving the switcher.

# Context

Builds on tasks [114](../0.2.2/114-history-screen-structure-and-a-quieter-timeline.md),
[116](../0.2.2/116-one-strip-on-the-history-card-and-a-label-that-fits.md) and
[119](../0.2.2/119-say-which-branch-you-are-on-and-which-one-you-are-reading.md),
which had already given the two screens one panel shape and one strip. This task
removes the last structural disagreement between them — the History tabs — and
unifies the diff controls.

# Scope

History:

- The screen's name and the scope chip move into the timeline panel's own header;
  the loaded-version count is gone (it answered a question nobody asks) and the
  scope moves out of the filter chips, where clearing the filters could not
  touch it and should not.
- The search strip steps down to `--strip-height-inner`.
- The card is a single surface: a two-line version strip (subject, then author
  and the reference that points at it), a `Details` disclosure holding the full
  message, the comparison and the commit's facts, and a diff that is always
  visible.
- One diff toolbar spans the whole card, over both panes, so the open file's
  identity and the reading controls keep a whole row's width at any window size;
  the file search steps down into its own pane.
- The reading controls are the two step pairs, a find that expands from its
  icon, and the view picker. The find's one X closes it.
- The timeline rows name the version and nothing else: a single truncating
  subject branch and author · time, at 64px rather than 82.

Changes:

- Its diff strip gains the same find, and a shrinkable header so opening it
  narrows the path instead of pushing the controls off the pane.

Version-branch switcher:

- Each row carries an always-visible chevron that shows that branch's actions in
  place of the list: merge into the current branch, rebase the current branch onto
  it, and compare. Each names both ends. None is enabled yet, so each is stated,
  disabled and marked `Soon`.
- Renaming and deleting stay on the Branches screen.

# Out of scope

- Implementing merge, rebase or compare. This task states them.
- A floating submenu anchored to a row: the switcher popup clips its own
  overflow and dismisses on a press outside itself, so the actions replace the
  list inside it.

# Acceptance criteria

- [x] History has no tabs; the file list and the diff are always visible.
- [x] The version strip shows the subject, the author and the reference badge;
      the hash, publication state and file count are in `Details`.
- [x] The diff toolbar spans the card and survives a narrow window by narrowing
      the find and truncating the path.
- [x] The diff find is one shared control, with a single X that closes it, used
      by both Changes and History.
- [x] The switcher's `⋯` becomes a chevron, always visible, and opens an actions
      view naming both ends, with merge/rebase/compare disabled and marked
      `Soon`.
- [x] Both languages are complete; dead CSS and translation keys are removed.
- [x] `pnpm run check` passes.

# Relevant files

- [`src/features/history/HistoryPanel.tsx`](../../../src/features/history/HistoryPanel.tsx)
- [`src/features/history/history.css`](../../../src/features/history/history.css)
- [`src/features/history/translations.ts`](../../../src/features/history/translations.ts)
- [`src/features/changes/DiffFind.tsx`](../../../src/features/changes/DiffFind.tsx)
- [`src/features/changes/ChangesPanel.tsx`](../../../src/features/changes/ChangesPanel.tsx)
- [`src/features/changes/changes.css`](../../../src/features/changes/changes.css)
- [`src/features/branches/BranchQuickSwitch.tsx`](../../../src/features/branches/BranchQuickSwitch.tsx)
- [`src/features/branches/branches.css`](../../../src/features/branches/branches.css)
- [`DESIGN.md`](../../../DESIGN.md)

# Decisions

- **The panel is the card, and the diff is the view.** The tabs were the last
  place History disagreed with Changes about shape. The story — the message, the
  comparison, the commit's facts — is a disclosure rather than a peer view,
  because the diff is what the screen is for and a tab made it a choice.
- **One toolbar across the card, not the diff pane's remainder.** The file search
  stepped down into the files pane so the diff's identity and controls could
  span the card: at 1024–1200px the diff pane is too narrow to hold the path,
  four arrows, a search and a picker on one row.
- **The find's X closes; it does not clear.** A filter's clear and a find's close
  would be two Xs beside each other, and the second is the one reached for when
  the work is done. `DiffFind` is shared by both diff surfaces.
- **The `.` of the ref badge moves with it.** `HistoryRefBadge` carries its own
  separator, so the strip's author branch needed no separate dot.
- **Glyph-only `Details` and `More`.** Named to assistive technology and to a
  tooltip, shaped like every other icon control in the app, so the strip reads as
  a row of controls rather than text that happens to sit beside a button.
- **Timeline rows are one line.** The subject truncates; the full text is in the
  detail. The rows compact to 64px and the rail's geometry follows.

# Validation

- `pnpm run check` — passes: docs, frontend architecture, `tsc -b`, **877
  frontend tests** across 90 files, `vite build`, `cargo fmt --check`, `cargo
  clippy -D warnings`, **407 Rust tests**.
- History tests updated: `primaryDecoration`'s ranking is a unit test, the row
  is asserted to carry no badge, and the detail's badge/section assertions follow
  the new strip and `Details`.
- A Changes test covers the new find (opens, highlights, the X closes and clears).
- A switcher test covers the actions view (both ends named, disabled, `Soon`,
  back returns to the list).
- `DESIGN.md` records the History shape, the shared find and the branch actions.
