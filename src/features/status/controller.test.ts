import { describe, expect, it, vi } from "vitest";

import { createProjectRuntime } from "../../runtime/project/runtime";
import { initialProjectSessionsState } from "../../runtime/project/sessions";
import type { RepositoryInfo } from "../repository";
import { createStatusController } from "./controller";
import type { WorkingTreeStatus } from "./domain";

const info = (epoch: string): RepositoryInfo => ({
  name: "repo", path: "/repo", selectedPath: "/repo", gitDir: "/repo/.git", commonGitDir: "/repo/.git",
  branch: "main", headState: "branch", kind: "repository", sessionEpoch: epoch,
});
const status = (total: number): WorkingTreeStatus => ({
  isClean: total === 0,
  counts: { changed: total, new: 0, deleted: 0, renamed: 0, conflicted: 0, total },
  lineTotals: null,
  entries: [], truncated: false, hasPreparedChanges: false, hasUnpreparedChanges: total > 0,
  upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 },
});

describe("status controller", () => {
  it("honours an invalidation queued by an observer while a request is settling", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: info("epoch-1") });
    let reads = 0;
    const controller = createStatusController({
      readWorkingTree: async () => status(++reads),
      readPendingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
      readIncomingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
    });
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    let scheduled = false;
    let trailing = Promise.resolve();
    const unsubscribe = runtime.subscribe(() => {
      if (scheduled || !runtime.getSnapshot().byId["/repo"].workingTree) return;
      scheduled = true;
      // A dependent observer delivers another invalidation as the original
      // promise settles, after the status itself has already been published.
      queueMicrotask(() => queueMicrotask(() => {
        trailing = controller.invalidate(runtime, query, () => "error");
      }));
    });
    await controller.refresh(runtime, query, () => "error");
    await trailing;
    expect(reads).toBe(2);
    expect(runtime.getSnapshot().byId["/repo"].workingTree?.counts.total).toBe(2);
    unsubscribe();
    runtime.dispose();
  });
  it("preserves unchanged working-tree and pending-version identities", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: info("epoch-1") });
    const controller = createStatusController({
      readWorkingTree: async () => status(1),
      readPendingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
      readIncomingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
    });
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    await controller.refresh(runtime, query, () => "error");
    const first = runtime.getSnapshot().byId["/repo"];
    await controller.refresh(runtime, query, () => "error");
    const second = runtime.getSnapshot().byId["/repo"];
    expect(second.workingTree).toBe(first.workingTree);
    expect(second.pendingVersions).toBe(first.pendingVersions);
  });

  it("coalesces concurrent refreshes and preserves equal session snapshots", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: info("epoch-1") });
    let resolveStatus!: (value: WorkingTreeStatus) => void;
    const readWorkingTree = () => new Promise<WorkingTreeStatus>((resolve) => { resolveStatus = resolve; });
    const controller = createStatusController({
      readWorkingTree,
      readPendingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
      readIncomingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
    }, () => 123);
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    const first = controller.refresh(runtime, query, () => "error");
    const second = controller.refresh(runtime, query, () => "error");
    expect(first).toBe(second);
    resolveStatus(status(1));
    await first;
    expect(runtime.getSnapshot().byId["/repo"].workingTreeCheckedAt).toBe(123);
  });

  it("rejects a response from a closed epoch after the same path reopens", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: info("old") });
    let resolveOld!: (value: WorkingTreeStatus) => void;
    const controller = createStatusController({
      readWorkingTree: ({ sessionEpoch }) => sessionEpoch === "old"
        ? new Promise((resolve) => { resolveOld = resolve; })
        : Promise.resolve(status(2)),
      readPendingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
      readIncomingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
    });
    const oldQuery = { projectId: "/repo", sessionEpoch: "old" };
    const oldRequest = controller.refresh(runtime, oldQuery, () => "error");
    controller.invalidate(runtime, oldQuery, () => "error");
    controller.close(oldQuery);
    runtime.dispatch({ type: "close", id: "/repo" });
    runtime.dispatch({ type: "open", project: info("new") });
    await controller.refresh(runtime, { projectId: "/repo", sessionEpoch: "new" }, () => "error");
    resolveOld(status(9));
    await oldRequest;
    expect(runtime.getSnapshot().byId["/repo"].epoch).toBe("new");
    expect(runtime.getSnapshot().byId["/repo"].workingTree?.counts.total).toBe(2);
  });

  it("lets a mutation result supersede an older read before the follow-up refresh", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: info("epoch-1") });
    let resolveOld!: (value: WorkingTreeStatus) => void;
    let workingRead = 0;
    const controller = createStatusController({
      readWorkingTree: () => ++workingRead === 1
        ? new Promise((resolve) => { resolveOld = resolve; })
        : Promise.resolve(status(2)),
      readPendingVersions: async () => ({ totalCount: workingRead, versions: [], isTruncated: false }),
      readIncomingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
    });
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    const oldRequest = controller.refresh(runtime, query, () => "error");
    controller.invalidate(runtime, query, () => "error");
    controller.supersede(query);
    await controller.refresh(runtime, query, () => "error");
    resolveOld(status(9));
    await oldRequest;
    expect(runtime.getSnapshot().byId["/repo"].workingTree?.counts.total).toBe(2);
    expect(workingRead).toBe(2);
  });

  it("coalesces invalidations during a read into a trailing read and never publishes its stale result", async () => {
    const runtime = createProjectRuntime(initialProjectSessionsState);
    runtime.dispatch({ type: "open", project: info("epoch-1") });
    const responses: Array<(value: WorkingTreeStatus) => void> = [];
    const controller = createStatusController({
      readWorkingTree: () => new Promise((resolve) => { responses.push(resolve); }),
      readPendingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
      readIncomingVersions: async () => ({ totalCount: 0, versions: [], isTruncated: false }),
    });
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    const observed: number[] = [];
    const unsubscribe = runtime.subscribe(() => {
      const total = runtime.getSnapshot().byId["/repo"].workingTree?.counts.total;
      if (total !== undefined) observed.push(total);
    });
    const request = controller.refresh(runtime, query, () => "error");
    expect(controller.invalidate(runtime, query, () => "error")).toBe(request);
    controller.invalidate(runtime, query, () => "error");
    responses[0](status(1));
    await vi.waitFor(() => expect(responses).toHaveLength(2));
    expect(observed).toEqual([]);
    controller.invalidate(runtime, query, () => "error");
    responses[1](status(2));
    await vi.waitFor(() => expect(responses).toHaveLength(3));
    responses[2](status(3));
    await request;
    expect(observed.every((total) => total === 3)).toBe(true);
    expect(runtime.getSnapshot().byId["/repo"].workingTree?.counts.total).toBe(3);
    unsubscribe();
    runtime.dispose();
  });
});
