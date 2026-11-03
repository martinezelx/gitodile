import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import { LanguageProvider } from "../i18n";
import { DEFAULT_DIFF_PREFERENCES } from "../features/changes";
import { DEFAULT_CONSOLE_PREFERENCES } from "../features/console";
import { createProjectSettingsCache } from "../features/project-settings";
import { AppOverlays, type AppOverlaysProps } from "./AppOverlays";
import { describePlatform, formatDiagnostics, readSystemInfo, readWebviewVersion } from "./systemInfo";
import { describeStack, describeStackHost } from "./stack";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async () => undefined) }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
  Channel: class TestChannel<T> {
    onmessage?: (message: T) => void;
  },
}));
// Synchronous on purpose: that is what plugin-os actually exports for these
// three. Mocking them as promises hid a crash — the real functions throw when
// Tauri's global is missing, and the throw escapes any `.catch` chain.
vi.mock("@tauri-apps/plugin-os", () => ({
  locale: vi.fn(async () => "en-GB"),
  platform: vi.fn(() => "windows"),
  version: vi.fn(() => "10.0.26200"),
  arch: vi.fn(() => "x86_64"),
}));

beforeEach(() => {
  vi.mocked(openUrl).mockClear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  // Only the webview test defines one; deleting the own property hands the
  // getter back to `Navigator.prototype` so the next test reads jsdom's again.
  Reflect.deleteProperty(navigator, "userAgent");
});

const closedOverlay = { isOpen: false, setOpen: vi.fn() };

function buildProps(
  gitDiagnostics: AppOverlaysProps["settings"]["gitTooling"]["diagnostics"],
  appUpdates?: AppOverlaysProps["settings"]["appUpdates"],
): AppOverlaysProps {
  return {
    issueReport: {
      phase: "closed",
      isOpen: false,
      isOpening: false,
      reportText: null,
      includeActivity: true,
      title: "",
      failedUrl: null,
      copyReportState: "idle",
      saveState: "idle",
      copyLinkState: "idle",
      recopied: false,
      dismiss: vi.fn(),
      report: vi.fn(),
      continueToGitHub: vi.fn(),
      retry: vi.fn(),
      setIncludeActivity: vi.fn(),
      setTitle: vi.fn(),
      copyReport: vi.fn(),
      saveReport: vi.fn(),
      copyLink: vi.fn(),
    },
    settings: {
      glabTooling: { diagnostics: null, isRefreshingDiagnostics: false, updateStatus: null, isCheckingUpdate: false, refreshDiagnostics: vi.fn(), checkUpdate: vi.fn() },
      gitlabAuth: { snapshot: { state: "unchecked", account: null, operationId: null, needsCheck: false }, pending: false, check: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), cancel: vi.fn() },
      githubAuth: { snapshot: { state: "unchecked", account: null, accounts: [], operationId: null, deviceCode: null, verificationUrl: null, needsCheck: false, signedOutAccount: null }, pending: false, browserFailed: false, check: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), activate: vi.fn(), cancel: vi.fn(), openBrowser: vi.fn() },
      ...closedOverlay,
      theme: "system",
      setTheme: vi.fn(),
      reducedMotion: false,
      setReducedMotion: vi.fn(),
      section: "general",
      setSection: vi.fn(),
      ghTooling: {
        diagnostics: null, isRefreshingDiagnostics: false, updateStatus: null,
        isCheckingUpdate: false, refreshDiagnostics: vi.fn(), checkUpdate: vi.fn(),
      },
      gitTooling: {
        diagnostics: gitDiagnostics,
        updateStatus: null,
        checkUpdate: vi.fn(async () => undefined),
        isCheckingUpdate: false,
        refreshDiagnostics: vi.fn(async () => undefined),
        isRefreshingDiagnostics: false,
      },
      reopenLastProject: false,
      setReopenLastProject: vi.fn(),
      confirmCloseProject: true,
      setConfirmCloseProject: vi.fn(),
      watchProjects: true,
      setWatchProjects: vi.fn(),
      remoteCheckInterval: 0,
      setRemoteCheckInterval: vi.fn(),
      confirmDiscard: true,
      setConfirmDiscard: vi.fn(),
      notificationsEnabled: true,
      setNotificationsEnabled: vi.fn(),
      runGitHooks: false,
      setRunGitHooks: vi.fn(),
      navigationItems: [],
      defaultNavigationPreferences: {
        visibleDestinationIds: [],
        destinationOrderIds: [],
        displayMode: "icons-and-text",
      },
      navigationPreferences: {
        visibleDestinationIds: [],
        destinationOrderIds: [],
        displayMode: "icons-and-text",
      },
      setNavigationPreferences: vi.fn(),
      diffPreferences: DEFAULT_DIFF_PREFERENCES,
      setDiffPreferences: vi.fn(),
      consolePreferences: DEFAULT_CONSOLE_PREFERENCES,
      setConsolePreferences: vi.fn(),
      identity: {
        identity: { name: "", email: "" },
        isLoaded: true,
        isSaving: false,
        save: vi.fn(async () => undefined),
      },
      defaultBranch: {
        name: null,
        isLoaded: true,
        isSaving: false,
        save: vi.fn(async () => undefined),
      },
      lineEndings: { lineEndings: null, isSaving: false, choose: vi.fn(async () => undefined) },
      appUpdates,
    },
    projectSettings: {
      ...closedOverlay,
      project: null,
      section: "remote",
      setSection: vi.fn(),
      cache: createProjectSettingsCache(),
    },
    about: { isOpen: true, setOpen: vi.fn() },
    appUpdate: { isOpen: false, setOpen: vi.fn(), openUpdates: vi.fn() },
    shortcuts: closedOverlay,
    closeConfirmation: { ...closedOverlay, projectName: null, onConfirm: vi.fn() },
    error: { ...closedOverlay, title: "", message: null },
  };
}

