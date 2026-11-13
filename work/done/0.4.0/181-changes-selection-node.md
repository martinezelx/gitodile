---
id: 181
title: Give the Changes include control History's node
status: done
priority: normal
type: feature
areas:
  - frontend
  - ux
created: 2026-10-18
completed: 2026-10-18
parent:
queue:
---

# Goal

The Changes file list's include control reads as History's timeline node: a
10 px disc filled in the primary ink when a file is included, an empty ring when
it is left out, and a half-filled disc when only part of a folder goes in. The
node of the file that is open is the only one in the accent.

# User outcome

The Changes list stops looking like a form with a column of green ticks. It
speaks the same visual language as History and Overview, gives the file name
4 px more room, and keeps the green accent for the one row the reader is
looking at.

# Context

The current control is the shared `.app-checkbox` at 14 px with a green ring and
a tick, scoped by `.changes-file-list` in `changes.css`. The design review in
`changes-selection-options.html` (a retired review prototype)
compared eight options; **B, the History node**, was the recommendation:

- filled = included, ring = left out, half moon = partial;
- the accent belongs to the open row, not to every included file;
- the leading column goes from 22 px to 18 px.

History already uses exactly these three node states (published / local-only /
unknown), and Overview uses the same family at 12 px. The History filter panel
and the rest of the app keep the shared `.app-checkbox`; this change is scoped
to the Changes file list.

# Scope

- Replace the file-row, folder-row and select-all include control with an 18 px
  label holding a 10 px node. The native input stays, visually hidden, so
  `checked`, `indeterminate`, labels, keyboard focus and disabled behavior are
  unchanged. The label is the hit target and extends over the row padding.
- Node states: checked = primary ink fill and border; unchecked = 1.5 px ring in
  the secondary mix; indeterminate = half primary ink / half transparent.
- Add `changes-file-row--active` to the open file's row; its node uses the
  accent (solid, half or ring) and a soft accent halo. Hover rings any enabled
  node in the accent; focus draws the app's focus ring; disabled nodes are
  muted; forced-colors gets a Canvas/Highlight fallback.
- Remove the old 14 px tick rules and the now-unused `--file-check-mask`; drop
  the row gap that made the old 22 px leading column, and adjust the loading
  placeholders to the 18 px column. Keep row height unchanged.
- Add a test that the open file's row carries the active class and that the
  checkbox is paired with its node.
- Update `DESIGN.md` (the Changes list uses the node; `.app-checkbox` stays for
  option rows) and the next-ID note in `work/README.md`.

# Out of scope

- Changing the shared `.app-checkbox` or the History filter panel.
- Changing selection, save-plan, folder or truncation behavior.
- Moving the control to the trailing edge, changing row height, or adding the
  other seven reviewed variants.
- Touching the design-review HTML beyond linking it from this task.

# Acceptance criteria

- [x] File rows, folder rows and the select-all render the 10 px node, with
      checked, unchecked and indeterminate states matching B in light and dark.
- [x] The open file's row/node is the only node in the accent; its included
      state is solid accent, its partial state half accent, its excluded state
      an accent ring.
- [x] The leading column is 18 px (from 22 px), the file icon/name shifts 4 px
      left, and the row height is unchanged.
- [x] The control is still a native checkbox; `indeterminate` works for folders
      and the select-all; Space toggles it; focus is visible on the node; the hit
      area is at least 24 px wide and the row high.
- [x] Hover, focus, disabled, reduced-motion and forced-colors states are
      covered; the selected/excluded row combination still reads correctly.
- [x] Existing Changes tests pass and the new active-row/node test passes.
- [x] `pnpm run check` passes.
- [x] `DESIGN.md` and `work/README.md` are updated.

# Relevant files

- `src/features/changes/ChangesPanel.tsx`
- `src/features/changes/changes.css`
- `src/features/changes/ChangesPanel.test.tsx`
- `DESIGN.md`
- `work/README.md`
- `work/assets/changes-selection/changes-selection-options.html`

# Dependencies

None. The review asset is evidence for the chosen design, not a runtime
dependency.

# Decisions

- **B over the other seven.** It reuses the three states History already
  teaches and keeps the accent for the open row. C adds presence but no new
  meaning; G keeps a tick but breaks the round family; F saves the most width
  but is the least discoverable.
- **A label wrapper, not a larger input.** The visual node is 10 px, but the
  label is 18 px wide and the row high, and its `::after` reaches 6 px into the
  file item's padding. The hit target is 24 px wide without spending layout
  width.
- **Keep the control leading.** Moving it to the trailing edge would free the
  icon column but break the reading order and the select-all alignment.
- **No shared `.app-checkbox` change.** The History filter panel is a list of
  options, not a file inclusion control; it keeps the 18 px tick.

# Implementation notes

- `ChangesPanel.tsx`: added `InclusionNode`, the native checkbox hidden inside
  the 18 px label with the visible node. It owns the `indeterminate` layout
  effect; the old `selectAllRef` effect and the folder's inline ref are gone.
  File rows now carry `changes-file-row--active` when they are the open file, so
  the node can take the accent. Folders, the select-all and the disabled
  truncated select-all use the same control. The loading rows use an 18 px
  placeholder wrapper with a 10 px skeleton.
- `changes.css`: replaced the 14 px tick rules and `--file-check-mask` with the
  node: 10 px, 1.5 px ring in the secondary mix, primary-ink fill for included,
  half moon for indeterminate, accent only on the open row. The label's 6 px
  `::after` reach makes a 24 px target without layout width; the row gap that
  made the old 22 px column is zero. Hover, focus-visible, disabled,
  reduced-motion and forced-colors are handled. The tree rail is untouched and
  still lines up; the folder row remains 32 px high.
- `ChangesPanel.test.tsx`: one new test asserts the open file's row carries the
  active class, the input is the new visually hidden control, the node follows
  it, clicking the visible node toggles the checkbox (the label wraps the
  input), and the other row is not active.
- `DESIGN.md` describes the node in both the file-list section and the Changes
  screen narrative; `.app-checkbox` stays documented as the option checkbox.
  `work/README.md` advances the next unused ID to 182.
- No selection, save-plan, folder or truncation logic changed. The History
  filter panel keeps `.app-checkbox`.

# Validation

- `pnpm exec vitest run src/architecture/styleComposition.test.ts src/features/changes/ChangesPanel.test.tsx`
  -> 80 tests passed.
- Review pass before commit: the 36 px minimum height was scoped to the
  select-all so folder rows stay 32 px high; explicit forced-colors rules were
  added for the active checked/mixed node (the normal active selectors were
  more specific than the first fallback); the forbidden `cursor: pointer` was
  removed; the new test now clicks the visible node rather than only the hidden
  input; stale comments and the DESIGN.md wording were corrected.
- `pnpm run check` -> documentation check over 316 Markdown files and 231 task
  ids; frontend architecture and typecheck; 144 test files / 1550 tests; Vite
  production build; Rust 604 unit tests + 1 credential-helper test; all passed.
  It included the final control CSS. After that run, only the test's node-click
  assertion, final DESIGN.md wording and task notes changed; the 80-test
  command and `check:docs` were re-run afterwards.
- The real `changes.css` (with `tokens.css`, `themes.css`, `base.css` and
  `primitives.css`) was rendered at 320 px in local Chrome in light and dark:
  active/included/excluded/mixed file rows, the indented folder row, the tree
  rail and the select-all/search alignment all read correctly. The running
  Tauri window was not launched in this environment, so the final app-level
  glance is a manual follow-up rather than a claimed check.
