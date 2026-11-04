import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeft, Check, ChevronDown, ChevronRight, CircleAlert, Cloud, CloudOff, CloudUpload,
  CircleDot, Copy, Ellipsis, Folder, GitBranch, GitCommitHorizontal, GitCommitVertical, GitGraph, GitMerge,
  Search, Tag, UserRound, X,
} from "lucide-react";

import { useLanguage, type Translations } from "../../i18n";
import { getFileTypeIcon } from "../../shared/file-icons";
import { formatDate, formatNumber, type LocaleFormats } from "../../shared/i18n";
import { AutomaticUpdatesNotice, AuthorAvatar, autoHideScrollbarProps, ContextMenuSurface, contextMenuAnchorFrom, DateField, FilterCapsule, FilterCapsules, FilterChips, FilterGroup, FilterPanel, FilterSwitch, LoadingBar, LoadingPlaceholder, LocalOnlyIcon, onDocumentPress, SearchBox, TextPlaceholder, StateGlyph, StateGlyphs, TimelineChip, toDate, useRowArrival, type StateGlyphTone, type ContextMenuAnchor, type FilterChip } from "../../shared/ui";
import { ChangesContextMenu, DiffFind, DiffResultView, DiffStepNav, DiffViewSelector, FileTreeFolderButton, FileViewToggle, flatFileRows, flattenFileTree, isGroupedFileRow, MarkdownPreviewView, PictureDiffControls, treeIndentStyle, useCollapsedFolders, useFileListView, useMarkdownDiff, usePictureDiff, type FileTreeRow, type ChangesContextMenuState, type DiffViewMode, type FileDiff, type ImagePreviewLoader, type MarkdownPreview } from "../changes";
import { CHANGE_CATEGORY_ICONS, splitPath, type ChangeCategory } from "../status";
import { MAX_HISTORY_ROWS, type HistoryController } from "./controller";
import type { HistoryDecoration, HistoryFileChange, HistoryState, PublicationState, SavedVersionDetail, SavedVersionSummary } from "./domain";
import { formatHistoryDate } from "./formatHistoryDate";
import { localBranchFor } from "./HistoryRefBadge";
import { isSelfAuthor } from "./author";
import {
  LANE_TINTS,
  MAX_LANES,
  detourHolding,
  layoutLanes,
  versionsWithDetours,
  type Detour,
  type LaneLayout,
  type LaneRow,
  type LaneSlot,
} from "./timelineLanes";
import {
  ALL_BRANCHES_SCOPE,
  countActiveFilters,
  CURRENT_BRANCH_SCOPE,
  NO_HISTORY_FILTERS,
  scopeBranchName,
  type HistoryFilters,
  type HistoryQuery,
  type HistoryScope,
} from "./port";

/** What a branch can be asked to do from inside History.
 *
 * Every one of them is performed by the flow that owns it — the previewed
 * switch, the create dialog, the Branches screen — and reaches this screen as a
 * callback. History never checks anything out itself. */
export type HistoryBranchActions = {
  /** Local branches, so the scope control can offer them and refuse a
   * name this project does not have. */
  branches?: string[];
  onViewBranch?: (name: string) => void;
  onSwitchBranch?: (name: string) => void;
  onCreateBranchFromVersion?: (version: SavedVersionSummary) => void;
  /** Opens the publish flow for the current branch, with its own preview. */
  onPublish?: () => void;
};

const CATEGORY_LABEL_KEYS = {
  changed: "changesCategoryLabelChanged", new: "changesCategoryLabelNew",
  deleted: "changesCategoryLabelDeleted", renamed: "changesCategoryLabelRenamed",
  conflicted: "changesCategoryLabelConflicted",
} as const satisfies Record<ChangeCategory, keyof Translations>;

/** How many paths the file/folder shortcut offers, and how much of that the
 * folders may take. The rest is left for files, so a version spread across many
 * folders still offers one. */
const PATH_SUGGESTIONS = 40;
const PATH_SUGGESTION_FOLDERS = 15;

/** Above this many branches the picker grows a search field. Below it the
 * list is already scannable and a box to type in is one control too many. */
const SCOPE_PICKER_SEARCH_THRESHOLD = 8;

function versionTitle(version: SavedVersionSummary, t: Translations): string {
  if (version.messageUnavailable === "tooLarge") return t.historyMessageTooLarge;
  if (version.messageUnavailable === "pageBudget") return t.historyMessagePageLimit;
  if (version.messageUnavailable === "malformed") return t.historyMessageMalformed;
  return version.subject.trim() || t.historyNoDescription;
}

/** `fix(settings): ` and its kin — a Conventional Commits type, optional
 * scope and breaking mark. Only a prefix of that exact shape is split off. */
const CONVENTIONAL_PREFIX = /^[a-z]+(?:\([^)\n]{1,40}\))?!?: /i;

