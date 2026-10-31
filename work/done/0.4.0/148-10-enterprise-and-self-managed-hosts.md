---
id: 148-10
title: Connect GitHub Enterprise Server and GitLab Self-Managed hosts
status: done
priority: high
type: feature
areas:
  - credentials
  - frontend
  - platform
created: 2026-10-06
completed: 2026-10-06
parent: "148"
queue:
---

# Goal

Extend [epic 148](../../after-1.0/148-connect-github-account.md)'s shared accounts, HTTPS
access and repository discovery from the fixed `github.com` and `gitlab.com`
hosts to user-added corporate hosts: GitHub Enterprise Server and GitLab
Self-Managed (including GitLab Dedicated, which behaves as a self-managed host).

# User outcome

A user can add their company's server once in Settings, connect one or more
accounts on it with a token or through gh/glab, browse and clone its projects,
and choose per project which corporate account publishes and gets changes,
without affecting their personal github.com or gitlab.com accounts.

# Context

Requested by the user on 2026-10-06. GitHub (148-9, 148-5) and GitLab.com
(148-4) are complete for their public hosts. Earlier tasks recorded GitHub
Enterprise and self-hosted GitLab as subsequent scope; this task promotes them.

It takes queue position 01 ahead of PRs/Actions (148-6/148-7) so those screens
are built on host-scoped provider instances instead of being reworked later.
Existing queued tasks keep their relative order.

The current implementation assumes one fixed host per provider in several
places that this task must generalize rather than duplicate:

- `AccessProvider::host()` returns `&'static str`; `hosting.rs` builds a fixed
  two-adapter registry used by the app and the Git credential helper process.
- Account IDs are `provider:key`, and project bindings store one account per
  provider ID. Two hosts of the same provider would collide.
- `HostingAccessService` derives API origin, token-store namespace
  (`GitOdile/GitHub/token/v1`) and clone-URL validation from `ProviderKind`;
  GitHub API headers are applied only when the origin equals `api.github.com`.
- gh and glab commands, status parsing, device-URL validation, glab's
  `credential-helper --repo` probe and `instance_url` check are pinned to the
  public hosts.
- Clone source checks (`clone.rs`, `sourceAccess.ts`), the clone dialog's
  provider modes, `providerForSource` and `remoteAccountIssues` only recognize
  the public hosts and reject any explicit port.
- The Git transfer guard derives selected hosts from the
  `credential.https://<host>.helper` arguments; `validate_url`, the
  `extraHeader` masking and the wildcard matcher (`wildcard_host_matches`) treat
  any explicit port as "not the selected host".

The 2026-10-06 integration review (recorded in the epic) already settled parts
of this task's groundwork: a contract check guards the OS trust store and OS
proxy support of the shared HTTP client, token checks and discovery are fenced
per connection, repository descriptions are normalized by `display_text`, and
the glab Git-helper lookup no longer runs a version probe per transfer.

# Scope

## Host registry

- A native, user-managed list of corporate hosts (provider kind + normalized
  HTTPS origin), persisted without secrets beside the existing account
  metadata, bounded in size and validated on load like the other stores.
- Adding a host requires explicit user action and shows exactly which address
  GitOdile will contact. Accept only `https`, a host name or IP, an optional
  explicit port, no credentials, query or fragment. Private/intranet addresses
  are valid. Redirects remain disabled.
- Identify the server before saving it: GitHub Enterprise Server through its
  `/api/v3/meta` endpoint, GitLab through an authenticated `/api/v4/user` (or
  version) call during the first connection. A wrong product kind fails clearly.
- Removing a host removes its token connections from the OS secure store and
  leaves project bindings unavailable rather than choosing another account,
  matching the existing token-removal rule.

## Provider instances and identity

- Make the registry dynamic: each configured host is one provider instance with
  its own stable instance ID, host (with port when not 443), API origin and
  token-store namespace. `github`/`gitlab` remain the IDs of the public hosts so
  existing bindings and token connections keep working without migration.
