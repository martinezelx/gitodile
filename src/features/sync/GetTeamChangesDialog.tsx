import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CloudUpload,
  FileText,
  FolderOpen,
  Info,
  GitMerge,
  Layers,
  LoaderCircle,
  Save,
  ShieldCheck,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { formatRelativeTime, isAppError, localizeAppError, type AppError } from "../../shared/i18n";
import {
  Dialog,
  DialogBanner,
  DialogFacts,
  LoadingBar,
  LoadingPlaceholder,
  TextPlaceholder,
  autoHideScrollbarProps,
  useModalFocus,
  useToast,
  type DialogFact,
} from "../../shared/ui";
import type { ConflictSession } from "../conflicts";
import type { BringInPort } from "./port";
import type { SyncController } from "./controller";
import { forecastBlockerCopy } from "./forecastCopy";
import type {
  GetTeamChangesPhase,
  GetTeamChangesPlan,
  GetTeamChangesResult,
  TeamSyncStatus,
} from "./domain";

/** What the person asked for: the versions on the remote, or to publish their
 * own when the remote has moved on first (the get comes before the publish
 * in the same confirmation). */
export type GetTeamIntent = "get" | "getAndPublish";

/** What a publish after the get reports back, for the closing toast. */
export type PublishAfterGet = { publishedCount: number; remote: string };

type ExecutingPhase = GetTeamChangesPhase | "publishing";

type DialogState =
  | { status: "planning" }
  | { status: "blocked"; error: unknown }
  /** The remote could not be asked. Cached saved overlaps cannot start a
   * merge until the check succeeds; nothing-to-get also waits for that truth. */
  | { status: "unchecked"; error: unknown; hasIncoming?: boolean }
  | { status: "ready"; plan: GetTeamChangesPlan; remoteMoved: boolean }
  | { status: "executing"; plan: GetTeamChangesPlan; phase: ExecutingPhase }
  | { status: "uncertain"; evidence: string }
  | { status: "execution-error"; plan: GetTeamChangesPlan; error: unknown }
  | { status: "publish-error"; plan: GetTeamChangesPlan; result: GetTeamChangesResult; error: unknown };

/** How long a plan may take before the dialog shows its loading shell. A local
 * plan answers well inside it, so a project that is already up to date ends
 * on its toast without a dialog flashing open first. */
const SHELL_DELAY_MS = 150;

/** Errors a retry cannot change; the dialog only offers to close. */
function deterministicBlock(error: unknown): boolean {
  return isAppError(error) && [
    "remote_ref_missing",
    "invalid_remote_configuration",
    "detached_head",
    "unborn_branch_no_version",
    "git_operation_in_progress",
    "no_remote_configured",
  ].includes(error.code);
}

/** What the dialog says when the branch's remote branch is gone: the same
 * error a plan without a tracking ref returns, so it reads and closes alike. */
const UPSTREAM_GONE: AppError = {
  code: "remote_ref_missing",
  message: "The branch this branch tracks no longer exists on the remote.",
  remediation: null,
};

/** The reason a failed check gave, unless it only repeats the title. */
function uncheckedReason(error: unknown, title: string): string | null {
  return error instanceof Error && error.message && error.message !== title ? error.message : null;
}

function shortCommit(commit: string): string {
  return commit.slice(0, 12);
}

