---
id: 110
title: A bug report carries what the app did, not only what it runs on
status: done
priority: normal
type: feature
areas:
  - frontend
  - desktop
created: 2026-09-03
completed: 2026-09-04
parent:
queue:
---

# Goal

Keep a bounded, redacted, in-memory record of what the application did, and put
it in front of the user in the report flow — a review dialog on **Report an
issue** that shows the report, copies it, and saves it as a file to attach.

# User outcome

Choosing **More actions ⋯ → Report an issue** no longer jumps straight to the
browser. A dialog shows exactly what is about to be shared: the environment
block the report already carries, plus the recent operations and failures of
this session. From there the user copies it, saves it as a file, or continues
to GitHub — having read it first, which today is impossible because the prefill
is assembled into a URL nobody sees.

For a maintainer, "publishing failed" stops arriving as four lines of version
numbers and starts arriving with the operation, the error code, and Git's own
redacted complaint.

# Context

**The application produces no logs at all.** Not a small amount — none.
`Cargo.toml` has no `log`, `tracing` or `tauri-plugin-log` dependency; there is
not one `println!`, `eprintln!` or `dbg!` anywhere in `src-tauri/src`; nothing
writes to `app_log_dir()`; and the two `console.info` calls in
[`screens.tsx`](../../../src/app/screens.tsx) (lines 227 and 264) are switch-timing
instrumentation behind the `MEASURE_SWITCHES` flag, not application logging. The
comment at [`main.rs`](../../../src-tauri/src/main.rs) keeps the console open in
debug builds "so `tauri dev` still shows Rust-side logs" — there are none to
show.

What a report carries today is `formatDiagnostics`
([`systemInfo.ts`](../../../src/app/systemInfo.ts)): app version, platform,
platform version, webview, Git version. Task [108](108-report-an-issue-opens-a-public-tracker.md)
made that prefill real and the public bug form requires the field. So the
environment is answered well and the behavior is not answered at all. A user
who reports a failed publish contributes no operation, no `AppErrorCode`, and
no Git stderr — even though Rust held all three at the moment of failure and
dropped them when the error dialog closed.

[`backlog.md`](../../backlog.md) already carried "privacy-safe application logging
and a user-controlled diagnostic bundle". This promotes it deliberately
narrowed: no file on disk, no retention, no bundle format.

Two constraints shape the design rather than decorate it:

- [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md) — *never log credentials,
  helper output, private keys, or authenticated remote URLs*. That rules out
  free-text logging and forces typed events redacted where they are constructed.
- [`DESIGN.md`](../../../DESIGN.md) § Core screens settles what About is for: the
  facts that differ per install. It is the wrong home for a session log, and
  reaching diagnostics through it would put them two menus away from the button
  whose whole job is to collect them. The report action is the entry point.

# Scope

Rust:

- New `src-tauri/src/diagnostics.rs`: a typed `Event`, a bounded ring buffer in
  Tauri state, and the command that renders the report.
- [`git_command.rs`](../../../src-tauri/src/git_command.rs) records each Git
  invocation: the `OperationKind` vocabulary from
  [`operation.rs`](../../../src-tauri/src/operation.rs), the subcommand, the exit
  status, the duration. **Never the raw argument list** — it carries paths,
  branch names and remotes.
- [`ipc.rs`](../../../src-tauri/src/ipc.rs) records each command crossing to the
  frontend: operation, outcome, and the stable error `code` when it fails. The codes in
  [`error.rs`](../../../src-tauri/src/error.rs) are a stable enum and say most of
  what a maintainer needs on their own.
- Failure excerpts reuse `git::redact_diagnostic`
  ([`git.rs`](../../../src-tauri/src/git.rs)) and
  `operation::truncate_detail` — the path errors already take, not a second one
  written alongside it.
- A command that writes the rendered report to a user-chosen path.

Frontend:

- Fold the former `IssueReportErrorDialog.tsx` into
  [`IssueReportDialog.tsx`](../../../src/app/IssueReportDialog.tsx)
  into one `IssueReportDialog` with states `review → opening → failed`. This
  replaces an overlay rather than adding one.
- The review state shows the report read-only and scrollable, with **Continue
  to GitHub** primary, **Copy** and **Save report…** secondary, and one line
  stating that GitHub cannot receive the file automatically — the user attaches
  it.
- [`useIssueReport.ts`](../../../src/app/useIssueReport.ts) gains the review step
  ahead of `launch`; [`issueReportAdapter.ts`](../../../src/app/issueReportAdapter.ts)
  gains `save`.
- [`translations.ts`](../../../src/app/translations.ts) in both languages;
  `issueReportFlow.test.tsx` and `issueReport.test.ts` extended.

Capabilities:

- [`capabilities/default.json`](../../../src-tauri/capabilities/default.json) lists
  `dialog:allow-open` but not `dialog:allow-save`, so the save dialog is refused
  today. Add the one permission, nothing broader.

# Out of scope

