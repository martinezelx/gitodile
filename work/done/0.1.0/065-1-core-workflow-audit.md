---
id: 065-1
title: Prove the existing core workflow end to end
status: done
priority: high
type: audit
areas:
  - frontend
  - rust
  - testing
  - desktop
created: 2026-08-18
completed: 2026-08-21
parent: "065"
---

# Goal

Establish a repeatable, evidence-backed baseline for everything GitOdile
already claims before new `1.0.0` features are developed.

# User outcome

The current open → inspect → save → check → get → publish workflow behaves as
one coherent product, including errors, restart, and recovery, rather than only
as individually tested features.

# Context

Unit and feature tests were extensive, but the project did not own one
release-oriented end-to-end capability matrix. This audit added that evidence
and fixed only defects in behavior already advertised as delivered.

# Scope

- Define or reuse fixtures for a new local project, clean tracked project,
  dirty project, configured remote, ahead, behind, diverged, detached, unborn,
  conflicted, and unavailable/malformed remote states.
- Exercise open from root/nested path, recent switching, close/reopen, status,
  diff, selected/all save, discard/Undo, branch create/switch/delete, check,
  fast-forward get, and publish as connected journeys.
- Verify hooks, signing/identity errors, watcher invalidation, stale plans,
  operation locking, uncertain outcomes, keyboard/focus, both locales/themes,
  and restart boundaries already promised by the current product.
- Produce a capability matrix with automated, Windows desktop, CI-only, and
  currently unmeasured evidence distinguished explicitly.
- Fix only regressions or contract gaps in already-delivered features and add
  the narrowest missing integration tests.

# Out of scope

- Clone, project creation, History, non-fast-forward integration, conflict
  resolution, Recovery screen, stashes, or provider login.
- Broad visual redesign or architecture migration.
- Claiming macOS/Linux runtime evidence that was not observed.

# Acceptance criteria

- [x] A documented matrix maps every README capability to at least one
      automated check and identifies required manual desktop evidence.
- [x] One hermetic test journey covers open, inspect, save, fetch/check,
      fast-forward get, publish, and reopen against real Git repositories.
- [x] Connected branch and discard/Undo journeys are verified.
- [x] Diverged/conflicted cases stop safely and point to the correct planned
      future capability without raw or misleading errors.
- [x] Existing loading, empty, stale, partial, failure, uncertain, restart, and
      accessibility states are audited; discovered defects are fixed or logged
      as scoped follow-ups with severity.
- [x] README and roadmap current-state claims match the evidence exactly.
- [x] `pnpm run check` passes and the exact Windows desktop audit environment is
      recorded; non-Windows limitations remain explicit.

# Capability matrix

“Existing” names the pre-audit automated evidence. “New” is the connected
evidence added by this task. A dash in the Windows column is an explicit manual
coverage gap, not an implication that the capability failed.

