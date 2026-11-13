---
id: 222
title: Keep glyph tones apart and spend colour once
status: done
priority: normal
type: design
areas:
  - frontend
  - design
  - docs
created: 2026-11-03
completed: 2026-11-03
parent:
queue:
---

# Goal

Every glyph tone reads apart from every other tone in every theme, the empty
version node has one token, and a busy screen spends each colour once.

# User outcome

"Saved here", "done", the remote, warnings, danger, the favourite heart and
GitOdile's own violet can be told apart at a glance in all twelve themes,
including the community palettes, which used to give "saved here" and "done"
one green and the heart danger's red. An open folder in Changes or in a saved
version's files no longer repeats its files' change kinds as dots.

# Context

On 2026-11-03 the maintainer asked whether GitOdile follows the 60/30/10 colour
rule. It does not: under ADR 0033 the interface is ink, and colour is for
meaning (status, glyph tones) and for identity (avatars, file icons, History
lanes). The review of that system found three things to improve:

1. The empty ring of a version node was the same `color-mix` written in five
   stylesheets.
2. Nothing measured whether two glyph tones were too close. Measured in OKLab,
   GitOdile Light's lime "saved here" and green "done" were 4.3 apart, Dark's
   remote blue and app violet 8.9, and every community theme gave local and done
   one green.
3. Colour density on a busy screen had not been checked.

A fourth idea, a single brand-colour moment (welcome, first project, About),
was discussed and left out. It is a product decision that would reopen ADR
0033's rejected "keep the mascot green", and the maintainer is keeping it in
mind without a task.

# Scope

- `--node-ring` in `tokens.css`, used by the five rings.
- A `themeContrast.test.ts` contract: every pair of the seven glyph tones at
  least 10 apart (OKLab ×100) in every theme block.
- Official and community theme values moved until the contract passes.
  Community themes use only their published hues, moved in lightness, and each
  block's comment names what moved.
- A density check of History with many authors and parallel branches, and the
  one redundancy it found removed.
- `DESIGN.md` and ADR 0033 record the rule and the new values.

# Out of scope

- A brand-colour moment (see Context).
- Colour-blind separation. Under colour blindness red, amber and the greens
  meet in any palette, so a tone never carries meaning without its glyph.
- File-type icons, avatars and lanes, which are identity colours by design.

# Acceptance criteria

- [x] The five empty rings read `var(--node-ring)` and no copy of the mix
      remains.
- [x] `themeContrast.test.ts` fails if any two glyph tones in any theme are
      under 10 apart, and passes for all twelve themes.
- [x] Every moved value still passes the existing contrast contract.
- [x] History's colour density was checked in light and dark themes, official
      and community.
- [x] A folder shows its change-kind dots only while folded, in Changes and
      History.
- [x] `DESIGN.md` and ADR 0033 carry the current values and rule.
- [x] `pnpm run check` passes.

# Relevant files

- `src/styles/tokens.css`
- `src/styles/themes.css`
- `src/architecture/themeContrast.test.ts`
- `src/shared/ui/primitives.css`
- `src/features/branches/branches.css`
- `src/features/history/history.css`
- `src/features/overview/overview.css`
- `src/features/changes/FileTreeControls.tsx`
- `src/features/changes/changes.css`
- `DESIGN.md`
- `docs/adr/0033-official-monochrome-themes.md`

# Dependencies

None.

# Decisions

- The floor is 10 in OKLab ×100. About 2 is the smallest step the eye notices,
  so 10 is a clear step, and it is low enough to keep every theme in its own
  palette.
- The floor is for normal vision only. The glyph's shape carries meaning under
  colour blindness, as DESIGN.md already required.
- Official moves were the smallest that pass. GitOdile Light's lime could not
  move alone, squeezed between done's green and warning, so done and local
  moved together.
