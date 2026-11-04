import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import {
  parseReleaseVersion,
  readReleaseMetadata,
  ReleaseValidationError,
} from "./release-candidate.mjs";
import { isProtectedReleasePath, NOTES_PLACEHOLDER, PROTECTED_RELEASE_PREFIXES } from "./release-prepare.mjs";
import { extractHighlightsBlock, highlightsFileName, parseHighlights, renderHighlightsBlock } from "./highlights.mjs";

export const SOURCE_REPOSITORY = "martinezelx/gitodile";
export const REQUIRED_RELEASE_CHECKS = Object.freeze([
  "Frontend checks",
  "Public feedback contract",
  "Rust checks (linux)",
  "Rust checks (windows)",
  "Rust checks (macos)",
  "Desktop release compile (linux)",
  "Desktop release compile (windows)",
  "JavaScript and TypeScript analysis",
]);

const FULL_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

function fail(code, message) {
  throw new ReleaseValidationError(code, message);
}

export function parseReleaseBranch(branch) {
  if (typeof branch !== "string" || !branch.startsWith("release/")) {
    fail("invalid_release_branch", "release branch must be exactly release/<canonical-semver>");
  }
  const version = branch.slice("release/".length);
  const release = parseReleaseVersion(version);
  if (branch !== `release/${release.version}`) fail("invalid_release_branch", "release branch is not canonical");
  return { ...release, branch, tag: `v${release.version}` };
}

function pullRequestFrom(value) {
  return value?.pull_request ?? value;
}

export function validateMergedPullRequest(value) {
  const pull = pullRequestFrom(value);
  if (value?.action !== undefined && value.action !== "closed") fail("invalid_event", "release coordination requires a closed pull request event");
  if (value?.repository?.full_name !== undefined && value.repository.full_name !== SOURCE_REPOSITORY) {
    fail("wrong_repository", "event repository is not the canonical source repository");
  }
  if (
    pull?.merged !== true || !Number.isSafeInteger(pull?.number) || pull.number <= 0 ||
    pull?.base?.ref !== "main" || pull?.base?.repo?.full_name !== SOURCE_REPOSITORY ||
    pull?.head?.repo?.full_name !== SOURCE_REPOSITORY || !FULL_SHA.test(pull?.merge_commit_sha ?? "")
  ) fail("invalid_pull_request", "pull request is not a same-repository merge into protected main");
  const release = parseReleaseBranch(pull.head.ref);
  return { ...release, pullRequestNumber: pull.number, mergeSha: pull.merge_commit_sha };
}

export function validateRequiredChecks(checkRuns) {
  if (!Array.isArray(checkRuns)) fail("checks_invalid", "check-run response is invalid");
  const latest = new Map();
  for (const check of checkRuns) {
    if (typeof check?.name !== "string" || !Number.isSafeInteger(check?.id)) continue;
    const previous = latest.get(check.name);
    if (!previous || check.id > previous.id) latest.set(check.name, check);
  }
  const pending = [];
  const failed = [];
  for (const name of REQUIRED_RELEASE_CHECKS) {
    const check = latest.get(name);
    if (!check || check.status !== "completed") pending.push(name);
    else if (check.conclusion !== "success") failed.push(name);
  }
  if (failed.length > 0) fail("required_check_failed", `required checks failed: ${failed.join(", ")}`);
  if (pending.length > 0) fail("required_checks_pending", `required checks are missing or pending: ${pending.join(", ")}`);
  return REQUIRED_RELEASE_CHECKS.map((name) => ({ name, id: latest.get(name).id, conclusion: "success" }));
}

function git(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) fail("git_error", `git ${args[0]} failed`);
  return result;
}

function readAtRevision(root, revision, file) {
  const result = git(root, ["show", `${revision}:${file}`], { allowFailure: true });
  if (result.status !== 0) fail("metadata_missing", `required release file is missing: ${file}`);
  return result.stdout;
}

