---
id: 065-9-13
title: Record the remaining updater evidence and add OS signing
status: active
priority: normal
type: hardening
areas:
  - release
  - automation
  - documentation
created: 2026-09-16
completed:
parent: "065-9"
queue: "03"
---

# Goal

Everything that was still open across the updater epic when it was closed on
2026-09-16, in one place: the real installed A-to-B evidence for Windows and
Linux, the publisher evidence a production approval needs, the qualification
registry and working-name clearance that turn `testing` into `production`,
and OS-level
signing (SignPath Foundation) for every release. The code, pipeline and
contracts are delivered; what remains is evidence, operations and one signing
integration.

# User outcome

- Windows and Linux users can trust that an in-app update was proven on real
  installations, not only in tests, and Windows users stop seeing
  unknown-publisher/SmartScreen warnings once OS signing lands.
- Releases stop carrying the "Testing release" notice once the registry
  proves both targets.

# Context

On 2026-09-16 the maintainer closed epic 065-9 and its children 065-9-5 through
065-9-11 as done: the signed-build pipeline, merge-driven coordinator, public
publisher, native updater, tag-dated What's new and
notes-from-highlights automation are all on `main`, and `0.2.10`, `.11` and
`.12` were built, published and installed through the public feed. Their unchecked acceptance criteria were evidence and
operations items, not code, and are consolidated here so the epic's history
stays honest. Task 142 (2026-10-01, ADR 0019) then replaced the two channels
with one: every release is `X.Y.Z` and publishes under the `testing` policy
— Tauri updater signature only — until this task completes.

The plan for OS signing changed with that decision: instead of Authenticode
only after `1.0.0` (task 065-9-9, ADR 0011), the maintainer intends to apply
for SignPath Foundation and sign every release once the application is
accepted. ADR 0011 must be amended when that happens.

Evidence rules do not change: a compile-only artifact, a mocked replacement
or a test fixture never closes a platform criterion; only real installed
transitions between two public releases do, recorded against the schema-4
registry described in `docs/release/updater-qualification.md`.

# Scope

## A. Installed A-to-B evidence (from 065-9-7 / 065-9-8)

- For each enabled target (Windows x86-64 per-user NSIS, Linux x86-64
  AppImage), record one real A-to-B transition between two consecutive public
  releases served through the public feed: OS version, architecture, install
  path class (including one path with spaces/non-ASCII), settings, sessions,
  volatile drafts, dirty tracked and untracked files, another open project, an
  active operation and a helper all preserved; Git history unchanged.
- Record the required failure matrix per target with real artifacts: offline,
  feed unavailable, target unavailable, corrupt/truncated download, invalid
  signature, cancellation, insufficient space, locked installation, read-only
  installation, interrupted handoff, reinstall, managed-package fallback — no
  false success and no forced downgrade in any case.
- Write the schema-4 evidence into `docs/release/update-target-qualifications.json`
  (`status: qualified`, one evidence record per target) and land it through a
  release pull request, the only diff the coordinator accepts for that file.

## B. Publisher evidence and production approval (from 065-9-6 / 065-9-10)

- Record, from real public publications: a completed publication, an
  interrupted retry that reconciled without change, immutable assets,
  anonymous downloads with hashes, and the advanced feed — the five
  `REQUIRED_PUBLISHER_CHECKS`.
- Record the first single-channel release (task 143) end to end as pipeline
  evidence: `public-release` environment and `latest.json` created.
- Obtain and record written working-name clearance.
- Enable `productionPromotion` in the registry with the updater key identity
  it covers; from then on releases publish as `production`, without the
  testing notice. Only then set the repository variable
  `GITODILE_QUALIFIED_UPDATE_TARGETS=windows-x86_64,linux-x86_64` and decide
  whether `GITODILE_TEST_UPDATE_TARGETS` is still needed.

## C. Public-repository controls (from 065-9-8)

- Confirm and record that Secret Scanning / Push Protection and the
  applicable dependency and code scanning are enabled and clean on
  `martinezelx/gitodile-desktop` and `martinezelx/gitodile`, or record the
  explicit mitigation for any unavailable control.
- Re-run the public-readiness audit checklist against the current tree and
  record the result beside `docs/release/public-readiness-audit-2026-09-12.md`.

## D. OS signing for every release (replaces 065-9-9)

