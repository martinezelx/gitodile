---
id: 185
title: Make the official GitOdile themes monochrome
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

GitOdile Light and GitOdile Dark become an ink palette — neutral greys and the
text's own ink as the accent, Vercel/Linear style — with light touches of
colour where colour carries meaning or identity. The green-accent palette is
removed.

# User outcome

The window reads calm and professional; what stands out in colour is the
content (what was added or removed, what is at risk or failing, which project,
which file type) rather than the interface around it.

# Context

Started as two official **alternates** (Monochrome Light/Dark beside the green
pair) explored in the style lab during task 183
(`work/assets/style-lab/style-lab.html`, style "Monocromo"). After using them
in the running app the owner changed the approach: the ink palette becomes the
official one and the green themes go. Decisions taken with the owner:

- Reuse the `gitodile-light` / `gitodile-dark` ids; delete the green values.
- The mascot stays in ink for now, black on light and white on dark, so it
  matches the app icon.
- Keep the colour touches that exist today — diff, danger, warning, success,
  the heart, project avatars, VS Code file icons, technology logos, History
  lanes, the console root — and judge in the app whether more is needed.

## How others do it

- **Vercel (Geist)** — a ten-step neutral grey scale (`gray-100` `#f2f2f2` …
  `gray-1000` `#171717`), white and near-white backgrounds, the primary action
  in the darkest grey; colour reserved for states.
  Source: https://vercel.com/design.md
- **Linear** — a near-neutral interface where colour marks status, priority
  and labels, not chrome.
- **Monochrome editor themes** (Monochromator, White for VS Code) take syntax
  to greys and tint only selection.

# Palette

The values live in `src/styles/themes.css` and DESIGN.md § Theming; in short:
neutral greys, ink accent and fill with inverted contrast, ink washes for
hover/selection, greys for syntax, toned-down green/red/amber for success,
danger/removed and warning, ink for information.

# Scope

- ADR 0033: the official palette is ink (amends ADR 0012 and 0013).
- `src/styles/themes.css`: `:root`, its dark media query and the
  `gitodile-light`/`gitodile-dark` blocks carry the ink values; the
  alternate blocks are gone.
- `src/shared/theme/`: the alternate records and `alternatePairOf` removed;
  the toggle flips the official pair as before.
- Mascot and console art in the ink in the GitOdile themes and the system
  default; `--mascot-brand-fill` removed.
- Inline links underlined at rest.
- Warm stone greys instead of pure neutral ones; the remote's blue back in
  `--status-renamed`.
- Glyph tones in `tokens.css` (remote, local, app) on the dialogs' header
  glyphs (Create project, Clone, Connect a remote, Update, Get changes, What's
  new, Shortcuts, Report a problem), the Overview's scene and origin mark and
  the status bar's sync action. Menu items keep their secondary ink.
- Palette review fixes: `--tone-local` as a required theme token (lime in
  the official themes, success green in community ones), a raspberry
  `--accent-heart` apart from danger, and the light remote blue at `#2a66a6`
  for 4.5:1 on a selected row.
- Two greens: completion ticks (next step "All in order", dialog and Home
  setup steps) in success green; Create project and the publish dialog in
  the local lime (`Dialog` tone `local`).
- "Only on this computer" as one shared piece (`shared/ui/localOnly.tsx`) in
  Overview, History and Branches, in the local tone; a published version's pill
  takes the remote's blue so the two read apart.
- DESIGN.md § Theming: the official table, the mascot rule, the accent prose.

# Acceptance criteria

- [x] Settings › Appearance shows the three official cards (System, GitOdile
      Light, GitOdile Dark) and no Monochrome cards.
- [x] Only diff, danger, warning, success, the remote's blue and the heart
      keep a hue among the theme tokens; identity colours (avatars, file icons, logos, lanes) are
      untouched.
- [x] The mascot is black on GitOdile Light and white on GitOdile Dark, in
      the app and in the console art.
- [x] `themeContrast.test.ts` passes for both themes.
- [x] ADR 0033 and DESIGN.md § Theming updated.
- [x] The greys stay warm in both themes and pass the contrast test.
- [x] The origin cloud, "Only on this computer" and the scene carry the
      remote's blue and the local green, adapted per scheme, and so do the
      dialogs' header glyphs; "only on this computer" is shared by Overview,
      History and Branches.
- [x] Checked in the running app on Overview, Work (with a diff), Branches,
      History, Home and Settings, in both themes.

Checked by the owner in the running app (`tauri dev`) during the work, and
in a browser harness that rendered the real components on this repository's
own data, in the official light and dark themes.

# Implementation notes

- The first pass used Geist's neutral greys; the owner asked for the old
  warmth back, so the values moved to Tailwind's stone scale (secondary ink
  `#625d58` for margin on the control fill).
- With the alternates gone, `isOfficialTheme` and the titlebar toggle are back
  to their pre-185 behaviour; the toggle test for alternates was removed.
