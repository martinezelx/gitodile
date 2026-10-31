---
id: 084
title: Wire the status bar to real project state
status: done
priority: normal
type: improvement
areas:
  - frontend
  - sync
  - accessibility
  - documentation
created: 2026-08-28
completed: 2026-08-28
parent:
queue:
---

# Goal

Replace the status bar's fixed visual-preview values with an honest, compact
summary of the active project and make its project-sync refresh control work.

# User outcome

People can trust the status bar on every screen to identify the current version
branch, summarize unsaved work, show the known relationship with the team, say
how fresh that knowledge is, and refresh the remote comparison without leaving
their current task.

# Context

Task 078 established the status bar's geometry and visual hierarchy but left it
deliberately backed by fixed sample data. `DESIGN.md` now defines this strip as
the at-a-glance source of project truth, so shipping the preview would violate
the design's explicit honesty requirement.

The required facts already live in the active project session. This work should
compose those snapshots in the app shell; it must not add repository reads,
duplicate feature state, or make screen visibility an invalidation trigger.

# Scope

- Derive status-bar content from the active repository, working-tree, and team
  sync snapshots already owned by the project runtime.
- Represent no-project, loading, unavailable, stale, cached, detached, unborn,
  and every known sync relationship without optimistic fallback copy.
- Enable the remote check control and route it through the existing sync
  controller for the active session.
- Localize compact English and Spanish status copy and relative check times.
- Keep long branch names and narrow windows from displacing the version or the
  refresh action.
- Add focused component tests and integration coverage for the app wiring.

# Out of scope

- New Rust commands or changes to Git operation policy.
- Automatic remote polling or a new refresh lifecycle.
- Turning the status bar into navigation or adding configuration for its items.
- Redesigning the settled 30px chrome strip.

# Acceptance criteria

- [x] No fixed repository sample remains in `StatusBar.tsx`.
- [x] The active branch and unsaved-change count come from the active
      session, including detached, unborn, loading, and error states.
- [x] Team copy distinguishes fresh, cached, stale, checking, failed, and
      not-yet-checked knowledge and covers every `TeamSyncState`.
- [x] The refresh control checks project changes for the active session, is
      disabled when no check can run, and exposes busy state accessibly.
- [x] Check time uses locale-aware relative formatting and updates while the
      application remains open.
- [x] Long content truncates predictably without hiding the refresh action or
      app version; English and Spanish copy are covered.
- [x] Focused tests and `pnpm run check` pass.

# Relevant files

- `src/app/App.tsx`
- `src/app/StatusBar.tsx`
- `src/app/app-shell.css`
- `src/app/translations.ts`
- `src/features/sync/domain.ts`
- `src/runtime/project/sessions.ts`
- `DESIGN.md`

# Dependencies

Task 078, completed.

# Decisions

**Render unknown knowledge as unknown.** A missing or failed snapshot must not
fall back to “up to date” or zero changes. Cached and stale remote facts remain
useful, but their freshness qualifier stays visible beside the relationship.

**Refresh only the project comparison.** The inline cloud refresh is part of the
sync fact cluster, so it invokes the existing explicit remote check rather than
the broader Overview refresh. This keeps the action's consequence narrow and
matches its accessible name.

**Keep the bar informational.** Branch, working-tree state, and team
relationship remain text rather than navigation shortcuts. This preserves the
settled chrome hierarchy and avoids tiny 20–30px pointer targets for primary
navigation.

# Implementation notes

`StatusBar` is now a controlled app-shell component. `App.tsx` passes only the
active session's repository, working-tree, and sync snapshots and routes the
refresh button through the existing `syncController.check` path. No new fetch,
runtime state, Rust command, or visibility effect was introduced.

The presentation distinguishes all repository head and team-sync states. A
working-tree read in progress temporarily replaces the count, and a failed read
removes the potentially stale count rather than presenting it as current. Team
facts retain their useful relationship label while separate copy marks cached,
stale, or failed knowledge.

Relative remote-check time uses `Intl.RelativeTimeFormat` and a 30-second clock
owned by the always-visible bar. Its exact localized date and time remain in a
title for inspection. The timer is cleaned up on unmount.

The settled visual design was preserved. New flex roles and inner-text
ellipsis keep a long branch or relationship from displacing the refresh
control or app version. The refresh control gained a visible keyboard focus
ring, busy labeling, and a disabled state outside a named branch.

`StatusBar.test.tsx` covers no-project, long-branch, dirty, loading, unavailable,
cached, stale, Spanish, detached, relative-time, and every `TeamSyncState`.
`App.test.tsx` proves the controlled data and explicit remote check are wired to
the active project session.

# Validation

- `pnpm exec vitest run src/app/StatusBar.test.tsx src/app/App.test.tsx
  --passWithNoTests` — passed, 34 tests across 2 files.
- `pnpm run check:architecture` — passed over 292 modules.
- `pnpm run check:docs` — passed over 137 Markdown files and 104 task ids.
- In-app browser inspection at 1024×720 — the bar measured 30px high, used the
  full 968px content column, preserved both edge items, and had no horizontal
  overflow; no browser warnings or errors were logged.
- `pnpm run check` — passed end to end: docs and architecture checks,
  TypeScript, 459 frontend tests in 54 files, production build, Rust formatting,
  Clippy with warnings denied, and 306 Rust tests.