function renderOverlays(
  options: { appUpdates?: AppOverlaysProps["settings"]["appUpdates"] } = {},
): AppOverlaysProps {
  const props = buildProps({ state: "available", version: "2.45.0" }, options.appUpdates);
  render(
    <LanguageProvider>
      <AppOverlays {...props} />
    </LanguageProvider>,
  );
  return props;
}

/** No OS bridge and no Git version: the state a plain browser run is in, and
 * the only one where the environment list has nothing at all to show. */
function renderOverlaysWithoutGit(): void {
  render(
    <LanguageProvider>
      <AppOverlays {...buildProps(null)} />
    </LanguageProvider>,
  );
}

describe("describePlatform", () => {
  it("reads the Windows release off the build, not the NT version", () => {
    // The whole reason the name and the version are separate rows: Windows 11
    // reports NT 10.0, so "Windows 10.0.26200" tells the user the wrong thing.
    const win11 = { platform: "windows", version: "10.0.26200", arch: "x86_64" };
    const win10 = { platform: "windows", version: "10.0.19045", arch: "x86_64" };
    expect(describePlatform(win11)).toBe("Windows 11");
    expect(describePlatform(win10)).toBe("Windows 10");
    expect(describePlatform({ platform: "windows", version: "6.1.7601", arch: "x86" })).toBe("Windows 7");
  });

  it("names macOS by its release and leaves Linux unversioned", () => {
    expect(describePlatform({ platform: "macos", version: "15.2", arch: "aarch64" })).toBe("macOS 15");
    // `version()` is the kernel on Linux and names no distribution, so it has
    // no business in a row labelled "System".
    expect(describePlatform({ platform: "linux", version: "6.8.0-45", arch: "x86_64" })).toBe("Linux");
  });

  it("falls back to the bare platform name when the version is unreadable", () => {
    expect(describePlatform({ platform: "windows", version: "not-a-version", arch: "x86_64" })).toBe("Windows");
    expect(describePlatform({ platform: "freebsd", version: "14.1", arch: "x86_64" })).toBe("freebsd");
  });
});

describe("formatDiagnostics", () => {
  it("builds a paste-ready block and omits what it does not know", () => {
    expect(
      formatDiagnostics({
        appVersion: "0.1.0",
        system: { platform: "windows", version: "10.0.26200", arch: "x86_64" },
        webview: "Chromium 140.0.0.0",
        gitVersion: "2.50.0",
      }),
    ).toBe(
      "GitOdile 0.1.0\nSystem: Windows 11 (x86_64)\nSystem version: 10.0.26200\n" +
        "Webview: Chromium 140.0.0.0\nGit: 2.50.0",
    );

    expect(
      formatDiagnostics({ appVersion: "0.1.0", system: null, webview: null, gitVersion: null }),
    ).toBe("GitOdile 0.1.0");
  });
});

