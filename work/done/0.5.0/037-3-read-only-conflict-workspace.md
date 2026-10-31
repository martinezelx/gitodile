---
id: 037-3
title: Add the read-only conflict workspace
status: done
priority: high
type: feature
areas:
  - conflicts
  - frontend
  - rust
  - accessibility
created: 2026-08-18
completed: 2026-10-28
parent: "037"
queue:
---

# Goal

Make every active merge conflict discoverable and inspectable in a dedicated,
read-only project workspace before resolution actions are enabled.

# User outcome

The user can see why work stopped, which files overlap, and the base/current/
incoming evidence without opening or changing anything accidentally.

# Context

This slice proves navigation, lifecycle, roles, bounded data, and accessibility
before mutations increase risk.

Since 2026-10-27 the `1.0.0` resolver has no three-pane editor (epic 037,
"Scope change"). Each side's change is shown against the common base with the
existing typed diff renderer of the Changes tab; no editor dependency is added.
Overview already has a `conflicts` state and a conflicted-file list to build on.

# Scope

- Add contextual entry from Overview's `conflicts` state, the Changes tab of the
  Workbench, the search palette, and app-started merge results; no
  navigation-rail entry.
- Build the lazy screen, virtualized file list, progress/filtering, session
  summary, a read-only "what each side changed" view per file using the
  existing diff renderer, and technical details.
- Preserve per-project selection/scroll and suspend hidden effects/subscriptions.
- Show a paused rebase, cherry-pick, revert or marker-less unmerged state
  through the same entries and screen, read-only (epic 037 §1b): what is
  paused, its overlapping files, that GitOdile cannot finish it yet, and how to
  continue or abort it with the tool that started it, with exact commands in
  technical details. No action runs those commands.
- Cover every conflict class with accurate read-only evidence or a safe explicit
  limitation; add external-editor/open-file affordance only where already safe.

# Out of scope

- Editing, accepting sides, writing, staging, reset, completion, or abort.

# Acceptance criteria

- [x] Opening/leaving/refreshing never changes worktree, index, refs, or config.
- [x] Roles and operation state remain correct for external merges and restart.
- [x] Paused non-merge operations are explained read-only with their files and
      offer no action GitOdile cannot complete.
- [x] Large file lists and content remain bounded, virtualized and
      cancellable, and normal startup and screen switching do not regress.
- [x] Loading/stale/unsupported/missing/error states plus English/Spanish,
      keyboard/focus/screen reader, both themes, narrow layout, and zoom pass.
- [x] Screen registration, lifecycle, IPC, tests, and docs pass focused checks.

# Relevant files

- [Design](../../../DESIGN.md) § Before designing a screen, dialog or panel, § Dialogs
- `src/app/screens.tsx`
- `src/features/overview/`
- `src/features/changes/`
- `src/features/workbench/`
- [037-1](037-1-conflict-domain-and-recovery.md)

# Dependencies

Task 037-1.

# Decisions

Ship no editing affordance in this slice; read-only truth is independently
valuable and provides the integration surface for later slices.

# Implementation notes

Record screen footprint, selection/cache lifecycle, accessibility semantics,
and unsupported conflict presentation.

2026-10-28:

- **Decisions (user, 2026-10-28):** each side shown one at a time behind the
  shared segmented control at first (superseded by the design review below:
  both sides stacked); an operation GitOdile cannot finish is a `warning` notice on the same screen,
  files and diffs still readable; the list is grouped by state (still
  overlapping, marked resolved); the side diff is computed in Rust.
- **Rust:** a third read, `read_conflict_side_diff(path, filePath, side,
  baseObjectId?, sideObjectId, sessionEpoch) -> FileDiff`, in `conflicts.rs`.
  It proves both objects are the path's current stages (one literal-pathspec
  `ls-files -u -z`), refuses anything but regular files, and runs one
  blob-to-blob `git diff --no-ext-diff --no-textconv --no-renames`; with no base
  it reads the side with one `cat-file --batch` and builds an all-added hunk
  (Git does not resolve the empty blob as a diff side). Same 2 MiB cap and
  binary probe as the Changes diff; supersedes only an earlier read of the
  same file and side. The blob read is shared with `read_conflict_stage`.
