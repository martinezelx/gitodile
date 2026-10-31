---
id: 057
title: Right-size the Settings panel and give About something to report
status: done
priority: normal
type: polish
areas:
  - frontend
  - design
  - ux
  - accessibility
created: 2026-08-15
completed: 2026-08-15
---

# Goal

Make the app's two informational dialogs earn their space. Settings matches the
amount of content it actually holds — fewer sections, one titling layer instead
of four, one save model instead of two, no silent loss of typed input. About
reports what the user is running, on what, instead of a bare version number.

They are one task because they are one surface: the same overlay file, the same
dialog chrome, the same review pass, and About's Git version is read from the
tooling state Settings owns.

# User outcome

Settings opens on the section you last used, every control is reachable in one
or two steps, and nothing you type disappears without warning. The panel stops
looking like a mostly empty container.

About answers "what am I running, on what?" in one glance and puts it on the
clipboard in one click, so a bug report starts with facts instead of a
back-and-forth.

# Context

Settings currently spans four sections holding **eight interactive controls**
in total. Two of those sections hold exactly one toggle each. Measured against
the running dev server at 1280x840, the dialog renders 920x720 with a 184px
navigation rail, and the content area (734x626) fills:

| Section | Content height | Fill | Controls |
| --- | ---: | ---: | ---: |
| General | 244px | 39% | 1 |
| Appearance | 387px | 62% | 6 |
| Git | 494px | 79% | 4 |
| Safety | 161px | 26% | 1 |

The rail itself uses 176px of its 626px height — 72% empty.

