---
id: 126
title: Work is one screen, with Changes and History as its two tabs
status: done
priority: normal
type: improvement
areas:
  - frontend
  - accessibility
created: 2026-09-21
completed: 2026-09-21
parent:
queue:
---

# Goal

Fold the Changes and History screens into one screen — **Work** in the rail,
`workbench` in the registry — switched by a pair of tabs at the head of the list
panel, the way GitHub Desktop heads its sidebar. The tabs take the row the two
screens' titles held; nothing else about either panel's shape changes.

# User outcome

What has changed and what has been saved are one place: a reader moves between
the file list and the timeline with one click on the panel they are already
looking at, and the rail has one destination for the loop instead of two
neighbours that had to be kept looking alike. Back and Forward still move
between screens; the tab is remembered per project, so leaving for Branches and
coming back lands on the tab that was open.

# Context

Tasks 112–125 gave the two screens one shape — one list column, one strip per
panel, one card header, one diff toolbar, one find — until the only thing that
told them apart was the rail entry and the word in the header. Two screens that
agree on everything are one screen with two views, and the header row each
panel already carries has room for the pair.

Constraints that shaped the decisions below:

- **The rail's width is a measurement, not a choice** (DESIGN.md § Navigation
  rail): 64px holds the widest destination label, "Overview", at 46px.
  "Workspace" measures ~54px in the rail's type and would break mid-word, and
  "workspace" is already the plain-language word for a branch in
  AGENTS.md's vocabulary table. The destination is **Work / Trabajo** (26px /
  37px); the registry id is `workbench`, the name the task series had been
  using for this pair of screens, and one that does not collide with the
  `.workspace` content region.
