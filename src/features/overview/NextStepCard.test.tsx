import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import type { WorkingTreeEntry, WorkingTreeStatus } from "../status";
import { EMPTY_TEAM_SYNC_STATE, type TeamSyncViewState } from "../sync";
import { deriveJourney } from "./journey";
import { NextStepCard, type NextStepHandlers } from "./NextStepCard";
import { deriveNextStep } from "./nextStep";
import { OverviewNow } from "./OverviewNow";

function entry(path: string, category: WorkingTreeEntry["category"] = "changed"): WorkingTreeEntry {
  return { path, originalPath: null, category, isPrepared: false, hasUnpreparedChanges: true };
}

function tree(entries: WorkingTreeEntry[]): WorkingTreeStatus {
  const counts = { changed: 0, new: 0, deleted: 0, renamed: 0, conflicted: 0, total: entries.length };
  for (const item of entries) counts[item.category] += 1;
  return {
    isClean: entries.length === 0,
    counts,
    lineTotals: null,
    entries,
    truncated: false,
    hasPreparedChanges: false,
    hasUnpreparedChanges: entries.length > 0,
    upstream: { branch: "main", upstream: "origin/main", ahead: 0, behind: 0 },
  };
}

const ahead: TeamSyncViewState = {
  ...EMPTY_TEAM_SYNC_STATE,
  status: {
    state: "ahead",
    localBranch: "main",
    localCommit: "1".repeat(40),
    upstreamRemote: "origin",
    destinationBranch: "main",
    trackingRef: "refs/remotes/origin/main",
    remoteCommit: "2".repeat(40),
    ahead: 2,
    behind: 0,
    knowledge: "fresh",
    checkedAt: 1_000,
    warnings: [],
    nextActions: [],
    stateToken: "token",
    forecast: null,
  },
};

function handlers(): NextStepHandlers {
  return {
    save: vi.fn(),
    reviewChanges: vi.fn(),
    resolve: vi.fn(),
    publish: vi.fn(),
    openHistory: vi.fn(),
    getChanges: vi.fn(),
    checkRemote: vi.fn(),
    checkLocal: vi.fn(),
    openSettings: vi.fn(),
    openBranches: vi.fn(),
    explainIncoming: vi.fn(),
    getAndPublish: vi.fn(),
    switchToDefault: vi.fn(),
    stopTracking: vi.fn(),
  };
}

function wrap(node: React.ReactNode) {
  return render(
    <LanguageProvider>
      <ScreenLifecycleProvider controller={createScreenLifecycleController("active")}>{node}</ScreenLifecycleProvider>
    </LanguageProvider>,
  );
}

afterEach(cleanup);

