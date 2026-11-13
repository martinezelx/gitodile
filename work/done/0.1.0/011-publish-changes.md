---
id: "011"
title: "Publish saved versions safely"
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
  - sync
created: 2026-07-27
completed: 2026-07-28
---

# 011 — Publish saved versions safely

## Goal

Let the user publish local saved versions to a remote project through a
previewed, explicit, non-force Git push.

Publishing sends commits, not unsaved working files. The UI must preserve that
distinction even when both exist at the same time.

## User value

A user can understand:

- how many saved versions are waiting to be published;
- where they will be sent;
- whether remote tracking will be created;
- which unsaved files will remain local;
- why publishing is blocked if newer or divergent remote work exists.

## Scope

### Entry points

Support the same publish planner and confirmation from:

- **Publish now** after task 010 successfully saves a version;
- **Publish changes** in the project overview when typed status reports local
  saved versions that are not yet published.

Do not show a working publish action until the supporting planner and safety
checks are implemented.

### Remote discovery and preflight

Add typed sync-domain discovery for:

- configured remotes, with credentials redacted from display values;
- current branch and configured upstream;
- local and remote commit identifiers;
- ahead, behind, and diverged counts/state;
- optional provider hints used only for presentation.

Before producing a final plan, perform a fresh on-demand fetch/preflight for the
selected remote and relevant refs. This must update remote knowledge only; it
must not merge, rebase, checkout, reset, or modify working files.

Remote selection rules:

- use the configured upstream by default;
- with no upstream and exactly one remote, propose that remote and the current
  branch as the destination;
- with multiple possible remotes, require an explicit user choice;
- never assume a remote is named `origin` or hosted by GitHub.

### Planning contract

Return a typed `PublishPlan` containing at least:

- operation kind: `remote-mutation`;
- plain-language summary;
- ordered steps;
- risks and recovery information;
- `requiresConfirmation: true`;
- state token for local and freshly observed remote state;
- selected remote;
- local branch and destination branch;
- whether upstream tracking will be created;
- count and summary of commits to publish;
- whether unsaved files exist and are explicitly excluded.

The confirmation must show:

- the number of saved versions being published;
- remote and destination branch;
- whether tracking will be created;
- that unsaved files are not included;
- that teammates may observe the published history.

### Execution contract

Return a typed `PublishResult` containing at least:

- remote;
- local and destination branch;
- previous remote commit, when one existed;
- published commit;
- published version count;
- whether upstream tracking was created.

Execution must:

- revalidate the plan token immediately before push;
- push exactly one confirmed branch/refspec;
- invoke Git with separate arguments and machine-readable output where
  available;
- use normal system Git credential helpers and hooks;
- create upstream tracking only when shown in and accepted with the plan;
- never force push, delete refs, mirror, or publish tags implicitly;
- never mutate the index or working tree;
- refresh overview/status after success.

### Blocked and failure states

Return structured, actionable outcomes for:

- no remote configured;
- detached `HEAD`;
- unborn branch with no saved version;
- nothing waiting to publish;
- local branch behind the destination;
- diverged local and remote histories;
- remote state changing after preview;
- invalid or unsafe ref names;
- authentication or authorization failure;
- network failure or timeout;
- remote rejection, including server-side hooks;
- cancellation or an uncertain outcome.

A non-fast-forward result must direct the user toward the future **Get team
changes** flow. Do not automatically merge, rebase, resolve conflicts, or retry
with force.

Publishing may proceed while unsaved files exist only when the plan explicitly
says those files stay local and tests prove the worktree and index remain
unchanged.

Cancellation must avoid claiming failure when the remote outcome cannot be
known. Refresh remote state before offering a retry after an uncertain result.

## Safety model

This is a **remote mutation**. It requires:

1. fresh remote knowledge;
2. a preview with destination and consequences;
3. explicit user confirmation;
4. execution constrained to the confirmed branch and refspec;
5. a result refresh that verifies the observed outcome.

Recovery information should identify the previous remote commit when available,
but the UI must not promise automated rollback in this task.

## States and UX copy

Cover at least:

