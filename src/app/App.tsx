import { gitlabAuthPort, gitlabToolingPort, useGitLabAuth } from "../features/gitlab";
import { githubAuthPort, useGitHubAuth } from "../features/github";
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import {
  Sun,
  Moon,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Copy,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Square,
  UserRound,
  X,
  // Distinct glyphs on purpose: `AlertTriangle` is an alias of `TriangleAlert`,
  // so reusing it would leave the error and needs-attention states identical
  // apart from colour.
  TriangleAlert,
} from "lucide-react";
import { useLanguage } from "../i18n";
import { isAppError, localizeAppError } from "../shared/i18n";
import { isOfficialTheme } from "../shared/theme";
import type { RepositoryInvalidation } from "../runtime/project/invalidation";
import { autoHideScrollbarProps } from "../shared/ui/autoHideScrollbar";
import { ToastProvider, handlePopupMenuKeyDown, usePortalFlyout } from "../shared/ui";
import {
  DiffPreferencesProvider,
  createChangesController,
  changesPort,
  type DirectDiscardOutcome,
  type DiscardDialogRequest,
} from "../features/changes";
import {
  CloneDialog,
  clonePort,
  createCloneController,
  type CloneRepositoriesStart,
  type CloneResult,
} from "../features/clone";
import { accountsPort, useAccounts } from "../features/accounts";
import { AccountControl, createMockAccountController, useAccountModal } from "../features/account";
import { createRepositoryBrowserController, repositoryBrowserPort } from "../features/repository-browser";
import { readHomeAccounts, type HomeSetup } from "../features/home";
import {
  createInitializeProjectController,
  InitializeProjectDialog,
  initializeProjectPort,
  type InitializeProjectResult,
  type InitializeTargetKind,
} from "../features/initialize-project";
import {
  NotificationCenter,
  useNotificationCenter,
  type AppNotification,
} from "../features/notifications";
import {
  createSaveVersionController,
  previewFromWorkingTree,
  SaveVersionDialog,
  saveVersionPort,
} from "../features/save-version";
import {
  createRepositoryController,
  createRepositoryReadCoordinator,
  repositoryPort,
  type RepositoryInfo,
} from "../features/repository";
import { createStatusController, statusPort, type StatusErrorMapper } from "../features/status";
import {
  createSyncController,
  createBringInController,
  bringInPort,
  BringInChangesDialog,
  type IntegrationSource,
  EMPTY_TEAM_SYNC_STATE,
  GetTeamChangesDialog,
  selectTeamSyncState,
  syncPort,
  useAutomaticRemoteCheck,
  isRemoteCheckRecent,
  type GetTeamIntent,
  type SyncErrorMapper,
} from "../features/sync";
import type { PublishResult } from "../features/publish";
import {
  availableSettingsSections,
  settingsPort,
  settingsSectionLabel,
  DEFAULT_BRANCH_FALLBACK,
  readGitVersion,
  useDefaultBranch,
  useGitIdentity,
  useGitTooling,
  useLineEndings,
  type NavigationPreferences,
  type SettingsSection,
  type ThemePreference,
} from "../features/settings";
import {
  createProjectSettingsCache,
  projectSettingsPort,
  warmProjectSettings,
  type ProjectSettingsSection,
} from "../features/project-settings";
import {
  createBranchesController,
  useStoredFavouriteBranches,
  useBranchesState,
  branchesPort,
  type BranchCreateContext,
} from "../features/branches";
import { createHistoryController, historyPort } from "../features/history";
import { conflictsPort, createConflictsController, useConflictsState } from "../features/conflicts";
import {
  appUpdateTranslations,
  appUpdatesPort,
  checksOnOpen,
  finishedDownloadOutOfSight,
  createAppUpdatesController,
  updateMenuLabel,
  updateNeedsAttention,
  useAppUpdatesController,
  type UpdateState,
} from "../features/app-updates";
import { createConsoleSessionStore, useConsoleConfirmChanges } from "../features/console";
import { TooltipHost } from "../shared/ui/tooltip";
import { LoadingBar } from "../shared/ui/loadingBar";
import { AppOverlays } from "./AppOverlays";
import { useIssueReport } from "./useIssueReport";
import { IS_MAC, modifierKeyLabels } from "./branding";
import { CommandPalette, filterAppCommands, paletteMeta, type AppCommand, type AppCommandDraft } from "./CommandPalette";
import {
  CONFIRM_CLOSE_PROJECT_DEFAULT,
  CONFIRM_CLOSE_PROJECT_STORAGE_KEY,
  CONFIRM_DISCARD_DEFAULT,
  CONFIRM_DISCARD_STORAGE_KEY,
  NOTIFICATIONS_DEFAULT,
  NOTIFICATIONS_STORAGE_KEY,
  REOPEN_LAST_PROJECT_DEFAULT,
  REOPEN_LAST_PROJECT_STORAGE_KEY,
  RUN_GIT_HOOKS_DEFAULT,
  RUN_GIT_HOOKS_STORAGE_KEY,
  SIDEBAR_HIDDEN_DEFAULT,
  SIDEBAR_HIDDEN_STORAGE_KEY,
  WATCH_PROJECTS_DEFAULT,
  WATCH_PROJECTS_STORAGE_KEY,
  APP_UPDATE_AUTOMATIC_DEFAULT,
  APP_UPDATE_AUTOMATIC_STORAGE_KEY,
  applyTheme,
  resolveEffectiveThemeScheme,
  useStoredBoolean,
  useStoredFavouriteProjects,
  useStoredProjectAvatarStyle,
  useStoredProjectIconChoices,
  useStoredConsolePreferences,
  useStoredDiffPreferences,
  useStoredNavigationPreferences,
  useStoredRemoteCheckInterval,
  useReducedMotionPreference,
  useThemePreference,
} from "./preferences";
import { startThemeFade } from "./themeTransition";
import { planWatcherChanges } from "./watcherPlan";
import { TitlebarMenu } from "./TitlebarMenu";
import {
  hasNativeMacWindowChrome,
  isAppMenuCommandEnabled,
  planAppMenu,
  useNativeAppMenu,
  type AppMenuCommand,
} from "./nativeAppMenu";
import { nativeAppMenuPort } from "./nativeAppMenuAdapter";
import { RailNav, type RailNavItem } from "./RailNav";
import { StatusBar } from "./StatusBar";
import {
  EMPTY_CHANGES_SELECTION,
  EMPTY_PENDING_VERSIONS,
  getMutationBlocker,
  hasUnsettledOperation,
  initialProjectSessionsState,
  projectSessionsStateToStored,
  readStoredProjects,
  writeStoredProjects,
  type ProjectMutationPhase,
  type ProjectView,
  type WorkbenchTab,
} from "../runtime/project/sessions";
import {
  forgetRecentProject,
  readRecentProjects,
  rememberRecentProject,
  rememberRecentProjectTechnology,
  type RecentProject,
} from "../runtime/project/recentProjects";
import { createProjectRuntime, scheduleIdleTask, useProjectSelector } from "../runtime/project/runtime";
import { useProjectCacheWarming } from "../features/repository";
import {
  type ProjectStatusMark,
  type ProjectSwitcherEntry,
  type ProjectSwitcherRecent,
} from "./project-switcher/ProjectSwitcher";
import { isTechnologyId } from "../shared/ui/projectIdentity";
import { useProjectTechnologies } from "./projectTechnologies";
import { consoleProjectStatus } from "./consoleProjectStatus";
import {
  ChangesPanel,
  ConflictsScreen,
  ConsoleScreen,
  HistoryScreen,
  HomeScreen,
  KeepAliveScreens,
  OverviewPanel,
  NAV_DESTINATIONS,
  BranchesScreen,
  WorkbenchScreen,
  markScreenSwitchIntent,
  prefetchScreenChunks,
  screenRequiresProject,
  type ScreenId,
} from "./screens";
import { previewFromPendingVersions } from "../features/publish/domain";
// The adapter alone, not the feature index: the index carries the publish
// dialog, which stays in its own lazy chunk.
import { publishPort } from "../features/publish/tauriAdapter";
import { createWorkDetailController, newestRestorableDiscard } from "../features/overview/workDetail";
import { overviewPort } from "../features/overview/tauriAdapter";
import "../styles.css";

// Lazily loaded: none of these are needed for Home's first paint, and
// ChangesPanel/PublishDialog/PendingVersions
// pull in the file-type icon set (~70 SVGs). Deferring them keeps the initial
// bundle — and therefore first-paint time — small. The two screen panels live
// in `screens.tsx` next to their registry entries; these are the dialogs,
// which are not screens.
//
// Publish is also warmed with the screen chunks after first paint (below): it
// opens from a click, with no navigation to hide its first chunk load behind.
const loadPublishDialog = () => import("../features/publish/PublishDialog");
const PublishDialog = lazy(() => loadPublishDialog().then((m) => ({ default: m.PublishDialog })));
// Overview's restore picker: the same chunk Changes loads its discard dialog
// from, warmed with Publish for the same reason.
const loadDiscardChangesDialog = () => import("../features/changes/DiscardChangesDialog");
const DiscardChangesDialog = lazy(() => loadDiscardChangesDialog().then((m) => ({ default: m.DiscardChangesDialog })));
const CreateBranchDialog = lazy(() =>
  import("../features/branches/BranchesDialog").then((m) => ({ default: m.CreateBranchDialog })),
);
const SwitchBranchDialog = lazy(() =>
  import("../features/branches/BranchesDialog").then((m) => ({ default: m.SwitchBranchDialog })),
);
/** Kept as a local alias so the many `View` references below stay readable;
 * `screens.tsx` owns the definition and the registry that lists them. */
type View = ScreenId;

const PROJECT_NAV_DESTINATIONS = NAV_DESTINATIONS.filter(
  (destination) => destination.section === "project" && destination.inRail,
);
const DEFAULT_NAVIGATION_PREFERENCES = {
  visibleDestinationIds: PROJECT_NAV_DESTINATIONS.map((destination) => destination.id),
  destinationOrderIds: PROJECT_NAV_DESTINATIONS.map((destination) => destination.id),
  displayMode: "icons-and-text",
} satisfies NavigationPreferences;

type WatcherRegistrationState = "starting" | "watching" | "unavailable";
type WatcherRegistration = { epoch: string; state: WatcherRegistrationState };

/** Suspense fallback for a lazily-loaded view (see `ChangesPanel` below).
 * Only ever visible on the first navigation into that view before its chunk
 * has been fetched — normally masked entirely by the idle-time prefetch in
 * `App.tsx`. */
function ViewLoadingFallback(): React.JSX.Element {
  const { t } = useLanguage();
  return <LoadingBar label={t.commonLoading} />;
}

