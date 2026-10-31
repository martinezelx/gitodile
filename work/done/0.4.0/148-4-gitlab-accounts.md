---
id: 148-4
title: Connect GitLab through shared provider accounts
status: done
priority: high
type: feature
areas:
  - credentials
  - frontend
  - platform
created: 2026-10-04
completed: 2026-10-05
parent: "148"
queue:
---

# GitHub-first sequencing (2026-10-04)

The user approved finishing GitHub connection and repository discovery before
GitLab. Complete [148-9](148-9-github-token-connections.md) and
[148-5](148-5-provider-repository-browser.md) first. PR/Actions screens are later
work and do not block starting GitLab once that integration is closed.

Extend the same repository-browser port/controller with GitLab discovery and
native URL validation as part of this provider task. Reuse GitHub's browser/token
connection model where appropriate, with explicit per-host secret namespaces
and credential-source identities. glab's single verified CLI identity remains
a restriction of its browser adapter, not a reason to silently change a project's
account or to route a native token through glab. No GitLab implementation is
included in the preceding GitHub work.

# Goal

Extend [epic 148](../../after-1.0/148-connect-github-account.md)'s account/HTTPS-access foundation
to GitLab.com, preserving the existing GitHub integration.

# User outcome

Connect, inspect and disconnect GitLab accounts, and choose the
account used when cloning or transferring a project's changes over HTTPS.

# Context

The user requested GitLab and Bitbucket as the first next milestone on
2026-10-04. These are hosting providers, not replacements for system Git.
[148-3](148-3-shared-accounts-and-git-access.md) completed the shared
registry, catalog, picker, persistent project bindings and Git helper.
Create adapters behind those contracts rather than a second account store,
helper protocol or project-selection UI for each provider.

On 2026-10-04 the user approved separate provider tasks after the feasibility
review. This task retains ID 148-4; GitHub completion now precedes it. Bitbucket Cloud
is tracked independently in [148-8](../../after-1.0/148-8-bitbucket-accounts.md).

The user subsequently chose GitHub through `gh` and GitLab through `glab` as
the only providers in the current milestone, including repository discovery.
Bitbucket is deferred. This first GitLab adapter uses one currently verified
GitLab.com CLI identity; the shared contracts remain capable of later adapters.

# Scope

- Reuse GitLab CLI (`glab`) browser/device authorization for GitLab.com.
  Add local detection, compatibility checks and supported installation guidance.
  Inspect the required version, permissions, refresh behavior and Git access;
  never assume glab offers GitHub CLI's multi-account or credential behavior.
- Add native GitLab.com personal access token connections independently of glab.
  Verify the exact identity before storing a token in the OS secure store; never
  use plaintext fallback. Keep token and CLI sources distinct, even for the same
  user. Inspect and document the minimum permissions for discovery and HTTPS Git
  access, expiration/revocation handling and the provider's credential username.
- Put token connections first in Settings, browser connections second and glab
  tooling last, following the accepted GitHub layout. Mask and clear token input;
  explain that tokens need no glab installation and browser connections do.
- Implement GitLab.com account connection, cached identity,
  avatar fallback, explicit verification and targeted sign-out in Settings.
- Extend native provider contracts only where required for provider identities,
  hosts and Git credential usernames; GitLab identities must not be forced
  through GitHub's login grammar.
- Keep secrets native and out of IPC, diagnostics and process arguments/env.
  If GitOdile owns credentials, use native OS secret storage without an
  undisclosed plaintext fallback. Document permissions and shared CLI sessions.
- Reuse clone/project account selection, with explicit provider/host validation,
  no fallback to another identity and no global Git or SSH changes.
- Extend the typed repository-browser API from [148-5](148-5-provider-repository-browser.md)
  using the same verified identity as HTTPS access. Retain bounded output,
  cancellation, permission handling and explicit network actions.
- Detect changed external glab identity and retain an unavailable project binding;
  require an explicit selection rather than sending another account's credential.
- Reuse glab's registered application; no GitOdile OAuth registration or
  real-account mutation is implied by this implementation task.

# Out of scope

- New repository-browser screens, PR/MR and CI screens (the subsequent tasks).
  GitLab discovery in the existing clone browser is in scope.