- **The header carried more than the title.** Changes' header held the
  include-everything checkbox and the state line (category breakdown, line
  totals, partial selection); History's held the scope chip. Two equal tabs fill
  the row. The checkbox moves to the head of the search strip; the state line
  goes (a first cut kept it in a row under the strip and it cost the list a
  file's height to say what the band and the status bar say); the scope chip
  moves to a row under History's search strip, drawn only off the current branch.
- **Nothing is counted twice** (DESIGN.md § Core screens): the Changes tab
  carries no count badge; the status bar and the Journey band already say it.
- **A screen that is not showing must be quiet** (frontend-feature-guide): the
  inactive tab keeps its DOM, hidden and inert, under its own lifecycle
  controller derived from the screen's, so it suspends polling and announcements
  exactly as a hidden screen does.

# Scope

Registry and shell:

- A `workbench` feature owns the screen: the module descriptor (label `Work`,
  the Changes glyph, preloads for both panels' chunks), the tab pair, and the
  per-tab keep-alive slots. `ProjectView` becomes `overview | workbench |
  branches`.
- Each project session remembers its tab. `navigateToView("changes")` and
  `("history")` become "open Work on this tab": the Journey band's tiles,
  Branches' "view on History", the notification's "review changes", the palette's
  `Go to Changes` / `Go to History`, and the sync dialog's hand-off all route
  through it.
- Stored navigation preferences migrate: `changes` becomes `workbench` in
  place and `history` drops out; the order that shipped with History under
  Changes joins the superseded-orders list.
- The contextual palette commands (`Refresh history`) key off the tab, not the
  view.

Tabs:

- A `tablist` of two `tab`s, each half the panel's width, at `--strip-height`,
  each its rail glyph (`GitCompare`, `GitCommitHorizontal`) and its word. The
  active one is in the primary colour, its glyph in the accent, with a 2px
  accent rule along the header's bottom edge; the inactive one in the
  secondary colour, same size and weight so nothing shifts on switch. Left/Right and Home/End move between them;
  the panel below is the `tabpanel`.
- One visually hidden `h1` names the active view; the panels' own `h1`s go.

Changes:

- The list panel's header is the tab pair. The include-everything checkbox
  heads the search strip at the rows' inset; the breakdown, the line totals and
  the "4 of 7 selected" line are removed with their strings, helpers and CSS.
- The discard/restore `⋯` leaves the search strip for the panel's foot, beside
  the save box (`.changes-file-list__foot`), and its menu opens upward.
- Nothing to review: the list panel keeps the tabs and says "Everything is
  saved" in a state row; the empty-state block (glyph, headline, the way back
  to Overview, "Restore discarded") moves into the diff panel. In one-column
  windows the two panels stack so the block stays reachable.
- Loading and the no-working-tree case keep the tabs visible.

History:

- The timeline panel's header is the tab pair. The scope chip moves to a state
  row under the search strip and is drawn only when the scope is not the
  current branch, so the timeline's first row does not move for the common case.
- The detail card's version strip becomes a fixed `--strip-height`: it was
  `min-height` plus padding, with the subject's `h2` still carrying the
  browser's bottom margin, so its rule sat ~20px below the timeline header's.
- The strip's facts line gains the publication chip (`Details`' own, at the
  ref badge's 17px), hidden when the state is unknown.
- Loading, error and "no saved versions yet" keep the timeline panel and its
  tabs, with the state block in the detail panel; one-column windows stack.

# Out of scope

- Any change to what either panel lists, filters, or shows in its diff.
- A count on the Changes tab.
- Back/Forward traversing tab switches.
- Renaming the Branches screen or moving it.

# Acceptance criteria

- [x] The rail shows Overview, Work, Branches, Recovery; Work opens on the
      project's remembered tab, Changes by default.
- [x] The tab pair is a keyboard-operable `tablist` at the head of the list
      panel, on both tabs and in every state of both panels (loading, error,
      empty, populated).
- [x] Switching tabs keeps both panels mounted; the hidden one is `hidden` and
      `inert`, its lifecycle is `hidden`, and it resumes on return.
- [x] Every former `navigateToView("changes" | "history")` caller lands on Work
      with the right tab, including the one-shot History scope/select intents
      from Branches.
- [x] Stored navigation preferences with `changes`/`history` adopt `workbench`
      in place; the superseded default order adopts the new default.
- [x] Changes' checkbox heads the search strip and History's scope chip has a
      row of its own; both list headers and the History version strip are
      `--strip-height`, so the two panels' first rules sit on one pixel row.
- [x] Both languages are complete; dead CSS, translation keys and screen
      modules are removed.
- [x] `pnpm run check` passes.

# Relevant files

- [`src/app/screens.tsx`](../../../src/app/screens.tsx)
- [`src/app/App.tsx`](../../../src/app/App.tsx)
- [`src/app/preferences.ts`](../../../src/app/preferences.ts)
- [`src/runtime/project/sessions.ts`](../../../src/runtime/project/sessions.ts)
- [`src/runtime/screen/module.tsx`](../../../src/runtime/screen/module.tsx)
- [`src/features/workbench/WorkbenchScreen.tsx`](../../../src/features/workbench/WorkbenchScreen.tsx)
- [`src/features/workbench/WorkbenchTabs.tsx`](../../../src/features/workbench/WorkbenchTabs.tsx)
- [`src/features/workbench/workbench.css`](../../../src/features/workbench/workbench.css)
- [`src/features/changes/ChangesPanel.tsx`](../../../src/features/changes/ChangesPanel.tsx)
- [`src/features/changes/changes.css`](../../../src/features/changes/changes.css)
- [`src/features/history/HistoryPanel.tsx`](../../../src/features/history/HistoryPanel.tsx)
- [`src/features/history/history.css`](../../../src/features/history/history.css)
- [`DESIGN.md`](../../../DESIGN.md)
- [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md)

# Dependencies

Builds on tasks 112–125, which made the two screens one shape.

# Decisions

- **Work, not Workspace.** The rail cannot hold "Workspace" without widening,
  and the word already means a branch in the product's vocabulary. The
  id is `workbench` for the same reason plus one: `.workspace` is the content
  region's class.
- **The tab is screen state, not a view.** One screen is one view: Back and
  Forward move between screens, as they do in GitHub Desktop, and the tab is
  session state a project keeps the way it keeps its selected file. A deep link
  from another screen sets the tab and navigates.
- **The panels keep their layouts; the workbench owns the tabs.** Rebuilding
  both screens into list/detail halves the workbench composes would have been
  the larger change for the same picture. Instead each panel takes the tab pair
  as its list header and renders it wherever it used to render its title —
  including the states that used to drop the panel altogether.
- **No counts between the strip and the files.** A first cut kept the
  breakdown, the totals and the partial selection in a state row under the
  search strip; on a real tree it read as a row taken from the files to say
  what the band, the status bar and the save box's plan already say. The
  checkbox alone heads the strip. The scope is different — it is the fact a
  reader checks before trusting the timeline, and it is only drawn when it is
  not the default — so it keeps a row.
- **Nested lifecycle, not a second host.** The inactive tab is the same problem
  as an inactive screen, so the runtime grows one slot that derives its
  controller from the screen's, and the workbench uses it twice.

# Implementation notes

**Runtime.** `KeepAliveViewSlot` in `src/runtime/screen/module.tsx` is the
per-view twin of `KeepAliveScreenSlot`: mount on first visit, `hidden` +
`inert` afterwards, the hidden element re-rendered by identity, and a
lifecycle controller derived from the surrounding screen's (`active` only
while the screen is active and the view is shown; evicted with the screen).
`ProjectView` is `overview | workbench | branches`; the session carries
`workbenchTab` and a `setWorkbenchTab` action.

**Feature.** `src/features/workbench/` owns the descriptor (`navWork`,
`commandGoWork`, the Changes glyph, `additionalPreloads` for both panels'
chunks), `WorkbenchTabs` (a roving-focus `tablist`) and `WorkbenchScreen`,
which takes `renderChanges(tabs)` / `renderHistory(tabs)` render props so the
panels' wiring stays in the composition root and the workbench never imports
another feature's internals. Each view sits in its own `Suspense` whose
fallback is the list panel's shell with the tabs in its header, so the pair
does not blink out while a chunk loads. `changes/screen.tsx` and
`history/screen.tsx` are lazy containers now (`ChangesPanel` +
`preloadChangesPanel`, `HistoryScreen` + `preloadHistoryScreen`) rather than
registry entries.

