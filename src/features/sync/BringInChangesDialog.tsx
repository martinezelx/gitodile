import { useCallback, useEffect, useRef, useState } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, GitMerge, Info, ShieldCheck } from "lucide-react";
import { useLanguage } from "../../i18n";
import { isAppError, localizeAppError } from "../../shared/i18n";
import { Dialog, DialogBanner, DialogFacts, LoadingBar, LoadingPlaceholder, SearchBox, TextPlaceholder, useModalFocus, useToast } from "../../shared/ui";
import type { ConflictSession } from "../conflicts";
import type { BringInController } from "./bringInController";
import { integrationSourceLabel, type BringInChangesPlan, type BringInChangesResult, type GetTeamChangesPhase, type IntegrationSource } from "./domain";
import { forecastBlockerCopy } from "./forecastCopy";

type State =
  | { status: "picking"; loading?: boolean; sources: IntegrationSource[]; truncated: boolean }
  | { status: "planning" }
  | { status: "ready"; plan: BringInChangesPlan; stale: boolean }
  | { status: "executing"; plan: BringInChangesPlan; phase: GetTeamChangesPhase }
  | { status: "error"; error: unknown }
  | { status: "uncertain"; evidence: string };

export type BringInChangesDialogProps = {
  controller: BringInController;
  projectPath: string;
  sessionEpoch: string;
  source: IntegrationSource | null;
  runHooks: boolean;
  onClose: () => void;
  onApplied: (result: BringInChangesResult) => Promise<void>;
  onPaused: (session: ConflictSession) => Promise<void>;
  onPhaseChange: (phase: "planning" | "executing" | "verifying" | "success" | "error" | "uncertain") => void;
  onSaveVersion: () => void;
  onOpenConflicts: () => void;
  onRevealFile: (path: string) => void;
};

/** Eager overlay. The controller owns source freshness; this opening owns the
 * reviewed plan and ignores superseded asynchronous answers on close/replan. */
