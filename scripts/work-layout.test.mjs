import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { taskDirectoryErrors } from "./work-layout.mjs";

function fixture(t, files) {
  const prefix = path.join(os.tmpdir(), "gitodile-work-layout-");
  const directory = fs.mkdtempSync(prefix);
  t.after(() => {
    assert.ok(directory.startsWith(prefix));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  for (const name of files) {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "fixture\n");
  }
  return directory;
}

test("completed versions coexist with legacy records, without requiring task renumbering", (t) => {
  const work = fixture(t, ["done/001-legacy.md", "done/0.4.0/README.md", "done/0.4.0/194-branches.md", "done/0.5.0/README.md", "done/0.5.0/037-conflicts.md"]);
  assert.deepEqual(taskDirectoryErrors(work, "done"), []);
});

test("completed archives require version names, an index and exactly one directory level", (t) => {
  const work = fixture(t, ["done/conflicts/task.md", "done/0.5.0/037.md", "done/0.4.1/README.md", "done/0.4.1/extra/task.md"]);
  assert.deepEqual(taskDirectoryErrors(work, "done").sort(), [
    "work/done/0.4.1/extra/ nests tasks; keep each completed version flat",
    "work/done/0.5.0/ needs a README.md with its task index and version evidence",
    "work/done/conflicts/ must be a plain X.Y.Z completed-version folder",
  ]);
});

for (const area of ["0.6.0", "after-1.0"]) {
  test(`${area} still refuses nested task folders`, (t) => {
    const work = fixture(t, [`${area}/extra/task.md`]);
    assert.deepEqual(taskDirectoryErrors(work, area), [`work/${area}/extra/ nests tasks; keep each planned folder flat`]);
  });
}
