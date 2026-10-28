import React, { Suspense, lazy, useMemo } from "react";
import { FolderOpen, History, Pencil, Settings } from "lucide-react";

import { useLanguage } from "../../i18n";
import {
  LoadingPlaceholder,
  ProjectAvatar,
  type ProjectAvatarStyle,
  type ProjectIconChoice,
  type TechnologyId,
} from "../../shared/ui";
import type { RepositoryInfo } from "../repository";
import type { WorkingTreeStatus } from "../status";
import type { PendingVersionsResult } from "../publish";
import type { HistoryController } from "../history";
import type { BranchesSnapshot } from "../branches";
import type { TeamSyncViewState } from "../sync";
import { deriveJourney } from "./journey";
import { NextStepCard, type NextStepHandlers } from "./NextStepCard";
import { deriveNextStep } from "./nextStep";
import { OverviewNow } from "./OverviewNow";
import { OverviewDetail, overviewDetailMode } from "./OverviewDetail";
import { RemoteHomeCrumb } from "./RemoteHomeCrumb";
import { useActiveWorkDetail, type RemoteHomeState, type WorkDetailController } from "./workDetail";
import { HistoryPlaceholderList, OverviewPlaceholder } from "./OverviewPlaceholder";
import { HomeLauncher, type HomeRecentEntry } from "../home";

const HistorySummarySection = lazy(() =>
  import("./HistorySummarySection").then((m) => ({ default: m.HistorySummarySection })),
);
/** How the project shows itself everywhere else — the rail, the switcher, the
 * recents — so the header can wear the same icon. */
export type OverviewProjectIdentity = {
  iconChoice: ProjectIconChoice;
  technology: TechnologyId | null;
  avatarStyle: ProjectAvatarStyle;
};

/**
 * Who this screen is about, as one row rather than a block: the project's
 * icon and name with its own tools right after it — its folder and its
 * settings, actions on the project the name names — and where it lives as a
 * chip at the far end: the service and its `owner/name`, opening its page,
 * or "Only on this computer". The edge of the row is what leads out of the
 * app, aligned with the next-step card's actions below it. The branch it is on
 * is the status bar's, not repeated here. The path is the folder button's tooltip and the technology
 * is the project's own icon, so neither is spelled out. The next-step card
 * under it is the page's subject; this row only says whose page this is.
 */
