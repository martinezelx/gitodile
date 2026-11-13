---
id: 145
title: Update Rust and the React and Tauri dependencies to current stable releases
status: done
priority: normal
type: maintenance
areas:
  - frontend
  - desktop
  - tooling
created: 2026-10-02
completed: 2026-10-05
parent:
queue:
---

# Goal

Update the local Rust toolchain and the project's React and Tauri dependencies
to the latest compatible stable releases available when this task is executed,
with reproducible lockfiles and verified desktop behavior.

# User outcome

GitOdile uses maintained compiler and desktop dependencies while preserving its
existing Git safety, project workflows and signed application-update behavior.

# Context

The user approved this task on 2026-10-02 after discussing Rust 1.99.0,
released on 2026-10-01. The local compiler is Rust 1.97.1; the repository's
`rust-toolchain.toml` already selects `stable` with Clippy and rustfmt.

Initial inventory on 2026-10-02, checked against the lockfiles, npm's `latest`
metadata and crates.io's `max_stable_version`:

| Component | Current resolved version | Latest stable observed |
| --- | --- | --- |
| Local Rust | 1.97.1 | 1.99.0 |
| React / React DOM | 19.3.0 / 19.3.0 | 19.3.0 / 19.3.0 |
| React / React DOM types | 19.3.0 / 19.3.0 | 19.3.0 / 19.3.0 |
| Tauri Rust runtime | 2.11.6 | 2.12.1 |
| Tauri build crate | 2.6.3 | 2.7.1 |
| Tauri JavaScript API | 2.11.1 | 2.12.1 |
| Tauri JavaScript CLI | 2.11.5 | 2.12.1 |
| Dialog plugin (Rust / JavaScript) | 2.7.3 / 2.7.3 | 2.8.1 / 2.8.1 |
| Opener plugin (Rust / JavaScript) | 2.5.5 / 2.5.5 | 2.7.0 / 2.7.0 |
| OS plugin (Rust / JavaScript) | 2.3.2 / 2.3.2 | 2.4.0 / 2.4.0 |
| Updater plugin (Rust only, exact pin) | 2.11.0 | 2.13.1 |

React is already current at task creation; recheck it at execution time and
record a no-op if it remains current. Package versions in the Tauri ecosystem
are independent; use supported combinations rather than forcing every package
to the same version.

