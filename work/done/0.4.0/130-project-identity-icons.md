---
id: 130
title: Show each project a detected or chosen identity icon
status: done
priority: normal
type: feature
areas:
  - frontend
  - rust
  - design
  - accessibility
created: 2026-09-22
completed: 2026-10-05
parent:
queue:
---

# Goal

Give every project an avatar that says what the project is. When a project is
opened, detect its primary language/framework from local repository files and
show that mark automatically. Fall back to the initials-on-colour chip when
nothing is detected or the project is new/empty. Let a person choose, app-wide,
how the avatar is filled when nothing else is chosen (technology, initials, or a
random animal), and override any single project from that project's own settings
with an emoji or its two letters (the crocodile is the suggested first emoji).

The resulting precedence is fixed: **a project's own choice (emoji or initials)
> the app-wide style**.

# User outcome

Opening a Rust repository shows the Rust mark, a fresh `git init` shows its
initials, and a project someone cares about can wear an emoji of their choosing
that survives restarts. A project is recognisable at a glance in the rail, the
project switcher, and the welcome recents, without the user configuring
anything first.

# Context

- Avatar identity is part of the brand layer, not the theme layer
  ([ADR 0012](../../../docs/adr/0012-layer-theme-tokens-and-ship-canonical-palettes.md)):
  `--avatar-color-*`, `--avatar-foreground` and `--avatar-ring` live in
  `src/styles/tokens.css` and no theme may set them. The identity must stay
  fixed across all themes.
- The current avatar is initials-on-colour: `src/shared/ui/projectAvatar.ts`
  (`avatarColorVar`, `avatarInitials`), applied in the rail (`src/app/App.tsx`),
  the project switcher (`src/app/project-switcher/ProjectSwitcher.tsx`), and
  the welcome recents (`src/features/overview/OverviewPanel.tsx`).
- `DESIGN.md` § Icons forbids mixing in a second icon library but licenses
  **artwork naming another product** (file-type icons, stack/OS marks) from the
  installed `@iconify-json/vscode-icons` set with its vendor colours, because a
  logo reduced to one ink stops being recognisable at small sizes. Language and
  framework marks are that same artwork class, so no new dependency is needed.
  Rendering already has a path: raw SVG strings via `unplugin-icons`
  (`~icons/*`) turned into images by `src/shared/ui/rawSvgImage.ts`.
- There is no project-type detection today, in the frontend or in
  `src-tauri/src/`. This task adds it.
- The per-project settings surface exists
  (task [098](../0.2.2/098-per-project-settings.md)) and opens from the gear on
  each switcher row; the icon picker belongs there, not in the app-wide
  Settings dialog.
- Persistence precedent: favourites are stored in `src/app/preferences.ts` as a
  `localStorage` key of canonical worktree roots. The chosen icon should follow
  the same local-first pattern and never write inside the repository or the
  user's Git configuration.
- The direction and precedence were settled with the owner from a throwaway
  HTML mockup (desktop mocks folder, not part of the repository): detected
  technology by default, initials fallback, optional emoji override with the
  crocodile as the suggested default.

# Scope

- Detect a project's primary language/framework in Rust, read-only, from local
  files: a fixed set of manifest names, dependencies and file contents, plus a
  dominant-extension fallback. Return a structured result (technology id,
  source).
- Recompute detection when a project is opened, not on render or screen
  visibility. The frontend reads each open project once per session epoch.
- Expose detection through a narrow command registered in `ipc.rs`; reach it
  from the owning feature through a typed port and the feature's `tauriAdapter`,
  never with a direct `invoke` in a component.
- Pin the new command the way the IPC contract requires: one entry in
  `docs/architecture/025-ipc-contract.json`, the matching update in
  `src/architecture/ipcContract.test.ts` (command count and name list), a module
  and `generate_handler!` registration in `src-tauri/src/lib.rs`, and an
  `EXECUTION_INVENTORY` policy plus checked registry name in
  `src-tauri/src/application.rs`.
- Add a project-identity model in shared UI code that resolves the precedence
  (project choice → app-wide style → detected technology → initials) and renders
  the three sources: a detected logo on a neutral, themed tray; an emoji on a
  soft tinted chip; initials-on-colour as today.
- Add an app-wide **Interface → Project icons** preference (technology default,
  initials, random) rendered as three preview cards, and a per-project Icon
  section that offers Automatic (follow the app-wide style), Initials, and the
  emoji grid as three matching cards with a live preview.
- Persist both per machine: the app-wide style under
  `gitodile-project-avatar-style`, the per-project choice under
  `gitodile-project-icons` keyed by the canonical worktree root, mirroring
  favourites; clear a project's choice on reset.
