---
id: 065-4-5
title: Audit the integration workflow end to end
status: done
priority: high
type: audit
areas:
  - sync
  - conflicts
  - platform
  - testing
created: 2026-10-29
completed: 2026-10-30
parent: "065-4"
queue:
---

# Goal

Verify epic [065-4](065-4-integrate-branches.md) in the running app on
temporary repositories: every outcome, entry and blocker, the hand-off to the
resolver, restart mid-merge, linked worktrees, hooks, signing, credentials and
a rejecting remote.

# Acceptance criteria

- [x] Every parent criterion is checked with linked evidence.
- [x] README, roadmap, release notes and docs match the delivered behavior.
- [x] `pnpm run check` passes.

# Dependencies

[065-4-1](065-4-1-bring-in-changes-core.md) through
[065-4-4](065-4-4-get-diverged-overlaps.md).

# Implementation notes

2026-10-30: audited on the existing `release/0.5.0` after `42ad19f`, without
creating product branches/worktrees or committing/pushing product changes.
The [criterion and scenario matrix](../../assets/065-4-5/integration-audit.md)
links native/frontend regressions, desktop screenshots, the isolation
protocol and residual platform/accessibility qualification.

Fixed five audit defects: post-native handoff/refresh offered retry; Get
missed shared unsupported-history/sparse guards; ambiguous short HEAD names
affected discovery/upstream selection; empty local identity failed to mask
an inherited identity; saved-overlap previews skipped local-work blockers.
Changes stay in the existing sync/repository/save preflight owners. No new
resolver, dependency, feature, visual token or Git strategy was added.

Assumptions: system Git remains authoritative; Get retains its token and
recovery operation; recovery precedes mutation; only an explicit action can
start/finish/abandon a merge or publish. Tests exceeding five seconds reuse
real-Git fixtures and carry budget comments; no timeout was increased.

The Windows audit does not close the epic's macOS/Linux, real screen reader
or inherited live forced-colour qualification. Those remain explicit in the
matrix and epic, consistent with ADR 0006 and task 037-7.

# Validation

See the matrix for desktop Tauri/WebView2 CDP journeys using only disposable
projects/remotes and an isolated application identifier, WebView profile,
Git configuration and hosting-CLI configuration. Both languages/themes,
keyboard/focus, loading/error, stale/uncertain results, restart, Finish/Stop,
linked worktrees, hook/identity/signing failures and a rejecting local remote
were exercised. Real credentials and macOS/Linux were not used.

Focused checks during the audit: 75 frontend sync/controller tests passed;
29 repository-related Rust tests passed; the existing blocking-state test,
remote-home ambiguity test and extended finish/identity test passed. The
finish/identity case took 10.34 s alone on Windows; its comment explains the
real merge/resolution/hook/signing/identity sequence. Regression failures
before fixes are documented in the matrix.
The extended unsafe-start/forecast case passed alone in 23.49 s during
development (real plans, recovery refusals and Git fixtures; no raised timeout).

`pnpm run check`: exit 0. Documentation/release/icon contracts, architecture,
TypeScript, 1,879 frontend tests in 162 files (49.12 s), production build,
Rust formatting, Clippy with warnings denied, 693 Rust library tests passed
(125.44 s), one explicit real-credential-store qualification ignored, two
credential helper integration tests passed, and example targets passed.
The existing entry-chunk warning remains; its threshold and eager overlays
are unchanged. The development process is stopped.

The task is done as an evidence-based Windows audit. Every parent criterion
is mapped, while the epic's full platform/accessibility criterion remains
open with named residual qualification; no non-Windows result is inferred.
No product commit, push, new branch/worktree or release preparation was made.
After moving the task and updating the epic, queue and links,
`pnpm run check:docs` passed again; `git diff --check` was clean.

# Pre-commit review

For the later epic-closure/accessibility follow-up after `73714cc`, see the
[0.5.0 closure matrix](../../assets/0.5.0-closure/closure-audit.md). It supplements
the historical qualification limits below without claiming a non-Windows run.

2026-10-30, requested by the user, who also authorized the commit:

- Extended the existing capped-forecast test: an unsaved overlap beyond 20
  saved overlaps disappeared from IPC, enabling Resolve in both dialogs until
  native refusal. Unsaved overlaps now precede saved ones in bounded evidence;
  counts and caps remain exact. The regression failed before the fix.
- Extended Get's existing uncertainty matrix: after native clean Get completed,
  a failed refresh could offer Review again, or replan if the later error was
  stale. It now preserves the actual recovery/unsaved refs and observed HEAD,
  offers only Close and never publishes. Bring also retains its returned
  unsaved-copy evidence on a failed post-native refresh. Both new Get cases
  failed before the fix, then passed.
- Extended the identity fixture with valueless local keys. The parser now
  uses NUL-separated Git config records and honors valueless overrides too;
  a missing value no longer revives a valid inherited identity. The direct
  identity regression failed first. Full merge planning may still report
  Git's own refusal when another Git read rejects such a malformed identity.
- Reproduced loss of an unsaved edit made by a successful pre-merge hook:
  execution wrote the older forecast over it and reported completion. Clean
  merge execution now revalidates tracked evidence, HEAD/branch/source refs,
  markers and untracked/ignored collisions after hooks/signing and before
  recovery or file/history updates. Extended the real Get hook fixture and
  Bring failure fixture (including a source ref moved by a hook); changed work
  stays intact and yields the workflow's stale-plan error. Unrelated untracked
  hook output remains allowed. The Get data-loss regression failed first.
- Focused regressions passed: 74 dialog tests; capped forecast (no Git, under
  1 ms); finish/identity (10.39 s), Get merge hooks (14.60 s), Bring failures
  (11.70 s). Existing budget comments explain their real-Git fixtures.
- No new resolver, UI style, dependency, Git strategy or timeout change.

Desktop revalidation used the same isolated Tauri/WebView2 CDP profile and
new temporary fixtures. Twenty-five saved overlaps plus an unsaved edit kept
Save-first guidance (26 exact overlaps, 20 in IPC, no Resolve). A real merge
hook changed the working file; Get refused stale before recovery/history,
keeping those bytes. A later explicit Get with the hook removed completed,
then an injected stale refresh error kept only Close, actual history/unsaved
refs and HEAD, with one plan/execution and no publication. Independent Git
checks proved the merge parents, remote unchanged, and the hook edit present
in both working content and the unsaved copy. The matrix links captures and
machine assertions. The harness was unmounted and development app stopped.

Final pre-commit `pnpm run check`: exit 0. Documentation, architecture,
TypeScript, 1,881 frontend tests in 162 files (58.52 s), production build,
Rust formatting and Clippy with warnings denied passed; 693 Rust library
tests passed, one explicit real-credential-store qualification remained
ignored, both credential helper integration tests and example targets passed.
The existing entry-chunk warning remains. No timeout was increased, no real
project/preferences/credentials were changed, and the user-authorized commit
contains this reviewed audit on `release/0.5.0`. No push or release preparation
is authorized or performed.
