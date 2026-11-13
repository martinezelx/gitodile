---
id: 206
title: Resolve overlapping text inside GitOdile with a three-way editor
status: planned
priority: normal
type: epic
areas:
  - conflicts
  - frontend
  - performance
  - accessibility
created: 2026-10-27
completed:
---

# Origin

Split out of epic [037](../done/0.5.0/037-guided-conflict-resolution.md) on
2026-10-27, when `1.0.0` was scoped to GitHub Desktop-level conflict
resolution. This epic keeps the original ambition: interaction comparable to
the three-way merge tools in IntelliJ IDEA and VS Code, native to GitOdile. Its
children keep their permanent IDs from epic 037:
[037-2](037-2-editor-foundation-spike.md) and
[037-4](037-4-resolve-text-conflicts.md). Scheduling is open; it fits the `1.3`
"publish with confidence" theme or later
([ROADMAP](../../docs/ROADMAP.md#after-100)).

# Goal

For ordinary text overlaps, let the user compare base, current and incoming
versions side by side, choose or combine sides per region, and edit the result
directly, on top of the session, snapshot, finish and abort contracts that
epic 037 delivers.

# User outcome

The user resolves a text overlap without leaving GitOdile and without opening
another editor, region by region, with undo and a way back to the original
overlap.

# Scope

## Structured three-way data

- Aligned regions for base → current and base → incoming changes, including
  automatically merged context and genuinely overlapping regions.
- Preserve Git's already merged work and any edits in the working file; opening
  the editor never regenerates the working tree.
- Regions as structured lines and source ranges; raw markers only in technical
  evidence.
- Bound CPU, memory, line count, line length, Git output and IPC; large files
  use virtualized rendering and an honest fallback.
- Decide the alignment implementation in a small recorded spike: existing Git
  diff output plus base-coordinate alignment, a focused Rust library behind the
  Git boundary, editor-provided merge primitives, or the `diff` package the
  frontend already depends on.

## Editor foundation (task 037-2)

- Select a production editor through a measured ADR, never `contenteditable` or
  a plain textarea. Compare at least CodeMirror 6 and Monaco on synchronized
  panes, conflict gutters, undo/redo, search, large files, keyboard and screen
  reader behaviour, IME, RTL, Vite/Tauri/CSP/worker integration, bundle size,
  startup cost, memory and lazy loading.
- Lazy-load only when a supported session exists; no effect on startup or other
  screens. Syntax highlighting is a display aid only.

## Per-region resolution (task 037-4)

- Per region: use current, use incoming, combine both (order stated first), edit
  manually, restore the region.
- Previous/next region and file; textual progress; undo/redo; separate,
  confirmed **Reset this file's resolution**.
- Keep edit buffer, saving the working file and marking resolved as distinct
  states and mutations, consuming epic 037's snapshot and stale-state contract.
- Deterministic suggestions only with a preview, never applied or marked
  resolved silently. External edits invalidate the draft and offer
  compare/reload.

## Layout and accessibility

- Wide: file list plus current, editable result and incoming panes, with the
  base behind a labelled toggle. Medium: sources side by side above the result.
  Narrow: list/detail with Current / Result / Incoming / Base views.
- An accessible linear conflict view that does not depend on synchronized
  columns. IME, RTL content, zoom, forced colours and reduced motion.
- Budgets for chunk size, first open, typing latency, scroll and pane sync,
  memory release, and thousands of files, measured against
  [`023-performance-baseline.md`](../../docs/architecture/023-performance-baseline.md).

# Out of scope

- Anything epic 037 already owns: session, classes, snapshot, whole-file
  choices, finish and abort.
- Semantic or AI merges, octopus merges, non-merge operation variants.

# Acceptance criteria

- [ ] The editor dependency is chosen by a measured ADR and loads lazily.
- [ ] Region choices and manual edits produce exact expected bytes across line
      endings, long lines, missing base, Unicode, IME and marker-like content.
- [ ] Save and mark-resolved stay separate, stale-safe, verified mutations, and
      per-file reset restores the exact original overlap.
- [ ] The linear view, keyboard, focus, screen reader, both themes and locales,
      zoom and reduced motion pass an independent audit.
- [ ] Performance budgets are met or the epic stays open with a named blocker.

# Dependencies

Epic 037 complete.

# Decisions

- Kept out of `1.0.0` by user decision on 2026-10-27; `1.0.0` matches GitHub
  Desktop, where conflicts are resolved per whole file or in the user's editor.

# Implementation notes

Record the alignment model, editor decision, measurements and platform
findings.

# Validation

Each child records its checks; the epic closes with `pnpm run check` and the
independent audit.
