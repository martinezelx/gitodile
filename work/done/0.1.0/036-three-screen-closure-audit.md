---
id: 036
title: Close-out audit for Overview, Changes, and Branches
status: done
priority: high
type: audit
areas:
  - frontend
  - accessibility
  - ux
  - performance
created: 2026-08-07
completed: 2026-08-07
---

# Goal

Audit the visual and implementation rework completed after `fbae51f` for the
Overview, Changes, and Branches screens, then define the smallest closure
pass required before starting the modular architecture refactor.

The initial pass was diagnostic. The approved bounded closure pass then fixed
every non-deferred finding; the architecture-owned performance item is recorded
as an explicit refactor input instead of forcing a throwaway move.

# Closure result

The three screens are ready to freeze before the architecture refactor. The two
P1 accessibility gaps are closed, every non-deferred P2/P3 item is resolved,
and the remaining screen-owned diff warm-up is now measurable acceptance work
in tasks 023, 026 and 028.

Implemented in the closure pass:

- Added an opt-in **Accessible text** diff view containing every loaded hunk and
  line in one selectable, findable document while preserving virtualized visual
  views as the default.
- Consolidated Changes view and Branches sort/filter popups behind one
  focus/dismissal contract. Menus now support Arrow keys, Home, End, Tab,
  Escape and first-letter search; the filter is a truthful non-modal dialog and
  focuses its first checkbox.
- Removed the passive freshness label from the live region.
- Renamed the ambiguous sort to **Local-only first** / **Solo locales primero**
  and covered a tracked-but-ahead branch in its test data.
- Bounded the filter to the viewport with an independently scrolling option
  area and a reachable clear action.
- Corrected the stale native-select comment and recorded the deferred warm-up
  ownership and baseline requirements in the architecture tasks.

## Closure score

| Dimension | Score | Closure evidence |
| --- | --- | --- |
| Accessibility | 4/4 | Complete text alternative and keyboard-complete, truthful popup semantics. |
| Performance | 3/4 | Virtualization remains; screen-owned speculative warming is deferred with explicit acceptance criteria. |
| Responsive design | 4/4 | Existing breakpoints remain coherent and the large-prefix popup is viewport-bounded. |
| Theming | 4/4 | Dark/light inspection remains coherent and uses semantic tokens. |
| Implementation integrity | 4/4 | Shared popup behavior, truthful copy/comments and zero detector findings. |
| **Total** | **19/20** | **Excellent — ready for the architecture refactor.** |

Open issue count after closure: P0 0, P1 0, P2 1 accepted refactor input,
P3 0.

# Scope and baseline

- Baseline: `fbae51f` (`docs(work): plan modular feature architecture`).
- Audited range: `fbae51f..a868c9e`.
- Product surfaces: Overview, Changes, Branches, and the dialogs/popups
  directly introduced or changed by those screens.
- Dimensions: accessibility, performance, theming, responsive behavior,
  implementation integrity, Git safety, and regression coverage.
- Out of scope: implementing the fixes and beginning the architecture epic.

# Initial audit verdict

The rework is visually coherent, product-specific, and substantially better
than the baseline. It preserves GitOdile's Friendly Card direction, uses the
plain-language vocabulary consistently, keeps destructive branch
operations behind plans and revalidation, and includes unusually strong tests
for the new diff behavior.

The screens are **not ready to be frozen yet**. Two accessibility findings are
release-significant and should be fixed before treating the surfaces as closed.
Four smaller issues fit in the same bounded closure pass. One performance and
ownership concern belongs in the already-approved architecture refactor and
should be captured as a baseline/acceptance criterion rather than moved twice.

## Initial audit health score

| # | Dimension | Score | Key finding |
| --- | --- | --- | --- |
| 1 | Accessibility | 2/4 | Virtualized diffs expose only mounted rows; custom menus do not implement their announced keyboard model. |
| 2 | Performance | 3/4 | Rendering is virtualized and native work is async, but Changes starts a full speculative diff batch when mounted. |
| 3 | Responsive design | 3/4 | Strong 1100/1024/800 breakpoints; the branch filter popup has no vertical bound. |
| 4 | Theming | 4/4 | New colors are semantic tokens and light/dark pairings remain coherent. |
| 5 | Implementation integrity | 3/4 | Detector is clean and the UI is product-specific; popup behavior and one sort label drift from their contracts. |
| **Total** |  | **15/20** | **Good — one focused closure pass remains.** |

## Initial issue count

- P0 blocking: 0
- P1 major: 2
- P2 minor: 4
- P3 polish: 1

# Detailed findings

## P1 — Fix before closing the screens

### 1. The virtualized diff is not a complete accessible document

- **Location:** `src/changes.tsx:839`, `src/changes.tsx:892`
- **Category:** Accessibility / Implementation integrity
- **Impact:** the DOM contains only the visible and overscanned diff rows. A
  screen reader, text selection, Find-in-page, or copy operation cannot
  reliably reach the whole diff even though the UI presents it as one
  focusable code document. Keyboard scrolling may eventually mount more rows,
  but it does not provide an equivalent reading model for assistive
  technology.
