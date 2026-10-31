---
id: 148-9
title: Add native GitHub token connections alongside browser authorization
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

# Goal

Complete GitHub account integration with an optional native token connection,
without removing the accepted gh browser flow. This precedes repository
browsing and GitLab; PRs and Actions remain separate later screens.

# Scope and acceptance

- [x] Verify a token's exact GitHub identity before storing it in the OS secure
  store. No plaintext fallback, secret response, renderer persistence or logs.
- [x] Keep browser/token credential sources distinct for the same username.
  Both work through the shared account picker and process-scoped Git helper.
- [x] Tokens work without gh. Restart requires explicit verification; removing
  a connection leaves project bindings unavailable rather than choosing another.
- [x] Input is masked and cleared on ingestion/dismissal. Explain permissions,
  local storage/removal and lack of remote token revocation in English/Spanish.
- [x] Parser/identity/storage/helper, cancellation and UI fixtures pass, including
  a disposable Windows Credential Manager roundtrip.
- [x] Aggregate completion gate recorded below.
- [x] Finish the real Windows UI flow for token connection and selected-account
  access. Real token ingestion, discovery and private clone qualified below.

# Architecture

See [ADR 0023](../../../docs/adr/0023-add-native-github-tokens-and-repository-discovery.md).
The source owner is `github_access.rs`; the feature remains `features/github`.
Eight token connections are bounded separately from gh's saved accounts.

# Dependencies

[148-3](148-3-shared-accounts-and-git-access.md) is complete. The user's
2026-10-04 approval adds native token ingestion to its existing secret boundary.

# Validation

Targeted native/API/helper fixtures and token UI tests pass. A disposable OS
credential entry was stored, read and deleted successfully on Windows. No real
provider authorization or project publishing was performed. macOS/Linux runtime
qualification remains deferred under ADR 0006.

`pnpm run check` passed on 2026-10-05: documentation/release/icon contracts,
frontend architecture, strict TypeScript, 126 frontend files / 1,228 tests,
production build, Rust formatting, Clippy with warnings denied, 531 native
library tests and the actual-binary/system-Git credential-helper test (532
native tests passed). The disposable OS-store qualification is ignored by the
aggregate suite and was separately run successfully as described above.

The check used an isolated Cargo target directory because the running Windows
application locks its normal executable, and six Vitest workers. The aggregate
gate exposed a missing error-code fixture entry (corrected) and an existing
Branches hover/selection fixture race; that fixture now shares one pending
response instead of overwriting its resolver. A native regression also proves
cached catalog reads stay responsive during a simulated secure-store prompt.

Windows Settings was inspected with the new token alternative visible. The user
stopped Computer Use with Escape while opening the clone flow; no further UI
interaction was attempted. Real token entry/private clone validation remains
pending, so this task stays active and GitLab has not started.

The user's 2026-10-05 Settings redesign puts token connections first, browser
connections second and gh tooling last. The token section uses standard Settings
groups and installation rows, with a masked inline editor and expandable
permissions. Both languages explain that tokens work with or without gh and
browser connections require it. Focus returns to the initiating control on
dismissal and to Add token after removal, including catalog replacement.

Targeted TypeScript and Settings/token fixtures passed (72 tests), including
missing-gh availability, ordering, masked input, permission disclosure and exact
connection removal. With the new user request, Windows read-only UI inspection
resumed and confirmed the section hierarchy, empty token state, cached gh account
row and tooling layout in the running Tauri application. No authentication,
credential removal or installer was automated; real token/private clone
qualification remains pending independently of this presentation change.

The aggregate style guard caught a link cursor on the permission disclosure;
it now follows the standard desktop-control cursor. Its 23 style contract tests
pass after that correction.

The final redesign aggregate `pnpm run check` passed on 2026-10-05: 126 frontend
files / 1,231 tests, production build, Rust formatting/Clippy and 532 native
tests passed, with the separately qualified OS-store test still ignored by
default. It reused the isolated Cargo target and six Vitest workers described
above. Documentation and `git diff --check` were checked again after recording
this evidence.

## Real Windows token qualification and closure — 2026-10-05

At the user's request, created a temporary fine-grained token in their GitHub
account after they manually completed GitHub's access confirmation. The token
expires on 2026-10-06, has Contents/Metadata read access, no account permissions,
and access to one selected private repository. The secret was inserted into the
masked native Settings form without placing plaintext in commands, files or
logs. GitOdile verified the exact identity, reported Connected, saved it in the
OS secure store, and cleared the input.

With the browser/CLI connection excluded, the clone picker explicitly selected
the Token connection. Repository discovery returned 17 accessible projects,
including the permitted private repository; the other private project was
excluded. Filtering and selecting that repository led to the destination screen.
The real Tauri application successfully cloned it into a new temporary folder,
opened it, and reported everything saved. System Git confirmed a clean working
tree and a credential-free HTTPS origin. Project Settings retained the exact
Token connection, exercising the separate Git helper's secure-store retrieval.

No publishing was attempted with this read-only token. Missing-gh behavior is
covered by existing fixtures; this real run retained the installed gh tool.
macOS/Linux runtime qualification remains deferred under ADR 0006. The temporary
token remains connected until its expiry; it was not remotely revoked.

The aggregate `pnpm run check` passed: 127 frontend files / 1,241 tests,
production build, architecture/documentation checks, Rust formatting, Clippy,
536 native library tests and one actual-binary/system-Git helper test. The
optional disposable OS-store test remains ignored in the aggregate suite and
was previously qualified separately. This run reused the isolated Cargo target
and six frontend/native workers to avoid the running Windows executable lock.

All acceptance criteria are met for this task. GitLab and PR/Actions remain
separate active children of epic 148.