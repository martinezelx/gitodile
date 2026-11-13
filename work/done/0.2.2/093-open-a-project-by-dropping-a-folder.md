---
id: 093
title: Open a project by dropping a folder on the window
status: done
priority: normal
type: feature
areas:
  - frontend
  - desktop-shell
created: 2026-08-30
completed: 2026-08-30
parent:
queue:
---

# Goal

Dragging a folder onto the GitOdile window opens it as a project, with an
overlay that says so while the drag is still in the air.

# User outcome

The gesture people already try first works. Someone with a file manager open
beside GitOdile drops the folder instead of navigating to it again through a
picker, and sees before letting go what the drop will do.

# Context

Every route into a project went through a dialog: the folder picker, the clone
flow, the initialize flow. Drag-and-drop is the one desktop affordance a Git
client is expected to have and the only one that costs the user nothing to
discover — provided the window says what it accepts.

Tauri 2 reports drags on the webview (`onDragDropEvent`) with `enter`, `over`,
`drop` and `leave`. `dragDropEnabled` defaults to true and `core:default`
already covers listening, so no configuration or capability change was needed.

# Scope

- Subscribe to the webview's drag-drop events for the app's lifetime.
- Open the dropped folder through the existing open path.
- Show a window-sized overlay while a drag is over the window.
- Ignore drops while a blocking dialog is open.
- Localize the overlay's strings in English and Spanish.

# Out of scope

- Opening several projects from one multi-folder drop.
- Dropping a file (rather than a folder) to reveal its project.
- Dropping onto a specific region for a different action.

# Acceptance criteria

- [x] A dropped folder opens through `handleOpenProject`, inheriting its
      validation, already-open handling, announcement and "not a project yet"
      recovery.
- [x] The overlay appears only while a drag is over the window.
- [x] The overlay never takes the pointer.
- [x] Nothing is registered, and nothing breaks, outside Tauri.

# Relevant files

- `src/app/App.tsx`
- `src/app/app-shell.css`
- `src/app/translations.ts`
- `DESIGN.md`

# Dependencies

None. Task 091's `preselectedPath` argument on `handleOpenProject` is what the
drop reuses.

# Decisions

- **It lives in `App.tsx`, not in a feature.** `AGENTS.md` allows direct Tauri
  calls in the composition root for watcher and session lifecycle wiring, and
  opening a dropped folder is session lifecycle. A feature would have needed a
  port and an adapter for an event that belongs to the window.
- **One drop opens one project.** The overlay promises "one folder at a time"
  before the drop, so taking the first path is what was advertised. Opening a
  queue of projects from a multi-folder drag would switch the user between
  projects they never asked for, and each open after the first would race the
  blocking-dialog guard.
- **The overlay is `aria-hidden` and `pointer-events: none`.** A drag has no
  keyboard or screen-reader equivalent to narrate, and an overlay that took the
  pointer would cancel the drop it invites.
- **A drop while another open is in flight is ignored.** It is the only route
  into `handleOpenProject` that can arrive unprompted — the picker is modal and
  the recent rows disable themselves — so the guard lives there rather than in
  the drop handler, where `isOpening` would have been a stale closure.
- **A failed subscription is silent.** Every other way into a project still
  works; an error dialog at startup about a missing affordance would be worse
  than the missing affordance.

# Implementation notes

The handler is held in a ref so the subscription registers once while still
calling the current `handleOpenProject`, which closes over session state — the
same shape the repository-watcher listener already uses.

# Validation

The preview runs outside Tauri, so the drag events themselves cannot be
delivered there; the guard means nothing is registered and nothing changes.
The overlay was measured by mounting its real markup and classes in the
preview: 1280×720 fixed cover, `pointer-events: none` confirmed by hit-testing
the window centre through it (it returned the card underneath), `z-index: 9`
(below the dialog layer at 10), 380px panel at `--radius-surface` with a dashed
`--accent-primary` edge and a 44px circular glyph tile.

```bash
pnpm run check
```

Passed on 2026-08-30: documentation over 148 Markdown files and 115 task ids,
frontend architecture, TypeScript, 491 frontend tests over 60 files, the Vite
build, `cargo fmt --check`, Clippy with `-D warnings`, and the Rust test
suites.
