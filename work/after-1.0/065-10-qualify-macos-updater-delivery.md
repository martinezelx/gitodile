---
id: 065-10
title: Qualify post-1.0 macOS updater delivery on real Apple targets
status: planned
priority: low
type: hardening
areas:
  - release
  - platform
  - security
  - documentation
created: 2026-09-12
completed:
parent: "065"
---

# Goal

After `1.0.0`, qualify and only then enable GitOdile updater delivery for Apple
Silicon and Intel macOS using real signed, notarized packages and installed
A-to-B evidence.

# Context

Task 065-9-8 deliberately closes the first updater phase with only Windows
x86-64 NSIS and Linux x86-64 AppImage enabled. `darwin-aarch64` and
`darwin-x86_64` remain known but `planned_disabled`: they must not enter a feed,
public release asset set or support claim until this task is complete.

On 2026-09-14 the maintainer deferred this task until after `1.0.0` because no
representative Apple device is available and purchasing one is not currently
justified. CI compilation remains useful coverage but does not qualify macOS.
See ADR 0011.

# Scope

- Establish protected Developer ID and notarization access without exposing
  credentials to source, artifacts, pull requests or unreviewed jobs.
- Reintroduce both Darwin build/signing rows only after reviewing the current
  Tauri updater implementation and the app-bundle replacement-safety concern.
- Produce signed/notarized DMG first-install packages and updater-signed
  `.app.tar.gz` payloads for Apple Silicon and Intel.
- Exercise normal installation, update handoff, relaunch, preservation and the
  complete failure matrix on real representative macOS targets.
- Record Gatekeeper, `codesign`, notarization/stapling, updater-signature,
  package-hash and independently observed running-version evidence.
- Amend the release registry, manifests, runbooks and user-facing support copy
  only after both targets pass.
- Own the macOS qualification carried from epics 037, 037-6 and 065-4 by
  [ADR 0042](../../docs/adr/0042-propose-platform-qualification-carryover-for-050.md):
  run the task-023 runtime/memory protocol and retained conflict/integration
  matrices on representative WKWebView/filesystem/VoiceOver environments in
  addition to this task's package and updater checks. Keep the original
  criteria linked through the [carryover matrix](../assets/0.5.0-closure/closure-audit.md).

# Out of scope

- Claiming macOS support from CI compilation, mocks, a universal binary alone,
  or evidence from only one architecture.
- Publishing an unsigned, unnotarized or unqualified macOS artifact.
- Weakening replacement, signature, admission, recovery or restart truth to
  match another platform.

# Acceptance criteria

- [ ] macOS qualification carried from
      [037](../done/0.5.0/037-guided-conflict-resolution.md),
      [037-6](../done/0.5.0/037-6-resolve-files.md) and
      [065-4](../done/0.5.0/065-4-integrate-branches.md) passes the task-023 and
      conflict/integration protocols for both target architectures, with
      exact artifact/commit, hardware, OS, Git, WKWebView, VoiceOver and
      per-criterion results. The original deferred criteria are reconciled
      against actual evidence before either target is enabled.

- [ ] The current Tauri macOS replacement behavior has an independently
      reviewed mitigation for every relevant install location and failure mode.
- [ ] Real Apple Silicon and Intel packages pass Developer ID signing,
      hardened-runtime, timestamp, notarization, stapling and Gatekeeper checks.
- [ ] Both targets pass consecutive installed A-to-B updates through GitOdile,
      including restart-version truth, preservation and failure cases.
- [ ] Public immutable assets and feed rows appear only after both target
      records are schema-valid and reviewed; partial qualification publishes
      neither target.
- [ ] Documentation and 1.0.0 readiness claims are updated only from linked real
      evidence, and `pnpm run check` plus `pnpm run check:publication` pass on
      the exact enabling commit.

# Dependencies

- Released `1.0.0` and an explicit maintainer decision to resume this task.
- Completed Windows/Linux updater phase 065-9.
- Real Apple Silicon and Intel test environments.
- Apple Developer ID Application identity, notarization access and protected
  environment approvals.
- Resolution or independently tested mitigation of the upstream replacement
  safety concern recorded in ADR 0010.
