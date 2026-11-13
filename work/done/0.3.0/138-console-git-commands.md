---
id: 138
title: Type Git commands in the console, by permission tier
status: done
priority: normal
type: epic
areas:
  - rust
  - frontend
  - recovery
  - settings
  - accessibility
created: 2026-09-29
completed: 2026-09-29
---

# Goal

Let people type real Git commands in the project console — `git log --graph
-- src/`, `git show HEAD~2`, and with advanced mode on, `git commit -m …` or
`git switch -c try` — without turning the console into a system shell and
without weakening GitOdile's Git safety rules.

# User outcome

The console answers any read-only Git command the way a terminal would. Someone
who opts into advanced mode can also change the project from the console: every
change is previewed in plain language first, anything that can lose work keeps
a recovery point, and nothing runs a program, leaves the project or rewrites
history without the matching confirmation.

# Context

Task 134 shipped a console limited to eleven fixed read-only queries chosen by
operation ID. That closed catalogue kept the first release safe but feels
restrictive to anyone who opens a terminal. The user asked for arbitrary Git
commands and an "admin mode", off by default and behind a confirmation dialog.

[ADR 0017](../../../docs/adr/0017-console-git-commands-by-permission-tier.md)
records the design this epic implements: Rust tokenizes the typed line without
a shell, classifies it from a subcommand allowlist and per-subcommand deny
lists into Read, Local change, History change, Remote, Destructive or Never,
and every run goes through a plan Rust issued and can reject as stale. Only
Read runs by default; everything else needs advanced mode, which Rust holds as
a GitOdile-only setting. History and destructive plans create and verify a
recovery point before running.

# Children

1. [138-1](138-1-type-read-only-git-commands.md) — Type read-only
   Git commands (the parser, the classifier, the plan contract and the Read
   tier; no mutation is possible yet).
2. [138-2](138-2-advanced-mode-local-and-remote-changes.md) —
   Advanced mode and previewed local and remote changes.
Each child is shippable on its own and leaves the console safe: 138-1 adds no
mutation at all, and 138-2 refuses every History and Destructive command.

History and destructive commands, which need the recovery points of the
Recovery Center (task 065-5), were planned as a third child and moved out on
2026-09-29 to [task 139](../../0.6.0/139-console-history-and-destructive-commands.md).
This epic closes without them.

# Out of scope

- A system shell, a PTY, or interactive Git (editors, `add -p`, `rebase -i`,
  pagers, credential prompts).
- Git configuration writes, hook management, submodules, `git-lfs` and other
  external `git-*` programs.
- Replacing the guided workflows, which stay the default, simpler path.

# Acceptance criteria

- [x] Both children are done and their acceptance criteria hold.
- [x] ADR 0017 is accepted, or amended by a new ADR where implementation
      changed a decision.
- [x] The console's permission tiers are covered by the release qualification
      matrix of task 065-8 or its successor on every supported platform.

# Relevant files

- [ADR 0017](../../../docs/adr/0017-console-git-commands-by-permission-tier.md)
- [ADR 0007](../../../docs/adr/0007-store-discard-recovery-in-worktree-git-metadata.md)
- [ADR 0008](../../../docs/adr/0008-store-history-recovery-as-versioned-hidden-refs.md)
- [Task 134](134-project-git-console.md)
- `src-tauri/src/console/`, `src-tauri/src/git_command.rs`,
  `src-tauri/src/application.rs`, `src-tauri/src/recovery/`
- `src/features/console/`

# Dependencies

138-1 depends only on task 134. 138-2 depends on 138-1.

# Outcome

Closed on 2026-09-29 with both children done. ADR 0017 was accepted as
implemented, with section 5 and the History and Destructive tiers left to
[task 139](../../0.6.0/139-console-history-and-destructive-commands.md). The
release qualification of the console modes on every platform is not run here:
it is part of the console criterion of
[epic 065](../../1.0.0/065-release-1.0.md), which task 065-8
qualifies; the last criterion above is closed by handing it there.
