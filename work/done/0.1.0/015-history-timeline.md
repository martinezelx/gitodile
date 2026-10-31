---
id: 015
title: Browse saved versions in a readable history timeline
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
  - history
created: 2026-07-27
completed: 2026-08-24
---

# Goal

Add a performant, read-only History screen that presents the current version
branch as an understandable timeline of saved versions, with technical Git
details available progressively.

# User outcome

The user can see what was saved, who saved it, when it happened, whether it is
local or already reachable from the configured upstream, and which files a
selected version changed.

# Context

The navigation already anticipates a History screen, but it must remain disabled
until this task supplies real data and states. Task 010 creates saved versions;
tasks 011 and 013 provide upstream knowledge that can distinguish local-only
versions from published ones.

This task is intentionally read-only. Comparing arbitrary versions, restoring,
checking out, and rewriting history remain separate safety-sensitive flows.

# Scope

## History contract

- Add a narrow Rust history service and paginated Tauri commands.
- The default timeline follows commits reachable from the active branch `HEAD`,
  including merge commits, in a stable topological/date order.
- Return a typed `HistoryPage` with:
  - repository/session identity and snapshot token;
  - current branch/head state;
  - bounded list of `SavedVersionSummary` values;
  - continuation cursor and `hasMore`;
  - configured upstream boundary when available;
  - shallow-repository and truncation warnings.
- Each summary includes:
  - full/short commit ID and parent IDs;
  - subject and bounded body/description;
  - author display name/email and authored timestamp;
  - committed timestamp when materially different;
  - local branch, remote-branch, tag, and `HEAD` decorations;
  - root/merge indicators;
  - local-only/published/unknown reachability relative to the selected upstream.
- Use machine-readable, delimiter-safe Git output. Treat commit messages,
  identities, refs, paths, and signatures as untrusted data.
- Cap page size and individual text fields. Return explicit truncation metadata
  rather than silently losing content.

## Pagination and freshness

- Load an initial bounded page and fetch more on explicit/infinite-scroll demand
  without loading the entire graph.
- Bind cursors to a snapshot token/current `HEAD`. If history changes during
  pagination, reject stale continuation and refresh predictably rather than
  duplicating or skipping entries.
- Cancel or ignore superseded requests and isolate results per task-012 project
  session.
- Avoid one Git process per row. Published/local reachability, decorations, and
  summaries must be derived in bounded batch operations.

## Version details

- Selecting a saved version opens a detail region that shows:
  - complete bounded description and technical metadata;
  - parent relationship;
  - changed-file list and counts by category;
  - a readable patch using the established task-009 diff language.
- Compare a normal commit to its first parent. Compare the first/root commit to
  Git's empty tree. For merge commits, label the first-parent comparison
  explicitly and show all parent IDs in technical details.
- Handle binary, too-large, no-text-difference, malformed, and truncated diffs
  using the existing typed patterns rather than a second diff renderer.
- Cache bounded pages/details per session and invalidate them after save,
  publish, get-team-changes, branch change, or repository refresh.

## UI and interaction

- Enable **History** navigation only when the screen is functional.
- Use a compact timeline/list plus detail layout consistent with Changes:
  readable high-density rows on opaque surfaces, with one selected item.
- Lead each row with the saved description. Author, relative/absolute date,
  merge/root state, publication state, and short ID are secondary.
- Do not render a decorative graph that implies branch topology the MVP does
  not model accurately.
- Provide empty/loading/error states for:
  - first project with no saved versions;
  - detached `HEAD`;
  - shallow history;
  - missing/unreadable commits;
  - stale page;
  - no upstream/publication state unknown;
  - selected version no longer reachable after refresh.
- Preserve selected version and scroll position per project when switching.
- Provide list/detail keyboard navigation, visible focus, screen-reader
  selection semantics, localized dates, and non-color publication indicators.

# Out of scope

- Full multi-branch commit graph visualization.
- Repository-wide/server-backed search, author avatars, Gravatar, or network
  identity lookup. Timeline search and filters remain local to loaded rows.
- Comparing two arbitrary saved versions.
- Restore, revert, reset, checkout, cherry-pick, amend, rebase, or branch
  creation.
- Editing commit messages or metadata.
- Signature verification UI.
- Reflog and unreachable commit browsing.
- File history/blame.

# Acceptance criteria

