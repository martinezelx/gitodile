---
id: 100
title: Notification centre in the titlebar
status: done
priority: normal
type: feature
areas:
  - frontend
  - settings
  - sync
  - accessibility
created: 2026-09-01
completed: 2026-09-01
parent:
queue: "18"
---

# Goal

Give GitOdile one place that records what happened to the open project while
nobody was looking at it, reachable from a bell in the window titlebar, and one
switch in Settings that turns the whole thing off.

# User outcome

A user who left GitOdile open in the background can come back, see a badge on
the titlebar bell, open it and read that newer project changes are waiting — or
that the last automatic check could not reach the remote — and go straight to
the review flow from there. A user who does not want any of it turns
notifications off in Settings and the app stops recording them.

# Context

Nothing in the app currently reports a background outcome. The automatic remote
check (task 089) runs on an opt-in cadence and writes its result into the status
bar, which is a *state* display: it shows what is true now, not what changed
while the window was in the background. A failed check leaves an inline label
that the next successful check quietly erases.

## GitHub Desktop as reference

Per `AGENTS.md` "External references", the reusable principle was extracted, not
the implementation:

- GitHub Desktop puts an **Enable notifications** checkbox in its own
  **Notifications** settings pane.
- It deliberately notifies only about *high-signal* events in the repository
  currently selected — pull-request checks that failed, and pull-request reviews
  — rather than everything that happens.
- Clicking a notification takes the user to the context that explains it.

Two of those three transfer directly. The third does not: GitHub Desktop's
high-signal events are hosting events (checks, reviews), and GitOdile has no
hosting integration — provider accounts and pull requests are explicitly
post-1.0 backlog items. GitOdile's equivalent background event is the automatic
upstream check, so that is what this task notifies about.

GitHub Desktop also raises **operating-system** notifications and has no in-app
centre. This task deliberately does the opposite; see Decisions.

# Scope

- A `notifications` feature owning its domain, store, panel, styles and
  translations, with no Rust and no IPC of its own.
- A titlebar bell button between the drag region and the window controls, with
  an unread badge, opening an anchored panel that lists the newest entries.
- Three notification kinds, wired from the composition root:
  - `teamChangesAvailable` — an **automatic** check found strictly newer
    upstream versions. Carries an action that opens the review-and-get flow.
  - `remoteCheckFailed` — an **automatic** check could not reach the remote.
  - `changesPublished` — a publish succeeded.
- Unread accounting that follows the high-signal principle: background events
  arrive unread and light the badge; an event the user performed themselves is
  recorded already read, because it is a receipt, not news.
- Collapsing so a repeating cadence cannot pile up: a background kind keeps one
  entry per project, replaced in place, and only returns to unread when its
  payload actually changed.
- A **Notifications** section in Settings with an "Enable notifications" switch,
  default on. When off, nothing new is recorded and the panel says so with a way
  into the setting.
- Notifications stay in memory for the session. Nothing is persisted.

# Out of scope

- Operating-system / native notifications, and therefore
  `@tauri-apps/plugin-notification`, its capability entry, and the Windows
  toast-shortcut and macOS permission dances. Follow-up work.
- Persisting the list across restarts.
- Notifying about saves. `SaveVersionDialog`'s `onSaved` carries no payload, and
  adding one to describe an action the user just watched succeed is scope this
  task does not need.
- A notifications screen, per-kind muting, and grouping by project.
- Any new Rust command, IPC call, or background polling. The centre only ever
  records outcomes that work already produced.

# Acceptance criteria

- [x] A bell button sits between the titlebar drag region and the window
      controls, has an accessible name that includes the unread count, and opens
      an anchored panel with `aria-expanded` and Escape/outside-click dismissal.
- [x] Opening the panel marks everything read and clears the badge.
- [x] An automatic remote check that reports newer upstream versions records one
      unread notification whose action opens the review-and-get flow and closes
      the panel.
- [x] An automatic remote check that fails records one unread notification
      carrying the mapped error message.
- [x] A manual remote check records nothing: the user is already looking at the
      result.
- [x] A successful publish records an already-read notification, so it appears
      in the list without lighting the badge.
- [x] Repeated automatic checks with an unchanged result keep exactly one entry
      per project and do not re-light the badge once it has been read.
- [x] With notifications turned off nothing new is recorded, and the panel
      explains that and offers a way into the setting.
- [x] The preference persists only once chosen, following `usePersistedChoice`;
      an untouched install keeps following the code default.
- [x] Settings has a Notifications section, reachable from the section rail and
      from the command palette, in English and Spanish.
- [x] Unit tests cover the domain (collapsing, unread accounting, cap) and the
      panel (empty, disabled, badge, action, keyboard dismissal).
