---
id: 098
title: Per-project settings for remote, ignore files and identity
status: done
priority: normal
type: feature
areas:
  - settings
  - frontend
  - rust
  - sync
  - accessibility
created: 2026-08-31
completed: 2026-08-31
parent:
queue:
---

# Goal

Give the open project its own settings surface, separate from the app-wide
Settings dialog, holding the three things that belong to *this repository*
rather than to this machine:

1. **Where the project publishes to** — the configured remotes and their URLs.
2. **What the project ignores** — the shared `.gitignore` and this machine's
   personal exclusions.
3. **Who this project saves as** — a repository-local Git identity that
   overrides the global one, or explicit inheritance from it.

It opens from a gear beside the star in the project switcher, and from a gear
in the Overview summary card, next to the branch controls.

# User outcome

- A user who moved their project to a different host, or typed the URL wrong
  when connecting it, can fix it where they expect to — without a terminal and
  without editing `.git/config` by hand.
- A user who wants to keep build output or editor files out of the project can
  edit `.gitignore` in the app, and can keep *their own* exclusions out of the
  team's file by writing them to the personal list instead.
- A user with a work identity and a personal identity stops publishing versions
  under the wrong name: this project can carry its own, and the panel says
  plainly which identity the next saved version will use and where it comes
  from.

# Context

Settings (task 097) owns preferences that apply to the machine: the Git
installation, the global identity, `init.defaultBranch`, line endings, watching,
formats. Everything in it is true whichever project is open, which is exactly
why the three facts above do not fit there — they change per project, and a
panel that showed them beside global ones would be lying about scope.

GitHub Desktop solves the same problem with a per-repository dialog holding
Remote, Ignored files and Git config. This task follows that shape, with the
existing GitOdile machinery rather than a parallel one:

- The panel is a **modal overlay scoped to one open project**, mounted like the
  Settings dialog and sharing its chrome. It is not a screen: it never becomes
  part of a project's navigation history.
- Every read and write is a **repository-scoped command** authorized through
  `application::authorize_repository` with the project's current session epoch,
  like every other repository call. That is why the gear appears only where a
  project is actually open (see Decisions).
- The remote URL rules already exist. `sync::normalize_connection_url` decides
  what a supported remote URL is and `redact_remote_url` decides what may be
  shown; both are reused rather than reimplemented, so "connect a remote" and
  "change this remote" cannot drift apart.

## The credential hazard

`list_remotes` redacts URL userinfo before serializing, so a stored
`https://alice:token@host/repo.git` reaches the frontend as
`https://host/repo.git`. A naive edit field would show that, and saving it
unchanged would silently delete the user's embedded credentials from
`.git/config`.

The panel therefore never round-trips a redacted value: each remote reports
whether the stored URL carries credentials, the field starts from the redacted
text, saving is possible only when the text actually differs from it, and a
remote with credentials says so before the user commits to replacing them.

# Scope

## The surface

- New feature `src/features/project-settings/` with its own domain, port,
  Tauri adapter, panel, translations, stylesheet and tests.
- Three sections in a rail, mirroring the Settings dialog's layout: **Remote**,
  **Ignored files**, **Identity**.
- The dialog shell is rendered by `app/AppOverlays.tsx` beside the Settings
  dialog and reuses `.settings-backdrop` / `.settings-dialog`. Its header names
  the project it is scoped to.
- The panel chrome shared by both panels (`.settings-layout`, `.settings-nav`,
  `.settings-view`, `.settings-group*`, `.settings-row*`) moves from
  `features/settings/settings.css` to `shared/ui/primitives.css`. Two panels
  now share one stable requirement, which is ADR 0003's bar for a shared
  primitive; the settings-only pieces (font picker, line endings, Git install,
  navigation list) stay with their feature.
- Opening it blocks project switching and closing, exactly as Settings does.
- A command-palette entry, enabled only while a project is open. Not a
  registered screen module: it is a project-scoped overlay, like About and the
  changelog.

