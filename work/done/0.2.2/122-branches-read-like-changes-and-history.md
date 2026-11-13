---
id: 122
title: Make Branches read like Changes and History
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

Bring the Branches screen to the density and vocabulary its two siblings already
share. Task 117 gave it their shape — a list panel beside a detail card — and
left it heavier than both: rows three lines tall, a detail built from four
bordered cards floating on a fifth, and a private copy of the filter panel
Changes and History had just been folded onto.

Say each fact once, in the place that says it best, and let the screen be the
size of what it actually knows.

# User outcome

The three screens read as one product. A branch's row is scannable at a
glance and always the same height; its detail states who saved the last version
and when, where the branch stands, and the versions on it — each of those exactly
once — and every version in the list opens in History with one click. Filtering
works the way it works on the other two screens, because it is the same control.

# Context

Written from a working session in front of the running app. Each step came from
looking at the screen and naming what was wrong with it, so the record below is
in the order the faults were found rather than in the order a plan would have
put them.

The starting point, from task 117's own implementation notes: *"The
branches screen still keeps its own private copy of a filter panel under
its own class names. It is a third consumer worth folding onto this surface, but
it is outside this task's scope."* Task 121 promoted the surface for two
screens and left the third visible rather than forgotten. This is the third.

# Scope

- **The row.** Two lines and one height: the name with when the branch last moved
  at its trailing end, then the states worth flagging under it.
- **The detail.** One surface divided by rules rather than a tray of cards; the
  identity header carrying the byline; where the branch stands and the versions on
  it as the only two sections; the list scrolling inside itself.
- **The facts.** Remove everything the panel said twice.
- **A version opens in History**, scoped to its branch and selected.
- **The filter panel**, onto `shared/ui`'s surface, with `styleComposition`
  guarding the third copy the way it already guards the other two.
- EN/ES strings for everything added, and the keys of everything removed.

# Out of scope

- The quick switch and the create/rename/delete/switch dialogs. Untouched.
- The branch context menu, and the Branches-as-context work of task 118.
- History's own screen, beyond the one prop that lets another screen name a
  version for it to open.
- The 13 translation keys this file has carried unused since before this task;
  see the decisions.

# Acceptance criteria

- [x] A row is two lines and never grows a third, in both languages.
- [x] The detail panel states the upstream, the last save's author and date, the
      branch's standing and its versions — each in exactly one place.
- [x] Every row of the version list opens that version in History, scoped to its
      branch, with the version selected once the scope's first page is in.
- [x] `Relationship` is one line per state; `Saved versions` scrolls inside
      itself and the way through to History stays against the bottom edge.
- [x] The sort capsules are one row in English and Spanish.
- [x] Branches uses `shared/ui`'s filter surface; no private copy of the panel, the
      trigger, the capsules or the switches survives.
- [x] `styleComposition` fails if any of them comes back.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/branches/BranchesPanel.tsx`, `BranchesScreen.tsx`,
  `branches.css`, `translations.ts`
- `src/features/history/HistoryScreen.tsx` — the version another screen asks for
- `src/app/App.tsx` — the intent between the two screens
- `src/architecture/styleComposition.test.ts` — the third private copy
- `src-tauri/src/branches.rs`, `src-tauri/src/tests/core_workflow_tests.rs`
  — how deep the list is
- `DESIGN.md` — the rules this task settled

# Dependencies

Tasks 117 (the screen), 118 (Branches as shared context) and 121 (the shared filter
surface this joins).

# Decisions

**The upstream leaves the row.** In a 300px column `Tracks origin/0.2.0-preview.1`
is `Tracks origin/0.2.0-previe…` — the row repeating its own name, badly, in the
width the name needed. It is stated in full in the header of the panel beside
it, and `Local only` still marks the branches that have none.

**The date sits on the name's branch, not with the chips.** With all three on the
second branch, `last month · Local only · Can't be deleted yet` is 250px of
content in a 240px row, so every crowded line wrapped to a third. The trailing
edge of the first line is where a list of dated things keeps its date, and it
makes the row's height a constant instead of a function of how much it has to
say. The cost is that a very long name truncates to make room; the `title`
carries it in full, as it already did.

**Status was deleted, not shortened.** Its five pairs were all answered above
it: the upstream by the header, the count by the strip, the date and the hash by
the latest-version section. A screen that repeats itself is not thorough; it is
a screen where the reader has to check whether the second statement means
something new.

