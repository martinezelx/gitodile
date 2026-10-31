---
id: 148
title: Complete GitHub and GitLab integration with reusable provider accounts
status: planned
priority: high
type: epic
areas:
  - frontend
  - credentials
  - platform
created: 2026-10-03
completed:
parent:
---

# Moved after 1.0.0 (2026-10-27)

Hosting accounts are delivered and stay Free. The epic's remaining children
are deferred: the PR and checks screens (148-6, 148-7) are planned for the
`1.3` "publish with confidence" theme, and Bitbucket browser authorization
(148-8) stays blocked. Bitbucket tokens (148-11) are implemented and wait here
only for real-account qualification. See
[ADR 0039](../../docs/adr/0039-position-gitodile-for-humans-and-their-agents.md).

# Epic expansion (2026-10-04)

The user requested a complete hosting integration, beginning with GitHub and
preparing shared accounts/access for GitLab and Bitbucket. Reopen task 148 as
an epic; the original completed implementation and evidence below remain historical.

The user clarified that the existing browser login should remain available
without registering GitOdile as another OAuth client. The GitHub adapter therefore
continues to reuse gh, behind the shared contract in
[ADR 0022](../../docs/adr/0022-share-provider-accounts-and-scope-git-access.md).

Current milestone scope, clarified by the user on 2026-10-04: finish GitHub
browser/gh plus native token connections and its repository browser first;
then GitLab.com through glab and the shared browser. PRs and Actions are later
screens and do not block the account/discovery closure. Other
provider adapters are deferred; generic Git remote URL access remains available.

Milestones, in dependency order:

- [x] Browser connection and cached account status (original task 148).
- [x] Avatars and targeted sign-out ([148-1](../done/0.4.0/148-1-github-avatar-and-sign-out.md)).
- [x] Saved account rows and shared gh switching ([148-2](../done/0.4.0/148-2-github-account-rows-and-switching.md)).
- [x] Shared accounts and project-scoped Git access ([148-3](../done/0.4.0/148-3-shared-accounts-and-git-access.md)).
- [x] Native GitHub token connections ([148-9](../done/0.4.0/148-9-github-token-connections.md)).
- [x] GitHub repository discovery and clone handoff ([148-5](../done/0.4.0/148-5-provider-repository-browser.md)).
- [x] GitLab.com accounts/access and browser extension ([148-4](../done/0.4.0/148-4-gitlab-accounts.md)).
- [x] GitHub Enterprise Server and GitLab Self-Managed hosts ([148-10](../done/0.4.0/148-10-enterprise-and-self-managed-hosts.md)).
- [ ] Bitbucket Cloud token connections and repository discovery ([148-11](148-11-bitbucket-token-connections.md)).
- [x] Azure Repos Services organization/PAT connections ([148-13](../done/0.4.1/148-13-azure-repos-token-connections.md)).
- [x] Profile pictures for every hosting account, kept apart from the project icon and the GitOdile profile ([148-14](../done/0.4.1/148-14-hosting-account-profile-pictures.md)).
- [ ] Pull/merge requests: list/details/create/checks and safe branch opening ([148-6](148-6-pull-request-screen.md)).
- [ ] Actions/CI: runs/status/logs and planned rerun/cancel/dispatch ([148-7](148-7-actions-and-ci-screen.md)).
- [x] Read-only gh/glab shortcuts in the project console ([148-12](../done/0.4.0/148-12-console-gh-and-glab-shortcuts.md)).
- [ ] Deferred provider scope: Bitbucket Cloud browser authorization ([148-8](148-8-bitbucket-accounts.md)); outside the current completion gate.
- [ ] Subsequent scope: GitOdile-owned GitHub authorization, with browser sign-in independent of gh (see below).

Each child owns qualification of its account/access/API behavior across supported
platforms and must record deferred evidence honestly. Independently branded
OAuth remains subsequent scope; corporate hosts moved into 148-10. Provider features use shared accounts/access
but keep their own API permissions and operation plans. No current account row
may imply these screens already exist.

## Comparative implementation references

