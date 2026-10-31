---
id: 004
title: Make Git installation guided and platform-aware
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
  - platform
created: 2026-07-24
completed: 2026-07-24
---

# Goal

Turn the existing Git-install prototype into a clear, testable, platform-aware recovery path when Git is missing.

# User outcome

A user without Git can understand the problem and start the correct installation path without searching for instructions or mistaking an internal app failure for a missing dependency.

# Context

Task 002 added Git detection and a Windows `winget` prototype. Installation is a separate system-changing workflow with different platform behavior and failure modes.

# Scope

- Model Git diagnostics as distinct `available`, `missing`, `unusable`, and `check_failed` states.
- Keep installation explicitly user-triggered.
- Use a targeted `winget install --id Git.Git -e` path on supported Windows systems.
- Provide deliberate macOS and Linux guidance instead of presenting a generic download page as equivalent behavior.
- Expose a refresh/retry action after installation.
- Prevent duplicate installation launches.
- Add a process-runner seam so missing Git, missing `winget`, spawn failure, and fallback selection can be tested without installing software.
- Return typed errors/results rather than presentation strings.

# Out of scope

- Bundling a Git installer.
- Elevation or UAC automation.
- Selecting among multiple Git installations.
- Updating an existing Git installation; see task 005.

# Acceptance criteria

- [x] Missing, unusable, and failed-to-check states are distinguishable in Rust and React.
- [x] Windows installation is explicit, targeted, and cannot be launched repeatedly while starting.
- [x] macOS and Linux present accurate platform-specific guidance.
- [x] The user can re-check Git availability after installation.
- [x] Process decisions are tested without triggering a real installer.
- [x] Frontend and Rust checks pass.
- [x] The flow is visually verified in the real desktop app.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `src-tauri/src/lib.rs`
- `src/main.tsx`

# Dependencies

- Task 002 provides the basic Git diagnostic and installation prototype.
- Task 001 provides the typed Rust-to-React error pattern.

# Decisions

- Installation is an explicit system mutation and must never start automatically.
- Test process planning rather than running a real installer in automated tests.

# Implementation notes

- `git_diagnostics` now returns a typed state (`available`, `missing`, `unusable`, or `check_failed`) plus an optional version. Process-output mapping is isolated in a pure helper so every state can be tested without changing the machine's Git installation.
- `install_git` now returns a typed outcome (`started`, `guidance`, `already_starting`, or `failed`) and platform (`windows`, `macos`, `linux`, or `unsupported`), with a platform-specific guidance URL when an in-app installer is not appropriate.
- Windows keeps the explicit targeted command `winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements`. It is only launched after the user presses Install; an atomic guard rejects overlapping start requests, and the frontend also disables the action while the command is starting.
- Missing `winget` falls back to the official Windows Git instructions. macOS and Linux deliberately open their respective official installation pages with copy explaining that the user must choose the appropriate native/package-manager method.
- Settings renders each diagnostic separately and exposes `Check again` for every non-available state. The action re-invokes the diagnostic without requiring an application restart.
- Installation planning tests cover Windows success, missing `winget`, spawn failure, and macOS/Linux guidance without executing an installer or contacting a package source.

# Validation

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` — pass, no warnings.
- `cargo test --manifest-path src-tauri/Cargo.toml` — pass (13 tests).
- `npm run typecheck` — pass.
- `npm run test` — pass (4 tests).
- `npm run build` — pass.
- Real Tauri desktop app on Windows: verified the available state with Git `2.55.0.windows.3`.
- Real Tauri desktop app with a process-local `PATH` that intentionally excluded Git: verified the Spanish missing-Git explanation, explicit `Instalar Git` action, and `Comprobar de nuevo` retry. Retrying preserved the correct missing state. The installer itself was deliberately not launched because validation must not mutate the test machine.
