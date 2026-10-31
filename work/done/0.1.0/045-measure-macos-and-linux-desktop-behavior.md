---
id: 045
title: Record and gate deferred macOS and Linux runtime validation
status: done
priority: high
type: chore
areas:
  - platform
  - performance
  - frontend
created: 2026-08-10
completed: 2026-08-12
parent: "038"
---

# Goal

Make the unavailable macOS/Linux runtime validation an explicit release-
hardening gate, and strengthen the automated evidence CI can provide today.

# User outcome

Contributors can distinguish what CI proves from what remains unmeasured, and a
future release cannot silently treat cross-platform compilation as runtime
validation.

# Context

Epic 022 closed with every budget measured on Windows 11 and WebView2, and no
desktop run on any other platform. CI runs the Rust job on ubuntu, windows and
macos, but the frontend job runs on ubuntu only and neither job launches the
app. Nothing in this project has ever executed inside WKWebView or WebKitGTK.

Three areas carry real risk rather than theoretical risk:

- **The file-list virtualization** added by task 031 is new code using
  `@tanstack/react-virtual` with absolutely positioned rows, `transform`
  offsets and `ResizeObserver` measurement. It was verified on WebView2 with a
  5,000-change fixture. Row measurement and scroll anchoring are exactly the
  areas where WebKit and Chromium diverge.
- **Keep-alive accessibility** depends on `hidden` plus `inert`. `inert` has a
  different support and behavior history in WebKit, and the guarantee it
  provides — a hidden screen cannot be tabbed into or announce status — is an
  accessibility contract, not an optimization.
- **Every memory number is Windows-only.** ADR 0004 scopes its private-bytes
  budget to Windows explicitly and states that reusing those numbers elsewhere
  is not authorized.

Task 023's protocol already defines the per-platform metric: resident and
private footprint on macOS, RSS and PSS from `smaps_rollup` on Linux.

The probes in `scripts/` attach over CDP, which is a WebView2 mechanism. macOS
and Linux need a different driver or a different approach, and finding that out
is part of this task rather than a surprise during it.

# Scope

- Add an accepted ADR that records the missing hardware, the evidence CI does
  and does not provide, and the trigger and complete protocol for future
  release-hardening validation.
- Keep Rust formatting, clippy and tests running on Ubuntu, Windows and macOS.
- Add macOS/Linux release compilation of the renderer plus Tauri executable to
  CI without describing it as a desktop runtime test.
- Make README, architecture and performance documents disclose the unmeasured
  runtime/accessibility/memory/packaging status.
- Close epic 038 on an explicit, dated, owned limitation rather than claiming
  the original hardware protocol ran.

# Out of scope

- Claiming macOS/Linux runtime, accessibility, performance or memory passed.
- Launching a GUI in hosted CI or treating a virtual display as representative
  platform hardware.
- Packaging, installers, credentials, code signing or notarization.

# Acceptance criteria

- [x] ADR 0006 explicitly records that macOS/Linux runtime, accessibility,
      memory, credentials and packaging are unmeasured.
- [x] The future release-hardening trigger and full platform protocol are
      durable requirements rather than an indefinitely active task.
- [x] CI continues Rust fmt, clippy and tests on all three target operating
      systems.
- [x] CI release-compiles the integrated Tauri application on macOS and Linux.
- [x] Documentation distinguishes successful compilation from runtime evidence
      and does not reuse Windows budgets for another platform.
- [x] Epic 038 can close without implying the original hardware protocol ran.

# Relevant files

- `docs/architecture/023-performance-baseline.md`
- `docs/adr/0004-measure-desktop-memory-as-private-bytes.md`
- `scripts/README-031-probes.md` and the probes beside it
- `docs/ARCHITECTURE.md`, "Platform notes"

# Dependencies

The original protocol needs macOS and Linux hardware or representative VMs.
ADR 0006 moves that dependency to the release-hardening gate.

# Decisions

- Do not convert absence into a pass. CI compilation is useful evidence and is
  named as such; runtime support remains unmeasured.
- Defer the manual matrix until the workflows and packaging path are mature
  enough for its baselines to influence release decisions.

# Implementation notes

- Added ADR 0006 with the explicit limitation, CI evidence boundary and future
  release-hardening protocol.
- Added `desktop-release-compile` jobs on `ubuntu-latest` and `macos-latest`.
  `pnpm tauri build --no-bundle` runs the ordinary TypeScript/Vite production
  build and compiles the release Tauri executable on each host. It does not
  launch the WebView or validate bundles/signing.
- Updated README, architecture, performance baseline and ADR 0004 so no
  cross-platform runtime claim is inferred from CI.

# Validation

- Existing CI evidence at conversion time: Rust fmt, clippy and the complete
  Rust test suite run on Ubuntu, Windows and macOS.
- New workflow syntax and local Windows `pnpm tauri build --no-bundle` are
  validated in this change. The new macOS/Linux release jobs become authoritative
  only when the pushed GitHub Actions run completes successfully.
- Local Windows release compilation passed in 3m40s after the ordinary renderer
  build transformed 1,941 modules and produced the optimized executable.
- The original task-023 runtime protocol was deliberately **not** reported as
  passing on macOS or Linux.
