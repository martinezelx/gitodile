---
id: 102
title: Refine the crocodile mark and its small-size variants
status: done
priority: normal
type: design
areas:
  - frontend
  - desktop
  - branding
created: 2026-09-02
completed: 2026-09-26
---

# Superseded

Closed on 2026-09-26 without adopting a refinement of this mark. The user
replaced the mark with a new full-colour sunglasses mascot in
[task 131](../0.4.0/131-mascot-app-icon.md), which carries the small-size
work this task was about (a head-only variant for 32px and below). The
unchecked criteria below were not met and no longer apply.

# Goal

Refine the existing GitOdile crocodile while retaining its identity. First
prepare a visual comparison for the user to review; implement the selected
direction in the application only after the user chooses it.

# User outcome

The crocodile remains recognizable and reassuring in the titlebar, About
dialog, and desktop icon, including small sizes where its smile currently
loses definition. The user can compare concrete artwork before selecting it.

# Context

The user requested an SVG review, then explicitly asked for this task and a
visual comparison of the current mark with a refined proposal. The current
request authorizes documentation and comparison assets, not replacement of
the production brand assets. In a follow-up, the user explicitly requested an
additional image-generated infographic with several improvement approaches.

The review combined independent visual and technical assessments, inspection
of the current SVGs and native PNGs at 32, 64, and 512 px, and browser inspection
of the light-theme titlebar and About dialog. Dark-theme colors were checked
in source. Native Windows/macOS/Linux rendering and user recognition studies
were not part of that review. The findings below are retained as the
self-contained record after the exploratory artifacts were discarded.

## What already works

- The long snout and compact silhouette connect the symbol to GitOdile.
- The toothless smile supports the product's calm, fear-free promise.
- The rounded geometry feels friendly; refinement should keep it credible
  for professional work.
- The dark silhouette on the fixed lime desktop tile has a balanced frame.
  Keep its scale, padding, and placement stable in the initial comparison.
- A monochrome path with transparent facial cutouts is adaptable to themes.
- The titlebar button has an accessible name and hides the decorative mark
  from screen readers. Preserve that behavior.

## Findings and priorities

### P2 — Small-size expression

The titlebar displays the mark at 24 × 13 CSS px inside a 30 × 30 px target;
About displays it at 44 × 23 px. The face uses a 110 × 58 viewBox. Geometric
measurements derived from the current SVG are:

| Use | Eye diameter | Nostril diameter | Horizontal smile opening |
| --- | ---: | ---: | ---: |
| Bare mark, 24 px wide | 1.99 px | 1.11 px | 0.63 px |
| Desktop icon, 16 px square | 0.92 px | 0.52 px | 0.29 px |
| Desktop icon, 32 px square | 1.84 px | 1.03 px | 0.58 px |

These are geometric projections, not measurements of rasterized pixel values.
At 16 px the desktop framing leaves the face about 11.1 px wide. Antialiasing
therefore carries much of the expression; proportional reduction alone is
insufficient. Prepare an optical small-size variant with a wider smile,
clearer eye separation, and simplified nostrils. Verify at actual display size
as well as enlarged; enlargement alone cannot establish legibility.

### P2 — Distinguish eyes from nostrils

All four protrusions repeat a rounded mound with a circular opening. The nose
can read as another pair of eyes. Lower the two nasal protrusions and integrate
the openings into the snout, keeping the two main eyes dominant. This is a
reviewer's perception to test in the comparison, not a user-study finding.

### P3 — Smile endings and jaw weight

Compare softer smile terminals with more room at the right edge. Try a modest
reduction of the lower jaw's visual weight while preserving the long snout and
calm expression. Treat the jaw change as a hypothesis, not a confirmed defect.
Avoid teeth, expressive eyebrows, extra Git symbols, shadows, or gradients in
the mark itself.

### P3 — One canonical source and reproducible exports

The application and desktop SVGs currently have identical path data, copied
into two files. The desktop source adds the lime tile and the transform
`translate(156 324) scale(6.47273)`. No dedicated synchronization script was
found. Derive each composition and native export from an explicit canonical
master/optical variant instead of maintaining duplicate geometry by hand.
The existing mask-URL test does not validate that the two drawings agree.

## Image-generated directions

The discarded exploration used the current desktop icon as a reference and
compared five raster concepts. These approaches are recorded as exploration
history, not as an approved direction:

- **A — Claridad óptica:** larger eye openings, a thicker smile, and simplified
  nostrils for 16–32 px.
- **B — Nariz integrada:** lower, flatter nose bumps so the primary eyes carry
  the expression.
- **C — Geometría suave:** a lighter jaw, softer terminals, and calmer curves.
- **D — Símbolo Git:** subtle branch/fork logic integrated into the smile's
  negative space. This is intentionally the most literal and highest-risk
  direction because it can add clutter at small sizes.
- **E — Sello profesional:** calmer eyes and more controlled proportions for a
  mature desktop-product presence.

The user was not convinced by the result and requested deletion of all
comparison assets, retaining only this active task. No direction was selected.
Future proposals need a fresh visual exploration and native-size validation.

## Existing colors and technical evidence

- Desktop tile: `#8bc53f`; face: `#14170f`.
- Current bare in-app mark: `--accent-primary`, `#4f751e` in light mode and
  `#9bd65a` in dark mode, as verified in CSS and the light browser render.
