---
id: 003
title: Expand Settings with Git identity, startup, safety, and language controls
status: done
priority: normal
type: feature
areas:
  - rust
  - frontend
created: 2026-07-24
completed: 2026-07-24
---

# Goal

Grow Settings beyond Appearance/General with four concrete, independently useful sections: Git identity (name/email used for saved versions), startup behavior (reopen last project), a safety confirmation before closing a project, and a Language setting (English/Spanish, auto-detected from the system, overridable in Settings).

# User outcome

A user can tell GitOdile who they are for the commits it will eventually create, does not have to re-open their project by hand every time they launch the app, gets a chance to back out if they click "Close project" by mistake, and sees GitOdile in their own language automatically — with the ability to override that choice — instead of being stuck with English regardless of their system locale.

# Context

`docs/PRODUCT_STRATEGY.md` names GitHub Desktop, GitButler, Fork, Tower, and GitKraken as the competitive set to study. All of them expose Git identity (name/email) and startup/session behavior in Settings; most also gate destructive-ish actions behind a confirmation, matching this project's own "Safety before cleverness" principle in `AGENTS.md`.

The user picked three areas to build now, out of a broader comparison: Git identity, safety confirmations, and startup behavior. External editor/terminal integration was explicitly deferred — there is no flow yet that opens files externally, so it would have no consumer.

Two of the three chosen areas needed narrowing to stay concrete instead of speculative:

- "Safety confirmations" has no destructive action to attach to yet (no discard, no delete, no history rewrite — none of that exists in the app). The only real candidate today is "Close project", which isn't destructive (it doesn't delete anything) but is the one action a confirmation can meaningfully guard right now. Scoped to that single action rather than building a general confirmation framework with no other consumer.
- "Startup behavior" (reopen last project) depends on remembering the last opened project. `work/backlog.md` lists "Persist and reopen recent projects" separately under Foundation, implying a fuller recent-projects list/UI. This task only persists the single last-opened path (localStorage, not Rust-side) to support one toggle — it is not the full recent-projects feature.

## Added scope: Language (English/Spanish)

The user asked to add a Language setting to this same task: GitOdile should support English and Spanish, auto-detect the system language on first run, and let the user override it in Settings — mirroring how `theme` already works (`ThemePreference = "system" | "light" | "dark"`, persisted in `localStorage`, with a segmented control in Settings → Appearance).

**Audit made before scoping this in** (`src/main.tsx`, `src-tauri/src/lib.rs`):

- There was initially **zero i18n infrastructure**. Every user-facing string was a hardcoded English literal directly in JSX/TSX.
- A meaningful subset of user-facing text was **generated in Rust, not React**, and returned as English prose. Task 001 now replaces that boundary with structured error codes and typed repository state so React owns localization.
- This task initially covered React-owned strings. Task 001 subsequently supplied structured Rust codes so the same translation layer could localize repository and identity errors without duplicating presentation prose in Rust.

# Scope

- Rust: `get_git_identity` (reads global `user.name`/`user.email` via `git config --global --get`, each independently optional/unset) and `set_git_identity(name, email)` (writes both via `git config --global`).
- Settings → new "Git identity" section: two text inputs (name, email) pre-filled from `get_git_identity`, a Save button, and a short explanation that this is used to sign saved versions and is a normal global Git setting, not a GitOdile-only preference.
- Frontend: persist the path of the most recently opened project in `localStorage` whenever `open_repository` succeeds.
- Settings → new "Startup" section: a toggle "Reopen last project on launch". When enabled and a stored path exists, the app calls `open_repository` with it once on launch; a failure (folder moved/deleted/no longer a repo) is handled the same as any other open failure — silently cleared, no error toast on launch.
- Settings → new "Safety" section: a toggle "Confirm before closing a project" (default on). When enabled, clicking "Close project" (from Overview or the command palette) shows a confirmation dialog before actually clearing the open project; when disabled, it closes immediately as it does today.
- A minimal, hand-rolled i18n layer: a `LanguagePreference` type (`"system" | "en" | "es"`, mirroring `ThemePreference`), a translation dictionary keyed by every React-owned user-facing string (nav, command palette, all Settings sections including the three added by this task, About dialog, close-confirmation dialog, empty/error states, button labels, and every `title`/`aria-label` attribute — not just visible text), and a small `t()` accessor exposed via React context, replacing the hardcoded English literals in `src/main.tsx`.
- System-language detection: read the OS locale via `@tauri-apps/plugin-os`'s `locale()` (new dependency; more reliable than the webview's `navigator.language` for a desktop app), falling back to `navigator.language` when running outside Tauri (same "`__TAURI_INTERNALS__` in window" fallback pattern already used for `appWindow`). Normalize to a primary subtag (e.g. `"es-MX"` → `"es"`) and match against the supported set `{en, es}`; anything else (e.g. `"fr"`, `"de-DE"`) falls back to English. This resolution is a pure function and gets a unit test — the first real `vitest` test in the repo (currently `npm run test` finds none).
- Settings → new "Language" section: a segmented control (System / English / Español), visually identical to the existing Appearance/Theme control, persisting the explicit choice to `localStorage` and re-rendering all translated strings immediately (no restart required).

