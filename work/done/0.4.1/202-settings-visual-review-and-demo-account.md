---
id: 202
title: Clarify Settings, hosting connection states and the GitOdile account demo
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
  - ux
created: 2026-10-26
completed: 2026-10-26
parent:
queue:
---

# Goal

Make Settings easier to scan and operate, give the existing GitOdile sign-in
demo a clear home, and refine Navigation's layout and feedback. Correct the
hosting-account wording and contradictory states shown in the user's captures.

# User outcome

People can distinguish their optional GitOdile account from the connections
used to access projects, understand which connection needs attention and what
to do next, and predict the result of changing the navigation bar.
Developers can exercise the existing sign-in demo from Settings.

# Context

The user requested an analysis and a task on 2026-10-26, then authorized its
implementation and iterative review. The first implementation is recorded below.
It is appended to the existing queue without reprioritizing other work.

Evidence supplied by the user:

- [Connected accounts capture](../../assets/202-settings-review/connected-accounts-before.png).
- [Navigation capture](../../assets/202-settings-review/navigation-before.png).

The captures are evidence of presentation problems, not proof of the actual
validity of any credential. No account checks or sign-out operations were run
to prepare this analysis.

Relevant existing decisions:

- [Task 077](../0.1.0/077-rework-settings-slack-style.md) established the
  preferences workspace; retain its shell rather than redesigning the app.
- [Task 158](../0.4.0/158-settings-accounts-section.md) consolidated hosting
  accounts into one list with folded provider tooling. Keep that consolidation.
- [Task 140](140-account-sign-in-screens-and-mock.md) delivered a local,
  memory-only, development-only GitOdile account simulation. Production has
  no working GitOdile authentication or billing.
- [DESIGN.md](../../../DESIGN.md) owns tokens, dialog geometry, account language
  and the bordered Navigation list exception.

# Analysis and proposed direction

## 1. Settings hierarchy and consistency

Review the whole panel for heading hierarchy, content alignment, spacing,
choice states, action placement and long text. Prioritize Accounts and
Navigation, and make small shared adjustments where another section has the
same problem. Retain the single preferences surface, restrained neutral
materials, existing size/type/radius tokens and one primary action per context.

Use short headings with one useful explanatory sentence. Avoid adding a card
around every setting or a warning below every group. Keep save feedback and
errors near their owning controls. Review the category rail's selected, focus,
hover and attention states alongside the content; warnings must identify a
real problem rather than make an optional missing CLI look mandatory.

The screenshots do not establish that every section needs restructuring.
Do a running-app pass before broadening any shared style change. Search,
new dependencies and a wholesale category reorganization are unnecessary
for this scope.

## 2. Separate GitOdile identity from project connections

Add a clearly labelled **GitOdile account / Cuenta GitOdile** section only
when the development demo capability is supplied by the composition root.
The section carries a persistent **Demo** label and explains that it is a
local simulation: no browser opens and no data is sent.

Keep hosting under the existing `accounts` section ID and propose the visible
label **Project connections / Conexiones de proyectos**. Update matching
rail, header and command-palette labels together; keep Home's connection
entry points targeting that section. The separate GitOdile demo entry must
not appear in production navigation or palette commands.

The demo section should show:

- Signed out: optional-account explanation, next-result selector and a
  **Try sign-in / Probar inicio de sesión** action.
- Signed in: existing mock identity, Free or Pro demo status, sign-out action
  and a clear way to start another scenario.
- The existing seven results: Free success, Pro success, keep waiting,
  offline, unfinished, expired and cancelled. Explain that selecting a
  result configures the next attempt; it does not change a live attempt.
- A **Reset demo / Restablecer demo** action clearing the current simulated
  session/pending attempt and returning the next result to Free success.

Use the existing account controller as the sole state owner. Settings and the
rail must always agree. Reuse the current waiting/failure flow; specify the
handoff and return-focus behavior when a demo starts inside Settings so two
dialogs cannot compete for focus, Escape or backdrop dismissal. Closing just
Settings must not inadvertently dispose the app-scoped controller or sign out.

