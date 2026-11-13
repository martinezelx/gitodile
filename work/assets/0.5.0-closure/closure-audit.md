# 0.5.0 closure audit — 2026-10-30/31

Evidence for the existing `release/0.5.0`, starting at `73714cc`. No product
commit, push, new branch/worktree, release preparation or publication was
performed. This record supplements, rather than replaces,
[037-7](../../done/0.5.0/037-7-conflict-workflow-audit.md) and
[065-4-5](../../done/0.5.0/065-4-5-integration-audit.md).

## What prevented closure and the accepted disposition

| Epic and original unchecked criterion | Implementation / existing evidence | Result of this pass | Remaining condition |
| --- | --- | --- | --- |
| [037](../../done/0.5.0/037-guided-conflict-resolution.md): keyboard, focus, announcements, colour independence, themes, motion, text scaling, EN/ES | All implementation slices and the Windows 037-7 audit are done | **Windows functional audit passed**, with the two fixes below; real NVDA output, native zoom and active forced colours now have evidence | No remaining implementation identified in this criterion; this is a bounded functional audit, not a claim about every assistive technology |
| 037: Windows desktop and available macOS/Linux with concrete risks | Windows end-to-end evidence in 037-7 and 065-4-5; the formerly contract-only app-started entry is exercised by 065-4-5 | Windows supplemented here; no other OS run | Formally deferred under accepted ADR 0042: Linux to 065-8, macOS to 065-10; original criterion stays unchecked |
| [037-6](../../done/0.5.0/037-6-resolve-files.md): cross-platform links, casing, modes, paths, encodings, submodules and unrelated-byte preservation | Three children are done; [class/action matrix](../../done/0.5.0/037-6-3-editor-and-hard-classes.md), Rust fixtures and Windows audits exist | No missing resolution implementation identified; Windows preservation rechecked below | POSIX links/executable modes, case-sensitive/normalizing filesystems, native open/refusal behavior and other WebViews need representative macOS/Linux runs |
| 037-6: keyboard, focus, screen reader, themes/locales, narrow layout, Rust/frontend checks | Keyboard/themes/locales and narrow layout already covered by 037-7; automated regressions recorded by 065-4-5 | Windows screen-reader integration and short/zoomed viewport audited here; aggregate result below | Windows criterion can be checked using the combined evidence; it does not qualify VoiceOver/Orca |
| [065-4](../../done/0.5.0/065-4-integrate-branches.md): full repository/frontend/accessibility/cross-platform tests, IPC/docs and aggregate gate | All five children done, final reviewed audit at `73714cc`; [criterion matrix](../065-4-5/integration-audit.md) | Windows Bring/Get handoff, Stop, NVDA, forced colours, semantics and regression checks supplemented here | Full cross-platform qualification is still unrun; no current CI result is inferred from the local gate |

The remaining obligation is qualification, not a missing merge strategy,
resolver, editor or recovery implementation. On 2026-10-31 the maintainer
accepted ADR 0042 and implementation-phase closure: the three epics move to
`work/done/` with that completion date, while their unexecuted platform criteria
stay unchecked and explicitly deferred. Their owners are 065-8 (Linux) and
065-10 (macOS). No work on `0.6.0` is started and no release is authorized.

## ADR 0006 and the accepted disposition

[ADR 0006](../../../docs/adr/0006-defer-macos-and-linux-runtime-validation.md)
already defers macOS/Linux task-023 runtime, memory, WebView, accessibility,
credentials and filesystem qualification until release hardening. It allowed
epic 038 to close with an owned limitation. It does **not** say that an
unexecuted feature acceptance criterion passed, or explicitly dispose of the
later 037/037-6/065-4 checklists. An explicit phase-closure decision was needed
to retain these criteria without silently changing their meaning.

[ADR 0011](../../../docs/adr/0011-defer-windows-authenticode-and-macos-delivery-until-after-1.0.md)
additionally keeps macOS delivery unsupported through `1.0.0`. The maintainer
accepted [ADR 0042](../../../docs/adr/0042-propose-platform-qualification-carryover-for-050.md)
on 2026-10-31:
carry the exact remaining Linux matrix to
[065-8](../../0.7.0/065-8-release-hardening.md), and macOS to
[065-10](../../after-1.0/065-10-qualify-macos-updater-delivery.md), retaining
the original unchecked criteria as explicitly deferred evidence obligations.
That acceptance closes the implementation phase of these epics. Both receiving
tasks now retain an explicit unchecked acceptance criterion linking this matrix
and the original epics. Their status and queue have not been advanced. This
is not a passed external test or authorization to publish a release.

