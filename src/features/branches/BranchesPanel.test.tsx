import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LanguageProvider } from "../../i18n";
import { BranchesPanel } from "./BranchesPanel";
import type { BranchHistory, BranchVersion, BranchesSnapshot } from "./domain";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockedInvoke = vi.mocked(invoke);

function snapshot(overrides: Partial<BranchesSnapshot> = {}): BranchesSnapshot {
  return {
    branch: "main",
    headState: "branch",
    currentCommit: "abc123",
    branches: [
      {
        name: "main",
        tip: { commit: "abc123", shortCommit: "abc123a", subject: "first version", committedAt: "2026-07-01T00:00:00Z" },
        isActive: true,
        upstream: null,
        isRetainedElsewhere: false,
        isFinished: false,
        uniqueCommitCount: null,
        worktreePath: null,
        upstreamAhead: null,
        upstreamBehind: null,
        upstreamGone: false,
        isDefault: false,
      },
      {
        name: "feature/new-thing",
        tip: { commit: "def456", shortCommit: "def456a", subject: "in progress", committedAt: "2026-07-02T00:00:00Z" },
        isActive: false,
        upstream: null,
        isRetainedElsewhere: true,
        isFinished: true,
        uniqueCommitCount: 2,
        worktreePath: null,
        upstreamAhead: null,
        upstreamBehind: null,
        upstreamGone: false,
        isDefault: false,
      },
    ],
    totalCount: 2,
    isTruncated: false,
    unreadableCount: 0,
    ...overrides,
  };
}

/** The default snapshot plus a third branch under a different name prefix, so
 * the search box and the prefix checkboxes have something to discriminate. */
function withBugfixBranch(): BranchesSnapshot {
  return snapshot({
    branches: [
      snapshot().branches[0],
      snapshot().branches[1],
      {
        name: "bugfix/other",
        tip: { commit: "ghi789", shortCommit: "ghi789a", subject: "fix", committedAt: "2026-07-03T00:00:00Z" },
        isActive: false,
        upstream: null,
        isRetainedElsewhere: true,
        isFinished: true,
        uniqueCommitCount: 0,
        worktreePath: null,
        upstreamAhead: null,
        upstreamBehind: null,
        upstreamGone: false,
        isDefault: false,
      },
    ],
    totalCount: 3,
  });
}

/** The panel is controlled: the branch inventory, its loading flag, and its
 * error live in the project session so leaving the screen and coming back
 * renders the known answer instead of a spinner (task 019). These defaults
 * stand in for `app/App.tsx` holding a loaded snapshot. */
function renderPanel(
  props: Partial<React.ComponentProps<typeof BranchesPanel>> = {},
  { openCleanUp = true }: { openCleanUp?: boolean } = {},
) {
  const onChanged = vi.fn();
  const onSaveVersion = vi.fn();
  const onRefresh = vi.fn();
  const onSnapshot = vi.fn();
  const utils = render(
    <LanguageProvider>
      <BranchesPanel
        projectPath="/repo"
        sessionEpoch="epoch-1"
        snapshot={snapshot()}
        error={null}
        isLoading={false}
        watcherState="watching"
        onOpenSettings={vi.fn()}
        onRefresh={onRefresh}
        onSnapshot={onSnapshot}
        onChanged={onChanged}
        onSaveVersion={onSaveVersion}
        {...props}
        onOperationStart={props.onOperationStart ?? (() => true)}
        onOperationFinish={props.onOperationFinish ?? vi.fn()}
        onOperationPhaseChange={props.onOperationPhaseChange ?? vi.fn()}
      />
    </LanguageProvider>,
  );
  // Most tests are about a branch, not about where the list files it: the
  // fixture's branches are safe to delete, so "Ready to clean up" is opened the
  // way a reader would before reaching them.
  const cleanUp = screen.queryByRole("treeitem", { name: /^Ready to clean up/ });
  if (openCleanUp && cleanUp?.getAttribute("aria-expanded") === "false") fireEvent.click(cleanUp);
  return { onChanged, onSaveVersion, onRefresh, onSnapshot, ...utils };
}

/** One saved version as the route sends it with a lane. */
function routeVersion(subject: string, commit: string): BranchVersion {
  return {
    commit,
    shortCommit: commit.slice(0, 7),
    subject,
    authorName: "Ada Lovelace",
    authorEmail: "ada@example.com",
    committedAt: "2026-07-03T00:00:00Z",
  };
}

/** What the on-demand per-branch read answers. Only the selected branch's history
 * is ever asked for, so a stub keyed by name is all the panel can observe. */
function history(name: string, overrides: Partial<BranchHistory> = {}): BranchHistory {
  // Newest first, and the newest is this branch's own tip: the read is asked for
  // by tip commit, so a stub whose first record belongs to a different branch
  // describes a state the app cannot be in.
  const tip = snapshot().branches.find((branch) => branch.name === name)?.tip ?? {
    commit: `${name}-tip`,
    shortCommit: `${name}-tipa`,
    subject: `latest on ${name}`,
    committedAt: "2026-07-02T00:00:00Z",
  };
  return {
    name,
    totalCount: 12,
    hasMore: true,
    unpublished: null,
    route: null,
    versions: [
      { ...tip, authorName: "Ada Lovelace", authorEmail: "ada@example.com" },
      {
        commit: "ccc333",
        shortCommit: "ccc333a",
        subject: "an earlier step",
        authorName: "Ada Lovelace",
        authorEmail: "ada@example.com",
        committedAt: "2026-07-01T00:00:00Z",
      },
    ],
    ...overrides,
  };
}

/** The list column's rows, in the order they are shown, by full name. */
const listedNames = (): (string | null)[] =>
  [...document.querySelectorAll(".branch-row__name")].map((name) => name.getAttribute("title"));

/** The detail column for the branch currently selected. */
const detailPanel = (name: string): HTMLElement => screen.getByRole("region", { name: `Details for “${name}”` });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // Folds are kept per project across launches; each test starts unfolded.
  localStorage.clear();
});

