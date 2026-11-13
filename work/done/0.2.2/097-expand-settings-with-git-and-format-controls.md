---
id: 097
title: Expand settings with default branch, hooks, fetch cadence and formats
status: done
priority: normal
type: feature
areas:
  - settings
  - frontend
  - rust
  - save-version
  - publish
  - accessibility
created: 2026-08-30
completed: 2026-08-30
parent:
queue:
---

# Goal

Add four user-controllable preferences to the Settings overlay:

1. The **default branch name** used when GitOdile creates a project,
   stored where Git itself reads it (`init.defaultBranch`).
2. An explicit **"run Git hooks when saving and publishing"** switch.
3. A **custom cadence** for automatic project-change checks, so the four fixed
   presets stop being the only answers.
4. A **date and number format** choice, so the app can be read the way the
   user expects rather than only the way the OS locale spells things.

# User outcome

- A user who names their first branch `trunk` (or `master`, or anything
  else) sets it once instead of retyping it in every new project, and other
  Git tools agree with GitOdile about it.
- A user whose repository carries slow or noisy hooks can keep them out of the
  way, and a user who depends on them can switch them on knowingly instead of
  discovering that a client silently ran — or silently skipped — them.
- A user who wants a check every five minutes, or every five hours, can say so.
- A user whose system locale does not match how they read dates and numbers can
  fix the app without changing their OS.

# Context

Settings already owns three shapes of preference and they should each keep
their shape here:

- **Global Git config**, read and written through `tooling.rs`
  (`user.name`/`user.email`, `core.autocrlf`). The default branch is the same
  kind of fact — Git itself has a key for it — so it belongs there rather than
  in `localStorage`, and GitHub Desktop writes it to the same key.
- **App-local preference**, stored in `localStorage` by `src/app/preferences.ts`
  (watching, confirmations, diff reading, navigation). The fetch cadence and
  the display formats are app-local.
