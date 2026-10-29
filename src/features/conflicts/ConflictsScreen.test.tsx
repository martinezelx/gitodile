import { StrictMode } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FileDiff } from "../changes";
import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { ConflictsScreen } from "./ConflictsScreen";
import { createConflictsController } from "./controller";
import type { ConflictFile, ConflictSession, PausedOperation } from "./domain";
import type { ConflictsPort } from "./port";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const query = { projectId: "/repo", sessionEpoch: "epoch-1" };
const BASE = "1".repeat(40);
const MAIN = "2".repeat(40);
const FEATURE = "3".repeat(40);

function conflict(path: string, overrides: Partial<ConflictFile> = {}): ConflictFile {
  return {
    path,
    pathIsExact: true,
    shape: "both-changed",
    facets: [],
    base: { mode: "100644", objectId: BASE },
    current: { mode: "100644", objectId: MAIN },
    incoming: { mode: "100644", objectId: FEATURE },
    working: "file",
    state: "unresolved",
    kept: null,
    allowedActions: [],
    ...overrides,
  };
}

function session(operation: Partial<PausedOperation>, files: ConflictFile[]): ConflictSession {
  return {
    sessionId: "session",
    stateToken: "token",
    origin: "external",
    operation: {
      kind: "merge",
      supported: true,
      unsupportedReason: null,
      step: null,
      current: { name: "main", commit: MAIN },
      incoming: { name: "feature", commit: FEATURE },
      operationHeads: [FEATURE],
      continueCommand: "git merge --continue",
      abortCommand: "git merge --abort",
      ...operation,
    },
    files,
    unresolvedCount: files.filter((file) => file.state !== "markedResolved").length,
    listingComplete: true,
    snapshot: null,
    allowedActions: ["abort-merge"],
  };
}

const unchanged = (path: string): FileDiff => ({ kind: "unchanged", path, originalPath: null, change: "changed" });

async function renderScreen(
  value: ConflictSession | null,
  readSideDiff = vi.fn<ConflictsPort["readSideDiff"]>(async (request) => unchanged(request.filePath)),
  { mutations = {}, isProjectBusy = false }: { mutations?: Partial<ConflictsPort>; isProjectBusy?: boolean } = {},
) {
  const readSession = vi.fn<ConflictsPort["readSession"]>().mockResolvedValue(value);
  const controller = createConflictsController({
    readSession,
    readSideDiff,
    keepSide: vi.fn(),
    markResolved: vi.fn(),
    resetFile: vi.fn(),
    openFile: vi.fn(),
    checkWorkingFile: vi.fn(),
    revealFile: vi.fn(),
    openProjectFolder: vi.fn(),
    planFinish: vi.fn(),
    finish: vi.fn(),
    planAbort: vi.fn(),
    abort: vi.fn(),
    ...mutations,
  });
  await controller.refresh(query);
  const onGoToOverview = vi.fn();
  const onBack = vi.fn();
  const onPublish = vi.fn();
  const slot = {
    onOperationStart: vi.fn(() => true),
    onOperationFinish: vi.fn(),
    onOperationPhaseChange: vi.fn(),
    onChanged: vi.fn(),
  };
  // StrictMode as the app runs in development: it mounts every effect twice.
  render(
    <StrictMode>
      <LanguageProvider>
        <ScreenLifecycleProvider controller={createScreenLifecycleController("active")}>
          <ConflictsScreen
            controller={controller}
            projectPath={query.projectId}
            sessionEpoch={query.sessionEpoch}
            onBack={onBack}
            onGoToOverview={onGoToOverview}
            isProjectBusy={isProjectBusy}
            runHooks
            onPublish={onPublish}
            {...slot}
          />
        </ScreenLifecycleProvider>
      </LanguageProvider>
    </StrictMode>,
  );
  return { readSession, readSideDiff, onGoToOverview, onBack, onPublish, slot };
}

