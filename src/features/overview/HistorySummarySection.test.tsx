import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageProvider } from "../../i18n";
import { createScreenLifecycleController, ScreenLifecycleProvider } from "../../runtime/screen/module";
import { createHistoryController, type HistoryPage, type HistoryPort, type SavedVersionSummary } from "../history";
import { HistorySummarySection } from "./HistorySummarySection";

const query = { projectId: "/repo", sessionEpoch: "overview-history-epoch" };

function version(index: number): SavedVersionSummary {
  return {
    commit: `${index}`.repeat(40),
    shortCommit: `${index}`.repeat(7),
    parents: index === 1 ? [] : [`${index - 1}`.repeat(40)],
    subject: `Saved version ${index}`,
    description: "",
    author: { name: index === 1 ? "Ada" : "Lin", email: "author@example.com" },
    authoredAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 60 },
    committedAt: { unixSeconds: 1_700_000_000 + index, offsetMinutes: 60 },
    decorations: [],
    isRoot: index === 1,
    isMerge: false,
    publication: index === 1 ? "published" : "local-only",
    subjectTruncated: false,
    descriptionTruncated: false,
    decorationsTruncated: false,
    messageUnavailable: null,
  };
}

function page(versions: SavedVersionSummary[]): HistoryPage {
  return {
    repositoryId: query.projectId,
    snapshotToken: "snapshot-1",
    scope: { kind: "currentBranch" } as const,
    branch: "main",
    headState: "branch",
    headCommit: versions[0]?.commit ?? null,
    upstream: null,
    versions,
    nextCursor: null,
    hasMore: false,
    shallow: false,
    warnings: [],
  };
}

function port(readPage: HistoryPort["readPage"]): HistoryPort {
  return {
    readPage,
    readDetail: vi.fn(async (request) => ({
      version: version(Number(request.commit[0])),
      comparisonBase: "",
      comparisonIsEmptyTree: false,
      comparisonIsFirstParent: false,
      files: [],
      fileCounts: { changed: 0, new: 0, deleted: 0, renamed: 0, total: 0 },
      filesTruncated: false,
      countsAreMinimum: false,
    })),
    readFileDiff: vi.fn(),
    readFileMarkdown: vi.fn(),
    readImagePreview: vi.fn(),
  };
}

function renderSection(
  controller: ReturnType<typeof createHistoryController>,
  onOpenHistory = vi.fn(),
  isRefreshing = false,
  selfEmail: string | null = null,
  hasNoRemote = false,
) {
  const lifecycle = createScreenLifecycleController("active");
  return {
    onOpenHistory,
    ...render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <HistorySummarySection
            controller={controller}
            projectPath={query.projectId}
            sessionEpoch={query.sessionEpoch}
            isRefreshing={isRefreshing}
            onOpenHistory={onOpenHistory}
            selfEmail={selfEmail}
            hasNoRemote={hasNoRemote}
          />
        </ScreenLifecycleProvider>
      </LanguageProvider>,
    ),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Some tests fit the screen to a window; the rest scroll as a page.
  delete (window as Partial<Window>).matchMedia;
});

const eight = () => [9, 8, 7, 6, 5, 4, 3, 2].map(version).map((item) => ({ ...item, publication: "published" as const }));

