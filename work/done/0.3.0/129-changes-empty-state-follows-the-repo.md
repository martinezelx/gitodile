---
id: 129
title: The Changes empty state follows the repository state
status: done
priority: normal
type: improvement
areas:
  - frontend
  - accessibility
created: 2026-09-22
completed: 2026-09-22
parent:
queue:
---

# Goal

Replace the Changes tab's one-size "Nothing to review" block with a state that
reflects where the work actually is: clean but unpublished, clean with newer
remote work, fully settled, a local-only project, a project with no saved
versions yet, or a detached HEAD. Each situation gets its own headline, a
sentence that says what it means, one primary action when there is one, and at
most two secondary exits.

# User outcome

A reader who lands on Work with nothing to review is told what is next instead
of being left at a dead end. When four saved versions are still only local, the
pane offers to publish them; when the remote is ahead, it offers to bring those
changes in; when everything is settled, it says so and points at History. The
one action worth taking is the primary one, and the way to discarded work
survives the empty list.

# Context

Task 126 left the clean state as a fixed block — a check glyph, "Nothing to
review", "Back to Overview" and "Restore discarded changes…" — drawn in the diff
panel while the list panel repeated "Everything is saved. There is nothing to
review." It ignored the facts the screen already held: the branch's relation to
its upstream (`workingTree.upstream`) and the head state
(`project.headState`). The status bar could say "4 versions to publish" while
the pane in front of it offered only a trip back to Overview.

The design was prototyped first as a static mock on the desktop, away from the
repository, comparing the current block against the state-aware variant; that
variant is what shipped here.

# Scope

- A pure `getChangesEmptyState(workingTree, headState)` in the feature that maps
  the snapshot to `unborn · detached · no-remote · behind · ahead · up-to-date`.
  A diverged branch (ahead *and* behind) reports `behind`: publishing while the
  remote has newer work is not the safe next step.
- The Changes empty block is built from that state: headline, sentence, optional
  primary, up to two secondary actions, and the existing restore ghost when
  there are stored recoveries.