## Entry points

- `ProjectSwitcher` rows gain a gear before the star, at the star's size. It is
  disabled for a non-active project while switching is blocked, for the same
  reason the row itself is; otherwise it activates that project first and then
  opens its settings.
- The Overview `ProjectSummaryCard` gains the same gear in its actions row,
  beside the branch quick switch.
- Both surfaces get the same label and tooltip, because it is the same control.

## Remote

- Lists every configured remote with its redacted URL, marking the one the
  current branch publishes to.
- Editing a remote's URL validates through the existing connection rules,
  confirms the change inline (old → new, and that publishing and getting
  changes will use the new location), then writes with `git remote set-url` and
  verifies the stored value, as `connect_remote` already does.
- A remote whose stored URL carries credentials says so, and its field cannot
  be saved unchanged.
- A remote with a separate push URL says so rather than implying this field
  governs both.
- With no remote configured, the section explains what that means and connects
  the first one through the existing `plan_connect_remote` / `connect_remote`
  pair — the same plan-then-confirm contract project creation already uses.
  (Scope correction, recorded during implementation: there was no in-app way to
  connect a remote to an *already open* project, so "reuse the existing flow"
  meant reusing those two commands rather than an existing screen. The
  alternative was an empty state that names the problem and offers nothing.)

## Ignored files

- Two scopes, each its own editor: the project's `.gitignore` (shared with
  everyone who has the project) and `.git/info/exclude` (this copy only, never
  published). The distinction is stated in the panel, not assumed.
- Reads report existence, contents and a state token; a file larger than the
  cap is reported as too large to edit here rather than silently truncated.
- Writes are refused when the file changed on disk since it was read, preserve
  the file's existing newline style, and create the file (and `.git/info/`)
  when it is absent.
- Saving is disabled until the text differs from what was read.

## Identity

- Shows the effective identity for this project and where it comes from:
  inherited from the global config, overridden locally, or missing entirely.
- A switch turns the local override on and off. On, the name and email fields
  write `user.name` / `user.email` to the project's own config; off, the local
  keys are removed and the project goes back to inheriting.
- Validation matches the global identity block's: both fields required, and the
  same permissive email check.
- The global values remain visible as the inherited fallback, so turning the
  override off is a visible outcome rather than a leap.

## Rust

- New module `project_settings.rs`: the project-local identity and both ignore
  files.
- `sync/mod.rs` gains `set_remote_url` (remotes are its boundary) and reports
  two new facts per remote: whether the stored URL carries credentials, and the
  push URL when it differs from the fetch URL.
- New IPC commands, registered in `application.rs` with an execution policy,
  adapted in `ipc.rs`, and recorded in the contract snapshot:
  `read_project_identity`, `set_project_identity`, `clear_project_identity`,
  `read_ignore_file`, `write_ignore_file`, `set_remote_url`.
- New error codes for the ignore-file failures that have no honest existing
  code.

# Out of scope

- Renaming or removing remotes, and adding a *second* one. Renaming rewrites
  tracking refs and removing is destructive; both deserve their own planned
  operation. Connecting the first remote is in scope (see above).
- Editing a nested `.gitignore` in a subdirectory, or the global
  `core.excludesFile` — the first is a file browser, the second is a machine
  setting that would contradict this panel's scope.
- A gear on the welcome screen's recent projects. Those projects are closed, so
  there is no session to authorize a repository read with, and inventing one
  would break the rule every other repository command follows.
- Per-project overrides of anything Settings owns (line endings, hooks, fetch
  cadence).
- Editing credentials, signing keys, or `.gitattributes`.

# Acceptance criteria

- [x] A gear appears beside the star in the project switcher and in the
      Overview summary card, opens the project's settings, and activates a
      non-active project first.
- [x] The panel reads and writes the three sections for the open project only,
      with every call carrying the project's current session epoch.
