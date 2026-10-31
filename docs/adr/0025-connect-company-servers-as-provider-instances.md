# ADR 0025: Connect company servers as provider instances

- Status: accepted
- Date: 2026-10-06

## Context

Task [148-10](../../work/done/0.4.0/148-10-enterprise-and-self-managed-hosts.md)
adds GitHub Enterprise Server and GitLab Self-Managed (including GitLab
Dedicated) beside github.com and gitlab.com. ADRs
[0022](0022-share-provider-accounts-and-scope-git-access.md),
[0023](0023-add-native-github-tokens-and-repository-discovery.md) and
[0024](0024-connect-gitlab-through-shared-hosting-accounts.md) assumed one fixed
host per provider: `AccessProvider::host()` was static, account IDs were
`provider:key`, project bindings held one account per provider, and token-store
namespaces, API origins, gh/glab arguments and clone checks named the public
hosts. Two hosts of one product would collide in every one of those places.

## Decision

**Provider instances.** Every host is one provider instance with an ID, exact
HTTPS authority (`host` or `host:port`, default port removed) and product kind.
github.com and gitlab.com keep the IDs `github` and `gitlab`, so existing
bindings, token metadata and OS-store entries need no migration. A company
server's ID is derived from its product and lowercased authority
(`ghe-`/`gls-` plus ten hex digits of SHA-256). Account IDs remain
`<instance>:<key>`; the provider grammar now allows digits. Bindings stay keyed
by instance, so one project can use a personal github.com account and a
corporate GitHub Enterprise account together. Re-adding a removed server
restores its ID, and saved bindings return only when the same account does.

**Registry.** `hosting.rs` owns the user-added list
(`hosting-servers.json`: version, at most 8 entries, no secrets). Load validates
every entry by re-normalizing its authority and re-deriving its ID; an unreadable
or tampered file registers nothing and refuses writes. `AccountService` keeps a
runtime-mutable provider list; registering a server adds it to the catalog, Git
bridge and clone checks; removing it deletes that server's token secrets and
metadata, leaves gh/glab sessions untouched, and leaves bindings saved and
unavailable rather than choosing another account.

**Adding a server.** Only an explicit action contacts the typed address. Input
must be `https://host[:port]` without path, credentials, query, fragment or
wildcards; github.com, gitlab.com, their subdomains and GHE.com (data residency,
different API layout) are refused. A credential-free probe identifies the
product: GitHub Enterprise Server by its `X-GitHub-Enterprise-Version` header or
`/api/v3/meta` version; GitLab by `/api/v4/version` or its recognizable
`401 Unauthorized` JSON refusal. Wrong products and servers older than GHES 3.0
or GitLab 14.0 fail with `unsupported_server`. Every API GitOdile calls predates
those floors; GitLab's version is often unknowable before sign-in, so only the
probe's product shape is guaranteed there.

**Adapters.** `HostingAccessService::server` derives the API origin
(`/api/v3` or `/api/v4`), the secure-store namespace
(`GitOdile/GitHubEnterprise/<authority>/token/v1`,
`GitOdile/GitLabSelfManaged/<authority>/token/v1`) and clone-URL validation from
the authority. Only github.com receives the `X-GitHub-Api-Version` header.
`GitHubAuthService` and `GitLabAuthService` carry their instance ID and host;
every gh/glab command names that exact host. Enterprise gh logins may contain
underscores (normalized SAML/LDAP names); `GH_ENTERPRISE_TOKEN` and
`GITHUB_ENTERPRISE_TOKEN` control enterprise hosts and are removed from explicit
lookups. Enterprise avatars use the local placeholder because private mode may
require authentication. The device page and glab's `instance_url` are derived
from the registered host, never from tool output. Switching gh's active account
is not offered for servers because GitOdile selects accounts with `--user`.
glab self-managed web login may need an OAuth application configured in glab;
users can sign in with glab themselves and GitOdile detects that session.

**Git helper.** For a company server the parent passes the authority as a helper
argument. The helper rebuilds the adapter only when that authority normalizes to
itself and derives the account's instance ID; anything else answers
`quit=true`. This keeps the helper free of app-data paths while trusting nothing
the renderer supplied. The process-scoped `credential.https://<authority>` and
`http.https://<authority>/.extraHeader` resets, remote-URL validation and
wildcard header refusal compare host *and* port, as Git's urlmatch does.

**Trust and network.** API calls keep the updater's single Reqwest/TLS
configuration: rustls with the OS trust store and OS proxy settings (guarded by
the app-update contract check). Certificate failures map to
`certificate_failed`. There is no option to ignore certificate errors. Git
transfers keep the user's own Git proxy/CA configuration; Settings states that
both may need the corporate CA or proxy.

**Interface.** The `hosting-servers` feature adds a per-product "company
servers" group to Settings → GitHub and Settings → GitLab and reuses the token
and browser connection bodies per server. Native IPC commands take the instance
ID. Clone discovery selects a product and lists accounts from every host of that
product; manual addresses, project account pickers and the remote sign-in/HTTP
warnings resolve hosts from the catalog.

*Refined 2026-10-06 (visual review):* instead of repeating token and browser
groups per server, Settings shows one Accounts list per product grouped by host
plus a compact server inventory. The instance model above is unchanged.

## Consequences

Company accounts work beside personal ones without global Git or CLI changes,
and the public-host behavior is unchanged. A server answering on a different
clone host than its API (`http_url_to_repo`/`clone_url` mismatch) is rejected
rather than trusted. Relative-URL GitLab installations (`https://host/gitlab`),
GHE.com data residency, mutual TLS, custom CA import and SSH remain out of
scope. Real qualification requires access to a corporate instance; until then
the behavior is covered by hermetic fixtures only.

## Alternatives considered

- **Keep one provider per product with a host field in each account.** Bindings
  are one per provider, so a project could not hold a public and a corporate
  account of the same product, and helper scopes would need per-account hosts.
- **Random server IDs.** They would orphan bindings after removing and re-adding
  a server and need persistent mapping in the helper.
- **Rebuild the helper registry from the app's data directory.** It couples the
  helper to Tauri path resolution; the derived-ID check gives the same guarantee
  with no file access.
- **Opening the device page from the renderer.** It would widen the fixed opener
  capability to arbitrary hosts; native derives and opens it instead.
