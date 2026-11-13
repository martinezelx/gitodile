---
id: 039
title: Make a Git call without an execution policy fail instead of degrading
status: done
priority: high
type: chore
areas:
  - rust
  - architecture
  - security
created: 2026-08-10
completed: 2026-08-11
parent: "038"
---

# Goal

Remove the silent fallback that hands an unregistered Git call a repository-read
execution policy, so a missing command frame is a loud failure in production.

# User outcome

No visible change. This protects the guarantee every other safety behavior rests
on: that no Git process runs outside the coordinator that serializes related
worktrees and enforces caps, timeouts and prompt policy.

# Context

`run_git_with_env`, `run_global_git_with_env` and `run_git_capped` in
`src-tauri/src/lib.rs` each do:

```rust
let policy = application::current_policy()
    .unwrap_or_else(|| git::ExecutionPolicy::repository_read("compatibility_git_read"));
```

That `unwrap_or_else` was strangler scaffolding from task 024, when domain
workflows still lived in `lib.rs` and had not all been routed through
`application::enter` or `authorize_repository`. The migration is finished:
every production entry point now enters a frame, verified by reading all 31
`ipc::` adapters and the six `application::enter` call sites for global
commands.

The fallback is now a trap. A future Git call added without a frame does not
fail — it silently receives `ConcurrencyClass::RepositoryRead`, a 60-second
timeout and disabled prompts, and it never acquires a repository permit. It
would bypass the commonGitDir coordinator entirely, which is exactly the
boundary epic 022 existed to build.

This matters concretely. Task 031 fixed a defect where a nested authorized read
cancelled its peer and broke every repository. That bug was *visible* because
the cancellation surfaced as an error. A missing execution policy would not
surface at all until two worktrees corrupted each other's index.

**The fallback is not dead code.** 28 `run_git` calls inside `lib.rs`'s own test
module run outside any command frame — test assertions like reading `HEAD` or
`git ls-files` to verify what a workflow did. They currently work because of the
fallback. Deleting it without replacing that path breaks the Rust suite.

# Scope

- Add a test-only Git helper that enters an explicit policy frame, and move
  `lib.rs`'s test-side `run_git` assertion calls onto it. Keep it
  `#[cfg(test)]` so it cannot be reached from production.
- Replace the three `unwrap_or_else` fallbacks with a hard failure. Prefer a
  structured `AppError` over a panic so a mistake degrades to a reported error
  rather than a crashed command, and assert loudly in debug builds.
- Remove the `compatibility_git_read`, `compatibility_global_git` and
  `compatibility_capped_git_read` policy names.
- Add a test proving a Git call without a frame fails.
- Check `changes.rs`, `publish.rs`, `repository.rs`, `save_version.rs`,
  `status.rs` and `branches.rs` test modules for the same pattern; they
  hold 63 further `run_git` call sites between them, and some are inside
  workflows that do enter a frame.

# Out of scope

- Changing any execution policy's caps, timeouts, prompt policy or concurrency
  class.
- Moving the Git runner out of `lib.rs` into a `git/` directory. That is a
  separate structural decision and `architecture.rs` already keeps domain code
  out.

# Acceptance criteria

- [x] No production code path can start a Git process without an execution
      policy from the registered inventory.
- [x] A test proves the failure is reported rather than silently downgraded.
- [x] The three `compatibility_*` policy names no longer exist.
- [x] Test-side Git assertions run under an explicit test-only frame.
- [x] Full `AGENTS.md` validation passes, including every pre-existing Rust
      test (197 before this task, 199 after).

# Relevant files

- `src-tauri/src/lib.rs` (lines 62–130 and its test module)
- `src-tauri/src/application.rs`
- `src-tauri/src/git.rs`
- `docs/ARCHITECTURE.md`, "Rust execution and repository access boundary"

# Dependencies

None.

# Decisions

- Prefer a structured error to a panic: a wrong policy is a programming error,
  but crashing a user's session is worse than reporting a failed command.

# Implementation notes

