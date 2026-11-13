---
id: "010"
title: "Save the current work as a version"
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
created: 2026-07-27
completed: 2026-07-28
---

# 010 — Save the current work as a version

## Goal

Let the user turn all or a chosen set of current non-ignored project changes
into one local saved version, with a clear preview, explicit confirmation, and
no requirement to understand Git staging.

This is GitOdile's simple-mode commit flow. The primary wording is **Save
version**; the exact Git term **commit** may appear as secondary educational
context.

## User value

After reviewing the Changes screen, a user can:

1. choose **Save version**;
2. write a short description of what changed;
3. keep everything selected or choose which files will be included;
4. confirm the operation;
5. see that the work is saved locally and has not yet been published.

## Scope

### Entry point and interaction

- Add the primary **Save version** action to the Changes screen.
- Keep the action disabled when there is nothing to save, with an explanation.
- Open a confirmation surface that shows:
  - the editable, required version description;
  - the total number of files and counts by change category;
  - that every current non-ignored change will be included;
  - that this operation creates a local saved version only;
  - that nothing will be sent to a remote project.
- Select every changed file by default and allow the user to include/exclude
  complete files directly from the Changes list.
- Use human selection language, not staged/unstaged terminology. The file's
  product category and its inclusion in the next version are separate states.
- Keep file inspection independent from inclusion: opening a diff must not
  toggle whether the file will be saved.
- Cache inspected diffs in memory for the lifetime of the current project
  status snapshot, including sharing an already-running request when the user
  returns to a file before its first read completes.
- Invalidate the complete diff cache whenever the project or working-tree
  snapshot changes, including after refresh and successful save, so cached
  content can never cross a known state change.
- Avoid flashing a loading indicator for fast reads. Keep the diff area neutral
  briefly and show **Reading the difference…** only when the read remains
  pending long enough to be perceptible.
- Provide **Select all** and **Select none**, a selected/total summary, and a
  disabled save action with explanation when nothing is selected.
- When the status list is truncated, keep all changes selected and disable
  partial selection rather than pretending the visible subset is complete.
- The confirmation must state how many files will be saved and how many will
  remain pending.
- If selected changes were already prepared through another Git tool, explain
  contextually that GitOdile will save them with the chosen selection. Do not
  expose the index split in the ordinary file list.
- On success, refresh repository status and show:
  - the saved description;
  - the short commit identifier as secondary detail;
  - confirmation that the version exists locally;
  - a stable integration point for task 011's **Publish now** action.

### Planning contract

Expose a typed Rust planning command that returns a `SaveVersionPlan` containing
at least:

- operation kind: `history-mutation`;
- plain-language summary;
- ordered steps;
- risks and recovery information;
- `requiresConfirmation: true`;
- a state token representing the exact Git tree/content selected for saving,
  used to detect changes between preview and execution;
- current branch;
- whether this is the project's first version;
- selected and remaining file counts, counts by selected category, whether the
  operation is partial, and whether selected content was prepared externally.

The planner must detect and return structured, user-facing blockers for:

- a clean working tree;
- unresolved conflicts;
- detached `HEAD`;
- an in-progress merge, rebase, cherry-pick, revert, or bisect;
- missing Git author identity;
- invalid repository/path state;
- Git execution failures.

An unborn branch with changes is valid and must be handled as the first saved
version.

### Execution contract

Expose a narrow Rust execution command that accepts the confirmed description
and state token, then returns a `SaveVersionResult` containing at least:

- full and short commit identifier;
- saved description;
- branch name;
- number of saved files.

Execution must:

- revalidate the state token before mutating anything;
- reject an empty or whitespace-only description;
- include selected modified, added, untracked, renamed, copied, and deleted
  files, including both sides of a detected rename;
- continue respecting ignored files;
- invoke Git with separate arguments, never through a constructed shell string;
- run configured hooks and signing normally;
- never use `--no-verify`, disable signing, create an empty commit, or silently
  bypass repository policy;
- accurately surface hook, signing, identity, file-lock, and Git failures;
- leave working files untouched on failure;
- construct previews and exact state tokens through a temporary index so
  planning never mutates the real index;
- preserve the user's original index and restore it byte-for-byte if execution
  fails after the confirmed selection is copied into it;
