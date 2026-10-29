---
id: 037-6-3
title: Open overlapping files in the user's editor and block the hard classes
status: done
priority: high
type: feature
areas:
  - conflicts
  - frontend
  - rust
  - platform
created: 2026-10-29
completed: 2026-10-29
parent: "037-6"
queue:
---

# Goal

Open an overlapping file in the user's own application, reconcile what they
did there from fresh state, and give the classes no whole-file choice can
handle an explicit, safe block with a next step.

# User outcome

The user edits a file in their editor, comes back, and is told if conflict
markers remain; a folder in the way, a case-only collision or an unreadable
path explains what to do instead of failing.

# Context

Completes the parent [037-6](../0.5.0/037-6-resolve-files.md) after
[037-6-1](037-6-1-resolution-core.md) and
[037-6-2](037-6-2-resolution-actions-ui.md). Today only
`reveal_project_file` exists; nothing opens a file in an application.

# Scope

- `open_conflict_file(path, filePath)`: the system's default application for
  the file, behind the containment check of `reveal_project_file`; a type the
  system would run instead of open (Windows `PATHEXT` and shortcut types,
  macOS applications and `.command`, Linux executables and `.desktop`) is
  refused and offered Show in folder. Opening never changes a file's state.
- `check_conflict_working_file(path, filePath)`: a bounded read saying whether
  conflict markers remain, read after an invalidation shows the file edited.
- Blocks with a next step: a folder in the way, two paths that differ only by
  case where the file system cannot hold both (and a write-time check that the
  name on disk matches exactly), a non-UTF-8 path, a marker check that cannot
  be made (UTF-16, binary).
- The desktop pass of the whole parent: a real conflicted merge made in a
  terminal, each side kept, files opened in the editor, marked resolved and
  reset, in the light and dark themes.

# Out of scope

- Choosing an editor in Settings; finishing or aborting the merge.

# Acceptance criteria

- [x] Opening an editor never implies resolution; remaining markers are flagged.
- [x] Nothing the system would execute is opened.
- [x] Every class in epic 037 has a tested whole-file path or a deliberate,
      explained limitation.
- [x] Desktop validation in both themes is recorded; `pnpm run check` passes.

# Relevant files

- `src-tauri/src/desktop.rs`, `src-tauri/src/conflicts/`
- `src/features/conflicts/`

# Dependencies

Tasks 037-6-1 and 037-6-2.

# Decisions

See the parent's decisions of 2026-10-29.

# Implementation notes

2026-10-29:

