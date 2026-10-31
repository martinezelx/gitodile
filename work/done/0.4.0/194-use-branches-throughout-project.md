---
id: 194
title: Use branches and ramas consistently across GitOdile
status: done
priority: normal
type: refactor
areas:
  - frontend
  - rust
  - i18n
  - documentation
created: 2026-10-21
completed: 2026-10-22
parent:
---

# Goal

Use branch/branches in English and rama/ramas in Spanish throughout the
application, implementation, stored identifiers and repository material.
Git behavior and recovery safety remain unchanged, apart from the small
pre-existing cancellation defect found during review.

# Approved scope

The user approved implementation, explicitly accepted breaking recovery
compatibility, and requested a thorough review before committing. The follow-up
also removes preference compatibility: there are no users to migrate. Normalize
historical documentation, completed tasks, release notes and prototypes too.

Actual repository ref names, user input, Git output, text/diff lines, command
lines, line endings, software-version rows and graph strokes retain their
meaning. This is not authorization to rename or delete real repository branches.

# Implementation

- Frontend owner: `src/features/branches/`; native owner: `branches.rs`.
  Components, classes, types, hooks, controllers, ports, fields, CSS selectors,
  DOM identifiers and all 12 branch IPC commands use canonical terminology.
- Navigation and runtime use `branches`. History uses `currentBranch`, `branch`,
  `allBranches`, `branchesTruncated`, and a branch-named snapshot tag.
- Preferences read current keys only: `gitodile-favourite-branches` and
  `gitodile-branch-folds`. Navigation validates current IDs without old-destination
  rewrites. Removed historical default-order matching and console alias/old-format
  compatibility. Invalid storage remains safe; current custom choices persist.
- Delete recovery uses `delete-branch`; batch clean-up uses `clean-up-branches`.
  No compatibility reader or migration is retained. Existing unused data remains
  untouched. Verification, retention, pending reconciliation and worktree
  ownership remain in force; team-update recovery is unchanged.
- English/Spanish UI and accessibility copy, native fallback prose, History,
  sync, publish, save, console and notifications use branches/ramas consistently.
- Historical ADRs/tasks, release material, measured baselines and HTML prototypes
  use the same vocabulary. Related filenames and links are normalized while IDs,
  dates, commit hashes and measured numbers remain intact.
- The rendered English rail label measured 44.16 px inside the existing 48 px
  content slot (64 px rail). No layout or typography adjustment was needed.

The durable compatibility and vocabulary policy is
[ADR 0035](../../../docs/adr/0035-use-branches-as-the-product-vocabulary.md).

# Review findings and corrections

- Completed leftover History helper/warning names and the console branch-context
  CSS selector. Native serialization and frontend warning rendering are tested.
- Kept genuine text-line and software-version descriptions intact, including
  the software-version display row. Completed branch references in internal
  comments, CSS comments and prototype labels without changing graph strokes.
- The first review covered a navigation migration bug; the user's later scope
  removes that migration entirely. Current-format validation and persistence
  tests replace compatibility tests.
- A pre-existing Windows cancellation race let already-cancelled cloning start
  Git and leave a helper holding pipes. The bounded runner now refuses to spawn
  when its policy permits cancellation and the token is already cancelled.
  Non-cancellable policies retain their behavior. A regression verifies both
  cases; the existing clone cancellation test then completed in 0.29 s.
- For that runner defect, inspected GitButler's
  [small executor](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/gitbutler-git/src/executor/tokio/mod.rs).
  Its explicit process-lifetime handling informed the ownership principle;
  GitOdile retains its existing synchronous runner with an independent early
  guard, no copied implementation or new dependency.

No real branch creation, switch, rename, deletion or publication was performed
on the user's repository. The user explicitly approved the commit after
implementation, review and closure. No push was requested.

# Validation

Earlier implementation/review gate on Windows, 2026-10-21: passed with
`VITEST_MAX_WORKERS=2`: 148 frontend files / 1,594 tests, production build,
Rust formatting and Clippy, 623 native tests passed with one credential-store
qualification test ignored, and the real-Git credential-helper integration
passed. This predates the preference/history-material follow-up.

Final follow-up validation on Windows, 2026-10-22:

- `pnpm run check`: exit 0 with `VITEST_MAX_WORKERS=2`. Documentation,
  release/update/icon contracts, frontend architecture, TypeScript, all 148
  frontend test files / 1,588 tests, production build, Rust formatting and
  Clippy passed. Native tests: 623 passed, one credential-store qualification
  test ignored; the real-Git credential-helper integration also passed.
- Focused current-preference/navigation/console tests: 4 files, 46 tests passed.
- All 21 inline prototype scripts parsed successfully. Residual vocabulary
  audit, documentation links/IDs/queues and `git diff --check` passed.
- The first follow-up run exposed three remaining navigation-migration tests;
  these obsolete expectations were removed. Another run reached Rust but Windows
  refused to replace the executable while the development app was open. The app
  was stopped and the full aggregate gate then passed without code changes.
  The development application is reopened after validation.
- Completed the remaining internal sync variable/test-helper names and the
  History badge's branch modifier, plus branch-related test descriptions and
  comments. Genuine text-line comments remain unchanged in meaning.

Use an execution-only Vitest worker bound to avoid Windows CPU saturation;
assertions, timeouts and repository test settings remain unchanged.

Desktop coverage from the implementation review: native Windows Tauri app in
English/dark and Spanish/light, branch list, quick switch, clean-up preview
(cancelled), Settings navigation, named-branch and all-branches History scopes.
History reads left the active release branch in place. Original language/theme/
icons-only preferences were restored. Loading transitions, disabled create and
Escape dismissal were observed; browser frontend covered no-project states.
Compact/overflow and keyboard behavior also retain automated coverage. Not all
responsive/reduced-motion combinations were manually exercised; macOS/Linux
native targets were not executed. The preference follow-up changes no visual
flow, and its behavior is covered by current-format tests.

The production build retains its existing 500 kB eager-chunk advisory. No warning
threshold, chunk policy, dependency, release version or Git operation policy was
changed. No changes belong to `.github/` or `scripts/release/`.
