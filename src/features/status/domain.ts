export type ChangeCategory = "changed" | "new" | "deleted" | "renamed" | "conflicted";

export type WorkingTreeEntry = {
  path: string;
  originalPath: string | null;
  category: ChangeCategory;
  isPrepared: boolean;
  hasUnpreparedChanges: boolean;
};

export type WorkingTreeCounts = Record<ChangeCategory, number> & { total: number };

/** Added and removed line counts across the working tree. `null` means the
 * total could not be trusted, not that it is zero. */
export type LineTotals = { added: number; removed: number };

export type WorkingTreeStatus = {
  isClean: boolean;
  counts: WorkingTreeCounts;
  lineTotals: LineTotals | null;
  entries: WorkingTreeEntry[];
  truncated: boolean;
  hasPreparedChanges: boolean;
  hasUnpreparedChanges: boolean;
  upstream: { branch: string | null; upstream: string | null; ahead: number; behind: number };
  /** Git's markers say an operation is paused, even with nothing left
   * overlapping. Optional only so fixtures that predate it stay valid; Rust
   * always sends it. */
  pausedOperation?: boolean;
};

export type WorkingTreeSummary = {
  tone: "positive" | "attention" | "neutral";
  headlineKey: "statusCleanTitle" | "statusChangesTitle" | "statusConflictsTitle";
  total: number;
  conflicted: number;
};

export const CATEGORY_ORDER: ChangeCategory[] = ["conflicted", "changed", "new", "deleted", "renamed"];

export function getOrderedChangeEntries(status: WorkingTreeStatus): WorkingTreeEntry[] {
  const rank = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));
  return [...status.entries].sort((a, b) => (rank.get(a.category) ?? 99) - (rank.get(b.category) ?? 99));
}

export function splitPath(path: string): { name: string; dir: string | null } {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? { name: path, dir: null } : { name: path.slice(slash + 1), dir: path.slice(0, slash) };
}

export function getWorkingTreeSummary(status: WorkingTreeStatus): WorkingTreeSummary {
  const conflicted = status.counts.conflicted;
  if (conflicted > 0) {
    return { tone: "attention", headlineKey: "statusConflictsTitle", total: status.counts.total, conflicted };
  }
  if (status.counts.total === 0) {
    return { tone: "positive", headlineKey: "statusCleanTitle", total: 0, conflicted: 0 };
  }
  return { tone: "neutral", headlineKey: "statusChangesTitle", total: status.counts.total, conflicted: 0 };
}

export function getWorkingTreeBreakdown(status: WorkingTreeStatus): { category: ChangeCategory; count: number }[] {
  return CATEGORY_ORDER.map((category) => ({ category, count: status.counts[category] })).filter(({ count }) => count > 0);
}

export function workingTreeSnapshotsEqual(left: WorkingTreeStatus | null, right: WorkingTreeStatus): boolean {
  if (left === right) return true;
  if (!left || left.isClean !== right.isClean || left.truncated !== right.truncated ||
      left.hasPreparedChanges !== right.hasPreparedChanges ||
      left.hasUnpreparedChanges !== right.hasUnpreparedChanges || left.entries.length !== right.entries.length) return false;
  if ((left.lineTotals === null) !== (right.lineTotals === null)) return false;
  if (left.lineTotals && right.lineTotals &&
      (left.lineTotals.added !== right.lineTotals.added || left.lineTotals.removed !== right.lineTotals.removed)) return false;
  for (const category of [...CATEGORY_ORDER, "total"] as const) {
    if (left.counts[category] !== right.counts[category]) return false;
  }
  if (left.upstream.branch !== right.upstream.branch || left.upstream.upstream !== right.upstream.upstream ||
      left.upstream.ahead !== right.upstream.ahead || left.upstream.behind !== right.upstream.behind) return false;
  return left.entries.every((entry, index) => {
    const other = right.entries[index];
    return entry.path === other.path && entry.originalPath === other.originalPath && entry.category === other.category &&
      entry.isPrepared === other.isPrepared && entry.hasUnpreparedChanges === other.hasUnpreparedChanges;
  });
}
