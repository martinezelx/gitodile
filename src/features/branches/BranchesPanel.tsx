import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Cloud,
  CloudUpload,
  GitBranch,
  House,
  Info,
  PenLine,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { formatDate, formatNumber, formatRelativeTime, type LocaleFormats } from "../../shared/i18n";
import { AuthorAvatar, AutomaticUpdatesNotice, contextMenuAnchorFrom, FilterCapsule, FilterCapsules, FilterGroup, FilterPanel, FilterSwitch, LoadingBar, LoadingPlaceholder, LocalOnlyIcon, SearchBox, StateGlyph, StateGlyphs, TextPlaceholder, TimelineChip, autoHideScrollbarProps, type StateGlyphTone } from "../../shared/ui";
import type { Branch, BranchHistory, BranchesSnapshot } from "./domain";
import { deletabilityOf, deleteActionLabel, branchActions } from "./branchActions";
import {
  bucketItemId,
  bucketOf,
  clusterItemId,
  groupBranches,
  headingsAbove,
  branchNameParts,
  prefixOf,
  visibleBranchTree,
  type BranchTreeItem,
} from "./branchGroups";
import { useStoredBranchFolds } from "./branchFolds";
import { ActiveIcon, rowGlyphs, syncStatusOf, syncText } from "./branchGlyphs";
import { BranchContextMenu, type BranchContextMenuState } from "./BranchContextMenu";
import { BranchQuickCreateBox } from "./BranchQuickCreateBox";
import { BranchRenameStrip } from "./BranchRenameStrip";
import { BranchRoute, type DrawnRoute } from "./BranchRoute";
import { BranchIntegrations } from "./BranchIntegrations";
import {
  CreateBranchDialog,
  DeleteBranchDialog,
  SwitchBranchDialog,
} from "./BranchesDialog";
import { CleanUpBranchesDialog } from "./CleanUpBranchesDialog";

type DialogRequest =
  | { kind: "create"; forceSwitch: boolean }
  | { kind: "switch"; target: string }
  | { kind: "delete"; target: string }
  | { kind: "clean-up" }
  | null;

/** How the list is ordered. `unpublished` leans on `upstream === null` — a fact
 * the snapshot already carries — rather than on any commit count, which would
 * mean asking Git something new (task 034). */
type SortKey = "recent" | "name" | "unpublished";

const SORT_KEYS = ["recent", "name", "unpublished"] as const;

const SORT_LABEL_KEYS = {
  recent: "branchesSortRecent",
  name: "branchesSortName",
  unpublished: "branchesSortUnpublished",
} as const satisfies Record<SortKey, keyof Translations>;

/** The state filters offered beside the sort. Whether a branch can be deleted
 * is not one of them: the list is cut into "In progress" and "Ready to clean
 * up" by exactly that, so a filter for it would hide one block to show the
 * other. */
type StateFilter = "tracking" | "local-only";

const STATE_KEYS = ["tracking", "local-only"] as const;

/** The glyph each state wears on a row, drawn beside its name here too: the
 * filter panel is where the glyphs are listed with their words, which makes it
 * the list's legend as well as its filter. `tracking` has no row glyph — it is
 * the unremarkable state — so it takes the remote's cloud only here. */
const STATE_GLYPHS = {
  tracking: { icon: <Cloud />, tone: "neutral" },
  "local-only": { icon: <LocalOnlyIcon />, tone: "local" },
} as const satisfies Record<StateFilter, { icon: React.ReactNode; tone: StateGlyphTone }>;

const STATE_LABEL_KEYS = {
  tracking: "branchesStateTracking",
  "local-only": "branchesNoUpstreamLabel",
} as const satisfies Record<StateFilter, keyof Translations>;

function tipDate(branch: Branch): Date | null {
  if (!branch.tip.committedAt) {
    return null;
  }
  const date = new Date(branch.tip.committedAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Where a listed version stands against the branch's remote copy. Git's own
 * answer when the read brought one — the versions the upstream lacks, by
 * commit — since a branch that merged another interleaves the two by date and
 * a position says nothing. Until then, the branch's ahead count by position.
 * Without a remote copy to count against — none, gone, or not counted — it is
 * not known, and the node says so rather than guessing. */
type VersionPublication = "local-only" | "published" | "unknown";

function publicationAt(
  branch: Branch,
  unpublished: readonly string[] | null,
  commit: string,
  index: number,
): VersionPublication {
  if (branch.upstream === null || branch.upstreamGone) return "unknown";
  if (unpublished) return unpublished.includes(commit) ? "local-only" : "published";
  if (branch.upstreamAhead === null) return "unknown";
  return index < branch.upstreamAhead ? "local-only" : "published";
}

/** The remote named as History's and Overview's boundaries name it: the
 * remote alone when it holds a branch of the branch's own name, `remote ·
 * branch` otherwise. */
function publishedOnLabel(branch: Branch): string | null {
  if (!branch.upstream) return null;
  const slash = branch.upstream.indexOf("/");
  if (slash < 0) return branch.upstream;
  const remote = branch.upstream.slice(0, slash);
  const remoteBranch = branch.upstream.slice(slash + 1);
  return remoteBranch === branch.name ? remote : `${remote} · ${remoteBranch}`;
}

/* ---------------------------------------------------------------- list ---- */


/** Name and state lengths for the first read's rows. */
const BRANCH_PLACEHOLDER_WIDTHS: ReadonlyArray<readonly [string, string]> = [
  ["34%", "22%"],
  ["62%", "30%"],
  ["48%", "18%"],
  ["56%", "26%"],
];

/** One branch in the list column: the sibling of a History timeline row and of a
 * Changes file row, at the same tier — a name, the states worth flagging as
 * glyphs, and when it last moved, on one branch. Its actions are not here: a row
 * that carries three buttons per branch spends the column's width on controls
 * for branches nobody has selected. */
const BranchRow = React.memo(function BranchRow({
  branch,
  selected,
  focusable,
  level,
  clusterPrefix,
  formats,
  onSelect,
  onTreeKey,
  onOpenDetail,
  onContextMenu,
  onRename,
  onHoverIntent,
  justRenamed = false,
}: {
  branch: Branch;
  selected: boolean;
  focusable: boolean;
  /** Its depth in the list's tree: 1 above every heading, 2 in a block, 3 in
   * a prefix cluster. */
  level: number;
  /** The prefix the cluster's heading already says, dropped from the name. */
  clusterPrefix: string | null;
  formats: LocaleFormats;
  onSelect: (name: string) => void;
  /** Arrow keys, Home and End: the panel walks the visible tree. */
  onTreeKey: (event: React.KeyboardEvent<HTMLElement>, name: string) => void;
  onOpenDetail: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  /** F2, the rename key every file list answers to. It opens the same edit
   * the detail's Rename does, in the strip, and only where Rename is offered. */
  onRename: (name: string) => void;
  /** The pointer came to rest on this row, or left it (`null`) — the panel
   * starts this branch's detail read on the first, a moment before the press
   * that would otherwise start it. */
  onHoverIntent?: (branch: Branch | null) => void;
  /** The branch was just renamed: its name lights once, with the strip's. */
  justRenamed?: boolean;
}): React.JSX.Element {
  const { t } = useLanguage();
  const glyphs = rowGlyphs(branch, t, formats);
  /* What the glyphs say, in words, for a screen reader. A description rather
     than hidden text inside the row: the row's `aria-label` replaces its
     content, and a description that points at the row's own children is one
     assistive technology is free to drop. */
  const states = glyphs
    .map((glyph) => glyph.label)
    .filter(Boolean)
    .join(", ");
  const date = tipDate(branch);
  const relative = date ? formatRelativeTime(date, formats) : "";
  const label = branch.isActive ? `${branch.name} — ${t.branchesActiveLabel}` : branch.name;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "F2") {
      if (!branchActions(branch).canRename) return;
      event.preventDefault();
      onRename(branch.name);
      return;
    }
    onTreeKey(event, branch.name);
  };
  const nameParts = branchNameParts(branch.name, clusterPrefix);

  return (
    <button
      id={`branch-${branch.name}`}
      className={`branch-row${selected ? " branch-row--selected" : ""}${branch.isActive ? " branch-row--active" : ""}${justRenamed ? " branch-row--renamed" : ""}`}
      type="button"
      role="treeitem"
      aria-level={level}
      aria-selected={selected}
      aria-label={label}
      aria-description={states || undefined}
      tabIndex={focusable ? 0 : -1}
      onClick={() => {
        onSelect(branch.name);
        onOpenDetail();
      }}
      // Selecting first, the way every list does: the menu names one branch, and
      // the panel behind it must be describing that same one while it is open.
      onContextMenu={(event) => {
        onSelect(branch.name);
        onContextMenu(event);
      }}
      onKeyDown={handleKeyDown}
      onPointerEnter={onHoverIntent && (() => onHoverIntent(branch))}
      onPointerLeave={onHoverIntent && (() => onHoverIntent(null))}
    >
      {/* Two branches: the name alone, then the states as glyphs and the date,
          quieter, under it. The states used to be text chips — `Local only ·
          Can't be deleted yet` is most of a 272px row — and then one branch of
          glyphs beside the name, which left a long name
          `feature/windows-installe…` in half the row. A name is what the
          reader scans the list for, so it gets the whole width; a glyph says
          its state in 14px on the branch below, its tooltip in a sentence, and
          the row's description reads it out. `Active` is one of them — the
          first, in the accent: the word is in the detail strip beside the
          list, and saying it on the row as well put the same chip twice on
          one branch of the screen. */}
      <span className="branch-row__name-row">
        {/* The part of the name the eye can skip is quiet: a prefix the
            branch shares with others, or the middle of a name whose cluster
            heading already says the first part. */}
        <span className="branch-row__name" title={branch.name}>
          {nameParts.quiet && <span className="branch-row__name-quiet">{nameParts.quiet}</span>}
          {nameParts.own}
        </span>
      </span>
      <span className="branch-row__meta">
      {glyphs.length > 0 && (
        <StateGlyphs>
          {glyphs.map((glyph) => (
            <StateGlyph key={glyph.key} tone={glyph.tone} icon={glyph.icon} count={glyph.count} tooltip={glyph.tooltip} />
          ))}
        </StateGlyphs>
      )}
      {relative && <span className="branch-row__date">{relative}</span>}
      </span>
    </button>
  );
});

