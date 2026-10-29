import type { FileDiff } from "../changes";
import type { ConflictFile, ConflictSession, ConflictSideName, SideChoice } from "./domain";

export type ConflictsQuery = { projectId: string; sessionEpoch: string };

export type ConflictSideDiffQuery = ConflictsQuery & {
  filePath: string;
  side: ConflictSideName;
  /** The stages the screen read, which Rust checks are still the path's. */
  baseObjectId: string | null;
  sideObjectId: string;
};

/** The stages the screen read for one file: every mutation proves they are
 * still the path's, so a choice never applies to objects the reader did not
 * see. */
export type ExpectedStages = Pick<ConflictFile, "base" | "current" | "incoming">;

/** One file of the session the screen read, as of its state token. */
export type ConflictFileTarget = ConflictsQuery & { filePath: string; stateToken: string };

export interface ConflictsPort {
  /** The paused operation and its files, or `null` when nothing is paused.
   * Read-only: it never refreshes the index or writes a lock. */
  readSession(query: ConflictsQuery): Promise<ConflictSession | null>;
  /** What one side changed against the common base, as the Changes tab's
   * typed diff. */
  readSideDiff(query: ConflictSideDiffQuery): Promise<FileDiff>;
  /** Writes one whole side, or deletes the path, in the working tree only;
   * the file still overlaps until it is marked resolved. Each mutation
   * answers with the fresh session. */
  keepSide(target: ConflictFileTarget & { choice: SideChoice; expected: ExpectedStages }): Promise<ConflictSession | null>;
  /** Tells Git the file is done as it is now. `executable` names the
   * permission when the sides disagree on it and the file was edited. */
  markResolved(
    target: ConflictFileTarget & { expected: ExpectedStages; allowMarkers: boolean; executable: boolean | null },
  ): Promise<ConflictSession | null>;
  /** Puts the file back as the merge left it, from the snapshot; with
   * `stagesOnly`, the overlap alone, leaving the working file as it is. */
  resetFile(target: ConflictFileTarget & { stagesOnly: boolean }): Promise<ConflictSession | null>;
}
