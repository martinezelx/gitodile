---
id: 143
title: Turn release/0.3.0-preview.1 into release/0.3.0 and ship it on the single channel
status: done
priority: high
type: release
areas:
  - release
  - frontend
  - documentation
created: 2026-10-01
completed: 2026-10-01
parent:
queue:
---

# Goal

Bring task 142 into the pending release branch, turn
`release/0.3.0-preview.1` into `release/0.3.0`, and publish `0.3.0` as the
first single-channel release, proving that installed `0.2.0-preview.*` clients
are offered it.

# User outcome

Everyone on a `0.2.0-preview.*` build is offered `0.3.0` in the app; after
installing it they follow the single feed for every later version.

# Context

`release/0.3.0-preview.1` (pushed, no pull request) is 68 commits ahead of
`main`, including preview-only UI that task 142 never saw on `main`: the
preview build glyph (9b76fd8) and anything that marks a build as preview in the
status bar, About, What's new or the update dialog.

`release-prepare.mjs` refuses to run on a `release/*` branch of another
version, so the branch is first renamed back to a work branch.

# Scope

1. Merge `origin/main` (with task 142) into the release branch; resolve
   conflicts in favour of the one-channel model.
2. Remove the remaining preview-only UI and copy on the branch (glyph, labels,
   tests, translations); `channelGlyph` goes if nothing uses it.
3. `git branch -m release/0.3.0-preview.1 feature/0.3.0`, then
   `pnpm run release:prepare 0.3.0` (renames to `release/0.3.0`, bumps
   package.json, Cargo.toml, Cargo.lock, tauri.conf.json and README).
4. Move the curated content of `docs/release/notes/v0.3.0-preview.1.md` and
   `docs/release/highlights/v0.3.0-preview.1.json` into the `v0.3.0` files,
   delete the never-released preview.1 files, run `pnpm run release:notes`.
5. Push `release/0.3.0`; delete the remote `release/0.3.0-preview.1` only with
   the maintainer's confirmation; open the pull request to `main`.
6. After the maintainer merges it, check the publication: tag `v0.3.0`, a
   non-prerelease GitHub release with Windows NSIS and Linux AppImage assets,
   `updates/latest.json` and `updates/preview.json` both at `0.3.0`, no
   `stable.json`.
7. Installed check: a Windows install of `0.2.0-preview.12` is offered `0.3.0`,
   installs it, and the restarted `0.3.0` reports it is current from
   `latest.json`.

# Out of scope

- Any code change task 142 owns; fix it there (on `main`) if it is wrong.
- New product work for 0.3.0.

# Acceptance criteria

- [x] `release/0.3.0` contains `origin/main`, carries no `.github/` or
      `scripts/release/` change, and `release/0.3.0-preview.1` no longer exists
      locally (remote only if the maintainer confirmed).
- [x] No preview-channel UI or copy remains on the branch.
- [x] Notes and highlights for `v0.3.0` are curated and agree
      (`release:notes`); the preview.1 files are gone.
- [x] `pnpm run check` passes on `release/0.3.0`.
- [x] Publication verified as in scope step 6.
- [x] `0.2.0-preview.12` → `0.3.0` verified on a real Windows install.

# Relevant files

- `scripts/release/release-prepare.mjs`
- `docs/release/notes/`, `docs/release/highlights/`
- `src/app/StatusBar.tsx`, `src/app/ChangelogDialog.tsx`,
  `src/shared/ui/channelGlyph.tsx`, `src/features/app-updates/`

# Dependencies

- Task 142 merged into `main`.
- The `public-release` environment from task 142's operational steps exists.

# Decisions

- 2026-10-01: the maintainer deferred the offline updater-key backup to
  `1.0.0` (task 065-8); `0.3.0` does not wait for it.

# Implementation notes

- `origin/main` (task 142) merged into `release/0.3.0-preview.1` with 22
  conflicted files: the release branch's `ChannelGlyph`, its Stable / Preview
  control in the reworked Updates section and the matching CSS, copy and
  tests were removed; "How you get updates" keeps only the startup check.
  The active queue was renumbered with 142/143 first.
- Renamed to `feature/0.3.0`, then `pnpm run release:prepare 0.3.0` produced
  `release/0.3.0`; the never-published `0.3.0-preview.1` notes and highlights
  became `v0.3.0`'s, rewritten for one channel.
- CI on the PR exposed a Unix-only console test bug: its blocking
  `pre-commit` hook lacked the executable bit, so Git ignored it. The test now
  uses `test_support::write_failing_hook`.
- Release PR martinezelx/gitodile-desktop#49, squash-merged as `df1ddb9`.
- The first coordinator run was rejected because "Frontend checks" failed
  intermittently on the merge commit (`App.test.tsx`, keep-alive Work screen);
  a re-run passed, and the flaky test went to a separate task.
- The publish job twice found `GITODILE_PUBLIC_RELEASE_TOKEN` empty: a secret
  set with `gh secret set` without an interactive terminal stores an empty
  value. A new fine-grained token (Contents read/write on
  `martinezelx/gitodile` only) piped from the clipboard fixed it.
- The maintainer deferred the offline updater-key backup to `1.0.0` (065-8).
- Clean-up: remote `release/0.3.0-preview.1`, local `release/0.3.0` and
  `feature/single-update-channel`, the stale `wt-preview12` worktree and the
  `public-release-preview` / `public-release-stable` environments deleted.

# Validation

- `pnpm run check` passed on `release/0.3.0` (480 Rust tests).
- Release pipeline run 36886321347 (attempt 3) succeeded: tag `v0.3.0`,
  public release published 2026-10-01T16:21:07Z, not a prerelease, with the
  Windows NSIS installer, Linux AppImage, both `.sig`, `latest.json`,
  `SHA256SUMS`, `LICENSE` and `THIRD_PARTY_LICENSES.md`.
- `updates/latest.json` and `updates/preview.json` carry byte-identical
  manifests (`0.3.0`, Windows and Linux entries, the same `pub_date`); no
  `stable.json`. Both served `0.3.0` anonymously from
  `raw.githubusercontent.com`.
- A Windows install of the published `0.2.0-preview.12` was offered `0.3.0`,
  the maintainer downloaded and installed it, and the installed `0.3.0`
  executable embeds `updates/latest.json` and the production key ID; the
  install handoff record was consumed on startup. An earlier local install
  without the updater key reported "Update verification is not configured
  for this build", as designed. That the restarted `0.3.0` reports
  "current" was not separately observed.
