import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronsUpDown, FileQuestion, FileWarning, Pencil, TriangleAlert } from "lucide-react";

import type { Translations } from "../../i18n";
import { autoHideScrollbarProps } from "../../shared/ui";
import type { DiffHunk, DiffLine, FileDiff } from "./domain";
import { PictureDiffBody, type PictureDiff } from "./pictureDiff";
import { DIFF_CODE_FONT_STACKS, useDiffPreferences } from "./diffPreferences";
import { applyIgnoreWhitespace } from "./ignoreWhitespace";
import { buildDiffDetails, type DiffRange } from "./diffDetails";
import { decorateDiffLine } from "./DiffLineContent";

type HighlightLine = (line: string) => React.ReactNode;

function highlightSearchMatches(line: string, query: string): React.ReactNode {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return line;
  const normalizedLine = line.toLocaleLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let match = normalizedLine.indexOf(normalizedQuery);
  while (match >= 0) {
    if (match > cursor) parts.push(line.slice(cursor, match));
    parts.push(<mark className="diff-search-match" key={`${match}-${parts.length}`}>{line.slice(match, match + normalizedQuery.length)}</mark>);
    cursor = match + normalizedQuery.length;
    match = normalizedLine.indexOf(normalizedQuery, cursor);
  }
  if (cursor < line.length) parts.push(line.slice(cursor));
  return parts.length ? parts : line;
}

/** `enabled: false` skips the dynamic import entirely rather than importing
 * and discarding the result: turning highlighting off should also stop
 * fetching the chunk that does it. */
function useSyntaxHighlight(filePath: string, enabled: boolean): HighlightLine | null {
  const [highlight, setHighlight] = useState<HighlightLine | null>(null);
  useEffect(() => {
    let cancelled = false;
    setHighlight(null);
    if (!enabled) {
      return undefined;
    }
    void import("./syntaxHighlight").then((module) => {
      const language = module.detectSyntaxLanguage(filePath);
      if (!cancelled && language) {
        setHighlight(() => (line: string) => module.highlightSyntaxLine(line, language));
      }
    }).catch(() => {
      // Progressive enhancement: readable plain text is already rendered.
    });
    return () => { cancelled = true; };
  }, [filePath, enabled]);
  return highlight;
}

