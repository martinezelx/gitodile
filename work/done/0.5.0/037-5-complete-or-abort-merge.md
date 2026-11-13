---
id: 037-5
title: Complete or abort a conflicted merge safely
status: done
priority: high
type: feature
areas:
  - conflicts
  - rust
  - frontend
  - recovery
created: 2026-08-18
completed: 2026-10-29
parent: "037"
queue:
---

# Goal

Add explicit, independently planned merge completion and abort workflows with
fresh validation, recovery, hooks/signing, and uncertain-outcome handling.

# User outcome

After resolving files, the user can finish the merge or deliberately abandon it
without losing resolved work or relying on a terminal.

# Context

Leaving the workspace is never completion or abort. This slice closes the merge
lifecycle established by 037-1, 037-3 and 037-6. Until the recovery center
ships in `0.6.0`, the finish and abort plans themselves name the recovery
evidence and how to use it.

# Scope

- Enable completion only after Rust observes no unmerged entries and all session
  evidence is fresh; preview the merge saved version and local history effect.
- Run normal hooks/signing/identity behavior, verify the commit/ref/index/
  worktree result, and preserve resolved work on failure.
- Plan abort separately, explain limits for externally started dirty merges,
  use verified GitOdile snapshots where available, and require confirmation.
- Handle retry, stale, lock, hook/signing, missing identity, external mutation,
  restart, interruption, partial, and uncertain outcomes without auto-repair.
- Return success to the initiating workflow without publishing automatically.

# Out of scope

- Starting merges, publishing results, or continue/abort semantics for rebase,
  cherry-pick, revert, and stash apply.

# Acceptance criteria

- [x] Completion cannot run with any unmerged entry or stale session state.
- [x] Successful completion creates/verifies the intended merge saved version,
      runs hooks/signing, refreshes once, and never publishes.
- [x] Failed hooks/signing/identity preserve staged resolutions and support retry.
- [x] Abort preview distinguishes exact GitOdile recovery from best-effort
      external merge behavior and never promises unsupported restoration.
- [x] Partial/uncertain completion or abort retains snapshots and observed state.
- [x] Complete/retry/abort/restart journeys pass Rust/frontend/desktop tests
      (desktop on Windows only; macOS and Linux go to the 037-7 audit).

# Relevant files

- [Epic 037](037-guided-conflict-resolution.md)
- [037-6](037-6-resolve-files.md)
- `src-tauri/src/save_version.rs`
- `src-tauri/src/recovery/`

# Dependencies

Tasks 037-1, 037-3 and 037-6.

# Decisions

Completion, abort, leave, save, and mark-resolved remain five distinct actions.

- 2026-10-29 (user): the exact return is built and tested as a contract now,
  though only task 065-4 will start merges whose origin is `gitodile`.
- 2026-10-29 (user): finishing passes `--no-verify` only when hooks are off in
  Settings; it offers no "skip hooks just this once" as Save version does.
- 2026-10-29 (user): a finished merge offers Publish as the next step, as Save
  version does, and never publishes on its own.

# Implementation notes

Record planner tokens, Git commands, message behavior, hook/signing integration,
return routing, and failure classification.

2026-10-29:

- **Modules.** `src-tauri/src/conflicts/merge.rs` (plans, execution,
  observation and the outcome classifiers); `stage_entries` and
  `fresh_session` moved up into `conflicts/mod.rs`, shared with `resolve.rs`.
  `recovery/conflict.rs` gained the `abandon` journal action,
  `record_conflict_abandon` and the journal's `abandonedIndex` tree, trimmed
  with its record. ADR 0041 §9 records the contract and corrects §7's hook
  list (`git commit` runs `pre-commit`, not `pre-merge-commit`).
- **IPC.** `plan_finish_merge(path)` and `plan_abort_merge(path)` are reads;
  `finish_merge(path, title, description?, stateToken, runHooks)` is a history
  mutation and `abort_merge(path, stateToken)` destructive, both
  `repository_write`. New error codes `merge_abort_refused` and
  `merge_outcome_uncertain`, English and Spanish copy, IPC contract.
- **Tokens.** Finish: session token, `HEAD` and `diff-index --cached --raw -z
  --no-renames HEAD`. Abort: the same plus `diff-files --name-only -z`, since
  abandoning touches the working tree. A mismatch is
  `stale_conflict_session`, which the dialogs answer by re-reading the plan.
- **Git commands.** Finish: `git commit [--no-verify] -m <message>`, message
  from `MERGE_MSG` without comment lines (title and details editable). Failure
  classification is Save version's `classify_commit_failure` (signing, hook
  only when hooks ran, otherwise generic); its hook probe also looks for
  `prepare-commit-msg` now. Abort: snapshot if missing, `update-index
  --index-info` and `write-tree` on a copy of the index, the journal, then
  `update-index -q --refresh` and `git merge --abort`.
