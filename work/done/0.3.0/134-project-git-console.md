---
id: 134
title: Add a project-scoped Git console for safe read-only shortcuts
status: done
priority: normal
type: feature
areas:
  - frontend
  - rust
  - navigation
  - accessibility
created: 2026-09-27
completed: 2026-09-27
parent:
queue:
---

# Goal

Ship a first, usable Git console before `1.0.0`: type a short name such as
`stat`, see the exact permitted Git command it represents, and read its result
inside the open project. Expand the catalogue in later versions without turning
this first release into an unrestricted system terminal.

# User outcome

Someone can inspect their current project from a keyboard-first console that
looks and behaves like part of GitOdile. They can rename or add shortcuts to a
small set of supported Git queries. They always know which project and Git
command a shortcut will use, and a mistake in the input cannot execute an
arbitrary program or mutate repository history.

# Context

The user requested a pre-1.0 screen that resembles a themed console but only
operates on the current project. They chose customizable shortcuts for Git
commands (for example, `stat` for `git status`), starting with read-only
operations and iterating later. They approved a direction in which the console
is the main work area, using the existing Branches screen's shell and visual
language. The [screen concept](../../assets/134-git-console/console-screen-concept.png)
is a layout reference, not a literal transcript or implementation spec.

The Rust application already has session authorization, an execution-policy
inventory, repository read coordination and a bounded system-Git runner. The
console should enter that path through a narrow, typed feature command rather
than exposing a system shell or Tauri's general process permission.

# Scope

- Add a project-only **Console / Consola** destination to the normal screen
  registry and command palette. The current project is visible within the
  screen; closing or switching it cannot leave a stale prompt attached to the
  previous session.
- Use one dominant, opaque, rounded console panel that follows the current
  GitOdile theme. Its output area, prompt and quiet shortcut/clear controls
  follow the approved concept. Do not add a dashboard, side panel or secondary
  card to fill the screen.
- Accept one shortcut name per submission. Show the shortcut and the exact Git
  command selected before its bounded output. Support Enter to run, Up/Down to
  recall this session's input, and accessible keyboard operation of every
  control. `help` lists supported shortcuts; unknown names explain how to see
  them without invoking Git.
- Initial read-only catalogue: project status (`git status`), unstaged changes
  (`git diff`), a bounded recent log (`git log`), and local branch listing
  (`git branch --list`). Each has a fixed, reviewed argument template; no
  arbitrary flags, paths, pipes, chaining, Git aliases or shell syntax are
  accepted. The exact safe flags and output limits are fixed in Rust tests.
- Provide built-in short names, including `stat`. Let users add, rename and
  remove shortcut names for catalogue entries. Store the mapping as a
  GitOdile preference, shared across projects; never write to Git config.
  Reserve built-in control words such as `help`, reject duplicate/invalid
  names, and allow restoring the defaults.
- React owns input, suggestions, display and session-only transcript. Rust
  authoritatively validates the selected catalogue operation, session epoch
  and current repository; constructs separate Git arguments and returns
  structured result metadata plus bounded text. The frontend cannot supply a
  command line to execute. Display stdout/stderr as inert text, without HTML
  interpretation or uncontrolled terminal escape sequences.
- Reuse the existing execution policy, cancellation, output caps, timeout,
  diagnostics and repository coordination. A failed or truncated command says
  what happened. Running a query must not trigger a remote network operation.
- Keep the transcript local and in memory for the current project session.
  Clear view affects only that transcript; project changes evict it. No
  background execution, polling or fetch occurs when the screen becomes
  visible. After a query, other screens remain able to refresh from the usual
  repository invalidation path if Git changed observable metadata.
- Provide English and Spanish copy; support light/dark themes, narrow windows,
  focus visibility, reduced motion, screen-reader output, and empty/running/
  success/error/truncated states.
- Update `DESIGN.md`, `docs/ARCHITECTURE.md`, `README.md` and the IPC contract
  where the delivered behavior makes their current descriptions incomplete.

# Out of scope

- CMD, PowerShell, Bash, zsh, a PTY, xterm.js, and arbitrary Git or system
  command execution.
- Repository-changing, history-changing, remote-changing and destructive
  commands. They need their own previews and recovery rules in later tasks.
- Interactive prompts, pagers, editors, hooks, remote credentials or terminal
  programs inside the console.
- A persistent command transcript or syncing shortcuts between devices.
- Treating the console as a substitute for the guided 1.0 workflows.

# Acceptance criteria

- [x] The registered Console screen follows project guards and hidden-screen
      lifecycle rules; the console takes the main workspace and retains the
      current shell, rail and status bar in both themes.
- [x] `stat` on an open temporary repository visibly resolves to `git status`
      and shows a correct, bounded result. The other three catalogue queries
      return only their reviewed read-only results.
- [x] Custom shortcut names persist across app restarts and projects, can be
      edited or reset, and cannot change a catalogue entry's fixed arguments.
- [x] Unknown, malformed, chained and shell-like input, stale sessions and
      invalid operation IDs are rejected before any process starts. Git's own
      configured aliases cannot widen the permitted catalogue.
