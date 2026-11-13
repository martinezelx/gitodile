import React, { useEffect, useState } from "react";
import {
  Cloud,
  CloudAlert,
  CloudCheck,
  CloudDownload,
  CloudSync,
  CloudUpload,
  LoaderCircle,
  RotateCw,
  Search,
} from "lucide-react";

import { useLanguage, type Translations } from "../i18n";
import { formatDate, formatRelativeCheckTime, type LocaleFormats } from "../shared/i18n";
import type { RepositoryInfo } from "../features/repository";
import type { WorkingTreeStatus } from "../features/status";
import type { TeamSyncState, TeamSyncViewState } from "../features/sync";
import {
  BranchQuickSwitch,
  type BranchCreateContext,
  type BranchesSnapshot,
} from "../features/branches";
import { ProjectQuickSwitch, type ProjectQuickSwitchProps } from "./project-switcher/ProjectSwitcher";

const CLOCK_TICK_MS = 30_000;
const NO_FAVOURITE_BRANCHES: ReadonlySet<string> = new Set();

export type StatusBarProps = {
  project: Pick<RepositoryInfo, "name" | "branch" | "headState"> | null;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  branches: BranchesSnapshot | null;
  isLoadingBranches: boolean;
  favouriteBranches?: ReadonlySet<string>;
  onToggleFavouriteBranch?: (name: string) => void;
  teamSync: TeamSyncViewState;
  onSwitchBranch: (target: string) => void;
  onBringIn?: (name: string) => void;
  /** Where the quick switch makes a new branch, inside its own popup. */
  branchCreate?: BranchCreateContext;
  onSeeAllBranches: () => void;
  onCheckTeamChanges: () => void;
  /** The project half of the block: the one place to change projects
   * (task 189). */
  projectSwitch: ProjectQuickSwitchProps;
  /** The remote fact doubles as the one sync action the relation calls for,
   * offered only while that relation is known and current: publish when this
   * branch is ahead, get when it is behind, get and publish when both moved. */
  onPublish: () => void;
  onGetChanges: () => void;
  onGetAndPublish: () => void;
  /** The one field on the strip: the app's search. It holds the query and the
   * keyboard, and the palette's results deploy from it, so the strip is where
   * the work starts rather than only where its state is reported. */
  commandPalette: {
    isOpen: boolean;
    query: string;
    selectedOptionId?: string;
    inputRef: React.RefObject<HTMLInputElement | null>;
    /** The shortcut that focuses the field, in `aria-keyshortcuts` form. It
     * is not drawn on the field; assistive technology still announces it. */
    keyShortcuts: string;
    onOpen: () => void;
    onQueryChange: (query: string) => void;
    onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  };
};

function useStatusBarClock(): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

/** Re-exported for the tests that grew up beside it; it lives in shared i18n
 * now so Overview's band tells the same time. */
export { formatRelativeCheckTime };

function branchLabel(
  project: NonNullable<StatusBarProps["project"]>,
  t: Translations,
): string {
  if (project.headState === "detached") return t.statusBarDetached;
  if (project.branch) return project.branch;
  return project.headState === "unborn" ? t.statusBarUnbornBranch : t.statusBarBranchUnavailable;
}

function workingTreeLabel(
  workingTree: WorkingTreeStatus | null,
  workingTreeError: string | null,
  isCheckingChanges: boolean,
  t: Translations,
): string {
  if (isCheckingChanges) return t.statusBarCheckingChanges;
  if (workingTreeError) return t.statusBarChangesUnavailable;
  if (!workingTree) return t.statusBarChangesNotChecked;
  return workingTree.isClean ? t.statusBarEverythingSaved : t.statusBarUnsaved(workingTree.counts.total);
}

function teamStateLabel(
  state: TeamSyncState,
  ahead: number,
  behind: number,
  t: Translations,
): string {
  switch (state) {
    case "upToDate": return t.statusBarUpToDate;
    case "ahead": return t.statusBarAhead(ahead);
    case "behind": return t.statusBarBehind(behind);
    case "diverged": return t.statusBarDiverged;
    case "noRemote": return t.statusBarNoRemote;
    case "noUpstream": return t.statusBarNoUpstream;
    case "unborn": return t.statusBarSyncUnborn;
    case "detached": return t.statusBarSyncDetached;
    case "upstreamGone": return t.statusBarUpstreamGone;
  }
}

/** How the remote fact is known — from a check just now, from a saved
 * snapshot — as one line for the fact's tooltip, with the exact time after it
 * when there is one. A stale answer says how old it is rather than restating
 * the doubt: the doubt is already the visible word. */
