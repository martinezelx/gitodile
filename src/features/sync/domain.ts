import type { ProjectRuntimeSnapshot } from "../../runtime/project/runtime";

export type RemoteInfo = {
  name: string;
  /** Already redacted by Rust. Raw configured URLs never cross IPC. */
  url: string;
};

export type RemoteDiscovery = {
  remotes: RemoteInfo[];
  branch: string | null;
  upstream: string | null;
};

export type SyncTarget = {
  remote: string;
  destinationBranch: string;
};

export type TeamSyncState =
  | "noRemote"
  | "noUpstream"
  | "unborn"
  | "detached"
  | "upToDate"
  | "ahead"
  | "behind"
  | "diverged"
  /** The branch tracks a remote branch that no longer exists: a check found it
   * missing on the remote, or the tracking ref is gone too (Git's `[gone]`). */
  | "upstreamGone";

export type SyncKnowledge = "cached" | "fresh";
export type SyncNextAction = "checkAgain" | "publishChanges" | "reviewAndGet";

export type SyncWarning = {
  code: string;
  message: string;
};

export type TeamSyncStatus = {
  state: TeamSyncState;
  localBranch: string | null;
  localCommit: string | null;
  upstreamRemote: string | null;
  destinationBranch: string | null;
  trackingRef: string | null;
  remoteCommit: string | null;
  ahead: number;
  behind: number;
  knowledge: SyncKnowledge;
  checkedAt: number | null;
  warnings: SyncWarning[];
  nextActions: SyncNextAction[];
  stateToken: string;
  /** What getting would do; present only while the branch is behind or
   * diverged and the prediction could be made. */
  forecast: IncomingForecast | null;
};

export type GetTeamChangesPhase =
  | "checkingLocalSafety"
  | "combiningVersions"
  | "creatingRecovery"
  | "updatingFilesAndHistory"
  | "verifying";

/** How the branch reaches the remote: it simply advances, or both sides have
 * saved versions and a merge version joins them. */
export type IntegrationKind = "fastForward" | "merge";

export type ForecastOutcome = "clear" | "overlap" | "blocked";

/** Where the local side of an overlap lives. */
export type OverlapSide = "saved" | "unsaved";

export type ForecastOverlap = {
  path: string;
  side: OverlapSide;
};

export type ForecastBlockerKind =
  | "untrackedCollision"
  | "preparedOverlap"
  | "carryFailed"
  | "gitTooOld"
  | "operationInProgress"
  | "unresolvedConflicts";

export type ForecastBlocker = {
  kind: ForecastBlockerKind;
  path: string | null;
};

/** Mirrors Rust `IncomingForecast`: what getting the waiting versions would
 * do, predicted on this computer without changing anything. */
export type IncomingForecast = {
  outcome: ForecastOutcome;
  integration: IntegrationKind;
  remoteCommit: string;
  incomingCount: number;
  localCount: number;
  incomingFileCount: number;
  authors: string[];
  authorCount: number;
  /** Unsaved tracked files the update leaves exactly as they are. */
  carriedUnsavedCount: number;
  /** Unsaved files that also change on the remote, on other branches. */
  combinedUnsaved: string[];
  combinedUnsavedCount: number;
  overlaps: ForecastOverlap[];
  overlapCount: number;
  blocker: ForecastBlocker | null;
};

export type IncomingFileCategory = "added" | "modified" | "deleted" | "renamed";

export type IncomingFile = {
  path: string;
  originalPath: string | null;
  category: IncomingFileCategory;
  binary: boolean;
};

export type IncomingFileImpact = {
  totalCount: number;
  counts: {
    added: number;
    modified: number;
    deleted: number;
    renamed: number;
    binary: number;
  };
  files: IncomingFile[];
  isTruncated: boolean;
};

export type IncomingVersionSummary = {
  commit: string;
  shortCommit: string;
  title: string;
  description: string | null;
  committedAt: string;
  author: string;
};

export type IncomingVersion = IncomingVersionSummary & {
  fileCount: number;
};

