import { useCallback, useMemo, useRef, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { ConsoleHost, ConsolePlan, ConsoleRunResult, ConsoleTier, OutputShape } from "./port";
import type { ConsoleQueryId } from "./domain";

/** What any run returns: a catalogue query's result or a typed command's. */
export type ConsoleOutput = Omit<ConsoleRunResult, "shape" | "failure">;
export type Entry = {
  id: number;
  kind: "query" | "help" | "help-git" | "message";
  input: string;
  operationId?: ConsoleQueryId;
  /** The Git line a typed command or a line shortcut plans on every run. */
  line?: string;
  /** A line shortcut's saved tier, which no later run may exceed. */
  ceiling?: ConsoleTier;
  shape?: OutputShape;
  command?: string;
  result?: ConsoleOutput;
  message?: string;
  /** Why Rust would not run the line, in the person's language. */
  refusal?: string;
  /** A change plan, printed before it asks to go ahead. */
  plan?: ConsolePlan;
  /** Waiting for the answer to `[s/N]`. */
  awaiting?: boolean;
  /** What the person answered, echoed after the question as a terminal does. */
  answer?: string;
  cancelled?: boolean;
  /** What Rust thinks a failed change ran into, in the person's language. */
  failure?: string;
  error?: string;
  running?: boolean;
  durationMs?: number;
  /** The line the prompt showed when the entry ran, as a terminal keeps it. */
  branch: string | null;
};

export type ConsoleSessionSnapshot = {
  entries: Entry[];
  history: string[];
  input: string;
  host: ConsoleHost | null;
  running: boolean;
  pending: { id: number; planId: string } | null;
};

function createSession() {
  let snapshot: ConsoleSessionSnapshot = { entries: [], history: [], input: "", host: null, running: false, pending: null };
  let closed = false;
  const listeners = new Set<() => void>();
  const nextId = { current: 0 };
  const currentRequest = { current: 0 };
  const hostRequested = { current: false };
  const setter = <K extends keyof ConsoleSessionSnapshot>(field: K): Dispatch<SetStateAction<ConsoleSessionSnapshot[K]>> => (value) => {
    if (closed) return;
    const next = typeof value === "function"
      ? (value as (previous: ConsoleSessionSnapshot[K]) => ConsoleSessionSnapshot[K])(snapshot[field])
      : value;
    if (Object.is(snapshot[field], next)) return;
    snapshot = { ...snapshot, [field]: next };
    for (const listener of [...listeners]) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setEntries: setter("entries"), setHistory: setter("history"), setInput: setter("input"),
    setHost: setter("host"), setRunning: setter("running"), setPending: setter("pending"),
    nextId, currentRequest, hostRequested,
    close() { closed = true; currentRequest.current += 1; listeners.clear(); },
  };
}

/** Explicitly owned by App. Only memory is retained; each open incarnation has
 * its own bounded transcript (40 entries) and recall (40 lines). Closing it
 * invalidates callbacks as well as evicting its state. No hidden DOM is kept. */
export function createConsoleSessionStore() {
  const sessions = new Map<string, ReturnType<typeof createSession>>();
  const keyOf = (projectId: string, epoch: string) => `${projectId}\0${epoch}`;
  return {
    get(projectId: string, epoch: string) {
      const key = keyOf(projectId, epoch);
      let entry = sessions.get(key);
      if (!entry) { entry = createSession(); sessions.set(key, entry); }
      return entry;
    },
    close(projectId: string, epoch: string) {
      const key = keyOf(projectId, epoch);
      sessions.get(key)?.close();
      sessions.delete(key);
    },
  };
}

export type ConsoleSessionStore = ReturnType<typeof createConsoleSessionStore>;

export function useConsoleSession(store: ConsoleSessionStore, projectId: string, epoch: string, isActive: boolean) {
  const session = useMemo(() => store.get(projectId, epoch), [store, projectId, epoch]);
  const frozen = useRef(session.getSnapshot());
  const subscribe = useCallback((listener: () => void) => isActive ? session.subscribe(listener) : () => {}, [isActive, session]);
  const getSnapshot = useCallback(() => {
    if (isActive) frozen.current = session.getSnapshot();
    return frozen.current;
  }, [isActive, session]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...session, snapshot };
}
