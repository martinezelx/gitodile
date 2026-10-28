import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FileDiff } from "../changes";
import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { ConflictsScreen } from "./ConflictsScreen";
import { createConflictsController } from "./controller";
import type { ConflictFile, ConflictSession, PausedOperation } from "./domain";
import type { ConflictsPort } from "./port";

afterEach(cleanup);

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

async function renderScreen(value: ConflictSession | null, readSideDiff = vi.fn<ConflictsPort["readSideDiff"]>(async (request) => unchanged(request.filePath))) {
  const readSession = vi.fn<ConflictsPort["readSession"]>().mockResolvedValue(value);
  const controller = createConflictsController({ readSession, readSideDiff });
  await controller.refresh(query);
  const onGoToOverview = vi.fn();
  render(
    <LanguageProvider>
      <ScreenLifecycleProvider controller={createScreenLifecycleController("active")}>
        <ConflictsScreen
          controller={controller}
          projectPath={query.projectId}
          sessionEpoch={query.sessionEpoch}
          onBack={() => undefined}
          onGoToOverview={onGoToOverview}
        />
      </ScreenLifecycleProvider>
    </LanguageProvider>,
  );
  return { readSession, readSideDiff, onGoToOverview };
}

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

    // Arriving and reading never re-reads the session or offers a change.
    expect(readSession).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /keep|abort|finish|resolve/i })).toBeNull();
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
});
