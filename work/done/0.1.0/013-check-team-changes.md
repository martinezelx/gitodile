---
id: 013
title: Check and explain team-sync status
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
  - sync
created: 2026-07-27
completed: 2026-08-14
---

# Goal

Give the active project an explicit **Check for team changes** action and a
durable, plain-language sync summary for the current branch. The check
may contact its configured upstream and update local remote-tracking metadata,
but it must not change the current branch, `HEAD`, index, or working files.

# User outcome

The user can tell whether their current branch is up to date, has saved
versions to publish, has newer team versions available, or has moved apart
from the team version. They can see when GitOdile last contacted the remote
and choose an implemented next action without interpreting `fetch`, upstreams,
or ahead/behind notation.

# Current context

Task 011 already delivered most of the native groundwork inside
`src-tauri/src/publish.rs`: remote discovery and selection, URL redaction,
network execution with timeout/cancellation, a fresh fetch preflight, and
ahead/behind/diverged classification. Working-tree status and the Branches screen also expose relation counts derived from locally known
remote-tracking refs.

This task must extract and harden that behavior as a provider-neutral `sync`
domain rather than implementing another parser or fetch path. Publish keeps
owning publish planning and execution; sync owns remote knowledge, freshness,
and the reusable relation contract.

The current frontend is feature-owned and session-scoped. New behavior belongs
under `src/features/sync/`, uses a typed port and feature-owned Tauri adapter,
and stores its live snapshot in the originating project runtime. Visual
components do not call `invoke`, and `main.tsx` remains composition-only.

# Scope

## Shared native sync domain

- Add `src-tauri/src/sync.rs` and move or extract from `publish.rs` the smallest
  reusable units for configured-remote discovery, upstream target resolution,
  privacy-safe display values, bounded network Git execution, selected-remote
  fetch, commit resolution, ancestry classification, and reliable errors.
- Keep publish-specific target selection, checkpoint publishing, plan copy,
  push execution, and uncertain push outcomes in `publish.rs`.
- Never assume `origin`, GitHub, a default branch name, or a single remote.
- Treat remote configuration and output as untrusted. Credentials, URL query
  strings/fragments, helper output, tokens, and private-key material must not
  cross IPC, enter logs, or appear in user-facing errors.
- Preserve HTTPS, SSH, SCP-like, file, local-path, non-ASCII, and malformed
  remote inputs without inventing or lossily rewriting an actionable ref.

## Local-known and fresh status commands

- Add a local-only `read_team_sync_status` command that compares the current
  branch with the remote-tracking ref already present locally. It never
  contacts a remote and returns cached/locally-known knowledge.
- Add an explicit `check_team_changes` command that:
  - revalidates repository and session identity;
  - requires a named branch with a configured, resolvable upstream;
  - fetches only the upstream's remote using the configured mapping;
  - uses system Git with separate arguments and configured credential helpers;
  - does not prune, force, merge, rebase, checkout, reset, update `HEAD`, touch
    the index/worktree, or add an implicit tag policy;
  - recomputes the relation from commit ancestry after the fetch;
  - reports a fresh check time only after fetch and classification succeed.
- A branch without an upstream is not silently compared with a same-named branch
  on an arbitrary remote. Return a setup-required state; publishing remains
  the flow that selects a destination and creates tracking.
- A fetch is a network read from the user's perspective but a local metadata
  mutation technically. Give it exclusive repository-write coordination by
  canonical `commonGitDir`, while classifying its consequence as a local
  metadata mutation rather than a remote mutation.
- Correct the same concurrency mismatch in publish planning: any command that
  performs a fetch must not run under a shared repository-read permit.

## Sync status contract

Return a typed `TeamSyncStatus` with at least:

- state: `noRemote`, `noUpstream`, `unborn`, `detached`, `upToDate`, `ahead`,
  `behind`, `diverged`, or `unknown`;
