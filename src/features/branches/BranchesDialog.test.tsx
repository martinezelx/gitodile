import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
import { ToastProvider } from "../../shared/ui";
import { DeleteBranchDialog, SwitchBranchDialog } from "./BranchesDialog";
import type { DeleteBranchPlan, SwitchBranchPlan, BranchesSnapshot } from "./domain";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function switchPlan(overrides: Partial<SwitchBranchPlan> = {}): SwitchBranchPlan {
  return {
    operationKind: "local-mutation",
    summary: "Switch",
    steps: [],
    risks: [],
    recovery: "\"main\" stays exactly as it is.",
    requiresConfirmation: true,
    stateToken: "switch-token",
    from: "main",
    to: "feature/x",
    fromCommit: "abc123",
    toCommit: "def456",
    changedFiles: ["a.txt"],
    changedFilesTotal: 1,
    ...overrides,
  };
}

function emptySnapshot(): BranchesSnapshot {
  return {
    branch: "feature/x",
    headState: "branch",
    currentCommit: "def456",
    branches: [],
    totalCount: 0,
    isTruncated: false,
    unreadableCount: 0,
  };
}

describe("SwitchBranchDialog", () => {
  it("offers Save version and New branch when the project is dirty", async () => {
    mockedInvoke.mockRejectedValueOnce({
      code: "dirty_working_tree",
      message: "dirty",
      remediation: null,
    });
    const onSaveVersion = vi.fn();
    const onCreateWithWork = vi.fn();
    const onClose = vi.fn();
    render(
      <LanguageProvider><ToastProvider>
        <SwitchBranchDialog
          isOpen
          projectPath="/repo"
          sessionEpoch="epoch-1"
          target="feature/x"
          onClose={onClose}
          onSwitched={vi.fn()}
          onSaveVersion={onSaveVersion}
          onCreateWithWork={onCreateWithWork}
        />
      </ToastProvider></LanguageProvider>,
    );

    // Two ways through, as a choice: saving is picked first, and the primary
    // action follows whichever is chosen.
    const user = userEvent.setup();
    expect(await screen.findByRole("radio", { name: /Save them as a version/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /Take them to a new branch/ }));
    await user.click(screen.getByRole("button", { name: "New branch with these changes" }));
    expect(onClose).toHaveBeenCalled();
    expect(onCreateWithWork).toHaveBeenCalled();
  });

  it("switches on confirm and reports the resulting snapshot", async () => {
    mockedInvoke.mockResolvedValueOnce(switchPlan());
    mockedInvoke.mockResolvedValueOnce(emptySnapshot());
    const onSwitched = vi.fn();
    const user = userEvent.setup();
    render(
      <LanguageProvider><ToastProvider>
        <SwitchBranchDialog
          isOpen
          projectPath="/repo"
          sessionEpoch="epoch-1"
          target="feature/x"
          onClose={vi.fn()}
          onSwitched={onSwitched}
          onSaveVersion={vi.fn()}
          onCreateWithWork={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );

    expect(await screen.findByText("1 file will change.")).toBeInTheDocument();
    // The recovery note is written in the reader's language from the plan's
    // facts, never the plan's own English sentence.
    expect(screen.getByText("“main” stays as it is, and switching back returns these files.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Switch branch" }));

    await waitFor(() => expect(onSwitched).toHaveBeenCalledWith(emptySnapshot()));
    expect(await screen.findByText("You're now on “feature/x”.")).toBeInTheDocument();
    expect(mockedInvoke).toHaveBeenCalledWith("switch_branch", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      target: "feature/x",
      stateToken: "switch-token",
    });
  });
});

function deletePlan(overrides: Partial<DeleteBranchPlan> = {}): DeleteBranchPlan {
  return {
    operationKind: "destructive",
    summary: "Delete",
    steps: [],
    risks: [],
    recovery: "Reachable from: refs/heads/main",
    requiresConfirmation: true,
    stateToken: "delete-token",
    name: "feature/x",
    tipCommit: "def456",
    retainedBy: ["refs/heads/main"],
    upstream: null,
    published: null,
    copiedInto: null,
    recoveryPoint: null,
    ...overrides,
  };
}

