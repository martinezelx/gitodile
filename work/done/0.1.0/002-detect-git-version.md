---
id: 002
title: Detect and report the installed Git version
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
created: 2026-07-23
completed: 2026-07-24
---

# Goal

Detect whether the system Git executable is available and, if so, which version is installed.

# User outcome

A user or support person can see whether GitOdile found a working Git installation instead of guessing why repository operations fail.

# Context

Split from task 001 so repository opening and dependency diagnostics remain independently testable. Later iterations also prototyped Git installation and update handling; the prototype remains in the product, while its remaining platform and UX hardening moves to tasks 004 and 005.

# Scope

- Run `git --version` from Rust without a shell.
- Reuse the Windows no-console handling.
- Render the detected version in Settings → General.
- Treat a missing Git executable as an expected result rather than a crash.

# Out of scope

- Enforcing a minimum Git version.
- Detecting or selecting among multiple Git installations.
- Hardening the guided installation flow; see task 004.
- Hardening network-dependent Git update checks; see task 005.

# Acceptance criteria

- [x] A Rust command reports whether Git is installed and its version without invoking `/bin/sh` or `cmd`.
- [x] The frontend renders the result in Settings.
- [x] Missing Git is handled as an expected diagnostic state.
- [x] Tests cover a real `git --version` call and version-string parsing.
- [x] The required frontend and Rust checks pass.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `src-tauri/src/lib.rs`
- `src/main.tsx`

# Dependencies

- Builds on the Git process-spawning pattern established in task 001.

# Decisions

- Git-missing remains non-blocking in this diagnostic task.
- The tests use the system Git executable because every repository integration test already requires Git.
- Installation and update behavior are system-changing or network-dependent workflows and are now tracked separately rather than keeping this narrowly defined diagnostic task open.

# Implementation notes

- `base_git_command()` centralizes process creation and the Windows `CREATE_NO_WINDOW` behavior.
- `git_diagnostics()` returns `{ installed, version }`.
- `parse_git_version()` removes Git's leading label from `git --version`.
- Settings displays the result alongside the GitOdile version.
- A Windows `winget` install/update prototype was subsequently added and verified for updating an outdated Git installation. It is preserved for tasks 004 and 005 to harden.

# Validation

- `cargo fmt -- --check` — pass.
- `cargo clippy --all-targets --all-features -- -D warnings` — pass.
- `cargo test` — pass.
- `npm run typecheck` — pass.
- `npm run test` — pass.
- `npm run build` — pass.
- User previously confirmed that the update prototype launched the real Git-for-Windows installer through `winget`.