- local branch and commit when they exist;
- upstream remote, destination branch, tracking ref, and remote commit when
  they exist;
- ahead and behind counts;
- knowledge: `cached` or `fresh`;
- `checkedAt` only for a successful fresh network check;
- bounded structured warnings and implemented next-action identifiers;
- an opaque state token covering repository/session identity, branch, local
  commit, upstream target, and locally observed remote commit.

No remote snapshot is persisted as live truth in the project-session
`localStorage` record. After relaunch, GitOdile may reconstruct a cached
relation from local remote-tracking refs, but it must say **Not checked in this
session** until an explicit network check succeeds.

## Frontend ownership and lifecycle

- Add `src/features/sync/` with domain types/equality, controller, selectors,
  port, `tauriAdapter.ts`, public `index.ts`, translations, styles, UI, and
  tests.
- Keep one sync snapshot and request generation per project/session epoch.
  Closing and reopening the same path must not accept an older response.
- Coalesce equivalent checks for one epoch and let a newer explicit check
  supersede/cancel an older one where the execution policy supports it.
- Never check a remote because Overview became visible, a project was opened,
  the app launched, cache warming ran, or a watcher fired.
- Project activation or shared-ref invalidation may idle-refresh only the
  local-known snapshot. It may not contact the network.
- A repository invalidation marks a fresh result stale or replaces it with a
  locally-known relation without erasing the last truthful result while that
  read is pending.
- Successful publish and get-team-changes mutations invalidate or commit the
  matching sync snapshot before the shared follow-up refresh.
- Status, progress, errors, and announcements remain attached to the
  originating project while switching sessions.

## Overview interaction

- Add a compact **Team changes** section to Overview after the existing local
  changes/saved-versions card and before the History/Recovery placeholders.
  Do not add a Sync navigation destination or standalone screen.
- Distinguish remote knowledge from local working-tree status. The existing
  **Refresh** action for local files must not become a remote check.
- Show one plain-language result: not checked, up to date, versions waiting to
  publish, newer team versions, both sides changed, setup required, cached or
  stale result, or result unavailable.
- Keep the last truthful result visible while refreshing or after a failed
  refresh, paired with its age/knowledge and a non-color stale/error indicator.
- Offer only implemented contextual actions:
  - **Publish changes** through the existing flow when ahead;
  - **Review and get** as disabled/coming soon until task 014 when behind;
  - **Check again** after cached, stale, or failed knowledge;
  - no automatic repair action when diverged.
- Put exact remote, destination, tracking ref, commits, and counts behind
  progressive technical details. Render untrusted values as text, never HTML.
- Reuse the established opaque Friendly Card language, loading/error patterns,
  pointer conventions, and narrow-window behavior.

## Secondary consumers

- Branches keeps its locally-known per-branch relation pills. A successful
  check refreshes those facts through normal shared-ref invalidation; the
  screen does not gain a network action.
- History may later consume the shared publication/reachability vocabulary,
  but task 015 is not a prerequisite.

# Out of scope

- Moving the current branch or changing working files.
- Integrating, merging, rebasing, or resolving overlapping changes.
- Automatic/background/periodic network checks.
- Checking every open project or every remote as a batch.
- Selecting an arbitrary target for a branch with no upstream.
- Adding, editing, deleting, or pruning remotes/remote-tracking branches.
- Built-in provider login, clone, pull requests, or hosting-specific APIs.
- Persisting remote truth or credentials in frontend storage.
- A new Sync screen or navigation entry.

# Acceptance criteria

- [x] Publish planning and team checking share one native remote, fetch,
      redaction, and relation implementation.
- [x] Commands that fetch hold exclusive `commonGitDir` coordination; ordinary
      local status reads remain concurrent repository reads.
- [x] A manual check updates only remote knowledge/metadata and leaves the
      current branch, `HEAD`, index, and working files byte-for-byte unchanged.
