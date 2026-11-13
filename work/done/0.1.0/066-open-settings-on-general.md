---
id: 066
title: Open Settings on General every time
status: done
priority: normal
type: chore
areas:
  - frontend
created: 2026-08-23
completed: 2026-08-23
parent:
---

# Goal

Make the Settings overlay open on the **General** section whenever it is opened
without a stated destination, instead of restoring whichever section was last
visited.

# User outcome

Settings always starts from the same, predictable place. Someone who once went
to Git to fix an identity no longer finds the dialog stuck on Git days later,
with no memory of why.

# Context

`useSettingsSection` persists the active section in `localStorage` under
`gitodile-settings-section`, and its comment records the original reasoning:

> Stored rather than reset because a user who came back for the Git section
> almost always wants it twice: closing the dialog is not an instruction to
> forget where they were.

That reasoning has been overtaken by the routes added since. Every case where a
user genuinely wants a specific section now has its own direct entry point, and
each already sets the section before opening:

- the command palette offers one entry per section (`main.tsx`, "Configuración:
  Git" and siblings);
- the dialog header's "Git needs attention" button jumps to Git;
- the create-project dialog's identity link jumps to Git.

So the persisted section no longer earns its cost: it makes the plain open
unpredictable in exchange for a shortcut that three explicit paths already give.

The call sites are already split the right way. The plain openers call
`setIsSettingsOpen(true)` alone; the targeted ones call `setSettingsSection(...)`
first. Only the plain ones change.

There is a second, smaller benefit. `SettingsPanel` reads the Git identity and
the line-ending configuration on mount, and both cost real `git config`
processes. Neither is rendered by General, so landing there stops the user from
watching those reads resolve. This task does **not** make the reads faster — it
only stops them being visible — and that limitation is recorded, not claimed as
a fix.

# Scope

- Introduce a single `openSettings(section)` helper in `main.tsx` that defaults
  to `"general"`, and route every plain opener through it.
- Keep the targeted openers landing on their section by passing it explicitly.
- Drop the `localStorage` persistence of the section, its storage key, and the
  now-obsolete comment.
- Update the tests that assert the remembered-section behavior.

# Out of scope

- Caching or precomputing the identity and line-ending reads. The latency is
  real and stays; it is captured separately in the backlog.
- Any change to what the sections contain, to the rail, or to the section order.
- Any other persisted preference in `preferences.ts`.

# Acceptance criteria

- [x] Opening Settings from the titlebar menu, the sidebar, the command
      palette's plain entry, or `Ctrl/Cmd+,` lands on General, regardless of
      which section was open last.
- [x] Opening Settings from a per-section palette entry, from the "Git needs
      attention" header button, or from the create-project identity link still
      lands on that section.
- [x] Switching sections while the dialog is open still works, and the
      identity close-guard can still steer to Git.
- [x] Nothing is written to `gitodile-settings-section` any more.
- [x] Full `pnpm run check` passes.

# Relevant files

- `src/app/preferences.ts`
- `src/main.tsx`
- `src/app/AppOverlays.tsx`
- `src/features/settings/SettingsPanel.tsx`

# Dependencies

None.

# Decisions

- A default parameter on one opener, rather than resetting the section on close
  or on open inside `AppOverlays`. Resetting on close would fight the close
  guard, which deliberately steers to Git while closing; resetting inside the
  overlay would take the decision away from the callers that legitimately need
  a different section.
- Implemented out of queue order at the user's explicit request.

# Implementation notes

`useSettingsSection` and `SETTINGS_SECTION_STORAGE_KEY` are gone from
`src/app/preferences.ts`. With the persistence removed the hook had nothing left
to do beyond `useState`, so the state now lives in `main.tsx` beside
`isSettingsOpen`, which is what actually pairs with it.

`main.tsx` gained one `openSettings(section = "general")`. Seven call sites went
through it: the `Ctrl/Cmd+,` shortcut, the palette's plain entry, the palette's
per-section entries, the titlebar menu, both sidebar/nav rail buttons, and the
create-project identity link. The last two pass a section; the rest take the
default. `setIsSettingsOpen` is still passed to `AppOverlays` for closing.

The stale palette comment ("the section is app state now, so the palette can
land on the right one instead of dropping the user at whichever they used
last") was rewritten: the per-section entries are now the *reason* the plain
open needs no memory, not a workaround for it.

`src/main.test.tsx` carried the old expectation directly — "the section is a
preference, not per-opening state" asserting Interface stayed selected on
reopen. It now asserts General is selected and Interface is not, and the
`Ctrl/Cmd+,` case asserts General too. The palette-lands-on-Git case was
already there and still passes unchanged, which is the evidence the targeted
paths did not regress.

The identity/line-endings latency is untouched, as scoped. It is recorded under
"Settings" in `work/backlog.md`.

# Validation

`pnpm run check` — passed (`check:docs`, `check:architecture`, `typecheck`,
`test` 399 passed / 49 files, `build`, `check:rust`).

Behaviour was also measured against the running dev server rather than assumed:

- With `gitodile-settings-section` planted as `"line-endings"`, opening
  Settings selected `General=true` and left every other tab `false`; focus
  landed on the General tab.
- Switching to Finales de línea, closing with Escape and reopening selected
  General again, and a sentinel value written to the old storage key was still
  intact afterwards — nothing writes to it any more.
