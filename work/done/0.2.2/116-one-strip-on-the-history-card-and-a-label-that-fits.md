---
id: 116
title: Give the History card one strip, and stop clipping the rail's labels
status: done
priority: normal
type: improvement
areas:
  - frontend
created: 2026-09-07
completed: 2026-09-07
parent:
queue:
---

# Goal

Two things task 115 left behind. Retire the third band on the History detail
card, which was the last place the two screens still disagreed about shape.
And stop the navigation rail cutting the bottom off its own labels.

# User outcome

The saved-version card reads like the screen around it: identity, one strip,
then two panes whose contents start level. Roughly 30px of chrome goes back to
the diff, and the two facts the retired band ran together — how many files the
*version* touched, how many lines the *open file* moves — are each stated where
they are true.

The rail's destination names are whole. `Changes`, `History` and `Recovery` were
losing the tail of their `g` and `y`.

# Context

Task 115 measured the merge of the third band against the narrowest two-panel
window and deferred it rather than crowd it in. The measurement it was waiting
for: at 1030px the tab band has 621px and its contents need 386 of them, so the
reading controls fit beside the tabs with room to spare.

The rail defect is older and has nothing to do with the reorder that made it
noticeable. `.rail-item__label` is a `-webkit-line-clamp: 2` box, which needs
`overflow: hidden`, so the box is cut at the line box — and the label carried
`--leading-tight`, a heading's leading. At 11px that is a 13.2px line box
against a 15px glyph box: every label overflowed 0.81px at the bottom, which is
invisible on `Overview` and cuts the descender off `Changes`.

# Scope

- Move the diff-reading controls into the tab band, the version's file count
  onto the line that states the version's other facts, and the open file's
  line totals beside that file's own name; delete `.history-workspace__toolbar`.
- Give the tab band the shared strip height.
- Give the rail label the leading its role asks for, and confirm every label in
  both languages fits the column at both weights.

# Out of scope

- The rail's width. It is derived in `DESIGN.md` from the longest destination
  label and none of them has changed.
- The order of the destinations, which task 115 settled.

# Acceptance criteria

- [x] The History card carries one strip; no band sits between the tabs and
      the panes.
- [x] The reading-mode menu opens fully inside the card from its new host.
- [x] The version's file count and the open file's line totals each appear
      once, where they are true, and the tab band keeps its height on both tabs.
- [x] Nothing overflows the tab band or the diff pane header at the narrowest
      two-panel window, and the band wraps rather than shrinks below 700px.
- [x] No rail label is clipped in either language at either weight, whatever
      order the destinations are in.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/history/HistoryPanel.tsx`
- `src/features/history/history.css`
- `src/app/app-shell.css`
- `DESIGN.md`

# Dependencies

Builds on task 115, which shared the measures these two surfaces now read.

# Decisions

**The card's strip is the tab band.** The alternative was to keep a band and
merely resize it, which would have left the card with a tab row over a toolbar
— the exact two-strips-per-surface shape tasks 112 and 114 removed from both
screens. Controls that act on the open tab belong at the end of the band that
selects it.

**The two counts were never one fact.** The retired band put "3 changed files"
(the version) beside "+12 −4" (the open file) in one line, as though they
described the same thing. The count now sits on the meta line with the author,
the date and the hash — every other fact about the version, and the same place
Changes keeps its own count, beside the title. The totals sit beside the name
of the file they describe.

**The count stays a sentence, not a tab badge.** `.history-tab__count` exists
and would have taken it, but the count is sometimes a floor — "At least 200
changed files" — and a bare numeral in a pill cannot say so.

**`.history-detail__summary` gives up `overflow: hidden`.** It is left over
from when that header was a bordered, rounded card with corners of its own; the
card around it clips now. Kept, it cut the reading-mode menu in half the moment
the picker moved into the band.

**The rail label takes `--leading-snug`.** It is a name that may wrap to a
second line, which is exactly that step's role — `--leading-tight` is a
heading's, and a heading is never clamped. This is a fact about the label, not
about where it sits, so the fix holds in any order.

# Implementation notes

`HistoryDetailHeader` takes the count as text and the controls as a node, so
the card header stays the one component that knows what a saved version's
identity looks like while the diff tab keeps ownership of its own state — the
search string, the reading mode and the picture controls never leave
`HistoryDetail`. The controls are passed only while the diff tab is open; the
band keeps its height on both tabs, so switching them moves nothing.

Measured in a throwaway Vite harness rendering both screens from fixtures, at
1280, 1030 and 680px:

| | Before | After |
| --- | --- | --- |
| Card chrome above the panes | 162px | 131px |
| Card strips | tab band 43 + toolbar 50 | one band at 52 |
| Tab band at 1030px | — | 621px box, 386px of contents |
| Diff pane header at 1030px | 445/445, no overflow | 445/445, no overflow |

A review pass caught one thing the first build got wrong: the controls merely
trailed the tabs, so on a wide card they floated in the middle of the band.
They take `margin-inline-start: auto` now and end on the band's own padding
edge — what selects a tab reads from the left, what acts on the open one from
the right, the way the reading-mode picker takes the far edge of the Changes
diff strip. Measured: the controls' right edge and the band's are 16px apart,
which is the band's trailing inset.

Below 700px the band wraps: the tabs keep their row with a `--control-height-md`
floor so they stay a real target once the band stops stretching them, and the
reading controls take the row under it rather than squeezing the search box
past the point where anything can be typed in it.

Rail labels, measured at both weights in both languages: the widest ink is
`Overview` at 45.9px in a 48px box, nothing wraps, and the bottom overflow went
from +0.81px (clipped) to −0.84px (inside the box). The real ink is 11px of
ascent and 2px of descent around a baseline that now sits 11.9px into a 14.85px
line box, so both ends clear it.

# Validation

- `pnpm run check:docs` — passed.
- `pnpm run check:frontend` — passed (architecture check, `tsc -b`, 703 tests
  in 73 files, production build).
- `pnpm run check:rust` — not re-run; no Rust changed in this task, and it
  passed on the same tree in task 115.
