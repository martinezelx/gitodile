import { createRef } from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { ConsoleScreen, type ConsoleCommandPalette } from "./ConsoleScreen";
import type { ConsoleProjectStatus } from "./domain";
import { consolePort } from "./tauriAdapter";
import { createConsoleSessionStore, type ConsoleSessionStore } from "./session";

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

const KNOWN_STATUS: ConsoleProjectStatus = { changes: 3, linesAdded: 12, linesRemoved: 4, unpublished: 2, incoming: 0 };

/** The app search's contract, as the composition root passes it. */
function palette(overrides: Partial<ConsoleCommandPalette> = {}): ConsoleCommandPalette {
  return {
    isOpen: false,
    query: "",
    inputRef: createRef<HTMLInputElement>(),
    shortcut: "Ctrl+K",
    onOpen: vi.fn(),
    onQueryChange: vi.fn(),
    onKeyDown: vi.fn(),
    ...overrides,
  };
}

function renderConsole(
  epoch = "epoch-1",
  projectStatus: ConsoleProjectStatus = KNOWN_STATUS,
  commandPalette?: ConsoleCommandPalette,
  sessionStore?: ConsoleSessionStore,
  projectPath = "/repo",
) {
  const lifecycle = createScreenLifecycleController("active");
  const result = render(<LanguageProvider><ScreenLifecycleProvider controller={lifecycle}>
    <ConsoleScreen projectPath={projectPath} projectName="Demo" branch="main" sessionEpoch={epoch} gitVersion="2.47.1"
      projectStatus={projectStatus} commandPalette={commandPalette} sessionStore={sessionStore} />
  </ScreenLifecycleProvider></LanguageProvider>);
  return { lifecycle, ...result };
}

