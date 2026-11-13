---
id: 065-4-3
title: Bring in changes from another branch on screen
status: done
priority: high
type: feature
areas:
  - branches
  - sync
  - frontend
created: 2026-10-29
completed: 2026-10-30
parent: "065-4"
queue:
---

# Goal

A medium **Bring in changes** dialog, modelled on Get project changes, that
previews and runs the plan of [065-4-1](065-4-1-bring-in-changes-core.md) and
hands overlaps to [065-4-2](065-4-2-pause-on-overlaps.md) and the
overlapping-changes screen.

# Scope

- Entries: the Branches row menu, the branch detail's actions and the quick
  switch rows that bring a branch into the current one (today marked `Soon`),
  and a palette command with a branch picker.
- A remote branch is checked in the background when the dialog opens and the
  last check is older than a minute, then re-planned in place.
- States: contained, fast-forward, merge, empty merge, overlap with Resolve in
  GitOdile, each blocker with its guidance, stale re-plan, uncertain with only
  Close; English and Spanish; light and dark.

# Out of scope

- Rebase, compare and merging into another branch stay `Soon`.

# Acceptance criteria

- [x] Every state is reachable and tested at the component level.
- [x] A paused merge opens the overlapping-changes screen.
- [x] Checked running beside Get project changes in both themes, with the
      keyboard, and `pnpm run check` passes.

# Dependencies

[065-4-1](065-4-1-bring-in-changes-core.md), [065-4-2](065-4-2-pause-on-overlaps.md).

# Implementation notes

- The visual reference is GetTeamChangesDialog and DESIGN.md § Before designing
  a screen, dialog or panel and § Dialogs. The overlay stays eager and medium,
  using Dialog, DialogFacts, DialogBanner, SearchBox, loading primitives and
  existing tokens in both themes.
- Sync owns the typed BringIn port/adapter/controller and branch picker. App
  wires existing mutation coordination, refresh and conflict-session adoption;
  no visual component invokes Tauri and no screen or conflict editor is added.
- Entries: Branches context menu and detail, quick-switch action and palette
  picker. Bringing the active branch into another, rebase and compare stay Soon.
- The narrow local source inventory and selected-source remote check respect
  custom positive/negative refspecs. Checks are remembered per exact source and
  project incarnation for a minute. Failure blocks cached execution; local
  sources and both integration commands never fetch. Source/evidence lists
  stay virtualized; unreadable ref names are refused rather than renamed.
- Saved overlaps explicitly start a real pause and adopt its returned session
  before navigating to the existing resolver. Unsaved overlaps need saving or
  discarding first. An uncertain result has only Close, with retained evidence.
- Reference study: the GitButler
  [but-oplog owner](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/but-oplog/src/lib.rs)
  keeps recovery ownership explicit and separate from the effect. The reusable
  principle here is to keep initiation/recovery in the existing native owner
  and hand its verified session to the existing resolver; no source reused.
- Platform scope: Windows/WebView2 validated; system Git, argument arrays and
  exact refs retain the existing cross-platform backend boundaries. No macOS
  or Linux desktop execution is claimed.

# Validation

2026-10-30, Windows, system Git, temporary repositories and local bare remotes:

- Component tests exercise contained, fast-forward, merge, empty merge, saved
  and unsaved overlaps, each forecast blocker and planning blockers, stale
  review, both uncertain forms, remote check failure/refresh, and a virtualized
  3,000-source keyboard picker. Controller tests prove source/epoch freshness,
  concurrent deduplication, expiry and failed-check retry.
- Existing branch tests now exercise detail/context-menu/quick-switch preview
  callbacks without executing a Git command in a visual component.
- The real-Git remote-source test additionally proves a custom tracking ref,
  exact selected-branch check without moving the current upstream, and a
  negative refspec refusing that source. Its isolated Windows run took about
  18 s: the existing two-repository fixture, commits, local bare remote,
  merge/recovery and mapping/check assertions require real Git; its budget
  comment explains this. No timeout was increased.
