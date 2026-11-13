import type { StatusTranslations } from "./translations";

export const es: StatusTranslations = {
  statusCleanTitle: "Todo está guardado",
  statusChangesTitle: "Tienes cambios sin guardar",
  statusChangesMessage: (total) =>
    total === 1
      ? "1 archivo ha cambiado desde tu última versión guardada."
      : `${total} archivos han cambiado desde tu última versión guardada.`,
  statusConflictsTitle: "Algunos archivos necesitan tu atención",
  statusConflictsMessage: (conflicted) =>
    conflicted === 1
      ? "1 archivo tiene cambios que se solapan que debes resolver antes de guardar."
      : `${conflicted} archivos tienen cambios que se solapan que debes resolver antes de guardar.`,
  statusCheckingTitle: "Buscando cambios…",
  statusCheckingMessage: "Revisando los archivos de tu proyecto.",
  statusCheckFailedTitle: "No se pudo comprobar si hay cambios",
  statusCouldntCheck: "No se pudo comprobar qué ha cambiado en este proyecto.",
  statusRefresh: "Buscar cambios",
  statusRefreshing: "Buscando…",
  statusBreakdownLabel: "Qué ha cambiado",
  statusCategoryChanged: (count) => (count === 1 ? "1 editado" : `${count} editados`),
  statusCategoryNew: (count) => (count === 1 ? "1 nuevo" : `${count} nuevos`),
  statusCategoryDeleted: (count) => (count === 1 ? "1 eliminado" : `${count} eliminados`),
  statusCategoryRenamed: (count) => (count === 1 ? "1 renombrado" : `${count} renombrados`),
  statusCategoryConflicted: (count) =>
    count === 1 ? "1 necesita atención" : `${count} necesitan atención`,
  statusTruncatedNote: (shown) => `Se muestran los primeros ${shown} archivos, pero los totales incluyen todos los cambios.`,
  statusRefreshFailedNote: "La última comprobación falló, así que este es el último resultado conocido.",
};

