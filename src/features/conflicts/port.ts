import type { FileDiff } from "../changes";
import type {
  AbortMergePlan,
  AbortMergeResult,
  ConflictFile,
  ConflictSession,
  ConflictSideName,
  FinishMergePlan,
  FinishMergeResult,
  SideChoice,
  WorkingFileCheck,
} from "./domain";

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
  /** Opens the file in the application the system uses for its type, after
   * taking the session's snapshot if it has none. Refuses a type the system
   * would run (`file_runs_as_program`). Never resolves anything. */
  openFile(target: ConflictFileTarget): Promise<void>;
  /** Whether the working file still holds conflict markers, as of the
   * session token it answers with. Read-only. */
  checkWorkingFile(target: ConflictsQuery & { filePath: string }): Promise<WorkingFileCheck>;
  /** Shows the path in the system's file manager, for what GitOdile will
   * not open or write. */
  revealFile(target: ConflictsQuery & { filePath: string }): Promise<void>;
  /** Opens the project's folder, for a file whose name GitOdile cannot
   * spell exactly. */
  openProjectFolder(query: ConflictsQuery): Promise<void>;
  /** What finishing the merge would save. Read-only; refuses while a file
   * overlaps or Git has no identity. */
  planFinish(query: ConflictsQuery): Promise<FinishMergePlan>;
  /** Saves the merge version through `git commit`, with the project's hooks
   * unless `runHooks` is off in Settings, and verifies it. Never publishes. */
  finish(
    query: ConflictsQuery & { title: string; description: string | null; stateToken: string; runHooks: boolean },
  ): Promise<FinishMergeResult>;
  /** What abandoning the merge would put back and what it cannot promise. */
  planAbort(query: ConflictsQuery): Promise<AbortMergePlan>;
  /** Keeps a copy of what the merge holds, then runs `git merge --abort`
   * and verifies the result. */
  abort(query: ConflictsQuery & { stateToken: string }): Promise<AbortMergeResult>;
}
