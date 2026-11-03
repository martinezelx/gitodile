/** What the notification centre records, and the rules that keep it honest.
 *
 * Everything here is pure and language-free. A notification stores its kind and
 * a typed payload, never a rendered sentence: the panel builds the wording from
 * the active dictionary, so changing the language in Settings re-renders the
 * list the user already has instead of freezing each entry in whatever language
 * was active the moment it arrived. */

/** The payload half, discriminated by kind. Adding a kind is a change to this
 * union, its entry in `NOTIFICATION_KINDS`, and the panel's renderer — the
 * compiler names all three. */
export type NotificationDetails =
  /** An automatic check found strictly newer upstream versions. `remoteCommit`
   * is what makes "the same news again" distinguishable from "more news": two
   * checks that agree carry the same commit, however many minutes apart. */
  | { kind: "teamChangesAvailable"; behind: number; remoteCommit: string | null }
  /** An automatic check could not reach the remote. The reason is already
   * mapped to a user-facing sentence by the caller's error mapper, like every
   * other error surface in the app. */
  | { kind: "remoteCheckFailed"; reason: string | null }
  /** An automatic check found the branch's remote branch deleted. The branch and
   * remote are what make a second check's same answer "the same news". */
  | { kind: "upstreamGone"; branch: string | null; remote: string | null }
  | { kind: "changesPublished"; versionCount: number; destination: string | null }
  /** The startup check found a newer version of the app itself. Always
   * app-wide (`projectId: null`); the version is what tells "the same
   * release again" from "a newer one since". Nothing has been downloaded. */
  /* `ready` once the download finished out of sight: the same entry, now
     naming the next step, so the inbox never says "available" about a
     release that only needs installing. Absent in records stored before. */
  | { kind: "appUpdateAvailable"; version: string; ready?: true };

export type NotificationKind = NotificationDetails["kind"];

/** The glyph's ink, the tone of the dialog the entry opens (DESIGN.md
 * § Glyph tones): `remote` for the remote and what was published to it,
 * `warning` for something to decide or fix, `app` for GitOdile itself. */
export type NotificationTone = "remote" | "warning" | "app";

export type AppNotification = {
  id: string;
  createdAt: number;
  read: boolean;
  /** The project the event happened to, or `null` for an app-wide one. The id
   * is kept so an action can name its target; the name is kept because the
   * project may have been closed by the time anyone reads the entry, and a
   * notification that cannot say which project it is about is noise. */
  projectId: string | null;
  projectName: string | null;
  details: NotificationDetails;
};

type NotificationKindSpec = {
  tone: NotificationTone;
  /**
   * Whether an arriving entry replaces the previous one for the same project
   * rather than stacking on top of it.
   *
   * The cadence is the reason. An automatic check every fifteen minutes against
   * an unchanged remote would otherwise write the same sentence ninety-six
   * times a day, and a list that says one thing ninety-six times has stopped
   * being a list. A publish does not collapse: two publishes are two events.
   */
  collapses: boolean;
  /**
   * Whether the entry arrives unread and lights the badge.
   *
   * This is the high-signal rule, and it is a property of the kind because it
   * is a property of the *event*: a background check is news, while a publish
   * the user just watched succeed is a receipt. Recording the receipt is still
   * worth it — it is how the panel can answer "did that go through?" an hour
   * later — but badging it would train people to dismiss a badge that is
   * usually about something they already know.
   */
  unreadOnArrival: boolean;
};

export const NOTIFICATION_KINDS: Record<NotificationKind, NotificationKindSpec> = {
  teamChangesAvailable: { tone: "remote", collapses: true, unreadOnArrival: true },
  remoteCheckFailed: { tone: "warning", collapses: true, unreadOnArrival: true },
  upstreamGone: { tone: "warning", collapses: true, unreadOnArrival: true },
  changesPublished: { tone: "remote", collapses: false, unreadOnArrival: false },
  appUpdateAvailable: { tone: "app", collapses: true, unreadOnArrival: true },
};

/** The local inbox retains the latest fifty events, including across restarts. */
export const NOTIFICATION_LIMIT = 50;

/** Whether payloads report the same known news. Used by the collapse rule to tell
 * "the same news again" from "different news", which is what decides whether a
 * replaced entry goes back to unread.
 *
 * A `switch` closed by a `never` guard rather than a chain of `if`s falling
 * through to `false`. The difference matters: a new kind added to the union
 * would have fallen through as "never equal", which silently means every
 * collapse re-lights the badge. Now it fails to compile until it is compared. */
