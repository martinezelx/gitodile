import { describe, expect, it } from "vitest";

import { discardedSide, fileActions, keptChoice, sideLimitation, type ConflictFile } from "./domain";

const A = "1".repeat(40);
const B = "2".repeat(40);

function file(overrides: Partial<ConflictFile>): ConflictFile {
  return {
    path: "a.txt",
    pathIsExact: true,
    shape: "both-changed",
    facets: [],
    base: { mode: "100644", objectId: A },
    current: { mode: "100644", objectId: B },
    incoming: { mode: "100755", objectId: B },
    working: "file",
    state: "unresolved",
    kept: null,
    allowedActions: [],
    ...overrides,
  };
}

describe("sideLimitation", () => {
  // Only a regular file on both ends of the comparison is asked of Rust as a
  // text diff; everything else is explained without a read.
  it.each([
    ["a text change", file({}), "current", null],
    ["an executable side", file({}), "incoming", null],
    ["a file with no base", file({ shape: "both-added", base: null }), "current", null],
    ["a side that deleted it", file({ shape: "deleted-by-current", current: null }), "current", "deleted"],
    ["a submodule", file({ facets: ["submodule"], current: { mode: "160000", objectId: B } }), "current", "submodule"],
    ["a link", file({ facets: ["symbolic-link"], current: { mode: "120000", objectId: B } }), "current", "symbolic-link"],
    ["a side that became a link", file({ current: { mode: "120000", objectId: B } }), "current", "type-change"],
    ["a name that is not exact", file({ pathIsExact: false }), "current", "inexact-path"],
  ] as const)("%s", (_label, conflict, side, expected) => {
    expect(sideLimitation(conflict, side)).toBe(expected);
  });
});

describe("file actions", () => {
  it("offers what Rust allows, in the bar's order", () => {
    const conflict = file({ allowedActions: ["mark-resolved", "delete", "keep-incoming", "open-in-editor", "reset-file"] });
    expect(fileActions(conflict)).toEqual({ choices: ["keep-incoming", "delete"], canMarkResolved: true, canReset: true });
    expect(fileActions(file({}))).toEqual({ choices: [], canMarkResolved: false, canReset: false });
  });

  // A choice names what it throws away before it runs: the other side, or
  // for a deletion the side that kept the file.
  it.each([
    ["keeping the current side", file({}), "keep-current", "incoming"],
    ["keeping the incoming side", file({}), "keep-incoming", "current"],
    ["deleting what the current side deleted", file({ shape: "deleted-by-current", current: null }), "delete", "incoming"],
    ["deleting what the incoming side deleted", file({ shape: "deleted-by-incoming", incoming: null }), "delete", "current"],
    ["deleting what both sides deleted", file({ shape: "deleted-by-both", current: null, incoming: null }), "delete", null],
  ] as const)("%s", (_label, conflict, choice, expected) => {
    expect(discardedSide(conflict, choice)).toBe(expected);
  });

  it("knows which choice the file still holds", () => {
    expect(keptChoice(file({ kept: "incoming" }))).toBe("keep-incoming");
    expect(keptChoice(file({ kept: "deleted" }))).toBe("delete");
    expect(keptChoice(file({}))).toBeNull();
  });
});
