import type { SyncTranslations } from "./translations";
import type { ForecastBlocker } from "./domain";

/** What stops an update, in words: the Overview card and the dialog say it
 * the same way, and say what gets the person through. */
export function forecastBlockerCopy(
  blocker: ForecastBlocker,
  remote: string,
  t: SyncTranslations,
): { title: string; body: string; action: "save" | "reveal" | "conflicts" | null } {
  const path = blocker.path ?? "";
  switch (blocker.kind) {
    case "untrackedCollision":
      return { title: t.getTeamUntrackedTitle, body: t.getTeamUntrackedBody(path, remote), action: "reveal" };
    case "preparedOverlap":
      return { title: t.getTeamPreparedTitle, body: t.getTeamPreparedBody(path, remote), action: "save" };
    case "carryFailed":
      return { title: t.getTeamPreparedTitle, body: t.getTeamCarryFailedBody, action: "save" };
    case "gitTooOld":
      return { title: t.getTeamGitTooOldTitle, body: t.getTeamGitTooOldBody, action: null };
    case "operationInProgress":
    case "unresolvedConflicts":
      return { title: t.getTeamOperationTitle, body: t.getTeamOperationBody, action: "conflicts" };
  }
}
