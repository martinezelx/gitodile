# Roadmap

This roadmap defines the capability sequence and release gates for GitOdile.
It is not a calendar promise. Approved implementation scope and acceptance
criteria live in one folder per planned version under [`work/`](../work/README.md):
[`0.5.0`](../work/0.5.0/README.md), [`0.5.1`](../work/0.5.1/README.md), [`0.6.0`](../work/0.6.0/README.md),
[`0.7.0`](../work/0.7.0/README.md), [`1.0.0`](../work/1.0.0/README.md) and
[`after-1.0`](../work/after-1.0/README.md).

## Release objective

The next product milestone is a trustworthy `1.0.0`, not feature-count parity
with every GitHub Desktop menu item. A `1.0.0` user must be able to complete the
ordinary lifecycle of a project without falling back to the terminal:

1. open an existing project, clone a remote project, or create a local project;
2. understand and inspect current changes;
3. save all or selected files as a version and review saved history;
4. create, switch, publish, integrate, and remove branches safely;
5. check for, get, and publish project changes, including a diverged history;
6. resolve overlaps without silent data loss;
7. set unfinished work aside and restore it later;
8. recover from the destructive/history-changing operations GitOdile performs;
9. install, update, and run a verified build on Windows, macOS, and Linux.

The local workflow remains provider-neutral and usable without an account.
Hosting accounts shipped ahead of `1.0.0` (epic 148) but are not part of its
contract. Pull requests, checks, forks, issues, worktrees, tags/releases, and
advanced history rewriting are not part of the `1.0.0` contract either.

