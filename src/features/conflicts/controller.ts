import type { FileDiff } from "../changes";
import type { ProjectRuntime } from "../../runtime/project/runtime";
import type { ConflictSession, WorkingFileCheck } from "./domain";
import type { ConflictSideDiffQuery, ConflictsPort, ConflictsQuery } from "./port";

export type ConflictsState = {
  projectId: string;
  sessionEpoch: string;
  /** `undefined` until the first read answers; `null` when nothing is paused. */
  session: ConflictSession | null | undefined;
  error: unknown | null;
  isLoading: boolean;
  generation: number;
};

type Listener = () => void;
type Entry = {
  state: ConflictsState;
  listeners: Set<Listener>;
  inFlight: { generation: number; promise: Promise<void> } | null;
};

/** Side diffs are keyed by the objects they compare, so an answer never goes
 * stale: a file whose stages moved asks a different question. The cap keeps a
 * long review from holding every diff it opened. */
const MAX_SIDE_DIFFS = 48;

function keyOf(query: ConflictsQuery): string {
  return `${query.projectId}\0${query.sessionEpoch}`;
}

/** A marker check answers for one state of the file, which the session's
 * token names: an edit moves the token and asks again. */
function markerCheckKey(query: ConflictsQuery, filePath: string, stateToken: string): string {
  return `${keyOf(query)}\0${filePath}\0${stateToken}`;
}

function sideDiffKey(query: ConflictSideDiffQuery): string {
  return `${keyOf(query)}\0${query.filePath}\0${query.side}\0${query.baseObjectId ?? ""}\0${query.sideObjectId}`;
}

/** Two reads of the same pause that Rust gave the same token describe the
 * same thing: the token covers the markers, the unmerged listing and each
 * listed path's working state. */
function sameSession(left: ConflictSession | null | undefined, right: ConflictSession | null): boolean {
  if (left === undefined) return false;
  if (left === null || right === null) return left === right;
  return left.sessionId === right.sessionId && left.stateToken === right.stateToken;
}

/** Where the reader was in one project's session: the screen is evicted with
 * its project's keep-alive slot when another project is shown, so this lives
 * here, keyed like everything else by the project incarnation. */
export type ConflictsViewMemory = {
  selectedPath: string | null;
  search: string;
  scrollTop: number;
};

export const INITIAL_VIEW_MEMORY: ConflictsViewMemory = Object.freeze({
  selectedPath: null,
  search: "",
  scrollTop: 0,
});

export type ConflictsController = ReturnType<typeof createConflictsController>;