- [x] Changing a remote's URL validates it, confirms the change, writes it,
      verifies the stored value, and reports failure without leaving the panel
      claiming success.
- [x] A remote whose URL carries credentials is identified as such and cannot
      be saved with the redacted text.
- [x] Both ignore files can be read and written; an absent file is created, a
      file changed on disk since the read is refused with a stale-state error,
      and an oversized file is refused rather than truncated.
- [x] The identity section states the effective identity and its source,
      writes a local override, and removes it when the override is switched
      off.
- [x] Every control is keyboard-operable and labelled; the section rail is one
      tab stop with arrow-key navigation, like the Settings rail.
- [x] Unit tests cover the new pure logic and panel behaviour; Rust tests cover
      the new commands against temporary repositories.
- [x] The IPC contract snapshot and the execution-policy registry list the new
      commands, arguments and error codes.
- [x] `pnpm run check` passes.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `src/app/App.tsx`
- `src/app/AppOverlays.tsx`
- `src/app/project-switcher/ProjectSwitcher.tsx`
- `src/features/overview/OverviewPanel.tsx`
- `src/features/settings/settings.css`
- `src/shared/ui/primitives.css`
- `src-tauri/src/sync/mod.rs`
- `src-tauri/src/ipc.rs`
- `src-tauri/src/application.rs`
- `docs/architecture/025-ipc-contract.json`

# Dependencies

None. Builds on task 097's Settings work and on the remote-connection rules
already in `sync`.

# Decisions

- **A separate dialog, not more Settings sections.** The two panels answer
  different questions ("this machine" vs. "this project"), and the entry points
  the user asked for are per project. Mixing them would have made every
  existing Settings row ambiguous about scope.
- **The gear only where a project is open.** Reading a remote, an identity or
  an ignore file goes through repository authorization with a session epoch. A
  closed recent project has neither, so the welcome screen's list keeps the
  star and the remove control and nothing else. (The welcome list is also a
  different component from the switcher rows, so "change it in one place" was
  not available either way.)
- **Two ignore files, named for who sees them.** `.gitignore` travels with the
  project; `.git/info/exclude` does not. That difference is the whole reason
  the second file exists, and a panel that offered only the first would push
  personal noise into a shared file.
- **Redacted URLs are never saved back.** See Context.
- **Remote URL changes live in `sync`.** Remotes are that module's boundary,
  and the URL rules it already owns are the ones this reuses.
- **Identity is inherit-or-override, not two always-live fields.** The question
  a user actually has is "which identity does this project use", and a pair of
  fields with a placeholder answers it only by implication. The switch makes
  inheritance a state the user can see and return to.

# Implementation notes

## Rust

`project_settings.rs` owns the project-local identity and the two ignore files;
`sync/mod.rs` keeps the remotes, which are already its boundary.

**Identity** is read in three scopes — `--local`, `--global`, and the resolved
value — because the panel has to answer three different questions: what this
project sets, what it would fall back to, and who Git will actually stamp on the
next saved version. `inherited` is the resolved value when there is no local
override, which is the only way a *system*-level identity is reported honestly;
with an override it falls back to the global read. `--unset-all` exits 5 for
"nothing to unset", which is the requested outcome rather than a failure, so
clearing twice succeeds.

**Ignore files** are addressed by scope rather than by path: `project` is the
worktree root's `.gitignore` and `personal` is `<git_dir>/info/exclude` — the
worktree's own Git directory, not the common one, because that is the file Git
reads for a linked worktree. Reads carry a state token (a hash of the bytes on
disk, or `absent`), and a write whose token no longer matches is refused with
`stale_ignore_file` instead of overwriting an edit made elsewhere. Writes go to
a temporary file beside the target and are renamed over it, restore the file's
own line endings, and add the trailing newline Git expects; a file over 256 KiB,
one that is not UTF-8, and one that is not a regular file are each reported as
unavailable rather than truncated or mangled.