The acceptance follow-up moved all three epics to `work/done/`, set
`status: done` / `completed: 2026-10-31`, repaired incoming and outgoing links,
and left only the version README in `work/0.5.0`. Both receiving tasks keep
their previous status/queue; their added qualification criteria are unchecked.
`pnpm run check:docs` passed after the move. No production code changed in
this follow-up; the aggregate/source-fingerprint evidence below still applies.

## Environment and isolation

- Windows 11 Home `10.0.26300`, Git `2.55.0.windows.3`, Tauri dev with
  WebView2 `156.0.4314.50`; loopback CDP `9223` and Windows Computer Use/UIA.
  No separate browser substituted for the app.
- Disposable fixtures under `%TEMP%/gitodile-050-closure-20261030`: `resolve`,
  `bring`, `get`, a local bare remote, and a real 600-file conflicted merge.
  Fixture commits are setup inside those disposable repositories, not commits
  of the product. [Initial heads](baseline.json) and independent Git results
  are retained.
- Identifier `app.gitodile.closure050audit`, dedicated WebView data folder,
  isolated global Git config/identity, no system Git config, empty credential
  helper, no terminal prompts, isolated GH/GLAB directories. The isolated
  app's automatic update check was disabled. No real repository, preferences
  or credentials were modified.
- Playwright/axe and NVDA were placed outside the product in the scratch
  directory. No product dependency or persistent installation was added.
