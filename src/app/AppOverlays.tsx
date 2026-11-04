import { gitlabToolingPort, useGitLabToolingCopy, type GitLabAuthController } from "../features/gitlab";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Dispatch, SetStateAction } from "react";
import { Check, CircleAlert, Copy, FolderX, Keyboard, Settings } from "lucide-react";
import { useLanguage } from "../i18n";
import type { DiffPreferences } from "../features/changes";
import { type GitHubAuthController } from "../features/github";
import { AccountsSettings } from "../features/hosting-servers";
import { AccountOverlays, AccountSettings, useAccountModal, type AccountController } from "../features/account";
import { ConsoleConfirmChangesSetting, type ConsoleConfirmChangesState, type ConsolePreferences } from "../features/console";
import {
  SettingsPanel,
  isGitInstallationBroken,
  readGitVersion,
  type DefaultBranchState,
  type GitIdentityState,
  type GitToolingState,
  type LineEndingsState,
  type NavigationItem,
  type NavigationPreferences,
  type RemoteCheckIntervalMinutes,
  type SettingsSection,
  type ThemePreference,
} from "../features/settings";
import {
  ProjectSettingsPanel,
  type ProjectSettingsCache,
  type ProjectSettingsSection,
  type ProjectSettingsTarget,
} from "../features/project-settings";
import {
  Dialog,
  DialogCloseButton,
  Mascot,
  autoHideScrollbarProps,
  dialogBackdropProps,
  type ProjectAvatarStyle,
  type ProjectIconChoice,
  type TechnologyId,
} from "../shared/ui";
import { useModalFocus } from "../shared/ui/modalFocus";
import { PRODUCT_NAME_PARTS, modifierKeyLabels } from "./branding";
import { APP_CHANGELOG, CURRENT_APP_RELEASE } from "./appRelease";
import { ChangelogDialog, type AppUpdateStatusLine } from "./ChangelogDialog";
import { IssueReportDialog } from "./IssueReportDialog";
import type { IssueReportState } from "./useIssueReport";
import type { AppUpdatesController, AppUpdatesSnapshot, StartupUpdateConfirmation, UpdateState } from "../features/app-updates";
import { AppUpdateDialog, AppUpdateSettingsControl, appUpdateTranslations, useStartupUpdateReceipt } from "../features/app-updates";
import { describePlatform, formatDiagnostics, readWebviewVersion, useSystemInfo } from "./systemInfo";
import { describeStack, describeStackHost } from "./stack";
import { OperatingSystemMark, StackMark } from "./vendorMarks";

type BooleanSetter = Dispatch<SetStateAction<boolean>>;

const NO_STARTUP_CONFIRMATION: StartupUpdateConfirmation = { kind: "none" };

/** Whether a provider CLI can run, or `null` while it has not been read yet. */
function toolAvailable(tooling: GitToolingState): boolean | null {
  return tooling.diagnostics === null ? null : tooling.diagnostics.state === "available";
}

/** The one line About can honestly say about updates: what the release model
 * knows and a person can act on. Every state names itself, so the line is never
 * blank — a development build with no feed reads "Updates unavailable" rather
 * than going silent — and only the one transient state with nothing useful to
 * say (`installing`) yields null. The design's own message is `upToDateLabel`
 * ("Up to date"), kept short because it shares the text row; the rest reuse
 * the update copy so the two surfaces cannot describe one build differently. */
function aboutUpdateStatus(
  state: UpdateState | undefined,
  t: ReturnType<typeof appUpdateTranslations>,
  upToDateLabel: string,
  unavailableLabel: string,
): AppUpdateStatusLine | null {
  if (state === undefined) {
    return null;
  }
  switch (state.kind) {
    case "current":
      return { tone: "ok", label: upToDateLabel };
    case "idle":
      return { tone: "muted", label: t.status.idle };
    case "unavailable":
    case "failed":
    case "cancelled":
      return { tone: "muted", label: unavailableLabel };
    case "checking":
      return { tone: "busy", label: t.checking };
    case "downloading":
      return { tone: "busy", label: t.downloading };
    case "verifying":
      return { tone: "busy", label: t.verifying };
    case "available":
      return { tone: "attention", label: t.available(state.candidate.version) };
    case "ready":
      return { tone: "attention", label: t.ready };
    case "blocked":
      return { tone: "attention", label: t.status.blocked };
    default:
      return null;
  }
}

