import React, { useId } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CircleAlert,
  Cloud,
  CloudCog,
  CloudOff,
  CloudUpload,
  Eye,
  GitBranch,
  GitMerge,
  History,
  LoaderCircle,
  RotateCw,
  Save,
  Split,
  TriangleAlert,
  Unlink,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { forecastBlockerCopy } from "../sync";
import type { Journey } from "./journey";
import type { NextStep, NextStepAction, NextStepKind, NextStepNote } from "./nextStep";
import { NextStepPlaceholder } from "./OverviewPlaceholder";

export type NextStepHandlers = Record<NextStepAction, () => void>;

const KIND_ICONS: Record<NextStepKind, React.JSX.Element> = {
  loading: <LoaderCircle className="icon--spinning" />,
  localError: <CircleAlert />,
  conflicts: <Split />,
  save: <Save />,
  firstSave: <Save />,
  publish: <CloudUpload />,
  unpublished: <CloudUpload />,
  behind: <ArrowDownToLine />,
  diverged: <Split />,
  overlap: <TriangleAlert />,
  incomingBlocked: <CircleAlert />,
  checking: <LoaderCircle className="icon--spinning" />,
  notChecked: <Cloud />,
  unavailable: <CircleAlert />,
  noRemote: <Check />,
  noUpstream: <CloudCog />,
  upstreamGone: <CloudOff />,
  detached: <History />,
  unborn: <Save />,
  upToDate: <Check />,
};

const ACTION_ICONS: Record<NextStepAction, React.JSX.Element> = {
  save: <Save aria-hidden="true" />,
  reviewChanges: <Eye aria-hidden="true" />,
  resolve: <TriangleAlert aria-hidden="true" />,
  publish: <CloudUpload aria-hidden="true" />,
  openHistory: <History aria-hidden="true" />,
  getChanges: <ArrowDownToLine aria-hidden="true" />,
  checkRemote: <RotateCw aria-hidden="true" />,
  checkLocal: <RotateCw aria-hidden="true" />,
  openSettings: <Cloud aria-hidden="true" />,
  openBranches: <GitBranch aria-hidden="true" />,
  explainIncoming: <Eye aria-hidden="true" />,
  getAndPublish: <CloudUpload aria-hidden="true" />,
  switchToDefault: <GitBranch aria-hidden="true" />,
  stopTracking: <Unlink aria-hidden="true" />,
};

/**
 * The one card that says what to do now, and why, with the button that does
 * it. Its title leads: no caption above it and no steps beside it — the
 * glyph's colour says what kind of step this is.
 *
 * The state's colour washes in from the card's top-left corner (Linear's and
 * Arc's highlighted cards) and tints its edge, from the theme's own status
 * tokens; with nothing waiting the card is plain. It is always one colour:
 * what comes after this step is said in a neutral pill, never in a second
 * hue. The primary button keeps the theme's accent in every state but
 * overlaps, so "the action" is always the same colour.
 */