describe("ConsoleScreen", () => {
  it.each(["away", "returned"])("retains transcript, recall, draft and focus when a read finishes with its project %s", async (settlement) => {
    const store = createConsoleSessionStore();
    let finish!: (value: Awaited<ReturnType<typeof consolePort.run>>) => void;
    vi.spyOn(consolePort, "run").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const mount = (path: string) => renderConsole(path, KNOWN_STATUS, undefined, store, path);
    const user = userEvent.setup();
    const a = mount("/a");
    await user.click(screen.getByRole("combobox", { name: "Console command" }));
    await user.paste("look");
    await user.keyboard("{Enter}");
    a.unmount();
    const b = mount("/b");
    expect(screen.queryByText("git status", { selector: "code" })).toBeNull();
    let returned: ReturnType<typeof mount>;
    if (settlement === "returned") {
      b.unmount();
      returned = mount("/a");
      expect(screen.getByRole("combobox", { name: "Console command" })).toBeDisabled();
    }
    await act(async () => finish({ operationId: "status", command: "git status", stdout: "finished in A\n", stderr: "", exitCode: 0, success: true, truncated: false }));
    if (settlement === "away") {
      expect(screen.queryByText("finished in A")).toBeNull();
      b.unmount();
      returned = mount("/a");
    }
    expect(await screen.findByText("finished in A")).toBeInTheDocument();
    const prompt = screen.getByRole("combobox", { name: "Console command" });
    expect(prompt).toHaveFocus();
    await user.click(prompt);
    await user.keyboard("{ArrowUp}");
    expect(prompt).toHaveValue("look");
    await user.clear(prompt);
    await user.paste("git diff -- notes.md");
    returned!.unmount();
    mount("/a");
    expect(screen.getByRole("combobox", { name: "Console command" })).toHaveValue("git diff -- notes.md");
  });

  it("keeps a pending confirmation attached to its originating session across remounts", async () => {
    const store = createConsoleSessionStore();
    vi.spyOn(consolePort, "plan").mockResolvedValue({
      planId: "retained-plan", command: "git add .", tier: "local_change", effect: "changes_project", shape: "plain", facts: [], confirmation: "yes_no", refusal: null,
    });
    const run = vi.spyOn(consolePort, "runChange").mockResolvedValue({
      command: "git add .", stdout: "", stderr: "", exitCode: 0, success: true, truncated: false, shape: "plain", failure: null,
    });
    const mount = () => renderConsole("a-epoch", KNOWN_STATUS, undefined, store, "/a");
    const user = userEvent.setup();
    const a = mount();
    await user.click(screen.getByRole("combobox", { name: "Console command" }));
    await user.paste("git add .");
    await user.keyboard("{Enter}");
    await screen.findByRole("combobox", { name: /Answer y/ });
    a.unmount();
    mount();
    await user.click(screen.getByRole("combobox", { name: /Answer y/ }));
    await user.paste("y");
    await user.keyboard("{Enter}");
    expect(run).toHaveBeenCalledWith({ projectId: "/a", sessionEpoch: "a-epoch", planId: "retained-plan", answer: "y" });
  });

  it.each(["clear{Enter}", "{Control>}l{/Control}"])("starts still, and only reveals the restored welcome after clearing work with %s", async (clearKeys) => {
    const user = userEvent.setup();
    const { lifecycle } = renderConsole();
    const input = screen.getByRole("combobox", { name: "Console command" });
    const initial = document.querySelector(".console-welcome .console-art");
    expect(initial).not.toHaveClass("console-art--reveal");
    await user.type(input, clearKeys);
    expect(document.querySelector(".console-welcome .console-art")).toBe(initial);
    expect(initial).not.toHaveClass("console-art--reveal");
    act(() => lifecycle.transition("hidden"));
    act(() => lifecycle.transition("active"));
    expect(initial).not.toHaveClass("console-art--reveal");

    await user.type(input, "help{Enter}");
    expect(document.querySelector(".console-watermark .console-art")).toHaveClass("console-art--reveal");
    await user.type(input, clearKeys);
    const restored = document.querySelector(".console-welcome .console-art");
    expect(restored).not.toBe(initial);
    expect(restored).toHaveClass("console-art--reveal");
    act(() => lifecycle.transition("hidden"));
    act(() => lifecycle.transition("active"));
    expect(document.querySelector(".console-welcome .console-art")).toBe(restored);
    expect(restored).not.toHaveClass("console-art--reveal");
  });

  it("does not run on arrival, rejects shell-like text, and shows a bounded result", async () => {
    const run = vi.spyOn(consolePort, "run").mockResolvedValue({ operationId: "status", command: "git status", stdout: "On branch main\n", stderr: "", exitCode: 0, success: true, truncated: false });
    const user = userEvent.setup();
    renderConsole();
    expect(run).not.toHaveBeenCalled();
    const input = screen.getByRole("combobox", { name: "Console command" });
    await user.type(input, "stat && push{Enter}");
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByText(/isn't a shortcut or a Git command/, { selector: "pre" })).toBeInTheDocument();
    await user.type(input, "look{Enter}");
    expect(run).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1", operationId: "status" });
    expect(await screen.findByText("main", { selector: ".console-tone--current" })).toBeInTheDocument();
    expect(screen.getByText(/^\d+ ms$|^\d+\.\d s$/)).toBeInTheDocument();
    expect(screen.getByText("git status", { selector: "code" })).toBeInTheDocument();
    await user.type(input, "{ArrowUp}");
    expect(input).toHaveValue("look");
  });

  it("carries the app search in its status line and keeps Ctrl+L out of the transcript", async () => {
    vi.spyOn(consolePort, "run").mockResolvedValue({ operationId: "status", command: "git status", stdout: "On branch main\n", stderr: "", exitCode: 0, success: true, truncated: false });
    const onOpen = vi.fn();
    const onQueryChange = vi.fn();
    const onKeyDown = vi.fn();
    const inputRef = createRef<HTMLInputElement>();
    const user = userEvent.setup();
    renderConsole("epoch-1", KNOWN_STATUS, palette({ onOpen, onQueryChange, onKeyDown, inputRef }));

    const field = screen.getByRole("combobox", { name: "Open command palette" });
    expect(field).toHaveAttribute("placeholder", "Search or do something…");
    expect(inputRef.current).toBe(field);

    await user.type(field, "m");
    expect(onOpen).toHaveBeenCalled();
    expect(onQueryChange).toHaveBeenCalled();

    // A run puts a line in the transcript; Ctrl+L in the search must not clear
    // it (that gesture belongs to the prompt).
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "look{Enter}");
    expect(await screen.findByText("git status", { selector: "code" })).toBeInTheDocument();
    await user.click(field);
    await user.keyboard("{Control>}l{/Control}");
    expect(onKeyDown).toHaveBeenCalled();
    expect(screen.getByText("git status", { selector: "code" })).toBeInTheDocument();
  });

  it("gives the keyboard back to the prompt when Escape closes the search", async () => {
    const onKeyDown = vi.fn();
    const user = userEvent.setup();
    renderConsole("epoch-1", KNOWN_STATUS, palette({ isOpen: true, onKeyDown }));
    const field = screen.getByRole("combobox", { name: "Open command palette" });
    await user.click(field);
    expect(field).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onKeyDown).toHaveBeenCalledOnce();
    expect(screen.getByRole("combobox", { name: "Console command" })).toHaveFocus();
  });

  it("has help, editing, reset, empty and error states", async () => {
    const run = vi.spyOn(consolePort, "run").mockRejectedValue({ code: "git_command_failed", message: "Stopped" });
    const user = userEvent.setup();
    renderConsole();
    expect(screen.getByText(/Type help/)).toBeInTheDocument();
    const input = screen.getByRole("combobox", { name: "Console command" });
    await user.type(input, "help{Enter}");
    expect(screen.getByRole("table", { name: "Available shortcuts (read-only)" })).toHaveTextContent("lookProject status");
    await user.click(screen.getByRole("button", { name: "Shortcuts" }));
    await user.type(screen.getByRole("textbox", { name: "Shortcut name" }), "peek");
    await user.click(screen.getByRole("button", { name: "Add shortcut" }));
    expect(within(screen.getByRole("region", { name: "Console shortcuts" })).getByText("peek")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore defaults" }));
    expect(screen.queryByText("peek")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close shortcuts" }));
    await user.type(input, "look{Enter}");
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't|could not|stopped/i);
    await user.type(input, "clear{Enter}");
    expect(screen.getByText(/Type help/)).toBeInTheDocument();
  });

  it("disables input while running and drops a late result after a project session switch", async () => {
    let finish!: (value: Awaited<ReturnType<typeof consolePort.run>>) => void;
    const run = vi.spyOn(consolePort, "run").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    const lifecycle = createScreenLifecycleController("active");
    const view = (epoch: string) => <LanguageProvider><ScreenLifecycleProvider controller={lifecycle}>
      <ConsoleScreen key={epoch} projectPath={epoch === "one" ? "/first" : "/second"} projectName={epoch} branch="main" sessionEpoch={epoch} />
    </ScreenLifecycleProvider></LanguageProvider>;
    const rendered = render(view("one"));
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "look{Enter}");
    expect(run).toHaveBeenCalledWith({ projectId: "/first", sessionEpoch: "one", operationId: "status" });
    expect(screen.getByRole("combobox", { name: "Console command" })).toBeDisabled();
    rendered.rerender(view("two"));
    expect(screen.getByText(/Type help/)).toBeInTheDocument();
    await act(async () => finish({ operationId: "status", command: "git status", stdout: "old project", stderr: "", exitCode: 0, success: true, truncated: false }));
    expect(screen.queryByText("old project")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Console command" })).toBeEnabled();
  });

  it("completes with Tab, runs from the menu, and colours a diff as inert text", async () => {
    const run = vi.spyOn(consolePort, "run").mockResolvedValue({ operationId: "diff", command: "git diff --no-color", stdout: "diff --git a/x b/x\n-old <b>\n+new\n", stderr: "", exitCode: 0, success: true, truncated: false });
    const user = userEvent.setup();
    renderConsole();
    const input = screen.getByRole("combobox", { name: "Console command" });
    await user.type(input, "lo");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { name: /look/ })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Tab}");
    expect(input).toHaveValue("look");
    expect(input).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
    await user.type(input, "d");
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(run).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1", operationId: "diff" });
    expect(await screen.findByText("+new", { selector: ".console-tone--added" })).toBeInTheDocument();
    expect(screen.getByText(/-old <b>/, { selector: ".console-tone--removed" })).toBeInTheDocument();
    expect(document.querySelector(".console-block b")).toBeNull();
  });

  it("welcomes with the mark and where queries run, repeats a block, and clears with Ctrl+L", async () => {
    const run = vi.spyOn(consolePort, "run").mockResolvedValue({ operationId: "log", command: "git log --oneline", stdout: "abc1234 First\n", stderr: "", exitCode: 0, success: true, truncated: true });
    const user = userEvent.setup();
    renderConsole();
    const welcome = document.querySelector(".console-welcome");
    expect(welcome?.querySelector(".console-art")).toHaveAttribute("aria-hidden", "true");
    expect(welcome).toHaveTextContent(/projectDemo/);
    expect(welcome).toHaveTextContent(/branchmain/);
    expect(within(welcome as HTMLElement).getByText(__APP_VERSION__, { exact: true })).toBeInTheDocument();
    expect(welcome).toHaveTextContent(/git2\.47\.1/);
    expect(welcome).toHaveTextContent(/confirmbefore each change/);
    expect(welcome).not.toHaveTextContent(/look · diff/);
    expect(screen.getByRole("combobox", { name: "Console command" })).toHaveFocus();
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "log{Enter}");
    expect(await screen.findByText("abc1234", { selector: ".console-tone--hash" })).toBeInTheDocument();
    expect(screen.getByText("Shortened")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run again: log" }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    await user.keyboard("{Control>}l{/Control}");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByText(/Type help/)).toBeInTheDocument();
  });

  it("keeps its status line for the chip and the search, leaving the project facts to the welcome", () => {
    renderConsole();
    const status = screen.getByRole("contentinfo", { name: "Console status" });
    // The chip names the setting in one short word; the full sentence stays in
    // the tree for hover and the screen reader.
    expect(status).toHaveTextContent("Confirms");
    expect(status).toHaveTextContent("confirms changes");
    // The prompt's keys are split around the search: completion and running
    // lead, history and clearing follow the field.
    expect(status).toHaveTextContent("Tab completes · Enter runs");
    expect(status).toHaveTextContent("↑↓ history · Ctrl+L clears");
    // The project facts and the Git version live in the welcome, not on this
    // line: the middle track belongs to the search.
    expect(status).not.toHaveTextContent("unsaved");
    expect(status).not.toHaveTextContent("to publish");
    expect(status).not.toHaveTextContent("2.47.1");
    const welcome = document.querySelector(".console-welcome");
    expect(welcome).toHaveTextContent("3 unsaved");
    expect(welcome).toHaveTextContent(/git2\.47\.1/);
  });

  it("reveals one decorative watermark on submission, keeps it through results and clear restores the welcome", async () => {
    let finish!: (value: Awaited<ReturnType<typeof consolePort.run>>) => void;
    vi.spyOn(consolePort, "run").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    const { lifecycle } = renderConsole();
    const input = screen.getByRole("combobox", { name: "Console command" });
    await user.type(input, "look");
    expect(document.querySelector(".console-welcome .console-art")).toBeInTheDocument();
    expect(document.querySelector(".console-watermark")).toBeNull();
    await user.keyboard("{Enter}");
    const art = document.querySelector(".console-watermark .console-art");
    expect(art).toHaveAttribute("aria-hidden", "true");
    expect(art).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("log")).not.toContainElement(art as HTMLElement);
    await act(async () => finish({ operationId: "status", command: "git status", stdout: "On branch main\n", stderr: "", exitCode: 0, success: true, truncated: false }));
    expect(document.querySelector(".console-watermark .console-art")).toBe(art);
    await user.type(input, "help{Enter}");
    expect(document.querySelector(".console-watermark .console-art")).toBe(art);
    act(() => lifecycle.transition("hidden"));
    expect(art).toHaveAttribute("data-active", "false");
    act(() => lifecycle.transition("active"));
    expect(document.querySelector(".console-watermark .console-art")).toBe(art);
    await user.type(input, "clear{Enter}");
    expect(document.querySelector(".console-watermark")).toBeNull();
    expect(document.querySelector(".console-welcome .console-art")).toHaveClass("console-art--reveal");
    await user.type(input, "help{Enter}");
    expect(document.querySelector(".console-watermark .console-art")).not.toBe(art);
  });

  it("moves one drawing between the welcome and the watermark instead of revealing a new one", async () => {
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "animate", { value: animate, configurable: true });
    try {
      const user = userEvent.setup();
      renderConsole();
      const input = screen.getByRole("combobox", { name: "Console command" });
      await user.type(input, "help{Enter}");
      expect(document.querySelector(".console-watermark .console-art")).not.toHaveClass("console-art--reveal");
      await user.type(input, "clear{Enter}");
      expect(document.querySelector(".console-welcome .console-art")).not.toHaveClass("console-art--reveal");
      const flights = animate.mock.calls.filter(([frames]) => (frames as Keyframe[])[0]?.transform);
      expect(flights).toHaveLength(2);
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
  });

  it("classifies an explicitly selected light theme for the watermark even on a dark device", async () => {
    const user = userEvent.setup();
    const lifecycle = createScreenLifecycleController("active");
    const view = (theme: "catppuccin-latte" | "nord") => <LanguageProvider><ScreenLifecycleProvider controller={lifecycle}>
      <ConsoleScreen projectPath="/repo" projectName="Demo" branch="main" sessionEpoch="theme-test" theme={theme} />
    </ScreenLifecycleProvider></LanguageProvider>;
    const rendered = render(view("catppuccin-latte"));
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "help{Enter}");
    expect(document.querySelector(".console-watermark")).toHaveAttribute("data-scheme", "light");
    const art = document.querySelector(".console-watermark .console-art");
    rendered.rerender(view("nord"));
    expect(document.querySelector(".console-watermark")).toHaveAttribute("data-scheme", "dark");
    expect(document.querySelector(".console-watermark .console-art")).toBe(art);
  });

  it("opens the shortcut pane from the prompt and gives focus back to it on Escape", async () => {
    const user = userEvent.setup();
    renderConsole();
    const input = screen.getByRole("combobox", { name: "Console command" });
    await user.type(input, "shortcuts{Enter}");
    const pane = screen.getByRole("region", { name: "Console shortcuts" });
    expect(within(pane).getByRole("textbox", { name: "Shortcut name" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Console shortcuts" })).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("keeps the welcome's changes and publish rows while their facts are unknown", () => {
    const { lifecycle, rerender } = renderConsole("epoch-1", { changes: null, linesAdded: 0, linesRemoved: 0, unpublished: null, incoming: null });
    const project = screen.getByRole("region", { name: "project" });
    expect(project).toHaveTextContent("changes—");
    expect(project).toHaveTextContent("publish—");
    const rows = project.querySelectorAll(".console-welcome__row").length;
    rerender(<LanguageProvider><ScreenLifecycleProvider controller={lifecycle}>
      <ConsoleScreen projectPath="/repo" projectName="Demo" branch="main" sessionEpoch="epoch-1" gitVersion="2.47.1" projectStatus={KNOWN_STATUS} />
    </ScreenLifecycleProvider></LanguageProvider>);
    expect(project).toHaveTextContent("changes3 unsaved +12 −4");
    expect(project).toHaveTextContent("publish2 versions");
    expect(project.querySelectorAll(".console-welcome__row")).toHaveLength(rows);
  });

  it("follows the console settings: no suggestions, no welcome, steady larger text", async () => {
    const user = userEvent.setup();
    const lifecycle = createScreenLifecycleController("active");
    render(<LanguageProvider><ScreenLifecycleProvider controller={lifecycle}>
      <ConsoleScreen projectPath="/repo" projectName="Demo" branch="main" sessionEpoch="e"
        preferences={{ autocomplete: false, welcome: false, cursorBlink: false, textSize: "large" }} />
    </ScreenLifecycleProvider></LanguageProvider>);
    expect(document.querySelector(".console-art")).toBeNull();
    expect(screen.getByText(/Type help/)).toBeInTheDocument();
    expect(document.querySelector(".console-panel")).toHaveClass("console-panel--text-large", "console-panel--steady-cursor");
    const input = screen.getByRole("combobox", { name: "Console command" });
    await user.type(input, "lo");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "help{Enter}");
    expect(document.querySelector(".console-art")).toBeNull();
  });

  it("chooses a shortcut's query with a terminal-style picker", async () => {
    const user = userEvent.setup();
    renderConsole();
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "shortcuts{Enter}");
    const picker = screen.getByRole("spinbutton", { name: "Query" });
    expect(picker).toHaveAttribute("aria-valuetext", "Project status");
    picker.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(picker).toHaveAttribute("aria-valuetext", "Changes ready to save");
    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(picker).toHaveAttribute("aria-valuetext", "Git command line");
    await user.keyboard("{ArrowLeft}");
    expect(picker).toHaveAttribute("aria-valuetext", "The project on its hosting service");
    await user.keyboard("{ArrowLeft}".repeat(6));
    expect(picker).toHaveAttribute("aria-valuetext", "Authors");
    await user.click(screen.getByRole("textbox", { name: "Shortcut name" }));
    await user.keyboard("who");
    picker.focus();
    await user.keyboard("{Enter}");
    const pane = screen.getByRole("region", { name: "Console shortcuts" });
    expect(within(pane).getByText("who").closest("li")).toHaveTextContent("Authors");
  });

  it("spends colouring newest first and shows older output that no longer fits as plain text", async () => {
    const lines = Array.from({ length: 150 }, (_, index) => `${(0x1000000 + index).toString(16)} change ${index}`).join("\n");
    vi.spyOn(consolePort, "run").mockResolvedValue({ operationId: "log", command: "git log", stdout: lines, stderr: "", exitCode: 0, success: true, truncated: false });
    const user = userEvent.setup();
    renderConsole();
    const input = screen.getByRole("combobox", { name: "Console command" });
    for (let run = 1; run <= 3; run += 1) {
      await user.type(input, "log{Enter}");
      await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(run));
    }
    // 150 coloured hashes each: two fit the 400-run budget, the oldest does not.
    const [oldest, middle, newest] = screen.getAllByRole("article");
    expect(newest.querySelectorAll(".console-tone")).toHaveLength(150);
    expect(middle.querySelectorAll(".console-tone")).toHaveLength(150);
    expect(oldest.querySelectorAll(".console-tone")).toHaveLength(0);
    expect(oldest).toHaveTextContent("1000000 change 0");
  });
});

