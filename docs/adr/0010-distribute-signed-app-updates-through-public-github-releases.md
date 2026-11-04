# ADR 0010: Distribute signed app updates through public GitHub Releases

- Status: accepted; channel model superseded by
  [ADR 0019](0019-publish-updates-through-one-channel.md)
- Date: 2026-09-03

[ADR 0019](0019-publish-updates-through-one-channel.md) (2026-10-01) replaces
the two channels below with one: plain `X.Y.Z` releases, the single
`updates/latest.json` feed, a legacy `preview.json` mirror, no channel choice,
and the `testing` and `production` publication modes. Everything below about
`stable`, `preview`, their feeds, the channel preference, prerelease flags and
the four publication modes is historical; hosting, signing, publication order
and the installed-update contract still apply.

Implementation contracts fixed on 2026-09-09 are recorded in the
[application update contracts](../architecture/app-update-contracts.md) and
their executable fixture. They refine this decision without changing its two
channels, hosting, signing, or publication architecture.

[ADR 0045](0045-keep-source-issues-and-releases-in-one-repository.md)
(2026-11-04) replaces the two repositories below with one,
`martinezelx/gitodile`. Everything below about a separate source repository, a
public feedback repository and its README is historical; hosting, signing,
publication order and the installed-update contract still apply.

An amendment accepted on 2026-09-11 makes source visibility explicitly
irrelevant to the release trust boundary. The source repository may be public
or private; signing keys, OS certificates, protected build evidence and the
destination credential remain available only to reviewed environment jobs.
For the first qualified preview phase, the enabled updater matrix is exactly
Windows x86-64 NSIS and Linux x86-64 AppImage. Both macOS targets are planned
but disabled and are owned by follow-up task 065-10.

The repository-name migration approved on 2026-09-14 assigns application
source, builds and automation to `martinezelx/gitodile-desktop`, and public
issues, releases, downloads and feeds to `martinezelx/gitodile`. The earlier
names below describe the historical observation only; no runtime or publication
contract relies on their redirects.

An amendment on 2026-09-14 retires the internal test route that preceded the
first public preview: the separate `validation` signing key and build profile,
the controlled validation feed, the fixed `0.2.0-preview.4`/`.5` and
`.6`/`.7` qualification pairs, the `validation-draft` publication mode and the
controlled qualification bundle. "Development tests use a separate key and
feed" below is therefore historical. Every build now embeds the one production
updater key and is routed only by its version's channel; the candidate build,
OS-trust boundary, updater signing, staging and publication run as jobs of one
`release-pipeline.yml` run dispatched by the merge coordinator; and installed
A-to-B qualification evidence is taken from two real consecutive public
preview releases whose versions are recorded as data in the qualification
registry, never fixed in code. Tags `v0.2.0-preview.2` through `.5` remain in
the source repository as history but certify nothing.

An amendment on 2026-09-15 (task 065-9-11, after `0.2.0-preview.10` and
`.11` had updated real installations through the public feed) moves feed
forward-compatibility from the client to the publisher. An installed client
validates strictly only the manifest entry for its own target and tolerates
other platform keys and unknown fields, so enabling macOS in the feed later
does not strand every Windows and Linux client already installed; the
publisher keeps refusing Darwin rows while task 065-10 is open. "They fail
closed if either macOS key appears" below is therefore historical for the
client and current for the publisher. The same amendment reports a build that
cannot install a candidate at check time (`automatic_update_not_enabled`, a
distinct code from `unsupported_installation` because the remedy differs),
reads the Windows NSIS install mode from the installer's registry hive rather
than the install directory, records that `http_status` is unreachable during
a check with the pinned plugin, and changes publication: the mode is derived
from the qualification registry (a preview whose enabled targets are all
qualified and whose production approval is enabled publishes as
`preview-qualified`, without the testing notice), manifest notes keep their
block structure, `pub_date` is the release's real `published_at` — so the
manifest and hash list are rendered by the publish job after publishing and
reused on a retry — the anonymous download check is retried a bounded number
of times, and a coordinator run that completed without succeeding cannot
authorize a release.

An amendment on 2026-09-15 (task 065-9-12) adds the one channel input that
exists and puts the stable channel under the testing publication policy:

