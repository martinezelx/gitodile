---
id: 065-9-3
title: Implement the native signed updater lifecycle
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

Check, download, verify and explicitly install one application update through the protected Rust service.

# Context

Child of [epic 065-9](../0.3.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Integrate the official Tauri updater behind a narrow Rust owner and typed IPC; keep lib.rs registration-only and renderer capabilities minimal.
- Coalesce checks, validate channel/version/target, bound networking and remote notes, retain only one candidate and support accurate download/verification/ready/error/cancel/retry states.
- Measure package transfer and peak memory limits, including anticipated bundled Git size; invalid signatures or truncated data never become installable.
- Invoke installation only through native admission and explicit consent. Handle Windows exit, platform install modes and post-launch running-version verification with bounded handoff state.

# Out of scope

User interface, live release publishing and claiming cross-platform installation success from mocks.

# Acceptance criteria

- [x] No renderer command accepts arbitrary URLs, keys or installer paths, and direct updater/process permissions cannot bypass admission.
- [x] Offline, timeout, HTTP, malformed manifest, missing target, no update and invalid upgrade are distinct and tested.
- [x] Known/unknown download sizes, cancellation, corruption, retry and resource release behave truthfully; failed verification cannot install.
- [x] Install handoff and startup confirmation report only observed success; failure offers reinstall guidance without a forced downgrade or success loop.

# Dependencies

065-9-1 and 065-9-2.

# Implementation notes

Implemented on 2026-09-10 through the process-wide `app_updates.rs` service,
six narrow IPC commands and a typed `features/app-updates` port/adapter. The
exact Rust dependency is `tauri-plugin-updater = 2.11.0`; its official source
was reviewed before integration. The renderer has no JavaScript updater/process
dependency or capability and can supply only a closed check source, opaque IDs,
explicit consent and a bounded draft summary.

Checks use fixed native feeds and build-time key identity, coalesce, preserve a
closed error taxonomy and retain one immutable candidate. A bounded HTTPS
preflight must match the plugin's authoritative response. Downloads enforce
known/unknown length, idle/total time, redirects and a 256 MiB streamed cap;
the plugin's Minisign result alone can enter `ready`. Exact cancellation and
late-result suppression release failed or superseded bytes.

Install preparation follows the 065-9-2 order, holds native admission/watch
suspension through accepted handoff, revalidates target/mode/path/candidate and
never cancels a mutation. Unsupported, managed, mounted, store, MSI and
machine-wide modes remain manual. A bounded one-shot handoff record confirms
only the observed running version, rejects non-forward records and supplies
manual reinstall guidance without claiming rollback. The compile-time target
qualification allowlist is empty by default; no platform is advertised or
qualified by this task.

Durable details and the resource measurement are in
[`app-update-contracts.md`](../../../docs/architecture/app-update-contracts.md)
and the updated
[`install-admission-and-drafts.md`](../../../docs/architecture/install-admission-and-drafts.md).

# Validation

Focused validation passed with 16 Rust updater tests and four frontend/IPC
tests, including strict versions/targets, network taxonomy, exact cancellation,
known/unknown/truncated/oversize transfers, valid/invalid/corrupt Minisign
fixtures, draft/admission/watch restoration, installation modes and one-shot
forward-only startup confirmation. `cargo check --all-targets`, frontend
architecture checks, documentation/contract checks, `git diff --check`, and a
local unsigned NSIS build passed.

The release-profile memory probe combined the 2,660,544-byte NSIS payload with
a 134,164,849-byte compressed proxy for the installed Git for Windows tree. It
retained 136,825,393 bytes, reserved 268,435,456 bytes and peaked at
273,412,096 bytes, motivating the 256 MiB cap. The temporary proxy archive was
removed. Final `pnpm run check` passed over 355 Markdown files / 153 task IDs,
81 frontend test files / 847 tests, the production build, Rust formatting and
Clippy, and 396 Rust tests. Real signed installations remain exclusively
065-9-7.
