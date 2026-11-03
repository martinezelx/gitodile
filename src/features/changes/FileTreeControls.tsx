import React from "react";
import { ChevronRight, Folder, FolderOpen, List, ListTree } from "lucide-react";

import { formatNumber, type LocaleFormats } from "../../shared/i18n";
import type { Translations } from "../../i18n";
import { CATEGORY_ORDER, type ChangeCategory } from "../status";
import type { FileListView, FileTreeRow } from "./fileTree";

/** The file lists' layout switch, seated after the rule in the list's search
 * pill, beside Filters: what stands there acts on the list, not on what is
 * typed. One control, not a segmented pair — the Changes strip already carries
 * the select-all box, the pill and `⋯` in ~300px. It shows the layout in use and
 * turns to the other; pressed (in the accent) while the list is in folders. */
export function FileViewToggle({ view, onChange, t }: {
  view: FileListView;
  onChange: (view: FileListView) => void;
  t: Translations;
}): React.JSX.Element {
  const inFolders = view === "tree";
  const label = inFolders ? t.changesFileViewShowList : t.changesFileViewShowFolders;
  return (
    <button
      className={`filter-control__trigger file-view-toggle${inFolders ? " filter-control__trigger--active" : ""}`}
      type="button"
      aria-pressed={inFolders}
      aria-label={t.changesFileViewFolders}
      data-tooltip={label}
      onClick={() => onChange(inFolders ? "list" : "tree")}
    >
      {inFolders ? <ListTree aria-hidden="true" /> : <List aria-hidden="true" />}
    </button>
  );
}

/** The kinds of change under a folder, in the order the list ranks them, so a
 * folded folder still says what is inside it. */
function categoriesIn(files: ReadonlyArray<{ category: ChangeCategory }>): ChangeCategory[] {
  const present = new Set(files.map((file) => file.category));
  return CATEGORY_ORDER.filter((category) => present.has(category));
}

/** A folder row's indentation and guides: one step per folder above it, with
 * a hairline at each step, drawn by the row rather than by nested elements so
 * a virtualized list can place it anywhere. */
export function treeIndentStyle(depth: number): React.CSSProperties {
  return { "--tree-depth": depth } as React.CSSProperties;
}

/** A folder in a file tree: the caret, the folder, its name (a compacted
 * chain prints as `src/features/history`), then how many files it holds and,
 * while it is folded, which kinds of change they are: an open folder's files
 * say their own kind below it. The button folds and unfolds it; `←` and
 * `→` do the same from the keyboard, the way every tree answers them.
 *
 * `leading` is what a host puts before it — Changes' include box. */
export function FileTreeFolderButton<T extends { category: ChangeCategory }>({ row, formats, onToggle, t }: {
  row: Extract<FileTreeRow<T>, { kind: "folder" }>;
  formats: LocaleFormats;
  onToggle: (path: string, expanded: boolean) => void;
  t: Translations;
}): React.JSX.Element {
  const count = formatNumber(row.files.length, formats);
  const kinds = categoriesIn(row.files);
  return (
    <button
      className="file-tree-folder"
      type="button"
      aria-expanded={row.expanded}
      aria-label={t.changesFolderLabel(row.label, row.files.length)}
      title={row.path}
      onClick={() => onToggle(row.path, !row.expanded)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" && !row.expanded) { event.preventDefault(); onToggle(row.path, true); }
        if (event.key === "ArrowLeft" && row.expanded) { event.preventDefault(); onToggle(row.path, false); }
      }}
    >
      <ChevronRight className={`file-tree-folder__caret${row.expanded ? " file-tree-folder__caret--open" : ""}`} aria-hidden="true" />
      {row.expanded ? <FolderOpen className="file-tree-folder__icon" aria-hidden="true" /> : <Folder className="file-tree-folder__icon" aria-hidden="true" />}
      <span className="file-tree-folder__name">{row.label}</span>
      <span className="file-tree-folder__summary" aria-hidden="true">
        {!row.expanded && (
          <span className="file-tree-folder__kinds">
            {kinds.map((kind) => <span key={kind} className={`file-tree-folder__kind file-tree-folder__kind--${kind}`} />)}
          </span>
        )}
        <span className="file-tree-folder__count">{count}</span>
      </span>
    </button>
  );
}
