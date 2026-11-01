import { describe, expect, it, vi } from "vitest";

import { createRepositoryController } from "./controller";
import { createRepositoryReadCoordinator, type RepositoryReadSubscriber } from "./readCoordinator";
import type { RepositoryInfo } from "./domain";
import { createProjectRuntime, type ProjectRuntime } from "../../runtime/project/runtime";
import type { ProjectSessionsState } from "../../runtime/project/sessions";

const EPOCH = "epoch-1";

/** Drains every pending microtask, including the awaited repository open. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const project = (): RepositoryInfo => ({
  name: "repo", path: "/repo", selectedPath: "/repo", gitDir: "/repo/.git", commonGitDir: "/repo/.git",
  branch: "main", headState: "branch", kind: "repository", sessionEpoch: EPOCH,
});

function sessionsState(overrides: Partial<ProjectSessionsState["byId"][string]> = {}): ProjectSessionsState {
  const runtime = createProjectRuntime();
  runtime.dispatch({ type: "open", project: project() });
  const state = runtime.getSnapshot();
  return { ...state, byId: { "/repo": { ...state.byId["/repo"], ...overrides } } };
}

/** Records the order refreshes start in, and lets a refresh be held open. */
function recordingSubscriber(
  id: string,
  refreshOn: RepositoryReadSubscriber["refreshOn"],
  blocking: boolean,
  log: string[],
): RepositoryReadSubscriber & { settle: () => void } {
  let release = (): void => {};
  return {
    id,
    refreshOn,
    blocking,
    refresh() {
      log.push(`refresh:${id}`);
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    supersede() {
      log.push(`supersede:${id}`);
    },
    settle: () => release(),
  };
}

function coordinatorWith(log: string[]) {
  const runtime = createProjectRuntime();
  runtime.dispatch({ type: "open", project: project() });
  const repository = createRepositoryController({
    openFolder: vi.fn(),
    open: vi.fn(async () => {
      log.push("open:repository");
      return project();
    }),
  });
  const background = recordingSubscriber("branches", "shared-change", false, log);
  const awaited = recordingSubscriber("status", "worktree-change", true, log);
  const coordinator = createRepositoryReadCoordinator(repository, [awaited, background]);
  return { coordinator, runtime, background, awaited };
}

describe("repository read coordinator", () => {
  it.each(["worktree", "head_or_refs", "shared_repository"] as const)("refreshes an inactive project's %s event without selecting it", async (kind) => {
    const runtime = createProjectRuntime();
    runtime.dispatch({ type: "open", project: project() });
    runtime.dispatch({ type: "open", project: { ...project(), name: "other", path: "/other", sessionEpoch: "other-epoch" } });
    runtime.dispatch({ type: "navigate", id: "/other", view: "workbench" });
    const active = runtime.getSnapshot().byId["/other"];
    const refresh = vi.fn();
    const repository = createRepositoryController({
      openFolder: vi.fn(),
      open: vi.fn(async () => ({ ...project(), branch: "updated" })),
    });
    const coordinator = createRepositoryReadCoordinator(repository, [{
      id: "status", refreshOn: "worktree-change", blocking: true, refresh, supersede: vi.fn(),
    }]);

    coordinator.handleInvalidation(runtime, runtime.getSnapshot(), {
      projectId: "/repo", sessionEpoch: EPOCH, sequence: 1, kind,
    });
    await flush();

    expect(refresh).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: EPOCH });
    expect(runtime.getSnapshot().activeId).toBe("/other");
    expect(runtime.getSnapshot().byId["/other"]).toBe(active);
    expect(runtime.getSnapshot().byId["/repo"].project.branch).toBe(kind === "worktree" ? "main" : "updated");
    runtime.dispose();
  });

  it.each(["refreshAll", "refreshProjectAndWorktree"] as const)("%s preserves a project selected while its identity read was pending", async (method) => {
    const runtime = createProjectRuntime();
    runtime.dispatch({ type: "open", project: project() });
    let finish!: (value: RepositoryInfo) => void;
    const repository = createRepositoryController({
      openFolder: vi.fn(),
      open: vi.fn(() => new Promise<RepositoryInfo>((resolve) => { finish = resolve; })),
    });
    const coordinator = createRepositoryReadCoordinator(repository, []);

    const refreshing = coordinator[method](runtime, runtime.getSnapshot(), "/repo");
    runtime.dispatch({ type: "open", project: { ...project(), path: "/other", sessionEpoch: "other-epoch" } });
    const active = runtime.getSnapshot().byId["/other"];
    finish({ ...project(), branch: "updated" });
    await refreshing;

    expect(runtime.getSnapshot().activeId).toBe("/other");
    expect(runtime.getSnapshot().byId["/other"]).toBe(active);
    expect(runtime.getSnapshot().byId["/repo"].project.branch).toBe("updated");
    runtime.dispose();
  });

  it("dispatches repository identity before any subscriber refreshes", async () => {
    const log: string[] = [];
    const { coordinator, runtime, awaited } = coordinatorWith(log);
    const dispatched: string[] = [];
    const recording: ProjectRuntime = {
      ...runtime,
      dispatch: (action) => {
        dispatched.push(action.type);
        log.push(`dispatch:${action.type}`);
        runtime.dispatch(action);
      },
    };

    const refreshing = coordinator.refreshAll(recording, sessionsState(), "/repo");
    await flush();
    awaited.settle();
    await refreshing;

    expect(dispatched).toEqual(["refreshProject"]);
    expect(log.indexOf("dispatch:refreshProject")).toBeLessThan(log.indexOf("refresh:status"));
    expect(log.indexOf("dispatch:refreshProject")).toBeLessThan(log.indexOf("refresh:branches"));
  });

  it("starts background reads first and resolves without waiting for them", async () => {
    // The regression this pins: awaiting every subscriber would make a caller's
    // "the refresh finished" mean "the branch inventory came back too". Branch
    // discovery is deliberately left running.
    const log: string[] = [];
    const { coordinator, runtime, awaited } = coordinatorWith(log);

    let settled = false;
    const refreshing = coordinator.refreshAll(runtime, sessionsState(), "/repo").then(() => {
      settled = true;
    });
    await flush();

    expect(log.indexOf("refresh:branches")).toBeLessThan(log.indexOf("refresh:status"));
    expect(settled).toBe(false);

    // The background subscriber is never settled; only the blocking one is.
    awaited.settle();
    await refreshing;
    expect(settled).toBe(true);
  });

  it("skips shared-change subscribers for a worktree-only refresh", async () => {
    const log: string[] = [];
    const { coordinator, awaited } = coordinatorWith(log);

    const refreshing = coordinator.refreshWorktree(sessionsState(), "/repo");
    await flush();
    awaited.settle();
    await refreshing;

    expect(log).toContain("refresh:status");
    expect(log).not.toContain("refresh:branches");
  });

  it("refreshes project identity and working-tree facts without starting shared readers", async () => {
    const log: string[] = [];
    const { coordinator, runtime, background, awaited } = coordinatorWith(log);

    const refreshing = coordinator.refreshProjectAndWorktree(runtime, sessionsState(), "/repo");
    await flush();
    awaited.settle();
    await refreshing;

    expect(log).toContain("open:repository");
    expect(log).toContain("refresh:status");
    expect(log).not.toContain("refresh:branches");
    background.settle();
  });

  it("starts and awaits every shared reader without repeating the working-tree read", async () => {
    const log: string[] = [];
    const { coordinator, background } = coordinatorWith(log);

    let settled = false;
    const refreshing = coordinator.refreshSharedAndWait(sessionsState(), "/repo").then(() => {
      settled = true;
    });
    await flush();

    expect(log).toContain("refresh:branches");
    expect(log).not.toContain("refresh:status");
    expect(settled).toBe(false);

    background.settle();
    await refreshing;
    expect(settled).toBe(true);
  });

  it("supersedes every subscriber before refreshing after a mutation", async () => {
    const log: string[] = [];
    const { coordinator, runtime, awaited } = coordinatorWith(log);

    const refreshing = coordinator.refreshAfterMutation(runtime, sessionsState(), "/repo");
    await flush();
    awaited.settle();
    await refreshing;

    expect(log.indexOf("supersede:status")).toBeLessThan(log.indexOf("refresh:status"));
    expect(log.indexOf("supersede:branches")).toBeLessThan(log.indexOf("refresh:branches"));
  });

  it("defers a watcher invalidation while a mutation owns the working tree", async () => {
    const log: string[] = [];
    const { coordinator, runtime } = coordinatorWith(log);
    const busy = sessionsState({ operation: { kind: "save", phase: "executing", epoch: EPOCH } });

    coordinator.handleInvalidation(runtime, busy, {
      projectId: "/repo", sessionEpoch: EPOCH, sequence: 1, kind: "head_or_refs",
    });
    await flush();

    expect(log).toEqual([]);

    coordinator.finishDeferred(runtime, sessionsState(), "/repo");
    await flush();
    expect(log).toContain("open:repository");
  });

  it("rejects an invalidation whose sequence did not advance", async () => {
    const log: string[] = [];
    const { coordinator, runtime } = coordinatorWith(log);
    const state = sessionsState();
    const event = { projectId: "/repo", sessionEpoch: EPOCH, sequence: 2, kind: "worktree" as const };

    coordinator.handleInvalidation(runtime, state, event);
    await flush();
    const afterFirst = log.filter((entry) => entry === "refresh:status").length;

    coordinator.handleInvalidation(runtime, state, { ...event, sequence: 1 });
    await flush();

    expect(log.filter((entry) => entry === "refresh:status")).toHaveLength(afterFirst);
  });
});
