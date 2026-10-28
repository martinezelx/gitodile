// Shared fixtures for the App composition-root tests, which are split by
// concern so the files run in parallel. Each test file keeps its own
// `vi.mock` calls, because Vitest hoists them per file.
import { cleanup, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import type { RepositoryInfo } from "../features/repository";
import type { WorkingTreeStatus } from "../features/status";
import type {
  GetTeamChangesPlan,
  GetTeamChangesResult,
  TeamSyncStatus,
} from "../features/sync";

export const mockedInvoke = vi.mocked(invoke);
export const mockedOpenFolderDialog = vi.mocked(openFolderDialog);

export function invokedPath(args: unknown): unknown {
  return args && typeof args === "object" && !Array.isArray(args)
    ? Reflect.get(args, "path")
    : undefined;
}

export const restoredProject: RepositoryInfo = {
  name: "restored-project",
  path: "C:\\projects\\restored-project",
  selectedPath: "C:\\projects\\restored-project",
  gitDir: "C:\\projects\\restored-project\\.git",
  commonGitDir: "C:\\projects\\restored-project\\.git",
  branch: "main",
  headState: "branch",
  kind: "repository",
  sessionEpoch: "restored-epoch",
};

export const cleanStatus: WorkingTreeStatus = {
  isClean: true,
  counts: { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 0 },
  lineTotals: null,
  entries: [],
  truncated: false,
  hasPreparedChanges: false,
  hasUnpreparedChanges: false,
  upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 },
};

export const cachedTeamSync: TeamSyncStatus = {
  state: "upToDate",
  localBranch: "main",
  localCommit: "1111111111111111111111111111111111111111",
  upstreamRemote: "origin",
  destinationBranch: "main",
  trackingRef: "refs/remotes/origin/main",
  remoteCommit: "1111111111111111111111111111111111111111",
  ahead: 0,
  behind: 0,
  knowledge: "cached",
  checkedAt: null,
  warnings: [],
  nextActions: ["checkAgain"],
  stateToken: "cached-sync",
  forecast: null,
};

export const freshBehindTeamSync: TeamSyncStatus = {
  ...cachedTeamSync,
  state: "behind",
  remoteCommit: "2222222222222222222222222222222222222222",
  behind: 1,
  knowledge: "fresh",
  // Now, not long ago: Get project changes asks the remote again in the
  // background when this session's last check is older than a minute.
  checkedAt: Date.now(),
  nextActions: ["reviewAndGet"],
  stateToken: "fresh-behind",
  forecast: {
    outcome: "clear",
    integration: "fastForward",
    remoteCommit: "2222222222222222222222222222222222222222",
    incomingCount: 1,
    localCount: 0,
    incomingFileCount: 1,
    authors: ["Team"],
    authorCount: 1,
    carriedUnsavedCount: 0,
    combinedUnsaved: [],
    combinedUnsavedCount: 0,
    overlaps: [],
    overlapCount: 0,
    blocker: null,
  },
};

/** Ahead *and* behind, with no forecast: nothing says what getting would do,
 * so nothing should be recorded about it. */
export const divergedTeamSync: TeamSyncStatus = {
  ...cachedTeamSync,
  state: "diverged",
  remoteCommit: "3333333333333333333333333333333333333333",
  ahead: 2,
  behind: 3,
  knowledge: "fresh",
  checkedAt: 2,
  nextActions: [],
  stateToken: "fresh-diverged",
};

