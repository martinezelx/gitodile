---
id: 152
title: Put What's new and manual download inside Updates settings
status: done
priority: normal
type: feature
areas:
  - frontend
  - settings
created: 2026-10-07
completed: 2026-10-07
parent:
queue:
---

# Goal

Settings › Updates shows release notes in place and offers the manual download
as its own way out, instead of leaving both to the update dialog.

# User outcome

- Someone who wants to know what changed reads the running (or offered)
  version's highlights, and every earlier version, without leaving Settings or
  opening a second dialog.
- Someone whose build cannot update itself — a store, a package manager, or a
  build with no updater — finds the GitHub releases page from Settings in any
  state, not only after a failed update.

# Context

The Updates section carried only the installed build's row and the startup
check switch. Release highlights reached the reader through the update dialog
(the offered release) and the What's new dialog (the bundled releases), and the
manual download appeared only inside the update dialog, and only for the error
codes whose copy recommends it.

The owner reviewed a browser mockup of the section before implementation and
asked for the manual download as its own topic, placed above an integrated
What's new, with copy in the shape of the other settings groups (one sentence,
at most two assertions).

# Scope

- A new **Other ways to update** group: a one-sentence description and an
  "Open GitHub Releases" action that calls the updater's existing
  `openManualDownload`.
- A new integrated **What's new** group: the offered release's highlights (when
  the feed carries them) or the running build's, then every bundled earlier
  version as a disclosure.
- The feature receives the bundled changelog from the shell as neutral data,
  because a feature may not import the app shell's release model.

# Out of scope

- Removing or changing the What's new dialog; the status bar and About still
  open it.
- Extracting the release-card and disclosure markup into a shared primitive
  (see Decisions).
- Cumulative highlights across skipped versions.

# Acceptance criteria

- [x] The Updates section lists the manual download as its own group; its
      button opens the releases page, in every state.
- [x] The section features the offered release's highlights when the feed
      carries them, otherwise the running build's; earlier versions open in
      place.
- [x] The running build is marked in the earlier list.
- [x] A release with no highlights says so rather than opening onto nothing.
- [x] English and Spanish copy; the What's new group stays out when the shell
      passes no changelog.
- [x] Tests cover the manual group and the integrated What's new.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/app-updates/UpdateDialog.tsx`, `translations.ts`,
  `app-updates.css`, `UpdateDialog.test.tsx`
- `src/app/AppOverlays.tsx`

# Dependencies

None.

# Decisions

- 2026-10-07 (owner): the manual download is its own group, placed above the
  integrated What's new, with one sentence of copy like the other groups.
- The shell passes `APP_CHANGELOG` as `SettingsReleaseEntry[]` into
  `AppUpdateSettingsControl`. The feature cannot import the app's release
  model, so the data crosses the same seam `installed` already uses; mapping
  `AppReleaseEntry` onto the neutral type is structurally assignable.
- The manual download is always offered here, matching the group's framing.
  The dialog keeps its narrower rule ("only where the failure's sentence
  recommends it"), because it answers a specific failure rather than listing
  ways to update.
- The release-card and earlier-disclosure markup is a smaller copy of the
  changelog's. Extracting one shared primitive would either make the shell's
  changelog import a feature component or move the primitive into `shared/ui`
  and rewrite an existing, tested surface; deferred until a third consumer or a
  review asks for it.

# Implementation notes

- `AppUpdateSettingsControl` gained `releases?: readonly SettingsReleaseEntry[]`
  and now renders, in order: the installed build row, **Other ways to update**,
  the integrated **What's new** (only when `releases` is present and non-empty),
  then **How you get updates**.
- `SettingsReleaseEntry` is the neutral `{ version, date, highlights }` shape
  the shell maps `APP_CHANGELOG` into. `WhatsNewSection`, `EarlierRelease`,
  `ReleaseBadge` and `formatReleaseDate` live in `UpdateDialog.tsx`; the
  highlights list reuses the shared `ReleaseHighlights` primitive.
- A candidate with no feed highlights leaves the running build as the featured
  release rather than showing an empty card; a bundled date (`YYYY-MM-DD`) and a
  candidate instant are both parsed without slipping a day.
- `app-updates.css` adds the `.whatsnew-*` vocabulary (card, badge, earlier
  disclosure, empty line), including a reduced-motion rule for the disclosure
  chevron.
- `AppOverlays.tsx` imports `APP_CHANGELOG` and passes it to the control.

# Validation

- `pnpm run check` (aggregate, 2026-10-07): exit 0 — documentation 284 Markdown
  files / 202 task ids; app-update contract and release-highlights checks;
  frontend architecture 567 modules; TypeScript build; Vitest 130 files /
  1289 tests (2 new: the manual group and the integrated What's new); Vite
  build; `cargo fmt`; Clippy with `-D warnings`; Rust tests 578 passed, 1
  ignored.
- The app was started with `pnpm run tauri dev` for an owner visual check; no
  automated computer-use pass was run. A first aggregate run failed only
  because the running dev app held `gitodile.exe`; the dev tree was stopped and
  the aggregate run then passed.
