import {
  ALL_TARGETS,
  compareReleaseVersions,
  parseReleaseVersion,
  REQUIRED_TARGETS,
  TARGET_CONTRACTS,
  ReleaseValidationError,
} from "./release-candidate.mjs";

export const QUALIFICATION_SCHEMA_VERSION = 4;
export const PUBLIC_REPOSITORY = "martinezelx/gitodile";
/** The one public feed every installed build reads its updates from. */
export const PUBLIC_FEED_URL = `https://raw.githubusercontent.com/${PUBLIC_REPOSITORY}/main/updates/latest.json`;

export const REQUIRED_PRESERVATION_CHECKS = Object.freeze([
  "settings",
  "sessions",
  "volatileDrafts",
  "dirtyTrackedFiles",
  "dirtyUntrackedFiles",
  "otherProjects",
  "activeOperations",
  "helpers",
  "gitHistory",
]);

export const REQUIRED_FAILURE_CASES = Object.freeze([
  "offline",
  "feed_unavailable",
  "target_unavailable",
  "corrupt_or_truncated_download",
  "signature_invalid",
  "cancellation",
  "insufficient_space",
  "locked_installation",
  "read_only_installation",
  "interrupted_handoff",
  "reinstall",
  "managed_package_fallback",
]);

/** Publisher behaviours a production approval must have observed on real
 * public testing publications. */
export const REQUIRED_PUBLISHER_CHECKS = Object.freeze([
  "testingPublication",
  "interruptedRetry",
  "immutableAssets",
  "anonymousDownloads",
  "feedAdvanced",
]);

const SHA256 = /^[0-9a-f]{64}$/;
const SOURCE_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const RUN_URL = /^https:\/\/github\.com\/martinezelx\/gitodile\/actions\/runs\/[1-9][0-9]*(?:\/attempts\/[1-9][0-9]*)?$/;
const HTTPS_URL = /^https:\/\//;
const ASSET_NAME = /^[A-Za-z0-9._-]+$/;

function fail(code, message) {
  throw new ReleaseValidationError(code, message);
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().replace(".000Z", "Z") === value;
}

function requirePassed(value, label) {
  if (value?.result !== "passed") fail("qualification_invalid", `${label} is not passed`);
}

function publicReleaseUrl(version) {
  return `https://github.com/${PUBLIC_REPOSITORY}/releases/tag/v${version}`;
}

function publicAssetUrl(version, fileName) {
  return `https://github.com/${PUBLIC_REPOSITORY}/releases/download/v${version}/${fileName}`;
}

function validateArtifact(artifact, version, label) {
  if (
    typeof artifact?.fileName !== "string" || !ASSET_NAME.test(artifact.fileName) ||
    !SHA256.test(artifact?.sha256 ?? "") || !Number.isSafeInteger(artifact?.size) || artifact.size <= 0 ||
    artifact?.anonymousUrl !== publicAssetUrl(version, artifact.fileName)
  ) fail("qualification_invalid", `${label} artifact identity is invalid`);
}

/** A qualified transition is proven by two real public releases, each
 * published by one release-pipeline run on protected main. */
