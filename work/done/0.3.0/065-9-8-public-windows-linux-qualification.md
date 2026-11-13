---
id: 065-9-8
title: Qualify controlled Windows and Linux updater delivery
status: done
priority: high
type: hardening
areas:
  - release
  - platform
  - security
  - documentation
created: 2026-09-11
completed: 2026-09-16
parent: "065-9"
queue:
---

# Goal

Prove the real Tauri updater lifecycle on installed Windows and Linux builds
through a controlled HTTPS feed, while keeping production publication and macOS
disabled until their separate trust and platform gates are complete.

# Context

Child of [epic 065-9](065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
originally assumed a private source repository and a four-target production
matrix. This task amends both assumptions. The maintainer initially decided on
2026-09-11 to make the source repository temporarily public so standard
GitHub-hosted qualification runs do not consume the private-repository minutes
allowance, then decided on 2026-09-12 to keep it public throughout this testing
phase. This publication is an intentional source distribution under the
repository's then-current MIT license: any later visibility change cannot revoke rights to,
or erase copies of, versions already obtained.

The maintainer has a real Windows device and can provide a Linux virtual
machine, but has no macOS device. The closeable initial delivery matrix is
therefore Windows x86-64 NSIS and Linux x86-64 AppImage. Both macOS targets must
remain planned but disabled: they are not qualified, advertised in a feed, or
published as supported packages. Their implementation preparation is retained
for a later independently tracked qualification task. This scoped closure does
not by itself satisfy any parent 1.0.0 criterion that still requires actual
macOS artifacts or runtime evidence. On 2026-09-12 the maintainer kept the
source repository public for GitHub-hosted Actions capacity but narrowed this
task to functional updater validation. Windows Authenticode and general public
production previews moved to task 065-9-9. No SignPath application was
submitted.

# Scope

- Harden the repository for public visibility before any signing or
  publisher credential is configured: pin every third-party Action to an exact
  commit, remove workflow-command injection surfaces, keep tokens read-only by
  default, restrict allowed Actions, protect `main` and `v*` tags, and enable
  the available public-repository security scanning and dependency controls.
- Review the complete reachable Git history and current tree for credentials,
  personal data, private artifacts and unintended strategic disclosure. Record
  the audit without copying suspected values. Require an explicit maintainer
  decision for the existing `work/`, product-strategy and design-critique
  history before changing repository visibility.
- Amend ADR 0010 and the updater/release contracts so source visibility is not
  a security boundary. Keep signing keys, OS certificates, destination tokens,
  protected environments and privileged publication jobs separate from source
  visibility. Update copy and tests that claim the source repository is
  necessarily private.
- Define the currently enabled release and qualification matrix as exactly
  `windows-x86_64` using per-user NSIS and `linux-x86_64` using AppImage.
  Represent `darwin-aarch64` and `darwin-x86_64` as planned and disabled, fail
  closed if either is advertised without real qualification, and create a
  durable follow-up task for macOS signing, notarization, replacement safety
  and installed A-to-B evidence.
- Configure distinct validation and production updater identities with tested
  encrypted recovery, a controlled anonymous-read HTTPS validation origin and
  reviewer-protected GitHub environments. Never place secret values in source,
  task files, workflow inputs, logs or Actions artifacts.
- Preserve the immutable failed `0.2.0-preview.2` / `0.2.0-preview.3` evidence,
  then build and retain the corrected Tauri-signed validation pair
  `0.2.0-preview.4` / `0.2.0-preview.5` from exact tagged `main` commits. Create
  one new controlled non-promoting bundle and exercise the complete installed
  A-to-B and failure matrix on real Windows and Linux environments. Record
  Windows as OS-untrusted during this internal validation; never present it as
  an Authenticode-qualified public download.
- Publish only the fixed validation bundle to the controlled
  `martinezelx/gitodile-validation` GitHub Pages origin. Preserve exact hashes,
  immutable version paths and anonymous HTTPS access without advancing the
  production `preview.json` or creating a stable release.
- Record exact run URLs, tags, full source SHAs, matrix and artifact hashes,
  updater signing identities, installed versions, preservation checks, failure
  results, validation-host commits and anonymous download evidence. Keep the
  broader publication children and epic open wherever task 065-9-9 still owns
  missing production trust evidence.
- Keep the source repository public during this qualification phase. A later
  visibility decision must preserve the already accepted MIT-distribution
  consequences and must not break the separate public validation or release
  hosts.

# Out of scope

- Claiming macOS signing, notarization, installation, replacement safety or
  updater support without real target evidence.
- Declaring GitOdile 1.0.0 ready; task 065-8 and the parent 065 epic retain the
  final product and platform gate.
- Rewriting published Git history merely to make temporary disclosure appear
  reversible, or claiming that returning the repository to private recalls
  existing clones, forks or MIT rights.
- Using self-signed Windows certificates, mocked OS trust, compile-only
  packages, fixture evidence or successful unit tests as substitutes for real
  installed updater evidence. Validation may explicitly defer Authenticode; it
  may not claim that an unsigned installer has Windows publisher trust.
- General public Windows distribution, production preview publication and
  Authenticode qualification; task 065-9-9 owns them.
- Publishing a stable release, changing the stable channel, adding macOS feed
  entries, or weakening signature/admission/recovery behavior to simplify the
  qualification.

# Acceptance criteria

- [ ] The public-readiness audit is recorded and reviewed. No credential,
      certificate, private key, authenticated URL, personal path or unintended
      private artifact is present in any ref made public; accepted strategic
      disclosures and the irrevocable MIT consequence are explicit.
- [ ] Every workflow Action is commit-pinned, untrusted workflow values reach
      shells only through validated environment variables, default permissions
      are read-only, and protected `main`, `v*` tags and credential environments
      prevent an unreviewed contributor from reaching signing or publication.
- [ ] Public-repository Secret Scanning/Push Protection and applicable
      dependency/code scanning are enabled and clean, or any unavailable
      control has an equally explicit recorded mitigation.
- [ ] ADR 0010, architecture, tests and user-facing links no longer rely on
      source privacy. Public source cannot access signing material or the
      destination credential, and pull requests or forks cannot trigger or
      approve a privileged release.
- [ ] The enabled matrix is exactly Windows x86-64 NSIS and Linux x86-64
      AppImage. Both macOS targets are visibly unqualified and absent from
      advertised production feeds/assets, with a separate active or blocked
      follow-up owning their real enablement.
- [ ] Real Tauri-signed `0.2.0-preview.4` and `0.2.0-preview.5` packages exist
      for both enabled targets with complete build provenance and updater
      verification. Windows evidence says `authenticode_deferred` and cannot be
      confused with production trust. The controlled bundle changes no package
      byte and cannot promote a production feed.
- [ ] Real Windows and Linux A-to-B reports prove the running version after
      handoff and preserve settings, sessions, drafts, operations, helpers,
      dirty tracked/untracked files and Git history. Every required failure case
      records no false success and no forced downgrade.
- [ ] The controlled GitHub Pages bundle exposes only immutable validation
      paths, downloads anonymously with recorded hashes and advances only from
      `.4` to `.5`. The failed `.2`/`.3` paths remain byte-for-byte immutable.
      It does not modify `gitodile`, production
      `preview.json` or `stable.json`.
- [ ] A normal Windows NSIS installation updates end to end from `.4` to `.5`
      through GitOdile and truthfully reports the running version after restart.
      The same proof passes on the Linux AppImage environment before functional
      qualification is complete.
- [ ] The qualification registry contains exact schema-valid evidence for only
      the enabled targets and an explicit non-qualified state for macOS.
      Production promotion fails closed for any target not in the reviewed
      enabled matrix and cannot silently drop a required row.
- [ ] Functional evidence closes only the criteria it actually proves.
      Authenticode, destination publication and production preview criteria stay
      open under 065-9-9. `pnpm run check` and `pnpm run check:publication` pass
      on the exact validation commit, with no macOS or 1.0.0 readiness claim.
- [ ] The source repository remains public for this phase; public updater assets
      and feeds stay separate from source visibility and signing authority.

# Dependencies

- 065-9-1 through 065-9-7 and their existing contracts/runbooks.
- Maintainer acceptance of public MIT distribution and the selected
  strategic documentation exposure.
- Separate validation/production updater keys, controlled HTTPS hosting and
  protected GitHub environments. Offline production-key recovery remains a
  prerequisite for public production distribution, not for the disposable
  validation-key exercise.
- A real Windows x86-64 installation environment and a Linux x86-64 VM capable
  of running and replacing the AppImage through the normal desktop flow.

# Implementation notes

The completed second local audit is recorded in
[`docs/release/public-readiness-audit-2026-09-12.md`](../../../docs/release/public-readiness-audit-2026-09-12.md).
It used the checksum-verified Gitleaks 8.30.1 binary over `--all`, reviewed all
5,122 reachable object paths and the current tree, and found no secret or
private artifact requiring history rewrite. `pnpm audit --prod` also reported
no known production vulnerability. The accepted disclosure covers 161 tracked
`work/` files, strategy and critique history, the maintainer's public name and
noreply address, and the irrevocable MIT consequence.

The same preflight identified and the hardening change corrects mutable Action
refs, missing repository-wide SHA enforcement, direct workflow-dispatch input
interpolation, a four-platform publication matrix and insufficient separation
between source-run validation and the destination credential. After public
visibility, restricted Actions with repository-wide SHA enforcement, active
`main`/`v*` rulesets, five reviewer-protected environments, Secret Scanning,
Push Protection, Dependabot and CodeQL were enabled and inspected before any
credential was introduced. The first scans exposed development dependency and
dynamic-regexp findings; these were corrected rather than dismissed. Exact
settings and run links are retained in the public-readiness audit.

Two distinct Tauri updater identities have now been generated for validation
and production, stored only in their corresponding protected environments and
in encrypted CurrentUser-DPAPI recovery copies on the controlled Windows
maintainer machine. Both encrypted copies passed a real restore, fixture-signing
and Rust-verifier test. The separate offline backup required before production
distribution is still missing. The controlled validation host now exists at
`https://martinezelx.github.io/gitodile-validation/065-9-7/updates/preview.json`.
Bundle run
[`34764363010`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34764363010)
published the immutable `.2`/`.3` validation packages and feed at validation
host commit `fbbff79`. Anonymous downloads and their expected hashes were
verified outside an authenticated GitHub session. Windows Authenticode and the
destination-scoped public publisher remain in 065-9-9; installed Linux evidence
is still pending, and the Windows exercise below disqualified this first pair.

Platform-specific Tauri configuration now overrides the unsafe default
`bundle.targets: all`: Windows builds only NSIS, Linux builds only AppImage and
macOS bundling is disabled. This prevents a normal preview `tauri build` on
Windows from entering the unsupported MSI bundler, whose numeric-only
prerelease constraint rejects `0.2.0-preview.N`. A real local
`pnpm tauri build --ci --no-sign` on the `0.2.0-preview.2` version branch
reported exactly one bundle and produced
`GitOdile_0.2.0-preview.2_x64-setup.exe` successfully. The resulting local
package is intentionally unsigned and is build-contract evidence only, not a
substitute for the protected validation-key workflow or installed updater
evidence.

The first protected candidate attempt is retained as failed run
[`34702455447`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34702455447).
Its immutable identity validation passed, but the secretless Windows build
failed before packaging because PowerShell removed the quotes from an inline
JSON `--config` value. No protected signing job ran. The workflow now uses the
checked `src-tauri/tauri.unsigned.conf.json` path on both shells, and executable
tests reject a return to inline JSON configuration.

The corrected candidate run
[`34717984524`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34717984524)
then built the complete unsigned Windows/Linux matrix and passed its independent
hash and provenance gate. Its downstream signing run
[`34718448366`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34718448366)
failed closed before accessing a protected environment: GitHub exposes
`GITHUB_REF_TYPE=branch` to a `workflow_run`, while the revalidation command is
checking the exact candidate tag fetched from the triggering run. The trusted
signing workflow first attempted to supply an explicit `tag` context only to
that step. GitHub does not permit a workflow to override its default
`GITHUB_*` variables, so run
[`34719287176`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34719287176)
also failed closed at the same check even though the step log displayed the
attempted override. The validator therefore accepts a dedicated `--ref-type`
argument: the tag-push workflow passes GitHub's actual ref type, while the
trusted downstream workflow passes `tag` only after fetching the exact tag
recorded by the successful source run. The exact tag, source SHA, approved-main
ancestry, metadata and byte-identical candidate identity remain revalidated
before any signing material is reachable. Executable tests cover both the
valid downstream revalidation and rejection of an explicit non-tag type.

The next exact candidate run
[`34719884465`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34719884465)
passed the complete Windows/Linux build matrix. Signing run
[`34720357070`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34720357070)
then passed source reauthorization and both OS-boundary jobs, and the maintainer
approved only `validation-updater-signing` after independently rehashing the
downloaded matrices. It failed while compiling the repository-owned signature
verifier because that Ubuntu job lacked the GTK/WebKit development packages
required by the Tauri crate; the credential presence guard had passed but no
signed matrix was emitted. The signing job now installs the same pinned-runner
system dependencies used by CI and builds the verifier with Cargo's lockfile
enforced before signing any final bytes.

Candidate run
[`34749564195`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34749564195)
then passed the complete Windows/Linux matrix at exact source
`78d5497c69857aec0505e2cfabb10b8267425884`. Downstream signing run
[`34749958315`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34749958315)
passed source reauthorization and both OS-boundary jobs. The downloaded
unsigned and OS-stage matrices passed local rehashing before the maintainer
approved only `validation-updater-signing`. The verifier compiled successfully,
but the signing loop failed closed before signing because CommonJS `require()`
interpreted the relative `os/.../evidence.json` path returned by `find` as a
package name. The loop now reads and parses that path explicitly through
`node:fs`; an executable workflow-contract assertion prevents the unsafe path
resolution from returning.

The corrected exact candidate run
[`34750914140`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34750914140)
passed the complete Windows/Linux build and provenance matrix at source
`3e8f04fb1ac312b2242eccca896151b4d6ecde73`. Signing run
[`34751381157`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34751381157)
then passed source reauthorization and both OS boundaries. Before approving
`validation-updater-signing`, the exact unsigned and OS-stage artifacts were
downloaded, rehashed and accepted by the repository verifier. The protected
job Tauri-signed both the NSIS package and AppImage with validation updater
identity `sha256-2ee9c46df4787edce38ccbf947056e6af541a5ed5a37f1532857cd6e9115a8fa`,
verified both signatures independently with the Rust verifier, and emitted a
complete signed matrix with `publicPromotionAllowed: false`. The final artifact
was downloaded again and its full matrix and package/signature hashes passed
local verification. Windows remains explicitly `authenticode_deferred`; this
is functional qualification evidence, not a trusted public Windows release.

Candidate run
[`34752710080`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34752710080)
and protected signing run
[`34753158343`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34753158343)
produced and independently verified the corresponding `.3` Windows NSIS and
Linux AppImage packages with the same validation updater identity. Bundle run
`34764363010` combined both signed matrices without changing their bytes and
published `preview.json` for `.3`. Its feed SHA-256 was
`c369633a620db76e976076b95b4eba63971bcc87621dab133e73400ae757679e`.

The real Windows `.2` NSIS was then installed from that controlled host. Opening
the updater caused the installed application to terminate instead of reporting
an update. Windows Error Reporting recorded exception `0xc0000409` and retained
process dumps under `%LOCALAPPDATA%\CrashDumps`. Reproduction from an
instrumented development build located the abort at the bounded manifest
preflight: `reqwest` was compiled with rustls but without a process crypto
provider, and constructing the HTTPS client panicked. Release builds use
`panic=abort`, so this escaped the structured updater error path and terminated
the entire application.

The provisional correction selected reqwest's `rustls` feature and added a
regression test that constructed the duplicate bounded-manifest client. A
correctly packaged local `.3` build (`tauri build --no-bundle`, not a raw Cargo
build) remained alive after a real HTTPS check and returned `current` from the
controlled `.3` feed. That local result isolated the provider failure, but it
is deliberately not accepted as installed A-to-B evidence. The already
published `.2`/`.3` assets remain immutable and disqualified; qualification
requires a fresh signed pair rather than overwriting or relabelling them.

The corrected runtime now has one HTTP authority: the updater plugin's single
`check()` obtains the feed with its configured HTTPS-only client, bounded
timeouts and redirect policy, and GitOdile validates the returned `raw_json`
before accepting the plugin selection. The validator closes the manifest shape
and cross-checks version, notes, publication date, target, URL, signature and
positive bounded size. The GitOdile state machine, cancellation, progress,
consent and preservation admission, install-mode checks, and Tauri-owned
`download()` and `install()` remain intact. The standalone
`fetch_bounded_manifest`, its streaming client and the temporary reqwest rustls
feature were removed; the regenerated lockfile contains no AWS-LC packages.
Executable contract tests require this client-unique architecture and reject a
return to the preflight request.

On 2026-09-13, before creating any new tag, the complete `pnpm run check` gate
passed, including 859 frontend and 399 Rust tests. A real validation-profile
`pnpm exec tauri build --no-bundle` produced the optimized Windows `.4`
executable. That exact executable opened as the only GitOdile instance and
remained responsive. A manual `check_app_update` invoked from its real Tauri
renderer contacted the controlled HTTPS feed, transitioned from the structured
`checking` state to `current` at `2026-09-13T20:55:53.2697159Z`, and left the
process alive. No new Windows Error Reporting dump was created; the newest
existing GitOdile dump remained the earlier `.2`/`.3` investigation artifact
from `2026-09-13T16:45:02.2160761Z`. This clears the local pre-tag gates but is
not installed `.4` to `.5` evidence. The fresh validation pair remains `.4` to
`.5`; `.6` to `.7` remains reserved for the future production-key/AuthentiCode
pair.

Candidate run
[`34782596507`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34782596507)
then built the exact `.4` Windows/Linux unsigned matrix at source
`7ad84078748e324e922e35da2c229e536be139a0` and passed its complete provenance
gate. The downloaded candidate identity and both packages passed an independent
local `verify-matrix` rehash before only `validation-updater-signing` was
approved. Downstream run
[`34783155007`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34783155007)
reauthorized the source and target matrix, retained Windows as
`authenticode_deferred`, Tauri-signed both final packages with the validation
updater identity, verified both signatures through the repository's Rust
verifier, and emitted a non-promoting signed matrix. That final artifact was
downloaded again and passed the complete local signed-matrix verifier. This is
valid `.4` build/signing evidence, not installed A-to-B evidence; `.5`, the
controlled bundle and both real installed transitions were still pending at
that checkpoint.

Candidate run
[`34784539362`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34784539362)
then built the exact `.5` Windows/Linux unsigned matrix at source
`d1b1a5dcb1cc51465abac6cd1c658d346df3e0dc`. Its downloaded artifact passed
the independent unsigned matrix verifier before only
`validation-updater-signing` was approved. Protected signing run
[`34785061690`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34785061690)
passed source reauthorization and both OS boundaries, left production
Authenticode skipped, signed both packages with the validation updater key,
verified the signatures with the Rust verifier and emitted the complete
non-promoting signed matrix. The downloaded result passed the local signed
matrix verifier. CI run
[`34784530104`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34784530104)
and CodeQL run
[`34784530103`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34784530103)
also completed successfully; every job and step was reviewed.

Controlled bundle run
[`34785483772`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34785483772)
verified both signed matrices and produced the fixed `.4` to `.5` bundle with
`publicPromotionAllowed: false`. Its report records signed-matrix hashes
`53a92854eca52f96f039a491333957aed93d87e2c5249ef53695a133a7fb1aee`
and `406e408cf6feeec736bb662a725dfc41dc2d9dee2e34b393a0ee428fe3bbd0d3`.
The bundle was deployed append-only at controlled-host commit
`07ca923e7b942e72efefe72be81f7c6d9f2f1b34`; the earlier `.2`/`.3` packages
and report were rehashed before and after and remained byte-identical. GitHub
Pages deployment `6427063813` succeeded for that exact commit. An anonymous
HTTPS client then downloaded the report, feed, all eight `.4`/`.5` package and
signature files, and both `.5` release destinations. All ten artifacts matched
their expected sizes and SHA-256 values. The deployed feed advertised exactly
Windows x86-64 and Linux x86-64 at `.5` and had SHA-256
`3d2441d977f7ffb6a3bab72d4e2a7c4082c06edaa3de54beb814a0ab7c4b1aae`.

On 2026-09-14 the anonymously downloaded Windows `.4` NSIS, SHA-256
`903513fd82da78b4bd7066645cf2fa6deeb81a6d787a889e49d77309d6607c77`,
was installed normally per-user over the retained failed `.2` installation.
It reported installed version `.4`; all seven encrypted updater-key recovery
files present beside that test installation remained byte-identical. The real
installed `.4` renderer reopened two qualification project sessions on a
physical x86-64 Windows 11 10.0.26200 machine, with a staged change, dirty
tracked changes and untracked files across both projects, an active repository
watcher, a dark-theme preference and an identifiable unsaved version-message
draft. Their HEADs, index trees, porcelain status and file hashes were captured
before the update.

The installed `.4` process used the in-app command path to check the deployed
HTTPS feed and returned a structured `.5` `available` candidate for
`windows-x86_64`, with expected size 2,670,975 bytes, while remaining alive and
responsive. Its in-app download traversed `downloading` to `ready`; Tauri's
signature verification accepted the payload. After the explicit second user
confirmation, GitOdile installed through the official Tauri updater and
restarted. The installed executable independently reported
`0.2.0-preview.5`, the UI showed that same running version, and
`get_startup_update_confirmation` returned structured `confirmed` for `.5`.
Both project sessions reopened. Their HEADs, index trees, staged/unstaged and
untracked status, and every sentinel file hash were unchanged. The volatile
version-message draft reopened editable with its exact title and description,
and the theme preference remained dark. The process stayed responsive and no
new Windows Error Reporting dump appeared; the newest dump remained the failed
`.2` evidence from 2026-09-13 16:45:02 UTC. Windows correctly reports these
validation binaries as not Authenticode-signed, so this proves the installed
functional happy path only, not publisher trust.

The Windows failure matrix and the real Linux AppImage installed transition
remain outstanding. Consequently both enabled targets and the overall
validation qualification deliberately remain `qualification_required`, and
production promotion remains disabled.

# Validation

Record the public-readiness diff and local checks first, without spending or
claiming release evidence. For the completed task, retain the exact security
settings snapshot, signed run and artifact identities, Windows/Linux installed
reports, controlled-host commit and anonymous hash verification, and complete
`pnpm run check` plus
`pnpm run check:publication` results.

# Closure

Closed on 2026-09-16 when the updater epic was wound down: the code,
pipeline and contracts this task describes are on `main` and were
exercised by the public previews `0.2.0-preview.10` to `.12`. The
criteria left unchecked above are not claimed; the public-repository controls, the real Windows/Linux A-to-B reports and the registry evidence
moved to [065-9-13](../../0.7.0/065-9-13-updater-evidence-and-os-signing.md),
which owns everything the updater still has to prove.
