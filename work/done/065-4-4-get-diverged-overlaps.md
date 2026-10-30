---
id: 065-4-4
title: Resolve a diverged upstream's overlaps from Get project changes
status: done
priority: high
type: feature
areas:
  - sync
  - overview
  - frontend
created: 2026-10-29
completed: 2026-10-30
parent: "065-4"
queue:
---

# Goal

Get project changes and the Overview card stop being a dead end when the
remote's versions overlap local saved work: they offer to resolve the overlap
in GitOdile through [065-4-2](065-4-2-pause-on-overlaps.md).

# Scope

- The overlap banner in the Get dialog gains Resolve in GitOdile; the Overview
  card's overlap state leads to it.
- Unsaved or prepared overlaps keep their guidance (save or discard first).
- A paused merge opens the overlapping-changes screen; nothing is published.

# Acceptance criteria

- [x] Card and dialog states tested; the hand-off is tested in the app shell.
- [x] `pnpm run check` passes.

# Dependencies

[065-4-2](065-4-2-pause-on-overlaps.md).

# Implementation notes

- Visual reference: BringInChangesDialog and GetTeamChangesDialog, DESIGN.md
  § Before designing a screen, dialog or panel and § Dialogs. Reuses the
  medium eager Dialog, facts, banners, existing bounded overlap rows and tokens;
  no new styles, overlay loader or conflict editor.
- Uses the existing typed BringInPort/tauriAdapter startOverlap with upstream
  and Get's own plan token and recovery reference. App only composes adoption
  of the verified session, coordinated refresh and navigation to conflicts.
- Saved overlaps expose an explicit Resolve in GitOdile confirmation. Mixed
  or unsaved-only overlaps keep save/discard guidance; prepared blockers keep
  Save version. Clean Get and optional publish retain their existing path.
- A paused merge never invokes clean Get or Publish, including when entered
  from Get and publish. Uncertain starts and failed post-pause handoffs have
  only Close, retain evidence and never retry, abort or repair automatically.
- The recent upstream check is retained; resolution waits for it. Failed
  checks and deleted upstreams block cached resolution. Plan generations
  reject superseded answers and late replies after close, without issuing
  another plan. A stale execution reviews again without retrying mutation.
- Assumptions: native start/pause verification remains the authority, including
  full refs, exact commits, safety footprint and staged-work refusal. No fetch
  is added to either planner or executor. No new platform-specific path code.
- Reference study: GitButler's [but-oplog owner](https://github.com/gitbutlerapp/gitbutler/blob/master/crates/but-oplog/src/lib.rs)
  keeps snapshot ownership explicit. Reused principle: leave recovery/initiation
  with the native owner and pass verified evidence to the resolver. No code or
  assets reused; no architectural decision beyond ADR 0030/0041.

# Validation

2026-10-30, Windows, system Git, disposable repositories and a local bare remote:

- Focused frontend tests: the dialog covers Get and Get-and-publish pauses,
  the exact upstream source/Get token/recovery, busy Escape protection, stale
  review without retry, an uncertain start with Close only, mixed saved/unsaved
  blockers, failed/deleted upstream checks, using the refreshed token, late
  check completion after close, and keyboard focus after refusal. Existing
  clean merge, optional publish, prepared blockers and uncertainty tests remain.
- Overview tests own its review callback and action derivation. The app-shell
  test starts through Get and publish and proves that the returned session
  appears in the lazy resolver while a follow-up read stays pending; it calls
  neither the clean Get nor Publish nor the Bring planner. Its comment explains
  why real shell coordination is necessary if it exceeds the one-second budget.
- `pnpm run tauri dev` with a task-specific application identifier and WebView2
  profile, CDP on loopback port 9222, and Git Trace2 outside the workspace.
  Checked Overview review, Get and publish entry, explicit pause, main/origin-main
  roles and the existing resolver, in English/light and Spanish/dark, with
  reduced motion and Tab/Shift-Tab/Enter/Escape. A full reload after switching
  language avoided the existing dictionary Fast Refresh limitation.
- Confirmed a real pause without moving HEAD or the local bare remote, with
  `get-team-changes` recovery refs. Abandoned both test pauses through the
  resolver's preview and confirmation; files and HEAD returned exactly. The
  fixture's remote tip stayed unchanged throughout app operations.
