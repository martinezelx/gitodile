---
id: 148-5
title: Browse and clone GitHub projects through the shared hosting contract
status: done
priority: high
type: feature
areas:
  - frontend
  - repository
  - credentials
created: 2026-10-04
completed: 2026-10-05
parent: "148"
queue:
---

# Goal

Finish GitHub discovery and clone handoff before starting GitLab. This task's
ID is retained from the original two-provider browser plan. The user narrowed
this implementation to GitHub on 2026-10-04; GitLab extends the same browser in
[148-4](148-4-gitlab-accounts.md). PRs and Actions follow separately.

# User outcome

Choose a browser/CLI or token connection, find personal/team projects without
copying a URL, and continue through the existing destination preview and clone.

# Scope and acceptance

- [x] Exact selected native credential and identity verification before API
  discovery, without changing the active CLI identity or revealing secrets.
- [x] Bounded, explicit pages with ownership/private/archive metadata, accurate
  permissions/rate-limit errors and a clearly labelled current-page filter.
- [x] Native clone-URL validation; repository and credential source reach the
  existing clone plan and completed project's persisted HTTPS binding.
- [x] Session-only caches isolate identities; switching/removal/cancellation
  rejects late results and unavailable connections lose their cached page.
- [x] Virtualized rows, keyboard navigation, normal/empty/error/loading states,
  English/Spanish and theme variables. No visibility-triggered network access.
- [x] Feature-owned typed port/controller and eager overlay reuse. No new screen
  is added, so navigation registration and keep-alive polling do not change.
- [x] API/pagination/identity fixtures, controller races, virtual list tests and
  discovered-token-repository clone handoff regression pass.
- [x] Aggregate completion gate recorded below.
- [x] Real Windows repository selection and destination handoff, verified in
  Tauri with an existing CLI connection. Actual private-token cloning remains
  a separate credential qualification in [148-9](148-9-github-token-connections.md).

# Out of scope

Hosted project/fork creation, PRs, CI operations, enterprise/self-hosted hosts,
new clone engines, global search and unbounded downloads. Bitbucket remains
[deferred](../../after-1.0/148-8-bitbucket-accounts.md). GitLab's API adapter is next
provider work, not a reason to delay this GitHub closure.

# Architecture and dependencies

[148-9](148-9-github-token-connections.md) precedes this task; existing
[148-3](148-3-shared-accounts-and-git-access.md) clone/access guarantees
remain intact. See [ADR 0023](../../../docs/adr/0023-add-native-github-tokens-and-repository-discovery.md)
for fixed API origin, bounds, current-page search, cache and secret ownership.

# Validation

Targeted API fixtures, stale-account/cancellation tests, virtualized UI and clone
handoff tests pass. `pnpm run check` passed on 2026-10-05: 1,228 frontend tests,
production build, architecture/documentation contracts, Rust formatting, Clippy,
531 native library tests and the actual-binary/system-Git helper test. The gate
used an isolated Cargo target directory and six Vitest workers; details are in
[148-9](148-9-github-token-connections.md). Real Windows UI verification remains
pending after the user stopped Computer Use with Escape. No further UI control
was attempted; this task stays active before GitLab starts.
No real account mutation, private clone or remote publishing is claimed.

## Accepted clone presentation — 2026-10-05

The user approved prototype A and requested its implementation. The clone overlay
now has two input screens without a numbered step header: Git address/GitHub
selection, then editable destination and the clone confirmation. Git address is
first and GitLab is a branded, disabled future provider. Repository rows keep
their selection visible until the destination action. The virtualized list
adapts to short windows so the footer remains visible.

Complete GitHub addresses trigger a debounced, cancellable read-only access check
through the same scoped credentials as cloning. The destination's local plan is
refreshed after edits, and an obsolete plan cannot enable execution. Durable
ownership and privacy rules are in [Architecture](../../../docs/ARCHITECTURE.md)
and [Privacy](../../../docs/PRIVACY.md).

