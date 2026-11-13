---
id: 065-9-10
title: Prepare releases automatically after approved version-branch merges
status: done
priority: high
type: feature
areas:
  - release
  - automation
  - security
  - documentation
created: 2026-09-13
completed: 2026-09-16
parent: "065-9"
queue:
---

# Goal

Consolidate GitOdile into one source repository and one public product
repository, then start the appropriate release preparation automatically when
an explicitly named version branch is merged into protected `main`, without
making an unreviewed merge equivalent to production publication.

# Context

The controlled `.2` to `.3` qualification deliberately keeps tagging and
publication explicit so the first real pipeline can be observed gate by gate.
After that path is proven, the maintainer wants merges from recognized preview
or release branches to initiate the same hardened candidate workflow.

On 2026-09-14 the maintainer selected the durable repository names:

- `martinezelx/gitodile-desktop` owns application source, tests, documentation,
  candidate builds and release automation.
- `martinezelx/gitodile` is the public product home and owns downloads, GitHub
  Releases, updater feeds and issues.

`project-gitodile` and `gitodile-feedback` are temporary names. GitHub's rename
redirects are a migration aid, not a permanent runtime dependency. The
controlled `gitodile-validation` host receives no new versions; its immutable
`.2`/`.3` and `.4`/`.5` qualification evidence must be retained until 065-9-8
is closed and only then archived or removed through a separately reviewed
evidence-retention step.

## Version-branch contract

The only release-triggering source branch form is `release/<version>`, where
`<version>` is the exact canonical SemVer stored in every version-bearing file:

- preview example: `release/0.2.0-preview.10`;
- stable example: `release/1.0.0`.

Forms such as `0.2.0preview.10`, `release/v0.2.0-preview.10`, arbitrary feature
branches and direct pushes to `main` do not trigger a release. The `v` prefix
belongs only to the generated tag, for example `v0.2.0-preview.10`.

The version branch may change only reviewed release preparation: synchronized
version metadata, curated notes and deliberate release configuration. It enters
`main` through a pull request with required checks. The automation consumes the
closed-and-merged event from the same repository, verifies the exact protected-
`main` merge SHA and successful required checks, and creates the tag only when
branch, metadata, notes and derived channel agree.

# Scope

- Rename `project-gitodile` to `gitodile-desktop` and `gitodile-feedback` to
  `gitodile`; update local remotes, repository rules, environments, GitHub App
  or token scope, Actions variables, badges, source/support/download links,
  feed endpoints, updater capabilities, tests and runbooks to their canonical
  destinations.
- Make the public `gitodile` README clearly identify it as the product download,
  releases and issue hub and link to `gitodile-desktop` as the source repository.
- Define and enforce the `release/<canonical-semver>` branch contract for both
  preview and stable candidates.
- On a closed, merged pull request, bind the merge commit, source branch,
  same-repository identity, version metadata, curated notes, required-check
  result and expected channel before creating any tag.
- Run the tag-creation logic only from workflow code already present on the
  protected default branch. Never check out or execute pull-request-head code
  with a token that can create tags or write another repository.
- Reuse the protected candidate, signing and publication gates; do not copy or
  bypass their authorization logic.
- Make retries idempotent and reject an existing tag that identifies different
  bytes.
- Let a valid generated tag start Windows and Linux candidate builds
  automatically. Keep cross-repository publication as a later promotion that
  consumes only verified build/signing evidence.
- Keep production publication behind its protected environment approval and
  destination-scoped credential.
- Preserve macOS as disabled through `1.0.0` and until its post-1.0 independent
  qualification is complete.
- Preserve the honest `authenticode_deferred` state for pre-1.0 and initial
  1.0 Windows releases; automation must not imply OS-level publisher trust.

# Acceptance criteria

- [x] The canonical repositories are exactly `martinezelx/gitodile-desktop`
      and `martinezelx/gitodile`; every runtime URL, workflow assertion,
      credential scope and user-facing link uses the new names without relying
      on GitHub redirects.
- [ ] The public product repository contains issues, immutable GitHub Release
      assets and `preview.json`/`stable.json`, but no application build job or
      application signing authority. The source repository cannot publish with
      its ordinary `GITHUB_TOKEN`.
- [x] Existing source history, rulesets, required checks, environments, release
      evidence and issue content survive the rename and are independently
      checked before old URLs are treated as obsolete.
- [ ] A merged recognized preview branch starts one candidate preparation for
      the exact protected-main merge commit and matching prerelease version.
- [ ] A merged recognized release branch starts the intended release
      preparation only when stable metadata and policy permit it.
- [x] Closed-but-unmerged pull requests, forks, renamed branches, version
      mismatches, missing notes, failed required checks, direct pushes and
      unrecognized branches fail closed without creating tags or releases.
