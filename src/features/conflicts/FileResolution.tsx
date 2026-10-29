import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  Ellipsis,
  FileX,
  FolderOpen,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  SquareArrowOutUpRight,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import type { Translations } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import {
  Dialog,
  DialogBanner,
  DialogFacts,
  handlePopupMenuKeyDown,
  useAnchoredPopup,
  useModalFocus,
} from "../../shared/ui";
import type { ConflictsController } from "./controller";
import {
  discardedSide,
  executableSide,
  fileActions,
  fileBlock,
  keptChoice,
  keptSide,
  needsMarkerCheck,
  type ConflictFile,
  type ConflictSession,
  type ConflictSideName,
  type SideChoice,
  type WorkingFileCheck,
} from "./domain";
import type { ConflictFileTarget, ConflictsPort, ConflictsQuery, ExpectedStages } from "./port";
import { hasSeenMarkResolvedExplanation, rememberMarkResolvedExplanation } from "./resolutionPreference";

/** The project's mutation slot, as the composition root lends it: the same
 * lock a discard or a branch change takes, and the one coordinated refresh
 * after a change. */
export type ResolutionSlot = {
  /** False when another operation holds the slot; nothing may start then. */
  onOperationStart: () => boolean;
  onOperationFinish: () => void;
  onOperationPhaseChange: (phase: "executing" | "error" | "success") => void;
  onChanged: () => void;
};

type MarkOptions = { allowMarkers: boolean; executable: boolean | null };

/** A question the bar asks in its own place, replacing itself, as the forget
 * row of Restore does: the file stays readable behind the choice. */
type Ask =
  | { kind: "choice"; choice: SideChoice }
  | { kind: "explain"; options: MarkOptions }
  | { kind: "markers"; options: MarkOptions }
  | { kind: "permission"; options: MarkOptions };

type Running = SideChoice | "mark" | "reset";

type Problem =
  | { kind: "stale" }
  | { kind: "unavailable"; error: unknown }
  | { kind: "failed"; error: unknown; retry: () => void }
  /** Opening was refused or failed: the folder is the way on. */
  | { kind: "open"; error: unknown };

type ResetDialogState = { contentNotKept: boolean; error: unknown | null };

const NO_MARK_OPTIONS: MarkOptions = { allowMarkers: false, executable: null };

function errorCode(error: unknown): string | null {
  return isAppError(error) ? error.code : null;
}

function expectedOf(file: ConflictFile): ExpectedStages {
  return { base: file.base, current: file.current, incoming: file.incoming };
}

/** A path as a shell would need it, for the command shown in Technical
 * details: quoted only when it holds anything but plain name characters. */
function shellPath(path: string): string {
  return /^[\w./-]+$/.test(path) ? path : `'${path.replace(/'/g, "'\\''")}'`;
}

/** The command Mark resolved runs, as ADR 0041 §8 decides it. */
function markCommand(file: ConflictFile): string {
  const path = shellPath(file.path);
  if (file.kept === "deleted" || file.working === "absent") return `git rm --cached -- ${path}`;
  if (file.kept) return "git update-index --index-info";
  return `git add -- ${path}`;
}