- Keep the brand ring and the fixed palette; the tray uses themed surface and
  border tokens.
- Cover translations (`en`, `es`), documentation (`DESIGN.md` § Icons/Theming),
  and tests.

# Out of scope

- Uploading custom images, and any network lookup (GitHub avatars, remote
  favicons).
- Changing the existing per-file icons in Changes/History.
- Replacing the fixed avatar palette or the brand ring.
- Moving project metadata or preferences to a native/Tauri store.
- Detecting nested sub-projects inside a monorepo.
- A second icon library or hand-drawn icon sets; animal art is emoji only.

# Acceptance criteria

- [x] Opening a project with a clear technology shows the matching
  language/framework mark automatically; unknown, ambiguous, or empty projects
  fall back to initials.
- [x] Precedence is exact: a chosen icon overrides detection, a missing choice
  uses detection, and a reset returns to detection (or initials when there is
  none). A chosen icon survives an app restart.
- [x] Detection is read-only, never writes to the repository or the user's Git
  configuration, and runs on project open or explicit refresh — not on render.
- [x] Language/framework marks come from the installed vscode-icons set with no
  new icon dependency; emoji use the system emoji font; the chip keeps
  `--avatar-ring` and looks correct and unchanged in identity across all
  themes.
- [x] The picker is keyboard-operable, announced to assistive technology, and
  handles the none/undetected case; the reset actions are discoverable.
- [x] Rust unit tests cover the detection parser/planner, and an integration
  test covers detection against a temporary repository; frontend tests cover
  the precedence model and the picker.
- [x] `pnpm run check` passes.

# Relevant files

- [`AGENTS.md`](../../../AGENTS.md)
- [`DESIGN.md`](../../../DESIGN.md)
- [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md)
- [`docs/adr/0012-layer-theme-tokens-and-ship-canonical-palettes.md`](../../../docs/adr/0012-layer-theme-tokens-and-ship-canonical-palettes.md)
- [`docs/architecture/025-ipc-contract.json`](../../../docs/architecture/025-ipc-contract.json)
- `src/shared/ui/projectAvatar.ts`, `src/shared/ui/projectIdentity.ts` (new),
  `src/shared/ui/technologyMarks.ts` (new),
  `src/shared/ui/projectAvatarView.tsx` (new), `src/shared/ui/index.ts`,
  `src/shared/ui/primitives.css`, `src/shared/ui/rawSvgImage.ts`
- `src/shared/file-icons/index.ts`
- `src/app/App.tsx`, `src/app/AppOverlays.tsx`,
  `src/app/project-switcher/ProjectSwitcher.tsx`,
  `src/app/projectTechnologies.ts` (new)
- `src/features/overview/OverviewPanel.tsx`
- `src/features/project-settings/` (panel, domain, port, tauri adapter,
  translations, `project-settings.css`)
- `src/features/settings/` (panel, translations, `settings.css`)
- `src/app/preferences.ts`, `src/styles/tokens.css`
- `src/architecture/ipcContract.test.ts`, `src/architecture/styleComposition.test.ts`
- `src-tauri/src/technology.rs` (new), `src-tauri/src/lib.rs`,
  `src-tauri/src/ipc.rs`, `src-tauri/src/application.rs`
- `scripts/check-frontend-architecture.mjs` (`maxBuffer` tooling fix)
- Prior art: [098](../0.2.2/098-per-project-settings.md),
  [095](../0.2.2/095-favourite-recent-projects.md),
  [060](../0.1.0/060-per-project-identity.md),
  [017](../0.1.0/017-file-type-icons.md)

# Dependencies

- Per-project settings surface (task 098) — done.
- No new library: `@iconify-json/vscode-icons` and `unplugin-icons` are already
  installed.

# Decisions

- Precedence: a project's own choice (emoji or initials) > the app-wide
  Interface → Project icons style (technology default, initials, random) >
  detected technology > initials. Settled with the owner from the mockup and
  refined in the running app; the fallback is never empty.
- Picker lives in Per-project settings (the switcher gear), not in app-wide
  Settings, because the choice belongs to the repository.
- Persistence follows the favourites pattern: a `localStorage` key
  (`gitodile-project-icons`) keyed by the canonical worktree root, local-first,
  nothing written into the repository.
