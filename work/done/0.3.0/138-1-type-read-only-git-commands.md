---
id: 138-1
title: Type read-only Git commands in the console
status: done
priority: normal
type: feature
areas:
  - rust
  - frontend
  - accessibility
created: 2026-09-29
completed: 2026-09-29
parent: "138"
queue:
---

# Goal

Accept any read-only Git command typed in the console, parsed and classified
entirely in Rust, and lay down the plan contract that 138-2 and task 139 extend.
Nothing in this task can change the project.

# User outcome

Someone can type `git log --graph --oneline -- src/`, `git show HEAD~2:README.md`
or `git blame -L 10,20 src/main.rs` and read the result exactly as a terminal
would show it, with the same colouring, caps and inert output as today's
shortcuts. A command that is not read-only is refused with a plain reason: why,
and — once 138-2 exists — that advanced mode allows it. Shortcuts can store a
whole command line (`lg` → `git log --graph --oneline -20`).

# Context

Implements sections 1, 2, 3 and 6 of
[ADR 0017](../../../docs/adr/0017-console-git-commands-by-permission-tier.md)
for the Read tier. The operation-ID path of task 134 stays for catalogue
shortcuts; typed lines go through the new plan contract.

# Scope

- **Tokenizer** in Rust: whitespace-separated arguments, single quotes literal,
  double quotes with `\"` and `\\`, unquoted backslash literal; no expansion of
  any kind; unquoted `;`, `&`, `|`, `<`, `>`, backtick or `$(` rejects the line
  as shell syntax. Only lines starting with `git ` are commands.
- **Classifier**: the built-in subcommand allowlist; global options refused
  (`-c`, `-C`, `--exec-path`, `--git-dir`, `--work-tree`, `--namespace`,
  `--config-env`, `--super-prefix`, `-p`/`--paginate`); per-subcommand deny
  lists for options that run programs, write files, leave the project or open
  an editor (`--output`, `--no-index`, `--ext-diff`, `--textconv`,
  `-O`/`--open-files-in-pager`, `--upload-pack`, `--exec`, …); aliases and
  external `git-*` programs refused. Each subcommand classifies its arguments
  into a tier; only **Read** is runnable here, and every other tier is refused
  with its tier named. An unrecognised combination takes the stricter tier.
- **Read subcommands** at least: `status`, `log`, `show`, `diff` (not
  `--no-index`), `blame`, `grep` (not `-O`), `branch`/`tag` listing forms,
  `reflog show`, `ls-files`, `ls-tree`, `cat-file -p/-t/-s`, `rev-parse`,
  `describe`, `shortlog` (with an explicit revision), `remote -v` and
  `remote get-url` (not `remote show`, which reaches the network),
  `stash list`/`stash show`, `count-objects`, `whatchanged`, `name-rev`,
  `merge-base`, `for-each-ref`, `show-ref`, `version`.
- **Plan contract**: `plan_console_command(path, sessionEpoch, line)` returns
  the argument vector, tier, a plain-language effect line and the confirmation
  it needs (always "none" for Read); `run_console_plan(path, sessionEpoch,
  planId)` runs it. Plans are single-use, expire with the session epoch and
  carry the repository fingerprint that 138-2 starts enforcing. Registered in
  the execution inventory with a read policy, output caps and timeout, and the
  environment of today's console queries; `--no-ext-diff`/`--no-textconv` are
  added where the subcommand supports them.