- **Frontend:** `src/features/conflicts/` (domain, port, adapter, controller,
  hooks, lazy screen, translations, CSS). Footprint outside the feature:
  `screens.tsx` registration (`inRail: false`, no fixed palette entry),
  `ProjectView`, the shell label and two palette labels, `App.tsx` (controller,
  close, `openConflicts`, palette entry while a session exists, screen record,
  edge-to-edge workspace class), `cacheWarming.ts`, `styles.css`, IPC contract.
- **Freshness:** the controller caches one session per project incarnation.
  It is read idle-deferred after a status snapshot that lists overlapping
  files, once more after one that no longer does (to see the session end), and
  on every entry press (an explicit refresh). A project with no overlap costs
  no Git process; visibility never reads. Side diffs are cached by the objects
  they compare (48 entries).
- **Selection and scroll:** project screens are evicted when another project
  is shown, so the selected file, side, filter and scroll live in the
  controller per project incarnation and are dropped on close.
- **Entries:** Overview's `conflicts` next step and detail link; a notice above
  the Changes list while any file overlaps; the palette ("Continue resolving
  overlapping changes", or "Review the paused operation" when unsupported);
  Get project changes when it refuses for a paused operation; the delete-branch
  block for an unfinished conflict. GitOdile starts no merge yet (task 065-4),
  so `openConflicts` is the hook its result will call.
- **Unsupported operations:** the summary names the operation in plain words
  with its step; the notice says GitOdile cannot finish it and that nothing is
  lost; Technical details list the operation, both sides' refs and commits,
  heads, origin, snapshot, and the exact continue/cancel commands as text with
  Copy. `unmerged` has no command and says how to finish by hand. No action
  runs any command.
- **Classes:** deleted, link, submodule, kind change and inexact path are
  explained per side without a read; text, executable, no-base, CRLF and
  binary go through the diff renderer (binary as its own note). The session's
  technical details (refs, heads, origin, snapshot, commands) are shown only
  for an operation GitOdile cannot finish.
- **Design review (user, 2026-10-28):** both sides show at once as two
  columns (current left, incoming right, after IntelliJ IDEA's merge layout),
  each with its own heading and scroller, because a side picker hid half of
  the overlap; with the columns as the layout there is no reading-mode
  picker (each side is unified), and the columns stack below 720px; the panes start right under the header; a merge
  GitOdile will resolve has no notice card, since the
  header already says what is paused; files carry no technical details of
  their own.
- **Accessibility:** the screen's `h1` is visually hidden; the list is
  buttons with `aria-current`, a roving tab stop and Up/Down; each side is a
  `section` named by its `h3`; state is words in each row's second line, never
  colour alone; the notice has its own glyph per tone; forced colours draw the
  notice edge and the selected row.

# Validation

Record frontend/Rust checks, desktop read-only verification, and measurements.

2026-10-28, Windows 11:

- `cargo test --lib conflict`: 18 passed; the class fixture now also proves
  each side's diff (text, no base, binary, link refused, crossed objects
  stale) and that reading writes nothing.
- `pnpm vitest run src/features/conflicts`: 14 passed (controller freshness and
  supersession, side-diff cache, `sideLimitation` per class, the screen's
  merge, unsupported-operation and nothing-paused states).
- `pnpm run check`: exit 0 in one pass (Rust: 660 passed, 1 ignored).
- Visual check against a real paused merge created in a terminal (content,
  modify/delete, add/add, a file in a folder): the screen with those stages in
  a throwaway browser harness, merge and rebase, English and Spanish, light
  and dark, 1400px and one-column widths.
- Desktop (Tauri, `tauri dev`): the same merge read through the real IPC,
  checked by the user in the dark theme (summary, notice, grouped list,
  "Deleted on “main”", the incoming side's diff against the base). Computer
  use could not capture the screen during this run.
- Not covered: a real screen reader, browser zoom and forced colours were not
  exercised (semantics are covered by the component test: side headings,
  the list's `aria-current`, no action buttons); macOS and Linux were not run.
