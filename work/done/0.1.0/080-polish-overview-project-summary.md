---
id: 080
title: Polish the Overview project summary and unify control geometry
status: done
priority: normal
type: improvement
areas:
  - frontend
  - overview
  - changes
  - accessibility
created: 2026-08-27
completed: 2026-08-27
parent:
queue: "18"
---

# Goal

Turn the Overview project identity and its branch-level shortcuts into one
coherent summary surface, then carry the resulting control geometry, card
treatment, and icon shape language across the screens that share those
controls, so switching a branch, reviewing changes, saving a version,
and refreshing all read as one family.

# User outcome

The active project's name, path, current branch, and common actions are
easy to find at a glance. Action clusters on Overview and Changes look like the
same set of controls rather than two dialects. Cards rely on fill and elevation
instead of hairlines, so the eye is only interrupted where something actually
needs attention. Changes and History end at their own panel edge instead of a
permanent empty strip.

# Context

The project name and path previously floated above the Overview cards while
the content below used the established Friendly Card surfaces. The first pass
moved that identity and the branch/create/refresh controls into a dedicated
summary component. This follow-up records the work, brings the controls to the
same visual quality bar as the surrounding cards, and then applies the same
rules where the same controls appear elsewhere.

The selector and create action are owned by the branches feature, the
screen refresh reuses the shared `RefreshIconButton`, and the Changes header
owns its own review actions. Overview and Changes must only adapt those
controls inside their own containers and must not change their behavior or
create a second repository read path.

Two secondary threads were folded in because they are the same visual
decision seen from another screen:

- **Icon shape language.** Icon-only controls and identity glyphs move to a
  circle, while anything that holds a text label keeps the rounded-rectangle
  radius scale. This is the shape rule the rail, the project switcher, and the
  Overview action row now share.
- **Fixed-workbench scrolling.** The status-bar fade exists so a scrolling
  document dissolves into the window edge. Changes and History are fixed
  workbenches whose panes own their own scrolling, so the fade sits over a
  panel edge and makes the surface look unfinished rather than continued.

# Scope

- Keep the project name, canonical path, optional selected nested path, current
  branch selector, create-branch action, and Overview refresh in a
  dedicated summary component on one opaque Friendly Card surface.
- Give the selector, create action, and refresh action matching height, surface,
  border, icon scale, and interaction states inside Overview.
- Apply the same compact geometry and control rhythm to Review changes and Save
  version while preserving their secondary/primary hierarchy.
- Gather the Changes header freshness note and its three review controls into
  one raised action cluster with the same 38px control geometry.
- Remove the neutral outline from top-level cards and banners so surfaces rely
  on opaque fills and elevation. Retain a status-colored outline only for
  warning and error states, drawn inward so it cannot change layout.
- Adopt the circular shape for icon-only controls and identity glyphs: rail
  destinations, the rail project avatar, the compact project switcher, and the
  Overview create and refresh actions.
- Opt Changes and History out of the status-bar fade and give them a compact
  bottom gap instead of the document-scroll inset.
- Collapse the workspace right inset to a single token value instead of a
  breakpoint override.
- Preserve keyboard order, focus visibility, busy/disabled states, coarse
  pointer targets, light/dark themes, and the narrow layout.

# Out of scope

- Changing branch, refresh, repository-loading, or discard behavior.
- Redesigning the main status, Team changes, Recent history, or pending
  versions sections.
- Changing product vocabulary or adding another Overview or Changes action.
- Creating a new shared button abstraction for these local compositions.
- Changing the shared primitives or the full Branches screen layout.

# Acceptance criteria

- [x] Project identity and the three actions render inside one opaque Friendly
      Card surface using established tokens.
- [x] The branch selector, create action, and refresh action share a 38px
      visual height and coherent default, hover, expanded, focus, busy, and
      disabled treatments.
- [x] The selector remains visually primary within the group without making
      create or refresh look unavailable.