export function FileResolution({
  controller,
  query,
  session,
  file,
  names,
  isReading,
  isProjectBusy,
  slot,
  onPreviewDiscard,
  onSettled,
  onAnnounce,
  onReadAgain,
  t,
}: {
  controller: ConflictsController;
  query: ConflictsQuery;
  session: ConflictSession;
  file: ConflictFile;
  names: Record<ConflictSideName, string>;
  /** The session is being read again: its token may be about to move. */
  isReading: boolean;
  /** Another change to this project is running. */
  isProjectBusy: boolean;
  slot: ResolutionSlot;
  /** The side a pending choice would discard, so its column can say so. */
  onPreviewDiscard: (side: ConflictSideName | null) => void;
  /** A change landed: what to announce. Focus returns to the file. */
  onSettled: (announcement: string) => void;
  /** Says something without moving focus: opening leaves it where it is. */
  onAnnounce: (announcement: string) => void;
  onReadAgain: () => void;
  t: Translations;
}): React.JSX.Element | null {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [running, setRunning] = useState<Running | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [resetDialog, setResetDialog] = useState<ResetDialogState | null>(null);
  const [opening, setOpening] = useState(false);
  /** The file and session state it was opened in, until an edit moves it. */
  const [opened, setOpened] = useState<{ path: string; stateToken: string } | null>(null);
  /** The last marker check, with the file and token it was asked for. */
  const [check, setCheck] = useState<{ path: string; stateToken: string; result: WorkingFileCheck } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLDivElement>(null);
  // Set in the effect, not only at creation: StrictMode unmounts and mounts
  // again, and a flag left false there would keep the bar running forever.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // A retry offered after a failure must use the session as it is when the
  // reader presses it, not as it was when the failure happened.
  const latest = useRef({ session, file });
  latest.current = { session, file };

  const actions = fileActions(file);
  const kept = keptChoice(file);
  const isResolved = file.state === "markedResolved";
  const disabled = running !== null || isReading || isProjectBusy;

  // A session read that shows the file edited outside GitOdile is the
  // moment to look at it again: once per state of the file, never because
  // it is on screen.
  const shouldCheck = needsMarkerCheck(file);
  const filePath = file.path;
  const stateToken = session.stateToken;
  useEffect(() => {
    if (!shouldCheck) return;
    let current = true;
    controller
      .checkWorkingFile(query, filePath, stateToken)
      .then((result) => {
        if (current) setCheck({ path: filePath, stateToken, result });
      })
      .catch(() => {
        // Say so rather than "checking" for good; Mark resolved still
        // scans the file itself before taking it.
        if (current) {
          setCheck({ path: filePath, stateToken, result: { stateToken, markers: { kind: "unknown", limit: "unreadable" } } });
        }
      });
    return () => {
      current = false;
    };
  }, [controller, filePath, query, shouldCheck, stateToken]);

  useEffect(() => {
    if (!ask) return;
    askRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [ask]);

  const target = (): ConflictFileTarget => ({
    ...query,
    filePath: latest.current.file.path,
    stateToken: latest.current.session.stateToken,
  });

  const execute = async (
    label: Running,
    call: (port: ConflictsPort) => Promise<ConflictSession | null>,
  ): Promise<{ ok: true; session: ConflictSession | null } | { ok: false; error: unknown } | null> => {
    if (!slot.onOperationStart()) return null;
    setRunning(label);
    setProblem(null);
    slot.onOperationPhaseChange("executing");
    try {
      const next = await controller.mutate(query, call);
      slot.onOperationPhaseChange("success");
      slot.onChanged();
      return { ok: true, session: next };
    } catch (error) {
      slot.onOperationPhaseChange("error");
      return { ok: false, error };
    } finally {
      if (mounted.current) setRunning(null);
      slot.onOperationFinish();
    }
  };

  /** A refusal keeps the screen honest: a moved session is read again, an
   * action the file no longer allows re-reads what it does allow, and
   * anything a retry may pass (a file another program holds) offers one. */
  const fail = (error: unknown, retry: () => void): void => {
    if (!mounted.current) return;
    const code = errorCode(error);
    if (code === "stale_conflict_session") {
      setProblem({ kind: "stale" });
    } else if (code === "conflict_action_unavailable" || code === "conflict_case_collision") {
      // A retry cannot pass either: what the file allows, or the name on
      // disk, has to change first.
      setProblem({ kind: "unavailable", error });
      onReadAgain();
    } else {
      setProblem({ kind: "failed", error, retry });
    }
  };

  const closeAsk = (focusKey: string | null): void => {
    setAsk(null);
    onPreviewDiscard(null);
    if (focusKey) {
      requestAnimationFrame(() => {
        barRef.current?.querySelector<HTMLElement>(`[data-action="${focusKey}"]`)?.focus();
      });
    }
  };

  const choose = async (choice: SideChoice): Promise<void> => {
    setAsk(null);
    onPreviewDiscard(null);
    const path = latest.current.file.path;
    const result = await execute(choice, (port) =>
      port.keepSide({ ...target(), choice, expected: expectedOf(latest.current.file) }),
    );
    if (!result) return;
    if (result.ok) {
      const side = keptSide(choice);
      onSettled(side ? t.conflictsAnnounceKept(names[side], path) : t.conflictsAnnounceDeleted(path));
    } else {
      fail(result.error, () => void choose(choice));
    }
  };

  const mark = async (options: MarkOptions): Promise<void> => {
    setAsk(null);
    const path = latest.current.file.path;
    const result = await execute("mark", (port) =>
      port.markResolved({ ...target(), expected: expectedOf(latest.current.file), ...options }),
    );
    if (!result) return;
    if (result.ok) {
      onSettled(t.conflictsAnnounceResolved(path, result.session?.unresolvedCount ?? 0));
      return;
    }
    const code = errorCode(result.error);
    if (code === "conflict_markers_remain" && mounted.current) {
      setAsk({ kind: "markers", options });
    } else if (code === "conflict_choice_needed" && mounted.current) {
      setAsk({ kind: "permission", options });
    } else {
      fail(result.error, () => void mark(options));
    }
  };

  const reset = async (stagesOnly: boolean): Promise<void> => {
    const path = latest.current.file.path;
    const result = await execute("reset", (port) => port.resetFile({ ...target(), stagesOnly }));
    if (!result) return;
    if (result.ok) {
      setResetDialog(null);
      onSettled(t.conflictsAnnounceReset(path));
      return;
    }
    const code = errorCode(result.error);
    if (code === "conflict_content_not_kept") {
      setResetDialog({ contentNotKept: true, error: null });
    } else if (code === "stale_conflict_session" || code === "conflict_action_unavailable") {
      setResetDialog(null);
      fail(result.error, () => undefined);
    } else {
      setResetDialog((current) => ({ contentNotKept: current?.contentNotKept ?? false, error: result.error }));
    }
  };

  /** Opens the file in the application its type opens in. Not a change to
   * the project, so it takes no mutation slot; what the reader does there
   * comes back through the watcher. */
  const open = async (): Promise<void> => {
    setProblem(null);
    setOpening(true);
    const { file: now, session: read } = latest.current;
    try {
      await controller.port.openFile({ ...query, filePath: now.path, stateToken: read.stateToken });
      if (!mounted.current) return;
      setOpened({ path: now.path, stateToken: read.stateToken });
      onAnnounce(t.conflictsAnnounceOpened(now.path));
    } catch (error) {
      const code = errorCode(error);
      if (code === "file_runs_as_program" || code === "path_unusable") {
        if (mounted.current) setProblem({ kind: "open", error });
      } else {
        fail(error, () => void open());
      }
    } finally {
      if (mounted.current) setOpening(false);
    }
  };

  const showInFolder = (path: string): void => {
    void controller.port.revealFile({ ...query, filePath: path }).catch((error: unknown) => {
      if (mounted.current) setProblem({ kind: "failed", error, retry: () => showInFolder(path) });
    });
  };

  const openProjectFolder = (): void => {
    void controller.port.openProjectFolder(query).catch((error: unknown) => {
      if (mounted.current) setProblem({ kind: "failed", error, retry: openProjectFolder });
    });
  };

  const askChoice = (choice: SideChoice): void => {
    setProblem(null);
    setAsk({ kind: "choice", choice });
    onPreviewDiscard(discardedSide(file, choice));
  };

  const startMark = (): void => {
    setProblem(null);
    if (hasSeenMarkResolvedExplanation()) {
      void mark(NO_MARK_OPTIONS);
    } else {
      setAsk({ kind: "explain", options: NO_MARK_OPTIONS });
    }
  };

  const block = fileBlock(file);
  const hasBar = actions.choices.length > 0 || actions.canOpen || actions.canMarkResolved || actions.canReset;
  if (!hasBar && !problem && !block) return null;

  const keptName = kept ? keptSide(kept) : null;
  const checked = check && check.path === file.path && check.stateToken === session.stateToken ? check.result.markers : null;
  const markerStatus = !shouldCheck
    ? null
    : !checked
      ? t.conflictsCheckingMarkers
      : checked.kind === "found"
        ? t.conflictsMarkersLeft(checked.blocks)
        : checked.kind === "none"
          ? t.conflictsNoMarkersLeft
          : t.conflictsMarkersUnknown(checked.limit);
  const isOpenedHere = opened !== null && opened.path === file.path && opened.stateToken === session.stateToken;
  const status = isResolved
    ? t.conflictsStateResolved
    : keptName
      ? t.conflictsKeptStatus(names[keptName])
      : kept === "delete"
        ? t.conflictsDeletedStatus
        : (markerStatus ?? (isOpenedHere ? t.conflictsOpenedStatus : null));
  const statusWarns = !isResolved && !kept && checked?.kind === "found";
  const waiting = isProjectBusy && !running;

  return (
    <div className="conflicts-resolution">
      {ask ? (
        <AskRow
          ask={ask}
          file={file}
          names={names}
          askRef={askRef}
          onCancel={() => closeAsk(ask.kind === "choice" ? ask.choice : "mark")}
          onChoose={(choice) => void choose(choice)}
          onMark={(options) => {
            if (ask.kind === "explain") rememberMarkResolvedExplanation();
            void mark(options);
          }}
          t={t}
        />
      ) : hasBar ? (
        <div
          ref={barRef}
          className="conflicts-actions"
          role="group"
          aria-label={t.conflictsActionsAriaLabel(file.path)}
          aria-busy={running !== null}
        >
          {/* Only when there is something to say: an empty line would still
              take its share of the bar and push the buttons off the right. */}
          {waiting ? (
            <p className="conflicts-actions__status" role="status">{t.conflictsBusyNote}</p>
          ) : status ? (
            <p className={`conflicts-actions__status${statusWarns ? " conflicts-actions__status--warning" : ""}`}>
              {statusWarns && <TriangleAlert aria-hidden="true" />}
              {status}
            </p>
          ) : null}
          <div className="conflicts-actions__buttons">
            {actions.choices.map((choice) => {
              const isKept = kept === choice;
              const side = keptSide(choice);
              const label = side ? t.conflictsKeep(names[side]) : t.conflictsDelete;
              return (
                <button
                  key={choice}
                  type="button"
                  className="secondary-button secondary-button--sm"
                  data-action={choice}
                  aria-pressed={isKept}
                  disabled={disabled}
                  onClick={() => askChoice(choice)}
                >
                  {running === choice ? (
                    <LoaderCircle className="icon--spinning" aria-hidden="true" />
                  ) : isKept ? (
                    <Check aria-hidden="true" />
                  ) : choice === "delete" ? (
                    <Trash2 aria-hidden="true" />
                  ) : null}
                  <span className="conflicts-actions__label">{label}</span>
                </button>
              );
            })}
            {actions.canOpen && (
              <button
                type="button"
                className="secondary-button secondary-button--sm"
                data-action="open"
                disabled={disabled || opening}
                aria-busy={opening}
                onClick={() => void open()}
              >
                {opening ? (
                  <LoaderCircle className="icon--spinning" aria-hidden="true" />
                ) : (
                  <SquareArrowOutUpRight aria-hidden="true" />
                )}
                {t.conflictsOpenInEditor}
              </button>
            )}
            {actions.canReset && (
              <MoreMenu
                disabled={disabled}
                isRunning={running === "reset"}
                onReset={() => setResetDialog({ contentNotKept: false, error: null })}
                t={t}
              />
            )}
            {actions.canMarkResolved && (
              <button
                type="button"
                className="primary-button primary-button--sm"
                data-action="mark"
                disabled={disabled}
                onClick={startMark}
              >
                {running === "mark" ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : <Check aria-hidden="true" />}
                {t.conflictsMarkResolved}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {block && (
        <BlockNotice
          block={block}
          file={file}
          session={session}
          onShowInFolder={() => showInFolder(file.path)}
          onOpenProjectFolder={openProjectFolder}
          onReadAgain={onReadAgain}
          t={t}
        />
      )}

      {problem && (
        <ProblemNotice
          problem={problem}
          onReadAgain={() => { setProblem(null); onReadAgain(); }}
          onShowInFolder={() => showInFolder(file.path)}
          t={t}
        />
      )}

      {resetDialog && (
        <ResetFileDialog
          file={file}
          state={resetDialog}
          isRunning={running === "reset"}
          onClose={() => setResetDialog(null)}
          onReset={(stagesOnly) => void reset(stagesOnly)}
          t={t}
        />
      )}
    </div>
  );
}

function AskRow({
  ask,
  file,
  names,
  askRef,
  onCancel,
  onChoose,
  onMark,
  t,
}: {
  ask: Ask;
  file: ConflictFile;
  names: Record<ConflictSideName, string>;
  askRef: React.RefObject<HTMLDivElement | null>;
  onCancel: () => void;
  onChoose: (choice: SideChoice) => void;
  onMark: (options: MarkOptions) => void;
  t: Translations;
}): React.JSX.Element {
  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };
  const cancel = (autofocus: boolean) => (
    <button type="button" className="secondary-button secondary-button--sm" data-autofocus={autofocus || undefined} onClick={onCancel}>
      {t.commonCancel}
    </button>
  );

  let tone: "danger" | "warning" | "plain";
  let title: string;
  let body: React.ReactNode;
  let answers: React.ReactNode;
  switch (ask.kind) {
    case "choice": {
      const lost = discardedSide(file, ask.choice);
      tone = "danger";
      if (ask.choice === "delete") {
        title = t.conflictsAskDeleteTitle;
        body = lost ? t.conflictsAskDeleteBody(names[lost]) : t.conflictsAskDeleteBothBody;
        answers = (
          <>
            {cancel(true)}
            <button type="button" className="danger-button danger-button--sm" onClick={() => onChoose("delete")}>
              <Trash2 aria-hidden="true" />{t.conflictsDelete}
            </button>
          </>
        );
      } else {
        const keptName = names[keptSide(ask.choice) ?? "current"];
        title = t.conflictsAskKeepTitle(keptName);
        body = lost ? t.conflictsAskKeepBody(names[lost]) : null;
        answers = (
          <>
            {cancel(true)}
            <button type="button" className="danger-button danger-button--sm" onClick={() => onChoose(ask.choice)}>
              {t.conflictsKeep(keptName)}
            </button>
          </>
        );
      }
      break;
    }
    case "explain":
      tone = "plain";
      title = t.conflictsAskMarkTitle;
      body = (
        <>
          {t.conflictsAskMarkBody}
          <details className="conflicts-details">
            <summary>{t.conflictsTechnicalDetails}</summary>
            <p className="conflicts-details__note">{file.kept && file.kept !== "deleted" ? t.conflictsMarkTechnicalKept : t.conflictsMarkTechnical}</p>
            <div className="conflicts-details__commands">
              <code className="conflicts-command conflicts-command__text">{markCommand(file)}</code>
            </div>
          </details>
        </>
      );
      answers = (
        <>
          {cancel(false)}
          <button type="button" className="primary-button primary-button--sm" data-autofocus onClick={() => onMark(ask.options)}>
            <Check aria-hidden="true" />{t.conflictsMarkResolved}
          </button>
        </>
      );
      break;
    case "markers":
      tone = "warning";
      title = t.conflictsAskMarkersTitle;
      body = t.conflictsAskMarkersBody;
      answers = (
        <>
          {cancel(true)}
          <button type="button" className="secondary-button secondary-button--sm" onClick={() => onMark({ ...ask.options, allowMarkers: true })}>
            {t.conflictsMarkAnyway}
          </button>
        </>
      );
      break;
    case "permission": {
      const runs = executableSide(file);
      tone = "plain";
      title = t.conflictsAskPermissionTitle;
      body = runs ? t.conflictsAskPermissionBody(names[runs], names[runs === "current" ? "incoming" : "current"]) : null;
      answers = (
        <>
          {cancel(false)}
          <button type="button" className="secondary-button secondary-button--sm" data-autofocus onClick={() => onMark({ ...ask.options, executable: true })}>
            {t.conflictsPermissionProgram}
          </button>
          <button type="button" className="secondary-button secondary-button--sm" onClick={() => onMark({ ...ask.options, executable: false })}>
            {t.conflictsPermissionPlain}
          </button>
        </>
      );
      break;
    }
  }

  return (
    <div
      ref={askRef}
      className={`conflicts-ask conflicts-ask--${tone}`}
      role="group"
      aria-labelledby="conflicts-ask-title"
      onKeyDown={onKeyDown}
    >
      <div className="conflicts-ask__question">
        {tone === "warning" && <TriangleAlert aria-hidden="true" />}
        <div className="conflicts-ask__text">
          <strong id="conflicts-ask-title">{title}</strong>
          {body && <div className="conflicts-ask__body">{body}</div>}
        </div>
      </div>
      <div className="conflicts-ask__answers">{answers}</div>
    </div>
  );
}

function MoreMenu({
  disabled,
  isRunning,
  onReset,
  t,
}: {
  disabled: boolean;
  isRunning: boolean;
  onReset: () => void;
  t: Translations;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = (restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const { containerRef, popupRef } = useAnchoredPopup(open, triggerRef, close, "selected-menu-item");
  return (
    <div className="conflicts-more" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="secondary-button secondary-button--sm conflicts-more__trigger"
        data-action="more"
        aria-label={t.conflictsMoreActions}
        data-tooltip={t.conflictsMoreActions}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {isRunning ? <LoaderCircle className="icon--spinning" aria-hidden="true" /> : <Ellipsis aria-hidden="true" />}
      </button>
      {open && (
        <div
          ref={popupRef}
          className="app-menu conflicts-more__popup"
          role="menu"
          aria-label={t.conflictsMoreActions}
          tabIndex={-1}
          onKeyDown={(event) => handlePopupMenuKeyDown(event, popupRef.current, () => close(true))}
        >
          <button
            className="app-menu__item app-menu__item--danger"
            role="menuitem"
            type="button"
            onClick={() => {
              close(true);
              onReset();
            }}
          >
            <RotateCcw aria-hidden="true" />{t.conflictsResetMenu}
          </button>
        </div>
      )}
    </div>
  );
}

/** What a file no whole-file choice can handle needs instead, in words, with
 * the one step GitOdile can take toward it. */
function BlockNotice({
  block,
  file,
  session,
  onShowInFolder,
  onOpenProjectFolder,
  onReadAgain,
  t,
}: {
  block: NonNullable<ReturnType<typeof fileBlock>>;
  file: ConflictFile;
  session: ConflictSession;
  onShowInFolder: () => void;
  onOpenProjectFolder: () => void;
  onReadAgain: () => void;
  t: Translations;
}): React.JSX.Element {
  let title: string;
  let body: string;
  switch (block) {
    case "folder":
      title = t.conflictsBlockFolderTitle;
      body = t.conflictsBlockFolderBody;
      break;
    case "case": {
      const folded = file.path.toLocaleLowerCase();
      const others = session.files
        .filter((other) => other.path !== file.path && other.path.toLocaleLowerCase() === folded)
        .map((other) => `“${other.path}”`)
        .join(", ");
      title = t.conflictsBlockCaseTitle;
      body = t.conflictsBlockCaseBody(others);
      break;
    }
    case "inexact-path":
      title = t.conflictsBlockInexactTitle;
      body = t.conflictsBlockInexactBody;
      break;
  }
  return (
    <div className="conflicts-notice conflicts-notice--warning" role="note">
      <TriangleAlert aria-hidden="true" />
      <div className="conflicts-notice__body">
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      <div className="conflicts-notice__actions">
        {block === "inexact-path" ? (
          <button type="button" className="secondary-button" onClick={onOpenProjectFolder}>
            <FolderOpen aria-hidden="true" />{t.conflictsOpenProjectFolder}
          </button>
        ) : (
          <button type="button" className="secondary-button" onClick={onShowInFolder}>
            <FolderOpen aria-hidden="true" />{t.conflictsShowInFolder}
          </button>
        )}
        <button type="button" className="secondary-button" onClick={onReadAgain}>{t.conflictsReadAgain}</button>
      </div>
    </div>
  );
}

function ProblemNotice({
  problem,
  onReadAgain,
  onShowInFolder,
  t,
}: {
  problem: Problem;
  onReadAgain: () => void;
  onShowInFolder: () => void;
  t: Translations;
}): React.JSX.Element {
  if (problem.kind === "open") {
    const refused = errorCode(problem.error) === "file_runs_as_program";
    return (
      <div className={`conflicts-notice conflicts-notice--${refused ? "warning" : "danger"}`} role="alert">
        {refused ? <TriangleAlert aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
        <div className="conflicts-notice__body">
          <strong>{refused ? t.conflictsRunsAsProgramTitle : t.conflictsOpenFailedTitle}</strong>
          <p>{refused ? localizeAppError(problem.error, t, t.conflictsOpenFailedTitle) : t.conflictsOpenFailedBody}</p>
        </div>
        <button type="button" className="secondary-button" onClick={onShowInFolder}>
          <FolderOpen aria-hidden="true" />{t.conflictsShowInFolder}
        </button>
      </div>
    );
  }
  if (problem.kind === "stale") {
    return (
      <div className="conflicts-notice conflicts-notice--warning" role="alert">
        <TriangleAlert aria-hidden="true" />
        <div className="conflicts-notice__body">
          <strong>{t.conflictsStaleTitle}</strong>
          <p>{t.conflictsStaleActionBody}</p>
        </div>
        <button type="button" className="secondary-button" onClick={onReadAgain}>{t.conflictsReadAgain}</button>
      </div>
    );
  }
  const locked = problem.kind === "failed" && errorCode(problem.error) === "file_locked";
  return (
    <div className="conflicts-notice conflicts-notice--danger" role="alert">
      <CircleAlert aria-hidden="true" />
      <div className="conflicts-notice__body">
        <strong>{locked ? t.conflictsLockedTitle : t.conflictsActionErrorTitle}</strong>
        <p>{localizeAppError(problem.error, t, t.conflictsActionErrorTitle)}</p>
      </div>
      {problem.kind === "failed" ? (
        <button type="button" className="secondary-button" onClick={problem.retry}>{t.conflictsTryAgain}</button>
      ) : null}
    </div>
  );
}

/** Reset is the one action here that throws away what the reader wrote, so
 * it is a confirmation (DESIGN.md § Dialogs: `s`, `danger`, the safe fact
 * last) rather than a question in the bar. */
function ResetFileDialog({
  file,
  state,
  isRunning,
  onClose,
  onReset,
  t,
}: {
  file: ConflictFile;
  state: ResetDialogState;
  isRunning: boolean;
  onClose: () => void;
  onReset: (stagesOnly: boolean) => void;
  t: Translations;
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Escape asks to close; a reset already running cannot be left.
  const setOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const value = typeof next === "function" ? next(true) : next;
    if (!value && !isRunningRef.current) onCloseRef.current();
  }, []);
  useModalFocus(true, dialogRef, setOpen);
  const stagesOnly = state.contentNotKept;

  return (
    <Dialog
      size="s"
      title={t.conflictsResetTitle}
      titleId="conflicts-reset-title"
      icon={<RotateCcw />}
      tone="danger"
      onClose={onClose}
      closeLabel={t.commonClose}
      dismissible={!isRunning}
      dialogRef={dialogRef}
    >
      {stagesOnly ? (
        <DialogBanner tone="warning" icon={<TriangleAlert />}>
          <p>{t.conflictsResetContentNotKept}</p>
        </DialogBanner>
      ) : (
        <p className="app-dialog__text">{t.conflictsResetBody(file.path)}</p>
      )}
      <DialogFacts
        facts={stagesOnly
          ? [
              { icon: <RotateCcw />, text: t.conflictsResetFactOverlapOnly },
              { icon: <ShieldCheck />, text: t.conflictsResetFactFileStays, safe: true },
            ]
          : [
              { icon: <FileX />, text: t.conflictsResetFactUndo },
              { icon: <ShieldCheck />, text: t.conflictsResetFactKept, safe: true },
            ]}
      />
      {state.error !== null && (
        <DialogBanner tone="danger" icon={<CircleAlert />}>
          <p role="alert">{localizeAppError(state.error, t, t.conflictsActionErrorTitle)}</p>
        </DialogBanner>
      )}
      {isRunning && (
        <p className="app-dialog__note" role="status">
          <LoaderCircle className="icon--spinning" aria-hidden="true" />
          {t.conflictsResetting}
        </p>
      )}
      <div className="dialog-actions">
        <button className="secondary-button" type="button" onClick={onClose} disabled={isRunning}>{t.commonCancel}</button>
        <button className="danger-button" type="button" disabled={isRunning} onClick={() => onReset(stagesOnly)}>
          <RotateCcw aria-hidden="true" />{stagesOnly ? t.conflictsResetOverlapOnly : t.conflictsResetConfirm}
        </button>
      </div>
    </Dialog>
  );
}
