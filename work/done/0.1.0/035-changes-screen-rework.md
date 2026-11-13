---
id: 035
title: Changes screen rework — file search, line totals, and a diff toolbar
status: done
priority: normal
type: feature
areas:
  - frontend
  - backend
created: 2026-08-05
completed: 2026-08-06
---

# Goal

A visual/navigational pass over the Changes screen, built from a mockup the
user supplied. Three additions, all inside the existing two-panel layout:

1. A **file search box** in the changed-files panel, sitting directly below
   the select-all checkbox and the `x/x` count.
2. **Added/removed line totals** in the screen subtitle, tinted green and red
   from the current theme's diff colors.
3. A **diff toolbar** above the diff body: file-to-file navigation, a view
   selector (unified / split), and change-to-change navigation inside the
   current file.

Every new strip has to be pixel-matched across the two panels so the
header/toolbar rules keep landing on the same rows they do today.

# User outcome

- Finding one file in a long change list stops meaning scrolling — the user
  types part of its name.
- The user sees the size of the pending work (`+124 −18`) without opening a
  single file.
- Reviewing a change set becomes a sequence: next file, next change within
  the file, without going back to the list between files.
- A user who prefers side-by-side diffs can switch to split view.

# Context

The Changes screen shipped in task 009 and has kept its original two-column
shape: a file list with a select-all strip, and a diff pane with a header.
Both strips are pinned to a shared `--changes-header-height` so their bottom
rules align; anything added below them has to be pinned the same way, or the
two panels visibly skew.

The mockup is a reference, not a spec — the user said it will not be matched
100%. Per-file `+n −m` counts and the "Show N unchanged lines" expander that
appear in it are deliberately not part of this task.

Line totals have no backend support: `WorkingTreeStatus.counts` counts files,
not lines. The screen already warms a full-snapshot diff cache in one Git
process (`read_working_tree_diffs`), so the totals are derived from that
cache on the frontend rather than adding a Rust command.

# Scope

- Search box in the changed-files panel, filtering the list by path
  (case-insensitive substring, matching the Branches search behavior).
- `+n −m` totals in the subtitle, derived from the cached diffs, themed with
  `--diff-added` / `--diff-removed`.
- Diff toolbar with: `File i of n` plus previous/next file buttons, a `View:`
  unified/split selector, and `Change i of n` plus previous/next change
  buttons that scroll the diff to that hunk.
- Split (side-by-side) diff rendering, virtualized like the unified view.
- A `--changes-toolbar-height` token pairing the left search strip with the
  right diff toolbar, the same way `--changes-header-height` pairs the two
  header strips.
- English and Spanish strings for everything new.
- Tests for the new pure helpers and the new controls.
- Second round, after the user reviewed the running app:
  - Replace the view selector's native `<select>` with the app's own popup,
    matching the Overview branch picker (it did not fit the app's style, and
    its option list was unreadable in dark mode).
  - A "Checked just now" freshness note beside the refresh button.
  - Screen-specific button labels: `Refresh` and `Save selected (n)`.
- Third round: convert the Branches sort control to the same popup (it
  had the identical dark-mode bug), and open up the header's action-row
  spacing, which read as cramped once the freshness note joined it.

- Fourth round: make the hunk gap marker expandable, and fix a 1px mismatch
  between the two panels' toolbar strips.

# Out of scope

- Per-file added/removed counts in the file list rows.
- The overflow (`...`) menu in the mockup.
- Any change to selection, saving, or publishing behavior.

# Acceptance criteria

- [x] The changed-files panel shows a search input below the select-all row;
      typing narrows the list, and a no-match state explains it.
- [x] The subtitle shows `+n` in the added color and `−m` in the removed
      color once the diff cache is warm, and shows nothing extra before then.
- [x] The diff pane shows `File i of n` with working previous/next buttons,
      disabled at the ends of the list.
- [x] The diff pane shows `Change i of n` with working previous/next buttons
      that scroll the corresponding hunk into view; hidden when the file has
      no hunks.
- [x] The view selector switches between unified and split rendering, and the
      choice persists while moving between files.
- [x] Left search strip and right diff toolbar are the same height, and the
      two panels' internal rules stay aligned at every window width.
      (Verified by measuring the live DOM, not by arithmetic — see below.)
- [x] All new strings exist in both locales.
- [x] `pnpm test` and `pnpm build` pass.
- [x] Added in later rounds: the gap marker expands the unchanged lines
      between hunks; no native `<select>` remains in the app; the header's
      action row is spaced like the rest of the app.