export type HistoryRecoveryPreview = {
  reference: string;
  explanation: string;
  retention: string;
  retentionLimit: number;
};

export type HistoryRecoveryRecord = {
  schemaVersion: number;
  recoveryId: string;
  reference: string;
  createdAtMs: number;
  operation: "get-team-changes" | "bring-in-changes";
  ownerId: string;
  branch: string;
  previousCommit: string;
  targetCommit: string;
  remote: string;
  destinationBranch: string;
  trackingRef: string;
  stateToken: string;
  retentionLimit: number;
  /** Present when the update combined unsaved edits: their previous content. */
  unsavedReference?: string;
  unsavedSnapshot?: string;
};

export type GetTeamChangesPlan = {
  operationKind: "history-mutation";
  requiresConfirmation: true;
  projectId: string;
  sessionEpoch: string;
  stateToken: string;
  branch: string;
  target: SyncTarget;
  trackingRef: string;
  localCommit: string;
  remoteCommit: string;
  integration: IntegrationKind;
  incomingCount: number;
  incomingVersions: IncomingVersion[];
  versionsTruncated: boolean;
  /** Saved versions only on this computer; a merge publishes them later. */
  localCount: number;
  localVersions: IncomingVersionSummary[];
  fileImpact: IncomingFileImpact;
  forecast: IncomingForecast;
  mergeMessage: string | null;
  recovery: HistoryRecoveryPreview;
};

export type GetTeamChangesResult = {
  outcome: "completed" | "uncertain";
  projectId: string;
  sessionEpoch: string;
  branch: string;
  target: SyncTarget;
  trackingRef: string;
  integration: IntegrationKind;
  previousCommit: string;
  resultingCommit: string | null;
  observedHead: string | null;
  receivedCount: number;
  combinedUnsavedCount: number;
  recovery: HistoryRecoveryRecord;
  syncStatus: TeamSyncStatus | null;
  warnings: SyncWarning[];
  inspectionInstructions: string | null;
};

export type TeamSyncViewState = {
  status: TeamSyncStatus | null;
  isLoading: boolean;
  isCheckingRemote: boolean;
  isStale: boolean;
  error: string | null;
  generation: number;
  /** Session-only evidence. It is never part of project persistence. */
  lastSuccessfulCheckAt: number | null;
};

export const EMPTY_TEAM_SYNC_STATE: TeamSyncViewState = {
  status: null,
  isLoading: false,
  isCheckingRemote: false,
  isStale: false,
  error: null,
  generation: 0,
  lastSuccessfulCheckAt: null,
};

export function teamSyncFactsEqual(
  left: TeamSyncStatus | null,
  right: TeamSyncStatus | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.state === right.state &&
    left.localBranch === right.localBranch &&
    left.localCommit === right.localCommit &&
    left.upstreamRemote === right.upstreamRemote &&
    left.destinationBranch === right.destinationBranch &&
    left.trackingRef === right.trackingRef &&
    left.remoteCommit === right.remoteCommit &&
    left.ahead === right.ahead &&
    left.behind === right.behind &&
    left.stateToken === right.stateToken &&
    left.warnings.length === right.warnings.length &&
    left.warnings.every(
      (warning, index) =>
        warning.code === right.warnings[index]?.code &&
        warning.message === right.warnings[index]?.message,
    ) &&
    forecastsEqual(left.forecast, right.forecast)
  );
}

/** What a check found about one branch: its remote branch was gone while this
 * tracking ref still held this commit. */
export type UpstreamGoneEvidence = {
  trackingRef: string | null;
  remoteCommit: string | null;
};

/** The evidence a fresh `upstreamGone` status leaves for its branch. */
export function upstreamGoneEvidenceOf(status: TeamSyncStatus): UpstreamGoneEvidence | null {
  return status.state === "upstreamGone" && status.knowledge === "fresh"
    ? { trackingRef: status.trackingRef, remoteCommit: status.remoteCommit }
    : null;
}