- **A rotating log file, or any persistence between sessions.** The buffer lives
  in memory and becomes a file only when the user presses Save. That covers
  every case except a crash that takes the process down before the user can
  report it — real, but not yet observed, and a retention policy is a durable
  decision worth taking against evidence rather than in advance.
- **Any transmission.** Nothing leaves the machine without a press, and the file
  is attached by hand. This is not telemetry and must not become it
  ([`CONTRIBUTING.md`](../../../CONTRIBUTING.md)).
- **A Settings switch to disable logging.** Nothing is written to disk and
  nothing is sent, so there is nothing to opt out of. It becomes necessary the
  day the buffer gains a file.
- **Frontend runtime error capture** (`window.onerror`,
  `unhandledrejection`). Worth having and a natural follow-up, but it is a
  second source with its own redaction question, and mixing it in here makes
  the privacy review of the first source harder, not easier.
- **Changing the public forms in `martinezelx/gitodile-feedback`.** The required
  `diagnostics` textarea already exists; adding "attach the saved report"
  guidance is a change in that repository, gated by `check:feedback`.

# Acceptance criteria

- [x] **Report an issue** opens the review dialog; the browser opens only from
      **Continue to GitHub**.
- [x] The dialog shows the environment block and the session events, read-only
      and scrollable, and copying puts the same text on the clipboard.
- [x] **Save report…** writes a plain-text file the user can open and read
      before attaching, and works on Windows, macOS and Linux.
- [x] Failure to open the browser is a state of the same dialog, not a second
      overlay; retry, copy link and a selectable address all still work.
- [x] The buffer is bounded and a test asserts the cap.
- [x] A test asserts an authenticated remote URL, credentials, and raw Git
      arguments never reach the buffer or the rendered report.
- [x] The dialog follows `DESIGN.md` § Core screens for message dialogs, uses
      `useModalFocus`, and both languages are complete.
- [x] The report reads correctly when there are no events yet — the first thing
      a user does may be report a bug.
- [x] `pnpm run check` passes.

# Relevant files

- `src-tauri/src/diagnostics.rs` (new)
- [`src-tauri/src/git_command.rs`](../../../src-tauri/src/git_command.rs)
- [`src-tauri/src/ipc.rs`](../../../src-tauri/src/ipc.rs)
- [`src-tauri/src/git.rs`](../../../src-tauri/src/git.rs)
- [`src-tauri/src/operation.rs`](../../../src-tauri/src/operation.rs)
- [`src-tauri/src/lib.rs`](../../../src-tauri/src/lib.rs)
- [`src-tauri/capabilities/default.json`](../../../src-tauri/capabilities/default.json)
- [`src/app/IssueReportDialog.tsx`](../../../src/app/IssueReportDialog.tsx)
- [`src/app/useIssueReport.ts`](../../../src/app/useIssueReport.ts)
- [`src/app/issueReportAdapter.ts`](../../../src/app/issueReportAdapter.ts)
- [`src/app/issueReport.ts`](../../../src/app/issueReport.ts)
- [`src/app/systemInfo.ts`](../../../src/app/systemInfo.ts)
- [`src/app/AppOverlays.tsx`](../../../src/app/AppOverlays.tsx)
- [`src/app/translations.ts`](../../../src/app/translations.ts)
- [`AGENTS.md`](../../../AGENTS.md)
- [`DESIGN.md`](../../../DESIGN.md)
- [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md)

# Dependencies

Task [108](108-report-an-issue-opens-a-public-tracker.md), done: the
tracker, the prefill contract in `issueReportContract.json`, the opener scope
and the failure dialog this task extends.

# Decisions

- **The report flow owns this, not About.** The user's call, and the right one:
  About answers "what am I running", the report button exists to collect
  evidence, and a review step there is also more honest than today's behavior —
  the current prefill is assembled and handed to the browser without the user
  ever seeing it.
- **In memory, materialized on demand.** No file exists until the user asks for
  one, which removes retention, deletion, stale-file and opt-out questions
  wholesale in exchange for losing the crash case.
- **Own module rather than `tauri-plugin-log`.** The plugin is the faster route
  and is rejected on two specific grounds: it adds a dependency to a binary
  where task [018](../0.1.0/018-startup-launch-performance.md) traded
  `opt-level = "s"`, `lto` and `strip` for launch time, and its webview console
  capture writes whatever it is handed without passing through
  `redact_diagnostic` — the exact rule `docs/ARCHITECTURE.md` states. An owned
  module keeps one redaction path instead of two.
- **Copy is the primary route for a short report; the file is for a long one.**
  Pasting into the required `diagnostics` textarea is one keystroke, and GitHub
  cannot preattach a file from a URL under any query parameter.
- **One dialog state machine, not separate review and error dialogs.** Review,
  opening and failure stay in one overlay; preparation is its transient loading
  state.
- **Settled: what an `Event` may hold.** No
  paths, no branch names, no file names, no diff content, and no raw arguments.
  Branch names in particular are tempting and are repository content; if any of
  them turn out to be necessary to diagnose real reports, that is a deliberate
  amendment recorded here, not a quiet widening.
- **Settled: the review dialog is not skipped on repeat use.** It should
  not be — it is the consent step, and it is cheap.