- treat restoration as mandatory: if it fails, return a specific
  `IndexRestoreFailed` error, retain the backup, and explain that working files
  remain intact;
- resolve the index using `git rev-parse --git-path index`, including linked
  worktree layouts;
- refresh status after a successful save.

The implementation must not use reset, clean, checkout, or another operation
that could discard working-tree content as part of normal execution or
recovery.

On successful partial save, selected files become part of the new version and
unselected files remain ordinary pending changes. The real index must match the
new `HEAD`; GitOdile does not preserve an external tool's staged subset after a
successful save because the confirmed selection becomes the source of truth.

## Safety model

This is a **history mutation** and always requires preview and confirmation.

The new commit is additive. For an existing history, the prior `HEAD` and
reflog provide a recovery path; the UI should explain this without promising a
recovery workflow that does not yet exist. A first commit has no prior `HEAD`,
so the plan must describe that case honestly.

If project state changes after preview, execution must stop and ask the user to
review a fresh plan.

## States and UX copy

Cover at least:

- ready to save;
- first saved version;
- nothing to save;
- missing description;
- missing author identity;
- unresolved overlapping changes;
- Git operation already in progress;
- stale preview;
- no files selected;
- partial selection with remaining changes;
- externally prepared changes included in the selection;
- index restoration failure with retained recovery backup;
- hook or signing rejection;
- save in progress;
- successful local save;
- generic structured failure.

Keep consequences explicit: **saved locally** is not the same as **published**.

## Acceptance criteria

- [x] Every current non-ignored change is selected by default.
- [x] A user can save all changes or a chosen set of complete files from the
      Changes screen without learning staging terminology.
- [x] File inspection and save inclusion are independent interactions.
- [x] Revisiting a file in the unchanged working-tree snapshot reuses its diff
      without launching another Git read.
- [x] Concurrent reads for the same file are deduplicated; project/status
      changes invalidate cached and in-flight results.
- [x] Fast diff reads do not flash a spinner, while genuinely slow reads retain
      an accessible loading state.
- [x] Select all/none, selected counts, zero-selection, truncated-list, and
      remaining-change states are truthful and accessible.
- [x] The confirmation shows file counts, scope, description, and local-only
      consequences.
- [x] The description is required and passed safely to Git.
- [x] The planner classifies the action as a history mutation and always
      requires confirmation.
- [x] Clean, conflict, detached, operation-in-progress, identity, and invalid
      repository states return structured errors.
- [x] A first commit on an unborn branch works.
- [x] Selected tracked, untracked, renamed, copied, and deleted files are
      included; unselected files remain pending and ignored files stay out.
- [x] The state token changes when selected file content changes again even if
      its path/category/count do not.
- [x] A changed selected snapshot invalidates the plan before execution.
- [x] Hooks and signing are honored and their failures are surfaced accurately.
- [x] A failed attempt restores the original index and never changes working
      files; restoration failure is surfaced and retains its backup.
- [x] A successful result refreshes status and clearly says the version is
      local and not published.
- [x] The success state exposes a non-functional integration point that task
      011 can turn into **Publish now**.
- [x] Keyboard navigation, focus management, loading, error, and reduced-motion
      behavior are verified.
- [x] Spanish and English copy is complete and understandable without Git
      expertise.

## Required tests

### Rust unit tests

- Planner output for normal, first-version, and clean states.
- Blockers for conflicts, detached `HEAD`, operations in progress, and missing
  identity.
- State-token stability and invalidation.
- Selection validation, exact temporary-index tree IDs, rename expansion, and
  selected/remaining counts.
- Structured parsing of commit, hook, signing, and identity failures.
- Worktree-aware index path resolution.

### Rust integration tests

Use temporary repositories to cover:

- modified, added, untracked, renamed, and deleted files in one save;
- partial save leaves unselected files pending and the saved tree contains only
  the chosen files;
- a file with prepared and later unprepared edits is saved completely when
  selected;
- editing the same selected path after preview invalidates the token;
- ignored files remaining excluded;
- first commit;
- stale plan rejection;
- hook rejection;
- signing failure where practical without platform-specific assumptions;
- original index restoration after failure;
- explicit restoration failure and retained backup;
- byte-for-byte working-tree preservation on success and failure.

