---
id: 065-3
title: Create or initialize a local project
status: done
priority: high
type: feature
areas:
  - repository
  - frontend
  - rust
  - sync
created: 2026-08-18
completed: 2026-08-22
parent: "065"
---

# Goal

Let a user create a new local Git project or safely turn an existing ordinary
folder into one, then optionally connect it to a remote URL.

# User outcome

A user starting from an idea or an existing non-Git folder can enter the
GitOdile workflow without opening a terminal.

# Context

`open_repository` correctly rejects non-repositories. For `1.0.0`, that state
needs an explicit, previewed path to initialization rather than a generic
failure. This task is provider-neutral and does not create a hosted repository.

# Scope

- Add **Create new project** and contextual **Turn this folder into a project**
  entry points.
- Support creating one new named folder under a chosen parent and initializing
  an existing non-repository folder without modifying its current files.
- Let the user choose the initial branch name and optionally add a README;
  show identity requirements before any initial saved version is created.
- Detect nested repositories, linked worktrees, existing `.git` files/folders,
  case/alias collisions, non-empty destinations, permissions, and races in Rust.
- Plan and revalidate all filesystem/config changes. On failure, remove only
  empty artifacts created and ownership-marked by this attempt; never clean an
  existing folder.
- Optionally connect a validated fetch/push remote URL through a separate
  previewed action, preserving existing configuration and redacting secrets.
- Open successful projects through the existing session lifecycle and present
  the correct unborn/first-save/publish guidance.

# Out of scope

- Creating a repository on GitHub or another hosting provider.
- Downloading `.gitignore`/license templates from the network.
- Importing files, project generators, submodule setup, or Git LFS setup.

# Acceptance criteria

- [x] New-folder and existing-folder initialization work with spaces,
      non-ASCII, long paths, symlinks/aliases, and platform casing rules.
- [x] Existing files remain byte-for-byte unchanged and nested/existing Git
      metadata is never overwritten.
- [x] README/initial-version creation is explicit, hook/signing/identity aware,
      and leaves a truthful recoverable state on failure.
- [x] Remote connection validates the exact name/URL, preserves existing Git
      config, redacts credentials, and integrates with check/publish flows.
- [x] Every partial failure has exact cleanup ownership and cannot remove an
      existing directory or file.
- [x] Empty, non-empty, invalid, permission, stale, success, and first-save
      states are accessible and localized.
- [x] Temporary-directory integration tests and frontend journeys pass on the
      supported platforms, and `pnpm run check` passes.

# Relevant files

- `src/features/repository/`
- `src/features/overview/`
- `src-tauri/src/repository.rs`
- `src-tauri/src/tooling.rs`
- `src-tauri/src/sync.rs`

# Dependencies

- Task 065-1 baseline audit.
- Existing project/session, identity, save-version, and remote contracts.

# Decisions

- Initialization and hosted-repository creation are different outcomes; only
  local initialization belongs to `1.0.0`.
- Existing folders are never cleaned or populated implicitly.
- Remote connection is explicit and URL-based rather than provider-specific.
- Initialization is its own acquisition domain in `initialize.rs`. It does not
  weaken `open_repository`, overload cloning, or put filesystem policy in IPC.
- The local mutation and remote-configuration mutation have separate previews,
  state tokens, and execution steps. Adding a remote is deliberately offline;
  the existing check/publish flows own later network effects.
- The optional first saved version runs only after the verified project has
  opened and reuses the established save-version planner. Identity, hooks,
  signing, temporary-index protection, and signing/hook failures therefore keep
  their existing behavior instead of being reimplemented.
- Frontend attempt generations cover planning, execution, cleanup, opening,
  first save, and remote connection. A closed or superseded attempt cannot open
  a late session; if opening completed after supersession, the composition root
  closes that exact Rust session instead of dispatching it.

# Implementation notes

`plan_initialize_project` accepts one of two exact target shapes: an absent
named child under a parent, or an existing ordinary folder. It canonicalizes
the existing path/parent, applies Windows reserved-name and cross-platform name
rules, checks casing collisions by enumerating the parent, validates the initial
branch through `git check-ref-format --branch`, and records README existence,
identity readiness, nested-repository inspection, and the exact filesystem
snapshot in an opaque state token. The bounded descendant scan does not follow
symlinks and fails closed if it cannot complete. An enclosing repository,
descendant repository, `.git` file/directory, linked worktree, alias collision,
unusable path, or non-empty new destination blocks the plan.

