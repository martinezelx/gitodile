# ADR 0017: Run typed Git commands in the console through Rust-classified permission tiers

- Status: accepted
- Date: 2026-09-29
- Implemented by: [epic 138](../../work/done/0.3.0/138-console-git-commands.md)
  (Read, Local change and Remote tiers). The History and Destructive tiers,
  and section 5, are [task 139](../../work/0.6.0/139-console-history-and-destructive-commands.md).
- Section 4 (advanced mode and the read-only default) is replaced by
  [ADR 0028](0028-console-runs-changes-without-a-read-only-mode.md): changes
  run for everyone, and change confirmations are the console's only setting.

## Context

Task 134 shipped the project console with a closed catalogue: the renderer may
send one of eleven operation IDs, and Rust maps each to a reviewed, read-only
argument template. Neither a command line nor custom Git arguments cross IPC.
That boundary made the first console safe, but it also makes it feel limited:
people who open a terminal expect to type `git log --graph -- src/`,
`git show HEAD~2`, and eventually `git commit -m "…"` or `git switch -c try`.

Typing "any Git command" is not the same as typing a shortcut. Several classes
of risk come with it, and GitOdile's safety rules (AGENTS.md, "Safety rules for
Git operations") apply to all of them:

- **Running programs.** Git options and configuration can execute arbitrary
  programs: `-c core.sshCommand=…`, `-c core.pager=…`, `-c alias.x='!cmd'`,
  `-c core.fsmonitor=…`, `-c diff.external=…`, `--exec-path`,
  `--upload-pack`/`--receive-pack`, `ext::` transport URLs, `rebase --exec`,
  `bisect run`, `submodule foreach`, `difftool`/`mergetool`, `grep -O`. A Git
  alias the user or the repository defines can be `!sh …`. Accepting the whole
  surface is, in practice, running any program on the machine.
- **Leaving the project.** `-C`, `--git-dir`, `--work-tree` and
  `diff --no-index` read or write outside the open repository; `--output`,
  `format-patch -o`, `archive --output` and `bundle create` write files.
- **Losing work.** `reset --hard`, `clean -fd`, `restore`/`checkout -- <path>`,
  `branch -D`, `stash drop`, `push --force` and `gc --prune` discard work or
  history. AGENTS.md requires explicit confirmation and a recovery strategy
  before any of them.
- **Changing shared state.** `push` changes teammates' view of the project;
  `fetch`/`pull` reach the network and use credentials.
- **Needing a terminal.** Editors (`commit` without `-m`, `rebase -i`,
  `merge` with an edit), `add -p`, pagers and credential prompts have no PTY
  here, and task 134 deliberately shipped without one.
- **Persisting behaviour.** `config` writes change what every Git tool on the
  machine does, which AGENTS.md forbids unless a setting is scoped to GitOdile.

The repository already has the pieces a safe answer needs: the Rust execution
inventory (`application.rs`) classifies every command as read-only, local
mutation, history mutation, remote mutation or destructive; `git_command.rs`
runs Git as separate arguments with a bounded, policy-aware runner; save and
publish previews bind a plan to repository state and reject it with
`stale_preview` when that state moves; ADR 0007 stores discard recovery for
worktree content and ADR 0008/0016 store recovery points as versioned hidden
refs with manifests.

## Decision

The console accepts typed Git command lines. **Rust parses, classifies and
decides**; the renderer never decides what is safe, and every run goes through
a plan Rust issued.

### 1. The line is parsed in Rust, never by a shell