### Frontend tests and manual verification

- Plan rendering and file-count summary.
- Per-file selection, select all/none, zero selection, partial confirmation,
  externally prepared note, and truncated-list fallback.
- Required description validation.
- All loading, blocked, error, first-version, and success states.
- Keyboard-only completion and focus restoration.
- Diff cache reuse, in-flight request deduplication, cache invalidation after a
  new working-tree snapshot, and delayed loading feedback.
- Live desktop verification in light and dark themes.

## Out of scope

- Line/hunk-level partial saves.
- A staging/unstaging interface or staged/unstaged primary vocabulary.
- Amend, squash, rebase, or empty commits.
- Saving from detached `HEAD`.
- Publishing, fetching, pulling, or integrating remote changes.
- AI-generated descriptions.
- Automatic commit-message suggestions. ADR 0002 is proposed, not an accepted
  requirement; user-entered text remains the source of truth.
- Full history/timeline or recovery-center UI.

## Platform implications

- Resolve Git administrative paths instead of assuming `.git/index`.
- Expect Windows file locks and antivirus interference without risking working
  files.
- Allow normal credential, signing, and hook prompts/failures to surface
  consistently across Windows, macOS, and Linux.
- Preserve non-ASCII paths and descriptions.
- Do not introduce shell-specific quoting.

## Dependencies

- Task 007: structured working-tree status.
- Task 009: Changes screen and diff viewer.
- System Git and the repository's existing Git configuration.

## Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/adr/0002-heuristic-first-commit-and-branch-naming.md`
- `work/done/0.1.0/007-working-tree-status.md`
- `work/done/0.1.0/009-changes-and-diff-viewer.md`
- `src/changes.tsx`
- `src/repositoryOverview.ts`
- `src/appError.ts`
- `src/i18n.tsx`
- `src/saveVersion.ts`
- `src/saveVersionDialog.tsx`
- `src/modalFocus.ts`
- `src/testSetup.ts`
- `src-tauri/src/lib.rs`

## Implementation notes

- Simple mode keeps staged/unstaged as internal metadata. Every file is
  included by default; the user selects complete files without manipulating
  Git's index directly.
- Planning prepares the chosen snapshot in a temporary index and fingerprints
  its exact tree ID. This detects content changes at the same path even when
  category and counts stay unchanged.
- Confirmed execution copies the prepared temporary index into the real index
  immediately before `git commit`. A failed commit restores the original index
  byte-for-byte.
- Index restoration is no longer best effort. `IndexRestoreFailed` retains the
  backup and tells the user that working files remain intact.
- Successful partial saves leave unselected working files pending and the real
  index aligned with the new `HEAD`.
- Rename selections expand to both current and original paths.
- Partial selection is disabled for a truncated status list; saving everything
  remains available.
- File diffs are cached only in frontend memory and only for the exact
  `WorkingTreeStatus` snapshot that produced the list. Returning to an already
  inspected file is instant; refresh, save, or project changes replace the
  cache. Reads still pending after 140 ms show the existing accessible loading
  state, avoiding spinner flashes for fast local Git responses.

## Performance optimizations (extra, beyond original scope)

Not required by the acceptance criteria above, but done in response to
switching-between-files feeling slow next to other Git clients (Fork was the
comparison point) that hold the repository open via native bindings instead
of spawning a process per read. Layered on top of the diff cache already
described in "Implementation notes," from cheapest to most impactful:

1. **Adjacent-file prefetch.** Selecting a file also silently prefetches the
   diffs for the two files on each side of it in the ordered list
   (`PREFETCH_RADIUS` in `src/changes.tsx`), reusing the same cache and
   in-flight request map as the real selection (`fetchDiff`). This makes the
   common "review sequentially, click next" flow hit a warm cache on the
   very next click, at the cost of a couple of extra background Git process
   spawns. Silent and best-effort: a failed or slow prefetch is invisible
   unless the user actually selects that file, at which point the ordinary
   fetch path reports it normally.
