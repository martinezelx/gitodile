---
id: 119
title: Say which branch you are on, and which one you are reading
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

Polish what task 118 connected. The pieces work; three of them do not say enough
about themselves. The quick switch spends two full rows on its hand-offs, History
does not say which history it is reading once the filter panel is closed, and the
one control in a saved version's metadata row looks like the facts around it.

No structural change, no new screen, no new Git read.

# User outcome

The status bar still states the working context, with the branch's name carrying
the weight and "Working on" reading as the sentence around it.

The quick switch is shorter: `+ New branch` and `Manage branches →` sit on one row at
the foot of the popup, so the list of branches gets the height the two rows were
spending.

And the two contexts are told apart. When History is reading something other than
the current branch, its caption says so — `3 saved versions loaded · Branch: main` —
so the reader is never looking at one branch's history while the strip names
another without knowing it.

# Context

Task 118 gave History a scope and the status bar a stated context. Using it for a
while surfaced four things, none of them structural:

- The quick switch's `New branch` and `Manage branches` were two
  full-width menu rows, ~87px for two actions in a 292px popup.
- With the filter panel closed, nothing on the History screen said which branch it
  was reading. The status bar said `Working on 0.2.0-preview.1`; History could be
  showing `main`.
- `Another branch…` reads as "any branch except this one". The control chooses one
  specific branch.
- A chosen branch looked like a filled text field. Nothing distinguished "waiting
  for a name" from "holding the branch this timeline is reading".
- The saved-version metadata row ended in `Actions`, styled exactly like the
  `HEAD`, `main` and `origin/main` chips beside it — the one control in a row of
  facts, dressed as a fact.

# Scope

- Keep `Working on` and its hierarchy: secondary tier for the words, the branch's
  name as the interactive fact. No second selector anywhere.
- Put the quick switch's two hand-offs on one row as ghost buttons, and take the
  height they gave back off the popup rather than leaving it under the results.
- Shorten their copy to `New branch` / `Manage branches`, in both languages. Only
  these two: the product's own vocabulary for a branch is unchanged.
- Say the scope in the History screen header's caption when it is not the current
  branch, in the caption's own voice. It informs; it does not offer.
- `Another branch…` becomes `Specific branch…`.
- Give the chosen branch a visible selected state inside the filter panel, with its
  own way out, without adding a permanent row outside the panel. The name is
  chosen from a list of the project's own branches rather than typed.
- Make `Actions` read as a control rather than a fact, without giving it a size
  of its own.
- Give the author and file/folder filters the same shortcut treatment, without
  pretending either list is complete, and give `Saved` the range Rust has always
  accepted.
- Keep the local-branch chips' affordance discreet: unchanged at rest, answering on
  hover and focus, with `aria-expanded` on the control that owns the menu.

# Out of scope

- Any redesign of Changes, History or Branches.
- A second branch selector in any screen header.
- New native reads, or any change to the Git semantics task 118 settled.
- Renaming "branch" across the product.

# Acceptance criteria

- [x] `Working on` is still the global context, at a lighter weight than the
      branch's name, and the status bar keeps its 34px.
- [x] The quick switch reads `New branch` and `Manage branches`, on one row, each
      reaching the flow it already reached.
- [x] The popup is shorter by the row it gave back.
- [x] History's header names the scope only when it is not the current branch, as
      part of the caption rather than as a badge or a control.
- [x] `Specific branch…` replaces `Another branch…` in both languages.
- [x] A chosen branch is visibly chosen inside the filter, and can be cleared
      there; the state does not rest on colour alone.
- [x] `Actions` is told apart from the metadata around it and keeps its actions.
- [x] Author and file/folder offer what this screen already knows, each saying
      where the list comes from, and both stay free text.
- [x] `Saved` can be given an explicit from/to range, and a preset and a range
      never claim each other's state.
- [x] The date group reads at one scale, on one line in both languages, and its
      chips name days the way the reader writes them.
- [x] Every filter group's label sits the same distance above its control.
- [x] Interactive branch chips answer on hover and focus and report their menu
      state; tags, remote refs and `HEAD` gain nothing.
- [x] Branches and Changes are unchanged; the three navigations still work.
- [x] `pnpm run check` passes.

# Relevant files

- `src/app/StatusBar.tsx`, `src/app/app-shell.css`
- `src/features/branches/BranchQuickSwitch.tsx`,
  `branches.css`, `translations.ts`
- `src/features/history/HistoryPanel.tsx`, `history.css`, `translations.ts`
- `src/architecture/styleComposition.test.ts`

# Dependencies

Task 118, which built what this refines.

# Decisions

**The footer actions became ghost buttons rather than shorter menu rows.** They
leave the control instead of choosing inside it, which is what a ghost button is
for here, and it hands them the shared control height and the shared quiet
treatment instead of a size of their own. The shape audit in
`styleComposition.test.ts` lost its `.branches-quick-switch__see-all` entry
for the same reason: the radius comes from the primitive now, and restating it
would be exactly the drift that audit exists to stop.

