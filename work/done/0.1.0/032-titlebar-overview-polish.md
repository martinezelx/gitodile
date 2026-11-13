---
id: 032
title: Titlebar menu, Overview header, and diff virtualizer polish
status: done
priority: normal
type: chore
areas:
  - frontend
created: 2026-08-02
completed: 2026-08-02
---

# Goal

A round of small visual requests turned into a cohesive pass over three
things: the titlebar's overflow menu, Overview's header, and a real
correctness bug in the diff viewer found along the way. None of these needed
their own task file individually, but together they touch enough surface
(i18n, several stylesheets, a fix to the virtualizer) that recording them
beats letting the diff speak for itself.

# User outcome

Requested directly by the user across a single conversation, roughly in this
order:

1. Tighten the delegated tooltip: stop repeating what an icon (✕ close) or a
   label ("More actions") already says.
2. Give "More actions" real content instead of just About, in a way that
   looks like a native app menu rather than a plain labelled dropdown.
3. Recommend and add further options to that menu (Settings, keyboard
   shortcuts, report an issue).
4. Remove Overview's redundant "…" project menu (Open/Close project already
   live in the sidebar and in the titlebar menu) and use the freed header
   space for the current branch and the project path.
5. Iterate on that header's visual details: optical centring of the branch
   chip against the title, and a hover-revealed (not permanently visible)
   copy button so it doesn't collide with the chip.
6. Bug report: opening Changes sometimes showed the diff with lines out of
   place for a frame. Root-caused to the virtualizer's row-height estimate
   and fixed.
7. Replace the circular spinner with a different loading affordance. First
   tried CSS skeleton placeholders shaped like the real rows; rejected as
   "no me gusta" and reverted in full. Replaced with an indeterminate sweep
   bar instead, which was accepted.
8. Settings: icon-only gear instead of icon+label, sized and centred as a
   matching pair with the sidebar-collapse button.

# Context

This project's own conventions did a lot of the design work:

- `data-tooltip` + `TooltipHost` (`src/tooltip.tsx`) already skip a tooltip
  that only repeats *visible, unclipped* text — but an icon-only button's
  visible text is empty, so an icon whose meaning is "obvious" (✕ = close)
  still got one. That gap is inherent to the redundancy check, not a bug in
  it, so redundant tooltips on `✕` and "More actions" had to be removed by
  hand rather than by fixing the check.
- The project already had one non-native-feeling menu to model the new one
  on (`ProjectMenu`, since deleted) and a command palette (`CommandPalette`)
  with an icon+label row pattern to borrow from.
- The diff viewer's row virtualizer (`useVirtualizer` in `changes.tsx`) had a
  comment asserting `.diff-line__content` is `white-space: pre` (content
  never wraps), used to justify a flat 20px row-height estimate. That CSS
  rule was changed to `pre-wrap` with `overflow-wrap: anywhere` back in task
  `010-1` (`f21fb50`), and the estimate was never updated — a latent bug that
  only shows once a line is long enough to wrap, which is exactly what the
  user's screenshot caught.

# Scope

**Tooltip cleanup**
- Removed `data-tooltip` from: the titlebar's "More actions" trigger, the
  restore-skipped-notice's close (✕), and the About dialog's close (✕).
- Left `projectSwitcher.tsx`'s close-button tooltip alone — it encodes which
  project's row it belongs to, so it isn't purely redundant with the icon.

**Titlebar "More actions" menu** (`TitlebarMenu` in `main.tsx`)
- Rebuilt from a single "Help → About" entry into three groups separated by
  thin dividers instead of uppercase text headings (a more native-menu feel):
  - **File**: Open project (always), Close project (only when one is open —
    reuses the same `handleOpenProject` / `requestCloseActiveProject`
    handlers `ProjectMenu` used).
  - **General**: Settings (navigates via `navigateToView("settings")`),
    Reload window (`window.location.reload()`).
  - **Help**: Keyboard shortcuts (new dialog, see below), Report an issue
    (opens `https://github.com/martinezelx/project-gitodile/issues/new` via
    the existing `openUrl`), About.
- Every item now pairs an icon with its label (`FolderOpen`, `FolderX`,
  `Settings`, `RotateCw`, `Keyboard`, `Bug`, `Info`) instead of bare text.
