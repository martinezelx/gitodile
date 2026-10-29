import type { WorkingTreeStatus } from "../status";
import type { IncomingForecast, TeamSyncViewState } from "../sync";

/** The three things the app is for, in the order they happen. Overview draws
 * them as one band — change, then save, then publish — so the model is on
 * screen without being explained. */
export type JourneyStepId = "changes" | "save" | "publish";

/**
 * Where the reader is on the way from an edited file to a published
 * version, derived from what the app already knows. Pure data: the band
 * chooses its words and its buttons from this, and this never reads the DOM.
 */
export type Journey = {
  /** The step whose action is the one thing to do now, or `null` when
   * nothing is waiting (everything saved and published, or nothing is known
   * yet). Exactly one accent on the band follows this. */
  activeStep: JourneyStepId | null;
  changes: {
    state: "loading" | "error" | "clean" | "dirty" | "conflicts";
    total: number;
    conflicted: number;
  };
  save: {
    state: "loading" | "done" | "active" | "blocked";
  };
  publish: {
    state:
      /** The branch's last known relation to its remote has not been read yet:
       * a local read, not a check. */
      | "reading"
      | "notChecked"
      | "checking"
      | "upToDate"
      | "ahead"
      | "behind"
      | "diverged"
      | "noRemote"
      | "noUpstream"
      /** The remote branch this branch tracks no longer exists there. */
      | "upstreamGone"
      | "detached"
      | "unborn"
      | "unavailable";
    /** Saved versions still only on this computer. From the publish
     * inventory rather than the sync check, so it is right even before a
     * remote has been checked this session. */
    pending: number;
    behind: number;
    /** `origin/main`, when the branch has a remote branch to compare against. */
    remoteBranch: string | null;
    /** The same branch in its two parts, `origin` and `main`, for the tile that
     * says them apart ("to origin · main") rather than as one ref. */
    remote: string | null;
    destinationBranch: string | null;
    /** The branch the project is on, so the tile can leave the destination
     * unnamed when it is the same name — the header already says it. */
    localBranch: string | null;
    /** When the remote was last actually asked. A cached status was read from
     * this computer's own tracking refs, so its time is not a remote check:
     * only this session's last successful check counts for it. */
    checkedAt: number | null;
    /** A check is running now — with or without an earlier result to keep
     * showing underneath it. */
    isChecking: boolean;
    isStale: boolean;
    isCached: boolean;
    error: string | null;
    /** The local inventory of unpublished versions could not be read: the
     * band's count may be short, and the sentence under it says so. */
    inventoryError: string | null;
    /** What getting the waiting versions would do, predicted locally;
     * `null` when nothing is waiting or it couldn't be predicted. */
    forecast: IncomingForecast | null;
  };
};

export function deriveJourney({
  workingTree,
  workingTreeError,
  isCheckingChanges,
  pendingVersionsCount,
  pendingVersionsError = null,
  teamSync,
}: {
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  pendingVersionsCount: number;
  pendingVersionsError?: string | null;
  teamSync: TeamSyncViewState;
}): Journey {
  const changes: Journey["changes"] = !workingTree
    ? isCheckingChanges
      ? { state: "loading", total: 0, conflicted: 0 }
      : workingTreeError
        ? { state: "error", total: 0, conflicted: 0 }
        : { state: "loading", total: 0, conflicted: 0 }
    : workingTree.counts.conflicted > 0 || workingTree.pausedOperation === true
      ? { state: "conflicts", total: workingTree.counts.total, conflicted: workingTree.counts.conflicted }
      : workingTree.counts.total > 0
        ? { state: "dirty", total: workingTree.counts.total, conflicted: 0 }
        : { state: "clean", total: 0, conflicted: 0 };

  const save: Journey["save"] = {
    state:
      changes.state === "loading" || changes.state === "error"
        ? "loading"
        : changes.state === "conflicts"
          ? "blocked"
          : changes.state === "dirty"
            ? "active"
            : "done",
  };

  const status = teamSync.status;
  const remoteBranch =
    status?.upstreamRemote && status.destinationBranch
      ? `${status.upstreamRemote}/${status.destinationBranch}`
      : null;
  let publishState: Journey["publish"]["state"];
  if (teamSync.isCheckingRemote && !status) publishState = "checking";
  else if (teamSync.error && !status) publishState = "unavailable";
  // Before the first local read lands there is no answer yet, not a remote
  // that was never asked: saying "not checked" would flash on every opening.
  else if (!status && (teamSync.isLoading || teamSync.generation === 0)) publishState = "reading";
  else if (!status) publishState = "notChecked";
  else publishState = status.state;
  // The inventory knows about versions the last remote check predates; the
  // check knows about a remote that has moved on. Either alone would leave
  // "up to date" on screen with work waiting underneath it.
  if (publishState === "upToDate" && pendingVersionsCount > 0) publishState = "ahead";

  const publish: Journey["publish"] = {
    state: publishState,
    pending: pendingVersionsCount,
    behind: status?.behind ?? 0,
    remoteBranch,
    remote: remoteBranch ? (status?.upstreamRemote ?? null) : null,
    destinationBranch: remoteBranch ? (status?.destinationBranch ?? null) : null,
    localBranch: status?.localBranch ?? null,
    checkedAt: status?.knowledge === "cached"
      ? teamSync.lastSuccessfulCheckAt
      : (status?.checkedAt ?? teamSync.lastSuccessfulCheckAt),
    isChecking: teamSync.isCheckingRemote,
    isStale: teamSync.isStale,
    isCached: status?.knowledge === "cached",
    error: teamSync.error,
    inventoryError: pendingVersionsError,
    forecast: status?.forecast ?? null,
  };

  let activeStep: JourneyStepId | null = null;
  if (changes.state === "conflicts") activeStep = "changes";
  else if (changes.state === "dirty") activeStep = "save";
  else if (changes.state === "clean") {
    if (publish.state === "ahead" || publish.state === "behind" || publish.state === "diverged") {
      activeStep = "publish";
    }
  }

  return { activeStep, changes, save, publish };
}
