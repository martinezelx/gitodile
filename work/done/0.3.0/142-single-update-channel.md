---
id: 142
title: Publish and update through one release channel
status: done
priority: high
type: refactor
areas:
  - release
  - automation
  - backend
  - frontend
  - documentation
created: 2026-10-01
completed: 2026-10-01
parent:
queue:
---

# Goal

Replace the two update channels (`stable`, `preview`) with exactly one, in the
installed client, the release automation and the documentation, so that every
merged `release/X.Y.Z` pull request publishes one version that every installed
client is offered.

# User outcome

- People who install GitOdile get every release; there is no channel to choose
  and no Settings control to understand.
- The maintainer ships by preparing `release/X.Y.Z`, developing on it and
  merging it into `main`: one version shape, one feed, one publication policy.

# Context

The maintainer decided on 2026-10-01 that two channels slow down a period of
fast iteration. ADR 0010 and its 2026-09-15 amendment (task 065-9-12) define
the current model: the build's channel comes from its version
(`X.Y.Z-preview.N` → preview, `X.Y.Z` → stable), Settings → Updates offers a
closed `follow_build` / `stable` / `preview` choice, a stable publication also
advances `preview.json` when newer, and the pipeline has four publication
modes (`preview-testing`, `preview-qualified`, `stable-testing`, `production`)
behind two GitHub environments (`public-release-preview`,
`public-release-stable`).

State observed on 2026-10-01:

- The public repository `martinezelx/gitodile` serves only
  `updates/preview.json` (at `0.2.0-preview.12`); `stable.json` was never
  created and no stable release was ever published.
- The newest shipped build, `v0.2.0-preview.12`, predates the channel
  preference: no installed client reads `stable.json` or has a stored channel
  preference. Every installed updater-enabled client reads `preview.json` and
  only that URL.
- `main` is at `0.2.0-preview.12` and contains the channel preference.
  `release/0.3.0-preview.1` is 68 commits ahead of `main` and adds preview-only
  UI (the preview build glyph, 9b76fd8) that this task does not see; task 143
  removes it on the release branch.

This task lands on `main` in its own pull request: it touches `.github/` and
`scripts/release/`, which a release branch may never carry.

# Scope

- **Version shape.** A release version is `X.Y.Z` only. `release-candidate.mjs`,
  `release-prepare.mjs`, `merge-release.mjs` and the tag check in
  `release-pipeline.yml` refuse `-preview.N` for a new release. Anything that
  reads a *previous* version (feed comparison, the installed version, the
  `listChangesSince` tag lookup, the highlights catalogue) still accepts the
  legacy `X.Y.Z-preview.N` shape so history and `0.2.0-preview.*` installs
  keep working.
- **Native client (`app_updates.rs`).** Remove `ReleaseChannel`,
  `ChannelPreference`, `UpdateChannelSetting`, the preference file and its
  read/persist code, the `set_channel` / channel-setting commands and the
  `ChannelMismatch` channel logic. One compiled feed constant. The installed
  version may be any valid version, including legacy `-preview.N` (main's own
  build is `0.2.0-preview.12`); a candidate must be a plain `X.Y.Z` newer than
  it, and a prerelease candidate in the feed is a feed error. A stale
  `app-update-channel-v1.json` left in app data is ignored, never read.
  `production_target_is_enabled` loses its channel parameter.
- **IPC.** Remove the channel commands from `ipc.rs` and `lib.rs`; update
  `docs/architecture/025-ipc-contract.json` and the IPC contract test.
- **Frontend.** Remove the channel picker from Settings → Updates, the channel
  from the app-updates port, adapter, controller, domain and update dialog,
  `AppReleaseChannel` and the preview branch of `appRelease.ts` (keep ordering
  of legacy versions where history is sorted), and any channel copy in
  `translations.ts`. Delete `channelGlyph` if nothing on `main` still uses it.