const appError = (code: string) => ({ code, message: "English text", remediation: null });
const EXPECTED = {
  base: { mode: "100644", objectId: BASE },
  current: { mode: "100644", objectId: MAIN },
  incoming: { mode: "100644", objectId: FEATURE },
};
const CHOICES = ["keep-current", "keep-incoming", "mark-resolved"] as const;

describe("ConflictsScreen", () => {
  it("explains a paused merge read-only and shows what both sides changed", async () => {
    const user = userEvent.setup();
    const { readSession, readSideDiff } = await renderScreen(session({}, [
      conflict("src/login.ts"),
      conflict("README.md", { shape: "deleted-by-current", current: null }),
    ]));

    expect(screen.getByText("Combining “feature” into “main” is paused")).toBeTruthy();
    // A merge needs no card of its own: the header says what is paused.
    expect(screen.queryByText("GitOdile can't finish this yet")).toBeNull();
    expect(screen.getByRole("heading", { name: "What “main” changed" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What “feature” changed" })).toBeTruthy();
    await screen.findByText("“main” didn't change this file.");
    await screen.findByText("“feature” didn't change this file.");
    expect(readSideDiff).toHaveBeenCalledWith(expect.objectContaining({
      filePath: "src/login.ts", side: "current", baseObjectId: BASE, sideObjectId: MAIN,
    }));
    expect(readSideDiff).toHaveBeenCalledWith(expect.objectContaining({ side: "incoming", sideObjectId: FEATURE }));

    // A side that deleted the file is said, never read.
    await user.click(screen.getByRole("button", { name: /README\.md/ }));
    expect(screen.getByText("“main” deleted this file.")).toBeTruthy();
    await screen.findByText("“feature” didn't change this file.");
    expect(readSideDiff).toHaveBeenCalledTimes(3);

    // Arriving and reading never re-reads the session or offers a file a
    // change it doesn't allow; finishing waits for every file.
    expect(readSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /keep|resolve/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Finish combining…" })).toHaveProperty("disabled", true);
  });

  it("explains an operation it cannot finish, with its exact commands and no action", async () => {
    await renderScreen(session({
      kind: "rebase",
      supported: false,
      unsupportedReason: "not-a-merge",
      step: { current: 2, total: 5 },
      continueCommand: "git rebase --continue",
      abortCommand: "git rebase --abort",
    }, [conflict("a.txt")]));

    expect(screen.getByText("Moving your versions onto “main” is paused")).toBeTruthy();
    expect(screen.getByText("step 2 of 5")).toBeTruthy();
    expect(screen.getByText("GitOdile can't finish this yet")).toBeTruthy();
    const notice = screen.getByText("GitOdile can't finish this yet").closest("section")!;
    expect(within(notice).getByText("git rebase --continue")).toBeTruthy();
    expect(within(notice).getByText("git rebase --abort")).toBeTruthy();
    // The commands are to copy, never buttons that run them.
    expect(within(notice).getAllByRole("button").map((button) => button.textContent)).toEqual(["Copy", "Copy"]);
  });

  it("says when nothing is paused any more and offers the way back", async () => {
    const user = userEvent.setup();
    const { onGoToOverview } = await renderScreen(null);

    expect(screen.getByText("Nothing is paused")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Go to Overview" }));
    expect(onGoToOverview).toHaveBeenCalled();
  });

  it("names what a side choice discards before it runs, then says which side was kept", async () => {
    const user = userEvent.setup();
    const file = conflict("src/login.ts", { allowedActions: [...CHOICES] });
    const keepSide = vi.fn<ConflictsPort["keepSide"]>().mockResolvedValue(
      session({}, [{ ...file, state: "editedOutside", kept: "incoming", allowedActions: [...CHOICES, "reset-file"] }]),
    );
    const { slot } = await renderScreen(session({}, [file]), undefined, { mutations: { keepSide } });

    const keep = screen.getByRole("button", { name: "Keep “feature”" });
    await user.click(keep);
    expect(screen.getByText("What “main” changed in this file is replaced. A copy is kept, so you can reset the file.")).toBeTruthy();
    expect(within(screen.getByRole("heading", { name: /What “main” changed/ })).getByText("Will be replaced")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(keepSide).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep “feature”" })));

    await user.click(screen.getByRole("button", { name: "Keep “feature”" }));
    await user.click(within(screen.getByRole("group", { name: "Keep the version on “feature”?" })).getByRole("button", { name: "Keep “feature”" }));

    expect(keepSide).toHaveBeenCalledWith({
      ...query, filePath: "src/login.ts", stateToken: "token", choice: "keep-incoming", expected: EXPECTED,
    });
    expect(slot.onOperationStart).toHaveBeenCalledTimes(1);
    expect(slot.onChanged).toHaveBeenCalledTimes(1);
    expect(slot.onOperationFinish).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Kept “feature” · not marked resolved yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep “feature”" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Kept “feature” in src/login.ts. It isn't marked resolved yet.")).toBeTruthy();
    // The side GitOdile wrote differs from the snapshot, but the reader
    // didn't edit it: the file's line names the kept side instead.
    expect(screen.queryByText(/Edited since/)).toBeNull();
  });

  it("explains Mark resolved once, then asks about markers and the permission it needs", async () => {
    const user = userEvent.setup();
    const file = conflict("run.sh", { allowedActions: [...CHOICES], facets: ["mode-change"], incoming: { mode: "100755", objectId: FEATURE } });
    const markResolved = vi.fn<ConflictsPort["markResolved"]>()
      .mockRejectedValueOnce(appError("conflict_markers_remain"))
      .mockRejectedValueOnce(appError("conflict_choice_needed"))
      .mockResolvedValueOnce(session({}, [{ ...file, state: "markedResolved", allowedActions: ["reset-file"] }]));
    await renderScreen(session({}, [file]), undefined, { mutations: { markResolved } });

    await user.click(screen.getByRole("button", { name: "Mark resolved" }));
    expect(screen.getByText("Mark this file resolved?")).toBeTruthy();
    expect(screen.getByText("git add -- run.sh")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Mark resolved" }));
    expect(markResolved).toHaveBeenLastCalledWith(expect.objectContaining({ allowMarkers: false, executable: null }));

    await user.click(await screen.findByRole("button", { name: "Mark resolved anyway" }));
    expect(markResolved).toHaveBeenLastCalledWith(expect.objectContaining({ allowMarkers: true, executable: null }));

    expect(await screen.findByText("On “feature” it runs as a program; on “main” it doesn't. Choose which to keep.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Run as a program" }));
    expect(markResolved).toHaveBeenLastCalledWith(expect.objectContaining({ allowMarkers: true, executable: true }));
    expect(await screen.findByText("run.sh is marked resolved. No file overlaps any more.")).toBeTruthy();
    expect(localStorage.length).toBe(1);
  });

  it("resets a file through a confirmation, and the overlap alone when the content was not kept", async () => {
    const user = userEvent.setup();
    const file = conflict("a.txt", { state: "markedResolved", allowedActions: ["reset-file"] });
    const resetFile = vi.fn<ConflictsPort["resetFile"]>()
      .mockRejectedValueOnce(appError("conflict_content_not_kept"))
      .mockResolvedValueOnce(session({}, [{ ...file, state: "unresolved", allowedActions: [...CHOICES] }]));
    await renderScreen(session({}, [file]), undefined, { mutations: { resetFile } });

    await user.click(screen.getByRole("button", { name: "More actions for this file" }));
    await user.click(screen.getByRole("menuitem", { name: "Reset this file…" }));
    const dialog = screen.getByRole("dialog", { name: "Reset this file?" });
    await user.click(within(dialog).getByRole("button", { name: "Reset file" }));
    expect(resetFile).toHaveBeenLastCalledWith(expect.objectContaining({ filePath: "a.txt", stagesOnly: false }));

    await user.click(await within(dialog).findByRole("button", { name: "Reset the overlap only" }));
    expect(resetFile).toHaveBeenLastCalledWith(expect.objectContaining({ stagesOnly: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("a.txt is back to how the merge left it.")).toBeTruthy();
  });

  it.each([
    ["a moved session", "stale_conflict_session", "These files changed since GitOdile read them", "Read again"],
    ["a file another program holds", "file_locked", "Another program is using this file", "Try again"],
  ])("keeps the screen honest after %s and offers the way out", async (_label, code, title, way) => {
    const user = userEvent.setup();
    const file = conflict("a.txt", { allowedActions: [...CHOICES] });
    const keepSide = vi.fn<ConflictsPort["keepSide"]>().mockRejectedValue(appError(code));
    const { readSession } = await renderScreen(session({}, [file]), undefined, { mutations: { keepSide } });

    await user.click(screen.getByRole("button", { name: "Keep “main”" }));
    await user.click(within(screen.getByRole("group", { name: "Keep the version on “main”?" })).getByRole("button", { name: "Keep “main”" }));
    expect(await screen.findByText(title)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: way }));
    if (code === "file_locked") expect(keepSide).toHaveBeenCalledTimes(2);
    else expect(readSession).toHaveBeenCalledTimes(2);
  });

  it("opens a file in its app without resolving it, and offers the folder for a type it won't open", async () => {
    const user = userEvent.setup();
    const file = conflict("a.txt", { allowedActions: ["keep-current", "open-in-editor", "mark-resolved"] });
    const openFile = vi.fn<ConflictsPort["openFile"]>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(appError("file_runs_as_program"))
      .mockRejectedValueOnce(appError("conflict_action_unavailable"));
    const revealFile = vi.fn<ConflictsPort["revealFile"]>().mockResolvedValue(undefined);
    const { slot, readSession } = await renderScreen(session({}, [file]), undefined, { mutations: { openFile, revealFile } });

    await user.click(screen.getByRole("button", { name: "Open in editor" }));
    expect(openFile).toHaveBeenLastCalledWith({ ...query, filePath: "a.txt", stateToken: "token" });
    expect(await screen.findByText("Opened in its app · GitOdile looks at it again when you save")).toBeTruthy();
    // Opening is not a change to the project: no slot, no refresh.
    expect(slot.onOperationStart).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open in editor" }));
    expect(await screen.findByText("GitOdile won't open this file")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show in folder" }));
    expect(revealFile).toHaveBeenCalledWith({ ...query, filePath: "a.txt" });

    // A file that no longer allows opening is read again, not "couldn't open".
    await user.click(screen.getByRole("button", { name: "Open in editor" }));
    await waitFor(() => expect(readSession).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Couldn't open this file")).toBeNull();
  });

  it.each([
    ["markers left", { kind: "found", blocks: 2 }, "Edited outside GitOdile · 2 overlapping parts are still marked in it"],
    ["no markers", { kind: "none" }, "Edited outside GitOdile · no overlapping parts marked in it"],
    ["UTF-16", { kind: "unknown", limit: "utf16" }, "Edited outside GitOdile · it's saved as UTF-16, so GitOdile can't look for marked parts"],
  ] as const)("says what an edit outside GitOdile left: %s", async (_label, markers, text) => {
    const file = conflict("a.txt", { state: "editedOutside", allowedActions: ["open-in-editor", "mark-resolved", "reset-file"] });
    const checkWorkingFile = vi.fn<ConflictsPort["checkWorkingFile"]>().mockResolvedValue({ stateToken: "token", markers });
    await renderScreen(session({}, [file]), undefined, { mutations: { checkWorkingFile } });

    expect(await screen.findByText(text)).toBeTruthy();
    expect(checkWorkingFile).toHaveBeenCalledTimes(1);
  });

  it("explains a folder in the way and offers to show it", async () => {
    const user = userEvent.setup();
    const file = conflict("a.txt", { facets: ["file-directory"], working: "directory" });
    const revealFile = vi.fn<ConflictsPort["revealFile"]>().mockResolvedValue(undefined);
    await renderScreen(session({}, [file]), undefined, { mutations: { revealFile } });

    expect(screen.getByText("A folder is where this file goes")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark resolved" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show in folder" }));
    expect(revealFile).toHaveBeenCalledWith({ ...query, filePath: "a.txt" });
  });

  it("holds the actions while another change to the project runs", async () => {
    await renderScreen(session({}, [conflict("a.txt", { allowedActions: [...CHOICES] })]), undefined, { isProjectBusy: true });

    expect(screen.getByText("Another change to this project is running. These actions wait for it.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark resolved" })).toHaveProperty("disabled", true);
  });
  it("finishes a resolved merge through its plan, keeps a hook's refusal readable and never publishes", async () => {
    const user = userEvent.setup();
    const resolved = { ...session({}, [conflict("a.txt", { state: "markedResolved" })]), allowedActions: ["finish-merge", "abort-merge"] } satisfies ConflictSession;
    const planFinish = vi.fn<ConflictsPort["planFinish"]>().mockResolvedValue({
      stateToken: "plan-token",
      sessionId: "session",
      current: { name: "main", commit: MAIN },
      incoming: { name: "feature", commit: FEATURE },
      resolvedFiles: 1,
      totalFiles: 2,
      files: [],
      unsavedFiles: 1,
      editedAfterResolving: 1,
      title: "Merge branch 'feature'",
      description: null,
      signs: false,
      snapshot: null,
    });
    const finish = vi.fn<ConflictsPort["finish"]>()
      .mockRejectedValueOnce({ ...appError("hook_rejected"), detail: "commit-msg: say why" })
      .mockResolvedValueOnce({ commit: "c".repeat(40), shortCommit: "ccccccc", title: "Merge branch 'feature'", branch: "main" });
    const { slot, onBack, onPublish } = await renderScreen(resolved, undefined, { mutations: { planFinish, finish } });

    await user.click(screen.getByRole("button", { name: "Finish combining…" }));
    const dialog = screen.getByRole("dialog", { name: "Finish combining" });
    expect(await within(dialog).findByText("Saves one version on “main” with 2 changed files. You resolved 1 overlapping file.")).toBeTruthy();
    expect(within(dialog).getByText("Nothing is published. Unsaved changes in 1 file stay as they are.")).toBeTruthy();
    expect(within(dialog).getByRole("textbox", { name: "Version name" })).toHaveProperty("value", "Merge branch 'feature'");
    expect(within(dialog).getByText(/A resolved file was edited after you marked it/)).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Finish combining" }));
    expect(finish).toHaveBeenLastCalledWith({ ...query, title: "Merge branch 'feature'", description: null, stateToken: "plan-token", runHooks: true });
    // The hook's own words are why it refused, so they show at once.
    expect(await within(dialog).findByText("commit-msg: say why")).toBeTruthy();
    expect(slot.onChanged).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Finish combining" }));
    const done = await screen.findByRole("dialog", { name: "Combining finished" });
    expect(slot.onChanged).toHaveBeenCalledTimes(1);
    expect(onPublish).not.toHaveBeenCalled();
    await user.click(within(done).getByRole("button", { name: "Done" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onPublish).not.toHaveBeenCalled();
  });

  it("keeps Finish visible but unavailable while a file still overlaps", async () => {
    await renderScreen(session({}, [conflict("a.txt", { allowedActions: [...CHOICES] })]));

    expect(screen.getByRole("button", { name: "Finish combining…" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Stop combining…" })).toHaveProperty("disabled", false);
  });

  it("stops a merge started elsewhere without promising what Git can't bring back, and re-plans after a refusal", async () => {
    const user = userEvent.setup();
    const plan = {
      stateToken: "abort-token",
      sessionId: "session",
      origin: "external",
      restoration: "best-effort",
      current: { name: "main", commit: MAIN },
      incoming: { name: "feature", commit: FEATURE },
      files: 2,
      unresolvedFiles: 1,
      stagedFiles: 2,
      unsavedFiles: 1,
      snapshot: null,
    } as const;
    const planAbort = vi.fn<ConflictsPort["planAbort"]>().mockResolvedValue(plan);
    const abort = vi.fn<ConflictsPort["abort"]>()
      .mockRejectedValueOnce(appError("merge_abort_refused"))
      .mockResolvedValueOnce({ restoration: "best-effort", snapshotReference: null, abandonedReference: null });
    const { onBack } = await renderScreen(session({}, [conflict("a.txt", { allowedActions: [...CHOICES] })]), undefined, {
      mutations: { planAbort, abort },
    });

    await user.click(screen.getByRole("button", { name: "Stop combining…" }));
    const dialog = screen.getByRole("dialog", { name: "Stop combining?" });
    expect(await within(dialog).findByText(/This was started outside GitOdile/)).toBeTruthy();
    expect(within(dialog).getByText("Unsaved changes in 1 other file stay as they are.")).toBeTruthy();

    const planned = planAbort.mock.calls.length;
    await user.click(within(dialog).getByRole("button", { name: "Stop combining" }));
    expect(await within(dialog).findByText(/Git wouldn't stop combining/)).toBeTruthy();
    // The refusal is answered with a fresh plan before anything is retried.
    await waitFor(() => expect(planAbort.mock.calls.length).toBeGreaterThan(planned));
    expect(onBack).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Stop combining" }));
    expect(abort).toHaveBeenLastCalledWith({ ...query, stateToken: "abort-token" });
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  // About 1 s per case: each renders the whole screen and reaches the
  // outcome through the dialog's own plan, as the reader would.
  it.each([
    ["Finish combining…", "Finish combining", "planFinish", "finish"],
    ["Stop combining…", "Stop combining?", "planAbort", "abort"],
  ] as const)("offers no second attempt after %s ends uncertain", async (opener, dialogName, planKey, runKey) => {
    const user = userEvent.setup();
    const resolved = { ...session({}, [conflict("a.txt", { state: "markedResolved" })]), allowedActions: ["finish-merge", "abort-merge"] } satisfies ConflictSession;
    const plans = {
      planFinish: vi.fn().mockResolvedValue({
        stateToken: "plan-token", sessionId: "session", current: { name: "main", commit: MAIN }, incoming: { name: "feature", commit: FEATURE },
        resolvedFiles: 1, totalFiles: 1, files: [], unsavedFiles: 0, editedAfterResolving: 0, title: "Merge", description: null, signs: false, snapshot: null,
      }),
      planAbort: vi.fn().mockResolvedValue({
        stateToken: "plan-token", sessionId: "session", origin: "external", restoration: "best-effort", current: { name: "main", commit: MAIN },
        incoming: { name: "feature", commit: FEATURE }, files: 1, unresolvedFiles: 0, stagedFiles: 1, unsavedFiles: 0, snapshot: null,
      }),
    };
    const run = vi.fn().mockRejectedValue(appError("merge_outcome_uncertain"));
    const { slot } = await renderScreen(resolved, undefined, { mutations: { [planKey]: plans[planKey], [runKey]: run } });

    await user.click(screen.getByRole("button", { name: opener }));
    const dialog = screen.getByRole("dialog", { name: dialogName });
    const confirm = await within(dialog).findByRole("button", { name: dialogName.replace("?", "") });
    await waitFor(() => expect(confirm).toHaveProperty("disabled", false));
    await user.click(confirm);
    await waitFor(() => expect(within(dialog).queryByRole("button", { name: dialogName.replace("?", "") })).toBeNull());
    // The title bar's Close and the one that takes the action's place.
    expect(within(dialog).getAllByRole("button", { name: "Close" })).toHaveLength(2);
    // The coordinated refresh reads what Git left; nothing repairs it.
    expect(slot.onChanged).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
