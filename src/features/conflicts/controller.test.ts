import { describe, expect, it, vi } from "vitest";

import type { FileDiff } from "../changes";
import type { ProjectRuntime } from "../../runtime/project/runtime";
import { createConflictsController } from "./controller";
import type { ConflictSession } from "./domain";
import type { ConflictsPort } from "./port";

const query = { projectId: "/repo", sessionEpoch: "epoch-1" };

function session(stateToken: string): ConflictSession {
  return {
    sessionId: "session",
    stateToken,
    origin: "external",
    operation: {
      kind: "merge",
      supported: true,
      unsupportedReason: null,
      step: null,
      current: { name: "main", commit: "a".repeat(40) },
      incoming: { name: "feature", commit: "b".repeat(40) },
      operationHeads: ["b".repeat(40)],
      continueCommand: "git merge --continue",
      abortCommand: "git merge --abort",
    },
    files: [],
    unresolvedCount: 0,
    listingComplete: true,
    snapshot: null,
    allowedActions: ["abort-merge"],
  };
}

/** Runs a warm at once: the idle deferral is the runtime's, not this owner's. */
const runtime = {
  scheduleCacheWarm: ({ run }: { run: () => void | Promise<void> }) => {
    void run();
    return () => undefined;
  },
} as unknown as ProjectRuntime;

function port(read: ConflictsPort["readSession"]): ConflictsPort {
  return { readSession: read, readSideDiff: vi.fn() };
}

describe("conflicts controller", () => {
  it("reads a session only while files overlap or one is on record", async () => {
    const read = vi.fn<ConflictsPort["readSession"]>()
      .mockResolvedValueOnce(session("one"))
      .mockResolvedValueOnce(null);
    const controller = createConflictsController(port(read));

    controller.scheduleWarm(runtime, query, 0);
    expect(read).not.toHaveBeenCalled();
    expect(controller.getSnapshot(query).session).toBeNull();

    controller.scheduleWarm(runtime, query, 2);
    await vi.waitFor(() => expect(controller.getSnapshot(query).session?.stateToken).toBe("one"));

    // The status no longer lists an overlap, but a session is on record: one
    // more read is how the screen learns the merge ended.
    controller.scheduleWarm(runtime, query, 0);
    await vi.waitFor(() => expect(controller.getSnapshot(query).session).toBeNull());
    controller.scheduleWarm(runtime, query, 0);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps the same session for the same token and drops answers for a closed project", async () => {
    let resolveLate!: (value: ConflictSession) => void;
    const read = vi.fn<ConflictsPort["readSession"]>()
      .mockResolvedValueOnce(session("one"))
      .mockResolvedValueOnce(session("one"))
      .mockReturnValueOnce(new Promise((resolve) => { resolveLate = resolve; }));
    const controller = createConflictsController(port(read));

    await controller.refresh(query);
    const first = controller.getSnapshot(query).session;
    await controller.refresh(query);
    expect(controller.getSnapshot(query).session).toBe(first);

    const late = controller.refresh(query);
    controller.close(query);
    resolveLate(session("two"));
    await late;
    expect(controller.getSnapshot(query).session).toBeUndefined();
  });

  it("asks for one side's diff once per pair of objects", async () => {
    const diff: FileDiff = { kind: "unchanged", path: "a.txt", originalPath: null, change: "changed" };
    const readSideDiff = vi.fn<ConflictsPort["readSideDiff"]>().mockResolvedValue(diff);
    const controller = createConflictsController({ readSession: vi.fn(), readSideDiff });
    const sideQuery = { ...query, filePath: "a.txt", side: "current" as const, baseObjectId: "1".repeat(40), sideObjectId: "2".repeat(40) };

    await Promise.all([controller.readSideDiff(sideQuery), controller.readSideDiff(sideQuery)]);
    expect(controller.peekSideDiff(sideQuery)).toBe(diff);
    await controller.readSideDiff({ ...sideQuery, sideObjectId: "3".repeat(40) });

    expect(readSideDiff).toHaveBeenCalledTimes(2);
  });
});