- [x] The History navigation opens a real, read-only timeline for the active
      project.
- [x] Normal, root, and merge commits parse through delimiter-safe typed output.
- [x] Pagination is bounded and stale cursors cannot duplicate/miss entries
      silently after history changes.
- [x] Rows show understandable description/date/author information with exact
      hashes and refs available progressively.
- [x] Local-only, published, and unknown states are accurate relative to the
      configured upstream and never inferred from a hosting provider.
- [x] Version details reuse the established diff states and explain first-parent
      merge comparison.
- [x] Large histories, long messages, many decorations, binary/large patches,
      shallow repositories, and non-ASCII data remain responsive and truthful.
- [x] No history command mutates refs, index, worktree, configuration, or
      remotes.
- [x] History cache/selection invalidates correctly after save, publish,
      get-team-changes, branch change, and project close.
- [x] Per-project selection, pagination, loading, and errors remain isolated
      when switching sessions.
- [x] Spanish/English copy, localized dates, keyboard, focus, screen reader,
      narrow/large layouts, light/dark themes, and reduced motion are complete.

# Required tests and audit

## Rust unit tests

- Delimiter-safe parsing with multiline, empty, control-character, and
  non-ASCII messages/identities.
- Root, normal, and multi-parent merge commits.
- Decoration parsing without ambiguous comma/string splitting.
- Truncation and page-size limits.
- Published/local/unknown reachability classification.
- Cursor/snapshot validation and stale-history outcomes.

## Rust integration tests

Use temporary repositories for:

- unborn, single-commit, linear, merged, tagged, detached, and shallow history;
- local-only, fully published, and partly published timelines;
- history changing between pages;
- large commit counts and large messages;
- rename, deletion, binary, too-large, root, and merge detail diffs;
- no mutation of refs, index, worktree, config, or remote-tracking state.

## Frontend and desktop audit

- Empty, loading, populated, loading-more, stale, partial-error, and detail
  states.
- 1, 50, hundreds, and thousands of versions with bounded DOM/render work.
- Long/duplicate descriptions, many refs, time zones, locale changes, and
  non-ASCII content.
- Switch projects during page/detail requests and after selection.
- Keyboard list/detail flow, focus restoration, screen-reader semantics,
  light/dark, narrow/large windows, and reduced motion.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `work/done/0.1.0/009-changes-and-diff-viewer.md`
- `work/active/010-save-version.md`
- `work/done/0.1.0/011-publish-changes.md`
- `work/done/0.1.0/012-open-and-switch-projects.md`
- `work/active/013-check-team-changes.md`
- `src/main.tsx`
- `src/changes.tsx`
- `src/repositoryOverview.ts`
- `src/appError.ts`
- `src/i18n.tsx`
- `src/styles.css`
- `src-tauri/src/lib.rs`

# Dependencies

- **Unblocked 2026-08-10.** Epic 022 and its task-031 audit landed. History is
  the first real greenfield screen and consumes the proven modular feature,
  session-epoch, native-execution, typed-invalidation and performance-safe
  screen contracts rather than adding responsibilities to `main.tsx`/`lib.rs`.
  Task 031 built and removed a History-shaped proof of exactly this path;
  follow the measured footprint table in
  `docs/architecture/frontend-feature-guide.md` §8 and expect no edit outside
  it. One known gap: refreshing on watcher invalidation still requires adding
  the controller to `createRepositoryReadCoordinator` by hand.
- Task 010 for the save-version vocabulary and result.
- Task 012 for per-project history continuity and request isolation.
- Tasks 011/013 for optional published/local reachability. The timeline must
  still work with publication state marked unknown when no upstream exists.

# Decisions

- Start with the active branch's reachable history, not a full repository graph.
- Preserve merge commits but visualize them as rows, not a misleading graph.
- Use bounded snapshot-aware pagination and batch Git reads.
- Commit details reuse task 009's diff language and typed exceptional states.
- History remains entirely read-only.

# Implementation notes

- `history.rs` reads `rev-list --topo-order --date-order --parents` in pages of
  50 (hard maximum 100), then uses bounded `cat-file --batch-check` and
  `cat-file --batch` stdin protocols. Raw commit-object lengths frame messages,
  so newlines, NUL/control bytes, Unicode, and empty messages cannot corrupt
  adjacent rows. `for-each-ref` supplies NUL-framed typed decorations in one
  bounded pass; there is no Git process per row.
