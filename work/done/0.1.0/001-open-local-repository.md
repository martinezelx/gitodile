---
id: 001
title: Open and validate a local repository
status: done
priority: high
type: feature
areas:
  - rust
  - frontend
  - platform
created: 2026-07-23
completed: 2026-07-25
---

# Goal

Allow the user to select a local folder and determine safely whether it belongs to a valid Git repository or worktree.

# User outcome

A user can open an existing project without using the terminal and receives a clear explanation when the selected folder is not usable.

# Context

This is the first vertical slice connecting the React interface, Tauri command boundary, Rust application layer, system Git, and platform-native folder selection.

The implementation must establish patterns that later repository operations can reuse. Keep Git execution and parsing outside visual components.

The remaining work in this task is the opened-project Overview shown after
`open_repository` succeeds. An attached visual concept established a useful
direction: a project header, one prominent next-action card, compact project
facts, and recent activity inside the existing application shell. The concept
is a direction rather than a literal data contract. It includes remote sync,
working-tree status, history, publishing, branch switching, and recovery
information that this task does not yet calculate.

The Overview must therefore be useful with the repository information already
available, while leaving honest extension points for later tasks. It must never
show invented activity, claim that a recovery point exists, call a project
"synchronized", or present an enabled action unless the corresponding state and
operation are real.

# Scope

- Add a native folder-selection flow.
- Validate the selected path in Rust.
- Detect a normal repository and a linked worktree.
- Return structured repository information to React.
- Display project name, absolute path, worktree type, current branch when available, and a plain-language status message.
- Replace the temporary opened-project summary card with a complete,
  production-quality Overview state that follows the specification below.
- Provide loading, cancellation, invalid-folder, Git-missing, and unexpected-error states.
- Make the opened-project Overview work in light and dark themes, from a
  1024px-wide desktop window upward, and remain usable in narrower supported
  windows.

# Opened-project Overview specification

## Experience goal

Within a few seconds of opening a project, the user should be able to answer:

1. Which project did I open?
2. Which folder and branch am I looking at?
3. Is this a normal repository or a linked worktree?
4. Is the project usable, or does it need attention?
5. What can I safely do next?

The screen is an **Operate** surface: scanability, truthful state, keyboard
access, and a clear next action take priority over decorative density.

## Information hierarchy

### 1. Project header

- Use the repository name as the page heading; do not repeat "Resumen" as the
  primary heading above it.
- Show a short, plain-language descriptor below the name:
  - normal repository: "Local project";
  - linked worktree: "Separate workspace";
  - unborn branch: explain that the project has no saved versions yet;
  - detached HEAD: explain that a specific saved version is open and avoid
    implying that the user is on a normal branch.
- Show the current branch when one exists. Exact refs are
  technical data and use the monospaced font.
- Keep the resolved worktree root available in the interface. The full absolute
  path may be shown as secondary text, in a project-details disclosure, or in
  the project menu, but it must not disappear from the opened state. Truncated
  paths must expose the complete value through an accessible title/description
  and should be copyable when that interaction exists.
- If the selected folder differs from the resolved worktree root, explain that
  GitOdile opened the containing project and retain both paths in technical
  details.
- Provide one compact project menu for infrequent project-level actions. In
  this task it may contain only actions that already work, such as opening
  another project and closing the current project. Future items must be omitted
  or visibly disabled with "Coming soon"; never render inert controls.

### 2. Primary status / next-action card

- This is the strongest card on the page and contains exactly one primary
  message and, when available, one primary action.
- For task 001, its success state communicates that the project opened
  correctly and summarizes the current branch, unborn-branch, detached-HEAD, or
  linked-worktree state from real `RepositoryInfo` data.
- Do not show a pending-change count until a later status task provides a real,
  typed working-tree result.
- Do not show "Review changes", "Save version", "Publish changes", or a
  three-step progress tracker as enabled workflow steps in this task. When those
  operations exist, the tracker may be introduced as contextual guidance, but
  saving and publishing must remain independent actions: a local save must
  never appear to require publication.
- The card must also have loading and diagnostic variants that use the shared
  loading/empty/error-state pattern from `DESIGN.md`.

### 3. Project facts

Show a small set of factual, data-backed cards or rows. For task 001:

- **Current branch**: branch name when available, or the appropriate
  unborn/detached explanation.
- **Project location**: resolved root path, with worktree status and selected
  subfolder context when relevant.
- **Project type**: normal local project or linked worktree/separate workspace.
- **Git availability**: do not duplicate the full Settings diagnostic, but
  surface a concise actionable error if Git prevents the project from being
  inspected.

