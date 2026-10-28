import { en as accountEn } from "../features/account/translations.en";
import { en as appEn } from "../app/translations.en";
import { en as sharedEn } from "../shared/i18n/translations.en";
import { en as cloneEn } from "../features/clone/translations.en";
import { en as consoleEn } from "../features/console/translations.en";
import { en as initializeProjectEn } from "../features/initialize-project/translations.en";
import { en as notificationsEn } from "../features/notifications/translations.en";
import { en as historyEn } from "../features/history/translations.en";
import { en as gitlabEn } from "../features/gitlab/translations.en";
import { en as gitlabTokenEn } from "../features/gitlab/tokenTranslations.en";
import { en as gitlabToolingEn } from "../features/gitlab/toolingTranslations.en";
import { en as githubEn } from "../features/github/translations.en";
import { en as githubTokenEn } from "../features/github/tokenTranslations.en";
import { en as bitbucketEn } from "../features/bitbucket/translations.en";
import { en as azureEn } from "../features/azure/translations.en";
import { en as hostingServersEn } from "../features/hosting-servers/translations.en";
import { en as repositoryBrowserEn } from "../features/repository-browser/translations.en";
import { en as accountsEn } from "../features/accounts/translations.en";
import { en as homeEn } from "../features/home/translations.en";
import { en as overviewEn } from "../features/overview/translations.en";
import { en as statusEn } from "../features/status/translations.en";
import { en as syncEn } from "../features/sync/translations.en";
import { en as changesEn } from "../features/changes/translations.en";
import { en as saveVersionEn } from "../features/save-version/translations.en";
import { en as settingsEn } from "../features/settings/translations.en";
import { en as projectSettingsEn } from "../features/project-settings/translations.en";
import { en as publishEn } from "../features/publish/translations.en";
import { en as branchesEn } from "../features/branches/translations.en";
import { en as workbenchEn } from "../features/workbench/translations.en";
import { en as conflictsEn } from "../features/conflicts/translations.en";

/** Each namespace on its own, for the key-parity checks. */
export const enNamespaces = {
  account: accountEn,
  app: appEn,
  shared: sharedEn,
  clone: cloneEn,
  console: consoleEn,
  initializeProject: initializeProjectEn,
  notifications: notificationsEn,
  history: historyEn,
  gitlab: gitlabEn,
  gitlabToken: gitlabTokenEn,
  gitlabTooling: gitlabToolingEn,
  github: githubEn,
  githubToken: githubTokenEn,
  bitbucket: bitbucketEn,
  azure: azureEn,
  hostingServers: hostingServersEn,
  repositoryBrowser: repositoryBrowserEn,
  accounts: accountsEn,
  home: homeEn,
  overview: overviewEn,
  status: statusEn,
  sync: syncEn,
  changes: changesEn,
  saveVersion: saveVersionEn,
  settings: settingsEn,
  projectSettings: projectSettingsEn,
  publish: publishEn,
  branches: branchesEn,
  workbench: workbenchEn,
  conflicts: conflictsEn,
};

/* The English dictionary, composed from every namespace. Each language is
   its own chunk so only the active one is evaluated at launch (task 209);
   `Translations` is this object's type. */
export const en = {
  ...accountEn,
  ...appEn,
  ...sharedEn,
  ...cloneEn,
  ...consoleEn,
  ...initializeProjectEn,
  ...notificationsEn,
  ...historyEn,
  ...gitlabEn,
  ...gitlabTokenEn,
  ...gitlabToolingEn,
  ...githubEn,
  ...githubTokenEn,
  ...bitbucketEn,
  ...azureEn,
  ...hostingServersEn,
  ...repositoryBrowserEn,
  ...accountsEn,
  ...homeEn,
  ...overviewEn,
  ...statusEn,
  ...syncEn,
  ...changesEn,
  ...saveVersionEn,
  ...settingsEn,
  ...projectSettingsEn,
  ...publishEn,
  ...branchesEn,
  ...workbenchEn,
  ...conflictsEn,
};