A typed line starting with `git ` crosses IPC as text, once, to be planned. Rust
tokenizes it with a small, platform-independent grammar: whitespace separates
arguments, single quotes are literal, double quotes allow `\"` and `\\`, and an
unquoted backslash is literal so Windows paths work. There is no expansion of
any kind — no variables, globs, `~`, command substitution — and an unquoted
`;`, `&`, `|`, `<`, `>`, `` ` `` or `$(` rejects the line as shell syntax rather
than being passed to Git. The result is an argument vector handed to the
existing runner as separate process arguments.

Bare words keep their meaning: a shortcut name or a console word (`help`,
`clear`, `shortcuts`). A shortcut may now also name a stored command line
(`lg` → `git log --graph --oneline -20`), which is planned exactly as if it had
been typed.

### 2. One classification, in Rust, from an allowlist

Only Git's own built-in subcommands are accepted, from an allowlist; anything
else — including aliases, external `git-*` programs such as `git-lfs`, and
`help -w`/`instaweb`/`daemon`/`send-email`/`credential` — is refused with a
reason. Global options before the subcommand are refused outright (`-c`, `-C`,
`--exec-path`, `--git-dir`, `--work-tree`, `--namespace`, `--config-env`,
`--super-prefix`, `-p`/`--paginate`).

Options are handled by a **deny list of dangerous options per subcommand** on top
of the subcommand allowlist, not by allowlisting every option of every
command. The danger is concentrated in a small, knowable set — options that run
programs, write files, reach outside the project or open an editor — while an
option allowlist for all of Git would be unmaintainable and would fall behind
every Git release. Unknown options pass through to Git, which rejects the
ones it does not know. Each subcommand then has a classifier that looks at its
arguments and returns one tier:

| Tier | Examples | Default mode | Advanced mode |
| --- | --- | --- | --- |
| **Read** — local, no writes | `status`, `log`, `show`, `diff`, `blame`, `grep`, `branch --list`, `tag -l`, `reflog show`, `ls-files`, `rev-parse`, `remote -v`, `stash list/show` | runs | runs |
| **Local change** — reversible, repository-local | `add`, `restore --staged`, `mv`, `commit -m`, `switch`/`checkout <branch>` on a clean tree, `branch <new>`, `tag <new>`, `stash push`, `revert`, `cherry-pick` | refused, names advanced mode | plan, then `[y/N]` |
| **History change** — moves existing refs | `commit --amend`, `reset --soft/--mixed`, `rebase` (non-interactive), `merge`, `branch -m/-f`, `tag -f` | refused | plan, recovery point, then `[y/N]` |
| **Remote** — network or teammates | `fetch`, `pull`, `push` (no force), `ls-remote` | refused | plan, then `[y/N]`; credentials only through the system helper |
| **Destructive** — discards work or history | `reset --hard`, `clean`, `restore`/`checkout -- <path>`, `branch -d/-D`, `tag -d`, `stash drop/clear`, `push --force`/`--force-with-lease`/`--delete` | refused | plan with exact effects, recovery point, typed confirmation |
| **Never** | any option or command that runs a program, leaves the project, writes outside it, opens an editor or pager, writes Git config, or manages hooks; `filter-branch`, `bisect run`, `submodule foreach`, `rebase -i/--exec`, `add -p`, `gc`, `prune`, `reflog expire`, `update-ref`, `config` writes | refused | refused |

An unrecognised combination falls into the stricter tier, never the looser.
Commands that would need an editor are refused with the non-interactive form
to use instead (`commit` needs `-m`; `merge` gets `--no-edit`, which the plan
shows). The same applies to integration a command performs on its own: `pull`
is a Remote plan only as a fast-forward, so the plan adds `--no-rebase
--ff-only`, and a `pull` that asks to rebase or merge is a History change.
`revert` gets `--no-edit` to keep Git's own message. `stash pop` and
`stash branch` drop the entry they apply, so they are Destructive, while
`stash apply` is a Local change. `checkout <name>` is Destructive until the
plan looks the name up: an existing branch (or a single remote branch Git would
track) makes it a Local change switch, anything else may restore a file.

### 3. Every run is a plan Rust issued

`plan_console_command(path, sessionEpoch, line, runHooks)` parses and
classifies the line, and returns a plan: the exact argument vector, the tier, a plain-language
statement of what will change (local files, history, the remote, teammates),
any recovery point it will create, and the confirmation it needs — none, `y/N`,
or a typed word. For a destructive plan the effects are exact, computed without
changing anything: the files `clean -n` would remove, the diff `reset --hard`
would discard, the commits a force push would drop from the remote.

The plan is bound to a fingerprint of the repository state it describes (HEAD,
the current branch, the index and working-tree status, and the remote-tracking
ref involved). A read runs through `run_console_plan(path, sessionEpoch,
planId)`; a change runs through `run_console_change(path, sessionEpoch, planId,
answer)`, which has the exclusive write policy, re-reads that state and refuses
a moved repository with `stale_preview`, exactly as save and publish do. A
plan is single-use and expires with its session epoch. As implemented, the
fingerprint hashes `status --porcelain=v2 --branch` and every ref.

Read plans need no confirmation, so the console plans and runs them in one
gesture. Everything else is confirmed in the terminal's own idiom — the plan
prints as a block and the prompt asks `¿Continuar? [s/N]`, or for destructive
plans asks for the target's name (the branch, tag or path) or a shown word.
Rust checks the answer again. Someone who chooses the **root** console mode
(section 4) has changes run as soon as they press Enter: the plan still
prints, and the fingerprint still refuses a moved repository.

### 4. Advanced mode is a Rust-held setting, off by default

> Replaced by [ADR 0028](0028-console-runs-changes-without-a-read-only-mode.md).
> Kept as the record of the original decision.

Only the **Read** tier runs by default. Everything above it requires advanced
mode. Rust holds two settings, advanced mode and change confirmations (on by
default), and Settings › Console presents them as one choice of three console
modes: **read-only**, **advanced** (changes, each confirmed) and **root**
(changes without the question). Moving to advanced or root goes through a
dialog that states plainly what it allows and that GitOdile's guided flows
remain the safe path; moving down takes effect at once, and a plan made under
a mode that no longer holds does not run.

The settings are persisted by Rust in GitOdile's own local data directory and
read by Rust on every plan and run. The renderer does not pass an "advanced"
flag, so nothing in the webview can widen the tier by sending a parameter. They
are GitOdile settings only; they never write to Git configuration.

The console's status line and welcome name the mode: read-only in the success
tone, advanced in the warning tone, and root in a violet of its own.

### 5. Recovery before anything that can lose work

Not yet implemented: History and Destructive plans stay refused until
[task 139](../../work/0.6.0/139-console-history-and-destructive-commands.md),
which waits for the Recovery Center and records an open question about going
ahead without recovery points. The decision below is the one that task starts
from.

History and destructive plans create and verify a recovery point **before**
running, and refuse to run if they cannot:

- Ref moves (`reset`, `rebase`, `amend`, `branch -f/-m/-d/-D`, `tag -f/-d`,
  `merge`) record the previous commit with the ADR 0008 protocol under a new
  operation, `console`, with its own namespace, manifest folder and retention.
- Working-tree and index discards (`reset --hard`, `restore`, `checkout --`,
  `clean`, `stash drop`) snapshot the affected content first — tracked changes
  and, for `clean`, the untracked files it would delete — using the ADR 0007
  discard-recovery store and the temporary-index preparation in `index.rs`.
- A force push records the remote's previous tip as a local recovery ref
  before pushing; deleting a remote branch does the same.

The run's result names its recovery point so the console can print it, and the
records appear in the Recovery Center (task 065-5) like any other.

### 6. The runner keeps its guarantees

All tiers run through `git_command.rs` with an execution policy per tier,
output caps, timeouts, cancellation, `LC_ALL=C`, `GIT_PAGER=`,
`GIT_TERMINAL_PROMPT=0`, a disabled editor (`GIT_EDITOR` set to a command that
fails), `GIT_OPTIONAL_LOCKS=0` for reads, and output stripped of terminal
controls and bidirectional overrides before it reaches the renderer. Where a
read subcommand supports `--no-ext-diff`/`--no-textconv`, the plan adds them.

Hooks follow the existing rule: they run unless the user turned them off in
Settings, and the console never adds `--no-verify` on its own. A `--no-verify`
the user typed is honoured and stated in the plan. A mutation invalidates the
repository state the same way the guided flows do, so other screens refresh.

## Consequences

- The console becomes a real Git surface without becoming a system shell, and
  its safety lives in one reviewed place: the Rust parser, classifier and plan.
- The task 134 boundary changes deliberately: a command line may now cross
  IPC, but only to `plan_console_command`, and only Rust turns it into
  arguments. The operation-ID path stays for catalogue shortcuts.
- The deny lists and classifiers are code to maintain. Each entry needs a test,
  and a Git upgrade that adds a dangerous option needs a review; the stricter
  tier fallback limits the cost of a miss.
- Mutations through the console are as recoverable as through the guided
  flows, at the cost of a pre-flight read and a recovery write before each one.
- Interactive Git (editors, `-p`, `rebase -i`) stays out until there is a PTY
  decision of its own. Credential prompts stay with the system helper and the
  diagnostics of task 065-7.
- The Recovery Center gains a new record kind, and advanced mode becomes one
  more thing release qualification must cover on every platform.

## Alternatives considered

- **Keep only the closed catalogue.** Safe, but it does not meet what people
  expect from a terminal, and the catalogue would grow one reviewed template
  at a time forever.
- **Pass the line to a system shell, or to Git unfiltered, behind one warning.**
  Rejected: a single confirmation cannot stand in for per-command previews and
  recovery, and Git's own options make it arbitrary program execution.
- **Allowlist every option of every subcommand.** The strictest filter, but it
  would lag every Git release and break ordinary use; the danger is in a small
  set of options that a deny list covers, backed by the stricter-tier fallback.
- **Route mutations to the existing guided dialogs instead of running them.**
  Considered for `commit` and `push`. It would duplicate those flows' inputs in
  a command syntax and still leave `reset`, `rebase` or `branch -D` without a
  home. Plans reuse the guided flows' machinery (stale previews, recovery,
  hooks, failure classification) without routing through their UI.
- **Classify in the renderer.** Rejected: the webview is the wrong trust
  boundary, and the frontend would have to be kept in step with Rust's rules.
- **Keep the advanced switch in browser storage.** Rejected for the same
  reason; Rust must not trust a flag the renderer can send.
