import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  Copy,
  GitBranch,
  Split,
  TriangleAlert,
} from "lucide-react";

import { useLanguage, type Translations } from "../../i18n";
import { DiffResultView, type FileDiff } from "../changes";
import { isAppError, localizeAppError } from "../../shared/i18n";
import {
  RefreshIconButton,
  SearchBox,
  TextPlaceholder,
  autoHideScrollbarProps,
  copyTextToClipboard,
  useToast,
} from "../../shared/ui";
import { FileResolution, type ResolutionSlot } from "./FileResolution";
import { useActiveConflictsState } from "./hooks";
import { AbortMergeDialog, FinishMergeDialog } from "./MergeDialogs";
import type { ConflictsController, ConflictsViewMemory } from "./controller";
import {
  filterConflictFiles,
  groupConflictFiles,
  sessionActions,
  sideLimitation,
  sideName,
  type ConflictFile,
  type ConflictSession,
  type ConflictSideName,
  type PausedOperation,
} from "./domain";

type Row =
  | { kind: "group"; key: string; label: string }
  | { kind: "file"; key: string; file: ConflictFile };

const FILE_ROW_HEIGHT = 52;
const GROUP_ROW_HEIGHT = 32;

export type ConflictsScreenProps = {
  controller: ConflictsController;
  projectPath: string;
  sessionEpoch: string;
  onBack: () => void;
  onGoToOverview: () => void;
  /** Another change to this project is running: the file actions wait. */
  isProjectBusy: boolean;
  /** Whether the project's Git hooks run, from Settings. */
  runHooks: boolean;
  /** Opens Publish with its own plan, after a finished merge. */
  onPublish: () => void;
} & ResolutionSlot;

/** The names a reader knows the two sides by. A rebase replays the reader's
 * own versions onto another branch, so its incoming side is "your versions"
 * in the summary but still named by its branch here. */
function sideLabels(operation: PausedOperation, t: Translations): Record<ConflictSideName, string> {
  return {
    current: sideName(operation.current) ?? t.conflictsCurrentFallback,
    incoming: sideName(operation.incoming) ?? t.conflictsIncomingFallback,
  };
}

function operationSummary(operation: PausedOperation, t: Translations): string {
  const names = sideLabels(operation, t);
  switch (operation.kind) {
    case "merge":
      return operation.unsupportedReason === "several-merge-heads"
        ? t.conflictsPausedOctopus(names.current)
        : t.conflictsPausedMerge(names.incoming, names.current);
    case "rebase":
      return t.conflictsPausedRebase(names.current);
    case "cherry-pick":
      return t.conflictsPausedCherryPick(names.current);
    case "revert":
      return t.conflictsPausedRevert(names.current);
    case "am":
      return t.conflictsPausedAm;
    case "unmerged":
      return t.conflictsPausedUnmerged;
  }
}

function shapeLabel(file: ConflictFile, names: Record<ConflictSideName, string>, t: Translations): string {
  switch (file.shape) {
    case "both-changed": return t.conflictsShapeBothChanged;
    case "both-added": return t.conflictsShapeBothAdded;
    case "deleted-by-current": return t.conflictsShapeDeletedBy(names.current);
    case "deleted-by-incoming": return t.conflictsShapeDeletedBy(names.incoming);
    case "deleted-by-both": return t.conflictsShapeDeletedByBoth;
    case "added-by-current": return t.conflictsShapeOnlyOn(names.current);
    case "added-by-incoming": return t.conflictsShapeOnlyOn(names.incoming);
  }
}

const FACET_KEYS = {
  "mode-change": "conflictsFacetModeChange",
  "symbolic-link": "conflictsFacetSymbolicLink",
  submodule: "conflictsFacetSubmodule",
  "type-change": "conflictsFacetTypeChange",
  "file-directory": "conflictsFacetFileDirectory",
  "case-collision": "conflictsFacetCaseCollision",
} as const;

const STATE_KEYS = {
  editedOutside: "conflictsStateEditedOutside",
  stale: "conflictsStateStale",
  unsupported: "conflictsStateUnsupported",
  markedResolved: "conflictsStateResolved",
} as const;

/** One line under the file name: the overlap in plain words, then anything
 * that changes how it can be handled. Never colour alone. */
