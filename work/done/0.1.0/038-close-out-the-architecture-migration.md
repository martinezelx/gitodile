---
id: 038
title: Close out the modular architecture migration
status: done
priority: normal
type: epic
areas:
  - architecture
  - frontend
  - rust
  - performance
  - platform
created: 2026-08-10
completed: 2026-08-12
---

# Goal

Retire the residue epic 022 left behind, so the delivered tree, the documents
that describe it and the guards that protect it all agree, and no acceptance
criterion is carried as "partially met".

# User outcome

Nothing user-visible changes. The point is that the next feature — starting with
History in task 015 — inherits an architecture whose rules are true rather than
aspirational, and whose one silent degradation path fails loudly instead.

# Context

Task 031 audited epic 022 against the final code and closed it with one
criterion partially met and five named follow-ups. Later passes over every
child task file and the code found additional residues that were not recorded
anywhere, plus one concurrent Save version backup defect that must be fixed
before the structural close-out continues.

Nothing here blocks History. The audit's greenfield proof showed a new screen
costs three registration lines in `lib.rs` and three wiring points in
`main.tsx`. These tasks exist because the epic's own stated rules — "visual
components do not invoke Tauri", "a primitive with two real consumers moves to
`shared/ui`", "every native command declares an execution policy" — are written
down but not fully applied or enforced, and rules in that state decay.

Two patterns caused most of this and are worth naming, because they will
recur:

- **Nothing was assigned an owner.** Tasks 023–030 assigned migrations by layer
  (reads, mutations, styles). Screens nobody named — Overview, Settings — and
  primitives nobody named simply survived. Enumerate the things, not the layers.
- **Scaffolding outlived the scaffold.** The strangler migration is over, but
  its compatibility fallbacks, module docs and target diagrams are still in the
  tree describing a state that no longer exists.

# Child tasks and order

| Task | Status | Outcome | Depends on |
| --- | --- | --- | --- |
| 039 | Done 2026-08-11 | A Git call without a command frame fails instead of silently getting a read policy | none |
| 040 | Done 2026-08-11 | Overview owns its screen container; `main.tsx` becomes composition-only | none |
| 041 | Done 2026-08-11 | Proven shared primitives live in `shared/ui` behind named exports | none |
| 042 | Done 2026-08-11 | Repository invalidation accepts registered subscribers instead of positional parameters | none |
| 043 | Done 2026-08-12 | `ARCHITECTURE.md`, ADR 0003 and the `application.rs` header describe the delivered tree | 039–042, 044, 046–049, 051 |
| 044 | Done 2026-08-11 | The test-only screen module leaves production space and the guard can see it | none |
| 045 | Done 2026-08-12 | ADR 0006 makes unavailable macOS/Linux runtime validation an explicit release-hardening gate; CI release-compiles both targets | none |
| 046 | Done 2026-08-12 | Settings owns its styles and translations and stops costing entry-chunk bytes | 041 |
| 047 | Done 2026-08-11 | The architecture guard inspects `src` instead of cruising zero modules | none |
| 048 | Done 2026-08-12 | The diff renderer leaves `ChangesPanel` so the guard needs no allowance | 047 |
| 049 | Done 2026-08-12 | TypeScript 6 restores native guard support and retires task 047's workarounds | 047 |
| 050 | Done 2026-08-12 | Save version reserves collision-proof index backups and proves concurrent contents remain isolated | none |
| 051 | Done 2026-08-12 | Overview's saved-version reads use a feature-owned Tauri adapter and the guard enforces that boundary | 049 |

050 runs first because it protects the recovery copy for a user's real Git
index. Then 051 and 048 close the two executable frontend exceptions, followed
by 046's Settings ownership work. 043 runs last of the structural tasks so it
documents the finished tree once instead of repeatedly describing intermediate
states. 045 was converted into a durable release-hardening gate because
representative hardware is not currently available. CI provides compilation
and native-test evidence in the meantime without being mislabeled as a runtime
pass.

# Out of scope

- Any user-visible behavior, visual or workflow change.
- Implementing History, Recovery or conflicts.
- Reopening ADR 0003's accepted decisions. A task here may record that the
  delivered shape differs; changing the decision itself needs a new ADR.
- Splitting Rust domain files into directories. Compiler privacy and
  `architecture.rs` already enforce the boundaries; directories without
  submodules would be ceremony.

# Epic acceptance criteria

- [x] Tasks 039–051 that belong to this epic are complete with their own
      validation recorded. Done: 039, 040, 041, 042, 043, 044, 046, 047, 048,
      045, 049, 050 and 051.
- [x] Epic 022's partially-met "thin composition roots" criterion is satisfied
      or a new ADR records why it will not be. Satisfied by task 040.
- [x] No production code path can execute Git without an execution policy.
- [x] Save version index backups are collision-proof across concurrent projects.
- [x] Production feature transport imports exist only in feature-owned adapters
      and the architecture guard enforces the rule.
- [x] Every architecture document describes the tree that exists.
- [x] Windows, macOS and Linux desktop behavior is measured or its absence is
      an explicit, dated, owned limitation rather than silence.

# Dependencies

- Epic 022 and task 031, both complete.
- Task 015 (History) does not depend on this epic and may proceed in parallel.
  If it does, task 042 should land first so History is not added to the read
  coordinator by hand and then migrated again.

# Decisions

- Grouped as an epic rather than eight loose tasks so the migration has one
  reviewable end state, matching how epic 022 grouped tasks 023–031.
- Kept out of task 031: that task's job was to audit and report honestly, not
  to grow into the migration nobody scheduled. Fixing findings inside an audit
  is how audits stop being trustworthy.

# Implementation notes

- Task 048 extracted the reusable diff renderer behind the Changes public API,
  leaving the cross-feature allowance list empty without moving `fileIcons`
  onto the entry chunk's static path.
- Task 046 gave Settings ownership of its panel CSS and translations, and moved
  `SettingsPanel` to a 12.66 kB lazy chunk. The entry fell from 282.27 kB to
  269.08 kB while the shell-owned dialog preserved focus management.
- Task 043 aligned the current-tree documentation, operating guide and Rust
  application header with the enforced boundaries. ADR 0003's accepted Decision
  remains byte-for-byte unchanged; its observed section records why
  `platform/tauri` was not built.
- Task 045 did not manufacture a platform pass without hardware. ADR 0006 owns
  the dated macOS/Linux runtime limitation and makes the task-023 protocol a
  release-hardening gate; CI now release-compiles the Tauri executable on both
  operating systems in addition to the existing cross-platform Rust suite.

# Validation

Each child task ran the full `AGENTS.md` command set. ADR 0006 records why task
045's hardware protocol is deferred, what CI proves today and what must run
before a macOS/Linux release-readiness claim.
