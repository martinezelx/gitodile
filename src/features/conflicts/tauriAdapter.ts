import { invoke } from "@tauri-apps/api/core";
import type { ConflictsPort } from "./port";

export const conflictsPort: ConflictsPort = {
  readSession: ({ projectId: path, sessionEpoch }) => invoke("read_conflict_session", { path, sessionEpoch }),
  readSideDiff: ({ projectId: path, sessionEpoch, filePath, side, baseObjectId, sideObjectId }) =>
    invoke("read_conflict_side_diff", { path, sessionEpoch, filePath, side, baseObjectId, sideObjectId }),
  keepSide: ({ projectId: path, sessionEpoch, filePath, stateToken, choice, expected }) =>
    invoke("resolve_conflict_side", { path, sessionEpoch, filePath, choice, expected, stateToken }),
  markResolved: ({ projectId: path, sessionEpoch, filePath, stateToken, expected, allowMarkers, executable }) =>
    invoke("mark_conflict_resolved", { path, sessionEpoch, filePath, expected, stateToken, allowMarkers, executable }),
  resetFile: ({ projectId: path, sessionEpoch, filePath, stateToken, stagesOnly }) =>
    invoke("reset_conflict_file", { path, sessionEpoch, filePath, stateToken, stagesOnly }),
  openFile: ({ projectId: path, sessionEpoch, filePath, stateToken }) =>
    invoke("open_conflict_file", { path, sessionEpoch, filePath, stateToken }),
  checkWorkingFile: ({ projectId: path, sessionEpoch, filePath }) =>
    invoke("check_conflict_working_file", { path, sessionEpoch, filePath }),
  revealFile: ({ projectId: path, sessionEpoch, filePath }) => invoke("reveal_project_file", { path, sessionEpoch, filePath }),
  openProjectFolder: ({ projectId: path, sessionEpoch }) => invoke("open_project_folder", { path, sessionEpoch }),
  planFinish: ({ projectId: path, sessionEpoch }) => invoke("plan_finish_merge", { path, sessionEpoch }),
  finish: ({ projectId: path, sessionEpoch, title, description, stateToken, runHooks }) =>
    invoke("finish_merge", { path, sessionEpoch, title, description, stateToken, runHooks }),
  planAbort: ({ projectId: path, sessionEpoch }) => invoke("plan_abort_merge", { path, sessionEpoch }),
  abort: ({ projectId: path, sessionEpoch, stateToken }) => invoke("abort_merge", { path, sessionEpoch, stateToken }),
};
