---
id: 151
title: Show where Git is installed and how it is set up
status: done
priority: normal
type: feature
areas:
  - frontend
  - settings
  - rust
created: 2026-10-07
completed: 2026-10-07
parent:
queue:
---

# Goal

Settings › Git says which Git GitOdile runs, not only whether it works: how
it was installed, where the executable lives, and, on request, the technical
facts other Git desktop clients show.

# User outcome

Someone with two Git installations (Git for Windows beside GitHub Desktop's
copy, or Apple's beside Homebrew's) sees at a glance which one GitOdile uses,
copies its path or shows it in Explorer/Finder, and opens "Technical details"
to find their configuration files, credential helper, Git LFS and editor.

# Context

The Git row reported only the version and a state chip. The owner asked for
more installation detail, like other visual Git clients, and reviewed a
mockup of variants before implementation. They chose:

- **Variant A** of the first mockup: two plain lines in the Git row (origin
  and path) and a "Technical details" disclosure, closed by default, as its
  own card under the row.
- **Option B** of the second mockup for the path actions: borderless copy and
  show-in-folder icons that surface on hover or focus, the same pattern as
  Overview's project path, with no glyphs in front of the lines, `Copy` and
  `FolderSearch` icons, and the platform's file-manager name.

This is a standalone feature, outside any epic.

# Scope

- `git_diagnostics` also reports where Git is: the first `git` on `PATH` and
  its distribution (Git for Windows for all users or just the current user,
  GitHub Desktop, Scoop, Homebrew, MacPorts, Apple's developer tools, the
  system package manager, or other). Read from the path alone, no process.
- A `git_installation_details` command for the disclosure: architecture
  (`version --build-options`), exec path, global and system config files
  (`git var`), credential helper, Git LFS version and Git's editor.
- A `reveal_git_location` command that shows the executable or a config file
  in the file manager. The renderer names a place; Rust finds the path again.
- The Git row's origin and path lines, the details card, copy with feedback,
  show in Explorer/Finder/folder, loading, failure and retry states, English
  and Spanish copy.

# Out of scope

- Opening config files in an editor. `.gitconfig` has no extension, so on
  Windows "open" brings up the "How do you want to open this?" dialog; show
  in the file manager instead.
- Choosing a different Git executable from Settings.
- "Open terminal here", offered in the mockup's menu option as an idea only.

# Acceptance criteria

- [x] With Git available, the row shows how it was installed and the
      executable path; with Git missing, unusable or unchecked, neither line
      nor the details card appears.
- [x] Copy and show-in-folder are borderless, appear on hover or keyboard
      focus of their line, and stay visible on touch screens.
- [x] Show-in-folder is named after the platform: Explorer, Finder, or
      folder.
- [x] "Technical details" runs no Git process until it is opened; a recheck
      discards what it read.
- [x] A failed read offers "Try again"; a failed copy or reveal says so in
      place.
- [x] A custom credential helper is reported as "a custom helper", never by
      its value.
- [x] The renderer cannot ask Rust to reveal an arbitrary path.
- [x] Rust parser/classifier tests and panel tests cover these cases.
- [x] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/tooling.rs`, `desktop.rs`, `ipc.rs`, `lib.rs`,
  `application.rs`
- `docs/architecture/025-ipc-contract.json`,
  `src/architecture/ipcContract.test.ts`
- `src/features/settings/GitInstallationFacts.tsx` (new), `SettingsPanel.tsx`,
  `domain.ts`, `port.ts`, `tauriAdapter.ts`, `translations.ts`,
  `settings.css`, `SettingsPanel.test.tsx`, `useGitTooling.test.ts`
- `src/shared/ui/toolInstallationRow.tsx`, `primitives.css`
- `README.md`, `DESIGN.md`

# Dependencies

None.

# Decisions

- 2026-10-07: the location rides on `git_diagnostics` because finding it
  costs no process. The details need about seven Git processes, so they have
  their own command, called only when the disclosure opens (explicit user
  action, per the "never fetch because a screen became visible" rule).
- 2026-10-07: the executable is the first `git` on `PATH`, which is what
  `Command::new("git")` starts: GitOdile never changes the child's `PATH`.
- 2026-10-07: reveal, not open, for config files (see Out of scope).
- 2026-10-07: only known credential helpers are named. A custom
  `credential.helper` can be a shell snippet with a token inline.
- 2026-10-07 (owner): option B for the path actions, matching Overview's
  project path instead of bordered square buttons, and no glyph in front of
  the two lines (the folder glyph read as a second, inert reveal button).
- 2026-10-07 (review): with both the XDG file and `~/.gitconfig` present,
  report `~/.gitconfig`, the one `git config --global` writes.
- 2026-10-07 (review): the path's accessible name moved from hidden text
  inside the value to the group's `aria-label`, so selecting the path by hand
  copies the path alone.

# Implementation notes

- `classify_git_location` is pure and per-platform: Windows classifies the
  path as found; macOS and Linux follow symlinks first, so Homebrew's
  `/opt/homebrew/bin/git` resolves into its Cellar.
- `GitDiagnostics.location` is skipped when absent, so the GitHub and GitLab
  CLI diagnostics serialize as before.
- `global_config_fact` takes the last existing file from
  `git var GIT_CONFIG_GLOBAL` (Git 2.42+), else the last listed; older Gits
  get no row.
- `editor_name` keeps only the program from `GIT_EDITOR`, maps common editors
  to their names and treats `true`/`:` as no editor.
- `ToolInstallationRow` gained a `facts` slot under the name line; with it,
  the tile and actions align to the first line.
- `desktop::reveal_in_file_manager` is shared by `reveal_project_file` and
  `reveal_git_location`.

# Validation

- Two mockups reviewed by the owner before implementation; the first was
  served from the repository with the app's real CSS, the second published
  as an artifact.
- Real-machine probe (temporary test, removed): Git 2.55.0.windows.3 reported
  `git_for_windows`/`all_users`, x86_64, GCM, LFS 3.7.1 and the expected
  config paths.
- Visual check in a throwaway browser harness (deleted): light and dark
  themes, missing Git, failed reveal, details open, and hover-revealed
  actions at rest and on hover. The owner confirmed it in the running app.
- `pnpm run check` (2026-10-07): docs 283 Markdown files / 201 task ids;
  frontend architecture 567 modules; Vitest 130 files / 1287 tests passed;
  Vite build; `cargo fmt`, Clippy (`-D warnings`) and Rust tests (578
  passed, 1 ignored) all passed.
