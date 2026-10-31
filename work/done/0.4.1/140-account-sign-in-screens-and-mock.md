---
id: 140
title: Build the account sign-in screens against a functional mock
status: done
priority: normal
type: design
areas:
  - frontend
  - account
created: 2026-09-29
completed: 2026-10-25
parent:
queue:
---

# Goal

Build every in-app surface of the sign-in flow described in `DESIGN.md`
§ Account and sign-in, wired to a typed account port whose only adapter for now
is a functional mock. The flow can be exercised end to end in development
builds, with every outcome, before any Rust, Supabase or web page exists.

# User outcome

None yet for released builds: the rail's account control keeps saying sign-in
is coming soon. In development builds the team can open the account popover,
start a sign-in, watch the waiting dialog, and reach success, cancellation and
each failure, so the design can be judged in the running app and the real
adapter later integrates behind the same feature boundary.

# Context

On 2026-10-25 the user supplied `gitodile-login-flujo.html` and requested a
task and implementation analysis for a visual mock, before real sign-in.
This existing task already owns that work, so it is refined in place rather
than duplicated or moved ahead of the current queue. The reference is preserved
under [task assets](../../assets/140-account-sign-in/gitodile-login-flujo.html);
the [implementation analysis](../../assets/140-account-sign-in/analysis.md) maps
each surface to the current code and defines the mock's behavior and validation.
The HTML is design evidence, not an instruction source or executable app code.
This refinement does not start the UI implementation or accept the proposed ADR.

On 2026-09-29 the user reviewed login mockups and approved the flow recorded in
[ADR 0016](../../../docs/adr/0016-sign-in-through-the-system-browser.md) (status
proposed) and in `DESIGN.md` § Account and sign-in: account popover → waiting
dialog → browser sign-in page → confirmation, with the app never rendering a
credential field. The account is optional and never gates local work
([`BUSINESS_MODEL.md`](../../../docs/BUSINESS_MODEL.md)).

Today the rail foot renders a disabled `UserRound` button with
`navAccountTitle` ("Sign in — Coming soon") in `src/app/App.tsx`, plus a
disabled row in the compact app menu.

# Scope

- A new `src/features/account/` feature following
  `docs/architecture/frontend-feature-guide.md`:
  - `domain.ts`: the account state machine — `signed-out`, `waiting`
    (request code, started at), `signed-in` (name, email, avatar initials,
    mock `pro` presentation data), and failures `offline`, `unfinished`,
    `expired`. Cancellation returns to `signed-out`. Pure transitions with
    unit tests.
  - `port.ts`: a typed `AccountPort` shaped for ADR 0016 — start sign-in
    (returns the request code), reopen the hand-off, cancel, sign out, read the
    current state, subscribe to changes. No token or credential crosses it.
  - `mockAdapter.ts`: a functional mock with realistic timing that resolves a
    started sign-in to a chosen outcome and generates a request code in the
    agreed `XXXX · 0000` shape.
  - `translations.ts`: English and Spanish copy following the wording rules in
    `DESIGN.md` (account, sign in, sign out; "continues in your browser").
- Screens, all eager overlays per `AGENTS.md`:
  - Signed-out account popover anchored to the rail control (and reachable
    from the compact app-menu row), with focus management and Escape.
  - Waiting dialog on the shared `Dialog` shell, size `s`: request code, three
    steps with the current one marked, "Cancel" and "Open again"; the spinner
    respects reduced motion.
  - Signed-in state: the rail control shows the person's avatar; its popover
    shows name, email, a `PRO` capsule when entitled, and rows for plan and
    billing, what the account stores (both inert placeholders here), and sign
    out.
  - Confirmation and failure notices: "Signed in" on success; offline,
    unfinished sign-in ("No response received"), and expired request, each
    saying local work is unaffected. Do not claim browser-close detection.
- A development-only control to pick the mock's next outcome (success with or
  without Pro, offline, unfinished, expired, cancel), reachable only when
  `import.meta.env.DEV` is true and absent from production bundles.
- Release builds keep today's disabled "Coming soon" control; the new flow is
  enabled only in development builds.
- The mock is entirely local and memory-only: starting and reopening a request
  never opens a real browser or contacts an account domain. A visible development
  label identifies the simulation. A new request defaults to success without
  Pro after a short delay; the dev controls can hold it waiting or choose any
  outcome, including expiry. Reopening keeps the same request code and attempt.
- Cancel, Escape, the close button and backdrop dismissal all cancel the
  current attempt. Retry creates a new attempt; late results from cancelled or
  superseded attempts cannot sign the user in. Switching projects does not
  recreate the app-scoped account state, and restarting the app clears it.