- Added a short scale/fade entrance animation (`titlebar-menu-in`,
  `var(--duration-fast)`) instead of appearing instantly.

**Keyboard shortcuts dialog** (new, in `main.tsx`, styled via
`.shortcuts-dialog`/`.shortcuts-list`)
- Lists the shortcuts that actually exist in the app — no invented ones:
  `Ctrl/⌘+K` (command palette), `Ctrl/⌘+Tab` / `Ctrl/⌘+Shift+Tab` (next/
  previous open project), `Esc` (close dialogs/menus).
- `MOD_KEY_LABEL` picks `⌘` vs `Ctrl` from `navigator.userAgent`.

**Removed `ProjectMenu`**
- Deleted the component, its CSS (`.project-menu*`), its only translation key
  (`overviewProjectMenu`), and the now-unused `onCloseProject` prop threaded
  through `OverviewPanel`.

**Overview header** (`project-overview__header` in `main.tsx`)
- Was: project name only (once `ProjectMenu` was removed).
- Now: name + a branch chip (`GitBranch` icon + `versionValue`, the same
  string already computed for the branch spotlight) on the same line,
  then the project path below via the existing `ProjectPath` component, then
  the "opened from a nested folder" note if applicable.
- Removed the "Project details" section entirely (`.project-facts*` CSS
  deleted) — its only content was the same path, now shown once in the
  header instead of twice on the screen.
- Branch chip: square corners (`--radius-sm`, not a pill) matching the rest
  of the app's chrome, and nudged `translateY(1.5px)` to correct for optical
  vs. geometric centring against the `h1` (the line box reserves descender
  room the chip doesn't need — the offset was measured, not guessed, against
  the resolved font metrics).
- Path's copy button: hidden (`opacity: 0`) until the path row is hovered or
  the button receives keyboard focus, so it doesn't sit stacked directly
  under the chip's icon at rest; keeps its box either way so revealing it
  doesn't reflow the path. Also fixed an unrelated, pre-existing sizing bug —
  the button's UA-default padding was eating into its own fixed 22px box and
  visibly off-centring the icon at that size (harmless at the old 32px).

**Diff virtualizer row-height fix** (`changes.tsx`)
- Replaced the flat `ESTIMATED_LINE_ROW_HEIGHT` constant with
  `estimateLineRows(contentLength, charsPerLine) * lineHeight`, computed from
  a live measurement of the diff pane's resolved font (a monospace font
  makes this exact, not approximate) and current width, kept current via a
  `ResizeObserver` (sidebar collapse/expand changes the wrap point) and a
  `virtualizer.measure()` call whenever the measured metrics change.
- Also fixed a second, smaller misestimate found while reviewing the first
  one: the virtualizer's default `measureElement` reads
  `getBoundingClientRect()`/`offsetHeight`, neither of which includes CSS
  margin — so `.diff-row--hunk-start`'s `margin-top: 12px` was silently
  dropped from every hunk boundary. Overrode `measureElement` to add the
  element's resolved `margin-top` back in.
- Added `estimateLineRows` unit tests in `changes.test.ts` (wraps-at-boundary,
  never-zero, and the pre-measurement fallback).

**Loading indicator** (`src/loadingBar.tsx`, new)
- Skeleton placeholders were built, verified pixel-exact against the real
  rows they stood in for, and then rejected on visual taste and fully
  reverted (component deleted, all wiring, tokens, and translation keys
  removed) — recorded here so a future pass doesn't re-attempt the same
  thing without knowing it was already tried.
- Replaced the circular `LoaderCircle` spinner with `<LoadingBar>`: a 3px
  track with a 40%-wide segment sweeping across it
  (`loading-bar-sweep`, 1200ms). Used for: the lazy-screen `Suspense`
  fallback, Changes' file-list loading state, the diff's loading state, and
  Branches' no-cache loading state.
- `showLabel` prop controls whether the label renders visibly (diff, branches — it replaced a state that had a visible message) or stays
  screen-reader-only via `.visually-hidden` (file list, screen switch — it
  replaced a state that had no visible text).
- `prefers-reduced-motion`: the indicator jumps to `width: 100%` with the
  animation removed, rather than freezing at its animated 40% — a static
  partial-width bar would misleadingly read as "40% done".

