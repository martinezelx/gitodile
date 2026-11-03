import type { NotificationsTranslations } from "./translations";

export const es: NotificationsTranslations = {
  notificationsTitle: "Notificaciones",
  notificationsTrigger: (unread) =>
    unread === 0
      ? "Notificaciones"
      : unread === 1
        ? "Notificaciones, 1 sin leer"
        : `Notificaciones, ${unread} sin leer`,
  notificationsPanelAriaLabel: "Notificaciones",
  notificationsListAriaLabel: "Notificaciones recientes",
  notificationsClear: "Borrar todo",
  notificationsMarkRead: "Marcar como leída",
  notificationsMarkUnread: "Marcar como no leída",
  notificationsMarkAllRead: "Marcar todas como leídas",
  notificationsStorageWarning: "Parte del historial no se pudo guardar o recuperar. Los avisos nuevos seguirán disponibles mientras la app esté abierta.",
  notificationsActionUnavailable: "No se pudo abrir este aviso. Puede que su proyecto esté cerrado o haya otra acción en curso.",
  notificationsEmptyTitle: "Todo al día",
  notificationsEmptyLine: "Aquí verás las notificaciones nuevas.",
  notificationsDisabledTitle: "Notificaciones desactivadas",
  notificationsDisabledLine: "Actívalas en Ajustes.",
  notificationsDismiss: "Eliminar notificación",
  notificationsOpenSettings: "Abrir ajustes de notificaciones",
  notificationsUnreadLabel: "Sin leer",
  notificationsJustNow: "ahora mismo",
  notificationTeamChangesTitle: (count) =>
    `Hay ${count} ${count === 1 ? "versión nueva" : "versiones nuevas"}`,
  notificationTeamChangesDescription: "Encontrada en una comprobación automática, sin que haya cambiado aún nada en tu ordenador.",
  notificationTeamChangesAction: "Revisar y traer",
  notificationRemoteCheckFailedTitle: "No se pudo comprobar si hay cambios",
  notificationRemoteCheckFailedDescription: "La última comprobación automática no pudo llegar al remoto.",
  notificationChangesPublishedTitle: (count) =>
    count === 0
      ? "Se publicó la rama"
      : count === 1 ? "Se publicó 1 versión guardada" : `Se publicaron ${count} versiones guardadas`,
  notificationChangesPublishedTo: (destination) => `Enviado a ${destination}.`,
  notificationAppUpdateTitle: (version) => `Actualización de la app: ${version}`,
  notificationAppUpdateDescription: "Abre Actualizaciones para ver su estado actual.",
  notificationAppUpdateReadyTitle: (version) => `La ${version} terminó de descargarse`,
  notificationAppUpdateReadyDescription: "Instálala desde Actualizaciones cuando te venga bien.",
  notificationAppUpdateAction: "Ver actualización",
  notificationUpstreamGoneTitle: (branch, remote) =>
    `${branch ? `«${branch}»` : "Esta rama"} ya no está en ${remote ? `«${remote}»` : "el remoto"}`,
  notificationUpstreamGoneDescription: "Se borró en el remoto. Tu trabajo en este ordenador no ha cambiado.",
  notificationUpstreamGoneAction: "Ver opciones",
};