- [x] Privileged tag creation does not execute code from the version branch or
      use pull-request-controlled commands, paths, environment names, artifact
      names or destination repository values.
- [x] Re-delivery and retries are idempotent; an existing mismatched tag or
      asset is never overwritten.
- [x] Signing and publication still require their existing protected
      environments, matrix checks and exact provenance.
- [x] Executable tests cover preview, release and every rejected event shape,
      and `pnpm run check` plus `pnpm run check:publication` pass.

# Dependencies

- [065-9-8](065-9-8-public-windows-linux-qualification.md) and the publication
  contracts needed for unsigned-but-Tauri-authenticated Windows/Linux releases.

Implementation and simulated end-to-end tests may proceed before the remaining
Linux VM qualification. Real production feed promotion and closure of this task
still require every enabled target to satisfy the qualification registry.

Task 065-9-9 is deliberately post-1.0 and does not block this automation.

# Current implementation baseline

- Starting commit: `a13cbc43b3d9848880a3f9d7b07034418fef884b` on `main`, equal
  to `origin/main` when this execution specification was finalized.
- Current application version: `0.2.0-preview.5`.
- Existing workflows are manual/tag-oriented and named
  `private-candidate-build.yml`, `private-candidate-signing.yml`,
  `qualification-validation-bundle.yml` and
  `public-release-publishing.yml`.
- Existing release logic lives under `scripts/release/`; extend its pure,
  executable validators rather than embedding policy in workflow YAML.
- The production updater key exists, but Windows Authenticode is deliberately
  deferred through `1.0.0`. The remaining real Linux qualification is not
  evidence this task may fabricate.
- At this baseline the repository renames had not yet been performed. They were
  completed on 2026-09-14 and are recorded below; this statement is retained
  only to distinguish the starting state from the implementation evidence.

# Implementation sequence

1. Inventory both live repositories, rulesets, environments, variables,
   secrets by name, issue settings, Pages/releases, current remotes and all old
   repository-name references. Save a non-secret before-state report.
2. Add pure parsers and tests for canonical `release/<version>` branches,
   preview/stable channel derivation, same-repository merged-PR events, exact
   merge SHA binding and idempotent tag decisions.
3. Add `pnpm run release:prepare -- <version>`. It must start from a clean,
   current `main`, create `release/<version>`, update every authoritative
   version file through one implementation, create a curated-notes template,
   and finish by running consistency checks. It must never push or publish.
4. Add the least-privileged merged-PR coordinator. It reads only workflow code
   from protected `main`, rejects untrusted event data before granting write
   authority, creates `v<version>` at the exact merge SHA and treats a matching
   existing tag as a successful retry while rejecting any mismatch.
5. Chain the generated tag into the existing candidate build, Tauri signing,
   evidence and publication workflows. Build once per platform; pass immutable
   artifacts and verified metadata forward rather than rebuilding later.
6. Rename the public product repository to `gitodile`, then the source
   repository to `gitodile-desktop`. Immediately update the local remote and
   all canonical URLs, rules, environments, application capabilities, tests and
   cross-repository credential scopes. Verify both repositories anonymously
   and through the GitHub API after each rename.
7. Provide a non-promoting end-to-end dry run and negative-event fixtures.
   Publish previews automatically after the protected merge, while preserving
   protected approval always for stable publication. Do not enable stable or
   macOS publication in this task.
8. Run `pnpm run check` and `pnpm run check:publication`, inspect every Actions
   run caused by the migration, and correct failures without weakening gates.
   Record exact commits, runs, repository settings and remaining Linux blocker.

# Developer release experience

After this task, the maintainer's normal preview operation is:

```powershell
git switch main
git pull --ff-only
pnpm run release:prepare -- 0.2.0-preview.10
@'
# GitOdile 0.2.0-preview.10

Describe the reviewed user-visible changes here.
'@ | Set-Content docs/release/notes/v0.2.0-preview.10.md
git add README.md package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json docs/release/notes/v0.2.0-preview.10.md
git commit -m "chore(release): prepare 0.2.0-preview.10"
git push -u origin release/0.2.0-preview.10
```

The maintainer replaces and reviews the generated notes before committing,
opens the pull request, waits for
required checks and merges it. Tag
creation, Windows/Linux candidate builds, Tauri signing, evidence assembly,
publication to `martinezelx/gitodile`, feed promotion and anonymous
post-publication verification then run automatically without another maintainer
step. Stable approval remains mandatory.

# Explicit safety invariants

- A branch name, commit message, PR title or version file alone grants no
  release authority.
- Direct pushes and manually created tags do not enter the merge-driven path.
- Privileged jobs never execute pull-request-head scripts or interpolate
  untrusted event strings into a shell command.
