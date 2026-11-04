---
id: 227
title: Move source, issues and releases into one public repository
status: active
priority: high
type: chore
areas:
  - release
  - docs
created: 2026-11-04
completed:
parent:
queue: "02"
---

# Goal

`martinezelx/gitodile` becomes the one public repository: source, issues,
releases, downloads and the update feed. The current code repository takes that
name by rename, and the current public hub is kept as an archived
`martinezelx/gitodile-legacy`.

# User outcome

People find the code, the issues and the downloads in one place, and every
GitOdile already installed keeps receiving updates without doing anything.

# Context

ADR 0010 split the source (`gitodile-desktop`) from the public hub (`gitodile`)
while the source could be private. The source is public now, so the split only
costs a cross-repository publisher and a second place to look.

Installed builds fix the feed
(`raw.githubusercontent.com/martinezelx/gitodile/main/updates/latest.json`) and
the accepted download prefix (`/martinezelx/gitodile/releases/download/`) in
`src-tauri/src/app_updates.rs`. Moving the releases under another name would
strand them. Renaming keeps both URLs valid, so no bridge release is needed, and
`PUBLIC_REPOSITORY`, `FEED`, `RELEASE_PREFIX` and `issueReportContract.json` do
not change.

State on 2026-11-04: the hub holds releases v0.3.0, v0.4.0 and v0.4.1, no
issues, five issue forms, `SECURITY.md`, its README and `updates/latest.json`.
Tags v0.3.0, v0.4.0 and v0.4.1 already exist in the code repository. Repository
ID, secrets, environments, rulesets and the tag deploy key survive a rename.

# Scope

Repository changes, in a pull request to `main` of their own because they touch
`.github/` and `scripts/release/`:

- `SOURCE_REPOSITORY` in `merge-release.mjs` and `release-prepare.mjs`,
  `RUN_URL` in `qualification-evidence.mjs`, the tag remote in
  `merge-driven-release.yml`, and their tests.
- Publisher: stop rewriting the hub README (`updateFeedbackReadme`, the guidance
  markers and the `readme_contract` failure). Downloads guidance becomes
  ordinary README text. Rename the "public" wording only where it now misleads.
- `check-public-feedback.mjs`: drop the hub README assertions and validate the
  forms from the checkout, since it is a required check and must not depend on a
  second repository.
- Replace `.github/ISSUE_TEMPLATE/bug_report.md` and `feature_request.md` with
  the hub's five forms.
- `updates/latest.json` tracked on `main`, excluded from anything that treats
  it as source. Push-triggered CI must not spend a full run on a feed commit.
- `AppOverlays.tsx`, `src-tauri/capabilities/default.json` and `tauri.conf.json`
  links, with their tests. Merge `README.md`, `SECURITY.md` and the hub's
  reporting guidance into this repository's files.
- New ADR superseding the repository split in ADR 0010, plus
  `docs/ARCHITECTURE.md`, `docs/PRIVACY.md` and `docs/release/`.

Migration, in this order, each step confirmed by the maintainer:

1. Regenerate `GITODILE_PUBLIC_RELEASE_TOKEN` scoped to the code repository with
   Contents read and write.
2. Seed `updates/latest.json` on `main` of the code repository with that token
   through the API. This also proves the token passes the `Protect main`
   ruleset, which the publisher needs on every release.
3. Recreate the three releases in the code repository, oldest first, on their
   existing tags, with the same notes and byte-identical assets. Verify every
   SHA-256 against the hub and mark v0.4.1 as latest.
4. Rename `gitodile` to `gitodile-legacy`, then at once `gitodile-desktop` to
   `gitodile`.
5. Merge the repository pull request and update the local remote.
6. Verify anonymously that the feed and each v0.4.1 asset URL answer under the
   final name.
7. Archive `gitodile-legacy` with a README pointing to the new home.
8. Publish 0.5.0 through the new path and confirm an installed 0.4.1 finds it.

# Out of scope

- Changing `FEED` or `RELEASE_PREFIX`, or moving the feed off `main`.
- Releases older than v0.3.0, which the hub no longer has.
- Rewriting historical links under `work/done/` or `docs/release/notes/`; the
  `gitodile-desktop` redirect keeps them working.
- Deleting the legacy repository.

# Acceptance criteria

- [ ] An installed 0.4.1 detects, downloads, verifies and installs 0.5.0.
- [x] The feed URL and all assets of v0.3.0, v0.4.0 and v0.4.1 answer
      anonymously under `martinezelx/gitodile`, with hashes equal to the hub's.
- [ ] A release merge tags, builds and publishes, including its feed commit to
      the protected `main`, with no manual step.
- [x] `check:feedback` passes with no second repository.
- [ ] The issue report in the app opens the form in `martinezelx/gitodile`.
- [x] `git remote` and the clone instructions use the final name.
- [x] The feed answered throughout, apart from the gap between the two renames.
- [ ] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/app_updates.rs`
- `scripts/release/github-publication.mjs`
- `scripts/release/public-release.mjs`
- `scripts/release/merge-release.mjs`
- `scripts/release/release-prepare.mjs`
- `scripts/release/qualification-evidence.mjs`
- `scripts/check-public-feedback.mjs`
- `.github/workflows/merge-driven-release.yml`
- `.github/workflows/release-pipeline.yml`
- `docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md`
- `docs/release/public-publishing.md`

# Dependencies

Before 0.5.0 is published, so that version uses the new path. Should the
migration slip, 0.5.0 can ship through the current path, since the installed
contract does not change.

# Decisions

- Rename rather than move: installed builds keep working without a bridge
  release, and the repository takes the product's name.
- Keep a token instead of `GITHUB_TOKEN`: the publisher commits the feed straight
  to `main`, and `Protect main` is bypassed only by the repository admin role.
  Step 2 is the proof; if it fails, decide the alternative before renaming.
- Rollback: until step 4 nothing users depend on has changed. If step 6 fails,
  rename both repositories back.

# Implementation notes

Migration steps 1 to 6 ran on 2026-11-04. The repository changes landed through
pull request 71, merged minutes before the rename rather than after it; nothing
ran in between, because only a release merge reads `SOURCE_REPOSITORY`.

Additions to the plan:

- Private vulnerability reporting was off on the code repository and had to be
  enabled before the rename, because `check:feedback` requires it.
- The publication token keeps access to both repositories until the hub is
  archived, so replacing the secret never broke the old path.
- The modernized README on `main` had lost the `Current development version`
  line that `release:prepare` and the coordinator read. The merge into
  `release/0.5.0` restores it, and `check-docs.mjs` now requires the exact line.

# Validation

- Seed commit `439a22c`: the token passed `Protect main`, feed byte-identical.
- Releases v0.3.0, v0.4.0 and v0.4.1 recreated: all 24 assets equal the hub's by
  SHA-256 after downloading them back.
- After the rename, anonymously: the feed answered 200 with SHA-256
  `4569d2fb...` and all 24 asset URLs answered 200; `gitodile-desktop` redirects.
- `node scripts/check-public-feedback.mjs` passed against the renamed repository.
- Still open: installed 0.4.1 to 0.5.0, a release merge through the new path, and
  the issue form opened from the app.