export const getTeamPlan: GetTeamChangesPlan = {
  operationKind: "history-mutation",
  requiresConfirmation: true,
  projectId: restoredProject.path,
  sessionEpoch: restoredProject.sessionEpoch,
  stateToken: "get-plan",
  branch: "main",
  target: { remote: "origin", destinationBranch: "main" },
  trackingRef: "refs/remotes/origin/main",
  localCommit: "1111111111111111111111111111111111111111",
  remoteCommit: "2222222222222222222222222222222222222222",
  incomingCount: 1,
  integration: "fastForward",
  incomingVersions: [{
    commit: "2222222222222222222222222222222222222222",
    shortCommit: "2222222",
    title: "Project version",
    description: null,
    committedAt: "2026-08-16T10:00:00Z",
    author: "Team",
    fileCount: 1,
  }],
  versionsTruncated: false,
  localCount: 0,
  localVersions: [],
  fileImpact: {
    totalCount: 1,
    counts: { added: 1, modified: 0, deleted: 0, renamed: 0, binary: 0 },
    files: [{ path: "team.txt", originalPath: null, category: "added", binary: false }],
    isTruncated: false,
  },
  forecast: freshBehindTeamSync.forecast!,
  mergeMessage: null,
  recovery: {
    reference: "refs/gitodile/recovery/v1/get-team-changes/worktree-a/1",
    explanation: "protected",
    retention: "newest 20",
    retentionLimit: 20,
  },
};

export const getTeamResult: GetTeamChangesResult = {
  outcome: "completed",
  projectId: restoredProject.path,
  sessionEpoch: restoredProject.sessionEpoch,
  branch: "main",
  target: getTeamPlan.target,
  trackingRef: getTeamPlan.trackingRef,
  integration: "fastForward",
  previousCommit: getTeamPlan.localCommit,
  resultingCommit: getTeamPlan.remoteCommit,
  observedHead: getTeamPlan.remoteCommit,
  receivedCount: 1,
  combinedUnsavedCount: 0,
  recovery: {
    schemaVersion: 1,
    recoveryId: "1",
    reference: getTeamPlan.recovery.reference,
    createdAtMs: 1,
    operation: "get-team-changes",
    ownerId: "worktree-a",
    branch: "main",
    previousCommit: getTeamPlan.localCommit,
    targetCommit: getTeamPlan.remoteCommit,
    remote: "origin",
    destinationBranch: "main",
    trackingRef: getTeamPlan.trackingRef,
    stateToken: getTeamPlan.stateToken,
    retentionLimit: 20,
  },
  syncStatus: { ...cachedTeamSync, knowledge: "fresh", checkedAt: 2 },
  warnings: [],
  inspectionInstructions: null,
};

export const branches = {
  branch: "main",
  headState: "branch" as const,
  currentCommit: "abc123",
  branches: [
    {
      name: "main",
      tip: { commit: "abc123", shortCommit: "abc123a", subject: "first", committedAt: "2026-07-01T00:00:00Z" },
      isActive: true,
      upstream: null,
      isRetainedElsewhere: false,
      isFinished: false,
      uniqueCommitCount: null,
      worktreePath: null,
    },
    {
      name: "feature/spike",
      tip: { commit: "def456", shortCommit: "def456a", subject: "wip", committedAt: "2026-07-02T00:00:00Z" },
      isActive: false,
      upstream: null,
      isRetainedElsewhere: true,
      isFinished: true,
      uniqueCommitCount: 1,
      worktreePath: null,
    },
  ],
  totalCount: 2,
  isTruncated: false,
  unreadableCount: 0,
};

export const secondProject: RepositoryInfo = {
  ...restoredProject,
  name: "second-project",
  path: "C:\\projects\\second-project",
  selectedPath: "C:\\projects\\second-project",
  gitDir: "C:\\projects\\second-project\\.git",
  commonGitDir: "C:\\projects\\second-project\\.git",
  sessionEpoch: "second-epoch",
};

export function installAppTestHooks(): void {
  // App's idle prefetch loads every screen chunk during a file's first test,
  // and in a full parallel run that cold load alone pushed the first test
  // past its timeout. Loading them once per file here moves that cost out
  // of any one test; later tests already hit the warm module cache.
  beforeAll(async () => {
    const { prefetchScreenChunks } = await import("../app/screens");
    await prefetchScreenChunks();
  });

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });
}

/** The theme toggle lives in the rail's foot (task 189); the title bar's copy
 * is hidden by CSS while the rail shows, which jsdom does not apply. */
export function railButton(name: string): HTMLElement {
  const foot = document.querySelector<HTMLElement>(".sidebar-foot");
  if (!foot) throw new Error("The rail's foot is not rendered");
  return within(foot).getByRole("button", { name });
}
