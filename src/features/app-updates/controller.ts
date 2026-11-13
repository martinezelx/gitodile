import { useEffect, useSyncExternalStore } from "react";

import { registerInstallParticipant } from "../../runtime/install";
import { isReducedMotionRequested } from "../../shared/ui";
import { isDevelopmentBuild, type StartupUpdateConfirmation, type UpdateState } from "./domain";
import { installReadyUpdate } from "./install";
import type { AppUpdatesPort } from "./port";

const STARTUP_SETTLE_MS = 5_000;
export const AUTOMATIC_CHECK_CADENCE_MS = 24 * 60 * 60 * 1_000;
/** How often an open app asks whether a day has passed since the last check.
 * The question is about the wall clock, so a laptop that slept for three days
 * with the app open checks within this tick of waking; the tick itself makes
 * no request. */
export const AUTOMATIC_CHECK_TICK_MS = 60 * 60 * 1_000;
const ACTIVE_STATE_POLL_MS = 150;
/** How long a check the user asked for stays visibly "checking" at least. A
 * build that cannot check (a development build) answers in a few
 * milliseconds, and a result that replaces the press at once reads as a
 * failure rather than a check. Reduced motion skips the hold. */
export const MANUAL_CHECK_MINIMUM_MS = 800;
const disposalTokens = new WeakMap<AppUpdatesController, object>();

type Timer = ReturnType<typeof globalThis.setTimeout>;

export type AppUpdatesSnapshot = Readonly<{
  state: UpdateState;
  startupConfirmation: StartupUpdateConfirmation;
  automaticEnabled: boolean;
}>;

export type AppUpdatesController = Readonly<{
  subscribe(listener: () => void): () => void;
  getSnapshot(): AppUpdatesSnapshot;
  initialize(): Promise<void>;
  setAutomaticEnabled(enabled: boolean): void;
  check(source?: "manual" | "background"): Promise<UpdateState>;
  download(): Promise<UpdateState>;
  cancel(): Promise<UpdateState>;
  install(): Promise<UpdateState>;
  openManualDownload(): Promise<void>;
  dispose(): void;
}>;

