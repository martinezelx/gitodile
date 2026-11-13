---
id: 208
title: Apply the pending Dependabot dependency updates in one change
status: done
priority: normal
type: maintenance
areas:
  - frontend
  - desktop
  - tooling
created: 2026-10-27
completed: 2026-10-27
parent:
queue:
---

# Goal

Fold the open Dependabot pull requests that may ride on `release/0.4.1` into a
single reviewed change, so the release ships current dependencies without
seven separate merges.

# User outcome

GitOdile 0.4.1 ships with the latest patch and minor releases of its React,
Tauri and Rust dependencies, with no change in behavior.

# Context

Open Dependabot pull requests on 2026-10-27:

| PR | Update | Included |
| --- | --- | --- |
| #65 | npm minor and patch group (16 packages) | Yes |
| #60 | `vite` 8.3.1 → 8.3.3 | Superseded by #65 (8.3.5) |
| #54 | `jsdom` 29.1.1 → 30.1.1 (resolves to 30.1.3) | Yes |
| #63 | Cargo minor and patch group (8 crates) | Yes |
| #66 | `rustls` 0.23.44 → 0.23.46 | Contained in #63 |
| #52 | `minisign-verify` 0.2.5 → 0.3.0 | Yes |
| #64 | GitHub Actions group (6 actions) | No |

# Scope

- npm (`package.json`, `pnpm-lock.yaml`): `@tanstack/react-virtual` 3.14.22,
  `@tauri-apps/api` 2.12.4, `@tauri-apps/plugin-dialog` 2.8.3,
  `@tauri-apps/plugin-opener` 2.7.2, `lucide-react` 1.61.0, `react` and
  `react-dom` 19.3.1, `@iconify-json/vscode-icons` 1.2.92, `@tauri-apps/cli`
  2.12.4, `@testing-library/user-event` 14.6.8, `@types/node` 26.6.5,
  `@vitejs/plugin-react` 6.1.2, `dependency-cruiser` 18.7.0, `js-yaml` 5.5.0,
  `vite` 8.3.5, `vitest` 5.0.5 and `jsdom` 30.1.x.
- Cargo (`src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`): `tauri-plugin-dialog`
  2.8.3 (pulls `tauri-plugin-fs` 2.7.1), `tauri-plugin-opener` 2.7.2,
  `serde_json` 1.0.154, `zeroize` 1.9.1, `sha2` 0.11.1, `tokio` 1.54.1,
  `rustls` 0.23.46, `syn` 3.0.9 and `minisign-verify` 0.3.

# Out of scope

- #64 changes `.github/workflows/`. Changes to `.github/` never ride on a
  release branch, so it lands on `main` in its own pull request.
- Updates Dependabot has not proposed.

# Acceptance criteria

- [x] The included updates are applied with reproducible lockfiles.
- [x] `pnpm run check` passes.

# Relevant files

- `package.json`, `pnpm-lock.yaml`
- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
- `src-tauri/src/app_updates.rs` (the `minisign-verify` caller)

# Dependencies

None.

# Decisions

- The Cargo bumps were applied with `cargo update -p <crate> --precise
  <version>` to the versions Dependabot proposed, rather than a blanket
  `cargo update`, so the change matches the reviewed pull requests.
- `minisign-verify` 0.3 keeps the `PublicKey::decode`/`Signature::decode` API
  the update verifier uses. `tauri-plugin-updater` still depends on 0.2.5, so
  both versions sit in the lockfile until the plugin moves.

# Implementation notes

No source code changed. Once this merges, Dependabot closes #65, #60, #54,
#63, #66 and #52 as applied or superseded.

The one user-visible fix: `tauri-plugin-opener` 2.7.2 stops
`reveal_item_in_dir` panicking with "Cannot start a runtime from within a
runtime" on Linux and the BSDs. `desktop.rs` calls it from the async
`reveal_project_file` and `reveal_git_location` commands, so Show in folder
and showing where Git lives should now work there; not yet checked on Linux.

# Validation

- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `pnpm run check:docs` and `pnpm run check:frontend`: passed (156 files,
  1,753 tests).
- `pnpm run check:rust`: passed with `tauri dev` stopped (645 lib tests, 1
  ignored). A first run failed only because the running app locked
  `gitodile.exe`. A rerun with `CARGO_TARGET_DIR` pointed at a temporary
  folder failed three local-remote tests, which classified the failure as
  `AuthenticationFailed`. All three pass on the default target, so the failure
  comes from that target location, not from these updates.
