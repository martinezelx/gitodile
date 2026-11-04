import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DERIVED_ASSET_NAMES, FEED_FILES, feedsForPromotion, PUBLIC_REPOSITORY, renderPublication } from "./public-release.mjs";
import { ReleaseValidationError } from "./release-candidate.mjs";

function fail(code, message) {
  throw new ReleaseValidationError(code, message);
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export const RELEASE_PIPELINE = Object.freeze({
  path: ".github/workflows/release-pipeline.yml",
  event: "workflow_dispatch",
  // The workflow declares `run-name`, and the Actions API then reports that
  // per-run title in `name` rather than the workflow name.
  runName: /^Release v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*) at [0-9a-f]{40}$/,
});

/** The signed bytes come from the same run that publishes them, so the run is
 * still in progress when this is checked; a completed run is only accepted as
 * a success. The workflow path, event and branch identify the release
 * pipeline loaded from protected `main`. */
export function validateSourceRun(run, expectedRepository) {
  const healthy = (run?.status === "in_progress" && run?.conclusion === null) ||
    (run?.status === "completed" && run?.conclusion === "success");
  if (
    !Number.isSafeInteger(run?.id) || run.id <= 0 ||
    typeof run?.name !== "string" || !RELEASE_PIPELINE.runName.test(run.name) ||
    run?.event !== RELEASE_PIPELINE.event ||
    !healthy || run?.repository?.full_name !== expectedRepository ||
    run?.path !== RELEASE_PIPELINE.path || run?.head_branch !== "main"
  ) fail("source_run_invalid", "artifact source is not a healthy release pipeline run on main");
  return true;
}

/** Returns the assets to upload. A finalized release is immutable: every
 * expected asset must already exist with identical bytes. A draft is staging
 * for a release nobody could download yet: a missing asset is uploaded and a
 * differing one (a re-dispatched pipeline rebuilds non-reproducible
 * installers) is replaced, reported through `replaces`. */
export function reconcileAssets(expected, existing, downloadedHashes, finalized) {
  const byName = new Map(existing.map((asset) => [asset.name, asset]));
  if (byName.size !== existing.length) fail("asset_conflict", "release contains duplicate asset names");
  const expectedNames = new Set(expected.map((asset) => asset.fileName));
  for (const asset of existing) {
    if (!expectedNames.has(asset.name)) fail("asset_conflict", `release contains unexpected asset ${asset.name}`);
  }
  const upload = [];
  for (const asset of expected) {
    const remote = byName.get(asset.fileName);
    if (!remote) {
      if (finalized) fail("finalized_asset_missing", `finalized release lacks ${asset.fileName}`);
      upload.push(asset);
      continue;
    }
    if (remote.size !== asset.size || downloadedHashes.get(asset.fileName) !== asset.sha256) {
      if (finalized) fail("immutable_asset_conflict", `published asset differs: ${asset.fileName}`);
      upload.push({ ...asset, replaces: remote });
    }
  }
  return upload;
}

class GitHubClient {
  constructor(token, fetchImpl = fetch) {
    if (!token) fail("credentials_unavailable", "missing destination credential name: GITODILE_PUBLIC_RELEASE_TOKEN");
    this.token = token;
    this.fetch = fetchImpl;
  }

  async request(url, options = {}, accepted = [200]) {
    const response = await this.fetch(url.startsWith("https://") ? url : `https://api.github.com${url}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "User-Agent": "GitOdile-public-release-publisher",
        "X-GitHub-Api-Version": "2022-11-28",
        ...options.headers,
      },
      signal: AbortSignal.timeout(30_000),
      redirect: options.redirect ?? "error",
    });
    if (!accepted.includes(response.status)) fail("github_api", `GitHub ${options.method ?? "GET"} ${url} returned HTTP ${response.status}`);
    if (response.status === 204) return null;
    return response.json();
  }

  api(pathname, options, accepted) {
    return this.request(`/repos/${PUBLIC_REPOSITORY}${pathname}`, options, accepted);
  }

  async assetHash(url) {
    const response = await this.fetch(url, {
      headers: { Accept: "application/octet-stream", Authorization: `Bearer ${this.token}`, "User-Agent": "GitOdile-public-release-publisher", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(60_000), redirect: "follow",
    });
    if (!response.ok) fail("github_api", `authenticated asset download returned HTTP ${response.status}`);
    return sha256(Buffer.from(await response.arrayBuffer()));
  }
}

/** A just-published asset can answer 404 from the download CDN for a short
 * while after the release itself is public, so the anonymous check is
 * retried a bounded number of times; a persistent failure still stops the
 * run before any feed changes. */
export const ANONYMOUS_RETRY = Object.freeze({ attempts: 6, delayMs: 10_000 });

export async function anonymousHash(url, fetchImpl = fetch, retry = ANONYMOUS_RETRY) {
  const sleep = retry.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last = null;
  for (let attempt = 1; attempt <= retry.attempts; attempt += 1) {
    if (attempt > 1) await sleep(retry.delayMs);
    try {
      const response = await fetchImpl(url, { headers: { "User-Agent": "GitOdile-anonymous-release-check" }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
      if (response.ok) return sha256(Buffer.from(await response.arrayBuffer()));
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error?.message ?? String(error);
    }
  }
  fail("anonymous_download_failed", `anonymous download failed after ${retry.attempts} attempts: ${last}`);
}

/** `GET /releases/tags/{tag}` only resolves published releases: a draft is
 * not bound to its tag until it is published, so reconciling an interrupted
 * publication has to list releases (drafts included, which the destination
 * credential can read) and match the tag name. */
async function releaseByTag(client, tag) {
  for (let page = 1; page <= 10; page += 1) {
    const releases = await client.api(`/releases?per_page=100&page=${page}`);
    const matches = releases.filter((release) => release.tag_name === tag);
    if (matches.length > 1) fail("release_conflict", `destination holds ${matches.length} releases named ${tag}`);
    if (matches.length === 1) return matches[0];
    if (releases.length < 100) return null;
  }
  fail("release_conflict", "destination release list is unexpectedly long");
}

async function publicMain(client) {
  const repository = await client.api("");
  if (repository.visibility !== "public" || repository.archived || repository.default_branch !== "main") {
    fail("destination_invalid", "destination must be the active public main repository");
  }
  const ref = await client.api("/git/ref/heads/main");
  return ref.object.sha;
}

async function ensurePublicTag(client, tag, mainSha) {
  try {
    const ref = await client.api(`/git/ref/tags/${encodeURIComponent(tag)}`);
    if (ref.object.type !== "commit") fail("public_tag_conflict", "public release tag is not a public commit");
  } catch (error) {
    if (!(error instanceof ReleaseValidationError) || !/HTTP 404/.test(error.message)) throw error;
    await client.api("/git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/tags/${tag}`, sha: mainSha }) }, [201]);
  }
}

