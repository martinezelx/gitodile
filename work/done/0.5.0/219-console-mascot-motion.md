---
id: 219
title: Move the console mascot between the welcome and the watermark
status: done
priority: normal
type: feature
areas:
  - frontend
  - console
created: 2026-11-02
completed: 2026-11-02
parent:
queue:
---

# Goal

Make the console mascot's motion tell what happens to it: one drawing that
moves to the corner and back, rain that falls through its whole column, and
digits that are the project's own version ids.

# User outcome

Running the first command visibly minimizes the welcome's mascot into the
watermark, and clearing brings it back. Behind the watermark the rain falls
from the top of the pane down to the mascot's feet, and each command gets a
brief blink.

# Context

The maintainer asked for ideas to improve the console mascot's motion on
2026-11-02. Five proposals were compared in a throwaway interactive artifact.
The first version of the "cascade" misread the request as a one-off burst
inside the mascot's box; the maintainer clarified that the rain should fall
through the whole column the mascot occupies, and chose that rain always on,
together with the other four proposals.

# Scope

- The watermark's rain falls through the mascot's whole column: from the
  overlay's top edge to the foot row, as wide as the drawing, with two drops
  a column and slower drops than the welcome's.
- The first entry sends the welcome's drawing to the watermark: it shrinks
  and travels there in 460ms on the emphasized curve, and its rain shows once
  it lands.
- Clearing a nonempty transcript (`clear` or Ctrl+L) sends it back the same
  way while the summary fades in.
- Each later entry blinks the watermark's eyes once (220ms).
- The rain's digits are the short ids of the project's latest 24 saved
  versions, from the history the app already holds.

# Out of scope

- A one-off cascade on each command (compared, not chosen).
- Any new history read: without cached versions the seeded digits remain.
- Rain speed that stays constant across pane heights.

# Acceptance criteria

- [x] The watermark's rain strip spans from the overlay's top to the foot row
      and follows the pane's height without measuring.
- [x] The flight replaces both drawings' row reveal; without the Web
      Animations API the reveal remains.
- [x] Each new entry blinks the watermark once; mounting, results and hidden
      screens do not.
- [x] The rain reads the cached short ids without changing its seeded pattern.
- [x] Reduced motion (system or app) shows no flight, blink or rain.
- [x] `DESIGN.md` describes the new motion in Console and Motion.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/console/ConsoleScreen.tsx`
- `src/features/console/ConsoleMascot.tsx`
- `src/features/console/mascotArt.ts`
- `src/features/console/console.css`
- `src/app/App.tsx`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- The tall strip is CSS only: the watermark is already a size container, so
  the rain's height and fall distance are `100cqh - 2em`. Without container
  queries the rain stays in the drawing's box.
- The flight is orchestrated by `ConsoleScreen`, which owns both containers:
  it measures the outgoing drawing in the event handler, before the state
  change, and animates the incoming one in a layout effect with the Web
  Animations API, reading the easing from `--ease-emphasized`.
- The blink is a script animation over the idle CSS blink's own eye frames,
  so it needs no extra elements and the idle cycle carries on after it.
- The console receives only `subscribe`/`getSnapshot` of the app's history
  controller and subscribes while active; it never refreshes history.

# Implementation notes

`mascotRain` takes an optional hash stream and still draws every random
number, so columns, speeds and delays are identical with or without it. The
watermark doubles the drop list with the second copy half a cycle behind and
triples the welcome's durations. `ConsoleMascot`'s `nudge` is the latest
entry id; only a change after the first render blinks.

The pre-commit review found that the rain's landing fade ended at opacity 1
and then jumped to the watermark rain's own 0.625; it now ends on the computed
resting opacity. The flight's easing, first copied as a literal, is now read
from its token.

# Validation

- Throwaway browser harness at `/harness/index.html` on the Vite server
  (removed before committing), with cached versions stubbed: the rain read the
  stubbed ids; after a command the strip spanned the overlay's top (40px) to
  the foot row (674px), a drop's fall matched the strip's height, and the
  flight, its reverse on `clear` and the blink were started with the expected
  keyframes. The pane was hidden, so animations were inspected through
  `document.getAnimations()` rather than seen; the running Tauri app was not
  used.
- `mascotArt.test.ts` covers the hash stream; `ConsoleScreen.test.tsx` covers
  that one drawing moves both ways instead of revealing a new one.
- Final, after the pre-commit review fixes: `git diff --check` passed and
  `CARGO_TARGET_DIR=<scratch> pnpm run check` exited 0 — 1,931 frontend
  tests, build, fmt, Clippy, 694 Rust unit and 2 credential-helper
  integration tests passed, 1 existing ignored.
