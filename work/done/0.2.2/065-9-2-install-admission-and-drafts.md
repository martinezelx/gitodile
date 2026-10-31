---
id: 065-9-2
title: Protect operations and drafts before app installation
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

Create native application-wide install admission and preserve volatile user work before installer handoff.

# Context

Child of [epic 065-9](../0.3.0/065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Inventory all current project/global mutations, clone/create, hooks, credential helpers, background reads and watchers across every project; integrate admission at the native ownership boundaries.
- Make install admission atomic with starting new work. Drain or stop safe background work normally; never terminate a mutation. Release admission after blocked or failed pre-install attempts.
- Inventory save-message, settings and any existing editor drafts; persist and restore safely or return an actionable install blocker independent of mounted screens.
- Define how future conflict, integration and stash operations register with admission. Implement protection for existing paths now; require later features to extend it.

# Out of scope

Download transport, installer invocation, future conflict/stash feature implementation and credential-helper hardening from 065-7.

# Acceptance criteria

- [x] Race tests prove a new mutation and installer cannot both acquire admission, including another project, clone/create and global helpers.
- [x] Every existing operation has a documented admission/drain policy; failure restores normal operation and no mutation is killed.
- [x] Draft preservation/blocking survives project switching and screen unmounting; tracked/untracked files and Git history remain untouched.
- [x] Architecture docs explain the extension contract for future operations and drafts.

# Dependencies

065-9-1 contracts and the existing native operation/session owners.

# Implementation notes

Implemented a mutex/condition-variable admission coordinator in
`application.rs`. Every execution policy now selects `Block`, `Drain`, or
`Allow`; registration and install admission are one atomic boundary across
repositories and global commands. Repository discovery is inside that boundary,
safe reads receive cancellation, mutations are only observed as blockers, and
the RAII install preparation restores watchers and admission after any failure.
Windows `winget` install/update reapers retain background activity until their
external child exits.

Added the neutral renderer draft/install registries. Save Version and quick-save
messages use bounded synchronous browser persistence keyed by project and are
restored without a mounted owner. Existing settings, remote, ignore,
clone/create and branch editors register actionable blockers; remote URLs
are intentionally not persisted. Automatic remote checks and speculative cache
warmers suspend and resume through the renderer participant contract.

The complete current command, process, watcher, timer and draft inventory plus
the mandatory conflict/integration/stash extension rules live in the
[install-admission and draft contract](../../../docs/architecture/install-admission-and-drafts.md).
No updater dependency, network transport, installer invocation, capability, or
update interface was added.

# Validation

Focused evidence covers the native admission race, cross-project mutation
blocking, clone/create/global policy, normal read cancellation, failed draft
preparation reopening admission, and suspension/restoration of two real
temporary-directory watchers. Renderer tests cover bounded persistence,
unmounted/project-switched restoration, storage failures, participant rollback,
automatic remote-check suspension and cache-warmer suspension. The aggregate
gate and `git diff --check` passed on 2026-09-10; exact test counts are recorded
by the command output and final task handoff rather than copied here.