export function createConflictsController(port: ConflictsPort) {
  const entries = new Map<string, Entry>();
  const views = new Map<string, ConflictsViewMemory>();
  const sideDiffs = new Map<string, FileDiff>();
  const sideDiffRequests = new Map<string, Promise<FileDiff>>();
  const markerChecks = new Map<string, Promise<WorkingFileCheck>>();

  const publish = (entry: Entry, next: ConflictsState): void => {
    if (Object.is(entry.state, next)) return;
    entry.state = next;
    for (const listener of [...entry.listeners]) listener();
  };

  const entryFor = (query: ConflictsQuery): Entry => {
    const key = keyOf(query);
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        state: { ...query, session: undefined, error: null, isLoading: false, generation: 0 },
        listeners: new Set(),
        inFlight: null,
      };
      entries.set(key, entry);
    }
    return entry;
  };

  const refresh = (query: ConflictsQuery): Promise<void> => {
    const entry = entryFor(query);
    if (entry.inFlight) return entry.inFlight.promise;
    const generation = entry.state.generation + 1;
    publish(entry, { ...entry.state, isLoading: true, error: null, generation });
    const promise = port
      .readSession(query)
      .then((session) => {
        if (entry.state.generation !== generation) return;
        publish(entry, {
          ...entry.state,
          session: sameSession(entry.state.session, session) ? entry.state.session : session,
          error: null,
          isLoading: false,
        });
      })
      .catch((error: unknown) => {
        if (entry.state.generation !== generation) return;
        publish(entry, { ...entry.state, error, isLoading: false });
      })
      .finally(() => {
        if (entry.inFlight?.generation === generation) entry.inFlight = null;
      });
    entry.inFlight = { generation, promise };
    return promise;
  };

  /** The read a repository change calls for. A project whose status shows
   * nothing paused and that has no session on record has nothing to look at,
   * so it costs no Git process; one with either is read again, which is also
   * how a session that just ended is noticed. */
  const refreshIfRelevant = (query: ConflictsQuery, isPaused: boolean): void => {
    const entry = entryFor(query);
    if (isPaused || entry.state.session) {
      void refresh(query);
    } else if (entry.state.session === undefined) {
      publish(entry, { ...entry.state, session: null });
    }
  };

  /** Runs one file mutation and makes the session it answers with the cached
   * one. Rust reads that session after its own verified change, so it
   * supersedes every read started before it; a failure leaves the session the
   * reader was looking at, which is still what they decided from. */
  const mutate = async (
    query: ConflictsQuery,
    run: (port: ConflictsPort) => Promise<ConflictSession | null>,
  ): Promise<ConflictSession | null> => {
    const entry = entryFor(query);
    const session = await run(port);
    if (entries.get(keyOf(query)) !== entry) return session;
    entry.inFlight = null;
    publish(entry, {
      ...entry.state,
      session,
      error: null,
      isLoading: false,
      generation: entry.state.generation + 1,
    });
    return session;
  };

  /** Runs finishing or abandoning the merge. Rust verified that the merge
   * ended before it answered, so nothing is paused any more: that is the
   * cached answer until the coordinated refresh reads it again. A failure
   * leaves the session as it was. */
  const end = async <T>(query: ConflictsQuery, run: (port: ConflictsPort) => Promise<T>): Promise<T> => {
    const entry = entryFor(query);
    const result = await run(port);
    if (entries.get(keyOf(query)) !== entry) return result;
    entry.inFlight = null;
    publish(entry, {
      ...entry.state,
      session: null,
      error: null,
      isLoading: false,
      generation: entry.state.generation + 1,
    });
    return result;
  };

  const readSideDiff = (query: ConflictSideDiffQuery): Promise<FileDiff> => {
    const key = sideDiffKey(query);
    const cached = sideDiffs.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = sideDiffRequests.get(key);
    if (pending) return pending;
    const request = port
      .readSideDiff(query)
      .then((diff) => {
        sideDiffs.set(key, diff);
        if (sideDiffs.size > MAX_SIDE_DIFFS) {
          const oldest = sideDiffs.keys().next();
          if (!oldest.done) sideDiffs.delete(oldest.value);
        }
        return diff;
      })
      .finally(() => {
        sideDiffRequests.delete(key);
      });
    sideDiffRequests.set(key, request);
    return request;
  };

  /** Checks a file for markers once per state of it. Asked when a session
   * read shows the file edited outside GitOdile, never on visibility; a
   * failure is forgotten so the next state can ask again. */
  const checkWorkingFile = (
    query: ConflictsQuery,
    filePath: string,
    stateToken: string,
  ): Promise<WorkingFileCheck> => {
    const key = markerCheckKey(query, filePath, stateToken);
    const held = markerChecks.get(key);
    if (held) return held;
    const request = port.checkWorkingFile({ ...query, filePath });
    request.catch(() => markerChecks.delete(key));
    markerChecks.set(key, request);
    if (markerChecks.size > MAX_SIDE_DIFFS) {
      const oldest = markerChecks.keys().next();
      if (!oldest.done) markerChecks.delete(oldest.value);
    }
    return request;
  };

  return {
    port,
    getSnapshot(query: ConflictsQuery): ConflictsState {
      return entryFor(query).state;
    },
    subscribe(query: ConflictsQuery, listener: Listener): () => void {
      const entry = entryFor(query);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    refresh,
    mutate,
    acceptSession(query: ConflictsQuery, session: ConflictSession): Promise<ConflictSession | null> {
      return mutate(query, async () => session);
    },
    end,
    readSideDiff,
    checkWorkingFile,
    /** The resolved diff when it is already held, so the detail renders on
     * arrival without a loading frame. Never starts a read. */
    peekSideDiff(query: ConflictSideDiffQuery): FileDiff | null {
      return sideDiffs.get(sideDiffKey(query)) ?? null;
    },
    /** Idle-deferred, like every speculative read: the status snapshot this
     * follows has just landed, and the overlap read must not compete with
     * the frame that draws it. */
    scheduleWarm(runtime: ProjectRuntime, query: ConflictsQuery, isPaused: boolean): () => void {
      return runtime.scheduleCacheWarm({
        key: `conflicts:${query.sessionEpoch}`,
        reason: "repository-invalidation",
        run: async () => refreshIfRelevant(query, isPaused),
      });
    },
    viewMemory(query: ConflictsQuery): ConflictsViewMemory {
      return views.get(keyOf(query)) ?? INITIAL_VIEW_MEMORY;
    },
    /** Merges into what is remembered, so the list's scroll position and the
     * reader's choices can be written apart without one undoing the other. */
    rememberView(query: ConflictsQuery, patch: Partial<ConflictsViewMemory>): void {
      views.set(keyOf(query), { ...(views.get(keyOf(query)) ?? INITIAL_VIEW_MEMORY), ...patch });
    },
    close(query: ConflictsQuery): void {
      views.delete(keyOf(query));
      const prefix = `${keyOf(query)}\0`;
      for (const key of [...sideDiffs.keys()]) {
        if (key.startsWith(prefix)) sideDiffs.delete(key);
      }
      for (const key of [...markerChecks.keys()]) {
        if (key.startsWith(prefix)) markerChecks.delete(key);
      }
      const entry = entries.get(keyOf(query));
      if (!entry) return;
      entry.state = { ...entry.state, generation: entry.state.generation + 1 };
      entry.inFlight = null;
      entries.delete(keyOf(query));
    },
  };
}
