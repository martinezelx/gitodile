---
id: 148-14
title: Show every hosting account's profile picture
status: done
priority: normal
type: feature
areas:
  - frontend
  - credentials
  - sync
created: 2026-10-27
completed: 2026-10-27
parent: "148"
queue:
---

# Goal

Every connected hosting account (GitHub, GitLab, Bitbucket and Azure Repos,
public and company servers, through a CLI or a token) shows the profile picture
the person set on that service, with the person glyph as the fallback. Along
the way, the app keeps three identities apart: the project's icon, the
GitOdile profile and the hosting account.

# User outcome

The account rows in Settings, the account picker and a project's account section
show the same face the person sees on GitHub or GitLab, so they can tell which
account a project publishes with at a glance. The picture is there right after
launch, before any network check.

# Context

Approved by the user on 2026-10-27 after an analysis of the current code and of
other clients.

Today only GitHub accounts connected through `gh` carry a picture
(`fetch_avatar` in `src-tauri/src/github_auth.rs`, from
[148-1](../0.4.0/148-1-github-avatar-and-sign-out.md)), and it lives in native
memory only, so it is gone after a restart. The shared contract already has the
field (`HostingAccount.avatarDataUrl` / `Account.avatar_data_url`). Every other
source sets it to `None`: `gitlab_auth.rs` (glab) and the token connections in
`hosting_access.rs` (GitHub, GitLab, Bitbucket and Azure tokens).

What other clients do:

- **GitKraken** keeps the three identities apart, which is the model this task
  follows. Its own profile picture is independent, and stays on Gravatar even
  with GitHub connected. Each integration (GitHub, GitLab, Bitbucket, Azure
  DevOps) contributes its own account picture, and commit authors use the
  integration's picture before a fallback.
- **Git Graph / the GitLab VS Code extension** resolve pictures through the
  remote's provider API, off by default for commit authors because emails leave
  the machine, with a clearable cache.
- **Zed** uses GitHub's avatar CDN for blame authors
  (`avatars.githubusercontent.com/u/e?email=`), which costs no API quota. This
  is relevant to [166](../../after-1.0/166-author-profile-pictures-in-history.md),
  not to this task.
- What they share: an account's picture comes from the identity response the
  client already requests (`/user`), not from an extra call, and a local
  fallback is always there.

## The three identities

| | Project icon | GitOdile profile | Hosting account |
| --- | --- | --- | --- |
| What it is | The folder/repository | The person in GitOdile | The identity on GitHub/GitLab/… |
| Source | Local: emoji, technology, colour | Initials of the configured name | The provider's identity response |
| Shape | Rounded square (`--radius-identity`) | Circle + session dot | Circle + provider badge |
| Where | Rail, project switcher, Home | The titlebar account control | Settings › Accounts, account picker, project account section |
| Network | Never | Never (for now) | Only when an account is verified |

- The GitOdile profile never borrows a hosting picture automatically.
- Code names keep them apart. Today `.account-avatar` is the GitOdile profile
  and `AccountAvatar` (in `features/github`) is a hosting picture.
  - `ProjectAvatar`: existing, unchanged.
  - `ProfileAvatar`: the GitOdile profile.
  - `HostingAvatar`: a hosting account, built on a shared round `PersonAvatar`
    primitive in `shared/ui` (image or fallback glyph/initials).

# Scope

1. **Shared native picture module.** Add one owner (`src-tauri/src/avatar.rs`)
   for what `github_auth.rs` does inline today:
   - the 256 KB cap, no redirects and a short timeout;
   - content sniffing that accepts PNG, JPEG, GIF and WebP and never SVG;
   - data-URL encoding;
   - a per-provider allow-list of image hosts.

   The account token is sent only when the image lives on the provider
   instance's own origin (private self-managed avatars), never to a CDN.
   GitHub's `gh` path moves onto it with unchanged behaviour.
2. **Disk cache.** Write pictures under the app cache directory, keyed by a hash
   of the account ID, so a cached picture renders at launch without network.
   - Refresh during the post-launch verification
     ([ADR 0027](../../../docs/adr/0027-verify-saved-accounts-after-launch.md))
     and on Check connections, never because a screen became visible.
   - Signing out or removing a connection deletes its picture.