function teamFreshnessLabel(
  state: TeamSyncViewState,
  now: number,
  formats: LocaleFormats,
  t: Translations,
): string | null {
  const checkedAt = state.status?.checkedAt ?? state.lastSuccessfulCheckAt;
  const exactCheckedAt = checkedAt === null ? null : formatDate(new Date(checkedAt), formats, "date-time");
  let label: string | null = null;
  if (state.error) label = t.statusBarCheckFailed;
  else if (state.status?.knowledge === "cached") label = t.statusBarLocalSnapshot;
  else if (checkedAt !== null) {
    label = t.statusBarLastChecked(formatRelativeCheckTime(checkedAt, now, formats.language, t.statusBarJustNow));
  }
  if (label === null) return null;
  return exactCheckedAt ? `${label} · ${exactCheckedAt}` : label;
}

/** The tone the cloud takes: anything the reader should act on or doubt in
 * the warning colour, and the rest in the strip's quiet ink. "Up to date" keeps
 * its own tone for the glyph but is not restated in green, and a project that
 * only lives on this computer is a fact, not a problem. */
function teamTone(state: TeamSyncViewState): "success" | "warning" | "neutral" {
  if (state.isCheckingRemote || state.isLoading) return "neutral";
  if (state.error || state.isStale) return "warning";
  switch (state.status?.state) {
    case "upToDate": return "success";
    case "behind":
    case "diverged":
    case "noUpstream":
    case "upstreamGone": return "warning";
    default: return "neutral";
  }
}

type TeamSyncAction = {
  kind: "publish" | "get" | "getAndPublish";
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
};

/** The one sync action a current relation calls for, GitHub Desktop's
 * Fetch/Pull/Push button in the app's words: ahead publishes, behind gets,
 * and both sides moved gets, combines and publishes in one confirmation. Every
 * other state has nothing to send or receive, and the refresh beside it is the
 * check. */
function teamSyncAction(
  status: TeamSyncViewState["status"],
  t: Translations,
  handlers: { onPublish: () => void; onGetChanges: () => void; onGetAndPublish: () => void },
): TeamSyncAction | null {
  switch (status?.state) {
    case "ahead":
      return status.ahead > 0
        ? { kind: "publish", label: t.statusBarPublishAction(status.ahead), icon: <CloudUpload aria-hidden="true" />, onClick: handlers.onPublish }
        : null;
    case "behind":
      return status.behind > 0
        ? { kind: "get", label: t.statusBarGetAction(status.behind), icon: <CloudDownload aria-hidden="true" />, onClick: handlers.onGetChanges }
        : null;
    case "diverged":
      return { kind: "getAndPublish", label: t.statusBarGetAndPublishAction, icon: <CloudSync aria-hidden="true" />, onClick: handlers.onGetAndPublish };
    // A branch with no publish destination gets one by publishing, so that is
    // the action rather than a fact with nowhere to go.
    case "noUpstream":
      return { kind: "publish", label: t.statusBarPublishBranchAction, icon: <CloudUpload aria-hidden="true" />, onClick: handlers.onPublish };
    default:
      return null;
  }
}

