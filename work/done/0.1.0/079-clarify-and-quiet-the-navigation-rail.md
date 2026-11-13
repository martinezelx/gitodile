---
id: 079
title: Clarify and quiet the navigation rail
status: done
priority: normal
type: improvement
areas:
  - frontend
  - desktop
  - accessibility
  - documentation
created: 2026-08-26
completed: 2026-08-26
parent:
queue:
---

# Goal

Make the navigation rail calmer and self-explanatory without restoring visible
captions to its project and application controls or changing the status bar.

# User outcome

People can identify the project, add-project, Settings, Login, and unavailable
navigation controls without guessing, while frequent pointer movement through
the rail feels stable and professional. The reserved Login position remains
visibly intentional without implying that an account is required today.

# Context

Task 078 deliberately removed the visible captions beneath the project,
add-project, Settings, and account controls to keep that part of the rail clean
and visually distinct from screen destinations. That separation works and must
remain. Its recorded follow-up was to add tooltips if pointer discoverability
proved weak.

A UI review on 2026-08-26 confirmed that it is weak: the controls have
accessible names, but a pointer user receives no visible name. The disabled
Login button reserves its future position but does not explain that it is
merely upcoming and optional in a local-first product. Disabled destinations
similarly encode their reason only in an accessible name, so sighted users see
muted furniture without learning whether they must open a project or wait for
a future feature.

The same review found that the rail hover combines a fill, a 1px lift, and an
icon scale. Application utilities additionally borrow the accent-tinted active
surface. Together those effects make frequent navigation feel buoyant and can
make hover resemble selection. The selected destination treatment itself is
clear and should remain.

The relevant findings from the review are summarized above.

# Scope

- Keep project, add-project, Settings, and Login controls icon-only in both
  navigation display modes.
- Add concise English and Spanish tooltips to those controls:
  - active project: identify the action and current project, for example
    **Switch project — GitOdile** / **Cambiar proyecto — GitOdile**;
  - no active project: explain the available project-switching/opening action
    truthfully rather than showing an empty identity;
  - add project: **Add project** / **Añadir proyecto**;
  - Settings: **Settings** / **Ajustes**;
  - Login: **Sign in — Coming soon** / **Iniciar sesión — Próximamente**.
- Use the shared tooltip primitive and preserve each control's existing
  accessible name. Do not create a rail-only tooltip implementation.
- Make unavailable destinations explain their state to pointer, keyboard, and
  screen-reader users. Distinguish at least:
  - **Open a project first** / **Abre un proyecto primero**;
  - **Coming soon** / **Próximamente**.
- Ensure the explanation remains reachable when the underlying action cannot
  run. Do not rely on hover events firing directly on a native disabled button;
  use an accessible wrapper or a guarded `aria-disabled` interaction according
  to the shared tooltip pattern, without allowing click, Enter, or Space to
  navigate.
- Keep the disabled pre-auth Login button in its current persistent position so
  future account functionality does not move the rail furniture. Make its
  unavailable state and **Coming soon** reason discoverable by pointer,
  keyboard, and screen reader without allowing activation. Keep the copy clear
  that Login is optional rather than required for local workflows.
- Quiet pointer feedback across destination, project, and application controls:
  - remove vertical lift and icon enlargement from hover;
  - use the neutral hover surface and text/icon emphasis consistently;
  - reserve the accent-tinted surface and green icon for active/selected state;
  - retain at most a restrained pressed response that does not shift layout;
  - preserve the current visible focus treatment.
- Keep reduced-motion behavior correct after simplifying the transitions and
  remove now-dead motion rules.
- Update `DESIGN.md` so its durable rail guidance matches the delivered
  tooltip, hover, disabled-state, and account decisions.
- Update focused component and shell tests for tooltip content, unavailable
  activation guards, retained Login behavior, hover/active class behavior
  where testable, and both locales.

# Out of scope

- Wiring, redesigning, resizing, localizing, or otherwise changing the status
  bar. Its data and responsive behavior belong to a separate future task.
- Restoring visible captions beneath project, add-project, Settings, or Login.
- Changing the active destination tile, rail width, divider, rail surface,
  destination order, overflow measurement, More menu structure, favourites,
  project switching behavior, or sidebar collapse behavior.
- Adding authentication, hosting-provider integrations, cloud accounts, user
  profiles, or an account menu.
- Renaming **Branches** or changing screen-level navigation vocabulary.
- Introducing a new tooltip dependency or a second icon library.

# Acceptance criteria

- [x] Project, add-project, Settings, and Login remain icon-only and expose
      concise, localized tooltips to pointer and keyboard users.
- [x] The active-project tooltip includes the current display name and handles
      long, non-ASCII, and missing project names without overflowing the
      viewport or producing an empty label.
- [x] Every unavailable destination exposes a localized reason on pointer and
      keyboard access while remaining impossible to activate by click, Enter,
      or Space.