function formatByteLimit(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
}
function EmptyDiffNote({
  icon,
  title,
  description,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  tone?: "neutral" | "attention";
}): React.JSX.Element {
  return (
    <div className={`changes-diff__note changes-diff__note--${tone}`}>
      <div className="changes-diff__note-icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

/* Memoized, as is `DiffSplitCell`: the virtualizer re-renders the body on every
   scroll step, and each row's props are stable, so without it every visible
   line was tokenized again per frame (task 209). */
const DiffLineRow = React.memo(function DiffLineRow({ line, highlight, ranges, edges, t }: { line: DiffLine; highlight: HighlightLine | null; ranges?: readonly DiffRange[]; edges: string; t: Translations }): React.JSX.Element {
  const label =
    line.kind === "addition" ? t.changesLineAddedLabel : line.kind === "deletion" ? t.changesLineRemovedLabel : null;
  // One column, not two: a context line's old and new numbers are often the
  // same (or a line apart), so showing both read as the number appearing
  // twice. The new-file number is the meaningful one for context/additions;
  // a deletion has no new number, so it falls back to the old one.
  const lineNumber = line.newLineNumber ?? line.oldLineNumber;

  return (
    <div className={`diff-line diff-line--${line.kind}${edges}`}>
      <span className="diff-line__number">{lineNumber ?? ""}</span>
      <span className="diff-line__marker" aria-hidden="true" />
      {label && <span className="visually-hidden">{label}</span>}
      <span className="diff-line__content">{decorateDiffLine(highlight ? highlight(line.content) : line.content, ranges)}</span>
    </div>
  );
});

/** The run of unchanged lines sitting between this hunk and the previous one
 * (or the start of the file, for the first hunk) — computed from the same
 * `oldStart`/`oldLines` fields Rust already provides, so no raw `@@ -a,b +c,d
 * @@` syntax needs to reach a beginner-facing screen.
 *
 * Both coordinate systems are carried, not just the count: the gap has to be
 * *fetched* to be expanded, and the file on disk is the new side, while the
 * expanded lines still need old-side numbers to render like any other context
 * line. The two starts differ by however much the hunks above added or
 * removed. */
export type HunkGap = { hiddenLines: number; oldStart: number; newStart: number };

/** Stable identity so the memo below does not see a new array every render for
 * the diff kinds that carry no hunks at all. */
const EMPTY_HUNKS: DiffHunk[] = [];

export function gapBeforeHunk(hunk: DiffHunk, previousHunk: DiffHunk | null): HunkGap {
  const previousOldEnd = previousHunk ? previousHunk.oldStart + previousHunk.oldLines : 1;
  const previousNewEnd = previousHunk ? previousHunk.newStart + previousHunk.newLines : 1;
  return {
    hiddenLines: Math.max(0, hunk.oldStart - previousOldEnd),
    oldStart: previousOldEnd,
    newStart: previousNewEnd,
  };
}

/** Lines already pulled in for one gap, keyed by hunk index. Expansion is
 * incremental: the backend caps how much one request may return, so a very
 * large gap fills in over repeated clicks and `lines.length` doubles as the
 * offset the next request starts from. */
export type GapExpansion = { lines: string[] };
export type GapExpansions = Record<number, GapExpansion>;

/** Turns the part of a gap that has been fetched into ordinary context rows.
 * They are indistinguishable from the context lines Git itself supplied,
 * which is the point: an expanded gap should read as more of the same file,
 * not as a separate pasted-in region. */
function expandedGapLines(gap: HunkGap, expansion: GapExpansion): DiffLine[] {
  return expansion.lines.map((content, offset) => ({
    kind: "context" as const,
    content,
    oldLineNumber: gap.oldStart + offset,
    newLineNumber: gap.newStart + offset,
  }));
}

/** One renderable row of a diff: either the "N unchanged lines" marker that
 * opens a hunk, or a single line within it. Flattening every hunk into one
 * list of rows (rather than nesting them, as the DOM used to) is what makes
 * the list virtualizable below — a virtualizer needs one flat, indexable
 * sequence of same-shaped items, not a tree. */
export type DiffRow =
  | { kind: "marker"; hunkIndex: number; hiddenLines: number; gap: HunkGap }
  | { kind: "line"; hunkIndex: number; line: DiffLine };

export function flattenDiffRows(hunks: DiffHunk[], expansions: GapExpansions = {}): DiffRow[] {
  const rows: DiffRow[] = [];
  hunks.forEach((hunk, hunkIndex) => {
    const gap = gapBeforeHunk(hunk, hunks[hunkIndex - 1] ?? null);
    if (gap.hiddenLines > 0) {
      const expansion = expansions[hunkIndex];
      if (expansion) {
        for (const line of expandedGapLines(gap, expansion)) {
          rows.push({ kind: "line", hunkIndex, line });
        }
      }
      // Whatever is still unfetched keeps its marker, so a gap too big for
      // one request stays expandable instead of stopping half-open with no
      // way forward.
      const remaining = gap.hiddenLines - (expansion?.lines.length ?? 0);
      if (remaining > 0) {
        rows.push({ kind: "marker", hunkIndex, hiddenLines: remaining, gap });
      }
    }
    for (const line of hunk.lines) {
      rows.push({ kind: "line", hunkIndex, line });
    }
  });
  return rows;
}

/** A row is the first of its hunk when nothing before it in `rows` shares
 * the same `hunkIndex` — used to draw the dashed separator between hunks
 * that DOM nesting (one `.diff-hunk` wrapper per hunk) used to provide for
 * free via a `.diff-hunk + .diff-hunk` sibling selector. Flattening for
 * virtualization means every row is now a sibling, so that boundary has to
 * be marked per-row instead. */
export function isFirstRowOfHunk(rows: { hunkIndex: number }[], index: number): boolean {
  return index === 0 || rows[index - 1].hunkIndex !== rows[index].hunkIndex;
}

type DiffRunEdge = "run-start" | "run-end" | "joined-before" | "joined-after";

/** Where a row's gutter capsule opens and closes. A run is a contiguous
 * stretch of one change kind in one column of one hunk; unified view has one
 * column and split view two. In unified view a removal directly followed by
 * its addition joins it instead, so one capsule flows across the boundary. */
export function diffRunEdges(rows: readonly (DiffRow | SplitRow)[], index: number, column: 0 | 1 = 0): DiffRunEdge[] {
  const kindAt = (at: number): DiffLine["kind"] | null => {
    const row = rows[at];
    if (!row || row.hunkIndex !== rows[index].hunkIndex) return null;
    const line = row.kind === "line" ? row.line : row.kind === "pair" ? (column === 0 ? row.left : row.right) : null;
    return line && line.kind !== "context" ? line.kind : null;
  };
  const kind = kindAt(index);
  if (!kind) return [];
  const unified = rows[index].kind === "line";
  const previous = kindAt(index - 1);
  const next = kindAt(index + 1);
  const edges: DiffRunEdge[] = [];
  if (previous !== kind) edges.push(unified && kind === "addition" && previous === "deletion" ? "joined-after" : "run-start");
  if (next !== kind) edges.push(unified && kind === "deletion" && next === "addition" ? "joined-before" : "run-end");
  return edges;
}

type VisualDiffViewMode = "unified" | "split";
export type DiffViewMode = VisualDiffViewMode | "accessible";

/** Plain-text representation of every loaded diff row. Unlike the visual
 * virtualizer, this is one complete document, so assistive technology,
 * find-in-page and ordinary text selection can reach the whole diff. */
export function formatDiffAsAccessibleText(hunks: DiffHunk[]): string {
  return hunks
    .map((hunk) => [
      hunk.header,
      ...hunk.lines.map((line) => `${line.kind === "addition" ? "+" : line.kind === "deletion" ? "-" : " "}${line.content}`),
    ].join("\n"))
    .join("\n\n");
}

/** The plain-text view honors the same reading preferences as the virtualized
 * one — a tab width that only applied to two views out of three would be a
 * setting that quietly does not hold. */
function AccessibleDiffText({ hunks, t }: { hunks: DiffHunk[]; t: Translations }): React.JSX.Element {
  const { tabWidth, wrapLines, codeFont } = useDiffPreferences();
  return (
    <pre
      {...autoHideScrollbarProps<HTMLPreElement>()}
      className={`diff-code diff-code--accessible auto-hide-scrollbar${wrapLines ? " diff-code--accessible-wrap" : ""}`}
      style={{ tabSize: tabWidth, "--diff-code-font": DIFF_CODE_FONT_STACKS[codeFont] } as React.CSSProperties}
      tabIndex={0}
      aria-label={t.changesViewAccessibleAriaLabel}
    >
      <code>{formatDiffAsAccessibleText(hunks)}</code>
    </pre>
  );
}

/** One row of the side-by-side view: the same "N unchanged lines" marker the
 * unified view uses, or a pair of cells. A pair is one context line shown in
 * both columns, or a deletion opposite the addition that replaced it — with
 * `null` on either side when one run is longer than the other. */
export type SplitRow =
  | { kind: "marker"; hunkIndex: number; hiddenLines: number; gap: HunkGap }
  | {
      kind: "pair";
      hunkIndex: number;
      left: DiffLine | null;
      right: DiffLine | null;
    };

/** Pairs each run of deletions with the run of additions that follows it,
 * which is what makes a side-by-side diff readable: an edited line and its
 * replacement land on the same row instead of one below the other. Runs are
 * flushed at every context line (and at the end of a hunk), so an unbalanced
 * edit — three lines replaced by one — leaves empty cells rather than pairing
 * across an unrelated section of the file. */
export function buildSplitRows(hunks: DiffHunk[], expansions: GapExpansions = {}): SplitRow[] {
  const rows: SplitRow[] = [];
  hunks.forEach((hunk, hunkIndex) => {
    const gap = gapBeforeHunk(hunk, hunks[hunkIndex - 1] ?? null);
    if (gap.hiddenLines > 0) {
      const expansion = expansions[hunkIndex];
      if (expansion) {
        // An unchanged line is identical on both sides, so it fills the row.
        for (const line of expandedGapLines(gap, expansion)) {
          rows.push({ kind: "pair", hunkIndex, left: line, right: line });
        }
      }
      const remaining = gap.hiddenLines - (expansion?.lines.length ?? 0);
      if (remaining > 0) {
        rows.push({ kind: "marker", hunkIndex, hiddenLines: remaining, gap });
      }
    }
    let deletions: DiffLine[] = [];
    let additions: DiffLine[] = [];
    const flush = (): void => {
      const pairCount = Math.max(deletions.length, additions.length);
      for (let index = 0; index < pairCount; index += 1) {
        rows.push({
          kind: "pair",
          hunkIndex,
          left: deletions[index] ?? null,
          right: additions[index] ?? null,
        });
      }
      deletions = [];
      additions = [];
    };
    for (const line of hunk.lines) {
      if (line.kind === "deletion") {
        deletions.push(line);
      } else if (line.kind === "addition") {
        additions.push(line);
      } else {
        flush();
        rows.push({ kind: "pair", hunkIndex, left: line, right: line });
      }
    }
    flush();
  });
  return rows;
}

/** Index of the row that opens each hunk, so the toolbar's change navigation
 * can scroll straight to it. The opening row is the "N unchanged lines"
 * marker when there is one — it reads as the change's own heading — and the
 * first line of the hunk otherwise. */
export function getHunkStartRows(rows: { hunkIndex: number }[], hunkCount: number): number[] {
  const starts: number[] = new Array(hunkCount).fill(-1);
  rows.forEach((row, index) => {
    if (starts[row.hunkIndex] === -1) {
      starts[row.hunkIndex] = index;
    }
  });
  return starts;
}

/** Starting guesses for `useVirtualizer`. `measureElement` corrects each row
 * once it has actually rendered, so these only have to be close — but "close"
 * matters more than it looks: every row the virtualizer has not measured yet
 * is placed using its estimate, so a systematically wrong estimate offsets
 * everything below it and the list visibly re-shuffles as real measurements
 * arrive.
 *
 * That is exactly what a flat per-line guess used to cause here. `.diff-line__content`
 * is `white-space: pre-wrap` with `overflow-wrap: anywhere` (it was `pre` when
 * this estimate was written), so a long line wraps onto two or three visual
 * lines and is two or three times taller than a one-line guess. The diff is
 * monospace, though, which makes the real height computable rather than
 * guessable: see `estimateLineRows`.
 *
 * A gap marker is the one row whose height that arithmetic cannot reach: it
 * is a chip in a proportional font with its own padding and margins, so its
 * height is a fact about the CSS, not about the text. Restating that fact as
 * a constant is what left this estimate 7.25px short of the 39.25px a marker
 * really occupies, which the rows below it then overlapped. So the constant
 * below is only what the very first frame uses; `markerRowHeight` replaces it
 * with the height of the first marker that actually renders, and every later
 * marker is estimated from that. Move the chip's padding or margin and the
 * estimate follows on its own. */
const FALLBACK_MARKER_ROW_HEIGHT = 40;
/** Seed for `metrics.lineHeight`, used only until `readMetrics` reads the real
 * value off the element — which happens in a `useLayoutEffect`, so before the
 * first paint. `.diff-code` sets `font-size: var(--text-label)` and
 * `line-height: var(--leading-code)`, and this is their product.
 *
 * Written as the arithmetic rather than as the answer because the answer is
 * what rots: this said 20, "matching the CSS's `font: 12.5px/1.6`", through a
 * move to 13px and then to the type scale's 12px — two sizes the diff has not
 * had for some time. `styleComposition.test.ts` now checks the two factors
 * against the tokens, so the next scale change fails the build here instead of
 * leaving a stale number behind a stale comment. */
const FALLBACK_LINE_HEIGHT = 12 * 1.6;
/** Everything in `.diff-line` that isn't the content column: the 48px number
 * gutter and 16px marker column from its `grid-template-columns`, plus its own
 * 16px `padding-right`. Kept in sync with that rule in styles.css. */
const DIFF_CONTENT_GUTTER = 80;

/** Advance width of one character, per resolved font. The diff is monospace,
 * so a single sample describes every glyph — which is what lets the estimate
 * below be arithmetic instead of a guess.
 *
 * Measured with a throwaway span *inside* the diff element rather than via
 * canvas: it inherits the real font that way (no shorthand to rebuild and
 * keep in sync), and it goes through the same layout path that will actually
 * wrap the lines. Sampled over many characters so sub-pixel advances don't
 * round away. Cached because a resize would otherwise force a layout on
 * every frame of a drag.
 *
 * Only once the font has loaded, though. The key is the font as CSS names it,
 * which is the same string while `font-display: swap` is still painting the
 * fallback, so a width cached then was the fallback's for the rest of the
 * session — no later re-measure could replace it. */
const SAMPLE_TEXT = "0".repeat(100);
const charWidthByFont = new Map<string, number>();

/** Whether every face `font` names has finished loading. `document.fonts` is
 * absent in some test environments, and a shorthand it cannot parse throws;
 * either way there is nothing to wait for. */
function isFontLoaded(font: string): boolean {
  try {
    return document.fonts?.check(font) ?? true;
  } catch {
    return true;
  }
}

export function measureCharWidth(element: HTMLElement, font: string, letterSpacing: string): number {
  const fontKey = `${font} ${letterSpacing}`;
  const cached = charWidthByFont.get(fontKey);
  if (cached !== undefined) {
    return cached;
  }
  const probe = document.createElement("span");
  probe.textContent = SAMPLE_TEXT;
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre;pointer-events:none";
  element.appendChild(probe);
  const width = probe.getBoundingClientRect().width / SAMPLE_TEXT.length;
  probe.remove();
  if (width > 0 && isFontLoaded(font)) {
    charWidthByFont.set(fontKey, width);
  }
  return width;
}

const COMBINING_MARK = /\p{Mark}/u;
const EXTENDED_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

/** Terminal-style display width for the exceptional glyphs that invalidate
 * JavaScript string length as a wrapping estimate. The ordinary source-code
 * path stays one column per code point; combining marks and joiners consume
 * none, while CJK/full-width characters and emoji consume two. */
function codePointColumns(symbol: string): number {
  const codePoint = symbol.codePointAt(0) ?? 0;
  if (
    COMBINING_MARK.test(symbol) ||
    codePoint === 0x200d ||
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  ) {
    return 0;
  }
  if (
    EXTENDED_PICTOGRAPHIC.test(symbol) ||
    (codePoint >= 0x1100 &&
      (codePoint <= 0x115f ||
        codePoint === 0x2329 ||
        codePoint === 0x232a ||
        (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
        (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
        (codePoint >= 0xff00 && codePoint <= 0xff60) ||
        (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
        (codePoint >= 0x1b000 && codePoint <= 0x1ffff) ||
        (codePoint >= 0x20000 && codePoint <= 0x3fffd)))
  ) {
    return 2;
  }
  return 1;
}

/** Everything in a `.diff-split-row` that isn't one of its two content
 * columns: two 40px number gutters, two 14px marker columns, the divider
 * between the halves, and the row's own right padding. Kept in sync with
 * `.diff-split-row`'s `grid-template-columns` in styles.css. */
const DIFF_SPLIT_CONTENT_GUTTER = 125;

/** How many visual rows a pre-wrapped diff line is likely to occupy before
 * the browser can measure it. This deliberately models tabs and Unicode
 * display columns instead of using UTF-16 `string.length`; the live DOM
 * measurement remains authoritative because font fallback can still vary.
 *
 * It also wraps where the browser does. `pre-wrap` breaks after a space and
 * lets the spaces hang past the edge, and `overflow-wrap: anywhere` splits a
 * word only when it cannot fit on a row of its own. Filling every row to the
 * last column instead ignored the gap a word leaves when it moves down, which
 * on a long line of imports added up to a whole row the estimate never
 * counted. A wide glyph is a break opportunity of its own, as CJK text is. */
export function estimateLineRows(content: string, charsPerLine: number, tabSize = 8): number {
  if (charsPerLine <= 0) {
    return 1;
  }
  let rows = 1;
  let column = 0;
  // Reused rather than reallocated per word: this runs for every row of the
  // file on each re-estimate.
  const word: number[] = [];
  let wordColumns = 0;
  const placeWord = (): void => {
    if (wordColumns === 0) return;
    if (column > 0 && column + wordColumns > charsPerLine) {
      rows += 1;
      column = 0;
    }
    if (column + wordColumns <= charsPerLine) {
      column += wordColumns;
    } else {
      // Longer than a whole row: only now does it break inside the word.
      for (const width of word) {
        if (column > 0 && column + width > charsPerLine) {
          rows += 1;
          column = 0;
        }
        column += width;
      }
    }
    word.length = 0;
    wordColumns = 0;
  };
  for (const symbol of content) {
    if (symbol === " " || symbol === "\t") {
      placeWord();
      // Hangs at the end of a row rather than wrapping, so it only pushes
      // the next word down.
      column += symbol === "\t" ? Math.max(1, tabSize - (column % tabSize)) : 1;
      continue;
    }
    const width = codePointColumns(symbol);
    if (width === 0) continue;
    if (width > 1) placeWord();
    word.push(width);
    wordColumns += width;
    if (width > 1) placeWord();
  }
  placeWord();
  return rows;
}

/** Display columns one unwrapped line occupies, using the same tab expansion
 * and Unicode widths as `estimateLineRows`. With wrapping off, this is what
 * decides how wide the scrollable area has to be. */
export function lineColumns(content: string, tabSize: number): number {
  let column = 0;
  for (const symbol of content) {
    column += symbol === "\t" ? Math.max(1, tabSize - (column % tabSize)) : codePointColumns(symbol);
  }
  return column;
}

/** The widest line in each geometry, in display columns.
 *
 * Absolutely positioned rows contribute nothing to their container's
 * intrinsic size, so with wrapping off the container cannot size itself to its
 * widest row — it has to be told. Without that every row falls back to the
 * viewport width: short rows stop painting their background partway across the
 * scrollable area, and the split view's divider lands wherever each row's own
 * content happens to end, which is a different place on every row. */
export function widestRowColumns(
  rows: Array<DiffRow | SplitRow>,
  tabSize: number,
): { unified: number; split: number } {
  let unified = 0;
  let split = 0;
  for (const row of rows) {
    if (row.kind === "line") {
      unified = Math.max(unified, lineColumns(row.line.content, tabSize));
    } else if (row.kind === "pair") {
      if (row.left) split = Math.max(split, lineColumns(row.left.content, tabSize));
      if (row.right) split = Math.max(split, lineColumns(row.right.content, tabSize));
    }
  }
  return { unified, split };
}

export function measureDiffRowHeight(element: HTMLElement): number {
  return element.getBoundingClientRect().height +
    (Number.parseFloat(window.getComputedStyle(element).marginTop) || 0);
}

/** Renders only the diff rows currently scrolled into view (plus a small
 * overscan buffer), instead of the whole file's worth of DOM nodes at once.
 * A large file with thousands of changed lines (this codebase's own
 * `lib.rs` is a good stress test) would otherwise force the browser to lay
 * out and paint every line up front just to show the first screenful,
 * which is the actual source of "it's a bit laggy to open" — not the Git
 * read, which the caching/prefetch/batching above already made fast. */
const DiffSplitCell = React.memo(function DiffSplitCell({
  ranges,
  line,
  side,
  highlight,
  edges,
  t,
}: {
  ranges?: readonly DiffRange[];
  line: DiffLine | null;
  edges: string;
  side: "old" | "new";
  highlight: HighlightLine | null;
  t: Translations;
}): React.JSX.Element {
  if (!line) {
    // A cell with no counterpart still has to occupy its two grid columns, or
    // the row's other half slides across the divider.
    return (
      <>
        <span className="diff-line__number diff-line__number--empty" />
        <span className="diff-split-cell diff-split-cell--empty" />
      </>
    );
  }
  const label =
    line.kind === "addition" ? t.changesLineAddedLabel : line.kind === "deletion" ? t.changesLineRemovedLabel : null;
  const lineNumber = side === "old" ? line.oldLineNumber : line.newLineNumber;
  return (
    <>
      <span className="diff-line__number">{lineNumber ?? ""}</span>
      <span className={`diff-split-cell diff-split-cell--${line.kind}${edges}`}>
        <span className="diff-line__marker" aria-hidden="true" />
        {label && <span className="visually-hidden">{label}</span>}
        <span className="diff-line__content">{decorateDiffLine(highlight ? highlight(line.content) : line.content, ranges)}</span>
      </span>
    </>
  );
});

/** The "Show N unchanged lines" control that opens a gap between hunks.
 * A button rather than a static caption because the lines behind it are
 * genuinely fetchable — the diff never carried them, so this is the only way
 * to read the code around a change without leaving the app. */
function GapMarker({
  hiddenLines,
  state,
  onExpand,
  t,
}: {
  hiddenLines: number;
  state: "idle" | "loading" | "error";
  /** `null` when this diff's gaps can't be fetched — the marker then stays
   * the caption it always was, rather than offering an action that would
   * either do nothing or show the wrong lines. */
  onExpand: (() => void) | null;
  t: Translations;
}): React.JSX.Element {
  if (!onExpand) {
    return <div className="diff-hunk__marker diff-hunk__marker--static">{t.changesDiffHiddenLines(hiddenLines)}</div>;
  }
  return (
    <div className="diff-hunk__marker">
      <button
        type="button"
        className="diff-hunk__expand"
        onClick={onExpand}
        disabled={state === "loading"}
        aria-label={t.changesDiffShowHiddenLines(hiddenLines)}
      >
        <ChevronsUpDown aria-hidden="true" />
        {state === "loading" ? t.commonLoading : t.changesDiffShowHiddenLines(hiddenLines)}
      </button>
      {state === "error" && (
        <span className="diff-hunk__expand-error" role="alert">
          {t.changesDiffExpandFailed}
        </span>
      )}
    </div>
  );
}

function DiffHunkList({
  hunks,
  projectPath,
  sessionEpoch,
  readFileLines,
  filePath,
  viewMode,
  hunkTarget,
  searchQuery,
  comparison,
  t,
}: {
  comparison: { before: string; after: string };
  hunks: DiffHunk[];
  /** Both needed to fetch a gap's lines: they are not in the diff at all.
   * A `null` project path means this diff isn't expandable — see
   * `DiffResultView`'s note. */
  projectPath: string | undefined;
  sessionEpoch?: string;
  readFileLines?: (filePath: string, startLine: number, endLine: number) => Promise<{ startLine: number; lines: string[]; truncated: boolean }>;
  filePath: string;
  viewMode: VisualDiffViewMode;
  /** The hunk the toolbar last navigated to. `token` (rather than the index
   * alone) is what makes a repeated press of the same button scroll again
   * instead of silently doing nothing because the index did not change. */
  hunkTarget: { index: number; token: number };
  searchQuery: string;
  t: Translations;
}): React.JSX.Element {
  const preferences = useDiffPreferences();
  const { wrapLines, tabWidth, codeFont } = preferences;
  const highlight = useSyntaxHighlight(filePath, preferences.syntaxHighlighting);
  // Which gaps the user has opened, and how far. Keyed by hunk index, so it
  // survives switching view modes (both builders read the same map) but is
  // reset per file below — an expansion describes one file's gaps and means
  // nothing for the next one.
  const [expansions, setExpansions] = useState<GapExpansions>({});
  const [expandingHunk, setExpandingHunk] = useState<number | null>(null);
  const [expandError, setExpandError] = useState<number | null>(null);
  // Read inside the request's `.then`, so a response that lands after the
  // user has moved to another file can be recognized as stale. Without it
  // the effect below would clear the expansions on the file switch and the
  // late response would immediately re-fill them — showing one file's lines
  // inside another's diff, indistinguishable from real context.
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;

  useEffect(() => {
    setExpansions({});
    setExpandingHunk(null);
    setExpandError(null);
  }, [filePath]);

  const expandGap = (hunkIndex: number, gap: HunkGap): void => {
    if (projectPath === undefined || !sessionEpoch || !readFileLines || expandingHunk !== null) {
      return;
    }
    const requestedPath = filePath;
    const alreadyLoaded = expansions[hunkIndex]?.lines.length ?? 0;
    setExpandingHunk(hunkIndex);
    setExpandError(null);
    readFileLines(requestedPath, gap.newStart + alreadyLoaded, gap.newStart + gap.hiddenLines - 1)
      .then((result) => {
        if (filePathRef.current !== requestedPath) {
          return;
        }
        setExpansions((current) => ({
          ...current,
          [hunkIndex]: { lines: [...(current[hunkIndex]?.lines ?? []), ...result.lines] },
        }));
      })
      .catch(() => {
        // Deliberately not localized through `localizeAppError`: this is a
        // one-line note inside a diff row, not a screen-level failure, and
        // the only useful next step is "try again", which the button still is.
        if (filePathRef.current === requestedPath) {
          setExpandError(hunkIndex);
        }
      })
      .finally(() => setExpandingHunk(null));
  };

  const details = useMemo(() => buildDiffDetails(hunks), [hunks]);
  const rows = useMemo(
    () => (viewMode === "split" ? buildSplitRows(hunks, expansions) : flattenDiffRows(hunks, expansions)),
    [hunks, viewMode, expansions],
  );
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const renderHighlight = useMemo<HighlightLine | null>(
    () => normalizedSearch ? (line) => highlightSearchMatches(line, normalizedSearch) : highlight,
    [highlight, normalizedSearch],
  );
  const hunkStartRows = useMemo(() => getHunkStartRows(rows, hunks.length), [rows, hunks.length]);
  const scrollRef = useRef<HTMLPreElement>(null);
  /** What a gap-marker row really costs, learned from the first one that
   * renders. See `FALLBACK_MARKER_ROW_HEIGHT`. */
  const [markerRowHeight, setMarkerRowHeight] = useState(FALLBACK_MARKER_ROW_HEIGHT);
  /** Where lines wrap, and how tall a wrapped line is — both read from the
   * live element rather than hardcoded, so the estimate follows the CSS and
   * the pane's current width (the sidebar collapsing changes both). Split
   * view halves the space a line has, so it gets its own wrap point rather
   * than reusing the unified one. */
  const [metrics, setMetrics] = useState({
    charsPerLine: 0,
    splitCharsPerLine: 0,
    lineHeight: FALLBACK_LINE_HEIGHT,
    tabSize: 8,
    charWidth: 0,
  });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const readMetrics = (): void => {
      const style = window.getComputedStyle(element);
      const charWidth = measureCharWidth(element, style.font, style.letterSpacing);
      const parsedLineHeight = Number.parseFloat(style.lineHeight);
      const parsedTabSize = Number.parseFloat(style.tabSize);
      const contentWidth = element.clientWidth - DIFF_CONTENT_GUTTER;
      const splitContentWidth = (element.clientWidth - DIFF_SPLIT_CONTENT_GUTTER) / 2;
      setMetrics((previous) => {
        const next = {
          // A wrap point of 0 makes `estimateLineRows` return 1 for every
          // line, which is exactly right when nothing wraps.
          charsPerLine:
            wrapLines && charWidth > 0 && contentWidth > 0 ? Math.floor(contentWidth / charWidth) : 0,
          splitCharsPerLine:
            wrapLines && charWidth > 0 && splitContentWidth > 0 ? Math.floor(splitContentWidth / charWidth) : 0,
          lineHeight: Number.isFinite(parsedLineHeight) ? parsedLineHeight : FALLBACK_LINE_HEIGHT,
          tabSize: Number.isFinite(parsedTabSize) && parsedTabSize > 0 ? parsedTabSize : 8,
          charWidth,
        };
        // Bail out on no-op resizes: this runs from a ResizeObserver, and
        // setting state unconditionally there would loop.
        return previous.charsPerLine === next.charsPerLine &&
          previous.splitCharsPerLine === next.splitCharsPerLine &&
          previous.lineHeight === next.lineHeight &&
          previous.tabSize === next.tabSize &&
          previous.charWidth === next.charWidth
          ? previous
          : next;
      });
    };

    readMetrics();
    const observer = new ResizeObserver(readMetrics);
    observer.observe(element);
    /* A bundled face is requested only when a rule first uses it, and
       `font-display: swap` paints the fallback until it arrives. The swap
       changes character width without resizing anything, so the measurement
       taken above can be the fallback's. Re-measure once the font set has
       settled, and again whenever a face finishes loading: `ready` can settle
       before the face is even requested, since the request only starts once
       the diff's text is laid out in it. `document.fonts` is absent in some
       test environments, so its absence has to be survivable rather than
       assumed away. */
    let isCurrent = true;
    void document.fonts?.ready.then(() => {
      if (isCurrent) {
        readMetrics();
      }
    });
    document.fonts?.addEventListener("loadingdone", readMetrics);
    return () => {
      isCurrent = false;
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", readMetrics);
    };
    // `tabWidth` and `codeFont` are read back off the computed style rather
    // than used directly, so they have to re-run this — changing either
    // resizes nothing, so the ResizeObserver never fires.
  }, [wrapLines, tabWidth, codeFont]);

  /* Only needed with wrapping off, and skipped entirely otherwise: it walks
     every loaded line, which is wasted work when the rows are viewport-wide
     by definition. */
  const widest = useMemo(
    () => (wrapLines ? { unified: 0, split: 0 } : widestRowColumns(rows, metrics.tabSize)),
    [rows, wrapLines, metrics.tabSize],
  );
  const splitColumnWidth = Math.ceil(widest.split * metrics.charWidth);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (row.kind === "marker") {
        return markerRowHeight;
      }
      if (row.kind === "line") {
        return estimateLineRows(row.line.content, metrics.charsPerLine, metrics.tabSize) * metrics.lineHeight;
      }
      // A split row is as tall as its taller half.
      const visualRows = Math.max(
        row.left ? estimateLineRows(row.left.content, metrics.splitCharsPerLine, metrics.tabSize) : 1,
        row.right ? estimateLineRows(row.right.content, metrics.splitCharsPerLine, metrics.tabSize) : 1,
      );
      return visualRows * metrics.lineHeight;
    },
    // `getBoundingClientRect` excludes margins, so without this the 12px
    // `margin-top` on `.diff-row--hunk-start` is missing from every measured
    // hunk boundary and the rows below it drift up by that much per hunk.
    measureElement: measureDiffRowHeight,
    overscan: 12,
  });

  // A new wrap point invalidates every estimate, including rows already
  // measured at the old width.
  useLayoutEffect(() => {
    virtualizer.measure();
    // `measure()` empties the size cache, and nothing refills it for the rows
    // that are already on screen: they are still observed, but their height
    // did not change, so their `ResizeObserver` never fires again and the
    // measurement is simply gone. The list then runs on estimates for good —
    // which is why the marker rows kept a 32px estimate against a 39.25px
    // chip no matter how many times they were measured. Handing the mounted
    // rows back is what makes measurement stick.
    //
    // Only once the positions are rebuilt, though. `measure()` leaves them
    // holding the old sizes until something reads them, and `resizeItem`
    // compares each new measurement against those positions: a row whose
    // height survived the resize compared equal, was never written back, and
    // the rebuild that followed placed it at its estimate — a long wrapped
    // line estimated a row short overlapped the next one until it scrolled
    // out. Reading the measurements first puts the estimates there, so every
    // row that differs from its estimate is recorded. `getTotalSize` is the
    // public read that rebuilds them; `getMeasurements` itself is private.
    virtualizer.getTotalSize();
    const mounted = scrollRef.current?.querySelectorAll<HTMLElement>(".diff-row[data-index]");
    mounted?.forEach((element) => virtualizer.measureElement(element));
  }, [metrics.charsPerLine, metrics.splitCharsPerLine, metrics.lineHeight, metrics.tabSize, viewMode, markerRowHeight]);

  /** `virtualizer.measureElement` for every row, plus one extra job on a
   * marker row: report what it measured, so the estimate for the markers
   * further down the file stops being a guess after the first one renders. */
  const measureRow = useCallback((element: HTMLDivElement | null): void => {
    virtualizer.measureElement(element);
    if (element?.dataset.rowKind !== "marker") {
      return;
    }
    const height = measureDiffRowHeight(element);
    if (height > 0) {
      setMarkerRowHeight((current) => (current === height ? current : height));
    }
  }, [virtualizer]);

  // `hunkStartRows` moves whenever the row list does — including when a gap
  // is expanded, which inserts rows. Reading it through a ref keeps it out of
  // the effect's dependencies: only an explicit navigation (a new `token`) or
  // a view-mode switch should scroll. With it as a dependency, expanding a
  // gap re-ran this and yanked the view back to the last change the toolbar
  // pointed at — the opposite of what someone who just asked to read the
  // lines above it wants.
  const hunkStartRowsRef = useRef(hunkStartRows);
  hunkStartRowsRef.current = hunkStartRows;

  // Scrolls to whichever change the toolbar last pointed at. `scrollToIndex`
  // rather than a DOM lookup because the target row is usually not rendered
  // yet — that is the whole point of virtualizing the list.
  useEffect(() => {
    const rowIndex = hunkStartRowsRef.current[hunkTarget.index];
    if (rowIndex === undefined || rowIndex < 0) {
      return;
    }
    virtualizer.scrollToIndex(rowIndex, { align: "start" });
  }, [hunkTarget.token, viewMode]);

  // The change the arrows stand on, until they move or the diff does: a hunk's
  // index means another change once the file is read again. Opening a file
  // stands on nothing, though its first change is the one counted.
  const [currentHunk, setCurrentHunk] = useState<number | null>(null);
  const previousNavigation = useRef({ filePath, token: hunkTarget.token });
  useEffect(() => {
    const previous = previousNavigation.current;
    previousNavigation.current = { filePath, token: hunkTarget.token };
    setCurrentHunk(previous.filePath !== filePath || previous.token === hunkTarget.token || hunkTarget.token === 0 ? null : hunkTarget.index);
  }, [filePath, hunkTarget.token, hunks]);

  useEffect(() => {
    if (!normalizedSearch) return;
    const matchIndex = rows.findIndex((row) => {
      if (row.kind === "marker") return false;
      if (row.kind === "line") return row.line.content.toLocaleLowerCase().includes(normalizedSearch);
      return Boolean(
        row.left?.content.toLocaleLowerCase().includes(normalizedSearch) ||
        row.right?.content.toLocaleLowerCase().includes(normalizedSearch),
      );
    });
    if (matchIndex >= 0) virtualizer.scrollToIndex(matchIndex, { align: "center" });
  }, [normalizedSearch, rows, virtualizer]);

  return (
    <>
    {viewMode === "split" && <div className="diff-comparison-headings">
      <div><strong>{t.changesDiffBefore}</strong><span>{comparison.before}</span></div>
      <div><strong>{t.changesDiffAfter}</strong><span>{comparison.after}</span></div>
    </div>}
    <pre
      {...autoHideScrollbarProps<HTMLPreElement>()}
      className={`diff-code auto-hide-scrollbar${wrapLines ? "" : " diff-code--nowrap"}`}
      // One shared column width for both halves, so the divider sits in the
      // same place on every row instead of following each row's own content.
      style={
        {
          tabSize: tabWidth,
          "--diff-code-font": DIFF_CODE_FONT_STACKS[codeFont],
          "--diff-split-column": `${splitColumnWidth}px`,
        } as React.CSSProperties
      }
      tabIndex={0}
      ref={scrollRef}
    >
      <code
        style={{
          display: "block",
          position: "relative",
          height: virtualizer.getTotalSize(),
          // Absolutely positioned rows cannot size their container, so the
          // scrollable width is stated here. Without it every row falls back
          // to the viewport and the diff comes apart as soon as it is
          // scrolled sideways.
          minWidth: wrapLines
            ? undefined
            : viewMode === "split"
              ? DIFF_SPLIT_CONTENT_GUTTER + 2 * splitColumnWidth
              : DIFF_CONTENT_GUTTER + widest.unified * metrics.charWidth,
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          // The "N unchanged lines" chip already signals the jump between
          // hunks on its own, so the dashed hunk-start border is reserved for
          // a line row that opens a hunk directly (no marker before it) —
          // applying it to the marker row too stacked its own vertical
          // margin with the border's `padding-top`, pushing the chip down
          // and off-center on every hunk after the first.
          const isHunkStart = row.kind !== "marker" && row.hunkIndex > 0 && isFirstRowOfHunk(rows, virtualRow.index);
          const current = row.hunkIndex === currentHunk && (row.kind === "line" ? row.line.kind !== "context" : row.kind === "pair" &&
            (row.left?.kind === "deletion" || row.right?.kind === "addition"));
          const edgeClasses = (block: string, column: 0 | 1): string =>
            diffRunEdges(rows, virtualRow.index, column).map((edge) => ` ${block}--${edge}`).join("");
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              data-row-kind={row.kind === "marker" ? "marker" : undefined}
              ref={measureRow}
              className={`diff-row${isHunkStart ? " diff-row--hunk-start" : ""}${current ? " diff-row--current" : ""}`}
              style={{ position: "absolute", top: 0, left: 0, transform: `translateY(${virtualRow.start}px)` }}
            >
              {row.kind === "marker" ? (
                <GapMarker
                  hiddenLines={row.hiddenLines}
                  state={
                    expandingHunk === row.hunkIndex
                      ? "loading"
                      : expandError === row.hunkIndex
                        ? "error"
                        : "idle"
                  }
                  onExpand={projectPath === undefined ? null : () => expandGap(row.hunkIndex, row.gap)}
                  t={t}
                />
              ) : row.kind === "line" ? (
                <DiffLineRow line={row.line} ranges={details.get(row.line)} highlight={renderHighlight} edges={edgeClasses("diff-line", 0)} t={t} />
              ) : (
                <div className="diff-split-row">
                  <DiffSplitCell line={row.left} ranges={row.left ? details.get(row.left) : undefined} side="old" highlight={renderHighlight} edges={edgeClasses("diff-split-cell", 0)} t={t} />
                  <DiffSplitCell line={row.right} ranges={row.right ? details.get(row.right) : undefined} side="new" highlight={renderHighlight} edges={edgeClasses("diff-split-cell", 1)} t={t} />
                </div>
              )}
            </div>
          );
        })}
      </code>
    </pre>
    </>
  );
}