Sources: [Rust 1.99 announcement](https://blog.rust-lang.org/2026/10/01/Rust-1.99.0/),
[React versions](https://react.dev/versions),
[Tauri releases](https://v2.tauri.app/release/),
[npm registry](https://registry.npmjs.org/react/latest) and
[crates.io registry](https://crates.io/api/v1/crates/tauri).

The updater's exact pin is intentional. Its client configuration and HTTP
dependency are part of the safety boundary described in the
[application-update contracts](../../../docs/architecture/app-update-contracts.md).
Upgrade it only after reviewing the target source and testing those contracts.

# Scope

- Recheck stable versions and official release notes; record before/after
  resolved versions and any compatibility concerns.
- Update local Rust stable with `rustup update stable`; retain the existing
  channel policy and record the resulting Rust, Cargo, Clippy and rustfmt versions.
- Update React, React DOM and their type packages together if newer compatible
  stable versions exist.
- Update the Tauri runtime, build crate, JavaScript API and CLI, and installed
  dialog, opener and OS plugins in compatible combinations. Update both lockfiles
  with focused dependency resolution, avoiding unrelated dependency churn.
- Review and update the Rust updater plugin's exact pin deliberately. Verify
  its HTTP client configuration, redirect/timeout policy, error classification,
  manifest handling, cancellation, signature validation and installation gate.
  Review the smallest relevant public GitButler implementation if this requires
  changes to asynchronous work, recovery, packaging or Tauri/Rust boundaries,
  following the repository's external-reference rules.
- Fix regressions caused by these upgrades, including new compiler/Clippy
  diagnostics, without broad refactors or suppressing meaningful checks.
- Update current dependency documentation, updater source references and
  generated attribution/license metadata where affected; retain historical
  performance baselines as historical evidence.
- Validate development startup, production compilation and affected desktop
  flows. Record available Windows evidence and obtain CI evidence for the
  Windows, macOS and Linux checks before claiming cross-platform compatibility.

# Out of scope

- Unrelated dependency updates, new UI features, React Compiler adoption,
  edition migration or speculative performance rewrites.
- Publishing, tagging or installing a GitOdile release as part of planning.
- New branches or worktrees unless requested. If CI or release-script changes
  become necessary, land them separately on main under the existing release rules.

# Acceptance criteria

- [x] Latest stable versions are rechecked at execution time and the final
      before/after inventory records every updated or deliberately retained item.
- [x] Rust stable is updated and Clippy/rustfmt are installed; the project's
      existing toolchain policy remains consistent with CI.
- [x] React and its paired packages are updated if applicable, or documented
      as already current.
- [x] Tauri and installed plugins use compatible stable releases and both
      lockfiles reproduce the selected versions.
- [x] The updater source review and existing contract tests support its new
      exact pin; any incompatible upgrade is explicitly documented with evidence
      and follow-up work rather than silently weakening the safety boundary.
- [x] Current docs and generated attribution data agree with resolved dependencies.
- [x] The app starts in Tauri development mode; project opening, changes/diffs,
      save-version planning, dialogs, external links, OS diagnostics and update
      checking behave as expected. Relevant errors, disabled states and keyboard
      interactions are checked without publishing or mutating user projects.
- [x] `pnpm run check` passes on the selected toolchain.
- [x] The owner confirms validation and accepts closure (2026-10-05).
      This supersedes the previous requirement to obtain CI evidence before
      task closure; no additional CI evidence was independently verified.

# Relevant files

- [Toolchain](../../../rust-toolchain.toml)
- [Frontend dependencies](../../../package.json)
- [Frontend lockfile](../../../pnpm-lock.yaml)
- [Rust dependencies](../../../src-tauri/Cargo.toml)
- [Rust lockfile](../../../src-tauri/Cargo.lock)
- [Native updater](../../../src-tauri/src/app_updates.rs)
- [Application-update contracts](../../../docs/architecture/app-update-contracts.md)
- [README](../../../README.md)
- [Architecture](../../../docs/ARCHITECTURE.md)

# Dependencies

None. Execute under the existing release-branch and queue conventions.

# Decisions

- Created at queue position 24. The user then explicitly requested immediate
  implementation on 2026-10-02, overriding queue order for this task without
  reprioritizing the other tasks. Work stays on `release/0.3.1`.
- Update stable releases only. Keep an explicit updater pin after source review.
- Evaluate passive compiler benefits without claiming measured performance gains.

# Implementation notes

Implemented and locally validated on 2026-10-02. Every target in
the initial inventory is now the resolved version, except React/React DOM
and their types, which remain at the already-current 19.3.0.

- Updated npm minimum version ranges and Rust manifest minimum versions for
  the installed Tauri packages. Kept the updater pinned exactly to 2.13.1 and
  retained the project's Rust `stable` channel and Rust 2021 edition.
- Rust is 1.99.0, Cargo 1.99.0, Clippy 0.1.99 and rustfmt 1.10.0-stable.
  `rustup update stable --no-self-update` succeeded; it reported one temporary
  file cleanup warning (Windows access denied), with all component versions
  verified afterward.
- The focused lockfile update includes Tauri's required transitive changes.
  `cargo tree --locked -i reqwest --depth 1` confirms one Reqwest 0.13.5,
  shared by the app's type-level dependency and the updater plugin.
- Reviewed the official updater 2.11.0-to-2.13.1 source changes, including
  `Cargo.toml`, `config.rs`, `error.rs`, checks, downloads, verification and
  Windows/Linux installation. Added handling and a regression test for
  `SignedVersionMismatch` and `MissingSignedVersion`: verification-stage
  `signature_invalid`, non-retryable, without untrusted version strings in
  the error detail. The existing client callback, signature verification,
  app-owned cancellation and installation admission remain in effect.
- `requireSignedVersion` remains false by default to preserve compatibility
  with earlier signed releases. No release scripts, signing keys, capabilities,
  update targets, feed or release channel changed.
- Studied the smallest relevant GitButler references:
  [desktop dependencies](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/gitbutler-tauri/Cargo.toml)
  and [update checks](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/but-update/src/check.rs).
  Their explicit timeout, development-build behavior and check coordination
  support retaining GitOdile's existing bounded, app-owned lifecycle. No
  external implementation or assets were copied; no architecture change or
  new ADR was needed.
- Updated README and current updater contracts. About credits derive from
  resolved dependencies at build time and require no static attribution edits.

# Validation

- Baseline `pnpm run check` before the new dependency verification completed
  successfully: 1,142 frontend tests and 479 Rust tests.
- `pnpm install --frozen-lockfile`: passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`:
  passed on Rust 1.99.0.
- `pnpm run check:frontend`: passed with 118 test files / 1,142 tests and a
  successful production frontend build. Existing chunk-size/dynamic-import
  build warnings remain; no unrelated bundling refactor was made.
- `node scripts/check-app-update-contracts.mjs`: passed against the new pin.
- Real Windows Tauri dev smoke validation used a temporary config with
  identifier `app.gitodile.validation145` and a disposable Git project:
  initial empty/disabled state, native folder selection and loading state,
  project overview, one-file diff, title entry, saving one version, resulting
  clean state, Settings, update-check unavailable state, Escape dismissal,
  OS/WebView/Git diagnostics, and the Tauri external link all behaved correctly.
  About displayed Tauri 2.12.1, React 19.3.0 and Rust 1.99.0. The temporary
  development process was stopped after validation. Production download/install
  was not exercised: this unsigned development build has no embedded update key.
- A first aggregate recheck was interrupted after frontend wait-time failures
  while compiling the production executable concurrently. The production build
  was also stopped. The unchanged frontend passed when the aggregate was rerun
  with builds serialized; no timeout increases or test suppressions were added.
- Final `pnpm run check`: passed on Rust 1.99.0, with 118 frontend test files /
  1,142 tests and 480 Rust tests, including the new signed-version error test.
  Documentation, architecture, TypeScript, frontend production build, Rust
  formatting and Clippy with warnings denied all passed.
- `pnpm run tauri build --no-bundle --config src-tauri/tauri.unsigned.conf.json`:
  passed; the optimized Windows executable was produced at
  `src-tauri/target/release/gitodile.exe`. No installer or update publication
  was performed.
- Windows is the available host. Linux/macOS CI and real signed A-to-B
  installation evidence are unavailable locally; no remote push or release
  publication was performed. This task remains active while its final
  validation criterion is incomplete.

## Status review (2026-10-05)

The dependency update is implemented and has recorded local Windows
validation. No CI run was found for release/0.3.1. The successful
[main run](https://github.com/martinezelx/gitodile-desktop/actions/runs/36919059133)
and [recent Dependabot run](https://github.com/martinezelx/gitodile-desktop/actions/runs/37267470925)
do not validate this update: the latter still pins the updater to 2.11.0,
whereas this task selected 2.13.1. Keep the cross-platform CI criterion
unchecked and the task active until evidence covers the upgraded versions.

## Owner-confirmed closure (2026-10-05)

The owner explicitly confirmed that tasks 131 and 145 are validated and
requested moving both to done. This confirmation supersedes the active-status
conclusion in the review above. No new platform or CI results are claimed
by the agent; historical evidence and its limitations remain recorded.

Closure checks: documentation, icon contracts, architecture, TypeScript,
1,236 frontend tests, frontend production build, Rust formatting and Clippy
passed. The aggregate `pnpm run check` stopped during Rust test compilation:
Windows denied removal of `src-tauri/target/debug/gitodile.exe` (OS error 5).
The Rust tests were not completed in this closure run.