describe("BranchesPanel", () => {
  it("keeps manual refresh and Settings available when automatic updates are off", async () => {
    const onOpenSettings = vi.fn();
    const { onRefresh } = renderPanel({ watcherState: "off", onOpenSettings, isLoading: false });

    const notice = screen.getByText("This screen may be out of date.").closest(".automatic-updates-notice");
    expect(notice).not.toBeNull();
    await userEvent.click(within(notice as HTMLElement).getByRole("button", { name: "Refresh branches" }));
    expect(onRefresh).toHaveBeenCalledOnce();

    await userEvent.click(within(notice as HTMLElement).getByRole("button", { name: "Turn on automatic updates" }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("keeps the automatic-updates notice mounted while branches refresh", () => {
    renderPanel({ watcherState: "unavailable", isLoading: true });

    expect(screen.getByText("Automatic updates aren't available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loading branches…" })).toBeDisabled();
  });

  it("opens on the master-detail pair, with the active branch listed first and selected", async () => {
    renderPanel();

    // The list column: every branch as one row, the active one at the head.
    expect(listedNames()).toEqual(["main", "feature/new-thing"]);
    const activeRow = screen.getByRole("treeitem", { name: "main — Active" });
    expect(activeRow).toHaveAttribute("aria-selected", "true");

    // The detail column describes it without anything being clicked.
    const detail = detailPanel("main");
    expect(within(detail).getByRole("heading", { level: 2 })).toHaveTextContent("main");
    expect(within(detail).getByText("Saved versions")).toBeInTheDocument();
    expect(within(detail).getByText("first version")).toBeInTheDocument();

    // Reading is the caller's job, so the screen never spawns Git work just by
    // being shown.
    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("moves the detail column to whichever branch is selected", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));

    const detail = detailPanel("feature/new-thing");
    expect(within(detail).getByText("in progress")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "feature/new-thing" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("treeitem", { name: "main — Active" })).toHaveAttribute("aria-selected", "false");
    // Switch belongs to the chosen branch, and only to a branch that is not the
    // active one.
    expect(within(detail).getByRole("button", { name: "Switch to “feature/new-thing”" })).toBeEnabled();
    expect(within(detail).queryByRole("button", { name: "New version from this branch" })).not.toBeInTheDocument();
  });

  it("flags a row's states as glyphs, each explained on its tooltip and read out as the row's description", () => {
    renderPanel();

    const row = screen.getByRole("treeitem", { name: "feature/new-thing" });
    // Whether it can be deleted is its block's to say, not a glyph's.
    expect(row).toHaveAccessibleDescription("Local only");
    expect(row.querySelector(".state-glyph")).toHaveAttribute(
      "data-tooltip",
      "Local only — never published, so it's only on this computer",
    );
    // Active is a glyph on the row — the word is the detail strip's, and the
    // row's accessible name still says it.
    const active = screen.getByRole("treeitem", { name: "main — Active" });
    expect(within(active).queryByText("Active")).not.toBeInTheDocument();
    expect(active.querySelector(".state-glyph--accent")).toHaveAttribute(
      "data-tooltip",
      "Active — the branch you're working on",
    );
    expect(within(detailPanel("main")).getByText("Active")).toBeInTheDocument();
  });

  it("walks the list with the arrow keys, through its headings", async () => {
    const user = userEvent.setup();
    renderPanel();
    const heading = screen.getByRole("treeitem", { name: "Ready to clean up, 1 branch" });

    screen.getByRole("treeitem", { name: "main — Active" }).focus();
    await user.keyboard("{ArrowDown}");
    // A heading takes the keyboard without taking the selection.
    await waitFor(() => expect(heading).toHaveFocus());
    expect(detailPanel("main")).toBeInTheDocument();

    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("treeitem", { name: "feature/new-thing" })).toHaveFocus());
    expect(detailPanel("feature/new-thing")).toBeInTheDocument();

    // Left steps out to the heading, then folds it; Right opens it again.
    await user.keyboard("{ArrowLeft}");
    await waitFor(() => expect(heading).toHaveFocus());
    await user.keyboard("{ArrowLeft}");
    expect(heading).toHaveAttribute("aria-expanded", "false");
    expect(listedNames()).toEqual(["main"]);
    // The selection is folded away, so Tab lands on the heading above it.
    expect(heading).toHaveAttribute("tabindex", "0");
    expect(detailPanel("feature/new-thing")).toBeInTheDocument();
    await user.keyboard("{ArrowRight}");
    expect(heading).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the cached list, not a spinner, while a refresh runs behind it", () => {
    renderPanel({ isLoading: true });

    // The list is the previous answer and the strip says it is being replaced,
    // rather than the whole screen collapsing into a loading state.
    expect(listedNames()).toContain("feature/new-thing");
    expect(document.querySelector(".branches-list-panel__progress")).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 1, name: "Branches" })).toBeInTheDocument();
  });

  it("loads with a spinner only when the project has no cached snapshot", () => {
    renderPanel({ snapshot: null, isLoading: true });

    expect(screen.getAllByText("Loading branches…").length).toBeGreaterThan(0);
  });

  it("keeps a stale list visible and offers a contextual retry when a refresh fails", async () => {
    const { onRefresh } = renderPanel({ error: "Git couldn't read the branches." });

    expect(listedNames()).toContain("feature/new-thing");
    expect(
      screen.getByText("The latest check failed, so this is the last known result."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  describe("grouping", () => {
    const base = snapshot().branches[1]!;
    const entry = (name: string, committedAt: string, overrides: Partial<typeof base> = {}): typeof base => ({
      ...base,
      name,
      tip: { ...base.tip, commit: `${name}-tip`, committedAt },
      isRetainedElsewhere: false,
      isFinished: false,
      ...overrides,
    });
    const grouped = (): BranchesSnapshot =>
      snapshot({
        branches: [
          snapshot().branches[0]!,
          entry("feature/a", "2026-07-05T00:00:00Z"),
          entry("fix/x", "2026-07-04T00:00:00Z"),
          entry("feature/b", "2026-07-03T00:00:00Z"),
          entry("chore/old", "2026-07-02T00:00:00Z", { isRetainedElsewhere: true, isFinished: true }),
          entry("chore/older", "2026-07-01T00:00:00Z", { isRetainedElsewhere: true, isFinished: true }),
        ],
        totalCount: 6,
      });

    it("files the branches under In progress and a folded Ready to clean up, clustered by prefix", () => {
      renderPanel({ snapshot: grouped() }, { openCleanUp: false });

      expect(screen.getByRole("treeitem", { name: "In progress, 3 branches" })).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("treeitem", { name: "feature, 2 branches" })).toHaveAttribute("aria-level", "2");
      // A prefix only one branch has is not worth a heading: it stays loose,
      // first, with the prefix quiet.
      expect(listedNames()).toEqual(["main", "fix/x", "feature/a", "feature/b"]);
      const clustered = screen.getByRole("treeitem", { name: "feature/a" });
      expect(clustered).toHaveAttribute("aria-level", "3");
      expect(clustered.querySelector(".branch-row__name")).toHaveTextContent(/^a$/);
      expect(screen.getByRole("treeitem", { name: "fix/x" }).querySelector(".branch-row__name-quiet")).toHaveTextContent(
        "fix/",
      );

      const cleanUp = screen.getByRole("treeitem", { name: "Ready to clean up, 2 branches" });
      expect(cleanUp).toHaveAttribute("aria-expanded", "false");
      expect(cleanUp).toHaveAccessibleDescription("Safe to delete");
    });

    it("opens the clean-up block from its heading", async () => {
      const user = userEvent.setup();
      renderPanel({ snapshot: grouped() }, { openCleanUp: false });

      const cleanUp = screen.getByRole("treeitem", { name: "Ready to clean up, 2 branches" });
      await user.click(cleanUp);

      expect(listedNames()).toEqual(["main", "fix/x", "feature/a", "feature/b", "chore/old", "chore/older"]);
      expect(cleanUp).not.toHaveAccessibleDescription();
    });

    it("cleans up the block from its own button, while the heading still only folds", async () => {
      const user = userEvent.setup();
      mockedInvoke.mockImplementation(async (command: string) => {
        if (command === "plan_clean_up_branches") {
          return {
            operationKind: "destructive",
            summary: "Delete",
            steps: [],
            risks: [],
            recovery: "",
            requiresConfirmation: true,
            branches: [
              {
                name: "chore/old",
                tipCommit: "c1",
                retainedBy: ["refs/heads/main"],
                published: null,
                            stateToken: "t1",
              },
            ],
            excluded: [],
            recoveryPoint: { reference: "r", explanation: "", retention: "", retentionLimit: 50 },
          };
        }
        return undefined;
      });
      const onOperationStart = vi.fn(() => true);
      renderPanel({ snapshot: grouped(), onOperationStart }, { openCleanUp: false });

      const cleanUp = screen.getByRole("treeitem", { name: "Ready to clean up, 2 branches" });
      await user.click(cleanUp);
      expect(cleanUp).toHaveAttribute("aria-expanded", "true");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /^Clean up 2 branches…/ }));
      expect(await screen.findByRole("dialog", { name: "Delete these branches?" })).toBeInTheDocument();
      expect(onOperationStart).toHaveBeenCalledTimes(1);
      expect(cleanUp).toHaveAttribute("aria-expanded", "true");
      expect(mockedInvoke).toHaveBeenCalledWith("plan_clean_up_branches", {
        path: "/repo",
        sessionEpoch: "epoch-1",
        names: ["chore/old", "chore/older"],
      });
    });

    it("opens the clean-up review with Delete on its heading, when the slot is free", async () => {
      const onOperationStart = vi.fn(() => false);
      renderPanel({ snapshot: grouped(), onOperationStart }, { openCleanUp: false });

      const cleanUp = screen.getByRole("treeitem", { name: "Ready to clean up, 2 branches" });
      expect(cleanUp).toHaveAttribute("aria-keyshortcuts", "Delete");
      fireEvent.keyDown(cleanUp, { key: "Delete" });
      expect(onOperationStart).toHaveBeenCalledTimes(1);
      // Another session holds the project's mutation slot: nothing opens.
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("treeitem", { name: "In progress, 3 branches" })).not.toHaveAttribute("aria-keyshortcuts");
    });

    it("opens everything while searching, and puts the folds back after", async () => {
      const user = userEvent.setup();
      renderPanel({ snapshot: grouped() }, { openCleanUp: false });
      await user.click(screen.getByRole("treeitem", { name: "feature, 2 branches" }));
      expect(listedNames()).toEqual(["main", "fix/x"]);

      const search = screen.getByPlaceholderText("Search branches…");
      await user.type(search, "o");
      expect(listedNames()).toEqual(["main", "chore/old", "chore/older"]);

      await user.clear(search);
      expect(listedNames()).toEqual(["main", "fix/x"]);
    });

    it("remembers the reader's folds for the project", async () => {
      const user = userEvent.setup();
      const first = renderPanel({ snapshot: grouped() }, { openCleanUp: false });
      await user.click(screen.getByRole("treeitem", { name: "Ready to clean up, 2 branches" }));
      await user.click(screen.getByRole("treeitem", { name: "feature, 2 branches" }));
      first.unmount();

      renderPanel({ snapshot: grouped() }, { openCleanUp: false });
      expect(listedNames()).toEqual(["main", "fix/x", "chore/old", "chore/older"]);
    });

    it("unfolds the branch another screen asks for", () => {
      renderPanel({ snapshot: grouped(), selectBranchIntent: "chore/old" }, { openCleanUp: false });

      expect(screen.getByRole("treeitem", { name: "chore/old" })).toHaveAttribute("aria-selected", "true");
    });

    it("leaves whether a branch can be deleted to the blocks, not the filters", async () => {
      const user = userEvent.setup();
      renderPanel({ snapshot: grouped() });

      await user.click(screen.getByRole("button", { name: "Filter and sort" }));
      expect(screen.getByRole("checkbox", { name: /^Local only/ })).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /^Safe to delete/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /^Can't be deleted yet/ })).not.toBeInTheDocument();
    });
  });

  it("filters the list by search text without hiding the active branch", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixBranch() });

    await user.type(screen.getByPlaceholderText("Search branches…"), "bugfix");

    // The active branch is where the project *is*: a search that hides it leaves
    // the reader without the row that answers "where am I".
    expect(listedNames()).toEqual(["main", "bugfix/other"]);
  });

  it("filters by a name prefix derived from the actual branch names", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixBranch() });

    await user.click(screen.getByRole("button", { name: "Filter and sort" }));
    await user.click(screen.getByRole("checkbox", { name: /^bugfix/ }));

    expect(listedNames()).toEqual(["main", "bugfix/other"]);
    // The trigger reports how much narrowing is in effect, so a filtered list
    // is never a mystery.
    expect(screen.getByRole("button", { name: "Filter and sort (1 filter on)" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(listedNames()).toContain("feature/new-thing");
  });

  it("combines a state filter with a prefix filter instead of replacing it", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixBranch() });

    await user.click(screen.getByRole("button", { name: "Filter and sort" }));
    await user.click(screen.getByRole("checkbox", { name: /^bugfix/ }));
    await user.click(screen.getByRole("checkbox", { name: /Local only/ }));

    // Both branches are local-only, so the prefix is what still narrows the list:
    // the two groups AND together rather than one overriding the other.
    expect(listedNames()).toEqual(["main", "bugfix/other"]);
    expect(screen.getByRole("button", { name: "Filter and sort (2 filters on)" })).toBeInTheDocument();
  });

  it("offers a remote-tracking state filter beside the local-only one", async () => {
    const user = userEvent.setup();
    renderPanel({
      snapshot: snapshot({
        branches: [
          snapshot().branches[0],
          snapshot().branches[1],
          {
            name: "release/1.0",
            tip: { commit: "rel111", shortCommit: "rel111a", subject: "cut", committedAt: "2026-07-05T00:00:00Z" },
            isActive: false,
            upstream: "origin/release/1.0",
            isRetainedElsewhere: true,
            isFinished: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: 0,
            upstreamBehind: 0,
            upstreamGone: false,
            isDefault: false,
          },
        ],
        totalCount: 3,
      }),
    });

    await user.click(screen.getByRole("button", { name: "Filter and sort" }));
    await user.click(screen.getByRole("checkbox", { name: /Tracking a remote/ }));

    expect(listedNames()).toEqual(["main", "release/1.0"]);
  });

  it("sorts the list from the same control as the filters", async () => {
    const user = userEvent.setup();
    renderPanel({
      snapshot: snapshot({
        branches: [
          snapshot().branches[0],
          {
            name: "zeta/newest",
            tip: { commit: "zzz111", shortCommit: "zzz111a", subject: "newest", committedAt: "2026-07-20T00:00:00Z" },
            isActive: false,
            upstream: "origin/zeta/newest",
            isRetainedElsewhere: true,
            isFinished: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: 2,
            upstreamBehind: null,
            upstreamGone: false,
            isDefault: false,
          },
          {
            name: "alpha/oldest",
            tip: { commit: "aaa111", shortCommit: "aaa111a", subject: "oldest", committedAt: "2026-07-01T00:00:00Z" },
            isActive: false,
            upstream: null,
            isRetainedElsewhere: true,
            isFinished: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: null,
            upstreamBehind: null,
            upstreamGone: false,
            isDefault: false,
          },
        ],
        totalCount: 3,
      }),
    });

    expect(listedNames()).toEqual(["main", "zeta/newest", "alpha/oldest"]);

    await user.click(screen.getByRole("button", { name: "Filter and sort" }));
    await user.click(screen.getByRole("radio", { name: "Name" }));
    expect(listedNames()).toEqual(["main", "alpha/oldest", "zeta/newest"]);

    // "Local first" is deliberately narrower than "not pushed": the
    // tracked zeta branch is ahead, but the no-upstream alpha branch comes first.
    await user.click(screen.getByRole("radio", { name: "Local first" }));
    expect(listedNames()).toEqual(["main", "alpha/oldest", "zeta/newest"]);
  });

  it("closes the filter panel on Escape and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    renderPanel({ snapshot: withBugfixBranch() });

    const trigger = screen.getByRole("button", { name: "Filter and sort" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Filter and sort" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Filter and sort" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("shows a recovery banner on detached HEAD", async () => {
    renderPanel({
      snapshot: snapshot({ branch: null, headState: "detached", branches: [snapshot().branches[1]], totalCount: 1 }),
    });

    const title = await screen.findByText("Not on a branch");
    // One branch: the title, the explanation on its tooltip, the way out last.
    const body = title.parentElement as HTMLElement;
    const explanation = title.nextElementSibling as HTMLElement;
    expect(body).toHaveClass("branches-banner__body");
    expect(explanation).toHaveAttribute("title", explanation.textContent);
    expect(body.nextElementSibling).toHaveTextContent("Create a branch here");
  });

  it("disables Switch and Delete for a branch checked out in another worktree", async () => {
    const user = userEvent.setup();
    renderPanel({
      snapshot: snapshot({
        branches: [snapshot().branches[0], { ...snapshot().branches[1], worktreePath: "/other/workspace" }],
      }),
    });

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    const detail = detailPanel("feature/new-thing");
    expect(within(detail).getByText(/Open in another workspace \(\/other\/workspace\)/)).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "Switch to “feature/new-thing”" })).toBeDisabled();
    expect(
      within(detail).getByRole("button", { name: /“feature\/new-thing” is open in another workspace/ }),
    ).toBeDisabled();
    // Renaming a branch another workspace has checked out would rewrite the ref
    // under that window, so it isn't offered at all.
    expect(within(detail).queryByRole("button", { name: /^Rename/ })).not.toBeInTheDocument();
  });

  it("surfaces a retry action when discovery fails with nothing cached", async () => {
    const { onRefresh } = renderPanel({
      snapshot: null,
      error: "Couldn't load this project's branches.",
    });

    await userEvent.click(await screen.findByText("Try again"));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("has no button into the create dialog; the composer under the list starts a branch", () => {
    renderPanel();

    expect(screen.queryByRole("button", { name: "New branch" })).not.toBeInTheDocument();
    // Nor a second route from the active branch's own actions.
    expect(
      within(detailPanel("main")).queryByRole("button", { name: /new version from this branch/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("New branch name")).toBeInTheDocument();
  });

  it("opens the create dialog when the palette asks for it and creates a branch", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    const onOperationFinish = vi.fn();
    const onOperationPhaseChange = vi.fn();
    const { onChanged, onSnapshot } = renderPanel({
      onOperationStart,
      onOperationFinish,
      onOperationPhaseChange,
      autoOpenCreate: true,
    });

    expect(await screen.findByRole("dialog")).toHaveTextContent("New branch");
    expect(onOperationStart).toHaveBeenCalledOnce();
    await user.type(screen.getByLabelText("Name"), "feature/z");

    mockedInvoke.mockResolvedValueOnce({
      operationKind: "local-mutation",
      summary: "Create without switching",
      steps: [],
      risks: [],
      recovery: "",
      requiresConfirmation: false,
      stateToken: "create-token",
      name: "feature/z",
      headState: "branch",
      startingCommit: "abc123",
      willSwitch: false,
      hasUnsavedWork: false,
    });
    mockedInvoke.mockResolvedValueOnce(snapshot());

    await user.click(screen.getByRole("button", { name: "Create branch" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // The snapshot the command already returned goes straight back to the
    // session cache, so the list is current without a second read.
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({ branch: "main" }));
    expect(onOperationPhaseChange).toHaveBeenCalledWith("planning");
    expect(onOperationPhaseChange).toHaveBeenCalledWith("executing");
    expect(onOperationPhaseChange).toHaveBeenCalledWith("success");
    expect(onOperationFinish).toHaveBeenCalledOnce();
  });

  it("opens the switch dialog from the selected branch's Switch action", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    renderPanel({ onOperationStart });

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    mockedInvoke.mockResolvedValueOnce({
      operationKind: "local-mutation",
      summary: "Switch",
      steps: [],
      risks: [],
      recovery: "",
      requiresConfirmation: false,
      stateToken: "switch-token",
      from: "main",
      to: "feature/new-thing",
      fromCommit: "abc123",
      toCommit: "def456",
      changedFiles: [],
      changedFilesTotal: 0,
    });

    await user.click(screen.getByRole("button", { name: "Switch to “feature/new-thing”" }));

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(await screen.findByRole("dialog")).toHaveTextContent("You'll move to “feature/new-thing”.");
  });

  it("keeps Switch, Rename and Delete together on the selected branch, and out of every row", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    renderPanel({ onOperationStart });

    // No row carries an action: the list is for choosing, not for acting on
    // every branch at once.
    expect(screen.queryByRole("button", { name: /Delete “feature\/new-thing”/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rename “feature\/new-thing”/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    const detail = detailPanel("feature/new-thing");
    expect(within(detail).getByRole("button", { name: "Switch to “feature/new-thing”" })).toBeEnabled();
    expect(within(detail).getByRole("button", { name: "Rename “feature/new-thing”" })).toBeEnabled();

    mockedInvoke.mockResolvedValueOnce({
      operationKind: "destructive",
      summary: "Delete",
      steps: [],
      risks: [],
      recovery: "Reachable from: refs/heads/main",
      requiresConfirmation: true,
      stateToken: "delete-token",
      name: "feature/new-thing",
      tipCommit: "def456",
      retainedBy: ["refs/heads/main"],
      upstream: null,
      published: null,
    });
    await user.click(within(detail).getByRole("button", { name: /Delete “feature\/new-thing”/ }));

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(await screen.findByRole("dialog")).toHaveTextContent("Delete this branch?“feature/new-thing”");
  });

  it("renames a branch in the detail strip, without a dialog", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    const onOperationFinish = vi.fn();
    const { onSnapshot } = renderPanel({ onOperationStart, onOperationFinish });

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    await user.click(screen.getByRole("button", { name: "Rename “feature/new-thing”" }));
    // Opening the field takes no lock: nothing is asked of Git until the press.
    expect(onOperationStart).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const detail = detailPanel("feature/new-thing");
    const field = within(detail).getByRole("textbox", { name: "Rename “feature/new-thing”" });
    expect(field).toHaveValue("feature/new-thing");
    expect(field).toHaveFocus();
    // What a rename usually changes is the part after the last "/".
    expect([(field as HTMLInputElement).selectionStart, (field as HTMLInputElement).selectionEnd]).toEqual([8, 17]);
    // Cancel and Rename are the strip's two circles, nothing filled.
    expect(within(detail).getByRole("button", { name: "Cancel" })).toHaveClass("branches-detail__icon-action");
    // One line, as at rest: the note stands after the name, where the avatar
    // and the time were, not under it.
    const note = within(detail).getByText("Only the name changes").closest(".branches-rename__note");
    const strip = detail.querySelector(".branches-detail__strip--editing");
    expect(note?.parentElement?.parentElement).toBe(strip);
    expect(strip?.querySelector(".branches-detail__identity .branches-rename__note")).toBeNull();
    expect(note).toHaveAttribute("data-tooltip", expect.stringContaining("Only the name changes"));
    // Unchanged, there is nothing to rename.
    expect(within(detail).getByRole("button", { name: "Rename" })).toBeDisabled();

    await user.clear(field);
    await user.type(field, "feature/renamed");
    const renamed = snapshot({
      branches: [snapshot().branches[0], { ...snapshot().branches[1], name: "feature/renamed" }],
    });
    mockedInvoke.mockResolvedValueOnce({
      operationKind: "local-mutation",
      summary: "Rename",
      steps: [],
      risks: [],
      recovery: "",
      requiresConfirmation: false,
      stateToken: "rename-token",
      name: "feature/new-thing",
      newName: "feature/renamed",
      isActive: false,
      upstream: null,
    });
    mockedInvoke.mockResolvedValueOnce(renamed);
    await user.keyboard("{Enter}");

    await waitFor(() => expect(onSnapshot).toHaveBeenCalledWith(renamed));
    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(onOperationFinish).toHaveBeenCalledOnce();
    expect(mockedInvoke).toHaveBeenCalledWith("rename_branch", {
      path: "/repo",
      sessionEpoch: "epoch-1",
      name: "feature/new-thing",
      newName: "feature/renamed",
      stateToken: "rename-token",
    });
  });

  it("says what Git would refuse in a new name before the press, and Escape puts the name back", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    renderPanel({ onOperationStart });

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    await user.keyboard("{F2}");
    const detail = detailPanel("feature/new-thing");
    const field = within(detail).getByRole("textbox", { name: "Rename “feature/new-thing”" });
    expect(field).toHaveFocus();

    // Taking the active branch's name is a clash said as it is typed.
    await user.clear(field);
    await user.type(field, "main");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(within(detail).getByRole("button", { name: "Rename" })).toBeDisabled();

    // Escape gives the name back with the fade the edit came in with.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(within(detail).queryByRole("textbox")).not.toBeInTheDocument());
    expect(within(detail).getByRole("heading", { level: 2 })).toHaveTextContent("feature/new-thing");
    expect(onOperationStart).not.toHaveBeenCalled();
  });

  it("never offers to rename or delete the project's main branch", async () => {
    const user = userEvent.setup();
    renderPanel({
      snapshot: snapshot({
        branches: [
          snapshot().branches[0],
          { ...snapshot().branches[1], name: "trunk", isDefault: true, isRetainedElsewhere: true },
        ],
      }),
    });

    // The list says why, instead of promising a cleanup it would refuse.
    const row = screen.getByRole("treeitem", { name: "trunk" });
    expect(row).toHaveAccessibleDescription("Main branch, Local only");

    await user.click(row);
    const detail = detailPanel("trunk");
    expect(within(detail).getByRole("button", { name: "Switch to “trunk”" })).toBeEnabled();
    expect(within(detail).queryByRole("button", { name: /^Rename/ })).not.toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(
      within(detail).getByText(
        "Shared work lives here, so GitOdile doesn't rename or delete it.",
      ),
    ).toBeInTheDocument();
  });

  it("says the list is incomplete when a name cannot be represented", () => {
    renderPanel({ snapshot: snapshot({ unreadableCount: 2 }) });

    // The names themselves are never invented: the count is all the screen can
    // honestly show, and the other branches stay usable.
    expect(
      screen.getByText(/2 branches are hidden because their names can't be read/),
    ).toBeInTheDocument();
    expect(listedNames()).toContain("feature/new-thing");
  });

  it("says which branches can be deleted by the block they are in, not by a glyph", async () => {
    renderPanel({
      snapshot: snapshot({
        branches: [
          snapshot().branches[0],
          snapshot().branches[1],
          {
            name: "feature/unmerged",
            tip: { commit: "jkl012", shortCommit: "jkl012a", subject: "wip", committedAt: "2026-07-04T00:00:00Z" },
            isActive: false,
            upstream: null,
            isRetainedElsewhere: false,
            isFinished: false,
            uniqueCommitCount: 3,
            worktreePath: null,
            upstreamAhead: null,
            upstreamBehind: null,
            upstreamGone: false,
            isDefault: false,
          },
        ],
        totalCount: 3,
      }),
    });

    const deletable = screen.getByRole("treeitem", { name: "feature/new-thing" });
    const unmerged = screen.getByRole("treeitem", { name: "feature/unmerged" });
    expect(deletable).toHaveAccessibleDescription("Local only");
    expect(unmerged).toHaveAccessibleDescription("Local only");
    // In progress comes first, then Ready to clean up.
    const inProgress = screen.getByRole("treeitem", { name: "In progress, 1 branch" });
    const cleanUp = screen.getByRole("treeitem", { name: "Ready to clean up, 1 branch" });
    expect(inProgress.compareDocumentPosition(unmerged) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(unmerged.compareDocumentPosition(cleanUp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cleanUp.compareDocumentPosition(deletable) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("flags drift from the upstream in the row, and explains it in the detail", async () => {
    const user = userEvent.setup();
    renderPanel({
      snapshot: snapshot({
        branches: [
          snapshot().branches[0],
          {
            name: "feature/ahead",
            tip: { commit: "aaa111", shortCommit: "aaa111a", subject: "wip", committedAt: "2026-07-04T00:00:00Z" },
            isActive: false,
            upstream: "origin/feature/ahead",
            isRetainedElsewhere: true,
            isFinished: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: 2,
            upstreamBehind: 0,
            upstreamGone: false,
            isDefault: false,
          },
          {
            name: "feature/diverged",
            tip: { commit: "bbb222", shortCommit: "bbb222a", subject: "wip", committedAt: "2026-07-04T00:00:00Z" },
            isActive: false,
            upstream: "origin/feature/diverged",
            isRetainedElsewhere: true,
            isFinished: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: 1,
            upstreamBehind: 3,
            upstreamGone: false,
            isDefault: false,
          },
          {
            name: "feature/gone",
            tip: { commit: "ccc333", shortCommit: "ccc333a", subject: "wip", committedAt: "2026-07-04T00:00:00Z" },
            isActive: false,
            upstream: "origin/feature/gone",
            isRetainedElsewhere: true,
            isFinished: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: 0,
            upstreamBehind: 0,
            upstreamGone: true,
            isDefault: false,
          },
          {
            name: "feature/synced",
            tip: { commit: "ddd444", shortCommit: "ddd444a", subject: "wip", committedAt: "2026-07-04T00:00:00Z" },
            isActive: false,
            upstream: "origin/feature/synced",
            isRetainedElsewhere: true,
            isFinished: true,
            uniqueCommitCount: 0,
            worktreePath: null,
            upstreamAhead: 0,
            upstreamBehind: 0,
            upstreamGone: false,
            isDefault: false,
          },
        ],
        totalCount: 5,
      }),
    });

    const rowFor = (name: string) => screen.getByRole("treeitem", { name });
    expect(rowFor("feature/ahead")).toHaveAccessibleDescription(expect.stringContaining("2 not published"));
    // Two arrows on the row, one sentence for a screen reader.
    expect(rowFor("feature/diverged")).toHaveAccessibleDescription(
      expect.stringContaining("1 not published, 3 to get"),
    );
    expect(rowFor("feature/diverged").textContent).toContain("1");
    expect(rowFor("feature/gone")).toHaveAccessibleDescription(expect.stringContaining("Remote branch deleted"));
    // A branch that's fully pushed and pulled gets no drift chip — the detail
    // says it's published.
    expect(within(rowFor("feature/synced")).queryByText("Up to date with the remote")).not.toBeInTheDocument();

    // The detail spells the same fact out in full, for every branch, including
    // the unremarkable "synced" case.
    await user.click(rowFor("feature/synced"));
    const detail = detailPanel("feature/synced");
    expect(within(detail).getAllByText("Up to date with the remote").length).toBeGreaterThan(0);
    expect(
      within(detail).getByText("In sync with origin/feature/synced."),
    ).toBeInTheDocument();
    // The upstream is named once, in that sentence — not again in the strip
    // over it.
    expect(within(detail).getAllByText(/origin\/feature\/synced/)).toHaveLength(1);
    // Its tip wears the published node rather than a chip saying so.
    expect(detail.querySelector(".branches-recent__row--published")).not.toBeNull();
  });

  it("says a local-only branch has never been published, and never calls its tip published", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));

    const detail = detailPanel("feature/new-thing");
    // With no remote copy to count against, the tip's node is the empty ring:
    // never the published disc.
    expect(detail.querySelector(".branches-recent__row--unknown")).not.toBeNull();
    expect(detail.querySelector(".branches-recent__row--published")).toBeNull();
    expect(
      within(detail).getAllByText("Never published, so it's only on this computer.").length,
    ).toBeGreaterThan(0);
    // No main branch in this project, so no count: "not on the active branch"
    // would be a different question asked in the same words.
    expect(within(detail).queryByText(/versions? not on/)).not.toBeInTheDocument();
  });

  it("counts a branch's own versions against the main branch, the active one included", async () => {
    const user = userEvent.setup();
    const [main, feature] = snapshot().branches;
    renderPanel({
      snapshot: snapshot({
        branch: "feature/new-thing",
        branches: [
          { ...main, isActive: false, isDefault: true },
          { ...feature, isActive: true },
        ],
      }),
    });

    const active = detailPanel("feature/new-thing");
    expect(within(active).getByText("The branch you're working on")).toBeInTheDocument();
    expect(within(active).getByText("2 versions not on main")).toBeInTheDocument();

    // The main branch is what the others are counted against.
    await user.click(screen.getByRole("treeitem", { name: "main" }));
    expect(within(detailPanel("main")).queryByText(/versions? not on/)).not.toBeInTheDocument();
  });

  it("offers a way through to History, scoped to the branch being looked at", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderPanel({ onOpenHistory });

    expect(within(detailPanel("main")).getByRole("button", { name: "Open in History" })).toHaveAttribute(
      "title",
      "See every version, compare changes and go back to earlier states.",
    );

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    const detail = detailPanel("feature/new-thing");
    const open = within(detail).getByRole("button", { name: "Open in History" });
    expect(open).toHaveAttribute(
      "title",
      "Shows “feature/new-thing” in History without switching to it.",
    );

    // The branch being looked at, not the branch that happens to be active.
    await user.click(open);
    expect(onOpenHistory).toHaveBeenCalledWith("feature/new-thing");
  });

  it("draws the user's own tip as \"You\" on the strip's avatar", async () => {
    renderPanel({ readHistory: async (name: string) => history(name), selfEmail: " ADA@example.com " });
    const detail = detailPanel("main");
    await within(detail).findByText("Saved versions");
    const avatar = detail.querySelector(".branches-detail__strip .author-avatar");
    expect(avatar).toHaveClass("author-avatar--self");
    expect(avatar).toHaveTextContent("AL");
    expect(avatar).toHaveAttribute("data-tooltip", "You (Ada Lovelace)");
  });

  it("reads the selected branch's saved versions and shows them beside its author and count", async () => {
    const user = userEvent.setup();
    const readHistory = vi.fn(async (name: string) => history(name));
    renderPanel({ readHistory });

    // Asked for the branch that is selected on arrival, and for that one only.
    await waitFor(() => expect(readHistory).toHaveBeenCalledWith("main", "abc123"));
    expect(readHistory).toHaveBeenCalledOnce();

    const detail = detailPanel("main");
    await within(detail).findByText("Saved versions");
    // The tip from the inventory, then the versions behind it from the read.
    expect(within(detail).getByText("first version")).toBeInTheDocument();
    expect(within(detail).getByText("an earlier step")).toBeInTheDocument();
    // The tip's author comes from the same read — the inventory has no author
    // field, so without this call the strip states the date and no avatar.
    // One line: the avatar carries the name on its tooltip, and the strip
    // wears no `Active` capsule and no `Latest saved` label.
    const strip = detail.querySelector(".branches-detail__strip");
    expect(strip?.querySelector(".author-avatar")).toHaveAttribute("data-tooltip", "Ada Lovelace");
    expect(strip?.querySelector(".author-avatar")).toHaveTextContent("AL");
    expect(within(strip as HTMLElement).getByText("Latest saved: Ada Lovelace")).toHaveClass("visually-hidden");
    expect(strip?.querySelector(".state-glyph--accent")).not.toBeNull();

    // Selecting another branch asks for that branch's history, keyed by its tip.
    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    await waitFor(() => expect(readHistory).toHaveBeenCalledWith("feature/new-thing", "def456"));
  });

  it("draws where a branch left the main branch, and says the numbers in words", async () => {
    const user = userEvent.setup();
    renderPanel({
      readHistory: async (name: string) =>
        history(
          name,
          name === "feature/new-thing"
            ? {
                route: {
                  base: "main",
                  forkCommit: "abc123",
                  forkedAt: "2026-07-01T00:00:00Z",
                  ownCount: 2,
                  ownVersions: [
                    { ...routeVersion("in progress", "def456"), committedAt: "2026-07-02T00:00:00Z" },
                    routeVersion("started", "ddd000"),
                  ],
                  baseCount: 3,
                  baseVersions: [],
                  merge: null,
                  changes: null,
                },
              }
            : {},
        ),
    });

    // The main branch has no route: it is what the others are measured against.
    await within(detailPanel("main")).findByText("first version");
    expect(within(detailPanel("main")).queryByRole("region", { name: "Route" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    const route = await within(detailPanel("feature/new-thing")).findByRole("region", { name: "Route" });
    // Never published, so both of its own versions are still on this machine.
    expect(
      within(route).getByText(/^Left main on .+\. 2 versions of its own\. main has 3 new versions since\.$/),
    ).toBeInTheDocument();
  });

  it("says when a branch's work came back squashed, and that the originals are only on it", async () => {
    const user = userEvent.setup();
    renderPanel({
      readHistory: async (name: string) =>
        history(
          name,
          name === "feature/new-thing"
            ? {
                route: {
                  base: "main",
                  forkCommit: "abc123",
                  forkedAt: "2026-07-01T00:00:00Z",
                  ownCount: 2,
                  ownVersions: [],
                  baseCount: 0,
                  baseVersions: [],
                  merge: { kind: "squash", commit: "sss111", mergedAt: "2026-07-05T00:00:00Z", afterCount: 0, afterVersions: [] },
                  changes: null,
                },
              }
            : {},
        ),
    });

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    const route = await within(detailPanel("feature/new-thing")).findByRole("region", { name: "Route" });
    expect(
      within(route).getByText(
        /^Left main on .+\. Its work came back on .+ as one combined version; the 2 originals are only on this branch\. main hasn't moved since\.$/,
      ),
    ).toBeInTheDocument();
    expect(route.querySelector(".branches-route__mark--copy")).not.toBeNull();
  });

  const routeFromMain = {
    base: "main",
    forkCommit: "abc123",
    forkedAt: "2026-07-01T00:00:00Z",
    ownCount: 2,
    ownVersions: [],
    baseCount: 0,
    baseVersions: [],
    merge: null,
    changes: {
      filesChanged: 3,
      additions: 42,
      deletions: 7,
    },
  };

  it("offers what another branch can do with the active one, naming both ends", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderPanel({
      onOpenHistory,
      readHistory: async (name: string) =>
        history(name, name === "feature/new-thing" ? { route: routeFromMain } : {}),
    });

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    const detail = detailPanel("feature/new-thing");
    const actions = await within(detail).findByRole("region", { name: "What you can do" });
    expect(within(actions).getByText("Merge into “main”")).toBeInTheDocument();
    expect(within(actions).getByText("Rebase “main” onto this")).toBeInTheDocument();
    expect(within(actions).getByText("Compare with “main”")).toBeInTheDocument();
    // No flow is behind them yet: stated, marked, and not controls.
    expect(within(actions).getAllByText("Soon")).toHaveLength(3);
    expect(within(actions).queryByRole("button")).not.toBeInTheDocument();
    // The comparison's file list is gone; the versions keep the height.
    expect(within(detail).queryByText("new.ts")).not.toBeInTheDocument();

    // The rest are the header's "Open in History" away; no count repeats it.
    expect(within(detail).queryByText(/more in History/)).not.toBeInTheDocument();
    await user.click(within(detail).getByRole("button", { name: "Open in History" }));
    expect(onOpenHistory).toHaveBeenCalledWith("feature/new-thing");
  });

  it("offers Publish beside what is waiting on the active branch only, and says when it was saved relatively", async () => {
    const user = userEvent.setup();
    const onPublish = vi.fn();
    const [main, feature] = snapshot().branches;
    renderPanel({
      onPublish,
      onOpenHistory: vi.fn(),
      snapshot: snapshot({
        branch: "feature/new-thing",
        branches: [
          { ...main, isActive: false, isDefault: true, upstream: "origin/main", upstreamAhead: 0, upstreamBehind: 0 },
          { ...feature, isActive: true, upstream: "origin/feature/new-thing", upstreamAhead: 1, upstreamBehind: 0 },
        ],
      }),
      readHistory: async (name: string) => history(name),
    });

    const detail = detailPanel("feature/new-thing");
    // Once, over the versions it sends: the remote fact leaves it to the head.
    await within(detail).findByText("On this computer");
    const publish = within(detail).getAllByRole("button", { name: "Publish" });
    expect(publish).toHaveLength(1);
    expect(publish[0].closest(".branches-recent__head")).not.toBeNull();
    await user.click(publish[0]);
    expect(onPublish).toHaveBeenCalledTimes(1);
    // When, as the list says it; the exact date is on the tooltip.
    expect(detail.querySelector(".branches-detail__byline span[title]")?.textContent).toMatch(/ago|yesterday|last|tomorrow/);

    // Another branch is published from that branch, not from here.
    await user.click(screen.getByRole("treeitem", { name: "main" }));
    expect(within(detailPanel("main")).queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
  });

  it("offers Publish in the remote fact when there is no head to carry it", async () => {
    const [main, feature] = snapshot().branches;
    renderPanel({
      onPublish: vi.fn(),
      onOpenHistory: vi.fn(),
      snapshot: snapshot({
        branch: "feature/new-thing",
        // Never published: which versions the remote has is not known, so no
        // "On this computer" head is drawn.
        branches: [{ ...main, isActive: false, isDefault: true }, { ...feature, isActive: true, upstream: null }],
      }),
      readHistory: async (name: string) => history(name),
    });

    const detail = detailPanel("feature/new-thing");
    const publish = await within(detail).findAllByRole("button", { name: "Publish" });
    expect(publish).toHaveLength(1);
    expect(publish[0].closest(".branches-relations")).not.toBeNull();
    expect(within(detail).queryByText("On this computer")).not.toBeInTheDocument();
  });

  it("heads the versions only here even when every listed one is, many versions ahead", async () => {
    const [main, feature] = snapshot().branches;
    renderPanel({
      onOpenHistory: vi.fn(),
      snapshot: snapshot({
        branches: [main, { ...feature, upstream: "origin/feature/new-thing", upstreamAhead: 16, upstreamBehind: 0 }],
      }),
      readHistory: async (name: string) =>
        history(name, { unpublished: [feature.tip.commit, "ccc333"] }),
    });

    await userEvent.setup().click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    const detail = detailPanel("feature/new-thing");
    // The remote's copy starts below what the list shows: the head, and no
    // "Published" mark.
    await within(detail).findByText("On this computer");
    expect(within(detail).queryByText("Published")).not.toBeInTheDocument();
    const rows = detail.querySelectorAll(".branches-recent__row");
    expect([...rows].every((row) => row.classList.contains("branches-recent__row--local-only"))).toBe(true);
  });

  it("takes where each version stands from Git's answer, not from its position", async () => {
    // Ahead by two, but the read says only the tip is missing from the remote:
    // a branch that merged another interleaves the two by date.
    const user = userEvent.setup();
    const [main, feature] = snapshot().branches;
    renderPanel({
      onOpenHistory: vi.fn(),
      snapshot: snapshot({
        branches: [main, { ...feature, upstream: "origin/feature/new-thing", upstreamAhead: 2, upstreamBehind: 0 }],
      }),
      readHistory: async (name: string) => history(name, { unpublished: [feature.tip.commit] }),
    });

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    const detail = detailPanel("feature/new-thing");
    await within(detail).findByText("On this computer");
    const rows = detail.querySelectorAll(".branches-recent__row");
    expect(rows[0]).toHaveClass("branches-recent__row--local-only");
    expect(rows[1]).toHaveClass("branches-recent__row--published");
  });

  it("counts what main saved since a branch that came back, the merge and after it", async () => {
    const [main, feature] = snapshot().branches;
    renderPanel({
      snapshot: snapshot({
        branch: "feature/new-thing",
        branches: [
          { ...main, isActive: false, isDefault: true },
          { ...feature, isActive: true },
        ],
      }),
      readHistory: async (name: string) =>
        history(name, {
          route: {
            ...routeFromMain,
            baseCount: 0,
            merge: {
              kind: "merge",
              commit: "merge1",
              mergedAt: "2026-07-03T00:00:00Z",
              afterCount: 2,
              afterVersions: [],
            },
          },
        }),
    });

    const actions = await within(detailPanel("feature/new-thing")).findByRole("region", { name: "What you can do" });
    expect(within(actions).getByText("main has 3 newer versions to bring in.")).toBeInTheDocument();
    expect(within(actions).queryByText("Up to date")).not.toBeInTheDocument();
  });

  it("does not take the keyboard back to a branch whose rename was cancelled after another was chosen", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    await user.keyboard("{F2}");
    await user.click(within(detailPanel("feature/new-thing")).getByRole("button", { name: "Cancel" }));
    // Another branch chosen while the cancel fades out.
    await user.click(screen.getByRole("treeitem", { name: /^main/ }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(screen.getByRole("treeitem", { name: "feature/new-thing" })).not.toHaveFocus();
  });

  it("offers the active branch what it can do with main, and says when there is nothing to bring in", async () => {
    const [main, feature] = snapshot().branches;
    renderPanel({
      snapshot: snapshot({
        branch: "feature/new-thing",
        branches: [
          { ...main, isActive: false, isDefault: true },
          { ...feature, isActive: true },
        ],
      }),
      readHistory: async (name: string) => history(name, { route: routeFromMain }),
    });

    const actions = await within(detailPanel("feature/new-thing")).findByRole("region", { name: "What you can do" });
    expect(within(actions).getByText("Merge “main” into this")).toBeInTheDocument();
    expect(within(actions).getByText("main hasn't moved since this branch left it.")).toBeInTheDocument();
    expect(within(actions).getByText("Up to date")).toBeInTheDocument();
    expect(within(actions).getByText("Adds this branch's 2 versions to main as one new saved version.")).toBeInTheDocument();
    expect(within(actions).getByText("3 files changed since it left · +42 −7")).toBeInTheDocument();
  });

  it("heads the versions only here and marks where the remote's copy begins", async () => {
    const user = userEvent.setup();
    const [main, feature] = snapshot().branches;
    renderPanel({
      onOpenHistory: vi.fn(),
      snapshot: snapshot({
        branches: [main, { ...feature, upstream: "origin/feature/new-thing", upstreamAhead: 1, upstreamBehind: 0 }],
      }),
      readHistory: async (name: string) => history(name),
    });

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    const detail = detailPanel("feature/new-thing");
    await within(detail).findByText("On this computer");
    // Where the remote's copy begins: a chip that says "Published", the
    // remote in its tooltip.
    expect(detail.querySelector(".branches-recent__boundary")).toHaveTextContent(/^Published$/);
    expect(detail.querySelector(".branches-recent__boundary .timeline-chip")).toHaveAttribute("title", "origin");
    const rows = detail.querySelectorAll(".branches-recent__row");
    expect(rows[0]).toHaveClass("branches-recent__row--local-only");
    expect(rows[1]).toHaveClass("branches-recent__row--published");
    // The node is drawn, so a screen reader hears where each version stands.
    expect(within(detail).getByRole("button", { name: "Open “an earlier step” in History" })).toHaveAccessibleDescription(
      "Published",
    );
  });

  it("keeps the route's place while the branch's history is read, then draws it there", async () => {
    const user = userEvent.setup();
    let answer!: (history: BranchHistory) => void;
    // Hover prefetch and selection may both request this branch. Resolve the
    // same receipt for either call instead of overwriting a pending resolver.
    const pendingHistory = new Promise<BranchHistory>((resolve) => { answer = resolve; });
    const [main, feature] = snapshot().branches;
    renderPanel({
      snapshot: snapshot({ branches: [{ ...main, isDefault: true }, feature] }),
      readHistory: (name: string) =>
        name === "feature/new-thing"
          ? pendingHistory
          : Promise.resolve(history(name)),
    });

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    const waiting = within(detailPanel("feature/new-thing")).getByRole("region", { name: "Route" });
    expect(within(waiting).getByRole("status")).toHaveTextContent("Reading where this branch left main…");

    answer(
      history("feature/new-thing", {
        route: {
          base: "main",
          forkCommit: "abc123",
          forkedAt: "2026-07-01T00:00:00Z",
          ownCount: 2,
          ownVersions: [],
          baseCount: 0,
          baseVersions: [],
          merge: null,
          changes: null,
        },
      }),
    );
    // The same section, answered in place.
    expect(await within(waiting).findByText(/^Left main on .+\. 2 versions of its own/)).toBeInTheDocument();
    expect(within(waiting).queryByRole("status")).not.toBeInTheDocument();
  });

  it("holds the previous branch's route while the next one is read, then gives way to it", async () => {
    const user = userEvent.setup();
    const routeOf = (ownCount: number) => ({
      base: "main",
      forkCommit: "abc123",
      forkedAt: "2026-07-01T00:00:00Z",
      ownCount,
      ownVersions: [],
      baseCount: 0,
      baseVersions: [],
      merge: null,
      changes: null,
    });
    let answer: (history: BranchHistory) => void = () => undefined;
    // One request for the held branch, shared the way the controller shares it:
    // the press reads it, and so does the hover intent the same click starts
    // 120ms later. A fresh promise per call let that second read take
    // `answer` from the one the panel awaits whenever the run was slower than
    // the hover delay.
    let pending: Promise<BranchHistory> | null = null;
    const branches = withBugfixBranch().branches;
    renderPanel({
      snapshot: snapshot({ branches: [{ ...branches[0], isDefault: true }, branches[1], branches[2]], totalCount: 3 }),
      readHistory: (name: string) =>
        name === "bugfix/other"
          ? (pending ??= new Promise<BranchHistory>((resolve) => {
              answer = resolve;
            }))
          : Promise.resolve(history(name, name === "feature/new-thing" ? { route: routeOf(2) } : {})),
    });

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    await within(detailPanel("feature/new-thing")).findByText(/2 versions of its own/);

    await user.click(screen.getByRole("treeitem", { name: "bugfix/other" }));
    const route = within(detailPanel("bugfix/other")).getByRole("region", { name: "Route" });
    // The previous branch's drawing, held quieter — not an empty lane — while
    // this one's is read; the sentence waits under the loading thread.
    expect(route.querySelector(".branches-route__layer--held")).not.toBeNull();
    expect(within(route).getByRole("status")).toBeInTheDocument();

    answer(history("bugfix/other", { route: routeOf(5) }));
    expect(await within(route).findByText(/5 versions of its own/)).toBeInTheDocument();
    // The route's sentence says the count; the states over it do not say it
    // again.
    expect(within(detailPanel("bugfix/other")).queryByText(/versions? not on main/)).not.toBeInTheDocument();
    expect(route.querySelector(".branches-route__layer--held")).toBeNull();
  });

  it("starts a branch's read when the pointer rests on its row, before the press", async () => {
    const readHistory = vi.fn(async (name: string) => history(name));
    const prefetchHistory = vi.fn();
    renderPanel({ readHistory, prefetchHistory });
    await waitFor(() => expect(readHistory).toHaveBeenCalledWith("main", "abc123"));

    fireEvent.pointerEnter(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    await waitFor(() => expect(prefetchHistory).toHaveBeenCalledWith("feature/new-thing", "def456"));

    // Passing over a row on the way somewhere else asks nothing.
    prefetchHistory.mockClear();
    const row = screen.getByRole("treeitem", { name: "feature/new-thing" });
    fireEvent.pointerEnter(row);
    fireEvent.pointerLeave(row);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(prefetchHistory).not.toHaveBeenCalled();
  });

  it("draws a branch that came back by a merge, and every dot is a version that opens in History", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderPanel({
      onOpenHistory,
      readHistory: async (name: string) =>
        history(
          name,
          name === "feature/new-thing"
            ? {
                route: {
                  base: "main",
                  forkCommit: "abc123",
                  forkedAt: "2026-07-01T00:00:00Z",
                  ownCount: 2,
                  ownVersions: [routeVersion("second step", "fff222"), routeVersion("first step", "fff111")],
                  baseCount: 1,
                  baseVersions: [routeVersion("main meanwhile", "eee111")],
                  merge: {
                    kind: "merge",
                    commit: "mmm111",
                    mergedAt: "2026-07-05T00:00:00Z",
                    afterCount: 4,
                    afterVersions: [routeVersion("main after", "eee999")],
                  },
                  changes: null,
                },
              }
            : {},
        ),
    });

    await user.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    const route = await within(detailPanel("feature/new-thing")).findByRole("region", { name: "Route" });
    expect(
      within(route).getByText(/^Left main on .+ and came back on .+ with 2 versions\. main has 4 new versions since\.$/),
    ).toBeInTheDocument();

    // A dot names its version on the tooltip and opens it on the branch it is on.
    const dot = route.querySelector('[data-tooltip^="first step"]');
    expect(dot).not.toBeNull();
    fireEvent.click(dot!);
    expect(onOpenHistory).toHaveBeenCalledWith("feature/new-thing", "fff111");
    fireEvent.click(route.querySelector('[data-tooltip^="main meanwhile"]')!);
    expect(onOpenHistory).toHaveBeenLastCalledWith("main", "eee111");
  });

  it("renders the whole detail without the history read, and without an error", async () => {
    // The read is the one thing on this screen that costs Git work beyond the
    // inventory. A host that does not offer it — or a call that fails — must
    // leave every other section standing.
    const readHistory = vi.fn(async () => Promise.reject(new Error("git said no")));
    renderPanel({ readHistory });

    const detail = detailPanel("main");
    await waitFor(() => expect(readHistory).toHaveBeenCalled());
    expect(within(detail).getByText("Saved versions")).toBeInTheDocument();
    // The tip is the inventory's, so the list stands at one row; the versions
    // behind it are the ones the failed read would have added.
    expect(within(detail).getByText("first version")).toBeInTheDocument();
    expect(within(detail).queryByText("an earlier step")).not.toBeInTheDocument();
    expect(within(detail).getByRole("list", { name: "Relationship" })).toBeInTheDocument();
  });

  it("keeps a version the inventory has not caught up with, rather than dropping it", async () => {
    // The two answers come from two Git calls: the inventory names the tip, the
    // read lists the versions. A save landing between them leaves the read one
    // version ahead — and taking its first record *as* the tip would drop that
    // version from the list and put its author's name against the tip.
    renderPanel({
      readHistory: async (name: string) => ({
        ...history(name),
        versions: [
          {
            commit: "zzz999",
            shortCommit: "zzz999a",
            subject: "saved a moment ago",
            authorName: "Grace Hopper",
            authorEmail: "grace@example.com",
            committedAt: "2026-07-03T00:00:00Z",
          },
          ...history(name).versions,
        ],
      }),
    });

    const detail = detailPanel("main");
    await within(detail).findByText("saved a moment ago");
    expect(within(detail).getByText("first version")).toBeInTheDocument();
    expect(within(detail).getByText("an earlier step")).toBeInTheDocument();
    // The tip is not that version, so its author is not the tip's author.
    expect(within(detail).queryByText("Grace Hopper")).not.toBeInTheDocument();
  });

  it("opens a saved version in History from the list, not just the branch", async () => {
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderPanel({ readHistory: async (name: string) => history(name), onOpenHistory });

    const detail = detailPanel("main");
    await within(detail).findByText("an earlier step");
    await user.click(within(detail).getByRole("button", { name: "Open “an earlier step” in History" }));
    // The branch it is on and the version itself: History needs both to land on
    // the version the reader clicked.
    expect(onOpenHistory).toHaveBeenCalledWith("main", "ccc333");
  });

  it("reads a history a shallow clone cannot count, and shows it anyway", async () => {
    renderPanel({
      readHistory: async (name: string) => history(name, { totalCount: null }),
    });

    // Nothing on this screen states a total any more, so a read that cannot
    // count has nothing to withhold — it just has to render.
    const detail = detailPanel("main");
    await within(detail).findByText("Saved versions");
    expect(within(detail).getByText("an earlier step")).toBeInTheDocument();
  });

  it("offers copy, switch, rename and delete on a right-clicked branch", async () => {
    const user = userEvent.setup();
    // After `setup()`, which installs a clipboard stub of its own: ours has to
    // be the one the copy actually reaches.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPanel();

    const row = screen.getByRole("treeitem", { name: "feature/new-thing" });
    fireEvent.contextMenu(row, { clientX: 210, clientY: 180 });

    const menu = screen.getByRole("menu", { name: "Actions for “feature/new-thing”" });
    // Going to it; what it can do with the active branch, stated but not yet
    // offered; renaming it and taking its name; and, last, deleting it.
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Switch",
      "Merge into “main”Soon",
      "Rebase “main” onto thisSoon",
      "Compare with “main”Soon",
      "Rename",
      "Copy name",
      "Delete",
    ]);
    expect(within(menu).getByRole("menuitem", { name: /Merge into “main”/ })).toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: /Rebase “main”/ })).toBeDisabled();
    expect(within(menu).getByRole("menuitem", { name: /Compare with “main”/ })).toBeDisabled();
    // Right-clicking selects, so the panel behind the menu is describing the
    // same branch the menu names.
    expect(row).toHaveAttribute("aria-selected", "true");
    expect(detailPanel("feature/new-thing")).toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitem", { name: "Copy name" }));
    expect(writeText).toHaveBeenCalledWith("feature/new-thing");
    // A copy leaves no mark on screen, so the confirmation is announced.
    expect(await screen.findByText("Name copied")).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("opens the same actions from the menu as from the detail header", async () => {
    const user = userEvent.setup();
    const onOperationStart = vi.fn(() => true);
    renderPanel({ onOperationStart });

    const row = screen.getByRole("treeitem", { name: "feature/new-thing" });
    fireEvent.contextMenu(row, { clientX: 210, clientY: 180 });
    await user.click(screen.getByRole("menuitem", { name: "Rename “feature/new-thing”" }));

    // The menu closes first, and the rename opens where the header's does.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const field = within(detailPanel("feature/new-thing")).getByRole("textbox", {
      name: "Rename “feature/new-thing”",
    });
    await waitFor(() => expect(field).toHaveFocus());

    mockedInvoke.mockReturnValueOnce(new Promise(() => {}));
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "feature/new-thing" }), { clientX: 210, clientY: 180 });
    await user.click(screen.getByRole("menuitem", { name: "Switch to “feature/new-thing”" }));
    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("never offers an action from the menu that the panel itself refuses", async () => {
    renderPanel({
      snapshot: snapshot({
        branches: [
          snapshot().branches[0],
          { ...snapshot().branches[1], name: "trunk", isDefault: true },
          { ...snapshot().branches[1], name: "elsewhere", worktreePath: "/other/workspace" },
        ],
      }),
    });

    // The project's main branch: its name is still worth copying, and nothing
    // else is on offer.
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "trunk" }), { clientX: 60, clientY: 90 });
    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .filter((item) => !(item as HTMLButtonElement).disabled)
        .map((item) => item.textContent),
    ).toEqual(["Switch", "Copy name"]);

    // The active branch has nowhere to switch to and cannot be deleted, but it
    // can be renamed.
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "main — Active" }), { clientX: 60, clientY: 90 });
    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .filter((item) => !(item as HTMLButtonElement).disabled)
        .map((item) => item.textContent),
    ).toEqual(["Rename", "Copy name"]);
    expect(within(screen.getByRole("menu")).queryByRole("menuitem", { name: /Merge into/ })).not.toBeInTheDocument();

    // A branch another workspace holds can only have its name copied — and the
    // active branch is never offered merging into itself.
    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "elsewhere" }), { clientX: 60, clientY: 90 });
    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .filter((item) => !(item as HTMLButtonElement).disabled)
        .map((item) => item.textContent),
    ).toEqual(["Copy name"]);
  });

  it("gives Delete the same reason in the menu as in the detail header", async () => {
    renderPanel({
      snapshot: snapshot({
        branches: [
          snapshot().branches[0],
          // Work that lives nowhere else: Delete is offered, and both surfaces
          // have to say it is the dialog that will explain the refusal — not
          // that the work is already kept somewhere.
          { ...snapshot().branches[1], isRetainedElsewhere: false },
        ],
      }),
    });

    const blocked = /“feature\/new-thing” has work that exists nowhere else/;
    expect(
      within(detailPanel("main")).queryByRole("button", { name: blocked }),
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "feature/new-thing" }), {
      clientX: 210,
      clientY: 180,
    });
    expect(screen.getByRole("menuitem", { name: blocked })).toBeInTheDocument();
    expect(
      within(detailPanel("feature/new-thing")).getByRole("button", { name: blocked }),
    ).toBeInTheDocument();
  });

  it("closes the right-click menu on Escape and puts focus back on the row", async () => {
    const user = userEvent.setup();
    renderPanel();

    const row = screen.getByRole("treeitem", { name: "feature/new-thing" });
    fireEvent.contextMenu(row, { clientX: 210, clientY: 180 });
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(row).toHaveFocus();
  });

  it("says so when the clipboard refuses, instead of claiming the name was copied", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderPanel();

    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "feature/new-thing" }), {
      clientX: 210,
      clientY: 180,
    });
    await user.click(screen.getByRole("menuitem", { name: "Copy name" }));

    expect(
      await screen.findByText("Couldn't copy the name."),
    ).toBeInTheDocument();
    // Still open, so the failure is attached to the thing that failed.
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.queryByText("Name copied")).not.toBeInTheDocument();

    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("does not open a mutation dialog when another linked workspace owns the repository", async () => {
    const onOperationStart = vi.fn(() => false);
    renderPanel({ onOperationStart });

    await userEvent.click(screen.getByRole("treeitem", { name: "feature/new-thing" }));
    await userEvent.click(
      within(detailPanel("feature/new-thing")).getByRole("button", { name: "Switch to “feature/new-thing”" }),
    );

    expect(onOperationStart).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("selects the branch History asked for, once, without holding on to the request", async () => {
    const user = userEvent.setup();
    const onSelectBranchIntentHandled = vi.fn();
    const view = renderPanel({
      selectBranchIntent: "feature/new-thing",
      onSelectBranchIntentHandled,
    });

    // Arrived on the branch History named, not on the active one.
    expect(detailPanel("feature/new-thing")).toBeInTheDocument();
    expect(onSelectBranchIntentHandled).toHaveBeenCalledOnce();

    // The composition root clears the request as soon as it is taken, and from
    // here on the reader owns the selection: this screen stays mounted for the
    // session, so a re-render must not put the earlier branch back.
    await user.click(screen.getByRole("treeitem", { name: "main — Active" }));
    expect(detailPanel("main")).toBeInTheDocument();

    view.rerender(
      <LanguageProvider>
        <BranchesPanel
          projectPath="/repo"
          sessionEpoch="epoch-1"
          snapshot={snapshot()}
          error={null}
          isLoading={false}
          watcherState="watching"
          onOpenSettings={vi.fn()}
          onRefresh={vi.fn()}
          onSnapshot={vi.fn()}
          onChanged={vi.fn()}
          onSaveVersion={vi.fn()}
          onOperationStart={() => true}
          onOperationFinish={vi.fn()}
          onOperationPhaseChange={vi.fn()}
          selectBranchIntent={null}
          onSelectBranchIntentHandled={onSelectBranchIntentHandled}
        />
      </LanguageProvider>,
    );
    expect(detailPanel("main")).toBeInTheDocument();
  });
});


it("routes both the detail and row menu into the current branch's integration preview", async () => {
  const onBringIn = vi.fn();
  renderPanel({ onBringIn });
  const row = screen.getByRole("treeitem", { name: "feature/new-thing" });
  await userEvent.click(row);
  await userEvent.click(screen.getByRole("button", { name: /Merge into.*main/ }));
  expect(onBringIn).toHaveBeenLastCalledWith("feature/new-thing");
  fireEvent.contextMenu(row, { clientX: 210, clientY: 180 });
  await userEvent.click(screen.getByRole("menuitem", { name: /Merge into.*main/ }));
  expect(onBringIn).toHaveBeenCalledTimes(2);
});