export function NextStepCard({
  nextStep,
  journey,
  handlers,
  defaultBranch = null,
}: {
  nextStep: NextStep;
  journey: Journey;
  handlers: NextStepHandlers;
  /** Names the switch action's destination. */
  defaultBranch?: string | null;
}): React.JSX.Element {
  const { t } = useLanguage();
  const titleId = useId();
  const { changes, publish } = journey;
  const { kind, tone, primary, secondary, isPending, then, note } = nextStep;
  const remote = publish.remote;
  const forecast = publish.forecast;
  const isMerge = forecast?.integration === "merge";
  const from = forecast ? t.getTeamFrom(forecast.authors, forecast.authorCount) : "";
  // The project not read yet: the card's shape, as on the whole screen's
  // placeholder, so it fills in place instead of saying "checking" first.
  if (kind === "loading") return <NextStepPlaceholder label={t.overviewJourneyNoteIdle} />;

  let title: string;
  let hint: string;
  switch (kind) {
    case "localError": title = t.statusCheckFailedTitle; hint = t.statusCouldntCheck; break;
    case "conflicts":
      // Every file resolved, but Git still holds the operation open.
      if (changes.conflicted === 0) {
        title = t.overviewNextPausedTitle;
        hint = t.overviewNextPausedHint;
      } else {
        title = t.overviewNextConflictsTitle(changes.conflicted);
        hint = t.overviewNextConflictsHint;
      }
      break;
    case "save": title = t.overviewNextSaveTitle(changes.total); hint = t.overviewJourneyNoteSave; break;
    case "firstSave": title = t.overviewNextFirstSaveTitle; hint = t.overviewNextFirstSaveHint(changes.total); break;
    case "publish": title = t.overviewNextPublishTitle(publish.pending, remote); hint = t.overviewJourneyNoteAhead; break;
    case "unpublished": title = t.overviewJourneyReadyToPublish(publish.pending); hint = t.overviewJourneyNoteAhead; break;
    case "behind":
      title = t.overviewNextBehindTitle(publish.behind, remote);
      hint = forecast ? t.overviewNextFromHint(from, forecast.incomingFileCount) : t.syncBehindMessage;
      break;
    case "diverged":
      if (forecast) {
        title = t.overviewNextDivergedBoth(publish.behind, forecast.localCount, remote);
        hint = t.overviewNextFromHint(from, forecast.incomingFileCount);
      } else {
        title = t.overviewNextDivergedTitle(publish.behind);
        hint = t.overviewNextDivergedHint(remote);
      }
      break;
    case "overlap": {
      const first = forecast?.overlaps[0]?.path ?? "";
      title = t.overviewNextOverlapTitle(remote);
      hint = t.overviewNextOverlapHint(first, Math.max(0, (forecast?.overlapCount ?? 1) - 1));
      break;
    }
    case "incomingBlocked": {
      const copy = forecast?.blocker
        ? forecastBlockerCopy(forecast.blocker, remote ?? "", t)
        : { title: t.getTeamBlockedTitle, body: t.syncBehindMessage };
      title = copy.title;
      hint = copy.body;
      break;
    }
    case "checking": title = t.syncChecking; hint = t.syncCheckingMessage; break;
    case "notChecked": title = t.syncNotCheckedTitle; hint = t.syncNotCheckedMessage; break;
    case "unavailable": title = t.overviewNextUnavailableTitle(remote); hint = t.overviewNextUnavailableHint; break;
    case "noRemote": title = t.overviewNextNoRemoteTitle; hint = t.overviewNextNoRemoteHint; break;
    case "noUpstream": title = t.overviewJourneyNoUpstream; hint = t.syncNoUpstreamMessage; break;
    case "upstreamGone":
      title = t.overviewNextGoneTitle(publish.destinationBranch ?? publish.localBranch, remote);
      hint = t.overviewNextGoneHint(remote);
      break;
    case "detached": title = t.overviewNextDetachedTitle; hint = t.overviewNextDetachedHint; break;
    case "unborn": title = t.syncUnbornTitle; hint = t.syncUnbornMessage; break;
    case "upToDate": title = t.overviewNextUpToDateTitle; hint = t.overviewNextUpToDateHint(remote); break;
  }

  const actionLabel = (action: NextStepAction): string => {
    switch (action) {
      case "save": return t.overviewSaveVersion;
      case "reviewChanges": return t.overviewReviewChanges;
      case "resolve": return t.overviewJourneyResolve;
      case "publish":
        return kind === "upstreamGone"
          ? t.overviewNextPublishAgain
          : kind === "noUpstream"
            ? t.overviewNextPublishBranch
            : t.overviewPublishAll(publish.pending);
      case "openHistory": return t.changesEmptyViewHistory;
      case "getChanges":
        if (!forecast || forecast.outcome !== "clear") return t.syncReviewAndGet;
        return isMerge ? t.overviewNextGetAndCombine : t.overviewNextGetCount(publish.behind);
      case "explainIncoming": return kind === "overlap" ? t.overviewNextSeeOverlap : t.overviewNextSeeWhy;
      case "getAndPublish": return t.overviewNextGetAndPublish;
      case "checkRemote": return kind === "unavailable" ? t.syncCheckAgain : t.overviewFactsCheck;
      case "checkLocal": return t.overviewCheckLocalAgain;
      case "openSettings": return t.overviewNextConnectRemote;
      case "openBranches": return t.overviewNextOpenBranches;
      case "switchToDefault": return t.overviewNextSwitchTo(defaultBranch ?? "");
      case "stopTracking": return t.overviewNextStopTracking;
    }
  };

  const glyphIcon = isPending ? <LoaderCircle className="icon--spinning" /> : KIND_ICONS[kind];
  const failed = kind === "unavailable" || kind === "localError";

  return (
    <section className={`next-step next-step--${tone}`} aria-labelledby={titleId}>
      <span
        // Breathes once as a step becomes current: the one moving thing on
        // the page, marking the one thing to do.
        key={primary ? kind : "idle"}
        className={`next-step__glyph${failed ? " next-step__glyph--failed" : kind === "upToDate" || kind === "noRemote" ? " next-step__glyph--done" : ""}${primary ? " attention-breathe" : ""}`}
        aria-hidden="true"
      >
        {glyphIcon}
      </span>
      <div className="next-step__copy">
        <h2 id={titleId} className="next-step__title">{title}</h2>
        <p className="next-step__hint">{hint}</p>
        {note && <NoteLine note={note} remote={remote} />}
        {then && (
          <p className="next-step__then">
            <ArrowRight
              // Nudges forward with the glyph's breath, and only then: the
              // same key replays both when a step becomes current.
              key={primary ? kind : "idle"}
              className={`next-step__then-arrow${primary ? " next-step__then-arrow--nudge" : ""}`}
              aria-hidden="true"
            />
            <span>
              {t.overviewNextThen}{" "}
              {then.kind === "get" ? (
                <><strong>{t.overviewNextThenGet(then.count)}</strong>{remote ? ` ${t.overviewNextThenOn(remote)}` : ""}</>
              ) : then.kind === "publishWith" ? (
                <strong>{t.overviewNextThenPublishWith(then.count)}</strong>
              ) : (
                <strong>{t.overviewNextThenPublish(then.count)}</strong>
              )}
            </span>
          </p>
        )}
      </div>
      {(primary || secondary.length > 0) && (
        <div className="next-step__actions">
          {secondary.map((action) => (
            <button
              key={action}
              className="secondary-button"
              type="button"
              onClick={handlers[action]}
              disabled={action === "checkRemote" && publish.isChecking}
              aria-label={action === "checkRemote" && kind !== "unavailable" ? t.statusBarCheckNow : undefined}
            >
              {action === "checkRemote" && publish.isChecking ? <LoaderCircle aria-hidden="true" className="icon--spinning" /> : ACTION_ICONS[action]}
              {actionLabel(action)}
            </button>
          ))}
          {primary && (
            <button
              className={`primary-button${primary === "resolve" || primary === "checkLocal" ? " next-step__primary--blocked" : ""}`}
              type="button"
              onClick={handlers[primary]}
            >
              {primary === "getChanges" && isMerge ? <GitMerge aria-hidden="true" /> : ACTION_ICONS[primary]}
              {actionLabel(primary)}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** Whether what is waiting on the remote gets in the way, in one line: a
 * check in the success ink when it doesn't, an alert in the danger ink when
 * it does. */
function NoteLine({ note, remote }: { note: NextStepNote; remote: string | null }): React.JSX.Element {
  const { t } = useLanguage();
  let text: string;
  let safe = true;
  switch (note.kind) {
    case "clear": text = t.overviewNextNoteClear; break;
    case "canCombine": text = t.overviewNextNoteCanCombine; break;
    case "incomingClear": text = t.overviewNextNoteIncomingClear(note.count, remote); break;
    case "incomingCombined":
      text = t.overviewNextNoteIncomingCombined(note.count, remote, note.files[0] ?? "", note.fileCount);
      break;
    case "overlap": text = t.overviewNextNoteOverlap; safe = false; break;
    case "blocked": text = forecastBlockerCopy(note.blocker, remote ?? "", t).body; safe = false; break;
  }
  return (
    <p className={`next-step__note${safe ? "" : " next-step__note--stopped"}`}>
      <span aria-hidden="true">{safe ? <Check /> : <TriangleAlert />}</span>
      <span>{text}</span>
    </p>
  );
}
