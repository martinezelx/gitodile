---
id: 106
title: Give controls a size scale and settle every button at 38px
status: done
priority: normal
type: refactor
areas:
  - frontend
  - design-system
created: 2026-09-03
completed: 2026-09-03
parent:
---

# Goal

Give the design system the one axis it never had — control size — and make the
labelled button primitive carry it, so a button is 38px tall everywhere instead
of five different heights decided independently by five features.

# User outcome

The action pair at the bottom of a dialog, the `Save selected` in Changes, the
`New branch` in Branches and the `Review changes` / `Save version`
pair in Overview all read as the same control. Today they do not: the Overview
pair is the only one anybody sized on purpose, and everything else is between
5px and 6px taller with a label two and a half points larger.

# Context

Reported by the user: cancel/action pairs and several feature actions "son un
poco mas grandes de lo normal", and the wanted size is the Overview hero pair.

The measurements below were taken against the running dev server on Windows
(Segoe UI), not computed:

| Control | Height | Font |
| --- | --- | --- |
| Overview `Save version` / `Review changes` | 38.0 | 13.5px |
| Changes `Save selected (2)` | 38.0 | 16px |
| `.changes-danger-button` | 39.2 | 16px |
| Branches `New branch` | 43.2 | 16px |
| `.dialog-actions` (Save version, Publish, Discard, message dialog…) | 43.2 | 16px |
| Clone / Initialize / Get team / Team changes | 44.0 | 16px |
| Clone / Initialize path picker | 42.0 | 16px |
| `.ghost-button` | 29.6 | 13px |
| Branches row actions | 32.0 | 13px |

The cause is structural rather than careless. `.primary-button` /
`.secondary-button` in `shared/ui/primitives.css` declare padding and radius and
nothing else — no height, no `font-size`. There is no `font-size` on `body` or
`:root` either, and `base.css` sets `button { font: inherit }`, so **every
un-overridden button renders at the browser default of 16px**, and its height
comes from `line-height: normal`, i.e. from the system font's metrics. Nobody
chose 43.2px; it is what Segoe UI happens to produce, and it is not even stable
across platforms.

`tokens.css` governs radius, spacing, duration and colour. Size is the only
visual axis with no token at all, and `DESIGN.md` § Shape spends eighty lines
and a build-breaking guard in `styleComposition.test.ts` on radius while saying
nothing about size. With shape governed and size not, each feature settled size
locally and nothing detected the drift.

Two consequences worth naming:

- The four dialogs at 44px are not using a "large" size on purpose. 44px is the
  `@media (pointer: coarse)` value from `primitives.css`; those four wrote it as
  a fixed `min-height`, so they render permanently at the touch size on desktop.
- Radius depends on height here. `--radius-pill` resolving to half the height is
  what makes the concentric nesting in `DESIGN.md` § Shape true, and it is only
  actually true where somebody pinned 38px by hand.

Decision from the user: **38px everywhere**, with the larger size reserved for
coarse pointers rather than offered as a choice.

# Scope

- Add control-size tokens to `styles/tokens.css` (`--control-height-sm/md/lg`
  and the matching `--control-font-sm/md`).
- Move height, block padding, `font-size` and the inline-flex/centring boilerplate
  onto the `.primary-button` / `.secondary-button` primitive.
- Bring `.ghost-button`, `.changes-danger-button` and `.text-field input` onto
  the same scale.
- Delete the per-feature size overrides this makes redundant, in Changes,
  Overview, Clone, Initialize project, Sync and Branches.
- Point the `pointer: coarse` block at `--control-height-lg` instead of a literal.
- Document the scale in `DESIGN.md` beside § Shape, and add a guard to
  `architecture/styleComposition.test.ts` that fails the build on a control
  height that is not a token.

# Out of scope

- The segmented control, the settings nav rows and the project-switcher rows.
  They are rows and frames rather than labelled buttons, and none of them was
  reported.
- `history.css`'s diff-pane footer button (30px / 10px). The diff panes are a
  deliberately denser context with their own type scale; it is recorded as an
  accepted exception rather than normalised.
- `.pending-versions__publish-button` (34px) and `.overview-history__all` (36px).
  Bespoke inline controls that need their own decision; captured as follow-up.
- Introducing a global `body` `font-size`. It would move far more than buttons
  and deserves its own task.

# Acceptance criteria

- [x] `--control-height-sm/md/lg` and `--control-font-sm/md` exist in `tokens.css`.
- [x] `.primary-button` and `.secondary-button` declare their own height and
      `font-size`; neither depends on the browser's default font size.
- [x] Every labelled button reported as oversized measures 38px in the running
      app: Changes `Save selected`, Branches `New branch`, the
      `.dialog-actions` pairs, and the Clone / Initialize / Get team /
      Team changes actions.