- **Feeds.** Builds read one feed, `updates/latest.json` (decision below).
  Every publication writes the same manifest bytes to `latest.json` and, as a
  legacy mirror, to `preview.json`, in the same serialized conflict-checked
  commit, with the existing no-regression rule applied to each file.
  `stable.json` is never created. The legacy mirror is one named constant in
  the publisher with a comment saying when it may be retired.
- **Publication policy.** Collapse the four modes into `testing` (no
  qualification, testing notice) and `production` (qualified registry); every
  GitHub release is non-prerelease. Collapse `previewTestingAllowed` /
  `previewQualifiedAllowed` / `stableTestingAllowed` in
  `qualification-evidence.mjs` accordingly, and the two notices into one.
  Update the public README download guidance written by
  `updateFeedbackReadme` (no "Preview releases are marked as prereleases").
- **Workflow.** `release-pipeline.yml` publishes through one environment. Use
  `public-release` (see operational steps); remove the mode-based environment
  expression and preview/stable wording.
- **Contracts and checks.** Update `docs/architecture/app-update-contracts.md`,
  its executable fixture `065-9-1-app-update-contract.json`,
  `scripts/check-app-update-contracts.mjs` and every release test
  (`public-release`, `merge-release`, `release-pipeline`, `highlights`,
  `qualification`) to the one-channel model.
