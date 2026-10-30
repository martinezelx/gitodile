import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { ToastProvider } from "../../shared/ui";
import type { SyncController } from "./controller";
import type { GetTeamChangesPlan, GetTeamChangesResult, IncomingForecast, TeamSyncStatus } from "./domain";
import { GetTeamChangesDialog, type GetTeamIntent, type PublishAfterGet } from "./GetTeamChangesDialog";

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

function controller(plan: GetTeamChangesPlan = basePlan, overrides: Partial<SyncController> = {}): SyncController {
  return {
    planGet: vi.fn(async () => plan),
    get: vi.fn(async () => result("completed", plan.integration)),
    ...overrides,
  } as unknown as SyncController;
}

function renderDialog(
  syncController: SyncController,
  options: {
    overlapPort?: Pick<import("./port").BringInPort, "startOverlap">;
    onPaused?: (session: import("../conflicts").ConflictSession) => Promise<void>;
    intent?: GetTeamIntent;
    canPublish?: boolean;
    runHooks?: boolean;
    refreshRemote?: (() => Promise<TeamSyncStatus | null>) | null;
    upstreamGone?: boolean;
    onSaveVersion?: () => void;
    onRevealFile?: (path: string) => void;
    onPublishAfter?: () => Promise<PublishAfterGet>;
  } = {},
) {
  const onClose = vi.fn();
  const onPhaseChange = vi.fn();
  const onApplied = vi.fn(async () => undefined);
  render(
    <LanguageProvider>
      <ToastProvider>
        <GetTeamChangesDialog
          isOpen
          controller={syncController}
          overlapPort={options.overlapPort ?? { startOverlap: vi.fn() }}
          onPaused={options.onPaused ?? vi.fn()}
          projectPath="/repo"
          sessionEpoch="epoch-1"
          intent={options.intent}
          runHooks={options.runHooks ?? true}
          canPublish={options.canPublish}
          refreshRemote={options.refreshRemote}
          upstreamGone={options.upstreamGone}
          onClose={onClose}
          onApplied={onApplied}
          onPhaseChange={onPhaseChange}
          onSaveVersion={options.onSaveVersion}
          onRevealFile={options.onRevealFile}
          onPublishAfter={options.onPublishAfter}
        />
      </ToastProvider>
    </LanguageProvider>,
  );
  return { onApplied, onClose, onPhaseChange };
}

const NOTHING_TO_GET = { code: "nothing_to_get", message: "x", remediation: null };

const overlapPlan: GetTeamChangesPlan = {
  ...mergePlan,
  forecast: { ...mergePlan.forecast, outcome: "overlap", overlaps: [{ path: "lines.txt", side: "saved" }], overlapCount: 1 },
};

