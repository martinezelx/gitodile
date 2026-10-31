---
id: 120
title: Draw our own calendar
status: done
priority: normal
type: improvement
areas:
  - frontend
  - accessibility
created: 2026-09-08
completed: 2026-09-08
parent:
queue:
---

# Goal

Replace the two `<input type="date">` task 119 put in the History filters with a
calendar this app draws, and put it in `shared/ui` so everything that asks for a
day from here on asks for it the same way.

# User outcome

A day is picked from a calendar that looks like the rest of GitOdile, in the
reader's own language, and — the part that actually matters — written in the date
format they chose in Settings rather than the one the operating system happens to
prefer. The control is the same on every machine, whatever version of WebView2 is
underneath it.

# Context

Task 119 gave the `Saved` filter the range Rust had always accepted, using the
platform's date input. That was the right first move: it cost nothing and it
worked. Looking at it in the app showed what it cost instead.

The popup that control opens is browser chrome. A page gets two levers over it —
`color-scheme` and `accent-color` — and both were already pulled. Everything else
about it is the engine's: its shape, its type, its spacing, and the fact that it
changes when the WebView under the app does.

The sharper problem was not the popup. This app has a date-format preference —
system, ISO, day-first, month-first — and honours it everywhere. A native date
input ignores it. So the filter panel showed `dd/mm/aaaa` in the field, because
Windows says so, beside a chip reading `2 mar 2026`, because the reader said so:
one date, told two ways, in one panel.

# Scope

- A `Calendar` and a `DateField` in `shared/ui`, controlled, taking their strings
  as props like every other module there and their month and weekday names from
  `Intl`.
- The reader's date format for anything the field displays, through the app's own
  `formatDate`.
- The keyboard model a date grid owes: day, week, month, year, the ends of a
  week, select and dismiss.
- `min`/`max`, honoured by both the pointer and the keyboard.
- The two History range ends, on the new control.

# Out of scope

- Any other consumer. Nothing else in the app takes a date today.
- Time of day, ranges inside one calendar, or presets inside the popup.
- Typing a date into the field. The presets and the calendar cover what the
  filter needs, and a parser that accepts four date formats is its own task.

# Acceptance criteria

- [x] The field states its day in the reader's chosen format, and the calendar
      names months and weekdays in their language, starting the week where their
      locale starts it.
- [x] Arrow keys move a day and a week, `Home`/`End` the ends of a week,
      `PageUp`/`PageDown` a month and with `Shift` a year; `Enter` selects and
      `Escape` closes.
- [x] Moving past the end of a month carries the cursor into the next one.
- [x] `min`/`max` stop both the keyboard and the pointer, and a day outside them
      is marked disabled rather than hidden.
- [x] Escape closes the calendar and nothing else, from inside a panel that also
      closes on Escape.
- [x] Today and the chosen day are told apart without colour alone.
- [x] The calendar is not clipped by the column its field sits in, and stays
      inside the window.
- [x] The History range uses it, in both languages.
- [x] `pnpm run check` passes.

# Relevant files

- `src/shared/ui/datePicker.tsx`, `datePicker.test.tsx`
- `src/shared/ui/index.ts`, `src/shared/ui/primitives.css`
- `src/features/history/HistoryPanel.tsx`, `history.css`, `translations.ts`

# Dependencies

Task 119, which added the range this replaces the control of.

# Decisions

**Admitted to `shared/ui` with one consumer, deliberately.** ADR 0003 admits a
primitive there after two, and this has one. The exception was asked for and
granted on the argument that the bar exists to stop an API being fixed by a
single caller before its shape is known — and a calendar's is not in question
(`value`, `onChange`, `min`, `max`). What is being bought is not one screen's
tidiness but consistency across machines, which does not arrive by waiting. It is
recorded in the barrel beside the export, so the next reader finds the reasoning
rather than an unexplained tenant.

**The calendar owns its cursor, and the month is read from it.** The first cut
kept both, with the month as a prop: moving past the end of a month told the
parent to change month, which came back as a new prop and reset the cursor to the
1st — eating the keystroke. One piece of state cannot disagree with itself.
Caught by writing the test for the month boundary, and kept by it.

**Dismissal is its own, not `useAnchoredPopup`.** That hook closes on a
document-level Escape, and this field is opened from inside panels that do the
same, so one press would close both. Escape is handled in the React tree and
stopped there, which makes the innermost surface the one that closes — the same
rule the branch picker follows two groups above it.

**A step outside `min`/`max` is pulled back into it, never refused.** The first
cut had `move` return when the target day fell outside the range, which is right
for an arrow key at the wall and wrong for everything else. Two ways out of it,
both reachable from the History range:

- Fill `To` first and open `From`. Its `max` is a past day, the cursor started on
  today — outside it — and every step that would have reached March was refused
  for the same reason. The grid opened fully disabled with no way off it.
- Cursor on 10 April with a `min` of 20 March: a month back is the 10th, which
  is before `min`, so the control did nothing while eleven choosable days sat
  one press away.

`clampDay` is applied to the initial cursor and to every move, so a step that
overshoots lands on the end it overshot. And a month with no choosable day at
all disables its own control, because a button that answers nothing when pressed
is worse than one that says it cannot.

