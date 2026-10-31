---
id: 186
title: Review Overview's design for a calmer, more professional screen
status: done
priority: normal
type: design
areas:
  - frontend
  - design
created: 2026-10-19
completed: 2026-10-19
parent:
queue:
---

# Goal

Overview says what to do now and where the work is with less chrome: no part
repeats what another part or the status bar already says, the two cards in
its body read as siblings, and every glyph outside the next-step card stays in
the secondary ink.

# User outcome

The screen opens on one clear next step, a timeline and what that step will
move, with the project's home one click away, and nothing on it competes with
the next step for the eye.

# Context

A design review with the owner after tasks 183–185 (one sheet per screen, ink
official themes), done from screenshots of the running app: the owner sent
one, an option widget or a design canvas proposed alternatives, and the chosen
option was applied. Each decision below records the option chosen.

# Scope

- **Side column.** The work scene ("Here ↔ origin") is gone: the next-step
  card, the timeline and the status bar already say how this computer and the
  remote stand. With nothing waiting, a restorable discard takes the column
  alone; with neither a detail nor a discard there is no column and the
  timeline takes the width. `sceneMotion.ts` and its strings are removed.
- **What you'll save.** No "Stays here until you publish" note. While the
  screen fits the window its files scroll (up to 50, the rest counted at the
  end) and fade at the bottom while there is more; scrolled to the end,
  "Review" takes the lead and breathes once, as "View all" does.
- **What you'll publish, decide and get.** The same: no note under any
  card's list ("Seen by anyone on this branch", "You'll see what changes
  first" and the overlaps note are gone), and every card's list scrolls,
  its link leading at the end. With nothing left to fit, `useFitCount`
  (whole rows measured to the box) is removed.
- **Glyphs.** "Recent history" leads its title with a history glyph, in its
  loading shapes too. The side cards' head glyph and the restore row's glyph
  stay in the secondary ink in every state (overlaps' red and the discard's
  amber are gone): the step's colour belongs to the next-step card.
- **Card heads.** "Recent history" and the side card share the title size
  (`--text-subtitle`), a 16px glyph and the same link ("View all", "Review").
- **Timeline chevrons.** "Now"'s, "View all"'s and the rows' chevrons stand in
  one column; the scroll's gutter sits in the card's padding.
- **Header.** The branch quick switch is gone (the status bar names and
  switches the branch). In its place, where the project lives: the service's
  mark and the remote's `owner/name` in a hairline chip, opening its web page,
  or "Only on this computer"; no slash before it. Rust reads it
  (`read_remote_home`) and opens the page it derives from the project's own
  configuration (`open_remote_home`); the renderer names the remote, never an
  address.
