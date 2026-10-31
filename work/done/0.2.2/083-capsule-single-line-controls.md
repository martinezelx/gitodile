---
id: 083
title: Make every single-line control a capsule
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design-system
created: 2026-08-28
completed: 2026-08-28
parent:
queue: "18"
---

# Goal

Finish the shape vocabulary by making every single-line control fully rounded —
a capsule where it carries a label, a circle where its box is square — so a
button, a search field and an icon button read as one family instead of three
degrees of roundness.

# User outcome

Controls stop looking like three different design eras sharing a toolbar. The
Save version button, the branch selector and the circular refresh beside
it are now the same shape at different aspect ratios, so the eye groups them by
what they are rather than by how round they happen to be, and hierarchy is
carried by fill and colour where it belongs.

# Context

Prompted by a review of YouTube's watch page, which uses exactly three shapes:
a capsule for labelled buttons *and* for the search field, a circle for
icon-only buttons, and a modest rounded rectangle for containers. Our circles
and containers already matched; only the labelled controls sat halfway, at
`--radius-control: 14px`.

Checking whether the change was even possible surfaced the real defect:
`--radius-control` had become the catch-all that `--radius-md` used to be
before task 081, one level down. Its 22 usages were four unrelated roles —
labelled buttons, single-line fields, multi-line textareas, and three things
that are not controls at all. The A/B built to preview the change demonstrated
this by accident: overriding the token turned the textarea into a capsule too.

# User's decision

Presented with the A/B, the user accepted the capsule everywhere it appeared
except the segmented control ("lado a lado / unificado"), which keeps its
current frame. That exclusion turns out to be load-bearing, not a matter of
taste: a capsule frame forces its options to become capsules as well, since a
pill's radius is half its height and concentricity would otherwise pinch the
corners. Keeping the frame rectangular keeps the options as rows.

# Scope

- Move labelled buttons, single-line fields, and selectors/triggers to
  `--radius-pill`.
- Leave everything that cannot be a capsule on `--radius-control`, and redefine
  that token by what it now actually holds.
- Raise inline padding on every capsule so the label does not sit inside the
  curve.
- Record the rule and its two consequences in DESIGN.md.

# Out of scope

- The segmented control, by the user's explicit decision.
- Any change to circles, glyph tiles, containers or the `--radius-item` tier.
- Changing heights, colours or elevation.

# Acceptance criteria

- [x] Every labelled button, single-line input, search box, select, selector
      and trigger uses `--radius-pill`.
- [x] Textareas, the segmented-control frame, the two preview boxes and the
      rail-item wrapper stay on `--radius-control`.
- [x] The segmented control and its options are visually unchanged.
- [x] Every capsule's inline padding is between 0.7 and 1.0 of its own radius,
      the band YouTube sits in at 0.89.
- [x] `--radius-control` is documented by what it now holds, not by the role it
      used to have.
- [x] DESIGN.md states why textareas, option frames and previews are excluded.
- [x] All three radius guards still pass, and the concentric chain is intact.
- [x] Frontend and full project checks pass.

# Relevant files

- `src/shared/ui/primitives.css`
- `src/app/app-shell.css`
- `src/features/changes/changes.css`
- `src/features/history/history.css`
- `src/features/overview/overview.css`
- `src/features/settings/settings.css`
- `src/features/branches/branches.css`
- `DESIGN.md`

# Dependencies

Follows task 081, whose role tokens made this a 16-line change instead of a
hunt through every stylesheet. Numbered 083 because task 082 landed on `main`
from another line of work while this was in progress; that commit's new
`.history-ref-badge` already uses `--radius-pill` and carries its own
forced-colors fallback, so 081's rules held for code written against them
without being told.

# Decisions

- **Fully rounded means capsule or circle depending on aspect**, not two
  separate ideas. That is what lets a labelled button and an icon button read
  as one family, and it is why no new token was needed — `--radius-pill` and
  `--radius-round` already existed.
- **`--radius-control` was kept, not renamed**, and redefined as "a control
  that cannot be a capsule". Five of the six things left on it are still
  controls, the chain (`item + 4 = control`, `control + 4 = surface`) still
  holds, and renaming would have churned 22 call sites to fix a word.
- **Capsules nest concentrically for free.** Radius is half the height, so
  `outer = inner + padding` holds at any size without computing anything. The
  Changes action cluster is now a capsule wrapping two circles and a capsule,
  and every radius in it is half its own height.
- **Inline padding targets ~0.4 of the control's height**, which is YouTube's
  ratio (16px on a 36px pill). Below that the label sits inside the curve.
  Spacing tokens were used rather than new literals: `--space-4` for controls
  of 34px and up, `--space-3` below that.

# Implementation notes

- 16 selectors moved to `--radius-pill`; 6 stayed. The migration script listed
  both sets rather than only what it changed, so the exclusions were reviewed
  as deliberately as the inclusions.
- Padding was raised on 16 rules. Measured afterwards in the running app: every
  capsule lands between 0.74 and 0.94 of padding over radius, bracketing
  YouTube's 0.89.
- The search boxes turned out to be flex wrappers with a leading icon and a
  `gap`, not absolutely positioned icons, so the padding change moves the icon
  inward without breaking anything.
- `.changes-header-actions`'s comment was rewritten: it claimed labelled
  controls keep the rectangular scale, which this task reverses.
- DESIGN.md's role table, its "Visual character" summary, and two stale
  descriptions of the rail as a "square" were corrected in the same pass.

# Follow-ups

- Still not seen in the real Tauri window with a project open. This task was
  verified by measuring the live cascade, as 080 and 081 were.
- The A/B pages built for 081 and this task both had their dark half broken:
  `--radius-*` live only in `:root`, which the page rescoped to the light
  class, so the dark panel resolved them to 0. Fixed in the second page. If
  another comparison page is built, emit the light block into the dark scope
  as well.

# Validation

Passed on 2026-08-28:

```text
pnpm run check
  documentation: 136 Markdown files, 103 task ids
  frontend architecture: 291 modules
  frontend: 53 files, 444 tests; production build passed
  Rust: fmt and Clippy passed; 306 tests passed
```

Capsule geometry measured in the running app rather than asserted: padding over
radius came out 0.74–0.94 across every migrated control, and the segmented
control's options stayed at radius 10 as intended.
