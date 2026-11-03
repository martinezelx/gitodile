import { useEffect, useRef } from "react";
import { Bug, Check, CircleAlert, ClipboardPaste, FileLock, ShieldCheck, X } from "lucide-react";
import { useLanguage } from "../i18n";
import { autoHideScrollbarProps } from "../shared/ui/autoHideScrollbar";
import { Dialog, DialogFacts } from "../shared/ui/dialog";
import { TextPlaceholder } from "../shared/ui/loadingPlaceholder";
import { useModalFocus } from "../shared/ui/modalFocus";
import type { IssueReportState } from "./useIssueReport";

/** Long enough for a sentence, short enough to keep the address well clear of
 * GitHub's limit. */
const TITLE_MAX_LENGTH = 120;

export function IssueReportDialog({ report }: { report: IssueReportState }): React.JSX.Element | null {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(report.isOpen, ref, report.dismiss);
  // The modal places focus once, when it opens. A later step replaces the
  // control that held it, which would drop focus to the page behind the
  // dialog, so each new step lands on its own primary again.
  useEffect(() => {
    if (report.phase === "finish" || report.phase === "failed") {
      ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
  }, [report.phase]);
  if (!report.isOpen) return null;

  const reviewing = report.phase === "review" || report.phase === "opening";
  const isFailed = report.phase === "failed" && report.failedUrl !== null;
  const finishing = report.phase === "finish";
  const isShort = isFailed || finishing;
  const copied = report.copyReportState === "done";
  const reportStatus = report.saveState === "failed"
    ? t.issueReportSaveFailed
    : report.saveState === "done"
      ? t.issueReportSaved
      : "";
  // The steps already say whether the first copy happened; the status line
  // answers only what was pressed here.
  const finishStatus = report.saveState === "failed"
    ? t.issueReportSaveFailed
    : report.saveState === "done"
      ? t.issueReportSaved
      : !report.recopied
        ? ""
        : report.copyReportState === "failed"
          ? t.issueReportCopyReportFailed
          : copied
            ? t.issueReportReportCopied
            : "";

  return (
    <Dialog
      size={isShort ? "s" : "l"}
      role={isFailed ? "alertdialog" : "dialog"}
      title={report.phase === "preparing" ? t.issueReportPreparingTitle : isFailed ? t.issueReportFailedTitle : finishing ? t.issueReportFinishTitle : t.issueReportReviewTitle}
      titleId="issue-report-title"
      subtitle={reviewing ? <span id="issue-report-description">{t.issueReportReviewMessage}</span> : undefined}
      descriptionId={isFailed ? "issue-report-error-message" : "issue-report-description"}
      icon={isFailed ? <CircleAlert /> : <Bug />}
      tone={isFailed ? "warning" : "app"}
      onClose={report.dismiss}
      closeLabel={t.commonClose}
      dialogRef={ref}
      className="issue-report-dialog"
      bodyProps={{ "aria-busy": report.phase === "preparing" || report.phase === "opening" }}
    >
      {/* The review's own shape while the report is gathered: the frame it
          will fill and the actions held back (DESIGN.md § Dialogs). */}
      {report.phase === "preparing" && (
        <>
          <p className="visually-hidden" id="issue-report-description" role="status">{t.issueReportPreparingMessage}</p>
          <div className="issue-report-dialog__report" aria-hidden="true">
            <div className="issue-report-dialog__report-body issue-report-dialog__report-body--placeholder">
              <TextPlaceholder width="54%" />
              <TextPlaceholder width="38%" />
              <TextPlaceholder width="66%" />
            </div>
          </div>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={report.dismiss}>{t.commonCancel}</button>
            <button className="secondary-button" type="button" disabled>{t.issueReportSaveReport}</button>
            <button className="primary-button" type="button" disabled>{t.issueReportContinue}</button>
          </div>
        </>
      )}

      {reviewing && report.reportText !== null && (
        <>
          <DialogFacts
            label={t.issueReportFactsLabel}
            facts={[
              { icon: <FileLock />, text: t.issueReportFactContents },
              { icon: <ShieldCheck />, text: t.issueReportFactSafe, safe: true },
            ]}
          />
          <label className="text-field">
            <span>{t.issueReportTitleLabel}</span>
            <input
              type="text"
              value={report.title}
              maxLength={TITLE_MAX_LENGTH}
              placeholder={t.issueReportTitlePlaceholder}
              disabled={report.phase === "opening"}
              onChange={(event) => report.setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) void report.continueToGitHub();
              }}
            />
          </label>
          {/* The report is shown exactly as it will be published. Re-rendering
              its parts as labelled chips reads tidier but shows the user a
              depiction of the payload rather than the payload, which is the
              one thing this consent step exists to prevent. Leaving the
              activity out therefore changes the text shown here too. */}
          {/* The frame and the scroller are two elements on purpose: an
              element's own border-radius does not clip the scrollbar it
              paints, so a rounded viewer let the thumb spill past the corner
              curve. The frame clips; the <pre> scrolls inside it. */}
          <div className="issue-report-dialog__report">
            <div className="issue-report-dialog__report-head">
              <span className="issue-report-dialog__report-heading">{t.issueReportContentsHeading}</span>
              <label className="app-dialog__check">
                <input
                  className="app-checkbox"
                  type="checkbox"
                  checked={report.includeActivity}
                  disabled={report.phase === "opening"}
                  onChange={(event) => report.setIncludeActivity(event.target.checked)}
                />
                {t.issueReportIncludeActivity}
              </label>
            </div>
            <pre
              {...autoHideScrollbarProps<HTMLPreElement>()}
              className="issue-report-dialog__report-body auto-hide-scrollbar"
              role="region"
              aria-label={t.issueReportContentsLabel}
              tabIndex={0}
            >{report.reportText}</pre>
          </div>
          <div className="app-dialog__foot">
            <p className="app-dialog__note issue-report-dialog__status" role="status">
              {reportStatus || (report.includeActivity ? t.issueReportCopyNote : "")}
            </p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" disabled={report.phase === "opening"} onClick={report.dismiss}>
                {t.commonCancel}
              </button>
              <button className="secondary-button" type="button" disabled={report.phase === "opening" || report.saveState === "working"} onClick={() => void report.saveReport()}>
                {report.saveState === "working" ? t.issueReportSaving : t.issueReportSaveReport}
              </button>
              <button className="primary-button" type="button" data-autofocus disabled={report.phase === "opening"} onClick={() => void report.continueToGitHub()}>
                {report.phase === "opening" ? t.issueReportOpening : report.includeActivity ? t.issueReportContinue : t.issueReportContinueWithoutCopy}
              </button>
            </div>
          </div>
        </>
      )}

      {/* What is left once the browser has the form: the paste. The reader may
          come back here without having pasted, which is the step a clipboard
          hand-off otherwise loses. */}
      {finishing && (
        <>
          <ol className="app-dialog__steps" id="issue-report-description" aria-label={t.issueReportFinishStepsLabel}>
            <li className={`app-dialog__step ${copied ? "app-dialog__step--done" : "issue-report-dialog__step--missed"}`}>
              <span className="app-dialog__step-dot" aria-hidden="true">{copied ? <Check /> : <X />}</span>
              {copied ? t.issueReportStepCopied : t.issueReportStepNotCopied}
            </li>
            <li className="app-dialog__step app-dialog__step--done">
              <span className="app-dialog__step-dot" aria-hidden="true"><Check /></span>
              {t.issueReportStepOpened}
            </li>
            <li className="app-dialog__step issue-report-dialog__step--todo" aria-current="step">
              <span className="app-dialog__step-dot" aria-hidden="true"><ClipboardPaste /></span>
              {t.issueReportStepPaste}
            </li>
          </ol>
          {/* The live region stays mounted so a result is announced, but it
              takes no row until there is one to show. */}
          <p className={finishStatus ? "issue-report-dialog__status" : "visually-hidden"} role="status">
            {finishStatus}
          </p>
          <div className="dialog-actions">
            {!copied && (
              <button className="secondary-button" type="button" disabled={report.saveState === "working"} onClick={() => void report.saveReport()}>
                {report.saveState === "working" ? t.issueReportSaving : t.issueReportSaveReport}
              </button>
            )}
            <button className="secondary-button" type="button" disabled={report.copyReportState === "working"} onClick={() => void report.copyReport()}>
              {t.issueReportCopyReport}
            </button>
            <button className="primary-button" type="button" data-autofocus onClick={report.dismiss}>{t.issueReportDone}</button>
          </div>
        </>
      )}

      {isFailed && report.failedUrl !== null && (
        <>
          <p className="app-dialog__text" id="issue-report-error-message">{t.issueReportFailedMessage}</p>
          {/* The copy button sits beside the field, outside its label, so the
              field's name stays "Report link" and not the button's words too. */}
          <div className="text-field">
            <span id="issue-report-link-label">{t.issueReportLink}</span>
            <span className="issue-report-dialog__link">
              <input readOnly aria-labelledby="issue-report-link-label" value={report.failedUrl} onFocus={(event) => event.currentTarget.select()} />
              <button className="secondary-button" type="button" disabled={report.copyLinkState === "working"} onClick={() => void report.copyLink()}>{t.issueReportCopyLink}</button>
            </span>
          </div>
          <p className="issue-report-dialog__status" role="status">{report.copyLinkState === "failed" ? t.issueReportCopyFailed : report.copyLinkState === "done" ? t.issueReportCopied : ""}</p>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={report.dismiss}>{t.commonClose}</button>
            <button className="primary-button" type="button" data-autofocus onClick={() => void report.retry()}>{t.issueReportRetry}</button>
          </div>
        </>
      )}
    </Dialog>
  );
}