`initialize_project` repeats the complete plan immediately before mutation and
requires the same state token. A new-folder attempt creates the exact absent
child with create-new semantics; an existing-folder attempt creates only its
absent `.git` directory. The attempt writes
`.gitodile-init-owner` containing its operation id before invoking system Git
with separate arguments. `git init --initial-branch <name>` is followed by root,
branch, worktree, and unborn-state verification. README creation is create-new
and only occurs when selected; its exact initial contents are `# Project` plus a
newline. Existing files and existing Git configuration are never opened for
write.

Cleanup requires the exact target kind, destination, operation id, directory
type, and ownership marker. It removes the marker and then only a directory
that is empty. A marker mismatch, symlink, extra file, populated `.git`, or
pre-existing directory makes cleanup unavailable and leaves the path for human
inspection. For existing-folder attempts the ordinary folder itself is never a
cleanup target. This intentionally leaves truthful partial Git state after a
post-`git init` failure rather than guessing which metadata is safe to erase.

Remote names are validated as Git config-section components. HTTPS, SSH, Git,
file, and scp-like URLs are accepted without provider assumptions. User-info,
query, and fragment data are removed before the preview, state token,
diagnostics, or `git remote add`; ambiguous scheme-like input is rejected. The
plan snapshots all current `remote.*` configuration, and execution revalidates
under the repository write coordinator before adding a new name and verifying
the stored fetch/push URL. It never fetches, changes an existing remote, sets an
upstream, or changes unrelated configuration.

The resulting repository opens through the normal project/session lifecycle.
An unborn branch shows the established first-save guidance; after an explicit
first save, normal invalidation refreshes the snapshot. A connected remote is
immediately discoverable by the existing check/publish surfaces, while publish
remains unavailable until a saved version exists.

# Validation

Hermetic Rust coverage uses temporary repositories and contains nine
cross-module initialization journeys plus module-level validation cases. It
covers new and existing folders, spaces and Unicode, a long Windows-safe path,
custom initial branches and unborn HEAD, byte-identical pre-existing files,
explicit README and real first commit, missing identity, rejecting hooks,
signing failure, `.git` files/directories, enclosing and descendant repositories,
linked worktrees, case collisions, between-plan-and-execute races, stale plans,
invalid names/URLs, remote redaction and config preservation, duplicate remotes,
permission classification, exact-marker cleanup, marker mismatch, and non-empty
cleanup refusal. Unix symlink aliases run under `cfg(unix)`; the Windows symlink
case runs when the host grants symlink privilege and otherwise skips without
weakening the alias/casing fixtures. macOS/Linux real-WebView evidence remains
the explicit 065-8 release gate.

Frontend coverage adds five localized, keyboard-driven dialog journeys and four
controller race tests, plus shell entry-point/session tests. It exercises the
new/existing entries, contextual recovery from `not_repository`, local versus
remote previews, secret-free copy, explicit README/first-save choices, identity
guidance, progress, focus trap/Escape, errors, success, and late resolved and
rejected responses. The 980 px responsive breakpoint is reachable at Tauri's
900 px minimum width; forced-colors, reduced-motion, light/dark tokens, and
English/Spanish strings share the existing shell conventions.

Windows desktop validation used the real Tauri window in both dark and light
themes. Keyboard focus and Escape were inspected, and a real project was
created under the user temp directory, opened through the session lifecycle,
shown on `main` with unborn/first-save guidance, then closed. The exact generated
fixture contained only its new `.git`; after confirming its canonical temp path
it was deleted, and no pre-existing project or user file was touched.

Focused results on 2026-08-22: `pnpm run check:frontend` passed architecture
analysis over 265 modules, TypeScript, 46 test files / 383 tests, and the Vite
production build. `cargo test
ipc::contract_tests::checked_contract_matches_registered_adapters_arguments_and_errors`
passed after the checked error inventory was updated. The first full Rust run
otherwise passed 270/271 tests and exposed only that inventory mismatch; the
corrected full and aggregate results are recorded below.

The final visual polish uses the same shared close-button primitive as the
Settings dialog. Field grids now allow their children to shrink within the
available column, and paired first-version fields align at the top instead of
stretching the title input to the textarea height. The corrected local and
remote sections were inspected in the real Windows Tauri window in the light
theme; the temporary QA window was closed and the original active project was
restored without creating a project or changing repository files.

Final aggregate result on 2026-08-22: `pnpm run check` passed documentation
validation over 117 Markdown files and 85 task IDs, frontend architecture
analysis over 266 modules, TypeScript, 46 test files / 383 tests, the Vite
production build over 1,981 modules, Rust formatting, Clippy, and 271 Rust
tests. The expected Git line-ending warnings emitted by hermetic Windows
fixtures did not represent failures.
