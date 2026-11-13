---
id: 167
title: Update Tauri to 2.12.3
status: done
priority: normal
type: maintenance
areas:
  - desktop
  - frontend
  - tooling
created: 2026-10-13
completed: 2026-10-13
parent:
queue:
---

# Goal

Update GitOdile's Tauri runtime and JavaScript API to 2.12.3, with compatible
build tooling and reproducible lockfiles.

# User outcome

GitOdile receives Tauri's patch fixes without changing its Git workflows.

# Context

The user requested a task and immediate implementation, then confirmed that
"Rust 2.12.3" meant Tauri. The current runtime, API and CLI resolve to 2.12.1;
the build crate resolves to 2.7.1. Rust stable is already 1.99.0.

Official [Tauri releases](https://v2.tauri.app/release/) publish independent
package versions: runtime/API 2.12.3, CLI 2.12.2 and build crate 2.7.2.
The [runtime release notes](https://v2.tauri.app/release/tauri/v2.12.3/)
include channel-delivery and Windows NSIS downgrade fixes; iOS changes do not
affect GitOdile's desktop targets.

# Scope

- Update runtime, API, CLI and build crate with focused lockfile resolution.
- Update the README's current technology inventory.
- Run the complete repository check and record platform limitations.

# Out of scope

- Compiler, plugin or unrelated dependency updates, new product behavior,
  release publication and release infrastructure changes.

# Acceptance criteria

- [x] Runtime and API resolve to 2.12.3; CLI resolves to 2.12.2 and build crate
      to 2.7.2, with both manifests and lockfiles synchronized.
- [x] Existing plugin pins and Rust channel policy are preserved.
- [x] Current documentation agrees with the resolved stack.
- [x] `pnpm run check` passes on Windows; other platform evidence is reported
      honestly without claiming local macOS/Linux qualification.

# Relevant files

- [Frontend manifest](../../../package.json)
- [Frontend lockfile](../../../pnpm-lock.yaml)
- [Rust manifest](../../../src-tauri/Cargo.toml)
- [Rust lockfile](../../../src-tauri/Cargo.lock)
- [README](../../../README.md)

# Dependencies

None.

# Decisions

- The user's immediate implementation request overrides existing queue order
  for this task. It temporarily occupies queue 24 without reprioritizing other
  work. Keep the existing clean `release/0.3.1` branch.
- Retain normal minimum-version ranges and committed lockfiles. The updater
  remains exactly pinned to 2.13.1; its separate update is not required here.
- Reviewed GitButler's smallest relevant
  [desktop manifest](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/gitbutler-tauri/Cargo.toml):
  runtime, build and plugin versions are declared independently. Retain that
  principle in GitOdile's existing dependency layout; no source is copied and
  no architectural change is needed.
- About already reads the runtime from Cargo.lock at build time, so no static
  UI attribution change or new test that duplicates version constants is needed.

# Implementation notes

Updated the four direct Tauri dependencies and both lockfiles. The Rust
resolution also updates tauri-codegen/tauri-macros to 2.7.2 and swift-rs to
1.0.9; codegen now uses the already-locked base64 0.23.1. Cargo re-resolves
some Windows dependency edges to the already-locked windows-sys 0.60.2.
No installed plugin version changes. README records runtime 2.12.3 / CLI
2.12.2, and work/README reserves the next unused task ID, 168.

This is a dependency-only patch: no Git operation, capability, release metadata,
UI interaction or architecture changes. Existing tests cover the affected
application contracts; no tests that merely repeat version constants were added.

# Validation

- `pnpm view @tauri-apps/api@2.12.3 version` and
  `pnpm view @tauri-apps/cli@2.12.2 version`: verified published npm versions.
- `cargo update --manifest-path src-tauri/Cargo.toml -p tauri --precise 2.12.3`:
  passed; focused resolution updates the runtime and required build crates.
- `pnpm install --frozen-lockfile`: passed.
- `cargo tree --manifest-path src-tauri/Cargo.toml --locked -p tauri --depth 1`:
  passed; runtime 2.12.3, build/macros 2.7.2, runtime-wry/runtime 2.12.1.
- `pnpm exec tauri --version`: tauri-cli 2.12.2.
- First `pnpm run check`: documentation, updater contracts, 52 release-script
  tests, 21 icon tests, architecture, TypeScript, 139 frontend test files /
  1,444 tests, frontend production build, Rust formatting and Clippy passed.
  Rust test compilation stopped with Windows OS error 5 because the existing
  development app was holding `src-tauri/target/debug/gitodile.exe` open.
  The frontend build retains its existing chunk-size warning.
- Repeating the full aggregate with `CARGO_TARGET_DIR` set to a separate
  temporary `gitodile-task167-target` directory avoids that file lock without
  stopping the owner's development application: passed, exit code 0.
  Documentation/contracts, architecture, TypeScript, 139 frontend test files /
  1,444 tests, frontend production build, Rust formatting, Clippy with warnings
  denied, 592 Rust library tests and the credential-helper integration test
  passed. One existing Rust library test remains ignored by the suite.
- Final `node scripts/check-docs.mjs` and `git diff --check`: passed after
  moving the task to done and clearing its queue position.
- Available host: Windows with Rust 1.99.0. No native UI flow, Linux/macOS
  runtime, installer downgrade, signed update or CI validation is claimed.
