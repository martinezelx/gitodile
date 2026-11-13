---
id: 147
title: Show application versions without a v prefix
status: done
priority: normal
type: design
areas:
  - frontend
  - documentation
created: 2026-10-03
completed: 2026-10-03
parent:
queue:
---

# Goal

Show GitOdile application versions consistently as `X.Y.Z` throughout the UI.
Use the word "version" where a sentence needs it, rather than the `v` abbreviation.

# User outcome

The installed and offered versions read consistently in Settings, About,
What's new, the status bar, the update dialog, notifications and Console.

# Context

On 2026-10-03 the user approved the application-wide audit's recommendation
to remove the prefix. At the time of the audit, Settings already showed the
installed version without it; 23 presentation expressions across six files
still added it in English or Spanish.
The durable wording rule belongs in [DESIGN.md](../../../DESIGN.md).

# Scope

- Remove the presentation prefix from app versions, including tooltips and
  accessible names, current and earlier releases, update progress and receipts.
- Replace "You have vX.Y.Z" / "Tienes la vX.Y.Z" with an installed-version label.
- Keep update failure explanations grammatical in both languages.
- Update existing UI test expectations and document the design rule.

# Out of scope

- Git tags, release URLs, highlights filenames and publication conventions.
- Version metadata, updater validation, installation or Git operation behavior.
- Changes to externally supplied release notes or project tags.

# Acceptance criteria

- [x] All app-owned version labels use plain `X.Y.Z` in English and Spanish.
- [x] Sentences remain natural; installed and offered versions remain distinct.
- [x] Tooltips and accessible names agree with the visible labels.
- [x] Existing diagnostics and external technical identifiers retain their format.
- [x] `pnpm run check` passes.

# Relevant files

- [DESIGN.md](../../../DESIGN.md)
- [AppOverlays.tsx](../../../src/app/AppOverlays.tsx)
- [Shell translations](../../../src/app/translations.ts)
- [UpdateDialog.tsx](../../../src/features/app-updates/UpdateDialog.tsx)
- [Update translations](../../../src/features/app-updates/translations.ts)
- [Notification translations](../../../src/features/notifications/translations.ts)
- [ConsoleScreen.tsx](../../../src/features/console/ConsoleScreen.tsx)

# Decisions

Use a bare number in badges and release headings where the context already
identifies it. Use "version" / "versión" in prose when necessary. This is a
presentation-only change shared by Windows, macOS and Linux.

# Implementation notes

Removed the prefix from shell translations, About's corner badge, the update
candidate heading, updater copy, notification titles and Console's welcome.
Both languages now label the installed version explicitly and spell out
"version" in the unconfirmed-restart explanation. Existing state controllers,
numeric metadata, release identifiers and copied diagnostics are unchanged.

Updated the existing shell, About, changelog, update, receipt and notification
tests; extended the existing Spanish update and Console welcome assertions.
Keyboard/focus, loading, progress and failure coverage remains in those suites.
No platform-specific code, styles, dependencies or architecture changed.

# Validation

- `pnpm run check` passed: documentation/contracts/release/icon checks,
  frontend architecture, TypeScript, 120 frontend suites / 1,185 tests, production
  build, Rust formatting, Clippy and 489 Rust tests.
- `git diff --check` passed.
- Final review reran the eight affected UI suites with `pnpm exec vitest run`
  and their explicit file paths: all 176 tests passed. `node scripts/check-docs.mjs`
  passed after closing and documenting the task.
- Source audit found no remaining app-version prefix expressions. The license
  version, recovery/storage schema identifiers and project references retain `v`.
- Validation used the existing rendered-component and interaction suites;
  the native Tauri window was not exercised for this presentation-only change.

# Final review

Reviewed the production and test diff against every version presentation
consumer, including both languages, tooltip/accessibility text, updater
progress, success and unconfirmed-restart states. No defects, missing surfaces
or worthwhile additional refactor were identified. The change preserves the
existing feature boundaries and version data, and adds no runtime behavior.
