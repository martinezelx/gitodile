import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, CheckCheck, Mail, Settings, Trash2 } from "lucide-react";
import { useLanguage, type Translations } from "../../i18n";
import { formatDate, type LocaleFormats } from "../../shared/i18n";
import {
  autoHideScrollbarProps,
  isReducedMotionRequested,
  ToggleSwitch,
  usePortalFlyout,
} from "../../shared/ui";
import {
  NOTIFICATION_KINDS,
  notificationAction,
  type AppNotification,
  type NotificationDetails,
} from "./domain";
import { NOTIFICATION_ICONS } from "./icons";

/** The panel's own relative clock. The status bar has one too, but it belongs
 * to the app shell and a feature may not reach into it; this one is four lines
 * and needs no shared primitive to justify itself. */
function relativeTime(createdAt: number, now: number, language: string, justNow: string): string {
  const elapsed = Math.max(0, now - createdAt);
  if (elapsed < 45_000) return justNow;
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "always", style: "short" });
  if (elapsed < 60 * 60_000) return formatter.format(-Math.round(elapsed / 60_000), "minute");
  if (elapsed < 24 * 60 * 60_000) return formatter.format(-Math.round(elapsed / (60 * 60_000)), "hour");
  return formatter.format(-Math.round(elapsed / (24 * 60 * 60_000)), "day");
}

/** One place where a kind becomes words, so a new kind fails to compile until
 * it has been given some. */
function describe(details: NotificationDetails, t: Translations): {
  title: string;
  description: string | null;
} {
  switch (details.kind) {
    case "teamChangesAvailable":
      return {
        title: t.notificationTeamChangesTitle(details.behind),
        description: t.notificationTeamChangesDescription,
      };
    case "remoteCheckFailed":
      return {
        title: t.notificationRemoteCheckFailedTitle,
        // The mapped reason when there is one, because it is the only part that
        // says anything specific; the generic sentence is the fallback, not a
        // preamble to repeat above it.
        // `||`, not `??`: an error mapper that produced an empty string would
        // otherwise leave the entry with a bare title and no explanation at
        // all, which is worse than the generic sentence.
        description: details.reason?.trim() || t.notificationRemoteCheckFailedDescription,
      };
    case "upstreamGone":
      return {
        title: t.notificationUpstreamGoneTitle(details.branch, details.remote),
        description: t.notificationUpstreamGoneDescription,
      };
    case "changesPublished":
      return {
        title: t.notificationChangesPublishedTitle(details.versionCount),
        description: details.destination === null
          ? null
          : t.notificationChangesPublishedTo(details.destination),
      };
    case "appUpdateAvailable":
      return details.ready
        ? { title: t.notificationAppUpdateReadyTitle(details.version), description: t.notificationAppUpdateReadyDescription }
        : { title: t.notificationAppUpdateTitle(details.version), description: t.notificationAppUpdateDescription };
  }
}