- The opaque `v1` cursor binds offset and upstream-local reachability progress
  to a snapshot token derived from repository identity, HEAD/branch, configured
  upstream ref/commit, and shallow state. A mismatch returns
  `stale_history_cursor`; the controller discards the continuation and reloads
  the newest first page, so changed history cannot silently skip or duplicate
  rows.
- Publication is local-only only when a commit is in the bounded
  `HEAD --not <local upstream tracking commit>` set. Commits outside that set
  are published; an absent or unusable configured upstream yields `unknown`.
  No host/provider inference or network request is involved.
- Details validate that the selected commit remains reachable in the page
  snapshot. Root versions compare with Git's empty tree, ordinary versions with
  their parent, and merges explicitly with the first parent while retaining all
  parent IDs. File paths use `--name-status -z`; patches flow through
  `changes::diff_result_from_text` and the existing `DiffResultView`, preserving
  typed binary, too-large, unchanged, conflict, truncation, and rename states.
- The frontend keeps at most four session caches, 5,000 loaded rows, 24 details,
  64 diffs, and 20 MiB of detail/diff estimates. Requests are generation-bound,
  first-page and continuation reads coalesce, late closed-epoch results are
  inert, and shared repository invalidations refresh History after save,
  publish, get-team-changes, branch changes, watcher events, or explicit
  repository refresh. Timeline rows and changed files are virtualized.
- The feature owns its typed port/adapter/controller/screen descriptor, is
  registered through `src/screens.tsx`, warms only on project activation, and
  suspends subscriptions/announcements while hidden. English and Spanish copy,
  locale dates, listbox semantics, keyboard movement, opaque light/dark
  surfaces, reduced motion, and a single-pane narrow layout are included.
- Follow-up refinement on 2026-08-22 compacted the timeline to two-line rows,
  moved hash/publication/ref metadata into the selected-version pane, reused
  Changes' file-type icons, aligned the refresh glyph, and kept the selected
  identity visible during loading. A bounded native read-through cache now
  reuses page-proven graph/metadata and detail file lists while rechecking
  `HEAD`, removing redundant Git process launches from the selection path.
- A second 2026-08-22 visual refinement adopted the approved History reference:
  a continuous compact timeline, local search/publication filters/sort, a
  selected-version summary with progressive metadata, Overview/Files/Diff
  tabs, a virtualized file sidebar, unified/split views, hunk navigation, file
  path copying, and diff search that highlights and reveals the first match.
  The initials badge is derived locally from commit metadata; it performs no
  avatar or identity network lookup.
- A final 2026-08-22 reference pass rebuilt Overview around truthful metrics,
  change/area summaries, top files, technical metadata, and commit notes. Files
  changed gained type/status filters, path/status sorting, real previews for
  the selected file, previous/next navigation, and automatic selected-row
  visibility. Other file diffs remain lazy to preserve the faster selection
  path. The commit header is now a flat surface, the refresh copy is compact,
  and the unified/split active state uses a crisp non-shadowed boundary.
- A subsequent 2026-08-22 polish pass removed the duplicate message from the
  selected-version header while retaining its title above the compact
  author/date/hash/status context. Overview owns the full message but does not
  repeat the title a third time. Each timeline row now draws its own connector
  on the exact node-center coordinate, with the first and last segments ending
  at their nodes. Clearer hollow/selected nodes, hover/focus feedback, and one
  short reduced-motion-safe selection animation add polish without continuous
  animation or repository work.
- The 2026-08-24 simplification pass removed the redundant Files changed tab,
  leaving Overview and Diff as the two detail destinations. Overview now lists
  every bounded changed path in a virtualized shared-scrollbar region, while
  Diff gives more width to code and reuses Changes' exact view picker. Timeline
  publication and ordering controls expose both their criterion and current
  value, filtered counts make their effect visible, and History/Changes refresh
  actions use the same compact icon-only treatment with accessible names.
- The 2026-08-24 follow-up moved that refresh treatment into a shared control,
  reused Changes' exact selected-text copy menu in History diffs, and made every
  Overview file open directly in Diff. The Overview file list now consumes the
  full available column before scrolling. Timeline filters use the app's
  anchored-menu language, continuation loading uses the shared progress bar,
  and pagination keeps the first paint at 50 versions while fetching later
  blocks at the Rust maximum of 100. Fixed-height contained rows, memoized
  timeline rendering, and earlier prefetch remove row measurement and diff-side
  rerenders from the commit scroll path.
