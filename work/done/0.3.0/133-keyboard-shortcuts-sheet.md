---
id: 133
title: Rework the keyboard-shortcuts sheet
status: done
priority: normal
type: feature
areas:
  - frontend
  - design
  - accessibility
created: 2026-09-27
completed: 2026-09-27
parent:
queue:
---

# Goal

Turn the titlebar's "Keyboard shortcuts" dialog into a complete, grouped,
platform-aware sheet: list the shortcuts the app actually implements, group them
with captions, draw each key in the running platform's own form, separate the
title from the close control, keep the close control reachable when the sheet
scrolls, and give the rows a light press affordance.

# User outcome

Opening **Keyboard shortcuts** shows every app-level shortcut, grouped and
scannable, with the combinations printed on the reader's own keys — `⌘`/`⇧` on a
Mac, `Ctrl`/`Shift` elsewhere — under a header tile that wears the platform's
mark (Windows, Apple or Tux). The title no longer collides with the close
button, the header stays pinned while the rows scroll on a short window, and
pointing at a row taps its keys in order instead of raising the text caret.

# Context

- The dialog lived in `src/app/AppOverlays.tsx` and extended About's shell
  (`.about-dialog.shortcuts-dialog`), with the close button as a direct child
  positioned by the sticky-negative-margin rule in `.about-dialog >
  .dialog-close-button`. With a left-aligned `--text-display` title at 380px
  that placement let the long title run under the close control. About hides the
  collision only because its title is centred in a hero column.
- The list carried a hairline `border-top` between every row, against
  `DESIGN.md` § Visual character, which separates rows inside a list with space
  and divides only one *group* from the next.
- `MOD_KEY_LABEL` in `src/app/branding.tsx` gave `⌘`/`Ctrl` for the modifier
  alone; there was no platform-aware `Shift`, keycap symbol form, or platform
  identity.
- The app's real app-level shortcuts were audited from their handlers:
  `App.tsx` (`handleShortcut`), `ChangesPanel.tsx` (`⌘/Ctrl+S`) and
  `BranchesPanel.tsx` (`F2`).
- `DESIGN.md` § Accessibility states keyboard shortcuts must use platform
  conventions; the sheet is where a reader sees them.

# Scope

- Rebuild the sheet: a header row (keyboard tile with the platform mark, title,
  close), groups with captions, rows without per-row rules.
- List the implemented shortcuts: command palette, Settings, sidebar, next and
  previous project, save a version, rename a branch, close dialogs.
- Platform-aware key labels: `⌘`/`⇧`/`esc` on macOS and iOS, `Ctrl`/`Shift`/`Esc`
  elsewhere, named by `modifierKeyLabels`.
- Platform identity: `OperatingSystemMark` in a corner badge on the header tile,
  with an accessible name and tooltip from `describePlatform`.
- Fix the title/close collision; make the header sticky with its own top inset;
  remove the text caret; add the sequential press animation.
- Record the platform-convention rule in `DESIGN.md`.

# Out of scope

- Screen-local shortcuts that are not app-level (arrow-key list navigation,
  command-palette internals, popup-menu letter search).
- A searchable or filterable shortcut list; a remapping UI.
- Any change to the shortcuts themselves or to their handlers.

# Acceptance criteria

- [x] The sheet lists the app-level shortcuts, grouped, with the row set matching
      the handlers in `App.tsx`, `ChangesPanel.tsx` and `BranchesPanel.tsx`.
- [x] Keys render per platform: `⌘`/`⇧`/`esc` on Apple platforms, `Ctrl`/`Shift`/
      `Esc` otherwise, verified by test with the mocked Windows bridge.
- [x] The header tile wears the platform mark only for a recognised platform
      (Windows, macOS, Linux) and carries an accessible name and tooltip.
- [x] The title and the close control cannot overlap; the title stays on one line
      and truncates rather than sliding under the button.
- [x] The header is sticky with its own top inset and bled side padding, so it
      pins without content showing above it and the first row keeps clear air.
- [x] Pointing at a row taps its keys in order; the sheet keeps the default
      cursor instead of the text caret; the motion is withdrawn under
      `prefers-reduced-motion` and the app's reduced-motion preference.
- [x] Translations cover the new captions and the platform label in English and
      Spanish.
- [x] `pnpm run typecheck`, `pnpm run check:architecture`, `pnpm run check:docs`,
      `pnpm run test` and `pnpm run build` pass.

# Relevant files

- `src/app/AppOverlays.tsx`
- `src/app/app-shell.css`
- `src/app/branding.tsx`
- `src/app/translations.ts`
- `src/app/aboutDialog.test.tsx`
- `DESIGN.md`

# Dependencies

None.

# Decisions

- **Keep About's document shell.** The sheet is a document to read, not a
  question to answer, so it keeps `.about-dialog` and its roomier padding rather
  than moving to the shared action-dialog shell (§ Dialogs).
- **Move the close button into a header row** instead of restating the sticky
  self-placement. A flex row of tile, title and close removes the collision by
  construction; the title takes the free width with ellipsis as a backstop.
- **Give the dialog `padding-top: 0` and let the header carry the inset.** A
  negative top margin cannot raise a sticky element: sticky clamps the box to its
  containing block, so the margin only pulled the rows up under the header (a 4px
  gap). The header's own `padding-top` (24px) both sets the inset and pins flush
  at the scrollport top.
- **First group has no caption.** A caption there collided with the header tile
  and repeated the dialog's own title; the remaining groups keep theirs.
- **A wash, not `--surface-hover`, for the row hover.** The resting keycaps use
  `--surface-hover`; an opaque row fill would swallow them, so the fill mixes the
  token down to 60%.
- **Sequential tap over a held press.** The keys tap in the order they are
  pressed (`Ctrl`, then `Shift`, then the key) and return to rest, which reads as
  a keypress rather than a stuck key. Duration is `2 × --duration-normal`
  (360ms) with `--duration-normal`-scaled delays.

# Implementation notes

- `modifierKeyLabels(platform)` replaces `MOD_KEY_LABEL` (removed as dead code);
  it falls back to the user-agent guess when the OS bridge is absent so a plain
  browser build is still correct.
- The badge and tile are no longer `aria-hidden`: the keyboard glyph is hidden
  individually and the badge takes `role="img"` with
  `t.shortcutsPlatformLabel(describePlatform(...))` as both its accessible name
  and its tooltip.
- The four groups are built inline from translated labels; the first has
  `caption: null`.
- CSS is confined to `src/app/app-shell.css`; motion uses `transform` and the
  faked keycap depth only, never the box, so a row cannot shift under the
  pointer. `@keyframes shortcuts-key-press` is disabled in the reduced-motion
  media block.
- Verified against the production CSS with a static mockup of the sheet rendered
  in headless Chrome, measuring the header inset (24px) and the icon-to-first-row
  gap (36px, up from 4px).

# Validation

- `pnpm run typecheck` — passed (`tsc -b`, no output).
- `pnpm run check:architecture` — passed (466 modules).
- `pnpm run check:docs` — passed (Markdown, task ids, app-update, release and
  icon checks).
- `pnpm run test` — passed; one `App.test.tsx` notification test is timing-flaky
  under the full parallel run and passes in isolation, unrelated to this change.
- `pnpm run build` — passed.
- `pnpm run check` — the aggregate gate (docs, frontend, Rust) is run before the
  commit; Rust is untouched.