- The ordinary source-repository token cannot write `martinezelx/gitodile`.
- Build jobs cannot access the destination publisher credential; publisher jobs
  cannot rebuild or alter packages.
- Tags, finalized release assets and versioned feed inputs are append-only.
- Preview cannot update stable; stable cannot relabel or overwrite a preview.
- Windows remains `authenticode_deferred`, Linux retains its real qualification
  gate, and both macOS targets remain rejected.
- No secret value is printed, copied into an artifact or requested from the
  maintainer in chat.

# Validation

Retain the merged pull-request event, exact merge SHA, generated tag identity,
candidate/signing run links, repository rename audit, canonical endpoint checks
and rejection-test output. Exercise a preview through a non-promoting or
reviewer-approved dry run before enabling normal publication. Do not use this
task to publish a stable release or any macOS artifact.

## Implementation evidence — 2026-09-14

- The source repository retained ID `1309817886` through its rename to
  `martinezelx/gitodile-desktop`; the product hub retained ID `1355852393`
  through its rename to `martinezelx/gitodile`. Local `origin` now points
  directly at the canonical source URL. The detailed before/after inventory is
  in
  [`repository-migration-audit-2026-09-14.md`](../../../docs/release/repository-migration-audit-2026-09-14.md).
- Public-hub commits `35788572b95194990eafe0daf12c373ae21ce569`
  through `f231076b65484c21307a7ab770ebd02b249bfe61` migrated the README,
  security policy and four bilingual issue forms. The public tree contains no
  old repository path, no workflow and no build/signing authority.
- Source commit `55779ab764d3b32ca08f924c42b255300bf53aa2`
  implements `release:prepare`, the pure merged-PR/check/scope/tag validators,
  the default-branch coordinator, explicit candidate dispatch, deferred
  Windows Authenticode evidence and automatic protected publication.
- Ruleset `22979731` still blocks creation, update and deletion of `v*`. Deploy
  key `163232356` is its narrowly scoped tag bypass and its private half exists
  only as the `GITODILE_RELEASE_TAG_DEPLOY_KEY` secret in the protected-branch
  `release-tagging` environment. The ordinary workflow token remains read-only.
- `pnpm run check` passed with 859 frontend tests and 399 Rust tests, plus
  documentation, app-update contracts, architecture, TypeScript, frontend
  build, Rust format and Clippy. `pnpm run check:publication` repeated that
  complete gate and verified the live public settings/forms at
  `f231076b65484c21307a7ab770ebd02b249bfe61`; planned download guidance was
  valid and idempotent. The release-specific suite passed 34 tests, including
  preview/stable preparation, every rejected event class, byte-bound
  authorization, tag/asset conflicts and fail-closed qualification.
- The push of `55779ab` caused only CI run
  [`34854452160`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34854452160)
  and CodeQL run
  [`34854452332`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34854452332).
  Both completed successfully, including all seven CI jobs and the CodeQL
  JavaScript/TypeScript analysis. The push caused no candidate, signing or
  publication run, proving a direct `main` push does not enter the merge-driven
  release path.
- Anonymous checks returned HTTP 200 for both canonical repositories and the
  empty Releases API. `preview.json` and `stable.json` correctly remain 404;
  no release or feed was fabricated while production is disabled.
- `martinezelx/gitodile-validation` remains unchanged at
  `07ca923e7b942e72efefe72be81f7c6d9f2f1b34`; its Pages source is still
  `main` `/` and built. No `.2`/`.3` or `.4`/`.5` evidence was moved or
  overwritten.

## Gates still open

### 2026-09-14 downloadable preview policy

- The maintainer clarified that the immediate development path must publish
  manual-test builds before platform qualification is complete. Automatic
  publication now derives the narrow `preview-testing` mode for production-
  Tauri-signed preview candidates: it creates a GitHub prerelease, uploads only
  the Windows x86-64 NSIS package and Linux x86-64 AppImage, and advances only
  `preview.json` automatically after a protected merge.
- `preview-testing` records an empty qualified-target set. Production-key
  preview packages nevertheless use the separate canonical preview test target
  route so real installed updates can be exercised without claiming
  qualification. It does not change the qualification
  registry, satisfy Linux A-to-B evidence, claim Windows OS trust, or authorize
  stable. Windows remains `authenticode_deferred`; macOS assets and targets are
  rejected.
- `pnpm run check` and `pnpm run check:publication` both passed after this
  policy change: 36 release tests, 859 frontend tests and 399 Rust tests, plus
  documentation/contracts, architecture, TypeScript, frontend build, Rust fmt
  and Clippy. The publication gate again verified the live public repository
  settings and idempotent download guidance at `f231076b65484c21307a7ab770ebd02b249bfe61`.