Prefer two or three useful facts over a visually complete but fictional grid.
Cards must be omitted when the product has no truthful value to display.

### 4. Capability navigation

- Keep the sidebar structure from `DESIGN.md`: Overview, Changes, History,
  Workspaces/branches when introduced, Recovery, and Settings.
- Overview is selected.
- Screens not implemented by this task remain disabled with reduced emphasis
  and a localized "Coming soon" tooltip. They must not look clickable and then
  do nothing.
- The same actions remain reachable from the command palette where already
  supported.

## Future data slots shown in the concept

The following modules are valid future additions to this Overview, but they are
not acceptance requirements for task 001 and must not be faked:

- working-tree summary and "Review changes";
- save-version/publish guidance;
- remote provider, upstream, ahead/behind/diverged state, and last fetch time;
- recent saved versions and activity;
- branch switching;
- recovery-point availability and recovery actions.

When later tasks add these modules:

- derive every number, timestamp, author, provider, branch/ref, and status from
  typed backend data;
- support repositories with no remote, a non-GitHub remote, several remotes, no
  upstream, offline/error states, and unpublished local branches;
- distinguish "working files have local changes" from "saved versions are up to
  date with the remote". A repository may be aligned with its upstream and
  still have unsaved local edits, so a generic "Synchronized" badge is
  insufficient;
- use provider-neutral wording by default. Show "GitHub" only after detecting a
  GitHub remote; task 001 must not say "GitHub connected";
- never claim "Safe point available" unless a real recovery reference exists;
- do not duplicate the same latest saved version in both a summary card and an
  activity list unless each presentation supports a distinct user decision;
- place exact terms such as `origin/main` and "commit" in secondary/advanced
  detail. Default copy continues to use "saved version", "publish changes", and
  "branch" where that wording remains technically accurate.

## Layout and visual rules

- Treat the supplied concept as a composition reference, while using the
  existing **Friendly Card** system in `DESIGN.md`.
- Use opaque `--surface-panel` / `--surface-raised` surfaces, semantic color
  tokens, subtle borders, and the theme-aware shadow tokens. Do not reproduce
  the concept as permanent glass/translucent chrome.
- Use 14–18px radii for panels/cards and 8–10px radii for controls. Green
  indicates brand emphasis or a verified positive state, not generic metadata.
- Keep the primary status card visually dominant. Secondary facts should have
  quieter contrast and must not compete with the primary action.
- Avoid empty cards inserted only to complete a symmetric grid.
- At wide sizes, project facts may use two columns. Collapse to one column before
  text or controls become cramped. At approximately 1024px the screen must not
  require horizontal scrolling; the existing sidebar may collapse to preserve
  the work area.
- Long repository names, branch names, paths, localized copy, and text zoom
  must wrap or truncate without overlapping adjacent actions.
- Dense Git content introduced later (diffs, file lists, commit data) uses solid,
  highly readable backgrounds rather than translucency.

## Interaction and accessibility

- All actions use semantic buttons/links and are reachable by keyboard in a
  logical order.
- Preserve a clearly visible `:focus-visible` treatment in both themes.
- Icon-only controls have localized accessible names and comfortable pointer
  targets (44px where the layout allows; never below the established desktop
  control minimum).
- Icons and color are never the only carrier of branch, worktree, success,
  warning, or error meaning.
- Use one logical `h1` for the project name and ordered section headings below
  it. Cards that navigate or perform an action must expose that affordance
  semantically rather than making an arbitrary container clickable.
- Loading changes expose a busy state; errors use `role="alert"` or an
  equivalent live announcement without repeatedly stealing focus.
- Any status refresh added later must announce material changes accessibly.
- Motion stays within the timing tokens, communicates state changes only, and
  respects `prefers-reduced-motion`.
- All visible copy, accessible labels, tooltips, dates, and empty/error states
  are localized in English and Spanish. Shortcuts use `Ctrl` on Windows/Linux
  and `Cmd` on macOS.

## Required states

- **Opening**: retain the current shell and show a non-blocking loading state;
  prevent duplicate opens without making cancellation look like an error.
- **Normal repository**: name, resolved root, branch, and usable-project message.
- **Linked worktree**: explicitly identify it as a separate workspace and retain
  common Git-directory data only in technical details.
- **Unborn branch**: explain that there are no saved versions yet; do not render
  last-version or recent-activity modules.
- **Detached HEAD**: explain that a specific saved version is open; do not show
  branch-changing or publishing assumptions.
