---
id: 065-9-9
title: Add trusted Windows signing after 1.0.0
status: done
priority: low
type: hardening
areas:
  - release
  - platform
  - security
  - documentation
created: 2026-09-12
completed: 2026-09-16
parent: "065-9"
queue:
---

# Goal

Add publicly trusted Windows Authenticode signing and requalify Windows
publication after GitOdile `1.0.0`.

# Context

The maintainer narrowed task 065-9-8 on 2026-09-12 to functional updater
qualification with real Tauri signatures. Windows validation packages may be
unsigned at the operating-system layer and must be labelled as internal test
artifacts. This is sufficient to prove Tauri package authentication and the
installed A-to-B lifecycle, but it does not establish a trusted Windows
publisher or remove SmartScreen warnings.

On 2026-09-14 the maintainer deferred provider selection, certificate custody
and Authenticode qualification until after `1.0.0`. Previews and the initial
1.0 release may therefore ship without OS-level publisher trust, with explicit
warnings and `authenticode_deferred` evidence. The Tauri updater signature
remains mandatory and is not equivalent to Authenticode. See ADR 0011.

# Scope

- Select a sustainable Windows code-signing provider compatible with the
  project's ownership and expected future source visibility.
- Store signing authority only in the protected production Windows environment;
  prefer a managed HSM or service identity over exportable key material.
- Exercise the existing production Authenticode path or replace it with a
  reviewed remote-signing integration while keeping Actions commit-pinned and
  least-privileged.
- Produce two consecutive post-1.0 production-key previews, verify Authenticode chain,
  revocation and timestamp evidence, publish immutable assets to
  `martinezelx/gitodile`, and prove anonymous downloads plus the real
  public `.4` to `.5` updater transition.
- Update public download guidance only after the evidence passes.

# Out of scope

- Treating a self-signed certificate, a Tauri updater signature or an unsigned
  validation build as equivalent to Authenticode.
- Publishing macOS artifacts.
- Retroactively describing pre-1.0 or 1.0 packages as Authenticode-qualified.

# Acceptance criteria

- [ ] The selected provider and certificate identity are documented without
      secrets and remain usable under the intended source-repository visibility.
- [ ] Protected CI produces timestamped Windows NSIS bytes whose Authenticode
      signature passes online chain and revocation verification.
- [ ] Production Windows packages retain a distinct valid Tauri updater
      signature in addition to Authenticode.
- [ ] Two immutable preview releases and `preview.json` pass destination-scoped
      publication, anonymous hash verification and real installed `.4` to `.5`
      update evidence.
- [ ] Internal unsigned validation artifacts are never described as trusted
      public downloads, and production continues to fail closed without
      Authenticode.
- [ ] `pnpm run check` and `pnpm run check:publication` pass on the exact
      enabling commit.

# Dependencies

- Released `1.0.0` and an explicit maintainer decision to resume this task.
- Completed controlled updater qualification from 065-9-8.
- A real Windows x86-64 test device.
- A publicly trusted code-signing provider and protected credentials.
- A destination-scoped publisher credential for `gitodile`.

# Closure

Closed on 2026-09-16 when the updater epic was wound down: the code,
pipeline and contracts this task describes are on `main` and were
exercised by the public previews `0.2.0-preview.10` to `.12`. The
criteria left unchecked above are not claimed; the whole scope, now planned as SignPath Foundation signing for both channels rather than Authenticode after `1.0.0`
moved to [065-9-13](../../0.7.0/065-9-13-updater-evidence-and-os-signing.md),
which owns everything the updater still has to prove.