**Settings entry point**
- Icon: `Settings2` (sliders) → `Settings` (gear), in the single place all
  its appearances are registered (`NAV_DESTINATIONS` in `screens.tsx`), plus
  the titlebar menu's own separate icon reference.
- The sidebar-footer Settings button dropped its visible label
  (`nav-item--icon-only`) and gained `aria-label`/`data-tooltip` in its
  place, sized to `.sidebar-toggle`'s exact 36px/18px-icon box
  (44px/18px-icon when the sidebar is collapsed, matching the general
  collapsed nav-item size). `.sidebar-footer` centres the pair as a unit
  (`justify-content: center`, `gap: var(--space-2)`) rather than pinning them
  to opposite edges — Settings faces left, collapse faces right, within that
  centred pair.

# Out of scope

- Auto-updater / app self-update ("check for updates") — flagged as a future
  idea when the menu additions were discussed, not built.
- Revealing the project folder in the OS file explorer — floated, then
  redirected: "Files" turned out to mean project open/close, not
  `revealItemInDir`. The `opener:allow-reveal-item-in-dir` capability that
  was briefly added for the first reading was removed again.
- UI-level zoom and a fullscreen toggle — mentioned as ideas, not requested.
- Cleaning up `overviewSelectedFolder` / `overviewGitDirectory` /
  `overviewCommonGitDirectory` / `overviewProjectType`, found unreferenced in
  any `.tsx` file while reviewing this task's `i18n.tsx` diff. Confirmed
  already unused at the commit this task started from (`git show
  HEAD:src/main.tsx` has no hits either) — pre-existing dead code, not
  something this task's changes orphaned, so left alone.

# Decisions

