---
id: 081
title: Make radius state a role instead of a size
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design-system
created: 2026-08-27
completed: 2026-08-27
parent:
queue: "18"
---

# Goal

Replace the size-based radius scale with role tokens, round the rectangular
tiers so they sit comfortably beside the circular controls introduced in task
080, and make the rule enforceable so new components cannot reintroduce loose
values.

# User outcome

Controls across the app read as one family. A button is as round as a button,
wherever it is, instead of one of three different values depending on which
stylesheet it happened to be written in. Buttons, inputs and selectors are
visibly rounder, which is what makes them look intentional next to the circular
icon controls rather than like leftovers from a squarer design.

# Context

Task 080 turned icon-only controls and identity glyphs into circles. That
exposed the rectangular half of the vocabulary: at `--radius-md: 10px` a 38px
button sits at 0.26 of radius over height against a circle's 0.5, so the two
read as unrelated rather than as a deliberate pair.

Auditing the scale before changing it showed the real problem was not the
values but what they were keyed on. The tokens were named by size
(`sm`/`md`/`lg`/`xl`) while the components were reaching for a role, so the two
never lined up:

- **Buttons lived in three places at once**: `--radius-md` (`primary-button`,
  `secondary-button`, `branch-selector`), `--radius-sm` (~20 more,
  including `ghost-button`, `dialog-close-button` and every titlebar icon
  button), and hand-written `8px`/`9px` in History.
- **`--radius-md` held four unrelated roles**: buttons, popovers, notices and
  list rows.
- **`--radius-lg` held two**: mid-size containers and square icon tiles.
- **16 declarations were raw literals** (`6px` ×9, `8px` ×3, `9px`, `10px` ×3),
  a de-facto sixth tier nobody had named.

Bumping the numbers alone would therefore have made things worse, not better:
`--radius-md` reaches the primary button but not `ghost-button`, so the app
would have ended up with two button roundnesses instead of one.

# Scope

- Replace `--radius-sm`/`md`/`lg`/`xl` with role tokens, and tokenize the
  circle and capsule literals so the shape vocabulary is complete.
- Reclassify every `border-radius` declaration in the app by role.
- Set the rectangular tiers so they form a concentric chain.
- Make every square glyph tile a circle, at every size, so a section icon is
  the same shape as the identity and action glyphs beside it.
- Round controls to 14px, the value that pairs with the circles.
- Keep the large components at 18px, unchanged.
- Fix `.app-menu`'s padding so its menu/row pair is actually concentric.
- Record the rule in DESIGN.md as the way to choose a radius for anything new.
- Add guards so a raw length or a broken chain fails the build.

# Out of scope

- Changing the shape of a control on any grounds other than the rules stated
  here. Elevation, color and size are all untouched.
- Changing sizes, padding or layout, beyond the one `.app-menu` padding step
  that concentricity requires.
- Retheming, recoloring, or touching elevation.

# Acceptance criteria

- [x] No stylesheet references `--radius-sm`, `--radius-md`, `--radius-lg` or
      `--radius-xl`.
- [x] Every `border-radius` in the app is built from role tokens. The only
      literals left are `0`, `inherit`, and the 2px search highlight and tab
      underline, which are not shape tiers.
- [x] `control = item + 4` and `surface = item + 8 = control + 4`, so a
      container is already the right radius for what it wraps.
- [x] A button is one radius everywhere, whichever stylesheet defines it.
- [x] No square control lands between 0.43 and 0.5 of radius over side, where
      it would read as a failed circle.
- [x] Every square tile holding one glyph on a fill is circular, and the two
      deliberate exclusions (a transparent-fill step button, a preview holding
      a miniature layout) are not.
- [x] Every icon-only button in an action row is circular, and every one
      attached to a host is not.
- [x] `--radius-surface` is still 18px: dialogs and section cards are unchanged.
- [x] DESIGN.md states the rule as a role table plus the constraints that keep
      it honest, and carries no size-named radius token.
- [x] Three guards in `styleComposition.test.ts` fail the build on a raw
      length, a broken concentric chain, or a square shape in the
      failed-circle band.
- [x] Frontend checks pass.

# Relevant files

- `src/styles/tokens.css`
- `src/architecture/styleComposition.test.ts`
- `src/shared/ui/primitives.css`
- every feature stylesheet under `src/features/`
- `src/app/app-shell.css`
- `DESIGN.md`

# Dependencies

Follows task 080, which introduced the circular controls this scale had to be
brought into line with.

# Decisions

- **Roles, not sizes.** Five tokens: `--radius-item` (10), `--radius-control`
  (14), `--radius-surface` (18), `--radius-pill` (999), `--radius-round` (50%).
  The alternative — keep the size scale and bump its values — was rejected
  because it leaves "button" unreachable as a single concept, which is the
  actual defect.
- **14px for controls**, chosen over a softer 12px. At 38px height that is 0.37
  against a circle's 0.5, which is where the two read as the same family. It
  also makes `item + 4 = control` exact, so a segmented control is concentric
  with its options for the first time.
- **The rectangular tiers are a chain, not a ladder.** Values were picked so
  every common padding step produces a container radius that already exists:
  10 + 4 = 14, 10 + 8 = 18, 14 + 4 = 18. This is what makes the rule usable
  without arithmetic at the call site.