/** The DOM id of a heading in the list's tree. Rows keep `branch-<name>`. */
const headingDomId = (id: string): string => `branches-group-${id}`;
const treeItemDomId = (item: BranchTreeItem): string =>
  item.kind === "branch" ? `branch-${item.branch.name}` : headingDomId(item.id);

/** A heading in the list: one of the two blocks, or a prefix cluster inside
 * one. Each folds what is under it. Under the clean-up block's heading, in
 * either state, sits the action it is there for: "Clean up 9 branches…", a
 * button of its own with the reason it is safe under the verb, which opens
 * the clean-up dialog. The heading still only folds; from the keyboard,
 * Delete on it opens the dialog too. */
function BranchesGroupHeading({
  item,
  focusable,
  onToggle,
  onTreeKey,
  onCleanUp,
}: {
  item: Extract<BranchTreeItem, { kind: "bucket" | "cluster" }>;
  focusable: boolean;
  onToggle: (id: string) => void;
  onTreeKey: (event: React.KeyboardEvent<HTMLElement>, id: string) => void;
  /** Opens the clean-up dialog. Only the clean-up block takes it. */
  onCleanUp?: () => void;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const label =
    item.kind === "cluster"
      ? item.prefix
      : item.key === "in-progress"
        ? t.branchesGroupInProgress
        : t.branchesGroupCleanUp;
  const cleanUp = item.kind === "bucket" && item.key === "clean-up" ? onCleanUp : undefined;
  const heading = (
    <button
      id={headingDomId(item.id)}
      className={`branches-group branches-group--${item.kind}`}
      type="button"
      role="treeitem"
      aria-level={item.level}
      aria-expanded={item.expanded}
      aria-label={t.branchesGroupLabel(label, item.count)}
      // Folded, why the block is worth opening; open, its rows say it.
      aria-description={cleanUp && !item.expanded ? t.branchesCleanUpHint : undefined}
      aria-keyshortcuts={cleanUp ? "Delete" : undefined}
      tabIndex={focusable ? 0 : -1}
      onClick={() => onToggle(item.id)}
      onKeyDown={(event) => {
        if (cleanUp && event.key === "Delete") {
          event.preventDefault();
          cleanUp();
          return;
        }
        onTreeKey(event, item.id);
      }}
    >
      <span className="branches-group__title">
        <ChevronRight className="branches-group__chevron" aria-hidden="true" />
        <span className="branches-group__label">{label}</span>
        <span className="branches-group__count">{formatNumber(item.count, formats)}</span>
      </span>
    </button>
  );
  if (!cleanUp) return heading;
  return (
    <div className="branches-group-clean-up" role="none">
      {heading}
      <button type="button" className="branches-clean-up" onClick={cleanUp}>
        <Trash2 className="branches-clean-up__icon" aria-hidden="true" />
        <span className="branches-clean-up__text">
          <span className="branches-clean-up__title">{t.branchesCleanUpAction(item.count)}</span>
          <span className="branches-clean-up__note">{t.branchesCleanUpActionNote}</span>
        </span>
        <ChevronRight className="branches-clean-up__chevron" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Search's neighbour: the sort and the state/prefix filters behind one
 * trigger, the way the History timeline keeps its own. The trigger says *how
 * many* filters are on rather than what they are set to, which is the only
 * arrangement that does not grow with the number of them — a ~300px column
 * cannot pay for a menu per filter. */
function BranchesFilterPanel({
  sort,
  prefixCounts,
  stateCounts,
  selectedPrefixes,
  selectedStates,
  onSort,
  onTogglePrefix,
  onToggleState,
  onClear,
}: {
  sort: SortKey;
  prefixCounts: [string, number][];
  stateCounts: Record<StateFilter, number>;
  selectedPrefixes: string[];
  selectedStates: StateFilter[];
  onSort: (sort: SortKey) => void;
  onTogglePrefix: (prefix: string) => void;
  onToggleState: (state: StateFilter) => void;
  onClear: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const active = selectedPrefixes.length + selectedStates.length;

  return (
    <FilterPanel
      activeCount={active}
      labels={{
        open: t.branchesFiltersLabel,
        active: t.branchesFiltersActive,
        activeCount: t.branchesFiltersActiveCount,
        clear: t.branchesFilterClear,
      }}
      onClear={onClear}
    >
      {/* Capsules rather than radio rows: one choice out of a short, fixed set
          of the same kind of thing — and one row, which is what `dense` and
          three one-or-two-word answers are for. They used to be sentences:
          `Recently updated`, `Name (A–Z)` and `Local-only first` come to 321px
          in a panel group that is 238px wide, so the row this control is
          supposed to be wrapped onto a second branch and then a third. The
          legend above them already says these are sorts. */}
      <FilterGroup label={t.branchesFilterSortGroup}>
        <FilterCapsules dense>
          {SORT_KEYS.map((key) => (
            <FilterCapsule
              key={key}
              name="branches-sort"
              checked={sort === key}
              onChange={() => onSort(key)}
            >
              {t[SORT_LABEL_KEYS[key]]}
            </FilterCapsule>
          ))}
        </FilterCapsules>
      </FilterGroup>

      <FilterGroup label={t.branchesFilterStateGroup}>
        {STATE_KEYS.map((state) => (
          <FilterSwitch
            key={state}
            checked={selectedStates.includes(state)}
            icon={
              <StateGlyph tone={STATE_GLYPHS[state].tone} icon={STATE_GLYPHS[state].icon} />
            }
            label={t[STATE_LABEL_KEYS[state]]}
            count={stateCounts[state]}
            onChange={() => onToggleState(state)}
          />
        ))}
      </FilterGroup>

      {prefixCounts.length > 0 && (
        <FilterGroup label={t.branchesFilterPrefixGroup}>
          {/* The one part of this panel that grows with the repository — a row
              per name prefix — so it is the one part that scrolls. The panel
              itself must not: `.filter-panel` deliberately has no overflow, and
              a group that keeps its heading in place while its options move is
              easier to read than a panel that slides everything. */}
          <div
            {...autoHideScrollbarProps<HTMLDivElement>()}
            className="branches-filter__prefixes auto-hide-scrollbar"
          >
            {prefixCounts.map(([prefix, count]) => (
              <FilterSwitch
                key={prefix}
                checked={selectedPrefixes.includes(prefix)}
                label={prefix}
                count={count}
                onChange={() => onTogglePrefix(prefix)}
              />
            ))}
          </div>
        </FilterGroup>
      )}
    </FilterPanel>
  );
}

/* -------------------------------------------------------------- detail ---- */

/** What can be done to the branch the reader has chosen, at the end of its
 * strip: Switch as the one labelled action, Rename and Delete as icon-only
 * circles named on their tooltips.
 *
 * The active branch has no "new branch from here": the composer under the list
 * starts a branch from exactly that point, and a second button for the same
 * form is the route this screen stopped offering when the header's "New branch"
 * went.
 *
 * Delete is out in the open rather than behind a `⋯`, which read as
 * "advanced" for one of the three ordinary things done to a branch and put the
 * only destructive action a step further from the explanation of whether it
 * is safe. It is told apart by its glyph's danger tone, and by the tint it
 * takes only under the pointer.
 *
 * Every one of them is absent rather than disabled where it cannot apply, with
 * one exception — a branch open in another workspace keeps a disabled Switch,
 * because that is a temporary condition the tooltip explains. */
function BranchActions({
  branch,
  copiedInto,
  onSwitch,
  onRename,
  onDelete,
}: {
  branch: Branch;
  /** The main branch's name when this branch's work reached it as copies. */
  copiedInto: string | null;
  onSwitch: () => void;
  onRename: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const isCheckedOutElsewhere = branch.worktreePath !== null;
  const { canRename, canDelete } = branchActions(branch);
  const deleteLabel = deleteActionLabel(branch, t, copiedInto);

  return (
    <div className="branches-detail__actions">
      {/* Switch keeps its word — it is what the reader came to this screen to
          do, and "Switch" says it better than any glyph — in the quiet
          outlined capsule; Rename and Delete are its icon-only satellites, the
          circles History's version strip carries, named on their tooltips.
          A labelled capsule beside circles reads as the primary one without
          spending the accent on it (DESIGN.md, Shape). */}
      {!branch.isActive && (
        <button
          className="branches-detail__switch"
          type="button"
          onClick={onSwitch}
          disabled={isCheckedOutElsewhere}
          aria-label={t.branchesSwitchToBranchLabel(branch.name)}
        >
          <ArrowLeftRight aria-hidden="true" />
          {t.branchesSwitchShort}
        </button>
      )}
      {canRename && (
        <button
          className="branches-detail__icon-action"
          type="button"
          onClick={onRename}
          aria-label={t.branchesRenameBranchLabel(branch.name)}
          data-tooltip={`${t.branchesRenameShort} (F2)`}
        >
          <PenLine aria-hidden="true" />
        </button>
      )}
      {/* The active branch has no Delete at all: it is refused for a reason the
          reader can see for themselves, and a permanently disabled destructive
          button is chrome that never does anything. A branch another workspace
          holds keeps a disabled one, because that is a passing condition and
          the tooltip says so. */}
      {!branch.isActive && deletabilityOf(branch) !== "protected" && (
        <button
          className="branches-detail__icon-action branches-detail__delete"
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          data-tooltip={deleteLabel}
          aria-label={deleteLabel}
        >
          <Trash2 aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

type RelationTone = "positive" | "neutral" | "warning" | "protected";

function RelationIcon({ tone }: { tone: RelationTone }): React.JSX.Element {
  if (tone === "positive") return <CircleCheck aria-hidden="true" />;
  if (tone === "warning") return <TriangleAlert aria-hidden="true" />;
  // The main branch is home, as on its row.
  if (tone === "protected") return <House aria-hidden="true" />;
  return <Info aria-hidden="true" />;
}

/** What this branch's state means, in the app's own words. Every entry is read
 * off the snapshot the list already holds — no new Git question, and no
 * concept the rest of the screen does not already name. */
function relationEntries(
  branch: Branch,
  mainName: string | null,
  routeShown: boolean,
  t: Translations,
): { key: string; tone: RelationTone; title: string; detail: string }[] {
  const entries: { key: string; tone: RelationTone; title: string; detail: string }[] = [];
  const sync = syncStatusOf(branch);
  const upstream = branch.upstream ?? "";

  if (sync.kind === "none") {
    entries.push({
      key: "remote",
      tone: "neutral",
      title: t.branchesNoUpstreamLabel,
      detail: t.branchesRelationshipLocalOnlyDetail,
    });
  } else if (sync.kind === "synced") {
    entries.push({
      key: "remote",
      tone: "positive",
      title: t.branchesSyncUpToDate,
      detail: t.branchesRelationshipSyncedDetail(upstream),
    });
  } else if (sync.kind === "gone") {
    entries.push({
      key: "remote",
      tone: "warning",
      title: t.branchesSyncGone,
      detail: t.branchesRelationshipGoneDetail(upstream),
    });
  } else {
    entries.push({
      key: "remote",
      tone: "neutral",
      title: syncText(sync, t),
      detail:
        sync.kind === "ahead"
          ? t.branchesRelationshipAheadDetail(upstream)
          : sync.kind === "behind"
            ? t.branchesRelationshipBehindDetail(upstream)
            : t.branchesRelationshipDivergedDetail(upstream),
    });
  }

  if (branch.isActive) {
    entries.push({
      key: "active",
      tone: "positive",
      title: t.branchesRelationshipActiveTitle,
      detail: t.branchesRelationshipActiveDetail,
    });
  }
  // Counted against the main branch, for the active branch too — the branch the
  // route under this section is drawn against, so the number here and the
  // dots there are one answer. No main branch, no count.
  // Not while the route is drawn under this section: its sentence says the
  // same count against the same branch, and a fact is said once on a panel.
  if (routeShown) {
    // The route answers where this branch stands against the main branch.
  } else if (mainName !== null && branch.uniqueCommitCount !== null && branch.uniqueCommitCount > 0) {
    entries.push({
      key: "unique",
      tone: "neutral",
      title: t.branchesUniqueCommits(branch.uniqueCommitCount, mainName),
      detail: t.branchesRelationshipUniqueDetail(mainName),
    });
  } else if (mainName !== null && branch.uniqueCommitCount === 0) {
    entries.push({
      key: "merged",
      tone: "positive",
      title: t.branchesRelationshipMergedTitle(mainName),
      detail: t.branchesRelationshipMergedDetail(mainName),
    });
  }

  if (branch.worktreePath !== null) {
    entries.push({
      key: "elsewhere",
      tone: "warning",
      title: t.branchesRelationshipElsewhereTitle,
      detail: t.branchesCheckedOutElsewhere(branch.worktreePath),
    });
  }

  // Why Rename and Delete are not on the row above. A control that silently
  // is not there is a control the reader assumes they have missed.
  if (branch.isDefault) {
    entries.push({
      key: "default",
      tone: "protected",
      title: t.branchesDefaultBranchChip,
      detail: t.branchesDefaultBranchNote,
    });
  }

  return entries;
}

/** The way to publish beside what is waiting to be published, in the shape
 * History's group head and Overview's "Publish up to here" wear: quiet until
 * the pointer finds it, with only the cloud in the accent. */
function PublishCapsule({ onPublish, label }: { onPublish?: () => void; label: string }): React.JSX.Element {
  return (
    <button className="branches-publish" type="button" onClick={() => onPublish?.()}>
      <CloudUpload aria-hidden="true" />
      {label}
    </button>
  );
}

/** The detail column: the selected branch named once at the top with whatever
 * can be done to it, then where it stands and the versions on it. One surface
 * divided by rules — the sibling of the History saved-version card, and it
 * takes the same one. */
function BranchDetail({
  branch,
  activeName,
  mainName,
  history,
  historyLoading,
  previousRoute,
  selfEmail,
  formats,
  onSwitch,
  onRename,
  onDelete,
  onOpenHistory,
  onPublish,
  onBringIn,
  onBack,
  renameEditor,
  settle = null,
}: {
  branch: Branch;
  /** The branch the project is on, `null` when none is checked out. */
  activeName: string | null;
  /** The project's main branch, by name — what this branch's own versions are
   * counted against. `null` when the project has none. */
  mainName: string | null;
  /** This branch's recent saved versions, once the on-demand read has answered.
   * `null` while it is in flight, when it failed, or when the host does not
   * offer the read at all — every section below degrades to what the
   * inventory already knows rather than showing a placeholder. */
  history: BranchHistory | null;
  /** The history read is still out. The route keeps its place meanwhile. */
  historyLoading: boolean;
  /** The route drawn for the branch selected before this one, if any. */
  previousRoute: DrawnRoute | null;
  /** The user's own Git email: their versions say "You", the name on hover. */
  selfEmail: string | null;
  formats: LocaleFormats;
  onSwitch: () => void;
  onRename: () => void;
  onDelete: () => void;
  /** Open History reading this branch, and — when a version is named — with that
   * version selected. Branches' own list of saved versions is a preview of the
   * one History draws in full. */
  onOpenHistory?: (name: string, commit?: string) => void;
  /** Opens the publish flow, which publishes the active branch — offered on
   * that branch only. */
  onPublish?: () => void;
  onBringIn?: (name: string) => void;
  onBack: () => void;
  /** The strip in its editing state while this branch is being renamed —
   * `BranchRenameStrip`, owned by the panel — drawn in place of the
   * strip at rest. */
  renameEditor?: React.ReactNode;
  /** The rename just closed: the strip at rest fades its byline and actions
   * back in, and — when the name changed — lights the name once. */
  settle?: "returned" | "renamed" | null;
}): React.JSX.Element {
  const { t } = useLanguage();
  /* The route section is drawn for a branch that has one, and — while the read
     is out — for any branch that will: any but the main branch, in a project that
     has one. */
  const routeShown =
    history?.route != null || (historyLoading && mainName !== null && branch.name !== mainName);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const date = tipDate(branch);
  /* The tip's own record in the read, matched by commit rather than taken as
   * the first one. The two answers come from two Git calls: the inventory
   * knows the tip, the history read lists the versions, and a save that lands
   * between them leaves the read one version ahead. Positionally, that read
   * puts a version the panel has never seen where the tip should be — and the
   * name beside `Latest saved` would then be whoever saved *that* one. */
  const tipRecord = history?.versions.find((version) => version.commit === branch.tip.commit) ?? null;
  const author = tipRecord?.authorName ?? "";
  const self = selfEmail?.trim().toLocaleLowerCase();
  const nameParts = branchNameParts(branch.name, null);
  const isSelf = Boolean(self && tipRecord && tipRecord.authorEmail.trim().toLocaleLowerCase() === self);
  /* The tip first, then the versions behind it. The tip comes from the
   * inventory rather than from the history read, so the list stands at one row
   * on a host that does not offer the read at all — and the rest is the read
   * minus that same commit, which is what keeps a version out of the list when
   * the two calls disagree about which one is newest. */
  const versions = [
    { ...branch.tip, authorName: author, authorEmail: tipRecord?.authorEmail ?? "" },
    ...(history?.versions ?? []).filter((version) => version.commit !== branch.tip.commit),
  ];
  /* Where what is only on this computer ends and what the remote has begins,
     drawn as History and Overview draw it: a head over the versions only here
     and the remote's cloud where its copy starts. The head goes over the local
     block whenever the newest version is in it — also when every listed
     version is, as on a branch many versions ahead, where the remote's copy
     starts below what the list shows. It used to wait for a published version
     to follow, and that branch's versions read as nothing in particular. */
  const unpublished = history?.unpublished ?? null;
  const publications = versions.map((version, index) => publicationAt(branch, unpublished, version.commit, index));
  /* The head goes over the newest run of versions only here, and the remote's
     mark where the first published one follows it. */
  const boundaryIndex = publications.findIndex(
    (publication, index) => index > 0 && publication === "published" && publications[index - 1] === "local-only",
  );
  const localHead = publications[0] === "local-only";
  const publishedOn = publishedOnLabel(branch);
  /* Publishing is the active branch's: the flow publishes the branch the project
     is on. Offered while it has something to send — versions ahead, or no
     copy on the remote yet, or one that was deleted — and not while the
     remote has versions of its own, which have to be got first. */
  const sync = syncStatusOf(branch);
  const canPublish =
    onPublish !== undefined &&
    branch.isActive &&
    (sync.kind === "ahead" || sync.kind === "none" || sync.kind === "gone");

  return (
    <section className="branches-detail" aria-label={t.branchesDetailAriaLabel(branch.name)}>
      <button className="branches-detail__back secondary-button" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        {t.branchesBackToList}
      </button>
      <div className="branches-detail__card">
        {/* The branch's strip: one line, its name and nothing that competes
            with it — who last saved to it and when are an avatar and a
            relative time at the trailing end, before its actions. A fixed
            `--strip-height`, the height the list panel's header beside it
            wears, so the two panels start their content on the same pixel row
            — the shape History's version strip has. It used to carry a second
            line, `Latest saved` and the author spelled out, which was the first
            thing to truncate, and an `Active` capsule beside the name: the
            row's own glyph says that here too. */}
        {renameEditor ?? (
        <header
          className={`branches-detail__strip${settle ? " branches-detail__strip--settling" : ""}${
            settle === "renamed" ? " branches-detail__strip--renamed" : ""
          }`}
        >
          <div className="branches-detail__identity">
            <h2>
              {branch.isActive && <StateGlyph tone="accent" icon={<ActiveIcon />} tooltip={t.branchesGlyphActive} />}
              {/* The prefix quiet, as on the row: `release/` before `0.4.0`, the
                  way History's strip quiets `chore(release):`. */}
              <span className="branches-detail__name" title={branch.name}>
                {nameParts.quiet && <span className="branches-detail__name-quiet">{nameParts.quiet}</span>}
                {nameParts.own}
              </span>
              {branch.isActive && <span className="visually-hidden">{t.branchesActiveLabel}</span>}
            </h2>
          </div>
          {/* Not where the branch lives: the first state under the strip
              already names the upstream, or says there is none, in a
              sentence about it. */}
          {(author || date) && (
            <p className="branches-detail__byline">
              {author && (
                <>
                  <AuthorAvatar
                    name={author}
                    email={tipRecord?.authorEmail}
                    isSelf={isSelf}
                    tooltip={isSelf ? t.branchesAuthorYouNamed(author) : author}
                    size="strip"
                  />
                  <span className="visually-hidden">{`${t.branchesLatestSavedLabel}: ${author}`}</span>
                </>
              )}
              {/* Relative, as the list beside it says when; the exact date
                  is on the tooltip. */}
              {date && <span title={formatDate(date, formats)}>{formatRelativeTime(date, formats)}</span>}
            </p>
          )}
          <BranchActions
            branch={branch}
            copiedInto={
              history?.route?.merge && history.route.merge.kind !== "merge" ? history.route.base : null
            }
            onSwitch={onSwitch}
            onRename={onRename}
            onDelete={onDelete}
          />
        </header>
        )}

        {/* The panel does not scroll; the list inside it does. Where this branch
            stands is three branches that never grow, and scrolling them out of
            reach to read the versions below was the panel moving the answer
            rather than the question. */}
        <div className="branches-detail__body">
          <div className="branches-detail__grid">
            {/* No heading: two or three states that each say what they are
                need no label over them, and the rule under the strip already
                says a new part of the panel has started. The name stays for a
                screen reader, on the list itself. */}
            <section className="branches-card">
              <ul className="branches-relations" aria-label={t.branchesRelationshipTitle}>
                {relationEntries(branch, mainName, routeShown, t).map((entry) => (
                  <li key={entry.key} className={`branches-relations__item--${entry.tone}`}>
                    <RelationIcon tone={entry.tone} />
                    {/* One branch each: the state and the sentence that explains
                        it, side by side. Stacked, three states filled half the
                        panel to say what fits across a third of it. */}
                    <span>
                      <strong>{entry.title}</strong>
                      {entry.detail}
                    </span>
                    {/* One Publish per branch: on the "On this computer" head
                        when it is drawn, beside the versions it sends, as
                        History has it; here only when there is no head — a
                        branch never published, or whose remote branch is gone. */}
                    {entry.key === "remote" && canPublish && !localHead && (
                      <PublishCapsule onPublish={onPublish} label={t.branchesPublish} />
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {/* Where this branch left the main branch, drawn — between where it
                stands and the versions on it, the two things the drawing
                connects. Only for a branch that has a route: the main branch
                itself, a project with none, and a shallow clone draw nothing
                rather than a guess. While the read is out, a branch that will
                have one — any but the main branch, in a project that has one —
                keeps the section's place with the main lane already drawn, so
                the answer grows into a space that was waiting for it instead
                of pushing the versions down when it lands. */}
            {routeShown && (
              <section className="branches-card" aria-label={t.branchesRouteTitle}>
                <h3>{t.branchesRouteTitle}</h3>
                <BranchRoute
                  branch={branch}
                  route={history?.route ?? null}
                  base={history?.route?.base ?? mainName ?? ""}
                  previous={previousRoute}
                  highlightedCommit={highlighted}
                  onOpenVersion={onOpenHistory}
                />
              </section>
            )}

            {/* What this branch can do with the other end — the active branch, or
                the main branch when this is the active one. A few rows that
                never grow, so the versions below keep the height. */}
            <BranchIntegrations
              branch={branch}
              activeName={activeName}
              mainName={mainName}
              route={history?.route ?? null}
              onBringIn={onBringIn}
            />

            {/* One list, not a card for the latest version and a list of the
                rest under it. They are the same sequence, and the split cost a
                heading and a rule to separate a row from the row below it.
                Each version sits on a rail with History's and Overview's node:
                half filled while only here, a solid neutral disc once
                published, an empty ring when that is not known — so no row
                needs a chip to say it, and the code shows under the pointer. */}
            <section className="branches-card branches-card--fill">
              {/* The way on to History heads the list it continues rather than
                  closing the card as a band of its own: the versions here are
                  a preview of the sequence History draws in full, so "all of
                  them" belongs next to their name. The band spent a rule, a
                  glyph, a title and a sentence on one button, under the rows
                  it took the height from. */}
              <div className="branches-card__head">
                <h3>{t.branchesVersionsTitle}</h3>
                {onOpenHistory && (
                  <button
                    className="ghost-button branches-card__link"
                    type="button"
                    // The branch being looked at, opened as the branch being looked
                    // at — no checkout, and no landing on whichever branch happens
                    // to be active. The tooltip says so for a branch that is not.
                    title={
                      branch.isActive
                        ? t.branchesHistoryDescription
                        : t.branchesHistoryScopedDescription(branch.name)
                    }
                    onClick={() => onOpenHistory(branch.name)}
                  >
                    {t.branchesHistoryAction}
                    <ArrowRight aria-hidden="true" />
                  </button>
                )}
              </div>
              <ol
                {...autoHideScrollbarProps<HTMLOListElement>()}
                className="branches-recent auto-hide-scrollbar"
              >
                {localHead && (
                  <li className="branches-recent__head">
                    <TimelineChip kind="local" label={t.branchesLocalGroup} compact className="branches-recent__chip" />
                    {canPublish && <PublishCapsule onPublish={onPublish} label={t.branchesPublish} />}
                  </li>
                )}
                {versions.map((version, index) => {
                  const savedAt = version.committedAt ? new Date(version.committedAt) : null;
                  const valid = savedAt !== null && !Number.isNaN(savedAt.getTime());
                  const publication = publications[index];
                  const state =
                    publication === "published"
                      ? t.branchesPublishedPill
                      : publication === "local-only"
                        ? t.branchesUnpublishedPill
                        : undefined;
                  const body = (
                    <>
                      <span className="branches-recent__node" aria-hidden="true" />
                      <span className="branches-recent__subject" title={version.subject}>
                        {version.subject}
                      </span>
                      <code>{version.shortCommit}</code>
                      {valid && (
                        <span
                          className="branches-recent__date"
                          title={t.branchesSavedLabel(formatDate(savedAt, formats))}
                        >
                          {formatDate(savedAt, formats)}
                        </span>
                      )}
                    </>
                  );
                  return (
                    <React.Fragment key={version.commit}>
                      {index === boundaryIndex && (
                        <li className="branches-recent__boundary" aria-hidden="true">
                          <TimelineChip
                            kind="published"
                            label={t.branchesBoundaryPublished}
                            title={publishedOn ?? undefined}
                            compact
                            className="branches-recent__chip"
                          />
                        </li>
                      )}
                      <li
                        className={`branches-recent__row branches-recent__row--${publication}`}
                        data-first={(index === 0 && !localHead) || undefined}
                        data-last={index === versions.length - 1 || undefined}
                        // The row the reader is on lights the same version's dot
                        // in the route above — by keyboard as well as pointer, so
                        // the drawing answers the list for someone who cannot
                        // reach its dots.
                        onFocus={() => setHighlighted(version.commit)}
                        onBlur={() => setHighlighted(null)}
                        onMouseEnter={() => setHighlighted(version.commit)}
                        onMouseLeave={() => setHighlighted(null)}
                      >
                        {/* A row opens this version in History, the way a row in
                            any of the three lists opens what it names. Without a
                            host to open it the row states the version and stays
                            a row rather than pretending to be a control. The
                            node is drawn, so where the version stands is said
                            in words for a screen reader. */}
                        {onOpenHistory ? (
                          <button
                            className="branches-recent__open"
                            type="button"
                            aria-label={t.branchesOpenVersionLabel(version.subject)}
                            aria-description={state}
                            onClick={() => onOpenHistory(branch.name, version.commit)}
                          >
                            {body}
                          </button>
                        ) : (
                          body
                        )}
                      </li>
                    </React.Fragment>
                  );
                })}
              </ol>
            </section>
          </div>
        </div>

      </div>
    </section>
  );
}

/* --------------------------------------------------------------- panel ---- */

export function BranchesPanel({
  projectPath,
  sessionEpoch,
  snapshot,
  error,
  isLoading,
  watcherState,
  onOpenSettings,
  onRefresh,
  onSnapshot,
  readHistory,
  peekHistory,
  prefetchHistory,
  onPublish,
  onBringIn,
  onChanged,
  onSaveVersion,
  onOpenConflicts,
  onOpenHistory,
  onOperationStart,
  onOperationFinish,
  onOperationPhaseChange,
  autoOpenCreate,
  onAutoOpenCreateHandled,
  selectBranchIntent,
  onSelectBranchIntentHandled,
  selfEmail = null,
}: {
  projectPath: string;
  sessionEpoch: string;
  /** The project session's cached branch inventory, or `null` if this project
   * has never loaded one. Reading it (and the refresh that keeps it current)
   * belongs to `app/App.tsx`, so navigating away from this screen and back
   * re-renders the known answer instead of restarting from a spinner — see
   * task 019. */
  snapshot: BranchesSnapshot | null;
  /** A failed read, already localized. Shown as a full error screen only when
   * there is no `snapshot` to fall back on; alongside one it degrades to a
   * "this may be stale" note. */
  error: string | null;
  isLoading: boolean;
  watcherState: "starting" | "watching" | "off" | "unavailable";
  onOpenSettings: () => void;
  onRefresh: () => void;
  /** A fresh snapshot returned by a create/switch/delete, handed back so the
   * session cache reflects the mutation without waiting for a re-read. */
  onSnapshot: (snapshot: BranchesSnapshot) => void;
  /** Reads the selected branch's recent saved versions. Optional because it is
   * the one thing on this screen that costs Git work beyond the inventory:
   * without it every section still renders what the inventory knows. */
  readHistory?: (name: string, tipCommit: string) => Promise<BranchHistory>;
  /** The same answer if the session already holds it, so returning to this
   * screen renders the detail whole instead of asking Git again merely
   * because it became visible. Never starts a read. */
  peekHistory?: (name: string, tipCommit: string) => BranchHistory | null;
  /** Starts a branch's read ahead of a press, unless another read is out. */
  prefetchHistory?: (name: string, tipCommit: string) => void;
  /** Opens the publish flow for the active branch. */
  onPublish?: () => void;
  onBringIn?: (name: string) => void;
  /** Called after any successful create/switch/delete so the rest of the
   * app (repository facts, working-tree status, selection) can invalidate
   * itself — see `app/App.tsx`'s `handleBranchChanged`. */
  onChanged: () => void;
  onSaveVersion: () => void;
  /** Navigates to the Changes screen — the only place conflicted files are
   * listed, which is where a blocked "unfinished Git operation" points. */
  onOpenConflicts?: () => void;
  /** Opens the History screen reading the named branch, whether or not it is the
   * active one. Nothing is checked out to get there. */
  /** Open History reading this branch, and — when a version is named — with that
   * version selected. Branches' own list of saved versions is a preview of the
   * one History draws in full. */
  onOpenHistory?: (name: string, commit?: string) => void;
  /** The user's own Git email: their versions say "You", the name on hover. */
  selfEmail?: string | null;
  /** Registers the dialog as a path-scoped mutation before it opens. Returns
   * false when another session sharing this Git directory owns a mutation. */
  onOperationStart: () => boolean;
  onOperationFinish: () => void;
  onOperationPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
  /** Set by the command palette's "New branch" action, which can fire
   * from any screen — this opens the create dialog as soon as the panel
   * mounts. The screen itself has no button into the dialog: its composer
   * starts a branch. */
  autoOpenCreate?: boolean;
  onAutoOpenCreateHandled?: () => void;
  /** A branch another screen asked this one to select — History's "View branch".
   *
   * One-shot, like `autoOpenCreate` and for the same reason: this screen stays
   * mounted for the session, so a standing prop would re-select on every render
   * of the composition root and undo a selection the reader has since made. */
  selectBranchIntent?: string | null;
  onSelectBranchIntentHandled?: () => void;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const [search, setSearch] = useState("");
  const [prefixFilters, setPrefixFilters] = useState<string[]>([]);
  const [stateFilters, setStateFilters] = useState<StateFilter[]>([]);
  const [sort, setSort] = useState<SortKey>("recent");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  /* The branch whose name is being edited in the detail strip, if any. Tied to
     a name rather than to "the selection" so choosing another branch drops it
     instead of carrying a half-typed name over to a branch it was not for. */
  const [renaming, setRenaming] = useState<string | null>(null);
  /* The rename that just closed, for the one motion that says so: the strip
     fading back in, and the new name lighting once in the strip and the row.
     Cleared once that has played, so a later visit to the branch is still. */
  const [settled, setSettled] = useState<{ name: string; saved: boolean } | null>(null);
  useEffect(() => {
    if (!settled) return undefined;
    const timer = window.setTimeout(() => setSettled(null), 700);
    return () => window.clearTimeout(timer);
  }, [settled]);
  /* The keyboard's place when it is on a heading of the list. On a row it is
     the selection, so choosing a branch clears it. */
  const [focusedHeading, setFocusedHeading] = useState<string | null>(null);
  /* A branch the reader is sent to — by another screen, or by renaming it — is
     shown, not left folded under a heading. */
  function unfoldFor(branch: Branch | undefined): void {
    const bucket = branch ? bucketOf(branch) : null;
    if (!branch || !bucket) return;
    const prefix = prefixOf(branch.name);
    setFold(bucketItemId(bucket), false);
    if (prefix) setFold(clusterItemId(bucket, prefix), false);
  }
  const selectBranch = useCallback((name: string) => {
    setFocusedHeading(null);
    setSelectedName(name);
    setRenaming((current) => (current === name ? current : null));
  }, []);
  /* One column at a time below 1024px, the way Changes and History narrow.
     Which of the two is showing is this screen's own state, not a filter on
     the data, so it survives every refresh underneath it. */
  const [showNarrowDetail, setShowNarrowDetail] = useState(false);
  const [contextMenu, setContextMenu] = useState<BranchContextMenuState | null>(null);
  /* The list's own scroll container, shared with `BranchQuickCreateBox`
   * so opening or closing it can keep the list's scroll position anchored to
   * its own foot — see `useScrollAnchoredResize`. */
  const listScrollRef = useRef<HTMLDivElement>(null);
  /* Announced rather than shown: a copy leaves no mark on screen, so the one
     confirmation a screen reader gets is this. Cleared on the next open so the
     same word is announced again the second time. */
  const [announcement, setAnnouncement] = useState("");
  const [dialog, setDialog] = useState<DialogRequest>(null);

  function openDialog(request: Exclude<DialogRequest, null>): void {
    if (onOperationStart()) {
      setDialog(request);
    }
  }

  function closeDialog(): void {
    setDialog(null);
    onOperationFinish();
  }

  /* Stable, and with the focus move outside the updater: an updater React may
     call twice is no place for a side effect, and an `onClose` with a new
     identity every render makes the menu re-subscribe its dismissal listeners
     on every keystroke in the search box. */
  const contextMenuRef = useRef<BranchContextMenuState | null>(null);
  contextMenuRef.current = contextMenu;
  const closeContextMenu = useCallback((restoreFocus: boolean): void => {
    if (restoreFocus) contextMenuRef.current?.focusTarget?.focus();
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (autoOpenCreate) {
      openDialog({ kind: "create", forceSwitch: false });
      onAutoOpenCreateHandled?.();
    }
    // Deliberately fires once per truthy transition of `autoOpenCreate`
    // (the parent flips it back to false right after), not on every render.
  }, [autoOpenCreate]);

  useEffect(() => {
    if (!selectBranchIntent) return;
    setFocusedHeading(null);
    setSelectedName(selectBranchIntent);
    unfoldFor(snapshot?.branches.find((branch) => branch.name === selectBranchIntent));
    setShowNarrowDetail(true);
    onSelectBranchIntentHandled?.();
    // Same one-shot shape as `autoOpenCreate`: applied once per truthy
    // transition, then handed back. Anything else would re-select on every
    // render of the composition root.
  }, [selectBranchIntent]);

  // Derived from whatever names this project actually uses (`feature/`,
  // `bugfix/`, `claude/`, a team's own convention…) rather than a hardcoded
  // git-flow list, so the filter stays useful regardless of naming style.
  // Sorted by how common each prefix is, most common first.
  const prefixCounts = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const counts = new Map<string, number>();
    for (const branch of snapshot.branches) {
      if (branch.isActive) {
        continue;
      }
      const slashIndex = branch.name.indexOf("/");
      if (slashIndex <= 0) {
        continue;
      }
      const prefix = branch.name.slice(0, slashIndex);
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [snapshot]);

  const stateCounts = useMemo(() => {
    const counts: Record<StateFilter, number> = { tracking: 0, "local-only": 0 };
    for (const branch of snapshot?.branches ?? []) {
      if (branch.isActive) {
        continue;
      }
      if (branch.upstream === null) {
        counts["local-only"] += 1;
      } else {
        counts.tracking += 1;
      }
    }
    return counts;
  }, [snapshot]);

  // Drops a prefix filter that no longer matches anything (e.g. the last
  // branch under it was just deleted) instead of silently showing an empty
  // list with no visible explanation.
  useEffect(() => {
    setPrefixFilters((current) => {
      const kept = current.filter((prefix) => prefixCounts.some(([known]) => known === prefix));
      return kept.length === current.length ? current : kept;
    });
  }, [prefixCounts]);

  const others = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const query = search.trim().toLowerCase();
    const matches = snapshot.branches
      .filter((branch) => !branch.isActive)
      .filter((branch) => !query || branch.name.toLowerCase().includes(query))
      .filter(
        (branch) => prefixFilters.length === 0 || prefixFilters.some((prefix) => branch.name.startsWith(`${prefix}/`)),
      )
      .filter(
        (branch) =>
          stateFilters.length === 0 ||
          stateFilters.some((state) => (state === "local-only" ? branch.upstream === null : branch.upstream !== null)),
      );

    return [...matches].sort((a, b) => {
      if (sort === "name") {
        return a.name.localeCompare(b.name);
      }
      const byRecency = b.tip.committedAt.localeCompare(a.tip.committedAt);
      if (sort === "unpublished") {
        const unpublishedFirst = Number(a.upstream !== null) - Number(b.upstream !== null);
        return unpublishedFirst || byRecency;
      }
      return byRecency;
    });
  }, [snapshot, search, prefixFilters, stateFilters, sort]);

  const active = snapshot?.branches.find((branch) => branch.isActive) ?? null;
  /* The repository's default branch — what `BranchQuickCreateBox` offers
     as the alternative starting point to `active` when the two differ. */
  const defaultBranch = snapshot?.branches.find((branch) => branch.isDefault) ?? null;
  /* Every loaded branch's name, for the quick create box to warn about a clash
     and to take its example's prefix from. The whole snapshot, not the
     filtered list: a search must not hide the branch a new name clashes with. */
  const branchNames = useMemo(() => snapshot?.branches.map((branch) => branch.name) ?? [], [snapshot]);
  /* The active branch heads the list and is exempt from search and filters: it
     is where the project *is*, and a screen that can hide it leaves the reader
     without the one row that answers "where am I". */
  const listed = useMemo(() => (active ? [active, ...others] : others), [active, others]);
  const isFiltered = search.trim().length > 0 || prefixFilters.length > 0 || stateFilters.length > 0;

  /* The list as a tree: the active and main branches pinned, then "In progress"
     and "Ready to clean up", each clustered by name prefix. What the reader
     folded is kept apart from what they fold while searching — a search opens
     everything, so what it finds is never hidden, and clearing it puts the
     list back the way the reader left it. The reader's own folds are kept per
     project across launches. */
  const grouped = useMemo(() => groupBranches(active, others), [active, others]);
  /* What "Review" offers: the clean-up block as the list draws it, loose
     branches first and then each cluster, under whatever search or filter is on. */
  const cleanUpBranches = useMemo(() => {
    const bucket = grouped.buckets.find((entry) => entry.key === "clean-up");
    return bucket ? [...bucket.loose, ...bucket.clusters.flatMap((cluster) => cluster.branches)] : [];
  }, [grouped]);
  const [folded, setFold] = useStoredBranchFolds(projectPath);
  const [foldedWhileFiltered, setFoldedWhileFiltered] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!isFiltered) setFoldedWhileFiltered({});
  }, [isFiltered]);
  const isExpanded = useCallback(
    (id: string, byDefault: boolean): boolean =>
      isFiltered ? !(foldedWhileFiltered[id] ?? false) : !(folded[id] ?? !byDefault),
    [folded, foldedWhileFiltered, isFiltered],
  );
  const treeItems = useMemo(
    () => visibleBranchTree(grouped, isExpanded, (name) => `branch-${name}`),
    [grouped, isExpanded],
  );
  const setExpanded = useCallback(
    (id: string, expanded: boolean): void => {
      if (isFiltered) setFoldedWhileFiltered((current) => ({ ...current, [id]: !expanded }));
      else setFold(id, !expanded);
      if (expanded) requestAnimationFrame(() => revealOpened(id));
    },
    [isFiltered, setFold],
  );
  /* A block opened near the foot of the column would open out of sight.
     Scroll by what it needs — never so far that its own heading leaves the
     top — so what was just asked for is on screen. */
  function revealOpened(id: string): void {
    const list = listScrollRef.current;
    const items = treeItemsRef.current;
    const index = items.findIndex((item) => item.id === id);
    const heading = items[index];
    if (!list || !heading) return;
    let end = index;
    while (end + 1 < items.length && items[end + 1]!.level > heading.level) end += 1;
    if (end === index) return;
    const headingElement = document.getElementById(treeItemDomId(heading));
    const lastElement = document.getElementById(treeItemDomId(items[end]!));
    if (!headingElement || !lastElement) return;
    const box = list.getBoundingClientRect();
    const by = Math.min(
      lastElement.getBoundingClientRect().bottom - box.bottom,
      headingElement.getBoundingClientRect().top - box.top,
    );
    if (by <= 0 || typeof list.scrollBy !== "function") return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    list.scrollBy({ top: by, behavior: reduceMotion ? "auto" : "smooth" });
  }

  // Derived rather than stored: a branch that a filter hides, or that a delete
  // removed, falls back to the active one without an effect racing the render
  // that noticed.
  const selected = listed.find((branch) => branch.name === selectedName) ?? listed[0] ?? null;
  const selectedTip = selected?.tip.commit ?? null;

  /* The one item Tab lands on: the heading the keyboard is on, else the
     selected row, else — when the selection is folded away — the innermost
     visible heading above it. */
  const tabStop = useMemo(() => {
    const visible = new Set(treeItems.map((item) => item.id));
    if (focusedHeading && visible.has(focusedHeading)) return focusedHeading;
    if (selected) {
      const own = `branch-${selected.name}`;
      if (visible.has(own)) return own;
      const above = headingsAbove(grouped, selected.name).filter((id) => visible.has(id));
      if (above.length > 0) return above[above.length - 1]!;
    }
    return treeItems[0]?.id ?? null;
  }, [focusedHeading, grouped, selected, treeItems]);

  /* Arrow keys, Home and End walk what is drawn; Right opens a heading or
     steps into it, Left folds it or steps out to the heading above. A row
     reached this way is selected, the way the list always behaved. */
  const treeItemsRef = useRef(treeItems);
  treeItemsRef.current = treeItems;
  const handleTreeKey = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, key: string): void => {
      const items = treeItemsRef.current;
      const index = items.findIndex((item) => (item.kind === "branch" ? item.branch.name === key : item.id === key));
      const item = items[index];
      if (!item) return;
      let target: number;
      switch (event.key) {
        case "ArrowDown":
          target = index + 1;
          break;
        case "ArrowUp":
          target = index - 1;
          break;
        case "Home":
          target = 0;
          break;
        case "End":
          target = items.length - 1;
          break;
        case "ArrowRight":
          if (item.kind === "branch") return;
          if (!item.expanded) {
            event.preventDefault();
            setExpanded(item.id, true);
            return;
          }
          target = index + 1;
          break;
        case "ArrowLeft":
          if (item.kind !== "branch" && item.expanded) {
            event.preventDefault();
            setExpanded(item.id, false);
            return;
          }
          if (item.parentId === null) return;
          target = items.findIndex((entry) => entry.id === item.parentId);
          break;
        default:
          return;
      }
      event.preventDefault();
      const next = items[Math.max(0, Math.min(target, items.length - 1))];
      if (!next) return;
      if (next.kind === "branch") {
        selectBranch(next.branch.name);
      } else {
        setFocusedHeading(next.id);
      }
      requestAnimationFrame(() => document.getElementById(treeItemDomId(next))?.focus());
    },
    [selectBranch, setExpanded],
  );
  const toggleHeading = useCallback(
    (id: string): void => {
      const heading = treeItemsRef.current.find((item) => item.id === id);
      if (!heading || heading.kind === "branch") return;
      setFocusedHeading(id);
      setExpanded(id, !heading.expanded);
    },
    [setExpanded],
  );

  /* The one read this screen starts on its own, and it is keyed by the tip
     rather than by the selection: a branch whose tip has not moved is already
     answered, so returning to this screen renders from the session cache and
     asks Git nothing. A failure leaves `history` null — every section it feeds
     falls back to what the inventory knows rather than showing an error for
     what is, on this screen, extra detail. */
  const [history, setHistory] = useState<BranchHistory | null>(() =>
    selected && selectedTip ? peekHistory?.(selected.name, selectedTip) ?? null : null,
  );
  /* Whether that read is still out — the detail keeps the route's place while
     it is, rather than letting the section arrive and push the versions down. */
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    const name = selected?.name;
    if (!readHistory || !name || !selectedTip) {
      setHistory(null);
      setHistoryLoading(false);
      return undefined;
    }
    const cached = peekHistory?.(name, selectedTip) ?? null;
    setHistory(cached);
    setHistoryLoading(cached === null);
    if (cached) return undefined;
    let cancelled = false;
    void readHistory(name, selectedTip)
      .then((answer) => {
        if (!cancelled) setHistory(answer);
      })
      .catch(() => {
        if (!cancelled) setHistory(null);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [peekHistory, readHistory, selected?.name, selectedTip]);

  /* The route the detail last drew, and whose branch it was. The detail mounts
     afresh for each branch, so the next one's drawing is handed the last one's
     to hold while it is read and to cross-fade from — see `BranchRoute`. */
  const [lastRoute, setLastRoute] = useState<DrawnRoute | null>(null);
  useEffect(() => {
    if (selected && history?.name === selected.name && history.route) {
      setLastRoute({ branch: selected, route: history.route });
    }
  }, [history, selected]);

  /* A row the pointer rests on starts its branch's detail read, so a press a
     moment later finds it answered or already on its way — the controller
     shares one request between the two. Only after a pause, so sweeping the
     pointer down the list asks Git nothing, and never for a branch whose answer
     is already held. */
  const hoverTimerRef = useRef<number | null>(null);
  const handleHoverIntent = useCallback(
    (branch: Branch | null) => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      if (!branch || !prefetchHistory || peekHistory?.(branch.name, branch.tip.commit)) return;
      hoverTimerRef.current = window.setTimeout(() => {
        hoverTimerRef.current = null;
        prefetchHistory(branch.name, branch.tip.commit);
      }, 120);
    },
    [peekHistory, prefetchHistory],
  );
  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current);
    },
    [],
  );

  function handleMutated(next: BranchesSnapshot): void {
    onSnapshot(next);
    setDialog(null);
    onChanged();
    onOperationFinish();
  }

  /** Opens the rename in the detail strip — from its Rename button, the row's
   * menu, or F2 on the row. The branch is selected first, so the strip being
   * edited is the one describing it; in a one-column window the detail is
   * brought forward, since that is where the field is. */
  function startRename(name: string): void {
    setSettled(null);
    setSelectedName(name);
    setRenaming(name);
    setShowNarrowDetail(true);
  }

  /** The row keeps the keyboard's place once the strip closes, under whatever
   * name the branch now has. */
  function endRename(name: string, saved: boolean): void {
    setRenaming(null);
    setSettled({ name, saved });
    requestAnimationFrame(() => document.getElementById(`branch-${name}`)?.focus());
  }

  const dialogs = (
    <>
      <CreateBranchDialog
        isOpen={dialog?.kind === "create"}
        projectPath={projectPath}
        sessionEpoch={sessionEpoch}
        forceSwitch={dialog?.kind === "create" ? dialog.forceSwitch : undefined}
        onClose={closeDialog}
        onCreated={handleMutated}
        onPhaseChange={onOperationPhaseChange}
      />
      <SwitchBranchDialog
        isOpen={dialog?.kind === "switch"}
        projectPath={projectPath}
        sessionEpoch={sessionEpoch}
        target={dialog?.kind === "switch" ? dialog.target : ""}
        onClose={closeDialog}
        onSwitched={handleMutated}
        onSaveVersion={onSaveVersion}
        onCreateWithWork={() => openDialog({ kind: "create", forceSwitch: false })}
        onPhaseChange={onOperationPhaseChange}
      />
      <DeleteBranchDialog
        isOpen={dialog?.kind === "delete"}
        projectPath={projectPath}
        sessionEpoch={sessionEpoch}
        target={dialog?.kind === "delete" ? dialog.target : ""}
        onClose={closeDialog}
        // The list and the rest of the app catch up at once; the dialog then
        // closes itself with a toast that says what happened on the remote
        // and whether a recovery point was kept. Closing it (`closeDialog`)
        // gives the mutation slot back.
        onDeleted={(next) => {
          onSnapshot(next);
          onChanged();
        }}
        // The mutation slot is already held by the delete dialog, so this
        // hands it over to the switch dialog rather than registering again.
        onSwitchInstead={() =>
          setDialog(dialog?.kind === "delete" ? { kind: "switch", target: dialog.target } : null)
        }
        onOpenConflicts={
          onOpenConflicts &&
          (() => {
            // Leaving the screen means the mutation slot has to go back, same
            // as any other way of closing the dialog.
            closeDialog();
            onOpenConflicts();
          })
        }
        onPhaseChange={onOperationPhaseChange}
      />
      <CleanUpBranchesDialog
        isOpen={dialog?.kind === "clean-up"}
        projectPath={projectPath}
        sessionEpoch={sessionEpoch}
        branches={cleanUpBranches}
        onClose={closeDialog}
        // Like the single delete: the list catches up at once, and the
        // dialog closes itself, or stays to say what was kept. Closing it
        // gives the mutation slot back.
        onCleanedUp={(next) => {
          if (next) onSnapshot(next);
          // Refreshes the rest of the app — and the list itself, when the
          // clean-up could not read it back.
          onChanged();
        }}
        onPhaseChange={onOperationPhaseChange}
      />
    </>
  );

  const notices = (
    <div className="branches-notices">
      {(watcherState === "off" || watcherState === "unavailable") && (
        <AutomaticUpdatesNotice
          title={watcherState === "off" ? t.automaticUpdatesOffTitle : t.automaticUpdatesUnavailableTitle}
          description={t.automaticUpdatesOutdatedDescription}
          updateLabel={t.automaticUpdatesUpdateNow}
          updateAriaLabel={t.commandRefreshBranches}
          updatingLabel={t.automaticUpdatesUpdating}
          updatingAriaLabel={t.branchesLoading}
          busy={isLoading}
          settingsLabel={t.automaticUpdatesOpenSettings}
          onUpdate={onRefresh}
          onOpenSettings={onOpenSettings}
        />
      )}
      {/* A refresh that fails after a successful one keeps the known list
          visible, but must still say it may be out of date. */}
      {snapshot && error && !isLoading && (
        <div className="branches-refresh-error" role="alert">
          <span>{t.statusRefreshFailedNote}</span>
          <button className="secondary-button secondary-button--sm" type="button" onClick={onRefresh}>
            {t.branchesRetry}
          </button>
        </div>
      )}
      {snapshot?.headState === "detached" && (
        <div className="branches-banner" role="status">
          <CircleAlert aria-hidden="true" />
          <div className="branches-banner__body">
            <h2>{t.branchesDetachedTitle}</h2>
            <p title={t.branchesDetachedDescription}>{t.branchesDetachedDescription}</p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => openDialog({ kind: "create", forceSwitch: true })}
          >
            <GitBranch aria-hidden="true" />
            {t.branchesDetachedRecoverButton}
          </button>
        </div>
      )}
      {snapshot?.headState === "unborn" && (
        <div className="branches-banner" role="status">
          <CircleAlert aria-hidden="true" />
          <div className="branches-banner__body">
            <h2>{t.branchesUnbornTitle}</h2>
            <p title={t.branchesUnbornDescription}>{t.branchesUnbornDescription}</p>
          </div>
        </div>
      )}
    </div>
  );

  // Only when there is genuinely nothing to show: with a cached snapshot the
  // background refresh stays invisible, which is the whole point of keeping it
  // in the session.
  if (!snapshot && isLoading) {
    return (
      <div className="branches-screen">
        {notices}
        {/* The screen's own shape, headed by its real name: the list panel
            with rows where the branches will be, and the detail card beside it. */}
        <div className="branches-layout">
          <section className="branches-list-panel" aria-label={t.branchesListAriaLabel}>
            <header className="branches-list-panel__header">
              <GitBranch aria-hidden="true" />
              <h1>{t.branchesTitle}</h1>
            </header>
            <LoadingPlaceholder label={t.branchesLoading} className="branches-placeholder">
              <div className="branches-list-panel__toolbar"><TextPlaceholder width="100%" /></div>
              <div className="branches-list">
                {BRANCH_PLACEHOLDER_WIDTHS.map(([name, meta]) => (
                  <span key={name} className="branch-row">
                    <span className="branch-row__name-row">
                      <span className="branch-row__name"><TextPlaceholder width={name} /></span>
                    </span>
                    <span className="branch-row__meta">
                      <TextPlaceholder width={meta} />
                      <span className="branch-row__date"><TextPlaceholder width="44px" /></span>
                    </span>
                  </span>
                ))}
              </div>
            </LoadingPlaceholder>
          </section>
          <section className="branches-detail">
            <LoadingPlaceholder className="branches-detail__card branches-detail__placeholder">
              <p><TextPlaceholder width="38%" /></p>
              <p><TextPlaceholder width="62%" /></p>
              <p><TextPlaceholder width="54%" /></p>
            </LoadingPlaceholder>
          </section>
        </div>
        {dialogs}
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="branches-screen">
        {notices}
        <div className="empty-state empty-state--error" role="alert">
          <div className="empty-state__icon" aria-hidden="true">
            <CircleAlert />
          </div>
          <h1 tabIndex={-1} data-screen-focus>{t.branchesTitle}</h1>
          <p>{error ?? t.branchesErrorLoading}</p>
          <div className="empty-state__actions">
            <button className="primary-button" type="button" onClick={onRefresh}>
              {t.branchesRetry}
            </button>
          </div>
        </div>
        {dialogs}
      </div>
    );
  }


  return (
    <div className={`branches-screen${showNarrowDetail ? " branches-screen--narrow-detail" : ""}`}>
      {notices}
      <div className="branches-layout">
        <section className="branches-list-panel" aria-label={t.branchesListAriaLabel}>
          {/* One strip, the way the Changes file list and the History timeline
              have one. Searching, filtering and sorting answer the same
              question — which branches this column shows — so they share a
              control instead of stacking rows of chrome above the panel. */}
          {/* The panel's own header is the screen's name, the way the Work
              screen's list panel is headed by its tab pair: at the height of
              a strip, the glyph the rail gives Branches in the accent and the
              word in the title's type. There used to be a page row above both
              panels — the name, a sentence about what a branch is, and "New
              branch" — and with the composer under this list doing that job, the
              row was a name the rail already states. */}
          <header className="branches-list-panel__header">
            <GitBranch aria-hidden="true" />
            <h1 tabIndex={-1} data-screen-focus>{t.branchesTitle}</h1>
          </header>
          <div className="branches-list-panel__toolbar">
            <SearchBox
              value={search}
              onChange={setSearch}
              placeholder={t.branchesSearchPlaceholder}
              ariaLabel={t.branchesSearchAriaLabel}
              clearLabel={t.commonClearSearch}
              trailing={
                <BranchesFilterPanel
                  sort={sort}
                  prefixCounts={prefixCounts}
                  stateCounts={stateCounts}
                  selectedPrefixes={prefixFilters}
                  selectedStates={stateFilters}
                  onSort={setSort}
                  onTogglePrefix={(prefix) =>
                    setPrefixFilters((current) =>
                      current.includes(prefix)
                        ? current.filter((value) => value !== prefix)
                        : [...current, prefix],
                    )
                  }
                  onToggleState={(state) =>
                    setStateFilters((current) =>
                      current.includes(state)
                        ? current.filter((value) => value !== state)
                        : [...current, state],
                    )
                  }
                  onClear={() => {
                    setPrefixFilters([]);
                    setStateFilters([]);
                  }}
                />
              }
            />
          </div>

          {isLoading && (
            <div className="branches-list-panel__progress">
              <LoadingBar label={t.branchesLoading} />
            </div>
          )}

          <div
            {...autoHideScrollbarProps<HTMLDivElement>()}
            ref={listScrollRef}
            className="branches-list auto-hide-scrollbar"
            role="tree"
            aria-label={t.branchesListAriaLabel}
          >
            {treeItems.map((item) =>
              item.kind === "branch" ? (
                <BranchRow
                  key={item.id}
                  branch={item.branch}
                  level={item.level}
                  clusterPrefix={item.clusterPrefix}
                  selected={selected?.name === item.branch.name}
                  focusable={tabStop === item.id}
                  formats={formats}
                  onSelect={selectBranch}
                  onTreeKey={handleTreeKey}
                  onRename={startRename}
                  onHoverIntent={handleHoverIntent}
                  justRenamed={settled?.saved === true && settled.name === item.branch.name}
                  onOpenDetail={() => setShowNarrowDetail(true)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setAnnouncement("");
                    setContextMenu({ ...contextMenuAnchorFrom(event), branch: item.branch });
                  }}
                />
              ) : (
                <BranchesGroupHeading
                  key={item.id}
                  item={item}
                  focusable={tabStop === item.id}
                  onToggle={toggleHeading}
                  onTreeKey={handleTreeKey}
                  onCleanUp={
                    item.kind === "bucket" && item.key === "clean-up"
                      ? () => openDialog({ kind: "clean-up" })
                      : undefined
                  }
                />
              ),
            )}
            {others.length === 0 && (
              <p className="empty-line branches-list__empty">
                {isFiltered ? t.branchesNoSearchMatches : t.branchesEmptyOthers}
              </p>
            )}
          </div>

          {(snapshot.isTruncated || snapshot.unreadableCount > 0) && (
            <footer className="branches-list-panel__footer">
              {snapshot.isTruncated && (
                <p>{t.branchesTruncatedNote(snapshot.branches.length, snapshot.totalCount)}</p>
              )}
              {snapshot.unreadableCount > 0 && (
                <p role="status">{t.branchesUnreadableNote(snapshot.unreadableCount)}</p>
              )}
            </footer>
          )}

          {/* The one way to start a branch on this screen — see
              `BranchQuickCreateBox`'s own doc. The dialog stays for the
              palette and the detached-`HEAD` banner. Absent on an unborn
              `HEAD`: there is no commit yet for a branch to point at. */}
          {snapshot.headState !== "unborn" && (
            <BranchQuickCreateBox
              projectPath={projectPath}
              sessionEpoch={sessionEpoch}
              forceSwitch={snapshot.headState === "detached"}
              mainBranch={defaultBranch}
              activeBranch={active}
              existingNames={branchNames}
              listRef={listScrollRef}
              onOperationStart={onOperationStart}
              onOperationFinish={onOperationFinish}
              onOperationPhaseChange={onOperationPhaseChange}
              onCreated={handleMutated}
            />
          )}
        </section>

        {selected ? (
          <BranchDetail
            key={selected.name}
            settle={settled?.name === selected.name ? (settled.saved ? "renamed" : "returned") : null}
            branch={selected}
            activeName={active?.name ?? null}
            mainName={defaultBranch?.name ?? null}
            history={history?.name === selected.name ? history : null}
            historyLoading={historyLoading}
            previousRoute={lastRoute}
            selfEmail={selfEmail}
            formats={formats}
            onSwitch={() => openDialog({ kind: "switch", target: selected.name })}
            onRename={() => startRename(selected.name)}
            onDelete={() => openDialog({ kind: "delete", target: selected.name })}
            onOpenHistory={onOpenHistory}
            onPublish={onPublish}
            onBringIn={onBringIn}
            onBack={() => setShowNarrowDetail(false)}
            renameEditor={
              renaming === selected.name ? (
                <BranchRenameStrip
                  projectPath={projectPath}
                  sessionEpoch={sessionEpoch}
                  target={selected.name}
                  isActive={selected.isActive}
                  upstream={selected.upstream}
                  existingNames={branchNames}
                  onCancel={() => endRename(selected.name, false)}
                  onRenamed={(next, newName) => {
                    // The selection follows the rename — by the name it was
                    // given, not by looking for the tip commit again: a branch
                    // branched from another and not yet advanced shares its
                    // tip, and the search would find whichever came first.
                    setSelectedName(newName);
                    unfoldFor(next.branches.find((branch) => branch.name === newName));
                    handleMutated(next);
                    endRename(newName, true);
                  }}
                  onOperationStart={onOperationStart}
                  onOperationFinish={onOperationFinish}
                  onOperationPhaseChange={onOperationPhaseChange}
                />
              ) : undefined
            }
          />
        ) : (
          <section className="branches-detail branches-detail--empty">
            <p>{t.branchesEmptyOthers}</p>
          </section>
        )}
      </div>

      {/* Which items it shows is `branchActions`, the same functions the detail
          header's buttons read, so a right-click can never offer what the
          panel behind it refuses. */}
      <BranchContextMenu
        context={contextMenu}
        activeName={active?.name ?? null}
        copiedIntoOf={(branch) => {
          const route = peekHistory?.(branch.name, branch.tip.commit)?.route;
          return route?.merge && route.merge.kind !== "merge" ? route.base : null;
        }}
        onClose={closeContextMenu}
        onCopied={() => setAnnouncement(t.branchesNameCopied)}
        onSwitch={(target) => openDialog({ kind: "switch", target })}
        onBringIn={onBringIn}
        onRename={startRename}
        onDelete={(target) => openDialog({ kind: "delete", target })}
      />
      <p className="visually-hidden" role="status">
        {announcement}
      </p>

      {dialogs}
    </div>
  );
}