export function BringInChangesDialog(props: BringInChangesDialogProps): React.JSX.Element {
  const { t } = useLanguage();
  const toast = useToast();
  const [source, setSource] = useState(props.source);
  const [state, setState] = useState<State>(props.source ? { status: "planning" } : { status: "picking", loading: true, sources: [], truncated: false });
  const [checking, setChecking] = useState(false);
  const [revision, setRevision] = useState(0);
  const [stale, setStale] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const callbacks = useRef(props);
  callbacks.current = props;
  const generation = useRef(0);
  const close = useCallback(() => { if (!busy.current) callbacks.current.onClose(); }, []);
  const setOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((value) => {
    if (!(typeof value === "function" ? value(true) : value)) close();
  }, [close]);
  useModalFocus(true, dialogRef, setOpen);
  useEffect(() => {
    // Choosing a source removes the focused search/row; completing a mutation
    // can remove its focused button too. Keep Tab inside the modal after those
    // transitions without stealing focus from a control the reader chose.
    if (!dialogRef.current?.contains(document.activeElement)) dismissRef.current?.focus();
  }, [source, state.status]);
  const { controller, projectPath, sessionEpoch } = props;

  useEffect(() => {
    const ticket = ++generation.current;
    const query = { projectId: projectPath, sessionEpoch };
    callbacks.current.onPhaseChange("planning");
    if (!source) {
      void controller.port.listSources(query).then((inventory) => {
        if (ticket === generation.current) setState({ status: "picking", sources: inventory.sources, truncated: inventory.isTruncated });
      }).catch((error: unknown) => {
        if (ticket === generation.current) setState({ status: "error", error });
      });
      return () => { generation.current++; };
    }
    setState({ status: "planning" });
    setChecking(source.kind === "remoteBranch");
    // Render local knowledge first, with confirmation held until the selected
    // remote has answered. A failure is explicit, never permission to proceed.
    const plan = () => controller.port.plan({ ...query, source });
    let remoteFinished = source.kind === "localBranch";
    if (source.kind === "remoteBranch") {
      void plan().then((value) => {
        if (ticket === generation.current && !remoteFinished && value.kind !== "alreadyContained") setState({ status: "ready", plan: value, stale });
      }).catch(() => undefined);
    }
    void controller.checkIfNeeded(query, source).then(async () => {
      remoteFinished = true;
      if (ticket !== generation.current) return null;
      return plan();
    }).then((value) => {
      if (value && ticket === generation.current) {
        setChecking(false);
        setState({ status: "ready", plan: value, stale });
      }
    }).catch((error: unknown) => {
      remoteFinished = true;
      if (ticket === generation.current) {
        setChecking(false);
        setState({ status: "error", error });
        callbacks.current.onPhaseChange("error");
      }
    });
    return () => { generation.current++; };
  }, [controller, projectPath, sessionEpoch, source, revision, stale]);

  const execute = async (plan: BringInChangesPlan, overlap: boolean): Promise<void> => {
    if (!source || busy.current || checking) return;
    busy.current = true;
    setState({ status: "executing", plan, phase: "checkingLocalSafety" });
    callbacks.current.onPhaseChange("executing");
    const request = { projectId: projectPath, sessionEpoch, stateToken: plan.stateToken, recoveryReference: plan.recovery.reference };
    try {
      if (overlap) {
        const result = await controller.port.startOverlap({ ...request, source: { kind: "branch", source } });
        // The returned, verified session is installed before the resolver opens.
        await callbacks.current.onPaused(result.session);
      } else {
        const result = await controller.port.bring({ ...request, source, runHooks: props.runHooks, onProgress: (phase) => {
          setState({ status: "executing", plan, phase });
          callbacks.current.onPhaseChange(phase === "verifying" ? "verifying" : "executing");
        } });
        if (result.outcome === "uncertain") {
          setState({ status: "uncertain", evidence: [result.recovery.reference, result.recovery.unsavedReference, result.observedHead].filter(Boolean).join("\n") });
          callbacks.current.onPhaseChange("uncertain");
          return;
        }
        await callbacks.current.onApplied(result);
        toast({ icon: <GitMerge />, message: t.bringInSuccess });
      }
      callbacks.current.onPhaseChange("success");
      callbacks.current.onClose();
    } catch (error: unknown) {
      if (isAppError(error) && ["merge_outcome_uncertain", "get_team_changes_uncertain"].includes(error.code)) {
        setState({ status: "uncertain", evidence: [plan.recovery.reference, error.detail].filter(Boolean).join("\n") });
        callbacks.current.onPhaseChange("uncertain");
      } else if (isAppError(error) && error.code === "stale_bring_in_plan") {
        setStale(true);
        setRevision((value) => value + 1);
      } else {
        setState({ status: "error", error });
        callbacks.current.onPhaseChange("error");
      }
    } finally {
      busy.current = false;
    }
  };

  const plan = state.status === "ready" || state.status === "executing" ? state.plan : null;
  const forecast = plan?.forecast;
  const blocked = forecast?.outcome === "blocked" && forecast.blocker
    ? forecastBlockerCopy(forecast.blocker, plan?.source.label ?? "", t) : null;
  const overlaps = forecast?.outcome === "overlap";
  const unsavedOverlap = overlaps && forecast.overlaps.some((item) => item.side === "unsaved");
  const contained = plan?.kind === "alreadyContained";
  const uncertain = state.status === "uncertain";
  const executing = state.status === "executing";
  const error = state.status === "error" ? state.error : null;
  const deterministic = isAppError(error) && ["branch_is_active", "branch_missing", "detached_head", "unborn_branch_no_version", "no_shared_history", "shallow_history", "unsupported_merge_setup", "invalid_remote_configuration", "remote_ref_missing", "dirty_working_tree", "git_operation_in_progress", "unresolved_conflicts", "index_unavailable", "ref_locked"].includes(error.code);
  const guidance = isAppError(error)
    ? ["shallow_history", "no_shared_history"].includes(error.code) ? t.bringInGuidance.history
      : error.code === "unsupported_merge_setup" ? t.bringInGuidance.setup
      : ["index_unavailable", "ref_locked"].includes(error.code) ? t.bringInGuidance.locked
      : ["branch_missing", "branch_is_active", "detached_head"].includes(error.code) ? t.bringInGuidance.choose
      : error.code === "unborn_branch_no_version" ? t.bringInGuidance.unborn
      : error.code === "dirty_working_tree" ? t.bringInSaveFirst
      : t.bringInBlockedGuidance
    : t.bringInBlockedGuidance;
  const pausedError = isAppError(error) && ["git_operation_in_progress", "unresolved_conflicts"].includes(error.code);
  const canSave = !uncertain && !executing && (blocked?.action === "save" || unsavedOverlap || (isAppError(error) && error.code === "dirty_working_tree"));
  const canOpenConflicts = !uncertain && !executing && (blocked?.action === "conflicts" || pausedError);
  const revealPath = !uncertain && !executing && blocked?.action === "reveal" ? forecast?.blocker?.path : null;
  const canReview = state.status === "error" && !deterministic;
  const closeIsPrimary = Boolean(uncertain || contained || error || blocked) && !canSave && !canOpenConflicts && !revealPath && !canReview;
  return (
    <Dialog size="m" title={uncertain ? t.getTeamUncertainTitle : t.bringInTitle} titleId="bring-in-title"
      subtitle={plan ? t.bringInDirection(plan.source.label, plan.branch) : undefined}
      icon={<GitMerge />} tone={uncertain || blocked || error ? "warning" : "local"}
      onClose={close} closeLabel={t.commonClose} dismissible={!executing} dialogRef={dialogRef}>
      {state.status === "picking" && state.loading ? <LoadingBar label={t.bringInReading} showLabel /> : state.status === "picking" ? <SourcePicker sources={state.sources} onChoose={setSource} />
        : state.status === "planning" ? <LoadingPlaceholder label={t.bringInReading}><TextPlaceholder width="70%" /><TextPlaceholder width="55%" /></LoadingPlaceholder>
        : uncertain ? <>
          <p className="app-dialog__text" role="alert">{t.getTeamUncertainInstructions}</p>
          <details className="app-dialog__details"><summary>{t.syncTechnicalDetails}</summary><pre>{state.evidence}</pre></details>
        </> : error ? <>
          <p className="app-dialog__text" role="alert">{localizeAppError(error, t, t.errorGitCommandFailed)}</p>
          <p className="app-dialog__text">{guidance}</p>
          {isAppError(error) && error.detail && <details className="app-dialog__details"><summary>{t.syncTechnicalDetails}</summary><pre>{error.detail}</pre></details>}
        </> : plan ? <>
          <DialogFacts facts={[
            { icon: <GitMerge />, text: contained ? t.bringInContained : overlaps ? t.bringInOverlaps : plan.kind === "emptyMerge" ? t.bringInEmptyMerge : plan.kind === "merge" ? t.bringInMerge(plan.incomingCount) : t.bringInFastForward(plan.incomingCount) },
            ...(forecast && forecast.combinedUnsavedCount > 0 ? [{ icon: <GitMerge />, text: t.getTeamCombined(forecast.combinedUnsaved, forecast.combinedUnsavedCount) }] : []),
            { icon: <ShieldCheck />, text: contained ? t.getTeamSafeNothingChanged : [t.bringInSafety, forecast?.carriedUnsavedCount ? t.getTeamCarried(forecast.carriedUnsavedCount) : ""].filter(Boolean).join(" "), safe: true },
          ]} />
          {blocked && <DialogBanner tone="warning" icon={<Info />}><p>{blocked.body}</p></DialogBanner>}
          {unsavedOverlap && <DialogBanner tone="warning" icon={<Info />}><p>{t.bringInSaveFirst}</p></DialogBanner>}
          {overlaps && <VirtualRows rows={forecast.overlaps.map((item) => `${item.path} · ${t.getTeamOverlapSide[item.side]}`)} label={t.bringInOverlaps} />}
          {overlaps && forecast.overlapCount > forecast.overlaps.length && <p className="app-dialog__note">{t.getTeamOverlapMore(forecast.overlapCount - forecast.overlaps.length)}</p>}
          {!contained && <details className="get-team-disclosure"><summary><ChevronDown />{t.getTeamWhatComesIn}</summary>
            <p className="app-dialog__text">{t.getTeamFileCount(plan.fileImpact.totalCount)}</p>
            <VirtualRows rows={plan.fileImpact.files.map((file) => file.path)} label={t.getTeamFileCount(plan.fileImpact.totalCount)} />
            <VirtualRows rows={plan.incomingVersions.map((version) => `${version.title} · ${version.author}`)} label={t.getTeamWhatComesIn} />
            {plan.versionsTruncated && <p className="app-dialog__note">{t.getTeamVersionsTruncated(plan.incomingVersions.length, plan.incomingCount)}</p>}
          </details>}
          <details className="get-team-disclosure get-team-technical"><summary><ChevronDown aria-hidden="true" />{t.syncTechnicalDetails}</summary><dl>
            <div><dt>{t.syncTrackingRef}</dt><dd>{plan.source.reference}</dd></div>
            <div><dt>{t.syncLocalCommit}</dt><dd>{plan.localCommit}</dd></div>
            <div><dt>{plan.source.label}</dt><dd>{plan.source.commit}</dd></div>
            {plan.mergeMessage && <div><dt>{t.getTeamMergeMessage}</dt><dd>{plan.mergeMessage}</dd></div>}
            <div><dt>{t.getTeamRecoveryReference}</dt><dd>{plan.recovery.reference}</dd></div>
          </dl></details>
          {state.status === "ready" && state.stale && <DialogBanner tone="info" icon={<Info />} role="status"><p>{t.bringInStale}</p></DialogBanner>}
        </> : null}
      {checking && <LoadingBar label={t.bringInChecking} showLabel />}
      {executing && <LoadingBar label={t.getTeamPhase[state.phase]} showLabel />}
      {state.status === "picking" && state.truncated && <p className="app-dialog__note">{t.bringInTruncated}</p>}
      <div className="dialog-actions">
        <button ref={dismissRef} type="button" className={closeIsPrimary ? "primary-button" : "secondary-button"} onClick={close} disabled={executing}>{uncertain || contained || error || blocked ? t.commonClose : t.commonCancel}</button>
        {canSave && <button type="button" className="primary-button" onClick={props.onSaveVersion}>{t.getTeamSaveVersion}</button>}
        {canOpenConflicts && <button type="button" className="primary-button" onClick={props.onOpenConflicts}>{t.getTeamReviewConflicts}</button>}
        {revealPath && <button type="button" className="primary-button" onClick={() => props.onRevealFile(revealPath)}>{t.getTeamShowInFolder}</button>}
        {canReview && <button type="button" className="primary-button" onClick={() => setRevision((value) => value + 1)}>{t.getTeamReviewUpdatedPlan}</button>}
        {plan && !contained && !blocked && !unsavedOverlap && <button type="button" className="primary-button" disabled={checking || executing} onClick={() => void execute(plan, Boolean(overlaps))}>{overlaps ? t.bringInResolve : t.bringInTitle}</button>}
        {state.status === "planning" && <button className="primary-button" disabled>{t.bringInReading}</button>}
      </div>
    </Dialog>
  );
}