- **Icon-only controls always get both `aria-label` and `data-tooltip`.**
  The app's tooltip system only suppresses a tooltip that repeats *visible*
  text; an icon-only button has none, so removing its tooltip would remove
  its only on-screen name. This is the opposite case from the tooltip
  cleanup earlier in the same task — redundant text tooltips came off,
  necessary icon-only ones went on (More actions trigger keeps its
  `aria-label` only, since its own tooltip removal was about the icon
  already being self-explanatory *once labelled in the accessibility tree*;
  Settings and the primary sidebar nav items keep both, since their meaning
  isn't as universally obvious as a bare ✕).
- **Skeletons were rejected wholesale, not tuned.** Two rounds of fixing the
  skeleton's sizing (hand-measured, then rebuilt to literally reuse the real
  rows' CSS classes so the two could never drift) still didn't land — the
  user's objection was to the pattern itself in a Git client ("no me gusta
  como queda"), not to a specific measurement. Recorded so it isn't
  rediscovered by trial in a future task.
- **The diff virtualizer bug predates this task** (introduced in `f21fb50`,
  a separate task) but is fixed here because it was reported against this
  session's work and the fix is small, self-contained, and covered by new
  tests.

# Validation

- `npx tsc --noEmit` clean after every step.
- `npx vitest run` — 146 passed (up from 142; four new `estimateLineRows`
  cases), no regressions, across all 15 suites.
- The diff virtualizer's arithmetic estimate was checked against real
  rendered row heights in-browser (5 line lengths from 10 to 350 characters)
  and matched exactly (0px error) in every case; the hunk-boundary margin fix
  was checked the same way (12px error → 0px error).
- The branch-chip optical-centring offset, the footer icon-pair sizing, and
  the loading-bar's sweep geometry (enters/exits exactly at the track edges)
  were each verified against computed styles/animation keyframes in-browser,
  not just eyeballed.
- Not verified: the Changes file list, the diff view, and Branches'
  loading state in a real running project — the sandboxed browser preview
  has no Tauri backend, so screens that need an open repository couldn't be
  exercised end-to-end. Confirmed by the user directly for the tooltip,
  menu, header, and settings-icon changes instead; the virtualizer fix and
  loading bar in Changes/diff/Branches still want a real run.

## Settings dialog follow-up

Settings now opens as an app-level dialog instead of replacing the active
workspace screen. The dialog preserves project navigation state, traps and
restores focus, closes with Escape or its backdrop, and is reachable from the
sidebar, compact navigation, titlebar menu, and command palette. Its content
is organized into General, Appearance, Git, and Safety sections with a fixed
section rail on desktop and a horizontally scrollable section bar at narrow
window widths.

The existing settings behavior remains intact, including theme and language
selection, Git diagnostics and updates, Git identity, startup behavior,
safety confirmation, and About. A focused integration test covers opening,
section navigation, preservation of the underlying screen, Escape dismissal,
and trigger-focus restoration.

## Post-audit visual polish

The visual follow-up implemented the remaining audit recommendations:

- replaced the hamburger-shaped titlebar menu trigger with an overflow
  ellipsis, matching the menu's secondary-action role;
- restored the visible Settings label while the sidebar is expanded, while
  preserving the compact icon-only presentation when collapsed;
- removed the duplicated current branch name from the Overview action
  surface and reframed it as “Work separately” / “Trabajar por separado”;
- enlarged the project-path copy control and made it persistently visible on
  touch/non-hover devices;
- made reduced-motion loading states display an explicit loading label and a
  deliberately subdued full-width indicator;
- increased the alpha badge's size and contrast for better legibility.

Visual checks covered dark and light themes plus wide and narrow viewport
layouts. Repository-backed Overview states still require final validation in
the Tauri app because the browser preview has no desktop backend.

Final validation after the visual follow-up:

- `pnpm run typecheck` — clean.
- `pnpm run test` — 156 passed across 16 suites.
- `pnpm run build` — clean.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — clean.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` — clean.
- UI detector over `src/main.tsx` — 0 findings.

## Post-audit hardening

The code-focused follow-up to the task's design/implementation audit added:

- complete keyboard focus and navigation behavior for the titlebar menu;
- focus restoration before a menu action opens another dialog;
- a reload guard while any project mutation is unsettled;
- explicit clipboard-failure recovery through the existing error dialog;
- tab-, CJK-, emoji-, and combining-mark-aware initial diff row estimates,
  while keeping DOM measurement authoritative;
- reduced-motion handling for the menu entrance animation;
- tests for menu navigation/focus, reload safety, clipboard denial, loading
  semantics, Unicode/tab estimates, hunk margins, and resize remeasurement.

Revalidated after this follow-up:

- `pnpm run typecheck` — clean.
- `pnpm run test` — 156 passed across 16 suites.
- `pnpm run build` — clean.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — clean.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` — clean.
- UI detector over the changed TSX targets — 0 findings.

## Settings modal and sidebar refinements

The final iteration moved Settings from a workspace-style screen into an
app-level modal designed to grow without displacing the active project. The
implementation and follow-up polish cover:

- a desktop section rail for General, Appearance, Git, and Safety, adapting
  to a horizontal section bar in narrow windows;
- consistent modal dismissal, focus trapping/restoration, Escape and
  backdrop closing, and neutral close-button hover states across Settings,
  About, and Keyboard shortcuts (the native window close control remains the
  only red close action);
- removal of the duplicated About entry from General, leaving About in the
  titlebar's More actions menu;
- Git installation diagnostics, version checks, updates, and identity grouped
  together in the Git section, while General focuses on startup behavior;
- modern nested setting groups with their own heading, description, contained
  surface, and deliberate spacing for Theme, Language, Startup, Git
  installation/updates, and Git identity;
- soft gradient separators in the dialog header, section rail, responsive
  section bar, and content boundaries, matching the sidebar's visual language;
- a clearer paired footer layout in the expanded sidebar: Settings keeps its
  visible label and owns the remaining width, while collapse is a centered
  44×44 icon button. Both remain compact square controls in collapsed mode;
- a more intuitive chevron-pair icon for collapsing and expanding the sidebar.

The main implementation lives in `src/main.tsx` and `src/styles.css`, with
localized copy in `src/i18n.tsx`, the Settings destination icon in
`src/screens.tsx`, focus behavior in `src/modalFocus.ts`, and integration
coverage in `src/main.test.tsx`.

Final validation after all Settings and sidebar refinements:

- `pnpm run typecheck` — clean.
- `pnpm run test` — 157 passed across 16 suites.
- `pnpm run build` — clean.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — clean.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` — clean.
- UI layout detector over the final Settings/sidebar targets — 0 findings.