**Focus across the switch.** The pair is rendered once per view, inside that
view's header, and the view that held the pressed tab is hidden the moment the
tab changes. A change made from the tabs sets a flag; the visible copy's
effect — run on every render, because the copy inside a hidden view is
frozen and never saw the change — takes focus and clears it. A change from
elsewhere (a deep link, the palette) moves focus nowhere.

**Shell.** `openWorkbench(tab)` in `App.tsx` dispatches the tab and
navigates; every former `navigateToView("changes" | "history")` goes through
it. The palette lists `Go to Work`, `Go to Changes` and `Go to History`;
`Refresh history` keys off the tab. `.workspace--workbench` replaces the two
per-screen modifiers. Stored navigation preferences run through a merge map
before the unknown-id filter (`changes → workbench` in place, `history`
dropped), and the History-under-Changes default joins the superseded orders.

**Changes.** The list panel's header is `{tabs}`; the checkbox heads
`.changes-file-list__toolbar` before the search box, at the rows' inset. The
breakdown, the line totals and the selection line are gone with their
strings, `countDiffLines`/`sumCachedDiffLines` and the `.changes-view__*`
summary CSS. `.changes-file-list__state` remains for the two states with no
list — loading, and "Everything is saved". Nothing to review renders the
layout with `.changes-layout--state`: the list panel keeps the tabs and says
so in that row, and `.changes-diff--state` holds the empty block; the
one-column media query stacks the two. The panel's visually-hidden `h1` is
gone — the workbench renders one for the shown tab.

**History.** The timeline header is `{tabs}`; the scope chip moved to
`.history-timeline__state`, drawn only when the scope is not the current branch.
`.history-detail__strip` is `height: var(--strip-height)` with no vertical
padding and the title's margin reset; its facts line ends with the
`.history-publication` chip, sized to the ref badge by a strip-scoped rule.
The loading, error and no-versions returns render `.history-layout--state`
with the tabs in the timeline panel and the block in `.history-detail--state`.

**Verified by hand** in a throwaway Vite harness (removed afterwards)
rendering both panels from fixtures inside the shell's workspace box, dark
theme, at 1280, 1100 and 900px: both headers 52px on the same pixel row, and
the History version strip level with them (bottom edge at the same pixel, the
search strip and the diff toolbar under them at one height); the strip's
checkbox at the rows' inset (same x as a row's); the scope chip in its own
row; the clean, empty, loading and error states with the tabs in
place; the one-column stack at 900px.

**Follow-up.** The entry chunk grew 1.6 kB (580.8 → 582.4 kB minified: the
tabs, the slot and the strings). The 500 kB warning predates this task.

# Validation

- `pnpm run check:frontend` — architecture check (388 modules), `tsc -b`,
  **885 frontend tests** across 92 files, `vite build`.
- `pnpm run check:docs` — passes with the task in `done/`.
- `pnpm run check:rust` — `cargo fmt --check`, `cargo clippy -D warnings`,
  **411 Rust tests**. Rust changed only in the follow-up below.
- New tests: `KeepAliveViewSlot` (hidden view frozen, silent, resumed;
  hidden with its screen), `WorkbenchScreen` (tabs drawn by the view, hidden
  and inert sibling, keyboard shape with focus following the switch), the
  App-level keep-alive test now crosses the tabs, and the navigation
  preference migration.

# Follow-up in the same commit

The Work screen's own polish, plus two status-bar facts, are uncommitted
alongside this task and travel in the same commit. None of it changes the
screen structure above.

**Work rows arrive; they do not assemble.** `useRowArrival`
(`src/shared/ui/rowArrival.ts`, shared by Changes and History) animates only a
row that appears *while the screen is open*; the list the screen opens with is
readable at once. Changes reports every path it has not seen (`added`), since a
category re-sort can move a file anywhere; History reports only a commit
prepended above the row that used to be first (`prepended`), so loading an
older page is not mistaken for new work. Both reuse `.row-in` with a cap of
three, so a late arrival never waits on its list position; a virtualized row
mounted by a scroll is still never animated. Overview keeps its entrance
stagger on the sampled lists.

**The status bar carries the line totals.** `WorkingTreeStatus.lineTotals`
(Rust: `changes::working_tree_line_totals`, one `git diff --numstat` plus a
read of each untracked file; `null` whenever the count would be a floor rather
than the answer) renders as `+N −M` beside the changes count, in the diff's own
two inks, not selectable, with the tooltip and the screen-reader sentence
extended. The project's name dropped its text cursor and now wears the shared
tooltip (`Project: <name>`).

**The cloud is the shortcut to publishing.** When the relation is `ahead` and
current (not stale, failed or loading), the status bar's remote fact becomes a
button that opens the publish dialog through the app's existing
`openPublishDialog`; every other state keeps it a plain fact.

Added tests: `useRowArrival` (5), the Changes and History arrival rows, the
`workingTreeSnapshotsEqual` line-total case, the StatusBar publish action and
the line-total/project-tooltip rendering, and, in Rust, `parse_numstat` (2) plus
two `read_working_tree_status` integration tests.

