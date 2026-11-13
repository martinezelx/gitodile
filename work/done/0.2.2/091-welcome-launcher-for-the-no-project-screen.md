---
id: 091
title: Turn the no-project screen into a welcome launcher
status: done
priority: normal
type: improvement
areas:
  - frontend
  - accessibility
  - documentation
created: 2026-08-30
completed: 2026-08-30
parent:
queue:
---

# Goal

Rebuild the screen GitOdile paints with no project open. Its three entry
points stop being a row of capsules with wrapped labels and become a launcher:
one card per action, a circular glyph tile on top, the label and a one-line
hint underneath.

# User outcome

The first screen of the app now answers "which of these three is mine?"
instead of presenting three long, equally-shaped buttons. Someone who already
has a folder under Git, someone starting from nothing, and someone copying a
project from a server each recognize their own card by its icon and its hint,
and the page reads as a front door rather than as an error about a missing
project.

# Context

The screen inherited the shared `.empty-state` pattern, which is specified for
one or two actions. It has three, and after the capsule refactor every
single-line control became fully rounded — so at 1280px the three labels
wrapped to three lines *inside* a 999px-radius pill (measured: 104×85, 97×85
and 111×85 px). A capsule is a single-line control by definition, so the fix is
not a smaller radius but a different shape for a launcher.

The shell also rendered a `topbar` above it whose only job was an `h1` reading
"Overview", directly above an `h2` reading "No project open" — the front door's
first line spent on the name of a screen nobody navigated to.

# Scope

- Replace the capsule row with three cards, each a circular glyph tile, a
  label and a one-line hint.
- Reuse the add-project menu's icons (`FolderInput`, `FolderPlus`,
  `CloudDownload`) so both routes to the same three flows look related.
- Give the three actions the same weight: same tile, no accent on any of them.
- Move the opening-a-project progress into the Open card.
- Drop the shell's no-project `topbar`; the welcome headline becomes the
  screen's `h1`.
- Shorten the supporting copy now that each action explains itself.
- Reflow the launcher: three columns, then two, then one card per row, with a
  sideways card layout below 560px.
- Localize every new string in English and Spanish.
- Record the departure from the shared empty-state pattern in `DESIGN.md`.

# Out of scope

- A recent-projects list on the welcome screen. It needs a persisted store of
  its own: `gitodile-projects` holds the *currently open* set and forgets a
  project the moment it is closed.
- Drag-and-drop of a folder onto the window.
- History's own empty and error states, which still render bare glyphs where
  the shared pattern asks for `.empty-state__icon`.

# Acceptance criteria

- [x] No text renders inside a pill on the welcome screen.
- [x] Each card's accessible name is exactly its label, with the hint exposed
      as its description, so existing "Open a project" lookups keep working.
- [x] Exactly one `h1` on the screen, and it is the welcome headline.
- [x] The launcher reflows without horizontal overflow down to 320px.
- [x] Contrast holds in both themes for label, hint and glyph.
- [x] Reduced motion suppresses the card's hover lift and the spinner.

# Relevant files

- `src/features/overview/OverviewPanel.tsx`
- `src/features/overview/overview.css`
- `src/features/overview/translations.ts`
- `src/app/App.tsx`
- `src/app/app-shell.css`
- `src/app/App.test.tsx`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- **Cards, not a wider capsule row.** § Shape makes a capsule a single-line
  control; three labels of two to four words cannot be single-line at this
  width in either language. The card is `--radius-surface` and its tile is
  `--radius-round`, which is the same pairing the rest of the app uses for a
  glyph on a fill.
- **The pattern's own glyph tile is dropped here.** Keeping it would have put
  a fourth circle directly above three, and the icons now live where the
  actions are.
- **No recommended action.** The old row's hierarchy — one brand-green pill,
  two grey buttons — was inherited from a time when the shapes differed, not
  from a decision that creating a project is the likely intent. Which of the
  three is right depends on what the user already has on disk, so the cards are
  peers and the hints do the choosing. It also keeps the screen free of a brand
  moment competing with the titlebar mark.
- **`aria-labelledby` + `aria-describedby` rather than `aria-label`.** Folding
  the hint into the accessible name would have broken every existing
  "Open a project" query, and hiding it from assistive tech would have removed
  the one line that distinguishes the three.
- **`width: 100%` on the block.** `.empty-state` centres itself with auto
  cross-axis margins in a column flex container, so it shrinks to fit; without
  a definite width the `auto-fit` launcher resolved against an indefinite size,
  collapsed to one column and wrapped 2 + 1 (measured: block 468px instead of
  560px).
- **`text-wrap: balance`** on the label, hint and supporting line: greedy
  wrapping stranded a single word on the last line of most cards.

# Implementation notes

`WelcomeAction` is local to `OverviewPanel.tsx` — it is the welcome screen's
own vocabulary, not a shared primitive, and nothing else in the app renders a
launcher. The shared `.empty-state` block, its typography and its centring are
unchanged and still owned by `src/shared/ui/primitives.css`; only
`.empty-state--welcome` and the `.welcome-action*` rules are new, and they live
with their feature in `overview.css`.

`.empty-state__icon`, `.empty-state__icon--loading` and `.empty-state__actions`
now have no caller. They stay: `DESIGN.md` prescribes them for every screen's
empty, loading and error states, History currently renders bare glyphs where
they belong, and Recovery and Conflicts are not built yet.

# Validation

Measured in the running dev preview at 1280×820, 700×760 and 420×720, in both
themes (`getBoundingClientRect`, `getComputedStyle`, `elementFromPoint`
hit-tests, WCAG contrast computed from the resolved colours):

- Launcher at 1280: three 163×167 cards in one row; at 420: three 332×66
  sideways cards, no horizontal overflow at either width.
- Accessible names read "Crear un proyecto local" / "Abrir un proyecto" /
  "Clonar un proyecto remoto"; descriptions read the three hints.
- Light: label 17.49:1, hint 5.36:1, glyph on tile 4.79:1, brand tile glyph
  8.76:1. Dark: 14.87:1, 6.06:1, 6.79:1, 8.76:1.
- Hit-testing the centre of each card returns the card itself.

```bash
pnpm run check
```

Passed on 2026-08-30: documentation over 145 Markdown files and 112 task ids,
frontend architecture, TypeScript, 482 frontend tests over 59 files, the Vite
build, `cargo fmt --check`, Clippy with `-D warnings`, and the Rust test
suites.
