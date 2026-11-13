---
id: 166
title: Show authors' hosting profile pictures in History
status: blocked
priority: normal
type: feature
areas:
  - frontend
  - history
  - credentials
  - sync
created: 2026-10-13
completed:
parent:
queue:
---

# Goal

Show, in the History rows, the profile picture each author has set on the
project's hosting account (GitHub, GitLab or Bitbucket), keeping today's avatar
as the fallback: a person glyph for the user's own versions and initials on a
colour for everyone else.

# User outcome

The timeline reads at a glance as "who did what", the way it does on the
hosting site, without the user configuring anything beyond the account they
already connected.

# Context

Deferred on 2026-10-13 by the user: approved as scope, but kept out of the
current release and outside the active queue. Promote it to `active/` with a
queue position when a release takes it.

A Git commit carries only `name <email>`; no picture. Each provider maps an
email to an account differently, so resolution is per host:

- **The user's own versions** — the connected GitHub account already stores its
  profile picture (`avatar_data_url`, fetched by `fetch_avatar` in
  `src-tauri/src/github_auth.rs`). When the author email is the user's own
  (`isSelfAuthor`), use that picture; no new request.
- **GitHub noreply emails** — `<id>+<login>@users.noreply.github.com` (and the
  legacy `<login>@users.noreply.github.com`) identify the account directly:
  `https://avatars.githubusercontent.com/u/<id>?s=96`, no API call.
- **GitHub, other emails** — the API links a commit's email to an account
  (`GET /repos/{owner}/{repo}/commits/{sha}` → `author.avatar_url`; prefer a
  GraphQL history query to resolve many authors in one request). Uses the
  connected account's token; respect rate limits.
- **GitLab** — `GET /api/v4/avatar?email=<email>&size=96` returns the account's
  picture URL; self-managed instances need the connected token.
- **Bitbucket Cloud** — no email lookup; `GET /2.0/repositories/{workspace}/{repo}/commit/{sha}`
  returns `author.user.links.avatar.href` when Bitbucket has linked the email to
  an account. Depends on the Bitbucket token connection
  ([148-11](148-11-bitbucket-token-connections.md)).
- An email no account claims (e.g. an unregistered work address) has no
  picture and keeps the fallback.

Constraints that shape the design:

- The CSP `img-src` (`src-tauri/tauri.conf.json`) allows no remote URLs, so Rust
  downloads the image and hands the frontend a data URL (or a cached file served
  through `asset:`), the same pattern as account avatars.
- Author emails leave the machine for the project's hosting server. Local-first
  (AGENTS.md principle 5) requires this be visible and switchable off; record
  the decision in a short ADR.
- "Never fetch merely because a screen became visible": History renders the
  fallback immediately; resolution is idle-deferred on project activation or a
  repository invalidation, and pictures replace initials as they arrive.

# Scope

- A Rust resolver module (one owner) that, given the project's remote host and
  its bound account, resolves unique author emails to pictures per provider as
  listed above, with GitHub Enterprise and GitLab self-managed hosts
  ([148-10](../done/0.4.0/148-10-enterprise-and-self-managed-hosts.md)) treated like
  their cloud counterparts.
- A disk cache keyed by host + normalised email: positive entries with a TTL,
  negative ("no account") entries with a shorter TTL, bounded size, and
  resolution once per unique email, never per commit.
- A narrow, validated IPC command and a typed port in the History feature;
  `HistoryPanel`'s `AuthorAvatar` shows the picture when present and the current
  glyph/initials otherwise (including while loading or on failure).
- Use the connected account's own picture for the user's versions.
- A Settings switch ("Show profile pictures from the hosting service"), on by
  default only if the ADR concludes so, which stops all lookups and clears the
  cache when turned off.
- ADR covering transmitted data, providers, caching and the default.
- Fixture/test runs never contact a real host (follow `fetch_avatar`'s guard).

# Out of scope

- Gravatar or any third-party lookup not run by the project's own host; a later
  opt-in task if ever wanted.
- Pictures outside History (Overview, version details) — follow-up once the
  resolver exists.
- Projects with no remote, or a remote on an unconnected/unsupported host: they
  keep the fallback.

# Acceptance criteria

- [ ] History shows the hosting profile picture for authors the provider can
      resolve on GitHub, GitLab and Bitbucket remotes; others keep initials.
- [ ] The user's own versions show their connected account picture, falling
      back to the person glyph.
- [ ] Opening History never triggers a network request by itself; repeated
      opens hit the cache.
- [ ] Each unique email is resolved at most once per cache lifetime, including
      "not found" results; rate-limit and network errors degrade to the
      fallback without user-facing errors.
- [ ] Turning the setting off stops lookups and clears cached pictures.
- [ ] No remote image URL reaches the webview; the CSP is unchanged.
- [ ] Unit tests for noreply-email parsing, provider selection and cache
      expiry; integration tests with fixture responses; frontend tests for
      picture, loading and fallback states.
- [ ] ADR added; `docs/ARCHITECTURE.md` and README updated.
- [ ] `pnpm run check` passes.

# Relevant files

- `src/features/history/HistoryPanel.tsx` (`AuthorAvatar`)
- `src/features/history/author.ts`
- `src-tauri/src/history.rs`
- `src-tauri/src/github_auth.rs` (`fetch_avatar`, `avatar_data_url`)
- `src-tauri/src/gitlab_auth.rs`, `src-tauri/src/bitbucket_access.rs`
- `src-tauri/src/hosting.rs`, `src-tauri/src/hosting_access.rs`
- `src-tauri/tauri.conf.json` (CSP)
- `AGENTS.md`, `DESIGN.md`, `docs/ARCHITECTURE.md`

# Dependencies

- The shared picture module and disk cache from
  [148-14](../done/0.4.1/148-14-hosting-account-profile-pictures.md).
- Bitbucket part: [148-11](148-11-bitbucket-token-connections.md).
  GitHub and GitLab can ship first.

# Decisions

- 2026-10-27: the owner decided that saved versions show initials for every
  author, the user's own as "LM" on the neutral tint. Hosting pictures appear
  only where the account is the subject: Settings and the account picker
  ([ADR 0038](../../docs/adr/0038-hosting-account-profile-pictures.md)). This
  task stays deferred and needs that decision revisited before it can start.

- 2026-10-13: approved and deferred to a later release; fallback stays the
  current glyph/initials avatar.

# Implementation notes

Not started.

# Validation

Not run.
