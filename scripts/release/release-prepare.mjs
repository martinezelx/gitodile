import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HIGHLIGHTS_DIRECTORY, applyHighlightsBlock, highlightsFileName, scaffoldHighlights, todayIsoDate } from "./highlights.mjs";
import { compareReleaseVersions, parseReleaseVersion, readReleaseMetadata, ReleaseValidationError } from "./release-candidate.mjs";

const SOURCE_REPOSITORY = "martinezelx/gitodile";
const SOURCE_REMOTE = `https://github.com/${SOURCE_REPOSITORY}.git`;
export const NOTES_PLACEHOLDER = "Replace this comment with curated public release notes before opening the pull request.";

/** Paths a release pull request may not touch. A release branch may carry the
 * product work it ships, but the automation that authorizes, builds, signs and
 * publishes the release must already be on main, reviewed on its own, before
 * a merge can trigger it. */
export const PROTECTED_RELEASE_PREFIXES = Object.freeze([".github/", "scripts/release/"]);

export function isProtectedReleasePath(file) {
  return typeof file === "string" && PROTECTED_RELEASE_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function fail(code, message) {
  throw new ReleaseValidationError(code, message);
}

function git(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) fail("git_error", `git ${args[0]} failed: ${result.stderr.trim()}`);
  return result;
}

