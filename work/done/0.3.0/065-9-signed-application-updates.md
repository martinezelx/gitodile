---
id: 065-9
title: Update GitOdile safely from signed public releases
status: done
priority: high
type: epic
areas:
  - release
  - frontend
  - rust
  - platform
  - security
  - documentation
created: 2026-09-03
completed: 2026-09-16
parent: "065"
---

# Goal

Implement Tauri application updates with a protected build/signing pipeline and
public GitHub Release assets, preserving repository operations and user work
across installation and restart.

# User outcome

Users can check for a new GitOdile version without an account, review it,
download a verified package, and choose when to install and restart. If an
update fails or their installation must be managed externally, the app explains
the next step and remains usable.

# Context

The user requested updater analysis and a concrete implementation task on
2026-09-03, including reuse of the new public feedback repository and comparison
with other Tauri applications. [ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
records the accepted design, evidence, alternatives, and limitations. The user
confirmed exactly `stable` and `preview`, both released from version-tagged
commits on `main` after merging a short-lived version branch. No updater,
release, signing key, or external repository change was created during planning.

This extracts implementation from [065-8](../../0.7.0/065-8-release-hardening.md), which
retains final release-readiness validation. The suffix is a permanent ID;
its children now lead the implementation queue, ahead of the remaining product
features. It does not absorb Git credential hardening in 065-7 or final full-product
qualification in 065-8.

# Ordered implementation

On 2026-09-03 the user requested a dedicated updater epic with separate ordered
tasks. The permanent ID and existing acceptance criteria are preserved. Children
own executable work; this epic has no queue position.

| Queue | Child | Acceptance coverage |
| --- | --- | --- |
| Done | [065-9-1 — Define updater contracts and supported installations](../0.2.2/065-9-1-contracts-and-targets.md) | Versions, channels, target/install matrix and key prerequisites |
| Done | [065-9-2 — Protect operations and drafts before app installation](../0.2.2/065-9-2-install-admission-and-drafts.md) | Native admission, operations, helpers and draft preservation |
| Done | [065-9-3 — Implement the native signed updater lifecycle](../0.2.2/065-9-3-native-updater.md) | Checks, verified downloads, install handoff and startup truth |
| Done | [065-9-4 — Integrate update controls and preferences](../0.2.2/065-9-4-updater-interface.md) | Entry points, consent, preferences, privacy and accessibility |
| Q01 | [065-9-5 — Build signed release artifacts in private CI](065-9-5-signed-builds.md) | Private CI, signing, provenance and source-tag gates |
| Q02 | [065-9-6 — Publish public releases and stable preview feeds](065-9-6-public-release-publishing.md) | Public artifacts, feeds, retries and feedback compatibility |
| Q03 | [065-9-7 — Qualify signed upgrades and release operations](065-9-7-updater-qualification.md) | Real A-to-B upgrades, failure matrix, runbooks and final evidence |
| Q04 | [065-9-8 — Qualify controlled Windows and Linux updater delivery](065-9-8-public-windows-linux-qualification.md) | Public-source hardening and real functional updater proof through the controlled validation feed |
| Q05 | [065-9-10 — Prepare releases automatically after approved version-branch merges](065-9-10-merge-driven-release-preparation.md) | Merge-driven coordinator and the single release pipeline; proven by `0.2.0-preview.10` and `.11` |
| Q06 | [065-9-11 — Harden the updater client and publisher after the first public preview updates](065-9-11-updater-client-and-publisher-hardening.md) | Check-time gate reporting, forward-compatible manifests, registry-based Windows install mode, qualified-preview mode, notes and publication-date fidelity, publisher retries |
| Done | [065-9-12 — Let the user choose the update channel, and finish the release-notes automation](065-9-12-update-channel-choice-and-release-notes-automation.md) | Native channel preference between the two compiled feeds, `stable-testing` publication so stable behaves like preview until qualified, tag-dated What's new, notes rendered from highlights |
| Post-1.0 | [065-9-9 — Add trusted Windows signing after 1.0.0](065-9-9-authenticode-public-delivery.md) | Authenticode provider, qualification and OS-level Windows publisher trust |

All criteria below remain the epic completion gate. Each child records its own
evidence; 065-9-7 checks the combined coverage before this epic can be closed.
The updater can ship in previews before conflict/stash features exist. Later
operations and drafts must join its protection contract, and 065-8 revalidates
the final product. Production feed promotion requires 065-9-7; validation builds
and controlled feeds are used first so testing does not depend on publication.

# Scope

- Implement the ADR's Rust-owned updater and typed frontend feature, integrated
  into the existing Changelog/menu/palette and Settings preference surfaces.
- Establish app-wide native install admission and frontend draft protection.
  Inventory every operation before relying on the current session busy helper.
- Add protected release CI, protected signing, one publication coordinator, public
  release assets, and stable/preview manifests in `gitodile`.
- Implement version-tag-triggered publication from `main`'s history, with
  `X.Y.Z-preview.N` selecting preview and `X.Y.Z` selecting stable. Derive the
  GitHub prerelease flag from that same checked version.
- Define and test install-mode detection, target/version/channel contracts,
  bounded networking, progress, error handling, and manual update fallbacks.
- Write the maintainer release/key-recovery runbook and user update/reinstall
  guidance. Keep the issue-report forms and their live contract intact.

# Out of scope

- A custom update API, paid distribution service, telemetry, account or license
  requirement, percentage rollouts, mandatory installation, or channel picker.
- Automatic downgrade, resumable downloads across launches, delta updates,
  managed Linux package repositories, or additional unverified architectures.
- Implementing bundled Git, changing project Git configuration, or updating
  the user's system Git. Future bundled Git travels in the signed app payload.
- Declaring the full application ready for 1.0.0; task 065-8 owns that gate.

# Acceptance criteria

- [ ] The accepted ADR 0010 is implemented; the chosen target/install matrix, updater key custody,
      publisher credential, certificate identities, channel mapping, and initial
      forward version are documented without secrets. No placeholder production
      endpoint/key or falsely stable preview build is shipped.
- [ ] A no-project user can check explicitly; opening Changelog or navigating
      screens causes no request. Automatic checks are off by default; enabling
      them discloses GitHub contact, uses the documented cadence, and sends no
      repository data or stable installation identifier.
- [ ] Controller/port/adapter and Rust ownership follow the architecture guards.
      Visual components never call IPC/plugin APIs, `lib.rs` stays registration
      only, and the renderer cannot bypass native admission through direct
      updater/process permissions or choose URLs, keys, or installer paths.
- [ ] Checks coalesce across entry points. Same/older version, valid upgrade,
      prerelease ordering, stable rejecting preview, missing target/feed,
      invalid manifest, offline, timeout, and HTTP failures are distinct and
      tested. Source/Tauri/Cargo/npm/feed versions agree.
- [ ] Download/verification/ready/install states are truthful, support unknown
      content length and retry, and release resources on cancel or failure.
      An invalid signature or truncated payload cannot become installable.
      Only one candidate is retained; transfer/peak-memory limits are measured
      against representative package sizes, including future bundled Git.
- [ ] Installing requires explicit consent. Native admission prevents races
      with every tracked project/global mutation and background operation,
      including clone/create, hooks, credentials, other projects, and bundled
      helpers. No mutation is killed. Safe reads/watchers drain or stop normally;
      failed admission or pre-install failure restores normal operation.
- [ ] Volatile version-message/settings/conflict-editor drafts are restored or
      cause an actionable install blocker. Unsaved files on disk remain intact;
      updating never commits, stashes, resets, cleans, or changes Git history.
- [ ] Windows installer exit and restart are exercised from a real NSIS install;
      AppImage updates are exercised on Linux. Every advertised target must be
      exercised; macOS remains unadvertised and disabled until task 065-10.
      A `.deb`/`.rpm`, managed, mounted/read-only, or unsupported installation
      receives accurate external-update guidance rather than an AppImage swap.
- [ ] A launch after installer handoff verifies the running version before
      reporting success. Interrupted/failed installs offer reinstall guidance
      without a loop, a forced downgrade, or fabricated rollback guarantees.
- [ ] CI builds from a verified source tag, signs final packages with
      updater-signing mechanisms, and publishes curated public
      artifacts using destination-scoped credentials only in trusted jobs.
      Public tags target public commits and expose no credential or private
      signing artifact. Windows records Authenticode as deliberately deferred
      through `1.0.0`; task 065-9-9 adds OS signing afterwards.
- [ ] Exact reviewed commits on `main` are tagged. Ordinary branch pushes and
      merges publish nothing. Tests reject source tags outside
      `main`, metadata mismatches, unsupported prerelease suffixes, and channel/
      GitHub-flag disagreement. Preview updates only preview; stable promotion
      builds a new stable version and never relabels/overwrites a preview asset.
- [ ] One coordinator creates the manifest and promotes feeds only after all
      required artifacts pass checks and anonymous download verification.
      Partial matrix failure, interrupted publication, retries, and overlapping
      releases cannot overwrite finalized assets or regress/partially update a
      feed. Correct prerelease flags and version-specific asset URLs are tested.
- [ ] The public feedback README includes download/update guidance; forms and
      field IDs remain compatible with task 108 and `check:feedback` passes.
- [ ] English/Spanish copy, keyboard/focus behavior, light/dark, reduced motion,
      accessible progress, and unavailable/error states work at minimum window
      size. Remote notes remain bounded plain text and local notes work offline.
- [ ] Two successively versioned signed test builds prove A-to-B installation
      for each enabled target, preserving app settings, sessions, drafts, and
      dirty tracked/untracked files. Read-only/locked paths, low disk space,
      cancellation, corruption, and reinstall are covered with real artifacts
      where mocks cannot establish platform behavior.
- [ ] README/architecture/design changes describe delivered behavior; runbook
      covers publication, feed caching/withdrawal, settings compatibility, key
      backup/rotation/loss, and retained installers. `pnpm run check` passes;
      publishing also passes `pnpm run check:publication`.

# Relevant files

- `docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md`
- `docs/ARCHITECTURE.md`, `DESIGN.md`, `README.md`, `SECURITY.md`
- `src/app/appRelease.ts`, `src/app/ChangelogDialog.tsx`
- `src/app/App.tsx`, `src/app/AppOverlays.tsx`, `src/app/TitlebarMenu.tsx`
- `src/features/settings/`, `src/features/notifications/`
- `src/runtime/project/sessions.ts`
- `src-tauri/src/application.rs`, `src-tauri/src/repository_access.rs`
- `src-tauri/src/ipc.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/watch.rs`
- `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
- `src-tauri/Cargo.toml`, `package.json`, `.github/workflows/`
- Planned owners: `src/features/app-updates/`, `src-tauri/src/app_updates.rs`

# Dependencies

- Existing Tauri 2 shell, local release model (tasks 086/090), session/operation
  policies, and public feedback contract (task 108).
- Representative packaging/signing environments and configured production
  credentials before publication; platform validation remains subject to ADR 0006.
- Inventory volatile editor state and mutation paths delivered before this task
  starts. Do not make safety depend on a particular screen being mounted.

# Decisions

- Durable decisions and external comparisons live in ADR 0010, not this task.
- Implement before the final feature freeze so 065-8 validates the finished
  update system rather than adding it during release qualification.
- Finalize naming and certificates through the existing release gates before
  any general-public distribution; this task does not waive them.

# Implementation notes

Updater not implemented. Planning follow-up on 2026-09-03 changed the shared
installed release model from alpha to preview, allowed exactly stable/preview,
and updated the existing status-bar interaction assertions and current docs.

The user then approved preparing `0.2.0-preview.1` from `main` commit
`22bab67f76c7fcf702582507032b2512f6ffd960`, carrying the pending planning and
channel changes into the version branch. npm, Cargo (including the app's lock
entry), Tauri, and current docs use that development version. The changelog
omits the unpublished candidate's date, and version-dependent UI tests read
the actual build version. The pnpm lockfile has no root-package version field
and requires no dependency change.

The annotated tag `v0.1.0` already exists locally and on the source remote at
`9fcc5bafafb2a463a82c96ae7b1c1d0e3bf4c66c` (2026-08-27, before the identity
reset); it is preserved. Neither repository had GitHub Releases when checked.
No retrospective versions, preview tag, or release artifacts were published.

Record the selected dependency versions, native admission and
draft inventory, actual matrix, public workflow/feed setup, and any justified
departures from the ADR here as work progresses.

# Validation

Epic decomposition and queue reprioritization on 2026-09-03: `pnpm run check`
passed over 172 Markdown files and 137 task IDs, with architecture checks,
TypeScript, 655 frontend tests, production build, Rust formatting, Clippy and
321 Rust tests. This validates the planning change; all implementation and
real-update acceptance criteria remain open.

Planning and preview-label validation on 2026-09-03: `pnpm run check` passed documentation and
architecture checks, TypeScript, 655 frontend tests, the production build,
Rust formatting, Clippy, and 321 Rust tests. The aggregate gate was rerun after
the channel rename with the same passing counts. `git diff --check` passed.

The complete gate passed again on branch `0.2.0-preview.1` after synchronizing
the development version and omitting the unpublished changelog date: 655
frontend tests, build, formatting, Clippy, and 321 Rust tests. npm, Tauri,
Cargo, and the app's Cargo.lock entry were also checked for exact version
agreement. This validates release preparation, not an installable updater.

Task 065-9-3 completed the Rust-owned native lifecycle on 2026-09-10: bounded
coalesced checks, one verified candidate/download, typed IPC, exact
cancellation, install admission and forward-only observed-version handoff are
implemented behind a deny-by-default target qualification gate. Its local
signature fixtures, resource measurement and focused tests are recorded in the
completed child and the application-update contract. This completed only the
native lifecycle slice; the UI followed in 065-9-4, while signed packages,
publication and real A-to-B target qualification remain later work.

Task 065-9-4 completed the feature-owned frontend controller and the eager,
accessible update interface on 2026-09-10. Changelog, More actions, the command
palette and General Settings share one native lifecycle; background checks are
an off-by-default, disclosed 24-hour opt-in. Signed CI, feed publication and
real A-to-B qualification remain with 065-9-5 through 065-9-7.

Task 065-9-5 implemented the locally verifiable protected tag/matrix/signing
boundary and runbook on 2026-09-10, but remains active: no real signing
credential, protected environment, notarized package or complete signed run is
evidenced, so no target is enabled. Public publication and installed A-to-B
qualification remain exclusively 065-9-6 and 065-9-7.

Task 065-9-6 implemented the locally verifiable public promotion coordinator
and runbook on 2026-09-11. Publication is manual and destination-serialized;
source validation and signing stay outside the credentialed job, immutable assets
are reconciled before anonymous verification, and stable/preview feeds move
only through one non-regressing compare-and-swap commit. The checked
qualification registry disables production and leaves all targets
`qualification_required`. With no signed matrix, destination credential,
working-name clearance, public release or real A-to-B evidence, 065-9-6 remains
active and no feed/target is enabled; 065-9-7 still exclusively owns platform
qualification.

# Closure

Closed on 2026-09-16 when the updater epic was wound down: the code,
pipeline and contracts this task describes are on `main` and were
exercised by the public previews `0.2.0-preview.10` to `.12`. The
criteria left unchecked above are not claimed; its sixteen open epic criteria, which are evidence and operations items rather than code
moved to [065-9-13](../../0.7.0/065-9-13-updater-evidence-and-os-signing.md),
which owns everything the updater still has to prove.