- `pnpm run tauri dev` with WebView2 CDP on loopback port 9222: palette picker,
  detail, row menu and quick-switch entries; English and Spanish; light and
  dark; Tab/Enter/Escape and reduced motion. Compared beside Get project
  changes in both themes. Confirmed a clean merge with a durable bring-in
  recovery ref and no publication, then a real overlapping merge opening the
  existing resolver with main/overlap sides. Abandoned that fixture pause via
  the resolver; its files returned safely.
- Also checked the contained, fast-forward and empty-merge previews, a remote
  source whose FETCH_HEAD named the selected overlap branch, and a stale
  confirmation after an external unsaved edit: it re-planned, left HEAD alone
  and preserved the unsaved file. All fixtures were under the task's own
  temporary directory; no personal project was mutated.
- Live iteration hit the existing language-dictionary Fast Refresh limitation;
  a full reload restored the app before final checks. A Windows executable
  lock during overlapping dev/test builds was avoided by running focused Rust
  tests with --lib and stopping the dev app before the aggregate gate.
- Desktop evidence: [Bring in dark](../../assets/065-4-3/fast-forward-es-dark.png),
  [overlap light](../../assets/065-4-3/overlap-es-light.png),
  [contained dark](../../assets/065-4-3/contained-es-dark.png),
  [Get light](../../assets/065-4-3/get-light.png),
  [Get dark](../../assets/065-4-3/get-dark.png), and
  [resolver handoff](../../assets/065-4-3/resolver-light.png).
- Final `pnpm run check`: exit 0. Documentation and architecture, TypeScript,
  1,857 frontend tests in 162 files, production build, Rust formatting, Clippy
  with warnings denied, Rust library tests (693 passed, one explicit system
  credential-store qualification ignored), and example targets passed. Rust
  library tests took 115.83 s. The existing large-entry-chunk build warning
  remains; its warning threshold was not changed and the overlay stays eager.
- Earlier aggregate attempts caught a curly apostrophe in new copy and an IPC
  response type name qualified differently from the checked contract. Both
  were corrected; the focused IPC contract test passed before the final gate.
- The development process is stopped and the original app preferences restored.
  The initial implementation made no project commit, push, new work branch or
  worktree; the user then requested the pre-commit review below.
- After moving this task to done and updating the queue and links,
  `pnpm run check:docs` passed; `git diff --check` was clean.

# Pre-commit review

2026-10-30, requested by the user before committing:

- Fixed a late remote check starting another plan after its dialog unmounted.
  A closed project's pending check can no longer restore freshness or erase
  a newer request. Source cache keys also ignore object property order.
- Fixed ambiguous HEAD names when a tag shares the active branch's name:
  source inventory and Branches now compare the full symbolic ref, and clean
  integration verifies that full ref too. Git's `--short HEAD` returned
  `heads/main` for a branch actually named `main`, which could expose the
  active branch as a source, lose its active badge, or report a completed
  integration as uncertain. Extended the existing real-Git tests with that
  tag collision and an explicit completed-outcome assertion.
- Fixed keyboard focus leaving the dialog when choosing a source removed the
  focused search/row. The virtual list retains its roving tab stop during
  pointer scrolling; search supports Down/Enter, with Home/End across the
  list. Error footers now keep one primary action.
- Strengthened the component test to execute the fresh remote plan's token,
  not the cached token. Added late-close/controller regression cases and
  extended the large-list keyboard regression without raising timeouts.
- Focused checks: 35 frontend tests passed; the two affected Rust integration
  tests passed alone (about 10 s for the existing remote fixture and under a
  second for branch discovery). Their existing fixture budget explanation
  still applies.
- Rechecked Tauri through WebView2 CDP using an isolated development identifier
  and WebView profile, temporary repositories only. More than 600 source
  branches rendered about 12 rows. Pointer scroll, Down, Home, End, Enter,
  modal focus retention and both themes passed. Evidence:
  [dark](../../assets/065-4-3/review-keyboard.png) and
  [light](../../assets/065-4-3/review-keyboard-light.png).
- Review completion gate: `pnpm run check` exit 0. Documentation, architecture,
  TypeScript, 1,859 frontend tests in 162 files, production build, Rust format,
  Clippy with warnings denied and Rust library tests (693 passed, one explicit
  credential-store qualification ignored) plus example targets passed. Rust
  library tests took 122.18 s. The user authorized the commit after review;
  no push is part of this task.