2. **Batched whole-snapshot diff (`read_working_tree_diffs`, `src-tauri/src/lib.rs`).**
   The real cost of switching files was never the frontend cache or IPC — it
   was `read_file_diff` spawning at least two Git processes per click (a
   fresh status re-validation plus a dedicated `git diff` for that one path).
   Process-spawn overhead is comparatively expensive on Windows, which is
   most of why native-binding tools like Fork feel instantaneous by
   comparison. `read_working_tree_diffs` answers "the diff for every
   currently changed file" with one `git status` and, for ordinary tracked
   changes, exactly **one** more `git diff` process covering every changed
   file at once (split back into per-file sections positionally, using a
   `--name-only -z` pass for an unambiguous, quote-free ordering). Untracked
   files skip Git entirely — their diff is always "every line is an
   addition," read directly off disk. The frontend fires this once per
   working-tree snapshot to warm the cache immediately after the file list
   loads, so most clicks become pure cache hits.
   - It is a **read-only, best-effort supplement**, never a replacement: a
     conflict, a file whose section didn't fit before the combined output's
     (much higher) byte cap kicked in, or the call failing outright, all
     leave that path simply absent from the result. The existing per-file
     fetch (plus adjacent-file prefetch) fills in whatever the batch didn't
     cover, so this can only make things faster, never wrong.
   - Per-file classification (binary/too-large/unchanged/text) is shared
     between the single-file and batched paths through one function
     (`diff_result_from_text`) so the two can never disagree about how a
     file is classified.
3. **Virtualized diff line rendering (`DiffHunkList`, `src/changes.tsx`, using
   `@tanstack/react-virtual`).** Fetching became fast, but opening a large,
   heavily-changed file (this repository's own `src-tauri/src/lib.rs` is the
   stress test) still felt laggy — because every diff line is a DOM node, and
   the browser was laying out and painting all of them (thousands, for a
   file like that) just to show the first screenful. `DiffHunkList` now
   flattens all hunks into one row list (`flattenDiffRows`) and renders only
   the rows scrolled into view plus a small overscan buffer; the "N unchanged
   lines" marker between hunks became a row in that same flat list instead of
   a per-hunk DOM wrapper, with a `diff-row--hunk-start` class replacing the
   `.diff-hunk + .diff-hunk` sibling-selector border that nesting used to
   provide for free. Line rows have a uniform height (`.diff-line__content`
   never wraps), so this is a straightforward fixed-size virtualization case;
   `measureElement` still corrects the estimate per row rather than trusting
   a hardcoded pixel value.
   - Required making `.diff-code` itself the scrolling viewport
     (`.changes-diff__body` switched to `display: flex; flex-direction:
     column` with `.diff-code` as a `flex: 1; min-height: 0` child) — the
     virtualizer measures whatever element it's told is the scroll container,
     and that used to be `.changes-diff__body`, one level too high, so every
     row rendered anyway with nothing actually gated on scroll position.
   - Considered, and rejected for now, a GitButler-style "load the first N
     lines, click to load more" pagination instead. Real virtualization
     subsumes it: it renders the same handful of DOM nodes regardless of file
     size, needs no manual "load more" click, and lets the user scroll
     through the *entire* diff seamlessly — pagination would only be
     preferable if the *fetch* itself were the bottleneck for huge files,
     which it no longer is after optimization 2 above.
4. **Fewer Git processes per save-version plan/execution
   (`validate_and_prepare_save`, `src-tauri/src/lib.rs`).** Opening the
   dialog and confirming a save each ran the planner's full blocker check —
   status, an in-progress-operation check, HEAD resolution, identity, and
   building a temporary index to fingerprint — and execution ran it *twice*
   per save (once via a full call to the planning function, then
   independently again to get a fresh temporary index to actually use),
   because the two were never sharing state. That was roughly 10 Git
   process spawns to open the dialog and 17 more to confirm — the same
   per-process-spawn cost that made switching files slow, just in a
   different flow. Fixed without weakening the safety guarantee ("execution
   revalidates everything fresh, immediately before mutating," per
   `AGENTS.md`) by extracting one `validate_and_prepare_save` function that
   both the planner and the executor call exactly once each, plus three
   smaller redundancies within it:
   - `read_head_state`'s `git symbolic-ref` call was rederiving the branch
     name from scratch, when the status call the same function already made
     (`--branch`) already reports it (`# branch.head <name>` vs
     `"(detached)"`) — parsed into the exact same shape. Renamed to
     `resolve_head_state` and given the already-known branch instead.
   - `resolve_head_sha` ran `git rev-parse --verify HEAD` a second time just
     to read the same stdout `read_head_state` already had from running that
     identical command a moment earlier. Folded into one call.
   - `identity_configured` checked `user.name` and `user.email` as two
     separate `git config --get` calls; one `--get-regexp` call resolves
     both at once with the same effective-value precedence.
   - Net effect: opening the dialog dropped from ~10 Git processes to ~7;
     confirming a save from ~17 to ~10; a full open-then-save cycle from
     ~27 to ~17 — and the wasted *second* temporary-index build (3 of those
     spawns, pure duplication) is gone entirely.

