---
id: 138-2
title: Advanced console mode with previewed local and remote changes
status: done
priority: normal
type: feature
areas:
  - rust
  - frontend
  - settings
  - accessibility
created: 2026-09-29
completed: 2026-09-29
parent: "138"
queue:
---

# Goal

Add advanced mode — off by default, enabled behind a confirmation dialog and
held by Rust — and let it run the **Local change** and **Remote** tiers of
ADR 0017 through confirmed, stale-checked plans.

# User outcome

Someone who turns on advanced mode can type `git add .`, `git commit -m "…"`,
`git switch -c try`, `git stash push`, `git fetch` or `git push`. Before
anything runs, the console prints what will change — local files, history, the
remote, teammates — and asks `¿Continuar? [s/N]`. If the project changed since
the preview, the command does not run. History and destructive commands are
still refused, with a note that they are not available yet.

# Context

Implements sections 3 to 6 of
[ADR 0017](../../../docs/adr/0017-console-git-commands-by-permission-tier.md)
for the Local change and Remote tiers, on the parser, classifier and plan
contract of [138-1](138-1-type-read-only-git-commands.md).

# Scope

- **Setting in Rust**: an advanced-mode flag stored in GitOdile's own
  configuration directory, read by Rust on every plan; the renderer cannot pass
  it per call. Commands to read and set it; setting it on requires the
  renderer's confirmation dialog to have been accepted, and turning it off is
  immediate. Never written to Git configuration.
- **Settings › Console**: an "Advanced mode" switch that opens a confirmation
  dialog stating what it allows, that previews and confirmation always apply,
  and that the guided flows remain the safe path. The console's status line
  and welcome show the mode in the warning tone.
- **Local change tier**: `add`, `restore --staged`, `mv`, `commit -m` (not
  `--amend`, which is History), `switch`/`checkout <branch>` when the tree is
  clean or Git would refuse on its own, `branch <new>`, `tag <new>`,
  `stash push`, `stash apply`, `revert`, `cherry-pick` — each classified by its
  arguments, with editor forms refused and their non-interactive form named
  (`merge` is History and waits for task 139).
- **Remote tier**: `fetch`, `pull` (as fetch plus integration — its
  integration step is classified and refused if it would be History or
  Destructive), `push` without force or delete, `ls-remote`, `remote show`.
  Credentials only through the system helper with `GIT_TERMINAL_PROMPT=0`;
  failures go through the provider-neutral classification of task 065-7 where
  it exists.
- **Plans**: effect lines in plain language from a pre-flight read (files
  staged, the version a commit will create and on which branch, commits a push
  will publish and where); the repository fingerprint enforced with
  `stale_preview`; single-use plan IDs; confirmation `[s/N]` in the terminal,
  where only `s`/`y` runs and anything else cancels.
- **Hooks**: they run unless the Settings switch turned them off; the console
  never adds `--no-verify`, and a user-typed `--no-verify` is stated in the
  plan. Hook and signing failures are reported, not bypassed.
- **Refresh**: a completed change invalidates repository state through the
  same path the guided flows use, so every screen and the console's status line
  update.

# Out of scope

- History and Destructive tiers ([task 139](../../0.6.0/139-console-history-and-destructive-commands.md)).
- Force pushes, remote deletes, `merge`, `rebase`, `reset`, `--amend`.

# Acceptance criteria

- [x] With advanced mode off, no plan above Read is runnable, whatever the
      renderer sends; the flag is only changed through its own command.
- [x] Enabling asks for confirmation; disabling is immediate; the state
      survives restarts and is never written to Git configuration.
- [x] Every Local change and Remote subcommand in scope has a
      temporary-repository test for its plan and its run, including a stale
      plan refused after the repository moves.
- [x] Editor-requiring forms are refused with the form to use instead.
- [x] Hooks run by default, are skipped only by the Settings switch or a typed
      `--no-verify`, and a failing hook is reported as a hook failure.
- [x] Push and fetch against a local bare remote and an authenticated remote
      report credential problems without prompting.
- [x] The Windows Tauri app is exercised for the dialog, the mode indicator,
      confirm and cancel, a stale plan, and a hook failure.
- [x] `pnpm run check` passes.

# Relevant files

- [ADR 0017](../../../docs/adr/0017-console-git-commands-by-permission-tier.md)
- `src-tauri/src/tooling.rs` (GitOdile-scoped settings), `src-tauri/src/operation.rs`,
  `src-tauri/src/save_version.rs` and `src-tauri/src/publish.rs` (stale-preview
  and hook patterns), `src-tauri/src/sync/`
- `src/features/console/`, `src/features/settings/`

# Dependencies

[138-1](138-1-type-read-only-git-commands.md). Credential classification from
[task 065-7](../../0.7.0/065-7-credential-remote-diagnostics.md) is reused
when available but does not block this task.

# Decisions

- Advanced mode is a GitOdile setting held and enforced by Rust, off by default.
- Confirmation is in the terminal's idiom (`[s/N]`), not a modal, except for
  enabling advanced mode itself.
