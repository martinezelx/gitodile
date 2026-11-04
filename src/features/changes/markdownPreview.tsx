import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronsUpDown, ImageOff, Info } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useActiveScreenEffect } from "../../runtime/screen/module";
import type { Translations } from "../../i18n";
import { LoadingBar } from "../../shared/ui";
import { canPreviewMarkdown, type FileDiff, type MarkdownPreview } from "./domain";
import { useMarkdownView } from "./markdownPreference";
import { applyFolds, buildMarkdownExcerpt, buildUnifiedMarkdown, foldUnchanged, rehypeMarkCodeBlocks, remarkUnifiedMarkdown, type UnifiedMarkdown, type MarkdownExcerpt } from "./markdownChanges";
import type { Root } from "mdast";

type PreviewState = { status: "loading" } | { status: "error" } |
  { status: "ready"; preview: MarkdownPreview };
type Request = { diff: FileDiff; sourceKey: string; attempt: number; result: Promise<PreviewState> };

/** One selected document, read only on request. A hidden view detaches its
 * listener but retains the promise, so returning attaches to the same read.
 * A fresh diff snapshot invalidates the document, even at the same path. */
export function useMarkdownPreview(
  diff: FileDiff | null,
  sourceKey: string,
  enabled: boolean,
  load: (filePath: string) => Promise<MarkdownPreview>,
): { state: PreviewState; retry: () => void } {
  const request = useRef<Request | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ request: Request; state: PreviewState } | null>(null);
  useActiveScreenEffect(() => {
    if (!enabled || diff === null) return;
    if (request.current?.diff !== diff || request.current.sourceKey !== sourceKey || request.current.attempt !== attempt) {
      request.current = {
        diff, sourceKey, attempt,
        result: loadRef.current(diff.path).then(
          (preview): PreviewState => ({ status: "ready", preview }),
          (): PreviewState => ({ status: "error" }),
        ),
      };
    }
    const current = request.current;
    let cancelled = false;
    void current.result.then((state) => {
      if (!cancelled) setSettled({ request: current, state });
    });
    return () => { cancelled = true; };
  }, [diff, sourceKey, enabled, attempt]);
  const current = settled?.request;
  return {
    state: settled && current?.diff === diff && current?.sourceKey === sourceKey && current?.attempt === attempt
      ? settled.state : { status: "loading" },
    retry: () => setAttempt((value) => value + 1),
  };
}

/** How one open file is being read as a document, for any screen that shows
 * the diff: the remembered choice, the read, the comparison it builds, and the
 * stops the change arrows walk. A failure leaves the text diff in its place. */
export function useMarkdownDiff(
  diff: FileDiff | null,
  sourceKey: string,
  load: (filePath: string) => Promise<MarkdownPreview>,
  t: Translations,
) {
  const [view, setView] = useMarkdownView();
  const available = canPreviewMarkdown(diff);
  const requested = view === "markdown" && available;
  const { state, retry } = useMarkdownPreview(diff, sourceKey, requested, load);
  const comparison = useMemo(() => requested && state.status === "ready" && state.preview.kind === "ready"
    ? buildUnifiedMarkdown(state.preview.beforeContent, state.preview.content) : undefined,
  [requested, state]);
  const excerpt = useMemo(() => requested && state.status === "ready" && state.preview.kind === "too-large" && diff?.kind === "text"
    ? buildMarkdownExcerpt(diff.hunks, diff.truncated) : undefined,
  [requested, state, diff]);
  const failure = !requested ? null : state.status === "error" ? t.changesMarkdownError
    : state.status === "ready" && state.preview.kind === "too-large" && !excerpt
      ? t.changesMarkdownTooLarge(state.preview.limitBytes / 1024)
      : comparison === null ? t.changesMarkdownComplex : null;
  const [target, setTarget] = useState({ index: -1, token: 0 });
  useEffect(() => { setTarget({ index: -1, token: 0 }); }, [diff, comparison, excerpt]);
  const count = comparison?.changeCount ?? excerpt?.changeCount ?? 0;
  return {
    available, shows: requested && failure === null, failure, state, retry, comparison, excerpt, target, count,
    index: Math.min(target.index, Math.max(0, count - 1)),
    stepTo: (index: number) => setTarget((current) => ({ index, token: current.token + 1 })),
    /** The text layout chosen for documents, which outranks the code files'. */
    textView: available && view !== "markdown" ? view : null,
    chooseTextView: setView,
    chooseMarkdown: () => {
      setView("markdown");
      if (failure) retry();
    },
  };
}

