---
id: 034
title: Branches screen rework — delete clarity, then a retiled layout
status: done
priority: normal
type: feature
areas:
  - frontend
created: 2026-08-05
completed: 2026-08-05
---

# Goal

Rework the Branches screen in three parts, all now implemented:

1. **Deletion clarity.** Say up front which branches can be deleted, and turn
   every refusal to delete into an explanation with a way forward instead of
   a red error banner.
2. **Visual retiling.** Rebuild the screen's layout from the mockup
   screenshot the user supplied: a summary stat branch, a search/filter/sort
   toolbar, explicit "Active branch" / "Other branches" sections, a prominent
   active-branch card, and grouped rows — then two follow-up visual fixes
   (subtitle branch-wrap, bottom spacing) after the user reviewed the running
   app.
3. **Upstream sync status.** Show how each branch compares to its upstream
   (ahead/behind/gone), the first of the "what would you improve next"
   suggestions the user asked for and approved — both in the row (a pill,
   only when there's drift worth flagging) and in the row's `Details` panel
   (always, including the unremarkable "up to date" and "no upstream"
   states).

# User outcome

- Before opening any dialog, the user can see which branches are safe to
  delete and which aren't, and why.
- A blocked deletion reads as a normal answer with a next step ("publish it",
  "merge it", "switch to it", "see the files in conflict"), not as a failure.
- The screen stops being a flat list of loosely-related boxes and reads as a
  dashboard: how many branches exist, which one is active, and one obvious
  action per row with the rest tucked away.
- The user can tell, without opening a dialog, whether a branch is ahead of its
  remote, behind it, both, or pointing at a remote branch that no longer
  exists — the three questions "did I push this", "am I missing something",
  and "is this remote branch even still there" that the old "Tracks x" pill
  never answered.

# Context

The screen shipped in task 016 and has since accumulated the search box,
prefix chips, and a per-row `<details>` disclosure without a layout pass. The
delete flow in particular only revealed a refusal *after* the user opened the
dialog and read a raw localized error.

Conflict resolution is deliberately not implemented anywhere in GitOdile
(see the Changes screen's read-only conflict view), so the
"unfinished Git operation" case can only explain and redirect — it must not
imply GitOdile can resolve the conflict.

# Scope

## Part 1 — deletion clarity (done)

- Per-row deletability derived from `isRetainedElsewhere` plus
  `worktreePath`, surfaced as a pill and as the delete button's tooltip and
  accessible name.
- Explained (non-error) dialog states for `branch_unique_work`,
  `branch_checked_out_elsewhere`, `branch_is_active`, and
  `git_operation_in_progress`, each with its own copy and, where one exists,
  a redirect action.
- The retryable error banner is kept only for failures that are actually
  retryable.

## Part 2 — visual retiling (to do)

Deltas from the mockup, in the order they appear on screen:

1. **Header stat branch.** Under the subtitle, a branch icon plus
   `N branches · ● 1 active · ● N local only`, with the dots colored by state.
   Derived entirely from the existing snapshot; no new backend data.
2. **Toolbar row.** One row containing the search field (unchanged
   behavior), an **"All branches"** dropdown that replaces the current prefix
   chips, and a **"Recently updated"** sort dropdown (new capability — see
   Decisions).
3. **Section headings.** `Active branch` and `Other branches` as small headings
   with a left accent bar, instead of two unlabeled lists.
4. **Active-branch card.** Taller, tinted card: rounded icon tile, name plus
   `ACTIVE` badge, `Latest: <subject> · <date>`, its pills, and right-aligned
   actions `View details` (eye icon), `New version from this branch` (plus
   icon), and a chevron for the rest.
5. **Other-branches list.** One grouped card with dividers between rows rather
   than separate cards per row. Each row: icon tile, bold name,
   `Latest: <subject> · <date>`, pills, then right-aligned `Details ⌄`
   disclosure, a vertical separator, a `Switch` button, and a `…` overflow
   menu.
6. **Actions move into the overflow menu.** `Delete` leaves the row as a
   bare trash icon and becomes a labelled item inside `…`, keeping its
   deletability tooltip/disabled reasoning. `Switch` stays a first-class
   button.
7. **Row disclosure.** The `<details>`/`<summary>` block currently under the
   row body becomes the right-aligned `Details ⌄` control, expanding the same
   technical details (branch name, latest commit) inside the row.
8. **Pill copy.** `Not published to a remote` → `Local only`;
   `N saved versions not on the active branch` → `N unpublished version(s)`
   (see Decisions — this is a semantic change, not just wording).
9. **Empty, loading, truncated, unreadable, detached, and unborn states** all
   restyled to sit inside the new structure without losing any of their
   current text.
10. **Subtitle wrap fix (second pass).** The one-line subtitle from item 8
    below was wrapping its last word at ordinary window sizes.
11. **Bottom-spacing fix (second pass).** The screen lost its bottom padding
    at the end of a scroll after item 5's list became one framed card.

## Part 3 — upstream sync status

1. **Backend.** `%(upstream:track)` added to the branch inventory's existing
   `for-each-ref` call (works on the legacy pre-2.41 path too, unlike
   `ahead-behind`/`worktreepath` — no new process, no new Git version
   requirement). Parsed into `upstreamAhead`/`upstreamBehind`/`upstreamGone`
   on `Branch`.
2. **Row pill.** Shown only for branches worth flagging: ahead-only
   ("N not pushed"), behind-only ("N not pulled"), both ("N not pushed, M not
   pulled"), or gone ("Remote branch deleted", warning-colored). A branch with
   an upstream that's fully in sync gets no extra pill — the existing
   "Tracks x" pill already implies it's published.
3. **Details panel.** Two new rows, always shown regardless of drift: the
   full upstream ref (or "None") and a "Remote status" sentence covering
   every case, including "up to date" and "no upstream configured".

# Out of scope

- Conflict resolution of any kind.
- An Overview banner for an unfinished Git operation (would need the
  in-progress operation exposed on the repository snapshot — a Rust contract
  change; capture separately if wanted).
- Extending the new explained-block treatment to the create and switch
  dialogs, which share the same `git_operation_in_progress` precondition.
- Any new Git capability behind the new controls (rename, merge, publish a
  branch) — Delete and Switch are the actions that already existed.
- Multi-select or bulk deletion.
- A live remote check for ahead/behind/gone — it reads whatever the last
  local fetch left in the remote-tracking refs, same as every other fact
  this screen shows.
- Re-keying the "Not published first" sort or the existing unique-commits
  pill off the new ahead/behind data. They answer different questions
  (no upstream at all vs. drift from a configured one) and conflating them
  wasn't asked for.
- The rest of the "free" Details ideas from the same conversation (full
  hash with copy, exact date+time, retained-by refs, author, worktree path)
  — only the upstream/sync rows were asked for; the others are still open
  suggestions, not scoped work.

# Acceptance criteria

Part 1 (met):

- [x] Every non-active row states whether it can be deleted, before any
      dialog opens.
- [x] The delete button's accessible name explains the row's deletability.
- [x] Unique-work, checked-out-elsewhere, active-branch, and
      operation-in-progress refusals render as explanations, with no
      "Try again" and no destructive button.
- [x] The unique-work case offers "Switch to this branch"; the
      operation-in-progress case offers "See the files in conflict" and
      states that resolving conflicts isn't supported yet.
- [x] Genuinely retryable failures keep the error banner and "Try again".
- [x] English and Spanish copy for every new string.

Part 2:

- [x] The header shows the branch count, the active count, and the local-only
      count, all derived from the existing snapshot.
- [x] Search, filter, and sort sit in one toolbar row; the prefix chips are
      gone and their filtering is reachable from the "All branches" dropdown.
- [x] Sorting is applied to the "Other branches" list and its choice is visible
      in the control's label.
- [x] "Active branch" and "Other branches" are labelled sections.
- [x] Other-branches rows share one card with dividers; each exposes `Details`,
      `Switch`, and an overflow menu containing `Delete`.
- [x] The overflow menu is keyboard-operable and closes on `Escape` and on
      outside click; `Delete` keeps its deletability tooltip and disabled
      state.
- [x] The layout holds at the app's narrowest supported width and with the
      sidebar collapsed, and long branch names still wrap rather than
      overflow.
- [x] Light and dark themes both pass a visual check against the running
      app — confirmed by the user directly in the running app, on top of the
      harness-measured colors and structure recorded in Validation.
- [x] Existing panel tests still pass, plus coverage for the sort control and
      the overflow menu (superseded by the direct delete button — see
      Implementation notes).

Part 3:

- [x] `Branch` carries `upstreamAhead`, `upstreamBehind`, `upstreamGone`,
      computed from a single added `for-each-ref` atom (no extra process).
- [x] A row shows a pill for ahead, behind, both, and gone; no pill when the
      upstream is fully in sync.
- [x] The row's Details panel always shows the full upstream ref and a
      sync-status sentence, for every state including "no upstream" and
      "up to date".
- [x] Rust unit tests cover `parse_upstream_track` directly and integration
      tests cover ahead+behind (via a diverged clone) and gone (via a
      deleted remote branch) through `get_branches`.
- [x] `cargo fmt --check` and `cargo clippy --all-targets --all-features -D
      warnings` both clean.
- [x] Frontend types, i18n (both languages), and panel tests updated; full
      `pnpm run check:frontend` passes.

# Relevant files

- `src/branchesPanel.tsx`
- `src/branchesDialog.tsx`
- `src/branches.ts`
- `src/styles.css`
- `src/i18n.tsx`
- `src/main.tsx` (screen wiring, `onOpenChanges`)
- `src/branchesPanel.test.tsx`, `src/branchesDialog.test.tsx`
- `src/projectSessions.test.ts` (fixture only — carries a `Branch` literal)
- `src-tauri/src/lib.rs` (`validate_and_prepare_delete`, `git_operation_in_progress`,
  `read_branch_refs`, `parse_branch_refs`, `parse_upstream_track`)
- `work/done/0.1.0/016-manage-branches.md`
- `work/active/architecture/027-branches-reference-slice.md`

# Dependencies

Task 027 rebuilds this screen as the reference vertical slice of the modular
feature architecture. Whichever lands second inherits the other's markup, so
they must not be worked in parallel.

# Decisions

- **Blocked deletions are explanations, not errors.** A branch whose work lives
  nowhere else *should* survive; presenting that as a failure teaches the user
  to distrust a correct safety check.
- **The delete button stays enabled for unmergeable branches.** The dialog is
  where the reason and the way forward live; a dead button with no
  explanation is worse than one click of friction. Only
  checked-out-elsewhere stays disabled, because nothing in this window can
  change it.
- **"See the files in conflict" points at Changes, not Overview.** Changes is
  the only screen that lists conflicted files today; Overview has nothing to
  show about them.
- **The operation name is not shown.** Rust knows whether it's a merge,
  rebase, cherry-pick, revert, or bisect, but the frontend localizes by error
  code and would have to smuggle the operation through `detail`, which is
  documented as a raw excerpt. The copy names the likely operations instead.

Settled with the user on 2026-08-05, before Part 2 started:

- **Sort options:** `Recently updated` (default, tip `committedAt` descending),
  `Name (A–Z)`, and `Not published first` — the last one keyed on
  `upstream === null`, which is data the snapshot already carries, rather
  than on any commit count.
- **"All branches" dropdown:** reads as "every branch" and its filters
  **combine**. Prefix filters OR together, state filters OR together, and the
  two groups AND with each other and with the search text, so narrowing is
  additive and the control's label can always say how many filters are on.
- **`N unpublished version(s)` pill: dropped, not relabelled.** The number
  behind today's pill counts commits not on the *active branch*, which is not
  what "unpublished" means; making it upstream-relative needs a Rust change
  that isn't worth blocking the layout on. The existing active-branch-relative
  pill keeps its current honest wording. Revisit if the upstream-relative
  count is ever computed.
- **"View details" on the active card:** expands exactly the technical
  details the row disclosure already shows (branch name, latest commit). It
  is knowingly thin for now; more goes in once there's more to show.

Settled with the user on 2026-08-05, after Part 2's second visual pass —
which of the "what would you improve" suggestions to build first:

- **Upstream ahead/behind first, everything else stays a suggestion.** Of
  the Details-panel ideas raised (full hash + copy, exact date+time, full
  upstream ref, retained-by refs, worktree path, author) and the
  process-level ones (empty-filtered-state escape hatch, filters/sort not
  persisting across screens, search silently missing branches past the
  300-branch discovery cap, create/switch dialogs' unfinished-git-operation
  message), the user asked specifically for the upstream ahead/behind data,
  since it's a field on a `for-each-ref` call the screen already makes (no
  new process) and it also gives the deferred "unpublished" pill decision
  above a correct, remote-relative number to eventually use — without
  actually re-keying that pill now, which stays out of scope.
- **Gone gets its own state, not folded into "behind".** A deleted remote
  branch isn't "N commits behind" (there is nothing left to be behind);
  saying so would be actively misleading. It gets its own pill and its own
  sentence instead.
- **No pill for a fully-synced branch with an upstream.** The existing
  "Tracks x" pill already implies publication; repeating "up to date" next
  to it would be noise. The Details panel still states it explicitly, since
  that panel's whole job is to be complete.

# Implementation notes

Part 1, implemented 2026-08-05 (uncommitted at the time of writing):

- `src/branchesPanel.tsx` — `BranchRow` derives a
  `"ready" | "unique-work" | "elsewhere"` deletability from
  `isRetainedElsewhere`/`worktreePath`, renders a `Safe to delete` or
  `Can't be deleted yet` pill, and uses one string for both the delete
  button's `title` and `aria-label`. The panel passes `onSwitchInstead`
  (hands the already-held mutation slot from the delete dialog to the switch
  dialog) and `onOpenChanges` (releases the slot, then navigates).
- `src/branchesDialog.tsx` — `DeleteBranchDialog` splits its
  `blocked` state into an "explained block" branch (own title, prose, option
  list, redirect action) and the pre-existing retryable `ErrorBanner` branch.
  The success path also gained a lead sentence plus the retaining refs as a
  list.
- `src/main.tsx` — `onOpenChanges={() => navigateToView("changes")}`.
- `src/i18n.tsx`, `src/styles.css` — new keys in both languages;
  `.branch-row__pill--deletable` and `.delete-branch-options`.
- No backend change was needed: `validate_and_prepare_delete` already
  returned distinct error codes for every case the UI now explains.

Part 2, implemented 2026-08-05:

- `src/branchesPanel.tsx` — rewritten around the new structure. The
  screen-level state is now `search` + `prefixFilters[]` + `stateFilters[]` +
  `sort`; `deletabilityOf()` was lifted out of the row so the filters and the
  header stats can reuse the same rule. New local components: `FilterMenu`
  (multi-select popup) and `RowActionsMenu` (per-row overflow), both sharing
  a `useDismissablePopup` hook that mirrors the titlebar menu's
  outside-click/Escape/focus-restore contract. The row's `<details>` element
  became a controlled `Details ⌄` toggle in the actions strip, and the active
  row grew `View details` and `New version from this branch`. The `compact`
  variant is gone: one row layout now serves both lists.
- Sorting is applied after filtering and never touches the active branch, which
  keeps its own section regardless of what's filtered.
- `src/styles.css` — the list is one framed card with `li + li` hairline
  dividers instead of standalone cards; `.branch-row__main` wraps its
  action strip below the body once the body would fall under ~260px, which is
  what stops the active row's two labelled buttons from crushing the name at
  the app's 900px minimum window width.
- `src/i18n.tsx` — new keys in both languages. Two existing strings were
  reworded: the no-upstream pill is now "Local only"/"Solo local", and the
  filter control's label is no longer prefix-specific since it also filters
  by state. The unique-commits pill was shortened (same meaning, fewer
  words) after measuring that it alone forced rows to a second pill branch.
- The mockup's chevron on the active card was dropped: it duplicated
  "View details", which controls the same disclosure.

Second visual pass, after the user reviewed the running app:

- The screen subtitle was three sentences of explanation; it's now one line,
  taken from the mockup. Its `max-width` went from the house 60ch to 76ch:
  measured, the new string is 64ch in English and 72.6ch in Spanish, so the
  old cap wrapped its last word at every window size. It still wraps once the
  header itself runs out of room (one line at 1400px, two at 900px).
- **The `…` overflow menu is gone.** Delete is a direct icon button in the
  row again — the user judged the menu worse for a single action, and it was
  a whole popup's worth of machinery for one item. `RowActionsMenu` and its
  translations were deleted; `useDismissablePopup` stays, used by the filter.
- Row actions are slimmer (32px tall, 6px/12px padding) so they read as
  secondary to the row, and all three now share one height and baseline —
  they were 29/31/33px before.
- The active card's icons overlapped their labels: `.secondary-button` sizes
  neither its icon nor its layout, the same gap `.save-version-dialog`'s
  actions had to patch. Fixed the same way, scoped to the row.
- The two deletability chips are now colored — green for "Safe to delete",
  amber for "Can't be deleted yet" — reusing the `.status-breakdown__item--*`
  recipe (tinted border + tinted text, neutral fill). Measured contrast:
  5.39/5.87 light, 10.08/9.07 dark. "Local only" and the version-count chip
  stay neutral: they're facts, not states.
- **Bottom-spacing regression fixed.** `.branches-view` was
  `flex: 1; min-height: 0`, which let it shrink below its content; the list
  then spilled *out* of that box, so `.workspace`'s 40px bottom padding sat
  above the overflow and the last row ended flush with the window. `flex:
  1 0 auto` keeps the grow-to-fill behavior the error state needs without
  the shrink. Measured: bottom gap 0px → 40px, box overflow 343px → 0px.

Known cosmetic gap, deliberately left: rows are uniform at desktop widths but
a very long branch name or a long upstream ref still makes one row taller
than its neighbours. The upstream pill truncates with the full value on
hover; the name itself wraps rather than truncating, because a half-shown
branch name is worse than an uneven row.

Part 3, implemented 2026-08-05:

- `src-tauri/src/lib.rs`:
  - `BRANCH_BASE_FORMAT` gained `%(upstream:track)` as a new field
    (between `upstream:short` and the batched-only `ahead-behind`/
    `worktreepath` atoms) — it's been available since long before this app's
    minimum Git version, so it lives in the shared base format and works on
    the legacy pre-2.41 path too, not just the batched one.
  - `BranchRaw` gained `upstream_track: String`; `parse_branch_refs`
    field indices for `unique_commit_count`/`worktree_path` shifted from
    6/7 to 7/8 to make room.
  - New `parse_upstream_track(&str) -> UpstreamTrack` parses Git's
    `[ahead N]` / `[behind N]` / `[ahead N, behind M]` / `[gone]` / empty
    text. `get_branches` only calls it when `raw.upstream.is_some()` —
    an empty track string means two different things ("no upstream" vs.
    "upstream, fully in sync") and only the presence of `upstream` itself
    tells them apart.
  - `Branch` gained `upstream_ahead`/`upstream_behind: Option<u32>` and
    `upstream_gone: bool`.
- `src/branches.ts` — matching `upstreamAhead`/`upstreamBehind: number |
  null` and `upstreamGone: boolean` on `Branch`.
- `src/branchesPanel.tsx` — `syncStatusOf(branch)` returns a discriminated
  union (`none`/`synced`/`gone`/`ahead`/`behind`/`diverged`) so the row pill
  and the Details panel share one source of truth instead of two copies of
  the same branching. The pill renders only for `gone`/`ahead`/`behind`/
  `diverged`; the Details panel renders a sentence for all six states.
- `src/i18n.tsx`, `src/styles.css` — six new sync-status strings per
  language plus two Details-panel labels; `.branch-row__pill--warning`
  for the "gone" pill (same recipe as the existing blocked/deletable chips);
  `.branch-row__details-panel-prose` un-monospaces the new sentence
  row (the panel's existing `dd` styling is monospace, meant for refs and
  hashes, and looked wrong on a sentence).

Third visual pass, after the user reviewed Part 3's changes:

- **Details panel now one row when there's room.** With four fields (branch
  name, latest commit, upstream, remote status) it was a fixed two-column
  grid — one label/value pair per branch regardless of available width. Changed
  to `flex-wrap`, each label+value as one inline unit, so all four sit on one
  branch at ordinary widths and wrap only once the row actually runs out of
  space. No JSX change; the `<div><dt/><dd/></div>` pairing was already
  right, only the CSS gridded it.
- **Section-heading accent bar removed from "Other branches", replaced (not
  removed) on "Active branch".** The user only asked about "Other branches", but
  the bar was one shared style, so dropping it first took "Active branch"'s
  mark with it — the user caught that and wanted it kept. Rather than restore
  the same generic bar, swapped it for the header stat branch's own "active"
  dot (`.branches-stats__dot--active`'s 8px green circle) via a new
  `--active` modifier on `.branches-section__title`, applied only to
  that heading. Recommended over restoring the bar: the dot is a mark that
  already means "active" elsewhere on this screen, so reusing it here ties
  the heading to *why* this section is different, instead of a divider any
  section heading could have had.

Demo branches created in `project-gitodile` for manual testing
(`demo/borrable-1`, `demo/borrable-2`, `demo/no-borrable-1`,
`demo/no-borrable-2`, and `demo/en-otro-espacio` in a linked worktree). They
are throwaway; remove them once Part 2's visual QA is done.

# Validation

Part 1:

- `npx tsc -p tsconfig.app.json --noEmit` — passed.
- `npx vitest run` — 161 tests across 16 files passed, including three new
  cases (deletability pills in the list, the explained unique-work block with
  its redirect, the unfinished-operation block) and one asserting the
  retryable banner survives for `ref_locked`.
- Manual: the user exercised the delete flow in the running app against real
  branches, including a repository with a merge in progress.

Part 2:

- `pnpm run check:frontend` (typecheck + tests + production build) — passed.
- `npx vitest run` — 165 tests across 16 files passed, including new cases
  for prefix filtering through the popup, prefix + state filters combining,
  the three sort orders, the row menu closing on Escape with focus restored,
  and opening the delete dialog from the menu.
- Layout measured in a throwaway harness (`harness.html` +
  `src/visualHarness.tsx`, both deleted afterwards) rendering the panel with
  a fixed snapshot: no horizontal overflow; row heights uniform at 1280px
  (95–96px, active 103px); at 660px only the active row wraps its actions
  below the body, which is the bug that measurement found and the wrap rule
  fixed; the filter popup stays inside the viewport, is opaque, and reports
  its counts. Theme colors were read per element with `data-theme` forced
  both ways.
Second visual pass:

- `pnpm run check:frontend` — passed; 165 tests across 16 files.
- Harness measurements after the changes: bottom gap 40px at 1280×860 and
  20px at 660px wide (matching the responsive padding), no horizontal
  overflow at either width, the three row controls aligned at 32px, active-row
  icons no longer intersecting their labels, and chip contrast sampled in
  both themes.

- No screenshot of the running app taken in this session — the browser pane
  wasn't displayed, so it never composited frames, which also froze CSS
  transitions mid-flight and produced two false contrast readings before
  that was identified. Confirmed later by the user directly (see the final
  entry below).

Second visual pass, follow-up fixes (subtitle wrap, bottom spacing):

- `pnpm run check:frontend` — passed; 165 tests across 16 files.
- Harness measurement: subtitle renders on one line at 1400px width (both
  languages) and wraps to two only once the header column itself narrows
  past ~550px (900px window); bottom gap 40px at 1280×860 and 20px at
  660px wide, matching `.workspace`'s responsive padding; no horizontal
  overflow at either width.

Part 3:

- `cargo fmt --manifest-path Cargo.toml -- --check` — clean.
- `cargo clippy --manifest-path Cargo.toml --all-targets --all-features --
  -D warnings` — no warnings.
- `cargo test --lib` — 175 passed, 0 failed. Includes
  `parse_upstream_track_reads_ahead_behind_and_gone` (pure-function cases for
  ahead-only, behind-only, both, gone, and empty) and two new integration
  tests against real repositories:
  `get_branches_reports_upstream_ahead_and_behind_after_diverging`
  (a second clone pushes a commit the repo hasn't fetched, while the repo
  makes its own local commit; after `git fetch`, ahead=1/behind=1) and
  `get_branches_reports_upstream_gone_after_the_remote_branch_is_deleted`
  (branch deleted on the bare remote via `push --delete`, then
  `fetch --prune`; `upstream` stays set, `upstreamGone` becomes true).
- `pnpm run check:frontend` — passed; 166 tests across 16 files (one new:
  every sync-status pill/Details combination, rendered from fixtures — ahead,
  diverged, gone, synced, and local-only side by side).
- Layout re-measured in the harness with upstream/ahead/behind/gone/synced
  fixtures: pill text and Details rows read correctly in Spanish (the
  session's active language), row heights stayed uniform (95–96px) except
  the active row's own baseline (103px), and the "gone" pill's contrast
  measured 5.87:1 light / 9.07:1 dark against the list background.
- Measured via computed styles and DOM structure in a hidden browser pane,
  same as above; not yet visually confirmed by the user at this point in the
  work (see the final entry below).

Third visual pass:

- `pnpm run check:frontend` — passed; 166 tests across 16 files (unchanged —
  this pass was CSS-only, no JSX changed).
- Harness measurement: a four-field Details panel rendered on one line at
  1280px, wrapped to two lines at 700px with no horizontal overflow at
  either width; "Active branch" carries the 8px green dot
  (`::before` computed `content: ""`, `width: 8px`) and "Other branches" has
  none (`content: none`).

Final sign-off: the user exercised the finished screen directly in the
running app — light and dark themes, real branches (including the delete
flow's blocked/ready/checked-out-elsewhere states and an in-progress-merge
repository) — and confirmed it works correctly. No further visual issues
reported. This closes the task's one remaining acceptance criterion.

# Follow-up ideas (not scoped, not started)

Raised during this task's review conversations and deliberately left out —
candidates for a future task, not committed work:

- Extend the explained-block delete treatment (task's Part 1) to the create
  and switch dialogs, which hit the same `git_operation_in_progress` and
  other blocking preconditions but still show the raw localized error.
- Re-key the `branchesUniqueCommits` pill (or add a new one) off
  `upstreamAhead`/`upstreamBehind` now that Part 3 computes them, instead of
  the active-branch-relative count it currently shows. Two different
  questions ("how much of this isn't merged into what I'm on" vs. "how much
  isn't pushed") — decide whether both are worth showing before touching it.
- More Details-panel fields: full commit hash with a copy button, exact
  saved date and time (not just the day), the list of refs that retain a
  deletable branch's work (today only shown inside the delete dialog), commit
  author, and the worktree path for a branch checked out elsewhere.
- Persist search/filter/sort choices in the project session (like the
  snapshot itself, task 019) so leaving and returning to the screen doesn't
  reset them.
- An escape hatch from the filtered empty state — "no matches" currently
  requires opening the filter popup to find "Clear filters"; consider
  surfacing that action inline when the list is empty.
- Silent gap: search can't find a branch past the 300-branch discovery cap
  (`BRANCH_LIST_CAP`); the truncation note says the list is incomplete
  but doesn't warn that search is limited to what's loaded.