**The popup's height came down with them.** The box is fixed, so a shorter footer
without a shorter box is empty space under the results rather than a smaller
popup: 292 → 250px for the status variant, 380 → 338px for the roomier one.

**The scope belongs in the caption, not in a badge.** It is the same kind of fact
as the count beside it — what this screen is showing — and a badge would read as
a control the header does not have. Nothing was added when the scope is the
current branch, because the status bar already says that and a caption that repeats
it teaches the reader to stop reading captions.

**The caption's separator is a plain `·`, not `HistoryMetaDot`.** That component
takes its spacing from the flex `gap` of the meta row it was built for; inside a
paragraph it sits flush against both neighbours. Found by the test asserting the
caption's text, which read `3 saved versions loaded·All branches`.

**`Actions` keeps the chips' 23px and takes an outline and a chevron instead.**
DESIGN.md's rule is that a control needing a size of its own is usually a control
with the wrong shape; a 32px button standing in a 23px metadata row is that
mistake. Outlined-plus-chevron against filled-and-plain is enough to separate the
row's one control from its facts, at the row's own scale.

**The chosen branch is shown in the control rather than as a chip above it.** A
chip would add a row to a panel whose whole point is being compact, and the
control is where the answer already is. It carries an accent border, the name at
the strong weight, and its own clear button beside it — the last being the signal
that does not depend on colour.

**The name is picked from a list, not typed.** The first cut was a text field
with a `<datalist>`, which meant a field that could be wrong, a check that it was
not, and a sentence explaining the miss. The whole inventory is already in
memory — the status bar's own switcher renders it on every screen — so listing it
costs no read and retires all three. `historyScopeUnknownBranch` went with them: a
list cannot be misspelled.

**The five ways of answering "saved when" are one control.** The first cut put
the two ends in a row of their own under the presets, at the field tier — 32px
pills carrying a bold word and a 12px input, under 26px capsules at the caption
step. Three type sizes and two heights in one group is what made it read as two
unrelated things. `Custom` is the fifth capsule now, at the capsules' own scale,
and it only opens the two ends: choosing it narrows nothing until a day is
picked. The ends are two pills at that same 26px, with a dash between them and
their names read rather than drawn — at 127px each there is no room for a word
in front of a date.

**Five capsules, one line, after the measuring said which word was the problem.**
At the panel's 276px they came to 318px in Spanish and 260px in English — so
English already fitted and Spanish did not, and `Personalizado` alone was 87px of
the overflow. Two arrangements were measured against that: four words beside an
icon (230px English, 257px Spanish) and five shorter words at 6px of side padding
(233px and 261px). The second won, and not only on the numbers.

An icon-only member of a five-member radio group makes one of them speak a
different language from the other four, and the glyph it would take is a
calendar — the same one worn by the two fields that option opens, so the row
would say "calendar" twice meaning two things. It also puts the meaning behind a
hover, for the one control in the group that changes what the panel shows.

So the word changed instead: `Custom` became `Range`, `Personalizado` became
`Rango`. Shorter, and more accurate — what the option gives you is a range with
two ends, which is exactly what appears when you choose it. Wrapping is still
allowed, so a language longer than Spanish breaks the row rather than the words.
The scope's two capsules keep their ordinary padding, where they are
comfortable.

**Every label in the filter panel sits the same distance above its control.**
Two of the five groups are `<fieldset>`s, and a `<legend>` is not a grid item:
Chromium lays it out above the fieldset's box, outside the `gap`. So the version
branch and the date sat flush against their capsules while the author and the path
kept their 6px — measured at 0px against 6px. The legend carries the gap as a
margin now, off the same custom property the grid uses, so the two cannot drift.

**`Saved` became `Date`.** The other three groups are named by the noun they
filter — Author, Branch, File or folder — and a participle among them read
as a different kind of thing. The vocabulary for a commit is untouched: a saved
version is still a saved version everywhere it is one.

**The calendar the date control opens is browser chrome.** A page gets exactly
two levers over it — `color-scheme`, which decides whether it is drawn light or
dark, and `accent-color`, which decides the colour a chosen day is marked with.
Both are set, so it opens in the app's theme and selects in the app's green.
Everything else about that popup is the engine's, and matching it exactly would
mean building a calendar rather than using one.

**A date chip says the date the way the reader writes it.** `until` had no
control, so nothing had ever rendered one: the chips printed the raw
`2026-03-08`. They go through the app's own date formatting now — built from the
day's parts rather than parsed, because `new Date("2026-03-02")` is UTC midnight
and renders as the day before anywhere west of Greenwich.

**The date filter needed no Rust at all.** `until` has been validated as a
calendar day and answered by the same `rev-list` since the filters were built —
`countActiveFilters` counts it and the chips already described it. Only the
interface had never offered a control for it, so a reader who wanted "that week
in March" had no way to ask. Two native `<input type="date">` under the presets
close that: they bring a calendar, the reader's own date format and full keyboard
support, and they emit exactly the `YYYY-MM-DD` Rust wants. The presets now clear
`until` when chosen, and `Any` is only active when both ends are empty, so the two
controls cannot claim each other's state.

