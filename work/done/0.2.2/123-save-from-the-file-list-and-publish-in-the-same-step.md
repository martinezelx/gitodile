---
id: 123
title: Save from the file list, and publish in the same step
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

A second, faster way to save a version without leaving Changes or opening the
"Save Version" dialog — a compose box docked at the foot of the file list,
closed until it is used. And on both the dialog and the new box, a checkbox
that hands off to Publish right after a successful save, instead of making
publishing straight to origin a separate errand every time.

# User outcome

The common case — a short message, save, move on — no longer costs a modal.
Typing into the file list's own footer and pressing the button (or Enter) is
enough; the box opens itself on focus and folds back to one row when it is
not in use, so it never competes with the file list for space. "Save Version"
still opens the full dialog for the cases that want its plan preview first —
a first version, a large or unusual change set, a hook that needs a one-time
skip.

Checking "Also publish" on either surface means a save is followed straight
into Publish's own plan and confirmation — one motion instead of "save, then
remember to publish" — without skipping the confirmation Publish already
asks before anything actually leaves the machine.

And closing Save Version without saving — a stray click on the backdrop, an
Escape, Cancel — no longer throws away what was typed. Reopening it for the
same change finds the draft still there.

# Context

The conversation that shaped this (kept here because none of it is visible
in the diff) went through several designs before landing on this one:

- Docking the box permanently open was tried first and rejected: at the
  panel's 260–320px column it cost the file list a whole card's worth of
  height for a control most of the time nobody is touching.
- Folding "Save Version" into the box entirely — removing the header
  button — was prototyped as a mockup and rejected in favour of keeping
  both. The dialog's plan preview and its hook-rejection retry are real,
  occasionally-needed capability that a one-line compose box has no room to
  offer; two paths to the same result is fine when they serve different
  moments, one fast and unopinionated, one slower and informative.
- The footer row (publish toggle + save button) went through three shapes
  before it stopped reflowing: first a toggle with a visible label next to a
  button whose text changed with the toggle (wrapped on almost every click);
  then a fixed button label with the toggle's own text dropped entirely
  (fit, but a bare switch with no visible label read as unclear); it settled
  on a fixed, short button label ("Save") with the toggle's label restored,
  which fits at the file-list panel's own wide end and wraps to two clean
  rows — never mid-interaction, only when the window is actually narrow.
- The open/close animation was attempted with a `grid-template-rows`
  transition and reverted: this repo's own architecture check
  (`styleComposition.test.ts`) forbids animating layout properties
  (`padding`, `grid-template`, `margin`, `gap`, `width`, `height`,
  `flex-basis`, …), for reflow-cost reasons that predate this task. The row
  now snaps open/closed instantly; a subtle `opacity` + `transform: scaleY()`
  fade on the content inside is what reads as "soft," and both are
  compositor-only properties the same check allows.

# Scope

- `QuickCommitBox` (new): a summary field, an optional description, an
  "Also publish" toggle and a Save button, docked under the file list's
  scroll region in `ChangesPanel`.
  - Closed by default; opens on focus, closes on blur unless there is a
    draft or a save in flight.
  - A dismiss control (and Escape) clears the draft and closes it, for
    "opened this by accident."
  - Reuses `SaveVersionController`/`saveVersionPort` directly — the same
    `plan_save_version` → `save_version` pair the dialog uses — rather than
    opening the dialog underneath.
  - Inline error on failure, with the same one-time "save without hooks"
    escape the dialog offers after a hook rejection.
- "Also publish" checkbox on `SaveVersionDialog` itself, previously absent.
  Both checkboxes read and write the same `localStorage` key
  (`PUBLISH_AFTER_SAVE_STORAGE_KEY`, now exported from
  `features/save-version/domain.ts`), so the choice made on one is the
  choice found on the other.
- On a successful save with the checkbox on, both surfaces call the same
  `onClose` + `onPublishNow` sequence the dialog's existing "Publish now"
  button already used — Publish still shows its own plan and asks its own
  confirmation before anything is sent anywhere.
- `SaveVersionDialog` no longer clears `title`/`details` when it opens;
  only when a save actually succeeds.
- `saveVersionConfirm` shortened from "Save version" to "Save" (both
  locales) — reused by both surfaces, and the dialog's own heading already
  says "Save version," so the button repeating it added nothing.

# Out of scope

- Removing the header's "Save Version" button. Considered and rejected;
  see Context.
- A visible plan preview inside the quick box. It calls the same planner
  Rust does the staleness check either way, but nothing in the box shows
  what the plan returns before saving — that is what the dialog is still
  for.
