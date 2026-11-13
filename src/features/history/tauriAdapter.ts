import { invoke } from "@tauri-apps/api/core";
import type { HistoryPort } from "./port";

export const historyPort: HistoryPort = {
  readPage: ({ projectId: path, sessionEpoch, cursor, pageSize, filters, scope }) =>
    invoke("read_history_page", { path, sessionEpoch, cursor, pageSize, filters, scope }),
  readDetail: ({ projectId: path, sessionEpoch, snapshotToken, commit }) =>
    invoke("read_saved_version_detail", { path, sessionEpoch, snapshotToken, commit }),
  readFileDiff: ({ projectId: path, sessionEpoch, snapshotToken, commit, filePath }) =>
    invoke("read_saved_version_file_diff", { path, sessionEpoch, snapshotToken, commit, filePath }),
  readFileMarkdown: ({ projectId: path, sessionEpoch, snapshotToken, commit, filePath }) =>
    invoke("read_saved_version_file_markdown", { path, sessionEpoch, snapshotToken, commit, filePath }),
  readImagePreview: ({ projectId: path, sessionEpoch, commit, filePath, originalPath }) =>
    invoke("read_file_image_preview", { path, sessionEpoch, commit, filePath, originalPath }),
};