function NotificationRow({
  notification,
  now,
  formats,
  t,
  onAction,
  onDismiss,
  onSetRead,
}: {
  notification: AppNotification;
  now: number;
  formats: LocaleFormats;
  t: Translations;
  onAction: (notification: AppNotification) => void;
  onDismiss: (notification: AppNotification) => void;
  onSetRead: (notification: AppNotification, read: boolean) => void;
}): React.JSX.Element {
  const { title, description } = describe(notification.details, t);
  const tone = NOTIFICATION_KINDS[notification.details.kind].tone;
  const Icon = NOTIFICATION_ICONS[notification.details.kind];
  const action = notificationAction(notification);
  const wasUnread = !notification.read;
  const readLabel = notification.read ? t.notificationsMarkUnread : t.notificationsMarkRead;

  return (
    <li className={`notification${wasUnread ? " notification--unread" : ""}`}>
      {wasUnread && <span className="notification__dot" aria-hidden="true" />}
      <span className={`notification__icon notification__icon--${tone}`}>
        <Icon aria-hidden="true" />
      </span>
      <div className="notification__body">
        <p className="notification__title">
          {title}
          {wasUnread && <span className="visually-hidden"> — {t.notificationsUnreadLabel}</span>}
        </p>
        {description && <p className="notification__description">{description}</p>}
        <p className="notification__meta">
          {notification.projectName && (
            <span className="notification__project">{notification.projectName}</span>
          )}
          <span title={formatDate(new Date(notification.createdAt), formats, "date-time")}>
            {relativeTime(notification.createdAt, now, formats.language, t.notificationsJustNow)}
          </span>
        </p>
        <div className="notification__actions">
          {action && (
            <button
              className="secondary-button secondary-button--sm notification__action"
              type="button"
              onClick={() => onAction(notification)}
            >
              {action === "reviewTeamChanges"
                ? t.notificationTeamChangesAction
                : action === "openOverview"
                  ? t.notificationUpstreamGoneAction
                  : t.notificationAppUpdateAction}
            </button>
          )}
          <button
            className="notification__read"
            type="button"
            aria-label={readLabel}
            data-tooltip={readLabel}
            onClick={() => onSetRead(notification, !notification.read)}
          >
            {notification.read ? <Mail aria-hidden="true" /> : <Check aria-hidden="true" />}
          </button>
          {/* Uncovered only while the row is pointed at or focused, and destructive
              only in effect: one entry leaving the local inbox. It never closes the
              panel — the reader is usually clearing several. */}
          <button
            className="notification__dismiss"
            type="button"
            aria-label={t.notificationsDismiss}
            data-tooltip={t.notificationsDismiss}
            onClick={(event) => {
              const row = event.currentTarget.closest("li");
              const next = row?.nextElementSibling?.querySelector<HTMLButtonElement>("button")
                ?? row?.previousElementSibling?.querySelector<HTMLButtonElement>("button");
              if (next) next.focus();
              else event.currentTarget.closest<HTMLElement>('[role="dialog"]')?.focus();
              onDismiss(notification);
            }}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}

export type NotificationCenterProps = {
  notifications: readonly AppNotification[];
  unreadCount: number;
  /** The preference, not a derived state: the panel says out loud that it has
   * been turned off, and offers the switch that turns it back on. */
  isEnabled: boolean;
  hasStorageWarning?: boolean;
  onMarkAllRead: () => void;
  onSetRead: (notification: AppNotification, read: boolean) => void;
  onClear: () => void;
  onDismiss: (notification: AppNotification) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onReviewTeamChanges: (notification: AppNotification) => boolean;
  onReviewAppUpdate: () => boolean;
  /** Opens Overview on the notification's project. */
  onOpenProjectOverview: (notification: AppNotification) => boolean;
  onOpenSettings: () => void;
};

/**
 * The titlebar bell and its panel.
 *
 * It sits beside the window controls rather than in the status bar because the
 * status bar answers "what is true now" and this answers "what happened while
 * you were elsewhere" — an inbox, which desktop apps keep in the window
 * furniture.
 *
 * The trigger carries no number. A count painted over a 16px glyph was cramped
 * and turned a friendly signal into an error-red chip; a plain accent dot says
 * "there is something new" and the exact count is in the panel and in the
 * button's accessible name.
 *
 * The panel is portalled and positioned by `usePortalFlyout` for the same
 * reason the project switcher is: the titlebar is a fixed 44px strip, and an
 * absolutely positioned panel inside it would be clipped by the app window's
 * own overflow.
 */
export function NotificationCenter({
  notifications,
  unreadCount,
  isEnabled,
  hasStorageWarning = false,
  onMarkAllRead,
  onSetRead,
  onClear,
  onDismiss,
  onToggleEnabled,
  onReviewTeamChanges,
  onReviewAppUpdate,
  onOpenProjectOverview,
  onOpenSettings,
}: NotificationCenterProps): React.JSX.Element {
  const { t, formats } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [actionUnavailable, setActionUnavailable] = useState(false);
  // Sampled once per opening rather than on a timer: the panel is short-lived,
  // and a ticking clock behind a closed popup is background work for nothing.
  const [openedAt, setOpenedAt] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /* The dot moves for exactly one reason: something arrived while nobody was
   * looking, which is the only thing this centre exists to report. A press
   * deliberately gets nothing, for the same reason the bell borrows
   * `.titlebar-icon-button` — it is one of the row, not a special case.
   *
   * Breathe on a rise, then settle: three breathes and still, rather than a
   * permanent pulse in the window furniture. On a rise only — a publish is
   * recorded already read, and announcing something the user just watched
   * succeed is how a mark teaches people to ignore it.
   *
   * Reduced motion means not starting the gesture at all, the same answer
   * `themeTransition.ts` gives. Decided here rather than in CSS because the
   * class is cleared by `animationend`, and an animation suppressed to `none`
   * never ends — the class would stick to the element for the rest of the
   * session and no later arrival could restart it. */
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const previousUnreadCount = useRef(unreadCount);
  useEffect(() => {
    const rose = unreadCount > previousUnreadCount.current;
    previousUnreadCount.current = unreadCount;
    if (rose && !isReducedMotionRequested()) setIsAnnouncing(true);
  }, [unreadCount]);

  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  // Focus the panel rather than a control: opening an inbox should not make
  // Enter invoke an action. From the panel, Tab reaches the rows in order.
  const { popupRef, style } = usePortalFlyout(isOpen, triggerRef, close, "below", "container");

  const open = (): void => {
    setActionUnavailable(false);
    setOpenedAt(Date.now());
    setIsOpen(true);
  };

  const footer = (
    <div className="notification-center__footer">
      <button
        className="notification-center__footer-action"
        type="button"
        aria-label={t.notificationsOpenSettings}
        data-tooltip={t.notificationsOpenSettings}
        onClick={() => {
          close(false);
          onOpenSettings();
        }}
      >
        <Settings aria-hidden="true" />
      </button>
      <button
        className="notification-center__footer-action"
        type="button"
        aria-label={t.notificationsMarkAllRead}
        data-tooltip={t.notificationsMarkAllRead}
        disabled={unreadCount === 0}
        onClick={() => {
          onMarkAllRead();
          popupRef.current?.focus();
        }}
      >
        <CheckCheck aria-hidden="true" />
      </button>
      <button
        className="notification-center__footer-action notification-center__footer-action--danger"
        type="button"
        disabled={notifications.length === 0}
        aria-label={t.notificationsClear}
        data-tooltip={t.notificationsClear}
        onClick={() => {
          onClear();
          // Clearing disables the button the pointer or the keyboard was just
          // on. Without this the focus falls to `<body>` and Tab restarts from
          // the top of the document instead of continuing inside the panel that
          // is still open.
          popupRef.current?.focus();
        }}
      >
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="notification-center">
      <button
        ref={triggerRef}
        className="titlebar-icon-button notification-center__trigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={t.notificationsTrigger(unreadCount)}
        data-tooltip={t.notificationsTitle}
        onClick={() => (isOpen ? close(true) : open())}
      >
        <Bell aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className={`notification-center__dot${
              isAnnouncing ? " notification-center__dot--arrive" : ""
            }`}
            aria-hidden="true"
            // The class goes exactly when the animation does, so a later arrival
            // starts from a clean element instead of a name that never left.
            // `animationend` fires once, after the last of the three breathes.
            onAnimationEnd={() => setIsAnnouncing(false)}
          />
        )}
      </button>
      {isOpen && createPortal(
        <div
          ref={popupRef}
          className="app-menu notification-center__panel"
          role="dialog"
          tabIndex={-1}
          aria-label={t.notificationsPanelAriaLabel}
          style={style}
        >
          {notifications.length > 0 && (
            <ul
              {...autoHideScrollbarProps<HTMLUListElement>()}
              className="notification-center__list auto-hide-scrollbar"
              aria-label={t.notificationsListAriaLabel}
            >
              {notifications.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  now={openedAt}
                  formats={formats}
                  t={t}
                  onAction={(entry) => {
                    const action = notificationAction(entry);
                    const opened = action === "reviewAppUpdate" ? onReviewAppUpdate()
                      : action === "openOverview" ? onOpenProjectOverview(entry)
                      : onReviewTeamChanges(entry);
                    if (opened) {
                      onSetRead(entry, true);
                      close(false);
                    } else setActionUnavailable(true);
                  }}
                  onDismiss={onDismiss}
                  onSetRead={onSetRead}
                />
              ))}
            </ul>
          )}

          {/* A list that has stopped growing still has to say why, and a list
              that is empty has to say something other than nothing. Either way
              the same switch is the way back, and it is the control Settings
              uses, bound to the same preference. */}
          {!isEnabled && notifications.length > 0 && (
            <div className="notification-center__disabled-row">
              <div className="notification-center__disabled-copy">
                <p className="notification-center__disabled-title">{t.notificationsDisabledTitle}</p>
                <p className="notification-center__disabled-line">{t.notificationsDisabledLine}</p>
              </div>
              <ToggleSwitch
                label={t.notificationsEnableLabel}
                checked={isEnabled}
                onChange={onToggleEnabled}
              />
            </div>
          )}

          {notifications.length === 0 && (
            <div className="empty-state empty-state--compact notification-center__empty">
              <span className="empty-state__icon">
                <Bell aria-hidden="true" />
              </span>
              {/* Keyed so the words fade in rather than snapping when the
                  switch flips; the block's height is held by the switch wrapper
                  below, so only the copy changes. */}
              <div className="notification-center__empty-copy" key={isEnabled ? "on" : "off"}>
                <p className="notification-center__empty-title">
                  {isEnabled ? t.notificationsEmptyTitle : t.notificationsDisabledTitle}
                </p>
                <p className="notification-center__empty-line">
                  {isEnabled ? t.notificationsEmptyLine : t.notificationsDisabledLine}
                </p>
              </div>
              {/* Hidden once notifications are on, but kept mounted: a control
                  that vanishes under the pointer makes the block jump, and the
                  style guard will not let a layout change be eased. So the
                  wrapper holds the switch's height in both states and only
                  fades it out, and `inert` takes the hidden control out of the
                  tab order and the accessibility tree. */}
              <div
                className={`notification-center__empty-switch${
                  isEnabled ? " notification-center__empty-switch--hidden" : ""
                }`}
                inert={isEnabled}
              >
                <ToggleSwitch
                  label={t.notificationsEnableLabel}
                  checked={isEnabled}
                  onChange={onToggleEnabled}
                />
              </div>
            </div>
          )}

          {actionUnavailable && <p className="notification-center__notice" role="status">{t.notificationsActionUnavailable}</p>}
          {hasStorageWarning && <p className="notification-center__notice" role="status">{t.notificationsStorageWarning}</p>}
          {footer}
        </div>,
        document.body,
      )}
    </div>
  );
}
