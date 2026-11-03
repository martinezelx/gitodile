import type { NotificationsTranslations } from "./translations";

export const en: NotificationsTranslations = {
  notificationsTitle: "Notifications",
  notificationsTrigger: (unread) =>
    unread === 0
      ? "Notifications"
      : unread === 1
        ? "Notifications, 1 unread"
        : `Notifications, ${unread} unread`,
  notificationsPanelAriaLabel: "Notifications",
  notificationsListAriaLabel: "Recent notifications",
  notificationsClear: "Clear all",
  notificationsMarkRead: "Mark as read",
  notificationsMarkUnread: "Mark as unread",
  notificationsMarkAllRead: "Mark all as read",
  notificationsStorageWarning: "Some notification history could not be saved or restored. New notices remain available while the app is open.",
  notificationsActionUnavailable: "This notice could not be opened. Its project may be closed or another action may be in progress.",
  notificationsEmptyTitle: "All caught up",
  notificationsEmptyLine: "New notifications show up here.",
  notificationsDisabledTitle: "Notifications are off",
  notificationsDisabledLine: "Turn them on in Settings.",
  notificationsDismiss: "Delete notification",
  notificationsOpenSettings: "Open notification settings",
  notificationsUnreadLabel: "Unread",
  notificationsJustNow: "just now",
  notificationTeamChangesTitle: (count) =>
    `${count} newer ${count === 1 ? "version is" : "versions are"} available`,
  notificationTeamChangesDescription: "Found by an automatic check, and nothing on your computer has changed yet.",
  notificationTeamChangesAction: "Review and get",
  notificationRemoteCheckFailedTitle: "Couldn't check for project changes",
  notificationRemoteCheckFailedDescription: "The last automatic check couldn't reach the remote.",
  notificationChangesPublishedTitle: (count) =>
    count === 0
      ? "Published the branch"
      : count === 1 ? "Published 1 saved version" : `Published ${count} saved versions`,
  notificationChangesPublishedTo: (destination) => `Sent to ${destination}.`,
  notificationAppUpdateTitle: (version) => `App update: ${version}`,
  notificationAppUpdateDescription: "Open Updates to see its current status.",
  notificationAppUpdateReadyTitle: (version) => `${version} finished downloading`,
  notificationAppUpdateReadyDescription: "Install it from Updates when it suits you.",
  notificationAppUpdateAction: "View update",
  notificationUpstreamGoneTitle: (branch, remote) =>
    `${branch ? `“${branch}”` : "This branch"} is no longer on ${remote ? `“${remote}”` : "the remote"}`,
  notificationUpstreamGoneDescription: "It was deleted on the remote. Your work on this computer hasn't changed.",
  notificationUpstreamGoneAction: "See options",
};