- Any change to `publish.rs` or the Publish dialog itself. Both new "also
  publish" paths hand off to the existing, unmodified flow.

# Acceptance criteria

- [x] The quick commit box renders docked under the file list, collapsed to
      one row, whenever there are changes to save.
- [x] It expands on focus and collapses on blur when empty; a draft (title
      or description) or a save in flight keeps it open.
- [x] Its dismiss control and Escape both clear the draft and collapse it;
      neither works mid-save.
- [x] Saving calls `plan_save_version` then `save_version` with the file
      list's current selection, shows an inline success line, clears the
      draft, and refreshes the working tree the same way the dialog does.
- [x] A hook rejection shows the failure inline with a one-time "save
      without hooks" retry; any other failure does not offer it.
- [x] Save is disabled with nothing selected to save, or with an empty
      title.
- [x] "Also publish" exists on both the quick box and `SaveVersionDialog`,
      shares one stored preference, and hands off to Publish's own flow
      after a successful save — never a silent push.
- [x] `SaveVersionDialog` keeps a typed title/details across a close
      without saving, and clears them once a save succeeds.
- [x] EN/ES strings for everything new; no visible text is hardcoded to one
      language.
- [x] The row holding the publish toggle and the Save button does not
      reflow when the toggle is clicked, at any panel width.
- [x] `pnpm run check:frontend` passes (architecture, TypeScript, tests,
      build).

# Relevant files

- `src/features/changes/QuickCommitBox.tsx` (new),
  `QuickCommitBox.test.tsx` (new)
- `src/features/changes/ChangesPanel.tsx`, `ChangesPanel.test.tsx`,
  `changes.css`, `translations.ts`
- `src/features/save-version/SaveVersionDialog.tsx`,
  `SaveVersionDialog.test.tsx`, `domain.ts`, `translations.ts`

# Dependencies

None.

# Decisions

**Reuse the save-version port directly instead of opening the dialog
underneath.** The quick box needed the same `plan` → `save` request the
dialog makes, including the same `stateToken` staleness check on Rust's
side. Driving the existing (hidden) dialog component to do this would have
meant either duplicating its request logic or coupling two independently
visible UIs through one hidden instance. Calling
`createSaveVersionController(saveVersionPort)` directly, the same way the
dialog itself does, keeps the two surfaces as peers over one typed port
rather than one wrapping the other.

**A fixed button label, not one that swaps with the toggle.** The dialog's
own confirm button still swaps to "Save and publish" when checked — it has
480px to do that in. The quick box does not: measured against the file
list panel's real column (`--panel-column`: 260–320px, `--panel-column-narrow`:
240–280px below 1200px), no wording of "also publish" plus a toggle plus a
button that also grows on click ever stayed on one line without jumping
between one and two rows on every toggle press. A label that never changes
removed the jump; the row now only reflows with the window, never with a
click.

**No visible label was tried and reverted for the toggle.** Dropping
"Also publish" entirely (icon-only switch, `aria-label` and a tooltip
carrying the meaning) did make the row fit at every width tested — but
read as unclear on its own, unlike the header's icon-only discard button,
which has no ambiguity about what a trash icon over a file list does. The
label went back on; the row wraps at some widths instead.

**The draft persists past a close, on both surfaces.** Closing either
surface without saving used to discard whatever was typed, silently. Both
now keep it — the dialog by no longer resetting `title`/`details` on open,
the box by the same blur rule that already protected it from closing while
mid-draft. The tradeoff, accepted rather than solved: a draft can outlive
the file selection it described, if the user closes, changes what is
selected, and reopens. Rewritten or cleared by hand either way; silently
lost was worse.

**"Also publish" hands off to Publish rather than pushing directly.**
Considered and rejected: a silent push from either surface. Publish's own
flow already does the real work here — remote selection when more than one
exists, a fresh plan, ahead/behind/diverged classification, and its own
confirmation — and reproducing any of that inside a compose box would be
either an unsafe shortcut or a duplicate of code that already exists and is
tested. Checking the box only changes what happens *after* a successful
save: the same `onClose(); onPublishNow();` pair the dialog's existing
"Publish now" button already called.

# Implementation notes

`QuickCommitBox` keeps its own `expanded` boolean rather than deriving it
from `document.activeElement`; the container's `onFocus`/`onBlur` (React's
focusin/focusout) set it directly, and blur only collapses when
`event.relatedTarget` has left the container *and* both fields are empty
*and* nothing is mid-save. Escape reuses the same dismiss path.