- [x] The Overview hero pair is unchanged at 38px / 13.5px.
- [x] No feature CSS file contains a literal control height that duplicates a token.
- [x] `pointer: coarse` still grows labelled controls to 44px.
- [x] `DESIGN.md` documents the scale and `check:docs` passes.
- [x] `styleComposition.test.ts` fails on a non-token control height.
- [x] `pnpm run check:frontend` passes.

# Relevant files

- `src/styles/tokens.css`
- `src/shared/ui/primitives.css`
- `src/features/changes/changes.css`
- `src/features/overview/overview.css`
- `src/features/clone/clone.css`
- `src/features/initialize-project/initialize-project.css`
- `src/features/sync/sync.css`
- `src/features/branches/branches.css`
- `src/architecture/styleComposition.test.ts`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- **38px is the standard, not a new number.** `DESIGN.md` § Shape already
  assumes it in passing ("The Changes action cluster hugs 38px circles"), and
  Overview and Changes had both already landed on it. This task moves it from
  two features into the primitive rather than inventing a house size.
- **`lg` (44px) is a pointer accommodation, not a hierarchy step.** It is
  reachable only through `pointer: coarse`. A dialog's primary action does not
  get to be bigger than the same action on a screen; that difference is what
  produced the drift in the first place.
- **`sm` (32px) is kept as a real tier** because three places already sit near
  it (ghost buttons, branch row actions, the diff footer). Naming it stops
  the next 30px button from being invented. `.ghost-button` grows 29.6 -> 32 as
  part of this; that is a deliberate 2.4px change, not a side effect.
- **The primitive takes `display: inline-flex` and a gap.** Roughly a dozen
  feature rules exist only to redeclare `inline-flex; align-items: center;
  gap: 8px` on a button that already has an icon; folding that into the
  primitive is what lets those rules be deleted rather than merely trimmed.
- **`.text-field input` comes along** even though the report was about buttons.
  The Clone and Initialize path pickers put an input and a button in one grid
  row, so leaving the input at ~40.6px against a 38px button would replace one
  visible mismatch with another in exactly the components that were reported.

# Implementation notes

**The primitive now owns four things it never declared.** `.primary-button` /
`.secondary-button` in `shared/ui/primitives.css` take `min-height:
var(--control-height-md)`, `font-size: var(--control-font-md)`, symmetric block
padding, and `display: inline-flex` with a centred `gap`. The last one is what
made the deletions possible rather than merely smaller: roughly a dozen feature
rules existed only to redeclare `inline-flex; align-items: center; gap: 8px` on
a button that already had an icon, and those rules are gone rather than trimmed.
`min-height` rather than `height`, so a wrapped label grows the button instead
of spilling out of it.

`.primary-button--sm` / `.secondary-button--sm` is the row-scale modifier. It is
live code, not a spare part — the branch row actions in
`BranchesPanel.tsx` carry it, which replaced three local numbers in
`branches.css` with one class.

**Overrides removed.** Changes (header cluster height, the save button's
flex boilerplate, the notice buttons', the discard dialog's), Overview
(`.project-hero__action` is down to `white-space: nowrap`), Clone and
Initialize project (both the 44px actions and the 42px path picker), Sync
(both 44px blocks), Branches (header, banner, row actions).

**Literals converted to tokens** where they already agreed with the scale:
the Changes overflow circle, `.refresh-icon-button`, the Overview summary
card's selector / create circle / settings circle, the quick-switch create
circle, and every `44px` in a `pointer: coarse` block.

**One trap worth recording.** `.branches-quick-switch__create` is a
`.secondary-button` that declares `width: 32px; height: 32px` to be a circle. A
`min-height` outranks a `height`, so the primitive's new `min-height` silently
made it 32 wide and 38 tall. It now declares `min-height` as well. Any other
square control built on the button primitive needs the same.

**Beyond the stated scope, both recorded in Decisions above:** `.ghost-button`
grew 29.6 -> 32px to land on the `sm` tier, and `.text-field input` moved from
~40.6px to 38px so the Clone and Initialize path pickers align with the button
sharing their grid row.

**The guard.** `styleComposition.test.ts` gained two tests: one asserting the
tokens exist, are ordered, and are what the primitive reads; one failing on any
feature rule that gives a button its own height, `min-height` or `font-size`.
The second only judges a selector whose final compound *is* the button, so a
feature sizing its own `svg` inside one is still its own business. The diff
pane's footer is allowlisted there by name. The guard was checked against a
deliberate regression (`min-height: 40px` on a Sync action) and caught it before
being reverted.

**A second pass, after the first review.** The Changes toolbar had its own
control-height variable (`--changes-toolbar-control-height: 34px`) predating
the scale, and `history.css` overrode it to 32px — one control wearing two
heights two pixels apart. It now reads `var(--control-height-sm)`, and
`--changes-toolbar-height` became `calc(... + 19px)` so the strip's documented
+9/+9/+1 contract holds by construction instead of as a restated number. The
History override is gone: both surfaces now get 32 from the same place. Net
effect is that the Changes toolbar strip goes 53 -> 51px and its search box and
view picker 34 -> 32px; History is unchanged, since 32 is what it had asked
for. A third guard (`keeps control-height variables derived from the scale`)
catches this whole form, which the button-rule guard could not see. The
`pointer: coarse` `.toggle-switch` literal took the token in the same pass.

