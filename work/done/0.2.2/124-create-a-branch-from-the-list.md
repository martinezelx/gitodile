---
id: 124
title: Create a branch from the list, alongside the full dialog
status: done
priority: normal
type: feature
areas:
  - frontend
created: 2026-09-09
completed: 2026-09-09
parent:
queue:
---

# Goal

A second, faster way to create a branch without leaving Branches or
opening the "New branch" dialog — a compose box docked at the foot of
the list, closed until it is used, the same pattern task 123 gave Changes for
saving. "New branch" in the header keeps opening the full dialog; the two
coexist rather than one replacing the other.

# User outcome

The common case — type a name, create it, land on it — no longer costs a
modal. Typing into the list's own footer and pressing the button (or Enter)
is enough; the box opens itself on focus and folds back to one row when it
is not in use. "New branch" still opens the full dialog for the cases that
want it: a branch branched from an earlier saved version, or simply a reader's
habit.

# Context

Task 123 gave Changes a quick commit box docked under the file list. The user
asked for the equivalent on the Branches screen: create a branch inline
from the list, without giving up the header button's full dialog. Two
questions had to be settled before writing any code, both resolved with the
user directly rather than guessed:

- **Where does it live?** Not inside `BranchQuickSwitch` (the branch
  picker in the status bar and Overview, which the user first described as
  "el componente de eleccion de ramas") — the user chose docking it in the
  Branches list itself, the same slot `QuickCommitBox` occupies in Changes.
- **Does it replace "New branch"?** No. The user was explicit: both controls
  stay, "que convivan los dos."

That second answer matters more than it first looks. `CreateBranchPlan`
almost always carries `requiresConfirmation: true` (`will_switch ||
has_unsaved_work` in `branches.rs`, and the default here is to switch),
and `QuickCommitBox`'s own precedent — skip the plan/confirm screen, go
straight from `plan` to `save` — means this box switches `HEAD` on the common
path without ever showing that confirmation. Creating a branch is a purely
local, always-reversible mutation ("No files, saved versions, or other
branches are changed by creating this one" — the plan's own recovery
text), so skipping the preview is safe the same way it is for save. But
*switching* to the new branch is exactly the kind of `HEAD`-moving mutation
`BranchesPanel` already serializes across sessions sharing a Git
directory (`onOperationStart`/`onOperationFinish`, the same lock
`SwitchBranchDialog` and every other branch mutation on this screen
takes). `QuickCommitBox` never needed that lock — saving a version never
moves `HEAD`. This box does need it, and is the one place the two "quick
box" siblings genuinely diverge in behavior, not just in fields.

# Scope

