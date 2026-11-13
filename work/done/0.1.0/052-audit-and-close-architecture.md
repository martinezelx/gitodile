---
id: "052"
title: "Audit and close the delivered architecture"
status: done
priority: high
type: refactor
areas:
  - architecture
  - frontend
  - rust
  - documentation
  - testing
created: 2026-08-13
completed: 2026-08-13
---

# 052 — Audit and close the delivered architecture

## Goal

Audit the completed architecture migration against the delivered code, correct
the remaining ownership violations, reduce composition-root maintenance cost,
and leave one current, executable documentation and validation harness for
future work.

## User outcome

New features can follow a clear architecture without reconstructing it from
historical tasks, while regressions in code boundaries, documentation, task
metadata, or application versions fail automatically.

## Context

The application behavior has already been manually validated. This task is a
code, structure, architecture, testing, and documentation audit; visual
regressions are intentionally deferred. The architecture audit and refactor are
complete; further improvements can be introduced incrementally with new features.

The first audit pass found that the architecture was broadly sound and all
existing checks were green, but `lib.rs` still contained system-Git tooling and
watcher workflows despite being documented as registration-only. The
crate-root facade also hid cross-domain dependencies. Documentation mixed
current rules with migration chronology, the README understated delivered
capabilities, and completed task links/metadata had drifted.

## Scope

- Audit frontend/Rust boundaries, safety, IPC, lifecycle, performance guards,
  tests, and durable Markdown guidance.
- Make the Rust composition root registration-only in production and make
  domain/module dependencies explicit.
- Extract app-shell preferences, command palette, titlebar, and overlays from
  `main.tsx` without changing UI behavior or styling.
- Move historical Rust integration tests out of `lib.rs` into domain-owned
  test modules with shared test support where necessary.
- Consolidate the README, architecture guide, roadmap, contributing guide, and
  agent rules around current behavior.
- Add documentation/task/version validation and a single aggregate check.
- Preserve the public IPC contract and existing Git behavior.

## Out of scope

- Visual redesign or repair of known visual regressions.
- New Git workflows or product capabilities.
- Changing the accepted modular architecture or Git backend.
- Manual macOS/Linux runtime, signing, packaging, or accessibility validation.

## Acceptance criteria

- [x] The audit records concrete findings rather than only reporting green tests.
- [x] Production `lib.rs` owns only Tauri composition and registration.
- [x] IPC names owning modules and no production domain relies on crate-root reexports.
- [x] Shared operation, temporary-index, Git-command, tooling, watcher, and desktop concerns have explicit owners.
- [x] Rust architecture tests reject regression of those boundaries.
- [x] README and durable Markdown describe current versions, capabilities, architecture, and limitations.
- [x] Markdown links, task metadata/IDs, and npm/Cargo/Tauri versions are checked automatically and in CI.
- [x] `pnpm run check` is the documented aggregate completion gate.
- [x] `main.tsx` no longer owns preference storage, palette/titlebar implementation, or overlay presentation bodies.
- [x] Existing frontend tests cover the extracted shell modules and remain green.
- [x] `lib.rs` no longer contains the historical domain integration-test body.
- [x] Extracted Rust tests remain organized by domain and all 202 tests remain green.
- [x] Architecture documentation reflects the final delivered tree and ownership rules.
- [x] `pnpm run check` passes after the complete task.

## Relevant files

- `AGENTS.md`
- `README.md`
- `docs/ARCHITECTURE.md`
- `src/main.tsx`
- `src/app/`
- `src-tauri/src/lib.rs`
- `src-tauri/src/architecture.rs`
- `scripts/check-docs.mjs`

## Dependencies

None.

## Decisions

- Keep the public IPC JSON unchanged; this is an ownership refactor.
- Preserve explicit composition wiring instead of adding dynamic registration.
- Close the audit once all automated gates pass; future architectural
  refinements belong with the features that motivate them.
- Keep historical measurement and ADR records; simplify current-state guides
  instead of deleting evidence.

## Implementation notes

- Baseline before changes: 256 frontend tests, 202 Rust tests, frontend build,
  architecture guard, formatting, and Clippy all passed.
- Extracted system Git tooling, desktop services, policy-aware Git execution,
  shared operation vocabulary, and temporary-index preparation into explicit
  Rust modules.
- Moved repository-wide HEAD/ref validation into `repository.rs`, removed the
  crate-root IPC facade, and strengthened syntax-based architecture checks.
- Added `check:docs`, aggregate `check`/`check:rust` scripts, CI documentation
  validation, and synchronized app-version injection.
- Rewrote current-state documentation and repaired historical task metadata and
  links.
- Extracted preferences, branding, command palette, titlebar menu, and global
  overlays into `src/app/`, leaving `main.tsx` focused on composition and
  cross-feature orchestration.
- Relocated the historical `lib.rs` integration-test body into domain-named
  modules backed by shared hermetic repository fixtures.

## Validation

- `pnpm run check` — passed after the first audit/refactor pass: 81 Markdown
  files, 52 task IDs, 209 frontend modules, 256 frontend tests, production
  build, Rust formatting/Clippy, and 202 Rust tests.
- `pnpm run check` — passed after shell/test extraction: 82 Markdown files,
  53 task IDs, 216 frontend modules, 259 frontend tests, production build,
  Rust formatting/Clippy, and 202 Rust tests.

## Non-blocking follow-up

- [ ] Track visual regressions separately, as agreed; they do not block this
  code and architecture audit.
- [ ] Perform macOS/Linux runtime and packaging checks when those environments
  are available.