/** Repository links stay inert: a preview must never navigate the WebView or
 * resolve a relative path through the development server. Images remain text
 * placeholders, including data URLs and local paths. No raw HTML plugins. */
export function MarkdownPreviewView({ state, retry, t, notice = t.changesMarkdownNotice, comparison, excerpt, changeTarget }: {
  state: PreviewState;
  retry: () => void;
  t: Translations;
  /** How it was read, which depends on what the screen compares. */
  notice?: string;
  comparison?: UnifiedMarkdown | null;
  excerpt?: MarkdownExcerpt | null;
  changeTarget?: { index: number; token: number };
}): React.JSX.Element {
  const container = useRef<HTMLElement>(null);
  // Opening a fold re-renders the document over the same elements, so the
  // current change has to be stood on again.
  const [revealed, setRevealed] = useState(0);
  const reveal = useCallback(() => setRevealed((value) => value + 1), []);
  const lastScroll = useRef<{ target: typeof changeTarget; comparison: typeof comparison; excerpt: typeof excerpt } | null>(null);
  useActiveScreenEffect(() => {
    if (!changeTarget?.token) return;
    const target = container.current?.querySelector<HTMLElement>(`[data-markdown-change="${changeTarget.index}"]`);
    if (!target) return;
    if (lastScroll.current?.target !== changeTarget || lastScroll.current.comparison !== comparison || lastScroll.current.excerpt !== excerpt) {
      lastScroll.current = { target: changeTarget, comparison, excerpt };
      target.scrollIntoView({ block: "center", behavior: "auto" });
    }
    // A stop opens a run of changed blocks; the whole run is what it stands on.
    const run = [target];
    for (let next = target.nextElementSibling; next?.matches(".markdown-preview__added, .markdown-preview__removed") && !next.hasAttribute("data-markdown-change"); next = next.nextElementSibling) run.push(next as HTMLElement);
    run.forEach((block) => block.setAttribute("data-current-markdown-change", "true"));
    return () => run.forEach((block) => block.removeAttribute("data-current-markdown-change"));
  }, [changeTarget, comparison, excerpt, revealed]);
  if (state.status === "loading") return <LoadingBar label={t.changesMarkdownLoading} showLabel />;
  if (state.status === "error") return (
    <div className="changes-diff__status changes-diff__status--error" role="alert">
      <p>{t.changesMarkdownError}</p>
      <button className="secondary-button" type="button" onClick={retry}>{t.changesDiffRetry}</button>
    </div>
  );
  if (state.preview.kind === "too-large" && !excerpt) return (
    <p className="changes-diff__status" role="status">{t.changesMarkdownTooLarge(state.preview.limitBytes / 1024)}</p>
  );
  return (
    <section ref={container} className="markdown-preview" aria-label={t.changesMarkdownPreview}>
      {state.preview.kind === "too-large" && excerpt ? <>
        <MarkdownNotice detail={`${notice} ${t.changesMarkdownExcerptDetail}`}>
          {t.changesMarkdownExcerpt} {excerpt.limited && t.changesMarkdownExcerptLimited}
        </MarkdownNotice>
        <article className="markdown-preview__document" tabIndex={0} aria-label={t.changesMarkdownUnified}>
          {excerpt.chunks.map((chunk, index) => <section className="markdown-preview__excerpt" key={index}>
            <p className="markdown-preview__position">{t.changesMarkdownExcerptPosition(chunk.newStart || chunk.oldStart)}</p>
            <MarkdownContent tree={chunk.comparison.tree} t={t} idPrefix={`markdown-excerpt-${index}-`} />
          </section>)}
        </article>
      </> : state.preview.kind === "ready" && <MarkdownComparison before={state.preview.beforeContent} after={state.preview.content} t={t} notice={notice} comparison={comparison} onReveal={reveal} />}
    </section>
  );
}

/** The view's one line: what is shown stays in sight, how it was read waits
 * behind the info mark, which a keyboard reaches as well as a pointer. */
function MarkdownNotice({ detail, action, children }: { detail: string; action?: ReactNode; children: ReactNode }): React.JSX.Element {
  return (
    <p className="markdown-preview__notice" role="status">
      <span>{children}</span>
      <span className="markdown-preview__info" role="img" tabIndex={0} aria-label={detail} data-tooltip={detail}><Info aria-hidden="true" /></span>
      {action}
    </p>
  );
}

const NO_FOLDS: ReadonlySet<number> = new Set();

