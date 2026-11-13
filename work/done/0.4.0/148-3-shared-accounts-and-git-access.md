---
id: 148-3
title: Reuse provider accounts for project-scoped HTTPS Git access
status: done
priority: high
type: feature
areas:
  - credentials
  - frontend
  - platform
created: 2026-10-04
completed: 2026-10-04
parent: "148"
queue:
---

# Goal

Complete the account/access foundation of [epic 148](../../after-1.0/148-connect-github-account.md): reuse the browser login,
select an identity per project, and use it for HTTPS clone/fetch/push without
changing the user's global Git configuration or the active gh account.

# Context

The user approved the comparative research and requested reusable account/access
code on 2026-10-04. They have not registered a GitOdile OAuth application and
asked to retain the working browser login. Reuse gh authorization now; own OAuth
is a replaceable adapter rather than a prerequisite. This task implements the
foundation; repository discovery, PR screens and Actions remain epic milestones.

# Scope

- Shared native provider contract, safe account catalog and persistent selections.
- Shared typed frontend account picker for acquisition and project settings.
- Fixed-host helper protocol, internal binary mode before Tauri, bounded local
  gh lookup for an exact account, no second secret store or renderer token.
- Bind the clone preview to its identity and retain that identity for the project.
- Wire project-scoped HTTPS access into all native Git transfer paths.
- Account first in Settings; installation remains the browser-login dependency.
- Document the architecture, cross-platform implications and validation.

# Acceptance criteria

- [x] Existing browser sign-in remains usable without a new application registration.
- [x] One shared account/access implementation supports provider adapters.
- [x] Different projects can use different saved GitHub accounts without gh switch.
- [x] Clone previews show and bind the selected account; final projects retain it.
- [x] Fetch/push/console transfers use the project binding and preserve other hosts/SSH.
- [x] Secrets are neither serialized nor persisted by GitOdile nor passed in argv/env.
- [x] Credential requests for another protocol/host/username fail before secret lookup.
- [x] Missing credentials never silently fall back to another identity.
- [x] Selection errors, stale sessions, stale preferences, busy/empty/invalid states and keyboard access are covered.
- [x] Native helper integration, frontend regressions and pnpm run check pass.

# Decisions

See [ADR 0022](../../../docs/adr/0022-share-provider-accounts-and-scope-git-access.md).
gh remains responsible for its storage policy, including its disclosed plaintext
fallback. GitOdile reads a secret only inside its native helper to answer Git's
private credential pipe. A selected HTTPS identity does not change commit authorship,
prove write access, or configure SSH. No real user login/logout/push is performed
as part of automated verification.

# Validation

- `pnpm run check` passed: documentation/contracts/icons/release checks,
  architecture, strict TypeScript, 123 frontend files / 1,218 tests, production
  build, Rust formatting, Clippy with warnings denied, 521 native library tests
  and the real-Git helper integration test (522 native tests total).
- After the final explicit-URL and removed-adapter safeguards, repeated Clippy
  over all targets/features, 15 focused credential regressions and the actual
  desktop-binary helper test; all passed. `git diff --check` passed.
- The helper integration runs the real desktop binary with system Git and an
  isolated compiled fake gh. It covers an exact inactive account, a quoted
  executable path, environment-token/debug isolation, scoped-helper precedence,
  missing credentials and rejected hosts without fallback to another helper.
  No real account, network, keychain or user Git configuration is involved.
- Shared provider fixtures cover GitHub and GitLab contracts, separate persistent
  project bindings, stale writes, invalid preferences, failed persistence,
  missing adapters, embedded URL credentials and path-specific HTTP headers.
- Frontend regressions cover reusable provider pickers, unavailable/empty/busy
  states, retry after a lost receipt, hidden polling, session epochs, recovery
  of an uncertain write, and the reviewed clone identity through execution.
- Inspected the Windows Tauri development app: account before installation,
  unchanged installed-gh chip/actions, project account selector with existing
  Git credentials, empty account state, accessible labels, keyboard dismissal
  and the matching rounded field style. Closed the development process to
  release Windows' executable lock before native verification.
- Real OAuth login/logout, private-repository transfers and publishing were not
  performed against the user's accounts. Existing browser flow remains covered
  by fake-process and frontend tests. Packaged macOS/Linux helper and credential
  store qualification remain deferred under ADR 0006.

# Implementation notes

The native registry, account catalog, project binding store and helper protocol
are shared. GitHub implements the adapter with gh; GitLab/Bitbucket are not
registered integrations yet. Selection is explicit for HTTPS clone and project
remote settings, independent of gh switching and commit identity. Process-only
Git settings preserve persistent configuration and SSH/other hosts. No second
secret store is created. A clone that completes before a preference failure
returns the completed result with `accountSelectionSaved: false`. The UI handles
any outstanding staging cleanup, shows the completed destination and explains
manual account selection; it offers neither a clone retry nor automatic opening
with default credentials.

Repository discovery, PRs, Actions and broader platform qualification remain
milestones of epic 148; this child completes the shared account/access foundation.
