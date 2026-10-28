import type { FileDiff } from "../changes";
import type { ConflictSession, ConflictSideName } from "./domain";

export type ConflictsQuery = { projectId: string; sessionEpoch: string };

export type ConflictSideDiffQuery = ConflictsQuery & {
  filePath: string;
  side: ConflictSideName;
  /** The stages the screen read, which Rust checks are still the path's. */
  baseObjectId: string | null;
  sideObjectId: string;
};

export interface ConflictsPort {
  /** The paused operation and its files, or `null` when nothing is paused.
   * Read-only: it never refreshes the index or writes a lock. */
  readSession(query: ConflictsQuery): Promise<ConflictSession | null>;
  /** What one side changed against the common base, as the Changes tab's
   * typed diff. */
  readSideDiff(query: ConflictSideDiffQuery): Promise<FileDiff>;
}
