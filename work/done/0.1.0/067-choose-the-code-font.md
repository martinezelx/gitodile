---
id: 067
title: Choose the font code is shown in
status: done
priority: normal
type: feature
areas:
  - frontend
created: 2026-08-23
completed: 2026-08-23
parent:
---

# Goal

Let people choose which monospaced font diffs are rendered in, from a small
curated set, and remember the choice.

# User outcome

Someone who finds the default hard to read — or simply prefers the font they
already read code in all day — can switch it, and every diff in the app follows.

# Context

The diff font is currently fixed in CSS. `.diff-code` in
`src/features/changes/changes.css` declares Atkinson Hyperlegible Mono with a
system-monospace fallback stack, and `src/styles/fonts.css` carries its single
`@font-face`. Atkinson was chosen for legibility and remains the right default;
the gap is that it is the *only* answer.

Reading preferences already have a home. `DiffPreferences` owns wrapping,
whitespace, tab width and syntax highlighting; it is stored in `localStorage`,
delivered to the viewer through context, and edited by the Settings panel's
**Lectura** section, which already has a working per-section reset. The font
belongs there rather than in Appearance: it describes how code is read, not how
the shell is themed, and Appearance is about theme and language.

The curated set, all without programming ligatures — in a diff, a `!=` fused
into one glyph hides exactly the character that changed:

| Option | Why |
| --- | --- |
| Atkinson Hyperlegible Mono | The current default. Drawn for legibility, and the closest fit to the product's promise. Stays the default. |
| JetBrains Mono | Tall x-height, holds up at small sizes. The expected "developer" choice. |
| IBM Plex Mono | Humanist and warmer in the stroke; the best match for the neutral sans-serif UI. |
| System monospace | Zero added weight, native feel: `ui-monospace`, SF Mono, Consolas, Liberation Mono by platform. |

The two new families ship as `@fontsource` packages, like Atkinson does, so
they are bundled rather than fetched at runtime. The cost is installer size,
not startup: a browser only downloads the face a rule actually uses.

One correctness detail the change must respect. `DiffResultView` measures
character width off the live element's computed font to estimate wrap points
for the virtualizer. Changing the font changes that width without resizing
anything, so the `ResizeObserver` never fires — the measurement effect has to
re-run on a font change the same way it already re-runs on `tabWidth`.

# Scope

- Add a `codeFont` field to `DiffPreferences`, with its own choice list,
  type guard and default, beside `DIFF_TAB_WIDTHS`.
- Validate it when reading the stored preferences, so an unknown value falls
  back to the default rather than reaching CSS.
- Apply it in the diff viewer as a CSS custom property consumed by
  `.diff-code`, keeping the system fallback stack behind every choice.
- Re-measure character width when the font changes, including after a bundled
  face finishes loading.
- Add the control to the **Lectura** section as a radio group matching the
  existing tab-width group, with the same keyboard behavior, and include it in
  that section's reset.
- Add English and Spanish strings for the label, description and option names.
- Add the `@fontsource` dependencies and their `@font-face` rules; record both
  fonts in `THIRD_PARTY_LICENSES.md`.

# Out of scope

- Font size and line height. Only the family is configurable here.
- Any font used by the app shell outside the diff viewer.
- Per-project or per-file font overrides.
- Ligature or font-feature settings.
- A free-text field for an arbitrary installed font.

# Acceptance criteria

- [x] The Lectura section offers the four options, shows which is active, and
      switching one re-renders open diffs in that font immediately.
- [x] The choice survives closing and reopening the app.
- [x] "Restablecer" in Lectura returns the font to Atkinson Hyperlegible Mono
      along with the other reading preferences, and is disabled when every
      value is already at its default.
- [x] The radio group is one Tab stop, arrow keys move within it, and Home and
      End reach the ends — the same as tab width.
- [x] With wrapping off, long lines still size the scroll area correctly after
      a font change, with no stale character-width measurement.
- [x] A corrupt or unknown stored `codeFont` falls back to the default.
- [x] Both added fonts are recorded in `THIRD_PARTY_LICENSES.md` with their
      real licence.
- [x] Full `pnpm run check` passes.

# Relevant files

