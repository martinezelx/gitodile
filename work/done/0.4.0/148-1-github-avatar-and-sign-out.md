---
id: 148-1
title: Show GitHub avatars and sign out from Settings
status: done
priority: normal
type: feature
areas:
  - frontend
  - credentials
created: 2026-10-03
completed: 2026-10-04
parent: 148
queue:
---

# Goal

Show the connected account's avatar and allow targeted sign-out before
connecting another account from Settings.

# Context

The user requested these additions after [task 148](../../after-1.0/148-connect-github-account.md).
Continue on the existing release/0.3.1 branch and preserve the pending implementation
and unrelated HTML explorations.

# Scope

- Retrieve a small public avatar during explicit account actions, cache it in
  native memory and render inline image data with a placeholder on failure.
- Preview removal of the exact displayed account from the shared local gh session.
- Respect environment credentials, serialize/cancel workers and inspect any
  account that gh automatically activates after logout.
- English/Spanish copy, tests, Windows UI validation and documentation.

# Out of scope

OAuth revocation, browser logout, account picker, GitHub Enterprise, token export,
Git credential setup, publishing or signing out the user's real account during tests.

# Acceptance criteria

- [x] Avatar download is optional, bounded, restricted to GitHub's CDN and cached.
- [x] Opening Settings or cached polling causes no profile/avatar requests.
- [x] Avatar failure preserves account identity and connection status.
- [x] Sign-out previews its shared effect and submits only the confirmed username.
- [x] Stale usernames and environment credentials cannot trigger local logout.
- [x] Successful removal clears the previous account even if verification fails.
- [x] Another automatically selected account is shown honestly.
- [x] Tests and `pnpm run check` pass; real UI and platform limits are recorded.

# Decisions

- A native client downloads a fixed CDN URL derived from a verified numeric account
  id. It sends no OAuth token and permits no redirects; renderer CSP stays unchanged.
- gh logout removes local credentials; it does not revoke OAuth authorization or
  close the browser session. Another stored account may become active.
- A shared encoding helper reuses the existing image transport encoder.

# Validation

- Native focused tests: 14 passed, including exact-user logout, automatic next
  account, denied logout, failed post-removal checks, avatar safety/fallback,
  first-HTTPS provider initialization and unexpected worker failure.
- Frontend focused tests: 19 passed, including inline image fallback, shared
  confirmation, safe initial focus, exact target, environment restrictions,
  stale action receipts and polling after a fast cancellation.
- Windows Tauri development app: the native explicit check retrieved and displayed
  the existing account's real avatar. Sign-out opened the account-specific preview;
  choosing Not now retained the connected identity and avatar. The user's real
  credentials were not removed and no OAuth grant/revocation was performed.
- A first-avatar TLS initialization failure was found in real UI validation and
  corrected using the updater's existing ring provider. A network-free native
  regression test covers client construction before an updater check.
- Real macOS/Linux browser/credential-store validation remains deferred under
  [ADR 0006](../../../docs/adr/0006-defer-macos-and-linux-runtime-validation.md).
- `pnpm run check` passed: documentation/release/icon contracts, architecture,
  TypeScript, 1,204 frontend tests, production build, Rust formatting, Clippy
  with warnings denied, and all 503 native tests. Native total includes the
  14 focused authentication tests.
