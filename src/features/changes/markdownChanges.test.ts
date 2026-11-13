import { describe, expect, it } from "vitest";
import { applyFolds, buildMarkdownExcerpt, buildUnifiedMarkdown, compareMarkdown, foldUnchanged } from "./markdownChanges";
import type { Nodes } from "mdast";
import type { DiffHunk } from "./domain";

const hunk = (oldStart: number, newStart: number, before = "# Old", after = "# New"): DiffHunk => ({
  header: "", oldStart, newStart, oldLines: 1, newLines: 1,
  lines: [{ kind: "deletion", content: before, oldLineNumber: oldStart, newLineNumber: null },
    { kind: "addition", content: after, oldLineNumber: null, newLineNumber: newStart }],
});

const words = (before: string, after: string): string[] => {
  const found: string[] = [];
  const visit = (node: Nodes): void => {
    if (node.data?.hProperties?.className?.toString().includes("markdown-preview__word")) found.push(toString(node));
    else if ("children" in node) node.children.forEach(visit);
  };
  visit(buildUnifiedMarkdown(before, after)!.tree);
  return found;
};
const toString = (node: Nodes): string => "value" in node ? node.value : "children" in node ? node.children.map(toString).join("") : "";

describe("Changed words inside replaced blocks", () => {
  it.each([
    ["a paragraph, as one phrase", "Save your work every single day before you publish.", "Save your work quite often before you publish.", ["every single day", "quite often"]],
    ["inside emphasis", "Keep **the old name** in the list of things.", "Keep **the new name** in the list of things.", ["old", "new"]],
    ["inline code, whole", "Run the `old` command before you start.", "Run the `new` command before you start.", ["old", "new"]],
    ["a list item", "- First entry of the old list\n", "- First entry of the new list\n", ["old", "new"]],
    ["a table cell", "| Name |\n| --- |\n| The old value here |\n", "| Name |\n| --- |\n| The new value here |\n", ["old", "new"]],
  ])("marks what differs in %s", (_, before, after, expected) => {
    expect(words(before, after)).toEqual(expected);
  });

  it.each([
    ["a rewrite", "Completely different words live here.", "Nothing at all matches that sentence now."],
    ["spacing alone", "Same   words here.", "Same words here."],
    ["a code block", "```\nold value here\n```\n", "```\nnew value here\n```\n"],
  ])("leaves %s marked whole", (_, before, after) => {
    expect(words(before, after)).toEqual([]);
  });
});

describe("Folding what did not change", () => {
  const paragraphs = (from: number, to: number): string => Array.from({ length: to - from }, (_, index) => `Paragraph ${from + index}.`).join("\n\n");
  const unified = (before: string, after: string) => buildUnifiedMarkdown(before, after)!.tree;

  it("keeps a block of context each side of a change and the heading of its section", () => {
    const shared = `${paragraphs(0, 6)}\n\n# Section\n\n${paragraphs(6, 12)}`;
    const tree = unified(`${shared}\n\nOld ending.\n\n${paragraphs(12, 18)}`, `${shared}\n\nNew ending.\n\n${paragraphs(12, 18)}`);
    const folds = foldUnchanged(tree);
    expect(folds).toEqual([{ start: 0, count: 6 }, { start: 7, count: 5 }, { start: 16, count: 5 }]);
    for (const { start, count } of folds) {
      expect(tree.children.slice(start, start + count).some((node) => toString(node).includes("ending"))).toBe(false);
    }
  });

  it("opens only the folds it is told to, and folds nothing shorter than the row", () => {
    const tree = unified(`${paragraphs(0, 8)}\n\nOld.`, `${paragraphs(0, 8)}\n\nNew.`);
    const [fold] = foldUnchanged(tree);
    expect(applyFolds(tree, [fold], new Set()).children).toHaveLength(tree.children.length - fold.count + 1);
    expect(applyFolds(tree, [fold], new Set([fold.start]))).toBe(tree);
    expect(foldUnchanged(unified(`${paragraphs(0, 4)}\n\nOld.`, `${paragraphs(0, 4)}\n\nNew.`))).toEqual([]);
  });

  it.each([
    ["nothing changed", `${paragraphs(0, 10)}`, `${paragraphs(0, 10)}`],
    ["only a footnote changed", `${paragraphs(0, 10)}\n\nA note[^1].\n\n[^1]: Old note.`, `${paragraphs(0, 10)}\n\nA note[^1].\n\n[^1]: New note.`],
  ])("keeps the document open when %s", (_, before, after) => {
    expect(foldUnchanged(unified(before, after))).toEqual([]);
  });
});