| README capability | Existing automated evidence | New 065-1 evidence | Windows release desktop evidence | CI-only or not yet measured |
| --- | --- | --- | --- | --- |
| Open root/nested folders and switch recent projects | `repository_tests.rs`, `main.test.tsx`, project/session controller tests | Core journey opens the root and a nested folder as the same project/session | Native picker opened the temporary project; close/reopen succeeded | Nested-picker path not repeated manually; covered with real Git in Rust |
| Restore sessions with isolated epochs | Session IPC/Rust tests and startup/restore tests in `main.test.tsx` | Core journey closes/reopens, rejects the old epoch, and keeps a second project isolated | Release app skipped one unavailable saved project with an honest notice, then closed and reopened the valid project cleanly | Process-restart permutations remain automated; all-platform runtime is 065-8 |
| Inspect all working-tree states | `status_tests.rs` and overview/changes presentation tests | State journey covers unborn clean/dirty, clean, detached, conflicted, ahead, behind, and diverged repositories | Dirty and clean summaries were observed in the shipped WebView | Ignored/renamed/deleted combinations remain feature-test evidence |
| Read text/binary/oversize diffs and virtualized lists | `changes_tests.rs`, `DiffResultView.test.tsx`, `ChangesPanel.test.tsx` | Core journey reads unstaged and staged file diffs; conflict journey reads the unmerged diff safely | Text diff, removed/added labels, search, selection, and empty state observed | Binary/oversize and 1,000-entry/400-row limits are automated/CI and performance-baseline evidence |
| Discard with recovery and Undo | `discard_tests.rs`, recovery tests, `ChangesPanel.test.tsx` | Discard journey discards one file, restores it with Undo, and then saves it | — | Full destructive desktop repetition was avoided; recovery semantics use real Git in Rust |
| Watch, debounce, invalidate, or disclose watching off | `watch` Rust tests, invalidation controller tests, `useProjectRuntime`/Changes tests | Session journey verifies refreshed state after each mutation | Initial/live screen transitions and explicit refreshes observed | High-churn, huge-repository, network-drive, and long-soak watcher behavior remains 065-8 |
| Save all/selected changes with hooks, signing, and index protection | `save_version_tests.rs`, `SaveVersionDialog.test.tsx`, save controller tests | Core journey saves one selected file, proves another remains, then saves all using a collision-safe temporary index | Partial and all-file previews/results observed; real commits `c8a7790` and `a8813a6` created | Real interactive hooks, hardware signing, and credential prompts were not driven manually; failure contracts are automated |
| Discover remotes and preview/publish with uncertain outcomes | `remote_tests.rs`, `publish_tests.rs`, publish frontend tests | Core journey publishes to a temporary bare remote and proves the remote ref moved | Two local saved versions were previewed and published to a local bare `origin` | Provider/network ambiguity and credentials remain 065-7; uncertain-outcome classification is automated |
| Check/fetch without moving the worktree | `sync_tests.rs`, sync controller and `TeamChangesSection.test.tsx` | Core journey fetches a teammate commit and proves local HEAD/files do not move | “Check again” found exactly one incoming version after a separate clone pushed it | Unavailable/malformed remotes are automated; real WAN/proxy/offline behavior remains 065-7/065-8 |
| Review and get a strict fast-forward with recovery | `sync_tests.rs`, `GetTeamChangesDialog.test.tsx` | Core journey plans/applies the fast-forward, verifies the durable recovery ref and updated file; diverged journey blocks safely | Preview showed commit, author, file, destination, forbidden implicit actions, and recovery; apply reached `15fc140` | Crash/kill at every mutation boundary and filesystem lock variants remain release-hardening evidence |
| List/create/switch/delete branches safely | `branches_tests.rs` and branches frontend/controller tests | Branch journey creates without switching, switches both ways, and safely deletes the branch | Branches screen was present but the mutating path was not repeated manually | Publish-a-new-branch/provider behavior remains existing automation and 065-7 diagnostics |
| Configure themes, locales, Git/tooling, reading, watching, confirmations | Settings, tooling, i18n, and theme-transition tests | No new domain fixture required | Light and dark rendered; English and Spanish settings/main UI rendered; safety/watch settings inspected | Missing/broken Git and platform update variants remain automated/CI; macOS/Linux UI runtime remains 065-8 |
| Explain and configure line endings and overrides | Tooling Rust tests and `SettingsPanel.test.tsx` | No new fixture required | Settings surface inspected; line-ending mutation was not needed for the core journey | `.gitattributes`, project override, and platform line-ending matrices remain automated/CI |
| Command palette, keyboard dialogs, keep-alive screens, suspended hidden work | App-shell, screen-module, dialog, focus, and `main.test.tsx` tests | Session isolation journey exercises lifecycle boundaries below the UI | `Ctrl+K` opened the palette with focus in search; Escape restored the screen; dialogs/native picker were keyboard-addressable | Screen-reader software and macOS/Linux native focus behavior remain 065-8 |

CI additionally runs frontend checks on Linux, Rust checks on Windows, macOS,
and Linux, and release-compiles the desktop executable on macOS/Linux. Those
compile results are not runtime, assistive-technology, packaging, signing, or
notarization evidence.

# Hermetic fixtures and journeys

`src-tauri/src/tests/core_workflow_tests.rs` uses `TempDir`, the system Git
argument-vector runner, local working copies, and a local bare remote. It has no
network, account, provider, global identity, or persistent repository
dependency.

- `core_workflow_journey_opens_inspects_saves_checks_gets_publishes_and_reopens`
  connects root/nested opening, status/diffs, selected/all save, initial
  publish, explicit check, teammate push, behind status, strict fast-forward
  with a verified recovery ref, another save/publish, close/reopen, stale-epoch
  rejection, and two-project session isolation.
- `discard_and_branch_journey_undoes_then_creates_switches_and_deletes`
  connects selected discard, persistent Undo, saving the restored file, branch
  creation without switching, switching both directions, and safe deletion.
- `repository_state_journey_covers_unborn_dirty_clean_detached_conflicted_and_sync_relations`
  covers unborn clean/dirty, clean, detached, an intentional merge conflict,
  conflict diff/batch exclusion, ahead/behind/diverged relations, and proof
  that a diverged get plan stops without moving HEAD and points at the planned
  integration/conflict work.

Existing hermetic suites remain the evidence for unavailable/malformed remotes,
binary/oversize files, hooks/signing/identity failures, and more exhaustive
per-operation failure injection; duplicating them inside the connected journey
would make the audit slower without adding a new boundary.

# Cross-cutting audit

