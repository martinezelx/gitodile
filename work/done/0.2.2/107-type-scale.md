---
id: 107
title: Give typography a scale the way shape and size have one
status: done
priority: normal
type: refactor
areas:
  - frontend
  - design-system
created: 2026-09-03
completed: 2026-09-05
parent:
---

# Goal

Replace 24 hand-picked font sizes with a named scale in `tokens.css`, and write
that scale into `DESIGN.md` § Typography, which today states requirements but
not a single value.

# User outcome

Text at the same level of the hierarchy is the same size in every screen. Today
a secondary line is 12px in one panel and 12.5px in the next, and a control
label is 13px or 13.5px depending on which feature drew it — differences small
enough to never be reported as a bug and large enough to make the app look
slightly unresolved everywhere at once.

# Context

Found while closing task [106](106-control-size-scale.md). That task fixed
control *size*; this is the same failure mode one level up, and it is now the
largest ungoverned axis in the system.

Counted across every CSS file in `src`: **24 distinct literal font sizes in 306
declarations**, and not one of them is a token.

| px | uses | | px | uses |
| --- | --- | --- | --- | --- |
| 12.5 | 60 | | 11 | 17 |
| 13 | 50 | | 14 | 13 |
| 12 | 46 | | 10.5 | 10 |
| 13.5 | 31 | | 10 | 8 |
| 11.5 | 20 | | 22 | 7 |

The remaining fourteen (7, 8.5, 9, 9.5, 14.5, 15, 15.5, 16, 17, 18, 20, 21, 23,
28) account for 51 more.

The shape of the problem is in the top of that table. **12, 12.5, 13 and 13.5
are four sizes inside one and a half points, used 187 times between them**, and
nothing distinguishes them: `.about-dialog__footer` is 12.5px secondary text,
`.palette-empty` is 13px secondary text, `.settings-dialog__header p` is 13.5px
secondary text. Three ways of saying the same thing, invented independently.

The cause is documented absence. `DESIGN.md` § Typography asks for "clear
distinction between headings, labels, body copy, and metadata" and "readable
line heights" — requirements with no values attached. Compare § Shape, which
names five radius tiers, gives a table of what each one *is*, states six
constraints, and is enforced by a guard. Where the design language gives a
number, the app is consistent; where it gives an adjective, every feature
answers it differently. Task 106 found exactly this for height and fixed it the
same way.

A related loose end from 106: there is still no `font-size` on `body` or
`:root`, so anything without an explicit size falls back to the browser's 16px.
Measured in the running app this is currently narrow — on the welcome screen only
`.compact-nav__item` lands there — but it is a trap rather than a defect: the
next element written without a size gets 16px silently, and 16px is a value
nobody in this codebase has ever chosen on purpose.

# Scope

- Add type-scale tokens to `styles/tokens.css`.
- Set a default `font-size` on `body` so nothing falls back to the browser's
  16px, and make it a step of the scale.
- Replace the literal `font-size` declarations across `app/`, `shared/ui/` and
  every feature with the token nearest their intent — nearest *role*, not
  nearest number; several of these will move by half a pixel and a few by more.
- Rewrite `DESIGN.md` § Typography around the scale, in the form § Shape uses:
  a table of what each step *is*, with examples.
- Add a guard to `architecture/styleComposition.test.ts` failing the build on a
  literal `font-size`, with any genuine exception allowlisted by name.

# Out of scope

- ~~Line heights, weights and letter-spacing.~~ **Scope change, at the user's
  request and one axis at a time.** The plan was to settle size first and earn
  the right to the others later. What happened instead is that each axis
  surfaced the next: with size fixed, History read as bold, which was weight;
  with weight fixed, the type read as too large, which sent us to the reference
  ramps and moved size again; and with all three settled, leading and tracking
  were the only unsystematised axes left. The reason for deferring them was that
  four axes at once make the visual review impossible to hold in your head —
  which held, so they went in as four reviewed passes rather than one.
- ~~The monospace stack.~~ Also pulled in: it was written out verbatim twelve
  times, and the boundary this task was told it would hit — "dense metadata" vs
  "diff chrome" — turned out to be answerable. See Decisions.
