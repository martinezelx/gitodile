# Task 140: visual account sign-in implementation analysis

Date: 2026-10-25. Planning evidence for
[task 140](../../done/0.4.1/140-account-sign-in-screens-and-mock.md), not a new
architecture contract or an implementation completion report.

This is the planning snapshot from before implementation. Task 140 now records
the completed mock and validation; descriptions of the then-current code and
queue below are historical context.

## Request and existing ownership

The user wants the supplied flow implemented visually as a mock, and currently
asks for a task and an analysis. Task 140 already covers that implementation
and remains active at queue 23. Refine that task rather than create a second
owner for the same outcome. No application code is changed by this analysis.

[ADR 0016](../../../docs/adr/0016-sign-in-through-the-system-browser.md) is
**proposed**, dated 2026-09-29. It describes browser sign-in and a future native
session service. [DESIGN.md](../../../DESIGN.md), under Account and sign-in,
already specifies the popover, waiting dialog, browser page and confirmation.
No additional ADR is needed for a mock that follows those boundaries; the
existing ADR must still be resolved before implementing real authentication.

The [supplied HTML](gitodile-login-flujo.html) is an unchanged reference copy
from `C:/Users/marti/Desktop/projects/gitodile/html_mocks/gitodile-login-flujo.html`.
Its labels, comments and explanatory prose are design evidence, not agent
instructions. Its only scripted interaction is the theme toggle; the sign-in
buttons, fields and success frames are static examples. Reproduce the intended
interactions in React rather than embedding this document in the app.

## Current implementation

- [App.tsx](../../../src/app/App.tsx) owns both entry points: the compact app
  menu has a disabled account row, and the rail footer has an `aria-disabled`
  person button. Both use `navAccountTitle`. The account button is outside
  [RailNav](../../../src/app/RailNav.tsx), so enabling it does not require
  changing destination registration or the rail's overflow algorithm.
- There is no `src/features/account/` implementation. Existing
  [accounts](../../../src/features/accounts/index.ts) owns hosting identities,
  account selection and project access. It is a separate product concern:
  GitOdile sign-in must not connect GitHub, switch gh/glab users or change Git
  identity, credentials, repository access or saved account receipts.
- [AppOverlays.tsx](../../../src/app/AppOverlays.tsx) composes eager overlays.
  [Dialog](../../../src/shared/ui/dialog.tsx) provides the size-s shell, but
  focus management is the caller's responsibility. Reuse `useModalFocus`,
  `usePortalFlyout` and the existing transient toast through the shared UI API.
- Feature styles belong in the eager
  [CSS manifest](../../../src/styles.css); EN/ES dictionaries compose in
  [i18n](../../../src/i18n/index.tsx). Use current tokens and brand assets
  rather than copying the HTML's old palette, fixed miniature window sizes,
  inline styles or embedded mascot paths.

## Surface mapping

| Reference surface | Mock behavior in this task |
| --- | --- |
| Signed-out rail icon and account popover | Enable in development; explain the optional account, show up to three illustrative benefits and the sign-in action. Label this as a demo so future capabilities are not mistaken for delivered features. |
| Waiting dialog | Size s, matching request code, three steps, static reduced-motion treatment, Cancel and Open again. No real browser is launched. |
| Web method choice, email and six-digit code | Keep the supplied frames as reference only. The dev scenario controls stand in for browser completion. No desktop credential fields. |
| Return and brief confirmation | Close waiting, show a transient success toast, replace the person glyph with initials. No native window activation is required for an in-window simulation. |
| Signed-in account popover | Fixture name/email, optional PRO badge, sign out. Plan/billing and account-data rows are visibly unavailable placeholders. |
| Offline / unfinished / expired | Deterministic simulated notices with retry and an equal dismissal path; explain that local work is unaffected. |

This first implementation covers the **desktop part** of the flow. A separate
interactive local web prototype can be scoped later if the method picker and
email-code interaction themselves need validation. It must remain visibly fake
and outside the desktop credential-entry surface. No website or domain
deployment is needed for task 140.

## Proposed feature boundary

Keep the new owner at `src/features/account/` (singular, distinct from hosting
`accounts`). Suggested files are a plan, not mandatory abstraction layers:

- `domain.ts`: a discriminated state union and pure transitions.
- `port.ts`: `AccountPort` for starting, reopening and cancelling a request,
  signing out, reading the current snapshot and subscribing to changes.
- `mockAdapter.ts`: controlled outcomes and timers; no Tauri, network, storage,
  real provider SDK or credentials. Own request identity and timer cleanup.
- `useAccount.ts`: app-scoped controller/subscription lifecycle, with UI
  open/close state separate from session state. Do not key it by repository.
- `AccountControl.tsx`, `AccountPopover.tsx`, `AccountWaitingDialog.tsx` and
  `AccountOverlays.tsx`: presentation and controller callbacks. Export only
  the required composition API from `index.ts`.
