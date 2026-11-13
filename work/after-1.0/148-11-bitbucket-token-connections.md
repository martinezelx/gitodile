---
id: 148-11
title: Connect Bitbucket Cloud with native API tokens
status: planned
priority: high
type: feature
areas:
  - credentials
  - frontend
  - platform
created: 2026-10-06
completed:
parent: "148"
---

# Goal

Add Bitbucket Cloud (`bitbucket.org`) as a third hosting product in
[epic 148](148-connect-github-account.md)'s shared accounts, HTTPS access and
repository discovery, connected through native Atlassian API tokens the way
GitHub ([148-9](../done/0.4.0/148-9-github-token-connections.md)) and GitLab
([148-4](../done/0.4.0/148-4-gitlab-accounts.md)) tokens already work.

# User outcome

A user pastes a Bitbucket API token in Settings, sees exactly which Bitbucket
account it belongs to, browses and clones that account's repositories across
its workspaces, and chooses per project which Bitbucket connection gets and
publishes changes, without installing any extra tool.

# Context

Requested by the user on 2026-10-06 after closing
[148-10](../done/0.4.0/148-10-enterprise-and-self-managed-hosts.md). It takes the freed
queue position 01, ahead of PRs/Actions (148-6/148-7), so those screens are
built on three products instead of reworked later.

[148-8](148-8-bitbucket-accounts.md) stays blocked for Bitbucket
*browser* authorization (GCM or a GitOdile OAuth consumer). Its note against "a
token-paste UI merely to bypass browser-flow decisions" is superseded by this
explicit user decision: tokens are a first-class source here, as they are for
GitHub and GitLab, not a workaround. Browser authorization can be added later
under 148-8 as a second source beside these tokens.

## Provider facts (verified 2026-10-06; recheck before implementation)

- App passwords are gone: creation stopped on 2025-09-09, existing ones were
  disabled on 2026-06-09 and removed after the brownouts ended on 2026-07-28.
  Do not support them.
- Atlassian API tokens are created at id.atlassian.com, **must** carry scopes,
  and expire (the user picks the expiry). REST calls authenticate with HTTP
  Basic `<Atlassian account email>:<token>`; the docs also mention Bearer.
  Verify whether Bearer works with a user API token for `/2.0/user` and the
  repository endpoints before deciding whether the form needs the email.
- Git over HTTPS accepts the static username `x-bitbucket-api-token-auth` (or
  `x-token-auth`, or the case-sensitive Bitbucket username) with the token as
  password. Clone needs `read:repository:bitbucket`; publishing also needs
  `write:repository:bitbucket`.
- Cross-workspace endpoints were retired on 2026-04-14 (CHANGE-2770):
  `GET /2.0/repositories` (unscoped), `/2.0/user/permissions/repositories`,
  `/2.0/user/permissions/workspaces` and `GET /2.0/workspaces` now fail.
  Discovery must list workspaces with `GET /2.0/user/workspaces` and then
  repositories per workspace with `GET /2.0/repositories/{workspace}?role=member`.
- `GET /2.0/user` returns `uuid` (`{…}`), `account_id`, `username`,
  `display_name` and `links.avatar.href`. The UUID is the stable identity;
  username and display name can change.
- Pagination is in the JSON body (`values`, `next` absolute URL, `pagelen` up to
  100), not in `Link` headers.
- Repository/project/workspace *access tokens* (Bearer, `x-token-auth`) are
  bot credentials without a personal `/user` identity; they are out of scope.

## What the current code assumes

The token path is shared but hard-wired to two products in places this task
must generalize rather than fork:

- `ProviderKind` (`hosting_access.rs`) and `HostingKind`
  (`features/accounts/domain.ts`) are `github | gitlab`; `AccessProvider::kind`
  documents the same pair.
- `HostingAccessService` always sends `Authorization: Bearer`, reads identity
  from `/user` as `login` + optional numeric `id`, validates logins with the
  GitHub or GitLab grammar, and decides "next page" from response headers.
- `username()` returns the login (GitHub) or `oauth2` (GitLab); Bitbucket needs
  `x-bitbucket-api-token-auth`, never the display username.
- Every service owns a CLI adapter (`cli: Arc<dyn AccessProvider>`), gh or glab;
  Bitbucket has none in this task.