- `src/features/changes/diffPreferences.tsx`
- `src/features/changes/DiffResultView.tsx`
- `src/features/changes/changes.css`
- `src/features/changes/index.ts`
- `src/features/settings/SettingsPanel.tsx`
- `src/features/settings/translations.ts`
- `src/app/preferences.ts`
- `src/styles/fonts.css`
- `package.json`, `THIRD_PARTY_LICENSES.md`

# Dependencies

None. Independent of task 066.

# Decisions

- The setting lives in `DiffPreferences`, not in a new app-level preference:
  the viewer is the only consumer, and that type already carries every other
  answer to "how should code be shown to me".
- Ligature-free families only, for the reason given above.
- "System monospace" is offered as a real choice rather than left implicit as
  a fallback, because it is the answer for anyone who wants the app to look
  like the rest of their machine.
- Implemented out of queue order at the user's explicit request.

# Implementation notes

`diffPreferences.tsx` gained `DIFF_CODE_FONTS`, `DiffCodeFont`,
`isDiffCodeFont` and `DIFF_CODE_FONT_STACKS`, mirroring the tab-width shape
next to it. Every stack ends in the same system monospace fallbacks, including
`system` itself, so a face that fails to load degrades to another monospaced
font rather than to the UI sans-serif — which would break the column alignment
the diff depends on.

`DiffResultView` sets `--diff-code-font` on both `.diff-code` elements: the
virtualized `<pre>` and the accessible plain-text one, so the setting cannot
apply to some views and not others. `.diff-code` in `changes.css` reads that
custom property with the Atkinson stack as its fallback, so a diff rendered
without a preferences provider still looks right. Doing this meant splitting
the `font: 12.5px/1.6 <stack>` shorthand into `font-size`, `line-height` and
`font-family`; the shorthand's implicit resets were all no-ops on a `<pre>`,
and the computed size and line height were measured unchanged afterwards
(12.5px and 20px).

The virtualizer's wrap estimate reads character width off the live element, and
a font change resizes nothing, so the `ResizeObserver` never fires — `codeFont`
joins `tabWidth` in the measurement effect's dependencies. This is not
theoretical: the same ten characters measure 78.97px in Atkinson, 74.99px in
JetBrains Mono and Plex Mono, and 68.71px in the system stack, a 13% spread.
A stale measurement would misestimate wrapped-row counts by that much. The
effect also re-measures once on `document.fonts.ready`, because
`font-display: swap` paints the fallback until the bundled face arrives; the
optional-chained access keeps it survivable where `document.fonts` is absent.

The Lectura section's reset already iterated over the keys of
`DEFAULT_DIFF_PREFERENCES`, so it covered the new field without changes — the
test was extended to prove that rather than to make it true.

Each radio is rendered in the family it selects, so the option is its own
sample and the labels can stay short enough for the group to fit on one line.

`@fontsource/jetbrains-mono` and `@fontsource/ibm-plex-mono` at 5.3.0, matching
the Atkinson pin. Both are OFL-1.1, the same licence Atkinson already carried,
so `THIRD_PARTY_LICENSES.md` was restructured to list the three copyright
notices above one shared copy of the licence text rather than repeating it.

# Validation

`pnpm run check` — passed (`check:docs`, `check:architecture`, `typecheck`,
`test` 399 passed / 49 files, `build`, `check:rust`).

`pnpm run build` emits all three faces as separate assets — 10,056 B Atkinson,
21,168 B JetBrains, 14,708 B Plex — so the two additions cost ~36 kB of
installer size and no entry JS. The entry chunk is 366.15 kB raw / 100.69 kB
gzip, still inside the 378 kB / 110 kB budget from task 055.

Measured against the running dev server rather than assumed:

- The group renders four options, exactly one `aria-checked="true"`, roving
  tabindex on the checked one, and each option's computed `font-family` starts
  with the family it names; all four keep `monospace` in the stack.
- `document.fonts.check` reports all three bundled faces loaded.
- At the 900px minimum window width the group is 403px inside a 595px row, all
  four options share one baseline (y=468), and neither the section view nor the
  document scrolls horizontally.
- Clicking JetBrains moved the selection and wrote
  `codeFont: "jetbrains"` to `gitodile-diff-preferences`; "Restablecer" became
  enabled.
- A probe `.diff-code` element resolves Atkinson with no custom property set,
  and each stack in turn when one is, at the character widths quoted above.