- versions ready to publish;
- first publish and upstream creation;
- already published;
- no remote;
- remote selection required;
- behind;
- diverged;
- unsaved files excluded;
- authentication required/failed;
- offline, timeout, and remote rejection;
- stale plan;
- publishing progress;
- cancellation with known or uncertain outcome;
- successful publish.

Use **Publish changes** as the primary wording and **push** only as secondary
educational detail where useful.

## Acceptance criteria

- [x] Both entry points use one shared publish planner and confirmation flow.
- [x] Remote discovery returns redacted, structured data.
- [x] The plan is based on a fresh remote preflight and is classified as a
      remote mutation requiring confirmation.
- [x] The confirmation identifies commit count, remote, destination, tracking
      creation, teammate impact, and excluded unsaved files.
- [x] Configured upstream selection works without assuming `origin`.
- [x] A single remote can be proposed for first publish; multiple remotes
      require explicit selection.
- [x] Execution revalidates local and remote state.
- [x] First publish can create the confirmed upstream relationship.
- [x] Normal ahead-only publication succeeds.
- [x] Up-to-date, behind, diverged, detached, unborn, and no-remote states are
      handled without unsafe mutation.
- [x] Non-fast-forward results never trigger force push or automatic
      integration.
- [x] Authentication, network, timeout, hook, rejection, cancellation, and
      uncertain outcomes are accurately represented.
- [x] Unsaved files and the index remain unchanged on success and failure.
- [x] No tags, extra branches, or unintended refs are published.
- [x] Success refreshes the overview and accurately reports the published
      destination and version count.
- [x] Keyboard navigation, focus, loading, error, and reduced-motion behavior
      are verified.
- [x] Spanish and English copy is complete and understandable without Git
      expertise.

## Required tests

### Rust unit tests

- Remote URL credential redaction.
- Upstream and remote-selection rules.
- Ahead/behind/diverged classification.
- Ref validation and explicit refspec construction.
- Plan-token stability and invalidation.
- Porcelain push-result and failure parsing.

### Rust integration tests

Use local bare remotes to cover:

- first publish with upstream creation;
- ahead-only publish;
- already up to date;
- behind remote;
- diverged history;
- remote changed after planning;
- remote hook rejection;
- publication with unsaved files present;
- unchanged working tree and index on every result;
- exactly one intended branch updated.

Network and credential-specific cases may use deterministic process fixtures
where a hermetic real integration is not practical.

### Frontend tests and manual verification

- Overview and post-save entry points.
- Remote choice and upstream-creation confirmation.
- All blocked, loading, error, uncertain, and success states.
- Clear treatment of unsaved files as excluded.
- Keyboard-only completion and focus restoration.
- Live desktop verification in light and dark themes.

## Out of scope

- Force push in any form.
- Remote branch or tag deletion.
- Publishing tags, all branches, or mirrored refs.
- Pulling, merging, rebasing, or conflict resolution.
- The **Get team changes** implementation.
- Built-in hosting-provider authentication.
- Clone, fork, or remote-repository creation.
- Pull request creation or review.
- Multi-branch batch publication.
- Background or automatic publishing.
- Direct publication of unsaved files.

## Platform implications

- Use the system Git credential-helper behavior on Windows, macOS, and Linux.
- Treat credential prompts, cancellation, timeouts, and process termination as
  distinct outcomes where possible.
- Support HTTPS, SSH, local-path, and file-based remotes without exposing
  embedded credentials.
- Preserve non-ASCII branch and remote names while validating refs safely.
- Keep integration tests hermetic with local bare repositories.

## Dependencies

- Task 010 for the post-save **Publish now** integration.
- Existing repository overview/status architecture.
- System Git and the user's configured credential helpers.

## Validation

- `pnpm run typecheck` — pass.
- `pnpm run test` — pass, 8 test files / 71 tests, including
  `publishDialog.test.tsx`, `pendingVersions.test.tsx`, and the updated
  `saveVersionDialog.test.tsx`/`changesPanel.test.tsx` for the new
  `onPublishNow` prop.
