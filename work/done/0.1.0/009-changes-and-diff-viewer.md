---
id: 009
title: Review changed files and their differences
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
created: 2026-07-26
completed: 2026-07-27
---

# Goal

Give the opened project a real Changes screen where users can inspect every
changed file and understand the exact lines that differ from the latest saved
version, without modifying the repository.

# User outcome

After GitOdile reports unsaved work, a user can open “Changes”, choose a file,
and review what was added, removed, renamed, deleted, or left in conflict before
deciding whether to save a version.

# Context

Task 007 added a typed working-tree status containing aggregate counts and up
to 1,000 per-file entries. The Overview now knows truthfully whether the project
is clean or needs attention, but “Review changes” and the Changes navigation
entry remain disabled because there is no destination for that action.

This task turns that status contract into the next read-only vertical slice. It
must not expose raw `git diff` text to React or turn the file list into a
staging interface. The product model is “review what changed”; the index and
working-tree split remains secondary technical detail until the save-version
flow defines how changes are selected and saved.

Diffs are repository content and must be treated as untrusted data. Paths may
contain spaces, quotes, non-ASCII characters, newlines, leading dashes, or
directional text. Git output may be very large, binary, malformed, or changed
again while the user is reviewing it. Rust owns command construction, path
validation, parsing, size limits, and structured errors.

# Scope

- Add a real Changes route/view inside the existing application shell.
- Enable the Changes sidebar entry and the Overview’s “Review changes” action
  only while a project is open; both navigate to the same screen.
- Use the task-007 working-tree result as the source for the file list,
  including its exact counts, categories, rename origins, and `truncated`
  signal.
- Group or filter the list in plain language by needs-attention, edited, new,
  deleted, and renamed states without presenting staging as the primary model.
- Select a sensible first file when the list becomes available, while
  preserving the current selection across refreshes when that path still
  exists.
- Add a narrow Rust command that reads one selected file’s combined difference
  from the latest saved version and returns a typed result.
- Validate the selected repository-relative path in Rust. Reject absolute
  paths, parent traversal, paths outside the opened worktree, and entries that
  are not part of the freshly read working-tree status. Pass paths to Git only
  as separate arguments after `--`; never construct a shell command.
- Compare the complete unsaved result with the latest saved version, including
  staged-only, unstaged-only, and mixed changes. Do not silently omit one side
  of Git’s index/working-tree model.
- Handle an unborn branch by comparing against an empty base rather than
  failing because `HEAD` does not exist.
- Render text differences as typed files, hunks, and lines with old/new line
  numbers and explicit context/addition/deletion kinds.
- Represent new, deleted, and renamed files accurately. A rename keeps both
  repository-relative paths and shows content changes when they exist.
- Represent binary or otherwise non-renderable content as an explicit typed
  state with useful metadata when available, never as garbled text.
- Represent conflicted files as needing attention. Show the current conflict
  markers/diff read-only when Git can provide a meaningful result; otherwise
  show an honest conflict-specific explanation rather than a generic empty
  diff.
- Fetch a diff only for the selected file and cancel or ignore stale responses
  when the user changes selection, closes the project, refreshes, or opens
  another project.
- Refresh the file list on entry and through a visible keyboard-reachable
  control, reusing task 007’s non-destructive refresh behaviour.
- Provide complete loading, clean, empty-after-refresh, truncated-list,
  binary, too-large, conflict, stale-result, and structured-error states.
- Localize all new visible and accessible copy in English and Spanish.
- Add Rust parser fixtures and temporary-repository integration tests, plus
  frontend tests for list/view state derivation and important interactions.

# Diff result contract

The Rust-to-frontend result should express product meaning rather than raw Git
output. Exact naming may follow the existing code conventions, but it must
carry at least:

```ts
type FileDiff =
  | {
      kind: "text";
      path: string;
      originalPath?: string;
      change: ChangeCategory;
      hunks: DiffHunk[];
      truncated: boolean;
    }
  | {
      kind: "binary";
      path: string;
      originalPath?: string;
      change: ChangeCategory;
    }
  | {
      kind: "too-large";
      path: string;
      originalPath?: string;
      change: ChangeCategory;
      limitBytes: number;
    }
  | {
      kind: "conflict";
      path: string;
      hunks: DiffHunk[];
      truncated: boolean;
      detail?: string;
    };

type DiffHunk = {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
};

type DiffLine = {
  kind: "context" | "addition" | "deletion";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
};
```

