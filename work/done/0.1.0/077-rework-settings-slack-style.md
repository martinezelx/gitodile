---
id: 077
title: Rework Settings around a Slack-style preference layout
status: done
priority: normal
type: feature
areas:
  - frontend
  - desktop
  - testing
  - documentation
created: 2026-08-25
completed: 2026-08-26
parent:
queue:
---

# Goal

Rework the Settings dialog into a calmer, roomier preference workspace that
uses Slack's clear category rail and content hierarchy as a structural
reference while retaining GitOdile's Friendly Card surfaces, lime accent,
plain-language copy, and safety cues.

# User outcome

People can understand where a preference belongs and change settings without
the dialog feeling like a stack of unrelated cards. The selected category is
the single orientation cue, each category keeps the control that best fits its
choices, and the experience still feels like GitOdile rather than a Slack copy.

# Context

The current dialog already has the right interaction model: an eager overlay,
a keyboard-accessible section rail, one stable dialog size, persisted section
selection, guarded identity edits, and immediate preferences. Its presentation
is still closer to an internal settings form than the composed desktop
workspace shown in the supplied Slack references: the rail is narrow and every
group begins at the same visual weight.

The references contribute four useful principles:

- a generous fixed modal with one header spanning navigation and content;
- a quiet icon-and-label category rail with one strong active state;
- the selected rail label as the category anchor, without repeating it in the
  content pane;
- compact, legible controls with the content—not decoration—carrying focus.

GitOdile keeps opaque surfaces, moderate radii, semantic tokens, accessible
lime emphasis, descriptive control copy, and its existing safety behavior.

# Scope

- Increase the dialog's working width and give the category rail enough room
  for English and Spanish labels without crowding.
- Let the selected category label orient the content pane without a repeated
  heading or summary.
- Refine the rail, group hierarchy, cards, controls, spacing, and scrollbar
  treatment into one Slack-inspired but GitOdile-owned composition.
- Keep the existing tablist/tabpanel model, arrow-key navigation, focus entry,
  section persistence and Git-attention affordance.
- Remove the repeated per-category reset action; do not add a global reset
  until the product has a real recovery or troubleshooting need for it.
- Keep each category's established control style and use General's switch for
  Navigation's boolean visibility choices.
- Let people reorder project destinations by dragging a dedicated handle or by
  using Arrow/Home/End while it has keyboard focus; persist the full order even
  when a destination is hidden.
- Preserve all existing setting behavior and feature ownership.
- Adapt the composition for narrow desktop windows and coarse pointers without
  horizontal document scrolling.
- Add or update focused tests for the new content hierarchy and accessible
  relationship between section tabs and panels.
- Integrate the rail and content as one continuous surface without a vertical
  split; use crisp horizontal rules only between the header and subsections.
- Remove group-level cards where spacing and typography can express the same
  hierarchy; keep bounded controls only where the option itself needs a shape.

# Out of scope

- Adding settings search; six categories do not justify it.
- Adding, removing, or regrouping preferences.
- Copying Slack colors, typography, assets, or brand language.
- Changing preference persistence, Git tooling behavior, or Tauri commands.
- Making Settings a navigable full-screen application screen.
- Introducing a lazy boundary around the eager Settings overlay.

# Acceptance criteria

- [x] At normal desktop sizes Settings renders as a stable, roomy two-column
      workspace with a clearly separated category rail and content pane.
- [x] The selected rail label is the category's only title; the content does
      not repeat it or add a category summary.
- [x] The active rail item is identifiable by fill, accent, and ARIA state in
      light and dark themes; Git attention remains visible without relying on
      color alone.
- [x] Existing preference behavior, identity close guard, and Git/line-ending
      loading and error states remain unchanged; repeated section resets are
      removed.
- [x] Theme, language, reading, typography, navigation appearance, and line
      endings retain their established control styles; Navigation visibility
      uses the same switch as General without changing its semantics.
