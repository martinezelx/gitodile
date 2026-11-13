---
id: 054
title: Make Changes readable, copyable, and safely discardable
status: done
priority: high
type: feature
areas:
  - frontend
  - rust
  - ux
  - recovery
  - performance
created: 2026-08-13
completed: 2026-08-13
---

# Goal

Finish the Changes screen as a comfortable review-and-correct workspace:
source text can be selected and copied through the familiar desktop context
menu, code is easier to read and receives restrained language-aware syntax
coloring, and the user can discard one file or every unsaved change without
GitOdile hiding the consequences or leaving the work unrecoverable.

# User outcome

- A user can select code in a diff, right-click, choose **Copy**, and paste the
  expected source text without line-number or UI noise. The standard
  `Ctrl+C`/`Cmd+C` path works too.
- A user can discard the selected file's changes or all changes shown by the
  current working-tree snapshot, after reviewing exactly what will be
  replaced or removed.
- A mistaken discard can be recovered through GitOdile, including after the
  app is restarted, rather than depending on filesystem luck or Git expertise.
- Diffs feel closer to a good editor: the code face is friendlier and more
  legible, while supported languages receive useful syntax color without
  competing with the added/removed meaning of the diff.

# Context

Tasks 009 and 035 established the current two-panel Changes screen, bounded
typed diffs, virtualized file/diff rows, unified/split/accessible views, and
pixel-aligned header and toolbar strips. Task 048 moved the reusable renderer
to `features/changes/DiffResultView.tsx`. This task must extend those contracts,
not replace the screen or make it denser.

Copy is currently blocked by the application-wide
`contextmenu.preventDefault()` in `src/bootstrap.tsx`. The visual diff content
is selectable in principle, but the blanket blocker removes the familiar
desktop action and the row DOM also contains line numbers, signs, and
screen-reader labels that must not leak into copied source text.

Discard is a **destructive local mutation**. Changes may be unstaged, staged,
mixed, untracked, deleted, renamed, conflicted, or on an unborn branch. A
shortcut such as `reset --hard`, `clean -fd`, or an unplanned `git restore`
would violate the repository safety rules and can permanently lose data. The
operation therefore needs the same plan/revalidate/execute/verify discipline
as existing mutations, plus a persistent recovery snapshot created before any
working file or index entry changes.

GitButler is a bounded conceptual reference only: its public recovery guidance
describes taking a project snapshot before potentially data-changing
operations, and its discard UI/CLI confirms destructive local work. Its
repository is Fair Source and expressly unsuitable as implementation source
for a competitor, so GitOdile must reuse only that high-level principle and
write an independent, substantially smaller design:

- <https://docs.gitbutler.com/troubleshooting/recovering-stuff>
- <https://docs.gitbutler.com/gitbutler-tui>
- <https://github.com/gitbutlerapp/gitbutler/blob/master/LICENSE.md>

# Experience specification

## Keep the screen calm

- Keep Refresh and Save selected as the only full-size header actions.
- Add one compact, keyboard-reachable overflow trigger to the existing header
  action group. Its app-styled menu contains explicit actions for **Discard
  changes in selected file...** and **Discard all changes...**; when a valid
  recovery exists it may also expose **Restore last discarded changes...**.
- Do not add a trash button to every file row, a permanent danger banner, a
  second toolbar, a language badge, font controls, or syntax-theme controls.
- Use the existing `app-menu`, modal, spacing, icon, focus, and semantic color
  patterns. Danger styling belongs to the destructive menu item and final
  confirmation action, not to the neutral overflow trigger.
- Preserve the paired file-list/diff header and toolbar heights at all widths.
- Right-clicking a file row exposes the same selected-file discard flow for
  that exact path. It is a contextual shortcut, not another visible row
  control; the header menu remains the keyboard-accessible route.

## Copy like a desktop editor

- Give the diff code region a small app-styled context menu containing only
  **Copy**. Do not expose WebView developer actions such as Inspect. Keep the
  global native-menu suppression for ordinary application chrome.
