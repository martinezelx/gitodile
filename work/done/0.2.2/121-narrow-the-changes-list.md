---
id: 121
title: Narrow the Changes list
status: done
priority: normal
type: improvement
areas:
  - frontend
  - accessibility
created: 2026-09-08
completed: 2026-09-08
parent:
queue:
---

# Goal

Give the Changes file list the same narrowing History has: the search box gains a
filter panel, with the two questions this screen can actually answer — what kind
of change a file is, and whether it is going into the next saved version.

And stop the two screens writing that panel twice. History owns the whole visual
vocabulary of a filter today; Changes needs the same one, which is ADR 0003's
two-consumer bar met rather than guessed at.

# User outcome

A working tree of three hundred files stops being a wall. "Show me only the
conflicts", "hide the untracked noise", "what did I leave out of this version"
are one click each, and the answer is exact — the whole list is already in
memory, so nothing is approximate and nothing is read again.

Changes and History narrow the same way, with the same control in the same place,
so knowing one is knowing the other.

# Context

## What other clients do

Filtering the working directory is a long-standing *open* request in the clients
GitOdile is measured against, not a solved problem:

- GitHub Desktop has carried the request since 2018 —
  [#6407](https://github.com/desktop/desktop/issues/6407) and
  [#10752](https://github.com/desktop/desktop/issues/10752) — and the argument
  made there is precisely ours: the History tab already has a text filter, so
  the Changes tab should have one too.
- Sublime Merge has the same thread twice —
  [#417](https://github.com/sublimehq/sublime_merge/issues/417) and
  [#330](https://github.com/sublimehq/sublime_merge/issues/330) — where the
  complaint is asset-heavy repositories whose untracked list buries everything
  else.

Two things stand out. The requests are about *long lists*, which is a size
problem rather than a Git problem. And what is asked for is almost always a text
box; where a client answers at all, it answers with one. GitOdile already has the
text box. What it does not have is the narrowing that makes a long list
answerable by kind.

One asymmetry is worth naming: GitHub Desktop cannot offer a staged/unstaged
filter because it has no concept of a partially staged file — its checkbox *is*
the staging model. GitOdile does have that concept in its data. It still does not
get a filter here, for a reason of its own; see the decisions.

## What this screen can answer

`WorkingTreeEntry` carries `path`, `originalPath`, `category`, `isPrepared` and
`hasUnpreparedChanges`, and the screen holds `excludedPaths` — which files the
next saved version leaves out. Rust caps the list at 1,000 entries and the whole
of it is already in memory.

That last fact is the important one, and it is the opposite of History's
situation. In History a filter is an argument to the same `rev-list` that pages
the timeline, because a predicate over the loaded page stops telling the truth as
soon as the history is longer than the page. Here there is no page: the list is
the entire answer. A filter is a predicate over it, it needs no native read, and
it is exact. Nobody reading History's rules should carry them over here without
noticing the difference.

# Scope

- A filter panel on the Changes strip, in the search box's trailing slot, where
  History keeps its own.
- **Kind of change**: changed, new, deleted, renamed, conflicted. Multi-select,
  offering only the kinds the current working tree actually contains.
- **File type**: the extensions this working tree actually contains, most of
  them first, with the count each stands for. Added mid-task; see the decisions.
- Each multi-select points either way: show only what is chosen, or hide it.
  Added mid-task; see the decisions.
- **Will be saved**: any, yes, no.
- More on a file's right-click menu than discarding it: copy its path, and show
  it in the operating system's file manager. Added mid-task; see the decisions.
- Chips under the strip naming what is on, each removable, and a way to clear
  everything — the shape History already uses.
- Promote the filter surface and its vocabulary to `shared/ui`: the trigger with
  its count, the anchored panel, the capsule groups, the footer and the chips.
  History moves onto it; Changes is built on it.
- Both filters narrow only what is *shown*. The selection, the counts and what a
  save writes keep working off the whole list, exactly as the search box already
  does.

# Out of scope

- Any native read or Rust change **for the filters**. Everything they ask is
  answerable from what the screen already holds. The one Rust command this task
  did add belongs to the right-click menu, not to narrowing; see the decisions.
- Filtering by how much a file changed. Line counts need the diffs, and the
  screen reads those one file at a time on demand; a filter that reads three
  hundred diffs to answer a question about a list is not a filter.
- Filtering by the Git index — see the decisions.
- A folder filter — see the decisions.
- Any change to what a saved version contains. A filter narrows the view.

# Acceptance criteria

- [x] The Changes strip carries a filter control in the same slot, of the same
      shape, as History's.
- [x] Kind of change narrows the list, several kinds at once, and offers only the
      kinds present in the working tree.
- [x] File type narrows the list the same way, offering the extensions present
      with the count each stands for.
- [x] Each multi-select group can hide what it names instead of showing only it,
      and the chips say which direction is on.
- [x] A file's right-click menu offers its path, its place on the disk, and the
      discard it already had — the destructive one fenced off from the rest.
- [x] The inclusion filter narrows to what is included or to what is left out.
- [x] Active filters appear as chips under the strip, each removable, with one
      way to clear them all.
- [x] Filtering changes only what is listed: the selection, the counts, the
      select-all checkbox and the saved version are unaffected.
- [x] An empty result says so and offers to clear the filters.
- [x] File-to-file navigation walks the filtered list, as it already does for the
      search box.
- [x] The filter surface lives in `shared/ui` and both screens use it; neither
      keeps a private copy of the panel, the capsules or the chips.
- [x] Keyboard, focus restoration, `aria` state and EN/ES strings, as History's.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/changes/ChangesPanel.tsx`, `ChangesContextMenu.tsx`,
  `changes.css`, `translations.ts`, `port.ts`, `tauriAdapter.ts`, `controller.ts`
- `src/features/history/HistoryPanel.tsx`, `history.css`
- `src/shared/ui/` — the promoted surface, `index.ts`, `primitives.css`
- `src/architecture/styleComposition.test.ts` — the shape audit names the
  filter trigger by its current class
- `src-tauri/src/desktop.rs`, `ipc.rs`, `lib.rs`, `application.rs`,
  `tests/changes_tests.rs` — the reveal command and its policy
- `docs/architecture/025-ipc-contract.json`,
  `src/architecture/ipcContract.test.ts` — the contract the new command joins

# Dependencies

Tasks 118–120, which built History's filter panel and the vocabulary this
promotes.

# Decisions

**No filter on the Git index, though the data is there.** `isPrepared` and
`hasUnpreparedChanges` would make a "prepared / partly prepared / not prepared"
filter trivial, and it is the one filter GitHub Desktop structurally cannot
offer. It is still wrong here: no row on this screen says whether a file is
prepared. The screen's model is the checkbox — what goes into the next saved
version — and "prepared" appears only in the copy of the discard and restore
dialogs. A filter that narrows by something no row shows leaves the reader
looking at a list they cannot check. It becomes a good filter the day the row
states it, and not before.

**No folder filter.** The search box already matches the whole path, so typing
`src/app` is the folder filter, and a second control for the same question is a
second answer to maintain.

**A file-type filter after all, by extension and not by family.** Reopened
mid-task and built. The original decision deferred it because a "code /
pictures / documents" taxonomy is not something a filter should invent —
`shared/file-icons` maps an extension to *artwork*, never to a family, and
classifying ~150 extensions plus the whole-name files (`Dockerfile`, `LICENSE`,
`.gitignore`) is a decision that belongs to whoever owns the icon set. That
argument still stands, and it is exactly why this filter offers the raw
extension instead: `.png (236)` needs no taxonomy, no list to maintain, is exact
in any repository whatever it is written in, and names the thing the reader can
already see at the end of every row. `fileTypeKey` deliberately reuses
`getFileTypeIcon`'s own rule, so the filter and the icon can never disagree
about what a file is. If a family filter is ever wanted, this is the data it
would be built on.

**Each multi-select points either way.** The Sublime Merge complaint is about
*hiding* — the assets bury the code — and an include-only multi-select answers
it backwards: with twenty types in a tree, hiding one means choosing the other
nineteen. Three patterns were considered. An operator per filter ("is any of" /
"is none of") is what Airtable, Notion and Looker do, and it grows a dropdown on
every filter for a question most of them never ask. Negation inside the text
query (`-min.js`) is what Chrome DevTools, Gmail and GitHub search do, and it is
free but undiscoverable — nobody types a grammar nobody told them about. What
Chrome DevTools *also* does is the third: an Invert checkbox beside its
resource-type chips, in a developer tool, on exactly this kind of list. That is
the pattern taken, with one mode per group rather than one for the whole panel,
so "only the conflicts, without the snapshots" is still a question this panel
can ask. A mode is not counted on the trigger's badge: it changes what an answer
means rather than adding one.

**The menu closes on the press, before the file manager answers.** Found by
using it: pressing "Show in folder" left the menu on screen with its items
greyed for a moment, which reads as a freeze rather than as a wait. The cause
was this task's own first version, which disabled every item and held the menu
open until the promise settled — a progress report on something it cannot see
the end of. On Windows the call underneath is `SHOpenFolderAndSelectItems`
through `tauri-plugin-opener`, a synchronous shell call that answers when
Explorer is ready, so there is nothing here to make faster; there is only a
wait that should not have been shown. The press now closes the menu and the
screen behind it carries a dismissible notice if the window never appears.

Copying keeps the opposite behaviour, and the split is the rule rather than an
inconsistency: an action that finishes inside this app reports inside this app,
and an action whose result is another application's window dismisses the menu.

The Rust side was measured against this and left alone. `authorize_repository`
finds the repository context in its cache — the project is already open — and
takes a *read* lock, which only waits behind a mutation, so the common case adds
nothing worth removing.

**The right-click menu shows a file in the file manager; it does not open it.**
Revealing hands the operating system a path and nothing else. Opening would hand
it a file the *repository* chose, and a repository can contain an executable —
one click in a file list is not the place to decide to run something. Copy the
path, or reveal it and open it yourself.

`tauri-plugin-opener` exposes `reveal_item_in_dir` as a command whose permission
carries no scope, so allowing it in `capabilities/default.json` would let the
webview reveal any path on the machine — the same reason that file lists every
URL the app may open, one by one. The command is a narrow Rust one instead: the
frontend names a repository-relative path, Rust authorizes the repository,
resolves both ends and refuses anything that lands outside — the check
`read_file_lines` already makes, because a symlink committed inside a repository
passes a string check and still points elsewhere.

**The filter narrows the view and nothing else.** The search box already
established this — the selection, the counts and the save all read the full list
— and the same rule holds here, for the same reason: a file hidden by a filter is
still a file being saved, and a control that silently changed that would be the
worst kind of surprise.

# Implementation notes

`shared/ui/filterPanel.tsx` holds the surface: `FilterPanel` (the trigger with
its count, the anchored dialog, the footer), `FilterGroup`, `FilterCapsules` /
`FilterCapsule`, `FilterSwitch` and `FilterChips`. The groups inside a panel
arrive as children, because what there is to narrow is exactly what the two
screens do not have in common.

`FilterGroup` decides its own element rather than taking one: a label naming a
single control is a `<label htmlFor>`, a label naming a set of them is a
`<fieldset><legend>`. Passing `labelFor` is what says which, so neither caller
can announce a segmented choice as several unrelated controls by accident.

The panel is positioned against the strip that opens it, not against the
trigger, which is 24px wide and sits at one end of a search box. The host makes
its toolbar the containing block — History already did, and the Changes file
list's strip gained `position: relative` — and the panel then takes that strip's
own inset on both sides at every column width.

Deliberately no `overflow` on `.filter-panel`, though branches caps its own
private copy: History puts absolutely positioned lists inside this panel (the
branch picker, the two completion shortcuts) and a scroll container here would
clip them.

What stayed in `history.css` is what only History asks for: the completion
fields, the branch picker and the two ends of a date range. The scope chip
became the surface's `quiet` chip — a chip that states context rather than a
filter — rather than a History-specific modifier.

On the Changes side the kinds are switches rather than capsules: five of them,
each carrying the glyph its rows already use and the number of rows it stands
for, which is what turns "hide the untracked noise" into one informed click.

The inclusion question is asked as the question the row's checkbox answers —
"Will be saved: Any / Yes / No" — after a first pass labelled it "In the next
version" with "Everything / Included / Left out". That named the subject and
left the reader to supply the predicate, and the first reader who met it asked
what it filtered. The checkbox is the only place this screen states the fact, so
the filter now uses the checkbox's own words; the chips say the whole thing
("Will be saved", "Won't be saved") because a chip stands alone with no group
label above it.

The file-type group is the one part of the panel that grows with the repository,
so it is the one part that scrolls — the shared `.filter-panel` carries no
overflow because History nests popups inside it, and this panel nests none, so
it takes a cap of its own on top. Both numbers are measured against the smallest
window the app allows (620x900 in `tauri.conf.json`): the panel's top edge sits
105px down, and at that size it comes to 492px and ends 23px clear of the
bottom, scrolling its 550px of content inside itself.

`ChangesFilterMode` is two capsules per multi-select group, always drawn rather
than revealed once something is chosen: a control that appears under the pointer
moves the switch the reader was about to press next. The row carries its own
`aria-label` because a group's `<legend>` names everything under it, and a
second set of controls asking its own question has to say so.

It is not offered where no file can be left out. Past Rust's 1,000-entry cap the
checkboxes are disabled and the next version takes everything, so the question
has one true answer; the group is hidden and a setting made before the tree grew
that far is reset, the same shape as the vanished-kind rule above and as
History's `canFilterPublication`.
The kinds offered are counted over the loaded entries rather than over
`WorkingTreeStatus.counts`, because on a truncated tree the counts describe more
than a filter can narrow, and offering a kind that would empty the list is what
"only the kinds present" rules out. A kind the working tree stops having is
dropped from the filter in the same effect that prunes vanished paths from
`excludedPaths`, for the same reason: the panel offers only present kinds, so a
filter naming an absent one would be counted on the trigger and never found in
the panel.

One rule went back into the shared surface because of those two answers: a
one- or two-letter capsule came out 26px wide beside its own 26px height, and a
square with a pill radius is a circle — which DESIGN.md § Shape reserves for
atomic things with no reading direction, not for a segmented answer. Capsules on
a roomy row now hold a 44px floor. `--dense` is excluded on purpose: that
modifier exists for a row whose fit was counted in pixels, and a floor there
could break it.

`applyChangesFilters` reads `excludedPaths` and never writes it. The selection,
the counts, the select-all checkbox and what a save sends all keep working off
the full `entries`, exactly as the search box already established.

Three things a review pass over the finished diff found, all of the same
shape — a filter or a notice outliving the question it answered. A tree that
drops to a single file type now clears the type filter outright, because the
panel stops offering that question and a filter counted on the trigger would
have nowhere to be undone; that is the third instance of the rule already
written for a vanished kind and for the inclusion question past the cap. A
failed reveal's notice is cleared when the project changes, so a message about a
file in the project being left cannot sit over the one being opened. And the
reveal's promise takes the `void` the rest of this file gives a call it does not
await.

`reveal_project_file` lives in `desktop.rs` — talking to the OS shell is that
module's job — and delegates its two checks to the owners that already have
them: `application::authorize_repository` for the project, and
`changes::validate_repo_relative_path` plus a canonicalized containment check
for the path. Registering it caught a real mistake in review: it was first given
`no_process`, and the new Rust test failed with `GitCommandFailed` because
authorizing a repository spawns Git. It is a `read` policy, like every other
command that opens a repository.

The branches screen still keeps its own private copy of a filter panel
under its own class names. It is a third consumer worth folding onto this
surface, but it is outside this task's scope and its groups (sort, state,
prefix) are its own; the shape audit now names the shared surface, so the copy
is visible rather than forgotten.

# Validation

```bash
pnpm run check
```

Passed (exit 0): documentation over 185 Markdown files and 150 task ids, the
frontend architecture check over 353 modules, TypeScript, 800 frontend tests,
the production build, `cargo fmt --check`, Clippy, and 378 Rust tests. No Rust
changed.

Twenty-four new tests. Fourteen are pure: the active-filter count (each kind on its own, the
inclusion question once), the untouched list when nothing is on, several kinds
at once, both ends of the inclusion filter, the two questions applied together,
the kinds present in the order the list sorts by, that a mode is never counted,
that an empty selection narrows nothing in either direction, that hiding is the
complement of showing for both kinds and types, that every question composes
with each group pointing its own way, that a file type is read the way the icon
set reads it (`.TSX`, `a.tar.gz`, `Dockerfile`, `.gitignore`), and that the
types come back most-of-the-list first with the extensionless bucket last.
Seven drive the panel: only
the kinds this tree holds are offered ("Renamed" is absent) and two of them
narrow together with two chips and a badge that agrees; narrowing to what is
left out leaves "4 of 5 selected" and the select-all checkbox untouched; an
empty filtered list says why and its Clear all restores every row and removes
every chip; and one chip removes its own filter while the file arrows step the
narrowed list ("File 1 of 2"). Three cover a question the panel stops asking, and what happens
to an answer already given: on a truncated tree the kinds are still offered and
the inclusion question is not asked at all; a tree of one file type does not ask
about file type while still asking about kind; and a `.png` filter set while the
picture was there is gone from the badge and the chips once the tree is down to
`.txt`. Two
cover the file type: the panel lists `.txt` before `.png` and narrows to one,
and hiding `.png` leaves the other four files with a chip reading "Hiding .png"
whose remove button says "Show .png again". One covers both groups at once,
showing and hiding in the same panel, with the badge counting the answers and
never the modes. Four cover the right-click menu: the three items in order with
a separator before the destructive one and Copy path reaching the clipboard;
Show in folder disabled on a deleted file and Copy path still live; the menu
gone from the document while the reveal is still in flight, against a promise
the test holds open, with Rust asked for a repository-relative path; and the
failure landing on a dismissible `.changes-notice--error` on the screen the menu
has already left.

Two Rust tests cover the only half of `reveal_project_file` that can be tested
without opening a real file manager window, which is the half that matters:
`../outside.txt` and `/etc/passwd` are refused as `PathInvalid`, a path the
project does not have is `PathMissing`, and a symlink pointing out of the
repository is refused by the canonicalized containment check (skipped where
Windows will not grant the privilege to create one).

`styleComposition` now fails if either feature keeps a private copy of the
panel, the capsules or the chips, and names the shared trigger in the shape
audit. History's two existing filter assertions moved onto the shared class
names and still pass.

Rendered from fixtures in a throwaway Vite harness and looked at, in both
themes — first the two strips side by side, then the whole Changes screen on a
seventeen-file tree of six file types. The two strips carry the same trigger in
the same slot with its count and the panel spans each with equal insets; the
Changes panel reads "Tipo de cambio" (mode, then switch/glyph/count) over "Tipo
de archivo" (same shape, scrolling) over "Se guardará"; hiding `.png` drops the
three pictures from the list, leaves "17 de 17 seleccionados" untouched and
puts one "Ocultando .png" chip under the strip; and the right-click menu shows
Copiar ruta, Mostrar en la carpeta, a rule, and Descartar cambios in the danger
colour. Measured there too — at the real 320px column History's five date
capsules still come to one 26px row, which is what the dense padding exists for;
the short answers went from 26x26 to 44x26 once the floor landed; and the panel
fits the smallest allowed window with 23px to spare. The harness was deleted
afterwards.

Not verified in the running desktop app. The harness renders the real
`ChangesPanel` against a stub port, which covers everything the filters and the
menu's own behaviour do, but the one thing it cannot exercise is the end of
`reveal_project_file` — whether a file manager actually opens, on each of the
three platforms, and how long its shell call takes there. The greyed-menu fix
is proved by a test that holds the reveal unresolved and asserts the menu is
already gone, which is the guarantee that matters; what it does not measure is
the shell call itself. That needs `pnpm tauri dev` and a real project, and it is the
one claim in this record that rests on Rust tests and the plugin's contract
rather than on having seen it happen.