function OverviewHeader({
  project,
  identity,
  home,
  onOpenRemoteHome,
  onOpenProjectFolder,
  onOpenProjectSettings,
  onChangeProjectIcon,
  onPrefetchProjectSettings,
}: {
  project: RepositoryInfo;
  identity: OverviewProjectIdentity;
  home: RemoteHomeState;
  /** Opens the named remote's page in the browser. */
  onOpenRemoteHome: (remote: string) => void;
  /** Opens the project's folder in the system file manager. */
  onOpenProjectFolder: () => void;
  /** The same panel the project switcher's gear opens, for the project this
   * header is already about. */
  onOpenProjectSettings: () => void;
  /** The same panel, opened at the project's icon. */
  onChangeProjectIcon: () => void;
  /** Warms that panel's first read on hover; see the switcher's own gear. */
  onPrefetchProjectSettings?: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();

  return (
    <header className="overview-header" aria-labelledby="project-summary-heading">
      <button
        className="overview-header__icon"
        type="button"
        aria-label={t.overviewChangeProjectIcon}
        data-tooltip={t.overviewChangeProjectIcon}
        onPointerEnter={() => onPrefetchProjectSettings?.()}
        onFocus={() => onPrefetchProjectSettings?.()}
        onClick={onChangeProjectIcon}
      >
        <ProjectAvatar
          id={project.path}
          name={project.name}
          className="overview-header__avatar"
          iconChoice={identity.iconChoice}
          technology={identity.technology}
          style={identity.avatarStyle}
        />
        <span className="overview-header__icon-edit" aria-hidden="true">
          <Pencil />
        </span>
      </button>
      <h1 id="project-summary-heading" className="overview-header__name" title={project.name} tabIndex={-1} data-screen-focus>{project.name}</h1>
      <button
        className="overview-header__tool"
        type="button"
        aria-label={t.overviewOpenFolder}
        data-tooltip={`${t.overviewOpenFolder} · ${project.path}`}
        onClick={onOpenProjectFolder}
      >
        <FolderOpen aria-hidden="true" />
      </button>
      <button
        className="overview-header__tool"
        type="button"
        aria-label={t.projectSettingsOpenFor(project.name)}
        data-tooltip={t.projectSettingsOpen}
        onPointerEnter={() => onPrefetchProjectSettings?.()}
        onFocus={() => onPrefetchProjectSettings?.()}
        onClick={onOpenProjectSettings}
      >
        <Settings aria-hidden="true" />
      </button>
      <RemoteHomeCrumb home={home} onOpen={onOpenRemoteHome} />
    </header>
  );
}

export function OverviewPanel({
  project,
  isOpening,
  isRestoring = false,
  workingTree,
  workingTreeError,
  isCheckingChanges,
  onCheckLocalChanges,
  onReviewChanges,
  onOpenConflicts,
  onOpenProject,
  onCreateProject,
  onCloneProject,
  recentProjects,
  onOpenRecentProject,
  onToggleFavouriteRecentProject,
  onForgetRecentProject,
  canPublish,
  onPublish,
  onPublishUpTo,
  pendingVersions,
  pendingVersionsError,
  branches,
  onQuickSwitchBranch,
  onGoToBranches,
  onOpenProjectFolder,
  onOpenRemoteHome,
  onOpenSaveVersion,
  teamSync,
  onCheckTeamChanges,
  onReviewAndGetTeamChanges,
  onGetAndPublish,
  onStopTrackingRemote,
  historyController,
  workDetail,
  onRestoreDiscarded,
  onOpenHistory,
  onOpenProjectSettings,
  onChangeProjectIcon,
  onPrefetchProjectSettings,
  projectIdentity,
  selfEmail = null,
}: {
  project: RepositoryInfo | null;
  /** Only ever drives the *empty*-state's own loading affordance below —
   * opening another project while one is already active must not make the
   * active project's own card look like it's the one being (re)opened. Its
   * failures are reported in a standalone dialog (see `openError` in
   * `App`), never merged into this project's own status. */
  isOpening: boolean;
  /** Launch is still revalidating the projects it will reopen. Overview is
   * already the destination, so the launcher fallback below would flash Home
   * for the length of that check; the screen's own shape stands in instead. */
  isRestoring?: boolean;
  workingTree: WorkingTreeStatus | null;
  workingTreeError: string | null;
  isCheckingChanges: boolean;
  /** Explicit local recovery. Healthy Overview data stays watcher-driven; this
   * action appears only beside a failed local snapshot. */
  onCheckLocalChanges: () => void;
  /** Opens the Changes screen. With a path, that file is selected first, so
   * the Overview preview is a shortcut *to a file*, not just to the screen. */
  onReviewChanges: (path?: string) => void;
  /** Opens the overlapping-changes screen: the way forward from the
   * `conflicts` state, which only that screen can explain. */
  onOpenConflicts: () => void;
  onOpenProject: () => void;
  onCreateProject: () => void;
  onCloneProject: () => void;
  /** Projects opened before on this machine, already in display order
   * (favourites first, then by recency) — read from the app's own stores, not
   * from repository state, so the welcome screen never touches Git to draw
   * them. Empty until one has been opened. */
  recentProjects: readonly HomeRecentEntry[];
  onOpenRecentProject: (path: string) => void;
  /** Marks the *project*, not the row: the same favourites store the rail and
   * the switcher read, so the star survives closing and reopening the app. */
  onToggleFavouriteRecentProject: (path: string) => void;
  onForgetRecentProject: (path: string) => void;
  pendingVersions: PendingVersionsResult;
  pendingVersionsError: string | null;
  /** The project session's cached branch inventory, shared with the
   * Branches screen so Overview's quick-switch menu opens instantly instead of
   * reading branches again every time (task 019). */
  branches: BranchesSnapshot | null;
  canPublish: boolean;
  onPublish: () => void;
  onPublishUpTo: (commit: string) => void;
  onQuickSwitchBranch: (target: string) => void;
  onGoToBranches: () => void;
  /** Opens the project's folder in the system file manager, from the
   * header's folder button. */
  onOpenProjectFolder: () => void;
  /** Opens the named remote's web page, from the header's chip. */
  onOpenRemoteHome: (remote: string) => void;
  /** Opens this project's own settings — the remote it publishes to, the files
   * it ignores, and the identity it saves as. */
  onOpenProjectSettings: () => void;
  /** Opens the same panel at the project's icon, from the header's tile. */
  onChangeProjectIcon: () => void;
  /** Warms that panel's first read on hover, so opening it is not a wait. */
  onPrefetchProjectSettings?: () => void;
  /** The open project's icon, as the rail resolves it. */
  projectIdentity: OverviewProjectIdentity;
  /** The user's own Git email, so Recent history can say "You" for their
   * versions. `null` until it has been read, or when none is set. */
  selfEmail?: string | null;
  /** Opens the save-version flow. Overview has no file-selection UI of its
   * own to drive `SaveVersionDialog`'s exclusion checkboxes, so — like
   * `BranchesPanel` and `SwitchBranchDialog`'s own `onSaveVersion`
   * — this is expected to navigate to Changes and open the dialog there,
   * reusing its one existing implementation rather than a second copy of it. */
  onOpenSaveVersion: () => void;
  teamSync: TeamSyncViewState;
  onCheckTeamChanges: () => void;
  onReviewAndGetTeamChanges: () => void;
  /** Gets the remote's versions, combines them and publishes, in one
   * confirmation. */
  onGetAndPublish: () => void;
  /** The branch forgets the remote branch it tracked — offered once that
   * branch is gone from the remote. */
  onStopTrackingRemote: () => void;
  /** The same project-scoped cache used by the full History screen. Overview
   * subscribes only while visible and never starts a second repository read. */
  historyController: HistoryController;
  /** Overview's cache: the files of the unpublished versions, the newest
   * restorable discard and where the project lives, filled by the
   * composition root. */
  workDetail: WorkDetailController;
  /** Opens the restore picker over the Overview, from the side column's
   * discarded-changes card, on the given copy when one is. */
  onRestoreDiscarded: (recoveryId?: string) => void;
  onOpenHistory: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const query = useMemo(
    () => ({ projectId: project?.path ?? "", sessionEpoch: project?.sessionEpoch ?? "" }),
    [project?.path, project?.sessionEpoch],
  );
  const { home } = useActiveWorkDetail(workDetail, query);

  if (project) {
    const journey = deriveJourney({
      workingTree,
      workingTreeError,
      isCheckingChanges,
      pendingVersionsCount: pendingVersions.totalCount,
      pendingVersionsError,
      teamSync,
    });
    // Where a branch whose remote branch is gone usually goes next: the
    // remote's default branch, when this isn't it.
    const defaultBranch = branches?.branches.find((branch) => branch.isDefault && !branch.isActive)?.name ?? null;
    const nextStep = deriveNextStep(journey, { canPublish, defaultBranch });
    const isRefreshing = isCheckingChanges || teamSync.isCheckingRemote;
    // Only a branch with an upstream can be checked against one; the same gate
    // the status bar's own cloud button uses.
    const canCheckTeamChanges =
      project.headState === "branch" && Boolean(project.branch) && !teamSync.isCheckingRemote;
    const checkTeamChanges = canCheckTeamChanges ? onCheckTeamChanges : () => undefined;
    const nextStepHandlers: NextStepHandlers = {
      save: onOpenSaveVersion,
      reviewChanges: () => onReviewChanges(),
      resolve: onOpenConflicts,
      publish: onPublish,
      openHistory: onOpenHistory,
      getChanges: onReviewAndGetTeamChanges,
      checkRemote: checkTeamChanges,
      checkLocal: onCheckLocalChanges,
      openSettings: onOpenProjectSettings,
      openBranches: onGoToBranches,
      explainIncoming: onReviewAndGetTeamChanges,
      getAndPublish: onGetAndPublish,
      switchToDefault: () => {
        if (defaultBranch) onQuickSwitchBranch(defaultBranch);
      },
      stopTracking: onStopTrackingRemote,
    };
    // Versions waiting on the remote lead the timeline, above "now", which is
    // where they stand in time.
    const incoming =
      (journey.publish.state === "behind" || journey.publish.state === "diverged") && journey.publish.behind > 0
        ? { count: journey.publish.behind, remote: journey.publish.remote, onGet: onReviewAndGetTeamChanges }
        : null;

    return (
      <div className="project-overview" aria-busy={isRefreshing}>
        <OverviewHeader
          project={project}
          identity={projectIdentity}
          home={home}
          onOpenRemoteHome={onOpenRemoteHome}
          onOpenProjectFolder={onOpenProjectFolder}
          onOpenProjectSettings={onOpenProjectSettings}
          onChangeProjectIcon={onChangeProjectIcon}
          onPrefetchProjectSettings={onPrefetchProjectSettings}
        />

        <NextStepCard nextStep={nextStep} journey={journey} handlers={nextStepHandlers} defaultBranch={defaultBranch} />

        {/* Where the work is, as one timeline — waiting on the remote, now,
            only on this computer, published — beside what the next step will
            move. */}
        <div className="overview-body">
          <Suspense
            fallback={
              // The section's code is still arriving: the same shape its own
              // first read draws, so nothing changes when it lands.
              <section className="overview-history" aria-labelledby="overview-history-title">
                <header className="overview-history__header">
                  <h2 id="overview-history-title">
                    <History className="overview-history__glyph" aria-hidden="true" />
                    {t.overviewHistoryTitle}
                  </h2>
                </header>
                <LoadingPlaceholder label={t.overviewHistoryLoading}>
                  <HistoryPlaceholderList />
                </LoadingPlaceholder>
              </section>
            }
          >
            <HistorySummarySection
              controller={historyController}
              projectPath={project.path}
              sessionEpoch={project.sessionEpoch}
              canPublish={canPublish}
              onOpenHistory={onOpenHistory}
              onPublishUpTo={onPublishUpTo}
              selfEmail={selfEmail}
              incoming={incoming}
              hasNoRemote={journey.publish.state === "noRemote"}
              remoteBranchGone={journey.publish.state === "upstreamGone"}
              now={
                <OverviewNow
                  workingTree={workingTree}
                  workingTreeError={workingTreeError}
                  isCheckingChanges={isCheckingChanges}
                  onReview={() => onReviewChanges()}
                  onCheckAgain={onCheckLocalChanges}
                />
              }
            />
          </Suspense>

          <OverviewDetail
            mode={overviewDetailMode(journey)}
            journey={journey}
            workingTree={workingTree}
            pendingVersions={pendingVersions}
            workDetail={workDetail}
            projectPath={project.path}
            sessionEpoch={project.sessionEpoch}
            onReviewChanges={onReviewChanges}
            onResolve={onOpenConflicts}
            onGetChanges={onReviewAndGetTeamChanges}
            onOpenHistory={onOpenHistory}
            onRestoreDiscarded={onRestoreDiscarded}
          />
        </div>
      </div>
    );
  }

  if (isRestoring) {
    return <OverviewPlaceholder />;
  }

  return (
    <HomeLauncher
      isOpening={isOpening}
      recentProjects={recentProjects}
      onOpenProject={onOpenProject}
      onCreateProject={onCreateProject}
      onCloneProject={onCloneProject}
      onOpenRecentProject={onOpenRecentProject}
      onToggleFavouriteRecentProject={onToggleFavouriteRecentProject}
      onForgetRecentProject={onForgetRecentProject}
      playGreeting={false}
    />
  );
}