/** `text` with every case-insensitive occurrence of `query` marked. */
function highlighted(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const lower = text.toLocaleLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(query, from); at >= 0; at = lower.indexOf(query, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(<mark key={at} className="history-match">{text.slice(at, at + query.length)}</mark>);
    from = at + query.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

/** A version's title as a reader scans it: the Conventional Commits prefix
 * one tone quieter, so the words that say what changed read first — at
 * `fix(settings): ` a 300px row spent half its width before them. Only the
 * colour changes; the text is the subject, whole. */
function VersionTitleText({ version, title, search = "" }: { version: SavedVersionSummary; title: string; search?: string }): React.JSX.Element {
  const prefix = version.messageUnavailable === null ? CONVENTIONAL_PREFIX.exec(title)?.[0] : undefined;
  if (!prefix) return <>{highlighted(title, search)}</>;
  return <><span className="history-title-prefix">{highlighted(prefix, search)}</span>{highlighted(title.slice(prefix.length), search)}</>;
}

/** Where a search matched a version outside what its row shows, so a row
 * found by its author, code, reference or message says why it is there.
 * `null` when the title shows the match itself, or nothing is searched. */
function hiddenMatch(version: SavedVersionSummary, title: string, query: string, t: Translations): string | null {
  if (!query || title.toLocaleLowerCase().includes(query)) return null;
  const has = (value: string | undefined): boolean => Boolean(value?.toLocaleLowerCase().includes(query));
  if (has(version.author?.name)) return t.historyMatchAuthor;
  if (has(version.shortCommit)) return t.historyMatchCommit;
  if (version.decorations.some((item) => has(item.name))) return t.historyMatchRef;
  if (has(version.description)) return t.historyMatchMessage;
  return null;
}

function publicationCopy(publication: PublicationState, t: Translations): string {
  if (publication === "published") return t.historyPublished;
  if (publication === "local-only") return t.historyLocalOnly;
  return t.historyPublicationUnknown;
}

function PublicationIcon({ publication }: { publication: PublicationState }): React.JSX.Element {
  if (publication === "published") return <Cloud aria-hidden="true" />;
  if (publication === "local-only") return <LocalOnlyIcon />;
  return <CloudOff aria-hidden="true" />;
}

/** Right opens a block, Left folds it — the arrows a tree heading answers to;
 * Enter and Space are the button's own. */
function blockKeys(expanded: boolean, onToggle: () => void): (event: React.KeyboardEvent<HTMLButtonElement>) => void {
  return (event) => {
    if ((event.key === "ArrowRight" && !expanded) || (event.key === "ArrowLeft" && expanded)) {
      event.preventDefault();
      onToggle();
    }
  };
}

function HistoryBanner({ tone, title, action, children }: { tone: "neutral" | "warning" | "danger"; title: string; action?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  // One line: the title, then the explanation, cut short with the whole of it
  // on the tooltip — a notice is read at a glance, not stacked over the list.
  return <section className={`history-banner history-banner--${tone}`}><CircleAlert aria-hidden="true" /><div className="history-banner__body"><strong>{title}</strong><p title={typeof children === "string" ? children : undefined}>{children}</p></div>{action}</section>;
}

function HistoryWatchingNotice({ watcherState, busy, onRefresh, onOpenSettings }: { watcherState: "starting" | "watching" | "off" | "unavailable"; busy: boolean; onRefresh: () => void; onOpenSettings: () => void }): React.JSX.Element | null {
  const { t } = useLanguage();
  if (watcherState !== "off" && watcherState !== "unavailable") return null;
  return <AutomaticUpdatesNotice title={watcherState === "off" ? t.automaticUpdatesOffTitle : t.automaticUpdatesUnavailableTitle} description={t.automaticUpdatesOutdatedDescription} updateLabel={t.automaticUpdatesUpdateNow} updateAriaLabel={t.historyRefresh} updatingLabel={t.automaticUpdatesUpdating} updatingAriaLabel={t.historyRefreshing} busy={busy} settingsLabel={t.automaticUpdatesOpenSettings} onUpdate={onRefresh} onOpenSettings={onOpenSettings} />;
}

/** What a saved version offers, wherever it is asked from.
 *
 * The same three items behind a right-click on a row and behind a branch chip on
 * the detail card, so the two surfaces cannot drift the way the branches
 * row and its menu once did. Two of them act on a branch and appear only
 * when the row genuinely names one; the third acts on the saved version and is
 * always there.
 *
 * Switching runs the previewed, state-checked flow that the status bar and the
 * Branches screen run. Nothing here checks anything out. */
function HistoryVersionMenu({ anchor, version, currentBranch, actions, branch, onClose }: {
  anchor: ContextMenuAnchor;
  version: SavedVersionSummary;
  currentBranch: string | null;
  actions: HistoryBranchActions;
  /** The branch to act on, when the caller already knows which chip was pressed.
   * The row menu leaves it out and takes the branch the row names. */
  branch?: HistoryDecoration | null;
  onClose: (restoreFocus: boolean) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const decoration = branch !== undefined ? branch : localBranchFor(version, currentBranch);
  const isCurrent = decoration !== null && decoration.name === currentBranch;
  const run = (action: () => void): void => { onClose(true); action(); };
  return <ContextMenuSurface anchor={anchor} ariaLabel={t.historyVersionActionsLabel} onClose={onClose}>
    {decoration && actions.onViewBranch && <button className="app-menu__item" type="button" onClick={() => run(() => actions.onViewBranch?.(decoration.name))}>
      <GitBranch aria-hidden="true" />
      <span>{t.historyViewBranch(decoration.name)}</span>
    </button>}
    {/* A branch already checked out is not offered: switching to where you are
        would run a preview for a change that is not one. */}
    {decoration && !isCurrent && actions.onSwitchBranch && <button className="app-menu__item" type="button" onClick={() => run(() => actions.onSwitchBranch?.(decoration.name))}>
      <ArrowLeft aria-hidden="true" />
      <span>{t.historySwitchToBranch(decoration.name)}</span>
    </button>}
    {actions.onCreateBranchFromVersion && <button className="app-menu__item" type="button" onClick={() => run(() => actions.onCreateBranchFromVersion?.(version))}>
      <GitCommitHorizontal aria-hidden="true" />
      <span>{t.historyCreateBranchFromVersion}</span>
    </button>}
  </ContextMenuSurface>;
}

/** One state a timeline row flags, as a glyph: `label` is what the row's
 * description reads out, `tooltip` the sentence that explains the glyph. */
type VersionGlyph = { key: string; tone: StateGlyphTone; icon: React.ReactNode; text?: string; label: string; tooltip: string };

/** The facts about a version that its subject and date cannot say, each as a
 * glyph, in the order a reader asks them: is this where I am, has it left my
 * computer, did someone mark it, does it join two branches. Published says
 * nothing — the unremarkable state is the one without a mark, as on a Branches
 * row — and an unknown publication (no upstream) says nothing either: a row
 * must not flag "no idea". */
function versionGlyphs(version: SavedVersionSummary, t: Translations): VersionGlyph[] {
  const glyphs: VersionGlyph[] = [];
  if (version.decorations.some((decoration) => decoration.kind === "head")) {
    glyphs.push({ key: "current", tone: "accent", icon: <CircleDot />, label: t.historyCurrentLabel, tooltip: t.historyGlyphCurrent });
  }
  if (version.publication === "local-only") {
    glyphs.push({ key: "local", tone: "local", icon: <LocalOnlyIcon />, label: t.historyLocalOnly, tooltip: t.historyGlyphLocalOnly });
  }
  const tag = version.decorations.find((decoration) => decoration.kind === "tag");
  if (tag) {
    const label = t.historyRefTagLabel(tag.name);
    // Named as well as drawn: which release it marks is the whole point of a
    // tag, and a bare tag glyph made the reader hover every one to find it.
    glyphs.push({ key: "tag", tone: "neutral", icon: <Tag />, text: tag.name, label, tooltip: label });
  }
  if (version.isMerge) {
    glyphs.push({ key: "merge", tone: "neutral", icon: <GitMerge />, label: t.historyMergeLabel, tooltip: t.historyGlyphMerge });
  }
  return glyphs;
}

/** Who saved a version, as the shared avatar draws it. The name is on the
 * tooltip and in the row's description; the user's own say "You (name)". */
function VersionAuthorAvatar({ version, isSelf, t, size }: { version: SavedVersionSummary; isSelf: boolean; t: Translations; size?: "row" | "strip" }): React.JSX.Element {
  const name = version.author?.name.trim() || t.historyAuthorUnknown;
  return <AuthorAvatar name={version.author ? name : null} email={version.author?.email} isSelf={isSelf} tooltip={isSelf ? t.historyAuthorYouNamed(name) : name} size={size} />;
}

/** How much of this row's rail belongs to the stretch between the top of the
 * list and the selected version: all of it, as far as this row's own node, or
 * none. A fact about where the selection sits, and the only thing the timeline
 * draws that is not either structure or the selection itself. */
type RailFill = "filled" | "half" | null;

/** Subject and meta lengths for the first page's rows. */
const TIMEBRANCH_PLACEHOLDER_WIDTHS: ReadonlyArray<readonly [string, string]> = [
  ["64%", "38%"],
  ["48%", "30%"],
  ["72%", "42%"],
  ["56%", "34%"],
  ["40%", "28%"],
  ["60%", "36%"],
];

/** The timeline's first page: the search strip, then rows on the rail at the
 * real rows' height, the nodes drawn as they will be and the words as
 * placeholders. */
function TimelinePlaceholder({ label }: { label: string }): React.JSX.Element {
  const last = TIMEBRANCH_PLACEHOLDER_WIDTHS.length - 1;
  return (
    <LoadingPlaceholder label={label} className="history-timeline__placeholder">
      <div className="history-timeline__toolbar"><TextPlaceholder width="100%" /></div>
      {TIMEBRANCH_PLACEHOLDER_WIDTHS.map(([title, meta], index) => (
        <div key={title} className="history-timeline__placeholder-row">
          <span className="history-row" data-first={index === 0 || undefined} data-last={index === last || undefined}>
            <span className="history-row__node" />
            <span className="history-row__body">
              <span className="history-row__title"><TextPlaceholder width={title} /></span>
              <span className="history-row__meta"><TextPlaceholder width={meta} /></span>
            </span>
          </span>
        </div>
      ))}
    </LoadingPlaceholder>
  );
}

/** The version strip before any version is known: its subject's place, at
 * the strip's own height and type size, so the subject lands where it waited. */
function StripPlaceholder(): React.JSX.Element {
  return <header className="history-detail__strip" aria-hidden="true"><h2 className="history-detail__strip-title"><TextPlaceholder width="52%" /></h2></header>;
}

/** A version's detail while it is read: the line under the strip, then its
 * changed files. The strip itself is real whenever the version is known. */
function DetailPlaceholder({ label }: { label?: string }): React.JSX.Element {
  return (
    <LoadingPlaceholder label={label} className="history-detail__placeholder">
      <p className="history-detail__placeholder-meta"><TextPlaceholder width="34%" /></p>
      {["46%", "58%", "38%", "52%"].map((width) => (
        <div key={width} className="history-detail__placeholder-file">
          <TextPlaceholder className="text-placeholder--glyph" />
          <TextPlaceholder width={width} />
        </div>
      ))}
    </LoadingPlaceholder>
  );
}

/* Lanes, drawn thin: 1px strokes 11px apart, the first on the rail's own x
   (the row's 1px border and 17.5px, at the line's centre). Each piece of the
   timeline draws its stretch of every lane at its own real height, from its
   border edge, so a lane is the same x in every row and heading and the pieces
   meet exactly. */
const LANE_START = 19;
const LANE_GAP = 11;
/** Where a row's node sits, from the row's border edge. */
const ROW_NODE_Y = 33;
const laneX = (lane: number): number => LANE_START + Math.min(lane, MAX_LANES - 1) * LANE_GAP;
const laneTint = (tint: number): string => `var(--history-lane-${tint === 0 ? 0 : 1 + ((tint - 1) % LANE_TINTS)})`;
const laneCurve = (x1: number, y1: number, x2: number, y2: number): string =>
  x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`;

/** One piece's stretch of the lanes. A version row draws what runs into its
 * node, what leaves it for each parent, and what passes beside it; any other
 * piece draws the lanes crossing it, from `fromY` down. */
function LaneDrawing({ width, height, commit, row, passing, fromY = 0, connectTop = false }: {
  width: number; height: number; commit?: string; row?: LaneRow; passing?: readonly LaneSlot[]; fromY?: number; connectTop?: boolean;
}): React.JSX.Element {
  const paths: Array<{ d: string; tint: number }> = [];
  if (row && commit) {
    const nx = laneX(row.lane);
    row.lanesIn.forEach((slot, lane) => {
      if (!slot) return;
      const x = laneX(lane);
      paths.push({ d: slot.commit === commit ? laneCurve(x, 0, nx, ROW_NODE_Y) : `M${x} 0V${ROW_NODE_Y}`, tint: slot.tint });
    });
    if (connectTop && !row.lanesIn[row.lane]) paths.push({ d: `M${nx} 0V${ROW_NODE_Y}`, tint: row.tint });
    row.lanesOut.forEach((slot, lane) => {
      if (!slot) return;
      const x = laneX(lane);
      if (lane !== row.lane && row.lanesIn[lane]?.commit === slot.commit) paths.push({ d: `M${x} ${ROW_NODE_Y}V${height}`, tint: slot.tint });
      if (row.edges.some((edge) => edge.lane === lane)) paths.push({ d: laneCurve(nx, ROW_NODE_Y, x, height), tint: slot.tint });
    });
  } else {
    passing?.forEach((slot, lane) => { if (slot) paths.push({ d: `M${laneX(lane)} ${fromY}V${height}`, tint: slot.tint }); });
  }
  return (
    <svg className="history-lanes" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {paths.map((path, index) => <path key={index} className="history-lane-stroke" data-tint={path.tint} d={path.d} stroke={laneTint(path.tint)} />)}
      {/* A wider, invisible copy of each stroke: a 1px line is no target for a pointer. */}
      {paths.map((path, index) => <path key={`hit-${index}`} className="history-lane-hit" data-tint={path.tint} d={path.d} />)}
    </svg>
  );
}

/** What the card says under a lane's name: one fact, the one that answers
 * "are these versions anywhere else?". The branch being read is itself;
 * otherwise the newest merge that took it into another branch says whether all
 * of it went, or how many versions it saved since. Loaded versions only. */
function laneFact(layout: LaneLayout, tint: number, readingOne: boolean, t: Translations): string {
  if (tint === 0 && readingOne) return t.historyLaneTrunk;
  const merge = layout.branches.get(tint)?.lastMerge;
  if (!merge) return t.historyLaneNotMerged;
  // A branch the timeline cannot name is still a branch: say "another branch".
  const into = layout.branches.get(merge.into)?.name ?? t.historyLaneAnother;
  return merge.after > 0 ? t.historyLaneMissing(merge.after, into) : t.historyLaneMerged(into);
}

/* The card beside the pointer when it rests on a lane: the app tooltip's own
   dark surface, the lane's colour said once by a dot before the branch's name,
   and the one fact. Kept inside the window. */
function LaneCard({ layout, tint, readingOne, x, y, t }: { layout: LaneLayout; tint: number; readingOne: boolean; x: number; y: number; t: Translations }): React.JSX.Element | null {
  const branch = layout.branches.get(tint);
  if (!branch) return null;
  const left = Math.max(8, Math.min(x + 14, window.innerWidth - 300));
  return (
    <div className="history-lane-tip" style={{ left, top: y + 14, "--lane-color": laneTint(tint) } as React.CSSProperties} aria-hidden="true">
      <span className="history-lane-tip__name">{branch.name ?? t.historyLaneUnnamed}</span>
      <span>{laneFact(layout, tint, readingOne, t)}</span>
    </div>
  );
}

const TimelineRow = React.memo(function TimelineRow({ version, index, level, first, last, selected, rail, focusable, formats, search, arrival, selfEmail, detour, laneRow, laneWidth, connectTop = false, onSelect, onMove, onToggleDetour, onOpenDetail, onContextMenu }: {
  version: SavedVersionSummary;
  /** Its place among the rows drawn, for the arrow keys. */
  index: number;
  /** Its depth in the timeline's tree: under a block heading, inside a detour. */
  level: number;
  first: boolean; last: boolean; selected: boolean; rail: RailFill; focusable: boolean; formats: LocaleFormats; search: string; arrival?: number; selfEmail: string | null;
  /** A merge on a single branch: how many versions it brought in, and whether they are shown. */
  detour?: { count: number; open: boolean };
  /** This version's stretch of the lanes, when the timeline draws more than one. */
  laneRow?: LaneRow; laneWidth?: number; connectTop?: boolean;
  onSelect: (commit: string) => void; onMove: (index: number) => void; onToggleDetour?: (merge: string, open: boolean) => void; onOpenDetail: () => void; onContextMenu?: (event: React.MouseEvent, version: SavedVersionSummary) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const title = versionTitle(version, t);
  const date = formatHistoryDate(version.authoredAt, formats);
  const isSelf = isSelfAuthor(version.author, selfEmail);
  const name = version.author?.name.trim() || t.historyAuthorUnknown;
  const author = isSelf ? t.historyAuthorYouNamed(name) : name;
  const glyphs = versionGlyphs(version, t);
  const match = hiddenMatch(version, title, search, t);
  /* What the avatar and the glyphs say, in words: a description, because the
     row's `aria-label` replaces its content. */
  const description = [author, ...glyphs.map((glyph) => glyph.label), ...(detour ? [t.historyDetourLabel(detour.count, detour.open)] : []), ...(match ? [t.historyMatchLabel(match)] : [])].join(", ");
  // Captured at mount: the arrival belongs to the render the row first
  // appears on (see `useRowArrival`), and a later render must not strip the
  // class mid-animation. The timeline it opens with is simply there.
  const [arrivalIndex] = useState(arrival);
  const arrivalStyle = arrivalIndex === undefined ? undefined : ({ "--row-index": arrivalIndex } as React.CSSProperties);
  // The row names the version and nothing else: the reference that points at it
  // seats itself in the detail strip beside it, which has room for it.
  const label = selected ? t.historySelectedVersion(title) : title;
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    // Right shows what a merge brought in and Left folds it again, the way a
    // tree opens a branch.
    if (detour && onToggleDetour && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      const open = event.key === "ArrowRight";
      if (open !== detour.open) {
        event.preventDefault();
        onToggleDetour(version.commit, open);
      }
      return;
    }
    const target = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1
      : event.key === "Home" ? 0 : event.key === "End" ? Number.MAX_SAFE_INTEGER
        : event.key === "PageDown" ? index + 8 : event.key === "PageUp" ? index - 8 : null;
    if (target === null) return;
    event.preventDefault();
    onMove(target);
  };
  return (
    <button id={`history-version-${version.commit}`} data-lane-tint={laneRow?.tint} className={`history-row${selected ? " history-row--selected" : ""}${version.publication === "local-only" ? " history-row--local" : version.publication === "published" ? " history-row--published" : ""}${version.isMerge ? " history-row--merge" : ""}${arrivalStyle ? " row-in" : ""}`} type="button" role="treeitem" aria-level={level} aria-expanded={detour ? detour.open : undefined} aria-selected={selected} aria-label={label} aria-description={description} tabIndex={focusable ? 0 : -1} data-first={first || undefined} data-last={last || undefined} data-rail={rail ?? undefined} style={laneRow ? { ...arrivalStyle, "--history-node-x": `${laneX(laneRow.lane)}px` } as React.CSSProperties : arrivalStyle} onClick={() => { onSelect(version.commit); onOpenDetail(); }} onKeyDown={handleKeyDown} onContextMenu={onContextMenu ? (event) => { onSelect(version.commit); onContextMenu(event, version); } : undefined}>
      {laneRow && laneWidth !== undefined && <LaneDrawing width={laneWidth} height={ROW_HEIGHT} commit={version.commit} row={laneRow} connectTop={connectTop} />}
      <span className="history-row__node" aria-hidden="true" />
      <span className="history-row__body"><span className="history-row__title" title={title}><VersionTitleText version={version} title={title} search={search} /></span><span className="history-row__meta"><VersionAuthorAvatar version={version} isSelf={isSelf} t={t} />{(glyphs.length > 0 || match) && <StateGlyphs>{glyphs.map((glyph) => <StateGlyph key={glyph.key} tone={glyph.tone} icon={glyph.icon} text={glyph.text} tooltip={glyph.tooltip} />)}{match && <StateGlyph tone="accent" icon={<Search />} text={match} tooltip={t.historyMatchLabel(match)} />}</StateGlyphs>}{detour && onToggleDetour && <span className={`history-detour${detour.open ? " history-detour--open" : ""}`} data-tooltip={detour.open ? t.historyDetourHide(detour.count) : t.historyDetourShow(detour.count)} aria-hidden="true" onClick={(event) => { event.stopPropagation(); onToggleDetour(version.commit, !detour.open); }}><ChevronRight />{formatNumber(detour.count, formats)}</span>}{date && <span className="history-row__date" title={t.historyVersionDate(date.absolute)}>{date.relative}</span>}</span></span>
    </button>
  );
});

const ROW_HEIGHT = 64;
const BOUNDARY_HEIGHT = 32;
const LOCAL_HEAD_HEIGHT = 34;
/** Where the local head's cloud sits, from its top — where its lane begins. */
const LOCAL_HEAD_NODE_Y = 19;

/** What the virtual list draws, one fixed height each: the head over the
 * versions only on this computer, where the published ones begin, and a
 * version. */
type TimelinePiece = { kind: "head" } | { kind: "boundary" } | { kind: "version"; version: SavedVersionSummary; index: number };
const PIECE_HEIGHT = { head: LOCAL_HEAD_HEIGHT, boundary: BOUNDARY_HEIGHT, version: ROW_HEIGHT } as const;
const pieceKey = (piece: TimelinePiece): string => (piece.kind === "version" ? piece.version.commit : piece.kind);
const NO_DETOURS: ReadonlyMap<string, Detour> = new Map();

/* The head over the versions only on this computer: Overview's and Branches'
   chip on the rail, which is also the button that folds the block — its
   chevron inside it, and no count (a screen reader hears it in the label).
   Beside it, the way to publish them, on the current
   branch only — the publish flow publishes that branch, so under another scope it
   would not send the versions under the head. A pointer shortcut, out of the
   tab order and hidden with the head it sits on: it lives inside the listbox,
   where only options belong, and Publish in the toolbar is the same action
   for a keyboard. */
function LocalGroupHead({ count, expanded, onToggle, onPublish, t, drawing }: { count: number; expanded: boolean; onToggle: () => void; onPublish?: () => void; t: Translations; drawing?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="history-local-head">
      {drawing}
      <TimelineChip kind="local" label={t.historyLocalGroup} className="history-block-chip" button={{ role: "treeitem", "aria-level": 1, "aria-expanded": expanded, "aria-label": t.historyBlockLabel(t.historyLocalGroup, count), onClick: onToggle, onKeyDown: blockKeys(expanded, onToggle) }}>
        <ChevronRight className="history-block-chip__chevron" aria-hidden="true" />
      </TimelineChip>
      {onPublish && <button className="history-local-head__publish" type="button" tabIndex={-1} data-tooltip={t.historyBoundaryPublishHint} onMouseDown={(event) => event.preventDefault()} onClick={() => onPublish()}><CloudUpload className="history-local-head__publish-icon" />{t.historyLocalGroupPublish}</button>}
    </div>
  );
}

const HistoryTimeline = React.memo(function HistoryTimeline({ versions: allVersions, selectedCommit, publishedTo, remoteGone, scrollOffset, isLoading, hasMore, isLoadingMore, hasMoreError, clientTruncated, formats, currentBranch, selfEmail, search, filters, scope, authorSuggestions, pathSuggestions, canFilterPublication, actions, onSearch, onFilters, onScope, onSelect, onLoadMore, onScrollOffset, onOpenDetail }: {
  versions: SavedVersionSummary[]; selectedCommit: string | null; publishedTo: string | null; remoteGone: boolean; scrollOffset: number; isLoading: boolean; hasMore: boolean; isLoadingMore: boolean; hasMoreError: boolean; clientTruncated: boolean; formats: LocaleFormats; currentBranch: string | null; selfEmail: string | null; search: string; filters: HistoryFilters; scope: HistoryScope; authorSuggestions: string[]; pathSuggestions: string[]; canFilterPublication: boolean; actions: HistoryBranchActions;
  onSearch: (value: string) => void; onFilters: (filters: HistoryFilters) => void; onScope: (scope: HistoryScope) => void; onSelect: (commit: string) => void; onLoadMore: () => void; onScrollOffset: (offset: number) => void; onOpenDetail: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [rowMenu, setRowMenu] = useState<{ anchor: ContextMenuAnchor; version: SavedVersionSummary } | null>(null);
  const closeRowMenu = useCallback((restoreFocus: boolean) => {
    setRowMenu((open) => {
      if (restoreFocus) open?.anchor.focusTarget?.focus();
      return null;
    });
  }, []);
  const hasRowActions = Boolean(actions.onViewBranch || actions.onSwitchBranch || actions.onCreateBranchFromVersion);
  const openRowMenu = useCallback((event: React.MouseEvent, version: SavedVersionSummary) => {
    event.preventDefault();
    setRowMenu({ anchor: contextMenuAnchorFrom(event), version });
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtered = countActiveFilters(filters) > 0;
  const searchQuery = search.trim().toLocaleLowerCase();
  /* A search or a filter answers with versions that are not a connected
     history, so its rows stand on the plain rail. Otherwise a single line is
     read straight — its own versions, with each merge folding what it brought
     in until the reader opens it — and "All branches" draws every branch. */
  const plain = filtered || searchQuery.length > 0;
  const [openDetours, setOpenDetours] = useState<ReadonlySet<string>>(() => new Set());
  /* The two blocks — what is only here, and what the remote has — fold the
     way Branches' blocks do. Only when both are there: a lone "published"
     heading over every version would say nothing. */
  const [foldedBlocks, setFoldedBlocks] = useState({ local: false, published: false });
  const { visible: versions, detours } = useMemo(
    () => (plain || scope.kind === "allBranches" ? { visible: allVersions, detours: NO_DETOURS } : versionsWithDetours(allVersions, openDetours)),
    [allVersions, openDetours, plain, scope.kind],
  );
  const detoursRef = useRef(detours);
  detoursRef.current = detours;
  // A version chosen while folded away — from a search, or another screen —
  // opens the merge that holds it, so the selection is always on screen.
  useEffect(() => {
    if (!selectedCommit || versions.some((version) => version.commit === selectedCommit)) return;
    const merge = detourHolding(detours, selectedCommit);
    if (merge) setOpenDetours((current) => new Set(current).add(merge));
  }, [detours, selectedCommit, versions]);
  const toggleDetour = useCallback((merge: string, open: boolean): void => {
    setOpenDetours((current) => {
      const next = new Set(current);
      if (open) next.add(merge);
      else next.delete(merge);
      return next;
    });
    // Folding away the selected version leaves the selection on the merge.
    if (!open && selectedCommit && detoursRef.current.get(merge)?.versions.includes(selectedCommit)) onSelect(merge);
  }, [onSelect, selectedCommit]);
  const layout = useMemo(() => (plain ? null : layoutLanes(versions)), [plain, versions]);
  /* The lane under the pointer: pointing at a lane names its branch and lifts
     it out of the others; pointing at a row lifts the lane its node is on. */
  const [hoveredLane, setHoveredLane] = useState<{ tint: number; x: number; y: number; onStroke: boolean } | null>(null);
  const lanesKey = useId().replace(/[^a-zA-Z0-9]/g, "");
  const trackLane = useCallback((event: React.PointerEvent<HTMLElement>): void => {
    const target = event.target as Element;
    const stroke = target.closest("[data-tint]");
    const row = stroke ? null : target.closest("[data-lane-tint]");
    const tint = Number((stroke ?? row)?.getAttribute(stroke ? "data-tint" : "data-lane-tint"));
    if ((stroke || row) && Number.isFinite(tint)) setHoveredLane({ tint, x: event.clientX, y: event.clientY, onStroke: Boolean(stroke) });
    else setHoveredLane(null);
  }, []);
  /* One lane is the rail as it has always been, selection stretch and all;
     lanes replace it only where the history really branches. */
  const lanesOn = layout !== null && layout.width > 1;
  const laneWidth = layout ? laneX(layout.width - 1) + 8 : 0;

  const selectedIndex = versions.findIndex((version) => version.commit === selectedCommit);
  // A version saved while this timeline is open arrives at the head and
  // animates; the timeline it opens with is simply there, and loading an older
  // page is not a set of arrivals (see `useRowArrival`).
  const arrivalKeys = useMemo(() => versions.map((version) => version.commit), [versions]);
  const arrivals = useRowArrival(arrivalKeys, currentBranch ?? "", "prepended");
  /* Where what is only on this computer ends and what the remote has begins:
     the first published version after an unpublished one. It is drawn as
     Overview draws it — a group head over the versions only here and the
     remote's mark where its copy begins — so the two timelines tell it with
     the same pieces in the same order. Nothing is drawn when everything is on
     one side. */
  const boundaryIndex = useMemo(() => versions.findIndex((version, index) =>
    index > 0 && version.publication === "published" && versions[index - 1].publication === "local-only"), [versions]);
  /* Under "All branches" each version is measured against every remote branch,
     but the column mixes branches in Git's order: the blocks are drawn there only
     when every local version comes before every published one — the usual
     case, unpublished work on top — so a block never holds a version of the
     other kind. Otherwise the nodes and the laptop glyph say it per row. */
  const hasLocalHead = boundaryIndex > 0 && (scope.kind !== "allBranches" || versions.slice(boundaryIndex).every((version) => version.publication !== "local-only"));
  const canPublishFromBoundary = Boolean(actions.onPublish) && scope.kind === "currentBranch";
  /* The pieces the list draws — the local head and the local block's rows,
     the boundary and the published block's — each with the lanes that
     cross it from above. A folded block keeps its heading and draws nothing
     under it; the lanes still run through, from the last version above. */
  const { pieces, lanesAbove } = useMemo(() => {
    const out: TimelinePiece[] = [];
    const above: Array<readonly LaneSlot[]> = [];
    const lanesAfter = (index: number): readonly LaneSlot[] =>
      (layout && versions[index] ? layout.rows.get(versions[index].commit)?.lanesOut : undefined) ?? [];
    const addVersions = (from: number, to: number, start: readonly LaneSlot[]): void => {
      let current = start;
      for (let index = from; index < to; index++) {
        out.push({ kind: "version", version: versions[index]!, index });
        above.push(current);
        current = lanesAfter(index);
      }
    };
    if (!hasLocalHead) {
      addVersions(0, versions.length, []);
      return { pieces: out, lanesAbove: above };
    }
    out.push({ kind: "head" });
    above.push([]);
    if (!foldedBlocks.local) addVersions(0, boundaryIndex, []);
    out.push({ kind: "boundary" });
    above.push(lanesAfter(boundaryIndex - 1));
    if (!foldedBlocks.published) addVersions(boundaryIndex, versions.length, lanesAfter(boundaryIndex - 1));
    return { pieces: out, lanesAbove: above };
  }, [boundaryIndex, foldedBlocks, hasLocalHead, layout, versions]);
  const shownVersions = useMemo(() => pieces.flatMap((piece) => (piece.kind === "version" ? [piece.version] : [])), [pieces]);
  const shownPosition = useMemo(() => new Map(shownVersions.map((version, position) => [version.commit, position])), [shownVersions]);
  const inOpenDetour = useMemo(() => new Set([...detours.values()].flatMap((detour) => (detour.open ? detour.versions : []))), [detours]);
  const toggleBlock = useCallback((block: "local" | "published") => setFoldedBlocks((current) => ({ ...current, [block]: !current[block] })), []);
  const pieceIndex = useMemo(() => new Map(pieces.flatMap((piece, index) => (piece.kind === "version" ? [[piece.version.commit, index] as const] : []))), [pieces]);
  const firstVersionPiece = pieces.findIndex((piece) => piece.kind === "version");
  const focusCommit = selectedCommit && shownPosition.has(selectedCommit) ? selectedCommit : shownVersions[0]?.commit ?? null;
  const selectedPiece = selectedCommit ? pieceIndex.get(selectedCommit) ?? -1 : -1;
  const virtualizer = useVirtualizer({ count: pieces.length, getScrollElement: () => scrollRef.current, estimateSize: (index) => PIECE_HEIGHT[pieces[index]?.kind ?? "version"], overscan: 6, getItemKey: (index) => (pieces[index] ? pieceKey(pieces[index]) : index) });
  // Pieces arrive, leave and change kind; the virtualizer only reads their
  // heights back when asked.
  useLayoutEffect(() => { virtualizer.measure(); }, [pieces, virtualizer]);
  const rows = virtualizer.getVirtualItems();
  const lastIndex = rows.at(-1)?.index ?? -1;

  useLayoutEffect(() => {
    // Restore once after mounting. Retained screens already hold the user's
    // live position, including scrolls not yet saved by the debounce below.
    if (restoredRef.current || !scrollRef.current || search || filtered) return;
    scrollRef.current.scrollTop = scrollOffset;
    restoredRef.current = true;
  }, [filtered, scrollOffset, search]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    // A scroll moves the lanes from under a resting pointer: the card it showed
    // would name whatever lane used to be there.
    const save = (): void => { setHoveredLane(null); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => onScrollOffset(element.scrollTop), 120); };
    element.addEventListener("scroll", save, { passive: true });
    return () => { element.removeEventListener("scroll", save); if (saveTimer.current) clearTimeout(saveTimer.current); if (!search && !filtered) onScrollOffset(element.scrollTop); };
  }, [filtered, onScrollOffset, search]);

  useEffect(() => {
    // The search box still narrows the rows on screen, so it is the one thing
    // that can make the tail arrive early and stall paging; the filters are
    // answered by Git and page normally underneath them.
    //
    // `isLoading` matters as much as `isLoadingMore`: while the first page of
    // a new question is in flight the rows on screen still belong to the old
    // one, and their tail says nothing about where the new history ends.
    // A folded published block is not a reason to read the rest of history.
    if (!search && !isLoading && !(hasLocalHead && foldedBlocks.published) && lastIndex >= pieces.length - 18 && hasMore && !isLoadingMore) onLoadMore();
  }, [foldedBlocks.published, hasLocalHead, hasMore, isLoading, isLoadingMore, lastIndex, onLoadMore, pieces.length, search]);

  const moveSelection = useCallback((target: number): void => {
    const index = Math.max(0, Math.min(target, shownVersions.length - 1));
    const version = shownVersions[index];
    if (!version) return;
    onSelect(version.commit);
    virtualizer.scrollToIndex(pieceIndex.get(version.commit) ?? index, { align: "auto" });
    requestAnimationFrame(() => document.getElementById(`history-version-${version.commit}`)?.focus());
  }, [onSelect, pieceIndex, shownVersions, virtualizer]);
  // The panel around these rows, and its header with the Work screen's tabs,
  // belong to `HistoryPanel`: they are the same nodes in every state it has.
  return (
    <>
      {/* One strip, the way the Changes file list has one. Searching and
          filtering answer the same question, so they share a row; it steps down
          a size from the header above it, as an inner strip should. */}
      <div className="history-timeline__toolbar">
        <SearchBox
          value={search}
          onChange={onSearch}
          placeholder={t.historySearchPlaceholder}
          ariaLabel={t.historySearchAriaLabel}
          clearLabel={t.commonClearSearch}
          trailing={<>
            <HistoryFilterPanel
              filters={filters}
              scope={scope}
              branches={actions.branches ?? []}
              authorSuggestions={authorSuggestions}
              pathSuggestions={pathSuggestions}
              canFilterPublication={canFilterPublication}
              onChange={onFilters}
              onScope={onScope}
            />
            <HistoryScopeToggle scope={scope} onScope={onScope} t={t} />
          </>}
        />
      </div>
      {/* A branch chosen by name, as a chip in a state row of its own — the row
          the Changes list gives its breakdown. All branches says itself on the
          toggle in the search box, so it needs no chip; the current branch
          needs none either. It stays out of the filter chips: clearing the
          filters cannot touch it and should not. */}
      {scope.kind === "branch" && <div className="history-timeline__state">
        <button
          className="history-scope-chip"
          type="button"
          title={t.historyScopeBranchHint(scope.name)}
          aria-label={t.historyScopeClear}
          onClick={() => onScope(CURRENT_BRANCH_SCOPE)}
        >
          <GitBranch aria-hidden="true" />
          <span>{scope.name}</span>
          <X aria-hidden="true" />
        </button>
      </div>}
      <HistoryFilterChips filters={filters} onChange={onFilters} />
      {/* A thread while Git answers, rather than an emptied list: the rows
          below are the previous answer and the strip says they are being
          replaced. */}
      {isLoading && versions.length > 0 && <div className="history-timeline__progress"><LoadingBar label={t.historyLoading} /></div>}
      {/* The lane under the pointer, lifted out of the others — scoped to this
          timeline, so another History on the screen keeps its own — and the
          card naming its branch beside the pointer. */}
      {lanesOn && hoveredLane && <style>{`[data-lanes="${lanesKey}"] .history-lane-stroke:not([data-tint="${hoveredLane.tint}"]) { opacity: 0.32; } [data-lanes="${lanesKey}"] .history-lane-stroke[data-tint="${hoveredLane.tint}"] { stroke-width: 2; } [data-lanes="${lanesKey}"] .history-row[data-lane-tint="${hoveredLane.tint}"] .history-row__node { border-color: ${laneTint(hoveredLane.tint)}; }`}</style>}
      {lanesOn && hoveredLane?.onStroke && layout && <LaneCard layout={layout} tint={hoveredLane.tint} readingOne={scope.kind !== "allBranches"} x={hoveredLane.x} y={hoveredLane.y} t={t} />}
      <div {...autoHideScrollbarProps<HTMLDivElement>()} ref={scrollRef} className={`history-timeline__scroll auto-hide-scrollbar${lanesOn ? " history-timeline--lanes" : ""}`} style={lanesOn ? { "--history-lanes-inset": `${Math.max(35, laneWidth + 13)}px` } as React.CSSProperties : undefined} role="tree" aria-label={t.historyTimelineAriaLabel} data-lanes={lanesKey} onPointerMove={lanesOn ? trackLane : undefined} onPointerLeave={() => setHoveredLane(null)}>
        {versions.length ? <div className="history-timeline__virtual" style={{ height: virtualizer.getTotalSize() }}>
          {rows.map((virtualRow) => {
            const piece = pieces[virtualRow.index];
            if (!piece) return null;
            const passing = lanesAbove[virtualRow.index] ?? [];
            const aboveSelection = selectedPiece > virtualRow.index && virtualRow.index > firstVersionPiece;
            let body: React.ReactNode;
            if (piece.kind === "head") {
              const first = layout && versions[0] ? layout.rows.get(versions[0].commit) : undefined;
              const headLane: LaneSlot[] = first ? Array.from({ length: first.lane + 1 }, (_, lane) => (lane === first.lane ? { commit: versions[0]!.commit, tint: first.tint } : null)) : [];
              body = <LocalGroupHead count={boundaryIndex} expanded={!foldedBlocks.local} onToggle={() => toggleBlock("local")} onPublish={canPublishFromBoundary ? actions.onPublish : undefined} t={t} drawing={lanesOn ? <LaneDrawing width={laneWidth} height={LOCAL_HEAD_HEIGHT} passing={headLane} fromY={LOCAL_HEAD_NODE_Y} /> : undefined} />;
            } else if (piece.kind === "boundary") {
              /* "Published", the pair of "Local": one word for what the
                 versions are. Where they are published — the remote and its
                 branch — is on the tooltip, which the remote's name in the
                 heading only repeated less clearly. */
              const words = t.historyBoundaryPublished;
              const expanded = !foldedBlocks.published;
              body = <div className="history-boundary" data-rail={aboveSelection ? "filled" : undefined} data-folded={expanded ? undefined : ""} data-tooltip={remoteGone ? t.historyBoundaryGoneHint(publishedTo) : t.historyBoundaryHint(publishedTo)}>{lanesOn && <LaneDrawing width={laneWidth} height={BOUNDARY_HEIGHT} passing={passing} />}<TimelineChip kind="published" label={words} className="history-block-chip" button={{ role: "treeitem", "aria-level": 1, "aria-expanded": expanded, "aria-label": words, onClick: () => toggleBlock("published"), onKeyDown: blockKeys(expanded, () => toggleBlock("published")) }}><ChevronRight className="history-block-chip__chevron" aria-hidden="true" /></TimelineChip></div>;
            } else {
              const { version, index } = piece;
              const rail: RailFill = lanesOn || selectedIndex < 0 ? null : index < selectedIndex ? "filled" : index === selectedIndex ? "half" : null;
              const detour = detours.get(version.commit);
              body = <TimelineRow version={version} index={shownPosition.get(version.commit) ?? index} level={(hasLocalHead ? 2 : 1) + (inOpenDetour.has(version.commit) ? 1 : 0)} first={index === 0 && !hasLocalHead} last={index === versions.length - 1} selected={version.commit === selectedCommit} rail={rail} focusable={version.commit === focusCommit} formats={formats} search={searchQuery} arrival={arrivals.get(version.commit)} selfEmail={selfEmail} detour={detour ? { count: detour.versions.length, open: detour.open } : undefined} laneRow={lanesOn ? layout?.rows.get(version.commit) : undefined} laneWidth={lanesOn ? laneWidth : undefined} connectTop={index === 0 && hasLocalHead} onSelect={onSelect} onMove={moveSelection} onToggleDetour={detours.size > 0 ? toggleDetour : undefined} onOpenDetail={onOpenDetail} onContextMenu={hasRowActions ? openRowMenu : undefined} />;
            }
            return <div key={virtualRow.key} className={`history-timeline__virtual-row history-timeline__virtual-row--${piece.kind}`} style={{ height: PIECE_HEIGHT[piece.kind], transform: `translateY(${virtualRow.start}px)` }}>{body}</div>;
          })}
        </div> : isLoading ? <div className="empty-line history-timeline__empty"><LoadingBar label={t.historyLoading} /></div> : <div className="empty-line history-timeline__empty">
          <p>{t.historyNoMatches}</p>
          {filtered && <button className="secondary-button secondary-button--sm" type="button" onClick={() => onFilters(NO_HISTORY_FILTERS)}>{t.historyFiltersClear}</button>}
          {/* A scope is not cleared by "clear filters", so an empty list under
              one has to offer its own way back. */}
          {scope.kind !== "currentBranch" && <button className="secondary-button secondary-button--sm" type="button" onClick={() => onScope(CURRENT_BRANCH_SCOPE)}>{t.historyScopeShowCurrentBranch}</button>}
        </div>}
        {rowMenu && <HistoryVersionMenu
          anchor={rowMenu.anchor}
          version={rowMenu.version}
          currentBranch={currentBranch}
          actions={actions}
          onClose={closeRowMenu}
        />}
        <div className="history-timeline__footer">
          {hasMoreError && <div className="history-inline-error" role="alert"><span>{t.historyMoreError}</span><button className="secondary-button" type="button" onClick={onLoadMore}>{t.historyRetry}</button></div>}
          {/* Older versions belong to the published block: folded, it offers none. */}
          {hasMore && !clientTruncated && !(hasLocalHead && foldedBlocks.published) && (isLoadingMore ? <div className="history-timeline__loading-more"><LoadingBar label={t.historyLoadingMore} showLabel /></div> : <button className="secondary-button" type="button" onClick={onLoadMore}>{t.historyLoadMore}</button>)}
        </div>
      </div>
    </>
  );
});

function HistoryFileButton({ file, selected, inFolders, grouped, onSelect }: { file: HistoryFileChange; selected: boolean; inFolders: boolean; grouped: boolean; onSelect: () => void }): React.JSX.Element {
  const { t } = useLanguage();
  const { name, dir } = splitPath(file.path);
  const category = t[CATEGORY_LABEL_KEYS[file.category]];
  const FileTypeIcon = getFileTypeIcon(file.path);
  // In folders the file is a row of a tree of buttons, not an option of a
  // listbox; under a folder, that folder is the row above it, so it drops its
  // own. A root file keeps the list's shape — nothing groups it.
  const selection = inFolders ? { "aria-current": selected || undefined } : { role: "option", "aria-selected": selected };
  return <button className={`history-file${selected ? " history-file--selected" : ""}${grouped ? " history-file--tree" : ""}`} type="button" {...selection} aria-label={`${file.path} — ${category}`} onClick={onSelect}><span className="history-file__type" aria-hidden="true"><FileTypeIcon /></span><span className="history-file__path"><strong>{name}</strong>{dir && !grouped && <span>{dir}</span>}</span><span className={`history-file__category history-file__category--${file.category}`} title={category} aria-hidden="true">{CHANGE_CATEGORY_ICONS[file.category]}</span></button>;
}

/** Row heights, per kind: the list's two-line file, and the folder view's
 * folder and one-line file. Fixed, so the virtualizer never has to measure. */
const FILE_ROW_HEIGHT = { list: 58, folder: 36, file: 40 } as const;

function ChangedFiles({ rows, inFolders, selectedPath, formats, onSelect, onToggleFolder }: {
  rows: FileTreeRow<HistoryFileChange>[]; inFolders: boolean; selectedPath: string | null; formats: LocaleFormats;
  onSelect: (path: string) => void; onToggleFolder: (path: string, expanded: boolean) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const heightOf = (row: FileTreeRow<HistoryFileChange> | undefined): number =>
    row?.kind === "folder" ? FILE_ROW_HEIGHT.folder : row && isGroupedFileRow(inFolders, row) ? FILE_ROW_HEIGHT.file : FILE_ROW_HEIGHT.list;
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: (index) => heightOf(rows[index]), overscan: 6, getItemKey: (index) => { const row = rows[index]; return row ? `${row.kind}:${row.path}` : index; } });
  // Each row's height follows its kind, which changes with the layout, a fold
  // or a search — sometimes with the count unchanged, which is all the
  // virtualizer watches. Keyed on the rows' shape rather than the array,
  // which is new on every render.
  const shape = rows.map((row) => (row.kind === "folder" ? "d" : isGroupedFileRow(inFolders, row) ? "g" : "f")).join("");
  useLayoutEffect(() => { virtualizer.measure(); }, [shape, virtualizer]);
  return <div {...autoHideScrollbarProps<HTMLDivElement>()} ref={scrollRef} className="history-files auto-hide-scrollbar" role={inFolders ? "group" : "listbox"} aria-label={t.historyFilesAriaLabel}><div className="history-files__virtual" style={{ height: virtualizer.getTotalSize() }}>{virtualizer.getVirtualItems().map((virtualRow) => {
    const row = rows[virtualRow.index];
    const style: React.CSSProperties = { transform: `translateY(${virtualRow.start}px)`, height: heightOf(row), ...(inFolders ? treeIndentStyle(row.depth) : undefined) };
    return <div key={virtualRow.key} className={`history-files__row${inFolders ? " history-files__row--tree" : ""}`} style={style}>{row.kind === "folder"
      ? <FileTreeFolderButton row={row} formats={formats} onToggle={onToggleFolder} t={t} />
      : <HistoryFileButton file={row.item} selected={row.path === selectedPath} inFolders={inFolders} grouped={isGroupedFileRow(inFolders, row)} onSelect={() => onSelect(row.path)} />}</div>;
  })}</div></div>;
}

const NO_COLLAPSED_FOLDERS: ReadonlySet<string> = new Set();
const filePath = (file: HistoryFileChange): string => file.path;

function HistoryDetailStrip({ version, formats, currentBranch, selfEmail, actions, detailsOpen, onToggleDetails }: {
  /** The timeline's summary is enough: the strip reads nothing the detail adds,
   * so it is drawn whole while the detail is still being read. */
  version: SavedVersionSummary;
  formats: LocaleFormats;
  /** `HEAD`'s own branch, so a branch action can say where the project already is. */
  currentBranch: string | null;
  /** The user's own Git email: their versions say "You", the name on hover. */
  selfEmail: string | null;
  actions: HistoryBranchActions;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const title = versionTitle(version, t);
  const isSelf = isSelfAuthor(version.author, selfEmail);
  // When, as the timeline row says it: relative, the exact date on hover.
  const date = formatHistoryDate(version.authoredAt, formats);
  const [menu, setMenu] = useState<{ anchor: ContextMenuAnchor } | null>(null);
  const closeMenu = (restoreFocus: boolean): void => {
    setMenu((open) => {
      if (restoreFocus) open?.anchor.focusTarget?.focus();
      return null;
    });
  };
  // Anchored to the control's own box rather than to the pointer: it is opened
  // by activating a control, which a keyboard does without coordinates.
  const openMenu = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ anchor: { x: rect.right, y: rect.bottom + 4, focusTarget: event.currentTarget } });
  };
  const hasMenu = Boolean(actions.onViewBranch || actions.onSwitchBranch || actions.onCreateBranchFromVersion);
  return (
    <header className="history-detail__strip">
      {/* One line, and the subject has it. What else the strip says is the
          timeline row's own shorthand at the trailing end: whether it has left
          the machine, who saved it and when. The branches pointing here, the
          hash and the file count are behind `Details`; the branch being stood
          on is in the status bar under this screen. */}
      <h2 id="history-detail-title" className="history-detail__strip-title" title={title}><VersionTitleText version={version} title={title} /></h2>
      <p className="history-detail__strip-facts">
        {/* The glyph the timeline row wears, explained on its tooltip and
            named to a screen reader here, where it is not folded into a row's
            description. Published draws nothing, as on the row, and so does
            an unknown answer (no upstream) — a strip must not say "no idea";
            `Details` states both in full. */}
        {version.publication === "local-only" && (
          <>
            <StateGlyph tone="local" icon={<LocalOnlyIcon />} tooltip={t.historyGlyphLocalOnly} />
            <span className="visually-hidden">{t.historyLocalOnly}</span>
          </>
        )}
        <VersionAuthorAvatar version={version} isSelf={isSelf} t={t} size="strip" />
        <span className="visually-hidden">{isSelf ? t.historyAuthorYou : version.author?.name || t.historyAuthorUnknown}</span>
        {date && <span className="history-detail__strip-date" title={t.historyVersionDate(date.absolute)}>{date.relative}</span>}
      </p>
      <div className="history-detail__strip-trailing">
        <button className="history-details-toggle" type="button" aria-expanded={detailsOpen} aria-label={t.historyDetails} data-tooltip={t.historyDetails} onClick={onToggleDetails}>
          <ChevronRight aria-hidden="true" className="history-details-toggle__caret" />
        </button>
        {hasMenu && <button className="history-more-button" type="button" aria-haspopup="menu" aria-expanded={menu !== null} aria-label={t.historyVersionActionsLabel} data-tooltip={t.historyMore} onClick={openMenu}>
          <Ellipsis aria-hidden="true" />
        </button>}
      </div>
      {menu && <HistoryVersionMenu anchor={menu.anchor} version={version} currentBranch={currentBranch} actions={actions} onClose={closeMenu} />}
    </header>
  );
}

/** The version's story, behind the strip's `Details` disclosure: the full
 * message, what the diff is compared against, and the facts the strip cannot
 * carry at strip height. Closed by default, so the diff keeps the whole card. */
function HistoryDetails({ detail, formats, comparison, fileCount }: {
  detail: SavedVersionDetail;
  formats: LocaleFormats;
  comparison: string;
  /** How many files this version touched, said in words because it is sometimes
   * a floor rather than a count. It lives here, in the facts, because the strip
   * only carries what has to survive next to the subject. */
  fileCount: string;
}): React.JSX.Element {
  const { t } = useLanguage();
  const version = detail.version;
  const authored = formatHistoryDate(version.authoredAt, formats);
  const committed = formatHistoryDate(version.committedAt, formats);
  const description = version.description.trim();
  const hasKind = version.isRoot || version.isMerge;
  // Scrolls within itself, capped to part of the card: a long message used to
  // grow it past the card's height and push the files and the diff out of
  // reach. Focusable, so a keyboard can scroll it as well.
  return <section {...autoHideScrollbarProps<HTMLElement>()} className="history-details auto-hide-scrollbar" tabIndex={0} aria-label={t.historyDetails}>
    <div className="history-details__main">
      <h3>{t.historyDetailsMessage}</h3>
      {description
        ? <p className="history-details__message">{description}</p>
        : <p className="history-details__message history-details__message--empty">{t.historyNoDescription}</p>}
      {version.descriptionTruncated && <p className="history-detail__truncated" role="note">{t.historyDescriptionTruncated}</p>}
      <p className="history-details__comparison"><GitCommitHorizontal aria-hidden="true" />{comparison}</p>
    </div>
    <div className="history-details__facts">
      <h3>{t.historyCommitDetails}</h3>
      <dl className="history-details__list">
        <div><dt>{t.historyCommitLabel}</dt><dd><code>{version.commit}</code></dd></div>
        <div><dt>{t.historyParentsLabel}</dt><dd>{version.parents.length ? version.parents.map((parent) => <code key={parent}>{parent.slice(0, 10)}</code>) : t.historyNoParents}</dd></div>
        <div><dt>{t.historyAuthorLabel}</dt><dd><span>{version.author?.name || t.historyAuthorUnknown}</span>{version.author?.email && <small>{version.author.email}</small>}</dd></div>
        <div><dt>{t.historyCommittedLabel}</dt><dd>{committed?.absolute ?? authored?.absolute ?? "—"}</dd></div>
        <div><dt>{t.historyPublicationLabel}</dt><dd><span className={`history-publication history-publication--${version.publication}`}><PublicationIcon publication={version.publication} />{publicationCopy(version.publication, t)}</span></dd></div>
        <div><dt>{t.historyFilesLabel}</dt><dd>{fileCount}</dd></div>
        <div><dt>{t.historyRefsLabel}</dt><dd>
          {version.isRoot && <span className="history-kind-chip">{t.historyRoot}</span>}
          {version.isMerge && <span className="history-kind-chip">{t.historyMerge}</span>}
          {version.decorations.map((item) => <span className="history-technical-chip" key={item.fullRef}>{item.kind === "tag" && <Tag aria-hidden="true" />}{item.name}</span>)}
          {!version.decorations.length && !hasKind && "—"}
        </dd></div>
      </dl>
    </div>
  </section>;
}

function diffHunkCount(diff: FileDiff | null): number { return diff && "hunks" in diff ? diff.hunks.length : 0; }

/** Calendar day, `YYYY-MM-DD`, `days` before today — the shape Rust validates
 * and the only date vocabulary that means the same thing tomorrow. */
function dayBefore(days: number): string {
  const day = new Date();
  day.setDate(day.getDate() - days);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

function dateRanges(t: Translations): Array<{ label: string; since: string | null }> {
  return [
    { label: t.historyFilterDateAny, since: null },
    { label: t.historyFilterDateWeek, since: dayBefore(7) },
    { label: t.historyFilterDateMonth, since: dayBefore(30) },
    { label: t.historyFilterDateYear, since: dayBefore(365) },
  ];
}

/** A calendar day as the reader writes it.
 *
 * Read through `shared/ui`'s own `toDate` rather than `new Date(day)`: that one
 * is UTC midnight and renders as the day before anywhere west of Greenwich, and
 * a chip naming the wrong day is worse than one naming a raw one. The trap is
 * solved once, where the picker that produces these days already solves it. */
function formatCalendarDay(day: string, formats: LocaleFormats): string {
  const parsed = toDate(day);
  return parsed ? formatDate(parsed, formats, "date") : day;
}

/** What is currently narrowing the list, said once, in the order the panel
 * asks for it. The chips under the search box and the panel's own footer both
 * read this, so the two can never disagree about what "3 filters" means. */
function activeFilters(filters: HistoryFilters, t: Translations, formats: LocaleFormats): Array<{ key: string; label: string; cleared: Partial<HistoryFilters> }> {
  const described: Array<{ key: string; label: string; cleared: Partial<HistoryFilters> }> = [];
  if (filters.author) described.push({ key: "author", label: filters.author, cleared: { author: null } });
  if (filters.since) {
    // A range chosen yesterday is still a date today, so the name is looked up
    // rather than assumed: an unmatched date says itself instead of nothing.
    // A preset is shorthand for a `since` with no `until`, so once the other end
    // is set the name no longer describes the filter: "7 days" beside "To 5 Sep"
    // says the last seven, which is not what is being read. An explicit range
    // names both of its ends.
    const named = filters.until === null
      ? dateRanges(t).find((range) => range.since === filters.since)
      : undefined;
    described.push({
      key: "since",
      label: named?.label ?? t.historyFilterDateSinceChip(formatCalendarDay(filters.since, formats)),
      cleared: { since: null },
    });
  }
  // Part of the same filter set Rust answers and `countActiveFilters` counts,
  // so the badge and the chips talk about the same six things — a count that
  // says three beside two chips is worse than either alone.
  if (filters.until) {
    described.push({
      key: "until",
      label: t.historyFilterDateUntilChip(formatCalendarDay(filters.until, formats)),
      cleared: { until: null },
    });
  }
  if (filters.path) described.push({ key: "path", label: filters.path, cleared: { path: null } });
  if (filters.noMerges) described.push({ key: "noMerges", label: t.historyFilterHideMerges, cleared: { noMerges: false } });
  if (filters.unpublishedOnly) described.push({ key: "unpublishedOnly", label: t.historyFilterUnpublishedOnly, cleared: { unpublishedOnly: false } });
  if (filters.taggedOnly) described.push({ key: "taggedOnly", label: t.historyFilterTaggedOnly, cleared: { taggedOnly: false } });
  return described;
}

/** The filters that are on, under the strip that set them, each removable on
 * its own. `shared/ui` draws the row; what belongs to History is which chips
 * are in it and what removing one means. */
function HistoryFilterChips({ filters, onChange }: {
  filters: HistoryFilters;
  onChange: (filters: HistoryFilters) => void;
}): React.JSX.Element | null {
  const { t, formats } = useLanguage();
  const chips: FilterChip[] = activeFilters(filters, t, formats).map((chip) => ({
    key: chip.key,
    label: chip.label,
    onRemove: () => onChange({ ...filters, ...chip.cleared }),
  }));
  return <FilterChips chips={chips} removeLabel={t.historyFilterRemove} />;
}

/** Which history the timeline is reading, inside the panel the filters share.
 *
 * A scope is not a filter — it chooses the graph the filters then narrow — but
 * it is the same question the reader is already in this panel to answer, and
 * giving it a bar of its own above the list would spend a second row of chrome
 * on a control that is set once and then left alone.
 *
 * Two capsules and a name field rather than a list of every branch: the two
 * common answers are one click each, and the third reuses the completion field
 * the author filter above it already established. A name is applied only when
 * this project actually has that branch, so a typo is refused here rather than
 * sent to Git to fail. */
/** What someone types when they mean a folder in this project.
 *
 * Git wants a repository-relative path and Rust refuses anything else, so
 * `/src`, `src/`, `./src` and a Windows `src\app` all used to fail the whole
 * read with "that file path isn't valid" — for four spellings of a path that is
 * perfectly valid. An absolute path still fails, because that one is a
 * different place rather than a different spelling of this one. */
function normalizeRepoPath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

/** Dismissal for a list that lives *inside* the filter panel.
 *
 * The panel's own `useAnchoredPopup` only closes what is pressed outside the
 * panel, so a list opened within it stayed open under whatever the reader
 * reached for next — and the scope picker and the two field shortcuts could all
 * be open at once, overlapping each other. The parts are passed rather than one
 * container because a shortcut is a trigger and a list with no wrapper between
 * them.
 *
 * Focus is not restored: the press is already putting it where the reader
 * meant it to go. */
function useDismissOnOutsidePress(
  isOpen: boolean,
  parts: Array<React.RefObject<HTMLElement | null>>,
  close: () => void,
): void {
  const closeRef = useRef(close);
  closeRef.current = close;
  const partsRef = useRef(parts);
  partsRef.current = parts;
  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (partsRef.current.some((part) => part.current?.contains(target))) return;
      closeRef.current();
    };
    return onDocumentPress(handlePointerDown);
  }, [isOpen]);
}

/** Arrow keys, Home/End and Escape inside a list that lives in the filter
 * panel, kept off the panel around it.
 *
 * The panel runs its own menu keyboard handling and closes on Escape, so an
 * unstopped key here would move focus twice or close both surfaces at once —
 * Escape belongs to the innermost thing that is open. */
function handleFilterListKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  list: HTMLDivElement | null,
  close: () => void,
): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  const options = [...(list?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
  if (options.length === 0) return;
  const current = options.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === "ArrowDown"
    ? Math.min(current + 1, options.length - 1)
    : event.key === "ArrowUp"
      ? (current <= 0 ? 0 : current - 1)
      : event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : null;
  if (next === null) return;
  event.preventDefault();
  event.stopPropagation();
  options[next]?.focus();
}

/** The names a text filter already knows about, offered beside the field.
 *
 * Never a closed list, unlike the branches: these come from the versions
 * this screen happens to have loaded, while the filter itself asks Git about
 * every version there is. The note under the list says so, because a shortcut
 * that looks exhaustive is worse than no shortcut at all. */
function HistoryFilterSuggestions({ label, note, options, onPick }: {
  label: string;
  note: string;
  options: string[];
  onPick: (value: string) => void;
}): React.JSX.Element | null {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useDismissOnOutsidePress(isOpen, [triggerRef, listRef], () => close(false));

  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.querySelector<HTMLElement>('[role="option"]')?.focus();
  }, [isOpen]);

  if (options.length === 0) return null;
  return <>
    <button
      ref={triggerRef}
      type="button"
      className="history-filter__field-more"
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-label={label}
      onClick={() => setIsOpen((open) => !open)}
    >
      <ChevronDown aria-hidden="true" />
    </button>
    {isOpen && <div
      ref={listRef}
      className="history-scope-picker__list"
      onKeyDown={(event) => handleFilterListKeyDown(event, listRef.current, () => close(true))}
    >
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        className="history-scope-picker__options auto-hide-scrollbar"
        role="listbox"
        aria-label={label}
      >
        {options.map((option) => <button
          key={option}
          type="button"
          role="option"
          aria-selected={false}
          className="history-scope-picker__option"
          title={option}
          onClick={() => { close(true); onPick(option); }}
        >
          <span>{option}</span>
        </button>)}
      </div>
      <p className="history-scope-picker__note">{note}</p>
    </div>}
  </>;
}

/** Every branch this project has, as a list rather than a name to type.
 *
 * The inventory is already in memory — the status bar's own switcher renders it
 * on every screen — so offering it here costs no read. It also retires the last
 * way to get this wrong: a typed name could miss, which meant a field that could
 * be wrong and a message explaining that it was.
 *
 * The list lives inside the filter panel rather than in a portal. The panel
 * dismisses on a click outside *its* container, so a portalled menu would be
 * outside it and choosing a branch would close the panel that asked the question. */
function HistoryScopePicker({ branches, selected, onSelect }: {
  branches: string[];
  selected: string | null;
  onSelect: (name: string) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchable = branches.length > SCOPE_PICKER_SEARCH_THRESHOLD;
  const needle = query.trim().toLocaleLowerCase();
  const matches = needle ? branches.filter((name) => name.toLocaleLowerCase().includes(needle)) : branches;

  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    setQuery("");
    if (restoreFocus) triggerRef.current?.focus();
  };

  useDismissOnOutsidePress(isOpen, [containerRef, listRef], () => close(false));

  useEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    if (!list) return;
    const target = searchable
      ? list.querySelector<HTMLElement>("input")
      : list.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
        ?? list.querySelector<HTMLElement>('[role="option"]');
    target?.focus();
  }, [isOpen, searchable]);

  return <div className="history-scope-picker" ref={containerRef}>
    <button
      ref={triggerRef}
      type="button"
      className={`history-filter__field history-scope-picker__trigger${selected ? " history-filter__field--selected" : ""}`}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-label={t.historyScopeBranchLabel}
      onClick={() => setIsOpen((open) => !open)}
    >
      <GitBranch aria-hidden="true" />
      <span className="history-scope-picker__value" title={selected ?? undefined}>
        {selected ?? t.historyScopeBranchPlaceholder}
      </span>
      <ChevronDown aria-hidden="true" className="history-scope-picker__chevron" />
    </button>
    {isOpen && <div
      ref={listRef}
      className="history-scope-picker__list"
      onKeyDown={(event) => handleFilterListKeyDown(event, listRef.current, () => close(true))}
    >
      {searchable && <div className="history-scope-picker__search">
        <Search aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder={t.historyScopeSearchPlaceholder}
          aria-label={t.historyScopeSearchPlaceholder}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>}
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        className="history-scope-picker__options auto-hide-scrollbar"
        role="listbox"
        aria-label={t.historyScopeBranchLabel}
      >
        {matches.length === 0
          ? <p className="empty-line empty-line--menu history-scope-picker__empty">{t.historyScopeNoBranches}</p>
          : matches.map((name) => <button
            key={name}
            type="button"
            role="option"
            aria-selected={name === selected}
            className={`history-scope-picker__option${name === selected ? " history-scope-picker__option--selected" : ""}`}
            title={name}
            onClick={() => { close(true); onSelect(name); }}
          >
            <GitBranch aria-hidden="true" />
            <span>{name}</span>
            {name === selected && <Check aria-hidden="true" className="history-scope-picker__tick" />}
          </button>)}
      </div>
    </div>}
  </div>;
}

function HistoryScopeGroup({ scope, branches, onChange }: {
  scope: HistoryScope;
  branches: string[];
  onChange: (scope: HistoryScope) => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const named = scopeBranchName(scope);
  /* "This branch" and "All branches" are the toggle beside the filters, in reach
     the way Changes keeps its list/folders toggle. What stays here is the
     rarer third state: reading another branch by name. A picker showing the
     branch the timeline is reading and a picker waiting to be opened are not
     the same thing, and it keeps its own way out beside it, so a chosen branch
     is undone here as well as from the chip under the strip. */
  return <FilterGroup label={t.historyScopeLabel}>
    <div className="history-scope-picker__row">
      <HistoryScopePicker
        branches={branches}
        selected={named}
        onSelect={(name) => onChange({ kind: "branch", name })}
      />
      {named && <button
        type="button"
        className="history-filter__field-clear"
        aria-label={t.historyScopeClear}
        onClick={() => onChange(CURRENT_BRANCH_SCOPE)}
      >
        <X aria-hidden="true" />
      </button>}
    </div>
  </FilterGroup>;
}

/** "This branch" or "All branches", as one glyph that says which: a single line
 * with a node, or a graph of lines — pressed, in the accent, while every branch
 * is drawn, the way Changes' list/folders toggle sits in its search box. From a
 * branch chosen by name it goes to All branches. */
function HistoryScopeToggle({ scope, onScope, t }: { scope: HistoryScope; onScope: (scope: HistoryScope) => void; t: Translations }): React.JSX.Element {
  const all = scope.kind === "allBranches";
  return (
    <button
      className={`filter-control__trigger history-scope-toggle${all ? " filter-control__trigger--active" : ""}`}
      type="button"
      aria-pressed={all}
      aria-label={t.historyScopeAllBranches}
      data-tooltip={all ? t.historyScopeShowOne : t.historyScopeShowAll}
      onClick={() => onScope(all ? CURRENT_BRANCH_SCOPE : ALL_BRANCHES_SCOPE)}
    >
      {all ? <GitGraph aria-hidden="true" /> : <GitCommitVertical aria-hidden="true" />}
    </button>
  );
}

/** The filters, behind one trigger.
 *
 * They used to be two menus sitting in the search box, which spent the strip's
 * width on saying what they were set to. A sidebar column has ~300px and five
 * filters; the trigger says *how many* are on and the panel says which, which
 * is the only arrangement that does not grow with the number of filters.
 *
 * Toggles and ranges apply as they are chosen — one click, one answer. The two
 * text fields commit on Enter or on leaving them, because every apply is a
 * fresh read of the repository and a keystroke is not an intention. */
function HistoryFilterPanel({ filters, scope, branches, authorSuggestions, pathSuggestions, canFilterPublication, onChange, onScope }: {
  filters: HistoryFilters;
  scope: HistoryScope;
  branches: string[];
  authorSuggestions: string[];
  pathSuggestions: string[];
  canFilterPublication: boolean;
  onChange: (filters: HistoryFilters) => void;
  onScope: (scope: HistoryScope) => void;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const [authorDraft, setAuthorDraft] = useState(filters.author ?? "");
  const [pathDraft, setPathDraft] = useState(filters.path ?? "");

  useEffect(() => { setAuthorDraft(filters.author ?? ""); }, [filters.author]);
  useEffect(() => { setPathDraft(filters.path ?? ""); }, [filters.path]);

  const active = countActiveFilters(filters);
  const apply = (patch: Partial<HistoryFilters>): void => onChange({ ...filters, ...patch });
  // A range the presets cannot express is a custom one whoever set it: an
  // `until`, or a `since` that is not one of the four days they stand for.
  const rangeIsUnnameable = filters.until !== null
    || (filters.since !== null && !dateRanges(t).some((range) => range.since === filters.since));
  const [isCustomRange, setIsCustomRange] = useState(rangeIsUnnameable);
  useEffect(() => { if (rangeIsUnnameable) setIsCustomRange(true); }, [rangeIsUnnameable]);
  const commitText = (key: "author" | "path", draft: string): void => {
    const value = key === "path" ? normalizeRepoPath(draft) : draft.trim();
    apply({ [key]: value.length > 0 ? value : null });
  };
  const ranges = dateRanges(t);

  return <FilterPanel
    activeCount={active}
    labels={{
      open: t.historyFiltersLabel,
      active: t.historyFiltersActive,
      activeCount: t.historyFiltersActiveCount,
      clear: t.historyFiltersClear,
    }}
    onClear={() => onChange(NO_HISTORY_FILTERS)}
  >
      <HistoryScopeGroup scope={scope} branches={branches} onChange={onScope} />

      <FilterGroup label={t.historyFilterAuthorLabel} labelFor="history-filter-author">
        {/* The same pill the search boxes wear, with the glyph naming what goes
            in it — a person, a folder — so the two fields are told apart before
            their labels are read. */}
        {/* A field, not a picker: Git matches this as a substring over every
            version there is, and the names below are only those of the versions
            this screen has loaded. The list is a shortcut; the box is the
            filter. */}
        <div className="history-filter__field">
          <UserRound aria-hidden="true" />
          <input
            id="history-filter-author"
            type="text"
            value={authorDraft}
            placeholder={t.historyFilterAuthorPlaceholder}
            onChange={(event) => setAuthorDraft(event.target.value)}
            onBlur={() => commitText("author", authorDraft)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitText("author", authorDraft); } }}
          />
          <HistoryFilterSuggestions
            label={t.historyFilterAuthorSuggestions}
            note={t.historyFilterFromLoaded}
            options={authorSuggestions}
            onPick={(name) => { setAuthorDraft(name); apply({ author: name }); }}
          />
        </div>
      </FilterGroup>

      {/* Four capsules rather than four radio rows: they are one choice out of
          a short, fixed set of the same kind of thing, which is the shape a
          segmented choice takes. Still real radios underneath — the input is
          hidden, not replaced, so arrow keys and assistive technology keep the
          grouping they would otherwise lose.
          Under them, the two ends the presets are shorthand for. Rust has
          validated `since` and `until` as calendar days since they were built;
          only the interface had never offered the second one, so a reader who
          wanted "that week in March" had no way to ask. */}
      <FilterGroup label={t.historyFilterDateLabel}>
        <FilterCapsules dense>
          {ranges.map((range) => {
            const active = !isCustomRange && (range.since === null
              ? filters.since === null && filters.until === null
              : filters.since === range.since && filters.until === null);
            return <FilterCapsule
              key={range.label}
              name="history-filter-date"
              checked={active}
              onChange={() => { setIsCustomRange(false); apply({ since: range.since, until: null }); }}
            >
              {range.label}
            </FilterCapsule>;
          })}
          {/* The fifth answer, on the same line as the other four: one radio
              group, one row. It narrows nothing on its own — it opens the two
              ends. */}
          <FilterCapsule
            name="history-filter-date"
            checked={isCustomRange}
            onChange={() => setIsCustomRange(true)}
          >
            {t.historyFilterDateCustom}
          </FilterCapsule>
        </FilterCapsules>
        {isCustomRange && <div className="history-filter__dates">
          {/* Two ends and the dash between them. The calendar each opens is the
              app's own — see `shared/ui/datePicker.tsx` — so a day is picked and
              written the way the reader set it in Settings, and the control does
              not change shape with the WebView under the app. The words naming
              each end are read rather than drawn: at this width they would take
              the room the date needs. */}
          <DateField
            className="history-filter__date"
            value={filters.since}
            formats={formats}
            max={filters.until}
            labels={{
              field: t.historyFilterDateFrom,
              placeholder: t.historyFilterDateFrom,
              calendar: t.historyFilterDateFromCalendar,
              previousMonth: t.historyFilterDatePreviousMonth,
              nextMonth: t.historyFilterDateNextMonth,
            }}
            onChange={(since) => apply({ since })}
          />
          <span className="history-filter__dates-dash" aria-hidden="true">–</span>
          <DateField
            className="history-filter__date"
            value={filters.until}
            formats={formats}
            min={filters.since}
            labels={{
              field: t.historyFilterDateTo,
              placeholder: t.historyFilterDateTo,
              calendar: t.historyFilterDateToCalendar,
              previousMonth: t.historyFilterDatePreviousMonth,
              nextMonth: t.historyFilterDateNextMonth,
            }}
            onChange={(until) => apply({ until })}
          />
        </div>}
      </FilterGroup>

      <FilterGroup label={t.historyFilterPathLabel} labelFor="history-filter-path">
        {/* No list of every path in the project: nothing here knows one, and
            inventing a read to build it would make opening the filters cost a
            walk of the tree. What this screen does know is the version it has
            open, so its folders and files are offered as a shortcut. */}
        <div className="history-filter__field">
          <Folder aria-hidden="true" />
          <input
            id="history-filter-path"
            type="text"
            value={pathDraft}
            placeholder={t.historyFilterPathPlaceholder}
            onChange={(event) => setPathDraft(event.target.value)}
            onBlur={() => commitText("path", pathDraft)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitText("path", pathDraft); } }}
          />
          <HistoryFilterSuggestions
            label={t.historyFilterPathSuggestions}
            note={t.historyFilterFromOpenVersion}
            options={pathSuggestions}
            onPick={(value) => { setPathDraft(value); apply({ path: value }); }}
          />
        </div>
      </FilterGroup>

      <FilterGroup>
        {/* Each switch wears the glyph its rows wear, as Branches' filter
            does, so the panel is also the timeline's legend. */}
        {canFilterPublication && <FilterSwitch
          checked={filters.unpublishedOnly}
          icon={<StateGlyph tone="local" icon={<LocalOnlyIcon />} />}
          label={t.historyFilterUnpublishedOnly}
          onChange={(unpublishedOnly) => apply({ unpublishedOnly })}
        />}
        <FilterSwitch
          checked={filters.taggedOnly}
          icon={<StateGlyph tone="neutral" icon={<Tag />} />}
          label={t.historyFilterTaggedOnly}
          onChange={(taggedOnly) => apply({ taggedOnly })}
        />
        <FilterSwitch
          checked={filters.noMerges}
          icon={<StateGlyph tone="neutral" icon={<GitMerge />} />}
          label={t.historyFilterHideMerges}
          onChange={(noMerges) => apply({ noMerges })}
        />
      </FilterGroup>
  </FilterPanel>;
}

function HistoryDetail({ state, formats, selfEmail, actions, onSelectFile, onRetryDetail, onRetryDiff, onBack, readImagePreview, readFileMarkdown, sourceKey }: {
  state: HistoryState; formats: LocaleFormats; selfEmail: string | null; actions: HistoryBranchActions; onSelectFile: (path: string) => void; onRetryDetail: () => void; onRetryDiff: () => void; onBack: () => void; readImagePreview: ImagePreviewLoader; readFileMarkdown: (filePath: string) => Promise<MarkdownPreview>; sourceKey: string;
}): React.JSX.Element {
  const { t } = useLanguage();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [fileSearch, setFileSearch] = useState("");
  const [diffSearch, setDiffSearch] = useState("");
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [viewMode, setViewMode] = useState<DiffViewMode>("unified");
  const [hunkTarget, setHunkTarget] = useState({ index: 0, token: 0 });
  const [copiedPath, setCopiedPath] = useState(false);
  const [contextMenu, setContextMenu] = useState<ChangesContextMenuState | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const selectedVersion = state.versions.find((version) => version.commit === state.selectedCommit) ?? null;

  useEffect(() => { setFileSearch(""); setDiffSearch(""); setIsFindOpen(false); setDetailsOpen(false); setContextMenu(null); }, [state.selectedCommit]);
  useEffect(() => setHunkTarget({ index: 0, token: 0 }), [state.selectedFilePath]);
  const picture = usePictureDiff(state.fileDiff.diff, sourceKey, readImagePreview);
  const markdown = useMarkdownDiff(state.fileDiff.diff, sourceKey, readFileMarkdown, t);
  const effectiveViewMode = markdown.textView ?? viewMode;
  // The reading-mode picker lays out branches; a drawing has none.
  const showsReadingMode = picture === null || (picture.isSvg && !picture.showsDrawing);
  // Hooks stay above the early returns below: a version is first drawn loading,
  // then with its files, and a hook that only ran on the second render
  // changed the hook count between them — React throws, and the whole window
  // went blank.
  const [fileView, setFileView] = useFileListView();
  const inFolders = fileView === "tree";
  const { collapsed: collapsedFolders, toggle: toggleFolder, reveal: revealFile } = useCollapsedFolders();
  useEffect(() => {
    if (state.selectedFilePath) revealFile(state.selectedFilePath);
  }, [revealFile, state.selectedFilePath]);

  const strip = (version: SavedVersionSummary): React.JSX.Element => <HistoryDetailStrip version={version} formats={formats} currentBranch={state.snapshot?.branch ?? null} selfEmail={selfEmail} actions={actions} detailsOpen={detailsOpen} onToggleDetails={() => setDetailsOpen((open) => !open)} />;
  // The strip the loaded detail opens with, already at its size, so the read
  // only fills in what is under it.
  if (state.detail.isLoading) return <section className="history-detail history-detail--loading" aria-labelledby={selectedVersion ? "history-detail-title" : undefined} aria-busy="true"><div className="history-detail__card">{selectedVersion ? strip(selectedVersion) : <StripPlaceholder />}<DetailPlaceholder label={t.historyDetailLoading} /></div></section>;
  if (state.detail.error) return <section className="history-detail history-detail--state" role="alert"><CircleAlert /><h2>{t.historyDetailError}</h2><button className="secondary-button" type="button" onClick={onRetryDetail}>{t.historyRetry}</button></section>;
  const detail = state.detail.detail;
  if (!detail) return <section className="history-detail history-detail--state"><p>{t.historySelectFilePrompt}</p></section>;

  const normalizedFileSearch = fileSearch.trim().toLocaleLowerCase();
  const visibleFiles = detail.files.filter((file) => !normalizedFileSearch || file.path.toLocaleLowerCase().includes(normalizedFileSearch));
  const comparison = detail.comparisonIsEmptyTree ? t.historyRootComparison : detail.comparisonIsFirstParent ? t.historyMergeComparison : t.historyNormalComparison;
  const fileCount = detail.countsAreMinimum ? t.historyChangedFilesMinimum(detail.fileCounts.total) : t.historyChangedFiles(detail.fileCounts.total);
  const hunkCount = diffHunkCount(state.fileDiff.diff);
  const selectedFile = detail.files.find((file) => file.path === state.selectedFilePath) ?? null;
  // Stepped through the list as it is filtered, not through every changed file
  // in the version: the arrows move the same selection the pane beside them
  // shows, and a search that narrows that pane narrows what they walk.
  const fileRows = inFolders ? flattenFileTree(visibleFiles, filePath, collapsedFolders) : flatFileRows(visibleFiles, filePath);
  // Stepping follows the order the files are drawn in, folded folders included.
  const orderedFiles = inFolders
    ? flattenFileTree(visibleFiles, filePath, NO_COLLAPSED_FOLDERS).flatMap((row) => (row.kind === "file" ? [row.item] : []))
    : visibleFiles;
  const fileIndex = orderedFiles.findIndex((file) => file.path === state.selectedFilePath);
  const selectFileAt = (index: number): void => {
    const file = orderedFiles[index];
    if (!file) return;
    revealFile(file.path);
    onSelectFile(file.path);
  };
  const goToHunk = (index: number): void => setHunkTarget((current) => ({ index, token: current.token + 1 }));
  const copySelectedPath = (): void => {
    if (!state.selectedFilePath) return;
    void navigator.clipboard.writeText(state.selectedFilePath).then(() => { setCopiedPath(true); window.setTimeout(() => setCopiedPath(false), 1_500); }).catch(() => undefined);
  };
  const closeContextMenu = (restoreFocus: boolean): void => {
    if (restoreFocus) contextMenu?.focusTarget?.focus();
    setContextMenu(null);
  };
  const openCodeContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    const source = event.target instanceof Element ? event.target.closest<HTMLElement>(".diff-code") : null;
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    const selection = window.getSelection();
    const belongsToDiff = selection?.anchorNode && selection.focusNode
      ? source.contains(selection.anchorNode) && source.contains(selection.focusNode)
      : false;
    setContextMenu({
      kind: "copy",
      x: event.clientX,
      y: event.clientY,
      text: belongsToDiff ? selection?.toString() ?? "" : "",
      focusTarget: source,
    });
  };
  const closeFind = (): void => { setIsFindOpen(false); setDiffSearch(""); };

  // A strip, not a box with a margin: the pane beside it opens with one, and
  // two panes whose first rows start four pixels apart is the same step the
  // outer layout spent two tasks removing.
  const fileSearchControl = <div className="history-files-pane__toolbar"><SearchBox className="history-files-search" value={fileSearch} onChange={setFileSearch} placeholder={t.historyFilterFilesPlaceholder} ariaLabel={t.historyFilterFilesAriaLabel} clearLabel={t.commonClearSearch} trailing={<FileViewToggle view={fileView} onChange={setFileView} t={t} />} /></div>;
  const fileList = visibleFiles.length ? <ChangedFiles rows={fileRows} inFolders={inFolders} selectedPath={state.selectedFilePath} formats={formats} onSelect={onSelectFile} onToggleFolder={toggleFolder} /> : <p className="empty-line history-files__empty">{normalizedFileSearch ? t.historyNoFileMatches : t.historyNoChangedFiles}</p>;
  // The find control spends no width until it is asked for: the diff strip is
  // narrow, and a search box standing open beside the arrows crowded the
  // file's own name out of it. The magnifier opens it; its own close restores
  // the icon and clears the highlight.
  // The find is Changes' shared control, so both diff surfaces carry the same
  // one in the same place.
  const findControl = <DiffFind
    isOpen={isFindOpen}
    query={diffSearch}
    onQueryChange={setDiffSearch}
    onOpen={() => setIsFindOpen(true)}
    onClose={closeFind}
    t={t}
  />;

  return <section className="history-detail" aria-labelledby="history-detail-title">
    <button className="history-detail__back secondary-button" type="button" onClick={onBack}><ArrowLeft aria-hidden="true" />{t.historyBackToTimeline}</button>
    {/* One card: the version strip, the story behind its Details disclosure,
        and the diff that is always the working surface — the way Changes reads.
        The back button stays outside the card; it leaves rather than acts. */}
    <div className="history-detail__card">
      {strip(detail.version)}
      {detailsOpen && <HistoryDetails detail={detail} formats={formats} comparison={comparison} fileCount={fileCount} />}
      <div className="history-workspace history-workspace--diff" role="region" aria-label={t.historyFilesAriaLabel}>
        {/* One toolbar across the whole card, the file search having stepped
            down into its own pane: the open file's identity and the reading
            controls get the card's full width instead of the diff pane's
            remainder, which is what keeps them fitting when the window is
            small. The search strip and the code now open on the same row. */}
        <header className="history-diff-toolbar">
          {selectedFile ? <>
            <span className="history-file__type" aria-hidden="true">{React.createElement(getFileTypeIcon(selectedFile.path))}</span>
            <strong className="history-diff-toolbar__name">{splitPath(selectedFile.path).name}</strong>
            <span className="history-diff-toolbar__dir">{splitPath(selectedFile.path).dir || t.changesProjectRoot}</span>
            <button className="history-icon-button history-diff-toolbar__copy" type="button" aria-label={copiedPath ? t.historyFilePathCopied : t.historyCopyFilePath} data-tooltip={copiedPath ? t.historyFilePathCopied : t.historyCopyFilePath} onClick={copySelectedPath}>{copiedPath ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</button>
          </> : <span className="history-diff-toolbar__prompt">{t.historySelectFilePrompt}</span>}
          {/* The same two pairs the Changes diff header carries, in the same
              place and the same shape, plus the reading controls Changes keeps
              at the end of its strip. */}
          <div className="history-diff-toolbar__controls">
            {visibleFiles.length > 0 && <DiffStepNav kind="file" position={fileIndex + 1} total={visibleFiles.length} onPrevious={() => selectFileAt(fileIndex - 1)} onNext={() => selectFileAt(fileIndex + 1)} t={t} />}
            {hunkCount > 0 && effectiveViewMode !== "accessible" && !markdown.shows && <DiffStepNav kind="hunk" position={hunkTarget.index + 1} total={hunkCount} onPrevious={() => goToHunk(hunkTarget.index - 1)} onNext={() => goToHunk(hunkTarget.index + 1)} t={t} />}
            {markdown.shows && markdown.count > 0 && <DiffStepNav kind="hunk" position={markdown.index + 1} total={markdown.count} allowUnselectedNext onPrevious={() => markdown.stepTo(markdown.index - 1)} onNext={() => markdown.stepTo(markdown.index + 1)} t={t} />}
            {!markdown.shows && findControl}
            {picture?.hasControls && <PictureDiffControls picture={picture} t={t} />}
            {showsReadingMode && <DiffViewSelector value={effectiveViewMode} onChange={(mode) => { if (markdown.available) markdown.chooseTextView(mode); else setViewMode(mode); }} markdown={markdown.available ? { selected: markdown.shows, onSelect: markdown.chooseMarkdown } : undefined} t={t} />}
          </div>
        </header>
        <div className="history-diff-grid">
          <aside className="history-files-pane">{fileSearchControl}{fileList}</aside>
          <div className="history-diff-pane">
            <div className="history-detail__diff" onContextMenu={openCodeContextMenu}>{state.fileDiff.isLoading && <div className="history-diff-state" aria-busy="true"><LoadingBar label={t.historyDiffLoading} /><p>{t.historyDiffLoading}</p></div>}{state.fileDiff.error !== null && <div className="history-diff-state" role="alert"><p>{t.historyDiffError}</p><button className="secondary-button" type="button" onClick={onRetryDiff}>{t.historyRetry}</button></div>}{markdown.failure && <p className="changes-diff__status" role="status">{markdown.failure} {t.changesMarkdownFallback}</p>}{state.fileDiff.diff && (markdown.shows ? <MarkdownPreviewView state={markdown.state} retry={markdown.retry} t={t} notice={t.historyMarkdownNotice} comparison={markdown.comparison} excerpt={markdown.excerpt} changeTarget={markdown.target} /> : <DiffResultView diff={state.fileDiff.diff} comparison={{ before: detail.comparisonIsEmptyTree ? t.changesDiffEmptyBase : detail.comparisonBase.slice(0, 8), after: detail.version.shortCommit }} viewMode={effectiveViewMode} hunkTarget={hunkTarget} searchQuery={diffSearch} picture={picture} t={t} />)}{!state.fileDiff.isLoading && !state.fileDiff.error && !state.fileDiff.diff && detail.files.length > 0 && <p className="history-diff-state">{t.historySelectFilePrompt}</p>}</div>
          </div>
        </div>
      </div>
    </div>
    <span className="visually-hidden" role="status">{announcement}</span>
    <ChangesContextMenu context={contextMenu} onClose={closeContextMenu} onCopied={() => setAnnouncement(t.changesCopied)} onDiscard={() => undefined} t={t} />
  </section>;
}

export function HistoryPanel({ tabs, controller, query, state, watcherState, actions = {}, selfEmail = null, upstreamGoneBranch = null, onOpenSettings, error }: {
  /** The Work screen's tab pair, drawn as the timeline panel's header in every
   * state this panel has (task 126): it is what names the column now, and the
   * way back to Changes has to stay reachable while History loads or fails. */
  tabs: React.ReactNode;
  controller: HistoryController; query: HistoryQuery; state: HistoryState; watcherState: "starting" | "watching" | "off" | "unavailable"; actions?: HistoryBranchActions;
  /** The user's own Git email, so their versions read as theirs. */
  selfEmail?: string | null;
  /** The current branch, when its remote branch was deleted: its boundary says
   * the versions under it were on the remote, not that they still are. */
  upstreamGoneBranch?: string | null;
  onOpenSettings: () => void; error: string | null;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const [showNarrowDetail, setShowNarrowDetail] = useState(false);
  const [search, setSearch] = useState("");
  const warnings = state.snapshot?.warnings ?? [];
  // "Has this left my machine yet?" is only answerable against a place it
  // could have gone. Without an upstream every version reads `unknown`, so the
  // switch would empty the list and call it a filter; the screen already says
  // the upstream is unknown in a banner of its own.
  const canFilterPublication = Boolean(state.snapshot?.upstream);
  // The filters are answered by Git over the whole history. This is the search
  // box only, and it is deliberately a different thing: a quick find over the
  // rows on screen, across everything a row shows rather than the message
  // alone. The count beside the title says which of the two is narrowing.
  const visibleVersions = useMemo(() => {
    const queryText = search.trim().toLocaleLowerCase();
    if (!queryText) return state.versions;
    return state.versions.filter((version) =>
      [version.subject, version.description, version.author?.name ?? "", version.shortCommit, ...version.decorations.map((item) => item.name)].some((value) => value.toLocaleLowerCase().includes(queryText)));
  }, [search, state.versions]);
  // Names taken from what is loaded, offered beside a field that still asks Git
  // about every version — a shortcut, never a limit on what can be typed.
  const authorSuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const version of state.versions) {
      const name = version.author?.name.trim();
      if (name) names.add(name);
    }
    return [...names].sort((left, right) => left.localeCompare(right)).slice(0, 40);
  }, [state.versions]);
  // The folders and files of the version whose card is open — the one set of
  // real repository paths this screen holds without asking Git for another.
  // Folders first, because narrowing to one is the commoner intent, but each
  // kind gets its own share of the budget: one list cut at 40 leaves a version
  // spread across many folders offering no file at all.
  const pathSuggestions = useMemo(() => {
    const files = state.detail.detail?.files ?? [];
    const folders = new Set<string>();
    for (const file of files) {
      const parts = file.path.split("/");
      for (let depth = 1; depth < Math.min(parts.length, 3); depth += 1) {
        folders.add(parts.slice(0, depth).join("/"));
      }
    }
    const named = [...folders].sort().slice(0, PATH_SUGGESTION_FOLDERS);
    return [
      ...named,
      ...files.map((file) => file.path).slice(0, PATH_SUGGESTIONS - named.length),
    ];
  }, [state.detail.detail]);
  const refreshHistory = useCallback(() => { void controller.refresh(query); }, [controller, query]);
  const loadMore = useCallback(() => { void controller.loadMore(query); }, [controller, query]);
  const selectVersion = useCallback((commit: string) => controller.selectVersion(query, commit), [controller, query]);
  const selectFile = useCallback((path: string) => controller.selectFile(query, path), [controller, query]);
  const retryDetail = useCallback(() => controller.retryDetail(query), [controller, query]);
  const retryDiff = useCallback(() => controller.retryFileDiff(query), [controller, query]);
  // A picture is read from the selected saved version and its parent, so the
  // loader carries the commit rather than the snapshot token the text diff
  // uses. A file can only be open once a version is selected.
  const selectedCommit = state.selectedCommit;
  const readImagePreview = useCallback<ImagePreviewLoader>(
    (filePath, originalPath) =>
      selectedCommit === null
        ? // Unreachable through the UI, and stated rather than papered over:
          // an empty commit-ish makes `:path` — which Git resolves to the
          // *index* — so this must never be sent as one.
          Promise.reject(new Error("no saved version is selected"))
        : controller.readImagePreview(query, selectedCommit, filePath, originalPath),
    [controller, query, selectedCommit],
  );
  const readFileMarkdown = useCallback(
    (filePath: string) => selectedCommit === null
      ? Promise.reject(new Error("no saved version is selected"))
      : controller.readFileMarkdown(query, selectedCommit, filePath),
    [controller, query, selectedCommit],
  );
  const saveScrollOffset = useCallback((offset: number) => controller.setScrollOffset(query, offset), [controller, query]);
  const applyFilters = useCallback((filters: HistoryFilters) => { void controller.setFilters(query, filters); }, [controller, query]);
  const applyScope = useCallback((scope: HistoryScope) => { void controller.setScope(query, scope); }, [controller, query]);
  const filtersActive = search.trim().length > 0 || countActiveFilters(state.filters) > 0;

  const openNarrowDetail = useCallback(() => setShowNarrowDetail(true), []);
  const closeNarrowDetail = useCallback(() => setShowNarrowDetail(false), []);

  // Every state draws the same frame, so the timeline panel and its header —
  // the Work screen's tab pair — are the same nodes whichever state is
  // showing. A refresh moves this panel between states on its own (loading,
  // failed, loaded), and a frame per state rebuilt the tabs each time: a
  // press that straddled one landed on a detached button and was lost, and
  // focus on a tab fell to the body. The notices hold their slot as `null`
  // where a state has none, so the layout after them keeps its position too.
  const frame = ({ notices = null, isState, isBusy = false, isNarrowDetail = false, timeline = null, detail }: {
    notices?: React.ReactNode;
    /** No timeline to draw: the state block goes in the detail panel, where
     * the card would be, so the tabs stay at the list column's width rather
     * than stretching over a card with no list. */
    isState: boolean;
    isBusy?: boolean;
    /** The one-column layout is showing a version's card in place of the
     * timeline. Only the loaded timeline has a card to open, and a state
     * frame must never hide its tabs. */
    isNarrowDetail?: boolean;
    /** The panel's body under its header. */
    timeline?: React.ReactNode;
    detail: React.ReactNode;
  }): React.JSX.Element => (
    <div className={`history-screen${isNarrowDetail ? " history-screen--narrow-detail" : ""}`}>
      {notices}
      {/* The panels start at the top of the workspace: the title lives in the
          timeline panel's own header and the version strip heads the card, so
          no page row sits above either. */}
      <div className={`history-layout${isState ? " history-layout--state" : ""}`}>
        <section className="history-timeline" aria-label={t.historyTimelineAriaLabel} aria-busy={isBusy || undefined}>
          {/* The panel is the card, and its header is the Work screen's tab
              pair (task 126) — the row the screen's name used to fill, in the
              shape the Changes list panel wears, so this panel and the detail
              card beside it start on the same pixel row. */}
          <header className="history-timeline__header">{tabs}</header>
          {timeline}
        </section>
        {detail}
      </div>
    </div>
  );
  // The first page draws the timeline's and the detail's shapes in their own
  // places, so the versions land in a column that was waiting for them.
  if (!state.snapshot && state.isLoading) return frame({
    isState: false,
    timeline: <TimelinePlaceholder label={t.historyLoading} />,
    detail: (
      <section className="history-detail history-detail--loading">
        <div className="history-detail__card"><StripPlaceholder /><DetailPlaceholder /></div>
      </section>
    ),
  });
  if (!state.snapshot && error) return frame({
    isState: true,
    detail: <section className="history-detail history-detail--state"><div className="empty-state empty-state--error" role="alert"><div className="empty-state__icon" aria-hidden="true"><CircleAlert /></div><h2>{t.historyErrorTitle}</h2><p>{error}</p><div className="empty-state__actions"><button className="secondary-button" type="button" onClick={refreshHistory}>{t.historyRetry}</button></div></div></section>,
  });
  // "No saved versions yet" is a fact about the repository, and one this
  // screen may only state when it is not in the middle of asking. A filter
  // that matches nothing is a fact about the filter and belongs in the list
  // beside the way to undo it; an empty list with a read in flight is not a
  // fact about anything yet.
  //
  // Both halves were learned the hard way. Without the filter clause this
  // swallowed the whole screen the instant a filter was applied. Without the
  // loading clause it swallowed it again on Clear all — the filters are off by
  // then, and the empty list still on screen is the answer to the question
  // that was just retired.
  if (state.snapshot && state.versions.length === 0 && !filtersActive && state.scope.kind === "currentBranch" && !state.isLoading) return frame({
    notices: <div className="history-notices"><HistoryWatchingNotice watcherState={watcherState} busy={state.isLoading} onRefresh={refreshHistory} onOpenSettings={onOpenSettings} /></div>,
    isState: true,
    detail: (
      <section className="history-detail history-detail--state">
        <div className="empty-state"><div className="empty-state__icon" aria-hidden="true"><GitCommitHorizontal /></div><h2>{t.historyNoVersionsTitle}</h2><p>{t.historyNoVersionsDescription}</p></div>
      </section>
    ),
  });

  return frame({
    notices: (
      <div className="history-notices">
        <HistoryWatchingNotice watcherState={watcherState} busy={state.isLoading} onRefresh={refreshHistory} onOpenSettings={onOpenSettings} />
        {state.staleNotice && <HistoryBanner tone="neutral" title={t.historyStaleNotice}>{t.historyLoadedCount(state.versions.length)}</HistoryBanner>}
        {state.snapshot && error && <HistoryBanner tone="danger" title={t.historyErrorTitle} action={<button className="secondary-button" type="button" onClick={refreshHistory}>{t.historyRetry}</button>}>{error}</HistoryBanner>}
        {state.selectionRemoved && <p className="history-announcement" role="status">{t.historySelectionRemoved}</p>}
        {state.snapshot?.shallow && <HistoryBanner tone="warning" title={t.historyShallowTitle}>{t.historyShallowDescription}</HistoryBanner>}
        {state.snapshot?.headState === "detached" && <HistoryBanner tone="warning" title={t.historyDetachedTitle}>{t.historyDetachedDescription}</HistoryBanner>}
        {/* "All branches" has no single remote by design — each branch answers to its
            own — so a missing upstream there says nothing about the branch. */}
        {!state.snapshot?.upstream && state.snapshot?.headState === "branch" && state.snapshot.scope.kind !== "allBranches" && <HistoryBanner tone="neutral" title={t.historyUnknownUpstreamTitle}>{t.historyUnknownUpstreamDescription}</HistoryBanner>}
        {warnings.includes("branchesTruncated") && <p className="history-meta-warning" role="status">{t.historyBranchesTruncated}</p>}
        {warnings.includes("unreadableMetadata") && <p className="history-meta-warning" role="status">{t.historyUnreadableMetadata}</p>}
        {(warnings.includes("messagesTruncated") || warnings.includes("decorationsTruncated")) && <p className="history-meta-warning" role="status">{t.historyTruncatedMetadata}</p>}
        {state.clientTruncated && <p className="history-meta-warning" role="status">{t.historyClientLimit(formatNumber(MAX_HISTORY_ROWS, formats))}</p>}
      </div>
    ),
    isState: false,
    isBusy: state.isLoading,
    isNarrowDetail: showNarrowDetail,
    timeline: <HistoryTimeline key={showNarrowDetail ? "detail-open" : "timeline-open"} versions={visibleVersions} selectedCommit={state.selectedCommit} publishedTo={state.snapshot?.upstream ? `${state.snapshot.upstream.remote}/${state.snapshot.upstream.destinationBranch}` : null} remoteGone={upstreamGoneBranch !== null && (state.scope.kind === "branch" ? state.scope.name : state.snapshot?.branch) === upstreamGoneBranch} scrollOffset={state.scrollOffset} isLoading={state.isLoading} hasMore={state.snapshot?.hasMore ?? false} isLoadingMore={state.isLoadingMore} hasMoreError={state.moreError !== null} clientTruncated={state.clientTruncated} formats={formats} currentBranch={state.snapshot?.branch ?? null} selfEmail={selfEmail} search={search} filters={state.filters} scope={state.scope} authorSuggestions={authorSuggestions} pathSuggestions={pathSuggestions} canFilterPublication={canFilterPublication} actions={actions} onSearch={setSearch} onFilters={applyFilters} onScope={applyScope} onSelect={selectVersion} onLoadMore={loadMore} onScrollOffset={saveScrollOffset} onOpenDetail={openNarrowDetail} />,
    detail: <HistoryDetail state={state} formats={formats} selfEmail={selfEmail} actions={actions} onSelectFile={selectFile} onRetryDetail={retryDetail} onRetryDiff={retryDiff} onBack={closeNarrowDetail} readImagePreview={readImagePreview} readFileMarkdown={readFileMarkdown} sourceKey={`${query.projectId}\0${query.sessionEpoch}\0${selectedCommit ?? ""}`} />,
  });
}
