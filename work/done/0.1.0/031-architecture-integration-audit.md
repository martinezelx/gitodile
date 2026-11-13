---
id: 031
title: Audit the modular architecture and unlock the History blueprint
status: done
priority: high
type: chore
areas:
  - architecture
  - frontend
  - rust
  - performance
  - security
  - platform
created: 2026-08-01
completed: 2026-08-10
parent: "022"
---

# Goal

Perform the independent integration audit for epic 022's core architecture,
close migration compatibility gaps, document the resulting structure and prove
that History can be implemented without reopening composition roots.

# User outcome

The refactor finishes with measured confidence rather than file-size claims,
and the next screen can be built from a trustworthy blueprint.

# Scope

- Verify every epic invariant and tasks 023–030 against the final code
  rather than their implementation notes alone.
- Compare dependency graph, file ownership, command contracts, tests, chunks,
  startup ordering, warmed switch p50/p95, memory, DOM bounds and process counts
  with task 023 baselines/budgets.
- Audit all Tauri commands for classification, repository-access mode,
  async/execution policy, caps, cancellation, prompts and redaction.
- Audit close/reopen, linked worktrees, shared-ref invalidation, watcher bursts,
  mutation/read races and remote uncertainty end to end.
- Validate Windows desktop behavior and run available macOS/Linux CI checks;
  document untested WebKit/WKWebView/WebKitGTK risks with owners and follow-ups.
- Confirm Tauri capabilities and CSP remain minimal and no generic command,
  filesystem or event surface was introduced.
- Update `AGENTS.md`, `docs/ARCHITECTURE.md`, ADR consequences and the new-screen
  implementation guide with the final tree and rules.
- Create a minimal throwaway History-shaped test module proving a greenfield
  screen can register, preload, subscribe, invalidate and evict without adding
  workflow logic to `main.tsx` or Rust `lib.rs`; do not implement task 015
  behavior. One declarative entry in a neutral screen/command registry is
  expected and must not be replaced by macros, IoC or dynamic registration
  solely to achieve a literal zero-file-edit claim.
- Remove the test module after the architectural proof unless the ADR chooses a
  permanent fixture.

# Out of scope

- Implementing the History timeline.
- Accepting unexplained regressions because the files are smaller.
- Expanding Tauri permissions for test convenience.

# Acceptance criteria

- [x] No production dependency cycles or forbidden imports remain.
- [~] `main.tsx` and Rust `lib.rs` are thin composition roots by the ADR's
      measurable definition. **Partially met and recorded as such.** The ADR
      never defined a measurable threshold; see "Composition roots" below.
- [x] Command/IPC/error compatibility and execution-policy inventories pass.
- [x] Session epoch, linked-worktree fan-out, hidden lifecycle and direct-IPC
      mutation tests pass end to end.
- [x] All numeric budgets pass or an explicitly approved ADR/task records the
      regression and mitigation. (Memory metric revised by ADR 0004.)
- [x] Windows desktop validation passes; macOS/Linux checks pass where
      available and remaining risks are concrete, owned and bounded.
- [x] Tauri capability/CSP audit finds no broadened authority.
- [x] Greenfield screen proof requires no composition-root workflow logic.
- [x] A new Rust feature needs at most declarative command registration; the
      proof introduces no registry framework or indirection with one consumer.
- [x] Durable documentation describes ownership, dependency direction,
      execution safety, request lifecycle and screen creation.
- [x] Full frontend and Rust validation from `AGENTS.md` passes.
- [x] Epic 022 is marked done and task 015 is unblocked only after tasks
      023–030 and this final audit are complete.

# Relevant files

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- ADR from task 023
- `work/active/architecture/022-modular-feature-architecture.md`
- outputs of tasks 024–030

# Dependencies

Tasks 023–030. This audit is deliberately last so it validates and closes the
complete epic in one task boundary.

# Decisions

- Epic completion requires independent end-to-end evidence.
- History is unlocked only after a greenfield contract proof, not merely after
  moving existing code.

# Implementation notes

## Two defects found before the audit could pass

**Every repository failed its first "check for changes".** Opening any project
showed the generic "Git couldn't inspect this project" error. The Changes
refresh issues `read_working_tree_status` and `list_unpublished_versions` in
parallel, and `list_unpublished_versions` re-reads status internally
(`status.rs:512`). That nested call re-entered `authorize_repository` under the
`read_working_tree_status` key, registered itself as a newer equivalent renderer
request, and cancelled the visible status read still in flight. Repository
permits are tracked per thread, so a held mode means genuine reentrancy inside
one command; the nested frame now inherits the parent's cancellation token
instead of superseding a peer. Fixed in `fix(repository-access)` with a test
pinning the nested case; the pre-existing cross-thread supersede test still
covers real competing reads.

