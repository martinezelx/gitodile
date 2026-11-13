# GitOdile backlog

This file is an inbox for ideas that are not approved for implementation. The
dependency-ordered `1.0.0` scope lives in [`docs/ROADMAP.md`](../docs/ROADMAP.md)
and the version folders under [`work/`](README.md). Approved post-`1.0.0`
tasks wait in [`after-1.0/`](after-1.0/README.md). Promote one idea into a
scoped task before coding it.

## Likely after `1.0.0`

### Changes and saved versions

- Select individual hunks or lines for save/discard while preserving the real
  index and providing recovery for discarded content.
- Compare two saved versions or two branches.
- Restore one file from a saved version without moving the active branch.
- Create a branch from an earlier saved version.
- Add file history and blame only if they can be presented without crowding the
  default History experience.

### Branches and parallel work

- Rename a local branch with remote/upstream consequences explained.
- Add linked-worktree creation, switching, renaming, and deletion as a deliberate
  parallel-work model; do not conflate worktrees with ordinary branches.
- Evaluate tags/releases against a validated release-management user outcome.

### Advanced history operations

- Amend the latest saved version.
- Cherry-pick one or more saved versions.
- Rebase a branch, including continue/skip/abort and conflict variants.
- Squash or reorder unpublished saved versions.
- Design an exceptional force-publish workflow with remote protection checks,
  explicit teammate impact, lease semantics, and durable recovery evidence.

These actions rewrite or synthesize history and need separate plans; they are
not implied by the `1.0.0` merge and restore workflows.

### Hosting and collaboration

- Provider-neutral account/authentication contracts beyond system Git helpers.
- GitHub authentication, repository browsing, hosted-repository creation, forks,
  pull requests, checks, issues, and branch-protection/ruleset details.
- Additional hosting-provider integrations selected by user demand.
- Pull-request review only after local diff/history/conflict workflows are
  mature; do not turn the first release into a hosting dashboard.

### Desktop integrations

- Configure and open a default external editor, file manager, and terminal with
  platform-specific argument validation.
- Drag-and-drop opening of one or multiple local projects.
- OS-native recent-project and file-association integrations.
- Show the real publisher in Windows "Installed apps" instead of `gitodile`.
  `bundle.publisher` must not change: NSIS keys the install directory under
  `HKCU\Software\<publisher>\GitOdile` and the updater reads it to run the
  previous uninstaller, so renaming it breaks updates of every existing
  install (see "Icons" in `docs/ARCHITECTURE.md`). Preferred fix: overwrite
  the `Publisher` value of the uninstall key from `NSIS_HOOK_POSTINSTALL` in
  `src-tauri/windows/installer-hooks.nsh`, which runs after Tauri writes it and
  leaves `MANUFACTURER` untouched.

### Settings

- Answer the global half of `get_line_endings` without taking a repository read
  permit. The command is declared `read(...)`, so opening Settings while a save,
  publish or sync holds the write permit makes it wait for that write to finish
  — the one worst case task 069 did not remove. The global value is true
  regardless of what the repository is doing, so it could be answered
  immediately and the project's override filled in once the permit frees.
  Deferred because changing the concurrency policy of a repository read is worth
  more care than the case is worth.

### Design system

- Finish the control-size scale on the four controls task
  [106](done/0.2.2/106-control-size-scale.md) left off. `.pending-versions__publish-button`
  (34px), `.overview-history__all` (36px) and `.branches-filter__clear`
  (36px) still carry heights of their own, and `.segmented-control__option`
  derives ~34.6px from padding rather than declaring a tier — its only height is
  the `pointer: coarse` one, so a mouse user gets whatever the padding adds up
  to. None is a bug: they are bespoke inline controls that read fine, which is
  why 106 left them. They are the reason `DESIGN.md` § Size can say "one house
  size" while four controls quietly disagree, and the button guard cannot see
  any of them because none is a `.primary-button` or `.secondary-button`.
- Promote `.changes-danger-button` to a shared danger variant of the button
  primitive. It reads the size tokens correctly today, but as a bespoke class the
  guard cannot hold it there — a markup change task 106 did not need.
- Give the status bar's project mark a "set up" state (an empty ring in the
  warning tone) when the active project cannot save because it has no
  effective Git name or email. Task 189 designed it and left it out: the strip
  only reads the global identity, and a project can set its own, so it needs
  the project's effective identity, read on activation like the rest.

## Product and quality research

- Explain repository health in plain language with actionable, bounded checks.
- Detect changes caused only by line-ending normalization.
- Persist the diagnostic record across sessions. Task 110 promoted the
  in-memory half of this idea and deliberately left out a rotating log file,
  retention policy and opt-out switch. They become necessary the day a crash
  that kills the process before the user can report it actually shows up.
- Continue large-repository benchmarks beyond the `1.0.0` gate, including:
  - thousands of changes through status, IPC, virtualization, diffs, selection,
    save planning, watcher invalidation, and cancellation;
  - `reaching_refs_by_commit` memory/CPU with many branches and commits;
  - temporary-index cost when planning a new branch in a large worktree.
- Measure automatic remote checks across slow/offline remotes and long-running
  multi-project sessions. Visibility alone must never trigger network work.
- Extend accessibility audits to additional assistive technologies and desktop
  environments after the release matrix is established.

- Open the system terminal at the project folder from the console (proposed
  with task 149, 2026-10-06): an escape hatch for everything the console
  deliberately refuses. Needs a per-platform launcher decision (Windows
  Terminal or PowerShell, macOS Terminal, the Linux desktop's terminal) and
  must never pass a shell string built from the path.

## Later hypotheses

- Optional local commit-message suggestions.
- Optional AI explanations, conflict assistance, and repository health guidance
  with explicit consent and exact transmitted-data disclosure.
- Team safety policies and educational modes.
- Extension/plugin model after stable internal contracts and real third-party
  use cases exist.
- Optional collaboration or paid features that never weaken the account-free
  local Git workflow.

## Explicitly not an automatic priority

- Matching every GitHub Desktop, GitKraken, Fork, Tower, or GitButler command.
- A decorative full commit graph before a user problem requires topology.
- Mandatory accounts, autonomous repository mutations, silent conflict
  resolution, automatic stashing, or cloud storage of local repository data.