- Extend the account-ID grammar and `split_account` for instance IDs, and keep
  project bindings keyed by instance, so a project can use a personal
  github.com account and a corporate GitHub Enterprise account at the same time.
- Token store entries are namespaced by instance; the same login on two hosts
  never shares a secret. Existing entries are untouched.
- The credential-helper process must rebuild the same registry from disk
  before answering, and match the exact host *and port* before reading a
  secret. Git's `credential.https://host[:port]` scope and the
  `http.<url>.extraHeader` reset must use the same normalized origin; extend
  `selected_hosts`, `validate_url` and the wildcard matcher to compare
  host *and* port (Git's urlmatch compares the port too) instead of treating
  every explicit port as foreign.
- Per-connection generations in `TokenState` stay per instance; an instance
  removal advances every generation it owned so in-flight checks and discovery
  for that host are discarded.

## Adapters

- GitHub Enterprise Server: API origin `https://<host>/api/v3`; send the GitHub
  API headers by provider kind, not by origin. Discovery and clone-URL
  validation use the configured host (and port); descriptions keep using
  `display_text`. gh uses `--hostname <host>`; parse
  `hosts[<host>]`; validate the device URL against `https://<host>/login/device`;
  remove `GH_ENTERPRISE_TOKEN`/`GITHUB_ENTERPRISE_TOKEN` alongside the existing
  environment overrides and report environment-controlled state for them.
- GitLab Self-Managed: API origin `https://<host>/api/v4`; glab uses
  `--hostname`, `--api-host`, `--ssh-hostname` for the configured host and no
  hard-coded container-registry domain; the credential probe and its
  `instance_url` check use the configured origin. Keep the numeric-identity
  rule and `oauth2` Git username. The helper lookup (`credential_with_programs`)
  receives the instance origin as well as the expected numeric ID, and its
  identity check calls that instance's `/api/v4/user`, not GitLab.com's.
- Record minimum supported server versions after checking the APIs used
  (identity, repository listing, pagination headers), and show an actionable
  state for older servers instead of a generic failure.
- Distinguish SAML/SSO-restricted tokens (GitHub 403 with SSO headers) and
  disabled API/PAT policies from generic permission denial where the provider
  signals it.

## Network and trust

- Keep TLS verification on with the OS trust store. Reqwest's features come
  from the updater plugin by design (one TLS provider); the app-update contract
  check now fails if the platform verifier or system proxy disappears. Qualify
  a host signed by a corporate CA installed only in the OS store. No "ignore
  certificate errors" option.
- API calls honor the OS proxy settings and proxy environment variables. Git
  transfers keep the user's Git proxy/TLS configuration (`http.proxy`,
  `http.sslBackend`, `http.sslCAInfo`); Settings must explain that GitOdile and
  Git may each need the corporate CA or proxy, and map TLS/proxy failures to
  actionable states rather than "offline".
- Bounded timeouts, cancellation and rate-limit/offline mapping reuse the
  existing hosting client.

## Frontend

- Settings: a "Company servers" area per provider (English/Spanish) to add,
  verify and remove hosts, then the existing token and browser connection rows
  scoped to each host. Every row shows its host so personal and corporate
  accounts are never confused.
- Clone dialog: configured hosts appear as discovery sources and as accepted
  manual addresses; `hostingCloneAddress`, `providerForSource` and
  `remoteAccountIssues` resolve host and port from the native catalog instead of
  fixed names, so the remote sign-in/HTTP warnings also cover corporate hosts.
- Project Settings shows one account picker per provider instance used by the
  project's HTTPS remotes.
- Keyboard access, focus return, and empty/loading/error/offline/unsupported
  states follow the existing account sections.

# Out of scope

- PR/MR and CI screens (148-6/148-7), which must consume the instances built here.
- Bitbucket Cloud/Data Center (148-8), GitHub AE, Gitea/Forgejo and other forges.
- GitOdile-registered OAuth applications on corporate servers.
- Mutual-TLS client certificates, custom CA import inside GitOdile, insecure TLS.
- GitLab installed under a relative URL path (`https://host/gitlab`) unless the
  investigation below shows it fits the same normalized-origin model cheaply.