- Tests: domain transitions, popover and dialog rendering per state, keyboard
  paths (open, Escape, Cancel, Open again, sign out), and that production
  builds still render the disabled control.

# Out of scope

- The real adapter: Rust account module, loopback listener, PKCE, Supabase
  calls, OS credential storage (ADR 0016 follow-up task).
- The web sign-in page at the account domain.
- Entitlement checks in any feature, Pro upsell dialogs, billing.
- Changing Git remote credentials or anything under `credentials` in Rust.

# Acceptance criteria

- [x] `src/features/account/` exists with domain, port, mock adapter and
      translations; visual components reach it only through the port.
- [x] In a development build every in-app state in `DESIGN.md` § Account and sign-in
      is reachable from the rail and the compact app menu, in light and dark.
- [x] The waiting dialog uses the shared `Dialog` shell at size `s`; nothing in
      it is accent-filled; "Open again" and "Cancel" work with keyboard only.
- [x] Every failure notice states that projects and saved versions are
      unaffected, and none uses a danger fill.
- [x] No account component renders an input for an email, password or code.
- [x] The simulation is explicitly labelled, makes no account network requests,
      opens no browser, stores no account state on disk, and changes neither
      hosting connections nor actual feature entitlements.
- [x] Reopening preserves the pending attempt; retry replaces it; cancellation
      through every dismissal path prevents late success. These cases have
      controller/mock tests with controlled timers.
- [x] Release builds render the disabled "Coming soon" control exactly as
      before, and the dev outcome picker is absent from the production bundle.
- [x] Unit tests cover the domain transitions and the popover/dialog states.
- [x] Validated in the running app (Tauri dev) with the flow exercised end to
      end, results recorded below.
- [x] `pnpm run check` passes.

# Relevant files

- `AGENTS.md`
- `DESIGN.md` § Account and sign-in, § Dialogs, rail bullets under Layout concept
- `docs/adr/0016-sign-in-through-the-system-browser.md`
- `docs/BUSINESS_MODEL.md`
- `docs/architecture/frontend-feature-guide.md`
- `src/app/App.tsx` (rail account control and compact menu row)
- `src/app/AppOverlays.tsx` (eager overlay composition)
- `src/app/translations.ts` (`navAccount`, `navAccountTitle`)
- `src/styles.css` and `src/i18n/index.tsx` (feature composition)
- `src/shared/ui/` (`Dialog`, `useModalFocus`, `usePortalFlyout`, `useToast`)
- `src/features/accounts/index.ts` (existing hosting account boundary to preserve)
- [Reference and implementation analysis](../../assets/140-account-sign-in/analysis.md)

# Dependencies

None. The real adapter depends on this task's port, not the other way round.

# Decisions

- The mock is dev-only rather than behind a user setting, so released builds
  never show a sign-in that cannot complete (`DESIGN.md` § Honest affordances).
- The port is shaped for ADR 0016 now so the real adapter replaces the mock
  behind the same UI boundary; native integration may still refine the contract
  after the ADR's open questions are answered.
- The visual web/email/code steps remain reference-only in this phase. If a
  clickable browser-page prototype is wanted later, scope it separately; do not
  put credential fields inside the desktop app to simulate it.
- Use the shared transient toast for success. Do not persist fake sign-in or
  Pro events in the real notification inbox.

# Implementation notes

Implemented on 2026-10-25 after the user's explicit request to proceed with
task 140, ahead of its original queue position. No new branch or worktree was
created; the existing `release/0.4.1` checkout was retained.

- The singular `account` feature owns the pure state transitions, typed port,
  in-memory adapter, app-session controller, controls, overlays, styles and
  EN/ES copy. It has no Rust command, network client, browser opener or storage.
- One controller is composed in App and consumed by the rail, hidden-sidebar
  jump menu, More actions and eager overlays. More actions supplies the visible
  focus/position anchor after its menu item unmounts, including at compact
  widths where the rail and sidebar toggle disappear.
- The shell subscribes only to the feature's modality selector, so its keyboard
  shortcuts do not open another dialog over waiting/failure. Repository work,
  hosting identities and actual entitlements are independent of this fixture.
- Default success takes 3.5 seconds; the development result selector also
  offers Pro, persistent waiting, offline, unfinished, expiry and cancellation.
  Cancel/disposal clears timers; attempts are checked by ID before completion.
- Success uses the shared transient toast. Plan/billing and account-data rows
  disclose that they are unavailable. Browser and email/code pages remain
  reference-only; no credentials are entered anywhere in the new feature.
