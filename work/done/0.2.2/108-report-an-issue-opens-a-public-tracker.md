---
id: 108
title: Report an issue opens a real, prefilled public tracker
status: done
priority: normal
type: feature
areas:
  - frontend
  - desktop
  - documentation
created: 2026-09-03
completed: 2026-09-03
parent:
queue:
---

# Goal

Turn the disabled "Report an issue" placeholder into a working path from the
menu to a real issue form, and give that form somewhere to land: a public
repository, since GitOdile's own source is private and its issues are therefore
invisible to every user the button exists for.

# User outcome

Choosing **More actions ⋯ → Report an issue** opens the default browser on a
bug form in the app's language, with the available build, operating-system,
WebView and Git versions. GitHub requires an account and may ask the user to
sign in. The user reviews the public report before submitting it; opening the
form does not create an issue. Unavailable diagnostics are omitted. A failed
browser launch offers retry, copying the link and a selectable address if the
clipboard also fails.

# Context

The trigger was a question rather than a plan: with the source repository
private, can users open issues at all? They cannot. GitHub ties issue
visibility to repository visibility, there is no setting that separates them,
and a link to a private repository's issues returns 404 rather than a
permission error — GitHub hides the repository's existence entirely.

The menu entry was `disabled` and marked "Coming soon", which was honest under
`DESIGN.md` § "A control that does nothing yet must not look fully
interactive". Removing that marking without moving the destination would have
turned an honest placeholder into a link that fails silently.

The established answer to this shape of problem is a second, public repository
holding nothing but issues — the pattern behind `sublimehq/sublime_text`,
`docker/for-win`, `warpdotdev/Warp`, `getcursor/cursor`, and
`postmanlabs/postman-app-support`.

# Decisions

- **The tracker is its own public repository**, `martinezelx/gitodile-feedback`.
  `gitodile-feedback` rather than `gitodile` so the plain name stays available
  if the application source is ever opened.
- **Nothing in the app may link back to the private repository.** Those links
  are 404s for exactly the audience the button serves, so `branding.test.ts`
  asserts the absence rather than trusting the convention.
- **The prefill reuses `formatDiagnostics`**, the same function behind About's
  "Copy system info". One format means a hand-pasted report and a generated one
  read alike, and the block gains a maintainer nothing to learn twice.
- **Field ids are the contract.** GitHub prefills an issue-form field from a
  query parameter named after its id and silently ignores one that matches
  nothing, so a rename on either side degrades to an empty field. The coupling
  lives in `issueReportContract.json`, shared by the app and publication check.
- **The opener scope names two destinations, not the open web.**
  `opener:allow-open-url` enables the command while carrying no scope of its
  own — the permission was already listed, so the command was enabled and every
  URL refused, and `void openUrl(...)` discarded the rejection. The fix lists
  the tracker and Git's download pages explicitly rather than adopting
  `opener:allow-default-urls`, which would open all of `http`, `https`,
  `mailto:` and `tel:` for two known links.
- **Explain the external destination.** The visible label is the accessible
  name. Its accessible description explains that GitHub needs an account,
  reports are public and available system versions are included. There is no
  hover tooltip, consistent with the other working help actions in the menu.
- **Reporting stays in More actions only.** The release notes remain focused
  on changes in the installed build; the menu provides the occasional support
  action without adding another persistent control.
- **Handle shell failures.** A typed app adapter owns browser/clipboard access;
  the attempt hook ignores late results after dismissal. The eager error
  overlay shares the existing message-dialog styles and modal focus behavior.
- **`readGitVersion` moved into the settings domain.** About and the titlebar
  menu both need the "did Git actually answer?" read, and only the `available`
  state means it did.

# Scope

- `martinezelx/gitodile-feedback`: English/Spanish bug and feature forms, an
  enabled private vulnerability channel, blank issues disabled, and bilingual
  public/account/privacy guidance. Wiki and project boards are disabled.
- `src/app/issueReport.ts`: the tracker URL, the prefilled report URL, and the
  hook that assembles it.
- `src/app/TitlebarMenu.tsx`: a working action, external-destination description,
  and a focusable guard against repeated clicks while opening.
- `src/app/useIssueReport.ts`, `issueReportAdapter.ts` and
  `IssueReportErrorDialog.tsx`: browser and clipboard failure recovery.
