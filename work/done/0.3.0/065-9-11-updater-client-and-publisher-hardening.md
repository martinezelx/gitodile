---
id: 065-9-11
title: Harden the updater client and publisher after the first public preview updates
status: done
priority: high
type: feature
areas:
  - desktop
  - release
  - automation
  - documentation
created: 2026-09-15
completed: 2026-09-16
parent: "065-9"
queue:
---

# Goal

Close the correctness and forward-compatibility findings from the 2026-09-14
updater/release review that remain open after the single release pipeline
shipped `0.2.0-preview.10` and an installed client updated itself to
`0.2.0-preview.11` through the public `preview.json` feed.

# User outcome

- A client whose build cannot install updates says so at check time, in plain
  words, instead of downloading a package and then refusing it with a message
  about "managed installations".
- Enabling macOS in the feed later (task 065-10) does not silently strand every
  Windows and Linux client already installed.
- A GitOdile installed in a custom directory on Windows is still updatable.
- Release notes in the update dialog keep their paragraphs and bullets, and the
  shown publication date is the real one.
- Once both targets are qualified, previews stop carrying the "not qualified"
  notice.

# Context

The review on 2026-09-14 (recorded in the ADR 0010 amendment and in this
epic's session history) consolidated the release pipeline, retired the
internal validation route and fixed the publisher against real GitHub
behaviour. Four defects were found only when the pipeline first ran against
GitHub (run-name reported in `name`, drafts invisible to the tag lookup,
non-reproducible installers versus a filled draft, `.cmd` spawning on
Windows); each now has an end-to-end test. The findings below were identified
in the same review but deliberately left for a separate task so the first
public previews could ship.

Observed facts this task relies on:

- `finish_check` in `src-tauri/src/app_updates.rs` consults only
  `installation_error(mode)`; `target_is_enabled` is checked in
  `revalidate_install_candidate`, after download and verification.
- `validate_raw_manifest` requires exactly the four top-level keys and rejects
  any `platforms` key other than `windows-x86_64`/`linux-x86_64`, so a feed
  that gains `darwin-*` entries is `invalid_manifest` for every existing
  client.
- `detect_installation_mode` classifies an NSIS install as per-user only when
  the executable lives under `%LOCALAPPDATA%`, and its temp-directory check
  compares a canonicalized (`\\?\`) path with a non-canonicalized one, so it
  never matches on Windows.
- `tauri-plugin-updater 2.11.0` logs and discards a non-2xx feed status
  (`updater.rs` around line 557), ending in `ReleaseNotFound`; the contract's
  `http_status` error is unreachable during a check.
- The `stage` job derives the publication mode from the channel alone, so
  every preview is `preview-testing` and carries `PREVIEW_TESTING_NOTICE`
  even after qualification.
- `normalizeNotes` in `scripts/release/public-release.mjs` collapses all
  whitespace to single spaces; `plain_text_notes` in Rust preserves `\n`.
- `pub_date` is the merge commit's committer date (preview.11: commit
  10:51Z, publication 11:13Z).
- `publish()` in `scripts/release/github-publication.mjs` downloads assets
  anonymously immediately after `PATCH draft:false` with no retry; a CDN
  delay would fail a publication that is otherwise complete.
- `release-pipeline.yml` `validate` accepts a coordinator run whose `status`
  is `completed` regardless of `conclusion`.

# Scope

Client (`src-tauri/src/app_updates.rs`, contract JSON and fixture):

- Report an update the build cannot install at **check** time. When
  `target_is_enabled` is false for the current target, `finish_check`
  produces `blocked` with a new error code (working name
  `automatic_update_not_enabled`) and a message that names the manual
  download; `unsupported_installation` is reserved for managed/store/mounted
  installations. Add the code to `065-9-1-app-update-contract.json`, the
  Rust enum, the TypeScript `domain.ts`, both translation dictionaries and
  the contract check.
- Make manifest validation forward-compatible. Validate strictly only the
  entry for the running target (url origin/path, signature bounds, size);
  tolerate unknown `platforms` keys and unknown top-level keys within the
  existing byte and entry limits; keep rejecting a missing target, a
  malformed own entry and oversized payloads. Update
  `docs/architecture/app-update-contracts.md` and ADR 0010, which currently
  say the client fails closed on any macOS key.
- Detect Windows NSIS per-user installation from the uninstall registry key
  (HKCU vs HKLM `Software\Microsoft\Windows\CurrentVersion\Uninstall`) rather
  than the install directory, keeping the writable-directory probe; fix the
  temp-directory comparison so both sides are canonicalized or neither is.
- Record in the contract document that `http_status` cannot be produced by a
  check with the pinned plugin; do not promise it in the UI.

Publisher (`scripts/release/`):

- Derive the publication mode from the qualification registry: a preview
  whose enabled targets are all `qualified` and whose production approval is
  enabled publishes without `PREVIEW_TESTING_NOTICE`; otherwise
  `preview-testing` as today. Stable behaviour unchanged.
- Preserve structure in manifest notes: collapse horizontal whitespace and
  runs of more than two newlines, keep single newlines; keep the 16 KiB
  bound.
- Set `pub_date` to the actual publication time. Because assets and the
  manifest must stay byte-identical across retries, record the timestamp
  once (first successful `PATCH draft:false`) and reuse it on
  reconciliation; the release's `published_at` from the API is the natural
  source of truth for a retry.
- Add a bounded retry (for example 6 attempts, 10 s apart) to the anonymous
  download check after publishing; a persistent failure still stops the run
  before any feed change.
- Require `conclusion == "success"` for a completed coordinator run in the
  `validate` job of `release-pipeline.yml` (in-progress runs remain
  accepted).

Tests and documentation:

- Rust unit tests for the new check-time block, the tolerant manifest
  parser (feed with `darwin-*` keys and extra top-level fields), and the
  registry-based installation-mode detection (behind `cfg(windows)`).
- Release-script tests for mode derivation from a qualified registry, notes
  normalization, `pub_date` reuse on retry, the anonymous-download retry and
  the coordinator conclusion check; keep the end-to-end publisher tests green.
- Update `docs/release/public-publishing.md`, `signed-builds.md` and the
  update contracts document where behaviour changes.

# Out of scope

- Windows Authenticode and macOS signing/notarization (ADR 0011; revisit at
  1.0).
- Enabling any macOS target or feed entry (task 065-10).
- Recording qualification evidence for Windows/Linux (tasks 065-9-7 and
  065-9-8); this task only makes the publisher honour a qualified registry.
- Reducing CI's triple frontend build or adding `cargo deny`/`pnpm audit`.
- Replacing `raw.githubusercontent.com` feeds or adding a dynamic update
  service.

# Acceptance criteria

- [x] A build compiled without either target gate reports `blocked` with the
      new error code on check, downloads nothing, and offers the manual
      download; a gated build behaves exactly as `0.2.0-preview.11` does.
      (`check_time_block` and the `gated_builds_are_blocked_at_check_time…`
      unit test; `start_download` refuses a check-blocked candidate; the
      dialog test renders the block with the manual download and no
      Download button.)
- [x] A `preview.json` containing `darwin-aarch64` and `darwin-x86_64`
      entries plus an unknown top-level field is accepted by a Windows and a
      Linux client, which select their own entry; a manifest lacking the
      running target still yields `target_unavailable`.
      (`raw_manifest_validates_the_running_entry_and_tolerates_the_rest`.)
- [x] An NSIS per-user installation in a custom directory is classified
      `windows_nsis_per_user`; a machine-wide (HKLM) installation remains
      `windows_machine_wide`. (Pure classification over the two hives'
      `InstallLocation` values, unit-tested behind `cfg(windows)`; the
      registry read itself is exercised only by a real installation.)
- [x] A preview published with a registry that qualifies both enabled
      targets carries no testing notice; a preview published with today's
      registry carries it. (`derivePublicationMode` test.)
- [x] Manifest notes keep line breaks; the update dialog renders paragraphs.
      (`normalizeNotes` test, `plain_text_notes` keeps `\n`, dialog test
      asserts the text reaches the pre-wrapped notes element unchanged.)
- [x] `pub_date` equals the release's real `published_at` and is identical on
      a reconciliation retry. (End-to-end publisher tests against the fake
      destination, including a retry whose destination would now report a
      different time.)
- [x] A simulated 404 on the first anonymous download attempts followed by a
      200 publishes and advances the feed; persistent 404s stop before the
      feed commit. (End-to-end publisher test.)
- [x] `pnpm run check` passes; `check:release` includes the new cases; the
      contract check accepts the new error code.
- [ ] The first preview built from this task updates an installed
      `0.2.0-preview.11` through the public feed (evidence recorded in
      Implementation notes). Pending the next preview release.

# Relevant files

- `src-tauri/src/app_updates.rs`
- `src-tauri/build.rs`
- `src/features/app-updates/domain.ts`, `translations.ts`, `UpdateDialog.tsx`
- `docs/architecture/065-9-1-app-update-contract.json`
- `docs/architecture/app-update-contracts.md`
- `docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md`
- `scripts/check-app-update-contracts.mjs`
- `scripts/release/public-release.mjs`, `github-publication.mjs`,
  `qualification-evidence.mjs`
- `scripts/release/public-release.test.mjs`, `release-pipeline.test.mjs`
- `.github/workflows/release-pipeline.yml`
- `docs/release/public-publishing.md`, `docs/release/signed-builds.md`

# Dependencies

- 065-9-10 (merge-driven pipeline) is implemented and proven by
  `0.2.0-preview.10` and `.11`.
- Ships before 065-10 (macOS): the manifest change must be installed on
  clients before any `darwin-*` entry reaches the feed.

# Decisions

- Forward compatibility of the feed is enforced at **publication** (the
  publisher already refuses Darwin rows while 065-10 is open), not by making
  every installed client reject unfamiliar manifests. A client that fails
  closed on a feed it cannot fully parse would need a bridge build with a
  waiting window; tolerance avoids that.
- The check-time block is a distinct error code, not a reuse of
  `unsupported_installation`, because the remedy differs: reinstall a gated
  build versus use a package manager.
- Windows install mode is read from the registry because NSIS per-user
  installs may target any directory; the directory heuristic was a proxy.
- Mode derivation stays deny-by-default: anything short of a fully qualified
  registry keeps the testing notice.
- The qualified preview is its own mode, `preview-qualified`, rather than a
  reuse of `production`: it is still a GitHub prerelease that advances only
  `preview.json`, and it publishes through `public-release-preview` (no
  reviewer) because the point of merge-driven previews is that they complete
  without maintainer intervention. The publish environment expression now
  keys on `production` so only a stable candidate enters the reviewed stable
  environment.
- "Keep single newlines" is implemented as Markdown semantics rather than
  literally: the curated notes are hard-wrapped at ~80 columns, so a single
  newline inside a paragraph or list item is a soft break and is joined with
  a space; only block boundaries (paragraphs, list items) keep newlines.
  Keeping every newline would have rendered ragged wrapped lines in a dialog
  narrower than the source text.
- Because `pub_date` is GitHub's `published_at`, `latest.json` and
  `SHA256SUMS` cannot be staged before publication. The `stage` job stages
  the fixed assets and a manifest template; the `publish` job renders both
  derived assets after `PATCH draft:false` from the time read back from the
  release. A published release therefore accepts one addition, a derived
  asset that is still missing after an interrupted run; an existing one must
  match byte for byte, and a stale draft copy is deleted before publishing.
- An NSIS build whose directory neither hive registered (a copied folder) is
  `unsupported` rather than machine-wide: the installer handoff would
  install to the registered or default location and leave the copy in place.
- The client's manifest validation still requires `notes` and `pub_date` to
  agree with what the plugin parsed when present; both may be absent, which
  the plugin treats as `None`.

# Implementation notes

Implemented on 2026-09-15 on `main`.

Client (`src-tauri/src/app_updates.rs`):

- `UpdateErrorCode::AutomaticUpdateNotEnabled` (`automatic_update_not_enabled`).
  `validate_candidate` computes `check_time_block(mode, target_is_enabled)`
  and stores it on the pending candidate; `finish_check` reports it as
  `blocked`, `start_download` refuses such a candidate as stale, and
  `revalidate_install_candidate` uses the same code instead of
  `unsupported_installation` with a detail string.
- `validate_raw_manifest` validates only the running target's entry
  (versioned release URL equal to the plugin's selection, signature bounds and
  equality, positive size within the artifact cap); other platform keys and
  unknown fields are opaque; the 256 KiB and eight-entry limits stay.
  `UpdateTarget::from_key` had no other caller and was removed.
- Windows: `registered_windows_install_locations` reads `InstallLocation`
  from `Software\Microsoft\Windows\CurrentVersion\Uninstall\GitOdile` in
  HKCU and HKLM through `windows-registry` 0.6 (already in the tree through
  the updater plugin's HTTP client; a `cfg(windows)` dependency, one lock
  entry). `windows_installation_mode_at` classifies the running executable's
  directory against those values, lexically (case-insensitive, `\\?\` and
  trailing separators ignored) and then canonically. `path_is_within`
  canonicalizes both sides or neither, fixing the temp-directory check on all
  three platforms. A test pins the key name to `tauri.conf.json`'s
  `productName`.
- Contract JSON, `domain.ts`, both dictionaries and
  `check-app-update-contracts.mjs` carry the new code; the check now also
  requires the Rust enum, the contract list and the renderer union to be
  identical in order.

Publisher (`scripts/release/`):

- `derivePublicationMode(release, qualification)` and
  `qualifiedPreviewAllowed`; `validateQualificationRegistry` accepts
  `preview-qualified` and returns `previewQualifiedAllowed`;
  `feedsForPromotion` treats it like `preview-testing` for feeds.
- `normalizeNotes` is exported and structure-preserving (see Decisions).
- `preparePublication` no longer takes `publishedAt`; the plan is schema
  version 2 with a manifest template and fixed assets only.
  `renderPublication(plan, publishedAt)` returns the manifest bytes,
  `latest.json` and `SHA256SUMS`. `publish()` reconciles fixed assets,
  publishes, reads `published_at`, renders and reconciles the derived
  assets, verifies every asset anonymously with `ANONYMOUS_RETRY`
  (6 attempts, 10 s; injectable for tests), then advances feeds. Its result
  reports `publishedAt`.
- `release-pipeline.yml`: the coordinator check requires
  `conclusion == "success"` for a completed run; the `stage` job derives the
  mode through `derivePublicationMode` and no longer fetches the source
  commit or passes `--published-at`; the publish environment is
  `public-release-stable` only for `production`.

Documentation: `docs/architecture/app-update-contracts.md`, ADR 0010
(2026-09-15 amendment), `docs/release/public-publishing.md`.

Not done here: the last acceptance criterion needs the next preview release
built from this change to update an installed `0.2.0-preview.11`. Record the
release tag, pipeline run, the observed `pub_date`/`published_at` and the
installed transition here when it happens. The first publication after this
change will also exercise the derived-asset upload against real GitHub for
the first time; an interrupted run before that upload is reconciled by
re-running the `publish` job. Re-running `publish` for `0.2.0-preview.10` or
`.11` with this publisher would stop with `immutable_asset_conflict`, because
their `latest.json` carries the commit date; both publications are complete
and need no retry.

# Validation

Run on 2026-09-15 (Windows 11, Node 24, pnpm 11.17.0, stable Rust):

- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features app_updates`:
  23 passed (including the four new tests; the two `cfg(windows)`
  install-mode tests ran on this machine).
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: clean.
- `node --test scripts/release/*.test.mjs`: 49 passed, 0 failed (six new
  publisher cases).
- `node scripts/check-app-update-contracts.mjs`: passed.
- `pnpm run check:docs`: passed.
- `pnpm run check:frontend`: architecture check over 378 modules, 87 test
  files / 865 tests passed, build succeeded.
- `pnpm run check`: exit 0 — docs (49 release-script tests), frontend
  (87 files / 866 tests, build), Rust fmt, Clippy `-D warnings`, 404 Rust
  tests passed.

# Closure

Closed on 2026-09-16 when the updater epic was wound down: the code,
pipeline and contracts this task describes are on `main` and were
exercised by the public previews `0.2.0-preview.10` to `.12`. The
criteria left unchecked above are not claimed; the pending installed-update evidence for the first preview built from it
moved to [065-9-13](../../0.7.0/065-9-13-updater-evidence-and-os-signing.md),
which owns everything the updater still has to prove.
