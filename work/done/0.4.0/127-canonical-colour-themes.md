---
id: 127
title: Add canonical colour themes to the Interface setting
status: done
priority: normal
type: feature
areas:
  - frontend
  - design
  - accessibility
created: 2026-09-21
completed: 2026-10-05
parent:
queue:
---

# Goal

Replace the three-option theme control in Settings > Interface with a visual
theme picker, on top of the layered token model decided in
[ADR 0012](../../../docs/adr/0012-layer-theme-tokens-and-ship-canonical-palettes.md):
GitOdile Light and Dark remain the official pair that follows the system, and a
set of themes with canonical palettes can be selected alongside them.

# User outcome

A person can see each theme as a small preview of the app, pick the one they
like, and know that the crocodile mark, the primary action, and the meaning of
status colours stay GitOdile in every palette. "Match device" still hands the
official light/dark choice back to the operating system.

# Context

The current control is a three-state segmented control (`system`, `light`,
`dark`) backed by the `ThemePreference` union and stored under `gitodile-theme`.
Colours live in `src/styles/tokens.css`. The visual shape and the layered model
were settled with the owner from throwaway HTML mockups, since removed.
The architectural decision and its constraints, including which palettes are
admissible, are fixed by
[ADR 0012](../../../docs/adr/0012-layer-theme-tokens-and-ship-canonical-palettes.md);
this task does not re-open them.

# Scope

- Split `tokens.css` into the two layers defined by ADR 0012: brand identity
  (declared once) and theme colour tokens (per theme).
- Add a theme registry (record shape `id`, name, `scheme`, `source`) and the
  canonical palette records: `gitodile-light`, `gitodile-dark` (verbatim from
  the current tokens), plus the first admitted community themes - Catppuccin
  Mocha, Catppuccin Latte, Nord, Tokyo Night, Dracula - with a documented
  palette-to-token mapping and canonical sources.
- Deliver palettes as `[data-theme="<id>"]` CSS blocks with `color-scheme`.
- Change `ThemePreference` to `"system" | ThemeId`, migrate stored `light`/
  `dark` values once, and keep `system` resolving to the official pair.
- Rebuild the Interface > Theme group as a visual picker: official options
  first, community themes after, each card a miniature app preview and a
  light/dark glyph for its scheme. Remove the text Light/Dark chip.
- Keep the titlebar toggle and command palette cycling only the official trio.
- Have the mascot resolve its treatment from the theme `scheme`.
- Add the contrast and token-contract tests described by ADR 0012.
- Update `DESIGN.md` § Theming with the layers and the admission rule.
- Add translations for the new theme names and picker copy in `en` and `es`.

# Out of scope

- A searchable theme list, per-user custom themes, or importing third-party
  palette files.
- Any "brand-adapted" theme class or any non-canonical palette, including
  Vercel/Geist (see ADR 0012).
- Moving theme persistence to a native/Tauri store.
- Changing the app-wide theme cross-fade or reduced-motion behavior.
- Retheming the diff viewer, editors, or any surface beyond existing semantic
  tokens.

# Acceptance criteria

- [x] Brand tokens (`--accent-brand`, `--accent-brand-contrast`,
  `--avatar-*`, `--tooltip-*`) are declared once and no `[data-theme]` block
  sets them; a test fails if one does.
- [x] The official records reproduce the current GitOdile Light and Dark values
  exactly; `DESIGN.md` and the stylesheet agree.
- [x] Canonical themes render from their published base/text/accent colours;
  every GitOdile-only role (diff, syntax, secondary text) is documented with
  its mapping and passes the contrast test.
- [x] The Interface > Theme picker shows official options first and community
  themes after, each with a usable preview, a scheme glyph, and a selected
  state; the text Light/Dark chip is gone.
- [x] "Match device" still resolves to the official light/dark theme and keeps
  following OS changes without a reload.
- [x] Stored `light`/`dark` preferences migrate to `gitodile-light`/
  `gitodile-dark` once, with unknown values falling back to `system`.
- [x] The titlebar toggle and command palette cycle only
  `system` -> `gitodile-light` -> `gitodile-dark`.
- [x] Every theme meets 4.5:1 for body text and 3:1 for large text, icons, and
  borders; the contrast test covers all registry entries and fails a new one
  that does not.
- [x] The picker is keyboard-operable as a radiogroup (roving focus, arrows)
  and is announced correctly to assistive technology; light/dark is conveyed
  by an accessible glyph name, not colour alone.
- [x] Empty, loading, and error states are not applicable; a disabled or
  removed theme does not strand a stored selection.
- [x] `pnpm run check` passes.

# Relevant files

- [`AGENTS.md`](../../../AGENTS.md)
- [`DESIGN.md`](../../../DESIGN.md)
- [`docs/adr/0012-layer-theme-tokens-and-ship-canonical-palettes.md`](../../../docs/adr/0012-layer-theme-tokens-and-ship-canonical-palettes.md)
- [`docs/adr/0013-themes-own-the-actionable-accent.md`](../../../docs/adr/0013-themes-own-the-actionable-accent.md)
- [`docs/adr/0015-community-theme-toggle-returns-to-the-device.md`](../../../docs/adr/0015-community-theme-toggle-returns-to-the-device.md)
- `src/shared/theme/themes.ts`, `src/shared/theme/index.ts`
- `src/styles/themes.css`
- `src/styles/tokens.css`
- `src/styles.css`
- `src/features/settings/domain.ts`
- `src/features/settings/SettingsPanel.tsx`
- `src/features/settings/settings.css`
- `src/features/settings/translations.ts`
- `src/app/preferences.ts`
- `src/app/App.tsx`
- `src/architecture/styleComposition.test.ts`
- `src/architecture/themeContrast.test.ts`
- `src/app/appShell.test.tsx`
- `src/app/App.test.tsx`
- `src/features/settings/SettingsPanel.test.tsx`