Plan/billing, stored-account data and advertised future benefits must be
identified as previews or unavailable. A simulated Pro session grants no real
entitlement. Keep the session memory-only and do not add persistence, network
calls or a real authentication adapter.

## 3. Hosting account text and state consistency

The first capture exposes implementation issues as well as copy issues:

- `TokenConnectionRows` maps `authentication_failed` through the shared
  `localizeAppError`, producing “Couldn't sign in to the remote. Check your
  Git credentials.” That sentence describes Git remote access, while this
  surface is checking a saved provider token. Add context-specific account
  wording without globally replacing errors used by publish/clone/sync.
- `GitLabAccountSection` currently reduces every nonverified, nonbusy row to
  “Not checked” even when its snapshot has a known invalid authorization.
  The screenshot therefore combines an unknown-looking chip, a stale-check
  note, an explicit invalid warning and a disabled sign-out action.
- “Reconnect” is used as a state chip, but it looks like an instruction while
  the row only offers Remove. State the problem in the chip and provide the
  existing connection route as a separate repair action when applicable.
- GitLab's warning says “Token connections above remain independent.” Its
  meaning depends on layout and adds internal CLI detail to the main error.
  Scope the message to the browser connection and move technical recovery
  guidance into an explicit detail/help affordance.

Proposed copy, to be finalized against the actual available actions:

| Context | English | Spanish |
| --- | --- | --- |
| Rejected token chip | Token rejected | Token rechazado |
| Rejected token explanation | {provider} rejected this saved token. Connect a new token to use this account. | {provider} ha rechazado este token guardado. Conecta un token nuevo para usar esta cuenta. |
| Known invalid browser authorization | Sign-in needs attention | Revisa el inicio de sesión |
| Invalid browser explanation | The browser connection to {provider} is no longer valid. | La conexión con {provider} mediante el navegador ya no es válida. |
| Cached state not yet verified | Not checked yet | Pendiente de comprobar |
| Explicit check action | Check connections | Comprobar conexiones |
| Browser repair action, when supported | Reconnect | Volver a conectar |

Do not infer expiry, revoked permission or a bad token from a network failure.
Known invalid state takes precedence over a generic needs-check hint. Offline,
checking, unchecked, saved, connected and externally managed states remain
distinct. Explain unavailable actions near the control; never enable unsafe
sign-out/removal simply to make the row look actionable. If repair must happen
in `glab`, name the tool in details and offer the existing check afterwards.

Preserve host groups and method chips: two rows for the same username can be
independent token/browser connections. Keep their identity, state and actions
aligned, allow long logins/hosts and localized notices to wrap, and reduce
competing warning lines to one main explanation for each problem.

## 4. Navigation settings

The capture shows identical large sidebar glyphs in both appearance choices,
with a tiny Overview label as their main distinction. Only the selected
choice has a surface; its selection relies mostly on background tone. Arrows
appear on hovered/focused rows, so the screenshot can suggest that only some
destinations support reordering. These are discoverability issues; the code
already supports radio semantics, keyboard moves and position announcements.

- Retain the dense bordered destination list and shared switch primitive.
  Keep rows stable when hidden and explicitly mark them **In More / En Más**.
- Improve the ordering affordance, alignment and drop feedback. Prefer a
  leading grip before the destination icon/name, keeping visibility on the
  right. Keep precise move controls reachable by keyboard, and make them
  discoverable on focus/hover and touch without layout shifts.
- Draw meaningful miniature rails for **Icons and text / Iconos y texto**
  and **Icons only / Solo iconos**, using the same sample destinations and
  actual label placement. Preserve the current fixed rail width: icons-only
  saves vertical space, not horizontal width.
- Give both choices the same outer geometry and an explicit selected mark
  (radio/check plus contrast), distinct from hover and keyboard focus.
  Retain the existing radio-group keyboard contract.
- Split the current compressed explanation into two clear sentences:
  “Drag to change the order. Hidden sections remain available in More.” /
  “Arrastra para cambiar el orden. Las secciones ocultas siguen disponibles
  en Más.” Explain separately that short windows can also move sections to
  More. Do not claim every enabled destination is always visible.