const COMPARED_STATES: ReadonlySet<TeamSyncState> = new Set(["upToDate", "ahead", "behind", "diverged"]);

/**
 * A local read of a branch a check found gone.
 *
 * A local read compares against the tracking ref, and GitOdile never prunes:
 * the ref of a branch the remote deleted is still there and still reads as
 * "up to date". While that ref holds the commit the check saw, the branch is
 * still gone; a ref that moved or vanished is new evidence and wins.
 */
export function applyUpstreamGoneEvidence(
  incoming: TeamSyncStatus,
  evidence: UpstreamGoneEvidence | undefined,
): TeamSyncStatus {
  if (
    !evidence ||
    incoming.knowledge !== "cached" ||
    !COMPARED_STATES.has(incoming.state) ||
    incoming.trackingRef !== evidence.trackingRef ||
    incoming.remoteCommit !== evidence.remoteCommit
  ) {
    return incoming;
  }
  return { ...incoming, state: "upstreamGone", ahead: 0, behind: 0, forecast: null, nextActions: ["checkAgain"] };
}

/** Plain data from Rust, compared by value. */
export function forecastsEqual(
  left: IncomingForecast | null,
  right: IncomingForecast | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function teamSyncStatusesEqual(
  left: TeamSyncStatus | null,
  right: TeamSyncStatus | null,
): boolean {
  if (left === right) return true;
  return (
    teamSyncFactsEqual(left, right) &&
    left?.knowledge === right?.knowledge &&
    left?.checkedAt === right?.checkedAt &&
    left?.nextActions.length === right?.nextActions.length &&
    Boolean(left?.nextActions.every((action, index) => action === right?.nextActions[index]))
  );
}

/** How long a check of the remote stays recent enough for Get project
 * changes to open on it without asking the remote again. */
export const RECENT_REMOTE_CHECK_MS = 60_000;

export type IntegrationSource =
  | { kind: "localBranch"; name: string }
  | { kind: "remoteBranch"; remote: string; branch: string };

export type IntegrationSources = { sources: IntegrationSource[]; isTruncated: boolean };
export type ResolvedSource = { label: string; remote: string | null; branch: string; reference: string; commit: string };
export type BringInKind = "alreadyContained" | "fastForward" | "merge" | "emptyMerge";
export type BringInChangesPlan = Omit<GetTeamChangesPlan,
  "operationKind" | "requiresConfirmation" | "target" | "trackingRef" | "remoteCommit" | "integration" | "forecast"
> & {
  operationKind: "read-only" | "history-mutation";
  requiresConfirmation: boolean;
  source: ResolvedSource;
  kind: BringInKind;
  forecast: IncomingForecast | null;
};
export type BringInChangesResult = Omit<GetTeamChangesResult,
  "target" | "trackingRef" | "integration" | "syncStatus"
> & { source: ResolvedSource; kind: BringInKind };

export type OverlappingMergeSource = { kind: "branch"; source: IntegrationSource } | { kind: "upstream" };
export type StartOverlappingMergeResult = {
  session: import("../conflicts").ConflictSession;
  recovery: HistoryRecoveryRecord;
};

export function integrationSourceLabel(source: IntegrationSource): string {
  return source.kind === "localBranch" ? source.name : `${source.remote}/${source.branch}`;
}

/** Whether this session asked the remote recently. A cached status (read from
 * this computer's tracking refs) is not a check. */
export function isRemoteCheckRecent(teamSync: TeamSyncViewState, now = Date.now()): boolean {
  const checkedAt = teamSync.lastSuccessfulCheckAt;
  return checkedAt !== null && now - checkedAt < RECENT_REMOTE_CHECK_MS;
}

export function selectTeamSyncState(
  snapshot: ProjectRuntimeSnapshot,
  projectId: string | null,
): TeamSyncViewState {
  return projectId ? (snapshot.byId[projectId]?.teamSync ?? EMPTY_TEAM_SYNC_STATE) : EMPTY_TEAM_SYNC_STATE;
}
