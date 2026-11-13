import { acceptsRepositoryInvalidation, invalidationNeedsSharedRefresh, type RepositoryInvalidation } from "../../runtime/project/invalidation";
import type { ProjectRuntime } from "../../runtime/project/runtime";
import { shouldRefreshOnWatchEvent, type ProjectSessionsState } from "../../runtime/project/sessions";
import type { RepositoryController } from "./controller";

export type RepositoryReadQuery = { projectId: string; sessionEpoch: string };

/**
 * A feature that keeps a repository-derived snapshot fresh.
 *
 * The coordinator decides *when* and *in what order* to refresh; this contract
 * is how it stops needing to know *who*. Before task 042 each dependent feature
 * was a positional parameter with a hardcoded call inside `refreshAll`, so the
 * repository feature knew about every other feature and the list grew with each
 * screen.
 *
 * Deliberately narrow: a query in, a refresh or supersede out. Anything a
 * feature needs beyond that — a project runtime, an error mapper — is captured
 * by the closure the composition root registers, so it never widens this type.
 */
export type RepositoryReadSubscriber = {
  /** Names the subscriber in ordering assertions and debugging. */
  readonly id: string;
  /**
   * The narrowest invalidation that should refresh this snapshot.
   *
   * `worktree-change` also refreshes on shared changes, because a change to
   * `HEAD` or refs changes the working tree too. `shared-change` is skipped for
   * worktree-only events, which is what keeps a file save from re-reading the
   * branch inventory.
   */
  readonly refreshOn: "worktree-change" | "shared-change";
  /**
   * Whether `refreshAll` waits for this refresh before resolving.
   *
   * Only the working-tree snapshot is awaited. Branches is a background
   * dependent read that callers do not block on, and that distinction used to
   * be a single `void` keyword in the middle of `refreshAll` — stating it here
   * is the point of the field.
   */
  readonly blocking: boolean;
  refresh(query: RepositoryReadQuery): Promise<void> | void;
  supersede(query: RepositoryReadQuery): void;
};

export type RepositoryReadCoordinator = ReturnType<typeof createRepositoryReadCoordinator>;

/** Coordinates freshness across repository identity and every registered
 * dependent snapshot. Watch bursts and mutation deferral live here rather than
 * in the app shell or a screen. */
export function createRepositoryReadCoordinator(
  repository: RepositoryController,
  subscribers: readonly RepositoryReadSubscriber[],
) {
  const sequences = new Map<string, number>();
  const deferred = new Map<string, boolean>();

  /**
   * Background reads start first and are left running; blocking reads are
   * awaited in registration order.
   *
   * The two passes are not a style choice. Starting every subscriber and
   * awaiting them all would make `refreshAll` resolve only once the branch
   * inventory returned, changing what "the refresh finished" means for the
   * mutation callers that await it.
   */
  const notify = async (query: RepositoryReadQuery, includeSharedReads: boolean): Promise<void> => {
    const selected = subscribers.filter(
      (subscriber) => includeSharedReads || subscriber.refreshOn === "worktree-change",
    );
    for (const subscriber of selected) {
      if (!subscriber.blocking) void subscriber.refresh(query);
    }
    for (const subscriber of selected) {
      if (subscriber.blocking) await subscriber.refresh(query);
    }
  };

  /** Starts only shared-ref readers and waits for every one of them. Explicit
   * screen refreshes use this after a remote check so history, branches,
   * and local sync facts are read once from the final tracking-ref state. */
  const refreshSharedAndWait = async (state: ProjectSessionsState, path: string): Promise<void> => {
    const query = queryFor(state, path);
    if (!query) return;
    const selected = subscribers.filter((subscriber) => subscriber.refreshOn === "shared-change");
    await Promise.all(selected.map(async (subscriber) => subscriber.refresh(query)));
  };

  const queryFor = (state: ProjectSessionsState, path: string): RepositoryReadQuery | null => {
    const epoch = state.byId[path]?.epoch;
    return epoch ? { projectId: path, sessionEpoch: epoch } : null;
  };

  /** Worktree-only refresh: file contents changed, nothing about `HEAD` did. */
  const refreshWorktree = async (state: ProjectSessionsState, path: string): Promise<void> => {
    const query = queryFor(state, path);
    if (query) await notify(query, false);
  };

  const refreshAll = async (runtime: ProjectRuntime, state: ProjectSessionsState, path: string): Promise<void> => {
    const query = queryFor(state, path);
    if (!query) return;
    // Refresh identity before dependent snapshots, without selecting the
    // project: this also runs for inactive sessions and may finish after a switch.
    try {
      const project = await repository.open({ selectedPath: path, sessionEpoch: query.sessionEpoch });
      runtime.dispatch({ type: "refreshProject", project });
    } catch {
      // Preserve the last truthful identity; other scoped reads still run.
    }
    if (runtime.getSnapshot().byId[path]?.epoch !== query.sessionEpoch) return;
    await notify(query, true);
  };

  /** Refreshes repository identity and working-tree facts without starting
   * shared readers. This lets an explicit remote check run in parallel, then
   * `refreshSharedAndWait` reads remote-dependent snapshots exactly once. */
  const refreshProjectAndWorktree = async (
    runtime: ProjectRuntime,
    state: ProjectSessionsState,
    path: string,
  ): Promise<void> => {
    const query = queryFor(state, path);
    if (!query) return;
    try {
      const project = await repository.open({ selectedPath: path, sessionEpoch: query.sessionEpoch });
      runtime.dispatch({ type: "refreshProject", project });
    } catch {
      // Preserve the last truthful identity; the working-tree read is still useful.
    }
    if (runtime.getSnapshot().byId[path]?.epoch !== query.sessionEpoch) return;
    await notify(query, false);
  };

  return {
    refreshWorktree,
    refreshAll,
    refreshProjectAndWorktree,
    refreshSharedAndWait,
    /** Mutation results win over older discovery reads. Discard coalesced
     * watcher work, supersede every affected generation, then invalidate each
     * dependent feature once through the ordinary shared refresh path. */
    refreshAfterMutation(runtime: ProjectRuntime, state: ProjectSessionsState, path: string): Promise<void> {
      const query = queryFor(state, path);
      if (!query) return Promise.resolve();
      deferred.delete(path);
      for (const subscriber of subscribers) subscriber.supersede(query);
      return refreshAll(runtime, state, path);
    },
    handleInvalidation(runtime: ProjectRuntime, state: ProjectSessionsState, event: RepositoryInvalidation): void {
      const key = `${event.projectId}\0${event.sessionEpoch}`;
      const previous = sequences.get(key) ?? 0;
      const session = state.byId[event.projectId];
      if (!acceptsRepositoryInvalidation(session, event, previous)) return;
      sequences.set(key, event.sequence);
      const shared = invalidationNeedsSharedRefresh(event.kind);
      if (!shouldRefreshOnWatchEvent(session)) {
        deferred.set(event.projectId, shared || (deferred.get(event.projectId) ?? false));
        return;
      }
      void (shared
        ? refreshAll(runtime, state, event.projectId)
        : refreshWorktree(state, event.projectId));
    },
    finishDeferred(runtime: ProjectRuntime, state: ProjectSessionsState, path: string): void {
      const shared = deferred.get(path);
      if (shared === undefined) return;
      deferred.delete(path);
      void (shared ? refreshAll(runtime, state, path) : refreshWorktree(state, path));
    },
    discardDeferred(path: string): void {
      deferred.delete(path);
    },
    close(path: string, sessionEpoch: string): void {
      deferred.delete(path);
      sequences.delete(`${path}\0${sessionEpoch}`);
    },
  };
}