- A person may choose which of the two compiled feeds to follow, from
  Settings → Updates. The choice is a closed enum (`follow_build`, `stable`,
  `preview`) stored in the native app-local data directory, resolved in Rust
  against the build's own channel, and used only to pick between the two
  compiled feed constants. The renderer still names no feed, URL, key or
  target. "No channel picker" below is therefore historical; the invariant
  that survives is that no feed or URL is ever supplied from outside the
  build. A stable build that opted into previews is offered a newer preview
  and still refuses older versions; a preview build restricted to stable is
  offered only stable successors and reports `current` otherwise. Nothing is
  downloaded or installed without the person, on either choice.
- Until the qualification registry proves every enabled target and
  production approval, a stable candidate publishes as `stable-testing`: the
  same policy as `preview-testing` (Tauri updater signature only, no
  platform qualification, Authenticode still deferred, the testing notice
  prepended to the notes), but as a non-prerelease GitHub release that
  advances `stable.json` and, when newer, `preview.json`, through the
  reviewed stable environment. The compile-time test-target gate
  (`GITODILE_TEST_UPDATE_TARGETS`, formerly the preview-only
  `GITODILE_PREVIEW_TEST_UPDATE_TARGETS`) is supplied to every build. The
  purpose is to exercise both channels end to end with real installations;
  `production` remains reserved for a qualified registry, and OS signing for
  both channels is a later decision (ADR 0011 is unchanged).
- What's new dates each version by its release tag, resolved at build time,
  and the build job refuses a tagged release whose own tag did not resolve;
  the day the release branch was cut is only the fallback for an untagged
  checkout. The public notes' Highlights section is rendered from the same
  per-release highlights file the app shows, between markers the release
  scripts own, and the merge coordinator refuses a release whose two
  descriptions disagree.

## Context

GitOdile needs to update its installed desktop application without interrupting
Git operations, losing UI drafts, exposing release credentials or protected
build evidence, or requiring users to authenticate. This is separate from getting a project's remote changes and
from the existing system-Git update command.

Inspection on 2026-09-03 found:

- At the original observation, the repositories still used the temporary names
  `project-gitodile` and `gitodile-feedback`; the latter was public and had no
  releases. Task 108 established the public issue forms.
- Tauri is on v2. The updater is not installed, there is no updater key or
  endpoint in the app configuration, and CI does not publish installers.
- At the start of planning the installed version was `0.1.0`; its separate alpha label was renamed to
  preview when the user settled the two-channel policy below. The local
  Changelog deliberately opens without a network request.
- [Task 065-8](../../work/0.7.0/065-8-release-hardening.md)
  previously owned the unspecified update strategy. There was no updater ADR.
- [ADR 0006](0006-defer-macos-and-linux-runtime-validation.md) still requires
  real packaged-platform evidence. [ADR 0001](0001-adopt-a-progressive-hybrid-git-backend.md)
  plans to update bundled Git with the app; that bundling is not implemented
  by this decision.
- Native repository locks are scoped by common Git directory. Frontend session
  busy state does not establish a process-wide, race-free installation gate;
  clone, initialization, background work, and other projects also matter.

The user accepted this direction on 2026-09-03, with exactly two channels and
short-lived version branches merged into `main`. This records the agreed
design, not a claim that update infrastructure exists. Implementation belongs to
[epic 065-9](../../work/done/065-9-signed-application-updates.md).

## Decision

### Hosting and channels

Use the official Tauri 2 updater from Rust and publish its signed artifacts as
GitHub Release assets in `martinezelx/gitodile`. Source and reviewed non-secret
release configuration live in `martinezelx/gitodile-desktop`; Actions artifacts,
signing material and protected build evidence remain access-controlled
regardless of that repository's visibility.
Installers are release assets, never binary commits or Git LFS objects.

The public feedback repository can serve both feedback and downloads. Public
release tags refer to commits in that repository, never to source-repository
commits. Record the source tag/SHA and build run in protected release evidence,
and expose only intentionally public provenance. GitHub's automatic source
archives will contain the public feedback repository, not the application.
Write curated product release notes: generating them from feedback commits
would describe changes to issue forms rather than GitOdile.

Use two small static Tauri manifests in the public repository:

| Feed | Planned HTTPS endpoint | Selection |
| --- | --- | --- |
| Stable | `https://raw.githubusercontent.com/martinezelx/gitodile/main/updates/stable.json` | Full releases only |
| Preview | `https://raw.githubusercontent.com/martinezelx/gitodile/main/updates/preview.json` | Preview builds and their stable successor |