function validateBuild(build, expectedVersion, target, label) {
  if (
    build?.version !== expectedVersion || build?.tag !== `v${expectedVersion}` ||
    !SOURCE_SHA.test(build?.sourceSha ?? "") || !SHA256.test(build?.signedMatrixSha256 ?? "") ||
    !RUN_URL.test(build?.pipelineRunUrl ?? "") || build?.publicReleaseUrl !== publicReleaseUrl(expectedVersion) ||
    !SOURCE_SHA.test(build?.publicTagCommit ?? "") || !SHA256.test(build?.manifestSha256 ?? "")
  ) fail("qualification_invalid", `${label} build provenance is invalid`);
  validateArtifact(build.installerArtifact, expectedVersion, `${label} installer`);
  validateArtifact(build.updaterArtifact, expectedVersion, `${label} updater`);
  requirePassed(build.updaterSignature, `${label} updater signature`);
  if (typeof build.updaterSignature?.publicKeyId !== "string" || build.updaterSignature.publicKeyId.length === 0) {
    fail("qualification_invalid", `${label} updater key identity is missing`);
  }
  const mac = target.startsWith("darwin-");
  const linux = target === "linux-x86_64";
  const windows = target === "windows-x86_64";
  if (linux) {
    if (build.operatingSystemTrust?.result !== "not_applicable") fail("qualification_invalid", `${label} Linux OS trust must be not_applicable`);
  } else if (windows) {
    if (build.operatingSystemTrust?.result !== "not_checked" ||
        build.operatingSystemTrust?.reason !== "authenticode_deferred" ||
        build.operatingSystemTrust?.publicIdentity !== null) {
      fail("qualification_invalid", `${label} Windows trust must remain authenticode_deferred`);
    }
  } else {
    requirePassed(build.operatingSystemTrust, `${label} operating-system trust`);
    if (typeof build.operatingSystemTrust?.publicIdentity !== "string" || build.operatingSystemTrust.publicIdentity.length === 0) {
      fail("qualification_invalid", `${label} operating-system trust identity is missing`);
    }
  }
  if (mac) requirePassed(build.notarization, `${label} notarization`);
  else if (build.notarization?.result !== "not_applicable") fail("qualification_invalid", `${label} notarization must be not_applicable`);
}

function expectedEnvironment(target) {
  if (target === "windows-x86_64") return { os: "windows", architecture: "x86_64" };
  if (target === "linux-x86_64") return { os: "linux", architecture: "x86_64" };
  return { os: "macos", architecture: target.endsWith("aarch64") ? "aarch64" : "x86_64" };
}

function validateTransition(transition, label) {
  const from = transition?.fromVersion;
  const to = transition?.toVersion;
  let ordered = false;
  try {
    ordered = compareReleaseVersions(from, to) < 0;
  } catch (error) {
    if (!(error instanceof ReleaseValidationError)) throw error;
  }
  if (
    !ordered || transition?.runningVersionBefore !== from || transition?.runningVersionAfter !== to ||
    transition?.result !== "passed" || transition?.falseSuccessObserved !== false ||
    transition?.forcedDowngradeObserved !== false
  ) fail("qualification_invalid", `${label} does not prove a real public A-to-B transition`);
  return { from, to };
}

function validateFeed(feed, toVersion, label) {
  if (
    feed?.url !== PUBLIC_FEED_URL || feed?.version !== toVersion || !SHA256.test(feed?.sha256 ?? "") ||
    !SOURCE_SHA.test(feed?.commitSha ?? "") || !isCanonicalTimestamp(feed?.observedAt)
  ) fail("qualification_invalid", `${label} public feed evidence is incomplete`);
}

/** Returns the updater public-key identity a qualified target proves, or
 * `null` when the entry carries no valid qualification. */
