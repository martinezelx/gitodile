---
id: 065-2
title: Clone and open a remote project safely
status: done
priority: high
type: feature
areas:
  - repository
  - sync
  - frontend
  - rust
  - platform
created: 2026-08-18
completed: 2026-08-21
parent: "065"
---

# Goal

Add a provider-neutral clone flow that turns a remote URL or Git path into a
verified open GitOdile project without overwriting local content or leaving an
ambiguous partial project.

# User outcome

From the first-run and project-switcher surfaces, the user can paste a remote
location, choose a local parent/name, review the destination, clone, and begin
working in the opened project.

# Context

Opening existing local projects works; cloning is the largest missing entry
path. The system Git executable remains the backend. Authentication uses the
user's configured Git credential helpers for `1.0.0`; GitOdile must classify
failures and never log secrets.

# Scope

- Add clone entry points to the empty state, project switcher, command palette,
  and appropriate titlebar menu without creating a new permanent screen.
- Validate and normalize supported HTTPS, SSH, Git, file URL, and local path
  inputs in Rust; redact credentials, query strings, and fragments everywhere.
- Plan destination, branch/default behavior, local effects, network effects,
  credential expectations, and cancellation consequences before execution.
- Clone into a uniquely owned staging directory under the selected parent,
  verify repository identity and worktree usability, then publish it to the
  exact empty destination without overwriting an existing path.
- Provide bounded progress, cancellation, timeout, retry, offline, certificate,
  host-key, authentication, not-found, disk, permission, long-path, and partial
  cleanup states. Retain evidence and offer safe cleanup if the outcome is
  uncertain.
- Open the verified clone through the existing project/session lifecycle and
  remember the successful parent location without storing credentials.
- Cover shallow/submodule/LFS discovery truthfully: normal clone is supported;
  specialized controls and automatic dependency installation are not.

# Out of scope

- Browsing repositories from a provider account, forking, pull requests, or
  OAuth/device-flow login.
- Partial clone, sparse checkout, recursive submodule initialization, or LFS
  installation/configuration.
- Deleting an existing destination to make room.

# Acceptance criteria

- [x] Public HTTPS/SSH, authenticated-helper, file URL, and local-path clones
      either open a verified project or return a structured actionable error.
- [x] Existing/non-empty destinations, alias/case collisions, nested invalid
      destinations, and path races block without modifying user content.
- [x] Success exposes no staging directory and partial/cancelled/failed outcomes
      can clean only GitOdile-owned paths after exact-path verification.
- [x] Credentials and authenticated remote details never appear in UI-safe
      diagnostics, logs, state, recent projects, or IPC fixtures.
- [x] Progress and cancellation remain responsive; late responses cannot open a
      closed/replaced session.
- [x] Windows, macOS, and Linux path/process behaviors have integration coverage
      and actual desktop evidence is recorded where available.
- [x] English/Spanish copy, keyboard/focus/screen-reader behavior, both themes,
      narrow layouts, and every empty/loading/error/success state are complete.
- [x] IPC, execution policies, capabilities, docs, and tests are updated and
      `pnpm run check` passes.

# Relevant files

- `src/features/repository/`
- `src/projectSessions.ts`
- `src-tauri/src/repository.rs`
- `src-tauri/src/sync.rs`
- `src-tauri/src/git.rs`
- `src-tauri/src/application.rs`

# Dependencies

- Task 065-1 baseline audit.
- Existing task-012 project/session lifecycle and bounded Git runner.
- Task 065-7 later performs the release-wide credential matrix; this task must
  still ship truthful clone-specific classification and tests.

# Decisions

- Use system Git and configured credential helpers; provider login is deferred.
- Stage under the selected parent and publish only after verification so safe
  cleanup never targets an arbitrary user directory.
- Clone is a repository acquisition workflow, not a reusable shell-command UI.
- Treat clone as a `local-mutation` with a 20-minute bound, kill-process
  cancellation, `GIT_TERMINAL_PROMPT=0`, and no repository permit because no
  project identity/session exists before acquisition.
- Keep the overlay eager and feature-owned. Its visual component receives a
  controller; only `features/clone/tauriAdapter.ts` imports Tauri and names IPC.
- Use an operation generation in the frontend and an exact operation-id token
  in Rust. Closing, cancelling, or replacing an attempt invalidates the
  generation before requesting cancellation, so a late publish/result cannot
  open or replace a project session.
- Use the smallest applicable GitButler reference: bounded argv execution,
  non-interactive credentials, direct child termination, and safe diagnostics.
  No GitButler code, structure, workflow model, or product language was copied.

# Implementation notes

## Supported source grammar

- `https://host/path`, `ssh://[user@]host/path`, `git://host/path`, and
  `file://...` URLs; scheme matching is case-insensitive.
- scp-like SSH locations such as `git@host:path/repo.git` and
  `git@host:/absolute/path/repo.git`.