function fileDescription(file: ConflictFile, names: Record<ConflictSideName, string>, t: Translations): string {
  const parts = [shapeLabel(file, names, t), ...file.facets.map((facet) => t[FACET_KEYS[facet]])];
  if (file.state !== "unresolved") parts.push(t[STATE_KEYS[file.state]]);
  return parts.join(" · ");
}

function splitPath(path: string): { name: string; dir: string | null } {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? { name: path, dir: null } : { name: path.slice(slash + 1), dir: path.slice(0, slash) };
}

export function ConflictsScreen({
  controller,
  projectPath,
  sessionEpoch,
  onBack,
  onGoToOverview,
  isProjectBusy,
  runHooks,
  onPublish,
  ...slot
}: ConflictsScreenProps): React.JSX.Element {
  const { t } = useLanguage();
  const showToast = useToast();
  // The session the dialog was opened on: finishing ends it, and the dialog
  // stays to say so after the screen has nothing paused to show.
  const [ending, setEnding] = useState<{ action: "finish" | "abort"; session: ConflictSession } | null>(null);
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const state = useActiveConflictsState(controller, query);
  const [memory, setMemory] = useState<ConflictsViewMemory>(() => controller.viewMemory(query));
  const [isDetailFocused, setIsDetailFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const update = (patch: Partial<ConflictsViewMemory>): void => {
    setMemory((current) => ({ ...current, ...patch }));
    controller.rememberView(query, patch);
  };

  const session = state.session;
  const names = session ? sideLabels(session.operation, t) : null;
  const visible = useMemo(() => filterConflictFiles(session?.files ?? [], memory.search), [session, memory.search]);
  const rows = useMemo<Row[]>(() => {
    const { open, resolved } = groupConflictFiles(visible);
    const result: Row[] = [];
    if (open.length > 0) {
      result.push({ kind: "group", key: "group:open", label: t.conflictsGroupOpen(open.length) });
      for (const file of open) result.push({ kind: "file", key: `file:${file.path}`, file });
    }
    if (resolved.length > 0) {
      result.push({ kind: "group", key: "group:resolved", label: t.conflictsGroupResolved(resolved.length) });
      for (const file of resolved) result.push({ kind: "file", key: `file:${file.path}`, file });
    }
    return result;
  }, [visible, t]);
  const files = useMemo(
    () => rows.flatMap((row) => (row.kind === "file" ? [row.file] : [])),
    [rows],
  );
  // The remembered file if it is still listed, otherwise the first one: the
  // detail is never empty while there is something to read.
  const selected = files.find((file) => file.path === memory.selectedPath) ?? files[0] ?? null;

  const refresh = (): void => void controller.refresh(query);

  if (session === undefined && !state.error) {
    return <ConflictsLoading t={t} onBack={onBack} />;
  }

  return (
    <div className="conflicts-view" aria-busy={state.isLoading}>
      <h1 className="visually-hidden">{t.conflictsTitle}</h1>
      <header className="conflicts-header">
        <button type="button" className="ghost-button conflicts-header__back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {t.conflictsBack}
        </button>
        <div className="conflicts-header__text">
          <p className="conflicts-header__title" aria-hidden="true">{t.conflictsTitle}</p>
          {session && (
            <p className="conflicts-header__summary">
              <span>{operationSummary(session.operation, t)}</span>
              {session.operation.step && (
                <span>{t.conflictsStep(session.operation.step.current, session.operation.step.total)}</span>
              )}
              <span>
                {session.unresolvedCount > 0
                  ? t.conflictsProgress(session.unresolvedCount, session.files.length)
                  : t.conflictsProgressDone}
              </span>
            </p>
          )}
        </div>
        <RefreshIconButton
          label={t.conflictsRefresh}
          busyLabel={t.conflictsLoading}
          busy={state.isLoading}
          onClick={refresh}
        />
        {session && (
          <SessionEndActions
            session={session}
            isProjectBusy={isProjectBusy}
            onEnd={(action) => setEnding({ action, session })}
            t={t}
          />
        )}
      </header>
      {ending?.action === "finish" && (
        <FinishMergeDialog
          controller={controller}
          query={query}
          session={ending.session}
          runHooks={runHooks}
          slot={slot}
          onClose={() => setEnding(null)}
          onDone={() => {
            setEnding(null);
            onBack();
          }}
          onPublish={onPublish}
          t={t}
        />
      )}
      {ending?.action === "abort" && (
        <AbortMergeDialog
          controller={controller}
          query={query}
          session={ending.session}
          slot={slot}
          onClose={() => setEnding(null)}
          onDone={(plan) => {
            setEnding(null);
            showToast({ message: t.conflictsAbortDone(sideName(plan.current) ?? t.conflictsCurrentFallback) });
            onBack();
          }}
          t={t}
        />
      )}

      {state.error !== null ? (
        <section className="conflicts-notice conflicts-notice--danger" role="alert">
          <CircleAlert aria-hidden="true" />
          <div className="conflicts-notice__body">
            <strong>{t.conflictsErrorTitle}</strong>
            <p>{localizeAppError(state.error, t, t.conflictsErrorTitle)}</p>
          </div>
          <button type="button" className="secondary-button" onClick={refresh}>{t.conflictsTryAgain}</button>
        </section>
      ) : null}

      {session === null ? (
        <div className="conflicts-empty">
          <div className="empty-state empty-state--success">
            <div className="empty-state__icon" aria-hidden="true"><CheckCircle2 /></div>
            <h2>{t.conflictsNothingPausedTitle}</h2>
            <p>{t.conflictsNothingPausedBody}</p>
            <button type="button" className="primary-button" onClick={onGoToOverview}>{t.conflictsGoToOverview}</button>
          </div>
        </div>
      ) : session ? (
        <>
          <SessionNotice session={session} t={t} />
          {!session.listingComplete && (
            <p className="conflicts-partial" role="status">{t.conflictsPartialList(session.files.length)}</p>
          )}
          <div className={`conflicts-layout${isDetailFocused ? " conflicts-layout--detail" : ""}`}>
            <nav className="conflicts-list" aria-label={t.conflictsListAriaLabel}>
              <div className="conflicts-list__toolbar">
                <SearchBox
                  value={memory.search}
                  onChange={(search) => update({ search })}
                  placeholder={t.conflictsSearchPlaceholder}
                  ariaLabel={t.conflictsSearchAriaLabel}
                  clearLabel={t.commonClearSearch}
                />
              </div>
              <FileList
                rows={rows}
                selectedPath={selected?.path ?? null}
                names={names ?? { current: "", incoming: "" }}
                initialScrollTop={memory.scrollTop}
                onScroll={(scrollTop) => controller.rememberView(query, { scrollTop })}
                onSelect={(file) => {
                  update({ selectedPath: file.path });
                  setIsDetailFocused(true);
                }}
                emptyLabel={session.files.length === 0 ? t.conflictsNoFiles : t.conflictsNoMatches}
                t={t}
              />
            </nav>
            {selected && names ? (
              <FileDetail
                key={selected.path}
                controller={controller}
                projectPath={projectPath}
                sessionEpoch={sessionEpoch}
                session={session}
                file={selected}
                names={names}
                isReading={state.isLoading}
                isProjectBusy={isProjectBusy}
                slot={{
                  ...slot,
                  // A change may move the file to the other group, which
                  // must not move the reader to another file.
                  onOperationStart: () => {
                    const started = slot.onOperationStart();
                    if (started) update({ selectedPath: selected.path });
                    return started;
                  },
                }}
                onAnnounce={setAnnouncement}
                onBackToList={() => setIsDetailFocused(false)}
                onReadAgain={refresh}
                t={t}
              />
            ) : (
              <div className="conflicts-detail" />
            )}
          </div>
        </>
      ) : null}
      <p className="visually-hidden" role="status">{announcement}</p>
    </div>
  );
}

function ConflictsLoading({ t, onBack }: { t: Translations; onBack: () => void }): React.JSX.Element {
  return (
    <div className="conflicts-view" aria-busy="true">
      <h1 className="visually-hidden">{t.conflictsTitle}</h1>
      <header className="conflicts-header">
        <button type="button" className="ghost-button conflicts-header__back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {t.conflictsBack}
        </button>
        <div className="conflicts-header__text" role="status" aria-label={t.conflictsLoading}>
          <p className="conflicts-header__title" aria-hidden="true">{t.conflictsTitle}</p>
          <TextPlaceholder width="45%" />
        </div>
      </header>
      <div className="conflicts-layout">
        <div className="conflicts-list">
          <div className="conflicts-list__placeholder">
            <TextPlaceholder width="70%" />
            <TextPlaceholder width="55%" />
            <TextPlaceholder width="62%" />
          </div>
        </div>
        <div className="conflicts-detail" />
      </div>
    </div>
  );
}

/** An operation GitOdile cannot finish, explained once above its files: that
 * nothing is lost, how to continue it with the tool that started it, and the
 * exact commands behind Technical details — never an action of GitOdile's. A
 * merge needs no such card: the header already says what is paused. */
function SessionNotice({ session, t }: { session: ConflictSession; t: Translations }): React.JSX.Element | null {
  const { operation } = session;
  if (operation.supported) return null;
  return (
    <section className="conflicts-notice conflicts-notice--warning">
      <TriangleAlert aria-hidden="true" />
      <div className="conflicts-notice__body">
        <strong>{t.conflictsUnsupportedTitle}</strong>
        <p>{operation.kind === "unmerged" ? t.conflictsUnmergedBody : t.conflictsUnsupportedBody}</p>
        <details className="conflicts-details">
          <summary>{t.conflictsTechnicalDetails}</summary>
          <dl className="conflicts-details__facts">
            <dt>{t.conflictsDetailOperation}</dt>
            <dd><code>{operation.kind}</code>{operation.step ? ` (${operation.step.current}/${operation.step.total})` : ""}</dd>
            <dt>{t.conflictsDetailCurrent}</dt>
            <dd><code>{[operation.current.name, operation.current.commit].filter(Boolean).join(" ") || "—"}</code></dd>
            <dt>{t.conflictsDetailIncoming}</dt>
            <dd><code>{[operation.incoming.name, operation.incoming.commit].filter(Boolean).join(" ") || "—"}</code></dd>
            {operation.operationHeads.length > 0 && (
              <>
                <dt>{t.conflictsDetailHeads}</dt>
                <dd><code>{operation.operationHeads.join(" ")}</code></dd>
              </>
            )}
            <dt>{t.conflictsDetailOrigin}</dt>
            <dd>{session.origin === "gitodile" ? t.conflictsOriginGitodile : t.conflictsOriginExternal}</dd>
            <dt>{t.conflictsDetailSnapshot}</dt>
            <dd>{session.snapshot ? <code>{session.snapshot.pinReference ?? session.snapshot.sessionId}</code> : t.conflictsSnapshotNone}</dd>
          </dl>
          {operation.continueCommand || operation.abortCommand ? (
            <div className="conflicts-details__commands">
              {operation.continueCommand && (
                <CommandLine label={t.conflictsDetailContinue} command={operation.continueCommand} t={t} />
              )}
              {operation.abortCommand && (
                <CommandLine label={t.conflictsDetailAbort} command={operation.abortCommand} t={t} />
              )}
            </div>
          ) : (
            <p className="conflicts-details__note">{t.conflictsDetailNoCommands}</p>
          )}
        </details>
      </div>
    </section>
  );
}

/** Finishing and abandoning the merge, at the end of the header: always
 * two separate actions, and neither is leaving the screen. Finishing stays
 * visible while files still overlap, disabled with the reason beside it. */
function SessionEndActions({
  session,
  isProjectBusy,
  onEnd,
  t,
}: {
  session: ConflictSession;
  isProjectBusy: boolean;
  onEnd: (action: "finish" | "abort") => void;
  t: Translations;
}): React.JSX.Element | null {
  const actions = sessionActions(session);
  if (actions.finish === "hidden" && !actions.abort) return null;
  return (
    <div className="conflicts-header__actions">
      {actions.abort && (
        <button type="button" className="secondary-button" disabled={isProjectBusy} onClick={() => onEnd("abort")}>
          {t.conflictsAbort}
        </button>
      )}
      {actions.finish !== "hidden" && (
        <button
          type="button"
          className="primary-button"
          disabled={isProjectBusy || actions.finish !== "allowed"}
          aria-describedby={actions.finish === "files-left" ? "conflicts-finish-reason" : undefined}
          data-tooltip={actions.finish === "files-left" ? t.conflictsFinishFilesLeft : undefined}
          onClick={() => onEnd("finish")}
        >
          {t.conflictsFinish}
        </button>
      )}
      {actions.finish === "files-left" && (
        <span id="conflicts-finish-reason" className="visually-hidden">{t.conflictsFinishFilesLeft}</span>
      )}
    </div>
  );
}

/** A command to read and copy, never to run: GitOdile does not run them. */
function CommandLine({ label, command, t }: { label: string; command: string; t: Translations }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <div className="conflicts-command">
      <span className="conflicts-command__label">{label}</span>
      <code className="conflicts-command__text">{command}</code>
      <button
        type="button"
        className="secondary-button secondary-button--sm"
        onClick={() => void copyTextToClipboard(command).then(() => setCopied(true), () => undefined)}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? t.conflictsCopied : t.conflictsCopy}
      </button>
    </div>
  );
}