- NVDA `2026.3` portable came from
  [NV Access's official release](https://github.com/nvaccess/nvda/releases/tag/release-2026.3); the
  downloaded executable's Authenticode signature was valid for NV Access
  Limited. Its own config/log path was isolated, add-ons disabled and
  `--no-sr-flag` used. The **silence synthesizer** retained actual NVDA speech
  generation without playing audio. This proves functional screen-reader
  interaction/utterances, not acoustic voice quality, braille or human
  usability certification. [Selected speech output](nvda-speech-excerpts.txt)
  contains only this app's fixture utterances; raw desktop logs are not stored
  in the repository. NVDA was stopped after the pass.
- The second dev launch added **only to an external temporary Tauri config**
  the set-zoom/set-size/set-min-size permissions needed by the audit. Production
  capabilities were not widened. Native `setZoom(2)` changed the CSS viewport
  from 1180×760 to 590×380 and device pixel ratio from 1.25 to 2.5, with CSS
  `zoom: 1`. Earlier CSS-zoom/device-metrics probes were exploratory and are
  not substituted for this native-zoom result. No Windows scaling or contrast
  preference was changed. Development processes were closed afterward.

## Windows journeys and accessibility evidence

| Validation | Observed result / retained evidence |
| --- | --- |
| Native accessible tree and NVDA | Real file/branch names, file `current` state, Keep toggle state, named groups/headings, confirmation, return focus to the file heading, kept-but-unresolved and remaining-file announcements. Speech excerpts record English and Spanish language changes, the hook error alert and named merge dialogs. DOM inspection alone is not counted as the reader pass. |
| Keep / Mark / Reset | Native Tab/Space/Enter exercised the inline confirmations; the first Mark explanation has its own initial focus. Reset's modal cycle includes Close, Cancel and Reset and stays inside the dialog. Reset restored stages 1–3 and original conflict bytes, returned focus to the file heading and retained recovery. [Reset](reset-light-en.png). |
| Finish and refusal | A fixture-only `pre-commit` refused; HEAD stayed unchanged, all resolutions stayed staged and NVDA announced the actual error. Removing that fixture hook and explicitly confirming a new attempt finished with both exact parents, no MERGE_HEAD/unmerged entries and the separate unsaved file intact. [Refusal](finish-hook-es-dark.png), [success](finish-success-es-dark.png), [Git verification](resolve-verification.json). No publish action was selected. |
| Bring and Stop | Real local branch preview, native Enter on Resolve, handoff with names and ordinary unmerged stages. Stop's exact-return plan named separate unsaved work and recovery; native Enter restored old HEAD and current bytes, kept `notes.txt`, removed MERGE_HEAD and retained history/snapshot/abandoned-index refs. [Light preview](bring-light-after.png), [Git verification](bring-verification.json). |
| Get | Real Spanish/dark preview against a disposable local bare remote, explicit native Enter into the resolver. HEAD and remote tip stayed unchanged, roles named `origin/main`, unsaved work stayed intact and `get-team-changes` recovery existed. [Preview](get-dark-es.png), [Git verification](get-verification.json). |
| Hidden/retained screen | Back preserved the unmerged listing. The retained resolver had both `hidden` and `inert`; its heading was absent from Chromium's accessible tree. [Assertions](hidden-verification.json). |
| Forced colours / motion | CDP emulation was accepted by this actual WebView2: both media queries returned `true`, system-colour borders/selection were painted, selection had a Highlight outline, and there were zero running animations with the app reduction setting too. [Rendering](resolver-forced-final.png), [assertions](media-verification.json). This is live WebView emulation, not an OS high-contrast-settings test. |
| Themes and width | Existing list/detail and stacked-side behavior retained. [Light](resolver-light-after.png), [dark](resolver-dark-after.png); Spanish, English, normal size and native 200% zoom checked. Keyboard focus reveals file actions and both side readers at high zoom. |
| 600 conflicts at native 200% | First and last file reachable; the list viewport is 148 CSS px, 12 rows / 205 descendants initially, 11 / 204 at file 599, below the 400-row budget. Both side readers remain reachable by scrolling; no file mutation was made in this fixture. [Assertions](many-zoom-verification.json), [last-file capture](many-native-zoom.png). |
| Automatic semantics audit | [Summarized axe results](accessibility-results.json): duplicate/unnamed banner landmarks reproduced in Bring before the fix and disappeared afterward; resolver and scoped Get/Stop/native-zoom analyses have no reported violations. Global experimental `label-content-name-mismatch` notices were manually checked against primary labels (project/branch names are in their accessible names; decorative initials and secondary metadata are not the primary label). They are retained in the results, not reported as a globally clean scan. Forced-colour contrast calculations used authored colours rather than painted system colours; those reports are not a contrast measurement of forced rendering. |

## Defects corrected

1. The shared Dialog used an HTML `header` outside `main`, exposing another
   application banner beside the window's. Its header is now a neutral
   container; the named dialog/alertdialog and heading remain. Both variants
   failed the new semantic regression before the change, then passed. The
   runtime Bring AX tree now has one banner; duplicate-landmark axe findings
   disappeared. No visual value changed.
2. At native 200% zoom, compact navigation and the wrapping conflict header
   consumed the viewport while the workspace clipped overflow. The virtualized
   list could reach zero height. In short viewports the sheet now scrolls and
   the existing panes retain a bounded four-strip-height reading area. An
   initial min-height-only experiment mounted all 601 list/group rows; it was
   rejected. The final explicit height/flex basis keeps virtualization bounded
   (12/11 rows above). File controls and both sides can be scrolled into view.
   This visual regression was checked in the running app, not by a CSS/class
   assertion test. DESIGN documents the short-viewport behavior.

ADR 0041's truth, locks, snapshots, journals, initiation, recovery and verified
outcomes are unchanged. No new Git command, strategy, feature or visual token
was introduced.

## Checks

- Focused final command: `pnpm vitest run src/shared/ui/Dialog.test.tsx
  src/features/sync/BringInChangesDialog.test.tsx src/features/conflicts`:
  **88 passed in 5 files**, 9.06 s; no timeout was raised. The two new
  banner-regression cases initially failed on the original Dialog.
- `pnpm run check`: **exit 0** on 2026-10-31. Documentation, release/icon
  contracts, architecture and TypeScript passed; **1,883 frontend tests in
  163 files** passed (57.00 s), production build passed, Rust formatting and
  Clippy with warnings denied passed; **693 Rust library tests passed**
  (153.58 s), one explicit `hosting_access::tests::secure_store_roundtrip`
  qualification remained ignored, **2 credential-helper integration tests**
  passed (4.45 s), and example targets passed. The existing entry-chunk
  warning remains; no threshold or timeout was increased. These automated
  results do not qualify a real credential store or another OS/WebView.
- [Check summary and source fingerprints](checks.json) bind the uncommitted
  production changes to base `73714cc`. After the final task/links-only
  updates, `pnpm run check:docs` passed again (exit 0); `git diff --check`
  was clean. No code changed after the aggregate gate. The branch and HEAD
  remain `release/0.5.0` / `73714cc`; development/NVDA processes are stopped.

## External environments still required

For Linux and macOS independently, record exact commit/artifact, hardware/VM,
OS/desktop, Git, WebView and assistive-technology versions; execute the task-023
standard/5,000-change protocol and the retained 037-7/065-4-5 matrices. Include
real links/executable bits and refusal to launch runnable files, case-sensitive
and Unicode-normalizing paths, encodings/CRLF/gitlinks, unrelated-byte/mode
preservation, default-app handoff, keyboard/focus/live announcements and
hidden/inert with Orca/VoiceOver, zoom/forced colours/motion where exposed,
restart/interruption/recovery and linked-worktree isolation. Credentials,
memory and actual packaging/signing/update evidence remain release-hardening
obligations, not inferred from the Windows or compile results here.
