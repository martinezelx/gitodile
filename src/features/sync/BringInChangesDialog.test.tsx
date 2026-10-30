import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { ToastProvider } from "../../shared/ui";
import type { ConflictSession } from "../conflicts";
import type { BringInChangesPlan, BringInChangesResult, GetTeamChangesPlan, GetTeamChangesResult, IncomingForecast, TeamSyncStatus } from "./domain";
import type { BringInPort } from "./port";
import { createBringInController } from "./bringInController";
import { BringInChangesDialog, type BringInChangesDialogProps } from "./BringInChangesDialog";

afterEach(cleanup);

const clearForecast: IncomingForecast = {
  outcome: "clear",
  integration: "fastForward",
  remoteCommit: "2222222222222222222222222222222222222222",
  incomingCount: 2,
  localCount: 0,
  incomingFileCount: 3,
  authors: ["Ada", "Grace"],
  authorCount: 2,
  carriedUnsavedCount: 2,
  combinedUnsaved: [],
  combinedUnsavedCount: 0,
  overlaps: [],
  overlapCount: 0,
  blocker: null,
};

const basePlan: GetTeamChangesPlan = {
  operationKind: "history-mutation",
  requiresConfirmation: true,
  projectId: "/repo",
  sessionEpoch: "epoch-1",
  stateToken: "opaque-token",
  branch: "main",
  target: { remote: "origin", destinationBranch: "main" },
  trackingRef: "refs/remotes/origin/main",
  localCommit: "1111111111111111111111111111111111111111",
  remoteCommit: "2222222222222222222222222222222222222222",
  integration: "fastForward",
  incomingCount: 2,
  incomingVersions: [
    { commit: "2", shortCommit: "2222222", title: "Team work", description: null, committedAt: "2026-08-16T10:00:00Z", author: "Ada", fileCount: 2 },
    { commit: "3", shortCommit: "3333333", title: "Docs", description: null, committedAt: "2026-08-16T11:00:00Z", author: "Grace", fileCount: 1 },
  ],
  versionsTruncated: false,
  localCount: 0,
  localVersions: [],
  fileImpact: {
    totalCount: 3,
    counts: { added: 1, modified: 2, deleted: 0, renamed: 0, binary: 0 },
    files: [],
    isTruncated: false,
  },
  forecast: clearForecast,
  mergeMessage: null,
  recovery: {
    reference: "refs/gitodile/recovery/v1/get-team-changes/worktree-a/1",
    explanation: "protected",
    retention: "newest 20",
    retentionLimit: 20,
  },
};

const mergePlan: GetTeamChangesPlan = {
  ...basePlan,
  integration: "merge",
  localCount: 1,
  localVersions: [{ commit: "4", shortCommit: "4444444", title: "Mine", description: null, committedAt: "2026-08-16T09:00:00Z", author: "Me" }],
  forecast: { ...clearForecast, integration: "merge", localCount: 1, carriedUnsavedCount: 0 },
  mergeMessage: "Merge remote-tracking branch 'origin/main'",
};

const syncStatus = (remoteCommit: string): TeamSyncStatus => ({
  state: "behind", localBranch: "main", localCommit: basePlan.localCommit,
  upstreamRemote: "origin", destinationBranch: "main", trackingRef: basePlan.trackingRef,
  remoteCommit, ahead: 0, behind: 3, knowledge: "fresh", checkedAt: 1,
  warnings: [], nextActions: ["reviewAndGet"], stateToken: "fresh", forecast: null,
});