**Remotes** gained `ProjectRemote`, deliberately separate from the `RemoteInfo`
Publish and project creation share: only an *editing* surface needs to know that
the stored URL hides parts the display drops, or that pushing goes somewhere
else. `has_hidden_credentials` is computed as "redaction changes this URL",
which covers userinfo and query tokens alike and correctly leaves an SCP-style
`git@host:path` username alone. `set_remote_url` validates the name against the
configured remotes, normalizes the URL through the rules `connect_remote`
already uses, writes, and then re-reads `remote.<name>.url` to verify — Git
reporting success is not the same as the configuration saying what GitOdile
intended.

Seven commands, each with an execution policy and a contract entry:
`read_project_remotes`, `set_remote_url`, `read_project_identity`,
`set_project_identity`, `clear_project_identity`, `read_ignore_file`,
`write_ignore_file`. Four new error codes cover the ignore-file failures that
had no honest existing code.

## Measured against GitHub Desktop

Checked against `desktop/desktop` on the `development` branch rather than from
memory (`app/src/ui/repository-settings/`): `repository-settings.tsx`,
`remote.tsx`, `git-ignore.tsx`, `git-config.tsx`.

| | GitHub Desktop | GitOdile |
| --- | --- | --- |
| Sections | "Remote", "Ignored Files", "Git Config" (plus "Fork Behavior" on forks) | the same three |
| Remote | one remote only, labelled "Primary remote repository (origin) URL"; no add or remove | every configured remote, the publishing one marked, per-remote edit; connecting the first one; still no rename or remove |
| Ignored files | `.gitignore` only — `.git/info/exclude` is not mentioned anywhere in its UI | `.gitignore` **and** `.git/info/exclude`, named by who sees them |
| Identity | radio "Use my global Git config" / "Use a local Git config"; the fields show the global values disabled under the first | the same two-option choice, same disabled inherited fields |
| Leaving the local identity | `removeConfigValue(repository, 'user.name' / 'user.email')` | the same, through `clear_project_identity` |
| Saving | one "Save" in the dialog footer writes every tab at once | per-section save, each with its own confirmation |

So the model is confirmed rather than invented, and the differences are
deliberate:

- **The personal ignore list is ours.** It is the improvement the requester
  asked for, and the one thing in this panel GitHub Desktop has no answer for:
  its context-menu "ignore" and its editor both write the shared file.
- **Per-section saves.** One footer button that writes a remote URL, a
  `.gitignore` and a Git identity in a single click hides which of the three
  actually changed, and this panel confirms remote changes individually.
- **The remote section is a superset**: verification after the write, the
  hidden-credential warning, the separate push URL, and more than one remote.
  GitHub Desktop shows exactly one and edits its URL blind.

Not adopted: their account-email dropdown (it needs a signed-in GitHub account,
which GitOdile does not have yet) and the "Learn more about gitignore files"
link.

## Frontend

The panel loads **per section**, not on open: a user who came to fix a remote
URL does not pay for three `git config` processes and two file reads. `visited`
records which sections have been opened and the resource key is `null` until
then.

The ignore editor keeps its draft **against the state token it started from**
rather than mirroring the file into state of its own. The first version seeded
the draft from an effect, and for one frame after a read an untouched editor
looked like an unsaved edit — which is exactly what the close guard asks about,
so the full suite failed intermittently while the file alone passed. Tying the
draft to the token also retires it on its own whenever the file is re-read: a
successful save, a retry, or a switch to the other list.

`ToggleSwitch` moved from `SettingsPanel` into `shared/ui`, and the settings
panel chrome moved from `features/settings/settings.css` into
`shared/ui/primitives.css`. Both had exactly one consumer until this task and
now have two, which is ADR 0003's bar; the styles for the toggle were already in
`primitives.css`, so only its markup moved. `styleComposition.test.ts` now pins
the new ownership in both directions.

