import { Channel, invoke } from "@tauri-apps/api/core";

import type { GetTeamChangesPhase } from "./domain";
import type { BringInPort, SyncPort } from "./port";

export const syncPort: SyncPort = {
  readLocal: ({ projectId: path, sessionEpoch }) =>
    invoke("read_team_sync_status", { path, sessionEpoch }),
  check: ({ projectId: path, sessionEpoch }) =>
    invoke("check_team_changes", { path, sessionEpoch }),
  stopTracking: ({ projectId: path, sessionEpoch }) =>
    invoke("stop_tracking_remote", { path, sessionEpoch }),
  planGet: ({ projectId: path, sessionEpoch }) =>
    invoke("plan_get_team_changes", { path, sessionEpoch }),
  get: ({ projectId: path, sessionEpoch, stateToken, recoveryReference, runHooks, onProgress }) => {
    const channel = new Channel<GetTeamChangesPhase>();
    channel.onmessage = onProgress;
    return invoke("get_team_changes", {
      path,
      sessionEpoch,
      stateToken,
      recoveryReference,
      runHooks,
      onProgress: channel,
    });
  },
};

export const bringInPort: BringInPort = {
  listSources: ({ projectId: path, sessionEpoch }) => invoke("list_integration_sources", { path, sessionEpoch }),
  checkSource: ({ projectId: path, sessionEpoch, source }) => invoke("check_integration_source", { path, sessionEpoch, source }),
  plan: ({ projectId: path, sessionEpoch, source }) => invoke("plan_bring_in_changes", { path, sessionEpoch, source }),
  bring: ({ projectId: path, sessionEpoch, source, stateToken, recoveryReference, runHooks, onProgress }) => {
    const channel = new Channel<GetTeamChangesPhase>();
    channel.onmessage = onProgress;
    return invoke("bring_in_changes", { path, sessionEpoch, source, stateToken, recoveryReference, runHooks, onProgress: channel });
  },
  startOverlap: ({ projectId: path, sessionEpoch, source, stateToken, recoveryReference }) =>
    invoke("start_overlapping_merge", { path, sessionEpoch, source, stateToken, recoveryReference }),
};
