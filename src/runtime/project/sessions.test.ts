// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_PENDING_VERSIONS,
  getMutationBlocker,
  hasUnsettledOperation,
  initialProjectSessionsState,
  projectSessionsReducer,
  projectSessionsStateToStored,
  readStoredProjects,
  shouldRefreshOnWatchEvent,
  writeStoredProjects,
  type ProjectSessionsState,
} from "./sessions";
import type { RepositoryInfo } from "../../features/repository";

function makeProject(path: string, overrides: Partial<RepositoryInfo> = {}): RepositoryInfo {
  return {
    name: path.split("/").pop() ?? path,
    path,
    selectedPath: path,
    gitDir: `${path}/.git`,
    commonGitDir: `${path}/.git`,
    branch: "main",
    headState: "branch",
    kind: "repository",
    sessionEpoch: `epoch:${path}`,
    ...overrides,
  };
}

describe("projectSessionsReducer", () => {
  it("opens a new project as the active session", () => {
    const state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    expect(state.order).toEqual(["/a"]);
    expect(state.activeId).toBe("/a");
    expect(state.byId["/a"].project.path).toBe("/a");
    expect(state.byId["/a"].workingTree).toBeNull();
    expect(state.byId["/a"].pendingVersions).toEqual(EMPTY_PENDING_VERSIONS);
  });

  it("activates an already-open worktree instead of duplicating it", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "open", project: makeProject("/b") });
    state = projectSessionsReducer(state, {
      type: "open",
      project: makeProject("/a", { branch: "feature" }),
    });
    expect(state.order).toEqual(["/a", "/b"]);
    expect(state.activeId).toBe("/a");
    // Repository facts refresh even for a dedup-activated session.
    expect(state.byId["/a"].project.branch).toBe("feature");
  });

  it("refreshes facts without changing the active project, its view or the session order", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "open", project: makeProject("/b") });
    state = projectSessionsReducer(state, { type: "navigate", id: "/b", view: "conflicts" });
    const active = state.byId["/b"];
    const next = projectSessionsReducer(state, { type: "refreshProject", project: makeProject("/a", { branch: "feature" }) });
    expect(next.activeId).toBe("/b");
    expect(next.order).toBe(state.order);
    expect(next.byId["/b"]).toBe(active);
    expect(next.byId["/a"].project.branch).toBe("feature");
    const home = projectSessionsReducer(state, { type: "close", id: "/b" });
    expect(projectSessionsReducer(home, { type: "refreshProject", project: makeProject("/a") }).activeId).toBeNull();
  });

  it.each(["closed", "reopened"] as const)("ignores a late identity refresh after a project was %s", (kind) => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "close", id: "/a" });
    if (kind === "reopened") state = projectSessionsReducer(state, { type: "open", project: makeProject("/a", { sessionEpoch: "new" }) });
    expect(projectSessionsReducer(state, { type: "refreshProject", project: makeProject("/a", { branch: "stale" }) })).toBe(state);
  });

  it("restores every project and the stored active one in a single transition", () => {
    const state = projectSessionsReducer(initialProjectSessionsState, {
      type: "restore",
      projects: [makeProject("/a"), makeProject("/b"), makeProject("/c")],
      activeId: "/b",
    });
    expect(state.order).toEqual(["/a", "/b", "/c"]);
    expect(state.activeId).toBe("/b");
  });

  it.each([
    { stored: "/b", expected: "/c" },
    { stored: null, expected: null },
  ])("restores selection $stored as $expected without inventing an explicit choice", ({ stored, expected }) => {
    const state = projectSessionsReducer(initialProjectSessionsState, {
      type: "restore",
      projects: [makeProject("/a"), makeProject("/c")],
      activeId: stored,
    });
    expect(state.order).toEqual(["/a", "/c"]);
    expect(state.activeId).toBe(expected);
  });

  it("keeps a project the user opened while restore was still revalidating", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, {
      type: "open",
      project: makeProject("/b", { branch: "feature" }),
    });
    state = projectSessionsReducer(state, {
      type: "restore",
      projects: [makeProject("/a"), makeProject("/b")],
      activeId: null,
    });
    expect(state.order).toEqual(["/b", "/a"]);
    expect(state.activeId).toBe("/b");
    expect(state.byId["/b"].project.branch).toBe("feature");
  });

  it("keeps the project the user opened during restore active over the stored one", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/x") });
    state = projectSessionsReducer(state, {
      type: "restore",
      projects: [makeProject("/a"), makeProject("/b")],
      activeId: "/a",
    });
    expect(state.order).toEqual(["/x", "/a", "/b"]);
    expect(state.activeId).toBe("/x");
  });

  it("ignores activating an id that isn't open", () => {
    const state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    const next = projectSessionsReducer(state, { type: "activate", id: "/nope" });
    expect(next).toBe(state);
  });

  it("closing the active session leaves no project active, never a neighbour", () => {
    let state = initialProjectSessionsState;
    for (const path of ["/a", "/b", "/c"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    state = projectSessionsReducer(state, { type: "activate", id: "/b" });
    state = projectSessionsReducer(state, { type: "close", id: "/b" });
    expect(state.order).toEqual(["/a", "/c"]);
    expect(state.activeId).toBeNull();
  });

  it("closing the only open session returns to the no-project state", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "close", id: "/a" });
    expect(state.order).toEqual([]);
    expect(state.activeId).toBeNull();
    expect(state.byId["/a"]).toBeUndefined();
  });

  it("rejects responses from the previous epoch after close and reopen", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, {
      type: "open",
      project: makeProject("/a", { sessionEpoch: "old" }),
    });
    state = projectSessionsReducer(state, { type: "close", id: "/a" });
    state = projectSessionsReducer(state, {
      type: "open",
      project: makeProject("/a", { sessionEpoch: "new" }),
    });
    state = projectSessionsReducer(state, {
      type: "startStatusCheck",
      id: "/a",
      epoch: "new",
      generation: 1,
    });
    const stale = projectSessionsReducer(state, {
      type: "applyWorkingTreeError",
      id: "/a",
      epoch: "old",
      generation: 1,
      error: "late old result",
    });
    expect(stale).toBe(state);
    expect(stale.byId["/a"].workingTreeError).toBeNull();
  });

  it("closing an inactive session leaves the active session untouched", () => {
    let state = initialProjectSessionsState;
    for (const path of ["/a", "/b"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    state = projectSessionsReducer(state, { type: "activate", id: "/a" });
    state = projectSessionsReducer(state, { type: "close", id: "/b" });
    expect(state.activeId).toBe("/a");
    expect(state.order).toEqual(["/a"]);
  });

  it("reorders a session to a new index", () => {
    let state = initialProjectSessionsState;
    for (const path of ["/a", "/b", "/c"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    state = projectSessionsReducer(state, { type: "reorder", id: "/c", toIndex: 0 });
    expect(state.order).toEqual(["/c", "/a", "/b"]);
  });

  it("restores a stored session list by opening each in order and re-activating the stored active id", () => {
    let state = initialProjectSessionsState;
    for (const path of ["/a", "/b", "/c"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    // Restoring lands on the last-opened project by default...
    expect(state.activeId).toBe("/c");
    // ...unless the stored active id says otherwise.
    state = projectSessionsReducer(state, { type: "activate", id: "/b" });
    expect(state.activeId).toBe("/b");
  });

  it("skips an unreadable stored path without disturbing the rest of the restore", () => {
    let state = initialProjectSessionsState;
    // "/missing" simply never gets an "open" dispatched for it (the caller
    // couldn't reopen it), which is exactly how a partial restore failure
    // is expressed against this reducer.
    for (const path of ["/a", "/c"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    expect(state.order).toEqual(["/a", "/c"]);
    expect(Object.keys(state.byId)).toHaveLength(2);
  });

  it("applies a status result only when its generation still matches", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "startStatusCheck", id: "/a", epoch: "epoch:/a", generation: 1 });
    expect(state.byId["/a"].isCheckingChanges).toBe(true);

    // A second, newer refresh starts before the first resolves.
    state = projectSessionsReducer(state, { type: "startStatusCheck", id: "/a", epoch: "epoch:/a", generation: 2 });

    // The stale (generation 1) response arrives late and must be ignored.
    const staleWorkingTree = {
      isClean: false,
      counts: { changed: 1, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 1 },
      lineTotals: null,
      entries: [],
      truncated: false,
      hasPreparedChanges: false,
      hasUnpreparedChanges: true,
      upstream: { branch: null, upstream: null, ahead: 0, behind: 0 },
    };
    const afterStale = projectSessionsReducer(state, {
      type: "applyWorkingTree",
      id: "/a",
      epoch: "epoch:/a",
      generation: 1,
      workingTree: staleWorkingTree,
      checkedAt: 1_700_000_000_000,
    });
    expect(afterStale).toBe(state);
    expect(afterStale.byId["/a"].workingTree).toBeNull();
    expect(afterStale.byId["/a"].isCheckingChanges).toBe(true);

    // The current (generation 2) response is applied normally.
    const freshWorkingTree = { ...staleWorkingTree, isClean: true };
    const afterFresh = projectSessionsReducer(state, {
      type: "applyWorkingTree",
      id: "/a",
      epoch: "epoch:/a",
      generation: 2,
      workingTree: freshWorkingTree,
      checkedAt: 1_700_000_000_000,
    });
    expect(afterFresh.byId["/a"].workingTree).toEqual(freshWorkingTree);
    expect(afterFresh.byId["/a"].isCheckingChanges).toBe(false);
  });

  it("keeps the last known working tree when a refresh fails", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    const workingTree = {
      isClean: true,
      counts: { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 0 },
      lineTotals: null,
      entries: [],
      truncated: false,
      hasPreparedChanges: false,
      hasUnpreparedChanges: false,
      upstream: { branch: null, upstream: null, ahead: 0, behind: 0 },
    };
    state = projectSessionsReducer(state, { type: "startStatusCheck", id: "/a", epoch: "epoch:/a", generation: 1 });
    state = projectSessionsReducer(state, { type: "applyWorkingTree", id: "/a", epoch: "epoch:/a", generation: 1, workingTree, checkedAt: 1_700_000_000_000 });
    state = projectSessionsReducer(state, { type: "startStatusCheck", id: "/a", epoch: "epoch:/a", generation: 2 });
    state = projectSessionsReducer(state, {
      type: "applyWorkingTreeError",
      id: "/a",
      epoch: "epoch:/a",
      generation: 2,
      error: "network blip",
    });
    expect(state.byId["/a"].workingTree).toEqual(workingTree);
    // The freshness stamp belongs to the snapshot still on screen, so a
    // failed refresh must not advance it — the Changes screen would then
    // claim "checked just now" about data the failed check never replaced.
    expect(state.byId["/a"].workingTreeCheckedAt).toBe(1_700_000_000_000);
    expect(state.byId["/a"].workingTreeError).toBe("network blip");
    expect(state.byId["/a"].isCheckingChanges).toBe(false);
  });

  it("commits a publish result to the matching epoch before follow-up reads", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "startStatusCheck", id: "/a", epoch: "epoch:/a", generation: 1 });
    const version = (commit: string) => ({
      commit,
      shortCommit: commit,
      title: commit,
      description: null,
      committedAt: "2026-08-09T10:00:00Z",
      author: "Test",
    });
    state = projectSessionsReducer(state, {
      type: "applyPendingVersions",
      id: "/a",
      epoch: "epoch:/a",
      generation: 1,
      result: { totalCount: 3, versions: [version("new"), version("middle"), version("old")], isTruncated: false },
    });
    state = projectSessionsReducer(state, {
      type: "commitPublishedVersions",
      id: "/a",
      epoch: "epoch:/a",
      generation: 2,
      remaining: 1,
    });
    expect(state.byId["/a"].pendingVersions).toEqual({
      totalCount: 1,
      versions: [version("new")],
      isTruncated: false,
    });
    const staleEpoch = projectSessionsReducer(state, {
      type: "commitPublishedVersions",
      id: "/a",
      epoch: "old-epoch",
      generation: 3,
      remaining: 0,
    });
    expect(staleEpoch).toBe(state);
  });

  it("answers a watch event only when no operation owns the working tree", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    expect(shouldRefreshOnWatchEvent(state.byId["/a"])).toBe(true);

    // A local mutation writes repository state itself; refreshing underneath
    // it would show a half-finished tree or move the ground under a plan being
    // confirmed. Branch operations use the same coordination contract
    // as save and publish.
    state = projectSessionsReducer(state, { type: "startOperation", id: "/a", kind: "branch" });
    expect(shouldRefreshOnWatchEvent(state.byId["/a"])).toBe(false);
    for (const phase of ["executing", "verifying", "uncertain"] as const) {
      state = projectSessionsReducer(state, { type: "setOperationPhase", id: "/a", phase });
      expect(shouldRefreshOnWatchEvent(state.byId["/a"])).toBe(false);
    }

    // Settled phases only linger because the dialog is still open.
    for (const phase of ["error", "success"] as const) {
      state = projectSessionsReducer(state, { type: "setOperationPhase", id: "/a", phase });
      expect(shouldRefreshOnWatchEvent(state.byId["/a"])).toBe(true);
    }

    // An event for a project that isn't open is simply dropped.
    expect(shouldRefreshOnWatchEvent(state.byId["/gone"])).toBe(false);
  });

  it("blocks a window reload only while any project operation is unsettled", () => {
    let state = projectSessionsReducer(initialProjectSessionsState, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "open", project: makeProject("/b") });
    expect(hasUnsettledOperation(state)).toBe(false);

    state = projectSessionsReducer(state, { type: "startOperation", id: "/a", kind: "save" });
    expect(hasUnsettledOperation(state)).toBe(true);

    for (const phase of ["executing", "verifying", "uncertain"] as const) {
      state = projectSessionsReducer(state, { type: "setOperationPhase", id: "/a", phase });
      expect(hasUnsettledOperation(state)).toBe(true);
    }

    state = projectSessionsReducer(state, { type: "setOperationPhase", id: "/a", phase: "error" });
    expect(hasUnsettledOperation(state)).toBe(false);
    state = projectSessionsReducer(state, { type: "setOperationPhase", id: "/a", phase: "success" });
    expect(hasUnsettledOperation(state)).toBe(false);
  });

  it("remembers the last view and changes selection per session", () => {
    let state: ProjectSessionsState = initialProjectSessionsState;
    for (const path of ["/a", "/b"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    state = projectSessionsReducer(state, { type: "navigate", id: "/a", view: "workbench" });
    state = projectSessionsReducer(state, {
      type: "setChangesSelection",
      id: "/a",
      selection: { selectedPath: "src/main.tsx", excludedPaths: ["README.md"] },
    });
    expect(state.byId["/a"].lastView).toBe("workbench");
    expect(state.byId["/a"].changesSelection).toEqual({ selectedPath: "src/main.tsx", excludedPaths: ["README.md"] });
    expect(state.byId["/b"].lastView).toBe("overview");
  });

  it("keeps independent back and forward history for each project", () => {
    let state = initialProjectSessionsState;
    state = projectSessionsReducer(state, { type: "open", project: makeProject("/a") });
    state = projectSessionsReducer(state, { type: "navigate", id: "/a", view: "workbench" });
    state = projectSessionsReducer(state, { type: "open", project: makeProject("/b") });

    state = projectSessionsReducer(state, { type: "goBack", id: "/a" });
    expect(state.byId["/a"].lastView).toBe("overview");
    expect(state.byId["/b"].lastView).toBe("overview");

    state = projectSessionsReducer(state, { type: "goForward", id: "/a" });
    expect(state.byId["/a"].lastView).toBe("workbench");
  });

  it("blocks concurrent mutations that share a common Git directory", () => {
    let state = initialProjectSessionsState;
    state = projectSessionsReducer(state, {
      type: "open",
      project: makeProject("/worktree-a", { commonGitDir: "/repo/.git" }),
    });
    state = projectSessionsReducer(state, {
      type: "open",
      project: makeProject("/worktree-b", { commonGitDir: "/repo/.git" }),
    });
    state = projectSessionsReducer(state, {
      type: "startOperation",
      id: "/worktree-a",
      kind: "branch",
    });

    expect(getMutationBlocker(state, "/worktree-b")?.id).toBe("/worktree-a");
    const blocked = projectSessionsReducer(state, {
      type: "startOperation",
      id: "/worktree-b",
      kind: "publish",
    });
    expect(blocked).toBe(state);

    state = projectSessionsReducer(state, { type: "finishOperation", id: "/worktree-a" });
    state = projectSessionsReducer(state, {
      type: "startOperation",
      id: "/worktree-b",
      kind: "publish",
    });
    expect(state.byId["/worktree-b"].operation).toEqual({
      kind: "publish",
      phase: "planning",
      epoch: "epoch:/worktree-b",
    });
  });
});