- **Docs.** New ADR 0019 "Publish updates through one channel" that supersedes
  the channel sections of ADR 0010 (amend 0010's header to point at it; do not
  rewrite its history). Update `AGENTS.md` (development conventions: run
  `pnpm run release:prepare X.Y.Z` from `main` at the start, develop on
  `release/X.Y.Z`, merge to release), `README.md` (the "Current development
  version" line, which `release-prepare.mjs` rewrites, loses its channel),
  `docs/ARCHITECTURE.md`, `docs/release/public-publishing.md`,
  `docs/release/signed-builds.md`, `docs/release/updater-qualification.md`,
  `docs/PRIVACY.md` if it names channels, and the "both channels" wording of
  task 065-9-13.

# Out of scope

- Renaming the `release/0.3.0-preview.1` branch and publishing `0.3.0`
  (task 143).
- Removing preview-only UI that exists only on the release branch (task 143).
- Rewriting history: old `v0.2.0-preview.*` tags, releases, notes and
  highlights stay as they are.
- OS signing and qualification evidence (task 065-9-13).
- Deleting `preview.json` from the public repository.

# Acceptance criteria

- [x] No source, script, workflow or current doc models more than one update
      channel; `rg -i "preview|stable" src src-tauri/src scripts .github` finds
      only legacy-version parsing, the legacy feed mirror and history.
- [x] `release:prepare` refuses `0.3.0-preview.2` and accepts `0.3.0`.
- [x] A client built from `0.2.0-preview.12` and one built from `0.3.0` are
      both offered `0.3.1` from the fixtures; an equal, older or prerelease
      candidate is never offered (Rust unit tests).
- [x] The publisher writes identical bytes to `latest.json` and `preview.json`
      and refuses to regress either (release tests).
- [x] Settings → Updates shows no channel control; the update dialog, About
      and status bar still render correctly in light and dark themes.
- [x] ADR 0019 exists and ADR 0010 points at it.
- [x] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/app_updates.rs`, `src-tauri/src/ipc.rs`, `src-tauri/src/lib.rs`
- `src/features/app-updates/`, `src/app/appRelease.ts`, Settings updates section
- `scripts/release/` (all), `scripts/check-app-update-contracts.mjs`
- `.github/workflows/release-pipeline.yml`
- `docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md`
- `docs/architecture/app-update-contracts.md`,
  `docs/architecture/065-9-1-app-update-contract.json`,
  `docs/architecture/025-ipc-contract.json`
- `docs/release/`, `AGENTS.md`, `README.md`

# Dependencies

None. Task 143 depends on this one.

# Decisions

- **One feed named `latest.json`.** No installed client reads `stable.json`,
  so the single feed's name is free; a neutral name avoids carrying a channel
  word forward. `preview.json` is kept as a mirror because every installed
  `0.2.0-preview.*` client reads only that URL; retire it only after a release
  note announces it and the maintainer accepts that older installs then need a
  manual reinstall.
- **Releases are never GitHub prereleases**, so `releases/latest` also points
  at the newest version.
- **Legacy prerelease versions stay readable**, not publishable: main's own
  version and installed clients are `-preview.N`.

# Operational steps (maintainer, GitHub settings)

These are repository settings, not code; the implementer lists them in the
pull request and does not change them.

1. Create environment `public-release` in `martinezelx/gitodile-desktop` with
   `GITODILE_PUBLIC_RELEASE_TOKEN` and the protected-branches policy, and decide
   whether it keeps a required reviewer (today only `public-release-stable`
   has one; it adds one approval click per release).
2. After the first single-channel release succeeds, delete
   `public-release-preview` and `public-release-stable`.

# Implementation notes

Implemented 2026-10-01 on `feature/single-update-channel` (from `origin/main`).

- Native: `app_updates.rs` keeps one `FEED` constant (`updates/latest.json`);
  `parse_release_version` accepts only `X.Y.Z` and `parse_installed_version`
  also the legacy `X.Y.Z-preview.N`; `version_decision` offers only a newer
  release and treats a prerelease candidate as `invalid_version`. The
  candidate identity domain moved to `gitodile-update-candidate-v2` (it no
  longer hashes a channel). The handoff record accepts a legacy `from`
  version. `ChannelMismatch` and the now-unused `AppErrorCode::UpdateOperationBusy`
  are gone; IPC drops `get_app_update_channel` / `set_app_update_channel`
  (77 commands).
- Frontend: no channel control, no channel on the candidate, installed
  release or changelog entries; the `.channel-badge` pill is gone from the
  status bar, About and What's new (legacy versions still read as
  `v0.2.0-preview.12`).
- Scripts: `parseReleaseVersion` (`X.Y.Z` only) and `parseKnownVersion`
  (adds legacy previews) in `release-candidate.mjs`; modes `testing` /
  `production`; gate `{ productionAllowed, testingAllowed }`;
  `productionAllowed(registry)` replaces `qualifiedPreviewAllowed`;
  `derivePublicationMode(qualification)`; `FEED_FILES = ["latest", "preview"]`
  written with identical bytes; GitHub prerelease always false; publisher
  check `previewPublication` renamed `testingPublication`; qualification
  feed URL may be either public feed file. `release:prepare` writes
  `Current development version: **X.Y.Z**.` and still accepts the old README
  line once.
- Workflow: one `public-release` environment; no `channel` output or
  `GITODILE_RELEASE_CHANNEL`; tag guard `vX.Y.Z` only.
- Contract fixture schema 3 (no channels, `feeds.feed` + `legacyMirrors`).
- Docs: ADR 0019, ADR 0010 header, AGENTS, README, DESIGN, ARCHITECTURE,
  contracts, runbooks, code-signing policy, roadmap queue, task 065-9-13.
- The offline updater-key backup gate in `signed-builds.md` was later
  deferred to `1.0.0` by the maintainer (task 143, 065-8).

# Validation

- `pnpm run check` (docs, architecture, typecheck, vitest, build, cargo fmt,
  clippy `-D warnings`, 404 Rust tests): exit 0 on 2026-10-01.
- `node --test scripts/release/*.test.mjs`: all pass (pipeline 13, highlights
  + merge 15, publication 24).
- Settings → Updates and the update dialog rendered in a throwaway browser
  harness (since deleted): no channel group or chip; installed
  `v0.2.0-preview.12` and candidate `v0.3.0` shown plainly.
- Not validated in the running Tauri app or against GitHub here; task 143
  then published `0.3.0` through this pipeline and updated a real
  `0.2.0-preview.12` install to it. Merged as
  martinezelx/gitodile-desktop#48 (`20080a6`).