function FileList({
  rows,
  selectedPath,
  names,
  initialScrollTop,
  onScroll,
  onSelect,
  emptyLabel,
  t,
}: {
  rows: Row[];
  selectedPath: string | null;
  names: Record<ConflictSideName, string>;
  initialScrollTop: number;
  onScroll: (scrollTop: number) => void;
  onSelect: (file: ConflictFile) => void;
  emptyLabel: string;
  t: Translations;
}): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => rows[index]?.key ?? index,
    estimateSize: (index) => (rows[index]?.kind === "group" ? GROUP_ROW_HEIGHT : FILE_ROW_HEIGHT),
    overscan: 8,
    initialRect: { width: 320, height: 480 },
    initialOffset: initialScrollTop,
  });
  const fileIndexes = useMemo(
    () => rows.flatMap((row, index) => (row.kind === "file" ? [index] : [])),
    [rows],
  );
  const selectedIndex = rows.findIndex((row) => row.kind === "file" && row.file.path === selectedPath);
  const focusAfterMove = useRef(false);

  useLayoutEffect(() => {
    if (!focusAfterMove.current || selectedIndex < 0) return;
    focusAfterMove.current = false;
    virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    requestAnimationFrame(() => {
      scrollRef.current?.querySelector<HTMLButtonElement>(`[data-index="${selectedIndex}"] button`)?.focus();
    });
  }, [selectedIndex, virtualizer]);

  /** Moves the selection by `delta` files, or to the first or last one. */
  const move = (delta: number | "first" | "last"): void => {
    const position = fileIndexes.indexOf(selectedIndex);
    const target = delta === "first" ? 0 : delta === "last" ? fileIndexes.length - 1 : position + delta;
    const nextIndex = fileIndexes[Math.min(fileIndexes.length - 1, Math.max(0, target))];
    const row = nextIndex === undefined ? undefined : rows[nextIndex];
    if (row?.kind === "file") {
      focusAfterMove.current = true;
      onSelect(row.file);
    }
  };

  return (
    <div
      {...autoHideScrollbarProps<HTMLDivElement>()}
      ref={scrollRef}
      className="conflicts-list__scroll auto-hide-scrollbar"
      onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
    >
      {rows.length === 0 ? (
        <p className="empty-line conflicts-list__empty" role="status">{emptyLabel}</p>
      ) : (
        <ul
          className="conflicts-list__rows"
          style={{ height: virtualizer.getTotalSize() }}
          onKeyDown={(event) => {
            const delta = { ArrowDown: 1, ArrowUp: -1, Home: "first", End: "last" }[event.key] as Parameters<typeof move>[0] | undefined;
            if (delta !== undefined) {
              event.preventDefault();
              move(delta);
            }
          }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            const style = { transform: `translateY(${item.start}px)` };
            if (row.kind === "group") {
              return (
                <li key={row.key} data-index={item.index} ref={virtualizer.measureElement} className="conflicts-list__group" style={style}>
                  {row.label}
                </li>
              );
            }
            const { file } = row;
            const { name, dir } = splitPath(file.path);
            const isSelected = file.path === selectedPath;
            const resolved = file.state === "markedResolved";
            return (
              <li key={row.key} data-index={item.index} ref={virtualizer.measureElement} className="conflicts-list__item" style={style}>
                <button
                  type="button"
                  className={`conflicts-file${isSelected ? " conflicts-file--active" : ""}`}
                  aria-current={isSelected ? "true" : undefined}
                  tabIndex={isSelected || (selectedIndex < 0 && item.index === fileIndexes[0]) ? 0 : -1}
                  onClick={() => onSelect(file)}
                >
                  <span className={`conflicts-file__icon conflicts-file__icon--${resolved ? "resolved" : "open"}`} aria-hidden="true">
                    {resolved ? <Check /> : <Split />}
                  </span>
                  <span className="conflicts-file__details">
                    <span className="conflicts-file__name" title={file.path}>
                      {name}
                      {dir && <span className="conflicts-file__dir">{dir}</span>}
                    </span>
                    <span className="conflicts-file__description">{fileDescription(file, names, t)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type SideDiffState =
  | { status: "loading" }
  | { status: "ready"; diff: FileDiff }
  | { status: "error"; error: unknown };

function FileDetail({
  controller,
  projectPath,
  sessionEpoch,
  session,
  file,
  names,
  isReading,
  isProjectBusy,
  slot,
  onAnnounce,
  onBackToList,
  onReadAgain,
  t,
}: {
  controller: ConflictsController;
  projectPath: string;
  sessionEpoch: string;
  session: ConflictSession;
  file: ConflictFile;
  names: Record<ConflictSideName, string>;
  isReading: boolean;
  isProjectBusy: boolean;
  slot: ResolutionSlot;
  onAnnounce: (text: string) => void;
  onBackToList: () => void;
  onReadAgain: () => void;
  t: Translations;
}): React.JSX.Element {
  const { name, dir } = splitPath(file.path);
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const [discarding, setDiscarding] = useState<ConflictSideName | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  return (
    <section className="conflicts-detail" aria-label={t.conflictsDetailAriaLabel(file.path)}>
      <button type="button" className="conflicts-detail__back" onClick={onBackToList}>
        <ArrowLeft aria-hidden="true" />
        {t.conflictsBackToList}
      </button>
      <header className="conflicts-detail__header">
        <div className="conflicts-detail__title">
          <h2 className="conflicts-detail__path" ref={headingRef} tabIndex={-1}>
            <span className="conflicts-detail__name">{name}</span>
            {dir && <span className="conflicts-detail__dir">{dir}</span>}
          </h2>
          <p className="conflicts-detail__shape">{fileDescription(file, names, t)}</p>
        </div>
      </header>
      <FileResolution
        controller={controller}
        query={query}
        session={session}
        file={file}
        names={names}
        isReading={isReading}
        isProjectBusy={isProjectBusy}
        slot={slot}
        onPreviewDiscard={setDiscarding}
        onSettled={(text) => {
          onAnnounce(text);
          // After the frame that closes a dialog hands focus back to what
          // opened it: the file is where the reader goes on from.
          requestAnimationFrame(() => headingRef.current?.focus());
        }}
        onAnnounce={onAnnounce}
        onReadAgain={onReadAgain}
        t={t}
      />
      {/* Both sides at once, each against the common base, the current
          branch on the left and the incoming one on the right: the overlap is
          the two of them together, so neither hides behind a choice. */}
      <div className="conflicts-detail__sides">
        {(["current", "incoming"] as const).map((side) => (
          <SideChanges
            key={side}
            controller={controller}
            projectPath={projectPath}
            sessionEpoch={sessionEpoch}
            file={file}
            side={side}
            name={names[side]}
            isDiscarding={discarding === side}
            onReadAgain={onReadAgain}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

/** What one side changed against the base: its heading, then its diff in a
 * scroller of its own, or the sentence that explains why there is none. */
function SideChanges({
  controller,
  projectPath,
  sessionEpoch,
  file,
  side,
  name,
  isDiscarding,
  onReadAgain,
  t,
}: {
  controller: ConflictsController;
  projectPath: string;
  sessionEpoch: string;
  file: ConflictFile;
  side: ConflictSideName;
  name: string;
  /** A pending choice would replace what this side changed. */
  isDiscarding: boolean;
  onReadAgain: () => void;
  t: Translations;
}): React.JSX.Element {
  const limitation = sideLimitation(file, side);
  const diffQuery = useMemo(() => {
    const stage = file[side];
    if (limitation || !stage) return null;
    return {
      projectId: projectPath,
      sessionEpoch,
      filePath: file.path,
      side,
      baseObjectId: file.base?.objectId ?? null,
      sideObjectId: stage.objectId,
    };
  }, [file, limitation, projectPath, sessionEpoch, side]);
  const [diffState, setDiffState] = useState<SideDiffState>(() => {
    const cached = diffQuery ? controller.peekSideDiff(diffQuery) : null;
    return cached ? { status: "ready", diff: cached } : { status: "loading" };
  });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!diffQuery) return undefined;
    const cached = controller.peekSideDiff(diffQuery);
    if (cached) {
      setDiffState({ status: "ready", diff: cached });
      return undefined;
    }
    let current = true;
    setDiffState({ status: "loading" });
    controller.readSideDiff(diffQuery).then(
      (diff) => current && setDiffState({ status: "ready", diff }),
      (error: unknown) => current && setDiffState({ status: "error", error }),
    );
    return () => {
      current = false;
    };
  }, [controller, diffQuery, retry]);

  const isStale = diffState.status === "error" && isAppError(diffState.error) && diffState.error.code === "stale_conflict_session";
  const hasDiff = !limitation && diffState.status === "ready" && diffState.diff.kind !== "unchanged";
  const headingId = `conflicts-side-${side}`;

  return (
    <section
      className={`conflicts-side${hasDiff ? " conflicts-side--diff" : ""}${isDiscarding ? " conflicts-side--discarding" : ""}`}
      aria-labelledby={headingId}
    >
      <h3 className="conflicts-side__heading" id={headingId}>
        <GitBranch aria-hidden="true" />
        <span>{t.conflictsSideChanged(name)}</span>
        {isDiscarding && <span className="conflicts-side__discarding">{t.conflictsWillBeReplaced}</span>}
      </h3>
      {limitation ? (
        <p className="conflicts-detail__note">{limitationText(limitation, name, t)}</p>
      ) : diffState.status === "loading" ? (
        <p className="conflicts-detail__note" role="status">{t.conflictsSideLoading}</p>
      ) : diffState.status === "error" ? (
        isStale ? (
          <div className="conflicts-notice conflicts-notice--warning" role="alert">
            <TriangleAlert aria-hidden="true" />
            <div className="conflicts-notice__body">
              <strong>{t.conflictsStaleTitle}</strong>
              <p>{t.conflictsStaleBody}</p>
            </div>
            <button type="button" className="secondary-button" onClick={onReadAgain}>{t.conflictsReadAgain}</button>
          </div>
        ) : (
          <div className="conflicts-notice conflicts-notice--danger" role="alert">
            <CircleAlert aria-hidden="true" />
            <div className="conflicts-notice__body">
              <strong>{t.conflictsSideError}</strong>
              <p>{localizeAppError(diffState.error, t, t.conflictsSideError)}</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>{t.conflictsTryAgain}</button>
          </div>
        )
      ) : diffState.diff.kind === "unchanged" ? (
        <p className="conflicts-detail__note">{t.conflictsSideUnchanged(name)}</p>
      ) : (
        <>
          {!file.base && <p className="conflicts-detail__note conflicts-detail__note--inline">{t.conflictsSideAddedNote(name)}</p>}
          <div className="conflicts-side__diff">
            <DiffResultView diff={diffState.diff} t={t} />
          </div>
        </>
      )}
    </section>
  );
}

function limitationText(limitation: NonNullable<ReturnType<typeof sideLimitation>>, side: string, t: Translations): string {
  switch (limitation) {
    case "deleted": return t.conflictsSideDeleted(side);
    case "symbolic-link": return t.conflictsSideSymbolicLink;
    case "submodule": return t.conflictsSideSubmodule;
    case "type-change": return t.conflictsSideTypeChange;
    case "inexact-path": return t.conflictsSideInexactPath;
  }
}