- **Modules.** What neither mutates nor belongs to one action moved up into
  `conflicts/mod.rs`: `exact_working_path` (was `write_target` in
  `resolve.rs`), the marker scan (now with the reason it could not look:
  `binary`, `utf16`, `too-large`, `unreadable`), `ignores_case`,
  `case_collisions`, `open_conflict_file` and `check_conflict_working_file`.
  `desktop.rs` owns the platform rule (`runs_instead_of_opening`,
  `ensure_opens_as_document`) and the launch (`open_in_default_application`,
  which hands Windows the drive form of a verbatim `\\?\` path).
- **IPC.** `open_conflict_file(path, filePath, stateToken)` is a
  `repository_write` local mutation for one reason: it takes the session's
  snapshot before launching when there is none. Without it, an edit made in
  the editor before any GitOdile action could not be told from the merge's
  own content (no snapshot means no `editedOutside`) and would become the
  original that Reset returns to. It never touches the index or the file.
  `check_conflict_working_file(path, filePath)` is a read answering
  `{stateToken, markers}`. New error codes `conflict_case_collision` (also
  what a write over a name spelled differently on disk now returns, instead
  of `conflict_action_unavailable`) and `file_runs_as_program`, English and
  Spanish copy, IPC contract.
- **Refused types.** Windows: `PATHEXT` plus a fixed list (shortcuts,
  `.url`, installers, `.reg`, PowerShell, control-panel items, `.hta`, `.scr`,
  `.jar`, `.inf`, `.settingcontent-ms` and others), names compared without
  trailing dots and spaces, and any `:` (an alternate stream) refused. macOS:
  `.app`, `.command`, `.tool`, `.terminal`, `.workflow`, `.action`, packages,
  location files, `.jar`, and any file with an executable bit. Linux:
  `.desktop`, `.AppImage`, `.run`, `.jar`, and any executable bit.
- **Screen.** Open in editor sits between the side choices and `⋯`, takes
  no mutation slot and no refresh, and the bar then says the file is open.
  When a session read shows the file `editedOutside` and not exactly a kept
  side, the controller checks it once per state token and the bar says what
  the edit left. A folder in the way, a case-only twin and an inexact name get
  a `warning` notice with Show in folder (Open project folder for the last)
  and Read again.

**Class matrix** (epic 037 §2), what each gets and where it is tested
(`conflict_tests.rs` unless noted):

| Class | Whole-file path | Test |
| --- | --- | --- |
| Text both changed, add/add, CRLF, non-ASCII and spaced names | Keep either side, open in editor, mark, reset | `each_file_is_kept_marked_and_reset_exactly` |
| Modify/delete, delete/modify | Keep the surviving side or delete, mark, reset | same |
| Mode change | Keep a side, or mark an edit after naming the permission | same |
| Symbolic link | Keep a side (a file holding the target where links are off), then mark | same; real links only on macOS/Linux |
| Submodule | Side set in the index only, which marks it | same |
| Binary | Keep a side, open in its app; the marker check says it can't look | same; `a_working_file_is_checked…` |
| UTF-16 | As text, and the marker check says it can't look | `a_working_file_is_checked…` |
| Rename/rename, rename/delete | Per path, as its shapes (ADR 0041 §3) | `a_paused_merge_is_read_by_class…` |
| File/directory | Blocked: move the folder; Show in folder | `a_working_file_is_checked…` |
| Case-only collision | Blocked where the disk ignores case; every write and open proves the exact spelling | same (the collision half runs where the disk ignores case) |
| Name not valid UTF-8 | Blocked: resolve with Git; Open project folder | `a_working_file_is_checked…`; frontend `fileBlock` |
| Octopus, rebase, cherry-pick, revert, `am` | Explained, no action | `other_paused_operations…` |
| Runnable type | Not opened; Show in folder | `desktop::tests`, `a_working_file_is_checked…` (`.jar`) |

Deliberate limitations: a conflicted script with an executable bit on disk is
shown in its folder rather than opened on macOS and Linux; folders that
differ only by case and names that differ only by Unicode normalization are
not a facet, and are refused by the write-time spelling check instead; a
custom `conflict-marker-size` attribute is still not read.

# Validation

2026-10-29, Windows 11:

- `cargo test --lib conflict`: 23 passed, among them the new
  `a_working_file_is_checked_for_markers_and_blocked_classes_offer_nothing`
  (about 3.5 s alone: one synthetic merge walks every blocked class) and the
  class test's new side-diff assertion; `desktop::tests` passed.
- `pnpm vitest run src/features/conflicts`: 3 files, 43 tests, each under
  400 ms.
- Running app (`tauri dev`, WebView2 remote debugging), on a real merge made
  in a terminal with five overlaps (three text, modify/delete, `tool.bat`):
  opened `story.txt` in Notepad++ (the snapshot was taken first); saved it
  with markers left (the bar said one part is still marked, in the warning
  tone) and then without them; marked it resolved (stage 0). `tool.bat` was
  refused with nothing launched, and Show in folder opened Explorer. Kept
  “main” in `Thing.txt`, “feature” in `config.yml` and deleted `notes.md`,
  each asked in place with the other column dimmed; opening the kept
  `Thing.txt` and editing it cleared the kept side and checked it again;
  marked all three, then reset `Thing.txt` to its three stages and the
  merge's bytes. With `tool.bat` replaced by a folder, its notice offered
  Show in folder and Read again, and Reset kept the folder (overlap only).
  Dark and light themes, English and Spanish.
- Not run: macOS and Linux (the executable-bit refusal, a real disk that
  tells case apart), and a window narrower than the 1,180 px default
  (`SetWindowPos` did not reach the dev window this time; the bar's wrapping
  was checked at full width in Spanish, the longest labels).
- `pnpm run check`: exit 0 after the review (1,813 frontend tests; Rust 666
  passed, 1 ignored). The first run failed on one test,
  `src/architecture/ipcContract.test.ts`, whose own command list and count
  lacked the two new commands.

# Review

2026-10-29, a code review before closing found and fixed:

- A write over a name spelled differently on disk now fails as
  `conflict_case_collision`, which the bar offered to retry; it now reads
  the session again, as for an action the file no longer allows. Opening
  does the same for those two codes instead of saying it couldn't open.
- A marker check that failed left the bar on "checking…" for good; it now
  says GitOdile couldn't read the file, and Mark resolved still scans it.
- An opener failure (`path_unusable`) showed the shared "That folder can't be
  read" copy; it has its own sentence. The runnable-type message no longer
  repeats its notice's title.
- An empty status line still took its share of the bar, so in Spanish the
  buttons wrapped to the left; the line is left out when there is nothing to
  say, and the buttons keep to the right.
- Found in the desktop pass, from 037-6-2: a file marked resolved showed
  "these files changed" in both columns, since its side diff was checked
  against the index, which holds stage 0 by then. Its sides now come from the
  stages the snapshot records and pins (the class test asserts it).
- The case-collision facet asks the disk only when two names fold together.
