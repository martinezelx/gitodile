import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, CloudUpload, Copy, Diff, Folder, GitBranch, GitCommitHorizontal, Keyboard, Palette, RotateCcw, RotateCw, Search, Server, Settings, ShieldCheck, ShieldOff, SquareTerminal, X } from "lucide-react";
import { useLanguage } from "../../i18n";
import { useScreenLifecycle } from "../../runtime/screen/module";
import { localizeAppError } from "../../shared/i18n";
import { themeById, type ThemePreference } from "../../shared/theme";
import { copyTextToClipboard, isReducedMotionRequested, setAutoHideScrollbarActive } from "../../shared/ui";
import type { HistoryController, HistoryQuery, SavedVersionSummary } from "../history";
import {
  completionsFor,
  DEFAULT_SHORTCUTS,
  defaultLineName,
  HOSTING_OPERATION_IDS,
  isHostingId,
  queryCommand,
  shortcutCommand,
  SHORTCUT_LIMIT,
  GIT_READ_COMMANDS,
  isGitLine,
  isLineShortcut,
  MAX_LINE_LENGTH,
  namesByOperation,
  OPERATION_IDS,
  parseConsoleInput,
  readShortcuts,
  shortcutNameIssue,
  widensTier,
  writeShortcuts,
  type ConsoleCompletion,
  type ConsoleProjectStatus,
  type ConsoleQueryId,
  type ConsoleShortcut,
} from "./domain";
import { ConsoleMascot } from "./ConsoleMascot";
import { highlightOutput, queryShape, type OutputSegment } from "./output";
import { DEFAULT_CONSOLE_PREFERENCES, type ConsolePreferences } from "./preferences";
import type { ConsolePlan, ConsoleTier, HostKind, OutputShape } from "./port";
import { consolePort } from "./tauriAdapter";
import { createConsoleSessionStore, useConsoleSession, type ConsoleSessionStore, type ConsoleOutput, type Entry } from "./session";

/** A shortcut's target in the editor: a catalogue query, or a command line. */
type ShortcutTarget = ConsoleQueryId | "line";
const SHORTCUT_TARGETS: readonly ShortcutTarget[] = [...OPERATION_IDS, ...HOSTING_OPERATION_IDS, "line"];

type BlockState = "running" | "success" | "failed" | "truncated" | "note";

const TRANSCRIPT_LIMIT = 40;
/** Coloured runs (each an element) the whole transcript may hold; see the screen's element budget. */
const TRANSCRIPT_TONE_BUDGET = 400;
const SCROLLBAR_IDLE_MS = 1200;
/** The theme's own colours, as a terminal's welcome shows its eight ANSI ones. */
const WELCOME_PALETTE = ["accent", "danger", "warning", "string", "type", "keyword", "number", "property"] as const;
/** Saved versions whose short ids fall as the mascot's rain. */
const RAIN_VERSIONS = 24;
const NO_VERSIONS: readonly SavedVersionSummary[] = [];
/** The mascot's move between the welcome and the watermark: a choreography timing, not a transition token. */
const MASCOT_FLIGHT_MS = 460;

/** The history the app already holds for this project; the console never reads it itself. */
type ConsoleHistorySource = Pick<HistoryController, "subscribe" | "getSnapshot">;

/** The project's recent short version ids, from the cached history only. */
function useRainHashes(source: ConsoleHistorySource | undefined, query: HistoryQuery, active: boolean): string {
  const subscribe = useCallback((listener: () => void) => source && active ? source.subscribe(query, listener) : () => {}, [source, query, active]);
  const versions = useSyncExternalStore(subscribe, () => source?.getSnapshot(query).versions ?? NO_VERSIONS);
  return useMemo(() => versions.slice(0, RAIN_VERSIONS).map((version) => version.shortCommit).join(""), [versions]);
}

/** Where the mascot took off from, measured before the drawing moves. */
type MascotFlight = { from: DOMRect; opacity: number; to: "watermark" | "welcome" };

type Translations = ReturnType<typeof useLanguage>["t"];

/** What a shortcut shows: its query's name, a built-in line's, or "your command". */
function shortcutLabel(shortcut: ConsoleShortcut, t: Translations): string {
  if (!isLineShortcut(shortcut)) return outputLabel(shortcut.operationId, t);
  const builtIn = defaultLineName(shortcut);
  return builtIn ? t.consoleDefaultLines[builtIn] : t.consoleShortcutOwnLine;
}

function outputLabel(id: ShortcutTarget, t: Translations): string {
  if (id !== "line" && isHostingId(id)) return t.consoleHostingLabels[id];
  const labels: Record<Exclude<ShortcutTarget, (typeof HOSTING_OPERATION_IDS)[number]>, string> = {
    status: t.consoleStatus, diff: t.consoleDiff, staged: t.consoleStaged, log: t.consoleLog, graph: t.consoleGraph,
    last: t.consoleLast, branches: t.consoleBranches, tags: t.consoleTags, remotes: t.consoleRemotes,
    stashes: t.consoleStashes, authors: t.consoleAuthors, line: t.consoleShortcutLineOption,
  };
  return labels[id];
}

/** Why a plan will not run, in the person's language. */
function refusalText(plan: ConsolePlan, t: Translations): string {
  const refusal = plan.refusal;
  if (!refusal) return t.consoleRequestFailed;
  if (refusal.reason === "tier_not_allowed") return t.consoleTierNotAllowed(refusal.subject ?? "", plan.tier ?? "never");
  return t.consoleRefusal(refusal.reason, refusal.subject);
}

/** Rust's verdict on a command line a shortcut would store. */
type LineVerdict = { tier: ConsoleTier } | { error: string };

