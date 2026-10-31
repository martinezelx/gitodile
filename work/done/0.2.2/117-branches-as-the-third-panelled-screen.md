---
id: 117
title: Make Branches the third panelled screen, and let it manage a branch honestly
status: done
priority: normal
type: improvement
areas:
  - frontend
  - rust
  - accessibility
created: 2026-09-07
completed: 2026-09-07
parent:
queue:
---

# Goal

Bring Branches into the shape tasks 112–116 gave Changes and History, and fix what
the screen was getting wrong about the branches it lists: it advertised deletions
Git would refuse, offered to delete the project's main branch, left the published
copy behind, and had no way to rename anything.

# User outcome

Branches opens on the same header row and the same panel pair as the two screens
beside it, so switching between the three moves nothing that is meant to stay
put. The list is a column of names; the branch the reader chooses gets a detail
panel with its recent saved versions, what it means relative to the remote and
the active branch, and the three things you do to a branch — switch, rename,
delete — together on one row.

Deleting a branch now does what it says. If the screen calls a branch safe to
delete, the delete succeeds; if it cannot, the dialog explains why rather than
failing on the way out. A published branch offers to clear its remote copy away
too, so the branch does not linger on everyone else's screen. The project's main
branch is never offered for deletion or renaming.

# Context

Branches was the last screen still on the pre-112 shape: wide horizontal cards, a
row of buttons per branch, an `ACTIVE branch` card of its own, and sort and filter
controls floating above the list. It read as a different product from the two
screens it sits between in the rail.

Underneath, three things were wrong rather than merely unfashionable.

**The screen promised deletions Git refuses.** `git branch -d` accepts a branch
merged into HEAD or into its own upstream, and nothing else. This app calls a
branch safe when its tip is reachable from *any* other local or remote-tracking
ref, which is the question that actually decides whether work can be lost. A
feature branch already merged and published, beside a local `main` that has not
been pulled yet, satisfies the second and not the first — so the row said "Safe
to delete", the dialog agreed, and Git then said no.

**`main` was offered for deletion.** Technically true — `origin/main` holds its
work, so nothing would be lost — and terrible advice.

**The delete never touched the remote.** `DeleteBranchPlan` carried an
`upstream` field that nothing read. Deleting a finished branch left it published.

# Scope

- Rebuild Branches as `.screen-header` over a list panel and a detail panel, off
  `--panel-column`, `--strip-height` and the breakpoints Changes and History
  already read; retire the standalone active-branch card, the section headings and
  the external sort/filter controls.
- Fold search, the state and name-prefix filters and the sort into the one strip
  control the History timeline uses.
- Add a read-only `get_branch_history` for the selected branch, and use it
  for its recent versions, its saved-version count, and the tip's author.
- Add `plan_rename_branch` / `rename_branch`.
- Report the remote's default branch in the inventory, and refuse to delete or
  rename it.
- Make the delete's promise and its execution agree, and offer to delete the
  published copy alongside the local one.
- Put Switch, Rename and Delete on one row in the detail header, and behind a
  right-click on any row.
- Promote what a third consumer earned: the context-menu surface, the relative
  time formatter, the card fill.

# Out of scope

- A branch's creation date. Git keeps no such field; the reflog that hints at
  it is local and prunable, so `Created` is absent rather than estimated.
- Renaming the published copy. That is a delete-and-push on the remote and a
  separate decision; the rename says so and leaves the upstream alone.
- Virtualizing the list. Rust caps it at 300 and the new rows are lighter than
  the ones they replace, so this is unchanged from before.
- Opening History scoped to one branch. History follows HEAD, and the detail's
  copy says so rather than promising a per-branch view that does not exist.

# Acceptance criteria

- [x] Branches, Changes and History open on the same header row: same height, same
      inset, caption on the title's branch.
- [x] The list is one panel with one strip; the detail panel describes the
      selected branch and the active branch is selected on arrival.
- [x] Search, filters and sort share the strip's one control; the state filters
      are the states the rows can show.
- [x] Rows carry no actions and at most two chips; no row's content overflows
      its box.
- [x] A branch the screen calls safe to delete deletes; one it cannot explains
      why before anything runs.
- [x] A published branch offers to delete its remote copy, on by default, and the
      outcome of each half is reported separately.
- [x] The remote's default branch shows why, and offers neither rename nor delete.
- [x] Switch, Rename and Delete appear together in the detail header and on a
      right-click, and neither surface offers what the other refuses.
- [x] The detail renders whole when the per-branch history read is absent or
      fails.
