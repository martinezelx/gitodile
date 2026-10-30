# Integration audit — 2026-10-30

Windows audit of [065-4](../../0.5.0/065-4-integrate-branches.md), on the
existing `release/0.5.0`, starting at `42ad19f`. This is evidence, not a new
workflow specification. ADR [0030](../../../docs/adr/0030-forecast-and-combine-project-changes.md)
and [0041](../../../docs/adr/0041-conflict-sessions-and-their-recovery.md)
remain authoritative.

## Environment and isolation

- Windows 11 Home `10.0.26300`, system Git `2.55.0.windows.3`, Tauri dev
  and WebView2 `156.0.4314.50`,
  controlled over loopback CDP port 9222. No separate browser was substituted.
- Disposable repositories, linked worktree and local remotes under
  `%TEMP%/gitodile-065-4-5-audit`. All app mutations targeted those fixtures.
  Fixture commits and the intentionally rejected local-remote push are test
  setup/validation, not commits or pushes of the product repository.
- Application identifier `app.gitodile.task06545audit`, dedicated
  `WEBVIEW2_USER_DATA_FOLDER`, isolated global Git config and no system Git
  config; identity `Audit <audit@example.invalid>`, empty credential helper,
  terminal prompts disabled. GH/GLAB config directories were isolated too.
  No real project, app preference or credential was changed.
- The existing external `playwright-core` installation attached to WebView2;
  no project dependency was added. English/light and Spanish/dark were tested
  with full reloads between locales and the app's reduced-motion preference.
- Test and dev builds were kept sequential when they needed the same Windows
  executable. Reloading during outstanding IPC produced Tauri's callback /
  custom-protocol fallback warnings; those reload boundaries are not counted
  as successful workflow actions.
- Git Trace2 was requested, but the process runner deliberately strips trace
  environment variables. Its file captured development tooling, not app Git
  commands; **no app fetch/push conclusion is inferred from that trace**.
  The offline-remote experiment below and the native contracts establish the
  no-fetch behavior instead.

## Parent acceptance matrix

R = [native sync tests](../../../src-tauri/src/tests/sync_tests.rs),
C = [native conflict tests](../../../src-tauri/src/tests/conflict_tests.rs),
B = [Bring dialog tests](../../../src/features/sync/BringInChangesDialog.test.tsx),
G = [Get dialog tests](../../../src/features/sync/GetTeamChangesDialog.test.tsx).
Named tests identify behavior rather than a transient line number.