The open/close visual: `.changes-quick-commit__extra` sizes itself with
`grid-template-rows: 0fr` / `1fr`, unanimated (a layout property, forbidden
by `styleComposition.test.ts`); the child inside it carries the actual
`opacity`/`transform: scaleY(0.96 → 1)` transition, both compositor-only.
Reduced-motion turns the latter off.

A real CSS specificity bug, not a design choice: `base.css` sets
`input:focus-visible { outline: 2px solid var(--focus-ring) }` globally at
(0,1,1) specificity. The summary field's own `outline: none` at a
class-only (0,1,0) lost to it regardless of source order, showing a second,
squared-off focus ring on top of the pill's own. Fixed by matching
specificity (`input.changes-quick-commit__summary`), the same shape
`.search-box__field input` already uses one strip up.

The dismiss control mirrors `.search-box__clear` down to the mechanism:
always mounted, `visibility: hidden` until `.changes-quick-commit--expanded`,
rather than conditionally rendered — keeps it out of the tab order at rest
without a mount/unmount on every focus change. Rectangular
(`--radius-item`), not a circle, per DESIGN.md § Shape's rule for a control
attached to a field rather than standing alone.

`remoteLabel` (the tooltip on the publish toggle, when a remote is already
tracked) comes straight from `workingTree.upstream.upstream` — real
tracking data already on the prop, not a new read.

A gap caught in a review pass after the box otherwise worked: a disabled
Save button said nothing about why, unlike the header's own "Save Version"
button, which already carries `changesSaveVersionNoSelectionHint` as a
tooltip for the same case. The box's button now does too — reusing that
existing string rather than inventing a second one for the same fact.

Two follow-ups landed after the above, from the same conversation:

**The Save button is `--sm`.** It shares a row with a 24px-tall toggle and
was still sized for a row of its own (`--control-height-md`, 38px) — visibly
out of scale beside it. `.primary-button--sm` (`--control-height-sm`, 32px)
is the exact tier DESIGN.md § Size names for "a control that lives inside a
row it must not out-weigh," already used one strip up for the hook-rejection
retry button; this is the same case.

**Closed, the box now reads as a sibling of the search box above it, not a
white card of its own.** It originally kept the same raised-card look
(`--radius-control`, `--surface-raised`, a shadow) in both states — square
enough, and light enough against the panel's own dark surface, to read as
a second, separate control sitting *below* the list rather than as one more
row of it. Now the shape and fill are state-dependent: closed, it is the
same pill (`--radius-pill`) and tinted fill (`--surface-hover`) as the
search box, at the same height (`--control-height-sm`); only once expanded
does it take on the card look, which is also the moment it actually holds
more than one field and earns a surface of its own. Per DESIGN.md § Shape,
a control's shape states what it *is* — at rest this is a field, same as
search's; opened, it is a small panel.

**Expanded, its radius is `--radius-surface`, not `--radius-control`.** A
follow-up to the shape change above: closed took the search box's pill, but
expanded had kept `--radius-control` — the tier tokens.css names for
"multiline controls and attached icon tiles," which is what its own
description *textarea* is, not what the card holding it is. Once expanded
this box is "a container with its own background" — the exact case
DESIGN.md § Shape gives `--radius-surface`, and what `.changes-file-list`
around it and `.save-version-dialog` beside it both already use. It was a
real mismatch, not a style choice to weigh: the surface tier was already
established for this exact case elsewhere in the same file.

**The file list's scroll position now tracks this box's own height change,
always — not only when already scrolled to the bottom.** Found by testing
at a mid-scroll position rather than only at the ends: opening the box
shrinks `.changes-file-list__scroll`'s height (they are flex siblings), and
at the very bottom the browser already clamps `scrollTop` down to compensate
on its own — which is the only reason opening the box ever looked right.
Scrolled to the middle, nothing clamps it, so the rows nearest the box just
fell outside the now-shorter viewport with no scroll to explain where they
went — reading as the box burying them rather than the list making room.
A new `fileListRef` prop (wired from `ChangesPanel`'s existing
`fileListScrollRef`) lets the box adjust that scroll container's `scrollTop`
by its own height delta on every open and close, reproducing the browser's
own bottom-of-list clamp everywhere instead of only where it happens for
free. Went through two implementations before it held at every scroll
position, both caught only by testing the actual behaviour rather than
trusting the arithmetic:

1. A `ResizeObserver` on the box, feeding a running height delta. Worked at
   the very top and the very middle of the list; scrolled anywhere the close
   would leave the list further up than where it started, by an amount that
   tracked how close to the bottom the list had been.
