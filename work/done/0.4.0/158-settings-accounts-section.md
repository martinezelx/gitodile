---
id: 158
title: One Accounts section in Settings for every provider
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
  - ux
created: 2026-10-10
completed: 2026-10-11
parent:
queue:
---

# Goal

Replace Settings' three provider sections (GitHub, GitLab, Bitbucket) with one
**Accounts** section: every connected account in one list, one way to connect
another for any provider, and a folded block per provider for what only that
provider has. Home's **+** for another account lands there.

# User outcome

Someone with a GitHub and a GitLab account no longer hunts through two rail
entries to see what is connected, and Home's **+** no longer drops a GitLab or
Bitbucket user on the GitHub page. The provider CLIs stay out of the way while
they are not needed, and come forward the moment they block a connection or
ask for a look.

# Context

Home's "connect another account" opened `openSettings("github")`, biased to
GitHub. The rail had twelve entries, three of them providers. Each provider
section rendered its own account list, so the same catalog was read three
times by three components that did not see each other's changes.

The direction was chosen from an interactive canvas comparing a single list
with folded provider blocks (A) against a provider selector with tabs (B); A
was approved. A follow-up review asked whether the gh/glab tooling should move
to a section of its own; the answer was to keep it in its provider's block and
surface it where it matters, from a second canvas row.

# Scope

- `SETTINGS_SECTIONS`: `github`, `gitlab`, `bitbucket` become `accounts`,
  labelled Accounts with the `UsersRound` glyph.
- `hosting-servers` owns `AccountsSettings` (replacing
  `ProviderConnectionsSettings` and Bitbucket's `BitbucketConnectionsSettings`):
  - **Connected accounts**: one list grouped by host for github.com,
    gitlab.com, bitbucket.org and each company server, over one shared catalog
    read; hosts with nothing connected or in progress fold away; one empty
    note when nothing is connected.
  - One account check covering every product (`useAccounts.check` accepts a
    list and runs it under one pending state).
  - **Connect account** menu (GitHub, GitLab, Bitbucket, each with how it
    connects) opening the existing connect panel, now titled with the
    provider; Bitbucket's panel is the token form alone.
  - **By provider**: a folded block per provider with a one-line summary;
    GitHub and GitLab hold their company-server inventory and CLI group,
    Bitbucket explains its API tokens. A body stays mounted once opened.
- Home's **+** opens Accounts with the provider menu open and focused, once;
  account chips open Accounts.
- Provider CLIs surfaced where they matter:
  - The browser method of the connect panel, with the CLI not ready, says so
    and shows the CLI's own installation row (`GhToolingSection`
    `variant="inline"`).
  - `toolAttention` (settings domain): a CLI that does not answer, or has a
    known update, puts a chip on its folded block and a badge on the Accounts
    rail entry; not being installed asks for nothing.
  - A block with attention opens on arrival or when the answer arrives,
    unless the reader already toggled it; it never folds by itself.
- Settings renders the CLI rows and hands them to the section through an
  `accounts` render slot that App fills.

# Out of scope

- Merging the Git installation into a general tools section.
- Checking provider CLI updates automatically; an update is known only after
  an explicit check, as before.
- Changing account rows, token forms, browser flows or any native command.

# Acceptance criteria

- [x] Settings shows one Accounts entry instead of GitHub, GitLab and Bitbucket.
- [x] Every provider's accounts appear in one list grouped by host; empty hosts are not drawn.
- [x] One check action checks every product shown.
- [x] Connect account offers each provider and opens the right panel; Escape closes the menu without closing Settings, and focus returns to the trigger.
- [x] Home's + opens Accounts with the menu open; a later visit opens it closed.
- [x] Provider blocks fold behind a summary and keep a half-typed server address while folded.
- [x] The browser method without the CLI shows the CLI's install row inside the panel.
- [x] A CLI that does not answer or has an update marks its block and the rail, and opens the block unless the reader toggled it.
- [x] English and Spanish copy; README, DESIGN.md and ARCHITECTURE.md describe the section.
- [x] `pnpm run check` run and recorded.