3. **Providers.** Take the picture URL from the identity request each adapter
   already makes:
   - GitHub token and Enterprise Server: `avatar_url` from `/user`.
   - GitLab.com, Self-Managed and glab: `avatar_url` from `/api/v4/user`.
     When the user never uploaded a picture, GitLab returns a Gravatar URL.
     Ignore it, consistent with 166's "no third-party lookup" rule.
   - Bitbucket Cloud: `links.avatar.href` from `/2.0/user` (Atlassian's avatar
     CDN). This needs [148-11](../../after-1.0/148-11-bitbucket-token-connections.md).
   - Azure Repos: `connectionData` carries no picture. Investigate the
     authenticated member-avatar endpoint. If it needs more than one bounded
     request with the existing PAT scope, ship Azure with the glyph and record
     why.
4. **Frontend.** Add `PersonAvatar` in `shared/ui`, plus `HostingAvatar` with a
   small provider badge at its corner (a floating badge on `--surface-raised`,
   per DESIGN.md). Use it in `AccountRow`, `AccountPicker` and
   `ProjectAccountSection`. Replace the GitHub-only `isGitHubAvatarDataUrl`
   gate with a generic image data-URL check.
5. **GitOdile profile.** Rename to `ProfileAvatar`. It shows the initials of the
   first and last name the user configures, with no picture and no network.
6. **Docs.**
   - A short ADR that generalizes 148-1's decision to every provider: sources,
     host allow-lists, the token rule, caching and the Gravatar exclusion.
   - `docs/PRIVACY.md`: which image hosts are contacted and when.
   - `docs/ARCHITECTURE.md`.
   - DESIGN.md: the three identities, their shapes and where each appears.

# Out of scope

- Commit-author pictures in History
  ([166](../../after-1.0/166-author-profile-pictures-in-history.md)). It reuses this
  module and cache later.
- A real picture for the GitOdile profile, or choosing a hosting picture for it.
  To be decided when GitOdile sign-in is implemented.
- Gravatar or any lookup not run by the account's own provider.
- Uploading or changing a picture on the provider from GitOdile.

# Acceptance criteria

- [x] GitHub (gh, token and Enterprise), GitLab (glab, token and Self-Managed)
      and Bitbucket token accounts show their provider picture. Accounts without
      one keep the person glyph.
- [x] Azure shows its picture, or the task records why it keeps the glyph.
- [x] A cached picture renders at launch with no network. Opening Settings or
      any screen causes no profile or picture request.
- [x] Image downloads accept only allow-listed HTTPS hosts and PNG, JPEG, GIF or
      WebP within the cap. They follow no redirects and send no token outside
      the instance origin. Gravatar URLs are ignored.
- [x] Sign-out or removal deletes the account's cached picture.
- [x] A picture failure never changes the account's identity or connection
      state.
- [x] Project icon, GitOdile profile and hosting pictures use separate
      components and never share a source. The GitOdile profile shows the
      initials of the configured name, with the same rule as the saved
      versions' avatar ("LM").
