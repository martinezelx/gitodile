---
id: 179
title: Paint the published version node in the primary ink with the C1 hover
status: done
priority: normal
type: design
areas:
  - frontend
  - design
created: 2026-10-16
completed: 2026-10-16
parent:
queue:
---

# Goal

Stop painting the published version's timeline node in the flat
secondary-text grey. Fill it with the primary ink — the same fill the local
half circle uses — so one family reads "saved" and only the shape says where,
and settle the pointer on the chosen C1 treatment: an accent ring plus a soft
halo, with the fill left alone.

# User outcome

"Published" reads as a deliberate, fully saved state in every theme, next to a
half circle that says "saved only here"; pointing at a version row makes the
node respond on the filled disc, the half circle and the empty ring alike.
Selection keeps meaning "the one accent node".

# Context

- Review of the current nodes (History 10px, Overview and Branches' recent list
  12px) found the published disc dull: border and fill were both
  `--text-secondary-color` at 70%, and hover changed only the 1.5–2px
  `border-color` to the accent, which barely registers on a filled disc.
- An HTML comparison of resting states, hover variants and published-node
  colours was reviewed in every shipped theme. C1 (P1 + H1) was chosen for the
  pointer: a crisper resting disc and an accent halo under it.
- The colour went through two shapes. First a dedicated per-theme token
  (`--commit-published`) because every reuse collided somewhere
  (`--status-success` merges with the green accent in the GitOdile themes,
  `--status-renamed` collides with the blue accent in Tokyo Night and
  Solarized, and `--accent-primary` / `--accent-primary-fill` read as
  "selected"). Then, seeing it, the simpler answer won: the primary ink is
  exactly the half circle's filled half, so the two saved states share one
  fill and the shape carries the difference, and no theme has to pick a colour.
  The token and its contract were reverted.
- Shape keeps meaning the publication state (full disc published, half circle
  local, empty ring unknown); only the fill's colour family and the pointer
  response changed.

# Scope

- Set the published node to `border-color: var(--text-primary-color)` and
  `background: var(--text-primary-color)` in `history.css`, `overview.css` and
  `branches.css`.
- Add the C1 hover/focus halo to the three nodes (2px / 4.5px at 10px; the
  3px / 5.5px pair at 12px) and make sure the halo can ease (transition lists).
- Update `DESIGN.md`: the three node descriptions, the theming prose and the
  contrast-contract note.

# Out of scope

- The branches route SVG dots (`branches-route__dot--unpublished`,
  `__main-dot`): a separate drawing, not the list node.
- The Overview "incoming" dashed node and the "Now" unsaved ring.
- Rust payloads: `publication` already carries the state; no contract change.
- Any change to selection or forced-colors behaviour.

# Acceptance criteria

- [x] The published node is `border: var(--text-primary-color)` /
      `background: var(--text-primary-color)` in all three features.
- [x] No new theme token: `--commit-published` appears nowhere in `src/` or
      `DESIGN.md`; `themes.css` and `themeContrast.test.ts` are unchanged from
      before this task.
- [x] Hover and focus-visible add the accent border and the halo
      (`0 0 0 2px panel, 0 0 0 4.5px accent 30%` at 10px; the 3px / 5.5px pair
      at 12px), and the fill does not change.
- [x] Selection, forced-colors and reduced-motion behaviour is unchanged.
- [x] The checks that cover this change pass: `check:docs` and `check:frontend`
      (architecture, `tsc -b`, 143 files / 1537 tests, build). The aggregate's
      final `cargo test` step could not run because a running debug instance
      holds `gitodile.exe`; the user chose to keep it open. Rust is untouched by
      this task and `cargo clippy -D warnings` passed in the same run.

# Relevant files

- `src/features/history/history.css`
- `src/features/overview/overview.css`
- `src/features/branches/branches.css`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- **Primary ink, not a dedicated token.** `--text-primary-color` is exactly the
  half circle's filled half, so a published disc is a fully filled version of
  the same mark. No theme needs to choose a colour, "every named theme keeps
  the same token set" stays trivially true, and the accent stays reserved for
  hover, focus and selection.
- **Hover keeps the fill.** The halo + accent ring is the pointer signal, so the
  disc's colour never blinks between two meanings; only selection changes the
  fill (accent).
- **Contrast needs no new pairing.** `--text-primary-color` is already measured
  at 4.5:1 on every surface a row sits on; a dedicated node token's 3:1 pairing
  was removed with it.
- **Trade-off.** The solid disc is the loudest node in the list (near-black on
  light, near-white on dark). Accepted: it is the one state that is on the
  remote, and the rarer local half still reads at a glance.

# Implementation notes

- `history.css`, `overview.css`, `branches.css`: the published rule uses
  `--text-primary-color` for border and fill; comments updated to say "primary
  ink" and to explain the one-family reading. The hover halo, Overview's
  `:active` scale and the transition lists (a missing `box-shadow` in Overview
  and Branches, a missing `background-color` in Branches) are in
  place.
- In History the pointer halo excludes `.history-row--selected`, whose node
  already carries the accent fill and its own halo (3.5px / 22%): without the
  exclusion the more specific hover rule grew that halo on a selected row,
  which the pre-change stylesheet never did.
- `DESIGN.md`: the Overview timeline section, the History lanes paragraph, the
  Branches recent-list paragraph and the theming prose now say the published node
  is a solid disc in the primary ink; the hover-halo wording is kept.
- The token trial was reverted: `themes.css` (14 blocks + header) and
  `themeContrast.test.ts` (`REQUIRED_TOKENS` + a dedicated 3:1 test) are
  byte-identical to their pre-task state; `git diff` shows no change for either.
- The HTML comparison lives outside the repo
  (`%TEMP%\opencode\gitodile-history-nodes.html`).

# Validation

- `pnpm run check:docs` — passed (315 Markdown files, 230 task ids).
- `pnpm run check:frontend` — passed: architecture guard, `tsc -b`, 143 test
  files / 1537 tests, `vite build`.
- `pnpm run check` (aggregate) — `check:docs` and `check:frontend` passed;
  `check:rust` reached `cargo test` and failed with `failed to remove file
  ...gitodile.exe ... Acceso denegado` because a running debug instance held
  the binary. The user chose to keep the app open, so the Rust test step was
  left unrun rather than verified.
- Supporting evidence: earlier in the same session the aggregate ran the full
  Rust suite green (604 passed, 0 failed, 1 ignored, plus the integration
  targets) on identical Rust sources; `git diff` since then touches only CSS,
  `DESIGN.md` and the task files.