export function App(): React.JSX.Element {
  const { t, language } = useLanguage();
  const [accountController] = useState(() => import.meta.env.DEV ? createMockAccountController() : null);
  const isAccountModalOpen = useAccountModal(accountController);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  /* Only a restart on the wrong version opens this; every other update state
     lives in Settings › Updates (task 221). */
  const [isAppUpdateOpen, setIsAppUpdateOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  /* Declared beside the Settings flag because `hasBlockingDialog` below reads
     both, and a `const` cannot be read before it exists. */
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [projectSettingsSection, setProjectSettingsSection] =
    useState<ProjectSettingsSection>("remote");
  /* Owned here because the dialog is unmounted on every close: without it each
     opening pays again for the same Git processes. Keyed by project and session
     epoch, so a reopened project never sees the previous session's answers. */
  const projectSettingsCache = useRef(createProjectSettingsCache()).current;
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  /* The field is the app's search: it owns the query and the selection, so the
     panel above it and the input's aria-activedescendant cannot disagree. */
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteSelectedIndex, setPaletteSelectedIndex] = useState(0);
  /* How the last close put the results away: at once when it changed the
     screen or the project, folding back into the field otherwise. Every close
     says which, so no earlier one can leak into the next. */
  const [paletteLeavesAtOnce, setPaletteLeavesAtOnce] = useState(false);
  /* A destination chosen from the palette hands the keyboard to the screen it
     opens; the flag pairs with the tick that wakes the effect below. */
  const paletteFocusPending = useRef(false);
  const [paletteFocusTick, setPaletteFocusTick] = useState(0);
  /* Spelled the way the shortcut sheet spells it: ⌘K on a Mac, Ctrl+K elsewhere.
     The Console's field prints it; the strip's and Home's fields announce it
     to assistive technology instead, in `aria-keyshortcuts` form. */
  const { mod: paletteModifier } = modifierKeyLabels(null);
  const paletteShortcut = IS_MAC ? `${paletteModifier}K` : `${paletteModifier}+K`;
  const paletteKeyShortcuts = IS_MAC ? "Meta+K" : "Control+K";
  const [isCloneOpen, setIsCloneOpen] = useState(false);
  const [watcherRegistrations, setWatcherRegistrations] = useState<Record<string, WatcherRegistration>>({});
  const [repositoryListenerState, setRepositoryListenerState] = useState<"starting" | "listening" | "unavailable">(
    () => "__TAURI_INTERNALS__" in window ? "starting" : "unavailable",
  );
  /* An address pasted into Home's launcher, filled into Clone when it opens;
     every other way into Clone starts empty. */
  const [cloneInitialSource, setCloneInitialSource] = useState("");
  /* Or the provider tab and connection Home's "See all in Clone" came from. */
  const [cloneInitialRepositories, setCloneInitialRepositories] = useState<CloneRepositoriesStart | undefined>(
    undefined,
  );
  const [initializeDialogRequest, setInitializeDialogRequest] = useState<{
    mode: InitializeTargetKind;
    existingPath?: string;
    name?: string;
  } | null>(null);
  const [view, setView] = useState<View>(() =>
    localStorage.getItem("gitodile-reopen-last-project") === "true" && readStoredProjects().order.length > 0
      ? "overview"
      : "home",
  );
  const [homeHistory, setHomeHistory] = useState<{
    projectId: string;
    returnView: ProjectView;
    canGoForward: boolean;
  } | null>(null);
  const hasShownHomeGreeting = useRef(false);
  const previousViewRef = useRef<View>(view);
  useEffect(() => {
    if (previousViewRef.current === "home" && view !== "home") {
      hasShownHomeGreeting.current = true;
    }
    previousViewRef.current = view;
  }, [view]);
  const [theme, setTheme] = useThemePreference();
  const effectiveThemeScheme = resolveEffectiveThemeScheme(theme);
  // A community theme has no official counterpart to flip to, so there the
  // toggle hands control back to the device; from the device or an official
  // theme it flips between the official light and dark. See ADR 0015.
  const themeIsCommunity = theme !== "system" && !isOfficialTheme(theme);
  // `applyTheme` runs alongside `setTheme` because the hook applies the
  // attribute from a passive effect, which is not guaranteed to have run by the
  // time a transition captures the DOM.
  const commitTheme = (next: ThemePreference) => (): void => {
    applyTheme(next);
    setTheme(next);
  };
  // Which animation a theme change gets is a composition decision, not one the
  // Settings feature or the palette should carry: they report the preference
  // the user picked and nothing else.
  const changeTheme = (next: ThemePreference): void => {
    // Re-picking the active option is a no-op, and snapshotting the window to
    // cross-fade it into an identical frame is a no-op with a cost.
    if (next === theme) return;
    startThemeFade(commitTheme(next));
  };
  const toggleTheme = (): void => {
    if (themeIsCommunity) {
      changeTheme("system");
      return;
    }
    changeTheme(effectiveThemeScheme === "dark" ? "gitodile-light" : "gitodile-dark");
  };
  // One control, three meanings: back to the device, or to the other official
  // scheme. The glyph and the accessible name always describe the change the
  // press will make.
  const themeToggle = themeIsCommunity
    ? { label: t.commandUseSystemTheme, glyph: "monitor", icon: <Monitor className="titlebar-theme-icon" aria-hidden="true" /> }
    : effectiveThemeScheme === "dark"
      ? { label: t.titlebarSwitchToLightTheme, glyph: "sun", icon: <Sun className="titlebar-theme-icon" aria-hidden="true" /> }
      : { label: t.titlebarSwitchToDarkTheme, glyph: "moon", icon: <Moon className="titlebar-theme-icon" aria-hidden="true" /> };
  const [projectRuntime] = useState(() => createProjectRuntime(initialProjectSessionsState));
  const [branchesController] = useState(() => createBranchesController(branchesPort));
  const [historyController] = useState(() => createHistoryController(historyPort));
  const [bringInController] = useState(() => createBringInController(bringInPort));
  const [conflictsController] = useState(() => createConflictsController(conflictsPort));
  const [repositoryController] = useState(() => createRepositoryController(repositoryPort));
  const [cloneController] = useState(() => createCloneController(clonePort));
  const [initializeProjectController] = useState(() =>
    createInitializeProjectController(initializeProjectPort),
  );
  const [initialSaveVersionController] = useState(() =>
    createSaveVersionController(saveVersionPort),
  );
  const [statusController] = useState(() => createStatusController(statusPort));
  const [consoleSessions] = useState(createConsoleSessionStore);
  const [changesController] = useState(() => createChangesController(changesPort));
  // Overview's cache: the files the unpublished versions carry, the newest
  // discard that can still be restored, and where the project lives. Filled
  // from here, on project activation and repository invalidations, never
  // because Overview is shown.
  const [workDetailController] = useState(() =>
    createWorkDetailController({
      readCommitFileChanges: (query) => publishPort.readCommitFileChanges(query),
      findRestorableDiscard: async (query) => {
        // Offered whatever the step: a copy only counts as restorable while
        // nothing has been written at its paths. Telling that reads the
        // status and hashes the changed files, but only when copies are
        // stored, and always at an idle moment.
        const records = await changesController.listDiscardRecoveries(query.projectId, query.sessionEpoch);
        return newestRestorableDiscard(records);
      },
      readIncomingVersions: (query) => statusPort.readIncomingVersions(query),
      readRemoteHome: (query) =>
        overviewPort.readRemoteHome({ path: query.projectId, sessionEpoch: query.sessionEpoch }),
    }),
  );
  const [syncController] = useState(() => createSyncController(syncPort));
  // The error mapper is rebuilt whenever the language changes, so subscribers
  // read it through a ref rather than closing over the first render's copy.
  const mapStatusErrorRef = useRef<StatusErrorMapper>(() => "");
  const mapSyncErrorRef = useRef<SyncErrorMapper>(() => "");
  const [repositoryReads] = useState(() =>
    createRepositoryReadCoordinator(repositoryController, [
      {
        id: "status",
        refreshOn: "worktree-change",
        blocking: true,
        refresh: (query) => statusController.invalidate(projectRuntime, query, mapStatusErrorRef.current),
        supersede: (query) => statusController.supersede(query),
      },
      {
        id: "branches",
        refreshOn: "shared-change",
        blocking: false,
        refresh: (query) => branchesController.refresh(query),
        supersede: (query) => branchesController.supersede(query),
      },
      {
        id: "history",
        refreshOn: "shared-change",
        blocking: false,
        refresh: (query) => historyController.refresh(query),
        supersede: (query) => historyController.supersede(query),
      },
      {
        id: "sync",
        refreshOn: "shared-change",
        blocking: false,
        refresh: async (query) => {
          await syncController.refreshLocal(projectRuntime, query, mapSyncErrorRef.current);
        },
        supersede: (query) => syncController.supersede(projectRuntime, query),
      },
      {
        // The forecast of a branch with versions waiting compares them with
        // unsaved work, so a file save can change it (task 161). Only then,
        // and at an idle moment: it is a local read, never a fetch.
        id: "sync-forecast",
        refreshOn: "worktree-change",
        blocking: false,
        refresh: (query) => {
          const { status } = selectTeamSyncState(projectRuntime.getSnapshot(), query.projectId);
          if (status?.state !== "behind" && status?.state !== "diverged") return;
          scheduleIdleTask(() => void syncController.refreshLocal(projectRuntime, query, mapSyncErrorRef.current));
        },
        supersede: () => undefined,
      },
      {
        // A discard changes the working tree, so a worktree invalidation is
        // when a new recovery can have appeared. Speculative for every screen
        // but Overview, so it waits for an idle moment.
        id: "overview-recovery",
        refreshOn: "worktree-change",
        blocking: false,
        refresh: (query) => {
          scheduleIdleTask(() => void workDetailController.refreshRecovery(query));
        },
        supersede: () => undefined,
      },
      {
        // Where the project lives, for Overview's header: remotes live in the
        // config, a shared change. Speculative for every other screen, so it
        // waits for an idle moment.
        id: "overview-remote-home",
        refreshOn: "shared-change",
        blocking: false,
        refresh: (query) => {
          scheduleIdleTask(() => void workDetailController.refreshRemoteHome(query));
        },
        supersede: () => undefined,
      },
    ]),
  );
  const sessionsState = useProjectSelector(projectRuntime, (snapshot) => snapshot);
  const dispatchSessions = projectRuntime.dispatch;
  // The technology detected for each open project, read once per session and
  // cached. The identity chip prefers it over the initials and under a chosen
  // emoji (task 130).
  const technologyTargets = useMemo(
    () =>
      sessionsState.order.map((id) => {
        const session = sessionsState.byId[id];
        return { id, path: session.project.path, sessionEpoch: session.epoch };
      }),
    [sessionsState.order, sessionsState.byId],
  );
  const { technologies: projectTechnologies, failed: technologyFailures } =
    useProjectTechnologies(technologyTargets);
  // Tracks only native watcher registrations. Read generations, mutation
  // deferral and diff retention belong to the feature controllers above.
  const watchedSessionsRef = useRef<Record<string, string>>({});
  const activeSession = sessionsState.activeId ? sessionsState.byId[sessionsState.activeId] : null;
  const activeBranchesQuery = useMemo(
    () => ({ projectId: activeSession?.id ?? "", sessionEpoch: activeSession?.epoch ?? "" }),
    [activeSession?.epoch, activeSession?.id],
  );
  const activeBranches = useBranchesState(branchesController, activeBranchesQuery);
  const activeConflicts = useConflictsState(conflictsController, activeBranchesQuery);
  /** The paused operation, when one was read: Overview, Changes and the
   * palette offer the overlapping-changes screen from the same cached read. */
  const conflictSession = activeConflicts.session ?? null;
  const activeOperationPhase = activeSession?.operation?.phase;
  /** A save, publish, get or branch change of this project still running:
   * the overlapping-changes screen holds its actions until it settles. */
  const isActiveOperationRunning =
    activeOperationPhase !== undefined && activeOperationPhase !== "error" && activeOperationPhase !== "success";
  const project = activeSession?.project ?? null;
  const [favouriteBranches, toggleFavouriteBranch] =
    useStoredFavouriteBranches(project?.commonGitDir ?? null);
  const workingTree = activeSession?.workingTree ?? null;
  const workingTreeError = activeSession?.workingTreeError ?? null;
  const isCheckingChanges = activeSession?.isCheckingChanges ?? false;
  const pendingVersions = activeSession?.pendingVersions ?? EMPTY_PENDING_VERSIONS;
  const pendingVersionsError = activeSession?.pendingVersionsError ?? null;
  const teamSync = activeSession?.teamSync ?? EMPTY_TEAM_SYNC_STATE;
  const consoleStatus = useMemo(
    () => consoleProjectStatus(workingTree, workingTreeError, teamSync),
    [workingTree, workingTreeError, teamSync],
  );
  const mapStatusError = useMemo<StatusErrorMapper>(
    () => (error, area) =>
      localizeAppError(
        error,
        t,
        area === "working-tree" ? t.statusCouldntCheck : t.overviewPendingVersionsError,
      ),
    [t],
  );
  mapStatusErrorRef.current = mapStatusError;
  const mapSyncError = useMemo<SyncErrorMapper>(
    () => (error) => localizeAppError(error, t, t.syncUnavailableTitle),
    [t],
  );
  mapSyncErrorRef.current = mapSyncError;
  const [projectAnnouncement, setProjectAnnouncement] = useState("");
  const [storedProjectsOnLaunch] = useState(readStoredProjects);
  const [recentProjects, setRecentProjects] = useState<readonly RecentProject[]>(readRecentProjects);
  const [hasCompletedSessionRestore, setHasCompletedSessionRestore] = useState(false);

  const navigateToView = (next: View): void => {
    if (next === view) {
      return;
    }
    markScreenSwitchIntent(view, next);
    if (next === "home") {
      setHomeHistory(activeSession ? {
        projectId: activeSession.id,
        returnView: view === "home" ? activeSession.lastView : view,
        canGoForward: false,
      } : null);
    } else {
      setHomeHistory(null);
    }
    if (next !== "home" && sessionsState.activeId) {
      dispatchSessions({ type: "navigate", id: sessionsState.activeId, view: next });
    }
    setView(next);
  };

  /** Work on a given tab. The tab is the session's state rather than a view
   * of its own (task 126): setting it is not a navigation step, so Back from
   * here returns to the previous *screen*, whatever tab it was left on. */
  const openWorkbench = (tab: WorkbenchTab): void => {
    if (sessionsState.activeId) {
      dispatchSessions({ type: "setWorkbenchTab", id: sessionsState.activeId, tab });
    }
    navigateToView("workbench");
  };

  /** Every entry to the overlapping-changes screen is a reader's press, so it
   * may read the session again: that is an explicit refresh, never one caused
   * by the screen becoming visible. */
  const openConflicts = (): void => {
    if (activeSession) {
      void conflictsController.refresh({ projectId: activeSession.id, sessionEpoch: activeSession.epoch });
    }
    navigateToView("conflicts");
  };

  const goBack = (): void => {
    if (view === "home") {
      if (homeHistory && homeHistory.projectId === activeSession?.id) {
        setView(homeHistory.returnView);
        setHomeHistory({ ...homeHistory, canGoForward: true });
      }
      return;
    }
    if (!activeSession || activeSession.viewHistoryIndex === 0) {
      return;
    }
    const nextIndex = activeSession.viewHistoryIndex - 1;
    setHomeHistory(null);
    dispatchSessions({ type: "goBack", id: activeSession.id });
    setView(activeSession.viewHistory[nextIndex]);
  };

  const goForward = (): void => {
    if (homeHistory?.canGoForward && homeHistory.projectId === activeSession?.id && view === homeHistory.returnView) {
      setView("home");
      setHomeHistory({ ...homeHistory, canGoForward: false });
      return;
    }
    if (
      !activeSession ||
      activeSession.viewHistoryIndex >= activeSession.viewHistory.length - 1
    ) {
      return;
    }
    const nextIndex = activeSession.viewHistoryIndex + 1;
    setHomeHistory(null);
    dispatchSessions({ type: "goForward", id: activeSession.id });
    setView(activeSession.viewHistory[nextIndex]);
  };

  const canGoBack = view === "home"
    ? Boolean(homeHistory && homeHistory.projectId === activeSession?.id)
    : Boolean(activeSession && activeSession.viewHistoryIndex > 0);
  const canGoForward = view !== "home" && (
    Boolean(homeHistory?.canGoForward && homeHistory.projectId === activeSession?.id && view === homeHistory.returnView) ||
    Boolean(
      activeSession &&
        activeSession.viewHistoryIndex < activeSession.viewHistory.length - 1,
    ));
  // The failed-open message and whether its dialog is showing are tracked
  // separately so closing the overlay can clear stale content independently.
  const [openError, setOpenError] = useState<string | null>(null);
  const [openErrorTitle, setOpenErrorTitle] = useState(t.overviewOpenFailedTitle);
  const [isOpenErrorDialogOpen, setIsOpenErrorDialogOpen] = useState(false);
  const [openErrorRecoveryAction, setOpenErrorRecoveryAction] = useState<{
    alternative?: { label: string; onAction: () => void };
    label: string;
    onAction: () => void;
  } | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  /** True only while a drag is actually over the window, so the drop overlay
   * is feedback about a gesture in progress and never app chrome. */
  const [isFolderDropTarget, setIsFolderDropTarget] = useState(false);
  const [publishDialogSessionId, setPublishDialogSessionId] = useState<string | null>(null);
  const [publishUpTo, setPublishUpTo] = useState<string | null>(null);
  const [saveDialogSessionId, setSaveDialogSessionId] = useState<string | null>(null);
  /* Get project changes can end in "save your changes first". Save version
     opens only once that dialog has closed and its operation has finished, or
     the mutation guard would still see the sync running and refuse. */
  const [saveAfterSyncSessionId, setSaveAfterSyncSessionId] = useState<string | null>(null);
  const [bringInDialog, setBringInDialog] = useState<{ sessionId: string; source: IntegrationSource | null } | null>(null);
  const bringInSession = bringInDialog ? sessionsState.byId[bringInDialog.sessionId] ?? null : null;
  const [getTeamDialogSessionId, setGetTeamDialogSessionId] = useState<string | null>(null);
  /* Whether Get project changes was asked for on its own or to publish
     afterwards (the remote moved on first). */
  const [getTeamIntent, setGetTeamIntent] = useState<GetTeamIntent>("get");
  /* Publish can end in "get the remote's versions first". Get opens once the
     publish dialog has closed and its operation has finished, as above. */
  const [getAfterPublishSessionId, setGetAfterPublishSessionId] = useState<string | null>(null);
  // App-wide bounded quick-switch and Overview's quick-create are distinct
  // from the Branches screen's own dialog state because neither entry point is
  // inside that screen's React subtree. All use the feature-owned dialogs and
  // port, so the safety plan stays identical whichever shortcut was used.
  const [branchSwitchTarget, setBranchSwitchTarget] = useState<string | null>(null);
  const [createBranchRequest, setCreateBranchRequest] = useState<
    { forceSwitch: boolean; startVersion?: { commit: string; shortCommit: string; subject: string } | null } | null
  >(null);
  const [branchesAutoOpenCreate, setBranchesAutoOpenCreate] = useState(false);
  /* Where one screen asked another to look. Both are consumed once and cleared
     by the screen that takes them: `KeepAliveScreens` holds every visited
     screen mounted for the session, so a target left standing would re-apply on
     the next render here and quietly undo whatever the reader chose after
     arriving. Neither is persisted — where someone was heading is not durable
     project state. */
  const [historyScopeBranchIntent, setHistoryScopeBranchIntent] = useState<string | null>(null);
  /** A saved version Branches asked History to open, alongside the branch it is on. */
  const [historySelectCommitIntent, setHistorySelectCommitIntent] = useState<string | null>(null);
  // Overview's "Restore" on a discarded change opens the restore picker over
  // the Overview. Closing it leaves the Overview where it was; a restore moves
  // on to Changes, which reports it as it arrives and then clears this.
  // The request is made once per open, so the picker reads its list once.
  const [restoreDialog, setRestoreDialog] = useState<{ sessionId: string; request: DiscardDialogRequest } | null>(null);
  const [changesRestoredElsewhere, setChangesRestoredElsewhere] = useState<DirectDiscardOutcome | null>(null);
  // Counts the picker's closes: one may have deleted stored copies, which
  // Changes' empty state offers a way back to.
  const [recoveriesRevision, setRecoveriesRevision] = useState(0);
  const [linesSelectIntent, setBranchesSelectIntent] = useState<string | null>(null);
  const restoreDialogSession = restoreDialog
    ? sessionsState.byId[restoreDialog.sessionId] ?? null
    : null;
  const publishDialogSession = publishDialogSessionId
    ? sessionsState.byId[publishDialogSessionId] ?? null
    : null;
  const getTeamDialogSession = getTeamDialogSessionId
    ? sessionsState.byId[getTeamDialogSessionId] ?? null
    : null;
  // Blocking rather than retargeting an open confirmation/operation is
  // simpler and safer than reconciling it against a different project mid-
  // flight (see the "Decisions" section of task 012): switching and closing
  // the active project are both disabled while either dialog is open.
  const hasBlockingDialog =
    isAccountModalOpen ||
    isSettingsOpen ||
    // Scoped to one project: switching underneath it would leave the panel
    // reading and writing a repository the app is no longer showing.
    isProjectSettingsOpen ||
    isCloneOpen ||
    initializeDialogRequest !== null ||
    publishDialogSessionId !== null ||
    saveDialogSessionId !== null ||
    getTeamDialogSessionId !== null ||
    bringInDialog !== null ||
    activeSession?.operation?.kind === "branch" ||
    activeSession?.operation?.kind === "discard" ||
    activeSession?.operation?.kind === "resolve";
  const showErrorDialog = (title: string, message: string): void => {
    setOpenErrorTitle(title);
    setOpenError(message);
    setOpenErrorRecoveryAction(null);
    setIsOpenErrorDialogOpen(true);
  };

  /* `sessionId` names the session to operate on when it is not the active one
     yet — the notification centre activates a project and opens its review flow
     in the same gesture, and the activation has not reached this render's
     `activeSession` at that point. Everything below already addresses the
     session by id, so this only replaces where the id comes from. */
  const closeSaveDialog = (): void => {
    if (saveDialogSessionId) {
      finishSessionOperation(saveDialogSessionId);
    }
    setSaveDialogSessionId(null);
  };
  const setSaveDialogPhase = (phase: ProjectMutationPhase): void => {
    if (saveDialogSessionId) {
      dispatchSessions({ type: "setOperationPhase", id: saveDialogSessionId, phase });
    }
  };

  const startSessionOperation = (
    kind: "save" | "publish" | "discard" | "sync",
    upTo?: string,
    sessionId?: string,
    intent: GetTeamIntent = "get",
  ): boolean => {
    const session = sessionId ? sessionsState.byId[sessionId] : activeSession;
    if (!session) {
      return false;
    }
    const blocker = getMutationBlocker(sessionsState, session.id);
    if (blocker) {
      showErrorDialog(
        t.projectSwitcherOperationIndicator,
        t.projectSwitcherMutationBlocked(blocker.project.name),
      );
      return false;
    }
    dispatchSessions({ type: "startOperation", id: session.id, kind });
    if (kind === "save") {
      setSaveDialogSessionId(session.id);
    } else if (kind === "publish") {
      setPublishUpTo(upTo ?? null);
      setPublishDialogSessionId(session.id);
    } else if (kind === "sync") {
      setGetTeamIntent(intent);
      setGetTeamDialogSessionId(session.id);
    }
    return true;
  };

  /* The read-only check of the remote that Overview, the status bar and
     Changes' settled state all offer: it asks, and never brings anything in. */
  const checkTeamChanges = ({ refreshWorkingTree = false } = {}): void => {
    if (!activeSession) return;
    const { project, epoch } = activeSession;
    void syncController.check(
      projectRuntime,
      { projectId: activeSession.id, sessionEpoch: epoch },
      mapSyncError,
    ).then((status) => {
      // Changes reads ahead/behind from the working-tree snapshot, which hears
      // that the fetch moved the tracking ref only through the watcher.
      if (status && refreshWorkingTree && activeWatcherState !== "watching") {
        void checkWorkingTree(project.path, epoch);
      }
    });
  };

  // Runs on the render after Get project changes closed, when the sessions
  // state no longer holds its operation (see `saveAfterSyncSessionId`).
  const startSessionOperationRef = useRef(startSessionOperation);
  startSessionOperationRef.current = startSessionOperation;
  useEffect(() => {
    if (!saveAfterSyncSessionId || getTeamDialogSessionId) return;
    setSaveAfterSyncSessionId(null);
    startSessionOperationRef.current("save", undefined, saveAfterSyncSessionId);
  }, [getTeamDialogSessionId, saveAfterSyncSessionId]);
  useEffect(() => {
    if (!getAfterPublishSessionId || publishDialogSessionId) return;
    setGetAfterPublishSessionId(null);
    startSessionOperationRef.current("sync", undefined, getAfterPublishSessionId, "getAndPublish");
  }, [getAfterPublishSessionId, publishDialogSessionId]);

  /* The notification centre's one action.

     A notification names the project it happened to, and by the time anyone
     opens the panel that project may no longer be the active one — so the
     action activates it and opens the review flow for that same session in one
     gesture, naming the session explicitly rather than waiting for the
     activation to reach a later render.

     An earlier version parked the id in state and let an effect fire once the
     switch landed. That left an intent nothing was guaranteed to clear: when
     `activateSession` declined — it refuses outright while a blocking dialog is
     open — the parked id survived, and the review dialog appeared out of
     nowhere the next time that project happened to become active.

     A project that has since been closed does nothing at all. The notification
     stays in the list as a record of what happened; it was never a promise that
     the project is still open. */
  const reviewTeamChangesFromNotification = (notification: AppNotification): boolean => {
    const id = notification.projectId;
    if (id === null || !sessionsState.byId[id] || hasBlockingDialog) return false;
    if (sessionsState.activeId !== id) activateSession(id);
    return startSessionOperation("sync", undefined, id);
  };

  /* The same rules for a notification whose way on is Overview's card: a
     closed project does nothing, and a blocking dialog keeps the window where
     it is. */
  const openOverviewFromNotification = (notification: AppNotification): boolean => {
    const id = notification.projectId;
    if (id === null || !sessionsState.byId[id] || hasBlockingDialog) return false;
    if (sessionsState.activeId !== id) activateSession(id);
    navigateToView("overview");
    return true;
  };

  /* A local configuration change the person chose from Overview's card: the
     branch forgets the remote branch that was deleted. The controller commits
     the branch's new status; the rest of the project is read again after it. */
  const stopTrackingRemote = (): void => {
    if (!activeSession) return;
    const path = activeSession.id;
    void syncController
      .stopTracking(projectRuntime, { projectId: path, sessionEpoch: activeSession.epoch })
      .then(() => handleMutationSucceeded(path))
      .catch((error: unknown) =>
        showErrorDialog(t.stopTrackingFailedTitle, localizeAppError(error, t, t.errorGitCommandFailed)),
      );
  };

  /* What every successful publish records, from the publish dialog or after
     Get and publish: a receipt in the notification list (already read: the
     person just watched it succeed), the remote knowledge superseded, the
     pending count settled, and one refresh. */
  const recordPublished = (
    session: { id: string; epoch: string; project: { path: string; name: string } },
    result: PublishResult,
  ): Promise<void> => {
    notificationCenter.notify({
      projectId: session.project.path,
      projectName: session.project.name,
      details: {
        kind: "changesPublished",
        versionCount: result.publishedCount,
        destination: `${result.target.remote}/${result.target.destinationBranch}`,
      },
    });
    const query = { projectId: session.project.path, sessionEpoch: session.epoch };
    syncController.publishedTo(query, result.localBranch);
    syncController.supersede(projectRuntime, query);
    statusController.commitPublishedResult(projectRuntime, query, result.remainingAfterPublish);
    return handleMutationSucceeded(session.project.path);
  };

  const openPublishDialog = (upTo?: string): void => {
    // Both sides have new versions: publishing needs the remote's first, so
    // the one confirmation gets, combines and publishes. A checkpoint
    // (`upTo`) stays a plain publish of saved versions.
    if (upTo === undefined && activeSession?.teamSync.status?.state === "diverged") {
      startSessionOperation("sync", undefined, undefined, "getAndPublish");
      return;
    }
    startSessionOperation("publish", upTo);
  };
  const [skippedRestoreCount, setSkippedRestoreCount] = useState(0);
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
  const gitTooling = useGitTooling(settingsPort);
  const ghTooling = useGitTooling(settingsPort, "gh");
  const glabTooling = useGitTooling(settingsPort, gitlabToolingPort);
  const issueReport = useIssueReport(readGitVersion(gitTooling.diagnostics));
  /* Read once after first paint and kept, like the Git diagnostics above.
     Owned here rather than inside the panel because the shell unmounts the
     panel on every close, which used to throw both answers away and pay for
     them again on the next opening. */
  const gitIdentity = useGitIdentity(settingsPort);
  /* Home's account tabs and status line: the local receipts only (the launch
     sync verifies them, ADR 0027). Read again whenever Settings closes, since
     that is where accounts are connected and removed. */
  const homeAccounts = useAccounts(accountsPort, !isSettingsOpen);
  const [homeRepositoryBrowser] = useState(() => createRepositoryBrowserController(repositoryBrowserPort));
  useEffect(() => {
    homeRepositoryBrowser.reconcile(homeAccounts.catalog?.accounts ?? []);
  }, [homeRepositoryBrowser, homeAccounts.catalog]);
  const defaultBranch = useDefaultBranch(settingsPort);
  const lineEndings = useLineEndings(
    settingsPort,
    activeSession?.id ?? null,
    activeSession?.epoch ?? null,
  );
  /* Not persisted: Settings opens on General unless a caller names a section.
     Every route that genuinely wants a different one — the palette's
     per-section entries, the "Git needs attention" header button, the
     create-project identity link — says so by passing it, so remembering the
     last visit only made the plain open unpredictable. */
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  /* Set by a "What's new" so Settings › Updates opens at that group. */
  const [settingsRevealWhatsNew, setSettingsRevealWhatsNew] = useState(false);
  const gitlabAuth = useGitLabAuth(gitlabAuthPort, isSettingsOpen && settingsSection === "accounts");
  const githubAuth = useGitHubAuth(githubAuthPort, isSettingsOpen && settingsSection === "accounts");
  /* Home's "+" asks for another account, so Accounts opens with its provider
     menu already open. Consumed on arrival: a later visit opens it closed. */
  const [openAccountsMenu, setOpenAccountsMenu] = useState(false);
  const clearAccountsMenu = useCallback(() => setOpenAccountsMenu(false), []);
  /** The one way to open Settings. Callers that want a particular section name
   * it; everyone else gets General. */
  const openSettings = (section: SettingsSection = "general"): void => {
    setSettingsSection(section);
    setSettingsRevealWhatsNew(false);
    setIsSettingsOpen(true);
  };
  /* The per-project panel. Opening it for a project that is not the active one
     activates that project first: everything it reads is scoped to an open
     repository, so the panel and the app must agree on which one that is. */
  const openProjectSettings = (
    id?: string,
    section: ProjectSettingsSection = "remote",
  ): void => {
    if (id && id !== sessionsState.activeId) {
      if (hasBlockingDialog) return;
      activateSession(id);
    }
    setProjectSettingsSection(section);
    setIsProjectSettingsOpen(true);
  };
  /** Opens an open project's folder in the system's file manager. */
  const openProjectFolder = (id: string): void => {
    const session = sessionsState.byId[id];
    if (!session) return;
    void repositoryController
      .openFolder({ path: session.project.path, sessionEpoch: session.epoch })
      .catch((error: unknown) =>
        showErrorDialog(
          t.overviewOpenFolderFailedTitle,
          localizeAppError(error, t, t.overviewOpenFolderFailedMessage),
        ),
      );
  };
  /** Starts the read the panel opens with while the pointer is still on its way
   * to the gear. A user who never opens it pays nothing. */
  const prefetchProjectSettings = (id?: string): void => {
    const session = id ? sessionsState.byId[id] : activeSession;
    if (!session) return;
    warmProjectSettings(projectSettingsCache, projectSettingsPort, {
      path: session.project.path,
      sessionEpoch: session.epoch,
    });
  };
  const [diffPreferences, setDiffPreferences] = useStoredDiffPreferences();
  const [consolePreferences, setConsolePreferences] = useStoredConsolePreferences();
  // Rust holds change confirmations and checks them on every console plan;
  // this copy drives the Settings switch and the console's indicator.
  const consoleConfirmChanges = useConsoleConfirmChanges();
  const [reducedMotion, setReducedMotion] = useReducedMotionPreference();
  const [navigationPreferences, setNavigationPreferences] =
    useStoredNavigationPreferences(DEFAULT_NAVIGATION_PREFERENCES.visibleDestinationIds);
  const [reopenLastProject, setReopenLastProject] = useStoredBoolean(
    REOPEN_LAST_PROJECT_STORAGE_KEY,
    REOPEN_LAST_PROJECT_DEFAULT,
  );
  const [confirmCloseProject, setConfirmCloseProject] = useStoredBoolean(
    CONFIRM_CLOSE_PROJECT_STORAGE_KEY,
    CONFIRM_CLOSE_PROJECT_DEFAULT,
  );
  const [watchProjects, setWatchProjects] = useStoredBoolean(
    WATCH_PROJECTS_STORAGE_KEY,
    WATCH_PROJECTS_DEFAULT,
  );
  const [remoteCheckInterval, setRemoteCheckInterval] = useStoredRemoteCheckInterval();
  const [automaticAppUpdates, setAutomaticAppUpdates] = useStoredBoolean(
    APP_UPDATE_AUTOMATIC_STORAGE_KEY,
    APP_UPDATE_AUTOMATIC_DEFAULT,
  );
  /* The controller outlives every render, so it is handed a stable function
     that forwards to whatever the latest render wants done with a background
     result — recording it in the notification centre, which is created a few
     lines below and re-created when notifications are turned on or off. */
  const backgroundUpdateResultRef = useRef<(state: UpdateState) => void>(() => undefined);
  const [appUpdatesController] = useState(() => createAppUpdatesController(appUpdatesPort, {
    automaticEnabled: automaticAppUpdates,
    onBackgroundCheckSettled: (state) => backgroundUpdateResultRef.current(state),
  }));
  const appUpdates = useAppUpdatesController(appUpdatesController, automaticAppUpdates);
  /** The one way into the app's update: Settings › Updates. A "check" entry
   * checks only from a settled state with nothing offered, so the menu never
   * throws away a download waiting to be installed. */
  const openAppUpdates = ({ check = false, whatsNew = false }: { check?: boolean; whatsNew?: boolean } = {}): void => {
    openSettings("updates");
    setSettingsRevealWhatsNew(whatsNew);
    if (check && checksOnOpen(appUpdatesController.getSnapshot().state)) void appUpdatesController.check();
  };
  const appUpdateMenuLabel = updateMenuLabel(appUpdates.state, language);
  const appUpdateAttention = updateNeedsAttention(appUpdates.state) && "candidate" in appUpdates.state
    ? appUpdateTranslations(language).attention(appUpdates.state.candidate.version)
    : null;
  const activeWatcherRegistration = activeSession ? watcherRegistrations[activeSession.id] : undefined;
  const activeWatcherState: "starting" | "watching" | "off" | "unavailable" =
    !watchProjects
      ? "off"
      : repositoryListenerState !== "listening"
        ? repositoryListenerState
        : activeWatcherRegistration && activeWatcherRegistration.epoch === activeSession?.epoch
          ? activeWatcherRegistration.state
          : "starting";
  const [confirmDiscard, setConfirmDiscard] = useStoredBoolean(
    CONFIRM_DISCARD_STORAGE_KEY,
    CONFIRM_DISCARD_DEFAULT,
  );
  const [notificationsEnabled, setNotificationsEnabled] = useStoredBoolean(
    NOTIFICATIONS_STORAGE_KEY,
    NOTIFICATIONS_DEFAULT,
  );
  /* The composition root owns the notification centre because it is the only
     place that sees every outcome worth recording — the automatic remote check
     it drives, and the publish dialog it hosts. The feature itself starts
     nothing: it is a list and a panel. */
  const notificationCenter = useNotificationCenter(notificationsEnabled);
  /* A startup check that finds a release is news the user did not ask for and
     is not looking at, so it goes where such news goes. A check that finds
     nothing, or fails, records nothing: "still up to date" is not an event,
     and a failed update check is already shown in Settings for whoever cares. */
  backgroundUpdateResultRef.current = (state) => {
    if (state.kind !== "available") return;
    notificationCenter.notify({
      projectId: null,
      projectName: null,
      details: { kind: "appUpdateAvailable", version: state.candidate.version },
    });
  };
  /* A download that finishes while Settings is closed finished out of sight:
     the update's notification moves on to the next step. One the user watched
     in Settings needs no receipt. */
  const previousAppUpdateKind = useRef(appUpdates.state.kind);
  useEffect(() => {
    const version = finishedDownloadOutOfSight(previousAppUpdateKind.current, appUpdates.state, isSettingsOpen);
    previousAppUpdateKind.current = appUpdates.state.kind;
    if (version === null) return;
    notificationCenter.notify({
      projectId: null,
      projectName: null,
      details: { kind: "appUpdateAvailable", version, ready: true },
    });
  }, [appUpdates.state, isSettingsOpen, notificationCenter]);
  /* Travels with every save and publish rather than being read by Rust: it is
     a choice about what this app does with someone's project, not a fact about
     the project, and the command that acts on it is the one that must carry
     it. */
  const [runGitHooks, setRunGitHooks] = useStoredBoolean(
    RUN_GIT_HOOKS_STORAGE_KEY,
    RUN_GIT_HOOKS_DEFAULT,
  );
  // Stored, not per-session: someone who works with the rail collapsed wants
  // it collapsed the next time they open the app, the same as every other
  // chrome preference here.
  const [isSidebarHidden, setIsSidebarHidden] = useStoredBoolean(
    SIDEBAR_HIDDEN_STORAGE_KEY,
    SIDEBAR_HIDDEN_DEFAULT,
  );
  const [favouriteProjectIds, toggleFavouriteProject] = useStoredFavouriteProjects();
  const [projectIconChoices, setProjectIconChoice] = useStoredProjectIconChoices();
  const [projectAvatarStyle, setProjectAvatarStyle] = useStoredProjectAvatarStyle();
  // A short jump menu hanging off the collapse control, for reaching a
  // destination while the rail is away. Hover-opened, so it needs the same
  // grace period any hover menu does: the menu portals to `body` and sits a
  // few pixels below its trigger, and closing on the first `mouseleave` would
  // put the gap between them out of reach.
  const [isJumpMenuOpen, setIsJumpMenuOpen] = useState(false);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const jumpCloseTimer = useRef<number | null>(null);

  const cancelJumpClose = (): void => {
    if (jumpCloseTimer.current !== null) {
      window.clearTimeout(jumpCloseTimer.current);
      jumpCloseTimer.current = null;
    }
  };
  const openJumpMenu = (): void => {
    cancelJumpClose();
    setIsJumpMenuOpen(true);
  };
  const closeJumpMenu = (): void => {
    cancelJumpClose();
    setIsJumpMenuOpen(false);
  };
  const scheduleJumpClose = (): void => {
    cancelJumpClose();
    jumpCloseTimer.current = window.setTimeout(() => {
      jumpCloseTimer.current = null;
      setIsJumpMenuOpen(false);
    }, 260);
  };
  useEffect(() => cancelJumpClose, []);
  /* `"none"`: this is the one flyout in the app that opens on *hover*, and it
     closes itself again when the pointer leaves. Taking the caret as the mouse
     wanders across the collapse button — and then removing the element holding
     it 260ms later — is not something a hover affordance may do. Every other
     flyout opens from a click and does take focus. */
  const { popupRef: jumpMenuRef, style: jumpMenuStyle } = usePortalFlyout(
    isJumpMenuOpen,
    sidebarToggleRef,
    closeJumpMenu,
    "below",
    "none",
  );
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  // The strip's field: the search's own control, and the anchor the results
  // deploy from.
  const commandPaletteAnchorRef = useRef<HTMLInputElement>(null);
  // Console hides the strip and draws its own status line; its field is the
  // anchor there, chosen by the active screen rather than "last mounted" —
  // Console stays mounted while hidden, so a shared ref would be cleared by
  // the strip's unmount without Console re-registering.
  const consolePaletteAnchorRef = useRef<HTMLInputElement>(null);
  const homePaletteAnchorRef = useRef<HTMLInputElement>(null);
  // The field the active screen shows the palette from: the strip's, or the
  // one Console and Home carry in their own status lines (no strip there).
  const paletteAnchorRef = view === "console" ? consolePaletteAnchorRef : view === "home" ? homePaletteAnchorRef : commandPaletteAnchorRef;

  // Whichever path closed the confirmation (Cancel, Escape, or confirming
  // the close), the target it referred to stops being relevant.
  useEffect(() => {
    if (!isCloseConfirmOpen) {
      setCloseTargetId(null);
    }
  }, [isCloseConfirmOpen]);

  // Same idea: once the dialog is gone (Escape, backdrop click, or the
  // button), the message it was showing stops mattering.
  useEffect(() => {
    if (!isOpenErrorDialogOpen) {
      setOpenError(null);
      setOpenErrorRecoveryAction(null);
    }
  }, [isOpenErrorDialogOpen]);

  // Only the order, membership, and active id ever reach storage — no diffs,
  // source contents, credentials, tokens, or raw Git errors (those all live
  // only in `sessionsState.byId`, which never leaves memory).
  useEffect(() => {
    if (!hasCompletedSessionRestore) {
      return;
    }
    writeStoredProjects(projectSessionsStateToStored(sessionsState));
  }, [hasCompletedSessionRestore, sessionsState.order, sessionsState.activeId]);

  // Recents are recorded from *sessions appearing*, not from each open call
  // site: opening a folder, finishing a clone, initializing a project and
  // restoring last session all end in the same `"open"` dispatch, and a
  // per-caller `rememberRecentProject` would have to be added to each one and
  // then kept there. Reopening a project makes its id appear again, which is
  // what promotes it back to the front of the list.
  const recordedProjectIdsRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const opened = sessionsState.order.filter((id) => !recordedProjectIdsRef.current.has(id));
    recordedProjectIdsRef.current = new Set(sessionsState.order);
    if (opened.length === 0) {
      return;
    }
    let entries = recentProjects;
    for (const id of opened) {
      const session = sessionsState.byId[id];
      if (session) entries = rememberRecentProject({ path: id, name: session.project.name });
    }
    setRecentProjects(entries);
    // `recentProjects` is read, never depended on: this effect writes it, and
    // depending on it would re-run the pass it just caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsState.order, sessionsState.byId]);

  // A successful read updates the recent entry once. The welcome list can
  // then show a closed project's last detected mark after an app restart,
  // without reading a repository merely to render that list.
  useEffect(() => {
    let updated: RecentProject[] | null = null;
    for (const project of technologyTargets) {
      if (!projectTechnologies.has(project.id) || technologyFailures.has(project.id)) continue;
      const entries = rememberRecentProjectTechnology(
        project.id,
        projectTechnologies.get(project.id) ?? null,
      );
      if (entries) updated = entries;
    }
    if (updated) setRecentProjects(updated);
  }, [technologyTargets, projectTechnologies, technologyFailures]);

  // The catalog's own polling while busy fills these in as the launch check
  // (ADR 0027) lands; until then Home holds their places.
  const homeAccountState = readHomeAccounts(homeAccounts.catalog, homeAccounts.loaded);
  const homeSetup: HomeSetup = {
    git: {
      state: gitTooling.diagnostics?.state ?? "checking",
      version: gitTooling.diagnostics?.version ?? null,
      isRechecking: gitTooling.isRefreshingDiagnostics,
    },
    identity: gitIdentity.isLoaded ? gitIdentity.identity : null,
    accounts: homeAccountState.accounts,
    pendingAccountKinds: homeAccountState.pendingKinds,
  };

  // Newest first: Home leads with the project to continue and keeps
  // favourites in a tab of their own, so a starred project stays reachable
  // there after it has aged out of the newest few. The star itself is the
  // app's existing project favourite, not a second list-local mark.
  // Open projects stay in the list and say so (task 184): Home shows what is
  // open as well as what was, and the active one is marked like the
  // switcher marks it.
  const recentProjectEntries = recentProjects
    .map((entry) => ({
      ...entry,
      openState: !sessionsState.byId[entry.path]
        ? null
        : entry.path === sessionsState.activeId ? ("active" as const) : ("open" as const),
      isFavourite: favouriteProjectIds.has(entry.path),
      iconChoice: projectIconChoices.get(entry.path) ?? null,
      technology: projectTechnologies.has(entry.path)
        ? (projectTechnologies.get(entry.path) ?? null)
        : (isTechnologyId(entry.technology) ? entry.technology : null),
      avatarStyle: projectAvatarStyle,
    }));

  /* The field keeps the focus while the results are open, so opening and
     closing only resets the query: nothing is captured, and nothing has to be
     given back. */
  const openPalette = (): void => {
    // Already searching: a press or a focus in the field must not wipe what the
    // reader has typed. Only the opening itself resets the query.
    if (isPaletteOpen) return;
    setPaletteQuery("");
    setPaletteSelectedIndex(0);
    setIsPaletteOpen(true);
  };

  /** `atOnce` when the close changes the screen or the project: folding back
   * into the field while the next screen draws read as a stray animation. */
  const closePalette = (atOnce = false): void => {
    setPaletteLeavesAtOnce(atOnce);
    setIsPaletteOpen(false);
    setPaletteQuery("");
    setPaletteSelectedIndex(0);
  };

  const runPaletteCommand = (command: AppCommand | undefined): void => {
    if (!command) return;
    closePalette(command.id.startsWith("go-") || command.id.startsWith("switch-"));
    // A destination gives the keyboard back to the screen it opens; actions
    // and dialogs keep their own focus behaviour.
    if (command.id.startsWith("go-")) {
      paletteFocusPending.current = true;
      setPaletteFocusTick((tick) => tick + 1);
    }
    command.action();
  };

  const checkWorkingTree = async (path: string, requestedEpoch?: string): Promise<void> => {
    const epoch = requestedEpoch ?? sessionsState.byId[path]?.epoch;
    if (epoch) await statusController.refresh(projectRuntime, { projectId: path, sessionEpoch: epoch }, mapStatusError);
  };

  // A successful create/switch/delete on a branch changes `HEAD`, the
  // index, and the working tree — every one of task 016's "Operation
  // coordination and refresh" invalidation targets that already exist in
  // this app. Re-reading the repository facts (branch/head state) through
  // `refreshProject` updates this session without selecting it, and
  // `checkWorkingTree` covers both the working-tree status and the pending-
  // versions list save/publish depend on. Clearing the Changes selection
  // stops a diff/file that may not exist on the new branch from staying
  // "selected". The mutation result is committed directly to the
  // Branches feature controller by both the screen and Overview dialogs,
  // so this callback only refreshes repository facts shared by features.
  const handleBranchChanged = async (path: string): Promise<void> => {
    repositoryReads.discardDeferred(path);
    dispatchSessions({ type: "setChangesSelection", id: path, selection: EMPTY_CHANGES_SELECTION });
    await repositoryReads.refreshAll(projectRuntime, sessionsState, path);
  };

  const handleMutationSucceeded = (path: string): Promise<void> =>
    repositoryReads.refreshAfterMutation(projectRuntime, sessionsState, path);

  /* Branch changes and resolving an overlapping file take the project's
     mutation slot the same way: refused while another project's runs. */
  const startLocalOperation = (path: string, kind: "branch" | "resolve" | "sync"): boolean => {
    const session = sessionsState.byId[path];
    if (!session) {
      return false;
    }
    const blocker = getMutationBlocker(sessionsState, path);
    if (blocker) {
      showErrorDialog(
        t.projectSwitcherOperationIndicator,
        t.projectSwitcherMutationBlocked(blocker.project.name),
      );
      return false;
    }
    dispatchSessions({ type: "startOperation", id: path, kind });
    return true;
  };
  const startBranchOperation = (path: string): boolean => startLocalOperation(path, "branch");
  const openBringIn = (name?: string): void => {
    if (!activeSession || !startLocalOperation(activeSession.id, "sync")) return;
    setBringInDialog({ sessionId: activeSession.id, source: name ? { kind: "localBranch", name } : null });
  };

  const finishSessionOperation = (path: string): void => {
    dispatchSessions({ type: "finishOperation", id: path });
    repositoryReads.finishDeferred(projectRuntime, sessionsState, path);
  };

  const setBranchOperationPhase = (
    path: string,
    phase: "planning" | "executing" | "error" | "success",
  ): void => {
    dispatchSessions({ type: "setOperationPhase", id: path, phase });
  };

  // Switching or opening a project restores that session's last project
  // screen. Home remains independent of the session's own screen history.
  const syncViewToSession = (targetLastView: ProjectView): void => {
    setHomeHistory(null);
    if (view !== targetLastView) {
      setView(targetLastView);
    }
  };

  const activateSession = (id: string): void => {
    if (hasBlockingDialog || (id === sessionsState.activeId && view !== "home")) {
      return;
    }
    const target = sessionsState.byId[id];
    if (!target) {
      return;
    }
    if (id !== sessionsState.activeId) dispatchSessions({ type: "activate", id });
    syncViewToSession(target.lastView);
    setProjectAnnouncement(t.projectSwitcherActiveAnnouncement(target.project.name));
    void repositoryReads.refreshProjectAndWorktree(projectRuntime, projectRuntime.getSnapshot(), target.id);
  };

  /** The one open path. `preselectedPath` skips the folder picker for a folder
   * the user has already named some other way — a row in the welcome screen's
   * recent list, or a folder dropped on the window — so those routes inherit
   * this one's validation, its already-open handling, its announcement, and
   * its "that folder isn't a project yet" recovery instead of copying them. */
  const handleOpenProject = async (preselectedPath?: string): Promise<void> => {
    // `isOpening` guards the one route that can arrive unprompted: a second
    // folder dropped while the first is still opening would run two
    // `open_repository` calls against a single in-flight flag, and the first
    // to finish would clear it under the second. The picker and the recent
    // rows cannot reach this — their controls are disabled meanwhile.
    if (hasBlockingDialog || isOpening) {
      return;
    }
    setOpenError(null);
    let selectedPath: string | null = null;
    try {
      const selected =
        preselectedPath ??
        (await openFolderDialog({ directory: true, multiple: false, title: t.overviewOpenDialogTitle }));
      if (!selected || Array.isArray(selected)) {
        return;
      }
      selectedPath = selected;
      setIsOpening(true);
      const info = await repositoryController.open({ selectedPath: selected });
      // Opening an already-open worktree activates it instead of duplicating
      // it — `existing` is read before dispatching so its (possibly stale)
      // `lastView` is available for `syncViewToSession` below.
      const existing = sessionsState.byId[info.path];
      dispatchSessions({ type: "open", project: info });
      syncViewToSession(existing?.lastView ?? "overview");
      setProjectAnnouncement(t.projectSwitcherActiveAnnouncement(info.name));
      if (!existing) void checkWorkingTree(info.path, info.sessionEpoch);
    } catch (error) {
      // Opening failures belong only to the attempted path; existing
      // sessions are never touched by a failed `open_repository` call. When
      // a project is already active, this is reported in its own dialog
      // rather than inside that project's Overview card — otherwise it
      // would read as if the *active* project were the one that failed.
      setOpenErrorTitle(t.overviewOpenFailedTitle);
      setOpenError(localizeAppError(error, t, t.overviewCouldntOpenFolder));
      setOpenErrorRecoveryAction(
        selectedPath && isAppError(error) && error.code === "not_repository"
          ? {
              label: t.openErrorTurnIntoProject,
              onAction: () => {
                setIsOpenErrorDialogOpen(false);
                setInitializeDialogRequest({ mode: "existing-folder", existingPath: selectedPath ?? undefined });
              },
              // The message names two ways out, so the dialog offers both.
              alternative: {
                label: t.openErrorChooseAnother,
                onAction: () => {
                  setIsOpenErrorDialogOpen(false);
                  void handleOpenProjectRef.current();
                },
              },
            }
          : null,
      );
      setIsOpenErrorDialogOpen(true);
    } finally {
      setIsOpening(false);
    }
  };

  const handleVerifiedClone = async (cloneResult: CloneResult): Promise<void> => {
    const info = await repositoryController.open({ selectedPath: cloneResult.destinationPath });
    const existing = sessionsState.byId[info.path];
    dispatchSessions({ type: "open", project: info });
    syncViewToSession(existing?.lastView ?? "overview");
    setProjectAnnouncement(t.projectSwitcherActiveAnnouncement(info.name));
    if (!existing) void checkWorkingTree(info.path, info.sessionEpoch);
  };

  const handleInitializedProject = async (
    initializeResult: InitializeProjectResult,
    isCurrent: () => boolean,
  ): Promise<RepositoryInfo | null> => {
    const info = await repositoryController.open({ selectedPath: initializeResult.destinationPath });
    if (!isCurrent()) {
      await invoke("close_project_session", {
        path: info.path,
        sessionEpoch: info.sessionEpoch,
      }).catch(() => undefined);
      return null;
    }
    const existing = sessionsState.byId[info.path];
    dispatchSessions({ type: "open", project: info });
    syncViewToSession(existing?.lastView ?? "overview");
    setProjectAnnouncement(t.projectSwitcherActiveAnnouncement(info.name));
    if (!existing) void checkWorkingTree(info.path, info.sessionEpoch);
    return info;
  };

  // Restores the previous session's open projects exactly once, on launch.
  // Every stored path is revalidated through `open_repository` concurrently;
  // one that's missing, unreadable, or no longer a repository is skipped
  // without blocking the rest, and only a count of skipped projects is
  // surfaced — never the raw Git error. The survivors land in one `restore`
  // dispatch, so Overview's first project is the one the user left active
  // rather than each stored project flashing past in turn.
  useEffect(() => {
    if (!reopenLastProject) {
      setHasCompletedSessionRestore(true);
      return;
    }
    const stored = storedProjectsOnLaunch;
    if (stored.order.length === 0) {
      setHasCompletedSessionRestore(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const results = await Promise.allSettled(
        stored.order.map((path) => repositoryController.open({ selectedPath: path })),
      );
      if (cancelled) {
        return;
      }
      const restored = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
      const skipped = results.length - restored.length;
      dispatchSessions({ type: "restore", projects: restored, activeId: stored.activeId });
      for (const info of restored) {
        void checkWorkingTree(info.path, info.sessionEpoch);
      }
      const snapshot = projectRuntime.getSnapshot();
      setView(snapshot.activeId ? snapshot.byId[snapshot.activeId].lastView : "home");
      if (skipped > 0) {
        setSkippedRestoreCount(skipped);
      }
      setHasCompletedSessionRestore(true);
    })();
    return () => {
      cancelled = true;
    };
    // Only ever run once, on launch — reopenLastProject changing later
    // shouldn't retroactively restore or discard anything mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projectPath = project?.path ?? null;
  /* Where the quick switches in the status bar and on Overview make a new
     branch, inside their own popup: the lock every branch change takes,
     and on success the same hand-back the create dialog gives — the session
     cache first, then everything that depends on which branch is active. */
  const branchCreate: BranchCreateContext | undefined =
    project && activeSession
      ? {
          projectPath: project.path,
          sessionEpoch: activeSession.epoch,
          onOperationStart: () => startBranchOperation(project.path),
          onOperationFinish: () => finishSessionOperation(project.path),
          onOperationPhaseChange: (phase) => setBranchOperationPhase(project.path, phase),
          onCreated: (snapshot) => {
            branchesController.commit(activeBranchesQuery, snapshot);
            void handleBranchChanged(project.path);
            finishSessionOperation(project.path);
          },
        }
      : undefined;
  // `pendingVersions` is the real, local-only list of not-yet-published
  // saved versions (see `list_unpublished_versions`'s doc comment for the
  // "cached, possibly optimistic" caveat — it reflects the last-known
  // remote-tracking state, not a fresh preflight). Its length is a more
  // accurate publish-entry-point signal than the old ahead-count heuristic,
  // since it already accounts for the no-upstream-yet case (everything
  // local is reported as pending) with no extra branching needed here.
  // When the unpublished list changes — after a save, a publish, an
  // invalidation — read the files of the versions not seen yet. Saved versions
  // never change, so each is read once per session.
  const activeSessionId = activeSession?.id ?? null;
  const activeSessionEpoch = activeSession?.epoch ?? null;
  useEffect(() => {
    if (!activeSessionId || !activeSessionEpoch || pendingVersions.versions.length === 0) return undefined;
    const commits = pendingVersions.versions.map((version) => version.commit);
    return scheduleIdleTask(() => {
      void workDetailController.ensureCommitFiles(
        { projectId: activeSessionId, sessionEpoch: activeSessionEpoch },
        commits,
      );
    });
  }, [activeSessionId, activeSessionEpoch, pendingVersions, workDetailController]);
  // A project becoming active reads its restorable discards once; after
  // that, working-tree invalidations do.
  useEffect(() => {
    if (!activeSessionId || !activeSessionEpoch) return undefined;
    return scheduleIdleTask(() => {
      void workDetailController.refreshRecovery({ projectId: activeSessionId, sessionEpoch: activeSessionEpoch });
    });
  }, [activeSessionId, activeSessionEpoch, workDetailController]);
  // Where the active project lives, for Overview's header: read the first
  // time the project becomes active, at an idle moment; switching back to it
  // reads nothing, and a config change reads it again through the shared
  // invalidation above.
  useEffect(() => {
    if (!activeSessionId || !activeSessionEpoch) return undefined;
    const query = { projectId: activeSessionId, sessionEpoch: activeSessionEpoch };
    if (workDetailController.getSnapshot(query).home.status === "ready") return undefined;
    return scheduleIdleTask(() => {
      void workDetailController.refreshRemoteHome(query);
    });
  }, [activeSessionId, activeSessionEpoch, workDetailController]);
  // When a remote check finds versions waiting, name them: read locally from
  // the tracking ref the check just moved, once per pair of commits.
  const incomingKey =
    teamSync.status && teamSync.status.behind > 0
      ? `${teamSync.status.localCommit ?? ""}..${teamSync.status.remoteCommit ?? ""}`
      : null;
  useEffect(() => {
    if (!activeSessionId || !activeSessionEpoch) return undefined;
    const query = { projectId: activeSessionId, sessionEpoch: activeSessionEpoch };
    if (!incomingKey) {
      workDetailController.clearIncoming(query);
      return undefined;
    }
    return scheduleIdleTask(() => {
      void workDetailController.ensureIncoming(query, incomingKey);
    });
  }, [activeSessionId, activeSessionEpoch, incomingKey, workDetailController]);
  // The current branch, while its remote branch is known to be deleted: Branches
  // and History name it, since Git's own `[gone]` needs the tracking ref gone.
  const upstreamGoneBranch =
    teamSync.status?.state === "upstreamGone" ? teamSync.status.localBranch : null;
  const canPublish = Boolean(
    project &&
      project.headState === "branch" &&
      // A branch whose remote branch is gone can be published again on purpose,
      // and one with no destination yet gets one by publishing — even when
      // every version is already on the remote's other branches.
      (pendingVersions.totalCount > 0 ||
        pendingVersionsError ||
        teamSync.status?.state === "upstreamGone" ||
        teamSync.status?.state === "noUpstream"),
  );

  // Typed watcher invalidations are scoped to one Rust-issued session epoch
  // and strictly increasing sequence. The listener lives once; this ref keeps
  // it pointed at the current immutable session state.
  const handleRepositoryChangedRef = useRef<(event: RepositoryInvalidation) => void>(() => {});
  handleRepositoryChangedRef.current = (event: RepositoryInvalidation) => {
    repositoryReads.handleInvalidation(projectRuntime, sessionsState, event);
  };

  useEffect(() => {
    // Outside Tauri (tests, a plain `vite dev`) there is no event bus to
    // listen on, and the manual refresh path is unaffected.
    if (!("__TAURI_INTERNALS__" in window)) {
      return undefined;
    }
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<RepositoryInvalidation>("repository-changed", (event) => {
      handleRepositoryChangedRef.current(event.payload);
    })
      .then((stop) => {
        if (cancelled) {
          stop();
        } else {
          unlisten = stop;
          setRepositoryListenerState("listening");
        }
      })
      .catch(() => {
        // A listener that can't be registered leaves the app exactly as it
        // was before this feature: manual refreshes only.
        if (!cancelled) setRepositoryListenerState("unavailable");
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  /* What History may ask of a branch, and the flow each request is
     handed to. History never mutates a repository itself: switching runs the
     same previewed dialog the status bar and the Branches screen run, creating
     runs the same create dialog, and viewing is navigation. Stable identities,
     because the timeline is memoized and a new object every render would
     re-render every row. */
  const branchNames = useMemo(
    () => activeBranches.snapshot?.branches.map((branch) => branch.name) ?? [],
    [activeBranches.snapshot],
  );
  /* Latest-value refs so the callbacks below can be identity-stable without
     closing over a stale project or a stale navigator. */
  const navigateToViewRef = useRef(navigateToView);
  navigateToViewRef.current = navigateToView;
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;
  const startBranchOperationRef = useRef(startBranchOperation);
  startBranchOperationRef.current = startBranchOperation;
  const viewBranch = useCallback((name: string) => {
    setBranchesSelectIntent(name);
    navigateToViewRef.current("branches");
  }, []);
  const switchToBranch = useCallback((name: string) => {
    const path = projectPathRef.current;
    if (path && startBranchOperationRef.current(path)) {
      setBranchSwitchTarget(name);
    }
  }, []);
  const createBranchFromVersion = useCallback(
    (version: { commit: string; shortCommit: string; subject: string }) => {
      const path = projectPathRef.current;
      if (path && startBranchOperationRef.current(path)) {
        setCreateBranchRequest({
          forceSwitch: false,
          startVersion: {
            commit: version.commit,
            shortCommit: version.shortCommit,
            subject: version.subject,
          },
        });
      }
    },
    [],
  );
  const clearHistoryScopeBranchIntent = useCallback(() => setHistoryScopeBranchIntent(null), []);
  const clearHistorySelectCommitIntent = useCallback(() => setHistorySelectCommitIntent(null), []);
  const clearChangesRestoredElsewhere = useCallback(() => setChangesRestoredElsewhere(null), []);
  const clearBranchesSelectIntent = useCallback(() => setBranchesSelectIntent(null), []);

  // Dropping a folder on the window opens it. Session lifecycle wiring, like
  // the watcher above, so it lives here rather than in a feature: it ends in
  // the same `handleOpenProject` every other route uses, and therefore in the
  // same validation, the same already-open handling and the same "that folder
  // isn't a project yet" recovery. The ref keeps the subscription registered
  // once while still calling the current handler, which closes over state.
  const handleOpenProjectRef = useRef(handleOpenProject);
  handleOpenProjectRef.current = handleOpenProject;

  useEffect(() => {
    // Outside Tauri (tests, a plain `vite dev`) the webview emits no drag
    // events at all; every other way into a project is unaffected.
    if (!("__TAURI_INTERNALS__" in window)) {
      return undefined;
    }
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "enter" || event.payload.type === "over") {
          setIsFolderDropTarget(true);
          return;
        }
        setIsFolderDropTarget(false);
        if (event.payload.type !== "drop") {
          return;
        }
        // One drop opens one project, which is what the overlay promises
        // while the pointer is still over the window ("drop a folder"). The
        // rest of a multi-folder drag is ignored rather than opening a queue
        // of projects the user did not ask to switch between.
        const [droppedPath] = event.payload.paths;
        if (droppedPath) void handleOpenProjectRef.current(droppedPath);
      })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {
        // No drop affordance, no error surfaced: the folder picker, the
        // recent list and the clone flow are all still there.
      });
    return () => {
      cancelled = true;
      unlisten?.();
      setIsFolderDropTarget(false);
    };
  }, []);

  // Warms every registered screen's chunks once the app is idle after first
  // paint, so navigating to one right after launch is a cache hit rather than
  // a fetch+parse. Deliberately not run before first paint: that would defeat
  // the point of splitting them out. The list itself lives with the screen
  // registry, so a new screen cannot ship without one (task 021).
  //
  // Module-level idle work outlived jsdom test environments and left lazy
  // imports running after teardown. Owning it here gives React a real cleanup
  // point while preserving the same after-first-paint scheduling in the app.
  useEffect(
    () =>
      scheduleIdleTask(() => {
        void prefetchScreenChunks();
        void loadPublishDialog();
        void loadDiscardChangesDialog();
      }),
    [],
  );

  // Every open worktree is registered after startup restore. Rust coalesces
  // shared common-Git-dir signals and fans them to related worktrees exactly
  // once; worktree-only invalidations stay isolated.
  const watcherSessionKey = sessionsState.order
    .map((id) => `${id}\0${sessionsState.byId[id]?.epoch ?? ""}`)
    .join("\u0001");
  useEffect(() => {
    if (!hasCompletedSessionRestore || !("__TAURI_INTERNALS__" in window)) {
      return;
    }
    const updateWatcherRegistration = (
      path: string,
      registration: WatcherRegistration | null,
    ): void => {
      setWatcherRegistrations((current) => {
        const existing = current[path];
        if (registration === null) {
          if (!existing) return current;
          const next = { ...current };
          delete next[path];
          return next;
        }
        if (existing?.epoch === registration.epoch && existing.state === registration.state) {
          return current;
        }
        return { ...current, [path]: registration };
      });
    };
    // The preference is honored by the plan, not by this loop: with watching
    // off the plan unregisters everything and asks for nothing, so turning it
    // back on re-registers without the project being reopened.
    const plan = planWatcherChanges(
      watchedSessionsRef.current,
      sessionsState.order.map((id) => ({ path: id, epoch: sessionsState.byId[id]?.epoch })),
      watchProjects,
    );
    for (const { path, epoch } of plan.unwatch) {
      void invoke("unwatch_repository", { path, sessionEpoch: epoch }).catch(() => {});
      delete watchedSessionsRef.current[path];
      updateWatcherRegistration(path, null);
    }
    for (const { path, epoch } of plan.watch) {
      watchedSessionsRef.current[path] = epoch;
      updateWatcherRegistration(path, { epoch, state: "starting" });
      void invoke<boolean>("watch_repository", { path, sessionEpoch: epoch })
        .then((watching) => {
          if (watchedSessionsRef.current[path] !== epoch) return;
          if (watching) {
            updateWatcherRegistration(path, { epoch, state: "watching" });
          } else {
            delete watchedSessionsRef.current[path];
            updateWatcherRegistration(path, { epoch, state: "unavailable" });
          }
        })
        .catch(() => {
          if (watchedSessionsRef.current[path] === epoch) {
            delete watchedSessionsRef.current[path];
            updateWatcherRegistration(path, { epoch, state: "unavailable" });
          }
        });
    }
  }, [hasCompletedSessionRestore, watcherSessionKey, watchProjects]);

  // Turning watching back on leaves the open project exactly as stale as the
  // moment it was turned off: re-registering only catches what changes next.
  // One read of the same facts a watcher invalidation would have driven closes
  // that gap, without asking the user to reopen the project.
  const wasWatchingRef = useRef(watchProjects);
  useEffect(() => {
    const wasWatching = wasWatchingRef.current;
    wasWatchingRef.current = watchProjects;
    if (!watchProjects || wasWatching || !hasCompletedSessionRestore || !projectPath) {
      return;
    }
    void repositoryReads.refreshAll(projectRuntime, projectRuntime.getSnapshot(), projectPath);
  }, [watchProjects, hasCompletedSessionRestore, projectPath, projectRuntime, repositoryReads]);

  const automaticRemoteCheckEligible = Boolean(
    hasCompletedSessionRestore &&
    project?.headState === "branch" &&
    project.branch &&
    teamSync.status?.state !== "noRemote" &&
    teamSync.status?.state !== "noUpstream" &&
    teamSync.status?.state !== "unborn" &&
    teamSync.status?.state !== "detached",
  );
  useAutomaticRemoteCheck({
    intervalMinutes: remoteCheckInterval,
    projectId: projectPath,
    sessionEpoch: activeSession?.epoch ?? null,
    eligible: automaticRemoteCheckEligible,
    // The one place that records notifications from a check, because it is the
    // one check nobody asked for. A manual check has the person who pressed it
    // watching the status bar for its answer; telling them about it afterwards
    // in an inbox would be reporting the news to its own author.
    onCheck: () => {
      if (!projectPath || !activeSession?.epoch) return;
      const projectId = projectPath;
      const projectName = activeSession.project.name;
      // A check already in flight is one somebody pressed and is watching, and
      // the controller would hand this tick that same promise — recording from
      // it would report the news back to its own author. Skipping costs
      // nothing: the deduplicated request was never going to reach the network
      // twice, and the tick that started it records for both.
      const before = selectTeamSyncState(projectRuntime.getSnapshot(), projectId);
      if (before.isCheckingRemote) return;
      const previous = before.status;
      void syncController
        .check(projectRuntime, { projectId, sessionEpoch: activeSession.epoch }, mapSyncError)
        .then((status) => {
          if (status) {
            // The branch's remote branch is gone: news when a check first finds
            // it, not every fifteen minutes after, so a dismissed entry stays
            // dismissed while nothing changes.
            if (
              status.state === "upstreamGone" &&
              !(previous?.state === "upstreamGone" && previous.localBranch === status.localBranch)
            ) {
              notificationCenter.notify({
                projectId,
                projectName,
                details: { kind: "upstreamGone", branch: status.localBranch, remote: status.upstreamRemote },
              });
            }
            // A diverged branch is news too once its forecast says what getting
            // would do: the dialog then combines it, or names what overlaps.
            // Without a forecast there is nothing to offer but a refusal, and
            // the status bar saying "diverged" on its own is better.
            if (
              status.behind > 0 &&
              (status.state === "behind" || (status.state === "diverged" && status.forecast !== null))
            ) {
              notificationCenter.notify({
                projectId,
                projectName,
                details: {
                  kind: "teamChangesAvailable",
                  behind: status.behind,
                  remoteCommit: status.remoteCommit,
                },
              });
            }
            return;
          }
          // `check` resolves `null` for a failure *and* for a superseded
          // request, so the failure is read back from the state the controller
          // committed rather than inferred from the null. A superseded request
          // leaves no error, and therefore records nothing.
          const { error } = selectTeamSyncState(projectRuntime.getSnapshot(), projectId);
          if (error) {
            notificationCenter.notify({
              projectId,
              projectName,
              details: { kind: "remoteCheckFailed", reason: error },
            });
          }
        });
    },
  });

  // Refreshes once when a project becomes active, not whenever a screen is
  // visited. This covers startup and changes made while another project was
  // active; repository-watch events keep the active session fresh afterward.
  // Deferred so startup and the project-switch frame remain uncontested.
  useProjectCacheWarming({
    runtime: projectRuntime,
    hasCompletedSessionRestore,
    projectPath,
    session: activeSession,
    changesController,
    historyController,
    branchesController,
    conflictsController,
    syncController,
    mapSyncError,
  });

  // Some screens only exist for an opened project; if the project closes
  // while one is showing, leave immediately rather than rendering it against
  // a project that is no longer open. Which screens those are comes from the
  // registry, so a new project-only screen is covered by declaring itself one.
  useEffect(() => {
    if (hasCompletedSessionRestore && screenRequiresProject(view) && !project) {
      navigateToView("home");
    }
  }, [view, project, hasCompletedSessionRestore]);

  const performCloseSession = async (id: string): Promise<void> => {
    const closingSession = sessionsState.byId[id];
    if (!closingSession) {
      return;
    }
    // Rust invalidates the epoch and tears down its watcher before the same
    // canonical path can be opened as a new incarnation.
    try {
      await invoke("close_project_session", {
        path: id,
        sessionEpoch: closingSession.epoch,
      });
    } catch (error) {
      // Do not pretend the incarnation closed if Rust could not invalidate
      // it; keeping the session visible preserves a single source of truth.
      showErrorDialog(
        t.overviewCloseProject,
        localizeAppError(error, t, t.errorGitCommandFailed),
      );
      return;
    }
    // Explicitly evict feature-owned state for this session incarnation.
    // Their generations reject late responses from the closed epoch.
    changesController.close(id, closingSession.epoch);
    consoleSessions.close(id, closingSession.epoch);
    statusController.close({ projectId: id, sessionEpoch: closingSession.epoch });
    syncController.close(projectRuntime, { projectId: id, sessionEpoch: closingSession.epoch });
    repositoryReads.close(id, closingSession.epoch);
    delete watchedSessionsRef.current[id];
    branchesController.close({ projectId: id, sessionEpoch: closingSession.epoch });
    historyController.close({ projectId: id, sessionEpoch: closingSession.epoch });
    conflictsController.close({ projectId: id, sessionEpoch: closingSession.epoch });
    bringInController.close({ projectId: id, sessionEpoch: closingSession.epoch });
    workDetailController.forget({ projectId: id, sessionEpoch: closingSession.epoch });
    dispatchSessions({ type: "close", id });
    // Closing the active project goes to Home with no project active, the
    // others still open in the switcher (task 184): the next project is one
    // the reader picks, never one the app moves them into.
    if (sessionsState.activeId === id) {
      setHomeHistory(null);
      setView("home");
      setProjectAnnouncement(t.projectSwitcherClosedAnnouncement(closingSession.project.name));
    }
    setIsCloseConfirmOpen(false);
  };

  const requestCloseSession = (id: string): void => {
    const session = sessionsState.byId[id];
    if (!session) {
      return;
    }
    if (
      session.operation?.phase === "executing" ||
      session.operation?.phase === "verifying"
    ) {
      showErrorDialog(
        t.projectSwitcherOperationIndicator,
        t.projectSwitcherCloseBlocked(session.project.name),
      );
      return;
    }
    if (id === sessionsState.activeId && hasBlockingDialog) {
      return;
    }
    if (confirmCloseProject) {
      setCloseTargetId(id);
      setIsCloseConfirmOpen(true);
    } else {
      void performCloseSession(id);
    }
  };

  const requestCloseActiveProject = (): void => {
    if (sessionsState.activeId) {
      requestCloseSession(sessionsState.activeId);
    }
  };

  /** Every dialog that installs its own focus trap, not just the ones that
   * block project mutations. Opening a second on top of the first leaves two
   * Escape handlers and two traps competing for focus. */
  const hasOpenDialog =
    hasBlockingDialog ||
    isAboutOpen ||
    isAppUpdateOpen ||
    isShortcutsOpen ||
    isCloseConfirmOpen ||
    isOpenErrorDialogOpen ||
    issueReport.failedUrl !== null ||
    isPaletteOpen;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (hasOpenDialog) return;
        accountController?.closePopover(true);
        openPalette();
        // The field is the search itself: the shortcut puts the cursor in the
        // one the active screen shows — the strip's, or the Console's own.
        paletteAnchorRef.current?.focus();
        return;
      }
      // The desktop convention for collapsing a sidebar. Guarded like the
      // preferences shortcut: while a dialog owns the screen, rearranging the
      // chrome behind it is never what the keystroke meant.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        if (hasOpenDialog) {
          return;
        }
        event.preventDefault();
        accountController?.closePopover(true);
        setIsSidebarHidden((hidden) => !hidden);
        return;
      }
      // The desktop convention for preferences. Not taken while any dialog
      // owns the screen, so it cannot stack a second focus trap on top of one.
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        if (hasOpenDialog) {
          return;
        }
        event.preventDefault();
        accountController?.closePopover(true);
        openSettings();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Tab") {
        // Never captured while the user is typing — Ctrl/Cmd+Tab still
        // reaches whatever native behavior applies inside a text field.
        const target = event.target as HTMLElement | null;
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) {
          return;
        }
        if (hasBlockingDialog || sessionsState.order.length < 2) {
          return;
        }
        event.preventDefault();
        const currentIndex = sessionsState.activeId ? sessionsState.order.indexOf(sessionsState.activeId) : -1;
        const delta = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + delta + sessionsState.order.length) % sessionsState.order.length;
        activateSession(sessionsState.order[nextIndex]);
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [accountController, sessionsState, hasBlockingDialog, hasOpenDialog, view]);

  const commandDrafts: AppCommandDraft[] = [
    // "Go to X" comes from the screen registry, in nav order, so a new screen
    // reaches the palette by being registered rather than by being remembered
    // here. Actions *within* a screen are not destinations and stay explicit.
    ...NAV_DESTINATIONS.flatMap((destination) => {
      const { screen } = destination;
      if (destination.commandLabelKey === null) {
        return [];
      }
      if (destination.requiresProject && !project) {
        return [];
      }
      if (destination.overlay === "settings") {
        // One entry per section as well as the plain "Go to Settings", which
        // lands on General. These are the shortcut for someone who knows where
        // they are going, and the reason the plain open no longer needs to
        // remember anything.
        return [
          {
            id: `open-${destination.id}`,
            label: t[destination.commandLabelKey],
            action: () => openSettings(),
          },
          ...availableSettingsSections(Boolean(accountController)).map((section) => ({
            id: `open-settings-${section}`,
            label: t.commandGoSettingsSection(settingsSectionLabel(section, t)),
            action: () => openSettings(section),
          })),
        ];
      }
      if (screen === null) {
        return [];
      }
      const entries: AppCommandDraft[] = [
        {
          id: `go-${destination.id}`,
          label: t[destination.commandLabelKey],
          action: () => navigateToView(screen),
        },
      ];
      if (screen === "workbench") {
        // The two tabs are destinations to a reader who knows where they are
        // going, even though they are one screen to the registry.
        entries.push(
          { id: "go-changes", label: t.commandGoChanges, action: () => openWorkbench("changes") },
          { id: "go-history", label: t.commandGoHistory, action: () => openWorkbench("history") },
        );
      }
      if (screen === "branches") {
        entries.push({
          id: "new-branch",
          label: t.commandNewBranch,
          action: () => {
            navigateToView("branches");
            setBranchesAutoOpenCreate(true);
          },
        });
      }
      return entries;
    }),
    ...(!hasBlockingDialog
      ? [
          {
            id: "open-project",
            label: project ? t.overviewOpenAnotherProject : t.overviewOpenProject,
            action: () => void handleOpenProject(),
          },
          {
            id: "clone-project",
            label: t.commandCloneProject,
            action: () => setIsCloneOpen(true),
          },
          {
            id: "create-project",
            label: t.commandCreateProject,
            action: () => setInitializeDialogRequest({ mode: "new-folder" }),
          },
        ]
      : []),
    ...(project && !hasBlockingDialog
      ? [{ id: "close-project", label: t.commandCloseActiveProject, action: requestCloseActiveProject }]
      : []),
    ...(project?.headState === "branch" && !hasBlockingDialog ? [{
      id: "bring-in-changes", label: t.bringInTitle, action: () => openBringIn(),
    }] : []),
    // Offered only while something is paused: a conflict is not a place.
    ...(project && conflictSession
      ? [{
          id: "go-conflicts",
          label: conflictSession.operation.supported ? t.commandContinueConflicts : t.commandReviewPausedOperation,
          action: openConflicts,
        }]
      : []),
    ...(project && activeSession && !hasBlockingDialog
      ? [
          {
            id: "check-local-changes",
            label: t.commandCheckLocalChanges,
            action: () => void checkWorkingTree(activeSession.id, activeSession.epoch),
          },
          ...(project.headState === "branch" && project.branch
            ? [{
                id: "check-remote-changes",
                label: t.commandCheckRemoteChanges,
                action: () => void syncController.check(
                  projectRuntime,
                  { projectId: activeSession.id, sessionEpoch: activeSession.epoch },
                  mapSyncError,
                ),
              }]
            : []),
          ...(view === "workbench" && activeSession.workbenchTab === "history"
            ? [{
                id: "refresh-history",
                label: t.commandRefreshHistory,
                action: () => void historyController.refresh({
                  projectId: activeSession.id,
                  sessionEpoch: activeSession.epoch,
                }),
              }]
            : []),
          ...(view === "branches"
            ? [{
                id: "refresh-branches",
                label: t.commandRefreshBranches,
                action: () => void branchesController.refresh({
                  projectId: activeSession.id,
                  sessionEpoch: activeSession.epoch,
                }),
              }]
            : []),
        ]
      : []),
    ...(!hasBlockingDialog
      ? sessionsState.order
          .filter((id) => id !== sessionsState.activeId)
          .map((id) => ({
            id: `switch-${id}`,
            label: t.commandSwitchToProject(sessionsState.byId[id].project.name),
            action: () => activateSession(id),
          }))
      : []),
    { id: "theme-system", label: t.commandUseSystemTheme, action: () => changeTheme("system") },
    { id: "theme-light", label: t.commandUseLightTheme, action: () => changeTheme("gitodile-light") },
    { id: "theme-dark", label: t.commandUseDarkTheme, action: () => changeTheme("gitodile-dark") },
    ...(project
      ? [
          {
            id: "project-settings",
            label: t.projectSettingsTitle,
            action: () => openProjectSettings(),
          },
        ]
      : []),
    { id: "changelog", label: t.changelogTitle, action: () => openAppUpdates({ whatsNew: true }) },
    { id: "check-app-updates", label: appUpdateMenuLabel, action: () => openAppUpdates({ check: true }) },
    { id: "about", label: t.aboutGitOdile, action: () => setIsAboutOpen(true) },
  ];

  /* The palette's sections and glyphs are its own presentation, keyed off the
     id: a caller here only says what a command does. */
  const commands: AppCommand[] = commandDrafts.map((command) => ({
    ...command,
    ...paletteMeta(command.id, t),
  }));
  const paletteMatches = filterAppCommands(commands, paletteQuery);
  const paletteSelected = paletteMatches[paletteSelectedIndex];
  const paletteSelectedOptionId = paletteSelected ? `palette-option-${paletteSelected.id}` : undefined;

  const handlePaletteQueryChange = (query: string): void => {
    setPaletteQuery(query);
    setPaletteSelectedIndex(0);
    setIsPaletteOpen(true);
  };

  const handlePaletteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!isPaletteOpen) {
      // The field keeps the focus after Escape, so arrows and Enter go back to
      // the caret instead of moving an unseen selection or running a command.
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setPaletteSelectedIndex((index) => Math.min(index + 1, Math.max(paletteMatches.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setPaletteSelectedIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runPaletteCommand(paletteSelected);
    }
  };

  // A search is a popover, not a modal: a press or a focus anywhere outside the
  // field and its results puts them away, and the app underneath stays usable.
  useEffect(() => {
    if (!isPaletteOpen) return;
    const isInsidePalette = (target: EventTarget | null): boolean => {
      if (!(target instanceof Node)) return false;
      if (commandPaletteAnchorRef.current?.contains(target)) return true;
      if (consolePaletteAnchorRef.current?.contains(target)) return true;
      if (homePaletteAnchorRef.current?.contains(target)) return true;
      return target instanceof Element && target.closest("[data-palette-panel]") !== null;
    };
    const handlePointerDown = (event: MouseEvent): void => {
      if (!isInsidePalette(event.target)) closePalette();
    };
    const handleFocusIn = (event: FocusEvent): void => {
      if (!isInsidePalette(event.target)) closePalette();
    };
    // The one key that must work even when no field is mounted (a screen whose
    // chunk is still loading): with nothing focused to own it, Escape would
    // otherwise leave the panel on screen.
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closePalette();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isPaletteOpen]);

  // The commands are the open project's, so switching projects puts the results
  // away rather than offering actions for the project the reader just left.
  const paletteProjectRef = useRef(sessionsState.activeId);
  useEffect(() => {
    if (paletteProjectRef.current !== sessionsState.activeId) closePalette(true);
    paletteProjectRef.current = sessionsState.activeId;
  }, [sessionsState.activeId]);

  // The field lives in the strip and survives navigation, so a destination run
  // from the palette would leave the focus in chrome that no longer describes
  // the screen. Each screen names its own target — Home's launcher, Console's
  // prompt, the Work screen's active tab, the Overview and Branches headings — and
  // it takes the focus once the navigation has committed. The retry covers a
  // lazy chunk arriving after this effect; a dialog opened by a command keeps
  // its own focus.
  useEffect(() => {
    if (!paletteFocusPending.current) return;
    paletteFocusPending.current = false;
    let frame = 0;
    const deadline = performance.now() + 1500;
    const takeFocus = (): void => {
      if (document.querySelector('[aria-modal="true"]')) return;
      const slot = document.querySelector<HTMLElement>(".screen-slot:not([hidden])");
      const target = slot?.querySelector<HTMLElement>("[data-screen-focus]");
      if (target) {
        target.focus();
        return;
      }
      if (performance.now() < deadline) frame = requestAnimationFrame(takeFocus);
    };
    frame = requestAnimationFrame(takeFocus);
    return () => cancelAnimationFrame(frame);
  }, [paletteFocusTick, view]);

  const projectNameCounts = sessionsState.order.reduce<Record<string, number>>((counts, id) => {
    const name = sessionsState.byId[id].project.name.toLocaleLowerCase();
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});
  const switcherEntries: ProjectSwitcherEntry[] = sessionsState.order.map((id) => {
    const session = sessionsState.byId[id];
    const normalizedPath = session.project.path.replaceAll("\\", "/").replace(/\/+$/, "");
    const pathParts = normalizedPath.split("/");
    return {
      id,
      name: session.project.name,
      contextLabel:
        projectNameCounts[session.project.name.toLocaleLowerCase()] > 1
          ? pathParts.at(-2) ?? normalizedPath
          : null,
      branch: session.project.headState === "branch" ? session.project.branch ?? null : null,
      path: session.project.path,
      hasError: Boolean(session.workingTreeError || session.pendingVersionsError),
      hasOperationInProgress: Boolean(
        session.operation &&
          session.operation.phase !== "error" &&
          session.operation.phase !== "success",
      ),
      hasUnsavedChanges: Boolean(session.workingTree && !session.workingTree.isClean),
      isFavourite: favouriteProjectIds.has(id),
      iconChoice: projectIconChoices.get(id) ?? null,
      technology: projectTechnologies.get(id) ?? null,
      avatarStyle: projectAvatarStyle,
    };
  });
  /** What the active project itself needs, for the status bar's project
   * mark: something to resolve first (a failed or uncertain operation,
   * overlapping changes, a history that could not be read), then work in
   * progress. The branch's own state — unsaved, unreadable, checking — is the
   * branch marker's. A missing Git identity is not raised here: only the global
   * one is read, and a project can set its own. */
  const activeProjectStatus = ((): ProjectStatusMark | null => {
    if (!activeSession) return null;
    const phase = activeSession.operation?.phase;
    if (phase === "error" || phase === "uncertain") {
      return { kind: "resolve", description: t.projectStatusOperationFailed };
    }
    const conflicted = activeSession.workingTree?.counts.conflicted ?? 0;
    if (conflicted > 0) return { kind: "resolve", description: t.statusConflictsMessage(conflicted) };
    if (activeSession.pendingVersionsError) {
      return { kind: "resolve", description: t.projectStatusHistoryUnreadable };
    }
    if (phase === "executing" || phase === "verifying") {
      return { kind: "busy", description: t.projectSwitcherOperationIndicator };
    }
    return null;
  })();
  /** The recent projects the status bar's popup offers to reopen: Home's
   * list without the ones already open, newest first, a handful at most. */
  const closedRecentProjects: ProjectSwitcherRecent[] = recentProjectEntries
    .filter((entry) => entry.openState === null)
    .slice(0, 5)
    .map((entry) => ({
      path: entry.path,
      name: entry.name,
      iconChoice: entry.iconChoice,
      technology: entry.technology,
      avatarStyle: entry.avatarStyle,
    }));
  const closeTargetSession = closeTargetId ? sessionsState.byId[closeTargetId] : null;

  const toRailItem = (destination: (typeof NAV_DESTINATIONS)[number]): RailNavItem => {
    const { screen } = destination;
    const isDisabled = screen === null || (destination.requiresProject && !project);
    return {
      id: destination.id,
      label: t[destination.labelKey],
      icon: destination.icon,
      isActive: screen !== null && view === screen,
      isDisabled,
      isVisibleInRail: navigationPreferences.visibleDestinationIds.includes(destination.id),
      disabledLabel:
        isDisabled && destination.disabledLabelKey ? t[destination.disabledLabelKey] : undefined,
      onSelect: screen ? () => navigateToView(screen) : undefined,
    };
  };
  // Keep the full product map in the rail model. RailNav decides which entries
  // stay visible from the stored preference and available height; everything
  // else remains reachable in More without duplicating navigation policy here.
  const destinationOrder = new Map(
    navigationPreferences.destinationOrderIds.map((id, index) => [id, index]),
  );
  const orderedProjectNavDestinations = [...PROJECT_NAV_DESTINATIONS].sort(
    (left, right) =>
      (destinationOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (destinationOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const railDestinations = orderedProjectNavDestinations.map(toRailItem);

  const appWindow = "__TAURI_INTERNALS__" in window
    ? getCurrentWindow()
    : {
        minimize: async () => {},
        toggleMaximize: async () => {},
        close: async () => {},
        isMaximized: async () => false,
        isFullscreen: async () => false,
        onResized: async () => () => {},
      };
  const performWindowAction = (action: () => Promise<void>): void => {
    void action().catch(() => undefined);
  };

  const [isWindowMaximized, setIsWindowMaximized] = useState(false);
  // macOS draws its own traffic lights over the titlebar and the menu bar
  // takes the overflow menu's place (task 204). Read once: the platform
  // cannot change while the app runs.
  const [hasNativeMacChrome] = useState(hasNativeMacWindowChrome);
  // macOS hides the traffic lights in full screen, so their inset goes too.
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const readWindowState = (): void => {
      void appWindow.isMaximized().then((maximized) => {
        if (!cancelled) setIsWindowMaximized(maximized);
      });
      if (hasNativeMacChrome) {
        void appWindow.isFullscreen().then((fullscreen) => {
          if (!cancelled) setIsWindowFullscreen(fullscreen);
        });
      }
    };
    readWindowState();

    void appWindow.onResized(readWindowState).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const appMenuSections = planAppMenu(
    {
      about: t.aboutGitOdile,
      checkUpdates: appUpdateMenuLabel,
      settings: t.appMenuSettings,
      home: t.navHome,
      openProject: t.titlebarOpenProject,
      openingProject: t.overviewOpening,
      createProject: t.titlebarCreateProject,
      cloneProject: t.titlebarCloneProject,
      closeProject: t.overviewCloseProject,
      hideSidebar: t.titlebarHideSidebar,
      showSidebar: t.titlebarShowSidebar,
      goBack: t.titlebarGoBack,
      goForward: t.titlebarGoForward,
      reloadWindow: t.titlebarReloadWindow,
      keyboardShortcuts: t.titlebarKeyboardShortcuts,
      whatsNew: t.changelogTitle,
      reportIssue: t.titlebarReportIssue,
      file: t.appMenuFile,
      edit: t.appMenuEdit,
      view: t.appMenuView,
      window: t.appMenuWindow,
      help: t.appMenuHelp,
      services: t.appMenuServices,
      hide: t.appMenuHide,
      hideOthers: t.appMenuHideOthers,
      showAll: t.appMenuShowAll,
      quit: t.appMenuQuit,
      closeWindow: t.appMenuCloseWindow,
      undo: t.appMenuUndo,
      redo: t.appMenuRedo,
      cut: t.appMenuCut,
      copy: t.appMenuCopy,
      paste: t.appMenuPaste,
      selectAll: t.appMenuSelectAll,
      fullscreen: t.appMenuFullscreen,
      minimize: t.appMenuMinimize,
      zoom: t.appMenuZoom,
      bringAllToFront: t.appMenuBringAllToFront,
    },
    {
      hasProject: project !== null && view !== "home",
      isOpeningProject: isOpening,
      canReloadWindow: !hasUnsettledOperation(sessionsState),
      isReportingIssue: issueReport.isOpening,
      isSidebarHidden,
      canGoBack,
      canGoForward,
      hasOpenDialog,
    },
  );

  const runAppMenuCommand = (command: AppMenuCommand): void => {
    // The native menu is updated asynchronously, so a click can land on an
    // entry the app has just turned off (a dialog opened, the history ran out).
    if (!isAppMenuCommandEnabled(appMenuSections, command)) return;
    accountController?.closePopover(true);
    switch (command) {
      case "about": setIsAboutOpen(true); return;
      case "check-updates": openAppUpdates({ check: true }); return;
      case "settings": openSettings(); return;
      case "home": navigateToView("home"); return;
      case "open-project": void handleOpenProject(); return;
      case "create-project": setInitializeDialogRequest({ mode: "new-folder" }); return;
      case "clone-project": setIsCloneOpen(true); return;
      case "close-project": requestCloseActiveProject(); return;
      case "toggle-sidebar":
        closeJumpMenu();
        setIsSidebarHidden((hidden) => !hidden);
        return;
      case "go-back": goBack(); return;
      case "go-forward": goForward(); return;
      case "reload-window": window.location.reload(); return;
      case "keyboard-shortcuts": setIsShortcutsOpen(true); return;
      case "whats-new": openAppUpdates({ whatsNew: true }); return;
      case "report-issue": void issueReport.report(); return;
    }
  };

  useNativeAppMenu(hasNativeMacChrome ? nativeAppMenuPort : null, appMenuSections, runAppMenuCommand);


  return (
    // Wraps the whole shell rather than the Changes screen: the pending
    // versions list under Overview renders diffs too, through an entirely
    // different panel.
    <DiffPreferencesProvider value={diffPreferences}>
    <ToastProvider dismissLabel={t.commonClose}>
    <div
      className={
        `app-window` +
        (navigationPreferences.displayMode === "icons-only" ? " app-window--icons-only" : "") +
        (isSidebarHidden ? " app-window--sidebar-hidden" : "") +
        (hasNativeMacChrome && !isWindowFullscreen ? " app-window--mac-traffic-lights" : "")
      }
    >
      <span className="visually-hidden" role="status" aria-live="polite">
        {projectAnnouncement}
      </span>
      <header className="window-titlebar">
        {/* No brand in the corner. The mascot was the only colour illustration
            in a row of line icons and drew the eye to a spot that does
            nothing; the operating system already shows the app icon. The
            mascot lives in the brand moments instead — the no-project welcome
            and About, which the menu and the palette open (DESIGN.md § Brand). */}
        <div className="window-titlebar__actions">
          {/* On macOS these entries live in the menu bar instead (task 204). */}
          {!hasNativeMacChrome && <TitlebarMenu
            renderAccountControl={import.meta.env.DEV && accountController ? (onOpen, fallbackRef) =>
              <AccountControl controller={accountController} compact menuClassName="titlebar-menu__item" onOpen={onOpen} fallbackRef={fallbackRef} /> : undefined}
            onOpenHome={() => navigateToView("home")}
            onOpenAbout={() => setIsAboutOpen(true)}
            appUpdateLabel={appUpdateMenuLabel}
            appUpdateAttention={appUpdateAttention}
            onCheckAppUpdates={() => openAppUpdates({ check: true })}
            onOpenProject={() => void handleOpenProject()}
            onCreateProject={() => setInitializeDialogRequest({ mode: "new-folder" })}
            onCloneProject={() => setIsCloneOpen(true)}
            onCloseProject={requestCloseActiveProject}
            onOpenSettings={() => openSettings()}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            hasProject={project !== null && view !== "home"}
            isOpeningProject={isOpening}
            canReloadWindow={!hasUnsettledOperation(sessionsState)}
            onReportIssue={() => void issueReport.report()}
            isReportingIssue={issueReport.isOpening}
          />}
          {/* Sits with the menu rather than in the rail it collapses: a
              control that hides its own container would vanish with it, and
              the way back has to stay where it was.

              While collapsed it is also the way back *without* committing:
              resting on it slides the rail out so a destination can be picked
              and the rail put away again, leaving the click for when someone
              actually wants it back for good. */}
          <button
            ref={sidebarToggleRef}
            className="titlebar-icon-button titlebar-sidebar-toggle"
            type="button"
            aria-pressed={isSidebarHidden}
            aria-label={isSidebarHidden ? t.titlebarShowSidebar : t.titlebarHideSidebar}
            data-tooltip={isSidebarHidden ? t.titlebarShowSidebar : t.titlebarHideSidebar}
            onMouseEnter={isSidebarHidden ? openJumpMenu : undefined}
            onMouseLeave={isSidebarHidden ? scheduleJumpClose : undefined}
            onClick={() => {
              closeJumpMenu();
              setIsSidebarHidden((hidden) => !hidden);
            }}
          >
            {isSidebarHidden ? (
              <PanelLeftOpen aria-hidden="true" />
            ) : (
              <PanelLeftClose aria-hidden="true" />
            )}
          </button>
          {isSidebarHidden && isJumpMenuOpen && createPortal(
            <div
              ref={jumpMenuRef}
              className="app-menu sidebar-jump__menu"
              role="menu"
              aria-label={t.navProjectAriaLabel}
              style={jumpMenuStyle}
              onMouseEnter={openJumpMenu}
              onMouseLeave={scheduleJumpClose}
              onKeyDown={(event) => handlePopupMenuKeyDown(event, jumpMenuRef.current, closeJumpMenu)}
            >
              {railDestinations.map((item) => (
                <button
                  key={item.id}
                  className={`app-menu__item${item.isActive ? " app-menu__item--selected" : ""}`}
                  type="button"
                  role="menuitem"
                  disabled={item.isDisabled}
                  aria-current={item.isActive ? "page" : undefined}
                  aria-label={item.disabledLabel}
                  onClick={() => {
                    closeJumpMenu();
                    item.onSelect?.();
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}

              <div className="app-menu__divider" role="separator" />

              {/* Projects are the status bar's (task 189): the menu keeps the
                  destinations and, in the same order the rail stacks it, the
                  foot. */}
              {NAV_DESTINATIONS.filter((destination) => destination.section === "application" && destination.inRail).map(
                (destination) => {
                  const { screen, overlay } = destination;
                  const isActive =
                    overlay === "settings" ? isSettingsOpen : screen !== null && view === screen;
                  return (
                    <button
                      key={destination.id}
                      className={`app-menu__item${isActive ? " app-menu__item--selected" : ""}`}
                      type="button"
                      role="menuitem"
                      disabled={screen === null && overlay === undefined}
                      aria-current={screen !== null && isActive ? "page" : undefined}
                      onClick={() => {
                        closeJumpMenu();
                        if (overlay === "settings") openSettings();
                        else if (screen) navigateToView(screen);
                      }}
                    >
                      {destination.icon}
                      <span>{t[destination.labelKey]}</span>
                    </button>
                  );
                },
              )}
              {import.meta.env.DEV && accountController ? <AccountControl controller={accountController} compact
                onOpen={closeJumpMenu} fallbackRef={sidebarToggleRef} /> : <button
                className="app-menu__item"
                type="button"
                role="menuitem"
                disabled
                aria-label={t.navAccountTitle}
              >
                <UserRound aria-hidden="true" />
                <span>{t.navAccountTitle}</span>
              </button>}
            </div>,
            document.body,
          )}
          <div className="titlebar-history-controls">
            <button
              className="titlebar-icon-button"
              type="button"
              disabled={!canGoBack}
              data-tooltip={t.titlebarGoBack}
              aria-label={t.titlebarGoBack}
              onClick={goBack}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              className="titlebar-icon-button"
              type="button"
              disabled={!canGoForward}
              data-tooltip={t.titlebarGoForward}
              aria-label={t.titlebarGoForward}
              onClick={goForward}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          {/* The rail's foot holds the theme toggle (task 189); the title bar
              keeps a copy only while the rail is not showing — hidden by its
              toggle, or gone in the compact layout. */}
          <button
            className={`titlebar-icon-button titlebar-theme-toggle${isSidebarHidden ? "" : " titlebar-theme-toggle--in-rail"}`}
            type="button"
            aria-label={themeToggle.label}
            data-tooltip={themeToggle.label}
            onClick={toggleTheme}
          >
            {themeToggle.icon}
          </button>
        </div>

        <div
          className="window-titlebar__drag"
          data-tauri-drag-region
          onDoubleClick={() => performWindowAction(() => appWindow.toggleMaximize())}
        />

        {/* Between the drag region and the window buttons: the inbox belongs
            with the window furniture, not in the action row on the left, and
            this is where the release badge used to sit before task 086 moved
            it to the status bar. */}
        <NotificationCenter
          notifications={notificationCenter.notifications}
          unreadCount={notificationCenter.unreadCount}
          isEnabled={notificationsEnabled}
          hasStorageWarning={notificationCenter.hasStorageWarning}
          onMarkAllRead={notificationCenter.markAllRead}
          onSetRead={(notification, read) => notificationCenter.setRead(notification.id, read)}
          onClear={notificationCenter.clear}
          onDismiss={(notification) => notificationCenter.dismiss(notification.id)}
          onToggleEnabled={setNotificationsEnabled}
          onReviewTeamChanges={reviewTeamChangesFromNotification}
          onReviewAppUpdate={() => {
            if (hasBlockingDialog) return false;
            // Settings shows the current updater snapshot, never the stored
            // notice's candidate/version. Opening it does not check or install.
            openAppUpdates();
            return true;
          }}
          onOpenProjectOverview={openOverviewFromNotification}
          onOpenSettings={() => openSettings("notifications")}
        />

        {/* macOS draws its own traffic lights on the left. Not rendered
            rather than hidden, so nothing announces buttons that are not there. */}
        {!hasNativeMacChrome && <div className="window-controls" aria-label={t.windowControls}>
          <button
            className="window-control"
            type="button"
            aria-label={t.windowMinimize}
            onClick={() => performWindowAction(() => appWindow.minimize())}
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            className="window-control"
            type="button"
            aria-label={t.windowMaximize}
            onClick={() => performWindowAction(() => appWindow.toggleMaximize())}
          >
            {isWindowMaximized ? (
              <Copy className="window-control__maximize-icon" aria-hidden="true" />
            ) : (
              <Square className="window-control__maximize-icon" aria-hidden="true" />
            )}
          </button>
          <button
            className="window-control window-control--close"
            type="button"
            aria-label={t.windowClose}
            onClick={() => performWindowAction(() => appWindow.close())}
          >
            <span className="window-control__close" aria-hidden="true" />
          </button>
        </div>}
      </header>

      <main
        className={`app-shell${view === "workbench" || view === "branches" || view === "conflicts" || view === "console" ? " app-shell--internal-scroll" : ""}${view === "overview" ? " app-shell--overview" : ""}${view === "console" || view === "home" ? "" : " app-shell--sheet"}`}
      >
        {/* Read by `usePortalFlyout`: every menu the rail opens flies out from
            this panel's edge rather than from the button inside it. */}
        <aside className="sidebar" data-flyout-anchor="">
          <RailNav
            ariaLabel={t.navProjectAriaLabel}
            moreLabel={t.navMore}
            customizeLabel={t.navCustomizeNavigation}
            items={railDestinations}
            displayMode={navigationPreferences.displayMode}
            onCustomize={() => openSettings("navigation")}
          />

          {/* The destinations answer "where in this project am I"; the foot
              answers "which app-level control". Which project is the status
              bar's to say and change (task 189). The free height above carries
              the split in a tall window; the foot's own shape — three filled
              circles with no caption — keeps it when a short one closes that
              gap. */}
            <nav aria-label={t.navApplicationAriaLabel} className="sidebar-foot">
              {/* The theme is the app's, not the project's, so it sits with
                  Settings and Account. One control, three meanings: back to the
                  device, or to the other official scheme; the glyph and the
                  name always describe the change the press will make. */}
              <button
                className="sidebar-round sidebar-round--theme"
                type="button"
                data-glyph={themeToggle.glyph}
                aria-label={themeToggle.label}
                data-tooltip={themeToggle.label}
                onClick={toggleTheme}
              >
                {themeToggle.icon}
              </button>
              {NAV_DESTINATIONS.filter((destination) => destination.section === "application" && destination.inRail).map((destination) => {
                const { screen, overlay } = destination;
                const isActive = overlay === "settings" ? isSettingsOpen : screen !== null && view === screen;
                const label = t[destination.labelKey];
                return (
                  <button
                    key={destination.id}
                    className={`sidebar-round${overlay === "settings" ? " sidebar-round--settings" : ""}${isActive ? " sidebar-round--active" : ""}`}
                    type="button"
                    disabled={screen === null && overlay === undefined}
                    aria-current={screen !== null && isActive ? "page" : undefined}
                    aria-haspopup={overlay ? "dialog" : undefined}
                    aria-expanded={overlay ? isSettingsOpen : undefined}
                    data-tooltip={label}
                    // These carry no visible name in either display mode, so the
                    // accessible name lives on the control itself rather than in
                    // a caption that only one mode renders.
                    aria-label={label}
                    onClick={overlay === "settings" ? () => openSettings() : screen ? () => navigateToView(screen) : undefined}
                  >
                    {destination.icon}
                  </button>
                );
              })}
              {/* Account UI is a development-only simulation. Published builds
                  retain the reserved coming-soon control. */}
              {import.meta.env.DEV && accountController ? <AccountControl controller={accountController} /> : <button
                className="sidebar-round sidebar-round--account"
                type="button"
                aria-disabled="true"
                aria-label={t.navAccountTitle}
                data-tooltip={t.navAccountTitle}
              >
                <UserRound aria-hidden="true" />
              </button>}
            </nav>
        </aside>

        <section
          {...autoHideScrollbarProps<HTMLElement>()}
          className={`workspace auto-hide-scrollbar${view === "workbench" ? " workspace--workbench" : ""}${view === "branches" ? " workspace--branches" : ""}${view === "conflicts" ? " workspace--conflicts" : ""}${view === "console" ? " workspace--console" : ""}`}
        >
          <div className="compact-nav-row">
            <div className="compact-history-controls" aria-label={t.titlebarHistoryControls}>
              <button
                className="titlebar-icon-button"
                type="button"
                disabled={!canGoBack}
                data-tooltip={t.titlebarGoBack}
                aria-label={t.titlebarGoBack}
                onClick={goBack}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <button
                className="titlebar-icon-button"
                type="button"
                disabled={!canGoForward}
                data-tooltip={t.titlebarGoForward}
                aria-label={t.titlebarGoForward}
                onClick={goForward}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
            <nav className="compact-nav" aria-label={t.navApplicationAriaLabel}>
              {/* Narrow windows drop a destination entirely rather than
                  showing it disabled: the row is already tight, and the
                  expanded nav is where the "open a project first" explanation
                  belongs. */}
              {NAV_DESTINATIONS.flatMap((destination) => {
                const { screen, overlay } = destination;
                if (
                  !destination.inCompactNav ||
                  (screen === null && overlay === undefined) ||
                  (destination.requiresProject && !project)
                ) {
                  return [];
                }
                const isActive = overlay === "settings" ? isSettingsOpen : screen !== null && view === screen;
                return (
                  <button
                    key={destination.id}
                    className={`compact-nav__item${isActive ? " compact-nav__item--active" : ""}`}
                    type="button"
                    aria-current={screen !== null && isActive ? "page" : undefined}
                    aria-haspopup={overlay ? "dialog" : undefined}
                    aria-expanded={overlay ? isSettingsOpen : undefined}
                    onClick={overlay === "settings" ? () => openSettings() : () => screen && navigateToView(screen)}
                  >
                    <span aria-hidden="true">{destination.icon}</span>
                    {t[destination.labelKey]}
                  </button>
                );
              })}
            </nav>
          </div>

          {view === "overview" && skippedRestoreCount > 0 && (
            <p className="restore-skipped-notice" role="status">
              <span title={t.startupRestoreSkippedNotice(skippedRestoreCount)}>{t.startupRestoreSkippedNotice(skippedRestoreCount)}</span>
              <button
                type="button"
                aria-label={t.commonClose}
                onClick={() => setSkippedRestoreCount(0)}
              >
                <X aria-hidden="true" />
              </button>
            </p>
          )}

          {/* Project screens are keyed by epoch; Home survives project switches
              and suspends its effects while hidden. */}
          <KeepAliveScreens
            active={view}
            projectEpoch={activeSession?.epoch}
            screens={{
              home: (
                <HomeScreen
                  isOpening={isOpening}
                  recentProjects={recentProjectEntries}
                  userName={gitIdentity.identity.name || null}
                  onOpenProject={() => void handleOpenProject()}
                  onCreateProject={() => setInitializeDialogRequest({ mode: "new-folder" })}
                  onCreateNamedProject={(name) => setInitializeDialogRequest({ mode: "new-folder", name })}
                  onCloneProject={() => setIsCloneOpen(true)}
                  onCloneFromUrl={(url) => {
                    setCloneInitialSource(url);
                    setIsCloneOpen(true);
                  }}
                  onBrowseAccountInClone={(kind, accountId) => {
                    setCloneInitialRepositories({ kind, accountId });
                    setIsCloneOpen(true);
                  }}
                  // An open project is switched to, as the switcher does; only
                  // a closed one goes through opening again.
                  onOpenRecentProject={(path) => (sessionsState.byId[path] ? activateSession(path) : void handleOpenProject(path))}
                  onToggleFavouriteRecentProject={toggleFavouriteProject}
                  onForgetRecentProject={(path) => setRecentProjects(forgetRecentProject(path))}
                  hasOpenProjects={sessionsState.order.length > 0}
                  playGreeting={!hasShownHomeGreeting.current}
                  setup={homeSetup}
                  repositoryBrowser={homeRepositoryBrowser}
                  onInstallGit={() => openSettings("git")}
                  onRecheckGit={() => void gitTooling.refreshDiagnostics()}
                  onOpenGitSettings={() => openSettings("git")}
                  onConfigureIdentity={() => openSettings("git")}
                  onConnectAccount={() => { setOpenAccountsMenu(true); openSettings("accounts"); }}
                  onOpenAccountSettings={() => openSettings("accounts")}
                  commandPalette={{
                    isOpen: isPaletteOpen,
                    query: paletteQuery,
                    selectedOptionId: paletteSelectedOptionId,
                    inputRef: homePaletteAnchorRef,
                    keyShortcuts: paletteKeyShortcuts,
                    onOpen: openPalette,
                    onQueryChange: handlePaletteQueryChange,
                    onKeyDown: handlePaletteKeyDown,
                  }}
                />
              ),
              overview: (
                <OverviewPanel
                  project={project}
                  isOpening={isOpening}
                  isRestoring={!hasCompletedSessionRestore}
                  workingTree={workingTree}
                  workingTreeError={workingTreeError}
                  isCheckingChanges={isCheckingChanges}
                  onCheckLocalChanges={() => {
                    if (projectPath) void checkWorkingTree(projectPath);
                  }}
                  onOpenConflicts={openConflicts}
                  onReviewChanges={(path) => {
                    if (path && sessionsState.activeId) {
                      dispatchSessions({
                        type: "setChangesSelection",
                        id: sessionsState.activeId,
                        selection: {
                          selectedPath: path,
                          excludedPaths: activeSession?.changesSelection.excludedPaths ?? [],
                        },
                      });
                    }
                    openWorkbench("changes");
                  }}
                  onOpenProject={() => void handleOpenProject()}
                  onCreateProject={() => setInitializeDialogRequest({ mode: "new-folder" })}
                  onCloneProject={() => setIsCloneOpen(true)}
                  recentProjects={recentProjectEntries}
                  onOpenRecentProject={(path) => void handleOpenProject(path)}
                  onToggleFavouriteRecentProject={toggleFavouriteProject}
                  onForgetRecentProject={(path) => setRecentProjects(forgetRecentProject(path))}
                  canPublish={canPublish}
                  onPublish={() => openPublishDialog()}
                  onPublishUpTo={(commit) => openPublishDialog(commit)}
                  pendingVersions={pendingVersions}
                  pendingVersionsError={pendingVersionsError}
                  branches={activeBranches.snapshot}
                  onQuickSwitchBranch={(target) => {
                    if (projectPath && startBranchOperation(projectPath)) {
                      setBranchSwitchTarget(target);
                    }
                  }}
                  onOpenRemoteHome={(remote) => {
                    if (!project || !activeSession) return;
                    void overviewPort
                      .openRemoteHome({ path: project.path, sessionEpoch: activeSession.epoch, remote })
                      .catch((error: unknown) =>
                        showErrorDialog(
                          t.overviewHomeOpenFailedTitle,
                          localizeAppError(error, t, t.overviewHomeOpenFailedMessage),
                        ),
                      );
                  }}
                  onOpenProjectSettings={() => openProjectSettings()}
                  onChangeProjectIcon={() => openProjectSettings(undefined, "icon")}
                  onPrefetchProjectSettings={() => prefetchProjectSettings()}
                  projectIdentity={{
                    iconChoice: project ? (projectIconChoices.get(project.path) ?? null) : null,
                    technology: project ? (projectTechnologies.get(project.path) ?? null) : null,
                    avatarStyle: projectAvatarStyle,
                  }}
                  selfEmail={gitIdentity.identity.email || null}
                  onGoToBranches={() => navigateToView("branches")}
                  onOpenProjectFolder={() => {
                    if (activeSession) openProjectFolder(activeSession.id);
                  }}
                  onOpenSaveVersion={() => startSessionOperation("save")}
                  teamSync={teamSync}
                  onCheckTeamChanges={() => checkTeamChanges()}
                  onReviewAndGetTeamChanges={() => startSessionOperation("sync")}
                  onGetAndPublish={() => startSessionOperation("sync", undefined, undefined, "getAndPublish")}
                  onStopTrackingRemote={stopTrackingRemote}
                  historyController={historyController}
                  workDetail={workDetailController}
                  onRestoreDiscarded={(recoveryId) => {
                    if (activeSession && startSessionOperation("discard")) {
                      setRestoreDialog({
                        sessionId: activeSession.id,
                        request: { mode: "restore", selectedPath: null, recoveryId: recoveryId ?? null },
                      });
                    }
                  }}
                  onOpenHistory={() => openWorkbench("history")}
                />
              ),
              // Project-only screens are absent, not disabled, when no
              // project is open: the host drops what it is not given.
              ...(project
                ? {
                    workbench: (
                      <Suspense fallback={<ViewLoadingFallback />}>
                        <WorkbenchScreen
                          tab={activeSession?.workbenchTab ?? "changes"}
                          onTabChange={(tab) => openWorkbench(tab)}
                          renderChanges={(tabs) => (
                            // The workbench owns the Suspense boundary, so the
                            // tabs stay on screen while a tab's chunk loads.
                            <ChangesPanel
                              tabs={tabs}
                              projectPath={project.path}
                              workingTree={workingTree}
                              workingTreeError={workingTreeError}
                              isCheckingChanges={isCheckingChanges}
                              controller={changesController}
                              sessionEpoch={activeSession?.epoch ?? ""}
                              watcherState={activeWatcherState}
                              confirmBeforeDiscarding={confirmDiscard}
                              runGitHooks={runGitHooks}
                              onRefresh={() => projectPath && void checkWorkingTree(projectPath)}
                              onOpenSettings={() => openSettings("general")}
                              onSaveCompleted={() => void handleMutationSucceeded(project.path)}
                              onPublishNow={() => openPublishDialog()}
                              onGetChanges={() => startSessionOperation("sync")}
                              onCheckRemote={() => checkTeamChanges({ refreshWorkingTree: true })}
                              isCheckingRemote={teamSync.isCheckingRemote}
                              onOpenHistory={() => openWorkbench("history")}
                              onOpenConflicts={openConflicts}
                              headState={project.headState}
                              selectedPath={activeSession?.changesSelection.selectedPath ?? null}
                              onSelectedPathChange={(selectedPath) =>
                                sessionsState.activeId &&
                                dispatchSessions({
                                  type: "setChangesSelection",
                                  id: sessionsState.activeId,
                                  selection: { selectedPath, excludedPaths: activeSession?.changesSelection.excludedPaths ?? [] },
                                })
                              }
                              restoredElsewhere={changesRestoredElsewhere}
                              onRestoredElsewhereHandled={clearChangesRestoredElsewhere}
                              recoveriesRevision={recoveriesRevision}
                              onBeginDiscard={() => startSessionOperation("discard")}
                              onDiscardClose={() => finishSessionOperation(project.path)}
                              onDiscardPhaseChange={(phase) => {
                                dispatchSessions({
                                  type: "setOperationPhase",
                                  id: project.path,
                                  phase,
                                });
                              }}
                            />
                          )}
                          renderHistory={(tabs) => (
                            <HistoryScreen
                              tabs={tabs}
                              controller={historyController}
                              projectPath={project.path}
                              sessionEpoch={activeSession?.epoch ?? ""}
                              watcherState={activeWatcherState}
                              branches={branchNames}
                              scopeBranchIntent={historyScopeBranchIntent}
                              selectCommitIntent={historySelectCommitIntent}
                              onSelectCommitIntentHandled={clearHistorySelectCommitIntent}
                              onScopeBranchIntentHandled={clearHistoryScopeBranchIntent}
                              onViewBranch={viewBranch}
                              onSwitchBranch={switchToBranch}
                              onCreateBranchFromVersion={createBranchFromVersion}
                              onPublish={() => openPublishDialog()}
                              onOpenSettings={() => openSettings("general")}
                              selfEmail={gitIdentity.identity.email || null}
                              upstreamGoneBranch={upstreamGoneBranch}
                            />
                          )}
                        />
                      </Suspense>
                    ),
                    "branches": (
                      <Suspense fallback={<ViewLoadingFallback />}>
                        <BranchesScreen
                          controller={branchesController}
                          projectPath={project.path}
                          sessionEpoch={activeSession?.epoch ?? ""}
                          watcherState={activeWatcherState}
                          onOpenSettings={() => openSettings("general")}
                          onChanged={() => void handleBranchChanged(project.path)}
                          onOperationStart={() => startBranchOperation(project.path)}
                          onOperationFinish={() => finishSessionOperation(project.path)}
                          onOperationPhaseChange={(phase) => setBranchOperationPhase(project.path, phase)}
                          onSaveVersion={() => {
                            startSessionOperation("save");
                            openWorkbench("changes");
                          }}
                          onOpenConflicts={openConflicts}
                          onBringIn={openBringIn}
                          selfEmail={gitIdentity.identity.email || null}
                          onOpenHistory={(name, commit) => {
                            setHistoryScopeBranchIntent(name);
                            setHistorySelectCommitIntent(commit ?? null);
                            openWorkbench("history");
                          }}
                          // As the status bar: with no remote there is nowhere to publish to.
                          onPublish={activeSession?.teamSync.status?.state === "noRemote" ? undefined : () => openPublishDialog()}
                          autoOpenCreate={branchesAutoOpenCreate}
                          onAutoOpenCreateHandled={() => setBranchesAutoOpenCreate(false)}
                          selectBranchIntent={linesSelectIntent}
                          onSelectBranchIntentHandled={clearBranchesSelectIntent}
                          upstreamGoneBranch={upstreamGoneBranch}
                        />
                      </Suspense>
                    ),
                    console: (
                      <Suspense fallback={<ViewLoadingFallback />}>
                        <ConsoleScreen
                          sessionStore={consoleSessions}
                          historySource={historyController}
                          projectPath={project.path}
                          projectName={project.name}
                          branch={project.branch}
                          sessionEpoch={activeSession?.epoch ?? ""}
                          gitVersion={readGitVersion(gitTooling.diagnostics)}
                          projectStatus={consoleStatus}
                          preferences={consolePreferences}
                          theme={theme}
                          confirmChanges={consoleConfirmChanges.confirmChanges}
                          runHooks={runGitHooks}
                          onRepositoryChanged={() => void handleMutationSucceeded(project.path)}
                          onOpenSettings={() => openSettings("console")}
                          commandPalette={{
                            isOpen: isPaletteOpen,
                            query: paletteQuery,
                            selectedOptionId: paletteSelectedOptionId,
                            inputRef: consolePaletteAnchorRef,
                            shortcut: paletteShortcut,
                            onOpen: openPalette,
                            onQueryChange: handlePaletteQueryChange,
                            onKeyDown: handlePaletteKeyDown,
                          }}
                        />
                      </Suspense>
                    ),
                    conflicts: (
                      <Suspense fallback={<ViewLoadingFallback />}>
                        <ConflictsScreen
                          controller={conflictsController}
                          projectPath={project.path}
                          sessionEpoch={activeSession?.epoch ?? ""}
                          watcherState={activeWatcherState}
                          onOpenSettings={() => openSettings("general")}
                          onBack={goBack}
                          onGoToOverview={() => navigateToView("overview")}
                          isProjectBusy={isActiveOperationRunning}
                          runHooks={runGitHooks}
                          onPublish={() => openPublishDialog()}
                          onOperationStart={() => startLocalOperation(project.path, "resolve")}
                          onOperationFinish={() => finishSessionOperation(project.path)}
                          onOperationPhaseChange={(phase) => setBranchOperationPhase(project.path, phase)}
                          onChanged={() => handleMutationSucceeded(project.path)}
                        />
                      </Suspense>
                    ),
                  }
                : {}),
            }}
          />
        </section>

        {/* The foot of the sheet on every project screen, Overview included:
            the one place the project's state is always visible is worth more
            than the small duplication with Overview's own bands. Console and
            Home are the exceptions, because each ends in a status line of its
            own (ADR 0032): Console's carries the same project facts,
            read-only, and Home's "This computer" row is about the machine,
            which is what a launcher is about. */}
        {view !== "console" && view !== "home" && <StatusBar
          project={project}
          workingTree={workingTree}
          workingTreeError={workingTreeError}
          isCheckingChanges={isCheckingChanges}
          branches={activeBranches.snapshot}
          isLoadingBranches={activeBranches.isLoading}
          favouriteBranches={favouriteBranches}
          onToggleFavouriteBranch={toggleFavouriteBranch}
          teamSync={teamSync}
          onBringIn={openBringIn}
          onSwitchBranch={(target) => {
            if (projectPath && startBranchOperation(projectPath)) {
              setBranchSwitchTarget(target);
            }
          }}
          branchCreate={branchCreate}
          onSeeAllBranches={() => navigateToView("branches")}
          onCheckTeamChanges={() => checkTeamChanges()}
          projectSwitch={{
            entries: switcherEntries,
            recent: closedRecentProjects,
            activeId: sessionsState.activeId,
            canSwitch: !hasBlockingDialog,
            isOpening,
            onActivate: activateSession,
            onOpenRecent: (path) => void handleOpenProject(path),
            onClose: requestCloseSession,
            onOpenAnother: () => void handleOpenProject(),
            onCreate: () => setInitializeDialogRequest({ mode: "new-folder" }),
            onClone: () => setIsCloneOpen(true),
            onToggleFavourite: toggleFavouriteProject,
            onOpenProjectSettings: openProjectSettings,
            onPrefetchProjectSettings: prefetchProjectSettings,
            onOpenFolder: openProjectFolder,
            onOpenHome: () => navigateToView("home"),
            activeStatus: activeProjectStatus,
          }}
          onPublish={() => openPublishDialog()}
          onGetChanges={() => startSessionOperation("sync")}
          onGetAndPublish={() => startSessionOperation("sync", undefined, undefined, "getAndPublish")}
          commandPalette={{
            isOpen: isPaletteOpen,
            query: paletteQuery,
            selectedOptionId: paletteSelectedOptionId,
            inputRef: commandPaletteAnchorRef,
            keyShortcuts: paletteKeyShortcuts,
            onOpen: openPalette,
            onQueryChange: handlePaletteQueryChange,
            onKeyDown: handlePaletteKeyDown,
          }}
        />}
      </main>

      {/* Feedback about a gesture in progress, not app chrome: it exists only
          while something is actually being dragged over the window, never
          takes the pointer, and stays out of the accessibility tree because
          there is no keyboard or screen-reader equivalent of a drag to
          narrate. It is suppressed under a blocking dialog, which is exactly
          when a drop is ignored. */}
      {isFolderDropTarget && !hasBlockingDialog && (
        <div className="folder-drop-overlay" aria-hidden="true">
          <div className="folder-drop-overlay__panel">
            <span className="folder-drop-overlay__icon">
              <FolderOpen />
            </span>
            <p className="folder-drop-overlay__title">{t.dropFolderTitle}</p>
            <p className="folder-drop-overlay__hint">{t.dropFolderHint}</p>
          </div>
        </div>
      )}

      <CommandPalette
        isOpen={isPaletteOpen}
        matches={paletteMatches}
        selectedIndex={paletteSelectedIndex}
        // The field the active screen shows: Console and Home own one in their
        // own status lines, and the strip is not mounted there.
        anchorRef={paletteAnchorRef}
        reducedMotion={reducedMotion}
        leaveAtOnce={paletteLeavesAtOnce}
        variant={view === "console" ? "console" : "app"}
        fitToField={view !== "console"}
        onSelect={runPaletteCommand}
        onHover={setPaletteSelectedIndex}
      />

      <CloneDialog
        isOpen={isCloneOpen}
        initialSource={cloneInitialSource}
        initialRepositories={cloneInitialRepositories}
        controller={cloneController}
        onClose={() => {
          setIsCloneOpen(false);
          setCloneInitialSource("");
          setCloneInitialRepositories(undefined);
        }}
        onVerifiedClone={handleVerifiedClone}
      />

      {initializeDialogRequest && (
        <InitializeProjectDialog
          isOpen
          initialMode={initializeDialogRequest.mode}
          initialExistingPath={initializeDialogRequest.existingPath}
          initialName={initializeDialogRequest.name}
          controller={initializeProjectController}
          saveVersionController={initialSaveVersionController}
          defaultBranchName={defaultBranch.name ?? DEFAULT_BRANCH_FALLBACK}
          runHooks={runGitHooks}
          onClose={() => setInitializeDialogRequest(null)}
          onInitialized={handleInitializedProject}
          onProjectChanged={handleMutationSucceeded}
          onOpenIdentitySettings={() => openSettings("git")}
        />
      )}

      {publishDialogSession && (
        <Suspense fallback={null}>
          <PublishDialog
            isOpen
            projectPath={publishDialogSession.project.path}
            sessionEpoch={publishDialogSession.epoch}
            upTo={publishUpTo ?? undefined}
            preview={previewFromPendingVersions({
              pending: publishDialogSession.pendingVersions,
              pendingError: publishDialogSession.pendingVersionsError,
              upstream: publishDialogSession.workingTree?.upstream.upstream ?? null,
              hasUnsavedFiles: publishDialogSession.workingTree
                ? !publishDialogSession.workingTree.isClean
                : false,
              upTo: publishUpTo ?? undefined,
            })}
            runHooks={runGitHooks}
            onClose={() => {
              finishSessionOperation(publishDialogSession.id);
              setPublishDialogSessionId(null);
            }}
            onPublished={(result) => recordPublished(publishDialogSession, result)}
            onGetFirst={() => {
              // The remote moved on: get its versions first, then publish, in
              // Get project changes once this dialog has let go.
              finishSessionOperation(publishDialogSession.id);
              setPublishDialogSessionId(null);
              setGetAfterPublishSessionId(publishDialogSession.id);
            }}
            onPhaseChange={(phase) =>
              dispatchSessions({
                type: "setOperationPhase",
                id: publishDialogSession.id,
                phase,
              })
            }
          />
        </Suspense>
      )}

      {bringInDialog && bringInSession && (
        <BringInChangesDialog
          key={`${bringInSession.id}:${bringInSession.epoch}`}
          controller={bringInController}
          projectPath={bringInSession.project.path}
          sessionEpoch={bringInSession.epoch}
          source={bringInDialog.source}
          runHooks={runGitHooks}
          onClose={() => {
            finishSessionOperation(bringInSession.id);
            setBringInDialog(null);
          }}
          onPhaseChange={(phase) => dispatchSessions({ type: "setOperationPhase", id: bringInSession.id, phase })}
          onApplied={async () => {
            dispatchSessions({ type: "setChangesSelection", id: bringInSession.id, selection: EMPTY_CHANGES_SELECTION });
            await repositoryReads.refreshAfterMutation(projectRuntime, projectRuntime.getSnapshot(), bringInSession.project.path);
          }}
          onPaused={async (session) => {
            await conflictsController.acceptSession({ projectId: bringInSession.id, sessionEpoch: bringInSession.epoch }, session);
            await repositoryReads.refreshAfterMutation(projectRuntime, projectRuntime.getSnapshot(), bringInSession.project.path);
            navigateToView("conflicts");
          }}
          onSaveVersion={() => {
            finishSessionOperation(bringInSession.id);
            setBringInDialog(null);
            setSaveAfterSyncSessionId(bringInSession.id);
          }}
          onOpenConflicts={() => {
            finishSessionOperation(bringInSession.id);
            setBringInDialog(null);
            openConflicts();
          }}
          onRevealFile={(path) => { void changesController.revealFile(bringInSession.project.path, bringInSession.epoch, path).catch(() => undefined); }}
        />
      )}

      {getTeamDialogSession && (
        <GetTeamChangesDialog
          isOpen
          controller={syncController}
          overlapPort={bringInPort}
          onPaused={async (session) => {
            await conflictsController.acceptSession({ projectId: getTeamDialogSession.id, sessionEpoch: getTeamDialogSession.epoch }, session);
            await repositoryReads.refreshAfterMutation(projectRuntime, projectRuntime.getSnapshot(), getTeamDialogSession.project.path);
            navigateToView("conflicts");
          }}
          projectPath={getTeamDialogSession.project.path}
          sessionEpoch={getTeamDialogSession.epoch}
          intent={getTeamIntent}
          runHooks={runGitHooks}
          canPublish={getTeamDialogSession.project.headState === "branch"}
          refreshRemote={
            isRemoteCheckRecent(getTeamDialogSession.teamSync)
              ? null
              : () => syncController.checkBeforeGet(
                projectRuntime,
                { projectId: getTeamDialogSession.id, sessionEpoch: getTeamDialogSession.epoch },
                mapSyncError,
              )
          }
          upstreamGone={getTeamDialogSession.teamSync.status?.state === "upstreamGone"}
          onClose={() => {
            finishSessionOperation(getTeamDialogSession.id);
            setGetTeamDialogSessionId(null);
          }}
          onApplied={async (result) => {
            const query = {
              projectId: getTeamDialogSession.project.path,
              sessionEpoch: getTeamDialogSession.epoch,
            };
            syncController.commitGetResult(projectRuntime, query, result);
            dispatchSessions({
              type: "setChangesSelection",
              id: getTeamDialogSession.id,
              selection: EMPTY_CHANGES_SELECTION,
            });
            await repositoryReads.refreshAfterMutation(
              projectRuntime,
              projectRuntime.getSnapshot(),
              getTeamDialogSession.project.path,
            );
          }}
          onPhaseChange={(phase) =>
            dispatchSessions({
              type: "setOperationPhase",
              id: getTeamDialogSession.id,
              phase,
            })
          }
          onSaveVersion={() => {
            finishSessionOperation(getTeamDialogSession.id);
            setGetTeamDialogSessionId(null);
            setSaveAfterSyncSessionId(getTeamDialogSession.id);
          }}
          onRevealFile={(filePath) => {
            void changesController
              .revealFile(getTeamDialogSession.project.path, getTeamDialogSession.epoch, filePath)
              .catch(() => undefined);
          }}
          onOpenConflicts={getTeamDialogSession.id === activeSession?.id ? () => {
            finishSessionOperation(getTeamDialogSession.id);
            setGetTeamDialogSessionId(null);
            openConflicts();
          } : undefined}
          onPublishAfter={async () => {
            const query = {
              projectId: getTeamDialogSession.project.path,
              sessionEpoch: getTeamDialogSession.epoch,
            };
            // A fresh plan after the get: its own fetch confirms the remote
            // still accepts the combined line before anything is sent.
            const plan = await publishPort.plan(query);
            const result = await publishPort.publish({
              ...query,
              remote: plan.target.remote,
              stateToken: plan.stateToken,
              runHooks: runGitHooks,
            });
            await recordPublished(getTeamDialogSession, result);
            return { publishedCount: result.publishedCount, remote: result.target.remote };
          }}
        />
      )}

      {project && branchSwitchTarget && (
        <Suspense fallback={null}>
          <SwitchBranchDialog
            isOpen
            projectPath={project.path}
            sessionEpoch={activeSession?.epoch ?? ""}
            target={branchSwitchTarget}
            onClose={() => {
              setBranchSwitchTarget(null);
              finishSessionOperation(project.path);
            }}
            onSwitched={(snapshot) => {
              branchesController.commit(activeBranchesQuery, snapshot);
              setBranchSwitchTarget(null);
              void handleBranchChanged(project.path);
              finishSessionOperation(project.path);
            }}
            onSaveVersion={() => {
              startSessionOperation("save");
              openWorkbench("changes");
            }}
            onCreateWithWork={() => {
              if (startBranchOperation(project.path)) {
                setCreateBranchRequest({ forceSwitch: false });
              }
            }}
            onPhaseChange={(phase) => setBranchOperationPhase(project.path, phase)}
          />
        </Suspense>
      )}

      {project && createBranchRequest && (
        <Suspense fallback={null}>
          <CreateBranchDialog
            isOpen
            projectPath={project.path}
            sessionEpoch={activeSession?.epoch ?? ""}
            forceSwitch={createBranchRequest.forceSwitch}
            startVersion={createBranchRequest.startVersion ?? null}
            onClose={() => {
              setCreateBranchRequest(null);
              finishSessionOperation(project.path);
            }}
            onCreated={(snapshot) => {
              branchesController.commit(activeBranchesQuery, snapshot);
              setCreateBranchRequest(null);
              void handleBranchChanged(project.path);
              finishSessionOperation(project.path);
            }}
            onPhaseChange={(phase) => setBranchOperationPhase(project.path, phase)}
          />
        </Suspense>
      )}

      {restoreDialog && restoreDialogSession && (
        <Suspense fallback={null}>
          <DiscardChangesDialog
            request={restoreDialog.request}
            projectPath={restoreDialogSession.project.path}
            sessionEpoch={restoreDialogSession.epoch}
            controller={changesController}
            onClose={() => {
              finishSessionOperation(restoreDialogSession.id);
              setRestoreDialog(null);
              setRecoveriesRevision((value) => value + 1);
              // Forgetting a copy changes no file, so no watcher reports it:
              // the Overview's card is read again here instead.
              void workDetailController.refreshRecovery({
                projectId: restoreDialogSession.project.path,
                sessionEpoch: restoreDialogSession.epoch,
              });
            }}
            onMutationCompleted={() => void handleMutationSucceeded(restoreDialogSession.project.path)}
            onPhaseChange={(phase) =>
              dispatchSessions({ type: "setOperationPhase", id: restoreDialogSession.id, phase })
            }
            onFinished={(outcome) => {
              // The files are back in Changes: that is where to look next.
              if (restoreDialogSession.id !== sessionsState.activeId) return;
              setChangesRestoredElsewhere(outcome);
              openWorkbench("changes");
            }}
          />
        </Suspense>
      )}

      {project && activeSession && (
        <SaveVersionDialog
          isOpen={saveDialogSessionId === sessionsState.activeId}
          projectPath={project.path}
          sessionEpoch={activeSession.epoch}
          selectedPaths={null}
          preview={previewFromWorkingTree({
            workingTree: activeSession.workingTree,
            headState: activeSession.project.headState,
            selectedPaths: null,
          })}
          runHooks={runGitHooks}
          onClose={closeSaveDialog}
          onSaved={() => void handleMutationSucceeded(project.path)}
          onPublishNow={() => openPublishDialog()}
          onPhaseChange={setSaveDialogPhase}
        />
      )}

      <AppOverlays
        accountController={accountController}
        issueReport={issueReport}
        projectSettings={{
          isOpen: isProjectSettingsOpen,
          setOpen: setIsProjectSettingsOpen,
          project:
            project && activeSession
              ? { path: project.path, sessionEpoch: activeSession.epoch, name: project.name }
              : null,
          section: projectSettingsSection,
          setSection: setProjectSettingsSection,
          cache: projectSettingsCache,
          iconChoice: project ? (projectIconChoices.get(project.path) ?? null) : null,
          technology: project ? (projectTechnologies.get(project.path) ?? null) : null,
          technologyFailed: project ? technologyFailures.has(project.path) : false,
          avatarStyle: projectAvatarStyle,
          onChooseIcon: (choice: string | null) => {
            if (project) setProjectIconChoice(project.path, choice);
          },
        }}
        settings={{
          isOpen: isSettingsOpen,
          setOpen: setIsSettingsOpen,
          theme,
          setTheme: changeTheme,
          reducedMotion,
          setReducedMotion,
          projectAvatarStyle,
          setProjectAvatarStyle,
          section: settingsSection,
          // Leaving a section drops the What's new landing, so coming back to
          // Updates opens at its top.
          setSection: (section: SettingsSection) => {
            setSettingsRevealWhatsNew(false);
            setSettingsSection(section);
          },
          gitTooling,
          ghTooling,
          githubAuth, gitlabAuth, glabTooling,
          openAccountsMenu,
          onAccountsMenuOpened: clearAccountsMenu,
          reopenLastProject,
          setReopenLastProject,
          confirmCloseProject,
          setConfirmCloseProject,
          watchProjects,
          setWatchProjects,
          remoteCheckInterval,
          setRemoteCheckInterval,
          automaticAppUpdates,
          setAutomaticAppUpdates,
          appUpdates,
          appUpdatesController,
          revealWhatsNew: settingsRevealWhatsNew,
          confirmDiscard,
          setConfirmDiscard,
          notificationsEnabled,
          setNotificationsEnabled,
          runGitHooks,
          setRunGitHooks,
          navigationItems: orderedProjectNavDestinations.map((destination) => ({
            id: destination.id,
            label: t[destination.labelKey],
            description: destination.descriptionKey ? t[destination.descriptionKey] : null,
            icon: destination.icon,
          })),
          defaultNavigationPreferences: DEFAULT_NAVIGATION_PREFERENCES,
          navigationPreferences,
          setNavigationPreferences,
          diffPreferences,
          setDiffPreferences,
          consolePreferences,
          setConsolePreferences,
          consoleConfirmChanges,
          identity: gitIdentity,
          defaultBranch,
          lineEndings,
        }}
        about={{ isOpen: isAboutOpen, setOpen: setIsAboutOpen }}
        appUpdate={{
          isOpen: isAppUpdateOpen,
          setOpen: setIsAppUpdateOpen,
          openUpdates: openAppUpdates,
        }}
        shortcuts={{ isOpen: isShortcutsOpen, setOpen: setIsShortcutsOpen }}
        closeConfirmation={{
          isOpen: isCloseConfirmOpen,
          setOpen: setIsCloseConfirmOpen,
          projectName: closeTargetSession?.project.name ?? null,
          onConfirm: () => {
            if (closeTargetId) {
              void performCloseSession(closeTargetId);
            }
          },
        }}
        error={{
          isOpen: isOpenErrorDialogOpen,
          setOpen: setIsOpenErrorDialogOpen,
          title: openErrorTitle,
          message: openError,
          recoveryAction: openErrorRecoveryAction,
        }}
      />
      <TooltipHost />
    </div>
    </ToastProvider>
    </DiffPreferencesProvider>
  );
}
