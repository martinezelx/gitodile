---
id: 059
title: Explain line endings instead of leaving them to bite
status: done
priority: normal
type: feature
areas:
  - frontend
  - rust
  - ux
created: 2026-08-15
completed: 2026-08-17
---

# Goal

Show what Git is doing to line endings, in plain language, and let it be
changed from Settings without reading `git config` documentation.

# User outcome

A file that shows as changed when nothing was typed in it gets an explanation
instead of a mystery. Someone on Windows working with teammates on macOS can
set this once, deliberately, rather than discovering it through a diff that
claims every line changed.

# Context

This is the clearest case in the app for GitOdile's whole thesis: a real Git
concept that is genuinely confusing, where the fix is one setting and the cost
of not knowing is a diff that looks catastrophic and is not.

`work/backlog.md` already carries "Detect changes caused only by line-ending
normalization" under Repository experience. That detection and this setting are
the same problem seen from two ends — the diagnosis and the control.

Nothing in `src-tauri` reads or writes `core.autocrlf` today; a grep over
`src-tauri/src` finds no mention of it.

# Scope

- Read and write `core.autocrlf` (and report `core.eol` when it is set)
  through the existing `SettingsPort`, which already owns global Git config
  for identity and is the natural home.
- A Settings group in the Git section offering the three meaningful choices,
  each labelled by what it does rather than by its config value, with the
  platform-appropriate one marked as recommended.
- Say which setting is in effect and where it came from — global config, a
  repository `.gitattributes`, or unset.

# Out of scope

- `.gitattributes` authoring. Reporting that a repository has one which
  overrides the global setting is in scope; editing it is not.
- The backlog's normalization *detection* in the Changes screen. This task
  gives that work a place to link to, and should not absorb it.
- Any automatic renormalization of an existing working tree.

# Acceptance criteria

- [x] The current effective value is shown, including "not set".
- [x] Changing it writes the global Git config and the new value survives a
      restart of the app.
- [x] A repository whose `.gitattributes` overrides the global setting says so
      rather than reporting a value that is not in effect.
- [x] Each option is described in a sentence that never requires the reader to
      know what `autocrlf` means.
- [x] Rust tests cover reading an unset value, reading each set value, and
      writing.
- [x] Full `pnpm run check` passes.

# Relevant files

- `src-tauri/src/tooling.rs` (system-Git settings live here per `AGENTS.md`)
- `src/features/settings/port.ts`, `tauriAdapter.ts`, `SettingsPanel.tsx`
- `src/features/settings/translations.ts`

# Dependencies

None. Related to the backlog item on normalization detection, which stays in
the backlog.

# Decisions

**The Settings port stops being purely global, for this read only.** Its comment
said none of its calls take a project path, because they inspect the machine
rather than a repository. The `.gitattributes` criterion cannot be met that way:
a project's own config or attributes override the global value, and showing the
global one where it does not apply is a confident lie. So `readLineEndings`
takes the open project (path + session epoch, validated in `ipc.rs` like any
repository read) and is documented in `port.ts` as the deliberate exception.
Writing stays global — there is no per-project write in scope.

**The effective value is resolved by Git, not by GitOdile.** `git config --get`
run inside the project already resolves local over global, so the code does not
reimplement precedence. `source` is derived by comparing that answer with the
global one: equal means global, different means the project decides.

**`.gitattributes` detection is presence-and-relevance, not evaluation.** Git
offers no "does any rule exist" query, and `check-attr` answers per file. The
repository-root `.gitattributes` and `.git/info/attributes` are read and counted
only when a line actually carries a `text`, `-text`, `text=` or `eol=` attribute;
a file that only marks binaries or diff drivers does not trigger the notice. The
notice says those rules win for the files they cover, which is true without
claiming which files those are.

**"Not set" is reported, never offered.** Writing it back would be a config
deletion rather than a setting, so `LINE_ENDING_CHOICES` holds the three real
options and `not_set` exists only as a state to report.