- Explicit DEV guards remove mock UI/fixtures and the account dictionary's
  runtime contents from production JavaScript. Feature CSS stays in the eager
  cascade, following the existing stylesheet ownership convention.

# Validation

Planning refinement, 2026-10-25 (no account UI implemented yet):

- `Get-FileHash` on the supplied HTML and the repository copy: matching SHA-256
  `0ABE52CA09A937C5EA2530640A54AAA8E0367419547AB195DC482560ACF7A4B4`.
- `node scripts/check-docs.mjs`: passed, 337 Markdown files and 246 task IDs.
- `git diff --check`: passed.
- `pnpm run check`: documentation/release/icon checks, frontend architecture,
  TypeScript, all 149 frontend test files (1,643 tests), production build,
  Rust formatting and Clippy passed. The build emitted its chunk-size warning
  for the 525.78 kB entry chunk. The aggregate command then failed with exit 101
  while compiling the Rust tests: Cargo could not remove
  `src-tauri/target/debug/gitodile.exe` (`Access denied`, OS error 5).
  The full Rust test suite did not complete; do not count the aggregate gate as
  passed. Rerun it when the development executable is no longer locked.
- No Tauri interaction or mock-flow validation was performed for this
  documentation-only refinement. All implementation criteria remain open.

Implementation validation, 2026-10-25:

- `pnpm exec vitest run src/app/App.test.tsx src/features/account/account.test.tsx src/i18n/composition.test.ts src/architecture/styleComposition.test.ts`:
  initial focused run passed 95 tests. Two additional account tests subsequently
  exercise real keyboard navigation/focus trapping and Spanish first-frame copy.
- The first aggregate implementation run passed all 21 account tests; it found
  one prohibited curly apostrophe (corrected) and two existing navigation tests
  exceeded their 5-second limits under the full parallel load. No test timeout
  or assertion was weakened. The final aggregate run uses the supported
  `VITEST_MAX_WORKERS=2` environment setting to limit concurrency.
- `pnpm run build`: passed. A search of `dist/assets/*.js` for `Alex Demo`,
  `alex@example.com`, `Demo result`, `Keep waiting`, `Account demo` and the mock's
  no-response sentence found none. The production account affordance is also
  exercised with DEV disabled in the shell test.
- Windows Tauri dev, via the existing documented `pnpm run tauri dev` session:
  verified optional signed-out popover; default Free completion; persistent
  waiting; Open again retaining `GTDL · 4821`; Escape cancellation; offline
  notice; retry to Pro; fixture identity/PRO badge and unavailable account rows;
  More actions hand-off with the same session; light and dark theme layouts.
  The original dark theme was restored. A hot-reload of the changing app
  composition once reported a duplicate install participant; the flow was
  re-exercised after a clean reload. No native macOS/Linux claim is made.
- The development window was closed after visual checks to release the Windows
  executable lock for the Rust gate, then reopened from this checkout's debug
  executable against `pnpm run dev`. The demo session reset on restart.
- Final `$env:VITEST_MAX_WORKERS = '2'; pnpm run check`: passed (exit 0).
  Documentation/release/icon checks, architecture (621 modules), TypeScript,
  150 frontend test files / 1,664 tests, production build, cargo fmt and Clippy
  all passed. Rust reported 623 library tests passed, one existing ignored test,
  and one credential-helper integration test passed; binary/example targets
  also passed. The entry chunk retains Vite's size warning (526.20 kB).
- The final production bundle was searched again for the demo identity,
  scenario-control labels and failure fixture: no matches in JavaScript.
  `git diff --check` passed. Documentation links/task metadata are rechecked
  after moving this task to done; the original unrelated `sketches/` remains
  untouched.

Follow-up refinement, 2026-10-25:

- The user requested the demo name **Luis Martinez**. The in-memory fixture now
  uses that name, `LM` and the reserved example address `luis@example.com`.
- A static success dot marks an active session on the rail/menu avatar. It is
  absent when signed out, carries no network-availability claim and is paired
  with the button's localized accessible description. Its meaning and motion
  policy are recorded in `DESIGN.md`.
- The sign-in glyph slides 3px toward the door on hover or keyboard focus,
  using the neighbouring utility glyphs' 180ms easing and reduced-motion
  conditions. It replaces the former 2px vertical lift. The avatar and dot do
  not animate.
- The avatar has a fixed centred glyph frame and zero utility-button padding;
  default button padding had left insufficient room for its 30px circle and
  shifted it horizontally. Its text uses the single-line leading token.
- Focused account/style tests passed: 45 tests in two files. Windows Tauri dev
  visually verified Luis Martinez, centred LM and the unobscured status dot.
