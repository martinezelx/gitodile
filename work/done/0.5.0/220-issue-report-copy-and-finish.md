---
id: 220
title: Issue report copies, opens and guides the paste
status: done
priority: normal
type: feature
areas:
  - frontend
created: 2026-11-03
completed: 2026-11-03
parent:
queue:
---

# Goal

Make the issue report deliver its session activity to the GitHub issue by
default instead of relying on an optional copy the reader may never notice.

# User outcome

One action copies the reviewed report and opens the prefilled GitHub form; a
short follow-up step says what is left (paste it and submit) and lets the
reader copy it again. The form itself carries a reminder where the paste goes.

# Context

The review dialog showed the report with three equal actions (`Copy`,
`Save report…`, `Open issue`) and said only in its subtitle that GitHub
receives the versions alone. Opening the issue directly lost the activity.

Other clients were compared on 2026-11-03. VS Code's reporter copies a body
too long for the address to the clipboard and asks for a paste in GitHub; a
number of its issues were closed as invalid because nothing was pasted. Zed and
GitHub Desktop prefill or leave the versions only; Obsidian and GitKraken rely
on a manual copy or attachment. None follows up after the browser opens.

The public bug forms (`bug.yml`, `bug-es.yml` in `martinezelx/gitodile`) take
the `[Bug]: ` title prefix and render the required `diagnostics` field
("System information" / "Información del sistema") as text, so an HTML comment
there would be shown literally rather than hidden.

# Scope

- Review step: title "Report an issue", a subtitle that names the public
  GitHub issue and the account it needs, `DialogFacts` for what the report
  holds and what stays safe, an optional title field, one checkbox for this
  session's activity, the exact report text always visible, and actions
  `Cancel`, `Save report…`, `Copy and open GitHub`.
- The primary copies the report shown and then opens the form; a failed copy
  does not block the form.
- A `s` "Finish on GitHub" step after the browser opens, with the copy and
  open outcomes, the paste still to do, `Copy again` and `Done`.
- The prefilled `diagnostics` field ends with a line asking for the paste
  when the activity is included; the optional title travels as
  `[Bug]: <title>`.
- Browser failure keeps the existing copy-link recovery.

# Out of scope

- Changing the public issue forms or the feedback contract check.
- Changing what Rust records or redacts in the session activity.
- Sending reports without GitHub.

# Acceptance criteria

- [x] The primary action copies exactly the text shown, then opens GitHub.
- [x] Without the activity, the shown, copied and saved text is the environment
      block alone and the address carries no paste reminder.
- [x] The address stays short whatever the session did, with or without a title.
- [x] After opening, the finish step offers `Copy again` and `Done`; a failed
      copy is said there, not hidden.
- [x] Browser failure, retry and manual-link copy still work.
- [x] English and Spanish copy; checked running in light and dark themes.
- [x] `pnpm run check` passes.

# Relevant files

- `src/app/IssueReportDialog.tsx`
- `src/app/useIssueReport.ts`
- `src/app/issueReport.ts`
- `src/app/issueReportContract.json`
- `src/app/translations*.ts`
- `DESIGN.md` § Dialogs
- `docs/ARCHITECTURE.md` § Issue reporting

# Dependencies

None.

# Decisions

- The report text stays visible, not folded behind a disclosure: the review is
  the consent step, and it must show the payload itself.
- One activity checkbox rather than one per section: the versions are what the
  required field needs, so excluding them has no use.
- The paste reminder is plain text in `diagnostics`, because that field renders
  as text and would show a comment literally. Left there, it tells the
  maintainer the activity was not included.
- Two facts of one line each, in both languages: what the report holds and
  what stays safe. That Git's error excerpts may name a file or a remote is
  visible in the exact text and stated in `docs/PRIVACY.md`.
- The finish step's pending paste carries a paste glyph, not a step number.

# Implementation notes

- `issueReport.ts`: `reportWithoutActivity`, and `buildIssueReportUrl` options
  for the title (behind `bugTitlePrefix` in `issueReportContract.json`) and the
  paste reminder.
- `useIssueReport.ts`: activity choice, title, copy-before-open, and the
  `finish` phase; without the activity the flow copies nothing and ends when
  the form opens.
- `IssueReportDialog.tsx` and `app-shell.css`: review with two facts, the title
  field and the activity checkbox in the report frame's caption; the `s`
  finish step with three one-line steps and glyphs only.
- `DESIGN.md` § Dialogs (a step that is the reader's to do),
  `docs/ARCHITECTURE.md` § Issue reporting, and `docs/PRIVACY.md`, whose claim
  that remote URLs were excluded did not match the kept, redacted Git excerpts.
- Review fixes: a retry after the browser failed copies the report again,
  since the failure screen's `Copy link` replaces it on the clipboard; each new
  step (finish, failure) moves focus to its own primary, because the modal only
  places focus when it opens; Enter in the title field continues.

# Validation

- 2026-11-03, `pnpm run check` (with a scratch `CARGO_TARGET_DIR`, as
  `tauri dev` held the target): passed; 1,938 frontend tests, 694 Rust tests.
- Review, without-activity, finish and failed-copy states checked in the
  browser harness, English and Spanish, light and dark: each fact and each
  finish step on one line.
- Tried by the maintainer in the running app on 2026-11-03 and approved.
