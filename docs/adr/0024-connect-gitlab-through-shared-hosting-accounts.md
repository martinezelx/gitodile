# ADR 0024: Connect GitLab.com through shared hosting accounts

- Status: accepted
- Date: 2026-10-05

## Context

Task [148-4](../../work/done/0.4.0/148-4-gitlab-accounts.md) extends the completed
GitHub token/browser/project-discovery experience to GitLab.com. The existing
registry, project bindings and HTTPS helper already provide source-specific
selection. Unlike gh, glab stores one identity per host. A username can change;
a host session can also change outside GitOdile. Neither can substitute for the
exact connection selected by a project.

## Decision

Reuse the registry and Git helper. `hosting_access.rs` owns shared token storage,
identity verification, bounded HTTP reads and project pagination; lightweight
GitHub/GitLab adapters retain separate Tauri state. GitHub metadata and secret
keys remain compatible. GitLab uses the stable numeric `/user` ID for
`gitlab:token.<id>` and `gitlab:cli.<id>`, keeping display usernames separate.
Native PATs use their own `GitOdile/GitLab.com/token/v1` OS-store namespace with
no plaintext fallback. Secret values stay native, are wiped and never enter
command arguments/environment or IPC replies. The shared masked token form
clears input before submission.

Support glab 1.120.0+ through its native JSON credential interface. Capture its
GitLab.com PAT/OAuth credential privately and verify that same secret against
GitLab.com's `/api/v4/user` before using it. A changed numeric identity fails
closed for old bindings. Login requires an explicitly checked empty session,
fixed GitLab.com endpoints, browser consent and a system-keyring request. glab
owns OAuth refresh and may fall back to plaintext configuration; consent states
this. Sign-out verifies the confirmed ID immediately before host-level logout.
Cancellation retains an uncertain state until explicitly checked. Environment
credentials and unknown receipt formats cannot become another account source.

For PAT discovery, document `read_api`; add `read_repository` for clone/fetch or
`write_repository` for publishing. `api` is a broader alternative. Membership
still limits actual permissions. PAT expiration/revocation needs replacement;
GitOdile does not renew PATs. HTTPS credentials use the nonempty `oauth2` username,
accepted for PATs and required for OAuth; neither source changes global Git/SSH.

The existing clone browser pages membership projects through the selected
connection. Native requests use a fixed origin, no redirects, a 20-second
HTTP timeout, 2 MiB response cap and at most 100 rows per page. Numeric pagination
headers only select the next fixed-origin page. Nested namespace/clone URLs are
validated independently. Changing provider or connection cancels obsolete
selection/receipts. Settings orders tokens, browser connection, then tooling;
opening it reads cached auth state. Shared tooling retains separate glab launch
and update guards and the fixed Windows package `GLab.GLab`. Other platforms
use official guidance.

Reference inspection: GitButler's narrow secret wrapper in
[`crates/but-secret/src/lib.rs`](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/but-secret/src/lib.rs)
reinforces separating persistent secure storage from display/diagnostics. No
source/assets were adapted; its licenses were inspected. glab's pinned
[credential receipt](https://gitlab.com/gitlab-org/cli/-/blob/v1.120.0/internal/commands/auth/credentialhelper/credentialhelper.go),
[authentication guidance](https://docs.gitlab.com/cli/authentication/),
[token scopes](https://docs.gitlab.com/security/tokens/access_token_scopes/),
[OAuth Git access](https://docs.gitlab.com/api/oauth2/) and
[projects API](https://docs.gitlab.com/api/projects/) define the provider boundary.

*Refined 2026-10-06:* login no longer requires a prior explicit check. The
worker captures the host's glab session first; an existing session is
verified and reported instead of being logged in over, and a session GitOdile
already knows must still be signed out before another person connects.

## Consequences

Independent native token accounts work without glab. One CLI identity can coexist
with them; username renames preserve bindings. Self-hosted instances, independent
OAuth accounts, avatars beyond a local fallback and MR/CI screens remain outside
scope. glab's credential interface is version-sensitive and should be rechecked
when its contract changes.

glab offers no atomic compare-and-delete for host credentials. An unrelated
process changing its session between identity verification and logout remains a
race; GitOdile never starts parallel local auth workers and rejects failed or
uncertain verification. Invalid/offline CLI sessions must be repaired externally
before targeted removal. A later transfer rechecks exact credentials rather than
trusting Settings' cached identity.

Hermetic CLI/API/secure-store fixtures cover source separation, identity changes,
permissions, cancellation and malformed data. Windows validates native storage
with a disposable non-account entry and app layout with glab absent. Subsequent
Windows qualification verified a native read-only token, discovered and cloned
a private project, and retained its exact Token binding. The owner also confirmed
the browser/glab connection. Real publishing and macOS/Linux runtime remain
unqualified; evidence and limits belong to the completed task linked above.

## Alternatives considered

- Route PATs through glab: loses independent sources and introduces shared-session
  changes and its possible plaintext fallback.
- Treat usernames/default CLI state as IDs: silently substitutes identities after
  account changes and breaks bindings after renames.
- Register GitOdile OAuth now: future independent accounts need PKCE, registration
  and owned refresh, which exceed the approved adapter scope.
- Duplicate provider stores/UI/helpers: diverges from the shared boundary and
  repeats the GitHub cancellation/storage invariants.
