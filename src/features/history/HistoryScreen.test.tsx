import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const TABS = <div role="tablist" aria-label="Changes or history" />;

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { createHistoryController } from "./controller";
import type { HistoryPage } from "./domain";
import { HistoryScreen } from "./HistoryScreen";
import type { HistoryPort } from "./port";

function emptyPage(token: string): HistoryPage {
  return {
    repositoryId: "/repo", snapshotToken: token, scope: { kind: "currentBranch" } as const, branch: "main", headState: "branch", headCommit: null,
    upstream: null, versions: [], nextCursor: null, hasMore: false, shallow: false, warnings: [],
  };
}

afterEach(cleanup);

describe("HistoryScreen lifecycle", () => {
  it("does not apply a delayed version link after its scope was superseded", async () => {
    let finishScope!: () => void;
    const pendingScope = new Promise<void>((resolve) => { finishScope = resolve; });
    const controller = createHistoryController({
      readPage: vi.fn(async () => emptyPage("token-1")), readDetail: vi.fn(), readFileDiff: vi.fn(), readFileMarkdown: vi.fn(), readImagePreview: vi.fn(),
    });
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    vi.spyOn(controller, "setScope").mockReturnValue(pendingScope);
    const selectVersion = vi.spyOn(controller, "selectVersion");
    render(<LanguageProvider><ScreenLifecycleProvider controller={createScreenLifecycleController("active")}>
      <HistoryScreen tabs={TABS} controller={controller} projectPath="/repo" sessionEpoch="epoch-1"
        watcherState="watching" scopeBranchIntent="feature/foo" selectCommitIntent="old-target" onOpenSettings={() => {}} />
    </ScreenLifecycleProvider></LanguageProvider>);
    act(() => controller.supersede(query));
    await act(async () => { finishScope(); await pendingScope; });
    expect(selectVersion).not.toHaveBeenCalled();
  });

  it("does not fetch on navigation and freezes announcements while hidden", async () => {
    const port: HistoryPort = {
      readPage: vi.fn(async () => emptyPage("unexpected")),
      readDetail: vi.fn(),
      readFileDiff: vi.fn(),
      readFileMarkdown: vi.fn(),
      readImagePreview: vi.fn(),
    };
    const controller = createHistoryController(port);
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    await controller.refresh(query);
    vi.mocked(port.readPage).mockClear();
    const lifecycle = createScreenLifecycleController("active");
    render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <HistoryScreen tabs={TABS} controller={controller} projectPath="/repo" sessionEpoch="epoch-1" watcherState="watching" onOpenSettings={() => {}} />
        </ScreenLifecycleProvider>
      </LanguageProvider>,
    );
    expect(screen.getByText("No saved versions yet")).toBeInTheDocument();
    expect(port.readPage).not.toHaveBeenCalled();

    act(() => lifecycle.transition("hidden"));
    act(() => controller.supersede(query));
    expect(port.readPage).not.toHaveBeenCalled();
    act(() => lifecycle.transition("active"));
    expect(screen.getByText("No saved versions yet")).toBeInTheDocument();
  });

  it("takes a branch another screen asked for once, and does not re-apply it on later renders", async () => {
    const port: HistoryPort = {
      readPage: vi.fn(async () => emptyPage("token-1")),
      readDetail: vi.fn(),
      readFileDiff: vi.fn(),
      readFileMarkdown: vi.fn(),
      readImagePreview: vi.fn(),
    };
    const controller = createHistoryController(port);
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    const setScope = vi.spyOn(controller, "setScope");
    const handled = vi.fn();
    const lifecycle = createScreenLifecycleController("active");

    function Screen({ intent }: { intent: string | null }): React.JSX.Element {
      return (
        <LanguageProvider>
          <ScreenLifecycleProvider controller={lifecycle}>
            <HistoryScreen
              tabs={TABS}
              controller={controller}
              projectPath="/repo"
              sessionEpoch="epoch-1"
              watcherState="watching"
              scopeBranchIntent={intent}
              onScopeBranchIntentHandled={handled}
              onOpenSettings={() => {}}
            />
          </ScreenLifecycleProvider>
        </LanguageProvider>
      );
    }

    const view = render(<Screen intent="feature/foo" />);
    expect(setScope).toHaveBeenCalledWith(query, { kind: "branch", name: "feature/foo" });
    expect(handled).toHaveBeenCalledOnce();

    // The composition root clears the intent as soon as it is taken. From here
    // on the reader owns the scope: re-rendering the screen — which
    // `KeepAliveScreens` does on every render of the app around it — must not
    // put the earlier target back.
    setScope.mockClear();
    view.rerender(<Screen intent={null} />);
    view.rerender(<Screen intent={null} />);
    expect(setScope).not.toHaveBeenCalled();
  });

  it("selects the version another screen asked for, after the scope it asked for is in", async () => {
    const port: HistoryPort = {
      readPage: vi.fn(async () => emptyPage("token-1")),
      readDetail: vi.fn(),
      readFileDiff: vi.fn(),
      readFileMarkdown: vi.fn(),
      readImagePreview: vi.fn(),
    };
    const controller = createHistoryController(port);
    const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
    const order: string[] = [];
    const setScope = vi.spyOn(controller, "setScope").mockImplementation(async () => {
      order.push("scope");
    });
    const selectVersion = vi.spyOn(controller, "selectVersion").mockImplementation(() => {
      order.push("select");
    });
    const scopeHandled = vi.fn();
    const commitHandled = vi.fn();
    const lifecycle = createScreenLifecycleController("active");

    render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <HistoryScreen
            tabs={TABS}
            controller={controller}
            projectPath="/repo"
            sessionEpoch="epoch-1"
            watcherState="watching"
            scopeBranchIntent="feature/foo"
            onScopeBranchIntentHandled={scopeHandled}
            selectCommitIntent="abc123"
            onSelectCommitIntentHandled={commitHandled}
            onOpenSettings={() => {}}
          />
        </ScreenLifecycleProvider>
      </LanguageProvider>,
    );

    expect(setScope).toHaveBeenCalledWith(query, { kind: "branch", name: "feature/foo" });
    // Setting the scope restarts the timeline, and a restarted timeline picks
    // its own selection when the first page lands. The asked-for version is
    // only the one that stays selected if it is chosen after that.
    await waitFor(() => expect(selectVersion).toHaveBeenCalledWith(query, "abc123"));
    expect(order).toEqual(["scope", "select"]);
    expect(scopeHandled).toHaveBeenCalledOnce();
    expect(commitHandled).toHaveBeenCalledOnce();
  });
});
