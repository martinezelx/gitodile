---
id: 148-8
title: Connect Bitbucket through browser authorization
status: blocked
priority: high
type: feature
areas:
  - credentials
  - frontend
  - platform
created: 2026-10-04
completed:
parent: "148"
queue:
---

# Goal

Extend [epic 148](148-connect-github-account.md)'s account/HTTPS-access foundation
to Bitbucket Cloud, preserving GitHub and GitLab integration.

# User outcome

Connect, inspect and disconnect Bitbucket accounts, and choose the account used
when cloning or transferring a project's changes over HTTPS.

# Context

On 2026-10-04 the user approved separating GitLab and Bitbucket after the
feasibility review. GitLab retains [148-4](../done/0.4.0/148-4-gitlab-accounts.md).
The user subsequently limited the current milestone to GitHub/gh and GitLab/glab.
This permanent child ID is retained but removed from the active queue; it no
longer blocks repository discovery, PRs or CI for the two approved providers.
Reuse [148-3](../done/0.4.0/148-3-shared-accounts-and-git-access.md)'s registry, catalog,
picker, persistent project bindings and Git helper instead of duplicating them.

# Scope

- Evaluate Git Credential Manager (GCM) browser authorization first; verify
  whether it can supply cached identity, exact account access and targeted local
  sign-out through supported interfaces. Working Git authentication alone is
  insufficient to satisfy the account-management requirements.
- Inspect current Bitbucket Cloud OAuth/API permissions, stable account IDs,
  credential usernames, refresh behavior and registration requirements before
  choosing the adapter. Record the choice and consequences in an ADR.
- Implement browser connection, cached identity/avatar fallback, explicit
  verification and targeted sign-out in Settings, behind shared account contracts.
- Separate stable account identity and display login from Git credential username;
  Bitbucket UUIDs must not use GitHub's login grammar. OAuth Git access uses
  `x-token-auth`, which must not select or conflate accounts.
- Keep secrets native and out of IPC, diagnostics and process arguments/env.
  Owned credentials use native OS secret storage without an undisclosed plaintext
  fallback. Disclose any shared credential-manager session effects.
- Reuse clone/project selection and exact HTTPS host validation, with no fallback
  to another identity, global Git configuration changes or SSH changes.
- Record required application registration as a maintainer prerequisite; end users
  never register GitOdile. No external registration or real-account mutation is
  authorized by this task split.

# Out of scope

- GitLab authorization (148-4), GitHub-owned OAuth, repository browser, PRs and CI.
- Bitbucket Data Center, enterprise/self-hosted providers and a hosted OAuth
  service unless separately approved.

# Acceptance criteria

- [ ] Bitbucket implements shared account/access contracts; existing providers work.
- [ ] Account identity, avatar, connection status and targeted sign-out are clear
  in English/Spanish, with keyboard access and empty/loading/error/offline states.
- [ ] Multiple saved identities can be selected per project independently of
  global credential-manager state; HTTPS clone/fetch/push use exactly that identity.
- [ ] Stable account identifiers and provider-specific Git usernames are tested.
- [ ] Wrong host/protocol, malformed inputs, missing/revoked credentials and
  stale selection cannot send a secret or silently choose another account.
- [ ] Cancellation, timeout, denied permissions, expired tokens and unavailable
  registration/tooling/storage provide actionable states without exposing secrets.
- [ ] Tests use fake providers/isolated Git; approved real flows are exercised
  where available, with supported-platform evidence or limits recorded honestly.
- [ ] Documentation/ADR, IPC contracts and `pnpm run check` are updated and pass.

# Relevant files

- [ADR 0022](../../docs/adr/0022-share-provider-accounts-and-scope-git-access.md)
- [Architecture](../../docs/ARCHITECTURE.md)
- [Design](../../DESIGN.md)
- [Native registry](../../src-tauri/src/hosting.rs)
- [Shared credentials](../../src-tauri/src/credentials.rs)
- [Shared frontend accounts](../../src/features/accounts/index.ts)

# Dependencies

Completed foundation 148-3; future implementation follows
[148-4](../done/0.4.0/148-4-gitlab-accounts.md).
Resolve authorization prerequisites before promising a working browser flow.

# Blocker / deferred scope

On 2026-10-06 the user approved Bitbucket Cloud API-token connections and
discovery as [148-11](148-11-bitbucket-token-connections.md). This task
now covers only browser authorization (GCM or an OAuth consumer) as a second
source beside those tokens, and stays deferred.


Deferred by the user on 2026-10-04: implement only GitHub and GitLab for now.
Do not implement or requeue Bitbucket without a new scope decision. No missing
technical capability is inferred from this product-priority deferral.

# Feasibility references

Inspected on 2026-10-04; verify current provider behavior before implementation:

- [GCM browser authentication](https://github.com/git-ecosystem/git-credential-manager/blob/main/docs/bitbucket-authentication.md)
  provides an existing OAuth path. Validate account-management support and
  current releases rather than assuming gh-compatible commands.
- [Bitbucket OAuth](https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/)
  documents client-secret-based code exchange/refresh and `x-token-auth` for Git.
  Do not assume PKCE public-client support or treat an embedded application
  secret as confidential; resolve the desktop authorization design explicitly.
- [API tokens](https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/)
  are distinct from OAuth. Do not build a new integration around retired app
  passwords. Native API tokens are now owned by
  [148-11](148-11-bitbucket-token-connections.md) by user decision.

# Execution handoff

Read AGENTS.md and the linked owners, evaluate the smallest supported GCM path,
then choose and implement the adapter. Preserve shared safety boundaries; do not
start discovery or mutate real accounts just to make tests pass.

# Implementation notes

Pending implementation; authorization adapter remains undecided.

# Validation

Pending implementation; no provider qualification is claimed.