- The diff/code type *ramp*. `--leading-code` and `--font-mono` name what the
  code surfaces already were; nothing about the diff's own density changed.
- Font family beyond naming the two stacks. The stacks themselves are unchanged.

# Acceptance criteria

- [x] A type scale exists in `tokens.css`, and every step is used. Nine steps,
      lowest use is `--text-hero` at 2 and `--text-title` at 7.
- [x] `body` declares a `font-size` from the scale. Four elements were silently
      on the browser's 16px and are now on `--text-body`; see notes.
- [x] No CSS file in `src` contains a literal `font-size` outside the
      allowlisted exceptions. Two, both named in `DESIGN.md` and in the guard.
- [x] `DESIGN.md` § Typography names each step, says what it *is*, and gives
      examples — the shape § Shape and § Size already use. It also carries the
      comparison table the steps were calibrated against.
- [x] A guard in `styleComposition.test.ts` fails on a literal `font-size`, and
      was checked against a deliberate regression. Four guards in the end, each
      checked against a deliberate regression.
- [~] Every screen and dialog reviewed against before/after. **Partially.** The
      user reviewed the running app twice, which is what caught "too bold" and
      "too large". Beyond that, surfaces were verified on harness pages built
      from the real stylesheets and the real markup — History (timeline, detail,
      overview tab, files), Changes and Branches headers, Overview hero and
      section cards, the settings rows, the notices, the rail, the diff, and
      every fixed-size badge and avatar. Not every dialog was walked
      individually; the dialogs share `.dialog-*` and the primitives, and their
      one divergent title (`.issue-report-dialog > h2`) was found and fixed.
- [x] `pnpm run check:frontend` and `pnpm run check:docs` pass.

# Relevant files

- `src/styles/tokens.css`
- `src/styles/base.css`
- `src/app/app-shell.css`
- `src/shared/ui/primitives.css`
- every file under `src/features/*/`
- `src/architecture/styleComposition.test.ts`
- [`DESIGN.md`](../../../DESIGN.md)

# Dependencies

Task [106](106-control-size-scale.md), which established that a visual axis
belongs in `tokens.css`, is documented in `DESIGN.md` with a role table, and is
held by a guard. This task follows that pattern; it does not depend on 106's
code.

# Decisions

**The steps were not chosen from the clustering above.** That table proposed
seven steps derived from where the existing sizes piled up — which would have
canonised the drift rather than replaced it. The user asked instead for the
established consensus, so the steps were calibrated against five reference
ramps, read from primary sources and from the source of two Git clients:

| Source | Body | Secondary | Floor | Section heading | Screen title |
| --- | --- | --- | --- | --- | --- |
| [macOS HIG](https://developer.apple.com/design/human-interface-guidelines/typography) | 13 | 12 / 11 | 10 | 15 / 17 | 22 |
| [Windows 11 / Fluent 2](https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography) | 14 | 12 | 12 | 20 | 28 |
| VS Code | 13 | 12 | 11 | — | — |
| [GitHub Desktop](https://github.com/desktop/desktop) | 12 | 11 | 9 | 14 | 28 |
| [GitButler](https://github.com/gitbutlerapp/gitbutler) | 12 | 11 | 10 | 13–15 | — |
| **GitOdile** | **13** | **12 / 11** | **10** | **15 / 17** | **22** |

22/17/15 is the macOS title ramp and 13/12/11/10 its body ramp, which is also
where VS Code, GitHub Desktop and GitButler land. Fluent's 14px body and 12px
floor belong to a general-audience, touch-capable ramp; every dense developer
tool in the table sits below it, and so do we.

**Whole pixels.** The first cut of the scale ran 13.5/13/12.5/11.5/10.5 — half a
pixel above every ramp in the table, on every step. The cause was structural:
five steps had been squeezed into the four the ramp has, and the halves were
what that squeeze looked like. No established ramp uses a fractional size, and a
fractional one also sits worse on the pixel grid at small sizes. `--text-meta`
was the step that came out.

**`--control-font-*` tracks the text scale.** DESIGN.md § Size already said a
label and the control it names agree; making `--control-font-md` = `--text-body`
and `--control-font-sm` = `--text-label` turns that from prose into two numbers
a guard compares.

**Semibold, not bold, carries emphasis.** Fluent states it outright: bold is not
part of the Windows type ramp. `<strong>` is pinned to `--weight-strong` in
`base.css` for exactly that reason — see the notes for what it fixed.

**The two clusters this task was warned about.**

- *The 7–9.5px badge counts.* Split rather than folded. 9 and 9.5px were avatar
  initials and a notification count, all of which fit `--text-micro` (10) once
  measured — verified in the browser, not reasoned about. Only
  `.sidebar-project__badge-count` genuinely could not: a numeral inside a 14px
  status dot has a 10px box once the ring and padding are out. It stays at 7px,
  named in the guard and in `DESIGN.md`, alongside a second exception found
  later — `.navigation-display__preview small`, which is a label inside a
  miniature *drawing* of the navigation rail rather than text anyone reads.
- *The "dense metadata" vs "diff chrome" boundary.* Answerable, and the answer
  is not about density: **a code surface is not the same as monospace text.** A
  diff, a code block and the ignore-file editor are surfaces and take
  `--leading-code`; a branch name or a file path that merely happens to be
  monospace is a *name* and takes `--leading-snug`. Deciding this by font family
  is what had left one list in `sync.css` at 1.35, 1.4 and 1.45.

Already decided, carried from 106: a token states a **role**, never a size, and
the guard allowlists exceptions by name so a second one is a deliberate edit
rather than a quiet override.

# Implementation notes

Five axes, in the order the user's reviews surfaced them. Each pass was reviewed
in the running app before the next started.

**Size.** 248 literal declarations across fourteen sheets, spread over
twenty-two distinct values. The bulk mapped mechanically; nine needed judgement
and were moved to the nearest *role*, not the nearest number: the About and
project-hero 28px became a new `--text-hero` step (Fluent's Title is exactly 28,
and both are a *name* rather than a heading); the settings dialog's 21px title
joined its siblings at `display`; the welcome `h1` lost its 20px override and
takes the 22 every other `h1` has; the Overview hero heading (18) and the
section cards (16) kept their relative order as `title` over `subtitle`.

**Weight.** History was the reported symptom — "too much bold" — and it was not
in its CSS: it was eight surfaces using `<strong>` as layout (filename, file
count, meta value, metric figure, area total, diff-pane header), which the
browser renders at 700, the loudest step the app owns. `base.css` now pins
`strong`/`b` to `--weight-strong`, and `h2`/`h3` to `--weight-heading` and the
scale's sizes rather than the browser's bold and 24px guess. History's own
630/680/760 — values that existed nowhere else in the app — went to the scale;
the clearest evidence was the *same* commit row, which Overview rendered at 650
and History at 680.

**Size, again.** With weight settled the type read as too large, which is what
sent us to the reference ramps and produced the whole-pixel scale above. The
timeline row shrank back with it, 84 → 82px, and the badge capsule with it.

**Leading and tracking.** 98 line heights over twelve values for what were only
ever four roles plus code; 29 tracking values over eleven, among them −0.005,
−0.012 and −0.018em — differences of about a fifth of a pixel at the sizes they
were written on. The uppercase labels were at 0.04em and 0.08em and were
unified at 0.06em, the one value where neither moves more than 0.02em.

**The font stacks.** Found in the closing review: the monospace stack was
written out verbatim twelve times. `--font-sans` and `--font-mono` now name
both. The TypeScript side had already understood this — `SYSTEM_MONO_STACK` in
`features/changes/diffPreferences.tsx` — so the CSS was the half that never got
named; the two are cross-referenced in `tokens.css` and must stay in step.

**Figures, found in the same closing review.** `.changes-view__lines` renders
the diff totals with `font-variant-numeric: tabular-nums`; `.history-lines-*`
renders the same two numbers and did not, so one screen's counts held their
column and the other's shuffled sideways as the value changed. Five History
surfaces now take tabular figures: both line totals, the tab count, the overview
stat figures and the per-area count column — plus the sidebar status dot and the
notification badge, which are counts that update in place. The rule is written
into § Typography: *a figure read against a sibling takes tabular figures.*

Those same two numbers were also wearing the wrong colour vocabulary —
`--status-success` / `--status-danger`, which are for a *state* — while Changes
used `--diff-added` / `--diff-removed`, the tokens that exist for exactly this.
History now uses them too. The remaining `--status-*` uses in `history.css` are
genuine states (error banners, the published chip) and the overview metric tones
are file *categories*, which match `.history-file__category--new/--deleted`; both
were left alone.

**The missing `body` font-size**, the loose end 106 recorded. Four elements were
silently on the browser's 16px: `.pending-versions__summary`,
`.project-path__copy` (an icon button, so no visible text),
`.branch-card__value` and `.compact-nav__item`. All four are now on
`--text-body`.

**Two defects found in the closing review, both real.**

- *The `font:` shorthand hid from both guards.* It carries size and weight
  inside itself, so `font-size:` and `font-weight:` patterns never saw it. Six
  rules were hiding there — one of them still on **11.5px** after the entire
  cascade had moved to whole pixels, and one carrying a literal `600`. The
  guards now read inside the shorthand.
- *The reference badge had fallen under the floor.* It was `.9em` so one badge
  could serve two meta lines of different sizes. Once both hosts landed on
  `--text-caption`, the fraction had nothing left to absorb and 0.9 × 11 = 9.9px
  — below the 10px floor. It is a fixed step now.

**Hierarchy fixed in the detail pane.** The commit `h2` and the overview cards'
`h3` were both landing at 15px, so a heading three levels down measured the same
as the pane's own title. The `h2` now takes the default 17 and the cards' `h3`
drops to `--text-body`, the way the clone dialog's effect blocks already did.

**The guards.** `styleComposition.test.ts` gained four tests: weight (plus the
`<strong>` pin), size across the whole cascade, leading and tracking, and the
font stacks — the last of which also compares the CSS token against
`SYSTEM_MONO_STACK` in TypeScript, so the one duplication that cannot be removed
is at least held in step. The fractional-step and `--control-font-*` sync
assertions live inside the size test. Every one was checked against a deliberate regression rather than
trusted for passing green.

**A regression this task shipped, found in the pre-commit review.** Pinning
`h2` to `--weight-heading` in `base.css` took eight dialog titles off the
browser's bold. Seven sit at `--text-display` and that softening is the intended
effect — it is most of what "Settings looks smoother" was. The eighth is
`.about-dialog h2`, the app's own name at `--text-hero`, where 650 at 28px reads
thin; it had been relying on the browser's bold and nothing replaced it. It now
declares `--weight-title` and `--tracking-hero`, which also makes the two
`--text-hero` uses agree: a hero is a *name*, and both names now look like one.

Found by auditing every changed declaration against `HEAD` **by selector rather
than by position** — the first pass paired them positionally and silently
skipped four files whose rule counts had changed, which is exactly where the
added and removed rules were. Worth remembering: an audit that pairs by position
hides its findings in precisely the files that changed most.

**And then taken, at the user's call:** those seven dialog titles were at the
`display` *size* step but the `heading` *weight* step. A dialog title is the
title of that surface, so they take `--weight-title` now, like the screen `h1`
they sit alongside. Seven declarations rather than one, because the dialogs
share `.dialog-actions` and `.dialog-close-button` but no root class.

Aligning the weight then exposed the tracking: three of the seven were on
`--tracking-hero`, which is documented for the *largest* type on a surface and
is a step too tight at 22px, and three had none at all. All seven are on
`--tracking-tight` now, which is what `base.css` already gives the `h1`. That
also leaves `--tracking-hero` used in exactly the two places `--text-hero` is —
the About title and the project name. Every title in the app now measures
identically for its step: 22/700/-0.01em, or 28/700/-0.02em for the two names.

**`--text-*` meant two things.** Nine sizes and two colors shared the prefix,
which the scale made worse rather than caused: before it there were two
`--text-*` tokens and both were colors. The colors carry a `-color` suffix now —
`--text-primary-color`, `--text-secondary-color`, 426 occurrences — so
`var(--text-label)` is a size and `var(--text-secondary-color)` is a color, and
you can tell which without looking either one up. A guard keeps the halves from
leaking back: sizing text with a `-color` token, or coloring it with a step,
fails the build.

**A process note worth recording.** Reverting one of those deliberate
regressions with `git checkout <file>` restored the file from HEAD and silently
discarded the whole session's work on `clone.css`. It was caught by re-running
the literal sweep and re-applied. Use a copy, not the index, to undo a test
injection in a tree with uncommitted work.

**The diff's row-height seed.** `FALLBACK_LINE_HEIGHT` in `DiffResultView.tsx`
seeds the virtualizer's estimate with `.diff-code`'s line box until
`readMetrics` reads the real one off the element. It said `20`, documented as
"matching the CSS's `font: 12.5px/1.6`" — and the diff has not been 12.5px for
some time. It went 12.5 → 13 → 12 while the constant and the comment explaining
it both stayed put, so the number was wrong across two scale changes and the
comment was wrong for longer.

Fixed as `12 * 1.6` rather than `19.2`: the answer is what rots, the arithmetic
shows where it comes from. And since a constant restating CSS is exactly the
shape this task spent its life removing, the stacks guard now also reads the two
factors out of the source and compares them against `--text-label` and
`--leading-code`, and asserts `.diff-code` still reads those two tokens. Checked
against a deliberate regression in both directions — moving the seed, and moving
the token — each caught and reverted.

The file's neighbouring constant already knew this lesson:
`FALLBACK_MARKER_ROW_HEIGHT` carries a long comment about a restated CSS fact
leaving the estimate 7.25px short, and it is replaced at runtime by the first
marker that renders. The line height is measured the same way; only its seed was
ever a literal.

**Follow-ups, deliberately not taken here:** the `letter-spacing: 0` on the
tooltip stays a literal — it is a reset, not a step, and the guard allows it.

# Validation

Measured in the browser against the real stylesheets and the real markup, not
reasoned about. Before → after:

| Surface | Before | After |
| --- | --- | --- |
| History row title / meta | 12.5 / 10.5px, 680 / 400 | 13 / 11px, 650 / 400 |
| Overview row title / meta (same row) | 13.5 / 11.5px, 650 / 400 | 13 / 11px, 650 / 400 |
| Timeline row height | 80px (78.75 needed) | 82px (80.0 needed) |
| History detail `h2` / card `h3` | 15.5 / 12.5px | 17 / 13px |
| Reference badge | 17px box, .9em → 10.35px | 17px box, `micro` 10px |
| Rail / switcher avatar initials | 9 / 9.5px | 10px, boxes 20 and 22, no clip |
| Notification badge | 9px | 10px in an 11.8px content box, no clip |
| Primary button | 13.5px | 13px |
| Filter trigger (42px fixed) | — | 40px content, no clip |
| Diff code | 13px / 1.6 | 12px / `--leading-code` 1.6 |
| `.eyebrow` / caps section title | .08em / .04em | both `--tracking-caps` 0.06em |
| History diff totals | `--status-*`, proportional figures | `--diff-*`, tabular figures |
| About title (`--text-hero`) | 28px / browser bold, no tracking | 28px / 700 / `--tracking-hero` |
| The seven dialog titles | 22px / 650, tracking 3 ways | 22px / 700 / `--tracking-tight` |

Every fixed-height container that could grow was measured rather than argued
about: the pinned timeline row, the clamped two-line title, the filter trigger,
the file rows, the tabs, the chips, the metric cards, the area list, the search
boxes, and all four badges and avatars. No clipping.

Guards checked against deliberate regressions, each caught and reverted:

- `min-height: 40px` on a Sync action (inherited from 106).
- `font: 12px/1.5` in `clone.css` — caught by the shorthand guard.
- `line-height: 1.45` in `publish.css` — caught by the leading guard.

Commands run:

- `pnpm vitest run src/architecture/styleComposition.test.ts` — 21 passed.
- `pnpm run test` — 73 test files, 687 tests passed.
- `pnpm run check:architecture` — passed over 345 modules.
- `pnpm run typecheck` — clean.
- `pnpm run check:docs` — passed over 175 Markdown files and 140 task ids.
- `pnpm run check:frontend` — architecture, typecheck, tests and build clean.

`pnpm run check:rust` was not run: no Rust source was touched.