- **Nested folder selected**: show the resolved project and make the selected
  subfolder discoverable.
- **No remote / unknown provider**: no GitHub or synchronized claims.
- **Invalid, bare, missing, unreadable, or Git-unavailable folder**: keep the
  no-project state, show a localized actionable diagnostic, and offer retry/open
  another folder as appropriate.
- **Narrow window / long content / 200% text scaling**: preserve reading order,
  actions, and access to the full path without horizontal page scrolling.
- **Light, dark, and system theme**: all states remain legible and meet the
  contrast requirements in `DESIGN.md`.

# Out of scope

- Cloning repositories.
- Persisting recent projects.
- Full working-tree status or diff parsing.
- Authentication and remote-provider integration.
- Saving versions, fetch, pull, or push.
- Designing the final onboarding experience.
- Detecting/reporting the installed Git version — its own task, see `work/done/0.1.0/002-detect-git-version.md`.
- The full integration-test matrix from `docs/ARCHITECTURE.md` (ahead/behind, merge conflict, non-ASCII paths, etc.) — only enough to cover what this task actually builds.

- Implementing the future Overview modules listed above merely to match the
  supplied concept.
- A GitHub-only project model or hard-coded demo data.

# Acceptance criteria

- [x] The user can invoke a native folder picker from the existing interface.
- [x] Cancelling the picker leaves the current state unchanged and is not shown as an error.
- [x] Validation and Git execution happen in Rust, not in React.
- [x] Normal repositories and linked worktrees are recognized.
- [x] A non-repository folder produces a structured, understandable error.
- [x] Missing or unusable Git produces a structured diagnostic with remediation guidance.
- [x] React receives typed repository data rather than raw command output.
- [x] The primary result is explained in plain language, with exact Git details available secondarily.
- [x] Simple Rust tests cover valid repo, non-repo folder, missing folder, and linked-worktree detection using temporary repositories.
- [x] Selecting a nested folder resolves and returns the real worktree root while retaining the selected path.
- [x] Bare repositories are rejected explicitly rather than accepted as working projects.
- [x] Branch, unborn-branch, and detached-HEAD states are represented as typed data rather than presentation strings.
- [x] The required frontend and Rust checks pass.
- [x] The temporary opened-project summary is replaced by the specified
      production Overview without adding fictional repository data.
- [x] The Overview header shows the project name, resolved root path, project or
      worktree type, and branch/unborn/detached state in plain language.
- [x] A nested selection makes both the opened project root and original
      selected path discoverable.
- [x] Only actions supported by task 001 are enabled; future navigation and
      project actions are omitted or explicitly disabled with localized
      "Coming soon" guidance.
- [x] The Overview has verified loading, normal repository, linked worktree,
      unborn branch, detached HEAD, nested-selection, and diagnostic states.
- [x] No part of the task-001 Overview claims that GitHub is connected, the
      project is synchronized, changes exist, history exists, or a recovery
      point exists without typed backend evidence.
- [x] The opened-project state remains usable at approximately 1024px, in a
      narrower supported window, with long names/paths, and at 200% text zoom,
      without horizontal page scrolling or hidden actions.
- [x] The opened-project state has been checked in both light and dark themes;
      text/status pairings meet WCAG AA, and state is never conveyed by color
      alone.
- [x] All Overview actions and disclosures are keyboard reachable, have visible
      focus, and icon-only controls have localized accessible names.
- [x] New Overview copy, labels, tooltips, and error/loading text are covered in
      English and Spanish.
- [x] The "project open" state has been visually verified in the real desktop
      app against a real repository, a real linked worktree, an unborn branch, a
      detached HEAD, a nested folder, and a real non-repo folder — not just
      inferred from a browser-only fallback check.

# Relevant files