- **Return routing.** The header of the overlapping-changes screen opens the
  dialogs in the `resolve` mutation slot; the controller's `end` publishes a
  null session (nothing paused) and supersedes older reads, and the slot's
  one coordinated refresh follows. Finish's result offers Publish and Done,
  both returning to the screen the reader came from; Stop shows a toast and
  returns.
- **Restart.** The working-tree status gained `pausedOperation` (Git's
  markers, no process). The conflicts controller reads the session when it is
  set, and Overview's overlap step stays ("Combining is paused") once every
  file is resolved, so a merge left ready to finish is still found after a
  restart rather than offered as "Save your changes".
- **Found while testing:** `git merge --abort` refused every file Mark
  resolved had staged through `update-index --index-info`, whose entries carry
  no file times ("not uptodate"). The refresh before the abort fixes it; the
  same entries are harmless to `git commit`.

# Validation

Record merge fixtures, hook/signing/identity and interruption injection,
restart/desktop journeys, and focused command output.

2026-10-29, Windows 11:

- `cargo test --lib conflict`: 32 passed, among them
  `a_merge_is_finished_only_when_resolved_and_failures_keep_the_resolutions`
  (about 7 s alone, commented: unresolved, missing identity, stale token, a
  rejecting `commit-msg` hook, a signing failure with hooks off, then a hook
  that passes), `an_external_merge_is_abandoned_only_after_its_resolutions_are_kept`
  (about 4.5 s: stale token, Git's refusal over an edited clean file, then the
  abort, the journal copy and the abandoned tree) and
  `a_merge_gitodile_recorded_promises_and_proves_an_exact_return`, plus unit
  tests for `MERGE_MSG`, the `diff-index` parser and both outcome classifiers.
- `pnpm vitest run src/features/conflicts src/features/overview`: the Finish
  and Stop dialogs (plan, hook output, retry, refusal and re-plan, result and
  return without publishing), the header's actions, the controller's `end`,
  `sessionActions` and the paused Overview step.
- Running app (`tauri dev`, WebView2 remote debugging) on three real merges
  made in a terminal, each with two overlapping files, a cleanly merged file
  and an unsaved edit the merge never touches:
  - light, English: header with Finish disabled while files overlapped; kept
    “main” in both and marked them; after a reload Overview said "Combining
    is paused" (it said "Save your 2 changes" before the `pausedOperation`
    fix); finished: a commit with both parents, no `MERGE_HEAD`, the unsaved
    edit intact; Done returned to Overview.
  - dark, Spanish: a `commit-msg` hook that demands a ticket refused; its
    output showed in the banner, `MERGE_HEAD` and both staged resolutions
    stayed; with the name edited to carry the ticket the retry finished.
  - dark English, then light Spanish: Stop combining on the externally
    started merge with one file kept and marked and one edited by hand: the
    best-effort banner, then the abort: `HEAD` unchanged, no `MERGE_HEAD`,
    the unsaved edit intact, the toast, back to Overview; the hand edit was in
    `journal/files/` and the kept side in the `-abandoned` tree.
  - The pass changed the fact "1 changed file, 2 of them resolved by you" (a
    kept current side changes nothing) into two sentences, and gave the hooks
    fact its own glyph.
- Not run: macOS and Linux; a real signing key (the failure was injected
  with a missing `gpg.program`); a forced close in the middle of a commit or
  abort.

# Review

2026-10-29, a code review before closing found and fixed:

- Unsaved files were listed with `git diff-files`, which takes an entry with
  stale file times for an edit; every file Mark resolved stages through
  `--index-info` has none. The plans now use `git diff --name-only`, which
  compares content and, with `GIT_OPTIONAL_LOCKS=0`, writes nothing.
- A resolved file edited again after it was marked was left out of the saved
  version without a word. The finish plan counts such files
  (`editedAfterResolving`) and the dialog says so in a `warning` banner.
- An uncertain outcome ran no refresh; it now runs the coordinated one, so
  the screen shows what Git left.
- An abandon Git refused and then tried again copied the same bytes into the
  journal twice; an entry now reuses a copy the journal already holds.
- Stop combining said "The 0 overlapping files go back" for a merge whose
  files were all resolved elsewhere; it now says the merge's changes are
  undone.

After the review: `cargo test --lib conflict_tests` 9 passed (the new
assertions fail on the old code), `pnpm vitest run src/features/conflicts`
50 passed, Clippy clean, and `pnpm run check` exit 0.
