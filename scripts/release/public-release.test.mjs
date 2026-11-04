import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { createEvidence } from "./release-evidence.mjs";
import {
  ALL_TARGETS,
  REQUIRED_TARGETS,
  TARGET_CONTRACTS,
  ReleaseValidationError,
  parseReleaseVersion,
} from "./release-candidate.mjs";
import {
  PUBLIC_FEED_URL,
  REQUIRED_FAILURE_CASES,
  REQUIRED_PRESERVATION_CHECKS,
  REQUIRED_PUBLISHER_CHECKS,
  validateTargetEvidence,
} from "./qualification-evidence.mjs";
import {
  FEED_FILES,
  PUBLICATION_MODES,
  TESTING_NOTICE,
  compareReleaseVersions,
  derivePublicationMode,
  feedsForPromotion,
  normalizeNotes,
  manifestHighlights,
  preparePublication,
  renderPublication,
  runPrepareCli,
} from "./public-release.mjs";
import { ANONYMOUS_RETRY, anonymousHash, atomicPublicCommit, publish, reconcileAssets, validateSourceRun } from "./github-publication.mjs";
import { tempDir } from "./test-temp.mjs";

const PUBLISHED_AT = "2026-09-14T11:13:05Z";
/** A plan the way the publish job sees it once GitHub has recorded the
 * release's publication time. */
function rendered(plan, publishedAt = PUBLISHED_AT) {
  return { ...plan, manifestBytes: renderPublication(plan, publishedAt).manifestBytes };
}
const FAST_RETRY = Object.freeze({ attempts: ANONYMOUS_RETRY.attempts, delayMs: 0 });

function expectCode(code, callback) {
  assert.throws(callback, (error) => error instanceof ReleaseValidationError && error.code === code);
}

function candidate(version) {
  const release = parseReleaseVersion(version);
  return {
    schemaVersion: 1,
    source: { tag: `v${version}`, sha: "a".repeat(40), approvedMainRef: "refs/remotes/origin/main" },
    release: { ...release, publicPromotionAllowed: false },
    matrix: { requiredTargets: [...REQUIRED_TARGETS], targets: REQUIRED_TARGETS.map((key) => ({ key, rustTarget: TARGET_CONTRACTS[key].rustTarget })) },
  };
}

// The qualified pair is data: any two consecutive real public releases.
const PAIR = Object.freeze({ from: "0.3.0", to: "0.3.1" });
const KEY_ID = "production-key-1";

function qualification(enabled = false, pair = PAIR) {
  const hash = (index, length) => ((index % 15) + 1).toString(16).repeat(length);
  const asset = (key, version, kind, index) => {
    const fileName = `GitOdile-${key}-${version}-${kind}`;
    return { fileName, size: 1024 + index, sha256: hash(index, 64), anonymousUrl: `https://github.com/martinezelx/gitodile/releases/download/v${version}/${fileName}` };
  };
  const buildProof = (key, version, index) => ({
    version,
    tag: `v${version}`,
    sourceSha: hash(index, 40),
    signedMatrixSha256: hash(index + 2, 64),
    manifestSha256: hash(index + 3, 64),
    pipelineRunUrl: `https://github.com/martinezelx/gitodile/actions/runs/${index + 10}`,
    publicReleaseUrl: `https://github.com/martinezelx/gitodile/releases/tag/v${version}`,
    publicTagCommit: hash(index + 1, 40),
    installerArtifact: asset(key, version, "installer", index + 4),
    updaterArtifact: asset(key, version, "updater", index + 6),
    updaterSignature: { result: "passed", publicKeyId: KEY_ID },
    operatingSystemTrust: key === "linux-x86_64"
      ? { result: "not_applicable" }
      : { result: "not_checked", reason: "authenticode_deferred", publicIdentity: null },
    notarization: key.startsWith("darwin-") ? { result: "passed" } : { result: "not_applicable" },
  });
  return {
    schemaVersion: 4,
    releaseMatrix: {
      enabledTargets: [...REQUIRED_TARGETS],
      disabledTargets: ALL_TARGETS.filter((key) => !REQUIRED_TARGETS.includes(key)).map((key) => ({
        key,
        status: "planned_disabled",
        reason: "real_platform_qualification_required",
        followUpTask: "065-10",
        evidence: [],
      })),
    },
    productionPromotion: enabled ? {
      enabled: true,
      workingNameClearance: "evidenced",
      approvedAt: "2026-09-11T12:00:00Z",
      evidence: {
        schemaVersion: 2,
        updaterPublicKeyId: KEY_ID,
        workingNameClearance: { result: "passed", reviewedAt: "2026-09-11T11:00:00Z", referenceUrl: "https://example.com/clearance/065-9-7" },
        publisher: {
          result: "passed",
          pipelineRunUrl: "https://github.com/martinezelx/gitodile/actions/runs/99",
          reportSha256: "9".repeat(64),
          ...Object.fromEntries(REQUIRED_PUBLISHER_CHECKS.map((name) => [name, "passed"])),
        },
      },
    } : { enabled: false, workingNameClearance: "not_evidenced", approvedAt: null, evidence: null },
    targets: ALL_TARGETS.map((key, targetIndex) => ({
      key,
      status: REQUIRED_TARGETS.includes(key)
        ? (enabled ? "qualified" : "qualification_required")
        : "planned_disabled",
      evidence: enabled && REQUIRED_TARGETS.includes(key) ? [{
        schemaVersion: 2,
        target: key,
        result: "passed",
        observedAt: `2026-09-${String(targetIndex + 11).padStart(2, "0")}T12:00:00Z`,
        report: { url: `https://example.com/reports/${key}`, sha256: String(targetIndex + 1).repeat(64) },
        environment: {
          os: key === "windows-x86_64" ? "windows" : key === "linux-x86_64" ? "linux" : "macos",
          osVersion: "test-os-version",
          architecture: key.endsWith("aarch64") ? "aarch64" : "x86_64",
          installationMode: TARGET_CONTRACTS[key].installation,
        },
        transition: {
          fromVersion: pair.from,
          toVersion: pair.to,
          runningVersionBefore: pair.from,
          runningVersionAfter: pair.to,
          result: "passed",
          falseSuccessObserved: false,
          forcedDowngradeObserved: false,
        },
        builds: {
          from: buildProof(key, pair.from, targetIndex * 2),
          to: buildProof(key, pair.to, targetIndex * 2 + 1),
        },
        feed: { url: PUBLIC_FEED_URL, version: pair.to, sha256: "7".repeat(64), commitSha: "c".repeat(40), observedAt: "2026-09-12T12:00:00Z" },
        preservation: Object.fromEntries(REQUIRED_PRESERVATION_CHECKS.map((name) => [name, name === "gitHistory" ? "unchanged" : "passed"])),
        failureCases: REQUIRED_FAILURE_CASES.map((name) => ({ name, result: "passed", falseSuccessObserved: false, forcedDowngradeObserved: false })),
        replacementSafety: key.startsWith("darwin-")
          ? { result: "passed", independentReviewUrl: "https://example.com/reviews/macos-replacement", testReportSha256: "8".repeat(64) }
          : { result: "not_applicable" },
      }] : [],
    })),
  };
}

