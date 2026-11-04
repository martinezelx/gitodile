import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { REQUIRED_RELEASE_CHECKS } from "./merge-release.mjs";
import {
  ReleaseValidationError,
  parseReleaseTag,
  runCandidateCli,
  validateReleaseCandidate,
} from "./release-candidate.mjs";
import {
  createEvidence,
  requireCredentials,
  verifyCompleteMatrix,
  verifyArtifactShape,
  verifyEvidenceArtifacts,
} from "./release-evidence.mjs";
import { tempDir } from "./test-temp.mjs";

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function writeMetadata(root, version, overrides = {}) {
  const versions = {
    package: version,
    cargo: version,
    lock: version,
    tauri: version,
    ...overrides,
  };
  fs.mkdirSync(path.join(root, "src-tauri"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: versions.package }));
  fs.writeFileSync(path.join(root, "src-tauri", "Cargo.toml"), `[package]\nname = "gitodile"\nversion = "${versions.cargo}"\n`);
  fs.writeFileSync(path.join(root, "src-tauri", "Cargo.lock"), `name = "gitodile"\nversion = "${versions.lock}"\n`);
  fs.writeFileSync(path.join(root, "src-tauri", "tauri.conf.json"), JSON.stringify({ version: versions.tauri }));
}

function repository(version = "0.3.0", overrides = {}) {
  const root = tempDir("gitodile-release-test-");
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "release-test@example.invalid");
  git(root, "config", "user.name", "Release Test");
  writeMetadata(root, version, overrides);
  git(root, "add", ".");
  git(root, "commit", "-m", "candidate");
  const sha = git(root, "rev-parse", "HEAD");
  git(root, "tag", `v${version}`);
  return { root, sha, tag: `v${version}` };
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => error instanceof ReleaseValidationError && error.code === code);
}

test("rejects malformed tags and every prerelease suffix", () => {
  for (const tag of ["0.2.0", "v01.2.0", "v0.2.0-rc.1", "v0.2.0-alpha.0", "v0.2.0-beta.1", "v0.2.0+build.1"]) {
    expectCode("invalid_tag", () => parseReleaseTag(tag));
  }
});

test("rejects a tagged commit outside approved main ancestry", () => {
  const repo = repository();
  git(repo.root, "branch", "approved-main", repo.sha);
  git(repo.root, "checkout", "--orphan", "untrusted");
  git(repo.root, "rm", "-r", "--cached", ".");
  writeMetadata(repo.root, "0.3.1");
  git(repo.root, "add", ".");
  git(repo.root, "commit", "-m", "untrusted candidate");
  const sha = git(repo.root, "rev-parse", "HEAD");
  git(repo.root, "tag", "v0.3.1");
  expectCode("wrong_ancestry", () =>
    validateReleaseCandidate({ root: repo.root, tag: "v0.3.1", sha, mainRef: "approved-main" }),
  );
});

test("rejects every version metadata mismatch", () => {
  const repo = repository("0.3.0", { cargo: "0.3.1" });
  expectCode("metadata_mismatch", () =>
    validateReleaseCandidate({ root: repo.root, tag: repo.tag, sha: repo.sha, mainRef: "main" }),
  );
});

test("rejects a requested revision that is not the exact tag commit", () => {
  const repo = repository();
  fs.writeFileSync(path.join(repo.root, "after-tag.txt"), "later");
  git(repo.root, "add", ".");
  git(repo.root, "commit", "-m", "after tag");
  const later = git(repo.root, "rev-parse", "HEAD");
  expectCode("revision_mismatch", () =>
    validateReleaseCandidate({ root: repo.root, tag: repo.tag, sha: later, mainRef: "main" }),
  );
});

test("binds tag, exact revision, metadata and matrix", () => {
  const repo = repository();
  const candidate = validateReleaseCandidate({ root: repo.root, tag: repo.tag, sha: repo.sha, mainRef: "main" });
  assert.equal(candidate.source.sha, repo.sha);
  assert.deepEqual(Object.keys(candidate.release).sort(), ["publicPromotionAllowed", "version"],
    "the release identity is its version: no channel, prerelease flag, build profile or purpose");
  assert.equal(candidate.release.publicPromotionAllowed, false);
  assert.deepEqual(candidate.matrix.requiredTargets, [
    "windows-x86_64",
    "linux-x86_64",
  ]);
  assert.deepEqual(candidate.matrix.targets[0], {
    key: "windows-x86_64",
    rustTarget: "x86_64-pc-windows-msvc",
  });
});

