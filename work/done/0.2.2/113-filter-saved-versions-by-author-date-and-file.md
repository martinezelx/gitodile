---
id: 113
title: Filter saved versions by author, date, and file
status: done
priority: normal
type: feature
areas:
  - frontend
  - desktop
created: 2026-09-06
completed: 2026-09-06
parent:
queue:
---

# Goal

Let the History timeline answer the three questions every other Git client can
already answer and GitOdile could not: *who* changed this, *when* was it
changed, and *what happened to this file*. Deliver them as named filters in the
search strip the timeline already owns, backed by `git log` in Rust rather than
by predicates over the page that happens to be loaded.

# User outcome

Someone looking for a particular moment stops scrolling. "What did Ada do last
week", "when did this file last change", and "what have I saved since I last
published" become a click each instead of a read-through of several hundred
rows — and the answer covers the whole repository, not the first few hundred
versions the screen has in memory.

# Context

Task 112's follow-up work reshaped the History screen: the timeline is a panel
with one strip, the strip is the shared `SearchBox`, and the trailing slot of
that box holds the filters. Two filters were removed in the same pass and the
reasons shaped this task:

- **Order (newest/oldest first) was dropped.** No mainstream client offers it,
  and ours reversed only the loaded page — "oldest first" showed the oldest of
  the versions in memory, not the repository's first. Any filter added here had
  to avoid repeating that: a filter that reads only the loaded page is a filter
  that lies once the page is not the whole history, and it does so silently.
- **Publication collapsed to one switch** ("Not published yet"), shown only
  where an upstream exists. The three-way menu spent a control on `Unknown`,
  which is a statement about GitOdile's knowledge rather than about a version:
  without an upstream every version is unknown, with one none is.

What comparable clients offer, surveyed 2026-09-06:

| Client | Filters over commits |
| --- | --- |
| Sublime Merge | one search field with `author:`, `path:`, `file:`, `line:`, `from:`, `commit:`, `min-parents:`/`max-parents:`, combined with `and`/`or`/`()` |
| GitLens Commit Graph | search by `commit:`, `message:`, `author:`, `file:`, `change:`, plus `@me`; view filters for branch scope, remotes, stashes, tags, and dimming merges |
| Fork | author, date range, message, path |
| GitKraken Desktop | message, SHA, author |
| GitHub Desktop | none — open requests since 2017 |
| GitHub.com commits | author, date range, branch |

The common set is author, date, path, message, and whether a commit is a merge
— which is `git log`'s own vocabulary (`--author`, `--since`/`--until`,
`-- <path>`, `--grep`, `--no-merges`). GitOdile's publication switch has no
equivalent anywhere and stays: it answers "did this leave my machine", which is
this product's audience's question.

Two clients converge on typed operators in the search field. That is the right
*model* but the wrong default door for this audience — AGENTS.md principle 1
asks for human language by default and principle 4 for progressive disclosure.
So: named controls first, one query model underneath, and the operator syntax
left as a later advanced-mode surface over the same model.

# Scope

- Extend the history port and its Rust command to accept a filter set
  (`author`, `since`, `until`, `path`, `noMerges`, `unpublishedOnly`) and pass
  it to `rev-list`. Validate every input in Rust.
- Keep pagination correct under a filter: the cursor, `hasMore`, and the loaded
  count describe the filtered history.
- Replace the trailing switch with one filter trigger opening a panel holding
  the controls above.
- Empty state: when filters match nothing, offer to clear them.

# Out of scope

- Typed operator syntax (`author:`, `file:`) in the search box. It is the same
  model through a second door and belongs with advanced mode.
- Branch scoping ("this branch only" vs "all local branches").
- Full-text search of version *contents* (`git log -S`/`-G`).
- A calendar date picker. Named ranges first.

# Acceptance criteria

- [x] Author, date-range, path, hide-merges and unpublished filters narrow the
      timeline against the whole repository, not only the loaded page — covered
      by a Rust test that pages a filtered history one row at a time and finds
      a match that is not on the first page.
- [x] Every filter maps to a `rev-list` argument built and validated in Rust;
      no filter is implemented as a client-side predicate over loaded rows.
- [x] Loading more under an active filter continues the filtered history and
      the count text stays truthful.
- [x] Every active filter is reachable from one trigger that reports how many
      are on, and the empty result offers to clear them.
- [x] The filter panel is operable by keyboard, each control is named for
      assistive technology, and an active filter is not distinguishable by
      colour alone.
- [x] `pnpm run check:frontend`, `pnpm run check:docs`, and the Rust
      `fmt`/`clippy`/`test` suite pass.

# Relevant files

- `src-tauri/src/history.rs`
- `src-tauri/src/ipc.rs`
- `src-tauri/src/tests/history_tests.rs`
- `src/features/history/HistoryPanel.tsx`
- `src/features/history/history.css`
- `src/features/history/controller.ts`
- `src/features/history/port.ts`
- `src/features/history/domain.ts`
- `src/features/history/tauriAdapter.ts`