**One list of versions, not a card for the newest and a list of the rest.** They
are the same sequence, and the split cost a heading and a rule to separate a row
from the row below it. The newest carries what only it can say — whether it is
published, and its hash.

**The rail went.** It drew one dot per version the read returned, hollow at the
left for the ones behind them, `Older versions` and `Newer versions` under its
two ends. Every branch that had filled the read drew the identical picture, so the
only thing it could tell you was "there are more than eight" — which the count
beside it said in words. A diagram that needs a legend to explain what it is,
and then encodes one bit, is decoration with a caption on it.

**Eight versions, not four.** `BRANCH_HISTORY_LIMIT` was set when the list
was a secondary preview under a card. As the panel's main content, four left it
three rows long under half a panel of nothing. Eight fills the panel and is
still one screenful; paging remains History's job.

**The screen's caption explains, and does not count.** `6 branches · 1
active · 4 local only` was three numbers, none of them a fact the reader could
not already see: exactly one branch is active at any moment and the list says
which by putting it first, "local only" is a filter offered in the strip below,
and the total is the list itself. The sentence that was there before task 117
removed it — *"Separate tracks for your saved versions. Switch branches to work in
a different one."* — is back, and fits on one line, so the three screen headers
still measure the same.

**One way through to History, not two.** "View all" under the list and "Open in
History" in the footer called the same handler with the same argument. The
quieter of the two was also the one that explained where it went.

**A version is selected after its scope, not with it.** Setting the scope
restarts History's timeline, and a restarted timeline picks its own selection
when the first page lands. `setScope` resolves once that page is in, so the
chain is what makes the asked-for version the one that stays selected. Both
intents are one-shot, for the reason the scope intent already was: a target that
survived would re-select itself over whatever the reader has since clicked.

**The header's row wraps, the header does not.** Found in the last review pass.
`.branches-detail__summary` became a column when the byline moved into it,
and the narrow-window rule that made it wrap came along unchanged — `flex-wrap`
on a column is a rule that reads as if it did something. The rule belongs to
`__summary-top`, which is the box that can run out of width; without it the
`width: 100%` the actions take under 700px had nothing to wrap onto and crushed
the name beside them. Measured at the smallest window the app allows.

**The tip is matched by commit, never by position.** Found reviewing the diff.
The two answers come from two Git calls — the inventory names the tip, the read
lists the versions — and a save landing between them leaves the read one version
ahead. Taking `versions[0]` as the tip then drops a real version from the list
and puts that version's author's name against the tip. Both now key off
`branch.tip.commit`, and a test holds the disagreement.

**The 13 unused translation keys stay.** `branchesFilterAriaLabel`,
`branchesNoProjectTitle`, `branchesRefNameLabel` and ten others are dead
in both languages, and all thirteen were dead before this task — verified
against `HEAD`. Deleting 26 strings this task never touched would hide them in
a diff about something else. They are named here so the next task can take them.

**Two columns went in and came back out.** A container query gave the four fact
sections two columns, because the detail is not a fixed fraction of the window —
it is the window minus the list column above 1024px and the whole window below
it — and the viewport media query that had been doing that job was wrong at both
ends. Merging the sections then left two, both of which want the whole measure:
a list of subjects truncated at half width is a list nobody can read. The grid
is one column again and the container query is gone with it. The general rule
survives in DESIGN.md only as far as it is still true.

# Implementation notes

**The row.** `.branch-row` is a flex column, centred so a branch with no
state to flag is one line of text in the same 56px box. The states are their
own branch (`__states`), the date is the last item of the name branch. The repeated
branch glyph went with the upstream: it said what the panel's own title says
once, and it cost 28px of the name's width on every row.

**The header.** `.branches-detail__summary` is now two rows — `__summary-top`
for the name, its chip and its actions, `__meta` for the upstream and the byline —
and carries the rule that used to belong to the band below it. That band held one
right-aligned branch with the width of the panel empty beside it; two blocks of
chrome, 122px, for the identity of one branch. It is 70px now.

**The body scrolls nothing.** `.branches-detail__body` divides its height
between the sections; `.branches-card--fill` takes what is left and its
`<ol>` scrolls inside itself. Where a branch stands is three lines that never
grow, and a panel that scrolls as a whole carries them off the top to reach the
list underneath — the answer leaving to show the question. It also keeps the way
through to History against the bottom edge, where a way out belongs.

**The version rows are buttons** only where a host offers somewhere to open
them; without `onOpenHistory` the row is a line of text rather than a control
that does nothing. `li:has(.branches-recent__open)` is what lets the row's
padding belong to whichever of the two is drawn.

**The active chip** was the only one with a filled accent, uppercase, its own
weight and its own tracking — four louder settings than any other chip, on the
row that is already first in the list. It is tinted the way `--positive` and
`--warning` are now.

**The filter panel** is `FilterPanel` / `FilterGroup` / `FilterCapsules` /
`FilterCapsule` / `FilterSwitch` from `shared/ui`. The private copy is what a
private copy always becomes: it had never picked up the shared sheet's fix for
a `<legend>` not being a grid item, so `Sort by` sat flush against its capsules
where the other two screens give it 6px — which is how the copy was noticed.
The component drops from ~125 lines to ~60 and the feature's filter CSS from
~100 to 8. The `State` and `Name prefix` groups also stop being a `<p>` beside
loose checkboxes and become `<fieldset><legend>`, so each is announced as one
question.

What Branches still owns is `.branches-filter__prefixes`: the group listing
name prefixes grows with the repository, so it scrolls on its own, the way the
file-type group in Changes does and for the same reason — `.filter-panel`
deliberately carries no overflow because History nests popups inside it.

**The sort capsules** are `dense` and their labels are one or two words.
`Recently updated`, `Name (A–Z)` and `Local-only first` come to 321px in a panel
group 238px wide, so the row this control is supposed to be wrapped onto a
second branch and then a third. Measured after: 161px in English, 203px in
Spanish, in a 237px row.

**Rust** changed in one constant and the test that pins it. The history test's
fixture repository grew from 6 commits to 10 so the limit still truncates
something.

Follow-up worth taking: the 13 dead translation keys named in the decisions.

# Validation

```bash
pnpm run check
```

Passed (exit 0): the documentation check, the frontend architecture check over
353 modules, TypeScript, the frontend suite, the production build,
`cargo fmt --check`, Clippy, and 380 Rust tests.

The suite is **802 frontend tests over 74 files**, counted with
`--exclude '**/.claude/**'`. Without it the run also collects
`.claude/worktrees/`, a second checkout of this repository on another branch
that a parallel session had created: 1457 tests over 147 files, seven of them
failing on that branch's own code. `check-docs` reads the same way — 350
Markdown files rather than 185. Worth excluding `.claude/worktrees` in
`vitest.config.ts` and in the two scripts, so a checkout that happens to be
inside the tree cannot fail this one's checks; it is not this task's to do.

Three new frontend tests. One drives the click-through: a row in the list calls
the host with the branch *and* the commit, which is what History needs to land on
the version the reader clicked. One drives the intent at the other end —
`HistoryScreen` sets the scope, then selects the version, in that order, and
hands both intents back so neither re-applies on a later render. One holds the
disagreement between the two Git calls: a read that is one version ahead of the
inventory keeps that version in the list rather than dropping it, and does not
put its author's name against the tip.

Four existing tests moved onto the new copy and structure, one was rewritten —
the shallow-clone test guarded a count that no longer exists anywhere on the
screen, so it now asserts the read renders — and one was deleted with the
control it covered ("View all"). The panel's history fixture was corrected while
fixing the tip-matching bug: it returned another branch's tip as the first record,
a state the app cannot be in, and only the positional code it was written
against could not tell.

`styleComposition` now fails if Branches writes `.branches-filter__panel`,
`__trigger`, `__range` or `__switch` again, and requires it to keep
`__prefixes`. Its shape audit no longer names the deleted trigger.

Rendered from fixtures in a throwaway Vite harness against the real stylesheets
and looked at, in both themes, at 1094x760 — the width a 125% Windows display
actually gives the app, which is what made the two-column breakpoint visibly
wrong in the first place. Measured there rather than guessed: rows at 56–59px
against 86 before, two lines each and no wrapping in the crowded ones; the
section seams meeting where the columns did, and only under the first row; the
`Sort by` legend at 6px where the private copy gave it 0; the prefix group
scrolling at 148px; the versions list scrolling inside itself at 22 rows while
`Relationship` stays put and the footer stays on the bottom edge; and the sort
row on one line in both languages. The harness was deleted afterwards.

Not verified in the running desktop app. The harness renders real markup against
the real stylesheets and the tests drive the real components against stub ports,
which covers the layout and every behaviour above. What neither exercises is the
one journey that crosses a screen boundary: clicking a version in Branches and
watching History arrive on it, in the app, with a real repository behind both.
That needs `pnpm tauri dev`, and it is the one claim here that rests on the
controller's contract and a test of the intent rather than on having seen it
happen.