The two confirmation buttons were renamed ("Change it", "Connect it") because
they shared an accessible name with the button that opened them — two buttons
called "Change address" on one screen is a real ambiguity, not just a test
inconvenience.

## Entry points

The switcher gear sits before the star, at the star's size and resting weight,
and is disabled for a non-active project exactly when the row is: reading a
project's settings means switching to it first, which a blocking dialog forbids.
`openProjectSettings(id)` activates that project before opening the panel, and
the panel itself is added to `hasBlockingDialog` — switching underneath a panel
scoped to one repository would leave it reading and writing one the app is no
longer showing.

The welcome screen's recent-project rows deliberately do **not** get the gear;
see Decisions.

## The identity section, second pass

The first version stacked three things that each restated the answer: a card
with the effective identity and its source, a switch with a two-line
description, and — once switched on — fields plus a note naming the inherited
identity again. Reviewed against a screenshot it read as four separate claims
about one fact, with no vertical rhythm between them and the Save button
left-aligned under a wrapped hint.

It now follows GitHub Desktop's shape, in this app's words: a two-option
segmented control ("Your Git identity" / "This project only") beside its
description, then the same pair of fields always visible — filled from the
global config and **disabled** while the identity is inherited, editable when
the project takes it over. The card is gone: the fields *are* the answer to who
this project saves as, so nothing restates it. One caption line sits under them
and only changes tone (the unset warning, the invalid-address complaint),
because a hint that appears and disappears moves the Save button while it is
being aimed at.

Layout fixes that came with it:

- `.project-settings-body` gives every section body one `--space-4` rhythm. The
  shared group body sets no spacing of its own — Settings gets it from
  `.settings-row + .settings-row`, which only helps a body made of rows. This
  panel mixes rows, editors, cards and action bars, and without a gap they sat
  flush against each other (visible in the reported screenshot).
- Actions moved into `.project-settings-actions`, right-aligned like every other
  dialog's action row; the ignore editor's Undo/Save row uses it too.
- The identity fields are `minmax(0, 1fr)` columns with `min-width: 0` fields, so
  a long `…@users.noreply.github.com` scrolls inside its input instead of
  stretching the row.
- Hints in this panel align their glyph to the first line: the shared rule
  centres it, which against a two-line hint reads as floating beside it.
- Disabled inherited fields keep readable text on `--surface-hover` rather than
  the usual faded disabled treatment — they mean "this is what you inherit", not
  "unavailable".
- The always-present caption is not a live region; only action outcomes are, so
  a screen reader is not told the caption on mount and again on every change.

`ToggleSwitch` went back to being private to `SettingsPanel`: this section no
longer uses it, and `shared/ui`'s own rule is two real consumers. What did earn
promotion is `moveFocusWithinRadioGroup` — both panels navigate their radio
groups with the arrow keys now, and a second copy is how two panels start
behaving differently under the same keys.

## …and a third, in the app's own settings language

Reviewed again from a screenshot: the segmented control plus two disabled fields
was tidier than the first pass but still not legible at a glance — a reader had
to work out that the greyed-out fields were the *inherited* identity rather than
a broken form.

Settings already had the right shape for this and it was not being used. A
choice whose options each need a sentence is the **stacked option card** list
that the line-endings group wears: full-width cards, a bold label, a sentence
under it, one quiet provenance line beneath the list. Identity now wears it too:

- **"Your Git identity"** — its description names the identity: "The one your
  other projects use: Ada Lovelace <ada@example.test>." The card that means the
  inherited identity is the card that shows it, so nothing else has to.
- **"A different one, only here"** — the name and email fields appear *under this
  card*, indented behind a rule, and only while it is selected. No disabled copy
  of the inherited values: the other card already says them.
- One line under the list states the consequence — "Versions saved here will be
  signed …" — or, when nothing is set anywhere, the same full-width warning block
  line endings uses for a caveat.
