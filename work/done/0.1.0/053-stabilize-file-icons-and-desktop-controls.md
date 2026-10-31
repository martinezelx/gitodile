---
id: "053"
title: "Stabilize file icons and desktop control affordances"
status: done
priority: normal
type: polish
areas:
  - frontend
  - testing
created: 2026-08-13
completed: 2026-08-13
---

# Goal

Make file-type artwork and shared popup controls render reliably after the
frontend architecture migration, while applying a deliberate desktop cursor
convention instead of inheriting browser defaults accidentally.

# User outcome

Files keep the correct recognizable icon across screens, dropdowns open in the
expected position, and interactive controls behave like a coherent desktop app.

# Context

After feature styles and keep-alive screens were split into their architecture
owners, the Rust file icon could disappear because inline SVG artwork reused
internal IDs across mounted screens. The Changes view picker was also affected
by a shared `.app-menu` rule living in a later-loading feature stylesheet.

The same review found that cursor behavior needs an explicit convention.
Windows and macOS use the arrow for standard interface controls; link-shaped
text actions can retain the hand cursor because their visual affordance is
otherwise weaker. Disabled controls should normally retain the arrow, with
special cursors reserved for meaningful operation states such as resize, drag,
busy, or forbidden drop targets.

# Scope

- Render full-colour file SVG artwork in isolated image documents so internal
  SVG IDs cannot collide between screens or icon instances.
- Keep file-icon lookup centralized, cached, typed, and covered by tests.
- Keep the shared `.app-menu` surface in shared UI styles and protect its
  cascade position with a composition test.
- Remove temporary code markers used while reproducing the Rust icon issue.
- Review and consistently apply the agreed desktop cursor convention.
- Record any durable cursor convention in `DESIGN.md` once approved.

# Out of scope

- Replacing the `vscode-icons` collection or adding another icon library.
- Redesigning the Changes screen or its view picker.
- Changing keyboard behavior, popup semantics, or Git operations.

# Acceptance criteria

- [x] Rust, CSS, TypeScript, and fallback file icons render through the same
  isolated mechanism without network requests.
- [x] Icon components are cached by source and remain accessible decorative
  images.
- [x] The Changes view picker can override shared popup alignment regardless of
  later feature styles.
- [x] A test fails if `.app-menu` returns to the Branches stylesheet.
- [x] The temporary `//test` marker is removed from the Rust policy test.
- [x] The desktop cursor convention is confirmed, applied consistently, and
  documented in `DESIGN.md`.
- [x] `pnpm run check` passes after the complete task is implemented.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `src/fileIcons.ts`
- `src/shared/ui/primitives.css`
- `src/features/changes/changes.css`
- `src/styleComposition.test.ts`
- `vite.config.ts`

# Dependencies

None.

# Decisions

- Use raw SVG source rendered as an `<img>` data URL. This isolates SVG-local
  gradients, masks, and filters without adding requests, and removes React SVG
  subtree overhead.
- Shared popup geometry belongs in `shared/ui/primitives.css`; feature styles
  own only their alignment overrides.
- Cursor policy: arrow for standard controls and disabled controls;
  hand only for real links and clearly link-styled text actions. Keep semantic
  operation cursors such as text, resize, progress, and forbidden drop where
  they communicate additional state.

# Implementation notes

- `unplugin-icons` now compiles the selected artwork as raw SVG strings.
- `src/fileIcons.ts` adds the standalone SVG namespace, encodes a data URL, and
  memoizes one React image component per unique source.
- File-list CSS gives the resulting image elements explicit dimensions.
- The shared-style composition test pins `.app-menu` ownership and the Changes
  left-alignment override.
- Standard and disabled controls now inherit the system arrow. The three
  link-styled text actions keep `cursor: pointer`, and the diff expansion's
  loading state keeps its meaningful progress cursor.

# Validation

- Previous implementation pass: `pnpm run check` passed with 261 frontend tests
  and 202 Rust tests.
- Final implementation pass: `pnpm run check` passed with the documentation and
  architecture guards, TypeScript build, 262 frontend tests, production build,
  Rust formatting, Clippy, and 202 Rust tests.
