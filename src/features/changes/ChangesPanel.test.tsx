import React, { useRef, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { ChangesPanel } from "./ChangesPanel";
import { changesPort, createChangesController, type ChangesController } from "./index";
import { LanguageProvider } from "../../i18n";
import { ToastProvider } from "../../shared/ui";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import type { WorkingTreeStatus } from "../status";
import { MARKDOWN_VIEW_STORAGE_KEY } from "./markdownPreference";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);
const defaultResizeObserver = globalThis.ResizeObserver;

// Inline diff marks split a line across spans; match its complete source text.
const sourceLine = (text: string) => (_content: string, element: Element | null): boolean =>
  element?.textContent === text && [...element.children].every(child => child.textContent !== text);

afterEach(() => {
  globalThis.ResizeObserver = defaultResizeObserver;
  // Vitest runs without `globals`, so Testing Library never registers its own
  // automatic cleanup — without this, every render in this file stacks up in
  // the same document and "get by role" starts finding duplicates.
  cleanup();
});

/** `ChangesPanel` no longer owns `selectedPath`, the save-version dialog's
 * open state, or the diff cache — all lifted so a project session can
 * remember them across navigation (see tasks 012 and 019). This wrapper plays
 * the same role `app/App.tsx` does in the real app: holding that state and
 * passing it down as controlled props. `diffCache` may be supplied by a test
 * that needs it to outlive a remount; otherwise each wrapper gets its own. */
function ControlledChangesPanel(
  props: Omit<
    React.ComponentProps<typeof ChangesPanel>,
    | "controller"
    | "sessionEpoch"
    | "selectedPath"
    | "onSelectedPathChange"
    | "onSaveCompleted"
    | "watcherState"
    | "confirmBeforeDiscarding"
    | "runGitHooks"
    | "onBeginDiscard"
    | "onDiscardClose"
    | "onDiscardPhaseChange"
    | "onOpenSettings"
    | "onGetChanges"
    | "onCheckRemote"
    | "onOpenHistory"
    | "onOpenConflicts"
    | "tabs"
  > & {
    controller?: ChangesController;
    /** The Work screen's tab pair, which the real app draws in the list
     * panel's header; a stub here, since the tabs are the screen's to test. */
    tabs?: React.ReactNode;
    /** Both default to the app's defaults, so only the tests that are about
     * these preferences have to mention them. */
    watcherState?: "starting" | "watching" | "off" | "unavailable";
    confirmBeforeDiscarding?: boolean;
    runGitHooks?: boolean;
    onOpenSettings?: () => void;
    onGetChanges?: () => void;
    onCheckRemote?: () => void;
    onOpenHistory?: () => void;
    onOpenConflicts?: () => void;
  },
): React.JSX.Element {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const ownController = useRef(createChangesController(changesPort));
  // The real app renders this inside its screen host; the panel's own
  // Ctrl/Cmd+S shortcut listens only while that host says it is active.
  const lifecycle = useRef(createScreenLifecycleController("active"));
  return (
    <ScreenLifecycleProvider controller={lifecycle.current}>
    <ChangesPanel
      {...props}
      tabs={props.tabs ?? <div role="tablist" aria-label="Changes or history" />}
      controller={props.controller ?? ownController.current}
      sessionEpoch="test-epoch"
      watcherState={props.watcherState ?? "watching"}
      confirmBeforeDiscarding={props.confirmBeforeDiscarding ?? true}
      runGitHooks={props.runGitHooks ?? false}
      selectedPath={selectedPath}
      onSelectedPathChange={setSelectedPath}
      onSaveCompleted={() => {}}
      onBeginDiscard={() => true}
      onDiscardClose={() => {}}
      onDiscardPhaseChange={() => {}}
      onOpenSettings={props.onOpenSettings ?? (() => {})}
      onGetChanges={props.onGetChanges ?? (() => {})}
      onCheckRemote={props.onCheckRemote ?? (() => {})}
      onOpenHistory={props.onOpenHistory ?? (() => {})}
      onOpenConflicts={props.onOpenConflicts ?? (() => {})}
    />
    </ScreenLifecycleProvider>
  );
}

const workingTree: WorkingTreeStatus = {
  isClean: false,
  counts: { changed: 1, new: 1, deleted: 0, renamed: 0, conflicted: 0, total: 2 },
  lineTotals: null,
  entries: [
    {
      path: "edited.txt",
      originalPath: null,
      category: "changed",
      isPrepared: false,
      hasUnpreparedChanges: true,
    },
    {
      path: "new.txt",
      originalPath: null,
      category: "new",
      isPrepared: false,
      hasUnpreparedChanges: true,
    },
  ],
  truncated: false,
  hasPreparedChanges: false,
  hasUnpreparedChanges: true,
  upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 },
};

