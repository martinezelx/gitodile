---
id: 128
title: About leads with the identity and reports whether the build is current
status: done
priority: normal
type: design
areas:
  - frontend
  - branding
  - accessibility
created: 2026-09-22
completed: 2026-09-22
parent:
queue:
---

# Goal

Rework the About dialog so it leads with one identity-led layout, answers "am I
current?" without leaving the dialog, and reads as one visual language from top
to bottom instead of three things competing inside it.

# User outcome

Opening About shows the crocodile mark at hero scale, the correctly cased
`GitOdile` name, the promise, the running version, and one line that names the
update state — "Up to date · What's new", or the honest state when the build
cannot answer. `Your system` carries a short Copy action at its head, and
`Built with` credits three layers as inline rows. Everything fits one screen at
the default window with no scroll.

# Context

The dialog described in task 104 and task 057 was complete but flat: the mark
was a 24px separator between the name and the promise, the version had no update
affordance even though the release model already knows the answer, "Built with"
spent four bordered tiles on a fact nobody reads down, and the footer ("Made
with …") restated the credits heading one line below it. A set of HTML mockups
explored four families; the chosen one ("3A") combined the existing body with the
bare hero mark and a branch that names the update state. The mockups were
scratch and are deleted; this task records the result.

# Decisions

- **The mark leads at hero scale, in the app's canonical identity treatment.**
  The bare silhouette in `--accent-primary`, never a tile, 92px wide on its own
  line, then the name at `--text-hero` and the promise at `--text-title`,
  centred. The `h2` still holds the name and the promise, so the dialog's
  accessible name identifies the app before stating its promise, and the
  decorative mark stays out of the accessibility tree.
- **The update branch names the state, and is never blank.** `aboutUpdateStatus`
  maps the release model's `UpdateState` to a short label: `current` →
  "Up to date" (new `aboutUpToDate` key), `idle` → the update surface's own
  "Not checked yet", `unavailable`/`failed`/`cancelled` → a short
  "Updates unavailable" (new `aboutUpdateUnavailable` key), and the actionable
  states reuse the update copy. A development build configures no update feed
  (`src-tauri/tauri.conf.json` → empty endpoints), so it reports "Updates
  unavailable" rather than going silent; a release with a feed reports "Up to
  date". Only a state with nothing to say (`installing`) stays silent.
- **Copy is a text action at the head of the section it copies**, not a
  full-width button below the list: the label and the way to put it on the
  clipboard are one thing. Its visible label is the short "Copy" (`aboutCopy`),
  because the heading already names what is copied; its accessible name stays
  the full "Copy system info".
- **"Built with" is three credits, not four, and not tiles.** Tauri, React and
  Rust, inline as mark + name + version. TypeScript was dropped on request so
  the row fits one line without shrinking type or tearing a version away from
  its name; the dropped credit also removed its host from the `opener` scope.
- **The credits heading keeps the section's left edge**, matching `Your system`
  above it, while the row centres as a set.

# Scope

- `src/app/AppOverlays.tsx`: the hero header, the update line, `aboutUpdateStatus`,
  the copy text action and the divider.
- `src/app/app-shell.css`: the About block — hero, update line, section head,
  credits, tighter rhythm — and the restored padding for the changelog and the
  shortcut sheet, which share `.about-dialog`.
- `src/app/translations.ts`: `aboutCopy`, `aboutUpToDate`, `aboutUpdateUnavailable`.
- `src/app/stack.ts`, `src/app/vendorMarks.tsx`, `vite.config.ts`,
  `src/vite-env.d.ts`: the three-layer credits, shell-outwards.
- `src-tauri/capabilities/default.json`: drop the unused TypeScript host.
- `src/styles/base.css`: the reduced-motion list only names the credit arrow now.
- `src/app/aboutDialog.test.tsx`, `src/architecture/branding.test.ts`,
  `src/architecture/styleComposition.test.ts`: the new structure, the update
  states, the three-layer stack, and the third link cursor.
- `DESIGN.md`, `README.md`: the identity, the update line and the three credits.

# Verification

- `pnpm run check` — documentation, frontend architecture, `tsc`, the frontend
  suite, the production build, and the Rust gates.
- New/updated tests: the hero order (mark, then `h2` name and promise), the
  update line for `current` and `unavailable`, the copy control's short visible
  label versus its full accessible name, and the three-layer order and hosts.
- Not verified in the running Tauri app: this machine has no automatable browser
  or drivable WebView, so the fit and the visual result were checked against a
  faithful static preview while it existed; that preview is deleted.
