import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  markNotificationsRead, recordNotification, setNotificationRead, unreadNotificationCount,
  type AppNotification, type NotificationDetails,
} from "./domain";
import {
  loadNotificationHistory, NOTIFICATION_HISTORY_KEY, serializeNotificationHistory,
  type NotificationHistory,
} from "./persistence";

export type NotificationCenterStore = {
  notifications: readonly AppNotification[];
  unreadCount: number;
  hasStorageWarning: boolean;
  /** Recording off preserves the inbox and stops collecting new events. */
  notify: (event: {
    details: NotificationDetails;
    projectId?: string | null;
    projectName?: string | null;
  }) => void;
  setRead: (id: string, read: boolean) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

function acknowledgedUpdate(current: NotificationHistory, entries: readonly AppNotification[]): string | null {
  const update = entries.find((entry) => entry.details.kind === "appUpdateAvailable");
  return update?.details.kind === "appUpdateAvailable"
    ? update.details.version : current.acknowledgedUpdateVersion;
}

/** Local bounded inbox owned by the composition root. It only records existing
 * outcomes: no repository reads, network activity, timers or audio. */
export function useNotificationCenter(isEnabled: boolean): NotificationCenterStore {
  const [initial] = useState(loadNotificationHistory);
  const [history, setHistory] = useState(initial.history);
  const [hasStorageWarning, setHasStorageWarning] = useState(initial.failed);
  const [restoredIds] = useState(() => new Set(initial.history.notifications.map((entry) => entry.id)));
  const nextIdRef = useRef(0);
  const isEnabledRef = useRef(isEnabled);
  isEnabledRef.current = isEnabled;

  useEffect(() => {
    try {
      localStorage.setItem(NOTIFICATION_HISTORY_KEY, serializeNotificationHistory(history));
    } catch {
      // No recursive notice and no lost live state if storage is unavailable.
      setHasStorageWarning(true);
    }
  }, [history]);

  const notify = useCallback<NotificationCenterStore["notify"]>((event) => {
    if (!isEnabledRef.current) return;
    // IDs only name local cards. A counter skipping restored IDs also works in
    // older WebViews without requiring Web Crypto or a secure-context API.
    let id: string;
    do { id = `notification-${++nextIdRef.current}`; } while (restoredIds.has(id));
    const request = { id, createdAt: Date.now(),
      details: event.details, projectId: event.projectId ?? null, projectName: event.projectName ?? null };
    setHistory((current) => {
      /* Reading "available" acknowledges the find, not the download that
         followed: "ready" is new news about the same version. */
      if (event.details.kind === "appUpdateAvailable" && !event.details.ready
        && event.details.version === current.acknowledgedUpdateVersion) return current;
      return { ...current, notifications: recordNotification(current.notifications, request) };
    });
  }, [restoredIds]);

  const setRead = useCallback((id: string, read: boolean) => {
    setHistory((current) => {
      const entry = current.notifications.find((candidate) => candidate.id === id);
      if (!entry || entry.read === read) return current;
      return {
        notifications: setNotificationRead(current.notifications, id, read),
        acknowledgedUpdateVersion: entry.details.kind === "appUpdateAvailable"
          ? (read ? entry.details.version : null) : current.acknowledgedUpdateVersion,
      };
    });
  }, []);

  const markAllRead = useCallback(() => {
    setHistory((current) => ({ ...current,
      notifications: markNotificationsRead(current.notifications),
      acknowledgedUpdateVersion: acknowledgedUpdate(current, current.notifications),
    }));
  }, []);

  const dismiss = useCallback((id: string) => {
    setHistory((current) => ({
      notifications: current.notifications.filter((entry) => entry.id !== id),
      acknowledgedUpdateVersion: acknowledgedUpdate(current, current.notifications.filter((entry) => entry.id === id)),
    }));
  }, []);
  const clear = useCallback(() => {
    setHistory((current) => ({ notifications: [],
      acknowledgedUpdateVersion: acknowledgedUpdate(current, current.notifications) }));
  }, []);

  const { notifications } = history;
  const unreadCount = useMemo(() => unreadNotificationCount(notifications), [notifications]);
  return useMemo(
    () => ({ notifications, unreadCount, hasStorageWarning, notify, setRead, markAllRead, dismiss, clear }),
    [clear, dismiss, hasStorageWarning, markAllRead, notifications, notify, setRead, unreadCount],
  );
}
