// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import type { FileDiff } from "../changes";
import { createHistoryController, HISTORY_INITIAL_PAGE_SIZE, HISTORY_PAGE_SIZE, MAX_HISTORY_SESSION_CACHES } from "./controller";
import type { HistoryPage, SavedVersionDetail, SavedVersionSummary } from "./domain";
import { CURRENT_BRANCH_SCOPE, NO_HISTORY_FILTERS, type HistoryPort, type HistoryQuery } from "./port";

const query: HistoryQuery = { projectId: "/repo", sessionEpoch: "epoch-1" };

function version(index: number): SavedVersionSummary {
  const commit = index.toString(16).padStart(40, "0");
  return {
    commit,
    shortCommit: commit.slice(0, 7),
    parents: index === 0 ? [] : [(index - 1).toString(16).padStart(40, "0")],
    subject: `Version ${index}`,
    description: index % 2 ? "A multiline\ndescription ✓" : "",
    author: { name: "Ada", email: "ada@example.test" },
    authoredAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 60 },
    committedAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 60 },
    decorations: [],
    isRoot: index === 0,
    isMerge: false,
    publication: "local-only",
    subjectTruncated: false,
    descriptionTruncated: false,
    decorationsTruncated: false,
    messageUnavailable: null,
  };
}

function page(items: SavedVersionSummary[], overrides: Partial<HistoryPage> = {}): HistoryPage {
  return {
    repositoryId: "/repo",
    snapshotToken: "snapshot-1",
    scope: CURRENT_BRANCH_SCOPE,
    branch: "main",
    headState: "branch",
    headCommit: items[0]?.commit ?? null,
    upstream: null,
    versions: items,
    nextCursor: null,
    hasMore: false,
    shallow: false,
    warnings: [],
    ...overrides,
  };
}