# Out of scope

- Per-repository Git identity overrides (`user.name`/`user.email` scoped to one repo instead of global).
- A full recent-projects list/switcher (`work/backlog.md`, Foundation) — only the single last-opened path needed for the startup toggle.
- Confirmations for any other action (there are no other destructive actions implemented yet).
- External editor/terminal integration — explicitly deferred by the user.
- Validating email format beyond "non-empty" — Git itself doesn't require a syntactically valid email.
- Refactoring Rust-originated strings inside this task. That architectural change is implemented by task 001, whose typed result/error codes are consumed by this task's translation layer.
- Any language beyond English/Spanish.
- A language picker/dropdown with every locale name spelled in its own language, region-specific dialects (e.g. separate `es-MX` vs `es-ES` copy), or right-to-left layout support — only two flat languages, no regional variants.
- Pluralization-aware translation libraries such as ICU MessageFormat. The small number of interpolated values is handled by typed dictionary functions.

# Acceptance criteria

- [x] `get_git_identity`/`set_git_identity` Rust commands exist, don't shell out through `/bin/sh`/`cmd`, and are covered by simple tests (parsing/round-trip against a temp global config, or an equivalent isolation strategy that doesn't mutate the real machine's global Git config).
- [x] Settings shows the current global name/email (or empty state) and can save new values.
- [x] The last successfully opened project's path is persisted locally.
- [x] With the startup toggle on, relaunching auto-opens the last project if it's still valid; if it isn't, the app falls back to the normal empty state without an error toast.
- [x] With the safety toggle on (default), closing a project asks for confirmation first; with it off, closing is immediate.
- [x] The required frontend and Rust checks pass.
- [x] Visually verified in the real desktop app: saving identity, the startup auto-reopen (including the stale-path fallback), and the close confirmation (validated by user confirmation on 2026-07-24).
- [x] Every React-owned user-facing string (including `title`/`aria-label` attributes, not just visible text) is routed through the translation dictionary — no leftover hardcoded English literal outside it (verified by grepping `src/main.tsx` for capitalized multi-word literals after the change: none left outside `i18n.tsx`, brand name, and version numbers).
- [x] On first launch with no stored preference, the app renders in Spanish when the OS locale is Spanish and in English for unsupported locales. Both browser fallback and native Tauri locale resolution have been verified.
- [x] Settings → Language shows System/English/Español, and choosing one immediately re-renders the app in that language and persists across restarts, overriding auto-detection.
- [x] The locale-resolution function (system locale string → `"en" | "es"`) has a passing unit test covering at least: an `es-*` locale, an `en-*` locale, and an unsupported locale (e.g. `fr-FR`) falling back to English.
- [x] The document `<html lang>` value follows the resolved application language for assistive technology.
- [x] Git identity copy describes authorship accurately and does not imply cryptographic commit signing.
- [x] Asynchronous open/install/identity feedback is announced through alert/status live regions.
- [x] The required frontend checks (`npm run typecheck`, `npm run test`, `npm run build`) pass with the language feature included.
- [x] Visually verified in the real desktop app: the close-confirmation dialog's translated, name-interpolated body with a real open project (validated by user confirmation on 2026-07-24).

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/PRODUCT_STRATEGY.md`
- `work/backlog.md`
- `src-tauri/src/lib.rs`
- `src/main.tsx`
- `src/styles.css`
- `src-tauri/Cargo.toml` / `src-tauri/capabilities/default.json` (new `tauri-plugin-os` dependency + capability, for locale detection)
- `package.json` (new `@tauri-apps/plugin-os` dependency)

# Dependencies

- Builds on the `git_command`/`base_git_command` process-spawning pattern from tasks 001/002.
- Language detection depends on adding `tauri-plugin-os`/`@tauri-apps/plugin-os`, the same "add the plugin, keep its capability minimal and explicit" pattern already used for `tauri-plugin-dialog` (task 001) and `tauri-plugin-opener` (task 002).

# Decisions

- Global-only identity, no per-repo override — matches this task's scope; per-repo identity is a plausible later task, not bundled here.
- Reopen-on-launch persists only the last path in `localStorage`, not a full recent-projects list — keeps this task independent of the separate, unbuilt "Persist and reopen recent projects" backlog item.
- The only confirmation built now guards "Close project" — the sole existing action a confirmation can attach to; a general confirmation framework for hypothetical future destructive actions was rejected as speculative.
- **Hand-rolled i18n, not a library** (no `react-i18next`/`react-intl`/`lingui`): two languages, no plurals, and only simple interpolation do not justify a full i18n library yet. Typed dictionary functions handle project names and branch names.
- **OS locale via `tauri-plugin-os`, not `navigator.language` alone**: the webview's reported language can drift from the actual OS setting depending on platform/embedding; the plugin reads the real system locale, matching how this app already prefers native/platform-accurate signals (e.g. `git_diagnostics` over guessing, `winget` for installs) over web-only approximations. `navigator.language` remains the fallback when there's no Tauri runtime (browser dev/testing), consistent with the existing `"__TAURI_INTERNALS__" in window` fallback for `appWindow`.
- **Rust-originated strings were not translated directly**: task 001 changed them into structured error codes and typed repository state, allowing React to localize results without depending on raw English prose.
- **Preference persistence mirrors `theme` exactly**: `LanguagePreference = "system" | "en" | "es"`, its own `localStorage` key, same `system`-resolves-to-a-concrete-value shape as `ThemePreference`/`readStoredTheme`/`applyTheme` — reusing an already-established, working pattern instead of inventing a new one.

# Implementation notes

- `src/i18n.tsx` (new file): `Language` (`"en" | "es"`), `LanguagePreference` (`"system" | Language`), the pure `resolveLanguage(locale)` function (splits on `-`/`_`, matches the primary subtag against `es`, defaults to `en`), a flat `Translations` interface (one property per string/attribute — no nested keys or dot-path lookups, since with two flat languages and no plurals a plain object is simpler and fully type-checked), the `en`/`es` dictionaries, and `LanguageProvider`/`useLanguage()` (React context exposing `{ languagePreference, setLanguagePreference, language, t }`). `LANGUAGE_NAMES` (`{ en: "English", es: "Español" }`) is a separate, non-translated constant — language autonyms are shown the same regardless of the active UI language, same convention as virtually every OS/app language picker.
- Detection: `LanguageProvider` calls `@tauri-apps/plugin-os`'s `locale()` in a `useEffect`, resolving it through `resolveLanguage` and updating `systemLanguage`; the initial state is `resolveLanguage(navigator.language)` so there's a sensible value before the (async) plugin call resolves, and so the app still gets a real auto-detected language when running outside Tauri (browser dev/testing) — the plugin call there simply rejects and is swallowed, same `.catch(() => undefined)` idiom used elsewhere in this codebase.
- `src-tauri/Cargo.toml` / `src-tauri/capabilities/default.json` / `src-tauri/src/lib.rs`: added the `tauri-plugin-os` crate, registered `.plugin(tauri_plugin_os::init())`, and granted only `os:allow-locale` (not the broader `os:default`) — same "narrowest permission that does the job" pattern as the existing `dialog:allow-open`/`opener:allow-open-url` entries.
- `package.json`: added `@tauri-apps/plugin-os` (JS side of the same plugin).
- `src/main.tsx`: every hardcoded string (nav labels, titlebar, command palette, all five Settings sections including the new "Language" one, About dialog, close-confirmation dialog, empty/error states, and every `title`/`aria-label` attribute) now reads from `t` via `useLanguage()`, called directly in `App`, `CommandPalette`, `OverviewPanel`, and `SettingsPanel` (no prop-drilling needed since `LanguageProvider` wraps the whole tree). `THEME_LABELS` (a static English-only lookup) was removed in favor of reading `t.commonSystem`/`t.themeLight`/`t.themeDark` directly. Settings → Language is a fifth `segmented-control` section, visually identical to Appearance/Theme, iterating `LANGUAGE_ORDER = ["system", "en", "es"]`.
- Root render: `<App />` is now wrapped in `<LanguageProvider>`.
- `src/i18n.test.ts` (new file, first real `vitest` test in this repo): covers `resolveLanguage` for Spanish/English regions, an unsupported locale (`fr-FR`, `de`) falling back to English, and null/undefined/empty input.
- `LanguageProvider` updates `document.documentElement.lang` whenever the resolved language changes.
- Identity descriptions now say name/email identify the author of saved versions; commit signing is a separate Git concept.
- Deliberately **not** routed through the dictionary: the `GitOdile` brand name and `APP_VERSION`. Identity placeholders use the same example person in both dictionaries.

- `src-tauri/src/lib.rs`: added `get_git_identity`/`set_git_identity` Tauri commands, backed by `read_global_git_config`/`write_global_git_config` helpers that shell out to `git config --global [--get] <key>`. Both accept an optional `config_override` (sets `GIT_CONFIG_GLOBAL` on the child process) so tests can round-trip through a temporary config file instead of touching the real machine's `~/.gitconfig`; production commands always pass `None`. `set_git_identity` rejects blank name/email with a plain-language error before touching git.
- `src/main.tsx`: `SettingsPanel` gained three sections — "Git identity" (two text inputs pre-filled from `get_git_identity`, Save button, inline save/error message), "Startup" (`ToggleSwitch` for "Reopen last project on launch"), and "Safety" (`ToggleSwitch` for "Confirm before closing a project"). Added a small reusable `ToggleSwitch` component (`role="switch"`, click toggles a boolean) styled in `src/styles.css` (`.toggle-switch`).
- `App`: persists the opened project's path to `localStorage` (`gitodile-last-project-path`) on every successful `open_repository`; a one-time effect on mount auto-calls `open_repository` with that stored path when the reopen-last-project toggle is on, clearing the stored path silently (no error toast) if it fails. "Close project" (Overview button and command palette) now goes through `requestCloseProject`, which opens a confirmation dialog (same visual pattern as the existing About dialog, with Escape/focus handling) when the safety toggle is on, or closes immediately when it's off; closing also clears the stored last-project path so a disabled/declined reopen doesn't linger.
- `src/styles.css`: added `.identity-fields`/`.text-field` (two-column on desktop, single column under 800px), `.toggle-switch` (+`--on` state), `.settings-section__footer`, and `.dialog-actions`.
- Follow-up UI hardening from the UI audit: modals now trap Tab/Shift+Tab, close with Escape, and return focus to their invoker; the command palette exposes its active option with `aria-activedescendant` and keeps Tab in its single-input interaction model. At narrow widths, visible Overview/Settings navigation replaces the hidden sidebar, and coarse-pointer toggle switches meet a 44px target height. The global font stack now follows `DESIGN.md`'s system-font direction; sidebar-collapse transitions no longer animate layout properties.
- Git identity now enters a protected read-only state after a successful save (or when a complete global identity already exists). The user can deliberately choose “Edit identity” / “Modificar identidad” to unlock the two fields; incomplete identities and save failures remain editable.

# Validation

- `cargo fmt -- --check` — pass.
- `cargo clippy --all-targets --all-features -- -D warnings` — pass, no warnings.
- `cargo test` — 11 passed, 0 failed in the current tree (the identity tests use `GIT_CONFIG_GLOBAL` overrides and never touch the real global config).
- `npm run typecheck` — pass.
- `npm run test` — pass (no test files yet, same as before this task).
- `npm run build` — pass.
- Verified in the browser preview (`npm run dev`, outside Tauri): all four new sections render with the expected copy; toggling "Reopen last project on launch" flips `aria-checked` and persists `gitodile-reopen-last-project`/`gitodile-confirm-close-project` in `localStorage`; saving Git identity without a Tauri backend fails gracefully with "Couldn't save that." (no crash, no console error) — the same graceful-outside-Tauri pattern as the existing Install Git button.
- Identity, startup auto-reopen, stale-path fallback, and close confirmation were validated by user confirmation on 2026-07-24; the language-specific verification is recorded below.

## Language validation

- `cargo fmt -- --check` — pass.
- `cargo clippy --all-targets --all-features -- -D warnings` — pass, no warnings (with the new `tauri-plugin-os` dependency).
- `cargo test` — 11 passed, 0 failed in the current tree.
- `npm run typecheck` — pass.
- `npm run test` — **4 passed** (`src/i18n.test.ts`, the first real test file in this repo): Spanish regions (`es`, `es-ES`, `es-MX`, `es_MX`) resolve to Spanish; English regions resolve to English; unsupported locales (`fr-FR`, `de`) and empty/null/undefined input fall back to English.
- `npm run build` — pass.
- Verified in the browser preview (`npm run dev`, outside Tauri, so via the `navigator.language` fallback rather than `tauri-plugin-os`): the app auto-rendered in Spanish on first load (this machine's browser locale); every Settings section, the empty-state Overview, and the About dialog rendered fully translated; switching Settings → Language to English re-rendered every string immediately (no reload) and persisted `gitodile-language: "en"` in `localStorage`, surviving a manual reload; switching back to Spanish (via `localStorage` + reload, to double-check without relying on the same click path) also rendered correctly.
- Verified in the real Tauri desktop app: choosing Language → System resolved the native Windows locale to Spanish and immediately translated visible text and accessible names.
- Real desktop verification of saving identity and startup/close behavior, including the translated `closeConfirmBodyNamed` body with an open project, was validated by user confirmation on 2026-07-24.
- Follow-up UI hardening validation: `pnpm run typecheck`, `pnpm run test` (4 passed), and `pnpm run build` passed. Browser-preview verification covered the command palette, 1280px settings layout, and 800px compact navigation; real-Tauri verification remains outstanding.