- **Standard:** WCAG 2.1.1 Keyboard, 1.3.1 Info and Relationships, 4.1.2 Name,
  Role, Value.
- **Recommendation:** keep the visual virtualizer, but provide an equivalent
  complete representation. Viable options are an accessible off-screen text
  document for the selected file, an explicit "copy/open full diff" action,
  or a non-virtualized accessibility mode selected when needed. Define and
  test the intended copy and Find behavior rather than leaving it accidental.

### 2. Custom popups announce menu/dialog semantics they do not implement

- **Location:** `src/changes.tsx:1082`, `src/branchesPanel.tsx:313`,
  `src/branchesPanel.tsx:373`
- **Category:** Accessibility
- **Impact:** the Changes view picker and Branches sort picker use
  `role="menu"` / `menuitemradio` without Arrow key, Home, End, or typeahead
  behavior. The sort picker also leaves focus on the trigger when opened. The
  filter trigger announces `aria-haspopup="dialog"`, while the popup is only a
  `role="group"`. Screen-reader and keyboard users receive a contract that the
  controls do not honor.
- **Standard:** WAI-ARIA Authoring Practices menu-button pattern; WCAG 2.1.1
  Keyboard and 4.1.2 Name, Role, Value.
- **Recommendation:** consolidate the existing popup implementations behind
  one keyboard-complete primitive. Reuse the already-tested titlebar menu
  behavior for true menus. Model the multi-select filter consistently as a
  dialog/popover with focus entry and return, or stop announcing it as a
  dialog. Add interaction tests for open, Arrow keys, Home/End, Escape,
  selection, outside dismissal, and focus restoration.

## P2 — Include in the bounded closure pass

### 3. The passive freshness label becomes a live announcement every minute

- **Location:** `src/changes.tsx:211`, `src/changes.tsx:223`,
  `src/changes.tsx:239`
- **Category:** Accessibility
- **Impact:** the non-loading timestamp keeps `role="status"` while its timer
  changes the text each minute. A screen reader can announce "checked N minutes
  ago" repeatedly while the user is reviewing a diff.
- **Recommendation:** reserve the live status for the active refresh and its
  completion. Render the passive age without a live role; the explicit refresh
  result can be announced once through the screen's existing status channel.

### 4. "Not published first" only means "has no upstream"

- **Location:** `src/branchesPanel.tsx:626`
- **Category:** UX copy / Implementation integrity
- **Impact:** branches with an upstream and commits that have not been pushed are
  not moved first, even though the UI elsewhere calls those commits "not
  pushed" and the sort label says "Not published first". The result is
  internally consistent in code but ambiguous to users.
- **Recommendation:** either sort by all unpublished work (`upstream === null`,
  `upstreamAhead > 0`, and the chosen policy for a gone upstream), or rename
  the choice to "Local-only first" / "Solo locales primero". Add a test with
  one local-only branch and one tracked-but-ahead branch.

### 5. The Branches filter popup is unbounded for real branch sets

- **Location:** `src/styles.css:2338`, `src/branchesPanel.tsx:438`
- **Category:** Responsive design / Adaptivity
- **Impact:** the backend can return up to 300 branches and the popup can
  render one prefix option per distinct prefix. With no `max-height` or inner
  scrolling, the filter can extend beyond a short or split window and make
  options or "Clear filters" difficult to reach.
- **Recommendation:** constrain the popup to the available viewport, give its
  options region an auto scrollbar, keep the clear action reachable, and test
  it at the supported minimum window height.

### 6. Full diff warm-up starts because Changes mounted

- **Location:** `src/changes.tsx:1568`
- **Category:** Performance / Architecture boundary
- **Impact:** first entry to Changes starts `read_working_tree_diffs` for the
  complete snapshot. It is async and bounded, but it still spends Git, disk,
  CPU, and IPC work speculatively and conflicts with the repository rule that
  screens render cached session state rather than fetch on visibility. Large
  repositories will feel this most.
- **Recommendation:** do **not** extract this locally before the architecture
  refactor. Record it in tasks 023/026/028: project activation or repository
  invalidation should own the snapshot, speculative warming should be
  idle-deferred, and the screen should consume the cache. Capture current
  timing/process-count baselines before moving it.
- **Closure policy:** accepted refactor input; it does not block the visual
  freeze if it is added to the architecture acceptance criteria.

## P3 — Polish

### 7. A CSS comment still describes the removed native select

- **Location:** `src/styles.css:2318`
- **Category:** Implementation integrity
- **Impact:** the comment says the sort control wraps a native `<select>`, but
  the component is now a custom popup. This can mislead the architecture/style
  extraction in task 030.
- **Recommendation:** update the comment while touching the popup styles.

# Systemic patterns

1. **Popup behavior is duplicated.** Overview, Changes, Branches, and the
   titlebar each own slightly different dismissal, focus, and keyboard logic.
   This is now observable behavioral drift, not merely aesthetic duplication.
2. **Repository reads still leak into screen lifecycle.** Session caching is
   already strong, but the full-diff warm-up remains screen-owned. The planned
   frontend feature runtime should make ownership explicit.
