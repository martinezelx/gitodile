import { useEffect } from "react";

import type { ChangesController } from "../changes";
import type { HistoryController } from "../history";
import type { BranchesController } from "../branches";
import type { ConflictsController } from "../conflicts";
import type { SyncController, SyncErrorMapper } from "../sync";
import type { ProjectRuntime } from "../../runtime/project/runtime";
import type { ProjectSession } from "../../runtime/project/sessions";

type ProjectCacheWarmingOptions = {
  runtime: ProjectRuntime;
  hasCompletedSessionRestore: boolean;
  projectPath: string | null;
  session: ProjectSession | null;
  changesController: ChangesController;
  historyController: HistoryController;
  branchesController: BranchesController;
  conflictsController: ConflictsController;
  syncController: SyncController;
  mapSyncError: SyncErrorMapper;
};

/**
 * App-level cache coordination for an active project incarnation. Feature
 * screens only consume these caches; visibility is deliberately absent from
 * this API so arriving on a screen cannot become an invalidation signal.
 */
export function useProjectCacheWarming({
  runtime,
  hasCompletedSessionRestore,
  projectPath,
  session,
  changesController,
  historyController,
  branchesController,
  conflictsController,
  syncController,
  mapSyncError,
}: ProjectCacheWarmingOptions): void {
  useEffect(() => {
    if (!hasCompletedSessionRestore || !projectPath || !session?.epoch) {
      return undefined;
    }
    return historyController.scheduleWarm(
      runtime,
      { projectId: projectPath, sessionEpoch: session.epoch },
      "project-activation",
    );
  }, [hasCompletedSessionRestore, historyController, projectPath, runtime, session?.epoch]);

  useEffect(() => {
    if (!hasCompletedSessionRestore || !projectPath || !session?.epoch) {
      return undefined;
    }
    return branchesController.scheduleWarm(
      runtime,
      { projectId: projectPath, sessionEpoch: session.epoch },
      "project-activation",
    );
  }, [hasCompletedSessionRestore, projectPath, runtime, session?.epoch, branchesController]);

  useEffect(() => {
    if (!hasCompletedSessionRestore || !projectPath || !session?.epoch) {
      return undefined;
    }
    return syncController.scheduleWarm(
      runtime,
      { projectId: projectPath, sessionEpoch: session.epoch },
      "project-activation",
      mapSyncError,
    );
  }, [hasCompletedSessionRestore, mapSyncError, projectPath, runtime, session?.epoch, syncController]);

  // A paused operation shows up in the status as overlapping files or as
  // Git's operation markers (a merge whose files are all resolved has only
  // the markers), so the session is read after each status snapshot that has
  // either, and once more after one that no longer does (to see the session
  // end). A project with neither costs no Git process.
  const workingTree = session?.workingTree;
  const isPaused = workingTree ? workingTree.counts.conflicted > 0 || workingTree.pausedOperation === true : null;
  useEffect(() => {
    if (!hasCompletedSessionRestore || !projectPath || !session?.epoch || isPaused === null) {
      return undefined;
    }
    return conflictsController.scheduleWarm(
      runtime,
      { projectId: projectPath, sessionEpoch: session.epoch },
      isPaused,
    );
  }, [
    isPaused,
    conflictsController,
    hasCompletedSessionRestore,
    projectPath,
    runtime,
    session?.epoch,
    session?.statusGeneration,
  ]);

  useEffect(() => {
    if (!hasCompletedSessionRestore || !projectPath || !session?.workingTree) {
      return undefined;
    }
    return changesController.scheduleWarm(
      runtime,
      projectPath,
      session.epoch,
      session.workingTree,
      "repository-invalidation",
    );
  }, [
    changesController,
    hasCompletedSessionRestore,
    projectPath,
    runtime,
    session?.epoch,
    session?.statusGeneration,
    session?.workingTree,
  ]);
}
