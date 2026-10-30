import { describe, expect, it } from "vitest";

import type { WorkingTreeStatus } from "../status";
import { EMPTY_TEAM_SYNC_STATE, type IncomingForecast, type TeamSyncStatus, type TeamSyncViewState } from "../sync";
import { deriveJourney } from "./journey";
import { deriveNextStep } from "./nextStep";

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

function forecast(overrides: Partial<IncomingForecast> = {}): IncomingForecast {
  return {
    outcome: "clear",
    integration: "fastForward",
    remoteCommit: "2".repeat(40),
    incomingCount: 3,
    localCount: 0,
    incomingFileCount: 12,
    authors: ["Ana", "Marcos"],
    authorCount: 2,
    carriedUnsavedCount: 0,
    combinedUnsaved: [],
    combinedUnsavedCount: 0,
    overlaps: [],
    overlapCount: 0,
    blocker: null,
    ...overrides,
  };
}

function next(
  input: Partial<Parameters<typeof deriveJourney>[0]>,
  canPublish = true,
): ReturnType<typeof deriveNextStep> {
  const journey = deriveJourney({
    workingTree: tree({}),
    workingTreeError: null,
    isCheckingChanges: false,
    pendingVersionsCount: 0,
    teamSync: sync(),
    ...input,
  });
  return deriveNextStep(journey, { canPublish });
}

describe("deriveNextStep", () => {
  it("asks to save unsaved work, in the unsaved colour, before anything remote", () => {
    const step = next({ workingTree: tree({ changed: 3, total: 3 }), pendingVersionsCount: 2, teamSync: sync({ state: "ahead", ahead: 2 }) });
    expect(step).toMatchObject({ kind: "save", tone: "unsaved", primary: "save", secondary: ["reviewChanges"] });
  });

  it("puts overlapping changes first, as a blocked step with no way round it", () => {
    const step = next({ workingTree: tree({ changed: 1, conflicted: 2, total: 3 }) });
    expect(step).toMatchObject({ kind: "conflicts", tone: "blocked", primary: "resolve", secondary: [] });
  });

  it("offers to publish saved versions in the accent, and only when publishing is possible", () => {
    const ready = next({ pendingVersionsCount: 2, teamSync: sync({ state: "ahead", ahead: 2 }) });
    expect(ready).toMatchObject({ kind: "publish", tone: "ready", primary: "publish" });

    const blocked = next({ pendingVersionsCount: 2, teamSync: sync({ state: "ahead", ahead: 2 }) }, false);
    expect(blocked).toMatchObject({ kind: "unpublished", tone: "ready", primary: null });
  });

  it("brings newer remote versions in, in the incoming colour", () => {
    expect(next({ teamSync: sync({ state: "behind", behind: 3 }) })).toMatchObject({
      kind: "behind",
      tone: "incoming",
      primary: "getChanges",
    });
    expect(next({ teamSync: sync({ state: "diverged", ahead: 1, behind: 1 }) })).toMatchObject({
      kind: "diverged",
      tone: "incoming",
    });
  });

  it("goes quiet when everything is saved and published, leaving the check to the facts column", () => {
    const step = next({});
    expect(step).toMatchObject({ kind: "upToDate", tone: "calm", primary: null, secondary: [] });
  });

  it("reports what it cannot act on yet without inventing an action", () => {
    expect(next({ workingTree: null, isCheckingChanges: true })).toMatchObject({ kind: "loading", isPending: true, primary: null });
    expect(next({ workingTree: null, workingTreeError: "denied" })).toMatchObject({ kind: "localError", tone: "blocked", primary: "checkLocal" });
    expect(next({ teamSync: sync({ state: "noRemote", upstreamRemote: null }) })).toMatchObject({
      kind: "noRemote",
      primary: null,
      secondary: ["openSettings"],
    });
    // The remote side not read yet holds the card's shape, even with changes.
    expect(next({ teamSync: EMPTY_TEAM_SYNC_STATE })).toMatchObject({ kind: "loading", primary: null });
    expect(next({ workingTree: tree({ changed: 1, total: 1 }), teamSync: EMPTY_TEAM_SYNC_STATE })).toMatchObject({ kind: "loading" });
    expect(next({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, generation: 1 } })).toMatchObject({ kind: "notChecked", secondary: ["checkRemote"] });
  });

  it("keeps the card on saving while saying what comes after, in one pill", () => {
    const behind = next({ workingTree: tree({ changed: 2, total: 2 }), teamSync: sync({ state: "behind", behind: 3 }) });
    expect(behind).toMatchObject({ kind: "save", tone: "unsaved", then: { kind: "get", count: 3 } });

    const ahead = next({ workingTree: tree({ changed: 2, total: 2 }), pendingVersionsCount: 2, teamSync: sync({ state: "ahead", ahead: 2 }) });
    // The version about to be saved is not counted: it is published "along
    // with" the two already waiting, however many times the work is saved.
    expect(ahead.then).toEqual({ kind: "publishWith", count: 2 });

    // What waits on the remote comes first: it has to arrive before anything
    // can be published.
    const both = next({
      workingTree: tree({ changed: 2, total: 2 }),
      pendingVersionsCount: 2,
      teamSync: sync({ state: "diverged", ahead: 2, behind: 3 }),
    });
    expect(both.then).toEqual({ kind: "get", count: 3 });
    // Nothing waiting: what is saved now is published on its own.
    expect(next({ workingTree: tree({ changed: 2, total: 2 }) }).then).toEqual({ kind: "publishWith", count: 0 });
    // With nowhere to publish to, nothing is said to come after.
    expect(
      next({ workingTree: tree({ changed: 2, total: 2 }), teamSync: sync({ state: "noRemote", upstreamRemote: null }) }).then,
    ).toBeNull();
  });

  it("asks to receive first when both sides moved, then to publish", () => {
    expect(next({ pendingVersionsCount: 2, teamSync: sync({ state: "diverged", ahead: 2, behind: 3 }) })).toMatchObject({
      kind: "diverged",
      tone: "incoming",
      primary: "getChanges",
      then: { kind: "publish", count: 2 },
    });
  });

  it("names the first save, keeps a failed check calm, and offers a way back from an older version", () => {
    expect(next({ workingTree: tree({ new: 12, total: 12 }), teamSync: sync({ state: "unborn" }) })).toMatchObject({
      kind: "firstSave",
      primary: "save",
    });
    expect(next({ teamSync: { ...EMPTY_TEAM_SYNC_STATE, error: "offline" } })).toMatchObject({
      kind: "unavailable",
      tone: "calm",
      secondary: ["checkRemote"],
    });
    expect(next({ teamSync: sync({ state: "detached" }) })).toMatchObject({ kind: "detached", secondary: ["openBranches"] });
  });
});