function signedMatrix(version) {
  const root = tempDir("gitodile-publication-");
  const identity = candidate(version);
  for (const target of REQUIRED_TARGETS) {
    const directory = path.join(root, target);
    fs.mkdirSync(directory, { recursive: true });
    const artifacts = [];
    const updaterName = target === "windows-x86_64" ? `GitOdile_${version}_setup.exe` : target.startsWith("darwin-") ? `GitOdile_${version}_${target}.app.tar.gz` : `GitOdile_${version}.AppImage`;
    if (target.startsWith("darwin-")) {
      const installer = path.join(directory, `GitOdile_${version}_${target}.dmg`);
      fs.writeFileSync(installer, `installer-${target}`);
      artifacts.push({ role: "first-install", file: installer });
    }
    const updater = path.join(directory, updaterName);
    const signature = `${updater}.sig`;
    fs.writeFileSync(updater, `signed-${target}-${version}`);
    fs.writeFileSync(signature, `signature-${target}`);
    artifacts.push({ role: target.startsWith("darwin-") ? "updater" : "first-install-and-updater", file: updater }, { role: "updater-signature", file: signature });
    const deferredWindows = target === "windows-x86_64";
    const evidence = createEvidence({ candidate: identity, target, phase: "signed", artifacts, trust: {
      updater: { result: "passed", publicIdentity: "test-key" },
      operatingSystem: target === "linux-x86_64"
        ? { result: "not_applicable" }
        : deferredWindows
          ? { result: "not_checked", reason: "authenticode_deferred", publicIdentity: null }
          : { result: "passed", publicIdentity: "test-os" },
      notarization: { result: target.startsWith("darwin-") ? "passed" : "not_applicable" },
    } });
    fs.writeFileSync(path.join(directory, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  }
  fs.writeFileSync(path.join(root, "matrix.json"), `${JSON.stringify({ schemaVersion: 1, source: identity.source, release: identity.release, targets: identity.matrix.requiredTargets, result: "passed", publicPromotionAllowed: false }, null, 2)}\n`);
  return root;
}

test("the manifest is rendered from the release's real publication time and no draft-only mode exists", () => {
  const root = signedMatrix("0.3.0");
  const plan = preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(false), mode: "testing" });
  assert.equal(Object.hasOwn(plan.manifest, "pub_date"), false, "the staged plan cannot know when the release will be published");
  assert.equal(Object.hasOwn(plan.release, "publishedAt"), false);
  assert.deepEqual(plan.assets.map((asset) => asset.fileName).filter((name) => name === "latest.json" || name === "SHA256SUMS"), [],
    "derived assets are rendered by the publish job, not staged");
  const first = renderPublication(plan, PUBLISHED_AT);
  assert.equal(first.manifest.pub_date, PUBLISHED_AT);
  assert.deepEqual(Object.keys(first.manifest), ["version", "notes", "pub_date", "platforms"]);
  assert.deepEqual(first.assets.map((asset) => asset.fileName), ["latest.json", "SHA256SUMS"]);
  assert.match(first.assets[1].content, /  latest\.json\n/);
  // A retry with the same publication time renders byte-identical assets.
  const again = renderPublication(plan, PUBLISHED_AT);
  assert.equal(again.manifestBytes, first.manifestBytes);
  assert.deepEqual(again.assets.map((asset) => asset.sha256), first.assets.map((asset) => asset.sha256));
  assert.notEqual(renderPublication(plan, "2026-09-14T11:13:06Z").manifestBytes, first.manifestBytes);
  for (const invalid of [null, "", "2026-09-14T11:13:05.000Z", "2026-09-14 11:13:05Z", "2026-13-01T00:00:00Z"]) {
    expectCode("publication_date_invalid", () => renderPublication(plan, invalid));
  }
  expectCode("invalid_mode", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(false), mode: "validation-draft" }));
});

test("the publication mode is derived from the qualification registry alone", () => {
  // A release is production only once the registry proves every enabled
  // target and production approval; until then it publishes as testing.
  assert.equal(derivePublicationMode(qualification(false)), "testing");
  assert.equal(derivePublicationMode(qualification(true)), "production");
  // Deny by default: anything short of a fully qualified registry keeps the notice.
  const partial = qualification(true);
  const linuxIndex = partial.targets.findIndex(({ key }) => key === "linux-x86_64");
  partial.targets[linuxIndex] = { key: "linux-x86_64", status: "qualification_required", evidence: [] };
  assert.equal(derivePublicationMode(partial), "testing");
  const unapproved = qualification(true);
  unapproved.productionPromotion = { enabled: false, workingNameClearance: "not_evidenced", approvedAt: null, evidence: null };
  assert.equal(derivePublicationMode(unapproved), "testing");
  const wrongKey = qualification(true);
  wrongKey.productionPromotion.evidence.updaterPublicKeyId = "another-key";
  assert.equal(derivePublicationMode(wrongKey), "testing");
  assert.equal(derivePublicationMode({ schemaVersion: 3 }), "testing");
  assert.equal(derivePublicationMode(null), "testing");
  assert.deepEqual(PUBLICATION_MODES, ["testing", "production"]);
});

test("a prerelease version is never published", () => {
  // The candidate fixture cannot even be built for a prerelease: the version is
  // refused before any matrix, evidence or feed is involved.
  expectCode("invalid_tag", () => signedMatrix("0.3.0-beta.2"));
  const root = signedMatrix("0.3.0");
  const matrixPath = path.join(root, "matrix.json");
  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
  matrix.release.version = "0.3.0-beta.2";
  matrix.source.tag = "v0.3.0-beta.2";
  fs.writeFileSync(matrixPath, JSON.stringify(matrix));
  expectCode("invalid_tag", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(false), mode: "testing" }));
});