- `hosting.rs` builds a fixed `[github, gitlab]` registry and routes discovery
  by `github:`/`gitlab:` prefix; the helper process rebuilds the same list.
- Clone (`clone.rs`, `sourceAccess.ts`, `CloneDialog` source modes
  `url | github | gitlab`), `providerForSource`, `remoteAccountIssues`, the
  Settings sections and the provider icons only know the two products.

# Scope

## Native

- Add a `Bitbucket` product with the fixed public instance ID `bitbucket`,
  host `bitbucket.org`, API origin `https://api.bitbucket.org/2.0` and its own
  OS secure-store namespace (`GitOdile/Bitbucket/token/v1`), no plaintext
  fallback. Existing GitHub/GitLab metadata, secrets and bindings are untouched.
- Account keys use the UUID without braces, lowercased and validated as a UUID
  (`bitbucket:token.<uuid>`); display username/name are stored separately, as
  GitLab does with its numeric ID. A rename keeps the binding; a different UUID
  behind a saved token fails closed.
- Make authentication a per-product choice inside the shared service (Basic
  with email, or Bearer if verified) rather than a Bitbucket copy of it. If the
  email is required, it is account metadata (not secret), validated and bounded,
  and never used as the account identity or Git username.
- Identity verification before storing: `/2.0/user` must answer with a valid
  UUID; record display data; report a missing-scope 403 distinctly from an
  invalid or expired token where Bitbucket signals it.
- Discovery: page `/2.0/user/workspaces`, then
  `/2.0/repositories/{workspace}?role=member` with `pagelen=100`. Accept a
  `next` URL only when it stays on the exact API origin and path family; keep
  the existing body cap, 20 s timeout, no redirects, cancellation and
  per-connection generation fencing. Validate workspace/repository slugs and
  require the HTTPS clone link to equal `https://bitbucket.org/<workspace>/<slug>.git`
  (ignoring any username Bitbucket embeds in its clone href). Reuse
  `display_text` for descriptions. Bound total workspaces/pages so a large
  account cannot stall the picker; page the combined list for the existing
  clone browser.
- Git helper: `username()` returns `x-bitbucket-api-token-auth`; the helper
  matches the exact `bitbucket.org` authority, as for the other public hosts.
  A Bitbucket remote URL carrying a username must not select or conflate
  accounts (the existing stored-sign-in warning applies).
- A token-only product: give the registry a "no CLI" adapter (no browser rows,
  no tooling row) instead of making the CLI field optional everywhere.
- Register `bitbucket` in the app registry and in the helper's rebuild; route
  discovery by instance ID instead of adding a third string prefix branch.

## Frontend

- Extend `HostingKind`, provider icons (Bitbucket mark per `DESIGN.md`, no
  copied brand assets beyond what the existing icon set allows) and the shared
  account catalog to `bitbucket`.
- Settings → Bitbucket section with the existing Accounts list and add-token
  panel (masked input, cleared on submit/dismiss; email field only if the
  native decision requires it). Copy in English and Spanish: where to create
  the token, required scopes (`read:user`, `read:workspace`,
  `read:repository`, plus `write:repository` to publish), that it expires and
  must be replaced, that it is stored in the OS secure store and that removing
  it in GitOdile does not revoke it at Atlassian. No browser or tooling rows.
- Clone dialog: a Bitbucket discovery source using the shared account picker,
  manual `https://bitbucket.org/…` addresses resolved through the catalog, and
  the existing remember-last-connection behavior.
- Project Settings → Remote: a Bitbucket account picker when the project has a
  `bitbucket.org` HTTPS remote; remote sign-in/HTTP warnings cover it.
- Keyboard access, focus return and empty/loading/error/offline/expired/
  missing-scope states follow the GitHub and GitLab token sections.

## Documentation

- ADR 0026 (or an amendment to ADR 0024 if the change stays small): Bitbucket
  identity, auth header choice, email handling, Git username, discovery with
  workspace-scoped endpoints, and why browser authorization stays in 148-8.
- README capabilities, ARCHITECTURE, DESIGN wording and the IPC contract.

# Out of scope

- Bitbucket browser/OAuth authorization or GCM integration (148-8).
- Bitbucket Data Center / Server and any self-hosted Bitbucket.
- Repository, project and workspace access tokens; app passwords.
- Bitbucket pull requests and Pipelines (148-6/148-7 consume this later).
- SSH keys, global Git configuration changes, remote token revocation.

