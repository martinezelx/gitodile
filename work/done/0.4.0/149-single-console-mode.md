---
id: 149
title: Let the console run changes without a read-only mode
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
  - settings
created: 2026-10-06
completed: 2026-10-06
parent:
queue:
---

# Goal

Remove the console's read-only default and its advanced mode. Read, Local
change and Remote commands run for everyone, previewed, and only the
change-confirmation setting remains.

# User outcome

Someone can type `git commit -m "…"` or `git push` in the console of a fresh
install and get the plan and `[s/N]`, without first finding a setting and
accepting a dialog. Settings › Console has one switch, **Confirm each
change**, and the console's status line and welcome say whether it is on.

# Context

The owner questioned the three console modes on 2026-10-06: anyone can open
the system terminal and run any Git command, so a read-only default protects
nothing. The review kept what does protect something: the Never tier (the
webview is the trust boundary), the refusal of commands needing a terminal,
plans with fingerprints, and the refusal of History/Destructive commands until
recovery points exist (task 139). Recorded in
[ADR 0028](../../../docs/adr/0028-console-runs-changes-without-a-read-only-mode.md),
which replaces ADR 0017 §4. This is a standalone task, outside any epic.

# Scope

- Rust: drop `advanced_mode` from the console settings, plans and run checks;
  remove `set_console_advanced_mode`; migrate stored settings without
  widening anyone who chose read-only.
- Renderer: one switch row in Settings › Console with its turn-off dialog,
  status line and welcome confirmation labels, help footer, refusal text,
  translations, tests.
- Docs: ADR 0028, ADR 0017 note, ARCHITECTURE, README, ROADMAP, console
  shortcuts, tasks 139 and 065.

# Out of scope

- History and Destructive tiers (task 139).
- gh/glab in the console ([148-12](148-12-console-gh-and-glab-shortcuts.md)).
- A button to open the system terminal at the project folder: proposed in the
  same conversation. It needs its own per-platform launcher decision, so it was
  left for the backlog.

# Acceptance criteria

- [x] A new install plans and runs Local change and Remote commands with
      `[s/N]`; History, Destructive and Never commands stay refused.
- [x] Turning confirmations off still needs the dialog, the plan still
      prints, and a plan made without a question does not run once
      confirmations are back on.
- [x] The status line and the welcome's environment section say whether
      changes are confirmed.
- [x] A stored `advancedMode: false` never ends up without confirmations;
      the old field is not written again.
- [x] `set_console_advanced_mode` no longer exists in Rust, the execution
      inventory, the IPC contract or the renderer.
- [x] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/console/settings.rs`, `src-tauri/src/console/mod.rs`
- `src-tauri/src/ipc.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/application.rs`
- `src/features/console/confirmChanges.tsx` (was `advancedMode.tsx`), `ConsoleScreen.tsx`,
  `domain.ts`, `port.ts`, `tauriAdapter.ts`, `translations.ts`, `console.css`
- `src/app/App.tsx`, `src/app/AppOverlays.tsx`, `src/features/settings/SettingsPanel.tsx`

# Dependencies

None.

# Decisions

- 2026-10-06: keep confirmations on by default and keep turning them off
  behind a dialog. The preview and `[s/N]` are what the console offers over a
  terminal.
- 2026-10-07 (owner, before closing): no named modes. The first version of
  this task shipped two mode cards, **Ask first** and **Root**. The owner
  judged one setting does not need modes, so it became a plain switch, and
  the console's environment says whether confirmation is on.
- Migration reads `advancedMode` once: `false` forces confirmations on, so
  people who chose read-only keep being asked.

# Implementation notes

- `ConsoleModes` now carries only `confirmChanges`. `Tier::allowed` takes no
  mode. `ConsolePlan` no longer reports `advancedMode`.
- The `tier_not_allowed` refusal now only happens for History and Destructive,
  so its text always points to the guided actions.
- The status-line chip reads "confirms changes" in the success tone (the
  former read-only tone) or "no confirmation" in `--console-root`. The
  welcome's environment row "confirm" reads "before each change" or, in
  violet, "off". The mode cards and the advanced warning styles were removed.
- The translation key for the switch is `consoleConfirmChangesLabel`;
  `consoleConfirmLabel` already names the `[s/N]` prompt.

# Validation

- `cargo test --lib console`: 44 passed (includes the new settings
  migration test).
- `pnpm run check` (2026-10-06): exit 0. Docs check over 281 Markdown files
  and 199 task ids; frontend architecture over 565 modules; Vitest 130 files /
  1271 tests passed; Vite build; `cargo fmt`, Clippy; Rust 565 passed,
  1 ignored.
- Visual check in a throwaway browser harness (deleted afterwards) of the
  first two-card version: the dialog and the violet chip and welcome worked.
- The switch version was checked the same way (2026-10-07): the switch is on
  by default with the green "confirma cambios" chip and "confirmar: antes de
  cada cambio" in the welcome; turning it off opens its dialog, and
  confirming turns the chip and the welcome value violet. The Spanish welcome
  label was shortened from "confirmación" to "confirmar" because it
  overflowed the 12ch label column.
- Final `pnpm run check` (2026-10-07): exit 0. Docs 281 files / 199 task ids;
  architecture 565 modules; Vitest 130 files / 1271 tests; build; fmt;
  Clippy; Rust 565 passed, 1 ignored. A previous run timed out once in
  `copyTypography.test.ts` under load (5 s limit); it passed alone and in the
  rerun.
- Not yet validated in the running Tauri app.
