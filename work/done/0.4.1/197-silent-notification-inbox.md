---
id: 197
title: Keep notification reading deliberate and persist the silent inbox
status: done
priority: normal
type: feature
areas:
  - frontend
  - design
  - platform
created: 2026-10-23
completed: 2026-10-24
parent:
queue:
---

# Goal

Make the notification centre a dependable local inbox: opening it never clears
unread state, individual notices can be deliberately marked read or unread,
and notices survive an application restart. Keep the application silent.

# User outcome

A brief visit to the bell cannot hide notices the user has not reviewed.
Reading, removing a notice, and completing the action it describes have clear,
separate meanings. The application remains silent.

# Context

Requested and approved for task creation on 2026-10-23 after a code and
product-reference review. The user subsequently requested implementation ahead
of the queue and explicitly deferred sound on 2026-10-23. Existing queue
priorities are otherwise unchanged.

Before this task, the composition root bound the panel's `onOpened` to
`markAllRead`. The panel preserved a snapshot of unread IDs for its visual row
markers. Opening cleared even off-screen notices, and arrivals while open could
lack their unread marker. The store held at most 50 notices in session memory.
Repeated equivalent background notices collapsed; publish receipts arrived read.
Keep those useful noise-reduction rules.

# Scope

- Deliberate individual and bulk read controls, with live unread rendering.
- Bounded local persistence of the inbox, read state and deduplication metadata.
- Distinguish an update notice's read state from actual update availability.
- Accessible English and Spanish controls, preserving the existing panel's
  visual direction and keyboard/focus behaviour.
- Keep the app silent: no sound preference, audio asset or sound trigger.

# Out of scope

- Operating-system notifications, tray/dock badges, cloud notification sync,
  email, scheduled reminders or a new notification screen.
- Automatically downloading, installing or restarting to update the app.
- Adding audio to every success, warning, Git operation or background check.
- New clone/CI/conflict notification producers merely to populate the inbox.
- A sound library, custom uploaded audio, per-event sound pickers or analytics.

# Acceptance criteria

## Deliberate reading

Visual follow-up: individual read/unread glyphs share the dismiss control's
hover/focus reveal, keep their layout space, and remain visible without hover.
Verified in the desktop app with the sample inbox and keyboard focus.

- [x] Opening or closing the panel, hovering, scrolling, focusing a row, clicking
  outside, and pressing Escape leave every notice's read state unchanged.
- [x] Each notice offers Mark as read / Mark as unread. The controls work with
  keyboard and assistive technology; meaning is not conveyed by colour alone.
- [x] Mark all as read is a double-check glyph with tooltip/accessibility name,
  separate from Clear all and disabled when appropriate,
  and does not delete notices. A notice arriving after the bulk action remains
  unread; deleting one notice affects only that notice.
- [x] Invoking a notice's meaningful review action marks only that notice read
  when its intended destination is successfully opened. Failed routing, such
  as an unavailable project, does not silently acknowledge it.
- [x] Bell count, accessible names and row dots use current read state, including
  arrivals and replacements while the panel is open. Remove the frozen
  `seenUnreadIds` workaround. Retain the accent dot and reduced-motion support.
- [x] Marking read never moves focus out of the panel. Deleting a focused row
  transfers focus predictably to another row/control; no accidental destructive
  action is focused on opening the panel. Read/dismiss share one row, identical
  28px targets and 14px glyphs centred at the same height.
- [x] Existing grouping remains: identical background news does not become
  unread again; materially different news may. Publish receipts remain read.

## Persistence and update semantics

- [x] Restore the bounded inbox and read states after restarting. Validate a
  versioned stored shape, bound record sizes, reject unsupported/corrupt records
  safely and avoid ID collisions with newly created notices.
- [x] Persist only the bounded data needed for the local inbox, in app-owned
  storage. No new remote reads, repository scans or timers arise from opening
  the panel or restoring history. Review error text for secrets before storing
  it; do not introduce persisted raw command output or credentials.
