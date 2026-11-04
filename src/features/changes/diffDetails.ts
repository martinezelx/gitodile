import { diffWordsWithSpace, type ChangeObject } from "diff";
import type { DiffHunk, DiffLine } from "./domain";

/** UTF-16 offsets, matching string slices and syntax/search token positions. */
export type DiffRange = { start: number; end: number };

/** The bound on one word comparison: past it, a pair keeps its whole-block marks. */
export const WORD_DIFF_LIMITS = { maxEditLength: 128, timeout: 4 };

/** What a word comparison removed from the first text and added to the second. */
export function changedWordRanges(changes: readonly ChangeObject<string>[]): { oldRanges: DiffRange[]; newRanges: DiffRange[] } {
  let oldOffset = 0;
  let newOffset = 0;
  const oldRanges: DiffRange[] = [];
  const newRanges: DiffRange[] = [];
  for (const part of changes) {
    if (part.removed) oldRanges.push({ start: oldOffset, end: oldOffset + part.value.length });
    if (part.added) newRanges.push({ start: newOffset, end: newOffset + part.value.length });
    if (!part.added) oldOffset += part.value.length;
    if (!part.removed) newOffset += part.value.length;
  }
  return { oldRanges, newRanges };
}

/** Progressive detail only: the original diff remains the authority. Pair the
 * same consecutive removed/added runs as split view, never across context or
 * hunks. Hard limits plus a shared time budget keep this off the hot scroll path. */
export function buildDiffDetails(hunks: readonly DiffHunk[]): ReadonlyMap<DiffLine, readonly DiffRange[]> {
  const result = new Map<DiffLine, DiffRange[]>();
  const started = performance.now();
  let pairs = 0;
  let characters = 0;
  for (const hunk of hunks) {
    let removed: DiffLine[] = [];
    let added: DiffLine[] = [];
    const flush = (): void => {
      // A standalone spacing-only row has no counterpart, but its invisible
      // content is the entire change and should still be readable.
      const paired = Math.min(removed.length, added.length);
      for (const run of [removed, added]) {
        for (let index = paired; index < run.length; index += 1) {
          const line = run[index];
          if (result.size >= 512 || performance.now() - started > 20) break;
          if (line.content.length <= 4096 && characters + line.content.length <= 65_536 && /^[ \t]+$/.test(line.content)) {
            characters += line.content.length;
            result.set(line, [{ start: 0, end: line.content.length }]);
          }
        }
      }
      for (let index = 0; index < Math.min(removed.length, added.length); index += 1) {
        if (result.size >= 512 || ++pairs > 256 || performance.now() - started > 20) break;
        const before = removed[index];
        const after = added[index];
        const size = before.content.length + after.content.length;
        characters += size;
        if (size > 4096 || characters > 65_536 || before.content === after.content) continue;
        const changes = diffWordsWithSpace(before.content, after.content, WORD_DIFF_LIMITS);
        // Unrelated lines already have whole-row colour. Avoid suggesting an
        // exact correspondence where the only shared content is punctuation.
        if (!changes || (before.content.trim() !== after.content.trim() &&
          !changes.some((part) => !part.added && !part.removed && /[\p{L}\p{N}]/u.test(part.value)))) continue;
        const { oldRanges, newRanges } = changedWordRanges(changes);
        const requiredEntries = Number(oldRanges.length > 0) + Number(newRanges.length > 0);
        if (result.size + requiredEntries <= 512) {
          if (oldRanges.length) result.set(before, oldRanges);
          if (newRanges.length) result.set(after, newRanges);
        }
      }
      removed = [];
      added = [];
    };
    for (const line of hunk.lines) {
      if (line.kind === "deletion") removed.push(line);
      else if (line.kind === "addition") added.push(line);
      else flush();
    }
    flush();
    if (result.size >= 512 || pairs > 256 || characters > 65_536 || performance.now() - started > 20) break;
  }
  return result;
}
