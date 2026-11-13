---
id: 148-12
title: Run safe gh and glab shortcuts from the project console
status: done
priority: normal
type: feature
areas:
  - frontend
  - platform
  - credentials
created: 2026-10-06
completed: 2026-10-07
parent: "148"
queue:
---

# Goal

Add a closed set of read-only GitHub CLI (`gh`) and GitLab CLI (`glab`)
shortcuts to the project console, as a child of
[epic 148](../../after-1.0/148-connect-github-account.md). People who connected a hosting
account can see pull/merge requests, issues and CI runs for the open project
without leaving GitOdile.

# User outcome

Typing `prs`, `issues` or `runs` in the console of a GitHub or GitLab project
shows the same answer `gh` or `glab` would give in a terminal, and never
changes anything on the hosting service.

# Context

The owner asked on 2026-10-06 for gh/glab in the console. They agreed that
arbitrary gh/glab lines need their own classifier: `gh api`/`glab api` can
make any authenticated request (including deleting a repository), `gh
extension` and `gh alias set '!…'` run programs, and `gh auth token` prints a
secret into the transcript. The first step is shortcuts only, the way task 134
started the Git console. [ADR 0028](../../../docs/adr/0028-console-runs-changes-without-a-read-only-mode.md)
removed the console's read-only mode for Git. This task keeps every gh/glab
shortcut read-only by construction instead.

GitOdile already detects, installs and updates both CLIs (`tooling.rs`, task
146 and 148-4) and shares their login with Settings › Accounts (148-2, 148-4,
148-10), so the CLI's own login is the account the person already sees.

# Scope

- A Rust-owned catalogue of fixed argument templates, like `console/catalogue.rs`.
  The renderer sends a shortcut ID and never a gh/glab argument. Candidate set,
  to be confirmed against each CLI's current docs:
  - `prs`: `gh pr list` / `glab mr list`
  - `mine`: `gh pr status` / `glab mr list --author=@me`
  - `issues`: `gh issue list` / `glab issue list`
  - `runs`: `gh run list -L 20` / `glab ci list`
  - `checks`: `gh pr checks` / `glab ci status` (current branch)
  - `repo`: `gh repo view` / `glab repo view`
- Provider-neutral names: the project's remote decides whether gh or glab runs,
  and `help` and the output show the exact command. A project with no
  supported remote, or with an ambiguous one, gets a plain explanation and no
  process.
- Run the resolved executable from `tooling.rs` with separate arguments, a
  bounded output/time budget and a non-interactive environment: no pager,
  no prompts, no colour, no update notifier, and the host pinned for company
  servers (`GH_HOST`, glab's equivalent). Strip terminal controls as the Git
  console does.
- Missing CLI, signed-out CLI and unreachable host each get their own message,
  pointing to Settings › Accounts or the tooling install, never raw stderr as
  the main error.
- Shortcut names follow the console's existing rename/remove/add rules and
  appear in `help`, completions and [docs/console-shortcuts.md](../../../docs/console-shortcuts.md).
- Added by the owner on 2026-10-07: the console welcome's environment section
  names the project's provider (GitHub, GitLab, Bitbucket, a company server, any
  other Git server, local-only, or several remotes).

# Out of scope

- Typed `gh …`/`glab …` lines, and any gh/glab command that writes (creating,
  merging, closing, commenting, rerunning). Those need a classifier and an ADR
  of their own.
- `api`, `extension`, `alias`, `auth`, `config`, `browse`, `--web` and anything
  else that opens a browser, runs a program or prints a secret: never part of
  the catalogue.
- Bitbucket: it has no official CLI; say so honestly in `help`.
- Injecting GitOdile-saved tokens into gh/glab. The CLI's own login is used.

# Acceptance criteria

- [x] Each shortcut runs only from a Rust template; a Rust test proves no
      renderer input reaches the argument vector.