**The file list was not virtualized.** With the mandatory 5,000-change fixture,
Rust caps the payload at 1,000 entries and React mounted all 1,000, against a
400-row failure budget. Fixed in `perf(changes)` by reusing the diff viewer's
existing virtualizer above 100 entries, so small projects keep their current
flow layout. Rows carry `aria-posinset`/`aria-setsize`, and the selected entry
is scrolled into view. Re-measured at 21 rendered rows.

## Composition roots

`lib.rs` met the decision: 762 production lines (builder, 31 command
registrations, Git process and platform adapters) plus 3,013 test lines, down
from 9,897. `architecture.rs` fails the build if a named domain function
reappears there.

`main.tsx` did not. It began the epic at 3,367 lines and no task in 023–030 was
assigned the Overview or Settings screens, so both survived. This audit
extracted Settings into `features/settings` behind a typed port, removing the
422-line panel and seven direct `invoke` calls that violated
`ARCHITECTURE.md`'s "visual components do not invoke Tauri". `main.tsx` is now
2,730 lines; its remaining `invoke` calls are watcher and session lifecycle
wiring, which ADR 0003's dependency matrix assigns to the composition root.

What remains is the Overview panel and `App`'s shell state. Overview declares
this in its descriptor as `container: { kind: "host-owned" }` and its reads
already belong to feature controllers, so the residue is composition rather
than product logic — but the file is not composition-only and the docs now say
so instead of claiming otherwise. The criterion is marked partially met.

The criterion was also unfalsifiable as written: it cited "the ADR's measurable
definition", and no such definition exists. The ADR says "composition only"; the
epic says "thin". The testable property is the greenfield proof below, and it
passes.

Settings keeps its translations in the app namespace and its rules in
`app-shell.css`. It is an application-level overlay whose responsive rules are
interleaved with the shell's; reordering 796 CSS rules inside an audit would
risk cascade changes for no boundary gain. Recorded as a bounded residual.

## Greenfield screen proof

Built a throwaway History-shaped feature end to end — registry entry, lazy
container, epoch-keyed controller, `useSyncExternalStore` subscription, watcher
invalidation, project eviction and a new Rust command through `ipc.rs`,
`EXECUTION_INVENTORY` and the checked IPC contract — verified it typechecks and
that the whole suite passes except the deliberately pinned command-count
snapshot, then removed it. No macro, IoC container or dynamic registration was
introduced.

Measured footprint outside the feature's own directory, with the full table in
[the frontend feature guide](../../../docs/architecture/frontend-feature-guide.md):
three declarative registration lines in `lib.rs`, three wiring points in
`main.tsx` (controller creation, read-coordinator argument, one `screens`
entry), one `SCREEN_MODULES` entry, one `ProjectView` union member, one palette
label in both locales, one execution policy, one IPC contract entry and the
pinned contract test. **Neither composition root gained workflow logic.**

One real gap: a screen that must refresh on watcher invalidation has to be added
to `createRepositoryReadCoordinator` as a positional parameter plus a hardcoded
`refresh`/`supersede` call, so the repository feature knows about every
dependent feature. It is compile-checked and does not block History, but the
next consumer should convert the fan-out to registered subscribers.

## Command, IPC and capability audit

All 31 registered commands have exactly one execution policy, asserted by
`every_registered_command_has_one_complete_policy`. Repository reads get a
60-second timeout, repository writes 120 seconds, both with a 16 MiB stdout and
256 KiB stderr cap and `KillProcess` cancellation. Only the five repository
mutations carry `PromptPolicy::PreserveGitBehavior`; every other command
disables prompts. Diagnostics pass through `redact_diagnostic`, covered by
`diagnostics_redact_credentials_queries_and_malformed_bytes`.

Session epochs: all 11 planners and mutations take a mandatory `sessionEpoch`
validated by `validate_mutation_session`; 12 repository reads take an optional
one; the 8 without an epoch (`app_status`, `show_main_window`, and the six Git
tooling commands) are global and touch no repository.

Tauri capabilities remain minimal — `core:default`, four window verbs,
`dialog:allow-open`, `opener:allow-open-url`, `os:allow-locale`. No filesystem,
shell or generic event permission was added. The CSP keeps `default-src 'self'`
with `connect-src` limited to the IPC origins, and declares no `unsafe-inline`
or `unsafe-eval`.

## Lifecycle, worktree and watcher coverage

