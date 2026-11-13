# ADR 0044: Give application updates one home

- Status: accepted
- Date: 2026-11-03
- Task: [221](../../work/done/0.5.0/221-one-home-for-app-updates.md)

## Context

The application update was reachable from eight places: the More actions menu,
the macOS menu, the command palette, the notification, the startup toast, What's
new, About and the Settings rail. Those entries ended on four surfaces: an
update dialog, a changelog dialog, About and Settings › Updates. Three of them
were modals, and two opened another modal on top of or in place of
themselves. Three functions described the same `UpdateState` in their own
words. What's new existed twice. A manual check opened a modal before anything
was known, and the answer was nearly always "You have the latest version".
Once a download was ready and its dialog closed, only the Settings rail still
pointed at it.

VS Code, Chrome, Zed and GitHub Desktop were compared. They differ in detail
but share three traits: one place holds the update and its progress, a quiet
mark on an existing control says when something waits, and checking does not
open a dialog.

## Decision

1. Settings › Updates is the one surface that shows the update's state and
   acts on it. The row carries the whole lifecycle in place: check, cancel,
   download, progress, the install consequence beside "Install and restart",
   retry and the manual download where the cause recommends it.
2. Every other way in opens that section. An entry that says "check" checks
   only from a settled state with nothing offered, so it can never replace a
   candidate that is downloading or ready to install.
3. What's new is a group of that section. The changelog dialog is removed;
   every "What's new" opens the section at that group.
4. The update dialog remains only for a restart that did not land on the
   expected version. It is the one update moment that interrupts, and its
   check closes onto Settings › Updates.
5. While a release can be downloaded, installed or retried, the More actions
   trigger carries the notification dot and its update entry names the next
   step; the macOS menu entry's label follows the same state.
6. The notification centre keeps announcing a release found by a background
   check, and its action opens the section. A download that finishes while
   Settings is closed turns that same entry into "X.Y.Z finished
   downloading" and marks it unread again, so the inbox never stops at
   "available" for a release that only needs installing. The title names the
   event, not a state, so it stays true after the install. A background check never runs over a finished
   download, which a check would discard.

## Consequences

- One component renders update state, and About's line is read-only, so the
  surfaces cannot describe one build differently.
- Downloading and installing happen inside the Settings dialog. Closing
  Settings does not stop a transfer; the trigger's dot and the menu entry lead
  back to it.
- What's new no longer has a compact standalone document; reading old release
  notes means opening Settings.
- Any new update affordance must route to the section rather than add a
  surface. DESIGN.md records the rule.

## Alternatives considered

- **Keep the update dialog as the home** and reduce Settings to the switch.
  Rejected: it keeps the modal-on-check and the modal chains, and the dialog
  duplicated what the row already drew.
- **Remove every dialog**, including the wrong-version restart, and show that
  failure in the row. Rejected: the reader expected a new version and is not on
  it, which should be said before anything else.
- **A title-bar pill** (Zed, Chrome) instead of a dot on the menu. Rejected: it
  competes with the project controls for space and has no macOS counterpart,
  where the menu entry's label already carries the state.
