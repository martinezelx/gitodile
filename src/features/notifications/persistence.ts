import { NOTIFICATION_LIMIT, type AppNotification, type NotificationDetails } from "./domain";

export const NOTIFICATION_HISTORY_KEY = "gitodile-notification-history";
const MAX_STORED_LENGTH = 512_000;

export type NotificationHistory = {
  notifications: readonly AppNotification[];
  /** Independent of cards: removal/eviction cannot re-alert the offered release. */
  acknowledgedUpdateVersion: string | null;
};

export function emptyNotificationHistory(): NotificationHistory {
  return { notifications: [], acknowledgedUpdateVersion: null };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit;
}
function nullableText(value: unknown, limit: number): value is string | null {
  return value === null || text(value, limit);
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function version(value: unknown): value is string {
  return text(value, 64) && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
}

function details(value: unknown): NotificationDetails | null {
  if (!object(value)) return null;
  switch (value.kind) {
    case "teamChangesAvailable":
      return count(value.behind) && nullableText(value.remoteCommit, 128)
        ? { kind: value.kind, behind: value.behind, remoteCommit: value.remoteCommit } : null;
    case "remoteCheckFailed":
      // Mapped error text can still contain a server address or command detail.
      // It is useful in-session, but never belongs in durable notification data.
      return { kind: value.kind, reason: null };
    case "upstreamGone":
      return nullableText(value.branch, 1024) && nullableText(value.remote, 1024)
        ? { kind: value.kind, branch: value.branch, remote: value.remote } : null;
    case "changesPublished":
      return count(value.versionCount) && nullableText(value.destination, 2048)
        ? { kind: value.kind, versionCount: value.versionCount, destination: value.destination } : null;
    case "appUpdateAvailable":
      if (!version(value.version) || !(value.ready === undefined || value.ready === true)) return null;
      return value.ready ? { kind: value.kind, version: value.version, ready: true } : { kind: value.kind, version: value.version };
    default: return null;
  }
}

export function parseNotificationHistory(raw: string): NotificationHistory {
  if (raw.length > MAX_STORED_LENGTH) throw new Error("Notification history exceeds its limit");
  const value: unknown = JSON.parse(raw);
  if (!object(value) || value.version !== 1 || !Array.isArray(value.notifications)
    || value.notifications.length > NOTIFICATION_LIMIT
    || !(value.acknowledgedUpdateVersion === null || version(value.acknowledgedUpdateVersion))) {
    throw new Error("Unsupported notification history");
  }
  const notifications: AppNotification[] = [];
  const ids = new Set<string>();
  for (const item of value.notifications) {
    if (!object(item) || !text(item.id, 128) || ids.has(item.id)
      || !count(item.createdAt) || item.createdAt > 8_640_000_000_000_000
      || typeof item.read !== "boolean" || !nullableText(item.projectId, 4096)
      || !nullableText(item.projectName, 256)) throw new Error("Invalid notification record");
    const payload = details(item.details);
    if (payload === null || (payload.kind === "appUpdateAvailable" && item.projectId !== null)) {
      throw new Error("Invalid notification details");
    }
    ids.add(item.id);
    notifications.push({ id: item.id, createdAt: item.createdAt, read: item.read,
      projectId: item.projectId, projectName: item.projectName, details: payload });
  }
  return { notifications, acknowledgedUpdateVersion: value.acknowledgedUpdateVersion };
}

export function serializeNotificationHistory(history: NotificationHistory): string {
  // Rebuild an allowlisted shape; in particular, never write error reasons.
  const raw = JSON.stringify({ version: 1, acknowledgedUpdateVersion: history.acknowledgedUpdateVersion,
    notifications: history.notifications.map((entry) => ({
      id: entry.id, createdAt: entry.createdAt, read: entry.read,
      projectId: entry.projectId, projectName: entry.projectName,
      details: details(entry.details),
    })),
  });
  parseNotificationHistory(raw);
  return raw;
}

export function loadNotificationHistory(): { history: NotificationHistory; failed: boolean } {
  try {
    const raw = localStorage.getItem(NOTIFICATION_HISTORY_KEY);
    return { history: raw === null ? emptyNotificationHistory() : parseNotificationHistory(raw), failed: false };
  } catch {
    return { history: emptyNotificationHistory(), failed: true };
  }
}