2. Reading the file list's *current* `scrollTop` inside a `useLayoutEffect`
   keyed on `expanded`, adding the delta to that. Fixed the drift in most
   positions but reproduced it exactly at the list's own end: the moment
   `getBoundingClientRect()` forces the browser to lay out the box's new
   size, the browser has *already* clamped `scrollTop` down to whatever the
   now-smaller scrollable range allows — so reading "current `scrollTop`"
   after that point and adding a delta on top double-applies a correction
   the browser already made once.

The fix that held: never read `scrollTop` after the resize. `beginExpandedChange`
snapshots both `scrollTop` and the box's own height synchronously, inside
the same event handler that requests the expand/collapse — strictly before
React re-renders or the browser has any reason to touch scroll position —
and the layout effect computes the corrected `scrollTop` from that untouched
snapshot instead of from whatever the live value has drifted to by the time
it runs. Verified with a throwaway harness reproducing the real flex
structure, logging the exact `scrollTop` before and after each open/close at
the top, middle, and end of a forty-row list — each implementation checked
against all three before moving on, since the second one had looked correct
until the last position was actually tried. The test environment stubs
every element's measured size to a fixed constant by default
(`src/test-fixtures/testSetup.ts`, predating this task, shared with the diff
virtualizer); the automated test added for this in a later review pass
patches `getBoundingClientRect` locally, just for itself, since it is the
one case in this task that specifically needs the box to measure
differently open versus closed.

Three real bugs were found and fixed only by measuring against the actual
CSS at the panel's real widths (a throwaway HTML page importing the
project's own `tokens.css`/`base.css`/`primitives.css`/`changes.css`,
rendered in-browser at 240/260/280/320px, deleted after each check) rather
than by eyeballing the mounted app:

1. The footer row wrapping unpredictably on every toggle click (root cause:
   variable-width button label — see Decisions).
2. A stray CSS specificity bug leaving a second focus outline on the
   summary field (see above).
3. Two false starts on "does it fit on one line" — first assuming a fixed
   label alone was enough (it wasn't, until the toggle's own label was also
   dropped), then reverting that once the label came back, confirming the
   two-row fallback at normal widths empirically rather than by further
   guessing.

Also fixed in review, before any of it shipped: a translation change
(`saveVersionConfirm` → "Save") broke 16 existing `SaveVersionDialog` tests
that queried the old button text — caught by the full suite, not missed.

# Validation

```bash
pnpm run typecheck
pnpm run check:architecture
pnpm exec vitest run --exclude "**/.claude/**"
pnpm run build
pnpm run check:docs
```

All passed: TypeScript clean; the frontend architecture check over 355
modules; 817 frontend tests (802 pre-existing, 13 in
`QuickCommitBox.test.tsx`, 1 new end-to-end save in `ChangesPanel.test.tsx`,
and 1 new draft-persistence test in `SaveVersionDialog.test.tsx`), all
green, no skips; the production build; and the documentation check,
including this file, over 351 Markdown files and 152 task ids.

A dedicated review pass over the finished diff, done separately from writing
it, added two of those tests rather than just reading the code: the scroll
anchor (patching `getBoundingClientRect` locally for one test, since the
shared jsdom stub can't tell collapsed from expanded — see Implementation
notes) and the dialog's own draft persistence across a close, both real
behaviour changes this task shipped without a test the first time. Nothing
else the review found rose to a fix — see Implementation notes for the two
that did, both landed as follow-ups above.

`--exclude "**/.claude/**"` excludes a stray, unrelated worktree checkout
found nested inside the repo during this task (`.claude/worktrees/...`)
that vitest's default discovery otherwise also picks up — confirmed by
running the full, unexcluded suite too: the only failures are inside that
worktree (a `StatusBar` version-string mismatch and further
`styleComposition` drift, both pre-existing there and unrelated to this
task's files, which sit entirely outside it).

Not run: `cargo fmt`/`clippy`/Rust tests (`check:rust`) — no Rust changed.
The individual commands above were run separately rather than as the one
`pnpm run check`, because that composes `test` without the worktree
exclusion.

Not verified in the running desktop app: this project's dev server needs
the Tauri native shell for `invoke` (project open/close, real Git status),
which the available browser preview does not provide. Checked instead: the
dev server loads the changed frontend with no console errors, and the
component-level and integration tests above exercise the real request
shapes (`plan_save_version`/`save_version` payloads) against a mocked
`invoke`.