**Author stayed a text field.** It is tempting to give it the picker the Branches got, but the two are not the same question: the branch inventory is complete
in memory, while the authors this screen knows are only those of the versions it
has loaded — and Git matches the author filter as a substring over every version
there is. A closed list would quietly narrow the filter to what happened to be on
screen. It gets the list as a *shortcut* beside the box instead, with a branch under
it saying where the names come from.

**A shortcut's note says what it is, in four words.** The first cut spelled the
whole thought out — "From the versions loaded. The filter still asks about every
version." — which is true, and two lines of small grey text under a list nobody
opened to read prose. "Only the versions loaded" carries the part that matters:
this is not all of them. Same length in both languages.

**File and folder got the same shape, from the only paths this screen holds.**
There is no inventory of every path anywhere in the app, and building one would
mean a new native read that walks a tree every time the filters open. What the
screen does hold is the version whose card is open, so its folders (to two levels)
and its files are offered, labelled as such. The bigger win was quieter: `/src`,
`src/`, `./src` and a Windows `srcpp` all used to fail the whole read with
"that file path isn't valid", for four spellings of a path that is perfectly
valid. They are normalized now. An absolute path still fails, because that is a
different place rather than a different spelling of this one.

**A list inside the panel closes when the press lands elsewhere in it.** The
panel's `useAnchoredPopup` only dismisses what is pressed *outside* the panel,
which is right for the panel and not enough for the three lists it now contains:
the scope picker and the two field shortcuts stayed open under whatever the
reader reached for next, and all three could be open at once, overlapping each
other. `useDismissOnOutsidePress` takes the parts rather than one container,
because a shortcut is a trigger and a list with nothing wrapping them. Focus is
not restored on that path: the press is already putting it where the reader
meant it to go.

**A shortcut's two kinds of path get their own share of the budget.** Folders
first and files after, cut at forty, meant a version spread across many folders
offered no file at all. Fifteen of the forty are the folders' at most; the rest
is left for files.

**A preset stops naming a range once it has two ends.** A preset is shorthand
for a `since` with no `until`, so `7 days` beside `To 5 Mar` describes the last
seven days, which is not what is being read. The chip names both ends as soon as
the second one is set.

**The list is not portalled.** The filter panel dismisses on a pointer press
outside its container, so a list rendered to `document.body` would be outside it
and choosing a branch would close the panel that asked the question. It is
absolutely positioned inside the panel instead, which the panel allows because it
does not clip its overflow. Escape and the arrow keys are stopped there too:
Escape belongs to the innermost thing that is open, and the panel runs its own
menu keyboard handling that would otherwise move focus twice.

# Implementation notes

`.branches-quick-switch__footer` is a flex row with `justify-content:
space-between`; the see-all keeps `margin-left: auto` when it is the only child,
which is the case wherever `onCreate` is absent. Both labels ellipsis rather than
wrap, so a narrow window compresses the row instead of breaking it into two.

The feature's `@media (pointer: coarse)` rule stopped restating 44px for these
two: `primitives.css` already raises every `.ghost-button` to
`--control-height-lg` there, and a second copy of an accommodation is how the two
drift apart.

`aria-expanded` is now on both menu triggers in the detail card — the local-branch
chips and the actions control — which is what makes their open state visible to a
screen reader and lets the CSS mark it without a second class.

# Validation

```bash
pnpm run check
```

Passed: documentation, frontend architecture, TypeScript, 776 frontend tests, the
production build, `cargo fmt --check`, Clippy, and 378 Rust tests. No Rust source
changed in this task.

New frontend coverage: the picker listing the project's branches in order, its
search narrowing a long list, Escape closing it while leaving the filter panel
open with focus back on its trigger, and a press elsewhere in the panel closing
it while the panel stays; a range with two ends naming both rather than the
preset its start happens to match; an explicit from/to range reaching
Git, and a preset clearing the range; the author and path shortcuts applying a
value and naming their source; the four spellings of a folder that now all mean
the same folder; the status bar's "Working on" and its
hierarchy; both
footer actions in one row, in reading order, each reaching its own flow; Escape
closing the quick switch and restoring focus to the strip; the header naming the
scope for `All branches` and a named branch and staying silent on the current branch;
the chosen branch's selected state and its clear control, and the absence of that
control while no branch is chosen; the actions control's `aria-expanded` and focus
restoration; and a local branch in the detail acting while a tag and `HEAD` stay
facts.

The filter panel was rendered from fixtures in a throwaway Vite harness and
looked at, because the complaint that started the date work was visual. Measured
there, at the 302px panel: the five capsules on one line at 261px of the 276px
available in Spanish and 233px in English, the two date ends on one row, an empty
end at the secondary colour and a filled one at `--weight-strong`, in both
themes. And after the legend fix,
6px between every label and its control against 12px between groups, across all
five. The harness was deleted
afterwards.

The rest is not verified in a running app: these screens read the repository
through Tauri IPC, which a browser preview cannot exercise.