export function notificationDetailsEqual(
  left: NotificationDetails,
  right: NotificationDetails,
): boolean {
  switch (left.kind) {
    case "teamChangesAvailable":
      return (
        right.kind === "teamChangesAvailable" &&
        left.behind === right.behind &&
        left.remoteCommit === right.remoteCommit
      );
    case "remoteCheckFailed":
      // Restored notices omit detailed error text. An unknown reason alone is
      // not evidence of new trouble; live, known reason changes still re-alert.
      return right.kind === "remoteCheckFailed"
        && (left.reason === null || right.reason === null || left.reason === right.reason);
    case "upstreamGone":
      return right.kind === "upstreamGone" && left.branch === right.branch && left.remote === right.remote;
    case "changesPublished":
      return (
        right.kind === "changesPublished" &&
        left.versionCount === right.versionCount &&
        left.destination === right.destination
      );
    case "appUpdateAvailable":
      return right.kind === "appUpdateAvailable" && left.version === right.version
        && (left.ready ?? false) === (right.ready ?? false);
    default: {
      const unhandled: never = left;
      return unhandled;
    }
  }
}

export type NotificationRequest = {
  details: NotificationDetails;
  projectId: string | null;
  projectName: string | null;
  /** Injected rather than read from `Date.now()` so the store stays pure and
   * the tests do not need a fake clock. */
  createdAt: number;
  id: string;
};

/**
 * The new list after recording one event, newest first.
 *
 * Repeating known news updates its metadata in place, keeping the card's ID,
 * arrival time and read state. A periodic check is not a new event and must
 * not reorder the inbox or remount a focused control. Materially changed news
 * replaces the previous entry at the top and asks for attention again.
 */
export function recordNotification(
  list: readonly AppNotification[],
  request: NotificationRequest,
): AppNotification[] {
  const spec = NOTIFICATION_KINDS[request.details.kind];
  const previous = spec.collapses
    ? (list.find(
        (entry) =>
          entry.details.kind === request.details.kind && entry.projectId === request.projectId,
      ) ?? null)
    : null;

  const sameNews = previous !== null && notificationDetailsEqual(previous.details, request.details);

  const entry: AppNotification = {
    id: sameNews ? previous.id : request.id,
    createdAt: sameNews ? previous.createdAt : request.createdAt,
    read: sameNews ? previous.read : !spec.unreadOnArrival,
    projectId: request.projectId,
    projectName: request.projectName,
    details: request.details,
  };

  if (sameNews) return list.map((candidate) => candidate === previous ? entry : candidate);
  const rest = previous ? list.filter((candidate) => candidate !== previous) : list;
  return [entry, ...rest].slice(0, NOTIFICATION_LIMIT);
}

export function unreadNotificationCount(list: readonly AppNotification[]): number {
  return list.reduce((count, entry) => (entry.read ? count : count + 1), 0);
}

/** Returns the same array when nothing was unread. The return type stays `readonly`
 * precisely because of that case: the array handed back may be the caller's own
 * input, and casting the promise away would invite someone to mutate it. */
export function markNotificationsRead(
  list: readonly AppNotification[],
): readonly AppNotification[] {
  if (list.every((entry) => entry.read)) return list;
  return list.map((entry) => (entry.read ? entry : { ...entry, read: true }));
}

/** What a notification can offer to do about itself. Named so the panel and
 * the composition root agree on it by type rather than by matching string
 * literals in two files. */
export type NotificationActionId = "reviewTeamChanges" | "reviewAppUpdate" | "openOverview";

export function setNotificationRead(
  list: readonly AppNotification[], id: string, read: boolean,
): readonly AppNotification[] {
  if (!list.some((entry) => entry.id === id && entry.read !== read)) return list;
  return list.map((entry) => entry.id === id ? { ...entry, read } : entry);
}

/** The kinds with somewhere to go. Kept as a function rather than a field on
 * the spec so the panel asks about the entry it is rendering, and a kind whose
 * action depends on its payload (team changes need a project) can say no. */
export function notificationAction(
  notification: AppNotification,
): NotificationActionId | null {
  switch (notification.details.kind) {
    case "teamChangesAvailable":
      return notification.projectId !== null ? "reviewTeamChanges" : null;
    case "appUpdateAvailable":
      return "reviewAppUpdate";
    case "upstreamGone":
      return notification.projectId !== null ? "openOverview" : null;
    default:
      return null;
  }
}
