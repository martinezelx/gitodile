---
id: 148-7
title: Inspect and safely control provider automation runs
status: planned
priority: high
type: feature
areas:
  - frontend
  - credentials
  - platform
created: 2026-10-04
completed:
parent: "148"
---

# Deferred after 1.0.0 (2026-10-27)

By user decision this task is not started before `1.0.0`. It belongs to the
`1.3` "publish with confidence" theme
([ADR 0039](../../docs/adr/0039-position-gitodile-for-humans-and-their-agents.md)) and is designed
with the pre-publish review there, not as a standalone screen. Each project's
checks and CI screen is Free; the cross-project inbox and failed-check explanations are Pro (see
[`BUSINESS_MODEL.md`](../../docs/BUSINESS_MODEL.md#agent-era-allocation)).
Re-read its scope against that theme before scheduling it.

# Goal

Implement the Actions/CI screen in [epic 148](148-connect-github-account.md):
GitHub Actions and GitLab CI/CD through reusable account
and project identity contracts, preserving each provider's actual capabilities.

# User outcome

Understand whether automation passed, inspect bounded job details/logs, and
deliberately request a supported rerun, cancellation or manual execution.

# Scope

- Feature-owned project screen with paginated runs, actual state/conclusion,
  branch/version metadata, job details and explicit bounded log retrieval.
- Adapt provider-specific workflow/pipeline semantics behind a small shared
  capability contract; retain provider terminology where necessary to be precise.
- Same selected account and verified remote identity as repository/PR features.
- Rerun, cancel and manual execution only where supported and permitted, through
  separate narrow plans identifying the exact run/workflow/ref/inputs/account.
- Explain that automation can use paid compute, deploy changes or execute remote
  code; confirm actions, revalidate targets and permissions, and avoid duplicate
  dispatch when the outcome is unknown.
- Logs are untrusted text: bound downloads/decompression, disable active content,
  sanitize terminal/control sequences and redact known secrets in diagnostics.
  Opening logs is explicit; never claim provider logs are guaranteed secret-free.
- Active-only bounded polling only if justified for an explicitly followed run;
  stop hidden/account/session-changed requests and honor provider rate limits.

# Out of scope

- Editing workflow YAML, managing secrets/variables/runners or arbitrary API/CLI calls.
- Downloading/executing build artifacts, changing billing or approving deployments.
- PR review/merge, self-hosted providers and automatic reruns/dispatch.
- Bitbucket Pipelines and other providers, deferred by the user on 2026-10-04.

# Acceptance criteria

- [ ] Runs/jobs/logs work for GitHub and GitLab where the account/project has
  CI enabled; unsupported/missing/disabled capabilities have truthful states.
- [ ] Provider/host/account/project/session keys isolate caches and stale replies.
- [ ] Read operations are bounded/cancellable, cached arrival is network-free,
  hidden polling stops and offline/rate-limit errors preserve useful snapshots.
- [ ] Each supported remote mutation has reviewed parameters, fresh permission
  checks and uncertain-outcome handling without unsafe automatic retry.
- [ ] Log limits, malformed payloads, redirects/download hosts and control/HTML
  sequences are covered without executing or exposing secret-bearing content.
- [ ] Accessible English/Spanish UI, loading/empty/error/denied states, virtualized
  run lists and bounded logs follow DESIGN.md.
- [ ] Parser/planner, fake API, account/session race and hidden lifecycle tests
  pass; real app UI and available platform flows are exercised.
- [ ] Record remaining qualification limits, update docs/ADR and pass `pnpm run check`.

# Relevant files

- [Architecture](../../docs/ARCHITECTURE.md)
- [Screen guide](../../docs/architecture/frontend-feature-guide.md)
- [ADR 0022](../../docs/adr/0022-share-provider-accounts-and-scope-git-access.md)
- [Screen registry](../../src/app/screens.tsx)
- [Shared accounts](../../src/features/accounts/index.ts)
- [Mutation vocabulary](../../src-tauri/src/operation.rs)
- [Diagnostics](../../src-tauri/src/diagnostics.rs)

# Dependencies

Complete [148-4](../done/0.4.0/148-4-gitlab-accounts.md) and
[148-5](../done/0.4.0/148-5-provider-repository-browser.md). Execution follows
[148-6](148-6-pull-request-screen.md) in the agreed queue; reuse its resolved
remote/project account contract, but keep CI ownership separate.

# Execution handoff

Read AGENTS.md and the completed provider/PR contracts, verify current primary
API/permission docs, and implement only supported operations. Do not assume
GitHub Actions commands or statuses map directly to the other providers.

# Implementation notes

Pending implementation.

# Validation

Pending implementation.
