import React, { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ChevronRight,
  Clock,
  CloudUpload,
  RotateCcw,
  Save,
  Split,
  TriangleAlert,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { useActiveScreenEffect } from "../../runtime/screen/module";
import { formatRelativeTime } from "../../shared/i18n";
import { autoHideScrollbarProps } from "../../shared/ui";
import type { PendingVersionsResult } from "../publish";
import { splitPath, type ChangeCategory, type WorkingTreeStatus } from "../status";
import { sampleChangesPreview } from "./changesPreview";
import type { Journey } from "./journey";
import { useMoreBelow, useOverviewFits } from "./fit";
import { CHANGE_ICONS } from "./OverviewNow";
import { DetailListPlaceholder } from "./OverviewPlaceholder";
import { useActiveWorkDetail, WORK_DETAIL_COMMIT_LIMIT, type WorkDetailController } from "./workDetail";

/** Rows a detail card lists while the screen scrolls as a page. */
const DETAIL_LIST_LIMIT = 5;
/** Copies the discarded-changes card lists under a detail card while the
 * screen scrolls as a page; alone it lists as many as a detail card does. */
const RESTORE_UNDER_CARD_LIMIT = 2;
/** The most rows a detail card lists while its list scrolls; the rest are
 * counted under the last one, and Changes or History has them all. */
const SCROLL_LIST_LIMIT = 50;

export type OverviewDetailMode = "save" | "resolve" | "publish" | "bring" | "calm";

/** Which detail the column shows: it follows the next step. Local work comes
 * first; once it is saved, what waits on the remote, then what waits to be
 * published; with nothing waiting, no card. */
export function overviewDetailMode(journey: Journey): OverviewDetailMode {
  const { changes, publish } = journey;
  if (changes.state === "conflicts") return "resolve";
  if (changes.state === "dirty") return "save";
  if (changes.state !== "clean") return "calm";
  if ((publish.state === "behind" || publish.state === "diverged") && publish.behind > 0) return "bring";
  // With no remote there is nowhere to publish to: the next-step card's
  // "Connect" is the useful answer.
  if (publish.pending > 0 && publish.state !== "noRemote") return "publish";
  return "calm";
}

type FileItem = { path: string; category: ChangeCategory };

function FileList({
  files,
  hidden,
  onOpen,
  listRef,
  scroll,
}: {
  files: FileItem[];
  hidden: number;
  onOpen?: (path: string) => void;
  /** The list's box, which scrolls while the screen fits the window. */
  listRef?: React.Ref<HTMLUListElement>;
  /** The list scrolls rather than fitting whole rows; `moreBelow` fades its bottom edge. */
  scroll?: { moreBelow: boolean };
}): React.JSX.Element {
  const { t } = useLanguage();
  return (
    <ul
      {...(scroll ? autoHideScrollbarProps<HTMLUListElement>() : {})}
      // The class stays fixed while it scrolls: the scrollbar's pointer state
      // is set outside React. The fade rides on an attribute.
      className={scroll ? "overview-detail__files overview-detail__files--scroll auto-hide-scrollbar" : "overview-detail__files"}
      data-more-below={scroll?.moreBelow || undefined}
      ref={listRef}
    >
      {files.map((file) => {
        const { name, dir } = splitPath(file.path);
        const body = (
          <>
            <span className={`overview-detail__kind overview-detail__kind--${file.category}`} aria-hidden="true">
              {CHANGE_ICONS[file.category]}
            </span>
            <span className="overview-detail__name">{name}</span>
            {dir && <span className="overview-detail__dir">{dir}</span>}
          </>
        );
        return (
          <li key={file.path}>
            {onOpen ? (
              <button
                className="overview-detail__file"
                type="button"
                onClick={() => onOpen(file.path)}
                aria-label={t.overviewChangesPreviewOpenFile(file.path)}
              >
                {body}
              </button>
            ) : (
              <span className="overview-detail__file">{body}</span>
            )}
          </li>
        );
      })}
      {hidden > 0 && <li className="overview-detail__more">{t.overviewDetailMore(hidden)}</li>}
    </ul>
  );
}

function LineTotals({ added, removed }: { added: number; removed: number }): React.JSX.Element {
  const { t } = useLanguage();
  const total = added + removed;
  return (
    <p className="overview-detail__lines" aria-label={t.overviewDetailLines(added, removed)}>
      <span className="overview-detail__added" aria-hidden="true">+{added}</span>
      <span className="overview-detail__removed" aria-hidden="true">−{removed}</span>
      {/* One capsule, filled for the added share and outlined for the removed;
          with only one side there is nothing to join, and with neither (a
          binary file, a rename) no share to draw. */}
      {total > 0 && <span
        className={`overview-detail__bar overview-detail__bar--${added && removed ? "joined" : added ? "added" : "removed"}`}
        aria-hidden="true"
        style={{ "--added-share": `${(added / total) * 100}%` } as React.CSSProperties}
      />}
    </p>
  );
}

function DetailCard({
  icon,
  title,
  link,
  busy,
  compact,
  children,
}: {
  icon: React.JSX.Element;
  title: string;
  /** `lead` points the link out, as the way on from the end of the list. */
  link?: { label: string; onClick: () => void; lead?: boolean };
  busy?: boolean;
  /** One step smaller than the step's own card: a safety net, not a step. */
  compact?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const titleId = useId();
  // The compact card fades in once, as it arrives; see `.overview-detail--arriving`.
  const [arriving, setArriving] = useState(Boolean(compact));
  return (
    <section
      className={`overview-detail${compact ? " overview-detail--compact" : ""}${arriving ? " overview-detail--arriving" : ""}`}
      aria-labelledby={titleId}
      aria-busy={busy}
      onAnimationEnd={arriving ? (event) => { if (event.target === event.currentTarget) setArriving(false); } : undefined}
    >
      <header className="overview-detail__head">
        {icon}
        <h2 id={titleId}>{title}</h2>
        {link && (
          <button
            className={`overview-detail__link${link.lead ? " overview-detail__link--lead attention-breathe" : ""}`}
            type="button"
            onClick={link.onClick}
          >
            {link.label}
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * The column beside the timeline. It follows the next-step card: while the
 * card asks to save, resolve, get or publish, it shows what that step will
 * move. A discard that can still be restored sits under it whatever the step,
 * and opens the restore picker over the Overview. With neither there is no
 * column, and the timeline takes the width.
 */
export function OverviewDetail({
  mode,
  journey,
  workingTree,
  pendingVersions,
  workDetail,
  projectPath,
  sessionEpoch,
  onReviewChanges,
  onResolve,
  onGetChanges,
  onOpenHistory,
  onRestoreDiscarded,
}: {
  mode: OverviewDetailMode;
  journey: Journey;
  workingTree: WorkingTreeStatus | null;
  pendingVersions: PendingVersionsResult;
  workDetail: WorkDetailController;
  projectPath: string;
  sessionEpoch: string;
  /** Opens Changes, with a file selected when given one. */
  onReviewChanges: (path?: string) => void;
  onResolve: () => void;
  onGetChanges: () => void;
  onOpenHistory: () => void;
  /** Opens the restore picker over the Overview, on the given copy when one is. */
  onRestoreDiscarded: (recoveryId?: string) => void;
}): React.JSX.Element | null {
  const { t, formats } = useLanguage();
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const detail = useActiveWorkDetail(workDetail, query);
  const { publish } = journey;
  const [now, setNow] = useState(() => Date.now());
  // While the screen fits the window, a card's list scrolls inside the column;
  // otherwise the screen scrolls as a page and the list keeps a short length.
  const fits = useOverviewFits();
  const publishStates = pendingVersions.versions
    .slice(0, WORK_DETAIL_COMMIT_LIMIT)
    .map((version) => detail.commitFiles.get(version.commit)?.status ?? "-")
    .join("");
  const listKey =
    mode === "save" || mode === "resolve"
      ? `${mode}|${workingTree?.counts.total ?? 0}|${workingTree?.entries[0]?.path ?? ""}`
      : mode === "publish"
        ? `publish|${pendingVersions.totalCount}|${publishStates}`
        : mode === "bring"
          ? `bring|${detail.incoming?.status ?? "-"}|${detail.incoming?.status === "ready" ? detail.incoming.result.versions.length : 0}`
          : mode;
  const scrollsFiles = fits && mode !== "calm";
  const listLimit = scrollsFiles ? SCROLL_LIST_LIMIT : DETAIL_LIST_LIMIT;
  const listScroll = useMoreBelow<HTMLUListElement>(scrollsFiles, listKey);
  // The discarded copies scroll too while the screen fits the window.
  const restoreKey = detail.recovery
    ? `${detail.recovery.restorableCount}|${detail.recovery.copies.map((copy) => copy.recoveryId).join(",")}`
    : "";
  const restoreScroll = useMoreBelow<HTMLUListElement>(fits && Boolean(detail.recovery), `${restoreKey}|${mode}`);
  // A new project starts at the top of its lists, not where the last one was left.
  useEffect(() => {
    listScroll.ref.current?.scrollTo?.({ top: 0 });
    restoreScroll.ref.current?.scrollTo?.({ top: 0 });
  }, [projectPath, listScroll.ref, restoreScroll.ref]);
  useActiveScreenEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  let card: React.JSX.Element | null = null;
  if (mode === "save" && workingTree) {
    const shown = sampleChangesPreview(workingTree.entries, listLimit);
    card = (
      <DetailCard
        icon={<Save aria-hidden="true" />}
        title={t.overviewDetailSaveTitle}
        // Scrolled to the end, Review is the way on to every file, as
        // "View all" is at the end of the timeline.
        link={{ label: t.overviewDetailReview, onClick: () => onReviewChanges(), lead: scrollsFiles && listScroll.reachedEnd }}
      >
        <p className="overview-detail__sum">
          <strong>{t.overviewDetailFiles(workingTree.counts.total)}</strong>
          <span>{t.overviewDetailInNextVersion}</span>
        </p>
        {workingTree.lineTotals && (
          <LineTotals added={workingTree.lineTotals.added} removed={workingTree.lineTotals.removed} />
        )}
        <FileList
          files={shown.map((entry) => ({ path: entry.path, category: entry.category }))}
          hidden={workingTree.counts.total - shown.length}
          onOpen={(path) => onReviewChanges(path)}
          listRef={listScroll.ref}
          scroll={scrollsFiles ? { moreBelow: listScroll.moreBelow } : undefined}
        />
      </DetailCard>
    );
  } else if (mode === "resolve" && workingTree) {
    const conflicted = workingTree.entries.filter((entry) => entry.category === "conflicted");
    const shown = conflicted.slice(0, listLimit);
    card = (
      <DetailCard
        icon={<Split aria-hidden="true" />}
        title={t.overviewDetailResolveTitle}
        link={{ label: t.overviewJourneyResolve, onClick: onResolve, lead: scrollsFiles && listScroll.reachedEnd }}
      >
        <p className="overview-detail__sum">
          <strong>{t.overviewDetailFiles(workingTree.counts.conflicted)}</strong>
          <span>{t.overviewDetailResolveSum}</span>
        </p>
        <FileList
          files={shown.map((entry) => ({ path: entry.path, category: entry.category }))}
          hidden={workingTree.counts.conflicted - shown.length}
          onOpen={(path) => onReviewChanges(path)}
          listRef={listScroll.ref}
          scroll={scrollsFiles ? { moreBelow: listScroll.moreBelow } : undefined}
        />
      </DetailCard>
    );
  } else if (mode === "publish") {
    // The files of every unpublished version read so far, newest first, each
    // path once.
    const considered = pendingVersions.versions.slice(0, WORK_DETAIL_COMMIT_LIMIT);
    const states = considered.map((version) => detail.commitFiles.get(version.commit));
    const seen = new Map<string, FileItem>();
    for (const state of states) {
      if (state?.status !== "ready") continue;
      for (const file of state.files) if (!seen.has(file.path)) seen.set(file.path, { path: file.path, category: file.category });
    }
    const files = [...seen.values()];
    const isReading = states.some((state) => !state || state.status === "loading");
    const failed = states.length > 0 && states.every((state) => state?.status === "error");
    const isPartial =
      pendingVersions.isTruncated
      || pendingVersions.totalCount > considered.length
      || states.some((state) => state?.status !== "ready");
    const shown = files.slice(0, listLimit);
    card = (
      <DetailCard
        icon={<CloudUpload aria-hidden="true" />}
        title={t.overviewDetailPublishTitle}
        // Scrolled to the end, History is the way on to every version.
        link={{ label: t.overviewDetailInHistory, onClick: onOpenHistory, lead: scrollsFiles && listScroll.reachedEnd }}
        busy={isReading}
      >
        {files.length > 0 ? (
          <>
            <p className="overview-detail__sum">
              <strong>{isPartial ? t.overviewDetailFilesAtLeast(files.length) : t.overviewDetailFiles(files.length)}</strong>
              <span>{t.overviewDetailInVersions(pendingVersions.totalCount)}</span>
            </p>
            <FileList
              files={shown}
              hidden={files.length - shown.length}
              listRef={listScroll.ref}
              scroll={scrollsFiles ? { moreBelow: listScroll.moreBelow } : undefined}
            />
          </>
        ) : failed ? (
          <p className="overview-detail__state overview-detail__state--error">
            <TriangleAlert aria-hidden="true" />
            {t.overviewDetailFilesError}
          </p>
        ) : (
          <DetailListPlaceholder label={t.overviewDetailLoading} />
        )}
      </DetailCard>
    );
  } else if (mode === "bring") {
    const incoming = detail.incoming;
    const versions = incoming?.status === "ready" ? incoming.result.versions : [];
    const total = incoming?.status === "ready" ? incoming.result.totalCount : publish.behind;
    const shown = versions.slice(0, listLimit);
    card = (
      <DetailCard
        icon={<ArrowDownToLine aria-hidden="true" />}
        title={t.overviewDetailBringTitle}
        link={{ label: t.overviewDetailReview, onClick: onGetChanges, lead: scrollsFiles && listScroll.reachedEnd }}
        busy={!incoming || incoming.status === "loading"}
      >
        {!incoming || incoming.status === "loading" ? (
          // Not read yet, or being read: the list's shape holds its place.
          <DetailListPlaceholder label={t.overviewDetailVersionsLoading} />
        ) : incoming.status === "error" ? (
          <p className="overview-detail__state overview-detail__state--error">
            <TriangleAlert aria-hidden="true" />
            {t.overviewDetailVersionsError}
          </p>
        ) : (
          <p className="overview-detail__sum">
            <strong>{t.overviewDetailVersions(total)}</strong>
            {publish.remote && <span>{t.overviewDetailFrom(publish.remote)}</span>}
          </p>
        )}
        {shown.length > 0 && (
          <ul
            {...(scrollsFiles ? autoHideScrollbarProps<HTMLUListElement>() : {})}
            className={scrollsFiles ? "overview-detail__files overview-detail__files--scroll auto-hide-scrollbar" : "overview-detail__files"}
            data-more-below={(scrollsFiles && listScroll.moreBelow) || undefined}
            ref={listScroll.ref}
          >
            {shown.map((version) => (
              <li key={version.commit}>
                <span className="overview-detail__version" title={version.title}>
                  <span className="overview-detail__incoming" aria-hidden="true" />
                  <span className="overview-detail__name">{version.title}</span>
                  {version.author && <span className="overview-detail__dir">{version.author}</span>}
                </span>
              </li>
            ))}
            {total > shown.length && <li className="overview-detail__more">{t.overviewDetailMore(total - shown.length)}</li>}
          </ul>
        )}
      </DetailCard>
    );
  }

  // Each copy is a row: when, then what it holds. Files are never added up:
  // copies can share them. "When" reads as the timeline's does.
  const recovery = detail.recovery;
  const whenOf = (createdAtMs: number): string => formatRelativeTime(new Date(createdAtMs), formats, now);

  // Whatever the step: a copy is only offered while nothing has been written
  // at its paths, so restoring it never lands on unsaved work. It is the
  // detail cards' shape one step smaller and with no figure, so it never
  // pulls the eye from the step. While the screen fits it scrolls its copies;
  // otherwise it lists a few, fewer under a detail card.
  let restore: React.JSX.Element | null = null;
  if (recovery && recovery.copies.length > 0) {
    const shown = recovery.copies.slice(0, fits ? SCROLL_LIST_LIMIT : card ? RESTORE_UNDER_CARD_LIMIT : DETAIL_LIST_LIMIT);
    restore = (
      <DetailCard
        icon={<RotateCcw aria-hidden="true" />}
        title={t.overviewSafetyDiscarded}
        // Scrolled to the end of the copies, Restore is the way on, as Review
        // and "View all" are at the end of their lists.
        link={{ label: t.overviewDiscardRestore, onClick: () => onRestoreDiscarded(), lead: fits && restoreScroll.reachedEnd }}
        compact
      >
        <ul
          {...(fits ? autoHideScrollbarProps<HTMLUListElement>() : {})}
          className={fits ? "overview-detail__files overview-detail__files--scroll auto-hide-scrollbar" : "overview-detail__files"}
          data-more-below={(fits && restoreScroll.moreBelow) || undefined}
          ref={restoreScroll.ref}
        >
          {shown.map((copy) => {
            const when = whenOf(copy.createdAtMs);
            const paths = copy.previewPaths.map((path) => splitPath(path).name).join(", ");
            return (
              <li key={copy.recoveryId}>
                <button
                  className="overview-detail__file"
                  type="button"
                  onClick={() => onRestoreDiscarded(copy.recoveryId)}
                  aria-label={t.overviewDiscardRestoreCopy(when, copy.fileCount)}
                >
                  <span className="overview-detail__kind" aria-hidden="true"><Clock /></span>
                  <span className="overview-detail__name">{when}</span>
                  <span className="overview-detail__dir">
                    {paths ? t.overviewSafetyDiscardedHint(copy.fileCount, paths) : t.overviewDetailFiles(copy.fileCount)}
                  </span>
                </button>
              </li>
            );
          })}
          {recovery.restorableCount > shown.length && (
            <li className="overview-detail__more">{t.overviewDetailMore(recovery.restorableCount - shown.length)}</li>
          )}
        </ul>
      </DetailCard>
    );
  }

  // With nothing to move and nothing to restore there is no column: the
  // timeline takes the width.
  if (!card && !restore) return null;

  return (
    <aside className="overview-side">
      {card}
      {restore}
    </aside>
  );
}
