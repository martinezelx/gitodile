---
id: 188
title: Bring every dialog and the notification centre in line with Friendly Sheet
status: done
priority: normal
type: design
areas:
  - frontend
  - design
created: 2026-10-20
completed: 2026-10-20
parent:
queue:
---

# Goal

Every dialog (except About) and the notification centre follow the same rules
the screens follow since Friendly Sheet (ADR 0032) and the ink themes
(ADR 0033): one title size, one rule for the header glyph, glyph tones instead
of status tones, one recipe for a card inside a dialog, hairlines only between
regions, actions with the vocabulary's icons only, plans that open in their
final shape, and dead ends as short messages. DESIGN.md states each rule once,
without the contradictions the review found.

# User outcome

Opening any dialog feels like the same app as the screen behind it: the same
weight of type, the same calm surfaces, colour only where it means something,
and the header says what kind of thing this is (the remote, this computer,
GitOdile itself, a warning, a deletion) before the sentence is read.

# Context

The design review of 2026-10-20 (artifact "Revisión de modales",
https://claude.ai/artifact/RTKNju2V9KcqTaaPv3pF4f) compared the 18 dialogs and
the notification centre with DESIGN.md after tasks 176 and 183–187. It found
15 cross-cutting problems (T1–T15) and per-dialog ones. The review was read
from code and CSS, not from screenshots: confirm each high-severity point in
the running app before changing it.

Queued at the end of the active queue, but taken next by explicit request
because it belongs to release 0.3.1.

# Decisions

Decided with Luis on 2026-10-20:

1. **Dialog titles are `--text-title` (17px).** The typography table wins;
   § Dialogs is corrected. Applies to `.app-dialog`, Settings, the shortcut
   sheet and What's new (About keeps its identity hero).
2. **Every dialog leads with its glyph.** One rule, no exceptions: plans,
   forms, confirmations and messages all carry the circular glyph beside the
   title, in the tone of what the dialog handles. Save and Publish take
   `local`, Discard and Delete branch `danger`, Get and Clone `remote`,
   Create project `local`, updates and the issue report `app`, plain
   confirmations (Close project, New branch, Switch branch) `neutral`.
3. **GitOdile itself is violet.** The Update dialog takes `app`; the tone table
   in DESIGN.md moves "Update dialogs" from Remote to App. Notifications use
   glyph tones, matching the dialog each one opens: new versions and published
   versions `remote`, branch gone from the remote and failed check `warning`,
   app update `app`. The `info`/`success`/`warning` notification tones go.
4. **Bordered lists may keep row hairlines.** DESIGN.md documents the
   exception: a bordered list whose rows are reordered or scanned densely
   (Settings' Navigation and Notifications) may divide its rows. Every other
   list separates rows with space: Publish's versions, Get's "What comes in",
   What's new's earlier releases.

Defaults chosen without asking (veto before implementing if any is wrong):

5. **One inner-card recipe:** a card inside a dialog is `--surface-card`, the
   subtle border, `--radius-surface` and no shadow. Rows and options inside a
   container stay `--radius-item`. Monospace text (the issue report, technical
   details) sits on `--surface-code`. `--surface-control` is only for controls.
   What's new's current release keeps its documented tint as the one exception.
6. **One "selected" recipe:** `choice-list__option--active` is the reference
   (secondary-ink border and 7% ink). Create project's mode cards adopt it and
   swap the native radio for the app's own; the repository browser row and
   Clone's source tabs use it or the segmented control.
7. **Vocabulary icons:** remove `GitBranch` (Create branch, Switch branch, Switch
   to this branch), `ArrowRight` (Choose destination), `RotateCw`/`Download`
   (updates), `GitMerge` on Get's primary (use `ArrowDownToLine`), and
   `Copy`/`Save`/`ExternalLink` in the issue report. Clone counts as "get", so
   `CloudDownload` stays on "Clone project"; Restore is the undo of discard,
   so `RotateCcw` stays and joins the vocabulary list in DESIGN.md.
8. **New branch's confirmation step:** its dismiss button becomes "Back"
   ("Atrás"), since it returns to the form rather than closing.
9. **Console's turn-off confirmation:** size `s` with a shorter title, and no
   second backdrop when it opens over Settings.
10. **Unread notifications:** drop the wash and the tinted border; the dot and
    the heavier title carry "unread".
11. **Settings stays a documented exception** to the three sizes, named in
    § Dialogs as the preferences workspace.

# Scope

## Shared shell (`shared/ui/dialog.tsx`, `primitives.css`)

- T1: title at `--text-title`.
- T4: the `accent` glyph and a done step's dot use a neutral fill
  (`--surface-control`), never `--surface-active`.
- T13: decide the banner radius with the Shape table (`--radius-surface`, or
  document the dialog banner as the exception) and apply it.
- T14: one backdrop class for `.app-dialog-backdrop`, `.dialog-backdrop` and
  `.settings-backdrop`.
- T11: `.clone-dialog__text-action` and `.save-version-detail__toggle` become
  `.app-dialog__link` (underlined at rest).
- `choice-list__option` on `--surface-card` (decision 5).

## Per dialog

- **Settings / Project settings:** header and group separators on
  `--border-subtle`; a hairline between the category rail and the content;
  insets aligned with the dialog's; inner cards (`settings-tool-inline`,
  `theme-card`, `project-icons-card`) on `--surface-card`; the active category
  in the shared selected recipe; Navigation and Notifications keep their
  bordered lists (decision 4).
- **Shortcut sheet:** remove the overridden `padding: 32px`; one document
  width shared with What's new.
- **What's new:** mark at 40px with a 20px glyph and the dialog's header gap
  and padding; earlier releases separated by space.
- **Updates:** `app` tone; the candidate card's radius; no extra margins
  (T12); no icons outside the vocabulary; fix the stale shell comments in
  `UpdateDialog.tsx` and `app-updates.css`.
- **Discard / Restore:** `danger` glyph on the discard confirmation, `local`
  or `neutral` on Restore; consequences and the kept copy as `DialogFacts`
  (the copy last, in the success tone); loading opens in its final shape with
  Cancel; the "Forget" question reuses the danger banner.
- **Save version:** `local` glyph; "Nothing to save" and planning failures as
  an `s` message with its own title and glyph; the breakdown in the secondary
  ink (T15); one field material for name and details; files list on the
  inner-card recipe.
- **Publish:** `local` glyph; a safe fact last; versions separated by space,
  using the shared version node / `LocalOnlyMark` vocabulary where it fits;
  blocked states as `s` messages; the branch's name out of the title.
- **Get project changes:** two or three facts with the safe one last;
  placeholders instead of the loading bar; a one-line title (detail to the
  subtitle); `Info` glyph on the informative banner; technical details on
  `.app-dialog__details`; `ArrowDownToLine` on the primary.
- **New branch / Switch branch / Delete branch:** glyphs (decision 2); names out of
  the titles; loading in final shape; risks and the blocked options as facts;
  "Back" in New branch's confirmation; the block-check on the inner-card recipe.
- **Clone:** links underlined; no footer hairline; the picked repository on
  the inner-card recipe; source tabs in the shared selected recipe; no
  `ArrowRight`; the empty-state glyph tile visible on the dialog surface.
- **Create project / Connect a remote:** mode cards in the shared recipe with
  the app's radio; nested fields on the inner-card recipe; at most three
  facts; names out of the progress and result titles.
- **Issue report:** no icons on its three actions; the report on
  `--surface-code`; preparing in its final shape.
- **Console confirmation:** decision 9.

## Notification centre

- Glyph tones per decision 3 (`NOTIFICATION_KINDS` in `domain.ts`,
  `notifications.css`, and Settings' event list that shows the same icons).
- Unread without wash or tinted border (decision 10).
- `.notification__action` becomes `secondary-button secondary-button--sm`.
- Cards on `--surface-card`; the empty-state tile at 40px.

## DESIGN.md

- § Dialogs: title size, the glyph rule (decision 2), Settings as the
  documented exception, the inner-card recipe, the banner radius, Restore in
  the icon vocabulary.
- Glyph tones table: Update dialogs under App; notifications' tones.
- Visual character: the bordered-list exception to row hairlines.
- Layout concept › notification bell: unread marked by the dot and weight.

# Out of scope

- About (its own identity shell).
- The other anchored popovers (project switcher, quick switch, date picker,
  filters, account picker) and the toasts.
- New dialog behaviour or copy beyond what the rules above require.

# Acceptance criteria

- [x] Each high-severity finding is confirmed in the running app before it is
      changed, and reported if it does not reproduce. *(Confirmed against the
      real components in the browser harness; two low findings did not
      reproduce and are noted above.)*
- [x] Every dialog title renders at 17px and fits one line in English and
      Spanish at the dialog's size with the glyph present. *(Checked for the
      harness dialogs in Spanish.)*
- [x] Every dialog shows a glyph beside its title, in the tone listed in
      decision 2; no glyph circle is tinted in any theme, community themes
      included. *(Enforced by `Dialog`'s types; Catppuccin Mocha checked.)*
- [x] No dialog contains an inner surface outside decision 5; no list outside
      the bordered-list exception draws a hairline between rows.
- [x] No button carries an icon outside the vocabulary (save, publish, get,
      discard, delete, restore; clone as get).
- [x] Discard, Switch branch, Delete branch, the issue report and Get open in
      their final shape with Cancel visible while the plan is read.
- [x] Save's and Publish's dead ends are `s` messages with a glyph.
- [x] Every inline text action in a dialog is underlined at rest.
- [x] Notifications use glyph tones; unread is the dot and the weight only;
      the action is the shared small secondary button.
- [x] DESIGN.md states each rule once; the typography table and § Dialogs
      agree; the tone table lists Update under App.
- [x] Light and dark themes and one community theme checked in the running
      app; keyboard focus and reduced motion unchanged. *(Every dialog but
      Updates was seen in the harness; Updates' changes are spacing, a radius,
      a tone and icons, covered by its tests.)*
- [x] Tests updated where they assert classes, tones or icons
      (`styleComposition.test.ts`, contrast tests, dialog and notification
      tests); `pnpm run check` passes.

# Relevant files

- `DESIGN.md` (§ Dialogs, Glyph tones, Shape, Typography, Visual character,
  Layout concept › notification bell)
- `src/shared/ui/dialog.tsx`, `src/shared/ui/primitives.css`
- `src/app/AppOverlays.tsx`, `src/app/app-shell.css`, `src/app/ChangelogDialog.tsx`,
  `src/app/IssueReportDialog.tsx`
- `src/features/settings/settings.css`
- `src/features/app-updates/UpdateDialog.tsx`, `app-updates.css`
- `src/features/changes/DiscardChangesDialog.tsx`, `changes.css`
- `src/features/save-version/SaveVersionDialog.tsx`, `save-version.css`
- `src/features/publish/PublishDialog.tsx`, `publish.css`
- `src/features/sync/GetTeamChangesDialog.tsx`, `sync.css`
- `src/features/branches/BranchesDialog.tsx`
- `src/features/clone/CloneDialog.tsx`, `clone.css`,
  `src/features/repository-browser/repository-browser.css`
- `src/features/initialize-project/InitializeProjectDialog.tsx`,
  `initialize-project.css`
- `src/features/console/confirmChanges.tsx`
- `src/features/notifications/NotificationCenter.tsx`, `domain.ts`, `icons.ts`,
  `notifications.css`

# Dependencies

None. Builds on 176 and 183–187.

# Implementation notes

Implemented on 2026-10-20 in the working tree of `release/0.3.1`.

- **Shell.** `Dialog` now requires `icon` and `tone`, and the `accent` tone
  is gone, so a dialog without a glyph no longer compiles. The title is
  `--text-title`. The glyph circle and a done step's dot are
  `--surface-control` in every tone, never `--surface-active`. The banner is
  `--radius-surface`. The block-check and `choice-list` options are on the
  inner-card recipe. `.app-dialog-backdrop` replaces `.dialog-backdrop` and
  `.settings-backdrop`, and a nested backdrop (Console inside Settings) is
  transparent. One pre-existing bug was fixed along the way: in
  `.app-dialog__foot` without a note, Publish's and Get's actions sat on the
  left (`margin-left: auto`).
- **Glyphs (decision 2).**
  - Close project: `FolderX` neutral.
  - Discard: `Trash2` danger. Restore: `RotateCcw` local.
  - Save: `Save` local; its dead ends are `Check` success or `TriangleAlert`
    warning.
  - Publish: `CloudUpload` local; same dead ends as Save.
  - New branch and Switch branch: `GitBranch` neutral. Delete branch: `Trash2`
    danger.
  - Updates: `app`.
  - Settings and Project settings: the `Settings` gear, in the shell's circle.
- **Titles without names.**
  - "Switch branch", with "You'll move to “x”." as the subtitle.
  - "Delete this branch?", with the name as the subtitle.
  - "Publish a new branch" and "Publish the branch again".
  - "Get and combine N versions".
  - "Creating the project…", "Project created" (the name moved to the
    description) and "Cloning the project…".
  - Console: "Run without asking?", now size `s`.
- **Dead ends.** Save's "Everything is saved" / "Can't save yet" and
  Publish's "Everything is published" / "Can't publish yet" are `s` messages.
- **Final shape while loading.** Discard, Switch branch, Delete branch, the issue
  report and Get open with placeholders, Cancel and the action held back.
  Get's executing phase keeps its `LoadingBar`.
- **Facts.**
  - Discard's consequences and its kept copy are `DialogFacts`, and the
    `.changes-discard-warnings` list is gone.
  - Delete-branch's options and the switch and squash recovery notes are facts.
  - New branch's risks are facts.
  - Get's safe facts are one line, last.
  - Publish gains a safe fact.
  - Create project drops "Then you'll review the remote…" (and its key).
  - Publish can still reach four facts (both computer facts + teammates +
    safe), and Get can reach four when merge, publish-after and combined
    files all apply. Both cases are rare and were left as they are.
- **Surfaces.** Inner cards moved to `--surface-card` with the subtle border
  and `--radius-surface`:
  - Settings' tool row, theme cards, project-icon cards, font and format
    pickers, and Git details;
  - the update on offer;
  - Save's files and saved details;
  - Publish's list and Get's list (rows separated by space);
  - Clone's picked repository;
  - Create project's modes and nested fields.

  Monospace detail (the failure output, the issue report) is on
  `--surface-code`.
- **Selected recipe.** Create project's modes (with a drawn round radio
  instead of the native one), Clone's source tabs and the repository row use
  7% ink plus the secondary-ink edge. The Settings rail uses the app rail's
  fill.
- **Icons removed.**
  - `GitBranch` from Create branch, Switch branch and Switch to this branch.
  - `ArrowRight` from Choose destination.
  - `RotateCw` and `Download` from the updater; `ExternalLink` from Manual
    download.
  - `GitMerge` from Get's primary.
  - `Copy`, `Save` and `ExternalLink` from the issue report.
- **Links.** Clone's text actions are `.app-dialog__link`. Save's detail
  toggle was already underlined, so the review was wrong there. The same goes
  for Save's textarea, which already wore the input's material.
- **Documents.** What's new and the shortcut sheet share 440px, a 28px inset,
  a 40px/20px glyph and `--text-title`. The duplicated `padding: 32px` rule is
  gone, and What's new's earlier releases are separated by space.
- **Notifications.**
  - Tones are `remote` / `warning` / `app`, in the panel and in Settings'
    event list.
  - Unread has no wash or tinted edge.
  - The action is `secondary-button--sm`.
  - Cards are on `--surface-card`; the empty tile is 40px.
  - `--accent-wash-strength` (and Solarized's override, plus its surface in
    `themeContrast.test.ts`) is removed, since nothing paints it now.
- **Left as is.**
  - Get's two disclosures keep their own chevron style, so the dialog stays
    consistent within itself.
  - Publish's rows don't adopt the timeline's version node, because there is
    no shared primitive for it outside the History and Overview features.
  - Settings' in-screen notices were not part of the review.

# Validation

- `pnpm run typecheck`: clean after each step.
- Targeted Vitest while iterating (`src/features/*` dialogs, notifications,
  settings, `src/architecture`, `src/shared/ui`, then `src/app`, overview,
  history and home): 76 and 31 files, all passing after five tests were
  updated for the new titles and facts.
- `pnpm run check` (docs, architecture, typecheck, 144 test files / 1555
  tests, build, `cargo fmt`, Clippy, Rust tests): exit 0.
- Visual: a throwaway harness under Vite (`harness/`, deleted afterwards)
  rendered the real dialogs through a fake Tauri bridge, in GitOdile Light,
  GitOdile Dark and Catppuccin Mocha:
  - Save: the form and "nothing to save";
  - Publish: the plan and "nothing to publish";
  - Get: the merge plan, and loading;
  - Discard: the plan, and loading;
  - Switch branch and Delete branch;
  - the notification panel.

  This found and fixed the left-aligned actions in `.app-dialog__foot`.
- Review pass before closing. It fixed three things:
  - the Settings header subtitle's margin was overridden by the rule after it;
  - the drawn radio in Create project falls back to the platform's control
    under forced colours, as `.app-checkbox` does;
  - an unread notification's dot takes `Highlight` under forced colours, now
    that the card's border no longer marks it. DESIGN.md's contrast contract
    no longer lists the accent wash.
- A second harness pass, served by `pnpm tauri dev`'s Vite, showed Settings,
  Console's confirmation over it (one backdrop: the nested one is
  transparent), the shortcut sheet, What's new, the issue report (review and
  preparing), Create project and Clone. The Settings header glyph and the
  rail's icons both sit 24px from the dialog's edge, and the title measures
  17px. The harness was deleted and the dev processes were stopped.
- After the fixes: `pnpm run check:docs` and `pnpm run check:architecture`
  exit 0, and Vitest on `src/architecture`, notifications, initialize-project,
  settings and `AppOverlays` passes (16 files, 204 tests).
