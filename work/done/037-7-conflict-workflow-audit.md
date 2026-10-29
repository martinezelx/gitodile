---
id: 037-7
title: Audit the complete conflict workflow
status: done
priority: high
type: audit
areas:
  - conflicts
  - accessibility
  - performance
  - platform
  - testing
created: 2026-08-18
completed: 2026-10-29
parent: "037"
queue:
---

# Goal

Independently verify epic 037 from conflict creation through inspect, resolve,
reset, restart, complete, abort, and recovery under real desktop conditions.

# User outcome

Conflict resolution is a reliable product workflow, not a collection of slices
that only pass in isolation.

# Context

This is the closure gate for epic 037 and the prerequisite for task 065-4 to
initiate conflicting integrations in normal product use.

# Scope

- Audit every parent acceptance criterion and conflict class end to end.
- Run large file-count, binary/structural, cancellation, external edit,
  restart/crash boundary, watcher, linked-worktree, and injected-failure cases,
  including a merge started outside GitOdile and abandoned, and a paused
  rebase, cherry-pick, revert and stash pop left by another tool.
- Measure lazy load, first open, process count, IPC/DOM caps, and normal-screen
  regressions against the baseline.
- Perform keyboard, screen reader, zoom, forced colors, reduced motion,
  locale/theme, narrow layout, and platform-specific audits.
- Fix closure defects or record a concrete blocker; remove development flags and
  enable only the complete supported workflow.

# Out of scope

- New operation variants or initiating non-fast-forward integration.

# Acceptance criteria

- [x] Every acceptance criterion in epic 037 is checked with linked evidence
      (the matrix in Implementation notes).
- [x] An independent end-to-end temporary-repository journey covers resolve,
      reset, restart, complete, abort, recovery, and uncertain outcomes.
- [x] Performance/accessibility/platform results meet the baseline or the epic
      remains open with an explicit blocker (macOS, Linux, a real screen
      reader and live forced colours; see Residual risks).
- [x] No incomplete resolver affordance ships and normal startup/navigation/
      Changes performance remains within baseline.
- [x] README, roadmap, ADRs, architecture, IPC, tests, and task notes match the
      delivered behavior and `pnpm run check` passes.

# Relevant files

- [Epic 037](../0.5.0/037-guided-conflict-resolution.md)
- [037-1](037-1-conflict-domain-and-recovery.md)
- [037-3](037-3-read-only-conflict-workspace.md)
- [037-6](../0.5.0/037-6-resolve-files.md)
- [037-5](037-5-complete-or-abort-merge.md)
- [Performance baseline](../../docs/architecture/023-performance-baseline.md)

# Dependencies

Tasks 037-1, 037-3, 037-6 and 037-5.

# Decisions

The epic closes only on end-to-end evidence from the complete workflow.

- 2026-10-29: the audit ran on Windows only. What it could not run (macOS,
  Linux, a real screen reader, live forced colours) is the epic's open
  blocker, not something inferred from Windows.

# Implementation notes

Audit owner: Claude (Opus 5.5), 2026-10-29, on `release/0.5.0` after
`0581b63`. Nothing in `src/features/conflicts/` or `src-tauri/src/conflicts/`
sits behind a development flag, and every affordance on the screen is backed
by a command that can reset, finish or abort.

**Defects found and fixed**

1. A file another program had opened without sharing (some Windows editors
   and viewers) failed Keep a side as `recovery_failed`, "couldn't keep a
   copy", because the journal could not read it either. Both reads now
   report `file_locked` through `conflicts::file_in_use`, which the write
   path already used. The new Rust test fails on the old code.
2. After a finish or stop that ended `merge_outcome_uncertain`, the dialog
   still offered the same action on a plan that no longer described the
   project; in the desktop pass a second Finish would have made a second
   merge version. Both dialogs now offer only Close, and the screen shows
   what Git left.
3. A file GitOdile had written a side to read "Edited since" in its row,
   next to "Kept “main”" in its bar, since the kept bytes differ from the
   snapshot. The row now names the kept side, or "Deleted here".
4. A listing past the 5,000-path bound said "5000 of 5000 files still
   overlap" for a merge with 6,000. It now says "More than 5,000 files
   overlap", and both counts use the locale's digit grouping.
5. In a window under about 900 px the header squeezed its title into a
   column six lines tall instead of wrapping its actions under it, as its
   own comment said it did.
6. Spanish called the same thing "cambios superpuestos" on Overview, the
   status bar and one error, and "cambios que se solapan" everywhere else;
   it is "se solapan" throughout now.

