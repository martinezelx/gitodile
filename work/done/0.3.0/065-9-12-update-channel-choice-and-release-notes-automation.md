---
id: 065-9-12
title: Let the user choose the update channel, and finish the release-notes automation
status: done
priority: normal
type: feature
areas:
  - desktop
  - frontend
  - release
  - automation
  - documentation
created: 2026-09-15
completed: 2026-09-15
parent: "065-9"
queue:
---

# Goal

Three follow-ups deferred from the updater UI rework shipped in
0.2.0-preview.11 (PRs #34/#35): a user-chosen update channel (stable or
preview) that the native updater honours, release dates taken from the tag
rather than from the day `release:prepare` ran, and public release notes whose
highlight section is generated from the same per-release highlights file the
app's What's new is built from.

# User outcome

- Someone on a stable build can opt into previews from Settings → Updates,
  and someone on a preview build can ask to be offered only stable versions
  from then on. Either way, nothing is downloaded or installed without them.
- The date beside each version in What's new is the day it was actually
  published, not the day the release branch was cut.
- Release notes on GitHub and highlights in the app say the same thing about
  the same version because they are written once.

# Context

**Channel.** Today the channel is a property of the *build*, not a preference:
`build_update_identity` in `src-tauri/src/app_updates.rs` derives it from the
compiled version (`0.2.0-preview.N` → `preview.json`, `X.Y.Z` →
`stable.json`), and the contract (`docs/architecture/app-update-contracts.md`,
"the renderer can request a check; it cannot provide a channel, URL, public
key…") makes that a security invariant: closed enums, fixed feed URLs, no
renderer-supplied routing. `version_decision` rejects every preview candidate
on a stable build (`channel_mismatch`); the preview feed already carries
stable successors, so preview → stable works by itself, and after installing
a stable the build is stable and previews stop. What does not exist is
stable → "show me previews" and preview → "stable only from now on".

The decision on 2026-09-15 was to keep the invariant that the **renderer never
chooses a feed or URL**: the preference is a closed enum persisted natively,
both feed URLs stay compiled in, and Rust picks between them. This is a core
change (Rust + contract JSON and its check + ADR 0010 + UI) and was
deliberately kept out of the visual rework. It only changes anything for a
user once a stable release exists.

**Dates.** `docs/release/highlights/v<version>.json` carries `date`, stamped
by `release:prepare` as the day the release was cut (see
`scripts/release/highlights.mjs`, `todayIsoDate`). The truthful date is the
tag's; reading it at build time (`git log -1 --format=%cs refs/tags/v<version>`)
was rejected for now because the `build` job of `release-pipeline.yml` checks
out `ref: sha` without tags, so the date would silently be null unless the
checkout fetches tags. DESIGN.md currently states "The date is the day the
release was cut."

**Notes.** `docs/release/notes/v<version>.md` (English Markdown, copied to the
GitHub release and reduced to plain text for the updater manifest) and the
highlights JSON (bilingual, one glyph per line, shown in What's new) are
written separately. For preview.11 the same sentences were typed twice.

# Scope

## A. Update channel preference

- Persist a `preferred_channel: "follow_build" | "stable" | "preview"` in the
  native app-local data directory (beside the install handoff file
  `AppUpdateService::new` already derives from `app_local_data_dir()`), never
  in renderer storage. `follow_build` is the default and reproduces today's
  behaviour exactly.
- Extend `BuildUpdateIdentity` resolution so the *effective* channel is
  `preferred_channel` when set, else the build channel; the feed is chosen
  from the effective channel between the two compiled `KnownFeed` values.
  `version_decision` accepts a newer preview on a stable build only when the
  effective channel is `preview`, and filters preview candidates out on a
  preview build when the effective channel is `stable` (result `current`,
  never an error, when the newest acceptable candidate is not newer).
- Add narrow IPC: read the preference; set it (validated against the closed
  enum, rejected while a check, download or install is active). The renderer
  still cannot pass a channel to `check`.
- Contract: add `preferredChannel` to the relevant `versionCases` in
  `docs/architecture/065-9-1-app-update-contract.json`, extend
  `scripts/check-app-update-contracts.mjs` to evaluate it, and add the
  matching Rust unit cases next to
  `version_decisions_cover_equal_older_upgrade_and_channel_mismatch`.
- UI: in Settings → Updates (`AppUpdateSettingsControl` in
  `src/features/app-updates/UpdateDialog.tsx`), a segmented control
  "Channel: Stable / Preview" under the installed-version row, with one short
  sentence per option in both languages (previews arrive earlier and may
  break; stable is what most people should run). The control shows the
  effective channel; `follow_build` is presented as whichever it resolves to,
  not as a third option. Changing it clears a stale `available`/`ready` state
  and offers "Check for updates".
- Docs: `docs/architecture/app-update-contracts.md` (feed identity section),
  ADR 0010 (amend the "channel is derived from the version" rule), DESIGN.md
  (Updates section), `docs/release/highlights/v<next>.json` line.

## B. Release date from the tag

- In `vite.config.ts`, resolve `__APP_RELEASE_DATES__` (or fold into the
  highlights assembly in `src/app/appRelease.ts`) from
  `git log -1 --format=%cs refs/tags/v<version>` for every highlights file
  whose tag exists; fall back to the file's `date` when it does not (dev
  checkout, the running candidate before its tag).
- Make the `build` job's checkout in `.github/workflows/release-pipeline.yml`
  fetch tags (`fetch-tags: true` or `fetch-depth: 0`) so published builds
  carry real dates, and add an assertion in the pipeline or `check:release`
  that the running version's tag resolved when building a tagged release.
- Update the "day the release was cut" wording in DESIGN.md and
  `docs/release/highlights/README.md`.

## C. One source for notes and highlights

- Extend `release:prepare` (`scripts/release/release-prepare.mjs`) or add
  `release:notes` so the `## Highlights` section of
  `docs/release/notes/v<version>.md` is rendered from the English lines of
  `docs/release/highlights/v<version>.json`, between markers the script owns;
  the rest of the notes stays hand-written. Re-running regenerates only the
  marked block.
- Have the merge coordinator (`validateReleasePreparation` in
  `scripts/release/merge-release.mjs`) fail with `notes_incomplete` when the
  marked block is missing or does not match the highlights file, so the two
  cannot drift at tag time.
- Update `docs/release/notes/README.md`, `docs/release/highlights/README.md`
  and `docs/release/public-publishing.md`.

# Out of scope

- A third feed or any renderer-supplied URL, key, target or header.
- Letting a stable build downgrade to a preview, or any downgrade at all.
- Generating highlight *sentences* from commit messages; they stay
  hand-written in both languages.
- macOS delivery (065-10) and Authenticode (065-9-9).

# Acceptance criteria

- [x] With `follow_build` (default) every existing contract case, Rust test and
      frontend test passes unchanged.
- [x] A stable build with `preview` preferred is offered a newer preview and
      still refuses older ones; a preview build with `stable` preferred is
      offered only stable successors and reports `current` otherwise. Both
      covered in `065-9-1-app-update-contract.json`, the contract check and
      Rust unit tests.
- [x] The renderer cannot influence feed, URL or key: the IPC contract test in
      `src/architecture/ipcContract.test.ts` and the Rust `ipc` contract test
      show only the closed-enum preference command.
- [x] Settings → Updates shows the channel control with per-option copy in EN
      and ES, keyboard-navigable like the other radio groups, and a
      `UpdateDialog.test.tsx` case for switching and re-checking.
- [x] What's new shows the tag date for every published version in a tagged
      build; the dev build falls back to the file date; the pipeline fails
      loudly if a tagged build could not resolve its own tag.
- [x] `release:prepare` renders the highlights block into the notes; the
      coordinator refuses a mismatch; `scripts/release/*.test.mjs` cover both.
- [x] ADR 0010, `app-update-contracts.md`, DESIGN.md and the two release
      READMEs describe the new behaviour; `pnpm run check` passes and is
      recorded below.

# Relevant files

- `src-tauri/src/app_updates.rs` (`build_update_identity`, `version_decision`,
  `AppUpdateService::new`, `production_target_is_enabled`)
- `src-tauri/src/ipc.rs`, `src-tauri/src/application.rs`
- `docs/architecture/065-9-1-app-update-contract.json`,
  `scripts/check-app-update-contracts.mjs`,
  `docs/architecture/app-update-contracts.md`
- `docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md`
- `src/features/app-updates/` (`domain.ts`, `port.ts`, `tauriAdapter.ts`,
  `controller.ts`, `UpdateDialog.tsx`, `translations.ts`, tests)
- `src/app/appRelease.ts`, `vite.config.ts`, `src/vite-env.d.ts`
- `scripts/release/highlights.mjs`, `release-prepare.mjs`,
  `merge-release.mjs` and their tests
- `.github/workflows/release-pipeline.yml`
- `DESIGN.md`, `docs/release/highlights/README.md`,
  `docs/release/notes/README.md`, `docs/release/public-publishing.md`

# Dependencies

- Part A is only observable once a stable release exists; it can be built and
  tested against the contract before then.
- 065-9-11 touches `finish_check` and the contract JSON; land it first or
  coordinate the contract edits.

# Decisions

- 2026-09-15: the channel preference lives in Rust as a closed enum; the
  renderer never names a feed. The preference is a *choice between the two
  compiled feeds*, not a new routing input.
- 2026-09-15: highlight sentences remain hand-written and bilingual; only the
  assembly, validation, dating and the English block in the public notes are
  automated.
- 2026-09-15: parts B and C were deferred from preview.11 to keep the release
  pipeline untouched while the first preview-to-preview update test runs.
- 2026-09-15 (implementation): the user asked, alongside this task, that
  stable releases need only the Tauri updater signature for now — no OS
  signing and no qualification evidence — so the stable channel behaves like
  preview and the channel switch can be tested for real. Implemented as a
  `stable-testing` publication mode mirroring `preview-testing` (testing
  notice, empty qualified targets, `authenticode_deferred` preserved, the
  reviewed stable environment, `stable.json` plus `preview.json` when newer)
  and by supplying the compile-time test-target gate to every build
  (`GITODILE_TEST_UPDATE_TARGETS`, renamed from the preview-only
  `GITODILE_PREVIEW_TEST_UPDATE_TARGETS`). `production` stays reserved for a
  qualified registry. Windows Authenticode was already deferred for both
  channels (ADR 0011); what actually blocked a stable release was the
  qualification gate, and that is what this relaxes. OS signing for both
  channels (SignPath) is a later decision and is not touched here.
- 2026-09-15 (implementation): a change of channel is refused natively while
  a check, download or install is active (`update_operation_busy`) and
  otherwise forgets the pending candidate and returns the snapshot to `idle`,
  so the renderer mirrors native state instead of clearing it itself. The
  candidate identity is also rebuilt under the channel in force at install
  time, so a candidate found under another preference is stale there too.
- 2026-09-15 (implementation): the renderer sets only `stable` or `preview`;
  `follow_build` is never sent and is presented as whichever channel it
  resolves to. The stored value changes only when the person picks the other
  option, so someone who never touched the control keeps today's behaviour
  through a preview-to-stable update.
- 2026-09-15 (implementation): a preview candidate under an effective stable
  channel is `channel_mismatch` on a stable build (a preview in `stable.json`
  is a feed error, as before) and `current` on a preview build restricted to
  stable, as the scope asked. The contract check evaluates cases the way
  `version_decision` does, and insists the feed named by a case is the
  effective channel's.

- 2026-09-16: choosing the other channel confirms first (card in the
  install confirmation's shape, stating that the installed version stays
  because the app never downgrades) and, once confirmed, starts a manual
  check of the new channel immediately. Modelled on the selector-plus-
  confirmation pattern (Windows Insider, Obsidian, Steam beta) rather than a
  silent dropdown (JetBrains Toolbox) or separate installs (Chrome, VS Code
  Insiders), which do not fit a single app identity.

# Implementation notes

- **Rust** (`src-tauri/src/app_updates.rs`): `ChannelPreference`
  (`FollowBuild | Stable | Preview`) persisted as
  `app-update-channel-v1.json` beside the handoff record (256-byte bound;
  anything unreadable is `follow_build`). `BuildUpdateIdentity` now carries
  `build_channel` and the effective `channel`; the feed is chosen from the
  latter, compile-time target gates key on the former.
  `version_decision(build_channel, effective_channel, installed, candidate)`
  implements the matrix above. `AppUpdateService::channel_setting` and
  `set_channel` are the two new operations; `perform_check` and the install
  revalidation take the preference. `production_target_is_enabled_for_lists`
  unions the qualified and test lists for both channels.
- **IPC**: `get_app_update_channel` → `UpdateChannelSetting`,
  `set_app_update_channel(channel: ReleaseChannel)` →
  `Result<UpdateChannelSetting, AppError>`; new `AppErrorCode::UpdateOperationBusy`
  (`update_operation_busy`, mapped to the fallback message in the renderer
  since the control is disabled while busy). Registered in `lib.rs`, the
  execution inventory and both IPC contract lists (77 → 79 commands).
- **Contract**: `channelPreferences` and eight `preferredChannel` version
  cases in `065-9-1-app-update-contract.json`; the check script mirrors
  `version_decision`, requires every preference to be exercised, and pins the
  closed enum, the two feed constants and the closed-enum IPC signature in
  the Rust source.
- **Renderer** (`src/features/app-updates`): `UpdateChannelSetting` in the
  domain, `readChannel`/`setChannel` on the port and adapter, `channel` in
  the controller snapshot (read at initialize; `setChannel` is a no-op while
  busy or for the channel already in force, re-reads native state after a
  change and then starts a manual check). `ChannelControl` in
  `UpdateDialog.tsx` is a two-option `segmented-control` radio group under
  the installed-version row, using the shared `moveFocusWithinRadioGroup`,
  with one sentence per option in EN/ES; picking the other option opens a
  confirmation card (`.app-update-confirm`) with the consequence copy in
  EN/ES, Escape/"Not now" to decline, focus on the confirm button.
- **Dates** (`vite.config.ts`, `src/app/appRelease.ts`): `__APP_RELEASE_DATES__`
  maps each highlights file's version to `git log -1 --format=%cs
  refs/tags/v<version>` when the tag exists; `buildAppChangelog` prefers it
  over the file's `date`. The pipeline's `build` job checks out with
  `fetch-tags: true` and a new step refuses to build when the release tag
  does not resolve to the validated SHA or has no date.
- **Notes** (`scripts/release/highlights.mjs`, new `release-notes.mjs`,
  `release-prepare.mjs`, `merge-release.mjs`, `public-release.mjs`):
  `renderHighlightsBlock`/`applyHighlightsBlock`/`extractHighlightsBlock`
  own the block between `<!-- gitodile-highlights:start/end -->`;
  `release:prepare` scaffolds it, `pnpm run release:notes [version]`
  re-renders it, `check:docs` fails `notes_stale` when a marked block
  differs from its file, and `validateReleasePreparation` fails
  `notes_incomplete` when the block is missing or differs. `normalizeNotes`
  strips HTML comments so markers never reach the updater manifest.
- **Publication**: `stable-testing` mode and `STABLE_TESTING_NOTICE`;
  `derivePublicationMode` returns `production`/`preview-qualified` only for a
  fully qualified registry and `stable-testing`/`preview-testing` otherwise;
  the qualification gate gains `stableTestingAllowed`; `feedsForPromotion`
  accepts it and refuses a preview under a stable mode; the `publish` job
  enters `public-release-stable` for both stable modes.
- **Docs**: ADR 0010 amendment (2026-09-15, task 065-9-12) and the
  "no channel picker" rule, `app-update-contracts.md` (channel preference
  section, decision matrix, gates, `UpdateChannelSetting`), `ARCHITECTURE.md`,
  DESIGN.md (channel group, tag date), README, both release READMEs,
  `public-publishing.md`, `updater-qualification.md`, `signed-builds.md`.
- **Not done here**: the What's new line for this feature. `0.2.0-preview.12`
  is already tagged, so the line belongs in the next version's highlights
  file when `release:prepare` creates it. Suggested line (`cloud-download`):
  EN "Choose which update channel to follow — stable, or previews that arrive
  earlier — from Settings → Updates." / ES "Elige qué canal de
  actualizaciones seguir — estable, o las preview, que llegan antes — desde
  Ajustes → Actualizaciones."
- **Repository configuration to review before the first stable-testing
  release**: the `public-release-stable` environment must exist with its
  reviewer and its own `GITODILE_PUBLIC_RELEASE_TOKEN`; `GITODILE_QUALIFIED_UPDATE_TARGETS`
  stays unset.

# Validation

Recorded on 2026-09-15 on Windows 11 (the implementation machine):

- `node scripts/check-app-update-contracts.mjs` — passed (18 version cases,
  5 metadata cases).
- `node --test scripts/release/*.test.mjs` — 51 passed, 0 failed.
- `pnpm exec vitest run src/features/app-updates src/architecture
  src/app/changelogDialog.test.tsx` — passed.
- `pnpm run check` — passed: docs (386 Markdown files, 18 contract version
  cases, 51 release-script tests), frontend (88 test files, 869 tests, build),
  Rust (`cargo fmt --check`, `clippy -D warnings`, 407 tests passed).
- Not exercised here: a real stable-testing publication and a real channel
  switch against the public feeds; the first stable release will be the
  first end-to-end run of both.
