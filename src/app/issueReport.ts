import { CURRENT_APP_RELEASE } from "./appRelease";
import { useLanguage, type Language } from "../i18n";
import contract from "./issueReportContract.json";
import { formatDiagnostics, readWebviewVersion, useSystemInfo } from "./systemInfo";

/** User support has a stable public home independent of source visibility. */
export const FEEDBACK_REPOSITORY_URL = `https://github.com/${contract.repository}`;

const ENVIRONMENT_HEADING = "Environment\n-----------\n";
const ACTIVITY_HEADING = "\n\nSession activity\n----------------";

/** The versions alone, without the headings that only make sense in the full
 * plain-text report. */
function environmentPrefill(report: string): string {
  const start = report.startsWith(ENVIRONMENT_HEADING) ? ENVIRONMENT_HEADING.length : 0;
  const end = report.indexOf(ACTIVITY_HEADING, start);
  return report.slice(start, end === -1 ? undefined : end).trim();
}

/** The report without its session activity: what is shown, copied and saved
 * when the reader leaves the activity out. */
export function reportWithoutActivity(report: string): string {
  const end = report.indexOf(ACTIVITY_HEADING);
  return end === -1 ? report : report.slice(0, end);
}

export type IssueReportUrlOptions = {
  /** The reader's own title; the form's prefix is kept in front of it. */
  title?: string;
  /** Ends the prefilled field when the report on the clipboard carries
   * activity. The field renders as text, so this is a visible line rather than
   * a hidden comment, and one left unpasted tells the maintainer as much. */
  pasteReminder?: string;
};

/** Share the reviewed environment and the publication check's form IDs.
 * Unknown query parameters are silently ignored by GitHub, so filenames and
 * IDs in issueReportContract.json must remain compatible with shipped builds.
 *
 * Only the versions travel in the address. A session's activity is thousands of
 * characters — past what GitHub accepts before it answers 414 rather than a
 * form — and it belongs to the report the user pastes or attaches, which is the
 * route that carries it whole and the one they have already been shown. */
export function buildIssueReportUrl(report: string, language: Language = "en", options: IssueReportUrlOptions = {}): string {
  const environment = environmentPrefill(report);
  const params = new URLSearchParams({
    template: contract.bugTemplates[language],
    [contract.diagnosticsField]: options.pasteReminder ? `${environment}\n\n${options.pasteReminder}` : environment,
  });
  const title = options.title?.trim();
  if (title) params.set("title", `${contract.bugTitlePrefix}${title}`);
  return `${FEEDBACK_REPOSITORY_URL}/issues/new?${params.toString()}`;
}

/** No repository reads or network requests: reuse the cached Git diagnostics
 * and the system information that remains constant for this window. Rust adds
 * the bounded session activity when the review dialog is requested. */
export function useIssueReportEnvironment(gitVersion: string | null): { environment: string; language: Language } {
  const { language } = useLanguage();
  const system = useSystemInfo();
  return {
    environment: formatDiagnostics({
      appVersion: CURRENT_APP_RELEASE.version,
      system,
      webview: readWebviewVersion(navigator.userAgent),
      gitVersion,
    }),
    language,
  };
}
