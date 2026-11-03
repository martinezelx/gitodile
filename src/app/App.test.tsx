import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LanguageProvider } from "../i18n";
import { App } from "./App";
import {
  installAppTestHooks,
  mockedInvoke,
  restoredProject,
  cleanStatus,
  cachedTeamSync,
  freshBehindTeamSync,
  divergedTeamSync,
  getTeamPlan,
  branches,
  railButton,
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
// turns it on and drives the menu through the fake port.
vi.mock("./nativeAppMenu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./nativeAppMenu")>()),
  hasNativeMacWindowChrome: vi.fn(() => false),
}));
vi.mock("./nativeAppMenuAdapter", () => ({
  nativeAppMenuPort: { install: vi.fn(async () => ({ update: vi.fn(async () => undefined) })) },
}));

installAppTestHooks();

describe("App on macOS", () => {
  it("leaves window controls and the overflow menu to macOS and runs menu bar entries", async () => {
    const { hasNativeMacWindowChrome } = await import("./nativeAppMenu");
    const { nativeAppMenuPort } = await import("./nativeAppMenuAdapter");
    vi.mocked(hasNativeMacWindowChrome).mockReturnValue(true);
    mockedInvoke.mockImplementation(() => Promise.reject(new Error("No project open")));
    try {
      render(<LanguageProvider><App /></LanguageProvider>);

      expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Minimize window" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Close window" })).toBeNull();
      expect(document.querySelector(".app-window")).toHaveClass("app-window--mac-traffic-lights");

      const install = vi.mocked(nativeAppMenuPort.install);
      await waitFor(() => expect(install).toHaveBeenCalled());
      const [sections, onCommand] = install.mock.calls[0];
      expect(sections.map((section) => section.text)).toEqual(["GitOdile", "File", "Edit", "View", "Window", "Help"]);

      act(() => onCommand("keyboard-shortcuts"));
      expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();

      // The menu may trail the app by a render: an entry clicked while a
      // dialog owns the screen does nothing, as its shortcut would.
      act(() => onCommand("about"));
      // The shortcut sheet borrows `.about-dialog`; About's own hero does not.
      expect(document.querySelector(".about-dialog__hero")).toBeNull();
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
    } finally {
      vi.mocked(hasNativeMacWindowChrome).mockReturnValue(false);
    }
  });
});

