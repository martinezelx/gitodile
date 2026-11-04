import React, { StrictMode } from "react";
import { act, cleanup, fireEvent, render as renderInHost, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/en";
import { es } from "../../i18n/es";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { canPreviewMarkdown, type FileDiff, type MarkdownPreview } from "./domain";
import { MarkdownPreviewView, useMarkdownPreview } from "./markdownPreview";
import { DiffViewSelector } from "./DiffViewSelector";
import { buildMarkdownExcerpt, buildUnifiedMarkdown } from "./markdownChanges";

afterEach(cleanup);
const t = en;
const diff: FileDiff = { kind: "text", path: "README.MD", originalPath: null, change: "changed", hunks: [], truncated: false };
function render(ui: React.ReactNode) {
  const lifecycle = createScreenLifecycleController("active");
  return renderInHost(ui, { wrapper: ({ children }) => <ScreenLifecycleProvider controller={lifecycle}>{children}</ScreenLifecycleProvider> });
}

describe("Markdown document rendering", () => {
  it("navigates rendered change groups without rereading or scrolling again on reveal", () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      const lifecycle = createScreenLifecycleController("active");
      const comparison = buildUnifiedMarkdown("# Old\n\nKeep.\n\nOld ending", "# New\n\nKeep.\n\nNew ending")!;
      const state = { status: "ready" as const, preview: { kind: "ready" as const, beforeContent: "", content: "not empty" } };
      const target = { index: 1, token: 1 };
      render(<ScreenLifecycleProvider controller={lifecycle}><MarkdownPreviewView state={state} retry={vi.fn()} t={t} comparison={comparison} changeTarget={target} /></ScreenLifecycleProvider>);
      expect(scroll).toHaveBeenCalledOnce();
      expect([...document.querySelectorAll('[data-current-markdown-change]')].map((block) => block.textContent)).toEqual(["Old ending", "New ending"]);
      act(() => lifecycle.transition("hidden"));
      act(() => lifecycle.transition("active"));
      expect(scroll).toHaveBeenCalledOnce();
    } finally { Element.prototype.scrollIntoView = original; }
  });

  it("opens a fold or the whole document, and keeps focus in it", () => {
    const rest = Array.from({ length: 12 }, (_, index) => `Paragraph ${index}.`).join("\n\n");
    render(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "ready", beforeContent: `${rest}\n\nOld ending.\n\n${rest}`, content: `${rest}\n\nNew ending.\n\n${rest}` } }} retry={vi.fn()} t={t} />);
    expect(screen.getByRole("article")).toHaveTextContent("New ending.");
    expect(screen.queryByText("Paragraph 5.")).not.toBeInTheDocument();
    const folds = screen.getAllByRole("button", { name: /unchanged blocks/ });
    expect(folds).toHaveLength(2);
    fireEvent.click(folds[0]);
    expect(screen.getAllByText("Paragraph 5.")).toHaveLength(1);
    expect(screen.getByRole("article")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: t.changesMarkdownShowAll }));
    expect(screen.getAllByText("Paragraph 5.")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /unchanged blocks/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.changesMarkdownShowAll })).not.toBeInTheDocument();
  });

  it("shows bounded oversized excerpts with an honest notice and inert resources", () => {
    const excerpt = buildMarkdownExcerpt([{ header: "", oldStart: 40, oldLines: 1, newStart: 40, newLines: 1, lines: [
      { kind: "deletion", content: "# Old heading", oldLineNumber: 40, newLineNumber: null },
      { kind: "addition", content: "# New heading", oldLineNumber: null, newLineNumber: 40 },
    ] }], true)!;
    const { container } = render(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "too-large", limitBytes: 131072 } }} retry={vi.fn()} t={t} excerpt={excerpt} />);
    expect(screen.getByRole("status")).toHaveTextContent("Partial preview");
    expect(screen.getByRole("img", { name: /Formatting and references may be incomplete/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("status")).toHaveTextContent("Some changes are omitted");
    expect(screen.getByRole("heading", { name: "Old heading" })).toHaveClass("markdown-preview__removed");
    expect(screen.getByRole("heading", { name: "New heading" })).toHaveClass("markdown-preview__added");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(container.querySelectorAll("[href], [src], script, iframe")).toHaveLength(0);
  });

  it("keeps repeated footnotes in separate excerpts free of duplicate DOM identifiers", () => {
    const excerpt = buildMarkdownExcerpt([10, 100].map((start) => ({ header: "", oldStart: start, oldLines: 0, newStart: start, newLines: 3,
      lines: [`Reference[^n].`, "", `[^n]: Note at ${start}`].map((content, index) => ({ kind: "addition" as const, content, oldLineNumber: null, newLineNumber: start + index })),
    })), false)!;
    const { container } = render(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "too-large", limitBytes: 131072 } }} retry={vi.fn()} t={t} excerpt={excerpt} />);
    const ids = [...container.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(screen.getByText(/Note at 10\b/)).toBeInTheDocument();
    expect(screen.getByText(/Note at 100/)).toBeInTheDocument();
    expect(container.querySelectorAll("[href], [src]")).toHaveLength(0);
  });
  it("interleaves removed/added blocks in one document and renders unchanged context once", () => {
    const before = '# Old title\n\nKeep this paragraph.\n\n**Removed paragraph.**\n\n- Old item\n\n| Name |\n| --- |\n| Old row |\n\n```js\nold()\n```\n';
    const content = '# New title\n\nKeep this paragraph.\n\n*Added paragraph.*\n\n- New item\n\n| Name |\n| --- |\n| New row |\n\n```js\nnewCall()\n```\n';
    const { container } = render(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "ready", beforeContent: before, content } }} retry={vi.fn()} t={t} />);
    expect(screen.getByRole("heading", { name: "Old title" })).toHaveClass("markdown-preview__removed");
    expect(screen.getByRole("heading", { name: "New title" })).toHaveClass("markdown-preview__added");
    expect(screen.getAllByText("Keep this paragraph.")).toHaveLength(1);
    expect(container.querySelector("pre.markdown-preview__removed")).toHaveTextContent("old()");
    expect(container.querySelector("pre.markdown-preview__added")).toHaveTextContent("newCall()");
    expect(container.querySelector("code[class*='markdown-preview__']")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article")).toHaveAttribute("tabindex", "0");
    expect(screen.getAllByRole("table")).toHaveLength(1);
    const headings = [...container.querySelectorAll("h1")].map((heading) => heading.textContent);
    expect(headings).toEqual(["Old title", "New title"]);
    for (const paragraph of screen.getAllByText("Keep this paragraph.")) {
      expect(paragraph).not.toHaveClass("markdown-preview__removed", "markdown-preview__added");
    }
    expect(container.querySelector(".markdown-preview__removed strong")).toHaveTextContent("Removed paragraph.");
    expect(container.querySelector(".markdown-preview__added em")).toHaveTextContent("Added paragraph.");
    expect(container.querySelector("li.markdown-preview__removed")).toHaveTextContent("Old item");
    expect(container.querySelector("tr.markdown-preview__added")).toHaveTextContent("New row");
    expect(container.querySelector("pre.markdown-preview__removed, pre .markdown-preview__removed")).toHaveTextContent("old()");
    expect(screen.getByRole("status")).toHaveTextContent(/−\d+ \+\d+ lines/);
  });

  it("shows deleted content and treats formatting-only edits as changes", () => {
    const { rerender } = render(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "ready", beforeContent: "Removed\n", content: null } }} retry={vi.fn()} t={t} />);
    expect(screen.getByText("Removed")).toHaveClass("markdown-preview__removed");
    expect(screen.getByRole("status")).toHaveTextContent(t.changesMarkdownDeleted);
    rerender(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "ready", beforeContent: "Normal\n", content: "**Normal**\n" } }} retry={vi.fn()} t={t} />);
    expect(document.querySelector(".markdown-preview__added strong")).toHaveTextContent("Normal");
  });

  it("renders document structure and GFM without active links, HTML or image loads", () => {
    const content = '# Full document\n\n**Bold** and *emphasis*.\n\n> Quote\n\n1. First\n2. Second\n\n- [x] Done\n\n| Name | Value |\n| --- | --- |\n| A | B |\n\n```ts\nconst a = 1;\n```\n\n[Web](https://example.org) [local](./file.md) [unsafe](javascript:alert%281%29)\n\n![Remote](https://example.org/track.png) ![Local](./secret.png) ![Inline](data:image/svg+xml;base64,AAAA)\n\n<script>alert(1)</script>\n\n<iframe src="https://example.org"></iframe>\n\n<img src="https://example.org/track" onerror="alert(1)" />';
    const beforeContent = '# Earlier\n\n[Old link](javascript:alert%281%29)\n\n![Old image](https://example.org/old.png)\n\n<script>alert(2)</script>';
    const { container } = render(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "ready", beforeContent, content } }} retry={vi.fn()} t={t} />);
    expect(screen.getByRole("heading", { level: 1, name: "Full document" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("NameValueAB");
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("checkbox").closest("li")).toHaveClass("task-list-item");
    expect(screen.getByRole("checkbox").closest("ul")).toHaveClass("contains-task-list");
    expect(container.querySelector("strong")).toHaveTextContent("Bold");
    expect(container.querySelector("blockquote")).toHaveTextContent("Quote");
    expect(container.querySelector("pre code")).toHaveTextContent("const a = 1;");
    expect(container.querySelectorAll("a, img, script, iframe, [src], [href]")).toHaveLength(0);
    expect(screen.getByText("Image: Remote")).toBeInTheDocument();
    expect(screen.getByText("Image: Local")).toBeInTheDocument();
  });

  it("covers loading, empty, oversized and retryable errors in both languages", () => {
    const retry = vi.fn();
    const { rerender } = render(<MarkdownPreviewView state={{ status: "loading" }} retry={retry} t={t} />);
    expect(screen.getByText(t.changesMarkdownLoading)).toBeInTheDocument();
    rerender(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "ready", beforeContent: null, content: " \n" } }} retry={retry} t={t} />);
    expect(screen.getByText(t.changesMarkdownEmpty)).toBeInTheDocument();
    rerender(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "too-large", limitBytes: 131072 } }} retry={retry} t={t} />);
    expect(screen.getByRole("status")).toHaveTextContent("128 KiB");
    rerender(<MarkdownPreviewView state={{ status: "error" }} retry={retry} t={es} />);
    expect(screen.getByRole("alert")).toHaveTextContent(es.changesMarkdownError);
    fireEvent.click(screen.getByRole("button", { name: es.changesDiffRetry }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("keeps the saved side of an empty deleted file and avoids duplicate unchanged documents", () => {
    const { rerender } = render(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "ready", beforeContent: "", content: null } }} retry={vi.fn()} t={t} />);
    expect(screen.getByText(t.changesMarkdownEmpty)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(t.changesMarkdownDeleted);
    rerender(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "ready", beforeContent: "# Same\n", content: "# Same\r\n" } }} retry={vi.fn()} t={t} />);
    expect(screen.getAllByRole("heading", { name: "Same" })).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(t.changesMarkdownUnchanged);
  });

  it("merges list items and table rows without duplicating shared context or changing list numbers", () => {
    const before = '1. First\n2. Old item\n3. Last\n\n| Name |\n| --- |\n| Keep row |\n| Old row |\n';
    const content = '1. First\n2. New item\n3. Last\n\n| Name |\n| --- |\n| Keep row |\n| New row |\n';
    const { container } = render(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "ready", beforeContent: before, content } }} retry={vi.fn()} t={t} />);
    expect(screen.getAllByText("First")).toHaveLength(1);
    expect(screen.getAllByText("Last")).toHaveLength(1);
    expect(screen.getAllByText("Keep row")).toHaveLength(1);
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect([...container.querySelectorAll("ol > li")].map((item) => item.getAttribute("value"))).toEqual(["1", "2", "2", "3"]);
  });

  it("resolves references in their own version and retains removed/added footnote definitions safely", () => {
    const before = 'Read [the guide][guide] and this note[^a].\n\n[guide]: https://old.example\n\n[^a]: **Old note**\n';
    const content = 'Read [the guide][guide] and this note[^a].\n\n[guide]: javascript:alert(1)\n\n[^a]: *New note*\n';
    const { container } = render(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "ready", beforeContent: before, content } }} retry={vi.fn()} t={t} />);
    expect(screen.getByText("Old note").closest(".markdown-preview__removed")).not.toBeNull();
    expect(screen.getByText("New note").closest(".markdown-preview__added")).not.toBeNull();
    expect(container.querySelectorAll("a, img, [href], [src]")).toHaveLength(0);
    expect(screen.getAllByText("the guide")).toHaveLength(2);
  });

  it("keeps nested list context once even when another block was inserted before it", () => {
    const before = '# Old\n\n- Parent\n  - Keep nested\n  - Old nested\n';
    const content = '# New\n\nInserted paragraph.\n\n- Parent\n  - Keep nested\n  - New nested\n';
    render(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "ready", beforeContent: before, content } }} retry={vi.fn()} t={t} />);
    expect(screen.getAllByText("Parent")).toHaveLength(1);
    expect(screen.getAllByText("Keep nested")).toHaveLength(1);
    expect([...document.querySelectorAll(".markdown-preview__removed")].map((block) => block.textContent)).toContain("Old nested");
    expect([...document.querySelectorAll(".markdown-preview__added")].map((block) => block.textContent)).toContain("New nested");
  });

  it("shares unchanged footnote context once when another block changes", () => {
    const before = '# Old\n\nKeep this reference[^n].\n\n[^n]: Shared note body.\n';
    const content = '# New\n\nKeep this reference[^n].\n\n[^n]: Shared note body.\n';
    render(<MarkdownPreviewView state={{ status: "ready", preview: { kind: "ready", beforeContent: before, content } }} retry={vi.fn()} t={t} />);
    expect(screen.getAllByText(/Keep this reference/)).toHaveLength(1);
    expect(screen.getAllByText(/Shared note body/)).toHaveLength(1);
  });

  it("offers preview for Markdown only, retaining the normal keyboard-operated picker", async () => {
    expect(canPreviewMarkdown(diff)).toBe(true);
    expect(canPreviewMarkdown({ ...diff, path: "notes.markdown" })).toBe(true);
    expect(canPreviewMarkdown({ ...diff, path: "notes.mdx" })).toBe(false);
    expect(canPreviewMarkdown({ ...diff, path: "docs/.md" })).toBe(false);
    expect(canPreviewMarkdown({ ...diff, path: ".notes.md" })).toBe(true);
    expect(canPreviewMarkdown({ ...diff, change: "deleted" })).toBe(true);
    expect(canPreviewMarkdown({ kind: "conflict", path: "a.md", hunks: [], truncated: false, detail: null })).toBe(false);
    expect(canPreviewMarkdown({ kind: "binary", path: "a.md", change: "changed", originalPath: null })).toBe(false);
    const select = vi.fn();
    const { rerender } = render(<DiffViewSelector value="unified" onChange={vi.fn()} markdown={{ selected: false, onSelect: select }} t={t} />);
    fireEvent.click(screen.getByRole("button"));
    const option = screen.getByRole("menuitemradio", { name: t.changesMarkdownPreview });
    option.focus();
    fireEvent.keyDown(option, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("menuitemradio", { name: t.changesMarkdownPreview }));
    expect(select).toHaveBeenCalledOnce();
    expect(screen.getByRole("button")).toHaveFocus();
    rerender(<DiffViewSelector value="unified" onChange={vi.fn()} t={t} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByRole("menuitemradio", { name: t.changesMarkdownPreview })).not.toBeInTheDocument();
  });
});