- Commit `fc6c3ec14c3e8492f41b615f2202224057dca781` contains the policy and was
  pushed to canonical `main`. Its CI run
  [`34859130372`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34859130372)
  passed all seven jobs, and CodeQL run
  [`34859130654`](https://github.com/martinezelx/gitodile-desktop/actions/runs/34859130654)
  passed. Neither direct-push run entered candidate build, signing or public
  publication.

- No real `release/<version>` pull request was merged merely to test the
  coordinator, because that would permanently advance application metadata and
  create a release tag. The two acceptance criteria requiring observed preview
  and stable merges remain open until genuine releases exercise them.
- The public hub intentionally has no Release assets or channel feeds yet.
  Windows failure-matrix completion and the real Linux AppImage A-to-B result
  still keep both targets `qualification_required` and
  `productionPromotion.enabled` false.
- The destination-scoped `GITODILE_PUBLIC_RELEASE_TOKEN` is configured in
  `public-release-production`; its value was never read or copied. On
  2026-09-14, preview signing and publication environments were restricted to
  protected branches but changed to require no reviewer, while the new
  `public-release-stable` environment retained maintainer review with no
  administrator bypass. Stable remains disabled and additionally fails closed
  until its separately scoped secret is deliberately provisioned.
- macOS remains disabled. Windows evidence remains
  `authenticode_deferred` through `1.0.0`; neither limitation is represented as
  successful OS trust.

# Fresh-session execution prompt

```text
Continúa GitOdile implementando íntegramente la tarea 065-9-10:

C:\workspace\project-gitodile\work\active\app-updates\065-9-10-merge-driven-release-preparation.md

Trabaja directamente en C:\workspace\project-gitodile, rama main. Sigue
AGENTS.md y lee completos README.md, DESIGN.md, docs/PRODUCT_STRATEGY.md, los
ADR 0010 y 0011, y los runbooks de release referenciados por la tarea antes de
modificar nada. El baseline al preparar este prompt era el commit
a13cbc43b3d9848880a3f9d7b07034418fef884b, coincidente con origin/main; empieza
comprobando git status, HEAD/origin/main y cambios posteriores, y conserva
cualquier cambio legítimo que encuentres.

La decisión cerrada es mantener exactamente dos repositorios operativos:
martinezelx/gitodile-desktop para código/builds/automatización y
martinezelx/gitodile para issues, releases, descargas y feeds. Los nombres
project-gitodile y gitodile-feedback deben migrarse dentro de esta tarea. El
host gitodile-validation no recibirá versiones nuevas; no modifiques, muevas ni
sobrescribas su evidencia inmutable .2/.3 y .4/.5.

Implementa el comando `pnpm run release:prepare -- <semver>` y el flujo seguro
descrito en la tarea. La única rama válida es `release/<semver>`; por ejemplo,
`release/0.2.0-preview.10`. Tras una PR del mismo repositorio, checks verdes y
merge en main, crea idempotentemente `v<semver>` en el merge SHA exacto y
encadena automáticamente build Windows/Linux, firma Tauri, evidencia,
promoción protegida, publicación en martinezelx/gitodile, actualización del
feed correcto y verificación anónima. El código privilegiado debe proceder de
main y nunca ejecutar código de la rama con permisos de escritura.

Windows continúa sin Authenticode y debe registrar
`authenticode_deferred`; macOS sigue deshabilitado hasta post-1.0. La prueba
real Linux pendiente no impide implementar y validar la automatización, pero sí
impide declarar su cualificación o cerrar criterios que dependan de ella. No
publiques stable ni artefactos macOS. Publica previews automáticamente después
del merge protegido y mantén aprobación protegida siempre para stable.

Haz todas las operaciones posibles, incluidas las migraciones GitHub y la
actualización del remoto local, sin pedir secretos ni mostrarlos. Pide
intervención solo para una aprobación protegida o interacción realmente
imprescindible. Verifica cada cambio con tests ejecutables, `pnpm run check` y
`pnpm run check:publication`; revisa todas las ejecuciones de Actions causadas
por el cambio y corrige sus fallos sin debilitar controles. Actualiza la tarea
con commits, runs y evidencia real, y pushea los cambios necesarios a main.
```

# Closure

Closed on 2026-09-16 when the updater epic was wound down: the code,
pipeline and contracts this task describes are on `main` and were
exercised by the public previews `0.2.0-preview.10` to `.12`. The
criteria left unchecked above are not claimed; the three open criteria about the public repository's authority split and the first stable preparation
moved to [065-9-13](../../0.7.0/065-9-13-updater-evidence-and-os-signing.md),
which owns everything the updater still has to prove.
