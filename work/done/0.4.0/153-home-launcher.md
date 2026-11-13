---
id: 153
title: Turn the no-project screen into Home, a greeting and a launcher
status: done
priority: normal
type: feature
areas:
  - frontend
  - design
  - ux
  - accessibility
  - credentials
  - rust
  - documentation
created: 2026-10-07
completed: 2026-10-08
parent:
queue:
---

# Goal

The screen shown with no project open — and revisitable with projects open —
becomes **Home**: a greeting beside the mascot, then one card that holds a
launcher field, recent and favourite projects, each connected account's
projects, the three ways to start, and what this computer is set up with.

# User outcome

- Opening the app and pressing Enter returns to the last project.
- Typing finds a recent project; pasting a remote address offers to clone it
  with the address filled in; pasting a folder path offers to open it; a typed
  name offers to create a project with that name.
- A first-time user sees what is still missing — Git, a name and email, an
  optional account — inside the card, with a way to fix each.
- A missing Git is said where work would fail, before anything is tried.
- Someone with a GitHub, GitLab or Bitbucket connection browses and clones
  their own projects from Home.
- Nothing appears late from nowhere: places are held while saved connections
  are checked after launch.

# Context

The old screen was a centred empty-state block: the mascot, "No project open",
three peer cards (create, open, clone) and a short recents list. The owner
asked for alternatives inspired by apps that care about their front door (Git
clients have none), reviewed them in an HTML artifact, chose the launcher
variant (D), and iterated on it in the running app. The decisions below were
the owner's.

# Scope

- Rename the destination **Projects → Home / Inicio** (house icon, "Go to
  Home"); Settings' own "Inicio" section becomes "Al abrir la app".
- Greeting: `h1` by part of the day and the Git identity's first name; a
  question under it, one of three per part of the day, different on each
  return to Home.
- Launcher field: filter recents, recognise URLs (`https`, `ssh`, `git`,
  `file`, scp-style) and absolute paths, offer create-by-name; Enter takes the
  first suggestion, drawn selected; arrows walk the rows; Escape clears.
- Continue: the newest recent project leads as the screen's one accent.
- Tabs: Recent, Favorites (once there is one), and one per hosting provider,
  listing that account's projects through the existing repository browser —
  the only network read Home makes, and only on that choice; a chooser inside
  for several accounts on one provider (labelled by login, source and server).
- Setup inside the card: first-run steps; a blocking notice for a missing or
  unusable Git; a status line (Git mark and version, identity name, accounts,
  connect) at the card's foot.
- Placeholders while Git, the identity and accounts are read, one per provider
  still being checked.
- `openedAt` on recent projects; Clone and Create accept a prefilled address or
  name.
- The account catalog reports `busy` from the moment the launch check is
  scheduled (ADR 0027 addendum).
- Move Home's code out of `overview` into `features/home`, with its own
  translations namespace and stylesheet; Overview's no-project fallback reuses
  it. `GitIcon` moves to `shared/ui`.

# Out of scope

- Showing `gh`/`glab` versions on Home (decided against: optional tools; they
  stay in Settings).
- Paging an account's projects inside Home ("See all in Clone" leads to the
  full browser).
- Hiding repositories already cloned on this computer (no remote URLs are
  stored with recent projects).

# Acceptance criteria

- [x] Home is the navigation label and command in both languages, with the
      house icon; no second "Inicio" in Settings.
- [x] Enter in the empty field opens the last project; Continue is the one
      accent, and steps aside for a missing Git.
- [x] URL, path and name queries produce the matching suggestion and never act
      on their own; Clone and Create open prefilled.
- [x] Favourites have their own tab, from the shared favourites store.
- [x] Account tabs read only on an explicit choice; several accounts on one
      provider are told apart by login, source and server; three or more use a
      menu.
- [x] First-run steps, the Git notice and the status line live inside the
      card; the email is never shown.
- [x] No account appears late from nowhere after launch: places are held, one
      per provider still being checked.
- [x] Home sits as high as the shell allows and does not scroll when its
      content fits.
- [x] Keyboard: focus lands in the field on arrival and on every return;
      arrows, Enter and Escape work; every control has an accessible name.
- [x] Unit tests for the launcher logic, component tests for the launcher,
      App integration tests, and a Rust test for the catalog's busy state.

# Relevant files

- `src/features/home/` — `HomeLauncher.tsx`, `LauncherSetup.tsx`,
  `launcher.ts`, `home.css`, `translations.ts` and their tests
- `src/app/App.tsx` — wiring Git, identity, accounts and the repository browser
- `src/runtime/project/recentProjects.ts` — `openedAt`
- `src/features/clone/CloneDialog.tsx`, `src/features/initialize-project/InitializeProjectDialog.tsx`
- `src-tauri/src/credentials.rs`, `src-tauri/src/hosting.rs` — busy launch check
- `src/shared/ui/gitIcon.tsx`
- `DESIGN.md` (Core screens: Home), `docs/adr/0027-verify-saved-accounts-after-launch.md`

# Dependencies

None.

# Decisions

- **Launcher over a dashboard.** One field that understands intent fits "translate
  user intent into safe Git operations", and no visual Git client has a Home to
  compare against.
- **Everything inside one card.** Setup steps use the results area that is empty
  on a first run; the status line is the card's foot. Pills outside the card
  read as buttons and added edges.
- **Accounts said once.** With account tabs, the status line does not repeat them.
- **Placeholders counted, not guessed.** The receipt lists saved connections
  before they are verified, so each pending provider holds one place.
- **Busy from scheduling (Rust).** Without it, a catalog read in the launch
  delay reported nothing in progress and Home never re-read it.
- **`gh`/`glab` versions stay in Settings.** Optional tools; their marks would
  also collide with the account marks.

# Implementation notes

- Floating star and Remove apply only to recent-project rows; account rows keep
  their Enter hint on hover.
- A tab whose chosen account is removed falls back to the first remaining one
  and loads it.
- `readHomeAccounts` (pure, tested) turns the account receipt into Home's
  usable accounts and pending providers.
- Review pass before completion fixed: Enter's target not drawn selected on the
  Favorites tab, floating-control CSS leaking onto account rows, a tab left
  empty after its account was removed, `file://` URLs not recognised, "." and
  ".." offered as project names, and account mapping living in App.

# Validation

- `pnpm run check` (docs, architecture, typecheck, 133 test files / 1351 tests,
  build, `cargo fmt`, Clippy, Rust tests) passed before the review pass, with
  Rust built in a separate `CARGO_TARGET_DIR` because the running dev app
  locks `target/debug/gitodile.exe`.
- After the review pass, the full gate again, run as `pnpm run check:docs`,
  `pnpm run check:frontend` and `pnpm run check:rust` with the same separate
  `CARGO_TARGET_DIR`: docs (285 Markdown files, 203 task ids) and architecture
  (574 modules) passed; typecheck passed; 133 test files / 1359 tests passed;
  build passed; `cargo fmt --check` and Clippy (`-D warnings`) passed; Rust
  tests 579 passed, 1 ignored, plus the helper binary's 1 test.
- Visual checks in the browser pane at 1440×900 and 1456×780 (no scroll, row
  alignment, hover); account and Git states covered by tests, since the
  browser has neither.
