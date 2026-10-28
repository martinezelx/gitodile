import type { SyncTranslations } from "./translations";

export const es: SyncTranslations = {
  syncTitle: "Cambios del proyecto",
  syncNotCheckedTitle: "Aún sin comprobar",
  syncNotCheckedMessage: "Comprueba el proyecto remoto para ver los últimos cambios.",
  syncCheckingTitle: "Comprobando cambios del proyecto…",
  syncCheckingMessage: "Solo se lee información del remoto y tus archivos no cambian.",
  syncUpToDateTitle: "Todo al día",
  syncUpToDateMessage: "No hay nada que publicar ni traer.",
  syncAheadTitle: (count) => `${count} ${count === 1 ? "versión guardada lista" : "versiones guardadas listas"} para publicar`,
  syncBehindTitle: (count) => `Hay ${count} ${count === 1 ? "versión nueva" : "versiones nuevas"}`,
  syncBehindMessage: "Revisa qué cambiará antes de traerlas.",
  syncDivergedTitle: "Ambos lados han cambiado",
  syncDivergedMessage: "Tu rama y el remoto tienen trabajo distinto y no se combina nada automáticamente.",
  syncNoRemoteTitle: "Aún sin remoto",
  syncNoRemoteMessage: "Añade un remoto para comprobar cambios del proyecto.",
  syncNoUpstreamTitle: "Elige antes un destino de publicación",
  syncNoUpstreamMessage: "Publica esta rama para conectarla con el remoto.",
  syncDetachedTitle: "Cambia a una rama para comprobar",
  syncDetachedMessage: "Una versión guardada concreta no tiene nada con qué compararse en el remoto.",
  syncUnbornTitle: "Guarda una versión antes de comprobar",
  syncUnbornMessage: "Aún no hay ninguna versión guardada que comparar.",
  syncUnknownTitle: "Comparación no disponible",
  syncUnknownMessage: "No se pudo comparar con la rama remota.",
  syncUnavailableTitle: "No se pudieron comprobar los cambios del proyecto",
  syncLastChecked: (value) => `Comprobado ${value}.`,
  syncCheck: "Comprobar cambios del proyecto",
  syncChecking: "Comprobando…",
  syncCheckAgain: "Comprobar de nuevo",
  syncPublish: "Publicar cambios",
  syncReviewAndGet: "Revisar y traer",
  syncComingSoon: "Próximamente",
  syncCurrentBranch: "Rama actual",
  syncTeamBranch: "Rama remota",
  syncRelationshipLabel: (local, team) => `Rama actual ${local}; rama remota ${team}.`,
  syncTechnicalDetails: "Detalles técnicos",
  syncRemote: "Remoto",
  syncDestination: "Rama de destino",
  syncTrackingRef: "Referencia de seguimiento",
  syncLocalCommit: "Commit local",
  syncRemoteCommit: "Commit remoto",
  syncAheadCount: "Guardadas en local",
  syncBehindCount: "Nuevas en el remoto",
  syncNotAvailable: "No disponible",
  getTeamDialogTitle: "Traer cambios del proyecto",
  getTeamTitleFastForward: (count, remote) =>
    `Traer ${count === 1 ? "1 versión" : `${count} versiones`} de ${remote}`,
  getTeamTitleMerge: (count) =>
    `Traer y combinar ${count === 1 ? "1 versión" : `${count} versiones`}`,
  getTeamTitlePublish: (localCount, remote) =>
    `Publicar ${localCount === 1 ? "1 versión" : `${localCount} versiones`} en ${remote}`,
  getTeamFrom: (authors, authorCount) => {
    if (authors.length === 0) return "";
    const more = authorCount - authors.length;
    if (more > 0) return `De ${authors.join(", ")} y ${more} más`;
    if (authors.length === 1) return `De ${authors[0]}`;
    return `De ${authors.slice(0, -1).join(", ")} y ${authors[authors.length - 1]}`;
  },
  getTeamFileCount: (count) => `${count} ${count === 1 ? "archivo" : "archivos"}`,
  getTeamBeforePublish: (count, from) =>
    `Antes ${count === 1 ? "llega 1 versión" : `llegan ${count} versiones`}${from ? ` ${from.charAt(0).toLowerCase()}${from.slice(1)}` : ""}.`,
  getTeamNothingOverlaps: "No choca con nada tuyo.",
  getTeamCarried: (count) =>
    count === 1 ? "Tu archivo sin guardar se queda como está." : `Tus ${count} archivos sin guardar se quedan como están.`,
  getTeamCombined: (files, count) => {
    const named = count === 1 ? files[0] : `${count} archivos`;
    return `Tus cambios sin guardar en ${named} siguen sin guardar, encima de los que llegan.`;
  },
  getTeamMergeFact: (localCount) =>
    `Una versión de unión junta las dos ramas. ${localCount === 1 ? "Tu versión aún no está publicada" : `Tus ${localCount} versiones aún no están publicadas`}, así que nadie más se ve afectado.`,
  getTeamPublishFact: (localCount, remote) =>
    `Después ${localCount === 1 ? "tu versión" : `tus ${localCount} versiones`} y la versión de unión se publican en ${remote}.`,
  getTeamRecoveryFirst: "Antes se guarda un punto de recuperación.",
  getTeamWhatComesIn: "Qué llega",
  getTeamVersionMeta: (author, when, files) =>
    [author, when, files > 0 ? `${files} ${files === 1 ? "archivo" : "archivos"}` : ""].filter(Boolean).join(" · "),
  getTeamVersionsTruncated: (shown, total) => `Se muestran ${shown} de ${total} versiones entrantes.`,
  getTeamCheckingRemote: (remote) => `Comprobando si hay algo más nuevo en ${remote}…`,
  getTeamRemoteMoved: "Algo ha cambiado mientras mirabas. Este es el resumen actualizado.",
  getTeamConfirmFastForward: "Traer",
  getTeamConfirmMerge: "Traer y combinar",
  getTeamConfirmPublish: "Traer y publicar",
  getTeamAlsoPublish: "Traer, combinar y publicar",
  getTeamProgressLabel: "Trayendo cambios del proyecto",
  getTeamPhase: {
    checkingLocalSafety: "Comprobando tus archivos…",
    combiningVersions: "Creando la versión de unión…",
    creatingRecovery: "Guardando un punto de recuperación…",
    updatingFilesAndHistory: "Actualizando tus archivos…",
    verifying: "Comprobando el resultado…",
    publishing: "Publicando…",
  },
  getTeamWorking: "Trayendo…",
  getTeamOverlapTitle: (remote) => `Tus cambios y los de ${remote} se pisan`,
  getTeamOverlapBody: "Tocáis las mismas líneas en estos archivos. Todavía no se pueden combinar desde GitOdile, así que no se trae nada.",
  getTeamOverlapSide: { saved: "tu versión guardada", unsaved: "tus cambios sin guardar" },
  getTeamOverlapMore: (count) => `Y ${count} más.`,
  getTeamSafeNothingChanged: "Tu trabajo está a salvo y no se ha tocado nada.",
  getTeamUntrackedTitle: "Un archivo tuyo se sobrescribiría",
  getTeamUntrackedBody: (path, remote) =>
    `${remote} añade ${path} y tú tienes ahí un archivo nuevo sin guardar. Muévelo o guárdalo y luego trae los cambios.`,
  getTeamPreparedTitle: "Guarda tus cambios primero",
  getTeamPreparedBody: (path, remote) =>
    `${path} está preparado para guardar y también cambia en ${remote}. Guárdalo y luego trae los cambios.`,
  getTeamCarryFailedBody: "Git no puede llevar tus cambios sin guardar a través de esta actualización. Guárdalos y luego trae los cambios.",
  getTeamGitTooOldTitle: "Actualiza Git para combinar versiones",
  getTeamGitTooOldBody: "Esta versión de Git no puede calcular una combinación de forma segura. Actualiza Git en Ajustes y vuelve a intentarlo.",
  getTeamOperationTitle: "Termina la operación de Git en curso",
  getTeamOperationBody: "Hay otra operación de Git en curso en este proyecto. Termínala o cancélala y luego trae los cambios.",
  getTeamShowInFolder: "Mostrar en carpeta",
  getTeamReviewConflicts: "Revisar los cambios que se solapan",
  getTeamSaveVersion: "Guardar versión",
  getTeamBlockedTitle: "La actualización se detuvo de forma segura",
  getTeamUpToDateToast: "Todo al día. No hay versiones nuevas que traer.",
  getTeamUncheckedBody: "El remoto no ha respondido. Comprueba la conexión e inténtalo de nuevo.",
  getTeamUncheckedLocal: "Por lo que sabe este ordenador, no hay versiones nuevas que traer.",
  getTeamSuccessToast: (count) => `Proyecto al día. ${count === 1 ? "Ha llegado 1 versión." : `Han llegado ${count} versiones.`}`,
  getTeamMergedToast: (count) =>
    `Combinado. ${count === 1 ? "Ha llegado 1 versión" : `Han llegado ${count} versiones`} y una versión de unión ${count === 1 ? "la junta" : "las junta"} con las tuyas.`,
  getTeamPublishedToast: (received, published, remote) =>
    `Al día y publicado: han llegado ${received} y han salido ${published} hacia ${remote}.`,
  getTeamPublishFailed: "Tu proyecto está al día, pero no se pudo publicar.",
  getTeamRetryPublish: "Volver a publicar",
  getTeamReviewUpdatedPlan: "Revisar de nuevo",
  getTeamTryAgain: "Reintentar",
  getTeamUncertainTitle: "Resultado sin confirmar",
  getTeamUncertainInstructions: "Revisa tus archivos antes de seguir. Tu versión anterior está a salvo.",
  getTeamObservedHead: "HEAD actual",
  getTeamRecoveryReference: "Punto de recuperación",
  getTeamUnsavedCopy: "Copia de tus cambios sin guardar",
  getTeamMergeMessage: "Mensaje de la unión",
  getTeamIntegration: "Actualización",
  getTeamIntegrationKind: { fastForward: "Avance rápido", merge: "Unión" },
};