# Acceptance criteria

- [x] An ADR records identity, authentication, Git username, discovery and the
  relationship to 148-8.
- [x] A Bitbucket API token is verified against its exact UUID before being
  stored in the OS secure store; secrets never reach IPC replies, logs,
  diagnostics, process arguments or environment.
- [x] Settings adds, verifies, lists and removes Bitbucket token connections in
  English/Spanish with keyboard access and clear empty/loading/error/offline/
  expired/missing-scope states.
- [x] Discovery lists repositories across the account's workspaces through the
  workspace-scoped endpoints, with bounded, origin-checked pagination and
  cancellation; clone through the selected connection works.
- [x] A project can bind a Bitbucket connection beside GitHub/GitLab ones;
  fetch, get changes and publish use exactly that connection with
  `x-bitbucket-api-token-auth`.
- [x] Wrong host/protocol, foreign clone links, off-origin `next` URLs, removed
  or expired tokens and a changed UUID cannot send a secret or choose another
  account.
- [x] Existing GitHub, GitLab and company-server connections and bindings keep
  working without user action.
- [x] Native tests cover UUID grammar, identity parsing, auth header, body
  pagination, workspace fan-out bounds, clone-link validation, helper username
  and namespace with fake servers; frontend tests cover Settings, clone and
  project flows.
- [ ] Real qualification with a disposable scoped token (identity, discovery,
  private clone, and publish if the user approves a write-scoped token) is
  recorded, or its absence is stated honestly.
- [x] Documentation is updated and `pnpm run check` passes.

# Relevant files

- [ADR 0022](../../docs/adr/0022-share-provider-accounts-and-scope-git-access.md)
- [ADR 0023](../../docs/adr/0023-add-native-github-tokens-and-repository-discovery.md)
- [ADR 0024](../../docs/adr/0024-connect-gitlab-through-shared-hosting-accounts.md)
- [ADR 0025](../../docs/adr/0025-connect-company-servers-as-provider-instances.md)
- [Architecture](../../docs/ARCHITECTURE.md)
- [Design](../../DESIGN.md)
- [Hosting registry](../../src-tauri/src/hosting.rs)
- [Token and API service](../../src-tauri/src/hosting_access.rs)
- [Shared credentials and Git helper](../../src-tauri/src/credentials.rs)
- [Clone source checks](../../src-tauri/src/clone.rs)
- [Shared frontend accounts](../../src/features/accounts/index.ts)
- [Accounts in Settings](../../src/features/hosting-servers/AccountsSettings.tsx)
- [Clone source access](../../src/features/clone/sourceAccess.ts)

# Dependencies

Completed [148-3](../done/0.4.0/148-3-shared-accounts-and-git-access.md),
[148-9](../done/0.4.0/148-9-github-token-connections.md),
[148-5](../done/0.4.0/148-5-provider-repository-browser.md),
[148-4](../done/0.4.0/148-4-gitlab-accounts.md) and
[148-10](../done/0.4.0/148-10-enterprise-and-self-managed-hosts.md). Real
qualification needs a Bitbucket account and a token created by the user.

# Decisions

- Tokens only; browser authorization remains 148-8 (user decision, 2026-10-06).
- Public `bitbucket.org` only, with the fixed instance ID `bitbucket`.
- Settled in [ADR 0026](../../docs/adr/0026-connect-bitbucket-cloud-through-api-tokens.md):
  user API tokens use Bearer (Atlassian documents it as removing the need for
  the email), so no email is collected; discovery lists at most 300
  workspaces (three pages of 100) and skips up to 16 empty workspaces per
  request.
