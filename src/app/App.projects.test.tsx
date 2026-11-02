import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../i18n";
import { App } from "./App";
import type { WorkingTreeStatus } from "../features/status";
import {
  installAppTestHooks,
  mockedInvoke,
  mockedOpenFolderDialog,
  invokedPath,
  restoredProject,
  cleanStatus,
  cachedTeamSync,
  freshBehindTeamSync,
  getTeamPlan,
  getTeamResult,
  branches,
  secondProject,
} from "../test-fixtures/appTestHarness";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class TestChannel<T> {
    onmessage?: (message: T) => void;
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
// Off by default, as in a browser or on Windows and Linux; the macOS test
// in App.test.tsx turns it on and drives the menu through the fake port.
vi.mock("./nativeAppMenu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./nativeAppMenu")>()),
  hasNativeMacWindowChrome: vi.fn(() => false),
}));
vi.mock("./nativeAppMenuAdapter", () => ({
  nativeAppMenuPort: { install: vi.fn(async () => ({ update: vi.fn(async () => undefined) })) },
}));

installAppTestHooks();

describe("App projects", () => {
  // Activation-to-status-bar wiring belongs to App; a feature-only test cannot
  // prove both displayed identity and local refresh use the selected session.
  it("refreshes a project's local status and branch identity whenever it becomes active", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({
        version: 1,
        order: [restoredProject.path, secondProject.path],
        activeId: restoredProject.path,
      }),
    );

    mockedInvoke.mockImplementation((command, args) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(
          invokedPath(args) === secondProject.path
            ? { ...secondProject, branch: args && typeof args === "object" && Reflect.get(args, "sessionEpoch") ? "changed-elsewhere" : secondProject.branch }
            : restoredProject,
        );
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        // Live working-tree updates (task 020). Answered so the watch
        // lifecycle stays a background no-op in these tests; the listener
        // itself is inert outside Tauri.
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        // The idle-time branch-inventory prefetch (task 019). Answered here
        // so it stays a background no-op rather than an unexpected command.
        return Promise.resolve(branches);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    await waitFor(() =>
      expect(
        mockedInvoke.mock.calls.filter(
          ([command, args]) =>
            command === "read_working_tree_status" &&
            invokedPath(args) === secondProject.path,
        ),
      ).toHaveLength(1),
    );

    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${restoredProject.name} — switch project`) }),
    );
    await userEvent.click(screen.getByRole("button", { name: `Switch to ${secondProject.name}` }));
    expect(await screen.findByRole("button", { name: "Change branch (changed-elsewhere)" })).toBeInTheDocument();

    await waitFor(() =>
      expect(
        mockedInvoke.mock.calls.filter(
          ([command, args]) =>
            command === "read_working_tree_status" &&
            invokedPath(args) === secondProject.path,
        ),
      ).toHaveLength(2),
    );
  });

  it("keeps the global remote check narrow and refreshes local facts after a completed team update", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );

    let checkedRemote = false;
    let appliedUpdate = false;
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(restoredProject);
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "read_team_sync_status") {
        return Promise.resolve(
          appliedUpdate
            ? cachedTeamSync
            : checkedRemote
              ? { ...freshBehindTeamSync, knowledge: "cached", checkedAt: null }
              : cachedTeamSync,
        );
      }
      if (command === "check_team_changes") {
        checkedRemote = true;
        return Promise.resolve(freshBehindTeamSync);
      }
      if (command === "plan_get_team_changes") {
        return Promise.resolve(getTeamPlan);
      }
      if (command === "get_team_changes") {
        appliedUpdate = true;
        return Promise.resolve(getTeamResult);
      }
      if (command === "watch_repository") {
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        return Promise.resolve(branches);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );
    await screen.findByRole("heading", { name: restoredProject.name });
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    const localReadsBeforeRemoteCheck = mockedInvoke.mock.calls.filter(
      ([command]) => command === "read_working_tree_status",
    ).length;
    const repositoryOpensBeforeRemoteCheck = mockedInvoke.mock.calls.filter(
      ([command]) => command === "open_repository",
    ).length;
    const statusBar = screen.getByRole("contentinfo", { name: "Project status" });
    await userEvent.click(
      within(statusBar).getByRole("button", { name: "Check remote project changes" }),
    );
    // Overview's next-step card is where the answer lands now. The status bar
    // says the same words, so the card is found by its title's class.
    expect(
      (await screen.findAllByText(/^1 new version (on|available)/)).some((node) =>
        node.classList.contains("next-step__title"),
      ),
    ).toBe(true);
    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "read_working_tree_status"),
    ).toHaveLength(localReadsBeforeRemoteCheck);
    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "open_repository"),
    ).toHaveLength(repositoryOpensBeforeRemoteCheck);
    // Overview's card and the status bar both offer the get; this takes the
    // status bar's, the one every screen carries.
    await userEvent.click(await within(statusBar).findByRole("button", { name: "Get 1 version" }));
    // The confirmation opens behind an async plan call, which under a loaded
    // parallel run needs more than the one-second default (task 072).
    const confirm = await screen.findByRole(
      "button",
      { name: "Get" },
      { timeout: 3000 },
    );
    // The status bar's project popup disables switching and closing while
    // the plan is open (ProjectSwitcher.test.tsx covers the rows).

    const readsBefore = mockedInvoke.mock.calls.filter(
      ([command]) => command === "read_working_tree_status",
    ).length;
    const opensBefore = mockedInvoke.mock.calls.filter(
      ([command]) => command === "open_repository",
    ).length;
    await userEvent.click(confirm);
    await screen.findByText("Project up to date. 1 version came in.");

    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "read_working_tree_status"),
    ).toHaveLength(readsBefore + 1);
    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "open_repository"),
    ).toHaveLength(opensBefore + 1);
    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "get_team_changes"),
    ).toHaveLength(1);
    expect(
      mockedInvoke.mock.calls.filter(([command]) => command === "check_team_changes"),
    ).toHaveLength(1);
  });

  it("saves a version from Overview without leaving Overview", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    const dirtyStatus: WorkingTreeStatus = {
      ...cleanStatus,
      isClean: false,
      counts: { changed: 1, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 1 },
      entries: [{ path: "notes.md", originalPath: null, category: "changed", isPrepared: false, hasUnpreparedChanges: true }],
      hasUnpreparedChanges: true,
    };

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(dirtyStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "plan_save_version") {
        return Promise.resolve({
          operationKind: "history-mutation",
          requiresConfirmation: true,
          stateToken: "token",
          branch: "main",
          isFirstVersion: false,
          totalFiles: 1,
          remainingFiles: 0,
          isPartial: false,
          hasPreparedChanges: false,
          counts: dirtyStatus.counts,
          files: [],
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );
    await screen.findByRole("heading", { name: restoredProject.name });

    // The band's active tile is the action, once both sides have been read.
    await userEvent.click(await screen.findByRole("button", { name: "Save version" }));

    // The dialog opens here, and Overview stays the screen: nothing was
    // navigated, and the planner was asked to save everything.
    expect(await screen.findByRole("dialog", { name: "Save version" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: restoredProject.name })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Changes" })).toBeNull();
    expect(mockedInvoke).toHaveBeenCalledWith("plan_save_version", {
      path: restoredProject.path,
      sessionEpoch: restoredProject.sessionEpoch,
      selectedPaths: null,
    });
  });

  it("restores a discard from Overview, and stays there when nothing was restored", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    const record = {
      recoveryId: "discard-1", createdAtMs: Date.now() - 60_000, fileCount: 1, selectedPath: null,
      previewPaths: ["gone.txt"], stateToken: "token-1", availability: "restorable" as const,
      restoresPreparedState: true,
    };

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "list_discard_recoveries") return Promise.resolve([record]);
      if (command === "get_discard_recovery") return Promise.resolve(record);
      if (command === "restore_discarded_changes") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );
    await screen.findByRole("heading", { name: restoredProject.name });
    await screen.findByText("Discarded changes", undefined, { timeout: 5000 });

    // The picker opens over Overview; closing it without restoring leaves
    // Overview where it was.
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    const picker = await screen.findByRole("dialog", { name: "Restore discarded changes" });
    expect(await within(picker).findByText("gone.txt")).toBeInTheDocument();
    await userEvent.click(within(picker).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Restore discarded changes" })).toBeNull());
    expect(screen.getByRole("heading", { name: restoredProject.name })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Changes" })).toBeNull();

    // A restore moves on to Changes, which says what came back.
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    const again = await screen.findByRole("dialog", { name: "Restore discarded changes" });
    await within(again).findByText("gone.txt");
    await userEvent.click(within(again).getByRole("button", { name: "Restore" }));
    expect(await screen.findByRole("heading", { name: "Changes" }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("1 file restored.", undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("restore_discarded_changes", {
      path: restoredProject.path,
      sessionEpoch: restoredProject.sessionEpoch,
      recoveryId: "discard-1",
      stateToken: "token-1",
    });
  });

  it("closing the active project goes Home without moving into another open project", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-confirm-close-project", "false");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path, secondProject.path], activeId: restoredProject.path }),
    );
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") {
        return Promise.resolve(invokedPath(args) === secondProject.path ? secondProject : restoredProject);
      }
      if (command === "close_project_session") return Promise.resolve();
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });

    await user.click(screen.getByRole("button", { name: new RegExp(`^${restoredProject.name} — switch project`) }));
    await user.click(screen.getByRole("button", { name: `Close ${restoredProject.name}` }));

    // Home, with no project active: the other one is still open, but the
    // reader picks it rather than being moved into it.
    expect(await screen.findByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: secondProject.name })).toBeNull();
    expect(JSON.parse(localStorage.getItem("gitodile-projects") ?? "{}").activeId).toBeNull();
  });

  it("rejects an old branch response after the same project is closed and reopened", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-confirm-close-project", "false");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    mockedOpenFolderDialog.mockResolvedValue(restoredProject.path);

    const staleBranches = {
      ...branches,
      branches: [
        ...branches.branches,
        {
          name: "stale/old-session",
          tip: {
            commit: "old789",
            shortCommit: "old789a",
            subject: "old session",
            committedAt: "2026-06-01T00:00:00Z",
          },
          isActive: false,
          upstream: null,
          isRetainedElsewhere: false,
          isFinished: false,
          uniqueCommitCount: 1,
          worktreePath: null,
        },
      ],
      totalCount: 3,
    };
    const freshBranches = {
      ...branches,
      branches: [
        ...branches.branches,
        {
          name: "fresh/reopened-session",
          tip: {
            commit: "new789",
            shortCommit: "new789a",
            subject: "new session",
            committedAt: "2026-08-01T00:00:00Z",
          },
          isActive: false,
          upstream: null,
          isRetainedElsewhere: false,
          isFinished: false,
          uniqueCommitCount: 1,
          worktreePath: null,
        },
      ],
      totalCount: 3,
    };
    let resolveOldRequest: ((snapshot: typeof staleBranches) => void) | undefined;
    let resolveNewRequest: ((snapshot: typeof freshBranches) => void) | undefined;
    let branchesCallCount = 0;
    let openCallCount = 0;

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        openCallCount += 1;
        return Promise.resolve({
          ...restoredProject,
          sessionEpoch: openCallCount === 1 ? "old-epoch" : "new-epoch",
        });
      }
      if (command === "close_project_session") {
        return Promise.resolve();
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        branchesCallCount += 1;
        return branchesCallCount === 1
          ? new Promise<typeof staleBranches>((resolve) => {
              resolveOldRequest = resolve;
            })
          : new Promise<typeof freshBranches>((resolve) => {
              resolveNewRequest = resolve;
            });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    await waitFor(
      () =>
        expect(
          mockedInvoke.mock.calls.filter(([command]) => command === "get_branches"),
        ).toHaveLength(1),
      { timeout: 3000 },
    );

    await userEvent.click(
      screen.getByRole("button", { name: new RegExp(`^${restoredProject.name} — switch project`) }),
    );
    await userEvent.click(screen.getByRole("button", { name: `Close ${restoredProject.name}` }));
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("close_project_session", {
        path: restoredProject.path,
        sessionEpoch: "old-epoch",
      }),
    );
    await userEvent.click(screen.getAllByRole("button", { name: "Open a project" })[0]);

    await waitFor(
      () =>
        expect(
          mockedInvoke.mock.calls.filter(([command]) => command === "get_branches"),
        ).toHaveLength(2),
      { timeout: 3000 },
    );

    resolveOldRequest?.(staleBranches);
    await userEvent.click(
      within(screen.getByRole("navigation", { name: "Project navigation" })).getByRole("button", {
        name: "Branches",
      }),
    );
    // By title: Branches quiets a name's prefix in a span of its own, and the
    // full name is the row's title.
    expect(screen.queryAllByTitle("stale/old-session")).toHaveLength(0);

    resolveNewRequest?.(freshBranches);
    expect(await screen.findAllByTitle("fresh/reopened-session")).not.toHaveLength(0);
    expect(screen.queryAllByTitle("stale/old-session")).toHaveLength(0);
  });

  it("reopens the status bar's branch menu from cache, with no spinner", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(restoredProject);
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        // Live working-tree updates (task 020). Answered so the watch
        // lifecycle stays a background no-op in these tests; the listener
        // itself is inert outside Tauri.
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        return Promise.resolve(branches);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    // The branch is switched from the status bar; Overview's header names
    // where the project lives instead.
    const trigger = screen.getByRole("button", { name: "Change branch (main)" });

    await userEvent.click(trigger);
    expect(await screen.findByRole("button", { name: "feature/spike" })).toBeInTheDocument();
    await userEvent.click(trigger);

    // The regression this guards: the menu used to refetch on every open and
    // blank itself to a spinner while it waited (task 019).
    await userEvent.click(trigger);
    expect(screen.getByRole("button", { name: "feature/spike" })).toBeInTheDocument();
  });

  it("names where the project lives in Overview's header once the project is active", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(restoredProject);
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        // Live working-tree updates (task 020). Answered so the watch
        // lifecycle stays a background no-op in these tests; the listener
        // itself is inert outside Tauri.
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        return Promise.resolve(branches);
      }
      if (command === "read_remote_home") {
        return Promise.resolve({ remote: "origin", provider: "github", label: "acme/app", hasWebPage: true });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    // Read on activation, not only after a config change: it must not stay
    // a loading shape.
    expect(await screen.findByRole("button", { name: "Open acme/app on GitHub" })).toBeInTheDocument();
  });

  it("replaces Overview's switch dialog instead of stacking a second one on top", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );

    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return Promise.resolve(restoredProject);
      }
      if (command === "read_working_tree_status") {
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "watch_repository") {
        return Promise.resolve(true);
      }
      if (command === "unwatch_repository") {
        return Promise.resolve();
      }
      if (command === "get_branches") {
        return Promise.resolve(branches);
      }
      if (command === "plan_switch_branch") {
        // Blocked by unsaved work: this is the state that offers the two
        // hand-offs ("Save version" / "New branch with these changes"),
        // and both used to leave this dialog mounted behind whatever they
        // opened next.
        return Promise.reject({
          code: "dirty_working_tree",
          message: "There are unsaved changes.",
          remediation: null,
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    await userEvent.click(within(screen.getByRole("contentinfo", { name: "Project status" })).getByRole(
      "button",
      { name: "Change branch (main)" },
    ));
    await userEvent.click(await screen.findByRole("button", { name: "feature/spike" }));

    await userEvent.click(await screen.findByRole("radio", { name: /Take them to a new branch/ }));
    await userEvent.click(screen.getByRole("button", { name: "New branch with these changes" }));

    // Exactly one dialog: the create dialog replaced the switch dialog
    // rather than rendering on top of it. Both are owned by App state, so
    // nothing else closes the first one.
    // Exactly one: the switch dialog dismisses itself before handing off, so
    // the create dialog replaces it instead of stacking on top. Both are
    // owned by App state, so nothing else would close the first one.
    await waitFor(() => expect(screen.getByLabelText("Name")).toBeInTheDocument());
    expect(document.querySelectorAll("[role=dialog]")).toHaveLength(1);
  });
});