- `AGENTS.md`
- `DESIGN.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `work/README.md`
- `src/`
- `src-tauri/src/`

# Dependencies

- System Git is the initial Git implementation strategy.
- A Tauri dialog capability/plugin may be introduced if required; keep permissions minimal and explicit.

# Decisions

- This task should define a structured command/result boundary that later Git features can extend.
- Do not expose raw stderr as the main user-facing message.
- **Scope trim (agreed with user), later corrected:** "detect and report the installed Git version" was first dropped from this task, on the grounds that `work/README.md`'s own naming example already treats it as a separate task (`002-detect-git-version.md`), and `backlog.md` lists it under "Foundation" separately from "Open and validate a local Git repository" under "Repository experience". The user then confirmed the feature itself is still needed, just not inside *this* task — so it was promoted and built as `work/done/0.1.0/002-detect-git-version.md` right after this one, keeping the task granularity intact.
- **Scope trim, then partially reinstated:** automated tests were first deferred (see below), then the user asked for "some simple ones" while task 002 was underway. `open_repository`'s tests (valid repo, non-repo folder, missing folder, linked worktree) were added at that point, using real temporary Git repositories rather than mocks — see Implementation notes.
- The full integration-test matrix in `docs/ARCHITECTURE.md` (ahead/behind, merge conflict, non-ASCII paths, etc.) remains out of scope here — that's a testing strategy for the whole Git layer over time, and none of those scenarios are touched by what this task builds.
- Worktree vs. repository is determined by comparing `git rev-parse --git-dir` and `--git-common-dir`: equal means a normal repository, different means a linked worktree — the same check Git itself uses internally.

- **Overview concept audit:** keep the supplied concept's strong hierarchy,
  prominent next action, compact project facts, and calm desktop composition.
  Do not copy its glass-like surfaces, compulsory review-save-publish stepper,
  GitHub assumptions, ambiguous "Synchronized" status, unverified recovery
  promise, duplicated latest activity, or demo values. These conflict with the
  product's opaque Friendly Card system, provider-neutral direction, progressive
  disclosure, and rule that the interface must never hide or invent
  consequences.
- Saving a version and publishing changes are separate outcomes. A future
  progress pattern may recommend both contextually, but it must not imply that a
  local save is incomplete until it is published.
- The project name is the opened Overview's `h1`; "Overview/Resumen" remains the
  navigation label and contextual location rather than a competing page title.

# Implementation notes

- Follow-up hardening resolves the worktree root with `--show-toplevel`, retains the selected path plus absolute Git/common-Git directories, rejects bare repositories, and models HEAD as `branch`, `unborn`, or `detached`.
- Rust now returns a serializable `{ code, message, remediation }` error instead of `Result<_, String>`. React localizes the stable code; the Rust message remains a technical fallback.
- `src-tauri/src/lib.rs`: added `open_repository(path)` Tauri command. Runs `git -C <path>` subcommands (no shell interpolation) to check `--is-inside-work-tree`, compare `--git-dir`/`--git-common-dir` for worktree detection, and read `branch --show-current`. Distinguishes "git executable not found" (`io::ErrorKind::NotFound`) from "folder isn't a repository" with separate, plain-language messages. On Windows, git is spawned with `CREATE_NO_WINDOW` so no console flashes.
- `src-tauri/Cargo.toml` / `capabilities/default.json`: added `tauri-plugin-dialog` and the single `dialog:allow-open` permission — nothing broader.
- `src/main.tsx`: "Open a project" opens the native folder picker (`@tauri-apps/plugin-dialog`), calls `open_repository`, and Overview renders a project summary (name, worktree badge when relevant, plain-language status message, path) on success, or an inline error on failure. Cancelling the picker resolves to `null`/no-op — no error shown. "Clone from GitHub" stays disabled ("Coming soon"); persisting recent projects is intentionally out of scope here.
- Command palette gained matching "Open a project" / "Close project" entries.
- `src-tauri/src/lib.rs` `#[cfg(test)] mod tests`: added while implementing task 002, covering `open_repository` — `open_repository_recognizes_a_valid_repository`, `open_repository_rejects_a_non_repository_folder`, `open_repository_rejects_a_missing_folder`, `open_repository_detects_a_linked_worktree`. Each creates/removes a real temporary Git repository (via `git init`, `git commit --allow-empty`, `git worktree add`) rather than mocking the process — no new test-only dependency.

- **Opened-project Overview completion (supersedes the earlier summary-card
  note):** `src/main.tsx` now uses the project name as its `h1` and renders the
  resolved path, a truthful readiness card, current branch, location,
  project/worktree type, nested-selection context, and a keyboard-accessible
  technical-details disclosure. "Open another project" is the sole primary
  action; close remains in the project menu.
- `src/styles.css` replaces the temporary centered summary with the opaque
  Friendly Card composition, semantic token colors, responsive fact layout,
  44px project controls, visible summary focus, reduced-motion handling,
  long-path truncation, and full technical disclosure.
- `src/i18n.tsx` contains complete English and Spanish copy for the new
  Overview. `src/repositoryOverview.ts` keeps presentation-state derivation out
  of the component, and its test covers normal, worktree, nested-selection,
  unborn, and detached states.
