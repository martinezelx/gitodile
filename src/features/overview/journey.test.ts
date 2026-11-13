import { describe, expect, it } from "vitest";

import type { WorkingTreeStatus } from "../status";
import { EMPTY_TEAM_SYNC_STATE, type TeamSyncStatus, type TeamSyncViewState } from "../sync";
import { deriveJourney } from "./journey";

function tree(counts: Partial<WorkingTreeStatus["counts"]>): WorkingTreeStatus {
  const full = { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 0, ...counts };
  return {
    isClean: full.total === 0,
    counts: full,
    lineTotals: null,
    entries: [],
    truncated: false,
    hasPreparedChanges: false,
    hasUnpreparedChanges: full.total > 0,
    upstream: { branch: "main", upstream: "origin/main", ahead: 0, behind: 0 },
  };
}

function sync(overrides: Partial<TeamSyncStatus> = {}, view: Partial<TeamSyncViewState> = {}): TeamSyncViewState {
  return {
    ...EMPTY_TEAM_SYNC_STATE,
    status: {
      state: "upToDate",
      localBranch: "main",
      localCommit: "1".repeat(40),
      upstreamRemote: "origin",
      destinationBranch: "main",
      trackingRef: "refs/remotes/origin/main",
      remoteCommit: "1".repeat(40),
      ahead: 0,
      behind: 0,
      knowledge: "fresh",
      checkedAt: 1_000,
      warnings: [],
      nextActions: [],
      stateToken: "token",
      forecast: null,
      ...overrides,
    },
    ...view,
  };
}

const base = { workingTreeError: null, isCheckingChanges: false, pendingVersionsCount: 0 };

describe("deriveJourney", () => {
  it("makes saving the next step while there is unsaved work", () => {
    const journey = deriveJourney({ ...base, workingTree: tree({ changed: 3, total: 3 }), teamSync: sync() });

    expect(journey.activeStep).toBe("save");
    expect(journey.changes).toEqual({ state: "dirty", total: 3, conflicted: 0 });
    expect(journey.save.state).toBe("active");
    expect(journey.publish.state).toBe("upToDate");
    expect(journey.publish.remoteBranch).toBe("origin/main");
  });

  it("never dates a cached status as a remote check", () => {
    const cached = deriveJourney({
      ...base,
      workingTree: tree({ total: 0 }),
      teamSync: sync({ knowledge: "cached", checkedAt: 5_000 }),
    });
    expect(cached.publish.checkedAt).toBeNull();

    const checkedThisSession = deriveJourney({
      ...base,
      workingTree: tree({ total: 0 }),
      teamSync: sync({ knowledge: "cached", checkedAt: 5_000 }, { lastSuccessfulCheckAt: 2_000 }),
    });
    expect(checkedThisSession.publish.checkedAt).toBe(2_000);
  });

  it("puts overlaps first and blocks saving behind them", () => {
    const journey = deriveJourney({ ...base, workingTree: tree({ conflicted: 2, changed: 1, total: 3 }), teamSync: sync() });

    expect(journey.activeStep).toBe("changes");
    expect(journey.changes).toEqual({ state: "conflicts", total: 3, conflicted: 2 });
    expect(journey.save.state).toBe("blocked");

    // Every file resolved, but the merge is still open: it is still the step.
    const paused = deriveJourney({ ...base, workingTree: { ...tree({ changed: 2, total: 2 }), pausedOperation: true }, teamSync: sync() });
    expect(paused.changes).toEqual({ state: "conflicts", total: 2, conflicted: 0 });
    expect(paused.save.state).toBe("blocked");
  });

  it("moves on to publishing once everything is saved and something waits", () => {
    const ahead = deriveJourney({ ...base, workingTree: tree({}), pendingVersionsCount: 2, teamSync: sync({ state: "ahead", ahead: 2 }) });
    expect(ahead.activeStep).toBe("publish");
    expect(ahead.save.state).toBe("done");
    expect(ahead.publish).toMatchObject({ state: "ahead", pending: 2 });

    const behind = deriveJourney({ ...base, workingTree: tree({}), teamSync: sync({ state: "behind", behind: 3 }) });
    expect(behind.activeStep).toBe("publish");
    expect(behind.publish).toMatchObject({ state: "behind", behind: 3 });
  });

  it("does not let a stale 'up to date' hide versions the inventory knows are waiting", () => {
    const journey = deriveJourney({ ...base, workingTree: tree({}), pendingVersionsCount: 1, teamSync: sync({ state: "upToDate" }) });

    expect(journey.publish.state).toBe("ahead");
    expect(journey.activeStep).toBe("publish");
  });

  it("has nothing active when everything is saved and published, or when there is no remote yet", () => {
    expect(deriveJourney({ ...base, workingTree: tree({}), teamSync: sync() }).activeStep).toBeNull();
    expect(
      deriveJourney({ ...base, workingTree: tree({}), teamSync: sync({ state: "noRemote", upstreamRemote: null, destinationBranch: null }) }),
    ).toMatchObject({ activeStep: null, publish: { state: "noRemote", remoteBranch: null } });
  });

  it("reports what it does not know yet instead of guessing", () => {
    const loading = deriveJourney({ ...base, workingTree: null, isCheckingChanges: true, teamSync: EMPTY_TEAM_SYNC_STATE });
    expect(loading.changes.state).toBe("loading");
    expect(loading.save.state).toBe("loading");
    // Nothing read yet is "reading", never a remote that was not asked.
    expect(loading.publish.state).toBe("reading");
    expect(loading.activeStep).toBeNull();
    const readingLocal = deriveJourney({ ...base, workingTree: tree({}), teamSync: { ...EMPTY_TEAM_SYNC_STATE, isLoading: true, generation: 1 } });
    expect(readingLocal.publish.state).toBe("reading");
    const answered = deriveJourney({ ...base, workingTree: tree({}), teamSync: { ...EMPTY_TEAM_SYNC_STATE, generation: 1 } });
    expect(answered.publish.state).toBe("notChecked");

    const failed = deriveJourney({ ...base, workingTree: null, workingTreeError: "boom", teamSync: sync({}, { status: null, error: "offline" }) });
    expect(failed.changes.state).toBe("error");
    expect(failed.publish).toMatchObject({ state: "unavailable", error: "offline" });

    const checking = deriveJourney({ ...base, workingTree: tree({}), teamSync: { ...EMPTY_TEAM_SYNC_STATE, isCheckingRemote: true } });
    expect(checking.publish.state).toBe("checking");

    // A re-check keeps the last answer on screen and only says it is busy.
    const rechecking = deriveJourney({ ...base, workingTree: tree({}), teamSync: sync({}, { isCheckingRemote: true }) });
    expect(rechecking.publish).toMatchObject({ state: "upToDate", isChecking: true });
  });
});