export function createAppUpdatesController(
  port: AppUpdatesPort,
  options: Readonly<{
    automaticEnabled?: boolean;
    startupSettleMs?: number;
    /** Overrides `MANUAL_CHECK_MINIMUM_MS`; 0 publishes results at once. */
    manualCheckMinimumMs?: number;
    now?: () => number;
    /** Told the settled state of every background check — the one the user
     * did not ask for and is not watching. Manual checks report to whoever
     * started them; this is how the app learns that a startup check found
     * something, so it can say so somewhere the user will see it. */
    onBackgroundCheckSettled?: (state: UpdateState) => void;
  }> = {},
): AppUpdatesController {
  const listeners = new Set<() => void>();
  const now = options.now ?? Date.now;
  const settleMs = options.startupSettleMs ?? STARTUP_SETTLE_MS;
  const manualCheckMinimumMs = options.manualCheckMinimumMs ?? MANUAL_CHECK_MINIMUM_MS;
  let snapshot: AppUpdatesSnapshot = {
    state: { kind: "idle" },
    startupConfirmation: { kind: "none" },
    automaticEnabled: options.automaticEnabled ?? false,
  };
  let initialized: Promise<void> | null = null;
  let sharedCheck: Promise<UpdateState> | null = null;
  let sharedDownload: Promise<UpdateState> | null = null;
  let sharedInstall: Promise<UpdateState> | null = null;
  let downloadOperationId: string | null = null;
  let pollTimer: Timer | null = null;
  let automaticTimer: Timer | null = null;
  let lastCheckAt: number | null = null;
  let suspended = false;
  let disposed = false;
  let unregisterParticipant: (() => void) | null = null;

  const publish = (next: Partial<AppUpdatesSnapshot>): void => {
    if (disposed) return;
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };

  const clearPoll = (): void => {
    if (pollTimer !== null) globalThis.clearTimeout(pollTimer);
    pollTimer = null;
  };

  const isActive = (state: UpdateState): boolean =>
    ["checking", "downloading", "verifying"].includes(state.kind);

  /** Publishes a settled state no earlier than `holdUntil`, so a manual check
   * stays visible for its minimum. The work itself is never delayed: native
   * has already finished it, only the verdict waits to be shown. */
  const publishSettled = (state: UpdateState, holdUntil: number | null): Promise<UpdateState> => {
    const remaining = holdUntil === null ? 0 : holdUntil - now();
    if (remaining <= 0 || disposed) {
      publish({ state });
      return Promise.resolve(state);
    }
    return new Promise((resolve) => {
      globalThis.setTimeout(() => {
        publish({ state });
        resolve(state);
      }, remaining);
    });
  };

  /** Commands start native work and return its first snapshot immediately.
   * Polling only mirrors that native owner; it does not infer transitions or
   * manufacture a renderer lifecycle. */
  const waitForSettled = (initial: UpdateState, holdUntil: number | null = null): Promise<UpdateState> => {
    if (!isActive(initial) || disposed) return publishSettled(initial, holdUntil);
    publish({ state: initial });
    return new Promise((resolve) => {
      const poll = (): void => {
        if (disposed) {
          resolve(snapshot.state);
          return;
        }
        clearPoll();
        pollTimer = globalThis.setTimeout(() => {
          void port.readState().then((state) => {
            if (isActive(state) && !disposed) {
              publish({ state });
              poll();
            } else {
              void publishSettled(state, holdUntil).then(resolve);
            }
          }).catch(() => poll());
        }, ACTIVE_STATE_POLL_MS);
      };
      poll();
    });
  };

  const clearAutomaticTimer = (): void => {
    if (automaticTimer !== null) globalThis.clearTimeout(automaticTimer);
    automaticTimer = null;
  };

  /** Checks once the app has settled, then once a day while it stays open.
   * "A day" is measured from the last check of any kind on the wall clock,
   * not as a timer's running time: a 24-hour timer only fired in a session
   * that ran for 24 hours, which almost none does. */
  const scheduleAutomaticCheck = (delay: number): void => {
    clearAutomaticTimer();
    if (!snapshot.automaticEnabled || suspended || disposed) return;
    automaticTimer = globalThis.setTimeout(() => {
      automaticTimer = null;
      if (!snapshot.automaticEnabled || suspended || disposed) return;
      /* A check replaces native's offer, so one over a finished download
         would throw the download away and offer it again. A release that is
         only offered may be re-checked: nothing is lost, and a newer one can
         take its place. */
      const holdsDownload = snapshot.state.kind === "ready" || snapshot.state.kind === "blocked";
      /* A retryable failure (offline at launch, GitHub briefly down) tries
         again on the next tick rather than a day later: one bounded request an
         hour while it lasts. */
      const retriesFailure = snapshot.state.kind === "failed" && snapshot.state.error.retryable;
      const checkedRecently = lastCheckAt !== null && now() - lastCheckAt < AUTOMATIC_CHECK_CADENCE_MS;
      if (holdsDownload || (checkedRecently && !retriesFailure)) {
        scheduleAutomaticCheck(AUTOMATIC_CHECK_TICK_MS);
        return;
      }
      void check("background").then((state) => {
        if (!disposed) options.onBackgroundCheckSettled?.(state);
      }).finally(() => {
        scheduleAutomaticCheck(AUTOMATIC_CHECK_TICK_MS);
      });
    }, Math.max(0, delay));
  };

  const check = (source: "manual" | "background" = "manual"): Promise<UpdateState> => {
    if (sharedCheck) return sharedCheck;
    if (sharedDownload || sharedInstall || isDevelopmentBuild(snapshot.state)) return Promise.resolve(snapshot.state);
    /* A check the user pressed shows "checking" at once, before native
       answers, and keeps it for the minimum. The placeholder has no operation
       id, so there is nothing to cancel until native names one. */
    const holdUntil = source === "manual" && manualCheckMinimumMs > 0 && !isReducedMotionRequested()
      ? now() + manualCheckMinimumMs
      : null;
    lastCheckAt = now();
    if (holdUntil !== null && snapshot.state.kind !== "checking") {
      publish({ state: { kind: "checking", operationId: "", source } });
    }
    sharedCheck = port.check(source).then(({ state }) => waitForSettled(state, holdUntil)).catch(() => {
      const state: UpdateState = {
        kind: "failed",
        error: { code: "internal", stage: "check", retryable: true },
      };
      publish({ state });
      return state;
    }).finally(() => {
      sharedCheck = null;
    });
    return sharedCheck;
  };

  const registerAutomaticParticipant = (): void => {
    if (unregisterParticipant) return;
    // Ephemeral and renderer-local. The suffix prevents Strict Mode, tests or
    // hot replacement from colliding; it is never persisted or transmitted.
    const participantId = `app-update-automatic-checks-${crypto.randomUUID()}`;
    unregisterParticipant = registerInstallParticipant({
      id: participantId,
      label: "automatic application update checks",
      suspend: () => {
        suspended = true;
        clearAutomaticTimer();
        return () => {
          suspended = false;
          if (snapshot.automaticEnabled) scheduleAutomaticCheck(settleMs);
        };
      },
    });
  };

  const controller: AppUpdatesController = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    initialize() {
      if (initialized) return initialized;
      registerAutomaticParticipant();
      initialized = Promise.all([port.readState(), port.readStartupConfirmation()])
        .then(([state, startupConfirmation]) => {
          // The typed native boundary always supplies these values. Keeping
          // the initial safe snapshot when an embedded/test host violates that
          // contract prevents the global shell from becoming unusable.
          if (state && startupConfirmation) publish({ state, startupConfirmation });
        })
        .catch(() => publish({
          state: { kind: "failed", error: { code: "internal", stage: "startup", retryable: true } },
        }))
        .then(() => {
          if (snapshot.automaticEnabled) scheduleAutomaticCheck(settleMs);
        });
      return initialized;
    },
    setAutomaticEnabled(enabled) {
      if (snapshot.automaticEnabled === enabled) return;
      publish({ automaticEnabled: enabled });
      if (enabled) scheduleAutomaticCheck(settleMs);
      else clearAutomaticTimer();
    },
    check,
    download() {
      if (sharedDownload) return sharedDownload;
      const candidate = "candidate" in snapshot.state ? snapshot.state.candidate : null;
      if (!candidate) return Promise.resolve(snapshot.state);
      sharedDownload = port.download(candidate.candidateId).then((action) => {
        downloadOperationId = action.operationId;
        return waitForSettled(action.state);
      }).catch(() => {
        const state: UpdateState = {
          kind: "failed",
          error: { code: "internal", stage: "download", retryable: true },
        };
        publish({ state });
        return state;
      }).finally(() => {
        sharedDownload = null;
      });
      return sharedDownload;
    },
    cancel() {
      const operationId = snapshot.state.kind === "checking" && snapshot.state.operationId !== "" ? snapshot.state.operationId : null;
      if (operationId === null && snapshot.state.kind !== "downloading") return Promise.resolve(snapshot.state);
      // Download operation identity is intentionally native-owned. Read the
      // latest state: native returns its exact id in the action that began the
      // transfer, retained below by the closure rather than derived from UI.
      const activeId = operationId ?? downloadOperationId;
      if (activeId === null) return Promise.resolve(snapshot.state);
      return port.cancel(activeId).then((state) => {
        publish({ state });
        return state;
      });
    },
    install() {
      if (sharedInstall) return sharedInstall;
      if (snapshot.state.kind !== "ready" && snapshot.state.kind !== "blocked") {
        return Promise.resolve(snapshot.state);
      }
      const candidate = snapshot.state.candidate;
      sharedInstall = installReadyUpdate(port, candidate.candidateId).then((result) => {
        const state: UpdateState = result.kind === "submitted"
          ? result.state
          : {
              kind: "blocked",
              candidate,
              error: {
                code: "install_blocked",
                stage: "admission",
                retryable: true,
                ...(result.label !== null ? { blocker: result.label } : {}),
              },
            };
        publish({ state });
        return state;
      }).catch(() => {
        const state: UpdateState = {
          kind: "blocked",
          candidate,
          error: { code: "install_handoff_failed", stage: "install", retryable: true },
        };
        publish({ state });
        return state;
      }).finally(() => {
        sharedInstall = null;
      });
      return sharedInstall;
    },
    openManualDownload: () => port.openManualDownload(),
    dispose() {
      if (disposed) return;
      disposed = true;
      clearPoll();
      clearAutomaticTimer();
      unregisterParticipant?.();
      unregisterParticipant = null;
      listeners.clear();
    },
  };

  return controller;
}

export function useAppUpdatesController(
  controller: AppUpdatesController,
  automaticEnabled: boolean,
): AppUpdatesSnapshot {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    const token = {};
    disposalTokens.set(controller, token);
    void controller.initialize();
    return () => {
      queueMicrotask(() => {
        if (disposalTokens.get(controller) !== token) return;
        disposalTokens.delete(controller);
        controller.dispose();
      });
    };
  }, [controller]);
  useEffect(() => controller.setAutomaticEnabled(automaticEnabled), [automaticEnabled, controller]);
  return snapshot;
}
