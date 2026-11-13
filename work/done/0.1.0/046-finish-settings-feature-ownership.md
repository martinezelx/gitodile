---
id: 046
title: Finish Settings feature ownership and stop paying for it at startup
status: done
priority: low
type: chore
areas:
  - frontend
  - architecture
  - performance
created: 2026-08-10
completed: 2026-08-12
parent: "038"
---

# Goal

Give the Settings feature its own styles and translations, and stop shipping its
panel in the entry chunk.

# User outcome

No visible change to the Settings overlay. A slightly smaller first download,
since a panel most sessions never open stops being part of the startup bundle.

# Context

Task 031 extracted the Settings overlay into `src/features/settings/` behind a
typed port, which removed seven direct `invoke` calls from `main.tsx`. It
deliberately stopped there and recorded two residuals.

**Styles and copy still live in the app namespace.** Settings rules occupy
`src/app/app-shell.css` lines 364–464, with responsive rules interleaved into
the shell's media queries at 517–529 and 567. Task 030 established that a
feature owns its CSS and that `src/styles.css` is a tested, deterministic
cascade manifest — app shell before features. Moving the Settings rules into a
feature file places them *after* the shell in the cascade, which can change the
rendered result. That is why the audit left them: reordering 796 rules inside an
audit was the wrong risk. It is the right work for a task that can verify it.

The counter-argument is real and should be settled rather than assumed: Settings
is registered as `kind: "overlay"`, `section: "application"` — app-level chrome,
not a project screen. Its dialog frame (`.settings-dialog*`) genuinely belongs
to the shell. Only the panel's own rules are in question.

**The panel is statically imported.** `main.tsx` lazily loads PublishDialog,
PendingVersionsSection and the branch dialogs, but imports SettingsPanel
directly, so it sits in the entry chunk at 375.59 kB against a 378 kB warning —
2.4 kB of headroom. Making it lazy is the obvious reclaim. The audit left it
because the overlay has focus management (`settingsDialogRef`, `useModalFocus`)
and a Suspense boundary changes when content mounts relative to the focus trap.
That interaction needs testing, not assuming.

# Scope

- Split the Settings rules: panel rules to `src/features/settings/settings.css`
  registered in `src/styles.css`; dialog chrome stays with the app shell.
  Verify the cascade result is unchanged, including responsive and
  forced-colors behavior.
- Update `src/styleComposition.test.ts`'s expected import list and its
  feature-ownership assertions.
- Move Settings copy to `src/features/settings/translations.ts` following task
  030's namespace pattern, keeping navigation and palette strings in the app
  namespace.
- Make `SettingsPanel` lazy with a Suspense fallback, and prove the focus trap
  still moves focus into the dialog after the chunk arrives and returns it to
  the trigger on close.
- Re-measure the entry chunk.

# Out of scope

- Redesigning Settings or changing any copy.
- Moving the `.settings-dialog*` chrome out of the app shell.
- Changing the `SettingsPort` or `useGitTooling`.

# Acceptance criteria

- [x] Settings panel rules and copy are feature-owned; the cascade manifest and
      its test reflect it.
- [x] Rendered Settings appearance is unchanged in light and dark themes, at
      the narrow breakpoint, and under forced colors.
- [x] The panel loads lazily and is no longer in the entry chunk.
- [x] Opening Settings moves focus into the dialog and closing returns it to
      the trigger, covered by a test that would fail if the Suspense boundary
      broke it.
- [x] Entry chunk is measurably smaller and stays below the 378 kB warning.
- [x] Full `AGENTS.md` validation passes.

# Relevant files

- `src/features/settings/`
- `src/app/app-shell.css`, `src/app/translations.ts`
- `src/styles.css`, `src/styleComposition.test.ts`
- `src/main.tsx`, `src/modalFocus.ts`

# Dependencies

Task 041, which settles where shared primitives live before this moves more
files around them.

# Decisions

- Split by owner rather than by file: the overlay's chrome is shell, the panel's
  content is the feature. Moving all of it either way would be tidier and less
  true.

# Implementation notes

- Kept `.settings-backdrop` and `.settings-dialog*` in the app shell, while the
  panel layout, navigation, sections, identity rows and Git status presentation
  moved unchanged to `src/features/settings/settings.css`. The tested eager
  cascade registers that feature stylesheet after the other feature owners.
- Moved the 61 Settings-panel strings, unchanged in English and Spanish, into
  `src/features/settings/translations.ts`. Navigation, command-palette and
  dialog-chrome copy remain app-owned.
- Removed `SettingsPanel` from the feature barrel and load it directly with
  `lazy()`. The `Suspense` boundary is inside the already-mounted dialog, so the
  close button is focusable while the chunk arrives and `useModalFocus` keeps
  ownership of focus restoration.
- Production build impact against the task-048 baseline:

  | Asset | Before | After | Change |
  | --- | ---: | ---: | ---: |
  | entry JS | 282.27 kB / 83.01 kB gzip | 269.08 kB / 80.25 kB gzip | -13.19 kB / -2.76 kB gzip |
  | SettingsPanel JS | part of entry | 12.66 kB / 3.15 kB gzip | lazy chunk |
  | eager CSS | 94.60 kB / 14.48 kB gzip | 94.63 kB / 14.50 kB gzip | +0.03 kB / +0.02 kB gzip |

  `fileIcons` remains a separate 255.25 kB / 86.23 kB gzip chunk.

# Superseded (2026-08-13)

The lazy split above was reverted; the style and translation ownership stands.
Making the panel lazy traded a visible cost for an invisible one: `React.lazy`
attaches to its loader only on first render, so even a prefetched module
suspends for a tick, and an overlay opened by a click has no navigation in
front of it to mask that frame. The 2.4 kB of headroom that justified the trade
became roughly 107 kB after the later task-023 follow-ups, so the panel is
imported statically again. Its registry entry moved to the feature as
`settingsOverlayModule`, matching how screens register beside their owner.
Entry JS went from 270.56 kB to 283.72 kB, against the same 378 kB warning.
Measurements and reasoning are in
[task 055](055-open-settings-without-a-loading-frame.md).

# Validation

- `pnpm run typecheck`
- `pnpm run test` (30 files, 256 tests)
- `pnpm run build` (1,941 modules)
- `pnpm run check:architecture` (209 production modules plus seeded negative fixtures)
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
- Focused: `pnpm exec vitest run src/styleComposition.test.ts src/features/settings/SettingsPanel.test.tsx src/main.test.tsx` (3 files, 16 tests)
- Browser verification in Spanish covered dark and light themes, the 720 px
  narrow layout, `forced-colors: active`, initial focus on Close, and return to
  the Settings trigger on dismissal.
