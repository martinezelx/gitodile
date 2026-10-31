---
id: 065-8
title: Verify and distribute GitOdile 1.0.0
status: active
priority: high
type: release
areas:
  - release
  - platform
  - accessibility
  - performance
  - security
  - documentation
created: 2026-08-18
completed:
parent: "065"
queue: "02"
---

# Goal

Freeze features, validate the full product on representative systems, and ship
Tauri-signed, updateable, supportable `1.0.0` artifacts for Windows and Linux.

# User outcome

Users can install GitOdile from a verified updater package, complete every advertised
workflow on their platform, update safely, and understand compatibility and
support boundaries, including the lack of Windows publisher trust.

# Context

Compilation and unit/integration CI are not runtime, packaging, signing,
credential, accessibility, or update evidence. ADR 0006 explicitly defers
macOS/Linux runtime validation to release hardening. ADR 0011 supersedes the
macOS portion for `1.0.0`: real macOS delivery is now post-1.0.

# Scope

- Freeze the `1.0.0` capability matrix and triage every open defect by data-loss,
  remote-integrity, correctness, accessibility, security, and usability risk.
- Run the full Gate-0 workflow plus clone/create/history/integration/conflict/
  recovery/stash journeys from actual packaged artifacts on representative
  Windows and supported Linux environments.
- Execute large-repository, long-running process, watcher, memory, startup,
  screen-switch, keyboard, screen-reader, zoom, forced-colors, reduced-motion,
  locale, path, line-ending, symlink, casing, lock, and credential matrices.
- Produce Tauri-signed Windows installers and Linux packages/distributions with
  reproducible CI provenance and artifact hashes. Record Windows Authenticode
  as deferred and keep macOS absent from the supported matrix.
- Qualify the updater and publication pipeline delivered by
  [epic 065-9](../done/0.3.0/065-9-signed-application-updates.md) against the final signed
  artifacts: signature verification, failure behavior, reinstall instructions,
  and no repository mutation during update. The accepted strategy is in
  [ADR 0010](../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md).
- Complete versioning, release notes, privacy/security/support docs, install and
  uninstall behavior, crash/log locations, known limitations, and upgrade tests.
- Run an independent final safety audit and the aggregate repository gate.
- Own the Linux qualification carried from epics 037, 037-6 and 065-4 by
  [ADR 0042](../../docs/adr/0042-propose-platform-qualification-carryover-for-050.md).
  Run the task-023 protocol and the retained conflict/integration matrices
  against real WebKitGTK, filesystem and Orca environments; preserve exact
  original-criterion traceability in the [carryover matrix](../assets/0.5.0-closure/closure-audit.md).

# Out of scope

- Adding features after freeze to improve competitive parity.
- Claiming support for an untested OS/distribution/architecture.
- Telemetry, accounts, or a mandatory update service.

# Acceptance criteria

- [ ] Linux qualification carried from
      [037](../done/0.5.0/037-guided-conflict-resolution.md),
      [037-6](../done/0.5.0/037-6-resolve-files.md) and
      [065-4](../done/0.5.0/065-4-integrate-branches.md) passes the task-023 and
      conflict/integration protocols in the carryover matrix, with actual
      artifact/commit, hardware, OS/desktop, Git, WebView and assistive-tech
      versions and per-criterion results. Their phase closure is not evidence
      that these tests ran.

- [ ] The independent offline updater-key backup required by
      `docs/release/signed-builds.md` exists, passed a restore test, and its
      custody is recorded (deferred to `1.0.0` on 2026-10-01).
- [ ] Every roadmap Gate 0–3 task is done and the frozen matrix maps advertised
      behavior to automated plus actual-artifact evidence.
- [ ] No open blocker/critical issue can lose work, corrupt state, expose a
      credential, misreport a remote result, or prevent a primary workflow.
- [ ] Representative Windows and documented Linux artifacts pass the
      complete smoke/workflow/platform/accessibility matrix from clean installs.
- [ ] Updater signatures, package provenance and hashes verify through the
      normal installation path; uninstall preserves user repositories and the
      Windows documentation discloses its unknown publisher.
- [ ] Update success, unavailable update, interrupted download/install, invalid
      signature, rollback/reinstall, and older-settings migration are tested.
- [ ] Startup, memory, interaction, large-repository, watcher, and process
      results are recorded against retained budgets with no unexplained regressions.
- [ ] README, changelog/release notes, privacy, security, install, update,
      troubleshooting, support, and known-limitations docs match shipped behavior.
- [ ] Version metadata is `1.0.0`, `pnpm run check` passes on the release commit,
      CI is green, and artifact/version provenance is recorded.

# Relevant files

- `README.md`
- `SECURITY.md`
- `docs/ROADMAP.md`
- `docs/adr/0006-defer-macos-and-linux-runtime-validation.md`
- `docs/architecture/023-performance-baseline.md`
- `.github/workflows/`
- `src-tauri/tauri.conf.json`
- `package.json`
- `src-tauri/Cargo.toml`

# Dependencies

- Tasks 015, 037, 064, and 065-1 through 065-7 complete.
- Epic 065-9 and all seven children complete; its signed updater and publication pipeline complete before freeze.
- Access to representative Windows and Linux QA environments.

# Decisions

- Feature freeze begins when this task starts.
- Support claims follow actual packaged-artifact evidence.
- Tauri updater signing, update safety, and recovery are correctness requirements.
- ADR 0011 defers Authenticode and macOS delivery until after `1.0.0`.
- 2026-10-31: the maintainer accepted ADR 0042's Linux carryover from the
  completed `0.5.0` implementation phase. This records a future release gate;
  it does not start this task or change its queue position.

# Implementation notes

Record supported OS/distribution/architecture matrix, signing identities and CI
design without secrets, artifact formats, updater decision/ADR, defects fixed,
and residual known limitations.

# Validation

Record release commit/tag, CI URLs, artifact hashes, signing/notarization
verification, platform hardware/software matrix, full QA results, independent
audit, and final aggregate check.
