import type { PendingVersionsResult } from "../../features/publish";
import type { RepositoryInfo } from "../../features/repository";
import type { WorkingTreeStatus } from "../../features/status";
import { EMPTY_TEAM_SYNC_STATE, type TeamSyncStatus, type TeamSyncViewState } from "../../features/sync";

/** Per-project view: `settings` lives outside any session (see `app/App.tsx`), so
 * a session only ever remembers which project screen it was last showing. */
export type ProjectView = "overview" | "workbench" | "branches" | "console" | "conflicts";

/** The two views of the Work screen (task 126). Which one is showing is the
 * session's to remember: Back and Forward move
 * between screens, and a project left on History comes back to History. */
export type WorkbenchTab = "changes" | "history";

export type ProjectMutationKind = "save" | "publish" | "discard" | "branch" | "sync";
export type ProjectMutationPhase =
  | "planning"
  | "executing"
  | "verifying"
  | "uncertain"
  | "error"
  | "success";

export type ProjectMutation = {
  kind: ProjectMutationKind;
  phase: ProjectMutationPhase;
  epoch: string;
};

export type ChangesSelectionState = {
  selectedPath: string | null;
  excludedPaths: string[];
};

export const EMPTY_CHANGES_SELECTION: ChangesSelectionState = { selectedPath: null, excludedPaths: [] };

export const EMPTY_PENDING_VERSIONS: PendingVersionsResult = {
  totalCount: 0,
  versions: [],
  isTruncated: false,
};

/**
 * One open project. `id` is the Rust-resolved canonical worktree root
 * (`RepositoryInfo.path`) — already stable across nested-folder selections,
 * path aliases, symlinks, and filesystem case variants (see
 * `open_repository`'s tests), and distinct per linked worktree. Using it
 * directly as the project identifier keeps path aliases stable. `epoch` is a
 * separate opaque open-incarnation identity, so close/reopen races cannot be
 * mistaken for another response belonging to the same session.
 */
export type ProjectSession = {
  id: string;
  epoch: string;
  project: RepositoryInfo;
  lastView: ProjectView;
  viewHistory: ProjectView[];
  viewHistoryIndex: number;
  workbenchTab: WorkbenchTab;
  changesSelection: ChangesSelectionState;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  /** `Date.now()` of the last check that actually returned a status, so the
   * Changes screen can say how fresh what it shows is. Deliberately not
   * updated by a failed check: the honest answer there is still the age of
   * the last snapshot the user is looking at. Stamped by the caller and
   * passed in, keeping this reducer pure. */
  workingTreeCheckedAt: number | null;
  /** Sequence number the caller stamps on the request that produced the
   * current `workingTree`/`pendingVersions`. `apply*` actions are rejected
   * unless their `generation` still matches, so a response from a
   * superseded request (a second refresh started before the first
   * returned) can never clobber a newer one. Ownership of the counter
   * itself lives with the status feature controller, not this reducer —
   * that keeps "what's the next generation" a plain synchronous read the
   * controller can use before the async call even starts. */
  statusGeneration: number;
  pendingVersions: PendingVersionsResult;
  pendingVersionsError: string | null;
  teamSync: TeamSyncViewState;
  operation: ProjectMutation | null;
};

export type ProjectSessionsState = {
  /** Display/switch order. Separate from `byId` so reordering doesn't need
   * to touch session contents. */
  order: string[];
  byId: Record<string, ProjectSession>;
  activeId: string | null;
};

export const initialProjectSessionsState: ProjectSessionsState = {
  order: [],
  byId: {},
  activeId: null,
};