- The selected card carries an "In use" badge, the same pill line endings uses
  for "Recommended".

That made the pattern a shared primitive: `.line-endings__option` and its parts
became `.choice-list`, `.choice-list__option`, `__label`, `__description` and
`__badge` in `primitives.css`, with `.line-endings__caveat`, `__status` and
`__source` staying with the feature that still owns them. Two consumers, one
visual language — the same reasoning that moved the panel chrome and
`moveFocusWithinRadioGroup`, and `styleComposition.test.ts` pins it in both
directions.

## What the pre-commit review found

Nine findings against the finished diff, all fixed here. Four were real defects
rather than polish:

1. **An ignore edit could be saved into the other ignore file.** The unsaved
   draft was keyed only by the file's state token, and the two files can hash to
   the same one — both absent, or holding the same rules. Typing into
   "Everyone", switching to "Only me" and saving would have written the shared
   rule into `.git/info/exclude`, with Rust's stale-token guard none the wiser
   because the target really did hash to that token. Drafts are now keyed by
   scope *and* token.
2. **Switching the ignore list threw away an unsaved edit**, silently — the loss
   the close guard exists to prevent, one interaction earlier. Both lists now
   keep their own draft, the guard knows about the one you are not looking at,
   and it switches to it before asking.
3. **A confirmed connect plan survived a change to the remote's name.** Planning
   for `origin`, renaming the field to `upstream` and confirming would have
   connected `origin` while the field said otherwise; the state token matched,
   so Rust could not catch it. Editing either field now withdraws the question.
4. **`set_remote_url` refused remotes it had just listed.** It validated the
   name with the rule for a name the *user* invents, so an existing remote
   called `team/upstream` could be shown, edited, and then rejected as "not
   safe". Membership in Git's own listing is the check that belongs there;
   the leading-dash guard stays, because that one is about argument safety.

The rest: the write path now refuses an oversized ignore file on its metadata
instead of reading it all into memory to hash it; a mixed-line-ending file is no
longer rewritten wholesale into CRLF because one pair was found anywhere in it
(only a uniformly CRLF file keeps CRLF); the static "this file cannot be edited"
hint stopped being a live region; and one dead translation key was removed.

A fifth defect surfaced while fixing the fourth, and it is the one worth
remembering: **the remote fields were reseeded from an effect whenever a read
landed**, which was harmless while the panel read once per opening and became a
bug the moment revalidation was added — a read answering mid-sentence would put
Git's address back into a field being typed into. The fields now hold their edit
against the address it started from, so a fresh read that agrees changes
nothing, and one that disagrees drops the edit because the ground moved. The
same shape as the ignore drafts, and the same reason. Both are covered by tests
that fail without them.

## Opening it faster

The panel is unmounted on every close, so its first frame used to be a spinner
over three `git config` processes — roughly 55 ms per spawn on Windows. Three
changes, in the order they matter:

- **Answers are kept between openings.** `createProjectSettingsCache` lives in
  `App`, keyed by project path *and* session epoch, capped at twelve entries and
  evicted oldest-first. A remembered answer paints on the first frame and is
  revalidated behind it, so reopening shows the project's settings immediately
  and still cannot go stale. This is the per-project shape of what task 097 did
  by hoisting the global reads above the Settings dialog; reading every
  project's settings on the chance one is opened would have been worse than the
  wait.
- **The ignore file is deliberately never cached.** It is the one read whose
  value the user edits, and serving a remembered copy while a fresh one is on
  its way would swap the editor's contents out from under a draft. It is also
  the only read that costs no Git process, so there was nothing to save.
- **The read starts on hover.** The gear warms its project's remote read from
  `onPointerEnter`/`onFocus`, typically a few hundred milliseconds before the
  click — the same order as the read itself. The cache collapses that and the
  panel's own read into one in-flight promise, so nothing is read twice, and a
  user who never opens the panel pays nothing.

