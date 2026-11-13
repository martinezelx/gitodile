import { useRef, useState } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { Translations } from "../../i18n";
import { autoHideScrollbarProps, FilterCapsule, FilterCapsules, FilterChips, FilterGroup, FilterPanel, FilterSwitch, type FilterChip } from "../../shared/ui";
import { conflictExtension, NO_CONFLICT_FILTERS, type ConflictFile, type ConflictFilters } from "./domain";

function extensionLabel(extension: string, t: Translations): string {
  return extension ? `.${extension}` : t.changesFilterTypeNone;
}

export function ConflictFilterPanel({ files, filters, onChange, t }: {
  files: readonly ConflictFile[];
  filters: ConflictFilters;
  onChange: (filters: ConflictFilters) => void;
  t: Translations;
}): React.JSX.Element {
  const counts = new Map<string, number>();
  for (const file of files) {
    const extension = conflictExtension(file.path);
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
  }
  // A selected type stays removable when an invalidation removes its last file.
  for (const extension of filters.extensions) if (!counts.has(extension)) counts.set(extension, 0);
  return <FilterPanel
    activeCount={Number(filters.status !== "all") + filters.extensions.length}
    labels={{ open: t.changesFiltersLabel, active: t.changesFiltersActive, activeCount: t.changesFiltersActiveCount, clear: t.changesFiltersClear }}
    onClear={() => onChange(NO_CONFLICT_FILTERS)}
  >
    <FilterGroup label={t.conflictsFilterStatus}>
      <FilterCapsules>
        {(["all", "pending", "resolved"] as const).map((status) => <FilterCapsule
          key={status} name="conflict-status" checked={filters.status === status}
          onChange={() => onChange({ ...filters, status })}
        >{status === "all" ? t.conflictsFilterAll : status === "pending" ? t.conflictsFilterPending : t.conflictsFilterResolved}</FilterCapsule>)}
      </FilterCapsules>
    </FilterGroup>
    <FilterGroup label={t.changesFilterTypeLabel}>
      <ExtensionOptions counts={[...counts].sort(([a], [b]) => a.localeCompare(b))} filters={filters} onChange={onChange} t={t} />
    </FilterGroup>
  </FilterPanel>;
}

/** An arbitrary project can have an arbitrary number of extensions. Keyboard
 * traversal scrolls the next checkbox into the bounded viewport before focus. */
function ExtensionOptions({ counts, filters, onChange, t }: {
  counts: [string, number][];
  filters: ConflictFilters;
  onChange: (filters: ConflictFilters) => void;
  t: Translations;
}): React.JSX.Element {
  const scroll = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(0);
  const virtual = useVirtualizer({
    count: counts.length, getScrollElement: () => scroll.current,
    estimateSize: () => 32, overscan: 3, initialRect: { width: 280, height: 192 },
    rangeExtractor: (range) => [...new Set([...defaultRangeExtractor(range), Math.min(focused, counts.length - 1)])].filter((index) => index >= 0).sort((a, b) => a - b),
  });
  return <div ref={scroll} {...autoHideScrollbarProps<HTMLDivElement>()} className="conflicts-filter-types auto-hide-scrollbar"
    style={{ height: Math.min(virtual.getTotalSize(), 192) }}
    onKeyDown={(event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>("[data-type-index]");
      if (!row || !["ArrowUp", "ArrowDown", "Home", "End", "Tab"].includes(event.key)) return;
      const index = Number(row.dataset.typeIndex);
      const next = event.key === "Home" ? 0 : event.key === "End" ? counts.length - 1
        : index + (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 1);
      if (next < 0 || next >= counts.length) return;
      event.preventDefault();
      event.stopPropagation();
      setFocused(next);
      virtual.scrollToIndex(next);
      requestAnimationFrame(() => scroll.current?.querySelector<HTMLInputElement>(`[data-type-index="${next}"] input`)?.focus());
    }}>
    <div className="conflicts-filter-types__rows" style={{ height: virtual.getTotalSize() }}>
      {virtual.getVirtualItems().map((row) => {
        const [extension, count] = counts[row.index]!;
        return <div key={extension} data-type-index={row.index} className="conflicts-filter-types__row"
          style={{ height: row.size, transform: `translateY(${row.start}px)` }} onFocus={() => setFocused(row.index)}>
          <FilterSwitch label={extensionLabel(extension, t)} count={count} checked={filters.extensions.includes(extension)}
            onChange={() => onChange({ ...filters, extensions: filters.extensions.includes(extension)
              ? filters.extensions.filter((value) => value !== extension) : [...filters.extensions, extension] })} />
        </div>;
      })}
    </div>
  </div>;
}

export function ConflictFilterChips({ filters, onChange, t }: {
  filters: ConflictFilters;
  onChange: (filters: ConflictFilters) => void;
  t: Translations;
}): React.JSX.Element | null {
  const chips: FilterChip[] = [];
  if (filters.status !== "all") chips.push({
    key: "status", label: filters.status === "pending" ? t.conflictsFilterPending : t.conflictsFilterResolved,
    onRemove: () => onChange({ ...filters, status: "all" }),
  });
  for (const extension of filters.extensions) chips.push({
    key: `extension:${extension}`, label: extensionLabel(extension, t),
    onRemove: () => onChange({ ...filters, extensions: filters.extensions.filter((value) => value !== extension) }),
  });
  return <FilterChips chips={chips} removeLabel={t.changesFilterRemove} />;
}