- [x] Review changes and Save version share the summary controls' compact
      geometry while remaining visibly secondary and primary respectively.
- [x] The Changes header actions render as one raised cluster whose controls
      share the Overview geometry, exposed as a labeled group.
- [x] Project summary, unsaved changes, Team changes, Recent history, the
      Changes notice, the History banner, and the Branches banner have no
      neutral card border; warning and error states still expose a visible
      semantic outline without changing layout.
- [x] Icon-only controls and identity glyphs are circular; every control that
      carries a text label keeps the rounded-rectangle radius scale.
- [x] Changes and History show no status-bar fade and end with one compact gap.
- [x] Long project paths and branch names do not overflow the card.
- [x] At narrow widths the identity and actions reflow in DOM order, and coarse
      pointers receive at least 44px targets.
- [x] The UI mechanical scan and frontend/full project checks pass.
- [x] Every card that lost its neutral border declares a forced-colors
      fallback outline, in `overview.css` as well as `changes.css`,
      `history.css`, and `branches.css`.
- [x] A control sitting on a raised card has a perceptible boundary of its own
      in both themes, and the glyph identifying it clears 3:1.
- [x] Icon-only controls are circular on Changes as well as Overview, and the
      cluster containing them stays concentric with them.

# Relevant files

- `src/app/App.tsx`
- `src/app/app-shell.css`
- `src/features/overview/OverviewPanel.tsx`
- `src/features/overview/overview.css`
- `src/features/changes/ChangesPanel.tsx`
- `src/features/changes/ChangesPanel.test.tsx`
- `src/features/changes/changes.css`
- `src/features/history/history.css`
- `src/features/branches/branches.css`
- `src/styles/tokens.css`
- `DESIGN.md`

# Dependencies

Builds on task 075's single coordinated Overview refresh, task 079's rail
chrome, and the existing shared branch snapshot.

# Decisions

- The three Overview controls form one action row through equal geometry and
  proximity, not through a nested card or decorative container.
- The branch selector retains its text and chevron because it communicates
  both current state and switching behavior. Create and refresh stay icon-only
  because their localized tooltips and accessible names already provide the
  label without crowding a desktop summary.
- Shape carries role, not decoration: a circle means an atomic thing with no
  reading direction, an identity glyph or a single-glyph action, while a
  rounded rectangle means a container of text whose radius scales with its box.
  Mixing the two in one row is intentional and is what keeps the labelled
  selector visually primary next to its two satellites.
- The Changes cluster became a pill rather than keeping an 18px card radius.
  Once its corner children are 38px circles, concentricity (outer = inner +
  padding) puts the container at 19 + 8 = 27, which is exactly half the 54px
  the row measures. `999px` keeps that true when coarse pointers grow the
  controls to 44px. Save stays a rectangle: it carries a label and never sits
  at a corner.
- Only the labelled action takes free width in the narrow layout. Letting the
  icon buttons stretch would turn a 50% radius into an ellipse.
- Cards state their edges with fill and elevation. A neutral hairline on an
  opaque raised surface adds a second, weaker edge saying the same thing, so
  only semantic outlines survive, drawn inward so a warning never nudges
  layout.
- Overview and Changes use scoped overrides for feature-owned controls; shared
  primitives and the full Branches screen remain unchanged.

# Implementation notes

- Added `ProjectSummaryCard` to keep the project identity, nested-selection
  context, branch shortcuts, unpublished count, and coordinated refresh
  in one semantic section.
- Replaced the uncontained Overview header with the established opaque raised
  surface, 18px card radius, 24px padding, and resting card shadow.
- Scoped the control polish to `.project-summary-card`: the selector, create
  action, and refresh action now share 38px geometry, panel fill, subtle border,
  8px rhythm, and coherent hover/active states. The current branch glyph uses
  the semantic accent; expanded state retains the existing accent treatment.