- [x] Output and errors remain readable and safe when large, non-UTF-8,
      control-character-bearing, empty, cancelled or timed out. No output is
      executed or treated as markup.
- [x] A project switch or close isolates the transcript and any in-flight
      result. Opening the screen does not start a Git operation.
- [x] Tests cover shortcut parsing/storage, Rust operation validation, the
      read-only Git commands against temporary repositories, IPC/session
      boundaries, and keyboard and empty/error/loading UI states.
- [x] The actual Tauri app is exercised on Windows for the command, shortcut
      editing, project switch, empty/error and light/dark flows; platform
      differences are recorded for Linux/macOS release validation.
- [x] `pnpm run check` passes.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/architecture/frontend-feature-guide.md`
- [Screen registry](../../../src/app/screens.tsx)
- [Execution policy](../../../src-tauri/src/application.rs)
- [Git facade](../../../src-tauri/src/git_command.rs)
- [Bounded runner](../../../src-tauri/src/git.rs)
- [Screen concept](../../assets/134-git-console/console-screen-concept.png)

# Dependencies

The existing project-session, screen-registry, Git runner and execution-policy
contracts. Complete before [065-8 release hardening](../../0.7.0/065-8-release-hardening.md),
so the console enters the supported-platform qualification matrix.

# Decisions and assumptions

- User direction (2026-09-27): ship a simple, operational console before 1.0,
  then iterate; shortcuts are for Git only, with `stat` as the example.
- User direction (2026-09-27): the terminal surface is visually dominant and
  inherits the current GitOdile shell, as in the approved concept.
- First-version assumption for review: shortcut *names* are customizable,
  while their targets are fixed read-only catalogue entries. Names are a
  GitOdile-wide preference; execution and transcript remain project-scoped.
- The frontend may resolve a typed shortcut for immediate feedback; Rust is
  authoritative about the operation, Git arguments and repository access.
- User direction (2026-09-27): after the first usable version, restyle it as a
  modern block terminal modelled on Warp — slim column header, one card per
  query with state, time and copy/run-again, output tones for the fixed
  queries' known shapes, a context row and ghost completion in the prompt,
  a grouped `help` table and shortcut chips in the empty state. The surface
  keeps following the app theme. Cancelling a running query from the keyboard
  is not offered: there is no cancel command for console queries, and they are
  already bounded by the runner's timeout.
- User direction (2026-09-27): go further to a pure terminal ("style C" of
  the reviewed prototype) rather than stopping at the block-card version:
  no screen header, a repeated powerline prompt, the input as the last line
  of the transcript and a multiplexer-style status line. Its welcome is a
  fetch-style summary beside the small head mark. `scripts/icons/mascot.mjs`
  samples the head into `src/features/console/mascotPixels.ts`, so
  `check:icons` fails if the icon changes and the console grid does not.
- User direction (2026-09-27): on the Console screen only, hide the app
  status bar and carry its facts in the console's own status line, so the
  terminal is one uninterrupted surface. The prompt focuses on arrival.
- User direction (2026-09-28): drop the card around the console (variant B of
  the reviewed surfaces). The terminal sits on the app background and its
  status line takes the app status bar's place and size.
- User direction (2026-09-28): grow the read-only catalogue to eleven queries
  (staged diff, graph, latest version, tags, remotes, stashes and authors
  join the first four), make `look` the default status name instead of `stat`,
  and add Settings › Console for suggestions, the welcome, cursor blink and
  text size. Stored name lists record the catalogue they were written against,
  so a later release's queries reach people who had customised their names.
  An unrestricted "all Git commands" mode was requested and deliberately left
  for a separate, reviewed task: it conflicts with the Git safety rules in
  AGENTS.md unless each mutating command gets its own preview and recovery.
- User direction (2026-09-28): the welcome's summary follows Omarchy's
  fastfetch (framed "project" and "environment" groups with icons, then the
  theme palette), and the prompt follows Starship: a coloured context line
  above a bare `❯` instead of a filled powerline capsule.

# Validation

- `pnpm run check`: documentation, architecture, TypeScript, 1,024 frontend
  tests, production build, Rust formatting, Clippy and Rust tests passed.
- Windows Tauri development app: exercised `stat` on the open GitOdile project;
  verified the exact command and result. On a clean local project, `diff`
  displayed the no-output state. Unknown shell-like input did not invoke Git.
  Added `look` as a status shortcut and verified persistence after an app
  restart. Switching projects removed the previous transcript. Checked the
  empty screen and both light and dark themes.
- Temporary Git repository tests cover all four fixed queries, large truncated
  diff, non-UTF-8 and control text, an empty branch list and a failed log.
  Frontend tests cover running, unknown input, rejection, error, help, editing,
  reset, keyboard recall and stale results. Runner tests cover cancellation and
  timeout codes.
- Linux and macOS desktop behavior still belongs to release qualification;
  their window sizing, fonts and system-Git variants were not exercised here.