Headers and line contents are repository data, not trusted HTML. The renderer
must display them as text. If the implementation needs an additional
no-content-change state for mode-only or pure-rename changes, add it explicitly
rather than treating an empty hunk array as unexplained success.

# Experience specification

## Information hierarchy

1. **Page header**
   - Use “Changes” as the `h1`.
   - State the real total in plain language and distinguish conflicts from
     ordinary changes.
   - Provide a compact refresh action with visible busy and failure states.

2. **File list**
   - Show category, path, and rename origin when applicable.
   - Conflicted files appear first because they need attention; the remaining
     ordering must be stable and documented.
   - Category is communicated by text and icon as well as color.
   - Long and unusual paths remain distinguishable and expose their complete
     value accessibly.
   - If task 007 reports `truncated`, explain that the counts are exact but only
     the first bounded set of files can be reviewed here.

3. **Diff workspace**
   - The selected filename and category remain visible above the diff.
   - Use a solid `--surface-code` background and a monospaced font.
   - Additions, deletions, and context have distinct symbols/text structure;
     color is supportive, not the sole distinction.
   - Old and new line-number columns remain aligned and readable.
   - Horizontal scrolling is confined to the code viewport; the whole
     application must not acquire horizontal page scroll.

4. **Responsive behaviour**
   - At comfortable desktop widths, use a bounded file-list column beside the
     diff.
   - At approximately 1024px or high text zoom, allow a stacked or
     list/detail mode that preserves both file navigation and readable code.
   - Do not shrink paths, controls, or diff text until they are illegible.

# Required states

- **Clean project:** a positive empty state explains that everything is saved
  and links back to Overview; no empty diff shell is shown.
- **Loading list:** keep the shell stable, mark the region busy, and prevent
  duplicate refreshes.
- **Loading diff:** keep the selected file visible and show progress only in
  the detail region so the list remains usable.
- **Mixed changes:** every returned category can be selected and inspected.
- **Unborn branch:** new files can be reviewed as additions against an empty
  base.
- **Rename:** both old and new paths are clear, with hunks when content also
  changed.
- **Deleted file:** removed content is readable as deletions.
- **Binary file:** the interface explains that a text preview is unavailable.
- **Too-large diff:** the interface explains the configured safety limit and
  does not imply the file is unchanged.
- **Conflict:** the file is visibly marked as needing attention and the screen
  never claims it is an ordinary saved/unsaved edit.
- **Refresh changes the list:** preserve selection if possible; otherwise move
  predictably to the next available file and announce the material change.
- **Diff failure:** keep the file list and selection usable, show a localized
  actionable error in the detail region, and offer retry.
- **Project closes or changes:** discard prior list/diff state immediately and
  never render content from the previous project.
- **Unusual paths/content:** display as inert text without layout breakage,
  markup injection, path confusion, or command interpretation.

# Out of scope

- Staging, unstaging, checkboxes that imply staged selection, or exposing index
  state as the main interaction.
- Saving a version/creating a commit.
- Discarding, restoring, deleting, or editing files.
- Conflict resolution.
- Side-by-side diff mode, word-level highlighting, syntax highlighting, image
  previews, or an external diff tool.
- Ignored-file browsing.
- Line-ending-only diagnostics.
- Continuous repository watching. Refresh remains on entry and on demand.
- Diffing arbitrary commits, branches, tags, or two saved versions.
- Removing the task-007 entry cap or solving complete large-repository
  virtualization/performance. This task must remain responsive within the
  bounded contract; an end-to-end stress benchmark is deferred until the
  Changes and save-version workflow is complete.

# Acceptance criteria

- [x] Changes navigation and the Overview action open the real Changes screen
      for an opened project and are unavailable when no project is open.
- [x] The screen uses the typed task-007 status; it does not run Git or
      interpret raw status output in React.
