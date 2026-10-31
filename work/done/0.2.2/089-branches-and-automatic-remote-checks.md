---
id: 089
title: Disclose stale Branches and offer automatic remote checks
status: done
priority: normal
type: improvement
areas:
  - frontend
  - branches
  - sync
  - settings
  - accessibility
created: 2026-08-30
completed: 2026-08-30
parent:
queue:
---

# Goal

Complete the freshness model from task 088: Branches must admit when filesystem
watching is off, and remote comparison may run on a user-selected cadence
without becoming tied to any screen.

# Decisions

- Branches reuses the shared automatic-updates notice above its title. Its manual
  action refreshes only the local branch inventory, remains mounted while
  loading, and General settings remains one click away.
- Automatic remote checks are opt-in. The saved choices are Never, every 15
  minutes, every 30 minutes, and every hour; invalid stored values fall back to
  Never.
- One timer follows only the active project session. Navigation never starts a
  check, changing project/session resets the cadence, and projects without a
  branch, remote, or upstream do no background network work.
- The existing sync controller remains the concurrency owner, so an automatic
  tick that overlaps a manual check reuses the in-flight request.
- [GitButler's public settings](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/but-settings/assets/defaults.jsonc)
  use a 15-minute automatic-fetch default. The reusable principle is a coarse
  application-level setting; GitOdile keeps it opt-in to preserve its
  explicit-network and local-first promise.

# Acceptance criteria

- [x] Branches shows the same watcher-off/unavailable notice as Changes and History.
- [x] Branches can update from that notice without hiding it during progress.
- [x] General settings offers a compact, persisted remote-check frequency.
- [x] Remote checks are screen-independent, active-project-only, and deduplicated.
- [x] English and Spanish copy, keyboard access, narrow layout, and tests cover
      the new controls.

# Validation

- `pnpm run check` passed: documentation and frontend architecture checks,
  TypeScript, 58 frontend files / 475 tests, production build, Rust formatting,
  Clippy, and 306 Rust tests.
- Follow-up hardening makes cached Branches refreshes expose their busy state, so
  the shared action visibly changes to “Updating…” and disables until the real
  controller read settles. General settings now uses the same keyboard-ready
  segmented choice treatment as its Theme and Language controls instead of a
  platform-native select.
- Local browser inspection verified the selected and unselected cadence states
  in the dark theme with no console errors.
