# Completed work — 0.5.0

25 completed task records. IDs, parent relationships, completion dates
and accepted deferred criteria are preserved.

## Version evidence

These tasks belong to `release/0.5.0`, after preparation commit `53ec2bb`.
The implementation and audit children are retained at `73714cc`; the three
parent epics closed on 2026-10-31 under accepted
[ADR 0042](../../../docs/adr/0042-propose-platform-qualification-carryover-for-050.md).
Their external qualification criteria remain unchecked. Task 212 was completed
ahead of the queue in this same version. Task 214 extends those marks to all
text diffs on the same release branch on 2026-11-02. Task 215 adds the approved
fragment detail, changed spacing, comparison headings and navigation cue on
that same date and branch. Task 216 hardens project switching and retains console
sessions on the same release branch and date. Task 217 replaces task 214's
bars with capsules and joined replacements on that same date and branch, and
task 218 aligns the arrival contour and fragment marks after it. Task 219 moves the
console mascot between the welcome and the watermark on the same date and branch.
Task 220 has the issue report copy and open GitHub in one action and guide the
paste, on the same branch on 2026-11-03. Task 221 gives application updates
one home in Settings, and task 222 keeps the glyph tones apart and drops the
open folders' change dots, on the same branch and date. This archive records completed
implementation, not publication of 0.5.0. See the
[version closeout](../../0.5.0/README.md) and
[qualification matrix](../../assets/0.5.0-closure/closure-audit.md).

## Tasks

| ID | Completed | Task |
| --- | --- | --- |
| 037 | 2026-10-31 | [Resolve overlapping changes at GitHub Desktop level, safely](037-guided-conflict-resolution.md) |
| 037-1 | 2026-10-28 | [Establish conflict truth and durable recovery](037-1-conflict-domain-and-recovery.md) |
| 037-3 | 2026-10-28 | [Add the read-only conflict workspace](037-3-read-only-conflict-workspace.md) |
| 037-5 | 2026-10-29 | [Complete or abort a conflicted merge safely](037-5-complete-or-abort-merge.md) |
| 037-6 | 2026-10-31 | [Resolve each overlapping file by side or in the user's editor](037-6-resolve-files.md) |
| 037-6-1 | 2026-10-29 | [Choose a side, mark resolved and reset a file in Rust](037-6-1-resolution-core.md) |
| 037-6-2 | 2026-10-29 | [Put the resolve actions on the overlapping-changes screen](037-6-2-resolution-actions-ui.md) |
| 037-6-3 | 2026-10-29 | [Open overlapping files in the user's editor and block the hard classes](037-6-3-editor-and-hard-classes.md) |
| 037-7 | 2026-10-29 | [Audit the complete conflict workflow](037-7-conflict-workflow-audit.md) |
| 065-4 | 2026-10-31 | [Integrate branches and diverged project changes safely](065-4-integrate-branches.md) |
| 065-4-1 | 2026-10-29 | [Plan and bring in another branch's changes in Rust](065-4-1-bring-in-changes-core.md) |
| 065-4-2 | 2026-10-30 | [Turn overlaps into a paused merge that task 037 resolves](065-4-2-pause-on-overlaps.md) |
| 065-4-3 | 2026-10-30 | [Bring in changes from another branch on screen](065-4-3-bring-in-changes-dialog.md) |
| 065-4-4 | 2026-10-30 | [Resolve a diverged upstream's overlaps from Get project changes](065-4-4-get-diverged-overlaps.md) |
| 065-4-5 | 2026-10-30 | [Audit the integration workflow end to end](065-4-5-integration-audit.md) |
| 212 | 2026-10-29 | [Fit the status bar's project initials and mark Markdown changes by bar and tint](212-status-bar-avatar-and-markdown-change-signs.md) |

| 214 | 2026-11-02 | [Mark all text diffs by bar and tint](214-text-diff-bars-and-tint.md) |

| 215 | 2026-11-02 | [Show exact text changes, changed spacing and comparison context](215-text-diff-detail-and-orientation.md) |
| 216 | 2026-11-02 | [Keep project switching fresh and preserve console sessions](216-project-switching-freshness-and-console-state.md) |
| 217 | 2026-11-02 | [Mark diff runs with capsules and join replacements](217-diff-capsules-and-joined-replacements.md) |
| 218 | 2026-11-02 | [Align diff navigation and fragment marks with the capsules](218-diff-capsule-refinements.md) |
| 219 | 2026-11-02 | [Move the console mascot between the welcome and the watermark](219-console-mascot-motion.md) |
| 220 | 2026-11-03 | [Issue report copies, opens and guides the paste](220-issue-report-copy-and-finish.md) |
| 221 | 2026-11-03 | [Give application updates one home in Settings](221-one-home-for-app-updates.md) |
| 222 | 2026-11-03 | [Keep glyph tones apart and spend colour once](222-colour-system-review.md) |

Archive organization and assignment rules are in [work/README.md](../../README.md).