# Relevant files

- [Accounts section](../../../src/features/hosting-servers/AccountsSettings.tsx)
- [Its tests](../../../src/features/hosting-servers/AccountsSettings.test.tsx)
- [Shared account catalog](../../../src/features/accounts/useAccounts.ts)
- [Settings panel](../../../src/features/settings/SettingsPanel.tsx)
- [CLI tooling group](../../../src/features/settings/GhToolingSection.tsx)
- [Settings domain](../../../src/features/settings/domain.ts)
- [Overlays composition](../../../src/app/AppOverlays.tsx)
- [Bitbucket token copy](../../../src/features/bitbucket/tokenCopy.ts)

# Dependencies

None.

# Decisions

- **One list, folded provider blocks** (canvas option A) over a provider tab
  selector: what is connected is visible at a glance, and provider-only detail
  stays folded.
- **The account list keeps every row's actions.** Rows are the existing
  token/gh/glab components grouped by host, rather than a read-only summary
  that sends the reader to the provider block to act.
- **CLIs stay in their provider's block.** They only serve the browser method;
  a separate tools section would split that relationship and compete with the
  Git section. They come forward instead where they block or need a look.
- **Not installed is not an alarm.** The CLIs are optional; only a CLI that is
  there and does not answer, or has a known update, raises a chip or badge. A
  CLI problem uses the warning tone, not Git's alarm, because it degrades one
  way of connecting rather than the app.
- **Blocks open by themselves but never close by themselves**, so an update
  finishing does not move the page under the reader.
- **The tooling arrives through a render slot** from Settings, keeping
  `GhToolingSection` private to the settings feature and the section free of a
  settings dependency.

# Implementation notes

- `ProviderConnectionsSettings.tsx` was renamed to `AccountsSettings.tsx` and
  rebuilt around one `useAccounts` read; its host rows, server browsers,
  add-account panel and company-server inventory are kept. The connect request
  and check nonce moved up so the shared list can start a company server's
  browser login.
- Empty hosts fold through
  `.hosting-accounts__host:has(> .hosting-accounts__list:empty)`, because the gh
  and glab bodies decide for themselves whether they have anything to show.
- The provider menu is an `.app-menu` anchored with `useAnchoredPopup`; it
  stops Escape in the capture phase so the Settings dialog's document listener
  never sees it.
- `BitbucketConnectionsSettings` is gone; its copy hook moved to
  `bitbucket/tokenCopy.ts` and its tests into `AccountsSettings.test.tsx`.
- The CLI's user-facing name comes from the tooling copy ("GitHub tool"), so
  the section never says "GitHub CLI" where the rest of Settings does not.
- Review fixes before committing: the rail's attention value is keyed on the
  GitLab tool's name rather than its copy object (new every render), so the
  memoized rail does not redraw on every keystroke; the provider menu items and
  block heads carry a space between name and description so their accessible
  names do not run together; and the shared dialog focus trap
  (`getFocusableElements`) now skips controls inside a hidden ancestor, which a
  folded provider block keeps mounted.

# Validation

- `pnpm run check`, 2026-10-11 (final run): documentation, frontend architecture,
  TypeScript, Vitest (139 files, 1414 tests) and the production build passed;
  `cargo fmt --check` and Clippy passed. `cargo test --all-targets` could not
  start because the running development app held `src-tauri/target/debug/gitodile.exe`
  (`Acceso denegado`, os error 5); no Rust file changed. On 2026-10-10
  `cargo test --lib --all-features` passed 582 tests (1 ignored).
- Checked in the built-in browser from a throwaway fixture page (removed): the
  unified list, the open provider menu, the Bitbucket panel, an opened GitHub
  block, the browser method's inline CLI row and a GitLab block opened by an
  update.