3. **Large-data policies are uneven.** Diffs are carefully bounded and
   virtualized; branch rows are capped, but their derived prefix popup is not.

# Positive findings to preserve

- The rework uses semantic tokens; the mechanical UI detector returned
  no findings for the changed UI targets.
- Light and dark themes retain readable semantic status colors without adding
  component-local raw colors.
- Changes uses real virtualization, measured wrapped-row heights, resize
  invalidation, overscan, stale-response guards, and bounded expansion reads.
- The new Rust file-range command validates relative paths, canonicalizes
  containment, rejects escaping symlinks, limits file size and returned lines,
  and has integration coverage.
- Cached snapshots remain visible through refreshes and failures instead of
  flashing empty/loading states.
- Overview's hierarchy is materially clearer: identity, current branch, unsaved
  work, and unpublished saved versions have distinct ownership and actions.
- Version-branch deletion remains plan-first and backend-revalidated; unique work
  and linked worktrees are not silently discarded.
- Responsive list/detail behavior for Changes and wrapping row actions for
  Branches are intentional rather than incidental.
- The rework added substantial regression coverage. Current result: 203
  frontend tests and 180 Rust tests pass.

# Recommended closure sequence

1. **[P1] Accessibility:** fix the accessible diff representation and
   unify keyboard/focus semantics for the three popup variants.
2. **[P2] Content clarity:** resolve the meaning of "Not published
   first" and cover it with data-driven tests.
3. **[P2] Responsive layout:** bound and scroll the multi-select filter at
   minimum supported window sizes.
4. **[P2] Performance:** add the screen-owned diff warm-up to the
   architecture baseline and acceptance criteria; move it during tasks
   026/028 rather than before them.
5. **[P3] Visual polish:** update stale comments and run the final
   two-theme, keyboard, and narrow-window inspection.
6. Repeat the UI audit; close this task only when both P1 findings and
   the non-deferred P2 findings are resolved.

# Closure acceptance criteria

- [x] The selected diff has a documented and tested complete reading/copying
      path that does not depend on currently mounted virtual rows.
- [x] Changes view mode, Branches sort, and Branches filters expose
      truthful ARIA semantics and complete keyboard/focus behavior.
- [x] The passive freshness age does not generate minute-by-minute live
      announcements.
- [x] The local-only sort label and ordering implement the same concept
      in English and Spanish.
- [x] The branch filter remains usable with hundreds of distinct prefixes and
      at the minimum supported window height.
- [x] The full-diff warm-up is recorded in the architecture baseline and in
      the relevant migration acceptance criteria.
- [x] Dark/light, 1024px-wide, keyboard-only, clean, changed, conflict,
      detached, unborn, truncated, and stale-error states receive one bounded
      visual verification pass.
- [x] Required frontend and Rust checks pass after the closure fixes.

# Closure validation

```text
pnpm run typecheck                                      passed
pnpm run test                                           passed (16 files, 206 tests)
pnpm run build                                          passed
cargo test --manifest-path src-tauri/Cargo.toml         passed (180 tests)
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
                                                        passed
cargo clippy --manifest-path src-tauri/Cargo.toml \
  --all-targets --all-features -- -D warnings           passed
Historical UI scan                                  passed (0 findings)
git diff --check                                        passed
```

An initial chained run produced ambiguous output, so Rust was repeated both in
isolation and with its normal parallel settings; both completed all 180
scenarios. No production Rust code changed in this closure pass.

The exceptional states in the closure checklist combine the recorded tasks
033–035 visual review with this focused Tauri inspection and the existing
state-specific regression suite. This pass re-inspected the surfaces that
changed: both themes, Changes visual/text modes, keyboard focus/menu, Branches, and the filter popup at bounded desktop sizes.

Visual evidence inspected in Tauri:

- Overview regression check in the original dark theme.
- Changes unified diff in dark and light themes.
- Changes view menu with visible focus and the new Accessible text option.
- Complete accessible text diff in light theme.
- Branches in dark and light themes.
- Branches filter dialog in light theme, including focus entry and the
  viewport-bounded option region.

# Validation performed during the initial audit

```text
pnpm run typecheck                                      passed
pnpm run test                                           passed (16 files, 203 tests)
pnpm run build                                          passed
cargo test --manifest-path src-tauri/Cargo.toml         passed (180 tests)
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
                                                        passed
cargo clippy --manifest-path src-tauri/Cargo.toml \
  --all-targets --all-features -- -D warnings           passed
Historical UI scan                                  passed (0 findings)
git diff --check fbae51f..HEAD                          passed
```

# Audit notes

- A live Overview screenshot was inspected from the running Tauri app. The
  target screens had already been reviewed interactively during tasks 033–035;
  this audit therefore treats their recorded DOM measurements as supporting
  evidence and focuses the new pass on source-level correctness and contracts.
- The UI review tool reported that this project has no `PRODUCT.md`. That does not
  block this narrow audit because `DESIGN.md`, the product strategy, and the
  incumbent implementation provide the required authority. Creating one is an
  optional documentation follow-up, not part of closing these screens.