- `src/app/App.tsx`, `src/app/AppOverlays.tsx`,
  `src/features/settings/domain.ts`: `readGitVersion` and its two callers.
- `src/app/translations.ts`: the "Coming soon" wording and its now-dead key, in
  both languages.
- `src-tauri/capabilities/default.json`: the missing opener URL scope.
- `src/architecture/branding.test.ts`, `src/app/issueReport.test.ts`: the tests.
- `scripts/check-public-feedback.mjs`: a read-only publication check of live
  settings, required labels, localized forms and the diagnostics field; CI runs
  it separately so the local aggregate gate remains independent of the network.

# Audit follow-up

The audit found that private vulnerability reporting was disabled despite its
advertised links, browser rejections were unhandled, and the outcome wrongly
promised no sign-in. These are corrected, including keyboard/click integration,
clipboard failure recovery, stale-attempt tests and stricter capability guards.

At the owner's request, the public repository's two existing commits were
rewritten only to remove AI co-author trailers. Original trees, author identities
and dates were preserved and verified. A complete local recovery bundle was
retained before an exact-expected-head lease push. The updated public history
attributes all commits to `martinezelx`; tracker instructions prohibit future
AI attribution trailers. Settings and the live form contract were verified at
public commit `f8420b8e402558a7b04e19cf807608100806d1a0`.

On follow-up, GitHub's homepage still displayed the old co-author while the
contributors API returned only `martinezelx`. GitHub documents an approximately
[24-hour refresh delay after history changes](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-a-projects-contributors#contributor-data-is-stale-after-history-changes), with Support as the next step if
the display remains stale. Contributor-cache refresh is separate from removal
of the original commit objects described below.

GitHub still serves the old commits when addressed by their original SHA even
though no current branch references them. This cleanup removes the attribution
from active history, not from server-side retained objects or existing clones.

# Out of scope

- **Publishing releases from the private repository into the public one.** It is
  the piece that would make version numbers and release notes publicly citable,
  and it needs a personal access token with `contents:write` on the tracker held
  as a secret in the private repository. Creating that token is the maintainer's
  to do.
- Opening the application source, and any use of the tracker for discussions,
  documentation, or support beyond issues.

# Original implementation verification

- New tests tie the capability scope to the URL the app builds — two files
  nothing else connects, whose failure mode is a click that does nothing at all.
  Reverting the capability to the bare `"opener:allow-open-url"` string was run
  as a mutation check and fails all three, naming the cause.
- `issueReport.test.ts` covers the destination, the template parameter, the
  diagnostics block, the browser-run case where neither the OS bridge nor Git
  answered, and the absence of raw newlines in the query string.
- The rendered form and its prefill were confirmed against the live tracker:
  the five diagnostic lines arrive intact in the System information field and
  the `bug` label is applied by the form.

Commands run:

- `pnpm run check` — exit 0. The aggregate gate: documentation, frontend
  architecture, TypeScript, frontend tests and build, and the Rust gates
  (`cargo fmt --check`, Clippy with `-D warnings`, `cargo test`). Rust reported
  321 passed, 0 failed.
- `npx vitest run` — 71 files, 643 tests passed, run directly for the frontend
  totals; the aggregate above re-ran the same suite as one of its stages.
- `cargo check --manifest-path src-tauri/Cargo.toml` — exit 0, run on its own
  while iterating so Tauri's build script would validate the edited capability
  against the generated ACL schema.

# Audit follow-up verification

- `pnpm run check` passed for the final menu-only implementation, including
  documentation, frontend architecture, TypeScript, production build, Rust
  formatting, Clippy and 321 Rust tests.
- Frontend: 73 files, 655 tests passed, including keyboard launch, composition
  root wiring, retry, clipboard errors, dismissal races and publication-check
  fixtures that rename the diagnostics field or disable private reporting.
  The final frontend gate also verifies that the command-palette shortcut cannot
  place another focus trap over the issue-report error dialog.
- `pnpm run check:feedback` passed against the published tracker; anonymous API
  access also confirmed private vulnerability reporting is enabled.
- Browser inspection of the local app verified the Spanish failure dialog,
  selected template, copied-link feedback, retry and Escape focus restoration.
  This browser has no native Tauri bridge; it exercises the launch-failure path,
  not native browser launching on Windows/macOS/Linux.
- A local form check passed before publication, and the live check passed
  afterwards. No test issue or vulnerability report was submitted.