- `pnpm run build` — pass.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — pass.
- `cargo test --manifest-path src-tauri/Cargo.toml` — pass, 129 tests,
  including differently named local/upstream branches, truncated pending
  lists, unsafe remote names, and remote URL query-token redaction.
- Historical UI scan — pass,
  no findings.
- Live Tauri desktop verification — pass against
  `C:\workspace\gitodile-sandbox\repo` in dark and light themes:
  compound saved/pending status, primary publish action, changed-file
  disclosure, per-file line diff, full first-publish preview, and a 3-of-5
  checkpoint preview. The final pending-row action and adaptive-height diff
  were rechecked in both themes after the visual polish.
  Both previews were cancelled; no sandbox ref or working file was changed.

## Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `work/active/010-save-version.md`
- `work/done/0.1.0/007-working-tree-status.md`
- `work/done/0.1.0/009-changes-and-diff-viewer.md`
- `src/main.tsx`
- `src/repositoryOverview.ts`
- `src/changes.tsx`
- `src/saveVersionDialog.tsx`
- `src/publish.ts`
- `src/publishDialog.tsx`
- `src/pendingVersions.tsx`
- `src/appError.ts`
- `src/i18n.tsx`
- `src/styles.css`
- `src-tauri/src/lib.rs`

## Implementation notes

- Follows the exact save-version split: a read-only planning half
  (`discover_remotes`, `plan_publish`) and a narrow execution half
  (`publish`), sharing one `validate_and_prepare_publish` core so each
  command spawns Git exactly once for its own fresh preflight. Unlike
  save-version, `plan_publish` and `publish` each run their *own*
  independent fetch — time passes while the user reads the confirmation, so
  the whole point of "revalidate immediately before push" requires a second,
  separate fetch rather than reusing the plan's.
- `run_git_networked` is a new timeout/kill primitive for `fetch`/`push`
  (the only network-touching Git calls) — nothing else in the codebase had
  one; it follows the same spawn → poll `try_wait` → kill-on-timeout shape
  as the existing Windows-only winget update-check loop, generalized to run
  on every platform. `GIT_TERMINAL_PROMPT=0` makes a missing credential
  helper fail fast instead of hanging on a terminal prompt a GUI app could
  never answer; real credential helpers and SSH agents are unaffected.
- Ahead/behind/diverged is computed via `git rev-list --left-right --count
  local...remote` after the fresh fetch; a first publish (no remote ref yet)
  is detected by pattern-matching `fetch`'s "couldn't find remote ref"
  stderr rather than treating it as an error.
- Remote URLs are redacted (`user:pass@`/token-in-URL stripped) before ever
  leaving Rust; SSH's `user@host:path` shorthand is left untouched.
- Cancellation is scoped down to timeout-driven "uncertain outcome"
  handling (`PublishUncertain`), not an interactive mid-push cancel button —
  the codebase has no async-cancellation precedent, and save-version's own
  `submitting` state offers no mid-flight cancel either.
- `SaveVersionDialog`'s previously-disabled **Publish now** placeholder
  (and its now-inaccurate `saveVersionPublishComingSoon` copy, removed) is
  now a real button via a new required `onPublishNow` prop; both entry
  points open the same lifted `PublishDialog` instance owned by `App` in
  `main.tsx`.

## Additions beyond the original scope

Built in response to live user feedback while trying the feature (not called
for by the acceptance criteria above), in the order they came up:

1. **The Overview's pending-versions list (`src/pendingVersions.tsx`).**
   Originally the Overview only showed a count-based **Publish changes**
   entry point. The user found that too vague ("I have two saved versions —
   which ones?"), so this section lists every not-yet-published saved
   version by description, with its short hash de-emphasized next to it. A
   new read-only, local-only Rust command (`list_unpublished_versions`)
   computes the list via `git log <upstream>..HEAD` (or plain `HEAD` when no
   upstream is configured yet, in which case every local commit counts as
   pending) — this reads the same last-known remote-tracking ref the
   ahead/behind counts already used, not a fresh fetch. `canPublish` (the
   Overview's entry-point visibility) now derives from this real list's
   length instead of the earlier `ahead`-count heuristic, since the list
   already correctly handles the no-upstream-yet case that the heuristic
   needed extra branching for.
2. **Per-commit file list, expandable inline (`read_commit_file_changes`).**
   Each pending version expands (a `<details>`/`<summary>` row, chevron
   rotating on open — the same pattern already used for "Technical details"
   in this screen) into a very condensed file list: category icon + path,
   reusing the exact same `ChangeCategory` vocabulary and icon set
   (`CATEGORY_ICONS`, exported from `changes.tsx`) as the Changes screen, so
   the two can never disagree about what a category means. Backed by
   `git show --name-status -M <commit>`, parsed by a new
   `parse_name_status_line` shared with the state-token/summary path.
3. **Per-file diff, expandable one level deeper (`read_commit_file_diff`).**
   Clicking a file inside that list reveals its real line-by-line diff,
   reusing the Changes screen's entire diff pipeline unchanged: the same
   `FileDiff` parsing/classification (`diff_result_from_text`) and the same
   virtualized `DiffResultView`/`DiffHunkList` component (exported from
   `changes.tsx`), just fed from `git show` on a specific commit instead of
   the working tree. Two real CSS bugs surfaced and were fixed getting this
   right in a non-Changes-screen context:
   - Flex children inside `.pending-versions__list` (a capped-height,
     `overflow-y: auto` flex column) were *shrinking* below their real
     content height instead of the list simply scrolling, once several rows
     were expanded at once — the classic flex default (`flex-shrink: 1`)
     fighting the intended scroll behavior. Fixed with `flex-shrink: 0` on
     `.pending-versions__item`.
   - The diff viewport (`.diff-code`, shared with the Changes screen) relies
     on `flex: 1; min-height: 0` against a *bounded* flex ancestor to become
     the virtualizer's real scroll container — outside of one, those
     properties are simply inert. The pending-list wrapper now provides a
     bounded viewport whose height matches the visible diff rows and their
     padding, up to a 300px maximum. Small diffs contain only their rendered
     lines while long diffs retain the existing virtualized scrollbar.
4. **Publish up to a checkpoint, per saved version.** The user asked for a
   per-commit publish button; the constraint (confirmed with the user
   before building) is that Git can't publish an isolated middle commit —
   pushing any commit necessarily publishes every older ancestor too, so
   "publish up to here" is the only meaningful framing, and choosing the
   *oldest* pending version is the safe, single-click "just this one" case.
   `plan_publish`/`publish` gained an optional `upTo` (a specific pending
   commit hash) threaded through the same `validate_and_prepare_publish`
   core: `resolve_up_to_target` requires it to be an ancestor of `HEAD`
   (never something outside this branch's own history) and to not
   already be reachable from the remote's last known position (else
   `NothingToPublish`). The push refspec's source becomes that resolved
   commit directly (a raw hash is a perfectly valid push source, not just a
   branch name) instead of `refs/heads/<branch>`. That in turn meant
   dropping `git push -u`, since a raw-commit source gives Git nothing to
   infer a local branch name from for upstream tracking — upstream creation
   is now a separate, explicit `git branch --set-upstream-to` call after a
   successful push, whose actual success (not just the original intent) is
   what `PublishResult.createdUpstream` reports. This refspec/upstream
   change applies uniformly to the plain "publish everything" path too
   (where the resolved target simply equals `HEAD`), and the full existing
   test suite re-passed unchanged, confirming no regression there. A new
   `remainingAfterPublish` count on both `PublishPlan` and `PublishResult`
   drives the "N other saved versions will stay unpublished for now" note.
   The per-row button is a sibling of the version's `<details>`, so it has
   independent keyboard and pointer behavior without nested interactive
   controls. It is styled as a compact inline action rather than a visually
   divided second column. The preview's **Will stay on this computer**
   section receives the descriptions of any newer saved versions from the
   same plan and presents them as compact pills; hashes are intentionally
   omitted there because they do not help with that decision. Unsaved file
   changes use a separate pill because they do not yet have a saved-version
   description.