- Dropped the middot separator between the selector and the unpublished count;
  the count is now the only trailing element, so the separator had nothing left
  to separate.
- Extracted `ChangesHeaderActions` from the Changes header and gave it a raised
  pill cluster with `role="group"`. The freshness note now lives inside that
  cluster rather than beside it, with its own `--space-3` inset from the pill's
  curve since a button of the same height is already inset by its own round
  edge. The existing review-controls test asserts the three controls resolve
  within the group.
- Added `--surface-control` and `--border-control` to all four theme blocks.
  A control on a raised card cannot use `--surface-panel`: in light, panel and
  raised are both `#ffffff`, so the control had no fill of its own and its
  whole edge rested on `--border-subtle` at 1.26:1. The new pair gives a fill
  step of ~1.12:1 plus a border of ~1.4:1 in either theme. They deliberately
  stop short of the 3:1 WCAG 1.4.11 asks of a component boundary — at 3:1
  against white the border is a mid grey that reads as a heavy outline, and
  1.4.11 does not require it where the component is identifiable by other
  means. Here that is the glyph, measured in the running app at 4.79:1 light
  and 6.79:1 dark.
- `overview.css` gained the forced-colors fallback the other three feature
  stylesheets already had, covering `.project-summary-card`, `.project-hero`,
  and `.overview-history`.
- Recorded the shape rule in DESIGN.md under a new "Shape" section, together
  with the three constraints that keep the mix honest: concentricity, a square
  box for any circle, and the half-height point where a card becomes a pill.
- Removed neutral borders from `.project-hero`, `.changes-notice`,
  `.history-banner`, and `.branches-banner`; warning and error states use
  an inward semantic outline. `changes.css`, `history.css`, and
  `branches.css` gained forced-colors fallbacks.
- Circular shape applied to `.rail-item__icon`, `.sidebar-project`,
  `.sidebar-project__avatar`, `.project-switcher-compact__trigger` and its
  avatar, and the Overview create and refresh actions.
- Added `app-shell--internal-scroll` for Changes and History, which suppresses
  the status-bar fade, plus `.workspace--changes` and `.workspace--history`
  bottom padding of one compact step. DESIGN.md records why fixed workbenches
  opt out.
- `--workspace-inset-right` now resolves to `var(--space-5)` at every width, so
  the 1100px override could go.
- Coarse-pointer overrides raise the summary controls and the hero actions to
  44px. The existing 800px layout keeps identity before actions and allows the
  selector to shrink while the icon controls remain fixed.

# Follow-ups

- Re-inspect the Changes header in the real Tauri window. The Overview pass was
  verified there; the Changes cluster, its pill radius, and the narrow-width
  reflow have only been verified from the cascade and the token arithmetic.
- The rail now uses a circle for both the destination icon and the project
  avatar, so shape no longer separates "where you go" from "what you are
  looking at" in that column. Worth a deliberate look before it sets.

# Validation

Passed on 2026-08-27:

```text
Historical UI scan                                  passed (0 findings)

pnpm run check
  documentation: 133 Markdown files, 100 task ids
  frontend architecture: 290 modules
  frontend: 53 files, 439 tests; production build passed
  Rust: fmt and Clippy passed; 306 tests passed
```

Re-run after the Changes, shell, token, and DESIGN.md work was folded in:

```text
pnpm run check:frontend
  frontend architecture: 290 modules
  frontend: 53 files, 439 tests passed; production build passed
```

The circular icon buttons and the pill cluster resolve by source order, not by
specificity: `src/styles.css` imports `shared/ui/primitives.css` before both
feature stylesheets, so the feature rules win the equal-specificity tie against
`.secondary-button`'s `--radius-md`.

Not re-run since these edits: the UI scan (it was only ever scoped to
the Overview files) and the Rust half of `pnpm run check`, which none of this
touches. The Changes header has not been re-inspected in the real Tauri window
— see Follow-ups.