## The change

`require_policy()` in `lib.rs` replaces the three `unwrap_or_else` fallbacks in
`run_git_with_env`, `run_global_git_with_env` and `run_git_capped`. It returns
the current frame's policy, or `debug_assert!`s and returns a structured
`GitCommandFailed` when there is none. No new error code was added: the IPC
contract pins the code list and `src/ipcContract.test.ts` asserts it, and
expanding a stable contract for a programming error that must never ship is the
wrong trade. Debug and test builds panic, which is the enforcement that matters
while developing; release degrades to a reported failure rather than crashing a
session mid-save.

Both branches are pinned by one test name compiled two ways —
`#[cfg(debug_assertions)]` with `#[should_panic]`, and `#[cfg(not(...))]`
asserting the error code. The release half was confirmed with
`cargo test --release`, since CI only runs debug.

## Finding the call sites empirically

Rather than reasoning about which paths lacked a frame, the assert was added
first and the suite run: 45 tests tripped it immediately. That was the right
order — it produced the list instead of a guess.

All 45 were test-side, and no production path was missing a frame. The three
categories:

- **Assertions reading repository state** (`git log -1`, `git ls-files`,
  `git show HEAD:file`) — 28 sites in `lib.rs` and 4 in `branches.rs`. They
  now call the crate-level `#[cfg(test)] test_git`, which enters an explicit
  test-only frame.
- **Internal helpers called directly** — `resolve_index_path`,
  `list_branch_names`, `read_global_git_config`, `set_git_identity_with_override`
  and the `*_selection_with_identity_override` functions. In production these
  are reached through a command that already authorized; a unit test calling one
  directly now wraps it in `in_test_frame(|| ...)`.
- **One real harness gap.** `plan_save_version_with_identity_override` did not
  authorize, while its production sibling `plan_save_version` does and its own
  sibling `save_version_with_identity_override` already did. A test-only variant
  that skips the boundary being tested is worth fixing on its own; it now
  authorizes like production.

`application::enter_test_frame` builds its policy directly rather than naming a
registered command, so `EXECUTION_INVENTORY` stays exactly the 31 real commands
and no test can pass under a policy the production path never uses.

## A trap worth recording

The first attempt rewrote `run_git(` to `test_git(` by line range, assuming
`mod tests` was the tail of each file. It is not: `changes.rs` and
`branches.rs` both continue with production code after their test module,
so the rewrite silently converted production Git calls. The compiler caught it,
but only because the helper is `#[cfg(test)]` — a rename between two functions
that both existed would have compiled and shipped. The corrected pass used each
module's actual test-module span.

## Desktop verification

This change touches every Git call in the product, so it was verified in the
real app rather than only under the test runner. A release build opened the
task-023 standard fixture and every Git-running command was invoked over real
IPC: `open_repository`, `read_working_tree_status`, `get_branches`,
`plan_save_version`, `discover_remotes`, `list_unpublished_versions`,
`read_working_tree_diffs`, `plan_create_branch`, `git_diagnostics`,
`get_git_identity`, `check_git_update` — all succeeded.

The task-021 warmed protocol still passes: first selected diff 384 ms, warm
switch p50 29.0 ms / p95 31.0 ms, 340 visible descendants on Changes, 0 Git
processes on warmed revisit, 0 console errors.

## Not done here

`watch_repository` authorizes; `unwatch_repository` and
`close_project_session` are `no_process` commands that start no Git, so none
needed a frame. Moving the Git runner out of `lib.rs` into a `git/` module
remains out of scope and unscheduled.

# Validation

```text
pnpm run check:frontend                      pass (241 tests, 28 files)
cargo fmt -- --check                         pass
cargo clippy --all-targets --all-features    pass (-D warnings)
cargo test --all-targets --all-features      pass (199 tests)
cargo test --release --lib <frameless test>  pass (release branch)
```

Release desktop run on Windows 11 with the task-023 standard fixture, driven by
`scripts/031-cdp-probe.cjs`; results above.
