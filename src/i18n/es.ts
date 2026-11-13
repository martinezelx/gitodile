import type { Translations } from "./index";
import { es as accountEs } from "../features/account/translations.es";
import { es as appEs } from "../app/translations.es";
import { es as sharedEs } from "../shared/i18n/translations.es";
import { es as cloneEs } from "../features/clone/translations.es";
import { es as consoleEs } from "../features/console/translations.es";
import { es as initializeProjectEs } from "../features/initialize-project/translations.es";
import { es as notificationsEs } from "../features/notifications/translations.es";
import { es as historyEs } from "../features/history/translations.es";
import { es as gitlabEs } from "../features/gitlab/translations.es";
import { es as gitlabTokenEs } from "../features/gitlab/tokenTranslations.es";
import { es as gitlabToolingEs } from "../features/gitlab/toolingTranslations.es";
import { es as githubEs } from "../features/github/translations.es";
import { es as githubTokenEs } from "../features/github/tokenTranslations.es";
import { es as bitbucketEs } from "../features/bitbucket/translations.es";
import { es as azureEs } from "../features/azure/translations.es";
import { es as hostingServersEs } from "../features/hosting-servers/translations.es";
import { es as repositoryBrowserEs } from "../features/repository-browser/translations.es";
import { es as accountsEs } from "../features/accounts/translations.es";
import { es as homeEs } from "../features/home/translations.es";
import { es as overviewEs } from "../features/overview/translations.es";
import { es as statusEs } from "../features/status/translations.es";
import { es as syncEs } from "../features/sync/translations.es";
import { es as changesEs } from "../features/changes/translations.es";
import { es as saveVersionEs } from "../features/save-version/translations.es";
import { es as settingsEs } from "../features/settings/translations.es";
import { es as projectSettingsEs } from "../features/project-settings/translations.es";
import { es as publishEs } from "../features/publish/translations.es";
import { es as branchesEs } from "../features/branches/translations.es";
import { es as workbenchEs } from "../features/workbench/translations.es";
import { es as conflictsEs } from "../features/conflicts/translations.es";

/** Each namespace on its own, for the key-parity checks. */
export const esNamespaces = {
  account: accountEs,
  app: appEs,
  shared: sharedEs,
  clone: cloneEs,
  console: consoleEs,
  initializeProject: initializeProjectEs,
  notifications: notificationsEs,
  history: historyEs,
  gitlab: gitlabEs,
  gitlabToken: gitlabTokenEs,
  gitlabTooling: gitlabToolingEs,
  github: githubEs,
  githubToken: githubTokenEs,
  bitbucket: bitbucketEs,
  azure: azureEs,
  hostingServers: hostingServersEs,
  repositoryBrowser: repositoryBrowserEs,
  accounts: accountsEs,
  home: homeEs,
  overview: overviewEs,
  status: statusEs,
  sync: syncEs,
  changes: changesEs,
  saveVersion: saveVersionEs,
  settings: settingsEs,
  projectSettings: projectSettingsEs,
  publish: publishEs,
  branches: branchesEs,
  workbench: workbenchEs,
  conflicts: conflictsEs,
};

/* The Spanish dictionary, loaded only when Spanish is the active language
   (task 209). */
export const es: Translations = {
  ...accountEs,
  ...appEs,
  ...sharedEs,
  ...cloneEs,
  ...consoleEs,
  ...initializeProjectEs,
  ...notificationsEs,
  ...historyEs,
  ...gitlabEs,
  ...gitlabTokenEs,
  ...gitlabToolingEs,
  ...githubEs,
  ...githubTokenEs,
  ...bitbucketEs,
  ...azureEs,
  ...hostingServersEs,
  ...repositoryBrowserEs,
  ...accountsEs,
  ...homeEs,
  ...overviewEs,
  ...statusEs,
  ...syncEs,
  ...changesEs,
  ...saveVersionEs,
  ...settingsEs,
  ...projectSettingsEs,
  ...publishEs,
  ...branchesEs,
  ...workbenchEs,
  ...conflictsEs,
};