const READ_PLAN = {
  planId: "plan-1", command: "git log --no-ext-diff --no-textconv --no-show-signature --oneline", tier: "read" as const,
  effect: "reads_only" as const, confirmation: "none" as const, shape: "commits" as const, refusal: null,
  facts: [],
};

describe("ConsoleScreen typed Git commands", () => {
  it("plans a typed line in Rust and runs the read it allows in one gesture", async () => {
    const plan = vi.spyOn(consolePort, "plan").mockResolvedValue(READ_PLAN);
    const runPlan = vi.spyOn(consolePort, "runPlan").mockResolvedValue({
      command: READ_PLAN.command, stdout: "abc1234 First <b>\n", stderr: "", exitCode: 0, success: true, truncated: false, shape: "commits", failure: null,
    });
    const run = vi.spyOn(consolePort, "run");
    const user = userEvent.setup();
    renderConsole();
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "git log --oneline{Enter}");
    expect(plan).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1", line: "git log --oneline", runHooks: true });
    await waitFor(() => expect(runPlan).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1", planId: "plan-1" }));
    expect(run).not.toHaveBeenCalled();
    expect(await screen.findByText("abc1234", { selector: ".console-tone--hash" })).toBeInTheDocument();
    expect(screen.getByText(READ_PLAN.command, { selector: "code" })).toBeInTheDocument();
    expect(document.querySelector(".console-block b")).toBeNull();
    // Running it again plans it again: a plan is used once.
    await user.click(screen.getByRole("button", { name: "Run again: git log --oneline" }));
    await waitFor(() => expect(plan).toHaveBeenCalledTimes(2));
  });

  it("prints why Rust refused a line, and never runs it", async () => {
    const plan = vi.spyOn(consolePort, "plan")
      .mockResolvedValueOnce({ ...READ_PLAN, planId: null, command: "git push --force", tier: "destructive", effect: "can_lose_work", refusal: { reason: "tier_not_allowed", subject: "push" } })
      .mockResolvedValueOnce({ ...READ_PLAN, planId: null, command: null, tier: null, effect: null, refusal: { reason: "shell_syntax", subject: ";" } })
      .mockResolvedValueOnce({ ...READ_PLAN, planId: null, command: "git log --output=x", tier: "never", effect: null, refusal: { reason: "writes_file", subject: "--output" } });
    const runPlan = vi.spyOn(consolePort, "runPlan");
    const user = userEvent.setup();
    renderConsole();
    const input = screen.getByRole("combobox", { name: "Console command" });
    await user.type(input, "git push --force{Enter}");
    expect(await screen.findByText("git push can discard work, which the console can't do yet. Use the guided actions for it.", { selector: ".console-block__error" })).toBeInTheDocument();
    await user.type(input, "git status; rm -rf .{Enter}");
    expect(await screen.findByText(/“;” is shell syntax/, { selector: ".console-block__error" })).toBeInTheDocument();
    await user.type(input, "git log --output=x{Enter}");
    expect(await screen.findByText("“--output” would write a file, so the console never allows it.", { selector: ".console-block__error" })).toBeInTheDocument();
    expect(plan).toHaveBeenCalledTimes(3);
    expect(runPlan).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("would write a file");
  });

  it("lists the read commands with help git and completes them after git", async () => {
    const user = userEvent.setup();
    renderConsole();
    const input = screen.getByRole("combobox", { name: "Console command" });
    await user.type(input, "help git{Enter}");
    const table = screen.getByRole("table", { name: "Git commands that only read the project" });
    expect(table).toHaveTextContent("git blameWho last changed each line");
    expect(table).toHaveTextContent("git stash listChanges set aside");
    await user.type(input, "git sta");
    expect(screen.getByRole("option", { name: /git status/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /git stash list/ })).toBeInTheDocument();
    await user.keyboard("{Tab}");
    expect(input).toHaveValue("git status");
  });

  it("keeps a command line as a shortcut, checked when saved and planned on every run", async () => {
    const plan = vi.spyOn(consolePort, "plan").mockResolvedValue(READ_PLAN);
    const runPlan = vi.spyOn(consolePort, "runPlan").mockResolvedValue({
      command: READ_PLAN.command, stdout: "abc1234 First\n", stderr: "", exitCode: 0, success: true, truncated: false, shape: "commits", failure: null,
    });
    const user = userEvent.setup();
    renderConsole();
    const input = screen.getByRole("combobox", { name: "Console command" });
    await user.type(input, "shortcuts{Enter}");
    await user.type(screen.getByRole("textbox", { name: "Shortcut name" }), "lg");
    const picker = screen.getByRole("spinbutton", { name: "Query" });
    picker.focus();
    await user.keyboard("{End}");
    const field = screen.getByRole("textbox", { name: "Git command line" });
    await user.type(field, "log --oneline");
    await user.click(screen.getByRole("button", { name: "Add shortcut" }));
    expect(screen.getByRole("alert")).toHaveTextContent("starts with git");
    await user.clear(field);
    await user.click(field);
    await user.paste("git log --oneline");
    await user.click(screen.getByRole("button", { name: "Add shortcut" }));
    await waitFor(() => expect(plan).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1", line: "git log --oneline", runHooks: true }));
    const pane = screen.getByRole("region", { name: "Console shortcuts" });
    expect(await within(pane).findByText("git log --oneline")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("gitodile-console-shortcuts-v1") ?? "{}").shortcuts).toContainEqual({ name: "lg", line: "git log --oneline", tier: "read" });
    await user.click(screen.getByRole("button", { name: "Close shortcuts" }));

    await user.type(input, "lg{Enter}");
    await waitFor(() => expect(runPlan).toHaveBeenCalledTimes(1));
    expect(plan).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("abc1234", { selector: ".console-tone--hash" })).toBeInTheDocument();

    // A later plan that needs more than the saved tier does not run.
    plan.mockResolvedValue({ ...READ_PLAN, planId: "plan-2", tier: "local_change", effect: "changes_project" });
    await user.type(input, "lg{Enter}");
    expect(await screen.findByText(/“lg” was saved as a read-only command and now asks for more/, { selector: ".console-block__error" })).toBeInTheDocument();
    expect(runPlan).toHaveBeenCalledTimes(1);
  });

  it("refuses to save a command line Rust would not run", async () => {
    vi.spyOn(consolePort, "plan").mockResolvedValue({ ...READ_PLAN, planId: null, tier: "destructive", effect: "can_lose_work", refusal: { reason: "tier_not_allowed", subject: "reset" } });
    const user = userEvent.setup();
    renderConsole();
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "shortcuts{Enter}");
    await user.type(screen.getByRole("textbox", { name: "Shortcut name" }), "undo");
    screen.getByRole("spinbutton", { name: "Query" }).focus();
    await user.keyboard("{End}");
    await user.click(screen.getByRole("textbox", { name: "Git command line" }));
    await user.paste("git reset --hard");
    await user.click(screen.getByRole("button", { name: "Add shortcut" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("git reset can discard work");
    expect(within(screen.getByRole("region", { name: "Console shortcuts" })).queryByText("undo")).not.toBeInTheDocument();
  });
});

const CHANGE_PLAN = {
  ...READ_PLAN, planId: "change-1", command: "git add .", tier: "local_change" as const, effect: "changes_project" as const,
  confirmation: "yes_no" as const, shape: "plain" as const,
  facts: [{ kind: "stages" as const, files: ["a.txt", "b.txt"], total: 2 }],
};
const CHANGE_RESULT = { command: "git add .", stdout: "", stderr: "", exitCode: 0, success: true, truncated: false, shape: "plain" as const, failure: null };

function renderChanges(overrides: { runHooks?: boolean; onRepositoryChanged?: () => void } = {}) {
  const lifecycle = createScreenLifecycleController("active");
  return render(<LanguageProvider><ScreenLifecycleProvider controller={lifecycle}>
    <ConsoleScreen projectPath="/repo" projectName="Demo" branch="main" sessionEpoch="epoch-1"
      runHooks={overrides.runHooks ?? true} onRepositoryChanged={overrides.onRepositoryChanged} />
  </ScreenLifecycleProvider></LanguageProvider>);
}

describe("ConsoleScreen changes", () => {
  it("prints a change plan and runs it only when the answer is yes", async () => {
    const plan = vi.spyOn(consolePort, "plan").mockResolvedValue(CHANGE_PLAN);
    const runChange = vi.spyOn(consolePort, "runChange").mockResolvedValue(CHANGE_RESULT);
    const changed = vi.fn();
    const user = userEvent.setup();
    renderChanges({ runHooks: false, onRepositoryChanged: changed });
    expect(screen.getByRole("contentinfo", { name: "Console status" })).toHaveTextContent("confirms changes");
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "git add .{Enter}");
    expect(plan).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1", line: "git add .", runHooks: false });
    expect(await screen.findByText("Changes this project on this computer.")).toBeInTheDocument();
    expect(screen.getByText("Stages 2 files: a.txt, b.txt")).toBeInTheDocument();
    const answer = screen.getByRole("combobox", { name: "Answer y to run the command, anything else to cancel" });
    expect(answer).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for your answer.");
    // Anything but yes cancels, and nothing runs.
    await user.type(answer, "n{Enter}");
    expect(screen.getByText("Cancelled. Nothing changed.", { selector: ".console-block__note" })).toBeInTheDocument();
    expect(runChange).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();

    const prompt = screen.getByRole("combobox", { name: "Console command" });
    await user.type(prompt, "git add .{Enter}");
    await user.type(await screen.findByRole("combobox", { name: /Answer y/ }), "s{Enter}");
    await waitFor(() => expect(runChange).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1", planId: "change-1", answer: "s" }));
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText(/Continue\? \[y\/N\]/).map((element) => element.textContent)).toContain("Continue? [y/N] s");
    // An answer is not a command: it never enters the history.
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "{ArrowUp}");
    expect(screen.getByRole("combobox", { name: "Console command" })).toHaveValue("git add .");
  });

  it("cancels with Escape and says why a change failed or went stale", async () => {
    vi.spyOn(consolePort, "plan").mockResolvedValue({ ...CHANGE_PLAN, command: "git commit -m x", facts: [{ kind: "commits", branch: "main", files: 1 }] });
    const runChange = vi.spyOn(consolePort, "runChange")
      .mockResolvedValueOnce({ ...CHANGE_RESULT, success: false, exitCode: 1, stderr: "blocked by the project", failure: "hook_rejected" })
      .mockRejectedValueOnce({ code: "stale_preview", message: "The project changed after this command was previewed, so it didn't run." });
    const user = userEvent.setup();
    renderChanges();
    const prompt = screen.getByRole("combobox", { name: "Console command" });
    await user.type(prompt, "git commit -m x{Enter}");
    expect(await screen.findByText("Saves a new version with 1 file ready to save on the branch “main”.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByText("Cancelled. Nothing changed.", { selector: ".console-block__note" })).toBeInTheDocument();

    await user.type(screen.getByRole("combobox", { name: "Console command" }), "git commit -m x{Enter}");
    await user.type(await screen.findByRole("combobox", { name: /Answer y/ }), "y{Enter}");
    expect(await screen.findByText("A Git hook in this project stopped the command. Its message is above.")).toBeInTheDocument();
    expect(screen.getByText("blocked by the project")).toBeInTheDocument();

    await user.type(screen.getByRole("combobox", { name: "Console command" }), "git commit -m x{Enter}");
    await user.type(await screen.findByRole("combobox", { name: /Answer y/ }), "yes{Enter}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(runChange).toHaveBeenCalledTimes(2);
  });

  it("opens its settings with the settings word or the status line's gear", async () => {
    const openSettings = vi.fn();
    const user = userEvent.setup();
    const lifecycle = createScreenLifecycleController("active");
    render(<LanguageProvider><ScreenLifecycleProvider controller={lifecycle}>
      <ConsoleScreen projectPath="/repo" projectName="Demo" branch="main" sessionEpoch="e" onOpenSettings={openSettings} />
    </ScreenLifecycleProvider></LanguageProvider>);
    const prompt = screen.getByRole("combobox", { name: "Console command" });
    await user.type(prompt, "sett");
    expect(screen.getByRole("option", { name: /settings/ })).toHaveTextContent("Open the console settings");
    await user.type(prompt, "ings{Enter}");
    expect(openSettings).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Console settings" }));
    expect(openSettings).toHaveBeenCalledTimes(2);
  });

  it("says whether changes are confirmed and marks it when they are not", () => {
    const lifecycle = createScreenLifecycleController("active");
    const view = (confirmChanges: boolean) => <LanguageProvider><ScreenLifecycleProvider controller={lifecycle}>
      <ConsoleScreen projectPath="/repo" projectName="Demo" branch="main" sessionEpoch="e" confirmChanges={confirmChanges} />
    </ScreenLifecycleProvider></LanguageProvider>;
    const rendered = render(view(true));
    const status = () => screen.getByRole("contentinfo", { name: "Console status" });
    expect(status()).toHaveTextContent("confirms changes");
    expect(status().querySelector(".console-statusline__state--confirm")).not.toBeNull();
    rendered.rerender(view(false));
    expect(status()).toHaveTextContent("no confirmation");
    expect(status().querySelector(".console-statusline__state--unconfirmed")).not.toBeNull();
  });

  it("prints the plan and runs at once when confirmations are off", async () => {
    vi.spyOn(consolePort, "plan").mockResolvedValue({ ...CHANGE_PLAN, confirmation: "none" });
    const runChange = vi.spyOn(consolePort, "runChange").mockResolvedValue(CHANGE_RESULT);
    const changed = vi.fn();
    const user = userEvent.setup();
    renderChanges({ onRepositoryChanged: changed });
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "git add .{Enter}");
    await waitFor(() => expect(runChange).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1", planId: "change-1", answer: "" }));
    expect(screen.getByText("Stages 2 files: a.txt, b.txt")).toBeInTheDocument();
    expect(screen.queryByText(/Continue\? \[y\/N\]/)).not.toBeInTheDocument();
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("combobox", { name: "Console command" })).toBeEnabled();
  });

  it("forgets an unanswered plan when the view is cleared", async () => {
    vi.spyOn(consolePort, "plan").mockResolvedValue(CHANGE_PLAN);
    const runChange = vi.spyOn(consolePort, "runChange");
    const user = userEvent.setup();
    renderChanges();
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "git add .{Enter}");
    await screen.findByRole("combobox", { name: /Answer y/ });
    await user.keyboard("{Control>}l{/Control}");
    const prompt = screen.getByRole("combobox", { name: "Console command" });
    await user.type(prompt, "s{Enter}");
    expect(runChange).not.toHaveBeenCalled();
  });
});

