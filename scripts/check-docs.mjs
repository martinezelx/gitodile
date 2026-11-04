import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { taskDirectoryErrors, versionFolderPattern } from "./work-layout.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".agents", ".git", "dist", "node_modules", "target"]);

function collectMarkdownFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectMarkdownFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(absolute);
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function readFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/))
      .filter(Boolean)
      .map((entry) => [entry[1], entry[2].replace(/^['"]|['"]$/g, "")]),
  );
}

const errors = [];
const markdownFiles = collectMarkdownFiles(root);
const reservedTaskIds = new Map([["062", "folded into task 057"]]);

for (const file of markdownFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#)/.test(rawTarget)) continue;
    const localTarget = decodeURIComponent(rawTarget.split("#", 1)[0]);
    if (!localTarget) continue;
    const resolved = path.resolve(path.dirname(file), localTarget);
    if (!fs.existsSync(resolved)) {
      errors.push(`${relative(file)} links to missing ${rawTarget}`);
    }
  }
}

const taskIds = new Map();
const taskRecords = [];
const workRoot = path.join(root, "work");
const versionFolder = versionFolderPattern;
const laterFolder = "after-1.0";
const allowedStatuses = (area) =>
  area === "done" ? ["done"] : area === laterFolder ? ["planned", "blocked"] : ["active", "blocked"];
const taskAreas = fs
  .readdirSync(workRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && (versionFolder.test(entry.name) || entry.name === laterFolder || entry.name === "done"))
  .map((entry) => entry.name);
for (const legacy of ["active", "blocked"]) {
  if (fs.existsSync(path.join(workRoot, legacy))) {
    errors.push(`work/${legacy}/ is retired; pending tasks live in version folders or work/${laterFolder}/`);
  }
}
for (const area of taskAreas) {
  const directory = path.join(workRoot, area);
  if (area !== "done" && !fs.existsSync(path.join(directory, "README.md"))) {
    errors.push(`work/${area}/ needs a README.md stating its goal and exit condition`);
  }
  errors.push(...taskDirectoryErrors(workRoot, area));
  for (const file of collectMarkdownFiles(directory)) {
    if (path.basename(file) === "README.md") continue;
    const source = fs.readFileSync(file, "utf8");
    const metadata = readFrontmatter(source);
    if (!metadata) {
      errors.push(`${relative(file)} has no task frontmatter`);
      continue;
    }
    const statuses = allowedStatuses(area);
    if (!statuses.includes(metadata.status)) {
      errors.push(`${relative(file)} has status ${metadata.status || "<missing>"}; expected ${statuses.join(" or ")}`);
    }
    if (area === "done" && !/^\d{4}-\d{2}-\d{2}$/.test(metadata.completed ?? "")) {
      errors.push(`${relative(file)} is done but has no valid completed date`);
    }
    if (area !== "done" && metadata.completed) {
      errors.push(`${relative(file)} is ${metadata.status} but already has completed: ${metadata.completed}`);
    }
    if (metadata.id) {
      if (reservedTaskIds.has(metadata.id)) {
        errors.push(`${relative(file)} reuses reserved task id ${metadata.id} (${reservedTaskIds.get(metadata.id)})`);
      }
      const previous = taskIds.get(metadata.id);
      if (previous) errors.push(`${relative(file)} duplicates task id ${metadata.id} from ${previous.file}`);
      else {
        const record = { area, file: relative(file), metadata };
        taskIds.set(metadata.id, record);
        taskRecords.push(record);
      }
    }
  }
}

// Each version folder owns one contiguous queue of its active leaf tasks.
const versionQueues = new Map();
for (const record of taskRecords) {
  const { area, file, metadata } = record;
  const active = metadata.status === "active";
  if (metadata.parent) {
    const parent = taskIds.get(metadata.parent);
    if (!parent) {
      errors.push(`${file} has missing parent task ${metadata.parent}`);
    } else if (active && parent.metadata.type === "epic" && !metadata.id.startsWith(`${metadata.parent}-`)) {
      errors.push(`${file} is an active epic child but id ${metadata.id} does not use prefix ${metadata.parent}-`);
    }
  }
  if (!active) {
    if (area !== "done" && metadata.queue) errors.push(`${file} is ${metadata.status} and must not hold a queue position`);
    continue;
  }
  if (metadata.type === "epic") {
    if (metadata.queue) errors.push(`${file} is an epic and must leave queueing to its children`);
    continue;
  }
  if (!/^\d{2}$/.test(metadata.queue ?? "")) {
    errors.push(`${file} must have a two-digit active queue value`);
    continue;
  }
  const queues = versionQueues.get(area) ?? new Map();
  versionQueues.set(area, queues);
  const previous = queues.get(metadata.queue);
  if (previous) errors.push(`${file} duplicates queue ${metadata.queue} in work/${area}/ from ${previous}`);
  else queues.set(metadata.queue, file);
}

for (const [area, queues] of versionQueues) {
  const ordered = [...queues.keys()].map(Number).sort((a, b) => a - b);
  for (const [index, queue] of ordered.entries()) {
    const expected = index + 1;
    if (queue !== expected) {
      errors.push(
        `work/${area}/ queue is not contiguous: expected ${String(expected).padStart(2, "0")}, ` +
          `found ${String(queue).padStart(2, "0")}`,
      );
      break;
    }
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const cargoToml = fs.readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = cargoToml.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
for (const [owner, version] of [
  ["src-tauri/Cargo.toml", cargoVersion],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
]) {
  if (version !== packageJson.version) {
    errors.push(`${owner} version ${version || "<missing>"} differs from package.json ${packageJson.version}`);
  }
}
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
for (const expected of [`Current development version: **${packageJson.version}**.`, packageJson.packageManager, packageJson.engines.node]) {
  if (!readme.includes(expected)) errors.push(`README.md must mention current package metadata: ${expected}`);
}

if (errors.length > 0) {
  process.stderr.write(`Documentation check failed:\n- ${errors.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Documentation check passed over ${markdownFiles.length} Markdown files and ${taskIds.size} task ids.\n`,
  );
}
