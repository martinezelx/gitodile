---
id: 203
title: Refine Settings navigation, organization and selection states
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
  - ux
created: 2026-10-27
completed: 2026-10-27
parent:
queue:
---

# Goal

Follow task 202 with a second Settings pass from the user's captures: make
Navigation fill its column with useful content, reorganize the section rail,
give every picker card one selected state, and tighten copy that had to be
read twice.

# User outcome

People choose what stays in the sidebar knowing what each section is for, find
Language and region where they expect it, reach Git's identity before its
advanced options, and can tell at a glance which card in any picker is chosen.

# Context

The user reviewed Settings › Navigation on 2026-10-27 and asked for proposals.
Each change was prototyped in a private interactive mockup before being
approved: one for Navigation (six improvements and eight ways to fill the
empty right-hand column) and one for the rest of Settings (ten improvements).
The user chose the recommended variants in both and asked for them in code,
plus two direct requests: the Updates mascot without its circle, and Language
with Formats in a section of their own.

Relevant decisions: [task 202](202-settings-visual-review-and-demo-account.md)
(Navigation list, rail shell), task 057 (no heading repeating the rail in a
single-group section), [DESIGN.md](../../../DESIGN.md) for tokens and Settings.

# Scope

- Navigation: full-width rows with a plain-language description per section,
  descriptive switch names, quieter "on" switches, arrows revealed on hover or
  focus, hidden sections at full contrast, "Restore default" for membership and
  order, and wide Appearance cards drawn from the user's own rail.
- Updates: the mascot stands free of the tile circle.
- A Language & region section holding Language and Dates and numbers.
- Line endings as the last group of Git, Identity right after the Git
  installation, and a rail grouped into App, Work and Version control.
- One selected state for theme, project-icon, format, code-font and Navigation
  appearance cards; an "Official" tag instead of a check-like badge; a visible
  "More themes" title.
- Copy: "Project tracking", Wrap long lines, the notifications switch and the
  remote-check line; no repeated "Console" heading.

# Out of scope

- New settings, stored-preference migrations or changes to Rust.
- Applying the quieter switch fill outside Navigation.
- Accounts and Updates content beyond the mascot tile.

# Acceptance criteria

- [x] Every rail destination declares a description next to its label, and
      Navigation shows it under each section name in both languages.
- [x] "Restore default" resets membership and order only, disables itself at
      the defaults and announces the result.
- [x] The rail lists 11 sections in three titled blocks plus Updates; arrow
      keys move across them without stopping on titles.
- [x] Line endings, Language and Formats keep their behaviour in their new
      places; no section id points at a removed section.
- [x] All picker cards share one selected state that does not cover the
      specimen; no theme name truncates to fit its tag at the default width.
- [x] Tests, documentation and the aggregate gate pass.

# Relevant files

- `src/features/settings/SettingsPanel.tsx`, `domain.ts`, `translations.ts`,
  `settings.css`
- `src/runtime/screen/module.tsx`, `src/app/screens.tsx`, the screen
  descriptors under `src/features/*/screen.tsx`, `src/app/translations.ts`
- `src/app/App.tsx`, `src/app/AppOverlays.tsx`
- `src/shared/ui/primitives.css`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- Section descriptions live on the screen descriptor (`descriptionKey`) beside
  the label, so a new rail destination cannot ship without one; Settings still
  receives translated strings rather than importing the registry.
- Restore default comes from the composition root's defaults instead of being
  re-derived in Settings, which only ever sees the user's order.
- Console keeps no heading: the mockup proposed "Typing and appearance", but
  the group also holds the confirm-before-changes permission, so that title
  would be wrong, and task 057 already removed headings that repeat the rail.
- The Official tag sits under the theme name: beside it, "GitOdile Light"
  truncated at the default width.
- The quieter switch fill is scoped to the Navigation list; widening it to
  every switch is a separate decision.
- Rail block titles are `aria-hidden`, since a tablist may own only tabs.
- Block titles name a scope, as App and Work do, rather than listing the
  sections under them: the third block is "Version control", not "Git &
  accounts" (a word no section uses) or "Git & integrations" (a repeat of the
  two entries below it).

# Implementation notes

- Descriptors: `descriptionKey` on functional and placeholder screen modules,
  carried through `NAV_DESTINATIONS`; `null` for Home and the Settings overlay.
  The composition root translates it into `NavigationItem.description` and
  passes `DEFAULT_NAVIGATION_PREFERENCES` for Restore default.
- Settings: `SETTINGS_SECTIONS` gains `language` and loses `line-endings`;
  `settingsSectionGroup` maps every section to a rail block as a `Record`, so a
  new section cannot compile without one. `SelectionCheck` is the shared
  corner mark; the per-family selected rules in `settings.css` became one.
- Updates: `.tool-row__tile:has(> .gitodile-mascot)` drops the circle and the
  clipping only for the app's own row; other tool rows keep their tile.
- Review pass before completion: read the whole diff for state, keyboard and
  layout regressions. Fixed the Official tag truncating "GitOdile Light" (now
  under the name), used the caps tracking token the style guard requires, and
  corrected DESIGN.md's Updates note that still described the circle. Line
  ending tests now scope their radio queries to the Line endings group, since
  Git also holds the default-branch radios.
- Not changed on purpose: the quieter switch fill stays local to Navigation;
  the narrow (≤800px) horizontal rail hides block titles.

# Validation

- Visual checks in a throwaway Vite harness (deleted before commit) against
  the running dev server, dark theme, Spanish: Navigation widths, arrow reveal
  on focus, switch fill, accessible switch names, Restore default (disables
  and announces), stacked Appearance cards at 860px, the Updates mascot free
  of its tile with the hop unclipped, the grouped rail fitting without
  scrolling, Git group order, Official tags, the More themes title and the
  corner check on theme and font cards. Light theme not inspected.
- `CARGO_TARGET_DIR=<scratch> VITEST_MAX_WORKERS=4 pnpm run check`: exit 0 —
  documentation (345 Markdown files, 253 task ids), contracts, release and icon
  checks, architecture (641 modules), TypeScript, 155 files / 1,727 frontend
  tests, production build, `cargo fmt`, Clippy, 642 Rust library tests (one
  existing ignored) and 2 integration tests. The scratch target directory
  avoided the executable lock of the running `tauri dev`.
