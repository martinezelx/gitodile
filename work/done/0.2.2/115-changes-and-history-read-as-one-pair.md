---
id: 115
title: Make Changes and History read as one pair, and put History under Changes
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

Tasks 112 and 114 gave the two screens the same *shape*; they still did not
share their *measures*. Finish that: one definition of the row a screen opens
on, one list column, one strip height, one breakpoint — and move History up the
rail so the two screens are neighbours as well as siblings.

# User outcome

Switching between Changes and History moves nothing that is meant to be the
same: the title sits on the same line, the panels start on the same pixel row,
their edge is at the same place, and both give up their second panel at the
same window width. The open file is named at the same size on either screen.

History is the destination directly under Changes, where the loop it belongs to
already is; Branches follows it.

# Context

The two screens had been brought into the same shape by hand, twice, and had
drifted the way two hand-copied rules do:

- **The hero.** Both wrote the same header row. History pinned the title's
  leading and Changes left it to the browser, and Changes' row was 12px taller
  because it carries Save while History carries nothing — so the panels below
  started at 82px on one screen and 70px on the other.
- **The column.** `minmax(220px, 280px)` against `minmax(280px, 330px)`: the
  panel edge jumped ~40px sideways on the way between two screens that show the
  same pair of panels.
- **The strip.** The same `calc(var(--control-height-sm) + 20px)` written in
  two feature sheets under two names, with a comment in each explaining why it
  could not be shared.
- **The breakpoints.** Changes dropped to one column at 1024px, History at
  980px, so a window between them had Changes on one panel and History on two.
- **Inside the History workspace.** Its two panes opened with a 42px header
  against a search box with an 8px margin — the same step the outer layout had
  spent two tasks removing — and the open file's name read at `--text-label`,
  a step below the file rows beside it and two below the same name on Changes.

# Scope

- Promote the screen header to `.screen-header` in `primitives.css` and move
  both screens onto it, including the height that makes a header without
  actions measure the same as one with them.
- Promote the list column, the strip height and the inner strip height to
  `tokens.css`, and read them from both layouts.
- Align the two screens' breakpoints.
- Give the History workspace's file pane a strip, level with the diff pane's,
  and name the open file at the size Changes names it.
- Move History above Branches in the screen registry, and adopt that order for
  anyone whose stored rail order is the superseded default.

# Out of scope

- The History workspace's third band — the strip carrying the file count, the
  diff search and the reading-mode picker. Changes has no equivalent, and the
  obvious merge (its controls into the tab band, the count onto the Diff tab's
  own badge) was measured against the narrowest two-panel window and left for
  its own task rather than crowded in here.
- Branches' header. It is a different pattern — a title with a paragraph
  under it — and moving it would change that screen without being asked, the
  same reason task 114 left its search box alone.

# Acceptance criteria

- [x] Both screens' titles sit in one shared rule, and their panels start on
      the same pixel row whether or not the screen has header actions.
- [x] Both layouts read the same column track and the same strip height, and
      neither feature sheet declares either.
- [x] Both narrow the list column at the same width and collapse to one column
      at the same width.
- [x] The History workspace's file pane and diff pane open with strips of one
      height, and the open file is named at `--text-lead` as on Changes.
- [x] History is the destination under Changes by default, and a stored rail
      order that is exactly the superseded default adopts it.
- [x] `pnpm run check` passes.

# Relevant files

- `src/app/screens.tsx`
- `src/app/preferences.ts`
- `src/styles/tokens.css`
- `src/shared/ui/primitives.css`
- `src/features/changes/changes.css`
- `src/features/history/history.css`
- `src/features/history/HistoryPanel.tsx`
- `DESIGN.md`

# Dependencies

Builds on tasks 112 and 114, which set the one-strip-per-panel shape these
measures now hold both screens to.

# Decisions

**A measure that decides whether two screens line up belongs to the scale.**
Task 114 declared History's strip height in its own sheet, reasoning that the
two layouts are separate hosts and that a value crossing a feature boundary
costs a fallback. That is true of a variable one feature declares and another
reads; it is not true of a token on `:root`, which is always in scope. The four
values live in `tokens.css` now, and neither feature owns them — a number whose
whole job is to hold two screens together is a design-system number.

**The header row measures a labelled action even where there is none.**
Otherwise a screen that only states its name hands its panels a different first
row than the screen next to it, which is exactly what History and Changes did.

**A stored rail order identical to a superseded default is not a choice.**
Every session writes the whole navigation snapshot back, so the old order was
already in storage for everyone who had ever opened the app — a new default
would have reached nobody. An order that matches a superseded default exactly
adopts the new one; any other arrangement is the user's and stands untouched.

**The workspace's inner strips are a quieter tier, not the panel one.** Making
them 52px too would have stacked 104px of chrome above the History diff, which
is the room task 112 exists to have given back. `--strip-height-inner` is the
row control plus 12px, so the two panes are level with each other and still
read as living inside the card rather than beside it.

# Implementation notes

`.screen-header` is the row itself; what each screen says inside it stays with
that screen — Changes keeps `.changes-header-actions` and its summary line,
History renders only the heading. `styleComposition.test.ts` holds the single
definition the way it already holds `.settings-layout`: the primitives sheet
must define it and neither feature sheet may mention its own former class.

The four measures in `tokens.css` are named for the role rather than the
screen — `--panel-column`, `--panel-column-narrow`, `--strip-height`,
`--strip-height-inner`. `--changes-toolbar-control-height` stays where it is:
it names the *control* inside the strip and `DiffOptionPicker` reads it with a
fallback from outside that layout, which is a different contract from the
strip's own height.

On `pointer: coarse` the icon buttons in the workspace's two strips grow to the
touch tier, which is taller than `--strip-height-inner`; both strips take the
panel height there so the controls keep their air.

The History diff pane's file name and folder took the classes and the
truncation the Changes diff strip uses, including the head-first `rtl`
truncation on the folder and `t.changesProjectRoot` for a file at the root —
which the pane simply left blank before. Reaching across for that string
follows what this screen already does with the category labels.

Verified by hand in a throwaway Vite harness rendering both panels from
fixtures inside the shell's own workspace box, in both themes and at 1280,
1150, 1040 and 1000px:

| | Changes | History |
| --- | --- | --- |
| Header row | top 28, height 38 | top 28, height 38 |
| Panels start | 82 | 82 |
| List column | 320 → 280 at 1150 | 320 → 280 at 1150 |
| One column at | 1000 | 1000 |
| Panel strip | 52 | 52 |

The workspace's two inner strips measured 44px each with their tops on the same
pixel, and the diff pane header did not overflow at the narrowest two-panel
window. The harness was removed afterwards.

# Validation

- `pnpm run check:docs` — passed (179 Markdown files, 144 task ids).
- `pnpm run check:frontend` — passed (architecture check, `tsc -b`, 703 tests
  in 73 files, production build).
- `pnpm run check:rust` — passed (`cargo fmt --check`, Clippy with
  `-D warnings`, 359 tests). No Rust changed in this task.
