---
id: 090
title: Give the changelog its own surface and return About to identity
status: done
priority: normal
type: improvement
areas:
  - frontend
  - accessibility
  - documentation
created: 2026-08-30
completed: 2026-08-30
parent:
queue:
---

# Goal

Separate the two things task 086 merged into one dialog. About goes back to
being the product-identity surface and is reached from the GitOdile mark in
the titlebar. A new Changelog dialog owns release notes, opens from the status
bar version tag, and is listed beside About in the titlebar menu.

# User outcome

Someone who wants to know *what the app is* clicks the crocodile in the corner
— the conventional place for it. Someone who wants to know *what changed in
this build* clicks the version they can already see in the status bar. Neither
question hides inside the answer to the other, and both surfaces are also
reachable from the toolbar menu and the command palette.

# Context

Task 086 put a bounded, localized release summary inside About because About
was already the only dialog the version tag could open. That made About two
documents in one: identity plus a build report. The mark in the titlebar,
meanwhile, is inert — the one control every desktop app maps to About.

Release notes are still bundled with the build and read with no network
request. A future application updater may report through the same surface but
must keep its remote state separate from these local notes.

# Scope

- Remove the release-notes section from the About dialog; keep its mark,
  heading, description, technical details, diagnostics copy, and footer.
- Make the titlebar GitOdile mark an accessible button that opens About,
  without breaking the window drag region around it.
- Add a Changelog dialog styled from the same shell as About and adapted to
  list releases: version, lifecycle channel, date, the running-version marker,
  and that release's notes.
- Open the Changelog from the status-bar version tag instead of About.
- Add a Changelog entry to the titlebar menu next to About, and to the command
  palette next to About.
- Extend the local release model from one current release to an ordered
  changelog whose first entry is the current build.
- Keep every string localized in English and Spanish.
- Update `DESIGN.md` where it states the version tag opens About.

# Out of scope

- Installing or configuring Tauri's updater plugin.
- Any network request for release notes or update checks.
- Inventing release history for versions that were never shipped. The changelog
  starts at the current build.
- A dedicated Changelog screen, navigation destination, or route. It is an
  overlay, like About.

# Acceptance criteria

- [x] About contains no release notes and still reports system, system
      version, Git, and the copy-diagnostics action.
- [x] The titlebar mark is a button with an accessible name, a visible focus
      ring, and it opens About. It stays the unadvertised route: no tooltip and
      no hover plate, only a response on the silhouette itself. Dragging the
      window by the surrounding titlebar still works.
- [x] The status-bar version tag opens the Changelog, with an accessible name
      that names the changelog rather than About.
- [x] The titlebar menu lists both Changelog and About; the command palette
      lists both.
- [x] The Changelog lists releases newest first, each with version, channel,
      date, and its notes, and marks which release is running.
- [x] Release version, channel, date, and note identifiers come from one typed
      local model.
- [x] Escape closes the Changelog, focus is trapped while it is open, and focus
      returns to whatever opened it.
- [x] Every new string exists in English and Spanish.
- [x] `pnpm run check` passes.

# Relevant files

- `src/app/AppOverlays.tsx`
- `src/app/ChangelogDialog.tsx` (new)
- `src/app/appRelease.ts`
- `src/app/App.tsx`
- `src/app/StatusBar.tsx`
- `src/app/TitlebarMenu.tsx`
- `src/app/translations.ts`
- `src/app/app-shell.css`
- `DESIGN.md`

# Dependencies

Builds on task [`086`](086-release-details-from-status-bar.md), which
introduced the typed release model and the status-bar release button.

# Decisions

- **The Changelog reuses the `.about-dialog` shell rather than a new one.**
  That is already how the shortcuts dialog is built (`about-dialog
  shortcuts-dialog`), so "same style as About, adapted" is an existing pattern
  and not a second dialog language.
- **The `.about-release*` rules move to `.changelog-*` rather than being
  duplicated.** About stops using them entirely, so leaving them behind would
  leave dead selectors named after the wrong owner.
