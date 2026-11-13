---
id: 069
title: Make Settings cheap to open
status: done
priority: normal
type: chore
areas:
  - frontend
  - backend
  - performance
created: 2026-08-23
completed: 2026-08-23
parent:
---

# Goal

Cut what opening the Settings dialog costs, in Git processes and in render
work, so the panel shows real values on its first frame every time.

# User outcome

Settings opens with the Git identity and the line-ending answer already filled
in, instead of resolving them while the user watches. Typing a name stops
rebuilding the whole panel on every keystroke.

# Context

Measured on Windows before any change. A `git config` process costs **53–60 ms**
on this machine; the IPC handlers are `#[tauri::command(async)]`, so the two
Settings reads overlap on the worker pool, but the processes *inside* each one
run in sequence.

| Action | Git processes | Wall cost |
| --- | --- | --- |
| Startup | 1 (`git --version`) | ~55 ms, off the critical path |
| Open Settings, no project | 4 | ~110 ms |
| Open Settings, project open | 6 | ~220 ms |
| Save identity | 2 | ~110 ms |
| Pick a line ending | 5 (1 write + a 4-process re-read) | ~275 ms |

Two separate problems produce that.

**The reads are not batched.** `read_line_endings` runs `git config --global
--get core.autocrlf` and `--get core.eol` as two processes, and two more inside
the project. `get_git_identity` runs two more. Every one of them pays a fresh
process spawn to read a file Git has already opened.

**Nothing is prefetched or kept.** `useGitTooling` already reads
`git_diagnostics` once after first paint, which is why the Git version is
simply there when the panel opens. Identity and line endings are the only two
Settings reads that do not follow that pattern: they live in effects inside
`SettingsPanel`, which the shell unmounts on every close, so each open starts
from zero.

Separately, the panel rebuilds its whole tree on every keystroke in the
identity field — **4.5–9 ms per keystroke**, measured. `SECTION_ICONS` builds
five icon elements per render and `sections` remaps them, though both are
static apart from the translation table.

One worst case is being recorded rather than fixed. `get_line_endings` is
declared `read(...)`, so it takes a repository read permit; opening Settings
while a save, publish or sync holds the write permit makes that read wait for
the write to finish. It is rare, and changing the concurrency policy carries
more risk than the case is worth right now.

# Scope

- Batch the global config reads into one `git config --global --get-regexp`
  call per command, NUL-delimited so a value containing a newline cannot be
  misparsed.
- Batch the project-scoped line-ending reads the same way.
- Keep `GIT_CONFIG_GLOBAL` override support, which the Rust tests rely on.
- Add app-level hooks that read the identity and the line endings once after
  first paint and keep the values across openings, beside `useGitTooling`.
- Pass both into `SettingsPanel` as props; the panel keeps the identity draft,
  the notices and the close guard, which are UI state.
- Re-read the line endings after a write, as today, but at the new cost.
- Hoist the static rail icons to module scope and memoize the derived lists.
- Memoize the section rail so typing does not rebuild it. (Scoped originally
  as splitting the identity fields out; see Decisions for why that is wrong.)
- Record the repository-permit worst case in the backlog.

# Out of scope

- Changing what any of these settings mean, or the wording of the panel.
- The `--show-origin` single-process variant. It would fold the system config
  into the answer and needs the global config file identified by path; in
  line endings, correctness is worth more than one process.
- Merging identity and line endings into one IPC command. Identity is global
  and line endings are repository-scoped; merging them would drag identity
  under the repository permit described above.
- The concurrency policy of `get_line_endings`.
- Any other screen's reads.

# Acceptance criteria

- [x] `get_git_identity` runs one Git process instead of two.
- [x] `get_line_endings` runs one process with no project open, and two with
      one open, instead of two and four.
- [x] A config value containing spaces, non-ASCII characters or a newline is
      read back unchanged.
- [x] A key that is absent still reports absent, and a multi-valued key still
      resolves to the value Git itself would return.
- [x] Identity and line endings are read once after first paint and survive
      closing and reopening the dialog, with no re-read on open.
- [x] The panel renders both values on its first frame after the initial read.
- [x] Saving an identity and picking a line ending still update what the panel
      shows, including when the open project overrides the global value.
- [x] Typing in the identity field no longer re-renders the section rail.
- [x] The repository-permit worst case is recorded in the backlog.
- [x] Full `pnpm run check` passes.

# Relevant files

- `src-tauri/src/tooling.rs`
- `src/features/settings/useGitTooling.ts`
- `src/features/settings/SettingsPanel.tsx`
- `src/features/settings/index.ts`
- `src/app/AppOverlays.tsx`
- `src/main.tsx`
- `work/backlog.md`

# Dependencies

None. Independent of tasks 066–068.

# Decisions