export function validateReleasePreparation({ root, authorization, changedFiles }) {
  const expectedFiles = new Set([
    "README.md", "package.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", "src-tauri/tauri.conf.json",
    `docs/release/notes/${authorization.tag}.md`,
    `docs/release/highlights/${authorization.tag}.json`,
  ]);
  if (!Array.isArray(changedFiles)) fail("release_scope_invalid", "release pull request file list is invalid");
  const changes = changedFiles.map((file) => typeof file === "string" ? { filename: file, status: "modified" } : file);
  // The branch may carry the product work it releases, but never the release
  // automation itself, on either side of a rename.
  const touched = changes.flatMap((file) => [file?.filename, file?.previous_filename]).filter((file) => file !== undefined);
  if (touched.some((file) => typeof file !== "string" || isProtectedReleasePath(file))) {
    fail("release_scope_invalid", `release pull request changes protected release automation (${PROTECTED_RELEASE_PREFIXES.join(", ")}); land it on main in its own pull request first`);
  }
  if (changes.some((file) => expectedFiles.has(file.filename) && (file.previous_filename !== undefined || !new Set(["added", "modified"]).has(file.status)))) {
    fail("release_scope_invalid", "release pull request removes or renames a release-preparation file");
  }
  const names = changes.map((file) => file.filename);
  for (const file of expectedFiles) if (!names.includes(file)) fail("release_scope_invalid", `release pull request did not prepare ${file}`);
  const metadata = readReleaseMetadata(root, authorization.mergeSha);
  for (const [owner, version] of Object.entries(metadata)) if (version !== authorization.version) fail("metadata_mismatch", `${owner} does not match the release branch version`);
  const readme = readAtRevision(root, authorization.mergeSha, "README.md");
  if (!readme.includes(`Current development version: **${authorization.version}**.`)) fail("metadata_mismatch", "README current version does not match the release branch");
  const notes = readAtRevision(root, authorization.mergeSha, `docs/release/notes/${authorization.tag}.md`);
  const withoutComments = notes.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (notes.includes(NOTES_PLACEHOLDER) || withoutComments === `# GitOdile ${authorization.version}` || !withoutComments.startsWith(`# GitOdile ${authorization.version}\n`)) fail("notes_incomplete", "curated release notes are missing or still contain the preparation placeholder");
  // The app's own What's new for this version ships from the same commit the
  // tag names, so a missing or malformed file is caught here, not by users.
  const highlights = parseHighlights(highlightsFileName(authorization.version), readAtRevision(root, authorization.mergeSha, `docs/release/highlights/${authorization.tag}.json`));
  // The public notes' Highlights section is rendered from that same file,
  // so a release whose notes and What's new disagree is not tagged.
  if (extractHighlightsBlock(notes) !== renderHighlightsBlock(highlights.highlights)) {
    fail("notes_incomplete", "the release notes' highlights block is missing or does not match the highlights file; run pnpm run release:notes");
  }
  return { metadata, notesSha256: crypto.createHash("sha256").update(notes).digest("hex") };
}

export function decideTag(existingSha, expectedSha) {
  if (!FULL_SHA.test(expectedSha ?? "")) fail("invalid_revision", "expected tag revision is invalid");
  if (existingSha === null || existingSha === undefined || existingSha === "") return "create";
  if (!FULL_SHA.test(existingSha) || existingSha !== expectedSha) fail("tag_conflict", "existing release tag identifies different bytes");
  return "existing";
}

