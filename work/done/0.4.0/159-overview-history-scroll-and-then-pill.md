---
id: 159
title: Overview's history scrolls under a pinned "now", and the "Then" pill counts what exists
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
  - ux
created: 2026-10-11
completed: 2026-10-11
parent:
queue:
---

# Goal

Make Overview's "Recent history" fill its card at any window size instead of
leaving empty space under the last version, and make the next-step card's
"Then:" line say a number that stays true after saving.

# User outcome

On a fitted window the timeline no longer stops short with a blank gap under
it: the versions scroll under a pinned "Now", their group label and the
remote's mark stay in view, and the list ends by saying how it ends. With
unsaved changes, the card no longer promises "publish 4 versions" when saving
will make it five.

# Context

Task 156 fitted Overview to the window: the timeline drew as many whole rows
as fit (`useFitCount`), keeping 34px under them for a fading tail. A row and
the "Published on" mark together need about 86px, so when the next one missed
by a few pixels the card was left with up to ~120px of empty space. A first
fix (a smaller reserve and a tail that grew into the space) was replaced, after
review, by a scroll.

The "Then:" pill used `publish.pending` while saving was the step, but the
version about to be saved is not counted there yet, and the work may be saved
in several versions. With nothing pending the pill was not drawn at all.

# Scope

- While Overview fits the window, `HistorySummarySection` draws "Now" (and the
  incoming row) in a pinned list above a scrolling box with every version of
  the history's first page (up to 30); the page-scrolling layout keeps its
  fixed 6. `useFitCount` no longer drives the timeline (it still fits the
  detail card's file list).
- The rail runs unbroken from "Now" into the box; the local group's label and
  the "Published on" mark are sticky, opaque and carry the rail.
- The box uses the app's auto-hiding scrollbar (`auto-hide-scrollbar` +
  `autoHideScrollbarProps`), fades its bottom edge while there is more below
  (`useMoreBelow` in `fit.ts`), and keeps a focused row clear of the stuck
  header and the fade with scroll padding.
- The list ends in words instead of a fading tail: "Latest N versions · older
  ones are in History", "Where the project began" (a closing dot on the rail),
  or, for a shallow copy, "Older versions were not downloaded to this
  computer".
- Scrolled to the end of a branch that goes on, the header's "View all" takes the
  accent's light fill and breathes once (`.attention-breathe`); scrolling back
  up quiets it.
- The next-step card, while saving is the step: "Then: publish it along with
  N more" (only versions already saved are counted), "Then: publish it" when
  nothing else waits and the remote is up to date; versions waiting on the
  remote still come first. The diverged card's "Then: publish N versions" is
  unchanged.
- English and Spanish copy; DESIGN.md's Overview and next-step sections.

# Out of scope

- Loading more history pages from Overview (History does that, virtualized).
- Making `autoHideScrollbarProps` survive `className` changes for every caller;
  sent to its own task.
- The detail card's file list, which keeps whole-row fitting.

# Acceptance criteria

- [x] A fitted window shows no empty gap under the timeline at any height.
- [x] "Now" stays fixed while the versions scroll; the rail has no break.
- [x] The group label and the "Published on" mark stay at the top while their versions pass.
- [x] The scrollbar is the app's auto-hiding one and stays visible under the pointer while scrolling.
- [x] The bottom fade shows only while there is more below.
- [x] The list's end says whether older versions exist, the project began, or the copy is shallow.
- [x] Reaching the end highlights "View all" once; scrolling up quiets it; a list that fits without scrolling never highlights it.
- [x] A keyboard-focused row's ring is not clipped by the box or covered by the stuck header.
- [x] The "Then:" pill never counts the version about to be saved, and appears with nothing pending when there is a remote to publish to.
- [x] Reduced motion switches off the breathe.
- [x] English and Spanish copy; DESIGN.md describes the behavior.
- [x] `pnpm run check` run and recorded.

# Relevant files

- [Timeline](../../../src/features/overview/HistorySummarySection.tsx) and [its tests](../../../src/features/overview/HistorySummarySection.test.tsx)
- [Fitting and scroll hooks](../../../src/features/overview/fit.ts)
- [Overview styles](../../../src/features/overview/overview.css)
- [Next-step derivation](../../../src/features/overview/nextStep.ts) and [its tests](../../../src/features/overview/nextStep.test.ts)
- [Next-step card](../../../src/features/overview/NextStepCard.tsx) and [its tests](../../../src/features/overview/NextStepCard.test.tsx)
- [Overview copy](../../../src/features/overview/translations.ts)
- `DESIGN.md` (Overview, next-step card)

# Dependencies

- [156](156-overview-redesign.md) — the Overview this adjusts.

# Decisions

- **A scroll over whole-row fitting.** Fitting whole rows always leaves up to
  a row and a mark of empty card; a scroll fills the card at any height and
  needs no measuring pass. DESIGN.md's "never a scroll inside the page" is
  narrowed to the detail card's list.
- **Only the first page, no loading on scroll.** Up to 30 versions already read
  keep the list short enough not to need virtualizing (AGENTS.md) and keep
  scrolling free of Git reads; History is where the rest lives.
- **The end in words, not a second "View all".** The header already has the
  button; the end states how the line ends, and the header button is the one
  that lights up when the end is reached.
- **Sticky headers** so what is in view always says whether it is published.
- **"Along with N more"** over "publish N+1": the count of what already exists
  stays true however the work is saved.

# Implementation notes

- `useMoreBelow(active, contentKey)` follows scroll, the box's size and its
  list's size (ResizeObserver) and returns `moreBelow` and `reachedEnd`
  (scrolled to the bottom, not merely short).
- The scroller's `className` is static and the fade is a `data-more-below`
  attribute: `autoHideScrollbarProps` adds its pointer class outside React, so
  a changing `className` wiped it on every scroll and hid the scrollbar under
  the pointer. A regression test covers it.
- Sticky header and mark paint `--surface-raised` (the group head layers its
  `--group-fill` over it) and draw the rail in a `::before`; the end row covers
  the list's rail with the card surface and draws its own end.
- `NextStepThen` gains `publishWith`, used only while saving is the step.
- Review fixes before committing: rows inside the box draw the app's focus ring
  inward (`outline-offset: -2px`), since the global ring sits outside the
  button where the box clipped it; `scroll-padding-bottom` keeps a focused row
  out of the fade; "Latest 1 versions" is pluralized; `fit.ts` was normalized
  back to LF after an edit left it CRLF.

# Validation

- `pnpm run check`, 2026-10-11: documentation, frontend architecture,
  TypeScript, Vitest (139 files, 1416 tests) and the production build passed;
  `cargo fmt --check` and Clippy passed. `cargo test --all-targets` could not
  start because the running development app held
  `src-tauri/target/debug/gitodile.exe` (`Acceso denegado`, os error 5); no
  Rust file changed. `check:docs` passed again after this task file was added.
- Checked in the built-in browser from a throwaway fixture page (removed):
  the pinned "Now" with an unbroken rail, the sticky group label and mark while
  scrolling, the end texts ("more" and "start"), the fade clearing at the end,
  "View all" taking the accent at the end, the 6px auto-hiding scrollbar, and a
  keyboard-focused row's inward ring. The breathe animation itself could not be
  watched (the hidden pane does not advance animations); its class and
  computed animation name were confirmed.