describe("on-demand Markdown reads", () => {
  it("deduplicates StrictMode, suspends hidden work and never rereads on visibility alone", async () => {
    const lifecycle = createScreenLifecycleController("active");
    let resolve!: (value: MarkdownPreview) => void;
    const load = vi.fn(() => new Promise<MarkdownPreview>((done) => { resolve = done; }));
    const wrapper = ({ children }: { children: React.ReactNode }) => <StrictMode><ScreenLifecycleProvider controller={lifecycle}>{children}</ScreenLifecycleProvider></StrictMode>;
    const { result, rerender } = renderHook(({ enabled }) => useMarkdownPreview(diff, "project:epoch", enabled, load), { wrapper, initialProps: { enabled: false } });
    expect(load).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(load).toHaveBeenCalledOnce();
    act(() => lifecycle.transition("hidden"));
    await act(async () => resolve({ kind: "ready", beforeContent: null, content: "# Full content" }));
    expect(result.current.state.status).toBe("loading");
    act(() => lifecycle.transition("active"));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(load).toHaveBeenCalledOnce();
    rerender({ enabled: false });
    rerender({ enabled: true });
    expect(load).toHaveBeenCalledOnce();
  });

  it("ignores stale reads and invalidates for a new diff snapshot or project epoch", async () => {
    const lifecycle = createScreenLifecycleController("active");
    const resolves: ((value: MarkdownPreview) => void)[] = [];
    const load = vi.fn(() => new Promise<MarkdownPreview>((done) => { resolves.push(done); }));
    const wrapper = ({ children }: { children: React.ReactNode }) => <ScreenLifecycleProvider controller={lifecycle}>{children}</ScreenLifecycleProvider>;
    const { result, rerender } = renderHook(({ file, source }) => useMarkdownPreview(file, source, true, load), { wrapper, initialProps: { file: diff, source: "epoch1" } });
    const next = { ...diff, path: "other.md" };
    rerender({ file: next, source: "epoch1" });
    await act(async () => resolves[0]({ kind: "ready", beforeContent: null, content: "stale" }));
    expect(result.current.state.status).toBe("loading");
    await act(async () => resolves[1]({ kind: "ready", beforeContent: null, content: "current" }));
    expect(result.current.state).toEqual({ status: "ready", preview: { kind: "ready", beforeContent: null, content: "current" } });
    rerender({ file: { ...next }, source: "epoch1" });
    expect(result.current.state.status).toBe("loading");
    rerender({ file: next, source: "epoch2" });
    expect(result.current.state.status).toBe("loading");
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("retries failed reads explicitly", async () => {
    const lifecycle = createScreenLifecycleController("active");
    const load = vi.fn<() => Promise<MarkdownPreview>>().mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce({ kind: "ready", beforeContent: null, content: "recovered" });
    const wrapper = ({ children }: { children: React.ReactNode }) => <ScreenLifecycleProvider controller={lifecycle}>{children}</ScreenLifecycleProvider>;
    const { result } = renderHook(() => useMarkdownPreview(diff, "epoch", true, load), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
