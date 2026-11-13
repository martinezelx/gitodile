// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { setInstallDraftBlocker } from "../../runtime/drafts";
import type { UpdateAction, UpdateState } from "./domain";
import { AUTOMATIC_CHECK_CADENCE_MS, AUTOMATIC_CHECK_TICK_MS, MANUAL_CHECK_MINIMUM_MS, createAppUpdatesController } from "./controller";
import type { AppUpdatesPort } from "./port";

function action(state: UpdateState, operationId: string | null = null): UpdateAction {
  return { state, operationId, coalesced: false };
}

function createPort(overrides: Partial<AppUpdatesPort> = {}): AppUpdatesPort {
  return {
    readState: vi.fn(async () => ({ kind: "idle" } as UpdateState)),
    readStartupConfirmation: vi.fn(async () => ({ kind: "none" } as const)),
    check: vi.fn(async () => action({ kind: "current", checkedAt: "2026-09-10T12:00:00Z" })),
    download: vi.fn(),
    cancel: vi.fn(),
    install: vi.fn(),
    openManualDownload: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("application update controller", () => {
  it("reads native memory without checking the network and coalesces entry points", async () => {
    let resolveCheck!: (result: UpdateAction) => void;
    const check = vi.fn(() => new Promise<UpdateAction>((resolve) => { resolveCheck = resolve; }));
    const port = createPort({ check });
    const controller = createAppUpdatesController(port, { manualCheckMinimumMs: 0 });

    await controller.initialize();
    expect(check).not.toHaveBeenCalled();
    const fromMenu = controller.check();
    const fromPalette = controller.check();
    expect(fromPalette).toBe(fromMenu);
    expect(check).toHaveBeenCalledTimes(1);
    resolveCheck(action({ kind: "current", checkedAt: "2026-09-10T12:00:00Z" }));
    await expect(fromMenu).resolves.toMatchObject({ kind: "current" });
    controller.dispose();
  });

  it("does not schedule background network work until consent, then checks at most once a day", async () => {
    vi.useFakeTimers();
    const port = createPort();
    const controller = createAppUpdatesController(port, { startupSettleMs: 1_000 });
    await controller.initialize();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(port.check).not.toHaveBeenCalled();

    controller.setAutomaticEnabled(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(port.check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(port.check).toHaveBeenCalledTimes(1);
    expect(port.check).toHaveBeenLastCalledWith("background");
    await vi.advanceTimersByTimeAsync(AUTOMATIC_CHECK_CADENCE_MS - 1);
    expect(port.check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(port.check).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it("counts the day on the wall clock, so time asleep counts and a manual check resets it", async () => {
    vi.useFakeTimers();
    const port = createPort();
    const controller = createAppUpdatesController(port, {
      automaticEnabled: true, startupSettleMs: 1_000, manualCheckMinimumMs: 0,
    });
    await controller.initialize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(port.check).toHaveBeenCalledTimes(1);

    // The machine sleeps for three days: the clock moves, no timer fires.
    vi.setSystemTime(Date.now() + 3 * AUTOMATIC_CHECK_CADENCE_MS);
    await vi.advanceTimersByTimeAsync(AUTOMATIC_CHECK_TICK_MS);
    expect(port.check).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + AUTOMATIC_CHECK_CADENCE_MS - AUTOMATIC_CHECK_TICK_MS);
    await controller.check();
    expect(port.check).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(AUTOMATIC_CHECK_TICK_MS);
    expect(port.check).toHaveBeenCalledTimes(3);
    controller.dispose();
  });

  it("retries a failed automatic check on the next hourly tick, not a day later", async () => {
    vi.useFakeTimers();
    const check = vi.fn(async () => action({ kind: "failed", error: { code: "offline", stage: "check", retryable: true } }));
    const port = createPort({ check });
    const controller = createAppUpdatesController(port, { automaticEnabled: true, startupSettleMs: 1_000 });
    await controller.initialize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(AUTOMATIC_CHECK_TICK_MS);
    expect(check).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it.each(["ready", "blocked"] as const)("never checks automatically over a %s download", async (kind) => {
    vi.useFakeTimers();
    const candidate = {
      candidateId: "c1", version: "0.3.0", target: "windows-x86_64" as const,
      publishedAt: null, notes: "", highlights: [], expectedBytes: null,
    };
    const state = kind === "ready"
      ? { kind, candidate }
      : { kind, candidate, error: { code: "install_blocked", stage: "install", retryable: true } };
    const port = createPort({ readState: vi.fn(async () => state as never) });
    const controller = createAppUpdatesController(port, { automaticEnabled: true, startupSettleMs: 1_000 });
    await controller.initialize();
    await vi.advanceTimersByTimeAsync(3 * AUTOMATIC_CHECK_CADENCE_MS);
    expect(port.check).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("reports what a background check settled on, and nothing about manual checks", async () => {
    vi.useFakeTimers();
    const candidate = {
      candidateId: "c1", version: "0.3.0", target: "windows-x86_64" as const,
      publishedAt: null, notes: "", highlights: [], expectedBytes: null,
    };
    const port = createPort({ check: vi.fn(async () => action({ kind: "available", candidate })) });
    const onBackgroundCheckSettled = vi.fn();
    const controller = createAppUpdatesController(port, {
      automaticEnabled: true, startupSettleMs: 1_000, onBackgroundCheckSettled, manualCheckMinimumMs: 0,
    });
    await controller.initialize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(port.check).toHaveBeenLastCalledWith("background");
    expect(onBackgroundCheckSettled).toHaveBeenCalledOnce();
    expect(onBackgroundCheckSettled).toHaveBeenCalledWith(expect.objectContaining({ kind: "available" }));

    await controller.check();
    expect(port.check).toHaveBeenLastCalledWith("manual");
    expect(onBackgroundCheckSettled).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it("keeps a manual check visible for its minimum, even when native answers at once", async () => {
    vi.useFakeTimers();
    const unavailable: UpdateState = { kind: "unavailable", error: { code: "not_configured", stage: "check", retryable: false } };
    const port = createPort({ check: vi.fn(async () => action(unavailable)) });
    const controller = createAppUpdatesController(port);
    await controller.initialize();
    let settled = false;
    const check = controller.check().then((state) => { settled = true; return state; });
    // "Checking" shows at once, with no operation to cancel yet.
    expect(controller.getSnapshot().state).toEqual({ kind: "checking", operationId: "", source: "manual" });
    await vi.advanceTimersByTimeAsync(MANUAL_CHECK_MINIMUM_MS - 1);
    expect(controller.getSnapshot().state.kind).toBe("checking");
    expect(settled).toBe(false);
    await controller.cancel();
    expect(port.cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await check).toEqual(unavailable);
    expect(controller.getSnapshot().state).toEqual(unavailable);
    controller.dispose();
  });

  it("never checks again from a development build", async () => {
    const unavailable: UpdateState = { kind: "unavailable", error: { code: "not_configured", stage: "check", retryable: false } };
    const port = createPort({ readState: vi.fn(async () => unavailable) });
    const controller = createAppUpdatesController(port, { automaticEnabled: true, startupSettleMs: 0 });
    await controller.initialize();
    expect(await controller.check()).toEqual(unavailable);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(port.check).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("never holds a background check or a check under reduced motion", async () => {
    vi.useFakeTimers();
    const port = createPort();
    const background = createAppUpdatesController(port, { automaticEnabled: true, startupSettleMs: 1_000 });
    await background.initialize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(port.check).toHaveBeenLastCalledWith("background");
    expect(background.getSnapshot().state.kind).toBe("current");
    background.dispose();

    document.documentElement.dataset.reducedMotion = "true";
    try {
      const manual = createAppUpdatesController(createPort());
      await manual.initialize();
      await manual.check();
      expect(manual.getSnapshot().state.kind).toBe("current");
      manual.dispose();
    } finally {
      delete document.documentElement.dataset.reducedMotion;
    }
  });

  it("uses the native operation id when cancelling a download", async () => {
    const candidate = {
      candidateId: "candidate-1", version: "0.3.0",
      target: "windows-x86_64" as const, publishedAt: null, notes: "Notes", highlights: [], expectedBytes: null,
    };
    const cancel = vi.fn(async () => ({ kind: "cancelled", stage: "downloading" } as UpdateState));
    const port = createPort({
      readState: vi.fn(async () => ({ kind: "available", candidate } as UpdateState)),
      download: vi.fn(async () => action({
        kind: "downloading", candidate, transfer: { length: "unknown", receivedBytes: 0 },
      }, "download-operation")),
      cancel,
    });
    const controller = createAppUpdatesController(port);
    await controller.initialize();
    const download = controller.download();
    await Promise.resolve();
    await controller.cancel();
    expect(cancel).toHaveBeenCalledWith("download-operation");
    expect(controller.getSnapshot().state).toEqual({ kind: "cancelled", stage: "downloading" });
    controller.dispose();
    void download;
  });

  it("carries an unfinished edit's own name into a blocked install, not into the native detail", async () => {
    const candidate = {
      candidateId: "candidate", version: "0.3.2", target: "windows-x86_64" as const,
      publishedAt: null, notes: "", highlights: [], expectedBytes: null,
    };
    const port = createPort({ readState: vi.fn(async () => ({ kind: "ready", candidate } as UpdateState)) });
    const controller = createAppUpdatesController(port);
    await controller.initialize();
    setInstallDraftBlocker("controller-blocker-test", "Ajustes", true);
    try {
      const state = await controller.install();
      expect(state).toMatchObject({ kind: "blocked", error: { code: "install_blocked", blocker: "Ajustes" } });
      expect(state.kind === "blocked" ? state.error.safeDetail : "unexpected").toBeUndefined();
      expect(port.install).not.toHaveBeenCalled();
    } finally {
      setInstallDraftBlocker("controller-blocker-test", "Ajustes", false);
      controller.dispose();
    }
  });
});
