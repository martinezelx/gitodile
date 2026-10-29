import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  CloudUpload,
  FileX,
  Files,
  GitMerge,
  Info,
  ListChecks,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import type { Translations } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { Dialog, DialogBanner, DialogFacts, TextPlaceholder, useModalFocus } from "../../shared/ui";
import { FailureDetail } from "../save-version";
import type { ConflictsController } from "./controller";
import { sideName, type AbortMergePlan, type ConflictSession, type FinishMergeResult } from "./domain";
import type { ResolutionSlot } from "./FileResolution";
import type { ConflictsQuery } from "./port";

/* Finishing and abandoning the merge (task 037-5): two plans, each read from
   Rust when its dialog opens and proved again when it runs. Neither is
   leaving the screen, saving a version or marking a file resolved, and
   neither publishes. */

function errorCode(error: unknown): string | null {
  return isAppError(error) ? error.code : null;
}

/** Escape and the backdrop close the dialog unless its change is running. */
function useDialogFocus(isRunning: boolean, onClose: () => void): React.RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const setOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((next) => {
    const value = typeof next === "function" ? next(true) : next;
    if (!value && !isRunningRef.current) onCloseRef.current();
  }, []);
  useModalFocus(true, dialogRef, setOpen);
  return dialogRef;
}

/** Runs one of the two changes in the project's mutation slot, with the one
 * coordinated refresh after a success. `null` when the slot was refused. */
async function inSlot<T>(
  slot: ResolutionSlot,
  run: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown } | null> {
  if (!slot.onOperationStart()) return null;
  slot.onOperationPhaseChange("executing");
  try {
    const value = await run();
    slot.onOperationPhaseChange("success");
    slot.onChanged();
    return { ok: true, value };
  } catch (error) {
    slot.onOperationPhaseChange("error");
    // Git may have changed the project before GitOdile lost track of it:
    // the coordinated refresh reads what it left.
    if (errorCode(error) === "merge_outcome_uncertain") slot.onChanged();
    return { ok: false, error };
  } finally {
    slot.onOperationFinish();
  }
}

/** Reads a plan when the dialog opens and again on demand; the answer of an
 * older read never replaces a newer one. */
function usePlan<P>(read: () => Promise<P>): {
  plan: P | null;
  error: unknown;
  reread: () => void;
} {
  const [state, setState] = useState<{ plan: P | null; error: unknown }>({ plan: null, error: null });
  const [generation, setGeneration] = useState(0);
  const readRef = useRef(read);
  readRef.current = read;
  useEffect(() => {
    let current = true;
    readRef
      .current()
      .then((plan) => current && setState({ plan, error: null }))
      .catch((error: unknown) => current && setState({ plan: null, error }));
    return () => {
      current = false;
    };
  }, [generation]);
  const reread = useCallback(() => {
    setState((previous) => ({ plan: previous.plan, error: null }));
    setGeneration((value) => value + 1);
  }, []);
  return { ...state, reread };
}

type FinishStep =
  | { kind: "form" }
  | { kind: "running" }
  | { kind: "failed"; error: unknown }
  | { kind: "done"; result: FinishMergeResult };