async function api(pathname, token, fetchImpl) {
  const response = await fetchImpl(`https://api.github.com/repos/${SOURCE_REPOSITORY}${pathname}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "GitOdile-release-coordinator", "X-GitHub-Api-Version": "2022-11-28" },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) fail("github_api", `GitHub ${pathname} returned HTTP ${response.status}`);
  return response.json();
}

export async function authorizeMergedRelease({ event, token, root, fetchImpl = fetch, waitSeconds = 1800, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const eventIdentity = validateMergedPullRequest(event);
  const pull = await api(`/pulls/${eventIdentity.pullRequestNumber}`, token, fetchImpl);
  const identity = validateMergedPullRequest(pull);
  if (JSON.stringify(identity) !== JSON.stringify(eventIdentity)) fail("event_changed", "live pull request identity differs from the delivered event");
  const files = [];
  for (let page = 1; ; page += 1) {
    const batch = await api(`/pulls/${identity.pullRequestNumber}/files?per_page=100&page=${page}`, token, fetchImpl);
    files.push(...batch.map(({ filename, previous_filename: previousFilename, status }) => ({
      filename,
      ...(previousFilename === undefined ? {} : { previous_filename: previousFilename }),
      status,
    })));
    if (batch.length < 100) break;
  }
  // GitHub stops listing a pull request's files at 3,000. The scope check is
  // only as good as the list, so a truncated one fails closed.
  if (!Number.isSafeInteger(pull.changed_files) || files.length !== pull.changed_files) {
    fail("release_scope_invalid", "the release pull request's file list is incomplete; split the release into smaller pull requests");
  }
  git(root, ["fetch", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main"]);
  if (git(root, ["merge-base", "--is-ancestor", identity.mergeSha, "refs/remotes/origin/main"], { allowFailure: true }).status !== 0) {
    fail("wrong_ancestry", "merge revision is not in protected main history");
  }
  const deadline = Date.now() + Math.max(0, waitSeconds) * 1000;
  let checks;
  for (;;) {
    const response = await api(`/commits/${identity.mergeSha}/check-runs?filter=latest&per_page=100`, token, fetchImpl);
    try { checks = validateRequiredChecks(response.check_runs); break; }
    catch (error) {
      if (!(error instanceof ReleaseValidationError) || error.code !== "required_checks_pending" || Date.now() >= deadline) throw error;
      await sleep(15_000);
    }
  }
  const preparation = validateReleasePreparation({ root, authorization: identity, changedFiles: files });
  return { schemaVersion: 1, repository: SOURCE_REPOSITORY, ...identity, requiredChecks: checks, changedFiles: files.map((file) => file.filename), notesSha256: preparation.notesSha256 };
}

export function validateAuthorization(value) {
  if (value?.schemaVersion !== 1 || value.repository !== SOURCE_REPOSITORY || !FULL_SHA.test(value.mergeSha ?? "")) fail("authorization_invalid", "release authorization is malformed");
  const branch = parseReleaseBranch(value.branch);
  if (branch.version !== value.version || branch.tag !== value.tag || !Number.isSafeInteger(value.pullRequestNumber)) fail("authorization_invalid", "release authorization identity is inconsistent");
  validateRequiredChecks(value.requiredChecks.map((check) => ({ ...check, status: "completed" })));
  if (!/^[0-9a-f]{64}$/.test(value.notesSha256 ?? "")) fail("authorization_invalid", "release notes identity is missing");
  return value;
}

function parseArgs(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) fail("usage", "arguments must be --name value pairs");
    result.set(argv[index].slice(2), argv[index + 1]);
  }
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const [command, ...argv] = process.argv.slice(2);
    const args = parseArgs(argv);
    if (command === "authorize") {
      const event = JSON.parse(fs.readFileSync(path.resolve(args.get("event")), "utf8"));
      const authorization = await authorizeMergedRelease({ event, token: process.env.GITHUB_TOKEN, root: path.resolve(args.get("root") ?? ".") });
      fs.writeFileSync(path.resolve(args.get("output")), `${JSON.stringify(authorization, null, 2)}\n`, { flag: "wx" });
    } else if (command === "export") {
      const authorization = validateAuthorization(JSON.parse(fs.readFileSync(path.resolve(args.get("authorization")), "utf8")));
      fs.appendFileSync(path.resolve(args.get("github-output")), `tag=${authorization.tag}\nsha=${authorization.mergeSha}\nversion=${authorization.version}\n`);
    } else fail("usage", "command must be authorize or export");
  } catch (error) {
    const code = error instanceof ReleaseValidationError ? error.code : "internal";
    process.stderr.write(`Merge-driven release rejected [${code}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
