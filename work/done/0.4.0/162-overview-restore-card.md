---
id: 162
title: Overview's discard card appears whenever everything is saved, and restores in place
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
created: 2026-10-12
completed: 2026-10-12
parent:
queue:
---

# Goal

Make Overview's "Discarded changes" card dependable and calm: show it whenever
everything is saved and a discard can really be restored, open the restore
picker over Overview instead of sending the user to Changes, and dress the card
like the scene above it ("up to date").

# User outcome

With everything saved and a discard still restorable, Overview offers it under
the scene, whether or not versions are waiting to be published or got.
Pressing "Restore" opens the restore picker on top of Overview. Closing it
without restoring leaves the user on Overview. Restoring moves on to Changes,
which shows the files that came back and reports "N files restored" in its
header. The card looks like a sibling of the scene card.

# Context

The card was drawn only in the side column's calm mode (`!card`). It
disappeared while a publish or get detail card was showing, even though
everything was saved. Its button set an intent and navigated to Changes, whose
own discard dialog opened the picker there. Closing that picker left the user
on Changes, a screen they had not asked for.

The card also read only Rust's `latest` pointer (`get_discard_recovery`). A
record stays stored after it is restored, and it stops being restorable once
the project moves past it (for example, once the restored files are saved). The
card then still offered "Restore", and the picker opened with nothing to pick.

# Scope

- `OverviewDetail` shows the card whenever `journey.changes.state` is `clean`
  and a restorable discard exists. Under a detail card it takes a compact,
  bordered variant (`overview-restore--compact`), like the small scene.
- The card's styles follow `.work-scene`: the same surface, radius, shadow and
  entrance animation, with an amber radial wash. Its icon sits in a tile like
  the scene's places. It is sized to keep its title on one line in the 290px
  column.
- `App` owns an Overview restore dialog: the same lazily loaded
  `DiscardChangesDialog` chunk, warmed after first paint with Publish. It
  claims the session's mutation slot like the Changes flow.
  - Closing it releases the slot, re-reads Overview's card (forgetting a copy
    changes no file, so no watcher reports it), and bumps a revision so the
    "Restore discarded" button in Changes' empty state is read again.
  - A finished restore hands its outcome to Changes (`restoredElsewhere`) and
    opens the Work screen's Changes tab.
- `ChangesPanel`'s `restoreIntent` (open the picker on arrival) is replaced by
  `restoredElsewhere` (report a restore another screen ran) and
  `recoveriesRevision`.
- The card's hint describes the one restorable copy ("1 file · 10 days ago").
  When there are several, a badge on the icon counts them (like the scene's
  badges, and read out for assistive technology) and the hint dates the newest
  ("latest 10 days ago"). Files are not added up across copies, because copies
  can share files.
- The work-detail port becomes `findRestorableDiscard`. `App` answers it from
  `list_discard_recoveries` through `newestRestorableDiscard`, only while the
  active tree is clean, and re-reads when the tree turns clean.
- `DESIGN.md`'s Overview paragraph describes the card and the in-place picker.

# Out of scope

- The restore picker itself (`DiscardChangesDialog`), its copy and its
  forget flow.
- Changes' own empty-state "Restore discarded" button. It still appears for any
  stored copy, restorable or not, because Changes owns the full list, including
  copies that can only be forgotten.
- Rust: the commands already listed every record with its availability.

# Acceptance criteria

- [x] The card appears whenever everything is saved and a restorable discard
      exists, including under the publish and get detail cards.
- [x] The card never appears over unsaved work or conflicts.
- [x] A stored discard that is no longer restorable is not offered; an older
      restorable one is offered instead.
- [x] "Restore" opens the picker over Overview; closing it without restoring
      stays on Overview.
- [x] A restore moves to Changes and reports what came back.
- [x] Forgetting copies from Overview's picker refreshes Overview's card and
      Changes' empty-state button.
- [x] With several restorable copies, the hint counts them instead of
      showing one copy's files as if it were the total.
- [x] The card matches the scene card's look, with a compact variant under a
      detail card, and its title fits on one line at the column's width.
- [x] Tests cover visibility, the restorable selection, the Changes report and
      the cross-screen flow.
- [x] DESIGN.md describes the behavior.
- [x] `pnpm run check` run and recorded.

# Relevant files

- [Overview side column](../../../src/features/overview/OverviewDetail.tsx) and [its tests](../../../src/features/overview/OverviewDetail.test.tsx)
- [Work detail controller](../../../src/features/overview/workDetail.ts) and [its tests](../../../src/features/overview/workDetail.test.ts)
- [Overview styles](../../../src/features/overview/overview.css)
- [Changes panel](../../../src/features/changes/ChangesPanel.tsx) and [its tests](../../../src/features/changes/ChangesPanel.test.tsx)
- [Changes feature index](../../../src/features/changes/index.ts)
- [App composition root](../../../src/app/App.tsx) and [its tests](../../../src/app/App.test.tsx)
- `DESIGN.md` (Overview)

# Dependencies

None.

# Decisions

- **The dialog lives in the composition root, not in Overview.** It needs the
  session's mutation slot, the phase reporting and the post-mutation refresh
  that `App` already wires for Save, Publish and Get. Overview stays a pure
  view with one callback.
- **Hand the outcome to Changes rather than drop it.** A restore from Overview
  ends on Changes with the same header notice a restore run there would show.
  The two flows cannot report differently.
- **Restorable, not newest.** Overview offers only what the picker can apply.
  Changes keeps offering every stored copy, because its picker is also where
  stale copies are forgotten.
- **Read availability only while clean.** Telling which copies still apply
  reads `git status` and hashes every changed file. The card is hidden with
  unsaved work, so that read is skipped then. An effect on the tree turning
  clean covers the case where the watcher's read ran before the status landed.
- **Lazy, but warmed.** AGENTS.md prefers eager overlays. This dialog shares a
  chunk with Changes, which already loads it lazily, and it is warmed with
  Publish after first paint, so the click does not wait on a chunk load in
  practice.

# Implementation notes

- Review before committing found the stale-`latest` problem and the stale
  "Restore discarded" button in Changes after forgetting from Overview. Both
  are fixed above.
- Testing in the app showed "1 file · 10 days ago" while the picker held
  copies with many more files. The hint described only the newest
  restorable copy and read as a total. It first became "10 copies · latest 10
  days ago", which wrapped to two lines in the 290px column. The count moved to
  a badge on the icon. Measured at 290px, the longest hints ("la última hace 23
  horas", "latest 23 hours ago") fit on one line, and so does
  "12 archivos · hace 45 min" (122 of 123px). A single copy with three-digit
  file counts could still wrap.
- A throwaway browser harness rendered both card variants at 290px in the dark
  theme. It was deleted before committing. The light theme did not apply in
  the harness, so that variant was not seen.

# Validation

- `pnpm run check`, 2026-10-12: documentation (296 files, 212 task ids),
  app-update contract, release highlights, frontend architecture (588
  modules), TypeScript, Vitest (139 files, 1440 tests) and the production
  build passed. `cargo fmt --check` and Clippy passed. `cargo test
  --all-targets` could not start because the running development app held
  `src-tauri/target/debug/gitodile.exe` (`Acceso denegado`, os error 5). No
  Rust file changed.
- Not yet exercised in the running Tauri app.
