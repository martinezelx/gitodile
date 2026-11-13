# Hosting integration comparison: AngkorGit and GitOdile

This is a dated research baseline, not an architecture specification or a
whole-product security/performance audit. Inspected on 2026-10-04 at AngkorGit
commit `cbfe93cc5d19d298f8794a68200ccb89a8d4db99`. The user requested a source
comparison while choosing GitHub/gh and GitLab/glab for GitOdile's current scope.
Current contracts remain owned by [ARCHITECTURE.md](../ARCHITECTURE.md) and
[ADR 0022](../adr/0022-share-provider-accounts-and-scope-git-access.md); implementation
scope belongs to [epic 148](../../work/after-1.0/148-connect-github-account.md).

## Technology and connection flow

Both applications use Tauri 2, Rust and React/TypeScript. AngkorGit uses
`git2`/libgit2 for repository operations; GitOdile uses system Git. Sharing the
desktop stack does not mean sharing Git or authentication implementations.
No benchmark was performed, so neither approach is called inherently faster.
See AngkorGit's [native dependencies](https://github.com/cheat2001/angkorgit/blob/cbfe93cc5d19d298f8794a68200ccb89a8d4db99/apps/desktop/src-tauri/Cargo.toml)
and [frontend manifest](https://github.com/cheat2001/angkorgit/blob/cbfe93cc5d19d298f8794a68200ccb89a8d4db99/apps/desktop/package.json).

AngkorGit's inspected account flow links to provider token-creation pages,
accepts a pasted token in React state, verifies it through HTTP IPC and sends
it through account-add IPC for native storage. GitHub/GitLab use personal
access tokens; Bitbucket uses an API token and Atlassian email. This flow
does not require gh/glab or implement their browser authorization. See
[AccountsTab.tsx](https://github.com/cheat2001/angkorgit/blob/cbfe93cc5d19d298f8794a68200ccb89a8d4db99/apps/desktop/src/features/settings/AccountsTab.tsx).

Its [accounts.rs](https://github.com/cheat2001/angkorgit/blob/cbfe93cc5d19d298f8794a68200ccb89a8d4db99/apps/desktop/src-tauri/src/core/accounts.rs)
keeps account metadata in JSON and secrets in the OS keyring, keyed by host
and username. It supports several identities on one host and caches retrieved
tokens in native memory. Account addition reports keyring errors rather than
falling back to plaintext storage in that code path. This is a useful strength
compared with the CLI-owned storage policy GitOdile currently inherits.

GitOdile's existing GitHub browser flow delegates authorization and persistence
to gh; the renderer receives identity/status and a temporary device code, not
an access token. gh's possible plaintext fallback is disclosed. The native Git
helper retrieves one exact saved account only for its private pipe to Git.
The approved GitLab route will similarly reuse glab, initially with one verified
GitLab.com identity; it is not implemented or qualified yet. See
[github_auth.rs](../../src-tauri/src/github_auth.rs),
[credentials.rs](../../src-tauri/src/credentials.rs) and
[task 148-4](../../work/done/0.4.0/148-4-gitlab-accounts.md).

## Chosen identity and API ownership

AngkorGit sorts accounts with the project-preferred identity first, then a
default and other candidates. Its Git callbacks can try other saved accounts
and credential helpers when a candidate fails. Its API lookup can also use
another credential when the preferred account lacks a token. These are fallback
semantics, rather than an exact identity guarantee. See
[remote.rs](https://github.com/cheat2001/angkorgit/blob/cbfe93cc5d19d298f8794a68200ccb89a8d4db99/apps/desktop/src-tauri/src/core/remote.rs)
and account selection in the linked accounts owner.

GitOdile deliberately blocks a selected-account transfer when that credential
cannot be obtained, instead of switching identities. It validates HTTPS host,
protocol and username before lookup and changes Git configuration only for the
process. This gives a stronger guarantee for the outcome "use this account";
it does not establish that the whole application is more secure. The same
guarantee is required for future discovery API access in task 148-5.

AngkorGit has a useful separation between TypeScript forge-specific API mapping
and Rust credential/header injection for saved-account requests. Its shared
interface covers PR listing/creation, reviewers, default branch, checkout
specification and avatars, with GitHub/GitLab/Bitbucket adapters. Those features
are implemented there and remain future work in GitOdile. The inspected
contract and clone dialog do not supply a global account repository browser;
this is a bounded observation, not an assertion that no other flow exists.
See [ForgeProvider](https://github.com/cheat2001/angkorgit/blob/cbfe93cc5d19d298f8794a68200ccb89a8d4db99/packages/core/src/forge/provider.ts),
[native forge transport](https://github.com/cheat2001/angkorgit/blob/cbfe93cc5d19d298f8794a68200ccb89a8d4db99/apps/desktop/src-tauri/src/forge.rs)
and [CloneDialog](https://github.com/cheat2001/angkorgit/blob/cbfe93cc5d19d298f8794a68200ccb89a8d4db99/apps/desktop/src/features/repository/CloneDialog.tsx).

## Conclusions for the approved milestone

- Keep browser authorization through gh/glab: it better matches GitOdile's
  beginner audience than manual token creation, despite CLI installation cost.
- Preserve exact selected identity for Git and API access, including when
  glab's external session changes. Do not copy account fallback behavior.
- Reuse shared account/access contracts and keep provider response mapping
  inside adapters, as both projects' architecture intends.
- Discovery needs an explicit paginated repository contract; existing PR
  adapters are not a substitute. Bound responses, isolate account/session caches
  and keep secrets native. See [148-5](../../work/done/0.4.0/148-5-provider-repository-browser.md).
- Native keyring ownership is worth evaluating with future own OAuth, but this
  review does not change the approved CLI-based implementation.

AngkorGit's [MIT license](https://github.com/cheat2001/angkorgit/blob/cbfe93cc5d19d298f8794a68200ccb89a8d4db99/LICENSE)
was inspected. No external source code, assets or product language were copied
or adapted. The application was not installed or exercised, and its tests were
not run; findings describe inspected code paths at the pinned commit.
