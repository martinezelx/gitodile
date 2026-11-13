---
id: 148-6
title: Inspect and create pull requests across hosting providers
status: planned
priority: high
type: feature
areas:
  - frontend
  - credentials
  - sync
created: 2026-10-04
completed:
parent: "148"
---

# Deferred after 1.0.0 (2026-10-27)

By user decision this task is not started before `1.0.0`. It belongs to the
`1.3` "publish with confidence" theme
([ADR 0039](../../docs/adr/0039-position-gitodile-for-humans-and-their-agents.md)) and is designed
with the pre-publish review there, not as a standalone screen. Each project's
pull-request screen is Free; the cross-project inbox and in-app code review are Pro (see
[`BUSINESS_MODEL.md`](../../docs/BUSINESS_MODEL.md#agent-era-allocation)).
Re-read its scope against that theme before scheduling it.

# Goal

Implement a project-scoped collaboration screen in
[epic 148](148-connect-github-account.md) for GitHub pull requests and
GitLab merge requests, with shared UI and provider-specific API adapters.

# User outcome

See proposed changes and their checks, inspect source/target branches, create
a reviewed proposal, and safely open its branch in the local project.

# Scope

- Resolve the supported project remote and selected provider account explicitly;
  ambiguous remotes require a choice rather than guessing from the active CLI.
- Bounded paginated list/details, state/author/branch metadata, provider links
  and checks/status summaries. Unsupported provider fields are shown honestly.
- Create a proposal from a published branch after a provider-specific preview
  identifying project, account, source/target, title/body and visibility.
- Open a proposed branch using existing fetch/safe-switch planning, preserving
  dirty files and avoiding automatic stash, reset or untrusted hook bypass.
- Register the feature-owned screen in screens.tsx, with cache/invalidation,
  session epochs and hidden-effect suspension following the screen contract.
- Keep mutations narrow, permission-checked and revalidated; report uncertain
  creation outcomes and check for duplicates before suggesting a retry.

# Out of scope

- Full diff review/comment/approval suite, merges, closing proposals and branch deletion.
- Implicit publishing or history rewriting to create/open a proposal.
- CI logs/rerun/cancel/dispatch (148-7 owns the Actions screen).
- Bitbucket and other providers, deferred by the user on 2026-10-04.

# Acceptance criteria

- [ ] GitHub and GitLab projects use the same selected account for
  discovery/details/creation, independently of another project's account.
- [ ] Lists/details and checks represent the provider's actual states and pagination.
- [ ] Creation requires an explicit reviewed plan with permissions, branch and
  remote revalidation; unknown remote outcomes cannot encourage duplicate writes.
- [ ] Opening a branch preserves unsaved files and uses existing safety owners;
  stale project/session/remote state blocks the operation.
- [ ] Cached arrival triggers no remote request; account changes and explicit
  refresh/invalidation supersede stale responses; hidden work/announcements stop.
- [ ] Unsupported hosts, permissions, no proposals, offline/rate limits and
  loading/error states are accessible and translated; growing lists virtualize.
- [ ] Native parser/planner fixtures, session/account races, mutation failures,
  screen lifecycle and keyboard tests pass; running app is exercised.
- [ ] Document provider/platform qualification and `pnpm run check` results.

# Relevant files

- [Architecture](../../docs/ARCHITECTURE.md)
- [Screen guide](../../docs/architecture/frontend-feature-guide.md)
- [ADR 0022](../../docs/adr/0022-share-provider-accounts-and-scope-git-access.md)
- [Screen registry](../../src/app/screens.tsx)
- [Shared accounts](../../src/features/accounts/index.ts)
- [Native sync owner](../../src-tauri/src/sync/mod.rs)
- [Branches](../../src/features/branches/index.ts)

# Dependencies

Complete [148-4](../done/0.4.0/148-4-gitlab-accounts.md) and
[148-5](../done/0.4.0/148-5-provider-repository-browser.md) first, reusing their provider API
access and remote identity contracts instead of adding another auth path.

# Execution handoff

Implement this screen separately from CI. Read AGENTS.md, inspect existing safe
fetch/switch planners and primary provider docs, and keep the listed mutation
scope. Expand scope only with the user's explicit approval.

# Implementation notes

Pending implementation.

# Validation

Pending implementation.
