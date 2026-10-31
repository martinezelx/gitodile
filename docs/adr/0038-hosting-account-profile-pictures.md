# ADR 0038: Show every hosting account's profile picture, apart from the project icon and the GitOdile profile

- Status: accepted
- Date: 2026-10-27

## Context

[Task 148-1](../../work/done/0.4.0/148-1-github-avatar-and-sign-out.md) gave GitHub
accounts connected through gh a picture. It was a fixed CDN URL derived from the
verified account id, downloaded by a credential-free client and kept in memory
only. Every other connection showed the person glyph: glab, and GitHub, GitLab,
Bitbucket and Azure tokens. The gh picture was lost on every restart.

GitOdile also draws two other identities that must not be confused with a
hosting account:

- the **project icon**, a local rounded square (emoji, technology or initials);
- the **GitOdile profile** in the titlebar, which today is a development-only
  demo.

Other clients keep these apart. GitKraken's own profile has its own picture,
independent of the integrations; each connected integration contributes its
account picture; commit authors use the integration's picture before a
fallback. Clients that resolve pictures through a provider take the URL from the
identity response they already request (`/user`), not from an extra call.
Extensions that do this for commit authors keep it off by default because
emails leave the machine.

## Decision

- **Source.** Each adapter takes the picture URL from the identity response it
  already requests to verify a connection:
  - GitHub (gh and tokens, github.com and Enterprise Server) reads `avatar_url`.
    github.com still uses the fixed CDN URL from the numeric id.
  - GitLab (glab and tokens, gitlab.com and Self-Managed) reads `avatar_url`.
  - Bitbucket Cloud reads `links.avatar.href`.
  - Azure Repos' `connectionData` carries no picture. Its member-avatar APIs
    need the Graph scope, which GitOdile's PAT instructions do not ask for, so
    Azure keeps the person glyph.
- **One owner.** `src-tauri/src/avatar.rs` decides which URLs may be downloaded:
  - HTTPS, no user information or fragment, and only the provider's own picture
    hosts:
    - `avatars.githubusercontent.com` for github.com;
    - a GitHub Enterprise Server's host or `avatars.<host>`;
    - a GitLab instance's exact authority;
    - Bitbucket's Atlassian avatar CDN or `bitbucket.org`.
  - **Gravatar is refused**, including GitLab's and Bitbucket's Gravatar
    fallback for people who never uploaded a picture, so an email hash never
    reaches a third party.
  - The download sends **no credential** and follows no redirects. A private
    instance that refuses anonymous pictures keeps the glyph.
  - It accepts PNG, JPEG, GIF or WebP recognised by signature, capped at
    256 KiB. It never accepts SVG.
  - The webview receives a data URL; the CSP is unchanged.
- **Cache.** The last good picture of each account is stored under the app cache
  directory (`avatars/<sha256 of the account id>.picture`), so it renders at
  launch before any network check.
  - There is no expiry. Every successful verification refreshes it, at launch
    ([ADR 0027](0027-verify-saved-accounts-after-launch.md)) or on Check
    connections.
  - A failed download keeps the last good picture.
  - An account that no longer reports a usable picture loses it.
  - Signing out or removing a connection deletes it.
  - Opening a screen never downloads anything.
- **Three identities.**

  | Identity | Component | Source | Shape |
  | --- | --- | --- | --- |
  | Project icon | `ProjectAvatar` | Local | Rounded square |
  | GitOdile profile | `ProfileAvatar` | Initials of the first and last name the person set; no picture | Round |
  | Hosting account | `HostingAvatar` | Provider picture or the person glyph | Round, with the provider mark at its corner |

  The GitOdile profile never inherits a hosting picture. Whether it ever gets
  one is decided with real GitOdile sign-in.
- **Where a hosting picture appears.** Only where the account itself is the
  subject: Settings' account rows, and the account picker in Clone project and
  project settings. Saved versions in History, Branches and Overview are about
  the person who saved them, so every author, the user included, wears
  initials. The user's own initials sit on the neutral tint rather than a colour
  of their own (owner's decision, 2026-10-27).

## Consequences

- Every connection that a provider can picture shows the same face the person
  sees on that service, across restarts.
- Each verification adds at most one small image request per account, to
  hosts listed in `docs/PRIVACY.md`.
- Private Enterprise or Self-Managed instances, accounts without an uploaded
  picture and Azure accounts keep the glyph.
- Authors in History and Branches never show a picture, so there is nothing
  to keep consistent between two accounts on one host or a project without a
  connected account.
  [Task 166](../../work/after-1.0/166-author-profile-pictures-in-history.md) stays
  deferred against this decision.

## Alternatives considered

- **Gravatar as a fallback.** It would picture more people, but it sends an email
  hash to a third party that is not the project's own host. Rejected for
  privacy, consistent with task 166.
- **Sending the account token for same-origin pictures.** It would picture
  private self-managed instances, but it widens where a secret travels for
  decoration. Rejected.
- **Letting the GitOdile profile show the first connected hosting picture.** It
  would blur which identity is which, and change when accounts change. Rejected.
- **The project's account picture on the user's own versions.** Prototyped on
  2026-10-27: the account chosen for the project on its remote's host, else the
  only one there. Rejected by the owner in favour of initials everywhere a
  version is shown, because it is ambiguous with two accounts and changes with
  the project's account.
- **A time-based expiry.** Pictures are already refreshed on every verification,
  and only explicit actions and the launch check verify, so an expiry would only
  add requests.