- `translations.ts`, `account.css` and focused domain/controller/UI tests.

`App.tsx` composes one controller and forwards the rail and compact-menu actions;
`AppOverlays.tsx` mounts the eager feature overlays inside the existing toast
provider. Keep account workflow logic in the feature. Overlays do not need a
screen descriptor or a new navigation destination. A future actual account
screen would have to register through `src/app/screens.tsx`.

Use the same controller for both entry points. Close the compact menu before
opening the account surface and anchor the popover to a visible control. On
dismissal restore focus to that control, or to the visible app-menu trigger
when its menu row has unmounted. Avoid two active focus traps.

## State and interaction rules

The session starts `signed-out`. Starting sign-in creates an opaque attempt ID,
a presentation code such as `GTDL · 4821`, and `waiting`. Success yields
`signed-in` with fixture identity and optional mock Pro data. A failed attempt
shows `offline`, `unfinished` or `expired` with an actionable notice; cancellation
returns quietly to `signed-out`. Signing out clears the fixture in memory.

The request code is display data, not an authentication token or an email OTP.
Do not treat its format as the future security mechanism. Keep transient
popover/dialog visibility separate from these session states.

- The default demo completes after a short delay with a non-Pro fixture.
  Development controls can hold a request pending or choose success, Pro
  success, offline, unfinished, expiry or cancellation. Keep their labels
  visibly distinct from product actions.
- Reopen preserves the active attempt and its code. In the mock it replays the
  simulated hand-off feedback without opening anything or starting a timer a
  second time.
- Cancel, Escape, X and backdrop dismissal invalidate the attempt and clear its
  timers. Retry starts a fresh attempt/code. Check attempt identity before
  accepting asynchronous results, so an earlier success cannot undo a cancel
  or replace a newer request.
- Release/unmount cleanup removes listeners and timers. React Strict Mode must
  not schedule duplicate completions. Changing projects retains session state;
  an app restart resets it. Do not use localStorage or OS credential storage.
- The real application cannot infer that an arbitrary system-browser tab was
  closed from the proposed callback alone. Call the mock outcome unfinished;
  show “No response received” rather than claim browser-close detection. Real
  timeout/callback behavior belongs to the authentication follow-up.

## Availability and limits

Preserve task 140's existing development-only policy. `import.meta.env.DEV`
selects the mock composition; release builds retain the coming-soon control.
Keep overlays eager within that composition. Inspect the production output to
verify the scenario controls and fixtures are eliminated; do not assume that a
hidden DOM node or a DEV check by itself proves bundle exclusion.

No server, Supabase project, OAuth consent, loopback listener, URL scheme,
permission/capability change or new dependency is required. A mock PRO label
does not enable features or write real entitlement data. Sign-in success uses
`useToast`, not a persisted notification. Reference links such as View Pro and
billing must not navigate to a service that has not been implemented.

The browser return, OS window activation and secure session persistence are
future work under ADR 0016. Its domain, redirect configuration, native owner,
session lifetime and entitlement questions remain open. This analysis does not
verify provider compatibility or make cross-platform authentication claims.

## Implementation sequence

1. Implement domain, typed port and deterministic in-memory adapter; test
   cancellation, reopen, retry and stale completions first.
2. Add the two entry points, signed-out popover and waiting dialog using the
   existing shell, tokens and accessibility primitives.
3. Add success/avatar/sign-out, non-Pro and Pro fixtures, failure notices and
   development scenario controls. Compose CSS/translations and eager overlays.
4. Check development and production behavior, then exercise the running Tauri
   app. Record evidence in task 140; only then mark its criteria complete.

## Validation plan for implementation

- Domain/controller tests with controlled timers: every outcome, cancel through
  every dismissal path, reopen idempotency, retry replacement, late completion,
  listener disposal and Strict Mode behavior.
- UI tests: rail and compact entry, keyboard-only operation, focus restoration,
  request-code rendering, retry/sign-out, unavailable placeholders and release
  coming-soon behavior. Dialog semantics and live announcements must match the
  existing UI conventions.
- Manual Tauri dev: normal and compact widths; light/dark; English/Spanish;
  reduced motion; switching projects while a mock session exists; confirm that
  repositories and hosting connections stay usable and unchanged.
- Run `pnpm run check` as the completion gate. Check the production bundle for
  dev-only fixture/scenario strings. Do not claim macOS/Linux runtime coverage
  from Windows-only validation; browser/focus/credential-store tests wait for
  the real native implementation.

## Planning validation

The analysis is based on local repository code and the supplied HTML; no real
sign-in was attempted. Documentation and aggregate check results for this
planning change are recorded in task 140. The implementation criteria remain
unchecked because the mock has not been built in this change.