| Epic criterion | Evidence and result |
| --- | --- |
| 1. Local/upstream contained, fast-forward, clean, empty and conflict outcomes | **Windows passed.** Desktop outcome matrix below. R `bringing_in_a_local_branch_fast_forwards_merges_and_records_an_empty_merge`, `bringing_in_a_remote_branch_reads_its_last_check_and_names_it_like_git`, `diverged_branches_without_overlap_are_combined_with_a_merge_version`; local/upstream pause tests. Get also executed all three changing outcomes through real IPC; subsequent plans returned `nothing_to_get`. |
| 2. Bind refs/commits/status/fetch evidence; stale never retargets | **Passed.** Desktop stale edit left HEAD alone and created no recovery. R `bringing_in_is_stale_when_the_source_the_branch_or_the_work_moved_after_review`, `execution_rejects_a_remote_target_that_advanced_after_preview_without_local_mutation`, `execution_rejects_changed_upstream_and_recovery_creation_lock_before_local_mutation`. B/G cover refreshed tokens, late/closed answers and uncertainty superseding plans. Ambiguous HEAD discovery/upstream selection regression fixed below. |
| 3. Dirty/unborn/detached/shallow/locked/in-progress/missing-upstream/unsupported guidance | **Passed.** R `bringing_in_refuses_states_it_cannot_combine_safely` now checks both workflows' unrelated/shallow/sparse blockers; `starting_an_overlap_refuses_unsafe_work_and_custom_merge_options`; existing Get collision/staged/operation tests. B/G cover each returned blocker and prevent mutation; Get's new deterministic blockers offer Close. Missing/deleted upstream and failed checks never enable cached resolution. |
| 4. Recovery verified first and retained after every outcome/restart | **Windows passed.** Desktop recovery refs after advance/merge, real interrupted pause reopened and exact abort, real post-recovery ref-lock uncertainty, failed handoff with one native start. R `a_refused_or_uncertain_overlap_keeps_its_start_and_history_recovery`, `an_interrupted_overlap_is_still_gitodiles_session_before_any_snapshot`, `history_recovery_names_are_create_only_and_retention_survives_reacquisition`; recovery owner tests cover protected retention. |
| 5. Handoff preserves roles; no automatic stage/resolve/abort/commit/publish | **Passed.** Desktop main/topic and main/origin-main, all initiation entries, restart, explicit Keep/Mark/Finish/Stop. Get-and-publish left the remote unchanged at pause and after Finish; only a separate explicit Publish was attempted. App shell test in [App.projects](../../../src/app/App.projects.test.tsx) checks adoption before navigation without Get/Publish. B/G check exact workflow token/recovery and uncertain handoffs. |
| 6. Hooks/signing/identity/credentials/rejection/uncertainty truthful and bounded | **Windows passed with synthetic credentials.** Desktop hook rejection and failed signing kept prepared resolutions, empty local identity now blocks planning, rejected local remote kept work. C `a_merge_is_finished_only_when_resolved_and_failures_keep_the_resolutions`; R `merge_version_failures_and_overlaps_leave_the_project_untouched` and `an_upstream_overlap_uses_gets_token_and_finishes_through_commit_hooks`. Credential helper integration tests use fake secrets/private process pipes; no real hosting login/store qualification is claimed. |
| 7. Linked worktrees serialize shared mutations and refresh correct content/refs | **Windows passed.** Quick-switch initiation/abort changed only linked files and used that worktree's start/snapshot/recovery owner. Main checkout kept its HEAD and dirty/untracked bytes. R `a_linked_worktree_owns_its_overlap_without_changing_the_main_worktree`; [repository access tests](../../../src-tauri/src/repository_access.rs) prove common-directory exclusion and writer fairness; [read coordinator tests](../../../src/features/repository/readCoordinator.test.ts) prove worktree/shared invalidation scopes. |
| 8. Full repository/frontend/accessibility/platform tests, IPC/docs, aggregate gate | **Windows checks recorded in the task; platform criterion remains open.** Keyboard/focus/locale/theme desktop evidence below; typed IPC and architecture checks run in the aggregate gate. macOS/Linux runtime, real screen reader and inherited live forced-colour qualification remain unrun, as in [037-7](../../done/037-7-conflict-workflow-audit.md) and [ADR 0006](../../../docs/adr/0006-defer-macos-and-linux-runtime-validation.md). No current CI or non-Windows success is claimed by this local audit. |

## Desktop outcome matrix