async function downloadExistingHashes(release, expected, fetchImpl = fetch, retry = ANONYMOUS_RETRY) {
  const hashes = new Map();
  for (const asset of release.assets ?? []) {
    if (expected.some((item) => item.fileName === asset.name)) hashes.set(asset.name, await anonymousHash(asset.browser_download_url, fetchImpl, retry));
  }
  return hashes;
}

/** GitHub records `published_at` when a draft is published; that instant is
 * the manifest's `pub_date`. It is read back from the release on every run,
 * so a reconciliation retry renders the same bytes as the run that published. */
function publicationTime(release) {
  const publishedAt = release?.published_at;
  if (typeof publishedAt !== "string" || release.draft) fail("publication_date_invalid", "published release carries no publication time");
  const parsed = new Date(publishedAt);
  if (Number.isNaN(parsed.valueOf())) fail("publication_date_invalid", "published release carries an unreadable publication time");
  return parsed.toISOString().replace(".000Z", "Z");
}

async function uploadAsset(client, release, directory, asset) {
  const bytes = fs.readFileSync(path.join(directory, asset.fileName));
  if (bytes.length !== asset.size || sha256(bytes) !== asset.sha256) fail("local_asset_changed", `staged asset differs: ${asset.fileName}`);
  const uploadUrl = release.upload_url.replace("{?name,label}", `?name=${encodeURIComponent(asset.fileName)}`);
  await client.request(uploadUrl, { method: "POST", headers: { Accept: "application/vnd.github+json", "Content-Type": "application/octet-stream" }, body: bytes }, [201]);
}

async function readPublicFile(client, file) {
  try {
    const value = await client.api(`/contents/${file}?ref=main`);
    if (value.encoding !== "base64") fail("destination_invalid", `${file} has unexpected encoding`);
    return { bytes: Buffer.from(value.content, "base64"), sha: value.sha };
  } catch (error) {
    if (error instanceof ReleaseValidationError && /HTTP 404/.test(error.message)) return null;
    throw error;
  }
}

export async function atomicPublicCommit(client, baseSha, files, message) {
  const base = await client.api(`/git/commits/${baseSha}`);
  const tree = [];
  for (const [file, bytes] of Object.entries(files)) {
    const blob = await client.api("/git/blobs", { method: "POST", body: JSON.stringify({ content: Buffer.from(bytes).toString("base64"), encoding: "base64" }) }, [201]);
    tree.push({ path: file, mode: "100644", type: "blob", sha: blob.sha });
  }
  const nextTree = await client.api("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: base.tree.sha, tree }) }, [201]);
  const commit = await client.api("/git/commits", { method: "POST", body: JSON.stringify({ message, tree: nextTree.sha, parents: [baseSha] }) }, [201]);
  await client.api("/git/refs/heads/main", { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) }, [200]);
  return commit.sha;
}

async function loadCurrentFeeds(client) {
  const result = {};
  for (const feed of FEED_FILES) {
    const file = await readPublicFile(client, `updates/${feed}.json`);
    if (file) result[feed] = JSON.parse(file.bytes.toString("utf8"));
  }
  return result;
}