- [x] `pnpm run check` passes.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/architecture/frontend-feature-guide.md`
- `src/app/App.tsx`
- `src/app/preferences.ts`
- `src/features/settings/SettingsPanel.tsx`
- `src/features/sync/useAutomaticRemoteCheck.ts`

# Dependencies

None. Task 089 already provides the automatic remote check this listens to.

# Decisions

**In-app centre, not operating-system notifications.** GitHub Desktop raises OS
toasts, which is the right call for an app whose events arrive from a server
while it is minimised. GitOdile's events arrive from a timer inside the app
itself, so an OS toast would add a dependency, a capability, a Windows shortcut
requirement and a permission prompt to say something the window could say by
itself. The centre is also the thing OS notifications would need afterwards
anyway: a place the notification can point at. Native delivery stays a follow-up
that can reuse this store unchanged.

**Titlebar, not the status bar.** The status bar reports current state and is
already dense; a bell is an inbox. The requested position — beside the window
controls, where the release badge used to be before task 086 — puts it in the
window furniture where desktop apps keep it.

**Rendered at display time, not at record time.** A notification stores its kind
and typed payload, never a translated string, so switching language in Settings
re-renders the existing list instead of freezing it in the language it was
recorded in.

**Session-scoped, in memory.** A notification about an upstream state is only
true for as long as that state holds; restoring a week-old "changes are waiting"
badge would be a claim the app has not verified. Persistence is a decision to
take when there is a kind worth surviving a restart.

**A kind table, not an origin flag at the call site.** Whether a kind arrives
read and whether it collapses are facts about the kind, not about who recorded
it, so they live in one exported record the store consults.

# Implementation notes

## Shape

`src/features/notifications/` is the first feature with no port and no
`tauriAdapter.ts`, because it has no transport: it records outcomes the
composition root already sees. `docs/ARCHITECTURE.md` now says so, together with
the rule that a feature like it must not grow a read of its own to fill the gap.

- `domain.ts` — the `NotificationDetails` union, `NOTIFICATION_KINDS` (tone,
  collapsing, unread-on-arrival), `recordNotification`, unread counting, and the
  single action lookup. Pure and language-free.
- `useNotificationCenter.ts` — the session store, gated on the preference.
- `NotificationCenter.tsx` — the bell, the badge, and the portalled panel.
- `notifications.css`, `translations.ts`, `index.ts`.

## Wiring in the composition root

- `src/app/App.tsx` owns the store and mounts the bell between
  `.window-titlebar__drag` and `.window-controls`.
- The automatic-cadence `onCheck` is the only check that records. It reads the
  resolved `TeamSyncStatus` for the available-changes case; because
  `syncController.check` resolves `null` for both a failure and a superseded
  request, the failure branch reads the error back from
  `selectTeamSyncState(projectRuntime.getSnapshot(), projectId)` instead of
  inferring it from the null — a superseded request therefore records nothing.
- `onPublished` records the receipt.
- The notification's action activates its project when it is not the active one
  and completes through a small pending-id effect, because
  `startSessionOperation` reads the active session of the render that called it.

## Deviations and corrections found while building

- **Focus on open.** `usePortalFlyout`'s `"first-control"` mode would have put
  focus on "Clear all" — a destructive button, reached by Enter, on a surface
  people open to *read*. The panel takes `tabIndex={-1}` and focuses itself
  instead; Tab then reaches the rows in order.
- **Unread row contrast.** The obvious `--surface-active` wash measured 4.42:1
  for `--text-secondary` on the dark panel — under AA for the 11px/12px text
  these rows are made of. Replaced with a 10% accent mixed opaquely against
  `--surface-raised`, plus an inset accent bar so the state is not carried by
  colour alone.
- **`settingsSectionLabel`** was a six-deep ternary chain; adding a section made
  it a record instead, so the next section fails to compile until it is named.
- **The Settings section was rebuilt after review.** Its first group repeated
  "Notifications" as a heading inside the Notifications tab with a one-line
  subtitle under it — a shape no other section uses, and one that tells the
  reader nothing. The groups now name the situation ("While you're doing
  something else") and the contents ("What you'll be told about"), and the
  bullet list of events became ordinary settings rows: each carries the tone
  icon the notification itself will wear, a name, and a sentence saying when it
  happens and why it is worth being told. They keep their horizontal layout
  under 800px, where every other row stacks to give its control room — these
  have no control, so stacking would only orphan the icon.

## Second review pass

A deliberate re-read of the whole change before committing, which found more
than the settings copy the review started from:

- **A parked intent that nothing cleared.** The notification action used to
  store the project id in state and let an effect open the review flow once the
  activation landed. `activateSession` declines outright while a blocking dialog
  is open, and the parked id survived that refusal — so the review dialog would
  appear unbidden the next time that project happened to become active. Replaced
  by an optional `sessionId` on `startSessionOperation`: the activation and the
  dialog now happen in one gesture, naming the session explicitly, and the state
  and its effect are gone.
- **A manual check could be reported back to its own author.** The sync
  controller deduplicates, so a cadence tick landing inside a manual check's
  window received that check's promise and recorded from it. The tick now skips
  entirely when a check is already in flight — the deduplicated request was
  never going to reach the network twice.
- **A diverged upstream promised a flow that would refuse.** `behind > 0` also
  matches `diverged`, and `actions_for` in `src-tauri/src/sync/mod.rs`
  deliberately offers no `ReviewAndGet` for it because the update is
  fast-forward-only. The predicate is now `state === "behind"`; diverged waits
  for task 065-4, which will be able to do something about it.
- **The panel never actually took focus.** `usePortalFlyout` renders the popup
  `visibility: hidden` for one frame while it measures, and a hidden element
  cannot be focused — so the effect gated on `isOpen` silently did nothing and
  focus stayed on `<body>`. jsdom has no such rule, so the test passed. Now
  gated on the resolved visibility, and verified against the running app.
- **A note about a setting with no route to it.** The "notifications are turned
  off" line above a non-empty list had no way into Settings; only the empty
  state did. Both render the same button now.
- **Two kind-to-icon tables.** Settings promises in so many words that its icons
  are the ones the notification will wear, while keeping its own copy — and the
  panel keyed its glyph by *tone*, which is a colour, not a meaning. One table
  in `features/notifications/icons.ts` now serves both, keyed by kind.
- **Smaller:** `notificationDetailsEqual` fell through to `false` for an
  unhandled kind, which silently means "always re-light the badge"; it is now a
  `switch` closed by a `never` guard. `markNotificationsRead` cast its readonly
  input to mutable. A blank error reason produced an entry with no explanation
  at all. Clearing the list dropped focus to `<body>`.

## Found here, fixed in task 101

`usePortalFlyout` had the same focus-a-hidden-element bug for every one of its
callers — the rail menus, the add-project menu, the sidebar jump menu — and
their tests passed under jsdom for the same reason ours did. This task shipped a
local workaround; [task 101](101-anchored-popups-take-focus.md) fixed the shared
hook, added a `container` focus target for this panel, and removed the
workaround, so there is one mechanism again.

## Follow-up

Operating-system notifications through `@tauri-apps/plugin-notification` remain
out of scope and can reuse this store unchanged; they would add a dependency, a
capability entry, and the Windows toast-shortcut and macOS permission flows.

# Validation

```bash
pnpm run check
```

Exit code 0 on 2026-09-01, captured directly rather than through a pipe:

- `check:docs` — passed over 154 Markdown files and 121 task ids.
- `check:architecture` — passed over 328 modules, seeded guards reported.
- `typecheck` — clean.
- `test` — 608 tests in 68 files, all passing. New: `domain.test.ts` (13),
  `useNotificationCenter.test.tsx` (5), `NotificationCenter.test.tsx` (10), plus
  two App-level tests and one Settings test.
- `build` — succeeded.
- `check:rust` — `cargo fmt`, `clippy -D warnings`, and 319 tests passing.

## Coverage, stated exactly

- The automatic cadence is covered end to end in `src/app/App.test.tsx`
  ("records both outcomes of an automatic check…"): fake timers installed before
  the render, the interval advanced, then the unread badge, the panel contents,
  the review flow it opens, and the failed-check entry after a rejecting check.
  Testing Library's `waitFor` only advances *jest* fake timers, so that test
  settles the clock explicitly and uses `fireEvent`.
- A manual check recording nothing is covered in the same file.
- The publish receipt is covered at the domain and panel level — the kind table
  is what makes it arrive read — not by an end-to-end publish test. There is no
  existing App-level publish flow to extend, and building one for this line was
  not worth its weight.

## Measured in the running app

Verified against the dev server rather than by screenshot:

- The bell is 36×36 at the titlebar's vertical centre (4px above and below in a
  44px bar), with 4px between the drag region and 4px before the window
  controls, and it precedes them in the DOM.
- The panel opens as a labelled `dialog`, 380px wide, entirely inside the
  viewport with an 8px margin at the right edge.
- Contrast, compositing every translucent layer, in both themes:
  unread row title 11.96:1 dark / 15.32:1 light, description and meta 4.87:1 /
  4.69:1; read row 14.87:1 and 6.06:1 dark, 17.49:1 and 5.36:1 light; tone icons
  4.82–10.08:1; unread bar 7.23:1 / 4.72:1; badge 6.48:1 / 6.19:1. Every text
  pair clears AA and every non-text pair clears 3:1.
- The badge stays inside the trigger's box at its widest label ("9+").
- In the Settings section, the event rows put a 26px icon at the row start with
  a 12px gap and the label on the same baseline, at both 1280px and 760px wide,
  with no horizontal overflow; the enable switch sits at the row end like every
  other toggle in the panel.
