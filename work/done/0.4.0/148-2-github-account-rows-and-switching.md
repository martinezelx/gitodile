---
id: 148-2
title: Align GitHub account rows with Settings and switch saved accounts
status: done
priority: normal
type: feature
areas:
  - frontend
  - credentials
created: 2026-10-04
completed: 2026-10-04
parent: 148
queue:
---

# Goal

Implement the approved interactive prototype in the real GitHub settings:
account avatars, installation-style status chips and actions aligned right,
with several saved accounts and explicit account selection.

# Context

Continue [task 148](../../after-1.0/148-connect-github-account.md) and
[task 148-1](148-1-github-avatar-and-sign-out.md) on release/0.3.1. The user
approved implementing the mock's account list, selection, connection and
individual sign-out. Preserve the existing pending implementation and HTML
explorations. No new branch, worktree, commit or publication is needed.

# Acceptance criteria

- [x] Account rows reuse the installation row and chips, with right-aligned actions.
- [x] Show the active account first and distinguish connected, saved and invalid accounts.
- [x] Activate a saved account through a validated, serialized native gh command.
- [x] Connect another account through the existing browser consent flow.
- [x] Preview and remove only the confirmed account, including an inactive one.
- [x] Block environment-controlled or uncertain mutations; failed verification retries retain uncertainty.
- [x] Preserve cached avatars and identities on optional image/network failures.
- [x] Check focus recovery, inline Escape dismissal, English/Spanish and empty/error states.
- [x] Validate the real Windows UI, simulated multi-account interactions and the completion gate.

# Implementation notes

The feature-owned port and controller now expose saved accounts and selection.
Native status reads every github.com entry, caps the list at 32, validates active
selection and sanitizes metadata. Optional avatar enrichment runs for up to four
accounts concurrently. The existing no-token-export boundary remains in place.
Shared gh session effects stay visible beside the controls.

The initially deferred account picker is now implemented. Its durable rationale
and CLI source references are recorded in
[ADR 0021](../../../docs/adr/0021-reuse-github-cli-authentication.md).
Own OAuth credentials, Enterprise, PR/Actions screens and Git credential setup
remain outside this task.

# Validation

- Focused frontend run: 78 tests passed across account UI/controller, IPC contract
  and branch tests. The account UI/controller contain 26 passing tests in
  the final aggregate run, including keyboard focus and failed retry handling.
- Native authentication coverage: all 21 tests passed in the aggregate, including
  multiple accounts, exact switching, failed post-mutation checks, environment
  overrides and retained uncertainty.
- Windows Tauri app: unchecked/progress/connected states and the real account
  avatar render with chips and actions aligned to the installed-gh row. The
  explicit account check only read the existing session; no real grant, switch
  or logout was performed during validation.
- Temporary browser harness using the real React component: three accounts,
  selection, exact inactive removal, connecting another account, empty state,
  light/dark themes and a narrower viewport passed. The harness was removed.
- An overly specific focus assertion was corrected to accept the selected row's
  retained actionable control. A branch timing failure passed on focused
  repetition and both later aggregate frontend runs. The native contract caught
  an inventory ordering mismatch; it was fixed and its focused test passed.
- Final `pnpm run check` passed: documentation/release/icon contracts, frontend
  architecture, TypeScript, all 1,211 frontend tests, production build, Rust
  formatting, Clippy with warnings denied and all 510 native tests.
- Completion-record Markdown passes `node scripts/check-docs.mjs` after recording
  the gate results. macOS/Linux runtime qualification remains deferred under
  [ADR 0006](../../../docs/adr/0006-defer-macos-and-linux-runtime-validation.md).