- Apply for SignPath Foundation (or record why another provider was chosen);
  document the provider and certificate identity without secrets in
  `docs/CODE_SIGNING_POLICY.md`.
- Integrate the reviewed remote-signing step into `release-pipeline.yml`
  between the unsigned build and updater signing, for every release,
  keeping Actions commit-pinned, least-privileged and secretless outside the
  signing environment; the updater signature must still cover the final
  OS-signed bytes.
- Record Authenticode chain, timestamp and revocation verification in the
  evidence, retire `authenticode_deferred` for signed releases, and update
  `make-os-trust.mjs`, the qualification validator, the download guidance and
  the README notice.
- Amend ADR 0011 (Authenticode no longer deferred past `1.0.0`; every release
  signed) and ADR 0010's signing section.

## E. Pending evidence from 065-9-11

- Record that a build from 065-9-11 (`0.2.12`) updated an installed `0.2.11`
  through the public feed, if it did; otherwise
  record the first transition that proves the check-time gate reporting and
  forward-compatible manifest on a real installation.

# Out of scope

- macOS delivery and qualification (task 065-10).
- Any change to the single-channel model, the feeds or the renderer boundary.
- Describing pre-signing packages as Authenticode-signed or OS-trusted.

# Acceptance criteria

- [ ] Both enabled targets carry a valid schema-4 `qualified` record from
      real public releases, with the preservation and failure matrices
      complete; `pnpm run check` accepts the registry.
- [ ] `productionPromotion.enabled` is true with evidenced working-name
      clearance and the five publisher checks; `derivePublicationMode`
      answers `production` and the testing notice is gone from new releases.
- [ ] One release was published through `testing` before that switch and one
      through `production` after it, both recorded.
- [ ] Windows packages of every release are OS-signed through the chosen
      provider, verified (chain, timestamp, revocation) in evidence, and the
      unknown-publisher notice is removed from public guidance only after that
      evidence exists.
- [ ] ADR 0011, `docs/CODE_SIGNING_POLICY.md`, the runbooks and README
      describe the delivered state; `pnpm run check` and
      `pnpm run check:publication` pass on the enabling commits.

# Relevant files

- `docs/release/update-target-qualifications.json`,
  `docs/release/updater-qualification.md`, `docs/release/public-publishing.md`,
  `docs/release/signed-builds.md`, `docs/CODE_SIGNING_POLICY.md`
- `scripts/release/qualification-evidence.mjs`, `public-release.mjs`,
  `make-os-trust.mjs`, `release-evidence.mjs`
- `.github/workflows/release-pipeline.yml`
- `docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md`,
  `docs/adr/0011-defer-windows-authenticode-and-macos-delivery-until-after-1.0.md`
- Closed tasks whose open criteria live here:
  [065-9-5](../done/0.3.0/065-9-5-signed-builds.md),
  [065-9-6](../done/0.3.0/065-9-6-public-release-publishing.md),
  [065-9-7](../done/0.3.0/065-9-7-updater-qualification.md),
  [065-9-8](../done/0.3.0/065-9-8-public-windows-linux-qualification.md),
  [065-9-9](../done/0.3.0/065-9-9-authenticode-public-delivery.md),
  [065-9-10](../done/0.3.0/065-9-10-merge-driven-release-preparation.md),
  [065-9-11](../done/0.3.0/065-9-11-updater-client-and-publisher-hardening.md),
  and the epic [065-9](../done/0.3.0/065-9-signed-application-updates.md).

# Dependencies

- Real Windows and Linux hosts (hardware or VMs) for part A.
- SignPath Foundation acceptance (or the alternative provider) for part D.
- Parts A–C can proceed independently of D; the testing notice is removed by
  B, not by D.

# Decisions

- 2026-09-16: the epic and its remaining children were closed as delivered
  code; evidence and operations work is tracked here as one task so the
  updater's history is not spread across seven half-open files.
- 2026-09-16: OS signing will target every release through SignPath
  Foundation, superseding 065-9-9's post-1.0 Authenticode-only plan; ADR 0011
  is amended when the signing lands, not before.
- 2026-10-01: task 142 replaced the two channels with one (ADR 0019); the
  scope above no longer exercises a channel choice or a `stable-testing`
  release.

# Implementation notes

Complete this section during implementation.

# Validation

Record the exact commands run and their results.