| Scenario | Observation |
| --- | --- |
| Local contained | Preview said all source versions were already present; Close only, no mutation or recovery record. |
| Local fast-forward | [Preview](ff-light.png); keyboard confirmation advanced exactly to the reviewed topic commit, clean worktree, durable `bring-in-changes` ref. |
| Local clean merge | [Preview](clean-light.png); two parents were the old local HEAD and reviewed topic; clean status and recovery. |
| Local empty merge | [Spanish/dark](empty-es-dark.png); two parents, result tree exactly equal to the original local tree. |
| Upstream fast-forward/clean/empty | Real adapter/IPC, independent temporary clones: completed, correct recovery operation, normal progress order. Empty plan had zero file changes; all subsequent Get plans returned `nothing_to_get`. [Machine results](get-matrix.json). |
| Local overlap with separate work | [Preview](overlap-light.png), [handoff](resolver-light.png). HEAD unchanged, unmerged `clash.txt`, clean incoming stage-0 entry, unsaved `notes.txt` and `untracked.txt` preserved. |
| Restart during pause | Tauri's dev process restarted after the pause; reopening the fixture found the ordinary merge with correct names and GitOdile origin. [Stop preview](restart-abort-light.png) promised exact return; explicit Stop restored HEAD/files, retained both carried files and removed incoming-only content. The before-snapshot crash boundary is separately deterministic in R. |
| Diverged Get / Get and publish | [Spanish/dark Get](get-es-dark.png), [resolver](resolver-es-dark.png). Overview review and status-bar Get-and-publish entered the same review. Verified `get-team-changes` ref, unchanged HEAD and remote. No clean Get or publish chain followed the pause. |
| Finish | Explicit Keep incoming, then Mark resolved, then Finish. [Result](finished-es-dark.png) offered Publish but did not take it; parents matched the paused heads, markers/unmerged entries were gone and separate unsaved work remained. |
| Hooks, identity, signing | [Hook refusal](finish-hook-es-dark.png) left HEAD, MERGE_HEAD and staged resolution intact; missing signer did too. [Identity blocker after fix](identity-block-light.png) names Settings before any commit attempt. Fixing test configuration allowed an explicit fresh Finish. |
| Stale review | External edit after preview: [replanned review](stale-light.png), no mutation retry, unchanged HEAD, no recovery record. |
| Uncertain clean mutation | A test-created branch-ref lock after preview let the index update but refused the branch move. [Close only](uncertain-light.png); old HEAD, staged incoming file and recovery remained. No retry, repair, reset, abort or publish ran. |
| Failed post-pause handoff | Mounted the production Bring dialog in the running WebView with native port/real fixture; only the adoption callback was injected to throw. [Close only](handoff-uncertain-light.png); one native start, phases `planning → executing → uncertain`, returned origin `gitodile`. Existing app was otherwise unchanged; harness was unmounted afterward. |
| Linked worktree | [Quick-switch preview](linked-light.png), ordinary resolver and explicit Stop. Its own Git directory/owner held the start and snapshot; main checkout's dirty/untracked status and HEAD stayed unchanged. |
| Selected remote check | Chose `origin/topic`: [contained preview](selected-remote-light.png) after background check; FETCH_HEAD named only `topic`. Current upstream's other tracking ref was not substituted. R additionally checks custom and negative mappings. |
| Failed selected remote check | A nonexistent temporary remote address: [error](remote-check-failed-light.png), no Bring/Resolve button, cached knowledge could not execute. |
| Prepared/mixed local overlap | After the forecast fix, [prepared work](prepared-overlap-light.png) and [mixed saved/unsaved overlap](mixed-overlap-light.png) offered Save, with no Resolve action. [Native matrix](local-work-matrix.json) proves the same forecast for Bring and Get, including untracked and ignored collisions. |
| No fetch in Get plan/execution | New divergent branch with cached tracking ref and remote URL pointing to a nonexistent path: plan and execution completed; an explicit check of the same query failed. This distinguishes local integration from remote checking without relying on stripped Trace2. |
| Remote rejection | After explicit Finish, separately chose Publish against a local bare remote whose pre-receive hook rejected. [Truthful error](remote-rejection-light.png); remote tip unchanged, resolved history/recovery and separate work retained. No forced or automatic publish. |

## Local work and initiation safety

The native tests exercise unsaved line-level combinations, separate staged,
unstaged, untracked and ignored work, renamed/deleted incoming paths,
untracked/ignored component collisions and split indexes. The paused-merge
path refuses **all** prepared work and any unsaved affected path; it carries
only separate work. Tests also cover empty/nonempty branch mergeOptions,
trained rerere/autoupdate disabled only for this merge invocation, operation
markers, index locks, stale title/source/work and exact provisional stage-0
verification. These are real-Git tests, not claims that every blocker was
manually recreated in the desktop UI.

[Independent Git-state checks](verification.json) record the observed tips,
parents, trees, retained recovery, linked-worktree status, offline Get and
remote tip. The checks were evaluated against fixture baselines, not copied
from the native success response.

Start/snapshot failure tests retain the actual conflict bytes and mark the
outcome uncertain. Retention tests protect pending/uncertain records across
worktrees, distinguish repeated attempts and prevent a terminal merge of the
same heads from inheriting an ended GitOdile attempt. None repairs Git's state.

## Entries, accessibility and visual comparison

All four Bring entries were used: palette picker with search/Down/Enter;
Branches detail; Branches row menu; quick-switch action. Get used Overview's
overlap review and the status-bar Get-and-publish entry. Existing unsupported
rebase/compare/merge-into-other affordances stayed disabled/Soon.

Tab, Shift-Tab, Enter and Escape were exercised, including focus after source
selection, dialog trapping and stale/error dismissal. B/G additionally hold
native replies pending to check busy Escape and late-result behavior without
raising timeouts. Loading was observed in source discovery, native planning,
remote checking, resolution and publication; failed checks, blocked identity,
stale and uncertain states were inspected. The empty picker and all forecast
blockers remain covered at component level.

