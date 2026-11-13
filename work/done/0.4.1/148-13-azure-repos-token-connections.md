---
id: 148-13
title: Connect Azure Repos Services with organization-scoped PATs
status: done
priority: high
type: feature
areas:
  - credentials
  - frontend
  - platform
created: 2026-10-26
completed: 2026-10-26
parent: "148"
queue:
---

# Goal and approved scope

Requested and approved on 2026-10-26: connect Azure Repos Services using an
organization and personal access token, clone by HTTPS URL, and select the
connection per project for existing fetch/integration/publish workflows.
Use the existing release/0.4.1 branch and shared account/token lifecycle.

# Acceptance criteria

- [x] Add, check and remove native PAT connections with English/Spanish copy,
  masked inputs, cancellation, secure OS storage and explicit expiry guidance.
- [x] Each organization is a stable provider instance on dev.azure.com. Git's
  process-only helper checks the organization path before reading a secret;
  two organizations on the same authority never share credentials implicitly.
- [x] Manual clone supports canonical Azure URLs and encoded project names;
  pasted username-only clone addresses are normalized without retaining secrets.
- [x] Project account selectors use organization boundaries. Existing Git
  credential helpers and SSH work when no account is selected.
- [x] Identity changes, invalid/revoked tokens, wrong organizations/protocols,
  malformed paths and ambiguous Git headers fail closed. No remote-write probe.
- [x] Add native/parser/helper and UI tests, documentation and an ADR.
- [x] Run pnpm run check and exercise the real desktop UI where available.
  Record separately unavailable real Azure/cross-platform qualification.

# Out of scope

Repository discovery, Microsoft browser/Entra login, Azure CLI, legacy
visualstudio.com aliases, self-hosted Azure DevOps Server, pull requests and
pipelines. No global/project Git credential changes or remote token revocation.
PAT scopes: Code Read for reads, Code Read & write for publishing, subject to
organization policies and branch permissions.

# Evidence

Implemented in the shared hosting/token lifecycle with organization-scoped
provider instances, process-only path-aware helpers and disabled Git redirects.
Empty instances stay available to bound projects after token removal; only
empty, readable instances without bindings can free a capacity slot. Metadata
filenames use an org- prefix, including for Windows device names such as con.

Focused native verification: 12 Azure tests pass (organization/URL grammar,
username normalization, identity checks, Basic auth, cancellation, two-scope
helper/header/redirect isolation, metadata, capacity and restart recovery).
Frontend verification includes the organization/token form in English/Spanish,
invalid input, rejected tokens, cancellation, distinct organization selection
and the shared provider menu. The complete frontend suite has passed 155 files
and 1,721 tests, and the production build and Clippy have passed.

Real Windows Tauri UI was exercised through the documented development app:
Integrations → Connect account → Azure Repos, empty/disabled organization state,
entering contoso, the empty masked PAT step and permission/storage guidance,
then Escape cancellation and return to the project. No PAT was entered and no
Azure request or remote mutation was made during this UI check. The app was
closed without a draft to release the executable for Cargo's integration tests.

One aggregate attempt was blocked by the running Windows executable (OS error
5); closing the idle app removed that environmental blocker. A subsequent full
run passed 640 native library tests (one existing ignored test) and both real
Git/binary helper integration tests. The final capacity/recovery correction is
covered by the 12 focused native tests above. The complete final
`pnpm run check` passed after that correction: documentation/release/icon
contracts, frontend architecture, strict TypeScript, all 155 frontend files /
1,721 tests, production build, Rust formatting, Clippy, the full native library
suite and both actual-binary/system-Git credential helper integration tests.
One pre-existing native test remains explicitly ignored by the suite.

Live Azure identity/private clone/fetch/publish and macOS/Linux keychain behavior
were not qualified: no disposable Azure account/PAT or other OS was available.
Tests use local fixtures and temporary Git repositories. No credentials were
copied from the machine, no Git configuration was changed and nothing was
pushed. Durable behavior is recorded in
[ADR 0036](../../../docs/adr/0036-connect-azure-repos-by-organization-and-pat.md),
README, DESIGN and ARCHITECTURE.


# Completion

Completed on 2026-10-26 on release/0.4.1. Implementation and automated/local UI
validation are complete for the approved PAT/manual-URL scope. External Azure
and other-OS qualification remains explicitly unclaimed above. The user requested
a final review and local commit on 2026-10-26; no push, pull request or release
publication is included.


# Icon follow-up (2026-10-26)

At the user's request, replace the temporary cloud with Microsoft's Azure DevOps
Codicon. Its original path and currentColor fill are unchanged; the shared
provider component renders it at 18px. Attribution and CC BY 4.0 provenance are
in [third-party licenses](../../../THIRD_PARTY_LICENSES.md). The real Windows app
was visually checked in Integrations. The complete pnpm run check passed again
(1,721 frontend tests, 641 native library tests with one existing ignored test,
and both actual-binary/system-Git helper tests). No new dependency was added.


# Entry-point follow-up (2026-10-26)

Azure now has an always-visible URL-only tab in Clone, using the shared official
mark, HTTPS guidance and saved-connection picker. Home includes usable Azure
accounts and opens that tab with the selected connection. Both paths avoid
repository discovery; the account picker distinguishes organization scopes.
Focused tests cover Home account projection and handoff, connection retention
in clone planning, invalid addresses and the absence of discovery requests.
The real Windows application was checked for the Azure tab, icon, URL field and
empty-connection state without entering credentials or cloning a project.


# Final review (2026-10-26)

Reviewed the complete pending Azure implementation: organization metadata and
capacity, native identity/token lifecycle, credential-helper reconstruction,
transport guards, clone normalization, typed IPC, Settings, Home/Clone entry
points, account selectors, translations, icon provenance and documentation.

Corrections from review:

- Validate request IDs and honor pre-admission cancellation before capacity
  cleanup can remove an empty organization. Regression coverage retains all
  eight saved organizations on a cancelled or malformed request.
- Exclude organization-scoped providers from generic host-only source checks.
  Malformed Azure paths and unsupported SSH forms stay idle rather than
  triggering an unnecessary read or a misleading unconfirmed-access message.
- Ignore Azure-only redirect-policy settings before parsing them when the
  transfer selects another provider. Unrelated Git configuration must not block
  a GitHub/GitLab/Bitbucket transfer.
- Align the introductory Clone design description with its Azure source tab.

Focused verification passed: 51 frontend cases across account URL parsing,
source checks, clone and Home; all 13 Azure native cases. The completion gate
for this review is `pnpm run check`; its result is recorded in the commit.
The task remains done. Live Azure and macOS/Linux qualification are still
unavailable and are not claimed by the local test suite.