- **The review shows the report verbatim, not a rendering of it.** An earlier
  pass parsed the environment block back out and redrew it as labelled chips.
  It read tidier and it undermined the step: the user was shown a depiction of
  the payload while a different string was published. One monospaced viewer
  holding the exact bytes is what a consent step owes the person giving it, and
  it removed the parser, its five translation keys and its own drift risk.
- **Timings are clock offsets against a UTC anchor.** Raw `+2065 ms` is exact
  and unreadable, and relative to a start the report never named — nothing in
  it could be lined up against when the user says the failure happened. The
  header now carries `Started:` as ISO 8601 in UTC and events carry
  `+MM:SS.mmm`. UTC rather than local time deliberately: an issue is public and
  a local offset is a coarse location.
- **The address carries the versions; everything else is pasted or attached.**
  A session's activity is thousands of characters, and 121 events already
  encode to a 12,000-character address that GitHub answers with 414 rather
  than a form — so the prefill was silently broken for exactly the long
  sessions worth reporting. Trimming to fit was tried and dropped: it bought a
  partial log at the cost of a second state to explain, when the report the
  user has already reviewed reaches the issue whole through Copy or the saved
  file. The address now seeds the required field with the version block alone,
  and the review says so rather than implying the whole report is published.
- **The saved file is named for the build and the moment, never the user.** The
  file is attached by hand to a public issue, so its name is published with it.
  A system user name there would be personal data leaving the machine under a
  rule `docs/ARCHITECTURE.md` states plainly; the UTC stamp already makes every
  save distinct, and the version is what actually helps a maintainer holding
  several attachments at once.

# Implementation notes

- Added a Tauri-managed, 200-entry in-memory ring buffer with typed Git and IPC
  command events. Git events store only the checked operation class/name, an
  allowlisted subcommand, exit status, duration and a redacted failure excerpt;
  IPC adapters record every safe command outcome, the stable error code and the
  same bounded detail. Reports expose their UTC start, readable session
  duration and retained/omitted event counts so the bounded history cannot be
  mistaken for a complete one.
- Rendered events in fixed columns sized from the events themselves, with
  `+MM:SS.mmm` offsets, adaptive Git durations (`121 ms`, `1.4 s`, `3 min 4 s`)
  and failure excerpts indented under the event they belong to. ISO 8601 in UTC
  is computed in-module rather than adding a date dependency to a binary that
  trades size for launch time.
- Extended the shared diagnostic redactor for assignment-style credentials,
  authorization values and private-key material. Raw Git arguments never enter
  an event.
- Added commands to render the current report snapshot and save that exact
  snapshot as plain text. The native save dialog received only
  `dialog:allow-save`.
- Replaced the browser-error-only overlay with one eager dialog covering
  preparation, review, opening and failure. Its review shows the report
  verbatim in a single monospaced viewer that scrolls in both directions rather
  than wrapping, so the aligned columns survive, and keeps file-attachment
  guidance outside that viewer. It preserves one exact report and uses the
  shared top-right close control. Copy, save, manual-link recovery, retry,
  stale-attempt protection, focus management and English/Spanish copy are
  covered by the flow tests.
- Named the saved file `gitodile-report-<version>-<UTC stamp>.txt`, so repeated
  saves never collide and an attachment says which build produced it.
- Reduced the prefill to the environment lines, without the report's own
  headings, and reworded the review so it states what is actually filled in.
  Named the action `Open issue` / `Reportar en GitHub`: `Continue to GitHub`
  described the navigation rather than what the press is for. Spanish settles
  on one word for the concept — `problema`, the plain one the menu already
  used, not the helpdesk register of `incidencia` — and names the destination
  instead of the artifact where the possessive turned clumsy (`adjúntalo en
  GitHub`, never `adjúntalo a tu incidencia`). An architecture
  test pins the two headings the prefill splits on to the Rust that writes
  them — renamed on one side alone, the prefill silently reverts to sending the
  whole report.
- Bounded the environment the webview hands `render_diagnostic_report`, on a
  character boundary so multi-byte input cannot panic the slice.
- Turned the file-attachment guidance into an info chip that hugs its own text.
  A rule across the dialog read as another section beginning, when the line is
  an aside to the report above it.
- Updated the IPC contract, architecture guide and README to make the session
  lifetime, privacy boundary and user-controlled materialization durable.

# Validation

- `pnpm run check` — passed: documentation over 175 Markdown files and 140 task
  IDs; frontend architecture and TypeScript; 680 Vitest tests; production Vite
  build; Rust formatting and Clippy with warnings denied; 343 Rust tests.
- `pnpm exec vitest run src/app/App.test.tsx src/architecture/ipcContract.test.ts src/features/initialize-project/InitializeProjectDialog.test.tsx --passWithNoTests`
  — passed, 37 tests.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-features every_registered_command_has_one_complete_policy`
  and `cargo test --manifest-path src-tauri/Cargo.toml --all-features checked_contract_matches_registered_adapters_arguments_and_errors`
  — passed after adding the two commands to the checked inventory and contract.
