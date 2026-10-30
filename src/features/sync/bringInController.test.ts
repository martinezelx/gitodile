import { expect, it, vi } from "vitest";
import { createBringInController } from "./bringInController";
import type { BringInPort } from "./port";

it("checks only remote sources, with per-source, epoch and one-minute freshness", async () => {
  const checkSource = vi.fn(async () => undefined);
  const controller = createBringInController({ checkSource } as unknown as BringInPort);
  const query = { projectId: "/repo", sessionEpoch: "epoch" };
  const topic = { kind: "remoteBranch" as const, remote: "fork", branch: "topic" };
  const clock = vi.spyOn(Date, "now").mockReturnValue(100_000);
  try {
    await controller.checkIfNeeded(query, { kind: "localBranch", name: "topic" });
    expect(checkSource).not.toHaveBeenCalled();
    await Promise.all([controller.checkIfNeeded(query, topic), controller.checkIfNeeded(query, topic)]);
    expect(checkSource).toHaveBeenCalledTimes(1);
    await controller.checkIfNeeded(query, topic);
    await controller.checkIfNeeded(query, { branch: "topic", remote: "fork", kind: "remoteBranch" });
    expect(checkSource).toHaveBeenCalledTimes(1);
    await controller.checkIfNeeded(query, { ...topic, remote: "origin" });
    await controller.checkIfNeeded({ ...query, sessionEpoch: "next" }, topic);
    expect(checkSource).toHaveBeenCalledTimes(3);
    clock.mockReturnValue(160_001);
    await controller.checkIfNeeded(query, topic);
    expect(checkSource).toHaveBeenCalledTimes(4);
    controller.close(query);
    await controller.checkIfNeeded(query, topic);
    expect(checkSource).toHaveBeenCalledTimes(5);
  } finally { clock.mockRestore(); }
});

it("a check finishing after the project closes cannot restore freshness or replace a newer request", async () => {
  let finishOld!: () => void;
  let finishNew!: () => void;
  const checkSource = vi.fn()
    .mockImplementationOnce(() => new Promise<void>((resolve) => { finishOld = resolve; }))
    .mockImplementationOnce(() => new Promise<void>((resolve) => { finishNew = resolve; }))
    .mockResolvedValue(undefined);
  const controller = createBringInController({ checkSource } as unknown as BringInPort);
  const query = { projectId: "/repo", sessionEpoch: "epoch" };
  const source = { kind: "remoteBranch" as const, remote: "fork", branch: "topic" };
  const old = controller.checkIfNeeded(query, source);
  controller.close(query);
  const next = controller.checkIfNeeded(query, source);
  finishOld();
  await old;
  const deduplicated = controller.checkIfNeeded(query, source);
  expect(checkSource).toHaveBeenCalledTimes(2);
  finishNew();
  await Promise.all([next, deduplicated]);
  await controller.checkIfNeeded(query, source);
  expect(checkSource).toHaveBeenCalledTimes(2);
});

it("never treats a failed source check as fresh", async () => {
  const checkSource = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
  const controller = createBringInController({ checkSource } as unknown as BringInPort);
  const query = { projectId: "/repo", sessionEpoch: "epoch" };
  const source = { kind: "remoteBranch" as const, remote: "fork", branch: "topic" };
  await expect(controller.checkIfNeeded(query, source)).rejects.toThrow("offline");
  await controller.checkIfNeeded(query, source);
  expect(checkSource).toHaveBeenCalledTimes(2);
});