export async function publish({ directory, token, sourceRun, sourceRepository, fetchImpl = fetch, retry = ANONYMOUS_RETRY }) {
  validateSourceRun(sourceRun, sourceRepository);
  const plan = JSON.parse(fs.readFileSync(path.join(directory, "publication-plan.json"), "utf8"));
  if (plan.destination !== PUBLIC_REPOSITORY) fail("destination_invalid", "publication plan targets another repository");
  const client = new GitHubClient(token, fetchImpl);
  let mainSha = await publicMain(client);
  let release = await releaseByTag(client, plan.source.tag);
  if (!release) {
    await ensurePublicTag(client, plan.source.tag, mainSha);
    release = await client.api("/releases", { method: "POST", body: JSON.stringify({
      tag_name: plan.source.tag, target_commitish: mainSha, name: `GitOdile ${plan.release.version}`,
      body: plan.notesMarkdown, draft: true, prerelease: false,
    }) }, [201]);
  } else if (release.tag_name !== plan.source.tag || release.prerelease !== false || release.body !== plan.notesMarkdown) {
    fail("release_conflict", "existing release metadata differs from the immutable plan");
  }
  // Derived assets belong to the published release: a draft can only hold
  // them from an interrupted run, and they are rendered again after publishing.
  const derivedNames = new Set(DERIVED_ASSET_NAMES);
  const fixedAssets = plan.assets.filter((asset) => !derivedNames.has(asset.fileName));
  if (release.draft) {
    for (const asset of (release.assets ?? []).filter((asset) => derivedNames.has(asset.name))) {
      await client.api(`/releases/assets/${asset.id}`, { method: "DELETE" }, [204]);
    }
    release = await client.api(`/releases/${release.id}`);
  }
  const existingFixed = (release.assets ?? []).filter((asset) => !derivedNames.has(asset.name));
  const hashes = release.draft ? new Map() : await downloadExistingHashes(release, fixedAssets, fetchImpl, retry);
  if (release.draft) {
    for (const asset of existingFixed) {
      if (fixedAssets.some((item) => item.fileName === asset.name)) hashes.set(asset.name, await client.assetHash(asset.url));
    }
  }
  for (const asset of reconcileAssets(fixedAssets, existingFixed, hashes, !release.draft)) {
    if (asset.replaces) await client.api(`/releases/assets/${asset.replaces.id}`, { method: "DELETE" }, [204]);
    await uploadAsset(client, release, directory, asset);
  }
  release = await client.api(`/releases/${release.id}`);
  if (release.draft) release = await client.api(`/releases/${release.id}`, { method: "PATCH", body: JSON.stringify({ draft: false, prerelease: false }) }, [200]);
  const publishedAt = publicationTime(release);
  const rendered = renderPublication({ ...plan, assets: fixedAssets }, publishedAt);
  // The published release is immutable, with one exception that changes no
  // byte anybody could have downloaded: a derived asset that is still missing
  // is uploaded, because it is a function of the fixed assets and the
  // publication time GitHub recorded. One that exists must match exactly.
  const existingDerived = (release.assets ?? []).filter((asset) => derivedNames.has(asset.name));
  const derivedHashes = await downloadExistingHashes({ assets: existingDerived }, rendered.assets, fetchImpl, retry);
  for (const asset of reconcileAssets(rendered.assets, existingDerived, derivedHashes, false)) {
    if (asset.replaces) fail("immutable_asset_conflict", `published asset differs: ${asset.fileName}`);
    fs.writeFileSync(path.join(directory, asset.fileName), asset.content);
    await uploadAsset(client, release, directory, asset);
  }
  release = await client.api(`/releases/${release.id}`);
  const expectedAssets = [...fixedAssets, ...rendered.assets];
  const freshHashes = await downloadExistingHashes(release, expectedAssets, fetchImpl, retry);
  reconcileAssets(expectedAssets, release.assets ?? [], freshHashes, true);
  const currentFeeds = await loadCurrentFeeds(client);
  const feeds = feedsForPromotion({ ...plan, manifestBytes: rendered.manifestBytes }, currentFeeds);
  const files = Object.fromEntries(Object.entries(feeds).filter(([, bytes]) => bytes !== null).map(([feed, bytes]) => [`updates/${feed}.json`, bytes]));
  if (Object.keys(files).length > 0) {
    mainSha = await atomicPublicCommit(client, mainSha, files, `release: publish GitOdile ${plan.release.version}`);
  }
  return { state: "published", releaseId: release.id, publishedAt, publicCommit: mainSha, feedsChanged: Object.keys(feeds).filter((key) => feeds[key] !== null) };
}

function parseArgs(argv) {
  const result = new Map();
  for (let i = 0; i < argv.length; i += 2) result.set(argv[i]?.replace(/^--/, ""), argv[i + 1]);
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const sourceRun = JSON.parse(fs.readFileSync(path.resolve(args.get("source-run")), "utf8"));
    const result = await publish({ directory: path.resolve(args.get("directory")), token: process.env.GITODILE_PUBLIC_RELEASE_TOKEN, sourceRun, sourceRepository: args.get("source-repository") });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof ReleaseValidationError ? error.code : "internal";
    process.stderr.write(`Public release failed [${code}]: ${error.message}\n`);
    process.exitCode = 1;
  }
}