- SSH key management or changing global Git configuration.

# Acceptance criteria

- [x] An ADR records the host registry, instance IDs, binding/ID compatibility,
  token namespaces, helper registry rebuild and trust/proxy decisions.
- [x] Adding, verifying and removing GitHub Enterprise Server and GitLab
  Self-Managed hosts works in English/Spanish with keyboard access and clear
  empty/loading/error/offline/unsupported-version states.
- [x] Token connections and gh/glab browser connections work per host; the same
  login on github.com/gitlab.com and on a corporate host stays separate.
- [x] Repository discovery and selected-account clone work for each host,
  including hosts with an explicit non-443 port.
- [x] A project can bind a public and a corporate account simultaneously; fetch,
  get changes and publish use exactly the bound identity for each host.
- [x] Wrong host/port/protocol, foreign clone URLs, redirects, stale or removed
  hosts and changed identities cannot send a secret or choose another account.
- [x] Existing github.com/gitlab.com tokens, gh/glab accounts and project
  bindings keep working after upgrade without user action.
- [x] Native tests cover parsing, ID grammar, registry persistence, helper host
  and port matching, and per-host token namespaces with fake servers and fake
  gh/glab; frontend tests cover the new Settings, clone and project flows.
- [x] Real qualification against at least one GitHub Enterprise Server and one
  GitLab Self-Managed instance is recorded, or its absence is stated honestly.
- [x] Documentation (README capabilities, ARCHITECTURE, DESIGN wording, IPC
  contract) is updated and `pnpm run check` passes.

# Relevant files

- [ADR 0022](../../../docs/adr/0022-share-provider-accounts-and-scope-git-access.md)
- [ADR 0023](../../../docs/adr/0023-add-native-github-tokens-and-repository-discovery.md)
- [ADR 0024](../../../docs/adr/0024-connect-gitlab-through-shared-hosting-accounts.md)
- [Architecture](../../../docs/ARCHITECTURE.md)
- [Design](../../../DESIGN.md)
- [Hosting registry](../../../src-tauri/src/hosting.rs)
- [Shared credentials and Git helper](../../../src-tauri/src/credentials.rs)
- [Token and API service](../../../src-tauri/src/hosting_access.rs)
- [gh adapter](../../../src-tauri/src/github_auth.rs)
- [glab adapter](../../../src-tauri/src/gitlab_auth.rs)
- [Clone source checks](../../../src-tauri/src/clone.rs)
- [Clone source access](../../../src/features/clone/sourceAccess.ts)
- [Shared frontend accounts](../../../src/features/accounts/index.ts)

# Dependencies

Completed [148-3](148-3-shared-accounts-and-git-access.md),
[148-9](148-9-github-token-connections.md),
[148-5](148-5-provider-repository-browser.md) and
[148-4](148-4-gitlab-accounts.md). Real qualification needs access to a
corporate instance supplied by the user.

# Decisions

- Public hosts keep their current provider IDs (`github`, `gitlab`) so no
  migration of bindings or secure-store entries is required.
- Corporate hosts are explicit user configuration; GitOdile never discovers or
  contacts a host merely because it appears in a project remote.
- API calls use the OS proxy and trust store (settled by the 2026-10-06 review).
- Open questions to settle in the ADR before implementation: relative-URL GitLab
  support, and whether GHE.com data-residency subdomains (`*.ghe.com`, API at
  `api.<subdomain>.ghe.com`) are included.

# Implementation notes

Implemented on 2026-10-06 under
[ADR 0025](../../../docs/adr/0025-connect-company-servers-as-provider-instances.md).