**Two real bugs found and fixed while building this:**

- The batch effect originally combined a one-shot guard
  (`DiffStore.batchStarted`, so the whole snapshot's diff is only ever
  fetched once) with an effect-cleanup `cancelled` flag (the same pattern the
  per-file effect correctly uses to ignore a stale response). Under React's
  development-only StrictMode, an effect's synchronous mount → cleanup →
  mount on initial render cancelled the *first* invocation's response, while
  the one-shot guard then blocked the *second* mount from ever starting a
  real replacement — silently discarding the batch result forever, with
  every file quietly falling back to individual fetches (no visible error,
  just no speedup). Caught by manually driving the running app with a mocked
  Tauri backend and an artificial network delay, watching for cache hits by
  eye. Fixed by discarding a stale result based on **store identity**
  (`diffStoreRef.current !== store`, correctly ignoring a result that no
  longer applies to the current project/snapshot) instead of a
  **per-effect-invocation flag** (which doesn't survive intentional
  double-invocation). Worth remembering for any future one-shot-per-store
  effect in this codebase.
- The virtualizer's scroll container was one level too high (see above):
  every row rendered regardless of scroll position, silently defeating the
  entire optimization with no error of any kind — this one is easy to ship
  by accident since nothing looks wrong functionally, only slower than it
  should be. Caught by counting actual rendered `.diff-row` elements against
  a synthetic ~900-line diff in the running app (915 rendered — everything —
  before the fix; ~35 after), not by unit tests, since jsdom has no real
  layout engine and needs its own stubs (`src/testSetup.ts`:
  `getBoundingClientRect`/`offsetHeight`/`clientHeight`, none of which jsdom
  implements meaningfully by default) before a virtualized list can be
  tested at all.

Optimization 4 (fewer Git processes per plan/save) changed no observable
behavior or public command contract, only how many Git processes it takes to
produce the same result — the existing Rust integration test suite already
exercises every blocker, the state-token staleness check, and both selection
modes through the consolidated `validate_and_prepare_save` path, and all 91
tests still pass unchanged. Process-spawn counts above are from re-reading
the code path, not an automated counter.

## Validation in progress

- `pnpm run check:frontend` — pass, 6 test files / 44 tests, typecheck, and
  production build.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — pass.
- `cargo test --manifest-path src-tauri/Cargo.toml` — pass, 91 tests.
- `git diff --check` — pass.
- Manual verification of the batched diff optimization: a mocked Tauri
  backend with an artificial per-call delay, driven through the running app
  (not just unit tests), confirmed `read_working_tree_diffs` fires exactly
  once per snapshot and that files never touched by adjacent-file prefetch
  still render instantly (no loading spinner) once the batch resolves.
- Manual verification of the virtualized diff list: a synthetic ~900-line,
  15-hunk diff (mimicking `src-tauri/src/lib.rs`) driven through the running
  app confirmed only ~35 `.diff-row` elements are ever mounted (not 915),
  that scrolling to an arbitrary offset renders the correct lines for that
  position, and that the hunk-start separator only appears where a hunk
  boundary actually is.
- UI detector over the changed frontend surface — no findings.
- Live Tauri review in the current light theme — selection remains independent
  from diff inspection; the selected count, checkboxes, select-all/none
  controls, and partial-save confirmation are coherent. The dialog was
  cancelled without creating a version.