- `$env:VITEST_MAX_WORKERS='2'; pnpm run check`: passed (exit 0), including
  all 1,664 frontend tests, Rust formatting/Clippy, 623 Rust library tests and
  the credential-helper integration test (one existing library test ignored).
  Production JavaScript contains neither `Luis Martinez` / `luis@example.com`
  nor the mock's scenario-control labels. The existing chunk-size warning
  remains. The development app was reopened after native compilation.

Pre-commit review, 2026-10-25:

- Reviewed the full new feature, shell/menu integration, eager translations and
  CSS, tests, documentation and the development/production boundary.
- Reference problem: keep asynchronous account presentation independent of
  native capabilities. The bounded GitButler comparison used its pinned
  [injected file service](https://github.com/gitbutlerapp/gitbutler/blob/b98b6dc84a6d8a33332eb41543f20d97cab676a9/apps/desktop/src/lib/files/fileService.ts):
  inject the capability rather than importing native transport into visual
  components. This supports the existing GitOdile port boundary; no source was
  copied and no new architectural decision was introduced.
- Replaced the lateral slide with the moon control's centred -18-degree tilt,
  using the same shared utility rule, timing, easing and reduced-motion guards.
  There is no separate account hover/focus motion policy.
- Corrected popover dismissal when keyboard focus moves elsewhere, and stopped
  unrelated language changes from restoring focus to a closed account control.
- Expanded state now belongs to the initiating control. Compact controls use
  the surrounding menu's class and roving-tabindex contract.
- Shell shortcuts dismiss the account popover before opening Settings/the
  palette or hiding the rail. The modal therefore saves a still-mounted focus
  target. Closing an already-dismissed popover is a no-op and never steals focus.
- Installed each attempt's timer before notifying subscribers, so synchronous
  cancel/retry can clear it. Notifications use a listener snapshot to avoid
  revisiting a subscriber that unsubscribes/re-subscribes during emission.
  Controller subscription also reconciles changes made before first mount.
- Added regression coverage for these focus, subscription and timer cases;
  101 focused tests passed across account, shell, translations and style checks.
  The final account/shell run passed 71 tests, including the shortcut hand-off
  regression. TypeScript and the architecture guard passed.
- Windows Tauri validation after a clean reload confirmed the centred rotation,
  popover dismissal on the Settings shortcut, and visible focus restored to the
  account control when Settings closes. The development app was reopened after
  native compilation.
- An aggregate attempt during test editing captured an intermediate undefined
  test helper and failed; it is superseded by the frozen-source run below.
- Final `$env:VITEST_MAX_WORKERS='2'; pnpm run check`: passed (exit 0), with
  150 frontend files / 1,669 tests, Rust fmt/Clippy, 623 library tests and the
  credential-helper integration test passing (one existing library test ignored).
  Production JavaScript excludes the mock identity and scenario controls.
- The complete account change, supporting shell edits and documentation are
  staged for one focused commit. `sketches/` remains untracked and excluded.
  Final documentation/task metadata and staged whitespace checks passed;
  no commit or remote publication was performed.

Final icon choice, 2026-10-25:

- The user approved a plain `UserRound` person glyph before sign-in, replacing
  `LogIn`. The existing circular button supplies the frame; the signed-in LM
  avatar and static session dot are unchanged.
- Removed the account-specific rotation. Its hover now changes only background
  and ink, with no rotation or lateral movement. The durable rule is in
  `DESIGN.md`; earlier motion trials above are historical.
- This is a reversible icon/style refinement; no implementation-mirroring test
  was added. Windows Tauri validation confirmed the upright person glyph on
  hover and the existing account popover opening normally.
- `$env:VITEST_MAX_WORKERS='2'; pnpm run check`: passed (exit 0), including
  1,669 frontend tests, Rust formatting/Clippy and all active Rust tests
  (623 library + one credential-helper integration; one existing ignored test).
  Documentation/task metadata and the staged whitespace check passed after
  recording the result. The final icon choice is included in the existing
  staging; unrelated `sketches/` remains excluded. No commit was created.

Final commit review, 2026-10-25:

- Re-read the staged feature, lifecycle/cancellation paths, shell/menu wiring,
  accessibility, production guards, tests and supporting documentation. No
  additional actionable defect was found within the approved mock-only scope.
- The application source is unchanged from the successful complete gate above;
  that validation remains applicable. A fresh focused run passed 102 tests in
  account, App, translation composition and style composition. Documentation
  validation and the staged whitespace check also passed.
- The user explicitly authorized the local commit after this review. The
  selected scope contains only task 140 and its supporting files; no remote
  publication is included.