export type ProjectSessionsAction =
  | { type: "open"; project: RepositoryInfo }
  | { type: "restore"; projects: RepositoryInfo[]; activeId: string | null }
  | { type: "activate"; id: string }
  | { type: "close"; id: string }
  | { type: "reorder"; id: string; toIndex: number }
  | { type: "startStatusCheck"; id: string; generation: number; epoch: string }
  | {
      type: "applyWorkingTree";
      id: string;
      generation: number;
      epoch: string;
      workingTree: WorkingTreeStatus;
      checkedAt: number;
    }
  | { type: "applyWorkingTreeError"; id: string; generation: number; epoch: string; error: string }
  | { type: "applyPendingVersions"; id: string; generation: number; epoch: string; result: PendingVersionsResult }
  | { type: "commitPublishedVersions"; id: string; generation: number; epoch: string; remaining: number }
  | { type: "applyPendingVersionsError"; id: string; generation: number; epoch: string; error: string }
  | {
      type: "startTeamSyncRequest";
      id: string;
      generation: number;
      epoch: string;
      kind: "local" | "check";
      markExistingStale: boolean;
    }
  | { type: "applyTeamSyncStatus"; id: string; generation: number; epoch: string; status: TeamSyncStatus }
  | { type: "commitTeamSyncResult"; id: string; generation: number; epoch: string; status: TeamSyncStatus }
  | { type: "applyTeamSyncError"; id: string; generation: number; epoch: string; error: string }
  | { type: "markTeamSyncStale"; id: string; epoch: string }
  | { type: "navigate"; id: string; view: ProjectView }
  | { type: "goBack"; id: string }
  | { type: "goForward"; id: string }
  | { type: "startOperation"; id: string; kind: ProjectMutationKind }
  | { type: "setOperationPhase"; id: string; phase: ProjectMutationPhase }
  | { type: "finishOperation"; id: string }
  | { type: "setChangesSelection"; id: string; selection: ChangesSelectionState }
  | { type: "setWorkbenchTab"; id: string; tab: WorkbenchTab };

export function repositorySessionEpoch(project: RepositoryInfo): string {
  return project.sessionEpoch;
}

function freshSession(project: RepositoryInfo): ProjectSession {
  return {
    id: project.path,
    epoch: repositorySessionEpoch(project),
    project,
    lastView: "overview",
    viewHistory: ["overview"],
    viewHistoryIndex: 0,
    workbenchTab: "changes",
    changesSelection: EMPTY_CHANGES_SELECTION,
    workingTree: null,
    workingTreeError: null,
    isCheckingChanges: false,
    workingTreeCheckedAt: null,
    statusGeneration: 0,
    pendingVersions: EMPTY_PENDING_VERSIONS,
    pendingVersionsError: null,
    teamSync: EMPTY_TEAM_SYNC_STATE,
    operation: null,
  };
}

/**
 * Whether a filesystem-watch event for this session should be answered with a
 * working-tree refresh (task 020).
 *
 * A save or publish that is planning, executing, or verifying owns the
 * working tree for the duration: it writes files itself, and re-reading
 * underneath it would either show a half-finished state or move the ground
 * under a plan the user is confirming. `error` and `success` are settled
 * phases whose dialog is only still open because the user hasn't dismissed
 * it, so those refresh normally.
 */
export function shouldRefreshOnWatchEvent(session: ProjectSession | undefined): boolean {
  if (!session) {
    return false;
  }
  const phase = session.operation?.phase;
  return phase === undefined || phase === "error" || phase === "success";
}

/** Reloading the WebView while a project mutation is unsettled would detach
 * the UI from an operation that may still be changing Git state. Terminal
 * success/error phases are safe: they no longer own the working tree. */
export function hasUnsettledOperation(state: ProjectSessionsState): boolean {
  return state.order.some((id) => {
    const phase = state.byId[id]?.operation?.phase;
    return phase !== undefined && phase !== "error" && phase !== "success";
  });
}

export function getMutationBlocker(
  state: ProjectSessionsState,
  id: string,
): ProjectSession | null {
  const target = state.byId[id];
  if (!target) {
    return null;
  }
  return (
    state.order
      .filter((candidateId) => candidateId !== id)
      .map((candidateId) => state.byId[candidateId])
      .find(
        (candidate) =>
          candidate.operation !== null &&
          candidate.operation.phase !== "error" &&
          candidate.operation.phase !== "success" &&
          candidate.project.commonGitDir === target.project.commonGitDir,
      ) ?? null
  );
}