- **Console**: `git …` lines plan and run in one gesture and render like
  shortcut blocks (the exact argument vector as the command line, output
  tones where the subcommand's shape is known, plain otherwise). Completion
  offers allowed subcommands after `git `. `help` gains a `help git` page
  listing what the Read tier accepts. Shortcuts may store a command line,
  validated on save and planned on every run.

# Out of scope

- Every tier above Read, advanced mode and the Settings switch (138-2, task 139).
- Network reads (`fetch`, `ls-remote`, `remote show`) — they belong to the
  Remote tier.

# Acceptance criteria

- [x] Tokenizer tests cover quoting, escapes, Windows paths, empty and huge
      input, Unicode, and every rejected shell construct.
- [x] One test per deny-list entry and per refused global option proves the
      line is refused before any process starts; aliases and external
      `git-*` names are refused even when defined in the repository's config.
- [x] Every allowed Read subcommand runs against a temporary repository and
      returns bounded, inert output; no Read plan writes to the repository
      (index and refs unchanged, no lock files left).
- [x] Commands of every higher tier are refused with the tier named.
- [x] A stored command-line shortcut is revalidated on every run and cannot
      widen the tier it was saved with.
- [x] The Windows Tauri app is exercised with typed commands in both themes;
      keyboard, screen-reader output and empty/error/refused states checked.
- [x] `pnpm run check` passes.

# Relevant files

- [ADR 0017](../../../docs/adr/0017-console-git-commands-by-permission-tier.md)
- `src-tauri/src/console/` (`mod.rs` plans and runs, `tokenize.rs`,
  `classify.rs`, `catalogue.rs` for the task 134 queries)
- `src-tauri/src/git_command.rs`, `src-tauri/src/application.rs`,
  `src-tauri/src/ipc.rs`, `docs/architecture/025-ipc-contract.json`
- `src/features/console/`

# Dependencies

Task 134.

# Decisions

- The renderer sends the typed line only to `plan_console_command`; Rust owns
  parsing, classification and the argument vector.
- Options are filtered by per-subcommand deny lists on top of a subcommand
  allowlist, per ADR 0017; the stricter tier wins when in doubt.
- The long-option deny list applies to every subcommand, since no Read
  subcommand needs any of it. Git accepts a unique abbreviation of a long
  option, so any prefix of a denied option is refused too, except the few real
  options that happen to be one (`--text`, `--exclude`, `--filter`,
  `--ignore-rev`). A value that merely looks like a denied option is refused
  as well; that is the stricter reading.
- Only `diff` checks its paths for leaving the project, because two paths
  outside the repository turn it into `--no-index`. Every other Read
  subcommand relies on Git's own refusal of a pathspec outside the repository.
- Typed reads also get `--no-show-signature` where the subcommand takes it:
  `log.showSignature` would otherwise run the GPG program, which the project's
  own configuration can choose. `shortlog` without a revision gets `HEAD`,
  since the console gives it no standard input. Every console process,
  catalogue queries included, runs with `GIT_EDITOR` and `GIT_SEQUENCE_EDITOR`
  set to `false`.
- Read plans do not bind a repository fingerprint yet: there is nothing a
  moved repository could make unsafe about a read, and computing one costs a
  Git process per command. 138-2 adds the fingerprint together with the first
  tier that enforces it.
- `checkout <name>` is classified Destructive, because without a lookup it may
  restore a file as easily as switch branch. 138-2 should resolve the name at
  plan time so switching a branch is a Local change.
- `git` alone and `help git` list the Read commands; `git` is a reserved
  shortcut name. The renderer's list of Read commands exists only for help and
  completion, and a Rust test keeps it equal to the classifier's.
- A line shortcut's saved tier is a ceiling the renderer enforces after each
  plan. It is a promise to the person, not the security boundary: Rust's tier
  gate still decides what runs.

# Validation

Record the tokenizer and deny-list fixtures, the temporary-repository runs,
the Windows desktop check, and `pnpm run check`.

2026-09-29, Windows 11, Git 2.55.0:

- `console::tokenize` tests: quoting, escapes, Windows paths, Unicode, empty
  and oversized input, control and bidirectional characters, every rejected
  shell construct, and the echoed command reading back as the same arguments.
- `console::classify` tests: every denied long option under six subcommands,
  with and without a value, plus abbreviations and the exact-option
  exceptions; denied short options inside bundles; every refused global
  option; unknown names, aliases and `git-*`; `diff` paths outside the project;
  editor and interactive forms; representative commands of every higher tier.
- `console` tests against temporary repositories: 34 typed reads (every Read
  subcommand) succeed with inert, untruncated output while staged content,
  refs and HEAD stay identical and no `.lock` file is left; a configured
  external diff and text conversion run for plain `git diff` and `git log -p`
  but never through the console; aliases defined in the project's config,
  including a `!` alias, are refused; refusals plan against a path with no
  repository; plans are single-use and refused for another session epoch or
  project; the plan store stays bounded.
- Renderer tests cover planning and running a typed line, printed refusals
  that never reach `run_console_plan`, `help git`, completion after `git `,
  saving a command-line shortcut through Rust's check, refusing to save one
  Rust would not run, and a later wider plan not running.
- Browser check of the console screen with a stubbed port, light and dark
  themes: typed read with its echoed command and graph colours, tier and shell
  refusals, `help git`, completion menu, and the shortcut editor's command-line
  target reached by keyboard. The Windows Tauri desktop check is still open.
- `pnpm run check` passed.
- Checked by hand on 2026-09-29 in the running Windows desktop app (`tauri dev`)
  by the project owner, who reported the checks as passing.
