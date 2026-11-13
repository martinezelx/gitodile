---
id: 135
title: Overview wears the project's icon and says each fact once, and History says You
status: done
priority: normal
type: feature
areas:
  - frontend
  - design
created: 2026-09-28
completed: 2026-09-28
parent:
queue:
---

# Goal

Bring Overview's page header, band and two cards back in line with the
Journey page rules in `DESIGN.md`: the project shows its own icon, the header
holds no form-control chrome, one accent fill per page, and no fact — "all
saved", the branch's name, "not published" — is said more than once.

# User outcome

The header shows the same icon the rail shows for the project (chosen emoji,
detected technology or initials) and opens its icon picker when pressed. The
branch reads as a labelled fact ("Branch" over the name) rather
than a bordered pill, and the settings gear is a bare glyph. The band gives
its wide column to the current step, says where publishing goes on one line,
and says when the project was last saved. With nothing changed, the files card
shrinks to a tick and a tip and Recent history takes the width. Recent history
labels its unpublished run once, shows publish actions only on hover or focus,
says "You" for the user's own versions and "current" for the branch stood on.
The History screen follows suit: the user's own rows wear a person glyph in
place of their initials, and the detail strip says "You" and "current".

# Context

- The header tile was a generic `FolderGit2` in the accent, although the rail,
  the switcher and the recents already resolve a per-project identity
  (`ProjectAvatar`, `resolveProjectIdentity`, task 130).
- The branch selector and the gear were the page's only bordered controls, set in
  15px heavy mono, with no caption saying what the name is.
- With a clean tree, Changes, Save and the files card all said "everything is
  saved"; the branch's name appeared in the header, the Publish hint and the first
  history row; every unpublished history row carried a solid accent node and
  "Not published", competing with the band's current step.
- The Publish tile's hint spent two lines on "Local snapshot" and the remote
  ref, and the widest column was fixed on Save whatever the current step was.

# Scope

- Header: `ProjectAvatar` as the tile (button into project settings' `icon`
  section, pencil badge on hover/focus), the detected technology as a chip
  before the path, the labelled borderless branch selector
  (`BranchQuickSwitch` `label`), a hairline, and a bare gear.
- Band: wide column follows `activeStep` (`journey__steps--wide-*`); Publish hint
  "to origin", naming the destination only when it differs from the local branch;
  last-checked time moved beside the refresh; Save's hint says when HEAD was
  saved (from the cached History page); clean-state Changes copy; note under the
  band with a subject.
- Changed files: compact clean state with a tip; `overview-columns--clean` lets
  History take the width.
- Recent history: "Only on this computer" / "Published" group labels instead of
  per-row "Not published"; ringed nodes with the publish node shown on hover,
  focus or touch; "You" for the user's own versions (`isSelfAuthor`, matched on
  the global Git email); `HistoryRefBadge` `currentLabel` shows "current".
- History screen: `AuthorAvatar` draws a person glyph on the neutral tint for
  the user's own versions, with "You (name)" on its tooltip and in the row's
  description; the detail strip says "You" (name on hover) and passes
  `currentLabel` to `HistoryRefBadge`. `selfEmail` is threaded from `App`
  through `HistoryScreen` and `HistoryPanel`.
- `DESIGN.md` updated for the header, the band, Recent history and the History
  timeline's author avatar.

# Out of scope

- An Overview shortcut to the Console: the rail and the command palette already
  reach it one step away, and a button with no context would only duplicate
  them.
- The status bar, which still repeats the branch and the pending count.

# Acceptance criteria

- [x] The header tile is the project's own identity chip and opens the icon
      section of project settings.
- [x] No bordered control rests in the header; the branch selector carries a
      caption and the band's value size.
- [x] The current step takes the band's wide column; with nothing waiting the
      columns are equal.
- [x] The Publish tile names the destination branch only when it differs from
      the local branch; the last-checked time sits beside the refresh.
- [x] With a clean tree no two surfaces say "everything is saved"; Save shows
      when the project was last saved.
- [x] Recent history labels the unpublished run once and shows no solid accent
      node at rest; "You" and "current" replace the name and the branch.
- [x] The History screen marks the user's own versions with a person glyph and
      says "You" and "current" in the detail strip; the Details section still
      gives the full name and email.
- [x] English and Spanish strings for every new label.
- [x] `pnpm run check` passes.

# Relevant files

- `src/features/overview/OverviewPanel.tsx`
- `src/features/overview/JourneySection.tsx`
- `src/features/overview/journey.ts`
- `src/features/overview/ChangedFilesSection.tsx`
- `src/features/overview/HistorySummarySection.tsx`
- `src/features/overview/overview.css`
- `src/features/overview/translations.ts`
- `src/features/branches/BranchQuickSwitch.tsx`
- `src/features/branches/branches.css`
- `src/features/history/HistoryRefBadge.tsx`
- `src/features/history/author.ts`
- `src/features/history/HistoryPanel.tsx`
- `src/features/history/HistoryScreen.tsx`
- `src/features/history/history.css`
- `src/features/history/translations.ts`
- `src/app/App.tsx`
- `DESIGN.md`

# Dependencies

- 130 (project identity icons), for `ProjectAvatar` and the stored choices.

# Decisions

- **Identity chip, not an accent glyph.** The header's tile was the page's
  second accent fill; the project's own icon recognises it the way the rail
  does and leaves the band's current step as the one accent.
- **Labelled fact over toolbar or breadcrumb.** Of the four header layouts
  mocked up (labelled fact, toolbar capsule, branch in the path row, breadcrumb),
  the labelled fact reuses the band's own shape and is the only one that says
  what the name is.
- **"You" by email.** Names differ across machines and aliases; the global Git
  email is already read at startup (`useGitIdentity`). A project-local identity
  is not consulted, so versions saved under one show the name.
- **Last saved from History's cache.** The band subscribes to the same
  project-scoped History state Recent history reads and never starts a read.
- **A glyph, not the word, for "you" on History's rows.** The row's avatar
  slot is 18px and holds no text; a person glyph says it in the same space. It
  takes the neutral tint rather than the user's colour, since "you" never needs
  telling apart by colour, and a solo project's column stays as quiet as it was.
- **Publish node hidden at rest, not removed.** It stays in the tab order and
  appears on focus; on `hover: none` screens it is always shown.

# Implementation notes

- `BranchQuickSwitch` gained an optional `label`; without it the face is
  unchanged, so the status bar's selector is untouched. The face's tile, copy
  and label rules live in `branches.css`; the Overview-specific sizing in
  `overview.css`.
- `Journey.publish` gained `remote`, `destinationBranch` and `localBranch`.
- `HistoryRefBadge` gained `currentLabel`; both Overview's Recent history and
  the History detail strip pass it. The History timeline rows carry no badge.
- `isSelfAuthor` (`src/features/history/author.ts`) is the one rule for "is
  this mine", shared by both screens.
- Review fixes before committing: a `cached` sync status (read from local
  tracking refs) no longer lends its time to "Checked …" — only this session's
  last successful remote check does; Recent history labels runs by publication
  and never calls an `unknown` run "Published"; the unused `syncAheadMessage`
  string was removed.
- Verified in the browser against fixtures (clean, dirty, mixed history, a
  destination with another name, light and dark) through a throwaway harness
  under the Vite dev server, removed before finishing.

# Validation

- `pnpm run typecheck` — passed.
- `pnpm run test` — passed (overview, history, branches and architecture
  suites included).
- `pnpm run check` — passed (docs, architecture, frontend, Rust format, Clippy
  and tests).