- Addresses with an embedded username (Bitbucket's copy button) are not
  hosting sources and never select an account, matching the task's
  no-conflation rule; native clone already strips the username from the
  persisted remote.

# Provider references

- [Using API tokens](https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/)
- [App password deprecation and brownouts](https://community.atlassian.com/forums/Bitbucket-articles/Deprecation-notice-Bitbucket-Cloud-app-password-brownout/bc-p/3249514)
- [End of life for cross-workspace APIs](https://community.developer.atlassian.com/t/bitbucket-cloud-announcing-end-of-life-for-cross-workspace-apis-timeline-next-steps-and-instructions-for-connect-apps/99972)
- [Users API](https://developer.atlassian.com/cloud/bitbucket/rest/api-group-users/)

# Implementation notes

Implemented on 2026-10-06 under
[ADR 0026](../../docs/adr/0026-connect-bitbucket-cloud-through-api-tokens.md).

- `hosting_access.rs`: `ProviderKind::Bitbucket` (`bitbucket`, `bitbucket.org`,
  `https://api.bitbucket.org/2.0`), refused by the new
  `ProviderKind::server_kind` so it never becomes a company server. UUID
  keys (`bitbucket_uuid`), bounded display names, metadata validation on load,
  `x-bitbucket-api-token-auth` Git username, `/2.0/user` parsing with a
  username → nickname → display-name fallback, and renames persisted by checks.
  A module-level `NoCli` adapter replaces the test-only one.
- Discovery (`bitbucket_page`): workspaces, then workspace-scoped repositories;
  page starts remembered per account and token generation (`walks`), empty
  workspaces skipped, `next` used only as a signal, clone links validated and
  rebuilt, 53-bit repository IDs derived from the UUID.
- `bitbucket_access.rs` (Tauri state newtype), registry and helper rebuild in
  `hosting.rs` (discovery now routes by instance ID), `lib.rs` registration and
  the `add_bitbucket_token`/`remove_bitbucket_token` IPC commands; Bitbucket is
  also cancelled by `cancel_hosting_request`.
- `clone.rs`: `bitbucket.org` HTTPS/SSH sources with two-part paths and no
  nonstandard port.
- Frontend: `HostingKind` gains `bitbucket`; new `features/bitbucket`
  (`BitbucketConnectionsSettings`, typed port, English/Spanish copy) slotted
  into a new Settings → Bitbucket section; a Bitbucket clone tab; the Bitbucket
  silhouette (Simple Icons, CC0); `TokenConnectionCopy.permissionDenied` lets a
  provider explain a refused token (used by Bitbucket for missing scopes).

Follow-ups not in scope: accepting a username-only Bitbucket address as a
hosting source (stripping the viewer name) would let users paste Bitbucket's
copy-button URL and still pick an account; avatars use the placeholder.

Moved after `1.0.0` on 2026-10-27 by user decision: the implementation is
complete and only the real-account qualification is missing, which does not
block `1.0.0`. It stays `planned` until that qualification is scheduled. Settings has since merged every provider into one Accounts section
(`cf8473c`), so the "Settings → Bitbucket section" above now means the
Bitbucket rows of that section; check that wording when qualifying.

# Validation

`pnpm run check` passed on 2026-10-06: documentation/release/icon contracts
(277 Markdown files, 197 task IDs), frontend architecture, strict TypeScript,
130 frontend files / 1,271 tests, production build, Rust formatting, Clippy with
warnings denied, 564 native library tests (the OS-store qualification stays
ignored) and the actual-binary helper test. A first run failed only because the
two new IPC commands were missing from the execution inventory in
`application.rs`; that was corrected before the passing run.

New native coverage: UUID grammar and display-name fallback, tampered metadata,
UUID keys and the static Git username through the helper (wrong host, port,
protocol and username refused), clone-link validation (foreign host, port,
path, query, password, viewer name dropped), body pagination that never follows
`next`, workspace fan-out across pages with empty-workspace skipping, remembered
page starts, the 300-workspace cap, a changed UUID refused, and Bitbucket clone
sources. Frontend coverage: Settings list/check/add/refusal/removal flows,
the clone tab with its only connection preselected, clone-address matching and
project-remote matching and warnings.

The Settings section was rendered from fixtures in a throwaway Vite harness
(deleted afterwards) in English and Spanish: account rows, unavailable state,
the add form with the scope disclosure, the empty state and the refused-token
message. No console errors.

Not qualified: no real Bitbucket account or token was used, so identity,
discovery, private clone and publishing against bitbucket.org remain
unverified, as does the running Tauri app. macOS/Linux runtime limits remain
under ADR 0006. The task stays active until that qualification is recorded.

After the follow-up review (account receipt cache, launch sync of saved
accounts under ADR 0027), `pnpm run check` passed again on 2026-10-06: 130
frontend files / 1,272 tests, 565 native library tests and the actual-binary
helper test.