test("explicit trusted ref type supports workflow-run tag revalidation", () => {
  const repo = repository();
  const args = [
    "--root",
    repo.root,
    "--event",
    "coordinator_dispatch",
    "--ref-type",
    "tag",
    "--tag",
    repo.tag,
    "--sha",
    repo.sha,
    "--main-ref",
    "main",
  ];
  const candidate = runCandidateCli(args, { GITHUB_REF_TYPE: "branch" });
  assert.equal(candidate.source.sha, repo.sha);
  expectCode("invalid_event", () => runCandidateCli(args.with(5, "branch"), { GITHUB_REF_TYPE: "tag" }));
});

test("fails safely when credential names are absent without reading values", () => {
  expectCode("credentials_unavailable", () => requireCredentials({}, ["UPDATER_KEY", "UPDATER_PASSWORD"]));
  assert.deepEqual(requireCredentials({ UPDATER_KEY: "present" }, ["UPDATER_KEY"]), [
    { name: "UPDATER_KEY", available: true },
  ]);
});

test("generates and verifies artifact hashes and provenance", () => {
  const repo = repository();
  const candidate = validateReleaseCandidate({ root: repo.root, tag: repo.tag, sha: repo.sha, mainRef: "main" });
  const artifact = path.join(repo.root, "GitOdile.AppImage");
  fs.writeFileSync(artifact, "signed bytes");
  const evidence = createEvidence({
    candidate,
    target: "linux-x86_64",
    phase: "signed",
    artifacts: [{ file: artifact, role: "updater" }],
    trust: {
      updater: { result: "passed", publicIdentity: "validation-key-sha256:abc" },
      operatingSystem: { result: "not_applicable" },
      notarization: { result: "not_applicable" },
    },
  });
  assert.equal(evidence.source.sha, repo.sha);
  assert.equal(verifyEvidenceArtifacts(evidence, repo.root), true);
  fs.appendFileSync(artifact, "tampered");
  expectCode("hash_mismatch", () => verifyEvidenceArtifacts(evidence, repo.root));
});

test("an incomplete or mixed-provenance matrix cannot pass", () => {
  const repo = repository();
  const candidate = validateReleaseCandidate({ root: repo.root, tag: repo.tag, sha: repo.sha, mainRef: "main" });
  const evidence = ["windows-x86_64", "darwin-aarch64", "darwin-x86_64"].map((target) => ({
    schemaVersion: 1,
    phase: "os-signed",
    source: candidate.source,
    release: candidate.release,
    target,
    rustTarget:
      target === "windows-x86_64"
        ? "x86_64-pc-windows-msvc"
        : target === "darwin-aarch64"
          ? "aarch64-apple-darwin"
          : "x86_64-apple-darwin",
    artifacts: [
      {
        role: target.startsWith("darwin-") ? "first-install" : "first-install-and-updater",
        fileName: target === "windows-x86_64" ? `${target}.exe` : `${target}.dmg`,
        size: 1,
        sha256: "0".repeat(64),
      },
      ...(target.startsWith("darwin-")
        ? [{ role: "updater", fileName: `${target}.app.tar.gz`, size: 1, sha256: "1".repeat(64) }]
        : []),
    ],
    trust: {},
  }));
  expectCode("matrix_incomplete", () => verifyCompleteMatrix(evidence, candidate, { requiredPhase: "os-signed" }));
  evidence.push({ ...evidence[0], target: "linux-x86_64", source: { ...candidate.source, sha: "f".repeat(40) } });
  expectCode("provenance_mismatch", () => verifyCompleteMatrix(evidence, candidate, { requiredPhase: "os-signed" }));
});

test("evidence rejects source archives and non-package output", () => {
  expectCode("invalid_artifact", () =>
    verifyArtifactShape({
      target: "windows-x86_64",
      phase: "unsigned",
      artifacts: [{ role: "first-install-and-updater", fileName: "private-source.zip" }],
    }),
  );
});