- [x] Up-to-date, ahead, behind, diverged, no-remote, no-upstream, detached,
      unborn, unknown, cached, fresh, stale, loading, and error are explicit.
- [x] A successful fresh result includes a check time; relaunch never presents
      reconstructed cached knowledge as freshly checked.
- [x] No upstream or multiple remotes ever cause an implicit inbound target.
- [x] Credentials and sensitive URL/diagnostic components are redacted from
      serialized data, logs, UI, and errors.
- [x] Network/configuration failures preserve the last truthful result without
      marking it fresh.
- [x] Overview shows one project-scoped Team changes section and only enables
      implemented next actions.
- [x] Navigation, visibility, watcher events, startup, and cache warming never
      initiate a network request.
- [x] Spanish/English copy, keyboard, focus, screen reader, responsive layouts,
      light/dark themes, forced colors, and reduced motion are complete.

# Required tests and audit

## Rust unit tests

- Remote/upstream parsing and exact selection.
- URL/diagnostic redaction for supported and malformed URL forms.
- Up-to-date/ahead/behind/diverged ancestry classification.
- Cached/fresh mapping and state-token changes.
- Authentication, timeout, cancellation, missing-ref, invalid-config, and
  generic remote failure classification without secret leakage.
- Execution-policy inventory proves every fetch owns a repository-write permit.

## Rust integration tests

Use local bare remotes and separate clones/worktrees for:

- no remote/upstream, detached, and unborn states;
- up-to-date, ahead, behind, diverged, removed, and rewritten histories;
- multiple remotes without implicit inbound selection;
- unreachable remote, timeout/cancellation, and malformed configuration;
- unchanged worktree/index/local `HEAD` and only intended tracking refs updated;
- linked worktrees cannot overlap a fetch with another shared mutation.

## Frontend and desktop audit

- Never-checked, cached, fresh, stale, loading-with-result, first-load error,
  refresh error, and recovery-from-error transitions.
- Switching/closing/reopening during a check ignores stale epochs.
- Startup, navigation, watchers, and idle warming produce zero network calls.
- Long/duplicate/non-ASCII remote and ref names remain readable in details.
- Offline retry, cancellation, credential failure, and relaunch with only
  locally-known refs.
