# ADR 0042: Carry 0.5.0 platform qualification into its existing release gates

- Status: accepted
- Date: 2026-10-31
- Accepted by the maintainer: 2026-10-31
- Supplements: [ADR 0006](0006-defer-macos-and-linux-runtime-validation.md)
  and [ADR 0011](0011-defer-windows-authenticode-and-macos-delivery-until-after-1.0.md)

## Context

Epics 037, 037-6 and 065-4 have completed implementation slices and reviewed
Windows audits. Their later acceptance checklists nevertheless retain full
platform qualification. macOS/Linux runtime and assistive technology have not
been exercised on representative environments; passing Windows tests or CI
compilation cannot satisfy those criteria.

ADR 0006 already deferred the task-023 macOS/Linux runtime/accessibility/memory
matrix to release hardening and allowed epic 038 to close with an explicit
limitation. ADR 0011 additionally moved macOS delivery after `1.0.0`. Neither
decision explicitly disposes of these later feature checklists. Their empty
queue and open epics currently conflate implementation completion with external
release qualification.

The [closure matrix](../../work/assets/0.5.0-closure/closure-audit.md) maps the
exact remaining criteria, existing evidence, Windows accessibility work and
the environments still needed. No criterion is removed by this decision.

## Decision

The maintainer accepted this disposition on 2026-10-31. Close the completed
implementation phase with the external qualification explicitly carried over:

1. Permit **implementation-phase closure** of 037, 037-6 and 065-4 using
   their reviewed Windows evidence and a passing aggregate gate. Keep their
   original platform checkboxes unchecked and label them **formally deferred,
   not executed**, linking this decision and the exact carryover matrix.
   Moving a task to done must preserve those qualifications and all links.
2. Assign the remaining Linux runtime/filesystem/WebView/Orca work to
   [065-8](../../work/0.7.0/065-8-release-hardening.md) before any Linux
   release-readiness claim. Attach the closure matrix to that task's evidence
   obligations; no present execution, CI result or artifact qualification is
   claimed by acceptance.
3. Assign macOS runtime/filesystem/WKWebView/VoiceOver work to
   [065-10](../../work/after-1.0/065-10-qualify-macos-updater-delivery.md),
   after `1.0.0` and before enabling either macOS target. Its required evidence
   must explicitly include the task-023 protocol and the same conflict and
   integration matrix, in addition to its Apple signing/updater obligations.
4. The release maintainer owns obtaining environments and retaining the exact
   commit/artifact, hardware/VM, OS/desktop, WebView, Git and assistive-tech
   versions and per-scenario results. Failures become blocking defects for the
   relevant advertised platform. Unknown/unexecuted evidence stays unknown.
5. Keep CI's cross-platform Rust checks and macOS/Linux release compilation.
   Keep README/architecture support limitations and actual-artifact release
   gates. Closing these epics does not authorize publishing `0.5.0`, starting
   `0.6.0`, or claiming macOS/Linux runtime support.

This is a scoped transfer of external qualification, not a waiver of Git
safety, recovery, Windows accessibility or automated regression checks. A new
Windows defect must be fixed and verified before phase closure.

## Consequences

- Work status can reflect completed implementation without inventing platform
  evidence or leaving unavailable environments in an executable feature queue.
- Each remaining criterion has an existing permanent owner and an explicit
  release trigger. Later task closure must point back to the original criterion
  and its actual results, rather than silently checking an old box.
- macOS/Linux defects may remain undiscovered until those environments exist.
  No Windows performance, credential or accessibility result can be extrapolated.
- Phase closure does not start future-version work, waive a criterion or
  authorize a release. The external qualification remains mandatory at its
  named release gate.

## Alternatives considered

### Keep the epics open until all external runs pass

Not chosen. It preserves the literal criteria but makes
completed feature work depend on environments already scheduled for later
release gates; the accepted carryover keeps the criteria and their ownership.

### Check or delete the criteria based on ADR 0006 alone

Rejected. Existing deferral is not an executed test, and the later feature
checklists need an explicit disposition and traceability.

### Close Windows accessibility by static semantics alone

Rejected. This audit exercised actual WebView2, real NVDA speech generation,
keyboard/focus, active media emulation and native zoom; DOM labels alone were
the earlier evidence gap and cannot be presented as a reader pass.

### Infer runtime support from a successful build or Windows tests

Rejected by ADR 0006; the external environment and actual-artifact gates remain.