test("Windows trust evidence rejects self-signed or unpinned Authenticode identities", () => {
  const root = tempDir("gitodile-windows-trust-");
  const identity = path.join(root, "identity.json");
  const output = path.join(root, "trust.json");
  const validationOutput = path.join(root, "validation-trust.json");
  const validationRun = spawnSync(process.execPath, [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "make-os-trust.mjs"),
    "windows-x86_64",
    "authenticode-deferred",
    validationOutput,
  ], { encoding: "utf8", windowsHide: true });
  assert.equal(validationRun.status, 0, validationRun.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(validationOutput, "utf8")).operatingSystem, {
    result: "not_checked",
    reason: "authenticode_deferred",
    publicIdentity: null,
  });
  const run = () => spawnSync(process.execPath, [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "make-os-trust.mjs"),
    "windows-x86_64",
    identity,
    output,
  ], { encoding: "utf8", windowsHide: true });
  fs.writeFileSync(identity, JSON.stringify({
    result: "passed",
    subject: "CN=Example",
    issuer: "CN=Example",
    selfSigned: true,
    codeSigningEku: "passed",
    certificateChain: "passed",
  }));
  assert.notEqual(run().status, 0);
  fs.writeFileSync(identity, JSON.stringify({
    result: "passed",
    subject: "CN=Example Publisher",
    issuer: "CN=Public CA",
    sha256Thumbprint: "a".repeat(64),
    selfSigned: false,
    codeSigningEku: "passed",
    certificateChain: "passed",
    timestampSubject: "CN=Timestamp CA",
  }));
  assert.equal(run().status, 0);
  const signingScript = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "sign-windows.ps1"), "utf8");
  assert.match(signingScript, /GITODILE_WINDOWS_CERTIFICATE_SHA256/);
  assert.match(signingScript, /TimeStamperCertificate/);
  assert.match(signingScript, /X509RevocationMode/);
  assert.match(signingScript, /self-signed certificate is not accepted/);
});

test("Windows matrices remain explicitly authenticode_deferred through the initial 1.0 policy", () => {
  const makeEvidence = (candidate, target, operatingSystem) => ({
    schemaVersion: 1,
    phase: "signed",
    source: candidate.source,
    release: candidate.release,
    target,
    rustTarget: target === "windows-x86_64" ? "x86_64-pc-windows-msvc" : "x86_64-unknown-linux-gnu",
    artifacts: [
      {
        role: "first-install-and-updater",
        fileName: target === "windows-x86_64" ? "GitOdile_setup.exe" : "GitOdile.AppImage",
        size: 1,
        sha256: "a".repeat(64),
      },
      {
        role: "updater-signature",
        fileName: target === "windows-x86_64" ? "GitOdile_setup.exe.sig" : "GitOdile.AppImage.sig",
        size: 1,
        sha256: "b".repeat(64),
      },
    ],
    trust: {
      updater: { result: "passed", publicIdentity: "production-key" },
      operatingSystem,
      notarization: { result: "not_applicable" },
    },
  });
  const deferred = { result: "not_checked", reason: "authenticode_deferred", publicIdentity: null };
  for (const version of ["0.3.0", "1.0.0"]) {
    const repo = repository(version);
    const candidate = validateReleaseCandidate({ root: repo.root, tag: repo.tag, sha: repo.sha, mainRef: "main" });
    assert.equal(verifyCompleteMatrix([
      makeEvidence(candidate, "windows-x86_64", deferred),
      makeEvidence(candidate, "linux-x86_64", { result: "not_applicable" }),
    ], candidate, { requiredPhase: "signed" }).length, 2, version);
  }
});