function SourcePicker({ sources, onChoose }: { sources: IntegrationSource[]; onChoose: (source: IntegrationSource) => void }): React.JSX.Element {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const filtered = sources.filter((source) => integrationSourceLabel(source).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => { region.current?.querySelector("input")?.focus(); }, []);
  return <div ref={region} className="get-team-plan" onKeyDown={(event) => {
    if (!(event.target instanceof HTMLInputElement) || event.nativeEvent.isComposing || filtered.length === 0) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onChoose(filtered[0]!);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      region.current?.querySelector<HTMLButtonElement>('.bring-in-list button[tabindex="0"]')?.focus();
    }
  }}>
    <SearchBox value={query} onChange={setQuery} placeholder={t.bringInPick} ariaLabel={t.bringInPick} clearLabel={t.commonClearSearch} />
    <VirtualRows key={query} rows={filtered.map(integrationSourceLabel)} label={t.bringInPick} onChoose={(index) => onChoose(filtered[index]!)} />
    {filtered.length === 0 && <p className="empty-line" role="status">{t.branchesQuickSwitchSearchEmpty}</p>}
  </div>;
}

/** Same virtualizer and keyboard conventions as the resolver's file list.
 * Lists stay bounded in the DOM even for thousands of source branches. */
function VirtualRows({ rows, label, onChoose }: { rows: string[]; label: string; onChoose?: (index: number) => void }): React.JSX.Element {
  const scroll = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(0);
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 40,
    overscan: 4,
    initialRect: { width: 480, height: 240 },
    // Keep the roving tab stop mounted when the pointer scrolls it out of
    // view; otherwise Tab from the search would skip the entire source list.
    rangeExtractor: (range) => onChoose && rows.length > 0
      ? [...new Set([...defaultRangeExtractor(range), focused])].sort((a, b) => a - b)
      : defaultRangeExtractor(range),
  });
  return <div ref={scroll} className="bring-in-list auto-hide-scrollbar">
    <ul aria-label={label} className="bring-in-list__rows" style={{ height: virtual.getTotalSize() }} onKeyDown={(event) => {
      if (!onChoose || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, focused + (event.key === "ArrowDown" ? 1 : -1)));
      setFocused(index);
      virtual.scrollToIndex(index);
      requestAnimationFrame(() => scroll.current?.querySelector<HTMLButtonElement>(`[data-index="${index}"] button`)?.focus());
    }}>
      {virtual.getVirtualItems().map((item) => <li key={item.key} data-index={item.index} className="bring-in-list__row" style={{ height: item.size, transform: `translateY(${item.start}px)` }}>
        {onChoose ? <button type="button" className="app-menu__item" tabIndex={focused === item.index ? 0 : -1} onFocus={() => { setFocused(item.index); virtual.scrollToIndex(item.index); }} onClick={() => onChoose(item.index)} title={rows[item.index]}>{rows[item.index]}</button> : <span title={rows[item.index]}>{rows[item.index]}</span>}
      </li>)}
    </ul>
  </div>;
}