describe("readWebviewVersion", () => {
  it("names the Chromium build behind WebView2", () => {
    expect(
      readWebviewVersion(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/140.0.0.0 Safari/537.36",
      ),
    ).toBe("Chromium 140.0.0.0");
  });

  it("says nothing rather than repeating a frozen WebKit token", () => {
    // `AppleWebKit/605.1.15` is what every WKWebView and WebKitGTK has reported
    // for years regardless of the engine underneath, so printing it would put a
    // number in a bug report that means nothing.
    expect(
      readWebviewVersion("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"),
    ).toBeNull();
  });
});

describe("describeStack", () => {
  it("credits the layers shell-outwards and drops the ones it cannot resolve", () => {
    expect(
      describeStack({ tauri: "2.11.5", react: "19.2.8", rust: "1.90.0" }).map(
        (layer) => `${layer.name} ${layer.version}`,
      ),
    ).toEqual(["Tauri 2.11.5", "React 19.2.8", "Rust 1.90.0"]);

    // A frontend-only build has no Rust on PATH. The chip goes; the order of
    // what is left does not shuffle to fill the gap.
    expect(
      describeStack({ tauri: "2.11.5", react: "19.2.8", rust: null }).map((layer) => layer.id),
    ).toEqual(["tauri", "react"]);
    expect(describeStack({ tauri: null, react: null, rust: null })).toEqual([]);
  });
});

describe("describeStackHost", () => {
  it("names the site the way it is read aloud, without the www subdomain", () => {
    expect(describeStackHost("https://tauri.app/")).toBe("tauri.app");
    expect(describeStackHost("https://www.rust-lang.org/")).toBe("rust-lang.org");
  });

  it("points every layer at its own project", () => {
    expect(
      describeStack({ tauri: "2.11.5", react: "19.2.8", rust: "1.90.0" }).map(
        (layer) => layer.url,
      ),
    ).toEqual([
      "https://tauri.app/",
      "https://react.dev/",
      "https://www.rust-lang.org/",
    ]);
  });
});

describe("readSystemInfo", () => {
  it("returns null instead of throwing when Tauri's OS bridge is absent", async () => {
    const os = await import("@tauri-apps/plugin-os");
    vi.mocked(os.platform).mockImplementationOnce(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'platform')");
    });

    // Unguarded, this throw propagates out of render and takes the whole
    // overlay tree down — which is exactly what happened in the browser.
    expect(readSystemInfo()).toBeNull();
  });
});

describe("Keyboard shortcuts dialog", () => {
  function renderShortcuts(): AppOverlaysProps {
    const props = buildProps(null);
    props.shortcuts = { isOpen: true, setOpen: vi.fn() };
    render(
      <LanguageProvider>
        <AppOverlays {...props} />
      </LanguageProvider>,
    );
    return props;
  }

  it("heads the sheet with a keyboard tile carrying the platform's mark", () => {
    renderShortcuts();

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    const header = dialog.querySelector(".shortcuts-dialog__header");
    const tile = header?.querySelector(".shortcuts-dialog__tile");
    const badge = tile?.querySelector(".shortcuts-dialog__tile-badge");

    // The tile and a title on one row is what removes the old overlap with the
    // close button; the title is a sibling of the close, not laid under it.
    expect(tile).toBeInTheDocument();
    expect(header?.querySelector(".dialog-close-button")).toBeInTheDocument();
    // The mocked OS bridge reports Windows, so the badge wears its mark.
    expect(badge?.querySelector("svg")).toBeInTheDocument();
  });

  it("groups the rows and spells the modifiers for the running OS", () => {
    renderShortcuts();

    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    // The opening group is unlabelled — the sheet's title names it — so the
    // first caption the reader meets is Projects.
    expect(within(dialog).queryByRole("heading", { name: "Navigation" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Editing" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Interface" })).toBeInTheDocument();

    // Windows spells the modifiers out rather than using Mac symbols.
    expect(within(dialog).getAllByText("Ctrl").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("Shift")).toBeInTheDocument();
    expect(within(dialog).queryByText("⌘")).not.toBeInTheDocument();
    // The editing shortcuts are listed too, platform-neutral.
    expect(within(dialog).getByText("F2")).toBeInTheDocument();
  });
});