function replaceExactly(source, expression, replacement, owner) {
  const matches = source.match(new RegExp(expression.source, expression.flags.includes("g") ? expression.flags : `${expression.flags}g`));
  if (matches?.length !== 1) fail("metadata_invalid", `${owner} does not contain exactly one version field`);
  return source.replace(expression, replacement);
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function prepareRelease({ root, version, runChecks = true, expectedOrigin = SOURCE_REMOTE }) {
  const repositoryRoot = path.resolve(root);
  const release = parseReleaseVersion(version);
  const branch = `release/${release.version}`;
  if (git(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout !== "") {
    fail("working_tree_dirty", "release preparation requires a clean working tree");
  }
  const startBranch = git(repositoryRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true }).stdout.trim();
  if (startBranch === "") fail("wrong_branch", "release preparation needs a branch, not a detached HEAD");
  if (startBranch.startsWith("release/") && startBranch !== branch) {
    fail("wrong_branch", `already on ${startBranch}; it cannot be prepared as ${branch}`);
  }
  const remote = git(repositoryRoot, ["remote", "get-url", "origin"]).stdout.trim().replace(/^git@github\.com:/, "https://github.com/");
  const normalizedExpected = expectedOrigin.replace(/^git@github\.com:/, "https://github.com/");
  if (remote !== normalizedExpected && remote !== normalizedExpected.replace(/\.git$/, "")) {
    fail("wrong_repository", `origin must be ${normalizedExpected}`);
  }
  git(repositoryRoot, ["fetch", "--no-tags", "origin", "+refs/heads/main:refs/remotes/origin/main"]);
  const head = git(repositoryRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const upstream = git(repositoryRoot, ["rev-parse", "refs/remotes/origin/main"]).stdout.trim();
  if (startBranch === "main") {
    if (head !== upstream) fail("main_not_current", "local main must exactly match origin/main");
  } else {
    // A work branch becomes the release branch in place, so it must already
    // contain everything main has and must not carry release automation.
    if (git(repositoryRoot, ["merge-base", "--is-ancestor", upstream, head], { allowFailure: true }).status !== 0) {
      fail("main_not_current", `${startBranch} does not contain origin/main; merge or rebase it first`);
    }
    const protectedChanges = git(repositoryRoot, ["diff", "--name-only", "--no-renames", `${upstream}...${head}`]).stdout
      .split("\n").map((line) => line.trim()).filter(isProtectedReleasePath);
    if (protectedChanges.length > 0) {
      fail("release_scope_invalid", `release automation changes must reach main in their own pull request first: ${protectedChanges.join(", ")}`);
    }
  }
  if (startBranch !== branch && git(repositoryRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { allowFailure: true }).status === 0) {
    fail("branch_exists", `local branch already exists: ${branch}`);
  }
  if (git(repositoryRoot, ["ls-remote", "--exit-code", "--heads", "origin", branch], { allowFailure: true }).status === 0) {
    fail("branch_exists", `remote branch already exists: ${branch}`);
  }
  const current = readReleaseMetadata(repositoryRoot);
  const currentVersions = new Set(Object.values(current));
  if (currentVersions.size !== 1 || currentVersions.has(undefined)) fail("metadata_mismatch", "current version metadata is inconsistent");
  if (currentVersions.has(version)) fail("version_unchanged", "the requested version is already current");
  const currentVersion = [...currentVersions][0];
  parseReleaseVersion(currentVersion);
  if (compareReleaseVersions(version, currentVersion) <= 0) fail("version_not_newer", "the requested release version must advance the current version");

  const files = {
    package: path.join(repositoryRoot, "package.json"),
    cargo: path.join(repositoryRoot, "src-tauri", "Cargo.toml"),
    lock: path.join(repositoryRoot, "src-tauri", "Cargo.lock"),
    tauri: path.join(repositoryRoot, "src-tauri", "tauri.conf.json"),
    readme: path.join(repositoryRoot, "README.md"),
    notes: path.join(repositoryRoot, "docs", "release", "notes", `v${version}.md`),
    highlights: path.join(repositoryRoot, HIGHLIGHTS_DIRECTORY, highlightsFileName(version)),
  };
  if (fs.existsSync(files.notes)) fail("notes_exist", `release notes already exist: docs/release/notes/v${version}.md`);
  if (fs.existsSync(files.highlights)) fail("notes_exist", `release highlights already exist: ${HIGHLIGHTS_DIRECTORY}/${highlightsFileName(version)}`);
  if (startBranch === "main") git(repositoryRoot, ["switch", "-c", branch]);
  else if (startBranch !== branch) git(repositoryRoot, ["branch", "-m", branch]);
  const packageJson = JSON.parse(fs.readFileSync(files.package, "utf8"));
  packageJson.version = version;
  writeJson(files.package, packageJson);
  const tauri = JSON.parse(fs.readFileSync(files.tauri, "utf8"));
  tauri.version = version;
  writeJson(files.tauri, tauri);
  fs.writeFileSync(files.cargo, replaceExactly(
    fs.readFileSync(files.cargo, "utf8"),
    /(^\[package\][\s\S]*?^version\s*=\s*")[^"]+("\s*$)/m,
    `$1${version}$2`,
    "src-tauri/Cargo.toml",
  ));
  fs.writeFileSync(files.lock, replaceExactly(
    fs.readFileSync(files.lock, "utf8"),
    /(^name = "gitodile"\r?\nversion = ")[^"]+("\s*$)/m,
    `$1${version}$2`,
    "src-tauri/Cargo.lock",
  ));
  fs.writeFileSync(files.readme, replaceExactly(
    fs.readFileSync(files.readme, "utf8"),
    /^Current development version: \*\*[^*]+\*\*\.$/m,
    `Current development version: **${version}**.`,
    "README.md",
  ));
  // The notes start with the highlights block already in place, rendered
  // from the empty list; `release:notes` re-renders it once the file is
  // filled, and the coordinator refuses a release where the two disagree.
  fs.writeFileSync(files.notes, applyHighlightsBlock(`# GitOdile ${version}\n\n<!-- ${NOTES_PLACEHOLDER} -->\n`, []));
  fs.mkdirSync(path.dirname(files.highlights), { recursive: true });
  fs.writeFileSync(files.highlights, scaffoldHighlights(version, todayIsoDate()));

  const updated = readReleaseMetadata(repositoryRoot);
  if (Object.values(updated).some((value) => value !== version)) fail("metadata_mismatch", "prepared version metadata is inconsistent");
  if (runChecks) {
    // Node refuses to spawn a `.cmd` shim directly (EINVAL since 18.20), so
    // Windows goes through cmd.exe with a fixed, non-interpolated command line.
    const [executable, args] = process.platform === "win32"
      ? ["cmd.exe", ["/d", "/s", "/c", "pnpm run check:docs"]]
      : ["pnpm", ["run", "check:docs"]];
    const result = spawnSync(executable, args, { cwd: repositoryRoot, stdio: "inherit", windowsHide: true });
    if (result.status !== 0) fail("consistency_check_failed", "release consistency checks failed");
  }
  return {
    branch,
    renamedFrom: startBranch === "main" || startBranch === branch ? null : startBranch,
    version,
    notes: path.relative(repositoryRoot, files.notes).replaceAll("\\", "/"),
    highlights: path.relative(repositoryRoot, files.highlights).replaceAll("\\", "/"),
    // What changed since the previous release, as a reminder for whoever
    // writes the highlights. A hint, never content: commit subjects are not
    // user copy. Empty when the previous version was never tagged.
    changesSince: listChangesSince(repositoryRoot, currentVersion),
  };
}

function listChangesSince(root, previousVersion) {
  const tag = `v${previousVersion}`;
  if (git(root, ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], { allowFailure: true }).status !== 0) return [];
  return git(root, ["log", "--format=%s", `${tag}..HEAD`]).stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

/** The one positional argument, the version. pnpm 7+ forwards a `--` written
 * after the script name to the script itself instead of swallowing it, so
 * `pnpm run release:prepare -- 1.2.3` used to arrive as two arguments and fail
 * the usage check; one leading separator is accepted and dropped. */
export function parseCommandLine(args) {
  const positional = args[0] === "--" ? args.slice(1) : args;
  if (positional.length !== 1) fail("usage", "usage: pnpm run release:prepare <semver> (from main, or from the work branch that becomes the release)");
  return { version: positional[0] };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { version } = parseCommandLine(process.argv.slice(2));
    const result = prepareRelease({ root: process.cwd(), version });
    if (result.renamedFrom) {
      process.stdout.write(`Renamed ${result.renamedFrom} to ${result.branch}. If ${result.renamedFrom} was already pushed, close its pull request; only a pull request from ${result.branch} releases.\n`);
    }
    process.stdout.write(`Prepared ${result.branch}. Fill ${result.highlights}, run pnpm run release:notes, and replace the placeholder in ${result.notes} before committing.\n`);
    if (result.changesSince.length > 0) {
      process.stdout.write(`Changes since the previous release, for reference:\n${result.changesSince.map((line) => `  - ${line}`).join("\n")}\n`);
    }
  } catch (error) {
    const code = error instanceof ReleaseValidationError ? error.code : "internal";
    process.stderr.write(`Release preparation failed [${code}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
