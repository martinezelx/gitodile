---
id: 146
title: Prepare optional GitHub CLI and unify Git, GitHub and update settings
status: done
priority: normal
type: feature
areas:
  - frontend
  - platform
  - documentation
created: 2026-10-03
completed: 2026-10-03
parent:
queue:
---

# Goal

Prepare optional system GitHub CLI (`gh`) for future PRs and Actions, and give
Git, GitHub and application updates a consistent installation/status row in
Settings.

# User outcome

Users can inspect, install or update the tools on their computer, understand
what each action does, and see current results without needing a GitHub account.

# Context

This task records the implementation and subsequent user-led visual redesign
already present on `release/0.3.1`. A review of all pending code was requested
after the user tested the application locally with Tauri development mode.
Dependency readiness does not implement authentication, PRs or Actions. See
[ADR 0020](../../../docs/adr/0020-prepare-optional-github-cli-tooling.md).

# Scope

- Add a separate GitHub Settings section, official GitHub icon, local `gh`
  diagnostics, installation guidance and explicit update actions.
- Reuse fixed Git/gh native plans with independent guards and update caches;
  retain native install admission while Windows helpers are running.
- Review Git installation and update behaviour on Windows, macOS and Linux.
- Share `ToolInstallationRow` across Git, GitHub and application updates;
  include state chips, versions, contextual actions and official guides.
- Provide localized, accessible recheck controls with reduced-motion support.
- Review and validate pending implementation, tests and documentation.

# Out of scope

- GitHub sign-in, API keys, credential storage and PR/Actions screens.
- Automatic privileged package-manager execution on macOS/Linux.
- Pushing or publishing the release.
- Unrelated About/Home HTML explorations in the working directory.

# Acceptance criteria

- [x] GitHub has its own Settings section and official icon; Git remains separate.
- [x] `gh` is optional; startup only probes the local version and does not authenticate.
- [x] Windows plans use exact WinGet package IDs and a fixed source; macOS/Linux open official guidance.
- [x] Probes drain output with bounded retention; tool launch guards and caches are independent.
- [x] Shared rows display localized identities, versions, chips, actions and guidance.
- [x] Recheck controls have accessible names, feedback and reduced-motion coverage.
- [x] Update details/progress/cancellation remain reachable after closing the download dialog.
- [x] A fresh Git/gh check supersedes previous action notices, including failure results.
- [x] Regression coverage includes these two review findings.
- [x] GUI gh discovery preserves PATH precedence and covers standard macOS/Linux installation paths.
- [x] Local diagnostics invalidate stale update actions and prevent overlapping probes.
- [x] Late action receipts cannot replace the result of a newer check.
- [x] `pnpm run check` passes on the final implementation.

# Relevant files

- `src/features/settings/`, `src/features/app-updates/UpdateDialog.tsx`
- `src/shared/ui/toolInstallationRow.tsx`, `src/shared/ui/primitives.css`
- `src/app/App.tsx`, `src/app/AppOverlays.tsx`
- `src-tauri/src/tooling.rs`, `src-tauri/src/ipc.rs`, `src-tauri/src/application.rs`
- `src-tauri/capabilities/default.json`
- [Architecture](../../../docs/ARCHITECTURE.md), [Design](../../../DESIGN.md)

# Dependencies

Existing system Git tooling and application-update controller/install admission.

# Decisions

- Installing `gh` never implies authentication or enables future screens.
- The renderer sends no executable paths, package IDs or command strings.
- Windows reports installer launch, not installation success; reopening the app
  is required to inherit a changed PATH.
- The shared visual primitive has actual consumers in Settings and app updates.
- Resolve the review findings before task completion.
- The user authorized a final review and local commit on 2026-10-03.

# Implementation notes

The pending changes include four narrow native `gh` commands, Settings port and
adapter wiring, optional local readiness state, exact opener destinations,
Git/gh platform plans and tests, the separate GitHub section, official marks,
and a common row for Git, GitHub and application updates. DESIGN, README,
architecture and the IPC inventory describe the new contracts.

Review on 2026-10-03 found two issues:

1. `AppUpdateSettingsControl` disables its sole action during downloading,
   verifying and installing, even though these states have dialog details.
   Closing the download dialog leaves no Settings action to reopen progress
   and cancellation. Preserve a reachable Details action during a transfer.
