---
id: 114
title: Give History the shape Changes has, and a timeline that holds still
status: done
priority: normal
type: improvement
areas:
  - frontend
created: 2026-09-06
completed: 2026-09-07
parent:
queue:
---

# Goal

Task 112 gave the Changes screen one strip per panel and handed its room back
to the files and the diff. History never received the same pass, and the two
screens had drifted into different shapes for the same job. Bring History onto
that structure, share the controls the two screens had each written by hand,
and replace the timeline's decorative motion with something that says what it
means.

# User outcome

The two screens a person moves between all day read as the same product: one
strip of controls, panels whose edges line up, the same search box, the same
arrows for stepping between files and changes. The timeline stops pulsing and
sliding under the pointer and instead shows, held still, where the selected
version sits in the history.

# Context

The work began as "History should look more like Changes" and grew into four
threads, all shaped by what 112 had already settled for Changes:

- **Chrome.** History spent 156px above its list — a screen title, a row of two
  filter cards, and a search box — where Changes spends 52px inside the panel.
  Worse, the title sat *inside* the left column, so the timeline's top edge
  began 156px below the detail card's beside it. Two panels that are meant to
  pair had never been level.
- **Copies.** Five near-identical search boxes existed (Changes' file list,
  History's timeline, its diff, its file pane, Branches), at 32, 34 and
  36px over three different backgrounds. Two screens rendering the same diff
  had different controls for stepping through it.
- **Motion.** The timeline ran five `@keyframes` and two blocks of React state
  to animate a comet down its rail and pulse its nodes. DESIGN.md § Motion asks
  motion to communicate a state change; a 420ms travel on hover and an
  `infinite` breathe under the pointer are decoration, and the hover state was
  driving `setState` on every `pointerenter` in a virtualized list.
- **Surfaces.** The detail side was three bordered cards with 12px between
  them, describing one saved version.

# Scope

- Extract the search box, the diff step controls and the checkbox as shared
  primitives, and move both screens onto them.
- Give History a screen-level header and one strip inside the timeline panel,
  so the two columns start level.
- Merge the detail side into one card whose tab band is its only seam.
- Replace the timeline's animated rail and nodes with static state.
- Remove the rule under each screen's search box.
- Add file stepping to History's diff header, and retire the footer it replaces.

# Out of scope

- The filters themselves — [task 113](113-filter-saved-versions-by-author-date-and-file.md).
- Branches' search box. It sits at a different control tier
  (`--control-height-md`, `--text-lead`) and moving it would change that
  screen's look without being asked.

# Acceptance criteria

- [x] The timeline and the detail card start on the same pixel row, and each
      panel opens with one strip.
- [x] Changes and History share one search box, one diff stepper and one
      checkbox definition; no feature sheet redeclares their shape.
- [x] The timeline carries no `@keyframes` and no React state for hover; the
      reduced-motion block reduces to `transition: none`.
- [x] The selected version's position is shown by a still rail, not by motion.
- [x] History's diff header steps files and changes with the same control
      Changes uses, and the footer that only stepped changes is gone.
- [x] `pnpm run check:frontend` and `pnpm run check:docs` pass.

# Relevant files

- `src/shared/ui/searchBox.tsx`
- `src/shared/ui/primitives.css`
- `src/features/changes/DiffStepNav.tsx`
- `src/features/history/HistoryPanel.tsx`
- `src/features/history/history.css`
- `src/features/changes/ChangesPanel.tsx`
- `src/features/changes/changes.css`
- `src/features/overview/HistorySummarySection.tsx`
- `src/features/overview/overview.css`
- `DESIGN.md`

# Dependencies

Builds on task 112, which set the one-strip-per-panel shape on Changes.

# Decisions

- **The pairing is a height contract, not a pair of rules.** Both screens'
  search strips lost the rule beneath them: the box is already a bordered
  capsule, and a second line 10px below it fenced the box off from the rows it
  filters. `--changes-header-height` still holds the two strips level, which is
  what the pairing was ever about.
- **The rail is structure and the node is state.** The rail is drawn in the
  divider colour on every row; only the stretch between the top of the list and
  the selected node takes the accent, through `data-rail`. Spending the accent
  on all 25 rows left it nothing to say about the one that matters.
- **No keyframes on the timeline.** Every state arrives through a transition.
  This also took React out of the hover path: `pointerenter` used to publish
  state that re-rendered the whole virtualized list to pick an animation's
  direction.
- **The size scale has no exceptions now.** History's diff footer ran its
  buttons at 30px and was DESIGN.md's only documented exception. Stepping
  between changes is the shared arrow pair in the diff header instead, and an
  icon-only stepper is not a labelled button — so the exception went with the
  footer rather than being re-justified.
- **Round checkboxes, against the mockup.** A later design pass drew square
  ones. DESIGN.md § Shape puts a checkbox with the avatars and timeline nodes,
  and Changes already shipped round; a second checkbox shape would have been
  the drift the sheet exists to stop.

# Implementation notes

`SearchBox` is a `<div>` where every copy was a `<label>`: a label answers a
click anywhere inside it on behalf of its control, which is what would swallow
a click on the clear button or a trailing filter. The label is the field now.
Its clear button replaces WebKit's own — a blue-grey glyph the app never chose
— and is rendered even when empty, hidden with `visibility`, so the input does
not grow the moment the first character is typed.

`.app-checkbox` moved to `primitives.css` when the History filter panel became
its second consumer, which is ADR 0003's bar; Changes now declares only where
its own sits in the row.

The three cards on the detail side became one, with the tab band as the seam
and the active tab's underline resting on it. The back button stays outside the
card — it leaves the card rather than acting on it.

The Overview history summary got the same treatment as the timeline it mirrors:
neutral rail, quiet node, no keyframes, and the hover-direction state removed.

# Validation

- `pnpm run check:docs` — passed.
- `pnpm run check:frontend` — passed (architecture check, `tsc -b`, full test
  suite, production build).
- Two tests that existed only to pin the withdrawn motion were removed; the
  selection-direction one became a `data-rail` test. New tests cover the diff
  stepper in History and the shared clear button.
- Driven by hand in a throwaway Vite harness in both themes: column edges level,
  panel and card seams, the rail and node states, the stepper moving files and
  changes. Harness removed afterwards.