Behind them, the reads themselves got cheaper:

- **The identity is one process instead of three.** `git config -z --show-scope
  --get-regexp` reports every scope in one call, which is both faster and more
  accurate: a system-level identity is now correctly reported as inherited,
  where the previous global-only read saw nothing. `--show-scope` needs Git
  2.26 and GitOdile supports 2.23, so a usage error (exit 129, distinct from
  exit 1 for "no key matched") falls back to the three scoped reads. A test
  asserts the two paths describe the same repository identically.
- **A project with no remotes no longer pays for an upstream lookup** it cannot
  use — two processes saved on exactly the project that would otherwise wait
  for an answer of `None`.
- One frame was also removed from every section switch: the newly opened
  section used to be marked visited from an effect, so its read could not start
  until after a committed render.

# Validation

```
pnpm run check
```

`EXIT=0` on Windows 11, read from the aggregate command's own exit status (run
again after the identity redesign, and again after the pre-commit review):
documentation (152 Markdown files, 119 task ids), frontend architecture (319
modules), TypeScript, 64 frontend test files / 568 tests, the Vite build,
`cargo fmt --check`, Clippy with `-D warnings`, and 319 Rust tests.

New automated coverage:

- `src-tauri/src/project_settings.rs`: identity inheritance, override and
  removal against a scratch global config (so a regression can never write to
  the developer's real one); ignore files created, read, guarded by their state
  token, refused for a NUL byte and for an unknown scope; an oversized file
  reported rather than truncated; and the line-ending/trailing-newline rule.
- `src-tauri/src/tests/sync_tests.rs`: `git remote -v` parsed into fetch/push
  pairs with hidden-credential detection, and `set_remote_url` rejecting an
  unknown remote and an unusable URL before writing, then storing the
  credential-free address and verifying it.
- `src/features/project-settings/domain.test.ts`: the redacted-URL rule, the
  identity draft rules, and the ignore dirty check.
- `src/features/project-settings/ProjectSettingsPanel.test.tsx`: 16 cases across
  the three sections — the confirmation before a remote write, the hidden-
  credential and separate-push-URL notices, connecting the first remote through
  its plan, per-section lazy reads, the one-tab-stop rail, the unsaved-edit
  close guard (and that it never saves silently), and failure reporting for a
  bad URL, a stale ignore file and a failed read.
- `src-tauri/src/project_settings.rs`: the scoped-config parser against Git's
  own precedence order (including a system-only identity, which the fallback
  cannot see), that the fast and fallback read paths describe one repository
  identically, that only a uniformly CRLF file keeps CRLF, and that the write
  path refuses an oversized file on its metadata.
- `src/features/project-settings/ProjectSettingsPanel.test.tsx`: that a
  remembered answer paints without a loading state and is revalidated, that the
  ignore file is never served from memory, that a failed revalidation replaces
  the remembered answer, that a revalidation cannot overwrite what is being
  typed (verified to fail against the previous reseeding behaviour), that each
  ignore list keeps its own draft across a switch, that the close guard asks
  about a draft in the list it is not showing, and that editing either field
  withdraws the confirmation or plan standing over it.
- `src/app/project-switcher/ProjectSwitcher.test.tsx`: the gear opens the right
  project's settings and closes the popover, and is disabled for a project that
  cannot be switched to.

Not verified in the browser preview: the panel is only reachable with a project
open, which needs the Tauri IPC that a plain Vite page does not have, so the
layout above was reviewed against a screenshot from the running app instead.

One dev-server artifact worth knowing about: a long-running Vite process served
a 500 for `src/styles.css` for a while after `project-settings.css` was added
("[postcss] ENOENT … `project-settings/project-settings.css`", resolved from the
repository root rather than from `src/`). The production build compiled the same
import throughout, and the dev server picked the file up on its own after a
later save — so it is a stale-resolution artifact of adding a stylesheet under a
running server, not a broken import.