- Detection rule (fixed, not inferred), in order: a desktop/app platform (Tauri,
  Electron, Expo, Flutter, Capacitor, Ionic, Godot); a named
  JavaScript/TypeScript framework; a framework of another language (Django,
  Rails, Symfony); a language manifest; a plain Node/TypeScript project;
  infrastructure (Docker, Terraform, Nix, Bazel, Ansible, Serverless, Helm,
  Firebase); then, only when the root is silent, a bounded dominant-extension
  scan (depth 4, 4000 files, 8000 entries, minimum 3 files). A tied maximum is
  ambiguous and returns initials. Root manifest reads are capped at 1 MiB and
  do not follow symlinks. The serialized slugs are the IPC contract's and match
  the frontend icon map. Revised twice with the owner: the
  first version put the view framework first, so a Tauri app showed React (the
  platform tier was added); coverage was then widened to 71 slugs while a mark
  exists in vscode-icons — Laravel, Remix, Qwik, Unity, Unreal and Makefile were
  left out because the collection has none.
- The technology read lives in the `project-settings` feature's port and
  adapter: it shares the per-project target, cache and close-guard pattern the
  icon choice already needs, and avoids a screen-less feature directory.
- No separate Rust cache. Detection is a handful of root-file reads plus a
  bounded walk, and the frontend hook reads each project once per session epoch
  and keeps the answer, so a Rust-side cache would only add an invalidation
  problem. Re-reading on a new epoch is the "explicit refresh" path.
- The per-project choice stores an emoji or the reserved `PROJECT_ICON_INITIALS`
  (added at the owner's request so every option is reachable from every
  surface); a missing entry means "automatic". "Initials" is therefore a real
  per-project value, not only an app-wide style.
- Recent projects that are not open have no session epoch, so no detection is
  requested for them. Their last successful detection is stored with the
  recent entry and survives an app restart; old entries without a detection
  still show initials until opened.
- Emoji source: the system emoji font, named once as `--font-emoji`. A bundled
  colour set stays a follow-up only if cross-platform rendering proves a real
  problem.
- The picker offers a curated, bounded set (24): mostly animals for the mascot's
  tone, plus a few neutral marks (package, rocket, seedling, palette,
  microscope, wrench, books, game) for projects that are not a creature. Every
  entry is a Unicode 6-9 addition so the colour-emoji fonts on all three
  platforms render it, and each differs in silhouette and colour so it reads at
  rail size. `random` draws from this same set, so changing the set reshuffles a
  project's stable animal (acceptable; it is decoration).
- `scripts/check-frontend-architecture.mjs` needed a `maxBuffer` larger than
  Node's 1 MB default: the cruised graph (410 modules) truncated the
  dependency-cruiser JSON mid-string once this task added its modules. The
  script now also fails loudly on `spawnSync` error instead of a JSON parse
  error. This is a tooling fix, not a change to any rule.
- The app-wide style is presented as three preview cards, each rendering three
  sample projects under that style, rather than a text segmented control; the
  per-project section mirrors the same card shape so the choice reads the same
  in both places and the picker is not a loose grid under the other options.

# Implementation notes

Rust:

- `src-tauri/src/technology.rs` (new) owns detection: `Technology` (71 slugs),
  `TechnologySource`, `ProjectTechnology { path, technology, source }`, and
  `read_project_technology`, which authorizes the repository and scans its
  worktree root. No Git, no network, no writes.
- Wiring: `mod technology` and `ipc::read_project_technology` in `lib.rs`; the
  session-validating adapter in `ipc.rs`; the `read("read_project_technology")`
  policy in `application.rs` (and the matching entry in its `REGISTERED` test
  list); the command pinned in `docs/architecture/025-ipc-contract.json`.

Frontend:

- `src/shared/ui/projectIdentity.ts` (new): the slug union, `ProjectTechnology`,
  `sanitizeEmoji`, `resolveProjectIdentity` (the precedence), technology labels
  and the curated emoji list.
- `src/shared/ui/technologyMarks.ts` (new): technology slug → vscode-icons SVG
  source. `src/shared/ui/projectAvatarView.tsx` (new) renders the chip
  (emoji | technology-on-tray | initials) and is exported as `ProjectAvatar`;
  its styles live in `primitives.css`; `--font-emoji` was added to
  `tokens.css`.
- `src/features/project-settings/port.ts` and `tauriAdapter.ts` gained
  `readTechnology`; the panel gained an `IconSection` and a fourth rail section
  (`icon`), with `project-settings.css` styles and `en`/`es` strings.
- `src/app/projectTechnologies.ts` (new) reads each open project's technology
  once per epoch; `src/app/App.tsx` composes it, merges emoji + technology into
  the switcher, jump-menu and recents view models, and passes the identity to
  the five avatar call sites (now one shared component).
- `src/app/preferences.ts` gained `useStoredProjectIconChoices` (the
  `gitodile-project-icons` key) and `useStoredProjectAvatarStyle` (the
  `gitodile-project-avatar-style` key).
