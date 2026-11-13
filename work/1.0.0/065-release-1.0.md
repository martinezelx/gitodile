---
id: 065
title: Reach a trustworthy GitOdile 1.0.0
status: active
priority: high
type: epic
areas:
  - product
  - release
  - frontend
  - rust
  - platform
created: 2026-08-18
completed:
---

# Goal

Close the ordinary provider-neutral desktop Git workflow, prove it end to end,
and ship verified installable artifacts as GitOdile `1.0.0`.

# User outcome

A user can acquire or create a project, understand and save work, inspect its
history, collaborate through clean or conflicting changes, recover from
mistakes, and keep unfinished work for later without using a terminal.

# Context

GitOdile already contains most of the safe local commit and fast-forward sync
loop. The remaining work must be sequenced around dependencies rather than
implemented as unrelated screens. [`docs/ROADMAP.md`](../../docs/ROADMAP.md)
is the authoritative release sequence and capability cut.

# Scope

- Deliver child tasks 065-1 through 065-9 in roadmap order. Since
  2026-10-27 the remaining children are scheduled by version folder
  ([ADR 0039](../../docs/adr/0039-position-gitodile-for-humans-and-their-agents.md)): 065-4 in
  [`0.5.0`](../0.5.0/README.md), 065-5 and 065-6 in
  [`0.6.0`](../0.6.0/README.md), and 065-7, 065-8 and 065-9-13 in
  [`0.7.0`](../0.7.0/README.md). 065-10 moved to
  [`after-1.0`](../after-1.0/README.md).
- Complete existing tasks 015, 037, and 064 at their defined dependency points.
- Complete the read-only project console in [task 134](../done/0.3.0/134-project-git-console.md)
  before final release hardening; it remains an optional advanced path, not a
  prerequisite for the ordinary guided workflow.
- Close the settled visual system across the release-candidate surface in task
  099 before final platform and distribution hardening.
- Keep the `1.0.0` contract provider-neutral and local-first.
- Add no agent-era feature (safety net, sessions, pre-publish review, parallel
  work, agent integration); 065-5 and 065-6 only follow the
  [design seeds](../../docs/ROADMAP.md#design-seeds-in-100) so that work can build on them.
- Maintain a release checklist mapping every advertised capability to automated
  tests and actual desktop evidence.
- Update README capabilities, version metadata, release notes, and support
  documentation only when the corresponding evidence exists.

# Out of scope

- Literal parity with every GitHub Desktop feature.
- Native provider accounts, pull requests, issues, checks, forks, and cloud-only
  collaboration.
- Worktrees, tags/releases, rebase, force push, cherry-pick, interactive
  history editing, and AI features.

# Acceptance criteria

- [ ] Gates 0–4 in `docs/ROADMAP.md` are complete in dependency order.
- [ ] Tasks 015, 037, 064, 099, and 065-1 through 065-9 are done with their own
      validation recorded. Updater epic 065-9 was closed on 2026-09-16; the
      evidence it still owes is tracked by
      [065-9-13](../0.7.0/065-9-13-updater-evidence-and-os-signing.md).
- [ ] The project console (task 134 and epic 138) is validated on the
      supported platforms: changes previewed and confirmed by default, with
      changes without confirmation covered by the release qualification matrix (ADR 0028).
      History and destructive console commands (task 139) are not part of
      `1.0.0`.
- [ ] The release capability matrix has no unsupported path presented as
      working and no required path dependent on the terminal.
- [ ] The actual Windows and Linux release artifacts pass their defined smoke,
      workflow, accessibility, credential, and update/recovery checks. Windows
      records Authenticode as deliberately deferred and discloses the resulting
      OS warning; macOS remains disabled and unadvertised.
- [ ] No open known issue can silently lose work, misreport a remote outcome,
      bypass hooks/signing, or overwrite newer state.
- [ ] `pnpm run check` passes on the release commit and version metadata is
      consistent across npm, Cargo, Tauri, packages, and release notes.

# Relevant files

- `AGENTS.md`
- `README.md`
- `docs/PRODUCT_STRATEGY.md`
- `docs/ROADMAP.md`
- `docs/adr/0006-defer-macos-and-linux-runtime-validation.md`
- `work/done/0.1.0/015-history-timeline.md`
- `work/done/0.5.0/037-guided-conflict-resolution.md`
- `work/0.6.0/064-set-changes-aside-safely.md`
- `work/done/0.2.2/099-close-the-visual-system-refactor.md`

# Dependencies

The delivered 001–063 foundation. Individual child dependencies are recorded
in each task and in the roadmap dependency map.

# Decisions

- `1.0.0` means a complete, safe universal Git loop and verified distribution,
  not provider feature parity.
- Audit before adding features; release claims follow evidence.
- Work on one implementation task at a time even though the release epic keeps
  the approved sequence visible.
- ADR 0011 removes Authenticode and macOS delivery from the `1.0.0` gate; task
  065-10 retains its ID as post-1.0 work, and OS signing is now owned by
  065-9-13 (SignPath Foundation for every release, superseding 065-9-9).

# Implementation notes

Update as child tasks complete. Do not duplicate durable capability or release
rules from the roadmap here.

# Validation

Record the final release commit, CI runs, artifact hashes, signing/notarization
evidence, platform matrix, and full `pnpm run check` result.