describe("dialog backdrops", () => {
  /** Settings on a section the test can navigate to, with About out of the
   * way: the dialog that hosts the Accounts provider menu. */
  function renderSettings({ section = "general" }: { section?: AppOverlaysProps["settings"]["section"] } = {}): AppOverlaysProps {
    const props = buildProps(null);
    props.about = { isOpen: false, setOpen: vi.fn() };
    props.settings = { ...props.settings, isOpen: true, section };
    render(
      <LanguageProvider>
        <AppOverlays {...props} />
      </LanguageProvider>,
    );
    return props;
  }

  it("closes the provider menu when the reader presses elsewhere in the dialog", async () => {
    // Accounts reads its catalog through the transport; the menu stays enabled
    // only after a successful read, so the read is answered here.
    const invokeMock = vi.mocked(invoke);
    invokeMock.mockImplementation(async (command: string) =>
      command === "get_account_catalog" ? { providers: [], accounts: [], busy: false } : undefined);
    try {
      const props = renderSettings({ section: "accounts" });
      const dialog = screen.getByRole("dialog", { name: "Settings" });
      const connect = await within(dialog).findByRole("button", { name: "Connect account" });
      await waitFor(() => expect(connect).toBeEnabled());

      await userEvent.click(connect);
      expect(within(dialog).getByRole("menu", { name: "Choose a provider" })).toBeVisible();

      // The reader's "click anywhere else". The menu closes on a press observed
      // at `document`; the dialog body used to stop that press on its way there,
      // so this click left the menu on screen and only its trigger closed it.
      await userEvent.click(within(dialog).getByRole("heading", { name: "Connected accounts" }));

      expect(within(dialog).queryByRole("menu")).toBeNull();
      // Reaching document must not also dismiss the dialog the menu sat in.
      expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
      expect(props.settings.setOpen).not.toHaveBeenCalled();

      // Escape dismisses just the provider menu and returns to its trigger.
      await userEvent.click(connect);
      await userEvent.keyboard("{Escape}");
      expect(within(dialog).queryByRole("menu")).toBeNull();
      expect(connect).toHaveFocus();
      expect(props.settings.setOpen).not.toHaveBeenCalled();
    } finally {
      invokeMock.mockImplementation(async () => undefined);
    }
  });

  it("still dismisses on a press that starts on the backdrop", () => {
    const props = renderSettings();

    fireEvent.mouseDown(document.querySelector(".app-dialog-backdrop") as HTMLElement);

    expect(props.settings.setOpen).toHaveBeenCalledWith(false);
  });
});

