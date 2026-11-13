---
id: 043
title: Align the architecture documents with the delivered tree
status: done
priority: normal
type: chore
areas:
  - architecture
created: 2026-08-10
completed: 2026-08-12
parent: "038"
---

# Goal

Make every architecture document describe the code that exists, so an agent
following a diagram builds what the guards actually accept.

# User outcome

No visible change. This is about the next contributor not spending an hour
building toward a directory the project decided not to create.

# Context

Three documents still describe a target the migration deliberately did not
build, and one module header describes a migration phase that is over.

**`platform/tauri/` does not exist.** `docs/ARCHITECTURE.md:38` and ADR 0003
both show it as the home for "typed invoke/listen adapters", and the ADR's
ownership table gives it "one adapter entry per feature port". The delivered
shape puts each adapter in its owning feature as `tauriAdapter.ts` — which is
better ownership, since the port and its adapter change together — but no
document says so. Task 031 added a "tree epic 022 actually produced" section to
`ARCHITECTURE.md` and did not cover this, so that section is itself incomplete.

**`shared/ui` is described as populated** and, until task 041, holds only a
stylesheet.

**`src-tauri/src/application.rs` opens with** "IPC adapters enter here before
delegating to compatibility workflows that remain in `lib.rs` during the
strangler migration". `architecture.rs` now fails the build if a named domain
function appears in `lib.rs`. The header describes the opposite of the enforced
rule.

This task runs after the structural work so the tree is documented once.

# Scope

- Record the per-feature adapter shape as the delivered decision in
  `ARCHITECTURE.md`'s "tree epic 022 actually produced" section, and mark
  `platform/tauri` in ADR 0003 as not built, with the reason. Do not silently
  edit the accepted decision — `docs/adr/README.md` forbids rewriting accepted
  ADRs to hide a change, so state the divergence explicitly.
- Rewrite the `application.rs` module header to describe the boundary as it is.
- Refresh the delivered-tree section for what tasks 039–042, 046, 048, 049 and
  051 changed: composition roots, `shared/ui` contents, the invalidation
  contract, Settings ownership, the public diff renderer, the native
  TypeScript graph and feature-owned Tauri adapters.
- Re-check the frontend feature guide's §8 footprint table against the tree
  after 042 lands; its file list is the thing a new screen author follows.
- Sweep for any other document still describing strangler-era state.

# Out of scope

- Reversing an architectural decision. If the per-feature adapter shape should
  become normative rather than merely observed, that is a new ADR.
- Rewriting ADR 0003's Decision section. Divergence goes in its observed and
  consequences sections.

# Acceptance criteria

- [x] No architecture document shows a module the tree does not contain without
      saying it was not built and why.
- [x] `application.rs`'s header describes the enforced boundary.
- [x] The delivered-tree section matches the tree after every completed
      structural child of epic 038.
- [x] The feature guide's greenfield footprint table matches reality; ideally
      re-verified by rebuilding and removing a throwaway screen as task 031 did.
- [x] ADR 0003's accepted Decision text is unchanged.

# Relevant files

- `docs/ARCHITECTURE.md`
- `docs/adr/0003-adopt-a-modular-feature-architecture.md`
- `docs/architecture/frontend-feature-guide.md`
- `src-tauri/src/application.rs`
- `AGENTS.md`

# Dependencies

Tasks 039–042, 044, 046–049 and 051 should land first. This is the final
structural task; do not document an exception that a preceding task is about to
remove.

# Decisions

- Document divergence rather than deleting the target. A reader should be able
  to see that `platform/tauri` was considered and why the tree differs, not
  merely find no trace of it.

# Implementation notes

- Replaced the nonexistent frontend `platform/tauri/` in the current-tree
  description with feature-owned `tauriAdapter.ts` modules. ADR 0003's accepted
  Decision still shows the original target and now records explicitly, in a
  later observed section, why that directory was not built.
- Refreshed the delivered tree for the composition roots, populated
  `shared/ui`, registered invalidation subscribers, Settings-owned CSS/copy and
  lazy panel, the Changes public diff renderer, TypeScript 6's native
  dependency graph and Overview's feature-owned adapter.
- Rechecked the greenfield footprint against the current registry, runtime,
  subscriber list, IPC contract and execution inventory. Feature adapters and
  translations remain inside the feature; subscriber registration is a
  declarative `main.tsx` list entry and requires no Repository edit.
- Removed stale migration guidance from `AGENTS.md`, `ARCHITECTURE.md`, the
  `application.rs` header and the performance protocol. The same change set
  subsequently converted task 045's unavailable hardware work into the explicit
  release-hardening gate in ADR 0006.
- Compared the complete ADR 0003 `Decision` section before and after with
  SHA-256; both hashes were
  `08D2E1452893027CD116ACCB314A37711F8247B925564D7F236C4B2775DC31B7`.

# Validation

- `pnpm run typecheck`
- `pnpm run test` (30 files, 256 tests)
- `pnpm run build` (1,941 modules; entry 269.08 kB / 80.25 kB gzip)
- `pnpm run check:architecture` (209 production modules and seeded negative fixtures)
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
- Focused stale-state sweep found no remaining task-031 hardware assignment,
  temporary epoch bridge, unmigrated mutation consumer or compatibility-workflow
  header. `fileIcons` remains a separate 255.25 kB / 86.23 kB gzip chunk.