export function GetTeamChangesDialog({
  isOpen,
  controller,
  overlapPort,
  onPaused,
  projectPath,
  sessionEpoch,
  intent = "get",
  runHooks,
  canPublish = false,
  refreshRemote = null,
  upstreamGone = false,
  onClose,
  onApplied,
  onPhaseChange,
  onSaveVersion,
  onRevealFile,
  onOpenConflicts,
  onPublishAfter,
}: {
  isOpen: boolean;
  controller: SyncController;
  overlapPort: Pick<BringInPort, "startOverlap">;
  onPaused: (session: ConflictSession) => Promise<void>;
  projectPath: string;
  sessionEpoch: string;
  intent?: GetTeamIntent;
  /** The Settings switch: whether the project's merge hooks run. */
  runHooks: boolean;
  /** Publishing is possible from here, so a merge can offer to publish too. */
  canPublish?: boolean;
  /** Given when the last check of the remote is old: the dialog opens on
   * what it already knows and asks the remote in the background, re-planning
   * in place if something newer arrived. It rejects when the remote could not
   * be asked, so silence is never read as "nothing new". */
  refreshRemote?: (() => Promise<TeamSyncStatus | null>) | null;
  /** The last check found the branch's remote branch deleted. The kept tracking
   * ref still names versions, but there is nothing on the remote to get. */
  upstreamGone?: boolean;
  onClose: () => void;
  onApplied: (result: GetTeamChangesResult) => Promise<void>;
  onPhaseChange: (phase: "planning" | "executing" | "verifying" | "uncertain" | "error" | "success") => void;
  /** Offered when local work has to be saved before the update can carry it:
   * the dialog hands over to Save version. */
  onSaveVersion?: () => void;
  /** Offered when an untracked file of the person's is in the way. */
  onRevealFile?: (path: string) => void;
  /** Offered when another operation is paused in the project: the way to the
   * screen that explains it. Leaving this dialog for it changes nothing. */
  onOpenConflicts?: () => void;
  /** Publishes after a successful get (Get and publish). */
  onPublishAfter?: () => Promise<PublishAfterGet>;
}): React.JSX.Element | null {
  const { t, formats } = useLanguage();
  const showToast = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const phaseRef = useRef(onPhaseChange);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const upstreamGoneRef = useRef(upstreamGone);
  upstreamGoneRef.current = upstreamGone;
  const stateRef = useRef<DialogState>({ status: "planning" });
  const [state, setStateValue] = useState<DialogState>({ status: "planning" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [shellDue, setShellDue] = useState(false);
  /* True while the background check of the remote is out. A plan that finds
     nothing to get waits for it, because what the remote says decides. */
  const refreshPendingRef = useRef(false);
  /** Why this opening's check of the remote failed, if it did. */
  const refreshFailureRef = useRef<{ error: unknown } | null>(null);
  const upToDateRef = useRef(false);
  closeRef.current = onClose;
  phaseRef.current = onPhaseChange;
  const setState = useCallback((next: DialogState) => {
    stateRef.current = next;
    setStateValue(next);
  }, []);

  const setOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const value = typeof next === "function" ? next(true) : next;
    if (!value && !busyRef.current) closeRef.current();
  }, []);
  // Nothing is on screen until the plan takes long enough to need a shell,
  // so focus moves in only once something is.
  const isShellVisible = shellDue || state.status !== "planning";
  useModalFocus(isOpen && isShellVisible, dialogRef, setOpen);

  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = window.setTimeout(() => setShellDue(true), SHELL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  /* Being up to date is an answer, not a stop: the dialog closes on a toast
     instead of a warning to dismiss. While the remote is still being asked
     the dialog keeps loading, so it never reports "nothing" and then turns
     into a plan. */
  const planFailedRef = useRef<(error: unknown) => void>(() => undefined);
  planFailedRef.current = (error: unknown): void => {
    if (isAppError(error) && error.code === "nothing_to_get") {
      if (upToDateRef.current) return;
      if (refreshPendingRef.current) {
        // Held as loading — also when it came from a stale update — so the
        // check's answer plans again instead of leaving a dead state behind.
        if (stateRef.current.status !== "planning") setState({ status: "planning" });
        return;
      }
      const failure = refreshFailureRef.current;
      if (failure) {
        setState({ status: "unchecked", error: failure.error });
        phaseRef.current("error");
        return;
      }
      upToDateRef.current = true;
      phaseRef.current("success");
      showToast({ icon: <CheckCircle2 />, message: t.getTeamUpToDateToast });
      closeRef.current();
      return;
    }
    setState({ status: "blocked", error });
    phaseRef.current("error");
  };

  const query = { projectId: projectPath, sessionEpoch };
  const plan = useCallback(async (remoteMoved: boolean): Promise<void> => {
    const ticket = ++generation.current;
    if (upstreamGoneRef.current) {
      planFailedRef.current(UPSTREAM_GONE);
      return;
    }
    try {
      const next = await controller.planGet({ projectId: projectPath, sessionEpoch });
      if (ticket === generation.current) {
        if (next.forecast.outcome === "overlap" && refreshFailureRef.current) {
          setState({ status: "unchecked", error: refreshFailureRef.current.error, hasIncoming: true });
          phaseRef.current("error");
        } else setState({ status: "ready", plan: next, remoteMoved });
      }
    } catch (error: unknown) {
      if (ticket === generation.current) planFailedRef.current(error);
    }
  }, [controller, projectPath, sessionEpoch, setState]);

  // The plan is local, so the dialog opens on it at once.
  useEffect(() => {
    // A check can update upstream props during a mutation or after uncertainty.
    // Repository read results must not replace that operation's outcome/evidence.
    if (!isOpen || ["executing", "uncertain", "publish-error"].includes(stateRef.current.status)) return undefined;
    generation.current++;
    if (upstreamGone) {
      setState({ status: "blocked", error: UPSTREAM_GONE });
      phaseRef.current("error");
      return undefined;
    }
    phaseRef.current("planning");
    setState({ status: "planning" });
    refreshFailureRef.current = null;
    void plan(false);
    return () => { generation.current++; };
  }, [isOpen, plan, retryToken, setState, upstreamGone]);

  // One background check when the last one is old. If the remote moved, the
  // summary is planned again in place and says so; once an update is under
  // way the check changes nothing here (execution revalidates on its own).
  // A plan still loading is planned again whatever the check returned: it may
  // be holding a "nothing to get" that only this check could overturn.
  const refreshRef = useRef(refreshRemote);
  refreshRef.current = refreshRemote;
  useEffect(() => {
    const refresh = refreshRef.current;
    if (!isOpen || !refresh) return undefined;
    let cancelled = false;
    refreshPendingRef.current = true;
    refreshFailureRef.current = null;
    setIsRefreshing(true);
    refresh()
      .catch((error: unknown) => {
        if (!cancelled) refreshFailureRef.current = { error };
        return null;
      })
      .then((status) => {
        // A newer run (Try again) owns the flags once this one is cancelled.
        if (cancelled) return undefined;
        refreshPendingRef.current = false;
        const current = stateRef.current;
        if (status?.state === "upstreamGone") {
          if (current.status === "ready" || current.status === "planning" || current.status === "blocked") {
            generation.current++;
            setState({ status: "blocked", error: UPSTREAM_GONE });
            phaseRef.current("error");
          }
          return undefined;
        }
        if (refreshFailureRef.current && current.status === "ready" && current.plan.forecast.outcome === "overlap") {
          setState({ status: "unchecked", error: refreshFailureRef.current.error, hasIncoming: true });
          phaseRef.current("error");
          return undefined;
        }
        const shown = current.status === "ready" ? current.plan.remoteCommit : null;
        const stillWaiting = current.status === "planning"
          || (current.status === "blocked" && !deterministicBlock(current.error));
        if ((status && shown !== null && status.remoteCommit !== shown) || stillWaiting) {
          return plan(shown !== null);
        }
        return undefined;
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsRefreshing(false);
      });
    return () => {
      cancelled = true;
      // A cancelled check no longer holds anything back; a newer run raises
      // the flag again if there is a check to wait for.
      refreshPendingRef.current = false;
      setIsRefreshing(false);
    };
  }, [isOpen, plan, retryToken]);

  useEffect(() => {
    if (isOpen && isShellVisible && !dialogRef.current?.contains(document.activeElement)) {
      dialogRef.current?.querySelector<HTMLButtonElement>(".dialog-actions button:not(:disabled)")?.focus();
    }
  }, [isOpen, isShellVisible, state.status]);

  if (!isOpen || !isShellVisible) return null;
  const isBusy = state.status === "executing";
  busyRef.current = isBusy;
  const requestClose = (): void => {
    if (!isBusy) onClose();
  };
  const replan = (): void => {
    phaseRef.current("planning");
    setRetryToken((value) => value + 1);
  };

  const publishAfter = (current: GetTeamChangesPlan, result: GetTeamChangesResult): void => {
    if (!onPublishAfter) return;
    setState({ status: "executing", plan: current, phase: "publishing" });
    phaseRef.current("executing");
    onPublishAfter()
      .then((published) => {
        phaseRef.current("success");
        showToast({
          icon: <CloudUpload />,
          message: t.getTeamPublishedToast(result.receivedCount, published.publishedCount, published.remote),
        });
        closeRef.current();
      })
      .catch((error: unknown) => {
        setState({ status: "publish-error", plan: current, result, error });
        phaseRef.current("error");
      });
  };

  const execute = (current: GetTeamChangesPlan, thenPublish: boolean): void => {
    if (busyRef.current) return;
    generation.current++; // Mutation outcomes supersede every pending preview.
    busyRef.current = true;
    phaseRef.current("executing");
    setState({ status: "executing", plan: current, phase: "checkingLocalSafety" });
    controller.get({
      ...query,
      stateToken: current.stateToken,
      recoveryReference: current.recovery.reference,
      runHooks,
      onProgress: (phase) => {
        setState({ status: "executing", plan: current, phase });
        phaseRef.current(phase === "verifying" ? "verifying" : "executing");
      },
    }).then(async (result) => {
      if (result.outcome === "uncertain") {
        setState({ status: "uncertain", evidence: [
          `${t.getTeamRecoveryReference}: ${result.recovery.reference}`,
          result.recovery.unsavedReference ? `${t.getTeamUnsavedCopy}: ${result.recovery.unsavedReference}` : null,
          result.observedHead ? `${t.getTeamObservedHead}: ${result.observedHead}` : null,
        ].filter(Boolean).join("\n") });
        phaseRef.current("uncertain");
        return;
      }
      await onApplied(result);
      if (thenPublish && onPublishAfter) {
        publishAfter(current, result);
        return;
      }
      phaseRef.current("success");
      // Nothing left to decide, so the result is a toast rather than a screen
      // to dismiss. The recovery point is still kept.
      showToast({
        icon: result.integration === "merge" ? <GitMerge /> : <ArrowDownToLine />,
        message: result.integration === "merge"
          ? t.getTeamMergedToast(result.receivedCount)
          : t.getTeamSuccessToast(result.receivedCount),
      });
      closeRef.current();
    }).catch((error: unknown) => {
      if (isAppError(error) && ["merge_outcome_uncertain", "get_team_changes_uncertain"].includes(error.code)) {
        setState({ status: "uncertain", evidence: [current.recovery.reference, error.detail].filter(Boolean).join("\n") });
        phaseRef.current("uncertain");
        return;
      }
      // The project or its remote moved after the summary was read: show the
      // new summary instead of an error to dismiss.
      if (isAppError(error) && error.code === "stale_get_team_changes_plan") {
        phaseRef.current("planning");
        void plan(true);
        return;
      }
      setState({ status: "execution-error", plan: current, error });
      phaseRef.current("error");
    }).finally(() => { busyRef.current = false; });
  };

  const resolveOverlap = async (current: GetTeamChangesPlan): Promise<void> => {
    if (busyRef.current || refreshPendingRef.current) return;
    generation.current++;
    busyRef.current = true;
    setState({ status: "executing", plan: current, phase: "checkingLocalSafety" });
    phaseRef.current("executing");
    let paused = false;
    try {
      const result = await overlapPort.startOverlap({
        ...query, source: { kind: "upstream" },
        stateToken: current.stateToken, recoveryReference: current.recovery.reference,
      });
      paused = true;
      await onPaused(result.session);
      phaseRef.current("success");
      closeRef.current();
    } catch (error: unknown) {
      if (paused || (isAppError(error) && error.code === "merge_outcome_uncertain")) {
        setState({ status: "uncertain", evidence: [current.recovery.reference, isAppError(error) ? error.detail : null].filter(Boolean).join("\n") });
        phaseRef.current("uncertain");
      } else if (isAppError(error) && error.code === "stale_get_team_changes_plan") {
        phaseRef.current("planning");
        await plan(true);
      } else {
        setState({ status: "execution-error", plan: current, error });
        phaseRef.current("error");
      }
    } finally {
      busyRef.current = false;
    }
  };

  if (state.status === "blocked") {
    return (
      <AlertDialog
        tone="warning"
        title={t.getTeamBlockedTitle}
        body={localizeAppError(state.error, t, t.errorGitCommandFailed)}
        onClose={requestClose}
        dialogRef={dialogRef}
        actions={isAppError(state.error) && state.error.code === "git_operation_in_progress" && onOpenConflicts ? (
          <>
            <button className="secondary-button" type="button" onClick={requestClose}>{t.commonClose}</button>
            <button className="primary-button" type="button" onClick={onOpenConflicts}>{t.getTeamReviewConflicts}</button>
          </>
        ) : deterministicBlock(state.error) ? (
          <button className="primary-button" type="button" onClick={requestClose}>{t.commonClose}</button>
        ) : (
          <>
            <button className="secondary-button" type="button" onClick={requestClose}>{t.commonClose}</button>
            <button className="primary-button" type="button" onClick={replan}>{t.getTeamTryAgain}</button>
          </>
        )}
      />
    );
  }

  if (state.status === "unchecked") {
    return (
      <AlertDialog
        tone="warning"
        title={t.syncUnavailableTitle}
        body={uncheckedReason(state.error, t.syncUnavailableTitle) ?? t.getTeamUncheckedBody}
        onClose={requestClose}
        dialogRef={dialogRef}
        details={state.hasIncoming ? undefined : <p className="app-dialog__text">{t.getTeamUncheckedLocal}</p>}
        actions={
          <>
            <button className="secondary-button" type="button" onClick={requestClose}>{t.commonClose}</button>
            <button className="primary-button" type="button" onClick={replan}>{t.getTeamTryAgain}</button>
          </>
        }
      />
    );
  }

  if (state.status === "uncertain") {
    return (
      <AlertDialog
        tone="warning"
        title={t.getTeamUncertainTitle}
        body={t.getTeamUncertainInstructions}
        onClose={requestClose}
        dialogRef={dialogRef}
        details={
          <details className="app-dialog__details">
            <summary>{t.syncTechnicalDetails}</summary>
            <pre>{state.evidence}</pre>
          </details>
        }
        actions={<button className="primary-button" type="button" onClick={requestClose}>{t.commonClose}</button>}
      />
    );
  }

  if (state.status === "ready" && state.plan.forecast.outcome === "blocked" && state.plan.forecast.blocker) {
    const copy = forecastBlockerCopy(state.plan.forecast.blocker, state.plan.target.remote, t);
    const path = state.plan.forecast.blocker.path;
    return (
      <AlertDialog
        tone="warning"
        title={copy.title}
        body={copy.body}
        onClose={requestClose}
        dialogRef={dialogRef}
        actions={
          <>
            <button className="secondary-button" type="button" onClick={requestClose}>{t.commonClose}</button>
            {copy.action === "save" && onSaveVersion ? (
              <button className="primary-button" type="button" onClick={onSaveVersion}>
                <Save aria-hidden="true" />{t.getTeamSaveVersion}
              </button>
            ) : copy.action === "reveal" && onRevealFile && path ? (
              <button className="primary-button" type="button" onClick={() => onRevealFile(path)}>
                <FolderOpen aria-hidden="true" />{t.getTeamShowInFolder}
              </button>
            ) : copy.action === "conflicts" && onOpenConflicts ? (
              <button className="primary-button" type="button" onClick={onOpenConflicts}>{t.getTeamReviewConflicts}</button>
            ) : null}
          </>
        }
      />
    );
  }

  const current = state.status === "planning" ? null : state.plan;
  const isMerge = current?.integration === "merge";
  const overlaps = current?.forecast.outcome === "overlap";
  const unsavedOverlap = overlaps && current.forecast.overlaps.some((item) => item.side === "unsaved");
  const canResolve = overlaps && isMerge && !unsavedOverlap;
  // Publishing after the get only means something when there is saved work
  // of the person's to publish.
  const publishes = !overlaps && intent === "getAndPublish" && Boolean(onPublishAfter) && (current?.localCount ?? 0) > 0;
  const remote = current?.target.remote ?? "";
  const from = current ? t.getTeamFrom(current.forecast.authors, current.forecast.authorCount) : "";
  const title = !current
    ? t.getTeamDialogTitle
    : overlaps ? t.getTeamReviewConflicts
    : publishes
      ? t.getTeamTitlePublish(current.localCount, remote)
      : isMerge
        ? t.getTeamTitleMerge(current.incomingCount)
        : t.getTeamTitleFastForward(current.incomingCount, remote);
  const subtitle = !current
    ? null
    : publishes
      ? t.getTeamBeforePublish(current.incomingCount, from)
      : [from, t.getTeamFileCount(current.forecast.incomingFileCount)].filter(Boolean).join(" · ");
  const phaseLabel = state.status === "executing" ? t.getTeamPhase[state.phase] : null;

  return (
    <Dialog
      size="m"
      title={title}
      titleId="get-team-dialog-title"
      subtitle={subtitle ? <span id="get-team-dialog-description">{subtitle}</span> : undefined}
      descriptionId={subtitle ? "get-team-dialog-description" : undefined}
      icon={publishes ? <CloudUpload /> : isMerge ? <GitMerge /> : <ArrowDownToLine />}
      tone={publishes ? "local" : "remote"}
      onClose={requestClose}
      closeLabel={t.commonClose}
      dismissible={!isBusy}
      dialogRef={dialogRef}
      className="get-team-dialog auto-hide-scrollbar"
      bodyProps={autoHideScrollbarProps<HTMLDivElement>()}
    >
      {!current ? (
        /* The plan's shape while it is read — its facts and the disclosure —
           so the answer fills the space instead of growing the dialog. */
        <LoadingPlaceholder label={t.getTeamProgressLabel} className="get-team-plan">
          <ul className="app-dialog__facts">
            {PLACEHOLDER_FACT_WIDTHS.map((width) => (
              <li key={width} className="app-dialog__fact"><TextPlaceholder width={width} /></li>
            ))}
          </ul>
        </LoadingPlaceholder>
      ) : (
        <PlanContent plan={current} publishes={publishes} formatsNow={Date.now()} formats={formats} />
      )}

      {overlaps && <DialogBanner tone="warning" icon={<Info />}>
        <p>{canResolve ? t.getTeamOverlapBody : t.bringInSaveFirst}</p>
      </DialogBanner>}

      {state.status === "ready" && state.remoteMoved && (
        <DialogBanner tone="info" icon={<Info />} role="status">
          <p>{t.getTeamRemoteMoved}</p>
        </DialogBanner>
      )}

      {state.status === "execution-error" && (
        <DialogBanner tone="danger" icon={<CircleAlert />}>
          <p role="alert">{localizeAppError(state.error, t, t.errorGitCommandFailed)}</p>
        </DialogBanner>
      )}

      {state.status === "publish-error" && (
        <DialogBanner tone="danger" icon={<CircleAlert />}>
          <p role="alert">{t.getTeamPublishFailed}</p>
          <p>{localizeAppError(state.error, t, t.errorGitCommandFailed)}</p>
        </DialogBanner>
      )}

      <div className="app-dialog__foot">
        {phaseLabel ? (
          <LoadingBar label={phaseLabel} showLabel />
        ) : isRefreshing && current && state.status === "ready" ? (
          <p className="app-dialog__note get-team-refreshing" role="status">
            <LoaderCircle aria-hidden="true" className="icon--spinning" />
            {t.getTeamCheckingRemote(remote)}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={requestClose} disabled={isBusy}>
            {state.status === "publish-error" ? t.commonClose : t.commonCancel}
          </button>
          {state.status === "ready" && !overlaps && isMerge && !publishes && canPublish && onPublishAfter && (
            <button className="secondary-button" type="button" onClick={() => execute(state.plan, true)}>
              <CloudUpload aria-hidden="true" />{t.getTeamAlsoPublish}
            </button>
          )}
          {state.status === "ready" && !overlaps && (
            <button className="primary-button" type="button" onClick={() => execute(state.plan, publishes)}>
              {publishes ? <CloudUpload aria-hidden="true" /> : <ArrowDownToLine aria-hidden="true" />}
              {publishes ? t.getTeamConfirmPublish : isMerge ? t.getTeamConfirmMerge : t.getTeamConfirmFastForward}
            </button>
          )}
          {state.status === "ready" && canResolve && <button className="primary-button" type="button" disabled={isRefreshing} onClick={() => void resolveOverlap(state.plan)}>{t.bringInResolve}</button>}
          {state.status === "ready" && overlaps && !canResolve && onSaveVersion && <button className="primary-button" type="button" onClick={onSaveVersion}>{t.getTeamSaveVersion}</button>}
          {(state.status === "planning" || state.status === "executing") && (
            <button className="primary-button" type="button" disabled>
              <LoaderCircle aria-hidden="true" className="icon--spinning" />{t.getTeamWorking}
            </button>
          )}
          {state.status === "execution-error" && (
            <button className="primary-button" type="button" onClick={replan}>{t.getTeamReviewUpdatedPlan}</button>
          )}
          {state.status === "publish-error" && (
            <button className="primary-button" type="button" onClick={() => publishAfter(state.plan, state.result)}>
              <CloudUpload aria-hidden="true" />{t.getTeamRetryPublish}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

/** A short message instead of a plan: the small shell, a status glyph, the
 * sentence and the way out. */
function AlertDialog({
  tone,
  icon = <CircleAlert />,
  title,
  body,
  details,
  actions,
  onClose,
  dialogRef,
}: {
  tone: "warning" | "danger";
  icon?: React.ReactNode;
  title: string;
  body: string;
  details?: React.ReactNode;
  actions: React.ReactNode;
  onClose: () => void;
  dialogRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  const { t } = useLanguage();
  return (
    <Dialog
      size="s"
      role="alertdialog"
      title={title}
      titleId="get-team-dialog-title"
      descriptionId="get-team-dialog-description"
      icon={icon}
      tone={tone}
      onClose={onClose}
      closeLabel={t.commonClose}
      dialogRef={dialogRef}
    >
      <p className="app-dialog__text" id="get-team-dialog-description">{body}</p>
      {details}
      <div className="dialog-actions">{actions}</div>
    </Dialog>
  );
}

const PLACEHOLDER_FACT_WIDTHS = ["62%", "48%"];

function PlanContent({
  plan,
  publishes,
  formats,
  formatsNow,
}: {
  plan: GetTeamChangesPlan;
  publishes: boolean;
  formats: ReturnType<typeof useLanguage>["formats"];
  formatsNow: number;
}): React.JSX.Element {
  const { t } = useLanguage();
  const { forecast } = plan;
  const overlaps = forecast.outcome === "overlap";
  /* What happens first, then what stays safe in one line, last and in the
     success tone (DESIGN.md § Dialogs): two or three facts, not five. */
  const facts: DialogFact[] = [];
  if (plan.integration === "merge") {
    facts.push({ icon: <GitMerge />, text: overlaps ? t.bringInOverlaps : t.getTeamMergeFact(plan.localCount) });
  }
  if (publishes) {
    facts.push({ icon: <CloudUpload />, text: t.getTeamPublishFact(plan.localCount, plan.target.remote) });
  }
  if (forecast.combinedUnsavedCount > 0) {
    facts.push({
      icon: <Layers />,
      text: t.getTeamCombined(forecast.combinedUnsaved, forecast.combinedUnsavedCount),
    });
  }
  facts.push({
    icon: <ShieldCheck />,
    text: [
      overlaps ? t.bringInSafety : t.getTeamNothingOverlaps,
      forecast.carriedUnsavedCount > 0 ? t.getTeamCarried(forecast.carriedUnsavedCount) : null,
      overlaps ? null : t.getTeamRecoveryFirst,
    ].filter(Boolean).join(" "),
    safe: true,
  });

  return (
    <div className="get-team-plan">
      <DialogFacts facts={facts} />
      {overlaps && <>
        <ul className="get-team-overlaps" aria-label={t.getTeamOverlapTitle(plan.target.remote)}>
          {forecast.overlaps.map((overlap) => <li key={overlap.path}>
            <FileText aria-hidden="true" />
            <span className="get-team-overlaps__path">{overlap.path}</span>
            <small>{t.getTeamOverlapSide[overlap.side]}</small>
          </li>)}
        </ul>
        {forecast.overlapCount > forecast.overlaps.length && <p className="get-team-plan__bounded-note">{t.getTeamOverlapMore(forecast.overlapCount - forecast.overlaps.length)}</p>}
      </>}

      <details className="get-team-disclosure">
        <summary><ChevronDown aria-hidden="true" />{t.getTeamWhatComesIn}</summary>
        <ul
          {...autoHideScrollbarProps<HTMLUListElement>()}
          className="get-team-version-list auto-hide-scrollbar"
        >
          {plan.incomingVersions.map((version) => (
            <li key={version.commit}>
              <span>{version.title}</span>
              <small>
                {t.getTeamVersionMeta(
                  version.author,
                  formatRelativeTime(new Date(version.committedAt), formats, formatsNow),
                  version.fileCount,
                )}
              </small>
            </li>
          ))}
        </ul>
        {plan.versionsTruncated && (
          <p className="get-team-plan__bounded-note">
            {t.getTeamVersionsTruncated(plan.incomingVersions.length, plan.incomingCount)}
          </p>
        )}
      </details>

      <details className="get-team-disclosure get-team-technical">
        <summary><ChevronDown aria-hidden="true" />{t.syncTechnicalDetails}</summary>
        <dl>
          <div><dt>{t.getTeamIntegration}</dt><dd>{t.getTeamIntegrationKind[plan.integration]}</dd></div>
          <div><dt>{t.syncTrackingRef}</dt><dd>{plan.trackingRef}</dd></div>
          <div><dt>{t.syncLocalCommit}</dt><dd>{shortCommit(plan.localCommit)}</dd></div>
          <div><dt>{t.syncRemoteCommit}</dt><dd>{shortCommit(plan.remoteCommit)}</dd></div>
          {plan.mergeMessage && <div><dt>{t.getTeamMergeMessage}</dt><dd>{plan.mergeMessage}</dd></div>}
          <div><dt>{t.getTeamRecoveryReference}</dt><dd>{plan.recovery.reference}</dd></div>
        </dl>
      </details>
    </div>
  );
}
