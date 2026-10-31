---
id: 065-9-6
title: Publish public releases and stable preview feeds
status: done
priority: high
type: feature
areas:
  - release
  - platform
  - security
created: 2026-09-03
completed: 2026-09-16
parent: "065-9"
queue:
---

# Goal

Publish complete signed artifacts to the feedback repository and advance channel feeds safely.

# Context

Child of [epic 065-9](065-9-signed-application-updates.md).
[ADR 0010](../../../docs/adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the accepted architecture. Execute in queue order on the approved version branch.

# Scope

- Implement one serialized publication coordinator using destination-scoped credentials, curated notes and public tags pointing only to public commits.
- Publish immutable version-specific assets and archived latest.json; verify every required download anonymously before promoting stable.json or preview.json.
- Derive prerelease status from the validated version. Preview changes only preview; stable may advance preview only if newer. Never relabel a preview binary as stable.
- Make retries and interrupted/overlapping publication safe: validate finalized assets, prevent feed regression and publish complete manifests only after the full matrix succeeds.
- Update public feedback download guidance while preserving issue-form IDs and the task 108 contract; document caching, withdrawal, retained installers and maintainer recovery.

# Out of scope

Custom update servers, rollout percentages and issuing a 1.0.0 readiness claim.

# Acceptance criteria

- [ ] No credential, signing artifact or source archive is published, and public tags reference the public repository.
- [ ] Partial matrix, anonymous-download failure, interrupted retry and concurrent release cases cannot expose an incomplete/regressed feed or overwrite finalized assets.
- [ ] Manifest versions, URLs, signatures, target entries and GitHub flags match verified artifacts; both channels follow ADR 0010.
- [ ] Publication and feed promotion are gated on qualification from 065-9-7; validation/draft publication can run earlier without promoting production feeds.
- [ ] Public feedback contract and pnpm run check:publication pass before actual publication.

# Dependencies

065-9-5 signed artifacts. Production promotion additionally requires 065-9-7 qualification; implement and test the publisher before that gate.

# Implementation notes

Implemented the locally verifiable publication boundary on 2026-09-11. The task
remains active: 065-9-5 has no real signed matrix, 065-9-7 has qualified no
target, no destination credential/protected publication environment is
evidenced, working-name clearance is absent, and the public repository has not
been changed. Consequently no production or validation release was created and
no channel feed was advanced.

- `.github/workflows/public-release-publishing.yml` is manual-only and globally
  serialized for the destination. Its unprivileged job consumes one successful
  private signing run, runs `check:publication`, rehashes the complete signed
  matrix and stages only publishable bytes. The destination-token job has no
  source checkout and cannot compile or sign.
- `scripts/release/public-release.mjs` validates immutable matrix/provenance,
  updater/OS/notary evidence, curated bounded notes, version/channel/GitHub flag
  agreement and the explicit qualification registry. It produces versioned
  packages/signatures, archived `latest.json`, `SHA256SUMS`, license and notices.
- `scripts/release/github-publication.mjs` reconciles interrupted drafts without
  replacing bytes, rejects unexpected or conflicting finalized assets,
  anonymously rehashes every finalized download before promotion, prevents
  equal-version conflicts and older feed regression, and changes all selected
  feeds plus README guidance in one compare-and-swap public commit.
- `validation-draft` accepts only the fixed distinct-key A/B versions and can
  neither finalize nor write feeds. `production` accepts only a production
  signing profile and requires every target plus release/name approval from
  `docs/release/update-target-qualifications.json`. That registry currently
  records Windows/Linux as `qualification_required`, macOS as
  `planned_disabled`, and production disabled.
- Retry, raw-cache, withdrawal, retained-installer, credential and recovery
  procedures live in the
  [public publishing runbook](../../../docs/release/public-publishing.md).
  065-9-7 retains exclusive ownership of real A-to-B evidence and target
  enablement; this task added only the schema/gate it must satisfy.

The unchecked acceptance criteria require external evidence: a real public tag
and draft/final release, anonymous package downloads, destination README/feed
commits, and a qualified signed matrix. Local fixtures deliberately do not
stand in for those observations.

# Validation

Local validation on 2026-09-11 covers 21 release tests: ten public publisher
cases plus the eleven private-pipeline cases. Positive cases build complete
preview/stable manifests, preserve version-specific URLs, promote preview and
stable according to SemVer, update feedback guidance idempotently, and
reconcile missing draft assets. Negative cases reject validation/production
profile confusion, zero/partial qualification, mixed provenance, incomplete
matrices, tampered packages, finalized missing assets, byte conflicts,
unexpected assets, failed source runs, feed regression and automatic workflow
triggers. All three release workflows parse as YAML and every external action
is commit-pinned.

`pnpm run check:publication` passed: 358 Markdown files / 153 task IDs, 21
release tests, 377 architecture modules, TypeScript, 85 frontend test files /
859 tests, the production build, Rust formatting and Clippy, 396 Rust tests,
and the live feedback repository at public commit
`f8420b8e402558a7b04e19cf807608100806d1a0`. The publication variant also
validated the planned bilingual README transformation without writing it.
No local test claims a real signature, OS trust, notarization, anonymous
production download or public write.

# Closure

Closed on 2026-09-16 when the updater epic was wound down: the code,
pipeline and contracts this task describes are on `main` and were
exercised by the public previews `0.2.0-preview.10` to `.12`. The
criteria left unchecked above are not claimed; the publisher-evidence criteria (immutable assets, retries, anonymous downloads, qualification-gated promotion, `check:publication` before a real publication)
moved to [065-9-13](../../0.7.0/065-9-13-updater-evidence-and-os-signing.md),
which owns everything the updater still has to prove.