# Dependencies

- ADR 0012 must be accepted before implementation. It is accepted.

# Decisions

- Theme vocabulary and registry live in `src/shared/theme/` (a new shared
  module) so both the app composition root and the Settings feature read one
  source through its public entry point.
- All theme colour values, including the two official records and the
  `prefers-color-scheme` default, live in `src/styles/themes.css`;
  `tokens.css` keeps the non-colour foundations and the brand layer only.
  "Match device" keeps no `data-theme` attribute, so live OS following stays a
  media query rather than a JS listener; the duplicated official light/dark
  values are held together by a test.
- The theme display names are proper names and are not translated; the picker
  group labels, description and scheme words are translated in `en` and `es`.
- Derived values, each documented beside its block: Catppuccin Latte success/
  diff-added `#357a20` and warning `#a06a00` (published green/yellow fail 3:1
  on a light surface); Latte syntax comment uses overlay1; Nord danger/
  diff-removed/heart `#d0848b` (published aurora red fails 3:1 on polar night);
  Nord comment `#7b88a1`; Tokyo Night comment uses dark5 `#737aa2`; Dracula
  secondary text is a derived tint of `foreground`.
- Follow-up after trying the running app, decided with the owner: the theme
  owns the actionable accent (ADR 0013). `.primary-button`, the status-bar
  count badge and `--attention-color` use `--accent-primary-fill` /
  `--accent-primary-contrast`; `--accent-brand` is identity only. The titlebar
  toggle sends a community theme back to "match device" (ADR 0015), showing the
  monitor glyph for that press; from the device or an official theme it flips
  the official light/dark pair. (ADR 0014's remembered-theme approach was
  superseded by 0015 before it shipped.)
- Backlog of themes grew to nine community records: Catppuccin Mocha, Latte,
  Macchiato and Frappé; Nord; Tokyo Night; Dracula; Solarized Dark and Light.
  Solarized is flat (all surfaces base03/base3) with derived text/status values
  to clear the contrast floor.
- Contrast pass before release, decided with the owner: the contrast
  contract in `themeContrast.test.ts` now measures every pairing the app
  paints (text on control, hover, selection and card; accent and status as
  words at 4.5:1; button labels at 4.5:1; diff ink on its tinted line; syntax
  on the code well and the tinted lines; secondary quieter than primary;
  raised above panel in dark themes). Every theme was brought up to it:
  GitOdile Dark's accent became `#86c24a` with a lime focus ring (the shared
  `#527e26` read at 2.7-3.6:1 there), Light's accent/diff green deepened
  slightly, and each community block lists the hues it lifted or darkened.
  Catppuccin Macchiato was dropped as indistinguishable from Mocha/Frappé (a
  stored preference migrates to Mocha); Gruvbox Dark and Light were added as
  a warm palette and a third light option. `::selection` now follows the
  theme.
- Picker shape settled with the owner: square tiles (one per theme, preview
  filling it, name on a dark scrim), the official three centred in their own
  unlabelled tray, the community grid below, and selection shown by the accent
  border alone. The scheme glyph moved to the trailing edge and the selected
  check was removed. A new `--radius-tile` (28px) role token carries the tile
  and its tray; documented in DESIGN.md § Shape.

# Implementation notes

- Two token layers: brand identity (`--accent-brand`/`-contrast`, avatars,
  tooltip) stays in `tokens.css` and is never themed; `themes.css` holds the
  swap-able tokens plus `color-scheme`.
- Registry `THEMES`/`THEME_IDS`/`ThemeRecord`/`ThemePreference` in
  `src/shared/theme`; `ThemePreference = "system" | ThemeId`. `domain.ts`
  re-exports the types so the app keeps importing them from the Settings
  feature's public API.
- `readStoredTheme` migrates `light`/`dark` once at read time; the first
  `usePersistedChoice` write lands the migrated value back. Unknown values fall
  back to `system`.
- `resolveEffectiveThemeId`/`resolveEffectiveThemeScheme` replace
  `resolveEffectiveTheme`; the titlebar toggle and command palette cycle the
  official trio only.
- The picker renders each theme as a miniature `ThemePreview` scoped by
  `data-theme`, in two radiogroups ("Official", "More themes"); the scheme is a
  glyph plus an accessible-name suffix, not a colour-only cue.
- No Rust/Git changes.
- Follow-up not done here: validation against the running Tauri application
  (the task changes UI, and only unit/build checks were run in this
  environment).

# Validation

- `pnpm run typecheck` - passed.
- `pnpm exec vitest run src/architecture src/app/appShell.test.tsx src/features/settings/SettingsPanel.test.tsx src/app/App.test.tsx`
  - 127 passed (then 88 in the follow-up run after the accent/toggle changes).
- `pnpm run check:architecture` - passed over 393 modules.
- `pnpm run check:frontend` (architecture, typecheck, tests, build) - passed.
- `pnpm run check` (docs, frontend, Rust fmt/clippy/tests) - passed; Rust
  `411 passed`.

## Closure review (2026-10-05)

Reviewed the implementation, acceptance criteria and recorded validation.
The approved feature scope is implemented; historical validation above is
preserved. Closed during the requested task-status review.

Closure checks: `node scripts/check-docs.mjs` passed. Focused theme contrast,
project identity, avatar and session-technology tests passed (4 files, 29 tests).
The current `pnpm run check` passed documentation/icon and architecture checks
but stopped in TypeScript: the existing, untracked RepositoryBrowser.tsx uses
missing `repositoriesLoadHint` and `repositoriesConnectionHint` translation keys.
This task-status change does not alter that parallel implementation; the
historical full-gate pass above is not a claim that the current full tree passes.