describe("Get project changes dialog", () => {
  it.each(["get", "getAndPublish"] as const)("hands a verified upstream pause to the resolver without publishing (%s)", async (intent) => {
    const paused = { sessionId: "verified-upstream" } as unknown as import("../conflicts").ConflictSession;
    let finish: (value: { session: typeof paused; recovery: ReturnType<typeof result>["recovery"] }) => void = () => undefined;
    const startOverlap = vi.fn(() => new Promise<{ session: typeof paused; recovery: ReturnType<typeof result>["recovery"] }>((resolve) => { finish = resolve; }));
    const onPaused = vi.fn(async () => undefined);
    const onPublishAfter = vi.fn();
    const sync = controller(overlapPlan);
    const { onClose, onApplied } = renderDialog(sync, { intent, onPaused, onPublishAfter, overlapPort: { startOverlap } });
    await userEvent.click(await screen.findByRole("button", { name: "Resolve in GitOdile" }));
    expect(startOverlap).toHaveBeenCalledExactlyOnceWith({ projectId: "/repo", sessionEpoch: "epoch-1", source: { kind: "upstream" }, stateToken: overlapPlan.stateToken, recoveryReference: overlapPlan.recovery.reference });
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finish({ session: paused, recovery: result("completed").recovery }));
    expect(onPaused).toHaveBeenCalledExactlyOnceWith(paused);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onApplied).not.toHaveBeenCalled();
    expect(sync.get).not.toHaveBeenCalled();
    expect(onPublishAfter).not.toHaveBeenCalled();
  });

  it.each(["native", "handoff"] as const)("offers only Close after uncertainty in the %s", async (source) => {
    const startOverlap = source === "native"
      ? vi.fn().mockRejectedValue({ code: "merge_outcome_uncertain", message: "Unconfirmed", detail: "start-1", remediation: null })
      : vi.fn().mockResolvedValue({ session: { sessionId: "verified-upstream" }, recovery: result("completed").recovery });
    const onPaused = source === "native" ? vi.fn() : vi.fn().mockRejectedValue(new Error("Refresh failed after adoption"));
    const onPublishAfter = vi.fn();
    const sync = controller(overlapPlan);
    const { onPhaseChange } = renderDialog(sync, { intent: "getAndPublish", onPaused, onPublishAfter, overlapPort: { startOverlap } });
    await userEvent.click(await screen.findByRole("button", { name: "Resolve in GitOdile" }));
    const alert = await screen.findByRole("alertdialog", { name: "Result not confirmed" });
    expect(alert).toHaveTextContent(overlapPlan.recovery.reference);
    if (source === "native") expect(alert).toHaveTextContent("start-1");
    expect(screen.getAllByRole("button").every((button) => button.textContent === "Close" || button.getAttribute("aria-label") === "Close")).toBe(true);
    expect(onPhaseChange).toHaveBeenLastCalledWith("uncertain");
    expect(onPaused).toHaveBeenCalledTimes(source === "native" ? 0 : 1);
    expect(onPublishAfter).not.toHaveBeenCalled();
    expect(sync.get).not.toHaveBeenCalled();
  });

  it("reviews a stale upstream plan instead of retrying the merge", async () => {
    const startOverlap = vi.fn().mockRejectedValue({ code: "stale_get_team_changes_plan", message: "Moved", remediation: null });
    const sync = controller(overlapPlan, { planGet: vi.fn().mockResolvedValueOnce(overlapPlan).mockResolvedValue({ ...overlapPlan, stateToken: "reviewed-again" }) });
    renderDialog(sync, { overlapPort: { startOverlap } });
    await userEvent.click(await screen.findByRole("button", { name: "Resolve in GitOdile" }));
    await screen.findByText("Something changed while this was open. This is the updated summary.");
    expect(startOverlap).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Resolve in GitOdile" }));
    expect(startOverlap).toHaveBeenLastCalledWith(expect.objectContaining({ stateToken: "reviewed-again" }));
  });

  it("holds resolution for the upstream check and uses its new plan", async () => {
    let finish: (status: TeamSyncStatus) => void = () => undefined;
    const refreshRemote = vi.fn(() => new Promise<TeamSyncStatus>((resolve) => { finish = resolve; }));
    const startOverlap = vi.fn().mockRejectedValue({ code: "merge_start_refused", message: "Refused", remediation: null });
    const sync = controller(overlapPlan, { planGet: vi.fn().mockResolvedValueOnce(overlapPlan).mockResolvedValue({ ...overlapPlan, stateToken: "after-check" }) });
    renderDialog(sync, { refreshRemote, overlapPort: { startOverlap } });
    expect(await screen.findByRole("button", { name: "Resolve in GitOdile" })).toBeDisabled();
    await act(async () => finish(syncStatus("new-upstream")));
    await waitFor(() => expect(screen.getByRole("button", { name: "Resolve in GitOdile" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Resolve in GitOdile" }));
    expect(startOverlap).toHaveBeenCalledWith(expect.objectContaining({ stateToken: "after-check" }));
  });

  it.each(["failed", "gone"] as const)("blocks cached overlap resolution when the upstream check is %s", async (check) => {
    const startOverlap = vi.fn();
    const refreshRemote = check === "failed" ? vi.fn().mockRejectedValue(new Error("Offline")) : vi.fn().mockResolvedValue({ ...syncStatus(overlapPlan.remoteCommit), state: "upstreamGone" });
    renderDialog(controller(overlapPlan), { refreshRemote, overlapPort: { startOverlap } });
    await screen.findByRole("alertdialog");
    expect(screen.queryByRole("button", { name: "Resolve in GitOdile" })).toBeNull();
    expect(startOverlap).not.toHaveBeenCalled();
    expect(screen.queryByText("As far as this computer knows, there are no newer versions to bring in.")).toBeNull();
  });

  it("keeps keyboard focus in the review after a refused start", async () => {
    const startOverlap = vi.fn().mockRejectedValue({ code: "merge_start_refused", message: "Refused", remediation: null });
    renderDialog(controller(overlapPlan), { overlapPort: { startOverlap } });
    const confirm = await screen.findByRole("button", { name: "Resolve in GitOdile" });
    confirm.focus();
    await userEvent.keyboard("{Enter}");
    const review = await screen.findByRole("button", { name: "Review again" });
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    expect(review).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Resolve in GitOdile" })).toBeNull();
    expect(startOverlap).toHaveBeenCalledOnce();
  });

  it.each(["executing", "uncertain"] as const)("ignores a late remote replan while the mutation is %s", async (phase) => {
    let finishCheck: (status: TeamSyncStatus) => void = () => undefined;
    let finishPlan: (plan: GetTeamChangesPlan) => void = () => undefined;
    let finishGet: (value: GetTeamChangesResult) => void = () => undefined;
    const planGet = vi.fn().mockResolvedValueOnce(mergePlan).mockImplementation(() => new Promise<GetTeamChangesPlan>((resolve) => { finishPlan = resolve; }));
    const get = vi.fn(() => new Promise<GetTeamChangesResult>((resolve) => { finishGet = resolve; }));
    const onPublishAfter = vi.fn();
    const startOverlap = vi.fn();
    const { onClose } = renderDialog(controller(mergePlan, { planGet, get }), {
      intent: "getAndPublish", onPublishAfter, overlapPort: { startOverlap },
      refreshRemote: () => new Promise<TeamSyncStatus>((resolve) => { finishCheck = resolve; }),
    });
    const confirm = await screen.findByRole("button", { name: "Get and publish" });
    await act(async () => finishCheck(syncStatus("moved-upstream")));
    await waitFor(() => expect(planGet).toHaveBeenCalledTimes(2));
    // Clean Get may execute its cached review while the remote replan is out.
    // Rust validates that token; its pending mutation/uncertainty owns the UI.
    await userEvent.click(confirm);
    if (phase === "uncertain") await act(async () => finishGet(result("uncertain", "merge")));
    await act(async () => finishPlan(overlapPlan));
    expect(screen.queryByRole("button", { name: "Resolve in GitOdile" })).toBeNull();
    if (phase === "executing") {
      expect(screen.getByRole("button", { name: "Getting…" })).toBeDisabled();
      await userEvent.keyboard("{Escape}");
      expect(onClose).not.toHaveBeenCalled();
      await act(async () => finishGet(result("uncertain", "merge")));
    }
    expect(screen.getByRole("alertdialog", { name: "Result not confirmed" })).toBeInTheDocument();
    expect(onPublishAfter).not.toHaveBeenCalled();
    expect(startOverlap).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledOnce();
  });

  it.each(["executing", "uncertain"] as const)("keeps the mutation's %s state when upstream metadata changes", async (phase) => {
    let finishGet: (value: GetTeamChangesResult) => void = () => undefined;
    const sync = controller(basePlan, { get: vi.fn(() => new Promise<GetTeamChangesResult>((resolve) => { finishGet = resolve; })) });
    const onClose = vi.fn();
    const dialog = (upstreamGone: boolean) => <LanguageProvider><ToastProvider>
      <GetTeamChangesDialog isOpen controller={sync} overlapPort={{ startOverlap: vi.fn() }} onPaused={vi.fn()} projectPath="/repo" sessionEpoch="epoch-1" runHooks upstreamGone={upstreamGone} onApplied={vi.fn()} onClose={onClose} onPhaseChange={vi.fn()} />
    </ToastProvider></LanguageProvider>;
    const view = render(dialog(false));
    await userEvent.click(await screen.findByRole("button", { name: "Get" }));
    if (phase === "uncertain") await act(async () => finishGet(result("uncertain")));
    view.rerender(dialog(true));
    if (phase === "executing") {
      expect(screen.getByRole("button", { name: "Getting…" })).toBeDisabled();
      await userEvent.keyboard("{Escape}");
      expect(onClose).not.toHaveBeenCalled();
      await act(async () => finishGet(result("uncertain")));
    }
    const uncertain = screen.getByRole("alertdialog", { name: "Result not confirmed" });
    expect(uncertain).toHaveTextContent(basePlan.recovery.reference);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(sync.planGet).toHaveBeenCalledOnce();
  });

  it("does not start a new plan when the upstream check finishes after close", async () => {
    let finish: (status: TeamSyncStatus) => void = () => undefined;
    const refreshRemote = () => new Promise<TeamSyncStatus>((resolve) => { finish = resolve; });
    const sync = controller(overlapPlan);
    const view = render(<LanguageProvider><ToastProvider><GetTeamChangesDialog isOpen controller={sync} overlapPort={{ startOverlap: vi.fn() }} onPaused={vi.fn()} projectPath="/repo" sessionEpoch="epoch-1" runHooks onApplied={vi.fn()} onClose={vi.fn()} onPhaseChange={vi.fn()} refreshRemote={refreshRemote} /></ToastProvider></LanguageProvider>);
    await screen.findByRole("button", { name: "Resolve in GitOdile" });
    view.unmount();
    await act(async () => finish(syncStatus("late-upstream")));
    expect(sync.planGet).toHaveBeenCalledOnce();
  });

  it("says in one line what comes in and what of yours stays, without waiting on the network", async () => {
    const sync = controller();
    renderDialog(sync);
    expect(await screen.findByRole("heading", { name: "Get 2 versions from origin" })).toBeInTheDocument();
    expect(screen.getByText("From Ada and Grace · 3 files")).toBeInTheDocument();
    // What stays safe is one line, the plan's last fact.
    expect(screen.getByText("Nothing of yours overlaps. Your 2 unsaved files stay as they are. A recovery point is saved first.")).toBeInTheDocument();
    // The list of versions is there but folded; technical evidence too.
    expect(screen.getByText("What comes in")).toBeInTheDocument();
    expect(screen.getByText("Team work")).not.toBeVisible();
    expect(sync.planGet).toHaveBeenCalledWith({ projectId: "/repo", sessionEpoch: "epoch-1" });
  });

  it("gets with one press, passing the hooks switch, and closes on a toast", async () => {
    const sync = controller();
    const { onApplied, onClose, onPhaseChange } = renderDialog(sync, { runHooks: false });
    await userEvent.click(await screen.findByRole("button", { name: "Get" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(sync.get).toHaveBeenCalledWith(expect.objectContaining({
      stateToken: "opaque-token",
      recoveryReference: basePlan.recovery.reference,
      runHooks: false,
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onPhaseChange).toHaveBeenLastCalledWith("success");
  });

  it("offers to combine a diverged branch, and to publish in the same confirmation", async () => {
    const sync = controller(mergePlan);
    const onPublishAfter = vi.fn(async () => ({ publishedCount: 2, remote: "origin" }));
    const { onClose } = renderDialog(sync, { canPublish: true, onPublishAfter });
    expect(await screen.findByRole("heading", { name: "Get and combine 2 versions" })).toBeInTheDocument();
    expect(screen.getByText(/A merge version joins both branches/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get and combine" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Get, combine and publish" }));
    await waitFor(() => expect(onPublishAfter).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("leads with publishing when that is what was asked for", async () => {
    let finishPublish: (value: PublishAfterGet) => void = () => undefined;
    const onPublishAfter = vi.fn(() => new Promise<PublishAfterGet>((resolve) => { finishPublish = resolve; }));
    const { onClose } = renderDialog(controller(mergePlan), { intent: "getAndPublish", onPublishAfter });
    expect(await screen.findByRole("heading", { name: "Publish 1 version to origin" })).toBeInTheDocument();
    expect(screen.getByText("First 2 versions come in from Ada and Grace.")).toBeInTheDocument();
    expect(screen.getByText(/Then your version and the merge version are published to origin/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Get and publish" }));
    await waitFor(() => expect(onPublishAfter).toHaveBeenCalled());
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finishPublish({ publishedCount: 2, remote: "origin" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the project up to date and offers to retry when only the publish fails", async () => {
    const onPublishAfter = vi.fn()
      .mockRejectedValueOnce({ code: "remote_rejected", message: "no", remediation: null })
      .mockResolvedValueOnce({ publishedCount: 2, remote: "origin" });
    const { onClose } = renderDialog(controller(mergePlan), { intent: "getAndPublish", onPublishAfter });
    await userEvent.click(await screen.findByRole("button", { name: "Get and publish" }));
    expect(await screen.findByText("Your project is up to date, but publishing failed.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try publishing again" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onPublishAfter).toHaveBeenCalledTimes(2);
  });

  it("names unsaved edits it keeps on top of incoming ones", async () => {
    renderDialog(controller({
      ...basePlan,
      forecast: { ...clearForecast, carriedUnsavedCount: 0, combinedUnsaved: ["README.md"], combinedUnsavedCount: 1 },
    }));
    expect(await screen.findByText("Your unsaved edits to README.md stay unsaved, on top of the incoming ones.")).toBeInTheDocument();
  });

  it("keeps mixed saved and unsaved overlaps blocked with save guidance", async () => {
    const sync = controller({
      ...mergePlan,
      forecast: {
        ...mergePlan.forecast,
        outcome: "overlap",
        overlaps: [{ path: "src/auth.ts", side: "saved" }, { path: "README.md", side: "unsaved" }],
        overlapCount: 3,
      },
    });
    const onSaveVersion = vi.fn();
    const startOverlap = vi.fn();
    renderDialog(sync, { onSaveVersion, overlapPort: { startOverlap } });
    const alert = await screen.findByRole("dialog", { name: /Review overlapping changes/ });
    expect(alert).toHaveTextContent("src/auth.ts");
    expect(alert).toHaveTextContent("your saved version");
    expect(alert).toHaveTextContent("your unsaved changes");
    expect(alert).toHaveTextContent("And 1 more.");
    expect(screen.queryByRole("button", { name: /Get/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resolve in GitOdile" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));
    expect(onSaveVersion).toHaveBeenCalledOnce();
    expect(startOverlap).not.toHaveBeenCalled();
    expect(sync.get).not.toHaveBeenCalled();
  });

  it("explains what is in the way and offers the way through", async () => {
    const onRevealFile = vi.fn();
    renderDialog(controller({
      ...basePlan,
      forecast: { ...clearForecast, outcome: "blocked", blocker: { kind: "untrackedCollision", path: "assets/logo.svg" } },
    }), { onRevealFile });
    expect(await screen.findByRole("alertdialog", { name: "A file of yours would be overwritten" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show in folder" }));
    expect(onRevealFile).toHaveBeenCalledWith("assets/logo.svg");
  });

  it("hands a prepared overlap over to Save version", async () => {
    const onSaveVersion = vi.fn();
    renderDialog(controller({
      ...basePlan,
      forecast: { ...clearForecast, outcome: "blocked", blocker: { kind: "preparedOverlap", path: "lines.txt" } },
    }), { onSaveVersion });
    await userEvent.click(await screen.findByRole("button", { name: "Save version" }));
    expect(onSaveVersion).toHaveBeenCalled();
  });

  it("checks the remote in the background and re-plans in place when it moved", async () => {
    const newer = { ...basePlan, remoteCommit: "9999999999999999999999999999999999999999", incomingCount: 3 };
    const planGet = vi.fn().mockResolvedValueOnce(basePlan).mockResolvedValue(newer);
    let finishCheck: (status: TeamSyncStatus) => void = () => undefined;
    const refreshRemote = vi.fn(() => new Promise<TeamSyncStatus | null>((resolve) => { finishCheck = resolve; }));
    renderDialog(controller(basePlan, { planGet } as Partial<SyncController>), { refreshRemote });
    expect(await screen.findByRole("heading", { name: "Get 2 versions from origin" })).toBeInTheDocument();
    expect(screen.getByText("Checking origin for anything newer…")).toBeInTheDocument();
    finishCheck(syncStatus(newer.remoteCommit));
    expect(await screen.findByRole("heading", { name: "Get 3 versions from origin" })).toBeInTheDocument();
    expect(screen.getByText("Something changed while this was open. This is the updated summary.")).toBeInTheDocument();
  });

  it("shows the new summary instead of an error when the plan went stale", async () => {
    const newer = { ...basePlan, incomingCount: 3 };
    const planGet = vi.fn().mockResolvedValueOnce(basePlan).mockResolvedValue(newer);
    const get = vi.fn().mockRejectedValue({ code: "stale_get_team_changes_plan", message: "stale", remediation: null });
    renderDialog(controller(basePlan, { planGet, get } as Partial<SyncController>));
    await userEvent.click(await screen.findByRole("button", { name: "Get" }));
    expect(await screen.findByRole("heading", { name: "Get 3 versions from origin" })).toBeInTheDocument();
    expect(screen.getByText("Something changed while this was open. This is the updated summary.")).toBeInTheDocument();
  });

  it.each(["native", "refresh", "stale-refresh"])("preserves recovery and offers only Close after uncertainty in %s", async (mode) => {
    const completed = result(mode === "native" ? "uncertain" : "completed");
    completed.recovery.unsavedReference = "refs/gitodile/recovery/v1/get-team-changes-unsaved/worktree-a/1";
    const sync = controller(mergePlan, { get: vi.fn(async () => completed) });
    const onPublishAfter = vi.fn();
    const { onApplied, onPhaseChange } = renderDialog(sync, { intent: "getAndPublish", onPublishAfter });
    onApplied.mockRejectedValue(mode === "stale-refresh" ? { code: "stale_get_team_changes_plan", message: "refresh failed", remediation: null } : new Error("refresh failed after native update"));
    await userEvent.click(await screen.findByRole("button", { name: "Get and publish" }));
    const alert = await screen.findByRole("alertdialog", { name: "Result not confirmed" });
    expect(alert).toHaveTextContent(completed.recovery.reference);
    expect(alert).toHaveTextContent(completed.recovery.unsavedReference);
    expect(screen.getAllByRole("button").every((button) => button.textContent === "Close" || button.getAttribute("aria-label") === "Close")).toBe(true);
    expect(onPhaseChange).toHaveBeenLastCalledWith("uncertain");
    expect(sync.get).toHaveBeenCalledOnce();
    expect(sync.planGet).toHaveBeenCalledOnce();
    expect(onPublishAfter).not.toHaveBeenCalled();
  });

  it("offers nothing to get from a branch whose remote branch is gone", async () => {
    const sync = controller();
    renderDialog(sync, { upstreamGone: true });
    expect(await screen.findByRole("alertdialog", { name: "The update stopped safely" })).toBeInTheDocument();
    expect(screen.getByText("The tracked branch no longer exists on the remote.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(sync.planGet).not.toHaveBeenCalled();
  });

  it("stops when the background check finds the remote branch gone", async () => {
    let finishCheck: (status: TeamSyncStatus) => void = () => undefined;
    const refreshRemote = vi.fn(() => new Promise<TeamSyncStatus | null>((resolve) => { finishCheck = resolve; }));
    renderDialog(controller(), { refreshRemote });
    expect(await screen.findByRole("heading", { name: "Get 2 versions from origin" })).toBeInTheDocument();
    finishCheck({ ...syncStatus(basePlan.remoteCommit), state: "upstreamGone", behind: 0, nextActions: ["checkAgain"] });
    expect(await screen.findByText("The tracked branch no longer exists on the remote.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get" })).not.toBeInTheDocument();
  });

  it.each(["git_operation_in_progress", "no_shared_history", "shallow_history", "unsupported_merge_setup"])("closes a deterministic %s refusal without offering a retry", async (code) => {
    renderDialog(controller(basePlan, {
      planGet: vi.fn().mockRejectedValue({ code, message: "x", remediation: null }),
    } as Partial<SyncController>));
    expect(await screen.findByRole("alertdialog", { name: "The update stopped safely" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("ends on a toast, with no dialog, when the project is already up to date", async () => {
    const { onClose, onPhaseChange } = renderDialog(controller(basePlan, {
      planGet: vi.fn().mockRejectedValue(NOTHING_TO_GET),
    } as Partial<SyncController>));
    expect(await screen.findByText("Everything is up to date. There are no newer versions to bring in.")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPhaseChange).toHaveBeenLastCalledWith("success");
    expect(onPhaseChange).not.toHaveBeenCalledWith("error");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("keeps loading while the remote is asked, then says it is up to date", async () => {
    let finishCheck: (status: TeamSyncStatus | null) => void = () => undefined;
    const refreshRemote = vi.fn(() => new Promise<TeamSyncStatus | null>((resolve) => { finishCheck = resolve; }));
    const planGet = vi.fn().mockRejectedValue(NOTHING_TO_GET);
    const { onClose, onPhaseChange } = renderDialog(
      controller(basePlan, { planGet } as Partial<SyncController>),
      { refreshRemote },
    );
    // Past the grace period the loading shell shows, and nothing says "stopped".
    expect(await screen.findByRole("dialog", { name: "Get project changes" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    finishCheck(syncStatus(basePlan.localCommit));
    expect(await screen.findByText("Everything is up to date. There are no newer versions to bring in.")).toBeInTheDocument();
    expect(planGet).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPhaseChange).not.toHaveBeenCalledWith("error");
  });

  it("says the remote could not be asked instead of claiming it is up to date", async () => {
    let failCheck: (error: unknown) => void = () => undefined;
    const refreshRemote = vi.fn(() => new Promise<TeamSyncStatus | null>((_, reject) => { failCheck = reject; }));
    const planGet = vi.fn().mockRejectedValue(NOTHING_TO_GET);
    const { onClose, onPhaseChange } = renderDialog(
      controller(basePlan, { planGet } as Partial<SyncController>),
      { refreshRemote },
    );
    expect(await screen.findByRole("dialog", { name: "Get project changes" })).toBeInTheDocument();
    failCheck(new Error("Could not connect to origin."));
    expect(await screen.findByRole("alertdialog", { name: "Couldn't check project changes" })).toBeInTheDocument();
    expect(screen.getByText("Could not connect to origin.")).toBeInTheDocument();
    expect(screen.getByText("As far as this computer knows, there are no newer versions to bring in.")).toBeInTheDocument();
    expect(screen.queryByText("Everything is up to date. There are no newer versions to bring in.")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onPhaseChange).toHaveBeenLastCalledWith("error");

    // Trying again asks the remote again; this time it answers.
    refreshRemote.mockImplementation(async () => syncStatus(basePlan.localCommit));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Everything is up to date. There are no newer versions to bring in.")).toBeInTheDocument();
    expect(refreshRemote).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("falls back to its own words when the failed check gave no reason", async () => {
    const refreshRemote = vi.fn(async (): Promise<TeamSyncStatus | null> => { throw new Error("Couldn't check project changes"); });
    renderDialog(
      controller(basePlan, { planGet: vi.fn().mockRejectedValue(NOTHING_TO_GET) } as Partial<SyncController>),
      { refreshRemote },
    );
    expect(await screen.findByRole("alertdialog", { name: "Couldn't check project changes" })).toBeInTheDocument();
    expect(screen.getByText("The remote didn't answer. Check your connection and try again.")).toBeInTheDocument();
  });

  it("waits for the remote check when a stale update finds nothing left to get", async () => {
    let finishCheck: (status: TeamSyncStatus | null) => void = () => undefined;
    const refreshRemote = vi.fn(() => new Promise<TeamSyncStatus | null>((resolve) => { finishCheck = resolve; }));
    const planGet = vi.fn().mockResolvedValueOnce(basePlan).mockRejectedValue(NOTHING_TO_GET);
    const get = vi.fn().mockRejectedValue({ code: "stale_get_team_changes_plan", message: "stale", remediation: null });
    const { onClose } = renderDialog(
      controller(basePlan, { planGet, get } as Partial<SyncController>),
      { refreshRemote },
    );
    await userEvent.click(await screen.findByRole("button", { name: "Get" }));
    // Back to loading, not stuck on "Getting…" with nothing to wait for.
    expect(await screen.findByRole("heading", { name: "Get project changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
    finishCheck(syncStatus(basePlan.localCommit));
    expect(await screen.findByText("Everything is up to date. There are no newer versions to bring in.")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("goes from loading straight to the plan when the remote check finds versions", async () => {
    let finishCheck: (status: TeamSyncStatus | null) => void = () => undefined;
    const refreshRemote = vi.fn(() => new Promise<TeamSyncStatus | null>((resolve) => { finishCheck = resolve; }));
    const planGet = vi.fn().mockRejectedValueOnce(NOTHING_TO_GET).mockResolvedValue(basePlan);
    renderDialog(controller(basePlan, { planGet } as Partial<SyncController>), { refreshRemote });
    expect(await screen.findByRole("dialog", { name: "Get project changes" })).toBeInTheDocument();
    finishCheck(syncStatus(basePlan.remoteCommit));
    expect(await screen.findByRole("heading", { name: "Get 2 versions from origin" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
