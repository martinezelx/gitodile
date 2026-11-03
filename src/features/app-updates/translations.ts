import type { Language } from "../../i18n";
import type { UpdateError, UpdateState } from "./domain";

/* The product name appears nowhere in this copy: the window is already the
 * product, and every other surface follows that rule (DESIGN.md, status
 * strip). Each line names one state or one action, in the words the reader
 * would use — "Downloading…", not "Downloading the signed update…"; the
 * signature check is a fact for the contract document, not a thing to
 * reassure people about on every download. */
const dictionaries = {
  en: {
    title: "Updates",
    titleUnconfirmed: "The update didn't finish",
    installedSubtitle: (version: string) => `Installed version: ${version}`,
    installedLabel: "Installed version",
    check: "Check for updates",
    /* The More actions entry names the next step once there is one. Each ends
       in an ellipsis because it opens Settings, where the step is confirmed. */
    menu: {
      available: (version: string) => `Update to ${version}…`,
      downloading: (version: string) => `Downloading ${version}…`,
      ready: (version: string) => `Install ${version}…`,
    },
    attention: (version: string) => `Version ${version} is waiting`,
    details: "Details",
    checking: "Checking for updates…",
    cancel: "Cancel",
    current: "You have the latest version",
    available: (version: string) => `New version: ${version}`,
    download: "Download",
    downloadSized: (size: string) => `Download (${size})`,
    downloading: "Downloading…",
    verifying: "Verifying the download…",
    ready: "Ready to install",
    installExplanation: "The app closes and reopens on the new version. Your project files aren't touched, and your drafts are kept.",
    install: "Install and restart",
    close: "Close",
    checkAgain: "Check again",
    retry: "Try again",
    manual: "Manual download",
    highlights: "What's new",
    noNotes: "No release notes for this version.",
    received: (bytes: string) => `${bytes} downloaded`,
    progress: (received: string, total: string) => `${received} of ${total}`,
    installing: "Installing… The app will close.",
    cancelled: "Cancelled before anything was installed.",
    checkedAt: (when: string) => `Checked ${when}`,
    justNow: "just now",
    automaticLabel: "Check for updates automatically",
    automaticDescription: "When GitOdile opens and once a day. Nothing from your projects is sent.",
    manualFromGitHub: "Download manually from GitHub",
    whatsNewDescription: "What the newest version brings, and what earlier ones changed.",
    whatsNewNewBadge: "New version",
    whatsNewYourVersion: "Your version",
    whatsNewEarlierHeading: "Earlier versions",
    whatsNewHighlightCount: (count: number) => (count === 1 ? "1 change" : `${count} changes`),
    whatsNewEmpty: "Nothing new to show for this version.",
    startupConfirmed: (version: string) => `Updated to ${version}`,
    seeWhatsNew: "See what's new",
    startupUnconfirmed: (version: string) => `The app restarted, but not on version ${version}. Check again or use the manual download.`,
    startupUnconfirmedUnknown: "The app restarted, but the new version couldn't be confirmed. Check again or use the manual download.",
    installBlockedBy: (label: string) => `“${label}” has unsaved changes. Save or discard them, then try again.`,
    status: {
      idle: "Not checked yet",
      unavailable: "Not available for this installation",
      developmentBuild: "Development build",
      blocked: "Can't install yet",
    },
    /* The short state word in the update row's chip, beside the app name; the
       full sentence stays in the status line below it. */
    chip: {
      idle: "Not checked",
      checking: "Checking",
      current: "Up to date",
      available: (version: string) => `${version} available`,
      downloading: "Downloading",
      verifying: "Verifying",
      ready: "Ready to install",
      blocked: "Can't install yet",
      installing: "Installing",
      cancelled: "Cancelled",
      unavailable: "Not available",
      developmentBuild: "Development build",
      failed: "Needs attention",
    },
    errors: {
      offline: "Couldn't reach GitHub. Check your connection and try again.",
      timeout: "GitHub took too long to answer. Try again later.",
      http_status: "GitHub returned an unexpected response. Try again later or use the manual download.",
      feed_unavailable: "Updates aren't available yet. Use the manual download if a release was announced.",
      invalid_manifest: "The update information was invalid, so it was ignored.",
      invalid_version: "The offered version was invalid, so it was ignored.",
      target_unavailable: "There's no update package for this system. Use the manual download.",
      unsupported_installation: "A store or package manager manages this installation. Update it from there.",
      automatic_update_not_enabled: "This build can't update itself. Use the manual download.",
      read_only_installation: "The app is running from a read-only location. Move it to your applications folder.",
      notes_too_large: "The release notes were too large, so the update was ignored.",
      payload_too_large: "The update is larger than allowed, so it wasn't downloaded.",
      truncated_download: "The download stopped early. Try again.",
      signature_invalid: "The update signature couldn't be verified, so nothing was installed.",
      insufficient_space: "Not enough free space. Free some space and try again.",
      install_blocked: "Something in progress is keeping the update from installing. Finish it, then try again.",
      install_handoff_failed: "The installer didn't accept the update. Try again or use the manual download.",
      post_install_unconfirmed: "The new version wasn't found after restarting. Use the manual download if needed.",
      not_configured: "Development builds don't update themselves.",
      internal: "The update couldn't be completed. Try again or use the manual download.",
    } satisfies Record<UpdateError["code"], string>,
  },
  es: {
    title: "Actualizaciones",
    titleUnconfirmed: "La actualización no terminó",
    installedSubtitle: (version: string) => `Versión instalada: ${version}`,
    installedLabel: "Versión instalada",
    check: "Buscar actualizaciones",
    menu: {
      available: (version: string) => `Actualizar a ${version}…`,
      downloading: (version: string) => `Descargando ${version}…`,
      ready: (version: string) => `Instalar ${version}…`,
    },
    attention: (version: string) => `La versión ${version} está esperando`,
    details: "Detalles",
    checking: "Buscando actualizaciones…",
    cancel: "Cancelar",
    current: "Tienes la última versión",
    available: (version: string) => `Nueva versión: ${version}`,
    download: "Descargar",
    downloadSized: (size: string) => `Descargar (${size})`,
    downloading: "Descargando…",
    verifying: "Verificando la descarga…",
    ready: "Lista para instalar",
    installExplanation: "La aplicación se cierra y se vuelve a abrir con la versión nueva. Los archivos de tus proyectos no se tocan y tus borradores se conservan.",
    install: "Instalar y reiniciar",
    close: "Cerrar",
    checkAgain: "Buscar de nuevo",
    retry: "Reintentar",
    manual: "Descarga manual",
    highlights: "Novedades",
    noNotes: "Esta versión no incluye notas.",
    received: (bytes: string) => `${bytes} descargados`,
    progress: (received: string, total: string) => `${received} de ${total}`,
    installing: "Instalando… La aplicación se cerrará.",
    cancelled: "Cancelado antes de instalar nada.",
    checkedAt: (when: string) => `Comprobado ${when}`,
    justNow: "ahora mismo",
    automaticLabel: "Buscar actualizaciones automáticamente",
    automaticDescription: "Al abrir GitOdile y una vez al día. No se envía nada de tus proyectos.",
    manualFromGitHub: "Descargar manualmente desde GitHub",
    whatsNewDescription: "Qué trae la última versión y qué cambiaron las anteriores.",
    whatsNewNewBadge: "Nueva versión",
    whatsNewYourVersion: "Tu versión",
    whatsNewEarlierHeading: "Versiones anteriores",
    whatsNewHighlightCount: (count: number) => (count === 1 ? "1 novedad" : `${count} novedades`),
    whatsNewEmpty: "Esta versión no tiene novedades que mostrar.",
    startupConfirmed: (version: string) => `Actualizado a ${version}`,
    seeWhatsNew: "Ver novedades",
    startupUnconfirmed: (version: string) => `La aplicación se reinició, pero no con la versión ${version}. Busca de nuevo o usa la descarga manual.`,
    startupUnconfirmedUnknown: "La aplicación se reinició, pero no se pudo confirmar la versión nueva. Busca de nuevo o usa la descarga manual.",
    installBlockedBy: (label: string) => `«${label}» tiene cambios sin guardar. Guárdalos o descártalos y reinténtalo.`,
    status: {
      idle: "Sin comprobar",
      unavailable: "No disponible para esta instalación",
      developmentBuild: "Versión de desarrollo",
      blocked: "Todavía no se puede instalar",
    },
    /* The short state word in the update row's chip, beside the app name; the
       full sentence stays in the status line below it. */
    chip: {
      idle: "Sin comprobar",
      checking: "Comprobando",
      current: "Al día",
      available: (version: string) => `${version} disponible`,
      downloading: "Descargando",
      verifying: "Verificando",
      ready: "Lista para instalar",
      blocked: "No se puede instalar",
      installing: "Instalando",
      cancelled: "Cancelada",
      unavailable: "No disponible",
      developmentBuild: "Versión de desarrollo",
      failed: "Revisar",
    },
    errors: {
      offline: "No se pudo contactar con GitHub. Comprueba la conexión y reinténtalo.",
      timeout: "GitHub tardó demasiado en responder. Reinténtalo más tarde.",
      http_status: "GitHub devolvió una respuesta inesperada. Reinténtalo más tarde o usa la descarga manual.",
      feed_unavailable: "Las actualizaciones aún no están disponibles. Usa la descarga manual si se anunció una versión.",
      invalid_manifest: "La información de la actualización no era válida, así que se ignoró.",
      invalid_version: "La versión ofrecida no era válida, así que se ignoró.",
      target_unavailable: "No hay paquete de actualización para este sistema. Usa la descarga manual.",
      unsupported_installation: "Esta instalación la gestiona una tienda o un gestor de paquetes. Actualízala desde ahí.",
      automatic_update_not_enabled: "Esta build no puede actualizarse sola. Usa la descarga manual.",
      read_only_installation: "La aplicación se ejecuta desde una ubicación de solo lectura. Muévela a tu carpeta de aplicaciones.",
      notes_too_large: "Las notas eran demasiado grandes, así que se ignoró la actualización.",
      payload_too_large: "La actualización supera el tamaño permitido, así que no se descargó.",
      truncated_download: "La descarga se cortó. Reinténtalo.",
      signature_invalid: "No se pudo verificar la firma, así que no se ha instalado nada.",
      insufficient_space: "No hay espacio libre suficiente. Libera espacio y reinténtalo.",
      install_blocked: "Hay algo en curso que impide instalar la actualización. Termínalo y reinténtalo.",
      install_handoff_failed: "El instalador no aceptó la actualización. Reinténtalo o usa la descarga manual.",
      post_install_unconfirmed: "No se encontró la nueva versión tras reiniciar. Usa la descarga manual si hace falta.",
      not_configured: "Las versiones de desarrollo no se actualizan solas.",
      internal: "No se pudo completar la actualización. Reinténtalo o usa la descarga manual.",
    } satisfies Record<UpdateError["code"], string>,
  },
} as const;

export function appUpdateTranslations(language: Language) {
  return dictionaries[language];
}

export function candidateFromState(state: UpdateState) {
  return "candidate" in state ? state.candidate : null;
}

/** The More actions and macOS menu entry: the next step when there is one,
 * otherwise the check. Both menus read it, so they never name one state two
 * ways. */
export function updateMenuLabel(state: UpdateState, language: Language): string {
  const t = dictionaries[language];
  switch (state.kind) {
    case "available": return t.menu.available(state.candidate.version);
    case "downloading":
    case "verifying": return t.menu.downloading(state.candidate.version);
    case "ready":
    case "blocked": return t.menu.ready(state.candidate.version);
    default: return t.check;
  }
}