# Dependencies

Task 114, which put the strip this builds on in place and moved the search box
to a shared primitive. The two were implemented in the same sitting; 114 is the
structure and this is the filtering that hangs off it.

# Decisions

- **Named controls rather than a query syntax**, for the reason in Context. The
  panel and the operators are two doors onto one filter model, and only the
  first door was built.
- **Filters run in Rust.** The dropped ordering control is the cautionary case:
  a control that operates on the loaded page silently stops telling the truth
  the moment the history is longer than the page.
- **One trigger with a count, not a chip per filter.** The plan called for each
  active filter to render as a removable chip inside the search pill. Built
  that way for the publication switch first, it was wrong: the chip printed its
  label into a strip that is ~300px wide in the two-column layout, and the cost
  grows with the number of filters. The trigger now says *how many* are on and
  the panel says which — the only arrangement whose width does not depend on
  how many filters exist.
- **Publication is offered only against an upstream.** Without one every
  version reads `Unknown`, so the switch could only ever empty the list. In
  Rust the same case is treated as inert rather than as an error, because the
  screen already carries a notice saying the upstream is unknown.
- **Per-commit publication classification under a filter.** The existing
  windowed walk (`read_local_only_commits`) assumes the page is the next
  `page_size` commits in order, which a filtered page is not. Filtered pages
  classify with `rev-list --no-walk <page commits> --not <upstream>`, bounded by
  the page rather than by the length of the branch. Unfiltered pages keep the
  windowed walk, so the existing cursor arithmetic is untouched.

# Implementation notes

`HistoryFilters` is deserialised by `read_history_page` and prepared by
`prepare_filters`, which trims, bounds and rejects control characters, requires
dates to be `YYYY-MM-DD` (Git's own date parser accepts relative phrasing that
would mean different things on different days), and runs the path through the
existing `validate_repo_relative_path`. Each field becomes one owned argv
string, so `read_graph_page` builds its argument vector by borrowing rather
than reformatting. The pathspec goes last, behind `--`, so it can never be read
as an option.

On the client, `filters` live in `HistoryState` rather than in the screen,
because they decide which history the loaded pages describe. `setFilters`
releases the in-flight requests, retires the page cursor and re-reads page one;
setting the same filters is not a question and does not read.

Two real bugs surfaced during verification. The first: applying a filter briefly published
`versions: []`, which hit `HistoryPanel`'s "No saved versions yet" early
return. That is a fact about the repository, not about the filter, and it was
swallowing the whole screen — filter panel included — on every change. It is
now conditioned on no filters being active, and a list waiting for Rust shows a
loading bar rather than an empty state.

The second was reported after the first pass shipped: applying a filter felt
slow, the screen appeared to reload, and an error banner offering "try again"
appeared intermittently. Three causes, compounding:

- **A page request carrying the wrong cursor.** Clearing the version list left
  it with no last row, and a `lastIndex` of `-1` satisfies the timeline's "near
  the end, fetch more" rule. That fired a second read immediately, using the
  cursor from the *previous* question with the *new* filters — an offset
  counted through one history applied to another. On a repository with more
  than one page it is the extra request, the wrong rows, and the stale-cursor
  error path all at once. `setFilters` now retires `nextCursor` and `hasMore`,
  and the timeline will not page while the first page of a new question is in
  flight.
- **A blank-and-refill.** The rows now stay until the new answer lands, with a
  progress thread under the strip and `aria-busy` on the list saying they are
  being replaced.
- **A needless detail read.** Clearing the selection dropped a version that had
  not gone anywhere — the list narrowed, not the repository — and cost two
  round trips to put a new one back. The selection stays, and its detail comes
  from the cache.

Measured in the harness afterwards: applying a filter is one `readPage` and
nothing else, where it had been a page read, a cursor read and a detail read.

A fourth, reported last and the same class as the first: Clear all took the
whole screen down when the filter being cleared had matched nothing. The
screen-level "No saved versions yet" was already guarded against active
filters, but on Clear all the filters are off *before* the new page lands, and
the empty list still on screen is the retired question's answer. It now also
requires that no read is in flight, and `setFilters` sets `isLoading` in its own
publish rather than leaving it to `refreshInternal` a line later — React
coalesces the pair today, but the state between them should be truthful without
depending on that.

A third, reported before it: the card on the right still tore down and rebuilt
on every filter change. Two places emptied it for a question that had not
changed — `refreshInternal` published `detail: EMPTY_DETAIL, fileDiff:
EMPTY_DIFF` on every page, and `loadDetail`'s cached path dropped the file diff
and read it again even when the same file was still open under the same
snapshot. Both now keep what they hold when the snapshot token and the
selection are unchanged. Sampled in the DOM every 16ms across a filter change:
the card, the diff and the selection never disappear, and the only read is the
page. The guard is a controller test that collects every published state rather
than the settled one, because the tear-down was a single frame.