- A separate temporary behind branch with an unsaved same-line edit offered
  Save version and no resolver. Preparing that same edit kept the existing
  Save-first block, on both Overview and the Get dialog, without changing it.
- Visual QA caught a missing FileText glyph causing the overlap path to occupy
  the icon column. Restored the existing row structure, then checked the fixed
  medium preview in both themes. No token, layout pattern or timeout changed.
- Evidence: [Get light](../assets/065-4-4/get-overlap-light.png),
  [Get Spanish dark](../assets/065-4-4/get-overlap-es-dark.png),
  [resolver light](../assets/065-4-4/resolver-light.png),
  [resolver Spanish dark](../assets/065-4-4/resolver-es-dark.png),
  [unsaved overlap](../assets/065-4-4/unsaved-light.png), and
  [prepared blocker](../assets/065-4-4/prepared-light.png).
- The development process is stopped. No personal project, preferences,
  work branch or worktree was changed; no project commit or push was made.
  macOS/Linux runtime validation is not claimed; the whole integration audit
  remains with 065-4-5.

- Final `pnpm run check`: exit 0. Documentation and architecture, TypeScript,
  1,869 frontend tests in 162 files (59.18 s), production build, Rust format,
  Clippy with warnings denied, 693 Rust library tests passed and one explicit
  system-credential-store qualification ignored (124.00 s), two credential
  helper integration tests and example targets passed. The existing entry
  chunk size warning remains, without changing its threshold or eager overlays.
- Final review corrected the app-shell no-publication assertion to name the
  actual `publish` IPC command. Its focused shell test passed again; no timeout
  was increased. The integration-wide 065-4-5 audit remains pending.
- After moving this task to done and updating the queue and relative links, `pnpm run check:docs` passed again; `git diff --check` was clean.


# Pre-commit review

2026-10-30, requested by the user:

- Found a pending remote replan could replace an executing mutation or its
  uncertain result with a fresh confirmation. Starting either mutation now
  invalidates every pending preview. Both regression cases failed before the
  fix, then passed without a timeout change.
- Found that upstream metadata changing to gone could re-run the planning
  effect over progress or uncertainty, hiding its recovery evidence. The
  effect now preserves executing/uncertain/publish-result states, and a stale
  execution's replan reads the latest upstream-gone evidence. Both prop-change
  regressions failed before the fix, then passed.
- Extended the existing uncertain-result test to cover a failed handoff after
  native pause verification: only Close remains and publishing never runs.
- Reviewed the complete diff and the typed adapter, exact Get token/recovery,
  mutation coordination, session adoption, clean flows, blocker guidance,
  localization, focus handling, queue and relative links. No native workflow,
  recovery format, branch/worktree or dependency change was needed.

- Review desktop check: Tauri dev, isolated identifier/profile and temporary
  repositories only. Over WebView2 CDP, held a native remote replan and the
  real clean-Get response at the existing sync port to deliver them out of
  order. A changed check commit was injected only to trigger that replan;
  Git's actual commits and execution were unchanged. The late preview did not
  replace progress, Escape stayed blocked, and releasing the real result
  completed the update at the remote-tracking tip. Restored the port afterward.
  Rechecked the ordinary overlap review in Spanish/dark and Escape; no real
  project or global preference was changed. The dev process is stopped.
- Review captures: [late preview during Get](../assets/065-4-4/review-late-plan-light.png)
  and [Spanish dark review](../assets/065-4-4/review-overlap-es-dark.png).

- Review completion gate: `pnpm run check` exit 0. Documentation, architecture,
  TypeScript, 1,874 frontend tests in 162 files (50.06 s), production build,
  Rust formatting, Clippy with warnings denied, 693 library tests passed and
  one explicit credential-store qualification ignored (128.41 s), two native
  credential-helper integration tests and example targets passed. The existing
  large entry chunk warning is unchanged. The existing clean Get-and-publish
  test also now holds publishing pending and verifies Escape cannot close it;
  its focused run passed. No timeout was increased.
- The task remains done, with 065-4-5 first in the release queue. The user
  explicitly authorized the commit after this review; no push is authorized.