- Community themes take another published hue for each role (a teal, frost or
  second green for "saved here"; a pink, magenta or purple for the heart), not
  a new colour. Solarized Dark, Solarized Light and Gruvbox Dark have no hue
  left over, so their "saved here" is the remote's hue at another lightness.
  It passes the floor, and the laptop and cloud glyphs tell the two apart. A
  green moved in lightness was tried for them and was dropped: it only passed
  as a neon pastel in the dark themes and not at all in Solarized Light.
- An open folder drops its dots. DESIGN.md gave them one purpose, so a folded
  folder still says what it holds. Open, its files below say it, and the dots
  spent the same colour twice. The maintainer chose this after a side-by-side
  mock-up.

# Implementation notes

- `--node-ring: color-mix(in srgb, var(--text-secondary-color) 52%,
  transparent)` sits next to `--node-fill`. No stylesheet overrides
  `--text-secondary-color` below the root, so resolving it at `:root` is safe,
  as it already is for `--node-fill`.
- `perceptualDistance` in `themeContrast.test.ts` is the Euclidean distance in
  OKLab ×100. The new test reads `--tone-app` from `tokens.css`'s `light-dark()`
  pair by scheme.

  | Token | Theme | Old | New |
  | --- | --- | --- | --- |
  | `--status-success` / `--diff-added` | Light | `#3f6a3b` | `#38624c` |
  | `--tone-local` | Light | `#44701a` | `#45770e` |
  | `--tone-local` | Dark | `#a8d26b` | `#bbd950` |
  | `--accent-heart` | Light | `#b8326a` | `#bd3073` |
  | `--accent-heart` | Dark | `#f27aa8` | `#f673b6` |
  | `--tone-app` / `--console-root` | Dark | `#b79cff` | `#c399fe` |

  The `:root` default and its dark media query mirror the official values.
- Community values are listed in each `themes.css` block's "Glyph tones" line.
  Some themes also moved warning or the remote's blue a few lightness steps.
- The density check used a throwaway browser harness on the running Vite
  server: History with this repository's last 160 versions, eight synthetic
  authors, the newest 48 versions rewired into four parallel branches with
  merges, and a version with nine mixed files and a diff. A script counted
  saturated hues per zone in GitOdile Light, GitOdile Dark, Catppuccin Mocha and
  Dracula. Results:
  - The timeline carried two tones in the official themes, because lanes are
    muted and avatars pastel. The community themes added their violet accent.
  - The official diff was its two tints. The community themes added their
    canonical syntax hues, which readers of those themes expect.
  - The file tree was the densest zone. Its file-type icons are identity and
    stay. Its open folders' dots were the only redundancy.
  The harness was removed before commit.
- `FileTreeFolderButton` renders the kinds only while `!row.expanded`. The
  count stays, and the folder's accessible name is unchanged because the dots
  were `aria-hidden`.

# Validation

- `pnpm vitest run src/architecture src/shared/theme src/features/settings`:
  174 tests passed after the theme changes.
- `pnpm vitest run src/features/changes src/features/history`: 20 files, 339
  tests passed after the folder change.
- The maintainer checked the official themes in the running app on 2026-11-03.
  The community themes were checked by the contract and in the harness, not in
  the running app.
- Harness, GitOdile Dark: every open folder showed no dots, and folding `src`
  showed its two kinds beside its count of 4.
- Full gate on 2026-11-03, after the harness was removed: `pnpm run
  check:docs`, `check:architecture` and `check:frontend` passed (166 files,
  1,947 tests, build). `pnpm run check:rust` ran with `CARGO_TARGET_DIR` in a
  scratch folder because `tauri dev` held the shared target. Formatting and
  Clippy passed, and 693 of 694 tests passed. The one failure,
  `github_auth::tests::bounded_fake_gh_login_streams_code_and_returns_only_account_metadata`,
  timed out in a 38-minute run on a machine busy with `tauri dev`. Rerun
  alone, it passed in 4.6 s. This task changes no Rust.