The aggregate gate passed with 1,235 frontend tests in 127 files, a production
build, documentation/architecture contracts, Rust formatting and Clippy, 534
native library tests (one ignored) and the actual-binary/system-Git helper test.
The final aggregate pass after the short-window CSS adjustment also passed
with the same counts and no failures.
The gate uses six Vitest/Rust test workers and the isolated Cargo target
`%TEMP%/gitodile-github-validation-20261004`.

Windows Tauri verification exercised a real public GitHub access check, account
detection and the actual repository catalogue (18 projects), the native
connection selector, selected-row feedback, the filter without matches and the local destination plan with
the same selected CLI account. The clone button enabled only after planning.
No project was downloaded, no token was added or removed, and nothing was
published. Token and private-clone qualification remains pending in 148-9;
this presentation change does not start GitLab or close the broader GitHub epic.

## Project-list density follow-up — 2026-10-05

The user reported that only one or two projects fit and scrolling was difficult.
Refresh is now inside the search capsule, the generic help/cache paragraphs
are removed, and the project list owns the remaining dialog height. The header,
source tabs, connection, search and destination action remain fixed. Compact
rows distinguish project names from owners and show one description line; a
visible ten-pixel scrollbar supports dragging and wheel/keyboard navigation.
The page counter and conditional page arrows share a compact line. Refresh
retains the current page. Account-picker help remains enabled elsewhere.

Focused clone/list/style checks passed. A new UI regression covers cancelling
from the search toolbar, ignoring its late receipt, and explicitly retrying.
Windows Tauri verification confirmed five complete rows and part of a sixth
at the same window size, wheel scrolling and scrollbar dragging to the last
projects while the header/footer stay in place. The aggregate completion gate
passed: 1,236 frontend tests in 127 files, production build, documentation and
architecture contracts, Rust formatting/Clippy, 534 native library tests (one
ignored) and the actual-binary/system-Git helper test. Keyboard Home/Enter and
the no-match filter state were also verified in Tauri. The native automation
did not successfully resize the window, so minimum-height visual qualification
is not claimed. No clone or account mutation was used to validate this change.

## Shared controls follow-up — 2026-10-05

The destination screen no longer shows the generic technical-details disclosure.
Error and cleanup diagnostics retain their disclosure. The project list now uses
the shared auto-hiding scrollbar without local thumb or width overrides. Both
clone and Project Settings use the shared native account selector with an inset,
vertically centred chevron; keyboard selection and the native option list remain.

All 39 focused account, clone, repository-browser and style checks passed.
Windows Tauri verification checked both selector placements, repository-list
wheel scrolling and the destination screen without technical details. No clone
or account preference mutation was performed. The aggregate completion gate
passed: documentation and architecture contracts, 1,236 frontend tests in 127
files, production build, Rust formatting and Clippy, 534 native library tests
(one ignored) and the actual-binary/system-Git helper test.

## Owner-confirmed closure — 2026-10-05

The owner tested the repository browser, confirmed it works correctly and
explicitly requested closing 148-5. All acceptance criteria are met for this
GitHub discovery and clone-handoff scope; real token/private-clone qualification
remains owned by active task 148-9.

The reviewed implementation was committed as 3aa6d9a. Its final aggregate
pnpm run check passed: 127 frontend files / 1,241 tests, production build,
documentation/architecture contracts, Rust formatting/Clippy, 536 native library
tests and the actual-binary/system-Git helper test (537 native tests passed,
one optional OS-store test ignored). The Windows review also exercised the
native account selector, real discovery, wheel scrolling, virtualized Tab entry,
Home/End, Enter selection and Escape dismissal. See the epic's pending integration
review for the corrections and evidence limits.

Closing this task does not close 148-9 or the epic, and does not start GitLab.

The subsequent real token/private-clone qualification passed on 2026-10-05; see
[148-9](148-9-github-token-connections.md). Both GitHub integration children are
now complete. GitLab and PR/Actions remain separate.