- [x] GitHub, GitHub Enterprise Server, GitLab.com and GitLab Self-Managed
      remotes pick the right CLI and host (unit-tested; run live against
      github.com and gitlab.com only).
- [x] Missing CLI, signed-out CLI and unreachable host each produce a clear,
      translated message and no hang (a 30 s limit stops a host that does not
      answer).
- [x] Output is bounded, sanitized and readable (checked in the dark theme).
- [x] `help`, completions and shortcut docs list the new shortcuts with the
      exact commands.
- [x] The console welcome names the project's provider.
- [x] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/console/catalogue.rs`
- `src-tauri/src/tooling.rs`
- `src/features/console/`
- `docs/console-shortcuts.md`

# Dependencies

None beyond the completed account tasks of epic 148.

# Decisions

- 2026-10-06: shortcuts only, read-only, using the CLI's own login (owner).
- The CLI runs in the project folder, as `gh pr list` typed in a terminal
  there would, instead of naming the repository with `--repo`: `my-prs` and
  `checks` read the current branch, which only the folder gives. The host is
  still pinned (`GH_HOST`, `GITLAB_HOST`) to the one GitOdile detected.
- Inherited `GH_TOKEN`/`GITLAB_TOKEN` are left alone: they are how some people
  log these CLIs in, and the console should answer as their terminal does.
  Debug, forced-TTY, host and repository overrides are removed.
- gh runs with `GH_FORCE_TTY=100`, which gives its readable tables instead of
  tab-separated pipe output; colour, pager and prompts stay off.
- Built-in shortcut limit raised from 24 to 32 (26 built-ins now).

# Implementation notes

- `src-tauri/src/console/hosting.rs`: provider detection (`read_console_host`)
  and the hosting catalogue (`run_console_hosting_query`), with tests for
  remote choice, every remote URL form, public/company/other hosts, the
  templates, the renderer's command list and signed-out answers.
- `src-tauri/src/git.rs`: the bounded runner's core now takes any prepared
  command (`run_program`, `ProgramFailure`); Git keeps its exact errors.
- `sync::project_remotes` is now crate-visible so the console reads remotes
  through their owner.
- Renderer: `HOSTING_OPERATION_IDS`/`HOSTING_COMMANDS` in `domain.ts`,
  `runHosting`/`readHost` in the port, the welcome's provider row, the
  `Query` picker, help and the editor naming the CLI for the project.
- IPC contract: `read_console_host`, `run_console_hosting_query`.

# Validation

- Live, with a temporary test since removed: on this repository
  (github.com, gh 2.96.0) all six shortcuts answered; `checks` reported no pull
  request for the branch, as gh does. On a scratch repository with a gitlab.com
  remote (glab 1.120.0) all six answered.
- Browser harness (deleted afterwards): `prs` prints gh's table; the welcome
  shows "proveedor: GitLab Self-Managed · gitlab.corp.example"; `issues` on a
  Bitbucket project prints the explanation and runs nothing.
- `cargo test --lib console`: 52 passed. Vitest console and architecture: 26
  screen tests and the domain, docs and contract tests passed.
- `pnpm run check` (2026-10-07): exit 0. Docs 281 files / 199 task ids;
  architecture 565 modules; Vitest 130 files / 1278 tests; build; fmt;
  Clippy; Rust 573 passed, 1 ignored. The first run failed only because the
  IPC contract listed the two new commands in a different order from the
  execution inventory; fixed.
- Review before commit (2026-10-07): a company server reached over plain HTTP
  now needs its exact authority, as over HTTPS (only SSH and scp-like remotes
  match by host name); the hosting result stored in the transcript carries
  only output fields; `queryShape` no longer casts. Final `pnpm run check`:
  docs, architecture, Vitest 1278, build, fmt, Clippy and Rust 573 passed (the
  Rust step was rerun with `check:rust` after a running dev build had locked
  `gitodile.exe`).
- Not validated in the running Tauri app.
