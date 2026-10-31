---
id: 030
title: Give styles and translations explicit feature ownership
status: done
priority: normal
type: chore
areas:
  - frontend
  - design
  - i18n
created: 2026-08-01
completed: 2026-08-09
parent: "022"
---

# Goal

Split global CSS and translation monoliths along the proven feature boundaries
without changing visual output, theme ordering, copy or first-paint behavior.

# User outcome

The interface looks and reads exactly the same, while future features can own
their styles and language strings without editing global monoliths.

# Scope

- Split CSS into explicit ordered layers: tokens/base, app shell, shared
  primitives and feature-owned styles.
- Preserve cascade order, specificity, light/dark behavior, reduced motion and
  opaque dense-data surfaces.
- Preserve the closed three-screen visual contracts, including file-type icon
  sizing/tinting, Accessible text diff presentation, viewport-bounded popups,
  focus styles and shared popup layering.
- Split translations into typed feature dictionaries/namespaces while
  preserving compile-time English/Spanish parity and `useLanguage` ergonomics.
- Keep core shell labels available synchronously; feature chunks may not show
  untranslated first frames or introduce layout shifts.
- Add parity, missing-key, import-order and representative rendered-copy tests.
- Measure CSS and chunk changes against task 023 budgets.

# Out of scope

- Visual redesign, copywriting changes or adding a locale.
- Replacing the CSS/token system or i18n implementation with a dependency.
- Moving domain/request logic.

# Acceptance criteria

- [x] `styles.css` and `i18n.tsx` are composition/entry files rather than
      repositories of every feature rule/string.
- [x] Production CSS ordering is deterministic and documented.
- [x] English/Spanish parity fails at compile/test time per feature.
- [x] Core and first feature frames never render translation keys/fallback
      language or shift after a lazy dictionary arrives.
- [x] Light/dark, reduced motion, narrow/large layouts and dense diff surfaces
      are visually equivalent.
- [x] Overview, Changes and Branches match the task-036 closure baseline,
      including both diff modes and every popup state.
- [x] CSS and JavaScript chunks satisfy task 023 budgets.

# Relevant files

- `DESIGN.md`
- `src/styles.css`
- `src/i18n.tsx`
- `src/i18n.test.ts`
- `work/done/0.1.0/036-three-screen-closure-audit.md`
- feature modules produced by tasks 026–029

# Dependencies

Tasks 026, 027, 028 and 029.

# Decisions

- This mechanical/high-blast-radius migration is outside the architecture
  critical path until feature ownership is proven.
- Core labels remain eagerly available.

# Implementation notes

- `src/styles.css` is now the single eager cascade manifest. Its tested order
  is tokens, base, app shell, shared primitives, then Overview, Status,
  Changes, Save version, Publish and Branches. Responsive, focus,
  reduced-motion, forced-color and dense-data rules moved with their owners;
  no lazy screen imports CSS after its first frame.
- The extraction retained all 796 original CSS rules exactly once. A focused
  PostCSS inventory compared selector, media context and declarations before
  and after the split with zero missing or extra rules. Moving the shared mark
  rule initially exposed a relative SVG URL regression during visual QA; the
  path now resolves from `src/shared/ui/`, is regression-tested and the final
  build has no unresolved-asset warning.
- `src/i18n.tsx` eagerly composes app, shared and six feature dictionaries.
  Each namespace exports its own interface plus exact English and Spanish
  object literals, so missing/extra keys and formatter argument drift fail at
  compile time beside the owner. The complete `Translations` type and
  `useLanguage()` API remain unchanged for consumers.
- New tests cover namespace parity, unique ownership, representative rendered
  English/Spanish copy, synchronous first frames and the exact CSS import
  order plus the closed diff/popup/theme/focus contracts. Existing component
  suites continue to cover both diff modes, popup states, keyboard/focus and
  English/Spanish rendering for Overview, Changes and Branches.
- The deterministic cascade and dictionary workflow are documented in
  `docs/ARCHITECTURE.md` and the frontend feature guide. No domain or request
  logic moved, no copy changed and no locale or dependency was added.
- Final production sizes: CSS 94.44 kB raw / 14.45 kB gzip; entry JavaScript
  375.09/107.86 kB raw/gzip; Changes 59.47 kB; Branches screen plus dialog
  31.23 kB; `fileIcons` 255.22 kB and still outside the static entry graph.
  Every task-023 warning and failure budget remains satisfied.
- Bounded visual QA used the local WebView surface at 1280x720 and 800x720 in
  light and dark themes. It verified the no-project shell, synchronous Spanish
  copy, responsive navigation, focus/controls, the corrected brand mark and
  zero console warnings/errors. The closed feature states and popup/diff
  variants were verified by the full rendered-component regression suite; no
  new native behavior or platform-specific CSS was introduced.

# Validation

- `pnpm run check:frontend` passed: architecture guard, strict typecheck, 27
  Vitest files / 238 tests and production build.
- Focused i18n/CSS suite passed: 3 files / 12 tests.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features
  -- --test-threads=1` passed: 195 library tests and 0 binary tests.
- Historical UI scan passed with zero
  findings across the composition and owned CSS files.
- `git diff --check` passed before task closeout.