- [x] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/branches.rs`
- `src-tauri/src/ipc.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/application.rs`
- `src-tauri/src/error.rs`
- `docs/architecture/025-ipc-contract.json`
- `src/features/branches/BranchesPanel.tsx`
- `src/features/branches/BranchesDialog.tsx`
- `src/features/branches/BranchContextMenu.tsx`
- `src/features/branches/branchActions.ts`
- `src/features/branches/controller.ts`, `domain.ts`, `port.ts`,
  `tauriAdapter.ts`, `branches.css`, `translations.ts`
- `src/shared/ui/contextMenu.tsx`, `src/shared/ui/primitives.css`
- `src/shared/i18n/formats.ts`
- `src/styles/tokens.css`
- `src/features/changes/ChangesContextMenu.tsx`

# Dependencies

Builds on tasks 112–116, which made the two screens agree and moved the measures
that hold them together into `tokens.css` and `primitives.css`. This screen adds
nothing to that set; it reads it.

# Decisions

**Git's refusal stays the outer net, and `-D` answers only the one case we have
proved.** `git branch -d` runs first, always. A `not fully merged` refusal — and
only that one — is answered with `-D`, after `validate_and_prepare_delete` has
just re-proved that another ref reaches the tip and the state token has
confirmed nothing moved since the preview. Every other refusal stands. The
alternative was to narrow the screen's own definition of "safe" to Git's, which
would have marked most merged feature branches undeletable for a reason the user
cannot see and did not cause.

**The remote deletion is a checkbox, on by default.** Deleting a branch only here
leaves it on everyone else's screen, which is what made "delete this branch" half
true. It is not a silent side effect, because it changes what the team sees; the
note under it changes with the state, and the two halves are reported
separately, because a remote that refuses does not un-delete the local branch.

**The default branch is read from `refs/remotes/<remote>/HEAD` or not at all.**
`init.defaultBranch` is a global preference for repositories yet to be created,
and `main`/`master` is a guess. A project with no remote HEAD — one created
locally and pushed, where `git clone` never wrote it — protects nothing, rather
than protecting on a corridor of guesses. Recorded as a known limit.

**The per-branch history is read on selection and cached by tip.** The inventory
deliberately stops at each branch's tip, because going deeper costs one Git
process per branch on every refresh. This asks for one branch — two processes —
and caches the answer under the branch's tip commit, so returning to the screen
renders from the session cache and asks Git nothing. That is what keeps it
inside "never fetch merely because a screen became visible": the read is caused
by data being needed for the first time, not by visibility.

**Delete came out of the `⋯` menu.** A `⋯` reads as "advanced", when deleting is
one of the three ordinary things you do to a branch — and it put the only
destructive action one step further from the explanation of whether it is safe.
It sits with the other two now, distinguished by colour and only under the
pointer, so the row reads as three ordinary actions at rest.

**One module decides which actions apply, and what Delete is called.**
`branchActions.ts`. Two surfaces offer these actions and they had already drifted:
the right-click menu labelled every Delete "its saved work is already kept
somewhere else", which is the opposite of the truth for a branch whose work lives
nowhere else. Neither surface decides it any more.

**The header gave up its sentence.** Branches explained itself under the title,
which was the one thing making its header taller than the other two. A screen
reached from a rail that already names it does not need to introduce itself on
every visit. The explanation's remaining home would be the empty state, which is
noted as a follow-up rather than done here.

**The version strip draws what is known and nothing else.** One node per version
the history call returned, oldest at the left, plus a faded node for "and older
ones". With no history loaded there is no rail at all, because a lone dot
standing in for a sequence this screen cannot see is a picture of a guess.

# Implementation notes

Promoted to shared, each on ADR 0003's bar:

- `ContextMenuSurface` in `shared/ui` — the positioning, dismissal, focus and
  keyboard behaviour of a menu pinned to the pointer. Changes and its diff had
  it written once between them and History borrowed the whole component to get
  it; branches needed the same mechanics for entirely different items.
  `ChangesContextMenu` keeps its props and its two item sets, so Changes and
  History are untouched.
- `formatRelativeTime` in `shared/i18n` — `formatHistoryDate` delegates to it
  rather than keeping a second unit ladder.
- `--surface-card` in `tokens.css` — the fill of a card inside a panel, which
  `history.css` had written twice as a `color-mix` recipe.

Two defects found while verifying rather than by test:

**The context menu overhung the viewport edge.** It measured its own width where
the pointer left it — a menu 4px from the right edge has 4px to lay its labels
out in, wraps them, and reports a narrower box than it will occupy once moved
back inside. It parks at the safe origin, measures, then clamps. Measured after:
`right: 1392` and `bottom: 872` in a 1400×880 viewport, exactly the 8px margin.
This came from the original Changes implementation, so the fix reaches all three
screens. Not covered by a test: jsdom does not lay out, so every box measures 0.

**List rows overlapped.** `.branch-row` had a `min-height` but the default
`flex-shrink`, and a column flex container resolves an overflowing list by
squashing its items to that minimum — leaving a 66px box with 106px of content
spilling over the row below. `flex: 0 0 auto` makes the scroller scroll instead.

Reviewed before committing, and three more things changed: the Delete label bug
above; the post-rename selection, which found the renamed branch by tip commit and
would have picked the wrong one of two branches sharing a tip (the dialog reports
the new name now); and `closeContextMenu`, which focused inside a state updater
React may call twice and changed identity every render, re-subscribing the
menu's dismissal listeners on every keystroke in the search box.

Verified in a throwaway Vite harness rendering the panel from fixtures, at 1400,
1120 and 900px, light and dark, with an active branch, a default branch, a branch held
by another worktree, a local-only branch and an undeletable one. Header geometry
measured against Changes and History rendered on the same page:

| | Changes | History | Branches |
| --- | --- | --- | --- |
| Header height | 38px | 38px | 38px |
| Heading block | 26.4px | 26.4px | 26.4px |
| Title inset | 24px | 24px | 24px |

Rows measure 66px for the active branch and 85px for the rest, with no overflow on
any of them.