- [x] Keep the existing 50-notice limit and document retention/eviction. Bound
  deduplication metadata separately, retaining acknowledgment of the currently
  offered app version even if its card is removed or evicted.
- [x] Turning recording off stops new recording without erasing the existing
  inbox. Persistence failures leave a usable in-memory inbox and an honest,
  non-recursive indication that history could not be saved.
- [x] Reading or removing an app-update notice does not install anything or hide
  the available update in Settings. A repeated check for the same acknowledged
  version does not restore its unread alert; a genuinely newer candidate can.
  Reconcile stale update actions with the updater's current authoritative state.

## Sound deferred by user decision

On 2026-10-23 the user explicitly asked to leave sound aside and keep the app
silent. No sound controls, assets or playback are part of this implementation.
The earlier suggestions (a single background update-discovery cue and a
long-download completion cue, with opt-in and deduplication) remain discussion
history only and require a separate future request before implementation.

## Validation and documentation

- [x] Cover read transitions, bulk-action arrivals, same-news/new-news grouping,
  persistence corruption/limits/IDs, removed update deduplication, and update
  availability independent of acknowledgment with focused tests.
- [x] Exercise the running desktop app: open/close unread update, individual and
  bulk marking, restart, empty states, keyboard focus and both themes/languages.
  Cover live arrivals, reduced motion and disabled/error states with focused
  automated coverage as appropriate. Confirm that no audio was introduced.
- [x] Update [DESIGN.md](../../../DESIGN.md) for the final interaction
  rules, [README.md](../../../README.md) for delivered behaviour, and
  [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) for any durable ownership or
  persistence boundary. These documents remain the authoritative long-term
  rules; this task records scope and execution evidence.
- [x] Run `pnpm run check` and record the exact result before marking this task
  complete, together with platform/UI validation and honest remaining limits.

# Relevant files

- [Notification panel](../../../src/features/notifications/NotificationCenter.tsx)
- [Notification store](../../../src/features/notifications/useNotificationCenter.ts)
- [Notification domain](../../../src/features/notifications/domain.ts)
- [Composition root](../../../src/app/App.tsx)
- [App preferences](../../../src/app/preferences.ts)
- `src/features/settings/`
- `src/features/app-updates/`
- [Frontend feature guide](../../../docs/architecture/frontend-feature-guide.md)
- [Prior notification styling review](../0.4.0/188-dialog-and-notification-design-review.md)

# Dependencies

The inbox can be implemented with existing notification/updater ownership.
Originally appended at Q24; implementation ahead of the queue is now explicitly
authorized. Sound is deferred and is not a dependency.

# Decisions and references

- Approved: deliberate reading, separate read/delete actions, live unread
  rendering, local persistence and update availability independent of reading.
- Sound explicitly deferred; future audio or new event producers require separate scope.
- Keep event policy in the notification domain/controller. Visual components
  render data and callbacks; the composition root supplies existing outcomes.
  Do not make notification views fetch updater or repository state.
- Before implementing updater/asynchronous integration, study the smallest
  relevant public GitButler implementation as required by AGENTS.md; record the
  reusable principle and check licenses before adapting protected material.