**Epic 037's criteria and their evidence** (R =
`src-tauri/src/tests/conflict_tests.rs`, F = `src/features/conflicts/*.test.*`,
D = the desktop pass under Validation):

| Criterion | Evidence |
| --- | --- |
| Reachable from Overview, Changes, the palette, an app-started merge; no rail entry | D: each of the three entries opened the screen; the rail holds Overview, Work, Branches, Console and Recovery. GitOdile starts no merge yet: `openConflicts` and the refusing dialogs are the hook 065-4 calls (037-3) |
| Leaving never aborts, stages, discards or completes | D: after Back, the Changes notice and the palette, `.git/index`, the markers and every file were byte-identical; F (037-3) |
| Plain language with real names; exact technical details | D in both languages; F per state |
| Friendly Sheet, both themes, wide and narrow | D: light English at 1,466 px; dark Spanish at 1,466, 746 and 586 px (list/detail switch, stacked sides, no horizontal scroll), after fix 5 |
| Typed session, roles, epochs, stale tokens | Rust unit tests and R (037-1); R `concurrent_locked_and_external_changes_keep_their_evidence`: two actions on one token, one wins, the other is `stale_conflict_session` and wrote nothing |
| Index stages are truth; lazy, bounded content | R `a_session_past_its_path_bound_says_it_is_partial` (5,100 paths: 5,000 listed, `listingComplete: false`, no Finish); D with 6,000 real overlaps |
| Every class has a path or an honest limitation | The class matrix of [037-6-3](037-6-3-editor-and-hard-classes.md); D: text, CRLF, binary, modify/delete, a `ñ` name, `.bat` |
| Opening, refreshing, revisiting never writes | R (037-1); D fingerprint before and after (no `gitodile/` folder, no ref, the same index) |
| Rebase, cherry-pick, revert, marker-less unmerged are read-only | R `other_paused_operations…`; D: each made in a terminal, the notice, no action button, "step 1 of 1" for the rebase |
| A durable snapshot before the first change restores a file | R (037-1, 037-6-1); D: Reset of a marked modify/delete file back to stages 1–2 and its bytes |
| External edits, restarts, bursts, project switches, worktrees, concurrent IPC | R race and journal pin (new); F project isolation (new); R linked worktrees (037-1); D: an edit with markers, then without, while the screen was open; a forced close, then a restart; a 600-write burst; a linked worktree |
| No silent resolution; bulk needs a plan | No bulk action exists; every side choice asks in place (D) |
| Finish needs a fresh check and a confirmed plan | R and F (037-5); D: Finish disabled until the seventh file was marked |
| Hooks and signing run; the result is verified; nothing is published | R (037-5); D: a 12 s `pre-commit` ran, the merge version has both parents, nothing was pushed |
| Failures keep resolved work and allow a retry | R (037-5); D: an edit between plan and confirmation re-read the plan |
| Abort has its own plan and no unproven promise | R (037-5); D: the best-effort banner on an external merge |
| Partial or uncertain outcomes keep evidence, no repair | D: a `post-commit` hook that rewrites `MERGE_HEAD` gave `merge_outcome_uncertain` with the observed `HEAD`, parents and markers, and the snapshot ref stayed; F (new): only Close is offered |
| Keyboard, focus, announcements, colour, themes, motion, scaling, languages | D and F, under Validation; a real Narrator and live forced colours were not run |
| Lazy; no regression of startup or switching | Build and D measurements under Validation |
| Windows passes; macOS and Linux with residual risks | Windows passes; macOS and Linux were not run (blocker) |
| An independent end-to-end audit | This task |

**Residual risks (the epic's open blocker)**

- macOS and Linux were not run: real symbolic links on disk, the executable
  bit, the runnable-type refusal by executable bit, a disk that tells case
  apart, VoiceOver and Orca, and their WebViews.
- No real screen reader was run. The semantics were read from the DOM: one
  `h1`, a named `section` per side under its `h3`, list buttons with
  `aria-current` and a roving tab stop, `aria-pressed` on the kept side,
  four live regions, no unnamed button.
- Forced colours and reduced motion could not be emulated live: WebView2
  ignores `Emulation.setEmulatedMedia`, and Windows' high contrast is a
  system setting the audit does not change. The feature's `forced-colors`
  rules draw the notice edge and the selected row; the screen has no motion
  of its own beyond the shared spinner.
- The first action on a 5,000-path session took 12.4 s, because its
  snapshot copies every listed working file (9.4 MB here); the next took
  1.7 s. No budget covers it, and such a session is past the listing bound.
- At 200 % zoom the two side headings truncate the branch name; the strip
  and the bar still name both sides.
- The app-started merge entry is proved only as a contract until 065-4
  starts merges.

# Validation

2026-10-29, Windows 11 Home 10.0.26300, Git 2.55.0.windows.3, `tauri dev`
driven through WebView2's remote debugging, on repositories made from a
terminal in the session's scratch folder (no project of the user's was
touched):