- New callbacks on `ChangesPanel` — `onGetChanges` (the previewed sync flow),
  `onOpenHistory` (the Work screen's History tab) — and the `headState` prop.
  `onNavigateOverview` and its "Back to Overview" button are removed.
- Both languages: new strings for every state's headline, sentence and action
  labels; `changesEmptyTitle`, `changesEmptyDescription` and
  `changesBackToOverview` are deleted.
- The list panel's state row shortens to "All changes are saved." so it stops
  echoing the block.

# Out of scope

- Any change to what the diff pane shows when there are files to review.
- A "Get back to your branch" action for the detached state (the offer is
  History only; switching branches stays on Branches and the status bar).
- New publish or sync machinery: the primary reuses `openPublishDialog` and
  `startSessionOperation("sync")` unchanged.

# Acceptance criteria

- [x] With a clean tree, the pane shows the state that matches the snapshot:
      unpublished (`ahead`), newer remote (`behind`), settled (`up-to-date`), no
      upstream (`no-remote`), no saved versions (`unborn`) or detached.
- [x] `ahead` offers "Publish N versions" as the primary and "Get project
      changes" / "View history" as secondary; `behind` leads with "Get project
      changes"; `no-remote` offers project settings; `unborn` offers none.
- [x] The primary action runs the existing previewed flows (publish dialog,
      sync operation); "View history" switches the Work screen to History.
- [x] A diverged branch reports `behind`, so publishing waits for the incoming
      work.
- [x] The one-run attention halo is the button's own motion and is disabled
      under `prefers-reduced-motion`.
- [x] The action glyphs sit at the label's scale, not lucide's 24px default.
- [x] Both languages are complete; the removed strings, the removed prop and the
      dead CSS are gone.
- [x] `pnpm run check:frontend`, `pnpm run check:docs` and `pnpm run check:rust`
      pass.

# Relevant files

- [`src/features/changes/emptyState.ts`](../../../src/features/changes/emptyState.ts)
- [`src/features/changes/emptyState.test.ts`](../../../src/features/changes/emptyState.test.ts)
- [`src/features/changes/ChangesPanel.tsx`](../../../src/features/changes/ChangesPanel.tsx)
- [`src/features/changes/ChangesPanel.test.tsx`](../../../src/features/changes/ChangesPanel.test.tsx)
- [`src/features/changes/changes.css`](../../../src/features/changes/changes.css)
- [`src/features/changes/translations.ts`](../../../src/features/changes/translations.ts)
- [`src/app/App.tsx`](../../../src/app/App.tsx)
- [`DESIGN.md`](../../../DESIGN.md)
- [`AGENTS.md`](../../../AGENTS.md)

# Dependencies

Builds on task 126, which moved the clean state into the diff panel and gave the
Work screen its Changes/History tabs.

# Decisions

- **Choose the state in one pure function.** `getChangesEmptyState` takes the
  snapshot the screen already holds and returns a discriminated union, so the
  branch lives in one tested place and the JSX only renders it. No new read and
  no new Rust command: `workingTree.upstream` and `project.headState` were
  already on hand.
- **The remote wins a divergence.** A branch that is both ahead and behind shows
  "Get project changes", because the safe next step is to integrate before
  publishing. The helper documents this and a test pins it.
- **Retire "Back to Overview".** It duplicated the rail and spent the pane's one
  strong-action slot; the natural exits are the actions the state offers, plus
  History one tab away. The Home/recovery case is covered by the restore ghost,
  which stays.
- **No new verbs.** "Publish" and "Get project changes" are already the app's
  words in the Journey band and the status bar; the pane reuses those flows and
  those labels rather than inventing a third way to say the same thing.
- **Motion stays one-shot.** The primary wears the Journey band's
  `attention-breathe` halo for a single 2.4s run on arrival — never a loop — and
  is off under `prefers-reduced-motion`, matching the empty states in Overview
  and the notification centre.

# Implementation notes

**Domain.** `src/features/changes/emptyState.ts` holds
`getChangesEmptyState(workingTree, headState)` and the `ChangesEmptyState` union.
`headState` is a local mirror of the repository's `HeadState` so the helper
carries no runtime import; it defaults to `"branch"`.

**Panel.** `ChangesPanel` takes `onGetChanges`, `onOpenHistory` and `headState`
and drops `onNavigateOverview`. A `useMemo` turns the chosen state into a
`ChangesEmptyContent` (title, description, primary, secondaries) with the icons
and handlers; the block renders it, keeping the `hasRecoveries` ghost last and
quietest. The list panel's state row now reads "All changes are saved.".

**Composition root.** `App.tsx` wires `onGetChanges` to
`startSessionOperation("sync")`, `onOpenHistory` to `openWorkbench("history")`
and `headState` to `project.headState`.

**Styling.** `.changes-empty` widens to 440px; the actions stack a primary, a
wrapping secondary row and the ghost, all using the house `primary-button`,
`secondary-button` and `ghost-button`. `.changes-empty__primary` runs
`attention-breathe` once; `prefers-reduced-motion` disables it. A scoped rule
sizes the action glyphs to 15px — un-sized they took lucide's 24px default and
outweighed the 13px label.

**Tests.** `emptyState.test.ts` covers all six states and the divergence rule.
`ChangesPanel.test.tsx` gains a "clean state" suite: publish leads when ahead
and calls the right callback, the remote-first case when behind, the settled
case, project settings when there is no remote, and the unborn and detached
headlines. The pre-existing restore-door test now expects the no-remote
headline.

**Design mock.** The state-aware layout was first drawn as a self-contained
HTML mock outside the repository, comparing the old block against this variant
and previewing every repo state; it is not part of the source tree.

# Validation

- `pnpm run check:frontend` — architecture check (395 modules), `tsc -b`,
  **913 frontend tests** across 94 files, `vite build`.
- `pnpm run check:docs` — passes with this task in `done/`.
- `pnpm run check:rust` — `cargo fmt --check`, `cargo clippy -D warnings`,
  Rust tests. No Rust source changed; recorded for the aggregate gate.
- New tests: `getChangesEmptyState` (7) and the ChangesPanel clean-state suite
  (6) plus the updated no-remote assertion.