function updateSession(
  state: ProjectSessionsState,
  id: string,
  update: (session: ProjectSession) => ProjectSession,
): ProjectSessionsState {
  const session = state.byId[id];
  if (!session) {
    return state;
  }
  return { ...state, byId: { ...state.byId, [id]: update(session) } };
}

function actionMatchesEpoch(
  session: ProjectSession | undefined,
  epoch: string,
): session is ProjectSession {
  return Boolean(session) && session?.epoch === epoch;
}

export function projectSessionsReducer(
  state: ProjectSessionsState,
  action: ProjectSessionsAction,
): ProjectSessionsState {
  switch (action.type) {
    case "open": {
      const id = action.project.path;
      const existing = state.byId[id];
      if (existing) {
        if (action.project.sessionEpoch !== existing.epoch) {
          return state;
        }
        // Already open: activate it instead of duplicating, but refresh the
        // repository facts (branch, head state) since `open_repository` just
        // re-read them.
        return {
          ...state,
          byId: {
            ...state.byId,
            [id]: {
              ...existing,
              project: action.project,
              epoch: action.project.sessionEpoch,
            },
          },
          activeId: id,
        };
      }
      return {
        order: [...state.order, id],
        byId: { ...state.byId, [id]: freshSession(action.project) },
        activeId: id,
      };
    }

    case "restore": {
      // Launch restore lands every revalidated project and the active one in a
      // single transition. Dispatching `open` per project would make each one
      // active in turn, so the first frames show projects the user did not
      // leave active. A session that already exists (opened by the user while
      // restore was still revalidating) is kept as it is, and so is the
      // active project that open made: a choice made now outranks the stored
      // one from the last session.
      const order = [...state.order];
      const byId = { ...state.byId };
      for (const project of action.projects) {
        if (byId[project.path]) continue;
        order.push(project.path);
        byId[project.path] = freshSession(project);
      }
      if (order.length === state.order.length) {
        return state;
      }
      const activeId =
        state.activeId ??
        (action.activeId !== null && byId[action.activeId] ? action.activeId : order[order.length - 1]);
      return { order, byId, activeId };
    }

    case "activate": {
      if (!state.byId[action.id]) {
        return state;
      }
      return { ...state, activeId: action.id };
    }

    case "close": {
      if (!state.byId[action.id]) {
        return state;
      }
      const order = state.order.filter((id) => id !== action.id);
      const byId = { ...state.byId };
      delete byId[action.id];
      // Closing the active project leaves none active, even with others open
      // (task 184): moving the reader into another repository on its own is
      // how a save or a publish lands in the wrong project. The shell shows
      // Home, and the next project is one the reader picks. Closing any other
      // project leaves the active one as it is.
      const activeId = state.activeId === action.id ? null : state.activeId;
      return { order, byId, activeId };
    }

    case "reorder": {
      if (!state.byId[action.id]) {
        return state;
      }
      const order = state.order.filter((id) => id !== action.id);
      const clampedIndex = Math.max(0, Math.min(action.toIndex, order.length));
      order.splice(clampedIndex, 0, action.id);
      return { ...state, order };
    }

    case "startStatusCheck":
      if (!actionMatchesEpoch(state.byId[action.id], action.epoch)) {
        return state;
      }
      return updateSession(state, action.id, (session) => ({
        ...session,
        statusGeneration: action.generation,
        isCheckingChanges: true,
      }));

    case "applyWorkingTree": {
      const session = state.byId[action.id];
      if (!actionMatchesEpoch(session, action.epoch) || session?.statusGeneration !== action.generation) {
        return state;
      }
      return updateSession(state, action.id, (current) => ({
        ...current,
        workingTree: action.workingTree,
        workingTreeError: null,
        isCheckingChanges: false,
        workingTreeCheckedAt: action.checkedAt,
      }));
    }

    case "applyWorkingTreeError": {
      const session = state.byId[action.id];
      if (!actionMatchesEpoch(session, action.epoch) || session?.statusGeneration !== action.generation) {
        return state;
      }
      // Keeps the last known `workingTree` visible; only the error and the
      // busy flag change. The caller decides whether to surface the error
      // (see `statusRefreshFailedNote`'s usage in `app/App.tsx`) based on whether
      // a previous successful snapshot exists.
      return updateSession(state, action.id, (current) => ({
        ...current,
        workingTreeError: action.error,
        isCheckingChanges: false,
      }));
    }

    case "applyPendingVersions": {
      const session = state.byId[action.id];
      if (!actionMatchesEpoch(session, action.epoch) || session?.statusGeneration !== action.generation) {
        return state;
      }
      return updateSession(state, action.id, (current) => ({
        ...current,
        pendingVersions: action.result,
        pendingVersionsError: null,
      }));
    }

    case "commitPublishedVersions": {
      const session = state.byId[action.id];
      if (!actionMatchesEpoch(session, action.epoch)) {
        return state;
      }
      const versions = session.pendingVersions.versions.slice(0, action.remaining);
      return updateSession(state, action.id, (current) => ({
        ...current,
        statusGeneration: action.generation,
        pendingVersions: {
          totalCount: action.remaining,
          versions,
          isTruncated: versions.length < action.remaining,
        },
        pendingVersionsError: null,
      }));
    }

    case "applyPendingVersionsError": {
      const session = state.byId[action.id];
      if (!actionMatchesEpoch(session, action.epoch) || session?.statusGeneration !== action.generation) {
        return state;
      }
      return updateSession(state, action.id, (current) => ({
        ...current,
        pendingVersionsError: action.error,
      }));
    }

    case "startTeamSyncRequest": {
      const session = state.byId[action.id];
      if (!actionMatchesEpoch(session, action.epoch)) return state;
      return updateSession(state, action.id, (current) => ({
        ...current,
        teamSync: {
          ...current.teamSync,
          generation: action.generation,
          isLoading: true,
          isCheckingRemote: action.kind === "check",
          isStale: action.markExistingStale
            ? current.teamSync.status?.knowledge === "fresh" || current.teamSync.isStale
            : current.teamSync.isStale,
          error: null,
        },
      }));
    }

    case "applyTeamSyncStatus": {
      const session = state.byId[action.id];
      if (!actionMatchesEpoch(session, action.epoch) || session.teamSync.generation !== action.generation) {
        return state;
      }
      return updateSession(state, action.id, (current) => ({
        ...current,
        teamSync: {
          ...current.teamSync,
          status: action.status,
          isLoading: false,
          isCheckingRemote: false,
          isStale: false,
          error: null,
          lastSuccessfulCheckAt:
            action.status.knowledge === "fresh" && action.status.checkedAt !== null
              ? action.status.checkedAt
              : current.teamSync.lastSuccessfulCheckAt,
        },
      }));
    }

    case "commitTeamSyncResult": {
      if (!actionMatchesEpoch(state.byId[action.id], action.epoch)) return state;
      return updateSession(state, action.id, (current) => ({
        ...current,
        teamSync: {
          ...current.teamSync,
          generation: action.generation,
          status: action.status,
          isLoading: false,
          isCheckingRemote: false,
          isStale: false,
          error: null,
          lastSuccessfulCheckAt: action.status.checkedAt,
        },
      }));
    }

    case "applyTeamSyncError": {
      const session = state.byId[action.id];
      if (!actionMatchesEpoch(session, action.epoch) || session.teamSync.generation !== action.generation) {
        return state;
      }
      return updateSession(state, action.id, (current) => ({
        ...current,
        teamSync: {
          ...current.teamSync,
          isLoading: false,
          isCheckingRemote: false,
          isStale: current.teamSync.status !== null,
          error: action.error,
        },
      }));
    }

    case "markTeamSyncStale":
      if (!actionMatchesEpoch(state.byId[action.id], action.epoch)) return state;
      return updateSession(state, action.id, (current) => ({
        ...current,
        teamSync: {
          ...current.teamSync,
          generation: current.teamSync.generation + 1,
          isLoading: false,
          isCheckingRemote: false,
          isStale: current.teamSync.status !== null,
        },
      }));

    case "navigate":
      return updateSession(state, action.id, (session) => {
        if (session.lastView === action.view) {
          return session;
        }
        const viewHistory = [
          ...session.viewHistory.slice(0, session.viewHistoryIndex + 1),
          action.view,
        ];
        return {
          ...session,
          lastView: action.view,
          viewHistory,
          viewHistoryIndex: viewHistory.length - 1,
        };
      });

    case "goBack":
      return updateSession(state, action.id, (session) => {
        const viewHistoryIndex = Math.max(0, session.viewHistoryIndex - 1);
        return {
          ...session,
          viewHistoryIndex,
          lastView: session.viewHistory[viewHistoryIndex],
        };
      });

    case "goForward":
      return updateSession(state, action.id, (session) => {
        const viewHistoryIndex = Math.min(
          session.viewHistory.length - 1,
          session.viewHistoryIndex + 1,
        );
        return {
          ...session,
          viewHistoryIndex,
          lastView: session.viewHistory[viewHistoryIndex],
        };
      });

    case "startOperation": {
      if (getMutationBlocker(state, action.id)) {
        return state;
      }
      return updateSession(state, action.id, (session) => ({
        ...session,
        operation: { kind: action.kind, phase: "planning", epoch: session.epoch },
      }));
    }

    case "setOperationPhase":
      return updateSession(state, action.id, (session) =>
        session.operation
          ? { ...session, operation: { ...session.operation, phase: action.phase } }
          : session,
      );

    case "finishOperation":
      return updateSession(state, action.id, (session) => ({
        ...session,
        operation: null,
      }));

    case "setChangesSelection":
      return updateSession(state, action.id, (session) => ({ ...session, changesSelection: action.selection }));

    case "setWorkbenchTab":
      return updateSession(state, action.id, (session) =>
        session.workbenchTab === action.tab ? session : { ...session, workbenchTab: action.tab },
      );
  }
}