export type AppOverlaysProps = {
  accountController?: AccountController | null;
  issueReport: IssueReportState;
  settings: {
    isOpen: boolean;
    setOpen: BooleanSetter;
    theme: ThemePreference;
    setTheme: (theme: ThemePreference) => void;
    reducedMotion: boolean;
    setReducedMotion: BooleanSetter;
    projectAvatarStyle?: ProjectAvatarStyle;
    setProjectAvatarStyle?: (style: ProjectAvatarStyle) => void;
    section: SettingsSection;
    setSection: (section: SettingsSection) => void;
    gitTooling: GitToolingState;
    ghTooling: GitToolingState;
    glabTooling: GitToolingState;
    gitlabAuth: GitLabAuthController;
    githubAuth: GitHubAuthController;
    /** Accounts opens with its provider menu open (Home's "+"), once. */
    openAccountsMenu?: boolean;
    onAccountsMenuOpened?: () => void;
    reopenLastProject: boolean;
    setReopenLastProject: BooleanSetter;
    confirmCloseProject: boolean;
    setConfirmCloseProject: BooleanSetter;
    watchProjects: boolean;
    setWatchProjects: BooleanSetter;
    remoteCheckInterval: RemoteCheckIntervalMinutes;
    setRemoteCheckInterval: Dispatch<SetStateAction<RemoteCheckIntervalMinutes>>;
    confirmDiscard: boolean;
    setConfirmDiscard: BooleanSetter;
    notificationsEnabled: boolean;
    setNotificationsEnabled: BooleanSetter;
    runGitHooks: boolean;
    setRunGitHooks: BooleanSetter;
    navigationItems: NavigationItem[];
    defaultNavigationPreferences: NavigationPreferences;
    navigationPreferences: NavigationPreferences;
    setNavigationPreferences: Dispatch<SetStateAction<NavigationPreferences>>;
    diffPreferences: DiffPreferences;
    setDiffPreferences: Dispatch<SetStateAction<DiffPreferences>>;
    consolePreferences: ConsolePreferences;
    setConsolePreferences: Dispatch<SetStateAction<ConsolePreferences>>;
    consoleConfirmChanges?: ConsoleConfirmChangesState;
    /** Both read once after first paint and kept above this dialog, which is
     * unmounted on every close. The line-endings state already knows about the
     * open project, so the overlay never has to pass one down. */
    identity: GitIdentityState;
    defaultBranch: DefaultBranchState;
    lineEndings: LineEndingsState;
    automaticAppUpdates?: boolean;
    setAutomaticAppUpdates?: BooleanSetter;
    appUpdates?: AppUpdatesSnapshot;
    appUpdatesController?: AppUpdatesController;
  };
  /** The per-project panel. `project` is null exactly when no project is open,
   * which is also when nothing can open this dialog: every read behind it is
   * repository-scoped and needs a live session epoch. */
  projectSettings: {
    isOpen: boolean;
    setOpen: BooleanSetter;
    project: (ProjectSettingsTarget & { name: string }) | null;
    section: ProjectSettingsSection;
    setSection: (section: ProjectSettingsSection) => void;
    /** Kept by the shell because this dialog is unmounted on every close: it is
     * what makes reopening it show the project's settings on the first frame
     * instead of a spinner. */
    cache: ProjectSettingsCache;
    /** The project's own icon choice and detected technology, for the icon
     * section; the choice is persisted by the shell, per project. */
    iconChoice?: ProjectIconChoice;
    technology?: TechnologyId | null;
    /** True when the technology read failed, so the section can say so rather
     * than claim nothing was detected. */
    technologyFailed?: boolean;
    avatarStyle?: ProjectAvatarStyle;
    onChooseIcon?: (choice: ProjectIconChoice) => void;
  };
  about: { isOpen: boolean; setOpen: BooleanSetter };
  changelog: { isOpen: boolean; setOpen: BooleanSetter };
  appUpdate?: { isOpen: boolean; setOpen: BooleanSetter };
  shortcuts: { isOpen: boolean; setOpen: BooleanSetter };
  closeConfirmation: {
    isOpen: boolean;
    setOpen: BooleanSetter;
    projectName: string | null;
    onConfirm: () => void;
  };
  error: {
    isOpen: boolean;
    setOpen: BooleanSetter;
    title: string;
    message: string | null;
    /** The way *out* of the failure — "turn this folder into a project" after
     * opening an ordinary folder. It is the constructive choice, so it takes
     * the primary button and Close steps down to secondary; when there is no
     * recovery, Close is the only action and keeps the primary treatment. */
    recoveryAction?: { label: string; onAction: () => void; alternative?: { label: string; onAction: () => void } } | null;
  };
};