describe("ChangesPanel Markdown preview", () => {
  beforeEach(() => localStorage.removeItem(MARKDOWN_VIEW_STORAGE_KEY));
  afterEach(() => localStorage.removeItem(MARKDOWN_VIEW_STORAGE_KEY));
  it("previews Markdown by default and uses text for another file", async () => {
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") return Promise.resolve({
        kind: "text", path: (args as { filePath: string }).filePath, originalPath: null,
        change: "changed", hunks: [], truncated: false,
      });
      if (command === "read_file_markdown") return Promise.resolve({ kind: "ready", beforeContent: null, content: "# Outside the diff\n\nComplete current document." });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const tree = { ...workingTree, entries: [
      { ...workingTree.entries[0], path: "README.md" },
      { ...workingTree.entries[1], path: "code.ts" },
    ] };
    render(<LanguageProvider><ToastProvider>
      <ControlledChangesPanel projectPath="/repo" workingTree={tree} workingTreeError={null}
        isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
    </ToastProvider></LanguageProvider>);
    await userEvent.click(screen.getByRole("button", { name: /^README\.md/ }));
    expect(await screen.findByRole("heading", { name: "Outside the diff" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Diff view \(Markdown preview\)/ })).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("read_file_markdown", { path: "/repo", sessionEpoch: "test-epoch", filePath: "README.md" });
    await userEvent.click(screen.getByRole("button", { name: /^code\.ts/ }));
    expect(screen.queryByRole("heading", { name: "Outside the diff" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /Diff view \(Unified\)/ }));
    expect(screen.queryByRole("menuitemradio", { name: "Markdown preview" })).not.toBeInTheDocument();
    expect(mockedInvoke.mock.calls.filter(([name]) => name === "read_file_markdown")).toHaveLength(1);
  });

  it("keeps Markdown and code choices separate and remembers documents across remounts", async () => {
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") return Promise.resolve({ kind: "text", path: (args as { filePath: string }).filePath, originalPath: null, change: "changed", hunks: [], truncated: false });
      if (command === "read_file_markdown") return Promise.resolve({ kind: "ready", beforeContent: null, content: "# Preview" });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const tree = { ...workingTree, entries: [{ ...workingTree.entries[0], path: "README.md" }, { ...workingTree.entries[1], path: "code.ts" }] };
    const mount = () => render(<LanguageProvider><ToastProvider><ControlledChangesPanel projectPath="/repo" workingTree={tree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onPublishNow={vi.fn()} /></ToastProvider></LanguageProvider>);
    const first = mount();
    await userEvent.click(screen.getByRole("button", { name: /^README\.md/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Diff view \(Markdown preview\)/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Split" }));
    expect(localStorage.getItem(MARKDOWN_VIEW_STORAGE_KEY)).toBe("split");
    await userEvent.click(screen.getByRole("button", { name: /^code\.ts/ }));
    await userEvent.click(await screen.findByRole("button", { name: /Diff view \(Unified\)/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Accessible text" }));
    await userEvent.click(screen.getByRole("button", { name: /^README\.md/ }));
    expect(await screen.findByRole("button", { name: /Diff view \(Split\)/ })).toBeInTheDocument();
    first.unmount();
    mockedInvoke.mockClear();
    mount();
    await userEvent.click(screen.getByRole("button", { name: /^README\.md/ }));
    expect(await screen.findByRole("button", { name: /Diff view \(Split\)/ })).toBeInTheDocument();
    expect(mockedInvoke.mock.calls.some(([name]) => name === "read_file_markdown")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: /Diff view \(Split\)/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Markdown preview" }));
    expect(await screen.findByRole("heading", { name: "Preview" })).toBeInTheDocument();
    expect(localStorage.getItem(MARKDOWN_VIEW_STORAGE_KEY)).toBe("markdown");
  });

  it.each(["error", "too-large", "complex"])("falls back honestly for %s and can retry without losing the preference", async (failure) => {
    mockedInvoke.mockReset();
    let attempts = 0;
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") return Promise.resolve({ kind: "text", path: (args as { filePath: string }).filePath, originalPath: null, change: "changed", hunks: [], truncated: false });
      if (command === "read_file_markdown") {
        if (++attempts > 1) return Promise.resolve({ kind: "ready", beforeContent: null, content: "# Recovered" });
        if (failure === "error") return Promise.reject(new Error("read failed"));
        return Promise.resolve(failure === "too-large" ? { kind: "too-large", limitBytes: 131072 } : { kind: "ready", beforeContent: null, content: `${"> ".repeat(90)}Nested` });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const tree = { ...workingTree, entries: [{ ...workingTree.entries[0], path: "README.md" }] };
    render(<LanguageProvider><ToastProvider><ControlledChangesPanel projectPath="/repo" workingTree={tree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onPublishNow={vi.fn()} /></ToastProvider></LanguageProvider>);
    await screen.findByText(/Showing text changes instead/);
    await userEvent.click(screen.getByRole("button", { name: /Diff view \(Unified\)/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Markdown preview" }));
    expect(await screen.findByRole("heading", { name: "Recovered" })).toBeInTheDocument();
    expect(screen.queryByText(/Showing text changes instead/)).not.toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("navigates oversized Markdown excerpts using only the existing diff and resets for another file", async () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") return Promise.resolve({ kind: "text", path: (args as { filePath: string }).filePath, originalPath: null, change: "changed", truncated: false,
        hunks: [10, 900].map((line) => ({ header: "", oldStart: line, oldLines: 1, newStart: line, newLines: 1, lines: [
          { kind: "deletion", content: `# Old ${line}`, oldLineNumber: line, newLineNumber: null },
          { kind: "addition", content: `# New ${line}`, oldLineNumber: null, newLineNumber: line },
        ] })) });
      if (command === "read_file_markdown") return Promise.resolve({ kind: "too-large", limitBytes: 131072 });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const tree = { ...workingTree, entries: [{ ...workingTree.entries[0], path: "DESIGN.md" }, { ...workingTree.entries[1], path: "README.md" }] };
    try {
      render(<LanguageProvider><ToastProvider><ControlledChangesPanel projectPath="/repo" workingTree={tree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onPublishNow={vi.fn()} /></ToastProvider></LanguageProvider>);
      expect(await screen.findByText(/Partial preview/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Previous change" })).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "Next change" }));
      expect(scroll).toHaveBeenCalledOnce();
      expect(document.querySelector("[data-current-markdown-change]")).toHaveTextContent("Old 10");
      await userEvent.click(screen.getByRole("button", { name: "Next change" }));
      expect(document.querySelector("[data-current-markdown-change]")).toHaveTextContent("Old 900");
      expect(screen.getByRole("button", { name: "Next change" })).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "Previous change" }));
      expect(document.querySelector("[data-current-markdown-change]")).toHaveTextContent("Old 10");
      expect(mockedInvoke.mock.calls.filter(([name]) => name === "read_file_markdown")).toHaveLength(1);
      expect(mockedInvoke.mock.calls.filter(([name]) => name === "read_file_lines")).toHaveLength(0);
      await userEvent.click(screen.getByRole("button", { name: /^README\.md/ }));
      await screen.findByText(/Partial preview/);
      expect(screen.getByRole("button", { name: "Previous change" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Next change" })).toBeEnabled();
      expect(document.querySelector("[data-current-markdown-change]")).toBeNull();
    } finally { Element.prototype.scrollIntoView = original; }
  });
});

describe("ChangesPanel folder view", () => {
  const nested: WorkingTreeStatus = {
    ...workingTree,
    counts: { changed: 2, new: 1, deleted: 0, renamed: 0, conflicted: 0, total: 3 },
    entries: [
      { path: "src/features/history/panel.tsx", originalPath: null, category: "changed", isPrepared: false, hasUnpreparedChanges: true },
      { path: "src/features/history/panel.css", originalPath: null, category: "new", isPrepared: false, hasUnpreparedChanges: true },
      { path: "README.md", originalPath: null, category: "changed", isPrepared: false, hasUnpreparedChanges: true },
    ],
  };

  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation((command) =>
      command === "read_file_diff"
        ? Promise.resolve({ kind: "unchanged", path: "README.md" })
        : Promise.reject(new Error(`Unexpected command: ${command}`)));
  });
  afterEach(() => localStorage.removeItem("gitodile-file-list-view"));

  function renderNested(): void {
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={nested} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );
  }

  it("keeps a valid selection across snapshots and falls back to the first tree file only when it disappears", async () => {
    const panel = (tree: WorkingTreeStatus) => (
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={tree} workingTreeError={null}
          isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>
    );
    const { rerender } = render(panel(nested));
    const first = () => screen.getByRole("button", { name: /^src\/features\/history\/panel\.css/ });
    expect(first()).toHaveAttribute("aria-current", "true");
    await userEvent.click(screen.getByRole("button", { name: /^README\.md/ }));
    rerender(panel({ ...nested, entries: [...nested.entries] }));
    expect(screen.getByRole("button", { name: /^README\.md/ })).toHaveAttribute("aria-current", "true");
    rerender(panel({
      ...workingTree, entries: nested.entries.filter((entry) => entry.path !== "README.md"),
    }));
    expect(first()).toHaveAttribute("aria-current", "true");
  });

  it("groups the files in compacted folders, folds them, and includes or leaves out a folder at once", async () => {
    renderNested();
    expect(screen.getByRole("button", { name: /^src\/features\/history\/panel\.css/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("File 1 of 3")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show files in folders" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem("gitodile-file-list-view")).toBe("list");
    expect(screen.queryByRole("button", { name: "src/features/history folder, 2 files" })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    const folder = screen.getByRole("button", { name: "src/features/history folder, 2 files" });
    expect(folder).toHaveAttribute("aria-expanded", "true");
    // Under its folder a file drops its own folder line.
    expect(document.querySelector(".changes-file-row--tree .changes-file-item__dir")).toBeNull();

    const box = screen.getByRole("checkbox", { name: "Include everything in src/features/history in this version" });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(screen.getByRole("checkbox", { name: "Include src/features/history/panel.tsx in this version" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include src/features/history/panel.css in this version" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Include README.md in this version" })).toBeChecked();

    await userEvent.click(screen.getByRole("checkbox", { name: "Include src/features/history/panel.css in this version" }));
    expect((box as HTMLInputElement).indeterminate).toBe(true);

    await userEvent.click(folder);
    expect(folder).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("checkbox", { name: "Include src/features/history/panel.tsx in this version" })).not.toBeInTheDocument();
  });
});

describe("ChangesPanel save selection", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") {
        return Promise.resolve({ kind: "unchanged", path: "edited.txt" });
      }
      if (command === "plan_save_version") {
        return Promise.resolve({
          operationKind: "history-mutation",
          requiresConfirmation: true,
          stateToken: "selection-token",
          branch: "main",
          isFirstVersion: false,
          totalFiles: 1,
          remainingFiles: 1,
          isPartial: true,
          hasPreparedChanges: false,
          counts: { changed: 1, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 1 },
          files: [],
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
  });

  it("selects everything by default and sends only the chosen files to the planner", async () => {
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );

    const edited = screen.getByRole("checkbox", { name: "Include edited.txt in this version" });
    const added = screen.getByRole("checkbox", { name: "Include new.txt in this version" });
    expect(edited).toBeChecked();
    expect(added).toBeChecked();
    // Two rows plus the open file's own header, which names its folder the
    // same way the row it was chosen from does.
    expect(screen.getAllByText("Project root")).toHaveLength(3);

    // Nothing selected is nothing to save: the box's action is disabled and
    // says why, and it asks Git for no plan.
    await userEvent.click(screen.getByRole("checkbox", { name: "Select none" }));
    await userEvent.type(screen.getByLabelText("Version name"), "just the edit");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(mockedInvoke).not.toHaveBeenCalledWith("plan_save_version", expect.anything());

    // Including one file plans for exactly that file, and the box's plan line
    // says what the press saves out of how many, and where.
    await userEvent.click(edited);
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("plan_save_version", {
        path: "/repo",
        sessionEpoch: "test-epoch",
        selectedPaths: ["edited.txt"],
      }),
    );
    expect(await screen.findByText("1 of 2 files")).toBeInTheDocument();
    expect(screen.queryByText("1 other file will remain as a pending change.")).not.toBeInTheDocument();
  });

  it("saves through the quick commit box docked under the file list — the screen's one save control", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") {
        return Promise.resolve({ kind: "unchanged", path: "edited.txt" });
      }
      if (command === "plan_save_version") {
        return Promise.resolve({
          operationKind: "history-mutation",
          requiresConfirmation: true,
          stateToken: "quick-token",
          branch: "main",
          isFirstVersion: false,
          totalFiles: 2,
          remainingFiles: 0,
          isPartial: false,
          hasPreparedChanges: false,
          counts: { changed: 1, new: 1, deleted: 0, renamed: 0, conflicted: 0, total: 2 },
          files: [],
        });
      }
      if (command === "save_version") {
        return Promise.resolve({
          commit: "abc123abc123abc123abc123abc123abc123ab",
          shortCommit: "abc123a",
          title: "quick fix",
          description: null,
          branch: "main",
          savedFiles: 2,
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );

    // The heading carries no save action of its own: the box is where a
    // version is saved from here, so nothing above it answers twice.
    expect(screen.queryByRole("button", { name: "Save version" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Version name"), "quick fix");
    // The box still asks Git for the plan that will write the version; it just
    // no longer restates the file count and the line beside the list and header
    // that already say them.
    await waitFor(() =>
      expect(mockedInvoke).toHaveBeenCalledWith("plan_save_version", {
        path: "/repo",
        sessionEpoch: "test-epoch",
        selectedPaths: ["edited.txt", "new.txt"],
      }),
    );
    expect(screen.queryByText(/will be saved to/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText('Saved “quick fix” as abc123a.')).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("plan_save_version", {
      path: "/repo",
      sessionEpoch: "test-epoch",
      selectedPaths: ["edited.txt", "new.txt"],
    });
    // The full dialog, with its own plan preview, never opened for this.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reuses a cached diff until the working-tree snapshot changes", async () => {
    const { container, rerender } = render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );
    const panel = within(container);

    // Screen arrival fetches only the file it actually presents. Whole-tree
    // speculative warming is activation/invalidation-owned by the runtime.
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(1));
    await userEvent.click(panel.getByRole("button", { name: /new\.txt/ }));
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(2));

    await userEvent.click(panel.getByRole("button", { name: /edited\.txt/ }));
    expect(mockedInvoke).toHaveBeenCalledTimes(2);

    rerender(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={{ ...workingTree }}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );

    // A new working-tree snapshot resets the store, so the selected file is
    // read again while speculative warming remains outside the screen.
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(3));
  });

  it("re-reads nothing when the screen is left and reopened on the same snapshot", async () => {
    // The regression this guards: the cache used to live in a ref inside
    // `ChangesPanel`, so navigating to another screen and back discarded it
    // and re-ran every read (task 019).
    const controller = createChangesController(changesPort);
    const panelElement = (
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          controller={controller}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>
    );

    const first = render(panelElement);
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(1));
    first.unmount();

    const { container } = render(panelElement);
    const panel = within(container);

    // Rendered straight from the cache, with no further Git work: the diff is
    // already on screen and the count is unchanged.
    expect(await panel.findByText("No content changed")).toBeInTheDocument();
    expect(screen.queryByText("Reading changes…")).not.toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it("only shows diff loading feedback when a read remains pending", async () => {
    // Keyed by path so the same helper also models returning to an in-flight
    // selection without relying on a fragile "last call wins" resolver.
    const resolvers = new Map<string, (diff: { kind: "unchanged"; path: string }) => void>();
    mockedInvoke.mockImplementation((_command, args) => {
      const filePath = (args as { filePath: string }).filePath;
      return new Promise((resolve) => {
        resolvers.set(filePath, resolve);
      });
    });

    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );

    expect(screen.queryByText("Reading changes…")).not.toBeInTheDocument();
    expect(await screen.findByText("Reading changes…")).toBeInTheDocument();

    resolvers.get("edited.txt")?.({ kind: "unchanged", path: "edited.txt" });
    await waitFor(() => expect(screen.queryByText("Reading changes…")).not.toBeInTheDocument());
  });

  it("shares an in-flight diff read when returning to the same file", async () => {
    const resolvers = new Map<string, (diff: { kind: "unchanged"; path: string }) => void>();
    mockedInvoke.mockImplementation((_command, args) => {
      const filePath = (args as { filePath: string }).filePath;
      return new Promise((resolve) => {
        resolvers.set(filePath, resolve);
      });
    });

    const { container } = render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );
    const panel = within(container);

    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(1));
    await userEvent.click(panel.getByRole("button", { name: /new\.txt/ }));
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(2));
    await userEvent.click(panel.getByRole("button", { name: /edited\.txt/ }));
    expect(mockedInvoke).toHaveBeenCalledTimes(2);

    resolvers.get("edited.txt")?.({ kind: "unchanged", path: "edited.txt" });
    resolvers.get("new.txt")?.({ kind: "unchanged", path: "new.txt" });
    await waitFor(() => expect(screen.queryByText("Reading changes…")).not.toBeInTheDocument());
  });

  it("renders a multi-hunk text diff through the virtualized line list", async () => {
    // Exercises the real `DiffHunkList` render path (every other test here
    // uses an "unchanged" diff, which never reaches it) under jsdom, which
    // has no real layout engine and no `ResizeObserver` by default — the
    // combination `@tanstack/react-virtual` needs to handle gracefully.
    let resizeCallback: ResizeObserverCallback | undefined;
    class CapturingResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = CapturingResizeObserver;

    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") {
        return Promise.resolve({
          kind: "text",
          path: "edited.txt",
          originalPath: null,
          change: "changed",
          truncated: false,
          hunks: [
            {
              header: "@@ -1,2 +1,2 @@",
              oldStart: 1,
              oldLines: 2,
              newStart: 1,
              newLines: 2,
              lines: [
                { kind: "context", content: "line one", oldLineNumber: 1, newLineNumber: 1 },
                { kind: "addition", content: "line two changed", oldLineNumber: null, newLineNumber: 2 },
                { kind: "addition", content: "\twide 界 and emoji 🙂", oldLineNumber: null, newLineNumber: 3 },
              ],
            },
            {
              header: "@@ -50,1 +50,1 @@",
              oldStart: 50,
              oldLines: 1,
              newStart: 50,
              newLines: 1,
              lines: [{ kind: "deletion", content: "line fifty removed", oldLineNumber: 50, newLineNumber: null }],
            },
          ],
        });
      }
      if (command === "read_working_tree_diffs") {
        return Promise.resolve({ outcome: "completed", diffs: [], changedFiles: 0, budgetBytes: 2097152 });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    const { container } = render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );

    expect(await screen.findByText("line one")).toBeInTheDocument();
    expect(screen.getByText("line two changed")).toBeInTheDocument();
    expect(screen.getByText("wide 界 and emoji 🙂", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show 47 unchanged lines" })).toBeInTheDocument();
    expect(screen.getByText("line fifty removed")).toBeInTheDocument();

    const diffViewport = container.querySelector<HTMLElement>(".diff-code");
    expect(diffViewport).not.toBeNull();
    Object.defineProperty(diffViewport, "clientWidth", { configurable: true, value: 360 });
    await act(async () => {
      resizeCallback?.([], {} as ResizeObserver);
    });
    expect(screen.getByText("wide 界 and emoji 🙂", { exact: false })).toBeInTheDocument();
  });
});

describe("ChangesPanel review controls", () => {
  /** jsdom has no `ResizeObserver`, which `DiffHunkList` observes to find its
   * wrap point. A no-op stand-in is enough: the virtualizer falls back to its
   * estimates, which is all these tests need. */
  class NoopResizeObserver implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  const editedDiff = {
    kind: "text",
    path: "edited.txt",
    originalPath: null,
    change: "changed",
    truncated: false,
    hunks: [
      {
        header: "@@ -1,2 +1,2 @@",
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 2,
        lines: [
          { kind: "deletion", content: "before one", oldLineNumber: 1, newLineNumber: null },
          { kind: "addition", content: "after one", oldLineNumber: null, newLineNumber: 1 },
        ],
      },
      {
        header: "@@ -50,1 +50,1 @@",
        oldStart: 50,
        oldLines: 1,
        newStart: 50,
        newLines: 1,
        lines: [{ kind: "addition", content: "after fifty", oldLineNumber: null, newLineNumber: 50 }],
      },
    ],
  };
  const newDiff = {
    kind: "text",
    path: "new.txt",
    originalPath: null,
    change: "new",
    truncated: false,
    hunks: [
      {
        header: "@@ -0,0 +1,1 @@",
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: 1,
        lines: [{ kind: "addition", content: "brand new", oldLineNumber: null, newLineNumber: 1 }],
      },
    ],
  };

  beforeEach(() => {
    globalThis.ResizeObserver = NoopResizeObserver;
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") {
        const path = (args as { filePath?: string; path?: string }).filePath;
        return Promise.resolve(path === "new.txt" ? newDiff : editedDiff);
      }
      if (command === "read_working_tree_diffs") {
        return Promise.resolve({
          outcome: "completed",
          diffs: [editedDiff, newDiff],
          changedFiles: 2,
          budgetBytes: 2097152,
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
  });

  function renderPanel(controller = createChangesController(changesPort)): void {
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          controller={controller}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );
  }

  it("opens with its list already there, and animates only a row that arrives later", () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") return Promise.resolve(editedDiff);
      if (command === "read_working_tree_diffs") {
        return Promise.resolve({ outcome: "completed", diffs: [editedDiff, newDiff], changedFiles: 2, budgetBytes: 2097152 });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const tree = (added: boolean): WorkingTreeStatus => added
      ? {
          ...workingTree,
          counts: { ...workingTree.counts, new: 2, total: 3 },
          entries: [...workingTree.entries, {
            path: "arrived-later.txt", originalPath: null, category: "new", isPrepared: false, hasUnpreparedChanges: true,
          }],
        }
      : workingTree;
    const panel = (added: boolean): React.JSX.Element => (
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={tree(added)}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>
    );

    const { container, rerender } = render(panel(false));
    // A work surface is readable the instant it opens — nothing assembles.
    expect(container.querySelector(".changes-file-row.row-in")).toBeNull();

    rerender(panel(true));

    const list = within(container.querySelector(".changes-file-list") as HTMLElement);
    expect(list.getByText("arrived-later.txt").closest(".changes-file-row")).toHaveClass("row-in");
    // A row the screen already showed does not re-run the arrival.
    expect(list.getByText("edited.txt").closest(".changes-file-row")).not.toHaveClass("row-in");
  });

  it("draws the include control as a node, marks the open row, and toggles from the node", async () => {
    renderPanel();
    await screen.findByText("File 1 of 2");

    const openBox = screen.getByRole("checkbox", { name: "Include edited.txt in this version" });
    const openRow = openBox.closest("li");
    expect(openRow).toHaveClass("changes-file-row--active");
    expect(openBox).toHaveClass("inclusion-node__input");
    expect(openBox.closest(".changes-file-row__pick")).not.toBeNull();
    const node = openBox.nextElementSibling;
    expect(node).toHaveClass("inclusion-node__mark");

    // The visible node is inside the label: pressing it must work without
    // aiming at the 1px native input.
    await userEvent.click(node as HTMLElement);
    expect(openBox).not.toBeChecked();

    const otherRow = screen.getByRole("checkbox", { name: "Include new.txt in this version" }).closest("li");
    expect(otherRow).not.toHaveClass("changes-file-row--active");
  });

  it("expands the unchanged lines between hunks, and keeps a marker for the rest", async () => {
    // The first hunk covers old lines 1-2, the second starts at old line 50,
    // so the gap is 47 lines starting at new line 3. The stub returns two.
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") {
        return Promise.resolve(editedDiff);
      }
      if (command === "read_working_tree_diffs") {
        return Promise.resolve({
          outcome: "completed",
          diffs: [editedDiff, newDiff],
          changedFiles: 2,
          budgetBytes: 2097152,
        });
      }
      if (command === "read_file_lines") {
        expect(args).toMatchObject({ path: "/repo", filePath: "edited.txt", startLine: 3, endLine: 49 });
        return Promise.resolve({ startLine: 3, lines: ["context three", "context four"], truncated: true });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Show 47 unchanged lines" }));

    expect(await screen.findByText("context three")).toBeInTheDocument();
    expect(screen.getByText("context four")).toBeInTheDocument();
    // 47 hidden, 2 fetched — the rest stays openable rather than stranding
    // the gap half-open.
    expect(screen.getByRole("button", { name: "Show 45 unchanged lines" })).toBeInTheDocument();
  });

  it("reports a failed expansion in place instead of losing the diff", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") {
        return Promise.resolve(editedDiff);
      }
      if (command === "read_working_tree_diffs") {
        return Promise.resolve({
          outcome: "completed",
          diffs: [editedDiff, newDiff],
          changedFiles: 2,
          budgetBytes: 2097152,
        });
      }
      if (command === "read_file_lines") {
        return Promise.reject(new Error("nope"));
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Show 47 unchanged lines" }));

    expect(await screen.findByText("Couldn't read those lines.")).toBeInTheDocument();
    // The diff itself is untouched, and the marker is still a live retry.
    expect(screen.getByText(sourceLine("before one"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show 47 unchanged lines" })).toBeEnabled();
  });

  it("heads the list panel with the Work tabs and the search strip with the include-everything checkbox, with every action over the list", () => {
    renderPanel();

    // No page row over the two panels, and no title of its own: the list
    // panel's card header is the Work screen's tab pair (task 126).
    expect(document.querySelector(".screen-header")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    const list = screen.getByRole("navigation", { name: "Changed files" });
    const header = list.querySelector(".changes-file-list__header");
    if (!(header instanceof HTMLElement)) throw new Error("no panel header");
    expect(within(header).getByRole("tablist", { name: "Changes or history" })).toBeInTheDocument();
    // The include-everything checkbox heads the search strip; the tree's
    // counts are the Journey band's and the status bar's to say, so the list
    // has no state row between the strip and its rows.
    const toolbar = list.querySelector(".changes-file-list__toolbar");
    if (!(toolbar instanceof HTMLElement)) throw new Error("no search strip");
    expect(within(toolbar).getByRole("checkbox", { name: "Select none" })).toBeChecked();
    expect(within(toolbar).getByRole("searchbox", { name: "Search changed files" })).toBeInTheDocument();
    expect(list.querySelector(".changes-file-list__state")).toBeNull();
    expect(screen.queryByLabelText("1 edited · 1 new")).not.toBeInTheDocument();
    // Discarding acts on the files, so its menu ends the strip that heads
    // them — never inside the save box docked under them.
    expect(within(toolbar).getByRole("button", { name: "Discard or restore changes" })).toBeEnabled();
    const foot = list.querySelector(".changes-file-list__foot");
    if (!(foot instanceof HTMLElement)) throw new Error("no save box foot");
    expect(within(foot).getByLabelText("Version name")).toBeInTheDocument();
    expect(within(foot).queryByRole("button", { name: "Discard or restore changes" })).not.toBeInTheDocument();
  });

  it("narrows the file list as the user searches, and explains an empty result", async () => {
    renderPanel();

    const search = screen.getByRole("searchbox", { name: "Search changed files" });
    await userEvent.type(search, "new");

    expect(screen.queryByRole("button", { name: /^edited\.txt/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^new\.txt/ })).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    expect(screen.getByText("No changed file matches your search.")).toBeInTheDocument();
  });

  it("drops the file counter when a search excludes the file that is open", async () => {
    renderPanel();

    // "edited.txt" is selected by default; searching for the other file
    // narrows the list without changing what the diff pane shows.
    expect(await screen.findByText("File 1 of 2")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search changed files" }), "new");

    expect(screen.queryByText(/^File \d+ of/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous file" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next file" })).toBeDisabled();
  });

  it("steps between files with the header's arrows, disabling them at each end", async () => {
    renderPanel();

    expect(await screen.findByText("File 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous file" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next file" }));

    expect(await screen.findByText("File 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next file" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous file" })).toBeEnabled();
  });

  it("counts the current file's changes and steps through them", async () => {
    renderPanel();

    expect(await screen.findByText("Change 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous change" })).toBeDisabled();
    expect(document.querySelector(".diff-row--current")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Next change" }));

    expect(screen.getByText("Change 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next change" })).toBeDisabled();
    // This class exposes the change the arrows stand on; a file switch clears it.
    expect(document.querySelector(".diff-row--current")).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Next file" }));
    await screen.findByText("brand new");
    expect(document.querySelector(".diff-row--current")).toBeNull();
  });

  it("finds text in the open difference, and its one X closes the find", async () => {
    renderPanel();
    await screen.findByText(sourceLine("after one"));

    // The find is an icon until asked for, so it spends no width at rest.
    expect(screen.queryByPlaceholderText("Search in diff")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Search in the selected file's changes" }));

    await userEvent.type(screen.getByPlaceholderText("Search in diff"), "fifty");
    await waitFor(() =>
      expect(document.querySelector(".diff-search-match")).toHaveTextContent("fifty"),
    );

    // The pill's single X ends the find and clears the highlight with it. The
    // field plays a short exit before it unmounts, so the absence is awaited.
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Search in diff")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Search in the selected file's changes" })).toBeInTheDocument();
    expect(document.querySelector(".diff-search-match")).toBeNull();
  });

  it("switches the diff to the side-by-side view and keeps the choice across files", async () => {
    const { container } = render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={workingTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );

    expect(await screen.findByText(sourceLine("before one"))).toBeInTheDocument();
    expect(container.querySelector(".diff-split-row")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Diff view (Unified)" }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "Split" }));

    await waitFor(() => expect(container.querySelector(".diff-split-row")).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Next file" }));

    expect(await screen.findByText("brand new")).toBeInTheDocument();
    expect(container.querySelector(".diff-split-row")).not.toBeNull();
  });

  it("keeps a thousand-file truncated project below the DOM row budget", async () => {
    const entries = Array.from({ length: 1000 }, (_, index) => ({
      path: `file-${index.toString().padStart(4, "0")}.txt`,
      originalPath: null,
      category: "changed" as const,
      isPrepared: false,
      hasUnpreparedChanges: true,
    }));
    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") {
        return Promise.resolve({ kind: "unchanged", path: entries[0].path });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });

    const { container } = render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/large-repo"
          workingTree={{
            ...workingTree,
            counts: { changed: 5000, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 5000 },
            entries,
            truncated: true,
          }}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );

    await screen.findByRole("button", { name: /file-0000\.txt/ });
    const rows = container.querySelectorAll(".changes-file-row");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(40);
    expect(rows[0]).toHaveAttribute("aria-setsize", "1000");
    expect(screen.queryByRole("button", { name: /file-0999\.txt/ })).not.toBeInTheDocument();
  });

  it("offers the complete diff as accessible text and supports menu keyboard navigation", async () => {
    renderPanel();

    await screen.findByText(sourceLine("before one"));
    await userEvent.click(screen.getByRole("button", { name: "Diff view (Unified)" }));

    const unified = screen.getByRole("menuitemradio", { name: "Unified" });
    expect(unified).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitemradio", { name: "Accessible text" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    const completeDiff = screen.getByLabelText("All changes as accessible text");
    expect(completeDiff).toHaveTextContent("@@ -1,2 +1,2 @@");
    expect(completeDiff).toHaveTextContent("-before one");
    expect(completeDiff).toHaveTextContent("+after fifty");
    expect(screen.queryByRole("button", { name: "Next change" })).not.toBeInTheDocument();
  });

  it("keeps discard in one compact menu and confirms the selected file with recovery", async () => {
    let recoveryReads = 0;
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") return Promise.resolve({ kind: "unchanged", path: "edited.txt", originalPath: null, change: "changed" });
      if (command === "get_discard_recovery") {
        recoveryReads += 1;
        return recoveryReads === 1
          ? Promise.reject({ code: "recovery_unavailable", message: "none" })
          : Promise.resolve({ recoveryId: "discard-1", createdAtMs: 1, fileCount: 1, selectedPath: "edited.txt", stateToken: "after" });
      }
      if (command === "plan_discard_changes") {
        expect(args).toMatchObject({ selectedPath: "edited.txt", sessionEpoch: "test-epoch" });
        return Promise.resolve({
          operationKind: "destructive", stateToken: "before", fileCount: 1,
          counts: { changed: 1, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 1 },
          selectedPath: "edited.txt", affectsPreparedChanges: false, removesUntrackedFiles: false,
          includesConflicts: false, isUnborn: false, recovery: "local", requiresConfirmation: true,
        });
      }
      if (command === "discard_changes") {
        expect(args).toMatchObject({ selectedPath: "edited.txt", stateToken: "before" });
        return Promise.resolve({
          discardedFiles: 1,
          recovery: { recoveryId: "discard-1", createdAtMs: 1, fileCount: 1, selectedPath: "edited.txt", stateToken: "after" },
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );
    await screen.findByRole("button", { name: /edited\.txt/ });
    await userEvent.click(screen.getByRole("button", { name: "Discard or restore changes" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Discard this file's changes…" }));
    expect(await screen.findByRole("heading", { name: "Discard changes?" })).toBeInTheDocument();
    await screen.findByText("“edited.txt” goes back to its last saved version.");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    // Done means closed: the result and its undo are a toast, not a dialog.
    expect(await screen.findByText("1 file is back to its last saved version.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo discard" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers only Copy when code is right-clicked and copies the exact selection", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    mockedInvoke.mockImplementation((command) => command === "read_file_diff"
      ? Promise.resolve({
          kind: "text", path: "edited.txt", originalPath: null, change: "changed", truncated: false,
          hunks: [{ header: "@@ -1 +1 @@", oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [
            { kind: "addition", content: "\tconst área = 'منطقة';", oldLineNumber: null, newLineNumber: 1 },
          ] }],
        })
      : Promise.reject(new Error(`Unexpected command: ${command}`)));
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );
    const code = await screen.findByText("const área = ", { exact: false });
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(code.closest(".diff-line__content") ?? code);
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.contextMenu(code, { clientX: 200, clientY: 240 });
    const menu = screen.getByRole("menu", { name: "Context actions" });
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("\tconst área = 'منطقة';");
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("right-clicking a file offers discard for that exact file", async () => {
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") return Promise.resolve({ kind: "unchanged", path: "edited.txt", originalPath: null, change: "changed" });
      if (command === "plan_discard_changes") {
        expect(args).toMatchObject({ selectedPath: "new.txt" });
        return Promise.resolve({
          operationKind: "destructive", stateToken: "new-file", fileCount: 1,
          counts: { changed: 0, new: 1, deleted: 0, renamed: 0, conflicted: 0, total: 1 },
          selectedPath: "new.txt", affectsPreparedChanges: false, removesUntrackedFiles: true,
          includesConflicts: false, isUnborn: false, recovery: "local", requiresConfirmation: true,
        });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );
    const file = await screen.findByRole("button", { name: /new\.txt/ });
    fireEvent.contextMenu(file, { clientX: 180, clientY: 220 });
    await userEvent.click(screen.getByRole("menuitem", { name: "Discard changes…" }));
    expect(await screen.findByText("“new.txt” goes back to its last saved version.")).toBeInTheDocument();
  });

  it("says the screen has stopped updating itself, beside the refresh that replaces it", async () => {
    mockedInvoke.mockImplementation((command) => command === "read_file_diff"
      ? Promise.resolve({ kind: "unchanged", path: "edited.txt", originalPath: null, change: "changed" })
      : Promise.reject(new Error(`Unexpected command: ${command}`)));
    const onRefresh = vi.fn();
    const onOpenSettings = vi.fn();
    const panel = (isCheckingChanges: boolean) => <LanguageProvider><ToastProvider>
      <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={isCheckingChanges} watcherState="off" onRefresh={onRefresh} onOpenSettings={onOpenSettings} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
    </ToastProvider></LanguageProvider>;
    const view = render(panel(false));

    const description = await screen.findByText("This screen may be out of date.");
    expect(description).toBeInTheDocument();
    const notice = description.closest(".automatic-updates-notice");
    // One line: title and explanation share the notice's body, the
    // explanation cut short with the whole of it on its tooltip.
    expect(description).toHaveAttribute("title", "This screen may be out of date.");
    expect(description.parentElement).toHaveClass("automatic-updates-notice__body");
    expect(description.parentElement).toHaveTextContent(/^Automatic updates are off/);
    const tabs = screen.getByRole("tablist", { name: "Changes or history" });
    expect(notice).not.toBeNull();
    expect((notice as HTMLElement).compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const update = screen.getByRole("button", { name: "Check local changes" });
    const settings = screen.getByRole("button", { name: "Turn on automatic updates" });
    expect(update).toHaveClass("ghost-button");
    expect(settings).toHaveClass("ghost-button");
    await userEvent.click(update);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Check local changes" })).toHaveTextContent("Update now");
    view.rerender(panel(true));
    expect(screen.getByText("Automatic updates are off")).toBeInTheDocument();
    const busyUpdate = screen.getByRole("button", { name: "Looking at your project files." });
    expect(busyUpdate).toHaveTextContent("Updating…");
    expect(busyUpdate.querySelector(".icon--spinning")).not.toBeNull();
    view.rerender(panel(false));
    await userEvent.click(screen.getByRole("button", { name: "Turn on automatic updates" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("keeps the notice away while the project is being watched", async () => {
    mockedInvoke.mockImplementation((command) => command === "read_file_diff"
      ? Promise.resolve({ kind: "unchanged", path: "edited.txt", originalPath: null, change: "changed" })
      : Promise.reject(new Error(`Unexpected command: ${command}`)));
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );

    await screen.findByRole("button", { name: /edited\.txt/ });
    expect(
      screen.queryByText("This screen may be out of date."),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Check local changes" })).not.toBeInTheDocument();
  });

  it("keeps transitional watcher startup quiet", async () => {
    mockedInvoke.mockImplementation((command) => command === "read_file_diff"
      ? Promise.resolve({ kind: "unchanged", path: "edited.txt", originalPath: null, change: "changed" })
      : Promise.reject(new Error(`Unexpected command: ${command}`)));
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} watcherState="starting" onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );

    await screen.findByRole("button", { name: /edited\.txt/ });
    expect(screen.queryByRole("button", { name: "Check local changes" })).not.toBeInTheDocument();
    expect(screen.queryByText("Automatic updates are off")).not.toBeInTheDocument();
  });

  it("keeps manual recovery visible when native watching is unavailable", async () => {
    mockedInvoke.mockImplementation((command) => command === "read_file_diff"
      ? Promise.resolve({ kind: "unchanged", path: "edited.txt", originalPath: null, change: "changed" })
      : Promise.reject(new Error(`Unexpected command: ${command}`)));
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} watcherState="unavailable" onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );

    expect(await screen.findByText("Automatic updates aren't available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check local changes" })).toBeEnabled();
  });

  it("discards without asking when the confirmation is off, and still offers the undo", async () => {
    const discarded: unknown[] = [];
    let restores = 0;
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") return Promise.resolve({ kind: "unchanged", path: "edited.txt", originalPath: null, change: "changed" });
      if (command === "get_discard_recovery") return Promise.reject({ code: "recovery_unavailable", message: "none" });
      if (command === "plan_discard_changes") {
        return Promise.resolve({
          operationKind: "destructive", stateToken: "before", fileCount: 2,
          counts: { changed: 1, new: 1, deleted: 0, renamed: 0, conflicted: 0, total: 2 },
          selectedPath: null, affectsPreparedChanges: false, removesUntrackedFiles: true,
          includesConflicts: false, isUnborn: false, recovery: "local", requiresConfirmation: true,
        });
      }
      if (command === "discard_changes") {
        discarded.push(args);
        return Promise.resolve({
          discardedFiles: 2,
          recovery: { recoveryId: "discard-1", createdAtMs: 1, fileCount: 2, selectedPath: null, stateToken: "after" },
        });
      }
      if (command === "restore_discarded_changes") {
        restores += 1;
        expect(args).toMatchObject({ recoveryId: "discard-1", stateToken: "after" });
        return Promise.resolve({ restoredFiles: 2 });
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} confirmBeforeDiscarding={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );

    await screen.findByRole("button", { name: /edited\.txt/ });
    await userEvent.click(screen.getByRole("button", { name: "Discard or restore changes" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Discard all changes…" }));

    // No dialog, no second click: the work is gone and the screen says so.
    expect(await screen.findByText("2 files are back to their last saved version.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Discard all unsaved changes?" })).toBeNull();
    expect(discarded).toEqual([
      { path: "/repo", sessionEpoch: "test-epoch", selectedPath: null, stateToken: "before" },
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Undo discard" }));
    expect(await screen.findByText("2 files restored.")).toBeInTheDocument();
    expect(restores).toBe(1);
  });

  it("lists every stored discard, says why one cannot be restored, and restores the chosen one", async () => {
    const restores: unknown[] = [];
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") return Promise.resolve({ kind: "unchanged", path: "edited.txt", originalPath: null, change: "changed" });
      if (command === "get_discard_recovery") {
        return Promise.resolve({ recoveryId: "discard-2", createdAtMs: 2, fileCount: 2, selectedPath: null, stateToken: "token-2" });
      }
      if (command === "list_discard_recoveries") {
        expect(args).toMatchObject({ path: "/repo", sessionEpoch: "test-epoch" });
        return Promise.resolve([
          {
            recoveryId: "discard-2", createdAtMs: 1756000000000, fileCount: 2, selectedPath: null,
            previewPaths: ["edited.txt", "new.txt"], stateToken: "token-2", availability: "restorable",
            restoresPreparedState: true,
          },
          {
            recoveryId: "discard-1", createdAtMs: 1755000000000, fileCount: 5, selectedPath: null,
            previewPaths: ["a.txt", "b.txt", "c.txt", "d.txt"], stateToken: "token-1", availability: "superseded",
            restoresPreparedState: false,
          },
        ]);
      }
      if (command === "restore_discarded_changes") {
        restores.push(args);
        return Promise.resolve(null);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );

    await screen.findByRole("button", { name: /edited\.txt/ });
    await userEvent.click(screen.getByRole("button", { name: "Discard or restore changes" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Restore discarded changes…" }));

    expect(await screen.findByRole("heading", { name: "Restore discarded changes" })).toBeInTheDocument();
    // Only what can be applied is an option, and the newest of those is chosen
    // for you. Cancel sits beside Restore, like every other dialog.
    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(1);
    expect(options[0]).toBeChecked();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    // The one whose own files were written again is kept and folded away —
    // its copy is still on disk — and says why when asked for.
    expect(screen.queryByText("a.txt, b.txt, c.txt, d.txt and 1 more")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "1 more can't be restored now" }));
    expect(screen.getByText("a.txt, b.txt, c.txt, d.txt and 1 more")).toBeInTheDocument();
    expect(screen.getByText(/A file changed since, so restoring would overwrite newer work/)).toBeInTheDocument();
    // This one matches the project as a whole, so it says nothing about
    // prepared changes: it puts them back with the files.
    expect(screen.queryByText(/Prepared changes stay/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(await screen.findByText("2 files restored.")).toBeInTheDocument();
    expect(restores).toEqual([
      { path: "/repo", sessionEpoch: "test-epoch", recoveryId: "discard-2", stateToken: "token-2" },
    ]);
  });

  it("says a record that only brings its files back will leave prepared changes alone", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") return Promise.resolve({ kind: "unchanged", path: "edited.txt", originalPath: null, change: "changed" });
      if (command === "get_discard_recovery") {
        return Promise.resolve({ recoveryId: "discard-1", createdAtMs: 1, fileCount: 1, selectedPath: null, stateToken: "token-1" });
      }
      if (command === "list_discard_recoveries") {
        return Promise.resolve([
          {
            recoveryId: "discard-1", createdAtMs: 1756000000000, fileCount: 1, selectedPath: "gone.txt",
            previewPaths: ["gone.txt"], stateToken: "token-1", availability: "restorable",
            // Work happened elsewhere in the project since, so this record's
            // copy of the index is the older one and stays out of it.
            restoresPreparedState: false,
          },
        ]);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );

    await screen.findByRole("button", { name: /edited\.txt/ });
    await userEvent.click(screen.getByRole("button", { name: "Discard or restore changes" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Restore discarded changes…" }));

    expect(await screen.findByRole("radio")).toBeChecked();
    expect(screen.getByText(/leaves prepared changes as they are/)).toBeInTheDocument();
  });

  it("asks before deleting a stored copy, and lists what is left afterwards", async () => {
    const deleted: unknown[] = [];
    const record = (id: string, path: string) => ({
      recoveryId: id, createdAtMs: 1756000000000, fileCount: 1, selectedPath: path,
      previewPaths: [path], stateToken: `token-${id}`, availability: "restorable" as const,
      restoresPreparedState: true,
    });
    mockedInvoke.mockImplementation((command, args) => {
      if (command === "read_file_diff") return Promise.resolve({ kind: "unchanged", path: "edited.txt", originalPath: null, change: "changed" });
      if (command === "get_discard_recovery") {
        return Promise.resolve({ recoveryId: "keep", createdAtMs: 1, fileCount: 1, selectedPath: null, stateToken: "token-keep" });
      }
      if (command === "list_discard_recoveries") {
        return Promise.resolve(
          deleted.length === 0
            ? [record("gone", "doomed.txt"), record("keep", "kept.txt")]
            : [record("keep", "kept.txt")],
        );
      }
      if (command === "delete_discard_recovery") {
        deleted.push(args);
        return Promise.resolve(null);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );

    await screen.findByRole("button", { name: /edited\.txt/ });
    await userEvent.click(screen.getByRole("button", { name: "Discard or restore changes" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Restore discarded changes…" }));
    expect(await screen.findByText("doomed.txt")).toBeInTheDocument();

    // One click asks; it never deletes. There is no undo behind this one.
    await userEvent.click(screen.getAllByRole("button", { name: "Delete this copy" })[0]);
    expect(screen.getByText("Delete this copy?")).toBeInTheDocument();
    expect(deleted).toEqual([]);

    // And it can be called off without touching anything.
    await userEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByText("Delete this copy?")).not.toBeInTheDocument();
    expect(deleted).toEqual([]);

    await userEvent.click(screen.getAllByRole("button", { name: "Delete this copy" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Delete copy" }));

    await waitFor(() => expect(deleted).toEqual([
      { path: "/repo", sessionEpoch: "test-epoch", recoveryId: "gone" },
    ]));
    // The list says what happened better than a sentence would.
    await waitFor(() => expect(screen.queryByText("doomed.txt")).not.toBeInTheDocument());
    expect(screen.getByText("kept.txt")).toBeInTheDocument();
  });

  it("reports a restore another screen finished as it arrives", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "get_discard_recovery") {
        return Promise.reject(new Error("none"));
      }
      if (command === "list_discard_recoveries") {
        return Promise.resolve([]);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const onRestoredElsewhereHandled = vi.fn();
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} restoredElsewhere={{ status: "restored", restoredFiles: 2 }} onRestoredElsewhereHandled={onRestoredElsewhereHandled} />
      </ToastProvider></LanguageProvider>,
    );

    // Overview's restore picker restored the files and moved here: the header
    // says so, as if this screen's own dialog had run it, and only once.
    expect(await screen.findByText("2 files restored.")).toBeInTheDocument();
    expect(onRestoredElsewhereHandled).toHaveBeenCalledOnce();
    expect(screen.queryByRole("heading", { name: "Restore discarded changes" })).not.toBeInTheDocument();
  });

  it("keeps a way back to discarded work after the last change is discarded", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "get_discard_recovery") {
        return Promise.resolve({ recoveryId: "discard-1", createdAtMs: 1, fileCount: 1, selectedPath: null, stateToken: "token-1" });
      }
      if (command === "list_discard_recoveries") {
        return Promise.resolve([
          {
            recoveryId: "discard-1", createdAtMs: 1756000000000, fileCount: 1, selectedPath: null,
            previewPaths: ["gone.txt"], stateToken: "token-1", availability: "restorable" as const,
            restoresPreparedState: true,
          },
        ]);
      }
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const clean: WorkingTreeStatus = {
      ...workingTree,
      isClean: true,
      counts: { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 0 },
      entries: [],
      hasUnpreparedChanges: false,
    };
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={clean} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );

    // Discarding everything takes the file list away, and its menu with it.
    // A clean tree with no upstream reads as a local-only project, not as
    // "nothing to review".
    expect(
      screen.getByRole("heading", { name: "Everything is saved on this computer" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard or restore changes" })).not.toBeInTheDocument();

    // The door to what was discarded has to survive that.
    await userEvent.click(await screen.findByRole("button", { name: "Restore discarded changes…" }));
    expect(await screen.findByRole("heading", { name: "Restore discarded changes" })).toBeInTheDocument();
    expect(screen.getByText("gone.txt")).toBeInTheDocument();
  });

  it("says so plainly when nothing has been discarded yet", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") return Promise.resolve({ kind: "unchanged", path: "edited.txt", originalPath: null, change: "changed" });
      if (command === "get_discard_recovery") return Promise.reject({ code: "recovery_unavailable", message: "none" });
      if (command === "list_discard_recoveries") return Promise.resolve([]);
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );

    await screen.findByRole("button", { name: /edited\.txt/ });
    await userEvent.click(screen.getByRole("button", { name: "Discard or restore changes" }));
    // Nothing stored, so the door to the picker is not offered at all.
    expect(await screen.findByRole("menuitem", { name: "Discard all changes…" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Restore discarded changes…" })).not.toBeInTheDocument();
  });

  it("still confirms when the preference is on", async () => {
    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") return Promise.resolve({ kind: "unchanged", path: "edited.txt", originalPath: null, change: "changed" });
      if (command === "get_discard_recovery") return Promise.reject({ code: "recovery_unavailable", message: "none" });
      if (command === "plan_discard_changes") {
        return Promise.resolve({
          operationKind: "destructive", stateToken: "before", fileCount: 2,
          counts: { changed: 1, new: 1, deleted: 0, renamed: 0, conflicted: 0, total: 2 },
          selectedPath: null, affectsPreparedChanges: false, removesUntrackedFiles: false,
          includesConflicts: false, isUnborn: false, recovery: "local", requiresConfirmation: true,
        });
      }
      if (command === "discard_changes") throw new Error("discarded without confirming");
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel projectPath="/repo" workingTree={workingTree} workingTreeError={null} isCheckingChanges={false} onRefresh={vi.fn()} onGetChanges={vi.fn()} onPublishNow={vi.fn()} />
      </ToastProvider></LanguageProvider>,
    );

    await screen.findByRole("button", { name: /edited\.txt/ });
    await userEvent.click(screen.getByRole("button", { name: "Discard or restore changes" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Discard all changes…" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("ChangesPanel clean state", () => {
  type Upstream = { upstream: string | null; ahead: number; behind: number };

  function cleanTree(upstream: Upstream): WorkingTreeStatus {
    return {
      ...workingTree,
      isClean: true,
      counts: { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: 0 },
      entries: [],
      hasUnpreparedChanges: false,
      upstream: { branch: "main", ...upstream },
    };
  }

  function renderClean({
    upstream,
    headState,
    isCheckingRemote,
    onGetChanges = vi.fn(),
    onCheckRemote = vi.fn(),
    onOpenHistory = vi.fn(),
    onPublishNow = vi.fn(),
    onOpenSettings = vi.fn(),
  }: {
    upstream: Upstream;
    headState?: "branch" | "detached" | "unborn";
    isCheckingRemote?: boolean;
    onGetChanges?: () => void;
    onCheckRemote?: () => void;
    onOpenHistory?: () => void;
    onPublishNow?: () => void;
    onOpenSettings?: () => void;
  }) {
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={cleanTree(upstream)}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onPublishNow={onPublishNow}
          onGetChanges={onGetChanges}
          onCheckRemote={onCheckRemote}
          onOpenHistory={onOpenHistory}
          onOpenSettings={onOpenSettings}
          {...(headState ? { headState } : {})}
          {...(isCheckingRemote ? { isCheckingRemote } : {})}
        />
      </ToastProvider></LanguageProvider>,
    );
    return { onGetChanges, onCheckRemote, onOpenHistory, onPublishNow, onOpenSettings };
  }

  it("offers to publish when saved versions are still only local", async () => {
    const { onPublishNow, onGetChanges, onCheckRemote, onOpenHistory } = renderClean({
      upstream: { upstream: "origin/main", ahead: 4, behind: 0 },
    });

    expect(screen.getByRole("heading", { name: "All changes are saved" })).toBeInTheDocument();
    expect(screen.getByText(/4 saved versions/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Publish 4 versions" }));
    expect(onPublishNow).toHaveBeenCalledTimes(1);

    // Nothing is known to be waiting, so the offer is to ask, not to get.
    expect(screen.queryByRole("button", { name: "Get project changes" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Check for project changes" }));
    expect(onCheckRemote).toHaveBeenCalledTimes(1);
    expect(onGetChanges).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "View history" }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("brings changes in first when the remote is ahead", async () => {
    const { onGetChanges, onPublishNow } = renderClean({
      upstream: { upstream: "origin/main", ahead: 0, behind: 2 },
    });

    expect(screen.getByText(/2 newer versions are available/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Get project changes" }));
    expect(onGetChanges).toHaveBeenCalledTimes(1);
    expect(onPublishNow).not.toHaveBeenCalled();
  });

  it("says everything is settled when there is nothing to send or receive", () => {
    renderClean({ upstream: { upstream: "origin/main", ahead: 0, behind: 0 } });

    expect(screen.getByRole("heading", { name: "You're all caught up" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get project changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for project changes" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "View history" })).toBeInTheDocument();
  });

  it("holds the check while one is already asking the remote", () => {
    renderClean({ upstream: { upstream: "origin/main", ahead: 0, behind: 0 }, isCheckingRemote: true });

    const check = screen.getByRole("button", { name: "Check for project changes" });
    expect(check).toBeDisabled();
    expect(check).toHaveAttribute("aria-busy", "true");
  });

  it("points to project settings when there is no remote", async () => {
    const { onOpenSettings } = renderClean({ upstream: { upstream: null, ahead: 0, behind: 0 } });

    expect(
      screen.getByRole("heading", { name: "Everything is saved on this computer" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open project settings" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("names an empty project without offering a publish", () => {
    renderClean({ upstream: { upstream: null, ahead: 0, behind: 0 }, headState: "unborn" });

    expect(screen.getByRole("heading", { name: "No saved versions yet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish|Get project changes/ })).not.toBeInTheDocument();
  });

  it("names an old version being read without offering a publish", () => {
    renderClean({ upstream: { upstream: "origin/main", ahead: 3, behind: 0 }, headState: "detached" });

    expect(screen.getByRole("heading", { name: "You're viewing an old version" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Publish/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View history" })).toBeInTheDocument();
  });
});

describe("ChangesPanel filters", () => {
  class NoopResizeObserver implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  const mixedTree: WorkingTreeStatus = {
    isClean: false,
    counts: { changed: 2, new: 1, deleted: 1, renamed: 0, conflicted: 1, total: 5 },
    lineTotals: null,
    entries: [
      { path: "conflict.txt", originalPath: null, category: "conflicted", isPrepared: false, hasUnpreparedChanges: true },
      { path: "edited.txt", originalPath: null, category: "changed", isPrepared: false, hasUnpreparedChanges: true },
      { path: "also-edited.txt", originalPath: null, category: "changed", isPrepared: false, hasUnpreparedChanges: true },
      { path: "asset.png", originalPath: null, category: "new", isPrepared: false, hasUnpreparedChanges: true },
      { path: "gone.txt", originalPath: null, category: "deleted", isPrepared: false, hasUnpreparedChanges: true },
    ],
    truncated: false,
    hasPreparedChanges: false,
    hasUnpreparedChanges: true,
    upstream: { branch: "main", upstream: null, ahead: 0, behind: 0 },
  };

  beforeEach(() => {
    globalThis.ResizeObserver = NoopResizeObserver;
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation((command) => {
      if (command === "read_file_diff") return Promise.resolve({ kind: "unchanged", path: "conflict.txt" });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
  });

  function renderMixed(): ReturnType<typeof render> {
    return render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={mixedTree}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );
  }

  function listedFiles(container: HTMLElement): string[] {
    return [...container.querySelectorAll(".changes-file-list__scroll .changes-file-item__name")]
      .map((node) => node.textContent ?? "");
  }

  it("offers only the kinds this working tree holds, and narrows by several at once", async () => {
    const { container } = renderMixed();
    await screen.findByRole("button", { name: /conflict\.txt/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const panel = screen.getByRole("dialog", { name: "Filters" });
    // Five kinds exist; this tree has four of them, and "Renamed" is not an
    // answer that could narrow anything here.
    expect(within(panel).getByRole("checkbox", { name: /Needs attention/ })).toBeInTheDocument();
    expect(within(panel).queryByRole("checkbox", { name: /Renamed/ })).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("checkbox", { name: /Needs attention/ }));
    await userEvent.click(within(panel).getByRole("checkbox", { name: /Deleted/ }));
    expect(listedFiles(container)).toEqual(["conflict.txt", "gone.txt"]);

    // Two kinds, two chips, and a trigger that counts exactly what they name.
    const chips = container.querySelectorAll(".filter-chip");
    expect(chips).toHaveLength(2);
    expect(container.querySelector(".filter-control__badge")).toHaveTextContent("2");
  });

  it("narrows to what the next version leaves out without changing what it saves", async () => {
    const { container } = renderMixed();
    await screen.findByRole("button", { name: /conflict\.txt/ });

    // A partial selection is the include-everything checkbox's own state:
    // neither checked nor clear, but mixed.
    const selectAll = () => screen.getByRole("checkbox", { name: /^Select (all|none)$/ }) as HTMLInputElement;
    expect(selectAll().indeterminate).toBe(false);
    await userEvent.click(screen.getByRole("checkbox", { name: "Include asset.png in this version" }));
    expect(selectAll().indeterminate).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Filters" })).getByRole("radio", { name: "No" }));

    expect(listedFiles(container)).toEqual(["asset.png"]);
    // Filtering changed only what is listed: the select-all checkbox still
    // answers for the whole working tree.
    expect(selectAll().indeterminate).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Select all" })).toBeInTheDocument();
  });

  it("offers copy, reveal and discard on a file row, with the destructive one fenced off", async () => {
    const clipboard = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: clipboard } });
    const { container } = renderMixed();
    const row = await screen.findByRole("button", { name: /conflict\.txt/ });

    fireEvent.contextMenu(row);
    const menu = await screen.findByRole("menu", { name: "Context actions" });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent))
      .toEqual(["Copy path", "Show in folder", "Discard changes…"]);
    expect(menu.querySelector('[role="separator"]')).not.toBeNull();

    await userEvent.click(within(menu).getByRole("menuitem", { name: "Copy path" }));
    expect(clipboard).toHaveBeenCalledWith("conflict.txt");
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it("cannot show a deleted file in a folder it is no longer in", async () => {
    renderMixed();
    const row = await screen.findByRole("button", { name: /gone\.txt/ });

    fireEvent.contextMenu(row);
    const menu = await screen.findByRole("menu", { name: "Context actions" });
    expect(within(menu).getByRole("menuitem", { name: "Show in folder" })).toBeDisabled();
    // The row already says "Deleted", so the item owes no second explanation.
    expect(within(menu).getByRole("menuitem", { name: "Copy path" })).toBeEnabled();
  });

  it("closes the menu the moment reveal is pressed rather than waiting on the file manager", async () => {
    // The real call ends in a synchronous Windows shell call that can take a
    // moment while Explorer starts. A menu held open and disabled across that
    // reads as a freeze, so the press closes it and the wait is invisible.
    let settle: (() => void) | undefined;
    mockedInvoke.mockImplementation((command) => {
      if (command === "reveal_project_file") return new Promise<void>((resolve) => { settle = resolve; });
      if (command === "read_file_diff") return Promise.resolve({ kind: "unchanged", path: "conflict.txt" });
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
    const { container } = renderMixed();
    const row = await screen.findByRole("button", { name: /conflict\.txt/ });

    fireEvent.contextMenu(row);
    const menu = await screen.findByRole("menu", { name: "Context actions" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Show in folder" }));

    // Gone while the reveal is still in flight, and nothing left greyed behind.
    expect(container.querySelector('[role="menu"]')).toBeNull();
    // The frontend never names a place on the disk: Rust resolves the
    // repository-relative path against the open project itself.
    expect(mockedInvoke).toHaveBeenCalledWith("reveal_project_file", {
      path: "/repo",
      sessionEpoch: "test-epoch",
      filePath: "conflict.txt",
    });
    settle?.();
  });

  it("says so on the screen when the file manager never appears", async () => {
    renderMixed();
    const row = await screen.findByRole("button", { name: /conflict\.txt/ });

    fireEvent.contextMenu(row);
    const menu = await screen.findByRole("menu", { name: "Context actions" });
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Show in folder" }));

    // The stub rejects everything but `read_file_diff`. The menu that asked is
    // already gone, so the message needs a surface that outlives it.
    const notice = await screen.findByText("Couldn't show that file.");
    expect(notice.closest(".changes-notice--error")).not.toBeNull();
    expect(notice).toHaveAttribute("title", "Couldn't show that file.");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Couldn't show that file.")).not.toBeInTheDocument();
  });

  it("offers the file types most of the list first and narrows by one", async () => {
    const { container } = renderMixed();
    await screen.findByRole("button", { name: /conflict\.txt/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const panel = screen.getByRole("dialog", { name: "Filters" });
    // Four .txt against one .png, so the type burying the list leads.
    const typeNames = [...panel.querySelectorAll(".changes-filter__types .filter-panel__switch-label")]
      .map((node) => node.textContent);
    expect(typeNames).toEqual([".txt", ".png"]);

    await userEvent.click(within(panel).getByRole("checkbox", { name: /\.png/ }));
    expect(listedFiles(container)).toEqual(["asset.png"]);
  });

  it("hides a type instead of naming every other one", async () => {
    const { container } = renderMixed();
    await screen.findByRole("button", { name: /conflict\.txt/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const panel = screen.getByRole("dialog", { name: "Filters" });
    const types = within(panel).getByRole("group", { name: "Show or hide the chosen file type" });
    await userEvent.click(within(types).getByRole("radio", { name: "Hide" }));
    await userEvent.click(within(panel).getByRole("checkbox", { name: /\.png/ }));
    await userEvent.keyboard("{Escape}");

    // One click puts the pictures away; the four other files stay.
    expect(listedFiles(container)).toEqual(["also-edited.txt", "conflict.txt", "edited.txt", "gone.txt"]);
    // The chip says what it is doing, not just what it names, and its remove
    // button says putting them back.
    expect(screen.getByText("Hiding .png")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show .png again" }));
    expect(listedFiles(container)).toHaveLength(5);
  });

  it("keeps each group pointing its own way", async () => {
    const { container } = renderMixed();
    await screen.findByRole("button", { name: /conflict\.txt/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const panel = screen.getByRole("dialog", { name: "Filters" });
    // Only the edited ones, and not the .png among them: one group showing,
    // one hiding, in the same panel.
    await userEvent.click(within(panel).getByRole("checkbox", { name: /Edited/ }));
    const types = within(panel).getByRole("group", { name: "Show or hide the chosen file type" });
    await userEvent.click(within(types).getByRole("radio", { name: "Hide" }));
    await userEvent.click(within(panel).getByRole("checkbox", { name: /\.png/ }));

    expect(listedFiles(container)).toEqual(["also-edited.txt", "edited.txt"]);
    // The badge counts the answers, never the modes.
    expect(container.querySelector(".filter-control__badge")).toHaveTextContent("2");
  });

  it("does not ask about file type when there is only one to tell apart", async () => {
    const oneType = {
      ...mixedTree,
      entries: mixedTree.entries.filter((entry) => entry.path.endsWith(".txt")),
    };
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={oneType}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );
    await screen.findByRole("button", { name: /conflict\.txt/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const panel = screen.getByRole("dialog", { name: "Filters" });
    expect(within(panel).queryByRole("group", { name: "Show or hide the chosen file type" })).not.toBeInTheDocument();
    // The kinds are still worth asking about, so the panel is not empty.
    expect(within(panel).getByRole("checkbox", { name: /Edited/ })).toBeInTheDocument();
  });

  it("drops a type filter the tree no longer has anything to tell apart", async () => {
    const { rerender, container } = renderMixed();
    await screen.findByRole("button", { name: /conflict\.txt/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Filters" })).getByRole("checkbox", { name: /\.png/ }));
    await userEvent.keyboard("{Escape}");
    expect(container.querySelector(".filter-control__badge")).toHaveTextContent("1");

    // The picture is saved; only `.txt` is left. The panel stops offering the
    // question, so a filter counted on the trigger would have nowhere to be
    // undone — it goes with it.
    rerender(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={{ ...mixedTree, entries: mixedTree.entries.filter((entry) => entry.path.endsWith(".txt")) }}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );

    expect(container.querySelector(".filter-control__badge")).toBeNull();
    expect(container.querySelectorAll(".filter-chip")).toHaveLength(0);
  });

  it("does not ask what the next version takes when no file can be left out", async () => {
    render(
      <LanguageProvider><ToastProvider>
        <ControlledChangesPanel
          projectPath="/repo"
          workingTree={{ ...mixedTree, truncated: true }}
          workingTreeError={null}
          isCheckingChanges={false}
          onRefresh={vi.fn()}
          onGetChanges={vi.fn()}
          onPublishNow={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );
    await screen.findByRole("button", { name: /conflict\.txt/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const panel = screen.getByRole("dialog", { name: "Filters" });
    // Past the cap the checkboxes are disabled and the next version takes
    // everything, so the question has one true answer and is not asked.
    expect(within(panel).getByRole("checkbox", { name: /Edited/ })).toBeInTheDocument();
    expect(within(panel).queryByRole("radio", { name: "Any" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("radio", { name: "Yes" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("radio", { name: "No" })).not.toBeInTheDocument();
  });

  it("says why a filtered list is empty and offers the way back", async () => {
    const { container } = renderMixed();
    await screen.findByRole("button", { name: /conflict\.txt/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    const panel = screen.getByRole("dialog", { name: "Filters" });
    await userEvent.click(within(panel).getByRole("checkbox", { name: /Deleted/ }));
    await userEvent.click(within(panel).getByRole("radio", { name: "Yes" }));
    await userEvent.click(within(panel).getByRole("radio", { name: "Any" }));
    // Nothing is excluded, so "left out" can only be empty.
    await userEvent.click(within(panel).getByRole("radio", { name: "No" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.getByText("No changed file matches these filters.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(listedFiles(container)).toHaveLength(5);
    expect(container.querySelectorAll(".filter-chip")).toHaveLength(0);
  });

  it("removes one filter from its chip and walks the narrowed list file to file", async () => {
    const { container } = renderMixed();
    await screen.findByRole("button", { name: /conflict\.txt/ });

    await userEvent.click(screen.getByRole("button", { name: /^edited\.txt/ }));
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Filters" })).getByRole("checkbox", { name: /Edited/ }));
    await userEvent.keyboard("{Escape}");

    expect(listedFiles(container)).toEqual(["also-edited.txt", "edited.txt"]);
    // The tree's alphabetical order puts the selected file second. The
    // arrows walk what is shown, not the source payload's order.
    expect(screen.getByText("File 2 of 2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove the Edited filter" }));
    expect(listedFiles(container)).toHaveLength(5);
  });
});