describe("project storage persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips the current session order and active id", () => {
    let state = initialProjectSessionsState;
    for (const path of ["/a", "/b"]) {
      state = projectSessionsReducer(state, { type: "open", project: makeProject(path) });
    }
    writeStoredProjects(projectSessionsStateToStored(state));
    expect(readStoredProjects()).toEqual({ version: 1, order: ["/a", "/b"], activeId: "/b" });
  });

  it("returns an empty list when nothing is stored", () => {
    expect(readStoredProjects()).toEqual({ version: 1, order: [], activeId: null });
  });

  it("migrates the legacy single-project key exactly once", () => {
    localStorage.setItem("gitodile-last-project-path", "/old/project");
    expect(readStoredProjects()).toEqual({ version: 1, order: ["/old/project"], activeId: "/old/project" });
    expect(localStorage.getItem("gitodile-last-project-path")).toBeNull();
    expect(localStorage.getItem("gitodile-projects")).not.toBeNull();
  });

  it("treats corrupt JSON under the new key as nothing stored", () => {
    localStorage.setItem("gitodile-projects", "{not json");
    expect(readStoredProjects()).toEqual({ version: 1, order: [], activeId: null });
  });

  it("treats an unrecognized schema version as nothing stored", () => {
    localStorage.setItem("gitodile-projects", JSON.stringify({ version: 2, order: ["/a"], activeId: "/a" }));
    expect(readStoredProjects()).toEqual({ version: 1, order: [], activeId: null });
  });
});
