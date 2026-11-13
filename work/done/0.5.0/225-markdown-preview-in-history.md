---
id: 225
title: Offer the Markdown preview in History
status: done
priority: normal
type: feature
areas:
  - frontend
  - backend
  - docs
created: 2026-11-03
completed: 2026-11-04
parent:
queue:
---

# Goal

A Markdown file in a saved version opens as a document, as it does in Changes.

# User outcome

Selecting a `.md` in a version's files shows the whole document with what that
version changed, compared with the version before it, instead of only the text
diff.

# Context

`DESIGN.md` deferred this deliberately. On 2026-11-03 the maintainer noticed the
gap and chose the complete document over a fragments-only version, which would
have needed no Rust but loses context and can misdraw formatting.

# Scope

- `read_saved_version_file_markdown`, a read-only command answering both saved
  sides of a document, with the existing size bound.
- `read_saved_markdown` and `validate_markdown_path` extracted from
  `read_file_markdown`, so both reads share them.
- `saved_version_change` and its cached form, shared with the file diff.
- `useMarkdownDiff`, the choice, read, comparison and stops, used by both panels.
- History's port, adapter, controller, toolbar and pane.
- An info mark saying what History compares.

# Out of scope

- Diff search in the preview, hidden there as in Changes.

# Acceptance criteria

- [x] A changed, renamed, added and deleted document each read both sides, and a
      root version reads an absent side.
- [x] Unsaved edits never reach a saved version's preview.
- [x] Either side over the limit answers too-large, and the partial view follows.
- [x] A file outside the version is refused.
- [x] A failed read leaves the text diff and says so.
- [x] The change arrows walk the document's stops.
- [x] The IPC contract, `ARCHITECTURE.md`, and the admission table list the
      command.
- [x] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/history.rs`
- `src-tauri/src/changes.rs`
- `src-tauri/src/ipc.rs`
- `src-tauri/src/application.rs`
- `src-tauri/src/lib.rs`
- `src/features/changes/markdownPreview.tsx`
- `src/features/changes/ChangesPanel.tsx`
- `src/features/history/HistoryPanel.tsx`
- `src/features/history/controller.ts`
- `docs/architecture/025-ipc-contract.json`

# Dependencies

[224](224-compact-markdown-preview.md).

# Decisions

- A new command rather than widening `read_file_markdown`: that one reads the
  working tree and needs the status, this one only saved trees and a snapshot.
- Classified read-only. It never touches the index or the working files.
- The Markdown view preference is shared with Changes through the same storage
  key. Two mounted screens do not push it to each other until they remount.

# Implementation notes

- An absent side is simply what `ls-tree` answers, so added, deleted and root
  versions need no special case. A symlink or submodule entry is refused as it
  is in Changes, and falls back to the text diff.
- `controller.readFileMarkdown` reads the snapshot token at call time and rejects
  without one.
- A side over the limit returns at once, so the other is not read and cannot turn
  a usable partial view into an error.

# Validation

- `history_tests::saved_markdown_reads_both_sides_of_each_kind_of_change`.
- `HistoryPanel.test.tsx`: both sides, the notice, the hidden search and the
  fallback. `controller.test.ts`: the snapshot token.
- Browser harness: the real preview in History's pane scrolls, with its notice.
- Not yet run end to end in the app against a real commit: the new command needs
  `tauri dev` restarted.
