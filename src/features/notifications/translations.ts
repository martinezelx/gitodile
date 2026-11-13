export interface NotificationsTranslations {
  notificationsTitle: string;
  /** The bell's accessible name. It carries the count because that is the only
   * thing about the control that changes, and a screen reader user has no badge
   * to look at. */
  notificationsTrigger: (unread: number) => string;
  notificationsPanelAriaLabel: string;
  notificationsListAriaLabel: string;
  notificationsClear: string;
  notificationsMarkRead: string;
  notificationsMarkUnread: string;
  notificationsMarkAllRead: string;
  notificationsStorageWarning: string;
  notificationsActionUnavailable: string;
  notificationsEmptyTitle: string;
  notificationsEmptyLine: string;
  notificationsDisabledTitle: string;
  notificationsDisabledLine: string;
  notificationsDismiss: string;
  notificationsOpenSettings: string;
  notificationsUnreadLabel: string;
  notificationsJustNow: string;
  notificationTeamChangesTitle: (count: number) => string;
  notificationTeamChangesDescription: string;
  notificationTeamChangesAction: string;
  notificationRemoteCheckFailedTitle: string;
  notificationRemoteCheckFailedDescription: string;
  notificationChangesPublishedTitle: (count: number) => string;
  notificationChangesPublishedTo: (destination: string) => string;
  notificationAppUpdateTitle: (version: string) => string;
  notificationAppUpdateDescription: string;
  notificationAppUpdateReadyTitle: (version: string) => string;
  notificationAppUpdateReadyDescription: string;
  notificationAppUpdateAction: string;
  notificationUpstreamGoneTitle: (branch: string | null, remote: string | null) => string;
  notificationUpstreamGoneDescription: string;
  notificationUpstreamGoneAction: string;
}