- `cargo test --lib conflict`: 31 passed. New:
  `a_session_past_its_path_bound_says_it_is_partial` (about 1 s alone) and
  `concurrent_locked_and_external_changes_keep_their_evidence` (about 3 s: a
  race on one token, a file held open with and without read sharing, and a
  resolution made by another tool that a reset replaces, whose blob the
  journal now pins — left to this audit by 037-6-1).
- `pnpm vitest run src/features/conflicts`: 52 passed. New: project
  isolation in the controller, no second attempt after an uncertain outcome
  in either dialog (about 1 s per case), the kept side named in its row.
- Journey (`journey`: seven overlaps — text, CRLF, binary, modify/delete, a
  `ñ` name, `.bat`, YAML — plus a cleanly merged file and an unsaved edit):
  entered from Overview, the Changes notice and the palette; kept each side
  through the in-place question (Enter on the confirmation, focus back on
  the file's name); deleted; reset a marked file; edited `story.txt` from
  the terminal with markers (the bar said one part is still marked and Mark
  resolved asked) and then without; finished with a 12 s `pre-commit` hook
  and killed the app while it ran. Git completed the commit (two parents, no
  `MERGE_HEAD`, `todo.txt` still unsaved) and the restarted app opened on
  that state with "Save your change".
- Abandon (`abandon`): one file kept and marked, one edited by hand before
  and after the plan; the later edit made the plan read again; Stop left
  `HEAD` unchanged, no `MERGE_HEAD` and `notes.txt` unsaved. Recovered by
  hand from the records: the later edit in `journal/files/2`, the earlier
  one in the snapshot's `files/1`, the kept side in the `-abandoned` tree.
- Uncertain (`uncertain*`): the finish dialog reported
  `merge_outcome_uncertain` with the observed state and, after fix 2,
  offered only Close.
- 6,000 overlaps (`many`): the screen opened in 46 ms with 18 rows mounted
  and 1,055 descendants; scrolling through the 5,000 listed rows kept 18
  rows at 33 ms per two-frame step; 600 writes to 200 overlapping files
  showed Git processes for under 10 s and none in the 10 s after.
- Other tools: a rebase, a cherry-pick, a revert and a `stash pop` each
  showed their sentence, the notice and no action; a linked worktree's merge
  was resolved in its own Git directory while the main worktree showed
  nothing paused.
- Against [the baseline](../../docs/architecture/023-performance-baseline.md):
  `pnpm run build` keeps the screen in its own 45.28 kB chunk, outside
  `index.html`'s preloads; launch JavaScript in Spanish is 1,285.5 kB raw /
  362.0 kB gzip against task 209's 1,257.5 / 354.6 (+2.2 %, under
  ADR 0040's 10 % trend). The first open from Overview with seven files took
  178 ms to the first rows (two frames), 541 descendants. A session read is
  three Git processes (`ls-files -u -z`, `rev-parse`, `for-each-ref`), a
  project with no overlap spends none, and the settled app ran no Git
  process over 15 s. Warm switches Overview → Work → Branches, 60 samples in
  the dev build: p50 19.7 ms, p95 33.2 ms (warnings at 40 / 50 ms).
- Accessibility: keyboard only through the list (arrows, `aria-current`),
  the bar, the in-place question and the dialogs, with a visible ring;
  200 % zoom with no horizontal scroll; dark Spanish and light English.
- `pnpm run check`: the first run stopped on TypeScript (the kept-side label
  indexed the branch names with `deleted`, fixed); the second passed with
  exit 0 (1,822 frontend tests; Rust 674 passed, 1 ignored).

# Review

2026-10-29, a code review of the audit's changes before closing:

- The race test wrote working files as long as the side that wins, so the
  winner's write could leave the size alone and move only the file time; on
  a disk with coarse times the second action could then pass revalidation
  and the test flake. The working files are now shorter than either side.
- No other finding: `file_in_use` keeps the write path's classification and
  only widens it to the journal's two reads; the uncertain-outcome dialogs
  still run the coordinated refresh; the kept-side label narrows `kept` to
  the two named sides.