- absolute or relative local paths, canonicalized before planning.
- URL user-info is removed (SSH may retain a username), and query/fragment
  suffixes are removed before Git invocation, `origin` persistence, IPC-safe
  display, and diagnostics. Private HTTPS uses the configured Git credential
  helper; SSH uses the system agent/keys and existing host trust. No credential
  prompt is hosted or persisted by GitOdile.
- Project names reject separators, controls, `.`/`..`, the staging prefix,
  Windows device names, trailing dot/space, and names over 120 characters.
  Destination planning canonicalizes an existing parent, conservatively checks
  case-fold collisions on every platform, rejects local/file-URL nesting, and
  preflights reliable Windows path length.

## Staging and publish algorithm

1. Rust normalizes source/parent/name, proves the exact destination absent, and
   returns a preview plus a token over the normalized source and destination.
2. Execution revalidates the token and absence, then exclusively creates
   `<parent>/.gitodile-clone-<operation-id>` and an exact two-line
   `.gitodile-clone-owner` marker (`gitodile-clone-v1` plus operation id).
3. The bounded runner invokes `git clone --no-recurse-submodules --progress --
   <source> <staging>/project` as separate arguments. It then rewrites `origin`
   to the sanitized source.
4. Verification requires an exact canonical worktree root, successful
   `rev-parse`, and readable porcelain-v2 status. Bounded discovery reports
   `.gitmodules` and tracked `.gitattributes` LFS evidence without initializing
   submodules or installing/configuring LFS.
5. Rust rechecks destination absence and atomically publishes with an exclusive
   no-replace directory rename: `MoveFileExW` on Windows,
   `renameat2(RENAME_NOREPLACE)` on Linux, and `renamex_np(RENAME_EXCL)` on
   macOS. It verifies the final path again before returning it.
6. The composition root opens that verified path through the existing
   repository controller, session epoch, watcher, runtime, and activation flow.
   Only the successful local parent is stored in browser persistence.

## Progress, cancellation, retry, and cleanup

- A Tauri `Channel` carries bounded semantic phases: `preparing`, `cloning`,
  `sanitizingRemote`, `verifying`, `publishing`, and `finalizing`. The UI shows
  an indeterminate bar and phase list without inventing byte percentages.
- Cancellation kills the exact registered process tree where the runner can do
  so. Retry always replans and receives a new operation id/token. Timeout,
  offline, certificate, SSH host key, authentication, not-found, disk-full,
  permission, long-path, destination-race, uncertain-publish, and cleanup
  outcomes use stable structured error codes with English/Spanish remediation.
- Cleanup first recomputes the exact staging path and verifies directory/file
  types, staging name, and exact marker contents. It never targets the final
  destination or any unmarked path. If publication succeeded but the now-empty
  container cannot be removed, the dialog retains its path and blocks opening
  until safe cleanup succeeds; uncertain final verification retains the final
  destination as evidence and instructs the user not to clone over it.

# Validation

- Hermetic Rust fixtures create temporary Git sources/remotes and cover local
  success through the normal open lifecycle, file-URL clone with sanitized
  persisted `origin`, pre-start cancellation, exact progress order, stale plan,
  existing empty destination, publication race preserving user content,
  cleanup-marker refusal, duplicate operation-id cancellation, URL grammar,
  cross-platform names, secret redaction, and structured failure classes.
- The no-replace primitive has a platform-gated implementation and test on each
  target. Windows ran the native test and full desktop journey here; macOS and
  Linux paths compile/run in the existing OS CI matrix, while real WebView and
  process-tree runtime evidence remains the explicit 065-8 gate per ADR 0006.
- Frontend tests cover attempt replacement, exact cancellation, inert late
  success, preview/effects, verified-open handoff, local-only persistence, IPC
  contract, style ownership, entries, localization, and modal behavior. The
  final suite contains 371 frontend tests and 258 Rust tests.
- Windows desktop audit (2026-08-21, Tauri dev executable): opened clone from
  the project switcher; traversed source/parent/name and actions by keyboard;
  reviewed local/network/credential/cancel effects; cloned the current Git
  repository into an exact temporary parent; verified automatic activation of
  `verified-clone` with an everything-saved snapshot; checked dark and light
  rendering; closed its project session; and removed only the generated `%TEMP%`
  validation directory after exact-path/content checks. This audit found and
  fixed a changing focus-trap callback that had returned focus to the first
  field during input. Narrow layout, reduced motion, forced colors, and modal
  state variants are enforced in feature CSS and tests; the Windows automation
  helper did not expose a reliable resizable window border for a second narrow
  runtime capture.
- Focused results before the aggregate gate: `pnpm run typecheck` passed;
  production Vite build passed; 44 frontend files / 371 tests passed; clone Rust
  subset passed 10 / 10; `cargo check --all-targets --all-features` passed.
- Final aggregate gate: `pnpm run check` passed on 2026-08-21 (documentation,
  frontend architecture, TypeScript, 44 files / 371 tests, production build,
  Rust formatting, Clippy with warnings denied, and 258 Rust tests).