- Keep the existing section-reset mechanism and stored preference contract.
  Verify preview, real rail and More agree immediately after edits and reset.

# Scope

- Focused Settings visual pass, including the category rail and shared rhythm.
- Development-only GitOdile demo section and shared-controller integration.
- Hosting account wording and presentation-state corrections described above.
- Navigation list, appearance previews, selection and reorder feedback.
- English/Spanish copy and focused regression coverage.
- Update durable design/architecture documentation only for decisions actually
  implemented; keep screenshots and validation evidence with this task.

# Out of scope

- Real GitOdile authentication, browser pages, account persistence, billing,
  preference sync or paid feature enforcement.
- Changing provider credential storage, permissions, shared CLI sessions,
  native authentication workflows or Git configuration.
- Implementing blocked provider features or the full credential diagnostics
  workflow owned by [065-7](../../0.7.0/065-7-credential-remote-diagnostics.md).
- New navigation destinations, rail width changes, a new theme system or
  a complete Settings rewrite.

# Acceptance criteria

- [x] Accounts and Navigation follow the existing design tokens, with legible
  selected/hover/focus/disabled states and no horizontal overflow at the
  documented minimum app size or in short windows.
- [x] GitOdile demo identity and real project connections have distinct labels
  and entry points; existing Home and palette routes still reach the right place.
- [x] All seven demo results, sign-out, retry and reset are usable from Settings;
  the rail reflects the same state and restart clears it.
- [x] Demo integration stays development-only, with identity, scenario controls
  and demo strings excluded from production bundles and navigation.
- [x] Starting/cancelling/retrying from Settings preserves modal focus ownership,
  Escape ordering and a valid return-focus target; late completion cannot revive
  a cancelled/reset request.
- [x] A rejected token gets provider-account wording, while remote-operation
  errors retain their existing meaning. EN/ES copy names only known causes.
- [x] Invalid, unchecked, offline and checking states have consistent chip,
  notice and action combinations, including the GitLab state in the capture.
- [x] Repair routes are usable where already supported; external management and
  unavailable actions explain the next step without widening mutation permissions.
- [x] Navigation mode choices preview their real difference and show selection
  beyond color. Mouse, keyboard and touch can reorder/show/hide destinations.
- [x] Ordering, visibility, display mode, More overflow and reset retain current
  persistence behavior; keyboard moves keep focus and announce the new position.
- [x] Validate the affected flows in the running Tauri application in light/dark,
  EN/ES, normal/short windows and reduced motion. Cover connected, empty, invalid,
  offline, checking and disabled states through controlled fixtures where needed;
  do not mutate real accounts to stage an error screenshot.
- [x] Relevant account, hosting, Settings, shell/command routing and preference
  regression tests pass; `pnpm run check` passes and results are recorded here.

# Relevant files

- [Settings panel](../../../src/features/settings/SettingsPanel.tsx),
  [domain](../../../src/features/settings/domain.ts),
  [styles](../../../src/features/settings/settings.css),
  [translations](../../../src/features/settings/translations.ts).
- [Shared preferences shell styles](../../../src/app/app-shell.css),
  [composition root](../../../src/app/App.tsx),
  [overlay composition](../../../src/app/AppOverlays.tsx),
  [preferences](../../../src/app/preferences.ts).
- [Account controller](../../../src/features/account/controller.ts),
  [mock adapter](../../../src/features/account/mockAdapter.ts),
  [overlays](../../../src/features/account/AccountOverlays.tsx).
- [Hosting Settings composition](../../../src/features/hosting-servers/AccountsSettings.tsx),
  [account row](../../../src/features/accounts/AccountRow.tsx),
  [token rows](../../../src/features/accounts/TokenConnections.tsx),
  [GitLab account section](../../../src/features/gitlab/GitLabAccountSection.tsx),
  [GitHub account section](../../../src/features/github/GitHubAccountSection.tsx).
