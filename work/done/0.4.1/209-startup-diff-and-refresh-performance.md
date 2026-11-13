---
id: 209
title: Trim launch JavaScript, diff scrolling work and project refresh processes
status: done
priority: normal
type: performance
areas:
  - frontend
  - rust
  - docs
created: 2026-10-27
completed: 2026-10-28
parent:
queue:
---

# Goal

Polish 0.4.1 with measured performance fixes found in a performance review
before the release closes: less JavaScript evaluated at launch, less work per
frame while scrolling a diff, and fewer Git processes each time a project's
identity is read again. Extended on 2026-10-28, at the user's request, to load
only the active language at launch, to profile the composition root's render
breadth before touching it, and to re-measure the launch-weight baseline.

# User outcome

GitOdile starts with less code to parse, large diffs scroll more smoothly with
syntax highlighting on, and saving, switching branches or getting project
changes refreshes the project a little sooner, most noticeably on Windows
where each Git process is expensive.

# Context

A review of the `release/0.4.1` tree on 2026-10-27 found:

1. The `vendor` code-splitting group in `vite.config.ts` matched every
   `node_modules` path. Because the entry imports `vendor` statically, the
   Markdown preview stack (`react-markdown`, `unified`, `remark-*`,
   `micromark`, `mdast`/`hast` utilities and `diff`), used only by the lazy
   Changes screen, was evaluated at launch. A trial build limiting the group
   to the libraries the shell needs eagerly cut `vendor` from 483.70 kB to
   319.85 kB and moved the Markdown stack into the lazy `ChangesPanel` chunk
   (49.0 kB to 212.6 kB), which is already prefetched during idle.
2. `DiffLineRow` and `DiffSplitCell` in `DiffResultView.tsx` were plain
   function components. Every virtualizer update while scrolling re-rendered
   every visible row and re-ran `highlightSyntaxLine` on its text, although
   each row's props (`line`, `highlight`, `t`) are already stable.
3. `open_repository` ran three Git processes: one combined `rev-parse`
   discovery, then `symbolic-ref` and `rev-parse --verify HEAD` to classify
   the head. It runs on project open and on every shared invalidation
   (saving, switching branch, getting changes, ref changes from other tools),
   ahead of the dependent reads.
4. Both languages' dictionaries (311 kB) were composed eagerly into the
   launch graph, although only one is ever shown.
5. `App.tsx` holds 71 `useState` hooks, so any of its state changes
   re-renders the active screen; nobody had measured how often that happens.

The architecture baseline in
[`023-performance-baseline.md`](../../../docs/architecture/023-performance-baseline.md)
records 6 processes for `open_repository`; the code had already reached 3.

# Scope

- Restrict the `vendor` group to an allow-list of eagerly needed libraries.
- Memoize the diff line and split-cell row components.
- Classify the head in `open_repository` with one process instead of two.
- Split every dictionary into one module per language and load only the
  active language before the first render.
- Profile the composition root's commits while idle and per watcher
  invalidation, and act only on what the profile shows.
- Record the measured result here and the launch-weight re-measurement in the
  task 023 baseline.
- Replace task 023's fixed entry-JS budget, which launch had long exceeded,
  with a tracked launch total until 1.0
  ([ADR 0040](../../../docs/adr/0040-track-launch-javascript-as-a-trend.md)), as
  the user decided on 2026-10-28.

# Out of scope

- Moving shell code out of the `index` and `ui` chunks.
- Screen-switch timings, memory and the other task 023 desktop protocols.

# Acceptance criteria

- [x] `pnpm run build` emits no Markdown parser code in the `vendor` chunk and
      `index.html` does not preload the chunk that holds it.
- [x] Diff rows skip re-rendering when their props are unchanged.
- [x] `open_repository` spawns one Git process for a repository on a branch
      or a detached head and no more than before for an unborn branch, and
      reports the same head state and branch name as before for each.
- [x] Launch evaluates one language's dictionary; the first frame never shows
      keys or the other language, and switching language in Settings loads
      the other one and switches without errors.
- [x] The composition root's render breadth is measured and the result
      recorded.
- [x] The task 023 entry-JS budget is replaced by a tracked launch total in
      an ADR.
- [x] `pnpm run check` passes.

# Relevant files

- `vite.config.ts`
- `src/features/changes/DiffResultView.tsx`
- `src-tauri/src/repository.rs`

# Dependencies

None.

# Decisions

- `vendor` is an allow-list (React, React DOM, scheduler, Lucide, Tauri,
  TanStack) rather than a deny-list of lazy libraries: a new dependency used
  only by a lazy screen then stays lazy without anyone remembering to list it.
- `open_repository` adds `--abbrev-ref HEAD --` to the existing combined
  discovery `rev-parse`. `--` keeps a file called `HEAD` in the working tree
  from making the name ambiguous. `--abbrev-ref` shortens a branch the way
  `symbolic-ref --short` and `refname:short` do everywhere else, `heads/main`
  included when a tag shares the name, so the current branch still matches
  the branch inventory; a detached `HEAD` prints `HEAD`. An unborn branch
  fails that read; the fallback asks the four discovery questions in one
  process and, when they succeed, knows `HEAD` is what failed, so it only asks
  `symbolic-ref` for the branch name (three processes, as before). Unparsable
  output keeps the original `symbolic-ref` plus `rev-parse --verify`
  classification.
