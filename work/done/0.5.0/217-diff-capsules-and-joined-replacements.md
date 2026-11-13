---
id: 217
title: Mark diff runs with capsules and join replacements
status: done
priority: normal
type: feature
areas:
  - frontend
  - changes
  - history
created: 2026-11-02
completed: 2026-11-02
parent:
queue:
---

# Goal

Replace task 214's solid/dashed 3px bars with one capsule per change run in
text diffs and rendered Markdown, and join a removal to its addition with a
blended transition.

# User outcome

Changed code and documents read as clear blocks: an addition is a filled
capsule, a removal an outlined one, and a replacement flows from red into green
instead of showing two unrelated marks or a muddy midpoint.

# Context

Reviewing task 214's dashed bars in the running app, the maintainer asked for
alternatives. Six treatments were compared on 2026-11-02 in a private
interactive artifact using the real theme tokens (current bars, row-edge bar,
tinted gutter, bar and rail, capsule per run, hatched removals). The maintainer
chose the capsule, asked for Markdown to match, and asked for a well-integrated
blend where the two bars meet.

The dashed rhythm needed a per-row phase computed in the virtualized renderer
(`removalStarts`, `--diff-removed-offset`) and an sRGB red/green blend that
passed through brown; both go away.

# Scope

- One 5px capsule per run in unified and split text diffs: filled for an
  addition, 1.5px outline for a removal, `--radius-pill` ends inset
  `--space-1` from the run's edges.
- In unified view, a removal directly followed by its addition in the same
  hunk is joined: no caps between them, and over `--space-2` each side the
  outline fills, the colour passes through the OKLCH midpoint and the row tints
  blend.
- Split view caps each column's runs independently and never joins across the
  divider.
- Rendered Markdown uses the same capsule per marked block (first cell for a
  table row), joins a removed block directly followed by an added one, and
  scrolls a changed code block inside its code so the capsule stays in place.
- Forced colours draw the same filled/outlined capsules with native borders.

# Out of scope

Git operations, new settings, accessible plain-text diff, binary/image
comparisons and conflict resolution.

# Acceptance criteria

- [x] Unified and split text diffs show one filled or outlined capsule per run,
      across wrapped and empty lines, with no per-row dash phase.
- [x] A removal directly followed by its addition in unified view and in
      rendered Markdown shows one continuous capsule with a blended join.
- [x] Lists, tables and code blocks in rendered Markdown keep their capsule in
      place; a scrolled code block does not move it.
- [x] Forced colours keep distinguishable capsules without gradients or masks.
- [x] Run edges are covered by unit tests, including hunk boundaries and split
      columns.
- [x] Running frontend checked in light and dark themes.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/changes/DiffResultView.tsx`
- `src/features/changes/changes.css`
- `src/features/changes/changesDomain.test.ts`
- `src/dev/gallery/Gallery.tsx`
- `DESIGN.md`

# Dependencies

Tasks [214](214-text-diff-bars-and-tint.md) and
[215](215-text-diff-detail-and-orientation.md).

# Decisions

- Shape, not dashes, separates removal from addition, so the marker no longer
  depends on virtualized row positions.
- The join mixes the bar colours in OKLCH (a warm hue between red and green)
  and keeps the soft tints in sRGB, matching the existing `--tint-fill` mixes.
- The removal outline is a mask over a filled bar so the join can fill its
  inside and blend its colour; forced colours fall back to borders.
- Markdown's join uses `:has()`; an engine without it shows two closed
  capsules, which is still correct.
- Gutter widths and row geometry are unchanged, so wrapping estimates and
  virtualizer measurements are unaffected. Presentation-only on Windows, macOS
  and Linux; no new dependencies.

# Implementation notes

`diffRunEdges` in `DiffResultView.tsx` returns `run-start`, `run-end`,
`joined-before` or `joined-after` for a row's column; the renderer turns them
into `diff-line--*` / `diff-split-cell--*` modifiers. One CSS rule draws the
bar for diff markers and Markdown blocks, driven by `--diff-cap-start`,
`--diff-cap-end` and the join variables. The gallery's Markdown specimen copy
describes the joined pair. The comparison artifact stays outside the
repository.

The pre-commit code review fixed two Markdown defects: every marked block now
resets the join variables (`--diff-join-end`, `--diff-bar-start`,
`--diff-bar-end`), so a marked block nested inside a joined one no longer
inherits its blend; and a joined code block keeps its own padding, losing only
its margin, instead of trading its 16px bottom padding for the paragraph gap.

# Validation

- `pnpm vitest run src/features/changes`: passed, including the new
  `diffRunEdges` cases.
- Running frontend: `/gallery.html` in gitodile-dark and gitodile-light.
  Inspected unified, split and Markdown specimens; DOM classes confirmed run
  starts, ends and joins. A temporary Markdown list, table row and long code
  block confirmed the capsules, the join and that scrolling the code leaves the
  bar at `left: 0`. No console errors.
- The maintainer approved the running result on 2026-11-02.
- `pnpm run check:architecture` and `pnpm run check:frontend`: passed.
- `git diff --check`: passed.
- `pnpm run check`: docs, architecture, typecheck, 1,928 frontend tests and
  build passed; the Rust step then stopped because `tauri dev` held
  `src-tauri/target/debug/gitodile.exe` (os error 5). `check:rust` with a
  scratch `CARGO_TARGET_DIR`: fmt and Clippy passed; 693 of 694 unit tests
  passed and `console::change_tests::remote_changes_reach_a_local_bare_remote`
  failed (`AuthenticationFailed` instead of `NotFastForward`) under the
  concurrent load. It passed alone, and a second full `check:rust` passed
  (694 unit and 2 credential-helper integration tests, 1 existing ignored).
  No Rust code changed.
- Final, after the pre-commit review fixes (with task 218):
  `CARGO_TARGET_DIR=<scratch> pnpm run check` exited 0 in one invocation —
  1,929 frontend tests, build, fmt, Clippy, 694 Rust unit and 2
  credential-helper integration tests passed, 1 existing ignored.