- [x] Reviewed and validated in the running app by the user.

# Relevant files

- `src/changes.tsx`
- `src/changesPanel.test.tsx`
- `src/changes.test.ts`
- `src/styles.css`
- `src/i18n.tsx`

# Dependencies

None.

# Decisions

- **Totals come from the diff cache, not from Git.** The batch prefetch
  already reads every diff for the snapshot in one process, so the numbers
  are free; adding a `--numstat` command would duplicate that work.
  Consequence: the totals appear a beat after the screen does, and are
  omitted (rather than shown as zero) until the cache is warm.
- **Split view is real, not decorative.** A view selector that only offered
  one working mode would be a fake control, so split rendering is built on
  the same virtualized row model as unified.
- **Hunk = "change".** The toolbar's change counter counts hunks, which is
  what the diff already models; it does not try to group adjacent hunks.

# Implementation notes

All in `src/changes.tsx`, `src/styles.css`, and `src/i18n.tsx`.

**New pure helpers (all exported and unit-tested):**

- `filterEntriesBySearch` — case-insensitive substring over the full path.
- `countDiffLines` / `sumCachedDiffLines` — the subtitle's totals.
  `sumCachedDiffLines` returns `null` unless *every* listed file is cached,
  so the number never climbs in front of the user while the batch prefetch
  fills in.
- `buildSplitRows` — pairs each run of deletions with the run of additions
  that follows it, flushing at every context line so an unbalanced edit
  leaves an empty cell instead of pairing across unrelated sections.
- `getHunkStartRows` — row index that opens each hunk, for the change
  navigation to scroll to.
- `isFirstRowOfHunk` was widened from `DiffRow[]` to `{ hunkIndex }[]` so the
  split rows reuse it.

**Height pairing.** The layout gained `--changes-toolbar-height: 52px` and
`--changes-toolbar-control-height: 34px`, the same contract
`--changes-header-height` already had for the two header strips: both new
strips wrap one 34px control with 9px above and below, so the file list's
search box and the diff's toolbar close on the same pixel row even when the
right side has no change navigation to show (a file with no hunks).

**Redraw of a mutable cache.** The diff cache is a plain `Map` the batch
prefetch mutates, so nothing re-rendered when it filled. A `cacheVersion`
counter, bumped when `read_working_tree_diffs` resolves, is what makes the
totals appear. Revisiting the screen with an already-warm cache needs no bump
— the first render reads the full Map directly.

**View mode and change target live in `DiffWorkspace`,** not `ChangesPanel`:
they describe how the pane is being read, not what the screen shows. The view
mode deliberately survives moving between files; the change target resets per
file. The target is `{ index, token }` rather than a bare index so pressing
the same button twice, or switching view modes, scrolls again.

**Split geometry is duplicated in two places by necessity:**
`DIFF_SPLIT_CONTENT_GUTTER` (125px) in `changes.tsx` must stay in sync with
`.diff-split-row`'s `grid-template-columns` in `styles.css` — the virtualizer
subtracts it before halving the remaining width to find the split wrap point.
Both sides carry a comment pointing at the other, matching how
`DIFF_CONTENT_GUTTER` already worked for the unified view.

**Test-file cleanup.** Vitest runs without `globals`, so Testing Library
never registered its automatic `afterEach` cleanup and every render in
`changesPanel.test.tsx` stacked in one document. Harmless until these tests,
which query controls that appear once per render; the file's existing
top-level `afterEach` now calls `cleanup()`.

Follow-up worth considering: per-file `+n −m` counts in the list rows (out of
scope here) are nearly free now that `countDiffLines` exists.

## Second round (after the user reviewed the running app)

**The view selector is no longer a native `<select>`.** An
`appearance: none` select still hands its *option list* to the platform,
which ignores the app's theme — that is why it looked foreign and why dark
mode was unreadable. It is now `DiffViewSelector`, a popup built on the same
open/dismiss/Escape contract as `OverviewBranchQuickActions`, wearing
that component's `.branch-selector` trigger.

To avoid a second near-identical popup stylesheet, the quick-switch menu's
rules were promoted to a shared `.app-menu` / `.app-menu__item` pair, with
the existing `.branches-quick-switch__*` selectors kept alongside them
so nothing on Overview changed. Any future dropdown should use `.app-menu`
rather than a native select. (Converted in the third round below.)

