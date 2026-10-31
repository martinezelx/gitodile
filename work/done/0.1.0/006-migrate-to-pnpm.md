---
id: 006
title: Migrate JavaScript tooling to pnpm and refresh the stack
status: done
priority: normal
type: chore
areas:
  - frontend
  - tooling
  - documentation
  - ci
  - desktop
created: 2026-07-24
completed: 2026-07-24
---

# Goal

Make pnpm 11.17.0 the supported JavaScript package manager for GitOdile, with a current Node 24 LTS and dependency stack.

# User outcome

Contributors can install, run, validate, and build the application through a current, reproducible pnpm-based workflow.

# Context

The project used npm and `package-lock.json`. The migration retained reproducible dependencies across Windows, macOS, and Linux, then consolidated the necessary Node, pnpm, JavaScript, Rust, and CI refresh work.

# Scope

- Generate and commit `pnpm-lock.yaml` and remove the npm lockfile.
- Update Node, pnpm, JavaScript dependencies, Rust-compatible dependencies, and CI actions to their current supported releases.
- Update CI, Tauri commands, local launch configuration, contributor documentation, and agent validation commands.
- Validate the frontend and Rust checks, then start the Tauri application.

# Out of scope

- Converting the repository to a pnpm workspace.
- Rewriting historical task records that mention commands used before this migration.

# Acceptance criteria

- [x] `pnpm-lock.yaml` is committed and `package-lock.json` is absent.
- [x] `package.json` pins pnpm 11.17.0 and Node 24.
- [x] CI installs with pnpm using a frozen lockfile and runs on Node 24.
- [x] Tauri and local development configuration invoke pnpm.
- [x] Setup, contributor, and agent documentation use pnpm and describe reproducible installation.
- [x] JavaScript dependencies, GitHub Actions, and all direct Rust dependencies are current and compatible.
- [x] The compatible Rust `cc` patch is applied.
- [x] Required validation checks pass and the Tauri application starts successfully.

# Relevant files

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `.github/workflows/ci.yml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`
- `README.md`
- `CONTRIBUTING.md`
- `AGENTS.md`

# Decisions

- Use Node 24, the current LTS line, instead of Node 26 Current because LTS is the production baseline.
- Use pnpm 11.17.0, which requires Node 22.13 or later and is supported by Node 24.
- Use `pnpm install --frozen-lockfile` in CI so dependency drift fails instead of changing the committed lockfile.
- Block the unused `esbuild` postinstall script through `pnpm-workspace.yaml`; Vite 8 uses Oxc for this project.

# Implementation notes

Generated `pnpm-lock.yaml` and removed `package-lock.json`. `package.json` declares pnpm 11.17.0 and Node 24 as the project baseline. CI now installs with a frozen lockfile, uses the pnpm cache, runs Node 24, and runs the frontend check through pnpm. Tauri's pre-dev and pre-build commands plus the local launch configuration use pnpm. Setup and validation commands in the documentation and operating guide now use pnpm.

Updated all JavaScript dependencies, GitHub Actions, and the available compatible Rust transitive patch (`cc` 1.3.0 to 1.4.0). TypeScript 7 required Vite's standard client type reference for the existing CSS side-effect import. Vite 8 uses Oxc instead of the deprecated esbuild minifier. The application starts successfully in Tauri development mode.

All JavaScript dependencies and GitHub Actions report current through `pnpm outdated`. Direct Rust dependencies are current. Four older Rust transitive crates are constrained by Tauri's platform-specific dependency graph and cannot be independently updated.

# Validation

- `pnpm install --lockfile-only` — pass; generated `pnpm-lock.yaml`.
- `pnpm install --frozen-lockfile` — pass with pnpm 11.17.0.
- `pnpm run check:frontend` — pass (typecheck, 4 tests, and Vite 8 production build).
- `pnpm outdated` — pass with no pending JavaScript dependency or GitHub Action update.
- `pnpm run tauri -- dev --no-watch --verbose` — remained active for more than one minute without an error or early exit; the spawned `gitodile` process was subsequently closed after the startup check.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` — pass.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features` — pass (15 tests).
- `cargo update --manifest-path src-tauri/Cargo.toml --dry-run --verbose` — no compatible updates remaining.