test("the manifest carries the release's bilingual highlights for the update dialog", () => {
  const root = signedMatrix("0.3.0");
  const line = { id: "fasterUpdates", icon: "cloud-download", en: "Faster updates.", es: "Actualizaciones más rápidas." };
  const highlights = { version: "0.3.0", date: "2026-09-14", highlights: [line] };
  const plan = preparePublication({ signedDirectory: root, notesMarkdown: "Notes", highlights, qualification: qualification(false), mode: "testing" });
  const rendered = renderPublication(plan, PUBLISHED_AT);
  assert.deepEqual(Object.keys(rendered.manifest), ["version", "notes", "highlights", "pub_date", "platforms"]);
  assert.deepEqual(rendered.manifest.highlights, [line]);
  // An empty list adds no field: the app then shows the notes.
  const empty = preparePublication({ signedDirectory: signedMatrix("0.3.0"), notesMarkdown: "Notes", highlights: { ...highlights, highlights: [] }, qualification: qualification(false), mode: "testing" });
  assert.equal(Object.hasOwn(renderPublication(empty, PUBLISHED_AT).manifest, "highlights"), false);
  assert.throws(() => manifestHighlights({ ...highlights, version: "0.2.9" }, "0.3.0"), /describes 0\.2\.9/);
  assert.throws(() => manifestHighlights({ ...highlights, highlights: [{ ...line, en: "<b>Faster</b>" }] }, "0.3.0"), /bounded plain-text line/);
  assert.throws(() => manifestHighlights({ ...highlights, highlights: [{ ...line, es: "x".repeat(241) }] }, "0.3.0"), /bounded plain-text line/);
  assert.throws(() => manifestHighlights({ ...highlights, highlights: Array.from({ length: 9 }, (_, index) => ({ ...line, id: `line${index}` })) }, "0.3.0"), /at most 8/);
});

test("manifest notes keep paragraphs and bullets, unwrap soft line breaks and stay bounded", () => {
  const markdown = [
    "# GitOdile 0.3.0",
    "",
    "This testing release reworks how updating looks and reads inside the app. It",
    "is the first release whose notes describe a user-facing change.",
    "",
    "- Updates have their own section in Settings: the installed version, one",
    "  status line, and the switch for the startup check.",
    "* The startup check is on by default. See [Settings](https://example.invalid).",
    "",
    "",
    "",
    "Publishing this release does not declare either target qualified.",
    "",
  ].join("\n");
  assert.equal(normalizeNotes(markdown), [
    "GitOdile 0.3.0",
    "",
    "This testing release reworks how updating looks and reads inside the app. It is the first release whose notes describe a user-facing change.",
    "",
    "- Updates have their own section in Settings: the installed version, one status line, and the switch for the startup check.",
    "- The startup check is on by default. See Settings.",
    "",
    "Publishing this release does not declare either target qualified.",
  ].join("\n"));
  assert.equal(normalizeNotes(`${TESTING_NOTICE}\n\n# Title\n\nBody\r\nwrapped.\n`),
    "Testing release: Windows and Linux installed-update qualification is not complete. This release does not claim platform qualification. Windows Authenticode is deferred.\n\nVersión de prueba: la cualificación de actualización instalada en Windows y Linux no está completa. Esta versión no declara cualificación de plataforma. Authenticode de Windows está aplazado.\n\nTitle\n\nBody wrapped.");
  assert.equal(normalizeNotes("Fenced:\n\n```sh\nrm -rf /\n```\n\nAfter \t  tabs   and   spaces\n---\n1. first\n2) second"), "Fenced:\n\nAfter tabs and spaces\n\n- first\n- second");
  expectCode("notes_too_large", () => normalizeNotes("x".repeat(16_385)));
  expectCode("secret_material", () => normalizeNotes("See https://user:token@example.invalid/private"));
});

test("production is denied while every enabled target remains qualification_required", () => {
  const root = signedMatrix("0.3.0");
  expectCode("production_not_approved", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(false), mode: "production" }));
  const partial = qualification(true);
  const linuxIndex = partial.targets.findIndex(({ key }) => key === "linux-x86_64");
  partial.targets[linuxIndex] = { key: "linux-x86_64", status: "qualification_required", evidence: [] };
  expectCode("qualification_required", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: partial, mode: "production" }));
});

test("testing publishes a Tauri-signed release without claiming qualification and advances the feed", () => {
  const root = signedMatrix("0.3.0");
  const plan = preparePublication({
    signedDirectory: root,
    notesMarkdown: "# First single-channel release\n\n<!-- gitodile-highlights:start -->\n## Highlights\n\n- Everyone gets every release.\n<!-- gitodile-highlights:end -->\n\nWindows and Linux remain unqualified testing downloads.",
    qualification: qualification(false),
    mode: "testing",
  });
  assert.equal(plan.mode, "testing");
  assert.deepEqual(plan.release, { version: "0.3.0" });
  assert.deepEqual(plan.qualification, { productionAllowed: false, testingAllowed: true, qualifiedTargets: [] });
  assert.deepEqual(Object.keys(plan.manifest.platforms), ["windows-x86_64", "linux-x86_64"]);
  assert.equal(plan.notesMarkdown, `${TESTING_NOTICE}\n\n# First single-channel release\n\n<!-- gitodile-highlights:start -->\n## Highlights\n\n- Everyone gets every release.\n<!-- gitodile-highlights:end -->\n\nWindows and Linux remain unqualified testing downloads.`);
  assert.match(plan.manifest.notes, /^Testing release: .*does not claim platform qualification\. Windows Authenticode is deferred\.\n\nVersión de prueba/);
  // The block markers never reach the manifest; the rendered lines do.
  assert.doesNotMatch(plan.manifest.notes, /gitodile-highlights|<!--/);
  assert.match(plan.manifest.notes, /Highlights\n\n- Everyone gets every release\.\n\nWindows and Linux/);
  const feeds = feedsForPromotion(rendered(plan), { latest: { version: "0.2.12" } });
  assert.deepEqual(FEED_FILES, ["latest"]);
  assert.deepEqual(Object.keys(feeds), ["latest"]);
  assert.equal(typeof feeds.latest, "string");
  assert.equal(JSON.parse(feeds.latest).pub_date, PUBLISHED_AT);
  expectCode("feed_regression", () => feedsForPromotion(rendered(plan), { latest: { version: "0.3.1" } }));
  expectCode("promotion_forbidden", () => feedsForPromotion({ ...rendered(plan), mode: "production" }, {}));
  expectCode("promotion_forbidden", () => feedsForPromotion({ ...rendered(plan), mode: "stable-testing" }, {}));
});

test("testing rejects macOS candidates", () => {
  const advertisedMac = qualification(false);
  const macIndex = advertisedMac.releaseMatrix.disabledTargets.findIndex(({ key }) => key === "darwin-aarch64");
  advertisedMac.releaseMatrix.disabledTargets[macIndex] = { key: "darwin-aarch64", status: "qualified", evidence: [{}] };
  expectCode("qualification_invalid", () => preparePublication({ signedDirectory: signedMatrix("0.3.0"), notesMarkdown: "Testing", qualification: advertisedMac, mode: "testing" }));
  for (const retired of ["qualified", "stable-testing", "validation-draft"]) {
    expectCode("invalid_mode", () => preparePublication({ signedDirectory: signedMatrix("0.3.0"), notesMarkdown: "Testing", qualification: qualification(false), mode: retired }));
  }
});