describe("NextStepCard", () => {
  it("holds the card's shape until both sides of the project are read", () => {
    const journey = deriveJourney({
      workingTree: tree([entry("a.ts")]),
      workingTreeError: null,
      isCheckingChanges: false,
      pendingVersionsCount: 0,
      teamSync: { ...EMPTY_TEAM_SYNC_STATE, isLoading: true, generation: 1 },
    });
    const { container } = wrap(
      <NextStepCard nextStep={deriveNextStep(journey, { canPublish: true })} journey={journey} handlers={handlers()} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking your project…");
    expect(container.querySelector(".next-step.loading-placeholder")).not.toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says a branch's remote branch is gone and offers the three ways on", async () => {
    const gone: TeamSyncViewState = {
      ...ahead,
      status: {
        ...ahead.status!,
        state: "upstreamGone",
        localBranch: "feature/login",
        destinationBranch: "feature/login",
        trackingRef: "refs/remotes/origin/feature/login",
        ahead: 0,
        nextActions: ["checkAgain"],
      },
    };
    const journey = deriveJourney({
      workingTree: tree([]),
      workingTreeError: null,
      isCheckingChanges: false,
      pendingVersionsCount: 0,
      teamSync: gone,
    });
    const actions = handlers();
    const { container } = wrap(
      <NextStepCard
        nextStep={deriveNextStep(journey, { canPublish: true, defaultBranch: "main" })}
        journey={journey}
        handlers={actions}
        defaultBranch="main"
      />,
    );

    expect(container.querySelector(".next-step")).toHaveClass("next-step--unsaved");
    expect(screen.getByRole("heading", { name: "“feature/login” is no longer on “origin”" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Switch to main" }));
    expect(actions.switchToDefault).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Publish again…" }));
    expect(actions.publish).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Stop following the remote" }));
    expect(actions.stopTracking).toHaveBeenCalledOnce();
    expect(container.querySelectorAll(".primary-button")).toHaveLength(1);
  });

  it("offers to publish a branch that has no publish destination yet", async () => {
    const journey = deriveJourney({
      workingTree: tree([]),
      workingTreeError: null,
      isCheckingChanges: false,
      pendingVersionsCount: 2,
      teamSync: { ...ahead, status: { ...ahead.status!, state: "noUpstream", ahead: 0, upstreamRemote: null, destinationBranch: null } },
    });
    const actions = handlers();
    wrap(<NextStepCard nextStep={deriveNextStep(journey, { canPublish: true })} journey={journey} handlers={actions} />);

    expect(screen.getByRole("heading", { name: "No publish destination yet" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish this branch…" }));
    expect(actions.publish).toHaveBeenCalledOnce();
    expect(deriveNextStep(journey, { canPublish: false }).primary).toBeNull();
  });

  it("offers no switch when the gone branch has no main branch to go to", () => {
    const journey = deriveJourney({
      workingTree: tree([]),
      workingTreeError: null,
      isCheckingChanges: false,
      pendingVersionsCount: 0,
      teamSync: { ...ahead, status: { ...ahead.status!, state: "upstreamGone", ahead: 0 } },
    });
    const step = deriveNextStep(journey, { canPublish: false });
    expect(step).toMatchObject({ kind: "upstreamGone", primary: null, secondary: ["stopTracking"] });
  });

  it("says what to publish and where, with publishing as the one primary action", async () => {
    const journey = deriveJourney({
      workingTree: tree([]),
      workingTreeError: null,
      isCheckingChanges: false,
      pendingVersionsCount: 2,
      teamSync: ahead,
    });
    const actions = handlers();
    const { container } = wrap(
      <NextStepCard nextStep={deriveNextStep(journey, { canPublish: true })} journey={journey} handlers={actions} />,
    );

    expect(container.querySelector(".next-step")).toHaveClass("next-step--ready");
    expect(screen.getByRole("heading", { name: "Publish 2 versions to origin" })).toBeInTheDocument();
    // The title leads: no caption above it and no steps beside it.
    expect(screen.queryByText("Next step")).toBeNull();
    expect(container.querySelector(".next-step__progress")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Publish all 2" }));
    expect(actions.publish).toHaveBeenCalledOnce();
    expect(container.querySelectorAll(".primary-button")).toHaveLength(1);
  });

  it("wears the unsaved colour and offers to save when files have changed", async () => {
    const journey = deriveJourney({
      workingTree: tree([entry("a.ts"), entry("b.ts")]),
      workingTreeError: null,
      isCheckingChanges: false,
      pendingVersionsCount: 2,
      teamSync: ahead,
    });
    const actions = handlers();
    const { container } = wrap(
      <NextStepCard nextStep={deriveNextStep(journey, { canPublish: true })} journey={journey} handlers={actions} />,
    );

    expect(container.querySelector(".next-step")).toHaveClass("next-step--unsaved");
    expect(screen.getByRole("heading", { name: "Save your 2 changes" })).toBeInTheDocument();
    // What comes after counts only the versions already waiting: the one
    // about to be saved goes "along with" them.
    expect(container.querySelector(".next-step__then")).toHaveTextContent("Then: publish it along with 2 more");
    await userEvent.click(screen.getByRole("button", { name: "Save version" }));
    expect(actions.save).toHaveBeenCalledOnce();
  });
});

describe("OverviewNow", () => {
  it("says how much is unsaved in one line, by kind, and leads to Changes", async () => {
    const files = [...Array.from({ length: 3 }, (_, index) => entry(`src/file-${index}.ts`)), entry("src/new.ts", "new")];
    const onReview = vi.fn();
    const { container } = wrap(
      <OverviewNow
        workingTree={tree(files)}
        workingTreeError={null}
        isCheckingChanges={false}
        onReview={onReview}
        onCheckAgain={vi.fn()}
      />,
    );

    // No file names: the side column lists those.
    expect(container.querySelector(".overview-now__files")).toBeNull();
    const row = screen.getByRole("button", { name: /Now: 4 unsaved changes/ });
    expect(row).toHaveClass("overview-now--unsaved");
    expect(row.getAttribute("aria-label")).toContain("3 edited");
    expect([...row.querySelectorAll(".overview-now__kind")].map((kind) => kind.textContent)).toEqual(["3", "1"]);
    await userEvent.click(row);
    expect(onReview).toHaveBeenCalledOnce();
  });

  it("shrinks to one quiet line with nothing unsaved", () => {
    const { container } = wrap(
      <OverviewNow
        workingTree={tree([])}
        workingTreeError={null}
        isCheckingChanges={false}
        onReview={vi.fn()}
        onCheckAgain={vi.fn()}
      />,
    );

    expect(container.querySelector(".overview-now")).toHaveClass("overview-now--quiet");
    expect(screen.getByText("Nothing unsaved")).toBeInTheDocument();
  });

  it("stands a placeholder in for the count until the files are read", () => {
    const { container } = wrap(
      <OverviewNow workingTree={null} workingTreeError={null} isCheckingChanges onReview={vi.fn()} onCheckAgain={vi.fn()} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking");
    expect(container.querySelector(".overview-now .text-placeholder")).not.toBeNull();
    expect(container.querySelector(".icon--spinning")).toBeNull();
  });
});

describe("NextStepCard with a forecast", () => {
  const forecast = {
    outcome: "clear" as const,
    integration: "fastForward" as const,
    remoteCommit: "3".repeat(40),
    incomingCount: 3,
    localCount: 0,
    incomingFileCount: 12,
    authors: ["Ana", "Marcos"],
    authorCount: 2,
    carriedUnsavedCount: 0,
    combinedUnsaved: [],
    combinedUnsavedCount: 0,
    overlaps: [],
    overlapCount: 0,
    blocker: null,
  };
  const teamSync = (status: Partial<NonNullable<TeamSyncViewState["status"]>>): TeamSyncViewState => ({
    ...ahead,
    status: { ...ahead.status!, ahead: 0, ...status },
  });
  const card = (workingTree: WorkingTreeStatus, sync: TeamSyncViewState, pending = 0) => {
    const journey = deriveJourney({
      workingTree, workingTreeError: null, isCheckingChanges: false, pendingVersionsCount: pending, teamSync: sync,
    });
    const actions = handlers();
    const view = wrap(<NextStepCard nextStep={deriveNextStep(journey, { canPublish: true })} journey={journey} handlers={actions} />);
    return { actions, ...view };
  };

  it("says who sent what and that nothing overlaps, with a counted button", async () => {
    const { actions } = card(tree([]), teamSync({ state: "behind", behind: 3, forecast }));
    expect(screen.getByRole("heading", { name: "3 new versions on origin" })).toBeInTheDocument();
    expect(screen.getByText("From Ana and Marcos · 12 files.")).toBeInTheDocument();
    expect(screen.getByText("Nothing of yours overlaps.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Get 3 versions" }));
    expect(actions.getChanges).toHaveBeenCalledOnce();
  });

  it("offers to combine and to publish when both sides moved apart", async () => {
    const { actions } = card(
      tree([]),
      teamSync({ state: "diverged", ahead: 1, behind: 2, forecast: { ...forecast, integration: "merge", localCount: 1, incomingCount: 2 } }),
      1,
    );
    expect(screen.getByRole("heading", { name: "origin has 2 new versions and you have 1 unpublished" })).toBeInTheDocument();
    expect(screen.getByText("They don't overlap: they can be combined.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get and combine" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Get and publish" }));
    expect(actions.getAndPublish).toHaveBeenCalledOnce();
  });

  it("opens the review of saved upstream overlaps without starting resolution", async () => {
    const { actions, container } = card(
      tree([]),
      teamSync({
        state: "diverged", ahead: 1, behind: 2,
        forecast: { ...forecast, outcome: "overlap", overlaps: [{ path: "src/auth.ts", side: "saved" }], overlapCount: 2 },
      }),
      1,
    );
    expect(container.querySelector(".next-step")).toHaveClass("next-step--blocked");
    expect(screen.getByRole("heading", { name: "Your changes and origin's overlap" })).toBeInTheDocument();
    expect(screen.getByText(/src\/auth\.ts changes the same lines on both sides \(and 1 more\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "See what overlaps" }));
    expect(actions.explainIncoming).toHaveBeenCalledOnce();
  });

  it("lets unsaved work and a safe update sit side by side", () => {
    card(tree([entry("a.ts")]), teamSync({ state: "behind", behind: 3, forecast }));
    expect(screen.getByText("3 new versions on origin don't touch your files.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get 3 versions" })).toHaveClass("secondary-button");
    expect(screen.getByRole("button", { name: "Save version" })).toHaveClass("primary-button");
  });
});