A dim over the outgoing rows was written and then removed: the rule matched in
the CSSOM but never took effect on the computed style, and an unverified signal
is worse than none. `aria-busy` and the progress thread are what ship.

Four faults of one shape — state emptied for a question that had not changed —
were enough to go looking for the rest rather than wait for a fifth. A sweep of
every `publish` in the controller found one more and one near-miss:

- **The "selection removed" announcement was retracted before it could be
  read.** `loadDetail`'s success path cleared `selectionRemoved`, and the only
  thing that sets it is the fallback that then immediately loads the
  replacement's detail — so a `role="status"` message was published and undone
  within one round trip. Loading the replacement is the *completion* of the
  move the message describes, not an acknowledgement of it. It now stands until
  the next version is chosen, which is what `selectVersion` was always for.
- **`loadDetail`'s two branches disagreed about which file a version opens
  on.** The read validates the open path against the version's own files; the
  cached branch took `?? files[0]`, which keeps a path the detail may not
  contain. They agree now — but no caller reaches that branch with a stale
  path, so this is an alignment, not a fix, and it carries no test on purpose:
  one would pass either way.

A closing review of the whole change found three more, two of them reachable:

- **A name box was a regular-expression box.** Git reads `--author` as a regex,
  so `a[` typed into the author field is an invalid expression and fails the
  read with exit 128 — the screen could only report it as "Git couldn't read
  this part of the saved-version history". `--fixed-strings` makes it the
  substring match the field looks like, and `--regexp-ignore-case` makes
  "ada" find "Ada Lovelace", which is what someone who does not know Git will
  expect of a name box.
- **A read coalesced across generations could strand the pane waiting on it.**
  `loadDetail` and `loadFileDiff` returned any in-flight request for the same
  key. A request started before the generation moved publishes nothing when it
  lands, so a caller handed that promise waits for an answer that never comes:
  change a filter while a version's detail is still loading and the card falls
  to its empty state and stays there until another version is clicked. The
  in-flight maps carry their generation now, and coalescing only happens
  within one.
- **The badge and the chips could have disagreed.** `countActiveFilters`
  counted six fields and the chip list described five — `until` has no control
  of its own yet. Unreachable today, but the invariant that the two read one
  description was written down and was false; the chips describe all six now.


Everything else in the controller already guards its resets —
`selectVersion`, `selectFile` and `setScrollOffset` return early when nothing
changed, and every publish inside `loadFileDiff` is conditioned on the commit
and file still being the open ones. `supersede` publishes unconditionally, but
what it changes is the generation, which is the whole point of the call.

Follow-ups this leaves open:

- **"Only mine".** The most-requested filter in every client surveyed. It needs
  the repository's configured identity, which lives behind the project-settings
  feature's port; the author field takes free text with completions drawn from
  the loaded versions in the meantime.
- **The search box is still a client-side find** over the rows on screen,
  matching subject, description, author, short commit and reference names. That
  is deliberately a different thing from the filters and is unchanged by this
  task, but it is the one control on the screen that still narrows only what is
  loaded. Moving it to `--grep` would make it message-only, which is a change
  in meaning and wants its own task.

# Validation

- `pnpm run check:docs` — passed (177 Markdown files, 142 task ids).
- `pnpm run check:frontend` — passed (architecture check over 346 modules,
  `tsc -b`, 701 tests in 73 files, production build). Six of those cover the
  fixes reported after the first pass: the controller retires the cursor when
  the filters change, so `loadMore` is a no-op until the fresh answer brings
  its own; and the open saved version survives a filter change untouched. The
  second was checked against its own absence — reverted, it fails. The third
  holds both halves of the screen-level empty state: a filtered list that
  matched nothing, and an empty list with a read in flight, are neither of them
  a statement that the repository has no saved versions. The fourth is from
  the controller sweep: the removed-selection announcement outlives the read
  that replaces it. Each was checked against its own absence — reverted, each
  fails.
- `cargo fmt -- --check` — failed first, then `cargo fmt` applied; clean after.
- `cargo clippy --all-targets --all-features -- -D warnings` — passed.
- `cargo test --all-targets --all-features` — passed, 359 tests, including five
  new history tests: filters narrowing the whole history across pages, the
  unpublished filter agreeing with per-commit publication classification,
  filter validation refusing malformed dates/paths/authors, and date and merge
  filters narrowing the timeline, and an author filter treating regex
  metacharacters as text rather than failing the read.
- Driven by hand in a throwaway Vite harness against a fake port: the panel
  stays open across successive changes, the trigger's count follows, the header
  count follows, and a filter matching nothing shows the no-matches state with
  its clear action. After the pagination fix the harness counted the reads a
  filter change costs — one `readPage`, no detail read, no cursor read — and
  confirmed the rows stay on screen with `aria-busy` set and the progress
  thread showing. Harness removed afterwards.
