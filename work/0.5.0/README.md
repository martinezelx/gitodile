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

| Queue | Task | Scope |
| --- | --- | --- |
| 01 | [227 — One public repository](227-one-public-repository.md) | Rename the code repository to `gitodile` and bring in issues, releases and the update feed, keeping installed builds updating. |

The maintainer requested an additional frontend review on 2026-10-31 after
closing the original implementation phase. Its applied refinements ship in
0.5.0; the rest of [213](../0.5.1/213-frontend-flow-and-visual-review.md) moved
to 0.5.1 on 2026-11-13, so that 0.5.0 proves the update path first.

The maintainer closed the implementation phase on 2026-10-31 under
[ADR 0042](../../docs/adr/0042-propose-platform-qualification-carryover-for-050.md).
The [closure matrix](../assets/0.5.0-closure/closure-audit.md) maps the exact
criteria, Windows evidence and external qualification formally carried to
065-8 (Linux) and 065-10 (macOS). Those tests are still unexecuted and their
original criteria remain unchecked in the completed epics.

Done: [221 — One home for app updates](../done/0.5.0/221-one-home-for-app-updates.md),
Settings › Updates as the one place the update is handled, a dot and a
next-step label on More actions, What's new folded into that section and the
changelog and update dialogs retired except for a wrong-version restart;
[220 — Issue report copy and finish](../done/0.5.0/220-issue-report-copy-and-finish.md),
one action that copies the report and opens GitHub, a finish step for the paste
and a paste reminder in the form;
[219 — Console mascot motion](../done/0.5.0/219-console-mascot-motion.md),
the drawing's move to the watermark and back, rain through the whole column,
a blink per command and the project's own version ids as rain;
[218 — Diff capsule refinements](../done/0.5.0/218-diff-capsule-refinements.md),
a rounded arrival contour and softened fragment marks;
[217 — Diff capsules and joined replacements](../done/0.5.0/217-diff-capsules-and-joined-replacements.md),
one filled or outlined capsule per change run in text diffs and Markdown, with
a blended join from a removal into its addition;
[216 — Project switching freshness and console state](../done/0.5.0/216-project-switching-freshness-and-console-state.md),
watcher restart ordering, trailing status reads, active branch identity, explicit
empty startup selection and retained console sessions;
[215 — Text diff detail and orientation](../done/0.5.0/215-text-diff-detail-and-orientation.md),
exact fragments, visible changed spacing, comparison headings and navigation cues;
[214 — Text diff bars and tint](../done/0.5.0/214-text-diff-bars-and-tint.md),
the approved solid/dashed markers in Changes and History;
[065-4-5](../done/0.5.0/065-4-5-integration-audit.md), the complete Windows
integration audit, traceability matrix and safety fixes;
[065-4-4](../done/0.5.0/065-4-4-get-diverged-overlaps.md), Get project changes
hands saved upstream overlaps to the resolver without publishing;
[065-4-3](../done/0.5.0/065-4-3-bring-in-changes-dialog.md), the branch integration
dialog, entries and selected-source remote check;
[065-4-2](../done/0.5.0/065-4-2-pause-on-overlaps.md), durable initiation of
real overlapping merges in Rust;
[065-4-1](../done/0.5.0/065-4-1-bring-in-changes-core.md), bringing in
another branch when nothing overlaps, in Rust;
[037-1](../done/0.5.0/037-1-conflict-domain-and-recovery.md), conflict truth,
recovery, and how detected overlaps become sessions;
[037-3](../done/0.5.0/037-3-read-only-conflict-workspace.md), the read-only
overlapping-changes screen;
[037-6-1](../done/0.5.0/037-6-1-resolution-core.md), the Rust commands that keep a
side, mark a file resolved and reset it, with the resolution journal;
[037-6-2](../done/0.5.0/037-6-2-resolution-actions-ui.md), those actions on the
overlapping-changes screen;
[037-6-3](../done/0.5.0/037-6-3-editor-and-hard-classes.md), the user's editor,
reconciliation and the blocked classes;
[037-5](../done/0.5.0/037-5-complete-or-abort-merge.md), finishing or abandoning
the merge;
[037-7](../done/0.5.0/037-7-conflict-workflow-audit.md), the independent audit of
the whole workflow on Windows.

Completed epics: [065-4 integrate branches](../done/0.5.0/065-4-integrate-branches.md), split into
five children, all done;
[037 resolve overlapping changes](../done/0.5.0/037-guided-conflict-resolution.md),
with [037-6 resolve each file](../done/0.5.0/037-6-resolve-files.md) split into three
slices, all done. The 037-7 audit passed
every implemented workflow on Windows; the closure follow-up additionally
records actual NVDA speech generation, active forced colours/motion and
native zoom, correcting two accessibility defects. The remaining platform
criteria stay unchecked. Accepted [ADR 0042](../../docs/adr/0042-propose-platform-qualification-carryover-for-050.md)
applies ADR 0006/0011 explicitly to these epics, retaining Linux
qualification with 065-8 and macOS with 065-10. The epics are in `work/done/`
with their completion date and explicit qualification carryover. No later
version is started and no release is prepared or authorized by phase closure.
Windows evidence is not a release-readiness claim for other environments.

## Exit condition

Clean and conflicting collaboration complete without a terminal. Rebase and
force push remain excluded.

Implementation exit condition met on 2026-10-31 with the accepted platform
qualification carryover. Version `0.5.0` has not been published by this work.