- Text selection, `Ctrl+C` on Windows/Linux, `Cmd+C` on macOS, and right-click
  Copy must agree. In unified and split visual modes, copied output contains
  the selected source text with its original whitespace and line breaks, but
  excludes line numbers, diff signs, hidden accessible labels, and other UI
  copy. The accessible plain-text mode intentionally keeps its documented
  `+`/`-` representation.
- Empty selections do not write an empty clipboard or show false success.
  Clipboard failures remain local, translated, and actionable.
- Selection and copy must remain safe for markup-like content, bidirectional
  text, unusual Unicode, tabs, very long lines, and virtualized rows.

## Discard with truthful consequences

- The selected-file action targets the exact selected repository-relative
  path from the current typed status. The all action targets the complete
  current status, not the current search results or Save selected checkboxes.
- Planning returns a typed operation plan with target, exact file count and
  categories, whether staged/index state is affected, whether untracked files
  will be removed from the project, conflicts/unborn-branch implications,
  risks, recovery description, and an opaque state token.
- The confirmation dialog leads with the human outcome: tracked content will
  return to the latest saved state; new untracked content will leave the
  project; staged and conflicted state may be replaced. Technical Git detail
  is progressively disclosed. The final control says **Discard file changes**
  or **Discard all changes**, never a vague Continue.
- Create and verify a persistent, repository-local recovery snapshot before
  touching the real index or working tree. It must retain enough information
  to restore file bytes, file modes/symlinks where supported, untracked files,
  deletions/renames, and the real index byte-for-byte, including staged and
  conflict stages. The snapshot must not modify the user's branch history,
  require Git identity, transmit data, or expose repository contents outside
  the repository's Git metadata.
- Add an ADR before implementing the snapshot format. It must define naming,
  collision handling, atomic publication, retention/cleanup, linked-worktree
  ownership, garbage-collection reachability, privacy, failure behavior, and
  how the future Recovery screen can discover the records. No recovery record
  may be deleted merely because an attempted discard or restore failed.
- Execution takes the session epoch and plan/state token, obtains the existing
  repository mutation lock, re-reads status under that lock, and aborts if the
  target or repository state changed. Never construct a shell string, broaden
  a pathspec, follow a symlink outside the worktree, recursively remove an
  unresolved directory, run `reset --hard`, run `clean`, or silently include a
  path absent from the confirmed plan.
- Discard handles tracked modified, staged-only, mixed, untracked, deleted,
  renamed, and conflicted entries, plus normal and unborn branches. Unsupported
  entries such as submodule mutations fail safely with an exact explanation;
  this task does not add submodule support.
- Verify the resulting status before reporting success. A failure before
  mutation leaves the repository untouched; a failure after mutation attempts
  automatic restoration from the just-created recovery and reports both the
  primary and restoration outcome truthfully.
- A successful discard invalidates the affected diff cache, supersedes stale
  reads, coalesces watcher work, and performs one shared follow-up refresh.
  Selection moves predictably when a file disappears and the change is
  announced without stealing focus.
- Offer a compact **Undo discard** action after success and keep the equivalent
  restore action discoverable from the overflow menu after restart. Restore
  revalidates the current repository before writing; if newer overlapping work
  makes automatic restore unsafe, it refuses, preserves the snapshot, and
  explains the recovery path instead of overwriting the new work.

## Friendlier code typography and restrained syntax color

- Bundle Atkinson Hyperlegible Mono Regular for diff code, with its license,
  a size-efficient web format, `font-display: swap`, and the existing system
  monospace stack as fallback. Apply it only to code/diff content, paths and
  technical identifiers that already use monospace; do not replace the app's
  system UI typeface.
- Keep current readable sizing as the starting point and visually verify long
  diffs at 100% and 200% text zoom. Re-run the virtualizer's wrap/row-height
  measurements because a font metric change can invalidate its estimates.
- Detect a language from the repository path (including common extensionless
  names such as `Dockerfile`) and tokenize only text/conflict diffs. Unsupported
  or ambiguous files render immediately as plain text; binary, too-large and
  unchanged states do not load a highlighter.
