# ADR 0036: Connect Azure Repos by organization and PAT

- Status: accepted
- Date: 2026-10-26

## Context

Task [148-13](../../work/done/0.4.1/148-13-azure-repos-token-connections.md)
adds Azure Repos Services for manual HTTPS cloning and the existing Git
transfer workflows. Unlike existing hosting instances, organizations share
`dev.azure.com`; matching only an authority cannot isolate their credentials.
The user approved organization/PAT connections, without discovery or OAuth.

## Decision

Each lowercased organization is a provider instance (`azure`, ID `azo-` plus
20 hex digits of SHA-256 of its name). Account keys use the authenticated
user's stable GUID, separately from the display name. An optional `scopePath`
extends the shared provider descriptor/adapter with the organization boundary;
existing provider IDs, metadata and secret namespaces remain unchanged.

`azure_access.rs` owns the bounded organization registry and clone URL policy;
`hosting_access.rs` retains token storage, account verification, cancellation,
generation fencing and background launch checks. At most eight organizations
and eight identities per organization are supported. Metadata files under
`azure-organizations/org-<organization>.json` contain no secrets. The filename prefix also avoids Windows reserved device names. The secure-store
namespace is `GitOdile/AzureRepos/<organization>/token/v1`, without plaintext
fallback. Removing the final token retains the organization instance and project
bindings: the unavailable choice stays visible, and users can explicitly choose
existing Git access without having to supply another PAT. When capacity is
needed, only an empty, readable organization with no project bindings can be
forgotten; corrupt metadata or preferences never authorize that cleanup.

Verification reads `https://dev.azure.com/<organization>/_apis/connectionData`
with `api-version=7.1-preview.1` and Basic authentication. The endpoint's
connection-identity contract is present in Microsoft's
[Locations client](https://github.com/microsoft/azure-devops-node-api/blob/master/api/LocationsApi.ts).
Only a valid, nonzero authenticated-user GUID and bounded active display
identity are accepted. A changed GUID during a saved-account check invalidates
the connection. Verification proves identity, not repository/write permission.
The existing bounded HTTP client refuses redirects and shares OS TLS trust and
proxy policy; API responses and transport errors never expose raw private data.

Git uses a nonempty fixed username (`gitodile`) with the PAT as password through
the existing private credential pipe. Process-only helper settings match
`https://dev.azure.com/<organization>` and enable `useHttpPath`; the helper
reconstructs the instance from that organization and checks the entire clone
path before reading any secret. Duplicate path/identity fields fail closed.
Transfer guards retain host/header checks and reject an Azure organization
without a matching selected scope. Git redirects are disabled for selected Azure transfers, including overriding
path-specific redirect settings, so an authenticated redirect cannot carry a
PAT to another organization. No global or project Git configuration is
changed, and missing credentials never fall back to another selected identity.

Manual clone accepts `organization/project/_git/repository` and the default
project shorthand `organization/_git/repository`, including encoded spaces and
Unicode project/repository names. Copied username-only URLs normalize to the
canonical, lowercased organization address. Passwords, query/fragment suffixes,
dot segments, encoded separators, nested escapes and malformed escapes are
refused. Existing remotes are never rewritten: when using a saved connection,
they must already use the canonical address without embedded sign-in details.
Existing Git credentials and SSH retain their prior behavior without a selected
GitOdile account.

Settings reuses token rows and the masked token editor behind an Azure-owned
typed port. Organization entry precedes the token; checking is explicit and
cancellation preserves focus and clears the token input. Guidance names Code
Read / Read & write, token expiry, organization policies and local removal
versus Azure revocation. Azure appears in project selectors and a dedicated
URL-only Clone tab. Home includes connected Azure accounts and opens that tab
with the chosen connection. Neither entry point requests repository discovery.

The concrete external-reference question was how to keep Git transport and
hosting authentication independent. The relevant
[GitButler system-Git auth harness](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/gitbutler-git/src/repository.rs)
retains native Git configuration and scopes its authentication harness to a
process. GitOdile retains that principle using its existing exact-account
helper, with organization checks; no source or assets are adapted. GitButler's
[license](https://github.com/gitbutlerapp/gitbutler/blob/master/LICENSE.md)
does not authorize assuming unrestricted reuse in a competing client.

## Consequences

PATs are user-created and user-renewed. Organization policies can prohibit them;
connection success does not bypass branch policies or prove write access.
Microsoft Entra/browser login, repository discovery, legacy visualstudio.com
aliases, self-hosted Azure DevOps Server, PRs and pipelines remain outside this
version. Live Azure access and macOS/Linux credential stores require separate
qualification; hermetic tests cannot establish them.

## Alternatives considered

- One global `dev.azure.com` connection: conflates organizations and cannot
  reliably select two different organization credentials.
- Register Azure as a company server: the existing authority-only registry
  deliberately refuses paths and represents different products.
- Persist PATs in clone URLs or Git configuration: expands secret exposure and
  changes other clients' behavior.
- Microsoft Entra or Azure CLI first: adds a separate authentication lifecycle
  beyond the approved PAT-only scope.