- [x] Existing accessible names, `aria-current`, menu state, focus restoration,
      and screen-reader navigation semantics remain correct and are not
      duplicated noisily by tooltip content.
- [x] The unavailable Login control remains in its current rail position,
      exposes **Coming soon** in both locales, and cannot be activated by
      click, Enter, or Space.
- [x] Hover does not translate or scale rail icons and never uses the selected
      accent surface for an inactive control.
- [x] Active, hover, pressed, disabled, and focus-visible states remain visually
      distinct in light and dark themes.
- [x] The rail remains usable at the documented minimum desktop width, short
      window heights, 200% text zoom, both navigation display modes, both
      locales, coarse pointer, and reduced motion.
- [x] No status-bar source, styling, copy, test, or documentation is changed by
      this task.
- [x] `DESIGN.md` documents the final tooltip, disabled-state, hover, and
      account-presence rules without duplicating implementation details.
- [x] Focused tests pass and `pnpm run check` completes successfully.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/PRODUCT_STRATEGY.md`
- `docs/ARCHITECTURE.md`
- `src/app/App.tsx`
- `src/app/RailNav.tsx`
- `src/app/RailNav.test.tsx`
- `src/app/app-shell.css`
- `src/app/appShell.test.tsx`
- `src/app/project-switcher/ProjectSwitcher.tsx`
- `src/app/project-switcher/ProjectSwitcher.test.tsx`
- `src/app/translations.ts`
- `src/shared/ui/tooltip.tsx`
- `src/shared/ui/primitives.css`
- `work/done/0.1.0/078-rework-rail-chrome-and-project-switcher.md`

# Dependencies

None. The status bar follow-up is intentionally independent and does not block
this task.

# Decisions

**Keep selective icon-only controls.** The visual separation below the divider
is intentional and successful. Project, add-project, and Settings retain their
compact shapes; tooltips restore pointer and keyboard discoverability without
turning the rail back into a wall of captions.

**Reserve Login without implying a requirement.** Keeping the control prevents
future account functionality from moving the rail furniture. Its disabled
state must explicitly say **Coming soon**, and the copy must preserve
GitOdile's local-first commitment rather than suggesting that an account is
required.

**Hover confirms interactivity; selection communicates location.** Hover uses
a stable neutral surface. Accent tint and green remain exclusive to the active
destination or genuinely selected control, so the two states cannot be
mistaken for each other.

**Unavailable actions remain explainable.** A disabled-looking destination
must communicate whether the user can unblock it now or whether it is not yet
implemented. Native `disabled` behavior is not sufficient when it prevents the
tooltip from receiving pointer or keyboard interaction.

# Implementation notes

The rail reuses the delegated `TooltipHost` through `data-tooltip`; no new
component or dependency was introduced. Visible rail destinations, the active
project, add-project, Settings, Login, and icons-only destinations all use that
shared path.

Unavailable buttons in the visible rail now use `aria-disabled` and omit or
guard their click behavior. This keeps the reason reachable by focus while
preventing click, Enter, or Space from activating anything. Unavailable rows
inside More retain native disabled semantics because their reason is now
written directly into the row instead of hidden in an accessible name.

The project trigger and rail add button similarly guard their handlers while a
dialog blocks switching. Project tooltip copy preserves long and non-ASCII
names, with localized fallbacks for an empty display name.

Hover no longer translates or enlarges destination, project, or utility
icons. Inactive controls use the neutral hover surface; the accent-tinted
surface and green icon remain selected-state signals. Pressed feedback is a
restrained `scale(0.97)`. The reduced-motion block was simplified and an old
grouped rule that assigned the add-button rotation to unrelated controls was
split into truthful per-control transforms.

Login remains in its established position. Its localized **Coming soon**
tooltip and `aria-disabled` state explain it without suggesting that an
account is required. The collapsed jump menu writes the same reason directly.

`StatusBar.tsx`, its styles, translations, tests, and the status-bar section of
`DESIGN.md` were not changed.

# Validation

- `pnpm exec vitest run src/app/RailNav.test.tsx src/app/project-switcher/ProjectSwitcher.test.tsx src/app/App.test.tsx src/i18n/composition.test.ts --passWithNoTests`
  — passed: 48 tests across 4 files.
- In-app Chromium inspection at 1200×800 and 1024×720, light and dark themes,
  captions and icons-only modes — passed. Verified hover computed styles
  (`transform: none` on button and glyph), localized tooltip placement,
  disabled Recovery explanation, Login keyboard focus, and blocked
  Enter/Space activation. Coarse pointer and a screen reader were not directly
  exercised; their contracts remain covered by CSS/media rules and DOM tests.
- `pnpm run check` — passed: documentation over 132 Markdown files and 99 task
  ids; frontend architecture over 290 modules; TypeScript; 439 frontend tests;
  production build; Rust format and Clippy; 306 Rust tests. Rust temporary-repo
  fixtures emitted expected LF/CRLF warnings on Windows without failures.