- Use a tokenizer that returns text/token data rendered as React text nodes.
  Do not use `dangerouslySetInnerHTML`, trust grammar output as HTML, or change
  the Rust diff contract merely to send highlighted markup.
- Load the tokenizer and only the required grammar lazily after a selected text
  diff is available. Cache by project session, working-tree snapshot, path,
  language and content; cancel or ignore stale work when selection/project
  changes. Highlighting is an enhancement and must never delay readable plain
  text, block navigation, or trigger repository reads while the screen is
  hidden.
- Define a small semantic palette (for example comments, strings, numbers,
  keywords, names/types) through theme-aware CSS tokens. Syntax color applies
  to code content; diff background, sign, line numbering and accessible labels
  continue to communicate addition/deletion independently. Both light and dark
  themes must meet the established contrast rules without imitating VS Code's
  entire palette or turning the diff into a rainbow.
- Preserve exact text selection/copy, unified/split alignment, wrapping,
  expanded gap lines, hunk navigation, accessible mode and virtualization.
  Token spans must not multiply the rendered-row budget or make screen readers
  announce token boundaries.

# Scope

- Scoped native/fallback context-menu and clipboard behavior for diff code.
- One screen-level overflow menu and complete plan/confirm/execute/verify/
  restore flows for selected-file and all-changes discard.
- Independent persistent recovery snapshots and the ADR that defines them.
- Typed Changes feature port/adapter/controller/domain changes and narrow Rust
  IPC/application-policy registrations for plan, execute and restore.
- Atkinson Hyperlegible Mono asset/license integration and diff typography.
- Lazy, path-aware syntax highlighting with light/dark semantic tokens.
- English and Spanish visible, accessible, confirmation, recovery and error
  copy.
- Automated frontend, Rust unit, temporary-repository integration, IPC
  contract, architecture, accessibility and performance coverage.
- README/architecture/design documentation updates only where delivered
  behavior or a durable rule changes.

# Out of scope

- Editing code inside GitOdile.
- Discarding individual hunks or selected branches.
- Staging/unstaging controls or changing Save selected semantics.
- A general application context-menu framework beyond the smallest reusable
  opt-in needed by selectable code.
- User-selectable fonts, font sizes, syntax themes, or editor settings.
- Highlighting binary/image previews, semantic language-server analysis, or
  guaranteeing every programming language in the first release.
- Building the full Recovery screen. The records and restore contract must be
  compatible with it, but this task exposes only the last relevant recovery
  through Changes.
- Submodule mutation support, conflict resolution, or arbitrary restore to a
  different saved version.

# Acceptance criteria

- [ ] Selecting diff text and using the scoped app context menu's Copy,
      `Ctrl+C`, or `Cmd+C` produces the same expected text; visual-mode copies
      exclude numbers/signs/hidden labels and preserve source whitespace.
- [ ] Context menus remain suppressed for ordinary app chrome and controls;
      only explicitly opted-in selectable regions receive contextual text
      actions, with keyboard and focus behavior verified.
- [ ] Clipboard failure, empty selection, unusual Unicode/paths/content and
      virtualized selection boundaries have explicit tested behavior in both
      locales.
- [ ] A single compact overflow menu exposes selected-file and all-changes
      discard without adding per-row destructive controls or disturbing the
      existing header/toolbar alignment at desktop, 1024px and 200% zoom.
- [ ] Rust returns structured, localized-ready discard plans whose exact
      target, categories, index/untracked/conflict consequences, risks,
      recovery and state token drive the confirmation dialog.
- [ ] No working-tree/index mutation occurs before explicit confirmation and a
      verified persistent recovery snapshot; the implementation never uses
      `reset --hard`, `clean`, a shell string, or an unresolved broad delete.
- [ ] Selected-file and all-changes discard work in temporary repositories for
      unstaged, staged-only, mixed, untracked, deleted, renamed, conflicted and
      unborn cases, preserving unrelated files and exact path semantics.
