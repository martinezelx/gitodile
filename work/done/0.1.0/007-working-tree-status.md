---
id: 007
title: Read and explain the working-tree status
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
created: 2026-07-25
completed: 2026-07-26
---

# Goal

Produce a typed, plain-language summary of what has changed in the opened
project's working tree, and surface it as the Overview's primary status.

# User outcome

After opening a project, a user can tell at a glance whether they have unsaved
work, how much of it there is, and whether anything needs attention — without
running `git status` or knowing what "staged" means.

# Context

Task 001 deliberately shipped an Overview that refuses to state a pending-change
count, because no typed working-tree result existed. Its primary card therefore
communicates readiness and offers "Open another project", with "Review changes"
rendered disabled. That is honest but thin: the strongest surface in the app
carries the least information.

This task provides the missing data. It is the highest-leverage Fase 1 item in
[`docs/ROADMAP.md`](../../../docs/ROADMAP.md) because it unblocks the Overview's
primary card, the Changes navigation entry, and — later — the save-version flow,
which cannot exist without knowing what would be saved.

`open_repository` in `src-tauri/src/lib.rs` established the patterns to reuse:
run `git` without a shell, canonicalize and validate paths in Rust, return a
typed `{ code, message, remediation }` error, and keep parsing out of React.
`docs/ARCHITECTURE.md` additionally requires machine-readable Git output with
parser fixtures, which `--porcelain=v2` provides and the human-readable
`git status` does not.

The plain-language mapping matters as much as the parsing. `DESIGN.md` asks for
outcome-shaped copy ("You have 3 files with unsaved changes"), and the product
hides the staging model behind the save-version flow rather than exposing an
index/working-tree split as the primary concept.

# Scope

- Add a Rust command that reads the working-tree status of an opened repository
  and returns a typed result.
- Parse `git status --porcelain=v2 --branch --untracked-files=all
  --renames -z` rather than human-readable output.
- Classify each entry into product categories: changed, new, deleted, renamed,
  and conflicted.
- Return per-file entries with a repository-relative path and its category,
  plus aggregate counts, so the Overview can summarize without holding the list.
- Represent "nothing has changed" as an explicit clean state rather than an
  empty list the frontend has to interpret.
- Return the upstream-tracking fields that `--branch` already provides as typed
  data, without presenting them yet (see Out of scope).
- Replace the Overview's primary card with a real working-tree summary: a
  plain-language headline, a truthful count, and clean/dirty/conflicted
  variants, keeping the loading and error variants added in task 001.
- Refresh the status when the project is opened and when the user explicitly
  asks, with a visible, keyboard-reachable refresh control.
- Cover the parser with fixtures and the command with temporary-repository
  tests.
- Localize all new copy in English and Spanish, including pluralization.

# Out of scope

- The Changes screen itself: the file list and diff viewer are their own task.
  This task may enable navigation to it only if that screen exists; otherwise
  the entry stays disabled.
- Staging and unstaging.
- Creating saved versions.
- Presenting ahead/behind or any remote state in the interface. The upstream
  fields are captured as data only; explaining them belongs to the Fase 2 remote
  work, which must distinguish "files have local changes" from "saved versions
  are up to date with the remote".
- Fetching from a remote.
- Continuous background refresh and filesystem watching. `work/backlog.md`
  requires designing watching, cancellation, and large-repository performance
  tests first; this task refreshes on open and on demand only.
- Ignored-file browsing. Ignored files are excluded from the summary.
- Line-ending-only change detection.

# Acceptance criteria

- [x] A Tauri command returns a typed working-tree status for an opened
      repository, with Git execution and parsing in Rust.
- [x] Parsing uses `--porcelain=v2` with `-z`, so paths containing spaces,
      quotes, non-ASCII characters, or newlines survive intact.
- [x] Changed, new, deleted, renamed, and conflicted entries are each
      classified correctly, and renames retain both paths.
- [x] A repository with no changes reports an explicit clean state.
- [x] An unborn branch reports its status without error.
- [x] A detached HEAD reports its status without claiming a branch.
- [x] A linked worktree reports its own working tree, not the main checkout's.
- [x] Failures — Git missing, the repository disappearing, a command failing —
      return the structured `{ code, message, remediation }` contract and are
      localized in the interface.
- [x] The Overview's primary card states the real number of changed files in
      plain language, with correct singular and plural forms in both languages,
      and never displays a count that was not derived from a typed result.
- [x] The clean state reads as a positive, finished state rather than an empty
      one.
- [x] Conflicted files are surfaced distinctly and are not counted as ordinary
      changes.
- [x] Refreshing exposes a busy state, does not clear the previously known
      status while loading, and announces a material change accessibly without
      stealing focus.
- [x] State is never conveyed by color or icon alone.
- [x] The status is not requested when no project is open.
- [x] Parser unit tests cover clean, staged-only, unstaged-only, mixed,
      untracked, renamed, deleted, conflicted, unborn, and detached fixtures.
- [x] Temporary-repository tests cover a clean repository, a repository with
      changes, an unborn branch, and a linked worktree.
- [x] The result contract caps the returned entry list while preserving exact
      aggregate counts, preventing an unbounded status payload from reaching
      the interface.
- [x] The required frontend and Rust checks pass.
- [x] New copy is complete in English and Spanish.
- [x] The Overview remains usable at approximately 1024px, at 200% text zoom,
      and in both themes with the new card.
- [x] The new state has been verified in the real desktop app against a clean
      repository, a repository with mixed changes, and a conflicted repository.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `work/done/0.1.0/001-open-local-repository.md`
- `src-tauri/src/lib.rs`
- `src/main.tsx`
- `src/repositoryOverview.ts`
- `src/i18n.tsx`

# Dependencies