- [x] The file list represents changed, new, deleted, renamed, and conflicted
      entries correctly, with conflicts prioritized and rename origins kept.
- [x] A typed Rust command returns a combined per-file diff relative to the
      latest saved version without using a shell.
- [x] Staged-only, unstaged-only, and mixed edits all show the complete
      resulting unsaved change rather than silently omitting content.
- [x] New files on both normal and unborn branches render as additions.
- [x] Deleted files render as deletions, and renamed files retain both paths.
- [x] Text diffs reach React as typed hunks/lines with correct old and new line
      numbers; raw patch text is not parsed in a visual component.
- [x] Binary, too-large, mode-only/pure-rename, conflicted, and empty-result
      cases have explicit honest states.
- [x] Repository paths are validated in Rust and passed after `--`; absolute,
      traversing, outside-worktree, and no-longer-changed paths are rejected
      with the structured `{ code, message, remediation }` error contract.
- [x] Diff output has documented byte/line limits. Hitting a limit returns an
      explicit typed `too-large` or `truncated` result without freezing or
      claiming the file is unchanged.
- [x] Selecting files loads only the current diff, and stale asynchronous
      responses cannot replace the current project or selection.
- [x] Refresh retains the last known list while loading, preserves selection
      when possible, reports stale data after failure, and announces material
      list changes accessibly without stealing focus.
- [x] Clean, loading, truncated, binary, too-large, conflict, stale, and error
      states are complete in English and Spanish.
- [x] File selection and refresh are fully keyboard reachable with visible
      focus, logical focus order, and an announced selected state.
- [x] Diff meaning is not conveyed by color alone; line signs, line numbers,
      labels, and accessible names preserve meaning in both themes.
- [x] The screen remains usable at approximately 1024px and 200% text zoom;
      any horizontal scrolling is confined to the diff viewport.
- [x] Rust parser fixtures cover multiple hunks, context/addition/deletion
      numbering, no-newline markers, rename metadata, binary output, malformed
      output, and configured truncation.
- [x] Temporary-repository tests cover clean, modified, staged-only, untracked,
      deleted, renamed, unborn, binary, and conflicted cases.
- [x] Frontend automated coverage follows the repository's current test
      architecture: pure ordering and selection behavior is unit-tested;
      rendering states and stale-response protection are verified by review
      and live use because no component-testing harness exists yet.
- [x] The required frontend and Rust checks pass.
- [x] The complete mixed-changes workflow has been exercised in the real
      desktop app; special Git states are covered by temporary-repository
      integration tests, and the user accepted the visual/state coverage for
      this read-only slice.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `work/done/0.1.0/001-open-local-repository.md`
- `work/done/0.1.0/007-working-tree-status.md`
- `src-tauri/src/lib.rs`
- `src/main.tsx`
- `src/repositoryOverview.ts`
- `src/i18n.tsx`
- `src/styles.css`

# Dependencies

- Task 001 provides the opened-project contract and application shell.
- Task 007 provides the typed working-tree status, categories, counts, entry
  cap, Overview action, and refresh behaviour.
- System Git remains the Git implementation.

# Decisions

- This is a read-only task. No control may imply that selecting a file stages,
  saves, discards, edits, or resolves it.
- Show the combined difference between the latest saved version and the current
  file result. The default user should not need to understand why a line happens
  to be staged or unstaged before reviewing what will need to be saved.
- Request one diff at a time. Returning patches for all files with the status
  would inflate the open/refresh payload and make cancellation and size limits
  harder to enforce.
- Parse Git output in Rust into typed hunks and lines. React owns presentation,
  selection, and localization, not Git patch grammar.
- Validate requested paths against a fresh status in Rust. A path originally
  supplied by the backend can become stale, and the frontend boundary remains
  untrusted.
- Keep explicit limits in the backend and surface them honestly. The exact
  limits should be chosen during implementation from measured normal cases and
  recorded here; they must be high enough for useful review and low enough to
  bound memory and bridge payloads.
- Conflict inspection is informational only. Resolution needs its own operation
  model and must not be smuggled into this screen.
- Do not adopt a diff library or virtualized-list dependency until the native
  Git output, typed parser, and bounded task-007 list demonstrate a concrete
  need.

