import type {
  BringInChangesPlan, BringInChangesResult, IntegrationSource, IntegrationSources,
  OverlappingMergeSource, StartOverlappingMergeResult,
  GetTeamChangesPhase,
  GetTeamChangesPlan,
  GetTeamChangesResult,
  TeamSyncStatus,
} from "./domain";

export type TeamSyncQuery = {
  projectId: string;
  sessionEpoch: string;
};

export type GetTeamChangesRequest = TeamSyncQuery & {
  stateToken: string;
  recoveryReference: string;
  /** Whether the project's merge hooks run for a merge version; the same
   * Settings switch save and publish follow. */
  runHooks: boolean;
  onProgress: (phase: GetTeamChangesPhase) => void;
};

export interface SyncPort {
  readLocal(query: TeamSyncQuery): Promise<TeamSyncStatus>;
  check(query: TeamSyncQuery): Promise<TeamSyncStatus>;
  /** Local mutation: the current branch stops following its remote branch. */
  stopTracking(query: TeamSyncQuery): Promise<TeamSyncStatus>;
  /** Local: reads the remote as of the last check, never the network. */
  planGet(query: TeamSyncQuery): Promise<GetTeamChangesPlan>;
  get(request: GetTeamChangesRequest): Promise<GetTeamChangesResult>;
}

/** Branch integration is separate from the upstream read/cache contract. */
export interface BringInPort {
  listSources(query: TeamSyncQuery): Promise<IntegrationSources>;
  checkSource(query: TeamSyncQuery & { source: IntegrationSource }): Promise<void>;
  plan(query: TeamSyncQuery & { source: IntegrationSource }): Promise<BringInChangesPlan>;
  bring(request: GetTeamChangesRequest & { source: IntegrationSource }): Promise<BringInChangesResult>;
  startOverlap(request: TeamSyncQuery & {
    source: OverlappingMergeSource; stateToken: string; recoveryReference: string;
  }): Promise<StartOverlappingMergeResult>;
}