- **Behaviour GitOdile applies to its own Git calls.** Hooks are this one. The
  setting must not be written into the user's config: `core.hooksPath` would
  change what the `git` CLI and every other client do on that machine, which
  AGENTS.md forbids ("Preserve user Git configuration unless a setting is
  explicitly scoped to GitOdile"). GitOdile therefore passes `--no-verify` on
  its own `commit`/`push` while the switch is off.

Note the deliberate tension with the AGENTS.md safety rule "Surface hooks and
signing failures accurately; do not bypass them by default." This task ships
hooks off by default as requested, and pays for it with disclosure: the switch
states plainly that GitOdile skips the project's hooks while it is off, and
the save/publish surfaces are not changed to hide that. The rule is amended in
AGENTS.md rather than quietly broken.

# Scope

## Default branch name (Git section)

- Rust `tooling.rs`: read and write the global `init.defaultBranch`, validated
  with `git check-ref-format --branch` like initialization already validates a
  branch name.
- Two new IPC commands, `get_default_branch` / `set_default_branch`, registered
  in `application.rs`, adapted in `ipc.rs`, and recorded in the IPC contract.
- Settings port, `useDefaultBranch` hook beside the other global-config reads,
  and a `main` / `master` / other control in the Git section.
- `InitializeProjectDialog` seeds its initial-branch field from the preference
  instead of the hardcoded `"main"`.
- With nothing stored, the control shows `main` selected — the name GitOdile
  will actually give the first branch — and says it is not written to Git
  yet.

## Git hooks (Git section)

- App-local `runGitHooks` preference, default on.
- `save_version` and `publish` take a `runHooks` argument; Rust adds
  `--no-verify` to `git commit` / `git push` when it is false.
- Ports, adapters, controllers and the two dialogs carry the flag.
- The Settings row says what "off" actually does.
- When a hook rejects a save, the dialog shows the hook's own output and offers
  a one-time save without running the hooks.

## Automatic check cadence (General section)

- Keep the presets, add a **custom** choice with a number field and a
  minutes/hours unit, bounded to 1 minute – 24 hours and whole minutes.
- The stored value stays a minute count, so nothing downstream changes.
- A stored value outside the bounds falls back to the default.

## Dates and numbers (Interface section)

- `shared/i18n/formats.ts` owns the preference vocabulary and two pure
  formatters (`formatDate`, `formatNumber`).
- The language provider holds both preferences and exposes the formatters, so
  every surface formats through one place.
- Existing `Intl` call sites (status bar, changelog, history, overview, sync,
  branches) go through it.
- The Settings group shows a live sample of the current choice.

# Out of scope

- Per-project overrides of any of these.
- Renaming an existing project's default branch on the remote.
- Selecting a hook directory or editing hooks.
- A time-format (12/24 hour) preference separate from the date format.
- Applying the number format to line numbers or short IDs, which are labels
  rather than quantities.

# Acceptance criteria

- [x] The Git section reads and writes `init.defaultBranch` in the global Git
      config, rejects an invalid branch name with a localized message, and new
      projects start from the stored name.
- [x] The hooks switch is on by default; with it off GitOdile passes
      `--no-verify` to its own commit and push, and with it on it does not.
- [x] The automatic-check cadence accepts any whole number of minutes from 1
      minute to 24 hours, keyboard-reachable, and rejects out-of-range input
      without corrupting the stored value.
- [x] Date and number formats apply across the app's existing formatted values
      and default to the system locale.
- [x] Every new control is keyboard-operable and labelled, and the panel's
      existing radio-group navigation still works.
- [x] Unit tests cover the new pure logic (branch validation wiring, cadence
      validation, both formatters) and the new panel behaviour.
- [x] The IPC contract snapshot and the Rust execution-policy registry list the
      new commands and arguments.
- [x] `pnpm run check` passes.

# Relevant files

- `AGENTS.md`
- `src/features/settings/`
- `src/app/preferences.ts`
- `src/shared/i18n/`
- `src/i18n/index.tsx`
- `src-tauri/src/tooling.rs`
- `src-tauri/src/save_version.rs`
- `src-tauri/src/publish.rs`
- `src-tauri/src/ipc.rs`
- `src-tauri/src/application.rs`
- `docs/architecture/025-ipc-contract.json`

# Dependencies

None.

# Decisions

- **Default branch goes into Git's own config, not `localStorage`.** It is a
  fact about how this machine creates repositories, and duplicating it in app
  storage would make GitOdile and the `git` CLI disagree.
- **Hooks are a GitOdile-scoped behaviour, not a config write.** See Context.
- **Hooks default on.** Shipped off first, at the requester's explicit ask and
  on the stated premise that GitHub Desktop disables them. The premise turned
  out to be wrong — GitHub Desktop runs hooks and offers a per-commit "Bypass
  Commit Hooks" plus a "Commit anyway" when one fails — and with that corrected
  the default was reverted to on. Skipping a project's own rules by default
  would make GitOdile produce commits the same repository rejects from a
  terminal, and this app's audience is the least equipped to diagnose that. The
  "runs code from an untrusted repository" argument is weak here: `.git/hooks`
  is not cloned, so a hook exists only after the user ran that project's own
  install step. AGENTS.md keeps its original rule.
- **The cadence stays a minute count.** Presets and the custom value share one
  representation, so `useAutomaticRemoteCheck` is untouched.
- **Formats live in `shared/i18n`, not in the settings feature.** Every feature
  formats dates; only one of them owns the settings panel. Putting the
  vocabulary in `shared/i18n` keeps `src/i18n` from importing a feature barrel
  and creating a production cycle.
- **Dates and numbers join the Interface section** rather than earning a new
  rail entry: they are locale presentation, and Language already lives there.

# Implementation notes

## Default branch

`tooling.rs` gained `get_default_branch` / `set_default_branch` over the global
`init.defaultBranch`, registered in `application.rs` (`ReadOnly` / `LocalMutation`)
and adapted in `ipc.rs`. Two details are worth keeping in mind:

- Git canonicalizes config keys to lower case and `--get-regexp` both matches
  and reports them that way, so the read key is `init.defaultbranch` while the
  write uses `init.defaultBranch`. Both constants are named and the round-trip
  test asserts they agree.
- `validate_default_branch_name` rejects a leading `-` before shelling out.
  Passed on, such a name would reach `git check-ref-format` as an *option*, and
  Git's answer would be about the wrong question. The rest of the rule is
  `check-ref-format --branch`, so GitOdile never keeps a second opinion about
  what a branch name is. The error reuses `invalid_initial_branch`, whose
  existing copy already reads correctly here.

`InitializeProjectDialog` seeds its field from the preference and falls back to
`main` when nothing is set, so a one-off name is still one edit away.

## Git hooks

`save_version` and `publish` take `runHooks`; Rust inserts `--no-verify` before
the positional arguments when it is false. Nothing is written to the project's
config, so the `git` CLI is unaffected either way.

`classify_commit_failure` now takes the flag too: with hooks skipped, no local
hook ran, so a failure must not be reported as a hook rejection and send the
user to read output that was never produced.

The preference is `localStorage`-backed in `app/preferences.ts` and threaded
through `ChangesPanel` → `SaveVersionDialog`, `PublishDialog` and
`InitializeProjectDialog`. The panel shows the consequence — "GitOdile skips
them when it saves or publishes" — whenever the switch is off.

## Cadence

`RemoteCheckIntervalMinutes` is now a plain minute count validated by bounds
(0, or 1..1440 whole minutes) rather than a union of four presets. The panel
keeps the presets and adds a **Custom** segment that opens a number field and a
minutes/hours unit group. An out-of-range value is *refused*, not clamped: the
field keeps showing what was typed, reports the range, and the previously
accepted cadence keeps running — with the status line stating which one that is.

## Dates and numbers

`shared/i18n/formats.ts` owns the vocabulary and two pure formatters. It lives
in `shared/i18n` rather than in this feature so `src/i18n` can hold the
preference without importing a feature barrel, which would have created a
production cycle (`i18n` → `settings/index` → `SettingsPanel` → `i18n`).

The language provider now exposes `formats`, `setDateFormat`, `setNumberFormat`
and bound `formatDate`/`formatNumber`. Every previous `Intl` call site goes
through it. Two call-site changes are worth noting:

- `formatHistoryDate` takes `LocaleFormats` instead of a language string, and
  `HistoryPanel`/`BranchesPanel` thread `formats` where they threaded
  `language`. Only the *absolute* date follows the preference; "3 days ago" has
  no separators to choose between.
- `historyClientLimit` takes the already-formatted count as a string. A
  dictionary cannot know how the reader writes numbers.

`formatNumber` groups with `en-US` and rewrites the separators rather than
borrowing a locale that happens to use them, which would also inherit its
digits, grouping size and minus sign. The spaced choice uses a narrow no-break
space so a grouped number cannot wrap across two lines.

## The hooks default, and the copy that named it wrong

Two corrections landed after the first pass, both from review:

- The row read "Run this project's Git hooks" inside a group called "Project
  hooks", which made an app-wide switch look like a property of the open
  project. It is now "Run Git hooks when saving and publishing" under "Git
  hooks", and the description says the setting applies to every project.
- The default went back to **on**. It shipped off on the premise that GitHub
  Desktop disables hooks; it does not. AGENTS.md keeps its original "do not
  bypass them by default" rule, extended only with what this task actually
  added: the classifier must not blame a hook that never ran, and hooks must
  never be disabled by writing to the user's Git configuration.

Because "off" is now the choice that costs something, that is the state the
panel explains — the warning appears when hooks are switched off rather than
sitting under the default.

## The hook-rejection escape

GitHub Desktop's model, completed in a second pass. `SaveVersionDialog` now
carries `ranHooks` on its `save-error` state and offers "Save without running
the hooks" only when *that attempt* ran them and Rust classified the failure as
`hook_rejected` — never after a save that already skipped them, and never for a
signing or index failure that `--no-verify` would not help.

Two placement decisions:

- The escape sits with the failure, not in the action row. Measured against the
  real button font, its label is 247px and the dialog gives its content 424px;
  Cancel + escape + Save would have been roughly 502px in a row that does not
  wrap. Grouping it under the hook's output is also the better reading order —
  the reason and the way past it together.
- `FailureDetail` opens by itself for a hook rejection. The hook's message is
  the only thing that says what to fix, so hiding it behind "Show technical
  details" made the failure look arbitrary.

The note beside the button is visible text rather than a `title`, because "your
Git hooks setting does not change" is a caveat the user needs before clicking,
not a tooltip.

Publish was deliberately left out. A failed `pre-push` produces no signature
Git labels as its own — the hook's stderr is all there is — so classifying it
would mean guessing, and a network failure mislabelled as a hook rejection is
worse than a generic error. `classify_push_failure` still reports remote-side
`pre-receive`/`hook declined` rejections, which Git *does* mark.

## Stored defaults outranked the code

Flipping `RUN_GIT_HOOKS_DEFAULT` to `true` changed nothing on a machine that had
already opened the app. `useStoredBoolean` — and every other preference hook in
`app/preferences.ts` — persisted from an unconditional effect, so the *default*
was written to `localStorage` on the first render, before the user had chosen
anything. From then on that frozen copy outranked the constant, and no later
change to a default could ever reach an existing user.

The rule is now "storage holds a choice, not a state": `usePersistedChoice`
writes only when the value differs from what storage holds, and writes nothing
at all while the entry is absent and the value still equals what it mounted
with. Applied to booleans, the remote-check cadence, diff preferences,
navigation preferences, favourite projects, and the theme — where applying the
`data-theme` attribute was split from persisting the choice, since only the
first has to happen on every render path.

The condition is a comparison, not a count of effect runs. The first attempt
skipped the first run via a ref, which passes a plain `renderHook` and fails in
the real app: `StrictMode` remounts the same instance, the flag is already
spent, and the default gets written anyway. The browser caught that; the unit
test did not, so every persistence test now runs under `StrictMode`.

`repairEagerlyStoredDefaults`, called once from `bootstrap.tsx`, clears what
the bug had already written, in two cases:

- The Git-hooks key is removed outright. It is the one whose default *changed*
  after being persisted, so its stored `"false"` matches nothing, and the
  setting has never shipped — every copy came from a development run.
- Every other scalar preference is removed only when it is byte-identical to
  the default it would have been written with. Such an entry carries no
  information, so deleting it changes nothing observable and lets a future
  default reach the machine; anything actually chosen differs and is left
  alone. `SIDEBAR_HIDDEN_DEFAULT` was named so this list could recognise it
  instead of the call site passing a bare `false`.

It runs once, behind its own marker, because a deliberate choice that happens
to equal the default is indistinguishable from an eagerly-written one and must
survive every later launch. Delete the function and its marker once 1.0 ships.

Object stores are excluded: their readers already validate field by field, so a
new default reaches them without help, and comparing them as strings would
depend on key order. Favourites are user data — an empty set is a real answer.

## Defects found reviewing this task before commit

Three, all fixed here:

- **Two concurrent writes to `init.defaultBranch`.** Blur fires before click, so
  typing a name under "Other" and then pressing a suggestion started a save of
  the draft *and* a save of the suggestion, and whichever landed last won. The
  commit now happens from the group's `onBlur`, which ignores focus moving to
  another control inside it — the same guard the identity block already used.
  Covered by a test confirmed to fail without the fix.
- **A hook's output could stay hidden.** `startExpanded` only seeds
  `FailureDetail`'s state, so a hook rejection following a signing failure
  inherited the collapsed toggle and hid the only message saying what to fix.
  The panel is now keyed by the kind of failure.
- **`formats` broke a memo boundary.** It replaced a `language` string as a prop
  into History's memoized, virtualized rows, and was a fresh object on every
  provider render. Both it and the context value are now memoized.

One test hazard was also fixed: `default_branch_rejects_names_git_would_reject`
passed `None` as the config override, so a regression that stopped rejecting a
name would have written to the developer's real global Git config. It now uses a
scratch config and asserts the file is never created.

## Deliberate calls worth knowing about

- Choosing the **Custom** cadence from "Never" immediately starts checking at
  the value the field is seeded with. Selecting an option in a radio group is
  choosing it — "15 min" behaves the same way — and the status line states the
  cadence that is now running. The alternative, a group showing "Custom" while
  nothing is scheduled, would be a lie.
- Switching the custom unit to one that puts the value out of range keeps the
  previously accepted cadence running and says so, rather than clamping to a
  number nobody asked for.

## Follow-up

- `initialize.rs` has its own `validate_initial_branch` with the same
  leading-dash exposure this task fixed in `tooling.rs`. It was left alone as
  out of scope, but it is worth the same guard.
- `useStoredFavouriteBranches` in the branches feature still persists
  from an unconditional effect. It stores user data rather than a default, so
  nothing is currently wrong, but it should adopt the same rule.

# Validation

```
pnpm run check
```

`EXIT=0` on Windows 11: documentation (151 Markdown files, 118 task ids),
frontend architecture (309 modules), TypeScript, 62 frontend test files / 523
tests, the Vite build, `cargo fmt --check`, Clippy with `-D warnings`, and 309
Rust tests.

Two earlier runs of this command were reported as passing when they were not.
`cargo fmt --check` had been failing since the Rust test call sites were edited
to carry `run_hooks`, and the failure was invisible because the run was piped
through a `grep` whose pattern did not include the format diff, with the exit
code read from a misused `${PIPESTATUS[0]}`. Fixed by `cargo fmt`; the lesson is
to read the aggregate command's own exit status rather than a filtered view of
its output.

New automated coverage:

- `src-tauri/src/tooling.rs`: `default_branch_round_trips_through_a_temporary_global_config`,
  `default_branch_rejects_names_git_would_reject`.
- `src-tauri/src/tests/save_version_tests.rs`:
  `saving_runs_the_projects_hooks_only_when_they_are_turned_on` — a repository
  with an always-failing `pre-commit` hook saves cleanly with hooks off and
  fails with `HookRejected` with them on.
- `src/shared/i18n/formats.test.ts`: both formatters, including the invalid-date
  and non-finite-number cases and the stored-preference validators.
- `src/features/settings/domain.test.ts`: cadence bounds, the minutes/hours
  split, and a round-trip over every value the custom field can produce.
- `src/features/settings/SettingsPanel.test.tsx`: default-branch read/write and
  Git's rejection message, the hooks switch — that it names an app-wide setting
  and explains itself only once switched off — preset and custom cadences
  including out-of-range refusal, and the format previews.
- `src/app/preferences.test.tsx`: that hooks are on with nothing stored, and
  that an explicit stored choice still wins.
- `src/features/save-version/SaveVersionDialog.test.tsx`: the hook-rejection
  escape — that it retries with `runHooks: false` and succeeds, that the hook's
  output is visible without being asked for, and that it is absent both when the
  save already skipped hooks and when the failure was not a hook's doing.
- `src/app/preferences.test.tsx`, all under `StrictMode`: that an untouched
  default is never written, that a change is, that a changed default reaches a
  preference nobody has touched, and that the repair runs once, clears entries
  that merely repeat their default, and keeps anything that differs from it.

Manually verified in the dev preview by reproducing the reported state rather
than a clean one — the earlier check had cleared the key by hand first, which is
precisely why the bug survived it. With `gitodile-run-git-hooks` set to
`"false"` and the repair marker absent, a reload leaves the key unset and the
switch on; turning it off then stores `"false"` and keeps it. On a profile with
no GitOdile keys at all, opening the app writes no preference defaults, and
choosing a theme both applies `data-theme` and stores the choice (tokens
measured flipping between `#ffffff`/`#1c1917` and `#1a1a1a`/`#fafafa`).

Manual verification in the dev preview (Spanish UI), measured rather than
eyeballed:

- The cadence field stored 5 for "5 minutes" and 300 for "5 hours"; entering
  2000 hours left the stored value at 300, set `aria-invalid="true"`, and showed
  "Elige un valor entre 1 minuto y 24 horas."
- Git section renders Installation / Default branch / Project hooks /
  Identity, with the hooks switch `aria-checked="false"` and its warning
  present.
- Format previews at 1280x860: eight equal 352x56 cards, no sample truncated,
  nothing overflowing the panel, no horizontal body scroll. At 760px the picker
  drops to one column and the cadence row still fits.
- Contrast on the preview cards measured 8.19:1 for the sample and 20.1:1 for
  the name against the card's painted background.
- Each new radio group exposes exactly one tab stop, and the number field is
  labelled.