**Focus leaving the field closes it.** The popup is the last thing in
`document.body`, so tabbing off its final day walked out of the document's tail
and left the calendar open, floating over the app with nothing focused in it.
The press outside was already handled; the focus leaving it was not.

**Focus enters the grid in the same commit that opens it, not a frame later.**
A `requestAnimationFrame` left a window in which a key press went to the trigger
instead of the calendar, and the test for the arrow keys found it.

**A date is built from its parts, never parsed.** `new Date("2026-03-02")` is
midnight UTC, which is the day before anywhere west of Greenwich — how a picker
selects the day above the one that was clicked. `toDate`/`toCalendarDay` are
exported because that trap belongs solved in one place.

**Selection uses `--accent-primary-fill` over `--accent-primary-contrast`,** the
pair every checked control in `primitives.css` already uses. `--accent-primary`
is a dark green on light and a light green on dark, so ink on it would have to be
decided twice.

**Today is a ring and the chosen day is a fill.** Two states on one grid cannot
both be a colour, and one of them has to survive a reader who does not see the
difference. The ring is the accent, not a neutral border: at 28px a hairline in
`--border-control` is invisible against the surface under it, which makes
"today" a mark nobody sees. A day that is both reads as chosen — the fill is the
stronger statement and the ring would only muddy its edge.

**The calendar is drawn on `document.body`, in fixed coordinates.** It was cut
off at its right edge, and the first fix was wrong: it flipped the popup to the
field's other side when the *window* would overhang, and the window was never the
boundary. What clips it is `.history-timeline`'s `overflow: hidden` — the filter
panel's positioning context, `.history-timeline__toolbar`, sits inside that
clipper, so everything the panel places is cut at the column's edge. A popup
hanging off a field in the right half of the column reaches that edge whichever
way it is aligned; only leaving the subtree fixes it. That is the same trade
`usePortalFlyout` already makes, for the same reason, and the price is the same:
placing it by hand. Both edges it uses are the field's, not the window's: it hangs
from the field's left edge, and from the field's *right* edge when the left one
would overhang — so the two ends of a range mirror each other instead of the
second one sliding to wherever it happened to fit. The window only has the last
word when neither edge works, which needs a field narrower than the calendar
pressed against the screen. Under the field, or above it when there is no room
under: the same preference on the other axis.

The rule is a pure function, `placePopup`, because the alternative is measuring a
browser to find out what it does — and jsdom gives every box zero size, so the
rule would have gone untested.

Leaving the subtree cost two things back, both found by looking rather than by
test:

- **The panel closed under the pointer.** A panel that dismisses on a press
  outside itself now counted the calendar as outside, so choosing a day shut the
  panel before the day was chosen. The press is stopped at the popup: a nested
  surface is the one that knows it is nested. Escape was already handled that
  way, and a React portal bubbles through the React tree, so both still reach
  this component.
- **The calendar closed the instant it opened.** A fixed popup does not follow a
  trigger that moves, so the first cut dismissed it on scroll — and focusing the
  day inside it scrolls an ancestor, which is a scroll like any other. It is
  placed again instead of dismissed.

# Implementation notes

`Calendar` is exported beside `DateField` because the grid is the half worth
reusing: a surface with its own place to put one needs the grid and not the
trigger.

The grid draws six weeks always, so stepping through the year does not change the
popup's height. Days either side of the month are shown rather than hidden — a
grid that changes shape every month is harder to read than one with quiet edges.

One tab stop, not a month of them: the cursor's cell carries `tabIndex={0}` and
every other cell `-1`, which is the roving-tabindex the grid pattern asks for.

`.history-filter__date` is now a wrapper class on the field rather than the
styling of a native input; what is left in `history.css` is how the two ends share
the row, plus the capsule-tier height that keeps that row reading as part of the
segmented control above it.

# Validation

```bash
pnpm run check
```

Passed: documentation, frontend architecture, TypeScript, 776 frontend tests, the
production build, `cargo fmt --check`, Clippy, and 378 Rust tests. No Rust
changed.

Fifteen tests cover the primitive — four on the placement rule and eleven on the
control: the format the field states its day in, the
empty state, choosing from the grid, the keyboard model day by day, the month
boundary, `min`/`max` against both keyboard and pointer, stepping the month
without choosing, Escape closing only the calendar and restoring focus, clearing,
and the Spanish month and weekday names with the locale's own week start.

Looked at again after the clipping fix, at a 520px window: the second end's
calendar ends at 478, the same pixel its field ends at, and reaches past the
timeline column's right edge — the boundary that was cutting it — without being
clipped. The first end hangs from its own left edge. Choosing a day closes the
calendar and leaves the filter panel open.

Three more cover the range fix: a field whose `max` is in the past opening on a
month it can actually choose from, a month step pulled to the nearest day inside
`min` with the step beyond it disabled, and focus leaving the field closing it.

Four unit tests fix the placement rule itself: the left edge when there is room,
the right edge when there is not, the window as a last resort at both extremes,
and the flip above the field.

Rendered from fixtures in a throwaway Vite harness and looked at, in both themes:
the calendar opens on the chosen day, names the month in the app's language,
starts the week where the locale does, marks the selection with the accent fill
and dims the days either side, and the field reads `2 mar 2026` — the reader's
format, which is the whole point. The harness was deleted afterwards.