- **`--radius-surface` covers both a dialog and a popover.** They are the same
  role — a container carrying its own background — and splitting them would
  have produced two tokens with the same value.
- **Size survives in exactly one rule**, and only for square icon *buttons*:
  up to 22px `--radius-round`, 24–36px `--radius-item`, 40px and up
  `--radius-control`. One value cannot serve a 24px box and a 52px one. Without
  this, 16 icon-only buttons inherited `--radius-control` and landed at
  0.44–0.70 of radius over side; a 28px one came out at exactly 0.5, an
  accidental circle.
- **An icon-only button is circular when it lives in an action row**, meaning
  a strip whose whole content is standalone actions: the rail, the titlebar
  cluster, a panel header's action group. Everywhere else it is an affordance
  attached to a host — a notice's dismiss, a path's copy, a dialog's close, a
  settings row's reorder arrows — and stays rectangular so it cannot compete
  with what it belongs to. The test is *where it sits*, not what it does, which
  is what makes it applicable by someone who did not write it. `.window-control`
  is the one exclusion: it sits in an action row but is the operating system's
  chrome, and it is not square anyway (38×32 computed), so a circle was never
  available to it.
- **A glyph tile is not sized into a tier at all** — it is a circle at every
  size. A square holding one icon on a fill is the same atomic thing as an
  avatar, so sizing it was answering the wrong question. This came out of
  reviewing the running app: the tiles were internally consistent at 0.27–0.35
  but read as leftovers from a squarer design next to the circular controls
  from task 080. Making them round also removes tiles from the size rule,
  which now governs icon-only buttons alone.
- **Enforcement over documentation.** The previous scale drifted because
  nothing stopped a raw `6px`. The rule is only worth writing down alongside a
  test that fails when it is broken.

# Implementation notes

- Migration was done by script with an explicit selector-to-role table, and
  anything unmatched was reported rather than guessed. One selector fell
  through (`.navigation-display__preview`, a 48px tile) and was classified by
  hand.
- 176 declarations now resolve through role tokens: 52 surface, 48 control
  (before rebalancing), 37 item, 24 pill, 15 round.
- A second pass moved 16 square icon controls of 20–36px down a tier, since the
  first pass had classified them by function alone and 14px is too round for
  that band. `.status-bar__action` at 20px became `--radius-round` outright.
- `.titlebar-icon-button` was the only button the action-row rule moved: the
  titlebar cluster (sidebar toggle, palette, back/forward, theme, account) is
  the rail's sibling. `.project-switcher__add` already did the right thing on
  its own — it renders as a rectangular row inside the switcher panel and as a
  circular `.sidebar-round` in the rail, the same action taking the shape of
  wherever it sits.
- `.app-menu` padding went from a loose `6px` to `var(--space-2)`, which is
  what makes its 18px surface concentric with its 10px rows. It was the only
  layout value this task changed.
- DESIGN.md's Shape section now leads with a role table, states the concentric
  chain as three worked examples, and keeps the four constraints
  (concentricity, square box for a circle, the half-height point where a card
  becomes a pill, and the size rule for square things).
- Three guards added to `styleComposition.test.ts`: every `border-radius` is
  built from radius tokens; the concentric chain holds so the values can only
  move together; and no rule that pins its own square box lands at 0.43 or more
  of radius over side.
- That third guard was written after the ratio audit it automates caught three
  real regressions. `.project-summary-card__identity .project-path__copy` had
  taken `--radius-surface` because the migration's longest-match rule preferred
  the container name in its selector over the component's own — 18px on a 32px
  box, 0.56. `.sidebar-jump__avatar` (20px) and `.project-switcher__avatar`
  (22px) were still square at 0.50 and 0.45 while the same project avatar was
  already round in the rail; both are identity, so both became circles.

# Follow-ups

- Verified in the running app only through the Vite dev server, which has no
  Tauri backend and so renders no project: the empty state, the rail, dialogs
  and the status bar were seen directly, and every other measurement was taken
  against the real cascade by instrumenting the live document. Overview,
  Changes and History have still never been seen populated. Task 080's
  Changes-header follow-up covers the same ground.
- `nav { display: grid; gap: 6px }` in `primitives.css` is a loose `6px` with
  the same smell as the radius literals were. Spacing, not shape, so it was out
  of scope here.
- `nav { display: grid; gap: 6px }` in `primitives.css` is another loose 6px
  with the same smell as the radius literals. Out of scope here, worth a look.

# Validation

Passed on 2026-08-27:

```text
pnpm run check:frontend
  frontend architecture: 290 modules
  frontend: 53 files, 441 tests passed (439 before, +2 radius guards)
  production build passed

pnpm run check
  documentation: 134 Markdown files, 101 task ids
  frontend architecture: 290 modules
  frontend: 53 files, 441 tests; production build passed
  Rust: fmt and Clippy passed; tests passed
```

Guard behavior confirmed rather than assumed: the token test failed on first
run against the three `var(--radius-surface) var(--radius-surface) 0 0`
declarations, which is a legitimate shape squared off on one side. The residue
check was widened to allow `0` corners and the guard then passed.

Every check is green, but none of them can see the app. What is verified here
is that the scale is internally coherent and that no raw length survives — not
that the result looks right. See Follow-ups.
