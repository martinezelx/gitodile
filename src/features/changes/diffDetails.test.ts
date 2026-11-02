import { describe, expect, it, vi } from "vitest";
import { buildDiffDetails } from "./diffDetails";
import type { DiffHunk, DiffLine } from "./domain";

function hunk(before: string[], after: string[]): DiffHunk {
  return { header: "", oldStart: 1, oldLines: before.length, newStart: 1, newLines: after.length,
    lines: [
      ...before.map((content, index): DiffLine => ({ kind: "deletion", content, oldLineNumber: index + 1, newLineNumber: null })),
      ...after.map((content, index): DiffLine => ({ kind: "addition", content, oldLineNumber: null, newLineNumber: index + 1 })),
    ] };
}

describe("paired line details", () => {
  it.each([
    ["const retries = 3;", "const retries = 5;", ["3"], ["5"]],
    ['return "Publicar cambios";', 'return "Revisar cambios";', ["Publicar"], ["Revisar"]],
    ["\treturn value;  ", "    return value;", ["\t", "  "], ["    "]],
    ["const emoji = '🐊';", "const emoji = '🐢';", ["🐊"], ["🐢"]],
  ])("finds changed fragments without modifying %s", (before, after, removed, added) => {
    const source = hunk([before as string], [after as string]);
    const details = buildDiffDetails([source]);
    const fragments = (line: DiffLine): string[] => (details.get(line) ?? []).map(range => line.content.slice(range.start, range.end));
    expect(fragments(source.lines[0])).toEqual(removed);
    expect(fragments(source.lines[1])).toEqual(added);
  });

  it("never pairs across context, hunks or unequal-length run tails", () => {
    const source = hunk(["const a = 1;", "unpaired"], ["const a = 2;"]);
    const context: DiffLine = { kind: "context", content: "context", oldLineNumber: 3, newLineNumber: 2 };
    const loneRemoval = hunk(["const b = 1;"], []);
    source.lines.push(context, ...loneRemoval.lines);
    const loneAddition = hunk([], ["const b = 2;"]);
    const details = buildDiffDetails([source, loneAddition]);
    expect(details.size).toBe(2);
    expect(details.has(source.lines[1])).toBe(false);
    expect(details.has(context)).toBe(false);
    expect(details.has(loneRemoval.lines[0])).toBe(false);
    expect(details.has(loneAddition.lines[0])).toBe(false);
  });

  it("falls back to row marks for unrelated, oversized and excessive comparisons", () => {
    expect(buildDiffDetails([hunk(["first"], ["other"])]).size).toBe(0);
    expect(buildDiffDetails([hunk(["x".repeat(4096)], ["x".repeat(4095) + "y"])]).size).toBe(0);
    const source = hunk(Array.from({ length: 300 }, () => "const n = 1;"), Array.from({ length: 300 }, () => "const n = 2;"));
    const details = buildDiffDetails([source]);
    expect(details.size).toBeLessThanOrEqual(512);
    expect(details.has(source.lines[299])).toBe(false);
  });

  it("makes standalone spacing-only additions and deletions readable without marking ordinary new code", () => {
    const removed = hunk(["\t  ", ""], []);
    const added = hunk([], ["    ", "const newValue = 1;"]);
    const details = buildDiffDetails([removed, added]);
    expect(details.get(removed.lines[0])).toEqual([{ start: 0, end: 3 }]);
    expect(details.get(added.lines[0])).toEqual([{ start: 0, end: 4 }]);
    expect(details.has(removed.lines[1])).toBe(false);
    expect(details.has(added.lines[1])).toBe(false);
  });

  it("shares the detailed-line limit between standalone whitespace and paired replacements", () => {
    // Standalone whitespace used to consume 512 entries before the paired-line
    // loop added another 512. Short lines keep this below the character budget.
    const spacing = hunk([], Array.from({ length: 511 }, () => " "));
    const replacements = hunk(Array.from({ length: 256 }, () => "x=1"), Array.from({ length: 256 }, () => "x=2"));
    // Exercise the entry limit independently of the machine's speed; a slow
    // run must not let the separate time budget conceal this regression.
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      const details = buildDiffDetails([spacing, replacements]);
      expect(details.size).toBe(511);
      expect(details.has(replacements.lines[0])).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });
});