- Docs: DESIGN.md § Icons describes the identity icon and its precedence.

Follow-up added at the owner's request, after the running-app check: an app-wide
**Interface → Project icons** preference chooses how every project's avatar is
filled when the project has no choice of its own — `technology` (default),
`initials`, or `random`. It lives in `src/features/settings` (three preview
cards in the Appearance section, each showing three sample projects) and
`src/app/preferences.ts` (`useStoredProjectAvatarStyle`, key
`gitodile-project-avatar-style`). `random` is a stable animal derived from the
project id (never reshuffled on render or relaunch). The resolution moved into
`resolveProjectIdentity({ id, choice, technology, style })`, and the
`ProjectAvatar` component takes `iconChoice` and `style` props carried on the
switcher, jump-menu and recents view models.

The first validation pass ran unit, architecture, type and build checks without
the desktop app. A later running-app pass caught and corrected the lifecycle
issue below. The entry bundle was checked: technology marks code-split into
their own chunk and the entry chunk did not grow.

Found while validating against the running app: the first hook version gated
its state update on a "still mounted" ref whose cleanup only ever set the flag
to `false`. `React.StrictMode` (used in `src/bootstrap.tsx`) mounts, unmounts
and remounts the same instance in development, so the flag stayed `false` and
every detection answer was dropped — the avatar silently fell back to initials.
The guard is removed entirely: a late resolution now calls `setState` on an
unmounted component, which React ignores, so there is no flag to mis-arm. The
hook tests run under `StrictMode`, though the vitest runner did not reproduce
the double-mount on its own, which is why the component test alone would not
have caught it. The technology read is exercised directly (it returns `react`
for this repository).

The section also now distinguishes a failed read ("Couldn't read this project's
technology.") from a project with nothing detected, instead of showing the
empty-detection message for both.

Review follow-up: detection results are bound to the project session epoch, so
an older read cannot replace a newer session's mark after close and reopen.
The last successful answer is also saved in the local recent-project entry;
closed projects retain their detected mark on restart without a speculative
filesystem read. C source files now resolve to C, C++ source files to C++, and
a bare `CMakeLists.txt` no longer asserts C++ without source evidence.

After the same check, further changes at the owner's request: the per-project
section offers **Initials** as well as emoji and Automatic, as three matching
cards (the emoji grid is presented as the third card rather than a loose grid),
so every option is reachable from every surface; the stored choice is therefore
"an emoji or `PROJECT_ICON_INITIALS` or absent", keyed by the project, and the
precedence is "per-project choice > app-wide style". The emoji glyph is sized
from the chip (`72cqh` with a container, `1.6em` fallback) rather than inheriting
the initials' text size, so it reads at 20px and 56px alike. The project-settings
preview takes the app-wide style too, so "Automatic" previews the identity the
rail would really use; the jump menu, switcher and recents all carry the style.
`sanitizeEmoji` now also rejects control characters, and the technology hook
skips a session with no epoch instead of manufacturing a failing read.

# Validation

- `cargo test --manifest-path src-tauri/Cargo.toml --lib technology` — 16 passed
  (detection rule including the desktop-platform tier, other-language
  frameworks, extension fallback, serialization, an initialized-repo fixture).
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
  --all-features -- -D warnings` — clean.
- `pnpm run check:rust` (fmt --check, clippy, all tests) — passed; 427 lib
  tests, including the IPC contract and execution-policy inventories.
- `pnpm run check:frontend` (architecture, typecheck, tests, build) — passed;
  architecture over 443 modules, 936 tests.
- `pnpm exec vitest run` on the touched areas — passed
  (`projectIdentity`, `projectAvatarView`, `projectTechnologies`,
  `project-settings`, `settings`, `appShell`, `overview`, `styleComposition`).
- `node scripts/check-docs.mjs` — passed.
- `pnpm run check` (docs, frontend, Rust fmt/clippy/tests) — passed.

## Closure review (2026-10-05)

Reviewed the implementation, acceptance criteria and recorded validation.
The approved feature scope is implemented; historical validation above is
preserved. Closed during the requested task-status review.

Closure checks: `node scripts/check-docs.mjs` passed. Focused theme contrast,
project identity, avatar and session-technology tests passed (4 files, 29 tests).
The current `pnpm run check` passed documentation/icon and architecture checks
but stopped in TypeScript: the existing, untracked RepositoryBrowser.tsx uses
missing `repositoriesLoadHint` and `repositoriesConnectionHint` translation keys.
This task-status change does not alter that parallel implementation; the
historical full-gate pass above is not a claim that the current full tree passes.
