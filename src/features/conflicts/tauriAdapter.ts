import { invoke } from "@tauri-apps/api/core";
import type { ConflictsPort } from "./port";

export const conflictsPort: ConflictsPort = {
  readSession: ({ projectId: path, sessionEpoch }) => invoke("read_conflict_session", { path, sessionEpoch }),
  readSideDiff: ({ projectId: path, sessionEpoch, filePath, side, baseObjectId, sideObjectId }) =>
    invoke("read_conflict_side_diff", { path, sessionEpoch, filePath, side, baseObjectId, sideObjectId }),
};