describe("About dialog", () => {
  it("is named by the app it belongs to, not only by its promise", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    const hero = dialog.querySelector(".about-dialog__hero");
    const heading = dialog.querySelector("#about-title");
    const productName = heading?.querySelector(".about-dialog__product-name");
    const mark = hero?.querySelector(".about-dialog__mark");
    const tagline = heading?.querySelector(".about-dialog__tagline");
    expect(heading).toHaveTextContent("GitOdile See everything. Undo anything.");
    expect(productName).toHaveTextContent("GitOdile");
    // The "Odile" half is the one that carries the brand sweep; the name still
    // reads as one word because the halves are adjacent text.
    expect(productName?.querySelector(".about-dialog__odile")).toHaveTextContent("Odile");
    expect(mark).toBeInTheDocument();
    expect(tagline).toHaveTextContent("See everything. Undo anything.");
    // The mark leads the identity at hero scale, then the h2 names the product
    // before it states the promise.
    expect(mark!.compareDocumentPosition(heading!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(productName!.compareDocumentPosition(tagline!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("describes machine-specific diagnostics as the user's system", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    expect(within(dialog).getByRole("heading", { name: "Your system" })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("Technical details");
  });

  it("puts the copy control with the diagnostics it copies, not with the credits", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    const technical = dialog.querySelector(".about-technical");
    const stack = dialog.querySelector(".about-stack");
    const copy = dialog.querySelector<HTMLElement>(".about-technical__copy");
    expect(technical).toBeInTheDocument();
    expect(stack).toBeInTheDocument();
    expect(copy).toBeInTheDocument();

    // The copy control now heads the section whose rows it puts on the
    // clipboard — one block, not a button below the list tied to it only by its
    // label. The credits still come after.
    expect(technical).toContainElement(copy);
    expect(copy).toHaveTextContent("Copy");
    expect(copy).toHaveAccessibleName("Copy system info");
    expect(technical!.compareDocumentPosition(stack!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the project license and opens its license and source in the browser", async () => {
    renderOverlays();
    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    const licence = dialog.querySelector(".about-dialog__legal--bare");
    const stack = dialog.querySelector(".about-stack");
    const credit = dialog.querySelector(".about-dialog__legal--stacked");
    expect(licence).toBeInTheDocument();
    expect(stack).toBeInTheDocument();
    expect(credit).toBeInTheDocument();
    // The licence leads the facts; the credit closes the dialog under them.
    expect(licence!.compareDocumentPosition(stack!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(licence!.compareDocumentPosition(credit!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dialog).toHaveTextContent("GNU AGPL v3.0 only");
    await userEvent.click(screen.getByRole("button", { name: "View license" }));
    await userEvent.click(screen.getByRole("button", { name: "View source code" }));
    expect(openUrl).toHaveBeenNthCalledWith(1, "https://github.com/martinezelx/gitodile-desktop/blob/main/LICENSE");
    expect(openUrl).toHaveBeenNthCalledWith(2, "https://github.com/martinezelx/gitodile-desktop");
  });
  it("reports the product and the machine, and leaves release notes to Settings", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    expect(dialog).toHaveTextContent("The Git client for humans and their agents.");
    expect(dialog.querySelector(".about-dialog__version")?.textContent).toBe(__APP_VERSION__);
    expect(dialog.querySelector(".about-dialog__version")).toHaveAccessibleName(
      `GitOdile ${__APP_VERSION__}`,
    );
    expect(dialog).toHaveTextContent("Windows 11 (x86_64)");
    expect(dialog).toHaveTextContent("10.0.26200");
    expect(dialog).toHaveTextContent("2.45.0");
    // The release list lives in Settings › Updates; About keeps only the link.
    expect(dialog.querySelector(".whatsnew-release")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "What's new" })).toBeInTheDocument();
  });

  it("says whether the build is current and links to the release notes", async () => {
    const props = renderOverlays({
      appUpdates: {
        state: { kind: "current", checkedAt: "2026-09-22T10:00:00Z" },
        startupConfirmation: { kind: "none" },
        automaticEnabled: true,
      },
    });

    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    expect(dialog).toHaveTextContent("Up to date");
    await userEvent.click(within(dialog).getByRole("button", { name: "What's new" }));
    // About closes onto Settings › Updates, at What's new, so the two
    // backdrops never stack.
    expect(props.about.setOpen).toHaveBeenCalledWith(false);
    expect(props.appUpdate?.openUpdates).toHaveBeenCalledWith({ whatsNew: true });
  });

  it("keeps the update line quiet when the release model has nothing to say", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    // No status and no trailing separator without an appUpdates snapshot: only
    // the way to the notes, never an alarm About cannot explain.
    expect(dialog.querySelector(".about-dialog__update-status")).not.toBeInTheDocument();
    expect(dialog.querySelector(".about-dialog__update-dot")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "What's new" })).toBeInTheDocument();
  });

  it("says why it cannot report an update rather than leaving the line blank", () => {
    renderOverlays({
      appUpdates: {
        state: { kind: "unavailable", error: { code: "feed_unavailable", stage: "check", retryable: false } },
        startupConfirmation: { kind: "none" },
        automaticEnabled: true,
      },
    });

    // A development build configures no update feed, so the slot names the
    // check as unavailable rather than reading as a fault or going blank.
    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    expect(dialog).toHaveTextContent("Updates unavailable");
  });

  it("lists the technical environment rows in a fixed order", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    const rows = [...dialog.querySelectorAll(".about-details > div")];
    // No webview row under jsdom: its user agent carries no Chromium token, and
    // an unknown engine is omitted rather than guessed.
    expect(rows.map((row) => row.querySelector("dt")?.textContent)).toEqual([
      "System",
      "System version",
      "Git",
    ]);
  });

  it("reports the webview between the machine and Git when it can name one", () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
    });
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    const rows = [...dialog.querySelectorAll(".about-details > div")];
    expect(rows.map((row) => row.querySelector("dt")?.textContent)).toEqual([
      "System",
      "System version",
      "Webview",
      "Git",
    ]);
    expect(dialog).toHaveTextContent("Chromium 140.0.0.0");
  });

  it("marks the platform it is running on", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    // Decoration for a value that is already spelled out beside it, so it must
    // stay out of the accessibility tree rather than announce "Windows" twice.
    const mark = dialog.querySelector(".about-details__mark");
    expect(mark).toBeInTheDocument();
    expect(mark).toHaveAttribute("aria-hidden", "true");
  });

  it("credits the stack it is built on, apart from the diagnostics", () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    const tiles = [...dialog.querySelectorAll(".about-stack__item")];
    const names = tiles.map((tile) => tile.querySelector(".about-stack__name")?.textContent);
    expect(tiles.length).toBeGreaterThan(0);
    expect(dialog).toHaveTextContent("Built with");
    // Asserted as an order, not a set. Which layers resolve depends on the
    // machine that ran the build — a frontend-only one has no Rust — but
    // whichever do must appear shell-outwards, never reshuffled to fill a gap.
    expect(names).toEqual(["Tauri", "React", "Rust"].filter((name) => names.includes(name)));
    // Real versions off the lockfiles, not placeholders. Pinning the numbers
    // would mean editing this test on every dependency bump.
    for (const tile of tiles) {
      expect(tile.querySelector(".about-stack__version")?.textContent).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it("opens a credited project's own site in the browser, not in the webview", async () => {
    renderOverlays();

    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    // Named by destination as well as by layer: the chip leaves the app, and a
    // screen reader user has to hear that before pressing it. The version sits
    // inside the chip but not in its name — it is not what the press acts on.
    const tauri = screen.getByRole("button", { name: "Tauri — open tauri.app" });
    expect(tauri).toHaveClass("about-stack__item");
    await userEvent.click(tauri);

    expect(openUrl).toHaveBeenCalledExactlyOnceWith("https://tauri.app/");
    // A control, not a link: an `href` would let a middle click navigate the
    // webview the dialog is living in away from the app.
    expect(dialog.querySelector(".about-stack__list a")).not.toBeInTheDocument();
  });

  it("says nothing rather than breaking when the browser cannot be reached", async () => {
    vi.mocked(openUrl).mockRejectedValueOnce(new Error("no browser"));
    renderOverlays();

    await userEvent.click(screen.getByRole("button", { name: "React — open react.dev" }));

    // The rejection is swallowed on purpose: an unopened credit is not worth an
    // error dialog, and an unhandled rejection here fails the whole suite.
    expect(screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." })).toBeInTheDocument();
  });

  it("omits empty technical details without a platform bridge", async () => {
    const os = await import("@tauri-apps/plugin-os");
    vi.mocked(os.platform).mockImplementationOnce(() => {
      throw new TypeError("no bridge");
    });
    renderOverlaysWithoutGit();

    const dialog = screen.getByRole("dialog", { name: "GitOdile See everything. Undo anything." });
    // The copy control lives in that section, so with nothing to report there is
    // nothing to copy and no orphaned button either.
    expect(dialog.querySelector(".about-technical")).not.toBeInTheDocument();
    expect(dialog.querySelector(".about-technical__copy")).not.toBeInTheDocument();
  });

  it("copies a diagnostics block for a bug report", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderOverlays();

    await userEvent.click(screen.getByRole("button", { name: /Copy system info/ }));

    expect(writeText).toHaveBeenCalledWith(
      "GitOdile " + __APP_VERSION__ + "\nSystem: Windows 11 (x86_64)\nSystem version: 10.0.26200\nGit: 2.45.0",
    );
    expect(await screen.findByRole("button", { name: /Copied/ })).toBeInTheDocument();
  });

  it("keeps the heart readable to a screen reader instead of leaving a gap", () => {
    renderOverlays();

    // The sentence is "Made with <heart> by …". Hiding the glyph would read as
    // "Made with by Luis Muñoz Martinez."
    const heart = screen.getByRole("img", { name: "love" });
    expect(heart).toHaveTextContent("♥");
    expect(heart).toHaveClass("about-dialog__heart");
  });
});