export function StatusBar({
  project,
  workingTree,
  workingTreeError,
  isCheckingChanges,
  branches,
  isLoadingBranches,
  favouriteBranches = NO_FAVOURITE_BRANCHES,
  onToggleFavouriteBranch,
  teamSync,
  onSwitchBranch,
  onBringIn,
  branchCreate,
  onSeeAllBranches,
  onCheckTeamChanges,
  projectSwitch,
  onPublish,
  onGetChanges,
  onGetAndPublish,
  commandPalette,
}: StatusBarProps): React.JSX.Element {
  const { t, formats } = useLanguage();
  const now = useStatusBarClock();
  const isReadingTeamStatus = teamSync.isLoading && !teamSync.status;
  const isWaiting = teamSync.isCheckingRemote || isReadingTeamStatus;
  const teamLabel = teamSync.isCheckingRemote
    ? t.statusBarCheckingTeam
    : isReadingTeamStatus
      ? t.statusBarReadingTeam
      : teamSync.error && !teamSync.status
        ? t.statusBarTeamUnavailable
        : teamSync.status
          ? teamStateLabel(teamSync.status.state, teamSync.status.ahead, teamSync.status.behind, t)
          : t.statusBarTeamNotChecked;
  const freshness = teamFreshnessLabel(teamSync, now, formats, t);
  const tone = teamTone(teamSync);
  // A stale or failed result still shows the last known state, but the strip
  // must not read as current: a failed check says so, and an answer the reader's
  // own latest change has overtaken says the one thing left to do — check again.
  // The state and the exact time move to the tooltip.
  const doubtLabel = teamSync.status && (teamSync.error || teamSync.isStale)
    ? (teamSync.error ? t.statusBarCheckFailed : t.statusBarCheckAgain)
    : null;
  const visibleTeamLabel = !isWaiting && doubtLabel ? doubtLabel : teamLabel;
  const teamTooltip = [teamLabel !== visibleTeamLabel ? teamLabel : null, freshness].filter(Boolean).join(" · ");
  // The cloud becomes the sync action the relation calls for — publish, get,
  // or both — when the relation is known and current. A stale, failed or
  // still-loading answer keeps it a plain fact: it is not a state to act from.
  const isCurrent = !isWaiting && !teamSync.error && !teamSync.isStale;
  const knownAction = teamSyncAction(teamSync.status, t, { onPublish, onGetChanges, onGetAndPublish });
  const syncAction = isCurrent ? knownAction : null;
  const syncActionTooltip = syncAction ? [syncAction.label, freshness].filter(Boolean).join(" · ") : null;
  // At rest the strip says how fresh "up to date" is, so the reader does not
  // have to hover to trust it. It rides the check, the gesture that renews it.
  const checkedAt = teamSync.status?.checkedAt ?? null;
  const upToDateAge = teamSync.status?.state === "upToDate" && teamSync.status.knowledge !== "cached" && checkedAt !== null
    ? formatRelativeCheckTime(checkedAt, now, formats.language, t.statusBarJustNow)
    : null;
  const restingAge = isCurrent ? upToDateAge : null;
  const changesLabel = workingTreeLabel(workingTree, workingTreeError, isCheckingChanges, t);
  // The working tree rides the branch it belongs to: a dot after the branch's
  // name while there is unsaved work, the sentence in its tooltip and for the
  // screen reader. How much moved is Overview's and Changes' to say.
  const workingTreeState = isCheckingChanges
    ? "checking"
    : workingTreeError
      ? "error"
      : workingTree && !workingTree.isClean
        ? "unsaved"
        : "clean";
  const canCheckTeam = Boolean(
    project?.headState === "branch" &&
    project.branch &&
    !isWaiting,
  );
  const isBusy = Boolean(project && (isCheckingChanges || teamSync.isLoading || teamSync.isCheckingRemote));
  // With its age beside it the check already says "up to date"; the word stays
  // for the screen reader and comes back whenever there is no age to show.
  const hidesTeamWord = restingAge !== null;
  // While a check or the first read runs, the fact keeps saying what it last
  // knew — "Publish 12 versions", "3 min ago", "Check failed" — in the quiet
  // ink with its glyph turned spinner, so neither its words nor its width jump
  // to "Checking the remote…" and back. A stale answer holds the state itself,
  // never its "Check again": that would ask for the check already running.
  // That sentence stays the tooltip's and the screen reader's. With nothing
  // known yet it is the visible words too.
  const heldLabel = isWaiting && teamSync.status
    ? (teamSync.error ? t.statusBarCheckFailed : null)
      ?? knownAction?.label
      ?? upToDateAge
      ?? teamStateLabel(teamSync.status.state, teamSync.status.ahead, teamSync.status.behind, t)
    : null;
  const syncIcon = isWaiting
    ? <LoaderCircle className="icon--spinning" aria-hidden="true" />
    : tone === "success"
      ? <CloudCheck aria-hidden="true" />
      : tone === "warning"
        ? <CloudAlert aria-hidden="true" />
        : <Cloud aria-hidden="true" />;

  // The explicit check, in every state, as the second segment of the remote
  // block: the gesture right after the fact it renews. It is the strip's only
  // way to ask when automatic checks are set to manual, so it never leaves.
  const checkButton = (
    <button
      className="status-bar__seg status-bar__refresh"
      type="button"
      disabled={!canCheckTeam}
      onClick={onCheckTeamChanges}
      aria-label={teamSync.isCheckingRemote ? t.statusBarCheckingTeam : t.statusBarCheckNow}
      data-tooltip={teamSync.isCheckingRemote ? t.statusBarCheckingTeam : t.statusBarCheckNow}
    >
      {restingAge && <span className="status-bar__sync-age">{restingAge}</span>}
      <RotateCw aria-hidden="true" />
    </button>
  );

  return (
    <footer className="status-bar" aria-label={t.statusBarAriaLabel} aria-busy={isBusy}>
      {/* The one persistent statement of what is being worked on — which
          project, and which branch of it — and the one place to change either.
          Two segments of the same shape, each a glyph, a name and a chevron,
          so they read as two controls side by side rather than one path. */}
      <span className="status-bar__block status-bar__block--where">
        <ProjectQuickSwitch {...projectSwitch} />
        {project && (
          <>
            <BranchQuickSwitch
              snapshot={branches}
              isLoadingSnapshot={isLoadingBranches}
              currentValue={branchLabel(project, t)}
              canSwitch={project.headState === "branch" && Boolean(project.branch)}
              variant="status"
              favouriteBranches={favouriteBranches}
              onToggleFavourite={onToggleFavouriteBranch}
              onSwitch={onSwitchBranch}
              onBringIn={onBringIn}
              create={branchCreate}
              onSeeAll={onSeeAllBranches}
              workingTree={{ state: workingTreeState, description: changesLabel }}
            />
            <span className="visually-hidden">{changesLabel}</span>
          </>
        )}
      </span>

      {/* The field: the app's search. Typing filters the palette above it,
          and its shortcut (announced, not drawn) starts a search from
          anywhere; the results deploy from this control (see CommandPalette). */}
      <div className="status-bar__search-slot">
        <div className={`status-bar__search${commandPalette.isOpen ? " status-bar__search--open" : ""}`} data-palette-field="">
          <Search aria-hidden="true" />
          <input
            ref={commandPalette.inputRef}
            className="status-bar__search-input"
            type="text"
            role="combobox"
            aria-expanded={commandPalette.isOpen}
            aria-controls={commandPalette.isOpen ? "palette-list" : undefined}
            aria-activedescendant={commandPalette.isOpen ? commandPalette.selectedOptionId : undefined}
                  aria-autocomplete="list"
                  aria-keyshortcuts={commandPalette.keyShortcuts}
                  aria-label={t.statusBarSearchLabel}
                  placeholder={t.statusBarSearch}
                  autoComplete="off"
                  spellCheck={false}
                  value={commandPalette.query}
            onChange={(event) => commandPalette.onQueryChange(event.target.value)}
            onFocus={commandPalette.onOpen}
            onClick={commandPalette.onOpen}
            onKeyDown={commandPalette.onKeyDown}
          />
        </div>
      </div>

      {project && (
        // The remote block: two segments of the project block's size, weight
        // and hover, with no mark between them — the fact and the check are
        // told apart by their glyphs, so the block reads as one phrase. The
        // first is the state and its press; the second is the check. Neither
        // block holds a fill at rest — the fill is what hovering or pressing a
        // segment looks like — and a state that calls for a sync keeps its
        // accent glyph and says its verb in words instead of filling the block.
        <span className="status-bar__block status-bar__block--remote" aria-live="polite">
          {syncAction ? (
            <button
              className={`status-bar__seg status-bar__sync status-bar__sync-action status-bar__sync-action--${syncAction.kind}`}
              type="button"
              onClick={syncAction.onClick}
              aria-label={syncAction.label}
              data-tooltip={syncActionTooltip ?? undefined}
            >
              {syncAction.icon}
              <span>{syncAction.label}</span>
            </button>
          ) : heldLabel ? (
            <span
              className="status-bar__seg status-bar__seg--fact status-bar__sync status-bar__sync--held"
              data-tooltip={[teamLabel, freshness].filter(Boolean).join(" · ")}
            >
              {syncIcon}
              <span aria-hidden="true">{heldLabel}</span>
              <span className="visually-hidden">{teamLabel}</span>
            </span>
          ) : (
            // The state is a press like the project's and the branch's: it says
            // the relation and renews it. Its name says both, so it is never
            // mistaken for a label that does nothing. A word that is already
            // the action ("Check again") does not have the action restated
            // after it, so its name starts from the state it doubts.
            <button
              className={`status-bar__seg status-bar__sync status-bar__sync--${tone}`}
              type="button"
              disabled={!canCheckTeam}
              onClick={onCheckTeamChanges}
              aria-label={[doubtLabel ? teamLabel : visibleTeamLabel, t.statusBarCheckNow].filter(Boolean).join(" · ")}
              data-tooltip={[
                doubtLabel ? null : (hidesTeamWord ? visibleTeamLabel : null),
                teamTooltip,
                doubtLabel ? null : t.statusBarCheckNow,
              ].filter(Boolean).join(" · ")}
            >
              {syncIcon}
              <span className={hidesTeamWord ? "visually-hidden" : undefined}>{visibleTeamLabel}</span>
              {teamTooltip && <span className="visually-hidden"> · {teamTooltip}</span>}
            </button>
          )}
          {checkButton}
        </span>
      )}
    </footer>
  );
}
