import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareReleaseVersions, parseReleaseVersion, ReleaseValidationError, REQUIRED_TARGETS } from "./release-candidate.mjs";
import { verifyCompleteMatrix, verifyEvidenceArtifacts } from "./release-evidence.mjs";
import { productionAllowed, validateQualificationRegistry } from "./qualification-evidence.mjs";

export const PUBLIC_REPOSITORY = "martinezelx/gitodile";
export const PUBLIC_RELEASE_ORIGIN = `https://github.com/${PUBLIC_REPOSITORY}/releases/download`;
const SOURCE_ARCHIVE = /(?:^|[-_.])(source|src)(?:[-_.]|$)/i;
const SECRET_NAME = /(?:private[-_.]?key|certificate|credential|secret|token|source[-_.]?archive)/i;
/** A release published before the qualification registry is complete:
 * updater-signed by Tauri, no platform qualification, no Authenticode. The
 * notes say so. */
export const TESTING_NOTICE = "> Testing release: Windows and Linux installed-update qualification is not complete. This release does not claim platform qualification. Windows Authenticode is deferred.\n\n> Versión de prueba: la cualificación de actualización instalada en Windows y Linux no está completa. Esta versión no declara cualificación de plataforma. Authenticode de Windows está aplazado.";
/** The public feed files a publication advances, under `updates/`: the one
 * feed every build follows (ADR 0019). */
export const FEED_FILES = Object.freeze(["latest"]);

function fail(code, message) {
  throw new ReleaseValidationError(code, message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function collectEvidenceFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...collectEvidenceFiles(item));
    else if (entry.isFile() && entry.name === "evidence.json") result.push(item);
  }
  return result;
}

export { compareReleaseVersions };

export function validateQualification(qualification, candidate, mode) {
  return validateQualificationRegistry(qualification, candidate, mode);
}

/** Plain text for the manifest that keeps the notes' structure. Markdown's
 * soft line breaks (the hard-wrapped lines of one paragraph or list item)
 * become spaces; block boundaries stay: one newline between list items, a
 * blank line between paragraphs. The app renders the text pre-wrapped, so
 * what is a paragraph here is a paragraph in the update dialog. */