- Bitbucket account integration (task 148-8), self-hosted GitLab and GitHub Enterprise.
- GitOdile-owned GitHub OAuth (still a later epic enhancement).
- GitOdile-owned GitLab OAuth and multiple simultaneous glab GitLab.com identities.

# Acceptance criteria

- [x] GitLab implements shared account/access contracts; GitHub still works.
- [x] Account identity, avatar, connection status and targeted sign-out are clear
  in English/Spanish, with keyboard access and empty/loading/error/offline states.
- [x] One verified glab GitLab.com identity can be selected per project; HTTPS
  clone/fetch/push and subsequent API discovery use exactly that identity.
- [x] An external CLI identity change makes old bindings unavailable; no transfer
  or API request silently switches identity. GitHub multiple-account support remains.
- [x] Missing/old glab has actionable local diagnostics and installation guidance;
  browser connection explains shared CLI state, permissions and storage fallback.
- [x] Native token ingestion verifies the exact identity, uses OS secure storage,
  masks/clears input and supports explicit verification/removal without glab.
  CLI/token identities stay distinct; removal never falls back to another source.
- [x] Settings offers token first, browser connection second and glab tooling last.
  Missing glab does not disable token connections or their repository browser.
- [x] The existing clone browser lists, filters, refreshes and pages GitLab projects
  with the selected connection; private/permission-limited, empty, loading and
  failure states work. URL checks and the destination/clone handoff use that same
  connection, including a qualified private HTTPS clone where authorized.
- [x] Provider-specific credential usernames and stable identifiers are tested.
- [x] Wrong host/protocol, malformed inputs, missing/revoked credentials and
  stale selection cannot send a secret or silently choose another account.
- [x] Cancellation, timeout, permission denial and missing registration/config
  provide actionable states, without asking users to paste secrets into logs.
- [x] Tests use fake providers/isolated Git; approved real flows are exercised
  where available, and Windows/Linux qualification evidence or limits are recorded.
- [x] Documentation/ADR, IPC contracts and `pnpm run check` are updated and pass.

# Relevant files

- [ADR 0022](../../../docs/adr/0022-share-provider-accounts-and-scope-git-access.md)
- [Architecture](../../../docs/ARCHITECTURE.md)
- [Design](../../../DESIGN.md)
- [Native registry](../../../src-tauri/src/hosting.rs)
- [Shared credentials](../../../src-tauri/src/credentials.rs)
- [GitHub adapter](../../../src-tauri/src/github_auth.rs)
- [Shared frontend accounts](../../../src/features/accounts/index.ts)

# Dependencies

Completed tasks 148-3, 148-5 and 148-9; a compatible installed glab is required
only for the browser/CLI connection. Native token connections do not require glab.
Verify the chosen version's authorization and credential interfaces before
promising a working browser flow; document unsupported states honestly.

# Execution handoff

Implement this file in the existing approved release branch. Read AGENTS.md and
the linked owners first, inspect current APIs, then implement and verify the
smallest coherent shared adapters. Do not mutate real accounts
just to make tests pass. Keep acceptance and validation evidence current.

# Approved authorization scope (2026-10-04)

The user chose glab after the task split and deferred other providers. This historical
scope change limits the browser adapter to one CLI identity; native tokens are
now also in scope as clarified below:

- Reusing GitLab CLI (`glab`) requires installation, like the current GitHub
  adapter's `gh` dependency. It offers browser/device authorization on GitLab.com
  without a new GitOdile application registration. Inspect the supported version,
  permissions, refresh lifecycle and any shared-session changes; disclose its
  possible plaintext credential fallback. See [GitLab authentication](https://docs.gitlab.com/cli/authentication/).
- The inspected [glab configuration](https://gitlab.com/gitlab-org/cli/-/raw/main/internal/config/config.go)
  keys credentials by host rather than offering gh's exact saved-user lookup.
  Do not claim multiple GitLab.com accounts are supported by merely wrapping
  its default session or change that session before every transfer.
- GitOdile-owned [OAuth with PKCE](https://docs.gitlab.com/api/oauth2/)
  remains future scope if independent multi-account support is needed. It is
  not part of this implementation or a prerequisite for the approved glab route.

When the external CLI session changes, identity revalidation and stale binding
handling must protect the previously selected account. Do not hide the single CLI
GitLab account limit or weaken GitHub's existing multi-account behavior.

# Implementation notes

Implemented on `release/0.3.1` on 2026-10-05. Native PATs and the single glab
GitLab.com identity share the existing account registry, project bindings and
HTTPS helper. Numeric user IDs survive username changes; token/CLI sources and
OS secret namespaces stay separate. The existing clone browser now handles
GitLab membership projects, nested groups, fixed-host URL validation and the
same selected connection through source checks and destination handoff.

Settings reuses shared masked token rows and injected tooling rows: tokens first,
browser second, glab last. Browser consent explains permissions, shared session,
keyring/plaintext behavior and OAuth renewal. `glab >= 1.120.0` is the inspected
minimum for the credential receipt; Windows pins `GLab.GLab`, with official
platform guidance elsewhere. No global Git/SSH changes, self-hosted instances,
MR/CI screens or independent OAuth account registration were added.

Shared owners `hosting_access.rs`, `cli_auth.rs` and `TokenConnectionSection`
retain GitHub's adapter surfaces and metadata compatibility. See
[ADR 0024](../../../docs/adr/0024-connect-gitlab-through-shared-hosting-accounts.md)
for identities, permissions, source inspection and host-level logout limitations.

# Validation and closure — 2026-10-05

The owner accepted the complete GitLab scope after real Windows qualification.
The installed glab browser connection was confirmed by the owner. A temporary
native token with read_api/read_repository permissions was verified and saved
through Settings, discovered a private personal project and cloned it through
the selected Token connection. The clone opened cleanly on main, its initial
commit matched the provider, its remote URL contained no credential, and Project
Settings retained the exact Token connection. The token expires on 2026-10-06.
No real publishing was attempted with this read-only token. Fetch/publish identity
selection and stale-identity rejection are covered by native helper fixtures;
macOS/Linux runtime remains unqualified under ADR 0006.

Windows installation validation exposed stale process PATH and glab's released
version-output format. Detection now checks standard platform installation paths
and accepts the supported released version format. Restart receipts preserve
native-token identity independently of gh/glab; explicit verification refreshes
availability. Neutral provider icons and shared accessible account menus follow
the app style. Project Settings lists only the HTTPS providers in the project's
configured fetch/push remotes, including mixed-provider projects when present.
Real Windows UI checks confirmed GitHub-only and GitLab-only project settings.

The final review covered credential isolation, exact numeric GitLab identities,
fixed-host API requests, bounded output, cancellation, mutation receipts,
metadata persistence, CLI installation/version parsing and shared frontend flows.
It corrected GitHub-only wording in GitLab discovery/access checking and added
an explicit saved-connection read error with a local retry instead of showing
an empty disconnected state. A regression verifies the retry does not contact
the provider. Existing fixtures cover nested projects, pagination, revoked and
malformed tokens, permissions, cancellation and refusal to sign out another ID.

Final aggregate `pnpm run check` passed after the review on 2026-10-05:
documentation/release/icon contracts, frontend architecture (555 modules),
strict TypeScript, 130 frontend files / 1,255 tests, production build, Rust
formatting, Clippy with warnings denied, 548 native library tests and one
actual-binary/system-Git credential helper test. The disposable OS-store test
remains ignored in the aggregate and passed separately during implementation.
Existing Vite chunk warnings are non-fatal. The check used six frontend/native
workers and `src-tauri/target/gitlab-check` to avoid the running Windows binary
lock. Staged whitespace and documentation checks passed before committing.

## Scope clarification — 2026-10-05

The owner confirmed that this task should cover the complete GitLab integration,
following the accepted GitHub experience: native tokens without glab, browser
connection through glab, tooling detection/compatibility and supported installation
flow/guidance in Settings, and discovery in the existing clone project browser.
Reuse the existing tooling installation pattern where supported; disclose manual
installation requirements on other platforms. Tokens and browser accounts share
the project picker and HTTPS credential boundary, preserving exact connection
selection. The one-identity restriction belongs to the glab adapter, not to native
token connections. PR/MR and CI screens remain outside this task.