test("workflows expose no branch publication path and pin external actions", () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const workflowDirectory = path.join(repositoryRoot, ".github", "workflows");
  const readWorkflow = (name) => {
    const source = fs.readFileSync(path.join(workflowDirectory, name), "utf8");
    return { source, parsed: yaml.load(source, { schema: yaml.JSON_SCHEMA }) };
  };
  for (const name of fs.readdirSync(workflowDirectory).filter((item) => /\.ya?ml$/.test(item))) {
    const workflow = readWorkflow(name);
    for (const match of workflow.source.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)) {
      if (!match[1].startsWith("./")) assert.match(match[1], /@[0-9a-f]{40}$/, `${name} uses a mutable Action ref`);
    }
    for (const job of Object.values(workflow.parsed.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith("actions/checkout@")) {
          assert.equal(step.with?.["persist-credentials"], false, `${name} persists checkout credentials`);
        }
        if (step.run) {
          assert.doesNotMatch(step.run, /\$\{\{\s*(?:inputs|github\.event\.inputs)\./, `${name} interpolates a dispatch input into a shell`);
        }
      }
    }
  }
  const pipeline = readWorkflow("release-pipeline.yml");
  assert.match(pipeline.source, /replace\(\/\^v\/, "release\/"\)/,
    "a pull_request_target coordinator reports the same-repository release head branch, not main");
  assert.deepEqual(Object.keys(pipeline.parsed.on), ["workflow_dispatch"]);
  assert.deepEqual(pipeline.parsed.permissions, { actions: "read", contents: "read" });
  assert.equal(pipeline.parsed["run-name"], "Release ${{ inputs.tag }} at ${{ inputs.sha }}");
  assert.equal(pipeline.parsed.concurrency.group, "release-pipeline-${{ inputs.tag }}");
  assert.equal(pipeline.parsed.concurrency["cancel-in-progress"], false);
  assert.equal(pipeline.parsed.jobs.validate.if, "github.ref == 'refs/heads/main' && github.sha == github.workflow_sha");
  // One linear run: every stage is a job of the same run, ordered by needs.
  assert.deepEqual(Object.keys(pipeline.parsed.jobs), [
    "validate", "build", "matrix-gate", "windows-deferred-boundary", "linux-os-boundary", "updater-sign", "stage", "publish",
  ]);
  assert.deepEqual(pipeline.parsed.jobs["windows-deferred-boundary"].needs, ["validate", "matrix-gate"]);
  assert.deepEqual(pipeline.parsed.jobs["linux-os-boundary"].needs, ["validate", "matrix-gate"]);
  assert.deepEqual(pipeline.parsed.jobs["updater-sign"].needs, ["validate", "windows-deferred-boundary", "linux-os-boundary"]);
  assert.deepEqual(pipeline.parsed.jobs.stage.needs, ["validate", "updater-sign"]);
  assert.equal(pipeline.parsed.jobs.publish.needs, "stage");
  assert.equal(pipeline.parsed.jobs["macos-os-sign"], undefined);
  assert.equal(pipeline.parsed.jobs["windows-os-sign"], undefined);
  // Artifacts never cross runs: no job downloads by run-id except the
  // coordinator authorization consumed by validate.
  for (const [jobName, job] of Object.entries(pipeline.parsed.jobs)) {
    for (const step of job.steps ?? []) {
      if (step.uses?.startsWith("actions/download-artifact@") && step.with?.["run-id"] !== undefined) {
        assert.equal(jobName, "validate", `${jobName} downloads artifacts from another run`);
        assert.equal(step.with.name, "merge-release-authorization");
      }
    }
  }
  assert.deepEqual(pipeline.parsed.jobs.build.strategy.matrix.include.map((item) => item.target), [
    "windows-x86_64",
    "linux-x86_64",
  ]);
  // One build identity: the reviewed production updater key and the two
  // compile-time target gates. No alternate profile, feed or key exists.
  assert.deepEqual(Object.keys(pipeline.parsed.jobs.build.env).sort(), [
    "GITODILE_QUALIFIED_UPDATE_TARGETS", "GITODILE_TEST_UPDATE_TARGETS",
    "GITODILE_UPDATER_PUBLIC_KEY", "GITODILE_UPDATER_PUBLIC_KEY_ID",
  ]);
  assert.equal(pipeline.parsed.jobs.build.env.GITODILE_UPDATER_PUBLIC_KEY, "${{ vars.GITODILE_PRODUCTION_UPDATER_PUBLIC_KEY }}");
  assert.equal(pipeline.parsed.jobs.build.env.GITODILE_QUALIFIED_UPDATE_TARGETS, "${{ vars.GITODILE_QUALIFIED_UPDATE_TARGETS }}");
  // Releases publish under the testing policy, so every build carries the
  // canonical test pair; it is a constant, not an expression.
  assert.equal(pipeline.parsed.jobs.build.env.GITODILE_TEST_UPDATE_TARGETS, "windows-x86_64,linux-x86_64");
  assert.doesNotMatch(pipeline.source, /PREVIEW_TEST_UPDATE_TARGETS/);
  // The bundled changelog dates every version by its tag: the build checkout
  // fetches tags and refuses a release whose own tag did not resolve.
  const buildCheckout = pipeline.parsed.jobs.build.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  assert.equal(buildCheckout.with["fetch-tags"], true);
  const tagGuard = pipeline.parsed.jobs.build.steps.find((step) => step.name === "Require the release tag for the bundled changelog date");
  assert.equal(tagGuard.env.RELEASE_TAG, "${{ needs.validate.outputs.tag }}");
  assert.equal(tagGuard.env.RELEASE_SHA, "${{ needs.validate.outputs.sha }}");
  assert.match(tagGuard.run, /refs\/tags\/\$\{tag\}\^\{commit\}/);
  assert.match(tagGuard.run, /--format=%cs/);
  assert.ok(pipeline.parsed.jobs.build.steps.indexOf(tagGuard) < pipeline.parsed.jobs.build.steps.findIndex((step) => step.name === "Build without signing credentials"));
  assert.doesNotMatch(pipeline.source, /VALIDATION|UPDATE_PROFILE|validation-draft|signingProfile/,
    "no test-only signing profile, feed, key or publication mode may remain");
  const identityGuard = pipeline.parsed.jobs.build.steps.find((step) => step.name === "Require reviewed public updater identity");
  assert.match(identityGuard.run, /new Set\(\["", "windows-x86_64,linux-x86_64"\]\)/);
  const unsignedBuild = pipeline.parsed.jobs.build.steps.find((step) => step.name === "Build without signing credentials");
  assert.match(unsignedBuild.run, /--config src-tauri\/tauri\.unsigned\.conf\.json/);
  assert.doesNotMatch(unsignedBuild.run, /--config\s+['"]?\{/,
    "inline JSON config is not shell-portable across the Windows and Linux matrix");
  const candidateValidation = pipeline.parsed.jobs.validate.steps.find(
    (step) => step.name === "Validate tag, ancestry, revision and versions",
  );
  assert.match(candidateValidation.run, /--ref-type tag/);
  assert.match(candidateValidation.run, /--tag "\$RELEASE_TAG"/);
  assert.match(candidateValidation.run, /--sha "\$RELEASE_SHA"/);

  // Secret and environment isolation is per job: only the updater-signing and
  // publish jobs reference a secret, and each enters its own environment.
  const secretJobs = Object.entries(pipeline.parsed.jobs)
    .filter(([, job]) => /secrets\./.test(JSON.stringify(job)))
    .map(([name]) => name);
  assert.deepEqual(secretJobs, ["updater-sign", "publish"]);
  const environmentJobs = Object.entries(pipeline.parsed.jobs)
    .filter(([, job]) => job.environment !== undefined)
    .map(([name]) => name);
  assert.deepEqual(environmentJobs, ["updater-sign", "publish"]);
  assert.equal(pipeline.parsed.jobs["updater-sign"].environment, "production-updater-signing");
  assert.equal(pipeline.parsed.jobs.publish.environment, "public-release",
    "every release publishes through the one reviewed publication environment");
  assert.doesNotMatch(pipeline.source, /environment: public-release-|GITODILE_RELEASE_CHANNEL/);
  assert.deepEqual(pipeline.parsed.jobs.publish.concurrency, { group: "gitodile-publication", "cancel-in-progress": false });
  for (const jobName of ["validate", "build", "matrix-gate", "windows-deferred-boundary", "linux-os-boundary", "stage"]) {
    assert.doesNotMatch(JSON.stringify(pipeline.parsed.jobs[jobName]), /GITODILE_PUBLIC_RELEASE_TOKEN|TAURI_SIGNING_PRIVATE_KEY|contents.:.write/,
      `${jobName} must not see signing or destination credentials`);
  }
  assert.doesNotMatch(pipeline.source, /contents:\s*write|create-release|upload-release-asset/i);
  assert.equal(pipeline.parsed.jobs.publish.steps.some((step) => step.uses?.startsWith("actions/checkout@")), false);
  assert.match(JSON.stringify(pipeline.parsed.jobs.publish), /GITODILE_PUBLIC_RELEASE_TOKEN/);
  assert.doesNotMatch(JSON.stringify(pipeline.parsed.jobs.publish), /GITHUB_TOKEN|github\.token|source-run-id/);

  const signingVerifierDependencies = pipeline.parsed.jobs["updater-sign"].steps.find(
    (step) => step.name === "Install Linux verifier dependencies",
  );
  assert.match(signingVerifierDependencies.run, /libwebkit2gtk-4\.1-dev/);
  const updaterSigning = pipeline.parsed.jobs["updater-sign"].steps.find(
    (step) => step.name === "Sign final bytes and verify every updater signature",
  );
  assert.match(updaterSigning.run, /cargo build --locked .*--example verify_updater_signature/);
  assert.match(updaterSigning.run, /fs\.readFileSync\(process\.argv\[1\],'utf8'\)/);
  assert.doesNotMatch(updaterSigning.run, /require\(process\.argv\[1\]\)/,
    "filesystem paths from find must not be resolved as Node package names");
  const modeDerivation = pipeline.parsed.jobs.stage.steps.find((step) => step.id === "release");
  assert.match(modeDerivation.run, /derivePublicationMode\(qualification\)/,
    "the mode comes from the reviewed qualification registry, never from a dispatch input");
  assert.match(modeDerivation.run, /docs\/release\/update-target-qualifications\.json/);
  assert.equal(modeDerivation.env, undefined, "mode derivation needs no token: the publication time is read by the publish job");
  assert.doesNotMatch(pipeline.source, /published_at|committer\.date|--published-at/,
    "pub_date is the instant GitHub publishes the release; staging must not derive one from a commit");
  // A coordinator run that completed without succeeding cannot authorize.
  const coordinatorCheck = pipeline.parsed.jobs.validate.steps.find((step) => step.name === "Validate the coordinator workflow run");
  assert.match(coordinatorCheck.run, /run\.status === "in_progress" && run\.conclusion === null/);
  assert.match(coordinatorCheck.run, /run\.status === "completed" && run\.conclusion === "success"/);
  assert.doesNotMatch(coordinatorCheck.run, /new Set\(\["in_progress", "completed"\]\)/);
  assert.match(pipeline.source, /validated-source-run\.json/);
  assert.match(pipeline.source, /qualification-evidence\.mjs/);
  // The staging job re-checks only the live destination contract; the
  // repository gate already ran on the exact merge SHA and was required by the
  // coordinator, so repeating it here would test main's tip, not the release.
  const stageContract = pipeline.parsed.jobs.stage.steps.find((step) => step.name === "Require the live public destination contract");
  assert.equal(stageContract.run, "node scripts/check-public-feedback.mjs");
  assert.equal(stageContract.env.GITHUB_TOKEN, "${{ github.token }}");
  assert.doesNotMatch(JSON.stringify(pipeline.parsed.jobs.stage), /check:publication|pnpm run check\b|libwebkit2gtk|apt-get|rust-toolchain/,
    "stage must not repeat the repository gate against protected main's current tip");
  for (const jobName of ["validate", "matrix-gate", "windows-deferred-boundary", "linux-os-boundary", "updater-sign", "stage"]) {
    for (const step of pipeline.parsed.jobs[jobName].steps ?? []) {
      if (step.uses?.startsWith("actions/checkout@")) assert.equal(step.with?.ref, "${{ github.workflow_sha }}", `${jobName} must run scripts from the pipeline definition revision`);
    }
  }
  for (const step of pipeline.parsed.jobs.build.steps) {
    if (step.uses?.startsWith("actions/checkout@")) assert.equal(step.with?.ref, "${{ needs.validate.outputs.sha }}");
  }

  const coordinator = readWorkflow("merge-driven-release.yml");
  assert.deepEqual(Object.keys(coordinator.parsed.on), ["pull_request_target"]);
  assert.match(coordinator.source, /printf '%s\\n' "\$GITODILE_RELEASE_TAG_DEPLOY_KEY"/,
    "the deploy key must regain its final PEM newline after GitHub secret transport");
  assert.deepEqual(coordinator.parsed.on.pull_request_target.types, ["closed"]);
  assert.equal(coordinator.parsed.concurrency.group, "merge-driven-release");
  assert.deepEqual(coordinator.parsed.permissions, { contents: "read", checks: "read", "pull-requests": "read" });
  assert.deepEqual(coordinator.parsed.jobs["tag-and-dispatch"].permissions, { actions: "write", contents: "read" });
  assert.equal(coordinator.parsed.jobs["tag-and-dispatch"].environment, "release-tagging");
  assert.doesNotMatch(JSON.stringify(coordinator.parsed.jobs.authorize), /GITODILE_RELEASE_TAG_DEPLOY_KEY|actions.:.write/);
  assert.match(JSON.stringify(coordinator.parsed.jobs["tag-and-dispatch"]), /GITODILE_RELEASE_TAG_DEPLOY_KEY/);
  assert.match(coordinator.source, /actions\/workflows\/\$\{workflow\}\/dispatches/);
  assert.match(coordinator.source, /const workflow = "release-pipeline\.yml"/);
  assert.match(coordinator.source, /`Release \$\{process\.env\.RELEASE_TAG\} at \$\{process\.env\.RELEASE_SHA\}`/);
  assert.match(coordinator.source, /display_title === title/);
  assert.match(coordinator.source, /github\.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl/);
  assert.doesNotMatch(coordinator.source, /ssh-keyscan/);
  assert.doesNotMatch(coordinator.source, /refs\/heads\/release\/|github\.event\.pull_request\.head\.sha/);
  const ci = readWorkflow("ci.yml");
  const codeql = readWorkflow("codeql.yml");
  assert.deepEqual([...REQUIRED_RELEASE_CHECKS].sort(), [
    ...Object.values(ci.parsed.jobs).flatMap((job) => job.name.includes("${{ matrix.platform }}")
      ? job.strategy.matrix.include.map(({ platform }) => job.name.replace("${{ matrix.platform }}", platform))
      : [job.name]),
    codeql.parsed.jobs["javascript-typescript"].name,
  ].sort());
  // CI proves the same images the release pipeline builds on, never a moving
  // `-latest`, and the shipped platforms compile in release profile.
  const runners = new Set(Object.values(ci.parsed.jobs).flatMap((job) =>
    job.strategy?.matrix?.include?.map((entry) => entry.runner) ?? [job["runs-on"]]));
  for (const runner of runners) assert.doesNotMatch(runner, /-latest$/, `${runner} is a moving runner image`);
  assert.deepEqual(ci.parsed.jobs["desktop-release-compile"].strategy.matrix.include.map(({ platform }) => platform), ["linux", "windows"]);
  // Ordinary pull requests may skip the macOS Rust checks and the release
  // compile, but those jobs still report under their required names, and
  // a push to main or a release pull request always runs them in full.
  for (const name of ["rust", "desktop-release-compile"]) {
    const [scope, ...work] = ci.parsed.jobs[name].steps;
    assert.equal(scope.id, "scope", `${name} decides its scope first`);
    assert.match(scope.run, /\[ "\$EVENT" != pull_request \] \|\| \[\[ "\$HEAD_REF" == release\/\* \]\]; then\s+full=true/);
    for (const step of work) assert.match(step.if, /^steps\.scope\.outputs\.full == 'true'/, `${name} gates every step`);
  }
  assert.equal(ci.parsed.jobs.rust.steps[0].env.ALWAYS, "${{ matrix.platform != 'macos' }}");
  assert.equal(ci.parsed.concurrency["cancel-in-progress"], "${{ github.event_name == 'pull_request' }}",
    "a push to main must never cancel the checks the coordinator waits for");
  for (const [name, job] of Object.entries(ci.parsed.jobs)) {
    assert.ok(Number.isInteger(job["timeout-minutes"]), `${name} needs a timeout`);
  }
});