// A repository status or toolbar update must not reparse an unchanged document.
const MarkdownComparison = memo(function MarkdownComparison({ before, after, t, notice, comparison, onReveal }: {
  before: string | null; after: string | null; t: Translations; notice: string;
  comparison?: UnifiedMarkdown | null;
  onReveal: () => void;
}) {
  const changes = useMemo(() => comparison === undefined ? buildUnifiedMarkdown(before, after) : comparison, [before, after, comparison]);
  const tree = changes?.tree ?? null;
  const folds = useMemo(() => tree ? foldUnchanged(tree) : [], [tree]);
  // Held beside its tree: another document starts with its folds closed.
  const [opened, setOpened] = useState<{ tree: Root | null; starts: ReadonlySet<number> }>({ tree: null, starts: NO_FOLDS });
  const starts = opened.tree === tree ? opened.starts : NO_FOLDS;
  const shown = useMemo(() => tree && applyFolds(tree, folds, starts), [tree, folds, starts]);
  const article = useRef<HTMLElement>(null);
  const open = useCallback((next: ReadonlySet<number>) => {
    setOpened({ tree, starts: next });
    onReveal();
    // The control that was pressed goes with the fold; focus stays in the document.
    article.current?.focus({ preventScroll: true });
  }, [tree, onReveal]);
  const openFold = useCallback((start: number) => open(new Set([...starts, start])), [open, starts]);
  const closedFolds = folds.some((fold) => !starts.has(fold.start));
  if (!changes || !shown) return <p className="changes-diff__status" role="status">{t.changesMarkdownComplex}</p>;
  const hasChanges = changes.removed.size > 0 || changes.added.size > 0 ||
    (before !== after && (before === null || after === null));
  return <>
    <MarkdownNotice detail={`${notice} ${t.changesMarkdownBlocks}`} action={closedFolds &&
      <button className="markdown-preview__show-all" type="button" onClick={() => open(new Set(folds.map((fold) => fold.start)))}>{t.changesMarkdownShowAll}</button>}>
      {hasChanges ? t.changesMarkdownCounts(changes.removed.size, changes.added.size) : t.changesMarkdownUnchanged}
      {after === null && ` · ${t.changesMarkdownDeleted}`}
    </MarkdownNotice>
    {(before ?? "").trim() === "" && (after ?? "").trim() === "" ?
      <p className="changes-diff__status">{t.changesMarkdownEmpty}</p> :
      <MarkdownDocument tree={shown} t={t} article={article} onOpenFold={openFold} />}
  </>;
});

const MarkdownDocument = memo(function MarkdownDocument({ tree, t, article, onOpenFold }: {
  tree: Root; t: Translations; article: RefObject<HTMLElement | null>; onOpenFold: (start: number) => void;
}) {
  return (
    <article ref={article} className="markdown-preview__document" tabIndex={0} aria-label={t.changesMarkdownUnified}>
      <MarkdownContent tree={tree} t={t} onOpenFold={onOpenFold} />
    </article>
  );
});

const MarkdownContent = memo(function MarkdownContent({ tree, t, idPrefix, onOpenFold }: { tree: Root; t: Translations; idPrefix?: string; onOpenFold?: (start: number) => void }) {
  return (
      <Markdown
        skipHtml
        remarkRehypeOptions={idPrefix ? { clobberPrefix: idPrefix } : undefined}
        remarkPlugins={[remarkGfm, [remarkUnifiedMarkdown, { tree }]]}
        rehypePlugins={[rehypeMarkCodeBlocks]}
        urlTransform={() => ""}
        components={{
          h2: ({ node: _node, ...props }) => <h2 {...props} id={idPrefix && props.id === "footnote-label" ? `${idPrefix}footnote-label` : props.id} />,
          a: ({ children }) => <span className="markdown-preview__link">{children}</span>,
          // Repository Markdown cannot reach this: raw HTML is skipped, so the
          // only button in the tree is the row `applyFolds` puts there.
          button: ({ node }) => {
            const fold = node?.properties ?? {};
            return <div className="diff-hunk__marker">
              <button className="diff-hunk__expand" type="button" onClick={() => onOpenFold?.(Number(fold["data-markdown-fold"]))}>
                <ChevronsUpDown aria-hidden="true" />{t.changesMarkdownFold(Number(fold["data-markdown-fold-count"]))}
              </button>
            </div>;
          },
          img: ({ alt }) => <span className="markdown-preview__image"><ImageOff aria-hidden="true" />{t.changesMarkdownImage(alt || "")}</span>,
        }}
      >{""}</Markdown>
  );
});