const GITHUB = { kind: "github" as const, host: "github.com", companyServer: false, remote: "origin" };

describe("ConsoleScreen hosting shortcuts", () => {
  it("names the project's provider in the welcome once Rust has read it", async () => {
    const readHost = vi.spyOn(consolePort, "readHost").mockResolvedValue({ ...GITHUB, kind: "gitlab", host: "gitlab.corp.example", companyServer: true });
    renderConsole();
    const welcome = screen.getByRole("region", { name: "environment" });
    // The row is held with a dash until the read lands, so the summary keeps its height.
    expect(welcome).toHaveTextContent("provider—");
    await waitFor(() => expect(welcome).toHaveTextContent("providerGitLab Self-Managed · gitlab.corp.example"));
    expect(readHost).toHaveBeenCalledTimes(1);
    expect(readHost).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1" });
  });

  it("runs a gh query through Rust and shows the CLI's own answer", async () => {
    vi.spyOn(consolePort, "readHost").mockResolvedValue(GITHUB);
    const runHosting = vi.spyOn(consolePort, "runHosting").mockResolvedValue({
      operationId: "prs", command: "gh pr list --limit 20", stdout: "#54  Bump jsdom  dependabot/jsdom\n", stderr: "",
      exitCode: 0, success: true, truncated: false, host: GITHUB, unavailable: null,
    });
    const run = vi.spyOn(consolePort, "run");
    const user = userEvent.setup();
    renderConsole();
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "prs{Enter}");
    expect(runHosting).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1", operationId: "prs" });
    expect(run).not.toHaveBeenCalled();
    expect(await screen.findByText(/Bump jsdom/)).toBeInTheDocument();
    expect(screen.getByText("gh pr list --limit 20", { selector: "code" })).toBeInTheDocument();
  });

  it("says why nothing ran on a project gh and glab can't answer for", async () => {
    vi.spyOn(consolePort, "readHost").mockResolvedValue({ ...GITHUB, kind: "bitbucket", host: "bitbucket.org" });
    vi.spyOn(consolePort, "runHosting").mockResolvedValue({
      operationId: "issues", command: null, stdout: "", stderr: "", exitCode: null, success: false, truncated: false,
      host: { ...GITHUB, kind: "bitbucket", host: "bitbucket.org" }, unavailable: "not_supported",
    });
    const user = userEvent.setup();
    renderConsole();
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "issues{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Bitbucket has no official command-line tool");
  });

  it("keeps the CLI's words and adds where to sign in when it has no login", async () => {
    vi.spyOn(consolePort, "readHost").mockResolvedValue(GITHUB);
    vi.spyOn(consolePort, "runHosting").mockResolvedValue({
      operationId: "runs", command: "gh run list --limit 20", stdout: "", stderr: "To get started with GitHub CLI, please run:  gh auth login",
      exitCode: 4, success: false, truncated: false, host: GITHUB, unavailable: "signed_out",
    });
    const user = userEvent.setup();
    renderConsole();
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "runs{Enter}");
    expect(await screen.findByText(/To get started with GitHub CLI/)).toBeInTheDocument();
    expect(screen.getByText("GitHub CLI (gh) has no account signed in for github.com. Connect one in Settings › GitHub, then try again.")).toBeInTheDocument();
  });

  it("shows the command for the project's provider in help", async () => {
    vi.spyOn(consolePort, "readHost").mockResolvedValue({ ...GITHUB, kind: "gitlab", host: "gitlab.com" });
    const user = userEvent.setup();
    renderConsole();
    await waitFor(() => expect(screen.getByRole("region", { name: "environment" })).toHaveTextContent("GitLab"));
    await user.type(screen.getByRole("combobox", { name: "Console command" }), "help{Enter}");
    const help = screen.getByRole("table", { name: "Available shortcuts (read-only)" });
    expect(help).toHaveTextContent("glab mr list --per-page 20");
    expect(help).not.toHaveTextContent("gh pr list");
  });
});
