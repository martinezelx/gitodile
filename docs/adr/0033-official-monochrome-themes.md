# ADR 0033: Make the official GitOdile themes monochrome

- Status: accepted
- Date: 2026-10-19
- Amends: [ADR 0012](0012-layer-theme-tokens-and-ship-canonical-palettes.md)
  (the official palette's values) and
  [ADR 0013](0013-themes-own-the-actionable-accent.md) (the mascot's colour
  in the GitOdile themes)

## Context

The official GitOdile Light and Dark themes spent a green accent on the
interface: the primary action, selection, navigation, focus and the mascot.
During the Friendly Sheet work (ADR 0032) a black-and-white GitOdile, explored
in the style lab, was first built as a pair of official alternates beside the
green pair. Used side by side in the running app, the ink palette read calmer
and more credible for professional work, let the content's own colours (the
diff, project avatars, file icons, the History lanes) carry the screen, and
matches the app icon. The products that do this well show one consistent
recipe: Vercel's Geist (a ten-step neutral grey scale from `#f2f2f2` to
`#171717`, colour kept for states) and Linear (a near-neutral interface with
colour for meaning).

## Decision

1. **The official palette is ink.** `gitodile-light` and `gitodile-dark` —
   the default pair "match device" resolves between — carry warm stone
   greys (the warmth the green palette had, without its hue); the text's ink
   is the accent and the primary fill, with inverted text on it; hover,
   selection and the accent wash are ink washes; syntax is greys. The ids are kept, so a stored preference moves with them.
2. **The green palette is retired.** There are no alternates: two official
   themes, one contract, and the community palettes beside them.
3. **Colour belongs to content and meaning.** Added and removed lines, danger,
   warning, success, the remote's blue and the favourite heart keep a hue,
   toned down from the old GitOdile values. Glyphs borrow them as **glyph
   tones** (`--tone-remote`, `--tone-local`, and a violet `--tone-app`): the
   colour of an icon says what kind of thing it is — the remote, what is saved
   here, GitOdile itself — on "only on this computer" wherever it appears, the
   Overview's scene, the status bar's sync action and the header glyph of the
   dialogs; menu items themselves stay in the secondary ink.
   What identifies a thing keeps its own colours: project avatars (the brand
   layer, ADR 0012), file-type icons, technology marks, the History lanes and
   the console's root.
4. **The mascot follows the ink** in the GitOdile themes and the system
   default — black on light, white on dark — in the app and in the console
   art. Community themes keep ADR 0013's rule (their accent fill).
5. **Links are underlined at rest**: an ink accent no longer sets a link apart
   from the text around it by colour alone (WCAG 1.4.1).
6. **Same contract.** Both themes define every required token and pass
   `themeContrast.test.ts`; the `:root` default and its dark media query keep
   mirroring them.

## Consequences

- The primary action is a solid black (or white) capsule, the heaviest object
  in the window; that is the trade-off of an ink accent.
- `--mascot-brand-fill` is gone: nothing in the cascade drew the green mascot
  any more. `--accent-brand` and `--accent-brand-contrast` are gone too:
  nothing in the interface painted with them once the mark was ink. The brand
  lime lives only in the app icon's sources (`scripts/icons/mascot.mjs`), and
  `styleComposition.test.ts` guards against the token coming back.
- The titlebar toggle and "match device" are unchanged: they still flip
  between `gitodile-light` and `gitodile-dark`.
- `--tone-local` is a theme token, required of every theme: the official
  themes give it the brand's lime (`#44701a` / `#a8d26b`) so "saved here"
  reads apart from success and added lines; community themes keep their
  success green. The favourite heart takes its own raspberry
  (`#b8326a` / `#f27aa8`) rather than danger's red, and the light remote
  blue darkened to `#2a66a6` so it stays at 4.5:1 on a selected row.
  *Amended 2026-11-03:* `themeContrast.test.ts` now holds every pair of glyph
  tones at least 10 apart in OKLab in every theme. The official lime, green,
  heart and dark violet moved a few steps to pass (DESIGN.md has the current
  values), and community themes no longer give "saved here" their success
  green or the heart their red: each takes another hue of its own palette.
- Two greens, one meaning each: lime for "saved here, waiting to publish"
  (publish, a new project) and success green for "done" (every completion
  tick, a saved version, added lines). Selection ticks stay in the ink.
- A first pass in pure neutral greys (Geist) read cold and left the Overview's
  remote and local markers in ink; the warm greys and the glyph tones are the
  correction, both measured by `themeContrast.test.ts` through the status
  tokens they borrow.

## Alternatives considered

- **Official alternates beside the green pair** (`gitodile-mono-light` /
  `-dark`, this ADR's first form). Built and tried, then dropped: two official
  pairs doubled the palettes to test and kept the louder one as the default.
- **Fully greyscale, states included.** Rejected: a failed check, a removed
  branch or an overlap in grey hides a consequence (`AGENTS.md`).
- **Keep the mascot green.** Rejected for now: a single green mark in an ink
  window reads as a stray accent, and the ink one matches the app icon.