**The platform recommendation is read through the port.** A feature may not
import `src/app/systemInfo`, so `readPlatform()` joins the port beside
`openGuidance` as an OS-boundary call, and answers `null` (recommending nothing)
outside the desktop shell instead of throwing.

# Implementation notes

- `src-tauri/src/tooling.rs`: `GitLineEndings` (mode/source/eol/projectAttributes)
  plus `get_line_endings` and `set_line_endings`. The parsing, resolution and
  attribute rules are pure functions so they are tested without processes.
  `get_line_endings` uses `authorize_repository` when a project is passed and
  degrades to the global answer if that repository cannot be authorized, so a
  Settings panel never fails outright over a project it could not read.
- Registration: `application.rs` (policy + registry name), `ipc.rs` adapters,
  `lib.rs` handlers, `docs/architecture/025-ipc-contract.json`, and the two
  contract tests that pin the command list (`ipc.rs`, `src/ipcContract.test.ts`).
- Frontend: `domain.ts` types and `recommendedLineEndingChoice`, `port.ts` +
  `tauriAdapter.ts`, a stacked option list in `SettingsPanel.tsx` with its own
  block in `settings.css`, and English/Spanish copy in `translations.ts`.
  `main.tsx` passes the active session through `AppOverlays`.
- The option list stacks rather than using a segmented control: each choice is a
  sentence about what happens to files, which a segmented control cannot hold.
- Not verified in the running desktop app. A plain `pnpm dev` browser session
  has no Tauri bridge, so the group renders its loading state there; the visual
  result is worth a look in `pnpm tauri dev` before this is considered polished.
- Follow-up unchanged: the backlog's normalization *detection* in the Changes
  screen now has this group to link to.

**Scope change after completion, on the user's QA pass.** The group shipped
inside the Git section as scoped above, which pushed that section to 827px in a
496px dialog — 431px of scrolling. Line endings now has its own rail entry
(`SETTINGS_SECTIONS` gains `line-endings`, with no `h3` inside it because the
rail label already names it) and the dialog went from 820x496 to 880x640.
Measured with the shipped stylesheet: the five sections need
339 / 379 / 401 / 397 / 434px against 558px of content area, so nothing
scrolls; 640 rather than ~540 because the Spanish line-endings section with a
project override, its `.gitattributes` warning and both notices showing reaches
492px.

**Second QA pass, same session.** The block under the options was four things:
a label, the chosen option's name repeated verbatim from the highlighted card,
a neutral pill and a warning pill of a different width — and the neutral one
("applies to every project") read as a contradiction of the warning beside it.
It is now one quiet caption for provenance and, only when there is something to
report, a single full-width warning block holding both the `.gitattributes`
override and `core.eol`. The repeated value is gone: the selected card already
says what is in effect, and `lineEndingsInEffectLabel`/`lineEndingsNotSet` went
with it. The caveat block reuses the existing warning tokens: 7.5:1 contrast in
dark, 5.1:1 in light, measured against the composited tint.

# Validation

```
pnpm run check
```

Passed on 2026-08-17 (Windows 11): docs, frontend architecture, TypeScript,
344 frontend tests over 41 files, production build, `cargo fmt --check`, Clippy
with `-D warnings`, and 244 Rust tests. The first run failed on `cargo fmt`
formatting only; `cargo fmt` was run and the aggregate command then passed.

New tests:

- Rust (`tooling.rs`): every spelling Git accepts for `core.autocrlf`; where the
  effective value came from; which `.gitattributes` lines count; a round trip
  through a temporary `GIT_CONFIG_GLOBAL` covering unset and all three writes;
  rejection of an unknown option; and a temporary repository whose local config
  and `.gitattributes` are reported over the global value.
- Frontend (`SettingsPanel.test.tsx`): reports "nothing chosen" and writes the
  picked choice through the port, reading back afterwards; marks the
  platform-appropriate recommendation; reports a project override, its
  attributes notice and `core.eol`; and renders a failed write as a failure.
