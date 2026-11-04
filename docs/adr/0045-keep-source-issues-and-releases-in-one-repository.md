# ADR 0045: Keep source, issues and releases in one repository

- Status: accepted
- Date: 2026-11-04

Supersedes the repository split in
[ADR 0010](0010-distribute-signed-app-updates-through-public-github-releases.md).

## Context

ADR 0010 and the migration of 2026-09-14 put source, builds and automation in
`martinezelx/gitodile-desktop`, and issues, releases, downloads and feeds in
`martinezelx/gitodile`, so that the source could stay private. The source is
public now. The split only cost a cross-repository publisher, a generated README
and a second place to look.

Installed builds fix the feed URL and the accepted download prefix under
`martinezelx/gitodile`, and neither can change for a build already installed.

## Decision

`martinezelx/gitodile` holds everything. The code repository takes that name by
rename, and the former hub is archived as `martinezelx/gitodile-legacy`.

`updates/latest.json` stays on `main`, where installed builds read it. The
publisher commits it directly, so its credential must bypass the `Protect main`
ruleset; `GITHUB_TOKEN` cannot. The publisher writes the feed and nothing else.

Issue forms and `SECURITY.md` live in this repository, and
`check-public-feedback.mjs` reads the forms from the checkout.

## Consequences

- Installed builds keep updating with no bridge release, and `FEED`,
  `RELEASE_PREFIX`, `PUBLIC_REPOSITORY` and the issue contract do not change.
- `gitodile-desktop` URLs keep working only through GitHub's redirect, which ends
  if that name is ever reused.
- Release tags are source tags; a release's tag now identifies its source commit.
- Releases v0.3.0 to v0.4.1 were recreated with byte-identical assets, so their
  dates are those of the migration and their download counts restart.
- `main` receives a commit from the publisher after each release. CI and CodeQL
  ignore pushes that touch only `updates/`.
- The bypass credential can write to the repository that holds the source, not
  only to a hub. It stays confined to the `public-release` environment.

## Alternatives considered

- **Keep the name `gitodile-desktop` and move the releases.** Installed builds
  could not follow without a bridge release published in both repositories and a
  hub that could never be removed.
- **Keep two repositories.** Nothing justifies the split with public source.
- **Move the feed off `main`.** Installed builds would still read `main`, so this
  would add a second feed rather than replace it.