- Overview now distinguishes authored commit content from GitOdile context:
  **Description** contains only the commit message body and is omitted when it
  is empty, while **Comparison** always explains which saved version supplies
  the diff baseline. Multiline descriptions preserve their authored breaks.
- The project Overview now closes with a bounded **Recent history** summary of
  the four newest saved versions. It reuses History's project-session cache,
  publication states and date formatter without loading another page; each row
  selects that exact version before opening History. Loading, retry, stale and
  no-version states remain truthful. The obsolete Recovery coming-soon card was
  removed from Overview while its disabled navigation destination remains.

# Validation

- `cargo test --manifest-path src-tauri/Cargo.toml history_tests -- --nocapture`:
  12 integration tests passed, including native cache reuse, 205-version
  three-page traversal,
  stale cursors, published/local boundaries, root/merge detail, detached,
  shallow, tags, binary/large patches, Unicode/multiline/empty messages, and
  repository non-mutation.
- History parser/unit coverage passes for raw object framing (including NUL),
  graph parents, delimiter-safe rename paths, cursor round trips, and text
  limits. `cargo clippy --all-targets --all-features -- -D warnings` passes.
- `src/features/history`: controller, lifecycle, locale, state, keyboard,
  caching, and 1,000-row bounded-DOM tests pass. The production TypeScript build
  and architecture owner checks pass; History builds as a separate lazy screen
  chunk and reuses the lazy diff renderer.
- Windows 11 desktop QA used the real Tauri/WebView2 app against this repository
  at 1180 px and the configured 900 px minimum. Verified initial 50-row page,
  populated detail/diff, keyboard Down selection, virtual scrolling, focus,
  read-only publication/ref metadata, and compact list → detail → Back flow. A
  real-layout defect where the virtual list remained empty after Back was found,
  fixed by remounting its measurement boundary, and reverified at 900 px.
- Follow-up Windows QA compared the open repository with GitHub Desktop, then
  measured a fresh GitOdile selection through the same screen-capture method.
  The observed files-ready window improved from roughly 421–519 ms to
  198–285 ms (about 45% faster, including automation/capture overhead), while
  the selected title and metadata now paint before the file list is ready.
- Reference-redesign Windows QA used the live Tauri/WebView2 app at 1182 × 762.
  The timeline/detail proportions, selected graph node, commit summary,
  Overview and Files tabs, virtualized file rows, diff toolbar, and existing
  syntax-highlighted patch were inspected against the supplied reference.
  Focused History/DiffResult tests cover the functional search, publication
  filter, sort, tabs, unified/split selector, and diff-match highlighting.
- Follow-up Windows QA at 1182 × 762 inspected the supplied Overview and Files
  changed references against the live app. It confirmed the flat commit header,
  concise Refresh action, non-shadowed view selector, responsive Overview
  columns, working file filters/sort/navigation, and a fully visible selected
  file card without eager loading of the other file patches.
- The 2026-08-24 follow-up was rechecked in the live Tauri/WebView2 app at the
  maximized desktop size. The anchored filter menus, full-height Overview file
  region, file-to-Diff navigation, narrower file sidebar, and shared refresh
  glyph were verified directly. Scrolling into the prefetch threshold displayed
  the shared loading bar and expanded the real repository from 50 to all 123
  saved versions without reaching an empty end state first.
- The Overview History summary was inspected in the live maximized Tauri app
  against this repository. Four real saved versions, author/date/hash metadata,
  publication labels, row affordances and the full-history action remained
  clear below the action-oriented status sections; Recovery no longer occupies
  Overview space.
- Light/dark tokens, forced-colors and reduced-motion behavior are covered by
  the existing style contracts and the History stylesheet. macOS and Linux
  runtime validation remains pending for task 065-8; compilation, argument-only
  Git execution, path framing, and non-shell behavior remain cross-platform.
- Final aggregate: `pnpm run check` passed with 126 Markdown files and 94 task
  IDs, 289 frontend architecture modules, 52 Vitest files / 423 tests, the
  production build, Rust formatting and Clippy, and 297 Rust tests.