describe("DeleteBranchDialog", () => {
  it("offers a branch whose work was squashed into main, and says a recovery point keeps its originals", async () => {
    mockedInvoke.mockResolvedValueOnce(
      deletePlan({
        retainedBy: [],
        copiedInto: { base: "main", kind: "squash", commit: "abc1234def5678" },
        recoveryPoint: {
          reference: "refs/gitodile/recovery/v1/delete-branch/worktree-x/1",
          explanation: "x",
          retention: "y",
          retentionLimit: 20,
        },
      }),
    );
    mockedInvoke.mockResolvedValueOnce({
      snapshot: emptySnapshot(),
      remoteDeleted: null,
      remoteError: null,
      recoveryReference: "refs/gitodile/recovery/v1/delete-branch/worktree-x/1",
    });
    const user = userEvent.setup();
    render(
      <LanguageProvider><ToastProvider>
        <DeleteBranchDialog
          isOpen
          projectPath="/repo"
          sessionEpoch="epoch-1"
          target="feature/x"
          onClose={vi.fn()}
          onDeleted={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );

    expect(
      await screen.findByText(
        "Its work is already on “main”, combined into one version.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Its original versions are saved as a recovery point first.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete branch" }));
    expect(
      await screen.findByText("“feature/x” deleted. Its original versions are kept in a recovery point."),
    ).toBeInTheDocument();
  });

  it("shows the retained-by proof and deletes on confirm", async () => {
    mockedInvoke.mockResolvedValueOnce(deletePlan());
    mockedInvoke.mockResolvedValueOnce({
      snapshot: emptySnapshot(),
      remoteDeleted: null,
      remoteError: null,
    });
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    render(
      <LanguageProvider><ToastProvider>
        <DeleteBranchDialog
          isOpen
          projectPath="/repo"
          sessionEpoch="epoch-1"
          target="feature/x"
          onClose={vi.fn()}
          onDeleted={onDeleted}
        />
      </ToastProvider></LanguageProvider>,
    );

    expect(await screen.findByText("Its work is already on “main”, so nothing is lost.")).toBeInTheDocument();
    // Nothing published, so nothing to ask about.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete branch" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(emptySnapshot()));
    expect(mockedInvoke).toHaveBeenCalledWith("delete_branch", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      name: "feature/x",
      deleteRemote: false,
      stateToken: "delete-token",
    });
  });

  it("clears the published copy away by default, and lets that be turned off", async () => {
    const published = { remote: "origin", branch: "feature/x", shortName: "origin/feature/x" };
    mockedInvoke.mockResolvedValueOnce(deletePlan({ published, upstream: "origin/feature/x" }));
    mockedInvoke.mockResolvedValueOnce({
      snapshot: emptySnapshot(),
      remoteDeleted: true,
      remoteError: null,
    });
    const user = userEvent.setup();
    render(
      <LanguageProvider><ToastProvider>
        <DeleteBranchDialog
          isOpen
          projectPath="/repo"
          sessionEpoch="epoch-1"
          target="feature/x"
          onClose={vi.fn()}
          onDeleted={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );

    // Deleting a branch only here would leave it on everyone else's screen, so
    // the shared copy goes with it unless the user says otherwise.
    const choice = await screen.findByRole("checkbox", { name: /Also delete the published copy/ });
    expect(choice).toBeChecked();
    expect(screen.getByText("Your team won't see it anymore.")).toBeInTheDocument();

    await user.click(choice);
    expect(screen.getByText("It stays, and your team still sees it.")).toBeInTheDocument();

    await user.click(choice);
    await user.click(screen.getByRole("button", { name: "Delete branch" }));
    expect(mockedInvoke).toHaveBeenCalledWith("delete_branch", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      name: "feature/x",
      deleteRemote: true,
      stateToken: "delete-token",
    });
    expect(await screen.findByText("“feature/x” deleted, and its published copy too.")).toBeInTheDocument();
  });

  it("says the local branch is gone when only the remote half was refused", async () => {
    const published = { remote: "origin", branch: "feature/x", shortName: "origin/feature/x" };
    mockedInvoke.mockResolvedValueOnce(deletePlan({ published, upstream: "origin/feature/x" }));
    mockedInvoke.mockResolvedValueOnce({
      snapshot: emptySnapshot(),
      remoteDeleted: false,
      remoteError: { code: "remote_rejected", message: "protected branch", remediation: null },
    });
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    render(
      <LanguageProvider><ToastProvider>
        <DeleteBranchDialog
          isOpen
          projectPath="/repo"
          sessionEpoch="epoch-1"
          target="feature/x"
          onClose={vi.fn()}
          onDeleted={onDeleted}
        />
      </ToastProvider></LanguageProvider>,
    );

    await screen.findByRole("checkbox");
    await user.click(screen.getByRole("button", { name: "Delete branch" }));

    // The local delete stands, so the list must be told; the remote refusal is
    // reported as a fact about the remote rather than as a failed operation.
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(emptySnapshot()));
    expect(
      await screen.findByText(
        "“feature/x” is gone from this computer, but the published copy is still there.",
      ),
    ).toBeInTheDocument();
  });

  it("explains a blocked deletion of unique work and offers no destructive action", async () => {
    mockedInvoke.mockRejectedValueOnce({
      code: "branch_unique_work",
      message: "unique work",
      remediation: null,
    });
    const onSwitchInstead = vi.fn();
    const user = userEvent.setup();
    render(
      <LanguageProvider><ToastProvider>
        <DeleteBranchDialog
          isOpen
          projectPath="/repo"
          sessionEpoch="epoch-1"
          target="feature/x"
          onClose={vi.fn()}
          onDeleted={vi.fn()}
          onSwitchInstead={onSwitchInstead}
        />
      </ToastProvider></LanguageProvider>,
    );

    // The refusal is framed as an explanation with a way forward, not as a
    // failure the user could retry into working.
    expect(await screen.findByRole("heading", { name: "Can't delete it yet" })).toBeInTheDocument();
    expect(screen.getByText(/“feature\/x” has versions that aren't anywhere else/)).toBeInTheDocument();
    expect(
      screen.getByText(/Publish it, so the work is also on the remote/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete branch" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to this branch" }));
    expect(onSwitchInstead).toHaveBeenCalled();
  });

  it("explains an unfinished Git operation and points at the conflicted files", async () => {
    mockedInvoke.mockRejectedValueOnce({
      code: "git_operation_in_progress",
      message: "merge in progress",
      remediation: null,
    });
    const onOpenConflicts = vi.fn();
    const user = userEvent.setup();
    render(
      <LanguageProvider><ToastProvider>
        <DeleteBranchDialog
          isOpen
          projectPath="/repo"
          sessionEpoch="epoch-1"
          target="conflict-a"
          onClose={vi.fn()}
          onDeleted={vi.fn()}
          onOpenConflicts={onOpenConflicts}
        />
      </ToastProvider></LanguageProvider>,
    );

    expect(await screen.findByRole("heading", { name: "A conflict is unfinished" })).toBeInTheDocument();
    // Conflict resolution isn't built yet, so the dialog sends the reader to
    // their Git tool rather than implying the Changes screen can fix it.
    expect(screen.getByText(/Finish or cancel it in your Git tool/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Review overlapping changes" }));
    expect(onOpenConflicts).toHaveBeenCalled();
  });

  it("keeps the retryable error banner for failures that aren't a refusal", async () => {
    mockedInvoke.mockRejectedValueOnce({
      code: "ref_locked",
      message: "locked",
      remediation: null,
    });
    render(
      <LanguageProvider><ToastProvider>
        <DeleteBranchDialog
          isOpen
          projectPath="/repo"
          sessionEpoch="epoch-1"
          target="feature/x"
          onClose={vi.fn()}
          onDeleted={vi.fn()}
        />
      </ToastProvider></LanguageProvider>,
    );

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