- **Overview audit follow-up.** A review of the first Overview build against
  this specification found real gaps, all fixed:
  - truncated paths exposed no complete value — the resolved root now renders
    through a `ProjectPath` component with `title` plus a copy button and a
    polite `role="status"` confirmation, and the nested selected path carries
    `title` too;
  - the primary card showed success chrome (green check, "Your project is
    ready") while an open failure was printed inside it. The card now has
    explicit `success`/`loading`/`error` variants that swap icon, tone, border,
    headline, and message together;
  - opening another project only changed a button label; the card now has a
    real loading variant;
  - the facts region was labelled with the navigation string ("Overview"); it
    now has a visible `h2` "Project details" and the fact labels dropped from
    `h2` to `h3`, so the heading order is `h1` → `h2` → `h3`;
  - the project menu was a `<details>` that trapped the user open. It is now a
    button + popover with `aria-haspopup`/`aria-expanded`, outside-click and
    `Escape` dismissal, and focus returned to the trigger.
- **Overview composition.** The resolved path was rendered three times (header,
  location fact, technical details); the header copy was removed and replaced by
  a chip row (project type, branch) that mirrors the concept's at-a-glance
  band without adding data. Facts became individual `--surface-panel` cards
  instead of three rows sharing one border, and their accent-tinted icon chips
  were dropped: green is now reserved for the verified positive state in the
  primary card, per `DESIGN.md`. Off-scale values (`clamp(25px, 3vw, 32px)`,
  54px icon, `font-weight: 650`, 3/5/6px margins) were moved onto the token
  scale.
- The primary card keeps "Open another project" as its enabled primary action
  and adds a visibly disabled "Review changes — Coming soon" secondary. This
  restores the concept's forward-looking shape while honouring the rule that
  workflow steps must not be enabled in this task, and keeps an enabled path on
  screen rather than leaving the icon menu as the only working control.
- `src/repositoryOverview.ts` now resolves the copy keys (`headlineKey`,
  `versionDescriptionKey`, `projectTypeKey`, `projectTypeDescriptionKey`)
  instead of leaving nested ternaries in JSX; the component looks them up on
  `t`, so a missing translation is a type error.
- Real desktop validation uncovered and fixed a repository bug:
  `git rev-parse --git-common-dir` is relative to the directory supplied to
  `git -C`, not always to the repository root. Resolving it from the root
  misclassified a normal repository as a linked worktree when a nested folder
  such as `src` was selected. `open_repository` now resolves it from the
  canonical selected folder, and the nested-folder Rust test asserts that
  `kind` remains `repository` and both Git directories match.

# Validation

## Overview audit follow-up (2026-07-25)

- `pnpm run check:frontend` (typecheck + test + build) — pass, 8 tests.
- Layout measured in the running dev server with a long project name and a
  nested selection: no horizontal page scroll at 1280px, 1024px, or 512px
  (equivalent to 1024px at 200% zoom), and no element overflowing the viewport.
  The primary card collapses to two columns at 1100px and one at 800px; the
  fact grid goes 3 → 2 → 1.
- Project menu verified by keyboard: opens with `aria-expanded="true"`, closes
  on `Escape`, and focus returns to the trigger.
- `cargo fmt -- --check`, `cargo clippy --all-targets --all-features -D warnings`,
  and `cargo test` — pass, 15 tests, no warnings.
- Real desktop pass over the linked-worktree, unborn-branch, detached-HEAD, and
  non-repository states with these changes — confirmed by the user. This closed
  the last open acceptance criterion.

## Final implementation validation (2026-07-24)

- `pnpm run typecheck` — pass.
- `pnpm run test` — pass (2 files, 8 tests).
- `pnpm run build` — pass.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` — pass.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` — pass, no warnings.
- `cargo test --manifest-path src-tauri/Cargo.toml` — pass (15 tests).
- UI detector over the changed frontend targets — pass with no findings.
- Real Tauri desktop validation — pass for native folder selection, a real
  repository, a real nested selection, root/selected-path disclosure, the
  worktree-classification regression, project menu/disclosure semantics,
  English/Spanish copy, and light/dark themes.

## Earlier validation

- `cargo fmt -- --check` — pass.
- `cargo clippy --all-targets --all-features -- -D warnings` — pass, no warnings.
- `cargo test` — pass (11 tests total; repository coverage includes nested selection, bare repositories, linked worktrees, and detached HEAD).
- `npm run typecheck` — pass.
- `npm run build` — pass.
- Native folder picker exercised by the user running the actual desktop app (`npm run tauri dev`) — the dialog itself isn't covered by the Rust tests since it's a native OS surface, not process logic.
