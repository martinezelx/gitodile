---
id: 005
title: Make Git update checks targeted and on demand
status: done
priority: normal
type: feature
areas:
  - rust
  - frontend
  - platform
created: 2026-07-24
completed: 2026-07-24
---

# Goal

Harden the Git-for-Windows update prototype so it is targeted, transparent, and does not add an implicit network operation to every app launch.

# User outcome

A user can deliberately check whether Git needs an update and start it with clear progress and failure states, without slowing normal startup.

# Context

Task 002 added a working prototype based on `winget upgrade`. The current check runs after startup and lists every upgradable package before searching for `Git.Git`.

# Scope

- Trigger update checks from Settings or another explicit action instead of every launch.
- Query only `Git.Git` where `winget` supports it.
- Distinguish unavailable checker, no update, update available, and failed check.
- Add timeout/cancellation appropriate for a network-dependent command.
- Cache successful results briefly.
- Prevent duplicate update launches.
- Test output/state mapping without contacting package sources or launching an updater.

# Out of scope

- Updating Git automatically.
- Updating packages other than Git.
- Building a general application updater.
- Installing Git when it is missing; see task 004.

# Acceptance criteria

- [x] Startup does not automatically run a network-dependent package query.
- [x] Update discovery targets Git instead of listing every package.
- [x] The UI distinguishes checking, unavailable, up-to-date, update available, and failed states.
- [x] Update launch remains explicit and duplicate launches are prevented.
- [x] Parser/state tests are hermetic.
- [x] Frontend and Rust checks pass.
- [x] The Windows flow is visually verified in the real desktop app.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `src-tauri/src/lib.rs`
- `src/main.tsx`

# Dependencies

- Task 002 provides the version and update prototype.
- Task 004 owns missing-Git installation behavior.

# Decisions

- Network-dependent diagnostics belong behind explicit user intent.
- Isolate any tolerant `winget` output detection behind tests.

# Implementation notes

- Removed the startup effect that called `check_git_update` whenever Git diagnostics became available. Settings initially explains that updates have not been checked and that the explicit action may contact the Windows package source.
- The check now runs only from `Buscar actualizaciones` / `Check for updates` and uses the read-only targeted query `winget list --id Git.Git -e --upgrade-available --accept-source-agreements --disable-interactivity`. The separate `winget upgrade` command is never invoked by a check.
- Rust maps the process into typed `checking`, `unavailable`, `up_to_date`, `update_available`, `failed`, and `timed_out` states. Output containing the stable `Git.Git` package ID identifies an available update; a successful empty result means Git is up to date without depending on localized prose.
- The network-dependent child process is polled and killed after 20 seconds. Successful `up_to_date` and `update_available` results are cached in memory for five minutes; unavailable, failed, and timed-out results are not cached.
- Atomic guards prevent overlapping checks and duplicate update launches. The frontend independently disables the corresponding action while each request is starting.
- `update_git` returns a typed `started`, `already_starting`, `unavailable`, or `failed` outcome. It remains a visible, explicit `winget upgrade --id Git.Git -e` mutation and is never invoked by the check.
- Unit tests assert the exact targeted arguments and cover every output/state mapping without starting `winget`, contacting package sources, or launching an updater.

# Validation

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` — pass, no warnings.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features` — pass (15 tests).
- `npm run typecheck` — pass.
- `npm run test` — pass (4 tests).
- `npm run build` — pass.
- Real Tauri desktop app on Windows: startup and Settings initially showed that updates had not been checked, confirming there was no implicit query. Pressing `Buscar actualizaciones` explicitly ran the targeted check and rendered `Git está actualizado.` for Git `2.55.0.windows.3`. The update action was not launched.