export function FinishMergeDialog({
  controller,
  query,
  session,
  runHooks,
  slot,
  onClose,
  onDone,
  onPublish,
  t,
}: {
  controller: ConflictsController;
  query: ConflictsQuery;
  session: ConflictSession;
  runHooks: boolean;
  slot: ResolutionSlot;
  onClose: () => void;
  /** Back to the screen the reader came from. */
  onDone: () => void;
  onPublish: () => void;
  t: Translations;
}): React.JSX.Element {
  const { plan, error: planError, reread } = usePlan(() => controller.port.planFinish(query));
  const [step, setStep] = useState<FinishStep>({ kind: "form" });
  const [title, setTitle] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [showTitleError, setShowTitleError] = useState(false);
  const isRunning = step.kind === "running";
  const dialogRef = useDialogFocus(isRunning, step.kind === "done" ? onDone : onClose);
  const current = sideName(session.operation.current) ?? t.conflictsCurrentFallback;
  const incoming = sideName(session.operation.incoming) ?? t.conflictsIncomingFallback;
  // The message Git prepared is the draft until the reader edits it.
  const titleValue = title ?? plan?.title ?? "";
  const detailsValue = details ?? plan?.description ?? "";

  const confirm = async (): Promise<void> => {
    if (!plan) return;
    if (!titleValue.trim()) {
      setShowTitleError(true);
      return;
    }
    setStep({ kind: "running" });
    const outcome = await inSlot(slot, () =>
      controller.end(query, (port) =>
        port.finish({
          ...query,
          title: titleValue,
          description: detailsValue.trim() ? detailsValue : null,
          stateToken: plan.stateToken,
          runHooks,
        }),
      ),
    );
    if (outcome === null) {
      setStep({ kind: "form" });
    } else if (outcome.ok) {
      setStep({ kind: "done", result: outcome.value });
    } else {
      setStep({ kind: "failed", error: outcome.error });
      // A moved project needs a new plan before anything else is tried.
      if (errorCode(outcome.error) === "stale_conflict_session") reread();
    }
  };

  if (step.kind === "done") {
    return (
      <Dialog
        size="m"
        title={t.conflictsFinishDoneTitle}
        titleId="conflicts-finish-title"
        icon={<Check />}
        tone="success"
        onClose={onDone}
        closeLabel={t.commonClose}
        dialogRef={dialogRef}
      >
        <p className="app-dialog__text" role="status">
          {t.conflictsFinishDoneBody(step.result.title, step.result.branch ?? current)}
        </p>
        {/* Publishing is the next step a reader may take, never one taken
            for them: Publish shows its own plan and asks its own question. */}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onDone}>{t.saveVersionDone}</button>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              onDone();
              onPublish();
            }}
          >
            <CloudUpload aria-hidden="true" />
            {t.saveVersionPublishNow}
          </button>
        </div>
      </Dialog>
    );
  }

  const blocked = !plan && planError !== null;
  if (blocked) {
    return (
      <Dialog
        size="s"
        role="alertdialog"
        title={t.conflictsFinishBlockedTitle}
        titleId="conflicts-finish-title"
        icon={<CircleAlert />}
        tone="warning"
        onClose={onClose}
        closeLabel={t.commonClose}
        dialogRef={dialogRef}
      >
        <p className="app-dialog__text" role="alert">{localizeAppError(planError, t, t.conflictsActionErrorTitle)}</p>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>{t.commonClose}</button>
          <button className="primary-button" type="button" onClick={reread}>{t.conflictsTryAgain}</button>
        </div>
      </Dialog>
    );
  }

  const failure = step.kind === "failed" ? step.error : null;
  const failureCode = errorCode(failure);
  // Git may already have done it: the screen shows what it left, and no
  // second attempt is offered on a plan that may no longer describe it.
  const uncertain = failureCode === "merge_outcome_uncertain";
  return (
    <Dialog
      size="m"
      title={t.conflictsFinishTitle}
      titleId="conflicts-finish-title"
      subtitle={t.conflictsFinishSubtitle(incoming, current)}
      icon={<GitMerge />}
      tone="local"
      onClose={onClose}
      closeLabel={t.commonClose}
      dismissible={!isRunning}
      dialogRef={dialogRef}
    >
      {plan ? (
        <DialogFacts
          facts={[
            { icon: <Files />, text: t.conflictsFinishFactSaves(current, plan.totalFiles, plan.resolvedFiles) },
            { icon: <ListChecks />, text: t.conflictsFinishFactChecks(runHooks, plan.signs) },
            { icon: <ShieldCheck />, text: t.conflictsFinishFactSafe(plan.unsavedFiles), safe: true },
          ]}
        />
      ) : (
        <div className="conflicts-plan-placeholder" aria-hidden="true">
          <TextPlaceholder width="80%" />
          <TextPlaceholder width="64%" />
          <TextPlaceholder width="72%" />
        </div>
      )}

      {plan && plan.editedAfterResolving > 0 && (
        <DialogBanner tone="warning" icon={<TriangleAlert />}>
          <p>{t.conflictsFinishEditedAfterResolving(plan.editedAfterResolving)}</p>
        </DialogBanner>
      )}

      <label className="text-field save-version-title">
        <span>{t.saveVersionTitleLabel}</span>
        <input
          type="text"
          value={titleValue}
          required
          disabled={isRunning || !plan}
          aria-invalid={showTitleError || undefined}
          aria-describedby={showTitleError ? "conflicts-finish-title-error" : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            setShowTitleError(false);
          }}
        />
      </label>
      {showTitleError && (
        <span id="conflicts-finish-title-error" className="save-version-title__error" role="alert">
          {t.errorEmptyTitle}
        </span>
      )}
      <label className="text-field save-version-description">
        <span>{t.saveVersionDescriptionLabel}</span>
        <textarea
          rows={3}
          value={detailsValue}
          disabled={isRunning || !plan}
          onChange={(event) => setDetails(event.target.value)}
        />
      </label>

      {failure !== null && (
        <DialogBanner tone={failureCode === "stale_conflict_session" ? "info" : "danger"} icon={failureCode === "stale_conflict_session" ? <Info /> : <CircleAlert />}>
          <p role="alert">
            {failureCode === "stale_conflict_session"
              ? t.conflictsPlanReread
              : localizeAppError(failure, t, t.conflictsActionErrorTitle)}
          </p>
          {/* A hook's output is the reason it refused, so it opens with it. */}
          <FailureDetail
            key={failureCode ?? "failure"}
            error={failure}
            t={t}
            startExpanded={failureCode === "hook_rejected"}
          />
        </DialogBanner>
      )}

      {plan && (
        <details className="app-dialog__details">
          <summary>{t.conflictsTechnicalDetails}</summary>
          <pre>{[
            `git commit${runHooks ? "" : " --no-verify"} -m <message>`,
            `HEAD ${session.operation.current.commit ?? ""}`,
            `MERGE_HEAD ${session.operation.operationHeads.join(" ")}`,
            plan.snapshot?.pinReference ? `${t.conflictsDetailSnapshot}: ${plan.snapshot.pinReference}` : null,
          ].filter(Boolean).join("\n")}</pre>
        </details>
      )}

      <div className="dialog-actions">
        {uncertain ? (
          <button className="primary-button" type="button" onClick={onClose}>{t.commonClose}</button>
        ) : (
          <>
            <button className="secondary-button" type="button" onClick={onClose} disabled={isRunning}>{t.commonCancel}</button>
            <button
              className="primary-button"
              type="button"
              disabled={isRunning || !plan}
              onClick={() => void confirm()}
            >
              {isRunning || !plan ? (
                <>
                  <LoaderCircle aria-hidden="true" className="icon--spinning" />
                  {isRunning ? t.conflictsFinishRunning : t.saveVersionChecking}
                </>
              ) : (
                t.conflictsFinishConfirm
              )}
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}

export function AbortMergeDialog({
  controller,
  query,
  session,
  slot,
  onClose,
  onDone,
  t,
}: {
  controller: ConflictsController;
  query: ConflictsQuery;
  session: ConflictSession;
  slot: ResolutionSlot;
  onClose: () => void;
  onDone: (plan: AbortMergePlan) => void;
  t: Translations;
}): React.JSX.Element {
  const { plan, error: planError, reread } = usePlan(() => controller.port.planAbort(query));
  const [isRunning, setIsRunning] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const dialogRef = useDialogFocus(isRunning, onClose);
  const current = sideName(session.operation.current) ?? t.conflictsCurrentFallback;
  const incoming = sideName(session.operation.incoming) ?? t.conflictsIncomingFallback;
  const failureCode = errorCode(failure);

  const confirm = async (): Promise<void> => {
    if (!plan) return;
    setIsRunning(true);
    setFailure(null);
    const outcome = await inSlot(slot, () =>
      controller.end(query, (port) => port.abort({ ...query, stateToken: plan.stateToken })),
    );
    setIsRunning(false);
    if (outcome === null) return;
    if (outcome.ok) {
      onDone(plan);
      return;
    }
    setFailure(outcome.error);
    if (errorCode(outcome.error) === "stale_conflict_session" || errorCode(outcome.error) === "merge_abort_refused") {
      reread();
    }
  };

  return (
    <Dialog
      size="s"
      title={t.conflictsAbortTitle}
      titleId="conflicts-abort-title"
      icon={<Undo2 />}
      tone="danger"
      onClose={onClose}
      closeLabel={t.commonClose}
      dismissible={!isRunning}
      dialogRef={dialogRef}
    >
      <p className="app-dialog__text">{t.conflictsAbortBody(incoming, current)}</p>
      {plan ? (
        <>
          {/* Never a promise without evidence (ADR 0041 §6): a merge started
              elsewhere says what Git can and cannot bring back. */}
          {plan.restoration === "best-effort" && (
            <DialogBanner tone="info" icon={<Info />}>
              <p>{t.conflictsAbortBestEffort}</p>
            </DialogBanner>
          )}
          <DialogFacts
            facts={[
              { icon: <FileX />, text: t.conflictsAbortFactFiles(plan.files) },
              ...(plan.unsavedFiles > 0
                ? [{ icon: <Files />, text: t.conflictsAbortFactUnsaved(plan.unsavedFiles, plan.restoration === "exact") }]
                : []),
              { icon: <ShieldCheck />, text: t.conflictsAbortFactKept, safe: true },
            ]}
          />
        </>
      ) : planError !== null ? (
        <DialogBanner tone="danger" icon={<CircleAlert />}>
          <p role="alert">{localizeAppError(planError, t, t.conflictsActionErrorTitle)}</p>
        </DialogBanner>
      ) : (
        <div className="conflicts-plan-placeholder" aria-hidden="true">
          <TextPlaceholder width="84%" />
          <TextPlaceholder width="70%" />
        </div>
      )}
      {failure !== null && (
        <DialogBanner tone={failureCode === "stale_conflict_session" ? "info" : "danger"} icon={failureCode === "stale_conflict_session" ? <Info /> : <CircleAlert />}>
          <p role="alert">
            {failureCode === "stale_conflict_session"
              ? t.conflictsPlanReread
              : localizeAppError(failure, t, t.conflictsActionErrorTitle)}
          </p>
          <FailureDetail key={failureCode ?? "failure"} error={failure} t={t} />
        </DialogBanner>
      )}
      {plan && (
        <details className="app-dialog__details">
          <summary>{t.conflictsTechnicalDetails}</summary>
          <pre>{[
            "git merge --abort",
            `${t.conflictsDetailOrigin}: ${plan.origin === "gitodile" ? t.conflictsOriginGitodile : t.conflictsOriginExternal}`,
            plan.snapshot?.pinReference ? `${t.conflictsDetailSnapshot}: ${plan.snapshot.pinReference}` : null,
          ].filter(Boolean).join("\n")}</pre>
        </details>
      )}
      <div className="dialog-actions">
        {failureCode === "merge_outcome_uncertain" ? (
          <button className="primary-button" type="button" onClick={onClose}>{t.commonClose}</button>
        ) : (
          <button className="secondary-button" type="button" onClick={onClose} disabled={isRunning}>{t.commonCancel}</button>
        )}
        {failureCode === "merge_outcome_uncertain" ? null : planError !== null && !plan ? (
          <button className="primary-button" type="button" onClick={reread}>{t.conflictsTryAgain}</button>
        ) : (
          <button className="danger-button" type="button" disabled={isRunning || !plan} onClick={() => void confirm()}>
            {isRunning && <LoaderCircle aria-hidden="true" className="icon--spinning" />}
            {isRunning ? t.conflictsAbortRunning : t.conflictsAbortConfirm}
          </button>
        )}
      </div>
    </Dialog>
  );
}