function ShortcutsManager({
  shortcuts, host, onChange, onClose, validateLine,
}: {
  shortcuts: ConsoleShortcut[];
  /** The project's provider, so hosting queries show the CLI that answers. */
  host: HostKind | null;
  onChange: (next: ConsoleShortcut[]) => void;
  onClose: () => void;
  validateLine: (line: string) => Promise<LineVerdict>;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [target, setTarget] = useState<ShortcutTarget>("status");
  const [line, setLine] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const persist = (next: ConsoleShortcut[]): void => {
    if (!writeShortcuts(next)) {
      setError(t.consoleShortcutStorageError);
      return;
    }
    onChange(next);
    setName("");
    setLine("");
    setEditing(null);
    setError("");
  };
  const save = async (): Promise<void> => {
    if (checking) return;
    const candidate = name.trim();
    const issue = shortcutNameIssue(candidate, shortcuts, editing ?? undefined);
    if (issue) {
      setError({ invalid: t.consoleShortcutInvalid, reserved: t.consoleShortcutReserved, duplicate: t.consoleShortcutDuplicate }[issue]);
      return;
    }
    if (editing) {
      persist(shortcuts.map((shortcut) => shortcut.name === editing ? { ...shortcut, name: candidate } : shortcut));
      return;
    }
    if (shortcuts.length >= SHORTCUT_LIMIT) {
      setError(t.consoleShortcutLimit);
      return;
    }
    if (target !== "line") {
      persist([...shortcuts, { name: candidate, operationId: target }]);
      return;
    }
    // A command line is checked by Rust now, and planned again on every run.
    const typed = line.trim();
    if (!isGitLine(typed) || typed === "git") {
      setError(t.consoleShortcutLineInvalid);
      return;
    }
    setChecking(true);
    setError("");
    const verdict = await validateLine(typed);
    setChecking(false);
    if ("error" in verdict) setError(verdict.error);
    else persist([...shortcuts, { name: candidate, line: typed, tier: verdict.tier }]);
  };

  const startRename = (shortcut: ConsoleShortcut): void => {
    setEditing(shortcut.name);
    setName(shortcut.name);
    if (isLineShortcut(shortcut)) { setTarget("line"); setLine(shortcut.line); } else { setTarget(shortcut.operationId); setLine(""); }
    setError("");
    inputRef.current?.focus();
  };
  const cancelRename = (): void => { setEditing(null); setName(""); setLine(""); setError(""); inputRef.current?.focus(); };

  return (
    <section className="console-shortcuts" aria-label={t.consoleShortcutsTitle} onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      if (editing) cancelRename();
      else onClose();
    }}>
      <header className="console-shortcuts__head">
        <h2><span className="console-shortcuts__glyph" aria-hidden="true">❯</span>{t.consoleShortcutsTitle}</h2>
        <p className="console-shortcuts__note">{t.consoleShortcutsDescription}</p>
        <button type="button" className="console-shortcuts__action" onClick={() => persist([...DEFAULT_SHORTCUTS])}><RotateCcw aria-hidden="true" />{t.consoleShortcutReset}</button>
        <button type="button" className="console-shortcuts__key" onClick={onClose} aria-label={t.consoleShortcutClose} title={t.consoleShortcutClose}>esc</button>
      </header>
      <form className="console-shortcuts__form" onSubmit={(event) => { event.preventDefault(); void save(); }} aria-busy={checking || undefined}>
        <span className="console-shortcuts__glyph" aria-hidden="true">{editing ? "~" : "+"}</span>
        <label className="console-shortcuts__field">
          <span className="visually-hidden">{t.consoleShortcutName}</span>
          <input ref={inputRef} value={name} placeholder={t.consoleShortcutName.toLowerCase()} onChange={(event) => { setName(event.target.value); setError(""); }} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={20} />
        </label>
        <span className="console-shortcuts__arrow" aria-hidden="true">→</span>
        <QueryPicker value={target} onChange={(next) => { setTarget(next); setError(""); }} disabled={editing !== null} label={t.consoleShortcutTarget}
          previous={t.consoleQueryPrevious} next={t.consoleQueryNext} />
        {target !== "line" && <code className="console-shortcuts__command console-shortcuts__command--preview">{queryCommand(target, host)}</code>}
        {target === "line" && (
          <label className="console-shortcuts__field console-shortcuts__field--line">
            <span className="visually-hidden">{t.consoleShortcutLine}</span>
            <input value={line} placeholder="git log --oneline -20" onChange={(event) => { setLine(event.target.value); setError(""); }}
              readOnly={editing !== null} autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={MAX_LINE_LENGTH} />
          </label>
        )}
        <button type="submit" className="console-shortcuts__submit" disabled={checking}><span aria-hidden="true">↵ </span>{editing ? t.consoleShortcutSave : t.consoleShortcutAdd}</button>
        {editing && <button type="button" className="console-shortcuts__action" onClick={cancelRename}>{t.consoleShortcutCancel}</button>}
      </form>
      {checking && <p className="console-shortcuts__status" role="status">{t.consoleShortcutChecking}</p>}
      {error && <p className="console-shortcuts__error" role="alert">{error}</p>}
      <ul className="console-shortcuts__list">
        {shortcuts.map((shortcut) => (
          <li key={shortcut.name} className={shortcut.name === editing ? "console-shortcuts__row console-shortcuts__row--editing" : "console-shortcuts__row"}>
            <span className="console-shortcuts__line">
              <span className="console-shortcuts__name">{shortcut.name}</span>
              <span className="console-shortcuts__target">{shortcutLabel(shortcut, t)}</span>
            </span>
            <code className="console-shortcuts__command" title={shortcutCommand(shortcut, host)}>{shortcutCommand(shortcut, host)}</code>
            <span className="console-shortcuts__actions">
              <button type="button" className="console-shortcuts__action" onClick={() => startRename(shortcut)}>{t.consoleShortcutRename}</button>
              <button type="button" className="console-shortcuts__action console-shortcuts__action--remove" onClick={() => persist(shortcuts.filter((item) => item.name !== shortcut.name))} aria-label={`${t.consoleShortcutRemove}: ${shortcut.name}`} title={t.consoleShortcutRemove}><X aria-hidden="true" /></button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The query a shortcut runs, chosen the way a terminal program cycles a value:
 * `‹ Project status ›`, stepped with the arrow keys or the arrows. A native
 * select would open the platform's own menu in the middle of the terminal.
 * It is a spinbutton whose value is announced as the query's name.
 */
function QueryPicker({ value, onChange, disabled, label, previous, next }: {
  value: ShortcutTarget;
  onChange: (value: ShortcutTarget) => void;
  disabled: boolean;
  label: string;
  previous: string;
  next: string;
}): React.JSX.Element {
  const { t } = useLanguage();
  const index = SHORTCUT_TARGETS.indexOf(value);
  const step = (offset: number): void => {
    if (!disabled) onChange(SHORTCUT_TARGETS[(index + offset + SHORTCUT_TARGETS.length) % SHORTCUT_TARGETS.length]);
  };
  return (
    <span
      className={`console-picker${disabled ? " console-picker--disabled" : ""}`}
      role="spinbutton"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={SHORTCUT_TARGETS.length}
      aria-valuenow={index + 1}
      aria-valuetext={outputLabel(value, t)}
      aria-disabled={disabled || undefined}
      onKeyDown={(event) => {
        const moves: Record<string, () => void> = {
          ArrowLeft: () => step(-1), ArrowDown: () => step(-1), ArrowRight: () => step(1), ArrowUp: () => step(1),
          Home: () => { if (!disabled) onChange(SHORTCUT_TARGETS[0]); },
          End: () => { if (!disabled) onChange(SHORTCUT_TARGETS[SHORTCUT_TARGETS.length - 1]); },
          // Enter adds the shortcut, as it does from the name field.
          Enter: () => event.currentTarget.closest("form")?.requestSubmit(),
        };
        const move = moves[event.key];
        if (!move) return;
        event.preventDefault();
        move();
      }}
    >
      <button type="button" className="console-picker__step" tabIndex={-1} aria-label={previous} onClick={() => step(-1)} disabled={disabled}>‹</button>
      <span className="console-picker__value">{outputLabel(value, t)}</span>
      <button type="button" className="console-picker__step" tabIndex={-1} aria-label={next} onClick={() => step(1)} disabled={disabled}>›</button>
    </span>
  );
}

function blockState(entry: Entry): BlockState {
  if (entry.running) return "running";
  if (entry.error || (entry.result && !entry.result.success)) return "failed";
  if (entry.result?.truncated) return "truncated";
  if (entry.result) return "success";
  return "note";
}

function Output({ text, segments }: { text: string; segments: OutputSegment[] | null }): React.JSX.Element {
  return (
    <pre className="console-block__text">
      {segments ? segments.map((segment, index) => segment.tone === "plain"
        ? <Fragment key={index}>{segment.text}</Fragment>
        : <span key={index} className={`console-tone console-tone--${segment.tone}`}>{segment.text}</span>) : text}
    </pre>
  );
}

/** A welcome value not known yet, or not readable: kept as a row so nothing shifts. */
const WELCOME_UNKNOWN = <span className="console-welcome__unknown">—</span>;

type WelcomeRow = [icon: React.JSX.Element, key: string, value: React.ReactNode] | null;

/** One framed group of the fetch-style welcome, drawn in its own theme colour. */
function WelcomeSection({ title, tone, rows }: { title: string; tone: "project" | "environment"; rows: WelcomeRow[] }): React.JSX.Element {
  return (
    <section className={`console-welcome__section console-welcome__section--${tone}`} aria-label={title}>
      <h2 className="console-welcome__section-title">{title}</h2>
      <dl>
        {rows.filter((row): row is NonNullable<WelcomeRow> => row !== null).map(([icon, key, value]) => (
          <div className="console-welcome__row" key={key}>
            <dt><span className="console-welcome__icon" aria-hidden="true">{icon}</span>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The theme actually drawn: "system" resolves to the official light or dark one. */
function activeThemeName(theme: ThemePreference): string {
  if (theme !== "system") return themeById(theme).name;
  const dark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return themeById(dark ? "gitodile-dark" : "gitodile-light").name;
}

/** The context line a Starship-style prompt prints above each command: where it ran. */
function PromptContext({ projectName, branch, on }: { projectName: string; branch: string | null; on: string }): React.JSX.Element {
  return (
    <div className="console-context" aria-hidden="true">
      <span className="console-context__project">{projectName}</span>
      {branch && <> <span className="console-context__on">{on}</span> <span className="console-context__branch"><GitBranch />{branch}</span></>}
    </div>
  );
}

/** The answers that run a change; anything else, an empty line included, cancels. */
const YES = /^(s|si|sí|y|yes)$/i;

/** The app search as Console shows it: the composition root owns the query,
 * the selection and the results; this field owns the focus and the keyboard
 * while the screen is active, and is the panel's anchor. */
export type ConsoleCommandPalette = {
  isOpen: boolean;
  query: string;
  selectedOptionId?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** The keycap the field prints, spelled by the composition root. */
  shortcut: string;
  onOpen: () => void;
  onQueryChange: (query: string) => void;
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
};

export function ConsoleScreen({ projectPath, projectName, branch, sessionEpoch, sessionStore, historySource, gitVersion = null, projectStatus = null, preferences = DEFAULT_CONSOLE_PREFERENCES, theme = "system", confirmChanges = true, runHooks = true, onRepositoryChanged, onOpenSettings, commandPalette }: {
  projectPath: string;
  projectName: string;
  branch: string | null;
  sessionEpoch: string;
  sessionStore?: ConsoleSessionStore;
  /** The app's cached history: its short ids become the mascot's rain. */
  historySource?: ConsoleHistorySource;
  gitVersion?: string | null;
  /** The shell's project facts; the app status bar steps aside for this line. */
  projectStatus?: ConsoleProjectStatus | null;
  preferences?: ConsolePreferences;
  /** The theme preference, named in the welcome. */
  theme?: ThemePreference;
  /** Rust's change-confirmation setting, shown in the status line and welcome. */
  confirmChanges?: boolean;
  /** The Settings switch for the project's hooks, passed with every plan. */
  runHooks?: boolean;
  /** A change ran: the rest of the app refreshes as after a guided action. */
  onRepositoryChanged?: () => void;
  /** Opens Settings at the Console section: the `settings` word and the gear. */
  onOpenSettings?: () => void;
  /** The app search: the status line's field, and the palette's anchor. */
  commandPalette?: ConsoleCommandPalette;
}): React.JSX.Element {
  const { t } = useLanguage();
  const lifecycle = useScreenLifecycle();
  const [shortcuts, setShortcuts] = useState(() => readShortcuts());
  const [localSessionStore] = useState(createConsoleSessionStore);
  const session = useConsoleSession(sessionStore ?? localSessionStore, projectPath, sessionEpoch, lifecycle === "active");
  const { entries, history, input, host, running, pending } = session.snapshot;
  const { setEntries, setHistory, setInput, setHost, setRunning, setPending, nextId, currentRequest, hostRequested } = session;
  /**
   * The project's provider, for the welcome and the hosting shortcuts. Read
   * once per project session, after first paint: the session outlives the
   * screen, so showing it again never reads it again. A hosting shortcut's
   * answer brings a fresh one.
   */
  useEffect(() => {
    if (!sessionEpoch || hostRequested.current) return;
    const read = (): void => {
      if (hostRequested.current) return;
      hostRequested.current = true;
      consolePort.readHost({ projectId: projectPath, sessionEpoch })
        .then(setHost)
        .catch(() => { hostRequested.current = false; });
    };
    const idle = "requestIdleCallback" in window;
    const handle = idle ? window.requestIdleCallback(read, { timeout: 2000 }) : window.setTimeout(read, 500);
    return () => {
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [projectPath, sessionEpoch, setHost, hostRequested]);
  const [managerOpen, setManagerOpen] = useState(false);
  const [caret, setCaret] = useState<number | null>(0);
  // Clearing a nonempty transcript brings the drawing back up. The initial
  // welcome is already in place and must not animate merely on navigation.
  const [welcomeEntrance, setWelcomeEntrance] = useState(false);
  const historyQuery = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const rainHashes = useRainHashes(historySource, historyQuery, lifecycle === "active");
  // The first entry sends the welcome's drawing to the corner, and clearing
  // brings it back: one drawing that moves, not one that vanishes and another
  // that appears. The flight replaces both drawings' own entrance.
  const [flight, setFlight] = useState<MascotFlight | null>(null);
  const welcomeRef = useRef<HTMLDivElement>(null);
  const watermarkRef = useRef<HTMLDivElement>(null);
  const takeOff = (to: MascotFlight["to"]): void => {
    if (!preferences.welcome || lifecycle !== "active" || isReducedMotionRequested()) return;
    const host = (to === "watermark" ? welcomeRef : watermarkRef).current;
    // Without the Web Animations API the drawings keep their own entrance.
    if (typeof host?.animate !== "function") return;
    const from = host.querySelector(".console-art")?.getBoundingClientRect();
    if (from && from.width > 0) setFlight({ from, opacity: Number(getComputedStyle(host).opacity), to });
  };
  useLayoutEffect(() => {
    if (!flight) return;
    setFlight(null);
    const host = (flight.to === "watermark" ? watermarkRef : welcomeRef).current;
    const art = host?.querySelector<HTMLElement>(".console-art");
    const end = art?.getBoundingClientRect();
    if (!host || !art || !end?.width || typeof art.animate !== "function") return;
    const { from } = flight;
    // The arrival curve, read from its token so the flight never drifts from it.
    const easing = getComputedStyle(document.documentElement).getPropertyValue("--ease-emphasized").trim() || "ease-out";
    const timing = { duration: MASCOT_FLIGHT_MS, easing };
    const start = `translate(${from.left - end.left}px, ${from.top - end.top}px) scale(${from.width / end.width})`;
    if (flight.to === "watermark") {
      art.animate([{ transformOrigin: "0 0", transform: start }, { transformOrigin: "0 0", transform: "none" }], timing);
      host.animate([{ opacity: flight.opacity }, { opacity: getComputedStyle(host).opacity }], timing);
      // The rain shows once the drawing has landed, not stretched in flight,
      // and ends on its own resting opacity so nothing jumps afterwards.
      const rain = art.querySelector<HTMLElement>(".console-art__rain");
      rain?.animate([{ opacity: 0 }, { opacity: 0, offset: .6 }, { opacity: getComputedStyle(rain).opacity }], { duration: MASCOT_FLIGHT_MS * 1.6 });
    } else {
      art.animate([{ transformOrigin: "0 0", transform: start, opacity: flight.opacity }, { transformOrigin: "0 0", transform: "none", opacity: 1 }], timing);
      for (const company of host.parentElement?.querySelectorAll(".console-welcome__info, .console-welcome__tip") ?? []) {
        company.animate([{ opacity: 0 }, { opacity: 0, offset: .5 }, { opacity: 1 }], timing);
      }
    }
  }, [flight]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuNavigated, setMenuNavigated] = useState(false);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLFormElement>(null);
  const managerButtonRef = useRef<HTMLButtonElement>(null);
  const copiedTimer = useRef<number | undefined>(undefined);
  // A remounted screen may inherit a still-running command. Its original
  // component's completion ref no longer belongs to the visible prompt.
  const refocusPrompt = useRef(running);
  const menuId = useId();
  /* The shared auto-hiding scrollbar also shows while anything inside has
     focus-visible, and the prompt always does here. A terminal shows it while
     you scroll or move over the output and lets it fade a moment after, so the
     console drives the class itself, without re-rendering. */
  const scrollbarTimer = useRef<number | undefined>(undefined);
  const scrollbarActivity = useMemo(() => {
    const wake = (element: HTMLElement): void => {
      setAutoHideScrollbarActive(element, true);
      window.clearTimeout(scrollbarTimer.current);
      scrollbarTimer.current = window.setTimeout(() => setAutoHideScrollbarActive(element, false), SCROLLBAR_IDLE_MS);
    };
    const sleep = (element: HTMLElement): void => {
      window.clearTimeout(scrollbarTimer.current);
      setAutoHideScrollbarActive(element, false);
    };
    return {
      onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => { if (event.pointerType !== "touch") wake(event.currentTarget); },
      onScroll: (event: React.UIEvent<HTMLDivElement>) => wake(event.currentTarget),
      onPointerLeave: (event: React.PointerEvent<HTMLDivElement>) => sleep(event.currentTarget),
    };
  }, []);

  useEffect(() => () => { window.clearTimeout(copiedTimer.current); }, []);
  // A terminal takes typing as soon as it is shown: no click to reach the prompt.
  useEffect(() => {
    if (lifecycle === "active") inputRef.current?.focus({ preventScroll: true });
  }, [lifecycle]);
  // The prompt is disabled while a query runs; focus it once it is enabled again.
  useEffect(() => {
    if (running || !refocusPrompt.current) return;
    refocusPrompt.current = false;
    if (lifecycle === "active") inputRef.current?.focus();
  }, [running, lifecycle]);
  // The shortcut pane takes height from the transcript: keep its end, and so
  // the prompt, in view whenever the pane opens or closes.
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [managerOpen]);
  useEffect(() => () => window.clearTimeout(scrollbarTimer.current), []);
  // Follow the end of the transcript, as a terminal does, so the prompt for
  // the next command is always in view; earlier output is a scroll up.
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (lifecycle === "active" && transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [entries, lifecycle]);

  // Colouring is spent newest first across the whole transcript, so the screen
  // stays inside its element budget however many long outputs pile up; older
  // output that no longer fits is shown as the plain text it always is.
  const toneCache = useRef(new WeakMap<ConsoleOutput, OutputSegment[] | null>());
  const tones = useMemo(() => {
    const allotted = new Map<number, OutputSegment[] | null>();
    let left = TRANSCRIPT_TONE_BUDGET;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const result = entries[index].result;
      if (!result?.stdout) continue;
      if (!toneCache.current.has(result)) toneCache.current.set(result, highlightOutput(entries[index].shape ?? "plain", result.stdout));
      const segments = toneCache.current.get(result) ?? null;
      const cost = segments ? segments.filter((segment) => segment.tone !== "plain").length : 0;
      if (segments && cost <= left) {
        left -= cost;
        allotted.set(entries[index].id, segments);
      } else {
        allotted.set(entries[index].id, null);
      }
    }
    return allotted;
  }, [entries]);

  const describe = (completion: ConsoleCompletion): string => {
    if (completion.kind === "git") return t.consoleGitCommands[completion.command];
    if (completion.kind === "control") return { help: t.consoleControlHelp, clear: t.consoleControlClear, shortcuts: t.consoleControlShortcuts, settings: t.consoleControlSettings }[completion.name];
    return isLineShortcut(completion.shortcut) ? completion.shortcut.line : outputLabel(completion.shortcut.operationId, t);
  };
  const completions = preferences.autocomplete && !pending ? completionsFor(input, shortcuts) : [];
  const menuOpen = completions.length > 0 && !menuDismissed && historyIndex === null && !running;
  const activeIndex = Math.min(menuIndex, completions.length - 1);
  const activeCompletion = menuOpen ? completions[activeIndex] : undefined;
  const ghost = activeCompletion ? activeCompletion.name.slice(input.length) : "";

  // The menu grows below the prompt, at the end of the transcript.
  useEffect(() => {
    if (menuOpen) promptRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [menuOpen, completions.length]);

  const editInput = (value: string): void => {
    setInput(value);
    setCaret(value.length);
    setMenuIndex(0);
    setMenuNavigated(false);
    setMenuDismissed(false);
  };
  const append = (entry: Omit<Entry, "branch">): void => {
    if (entries.length === 0) takeOff("watermark");
    setEntries((prior) => [...prior.slice(-(TRANSCRIPT_LIMIT - 1)), { ...entry, branch }]);
  };
  // Focus goes back to whatever opened the pane: the status line's icon, or the prompt that typed `shortcuts`.
  const managerOpener = useRef<"button" | "prompt">("button");
  const openManager = (opener: "button" | "prompt"): void => { managerOpener.current = opener; setManagerOpen(true); };
  const closeManager = (): void => {
    setManagerOpen(false);
    if (managerOpener.current === "prompt") inputRef.current?.focus();
    else managerButtonRef.current?.focus();
  };

  const runQuery = async (label: string, operationId: ConsoleQueryId): Promise<void> => {
    if (running || lifecycle !== "active") return;
    const id = ++nextId.current;
    const request = ++currentRequest.current;
    append({ id, kind: "query", input: label, operationId, shape: queryShape(operationId), running: true });
    setRunning(true);
    const started = performance.now();
    try {
      if (isHostingId(operationId)) {
        const result = await consolePort.runHosting({ projectId: projectPath, sessionEpoch, operationId });
        if (request !== currentRequest.current) return;
        setHost(result.host);
        const durationMs = performance.now() - started;
        const note = result.unavailable ? t.consoleHostingUnavailable(result.unavailable, result.host) : undefined;
        const command = result.command ?? undefined;
        // Signed out, gh or glab still answered, so its own words stay with
        // the hint; otherwise nothing ran and the reason is the whole answer.
        const ran = result.unavailable === null || result.unavailable === "signed_out";
        const { stdout, stderr, exitCode, success, truncated } = result;
        patchEntry(id, ran
          ? { command, result: { command: command ?? "", stdout, stderr, exitCode, success, truncated }, failure: note, running: false, durationMs }
          : { command, error: note, running: false, durationMs });
        return;
      }
      const result = await consolePort.run({ projectId: projectPath, sessionEpoch, operationId });
      if (request !== currentRequest.current) return;
      const durationMs = performance.now() - started;
      setEntries((prior) => prior.map((entry) => entry.id === id ? { ...entry, command: result.command, result, running: false, durationMs } : entry));
    } catch (error) {
      if (request !== currentRequest.current) return;
      setEntries((prior) => prior.map((entry) => entry.id === id ? { ...entry, error: localizeAppError(error, t, t.consoleRequestFailed), running: false } : entry));
    } finally {
      if (request === currentRequest.current) { refocusPrompt.current = true; setRunning(false); }
    }
  };

  /**
   * Plans the line in Rust and, when the plan may run, runs it in the same
   * gesture: a read needs no confirmation. A refusal is printed, not thrown.
   */
  const runLine = async (label: string, line: string, ceiling?: ConsoleTier): Promise<void> => {
    if (running || lifecycle !== "active") return;
    const id = ++nextId.current;
    const request = ++currentRequest.current;
    append({ id, kind: "query", input: label, line, ceiling, running: true });
    setRunning(true);
    const settle = (patch: Partial<Entry>): void => patchEntry(id, { ...patch, running: false });
    const started = performance.now();
    try {
      const plan = await consolePort.plan({ projectId: projectPath, sessionEpoch, line, runHooks });
      if (request !== currentRequest.current) return;
      if (!plan.planId || plan.refusal) { settle({ refusal: refusalText(plan, t) }); return; }
      if (ceiling && plan.tier && widensTier(ceiling, plan.tier)) { settle({ refusal: t.consoleShortcutWidened(label) }); return; }
      if (plan.confirmation === "yes_no") {
        // A change prints its plan and waits: the prompt now answers it.
        settle({ command: plan.command ?? undefined, plan, awaiting: true });
        setPending({ id, planId: plan.planId });
        return;
      }
      if (plan.tier !== "read") {
        // Confirmations are off: the plan is printed and runs at once.
        patchEntry(id, { command: plan.command ?? undefined, plan });
        await applyChange(id, plan.planId, "", request, started);
        return;
      }
      const result = await consolePort.runPlan({ projectId: projectPath, sessionEpoch, planId: plan.planId });
      if (request !== currentRequest.current) return;
      settle({ command: result.command, result, shape: result.shape, durationMs: performance.now() - started });
    } catch (error) {
      if (request !== currentRequest.current) return;
      settle({ error: localizeAppError(error, t, t.consoleRequestFailed) });
    } finally {
      if (request === currentRequest.current) { refocusPrompt.current = true; setRunning(false); }
    }
  };

  const patchEntry = (id: number, patch: Partial<Entry>): void =>
    setEntries((prior) => prior.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));

  /** Answers the pending plan's `[s/N]`: only yes runs it, and Rust checks it again. */
  const answer = async (raw: string): Promise<void> => {
    if (!pending || running) return;
    const { id, planId } = pending;
    const reply = raw.trim();
    setPending(null);
    editInput("");
    if (!YES.test(reply)) {
      patchEntry(id, { awaiting: false, answer: reply, cancelled: true });
      return;
    }
    const request = ++currentRequest.current;
    patchEntry(id, { awaiting: false, answer: reply, running: true });
    setRunning(true);
    try {
      await applyChange(id, planId, reply, request, performance.now());
    } finally {
      if (request === currentRequest.current) { refocusPrompt.current = true; setRunning(false); }
    }
  };

  /** Runs a change plan; the caller owns the running state and focus. */
  const applyChange = async (id: number, planId: string, reply: string, request: number, started: number): Promise<void> => {
    try {
      const result = await consolePort.runChange({ projectId: projectPath, sessionEpoch, planId, answer: reply });
      if (request !== currentRequest.current) return;
      patchEntry(id, {
        command: result.command, result, shape: result.shape, running: false, durationMs: performance.now() - started,
        failure: result.failure ? t.consoleRunFailures[result.failure] : undefined,
      });
      onRepositoryChanged?.();
    } catch (error) {
      if (request !== currentRequest.current) return;
      patchEntry(id, { running: false, error: localizeAppError(error, t, t.consoleRequestFailed) });
    }
  };

  const validateLine = async (line: string): Promise<LineVerdict> => {
    try {
      const plan = await consolePort.plan({ projectId: projectPath, sessionEpoch, line, runHooks });
      return plan.planId && plan.tier && !plan.refusal ? { tier: plan.tier } : { error: refusalText(plan, t) };
    } catch (error) {
      return { error: localizeAppError(error, t, t.consoleRequestFailed) };
    }
  };

  const submit = async (raw: string): Promise<void> => {
    if (running || lifecycle !== "active") return;
    if (pending) { await answer(raw); return; }
    const parsed = parseConsoleInput(raw, shortcuts);
    if (parsed.kind === "empty") return;
    editInput("");
    setHistoryIndex(null);
    setHistory((prior) => [...prior.slice(-39), raw.trim()]);
    if (parsed.kind === "clear") { clearTranscript(); return; }
    if (parsed.kind === "shortcuts") { openManager("prompt"); return; }
    if (parsed.kind === "settings") { onOpenSettings?.(); return; }
    if (parsed.kind === "help") { append({ id: ++nextId.current, kind: "help", input: "help" }); return; }
    if (parsed.kind === "help-git") { append({ id: ++nextId.current, kind: "help-git", input: raw.trim() }); return; }
    if (parsed.kind === "unknown") { append({ id: ++nextId.current, kind: "message", input: raw.trim(), message: t.consoleUnknown(parsed.input) }); return; }
    if (parsed.kind === "git") { await runLine(parsed.line, parsed.line); return; }
    const { shortcut } = parsed;
    if (isLineShortcut(shortcut)) await runLine(shortcut.name, shortcut.line, shortcut.tier);
    else await runQuery(shortcut.name, shortcut.operationId);
  };

  const copy = async (entry: Entry): Promise<void> => {
    const text = [entry.result?.stdout, entry.result?.stderr].filter(Boolean).join("\n");
    try {
      if (!await copyTextToClipboard(text)) return;
    } catch {
      return;
    }
    setCopiedId(entry.id);
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopiedId(null), 1500);
  };

  const recall = (index: number | null): void => {
    const value = index === null ? "" : history[index] ?? "";
    setHistoryIndex(index);
    setInput(value);
    setCaret(value.length);
  };

  /** Clearing forgets an unanswered plan too; it can never run later. */
  const clearTranscript = (): void => {
    if (entries.length > 0) { setWelcomeEntrance(true); takeOff("welcome"); }
    setEntries([]);
    setPending(null);
  };

  const onPromptKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    const field = event.currentTarget;
    if (pending) {
      // Escape and Ctrl+C answer no, as a terminal's interrupt would.
      if (event.key === "Escape" || (event.ctrlKey && event.key.toLowerCase() === "c" && field.selectionStart === field.selectionEnd)) {
        event.preventDefault();
        event.stopPropagation();
        void answer("");
      }
      return;
    }
    if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "c" && field.selectionStart === field.selectionEnd && input) {
      event.preventDefault();
      editInput("");
      setHistoryIndex(null);
      return;
    }
    if (event.key === "Tab" && !event.shiftKey && activeCompletion) {
      event.preventDefault();
      editInput(activeCompletion.name);
      return;
    }
    if (event.key === "Enter" && activeCompletion && menuNavigated) {
      event.preventDefault();
      void submit(activeCompletion.name);
      return;
    }
    if (event.key === "Escape" && (menuOpen || input)) {
      event.preventDefault();
      event.stopPropagation();
      if (menuOpen) setMenuDismissed(true);
      else { editInput(""); setHistoryIndex(null); }
      return;
    }
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && menuOpen) {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setMenuIndex((activeIndex + step + completions.length) % completions.length);
      setMenuNavigated(true);
      return;
    }
    if (event.key === "ArrowUp" && history.length) { event.preventDefault(); recall(historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1)); }
    if (event.key === "ArrowDown" && historyIndex !== null) { event.preventDefault(); const next = historyIndex + 1; recall(next < history.length ? next : null); }
  };
  const trackCaret = (field: HTMLInputElement): void => setCaret(field.selectionStart === field.selectionEnd ? field.selectionStart : null);

  const latest = entries.at(-1);
  return (
    <div className="console-screen">
      <section className={`console-panel console-panel--text-${preferences.textSize}${preferences.cursorBlink ? "" : " console-panel--steady-cursor"}`} aria-label={t.consoleTitle} onKeyDown={(event) => {
        if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "l") { event.preventDefault(); clearTranscript(); }
      }}>
        <h1 className="visually-hidden">{t.consoleTitle}</h1>
        <div className="console-panel__body">
        {preferences.welcome && entries.length > 0 && <div ref={watermarkRef} className="console-watermark" data-scheme={theme === "system" ? undefined : themeById(theme).scheme}>
          <ConsoleMascot active={lifecycle === "active"} watermark entrance={flight === null} hashes={rainHashes} nudge={latest?.id} />
        </div>}
        <div ref={transcriptRef} className="console-panel__transcript auto-hide-scrollbar" {...scrollbarActivity} onMouseUp={(event) => {
          // A terminal takes typing wherever it is clicked, unless text is being selected.
          const target = event.target as HTMLElement;
          if (!target.closest("button, a, input, [role='option']") && !window.getSelection()?.toString()) inputRef.current?.focus();
        }}>
          <div className="console-panel__log" role="log" aria-label={t.consoleTitle} aria-live="off">
            {entries.length === 0 && (
              <div className="console-welcome">
                {preferences.welcome && <div ref={welcomeRef} className="console-welcome__fetch">
                  <ConsoleMascot active={lifecycle === "active"} entrance={welcomeEntrance && flight === null} hashes={rainHashes} />
                  <div className="console-welcome__info">
                    <WelcomeSection title={t.consoleWelcomeProjectSection} tone="project" rows={[
                      [<Folder key="i" />, t.consoleWelcomeProject, projectName],
                      branch ? [<GitBranch key="i" />, t.consoleWelcomeBranch, branch] : null,
                      // Rows that wait on a reading are always drawn, with a dash
                      // while it is unknown, so the summary keeps its height and
                      // nothing under it moves when a reading comes or goes.
                      [<Diff key="i" />, t.consoleWelcomeChanges, projectStatus?.changes == null ? WELCOME_UNKNOWN
                        : projectStatus.changes === 0 ? t.consoleStatusSaved : <>
                          {t.consoleStatusUnsaved(projectStatus.changes)}
                          {projectStatus.linesAdded > 0 && <span className="console-welcome__added"> +{projectStatus.linesAdded}</span>}
                          {projectStatus.linesRemoved > 0 && <span className="console-welcome__removed"> −{projectStatus.linesRemoved}</span>}
                        </>],
                      [<CloudUpload key="i" />, t.consoleWelcomePublish, projectStatus?.unpublished == null ? WELCOME_UNKNOWN : <>
                        {projectStatus.unpublished > 0 ? t.consoleWelcomeUnpublished(projectStatus.unpublished) : t.consoleWelcomeUpToDate}
                        {projectStatus.incoming ? <span className="console-welcome__incoming"> · {t.consoleStatusIncoming(projectStatus.incoming)}</span> : null}
                      </>],
                    ]} />
                    <WelcomeSection title={t.consoleWelcomeEnvironmentSection} tone="environment" rows={[
                      [<SquareTerminal key="i" />, "gitodile", __APP_VERSION__],
                      gitVersion ? [<GitCommitHorizontal key="i" />, t.consoleWelcomeGit, gitVersion] : null,
                      [<Palette key="i" />, t.consoleWelcomeTheme, activeThemeName(theme)],
                      [<Server key="i" />, t.consoleWelcomeProvider, host ? t.consoleProvider(host) : WELCOME_UNKNOWN],
                      [<ShieldCheck key="i" />, t.consoleWelcomeConfirm, confirmChanges ? t.consoleWelcomeConfirmOn : <span className="console-welcome__unconfirmed">{t.consoleWelcomeConfirmOff}</span>],
                    ]} />
                    <span className="console-welcome__palette" aria-hidden="true">{WELCOME_PALETTE.map((tone) => <span key={tone} className={`console-welcome__dot console-welcome__dot--${tone}`} />)}</span>
                  </div>
                </div>}
                <p className="console-welcome__tip">{t.consoleEmpty}</p>
              </div>
            )}
            {entries.map((entry) => {
              const state = blockState(entry);
              const hasOutput = Boolean(entry.result?.stdout || entry.result?.stderr);
              const operationId = entry.operationId;
              const rerun = entry.line !== undefined
                ? () => void runLine(entry.input, entry.line ?? "", entry.ceiling)
                : operationId ? () => void runQuery(entry.input, operationId) : null;
              return (
                <article className={`console-block console-block--${state}`} key={entry.id} aria-busy={entry.running ? true : undefined}>
                  <PromptContext projectName={projectName} branch={entry.branch} on={t.consolePromptOn} />
                  <header className="console-block__head">
                    <span className="console-block__chevron" aria-hidden="true">❯</span>
                    <span className="console-block__input">{entry.input}</span>
                    <span className="console-block__meta">
                      {entry.result?.truncated && <span className="console-block__flag">{t.consoleTruncatedShort}</span>}
                      {state !== "note" && <span className="console-block__state" aria-hidden="true">{{ running: "", success: "✓", failed: "✗", truncated: "!" }[state]}</span>}
                      {state !== "note" && <span className="visually-hidden">{{ running: t.consoleRunning, success: t.consoleSucceeded, failed: t.consoleFailed(entry.result?.exitCode ?? null), truncated: t.consoleTruncated }[state]}</span>}
                      {entry.durationMs !== undefined && <span>{t.consoleDuration(entry.durationMs)}</span>}
                      {rerun && !entry.running && !entry.awaiting && (
                        <span className="console-block__actions">
                          {hasOutput && <button type="button" className="console-block__action" onClick={() => void copy(entry)} aria-label={copiedId === entry.id ? t.consoleCopied : t.consoleCopy} title={t.consoleCopy}>{copiedId === entry.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button>}
                          <button type="button" className="console-block__action" onClick={rerun} disabled={running} aria-label={`${t.consoleRerun}: ${entry.input}`} title={t.consoleRerun}><RotateCw aria-hidden="true" /></button>
                        </span>
                      )}
                    </span>
                  </header>
                  {entry.command && <code className="console-block__command">{entry.command}</code>}
                  <div className="console-block__body">
                    {entry.plan && (
                      <div className="console-plan">
                        {entry.plan.effect && <p className="console-plan__effect">{t.consoleEffects[entry.plan.effect]}</p>}
                        {entry.plan.facts.length > 0 && (
                          <ul className="console-plan__facts">
                            {entry.plan.facts.map((fact, index) => <li key={index}>{t.consolePlanFact(fact)}</li>)}
                          </ul>
                        )}
                        {entry.answer !== undefined && <p className="console-plan__answer">{t.consoleConfirmQuestion} <span>{entry.answer}</span></p>}
                      </div>
                    )}
                    {entry.cancelled && <p className="console-block__note">{t.consoleCancelled}</p>}
                    {entry.running && <p className="console-block__note">{t.consoleRunning}</p>}
                    {entry.kind === "help" && (
                      <table className="console-help">
                        <caption>{t.consoleHelpIntro}</caption>
                        <thead><tr><th scope="col">{t.consoleHelpNames}</th><th scope="col">{t.consoleHelpMeaning}</th><th scope="col">{t.consoleHelpCommand}</th></tr></thead>
                        <tbody>
                          {namesByOperation(shortcuts).map((group) => (
                            <tr key={group.operationId}>
                              <td>{group.names.map((name) => <code key={name}>{name}</code>)}</td>
                              <td>{outputLabel(group.operationId, t)}</td>
                              <td className="console-help__line">{queryCommand(group.operationId, host?.kind ?? null)}</td>
                            </tr>
                          ))}
                          {shortcuts.filter(isLineShortcut).map((shortcut) => (
                            <tr key={shortcut.name}>
                              <td><code>{shortcut.name}</code></td>
                              <td>{shortcutLabel(shortcut, t)}</td>
                              <td className="console-help__line">{shortcut.line}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr><td colSpan={3}>{t.consoleHelpActions}</td></tr></tfoot>
                      </table>
                    )}
                    {entry.kind === "help-git" && (
                      <table className="console-help">
                        <caption>{t.consoleHelpGitIntro}</caption>
                        <thead><tr><th scope="col">{t.consoleHelpGitCommand}</th><th scope="col">{t.consoleHelpMeaning}</th></tr></thead>
                        <tbody>{GIT_READ_COMMANDS.map((command) => (
                          <tr key={command}><td><code>git {command}</code></td><td>{t.consoleGitCommands[command]}</td></tr>
                        ))}</tbody>
                        <tfoot><tr><td colSpan={2}>{t.consoleHelpGitFooter}</td></tr></tfoot>
                      </table>
                    )}
                    {entry.message && <pre className="console-block__text console-block__message">{entry.message}</pre>}
                    {entry.refusal && <p className="console-block__error">{entry.refusal}</p>}
                    {entry.error && <p className="console-block__error" role="alert">{entry.error}</p>}
                    {entry.result && <>
                      {!entry.result.success && <p className="console-block__error">{t.consoleFailed(entry.result.exitCode)}</p>}
                      {entry.result.stdout && <Output text={entry.result.stdout} segments={tones.get(entry.id) ?? null} />}
                      {entry.result.stderr && <pre className="console-block__text console-block__stderr">{entry.result.stderr}</pre>}
                      {!hasOutput && <p className="console-block__note">{t.consoleNoOutput}</p>}
                      {entry.result.truncated && <p className="console-block__warning">{t.consoleTruncated}</p>}
                      {entry.failure && <p className="console-block__warning">{entry.failure}</p>}
                    </>}
                  </div>
                </article>
              );
            })}
          </div>
          <form ref={promptRef} className={`console-prompt${running ? " console-prompt--busy" : ""}`} onSubmit={(event) => { event.preventDefault(); void submit(input); }}>
            {!pending && <PromptContext projectName={projectName} branch={branch} on={t.consolePromptOn} />}
            <label className="console-prompt__field">
              {pending
                ? <span className="console-prompt__question" aria-hidden="true">{t.consoleConfirmQuestion}</span>
                : <span className="console-prompt__chevron" aria-hidden="true">❯</span>}
              <span className="visually-hidden">{pending ? t.consoleConfirmLabel : t.consolePromptLabel}</span>
              <span className="console-prompt__line">
                <input ref={inputRef} role="combobox" aria-autocomplete="both" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined}
                  aria-activedescendant={menuOpen ? `${menuId}-${activeIndex}` : undefined}
                  data-screen-focus
                  value={input} onChange={(event) => { editInput(event.target.value); setCaret(event.target.selectionStart); setHistoryIndex(null); }}
                  onKeyDown={onPromptKeyDown} onSelect={(event) => trackCaret(event.currentTarget)}
                  autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={MAX_LINE_LENGTH} disabled={running} />
                {ghost && <span className="console-prompt__ghost" aria-hidden="true"><span className="console-prompt__typed">{input}</span>{ghost}</span>}
                {caret !== null && <span className="console-prompt__cursor" aria-hidden="true" style={{ left: `${caret}ch` }} />}
              </span>
            </label>
            {menuOpen && (
              <div className="console-completions">
                <ul id={menuId} role="listbox" aria-label={t.consoleCompletions}>
                  {completions.map((completion, index) => (
                    <li key={completion.name} id={`${menuId}-${index}`} role="option" aria-selected={index === activeIndex}
                      className="console-completions__item" onMouseDown={(event) => event.preventDefault()} onClick={() => { editInput(completion.name); inputRef.current?.focus(); }}>
                      <span className="console-completions__marker" aria-hidden="true">{index === activeIndex ? "❯" : ""}</span>
                      <span className="console-completions__name">{completion.name}</span>
                      <span className="console-completions__label">{describe(completion)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        </div>
        </div>
        <p className="visually-hidden" role="status" aria-live={lifecycle === "active" ? "polite" : "off"}>
          {latest?.running ? t.consoleRunning
            : latest?.awaiting ? `${t.consoleAwaitingAnswer} ${t.consoleConfirmQuestion}`
            : latest?.cancelled ? t.consoleCancelled
            : latest?.result ? (latest.result.success ? t.consoleDone : t.consoleFailed(latest.result.exitCode))
            : latest?.refusal ?? latest?.message ?? ""}
        </p>
        {managerOpen && <ShortcutsManager shortcuts={shortcuts} host={host?.kind ?? null} onChange={setShortcuts} onClose={closeManager} validateLine={validateLine} />}
        <footer className="console-statusline" aria-label={t.consoleStatusLine}>
          {/* The chip and the first half of the prompt's keys lead the line;
              the search holds the middle, and the rest of the keys with the
              actions sit at the right. Splitting the hint around the field is
              what keeps it whole at the window's edge. */}
          <div className="console-statusline__lead">
            {/* One compact state chip: the glyph carries the setting and the
                short word names it, while the full sentence stays for hover and
                the screen reader. The project facts live in the welcome; the
                line leaves its middle to the search. */}
            <span
              className={`console-statusline__state console-statusline__state--${confirmChanges ? "confirm" : "unconfirmed"}`}
              title={confirmChanges ? t.consoleStatusConfirm : t.consoleStatusNoConfirm}
            >
              {confirmChanges ? <ShieldCheck aria-hidden="true" /> : <ShieldOff aria-hidden="true" />}
              <span aria-hidden="true">{confirmChanges ? t.consoleStatusConfirmShort : t.consoleStatusNoConfirmShort}</span>
              <span className="visually-hidden">{confirmChanges ? t.consoleStatusConfirm : t.consoleStatusNoConfirm}</span>
            </span>
            <span className="console-statusline__hint">{t.consoleHintComplete}</span>
          </div>
          {/* The app search, in the terminal's own type: the strip is hidden
              here, so this field is the palette's owner on this screen. It
              sits in the middle track, centred like the strip's. */}
          {commandPalette && (
            <div className="console-statusline__search-slot">
              <div className={`console-statusline__search${commandPalette.isOpen ? " console-statusline__search--open" : ""}`}>
                <Search aria-hidden="true" />
                <input
                  ref={commandPalette.inputRef}
                  className="console-statusline__search-input"
                  type="text"
                  role="combobox"
                  aria-expanded={commandPalette.isOpen}
                  aria-controls={commandPalette.isOpen ? "palette-list" : undefined}
                  aria-activedescendant={commandPalette.isOpen ? commandPalette.selectedOptionId : undefined}
                  aria-autocomplete="list"
                  aria-label={t.consoleSearchLabel}
                  placeholder={t.consoleSearch}
                  autoComplete="off"
                  spellCheck={false}
                  value={commandPalette.query}
                  onChange={(event) => commandPalette.onQueryChange(event.target.value)}
                  onFocus={commandPalette.onOpen}
                  onClick={commandPalette.onOpen}
                  onKeyDown={(event) => {
                    // Ctrl+L clears the transcript for the prompt; a search
                    // field is not the place that gesture belongs.
                    if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "l") {
                      event.stopPropagation();
                    }
                    // Escape leaves the search and gives the keyboard back to
                    // the prompt, so the next command is typed without the mouse.
                    const returnsToPrompt = event.key === "Escape" && commandPalette.isOpen;
                    commandPalette.onKeyDown(event);
                    if (returnsToPrompt) inputRef.current?.focus({ preventScroll: true });
                  }}
                />
                <kbd className="console-statusline__search-kbd" aria-hidden="true">{commandPalette.shortcut}</kbd>
              </div>
            </div>
          )}
          <div className="console-statusline__actions">
            <span className="console-statusline__hint">{t.consoleHintNavigate}</span>
            {onOpenSettings && <button type="button" className="console-statusline__button" aria-label={t.consoleOpenSettings} title={t.consoleOpenSettings} onClick={onOpenSettings}><Settings aria-hidden="true" /></button>}
            <button ref={managerButtonRef} type="button" className="console-statusline__button" aria-expanded={managerOpen} aria-label={t.consoleShortcuts} title={t.consoleShortcuts} onClick={() => (managerOpen ? closeManager() : openManager("button"))}><Keyboard aria-hidden="true" /></button>
          </div>
        </footer>
      </section>
    </div>
  );
}