- **Timeline separators.** "On this computer" (was "Only on this computer ·
  N versions") and "Published" (was "Published on origin" with a dashed rule
  to the card's edge) are the same chip on the rail, its glyph over the
  rail; no count, no rule; the remote and branch are the chip's tooltip. The
  chip is shared (`TimelineChip` in `shared/ui/localOnly.tsx`), and Branches'
  "Saved versions" uses it too, at a compact size, its chips staying at the
  top of the list while it scrolls, as Overview's do. History's block heads
  are the same chips, each the button that folds its block (chevron inside,
  no count, an opaque hover so the rail never shows through);
  the old disc mark (`LocalOnlyMark`) is gone.
- **Next step.** No kicker and no three-segment bar: the title leads. The
  glyph keeps its circle. "Then" is one quiet line with an arrow that nudges
  forward with the glyph's breath.

# Out of scope

- Other screens' headers and cards.
- Reading a project description (Git has none; README or the hosting service
  would be a network or parsing feature of its own).
- Guessing a web page for SSH remotes on servers GitOdile does not know.

# Acceptance criteria

- [x] No work scene; the column holds only the detail card and the restore
      row, and disappears when it has neither.
- [x] The save card scrolls its files while the screen fits, and "Review"
      leads at the end of the list.
- [x] Both card heads match in size, glyph and link; all their glyphs are
      in the secondary ink.
- [x] The timeline's chevrons line up with "Now"'s and "View all"'s.
- [x] The header names where the project lives and opens its page from Rust;
      it is read on project activation and on config changes, holds its
      place until read and never claims a remote is missing.
- [x] The next-step card has no kicker or progress bar, keeps the circle and
      says "Then" in one line with an arrow animated with the glyph.
- [x] Final review of the whole screen (see Review findings) done, and its
      five findings applied.
- [x] Checked by the owner in the running app (`tauri dev`) as each change
      landed.

# Relevant files

- `src/features/overview/` — `OverviewPanel.tsx`, `OverviewDetail.tsx`,
  `HistorySummarySection.tsx`, `NextStepCard.tsx`, `nextStep.ts`,
  `RemoteHomeCrumb.tsx`, `workDetail.ts`, `port.ts`, `tauriAdapter.ts`,
  `overview.css`, `translations.ts`
- `src-tauri/src/sync/mod.rs` (`read_remote_home`, `remote_web_page`),
  `src-tauri/src/desktop.rs` (`open_remote_home`), `ipc.rs`,
  `application.rs`, `lib.rs`
- `docs/architecture/025-ipc-contract.json`
- `src/app/App.tsx`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- Remove the scene rather than shrink it (option A): every fact it drew was
  already on screen.
- Scroll only "What you'll save"; the other detail cards keep fitting whole
  rows.
- Both card heads carry a glyph (option A), none of them coloured.
- Header: where the project lives (option A) rather than its history in
  numbers or a description; shown as a chip (option A) because a slash
  before an `owner/name` read as one long path.
- Next step: option B — the title leads; the glyph stays round because
  square shapes are a project's identity (its icon, the switcher).
- Card heads equal (option A) rather than one step apart, which would have
  needed a new 14px size.
- Timeline separators: chips on the rail (option C of a design canvas with
  eight variants), without the count, labelled "On this computer" and
  "Published".

# Implementation notes

- The remote home is cached in Overview's own `workDetail` controller with a
  `RemoteHomeState` (`unknown`, `unavailable`, `ready`). It is read in an
  idle task on project activation (an effect in `App.tsx`) and through the
  `overview-remote-home` shared-change subscriber. The first version only
  had the subscriber and stayed loading after opening a project; the
  activation read fixed it, guarded by an App test that fails without it.
- `remote_address` reads HTTPS, SSH, SCP-like, `file://` and local remotes;
  pages are derived for HTTP(S) addresses and for SSH on github.com,
  gitlab.*, bitbucket.org only. The IPC contract test now maps `Option<T>`
  to `T | null`.
- The opener's URL scope stays a fixed allow-list: `open_remote_home` uses
  `desktop::open_derived_url`.

# Review findings

A pass over the whole screen in a browser harness rendering the real
`OverviewPanel` (1440×860 and 900×800, GitOdile Dark and Light, with unsaved
work and with everything published plus a restorable discard). Measured with
`getBoundingClientRect`. All five were applied with the owner's approval;
how each was fixed follows its finding.

1. **Right edge.** The header's tools and the next-step buttons end 24px in
   from the sheet; "View all" and "Review" end 16px in. The left edge already
   lines up at 24px (the history header adds 8px), the right one does not.
2. **Card heads off by a few pixels.** "Recent history"'s head sits 4px
   higher than the side card's (12px top padding against 16px), so the two
   titles and their links are not on one line.
3. **The restore row alone in the column is cramped.** In a 290px column its
   title wraps ("Discarded / changes") and its button pushes the text in;
   beside a detail card it is a footnote, alone it is the column's only card
   and could take the same head as the others (glyph, title, link).
4. **Two ways of saying "when".** The restore row says "latest 1 d ago" in
   the short form; the timeline says "3 days ago" in full.
5. **Narrow window.** With the column under the timeline, the side card's
   head starts 8px left of "Recent history"'s, the same 8px as finding 1.

Applied:

- 1 and 5: the side cards are inset 24px on both sides and the history card
  24px on its right, so every row's last control ends 24px from the sheet's
  edge, and stacked in a narrow window both titles start at 24px. To keep the
  side card's head on one line at that inset the column is 328px (was 290),
  and two labels that were already cut short got shorter: "What you need to
  decide" → "What you'll decide" ("Lo que vas a decidir") and "In history" →
  "History" ("Historial").
- 2: the history card's top padding matches the side card's (16px).
- 3: alone in the column the discard is a detail card ("Discarded changes",
  "Restore ›", "3 files · discarded yesterday" or "2 copies · latest
  yesterday"); under a detail card it stays the compact row, which is now its
  only form (the `--compact` modifier is gone).
- 4: the discard's "when" uses `formatRelativeTime`, the timeline's wording.

Looked at and fine: the left edge (avatar, next-step glyph, history glyph and
timeline nodes in one column), the header chip in both themes, the next-step
card in both themes, the timeline's chevrons, the save card's scroll, the
light theme's contrast.

# Final review

Before closing, the whole diff was reviewed for bugs and leftovers:

- Rust: a remote whose address cannot be read (an unknown scheme such as
  `sso://`, a percent-encoded path) made `read_remote_home` return `None`,
  so the header said "Only on this computer" for a project that has a
  remote. It now names the remote by its own name, with no page. The host
  and port are checked to be a plain host name and a number before a page
  is derived, so nothing else reaches the opener. Covered by a unit test and
  an integration test on a real repository (upstream remote first, then
  `origin`, then the first; an unreadable address; no remote at all; no page
  for a missing remote).
- Frontend: switching back to a project re-read its remote every time; it
  now reads only while nothing is known, and config changes still refresh it
  through the shared invalidation.
- Dead code from the removed header switch: `.branch-card__value`, a
  narrow-window rule for `.overview-meta`, and the `overviewSpecificSavedVersion`
  and `overviewNoSavedVersions` strings.

# Validation

- `pnpm run check` after the header work — passed (1552 frontend tests, 607
  Rust tests, Clippy, docs).
- Final, after the review fixes: `pnpm run check:docs` and
  `check:architecture` passed; `pnpm run check:frontend` passed (1554
  tests) on a second run — the first full gate timed out two `App` tests
  under load (one passes alone in 3 s against a 5 s limit), and the frontend
  run after it timed out one of them again; neither touches this task's
  code paths. `pnpm run check:rust` passed (fmt, Clippy, 608 tests,
  including the new remote-home integration test).
- Each visual change was measured in a throwaway browser harness rendering
  the real components, removed afterwards, and checked by the owner in the
  running app.