Reaching the single toggle in General passes four heading layers: the dialog
header ("Settings" + `settingsDialogDescription`), the rail item, the section
`h2` "General" + `settingsGeneralDescription`, and the group `h3` "Startup" +
`settingsStartupDescription`. The section and group descriptions restate each
other ("what GitOdile does when it starts" / "what happens when GitOdile
launches"), and the `h2` repeats the rail item the user just clicked.

Three behavioral defects were reproduced in the browser rather than inferred:

- **Typed identity is discarded silently.** Typing a name, pressing `Escape`,
  and reopening leaves the field empty. `nameInput`/`emailInput` are local
  state in a component that unmounts with the dialog, and `useModalFocus`
  closes on `Escape` unconditionally. Backdrop `mousedown` takes the same path.
  Identity is also the only setting with an explicit save step; everything else
  applies immediately.
- **The active section resets.** Open, switch to Safety, `Escape`, reopen —
  back to General. `activeSection` is component-local `useState` while every
  other preference persists.
- **Switching sections shifts the layout.** At 1280x620, moving to Git makes
  the scrollbar appear and the content's right edge jumps from 1067px to
  1058px. `.settings-view` is the only large scroll container in the app
  without `auto-hide-scrollbar` (used by `CommandPalette`, `ChangesPanel`,
  `PublishDialog`, `DiffResultView`) and without `scrollbar-gutter: stable`.

Contrast was measured with proper alpha compositing across nav items, field
labels, inputs, status lines and descriptions: every pair lands between 6.06:1
and 16.9:1. No contrast work is needed and none is in scope.

About had the opposite problem: not too much chrome for its content, but no
content. It showed the app version and nothing else. For a desktop Git client
the two facts that decide most bug triage — which OS, which Git — were
reachable only by asking the user to go and look, and the Git one lived inside
Settings. The heart in the footer was a bare `♥` inside a single translated
sentence, so it could not be styled without splitting the string.

The rail is kept rather than collapsed into one scrolling page because the
roadmap — tasks 015 (history), 037 (guided conflict resolution) and the
recovery screen — will add settings. Right-sizing it now is cheaper than
rebuilding it later.

# Scope

## Structure

- Merge Safety into General. Both toggles answer "what happens when I open or
  close a project"; splitting them across two sections costs a rail item for
  one control. `settingsSafetyTitle` / `settingsSafetyDescription` retire; the
  confirm-close row becomes a second group under General.
- Rename Appearance to cover the language control it already contains, so the
  rail label matches its contents.
- Drop the section `h2` + description layer. The rail states the location and
  the dialog header states the purpose; group `h3` headings remain. Remove a
  group description when it only restates the row beneath it.
- Shrink the dialog to `min(820px, 100%)` wide and
  `min(600px, 100vh - 56px)` tall, with the rail at ~160px, once the sections
  are merged and the heading layer is gone.

## Behavior

- Persist `activeSection` alongside the other preferences in
  `src/app/preferences.ts`, and reopen on it.
- Reach Settings by keyboard with `Ctrl`/`Cmd`+`,`, and list it in the
  shortcuts dialog beside the four already there.
- Offer one command-palette entry per section, named exactly as the rail names
  it, so the palette can land on a section instead of wherever the user was
  last.
- Offer "reset this section" where a section has defined defaults, disabled
  while nothing differs from them.
- Unify the save model for identity: save on blur, matching every other
  control. If the explicit button is kept instead, it must be paired with a
  close guard and a disabled state when nothing changed.
- Guard `Escape` and backdrop dismissal while identity has unsaved edits.
- Add email validation surfaced in place, next to the field.
- Remove the "Edit identity" step that renders both inputs `disabled` until
  clicked; editing is the likely reason to be in that group.

## Accessibility

- Replace the `nav` / `aria-current="page"` treatment with
  `role="tablist"` / `role="tab"` / `role="tabpanel"`, wired with
  `aria-controls`, and add arrow-key movement between tabs. Today the rail
  claims to navigate but swaps panels, and reaching the fourth section takes
  four `Tab` presses.
- Move initial focus off the Close button. It is the first focusable element
  in the dialog, so `Enter` immediately after opening closes the panel.

## Surfacing and consistency

- Surface a broken Git installation outside its own tab. When
  `gitDiagnostics.state` is `missing`, `unusable` or `check_failed`, mark the
  Git rail item and show the condition in the dialog header — it is the most
  serious state the app can report and currently hides in the third section.
- Wrap the confirm-close row in `.settings-group__body` so the two toggles get
  identical treatment; today Safety's row sits bare in the section while
  General's sits in a card.
- Rename `.settings-section__footer` to a group-level class, since it is used
  inside `.settings-group__body`.
- Delete unused `.settings-row__warning` and `.settings-row__badge`.
- Delete `.settings-section:not(:last-child)::after`; only one section renders
  at a time, so the separator never draws.
- Add `auto-hide-scrollbar` and `scrollbar-gutter: stable` to
  `.settings-view`.
- Remove the empty fragment wrapping the General section.

## About

- Split the footer string around the heart so the glyph can be colored, and
  give it a color that is not the danger red.
- Report the operating system and architecture, with the name a user would
  recognize separated from the exact build.
- Report the Git version the app already knows, so it is not Settings-only.
- Copy the whole thing to the clipboard as a diagnostics block.
- Keep GitOdile's own version above the rule, with the app; everything below
  the rule describes the machine — sharing one row grammar so the version does
  not read as a caption bolted onto the description.

# Out of scope

- The `SettingsPort` contract, the Tauri adapter, and every Git tooling command
  behind it.
- Adding new settings, or moving existing settings in or out of the panel.
- The titlebar theme toggle and the theme-reveal animation from task 056.
- Any change to the About, Shortcuts, close-confirmation or error dialogs, even
  though they share `about-backdrop`.
- A settings search field. Eight controls do not justify one; if the roadmap
  pushes the count past roughly twenty, reopen it as its own task.
- Collapsing the panel into a single scrolling page. Recorded as the rejected
  alternative below, not as fallback work.
- Links from About to the repository, the license, or
  `THIRD_PARTY_LICENSES.md`. There is no repository URL anywhere in the
  project — not `package.json`, not `tauri.conf.json`, not the README — and
  inventing one is worse than omitting it. The license files are also not
  reachable from a packaged build today.
- A GitOdile self-update check in About. Blocked on the backlog's "Design the
  update strategy".

# Acceptance criteria

- [x] Settings has three rail sections, and no section holds fewer than two
      controls.
- [x] Reaching any control passes at most two heading layers below the dialog
      header. Only `h3` group headings remain in the panel.
- [x] Content fill in the resized dialog is at least 60% for every section at
      1280x840, measured the same way as the table above.
- [x] Typing in an identity field and then pressing `Escape` or clicking the
      backdrop either saves the edit or asks before discarding it. Never
      discards silently.
- [x] An invalid email is reported next to the field before it can be saved.
- [x] Closing Settings on one section and reopening returns to that section,
      including across an app restart.
- [x] The rail exposes `role="tablist"` with `tab`/`tabpanel` children and
      moves between sections with arrow keys.
- [x] Opening Settings does not put focus on Close.
- [x] `missing`, `unusable` and `check_failed` Git states are visible without
      opening the Git section.
- [x] Switching between a scrolling and a non-scrolling section produces no
      horizontal shift in content position.
- [x] Both toggles render in the same surface treatment.
- [x] No unused selector remains in `src/features/settings/settings.css`.
- [x] Retired translation keys are removed from both `en` and `es` in
      `src/features/settings/translations.ts`; no key is left orphaned.
- [x] `Ctrl`/`Cmd`+`,` opens Settings, does nothing while another dialog is
      open, and appears in the shortcuts dialog.
- [x] The palette offers one entry per section and lands on it.
- [x] "Reset this section" restores the section's defaults, is disabled while
      the section already matches them, and is absent from Git.
- [x] The About heart is red in both themes and still reads as part of the
      sentence to a screen reader.
- [x] The OS is named the way a user would recognize it, with the precise
      build on its own row.
- [x] GitOdile's version sits above the rule and reads as part of the same
      list as the rows below it; nothing below the rule is about the app.
- [x] With nothing known about the machine, the rule is absent rather than
      rendering as a stray line.
- [x] The Git version appears in About without opening Settings.
- [x] One click copies a paste-ready diagnostics block.
- [x] No outcome message anywhere in the panel reports a failure with a
      success or neutral icon.
- [x] Full `pnpm run check` passes.

# Relevant files

- `src/features/settings/SettingsPanel.tsx`
- `src/features/settings/settings.css`
- `src/features/settings/translations.ts`
- `src/features/settings/SettingsPanel.test.tsx`
- `src/app/AppOverlays.tsx`, `src/app/app-shell.css`, `src/app/preferences.ts`
- `src/app/systemInfo.ts`, `src/app/aboutDialog.test.tsx`, `src/app/translations.ts`
- `src/shared/ui/modalFocus.ts`, `src/shared/ui/primitives.css`
- `src/styles/tokens.css`, `src-tauri/capabilities/default.json`
- `src/main.test.tsx`
- [`../../DESIGN.md`](../../../DESIGN.md), [`../../AGENTS.md`](../../../AGENTS.md)

# Dependencies

None blocking. Touches the panel that tasks
[046](046-finish-settings-feature-ownership.md) and
[055](055-open-settings-without-a-loading-frame.md) last shaped; the
eager-overlay rule from 055 must survive this work — do not reintroduce a lazy
boundary.

# Decisions

- **Keep the rail; do not collapse to one scrolling page.** With eight
  controls a single page is objectively the leaner answer, and it was the first
  option considered. It is rejected because tasks 015 and 037 and the recovery
  screen will add settings, and a rail that exists is cheaper than one
  reintroduced later. Right-sizing it is the compromise.
- **Merge Safety into General rather than deleting either.** The two toggles
  are the same kind of decision. Keeping a "Safety" label for one switch reads
  as a promise the section does not keep.
- **Save identity on blur.** The mixed model is the actual defect; the close
  guard alone would preserve an inconsistency that has no reason to exist. The
  guard is still specified because a blur save can fail.

Decided while implementing:

- **"Appearance" became "Interface" / "Interfaz", not "Appearance and
  language".** The honest label for a section holding theme *and* language did
  not fit a 160px rail without wrapping to two lines. "Interface" covers both
  in one short word. This is the most debatable call in the task and the
  cheapest to reverse — it is one key in `translations.ts`.
- **The dialog height is fixed at 480px, not fitted to the active section.**
  Sizing the card to its content would put fill at ~100% everywhere, but the
  card would then resize under the pointer on every rail click. 480px is the
  tallest section (Git, 322px of content) plus chrome, so nothing scrolls at a
  normal window height and the card never moves.
- **The close guard is a callback the panel registers, not lifted draft
  state.** `AppOverlays` keeps a `useRef` holding a `() => boolean`; returning
  `true` means "I have taken over this close". The panel returns `true` twice
  over: once to save first and close itself on success, once to show the
  discard prompt. The alternative — lifting `nameInput`/`emailInput` into the
  shell so the shell could inspect them — would have moved feature state into
  app composition to serve one dialog.
- **The unsaved prompt is inline, not a nested dialog.** Two stacked focus
  traps for a two-button question is not worth the machinery, and the prompt
  belongs next to the fields it is about. The guard switches to the Git
  section first, so the prompt is never raised off-screen.
- **The header alert chip deepens its border on hover, not its fill.** Its
  text is `--status-danger` on a tint of itself; past a 14% fill that pair
  falls under 4.5:1 in dark. Measured, see Validation.

About, decided while implementing:

- **`--accent-heart` rather than `--status-danger`.** The danger red was the
  obvious reuse and is wrong: it would leave a red heart one refactor away
  from being read as an error state. Light `#cc2936` (5.33:1) and dark
  `#ff7a6b` (6.10:1) on `--surface-raised`. Added to the `DESIGN.md` token
  table so it is not re-derived later.
- **The heart is `role="img"` with a translated label, not `aria-hidden`.**
  Hiding it makes the sentence read "Made with by Luis M. Martínez."
- **OS name and build on separate rows.** Windows 11 reports NT `10.0`, so a
  combined "Windows 10.0.26200" tells a Windows 11 user they are on Windows
  10. The name comes from the build number (>= 22000 is 11); the raw string
  keeps its own row for precision. macOS already reports its marketing
  version; Linux reports a kernel that names no distribution, so it stays
  "Linux" and the kernel goes on the version row.
- **The copied block is English regardless of UI language.** It is read by
  whoever receives the bug report, not by the person who copied it.
- **Task 062 was folded into this one** rather than shipped separately, on
  request, so the whole surface lands together. Its id stays burned and will
  not be reused.

# Implementation notes

- `SettingsPanel.tsx` is now controlled on `activeSection` and hands the shell
  a close guard. `isEditingIdentity` and the Save/"Edit identity" pair are
  gone; the draft commits from a group-level `onBlur` that ignores focus moves
  between the two fields.
- The section list lives in `domain.ts` as `SETTINGS_SECTIONS` with an
  `isSettingsSection` guard, so `app/preferences.ts` can validate what it reads
  out of `localStorage` without the feature importing app composition — the
  architecture guard forbids that edge, so the selection is app state passed
  down as a prop.
- `shared/ui/modalFocus.ts` changed in two ways that affect every dialog:
  `getFocusableElements` now drops `tabIndex < 0` (the rail's roving tabindex
  would otherwise put inactive tabs in the trap), and `focusDialog` prefers a
  `[data-autofocus]` element over the first focusable one. No other dialog sets
  the attribute, so their behavior is unchanged.
- `AppOverlays` reads `settings.setOpen` through a ref. The props object is
  rebuilt by `main.tsx` every render, so a `useCallback` closing over it would
  change identity on every keystroke and make `useModalFocus` reinstall its
  listener and re-steal focus — the same trap `SaveVersionDialog` documents.
- Removed: `.settings-section`, `.settings-section__heading`,
  `.settings-section__footer`, `.settings-row__warning`, `.settings-row__badge`
  and the section separator that never drew. `.settings-nav` declares its own
  `display: grid`, which it used to inherit from the `nav` element rule in
  shared primitives.
- Retired translation keys: `settingsAppearanceTitle`,
  `settingsAppearanceDescription`, `settingsGeneralDescription`,
  `settingsGitDescription`, `settingsGitInstallationDescription`,
  `settingsStartupDescription`, `settingsSafetyDescription`, `identitySave`,
  `identityModify`. Added: `settingsInterfaceTitle`, `settingsThemeDescription`,
  `settingsGitNeedsAttention`, `identityInvalidEmail`, `identityUnsavedTitle`,
  `identityUnsavedBody`, `identityKeepEditing`, `identityDiscardAndClose`.
- `src/main.test.tsx` was updated to the new intent rather than relaxed: the
  eager-panel assertion stays synchronous, `navigation` became `tablist`, the
  removed `h2` assertion became the `Startup` group heading, the Close-focus
  assertion became the General tab, and a reopen now asserts the section
  persisted.
- Entry chunk: 308.35 kB / 89.23 kB gzip before, 314.06 kB / 90.98 kB after
  the whole task including About (+5.71 kB / +1.75 kB). 63.9 kB raw and
  19 kB gzip below the task-023 warning.

Scope extended after the first review pass, on request: the keyboard shortcut,
the per-section palette entries and "reset this section" were added to this
task rather than split off, because all three depend on the section becoming
app state — which is what this task did — and none of them makes sense before
that. Recorded here rather than left as an undocumented drift.

- `Ctrl`/`Cmd`+`,` joins the existing handler in `main.tsx`; it declines while
  `hasBlockingDialog` so it cannot stack a second modal.
- `settingsSectionLabel` moved into `domain.ts` so the rail and the palette
  cannot drift apart on what a section is called.
- The reset defaults come from `REOPEN_LAST_PROJECT_DEFAULT` and
  `CONFIRM_CLOSE_PROJECT_DEFAULT` in `app/preferences.ts`, the same constants
  that seed the hooks, passed down as a `defaults` prop. The panel does not
  keep its own copy. Theme and language default to `"system"`, which is a fact
  about the preference types rather than app config, so those stay local.
- Git deliberately has no reset: an installed version and an identity are
  facts about the machine, not preferences with a factory value.

## About

- `src/app/systemInfo.ts` (new) holds `readSystemInfo`, `describePlatform` and
  `formatDiagnostics`. The platform naming and the diagnostics format are pure
  functions so they are testable without rendering.
- `src-tauri/capabilities/default.json` gained `os:allow-platform`,
  `os:allow-version` and `os:allow-arch` beside the existing `os:allow-locale`.
- **A crash found in the browser, not in tests.** `platform()`, `version()` and
  `arch()` in `@tauri-apps/plugin-os` are **synchronous** — only `locale()` is
  async — and they throw when Tauri's injected global is missing, which is
  every `pnpm dev` run in a plain browser. The first implementation wrapped
  them in `Promise.all(...).catch(...)`; the throw happens while evaluating the
  arguments, so it escaped the catch and took the whole `<AppOverlays>` tree
  down. The console showed `Cannot read properties of undefined (reading
  'platform')` and the app rendered nothing. Fixed with a synchronous
  try/catch returning `null`. The test had mocked all four as async, which is
  what let it pass over a crashing build; the mock now matches the real
  signatures and a case forces the throw.

## Found in the review pass, before closing

- **A failed save was reported as a success.** `identityMessage` was one
  nullable string rendered with a fixed `CheckCircle2`, so "Couldn't save
  that." arrived with the same green check as "Saved.". The Git action message
  had the same shape with a fixed neutral `Info`, so "Couldn't start that."
  looked informational. Both now carry a `Notice` tone that picks the icon and
  the color, and `SettingsPanel.test.tsx` pins the failure case.
- **The About rule could render with nothing under it.** The divider started
  as `.about-details`'s `border-top`, so once GitOdile's version moved above
  it, an environment the app knows nothing about left a bare line under the
  description.
- **And the version, once moved out, stopped looking like it belonged.** The
  first attempt put it in its own 13px paragraph between the description and
  the list: smaller than the 16px text above it and in a different grammar
  from the label/value rows below, so it read as a stray caption. Both
  problems are solved by the same move — the version is now the *first row of
  the list*, with the rule as its `border-bottom` rather than the list's
  `border-top`. Same row grammar throughout, and `:not(:last-child)`
  suppresses the rule when there is nothing to separate.
- **`Ctrl`/`Cmd`+`,` could stack two focus traps.** The first guard used
  `hasBlockingDialog`, which covers the dialogs that block project mutations
  but not About, Shortcuts, the close confirmation, the error dialog or the
  command palette — all of which install a focus trap of their own. Pressing
  the shortcut with any of those open would have opened Settings on top, with
  two Escape handlers and two traps competing. Now guarded by a
  `hasOpenDialog` that names every trapping dialog, pinned by a test that
  opens the palette and asserts the shortcut declines.
- **New dead CSS avoided.** A `.settings-row__hint--warning` rule was written
  and then removed on noticing no identity notice can take that tone; the Git
  notice uses the `git-install__status--*` scale instead. Removing dead CSS is
  part of this task's scope, so adding some would have been careless.

Follow-up, deliberately not done here: the Git strings still carry
`settingsGeneral*` key names (`settingsGeneralChecking`,
`settingsGeneralGitMissing`, `settingsGeneralUpdateAvailable` and friends).
They were already misfiled before this task — the content has lived under Git
since task 003 — and renaming them touches every call site for no user-visible
gain. Worth folding into the next task that edits those strings.

# Validation

- `pnpm run check` — docs (94 Markdown files, 62 task ids), architecture guard
  with its 5 seeded self-tests, `tsc -b`, **321 frontend tests in 39 files**,
  production build, and Rust `fmt --check` + `clippy -D warnings` + 238 tests.
  Exit 0. No Rust changed; the Rust half was run to satisfy the criterion
  honestly rather than assumed.

Browser measurements against the running dev server, repeating the ones in
Context above.

Dialog at 1280x840, now 820x480 with a 160px rail and a 399px content area:

| Section | Content height | Fill | Before |
| --- | ---: | ---: | ---: |
| General (startup + safety) | 293px | 73% | 39% / 26% across two sections |
| Interface (theme + language) | 333px | 84% | 62% |
| Git (installation + identity) | 322px | 81% | 79% |

Re-measured after "reset this section" was added: the footer it introduces is
part of the content, and the earlier reading (60% / 70% / 81%) was taken
before it existed. No section scrolls at this window height.

- **No horizontal shift.** At 1280x430, where Interface and Git scroll and
  General does not, the scrollbar gutter stays a constant 5px and the first
  heading's right edge is 1016px in all three sections. It moved 9px before.
- **Identity is not discarded.** Typed "Ada Lovelace" into Name, pressed
  `Escape`: the dialog stayed open, the prompt appeared, and the typed name
  was still in the field. "Keep editing" dismissed the prompt; a second
  `Escape` re-raised it; "Discard and close" closed the dialog.
- **Invalid email is reported in place.** "ada@lovelace" then blur produced
  the inline message and `aria-invalid="true"`, and `setIdentity` was not
  called.
- **The section persists.** `gitodile-settings-section` read `git` after
  closing on Git; reopening selected Git, and it survived a full page reload.
- **Git trouble is visible from anywhere.** The header chip renders for a
  broken installation and switches the rail to Git; the rail carries its dot.
- **Narrow layout.** At 760x700 the rail becomes a horizontal row, all three
  tabs fit without overflow, and the body does not scroll horizontally.

Contrast for the new surfaces, computed from the tokens in
`src/styles/tokens.css` with alpha compositing (light / dark): confirm-bar
title 15.21 / 14.03, confirm-bar body 4.66 / 5.71, header chip 5.37 / 4.67,
header chip hovered 5.19 / 4.52, rail dot 6.54 / 6.22. All clear 4.5:1. The
20% hover fill first tried measured 4.08:1 in dark and was replaced.

About, in the browser: the app renders clean after the plugin-os fix, the
footer reads "Hecho con ♥ por Luis M. Martínez." with the heart computed at
`rgb(255, 122, 107)`, and the version row renders at 16px — the same size as
the description above it, where the first attempt used 13px.

With no Tauri bridge the list holds only the version row, and its
`border-bottom` computes to `0px`: the rule has nothing to separate and is not
drawn. Appending a sibling row to the list in the page flips it to `1px`
`rgb(63, 63, 70)` with 14px below the row and 10px before the next, and
removing the sibling returns it to `0px` — so the `:not(:last-child)`
mechanism is verified in both directions even though the populated state
cannot be reached without Tauri.

Contrast for the heart, computed from the tokens: 5.33:1 light and 6.10:1 dark
on `--surface-raised`.

Not verified in the browser, verified in jsdom instead:

- **The populated About rows and the copy button.** Neither can be exercised
  without Tauri's OS global, and it cannot be stubbed late: `useSystemInfo`
  reads it in a `useState` initializer when `AppOverlays` mounts, which is
  before any injected script can run. `aboutDialog.test.tsx` asserts the row
  order (Version, System, System version, Git), that the first row carries
  `about-details__app`, and the clipboard payload.
- **Initial focus.** The Browser pane runs the page hidden
  (`document.hidden === true`), so `requestAnimationFrame` never fires and
  `useModalFocus`'s focus call never runs there — the same reason `body`'s
  color transition freezes and made a first light-theme contrast reading
  unusable. `src/main.test.tsx` asserts focus lands on the General tab after
  opening, and passes.