These endpoints are planned and do not exist yet. Each is a complete Tauri
static manifest with version, notes/date, and URL/signature entries for the
supported target matrix. Archive the exact manifest as `latest.json` in each
versioned release. Every binary URL names that release's immutable version
tag, not a moving `latest` alias. Only the feed pointers change on promotion.
Account for raw-content caching: promotion is eventually visible, not instant.

GitHub excludes drafts and prereleases from its latest-release selection, so
`releases/latest/download/latest.json` alone does not cover the current preview
product. Keep correct GitHub prerelease flags rather than mislabeling preview as
stable to make the endpoint work. See the [release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release).

There are exactly two release channels: `stable` and `preview`. Do not add
alpha, beta, RC, or nightly channels. Derive the installed feed from checked
build metadata; no channel picker or arbitrary endpoint field in the first
implementation (the 2026-09-15 amendment above adds a closed-enum choice
between the two compiled feeds, never an endpoint field). Preview builds use
preview, stable builds use stable, unless the person chose otherwise.
A stable publication can advance preview too if it does
not replace a newer preview. Once that stable build runs it follows stable.
Preview and stable initially replace the same app identity; side-by-side
installation is a separate decision.

Enforce matching versions in npm, Cargo, Tauri, release tags, manifests, and
the installed release model. New preview builds use real SemVer prerelease
versions in the form `X.Y.Z-preview.N`, not only a display badge. Stable versions
are `X.Y.Z`, without a `-stable` suffix. Account for the current `0.1.0` baseline:
`0.1.0-preview.1` is older, not a forward update. The initial label-only rename
kept `0.1.0`; the user subsequently approved preparing `0.2.0-preview.1` on its
own version branch. A version under development is not yet a published release:
keep its publication date absent until it ships. Keep normal newer-version checks;
stable must also reject a prerelease accidentally placed in its feed. A missing
feed/target is unavailable or unsupported, never proof of being up to date.
Initialize a channel with a valid manifest before shipping clients using it.
Existing updater-less builds require a manual installer upgrade to the first
updater-enabled build; that build can then receive subsequent signed updates.

