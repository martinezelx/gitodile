---
id: 187
title: Calmer status bar separators, Overview header order and a matching skeleton
status: done
priority: normal
type: design
areas:
  - frontend
  - design
created: 2026-10-20
completed: 2026-10-20
parent:
queue:
---

# Goal

After the new style (tasks 183–186), the status bar's dividers and Overview's
header read as the old app: a terminal-like `|` between segments, a remote
address beside the title, and a loading skeleton that no longer matches the
screen it stands for.

# User outcome

The status bar reads as two short phrases, Overview's header puts the
project's own actions beside its name and what leads out of the app at the
row's end, and opening a project lands every element where its placeholder
already stood.

# Context

A design review with the owner from a screenshot of the running app. Each
change was proposed in an artifact with options (status bar separators: eight
variants; Overview header: eight variants), and the chosen option applied.

# Scope

- **Status bar separators (option G).** The left block joins the project and
  its branch with a faint slash (`project / branch`, `.status-bar__path`), lighter
  than either name so a branch with its own slash keeps the stronger mark. The
  remote block has no mark: 4px of air between the fact and the check, told
  apart by their glyphs. The `.status-bar__hair` divider is gone.
- **Overview header (option A).** Folder and settings follow the project's
  name at the row's full 12px gap (4px between the two), and the remote chip
  takes the row's end, lined up with the next-step card's buttons.
- **Skeleton.** `OverviewPlaceholder` and `HistoryPlaceholderList` follow the
  real screen: the header's order, the tools' 32px boxes with a disc inset to
  the glyph, a chip place of the real chip's size, a pinned "Now" row, the
  timeline's group head before the rows, and text runs that no longer inflate
  their line boxes. "Recent history"'s head holds the "View all" height
  before the first read, so the timeline no longer steps down when it lands,
  in the real first read as well as the skeleton.

# Out of scope

- A side-column placeholder: whether Overview shows one depends on state the
  skeleton cannot know.
- Other screens' skeletons.

# Acceptance criteria

- [x] The status bar shows a slash between project and branch and no mark in
      the remote block, in both themes.
- [x] Overview's header shows icon, name, folder, settings, then the remote
      chip at the far end; the skeleton keeps that order.
- [x] Measured side by side, the skeleton's header, next-step card, history
      head, "Now" row, chip and rows sit at the real screen's positions and
      heights.
- [x] `DESIGN.md` describes the new separators and header order.
- [x] Reviewed and checked by the owner in the running app.

# Relevant files

- `src/app/StatusBar.tsx`, `src/app/StatusBar.test.tsx`, `src/app/app-shell.css`
- `src/features/overview/OverviewPanel.tsx`,
  `src/features/overview/OverviewPlaceholder.tsx`,
  `src/features/overview/overview.css`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- Separators: option G (path on the left, air on the right) over the plain
  hairline, air everywhere, a middle dot (it clashed with the unsaved marker
  dot), a slash in both blocks, split or outlined capsules, and a hover-only
  hairline.
- Header: option A over the previous order, an origin subtitle, a "…" menu,
  the name as a menu, everything grouped at the end, a plain-text remote and
  hover-only tools. Tools moved from an 8px to a 12px gap from the name.

# Implementation notes

- The tools' gap is the header's own `gap`; only the second tool pulls in
  (`.overview-header__tool + .overview-header__tool`). The chip is pushed to
  the end with `margin-left: auto` on `.overview-header > .overview-home` and
  its placeholder; the `--first` modifier is gone.
- The skeleton's tool places reuse `.overview-header__tool`'s box and draw the
  disc with `padding` + `background-clip: content-box`, so they follow the
  coarse-pointer size too.

# Final review

The whole diff was reviewed before closing: the status bar tests cover the
slash and the remote block without a mark; the placeholder list, also used
by the real section's first read and its Suspense fallback, draws the same
rail (`--after-now`) as the read list under "Now". Fixed in the review:
`DESIGN.md` still placed the chip beside the name and the tools at the end,
three comments ran past the line width, a test comment read "the block's
own block", and the slash's literal size failed the type-scale guard.

# Validation

- Measured in a throwaway browser harness rendering the real `NextStepCard`,
  `HistorySummarySection` and header beside `OverviewPlaceholder` (900×640,
  dark), removed afterwards. Every element matched in position and size; the
  only difference left was the rows' 4px entry animation frozen in a hidden
  pane.
- `pnpm run check`: docs, architecture and frontend passed (1555 tests) after
  one fix — the first run caught `.status-bar__path` using a literal 15px
  and `line-height: 1`; they now use `--text-subtitle` and
  `--leading-none`. The Rust step could not replace `gitodile.exe` while the
  owner's `tauri dev` held it, so fmt, Clippy and the Rust tests ran with a
  separate `CARGO_TARGET_DIR` and passed (609 tests).