`1.0.0` is the foundation for the agent-era direction in
[`PRODUCT_STRATEGY.md`](PRODUCT_STRATEGY.md#the-agent-era-direction); none of
that direction's features are added before it ships.

## Current baseline

Already delivered:

- open, validate, remember, restore, and switch local projects;
- clone remote projects and safely create a new local project or initialize an
  ordinary existing folder;
- inspect live working-tree state and bounded, readable file diffs;
- save all or selected files with hooks, signing, and index protection;
- discard files or all unsaved work with persistent recovery and Undo;
- discover remotes, check/fetch, fast-forward safely, and publish;
- list, create, switch, and safely delete local branches;
- browse bounded current-branch saved-version history and inspect typed commit
  diffs without changing the project;
- configure Git identity, line endings, themes, language, watching, and
  confirmations;
- connect GitHub, GitLab, Bitbucket Cloud, Azure Repos and company-server
  accounts, browse their repositories and scope project access to one account;
- enforce typed IPC, repository/session authorization, bounded Git execution,
  mutation planning, invalidation, and architecture checks.

The release-oriented audit of this baseline is complete. Task
[`065-1`](../work/done/0.1.0/065-1-core-workflow-audit.md) owns the capability matrix,
hermetic journeys, Windows desktop evidence, and remaining platform limits.

## GitHub Desktop reference cut

GitHub Desktop is a coverage reference for the basic workflow, not GitOdile's
product specification.

| User capability | Current state | `1.0.0` decision |
| --- | --- | --- |
| Add/open a local repository | Delivered | Audit and harden |
| Clone by remote URL or Git path | Delivered | Staged, verified, provider-neutral flow |
| Create/initialize a local repository | Delivered | Planned, revalidated, explicit local/remote effects |
| Inspect changes and file diffs | Delivered | Audit and harden |
| Commit all or selected files | Delivered | Required; partial-line commits deferred |
| Browse commit history and commit diffs | Delivered | Audit and harden |
| Create, switch, publish, and delete branches | Mostly delivered | Audit; publish uses the existing remote flow |
| Fetch, fast-forward pull, and push | Delivered | Audit and harden |
| Merge a local branch or diverged upstream | Implemented; Windows audited | Task 065-4 (`0.5.0`); non-Windows runtime/accessibility qualification remains open |
| Resolve merge conflicts | Delivered on Windows; macOS and Linux unverified | GitHub Desktop level: epic 037 (`0.5.0`), open for the macOS/Linux and assistive-technology runs; three-pane editor after `1.0.0` (epic 206) |
| Stash and restore unfinished work | Missing | Required: epic 064 (`0.6.0`) |
| Undo/revert earlier work safely | Partial recovery plumbing only | Required: tasks 065-5 and 065-6 (`0.6.0`) |
| Hosting-account sign-in | Delivered ahead of `1.0.0` | Not a gate; stays Free |
| Pull requests and checks | Missing | After `1.0.0`: tasks 148-6 and 148-7 (`1.3`) |
| Forks, issues | Missing | Deferred; provider-specific and not needed for the local core |
| Rebase, force push, amend, cherry-pick, squash, reorder | Missing | Deferred; history rewriting is not needed for the first safe workflow |

## Versions to `1.0.0`

The release epic is [`065`](../work/1.0.0/065-release-1.0.md). Each version
folder holds its tasks and a README with its goal and exit condition. Inside a
folder, `queue` is the ascending execution order and restarts at `01`; only
the earliest unfinished version is worked, one task at a time. Task IDs remain
permanent references and do not change when work moves between versions.

| Version | Theme | Tasks in queue order |
| --- | --- | --- |
| [`0.5.0`](../work/0.5.0/README.md) | Collaboration complete | 037-3, 037-6, 037-5, 037-7, 065-4, 227 |
| [`0.5.1`](../work/0.5.1/README.md) | Collaboration review | 213 |
| [`0.6.0`](../work/0.6.0/README.md) | Safety visible and reusable | 065-5, 065-6, 064-1 … 064-5; 139 once unblocked |
| [`0.7.0`](../work/0.7.0/README.md) | Release candidate | 065-7, 065-8, 065-9-13 |
| [`1.0.0`](../work/1.0.0/README.md) | Ship | Epic 065 acceptance |

### Public distribution — delivered

- **065-9: Signed application updates** is closed
  ([epic 065-9](../work/done/0.3.0/065-9-signed-application-updates.md), 2026-09-16):
  contracts, install protection, the native updater and its interface, signed
  builds, merge-driven releases, public publishing and the release-notes
  automation are on `main` and proven by public releases, all on one update
  channel (ADR 0019). The evidence, production approval and OS-signing work still open
  is [065-9-13](../work/0.7.0/065-9-13-updater-evidence-and-os-signing.md) in `0.7.0`.
- This enables public distribution before the rest of the 1.0.0 feature set.
  New operations and drafts must integrate with install protection as they land.
  Git credential diagnostics remain 065-7; final product qualification
  remains 065-8. Completing this epic does not establish 1.0.0 readiness.
  ADR 0011 defers Windows Authenticode and all macOS delivery until after
  `1.0.0`; the initial release matrix is Windows x86-64 plus Linux x86-64.

### Gate 0 — Prove the existing loop (completed 2026-08-21)

- **065-1: Core workflow audit.** Exercise open → inspect → save → check → get
   → publish → close/reopen against real temporary repositories. Fix only
   defects that violate the already-delivered contract and record a capability
   matrix.

Exit condition met: the current feature set has repeatable end-to-end journeys
and honest Windows desktop evidence. macOS/Linux runtime evidence remains task
065-8's release gate.

### Gate 1 — Complete project entry and understanding (completed)

- **065-2 (completed 2026-08-21): Clone a remote project safely.** URL/path validation, destination
   preview, progress/cancellation, partial-clone cleanup, credential errors,
   and automatic opening after verification.
- **065-3 (completed 2026-08-22): Create or initialize a local project.** New
   folder and existing non-repository flows, explicit README/first-save choices,
   exact cleanup ownership, and a separate provider-neutral remote preview.
- **015 (completed 2026-08-24): History timeline.** Bounded, snapshot-aware,
  read-only current-branch history and first-parent/root commit details using the
  established typed diff renderer, with a recent-history summary in Overview.

Exit condition: a first-time user can acquire or create a project, make and
save a change, and verify the result in History.

### Gate 2 — Complete collaboration and overlaps (`0.5.0`)

- **037 (implementation completed 2026-10-31): Resolve overlapping changes.** At GitHub Desktop level: understand
   each overlap, keep one side per file or edit it in the user's editor, mark
   it resolved or reset it, then finish or abort the merge with a plan, all on
   a durable snapshot. It first supports an externally started merge (a
   terminal, an editor, a coding agent) so its safety model can be proven
   independently, and its first slice decides how overlaps GitOdile detects
   itself become sessions. A paused rebase, cherry-pick, revert or stash apply
   left by another tool is detected and explained read-only, never resolved.
   The three-pane editor is epic 206 after `1.0.0` (decided 2026-10-27).
- **065-4 (implementation completed 2026-10-31): Integrate branches and diverged project changes.** Add previewed
   local/remote-branch merge and diverged upstream integration. All initiation,
   clean and paused outcomes are implemented and Windows-audited in
   [065-4-5](../work/done/0.5.0/065-4-5-integration-audit.md); overlaps use task 037's
   existing resolver. Accepted [ADR 0042](adr/0042-propose-platform-qualification-carryover-for-050.md)
   closes this implementation phase together with 037 and 037-6. The original
   unchecked external qualification remains with 065-8 (Linux) and 065-10
   (macOS), linked through the [carryover matrix](../work/assets/0.5.0-closure/closure-audit.md).

Implementation exit condition met: both the clean and conflicting collaboration
paths can finish without a terminal. Rebase and force push remain excluded.
The accepted qualification carryover does not authorize a release or start
Gate 3.

### Gate 3 — Make safety visible and reusable (`0.6.0`)

- **065-5: Recovery center.** Inventory supported recovery records, explain
   retention/eligibility, and perform only state-token-safe restores.
- **065-6: Restore a saved version.** From History, choose a reversible
   strategy: undo unpublished local work or create a new reverting version for
   shared work. Never hide history rewriting or use a destructive hard reset.
- **064: Set changes aside.** Deliver the five epic children in order;
  discovery/create come first, then restore and
   removal after the conflict and recovery contracts they consume are stable.
- **139: History and destructive console commands** become workable once the
   Recovery Center (065-5) exists; the task stays blocked until then.

Exit condition: destructive and history-changing product actions have a
discoverable recovery lifecycle, and unfinished work can be moved aside and
restored safely.

065-5 and 065-6 are also the foundation for the post-`1.0.0` safety net. They
add no agent feature, but their models must not have to be rewritten for it;
see [Design seeds in `1.0.0`](#design-seeds-in-100).

### Gate 4 — Release candidate (`0.7.0`)

- **065-7: Credential and remote diagnostics.** Verify system credential
    helper behavior for clone/fetch/publish, classify common provider-neutral
    failures, and give actionable remediation.
- **099 (completed 2026-09-01): Visual-system closure.** Audited every shipped screen, shell
    region, menu, popover, dialog, control family, and representative state
    against the settled radius and control-geometry system. Fix and guard all
    drift before the final platform matrix.
- **134 / 138 (completed): Project Git console.** A keyboard-driven,
   project-scoped screen for Git queries and typed Git commands classified in
   Rust into permission tiers
   ([ADR 0017](adr/0017-console-git-commands-by-permission-tier.md)); changes
   are previewed and, unless the person turns that off, confirmed
   ([ADR 0028](adr/0028-console-runs-changes-without-a-read-only-mode.md),
   [task 134](../work/done/0.3.0/134-project-git-console.md),
   [epic 138](../work/done/0.3.0/138-console-git-commands.md),
   [task 149](../work/done/0.4.0/149-single-console-mode.md)). History and
   destructive commands are
   [task 139](../work/0.6.0/139-console-history-and-destructive-commands.md).
- **065-8: Release hardening and distribution.** Run the complete workflow
    matrix, accessibility and large-repository audits; validate real WebView
    behavior on all supported platforms; produce signed/notarized packages;
    qualify updates and reinstall recovery, versioning, release notes, and
    support docs.
- **065-9-13: Updater evidence and OS signing.** Record the evidence the
    updater epic still owes and add OS-level signing.

Exit condition: all `1.0.0` acceptance criteria pass, there are no known
data-loss defects, and every advertised platform has evidence from the actual
artifact being shipped.

## Dependency map

```text
065-1 audit
  ├─> 065-2 clone ───────────────┐
  ├─> 065-3 create/connect ──────┤
  └─> 015 history ──> 065-6 restore saved version

037 conflict resolver ──> 065-4 branch/divergence integration
          │
          └──────────────> 064 stash restore

existing recovery records + 037 recovery contract
          └──────────────> 065-5 recovery center ──> 065-6
                                     └──────────> 139 console history commands

065-9 signed updates (complete) ──> 065-9-13 evidence and OS signing ──┐
all functional gates ──> 065-7 diagnostics ─────────────────────────────┤
099 visual closure (complete) ──────────────────────────────────────────┤
                                                                        └─> 065-8 release candidate
```

Task 064 discovery and create slices may be developed before task 037, but its
restore-conflict path cannot be complete until task 037 owns `stashApply`.
Task 065-8 is the only task allowed to make a release-readiness claim.

## Design seeds in `1.0.0`

The tasks below stay inside their `1.0.0` scope. They must only avoid
assumptions that the post-`1.0.0` safety net would have to undo:

- **065-5 Recovery center.** A recovery record must not assume GitOdile created
  it. The record model, inventory and restore path should accept a future
  record whose origin is a change made outside GitOdile.
- **065-6 Restore a saved version.** The restore planner should be able to take
  a contiguous range of saved versions, not only one, even if the `1.0.0`
  interface offers a single version.
- **Repository watcher.** Invalidation should be able to tell a change
  GitOdile made from one another tool made, so external activity can later be
  recorded without rewriting the watcher.

## After `1.0.0`

Post-`1.0.0` work follows the agent-era direction in
[`PRODUCT_STRATEGY.md`](PRODUCT_STRATEGY.md#the-agent-era-direction) and
[ADR 0039](adr/0039-position-gitodile-for-humans-and-their-agents.md). Approved
but unscheduled tasks wait in [`work/after-1.0/`](../work/after-1.0/README.md);
ideas stay in [`work/backlog.md`](../work/backlog.md) until promoted.

| Version | Theme | Scope |
| --- | --- | --- |
| `1.1` | Safety net | Automatic checkpoints, external-activity timeline, undo a whole session, warnings about dangerous operations made outside GitOdile |
| `1.2` | Understand | Human/agent attribution, sessions grouping bursts of work, agent badges in History |
| `1.3` | Publish with confidence | Pre-publish review with risk alerts, pull requests and checks (148-6, 148-7); candidate for the three-way conflict editor (epic 206) |
| `1.4` | Parallel work | Worktrees as work in progress, compare attempts, adopt one and clean up the rest |
| `2.x` | Work alongside agents | Local API or MCP for agents, optional consented AI summaries |

Each theme is scoped into tasks only when its version starts. Other candidates
from the backlog (partial-line saves, compare, advanced history actions,
repository health, macOS delivery in 065-10) are scheduled against the same
product test.