export function AppOverlays({
  accountController,
  issueReport,
  settings,
  projectSettings,
  about,
  changelog,
  appUpdate,
  shortcuts,
  closeConfirmation,
  error,
}: AppOverlaysProps): React.JSX.Element {
  const { t, language } = useLanguage();
  const glabCopy = useGitLabToolingCopy();
  const systemInfo = useSystemInfo();
  const [didCopyDiagnostics, setDidCopyDiagnostics] = useState(false);
  /* The rail badges Updates only while there is something the reader can act
     on — a release to download or one ready to install — and names it. */
  const appUpdateState = settings.appUpdates?.state;
  const updateAttention =
    appUpdateState?.kind === "available" || appUpdateState?.kind === "ready"
      ? appUpdateTranslations(language).available(appUpdateState.candidate.version)
      : null;
  const aboutUpdate = aboutUpdateStatus(appUpdateState, appUpdateTranslations(language), t.aboutUpToDate, t.aboutUpdateUnavailable);
  /* The first launch after an install reports how it went: a toast leading to
     What's new when it worked, the update dialog when it did not. Raised here
     because this is inside the toast provider and owns both destinations. */
  const setChangelogOpen = changelog.setOpen;
  const setAppUpdateOpen = appUpdate?.setOpen;
  const openWhatsNew = useCallback(() => setChangelogOpen(true), [setChangelogOpen]);
  const openAppUpdate = useCallback(() => setAppUpdateOpen?.(true), [setAppUpdateOpen]);
  useStartupUpdateReceipt({
    confirmation: settings.appUpdates?.startupConfirmation ?? NO_STARTUP_CONFIRMATION,
    onOpenWhatsNew: CURRENT_APP_RELEASE.highlights.length > 0 ? openWhatsNew : undefined,
    onOpenDialog: openAppUpdate,
  });
  const settingsRef = useRef<HTMLDivElement>(null);
  const accountModalOpen = useAccountModal(accountController ?? null);
  const projectSettingsRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const shortcutsRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // The panel registers this when it has an identity draft that dismissing
  // would throw away. It returns true when it has taken over the close — by
  // saving first, or by asking — so the shell must not close behind it.
  const settingsCloseGuardRef = useRef<(() => boolean) | null>(null);
  const registerSettingsCloseGuard = useCallback((guard: (() => boolean) | null) => {
    settingsCloseGuardRef.current = guard;
  }, []);
  // `settings` is rebuilt by the caller on every render, so its setter is read
  // through a ref: a changing callback identity would make `useModalFocus`
  // reinstall its listener and re-steal focus on every keystroke in the panel.
  const setSettingsOpenRef = useRef(settings.setOpen);
  setSettingsOpenRef.current = settings.setOpen;
  const closeSettings = useCallback(() => {
    settingsCloseGuardRef.current = null;
    setSettingsOpenRef.current(false);
  }, []);
  // Shaped as a state setter because that is what `useModalFocus` takes; it
  // only ever calls it with `false`, exactly as SaveVersionDialog does.
  const requestSettingsClose = useCallback<BooleanSetter>(() => {
    if (settingsCloseGuardRef.current?.()) {
      return;
    }
    setSettingsOpenRef.current(false);
  }, []);

  /* The project panel guards its close the same way Settings does, and for the
     same reason: an ignore file being edited is work the user would lose
     without being asked. The guard returns true when it has taken the close
     over, so the shell must not close behind it. */
  const projectSettingsCloseGuardRef = useRef<(() => boolean) | null>(null);
  const registerProjectSettingsCloseGuard = useCallback((guard: (() => boolean) | null) => {
    projectSettingsCloseGuardRef.current = guard;
  }, []);
  const setProjectSettingsOpenRef = useRef(projectSettings.setOpen);
  setProjectSettingsOpenRef.current = projectSettings.setOpen;
  const closeProjectSettings = useCallback(() => {
    projectSettingsCloseGuardRef.current = null;
    setProjectSettingsOpenRef.current(false);
  }, []);
  const requestProjectSettingsClose = useCallback<BooleanSetter>(() => {
    if (projectSettingsCloseGuardRef.current?.()) {
      return;
    }
    setProjectSettingsOpenRef.current(false);
  }, []);

  // Read off the settings props because that is where Git tooling already
  // lives; About reports it, it does not own it.
  const gitVersion = readGitVersion(settings.gitTooling.diagnostics);
  // Both are constants for the life of the window, so they are read inline
  // rather than held in state: a regex over the user agent and a lookup over
  // four build-time strings cost less than the hook that would cache them.
  const webviewVersion = readWebviewVersion(navigator.userAgent);
  const stack = describeStack();
  const copyDiagnostics = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(
        formatDiagnostics({
          appVersion: CURRENT_APP_RELEASE.version,
          system: systemInfo,
          webview: webviewVersion,
          gitVersion,
        }),
      );
      setDidCopyDiagnostics(true);
    } catch {
      // Nothing useful to say: the button simply does not confirm.
    }
  };
  useEffect(() => {
    if (!didCopyDiagnostics) {
      return undefined;
    }
    const timer = window.setTimeout(() => setDidCopyDiagnostics(false), 2000);
    return () => window.clearTimeout(timer);
  }, [didCopyDiagnostics]);

  useModalFocus(settings.isOpen && !accountModalOpen, settingsRef, requestSettingsClose);
  useModalFocus(projectSettings.isOpen, projectSettingsRef, requestProjectSettingsClose);
  useModalFocus(about.isOpen, aboutRef, about.setOpen);
  useModalFocus(shortcuts.isOpen, shortcutsRef, shortcuts.setOpen);
  useModalFocus(closeConfirmation.isOpen, closeRef, closeConfirmation.setOpen);
  useModalFocus(error.isOpen, errorRef, error.setOpen);

  /* The shortcut sheet is built here rather than stored, because every label is
     already translated and the two modifier keys change with the platform. The
     keycaps spell the OS's own caps — ⌘/⇧ on a Mac, Ctrl/Shift elsewhere — and
     the sheet's tile wears that platform's mark, so what is drawn is the
     keyboard the reader actually has. */
  const shortcutKeys = modifierKeyLabels(systemInfo?.platform);
  const shortcutKeyLabel = (token: string): string => {
    switch (token) {
      case "mod":
        return shortcutKeys.mod;
      case "shift":
        return shortcutKeys.shift;
      case "tab":
        return "Tab";
      case "esc":
        return shortcutKeys.esc;
      default:
        return token;
    }
  };
  const shortcutGroups: { caption: string | null; items: { label: string; keys: string[] }[] }[] = [
    {
      // The opening row needs no heading: the sheet's own title already names
      // it, and a caption here would collide with the keyboard tile above.
      caption: null,
      items: [
        { label: t.shortcutsOpenPalette, keys: ["mod", "K"] },
        { label: t.shortcutsOpenSettings, keys: ["mod", ","] },
        { label: t.shortcutsToggleSidebar, keys: ["mod", "B"] },
      ],
    },
    {
      caption: t.shortcutsGroupProjects,
      items: [
        { label: t.shortcutsNextProject, keys: ["mod", "tab"] },
        { label: t.shortcutsPreviousProject, keys: ["mod", "shift", "tab"] },
      ],
    },
    {
      caption: t.shortcutsGroupEditing,
      items: [
        { label: t.shortcutsSaveVersion, keys: ["mod", "S"] },
        { label: t.shortcutsRenameBranch, keys: ["F2"] },
      ],
    },
    {
      caption: t.shortcutsGroupInterface,
      items: [{ label: t.shortcutsCloseDialogs, keys: ["esc"] }],
    },
  ];
  const shortcutPlatform = systemInfo?.platform ?? null;
  const shortcutPlatformMark: string | null =
    shortcutPlatform === "windows" || shortcutPlatform === "macos" || shortcutPlatform === "linux"
      ? shortcutPlatform
      : null;
  const shortcutPlatformName = systemInfo ? describePlatform(systemInfo) : "";

  return (
    <>
      {import.meta.env.DEV && accountController && <AccountOverlays controller={accountController} overSettings={settings.isOpen} />}
      <IssueReportDialog report={issueReport} />
      {settings.isOpen && (
        <div className="app-dialog-backdrop" role="presentation" {...dialogBackdropProps(() => requestSettingsClose(false))}>
          <div
            ref={settingsRef}
            className="settings-dialog"
            inert={accountModalOpen}
            aria-hidden={accountModalOpen || undefined}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-dialog-title"
            tabIndex={-1}
          >
            <header className="settings-dialog__header">
              <span className="app-dialog__glyph" aria-hidden="true"><Settings /></span>
              <div className="settings-dialog__heading">
                <h2 id="settings-dialog-title">{t.navSettings}</h2>
              </div>
              {/* A broken Git installation stops every screen in the app, so it
                  cannot wait in the third section for someone to look. */}
              {isGitInstallationBroken(settings.gitTooling.diagnostics) && (
                <button
                  className={`settings-dialog__alert${
                    settings.section === "git" ? " settings-dialog__alert--active" : ""
                  }`}
                  type="button"
                  onClick={() => settings.setSection("git")}
                >
                  <CircleAlert aria-hidden="true" />
                  {t.settingsGitNeedsAttention}
                </button>
              )}
              <DialogCloseButton label={t.commonClose} onClick={() => requestSettingsClose(false)} />
            </header>
            <SettingsPanel
              theme={settings.theme}
              setTheme={settings.setTheme}
              reducedMotion={settings.reducedMotion}
              setReducedMotion={settings.setReducedMotion}
              projectAvatarStyle={settings.projectAvatarStyle}
              setProjectAvatarStyle={settings.setProjectAvatarStyle}
              activeSection={settings.section}
              gitodileAccount={import.meta.env.DEV && accountController ? <AccountSettings controller={accountController} /> : undefined}
              onSectionChange={settings.setSection}
              ghTooling={settings.ghTooling}
              glabTooling={settings.glabTooling} glabActions={gitlabToolingPort} glabCopy={glabCopy}
              accounts={(tooling) => <AccountsSettings tooling={tooling}
                github={{ controller: settings.githubAuth, cliAvailable: toolAvailable(settings.ghTooling) }}
                gitlab={{ controller: settings.gitlabAuth, cliAvailable: toolAvailable(settings.glabTooling) }}
                openMenu={settings.openAccountsMenu} onMenuOpened={settings.onAccountsMenuOpened} />}
              gitDiagnostics={settings.gitTooling.diagnostics}
              gitUpdateStatus={settings.gitTooling.updateStatus}
              onCheckGitUpdate={settings.gitTooling.checkUpdate}
              isCheckingGitUpdate={settings.gitTooling.isCheckingUpdate}
              onRefreshGitDiagnostics={settings.gitTooling.refreshDiagnostics}
              isRefreshingGitDiagnostics={settings.gitTooling.isRefreshingDiagnostics}
              reopenLastProject={settings.reopenLastProject}
              setReopenLastProject={settings.setReopenLastProject}
              confirmCloseProject={settings.confirmCloseProject}
              setConfirmCloseProject={settings.setConfirmCloseProject}
              watchProjects={settings.watchProjects}
              setWatchProjects={settings.setWatchProjects}
              remoteCheckInterval={settings.remoteCheckInterval}
              setRemoteCheckInterval={settings.setRemoteCheckInterval}
              confirmDiscard={settings.confirmDiscard}
              setConfirmDiscard={settings.setConfirmDiscard}
              notificationsEnabled={settings.notificationsEnabled}
              setNotificationsEnabled={settings.setNotificationsEnabled}
              runGitHooks={settings.runGitHooks}
              setRunGitHooks={settings.setRunGitHooks}
              navigationItems={settings.navigationItems}
              defaultNavigationPreferences={settings.defaultNavigationPreferences}
              navigationPreferences={settings.navigationPreferences}
              setNavigationPreferences={settings.setNavigationPreferences}
              diffPreferences={settings.diffPreferences}
              setDiffPreferences={settings.setDiffPreferences}
              consolePreferences={settings.consolePreferences}
              setConsolePreferences={settings.setConsolePreferences}
              consoleConfirmChanges={settings.consoleConfirmChanges ? <ConsoleConfirmChangesSetting state={settings.consoleConfirmChanges} /> : null}
              identity={settings.identity}
              defaultBranch={settings.defaultBranch}
              lineEndingsState={settings.lineEndings}
              applicationUpdates={settings.appUpdates && settings.appUpdatesController && settings.setAutomaticAppUpdates ? (
                <AppUpdateSettingsControl
                  snapshot={settings.appUpdates}
                  controller={settings.appUpdatesController}
                  installed={CURRENT_APP_RELEASE}
                  name={`${PRODUCT_NAME_PARTS.lead}${PRODUCT_NAME_PARTS.tail}`}
                  enabled={settings.automaticAppUpdates ?? false}
                  setEnabled={settings.setAutomaticAppUpdates}
                  onOpenDialog={appUpdate ? () => appUpdate.setOpen(true) : undefined}
                  releases={APP_CHANGELOG}
                />
              ) : null}
              applicationUpdateAttention={updateAttention}
              onClose={closeSettings}
              onRegisterCloseGuard={registerSettingsCloseGuard}
            />
          </div>
        </div>
      )}

      {projectSettings.isOpen && projectSettings.project && (
        <div
          className="app-dialog-backdrop"
          role="presentation"
          {...dialogBackdropProps(() => requestProjectSettingsClose(false))}
        >
          <div
            ref={projectSettingsRef}
            className="settings-dialog project-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-settings-dialog-title"
            tabIndex={-1}
          >
            <header className="settings-dialog__header">
              <span className="app-dialog__glyph" aria-hidden="true"><Settings /></span>
              <div className="settings-dialog__heading">
                <h2 id="project-settings-dialog-title">{t.projectSettingsTitle}</h2>
                {/* The project is named in the header rather than only in the
                    body: this dialog looks like Settings, and the one thing it
                    must never be mistaken for is Settings. */}
                <p className="project-settings-dialog__project">{projectSettings.project.name}</p>
              </div>
              <DialogCloseButton
                label={t.commonClose}
                onClick={() => requestProjectSettingsClose(false)}
              />
            </header>
            <ProjectSettingsPanel
              project={{
                path: projectSettings.project.path,
                sessionEpoch: projectSettings.project.sessionEpoch,
              }}
              projectName={projectSettings.project.name}
              cache={projectSettings.cache}
              iconChoice={projectSettings.iconChoice}
              technology={projectSettings.technology}
              technologyFailed={projectSettings.technologyFailed}
              avatarStyle={projectSettings.avatarStyle}
              onChooseIcon={projectSettings.onChooseIcon}
              activeSection={projectSettings.section}
              onSectionChange={projectSettings.setSection}
              onClose={closeProjectSettings}
              onRegisterCloseGuard={registerProjectSettingsCloseGuard}
            />
          </div>
        </div>
      )}

      {about.isOpen && (
        <div className="app-dialog-backdrop" role="presentation" {...dialogBackdropProps(() => about.setOpen(false))}>
          <div
            {...autoHideScrollbarProps<HTMLDivElement>()}
            ref={aboutRef}
            className="about-dialog auto-hide-scrollbar"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            tabIndex={-1}
          >
            {/* The build's version, parked in the corner the close control
                occupies, so the identity block below is only the mark, the name
                and the promise. */}
            <p className="about-dialog__version" aria-label={`GitOdile ${CURRENT_APP_RELEASE.version}`}>
              {CURRENT_APP_RELEASE.version}
            </p>
            <DialogCloseButton label={t.commonClose} onClick={() => about.setOpen(false)} />
            {/* The mark at hero scale, then the name, then the promise. The
                mark is decorative and stays out of the accessibility tree, and
                the h2 still carries the product name, so the dialog is named by
                the app it belongs to before it states its promise. */}
            <div className="about-dialog__hero">
              <span className="about-dialog__mark"><Mascot motion="wink" /></span>
              <h2 id="about-title">
                <span className="about-dialog__product-name">
                  {PRODUCT_NAME_PARTS.lead}
                  <span className="about-dialog__odile">{PRODUCT_NAME_PARTS.tail}</span>
                </span>{" "}
                <span className="about-dialog__tagline">{t.aboutHeading}</span>
              </h2>
            </div>
            {/* The one line About can say about updates, and the way to the
                release notes. The state is named whenever the release model has
                one, so the slot is never blank and never an alarm About cannot
                explain; only `installing` leaves it to the link alone. */}
            <p className="about-dialog__update">
              {aboutUpdate && (
                <>
                  <span className={`about-dialog__update-status about-dialog__update-status--${aboutUpdate.tone}`}>
                    {aboutUpdate.tone === "ok" && <Check aria-hidden="true" />}
                    {aboutUpdate.label}
                  </span>
                  <span className="about-dialog__update-dot" aria-hidden="true">·</span>
                </>
              )}
              <button
                className="about-dialog__update-link"
                type="button"
                onClick={() => { about.setOpen(false); changelog.setOpen(true); }}
              >
                {t.changelogTitle}
              </button>
            </p>
            <p className="about-dialog__description">{t.aboutDescription}</p>
            {/* The licence leads the facts: it names what the build is and
                where its text and source live. It keeps the plain link style
                and drops its own rule, because one separator now closes it
                against the diagnostics below. */}
            <div className="about-dialog__legal about-dialog__legal--bare">
              <span>{t.aboutLicense}</span>
              <button type="button" onClick={() => void openUrl("https://github.com/martinezelx/gitodile/blob/main/LICENSE").catch(() => undefined)}>{t.aboutViewLicense}</button>
              <button type="button" onClick={() => void openUrl("https://github.com/martinezelx/gitodile").catch(() => undefined)}>{t.aboutViewSource}</button>
            </div>
            <div className="about-dialog__rule" aria-hidden="true" />
            {(systemInfo || webviewVersion || gitVersion) && (
              <section className="about-technical" aria-labelledby="about-technical-title">
                {/* The copy control heads the rows it copies rather than
                    following them: "Your system" and the way to put it on the
                    clipboard are one thing, and a full-width button under the
                    list spent a line of height on the same idea. */}
                <div className="about-technical__head">
                  <h3 id="about-technical-title">{t.aboutTechnicalDetails}</h3>
                  <button
                    className="about-technical__copy"
                    type="button"
                    aria-label={didCopyDiagnostics ? undefined : t.aboutCopySystemInfo}
                    onClick={() => void copyDiagnostics()}
                  >
                    {didCopyDiagnostics ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {didCopyDiagnostics ? t.aboutCopied : t.aboutCopy}
                  </button>
                </div>
                <dl className="about-details">
                  {systemInfo && (
                    <>
                      {/* Name and build are separate rows on purpose. Windows 11
                          reports NT 10.0, so a combined "Windows 10.0.26200" tells
                          a Windows 11 user the wrong thing. */}
                      <div>
                        <dt>{t.aboutSystem}</dt>
                        <dd>
                          {/* The mark restates the value beside it rather than
                              adding a fact, so it sits inside the value and not
                              in a column of its own. */}
                          <span className="about-details__value">
                            <OperatingSystemMark platform={systemInfo.platform} />
                            {describePlatform(systemInfo)} ({systemInfo.arch})
                          </span>
                        </dd>
                      </div>
                      <div><dt>{t.aboutSystemVersion}</dt><dd>{systemInfo.version}</dd></div>
                    </>
                  )}
                  {webviewVersion && <div><dt>{t.aboutWebview}</dt><dd>{webviewVersion}</dd></div>}
                  {gitVersion && <div><dt>{t.aboutGitVersion}</dt><dd>{gitVersion}</dd></div>}
                </dl>
              </section>
            )}
            <div className="about-dialog__rule about-dialog__rule--section" aria-hidden="true" />
            {/* Credits, kept apart from the diagnostics above because they are
                not diagnostics: every user on this build runs these same
                versions, so none of them can explain a machine-specific bug.
                One row per layer rather than a row of tiles — the mark beside
                the name and number, which stack so a credit is wide, not tall. */}
            {stack.length > 0 && (
              <section className="about-stack" aria-labelledby="about-stack-title">
                {/* The credits are recognisable as marks and names, so the
                    heading only names the section for assistive technology. */}
                <h3 id="about-stack-title" className="visually-hidden">{t.aboutBuiltWith}</h3>
                <ul className="about-stack__list">
                  {stack.map((layer) => (
                    <li key={layer.id}>
                      {/* A button rather than an anchor: the destination is a
                          browser outside the app, not a document this webview
                          can navigate to, and an `href` here would let a middle
                          click replace the window the dialog is sitting in. */}
                      <button
                        className="about-stack__item"
                        type="button"
                        aria-label={t.aboutStackLink(layer.name, describeStackHost(layer.url))}
                        onClick={() => void openUrl(layer.url).catch(() => undefined)}
                      >
                        <StackMark layer={layer.id} />
                        <span className="about-stack__text">
                          <span className="about-stack__name">{layer.name}</span>
                          <span className="about-stack__version">{layer.version}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {/* The credit closes the dialog, under the licence it used to sit
                above. */}
            <div className="about-dialog__legal about-dialog__legal--stacked">
              <p className="about-dialog__made-with">
                {t.aboutFooterMadeWith}{" "}
                <span className="about-dialog__heart" role="img" aria-label={t.aboutHeartLabel}>♥</span>{" "}
                {t.aboutFooterByAuthor}
              </p>
            </div>
          </div>
        </div>
      )}

      <ChangelogDialog
        isOpen={changelog.isOpen}
        setOpen={changelog.setOpen}
        onCheckForUpdates={appUpdate && settings.appUpdatesController ? () => {
          changelog.setOpen(false);
          appUpdate.setOpen(true);
          void settings.appUpdatesController?.check();
        } : undefined}
        onOpenUpdates={appUpdate && settings.appUpdatesController ? () => {
          changelog.setOpen(false);
          appUpdate.setOpen(true);
        } : undefined}
        updateStatus={aboutUpdate}
      />
      {appUpdate && settings.appUpdates && settings.appUpdatesController && (
        <AppUpdateDialog isOpen={appUpdate.isOpen} setOpen={appUpdate.setOpen} snapshot={settings.appUpdates} controller={settings.appUpdatesController} installed={CURRENT_APP_RELEASE} />
      )}

      {shortcuts.isOpen && (
        <div className="app-dialog-backdrop" role="presentation" {...dialogBackdropProps(() => shortcuts.setOpen(false))}>
          <div ref={shortcutsRef} className="about-dialog shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" tabIndex={-1}>
            <header className="shortcuts-dialog__header">
              <span className="shortcuts-dialog__tile">
                <Keyboard aria-hidden="true" />
                {shortcutPlatformMark !== null && (
                  <span
                    className="shortcuts-dialog__tile-badge"
                    role="img"
                    aria-label={t.shortcutsPlatformLabel(shortcutPlatformName)}
                    data-tooltip={t.shortcutsPlatformLabel(shortcutPlatformName)}
                  >
                    <OperatingSystemMark platform={shortcutPlatformMark} />
                  </span>
                )}
              </span>
              <h2 id="shortcuts-title">{t.shortcutsDialogTitle}</h2>
              <DialogCloseButton label={t.commonClose} onClick={() => shortcuts.setOpen(false)} />
            </header>
            <div className="shortcuts-groups">
              {shortcutGroups.map((group, groupIndex) => (
                <section className="shortcuts-group" key={group.caption ?? `shortcut-group-${groupIndex}`}>
                  {group.caption !== null && (
                    <h3 className="shortcuts-group__caption">{group.caption}</h3>
                  )}
                  <ul className="shortcuts-rows">
                    {group.items.map((item) => (
                      <li className="shortcuts-row" key={item.label}>
                        <span className="shortcuts-row__label">{item.label}</span>
                        <span className="shortcuts-keys">
                          {item.keys.map((token, keyIndex) => (
                            <kbd key={`${token}-${keyIndex}`}>{shortcutKeyLabel(token)}</kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {closeConfirmation.isOpen && (
        <Dialog
          size="s"
          title={t.closeConfirmTitle}
          titleId="close-confirm-title"
          descriptionId="close-confirm-body"
          icon={<FolderX />}
          tone="neutral"
          onClose={() => closeConfirmation.setOpen(false)}
          closeLabel={t.commonClose}
          dialogRef={closeRef}
        >
          <p className="app-dialog__text" id="close-confirm-body">
            {closeConfirmation.projectName ? t.closeConfirmBodyNamed(closeConfirmation.projectName) : t.closeConfirmBodyGeneric}
          </p>
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => closeConfirmation.setOpen(false)}>{t.commonCancel}</button>
            <button className="primary-button" type="button" onClick={closeConfirmation.onConfirm}>{t.overviewCloseProject}</button>
          </div>
        </Dialog>
      )}

      {error.isOpen && error.message && (
        /* `aria-describedby` rather than a `role="alert"` on the message: an
           alertdialog already announces its own body on open, and the live
           region made a screen reader read the failure twice. */
        <Dialog
          size="s"
          role="alertdialog"
          title={error.title}
          titleId="open-error-title"
          descriptionId="open-error-message"
          icon={<CircleAlert />}
          tone="danger"
          onClose={() => error.setOpen(false)}
          closeLabel={t.commonClose}
          dialogRef={errorRef}
        >
          <p className="app-dialog__text" id="open-error-message">{error.message}</p>
          {/* Dismiss (or the other way out) first, constructive last — the
              order every other dialog uses. */}
          <div className="dialog-actions">
            {error.recoveryAction?.alternative ? (
              <button className="secondary-button" type="button" onClick={error.recoveryAction.alternative.onAction}>
                {error.recoveryAction.alternative.label}
              </button>
            ) : (
              <button
                className={error.recoveryAction ? "secondary-button" : "primary-button"}
                type="button"
                onClick={() => error.setOpen(false)}
              >
                {t.commonClose}
              </button>
            )}
            {error.recoveryAction && (
              <button className="primary-button" type="button" onClick={error.recoveryAction.onAction}>
                {error.recoveryAction.label}
              </button>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