- [ ] Tests cover spaces, leading dashes, non-ASCII/bidirectional names,
      symlinks, file/directory transitions, linked worktrees, stale plans,
      concurrent mutation attempts, permission/lock failures and unsupported
      submodules without escaping or broadening the target.
- [ ] The recovery snapshot preserves file content/metadata and the real index
      byte-for-byte; Undo/restore works after app restart when state is still
      safe, and refuses without deleting the recovery when newer work overlaps.
- [ ] Failures before mutation are no-ops; injected failures during mutation
      exercise automatic recovery and accurately report whether restoration
      completed, while keeping recovery evidence on every failure path.
- [ ] After discard/restore, stale reads cannot repaint old content, watcher
      work is coalesced, caches are invalidated, one shared refresh establishes
      the final status, and selection/focus/live announcements remain coherent.
- [ ] Diff code uses the licensed, bundled Atkinson Hyperlegible Mono Regular
      with a system fallback, and visual QA confirms readable metrics in both
      themes at normal scale and 200% zoom.
- [ ] Supported paths receive language-appropriate token color after an
      immediate plain-text render; unsupported, failed or slow highlighting
      remains readable and does not surface as a repository error.
- [ ] Highlighted text is rendered without trusted HTML, remains inert and
      exactly copyable, and syntax colors preserve WCAG AA text contrast while
      additions/deletions remain understandable without color.
- [ ] Unified, split and accessible views, expanded gaps, long wrapped lines,
      hunk/file navigation and hidden-screen suspension continue to work with
      highlighting enabled and disabled.
- [ ] The highlighter/grammars are split from the entry and base Changes
      chunks and loaded per language. Build measurements are recorded against
      `docs/architecture/023-performance-baseline.md`; the entry/Changes
      budgets and static `fileIcons` rule remain green.
- [ ] The 5,000-change/large-diff fixture stays within the 300 rendered-diff-
      line warning and 500 failure limit, the 400 file-row failure limit, and
      records first-diff/highlighting timing so syntax work cannot freeze file
      switching or first readable content.
- [ ] All new visible and accessible copy exists in English and Spanish, all
      new controls are keyboard reachable with visible focus, dialogs trap and
      restore focus, and destructive meaning is not conveyed by color alone.