- `hosting.rs` owns the server registry (`hosting-servers.json`, at most 8,
  validated on load), the credential-free product/version probe flow, removal
  (deletes that server's tokens; gh/glab sessions untouched), dispatch of token,
  discovery and gh/glab commands by instance ID, and the helper's rebuild of a
  server adapter from the authority Git passes, refused unless that authority
  derives the account's `ghe-`/`gls-` instance ID.
- `credentials.rs`: runtime-mutable provider list, instance IDs with digits,
  catalog descriptors with `kind`/`builtIn`, product-wide `check`, and
  host-and-port matching in clone validation, remote-URL validation, the
  `extraHeader` mask/wildcard refusal and the helper's host field.
- `hosting_access.rs`: per-instance ID/host/API origin/OS-store namespace,
  `forget_tokens`, clone-URL validation against the server's authority,
  `probe_server` (GHES header or `/meta`, GitLab `/version` or its JSON 401;
  floors GHES 3.0 and GitLab 14.0) and `certificate_failed` mapping for TLS
  rejections. Only github.com gets the REST version header.
- `github_auth.rs`/`gitlab_auth.rs` carry their instance and host into every
  gh/glab command, status parse, device page, `instance_url` check and identity
  verification. Enterprise gh logins may contain underscores; enterprise
  environment tokens are honored as "environment controlled" and removed from
  explicit lookups. Enterprise avatars use the placeholder.
- `clone.rs` accepts registered servers (HTTPS by exact authority, SSH by name;
  nonstandard SSH ports only for servers). New error code `unsupported_server`.
- IPC: `add/remove_hosting_server`, `add/remove_hosting_token`,
  `get/check/start/logout/cancel` for `hosting_cli`, and
  `open_hosting_device_page` (native opens the server's device page because the
  renderer opener scope stays fixed).
- Frontend: new `features/hosting-servers` (port, adapter, translations,
  `CompanyServersSection`) slotted after each product's Settings groups; token
  and browser sections accept a server scope; the account picker can list a
  whole product for discovery; clone and project-remote matching use exact
  host and port from the catalog.

Visual review (2026-10-06, user-approved): Settings now shows one Accounts list
per product grouped by host with a single add-account panel and a compact
server inventory (`ProviderConnectionsSettings` replaced `CompanyServersSection`
and the token sections); Project settings → Remote lists remotes before a
compact HTTPS access group; the clone menu groups connections by host and
remembers the last one. See DESIGN.md § Account and sign-in.

Open questions recorded in the ADR remain out of scope: relative-URL GitLab and
GHE.com data residency. Self-managed glab web login may require an OAuth
application configured in glab; signing in with glab directly is detected.

# Validation

`pnpm run check` passed on 2026-10-06 after the final account-list, clone and
tool-row revisions: documentation/release/icon contracts, frontend
architecture, strict TypeScript, 129 frontend files / 1,262 tests, production
build, Rust formatting, Clippy with warnings denied, 559 native library tests
(the OS-store qualification stays ignored) and the actual-binary helper test.
It used an isolated Cargo target directory. `git diff --check` was clean.

New coverage: server address normalization and public-host refusal, stable
instance IDs, the helper refusing an authority that does not derive the ID,
tampered/unreadable registry files, probe identification and version floors,
per-server token namespace/origin/clone host, port-aware remote, header and
helper matching, company-server clone sources (native and frontend), enterprise
gh status/login/environment handling, self-managed glab receipts, and the
Settings add/refuse/remove flow.

The Settings group was rendered from fixtures in a throwaway Vite harness
(deleted afterwards): the server row, scoped token/browser groups, the address
form and the localized `unsupported_server` error displayed correctly. The
reworked github.com/gitlab.com account rows, Settings copy, Git/update tool rows,
Project Settings access and clone connection menu were reviewed by the user in
the running Tauri app; no company server was connected there.

Not qualified: no real GitHub Enterprise Server or GitLab Self-Managed instance
was available, so adding a real server, token/gh/glab sign-in, discovery,
private clone and publishing against one remain unverified, as does behavior
behind a corporate CA or proxy. macOS/Linux runtime limits remain under ADR 0006.

## Closure — 2026-10-06

The owner closed the task with the implementation, documentation and aggregate
gate recorded above. The qualification criterion is met by stating its absence:
no real GitHub Enterprise Server or GitLab Self-Managed instance was available.
Real company-server qualification remains open evidence, to be recorded when the
user supplies an instance; it does not reopen this task's scope.