describe("App shell", () => {
  it("keeps the issue error as the only focus trap when a palette shortcut is pressed", async () => {
    const user = userEvent.setup();
    vi.mocked(openUrl).mockRejectedValue(new Error("browser unavailable"));
    mockedInvoke.mockImplementation((command) => command === "render_diagnostic_report"
      ? Promise.resolve("Environment\n-----------\nGitOdile test\n\nSession activity\n----------------\nNo activity has been recorded in this session.")
      : Promise.resolve(undefined));
    render(<LanguageProvider><App /></LanguageProvider>);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Report an issue" }));
    await user.click(await screen.findByRole("button", { name: "Copy and open GitHub" }));
    expect(await screen.findByRole("alertdialog")).toHaveAccessibleName("The browser didn't open");
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("opens a Spanish report with the Git diagnostics supplied by the composition root", async () => {
    const user = userEvent.setup();
    localStorage.setItem("gitodile-language", "es");
    vi.mocked(openUrl).mockResolvedValue(undefined);
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "render_diagnostic_report") {
        return Promise.resolve("Environment\n-----------\nGitOdile test\nGit: 2.50.0\n\nSession activity\n----------------\nNo activity has been recorded in this session.");
      }
      return Promise.reject(new Error("No project open"));
    });

    render(<LanguageProvider><App /></LanguageProvider>);
    await user.click(screen.getByRole("button", { name: "Más acciones" }));
    await user.click(screen.getByRole("menuitem", { name: "Reportar un problema" }));
    await user.click(await screen.findByRole("button", { name: "Copiar y abrir GitHub" }));

    expect(openUrl).toHaveBeenCalledOnce();
    const url = new URL(vi.mocked(openUrl).mock.calls[0][0]);
    expect(url.pathname).toBe("/martinezelx/gitodile/issues/new");
    expect(url.searchParams.get("template")).toBe("bug-es.yml");
    expect(url.searchParams.get("diagnostics")).toContain("Git: 2.50.0");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  /** A restored project with a clean tree and a remote one version ahead. */
  function restoreProjectWithStatusBar(): void {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "check_team_changes") return Promise.resolve(freshBehindTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
  }

  it("wires the status bar to the active project and its remote check", async () => {
    restoreProjectWithStatusBar();
    render(<LanguageProvider><App /></LanguageProvider>);

    const statusBar = await screen.findByRole("contentinfo", { name: "Project status" });
    expect(within(statusBar).getByText("main")).toBeInTheDocument();
    expect(within(statusBar).getByText("Everything is saved")).toBeInTheDocument();
    expect(await within(statusBar).findByText("Up to date")).toBeInTheDocument();
    expect(within(statusBar).getByText("Up to date").closest(".status-bar__sync")).toHaveAttribute(
      "data-tooltip",
      expect.stringContaining("Local snapshot"),
    );

    await userEvent.click(within(statusBar).getByRole("button", { name: "Check remote project changes" }));
    expect(await within(statusBar).findByRole("button", { name: "Get 1 version" })).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("check_team_changes", {
      path: restoredProject.path,
      sessionEpoch: restoredProject.sessionEpoch,
    });

    await userEvent.keyboard("{Control>}k{/Control}");
    const palette = screen.getByRole("listbox", { name: "Command palette" });
    expect(within(palette).getByText("Check local changes")).toBeInTheDocument();
    expect(within(palette).getByText("Check remote project changes")).toBeInTheDocument();
    expect(within(palette).getByText("Check for updates")).toBeInTheDocument();
    await userEvent.click(within(palette).getByText("Check for updates"));
    // The check opens Settings › Updates, the update's one home, not a modal.
    const settings = await screen.findByRole("dialog", { name: "Settings" });
    expect(await within(settings).findByRole("switch", { name: "Check for updates automatically" })).toBeInTheDocument();
  });

  // Exercises real shell coordination, lazy resolver mounting and refresh;
  // a feature mock would not prove that the returned session survives handoff.
  it("adopts Get's verified upstream pause before opening the existing resolver", async () => {
    restoreProjectWithStatusBar();
    const base = mockedInvoke.getMockImplementation()!;
    const forecast = { ...getTeamPlan.forecast, outcome: "overlap" as const, integration: "merge" as const, localCount: 1, overlaps: [{ path: "lines.txt", side: "saved" as const }], overlapCount: 1 };
    const session: import("../features/conflicts").ConflictSession = {
      sessionId: "upstream-pause", stateToken: "verified", origin: "gitodile",
      operation: { kind: "merge", supported: true, unsupportedReason: null, step: null,
        current: { name: "main", commit: getTeamPlan.localCommit }, incoming: { name: "origin/main", commit: getTeamPlan.remoteCommit },
        operationHeads: [getTeamPlan.remoteCommit], continueCommand: "git merge --continue", abortCommand: "git merge --abort" },
      files: [{ path: "lines.txt", pathIsExact: true, shape: "both-changed", facets: [], base: null, current: null, incoming: null, working: "file", state: "unresolved", kept: null, allowedActions: [] }],
      unresolvedCount: 1, listingComplete: true, snapshot: null, allowedActions: ["abort-merge"],
    };
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_team_sync_status" || command === "check_team_changes") return Promise.resolve({ ...freshBehindTeamSync, state: "diverged", ahead: 1, forecast });
      if (command === "plan_get_team_changes") return Promise.resolve({ ...getTeamPlan, integration: "merge", localCount: 1, forecast });
      if (command === "start_overlapping_merge") return Promise.resolve({ session, recovery: {} });
      // Any coordinated follow-up read is held: arrival must render the
      // session from start_overlapping_merge, without waiting for another read.
      if (command === "read_conflict_session") return new Promise(() => undefined);
      return base(command, args);
    });
    render(<LanguageProvider><App /></LanguageProvider>);
    const statusBar = await screen.findByRole("contentinfo", { name: "Project status" });
    await userEvent.click(await within(statusBar).findByRole("button", { name: "Get and publish" }));
    await userEvent.click(await screen.findByRole("button", { name: "Resolve in GitOdile" }));
    expect(await screen.findByRole("heading", { name: "Overlapping changes" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /lines.txt/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockedInvoke).toHaveBeenCalledWith("start_overlapping_merge", {
      path: restoredProject.path, sessionEpoch: restoredProject.sessionEpoch, source: { kind: "upstream" }, stateToken: getTeamPlan.stateToken, recoveryReference: getTeamPlan.recovery.reference,
    });
    expect(mockedInvoke.mock.calls.some(([command]) => ["plan_publish", "publish", "get_team_changes", "plan_bring_in_changes"].includes(String(command)))).toBe(false);
  });

  it("opens About from the overflow menu and its release notes in Settings, not the status bar", async () => {
    restoreProjectWithStatusBar();
    render(<LanguageProvider><App /></LanguageProvider>);
    const statusBar = await screen.findByRole("contentinfo", { name: "Project status" });

    // The strip carries no version, and the titlebar carries no mark, so
    // About opens from the overflow menu.
    expect(within(statusBar).queryByRole("button", { name: /What's new/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "About" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "About GitOdile" }));
    const about = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });

    // Its What's new leads to the one changelog, in Settings › Updates.
    await userEvent.click(within(about).getByRole("button", { name: "What's new" }));
    expect(screen.queryByRole("dialog", { name: "GitOdile See everything. Undo anything." })).toBeNull();
    const settings = await screen.findByRole("dialog", { name: "Settings" });
    const whatsNew = await within(settings).findByRole("region", { name: "What's new" });
    expect(within(whatsNew).getByRole("heading", { name: __APP_VERSION__ })).toBeInTheDocument();
    expect(within(whatsNew).getByText("Your version")).toBeInTheDocument();
  });

  it("records both outcomes of an automatic check, and offers the review flow from the notification", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-remote-check-interval", "1");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "check_team_changes") return Promise.resolve(freshBehindTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "plan_get_team_changes") return Promise.resolve(getTeamPlan);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    // Fake timers must be installed before the render: the cadence registers
    // its interval from a mount effect, and an interval created against the
    // real clock cannot be advanced afterwards.
    //
    // They also rule out Testing Library's async helpers for the rest of the
    // test — `waitFor` only advances *jest* fake timers, so under vitest's it
    // waits on a clock nobody is moving. Hence the explicit settle loop and
    // `fireEvent` instead of `userEvent`.
    vi.useFakeTimers();
    try {
      const settle = async (ms = 0): Promise<void> => {
        await vi.advanceTimersByTimeAsync(ms);
        await vi.advanceTimersByTimeAsync(0);
      };
      render(<LanguageProvider><App /></LanguageProvider>);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (screen.queryByRole("contentinfo", { name: "Project status" })) break;
        await settle(25);
      }
      expect(screen.getByRole("contentinfo", { name: "Project status" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();

      // The cadence, not a press: this is the only check nobody is watching,
      // and therefore the only one worth putting in an inbox.
      await settle(60_000);
      const unreadBell = screen.getByRole("button", { name: "Notifications, 1 unread" });

      fireEvent.click(unreadBell);
      const panel = screen.getByRole("dialog", { name: "Notifications" });
      expect(within(panel).getByText("1 newer version is available")).toBeInTheDocument();
      // Opening the inbox is not acknowledgment.
      expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();

      fireEvent.click(within(panel).getByRole("button", { name: "Review and get" }));
      expect(screen.queryByRole("dialog", { name: "Notifications" })).not.toBeInTheDocument();
      await settle(50);
      expect(screen.getByRole("dialog", { name: "Get 1 version from origin" })).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      await settle(50);

      // The other half of the same cadence: a check that could not reach the
      // remote is the outcome most likely to be erased by the next successful
      // one, so it is exactly what an inbox is for.
      mockedInvoke.mockImplementation((command) => {
        if (command === "check_team_changes") return Promise.reject(new Error("host unreachable"));
        if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
        if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
        if (command === "list_unpublished_versions") {
          return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
        }
        if (command === "get_branches") return Promise.resolve(branches);
        if (command === "watch_repository") return Promise.resolve(true);
        if (command === "unwatch_repository") return Promise.resolve();
        return Promise.reject(new Error(`Unexpected command: ${command}`));
      });
      await settle(60_000);

      fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
      const afterFailure = screen.getByRole("dialog", { name: "Notifications" });
      expect(
        within(afterFailure).getByText("Couldn't check for project changes"),
      ).toBeInTheDocument();
      expect(within(afterFailure).getAllByRole("listitem")).toHaveLength(2);
      fireEvent.click(within(afterFailure).getByRole("button", { name: "Mark all as read" }));
      fireEvent.keyDown(document, { key: "Escape" });
      await settle(50);

      // A diverged upstream with no forecast: nothing says what getting would
      // do, so nothing is recorded rather than handing someone a button that
      // declines.
      mockedInvoke.mockImplementation((command) => {
        if (command === "check_team_changes") return Promise.resolve(divergedTeamSync);
        if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
        if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
        if (command === "list_unpublished_versions") {
          return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
        }
        if (command === "get_branches") return Promise.resolve(branches);
        if (command === "watch_repository") return Promise.resolve(true);
        if (command === "unwatch_repository") return Promise.resolve();
        return Promise.reject(new Error(`Unexpected command: ${command}`));
      });
      await settle(60_000);

      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
      const afterDiverged = screen.getByRole("dialog", { name: "Notifications" });
      expect(within(afterDiverged).getAllByRole("listitem")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the notification bell beside the window controls and records nothing for a manual check", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "check_team_changes") return Promise.resolve(freshBehindTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(<LanguageProvider><App /></LanguageProvider>);

    const statusBar = await screen.findByRole("contentinfo", { name: "Project status" });
    const bell = screen.getByRole("button", { name: "Notifications" });
    const windowControls = document.querySelector(".window-controls");
    expect(windowControls).not.toBeNull();
    // Placement is the requirement, not just presence: the bell is the last
    // thing before the operating system's own buttons.
    expect(
      bell.compareDocumentPosition(windowControls as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // A check the user pressed is answered by the status bar they were looking
    // at. Recording it as well would be reporting the news to its own author.
    await userEvent.click(
      within(statusBar).getByRole("button", { name: "Check remote project changes" }),
    );
    expect(await within(statusBar).findByRole("button", { name: "Get 1 version" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Notifications" }));
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("All caught up")).toBeInTheDocument();
  });

  it("opens the collapsed-rail jump menu on hover without taking the caret", async () => {
    localStorage.setItem("gitodile-sidebar-hidden", "true");
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") return Promise.resolve({ name: null, email: null });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(<LanguageProvider><App /></LanguageProvider>);
    const toggle = await screen.findByRole("button", { name: "Show sidebar" });
    toggle.focus();

    fireEvent.mouseEnter(toggle);

    // The menu is a pointer affordance: it opens on hover and closes itself
    // again on mouse-leave. Focusing it would move the caret because someone
    // moved the mouse, and then destroy the element holding it. Every other
    // flyout in the app opens from a click and does take focus.
    expect(await screen.findByRole("menu", { name: "Project navigation" })).toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("hands off the account popover before shell shortcuts and restores a live focus target", async () => {
    localStorage.setItem("gitodile-language", "en");
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    const account = screen.getByRole("button", { name: "Sign in · Account demo" });
    await user.click(account);
    expect(screen.getByRole("dialog", { name: "Your GitOdile account" })).toBeInTheDocument();
    await user.keyboard("{Control>},{/Control}");
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Your GitOdile account" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(account).toHaveFocus());
    await user.click(account);
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("listbox", { name: "Command palette" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Your GitOdile account" })).not.toBeInTheDocument();
  });

  it("runs the account demo from Settings with one modal focus owner and a shared session", async () => {
    localStorage.setItem("gitodile-language", "en");
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await user.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    const settings = screen.getByRole("dialog", { name: "Settings" });
    await user.click(within(settings).getByRole("tab", { name: "Account" }));
    await user.selectOptions(within(settings).getByLabelText("Demo result"), "waiting");
    const start = within(settings).getByRole("button", { name: "Try sign-in" });
    await user.click(start);
    expect(settings).toHaveAttribute("inert");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const waiting = screen.getByRole("dialog", { name: "Waiting for the browser…" });
    await user.keyboard("{Tab}");
    expect(waiting).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(settings).not.toHaveAttribute("inert");
    await waitFor(() => expect(start).toHaveFocus());
    expect(screen.getByRole("dialog", { name: "Settings" })).toBe(settings);
    await user.selectOptions(within(settings).getByLabelText("Demo result"), "pro");
    await user.click(start);
    await waitFor(() => expect(within(settings).getByText("Pro · Demo")).toBeVisible(), { timeout: 5000 });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("button", { name: "Luis Martinez · Account demo" })).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    await user.click(screen.getByRole("tab", { name: "Account" }));
    expect(screen.getByText("Pro · Demo")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    expect(screen.getByLabelText("Demo result")).toHaveValue("success");
    expect(screen.getByRole("button", { name: "Sign in · Account demo" })).toBeInTheDocument();
  }, 15000);

  it("opens Settings as a sectioned dialog without replacing the active screen", async () => {
    vi.stubEnv("DEV", false);
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    const trigger = screen.getAllByRole("button", { name: "Settings" })[0];
    expect(trigger).toHaveAttribute("data-tooltip", "Settings");
    const login = screen.getByRole("button", { name: "Sign in — coming soon" });
    expect(login).toHaveAttribute("aria-disabled", "true");
    expect(login).toHaveAttribute("data-tooltip", "Sign in — coming soon");
    expect(screen.getByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(within(dialog).queryByRole("tab", { name: "Account" })).toBeNull();
    // Synchronous on purpose: the panel is eager, so the dialog and its content
    // land in the same commit. Making the overlay lazy again would fail here
    // before it could reach the user as a fallback frame.
    expect(within(dialog).getByRole("tablist", { name: "Settings sections" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Startup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
    // Focus lands on the section rail, not on Close: Enter right after opening
    // should not shut the dialog the user just asked for.
    await waitFor(() => expect(within(dialog).getByRole("tab", { name: "General" })).toHaveFocus());

    await user.click(within(dialog).getByRole("tab", { name: "Language & region" }));
    expect(within(dialog).getByRole("heading", { name: "Language" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    expect(trigger).toHaveFocus();

    // Opening without naming a section starts at General every time, however
    // the last visit ended. Callers that want another one say so.
    await user.click(trigger);
    const reopened = screen.getByRole("dialog", { name: "Settings" });
    expect(within(reopened).getByRole("tab", { name: "General" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(reopened).getByRole("tab", { name: "Interface" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    await user.keyboard("{Escape}");

    // Ctrl/Cmd+, is the desktop convention for preferences, and lands on
    // General like every other plain opener.
    await user.keyboard("{Control>},{/Control}");
    expect(
      within(screen.getByRole("dialog", { name: "Settings" })).getByRole("tab", { name: "General" }),
    ).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");

    // …but never on top of another dialog: two focus traps would compete.
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByRole("listbox", { name: "Command palette" })).toBeInTheDocument();
    await user.keyboard("{Control>},{/Control}");
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    await user.keyboard("{Escape}");

    // A named palette entry still lands on its section rather than General.
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "Settings: Git");
    await user.keyboard("{Enter}");
    expect(
      within(screen.getByRole("dialog", { name: "Settings" })).getByRole("tab", { name: "Git" }),
    ).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("menuitem", { name: "Customize navigation bar" }));
    const navigationSettings = within(screen.getByRole("dialog", { name: "Settings" }));
    expect(navigationSettings.getByRole("tab", { name: "Navigation" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.click(navigationSettings.getByRole("switch", { name: "Show Work in the sidebar" }));
    await user.click(navigationSettings.getByRole("radio", { name: /Icons only/ }));
    await user.keyboard("{Escape}");

    const projectNavigation = screen.getByRole("navigation", { name: "Project navigation" });
    expect(projectNavigation).toHaveClass("rail-nav--icons-only");
    expect(within(projectNavigation).queryByRole("button", { name: "Work" })).toBeNull();
    await user.click(within(projectNavigation).getByRole("button", { name: "More" }));
    expect(
      within(screen.getByRole("menu", { name: "More" })).getByText(
        "Work — open a project first",
      ),
    )
      .toBeInTheDocument();
  });

  it("re-reads the open project once when watching is turned back on", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    // Launched with watching off, so the restored project is as stale as
    // whatever happened on disk while the app was closed.
    localStorage.setItem("gitodile-watch-projects", "false");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({ version: 1, order: [restoredProject.path], activeId: restoredProject.path }),
    );

    let statusReads = 0;
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      if (command === "open_repository") {
        return Promise.resolve(restoredProject);
      }
      if (command === "read_working_tree_status") {
        statusReads += 1;
        return Promise.resolve(cleanStatus);
      }
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "get_branches") {
        return Promise.resolve(branches);
      }
      if (command === "read_team_sync_status") {
        return Promise.resolve(cachedTeamSync);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: restoredProject.name });
    await waitFor(() => expect(statusReads).toBeGreaterThan(0));
    const readsBeforeToggle = statusReads;

    await userEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    await userEvent.click(screen.getByRole("switch", { name: "Keep project screens up to date" }));

    // Re-registering only catches what changes next, so turning it back on
    // has to close the gap itself — without the project being reopened.
    await waitFor(() => expect(statusReads).toBe(readsBeforeToggle + 1));
    expect(localStorage.getItem("gitodile-watch-projects")).toBe("true");
  });

  it("animates every theme change the same way", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    // jsdom has no view transitions, so the app would take its instant path and
    // this would assert nothing. The mode is read at capture time, which is the
    // only moment it is observable.
    const modes: Array<string | undefined> = [];
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (callback: () => void) => {
        callback();
        modes.push(document.documentElement.dataset.themeTransition);
        return { finished: Promise.resolve(), ready: Promise.resolve(), skipTransition: vi.fn() };
      },
    });

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    // The rail's toggle and Settings reach the same animation: the toggle's own
    // origin-anchored sweep was withdrawn, and "system" never had an origin.
    await user.click(railButton("Switch to dark theme"));
    await user.click(screen.getAllByRole("button", { name: "Settings" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await user.click(within(dialog).getByRole("tab", { name: "Interface" }));
    await user.click(within(dialog).getByRole("radio", { name: /GitOdile Light/ }));

    expect(modes).toEqual(["fade", "fade"]);

    // Re-picking the option already in effect must not snapshot the window to
    // cross-fade it into an identical frame.
    await user.click(within(dialog).getByRole("radio", { name: /GitOdile Light/ }));
    expect(modes).toEqual(["fade", "fade"]);

    Reflect.deleteProperty(document, "startViewTransition");
    delete document.documentElement.dataset.themeTransition;
  });

  // ADR 0015: a community theme has no official counterpart, so the toggle
  // hands control back to the device; from there it flips the official pair.
  it("sends a community theme back to the device, then flips the official pair", async () => {
    localStorage.setItem("gitodile-theme", "catppuccin-mocha");
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe("catppuccin-mocha"),
    );
    await user.click(railButton("Use system theme"));
    // "Match device" keeps no attribute, so the media query follows the device.
    await waitFor(() => expect(document.documentElement.dataset.theme).toBeUndefined());

    // With the device selected, the toggle flips the official pair. jsdom's
    // prefers-color-scheme is light, so the first flip is to the official dark.
    await user.click(railButton("Switch to dark theme"));
    expect(document.documentElement.dataset.theme).toBe("gitodile-dark");
    await user.click(railButton("Switch to light theme"));
    expect(document.documentElement.dataset.theme).toBe("gitodile-light");
  });
});