- **The changelog ships one entry.** `AGENTS.md` forbids inventing a historical
  changelog, so `v0.1.0 · alpha` is the only entry. Its notes are widened from
  the three task-086 lines to cover what this alpha build actually does, which
  is truthful for a first tracked release and is what makes the surface worth
  opening.
- **The status-bar tag opens the Changelog, not both.** The version is a build
  fact; the changelog is what a build fact is for. About stays one click away
  in the mark and the menu.
- **No `React.lazy`.** `AGENTS.md`: overlay panels are eager, because an
  overlay opens from a click with no navigation to mask a fallback frame.

# Implementation notes

`src/app/appRelease.ts` grew from one current release to `APP_CHANGELOG`, an
ordered `AppReleaseEntry[]` with version, channel, ISO date, and note ids.
`CURRENT_APP_RELEASE` is now the head of that list, so the status bar, About's
diagnostics block, and the changelog's running-version marker cannot disagree
about which build this is. Dates are stored ISO and formatted with
`Intl.DateTimeFormat` at render time, so one entry serves both languages.

`src/app/ChangelogDialog.tsx` is new and owns its own ref and `useModalFocus`,
so `AppOverlays` mounts it with two props instead of carrying a sixth block of
inline dialog markup. It renders `<ChangelogDialog>` unconditionally and the
component returns `null` while closed — eager, per the overlay rule in
`AGENTS.md`.

The `.about-release*` rules were renamed to `.changelog-*` rather than copied:
About stopped using them, so leaving them would have left selectors named after
the wrong owner. `.changelog-dialog` reuses `.about-dialog` for the surface,
close button, eyebrow and heading, and only widens it to 460px.

The titlebar mark became a 30px round button. `data-tauri-drag-region` stays on
the wrapper, because Tauri reads that attribute off the element under the
pointer — verified by hit-testing the mark's centre (it resolves to the mark,
not the drag region) and confirming an 866px drag strip remains at 1168px wide.

It first shipped with a tooltip and a `--surface-hover` plate, which made the
identity read as the toolbar's first button and advertised a route whose whole
value is being the quiet one. Both were removed on review. The response now
lives on the silhouette: the glyph deepens toward `--text-primary` on hover and
presses with the rail's `scale(0.94)`. The accessible name stays — it is
invisible to a sighted user, and without it the button is unnamed to a screen
reader — and so does the 30px target, which costs no ink now that nothing
paints the box.

The three task-086 notes were widened to six covering what the alpha build
actually does. `releaseDetails` was reworded because the behaviour it described
changed: the version tag now opens these notes rather than About.

# Validation

- `pnpm run check` — documentation, architecture, TypeScript, 481 frontend
  tests, production build, `cargo fmt`, Clippy, and 306 Rust tests all passed.
- `pnpm run check:frontend` — re-run after the final contrast fix; passed.
- Measured in the running app at 1280x720 and at the supported 900x620
  minimum. The dialog is 460x640 and does not scroll at 1280x720; at 900x620 it
  caps at 572px and scrolls (639px of content in a 570px box) with no
  horizontal overflow.
- Contrast measured live against the resolved dialog surface. The
  running-version badge is 10px bold — normal-size text for WCAG — and at the
  14% tint it first shipped with it measured 4.47:1 on light, under AA. At 12%
  it measures 4.57:1 on light and 6.93:1 on dark. The changelog's glyph badge
  measures 4.58:1 / 6.93:1 against a 3:1 non-text requirement, and the titlebar
  mark keeps `--accent-primary`'s documented 5.09:1 on light and 11.46:1 on
  dark.
- Focus trapping and focus restoration are covered in
  `src/app/changelogDialog.test.tsx`; they could not be measured in the browser
  because the preview pane was hidden and `requestAnimationFrame` does not fire
  there.
- Verified in the running app that About no longer renders a release list and
  that the mark opens it.
- After the review pass: confirmed the mark carries no `data-tooltip`, keeps
  its `aria-label`, and computes `background-color: rgba(0, 0, 0, 0)` while
  genuinely `:hover` (checked with `matches(':hover')`, not a simulated class).
  Its hover color measures 6.85:1 on light and 12.97:1 on dark against
  `--surface-app`, both stronger than the resting 5.09:1 and 11.46:1.
