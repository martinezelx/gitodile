import type { BranchesTranslations } from "./translations";

export const es: BranchesTranslations = {
  branchesTitle: "Ramas",
  branchesSearchPlaceholder: "Buscar ramas…",
  branchesSearchAriaLabel: "Buscar ramas",
  branchesLoading: "Cargando ramas…",
  branchesErrorLoading: "No se pudieron cargar las ramas de este proyecto.",
  branchesRetry: "Reintentar",
  branchesActiveLabel: "Activa",
  branchesEmptyOthers: "Aún no hay otras ramas.",
  branchesNoSearchMatches: "Ninguna rama coincide con la búsqueda.",
  branchesTruncatedNote: (visible, total) => `Se muestran las ${visible} más recientes de ${total}.`,
  branchesUnreadableNote: (count) =>
    count === 1
      ? "1 rama está oculta porque su nombre no se puede leer. Renómbrala con Git."
      : `${count} ramas están ocultas porque sus nombres no se pueden leer. Renómbralas con Git.`,
  branchesQuickSwitchChangeLabel: (current) => `Cambiar de rama (${current})`,
  branchesQuickSwitchTitle: "Cambiar de rama",
  branchesQuickSwitchSearchPlaceholder: "Buscar ramas…",
  branchesQuickSwitchSearchEmpty: "Ninguna rama coincide con la búsqueda.",
  branchesQuickSwitchFavourite: (name) => `Añadir ${name} a favoritos`,
  branchesQuickSwitchUnfavourite: (name) => `Quitar ${name} de favoritos`,
  branchesQuickSwitchFavouriteHint: "Añadir a favoritos",
  branchesQuickSwitchUnfavouriteHint: "Quitar de favoritos",
  branchesQuickSwitchFavouritesOnly: "Ver solo favoritos",
  branchesQuickSwitchFavouritesOnlyOff: "Ver todas las ramas",
  branchesQuickSwitchFavouritesEmpty: "Aún no hay favoritos. Marca una rama con la estrella para tenerla aquí.",
  branchesQuickSwitchEmpty: "Aún no hay otras ramas.",
  branchesQuickSwitchSeeAll: "Gestionar ramas",
  branchesQuickSwitchNew: "Nueva rama",
  branchesQuickSwitchCreateNamed: (name) => `Crear «${name}»`,
  branchesQuickSwitchCreateHint: "Rama nueva: después eliges desde dónde empieza",
  branchesQuickSwitchActions: (name) => `Qué se puede hacer con «${name}»`,
  branchesQuickSwitchBack: "Volver",
  branchesMergeInto: (name) => `Fusionar con «${name}»`,
  branchesRebaseOnto: (name) => `Rebasar «${name}» sobre esta`,
  branchesCompareWith: (name) => `Comparar con «${name}»`,
  branchesSoon: "Pronto",
  branchesActionsSoon: "Fusionar, rebasar y comparar llegarán pronto.",
  branchesDetachedTitle: "No estás en una rama",
  branchesDetachedDescription: "Estás en una versión guardada concreta, así que crea aquí una rama para que este trabajo sea fácil de encontrar.",
  branchesDetachedRecoverButton: "Crear una rama aquí",
  branchesUnbornTitle: "Guarda una versión primero",
  branchesUnbornDescription: "Esta rama aún no tiene versiones guardadas, así que no hay desde dónde partir.",
  branchesNoUpstreamLabel: "Solo local",
  branchesCheckedOutElsewhere: (path) => `Abierta en otro espacio de trabajo (${path}). Cambia a ella desde ahí.`,
  branchesUniqueCommits: (count, main) =>
    count === 1 ? `1 versión que no está en ${main}` : `${count} versiones que no están en ${main}`,
  branchesSavedLabel: (date) => `Guardada el ${date}`,
  createBranchTitle: "Nueva rama",
  createBranchNameLabel: "Nombre",
  createBranchNamePlaceholder: "p. ej. feature/nueva-bienvenida",
  createBranchSwitchLabel: "Cambiar a la nueva rama",
  createBranchDetachedNote: "No estás en una rama, así que cambiarás a la nueva para que este trabajo sea fácil de encontrar.",
  createBranchStartsAt: (shortCommit, subject) => `Empieza en ${shortCommit}: «${subject}».`,
  createBranchConfirm: "Crear rama",
  createBranchBack: "Atrás",
  createBranchToast: (name, switched) => switched ? `«${name}» creada, y ya estás en ella.` : `«${name}» creada.`,
  createBranchCreating: "Creando…",
  branchesQuickCreateNameLabel: "Nombre de la nueva rama",
  branchesQuickCreateClose: "Cerrar formulario de crear rama",
  branchesQuickCreateNamePlaceholder: "¿En qué vas a trabajar?",
  branchesQuickCreateNameHint: "Como",
  branchesQuickCreateNameExample: "feature/nueva-funcionalidad",
  branchesQuickCreateSourceLabel: "Crear desde",
  branchesQuickCreateSwitchLabel: "Cambiar a ella",
  branchesQuickCreateConfirmLabel: "Crear rama",
  branchesQuickCreateConfirmShort: "Crear",
  branchesQuickCreateConfirmAndSwitch: "Crear y cambiar",
  branchesQuickCreateSuccess: (name, switched) =>
    switched ? `Se creó «${name}» y se cambió a ella.` : `Se creó «${name}».`,
  branchesQuickCreateNameExampleFor: (prefix) => `${prefix}/nombre-corto`,
  branchesNameIssue: (issue) => {
    switch (issue.kind) {
      case "space":
        return "Usa guiones en lugar de espacios, como mi-linea.";
      case "character":
        return `Los nombres no pueden llevar «${issue.character}».`;
      case "control":
        return "El nombre tiene un carácter invisible. Vuelve a escribirlo.";
      case "sequence":
        return `Los nombres no pueden llevar «${issue.sequence}».`;
      case "leading":
        return `Los nombres no pueden empezar por «${issue.character}».`;
      case "part-leading-dot":
        return "Ninguna parte del nombre puede empezar por un punto.";
      case "trailing":
        return `Los nombres no pueden acabar en «${issue.character}».`;
      case "lock-suffix":
        return "Ninguna parte del nombre puede acabar en «.lock».";
      case "reserved":
        return `«${issue.name}» está reservado por Git.`;
      case "taken":
        return `Ya existe una rama llamada «${issue.name}».`;
      case "case-collision":
        return `Ya existe «${issue.existing}», y los nombres que solo cambian en mayúsculas chocan en algunos sistemas.`;
    }
  },
  switchBranchTitle: "Cambiar de rama",
  switchBranchTarget: (to) => `Pasarás a «${to}».`,
  switchBranchLoading: "Comparando ramas…",
  switchBranchChangedFiles: (count) =>
    count === 1 ? "Cambiará 1 archivo." : `Cambiarán ${count} archivos.`,
  switchBranchChangedFilesTruncated: (visible, total) => `Se muestran ${visible} de ${total} archivos cambiados.`,
  switchBranchDirtyDescription: "Elige qué hacer con tus cambios sin guardar.",
  switchBranchSaveVersionAction: "Guardar versión",
  switchBranchNewBranchAction: "Rama nueva con estos cambios",
  switchBranchConfirm: "Cambiar de rama",
  switchBranchDirtySaveTitle: "Guardarlos como versión",
  switchBranchDirtySaveNote: "Se guardan en la rama actual y luego cambias.",
  switchBranchDirtyNewTitle: "Llevarlos a una rama nueva",
  switchBranchDirtyNewNote: "La rama actual se queda como estaba.",
  switchBranchRecoveryNote: (from) => `«${from}» se queda tal cual y, al volver, recuperas estos archivos.`,
  switchBranchToast: (to) => `Ahora estás en «${to}».`,
  switchBranchSwitching: "Cambiando…",
  branchesFilterStateGroup: "Estado",
  branchesFilterPrefixGroup: "Prefijo del nombre",
  branchesFilterClear: "Quitar filtros",
  branchesGroupInProgress: "En curso",
  branchesGroupCleanUp: "Listas para limpiar",
  branchesGroupLabel: (name, count) => `${name}, ${count === 1 ? "1 rama" : `${count} ramas`}`,
  branchesCleanUpHint: "Se pueden eliminar",
  branchesCleanUpAction: (count) => (count === 1 ? "Limpiar 1 rama…" : `Limpiar ${count} ramas…`),
  branchesCleanUpActionNote: "Terminadas: su trabajo está en la rama principal",
  branchesSortRecent: "Recientes",
  branchesSortName: "Nombre",
  branchesSortUnpublished: "Locales primero",
  branchesSwitchShort: "Cambiar",
  branchesSwitchToBranchLabel: (name) => `Cambiar a «${name}»`,
  branchesSyncUpToDate: "Al día con el remoto",
  branchesSyncNoUpstream: "No sigue ningún remoto",
  branchesSyncGone: "Rama remota eliminada",
  branchesSyncAhead: (count) => (count === 1 ? "1 sin publicar" : `${count} sin publicar`),
  branchesSyncBehind: (count) => (count === 1 ? "1 por traer" : `${count} por traer`),
  branchesSyncAheadBehind: (ahead, behind) => `${ahead} sin publicar, ${behind} por traer`,
  branchesGlyphActive: "Activa: la rama en la que estás trabajando",
  branchesGlyphLocalOnly: "Solo local: nunca se ha publicado, así que solo está en este ordenador",
  branchesGlyphGone: "Su rama remota se eliminó",
  branchesGlyphProtected: "Rama principal: no se puede renombrar ni eliminar",
  branchesDeleteCopiedTooltip: (name, base) =>
    `Eliminar «${name}». Su trabajo ya está en ${base}; GitOdile guarda antes un punto de recuperación.`,
  branchesDeleteReadyTooltip: (name) => `Eliminar «${name}». Su trabajo ya está en otro sitio.`,
  branchesDeleteBlockedTooltip: (name) =>
    `«${name}» tiene trabajo que no está en ningún otro sitio. Ábrela para ver tus opciones.`,
  branchesDeleteElsewhereTooltip: (name) =>
    `«${name}» está abierta en otro espacio de trabajo, así que no se puede eliminar desde aquí.`,
  branchesListAriaLabel: "Ramas",
  branchesDetailAriaLabel: (name) => `Detalles de «${name}»`,
  branchesBackToList: "Volver a las ramas",
  branchesFiltersLabel: "Filtrar y ordenar",
  branchesFiltersActive: (count) =>
    count === 1 ? "Filtrar y ordenar (1 filtro activo)" : `Filtrar y ordenar (${count} filtros activos)`,
  branchesFiltersActiveCount: (count) =>
    count === 1 ? "1 filtro activo" : `${count} filtros activos`,
  branchesFilterSortGroup: "Ordenar por",
  branchesStateTracking: "Sigue un remoto",
  branchesLatestSavedLabel: "Última guardada",
  branchesAuthorYouNamed: (name) => `Tú (${name})`,
  branchesVersionsTitle: "Versiones guardadas",
  branchesRouteTitle: "Recorrido",
  branchesActionsTitle: "Qué puedes hacer",
  branchesMergeFrom: (base) => `Fusionar «${base}» en esta`,
  branchesActionUpdateFromDetail: (base) => `Trae a esta rama las versiones nuevas de ${base}.`,
  branchesActionUpdateFromCurrent: (base) => `${base} no se ha movido desde que salió esta rama.`,
  branchesActionUpdateFromNews: (base, count, formatted) =>
    count === 1 ? `${base} tiene 1 versión nueva que traer.` : `${base} tiene ${formatted} versiones nuevas que traer.`,
  branchesActionUpToDate: "Al día",
  branchesActionBringIntoBase: (base, count, formatted) =>
    count === null
      ? `Añade a ${base} las versiones de esta rama en una versión guardada nueva.`
      : count === 1
        ? `Añade a ${base} la versión de esta rama en una versión guardada nueva.`
        : `Añade a ${base} las ${formatted} versiones de esta rama en una versión guardada nueva.`,
  branchesActionBringIntoActive: "Añade sus versiones a la rama en la que trabajas en una versión guardada nueva.",
  branchesActionMoveOntoDetail: "Rehace las versiones propias de tu rama después de la última de esta.",
  branchesActionCompareTotals: (files, filesFormatted, additions, deletions) =>
    `${files === 1 ? "1 archivo cambiado" : `${filesFormatted} archivos cambiados`} desde que salió · +${additions} −${deletions}`,
  branchesActionCompareDetail: "Mira qué cambió desde que salió, archivo a archivo.",
  branchesActionCompareBranchesDetail: "Mira en qué se diferencian las dos ramas, archivo a archivo.",
  branchesLocalGroup: "En este ordenador",
  branchesBoundaryPublished: "Publicado",
  branchesPublish: "Publicar",
  branchesRouteLoading: "Leyendo dónde salió esta rama de main…",
  branchesRouteSummary: ({ base, date, own, since }) =>
    `Salió de ${base}${date ? ` el ${date}` : ""}. ${own === "1" ? "1 versión propia" : `${own} versiones propias`}. ${since ? `${base} tiene ${since} ${since === "1" ? "versión nueva" : "versiones nuevas"} desde entonces.` : `${base} no se ha movido desde entonces.`}`,
  branchesRouteMerged: (base, since) =>
    `Todo su trabajo está en ${base}, que tiene ${since} ${since === "1" ? "versión nueva" : "versiones nuevas"} desde entonces.`,
  branchesRouteSame: (base) => `Está en el mismo punto que ${base}. Aún no tiene versiones propias.`,
  branchesRouteCopied: ({ base, left, back, own, squashed, since }) =>
    `Salió de ${base}${left ? ` el ${left}` : ""}. Su trabajo volvió${back ? ` el ${back}` : ""} ${
      squashed ? "unido en una sola versión" : "en copias"
    }; ${own === "1" ? "el original solo está" : `los ${own} originales solo están`} en esta rama. ${
      since ? `${base} tiene ${since} ${since === "1" ? "versión nueva" : "versiones nuevas"} desde entonces.` : `${base} no se ha movido desde entonces.`
    }`,
  branchesRouteReturned: ({ base, left, back, own, since }) =>
    `Salió de ${base}${left ? ` el ${left}` : ""} y volvió${back ? ` el ${back}` : ""} con ${
      own === "1" ? "1 versión" : `${own} versiones`
    }. ${since ? `${base} tiene ${since} ${since === "1" ? "versión nueva" : "versiones nuevas"} desde entonces.` : `${base} no se ha movido desde entonces.`}`,
  branchesOpenVersionLabel: (subject) => `Abrir «${subject}» en Historial`,
  branchesPublishedPill: "Publicada",
  branchesUnpublishedPill: "Aún sin publicar",
  branchesRelationshipTitle: "Relación",
  branchesRelationshipSyncedDetail: (upstream) => `Al día con ${upstream}.`,
  branchesRelationshipAheadDetail: (upstream) => `Algunas versiones aún no están en ${upstream}, así que publícalas para enviarlas.`,
  branchesRelationshipBehindDetail: (upstream) => `${upstream} tiene versiones nuevas, así que trae los cambios del proyecto para incorporarlas.`,
  branchesRelationshipDivergedDetail: (upstream) => `Esta rama y ${upstream} han avanzado cada una por su lado.`,
  branchesRelationshipGoneDetail: (upstream) => `${upstream} ya no existe en el remoto, pero tu trabajo aquí sigue a salvo.`,
  branchesRelationshipLocalOnlyDetail: "Nunca se ha publicado, así que solo está en este ordenador.",
  branchesRelationshipActiveTitle: "La rama en la que estás trabajando",
  branchesRelationshipActiveDetail: "Las versiones que guardes van aquí.",
  branchesRelationshipUniqueDetail: (main) => `Su trabajo aún no está en ${main}.`,
  branchesRelationshipMergedTitle: (main) => `Ya está en ${main}`,
  branchesRelationshipMergedDetail: (main) => `Todo lo guardado aquí también está en ${main}.`,
  branchesRelationshipElsewhereTitle: "Abierta en otro espacio de trabajo",
  branchesHistoryDescription: "Mira todas las versiones, compara cambios y vuelve a estados anteriores.",
  branchesHistoryScopedDescription: (name) => `Muestra «${name}» en Historial sin cambiar a ella.`,
  branchesHistoryAction: "Abrir en Historial",
  deleteBranchTitle: "¿Eliminar esta rama?",
  deleteBranchTarget: (name) => `«${name}»`,
  deleteBranchBlockedTitle: "Aún no se puede eliminar",
  deleteBranchBlockedUniqueLead:
    (name) => `«${name}» tiene versiones que no están en otra parte. Puedes:`,
  deleteBranchBlockedUniqueOptionPublish: "Publicarla, para que el trabajo también esté en el remoto.",
  deleteBranchBlockedUniqueOptionMerge: "Llevar su trabajo a otra rama.",
  deleteBranchBlockedUniqueOptionKeep: "O conservarla: esperar no hace perder nada.",
  deleteBranchBlockedElsewhereLead:
    "Esta rama está abierta en otro espacio de trabajo. Ciérrala ahí o cambia ese espacio a otra rama, y reintenta.",
  deleteBranchBlockedActiveLead: "Es la rama en la que estás trabajando. Cambia antes a otra.",
  deleteBranchBlockedDefaultLead: "Es la rama principal del proyecto, donde vive el trabajo compartido, así que GitOdile la conserva.",
  deleteBranchBlockedOperationLead:
    (name) => `Termínalo o cancélalo en tu herramienta de Git y vuelve para eliminar «${name}».`,
  deleteBranchOpenConflictsAction: "Revisar los cambios que se solapan",
  deleteBranchSwitchAction: "Cambiar a esta rama",
  deleteBranchSafeLead: (branch) => `Su trabajo ya está en «${branch}», así que no se pierde nada.`,
  deleteBranchCopiedLead: (base, squashed) =>
    `Su trabajo ya está en «${base}», ${squashed ? "combinado en una sola versión" : "copiado versión a versión"}.`,
  deleteBranchCopiedRecovery:
    "Antes de eliminarla se guardan las versiones originales como punto de recuperación.",
  deleteBranchConfirm: "Eliminar rama",
  deleteBranchConflictTitle: "Hay un conflicto a medias",
  deleteBranchDeletedToast: (name, extra) =>
    extra === "remote-failed"
      ? `«${name}» ya no está en este ordenador, pero la copia publicada sigue ahí.`
      : extra === "remote"
        ? `«${name}» eliminada, también su copia publicada.`
        : extra === "recovery"
          ? `«${name}» eliminada. Sus versiones originales quedan en un punto de recuperación.`
          : `«${name}» eliminada.`,
  deleteBranchDeleting: "Eliminando…",
  deleteBranchRemoteLabel: "Eliminar también la copia publicada",
  deleteBranchRemoteOnNote: "Tu equipo dejará de verla.",
  deleteBranchRemoteOffNote: "Se queda, y tu equipo la sigue viendo.",
  cleanUpBranchesTitle: "¿Eliminar estas ramas?",
  cleanUpBranchesBlockedTitle: "Aún no se pueden eliminar",
  cleanUpBranchesLoading: "Comprobando cada rama…",
  cleanUpBranchesLead: "Están terminadas: su trabajo ya está en la rama principal, así que eliminarlas no hace perder nada.",
  cleanUpBranchesNothing: "Ahora mismo no se puede eliminar ninguna de estas ramas.",
  cleanUpBranchesListLabel: "Ramas que se eliminarán",
  cleanUpBranchesSelectAll: (chosen, total) => `Todas las ramas (${chosen} de ${total})`,
  cleanUpBranchesKeptOn: (branch, more) => (more > 0 ? `Está en «${branch}» y ${more} más` : `Está en «${branch}»`),
  cleanUpBranchesCapped: (shown, total) => `Las primeras ${shown} de ${total} ramas. Limpia el resto después.`,
  cleanUpBranchesExcludedHeading: (count) => (count === 1 ? "1 rama se queda fuera" : `${count} ramas se quedan fuera`),
  cleanUpBranchesRemoteLabel: (count) =>
    count === 0
      ? "Eliminar también las copias publicadas"
      : count === 1
        ? "Eliminar también la copia publicada"
        : `Eliminar también las ${count} copias publicadas`,
  cleanUpBranchesRemoteOnNote: "Tu equipo dejará de verlas.",
  cleanUpBranchesRemoteOffNote: "Se quedan, y tu equipo las sigue viendo.",
  cleanUpBranchesRemoteNoneNote: "Ninguna de las ramas elegidas está publicada.",
  cleanUpBranchesRecoveryFact: "Antes se guarda el nombre y la última versión de cada rama en un punto de recuperación en este ordenador.",
  cleanUpBranchesNoneChosen: "Elige al menos una rama para eliminar.",
  cleanUpBranchesConfirm: (count) => (count === 1 ? "Eliminar 1 rama" : `Eliminar ${count} ramas`),
  cleanUpBranchesConfirmPending: "Eliminar ramas",
  cleanUpBranchesDeleting: "Eliminando…",
  cleanUpBranchesDoneTitle: "Limpieza terminada",
  cleanUpBranchesSummary: (deleted, skipped, remoteFailed) =>
    [
      deleted === 1 ? "1 rama eliminada" : `${deleted} ramas eliminadas`,
      skipped > 0 ? (skipped === 1 ? "1 conservada" : `${skipped} conservadas`) : null,
      remoteFailed > 0
        ? remoteFailed === 1
          ? "1 copia publicada sigue ahí"
          : `${remoteFailed} copias publicadas siguen ahí`
        : null,
    ]
      .filter(Boolean)
      .join(", ") + ".",
  cleanUpBranchesSkippedHeading: "Sin eliminar",
  cleanUpBranchesRemoteFailedHeading: "Eliminadas aquí, aún publicadas",
  cleanUpBranchesRemoteRefused: "El remoto se negó a eliminarla; puede que esté protegida allí.",
  cleanUpBranchesRecoveryKept: "El nombre y la última versión de cada rama eliminada quedan en un punto de recuperación en este ordenador.",
  cleanUpBranchesToast: (deleted, remote) =>
    `${deleted === 1 ? "1 rama eliminada" : `${deleted} ramas eliminadas`}${remote ? ", y también sus copias publicadas" : ""}. Cada una queda en un punto de recuperación.`,
  renameBranchTitle: (name) => `Renombrar «${name}»`,
  renameBranchInstallBlockerLabel: (name) => `Renombrar ${name}`,
  renameBranchNote: "Solo cambia el nombre y todas las versiones guardadas se quedan donde están.",
  renameBranchUpstreamNote: (upstream) =>
    `Sigue apuntando a ${upstream}, que conserva su nombre. Renombrarla ahí es otro paso.`,
  renameBranchConfirm: "Renombrar",
  branchesRenameInlineNote: "Solo cambia el nombre",
  branchesRenameInlineUpstreamNote: (upstream) => `Solo cambia el nombre: sigue apuntando a ${upstream}`,
  renameBranchRenaming: "Renombrando…",
  branchesRenameShort: "Renombrar",
  branchesDeleteShort: "Eliminar",
  branchesContextMenuLabel: (name) => `Acciones para «${name}»`,
  branchesCopyName: "Copiar el nombre",
  branchesNameCopied: "Nombre copiado",
  branchesCopyFailed: "No se pudo copiar el nombre.",
  branchesRenameBranchLabel: (name) => `Renombrar «${name}»`,
  branchesDefaultBranchChip: "Rama principal",
  branchesDefaultBranchNote: "Aquí vive el trabajo compartido, así que GitOdile no la renombra ni la elimina.",
};