The approved research informs ownership and workflow, not copied code or assets:

| Reference | Principle used in GitOdile |
| --- | --- |
| [GitHub Desktop](https://github.com/desktop/desktop/blob/development/app/src/lib/trampoline/trampoline-credential-helper.ts) | An app-owned helper coordinates the chosen identity with system Git. |
| [GitKraken Desktop](https://help.gitkraken.com/gitkraken-desktop/github-gitkraken-desktop/) | Provider accounts support repository discovery and subsequent collaboration features. |
| [SourceTree](https://support.atlassian.com/sourcetree/kb/viewing-remote-hosted-repositories/) | A remote repository browser is distinct from local project operations. |
| [Tower](https://www.git-tower.com/help/guides/remote-repositories/connect-authenticate/windows) | Hosting account connection, HTTPS authentication and SSH configuration need clear boundaries. |
| [GitButler](https://docs.gitbutler.com/features/forge-integration/github-integration) | Multiple accounts and project selection belong in a shared hosting layer. |

GitOdile retains the user's accepted gh browser login now. Own OAuth is a future
adapter decision, not a requirement imposed on users or a reason to block this epic.

## Pending: GitOdile-owned GitHub authorization

Recorded at the user's request on 2026-10-04. Keep the current gh browser login
working; this is future work, not an instruction to implement or register an app now.
It does not block completion of the current account/HTTPS-access foundation.

- [ ] Register GitOdile's own GitHub authorization application and choose the
  supported browser flow; users must not need to register an application themselves.
- [ ] Implement authorization behind the shared provider account/access contracts,
  preserving project account selection and avoiding a separate accounts subsystem.
- [ ] Manage credentials in native OS secret storage, with cancellation, denied
  authorization, expired/revoked access and sign-out handled explicitly.
- [ ] Provide an explicit transition for existing gh accounts without silently
  copying credentials or changing the user's gh session or Git configuration.
- [ ] Verify browser sign-in and HTTPS access with gh absent, including supported
  platforms, and update the security/architecture decision before implementation.

The account/HTTPS-access foundation is complete in task 148-3. The current
integration remains open for three active children and their platform qualification;
Bitbucket and independently branded authorization remain later scope.

## Provider task split (2026-10-04)

The user approved separate GitLab and Bitbucket tasks after reviewing feasibility.
148-4 retains its permanent ID for GitLab; new child 148-8 owns Bitbucket and
follows GitLab before discovery, PRs and CI. Existing task IDs and historical
validation remain unchanged; later queue positions shift by one.
Authorization choices remain pending: glab installation is needed only if its
adapter is chosen, and neither its default session nor GCM Git access alone
proves the required multiple-account management. See the provider task handoffs.

Split validation: documentation/link/queue checks and `git diff --check` passed.
`pnpm run check` passed documentation/release/icon contracts, architecture,
strict TypeScript, 123 frontend files / 1,220 tests, production build, Rust
formatting and Clippy. The aggregate gate then failed before native tests:
the running development GitOdile held `target/debug/gitodile.exe`, so Cargo
could not replace it on Windows (access denied, OS error 5). No native-test
pass is claimed for this split; the existing application was left running.

## Two-provider scope and comparative review (2026-10-04)

The user chose gh for GitHub and glab for GitLab.com, with both available in
148-5's repository browser. Bitbucket 148-8 is deferred under `work/blocked/`,
removed from the active queue and from 148-5/148-6/148-7 dependencies/scope.
Later queue positions return to their prior relative order; IDs stay permanent.
GitHub keeps multiple accounts; the first glab adapter supports its current
verified identity, and a changed external identity invalidates old bindings.
No GitOdile-owned OAuth registration is part of this milestone.

The user also requested a source comparison with AngkorGit. The dated,
commit-pinned evidence and limits are recorded in
[the hosting comparison](../../docs/architecture/hosting-integration-comparison.md).
The review does not authorize adopting its token-entry or account-fallback flows.

Scope/research validation: `pnpm run check` passed documentation/release/icon
contracts, frontend architecture, strict TypeScript, 123 frontend files / 1,220
tests, production build, Rust formatting, Clippy and 524 native library tests
plus the actual-binary/system-Git helper integration test (525 native tests).
The earlier executable-lock limitation above describes the first task-split
attempt, not this successful run. `git diff --check` and documentation checks
passed after recording the evidence. GitLab/discovery implementation remains
pending; no real provider login, account mutation or publishing was performed.

# Original completed goal

The historical sections below describe the original account milestone, not the
scope of the newly queued provider/discovery/PR/CI children.

Detect and connect the active github.com GitHub CLI account from Settings,
with a reusable native authentication boundary for future PRs and Actions.

# User outcome

Users can connect in their system browser and see which GitHub account will be
used, without copying a token or changing Git credentials.

# Context

The user approved this follow-up to [task 146](../done/0.4.0/146-github-cli-and-tooling-settings.md)
on 2026-10-03 and explicitly requested immediate implementation. Work uses the
existing release/0.3.1 branch. The task took the first queue position while active;
existing queued work retained its relative order.

# Scope

- Explicit account detection and connection checking; cached Settings rendering.
- Bounded, cancellable browser login with a temporary code and strict URL validation.
- A shared GitHub authentication service and feature-owned typed port/controller.
- Honest shared-session, environment-credential and plaintext-storage disclosures.
- English/Spanish states, keyboard access, tests and durable architecture documentation.

# Out of scope

- PRs/Actions screens, GitOdile account login, custom OAuth or token import.
- Git credential setup, SSH keys, global account switching or logout.
- GitHub Enterprise, publishing this release, unrelated HTML explorations.

# Acceptance criteria

- [x] Existing active accounts are detected only after explicit network action.
- [x] Compatible gh is verified without contacting GitHub; old versions request update.
- [x] Login shows a copyable code and opens only the official device authorization URL.
- [x] Concurrent actions, cancellation, timeout, denied login and browser failure are handled.
- [x] Cached account identity survives Settings navigation; hidden Settings suspends polling.
- [x] No access token, raw output or secrets cross IPC or enter diagnostics.
- [x] Git configuration, credential helpers and SSH keys are unchanged.
- [x] Shared session and plaintext fallback are disclosed before login and after detection.
- [x] Native fake-process integration and frontend regression checks pass.
- [x] The development app is exercised where the available UI tools permit it.
- [x] pnpm run check passes and platform validation limits are recorded.

# Relevant files

- [Architecture](../../docs/ARCHITECTURE.md)
- [Design](../../DESIGN.md)
- [ADR 0020](../../docs/adr/0020-prepare-optional-github-cli-tooling.md)

# Dependencies

Completed optional gh tooling; system gh with JSON authentication-status support.

# Decisions

- Reuse gh's active session without exporting, importing or storing an access token.
- Prompt before browser login about shared state and gh's possible plaintext fallback.
- Retain a previous known account on network failure; distinguish invalid authentication.
- Do not create another branch/worktree or run a real login during automated tests.

# Implementation notes

Implemented the native memory-only authentication service, fixed command plans,
bounded streaming, exact-operation cancellation and account/status parsing.
The feature-owned controller and eager Settings body use the existing composition
root, translations, design tokens and exact browser capability scope.

The noninteractive gh login and secure-storage behavior were inspected in GitHub
CLI's public implementation. gh 2.80 lacks auth-status JSON, so local capability
detection precedes auth actions. See
[ADR 0021](../../docs/adr/0021-reuse-github-cli-authentication.md).

# Validation

- Focused native authentication tests: 8 passed, including fake executables,
  streamed device-code output, overflow, unsupported CLI, denied login,
  timeout/cancellation, retained identity and secret-safe serialization.
- Full frontend suite: 122 files / 1,199 tests passed; TypeScript, architecture
  checks and production build passed.
- Windows Tauri development app: inspected initial account state, expanded and
  dismissed consent without login, detected the existing account through the
  native service, and verified it remained visible after General/GitHub navigation.
- gh 2.96.0 with an isolated empty temporary configuration returned `hosts: {}`
  with exit zero, confirming the signed-out parser contract without changing
  the user's configuration.
- A new OAuth grant was not performed against the user's account. Device login
  is covered by fake-process and frontend interaction tests; real macOS/Linux
  browser and credential-store qualification remains deferred under ADR 0006.
- `pnpm run check` passed: documentation, release/icon contracts, architecture,
  TypeScript, all 1,199 frontend tests, production build, Rust formatting,
  Clippy with warnings denied, and all 497 native tests. The 8 authentication
  tests are included in that native total.

# First epic commit review (2026-10-04)

The user requested four executable children for subsequent conversations, then
a review and first commit of the pending epic implementation on release/0.3.1.
Tasks 148-4 through 148-7 take queue positions 01–04; previous work keeps its
relative order. PRs and CI have separate owners/plans; qualification belongs to
each child. Own GitHub authorization remains a later explicit pending item.

Reviewed the native account/authentication owners, Git helper and transfer
facade, clone planning/publication, IPC/admission inventory, frontend receipts,
Settings/account selection, permissions, tests and documentation. Corrected:

- A completed clone with failed account persistence returned an error that the
  UI localized generically and offered to retry. Preserve its verified result
  and destination instead, finish any staging cleanup, then explain manual
  account setup without cloning or opening automatically with another identity.
- A failed fresh account check retained old connected flags in the catalog.
  Keep identity/avatar metadata, mark those rows unchecked and require explicit
  verification before selecting them again; existing project bindings remain.
- Reject credentials/query parameters/wrong hosts or ports for selected-account
  clone previews, consistently with the transfer helper's validation.
- Installation guidance now points below the account body in both languages.

Validation: `pnpm run check` passed after those corrections: documentation and
release/icon contracts, frontend architecture, strict TypeScript, 123 frontend
files / 1,220 tests, production build, Rust formatting, Clippy with warnings
denied, 522 native library tests and one actual-binary/system-Git helper test
(523 native tests total). Focused UI regressions also cover account persistence
failure with and without staging cleanup. No new OAuth grant, real sign-out,
private clone or publishing is part of these checks. Packaged macOS/Linux
qualification remains deferred as documented in ADR 0006.

Windows Tauri smoke check after the aggregate gate: the account body appears
before installed gh 2.96.0, with accessible account/status labels and matching
right-aligned actions. Arrival shows the unchecked cached state without an
authentication action; Settings dismissal by Escape was exercised. New warning
and failure variants are covered by isolated automated UI/native fixtures.

Exploratory root HTML files and the mock screenshot stay in the workspace,
outside the production implementation commit. No remote push is requested.

# HTTP credential challenge regression (2026-10-04)

The first real publish attempt exposed a parser incompatibility: Git 2.55.0 on
Windows supplies both `capability[]=authtype` and `capability[]=state` when an
HTTP endpoint challenges authentication. Rejecting every duplicate key caused
the helper to return `quit=true` before consulting gh. Basic credential-fill
fixtures and public repository reads did not exercise that challenge.

Accept repeated array attributes according to Git's wire protocol and ignore
unsupported extension values. Keep the input bound and exact protocol, host and
account validation, including rejection of duplicate scalar identity fields.
Cover the HTTP request in both a provider unit test and the actual desktop
binary integration fixture. Verification uses a non-publishing dry run; no
remote branch is changed and no credential is exposed in diagnostic output.

Validation: `pnpm run check` passed (1,220 frontend tests, 523 native library
tests and the actual-binary helper integration test). Against the real origin,
the exact-account `git push --dry-run --no-verify` reproduced `quit=true` before
the fix and exited successfully with the corrected binary. No push was executed;
the dry run does not run the project's pre-push hook or publish changes.

# GitHub token and discovery implementation (2026-10-05)

The user approved finishing GitHub connection and discovery before GitLab, and
explicitly excluded PR/Actions screens from this closure. Native token access
and the clone repository browser are implemented in
[148-9](../done/0.4.0/148-9-github-token-connections.md) and
[148-5](../done/0.4.0/148-5-provider-repository-browser.md), under
[ADR 0023](../../docs/adr/0023-add-native-github-tokens-and-repository-discovery.md).

`pnpm run check` passed: 1,228 frontend tests, production build, architecture and
documentation contracts, Rust formatting, Clippy, 531 native library tests and
one actual-binary/system-Git helper integration test. The disposable Windows
credential-store roundtrip also passed separately. The gate used an isolated
Cargo target directory to avoid the running application's Windows file lock,
with six frontend test workers. Validation also corrected the error-code
contract fixture and an existing Branches hover/selection test race.

The token alternative was visible in real Windows Settings. Computer Use was
stopped by the user with Escape while entering the clone flow, so no further UI
control was attempted. Token entry and real repository-browser/selected-account
clone qualification remain pending; the two tasks stay active and GitLab has
not started. macOS/Linux runtime limits remain governed by ADR 0006.

# Pending integration review (2026-10-05)

The user requested a review of the entire pending implementation and a local
commit after verification. Reviewed native token storage, identity selection,
API discovery, credential helpers, source checks, clone planning, IPC contracts,
frontend controllers, Settings, virtual rows, styling, translations and task
documentation. The existing owner-approved task closures and queue changes are
preserved; exploratory root HTML/JPG files remain outside the production commit.

Corrections and regression coverage:

- Recheck cancellation after waiting for the secure-store mutation lock, before
  starting a token write. A cancelled queued connection must not be saved.
- Fence discovery success and failure receipts by the token metadata revision.
  A request using a removed token cannot show an old page or invalidate a newly
  reconnected token with the same account identifier.
- Reload the cached catalog after both successful and failed token mutations.
  Lost IPC receipts and partial removal failures must display the actual local
  connection state while preserving the error instead of claiming success.
- Keep a rendered tab stop after virtual scrolling and reset row focus on a
  same-page refresh. Keyboard entry must not disappear with an unmounted row.
- Redact credentials in incomplete Git URL summaries while preserving local
  Windows paths and filenames containing punctuation.
- Restore blocking mode on accepted sockets in the actual-binary helper's HTTP
  fixture. Windows inherits the nonblocking listener mode; its first read raced
  Git's send despite the configured read timeout. The original aggregate run
  passed 1,241 frontend and 536 native library tests, then exposed this fixture
  failure. The corrected actual-binary test passed separately.

Focused validation: 32 frontend tests and nine GitHub access native tests pass;
the disposable OS-store test remains ignored in the default suite. Read-only
Windows Tauri validation detected the existing gh connection, opened its native
selector, loaded 18 projects and exercised scrolling, Tab entry after scrolling,
Home/End, Enter selection and Escape dismissal. Header/search/footer stayed
fixed; selecting a row enabled Choose destination without executing a clone.

These checks do not qualify a real personal token, private clone, new OAuth
grant, publishing or macOS/Linux runtime behavior. Task 148-9 retains its real
token qualification item; GitLab and PR/Actions implementation remain separate.

Final aggregate `pnpm run check` passed after the fixture correction:
documentation/release/icon contracts, frontend architecture, strict TypeScript,
127 frontend files / 1,241 tests, production build, Rust formatting, Clippy with
warnings denied, 536 native library tests and the actual-binary/system-Git
helper test (537 native tests passed; the disposable OS-store test is ignored
by default). It used the isolated Cargo target directory to avoid the running
Windows executable lock and six frontend/native test workers. Documentation
and staged `git diff --check` passed again after recording the result.

## GitHub integration closure — 2026-10-05

The owner confirmed the repository browser works and authorized closing 148-5.
The subsequent real Windows qualification completed 148-9: a temporary
fine-grained read-only token was verified and saved through Settings, listed
permitted repositories, and successfully cloned a private project through the
selected Token connection. The clone opened cleanly and retained that exact
connection in Project Settings. The token expires on 2026-10-06; no publishing
was attempted. Details and limits are recorded in the completed child tasks.

The aggregate `pnpm run check` passed again (1,241 frontend tests, 536 native
library tests and one actual-binary helper test). GitHub connection and discovery
are now complete for the accepted scope. GitLab 148-4 is next in the active
queue; PR/Actions 148-6/148-7 remain later work. The epic itself stays active.
## GitLab integration closure — 2026-10-05

The owner accepted and closed [148-4](../done/0.4.0/148-4-gitlab-accounts.md) after
real Windows token discovery/private cloning and browser-account qualification.
GitHub and GitLab integration are complete for the accepted scope; PR/Actions
148-6/148-7 remain in the active queue. Platform qualification limits and review
results are recorded in the completed GitLab task.

## Corporate hosts (2026-10-06)

The user requested GitHub Enterprise Server and GitLab Self-Managed accounts
alongside the public hosts. New child [148-10](../done/0.4.0/148-10-enterprise-and-self-managed-hosts.md)
generalizes the fixed-host registry, account IDs, token namespaces, helper and
clone checks into host-scoped provider instances. It takes queue position 01,
ahead of PRs/Actions, so those screens consume the same instances; every other
active task keeps its relative order.

## Integration review fixes (2026-10-06)

The user requested a review of the delivered GitHub/GitLab integration and
approved these corrections before 148-10:

- Repository descriptions with CRLF or other control characters no longer reject
  a whole discovery page; `display_text` normalizes and bounds display text while
  names, owners and clone URLs stay strictly validated.
- Verified token rows stay selectable during a background check, and checks and
  discovery are fenced per connection: changing one token no longer discards or
  invalidates another token's result. GitLab renames found by a check persist.
- Project Settings warns when a provider remote stores sign-in details (shown
  redacted) or uses HTTP, the cases the transfer guard refuses.
- The hosting clients keep the updater's single Reqwest/TLS configuration by
  design; the app-update contract check now fails if the OS trust store verifier
  or OS proxy support disappears (corporate CAs and proxies depend on both).
- The glab Git-helper lookup skips its per-transfer version probe and still
  verifies the numeric identity.
- `extraHeader` wildcards follow Git's one-label rule: wildcards for other hosts
  no longer block transfers; one matching a selected host is refused with an
  explanation. ADR 0022 records the refinement.
- The token check thread is named per provider.

Validation: `pnpm run check` passed — documentation/release/icon contracts,
frontend architecture, strict TypeScript, 130 frontend files / 1,256 tests,
production build, Rust formatting, Clippy with warnings denied, 550 native
library tests (1 ignored OS-store qualification) and the actual-binary helper
test. It used an isolated Cargo target directory. No real provider login,
token change, clone or publish was performed for these fixes, and the warning
was verified by component tests rather than in the running app.

## Company servers closed and Bitbucket tokens queued (2026-10-06)

The owner closed [148-10](../done/0.4.0/148-10-enterprise-and-self-managed-hosts.md)
with real company-server qualification recorded as unavailable. The user then
approved Bitbucket Cloud through native API tokens, as GitHub and GitLab tokens
work. New child [148-11](148-11-bitbucket-token-connections.md) owns that scope
and takes the freed queue position 01, ahead of PRs/Actions, so those screens
are built on three products. Bitbucket browser authorization stays deferred in
[148-8](148-8-bitbucket-accounts.md); every other active task keeps
its position.

## Saved accounts verified after launch (2026-10-06)

The owner judged that requiring **Check accounts** after every launch before
cloning or publishing makes no sense. After reviewing GitHub Desktop, Fork and
Sourcetree, saved connections of every product are verified in the background
three seconds after launch, as GitHub Desktop does
([ADR 0027](../../docs/adr/0027-verify-saved-accounts-after-launch.md)).
Provider sections also render the last account receipt at once when shown
again, and never show an unread catalog as empty.

## gh and glab in the console (2026-10-06)

The owner asked for gh/glab commands in the project console. Typed gh/glab
lines would need a classifier of their own (`api`, `extension`, `alias` and
`auth token` run programs, reach anything or print secrets), so the first step
is a closed set of read-only shortcuts using the CLI's own login:
[148-12](../done/0.4.0/148-12-console-gh-and-glab-shortcuts.md), completed on 2026-10-07 together with the provider row in the console welcome.
