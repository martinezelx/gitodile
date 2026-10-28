import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useActiveScreenEffect } from "../../runtime/screen/module";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Ellipsis,
  History,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  Settings,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { localizeAppError, type LocaleFormats } from "../../shared/i18n";
import { getFileTypeIcon } from "../../shared/file-icons";
import {
  AutomaticUpdatesNotice, autoHideScrollbarProps, FilterCapsule, FilterCapsules, FilterChips,
  FilterGroup, FilterPanel, FilterSwitch, handlePopupMenuKeyDown, LoadingBar, LoadingPlaceholder, SearchBox, TextPlaceholder,
  InclusionNode, useAnchoredPopup, useRowArrival, type FilterChip,
} from "../../shared/ui";
import { QuickCommitBox, type QuickCommitBoxHandle } from "./QuickCommitBox";
import { CATEGORY_ORDER, CHANGE_CATEGORY_ICONS, getOrderedChangeEntries, splitPath } from "../status";
import type { ChangeCategory, WorkingTreeEntry, WorkingTreeStatus } from "../status";
import type { ChangesController } from "./controller";
import { DiffResultView, type DiffViewMode } from "./DiffResultView";
import { DiffViewSelector } from "./DiffViewSelector";
import { DiffStepNav } from "./DiffStepNav";
import { DiffFind } from "./DiffFind";
import { PictureDiffControls, usePictureDiff } from "./pictureDiff";
import { canPreviewMarkdown, type DiscardRecovery, type FileDiff } from "./domain";
import { MarkdownPreviewView, useMarkdownPreview } from "./markdownPreview";
import { useMarkdownView } from "./markdownPreference";
import { buildMarkdownExcerpt, buildUnifiedMarkdown } from "./markdownChanges";
import { useDirectDiscard, type DirectDiscardOutcome } from "./directDiscard";
import type { DiscardDialogRequest } from "./DiscardChangesDialog";
import type { ChangesContextMenuState } from "./ChangesContextMenu";
import { getChangesEmptyState, type ChangesEmptyHeadState } from "./emptyState";
import { flatFileRows, flattenFileTree, isGroupedFileRow, resolveSelectedPath, useCollapsedFolders, useFileListView, type FileTreeRow } from "./fileTree";
import { FileTreeFolderButton, FileViewToggle, treeIndentStyle } from "./FileTreeControls";

const DiscardChangesDialog = React.lazy(async () => {
  const module = await import("./DiscardChangesDialog");
  return { default: module.DiscardChangesDialog };
});

const ChangesContextMenu = React.lazy(async () => {
  const module = await import("./ChangesContextMenu");
  return { default: module.ChangesContextMenu };
});

export type { DiffHunk, DiffLine, DiffLineKind, FileDiff } from "./domain";

/** Whether this project has any discarded work stored at all.
 *
 * The cheap question first — is there a newest recovery — and the whole list
 * only when that rejects. A discard that never finished has no restorable
 * state, so the cheap check says no while older records may still be there;
 * that is a reason to open the door to the list, not to hide it. Reading the
 * list costs a status pass per stored record, which is not what a menu should
 * pay on every open. */
async function hasStoredRecoveries(
  controller: ChangesController,
  projectPath: string,
  sessionEpoch: string,
): Promise<boolean> {
  try {
    await controller.getDiscardRecovery(projectPath, sessionEpoch);
    return true;
  } catch {
    return (await controller.listDiscardRecoveries(projectPath, sessionEpoch)).length > 0;
  }
}

function ChangesActionsMenu({
  controller,
  projectPath,
  sessionEpoch,
  selectedPath,
  disabled,
  onChoose,
  t,
}: {
  controller: ChangesController;
  projectPath: string;
  sessionEpoch: string;
  selectedPath: string | null;
  disabled: boolean;
  onChoose: (request: DiscardDialogRequest) => void;
  t: Translations;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [canRestore, setCanRestore] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = (restoreFocus: boolean): void => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const { containerRef, popupRef } = useAnchoredPopup(open, triggerRef, close, "selected-menu-item");
  const choose = (request: DiscardDialogRequest): void => {
    close(true);
    onChoose(request);
  };
  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (next) {
      hasStoredRecoveries(controller, projectPath, sessionEpoch)
        .then((value) => setCanRestore(value))
        .catch(() => setCanRestore(false));
    }
  };
  return (
    <div className="changes-actions-menu" ref={containerRef}>
      <button ref={triggerRef} className="secondary-button secondary-button--sm changes-actions-menu__trigger" type="button" aria-label={t.changesMoreActions} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={toggle} data-tooltip={t.changesMoreActions}>
        <Ellipsis aria-hidden="true" />
      </button>
      {open && <div ref={popupRef} className="app-menu changes-actions-menu__popup" role="menu" aria-label={t.changesMoreActions} tabIndex={-1} onKeyDown={(event) => handlePopupMenuKeyDown(event, popupRef.current, () => close(true))}>
        <button className="app-menu__item app-menu__item--danger" role="menuitem" type="button" disabled={!selectedPath} onClick={() => choose({ mode: "selected", selectedPath })}><Trash2 aria-hidden="true" />{t.changesDiscardSelected}</button>
        <button className="app-menu__item app-menu__item--danger" role="menuitem" type="button" onClick={() => choose({ mode: "all", selectedPath: null })}><Trash2 aria-hidden="true" />{t.changesDiscardAll}</button>
        {canRestore && <button className="app-menu__item" role="menuitem" type="button" onClick={() => choose({ mode: "restore", selectedPath: null })}><RotateCcw aria-hidden="true" />{t.changesRestoreDiscarded}</button>}
      </div>}
    </div>
  );
}

// ---- Types mirroring the Rust `FileDiff` contract (src-tauri/src/lib.rs) ----
// Rust owns Git's diff grammar entirely; this module only renders the typed
// result. It never parses patch text.

// ---- Pure list ordering ----

// Ordering and path splitting live with the status domain so Overview's
// changes preview can share them without importing this module — which would
// pull the whole Changes screen (and the file-type icon set) into the initial
// bundle. Re-exported here so this screen's own consumers keep their import.
export { getOrderedChangeEntries };

export { resolveSelectedPath };

/** Case-insensitive substring match over the whole repository-relative path,
 * so typing either a file name or a folder narrows the list — the same
 * behavior the Branches screen's search box has. An all-whitespace query
 * is treated as no query at all, rather than as a filter nothing matches. */
export function filterEntriesBySearch(entries: WorkingTreeEntry[], search: string): WorkingTreeEntry[] {
  const query = search.trim().toLowerCase();
  if (query.length === 0) {
    return entries;
  }
  return entries.filter((entry) => entry.path.toLowerCase().includes(query));
}

/** Whether the list is showing everything, only what the next saved version
 * takes, or only what it leaves behind. */
export type ChangesInclusion = "all" | "included" | "excluded";

/** What a multi-select answer does to the rows it names: keep only those, or
 * drop them.
 *
 * A multi-select that can only include cannot answer "hide the pictures", which
 * is the complaint the file-type filter exists for — with twenty types in a
 * tree, hiding one would mean choosing the other nineteen. One mode per group
 * rather than one for the whole panel, so "only the conflicts, without the
 * snapshots" is still a question this panel can ask. */
export type ChangesFilterMode = "only" | "hide";

/** The file type a row is filtered by: its extension, lowercased, or the empty
 * string for a name that has none.
 *
 * Deliberately the same rule `getFileTypeIcon` uses to pick a row's artwork —
 * the bare name, its last dot, nothing before position 1 — so the filter and
 * the icon can never disagree about what a file is. `Dockerfile`, `LICENSE` and
 * `.gitignore` all land in the same bucket the default icon does.
 *
 * No taxonomy: no "code", "pictures" or "documents". Naming families is a
 * decision that belongs to whatever owns the icon set, not to a filter, and an
 * extension is exact, needs no list to maintain, and is a word the reader can
 * already see at the end of every row. */