**Freshness note.** `ProjectSession` gained `workingTreeCheckedAt`, stamped
by the caller (`Date.now()` passed into the `applyWorkingTree` action, so the
reducer stays pure) and deliberately *not* advanced by `applyWorkingTreeError`
— after a failed refresh the honest answer is the age of the snapshot still
on screen. `CheckFreshnessNote` runs its own one-minute interval so the
wording ages while the user reads, and `getCheckFreshness` is a pure,
unit-tested bucket function (also clamps a backwards clock jump to "just
now").

**Button labels** are now screen-specific: `changesRefresh` ("Refresh") rather
than Overview's fuller "Check for changes", since the note beside it already
establishes what was checked; and `changesSaveSelected(n)` ("Save selected
(8)"), falling back to the plain "Save version" when there is no per-file
choice to count (a truncated status) or nothing selected.

## Third round

**Branches sort control** is now `SortMenu`, the same `.app-menu` popup,
reusing that panel's existing `useDismissablePopup` hook (the Changes view
picker still hand-rolls the equivalent effect — worth unifying if a fourth
dropdown appears). No native `<select>` remains in the app. The dead
`.branches-select--native` rules were deleted and replaced with the
open/rotate-chevron states the trigger now needs.

**Header action spacing.** Surveyed the other screens first: every button row
in the app (`.project-hero__buttons`, `.settings-row__actions`,
`.window-titlebar__actions`) uses `--space-2`, and screen headers separate
their title block from their actions with `--space-4`. Changes had everything
at `--space-2`, which is what made it feel packed once a third element
joined. Now the two buttons keep `--space-2` inside a new
`.changes-view__buttons` wrapper, the freshness note sits `--space-4` out from
that group, and the header's own title-to-actions gap goes to `--space-5`
since its right side is now a cluster rather than one button. Stacked (narrow
widths) the note becomes its own right-aligned line above full-width buttons.

## Fourth round

**The gap marker is now a control**, not a caption: "Show 47 unchanged lines"
opens the lines between two hunks. This is the task's only backend change,
and it was unavoidable — a diff carries what changed plus its immediate
context, so the gap it announces is genuinely not in the payload.

New Rust command `read_file_lines(path, file_path, start_line, end_line)`,
reading the **working-tree** copy: these lines are unchanged by definition, so
both sides agree on them, and no Git process is needed. Bounded like the diff
commands are — `MAX_EXPANDED_LINES` (500) per request, `MAX_EXPANDABLE_FILE_BYTES`
(8 MB) per file — and it reuses `validate_repo_relative_path`. A range running
past the end of the file is clamped rather than rejected, since the caller's
range comes from a diff that may be a moment stale.

Expansion is **incremental**: `lines.length` for a gap doubles as the offset
the next request starts from, so a gap larger than one request's cap keeps its
marker (showing the remaining count) and fills in over repeated clicks instead
of stranding half-open. `gapBeforeHunk` replaced `hiddenLinesBeforeHunk` and
now returns both old- and new-side starts: the fetch needs the new side (the
file on disk), the rendered lines need the old side to number like any other
context line.

Deliberately **opt-in**: `DiffResultView`'s `projectPath` is optional, and
`pendingVersions` — which shows a *saved commit's* diff — does not pass it. The
file on disk may no longer match what that version recorded, so there the
markers stay plain captions rather than offering lines that could be wrong.

**The header-band mismatch (measured, not reasoned).** After the toolbar fix
below, the user reported the two panels' rules still sat apart. Arithmetic said
they matched, so the harness settled it: injecting the real markup into the
running dev server (which already has `styles.css` loaded) and measuring
`getBoundingClientRect` showed left 117px vs right 113px. Two unrelated causes,
neither guessable:

1. `.changes-file-list` is a `<nav>`, and the global `nav { display: grid;
   gap: 6px }` rule's gap survives its override to `display: flex` — silently
   adding 6px between every strip in that column, which the diff panel (a
   plain `<div>`) never had. Fixed with an explicit `gap: 0`.
2. `.changes-diff__step` was 26px, making it the tallest child of the right
   header and pushing that strip to 59px against the left's 57px. The strip's
   content box is exactly 57 − 32px padding − 1px border = 24px, so the
   buttons are now 24px and it lands on 57 by construction.

Both dividers then measured identical (57.8px and 110.8px in both panels).

A third case turned up while verifying: a **renamed** file's "Renamed from …"
line grew the right header to 73px. It moved inline into the title row
(truncating, with the full value on its tooltip) so the header stays one line
whatever the file is — re-measured at 57px against the left's 57px.

**The 1px strip mismatch.** Both toolbar strips had `min-height: 52px` while
their natural height was 53px (34px control + 2×9px padding + 1px border).
As flex items in a column whose other child is a scroller, whichever side was
under shrink pressure settled at the 52px floor while its partner kept 53 —
the two rules landing one pixel apart. Fixed by making the token exactly 53px
and applying it as a fixed `height` with `flex: 0 0 auto`. The two *header*
strips had the same latent bug; they keep `min-height` (a long wrapped path
must still be able to grow them) but gained `flex-shrink: 0` so nothing can
push them shorter.

## Final review pass

A read-through of the whole diff after the user validated the screen. Five
things were fixed; all five were invisible in normal use, which is why the
manual validation had not surfaced them.

1. **Stale expansion could inject one file's lines into another.** A
   `read_file_lines` response landing after the user moved to the next file
   would re-populate the expansion map that the file-change effect had just
   cleared, rendering the old file's lines as context in the new file's diff —
   indistinguishable from real content. The request now captures its path and
   the response is dropped if it no longer matches.
2. **Expanding a gap yanked the scroll away.** The scroll effect depended on
   `hunkStartRows`, which changes whenever rows are inserted — so opening a
   gap re-ran it and jumped back to the last change the toolbar pointed at,
   the opposite of what someone who just asked to read those lines wants.
   The row map is now read through a ref; only a new navigation token or a
   view-mode switch scrolls.
3. **`read_file_lines` could be walked out of the repository by a symlink.**
   `validate_repo_relative_path` works on the string alone, and unlike
   `read_file_diff` this command does not re-validate against `git status`
   (it runs on a click and cannot afford a Git process). It now canonicalizes
   both the root and the target and checks containment. Test added, skipping
   itself where the platform refuses to create a symlink.
4. **The line totals could silently understate.** A truncated or `too-large`
   diff contributed a floor rather than a count, so the subtitle would read
   as exact while being low. `sumCachedDiffLines` now returns `null` for those
   the same way it does for a not-yet-cached file — binary and unchanged files
   still count as the genuine zero they are.
5. **"File 0 of 3".** A search can narrow the list without changing the
   selection, leaving the open file outside it. The counter is now hidden in
   that state; the arrows stay (disabled) so the control doesn't flicker while
   typing.

Also removed two i18n keys (`changesSplitOldColumnLabel`/`NewColumnLabel`)
added in round one for split-view column headers that were never built, and
corrected two Rust doc comments that described UI behavior the frontend does
not actually implement.

Known, deliberate leftovers:

- Popup dismissal logic exists twice: `useDismissablePopup` in
  `branchesPanel.tsx` and an equivalent effect in `DiffViewSelector` and
  the Overview branch picker. With three call sites it is now worth lifting
  into a shared module; out of scope for a screen rework.
- `FileLines.truncated` is returned but unused by this screen, which derives
  what is left from the gap size instead. Kept so the response is
  self-describing for a caller that asks for a range in one go.

# Validation

```
npx tsc -b --pretty false   # clean
npx vitest run              # 16 files, 203 tests passed (37 new)
npx vite build              # clean
cargo test                  # 180 passed (5 new)
cargo clippy                # no warnings
```

**Formatting incident worth recording:** running bare `npx prettier --write`
on `src/changes.tsx` reformatted the entire file — the repo has no prettier
config, so it defaulted to an 80-column print width against a codebase
hand-formatted at ~120. The reformat was reverted (re-run at
`--print-width 120`, then the ~10 remaining formatting-only hunks in
untouched code restored by hand); the final diff contains only real changes.
Do not run prettier on this repo without `--print-width 120`, and prefer not
running it at all — even at 120 it disagrees with the hand formatting in
about a dozen places per large file.

Note on the typecheck command: the root `tsconfig.json` is a solution file
(`"files": []` plus project references), so `tsc --noEmit -p tsconfig.json`
silently checks nothing. `tsc -b` (what `pnpm typecheck` runs) is the real
one — it caught three `projectSessions.test.ts` call sites that the new
required `checkedAt` action field broke.

The user validated the finished screen in the running app.

Note for future CSS work here: the browser preview at `localhost:1420` cannot
open a project (no Tauri `invoke` bridge), but it *does* load the real
`styles.css` — injecting the panel markup into that page and reading
`getBoundingClientRect` is a reliable way to measure layout without the
desktop app. That is what finally located the header mismatch after
hand-arithmetic had twice concluded, wrongly, that the two panels already
matched.