This needs no custom update server, account, client-side token, or runtime
GitHub REST release listing. [GitHub documents](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
up to 1,000 assets per release, each under 2 GiB, with no total release-size or
bandwidth limit. Private CI minutes, signing services, and platform QA remain
separate costs. Retain these public paths for installed clients if hosting
changes later; a future owned domain can be introduced through a bridge build.

### Signing and publication

#### One main branch, version branches, immutable release tags

Both channels live in `main`'s history. There is no permanent `stable`,
`preview`, or `develop` branch. The user-requested release workflow is:

1. Create a short-lived branch from `main` named `release/<exact-version>`, for
   example `release/0.2.0-preview.1`. Routine work can continue to follow the
   existing direct-to-main convention; this branch is release preparation.
2. Prepare that version and its notes, run the required checks, and merge the
   release PR into `main`.
3. A default-branch coordinator validates the closed, merged same-repository
   pull request, exact protected-`main` merge SHA, required checks, canonical
   branch, synchronized metadata and curated notes. It then creates
   `v0.2.0-preview.1` idempotently at that exact SHA.
4. The coordinator explicitly dispatches the private candidate workflow after
   tag creation; a tag created with the repository workflow token does not emit
   another workflow-triggering push event. Candidate, signing and publication
   stages revalidate the immutable identity and derive channel and GitHub flags
   from the version. Direct pushes, manual tags and ordinary merges do not enter
   this path.
5. Repeat for `0.2.0-preview.2`, then prepare and tag `0.2.0` when ready for a
   stable release. These are illustrative versions, not a release schedule.

| Source version / tag | Channel | GitHub prerelease | Feed publication |
| --- | --- | --- | --- |
| `0.2.0-preview.1` / `v0.2.0-preview.1` | `preview` | `true` | `preview.json` only |
| `0.2.0-preview.2` / `v0.2.0-preview.2` | `preview` | `true` | `preview.json` only |
| `0.2.0` / `v0.2.0` | `stable` | `false` | `stable.json`; also preview if newer than its current candidate |

The canonical branch is part of authorization and the checked version tag is
the immutable release identity.
There is no separate free-form channel input or manual GitHub flag that may
contradict it. Reject other prerelease suffixes, malformed versions, mismatched
metadata, and tags outside `main` before signing or publication.

Preserve existing published Git tags at their original commits, including
legacy tags from before this pipeline. A historical tag does not certify a
current release or retroactively publish artifacts. Add retroactive version
tags only when their version/build identity is supported by evidence; use a
separate `milestone/` namespace for optional development landmarks, excluded
from the version publisher. Do not invent historical releases or their dates.

SemVer orders `0.2.0-preview.1 < 0.2.0-preview.2 < 0.2.0`. A stable promotion is
a newly versioned and signed build, even when the functional code matches the
last preview. Editing that preview release's GitHub flag does not change the
installed version and must not be used as promotion. See the
[SemVer specification](https://semver.org/).

The head of `main` can be preview while stable users receive the last stable
tag. A stable release includes all changes in its tagged commit, so keep one
release train: validate the entire candidate before marking it stable. A
separate maintenance/hotfix branch can be decided if backports become necessary;
this workflow does not pretend to exclude unready changes already on `main`.

#### Artifact trust and publishing order

Use Tauri's mandatory artifact signature verification with a pinned public
key and HTTPS. Keep the production private key/password in protected CI
secrets with a recoverable offline backup. Development tests use a separate
key and feed. Do not distribute credentials, permit insecure production
transport, or accept endpoints/keys/artifact paths supplied by the renderer.
Tauri signs the artifact, not the whole JSON manifest: protect feed writes,
validate metadata and release URLs, and render remote notes as bounded plain
text. Consult [Tauri's updater contract](https://v2.tauri.app/plugin/updater/).

Treat updater signing and operating-system signing as separate requirements:
Windows Authenticode and macOS Developer ID/notarization are not supplied by
the updater key. Sign/package in the correct order so the updater signature
covers the final bytes. Follow the [Windows signing guide](https://v2.tauri.app/distribute/sign/windows/)
and [macOS signing guide](https://v2.tauri.app/distribute/sign/macos/).
ADR 0011 defers Windows Authenticode and all macOS delivery until after
`1.0.0`; eligible Windows packages through that boundary retain unchanged
bytes and record `authenticode_deferred` before updater signing.

Build in CI from a verified source tag. Repository visibility grants no signing
or publishing authority. Restrict credentials to trusted, reviewer-protected
release environments; pin third-party actions to reviewed commits. Use a
short-lived GitHub App installation token scoped to the public destination
with Contents write permission. A repository-scoped, expiring fine-grained
PAT is an acceptable initial alternative. The workflow's automatic
[`GITHUB_TOKEN`](https://docs.github.com/en/actions/concepts/security/github_token)
cannot write another repository. The destination credential belongs only in
the publishing job, not the app or ordinary PR builds.

Use one publication coordinator after the build matrix, not competing matrix
jobs that overwrite the same manifest. [Tauri Action](https://github.com/tauri-apps/tauri-action)
supports publishing to a different owner/repository; its `releaseCommitish`
must identify the public destination when it creates that tag. The pipeline:

1. Builds and signs each supported artifact, retaining private CI artifacts.
2. Assembles a single manifest; verifies versions, target coverage, signatures,
   hashes, names, and URLs. Failing any required target prevents promotion.
3. Uploads all assets, manifest, hashes, notices, and reviewed notes into one
   draft public release. Finalized version tags/assets are not overwritten.
4. Publishes the verified release, then checks anonymous access to the actual
   downloads. Failed checks leave the current feed untouched.
5. Advances the selected feed in one serialized, conflict-checked commit only
   after all checks pass. An older concurrent run cannot regress a feed.

Reconcile completed steps before retrying uncertain publication results. Do
not regenerate or replace a finalized signed asset under an existing version.
Review the public repository README/download guidance while preserving the
issue-form contract. Run `check:publication` before publishing desktop builds.

### Desktop ownership and user flow

Use a small `app-updates` feature with a controller, typed port, Tauri adapter,
and eager update UI. The shell supplies existing menu/palette/Changelog entry
points and coordination. Opening Changelog still reads bundled notes only;
checking remote releases is a separate explicit action. No new screen is
needed. Settings owns the user preference through a narrow public contract.

Rust owns pending update handles, verification, and installer invocation in
`app_updates.rs`; `ipc.rs` adapts narrow commands and `lib.rs` only registers
them. Keep policy checks in `application.rs`, including process-wide admission
for installation. Classify metadata checks as read-only, staging downloads as
local mutation, and installation/restart as a platform mutation. The plugin's
Rust API avoids granting the WebView direct install/relaunch capabilities.

Start with manual checking plus a startup-check preference, on by default
(amended from off: a check is one bounded request that sends no project data
and no identifier, never downloads on its own, and is disclosed beside the
switch — off by default meant almost nobody learned a fix had shipped). When
enabled, check after startup has settled and at most once per 24 hours while
the app runs; never on screen visibility or repository activation. A check that
finds a release records a notification; one that does not records nothing. Deduplicate manual/automatic requests, use bounded
timeouts, and avoid retry storms. Never download or install automatically.
Disclose contact with GitHub, which necessarily sees ordinary request metadata
such as IP address; transmit no project data or persistent installation ID.

Present available version, channel, notes, and download progress; then offer
an explicit **Install and restart** action and postponement. Model checking,
current, available, downloading, verifying, ready, blocked, installing,
unavailable, and failed states. Unknown transfer length needs an honest progress
indicator. A finished transfer is not yet a verified update: the inspected
[plugin implementation](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/src/updater.rs)
emits download-finished before verifying its signature and buffers the download
in memory. Mark ready only after successful verification, retain at most one
candidate, and measure peak memory with representative bundled-runtime size.
Do not promise resumable or cross-launch downloads in the first version.
Cancellation is a distinct normal terminal state for a check or download, not
a generic failure and never an installable result. The native service keeps at
most one immutable candidate; renderer commands can refer to its opaque ID but
cannot replace any of its validated release fields.

Before invoking the installer:

- Acquire native app-wide admission that prevents new operations from racing
  the final busy check, across all projects and global clone/create/tooling
  operations. Never kill a mutation, hook, or credential operation to update.
- Suspend automatic work; finish or safely cancel/drain read-only work and
  stop app-owned watchers/processes through their normal lifecycle. External
  tools editing a repository are outside this gate and are not terminated.
- Protect volatile frontend work such as version descriptions and conflict
  editor buffers: persist/restore supported drafts or block installation with
  an actionable explanation. Dirty files already on disk are not a reason to
  force a commit, stash, reset, or recovery snapshot.
- Revalidate the candidate and current installation eligibility. On a
  pre-install failure release admission and restore normal app behavior.

Windows exits during installation, so deferring only a later `relaunch()` is
too late to protect operations or UI work. Use the supported installer handoff
and confirm the resulting version on the next launch. Do not declare success
just because the old process exited. If the result is uncertain, explain it
and provide a public reinstall link; do not loop an unattended install.

### Platform contract and recovery

Current release matrix, subject to the real qualification evidence below:

| Installation | State | Proposed update behavior |
| --- | --- | --- |
| Windows x64 | Enabled candidate | NSIS per-user installation, passive installer progress; one installer family in the feed |
| Linux x64 AppImage | Enabled candidate | Updater-signed AppImage replacement, after checking the actual writable installed file |
| macOS Apple Silicon / Intel | Planned, disabled | No feed entry or published supported package until task 065-10 proves signing, notarization, replacement safety and installed A-to-B behavior |
| Linux `.deb` / `.rpm`, managed or read-only installs | Manual only | Explain manual/package-manager update; do not overwrite them with an AppImage |

The two enabled rows remain unqualified until two real consecutive signed
packages pass the installation evidence required by tasks 065-9-7 and 065-9-8.
The public manifests and release asset set must contain exactly those qualified
rows; the publisher fails closed if either macOS key appears, while an
installed client tolerates rows for other targets (2026-09-15 amendment). The
official Tauri updater
repository had an open macOS
[replacement-safety report](https://github.com/tauri-apps/plugins-workspace/issues/3505)
when contracts were fixed on 2026-09-09; macOS cannot be enabled without a
reviewed fix or independently tested mitigation and real evidence under task
065-10.

Support detection includes the packaging/installation mode, not just OS/CPU.
Keep downloads for documented Linux package formats available alongside
AppImage. Expanding architectures, store packages, and package repositories is
separate work. Test normal install locations, spaces/non-ASCII paths, file
locks, permissions, low disk space, and bundled child-process shutdown. A
binary compiled on CI is not sufficient platform evidence.

Keep old signed installers available and document reinstall and settings-format
compatibility. Prefer a higher-version repair release over forced downgrade.
Reverting a feed stops offering that update after caches expire; it does not
undo an installation or recall a downloaded candidate. Tauri is not a complete
automatic rollback system. No updater path mutates user repositories.

Document key loss and compromise responses. Planned rotation needs a tested
bridge signed with the old key that trusts the new one; losing the old key
before that bridge generally requires manual reinstall for old clients. Never
disable verification to recover the channel. Preserve forward-compatible
settings where possible and back up app data before destructive migrations.

## External implementation evidence

Sources inspected on 2026-09-03; these are observations, not code to import.

- **GitButler**, commit `5454f68ef82c10a7299f3f70b9ed3cac68e05e29`: its
  [release configuration](https://github.com/gitbutlerapp/gitbutler/blob/5454f68ef82c10a7299f3f70b9ed3cac68e05e29/crates/gitbutler-tauri/tauri.conf.release.json)
  points at a first-party endpoint parameterized by platform and installed
  version. Its [updater service](https://github.com/gitbutlerapp/gitbutler/blob/5454f68ef82c10a7299f3f70b9ed3cac68e05e29/apps/desktop/src/lib/updater/updater.ts)
  separates checks, downloads, installation, restart, and manual/background
  errors; read-only installations receive external update guidance. Reusable
  principle: own update policy and failure states above the plugin. A custom
  release service serves their needs but is unnecessary for GitOdile's first
  channel. Its [license](https://github.com/gitbutlerapp/gitbutler/blob/5454f68ef82c10a7299f3f70b9ed3cac68e05e29/LICENSE.md)
  is FSL-1.1-MIT; this proposal adapts no source, assets, or product copy.
- **Yaak**, commit `d2d4b80a094b23b53c65b83e4ae42df53f51fbd1`: its
  [workflow](https://github.com/mountain-loop/yaak/blob/d2d4b80a094b23b53c65b83e4ae42df53f51fbd1/.github/workflows/release-app.yml)
  builds platform artifacts with Tauri Action into draft GitHub Releases and
  supplies updater and OS-signing credentials separately. Its
  [native update service](https://github.com/mountain-loop/yaak/blob/d2d4b80a094b23b53c65b83e4ae42df53f51fbd1/crates-tauri/yaak-app-client/src/updates.rs)
  distinguishes channels, user/background checks, installation modes, and
  shuts down an owned helper before Windows replacement. Reusable principle:
  packaging and child-process lifecycle are part of update correctness.
  GitOdile does not need its identification headers or extra update UI modes.
- **CrabNebula Cloud** is a hosted distribution/update option documented by
  [Tauri](https://v2.tauri.app/distribute/crabnebula-cloud/). It is an alternative
  when managed distribution justifies another service, not a prerequisite of
  the official updater.

## Consequences

- Public downloads require no account and expose neither release credentials
  nor protected build evidence. One existing public destination handles support
  and releases.
- Updater correctness includes publication ordering, native shutdown, draft
  protection, and installed-package evidence; adding a plugin alone is not done.
- GitHub availability, caching, public-repository continuity, signing-key
  custody, and destination write credentials become release dependencies.
- Static feeds provide channels but no per-user rollout, forced-update policy,
  or automatic rollback. Add a dynamic service only against a concrete need.
- Hosting/signing credentials, certificates, source-repository security controls,
  the actual supported matrix,
  and the first release version must be configured/verified during execution.
  General public-release gates remain with task 065-8, including the existing
  product-name clearance requirement in the product strategy.

## Alternatives considered

- **Private source-repository Releases:** require user access or a distributing
  proxy. Embedding a GitHub credential in the app is not acceptable.
- **A third public releases-only repository:** technically equivalent but adds
  another destination without a current ownership/access requirement. Revisit
  if support and publishing need different maintainers or permissions.
- **GitHub's single latest-release URL:** excellent for stable-only products;
  insufficient for the existing preview lifecycle without extra channel policy.
- **Owned API plus object storage/CDN:** useful for staged rollouts, richer
  compatibility selection, or a portable branded endpoint. Adds infrastructure
  and operations before those requirements exist.
- **Managed distribution such as CrabNebula:** reduces service ownership but
  introduces an external vendor and plan choice; not needed for this scope.
- **Manual installers only:** retain as recovery and for unsupported package
  modes, but they do not satisfy the requested in-app update experience.
