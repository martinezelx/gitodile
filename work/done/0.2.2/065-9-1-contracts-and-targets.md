---
id: 065-9-1
title: Define updater contracts and supported installations
status: done
priority: high
type: feature
areas:
  - release
  - platform
  - security
created: 2026-09-03
completed: 2026-09-09
parent: "065-9"
---

# Goal

Agree the version, channel, target and installation contracts before integrating the updater.

# Context

Child of [epic 065-9](../0.3.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Inventory current versions, package formats, app identity, supported architectures and installation locations; distinguish NSIS, macOS app bundles, AppImage, managed packages, mounted/read-only and unsupported installs.
- Define typed updater states, errors, cancellation, network and payload bounds, build-derived channel selection and immutable candidate identity. Record exact dependency choices and source evidence during implementation.
- Record production endpoint ownership, updater-key custody and backup, publisher credential scope and OS certificate requirements without secrets. Identify unavailable signing/platform resources early.
- Define forward test versions and the release contract: matching npm/Cargo/Tauri/tag/feed versions, exact merged commit in main, preview suffix and GitHub prerelease flag.

# Out of scope

No updater installation, public publication or broad Git credential diagnostics.

# Acceptance criteria

- [x] The target/install matrix states automatic-update eligibility and manual fallback for every advertised package; no untested platform is claimed supported.
- [x] Version/channel/target cases cover same/older versions, preview ordering, stable rejecting preview, missing targets and unsupported suffixes.
- [x] ADR 0010 remains the durable contract; deviations are explained there. Production credentials and platform prerequisites have owners and recorded availability, without placeholders presented as configured.
- [x] The implementation has a bounded state/error contract and a concrete two-build validation plan.

# Dependencies

Existing Tauri shell, release metadata and ADR 0010; no dependency on unfinished conflict, stash or Git credential hardening tasks.

# Implementation notes

Completed on the existing `0.2.0-preview.1` version branch after the user chose
to keep its versioning work separate from `main`.

- Added the durable
  [application-update contract](../../../docs/architecture/app-update-contracts.md)
  and its executable
  [fixture](../../../docs/architecture/065-9-1-app-update-contract.json). They fix
  exactly `stable`/`preview`, metadata/tag/feed agreement, build-derived feed
  selection, four candidate target keys, install-mode fallbacks, bounded
  states/errors/networking/notes/payloads, cancellation, and immutable native
  candidate identity.
- Selected `0.2.0-preview.2` → `0.2.0-preview.3` as the controlled future A→B
  pair. These use validation signing/feed infrastructure and cannot promote a
  production channel.
- Recorded `tauri-plugin-updater = 2.11.0` as the exact planned Rust-only
  dependency. It is deliberately not installed by this task; no renderer guest
  binding or updater/process capability was added.
- Kept Windows x64 NSIS, macOS Apple Silicon/Intel app bundles, and Linux x64
  AppImage as candidates whose automatic eligibility is
  `qualification_required`. Managed packages, mounted/read-only installs,
  unknown modes, MSI/machine-wide Windows installs, and stores use manual
  guidance. No platform is advertised as qualified.
- Tightened the existing installed-release grammar so leading-zero numeric
  identifiers, `preview.0`, leading-zero preview numbers, build metadata, and
  other prerelease suffixes are rejected.
- Updated ADR 0010 only to record the closed cancellation/candidate contract,
  the qualification gate, and the current official macOS replacement-safety
  blocker; the hosting, channel, signing, and publication decision did not
  change.
- Added the contract validator to `check:docs`. Vitest also now excludes
  `.claude/worktrees/**`, because a pre-existing ignored sibling checkout was
  otherwise discovered as part of this tree and ran stale tests against the
  current build metadata.

# Validation

- Repository inspection: npm, Cargo, Cargo lock, and Tauri agree on
  `0.2.0-preview.1`; updater plugin/config/capabilities and packaged release CI
  are absent. Existing CI only tests/compiles; `bundle.targets = "all"` is not
  support evidence.
- Authenticated GitHub metadata inspection on 2026-09-09: the public feedback
  repository exists with no releases; both planned feeds returned HTTP 404;
  the source repository exposed no Actions secrets, variables, or environments.
  Secret values were neither queried nor recorded.
- Human prerequisites still unavailable/unverified: production updater key and
  offline backup, destination-scoped publisher credential, Windows signing
  identity, Apple Developer ID/notarization access, Linux runtime baseline,
  real target qualification, and working-name clearance. These are explicit
  gates for later tasks, not unfinished criteria of this contract task.
- `node scripts/check-app-update-contracts.mjs` — passed: 10 version cases, 5
  metadata cases, and 4 candidate targets.
- `pnpm exec vitest run src/app/changelogDialog.test.tsx` — passed: 14 tests
  across 2 discovered files.
- `pnpm run check:docs` — passed over 353 Markdown files and 153 task IDs before
  moving this task; the updater contract suite passed within it.
- `pnpm run check` — passed after excluding the separate ignored worktree: 358
  frontend modules, TypeScript, 834 frontend tests in 76 files, production
  build, Rust formatting, Clippy, and 380 Rust tests.
- `git diff --check` — passed before task closure and is rerun on the final tree.
