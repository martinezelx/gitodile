# ADR 0028: The console runs changes without a read-only mode

- Status: accepted
- Date: 2026-10-06
- Replaces: section 4 of [ADR 0017](0017-console-git-commands-by-permission-tier.md)
- Implemented by: [task 149](../../work/done/0.4.0/149-single-console-mode.md)

## Context

ADR 0017 §4 put every console change behind a GitOdile setting, advanced mode,
off by default. Settings › Console showed it as three modes: **read-only**
(the default), **advanced** (changes, each confirmed) and **root** (changes
without the question). Moving up went through a dialog.

The owner questioned the read-only default (2026-10-06): anyone can open their
system terminal and run any Git, gh or glab command, so a console that refuses
`git commit -m` until a setting is changed protects nothing. It only makes the
console worse than the terminal it sits beside.

ADR 0017 restricts the console for three separate reasons, and only one of
them is about the person:

1. **The renderer is the trust boundary.** A line reaches Rust over IPC, not
   from a keyboard Rust can see. If the console ran any argument, a script
   injected into the webview could run any program on the machine (`-c
   core.sshCommand=…`, `!` aliases, `--upload-pack`). The **Never** tier
   exists for this reason.
2. **There is no terminal.** Editors, pagers, `add -p` and credential prompts
   cannot work without a PTY.
3. **Changes need a preview and a way back.** The plan, its `[s/N]`, the
   repository fingerprint and, for history and destructive commands, a
   recovery point (task 139). These are what the console offers that a plain
   terminal does not.

The read-only default and the advanced switch add nothing to any of these.
Their only effect is to stop the person from making changes they could make
anyway.

## Decision

- **Read, Local change and Remote plans run for everyone.** There is no
  advanced mode. Local change and Remote plans keep their pre-flight preview,
  fingerprint and `stale_preview` check exactly as ADR 0017 §3 describes.
- **One setting remains: change confirmations**, on by default. It is a
  plain switch, **Confirm each change**, in Settings › Console, not a choice of
  named modes. On, each change prints its plan and asks `[s/N]`. Off, the plan
  still prints and the change runs on Enter. Turning it off goes through a
  dialog; turning it back on is immediate. Rust holds the setting and reads it
  on every plan and run. A plan made without a question does not run once
  confirmations are back on.
- **History change and Destructive stay refused** until their recovery points
  exist (task 139). This rule comes from AGENTS.md, not from the console's
  mode.
- **The Never tier, the shell-free tokenizer, the subcommand allowlist and the
  option deny lists are unchanged.** They guard the IPC boundary and the
  missing terminal, not the person.
- **Settings migrate without widening anything.** A stored
  `advancedMode: false` keeps confirmations on whatever `confirmChanges`
  says, so nobody who chose read-only ends up without confirmations. The old field is read
  once and never written again. The `set_console_advanced_mode` command is
  removed.

## Consequences

- A new install can `git add`, `git commit -m`, `git switch`, `git fetch`,
  `git pull --ff-only` and `git push` from the console, each previewed and
  confirmed, with no trip to Settings.
- The console's status line and the welcome's environment section say whether
  changes are confirmed: in the success tone when they are, and in the
  console's own violet when they run without asking. The read-only, advanced
  and root labels, the mode cards and the advanced dialog are gone.
- Release qualification covers one setting, not two.
- gh and glab are a separate question with the same boundary. They start as a
  closed set of safe shortcuts
  ([task 148-12](../../work/done/0.4.0/148-12-console-gh-and-glab-shortcuts.md)).
  Typing arbitrary gh or glab lines would need a classifier of its own.

## Alternatives considered

- **Keep the three modes.** Rejected for the reasons above: the default
  protects nothing the system terminal does not already allow.
- **Drop confirmations too and run everything typed.** Rejected: the
  preview and `[s/N]` are the console's value over the system terminal, and
  root already exists for people who want to skip the question.
- **Lift the Never tier for people who opt in.** Rejected: that tier guards
  the webview boundary. Opting in cannot make an injected script safe.