- Reference review used official documentation, not hands-on parity testing:
  [GitHub inbox actions](https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox),
  [Linear inbox](https://linear.app/docs/inbox),
  [VS Code notification guidance](https://code.visualstudio.com/api/ux-guidelines/notifications),
  [GitKraken Kepler notification settings](https://help.gitkraken.com/kepler/settings/).
  Borrow deliberate controls and attention discipline, not another product's
  entire inbox model or default sound policy.

# Implementation notes

- The panel derives unread styling directly from each live notice. Individual
  read/unread and bulk-read controls are separate from removal. Review callbacks
  acknowledge only successful routing; unavailable destinations keep the notice
  unread and explain why. Removal transfers focus to a neighbouring row or panel.
- Feature-owned persistence validates a version-1 envelope, limits input to
  512,000 characters and fifty notices, bounds fields and rejects duplicate IDs.
  Detailed failure reasons and unknown payload fields are never serialized.
  A separate acknowledged app version survives deletion/eviction; a new candidate
  can still arrive unread. Session counters skip restored IDs without requiring
  Web Crypto in older WebViews.
- Restored failures have no detailed reason; missing text alone does not count
  as new trouble. Known live reason changes retain the existing re-alert rule.
- Update notices use historical wording and open the current updater snapshot,
  without restoring a stale candidate or triggering a download/check/install.
- Sound was explicitly deferred. No sound setting, playback, assets or new
  notification producer was added. No Rust, Git-operation or updater-policy
  change was required.
- Inspected GitButler's public
  [AppUpdater.tsx](https://github.com/gitbutlerapp/gitbutler/blob/master/apps/lite/ui/src/AppUpdater.tsx)
  on 2026-10-23: one updater owner supplies current status, a stable notification
  identity groups update feedback, and progress rendering is kept from reviving
  a dismissed notice. Reused the principle of separating notice lifecycle from
  authoritative update state. No source, assets or protected material adapted.
- Windows desktop validation used temporary local notices and backed up the
  existing inbox/theme/language for restoration. Dark/English and light/Spanish
  showed the same controls without clipping. Open/Escape/reopen preserved unread;
  individual read/unread, Enter and bulk read changed only acknowledgment and
  retained cards. A closed-project action stayed unread and explained failure.
  Reviewing an update opened the native development-build updater state instead
  of the fixture's candidate. Read state survived renderer reloads and a
  separate process restart. Following the user's screenshot review, replaced
  the labelled bulk-read button with a double-check icon/tooltip and moved the
  row dismiss into the same flex action row as reading. The desktop screenshot
  confirmed both glyphs on the same axis. The original inbox was restored,
  temporary backup keys removed, developer tools closed and the panel returned
  to its empty state. Preserved the user's current dark/Spanish preferences
  after they changed the theme during the pause, instead of overwriting them
  with the earlier pre-validation preferences.

# Validation

Task creation, 2026-10-23 (documentation only; no product implementation):

- `pnpm run check`: documentation/link/queue checks, updater contracts, release
  highlights, 52 release tests, icon generation checks and 21 icon tests passed.
  Frontend architecture, TypeScript, 148 frontend test files / 1,606 tests and
  production build passed. Vite reported the existing entry chunk above 500 kB.
  Rust formatting and Clippy passed. The Rust test build stopped with exit 101:
  Windows denied removing `src-tauri/target/debug/gitodile.exe` (OS error 5).
  The aggregate gate therefore did not pass and Rust tests were not completed;
  no application was stopped to clear the file lock.
- At task creation, product acceptance criteria were still pending. The
  implementation results below supersede that initial gate attempt.


Implementation completion, 2026-10-24:

- `pnpm run check`: exited 0 for the core implementation before the final visual
  follow-up. Documentation, update contracts, 52 release tests, 21 icon tests,
  architecture, strict TypeScript, 149 frontend test files / 1,640 tests and
  production build passed. Rust formatting/Clippy passed; 623 Rust unit tests
  and the credential-helper integration test passed, with one existing ignored
  Rust test. No native/Git workflow implementation changed.
- Initial aggregate runs timed out on the existing cross-screen context test's
  one-second lazy Branches wait; the focused test passed. Its specific wait now
  uses five seconds, like the file-selection wait in that same test, without
  changing navigation behaviour or global test timeouts.
- After the icon/alignment follow-up, `pnpm exec vitest run
  src/features/notifications` passed all 75 tests. `pnpm run check:frontend`
  passed architecture and TypeScript but hit a five-second timeout in the
  existing Settings integration case under default concurrency.
- Final `pnpm exec vitest run --passWithNoTests --maxWorkers=4`: exited 0,
  149 files and all 1,640 tests passed. The repository's `--passWithNoTests` flag
  matters because its native `node:test` files contain no Vitest suites; an
  exploratory invocation without that flag exited 1 for those eight files
  despite all 1,640 product assertions passing. The final run uses the configured
  flag and limits concurrency, without weakening assertions or Settings timeout.
- Final `pnpm run build`: exited 0, including TypeScript. Vite still reports the
  pre-existing entry-chunk threshold warning (final entry 525.73 kB); no lazy
  overlay boundary or dependency was added to suppress it.
- Windows Tauri desktop: verified the real panel before and after the visual
  adjustment, including the double-check footer control, aligned read/dismiss
  glyphs, individual/bulk read, keyboard Enter, Escape/reopen, historical update
  routing, closed-project feedback, both themes/languages and persistence after
  renderer reload and a separate process restart. Live-arrival, reduced-motion,
  disabled-state, storage-error and deletion/focus cases have automated coverage.
  macOS/Linux desktop validation was not performed.
- Restored the original inbox, removed the temporary validation backup keys and
  closed DevTools. Kept the user's current dark/Spanish preferences following
  their theme change during the pause. The application remains silent.
- Final `node scripts/check-docs.mjs` and `git diff --check` passed after moving
  this task to `done/`. No commit or remote publication was requested.

## Final review requested before commit, 2026-10-24

- Re-read the complete notification diff, its App integration, persistence
  boundary, translations, styles, tests and documentation. Scope remains the
  approved silent local inbox; no remote mutation or new event producer.
- Found and fixed a keyboard-focus bug: an unchanged automatic check replaced
  its card with a new ID and moved it to the top. Equivalent news now preserves
  ID, position, arrival time and read state while refreshing metadata. Changed
  news still arrives at the top. Added domain and live-panel regression tests;
  the focused notification suite passes all 77 tests.
- Verified the final Tauri panel in light and dark themes: row controls hidden
  at rest, revealed together on hover and keyboard focus, aligned glyphs,
  tooltips, individual read/unread with Enter, and Escape. Restored the original
  dark theme and sample notice's read state, preserving all five user-requested
  sample notices. Prior Spanish validation remains applicable; no translation
  changed during this review.
- The previous hover-follow-up aggregate attempt passed 1,640 frontend tests,
  build, format and Clippy, but Windows locked the running executable during
  the Rust test build. This review closes GitOdile temporarily for the final
  aggregate gate and reopens it afterward.
- The user now explicitly authorizes a local commit once review and validation
  finish. Unrelated untracked `sketches/` files remain outside this task/commit.
  macOS/Linux desktop validation remains unperformed.
- Final `pnpm run check` exited 0 after the review fix: docs/update/release/icon
  checks, architecture, strict TypeScript, 149 frontend files / 1,642 tests,
  production build, Rust formatting and Clippy, 623 Rust unit tests and the
  credential-helper integration test all passed. One existing Rust test remains
  ignored. Vite reports the existing entry-chunk warning (525.78 kB).

## Outside-click follow-up, 2026-10-25

- Reproduced the user's report in the Windows Tauri app: a press on the empty
  titlebar immediately left of the bell left the inbox open. The panel's bounds
  were correct; Tauri's injected drag listener consumed the bubbling mousedown
  with `stopImmediatePropagation` before the flyout's listener could observe it.
- The shared portal flyout observes outside mousedown in capture phase and
  removes that same listener on cleanup. It neither cancels nor stops the event,
  so native dragging still receives the press. Panel size, layout, read state,
  sound policy and notification persistence are unchanged.
- Added a regression reproducing Tauri's earlier document listener. It failed
  against the previous code while the other nine flyout tests passed; it also
  checks that an inside press stays open and the native handler still receives
  the outside press.
- After the fix, the 87 focused notification/flyout tests passed. In the real
  Windows app, reopened the populated inbox and pressed the same titlebar
  position left of the bell: it closed immediately, retaining the sample
  notices and the existing panel layout.
- Final `pnpm run check` exited 0: docs/contracts/release/icons, architecture,
  TypeScript, all 149 frontend files / 1,643 tests, production build, Rust fmt
  and Clippy, 623 Rust unit tests and the credential-helper integration passed.
  One existing Rust test remains ignored; Vite retains the existing 500 kB
  entry-chunk warning. Reopened the app with the saved sample inbox available.
