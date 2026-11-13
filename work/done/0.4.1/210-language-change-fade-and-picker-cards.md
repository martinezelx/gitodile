---
id: 210
title: Cross-fade language changes and offer each language as a picker card
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
created: 2026-10-28
completed: 2026-10-28
parent:
queue:
---

# Goal

Make a language change read as one change of the whole window instead of every
label snapping to the other language in a single frame, and give the language
choice in Settings the same picker cards as the formats beside it.

# User outcome

Choosing a language in Settings fades the window to the new language at the
app's normal duration, and each language is shown with its code, its own name
and a line of GitOdile's words in that language.

# Context

The language was the last plain segmented control in Settings: the date and
number formats directly below it, themes, project icons and code fonts all use
picker cards with a specimen. Theme changes already cross-fade the window with
a view transition at `--duration-normal` (180ms) and honour both reduced-motion
settings.

Flags were considered and rejected: a flag names a country rather than a
language (which flag is English, or Spanish?), and Windows draws flag emoji as
two letters, so they would need bundled artwork.

# Scope

- Reuse the theme cross-fade for language changes (`startLanguageFade`), with
  the titlebar's theme glyph dissolving with the window instead of turning.
- Start the fade only after the incoming dictionary has loaded; commit at once
  when "System" resolves to the language already shown.
- Commit only the latest pick, so a dictionary that answers after a newer
  pick cannot bring back the language the user just left.
- Replace the segmented control with three format-style picker cards: a round
  mark (the language code, or the monitor for "System"), the language's own
  name, and a specimen line; "System" shows the language it resolves to.

# Out of scope

- Adding languages.
- Release highlights: this is polish within 0.4.1, not a headline feature.

# Acceptance criteria

- A language change cross-fades the whole window at `--duration-normal`, and
  changes instantly under the app's or the system's reduced motion.
- Picking "System" when it resolves to the shown language does not animate.
- Rapid picks always end on the last one.
- The cards share the Settings picker selected state and stack to one column
  on narrow panels; their accessible names stay the language names.

# Relevant files

- `src/app/themeTransition.ts`, `src/app/themeTransition.test.ts`
- `src/i18n/index.tsx`, `src/i18n/languageChange.test.tsx`
- `src/bootstrap.tsx`
- `src/features/settings/SettingsPanel.tsx`, `src/features/settings/settings.css`
- `src/styles/theme-transition.css`
- `DESIGN.md` (Motion; picker cards)

# Dependencies

None.

# Decisions

- The provider takes the animation as an optional `animateLanguageChange`
  prop wired in the bootstrap, because `i18n` may not import app composition.
  Without it a change commits at once, which keeps every existing test as is.
- The fade keeps the `data-theme-transition` root attribute rather than
  renaming it: the choreography is the same and the attribute is shared by the
  reduced-motion stop and existing tests.
- Specimens live beside `LANGUAGE_NAMES`, outside the dictionaries, since only
  the active dictionary is loaded; they quote the product's own copy
  ("Everything is saved", "Publish changes").

# Implementation notes

Review found that a pick waiting for its dictionary could commit after a newer
pick that needed no load; a per-provider pick counter now drops stale commits,
covered by a test that fails without it.

# Validation

- `pnpm vitest run src/i18n src/app/themeTransition.test.ts src/features/settings src/features/account`
- `pnpm run check:docs`, `pnpm run check:architecture`, `pnpm run check:frontend`
- A throwaway browser harness rendering the real Settings section: the three
  cards at equal height with the selected check, and picking English set the
  fade with the glyph left unnamed, switched the copy and cleared the root
  attribute afterwards. The animation itself was not captured on screen.
- No Rust changed; `check:rust` was not rerun.