test("qualification evidence is bound to real consecutive public releases, not to versions in code", () => {
  for (const pair of [PAIR, { from: "0.2.12", to: "0.3.0" }, { from: "0.3.0", to: "0.4.2" }]) {
    const registry = qualification(true, pair);
    for (const target of REQUIRED_TARGETS) {
      assert.equal(validateTargetEvidence(registry.targets.find(({ key }) => key === target), target), KEY_ID, `${pair.from} -> ${pair.to} ${target}`);
    }
  }
  for (const pair of [
    { from: "0.3.1", to: "0.3.0" },
    { from: "0.3.0", to: "0.3.0" },
    { from: "0.3.0", to: "0.4.0-beta.1" },
    { from: "0.2.0-alpha.1", to: "0.3.0" },
  ]) {
    const registry = qualification(true, pair);
    assert.equal(validateTargetEvidence(registry.targets[0], "windows-x86_64"), null, `${pair.from} -> ${pair.to}`);
  }
  const retired = qualification(true);
  retired.validationQualification = { status: "pending" };
  expectCode("qualification_invalid", () => preparePublication({ signedDirectory: signedMatrix("0.3.0"), notesMarkdown: "Notes", qualification: retired, mode: "production" }));
  const oldSchema = qualification(true);
  oldSchema.schemaVersion = 3;
  expectCode("qualification_invalid", () => preparePublication({ signedDirectory: signedMatrix("0.3.0"), notesMarkdown: "Notes", qualification: oldSchema, mode: "production" }));
});

test("production rejects shallow, cross-target, wrong-key, off-repository and incomplete qualification claims", () => {
  const root = signedMatrix("0.3.0");
  const production = (registry) => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: registry, mode: "production" });
  const shallow = qualification(true);
  shallow.targets[0].evidence = [{
    version: "0.3.0",
    installedVersion: "0.3.1",
    result: "passed",
    observedAt: "2026-09-11T12:00:00Z",
    installationMode: "windows_nsis_per_user",
    signedMatrixSha256: "1".repeat(64),
    runUrl: "https://github.com/martinezelx/gitodile/actions/runs/1",
  }];
  expectCode("qualification_required", () => production(shallow));

  const crossTarget = qualification(true);
  const linuxIndex = crossTarget.targets.findIndex(({ key }) => key === "linux-x86_64");
  crossTarget.targets[linuxIndex].evidence[0].target = "windows-x86_64";
  expectCode("qualification_required", () => production(crossTarget));

  const mixedKey = qualification(true);
  mixedKey.targets[0].evidence[0].builds.to.updaterSignature.publicKeyId = "unexpected-key";
  expectCode("qualification_required", () => production(mixedKey));

  const unapprovedKey = qualification(true);
  unapprovedKey.productionPromotion.evidence.updaterPublicKeyId = "another-key";
  expectCode("qualification_invalid", () => production(unapprovedKey));

  const foreignAsset = qualification(true);
  foreignAsset.targets[0].evidence[0].builds.to.updaterArtifact.anonymousUrl = "https://evil.invalid/GitOdile.exe";
  expectCode("qualification_required", () => production(foreignAsset));

  const foreignRelease = qualification(true);
  foreignRelease.targets[0].evidence[0].builds.from.publicReleaseUrl = `https://github.com/martinezelx/gitodile-fork/releases/tag/v${PAIR.from}`;
  expectCode("qualification_required", () => production(foreignRelease));

  const wrongFeed = qualification(true);
  wrongFeed.targets[linuxIndex].evidence[0].feed.url = "https://raw.githubusercontent.com/martinezelx/gitodile/main/updates/stable.json";
  expectCode("qualification_required", () => production(wrongFeed));

  const incompleteFailureMatrix = qualification(true);
  incompleteFailureMatrix.targets[linuxIndex].evidence[0].failureCases.pop();
  expectCode("qualification_required", () => production(incompleteFailureMatrix));

  const incompletePublisher = qualification(true);
  delete incompletePublisher.productionPromotion.evidence.publisher.anonymousDownloads;
  expectCode("production_not_approved", () => production(incompletePublisher));

  const advertisedMac = qualification(true);
  const macIndex = advertisedMac.targets.findIndex(({ key }) => key === "darwin-aarch64");
  advertisedMac.targets[macIndex] = { key: "darwin-aarch64", status: "qualified", evidence: [{}] };
  expectCode("qualification_invalid", () => production(advertisedMac));
});

test("a complete qualified Windows and Linux matrix creates version-specific manifest entries", () => {
  const root = signedMatrix("0.3.0");
  const plan = preparePublication({ signedDirectory: root, notesMarkdown: "# Safer updates\n\nAll enabled targets.", qualification: qualification(true), mode: "production" });
  assert.deepEqual(plan.qualification, { productionAllowed: true, testingAllowed: false, qualifiedTargets: [...REQUIRED_TARGETS] });
  assert.deepEqual(Object.keys(plan.manifest.platforms), REQUIRED_TARGETS);
  assert.ok(Object.values(plan.manifest.platforms).every((entry) => entry.url.includes("/v0.3.0/")));
  assert.equal(plan.manifest.notes, "Safer updates\n\nAll enabled targets.");
  assert.doesNotMatch(plan.notesMarkdown, /Testing release/);
});

test("mixed provenance, incomplete matrices and tampered bytes fail closed", () => {
  const root = signedMatrix("0.3.0");
  const evidencePath = path.join(root, "windows-x86_64", "evidence.json");
  const evidence = JSON.parse(fs.readFileSync(evidencePath));
  evidence.source.sha = "b".repeat(40);
  fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  expectCode("provenance_mismatch", () => preparePublication({ signedDirectory: root, notesMarkdown: "Notes", qualification: qualification(true), mode: "production" }));

  const incomplete = signedMatrix("0.3.0");
  fs.rmSync(path.join(incomplete, "linux-x86_64"), { recursive: true });
  expectCode("matrix_incomplete", () => preparePublication({ signedDirectory: incomplete, notesMarkdown: "Notes", qualification: qualification(true), mode: "production" }));

  const tampered = signedMatrix("0.3.0");
  fs.appendFileSync(path.join(tampered, "windows-x86_64", "GitOdile_0.3.0_setup.exe"), "tampered");
  expectCode("hash_mismatch", () => preparePublication({ signedDirectory: tampered, notesMarkdown: "Notes", qualification: qualification(true), mode: "production" }));
});

test("feed promotion keeps release order without regression or relabeling", () => {
  const first = preparePublication({ signedDirectory: signedMatrix("0.3.0"), notesMarkdown: "First", qualification: qualification(false), mode: "testing" });
  const firstFeeds = feedsForPromotion(rendered(first), {});
  assert.deepEqual(Object.keys(firstFeeds), ["latest"]);
  // The same version with the same bytes is a no-op; different bytes conflict.
  const current = { latest: JSON.parse(firstFeeds.latest) };
  assert.deepEqual(feedsForPromotion(rendered(first), current), { latest: null });
  expectCode("feed_conflict", () => feedsForPromotion(rendered(first, "2026-09-14T11:13:06Z"), current));

  const next = preparePublication({ signedDirectory: signedMatrix("0.3.1"), notesMarkdown: "Next", qualification: qualification(true), mode: "production" });
  const updates = feedsForPromotion(rendered(next), current);
  assert.equal(typeof updates.latest, "string");
  assert.equal(compareReleaseVersions("0.3.0", "0.2.12"), 1);
  expectCode("invalid_tag", () => compareReleaseVersions("0.3.0", "0.3.0-beta.1"));
});