const result = (
  outcome: "completed" | "uncertain",
  integration: GetTeamChangesResult["integration"] = "fastForward",
): GetTeamChangesResult => ({
  outcome,
  projectId: "/repo",
  sessionEpoch: "epoch-1",
  branch: "main",
  target: basePlan.target,
  trackingRef: basePlan.trackingRef,
  integration,
  previousCommit: basePlan.localCommit,
  resultingCommit: outcome === "completed" ? basePlan.remoteCommit : null,
  observedHead: basePlan.remoteCommit,
  receivedCount: 2,
  combinedUnsavedCount: 0,
  recovery: {
    schemaVersion: 1,
    recoveryId: "1",
    reference: basePlan.recovery.reference,
    createdAtMs: 1,
    operation: "get-team-changes",
    ownerId: "worktree-a",
    branch: "main",
    previousCommit: basePlan.localCommit,
    targetCommit: basePlan.remoteCommit,
    remote: "origin",
    destinationBranch: "main",
    trackingRef: basePlan.trackingRef,
    stateToken: basePlan.stateToken,
    retentionLimit: 20,
  },
  syncStatus: outcome === "completed" ? { ...syncStatus(basePlan.remoteCommit), state: "upToDate", behind: 0 } : null,
  warnings: outcome === "uncertain" ? [{ code: "localUpdateUncertain", message: "Observed state needs review" }] : [],
  inspectionInstructions: outcome === "uncertain" ? "Inspect safely" : null,
});


const bringPlan: BringInChangesPlan = {
  ...basePlan, kind: "fastForward",
  source: { label: "topic", remote: null, branch: "topic", reference: "refs/heads/topic", commit: basePlan.remoteCommit },
};
const completed: BringInChangesResult = { ...result("completed"), source: bringPlan.source, kind: "fastForward" };
function setup(plan = bringPlan, overrides: Partial<BringInPort> = {}, props: Partial<BringInChangesDialogProps> = {}) {
  const port: BringInPort = {
    plan: vi.fn(async () => plan), bring: vi.fn(async () => completed),
    checkSource: vi.fn(async () => undefined), listSources: vi.fn(async () => ({ sources: [], isTruncated: false })),
    startOverlap: vi.fn(), ...overrides,
  };
  const callbacks = {
    onClose: vi.fn(), onApplied: vi.fn(async () => undefined), onPaused: vi.fn(async () => undefined),
    onPhaseChange: vi.fn(), onSaveVersion: vi.fn(), onOpenConflicts: vi.fn(), onRevealFile: vi.fn(),
  };
  const view = render(<LanguageProvider><ToastProvider><BringInChangesDialog
    controller={createBringInController(port)} projectPath="/repo" sessionEpoch="epoch-1"
    source={{ kind: "localBranch", name: "topic" }} runHooks={false} {...callbacks} {...props}
  /></ToastProvider></LanguageProvider>);
  return { port, unmount: view.unmount, ...callbacks };
}
const confirm = () => screen.findByRole("button", { name: "Bring in changes" });