export function validateTargetEvidence(entry, target) {
  if (entry?.status !== "qualified" || !Array.isArray(entry.evidence) || entry.evidence.length !== 1) return null;
  const proof = entry.evidence[0];
  try {
    const expected = expectedEnvironment(target);
    if (
      proof?.schemaVersion !== 2 || proof?.target !== target || proof?.result !== "passed" ||
      !isCanonicalTimestamp(proof?.observedAt) || !HTTPS_URL.test(proof?.report?.url ?? "") ||
      !SHA256.test(proof?.report?.sha256 ?? "") || proof?.environment?.os !== expected.os ||
      proof?.environment?.architecture !== expected.architecture ||
      typeof proof?.environment?.osVersion !== "string" || proof.environment.osVersion.length === 0 ||
      proof?.environment?.installationMode !== TARGET_CONTRACTS[target].installation
    ) fail("qualification_invalid", `${target} environment or report provenance is invalid`);

    const { from, to } = validateTransition(proof.transition, target);
    validateBuild(proof.builds?.from, from, target, `${target} build A`);
    validateBuild(proof.builds?.to, to, target, `${target} build B`);
    const publicKeyId = proof.builds.from.updaterSignature.publicKeyId;
    if (proof.builds.to.updaterSignature.publicKeyId !== publicKeyId) {
      fail("qualification_invalid", `${target} builds use different updater identities`);
    }
    validateFeed(proof.feed, to, target);

    for (const check of REQUIRED_PRESERVATION_CHECKS) {
      const required = check === "gitHistory" ? "unchanged" : "passed";
      if (proof?.preservation?.[check] !== required) fail("qualification_invalid", `${target} preservation check ${check} is incomplete`);
    }

    if (!Array.isArray(proof.failureCases) || proof.failureCases.length !== REQUIRED_FAILURE_CASES.length) {
      fail("qualification_invalid", `${target} failure matrix is incomplete`);
    }
    const cases = new Map(proof.failureCases.map((item) => [item.name, item]));
    if (cases.size !== proof.failureCases.length) fail("qualification_invalid", `${target} failure matrix contains duplicates`);
    for (const name of REQUIRED_FAILURE_CASES) {
      const item = cases.get(name);
      if (item?.result !== "passed" || item?.falseSuccessObserved !== false || item?.forcedDowngradeObserved !== false) {
        fail("qualification_invalid", `${target} failure case ${name} is incomplete`);
      }
    }

    if (target.startsWith("darwin-")) {
      if (
        proof?.replacementSafety?.result !== "passed" || !HTTPS_URL.test(proof?.replacementSafety?.independentReviewUrl ?? "") ||
        !SHA256.test(proof?.replacementSafety?.testReportSha256 ?? "")
      ) fail("qualification_invalid", `${target} replacement-safety mitigation lacks independent evidence`);
    } else if (proof?.replacementSafety?.result !== "not_applicable") {
      fail("qualification_invalid", `${target} replacement safety must be not_applicable`);
    }
    return publicKeyId;
  } catch (error) {
    if (error instanceof ReleaseValidationError) return null;
    throw error;
  }
}

function validateProductionApproval(approval) {
  if (
    approval?.enabled !== true || approval?.workingNameClearance !== "evidenced" ||
    !isCanonicalTimestamp(approval?.approvedAt) || approval?.evidence?.schemaVersion !== 2
  ) fail("production_not_approved", "production promotion and working-name clearance are not evidenced");
  const clearance = approval.evidence.workingNameClearance;
  if (clearance?.result !== "passed" || !isCanonicalTimestamp(clearance?.reviewedAt) || !HTTPS_URL.test(clearance?.referenceUrl ?? "")) {
    fail("production_not_approved", "working-name clearance evidence is incomplete");
  }
  const publisher = approval.evidence.publisher;
  if (publisher?.result !== "passed" || !RUN_URL.test(publisher?.pipelineRunUrl ?? "") || !SHA256.test(publisher?.reportSha256 ?? "")) {
    fail("production_not_approved", "publisher qualification provenance is incomplete");
  }
  for (const check of REQUIRED_PUBLISHER_CHECKS) {
    if (publisher?.[check] !== "passed") fail("production_not_approved", `publisher check ${check} is incomplete`);
  }
  if (typeof approval.evidence.updaterPublicKeyId !== "string" || approval.evidence.updaterPublicKeyId.length === 0) {
    fail("production_not_approved", "production approval does not name the updater key identity it covers");
  }
  return approval.evidence.updaterPublicKeyId;
}

function validateReleaseMatrix(qualification) {
  if (
    JSON.stringify(qualification?.releaseMatrix?.enabledTargets) !== JSON.stringify(REQUIRED_TARGETS) ||
    !Array.isArray(qualification?.releaseMatrix?.disabledTargets)
  ) fail("qualification_invalid", "reviewed release matrix is missing or differs from the enabled target set");
  const disabled = qualification.releaseMatrix.disabledTargets;
  const expectedDisabled = ALL_TARGETS.filter((target) => !REQUIRED_TARGETS.includes(target));
  if (JSON.stringify(disabled.map((entry) => entry.key)) !== JSON.stringify(expectedDisabled)) {
    fail("qualification_invalid", "disabled target set differs from the reviewed contract");
  }
  for (const entry of disabled) {
    if (
      entry.status !== "planned_disabled" || entry.reason !== "real_platform_qualification_required" ||
      entry.followUpTask !== "065-10" || !Array.isArray(entry.evidence) || entry.evidence.length !== 0
    ) fail("qualification_invalid", `${entry.key} lacks an explicit empty planned-disabled record`);
  }
}