| Concern | Evidence and conclusion |
| --- | --- |
| Hooks, signing, identity, real-index protection | `save_version_tests.rs` verifies hooks are preserved, signing/identity failures surface, the real index is restored, and temporary indexes cannot collide. No bypass was added. |
| Stale plans | Save, discard, publish, get, and branch suites revalidate state tokens before mutation. The new journeys use planned operations instead of direct Git mutation for product actions. |
| Watcher and invalidations | Rust watcher debounce/path-filter tests and frontend repository invalidation tests cover active/hidden/watch-off behavior. Long-soak and network-drive behavior remains 065-8. |
| Concurrent operations | `repository_access` tests prove common-git-directory read sharing and exclusive mutation locks across worktrees/sessions. |
| Uncertain outcomes | Publish distinguishes an uncertain remote result; get distinguishes uncertain local completion and never attempts an automatic repair after ambiguity. Failure injection remains automated. |
| Loading/empty/stale/partial/error/success | Feature tests cover every state; Windows observed loading, dirty, partial selection/save, empty/clean, fresh behind, success, and cached/not-checked-after-reopen. An intentionally unavailable restored project exercised the partial-restore notice. |
| Keyboard/focus/accessibility | Dialog and shell tests cover focus trap/return, Escape, labels, non-color diff cues, live regions, inert hidden screens, and reduced motion. Windows verified palette focus and native/product dialogs; dedicated screen-reader runs remain 065-8. |
| English/Spanish and light/dark | Translation-key parity and theme-transition tests pass. Both locales and both explicit themes were rendered in the release executable. |

# Defects found and corrected

- **P2 accessibility — corrected.** After a successful get changed the visible
  card to “You’re up to date”, the hidden sync live region could retain “1 newer
  team version is available”. `TeamChangesSection` now updates an established
  announcement whenever sync truth changes; a regression test covers the
  behind → up-to-date → ahead sequence.
- **P3 documentation — corrected.** README test totals had drifted to 295/225.
  They now report the validated 362 frontend and 247 Rust tests.

No missing future capability was implemented. Non-fast-forward integration is
still 065-4, conflict resolution is epic 037, Recovery UI is 065-5/065-6,
credentials/real remote diagnostics are 065-7, and all-platform runtime,
assistive-technology, packaging, signing, large-repository, and soak evidence
remain 065-8.

# Windows desktop validation

Validated the production release executable at
`src-tauri/target/release/gitodile.exe`, built from commit
`10a44e49a963742805cea6d85798aa2eec51b684` plus this task's uncommitted changes,
directly on `main`.

| Layer | Exact audit environment |
| --- | --- |
| OS | Microsoft Windows 11 Home 64-bit, version `10.0.26200`, build `26200` |
| Hardware | ASUS ExpertBook PM1403CDA; AMD Ryzen 7 7735HS, 8 cores/16 logical processors; 16 GB RAM |
| WebView2 Runtime | `151.0.4129.86` |
| Git | `2.55.0.windows.3` |
| Node / pnpm | `v24.16.0` / `11.17.0` |
| Rust / Cargo | `1.97.1` / `1.97.1` |
| Locale/themes | English and Spanish; explicit dark and light |

The desktop fixture lived under
`%LOCALAPPDATA%\Temp\gitodile-desktop-audit-20260821122012` and contained
`project`, `team`, and a local bare `remote.git`. The release UI opened the
project through the Windows folder picker, inspected two dirty files and their
diff, saved one then the remainder, published both, detected a separately
pushed teammate commit, reviewed and applied the fast-forward with a visible
recovery ref, reached clean/up-to-date, closed the project, and reopened it.
It also rendered the honest skipped-project notice for an unavailable entry
from an earlier saved session.

No real macOS or Linux window, WKWebView/WebKitGTK runtime, native picker,
credential helper, accessibility API, signing/notarization flow, or packaged
installer was exercised. ADR 0006 and task 065-8 continue to own those gates;
this audit makes no cross-platform runtime-readiness claim.

# Validation

- `cargo test --manifest-path src-tauri/Cargo.toml core_workflow_tests -- --test-threads=1`
  — passed 3 new real-Git journeys in 39.12 s.
- `pnpm exec vitest run src/features/sync/TeamChangesSection.test.tsx --reporter=dot`
  — passed 10 tests including the new live-region regression.
- `pnpm run tauri -- build --no-bundle` — passed; Vite production build and
  Rust release executable completed successfully.
- `pnpm run check` — passed the final task state: documentation/task metadata,
  architecture boundaries, TypeScript, 362 frontend tests, production build,
  Rust formatting, Clippy with warnings denied, and 247 Rust tests.

# Decisions

- Test user journeys across feature boundaries rather than duplicating every
  existing feature test.
- A discovered missing capability belongs to its roadmap task; a broken claim
  in delivered behavior belongs here.
- Keep local bare remotes and isolated per-command Git identity in the audit so
  the test never consumes user configuration, credentials, or a network.