describe("bringing a reviewed branch into the current one", () => {
  it.each(["fastForward", "merge", "emptyMerge"] as const)("executes %s with the reviewed source, token, recovery and hook setting", async (kind) => {
    const plan = { ...bringPlan, kind, forecast: kind === "fastForward" ? clearForecast : mergePlan.forecast };
    const flow = setup(plan);
    await userEvent.click(await confirm());
    await waitFor(() => expect(flow.onClose).toHaveBeenCalledOnce());
    expect(flow.port.bring).toHaveBeenCalledWith(expect.objectContaining({
      source: { kind: "localBranch", name: "topic" }, stateToken: plan.stateToken,
      recoveryReference: plan.recovery.reference, runHooks: false,
    }));
    expect(flow.port.checkSource).not.toHaveBeenCalled();
    expect(flow.onApplied).toHaveBeenCalledWith(completed);
  });

  it("offers no mutation when the source is already contained", async () => {
    const flow = setup({ ...bringPlan, kind: "alreadyContained", forecast: null, requiresConfirmation: false });
    await screen.findByText(/already contains/);
    expect(screen.queryByRole("button", { name: "Bring in changes" })).toBeNull();
    await userEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(flow.port.bring).not.toHaveBeenCalled();
  });

  it("hands the exact verified paused session to the resolver", async () => {
    const paused = { id: "verified-pause" } as unknown as ConflictSession;
    const flow = setup({ ...bringPlan, forecast: { ...clearForecast, outcome: "overlap", overlaps: [{ path: "a.txt", side: "saved" }], overlapCount: 1 } }, {
      startOverlap: vi.fn(async () => ({ session: paused, recovery: completed.recovery })),
    });
    await userEvent.click(await screen.findByRole("button", { name: "Resolve in GitOdile" }));
    await waitFor(() => expect(flow.onClose).toHaveBeenCalledOnce());
    expect(flow.port.startOverlap).toHaveBeenCalledWith(expect.objectContaining({ source: { kind: "branch", source: { kind: "localBranch", name: "topic" } }, stateToken: bringPlan.stateToken }));
    expect(flow.onPaused).toHaveBeenCalledWith(paused);
    expect(flow.port.bring).not.toHaveBeenCalled();
  });

  it("requires saving unsaved overlaps instead of starting a merge", async () => {
    const flow = setup({ ...bringPlan, forecast: { ...clearForecast, outcome: "overlap", overlaps: [{ path: "a.txt", side: "unsaved" }] } });
    await userEvent.click(await screen.findByRole("button", { name: "Save version" }));
    expect(flow.onSaveVersion).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Resolve in GitOdile" })).toBeNull();
  });

  it.each(["untrackedCollision", "preparedOverlap", "carryFailed", "gitTooOld", "operationInProgress", "unresolvedConflicts"] as const)("blocks %s with a way forward and no mutation", async (kind) => {
    const flow = setup({ ...bringPlan, forecast: { ...clearForecast, outcome: "blocked", blocker: { kind, path: "a.txt" } } });
    await screen.findByText(bringPlan.source.label === "topic" ? /From “topic”/ : /unused/);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Bring in changes" })).toBeNull());
    if (kind === "preparedOverlap" || kind === "carryFailed") {
      await userEvent.click(screen.getByRole("button", { name: "Save version" }));
      expect(flow.onSaveVersion).toHaveBeenCalledOnce();
    } else if (kind === "operationInProgress" || kind === "unresolvedConflicts") {
      await userEvent.click(screen.getByRole("button", { name: /overlapping|conflict/i }));
      expect(flow.onOpenConflicts).toHaveBeenCalledOnce();
    } else if (kind === "untrackedCollision") {
      await userEvent.click(screen.getByRole("button", { name: /folder/i }));
      expect(flow.onRevealFile).toHaveBeenCalledWith("a.txt");
    }
    expect(flow.port.bring).not.toHaveBeenCalled();
  });

  it.each(["detached_head", "unborn_branch_no_version", "branch_is_active", "branch_missing", "no_shared_history", "shallow_history", "unsupported_merge_setup", "invalid_remote_configuration", "remote_ref_missing", "index_unavailable", "ref_locked", "dirty_working_tree", "git_operation_in_progress"])("explains %s returned by planning", async (code) => {
    const flow = setup(bringPlan, { plan: vi.fn().mockRejectedValue({ code, message: "blocked", remediation: null }) });
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Bring in changes" })).toBeNull();
    expect(flow.port.bring).not.toHaveBeenCalled();
  });

  it("replans a stale execution without retrying the mutation", async () => {
    const flow = setup(bringPlan, { bring: vi.fn().mockRejectedValue({ code: "stale_bring_in_plan", message: "stale", remediation: null }) });
    await userEvent.click(await confirm());
    await screen.findByText(/Review this updated plan/);
    expect(flow.port.bring).toHaveBeenCalledOnce();
    expect(await confirm()).toBeEnabled();
  });

  it.each(["result", "overlap-error"])("an uncertain %s offers only Close and no automatic follow-up", async (mode) => {
    const flow = setup(mode === "result" ? bringPlan : { ...bringPlan, forecast: { ...clearForecast, outcome: "overlap", overlaps: [{ path: "a.txt", side: "saved" }] } }, {
      bring: vi.fn(async () => ({ ...completed, outcome: "uncertain" as const })),
      startOverlap: vi.fn().mockRejectedValue({ code: "merge_outcome_uncertain", message: "uncertain", remediation: null, detail: "observed HEAD" }),
    });
    await userEvent.click(await screen.findByRole("button", { name: mode === "result" ? "Bring in changes" : "Resolve in GitOdile" }));
    await screen.findByRole("alert");
    expect(within(screen.getByRole("dialog")).getAllByRole("button").every((button) => button.getAttribute("aria-label") === "Close" || button.textContent === "Close")).toBe(true);
    expect(flow.onApplied).not.toHaveBeenCalled();
    expect(flow.onPaused).not.toHaveBeenCalled();
    expect(flow.onPhaseChange).toHaveBeenLastCalledWith("uncertain");
  });

  it("holds confirmation during a remote check, then reviews the refreshed source", async () => {
    let checked!: () => void;
    const flow = setup(bringPlan, {
      plan: vi.fn().mockResolvedValueOnce(bringPlan).mockResolvedValue({ ...bringPlan, stateToken: "after-selected-source-check" }),
      checkSource: vi.fn(() => new Promise<void>((resolve) => { checked = resolve; })),
    }, { source: { kind: "remoteBranch", remote: "fork", branch: "topic" } });
    expect(await confirm()).toBeDisabled();
    expect(flow.port.checkSource).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1", source: { kind: "remoteBranch", remote: "fork", branch: "topic" } });
    checked();
    await waitFor(() => expect(screen.getByRole("button", { name: "Bring in changes" })).toBeEnabled());
    expect(flow.port.plan).toHaveBeenCalledTimes(2);
    await userEvent.click(await confirm());
    await waitFor(() => expect(flow.port.bring).toHaveBeenCalledWith(expect.objectContaining({
      source: { kind: "remoteBranch", remote: "fork", branch: "topic" }, stateToken: "after-selected-source-check",
    })));
  });

  it("does not start a follow-up plan when a remote check finishes after closing", async () => {
    let checked!: () => void;
    const flow = setup(bringPlan, {
      checkSource: vi.fn(() => new Promise<void>((resolve) => { checked = resolve; })),
    }, { source: { kind: "remoteBranch", remote: "fork", branch: "topic" } });
    expect(await confirm()).toBeDisabled();
    flow.unmount();
    await act(async () => { checked(); });
    expect(flow.port.plan).toHaveBeenCalledOnce();
    expect(flow.port.bring).not.toHaveBeenCalled();
  });

  it("a failed selected-remote check cannot execute cached knowledge", async () => {
    const flow = setup(bringPlan, { checkSource: vi.fn().mockRejectedValue({ code: "offline", message: "offline", remediation: null }) }, { source: { kind: "remoteBranch", remote: "fork", branch: "topic" } });
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Bring in changes" })).toBeNull();
    expect(flow.port.bring).not.toHaveBeenCalled();
  });

  it("virtualizes thousands of source branches and selects with the keyboard", async () => {
    const sources = Array.from({ length: 3000 }, (_, index) => ({ kind: "localBranch" as const, name: `topic-${index}` }));
    const flow = setup(bringPlan, { listSources: vi.fn(async () => ({ sources, isTruncated: false })) }, { source: null });
    const first = await screen.findByRole("button", { name: "topic-0" });
    expect(screen.getAllByRole("button").length).toBeLessThan(40);
    // Pointer scrolling must not remove the list's only keyboard entry.
    const scroll = first.closest(".bring-in-list")!;
    fireEvent.scroll(scroll, { target: { scrollTop: 50_000 } });
    expect(screen.getByRole("button", { name: "topic-0" })).toHaveAttribute("tabindex", "0");
    await userEvent.click(screen.getByRole("searchbox"));
    await userEvent.paste("topic-2999");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "topic-2999" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await confirm();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(flow.port.plan).toHaveBeenCalledWith(expect.objectContaining({ source: sources[2999] }));
  });
});