describe("Markdown source comparison", () => {
  it("locates additions, removals and replacements without shifting unchanged lines", () => {
    const result = compareMarkdown("# Old\n\nRemoved\n\nKeep\n", "# New\n\nKeep\n\nAdded\n");
    expect(result?.removed).toEqual(new Set([1, 3, 4]));
    expect(result?.added).toEqual(new Set([1, 4, 5]));
  });
  it("handles new/deleted files and ignores CRLF and final-newline-only differences", () => {
    expect(compareMarkdown(null, "# New\n")?.added).toEqual(new Set([1]));
    expect(compareMarkdown("# Deleted\n", null)?.removed).toEqual(new Set([1]));
    expect(compareMarkdown("# Same\r\n", "# Same")?.added.size).toBe(0);
    expect(compareMarkdown("", "")).toEqual({ added: new Set(), removed: new Set() });
  });
  it("never invents rendered changes or navigation stops for CRLF in multiline Markdown", () => {
    const source = "# Same\n\nA paragraph across\nmultiple lines.\n\n- A list item\n  on two lines.\n\n```text\nfirst\nsecond\n```\n";
    const result = buildUnifiedMarkdown(source, source.replace(/\n/g, "\r\n"));
    expect(result?.changeCount).toBe(0);
    expect(result?.added.size).toBe(0);
    expect(result?.removed.size).toBe(0);
    expect(JSON.stringify(result?.tree)).not.toMatch(/markdown-preview__(added|removed)/);
  });
  it("refuses pathological edit distances rather than freezing or claiming no changes", () => {
    const before = Array.from({ length: 4100 }, (_, index) => `old ${index}`).join("\n");
    const after = Array.from({ length: 4100 }, (_, index) => `new ${index}`).join("\n");
    expect(compareMarkdown(before, after)).toBeNull();
  });
  it("refuses excessive Markdown nesting gracefully", () => {
    const source = `${"> ".repeat(90)}Nested paragraph`;
    expect(buildUnifiedMarkdown(null, source)).toBeNull();
  });
  it("groups replacements and traverses nested changes without stops for unused footnotes", () => {
    const result = buildUnifiedMarkdown("# Old\n\nKeep.\n\n- Old item\n\nUnused[^n].\n\n[^n]: Old note", "# New\n\nKeep.\n\n- New item\n\nUnused[^n].\n\n[^n]: Old note");
    expect(result?.changeCount).toBe(2);
    expect(JSON.stringify(result?.tree).match(/data-markdown-change/g)).toHaveLength(2);
    expect(buildUnifiedMarkdown("[^a]: Unused old note", "[^a]: Unused new note")?.changeCount).toBe(0);
  });
  it("isolates excerpts and numbers their stops across source gaps", () => {
    const result = buildMarkdownExcerpt([hunk(10, 10), hunk(900, 901)], false);
    expect(result?.chunks).toHaveLength(2);
    expect(result?.changeCount).toBe(2);
    expect(result?.limited).toBe(false);
    expect(result?.chunks[1].comparison.tree.children[0].data?.hProperties?.["data-markdown-change"]).toBe("1");
    expect(result?.chunks[1].newStart).toBe(901);
  });
  it("omits incomplete hunks and bounds excerpt content without slicing a hunk", () => {
    expect(buildMarkdownExcerpt([{ ...hunk(1, 1), oldLines: 3 }], true)).toBeNull();
    expect(buildMarkdownExcerpt([hunk(1, 1, "x".repeat(33000))], false)).toBeNull();
    const result = buildMarkdownExcerpt([hunk(1, 1), { ...hunk(30, 30), newLines: 8 }], true);
    expect(result?.chunks).toHaveLength(1);
    expect(result?.limited).toBe(true);
    const many = buildMarkdownExcerpt(Array.from({ length: 30 }, (_, index) => hunk(index * 20, index * 20)), false);
    expect(many?.chunks.length).toBeLessThanOrEqual(24);
    expect(many?.limited).toBe(true);
  });
});
