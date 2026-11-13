---
id: 074
title: Allow safe team updates alongside separate local changes
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
  - testing
  - documentation
created: 2026-08-24
completed: 2026-08-24
parent:
---

# Goal

Let **Review and get** advance a strictly behind branch when prepared or
unsaved tracked changes are demonstrably separate from every incoming path,
without stashing, discarding, or silently altering local work.

# User outcome

People can receive unrelated team documentation or code while continuing
local work. A real path overlap still stops safely and explains the relevant
team-update problem instead of incorrectly referring to switching branches.

# Context

The original fast-forward implementation rejected every dirty tracked working
tree before inspecting incoming paths. That conservative first version kept
work safe, but blocked updates Git's two-tree `read-tree` operation can carry
without loss. It also reused the global `dirty_working_tree` translation, whose
remediation was written specifically for branch switching.

# Scope

- Parse ordinary, renamed, staged, and unstaged tracked paths from porcelain-v2
  status while retaining both sides of a rename.
- Compare tracked paths with the complete bounded incoming-path evidence.
- Run `git read-tree --dry-run -u -m <old> <target>` before offering a plan when
  tracked local work exists.
- Bind the exact tracked status and worktree-content fingerprint into the plan
  token, including regular-file bytes and symbolic-link targets.
- Verify after the update that the reviewed staged and unstaged state is still
  exact while incoming files and `HEAD` reached the reviewed commit.
- Keep conservative blocking when incoming evidence is truncated or a local
  path cannot be inspected safely.
- Add a dedicated incoming tracked-change collision error and truthful English
  and Spanish team-update copy.
- Update the IPC contract and durable architecture description.

# Safety contract

- The operation remains strict fast-forward only.
- GitOdile never stashes, discards, merges, rebases, resets, or force-updates
  local work.
- Planning is non-mutating apart from the existing explicit fetch; the
  `read-tree` preflight uses `--dry-run`.
- A local edit made after preview invalidates the token before recovery or
  history mutation.
- Incoming/local collisions, unresolved states, unsupported paths, and
  incomplete evidence block instead of guessing.
- Execution retains the existing durable recovery reference and uncertain
  outcome handling.

# Acceptance criteria

- [x] Separate unstaged tracked changes allow Review and get.
- [x] Separate staged additions allow Review and get without changing the
      index during planning.
- [x] Staged, unstaged, and untracked work remains present after a successful
      fast-forward.
- [x] A local rename overlapping an incoming source or destination blocks with
      `incoming_tracked_change_collision`.
- [x] More than the bounded incoming-file evidence blocks when tracked local
      work prevents a complete non-overlap proof.
- [x] Editing an already-dirty file after preview makes the plan stale before
      recovery is created.
- [x] The dialog no longer describes a team-update collision as a branch
      switch failure.

# Validation

- Historical UI scan returned no
  findings.
- `pnpm run check` passed: documentation and architecture checks, TypeScript,
  420 frontend tests, production build, Rust formatting, Clippy, and 297 Rust
  tests.

# References

- [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md)
- [`docs/adr/0008-store-history-recovery-as-versioned-hidden-refs.md`](../../../docs/adr/0008-store-history-recovery-as-versioned-hidden-refs.md)
- [`work/done/0.1.0/014-get-team-changes-safely.md`](014-get-team-changes-safely.md)