// ---- Persistence ----
// Only canonical paths, order, and the active id ever reach storage — no
// diffs, source contents, credentials, tokens, or raw Git errors.

export type StoredProjectsV1 = {
  version: 1;
  order: string[];
  activeId: string | null;
};

const PROJECTS_STORAGE_KEY = "gitodile-projects";
const LEGACY_LAST_PROJECT_PATH_KEY = "gitodile-last-project-path";

function isStoredProjectsV1(value: unknown): value is StoredProjectsV1 {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.order) &&
    candidate.order.every((entry) => typeof entry === "string") &&
    (candidate.activeId === null || typeof candidate.activeId === "string")
  );
}

export function writeStoredProjects(stored: StoredProjectsV1): void {
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(stored));
}

/** Reads the persisted project list, migrating the old single-path key
 * (`gitodile-last-project-path`) exactly once if the new key hasn't been
 * written yet. Corrupt JSON under the new key is treated the same as it
 * being absent, rather than throwing and blocking startup. */
export function readStoredProjects(): StoredProjectsV1 {
  const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
  if (raw !== null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isStoredProjectsV1(parsed)) {
        return parsed;
      }
    } catch {
      // Corrupt JSON: fall through as if nothing were stored.
    }
    return { version: 1, order: [], activeId: null };
  }

  const legacyPath = localStorage.getItem(LEGACY_LAST_PROJECT_PATH_KEY);
  if (legacyPath) {
    localStorage.removeItem(LEGACY_LAST_PROJECT_PATH_KEY);
    const migrated: StoredProjectsV1 = { version: 1, order: [legacyPath], activeId: legacyPath };
    writeStoredProjects(migrated);
    return migrated;
  }

  return { version: 1, order: [], activeId: null };
}

export function projectSessionsStateToStored(state: ProjectSessionsState): StoredProjectsV1 {
  return { version: 1, order: state.order, activeId: state.activeId };
}