- `currentColor` plus CSS masking preserves transparent cutouts.
- ICO representations are 16, 24, 32, 48, 64, and 256 px; PNG and ICNS assets
  also exist. A future export pass must preserve the required native formats.
- The deterministic design scan returned `[]`, exit 0. It does not evaluate
  facial recognition or optical legibility.
- The earlier qualitative review scored applicable heuristics 12/16, with no
  P0/P1 findings. This is not a benchmark or a user-testing score.
- The older Brand and mascot paragraph in DESIGN.md describes a historical
  lockup color treatment; the Icons section and current CSS describe the bare
  titlebar/About rendering. Use current rendering for this comparison, and
  reconcile that documentation when a production treatment is selected.

# Scope

## Phase 1 — Revisit the visual direction (future work)

- Capture the evidence, trade-offs, and proposed changes in this task.
- Draw an editable refined SVG master and a related optical small variant.
- Keep an exact copy of the current artwork for a stable comparison.
- Provide a local, self-contained comparison showing both desktop compositions
  and bare silhouettes, actual icon sizes of 16, 24, 32, 48, 64, and 128 px,
  and the current titlebar/About dimensions on light and dark surfaces.
- Label which proposal variant appears at each size. Keep the desktop frame
  and palette identical so the drawing changes can be judged fairly.
- Include an exportable visual preview and explain the proposed adjustments.
- Include the user-requested image-generated infographic with five materially
  different improvement approaches and an actual-size strip.
- Keep proposed assets under `work/assets/102-brand-mark/`; production assets
  and application styles remain unchanged in this phase.

## Phase 2 — Adopt the selected direction (after user selection)

- Confirm the chosen geometry, optical thresholds, and any final adjustments.
- Establish one reproducible source for the approved mark variants and their
  desktop compositions; avoid unnecessary dependencies.
- Integrate the correct variant into the existing mask-based rendering.
- Regenerate PNG/ICO/ICNS and the required Windows icon assets, accounting for
  optical sizes rather than blindly reducing one raster master.
- Preserve semantic color tokens, accessibility, reduced-motion behavior,
  button target size, and the established app layout.
- Update DESIGN.md with the selected source, variants, usage thresholds, and
  generation procedure. Link to durable guidance rather than copying it here.

# Out of scope

- Renaming, a new palette, wordmark, full mascot, or broader UI redesign.
- New Git operations, navigation, dependencies, or application features.
- Packaging/release changes or claiming native validation from browser renders.

# Acceptance criteria

## Phase 1

- [x] Review findings, existing strengths, evidence limits, and priorities are
      documented in this task.
- [ ] A new visual direction addresses the findings and satisfies the user.
- [ ] Editable master and optical variants are available for review.
- [ ] The new comparison covers desktop and bare-mark views, both themes,
      actual icon sizes from 16 to 128 px, and titlebar/About dimensions.
- [ ] The proposal is checked visually at actual size and with keyboard access
      for any interactive comparison controls.
- [ ] The required validation is recorded before adopting the proposal.

## Phase 2

- [ ] The user has selected the production direction.
- [ ] Sources and native assets are generated consistently and reproducibly.
- [ ] The application uses the approved mark at its correct optical sizes.
- [ ] Required native icon dimensions/transparency and real platform rendering
      are checked; unavailable platform checks are explicitly recorded.
- [ ] DESIGN.md reflects the approved treatment and removes stale guidance.
- [ ] The aggregate completion gate passes after production integration.

# Relevant files

- Original in-app SVG: `src/assets/gitodile-mark.svg` (removed by task 131; see Git history)
- Original desktop SVG: `src-tauri/icons/source.svg` (removed by task 131; see Git history)
- [Brand component](../../../src/app/branding.tsx)
- [Titlebar/About styles](../../../src/app/app-shell.css)
- [Mask primitive](../../../src/shared/ui/primitives.css)
- [Theme tokens](../../../src/styles/tokens.css)
- [Design direction](../../../DESIGN.md)
- [Product strategy](../../../docs/PRODUCT_STRATEGY.md)
- [Previous icon task](../0.1.0/008-replace-application-icon.md)

# Dependencies

Phase 1 has no dependency. Phase 2 depends on the user's choice from the
comparison. Its queue position does not authorize replacing the brand before
that choice.

# Decisions

- Refinement should preserve the existing identity and palette.
- A small-size variant may need optical corrections instead of proportional
  reduction alone; exact geometry and thresholds remain to be selected.
- SVG comparisons and image-generated explorations were tried, but neither
  established an approved direction. Do not treat their numerical changes as
  production requirements.
- The user requested that only this task be retained, committed, and pushed.
  All generated comparison files and the separate critique snapshot were
  deleted. The production icon remains unchanged.

# Implementation notes

The initial experiment produced a refined SVG master, a small optical variant,
interactive comparisons, previews, and an image-generated infographic. The
user was not convinced and asked to discard those artifacts. Their diagnostic
findings and the unapproved exploration approaches are preserved above.

This task remains active for future refinement. No production replacement is
approved or implemented.

# Validation

The earlier experiment passed the aggregate check (616 frontend tests and 319
Rust tests), but that result does not validate a future visual direction.
After removing the exploratory artifacts, `pnpm run check` passed: Markdown
links and task metadata, frontend architecture, TypeScript, 619 frontend
tests, the production build, Rust formatting and Clippy, and 319 Rust tests.
Only this Markdown task is retained for commit; production assets are unchanged.
