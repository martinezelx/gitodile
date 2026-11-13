import fs from "node:fs";
import path from "node:path";

export const versionFolderPattern = /^\d+\.\d+\.\d+$/;

/** Planned task folders are flat. Completed work may have one version level;
 * older, unclassified records can remain directly in done during migration. */
export function taskDirectoryErrors(workRoot, area) {
  const errors = [];
  const directory = path.join(workRoot, area);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const relative = `work/${area}/${entry.name}/`;
    if (area !== "done") {
      errors.push(`${relative} nests tasks; keep each planned folder flat`);
      continue;
    }
    if (!versionFolderPattern.test(entry.name)) {
      errors.push(`${relative} must be a plain X.Y.Z completed-version folder`);
      continue;
    }
    const archive = path.join(directory, entry.name);
    if (!fs.existsSync(path.join(archive, "README.md"))) {
      errors.push(`${relative} needs a README.md with its task index and version evidence`);
    }
    for (const nested of fs.readdirSync(archive, { withFileTypes: true })) {
      if (nested.isDirectory()) errors.push(`${relative}${nested.name}/ nests tasks; keep each completed version flat`);
    }
  }
  return errors;
}