describe("HistorySummarySection", () => {
  it("reuses the warmed history cache and opens the selected version", async () => {
    const readPage = vi.fn(async () => page([version(2), version(1)]));
    const controller = createHistoryController(port(readPage));
    await controller.refresh(query);
    readPage.mockClear();
    const user = userEvent.setup();
    const { onOpenHistory } = renderSection(controller);

    expect(screen.getByRole("heading", { name: "Recent history" })).toBeInTheDocument();
    expect(screen.getByText("Saved version 2")).toBeInTheDocument();
    // The unpublished version leads the timeline, grouped under one label.
    expect(screen.getByText("On this computer")).toBeInTheDocument();
    expect(screen.queryByText("1 version")).toBeNull();
    expect(screen.queryByText(version(2).shortCommit)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View all" })).toBeInTheDocument();
    expect(readPage).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Open “Saved version 1” in History" }));

    expect(controller.getSnapshot(query).selectedCommit).toBe(version(1).commit);
    expect(onOpenHistory).toHaveBeenCalledOnce();
    expect(onOpenHistory).toHaveBeenCalledWith();
  });

  it("names the branch a recent version sits on without turning it into prose", async () => {
    const tip: SavedVersionSummary = {
      ...version(2),
      decorations: [
        { kind: "head", name: "HEAD", fullRef: "HEAD" },
        { kind: "localBranch", name: "main", fullRef: "refs/heads/main" },
      ],
    };
    const controller = createHistoryController(port(vi.fn(async () => page([tip, version(1)]))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    const rows = container.querySelectorAll<HTMLButtonElement>(".overview-history__row");
    const badge = rows[0].querySelector(".history-ref-badge");
    // The branch being stood on is called "current": the header names it.
    expect(badge).toHaveTextContent("current");
    expect(badge).toHaveAttribute("title", expect.stringContaining("refs/heads/main"));
    expect(badge).toHaveClass("history-ref-badge--current");
    // Version 2 is still only on this computer, and the label says so last.
    expect(rows[0].getAttribute("aria-label")).toBe("Open “Saved version 2” in History — Branch main — Not published");
    expect(rows[1].querySelector(".history-ref-badge")).toBeNull();
    expect(rows[1].getAttribute("aria-label")).toBe("Open “Saved version 1” in History");

    // Author, reference, time — the same order the History timeline uses.
    // The group the row sits in says it is unpublished, so the row does not.
    const order = (row: HTMLElement): string[] =>
      [...row.querySelectorAll<HTMLElement>(".overview-history__meta > *")].map((element) => element.className.split(" ")[0]);
    expect(order(rows[0])).toEqual([
      "overview-history__author", "history-meta-dot", "history-ref-badge", "history-meta-dot", "overview-history__date",
    ]);
    expect(order(rows[1])).toEqual(["overview-history__author", "history-meta-dot", "overview-history__date"]);
  });

  it("keeps every unpublished version together after a merge brings in an older one", async () => {
    // Date order after Get and combine: the merge version, a local one, the
    // one that came in from the remote, and an older local one.
    const merge: SavedVersionSummary = { ...version(4), isMerge: true, subject: "Merge remote-tracking branch 'origin/main'" };
    const incoming: SavedVersionSummary = { ...version(2), publication: "published", subject: "From the remote" };
    const controller = createHistoryController(port(vi.fn(async () => page([merge, version(3), incoming, version(5)]))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    const local = [...container.querySelectorAll(".overview-history__item--local .overview-history__subject")]
      .map((node) => node.textContent);
    expect(local).toEqual(["Merge remote-tracking branch 'origin/main'", "Saved version 3", "Saved version 5"]);
    const subjects = [...container.querySelectorAll(".overview-history__subject")].map((node) => node.textContent);
    expect(subjects.at(-1)).toBe("From the remote");
  });

  it("leaves the current branch's copy on the remote unbadged, keeping other branches' names", async () => {
    const trackingRef = "refs/remotes/origin/main";
    const upstreamTip: SavedVersionSummary = {
      ...version(1),
      decorations: [{ kind: "remoteBranch", name: "origin/main", fullRef: trackingRef }],
    };
    const other: SavedVersionSummary = {
      ...version(3),
      publication: "published",
      decorations: [{ kind: "remoteBranch", name: "origin/feature", fullRef: "refs/remotes/origin/feature" }],
    };
    const upstream = { remote: "origin", destinationBranch: "main", trackingRef, commit: upstreamTip.commit };
    const controller = createHistoryController(port(vi.fn(async () => ({ ...page([other, version(2), upstreamTip]), upstream }))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    const rows = container.querySelectorAll<HTMLButtonElement>(".overview-history__row");
    // Grouped by where they live: the local version leads, then the two the
    // remote already holds.
    expect(rows[1].querySelector(".history-ref-badge")).toHaveTextContent("origin/feature");
    expect(rows[2].querySelector(".history-ref-badge")).toBeNull();
    expect(rows[2].querySelector(".history-meta-dot + .history-meta-dot")).toBeNull();
    expect(rows[2].getAttribute("aria-label")).toBe("Open “Saved version 1” in History");
  });

  it("marks unpublished versions and offers to publish up to one of them", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([version(2), version(1)]))));
    await controller.refresh(query);
    const onPublishUpTo = vi.fn();
    const lifecycle = createScreenLifecycleController("active");
    render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <HistorySummarySection
            controller={controller}
            projectPath={query.projectId}
            sessionEpoch={query.sessionEpoch}
            canPublish
            onOpenHistory={vi.fn()}
            onPublishUpTo={onPublishUpTo}
          />
        </ScreenLifecycleProvider>
      </LanguageProvider>,
    );

    // Only the local-only row carries the mark and the action; the
    // published one below it has neither.
    expect(screen.queryByText("Not published")).toBeNull();
    const publish = screen.getByRole("button", { name: "Publish up to here: Saved version 2" });
    await userEvent.click(publish);
    expect(onPublishUpTo).toHaveBeenCalledWith(version(2).commit);
    expect(screen.queryByRole("button", { name: /Publish up to here: Saved version 1/ })).toBeNull();
  });

  it("groups the unpublished versions and marks where the remote's copy begins", async () => {
    const trackingRef = "refs/remotes/origin/main";
    const upstream = { remote: "origin", destinationBranch: "main", trackingRef, commit: version(1).commit };
    const controller = createHistoryController(
      port(vi.fn(async () => ({ ...page([version(3), version(2), version(1)]), upstream }))),
    );
    await controller.refresh(query);
    const { container } = renderSection(controller);

    const group = container.querySelector<HTMLElement>(".overview-timeline__group");
    expect(group).not.toBeNull();
    expect(group).toHaveTextContent("On this computer");
    expect(group).not.toHaveTextContent("2 versions");
    expect(group?.querySelectorAll(".overview-history__row")).toHaveLength(2);
    // The mark sits between the group and the published version, as a chip
    // that says "Published" and names the remote in its tooltip.
    const timeline = container.querySelector<HTMLElement>(".overview-timeline");
    const children = [...(timeline?.children ?? [])].map((child) => child.className.split(" ")[0]);
    expect(children).toEqual([
      "overview-timeline__group",
      "overview-timeline__mark",
      "overview-timeline__item",
      "overview-timeline__end",
    ]);
    const mark = container.querySelector(".overview-timeline__mark");
    expect(mark).toHaveTextContent(/^Published$/);
    expect(mark?.querySelector(".timeline-chip")).toHaveAttribute("title", "origin");
  });

  it("marks the group as waiting to publish, or as this computer with no remote", async () => {
    const trackingRef = "refs/remotes/origin/main";
    const upstream = { remote: "origin", destinationBranch: "main", trackingRef, commit: version(1).commit };
    const controller = createHistoryController(
      port(vi.fn(async () => ({ ...page([version(2), version(1)]), upstream }))),
    );
    await controller.refresh(query);

    const published = renderSection(controller);
    expect(published.container.querySelector(".timeline-chip--local .lucide-cloud-upload")).not.toBeNull();
    cleanup();

    const alone = renderSection(controller, vi.fn(), false, null, true);
    expect(alone.container.querySelector(".timeline-chip--noRemote .lucide-laptop")).not.toBeNull();
  });

  it("puts the working tree first when it is given one", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([version(1)]))));
    await controller.refresh(query);
    const lifecycle = createScreenLifecycleController("active");
    const { container } = render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <HistorySummarySection
            controller={controller}
            projectPath={query.projectId}
            sessionEpoch={query.sessionEpoch}
            onOpenHistory={vi.fn()}
            now={<span>Now node</span>}
          />
        </ScreenLifecycleProvider>
      </LanguageProvider>,
    );

    const first = container.querySelector(".overview-timeline > li");
    expect(first).toHaveClass("overview-timeline__now");
    expect(first).toHaveTextContent("Now node");
  });

  it("keeps the publish hand-off off the rows when publishing is not possible", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([version(2), version(1)]))));
    await controller.refresh(query);
    renderSection(controller);

    expect(screen.queryByRole("button", { name: /Publish up to here/ })).toBeNull();
  });

  it("says You for versions saved under the user's own identity, keeping the name one hover away", async () => {
    const theirs: SavedVersionSummary = { ...version(1), author: { name: "Ada", email: "ada@example.com" } };
    const controller = createHistoryController(port(vi.fn(async () => page([version(2), theirs]))));
    await controller.refresh(query);
    const { container } = renderSection(controller, vi.fn(), false, "Author@Example.com");

    const authors = container.querySelectorAll<HTMLElement>(".overview-history__author");
    expect(authors[0]).toHaveTextContent("You");
    expect(authors[0]).toHaveAttribute("title", "Lin");
    expect(authors[1]).toHaveTextContent("Ada");
  });

  it("marks nothing when every recent version is published", async () => {
    const published = (index: number): SavedVersionSummary => ({ ...version(index), publication: "published" });
    const controller = createHistoryController(port(vi.fn(async () => page([published(2), published(1)]))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    expect(container.querySelector(".overview-timeline__group")).toBeNull();
  });

  it("shows a truthful empty state after history has loaded", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([]))));
    await controller.refresh(query);
    renderSection(controller);

    expect(screen.getByText("No saved versions yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View all" })).not.toBeInTheDocument();
  });

  it("shows refresh progress beside the title while keeping cached history visible", async () => {
    let finishRefresh: ((value: HistoryPage) => void) | undefined;
    const pendingRefresh = new Promise<HistoryPage>((resolve) => {
      finishRefresh = resolve;
    });
    const readPage = vi
      .fn<HistoryPort["readPage"]>()
      .mockResolvedValueOnce(page([version(2)]))
      .mockReturnValueOnce(pendingRefresh);
    const controller = createHistoryController(port(readPage));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    const refresh = controller.refresh(query);
    await waitFor(() => expect(container.querySelector(".overview-history__refreshing")).not.toBeNull());
    expect(screen.getByText("Saved version 2")).toBeInTheDocument();

    finishRefresh?.(page([version(2)]));
    await refresh;
  });

  it("can enter refresh feedback immediately before its repository read starts", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([version(2)]))));
    await controller.refresh(query);
    const { container } = renderSection(controller, vi.fn(), true);

    expect(container.querySelector(".overview-history__refreshing")).not.toBeNull();
    expect(screen.getByText("Saved version 2")).toBeInTheDocument();
  });

  it("offers a contextual retry when the first history read fails", async () => {
    const readPage = vi
      .fn<HistoryPort["readPage"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page([]));
    const controller = createHistoryController(port(readPage));
    await controller.refresh(query);
    renderSection(controller);

    expect(screen.getByRole("alert")).toHaveTextContent("Recent history is unavailable");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(readPage).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No saved versions yet")).toBeInTheDocument();
  });

  it("ends by pointing to History, not with a second button, when there are more versions than it shows", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page(eight()))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    // Scrolling as a page, the timeline keeps its fixed length.
    expect(container.querySelectorAll(".overview-history__row")).toHaveLength(6);
    const end = container.querySelector(".overview-timeline__end");
    expect(end).toHaveClass("overview-timeline__end--more");
    expect(end).toHaveTextContent("Latest 6 versions · older ones are in History");
    expect(screen.getAllByRole("button", { name: "View all" })).toHaveLength(1);
  });

  it("ends where the project began when every version is shown", async () => {
    const controller = createHistoryController(port(vi.fn(async () => page([version(2), version(1)]))));
    await controller.refresh(query);
    const { container } = renderSection(controller);

    const end = container.querySelector(".overview-timeline__end");
    expect(end).toHaveClass("overview-timeline__end--start");
    expect(end).toHaveTextContent("Where the project began");
  });

  it("does not call a shallow copy's oldest version the start of the project", async () => {
    const controller = createHistoryController(
      port(vi.fn(async () => ({ ...page([version(2), version(1)]), shallow: true }))),
    );
    await controller.refresh(query);
    const { container } = renderSection(controller);

    expect(container.querySelector(".overview-timeline__end")).toHaveTextContent(
      "Older versions were not downloaded to this computer",
    );
  });

  it("scrolls the first page of versions under a pinned now when it fits the screen", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (media: string) => ({ matches: true, media, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    const controller = createHistoryController(port(vi.fn(async () => page(eight()))));
    await controller.refresh(query);
    const lifecycle = createScreenLifecycleController("active");
    const { container } = render(
      <LanguageProvider>
        <ScreenLifecycleProvider controller={lifecycle}>
          <HistorySummarySection
            controller={controller}
            projectPath={query.projectId}
            sessionEpoch={query.sessionEpoch}
            onOpenHistory={vi.fn()}
            now={<span>Now node</span>}
          />
        </ScreenLifecycleProvider>
      </LanguageProvider>,
    );

    // Every version read is drawn; the box scrolls rather than cutting rows.
    const scroller = container.querySelector(".overview-history__scroll");
    expect(scroller?.querySelectorAll(".overview-history__row")).toHaveLength(8);
    // "Now" stays outside the scrolling box.
    const now = container.querySelector(".overview-timeline__now");
    expect(now?.closest(".overview-timeline--pinned")).not.toBeNull();
    expect(scroller?.contains(now ?? null)).toBe(false);
  });

  it("points to View all once the timeline is scrolled to the end of a branch that goes on", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (media: string) => ({ matches: true, media, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    });
    const controller = createHistoryController(
      port(vi.fn(async () => ({ ...page(eight()), hasMore: true, nextCursor: "next" }))),
    );
    await controller.refresh(query);
    const { container } = renderSection(controller);
    const viewAll = screen.getByRole("button", { name: "View all" });
    const scroller = container.querySelector<HTMLElement>(".overview-history__scroll");
    if (!scroller) throw new Error("no scroller");
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 300 });
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 500 });

    // The pointer is over the list, so its scrollbar shows.
    fireEvent.pointerEnter(scroller, { pointerType: "mouse" });

    // At the top, with more below: the bottom fades and View all stays quiet.
    fireEvent.scroll(scroller);
    await waitFor(() => expect(scroller).toHaveAttribute("data-more-below"));
    expect(viewAll).not.toHaveClass("overview-history__all--lead");

    // Scrolled to the end: the fade goes and View all takes the lead.
    scroller.scrollTop = 200;
    fireEvent.scroll(scroller);
    await waitFor(() => expect(viewAll).toHaveClass("overview-history__all--lead", "attention-breathe"));
    expect(scroller).not.toHaveAttribute("data-more-below");

    // Back up, it quiets again.
    scroller.scrollTop = 40;
    fireEvent.scroll(scroller);
    await waitFor(() => expect(viewAll).not.toHaveClass("overview-history__all--lead"));

    // None of that re-rendering hid the scrollbar under the pointer.
    expect(scroller).toHaveAttribute("data-pointer-active");
  });
});
