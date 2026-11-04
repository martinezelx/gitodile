import type { FileDiff, ImagePreview, MarkdownPreview } from "../changes";
import type { HistoryPage, SavedVersionDetail } from "./domain";

export type HistoryQuery = { projectId: string; sessionEpoch: string };

/** Which history is being read.
 *
 * Deliberately not a `HistoryFilters` field. The scope chooses the graph and a
 * filter narrows it, and the two are cleared by different gestures: clearing
 * every filter must not quietly walk the reader back to the current branch.
 *
 * `branch` means "the history reachable from that branch's tip", never "the commits
 * that belong to that branch". A commit reachable from five branches belongs to all
 * of them, so nothing downstream may stamp the chosen name onto a row. */
export type HistoryScope =
  | { kind: "currentBranch" }
  | { kind: "branch"; name: string }
  | { kind: "allBranches" };

export const CURRENT_BRANCH_SCOPE: HistoryScope = { kind: "currentBranch" };
export const ALL_BRANCHES_SCOPE: HistoryScope = { kind: "allBranches" };

export function sameHistoryScope(left: HistoryScope, right: HistoryScope): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind !== "branch" || left.name === (right as { name: string }).name;
}

/** The branch a scope names, or `null` when it names none. */
export function scopeBranchName(scope: HistoryScope): string | null {
  return scope.kind === "branch" ? scope.name : null;
}

/** What the timeline has been narrowed to.
 *
 * Every field is answered by Rust as an argument to the same `git log` that
 * pages the history, never by a predicate over the versions the client is
 * holding: a filter that reads the loaded page stops telling the truth as soon
 * as the history is longer than the page. Dates are calendar days
 * (`YYYY-MM-DD`); `path` is repository-relative. */
export type HistoryFilters = {
  author: string | null;
  since: string | null;
  until: string | null;
  path: string | null;
  noMerges: boolean;
  unpublishedOnly: boolean;
  taggedOnly: boolean;
};

export const NO_HISTORY_FILTERS: HistoryFilters = {
  author: null,
  since: null,
  until: null,
  path: null,
  noMerges: false,
  unpublishedOnly: false,
  taggedOnly: false,
};

export function countActiveFilters(filters: HistoryFilters): number {
  return [
    filters.author,
    filters.since,
    filters.until,
    filters.path,
    filters.noMerges || null,
    filters.unpublishedOnly || null,
    filters.taggedOnly || null,
  ].filter(Boolean).length;
}

export function sameHistoryFilters(left: HistoryFilters, right: HistoryFilters): boolean {
  return left.author === right.author
    && left.since === right.since
    && left.until === right.until
    && left.path === right.path
    && left.noMerges === right.noMerges
    && left.unpublishedOnly === right.unpublishedOnly
    && left.taggedOnly === right.taggedOnly;
}

export type HistoryPageRequest = HistoryQuery & {
  cursor?: string;
  pageSize?: number;
  filters?: HistoryFilters;
  scope?: HistoryScope;
};
export type SavedVersionRequest = HistoryQuery & { snapshotToken: string; commit: string };
export type SavedVersionFileRequest = SavedVersionRequest & { filePath: string };
/** No snapshot token: a picture is read straight from the two commits, and
 * neither of them can change under a token the way a moving branch tip can. */
export type SavedVersionImageRequest = HistoryQuery & {
  commit: string;
  filePath: string;
  originalPath: string | null;
};

export interface HistoryPort {
  readPage(request: HistoryPageRequest): Promise<HistoryPage>;
  readDetail(request: SavedVersionRequest): Promise<SavedVersionDetail>;
  readFileDiff(request: SavedVersionFileRequest): Promise<FileDiff>;
  readFileMarkdown(request: SavedVersionFileRequest): Promise<MarkdownPreview>;
  readImagePreview(request: SavedVersionImageRequest): Promise<ImagePreview>;
}