# Platform implications

- Git is invoked with argument arrays and `--`, so Windows drive/path syntax
  and leading-dash filenames cannot become options or shell input.
- Preserve Git’s path bytes safely. If a path cannot be represented losslessly
  by the current Tauri JSON contract, return a structured unsupported-path
  diagnostic rather than selecting or opening the wrong file.
- Normalize display and validation deliberately; do not use case-sensitive
  string prefix checks as a substitute for filesystem containment on Windows
  or commonly case-insensitive macOS filesystems.
- Do not rely on `/dev/null` existing when producing new-file diffs. The Rust
  service must use a cross-platform Git strategy that works on Windows, macOS,
  and Linux.
- Line endings shown in the diff must follow Git’s comparison result. This task
  does not diagnose whether a change was caused only by normalization.

# Implementation notes

- `src-tauri/src/lib.rs`: added `read_file_diff(path, file_path)`, the
  `FileDiff`/`DiffHunk`/`DiffLine` types, a hand-written unified-diff parser
  (`parse_diff_body`/`parse_hunk_header`, no external diff/regex crate), and
  three `DiffStrategy` variants:
  - `AgainstBase`: `git diff --no-color --no-ext-diff <base> -- <path>`. This
    is the ordinary case (changed/deleted/staged-new files) and already shows
    the *combined* staged+unstaged change, because `git diff <base>` compares
    the worktree file directly to `<base>` regardless of the index.
  - `Untracked`: a truly-untracked new file has no entry in the index or
    `HEAD`, so `git diff HEAD` silently ignores it. Rather than relying on
    `/dev/null` (explicitly disallowed by this task's platform notes, and not
    reliable as a sentinel across platforms), a genuinely empty temporary file
    is written and diffed with `git diff --no-index -- <temp> <path>`, then
    removed. `--no-index` uses `diff`-style exit codes (0/1 = success, 2+ =
    error), handled separately from every other invocation's ordinary Git
    exit convention.
  - `Rename`: `git diff <base> -M -- <old> <new>`, restricting the pathspec to
    both sides so Git's rename pairing has both blobs to match against.
  - `base` is `HEAD` when it resolves, otherwise Git's well-known empty-tree
    hash (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`), so an unborn branch's
    files diff as additions instead of failing because `HEAD` doesn't exist.
- Path validation (`validate_repo_relative_path`) rejects empty/absolute/
  parent-traversal/drive-prefix paths before any lookup. The authoritative
  containment check is membership in a **freshly re-read** status
  (`find_status_entry`, sharing the exact record grammar `parse_status_porcelain_v2`
  uses via a new `parse_status_records` helper) — a path the frontend supplies
  is never trusted past that point, and a no-longer-changed path is rejected
  with `PathNotChanged` rather than silently diffing something stale.
- Limits: `MAX_DIFF_OUTPUT_BYTES = 2 MiB` (raw `git diff` stdout; over this
  returns `too-large` without parsing) and `MAX_DIFF_LINES = 5000` (parsed
  diff lines; over this returns `truncated: true` with the first 5000 lines).
  Both are conservative starting points chosen for normal reviewable diffs,
  not measured against a real large-repository corpus — `work/backlog.md`
  already defers that benchmark until the Changes/save-version workflow is
  complete, matching task 007's precedent.
- Conflicts are diffed with the same `AgainstBase` command (HEAD vs. the
  current worktree content, markers included) but wrapped in a `Conflict`
  variant instead of `Text`. If that diff can't be produced (base resolution
  fails, the command fails to run, or output exceeds the byte limit), the
  result is `Conflict` with `detail: "unavailable"` rather than a hard error —
  conflict inspection is informational only, per this task's decisions.
- A pure rename or mode-only change produces a `diff --git`/`similarity index`
  header with no `@@` hunks; an empty `hunks` array on `Text` would look like
  an unexplained parse failure, so that case is its own `Unchanged` variant.
- `src/changes.tsx` (new module, kept out of `main.tsx` as requested): mirrors
  the Rust `FileDiff` contract, exports the two pure list functions
  (`getOrderedChangeEntries`, `resolveSelectedPath`) and the `ChangesPanel`
  component tree. Ordering is conflicted-first via a rank lookup fed through
  `Array.prototype.sort` (stable per spec), so same-category entries keep the
  backend's order — documented in a code comment rather than left implicit.
  Selection is preserved across a refresh when the previously-selected path
  is still present, otherwise falls back to the first entry and announces the
  change via a visually-hidden `role="status"` region. Diff fetching uses a
  `cancelled`-flag `useEffect` keyed on `[projectPath, selectedPath,
  workingTree, retryToken]`, so a stale response from a superseded selection,
  a closed project, or a list refresh is discarded rather than applied.
- `src/appError.ts` (new module): the `AppError` type, `isAppError`, and
  `localizeAppError` were extracted out of `main.tsx` so `changes.tsx` (and
  any future view module) can localize command failures without importing the
  app shell — avoids a circular import between `main.tsx` and `changes.tsx`.
- `main.tsx`: `View` gained `"changes"`; the sidebar/compact-nav Changes entry
  is enabled only while a project is open (title changes to explain why when
  disabled) and the Overview's "Review changes" button now navigates instead
  of being permanently disabled. An effect redirects back to Overview if the
  project closes while the Changes screen is showing, so it never renders
  against a project that is no longer open.
- Responsive layout: `.changes-layout` is a two-column grid (file list +
  diff) above 1024px; a dedicated `@media (max-width: 1024px)` block collapses
  it to a single column toggled by a `.changes-layout--detail` modifier class,
  with `.changes-diff__back` as the way back to the list. The code viewport
  (`.diff-code`) is the only element with `overflow-x: auto`.
- Diff meaning is never color-only: addition/deletion lines keep their `+`/`-`
  sign as real text and carry a visually-hidden "Added:"/"Removed:" label.
- **Diff readability refinement:** the rendered diff uses one contextual line
  number instead of adjacent old/new columns, reducing duplicated visual noise
  for unchanged lines. Rust still returns both exact old/new numbers. Raw hunk
  headers are replaced in simple mode by localized markers such as “12
  unchanged lines”, derived from typed hunk ranges rather than patch text.
- **Layout revision (post-implementation, on user feedback):** the first pass
  stacked the file list above the diff at every width and printed the
  category as a visible word on every row ("Edited", "New", ...). Both were
  reworked: the file list is now a fixed-width column beside the diff at
  comfortable widths (matching GitHub Desktop/GitKraken/Sourcetree, and what
  this task's own experience spec already asked for — see "Responsive
  behaviour" below), collapsing to a list/detail toggle only below ~1024px.
  Each row now reads as two lines — file name, then the containing folder in
  muted text truncated from the *start* (showing the part nearest the file,
  like VS Code's breadcrumbs) — with the per-row category word dropped in
  favor of the icon alone, since the icons already use distinct shapes
  (pencil/plus/minus/arrows/triangle), not just color, so this still doesn't
  convey category by color alone. The category name is preserved as the
  accessible name (`aria-label`) and hover tooltip rather than always-visible
  text. The diff header above the selected file's content still shows the
  category as visible text, since there it appears once rather than once per
  row. Global custom scrollbars (`::-webkit-scrollbar`, matching the app's
  surface/text tokens) were added at the same time, requested independently
  of the layout change.
- **Shell-scroll fix (2026-07-27):** the Changes view now adds a
  `workspace--changes` modifier that disables the outer workspace's vertical
  overflow. The file list and diff already own their respective scrolling;
  leaving the shell scrollable too exposed a tiny WebView2 rounding range as a
  misleading third scrollbar at the far-right edge.
- Accepted deferrals at closure:
  - This repository has no component-testing setup (no `@testing-library/*`
    dependency, and no existing component test anywhere in `src/`) — only the
    two pure list functions in `changes.tsx` are unit-tested
    (`changes.test.ts`), matching the existing `repositoryOverview.test.ts`
    convention. Loading/error/typed-diff-state rendering, the clean empty
    state, the truncated-list notice, and stale-response cancellation are
    exercised by code review and manual use, not an automated test.
  - A separate component-testing harness was not introduced solely for this
    screen. If the frontend gains one later, clean/truncated/error rendering
    and stale-response cancellation are the first Changes cases to promote.
  - The exhaustive visual scenario matrix (every special Git state in every
    theme and zoom combination) is deferred until the save-version workflow
    creates a complete local workflow worth benchmarking end to end. Rust
    integration tests continue to own the Git-state matrix meanwhile.

## Review pass (2026-07-27)

- Fixed and verified the misleading outer scrollbar on the live Changes
  screen. The shell no longer scrolls in this view; the file list and diff
  retain their independent, content-backed scroll ranges.
- **Resolved — output bound:** diff commands now use capped pipe reading
  instead of `Command::output()`. Rust reads at most the configured limit plus
  one byte, drains stderr concurrently, kills Git immediately when the cap is
  crossed, and returns the explicit `too-large` result. A real temporary-repo
  test forces output beyond 2 MiB and verifies this path.
- **Resolved — path fidelity:** status records are decoded losslessly.
  Invalid UTF-8 no longer becomes replacement characters that could identify
  the wrong file; both status and diff commands return the structured
  `path_encoding_unsupported` diagnostic, localized in English and Spanish.
- **Resolved by product decision — visible category:** the user preferred the
  left file list to remain icon-led. A compact localized category chip now
  appears beside the selected path in the right-hand diff header, where the
  label is visible once without repeating it down every row. Icons, chip text,
  tooltip/accessibility copy, and color together communicate the state.
- **Resolved — root scrollbar:** the screenshot showed that the remaining bar
  belonged to the WebView document beside the native-looking window controls,
  not to `.workspace`. `html`, `body`, `#root`, and `.app-window` now use the
  exact WebView height with root overflow disabled; only the file list and diff
  viewport scroll. Verified live in both Overview and Changes.

# Validation

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — pass, no warnings.
- `cargo test --manifest-path src-tauri/Cargo.toml` — pass, 57 tests:
  parser/unit tests for hunk headers, diff-body parsing incl. multi-hunk,
  no-newline markers, truncation, and malformed headers; `build_text_result`/
  binary/too-large/unchanged unit tests; `find_status_entry` unit tests; and
  temporary-repository integration tests covering unstaged, staged, untracked
  new, staged new, deleted, renamed-with-content-change, pure rename, unborn
  branch, a real binary file, an out-of-status path, a traversal path, and a
  real merge conflict).
- `pnpm run check:frontend` (typecheck + vitest + build) — pass: 21 tests (8
  new in `changes.test.ts` covering entry ordering, category stability, and
  selection preservation/fallback/empty-list), build succeeds.
- Headless check only: opened the Vite dev server (no project open, no real
  Tauri bridge) in a browser tab — no console errors, Spanish locale resolved
  correctly, and the Changes nav entry renders disabled with "Cambios — Abre
  un proyecto primero" as expected.
- **Review validation (2026-07-27):**
  - live Tauri/WebView2 pass on the current mixed repository — outer scrollbar
    reproduced before the fix and absent after hot reload; file-list and diff
    scrolling remain available;
  - `pnpm run check:frontend` — pass, 3 test files / 21 tests and production
    build;
  - `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass;
  - `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
    --all-features -- -D warnings` — pass;
  - `cargo test --manifest-path src-tauri/Cargo.toml` — pass, 57 tests,
    including capped process output and unsupported path encoding;
  - UI detector over `src/main.tsx`, `src/styles.css`,
    `src/changes.tsx`, and `src/i18n.tsx` — no findings;
  - `git diff --check` — pass.

## Closure validation (2026-07-27)

- Re-reviewed the latest one-column line-number and plain-language hunk-marker
  refinements in the live Tauri app; file selection, typed diff rendering,
  category chip, independent scroll areas, and the root-scroll fix behave
  coherently.
- `pnpm run check:frontend` — pass, 3 files / 21 tests, typecheck, and
  production build.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — pass.
- `cargo test --manifest-path src-tauri/Cargo.toml` — pass, 57 tests.
- UI detector over the changed frontend surface — no findings.
- The user approved closing the read-only slice with component-harness and
  exhaustive visual-matrix work deferred as documented above.
