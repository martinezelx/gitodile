---
id: 065-9-7
title: Qualify signed upgrades and release operations
status: done
priority: high
type: hardening
areas:
  - release
  - platform
  - security
created: 2026-09-03
completed: 2026-09-16
parent: "065-9"
queue:
---

# Goal

Prove the complete updater with real signed builds before enabling production distribution.

# Context

Child of [epic 065-9](065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Exercise two successively versioned signed builds for every enabled NSIS and
  AppImage target through the normal installation path; verify running-version
  confirmation after handoff. macOS qualification is excluded and retained in
  task 065-10.
- Verify preservation of settings, sessions, volatile drafts and dirty tracked/untracked files, including other projects, active operations and helpers.
- Exercise offline, missing feed/target, corruption, cancellation, low disk space, locked/read-only installs, interrupted handoff and reinstall; test managed-package fallback accurately.
- Validate the publisher in a controlled validation path before authorizing production feed promotion. Record platform/artifact evidence, residual limits and maintainer/user runbooks.
- Hand evidence and the working pipeline to 065-8, which requalifies final 1.0.0 artifacts and all later operation/draft integrations.

# Out of scope

Git credential hardening in 065-7, the final full-product audit in 065-8, and automatic rollback guarantees.

# Acceptance criteria

- [ ] Every advertised updater target has recorded A-to-B evidence with real packages; compilation or mocks alone cannot close a platform criterion.
- [ ] No operation or draft is lost, no Git history is changed, and failed installs do not produce false success or a forced downgrade.
- [ ] Publisher readiness covers full-matrix failure, retries, immutable assets and stable/preview promotion, including anonymous access.
- [ ] All parent epic acceptance criteria map to completed child evidence; missing credentials/platform testing leave affected work explicitly unfinished.
- [ ] pnpm run check and, before publication, pnpm run check:publication pass; no 1.0.0 readiness is claimed.

# Dependencies

065-9-1 through 065-9-6 and actual package/signing environments. Qualification uses validation builds/feeds before production promotion, avoiding a publication dependency cycle.

# Implementation notes

Infrastructure implemented on `main` on 2026-09-11:

- validation builds are compile-time restricted to the active preview.4/preview.5
  pair, controlled HTTPS feed and exact matrix target; production rejects
  validation routing;
- the manual, read-only `Controlled updater qualification bundle` workflow
  verifies both complete signed matrices and creates a private, non-promoting
  feed/package bundle;
- the production registry moved to schema version 3. Its executable gate binds
  target/platform, A and B provenance/artifacts/trust, installed-version
  confirmation, preservation, failure matrix, report hash/run and macOS
  replacement-safety evidence;
- shallow, cross-target and incomplete enabled-target claims fail closed;
  Darwin claims also fail while macOS is `planned_disabled`;
- durable operation and evidence instructions live in
  [`docs/release/updater-qualification.md`](../../../docs/release/updater-qualification.md).

The task remains active. A read-only GitHub audit found no configured release
variables, secrets or protected environments and no public releases. No real
signed A/B matrix or installed-platform evidence exists, so Windows and Linux
remain `qualification_required`, both Darwin targets remain `planned_disabled`,
production remains disabled and no 1.0.0
readiness is claimed.

# Validation

Local validation on 2026-09-11: `pnpm run check` and the read-only
`pnpm run check:publication` pass. This includes 23 release tests, 859 frontend
tests, the production frontend build, strict Clippy and 397 Rust tests. The live
feedback contract was verified at public commit
`f8420b8e402558a7b04e19cf807608100806d1a0`. Record future build tags/SHAs,
platform matrix, A-to-B results, failure cases, retained installers and CI
evidence without replacing absent external facts with fixture results.

# Closure

Closed on 2026-09-16 when the updater epic was wound down: the code,
pipeline and contracts this task describes are on `main` and were
exercised by the public previews `0.2.0-preview.10` to `.12`. The
criteria left unchecked above are not claimed; every A-to-B and publisher-readiness criterion
moved to [065-9-13](../../0.7.0/065-9-13-updater-evidence-and-os-signing.md),
which owns everything the updater still has to prove.
