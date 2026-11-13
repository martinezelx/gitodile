import React, { useEffect, useId, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleArrowUp,
  CircleFadingArrowUp,
  Info,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { useLanguage, type Language } from "../../i18n";
import { formatDate, formatRelativeCheckTime, type LocaleFormats } from "../../shared/i18n";
import { Dialog, Mascot, ReleaseHighlights, ToolGuideButton, ToolInstallationRow, useModalFocus, type ToolChip } from "../../shared/ui";
import type { AppUpdatesController, AppUpdatesSnapshot } from "./controller";
import { isDevelopmentBuild, type StartupUpdateConfirmation, type UpdateCandidate, type UpdateError, type UpdateHighlight, type UpdateState } from "./domain";
import { appUpdateTranslations, candidateFromState } from "./translations";

/** The build the reader is running. It lives in the app shell's release
 * model, which a feature may not import, so the shell passes it in. */
export type InstalledRelease = Readonly<{ version: string }>;

/** One bundled release as the integrated What's new shows it: the entry shape
 * the app shell's release model owns, restated here because a feature may not
 * import that module. The shell maps `APP_CHANGELOG` into it. */
export type SettingsReleaseEntry = Readonly<{
  version: string;
  date: string | null;
  highlights: readonly UpdateHighlight[];
}>;

function formatBytes(value: number, language: string): string {
  return new Intl.NumberFormat(language, { style: "unit", unit: "megabyte", maximumFractionDigits: 1 })
    .format(value / 1_048_576);
}

function errorState(state: UpdateState): UpdateError | null {
  return "error" in state ? state.error : null;
}

type StatusTone = "neutral" | "progress" | "success" | "accent" | "warning" | "danger";
type StatusLine = { tone: StatusTone; icon: React.JSX.Element; message: string };

/* The codes whose sentence sends the reader to the manual download. Anywhere
   else the download page cannot help — it is unreachable offline, and it does
   nothing for an edit the reader still has to finish — so it is not offered:
   a dead end offers the way out, and only where there is one. */
const MANUAL_DOWNLOAD_CODES: ReadonlySet<UpdateError["code"]> = new Set([
  "http_status", "feed_unavailable", "target_unavailable", "automatic_update_not_enabled",
  "install_handoff_failed", "post_install_unconfirmed", "not_configured", "internal",
]);

/** The native side sends an empty expected version when the handoff record
 * itself could not be read; the sentence then omits the unknown version. */
function unconfirmedMessage(confirmation: StartupUpdateConfirmation, language: Language): string {
  const t = appUpdateTranslations(language);
  const version = confirmation.kind === "unconfirmed" ? confirmation.expectedVersion.trim() : "";
  return version === "" ? t.startupUnconfirmedUnknown : t.startupUnconfirmed(version);
}

/** One line per state, in a tone the reader can take in before the words: the
 * same scale the Git installation row uses, so "up to date" looks the same
 * whether it is about Git or about the app.
 *
 * A failure *is* its explanation. The line used to say "The update could not
 * be completed." and a box under it said the same thing again with the cause
 * appended; now the cause is the line. */
function describeState(state: UpdateState, language: Language): StatusLine {
  const t = appUpdateTranslations(language);
  const spinner = <LoaderCircle aria-hidden="true" className="icon--spinning" />;
  switch (state.kind) {
    case "idle": return { tone: "neutral", icon: <Info aria-hidden="true" />, message: t.status.idle };
    case "checking": return { tone: "progress", icon: spinner, message: t.checking };
    case "current": return { tone: "success", icon: <CheckCircle2 aria-hidden="true" />, message: t.current };
    case "available": return { tone: "accent", icon: <CircleArrowUp aria-hidden="true" />, message: t.available(state.candidate.version) };
    case "downloading": return { tone: "progress", icon: spinner, message: t.downloading };
    case "verifying": return { tone: "progress", icon: spinner, message: t.verifying };
    case "ready": return { tone: "success", icon: <ShieldCheck aria-hidden="true" />, message: t.ready };
    case "blocked": return { tone: "warning", icon: <TriangleAlert aria-hidden="true" />, message: t.status.blocked };
    case "installing": return { tone: "progress", icon: spinner, message: t.installing };
    case "cancelled": return { tone: "neutral", icon: <Info aria-hidden="true" />, message: t.cancelled };
    case "unavailable": return isDevelopmentBuild(state)
      ? { tone: "neutral", icon: <Info aria-hidden="true" />, message: t.status.developmentBuild }
      : { tone: "warning", icon: <TriangleAlert aria-hidden="true" />, message: t.status.unavailable };
    case "failed": return { tone: "danger", icon: <CircleAlert aria-hidden="true" />, message: t.errors[state.error.code] };
  }
}

/** The cause the status line says in place of its verdict, if any: the cause
 * when the verdict alone (blocked, unavailable) would not say why, and the
 * adapter's safe detail whenever there is one. Never the same sentence twice.
 *
 * A specific cause replaces the generic sentence for its code: "The update
 * couldn't be completed" above "Update verification is not configured" said
 * one thing twice, the first time vaguely and under a verdict ("not
 * available") it contradicted. Only a blocked install keeps both — the
 * sentence says what to do, the detail names the work in the way. */
function describeDetail(state: UpdateState, language: Language): string[] {
  const t = appUpdateTranslations(language);
  const error = errorState(state);
  if (!error) return [];
  // An edit the reader left unfinished is named by its own feature, in the
  // reader's language, so it is the whole explanation.
  if (state.kind === "blocked" && error.blocker) return [t.installBlockedBy(error.blocker)];
  // The native side's safe detail is written in English. An English reader
  // gets it as the more specific cause; anyone else gets the sentence for
  // the code in their own language rather than a line in another one.
  const safeDetail = language === "en" ? error.safeDetail : null;
  if (safeDetail && state.kind !== "blocked") return [safeDetail];
  const lines: string[] = [];
  if (state.kind !== "failed") lines.push(t.errors[error.code]);
  if (safeDetail) lines.push(safeDetail);
  return lines;
}

/** The status, or its cause when it has one: a specific cause says what
 * happened better than the generic status, so it takes the status's place
 * rather than following it as a second sentence. */
function StatusLine({ line, cause = [], className = "" }: { line: StatusLine; cause?: string[]; className?: string }) {
  return (
    <p className={`status-line status-line--${line.tone} ${className}`.trim()} role="status" aria-live="polite" aria-atomic="true">
      {line.icon}
      <span>{cause.length > 0 ? cause.join(" ") : line.message}</span>
    </p>
  );
}

/* States whose status line says more than the Settings row's chip. */
const ROW_STATUS_STATES: ReadonlySet<UpdateState["kind"]> = new Set([
  "blocked", "unavailable", "failed",
]);

function Progress({ state, language }: { state: UpdateState; language: Language }) {
  const t = appUpdateTranslations(language);
  if (state.kind === "verifying") {
    return (
      <div className="app-update-progress-group">
        <div className="app-update-progress app-update-progress--indeterminate" role="progressbar" aria-label={t.verifying}><span /></div>
        <span>{t.verifying}</span>
      </div>
    );
  }
  if (state.kind !== "downloading") return null;
  const received = formatBytes(state.transfer.receivedBytes, language);
  if (state.transfer.length === "unknown") {
    return (
      <div className="app-update-progress-group">
        <div className="app-update-progress app-update-progress--indeterminate" role="progressbar" aria-label={t.received(received)}><span /></div>
        <span>{t.received(received)}</span>
      </div>
    );
  }
  const percent = Math.min(100, (state.transfer.receivedBytes / state.transfer.totalBytes) * 100);
  const total = formatBytes(state.transfer.totalBytes, language);
  return (
    <div className="app-update-progress-group">
      <div className="app-update-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label={t.progress(received, total)}>
        <span style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
      <span>{t.progress(received, total)}</span>
    </div>
  );
}

/** The chip's short state word, so the row answers "what is this?" at a glance
 * while the status line below says it in full. */
function describeChip(state: UpdateState, language: Language): ToolChip {
  const t = appUpdateTranslations(language);
  const spinner = <LoaderCircle aria-hidden="true" className="icon--spinning" />;
  switch (state.kind) {
    case "idle": return { label: t.chip.idle, tone: "neutral" };
    case "checking": return { label: t.chip.checking, tone: "neutral", icon: spinner };
    case "current": return { label: t.chip.current, tone: "success", icon: <CheckCircle2 aria-hidden="true" /> };
    case "available": return { label: t.chip.available(state.candidate.version), tone: "accent", icon: <CircleArrowUp aria-hidden="true" /> };
    case "downloading": return { label: t.chip.downloading, tone: "neutral", icon: spinner };
    case "verifying": return { label: t.chip.verifying, tone: "neutral", icon: spinner };
    case "ready": return { label: t.chip.ready, tone: "accent", icon: <ShieldCheck aria-hidden="true" /> };
    case "blocked": return { label: t.chip.blocked, tone: "warning", icon: <TriangleAlert aria-hidden="true" /> };
    case "installing": return { label: t.chip.installing, tone: "neutral", icon: spinner };
    case "cancelled": return { label: t.chip.cancelled, tone: "neutral" };
    case "unavailable": return isDevelopmentBuild(state)
      ? { label: t.chip.developmentBuild, tone: "neutral" }
      : { label: t.chip.unavailable, tone: "warning", icon: <TriangleAlert aria-hidden="true" /> };
    case "failed": return { label: t.chip.failed, tone: "danger", icon: <CircleAlert aria-hidden="true" /> };
  }
}

/** One bundled release's publication day, formatted for the reader, or null
 * for an unreadable date. A candidate carries a full ISO instant; a bundled
 * entry carries a `YYYY-MM-DD` day, which is parsed as local midnight the way
 * the changelog parses it, so it cannot slip a day backwards. */
function formatReleaseDate(value: string | null, formats: LocaleFormats): string | null {
  if (value === null) return null;
  const parsed = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : formatDate(parsed, formats);
}

function ReleaseBadge({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="whatsnew-badge">{children}</span>;
}

/** An earlier release: one compact line that opens onto its notes on request.
 * The running build is marked in the list because it is the one entry the
 * reader can place themselves against. */
function EarlierRelease({
  release,
  isInstalled,
  language,
}: {
  release: SettingsReleaseEntry;
  isInstalled: boolean;
  language: Language;
}): React.JSX.Element {
  const { formats } = useLanguage();
  const t = appUpdateTranslations(language);
  const [isExpanded, setIsExpanded] = useState(false);
  const notesId = useId();
  const releaseDate = formatReleaseDate(release.date, formats);

  return (
    <li className="whatsnew-entry">
      <button
        className="whatsnew-entry__trigger"
        type="button"
        aria-expanded={isExpanded}
        aria-controls={notesId}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <span className="whatsnew-entry__heading">
          <span className="whatsnew-entry__chevron" aria-hidden="true"><ChevronDown /></span>
          <span className="whatsnew-entry__identity">
            <h4>{release.version}</h4>
            {isInstalled
              ? <ReleaseBadge>{t.whatsNewYourVersion}</ReleaseBadge>
              : release.highlights.length > 0 && (
                <span className="whatsnew-entry__count">{t.whatsNewHighlightCount(release.highlights.length)}</span>
              )}
          </span>
          {releaseDate && release.date && (
            <time className="whatsnew-entry__date" dateTime={release.date}>{releaseDate}</time>
          )}
        </span>
      </button>
      {isExpanded && (release.highlights.length === 0
        ? <p id={notesId} className="whatsnew-empty">{t.whatsNewEmpty}</p>
        : <ReleaseHighlights id={notesId} highlights={release.highlights} language={language} />)}
    </li>
  );
}

/** The integrated What's new: the release the reader is offered or the build
 * they run, then every earlier version as a disclosure. It is the app's only
 * changelog, so every "What's new" in the app opens here. An offered release
 * whose feed carries no highlights (every release before the field existed)
 * shows its notes as bounded plain text instead. */
function WhatsNewSection({
  releases,
  installed,
  candidate,
  language,
  reveal,
}: {
  releases: readonly SettingsReleaseEntry[];
  installed: InstalledRelease;
  candidate: UpdateCandidate | null;
  language: Language;
  /** Brings the group into view and focus once mounted. */
  reveal: boolean;
}): React.JSX.Element | null {
  const { formats } = useLanguage();
  const t = appUpdateTranslations(language);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!reveal) return;
    const section = sectionRef.current;
    section?.scrollIntoView?.({ block: "start" });
    section?.focus({ preventScroll: true });
  }, [reveal]);
  const current = releases.find((release) => release.version === installed.version) ?? releases[0];
  if (!current) return null;
  const offered: SettingsReleaseEntry | null = candidate && candidate.version !== installed.version
    ? { version: candidate.version, date: candidate.publishedAt, highlights: candidate.highlights }
    : null;
  const featured = offered ?? current;
  const earlier = releases.filter((release) => release.version !== featured.version);
  const featuredDate = formatReleaseDate(featured.date, formats);
  const offeredNotes = offered && offered.highlights.length === 0 ? candidate?.notes.trim() ?? "" : "";

  return (
    <section ref={sectionRef} className="settings-group app-whats-new" aria-labelledby="app-whats-new-title" tabIndex={-1}>
      <header className="settings-group__header">
        <h3 id="app-whats-new-title">{t.highlights}</h3>
        <p>{t.whatsNewDescription}</p>
      </header>
      <article className="whatsnew-release">
        <div className="whatsnew-release__identity">
          <h3>{featured.version}</h3>
          {offered ? <ReleaseBadge>{t.whatsNewNewBadge}</ReleaseBadge> : <ReleaseBadge>{t.whatsNewYourVersion}</ReleaseBadge>}
          {featuredDate && featured.date && (
            <time className="whatsnew-release__date" dateTime={featured.date}>{featuredDate}</time>
          )}
        </div>
        {featured.highlights.length > 0
          ? <ReleaseHighlights highlights={featured.highlights} language={language} />
          : offered
            ? <p className="app-update-notes">{offeredNotes || t.noNotes}</p>
            : <p className="whatsnew-empty">{t.whatsNewEmpty}</p>}
      </article>
      {earlier.length > 0 && (
        <div className="whatsnew-earlier">
          <h4 className="whatsnew-earlier__heading">{t.whatsNewEarlierHeading}</h4>
          <ol className="whatsnew-list" role="list">
            {earlier.map((release) => (
              <EarlierRelease
                key={release.version}
                release={release}
                isInstalled={release.version === installed.version}
                language={language}
              />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

type RowAction = { label: string; run: () => void };

/** The row's one primary: the state's next step, always in the same place.
 * Checking never downloads, downloading never installs, and installing needs
 * this button — the hint beside it says what it does first. Work in flight has
 * no primary: the chip's spinner and the progress already say what is
 * happening, and a grey button repeating the chip's word offered nothing to
 * press. A block that a retry cannot clear (this build cannot update itself)
 * has none either; its cause and the manual download are the way forward. */
function primaryAction(state: UpdateState, controller: AppUpdatesController, language: Language): RowAction | null {
  const t = appUpdateTranslations(language);
  const act = (label: string, run: () => void): RowAction => ({ label, run });
  switch (state.kind) {
    case "checking":
    case "downloading":
    case "verifying":
    case "installing": return null;
    case "available": return act(
      state.candidate.expectedBytes ? t.downloadSized(formatBytes(state.candidate.expectedBytes, language)) : t.download,
      () => void controller.download(),
    );
    case "ready": return act(t.install, () => void controller.install());
    case "blocked": return state.error.retryable ? act(t.retry, () => void controller.install()) : null;
    case "current": return act(t.checkAgain, () => void controller.check());
    case "failed": return act(state.error.retryable ? t.retry : t.checkAgain, () => void controller.check());
    case "cancelled": return act(t.retry, () => void controller.check());
    /* A development build has nothing to check, and the line beside it says
       why; a disabled button would only repeat it. */
    case "unavailable": return isDevelopmentBuild(state) ? null : act(t.check, () => void controller.check());
    case "idle": return act(t.check, () => void controller.check());
  }
}

/** The Updates section of Settings, and the one place the app's update lives:
 * the installed build with its state, the next step, its progress and the
 * manual download and the one switch for automatic checks — with when it
 * checks and what is never sent beside it, as DESIGN.md requires — then What's
 * new. Every other way in (menus, palette, notification, About, the startup
 * toast) opens this section; nothing checks on mount. */
export function AppUpdateSettingsControl({
  snapshot,
  controller,
  installed,
  name,
  enabled,
  setEnabled,
  releases,
  revealWhatsNew = false,
}: {
  snapshot: AppUpdatesSnapshot;
  controller: AppUpdatesController;
  installed: InstalledRelease;
  /** The product name for the row's identity line; the shell owns it. */
  name: string;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  /** The bundled changelog, newest first. The shell owns the release model and
   * passes it in; without it the What's new group stays out. */
  releases?: readonly SettingsReleaseEntry[];
  /** Opened from a "What's new": land on that group rather than the top. */
  revealWhatsNew?: boolean;
}) {
  const { language, formats } = useLanguage();
  const t = appUpdateTranslations(language);
  const state = snapshot.state;
  const candidate = candidateFromState(state);
  const line = describeState(state, language);
  /* "Up to date" is a claim about a moment; the row names it, in the status
     bar's wording for a check. */
  const checkedAt = state.kind === "current" ? Date.parse(state.checkedAt) : Number.NaN;
  const checkedLine = Number.isNaN(checkedAt)
    ? null
    : t.checkedAt(formatRelativeCheckTime(checkedAt, Date.now(), formats.language, t.justNow));
  const detail = describeDetail(state, language);
  const primary = primaryAction(state, controller, language);
  const error = errorState(state);
  /* Cancel sits beside the primary while there is something to cancel. A
     manual check shows "checking" before native names its operation, and
     there is nothing to cancel until it does. */
  const cancellable = (state.kind === "checking" && state.operationId !== "") || state.kind === "downloading";
  const offersManual = error !== null && MANUAL_DOWNLOAD_CODES.has(error.code);
  const inFlight = state.kind === "checking" || state.kind === "downloading" || state.kind === "verifying" || state.kind === "installing";
  /* The build you have, every way to the next one and how it reaches you,
     then what changed — none named after the tab it sits in. */
  return (
    <div className="settings-groups">
      <section className="settings-group">
        <div className="settings-group__body">
          <ToolInstallationRow
            mark={<Mascot {...mascotForState(state)} />}
            name={name}
            chip={describeChip(state, language)}
            version={installed.version}
            versionLabel={t.installedLabel}
            facts={checkedLine && <span className="app-update-checked">{checkedLine}</span>}
            detail={<Progress state={state} language={language} />}
            /* The chip already names the state and the offered version; the
               line speaks only when it adds something: a cause or a failure. */
            status={detail.length > 0 || ROW_STATUS_STATES.has(state.kind) ? <StatusLine line={line} cause={detail} /> : null}
            /* Ready is the install confirmation: what installing does, said
               beside the one button that does it. */
            hint={state.kind === "ready" ? <p className="app-update-hint">{t.installExplanation}</p> : null}
            /* The manual download is one click away from every settled state,
               the way the Git and gh rows keep their official guide: a quiet
               link beside the actions. Work in flight leaves it out, and a
               cause that recommends it makes it the labelled secondary
               instead, so it is never offered twice. */
            docs={offersManual || inFlight ? null : (
              <ToolGuideButton label={t.manualFromGitHub} onClick={() => void controller.openManualDownload()} />
            )}
            recheck={cancellable ? (
              <button className="secondary-button" type="button" onClick={() => void controller.cancel()}>{t.cancel}</button>
            ) : offersManual ? (
              <button className="secondary-button" type="button" onClick={() => void controller.openManualDownload()}>{t.manual}</button>
            ) : null}
            primaryAction={primary && (
              <button className="primary-button" type="button" onClick={primary.run}>
                {primary.label}
              </button>
            )}
          />
          {/* How the next version reaches you belongs with the build it
              replaces: one switch needs no group title of its own. */}
          <div className="settings-row">
            <div><strong>{t.automaticLabel}</strong><p>{t.automaticDescription}</p></div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={t.automaticLabel}
              className={`toggle-switch${enabled ? " toggle-switch--on" : ""}`}
              onClick={() => setEnabled(!enabled)}
            ><span className="toggle-switch__knob" aria-hidden="true" /></button>
          </div>
        </div>
      </section>
      {releases && releases.length > 0 && (
        <WhatsNewSection releases={releases} installed={installed} candidate={candidate} language={language} reveal={revealWhatsNew} />
      )}
    </div>
  );
}

/**
 * The row's mascot carries the work in flight: it hops while the update is
 * checked, verified or installed, and fills from the feet up with a download
 * whose size is known. Settled states show it still.
 */
function mascotForState(state: UpdateState): { motion?: "hop"; progress?: number } {
  switch (state.kind) {
    case "checking":
    case "verifying":
    case "installing":
      return { motion: "hop" };
    case "downloading":
      return state.transfer.length === "known" && state.transfer.totalBytes > 0
        ? { progress: state.transfer.receivedBytes / state.transfer.totalBytes }
        : { motion: "hop" };
    default:
      return {};
  }
}

/**
 * The one update moment that interrupts: the app restarted after an install
 * and is not on the version it was handed. It says so in one sentence and
 * offers both ways forward — a fresh check, in Settings › Updates where every
 * other update state lives, and the manual download. Nothing else opens it.
 */
export function AppUpdateRestartDialog({
  isOpen,
  setOpen,
  confirmation,
  controller,
  installed,
  onCheckAgain,
}: {
  isOpen: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  confirmation: StartupUpdateConfirmation;
  controller: AppUpdatesController;
  installed: InstalledRelease;
  /** Closes this dialog onto Settings › Updates and checks there. */
  onCheckAgain: () => void;
}) {
  const { language, t: appT } = useLanguage();
  const t = appUpdateTranslations(language);
  const dialogRef = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  useModalFocus(isOpen, dialogRef, setOpen);

  if (!isOpen) return null;
  const line: StatusLine = { tone: "warning", icon: <CircleAlert aria-hidden="true" />, message: unconfirmedMessage(confirmation, language) };
  return (
    <Dialog
      size="m"
      title={t.titleUnconfirmed}
      titleId="app-update-title"
      subtitle={
        <span className="app-update-dialog__installed" aria-label={`${t.installedLabel} ${installed.version}`}>
          {t.installedSubtitle(installed.version)}
        </span>
      }
      descriptionId={descriptionId}
      icon={<CircleFadingArrowUp />}
      tone="app"
      onClose={() => setOpen(false)}
      closeLabel={appT.commonClose}
      dialogRef={dialogRef}
      className="app-update-dialog"
    >
      <div id={descriptionId} className="app-update-dialog__state">
        <StatusLine line={line} />
      </div>
      <div className="dialog-actions app-update-actions">
        <button className="secondary-button" type="button" onClick={() => void controller.openManualDownload()}>{t.manual}</button>
        <button className="primary-button" type="button" onClick={() => { setOpen(false); onCheckAgain(); }}>{t.checkAgain}</button>
      </div>
    </Dialog>
  );
}