2. Git's `gitActionNotice` and GitHub's `notice` take precedence over check
   results and are not reset by subsequent checks. Opening guidance or starting
   an installer, then checking for updates, can hide checking, success or error
   messages behind an old receipt. Clear or supersede receipts when starting
   a new diagnostic/update check.

The initial review did not alter the user's implementation. On 2026-10-03 the
user authorized both corrections: Details now takes precedence over the busy
fallback when a dialog host exists, and manual diagnostic/update-check actions
clear previous receipts in both tool sections. The busy fallback remains
disabled when no dialog host is provided. HTML proposals remain review
artifacts rather than application code.

Regression tests cover closing/reopening during downloading, verifying and
installing, cancelling the reopened download without starting another operation,
superseding Git/gh guide notices with pending, successful and failed update
checks, and clearing installer receipts when rechecking the local version.
DESIGN.md records the corrected interaction rules.

The final pre-commit review additionally corrected GUI `gh` discovery on
macOS/Linux: `PATH` keeps precedence, with fixed standard installation paths
tried only when the executable is missing. Broken installations are not masked
and no shell or environment mutation is introduced. See ADR 0020 for references.

Local checks now invalidate update answers when the installed version changes
or diagnostics fail, and duplicate/overlapping probes are suppressed. Action
buttons wait for local diagnostics. Both sections ignore late guide/installer
receipts after a newer action/check, preventing an old async response from
covering the current result. Regression tests exercise both tools and native
fallback precedence/failure handling.

# Validation

- User reported successful local testing with `tauri dev`.
- 2026-10-03 `git diff --check`: exit 0.
- 2026-10-03 read-only exact WinGet Git update query: exit 0, detected the
  available Git update; no installer or update was launched.
- 2026-10-03 temporary focused Vitest reproductions: 2 tests passed, confirming
  the missing Details action during download and the guide receipt masking a
  subsequent failed gh update check. The temporary test file was removed;
  these checks demonstrate current defects, not regression coverage for fixes.
- 2026-10-03 `pnpm run check`: exit 0 (documentation, frontend architecture,
  TypeScript, frontend tests/build, Rust formatting, Clippy and 487 Rust tests).
  This initial review run predates the fixes and their regression coverage.
- 2026-10-03 `node scripts/check-docs.mjs`: exit 0 after registering task 146.
- Native installation on macOS/Linux and end-to-end installer execution were
  not performed during this review; platform planner tests are not native OS qualification.
- After the fixes, the first aggregate run passed all 1,170 frontend tests,
  TypeScript/build, formatting and Clippy, but exited 101: the existing Rust
  retention test `history_recovery_names_are_create_only_and_retention_survives_reacquisition`
  hit `GitTimeout` (486 other Rust tests passed).
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features history_recovery_names_are_create_only_and_retention_survives_reacquisition`:
  exit 0; the isolated test passed in 9.53 seconds. No Rust code or timeouts changed.
- The aggregate retry with `RUST_TEST_THREADS=4` stopped in frontend tests:
  the existing ConsoleScreen shortcut test hit its 5-second deadline (1,169
  other frontend tests passed). The isolated console test passed with
  `pnpm exec vitest run src/features/console/ConsoleScreen.test.tsx -t 'keeps a command line as a shortcut' --maxWorkers=2`.
- Final `pnpm run check` with `RUST_TEST_THREADS=2` and `VITEST_MAX_WORKERS=2`:
  exit 0 (documentation, architecture, TypeScript, 119 frontend test files /
  1,170 tests, production build, Rust formatting, Clippy and all 487 Rust tests).
  Both previously timing-out tests passed in this aggregate run. Environment
  overrides applied only to the check process to reduce parallel test load;
  product code and test deadlines are unchanged.
- Final pre-commit review on 2026-10-03: focused Settings/update Vitest tests
  passed (97 tests), and `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features tooling::tests`
  passed (29 tests, including GUI fallback precedence and failure handling).
- After all final corrections, `pnpm run check` with the same process-local
  concurrency limits exited 0: documentation, architecture, TypeScript,
  120 frontend test files / 1,184 tests, production build, Rust formatting,
  Clippy and all 489 Rust tests. Additional UI regressions verify that a local
  probe disables an old update action and removes it when the version changes.
- Final review accepted for the user-authorized local commit. The four root
  HTML proposals remain untracked; no installer, push or publication was run.