Compared Bring and Get in the running app in both light and dark themes; the
same medium shell, facts, disclosure, focus outline and button primitives are
used. No new token, pattern, CSS or resolver was introduced. Reduced motion
was selected in the isolated profile. DOM accessibility semantics and keyboard
behavior were checked; this is not a real assistive-technology qualification.

## Defects corrected

1. Bring treated a failed adoption/refresh after a verified native pause or
   update as retryable. It now keeps the recovery evidence and only Close;
   mutation start also supersedes pending preview generations. Extended B's
   existing uncertainty matrix; the handoff case failed before the fix.
2. Get did not share Bring's shallow/unrelated-history/sparse preflights.
   It could offer a sparse update or return generic Git errors for unrelated
   histories. Both planner and executor now use those guards; the overlap
   executor no longer repeats them. Extended R's blocking-state fixture and
   G's deterministic-refusal matrix. Unrelated-history regression failed first.
3. Discovery and current-upstream selection used ambiguous short HEAD refs.
   With a tag called `main`, the UI said `heads/main` and could miss
   `branch.main.remote`. Full refs now retain the actual branch name without
   an additional discovery process. Extended the repository parser/real-Git
   tests and existing remote-home test. The repository regression failed first.
4. Identity preflight accepted any nonempty occurrence across Git scopes,
   ignoring a later empty local override. It now respects the last value,
   including empty values, without trimming away that evidence. Extended C's
   finish failure fixture with empty local name and email over a valid global
   identity; the regression failed first. Shared Save preflight benefits too.
5. A saved-overlap forecast returned before classifying prepared work,
   affected unsaved work and untracked/ignored collisions. Native initiation
   refused safely, but the preview could still offer Resolve. Analysis now
   uses the same provisional footprint as initiation, reports those blockers
   or mixed saved/unsaved overlaps first, and leaves the final native guards
   in place. Extended R's existing unsafe-start fixture with forecast
   assertions; the prepared-work regression failed before the fix.

Reference study: GitButler's [oplog owner](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/but-oplog/src/lib.rs)
documents the state its snapshots own separately from the operation. The
reusable principle is explicit recovery ownership; GitOdile keeps its own
existing start/history/conflict records and ordinary Git merge. No code or
assets were copied and no new architectural decision was introduced.

## Pre-commit review

The user-requested review extended the existing regressions and found four
additional gaps (details and checks in the completed task):

- The capped forecast could drop every unsaved overlap after many saved
  overlaps. Unsaved evidence now comes first without widening the payload.
- Clean Get's post-native refresh failure could become retryable; even a
  stale refresh error now keeps the actual result, only Close, and no publish.
  Both Get and Bring retain the returned unsaved-copy ref in that state.
- Valueless local identity keys could revive inherited values. The identity
  read now parses NUL-separated config records and honors those overrides.
- A successful merge hook could edit an unsaved file, then integration would
  overwrite it with the older combination and report success. Execution now
  revalidates tracked work, refs, markers and collisions after hooks/signing
  before any integration file/history update. The real-Git Get loss case and
  Bring hook-edited-work/moved-source cases now refuse stale with work kept;
  unrelated untracked hook output is allowed.

Review desktop evidence on the same isolated Tauri/WebView2 profile:
[25 saved overlaps plus unsaved work](review-many-unsaved-light.png),
[hook-edited work invalidating Get](review-hook-stale-dark.png), and
[post-Get refresh uncertainty](review-get-refresh-uncertain-dark.png).
The first Get left HEAD/recovery untouched and retained the hook's actual
bytes; that hook also changed line endings, so the fresh preview correctly
reported an unsaved overlap. After removing the fixture hook and matching
its working line endings to the saved file, a new explicit Get completed.
The production Get dialog then received an injected stale refresh error:
one native execution, one plan, no publish, Close only, actual history and
unsaved-copy refs visible. [Independent assertions](review-verification.json)
verify merge parents, unchanged remote and HOOK work in both working content
and the pre-update unsaved copy. The harness was unmounted and dev stopped.

## Remaining qualification

The implementation and Windows audit passed the final gate recorded in
[065-4-5](../../done/065-4-5-integration-audit.md). Epic 065-4's
last criterion remains open for macOS/Linux runtime and accessibility evidence,
including the resolver's inherited real-screen-reader/forced-colour gap.
ADR 0006 owns that platform limitation; release hardening must run it on actual
WKWebView/WebKitGTK and appropriate assistive technology. This audit neither
prepares nor authorizes a release.