- Light/dark, approximately 1024px and large windows, keyboard, screen reader,
  forced colors, and reduced motion.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/frontend-feature-guide.md`
- `docs/architecture/025-ipc-contract.json`
- `work/done/0.1.0/011-publish-changes.md`
- `work/done/0.1.0/012-open-and-switch-projects.md`
- `work/active/014-get-team-changes-safely.md`
- `src/features/sync/` (new)
- `src/features/overview/OverviewPanel.tsx`
- `src/features/publish/`
- `src/features/repository/readCoordinator.ts`
- `src/projectRuntime.ts`
- `src/projectSessions.ts`
- `src/main.tsx`
- `src/i18n.tsx`
- `src/styles.css`
- `src-tauri/src/sync.rs` (new)
- `src-tauri/src/publish.rs`
- `src-tauri/src/application.rs`
- `src-tauri/src/ipc.rs`
- `src-tauri/src/error.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/tests/`

# Dependencies

- Task 011's delivered publish behavior, which supplies the core to extract
  without changing publish semantics.
- Task 012's delivered session isolation and project operation state.
- The delivered execution-policy and `commonGitDir` access coordinator.
- No dependency on task 014 or task 015 for the read/check experience.

# Decisions

- Keep tasks 013 and 014 separate because checking remote knowledge and moving
  local history have different safety/recovery boundaries.
- Implement both in one shared `sync` product domain and frontend feature.
- Remote checks are explicit and project-scoped, never automatic.
- No-upstream means setup required; sync does not guess an inbound target.
- Freshness is session truth. Relaunch reconstructs only cached local knowledge.
- Overview owns primary placement; Branches remains a secondary cached
  view and no standalone Sync screen is added.
- Divergence is explained and blocked from automatic resolution.

# Implementation notes

- `sync.rs` now owns remote discovery, display redaction, configured-upstream
  resolution, exact refspec mapping, bounded network execution, fetch, commit
  resolution, and ancestry classification. `publish.rs` reuses those units and
  retains only publish target choice, planning, push, and outcome handling.
- An explicit check runs `git fetch --no-prune --no-prune-tags <remote>
  <configured-refspec>` with separate arguments. It updates only the configured
  upstream tracking ref; it does not request tags implicitly and never guesses
  a target when upstream configuration is missing or ambiguous.
- `check_team_changes` and fetch-performing `plan_publish` use the existing
  repository-write policy, whose coordinator keys on canonical
  `commonGitDir`. Local `read_team_sync_status` remains a concurrent read.
  Network execution keeps the shared bounded runner's timeout, cancellation,
  credential-helper, locale, and redacted-diagnostic behavior.
- `TeamSyncStatus.stateToken` covers canonical repository identity, session
  epoch, branch, local commit, resolved upstream target, and observed remote
  commit. `checkedAt` is created only after fetch and relation classification
  both succeed.
- `src/features/sync/` owns the typed port/Tauri adapter, controller, state,
  translations, styles, and Overview section. Per-epoch generations coalesce
  equivalent work and reject stale responses after close/reopen or switching.
  Cache warming, activation, and shared-ref invalidation call only the local
  read command.
- Project session persistence was intentionally unchanged: only runtime state
  holds sync freshness and the successful check time. Failures retain the last
  truthful snapshot and mark it stale; publish completion supersedes the sync
  generation before the normal shared local refresh.
- Remote URLs and diagnostics are bounded and redacted before crossing IPC.
  Technical values are rendered through React text nodes. The UI consumes the
  native `nextActions` policy; `Review and get` is visible but disabled and no
  task 014 integration behavior is present.

# Validation

- `pnpm exec vitest run src/features/sync`: 11/11 tests passed, covering
  local-only warming, coalescing, epochs, stale/error recovery, actions,
  untrusted text, and the disabled task-014 affordance.
- `cargo test --manifest-path src-tauri/Cargo.toml sync -- --nocapture`: 13/13
  tests passed. Hermetic bare remotes/clones cover all relations, exact tracking
  updates, removed/rewritten refs, invalid configuration, secret-safe errors,
  and byte-preserved `HEAD`, index, and working files.
- The application policy inventory and repository-access tests demonstrate
  repository-write exclusion by shared `commonGitDir`, including linked
  worktrees; Git runner tests cover bounded timeout/cancellation and diagnostic
  redaction.
- `UI` detector reported no craft-floor violations. Its independent
  finish review passed thesis, visual world, hierarchy, semantics, and the
  disabled future action; the one action-policy finding was corrected by
  deriving buttons from `TeamSyncStatus.nextActions` and covered by a test.
- Windows Tauri desktop QA at 1182x762 verified the real Overview hierarchy,
  dark-theme card, explicit check transition, cached/no-upstream result,
  expandable technical details, native controls, headings, labelled region,
  status announcement, and no overflow. CSS/tests cover the 1100/800px
  breakpoints, light/dark tokens, forced colors, and reduced motion.
- Manual native QA remains unperformed on macOS and Linux, and no persistent
  screenshots were captured for the approximately-1024px, light-theme, or
  forced-colors variants. These are release-audit gaps, not unimplemented task
  behavior; platform-neutral Git arguments, path handling, semantic markup,
  tokenized themes, and responsive media queries are covered by the aggregate
  checks.
- `pnpm run check`: passed on 2026-08-14. The aggregate gate reported 88
  Markdown files/57 task ids, 236 frontend modules, 37 frontend test files with
  292/292 tests, a successful production build, Rust formatting, Clippy with
  warnings denied, and 224/224 Rust tests.