export function DiffResultView({
  diff,
  projectPath,
  sessionEpoch,
  readFileLines,
  picture,
  viewMode = "unified",
  hunkTarget = { index: 0, token: 0 },
  searchQuery = "",
  comparison,
  t,
}: {
  diff: FileDiff;
  /** Truthful side context supplied by the surface that owns the comparison. */
  comparison?: { before: string; after: string };
  /** Enables expanding the unchanged gaps between hunks, which reads the
   * file from the working tree. Omitted by callers showing a *saved*
   * commit's diff (see `pendingVersions`), where the file on disk may no
   * longer match what that version recorded — there the gap markers stay
   * plain captions rather than offering lines that could be wrong. */
  projectPath?: string;
  sessionEpoch?: string;
  readFileLines?: (filePath: string, startLine: number, endLine: number) => Promise<{ startLine: number; lines: string[]; truncated: boolean }>;
  /** The changed picture this file is, from `usePictureDiff`. The surface
   * owns it because its controls belong in the surface's own toolbar; here it
   * only says what to draw. Absent — a caller that cannot say which two
   * versions to compare — leaves an image with the plain "can't be previewed
   * as text" note and an SVG with its text diff. */
  picture?: PictureDiff | null;
  viewMode?: DiffViewMode;
  hunkTarget?: { index: number; token: number };
  /** Highlights matches and scrolls the visual diff to the first one. */
  searchQuery?: string;
  t: Translations;
}): React.JSX.Element {
  const { ignoreWhitespace } = useDiffPreferences();
  const sourceHunks = "hunks" in diff ? diff.hunks : EMPTY_HUNKS;
  // Applied once here rather than inside each view, so both of them — and the
  // "nothing left to show" check below — agree on what the diff contains.
  const hunks = useMemo(
    () => (ignoreWhitespace ? applyIgnoreWhitespace(sourceHunks) : sourceHunks),
    [sourceHunks, ignoreWhitespace],
  );
  // Every change in the file was whitespace, and the user asked not to see
  // those. Without this the pane would just be blank, which reads as a bug.
  const isWhitespaceOnly = ignoreWhitespace && sourceHunks.length > 0 && hunks.length === 0;

  switch (diff.kind) {
    case "text": {
      const lineCount = hunks.reduce((total, hunk) => total + hunk.lines.length, 0);
      const source = isWhitespaceOnly ? (
        <EmptyDiffNote
          icon={<Pencil aria-hidden="true" />}
          title={t.changesDiffWhitespaceOnlyTitle}
          description={t.changesDiffWhitespaceOnlyDescription}
        />
      ) : (
        <>
          {diff.truncated && (
            <p className="changes-diff__truncated" role="status">
              {t.changesDiffTruncatedNote(lineCount)}
            </p>
          )}
          {viewMode === "accessible" ? (
            <AccessibleDiffText hunks={hunks} t={t} />
          ) : (
            <DiffHunkList
              hunks={hunks}
              comparison={comparison ?? { before: t.changesDiffSaved, after: t.changesDiffWorkingCopy }}
              projectPath={projectPath}
              sessionEpoch={sessionEpoch}
              readFileLines={readFileLines}
              filePath={diff.path}
              viewMode={viewMode}
              hunkTarget={hunkTarget}
              searchQuery={searchQuery}
              t={t}
            />
          )}
        </>
      );
      // An SVG is text with a picture in it. The picture is what someone
      // opens an icon change to see, so it leads; the diff that produced it is
      // one press away in the toolbar, and completely unchanged when it gets
      // there.
      return picture?.showsDrawing ? <PictureDiffBody picture={picture} t={t} /> : source;
    }
    case "image":
      return picture ? (
        <PictureDiffBody picture={picture} t={t} />
      ) : (
        <EmptyDiffNote
          icon={<FileQuestion aria-hidden="true" />}
          title={t.changesDiffBinaryTitle}
          description={t.changesDiffBinaryDescription}
        />
      );
    case "binary":
      return (
        <EmptyDiffNote
          icon={<FileQuestion aria-hidden="true" />}
          title={t.changesDiffBinaryTitle}
          description={t.changesDiffBinaryDescription}
        />
      );
    case "too-large":
      return (
        <EmptyDiffNote
          icon={<FileWarning aria-hidden="true" />}
          title={t.changesDiffTooLargeTitle}
          description={t.changesDiffTooLargeDescription(formatByteLimit(diff.limitBytes))}
        />
      );
    case "unchanged":
      return (
        <EmptyDiffNote
          icon={<Pencil aria-hidden="true" />}
          title={t.changesDiffUnchangedTitle}
          description={t.changesDiffUnchangedDescription}
        />
      );
    case "conflict":
      return (
        <>
          <EmptyDiffNote
            icon={<TriangleAlert aria-hidden="true" />}
            title={t.changesDiffConflictTitle}
            description={t.changesDiffConflictDescription}
            tone="attention"
          />
          {diff.detail === "unavailable" && (
            <p className="changes-diff__truncated" role="alert">
              {t.changesDiffConflictUnavailable}
            </p>
          )}
          {diff.detail === "binary" && (
            <p className="changes-diff__truncated" role="alert">
              {t.changesDiffConflictBinary}
            </p>
          )}
          {diff.detail === "too-large" && (
            <p className="changes-diff__truncated" role="alert">
              {t.changesDiffConflictTooLarge}
            </p>
          )}
          {hunks.length > 0 && (
            <>
              {diff.truncated && (
                <p className="changes-diff__truncated" role="status">
                  {t.changesDiffTruncatedNote(hunks.reduce((total, hunk) => total + hunk.lines.length, 0))}
                </p>
              )}
              {viewMode === "accessible" ? (
                <AccessibleDiffText hunks={hunks} t={t} />
              ) : (
                <DiffHunkList
                  hunks={hunks}
                  comparison={comparison ?? { before: t.changesDiffSaved, after: t.changesDiffWorkingCopy }}
                  projectPath={projectPath}
                  sessionEpoch={sessionEpoch}
                  readFileLines={readFileLines}
                  filePath={diff.path}
                  viewMode={viewMode}
                  hunkTarget={hunkTarget}
                  searchQuery={searchQuery}
                  t={t}
                />
              )}
            </>
          )}
        </>
      );
  }
}