- Batched with `--get-regexp` and `-z` rather than `--show-origin`. The
  origin variant could have answered everything in one process, but it folds
  the system config into what "global" means and needs the global config file
  identified by path. In line endings a wrong answer is worse than an extra
  55 ms.
- Identity and line endings stay two IPC commands. Merging them would have
  saved a round trip, but identity is global while line endings are
  repository-scoped: one command would drag the identity read under the
  repository permit, which is exactly the worst case recorded in the backlog.
- The identity draft stays in `SettingsPanel`. Extracting the fields into
  their own component was the plan, and it is wrong: the draft has to survive
  switching sections, and the close guard reads it from whichever section the
  user is on. A component mounted only on the Git section would lose both.
  The **section rail** is memoized instead — it is the part of the tree that a
  keystroke genuinely has no business rebuilding.
- The draft is seeded by adjusting state during render rather than in an
  effect, so the fields never paint empty and then fill in on the first open of
  a cold session.
- Implemented out of queue order at the user's explicit request.

# Implementation notes

**Rust.** `read_global_git_config(key)` became
`read_global_git_config_many(keys)`, and `read_project_git_config(key)` became
the same shape, both running one `git config -z --get-regexp` built by
`config_pattern`. `-z` rather than the default branch format because entries are
then separated by NUL and the key from its value by a newline, so a config
value that *contains* a newline cannot be read as the next entry — the failure
the line format would have had. `config_pattern` escapes the `.` in each key,
without which `user.name` would also match `usersname`.

`parse_config_entries` lets later entries overwrite earlier ones, which is
Git's own precedence: with a key set more than once the last wins, and that is
what `--get` returned before. An entry with no newline is a valueless key and
reads as absent, again matching `--get`.

`--get-regexp` exits non-zero when nothing matches. That is an answer, not a
failure, so both readers return an empty map either way rather than
distinguishing them.

**Frontend.** `useGitConfig.ts` adds `useGitIdentity` and `useLineEndings`,
mounted in `main.tsx` beside `useGitTooling` — the hook that already reads the
Git diagnostics once after first paint, which is why the Git version was
simply *there* when the panel opened while these two were not. `useLineEndings`
takes the project path and epoch as separate values rather than the project
object, because the caller rebuilds that object on every render.

`SettingsPanel` lost both effects, the `project` prop and `EMPTY_IDENTITY`; it
takes the two states as props and keeps the draft, the notices and the close
guard, which genuinely belong to one opening. `SECTION_ICONS` moved to module
scope beside `THEME_ICONS`, and `sections`, `CODE_FONT_LABELS` and
`lineEndingText` are memoized on the translation table.

The panel test harness drives the real hooks rather than a stand-in, so the
existing tests still exercise the whole path from the controls down to the
port.

# Validation

`pnpm run check` — passed, exit code 0 (`check:docs` over 121 files and 89 task
ids, `check:architecture` over 280 modules, `typecheck`, `test` 400 passed /
49 files, `build`, `check:rust` 294 passed — four more than before, the new
config-parsing tests).

Measured with `git config` on Windows, quiet machine:

| | Before | After |
| --- | --- | --- |
| Identity | 2 processes, 84–92 ms | 1 process, 52–60 ms |
| Line endings, project open | 4 processes, 143–146 ms | 2 processes, 81–88 ms |

The two IPC commands run concurrently on Tauri's worker pool, so the wall cost
of opening Settings is the slower of the two: **~145 ms → ~85 ms**. Repeated
five times while a full `cargo` build competed for the machine, the same
comparison read ~600 ms against ~345 ms — the same ratio, and a larger
absolute saving exactly when the machine is busiest.

That is the cost of the *first* read. After it, opening Settings costs **no Git
processes at all**: the values are read once after first paint and kept above
the dialog. A test covers this directly — the panel is unmounted and remounted
and the port is asked for nothing, with the saved name asserted through
`getByDisplayValue` rather than `findByDisplayValue`, so a re-read that
resolved later would not pass.

Picking a line ending goes from 5 processes to 3 with a project open and from
3 to 2 without one, since the read-back it deliberately performs is now
batched.

Render cost, measured against the **production** build served from `dist`
(median of 10–15 runs, first warm-up run discarded):

- opening the dialog: **3.2 ms**
- closing it: **1.0 ms**
- one keystroke in the identity field: **0.7 ms** (range 0.4–0.9 ms)

This is where the review corrected itself. The 4.5–9 ms per keystroke that
motivated the render work was measured in the dev build, where React is
unminified and `React.StrictMode` renders everything twice; in production it
was already under a millisecond. **Memoizing the rail did not make typing
measurably faster, and is not claimed to.** It is kept because it is less work
and a clearer ownership boundary, not because it fixed a speed problem — the
Git processes were the whole of the delay.