`close_and_reopen_creates_a_new_epoch_and_rejects_the_old_one` and
`refresh_with_the_current_epoch_preserves_the_incarnation` cover session
identity. `related_worktrees_share_a_write_lock` covers the commonGitDir
coordinator, `shared_changes_fan_out_once_and_sequences_are_monotonic` and
`replacement_and_late_callbacks_cannot_reach_the_new_session` cover watcher
fan-out and late callbacks, `burst_ceiling_prevents_starvation` covers bursts,
and `unavailable_watcher_keeps_manual_refresh_available` covers degradation.
Hidden-screen lifecycle is covered in `screenModule.test.tsx`.

## Cross-platform position

Windows 11 desktop validation passes against the release build. CI runs the Rust
job on ubuntu, windows and macos runners; the frontend job runs on ubuntu only.

**No macOS or Linux desktop run exists.** WKWebView and WebKitGTK are untested
for: the new file-list virtualization, keep-alive `hidden`/`inert` semantics,
and all memory numbers, which ADR 0004 explicitly scopes to Windows. Owner: the
repository maintainer. Bound: measure both before any cross-platform performance
or memory claim, and before the first packaged release for those platforms. This
is a real gap, not a formality — it is recorded rather than closed.

## A wrong number in the task-023 baseline

Per-command process counting found `read_working_tree_diffs` starting 4 Git
processes against a budget of "2 with tracked changes, failure > 3". It is not a
regression. `read_working_tree_diffs` runs the porcelain status, then
`diff_base_rev`'s `rev-parse --verify -q HEAD`, then `batch_tracked_diffs`'
two passes (`diff --name-only -z` for the ordered path list, then the patch text
from identical flags). Reading the same function at baseline commit `159d25f`
shows all four calls already present, so the budget would have failed against
the commit it was written from. The baseline document counted two conceptual
operations and called them two processes.

The row is corrected to 4 with warning > 4 and failure > 5, and the narrative
now explains the miscount rather than silently editing the number.

## Results

Full validation on the final tree: typecheck clean, `check:architecture` passes
including its seeded forbidden-edge self-test, 241 frontend tests across 28
files, 196 Rust tests, `cargo fmt --check` and `clippy -D warnings` clean.

Chunks stay inside task-023 budgets, from `pnpm run build`: entry 375.59 kB raw
/ 107.94 kB gzip (warning at 378 kB raw), Changes 60.84 kB (warning at 69 kB),
branches 31.23 kB combined (warning at 36 kB), `fileIcons` 255.22 kB and
still deferred with no static entry path. The entry chunk sits 2.4 kB under its
warning threshold; making the Settings panel lazy is the obvious next headroom
and was left out of this audit because the overlay's focus trap interacts with
mount timing.

Desktop measurements and their verdicts are recorded in
[the task-023 baseline](../../../docs/architecture/023-performance-baseline.md),
reproducible with the probes in [`scripts/`](../../../scripts/README-031-probes.md).
Every budget passes, one against a corrected number and one against a revised
metric, both explained there and below. The memory metric was revised by
[ADR 0004](../../../docs/adr/0004-measure-desktop-memory-as-private-bytes.md):
summed working set double-counts pages shared across a seven-process WebView2
tree, so an Overview-only session already read 405.1 MiB while keep-alive for
all three screens added 10.5 MiB. Private bytes — 221.8 MiB against a 400 MiB
failure threshold — measures GitOdile's own allocations and still reacts to the
retention regression the budget was written to catch.

## Follow-ups this audit deliberately did not do

All of these, plus four further residues found in a later pass over the child
task files and the code, are scheduled as
[epic 038](038-close-out-the-architecture-migration.md).

1. Give Overview its own screen container so `main.tsx` becomes
   composition-only. → task 040
2. Convert the read coordinator's invalidation fan-out to registered
   subscribers. → task 042
3. Move Settings CSS and translations to the feature once the shell's
   responsive block is untangled. → task 046
4. Measure macOS and Linux desktop behavior and memory. → task 045
5. Make the Settings panel lazy to reclaim entry-chunk headroom. → task 046

Found afterwards and also scheduled: the `compatibility_*` execution-policy
fallbacks that silently hand an unregistered Git call a read policy (task 039,
the highest-risk item on the list), `shared/ui` holding only a stylesheet while
five primitives past ADR 0003's two-consumer bar sit at the repository root
(task 041), architecture documents still showing a `platform/tauri` directory
that was never built and an `application.rs` header describing the finished
strangler migration as ongoing (task 043), and a test-only module living where
the architecture guard classifies it as production (task 044).

# Validation

Run the complete command set from `AGENTS.md`, the task-021 warmed desktop
stress protocol, security/capability review and available platform CI.