- [ ] The recovery-format ADR, IPC contract fixture, durable documentation and
      task notes match the delivered implementation, and `pnpm run check`
      passes.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/PRODUCT_STRATEGY.md`
- `docs/architecture/frontend-feature-guide.md`
- `docs/architecture/023-performance-baseline.md`
- `work/done/0.1.0/009-changes-and-diff-viewer.md`
- `work/done/0.1.0/035-changes-screen-rework.md`
- `work/done/0.1.0/048-split-the-diff-renderer-out-of-changespanel.md`
- `src/bootstrap.tsx`
- `src/features/changes/ChangesPanel.tsx`
- `src/features/changes/DiffResultView.tsx`
- `src/features/changes/changes.css`
- `src/features/changes/domain.ts`
- `src/features/changes/port.ts`
- `src/features/changes/controller.ts`
- `src/features/changes/tauriAdapter.ts`
- `src/features/changes/translations.ts`
- `src/features/repository/readCoordinator.ts`
- `src-tauri/src/changes.rs`
- `src-tauri/src/index.rs`
- `src-tauri/src/operation.rs`
- `src-tauri/src/repository_access.rs`
- `src-tauri/src/application.rs`
- `src-tauri/src/ipc.rs`
- `src-tauri/src/tests/changes_tests.rs`
- `src/ipcContract.test.ts`
- `src/changes.test.ts`
- `src/changesPanel.test.tsx`

# Dependencies

None. The recovery snapshot ADR is the first implementation deliverable and
must be accepted in the same task before destructive execution is added.

# Decisions

- Treat the request as one coherent Changes-screen task, not three unrelated
  backlog items: syntax spans affect copying, the font affects virtualization,
  and discard must integrate with the same selected-file/cache lifecycle.
- Use one overflow menu rather than extra full-size or per-row buttons. This
  keeps the existing screen hierarchy and makes destructive actions deliberate
  without making the common review/save workflow feel dangerous.
- “Discard all” means the complete current working-tree status, including
  staged, untracked and conflicted entries; it never means only filtered or
  Save-selected files. The confirmation must make those differences explicit.
- A confirmation without recovery is insufficient for GitOdile. Persistent
  recovery and a real restore path are part of the feature, not deferred UI
  polish.
- Atkinson Hyperlegible Mono is the chosen code face because its character
  differentiation and restrained forms serve readability and professional
  friendliness. Bundle only the required regular webfont and its license.
- Syntax highlighting is required where a language can be identified, but is
  progressive enhancement: plain text is always the immediate and reliable
  fallback. Keep the palette semantic and restrained rather than cloning an
  editor theme.
- Use GitButler only for the snapshot-before-mutation principle. Its Fair
  Source license rules out copying implementation, structure, or product copy.

# Implementation notes

Implemented through the Changes-owned port/controller/adapter plus the new
Rust `recovery` domain. ADR 0007 defines the persistent record under each
worktree Git directory. The record captures exact target bytes, symlinks,
file/directory transitions and the real index, publishes before mutation, and
retains the latest ten complete records. Restore is state-token guarded and
keeps its evidence after success or failure. Submodules and special filesystem
entries remain deliberately unsupported and fail before mutation.

Diff code uses a one-action app context menu while native WebView menus remain
suppressed, preventing developer actions from leaking into the product. File
rows use the same contextual surface to open the safe discard flow for the
exact right-clicked path. Atkinson Hyperlegible Mono Regular is bundled
as one 10.05 kB WOFF2 under the SIL OFL 1.1. The inert local lexer supports
JavaScript/TypeScript, JSON, CSS-family files, markup, Rust, Python, shells,
Markdown, Go, Java/Kotlin, C/C++/C#, PHP, Ruby, Swift, Dart, SQL, YAML, TOML and
Lua, including common extensionless build files. It is a 6.70 kB lazy
chunk, renders React text/token nodes only and falls back immediately to plain
text. The discard dialog is independently lazy at 5.92 kB, and the contextual
menu is interaction-loaded as its own 2.53 kB chunk.

The UI review kept Refresh and Save selected as the only full-width
header actions. Discard and restore live in one neutral overflow menu, with
danger reserved for the destructive menu entries and final confirmation.
Native Windows inspection at 1182×762 in dark theme confirmed the existing
paired headers, diff density, focusable controls and restrained color balance.
Exact bundle numbers are retained in
`docs/architecture/023-performance-baseline.md`.

# Validation

- `pnpm vitest run src/ipcContract.test.ts src/features/changes/controller.test.ts src/changes.test.ts src/changesPanel.test.tsx src/features/changes/syntaxHighlight.test.ts`: 75 passed.
- `cargo test --manifest-path src-tauri/Cargo.toml recovery_tests -- --nocapture`: 8 passed, covering all/selected discard, exact index recovery, stale plans, restart discovery, restore conflicts, unborn history, conflicts, rename/delete and file/directory transitions.
- `pnpm run check`: passed on Windows 2026-08-13; 34 frontend files / 271 tests, documentation and architecture guards, production build, Rust formatting, Clippy and 211 Rust tests.
- Production build: entry 270.56/80.67 kB raw/gzip; combined Changes renderer 69.62/20.87 kB (0.62 kB above the 69 kB warning); lazy context menu 2.53/1.17 kB; lazy syntax 6.70/2.62 kB; lazy discard 5.92/1.75 kB; font 10.05 kB WOFF2; deferred file icons 238.88/85.51 kB.
- Desktop visual QA: Windows, Tauri debug app, 1182×762, light theme, current dirty working tree. The file-row context menu was inspected in the native shell and contained only the exact file discard action. Native-menu suppression, exact Unicode copy, empty selections, fallback copy and exact right-clicked discard paths have focused DOM tests. The 200% zoom pass remains release-platform QA rather than a claim made by this Windows run.
