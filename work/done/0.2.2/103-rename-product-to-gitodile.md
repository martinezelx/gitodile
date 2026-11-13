---
id: 103
title: Rename the product and application to GitOdile
status: done
priority: high
type: chore
areas:
  - branding
  - frontend
  - desktop
  - documentation
created: 2026-09-02
completed: 2026-09-02
parent:
queue: "19"
---

# Goal

Rename the product, shipped desktop application, and technical identifiers to
GitOdile. The initial compatibility-preserving implementation was followed by
an explicitly approved removal of previous-brand compatibility on 2026-09-02;
[ADR 0009](../../../docs/adr/0009-use-only-the-canonical-product-identity.md) records
the final decision and its breaking pre-release consequences.

# User outcome

The application, executable, package metadata, interface, diagnostics, and
documentation consistently use the internationally legible GitOdile name.
Previous-brand preferences and recovery records are no longer automatically
recognized. Existing data is left on disk, not deleted.

# Context

The user selected GitOdile because it is the direct `Crocodile` → `GitOdile`
wordplay and is not anchored to the Spanish spelling `cocodrilo`. A preliminary
availability search found no exact public name conflict, but the Git trademark
policy requires permission for portmanteau product names. This implementation
records that unresolved release concern; it does not claim trademark clearance.

Branding strings and technical identifiers currently span React copy, Rust
diagnostics, npm/Cargo/Tauri metadata, native probes, local-storage keys,
temporary ownership markers, and versioned recovery namespaces. A blind
replacement would either reset the desktop application's platform identity or
orphan existing preferences and recovery records.

# Scope

- Rename every user-visible product reference to GitOdile in English and
  Spanish UI, diagnostics, metadata, tests, and current documentation.
- Rename npm/Cargo package names, the Rust library crate, executable references,
  CSS classes, and the production SVG asset to `gitodile` forms.
- Use only `gitodile-*` browser preference keys, without a previous-brand
  migration or fallback reader.
- Rename temporary and operation-owned artifacts that do not carry durable user
  data, reserving only current-brand initialization marker names.
- Use the canonical Tauri identifier and version-1 recovery storage namespaces,
  documenting the owner-approved identity reset rather than claiming continuity.
- Update scripts, active work, historical documentation, and architecture
  references where the current product name is intended.

# Out of scope

- Renaming the GitHub repository itself (completed by the owner) or the local
  workspace folder. Updating `origin` and repository links is included in the
  follow-up after the owner confirmed the new repository URL.
- Claiming trademark approval or publishing a release before written clearance.
- Selecting or integrating the unfinished task-102 mascot refinement.
- Redesigning the logo, palette, layout, or product vocabulary.

# Acceptance criteria

- [x] Shipped UI, Rust diagnostics, package metadata, executable, and current
      documentation consistently say GitOdile.
- [x] The npm package, Cargo package/library, CSS brand class, and SVG filename
      use `gitodile` consistently and compile on case-sensitive platforms.
- [x] Startup has no previous-brand browser-storage migration.
- [x] The bundle identifier is `app.gitodile.desktop`; recovery-v1 storage and
      refs use `gitodile`, with the compatibility break documented.
- [x] New temporary clone/init/index artifacts use `gitodile`; only current
      reserved initialization-marker names remain rejected.
- [x] Task 102's uncommitted comparison assets and production-selection boundary
      remain intact.
- [x] `pnpm run check` passes.

# Relevant files

- `package.json`
- `src/bootstrap.tsx`
- `src/app/branding.tsx`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/src/recovery/history.rs`
- `src-tauri/src/recovery/discard.rs`
- `README.md`
- `DESIGN.md`
- `docs/PRODUCT_STRATEGY.md`
- `docs/ARCHITECTURE.md`

# Dependencies

None. Task 102 remains an independent, user-reviewed visual refinement and is
not required for a textual/technical rename.

# Decisions

**Initial compatibility decision, now superseded.** The first implementation
retained the previous application/recovery identities and copied previous-brand
browser preferences before render. Those protections were deliberate, not
missed substitutions. The owner subsequently approved their removal after being
warned that preferences and recovery records would no longer be recognized.

**Canonical identity only.** The final identifiers, data-loss boundary and lack
of migration are owned by [ADR 0009](../../../docs/adr/0009-use-only-the-canonical-product-identity.md).
No prior application data or recovery ref is deleted by this change.

**External repository confirmed.** The owner renamed the GitHub repository to
`project-gitodile`; the checkout's `origin` and application links now target it.
The active checkout folder and Git history are not moved or rewritten.

# Implementation notes

- Renamed product copy, translations, diagnostics, npm/Cargo metadata, Rust
  crate/executable references, CSS brand hooks, scripts, current documentation,
  and the production SVG path to GitOdile/`gitodile`.
- Initially added a pre-render browser-storage migration and retained the prior
  bundle/recovery identities. The owner-approved follow-up removed that
  migration and changed the bundle identifier and recovery namespaces.
- Moved transient clone, initialization, and index ownership names to the new
  prefix; the follow-up removed the previous reserved-name check.
- Updated task 102's reference to the renamed production asset without choosing
  a candidate or changing its comparison artwork.
- Recorded the unresolved Git trademark-permission requirement in product
  strategy; the rename does not claim release clearance.
- The pre-commit review retained the then-current issue URL and caught nine
  previous product-name strings in team-update diagnostics. After the owner
  renamed the repository, the follow-up updated that URL and `origin`.
- Normalized historical text and example identifiers without changing the
  validation dates/results; Git history retains the original evidence.
- Added product-metadata/issue-URL checks and Rust recovery-namespace tests.

# Validation

## Original implementation

- `pnpm exec vitest run src/app/brandMigration.test.ts
  src/app/aboutDialog.test.tsx src/app/appShell.test.tsx
  src/i18n/frames.test.tsx` — passed, 4 files and 20 tests.
- `pnpm run typecheck` — passed.
- `pnpm run check:docs` — passed after moving this task to `work/done/`, over
  158 Markdown files and 124 task ids.
- Two focused Rust regression tests for the retained history-recovery namespace
  passed after correcting stale test-only expectations.
- `pnpm run check` — passed: documentation and architecture checks (332
  modules), TypeScript, 70 frontend files with 619 tests, production build,
  Rust formatting, Clippy, and 319 Rust tests.

## Owner-approved identity reset

- `git ls-remote https://github.com/martinezelx/project-gitodile.git refs/heads/main`
  — confirmed the renamed official repository points to the expected commit.
- `pnpm exec vitest run src/architecture/branding.test.ts` — passed, 2 tests
  before the bundle-identifier assertion was added; final checks cover it below.
- `pnpm run check` — passed: documentation (158 Markdown files, 124 task ids),
  architecture (331 modules), TypeScript, 70 frontend files with 618 tests,
  production build, Rust formatting, Clippy, and 321 Rust tests.
- Final case-insensitive audit found no previous-brand spelling in maintained
  source, configuration, documentation, or tracked filenames. Git history,
  ignored build/log artifacts, the active checkout folder, and existing user
  data were not rewritten or removed.