- Each dictionary is one module per language (`translations.en.ts`,
  `translations.es.ts`), with the interface left in `translations.ts`. The
  bundler cannot split one module across chunks, so a module holding both
  languages would put both in every chunk. Dictionary-only modules with no
  interface (`accounts`, `azure`, `bitbucket`, GitHub and GitLab token/tooling
  copy, hosting servers, repository browser) no longer have a
  `translations.ts`; their Spanish module types itself from the English one.
- The bootstrap awaits `loadTranslations(initialLanguage())` before
  rendering, falls back to English if that fails, and shows the window either
  way. The provider keeps the current language on screen until a newly
  requested dictionary has loaded, so the OS locale answering differently or
  a switch in Settings never paints keys. App update copy keeps its own small
  two-language table; it was not part of the composed dictionary.
- `App.tsx` was not changed: the profile shows one commit in five idle
  seconds and three or four per watcher event, all from real state changes.
  Keeping the working-tree snapshot's identity on an equal status would save
  a commit but would also stop invalidating diffs whose content changed
  without changing the status, so it was rejected.
- The first version stripped `refs/heads/` from `--symbolic-full-name`; the
  final review caught that it would name a branch `main` where the branch
  inventory says `heads/main` (a tag sharing the name), and switched to
  `--abbrev-ref`.
- TanStack Virtual stays in the `vendor` allow-list: a trial build without it
  moved the same 34.7 kB into `FileTreeControls`, which launch also preloads.
- Launch JavaScript size is tracked per release instead of held to task 023's
  fixed budget until 1.0 (ADR 0040); the structural launch rules stay
  failures.

# Implementation notes

- `vite.config.ts`: `vendor` 483.70 kB to 319.85 kB (gzip 145.83 to
  96.74 kB). The Markdown stack moved to the lazy `ChangesPanel` chunk
  (48.97 to 212.60 kB), which screen prefetching already warms during idle.
  `index`, `ui` and `i18n` are unchanged. The frontend feature guide now
  describes the allow-list.
- `DiffResultView.tsx`: `DiffLineRow` and `DiffSplitCell` are `React.memo`.
  Their props were already stable (`rows` and `renderHighlight` are memoized
  and `t` comes from the memoized language context).
- `repository.rs`: `parse_discovery_with_head` (pure, unit-tested) and
  `classify_head_one_question_at_a_time` (the previous logic). Process
  counts: branch or detached head 3 to 1, unborn branch 3 to 3, a folder that
  is not a repository 2 to 3 (an error path).
- `repository_tests.rs`: the detached-head test now opens the repository on
  a branch first, with a `HEAD` file in the working tree and a tag sharing the
  branch's name, and checks the name against `symbolic-ref --short`; then
  detached.
- Final review: a line-multiset comparison of every original dictionary at
  `HEAD` against its split modules found only structural differences
  (`export`, moved type annotations); no copy was lost or changed.
- i18n: 29 namespaces split by a one-off script; `src/i18n/en.ts` and
  `src/i18n/es.ts` compose them (and export the per-namespace objects for the
  key-parity test). `src/i18n/index.tsx` owns `loadTranslations`,
  `initialLanguage` and the provider; `src/bootstrap.tsx` awaits the active
  language. Tests read dictionaries from those modules; the jsdom setup
  preloads both languages because component tests render the provider
  directly. `i18n` 311.10 kB to 4.05 kB eager; `en` 148.86 kB and `es`
  160.18 kB load on demand.
- Launch JavaScript, Spanish: 1,568.09 kB to 1,257.53 kB raw (-19.8 %);
  English: 1,246.20 kB. Details and the render probe are in the task 023
  baseline's new section.
- `ARCHITECTURE.md` and the frontend feature guide describe the per-language
  modules.
- Desktop app not run; the production build was checked in the browser pane.

# Validation

- `pnpm vite build` before and after the `vendor` change: sizes above;
  `grep setextUnderline` finds no micromark code in `vendor`, and
  `dist/index.html` preloads no `ChangesPanel` chunk.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib repository`: 29
  passed.
- `pnpm run check` (2026-10-28): docs, architecture, typecheck, 156 test
  files / 1,753 frontend tests and build passed; `check:rust` failed only
  because a running `tauri dev` locked `target/debug/gitodile.exe`.
- `CARGO_TARGET_DIR=<scratch> pnpm run check:rust`: fmt, Clippy and 646 Rust
  tests (1 ignored) passed.
- i18n split: `tsc -b` and `check:architecture` (708 modules) passed. The first
  full `pnpm run test` timed out two `App` tests at 5 s in an 86 s run; both
  passed alone (23/23) and the next full run passed 156 files / 1,753 tests in
  57 s.
- `vite preview` of the production build in the browser pane: Spanish launch
  loaded only `i18n` and `es`, English launch only `i18n` and `en`; switching
  to Español in Settings loaded `es` and switched with no console errors.
- Final `pnpm run check` (2026-10-28): docs, architecture (708 modules),
  typecheck, 156 files / 1,753 frontend tests and build passed; `check:rust`
  again hit the `tauri dev` lock and passed with a scratch `CARGO_TARGET_DIR`
  (fmt, Clippy, 646 tests, 1 ignored).
- After the final review (`--abbrev-ref`, ADR 0040, task closed):
  `CARGO_TARGET_DIR=<scratch> pnpm run check` passed in one run — docs
  (362 files), architecture (708 modules), typecheck, 156 files / 1,753
  frontend tests, build, fmt, Clippy and 646 Rust tests (1 ignored).