- [x] Navigation destinations can be reordered by pointer drag, explicit arrow
      buttons, or keyboard;
      the order is validated, persisted, and applied to the application rail.
- [x] The tablist remains one keyboard stop with arrow/Home/End movement, and
      each tab points to the active tabpanel.
- [x] At and below the narrow-window breakpoint the categories remain reachable
      without horizontal document scrolling and controls do not become cramped.
- [x] Pointer-coarse controls keep comfortable targets and reduced motion is
      respected.
- [x] Focused frontend tests and the full `pnpm run check` pass.
- [x] The rendered dialog is reviewed once in light/dark desktop layouts and
      once at a narrow supported width, with findings recorded below.

# Relevant files

- `src/app/AppOverlays.tsx`
- `src/app/app-shell.css`
- `src/features/settings/SettingsPanel.tsx`
- `src/features/settings/settings.css`
- `src/features/settings/translations.ts`
- `src/features/settings/SettingsPanel.test.tsx`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`

# Dependencies

Builds on task 057's stable dialog and section model, task 069's eager/read
behavior, and task 071's Slack-inspired application rail. The direct user
request authorizes implementing this isolated visual task ahead of the existing
release queue; its queue id remains contiguous so the repository metadata stays
valid while it is active.

# Decisions

- **Borrow structure, not skin.** Slack's wide rail/content relationship and
  category hierarchy solve the information-hierarchy problem. GitOdile's opaque
  Friendly Card materials, warm neutral palette, lime focus, and moderate
  radii remain the visual authority.
- **Keep the dialog, not a full-screen route.** Settings is an app-level
  overlay reached from the rail, command palette, and shortcut. Turning it into
  a screen would change navigation and lifecycle behavior beyond this request.
- **Keep all six categories.** The current grouping is behaviorally coherent
  and already connected to command-palette deep links. This task improves its
  presentation rather than reopening information architecture.
- **Do not repeat the selected category.** The highlighted rail label already
  names the active tabpanel. Removing the category intro saves space and lets
  the first meaningful setting become the content origin.
- **Integrate the surfaces literally.** Follow-up review clarified that Slack's
  polish comes from one uninterrupted background split by crisp rules, not two
  differently colored panels. The rail and content therefore share one surface
  without a vertical rule; the header and subsection separators use crisp
  horizontal rules without fading gradients.
- **Group by rhythm and rules, not cards.** Section headings, deliberate
  vertical rhythm, and horizontal dividers own grouping. A group body no longer
  gets a background, border, or radius by default. Controls such as a segmented
  selector, font specimen, line ending choice, text field, or warning may still
  draw their own honest boundary because that shape is the affordance itself.
- **Preserve useful control personality.** Theme, language, tab width, font
  specimens, navigation appearance, and line endings solve different choices
  and keep their established treatments. Navigation visibility uses the same
  switch as General because both are independent boolean preferences.
- **Separate order from visibility.** `destinationOrderIds` stores every known
  destination, while `visibleDestinationIds` stores membership. Hiding an item
  therefore does not forget where it belongs. Unknown ids are discarded and
  newly registered destinations append safely during stored-state validation.
- **Make dragging optional.** A dedicated grip uses captured Pointer Events so
  dragging behaves consistently in the desktop WebView. Adjacent up/down
  buttons sit beside the grip so every ordering action has one clear origin;
  Arrow Up/Down and Home/End on the
  focused handle perform the equivalent move. Every method announces the new
  position to assistive technology.
- **Make selection visible without changing the control family.** Theme,
  language, and tab-width cards keep their compact segmented shape and clean,
  borderless options. Selection across the rail, segmented choices, navigation
  appearance, font specimens, and line endings uses a stable neutral surface;
  green remains a precise cue for icons, recommendations, switches, and
  keyboard focus rather than filling every chosen value.
- **Quiet secondary controls and global alerts.** Navigation arrows remain
  visible but recede until their row is hovered or contains focus, with full
  visibility retained for coarse pointers. The Git alert rests as unboxed text
  outside its section and regains its warning pill when Git is selected.
- **Remove copy that does not change a decision.** The dialog title stands
  alone, and subsection descriptions in English and Spanish state one useful
  fact each. Consequences remain explicit for identity, discards, and line
  endings, while repeated explanations and implementation detail are removed.
- **Remove section resets.** Slack exposes reset mainly as troubleshooting,
  VS Code attaches it to an individual changed setting, and Chrome isolates a
  global reset with consequence disclosure. GitOdile's small preference set
  does not justify a repeated footer action; a future global recovery action
  belongs in diagnostics if a concrete need appears.

# Implementation notes

Follow-up requested after the first rendered review: the initial pass retained
too much of GitOdile's card grammar, which left a nested-card composition and
made the rail/content split feel assembled rather than integrated. The final
implementation and measurements below supersede the first-pass surface notes.

`SettingsPanel` renders the active groups immediately after the rail. Group
headings are `h3` under the dialog's `h2`; no category heading or summary is
duplicated in the pane. Every rail tab points to the same dynamic tabpanel,
whose accessible name comes from the selected tab.

The dialog grew from 880×640 to a viewport-capped 1000×680 workspace. Its
category rail is 208px and the reading width is capped at 720px. The header,
rail, and content now share `--surface-raised`; one full-width bottom border
separates the header while rail and content meet without a rule. The old fading
gradient pseudo-elements are gone. Group bodies are transparent and
borderless. Crisp horizontal rules separate subsections, while the rail and
content meet without a vertical rule. Rail selection combines the semantic active fill,
accented icon, stronger label, and a subtle inset edge. Git attention uses a
Lucide alert glyph plus an accessible label rather than a color-only dot.

At 800px and below the rail becomes a self-contained horizontal category strip
with hidden scrollbar chrome and no document overflow. A first visual pass
found that the shared mobile segmented-control rule stacked short theme and
language choices into tall empty cards; Settings now keeps those choices in a
wrapping row at this breakpoint. Identity fields, font cards, navigation
previews, confirmation prompts, and setting rows retain their existing narrow
stacking behavior.

No preference state, persistence, feature boundary, Tauri command, eager
overlay behavior, or close guard changed.

# Validation

`pnpm exec vitest run src/features/settings/SettingsPanel.test.tsx
--reporter=verbose` passed: 25 tests. The section-rail tests pin the absence of
a repeated category heading and summary, the tab-to-panel controls, and the
group heading hierarchy, plus pointer and keyboard reordering.

`pnpm run check` passed: documentation over 130 Markdown files and 97 task ids,
frontend architecture over 289 modules, TypeScript, 433 frontend tests in 53
files, the production build, Rust formatting and Clippy, and 306 Rust tests.

The running Vite app was reviewed in the in-app browser at 1280×840 in dark
and light themes and at 760×700 in Spanish. At desktop size the modal remained
1000×680, the rail and content kept stable origins, and the active/Git attention
states remained distinct in both themes. The final computed review reported no
rail right border and a solid `0.8px` subsection top border. Navigation uses the
same switch component as General, and its grip exposes both drag and keyboard
reordering. The category intro and reset footer remain absent; every other
option family renders with its original treatment.
The final follow-ups grouped the explicit order arrows beside the drag grip,
then unified every selected setting around neutral surfaces after an
independent UI critique found that green was carrying too many roles.
Bounded reviews confirmed the softer selection hierarchy in light Interface
and dark Navigation, the quieter resting arrows, and the reduced Git alert.
At 760px the dialog measured 734px for both `clientWidth` and `scrollWidth`; the
document measured 760px for both, so neither introduced horizontal overflow.
All six Spanish categories fit in the horizontal strip and the default browser
viewport was restored after review.

The UI layout detector returned no findings before or after the change.