- Task 001 (done) provides the opened-project contract and the Overview card
  this task fills in.
- System Git remains the Git implementation.

# Decisions

- Parse `--porcelain=v2`, not `--porcelain=v1` or human-readable output.
  v2 reports rename scores, submodule state, and the branch header in a stable
  documented format, and `docs/ARCHITECTURE.md` already requires
  machine-readable formats with fixtures.
- Use `-z` for NUL-separated records. This is the only reliable way to handle
  paths containing spaces or newlines, which the quoted default format escapes
  ambiguously.
- Return per-file entries even though this task only renders aggregate counts.
  The Changes screen needs them immediately afterwards, and returning them now
  avoids designing a second command with a different shape. If a very large
  status turns out to be a payload problem, cap the returned list and keep the
  counts exact rather than truncating the counts.
- Do not model staged/unstaged as the primary product concept. Classify by what
  happened to the file; the save-version flow owns the index.
- Capture upstream fields now but present nothing. Reading them costs nothing
  extra with `--branch`, while explaining them requires the remote contracts
  from Fase 2.
- Refresh on open and on demand only. Background watching is explicitly
  deferred in `work/backlog.md` until its performance and cancellation design
  exists, and an on-demand control matches the pattern established by
  `work/done/0.1.0/005-on-demand-git-updates.md`.
- **Closure decision (2026-07-26):** the user accepted the real-desktop
  behaviour as sufficiently exercised for this vertical slice. A measured
  large-repository stress test is deliberately deferred until the Changes and
  save-version flows form a complete workflow worth benchmarking. Task 007
  still bounds its payload at 1,000 entries and keeps aggregate counts exact;
  this is a shipped safeguard, not a claim that end-to-end large-repository
  performance has been measured.

# Implementation notes

- `src-tauri/src/lib.rs`: added `read_working_tree_status(path)`, a
  `parse_status_porcelain_v2` parser, and the `ChangeCategory`,
  `WorkingTreeEntry`, `WorkingTreeCounts`, `UpstreamStatus`, and
  `WorkingTreeStatus` types. The command runs
  `git status --porcelain=v2 --branch --untracked-files=all --renames -z`.
  `--renames` is passed explicitly so a repository configured with
  `status.renames=false` still reports a rename as a rename rather than a
  delete plus an add.
- The parser works on raw bytes, not the trimmed `String` the existing helpers
  return, because `-z` output is NUL-separated and must not be trimmed. The
  subtle part is that a rename record spans **two** NUL-separated fields — the
  record and then the original path — so the parser advances the iterator an
  extra step for `2 ` records. Getting this wrong silently shifts every
  subsequent entry by one.
- Classification is by what happened to the file, not by where Git recorded it:
  a staged modification and an unstaged one are both "changed". The
  index/worktree split stays hidden until the save-version flow owns it.
- The entry list is capped at `MAX_REPORTED_ENTRIES` (1000) with a `truncated`
  flag; counts are never capped, so the summary stays exact for any repository
  size.
- `src/repositoryOverview.ts`: added the mirrored TypeScript types plus
  `getWorkingTreeSummary` and `getWorkingTreeBreakdown`. Conflicts outrank the
  plain change count, and a clean tree resolves to a positive tone rather than
  an empty one.
- `src/main.tsx`: the Overview's primary card now renders the working-tree
  summary with `success`/`neutral`/`attention`/`loading`/`error` variants and a
  chip row of category counts. A refresh runs on open and whenever the opened
  project changes, never when no project is open, and a failed refresh keeps
  the last known status rather than blanking the card.
- **Action layout changed.** "Check for changes" became the card's enabled
  primary action, while "Review changes" remains visibly disabled and marked
  “Coming soon” until its screen exists. "Open another project" moved into the
  project menu next to "Close project" — which is where task 001's
  specification already allowed it. The sidebar uses the same visible
  availability signal, so the roadmap stays honest without making unavailable
  actions look clickable.
- A visually-hidden `role="status"` announces the finished summary, so a
  refresh is reported without moving focus.
- **Review pass before commit** found three defects, all fixed:
  - a refresh that failed *after* a successful one was swallowed silently — the
    card kept showing stale numbers with no sign the check had failed. It now
    keeps the known status and adds a `role="alert"` note saying the figures
    are the last readable result;
  - the live region mirrored the card's headline and message from first render,
    so a screen reader read the whole status twice. `StatusAnnouncement` now
    stays empty until a check has actually run and completed;
  - the error and needs-attention states used the same glyph, because
    `AlertTriangle` is a lucide alias of `TriangleAlert`. With colour as the
    only remaining difference this broke the "never state by colour alone"
    rule. Error now uses `CircleAlert`, attention keeps `TriangleAlert`.

# Validation

- `pnpm run check:frontend` — pass (typecheck, 13 tests, build).
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — pass, no warnings.
- `cargo test --manifest-path src-tauri/Cargo.toml` — pass, 29 tests
  (13 new: 8 parser fixtures, 5 temporary-repository cases).
- Card variants exercised in the running dev server with substituted status
  values: clean renders `project-hero--success` with no chips; a mixed status
  renders `project-hero--neutral`, "5 archivos han cambiado…", and the chips
  "3 editados / 1 nuevo / 1 eliminado"; a conflicted status renders
  `project-hero--attention` with "2 necesitan atención" first.
- No horizontal page scroll and no overflowing element at 1280px, 1024px, or
  512px (1024px at 200% zoom) with a 20-file status and all five chips.

## Closure note (2026-07-26)

- The user confirmed the clean, mixed, and conflicted desktop behaviour has
  been tested sufficiently to close this task.
- End-to-end stress measurement with thousands of changed files remains
  intentionally unclaimed and is deferred to a later performance task covering
  the complete Changes/save-version workflow.