export function validateQualificationRegistry(qualification, candidate, mode) {
  if (qualification?.schemaVersion !== QUALIFICATION_SCHEMA_VERSION || !Array.isArray(qualification.targets)) {
    fail("qualification_invalid", "qualification registry is malformed");
  }
  for (const legacy of ["validationQualification"]) {
    if (Object.hasOwn(qualification, legacy)) fail("qualification_invalid", `qualification registry carries the retired ${legacy} record`);
  }
  const byTarget = new Map(qualification.targets.map((item) => [item.key, item]));
  validateReleaseMatrix(qualification);
  if (byTarget.size !== qualification.targets.length || qualification.targets.length !== ALL_TARGETS.length) {
    fail("qualification_invalid", "qualification registry contains duplicate or unexpected targets");
  }
  for (const target of ALL_TARGETS) {
    if (!byTarget.has(target)) fail("qualification_invalid", `qualification registry omits ${target}`);
  }
  if (
    JSON.stringify(candidate.matrix.requiredTargets) !== JSON.stringify(REQUIRED_TARGETS) ||
    JSON.stringify(candidate.matrix.targets.map((target) => target.key)) !== JSON.stringify(REQUIRED_TARGETS)
  ) {
    fail("qualification_invalid", "signed matrix differs from the reviewed enabled target set");
  }
  for (const target of ALL_TARGETS.filter((key) => !REQUIRED_TARGETS.includes(key))) {
    const entry = byTarget.get(target);
    if (entry?.status !== "planned_disabled" || !Array.isArray(entry.evidence) || entry.evidence.length !== 0) {
      fail("qualification_invalid", `${target} must remain planned_disabled without evidence or publication`);
    }
  }
  for (const target of REQUIRED_TARGETS) {
    const entry = byTarget.get(target);
    const pending = entry?.status === "qualification_required" && Array.isArray(entry.evidence) && entry.evidence.length === 0;
    const qualified = entry?.status === "qualified" && Array.isArray(entry.evidence) && entry.evidence.length === 1;
    if (!pending && !qualified) fail("qualification_invalid", `${target} has an invalid qualification state`);
  }
  const gate = (allowed, qualifiedTargets) => ({
    productionAllowed: false, testingAllowed: false,
    ...allowed, qualifiedTargets,
  });
  // Testing deliberately accepts `qualification_required` targets: it is
  // publication-pipeline testing with Tauri-signed bytes, never target
  // qualification.
  if (mode === "testing") return gate({ testingAllowed: true }, []);
  if (mode !== "production") fail("invalid_mode", "mode must be testing or production");
  return gate({ productionAllowed: true }, requireQualifiedTargets(qualification, candidate.matrix.requiredTargets, byTarget));
}

/** What production requires: production approval plus a valid A-to-B
 * record for every required target, all under one updater key. */
function requireQualifiedTargets(qualification, requiredTargets, byTarget) {
  const approvedKeyId = validateProductionApproval(qualification.productionPromotion);
  const keyIds = new Map(requiredTargets.map((target) => [target, validateTargetEvidence(byTarget.get(target), target)]));
  const missing = [...keyIds].filter(([, keyId]) => keyId === null).map(([target]) => target);
  if (missing.length > 0) {
    fail("qualification_required", `targets still require real public A-to-B evidence: ${missing.join(", ")}`);
  }
  if (new Set([...keyIds.values(), approvedKeyId]).size !== 1) {
    fail("qualification_invalid", "qualified targets and the production approval must share one updater key identity");
  }
  return [...keyIds.keys()];
}

/** Whether the registry already proves every enabled target and production
 * approval — what lets a release publish as `production`, without the
 * testing notice, rather than as `testing`. Deny by default — a malformed or partial registry answers `false`, and the
 * full validation still runs when the plan is prepared. */
export function productionAllowed(qualification) {
  try {
    if (qualification?.schemaVersion !== QUALIFICATION_SCHEMA_VERSION || !Array.isArray(qualification.targets)) return false;
    const byTarget = new Map(qualification.targets.map((item) => [item.key, item]));
    requireQualifiedTargets(qualification, REQUIRED_TARGETS, byTarget);
    return true;
  } catch (error) {
    if (error instanceof ReleaseValidationError) return false;
    throw error;
  }
}