test("draft assets are uploaded or replaced; finalized releases are never repaired or overwritten", () => {
  const expected = [{ fileName: "GitOdile.exe", size: 4, sha256: "a".repeat(64) }];
  assert.deepEqual(reconcileAssets(expected, [], new Map(), false), expected);
  expectCode("finalized_asset_missing", () => reconcileAssets(expected, [], new Map(), true));
  const stale = { id: 7, name: "GitOdile.exe", size: 4 };
  assert.deepEqual(reconcileAssets(expected, [stale], new Map([["GitOdile.exe", "b".repeat(64)]]), false), [{ ...expected[0], replaces: stale }]);
  assert.deepEqual(reconcileAssets(expected, [stale], new Map([["GitOdile.exe", "a".repeat(64)]]), false), []);
  expectCode("immutable_asset_conflict", () => reconcileAssets(expected, [stale], new Map([["GitOdile.exe", "b".repeat(64)]]), true));
  expectCode("asset_conflict", () => reconcileAssets(expected, [{ name: "private-source.zip", size: 1 }], new Map(), false));
});

test("anonymous verification accepts exact bytes and rejects unavailable or changed downloads", async () => {
  const bytes = Buffer.from("verified release bytes");
  const hash = await anonymousHash("https://example.invalid/asset", async () => new Response(bytes, { status: 200 }));
  assert.equal(hash, (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(ANONYMOUS_RETRY, { attempts: 6, delayMs: 10_000 });
  let attempts = 0;
  const waits = [];
  const retry = { attempts: 6, delayMs: 10_000, sleep: async (ms) => { waits.push(ms); } };
  await assert.rejects(
    anonymousHash("https://example.invalid/asset", async () => { attempts += 1; return new Response("no", { status: 503 }); }, retry),
    (error) => error instanceof ReleaseValidationError && error.code === "anonymous_download_failed" && /after 6 attempts: HTTP 503/.test(error.message),
  );
  assert.equal(attempts, 6);
  assert.deepEqual(waits, Array(5).fill(10_000), "the bounded retry waits between attempts, not before the first");
  attempts = 0;
  const late = await anonymousHash("https://example.invalid/asset", async () => {
    attempts += 1;
    if (attempts < 3) throw new Error("connection reset");
    return attempts < 5 ? new Response("not yet", { status: 404 }) : new Response(bytes, { status: 200 });
  }, retry);
  assert.equal(late, hash);
  assert.equal(attempts, 5);
  expectCode("immutable_asset_conflict", () => reconcileAssets(
    [{ fileName: "asset", size: bytes.length, sha256: "a".repeat(64) }],
    [{ name: "asset", size: bytes.length }], new Map([["asset", hash]]), true,
  ));
});

test("feed publication uses one non-forced compare-and-swap ref update", async () => {
  const calls = [];
  const client = { api: async (endpoint, options = {}) => {
    calls.push({ endpoint, options });
    if (endpoint.startsWith("/git/commits/") && options.method === undefined) return { tree: { sha: "base-tree" } };
    if (endpoint === "/git/blobs") return { sha: `blob-${calls.length}` };
    if (endpoint === "/git/trees") return { sha: "next-tree" };
    if (endpoint === "/git/commits") return { sha: "next-commit" };
    if (endpoint === "/git/refs/heads/main") throw new ReleaseValidationError("github_api", "HTTP 422 non-fast-forward");
    throw new Error(`unexpected endpoint ${endpoint}`);
  } };
  await assert.rejects(
    atomicPublicCommit(client, "base-commit", { "updates/latest.json": "{}\n", "README.md": "# Feedback\n" }, "release"),
    (error) => error instanceof ReleaseValidationError && error.code === "github_api",
  );
  const update = calls.at(-1);
  assert.equal(update.endpoint, "/git/refs/heads/main");
  assert.deepEqual(JSON.parse(update.options.body), { sha: "next-commit", force: false });
  assert.equal(calls.filter((call) => call.endpoint === "/git/commits").length, 1);
});


/** A destination that behaves like GitHub: drafts are absent from
 * `/releases/tags/{tag}` and present in `/releases`; asset bytes are served
 * authenticated by API URL while draft and anonymously by browser URL once
 * published; `main` advances through the Git data API. */
function fakeDestination({ initialRelease = null, initialFiles = {} } = {}) {
  const state = {
    mainSha: "c".repeat(40),
    tagSha: null,
    releases: initialRelease ? [initialRelease] : [],
    files: { ...initialFiles },
    blobs: new Map(),
    trees: new Map(),
    commits: new Map(),
    calls: [],
    nextId: 1000,
    publishedAt: PUBLISHED_AT,
  };
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = async (url, options = {}) => {
    const method = options.method ?? "GET";
    const { pathname, searchParams } = new URL(url);
    state.calls.push(`${method} ${pathname}`);
    const api = pathname.replace("/repos/martinezelx/gitodile", "");
    if (pathname.startsWith("/assets/")) {
      const asset = state.releases.flatMap((release) => release.assets).find((item) => item.url === url || item.browser_download_url === url);
      if (!asset) return new Response("missing", { status: 404 });
      const release = state.releases.find((item) => item.assets.includes(asset));
      const anonymous = !options.headers?.Authorization;
      if (anonymous && release.draft) return new Response("draft assets are not public", { status: 404 });
      return new Response(asset.bytes, { status: 200 });
    }
    if (api === "" && method === "GET") return json({ visibility: "public", archived: false, default_branch: "main" });
    if (api === "/git/ref/heads/main") return json({ object: { sha: state.mainSha } });
    if (api.startsWith("/git/ref/tags/")) return state.tagSha ? json({ object: { type: "commit", sha: state.tagSha } }) : json({ message: "Not Found" }, 404);
    if (api === "/git/refs" && method === "POST") { state.tagSha = JSON.parse(options.body).sha; return json({}, 201); }
    if (api.startsWith("/releases/tags/")) {
      const release = state.releases.find((item) => item.tag_name === decodeURIComponent(api.slice("/releases/tags/".length)) && !item.draft);
      return release ? json(release) : json({ message: "Not Found" }, 404);
    }
    if (api === "/releases" && method === "GET") return json(searchParams.get("page") === "1" ? state.releases : []);
    if (api === "/releases" && method === "POST") {
      const body = JSON.parse(options.body);
      const release = { id: state.nextId++, tag_name: body.tag_name, draft: body.draft, prerelease: body.prerelease, body: body.body, assets: [],
        upload_url: `https://uploads.example/releases/${state.nextId - 1}/assets{?name,label}` };
      state.releases.push(release);
      return json(release, 201);
    }
    if (pathname.startsWith("/releases/") && url.startsWith("https://uploads.example/")) {
      const release = state.releases.find((item) => item.upload_url.startsWith(`https://uploads.example/releases/${item.id}`));
      const name = searchParams.get("name");
      const bytes = Buffer.from(options.body);
      release.assets.push({ id: state.nextId, name, size: bytes.length, bytes, url: `https://api.example/assets/${state.nextId}`, browser_download_url: `https://public.example/assets/${state.nextId++}/${name}` });
      return json({}, 201);
    }
    const assetById = api.match(/^\/releases\/assets\/(\d+)$/);
    if (assetById && method === "DELETE") {
      const release = state.releases.find((item) => item.assets.some((asset) => asset.id === Number(assetById[1])));
      if (!release) return json({ message: "Not Found" }, 404);
      if (!release.draft) return json({ message: "published assets are immutable here" }, 422);
      release.assets = release.assets.filter((asset) => asset.id !== Number(assetById[1]));
      return new Response(null, { status: 204 });
    }
    const releaseById = api.match(/^\/releases\/(\d+)$/);
    if (releaseById) {
      const release = state.releases.find((item) => item.id === Number(releaseById[1]));
      if (!release) return json({ message: "Not Found" }, 404);
      if (method === "PATCH") {
        const wasDraft = release.draft;
        Object.assign(release, JSON.parse(options.body));
        if (wasDraft && !release.draft) release.published_at = state.publishedAt;
      }
      return json(release);
    }
    if (api.startsWith("/contents/")) {
      const file = decodeURIComponent(api.slice("/contents/".length).split("?")[0]);
      return state.files[file] === undefined
        ? json({ message: "Not Found" }, 404)
        : json({ encoding: "base64", content: Buffer.from(state.files[file]).toString("base64"), sha: "f".repeat(40) });
    }
    if (api.startsWith("/git/commits/") && method === "GET") return json({ tree: { sha: "t".repeat(40) } });
    if (api === "/git/blobs") { const sha = `b${state.blobs.size}`.padEnd(40, "0"); state.blobs.set(sha, Buffer.from(JSON.parse(options.body).content, "base64").toString("utf8")); return json({ sha }, 201); }
    if (api === "/git/trees") { const sha = `e${state.trees.size}`.padEnd(40, "0"); state.trees.set(sha, JSON.parse(options.body).tree); return json({ sha }, 201); }
    if (api === "/git/commits" && method === "POST") { const sha = `d${state.commits.size}`.padEnd(40, "0"); state.commits.set(sha, JSON.parse(options.body)); return json({ sha }, 201); }
    if (api === "/git/refs/heads/main" && method === "PATCH") {
      const commit = state.commits.get(JSON.parse(options.body).sha);
      for (const entry of state.trees.get(commit.tree)) state.files[entry.path] = state.blobs.get(entry.sha);
      state.mainSha = JSON.parse(options.body).sha;
      return json({});
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  return { state, fetchImpl };
}

function stagedPublication(version, mode) {
  const signed = signedMatrix(version);
  const output = path.join(tempDir("gitodile-publish-"), "bundle");
  const notes = path.join(path.dirname(output), "notes.md");
  fs.writeFileSync(notes, `# GitOdile ${version}\n\nFirst single-channel release.\n`);
  const qualificationFile = path.join(path.dirname(output), "qualification.json");
  fs.writeFileSync(qualificationFile, JSON.stringify(qualification(false)));
  const highlights = path.join(path.dirname(output), "highlights.json");
  fs.writeFileSync(highlights, JSON.stringify({ version, date: "2026-09-14", highlights: [{ id: "firstRelease", icon: "sparkles", en: "First single-channel release.", es: "Primera versión con un solo canal." }] }));
  runPrepareCli(["--signed", signed, "--notes", notes, "--highlights", highlights, "--qualification", qualificationFile, "--mode", mode, "--output", output]);
  assert.deepEqual(fs.readdirSync(output).filter((name) => name === "latest.json" || name === "SHA256SUMS"), []);
  return output;
}

function publishStaged(directory, fetchImpl, overrides = {}) {
  return publish({ directory, token: "t", sourceRun: SOURCE_RUN, sourceRepository: "martinezelx/gitodile", fetchImpl, retry: FAST_RETRY, ...overrides });
}

const SOURCE_RUN = {
  id: 34907058498,
  name: "Release v0.3.0 at 977aa58bd3fac28cfcdfa3826ad7074188f9cac5",
  event: "workflow_dispatch",
  status: "in_progress",
  conclusion: null,
  path: ".github/workflows/release-pipeline.yml",
  head_branch: "main",
  repository: { full_name: "martinezelx/gitodile" },
};

test("a first publication creates the draft, publishes it, verifies anonymous bytes and advances the feed", async () => {
  const directory = stagedPublication("0.3.0", "testing");
  const { state, fetchImpl } = fakeDestination();
  const result = await publishStaged(directory, fetchImpl, { token: "destination-token" });
  assert.equal(result.state, "published");
  assert.equal(result.publishedAt, PUBLISHED_AT);
  assert.deepEqual(result.feedsChanged, ["latest"]);
  const [release] = state.releases;
  assert.equal(release.draft, false);
  assert.equal(release.prerelease, false);
  assert.deepEqual(release.assets.map((asset) => asset.name).sort(), [
    "GitOdile_0.3.0.AppImage", "GitOdile_0.3.0.AppImage.sig", "GitOdile_0.3.0_setup.exe", "GitOdile_0.3.0_setup.exe.sig", "SHA256SUMS", "latest.json",
  ]);
  // The manifest asset, the hash list and the feed all carry the instant
  // GitHub published the release, not a build or commit time.
  const manifestAsset = release.assets.find((asset) => asset.name === "latest.json");
  assert.equal(JSON.parse(manifestAsset.bytes.toString("utf8")).pub_date, PUBLISHED_AT);
  assert.equal(state.files["updates/latest.json"], manifestAsset.bytes.toString("utf8"));
  const sums = release.assets.find((asset) => asset.name === "SHA256SUMS").bytes.toString("utf8");
  assert.match(sums, new RegExp(`${(await import("node:crypto")).createHash("sha256").update(manifestAsset.bytes).digest("hex")}  latest\\.json`));
  assert.equal(JSON.parse(state.files["updates/latest.json"]).version, "0.3.0");
  assert.equal(JSON.parse(state.files["updates/latest.json"]).pub_date, PUBLISHED_AT);
  assert.equal(state.files["updates/stable.json"], undefined);
  assert.equal(state.files["README.md"], undefined, "the publisher writes the feed and nothing else");
  assert.equal(state.tagSha, "c".repeat(40));
  assert.equal(state.mainSha, result.publicCommit);
});

test("an interrupted publication resumes from an existing draft that the tag lookup cannot see", async () => {
  // The exact state left by run 34907058498: the draft exists with every
  // asset uploaded, and GET /releases/tags/{tag} answers 404 for it.
  const first = stagedPublication("0.3.0", "testing");
  const seeded = fakeDestination();
  await assert.rejects(publishStaged(first, async (url, options) => {
    if (String(url).includes("/releases/") && options?.method === "PATCH") throw new Error("network interrupted before publishing the draft");
    return seeded.fetchImpl(url, options);
  }));
  assert.equal(seeded.state.releases[0].draft, true);
  assert.equal(seeded.state.releases[0].assets.length, 4, "a draft holds the fixed assets only; the manifest waits for the publication time");
  assert.equal(seeded.state.files["updates/latest.json"], undefined);

  const uploads = () => seeded.state.calls.filter((call) => call.includes("uploads.example") || call.startsWith("POST /releases/")).length;
  const uploadsBefore = uploads();
  const retry = stagedPublication("0.3.0", "testing");
  const result = await publishStaged(retry, seeded.fetchImpl);
  assert.equal(result.state, "published");
  assert.equal(seeded.state.releases.length, 1, "the retry reuses the draft instead of creating a second release");
  assert.equal(seeded.state.releases[0].draft, false);
  assert.equal(uploads(), uploadsBefore + 2, "only the two derived assets are uploaded when every fixed asset already matches");
  assert.equal(JSON.parse(seeded.state.files["updates/latest.json"]).version, "0.3.0");
  assert.equal(JSON.parse(seeded.state.files["updates/latest.json"]).pub_date, PUBLISHED_AT);

  // A retry after publication reads the publication time back from the
  // release, renders the same bytes and finds nothing to change.
  const uploadsAfterPublish = uploads();
  const feedAfterPublish = seeded.state.files["updates/latest.json"];
  seeded.state.publishedAt = "2026-09-15T09:00:00Z";
  const again = await publishStaged(stagedPublication("0.3.0", "testing"), seeded.fetchImpl);
  assert.equal(again.state, "published");
  assert.equal(again.publishedAt, PUBLISHED_AT);
  assert.deepEqual(again.feedsChanged, [], "a completed publication reconciles without changing the feed");
  assert.equal(uploads(), uploadsAfterPublish);
  assert.equal(seeded.state.files["updates/latest.json"], feedAfterPublish);
});

test("a publication interrupted after publishing but before the manifest upload completes it with the recorded time", async () => {
  const seeded = fakeDestination();
  let published = false;
  await assert.rejects(publishStaged(stagedPublication("0.3.0", "testing"), async (url, options) => {
    if (published && String(url).startsWith("https://uploads.example/")) throw new Error("upload interrupted after publication");
    const response = await seeded.fetchImpl(url, options);
    if (String(url).includes("/releases/") && options?.method === "PATCH") published = true;
    return response;
  }));
  const [release] = seeded.state.releases;
  assert.equal(release.draft, false);
  assert.equal(release.assets.length, 4);
  assert.equal(seeded.state.files["updates/latest.json"], undefined, "no feed moves before the release is complete");

  seeded.state.publishedAt = "2026-09-15T09:00:00Z";
  const result = await publishStaged(stagedPublication("0.3.0", "testing"), seeded.fetchImpl);
  assert.equal(result.publishedAt, PUBLISHED_AT, "the manifest uses the time GitHub recorded, not the time of the retry");
  assert.equal(release.assets.length, 6);
  assert.equal(JSON.parse(seeded.state.files["updates/latest.json"]).pub_date, PUBLISHED_AT);
});

test("a stale manifest on a draft is rendered again, and a published manifest can never be replaced", async () => {
  // A draft left by the previous publisher, which staged latest.json from
  // the commit date before publishing.
  const seeded = fakeDestination();
  await assert.rejects(publishStaged(stagedPublication("0.3.0", "testing"), async (url, options) => {
    if (String(url).includes("/releases/") && options?.method === "PATCH") throw new Error("interrupted");
    return seeded.fetchImpl(url, options);
  }));
  const draft = seeded.state.releases[0];
  const stale = Buffer.from(JSON.stringify({ version: "0.3.0", notes: "", pub_date: "2026-09-14T10:51:00Z", platforms: {} }));
  draft.assets.push({ id: 4242, name: "latest.json", size: stale.length, bytes: stale, url: "https://api.example/assets/4242", browser_download_url: "https://public.example/assets/4242/latest.json" });
  const result = await publishStaged(stagedPublication("0.3.0", "testing"), seeded.fetchImpl);
  assert.equal(result.state, "published");
  assert.equal(seeded.state.calls.filter((call) => call === "DELETE /repos/martinezelx/gitodile/releases/assets/4242").length, 1, "the stale draft manifest is removed before publishing");
  const manifest = draft.assets.find((asset) => asset.name === "latest.json");
  assert.equal(JSON.parse(manifest.bytes.toString("utf8")).pub_date, PUBLISHED_AT);

  manifest.bytes = Buffer.from(JSON.stringify({ version: "0.3.0", pub_date: "2026-09-14T10:51:00Z" }));
  manifest.size = manifest.bytes.length;
  const feedBefore = seeded.state.files["updates/latest.json"];
  await assert.rejects(
    publishStaged(stagedPublication("0.3.0", "testing"), seeded.fetchImpl),
    (error) => error instanceof ReleaseValidationError && error.code === "immutable_asset_conflict",
  );
  assert.equal(seeded.state.files["updates/latest.json"], feedBefore);
});

test("a CDN that answers 404 briefly after publication is retried; a persistent 404 stops before the feed", async () => {
  const seeded = fakeDestination();
  const notFound = new Map();
  const flaky = (failures) => async (url, options) => {
    if (String(url).startsWith("https://public.example/assets/") && !options?.headers?.Authorization) {
      const seen = (notFound.get(url) ?? 0) + 1;
      notFound.set(url, seen);
      if (seen <= failures) return new Response("not yet propagated", { status: 404 });
    }
    return seeded.fetchImpl(url, options);
  };
  const result = await publishStaged(stagedPublication("0.3.0", "testing"), flaky(2));
  assert.equal(result.state, "published");
  assert.deepEqual(result.feedsChanged, ["latest"]);
  assert.ok([...notFound.values()].every((seen) => seen > 2), "every anonymous download was retried past the 404s");

  const persistent = fakeDestination();
  await assert.rejects(
    publishStaged(stagedPublication("0.3.0", "testing"), async (url, options) => {
      if (String(url).startsWith("https://public.example/assets/") && !options?.headers?.Authorization) return new Response("gone", { status: 404 });
      return persistent.fetchImpl(url, options);
    }),
    (error) => error instanceof ReleaseValidationError && error.code === "anonymous_download_failed",
  );
  assert.equal(persistent.state.releases[0].draft, false, "the release itself was published");
  assert.equal(persistent.state.files["updates/latest.json"], undefined, "the feed did not move");
  assert.equal(persistent.state.calls.some((call) => call === "PATCH /repos/martinezelx/gitodile/git/refs/heads/main"), false);
});

test("a re-dispatched pipeline replaces a draft's stale assets but can never touch a published release", async () => {
  // Run 34909190392 rebuilt v0.2.10 from scratch and met the draft
  // that run 34907058498 had filled with different installer bytes.
  const first = stagedPublication("0.3.0", "testing");
  const seeded = fakeDestination();
  await assert.rejects(publishStaged(first, async (url, options) => {
    if (String(url).includes("/releases/") && options?.method === "PATCH") throw new Error("interrupted");
    return seeded.fetchImpl(url, options);
  }));
  const draft = seeded.state.releases[0];
  const staleExe = draft.assets.find((asset) => asset.name.endsWith("_setup.exe"));
  staleExe.bytes = Buffer.from("bytes from an earlier non-reproducible build");
  staleExe.size = staleExe.bytes.length;
  const staleId = staleExe.id;

  const result = await publishStaged(stagedPublication("0.3.0", "testing"), seeded.fetchImpl);
  assert.equal(result.state, "published");
  assert.equal(seeded.state.calls.filter((call) => call === `DELETE /repos/martinezelx/gitodile/releases/assets/${staleId}`).length, 1, "only the differing draft asset is deleted");
  const published = seeded.state.releases[0];
  assert.equal(published.draft, false);
  assert.equal(published.assets.length, 6);
  assert.equal(published.assets.some((asset) => asset.id === staleId), false);
  assert.equal(JSON.parse(seeded.state.files["updates/latest.json"]).version, "0.3.0");

  // Once published, the same divergence is a hard conflict and the feed stays.
  const publishedExe = published.assets.find((asset) => asset.name.endsWith("_setup.exe"));
  publishedExe.bytes = Buffer.from("tampered after publication");
  publishedExe.size = publishedExe.bytes.length;
  const feedBefore = seeded.state.files["updates/latest.json"];
  await assert.rejects(
    publishStaged(stagedPublication("0.3.0", "testing"), seeded.fetchImpl),
    (error) => error instanceof ReleaseValidationError && error.code === "immutable_asset_conflict",
  );
  assert.equal(seeded.state.calls.filter((call) => call.startsWith("DELETE ")).length, 1, "no published asset is ever deleted");
  assert.equal(seeded.state.files["updates/latest.json"], feedBefore);
});

test("the source workflow contract rejects unsafe provenance", () => {
  // Shape observed from GET /actions/runs/34905088346: with `run-name` set,
  // the API reports the per-run title in `name`, not the workflow name.
  const run = {
    id: 34905088346,
    name: "Release v0.3.0 at 977aa58bd3fac28cfcdfa3826ad7074188f9cac5",
    event: "workflow_dispatch",
    status: "in_progress",
    conclusion: null,
    path: ".github/workflows/release-pipeline.yml",
    head_branch: "main",
    repository: { full_name: "martinezelx/gitodile" },
  };
  assert.equal(validateSourceRun(run, "martinezelx/gitodile"), true);
  assert.equal(validateSourceRun({ ...run, name: "Release v0.2.0 at 977aa58bd3fac28cfcdfa3826ad7074188f9cac5" }, "martinezelx/gitodile"), true);
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, name: "Release pipeline" }, "martinezelx/gitodile"));
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, name: "Release v0.3.0-beta.1 at 977aa58bd3fac28cfcdfa3826ad7074188f9cac5" }, "martinezelx/gitodile"));
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, name: "Release v0.2.0-alpha.1 at 977aa58bd3fac28cfcdfa3826ad7074188f9cac5" }, "martinezelx/gitodile"));
  assert.equal(validateSourceRun({ ...run, status: "completed", conclusion: "success" }, "martinezelx/gitodile"), true);
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, status: "completed", conclusion: "failure" }, "martinezelx/gitodile"));
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, status: "completed", conclusion: null }, "martinezelx/gitodile"));
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, event: "workflow_run" }, "martinezelx/gitodile"));
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, head_branch: "release/0.3.0" }, "martinezelx/gitodile"));
  expectCode("source_run_invalid", () => validateSourceRun({ ...run, path: ".github/workflows/ci.yml" }, "martinezelx/gitodile"));
});

