import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../i18n";
import { App } from "./App";
import type { RepositoryInfo } from "../features/repository";
import {
  installAppTestHooks,
  mockedInvoke,
  mockedOpenFolderDialog,
  invokedPath,
  restoredProject,
  cleanStatus,
  cachedTeamSync,
  freshBehindTeamSync,
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

describe("App home", () => {
  it("opens the eager clone flow from the empty state and command palette", async () => {
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

    await user.click(screen.getByRole("button", { name: "Clone a remote project" }));
    expect(screen.getByRole("dialog", { name: "Clone a project" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.keyboard("{Control>}k{/Control}");
    await user.click(screen.getByRole("combobox"));
    await user.paste("Clone a remote project");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Clone a project" })).toBeInTheDocument();
  });

  it("welcomes with three described entry points under a single heading", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    // The greeting is the only page heading: the shell no longer also titles
    // this screen "Overview" above it. Without a Git name it greets nobody in
    // particular rather than an empty name.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening)$/);
    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument();

    // The launcher field is where the cursor lands.
    expect(screen.getByRole("textbox", { name: "Find a project, or paste a path or URL" })).toHaveFocus();

    // The mascot greets here, not in the titlebar, and stays decorative.
    const welcomeMascot = document.querySelector(".home-launcher .gitodile-mascot");
    expect(welcomeMascot).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".window-titlebar .gitodile-mascot")).toBeNull();

    // Each hint has to stay a *description*: folded into the name instead, it
    // would break every "Open a project" lookup in the app.
    for (const [name, hint] of [
      ["Create a local project", "A new or existing folder"],
      ["Open a project", "A folder that uses Git"],
      ["Clone a remote project", "Download from a server"],
    ]) {
      expect(screen.getByRole("button", { name, description: hint })).toBeEnabled();
    }
  });

  it("offers recent projects on the welcome screen, opens one, and forgets one", async () => {
    localStorage.setItem(
      "gitodile-recent-projects",
      JSON.stringify({
        version: 1,
        entries: [
          { path: restoredProject.path, name: restoredProject.name },
          { path: secondProject.path, name: secondProject.name },
        ],
      }),
    );
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
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
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    // The path is the row's description, not part of its name: two projects
    // can share a folder name, and the name alone has to stay the label.
    const recent = screen.getByRole("button", {
      name: secondProject.name,
      description: secondProject.path,
    });
    expect(recent).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `Remove ${secondProject.name} from recent projects` }));
    expect(screen.queryByRole("button", { name: secondProject.name })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("gitodile-recent-projects") ?? "{}")).toEqual({
      version: 1,
      entries: [{ path: restoredProject.path, name: restoredProject.name }],
    });

    // Opening a recent goes through the same open path as the folder picker —
    // no dialog, and the picker is never reached.
    await user.click(screen.getByRole("button", { name: restoredProject.name }));
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("open_repository", {
        path: restoredProject.path,
        sessionEpoch: undefined,
      }),
    );
    expect(mockedOpenFolderDialog).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("heading", { level: 1, name: /^Good / })).not.toBeInTheDocument(),
    );
  });

  it("fills in Home's accounts once the launch check lands, instead of showing none", async () => {
    localStorage.setItem(
      "gitodile-recent-projects",
      JSON.stringify({ version: 1, entries: [{ path: restoredProject.path, name: restoredProject.name }] }),
    );
    const providers = [{ id: "github", host: "github.com", kind: "github", builtIn: true }];
    const account = { id: "github:martinezelx", provider: "github", host: "github.com", login: "martinezelx", avatarDataUrl: null };
    let reads = 0;
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.55.0.windows.3" });
      if (command === "get_git_identity") return Promise.resolve({ name: "Luis", email: "luis@example.com" });
      if (command === "get_account_catalog") {
        reads += 1;
        // First read: the launch check is scheduled and the saved connection
        // is not verified yet. Second: the check has landed.
        return Promise.resolve(
          reads === 1
            ? { providers, accounts: [{ ...account, available: false }], busy: true }
            : { providers, accounts: [{ ...account, available: true }], busy: false },
        );
      }
      return Promise.resolve(undefined);
    });
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    const status = await screen.findByRole("group", { name: "This computer" });
    // Unknown, not "none": no premature invitation to connect an account.
    expect(within(status).queryByRole("button", { name: "Connect an account" })).not.toBeInTheDocument();

    // The tab row holds a place while the check runs, then the tab lands in it.
    const tabs = screen.getByRole("group", { name: "Show" });
    expect(await within(tabs).findByRole("button", { name: "GitHub" }, { timeout: 3000 })).toBeInTheDocument();
    expect(tabs.querySelector(".home-launcher__tab--placeholder")).toBeNull();
    expect(reads).toBeGreaterThanOrEqual(2);
  });

  it("lists favourite recents in their own tab, sharing the switcher's own store", async () => {
    localStorage.setItem(
      "gitodile-recent-projects",
      JSON.stringify({
        version: 1,
        entries: [
          { path: secondProject.path, name: secondProject.name },
          { path: restoredProject.path, name: restoredProject.name },
        ],
      }),
    );
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    // Newest first: the newest project leads as Continue, the next is listed.
    expect(screen.getByRole("button", { name: secondProject.name })).toHaveClass("home-launcher__continue");
    // No Favorites tab until there is a favourite. (Other tabs, such as a
    // connected account's, may already be there.)
    expect(screen.queryByRole("button", { name: "Favorites" })).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: `Add ${restoredProject.name} to favorites` }),
    );

    // The mark is the app's own project favourite, not a row-local flag.
    expect(JSON.parse(localStorage.getItem("gitodile-favourite-projects") ?? "[]")).toEqual([
      restoredProject.path,
    ]);
    const star = screen.getByRole("button", {
      name: `Remove ${restoredProject.name} from favorites`,
    });
    expect(star).toHaveAttribute("aria-pressed", "true");

    // With a favourite, the launcher offers a Favorites tab beside Recent;
    // there only favourites are listed. A view, not a setting: nothing is stored.
    const tabs = screen.getByRole("group", { name: "Show" });
    await user.click(within(tabs).getByRole("button", { name: "Favorites" }));
    expect(within(tabs).getByRole("button", { name: "Favorites" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: secondProject.name })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: restoredProject.name })).toBeInTheDocument();
    await user.click(within(tabs).getByRole("button", { name: "Recent" }));
    expect(screen.getByRole("button", { name: secondProject.name })).toBeInTheDocument();
  });

  it("remembers a project it opened, newest first", async () => {
    mockedOpenFolderDialog.mockResolvedValue(secondProject.path);
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      if (command === "open_repository") return Promise.resolve(secondProject);
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") {
        return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      }
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    localStorage.setItem(
      "gitodile-recent-projects",
      JSON.stringify({ version: 1, entries: [{ path: restoredProject.path, name: restoredProject.name }] }),
    );
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await userEvent.click(screen.getAllByRole("button", { name: "Open a project" }).at(-1)!);

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("gitodile-recent-projects") ?? "{}")).toEqual({
        version: 1,
        entries: [
          { path: secondProject.path, name: secondProject.name, openedAt: expect.any(Number) },
          { path: restoredProject.path, name: restoredProject.name },
        ],
      }),
    );
  });

  it("opens the eager local-creation flow from the empty state", async () => {
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

    await user.click(screen.getByRole("button", { name: "Create a local project" }));
    expect(screen.getByRole("dialog", { name: "Create a project" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Location")).toHaveFocus());
  });

  it("offers contextual initialization when an opened folder is not a repository", async () => {
    mockedOpenFolderDialog.mockResolvedValue("C:\\ordinary folder");
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "get_git_identity") {
        return Promise.resolve({ name: "", email: "" });
      }
      if (command === "open_repository") {
        return Promise.reject({
          code: "not_repository",
          message: "This folder is not a Git repository.",
          remediation: "Choose a repository.",
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <App />
      </LanguageProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: "Open a project" }).at(-1)!);

    // The message names two ways out and the dialog offers both: choosing
    // another folder steps down to secondary, turning this one into a project
    // is the primary. The alert describes itself through its message rather
    // than announcing it a second time as a live region.
    const alert = await screen.findByRole("alertdialog", { name: "Couldn't open that project" });
    expect(alert).toHaveAccessibleDescription(/doesn't use Git yet/);
    const recovery = within(alert).getByRole("button", { name: "Turn into a project" });
    expect(recovery).toHaveClass("primary-button");
    expect(within(alert).getByRole("button", { name: "Choose another folder" })).toHaveClass("secondary-button");

    await user.click(recovery);
    expect(screen.getByRole("dialog", { name: "Create a project" })).toBeInTheDocument();
    expect(screen.getByLabelText("Folder")).toHaveValue("C:\\ordinary folder");
  });

  // The shell owns both persisted activation and the restored Home/Overview
  // destination, so this wiring cannot be proved by the session reducer alone.
  it.each([restoredProject.path, null])("preserves stored activation %s through startup revalidation", async (activeId) => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem(
      "gitodile-projects",
      JSON.stringify({
        version: 1,
        order: [restoredProject.path],
        activeId,
      }),
    );

    let resolveOpen: ((project: RepositoryInfo) => void) | undefined;
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") {
        return Promise.resolve({ state: "available", version: "2.50.0" });
      }
      if (command === "open_repository") {
        return new Promise<RepositoryInfo>((resolve) => {
          resolveOpen = resolve;
        });
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

    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("open_repository", {
        path: restoredProject.path,
      }),
    );
    expect(JSON.parse(localStorage.getItem("gitodile-projects") ?? "{}")).toEqual({
      version: 1,
      order: [restoredProject.path],
      activeId,
    });
    // Overview is already the destination: while revalidation runs it stays a
    // placeholder in its own shape rather than flashing the launcher.
    expect(document.querySelector(".empty-state--welcome")).toBeNull();
    expect(screen.getByText("Opening project…").closest('[role="status"]')).toHaveAttribute("aria-busy", "true");

    resolveOpen?.(restoredProject);
    if (activeId === null) {
      expect(await screen.findByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: restoredProject.name })).toBeNull();
    } else {
      expect(await screen.findByRole("heading", { name: restoredProject.name })).toBeInTheDocument();
    }
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("gitodile-projects") ?? "{}")).toEqual({
        version: 1,
        order: [restoredProject.path],
        activeId,
      }),
    );
  });

  it("visits Home with a project open, preserves its status through Back and Forward, and filters recents", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({
      version: 1, order: [restoredProject.path], activeId: restoredProject.path,
    }));
    localStorage.setItem("gitodile-recent-projects", JSON.stringify({
      version: 1,
      entries: [
        { path: restoredProject.path, name: restoredProject.name },
        { path: secondProject.path, name: secondProject.name },
      ],
    }));
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "check_team_changes") return Promise.resolve(freshBehindTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Home" }));
    expect(screen.getByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Project navigation" })).queryByRole("button", { current: "page" })).toBeNull();
    expect(screen.getByRole("button", { name: secondProject.name })).toBeInTheDocument();
    // The open project stays in Home's list and says so (task 184).
    const openRow = screen.getByRole("button", { name: restoredProject.name });
    expect(within(openRow).getByText("Open now")).toBeInTheDocument();
    expect(openRow.closest(".home-launcher__item")).toHaveClass("home-launcher__item--active");
    // Home ends in its own status line (ADR 0032): no project strip, and the
    // palette deploys from the field in that branch instead.
    expect(screen.queryByRole("contentinfo", { name: "Project status" })).toBeNull();
    expect(within(screen.getByRole("group", { name: "This computer" })).getByRole("combobox", { name: "Open command palette" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("gitodile-projects") ?? "{}").activeId).toBe(restoredProject.path);

    await user.click(screen.getAllByRole("button", { name: "Go back" })[0]);
    expect(screen.getByRole("heading", { name: restoredProject.name })).toBeInTheDocument();
    // Back on the project, the strip is the sheet's foot again, its status kept.
    const statusBar = screen.getByRole("contentinfo", { name: "Project status" });
    expect(within(statusBar).getByText(restoredProject.name)).toBeInTheDocument();
    expect(within(statusBar).getByText("main")).toBeInTheDocument();
    expect(within(statusBar).getByText("Everything is saved")).toBeInTheDocument();
    expect(await within(statusBar).findByText("Up to date")).toBeInTheDocument();
    await user.click(within(statusBar).getByRole("button", { name: "Check remote project changes" }));
    expect(await within(statusBar).findByRole("button", { name: "Get 1 version" })).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("check_team_changes", {
      path: restoredProject.path,
      sessionEpoch: restoredProject.sessionEpoch,
    });
    await user.click(screen.getAllByRole("button", { name: "Go forward" })[0]);
    expect(screen.getByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
    expect(document.querySelector(".home-launcher .gitodile-mascot")).toHaveClass("gitodile-mascot--blink");
    expect(document.querySelector(".home-launcher .gitodile-mascot")).not.toHaveClass("gitodile-mascot--enter");
    // The project is still open and active on Home: Back returns to it.
    await user.click(screen.getAllByRole("button", { name: "Go back" })[0]);
    expect(screen.getByRole("heading", { name: restoredProject.name })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Home" }));
    await user.click(screen.getAllByRole("button", { name: "Work" })[0]);
    expect(screen.queryByRole("heading", { level: 1, name: /^Good / })).not.toBeInTheDocument();
    expect(within(screen.getByRole("contentinfo", { name: "Project status" })).getByText(restoredProject.name)).toBeInTheDocument();
  });

  it("offers Home from the palette while a project is open", async () => {
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({
      version: 1, order: [restoredProject.path], activeId: restoredProject.path,
    }));
    mockedInvoke.mockImplementation((command) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "open_repository") return Promise.resolve(restoredProject);
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
    await user.click(screen.getByRole("combobox", { name: "Open command palette" }));
    const palette = screen.getByRole("listbox", { name: "Command palette" });
    expect(within(palette).getAllByRole("option")[0]).toHaveTextContent("Go to Home");
    expect(within(palette).getByText("Go to Home")).toBeInTheDocument();
    await user.click(within(palette).getByText("Go to Home"));
    expect(screen.getByRole("heading", { level: 1, name: /^Good / })).toBeInTheDocument();
  });

  it("keeps a project open when a recent project fails to open from Inicio", async () => {
    localStorage.setItem("gitodile-language", "es");
    localStorage.setItem("gitodile-reopen-last-project", "true");
    localStorage.setItem("gitodile-projects", JSON.stringify({
      version: 1, order: [restoredProject.path], activeId: restoredProject.path,
    }));
    localStorage.setItem("gitodile-recent-projects", JSON.stringify({
      version: 1, entries: [{ path: secondProject.path, name: secondProject.name }],
    }));
    let rejectRecent!: (reason: unknown) => void;
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "git_diagnostics") return Promise.resolve({ state: "available", version: "2.50.0" });
      if (command === "get_git_identity") return Promise.resolve({ name: "", email: "" });
      if (command === "open_repository") {
        return invokedPath(args) === secondProject.path
          ? new Promise((_resolve, reject) => { rejectRecent = reject; })
          : Promise.resolve(restoredProject);
      }
      if (command === "read_project_technology") return Promise.resolve({ technology: null });
      if (command === "read_working_tree_status") return Promise.resolve(cleanStatus);
      if (command === "list_unpublished_versions") return Promise.resolve({ totalCount: 0, versions: [], isTruncated: false });
      if (command === "read_team_sync_status") return Promise.resolve(cachedTeamSync);
      if (command === "get_branches") return Promise.resolve(branches);
      if (command === "watch_repository") return Promise.resolve(true);
      if (command === "unwatch_repository") return Promise.resolve();
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await screen.findByRole("heading", { name: restoredProject.name });
    await user.click(screen.getByRole("button", { name: "Más acciones" }));
    await user.click(screen.getByRole("menuitem", { name: "Inicio" }));
    expect(screen.getByRole("heading", { level: 1, name: /^Buen/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: secondProject.name }));
    expect(screen.getByRole("button", { name: "Abriendo…" })).toBeDisabled();
    rejectRecent({ code: "repository_not_found", message: "Folder moved.", remediation: null });
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /^Buen/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("gitodile-projects") ?? "{}").activeId).toBe(restoredProject.path);
  });
});