- [Error localization](../../../src/shared/i18n/appError.ts), provider-owned
  translations and the corresponding feature tests.
- [Frontend ownership guide](../../../docs/architecture/frontend-feature-guide.md),
  [architecture](../../../docs/ARCHITECTURE.md),
  [product strategy](../../../docs/PRODUCT_STRATEGY.md).

# Dependencies

Tasks 077, 140 and 158 are complete. No dependency on real account services.

# Decisions

- Iteration 4: the user chose **Integrations / Integraciones**, retaining
  **Account / Cuenta** for the optional GitOdile identity. The reference research
  found this distinction appropriate to the app's service/tooling scope;
  [GitButler](https://docs.gitbutler.com/features/forge-integration/github-integration)
  and [GitKraken](https://support.gitkraken.com/start-here/preferences/) use
  Integrations for hosting-service connections too. No section ID changes.
- Iteration 2: the user requested the short labels **Account / Cuenta** and
  **Connections / Conexiones**, replacing the first implementation's longer
  names. Section IDs, routing and the production demo boundary are unchanged.
- The user authorized implementation and iterative visual review on 2026-10-26,
  explicitly taking this task ahead of the queue. The queue order itself is unchanged.
- Preserve the current queue order; this task has position 23.
- Demo UI belongs to `features/account`; Settings accepts an optional injected
  capability/render slot through the composition root. Do not import app state
  into a feature or create a second controller inside Settings.
- Filter Settings categories and palette entries from the same actual available
  sections. Current tab keyboard navigation indexes `SETTINGS_SECTIONS` directly;
  a conditional category must also update that behavior to avoid invisible tabs.
- Settings remains an eager overlay, with no network check caused by opening
  it or selecting a category. Preserve the existing launch-verification exception.
- No Rust workflow change is expected. If presentation cannot express an actual
  native state, record the gap and review scope before changing authentication.

# Implementation notes

First implementation, 2026-10-26:

- Added development-only `AccountSettings`, supplied by the composition root.
  The existing controller owns session/scenario state for Settings and the rail;
  reset cancels pending work and restores Free. No native credential workflow,
  account persistence or entitlement enforcement was added.
- The available-section helper drives both category and command-palette entries;
  tab keyboard navigation now indexes the actual available categories. Hosting
  keeps its `accounts` ID with the label Project connections / Conexiones de
  proyectos. Production has no demo category or scenario/identity copy.
- Settings retains drafts while the account modal owns focus. Its body is inert
  and hidden from assistive technology until the flow closes; Escape returns to
  the initiating button. A second backdrop veil is suppressed.
- Token rejection now uses connection-specific guidance. GitLab invalid/offline/
  unchecked states no longer collapse into the same chip; repair guidance is
  disclosed in details with an explicit check. GitHub also preserves known
  invalid state over a stale-check hint. Removal/sign-out safety is unchanged.
- Navigation has a leading grip, reserved move-arrow space, stronger drag feedback,
  and matched compact miniature rails with a selected check. Icons-only still
  preserves width. Previews were shortened after the initial live pass exposed
  unnecessary scrolling. Long account identities/notices wrap without clipping.
- Settings' category rail now scrolls in short windows and has explicit keyboard
  focus styling. Durable rules are recorded in DESIGN.md, README.md and architecture.
- Existing Windows Tauri development app was used for validation. A helper capture
  briefly followed the user's foreground switch; the GitOdile target was reselected
  before further actions. No real account was connected, checked, signed out or
  removed during UI validation.
- Reference captures remain under `work/assets/202-settings-review/`. Task stays
  active for iteration; the full minimum-window/touch validation matrix remains
  to be completed. An attempted corner resize while Settings was open dismissed
  its backdrop instead of resizing; no minimum-size validation is claimed.

# Validation

The planning run is historical evidence; implementation validation follows it.

2026-10-26, task creation:

- `$env:VITEST_MAX_WORKERS='2'; pnpm run check` was attempted. Documentation,
  update contracts, release highlights, release/icon checks, frontend
  architecture and TypeScript completed successfully before Vitest.
- Vitest reported four failures in `src/app/App.test.tsx`: opening clone from
  Home/palette, filling Home accounts after launch verification, retaining a
  placeholder for each unchecked provider, and listing favourite recents.
  Their cause was not diagnosed in this planning-only change.
- The run was stopped after those failures and several minutes in the suite.
  Its partial summary was 150 passed files, one failed file, 1,702 passed tests
  and four failed tests. Worker-exit errors during shutdown are interruption
  artifacts, not additional diagnosed application failures. The aggregate
  gate did not pass; the frontend build and Rust stages were not reached.
  Only descendants of the verified check-runner process were stopped.
- Final `node scripts/check-docs.mjs`: passed over 342 Markdown files and
  251 task IDs after recording the check result.
- `git diff --check`: passed. No application source was changed.

2026-10-26, implementation validation:

- Focused account, Settings, GitLab, GitHub, hosting accounts and style checks:
  eight files / 194 tests passed. The new full-shell Settings → waiting → Escape
  → Pro → close/reopen → reset regression passed separately (one selected test).
- `$env:VITEST_MAX_WORKERS='2'; pnpm run check`: documentation, release/icon
  contracts, architecture, TypeScript, all 153 frontend files / 1,710 tests and
  production build passed. This supersedes the earlier planning-run failures.
  Rust formatting and Clippy passed, but Rust test compilation could not replace
  the running Windows `gitodile.exe` (OS error 5). The aggregate exited 101.
- Production JS scan found none of the mock identity, demo scenario controls,
  English/Spanish Settings demo labels or reset actions. The existing Vite
  large-entry-chunk warning remains; no code-splitting boundary was changed.
- Windows Tauri live review: Navigation and project connections in dark/English;
  Navigation in light/Spanish with reduced motion; demo waiting, cancellation and
  visible return focus. Existing invalid token/browser receipts stayed distinct.
  Theme, language and reduced-motion preferences were restored afterwards.
- The development app was closed normally to release the executable.
  `pnpm run check:rust` then passed (exit 0): fmt, Clippy, 629 library tests and
  the credential-helper integration test; one existing library test is ignored.
  All stages of the required gate have therefore passed on this implementation,
  with Rust rerun separately after the Windows file-lock failure; no successful
  uninterrupted aggregate run is claimed.
- Final `node scripts/check-docs.mjs` and `git diff --check` passed. The documented
  `pnpm run tauri dev` command reopened the app; original dark/English/motion
  preferences were verified and Settings → Navigation was left open for review.
  No commit or remote publication was performed.

2026-10-26, iteration 2:

- Shortened section labels to Account / Cuenta and Connections / Conexiones,
  updating matching tests and current documentation.
- Fixed the standalone-error layout shown in the
  [new user capture](../../assets/202-settings-review/gitlab-missing-identity-before.png).
  `.github-account p` reset paragraph margins, overriding the old per-child
  insets. Host-list sections now own their padding; notices and repair details
  align even when GitLab cannot provide an identity. Bounded grid tracks and
  wrapping keep long notices inside the available column.
- Windows Tauri review reproduced the missing-identity case and verified both
  collapsed and expanded repair details without checking or mutating real accounts.
- Settings, GitLab and hosting account checks: 3 files / 104 tests passed.
  Documentation and whitespace checks passed.
- `$env:VITEST_MAX_WORKERS='2'; $env:RUST_TEST_THREADS='4'; pnpm run check`:
  passed uninterrupted (exit 0), including 153 frontend files / 1,710 tests,
  production build, Rust fmt/Clippy, 629 library tests and one credential-helper
  integration test (one existing ignored library test). The app was closed
  normally for this run to prevent the earlier Windows executable lock.
- Reopened through `pnpm run tauri dev`; no commit or remote publication.

2026-10-26, iteration 3:

- The user proposed Integrations / Integraciones and requested naming alternatives.
  Integrations, Services and Platforms were discussed against the existing
  Connections label; no further rename is applied until the user chooses.
- Capped the navigation destination list at 400px, shrinking with its container,
  to bring ordering and visibility controls closer to the short names. Appearance
  previews keep the full content width. This changes only CSS geometry.
- Preserved the [wide-list reference](../../assets/202-settings-review/navigation-wide-before.png)
  and verified the compact result in the running Windows Tauri app.
- `$env:VITEST_MAX_WORKERS='4'; pnpm run check`: passed (exit 0), including all
  1,710 frontend tests, production build, fmt/Clippy, 629 Rust library tests and
  the credential-helper integration test (one existing ignored library test).
  No new test was added for this reversible CSS-only refinement.
- Reopened with `pnpm run tauri dev` for continued visual review. No commit or push.

2026-10-26, iteration 4:

- Renamed the hosting section to Integrations / Integraciones, including Settings,
  its palette labels, current documentation and matching tests.
- Reworked Navigation's display choices using the existing theme-card chrome:
  a wide preview above the caption, with matching selection/focus treatment and
  the existing check. Both choices fit the compact 400px group width.
- The miniature workspace now has a header, content rows and a status strip;
  the rails retain identical widths so only caption density changes. Supporting
  descriptions remain available to assistive technology, while the visual
  caption is short like the theme selector's.
- Preserved the [previous appearance cards](../../assets/202-settings-review/navigation-appearance-before.png).
  This is a local UI refinement; no new implementation-mirroring test is added.
- TypeScript and the 99 focused Settings/style tests passed. Windows Tauri
  verification confirmed the Integrations label, compact vertical cards and
  pointer/keyboard selection; the original icons-only preference was restored.
  A full frontend reload cleared stale styles retained by development hot reload.
- `$env:VITEST_MAX_WORKERS='4'; pnpm run check`: passed uninterrupted (exit 0),
  with all 1,710 frontend tests, production build, Rust fmt/Clippy, 629 library
  tests and the credential-helper integration test (one existing ignored test).
- Reopened through `pnpm run tauri dev` for continued visual review. No commit or push.

2026-10-26, final code review:

- Reviewed the complete implementation, composition, modal focus handoff,
  development-only capability, bilingual labels, hosting states and layout.
- Fixed stale GitLab failure text being announced as progress while a new
  request is pending. Pending work without an operation receipt now uses the
  neutral progress label; a receipt still provides the specific operation text.
  A regression verifies that the old error/repair prompt is not announced.
- Clear Navigation's drag feedback when pointer capture is lost unexpectedly,
  and ignore subsequent pointer movement. Added a regression for interruption;
  the existing reorder regression now covers both mouse and touch pointers.
- Memoize Settings categories against the presence of the demo capability,
  rather than its newly created React element, to avoid rebuilding the rail
  on unrelated parent renders.
- Final native Windows validation used a temporary Tauri config outside the
  repository to enforce the documented 900 × 620 client size. Account,
  Integrations and Navigation fit without horizontal overflow; the category
  rail and content scroll independently, and both appearance captions/checks
  remain reachable. Rejected-token copy and GitLab's standalone invalid-session
  notice stay inside their host cards. No real account actions were triggered.
- Earlier live review covers dark/English and light/Spanish with reduced motion;
  controlled frontend fixtures cover empty/offline/checking/disabled states.
  Touch coverage uses pointer-event regressions and the existing coarse-pointer
  targets; no physical touchscreen validation is claimed.
- The native app was closed normally before the final aggregate gate to avoid
  Windows locking the test executable. No project window configuration changed.

- Final aggregate gate: `$env:VITEST_MAX_WORKERS='4'; pnpm run check` passed
  uninterrupted (exit 0): docs/contracts/architecture, TypeScript, 153 frontend
  files / 1,713 tests, production build, Rust fmt/Clippy, 629 library tests and
  one credential-helper integration test. One existing library test is ignored.
- Production bundle scan passed: mock identity and demo controls are absent.
  The existing Vite large-chunk warning remains; no new bundle boundary changed.
- Updated current documentation to use the Check connections action label.
- Task completed on 2026-10-26; ready for the user-requested local commit.