export function normalizeNotes(markdown) {
  if (Buffer.byteLength(markdown, "utf8") > 16_384) fail("notes_too_large", "release notes exceed 16 KiB");
  if (/https?:\/\/[^\s/@]+:[^\s/@]+@/i.test(markdown)) fail("secret_material", "release notes contain an authenticated URL");
  const inline = markdown
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^(\s*)[*+]\s+/gm, "$1- ")
    .replace(/[`_*~]/g, "");
  const blocks = [];
  let current = null;
  for (const raw of inline.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line === "" || /^[-=]{3,}$/.test(line)) { current = null; continue; }
    const heading = line.match(/^#+\s*(.*)$/);
    if (heading) {
      current = null;
      if (heading[1]) blocks.push({ kind: "paragraph", text: heading[1] });
      continue;
    }
    const item = line.match(/^(?:-|\d+[.)])\s+(.*)$/);
    if (item) {
      current = { kind: "item", text: item[1] };
      blocks.push(current);
      continue;
    }
    const text = line.replace(/^>\s*/, "");
    if (!text) continue;
    if (current) current.text += ` ${text}`;
    else {
      current = { kind: "paragraph", text };
      blocks.push(current);
    }
  }
  return blocks
    .map((block, index) => {
      const previous = blocks[index - 1];
      const separator = !previous ? "" : previous.kind === "item" && block.kind === "item" ? "\n" : "\n\n";
      return `${separator}${block.kind === "item" ? `- ${block.text}` : block.text}`;
    })
    .join("")
    .trim();
}

function validateMatrixRecord(record, candidate) {
  if (
    record?.schemaVersion !== 1 || record?.result !== "passed" || record?.publicPromotionAllowed !== false ||
    record.source?.tag !== candidate.source.tag || record.source?.sha !== candidate.source.sha ||
    record.release?.version !== candidate.release.version ||
    JSON.stringify(record.targets) !== JSON.stringify(candidate.matrix.requiredTargets)
  ) fail("matrix_record_invalid", "private matrix authorization does not match the signed candidate");
}

export const PUBLICATION_MODES = Object.freeze(["testing", "production"]);
/** Assets rendered by the `publish` job once the release's real publication
 * time is known: the manifest carries it as `pub_date`, and the hash list
 * covers the manifest. Every other asset is fixed when the plan is prepared. */
export const DERIVED_ASSET_NAMES = Object.freeze(["latest.json", "SHA256SUMS"]);

/** The mode is derived, never chosen: `production`, without a notice, only
 * when the registry already proves every enabled target and production
 * approval; `testing`, with the notice, otherwise (ADR 0019). */
export function derivePublicationMode(qualification) {
  return productionAllowed(qualification) ? "production" : "testing";
}

/** The release's bilingual What's new lines as the feed carries them, so the
 * update dialog can say what a version brings in the reader's language
 * rather than in the English release notes. `check:docs` and the merge
 * coordinator have already validated the file against the glyph catalogue;
 * this repeats only what the feed relies on, and stays self-contained because
 * the publisher runtime ships without `highlights.mjs`. An empty list adds no
 * field, and the app then shows the notes. */
export function manifestHighlights(file, version) {
  if (file === null || typeof file !== "object" || Array.isArray(file)) fail("highlights_invalid", "highlights file must be an object");
  if (file.version !== version) fail("highlights_invalid", `highlights file describes ${file.version}, not ${version}`);
  if (!Array.isArray(file.highlights) || file.highlights.length > 8) fail("highlights_invalid", "highlights must be a list of at most 8 lines");
  return file.highlights.map((entry, index) => {
    const name = (value) => typeof value === "string" && /^[A-Za-z0-9-]{1,64}$/.test(value);
    const sentence = (value) => typeof value === "string" && value.trim() === value && value !== ""
      && [...value].length <= 240 && !/[<>\u0000-\u001f\u007f]/.test(value);
    if (!name(entry?.id) || !name(entry?.icon) || !sentence(entry?.en) || !sentence(entry?.es)) {
      fail("highlights_invalid", `highlights[${index}] is not a bounded plain-text line`);
    }
    return { id: entry.id, icon: entry.icon, en: entry.en, es: entry.es };
  });
}

export function preparePublication({ signedDirectory, notesMarkdown, highlights = null, qualification, mode, publicFiles = [] }) {
  const matrixPath = path.join(signedDirectory, "matrix.json");
  if (!fs.existsSync(matrixPath)) fail("matrix_record_missing", "private signed matrix record is missing");
  const matrix = readJson(matrixPath);
  const candidate = { schemaVersion: 1, source: matrix.source, release: matrix.release, matrix: {
    requiredTargets: matrix.targets,
    targets: matrix.targets.map((key) => ({ key })),
  } };
  if (!candidate.source?.tag || !candidate.source?.sha || !candidate.release?.version) {
    fail("matrix_record_invalid", "private matrix identity is incomplete");
  }
  const parsed = parseReleaseVersion(candidate.release.version);
  if (candidate.source.tag !== `v${parsed.version}` || candidate.release.publicPromotionAllowed !== false) {
    fail("release_identity_mismatch", "tag and version disagree");
  }
  if (JSON.stringify(matrix.targets) !== JSON.stringify(REQUIRED_TARGETS)) {
    fail("matrix_incomplete", "the signed matrix does not contain the complete required target set");
  }
  validateMatrixRecord(matrix, candidate);
  const evidenceFiles = collectEvidenceFiles(signedDirectory);
  const evidence = evidenceFiles.map((file) => {
    const item = readJson(file);
    verifyEvidenceArtifacts(item, path.dirname(file));
    return item;
  });
  const ordered = verifyCompleteMatrix(evidence, candidate, { requiredPhase: "signed" });
  const gate = validateQualification(qualification, candidate, mode);
  const publishedNotes = mode === "testing" ? `${TESTING_NOTICE}\n\n${notesMarkdown}` : notesMarkdown;
  const names = new Set(DERIVED_ASSET_NAMES);
  const assets = [];
  const platforms = {};
  for (const item of ordered) {
    const updater = item.artifacts.find((artifact) => artifact.role === "updater" || artifact.role === "first-install-and-updater");
    const signature = item.artifacts.find((artifact) => artifact.role === "updater-signature");
    if (!updater || !signature) fail("artifact_missing", `${item.target} lacks updater bytes or signature`);
    const signatureText = fs.readFileSync(path.join(path.dirname(evidenceFiles.find((file) => readJson(file).target === item.target)), signature.fileName), "utf8").trim();
    if (!signatureText || Buffer.byteLength(signatureText, "utf8") > 4096) fail("signature_invalid", `${item.target} signature is empty or oversized`);
    for (const artifact of item.artifacts) {
      if (names.has(artifact.fileName) || SECRET_NAME.test(artifact.fileName) || SOURCE_ARCHIVE.test(artifact.fileName)) {
        fail("unsafe_asset", `asset name is duplicate or forbidden: ${artifact.fileName}`);
      }
      names.add(artifact.fileName);
      assets.push({ ...artifact, target: item.target, source: path.join(path.dirname(evidenceFiles.find((file) => readJson(file).target === item.target)), artifact.fileName) });
    }
    const url = `${PUBLIC_RELEASE_ORIGIN}/${candidate.source.tag}/${encodeURIComponent(updater.fileName)}`;
    platforms[item.target] = { signature: signatureText, url, size: updater.size };
  }
  // The manifest is fixed except for `pub_date`, which is the release's real
  // publication time and therefore known only to the `publish` job.
  const feedHighlights = highlights === null ? [] : manifestHighlights(highlights, candidate.release.version);
  const manifest = {
    version: candidate.release.version,
    notes: normalizeNotes(publishedNotes),
    ...(feedHighlights.length > 0 ? { highlights: feedHighlights } : {}),
    platforms,
  };
  // Size is checked here, before the pipeline stages anything; the epoch
  // placeholder has the same length as any real timestamp.
  renderPublication({ manifest, assets }, "1970-01-01T00:00:00Z");
  for (const item of publicFiles) {
    const fileName = path.basename(item.fileName ?? item.source);
    if (names.has(fileName) || SECRET_NAME.test(fileName) || SOURCE_ARCHIVE.test(fileName)) fail("unsafe_asset", `public file name is duplicate or forbidden: ${fileName}`);
    const bytes = fs.readFileSync(item.source);
    names.add(fileName);
    assets.push({ role: item.role, target: null, fileName, size: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), source: item.source });
  }
  return {
    schemaVersion: 2,
    mode,
    destination: PUBLIC_REPOSITORY,
    source: { tag: candidate.source.tag, sha: candidate.source.sha },
    release: { version: candidate.release.version },
    qualification: gate,
    notesMarkdown: publishedNotes,
    manifest,
    assets,
  };
}

/** Completes a plan with the publication time GitHub recorded for the
 * release. The same plan and the same `published_at` render byte-identical
 * assets, which is what lets a reconciliation retry compare rather than
 * rewrite. Returns the feed manifest bytes and the two derived assets. */
export function renderPublication(plan, publishedAt) {
  const validShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(publishedAt ?? "");
  const parsedDate = validShape ? new Date(publishedAt) : null;
  if (!parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().replace(".000Z", "Z") !== publishedAt) {
    fail("publication_date_invalid", "feed publication needs the release's canonical UTC publication timestamp");
  }
  const manifest = {
    version: plan.manifest.version,
    notes: plan.manifest.notes,
    ...(plan.manifest.highlights ? { highlights: plan.manifest.highlights } : {}),
    pub_date: publishedAt,
    platforms: plan.manifest.platforms,
  };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(manifestBytes) > 262_144) fail("manifest_too_large", "manifest exceeds 256 KiB");
  const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
  const manifestAsset = { role: "manifest", target: null, fileName: "latest.json", size: Buffer.byteLength(manifestBytes), sha256: sha256(manifestBytes), content: manifestBytes };
  const sums = [...plan.assets, manifestAsset].map((asset) => `${asset.sha256}  ${asset.fileName}`).sort().join("\n") + "\n";
  const sumsAsset = { role: "hashes", target: null, fileName: "SHA256SUMS", size: Buffer.byteLength(sums), sha256: sha256(sums), content: sums };
  return { manifest, manifestBytes, assets: [manifestAsset, sumsAsset] };
}

/** The feed files to write, keyed by `FEED_FILES` name, each either the new
 * manifest bytes or `null` when that file already serves this version. A
 * feed never regresses and never takes different bytes for the same
 * version. */
export function feedsForPromotion(plan, current = {}) {
  const testing = plan.mode === "testing" && plan.qualification.testingAllowed === true;
  const production = plan.mode === "production" && plan.qualification.productionAllowed === true;
  if (!testing && !production) fail("promotion_forbidden", "only an approved testing or qualified production plan may advance feeds");
  parseReleaseVersion(plan.release.version);
  const result = {};
  for (const feed of FEED_FILES) {
    const existing = current[feed];
    if (!existing) {
      result[feed] = plan.manifestBytes;
      continue;
    }
    const comparison = compareReleaseVersions(plan.release.version, existing.version);
    if (comparison < 0) fail("feed_regression", `${feed} would regress from ${existing.version}`);
    if (comparison === 0) {
      const bytes = `${JSON.stringify(existing, null, 2)}\n`;
      if (bytes !== plan.manifestBytes) fail("feed_conflict", `${feed} already has different bytes for this version`);
      result[feed] = null;
      continue;
    }
    result[feed] = plan.manifestBytes;
  }
  return result;
}

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith("--") || argv[i + 1] === undefined) throw new Error(`invalid argument: ${argv[i] ?? "<missing>"}`);
    const key = argv[i].slice(2);
    if (key === "public-file") args.set(key, [...(args.get(key) ?? []), argv[i + 1]]);
    else args.set(key, argv[i + 1]);
  }
  return args;
}

export function runPrepareCli(argv) {
  const args = parseArgs(argv);
  const plan = preparePublication({
    signedDirectory: path.resolve(args.get("signed")),
    notesMarkdown: fs.readFileSync(path.resolve(args.get("notes")), "utf8"),
    highlights: args.has("highlights") ? readJson(path.resolve(args.get("highlights"))) : fail("highlights_missing", "--highlights is required"),
    qualification: readJson(path.resolve(args.get("qualification"))),
    mode: args.get("mode"),
    publicFiles: (args.get("public-file") ?? []).map((value) => {
      const separator = value.indexOf("=");
      if (separator < 1) throw new Error("public-file must use role=path");
      return { role: value.slice(0, separator), source: path.resolve(value.slice(separator + 1)) };
    }),
  });
  const output = path.resolve(args.get("output"));
  fs.mkdirSync(output, { recursive: true });
  for (const asset of plan.assets) {
    const destination = path.join(output, asset.fileName);
    if (asset.content !== undefined) fs.writeFileSync(destination, asset.content, { flag: "wx" });
    else fs.copyFileSync(asset.source, destination, fs.constants.COPYFILE_EXCL);
  }
  const serializable = { ...plan, assets: plan.assets.map(({ source, content, ...asset }) => asset) };
  fs.writeFileSync(path.join(output, "publication-plan.json"), `${JSON.stringify(serializable, null, 2)}\n`, { flag: "wx" });
  return plan;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const plan = runPrepareCli(process.argv.slice(2));
    process.stdout.write(`Prepared ${plan.mode} publication plan for ${plan.source.tag}.\n`);
  } catch (error) {
    const code = error instanceof ReleaseValidationError ? error.code : "internal";
    process.stderr.write(`Public release preparation failed [${code}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