- [x] Hosting pictures carry the provider badge (decorative, because every
      list sits under its provider's name; see Decisions). Light and dark
      themes, and the image-failure state, are checked.
- [x] CSP unchanged. Unit tests for URL extraction per provider, host
      allow-lists, sniffing and cache replacement/removal (no expiry; see
      Decisions). Fixture integration tests
      never contact a real host. Frontend tests for picture, fallback and badge.
- [x] ADR, PRIVACY, ARCHITECTURE and DESIGN updated.
- [x] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/github_auth.rs` (`fetch_avatar`, `avatar_http_client`,
  `avatar_data_url`)
- `src-tauri/src/gitlab_auth.rs`, `src-tauri/src/hosting_access.rs`
  (`User`, `parse_bitbucket_user`, `parse_azure_user`, `accounts`)
- `src-tauri/src/credentials.rs` (`Account`)
- `src-tauri/tauri.conf.json` (CSP, unchanged)
- `src/features/accounts/` (`AccountRow`, `AccountPicker`,
  `ProjectAccountSection`, `domain.ts`)
- `src/features/github/GitHubAccountSection.tsx`, `src/features/github/domain.ts`
- `src/features/account/` (`AccountControl`, `AccountOverlays`,
  `AccountSettings`)
- `src/shared/ui/` (`projectAvatar.ts`, `projectAvatarView.tsx`,
  `authorAvatar.tsx`)
- `AGENTS.md`, `DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/PRIVACY.md`

# Dependencies

- The Bitbucket part needs [148-11](../../after-1.0/148-11-bitbucket-token-connections.md).
  GitHub, GitLab and Azure can ship first.

# Decisions

- 2026-10-27: approved. The three identities stay separate, and the GitOdile
  profile never inherits a hosting picture.
- 2026-10-27: for now, the GitOdile profile picture is the initials of the first
  and last name the user configures. Anything else is decided with the real
  GitOdile sign-in.
- 2026-10-27: Gravatar is excluded, including GitLab's Gravatar fallback, for
  privacy.
- 2026-10-27, during implementation:
  - **No token is ever sent for a picture**, not even to the instance's own
    origin; a private instance keeps the glyph. This narrows scope item 1.
  - **No time-based expiry.** Every verification replaces the picture, a failed
    download keeps the last good one, and an account without a usable URL (or
    removed) loses it.
  - **`PersonAvatar` was not added to `shared/ui`.** ADR 0003's two-consumer
    bar is not met, because only `features/accounts` draws a hosting picture,
    so `HostingAvatar` lives there.
  - **The provider badge is decorative** (`aria-hidden`): every account list
    sits under its provider's heading, and the picker is scoped to one
    provider. The picker shows the picture without the badge in its 28px slot.
  - **Azure keeps the glyph.** `connectionData` has no picture, and the Graph
    member-avatar APIs need a scope GitOdile's PAT instructions do not request.
  - ADR number: 0038.

# Implementation notes

Native:

- `src-tauri/src/avatar.rs` is the one owner. It holds:
  - the picture-host allow-list per provider, with size parameters (`s=96`,
    `width=96`);
  - the credential-free, no-redirect client;
  - PNG/JPEG/GIF/WebP sniffing capped at 256 KiB;
  - the disk cache, installed by `lib.rs` at `app_cache_dir/avatars`, with
    `cached`, `remember`, `forget` and `refresh`.
- `github_auth.rs` moved its inline client and sniffing onto it. Enterprise
  servers now fetch `avatar_url` from `gh api users/<login>`. The snapshot merge
  remembers fresh pictures, falls back to memory then disk, and forgets a
  signed-out login.
- `hosting_access.rs`:
  - `User` carries the unvalidated `avatar_url`; Bitbucket reads
    `links.avatar.href`.
  - Token rows read the cache.
  - `add` and the background check refresh pictures concurrently inside the
    check.
  - `remove` and `forget_tokens` delete them.
- `gitlab_auth.rs` refreshes the glab picture after verification and forgets
  the previous account when the session changes or ends.

Frontend:

- `features/accounts/HostingAvatar.tsx` and `isPictureDataUrl` in
  `features/accounts/domain.ts`.
- `AccountRow` takes `provider` and `picture` instead of a node.
- `AccountPicker` shows pictures in its glyph slot.
- `features/account/ProfileAvatar.tsx` derives the initials from the configured
  name; `AccountIdentity.initials` was removed.

Docs: ADR 0038, PRIVACY, ARCHITECTURE, DESIGN and README.

`ProjectAccountSection` renders through `AccountPicker`, so it needs no change
of its own.

Follow-up on 2026-10-27:

- The user's own versions briefly wore the project's account picture. The
  owner then decided against it: pictures stay in Settings and the account
  picker, and saved versions show initials for everyone.
- `AuthorAvatar` now shows the user's own initials (for example "LM") on the
  neutral tint, instead of the person glyph.
- That also removes the strip glyph the owner reported as off-centre. The
  harness measured it centred to the pixel, so the cause was never found.

# Validation

2026-10-27:

- `pnpm run check`: docs, architecture, TypeScript, 1,759 frontend tests and
  the build passed. Rust formatting failed on the first run and passed after
  `cargo fmt`.
- `pnpm run check:rust` was rerun with a scratch `CARGO_TARGET_DIR`, because
  the running app locks `target/debug/gitodile.exe`. Formatting, Clippy and
  646 native tests passed.
- Browser harness (fixtures, no Tauri), deleted afterwards. Account rows for
  GitHub, GitLab, Bitbucket and Azure; the picker; the profile initials. Checked
  in GitOdile light and dark. That review gave the glyph face a control fill
  and the badge a hairline edge.

- Real Tauri app, run by the owner on Windows: after restarting `tauri dev`,
  the connected accounts' pictures showed in Settings › Accounts. That covers
  the disk cache across a restart. Not every provider was confirmed one by one
  with a real account; the per-provider rules are covered by unit tests.
- Code review before committing found and fixed three things:
  - a token picture download that finished after the connection was removed
    left an orphaned file;
  - a gh account signed out outside GitOdile kept its picture on disk;
  - the profile and History computed initials differently, so "Ana María
    López" read AL in one and AM in the other.
- Final gate after the review, `pnpm run check` with a scratch
  `CARGO_TARGET_DIR`: docs (350 Markdown files), architecture (652 modules),
  TypeScript, 1,759 frontend tests, build, Rust formatting, Clippy and 646
  native tests passed.