- `BranchQuickCreateBox` (new): a name field, and one foot row holding a
  "Switch to it" toggle (hidden and forced on for a detached `HEAD`, same as
  the dialog's `forceSwitch`) beside the Create button — the same row shape
  `QuickCommitBox` uses for "Also publish" beside Save, right down to reusing
  the shared `.toggle-switch` control instead of the dialog's own checkbox,
  so the two quick boxes read as one vocabulary. Docked under the Branches
  list's scroll region in `BranchesPanel`.
  - Closed by default; opens on focus, closes on blur unless there is a
    typed name or a create in flight.
  - A dismiss control (and Escape) clears the draft and closes it.
  - Calls `branchesPort.planCreate` → `create` directly (the same pair
    `CreateBranchDialog` calls), skipping the plan/confirm screen — the
    fast path, same reasoning as `QuickCommitBox`.
  - Takes the screen's existing cross-session mutation lock
    (`onOperationStart`/`onOperationFinish`/`onOperationPhaseChange`) around
    the request itself (not merely while the box is expanded), and holds it
    across a failed attempt so a retry does not have to re-win it.
  - When the repository's default branch and the project's active branch are
    different commits, a small "Create from" row — a two-option segmented
    control (`Main branch` / the active branch's own name, reusing the shared
    `.segmented-control` primitive Settings already uses) — lets the reader
    pick which one the new branch starts from, defaulting to the active branch —
    which is what this box always started from anyway before this choice
    existed. Deliberately the *active* branch, not whichever row merely has
    detail focus in the list behind this box: an earlier version compared
    against the list's own `selected` state instead and was changed after
    review — browsing another branch's detail without switching to it must not
    silently change what a new branch branches from. Absent entirely when
    there is no real difference to name (equal commits, either side unknown,
    or a detached `HEAD` — see the safety note in Decisions).
  - Absent on an unborn `HEAD`, the same condition that already hides the
    header's "New branch" button.
  - Inline error on failure; inline success naming the branch and whether the
    project switched to it.
- `useScrollAnchoredResize` (new, `shared/ui`): the scroll-position
  correction `QuickCommitBox` implemented for task 123, extracted so this
  box can reuse it verbatim (ADR 0003's two-consumer bar). `QuickCommitBox`
  itself now calls the shared hook instead of carrying its own copy;
  behavior is unchanged, verified by its own existing test suite passing
  unmodified.
- New EN/ES strings for the box's own name field (placeholder included —
  `feature/new-feature`, without the dialog's "e.g." prefix) and switch
  toggle — deliberately not reused from `createBranch*`'s name label,
  since the box and the full dialog can be mounted at the same time and
  sharing an accessible name across two live controls is ambiguous to a
  screen reader and to a query alike (`getByLabelText("Name")` would match
  two elements once both exist together — caught by the pre-existing dialog
  test in `BranchesPanel.test.tsx`, which exercises exactly that
  combination). The confirm button keeps the dialog's own short visible text
  ("Create") but carries a distinct `aria-label` ("Create branch") so its
  accessible name still does not collide with the dialog's button while the
  row stays as narrow as "Switch to it" plus the button needs.

# Out of scope

- Removing the header's "New branch" button. Explicitly rejected by the user.
- Branching from an earlier saved version (`startVersion`). That is
  History's own entry into branch creation; the box only ever starts from
  wherever the project currently stands, same as `QuickCommitBox` only ever
  saves the current working tree.
- A visible plan preview inside the quick box. Same trade as task 123: the
  planner still runs (for its `stateToken`), nothing shows what it returns
  before creating.
- Adding the mutation lock to `QuickCommitBox`. Considered, since it would
  make the two boxes more symmetrical, and rejected: saving a version never
  moves `HEAD`, so it is not the mutation the lock exists to serialize, and
  adding it there would be scope this task was not asked to touch.

# Acceptance criteria

- [x] The quick create box renders docked under the Branches list, collapsed to
      one row, whenever `HEAD` is not unborn.
- [x] It expands on focus and collapses on blur when empty; a typed name or
      a create in flight keeps it open.
- [x] Its dismiss control and Escape both clear the draft and collapse it;
      neither works mid-create.
- [x] The mutation lock is held only for the duration of a live
      `plan`/`create` request — released immediately on both success and
      failure — never left standing through an error state with no visible
      dialog to explain the hold (see Decisions).
- [x] Creating calls `plan_create_branch` then `create_branch`
      with the typed name, shows an inline success branch naming the result,
      clears the draft, and hands the returned snapshot to the same
      `handleMutated` path the dialogs use.
- [x] "Switch to it" is a toggle, on by default, sharing the same row as the
      Create button (like `QuickCommitBox`'s publish toggle and Save
      button); on a detached `HEAD` it is hidden and forced on, with the
      same explanatory note the dialog shows.
- [x] Create is disabled with an empty name.
- [x] Another session's mutation lock refuses the create silently, the same
      way `openDialog` already refuses to open the header's dialog in that
      case.
- [x] The header's "New branch" button and its full dialog are unchanged and
      still reachable.
- [x] The box starts the new branch from the project's active branch by
      default; when the default (main) branch differs, a two-option segmented
      control lets the reader start from that branch instead, and the choice
      is invisible when there is nothing to choose between. Clicking either
      option never collapses the box, even with no name typed yet.
- [x] On a detached `HEAD` the source choice never appears and the create
      always starts at the exact commit the project is standing on,
      regardless of the active or default branch — never at "main" or any
      other branch, which would abandon the commit the reader is recovering.
- [x] EN/ES strings for everything new; no visible text is hardcoded to one
      language; none of the box's own strings collide with the dialog's
      when both are mounted together.
- [x] `pnpm run check:frontend` passes (architecture, TypeScript, tests,
      build).

# Relevant files

- `src/features/branches/BranchQuickCreateBox.tsx` (new),
  `BranchQuickCreateBox.test.tsx` (new)
- `src/features/branches/BranchesPanel.tsx`, `translations.ts`,
  `branches.css`
- `src/shared/ui/scrollAnchoredResize.ts` (new), `shared/ui/index.ts`
- `src/features/changes/QuickCommitBox.tsx` (refactored onto the shared
  hook; no behavior change)

# Dependencies

None. Builds on task 123's `QuickCommitBox` as precedent.

# Decisions

**Docked in the Branches list, not inside `BranchQuickSwitch`.** The user's
first description named "el componente de eleccion de ramas" — the branch
picker used in the status bar and Overview — but on the follow-up question
chose the list-docked box instead, explicitly keeping the header's "New
branch" button rather than folding creation into the picker's own popup. Asked
directly rather than guessed, since the two locations imply materially
different components and wiring.

**Skip the confirmation screen, same as `QuickCommitBox`.** `plan_create_branch`
almost always sets `requiresConfirmation: true` when switching (the default
choice here), but the operation itself is described in its own plan as
never touching a file, a saved version, or another branch — the risk the
confirmation exists to surface is about `HEAD` moving, not about anything
destructible. Skipping the preview trades that one warning for the box's
whole reason to exist: no modal for the common case.

**One row for the switch toggle and Create, and a toggle instead of a
checkbox.** A first pass put "Switch to it" as its own branch above the foot
row, plain-checkbox styled like the dialog's. User feedback moved it onto
the same row as Create — same layout `QuickCommitBox` already uses for its
"Also publish" toggle beside Save — and asked for the same *control*
Changes uses there, not a lookalike: this box's toggle is the shared
`.toggle-switch` primitive, exactly the markup `QuickCommitBox` already
renders for publish, so the two quick boxes share one on/off vocabulary
instead of each drawing its own.

**A starting-point choice, added after the user noticed the box was silently
always starting from the active branch.** The first shipped version reused
`CreateBranchDialog`'s own default: start wherever the project's `HEAD`
already stands, with no way to start anywhere else. Feedback asked, at
minimum, for a way to start the new branch from the repository's default branch
("main") as an alternative. Feasible without any Rust change:
`CreateBranchRequest.startCommit` already exists and is already
exercised end to end by History's own "branch from a saved version" flow,
and `git switch -c <name> <start>` safely handles starting a
checkout-and-create from a commit other than the current one — same Git
safety a plain `switch_branch` already relies on elsewhere in this
app, not new risk this task introduced.

Two options only, never a full picker: this is what the user explicitly
asked for, and a full picker of any branch (mirroring
`BranchQuickSwitch`'s dropdown) would be more than a *quick* box should
carry.

**The second option is the active branch, not the list's own `selected`
row.** The first version of this choice compared the default branch against
`BranchesPanel`'s `selected` state — whichever row currently has detail
focus, which defaults to the active branch but changes the moment the reader
clicks a different row just to look at it. Caught in review: browsing
another branch's detail without switching to it is not a decision about where
a *new* branch should branch from, and comparing against `selected` meant it
silently became one. Now compared against the project's actual active branch
(`BranchesPanel`'s own `active`), a value nothing about merely looking
at the list can change.

**The control itself moved from `FilterCapsule`/`FilterCapsules` to the
shared `.segmented-control` primitive**, for two reasons found only by
testing the shipped version rather than by reading the code. First, a real
bug: `FilterCapsule` renders a `<label>` wrapping a visually-hidden radio
input — correct markup, but clicking the label to focus that hidden input
did not reliably carry `event.relatedTarget` through to this box's own
`onBlur` handler in the app's actual WebView, so clicking a capsule while
the name field was still empty read as focus leaving the box entirely and
collapsed it out from under the reader mid-click. A `.segmented-control`
option is a real, directly focusable `<button role="radio">` with no such
indirection, and a dedicated regression test
("does not collapse the box when a source option is clicked with no name
typed yet") now guards it. Second, user feedback: capsules read as
belonging to the filter-panel vocabulary they came from, not as
"integrated" with the rest of this compose box the way the existing
`.toggle-switch`/`.segmented-control` controls already do elsewhere in this
app. `.segmented-control` is Settings-scale by default (8px/14px padding,
`--text-lead`); scoped down to this box's own `--text-label` tier in
`branches.css` (`.branches-quick-create__source .segmented-control`)
rather than growing the row to fit the control at full size, the same
"smaller box, not a quieter colour" reading `.primary-button--sm` already
gets. That same scoped block also overrides `primitives.css`'s global
`@media (max-width: 800px) { .segmented-control { flex-direction: column }
}`, written for Settings' much wider rows — found by testing this box at a
narrow viewport, where without the override two 130px-capped options
stacked into a second row this box has no height budget for.

**The "Create from" group moved into `.branches-quick-create__foot`
itself, on user feedback after seeing it as its own row above "Switch to
it."** Measured before making the change: "Create from" plus both options
plus "Switch to it" plus its toggle plus the Create button need roughly
500px combined, and the list panel column never exceeds 320px — the three
groups cannot share one visual branch at any supported width, confirmed by
testing rather than assumed. What moved is the *structure*, not a promise
of one line: all three groups are now children of the same flex row
(`flex-wrap` already established there), so they wrap together as one flow
instead of two independently-stacked blocks — which in practice still
renders as "Create from" on its own branch above "Switch to it" + Create, the
outcome the user confirmed was the actual ask once the numbers were shown.

**The choice is entirely absent, not merely defaulted, whenever the two
options would be identical or unsafe to distinguish.** Comparing by commit
(`mainBranch.tip.commit !== activeBranch.tip.commit`) rather than by name, so
two branches that happen to point at the same commit don't offer a choice that
changes nothing — directly answering the follow-up ask that main not be
offered as a "choice" when it's already the active branch. And
unconditionally `null` (current `HEAD`, full stop) on a detached `HEAD`,
regardless of what `mainBranch`/`activeBranch` say — caught by this task's own
new test before it shipped: the first version of `resolvedSource`'s
fallback branch (`activeBranch ?? mainBranch`) did not itself check
`forceSwitch`, so a detached-`HEAD` recovery would have silently started
the "recovery" branch from the active branch's tip instead of the actual
detached commit being recovered — exactly the failure
`createBranchDetachedNote` exists to prevent. Fixed by making
`resolvedSource` check `forceSwitch` first, before either the segmented
choice or the fallback.

**The Create button's visible text shortened to "Create," its accessible
name did not.** Feedback also asked for the shorter label to save room on
the now-shared row. Reverting the button's visible text to
`createBranchConfirm` ("Create") without changing anything else would
have reintroduced the exact ambiguity `branchesQuickCreateConfirmLabel`
was added to avoid — two on-screen buttons both named "Create" the moment
the dialog is also open. The fix keeps the short text and adds
`aria-label={t.branchesQuickCreateConfirmLabel}` ("Create branch") on top
of it: `aria-label` wins the accessible-name computation over text content,
so the row stays narrow while `getByRole("button", { name: "Create branch"
})` — and a screen reader — still resolve this button uniquely.

**The mutation lock, acquired only at submit time, and released
immediately on either outcome.** Considered acquiring it on focus/expand,
matching how the full dialog holds it for its entire open lifetime.
Rejected: a box meant to be fast should not block another window merely
because a reader tabbed into it. Acquired instead immediately before the
actual `plan`/`create` calls.

A first version held the lock across a failed attempt too — reasoning that
a retry should not have to re-win a lock its first attempt already held —
and a multi-angle review of the finished diff (run before this box's first
commit) found that reasoning was wrong on two counts. First, nothing was
actually mutated by a failed attempt, so there was no real claim left to
protect; a retry asking for the lock again is simply correct, not a race it
could lose. Second, and the reason this was a real bug rather than a
style preference: `hasBlockingDialog` (`App.tsx`) disables switching
projects and opening Settings whenever `activeSession.operation?.kind ===
"branch"`, an assumption that only holds while every lock owner is a
full-screen modal — which this box is not. Holding the lock through the
error state meant a failed create, followed by the reader simply navigating
away instead of clicking "Discard draft," left the whole app silently
unable to switch projects or open Settings, with no visible dialog anywhere
to explain why. Fixed by releasing the lock in the `catch` block itself,
the same call `onCreated`/`handleMutated` already makes on success — the
lock is now held for exactly the duration of the live request and no
longer, on either path, and `holdsLockRef` (the ref that tracked whether it
was still held) became unnecessary and was removed along with it.

Not fixed by this change, and out of scope for it: `getMutationBlocker`
(`src/runtime/project/sessions.ts`) only checks *other* sessions before
`startOperation` overwrites `session.operation`, so nothing stops a second
UI surface in the *same* session (this box and the header's "New branch"
dialog) from both starting a branch mutation if both are triggered
within the same live request's short window. Shrunk from "until the reader
dismisses a failure" to "the duration of one Git command" by the fix above,
which makes it impractical to hit by accident; closing it fully would mean
changing `startOperation`/`getMutationBlocker` to also check the current
session, a change every other consumer of this lock shares and this task
was not asked to touch.

**Distinct strings from `createBranch*`, not shared ones.** The first
draft reused the dialog's own `"Name"` label and `"Create"` button text.
`BranchesPanel.test.tsx` already had a test that opens the dialog and
then queries `getByLabelText("Name")` / `getByRole("button", { name:
"Create" })` — once the box is permanently mounted alongside the dialog,
both queries became ambiguous, and the existing test caught it immediately.
The fix is new keys (`branchesQuickCreateNameLabel`,
`branchesQuickCreateSwitchLabel`, `branchesQuickCreateConfirmLabel`)
rather than a workaround in the test: two controls with the same accessible
name, live on screen together, is a real ambiguity for a screen reader too,
not only for `testing-library`.

**Extract `useScrollAnchoredResize` rather than duplicate it.** The
scroll-anchoring logic `QuickCommitBox` wrote for task 123 — snapshot
`scrollTop` and the box's own height synchronously before a size change,
correct the scroll container from that snapshot in a paired
`useLayoutEffect` rather than by reading a live `scrollTop` that the browser
may have already clamped — has nothing to do with saving or creating. This
box needed the identical correction for the identical shape (a compose box
docked at the foot of a scrollable list, sharing its flex column). Two real
consumers with the same stable requirement is exactly ADR 0003's bar for
`shared/ui`; the two boxes' actual fields and requests stayed separate,
since a shared "quick box" component would have carried unused save-version
or create-branch concepts on one side or the other.

# Implementation notes

`BranchQuickCreateBox` mirrors `QuickCommitBox`'s open/close mechanics
exactly (focus/blur, Escape, the `grid-template-rows: 0fr → 1fr` snap with a
compositor-only opacity/scale fade inside it, per `styleComposition.test.ts`'s
ban on animating layout properties) and its own CSS block in
`branches.css` is written rule-for-rule against `.changes-quick-commit`
rather than sharing selectors — the CSS lives with the feature that draws
it, matching how every other pair of screen styles in this app is owned.

The mutation-lock bookkeeping needed no state of its own once the "hold
across a failure" design was retired (see Decisions): `handleCreate` calls
`onOperationStart()` once per attempt and, on the `catch` path, calls
`onOperationFinish()` before returning — no ref, no dismiss-time release.
Verified by a dedicated test ("shows the failure inline, keeps the typed
name, and releases the lock immediately") asserting `onOperationFinish` is
called once right after the failure (not deferred to a later dismiss), and
that a retry calls `onOperationStart` a second time rather than reusing a
held lock.

`startCommit` is sent as an explicit `null` on both the plan and the create
calls, matching `CreateBranchDialog`'s own convention, rather than left
`undefined` by omitting the key — this box never offers branching from an
earlier saved version, so the field is always absent by choice, not by
oversight.

The pre-existing `BranchesPanel.test.tsx` test that opens the header's
dialog and creates a branch (`"opens the create dialog from the header button
and creates a branch"`) initially broke once the quick-create box became a
permanent sibling in the DOM: `getByLabelText("Name")` and
`getByRole("button", { name: "Create" })` each started matching two
elements. Caught immediately by the existing suite rather than needing a new
test to find it — see the Decisions entry on distinct strings for the fix.

# Validation

```bash
pnpm run typecheck
pnpm run check:architecture
pnpm exec vitest run --exclude "**/.claude/**"
pnpm run build
pnpm run check:docs
```

All passed: TypeScript clean; the frontend architecture check over 358
modules; 834 frontend tests (817 pre-existing, 17 in
`BranchQuickCreateBox.test.tsx` — the original 13, 4 for the
starting-point choice, and 1 regression test for the collapse-on-click bug,
minus 1 folded together with the lock-behavior test once "holds the lock
for a retry" became "releases it immediately" — all others unchanged and
green including `QuickCommitBox.test.tsx` after its refactor onto the
shared hook), no skips; the production build; and the documentation check,
including this file.

A dedicated multi-angle review pass (correctness, removed-behavior,
cross-file tracing, reuse, simplification, efficiency, and altitude — seven
finder agents plus a verify pass, run against the diff before this box's
first commit) is what actually found the mutation-lock bug described in
Decisions; reading the code again afterward would not have been enough to
catch it, since the bug was in the *interaction* between this box's lock
usage and `hasBlockingDialog`'s assumption in a file this box never
imports. Ten findings were reported; the two CONFIRMED correctness ones
(the lock-held-through-error bug, and the same-session lock gap) are
addressed above, the latter only partially, on purpose (see Decisions). The
remaining PLAUSIBLE and reuse/simplification findings — duplicated
interaction-shell code with `QuickCommitBox`, a fourth hand-rolled
`role="switch"` instead of a shared component, `clearStaleStatus` clearing
errors where `QuickCommitBox`'s does not — were left as documented,
accepted trade-offs rather than fixed, since none change correctness and
fixing them would mean touching three other files this task was not scoped
to.

Not run: `cargo fmt`/`clippy`/Rust tests (`check:rust`) — no Rust changed,
same as task 123.

Not verified in the running desktop app: this project's `invoke` calls need
the Tauri native shell, which the available browser preview does not
provide regardless of the dev server's own state (which fluctuated during
this task — occupied by another process, then unresponsive, then back up
under a new process, per repeated `netstat` checks). Checked instead: the
component and integration tests above exercise the real request shapes
(`plan_create_branch`/`create_branch` payloads, including the
`switch` and `startCommit` fields for both the default-branch and
active-branch choices, and the detached-`HEAD` case) against a mocked
`invoke`, the same substitute task 123 used for the same reason. Twice in
this task, once the dev server was reachable again, a throwaway HTML page
importing the project's own `styles.css` (deleted after each check, per
the same method task 123 used) confirmed real rendering rather than
reasoning about the CSS on paper: first that the quick-create button
matches `QuickCommitBox`'s Save button pixel for pixel at the list panel's
real 300px width, and second — after the capsule-to-segmented-control
revision — that the two source options sit side by side rather than
stacking (catching the `@media (max-width: 800px)` override described in
Decisions, which a narrow preview viewport triggered and a components-only
test would not have caught), and that a long active-branch name truncates
with `text-overflow: ellipsis` inside its 130px cap rather than overflowing
the row.