export function fileTypeKey(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** The two questions this screen can answer about its own list, beyond the
 * search box: what kind of change a file is, and whether it is going into the
 * next saved version.
 *
 * Both are answered from what the screen already holds — the entries Rust sent,
 * capped at 1,000, and the checkboxes the reader has cleared — so this is a
 * predicate over the whole list rather than an argument to a read. That is the
 * opposite of History's situation, where a filter has to reach Git because a
 * predicate over the loaded page stops telling the truth as soon as the history
 * is longer than the page. Here there is no page: the list is the entire
 * answer, so the narrowing is exact and costs nothing. */
export type ChangesFilters = {
  categories: ChangeCategory[];
  categoryMode: ChangesFilterMode;
  extensions: string[];
  extensionMode: ChangesFilterMode;
  inclusion: ChangesInclusion;
};

export const NO_CHANGES_FILTERS: ChangesFilters = {
  categories: [], categoryMode: "only",
  extensions: [], extensionMode: "only",
  inclusion: "all",
};

/** What the trigger's badge counts and the chips name, read from one place so
 * the two can never disagree. Each chosen kind and type counts once, because
 * each is removable on its own; the inclusion question counts once whichever
 * end of it is chosen. A mode counts for nothing: it changes what an answer
 * means rather than adding one, and counting it would leave the badge saying
 * three beside two chips. */
export function countActiveChangesFilters(filters: ChangesFilters): number {
  return filters.categories.length + filters.extensions.length + (filters.inclusion === "all" ? 0 : 1);
}

/** One multi-select answer, in whichever direction its group is pointing.
 * Nothing chosen narrows nothing — in either mode, because "hide none of them"
 * and "show only all of them" are the same empty question. */
function matchesSelection<T>(value: T, selected: Set<T>, mode: ChangesFilterMode): boolean {
  if (selected.size === 0) return true;
  return mode === "only" ? selected.has(value) : !selected.has(value);
}

/** The filters applied to the list, and to nothing else.
 *
 * `excludedPaths` is read, never written: which files the next saved version
 * leaves out is the checkboxes' business, and a filter that changed it would be
 * the worst kind of surprise — a file hidden by a filter is still a file being
 * saved. */
export function applyChangesFilters(
  entries: WorkingTreeEntry[],
  filters: ChangesFilters,
  excludedPaths: Set<string>,
): WorkingTreeEntry[] {
  if (countActiveChangesFilters(filters) === 0) {
    return entries;
  }
  const kinds = new Set(filters.categories);
  const types = new Set(filters.extensions);
  return entries.filter((entry) => {
    if (!matchesSelection(entry.category, kinds, filters.categoryMode)) return false;
    if (!matchesSelection(fileTypeKey(entry.path), types, filters.extensionMode)) return false;
    if (filters.inclusion === "included") return !excludedPaths.has(entry.path);
    if (filters.inclusion === "excluded") return excludedPaths.has(entry.path);
    return true;
  });
}

/** The kinds this working tree actually contains, in the order the list already
 * sorts by, each with how many rows it stands for.
 *
 * Counted over the entries rather than over `WorkingTreeStatus.counts`: the
 * counts describe the whole tree while the entries are what a filter can
 * narrow, and on a truncated list the two differ. Offering a kind that would
 * leave the list empty is exactly what "only the kinds present" rules out. */
export function changeKindsPresent(entries: WorkingTreeEntry[]): Array<{ category: ChangeCategory; count: number }> {
  const counted = new Map<ChangeCategory, number>();
  for (const entry of entries) {
    counted.set(entry.category, (counted.get(entry.category) ?? 0) + 1);
  }
  return CATEGORY_ORDER.flatMap((category) => {
    const count = counted.get(category);
    return count ? [{ category, count }] : [];
  });
}

/** The file types this working tree holds, most of them first.
 *
 * Ordered by count rather than alphabetically, because the whole point is the
 * type that is burying the list: in an asset-heavy tree the two hundred
 * pictures should be the first thing this offers to hide. Ties break on the
 * name so the order is stable between refreshes, and the extensionless bucket
 * sits last however many files are in it — it is a leftover, not a type. */
export function fileTypesPresent(entries: WorkingTreeEntry[]): Array<{ key: string; count: number }> {
  const counted = new Map<string, number>();
  for (const entry of entries) {
    const key = fileTypeKey(entry.path);
    counted.set(key, (counted.get(key) ?? 0) + 1);
  }
  return [...counted].map(([key, count]) => ({ key, count })).sort((a, b) => {
    if (a.key === "") return 1;
    if (b.key === "") return -1;
    return b.count - a.count || a.key.localeCompare(b.key);
  });
}

function ChangesStatusNotice({ watcherState, error, busy, onRefresh, onOpenSettings, t }: {
  watcherState: "starting" | "watching" | "off" | "unavailable";
  error: string | null;
  busy: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  t: Translations;
}): React.JSX.Element | null {
  if (error) {
    return <section className="changes-status-notice changes-status-notice--danger" role="alert">
      <CircleAlert aria-hidden="true" />
      <div className="changes-status-notice__body"><strong>{t.changesRefreshFailedTitle}</strong><p title={error}>{error}</p></div>
      <button className="secondary-button" type="button" onClick={onRefresh}>{t.changesCheckLocal}</button>
    </section>;
  }
  if (watcherState !== "off" && watcherState !== "unavailable") return null;
  return <AutomaticUpdatesNotice title={watcherState === "off" ? t.automaticUpdatesOffTitle : t.automaticUpdatesUnavailableTitle} description={t.automaticUpdatesOutdatedDescription} updateLabel={t.automaticUpdatesUpdateNow} updateAriaLabel={t.changesCheckLocal} updatingLabel={t.automaticUpdatesUpdating} updatingAriaLabel={t.statusCheckingMessage} busy={busy} settingsLabel={t.automaticUpdatesOpenSettings} onUpdate={onRefresh} onOpenSettings={onOpenSettings} />;
}


/** What a discard that was never confirmed reports back. The Undo is the
 * recovery point Rust already created, offered in place rather than left to be
 * found under the actions menu.
 *
 * One fixed `role="status"` rather than swapping to `alert` for the failure:
 * the region is already on screen and showing "Discarding…" by the time an
 * error replaces it, and changing a live region's role in place is the one
 * update screen readers are least reliable about announcing. The danger border
 * and icon carry the severity. */
function DiscardOutcomeNotice({
  outcome,
  onUndo,
  onDismiss,
  t,
}: {
  outcome: DirectDiscardOutcome | null;
  onUndo: (recovery: DiscardRecovery) => Promise<void>;
  onDismiss: () => void;
  t: Translations;
}): React.JSX.Element | null {
  if (!outcome) {
    return null;
  }
  const message = outcome.status === "running"
    ? t.changesDiscardingNow
    : outcome.status === "error"
      ? outcome.message
      : outcome.status === "restored"
        ? t.changesRestoreSuccess(outcome.restoredFiles)
        : t.changesDiscardSuccess(outcome.discardedFiles);
  return (
    <div className={`changes-notice changes-notice--${outcome.status}`} role="status">
      {outcome.status === "running" ? (
        <LoaderCircle aria-hidden="true" className="icon--spinning" />
      ) : outcome.status === "error" ? (
        <CircleAlert aria-hidden="true" />
      ) : (
        <CheckCircle2 aria-hidden="true" />
      )}
      <p title={message}>{message}</p>
      {outcome.status === "discarded" && (
        <button className="secondary-button" type="button" onClick={() => void onUndo(outcome.recovery)}>
          <RotateCcw aria-hidden="true" />
          {t.changesUndoDiscard}
        </button>
      )}
      {outcome.status !== "running" && (
        <button className="changes-notice__dismiss" type="button" aria-label={t.commonClose} onClick={onDismiss}>
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

const CATEGORY_LABEL_KEYS = {
  changed: "changesCategoryLabelChanged",
  new: "changesCategoryLabelNew",
  deleted: "changesCategoryLabelDeleted",
  renamed: "changesCategoryLabelRenamed",
  conflicted: "changesCategoryLabelConflicted",
} as const satisfies Record<ChangeCategory, keyof Translations>;

/** An extension as a reader recognises it, and the leftover bucket named in
 * words rather than as an empty string. */
function fileTypeLabel(key: string, t: Translations): string {
  return key === "" ? t.changesFilterTypeNone : `.${key}`;
}

/** The same artwork the row for that type carries, so a switch and the files it
 * stands for are recognised as the same thing. Keyed off a bare name because
 * the icon set resolves whole names too, and `x.ts` is the shortest honest
 * sample of "a file whose type is ts". */
function FileTypeGlyph({ typeKey }: { typeKey: string }): React.JSX.Element {
  const Glyph = getFileTypeIcon(typeKey === "" ? "file" : `file.${typeKey}`);
  return <Glyph className="changes-filter__type-icon" />;
}

const INCLUSION_LABEL_KEYS = {
  all: "changesFilterInclusionAll",
  included: "changesFilterInclusionIncluded",
  excluded: "changesFilterInclusionExcluded",
} as const satisfies Record<ChangesInclusion, keyof Translations>;

const INCLUSION_CHIP_KEYS = {
  included: "changesFilterInclusionIncludedChip",
  excluded: "changesFilterInclusionExcludedChip",
} as const satisfies Record<Exclude<ChangesInclusion, "all">, keyof Translations>;

/** The two questions this list can answer, behind the same trigger the History
 * timeline keeps in the same slot: knowing one screen's filter is knowing the
 * other's.
 *
 * The kinds are switches rather than capsules — five of them, each carrying the
 * glyph the rows already use for it and the number of rows it stands for, which
 * is what turns "hide the untracked noise" into one informed click. Only the
 * kinds this working tree contains are offered, so no answer here can empty the
 * list on its own.
 *
 * The inclusion question is three capsules: one choice out of a short, fixed
 * set, which is the shape a segmented choice takes. It is asked as the question
 * the row's checkbox answers — "will be saved: yes / no" — because the checkbox
 * is the only place this screen states that fact, and a filter must narrow by
 * something the reader can then check on the rows it leaves.
 *
 * It is not offered at all where no file can be left out: past Rust's 1,000-entry
 * cap the checkboxes are disabled and the next version takes everything, so the
 * question has only one true answer and asking it would be theatre. */
function ChangesFilterMode({ group, mode, name, onChange, t }: {
  group: string;
  mode: ChangesFilterMode;
  name: string;
  onChange: (mode: ChangesFilterMode) => void;
  t: Translations;
}): React.JSX.Element {
  return (
    <FilterCapsules ariaLabel={t.changesFilterModeLabel(group)}>
      {(["only", "hide"] as const).map((option) => (
        <FilterCapsule key={option} name={name} checked={mode === option} onChange={() => onChange(option)}>
          {option === "only" ? t.changesFilterModeOnly : t.changesFilterModeHide}
        </FilterCapsule>
      ))}
    </FilterCapsules>
  );
}

function ChangesFilterPanel({ filters, kinds, types, canChooseFiles, onChange, t }: {
  filters: ChangesFilters;
  kinds: Array<{ category: ChangeCategory; count: number }>;
  types: Array<{ key: string; count: number }>;
  canChooseFiles: boolean;
  onChange: (filters: ChangesFilters) => void;
  t: Translations;
}): React.JSX.Element {
  const toggleKind = (category: ChangeCategory): void => onChange({
    ...filters,
    categories: filters.categories.includes(category)
      ? filters.categories.filter((kind) => kind !== category)
      : [...filters.categories, category],
  });
  const toggleType = (key: string): void => onChange({
    ...filters,
    extensions: filters.extensions.includes(key)
      ? filters.extensions.filter((type) => type !== key)
      : [...filters.extensions, key],
  });
  return (
    <FilterPanel
      activeCount={countActiveChangesFilters(filters)}
      labels={{
        open: t.changesFiltersLabel,
        active: t.changesFiltersActive,
        activeCount: t.changesFiltersActiveCount,
        clear: t.changesFiltersClear,
      }}
      onClear={() => onChange(NO_CHANGES_FILTERS)}
    >
      <FilterGroup label={t.changesFilterKindLabel}>
        {/* Always drawn, not revealed once something is chosen: a control that
            appears under the pointer moves the switch the reader was about to
            press next. */}
        <ChangesFilterMode
          group={t.changesFilterKindLabel}
          mode={filters.categoryMode}
          name="changes-filter-kind-mode"
          onChange={(categoryMode) => onChange({ ...filters, categoryMode })}
          t={t}
        />
        {kinds.map(({ category, count }) => (
          <FilterSwitch
            key={category}
            checked={filters.categories.includes(category)}
            icon={CHANGE_CATEGORY_ICONS[category]}
            label={t[CATEGORY_LABEL_KEYS[category]]}
            count={count}
            onChange={() => toggleKind(category)}
          />
        ))}
      </FilterGroup>

      {/* Offered only where there is more than one type to tell apart — a tree
          of nothing but `.ts` has nothing to narrow, and the group would be a
          row of chrome answering a question the list already answers. */}
      {types.length > 1 && <FilterGroup label={t.changesFilterTypeLabel}>
        <ChangesFilterMode
          group={t.changesFilterTypeLabel}
          mode={filters.extensionMode}
          name="changes-filter-type-mode"
          onChange={(extensionMode) => onChange({ ...filters, extensionMode })}
          t={t}
        />
        {/* The one part of this panel that grows with the repository, so it is
            the one part that scrolls. The panel itself must not: History nests
            popups inside it, and a scroll container there would clip them. */}
        <div {...autoHideScrollbarProps<HTMLDivElement>()} className="changes-filter__types auto-hide-scrollbar">
          {types.map(({ key, count }) => (
            <FilterSwitch
              key={key || "none"}
              checked={filters.extensions.includes(key)}
              icon={<FileTypeGlyph typeKey={key} />}
              label={fileTypeLabel(key, t)}
              count={count}
              onChange={() => toggleType(key)}
            />
          ))}
        </div>
      </FilterGroup>}

      {canChooseFiles && <FilterGroup label={t.changesFilterInclusionLabel}>
        {/* Not `dense`: that padding exists for History's five date presets in
            a 276px group, and three one-word answers have the room to breathe. */}
        <FilterCapsules>
          {(["all", "included", "excluded"] as const).map((inclusion) => (
            <FilterCapsule
              key={inclusion}
              name="changes-filter-inclusion"
              checked={filters.inclusion === inclusion}
              onChange={() => onChange({ ...filters, inclusion })}
            >
              {t[INCLUSION_LABEL_KEYS[inclusion]]}
            </FilterCapsule>
          ))}
        </FilterCapsules>
      </FilterGroup>}
    </FilterPanel>
  );
}

/** What is narrowing the list, under the strip that set it. `shared/ui` draws
 * the row; what belongs to Changes is which chips are in it and what removing
 * one means. */
function ChangesFilterChips({ filters, onChange, t }: {
  filters: ChangesFilters;
  onChange: (filters: ChangesFilters) => void;
  t: Translations;
}): React.JSX.Element | null {
  /** A chip says what it is doing, not just what it names: "New" and "Hiding
   * New" narrow the same list in opposite directions, and a chip row that
   * showed only the name would read identically either way. Its remove button
   * says the same — "remove the Hiding New filter" is not what pressing it
   * means; putting those files back is. */
  const describe = (mode: ChangesFilterMode, label: string): Pick<FilterChip, "label" | "removeLabel"> =>
    mode === "only"
      ? { label }
      : { label: t.changesFilterHiddenChip(label), removeLabel: t.changesFilterShowAgain(label) };

  const chips: FilterChip[] = filters.categories.map((category) => ({
    key: `kind:${category}`,
    ...describe(filters.categoryMode, t[CATEGORY_LABEL_KEYS[category]]),
    icon: CHANGE_CATEGORY_ICONS[category],
    onRemove: () => onChange({
      ...filters,
      categories: filters.categories.filter((kind) => kind !== category),
    }),
  }));
  for (const key of filters.extensions) {
    chips.push({
      key: `type:${key || "none"}`,
      ...describe(filters.extensionMode, fileTypeLabel(key, t)),
      icon: <FileTypeGlyph typeKey={key} />,
      onRemove: () => onChange({
        ...filters,
        extensions: filters.extensions.filter((type) => type !== key),
      }),
    });
  }
  if (filters.inclusion !== "all") {
    chips.push({
      key: "inclusion",
      label: t[INCLUSION_CHIP_KEYS[filters.inclusion]],
      onRemove: () => onChange({ ...filters, inclusion: "all" }),
    });
  }
  return <FilterChips chips={chips} removeLabel={t.changesFilterRemove} />;
}

type DiffState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; diff: FileDiff };

const DIFF_LOADING_DELAY_MS = 140;
/** How many files on each side of the current selection get quietly
 * prefetched in the background. Small on purpose: this rides on the same
 * per-file `git diff` process spawn as a real click, so it trades a couple
 * of extra background processes for near-instant "next file" clicks during
 * the common sequential-review flow, without eagerly fetching an entire
 * (possibly huge) change set up front. */

/** How many hunks the currently shown diff has. Only the two kinds that carry
 * hunks can be navigated; the rest have nothing to step through. */
function getHunkCount(diffState: DiffState): number {
  if (diffState.status !== "ready") {
    return 0;
  }
  const diff = diffState.diff;
  return diff.kind === "text" || diff.kind === "conflict" ? diff.hunks.length : 0;
}

function DiffWorkspace({
  projectPath,
  sessionEpoch,
  controller,
  selectedPath,
  entry,
  diffState,
  filePosition,
  fileTotal,
  onSelectPreviousFile,
  onSelectNextFile,
  onRetry,
  onBackToList,
  onCodeContextMenu,
  t,
}: {
  projectPath: string;
  sessionEpoch: string;
  controller: ChangesController;
  selectedPath: string | null;
  entry: WorkingTreeEntry | null;
  diffState: DiffState;
  /** 1-based, matching what the toolbar shows. `0` means the selected file
   * isn't in the (possibly filtered) list, which disables both arrows. */
  filePosition: number;
  fileTotal: number;
  onSelectPreviousFile: () => void;
  onSelectNextFile: () => void;
  onRetry: () => void;
  onBackToList: () => void;
  onCodeContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  t: Translations;
}): React.JSX.Element {
  // Both live here rather than in `ChangesPanel` because they describe how
  // this pane is being read, not what the screen is showing: the view mode
  // deliberately survives moving between files, and the change target is
  // reset per file by the effect below.
  const [viewMode, setViewMode] = useState<DiffViewMode>("unified");
  const [markdownView, setMarkdownView] = useMarkdownView();
  const currentDiff = diffState.status === "ready" && diffState.diff.path === selectedPath ? diffState.diff : null;
  const markdownAvailable = canPreviewMarkdown(currentDiff);
  const requestsMarkdown = markdownView === "markdown" && markdownAvailable;
  const markdown = useMarkdownPreview(currentDiff, `${projectPath}\0${sessionEpoch}`, requestsMarkdown,
    (filePath) => controller.readFileMarkdown(projectPath, sessionEpoch, filePath));
  const comparison = useMemo(() => requestsMarkdown && markdown.state.status === "ready" && markdown.state.preview.kind === "ready"
    ? buildUnifiedMarkdown(markdown.state.preview.beforeContent, markdown.state.preview.content) : undefined,
  [requestsMarkdown, markdown.state]);
  const excerpt = useMemo(() => requestsMarkdown && markdown.state.status === "ready" && markdown.state.preview.kind === "too-large" && currentDiff?.kind === "text"
    ? buildMarkdownExcerpt(currentDiff.hunks, currentDiff.truncated) : undefined,
  [requestsMarkdown, markdown.state, currentDiff]);
  const markdownFailure = !requestsMarkdown ? null : markdown.state.status === "error" ? t.changesMarkdownError
    : markdown.state.status === "ready" && markdown.state.preview.kind === "too-large" && !excerpt
      ? t.changesMarkdownTooLarge(markdown.state.preview.limitBytes / 1024)
      : comparison === null ? t.changesMarkdownComplex : null;
  const showsMarkdown = requestsMarkdown && markdownFailure === null;
  const effectiveViewMode = markdownAvailable && markdownView !== "markdown" ? markdownView : viewMode;
  const [hunkTarget, setHunkTarget] = useState({ index: 0, token: 0 });
  const [markdownTarget, setMarkdownTarget] = useState({ index: -1, token: 0 });
  const markdownCount = comparison?.changeCount ?? excerpt?.changeCount ?? 0;
  const markdownIndex = Math.min(markdownTarget.index, Math.max(0, markdownCount - 1));
  const [diffSearch, setDiffSearch] = useState("");
  const [isFindOpen, setIsFindOpen] = useState(false);
  const hunkCount = getHunkCount(diffState);
  const picture = usePictureDiff(
    diffState.status === "ready" ? diffState.diff : null,
    `${projectPath}\0${sessionEpoch}`,
    (filePath, originalPath) =>
      controller.readFileImagePreview(projectPath, sessionEpoch, filePath, originalPath),
  );
  // A picture showing the only version it has needs no control, and the
  // reading-mode picker would be one that does nothing: unified, split and
  // accessible text are ways of laying out lines, and a drawing has none. The
  // strip itself stays either way — it names the open file — so what a picture
  // drops is the picker, not a row, and the file keeps its header.
  const showsReadingMode = picture === null || (picture.isSvg && !picture.showsDrawing);
  const hasViewControls = showsReadingMode || picture.hasControls;

  useEffect(() => {
    setHunkTarget({ index: 0, token: 0 });
  }, [selectedPath]);
  useEffect(() => { setMarkdownTarget({ index: -1, token: 0 }); }, [currentDiff, comparison, excerpt]);

  /* The strip names the file, so the name keeps its room and the folder gives
   * way first — but not to the point of showing a two-letter stub of the last
   * folder (`…ne` beside the category read as a broken "New" badge). The
   * folder is dropped whole when the name and it cannot both fit, and the
   * decision has to be measured: whether it fits depends on the name's length,
   * which CSS alone cannot compare against the space left. The folder stays in
   * the DOM while hidden (removed from flow, not `display: none`) so its
   * natural width is still readable and the folder can come back when the pane
   * widens. */
  const headerRef = useRef<HTMLElement>(null);
  const [showsFolder, setShowsFolder] = useState(true);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) {
      return undefined;
    }
    const measure = (): void => {
      const row = header.querySelector<HTMLElement>(".changes-diff__title-row");
      const path = row?.querySelector<HTMLElement>(".changes-diff__path");
      const name = row?.querySelector<HTMLElement>(".changes-diff__name");
      const folder = row?.querySelector<HTMLElement>(".changes-diff__dir");
      if (!row || !path || !name || !folder || row.clientWidth <= 0) {
        return;
      }
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const siblings = Array.from(row.children).filter((child) => child !== path);
      const siblingWidth = siblings.reduce((total, child) => total + child.getBoundingClientRect().width, 0);
      const available = row.clientWidth - siblingWidth - gap * siblings.length;
      const needed = name.scrollWidth + gap + folder.scrollWidth;
      const next = needed <= available + 0.5;
      setShowsFolder((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    // The category's label is translated, so a language switch changes the room
    // it takes without resizing the header. Watching it re-runs the measure the
    // one time it changes instead of leaving the folder decided against the old
    // label. The name and folder widths only move with `selectedPath`, which
    // reruns this effect by itself.
    const category = header.querySelector<HTMLElement>(".changes-diff__category");
    if (category) {
      observer.observe(category);
    }
    let isCurrent = true;
    void document.fonts?.ready.then(() => {
      if (isCurrent) {
        measure();
      }
    });
    return () => {
      isCurrent = false;
      observer.disconnect();
    };
  }, [selectedPath]);

  const goToHunk = (index: number): void => {
    setHunkTarget((current) => ({ index, token: current.token + 1 }));
  };

  if (!selectedPath) {
    // Only reachable transiently, between the list becoming empty and the
    // parent switching to the clean empty state.
    return <div className="changes-diff" />;
  }

  const { name, dir } = splitPath(selectedPath);
  const FileTypeIcon = getFileTypeIcon(selectedPath);

  return (
    <div className="changes-diff" aria-label={t.changesDiffAriaLabel(selectedPath)}>
      <button type="button" className="changes-diff__back" onClick={onBackToList}>
        <ArrowLeft aria-hidden="true" />
        {t.changesBackToList}
      </button>
      {/* One strip, not two. The file being read and the controls for reading
          it were a header stacked on a toolbar, which cost this panel two
          rules and ~100px before the first line of code appeared. They ask
          one question between them — which file, shown how — so they are one
          row now, paired with the file list's. See `.changes-layout` in
          changes.css. */}
      <header className="changes-diff__header" ref={headerRef}>
        <span className="changes-diff__header-icon" aria-hidden="true">
          <FileTypeIcon className="changes-diff__type-icon" />
        </span>
        <div className="changes-diff__title-row">
          {/* Name first and dir after, the same shape the file rows use, so
              the open file is recognizable as the row it was chosen from. The
              full path stays on the pane's accessible name. */}
          <p className="changes-diff__path">
            <span className="changes-diff__name">{name}</span>
            <span className={`changes-diff__dir${showsFolder ? "" : " changes-diff__dir--hidden"}`}>{dir ?? t.changesProjectRoot}</span>
          </p>
          {/* The category as the row it was chosen from says it — the same
              glyph in the same colour, with the word beside it — rather than
              a pill that said it in a third shape. */}
          {entry && (
            <span className={`changes-diff__category changes-diff__category--${entry.category}`}>
              {CHANGE_CATEGORY_ICONS[entry.category]}
              {t[CATEGORY_LABEL_KEYS[entry.category]]}
            </span>
          )}
          {/* Inline, not a second line: a line of its own grew this header
              past the height it shares with the file list's, putting the
              two panels' rules back out of step for exactly the renamed
              files this text appears on. It truncates like the path, with
              the full value on the tooltip. */}
          {entry?.originalPath && (
            <span className="changes-diff__origin" data-tooltip={t.changesRenamedFrom(entry.originalPath)}>
              {t.changesRenamedFrom(entry.originalPath)}
            </span>
          )}
        </div>
        <div className="changes-diff__controls">
          {fileTotal > 0 && (
            <DiffStepNav
              kind="file"
              position={filePosition}
              total={fileTotal}
              onPrevious={onSelectPreviousFile}
              onNext={onSelectNextFile}
              t={t}
            />
          )}
          {hunkCount > 0 && effectiveViewMode !== "accessible" && !showsMarkdown && (
            <DiffStepNav
              kind="hunk"
              position={hunkTarget.index + 1}
              total={hunkCount}
              onPrevious={() => goToHunk(hunkTarget.index - 1)}
              onNext={() => goToHunk(hunkTarget.index + 1)}
              t={t}
            />
          )}
          {showsMarkdown && markdownCount > 0 && <DiffStepNav
            kind="hunk" position={markdownIndex + 1} total={markdownCount} allowUnselectedNext
            onPrevious={() => setMarkdownTarget((target) => ({ index: markdownIndex - 1, token: target.token + 1 }))}
            onNext={() => setMarkdownTarget((target) => ({ index: markdownIndex + 1, token: target.token + 1 }))}
            t={t}
          />}
          {/* The same find History's diff strip carries, between the arrows and
              the reading controls: a magnifier at rest, a pill whose X closes
              it once opened. */}
          {!showsMarkdown && <DiffFind
            isOpen={isFindOpen}
            query={diffSearch}
            onQueryChange={setDiffSearch}
            onOpen={() => setIsFindOpen(true)}
            onClose={() => { setIsFindOpen(false); setDiffSearch(""); }}
            t={t}
          />}
          {/* Last, at the far edge: the arrows move within this file, and the
              picker changes the file's whole shape. A picture answers the same
              question with its own pickers, in the same place and the same
              shape as the reading-mode picker a text file gets. Each picker
              names itself to a screen reader, so nothing labels them a second
              time in a row this dense. */}
          {hasViewControls && (
            <div className="changes-diff__view">
              {picture?.hasControls && <PictureDiffControls picture={picture} t={t} />}
              {showsReadingMode && <DiffViewSelector value={effectiveViewMode} onChange={(mode) => {
                if (markdownAvailable) setMarkdownView(mode); else setViewMode(mode);
              }} markdown={markdownAvailable ? { selected: showsMarkdown, onSelect: () => {
                setMarkdownView("markdown");
                if (markdownFailure) markdown.retry();
              } } : undefined} t={t} />}
            </div>
          )}
        </div>
      </header>
      <div
        {...autoHideScrollbarProps<HTMLDivElement>()}
        className="changes-diff__body auto-hide-scrollbar"
      >
        {diffState.status === "loading" && <LoadingBar label={t.changesDiffLoadingTitle} showLabel />}
        {diffState.status === "error" && (
          <div className="changes-diff__status changes-diff__status--error" role="alert">
            <CircleAlert aria-hidden="true" />
            <p>{diffState.message}</p>
            <button type="button" className="secondary-button" onClick={onRetry}>
              {t.changesDiffRetry}
            </button>
          </div>
        )}
        {diffState.status === "ready" && (
          <div className="changes-diff-context-scope" onContextMenu={onCodeContextMenu}>
            {markdownFailure && <p className="changes-diff__status" role="status">{markdownFailure} {t.changesMarkdownFallback}</p>}
            {showsMarkdown ? <MarkdownPreviewView state={markdown.state} retry={markdown.retry} t={t} comparison={comparison} excerpt={excerpt} changeTarget={markdownTarget} /> : <DiffResultView
              diff={diffState.diff}
              projectPath={projectPath}
              sessionEpoch={sessionEpoch}
              readFileLines={(filePath, startLine, endLine) =>
                controller.readFileLines(projectPath, sessionEpoch, filePath, startLine, endLine)
              }
              picture={picture}
              viewMode={effectiveViewMode}
              hunkTarget={hunkTarget}
              searchQuery={diffSearch}
              t={t}
            />}
          </div>
        )}
      </div>
    </div>
  );
}

function FileListItem({
  entry,
  isSelected,
  isIncluded,
  canChoose,
  onSelect,
  onToggleIncluded,
  onContextMenu,
  virtualPosition,
  virtualIndex,
  virtualCount,
  measureElement,
  arrivalIndex,
  depth,
  t,
}: {
  entry: WorkingTreeEntry;
  /** In the folder view, how many folders stand above it; the folder is then
   * the row's parent, so the row drops its own folder line. Absent in the
   * list. */
  depth?: number;
  isSelected: boolean;
  isIncluded: boolean;
  canChoose: boolean;
  onSelect: () => void;
  onToggleIncluded: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  virtualPosition?: number;
  virtualIndex?: number;
  virtualCount?: number;
  measureElement?: (node: Element | null) => void;
  /** When this row arrived while the screen was open, its place in the
   * cascade; absent for the list's first draw and for every virtualized row. */
  arrivalIndex?: number;
  t: Translations;
}): React.JSX.Element {
  const { name, dir } = splitPath(entry.path);
  const categoryLabel = t[CATEGORY_LABEL_KEYS[entry.category]];
  const FileTypeIcon = getFileTypeIcon(entry.path);
  // The icon's shape (not just its color) already distinguishes the
  // category, so the label doesn't need to stay always-visible in a row that
  // is otherwise just a file name — it stays available as the accessible
  // name. Deliberately no tooltip: the row already shows the file name and
  // its folder, so one popping up on every row hover is pure noise.
  const accessibleName = entry.originalPath
    ? `${entry.path} — ${categoryLabel} — ${t.changesRenamedFrom(entry.originalPath)}`
    : `${entry.path} — ${categoryLabel}`;

  // Captured at mount, not read from props: the arrival is decided by the list
  // (see `useRowArrival`) on the render the row first appears, and a later
  // render must not strip the class mid-animation. The list is readable the
  // moment it opens; only a row that arrives afterwards wears `.row-in`. A
  // virtualized row never does — it is mounted by a scroll, not by the screen.
  const [arrival] = useState(() => (virtualPosition === undefined ? arrivalIndex : undefined));
  const arrivalStyle: React.CSSProperties | undefined =
    arrival === undefined ? undefined : ({ "--row-index": arrival } as React.CSSProperties);

  return (
    <li
      className={`changes-file-row${virtualPosition === undefined ? "" : " changes-file-row--virtual"}${depth === undefined ? "" : " changes-file-row--tree"}${isIncluded ? "" : " changes-file-row--excluded"}${isSelected ? " changes-file-row--active" : ""}${arrivalStyle ? " row-in" : ""}`}
      data-index={virtualIndex}
      ref={measureElement}
      aria-posinset={virtualIndex === undefined ? undefined : virtualIndex + 1}
      aria-setsize={virtualCount}
      style={{ ...(virtualPosition === undefined ? arrivalStyle : { transform: `translateY(${virtualPosition}px)` }), ...(depth === undefined ? undefined : treeIndentStyle(depth)) }}
    >
      <InclusionNode
        className="changes-file-row__pick"
        checked={isIncluded}
        disabled={!canChoose}
        label={t.changesIncludeFile(entry.path)}
        onChange={onToggleIncluded}
      />
      <button
        type="button"
        className={`changes-file-item${isSelected ? " changes-file-item--active" : ""}${
          entry.category === "conflicted" ? " changes-file-item--attention" : ""
        }`}
        aria-current={isSelected ? "true" : undefined}
        aria-label={accessibleName}
        onClick={onSelect}
        onContextMenu={onContextMenu}
      >
        <span className="changes-file-item__icon" aria-hidden="true">
          <FileTypeIcon className="changes-file-item__type-icon" />
        </span>
        <span className="changes-file-item__details">
          <span className="changes-file-item__name">{name}</span>
          {depth === undefined && <span className="changes-file-item__dir">{dir || t.changesProjectRoot}</span>}
          {entry.originalPath && (
            <span className="changes-file-item__origin">{t.changesRenamedFrom(entry.originalPath)}</span>
          )}
        </span>
        <span className={`changes-file-item__category-icon changes-file-item__category-icon--${entry.category}`} aria-hidden="true">
          {CHANGE_CATEGORY_ICONS[entry.category]}
        </span>
      </button>
    </li>
  );
}

/** Name and folder lengths for the first load's rows: varied, so the shape
 * reads as a list of files rather than a striped block. */
const FILE_PLACEHOLDER_WIDTHS: ReadonlyArray<readonly [string, string]> = [
  ["58%", "34%"],
  ["44%", "52%"],
  ["66%", "28%"],
  ["38%", "46%"],
  ["52%", "38%"],
];

/** The file list's first load: the search strip and a few rows in the places
 * the real ones take (`LoadingPlaceholder`). */
function FileListPlaceholder({ label }: { label: string }): React.JSX.Element {
  return (
    <LoadingPlaceholder label={label} className="changes-file-list__placeholder">
      <div className="changes-file-list__toolbar">
        <span className="changes-file-row__pick-placeholder" aria-hidden="true">
          <TextPlaceholder className="text-placeholder--glyph" />
        </span>
        <TextPlaceholder width="100%" />
      </div>
      <div className="changes-file-list__scroll">
        <ul>
          {FILE_PLACEHOLDER_WIDTHS.map(([name, dir]) => (
            <li key={name} className="changes-file-row">
              <span className="changes-file-row__pick-placeholder" aria-hidden="true">
                <TextPlaceholder className="text-placeholder--glyph" />
              </span>
              <div className="changes-file-item">
                <span className="changes-file-item__icon">
                  <TextPlaceholder className="text-placeholder--glyph" />
                </span>
                <span className="changes-file-item__details">
                  <span className="changes-file-item__name"><TextPlaceholder width={name} /></span>
                  <span className="changes-file-item__dir"><TextPlaceholder width={dir} /></span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </LoadingPlaceholder>
  );
}

/** A folder in the Changes tree: its include box, then the folder itself.
 * The box answers for everything under it — ticked when all of it goes into
 * the version, clear when none does, and indeterminate in between — so a
 * whole area of the project is included or left out in one press. */
function FolderListItem({ row, props, virtual }: {
  row: Extract<FileTreeRow<WorkingTreeEntry>, { kind: "folder" }>;
  props: FileListRowsProps;
  virtual?: { index: number; start: number; count: number; measureElement: (node: Element | null) => void };
}): React.JSX.Element {
  const included = row.files.filter((entry) => !props.excludedPaths.has(entry.path)).length;
  const partial = included > 0 && included < row.files.length;
  return (
    <li
      className={`changes-file-row changes-file-row--tree changes-file-row--folder${virtual ? " changes-file-row--virtual" : ""}`}
      data-index={virtual?.index}
      ref={virtual?.measureElement}
      aria-posinset={virtual ? virtual.index + 1 : undefined}
      aria-setsize={virtual?.count}
      style={{ ...(virtual ? { transform: `translateY(${virtual.start}px)` } : undefined), ...treeIndentStyle(row.depth) }}
    >
      <InclusionNode
        className="changes-file-row__pick"
        checked={included === row.files.length}
        indeterminate={partial}
        disabled={!props.canChoose}
        label={props.t.changesIncludeFolder(row.path)}
        onChange={() => props.onToggleFolderIncluded(row.files, included < row.files.length)}
      />
      <FileTreeFolderButton row={row} formats={props.formats} onToggle={props.onToggleFolder} t={props.t} />
    </li>
  );
}

const NO_COLLAPSED_FOLDERS: ReadonlySet<string> = new Set();
const entryPath = (entry: WorkingTreeEntry): string => entry.path;

const FILE_LIST_VIRTUALIZATION_THRESHOLD = 100;
const FILE_LIST_ESTIMATED_ROW_HEIGHT = 54;

type FileListRowsProps = {
  /** The rows as drawn: files only in the list, folders and files in the
   * folder view. */
  rows: FileTreeRow<WorkingTreeEntry>[];
  /** Whether the rows are the folder view's, so a file row is indented under
   * its folder and drops its own folder line. */
  inFolders: boolean;
  formats: LocaleFormats;
  onToggleFolder: (path: string, expanded: boolean) => void;
  /** Includes every file under a folder, or leaves every one of them out. */
  onToggleFolderIncluded: (entries: WorkingTreeEntry[], include: boolean) => void;
  /** Rows that arrived while this screen was open, keyed by path, valued by
   * their place in the arrival cascade; empty on the list's first draw. */
  arrivals: ReadonlyMap<string, number>;
  selectedPath: string | null;
  excludedPaths: Set<string>;
  canChoose: boolean;
  scrollElement: React.RefObject<HTMLDivElement | null>;
  onSelect: (entry: WorkingTreeEntry) => void;
  onToggleIncluded: (entry: WorkingTreeEntry) => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>, entry: WorkingTreeEntry) => void;
  t: Translations;
};

function fileListItem(
  row: FileTreeRow<WorkingTreeEntry>,
  props: FileListRowsProps,
  virtual?: {
    index: number;
    start: number;
    count: number;
    measureElement: (node: Element | null) => void;
  },
  arrivalIndex?: number,
): React.JSX.Element {
  if (row.kind === "folder") return <FolderListItem key={`folder:${row.path}`} row={row} props={props} virtual={virtual} />;
  const entry = row.item;
  return (
    <FileListItem
      key={entry.path}
      entry={entry}
      depth={isGroupedFileRow(props.inFolders, row) ? row.depth : undefined}
      arrivalIndex={arrivalIndex}
      isSelected={entry.path === props.selectedPath}
      isIncluded={!props.excludedPaths.has(entry.path)}
      canChoose={props.canChoose}
      onSelect={() => props.onSelect(entry)}
      onToggleIncluded={() => props.onToggleIncluded(entry)}
      onContextMenu={(event) => props.onContextMenu(event, entry)}
      virtualPosition={virtual?.start}
      virtualIndex={virtual?.index}
      virtualCount={virtual?.count}
      measureElement={virtual?.measureElement}
      t={props.t}
    />
  );
}

function VirtualizedFileListRows(props: FileListRowsProps): React.JSX.Element {
  const virtualizer = useVirtualizer({
    count: props.rows.length,
    getScrollElement: () => props.scrollElement.current,
    getItemKey: (index) => {
      const row = props.rows[index];
      return row ? `${row.kind}:${row.path}` : index;
    },
    estimateSize: () => FILE_LIST_ESTIMATED_ROW_HEIGHT,
    overscan: 6,
    // jsdom and the first pre-layout render have no measured viewport yet.
    // A conservative initial desktop rect makes that frame useful; the real
    // ResizeObserver measurement replaces it immediately in WebView2/WebKit.
    initialRect: { width: 320, height: 480 },
  });
  const selectedIndex = props.rows.findIndex((row) => row.kind === "file" && row.path === props.selectedPath);

  useEffect(() => {
    if (selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    }
  }, [selectedIndex, virtualizer]);

  return (
    <ul
      className="changes-file-list__virtual"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const row = props.rows[virtualRow.index];
        return row
          ? fileListItem(row, props, {
              index: virtualRow.index,
              start: virtualRow.start,
              count: props.rows.length,
              measureElement: virtualizer.measureElement,
            })
          : null;
      })}
    </ul>
  );
}

function FileListRows(props: FileListRowsProps): React.JSX.Element {
  if (props.rows.length > FILE_LIST_VIRTUALIZATION_THRESHOLD) {
    return <VirtualizedFileListRows {...props} />;
  }
  return <ul>{props.rows.map((row) => fileListItem(row, props, undefined, row.kind === "file" ? props.arrivals.get(row.path) : undefined))}</ul>;
}

/** One actionable control in the clean state's block. `busy` holds it disabled
 * with a spinner while what it started is still running, so a second press
 * cannot start it again. */
type ChangesEmptyAction = { key: string; label: string; icon: React.ReactNode; onClick: () => void; busy?: boolean };

/** The copy and the controls the clean state shows for one repository
 * situation: a headline, a sentence about what that situation means, an
 * optional primary action and up to two secondary ones. */
type ChangesEmptyContent = {
  title: string;
  description: string;
  primary: ChangesEmptyAction | null;
  secondary: ChangesEmptyAction[];
};

export function ChangesPanel({
  tabs,
  projectPath,
  workingTree,
  workingTreeError,
  isCheckingChanges,
  controller,
  sessionEpoch,
  watcherState,
  confirmBeforeDiscarding,
  runGitHooks,
  onRefresh,
  onOpenSettings,
  onSaveCompleted,
  onPublishNow,
  onGetChanges,
  onCheckRemote,
  isCheckingRemote = false,
  onOpenHistory,
  onOpenConflicts,
  headState = "branch",
  selectedPath,
  onSelectedPathChange,
  onBeginDiscard,
  onDiscardClose,
  onDiscardPhaseChange,
  restoredElsewhere = null,
  onRestoredElsewhereHandled,
  recoveriesRevision = 0,
}: {
  /** The Work screen's tab pair, drawn as the list panel's header in every
   * state this panel has — it is what names the column now (task 126), and
   * the way to History has to stay reachable when there is nothing to list. */
  tabs: React.ReactNode;
  projectPath: string;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  /** Owned by the caller, not this component, so already-read diffs survive
   * navigating away from Changes and back within the same project (see task
   * 019). Invalidation is unchanged: `getDiffStore` replaces the store
   * whenever the project or the working-tree snapshot changes. */
  controller: ChangesController;
  sessionEpoch: string;
  /** Actual watcher registration state for this project session. A stored
   * preference is not enough: manual recovery is hidden only after Rust has
   * confirmed the current epoch is being watched. */
  watcherState: "starting" | "watching" | "off" | "unavailable";
  /** Whether discarding opens the confirmation dialog. Off means the discard
   * runs immediately and reports its result — with an Undo — in the header. */
  confirmBeforeDiscarding: boolean;
  /** Passed straight through to the quick commit box: this panel owns neither
   * the preference nor the save request, only the list the box saves from. */
  runGitHooks: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onSaveCompleted: () => void;
  /** Opens the previewed publish flow: the empty state's primary action when
   * the branch has saved versions the remote does not have yet. */
  onPublishNow: () => void;
  /** Brings the remote's newer versions in through the same previewed flow
   * Overview's "review and get team changes" uses. */
  onGetChanges: () => void;
  /** Asks the remote whether anything newer arrived — the same read-only
   * check Overview and the status bar run. Offered when the last answer was
   * that nothing is waiting: Get project changes would only confirm it. A
   * check that finds newer versions moves this screen to "behind", whose
   * primary action is Get project changes. */
  onCheckRemote: () => void;
  /** A check of the remote is under way for this project. */
  isCheckingRemote?: boolean;
  /** Switches the Work screen to History — the natural next look when there is
   * nothing to review, and a tab away rather than a screen away. */
  onOpenHistory: () => void;
  /** Opens the overlapping-changes screen, offered above the list while any
   * file overlaps rather than a passive note on each such file. */
  onOpenConflicts: () => void;
  /** The repository's head state, so a clean tree can still tell "nothing to
   * send" apart from "nothing saved yet" and from an old version being read. */
  headState?: ChangesEmptyHeadState;
  /** Which file is selected, lifted to the caller so it survives switching
   * away to another project's session and back (see task 012's per-session
   * UI state). `excludedPaths` (the save-version checkbox picks) stays local
   * below — it's a working selection for the *next* save, not something a
   * project session needs to remember across navigation. */
  selectedPath: string | null;
  onSelectedPathChange: (path: string | null) => void;
  onBeginDiscard: () => boolean;
  onDiscardClose: () => void;
  onDiscardPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
  /** A restore finished from another screen — Overview's restore picker —
   * which Changes reports in its header as it arrives, as if its own dialog
   * had run it. The screen reports it handled so it is never shown twice. */
  restoredElsewhere?: DirectDiscardOutcome | null;
  onRestoredElsewhereHandled?: () => void;
  /** Moves whenever another screen's restore picker closed, which may have
   * deleted stored copies: the empty state's way back is read again. */
  recoveriesRevision?: number;
}): React.JSX.Element {
  const { t, formats } = useLanguage();
  const entries = useMemo(() => (workingTree ? getOrderedChangeEntries(workingTree) : []), [workingTree]);
  // Which rows arrive while the screen is open, so the list it opens with is
  // simply there (see `useRowArrival`). Taken from the whole working tree in
  // display order rather than the filtered view: narrowing the list is not a
  // set of arrivals, so a filter change must not animate the rows it reveals.
  const arrivalKeys = useMemo(() => entries.map((entry) => entry.path), [entries]);
  const arrivals = useRowArrival(arrivalKeys, `${projectPath}\0${sessionEpoch}`);
  const [announcement, setAnnouncement] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ChangesFilters>(NO_CHANGES_FILTERS);
  const [discardRequest, setDiscardRequest] = useState<DiscardDialogRequest | null>(null);
  const [contextMenu, setContextMenu] = useState<ChangesContextMenuState | null>(null);
  /* Where a failed reveal lands. The menu is already gone by then — it closes
     on the press, because the result is another application's window — so the
     message needs a surface of its own that outlives it. */
  const [revealError, setRevealError] = useState<string | null>(null);
  /* Only asked while this screen is empty, and only then: with a file list on
     screen the same question is answered when its menu opens, and a screen
     that has something to review does not need to know. */
  const [hasRecoveries, setHasRecoveries] = useState(false);
  const isClean = workingTree?.isClean === true;
  // A clean tree is not one situation, so the block below is chosen from the
  // snapshot rather than written once. See `getChangesEmptyState`.
  const emptyState = workingTree ? getChangesEmptyState(workingTree, headState) : null;
  const emptyContent = useMemo<ChangesEmptyContent | null>(() => {
    if (!emptyState) return null;
    const getChanges: ChangesEmptyAction = {
      key: "get-changes",
      label: t.changesEmptyGetChanges,
      icon: <ArrowDown aria-hidden="true" />,
      onClick: onGetChanges,
    };
    const checkRemote: ChangesEmptyAction = {
      key: "check-remote",
      label: t.changesEmptyCheckRemote,
      icon: <RotateCw aria-hidden="true" />,
      onClick: onCheckRemote,
      busy: isCheckingRemote,
    };
    const viewHistory: ChangesEmptyAction = {
      key: "history",
      label: t.changesEmptyViewHistory,
      icon: <History aria-hidden="true" />,
      onClick: onOpenHistory,
    };
    switch (emptyState.kind) {
      case "ahead":
        return {
          title: t.changesEmptySavedTitle,
          description: t.changesEmptyAheadDescription(emptyState.count),
          primary: {
            key: "publish",
            label: t.changesEmptyPublish(emptyState.count),
            icon: <ArrowUp aria-hidden="true" />,
            onClick: onPublishNow,
          },
          secondary: [checkRemote, viewHistory],
        };
      case "behind":
        return {
          title: t.changesEmptySavedTitle,
          description: t.changesEmptyBehindDescription(emptyState.count),
          primary: getChanges,
          secondary: [viewHistory],
        };
      case "no-remote":
        return {
          title: t.changesEmptyNoRemoteTitle,
          description: t.changesEmptyNoRemoteDescription,
          primary: null,
          secondary: [
            {
              key: "settings",
              label: t.changesEmptyOpenSettings,
              icon: <Settings aria-hidden="true" />,
              onClick: onOpenSettings,
            },
            viewHistory,
          ],
        };
      case "unborn":
        return {
          title: t.changesEmptyUnbornTitle,
          description: t.changesEmptyUnbornDescription,
          primary: null,
          secondary: [],
        };
      case "detached":
        return {
          title: t.changesEmptyDetachedTitle,
          description: t.changesEmptyDetachedDescription,
          primary: null,
          secondary: [viewHistory],
        };
      case "up-to-date":
        return {
          title: t.changesEmptyUpToDateTitle,
          description: t.changesEmptyUpToDateDescription,
          primary: null,
          secondary: [checkRemote, viewHistory],
        };
    }
  }, [emptyState, t, onGetChanges, onCheckRemote, isCheckingRemote, onOpenHistory, onOpenSettings, onPublishNow]);
  useEffect(() => {
    if (!isClean) return undefined;
    let cancelled = false;
    hasStoredRecoveries(controller, projectPath, sessionEpoch)
      .then((value) => { if (!cancelled) setHasRecoveries(value); })
      .catch(() => { if (!cancelled) setHasRecoveries(false); });
    return () => { cancelled = true; };
  }, [controller, isClean, projectPath, sessionEpoch, discardRequest, recoveriesRevision]);
  const directDiscard = useDirectDiscard({
    controller,
    projectPath,
    sessionEpoch,
    t,
    onBegin: onBeginDiscard,
    onFinish: onDiscardClose,
    onMutationCompleted: onSaveCompleted,
    onPhaseChange: onDiscardPhaseChange,
  });
  /** The one place a discard is asked for, whichever menu asked. Restoring
   * keeps its dialog either way: it is a recovery action, and the preference
   * is about being asked before throwing work away. */
  const requestDiscard = (request: DiscardDialogRequest): void => {
    if (request.mode !== "restore" && !confirmBeforeDiscarding) {
      void directDiscard.discard({ mode: request.mode, selectedPath: request.selectedPath });
      return;
    }
    if (onBeginDiscard()) {
      setDiscardRequest(request);
    }
  };
  const reportRef = useRef(directDiscard.report);
  reportRef.current = directDiscard.report;
  useEffect(() => {
    if (restoredElsewhere === null) return;
    onRestoredElsewhereHandled?.();
    reportRef.current(restoredElsewhere);
  }, [restoredElsewhere, onRestoredElsewhereHandled]);
  const store = controller.getStore(projectPath, sessionEpoch, workingTree);
  // Seeded from the cache rather than starting at `idle`: on a remount with a
  // warm cache (navigating back to this screen) that difference is the one
  // frame of empty detail pane between mounting and the effect below running.
  const [diffState, setDiffState] = useState<DiffState>(() => {
    const cached = selectedPath ? store.cache.get(selectedPath) : undefined;
    return cached ? { status: "ready", diff: cached } : { status: "idle" };
  });
  const [retryToken, setRetryToken] = useState(0);
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(() => new Set());
  // The list the user is actually looking at. Selection, the save-version
  // checkboxes, and the totals all keep working off the full `entries`: the
  // search box and the filters narrow what is *shown*, they do not silently
  // drop files from the version being saved.
  const visibleEntries = useMemo(
    () => applyChangesFilters(filterEntriesBySearch(entries, search), filters, excludedPaths),
    [entries, excludedPaths, filters, search],
  );
  // Only the kinds this working tree contains, so the panel never offers an
  // answer that would empty the list on its own.
  const [fileView, setFileView] = useFileListView();
  const { collapsed: collapsedFolders, toggle: toggleFolder, reveal: revealFile } = useCollapsedFolders();
  const inFolders = fileView === "tree";
  const fileRows = useMemo(
    () => (inFolders ? flattenFileTree(visibleEntries, entryPath, collapsedFolders) : flatFileRows(visibleEntries, entryPath)),
    [collapsedFolders, inFolders, visibleEntries],
  );
  // The order a step through the files follows: the order they are drawn in,
  // folded folders included, so the arrows never jump around the tree.
  const orderedEntries = useMemo(
    () => (inFolders
      ? flattenFileTree(visibleEntries, entryPath, NO_COLLAPSED_FOLDERS).flatMap((row) => (row.kind === "file" ? [row.item] : []))
      : visibleEntries),
    [inFolders, visibleEntries],
  );
  const kindsPresent = useMemo(() => changeKindsPresent(entries), [entries]);
  const typesPresent = useMemo(() => fileTypesPresent(entries), [entries]);
  const activeFilterCount = countActiveChangesFilters(filters);
  // Below ~1024px the list and the diff can't sit side by side legibly, so
  // the layout becomes list/detail: this tracks which one is showing.
  const [isDetailFocused, setIsDetailFocused] = useState(false);
  // Preserves the current selection across a refresh when it is still
  // present; otherwise moves to the next available file and announces the
  // material change without stealing focus.
  useEffect(() => {
    const preservesSelection = selectedPath !== null && entries.some((entry) => entry.path === selectedPath);
    const resolved = preservesSelection ? selectedPath : resolveSelectedPath(visibleEntries, null, fileView);
    if (resolved === selectedPath) {
      return;
    }
    onSelectedPathChange(resolved);
    if (resolved) {
      setAnnouncement(t.changesSelectionAnnouncement(resolved));
    }
  }, [entries, fileView, selectedPath, visibleEntries, t, onSelectedPathChange]);

  useEffect(() => {
    if (selectedPath) revealFile(selectedPath);
  }, [revealFile, selectedPath]);

  // Local to this project's session: a switch away and back (or the working
  // tree simply refreshing) must not leave a previous project's checkbox
  // exclusions applied to a different one's file list.
  useEffect(() => {
    setExcludedPaths(new Set());
    setSearch("");
    setFilters(NO_CHANGES_FILTERS);
    // A notice about a file in the project being left would otherwise still be
    // on screen over the one being opened.
    setRevealError(null);
  }, [projectPath]);

  useEffect(() => {
    const available = new Set(entries.map((entry) => entry.path));
    setExcludedPaths((current) => {
      const next = new Set([...current].filter((path) => available.has(path)));
      return next.size === current.size ? current : next;
    });
  }, [entries]);

  // A kind or a type the working tree no longer has is dropped along with the
  // paths, and for the same reason: the panel offers only what is present, so a
  // filter naming something absent could be counted on the trigger and never
  // found in the panel — a narrowed list the reader cannot check. The chips it
  // leaves behind go with it.
  //
  // A tree down to a single file type drops them all, because the panel stops
  // offering that question entirely: one type is nothing to tell apart.
  useEffect(() => {
    const kinds = new Set(entries.map((entry) => entry.category));
    const types = new Set(entries.map((entry) => fileTypeKey(entry.path)));
    setFilters((current) => {
      const categories = current.categories.filter((category) => kinds.has(category));
      const extensions = types.size > 1 ? current.extensions.filter((key) => types.has(key)) : [];
      return categories.length === current.categories.length && extensions.length === current.extensions.length
        ? current
        : { ...current, categories, extensions };
    });
  }, [entries]);

  // Diffs are cached only for the current working-tree snapshot. A refresh or
  // project switch replaces the whole store, while revisiting a file within
  // the same snapshot is instant — including after leaving this screen and
  // coming back, since the store outlives the component. In-flight requests
  // are shared too, avoiding duplicate Git processes when the user switches
  // away and back quickly.
  useEffect(() => {
    if (!selectedPath) {
      setDiffState({ status: "idle" });
      return undefined;
    }

    const cachedDiff = store.cache.get(selectedPath);
    if (cachedDiff) {
      setDiffState({ status: "ready", diff: cachedDiff });
      return undefined;
    }

    let cancelled = false;
    setDiffState({ status: "idle" });
    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) {
        setDiffState({ status: "loading" });
      }
    }, DIFF_LOADING_DELAY_MS);

    controller.fetchDiff(store, selectedPath)
      .then((diff) => {
        if (!cancelled) {
          window.clearTimeout(loadingTimer);
          setDiffState({ status: "ready", diff });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          window.clearTimeout(loadingTimer);
          setDiffState({ status: "error", message: localizeAppError(error, t, t.changesDiffErrorTitle) });
        }
      });
    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [store, projectPath, selectedPath, workingTree, retryToken, t]);

  const isLoadingList = isCheckingChanges && !workingTree;
  const selectedEntry = entries.find((entry) => entry.path === selectedPath) ?? null;

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
  const canChooseFiles = !workingTree?.truncated;
  // The inclusion question goes with the checkboxes it asks about. Past the
  // 1,000-entry cap nothing can be left out, so the panel stops offering it —
  // and a filter set before the tree grew that far would otherwise be counted
  // on the trigger with no capsule left in the panel to undo it.
  useEffect(() => {
    if (canChooseFiles) return;
    setFilters((current) => current.inclusion === "all" ? current : { ...current, inclusion: "all" });
  }, [canChooseFiles]);
  const includedPaths = useMemo(
    () => entries.filter((entry) => !excludedPaths.has(entry.path)).map((entry) => entry.path),
    [entries, excludedPaths],
  );
  const selectedPathsForSave = canChooseFiles ? includedPaths : null;
  const includedCount = canChooseFiles ? includedPaths.length : (workingTree?.counts.total ?? 0);
  const canSaveSelection = includedCount > 0;
  const totalCount = workingTree?.counts.total ?? 0;
  const allSelected = totalCount > 0 && includedCount === totalCount;
  const fileListScrollRef = useRef<HTMLDivElement>(null);
  const quickCommitRef = useRef<QuickCommitBoxHandle>(null);
  // The desktop convention for "save", pointed at the one place this screen
  // saves from: it opens the box and puts the caret in the name field. Only
  // while this screen is the active one, and never from under a dialog —
  // a modal owns the keystroke, and focusing a field behind it would tear
  // the focus out of the trap.
  useActiveScreenEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      quickCommitRef.current?.focus();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);
  // File-to-file navigation walks the list the user can actually see, so
  // "next file" during a search means the next match, not the next file
  // hidden behind the filter.
  const visibleIndex = orderedEntries.findIndex((entry) => entry.path === selectedPath);
  const selectFileAt = (index: number): void => {
    const next = orderedEntries[index];
    if (next) {
      revealFile(next.path);
      onSelectedPathChange(next.path);
    }
  };

  return (
    <div className="changes-view" aria-busy={isCheckingChanges}>
      <ChangesStatusNotice watcherState={watcherState} error={workingTreeError} busy={isCheckingChanges} onRefresh={onRefresh} onOpenSettings={onOpenSettings} t={t} />
      {(workingTree?.counts.conflicted ?? 0) > 0 && (
        <section className="changes-status-notice changes-status-notice--attention">
          <TriangleAlert aria-hidden="true" />
          <div className="changes-status-notice__body">
            <strong>{t.changesConflictsNotice(workingTree?.counts.conflicted ?? 0)}</strong>
          </div>
          <button className="secondary-button" type="button" onClick={onOpenConflicts}>{t.changesConflictsReview}</button>
        </section>
      )}
      <DiscardOutcomeNotice
        outcome={directDiscard.outcome}
        onUndo={directDiscard.undo}
        onDismiss={directDiscard.dismiss}
        t={t}
      />

      {revealError && (
        <div className="changes-notice changes-notice--error" role="status">
          <CircleAlert aria-hidden="true" />
          <p title={revealError}>{revealError}</p>
          <button
            className="changes-notice__dismiss"
            type="button"
            aria-label={t.commonClose}
            onClick={() => setRevealError(null)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      {/* The panel is the card, and the tab pair is its header: the row the
          title used to fill (task 126). It is drawn in every state — loading,
          nothing to review, listing — because it is also the way to History.
          With nothing to review the list panel says so in its state row and
          the empty block moves into the diff panel, where the reading surface
          would be: the tabs stay where the tabs are, at the list column's
          width, rather than stretching across a card that has no list. */}
      <div
        className={`changes-layout${isDetailFocused ? " changes-layout--detail" : ""}${
          !isLoadingList && workingTree?.isClean ? " changes-layout--state" : ""
        }`}
      >
        <nav className="changes-file-list" aria-label={t.changesListAriaLabel}>
          <header className="changes-file-list__header">{tabs}</header>
          {isLoadingList ? (
            <FileListPlaceholder label={t.statusCheckingTitle} />
          ) : !workingTree ? null : workingTree.isClean ? (
            <div className="changes-file-list__state">
              <p className="changes-view__summary">
                <span>{t.changesSummaryClean}</span>
              </p>
            </div>
          ) : (
            <>
              {/* One strip for what is listed: the include-everything checkbox
                  at its head, at the rows' own inset so it reads as the
                  column's first row, the search taking the rest of the width —
                  the shape History's strip has — and the discard/restore `⋯`
                  at its end. A step quieter than the
                  header above it, the way History's inner panes step down from
                  their panel. The breakdown and the line totals that used to
                  sit beside the checkbox are gone: the Journey band and the
                  status bar already say them, and a partial selection is the
                  checkbox's own indeterminate state and the save box's plan
                  ("3 of 7 files → main"). */}
              <div className="changes-file-list__toolbar">
                <span className="changes-file-list__select-all">
                  {canChooseFiles ? (
                    <InclusionNode
                      className="changes-file-row__pick"
                      checked={allSelected}
                      indeterminate={includedCount > 0 && includedCount < totalCount}
                      label={allSelected ? t.changesSelectNone : t.changesSelectAll}
                      onChange={() =>
                        allSelected
                          ? setExcludedPaths(new Set(entries.map((entry) => entry.path)))
                          : setExcludedPaths(new Set())
                      }
                    />
                  ) : (
                    <InclusionNode
                      className="changes-file-row__pick"
                      checked
                      disabled
                      label={t.changesPartialUnavailableTruncated}
                      tooltip={t.changesPartialUnavailableTruncated}
                      onChange={() => {}}
                    />
                  )}
                </span>
                <SearchBox
                  value={search}
                  onChange={setSearch}
                  placeholder={t.changesSearchPlaceholder}
                  ariaLabel={t.changesSearchAriaLabel}
                  clearLabel={t.commonClearSearch}
                  trailing={<>
                    <ChangesFilterPanel
                      filters={filters}
                      kinds={kindsPresent}
                      types={typesPresent}
                      canChooseFiles={canChooseFiles}
                      onChange={setFilters}
                      t={t}
                    />
                    <FileViewToggle view={fileView} onChange={setFileView} t={t} />
                  </>}
                />
                {/* What can be done to the listed changes without saving them
                    — discard, or bring discarded work back — at the strip's
                    trailing end. It sat inside the save box for a while, which
                    put a destructive menu in the primary control; up here it
                    acts on the list it heads, a panel's height away from Save.
                    It opens its own confirmation before anything is discarded. */}
                <ChangesActionsMenu
                  controller={controller}
                  projectPath={projectPath}
                  sessionEpoch={sessionEpoch}
                  selectedPath={selectedPath}
                  disabled={isCheckingChanges}
                  onChoose={requestDiscard}
                  t={t}
                />
              </div>
              <ChangesFilterChips filters={filters} onChange={setFilters} t={t} />
              <div
                {...autoHideScrollbarProps<HTMLDivElement>()}
                ref={fileListScrollRef}
                className="changes-file-list__scroll auto-hide-scrollbar"
              >
                {workingTree.truncated && (
                  <p className="changes-file-list__truncated" role="status">
                    {t.statusTruncatedNote(entries.length)}
                  </p>
                )}
                {/* An empty list has to say why it is empty and offer the way
                    back. The search box carries its own clear control in the
                    strip above; the filters do not, so the one that can strand a
                    reader here offers its own undo. */}
                {visibleEntries.length === 0 && (
                  <div className="empty-line changes-file-list__empty" role="status">
                    <p>{activeFilterCount > 0 ? t.changesNoFilterMatches : t.changesNoSearchMatches}</p>
                    {activeFilterCount > 0 && (
                      <button
                        className="secondary-button secondary-button--sm"
                        type="button"
                        onClick={() => setFilters(NO_CHANGES_FILTERS)}
                      >
                        {t.changesFiltersClear}
                      </button>
                    )}
                  </div>
                )}
                <FileListRows
                  rows={fileRows}
                  inFolders={inFolders}
                  formats={formats}
                  onToggleFolder={toggleFolder}
                  onToggleFolderIncluded={(folderEntries, include) =>
                    setExcludedPaths((current) => {
                      const next = new Set(current);
                      for (const entry of folderEntries) {
                        if (include) next.delete(entry.path); else next.add(entry.path);
                      }
                      return next;
                    })
                  }
                  arrivals={arrivals}
                  selectedPath={selectedPath}
                  excludedPaths={excludedPaths}
                  canChoose={canChooseFiles}
                  scrollElement={fileListScrollRef}
                  onSelect={(entry) => {
                    onSelectedPathChange(entry.path);
                    setIsDetailFocused(true);
                  }}
                  onToggleIncluded={(entry) =>
                    setExcludedPaths((current) => {
                      const next = new Set(current);
                      if (next.has(entry.path)) {
                        next.delete(entry.path);
                      } else {
                        next.add(entry.path);
                      }
                      return next;
                    })
                  }
                  onContextMenu={(event, entry) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setContextMenu({
                      kind: "file",
                      x: event.clientX,
                      y: event.clientY,
                      path: entry.path,
                      category: entry.category,
                      focusTarget: event.currentTarget,
                    });
                  }}
                  t={t}
                />
              </div>
              {/* The foot: the save box, the one place a version is saved
                  from this screen, docked under the files it saves. Nothing
                  destructive shares it — the discard/restore `⋯` heads the
                  list in the strip above. */}
              <div className="changes-file-list__foot">
                <QuickCommitBox
                  ref={quickCommitRef}
                  projectPath={projectPath}
                  sessionEpoch={sessionEpoch}
                  selectedPaths={selectedPathsForSave}
                  canSave={canSaveSelection}
                  runHooks={runGitHooks}
                  remoteLabel={workingTree.upstream.upstream}
                  fileListRef={fileListScrollRef}
                  onSaveCompleted={onSaveCompleted}
                  onPublishNow={onPublishNow}
                />
              </div>
            </>
          )}
        </nav>
        {!isLoadingList && workingTree?.isClean && emptyContent ? (
          <div className="changes-diff changes-diff--state">
            <div className="empty-state empty-state--success changes-empty">
              <div className="empty-state__icon" aria-hidden="true">
                <CheckCircle2 />
              </div>
              <h2>{emptyContent.title}</h2>
              <p>{emptyContent.description}</p>
              <div className="changes-empty__actions">
                {emptyContent.primary && (
                  <button
                    className="primary-button changes-empty__primary"
                    type="button"
                    onClick={emptyContent.primary.onClick}
                  >
                    {emptyContent.primary.icon}
                    {emptyContent.primary.label}
                  </button>
                )}
                {emptyContent.secondary.length > 0 && (
                  <div className="changes-empty__secondary">
                    {emptyContent.secondary.map((action) => (
                      <button
                        key={action.key}
                        className="secondary-button"
                        type="button"
                        onClick={action.onClick}
                        disabled={action.busy}
                        aria-busy={action.busy || undefined}
                      >
                        {action.busy ? <LoaderCircle aria-hidden="true" className="icon--spinning" /> : action.icon}
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
                {/* Discarding everything empties this screen, and the file list
                    takes the menu that reaches stored copies with it. Without this
                    the way back would exist only while there was still something
                    to review — which is exactly when nobody needs it. */}
                {hasRecoveries && (
                  <button className="ghost-button" type="button" onClick={() => requestDiscard({ mode: "restore", selectedPath: null })}>
                    <RotateCcw aria-hidden="true" />
                    {t.changesRestoreDiscarded}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : !isLoadingList && workingTree ? (
          <DiffWorkspace
            projectPath={projectPath}
            sessionEpoch={sessionEpoch}
            controller={controller}
            selectedPath={selectedPath}
            entry={selectedEntry}
            diffState={diffState}
            filePosition={visibleIndex + 1}
            fileTotal={visibleEntries.length}
            onSelectPreviousFile={() => selectFileAt(visibleIndex - 1)}
            onSelectNextFile={() => selectFileAt(visibleIndex + 1)}
            onRetry={() => setRetryToken((token) => token + 1)}
            onBackToList={() => setIsDetailFocused(false)}
            onCodeContextMenu={openCodeContextMenu}
            t={t}
          />
        ) : (
          <div className="changes-diff" />
        )}
      </div>

      <span className="visually-hidden" role="status">
        {announcement}
      </span>

      <React.Suspense fallback={null}>
        <ChangesContextMenu
          context={contextMenu}
          onClose={closeContextMenu}
          onCopied={() => setAnnouncement(t.changesCopied)}
          onDiscard={(path) => {
            closeContextMenu(false);
            requestDiscard({ mode: "selected", selectedPath: path });
          }}
          onReveal={(path) => {
            setRevealError(null);
            void controller.revealFile(projectPath, sessionEpoch, path)
              .catch((error: unknown) => setRevealError(localizeAppError(error, t, t.changesRevealFailed)));
          }}
          t={t}
        />
      </React.Suspense>

      <React.Suspense fallback={null}>
        <DiscardChangesDialog
          request={discardRequest}
          projectPath={projectPath}
          sessionEpoch={sessionEpoch}
          controller={controller}
          onClose={() => { setDiscardRequest(null); onDiscardClose(); }}
          onMutationCompleted={onSaveCompleted}
          onPhaseChange={onDiscardPhaseChange}
          onFinished={directDiscard.report}
        />
      </React.Suspense>
    </div>
  );
}