describe("deriveNextStep with a forecast", () => {
  const behind = (overrides: Partial<IncomingForecast> = {}) =>
    sync({ state: "behind", behind: 3, forecast: forecast(overrides) });
  const diverged = (overrides: Partial<IncomingForecast> = {}) =>
    sync({ state: "diverged", ahead: 1, behind: 3, forecast: forecast({ integration: "merge", localCount: 1, ...overrides }) });

  it("gets straight away when nothing overlaps, and says so", () => {
    expect(next({ teamSync: behind() })).toMatchObject({
      kind: "behind", primary: "getChanges", secondary: [], note: { kind: "clear" }, then: null,
    });
  });

  it("combines a diverged branch, with publishing beside it when publishing is possible", () => {
    expect(next({ pendingVersionsCount: 1, teamSync: diverged() })).toMatchObject({
      kind: "diverged", primary: "getChanges", secondary: ["getAndPublish"], note: { kind: "canCombine" }, then: null,
    });
    expect(next({ pendingVersionsCount: 1, teamSync: diverged() }, false).secondary).toEqual([]);
  });

  it("offers a saved overlap review while unsaved overlaps still need saving", () => {
    const overlaps = [{ path: "a.txt", side: "saved" as const }];
    expect(next({ teamSync: diverged({ outcome: "overlap", overlaps, overlapCount: 1 }) })).toMatchObject({
      kind: "overlap", tone: "blocked", primary: "explainIncoming", secondary: [], note: { kind: "overlap" },
    });
    expect(
      next({ workingTree: tree({ changed: 1, total: 1 }), teamSync: behind({ outcome: "overlap", overlaps, overlapCount: 1 }) }),
    ).toMatchObject({ kind: "overlap", primary: null, secondary: ["explainIncoming", "save"] });
  });

  it("says what is in the way instead of offering a get that would refuse", () => {
    const blocker = { kind: "untrackedCollision" as const, path: "logo.svg" };
    expect(next({ teamSync: behind({ outcome: "blocked", blocker }) })).toMatchObject({
      kind: "incomingBlocked", primary: null, secondary: ["explainIncoming"],
    });
    expect(next({ workingTree: tree({ changed: 1, total: 1 }), teamSync: behind({ outcome: "blocked", blocker }) })).toMatchObject({
      kind: "save", primary: "save", secondary: ["reviewChanges"], note: { kind: "blocked", blocker },
    });
  });

  it("offers to get beside saving when the update doesn't touch unsaved work", () => {
    expect(next({ workingTree: tree({ changed: 2, total: 2 }), teamSync: behind() })).toMatchObject({
      kind: "save", primary: "save", secondary: ["getChanges"], then: null, note: { kind: "incomingClear", count: 3 },
    });
    expect(
      next({
        workingTree: tree({ changed: 1, total: 1 }),
        teamSync: behind({ combinedUnsaved: ["README.md"], combinedUnsavedCount: 1 }),
      }).note,
    ).toEqual({ kind: "incomingCombined", count: 3, files: ["README.md"], fileCount: 1 });
  });
});
