# 0.5.0 — Collaboration complete

Roadmap gate: [Gate 2](../../docs/ROADMAP.md#gate-2--complete-collaboration-and-overlaps-050).

## Goal

Both the clean and the conflicting collaboration paths finish inside
GitOdile: overlapping changes are resolved at GitHub Desktop level (keep one
side per file or edit it in the user's editor) without silent data loss, and
local branches and diverged project changes can be integrated with a preview.

The three-pane conflict editor is not part of this version; it is epic
[206](../after-1.0/206-three-way-conflict-editor.md) after `1.0.0`.

## Queue

| Queue | Task | Outcome |
| --- | --- | --- |
| 01 | [037-6-3](037-6-3-editor-and-hard-classes.md) | The user's editor, reconciliation and the blocked classes |
| 02 | [037-5](037-5-complete-or-abort-merge.md) | Finish or abort a merge |
| 03 | [037-7](037-7-conflict-workflow-audit.md) | Audit the conflict workflow |
| 04 | [065-4](065-4-integrate-branches.md) | Integrate local branches and diverged project changes |

Done: [037-1](../done/037-1-conflict-domain-and-recovery.md), conflict truth,
recovery, and how detected overlaps become sessions;
[037-3](../done/037-3-read-only-conflict-workspace.md), the read-only
overlapping-changes screen;
[037-6-1](../done/037-6-1-resolution-core.md), the Rust commands that keep a
side, mark a file resolved and reset it, with the resolution journal;
[037-6-2](../done/037-6-2-resolution-actions-ui.md), those actions on the
overlapping-changes screen.

Epics: [037 resolve overlapping changes](037-guided-conflict-resolution.md),
with [037-6 resolve each file](037-6-resolve-files.md) split into three
slices, the first two done.

## Exit condition

Clean and conflicting collaboration complete without a terminal. Rebase and
force push remain excluded.
