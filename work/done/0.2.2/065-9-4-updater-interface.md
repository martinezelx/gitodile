---
id: 065-9-4
title: Integrate update controls and preferences
status: done
priority: high
type: feature
areas:
  - release
  - platform
  - security
created: 2026-09-03
completed: 2026-09-10
parent: "065-9"
---

# Goal

Let users check, download and choose when to install updates with clear progress and recoverable errors.

# Context

Child of [epic 065-9](../0.3.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture.

# Scope

- Create the feature-owned controller and integrate Changelog, menu, command palette and Settings without component IPC.
- Support checking with no project open while keeping navigation and bundled Changelog notes local-only.
- Implement the disclosed off-by-default background preference, the fixed 24-hour cadence, complete progress/error guidance and explicit install/restart consent.
- Keep remote notes bounded plain text and the interface accessible in English and Spanish.

# Out of scope

Channel picker, mandatory/silent installation, provider login, signed artifact publishing and real target qualification.

# Acceptance criteria

- [x] All entry points share one coherent lifecycle and cannot duplicate checks/downloads/installation.
- [x] Automatic checking is opt-in, sends no repository data or stable installation identifier, and follows the documented cadence.
- [x] Keyboard, focus restoration, screen-reader announcements and unknown-length progress work in unavailable, offline, blocked and failure states.
- [x] User-facing README/design guidance describes only implemented behavior and installation never bypasses native protection.

# Dependencies

065-9-3, including the draft/admission contract from 065-9-2.

# Implementation notes

Completed on 2026-09-10. `features/app-updates` now owns the single renderer
controller, its eager dialog, Settings control, English/Spanish copy and visual
contract. The controller reads and mirrors the native process snapshot,
coalesces entry-point requests, polls only while native work is active and
retains neither candidates nor payload bytes of its own. Changelog, More
actions, the command palette and General Settings all use that instance,
including with no open project.

Bundled notes still mount and expand without network work. Remote checking is
explicit, or an off-by-default consent choice that starts only after startup
settles and runs at most once per 24 hours while the app remains open. The
disclosure names GitHub and states that no project data or stable installation
identifier is sent. No background download or install exists.

The dialog represents the native idle/check/current/available/download/
verification/ready/blocked/install/cancel/unavailable/failure vocabulary,
including known and unknown transfer length, bounded plain-text notes, closed
error guidance, manual signed-download fallback, draft and operation blockers,
and startup confirmation. Installation uses `installReadyUpdate` only after a
second focused confirmation that explains the close/restart consequence.

# Validation

Focused controller and interaction tests cover coalescing, local-only mount,
opt-in cadence, exact cancellation, known/unknown progress, plain-text notes,
Settings consent, every shell entry point, retry, draft-protected install,
keyboard focus restoration, explicit install confirmation and live progress
semantics. The visual pass covered Spanish copy, dark theme and the 900×620
minimum window. Final `pnpm run check` passed documentation and contract
validation, frontend architecture, TypeScript, 83 frontend test files / 858
tests, the production build, Rust formatting and Clippy, and 396 Rust tests.
`git diff --check` also passed.