function detail(item: SavedVersionSummary): SavedVersionDetail {
  return {
    version: item,
    comparisonBase: item.parents[0] ?? "empty-tree",
    comparisonIsEmptyTree: item.isRoot,
    comparisonIsFirstParent: false,
    files: [{ path: "src/app.ts", originalPath: null, category: "changed" }],
    fileCounts: { changed: 1, new: 0, deleted: 0, renamed: 0, total: 1 },
    filesTruncated: false,
    countsAreMinimum: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function port(overrides: Partial<HistoryPort> = {}): HistoryPort {
  return {
    readPage: vi.fn(async () => page([version(1), version(0)])),
    readDetail: vi.fn(async ({ commit }) => detail(commit === version(0).commit ? version(0) : version(1))),
    readFileDiff: vi.fn(async ({ filePath }) => ({
      kind: "text", path: filePath, originalPath: null, change: "changed", hunks: [], truncated: false,
    } satisfies FileDiff)),
    readFileMarkdown: vi.fn(async () => ({ kind: "ready" as const, beforeContent: null, content: "# New" })),
    readImagePreview: vi.fn(async () => ({ before: null, after: null })),
    ...overrides,
  };
}

describe("HistoryController", () => {
  it("keeps the user's latest version choice when an earlier refresh completes", async () => {
    const pending = deferred<HistoryPage>();
    const readPage = vi.fn(async () => page([version(1), version(0)]));
    const controller = createHistoryController(port({ readPage }));
    await controller.refresh(query);
    controller.selectVersion(query, version(0).commit);
    await vi.waitFor(() => expect(controller.getSnapshot(query).detail.detail?.version.commit).toBe(version(0).commit));
    readPage.mockImplementationOnce(() => pending.promise);
    const refresh = controller.refresh(query);
    controller.selectVersion(query, version(1).commit);
    pending.resolve(page([version(1), version(0)]));
    await refresh;
    expect(controller.getSnapshot(query).selectedCommit).toBe(version(1).commit);
    await vi.waitFor(() => expect(controller.getSnapshot(query).detail.detail?.version.commit).toBe(version(1).commit));
  });

  it("reads a saved document under the loaded snapshot, and refuses before there is one", async () => {
    const readFileMarkdown = vi.fn(async () => ({ kind: "ready" as const, beforeContent: null, content: "# New" }));
    const controller = createHistoryController(port({ readFileMarkdown }));
    await expect(controller.readFileMarkdown(query, version(1).commit, "guide.md")).rejects.toThrow();
    expect(readFileMarkdown).not.toHaveBeenCalled();
    await controller.refresh(query);
    await controller.readFileMarkdown(query, version(1).commit, "guide.md");
    expect(readFileMarkdown).toHaveBeenCalledWith({ ...query, snapshotToken: "snapshot-1", commit: version(1).commit, filePath: "guide.md" });
  });

  it.each([null, "list"])("selects and reads only the first displayed file for saved layout %s, including cached details", async (view) => {
    if (view === null) localStorage.removeItem("gitodile-file-list-view");
    else localStorage.setItem("gitodile-file-list-view", view);
    try {
      const readDetail = vi.fn(async ({ commit }: { commit: string }) => ({
        ...detail(commit === version(0).commit ? version(0) : version(1)),
        files: ["README.md", "src/z.ts", "src/a.ts"].map((path) => ({ path, originalPath: null, category: "changed" as const })),
      }));
      const readFileDiff = vi.fn(async ({ filePath }: { filePath: string }) => ({
        kind: "binary", path: filePath, originalPath: null, change: "changed",
      } satisfies FileDiff));
      const controller = createHistoryController(port({ readDetail, readFileDiff }));
      const first = view === "list" ? "README.md" : "src/a.ts";
      await controller.refresh(query);
      await vi.waitFor(() => expect(controller.getSnapshot(query).fileDiff.diff?.path).toBe(first));
      expect(controller.getSnapshot(query).selectedCommit).toBe(version(1).commit);
      expect(readFileDiff).toHaveBeenCalledTimes(1);
      expect(readFileDiff.mock.calls[0][0].filePath).toBe(first);

      controller.selectFile(query, "src/z.ts");
      await vi.waitFor(() => expect(controller.getSnapshot(query).fileDiff.diff?.path).toBe("src/z.ts"));
      await controller.refresh(query);
      await vi.waitFor(() => expect(controller.getSnapshot(query).selectedFilePath).toBe("src/z.ts"));

      controller.selectVersion(query, version(0).commit);
      await vi.waitFor(() => expect(controller.getSnapshot(query).fileDiff.diff?.path).toBe(first));
      controller.selectVersion(query, version(1).commit);
      expect(controller.getSnapshot(query).selectedFilePath).toBe(first);
      expect(readDetail).toHaveBeenCalledTimes(2);

      controller.selectVersion(query, version(0).commit);
      controller.setScrollOffset(query, 900);
      controller.selectFile(query, "src/z.ts");
      await vi.waitFor(() => expect(controller.getSnapshot(query).fileDiff.diff?.path).toBe("src/z.ts"));
      const reads = readDetail.mock.calls.length;
      await controller.refresh(query);
      expect(controller.getSnapshot(query)).toMatchObject({ selectedCommit: version(0).commit, selectedFilePath: "src/z.ts", scrollOffset: 900 });
      expect(readDetail).toHaveBeenCalledTimes(reads);
    } finally {
      localStorage.removeItem("gitodile-file-list-view");
    }
  });

  it("coalesces the first page and asks Rust for the bounded page size", async () => {
    const pending = deferred<HistoryPage>();
    const readPage = vi.fn(() => pending.promise);
    const controller = createHistoryController(port({ readPage }));
    const first = controller.refresh(query);
    expect(controller.refresh(query)).toBe(first);
    expect(HISTORY_INITIAL_PAGE_SIZE).toBe(50);
    expect(HISTORY_PAGE_SIZE).toBe(100);
    expect(readPage).toHaveBeenCalledWith({ ...query, pageSize: HISTORY_INITIAL_PAGE_SIZE, filters: NO_HISTORY_FILTERS, scope: CURRENT_BRANCH_SCOPE });
    pending.resolve(page([version(1), version(0)]));
    await first;
    expect(controller.getSnapshot(query).versions).toHaveLength(2);
    expect(controller.getSnapshot(query).selectedCommit).toBe(version(1).commit);
  });

  it("appends unique versions and keeps pagination metadata snapshot-consistent", async () => {
    const readPage = vi.fn()
      .mockResolvedValueOnce(page([version(3), version(2)], { hasMore: true, nextCursor: "cursor-2" }))
      .mockResolvedValueOnce(page([version(2), version(1), version(0)], { hasMore: false }));
    const controller = createHistoryController(port({ readPage }));
    await controller.refresh(query);
    await controller.loadMore(query);
    expect(controller.getSnapshot(query).versions.map(({ subject }) => subject)).toEqual([
      "Version 3", "Version 2", "Version 1", "Version 0",
    ]);
    expect(controller.getSnapshot(query).snapshot?.hasMore).toBe(false);
    expect(readPage).toHaveBeenLastCalledWith({ ...query, cursor: "cursor-2", pageSize: HISTORY_PAGE_SIZE, filters: NO_HISTORY_FILTERS, scope: CURRENT_BRANCH_SCOPE });
  });

  it("re-reads from Rust when the filters change and replaces the pages that answered the old question", async () => {
    const readPage = vi.fn()
      .mockResolvedValueOnce(page([version(3), version(2), version(1)], { hasMore: true, nextCursor: "cursor-2" }))
      .mockResolvedValueOnce(page([version(3), version(1)]));
    const controller = createHistoryController(port({ readPage }));
    await controller.refresh(query);
    expect(controller.getSnapshot(query).versions).toHaveLength(3);

    const filters = { ...NO_HISTORY_FILTERS, author: "Ada", noMerges: true };
    await controller.setFilters(query, filters);

    expect(readPage).toHaveBeenLastCalledWith({ ...query, pageSize: HISTORY_INITIAL_PAGE_SIZE, filters, scope: CURRENT_BRANCH_SCOPE });
    const snapshot = controller.getSnapshot(query);
    expect(snapshot.filters).toEqual(filters);
    // A fresh answer, not the old rows with some hidden: nothing from the
    // first page survives except what Rust sent again.
    expect(snapshot.versions.map(({ subject }) => subject)).toEqual(["Version 3", "Version 1"]);
    expect(snapshot.scrollOffset).toBe(0);

    // Setting the same filters again is not a question, so it is not a read.
    await controller.setFilters(query, { ...filters });
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  // The cursor counts an offset through one history. Carried into another, it
  // asks for rows that were never at that position — so changing the filters
  // has to retire it, and nothing may page until the fresh answer brings its
  // own. This is what made applying a filter fire a second, wrong request.
  it("retires the page cursor when the filters change so nothing pages through the old history", async () => {
    const pending = deferred<HistoryPage>();
    const readPage = vi.fn()
      .mockResolvedValueOnce(page([version(3), version(2)], { hasMore: true, nextCursor: "cursor-2" }))
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce(page([version(1)]));
    const controller = createHistoryController(port({ readPage }));
    await controller.refresh(query);
    expect(controller.getSnapshot(query).snapshot?.hasMore).toBe(true);

    const filters = { ...NO_HISTORY_FILTERS, unpublishedOnly: true };
    const reading = controller.setFilters(query, filters);

    const during = controller.getSnapshot(query);
    expect(during.isLoading).toBe(true);
    expect(during.snapshot?.hasMore).toBe(false);
    expect(during.snapshot?.nextCursor).toBeNull();
    // The rows and the selection are the previous answer, kept until the new
    // one lands rather than blanked — `isLoading` is what says so.
    expect(during.versions).toHaveLength(2);
    expect(during.selectedCommit).toBe(version(3).commit);

    await controller.loadMore(query);
    expect(readPage).toHaveBeenCalledTimes(2);

    pending.resolve(page([version(3)], { hasMore: true, nextCursor: "cursor-filtered" }));
    await reading;
    expect(controller.getSnapshot(query).snapshot?.nextCursor).toBe("cursor-filtered");
    await controller.loadMore(query);
    expect(readPage).toHaveBeenLastCalledWith({ ...query, cursor: "cursor-filtered", pageSize: HISTORY_PAGE_SIZE, filters, scope: CURRENT_BRANCH_SCOPE });
  });

  // The list is what a filter narrows. The card beside it describes one saved
  // version, and that version has not moved — so it must not blink through its
  // empty state and read itself back while the new page arrives.
  it("leaves the open saved version alone while the filters re-read the list", async () => {
    const readPage = vi.fn()
      .mockResolvedValueOnce(page([version(3), version(2), version(1)]))
      .mockResolvedValueOnce(page([version(3)]));
    const port_ = port({ readPage });
    const controller = createHistoryController(port_);
    await controller.refresh(query);
    await Promise.resolve();

    const opened = controller.getSnapshot(query);
    expect(opened.selectedCommit).toBe(version(3).commit);
    expect(opened.detail.detail).not.toBeNull();
    expect(opened.fileDiff.diff).not.toBeNull();
    const detailReads = (port_.readDetail as ReturnType<typeof vi.fn>).mock.calls.length;
    const diffReads = (port_.readFileDiff as ReturnType<typeof vi.fn>).mock.calls.length;

    // Every state the screen would render, not just the one it settles on: the
    // tear-down this guards against was a single frame.
    const seen: Array<{ detail: boolean; diff: boolean; commit: string | null }> = [];
    const stop = controller.subscribe(query, () => {
      const state = controller.getSnapshot(query);
      seen.push({
        detail: state.detail.detail !== null,
        diff: state.fileDiff.diff !== null,
        commit: state.selectedCommit,
      });
    });

    await controller.setFilters(query, { ...NO_HISTORY_FILTERS, unpublishedOnly: true });
    await Promise.resolve();
    stop();

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((state) => state.detail)).toBe(true);
    expect(seen.every((state) => state.diff)).toBe(true);
    expect(seen.every((state) => state.commit === version(3).commit)).toBe(true);
    // Nothing was read back that was already held.
    expect((port_.readDetail as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(detailReads);
    expect((port_.readFileDiff as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(diffReads);
    expect(controller.getSnapshot(query).versions).toHaveLength(1);
  });

  // The announcement that the open version is gone has to outlive the read that
  // replaces it. Clearing it when the replacement's detail landed retracted a
  // `role="status"` message within one round trip of publishing it.
  it("keeps saying the selection was removed until another one is chosen", async () => {
    const readPage = vi.fn()
      .mockResolvedValueOnce(page([version(3), version(2)]))
      .mockResolvedValueOnce(page([version(1), version(0)]));
    const readDetail = vi.fn(async ({ commit }: { commit: string }) => {
      if (commit === version(3).commit) {
        throw { code: "invalid_selection", message: "gone", remediation: null };
      }
      return detail(version(1));
    });
    const controller = createHistoryController(port({ readPage, readDetail }));
    await controller.refresh(query);
    await Promise.resolve();
    expect(controller.getSnapshot(query).selectedCommit).toBe(version(3).commit);

    // The open version is not on the new page, so its detail is validated —
    // and it is gone.
    await controller.refresh(query);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const moved = controller.getSnapshot(query);
    expect(moved.selectedCommit).toBe(version(1).commit);
    expect(moved.selectionRemoved).toBe(true);
    expect(moved.detail.detail).not.toBeNull();

    // Choosing a version is the acknowledgement, and the only thing that ends
    // the message.
    controller.selectVersion(query, version(0).commit);
    expect(controller.getSnapshot(query).selectionRemoved).toBe(false);
  });

  // Reads are coalesced by what they ask for, but only within one generation.
  // A request started before the generation moved publishes nothing when it
  // lands, so handing it back to a later caller leaves that caller waiting for
  // an answer that never comes — and the pane it belongs to stranded on its
  // empty state, until another version is clicked.
  it("does not strand the open version when the filters change mid-read", async () => {
    const pending = deferred<SavedVersionDetail>();
    const readDetail = vi.fn(() => pending.promise);
    const controller = createHistoryController(port({
      readPage: vi.fn(async () => page([version(1), version(0)])),
      readDetail,
    }));
    await controller.refresh(query);
    expect(controller.getSnapshot(query).detail.isLoading).toBe(true);

    // The filtered page lands first; the detail read is still out.
    await controller.setFilters(query, { ...NO_HISTORY_FILTERS, noMerges: true });
    pending.resolve(detail(version(1)));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const state = controller.getSnapshot(query);
    expect(state.selectedCommit).toBe(version(1).commit);
    expect(state.detail.detail).not.toBeNull();
    expect(state.detail.isLoading).toBe(false);
  });

  it("automatically restarts from the newest page after a stale cursor", async () => {
    const refreshed = page([version(4), version(3)], { snapshotToken: "snapshot-2" });
    const readPage = vi.fn()
      .mockResolvedValueOnce(page([version(3), version(2)], { hasMore: true, nextCursor: "stale" }))
      .mockRejectedValueOnce({ code: "stale_history_cursor", message: "stale", remediation: null })
      .mockResolvedValueOnce(refreshed);
    const controller = createHistoryController(port({ readPage }));
    await controller.refresh(query);
    await controller.loadMore(query);
    await vi.waitFor(() => expect(controller.getSnapshot(query).snapshot?.snapshotToken).toBe("snapshot-2"));
    expect(controller.getSnapshot(query).staleNotice).toBe(true);
    expect(controller.getSnapshot(query).versions[0]?.subject).toBe("Version 4");
  });

  it("loads detail and a typed diff once, then serves both from bounded caches", async () => {
    const readDetail = vi.fn(async () => detail(version(1)));
    const readFileDiff = vi.fn(async () => ({
      kind: "binary", path: "src/app.ts", originalPath: null, change: "changed",
    } satisfies FileDiff));
    const controller = createHistoryController(port({ readDetail, readFileDiff }));
    await controller.refresh(query);
    await vi.waitFor(() => expect(controller.getSnapshot(query).detail.detail).not.toBeNull());
    controller.selectFile(query, "src/app.ts");
    await vi.waitFor(() => expect(controller.getSnapshot(query).fileDiff.diff).not.toBeNull());
    controller.selectVersion(query, version(0).commit);
    controller.selectVersion(query, version(1).commit);
    controller.selectFile(query, "src/app.ts");
    expect(readDetail).toHaveBeenCalledTimes(2);
    expect(readFileDiff).toHaveBeenCalledTimes(1);
  });

  it("rejects late responses from closed epochs and bounds inactive sessions", async () => {
    const oldPage = deferred<HistoryPage>();
    const controller = createHistoryController(port({ readPage: vi.fn((request) =>
      request.sessionEpoch === "old" ? oldPage.promise : Promise.resolve(page([version(9)])),
    ) }));
    const oldQuery = { projectId: "/repo", sessionEpoch: "old" };
    const pending = controller.refresh(oldQuery);
    controller.close(oldQuery);
    await controller.refresh({ projectId: "/repo", sessionEpoch: "new" });
    oldPage.resolve(page([version(1)]));
    await pending;
    expect(controller.getSnapshot({ projectId: "/repo", sessionEpoch: "new" }).versions[0]?.subject).toBe("Version 9");
    for (let index = 0; index < 12; index += 1) {
      controller.getSnapshot({ projectId: `/repo-${index}`, sessionEpoch: `epoch-${index}` });
    }
    expect(controller.size()).toBeLessThanOrEqual(MAX_HISTORY_SESSION_CACHES);
  });

  it("reads a different history when the scope changes, and retires the cursor that paged the old one", async () => {
    const readPage = vi.fn(async () => page([version(2), version(1)], { nextCursor: "cursor-2", hasMore: true }));
    const controller = createHistoryController(port({ readPage }));
    await controller.refresh(query);
    readPage.mockClear();

    await controller.setScope(query, { kind: "branch", name: "feature/foo" });

    expect(readPage).toHaveBeenCalledTimes(1);
    // The scope is an argument to the same read the filters are arguments to,
    // never a predicate over the rows already loaded.
    expect(readPage).toHaveBeenLastCalledWith({
      ...query,
      pageSize: HISTORY_INITIAL_PAGE_SIZE,
      filters: NO_HISTORY_FILTERS,
      scope: { kind: "branch", name: "feature/foo" },
    });
    expect(controller.getSnapshot(query).scope).toEqual({ kind: "branch", name: "feature/foo" });
    // The assertion above is an exact match, so it is also the proof that no
    // cursor went with the read: an offset counted through one history must
    // never be applied to another.
  });

  it("cannot page through the old history while the new scope is still being read", async () => {
    const first = page([version(2), version(1)], { nextCursor: "cursor-2", hasMore: true });
    const pending = deferred<HistoryPage>();
    const readPage = vi.fn(async () => first);
    const controller = createHistoryController(port({ readPage }));
    await controller.refresh(query);
    expect(controller.getSnapshot(query).snapshot?.nextCursor).toBe("cursor-2");

    readPage.mockImplementation(() => pending.promise);
    const scoping = controller.setScope(query, { kind: "allBranches" });
    // The rows are still the previous answer and stay on screen, but the
    // pointers that paged them are gone: the timeline's "near the end, fetch
    // more" rule can no longer fire the old cursor at the new question.
    expect(controller.getSnapshot(query).versions).toHaveLength(2);
    expect(controller.getSnapshot(query).snapshot?.nextCursor).toBeNull();
    expect(controller.getSnapshot(query).snapshot?.hasMore).toBe(false);
    expect(controller.getSnapshot(query).isLoading).toBe(true);
    readPage.mockClear();
    await controller.loadMore(query);
    expect(readPage).not.toHaveBeenCalled();

    pending.resolve(page([version(3)], { scope: { kind: "allBranches" }, snapshotToken: "snapshot-2" }));
    await scoping;
    expect(controller.getSnapshot(query).versions).toHaveLength(1);
  });

  it("keeps the filters when the scope changes, and the scope when the filters do", async () => {
    const readPage = vi.fn(async () => page([version(1)]));
    const controller = createHistoryController(port({ readPage }));
    await controller.refresh(query);

    const filters = { ...NO_HISTORY_FILTERS, noMerges: true };
    await controller.setFilters(query, filters);
    await controller.setScope(query, { kind: "allBranches" });
    expect(controller.getSnapshot(query).filters).toEqual(filters);
    expect(readPage).toHaveBeenLastCalledWith({
      ...query,
      pageSize: HISTORY_INITIAL_PAGE_SIZE,
      filters,
      scope: { kind: "allBranches" },
    });

    // Clearing every filter is not a way back to the current branch.
    await controller.setFilters(query, NO_HISTORY_FILTERS);
    expect(controller.getSnapshot(query).scope).toEqual({ kind: "allBranches" });
  });

  it("does not re-read when the scope it is asked for is the one it already has", async () => {
    const readPage = vi.fn(async () => page([version(1)]));
    const controller = createHistoryController(port({ readPage }));
    await controller.refresh(query);
    readPage.mockClear();

    await controller.setScope(query, CURRENT_BRANCH_SCOPE);
    await controller.setScope(query, { kind: "branch", name: "feature/foo" });
    await controller.setScope(query, { kind: "branch", name: "feature/foo" });

    expect(readPage).toHaveBeenCalledTimes(1);
  });
});