**Found in the review pass, and fixed.** `.changes-view-picker__trigger` asks
for `padding: 0 var(--space-4)`, and that block padding had never applied: the
trigger also wears `.branch-selector`, `features/branches` loads
after `features/changes`, and at equal specificity the selector's `padding: 6px`
won. Invisible while the control was 34px tall — the label had 2px to spare —
and exactly flush at the 32px row tier, which is what surfaced it. The rule is
now doubled up as `.changes-view-picker__trigger.branch-selector`, and
the label went from 0px of slack to 12px. A pre-existing bug rather than one
this task introduced, but this task is what made it matter.

**A regression this task shipped, found by the user and fixed after
completion.** `--changes-toolbar-control-height` is declared on
`.changes-layout`, and the History diff toolbar is *not* inside that container —
`.history-workspace--diff` was the only place declaring it for the History
screen. Removing that declaration as "redundant" left the variable undefined
there, so `height: var(--changes-toolbar-control-height)` became invalid at
computed-value time and the view picker fell to `height: auto`, collapsing from
32px to 17px beside a 32px search box.

The mid-task verification gave a false pass: the harness measured the picker at
32px because `.branch-selector`'s stray `padding: 6px` happened to add up
to exactly that, and the later cascade fix removed the padding that was hiding
it. Measuring a number without checking *which rule produced it* is what let
that through.

Fixed in three places rather than by putting the declaration back: the shared
`DiffViewSelector` trigger and the Changes search box now read
`var(--changes-toolbar-control-height, var(--control-height-sm))`, so a control
shared between screens falls back to the row tier instead of to nothing when a
host does not declare the variable; `.history-search-box--diff` reads the same
token instead of a literal `32px`, so the pair matches structurally rather than
by two numbers agreeing; and a fourth guard (`keeps control-height variable
reads fallback-safe`) fails the build on a feature-scoped control-height read
with no fallback. Verified against the real toolbar markup: both controls 32px,
identical top and bottom edges.

**Follow-ups, deliberately not taken here:** `.pending-versions__publish-button`
(34px), `.overview-history__all` (36px) and `.branches-filter__clear`
(36px) are bespoke inline controls that still carry their own heights; the
segmented control sits off the scale at ~34.6px. `.changes-danger-button`
now reads the tokens but is not a primitive, so the button guard cannot see it;
promoting it to a shared danger variant would close that and is a markup change
this task did not need. Typography is the larger one
and is now task [107](107-type-scale.md): 24 literal font sizes in 306
declarations, no scale in `DESIGN.md`, and the missing `body` `font-size` that
leaves anything un-sized on the browser's 16px.

# Validation

Measured in the running dev server (Windows, Segoe UI), before -> after:

| Control | Before | After |
| --- | --- | --- |
| Overview `Save version` | 38.0 / 13.5px | 38.0 / 13.5px (unchanged) |
| Changes `Save selected (2)` | 38.0 / 16px, 159.5 wide | 38.0 / 13.5px, 140.2 wide |
| Branches `New branch` | 43.2 / 16px | 38.0 / 13.5px |
| `.dialog-actions` primary | 43.2 / 16px | 38.0 / 13.5px |
| Clone / Initialize / Get team / Team changes | 44.0 / 16px | 38.0 / 13.5px |
| Clone path picker (input / button) | 38.6 / 42.0 | 38.0 / 38.0 |
| `.changes-danger-button` | 39.2 / 16px | 38.0 / 13.5px |
| `.ghost-button` | 29.6 / 13px | 32.0 / 13px |
| Branches row action | 32.0 / 13px | 32.0 / 13px (now via `--sm`) |
| History diff footer (documented exception) | 30.0 / 10px | 30.0 / 10px |

The Clone dialog was also measured in the real app rather than on a harness
page: path picker input 38, path picker button 38, primary action 38.

Second pass, Changes/History toolbar: control 32 on both surfaces (was 34 in
Changes, 32 in History), Changes strip 51 (was 53), `calc` resolving as
intended.

Commands run:

- `pnpm vitest run src/architecture/styleComposition.test.ts` — 13 passed.
- `pnpm run check:frontend` — 70 test files, 634 tests passed; typecheck and
  build clean.
- `pnpm run check:docs` — passed over 161 Markdown files and 127 task ids.
- After the post-completion fix: `pnpm run check:frontend` — 70 test files, 636
  tests passed. The new guard was checked against a deliberate regression.

`pnpm run check:rust` was not run: no Rust source was touched.

Left `active` at the user's request while the visual result was under review,
and closed once it was. The follow-ups listed above outlived the task: they are
in [`work/backlog.md`](../../backlog.md) now rather than only here, where a
completed file is the last place anyone would look for open work.