- A second setting, "Confirm each change", on by default, lets someone in
  advanced mode drop the `[s/N]` question (asked for on 2026-09-29): the plan
  is still printed and still refused when the repository moved. Rust holds it
  beside advanced mode; turning it off takes the renderer's `confirmed` after
  its own dialog, turning it back on is immediate, and a plan made without a
  question does not run once confirmations are back on. Settings shows the
  two settings as one choice of three modes, "Console mode", first in the
  Console section: read-only, advanced, and root (advanced without
  confirmations). Each is a card; the chosen one takes its mode's colour and
  a check, root chosen being the one solid violet card (`--console-root`).
  Moving up opens that mode's dialog, one dialog even from read-only to root;
  moving down is immediate, and advanced turns confirmations back on before
  advanced mode, so there is never a moment of root on the way. The console
  names the same three modes in its status line chip and its welcome.
- The setting lives in `console-settings.json` in GitOdile's local data folder
  and is read into memory once; Rust checks it when planning and again when
  running, so turning it off stops a plan already on screen. Enabling takes a
  `confirmed` flag, the renderer's word that the dialog was accepted.
- Reads and changes run through separate commands: `run_console_plan` keeps
  the read policy, `run_console_change` has the exclusive write policy and
  checks the answer (`s`, `sí`, `y`, `yes`) itself. Its execution class is
  Remote mutation, the widest a change can have until task 139.
- The hooks switch travels with each plan as `runHooks`, as it does with save
  and publish, rather than Rust reading an app preference it does not own.
- The fingerprint hashes `status --porcelain=v2 --branch` and every ref. It
  catches a moved HEAD, a new or moved ref, a changed index and a file that
  becomes changed or untracked; further edits to an already changed file do
  not change it, which no plan's facts depend on.
- `pull` is a Remote plan only as `--no-rebase --ff-only`; `--rebase`, `-r`,
  `--ff`, `--no-ff` and `--squash` make it a History change. `revert` gets
  `--no-edit`. `stash pop` and `stash branch` are Destructive because they drop
  the entry; `stash apply` is the Local change. `bisect` is not available: it
  leaves the project detached across several commands.
- `checkout <name>` is resolved at plan time: an existing local branch, or a
  single remote branch Git would track, makes it a Local change switch.
- Unstaging with `reset` (no commit named, only paths or nothing) is a Local
  change like `restore --staged`; every other `reset` waits for task 139.
- Failed changes carry a hint (hook, signing, credentials, the remote's rules,
  a remote that moved) read from Git's text the way the guided flows do; a hook
  is blamed only when one is installed and was allowed to run.

# Validation

Record the tier fixtures, stale-plan and hook tests, remote tests, the Windows
desktop check, and `pnpm run check`.

2026-09-29, Windows 11, Git 2.55.0:

- `console::settings` tests: off by default, on only with `confirmed`, off
  without it, kept across a reload, and a damaged or oversized file reads as
  off.
- `console::classify` tests: the intent every change plan previews, `pull`
  with `--no-rebase --ff-only` and its rebase or merge forms as History,
  `revert --no-edit`, `stash pop`/`branch` as Destructive, `bisect` not
  available, plus the 138-1 fixtures for editor forms.
- `console::change_tests` against temporary repositories: advanced mode off
  refuses every change and names the tier; a change plan never runs through
  the read path or on any answer but yes, and stops when the mode is turned off
  after planning; History and Destructive plans stay refused. `add`,
  `restore --staged`, `commit -m`, `mv`, `switch -c`, `checkout <branch>` (and
  `checkout <file>` still refused), `branch`, `tag -a -m`, `cherry-pick`,
  `revert`, `stash push` and `stash apply` each show their facts and run. A
  plan is refused with `stale_preview` after a new file appears or HEAD moves.
  A failing `pre-commit` hook is reported as a hook failure; the Settings
  switch adds and states `--no-verify`, and a typed `-n` is honoured without
  adding it twice. Against a local bare remote: `push -u`, `push` with the
  number of versions it publishes, `fetch`, a fast-forward `pull`,
  `ls-remote`, `remote show`, and a rejected push and a pull that would need
  a merge, both reported as a moved remote.
- Renderer tests: the plan block, `[s/N]` answered no, yes, with Escape and
  cleared away, the answer kept out of history, the hint for a hook failure,
  a stale plan's error, the refresh after a change, and the advanced-mode
  switch with its dialog, immediate off and a failed save.
- Browser check with a stubbed port: plan block, cancelled and run changes,
  the failure hint and the warning-tone mode in the dark theme; the enabling
  dialog's text.
- `pnpm run check` passed.
- Still open, by agreement: push and fetch against an authenticated remote,
  and the Windows desktop check, both run by hand on the real app.
- Checked by hand on 2026-09-29 in the running Windows desktop app (`tauri dev`)
  by the project owner, who reported the checks as passing, including push and fetch against an authenticated remote.