test("publication is the final job of the single release pipeline, derives its mode, and keeps destination credentials out of staging", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const source = fs.readFileSync(path.join(root, ".github", "workflows", "release-pipeline.yml"), "utf8");
  const workflow = yaml.load(source, { schema: yaml.JSON_SCHEMA });
  // No separate publication trigger exists: the mode is derived from the
  // signed matrix, never chosen through a dispatch input.
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), ["authorization_run_id", "tag", "sha"]);
  assert.equal(workflow.jobs.publish.concurrency.group, "gitodile-publication");
  assert.equal(workflow.jobs.publish.concurrency["cancel-in-progress"], false);
  assert.doesNotMatch(JSON.stringify(workflow.jobs.stage), /GITODILE_PUBLIC_RELEASE_TOKEN|contents.:.write/);
  assert.equal(workflow.jobs.publish.steps.some((step) => step.uses?.startsWith("actions/checkout@")), false);
  assert.match(JSON.stringify(workflow.jobs.publish), /GITODILE_PUBLIC_RELEASE_TOKEN/);
  assert.doesNotMatch(JSON.stringify(workflow.jobs.publish), /GITHUB_TOKEN|github\.token|source-run-id/);
  assert.match(source, /validated-source-run\.json/);
  assert.match(source, /qualification-evidence\.mjs/);
  assert.doesNotMatch(JSON.stringify(workflow.jobs.stage), /check:publication|libwebkit2gtk/,
    "staging checks the live destination contract only; the repository gate ran on the merge SHA");
  assert.match(JSON.stringify(workflow.jobs.stage), /check-public-feedback\.mjs/);
  assert.match(source, /derivePublicationMode\(qualification\)/);
  assert.doesNotMatch(source, /published_at|committer\.date|--published-at/,
    "the publication time is GitHub's published_at, read by the publish job; staging must not invent one");
  assert.doesNotMatch(source, /validation-draft|validation-updater-signing|VALIDATION/,
    "no test-only publication mode, signing environment or feed routing may remain");
  assert.equal(workflow.jobs.publish.environment, "public-release");
  for (const match of source.matchAll(/^\s*- uses:\s*([^\s#]+)/gm)) assert.match(match[1], /@[0-9a-f]{40}$/);
});
