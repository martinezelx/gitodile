---
id: 055
title: Open Settings without a loading frame
status: done
priority: low
type: chore
areas:
  - frontend
  - architecture
  - performance
created: 2026-08-13
completed: 2026-08-13
---

# Goal

Make the Settings overlay appear complete on the first click, with no
intermediate loading state.

# User outcome

Settings opens instantly the first time in a session, exactly as it does every
time after. The brief flash of a loading bar is gone.

# Context

Task 046 code-split `SettingsPanel` because the entry chunk was at 375.59 kB
against a 378 kB warning — 2.4 kB of headroom. The trade was reasonable then and
is not now: tasks 048 and 054 took the entry to 270.56 kB, leaving roughly
107 kB against the same warning for a 12.7 kB panel.

The split also had a cost that a prefetch cannot pay off. `React.lazy` attaches
to its loader promise on *first render*, not when the module finishes loading,
so a fully warmed module still suspends for a tick and React commits the
fallback. A screen hides that behind navigation; an overlay opens from a click
with nothing in front of it, so the frame is visible. Warming the chunk from
`prefetchScreenChunks` was tried first and did not remove it.

# Scope

- Import `SettingsPanel` statically again and drop its `Suspense` boundary.
- Move the Settings registry entry to the feature it belongs to, matching how
  screens register beside their owner.
- Record the rule so a future architecture pass does not re-split it.
- Re-measure the entry chunk against the task 023 budget.

# Out of scope

- The style and translation ownership from task 046, which stands.
- Any change to Settings behavior, copy, layout or the `SettingsPort`.
- Splitting or eager-loading any other overlay or dialog.

# Acceptance criteria

- [x] Opening Settings for the first time in a session renders the dialog and
      its content in one commit, with no fallback.
- [x] The focus trap still moves focus into the dialog and returns it to the
      trigger on close.
- [x] Entry JS stays below the 378 kB raw / 110 kB gzip warning.
- [x] The eager-overlay rule is written down where the next change will read it.
- [x] Full `pnpm run check` passes.

# Relevant files

- `src/features/settings/overlay.tsx`, `src/features/settings/index.ts`
- `src/app/AppOverlays.tsx`
- `src/screens.tsx`
- `src/main.test.tsx`
- `AGENTS.md`, `docs/ARCHITECTURE.md`

# Dependencies

Reverses the lazy-loading half of task 046. Depends on the entry-chunk headroom
created by tasks 048 and 054.

# Decisions

- Eager, not prefetched. Warming the chunk in `prefetchScreenChunks` was
  implemented and measured first; it removes the network fetch but not the
  suspend-on-first-render frame, so it solved the wrong half of the problem.
  The overlay prefetch loop and the `container` field it needed on
  `OverlayModule` were both removed rather than left as unused machinery.
- The registry entry moved to `src/features/settings/overlay.tsx` even though
  the panel is no longer code-split. Nav, the command palette and the compact
  nav still derive from one descriptor, and it now lives beside its feature
  like `changesScreenModule` does.
- `AppOverlays` keeps composing the panel's props by hand. An eager container
  in the descriptor would be decorative: nothing mounts an overlay generically.

# Implementation notes

- `src/features/settings/overlay.tsx` (new) holds `settingsOverlayModule`; the
  barrel re-exports `SettingsPanel` from its own module. `src/screens.tsx` lost
  the inline overlay literal and its `Settings` icon import.
- `src/app/AppOverlays.tsx` dropped `Suspense`, `lazy` and the `LoadingBar`
  import for this panel.
- `src/main.test.tsx` now asserts the panel's section navigation with a
  synchronous `getByRole` instead of `findByRole`. Re-splitting the overlay
  fails there before it can reach a user.
- Production build against the task 054 baseline:

  | Asset | Before | After | Change |
  | --- | ---: | ---: | ---: |
  | entry JS | 270.56 kB / 80.66 kB gzip | 283.72 kB / 83.41 kB gzip | +13.16 kB / +2.75 kB gzip |
  | `SettingsPanel` JS | 12.74 kB lazy chunk | part of entry | chunk removed |

  Entry raw sits 94.28 kB below the 378 kB warning and gzip 26.59 kB below the
  110 kB warning. `fileIcons` remains a separate 238.88 kB chunk with no static
  entry path.

# Validation

- `pnpm run check` (docs, architecture, typecheck, test, build, Rust fmt,
  clippy and tests)
- Browser verification against the running dev server: a `MutationObserver`
  over a real click on the Settings trigger recorded exactly one DOM commit,
  already containing the panel's controls and no `role="progressbar"`. The
  lazy build was not re-measured with the same probe; the earlier attempt used
  a `setTimeout(0)` read, which lands after microtasks have flushed and
  therefore could not see the fallback commit at all. The user-visible flash
  before and after the change is the primary evidence.
- Focus behavior is covered by `src/main.test.tsx` ("opens Settings as a
  sectioned dialog without replacing the active screen"), which asserts focus
  on Close and its return to the trigger on Escape.
