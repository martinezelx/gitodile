//! Desktop-shell services that do not belong to a product feature.

use std::io::ErrorKind;
use std::path::Path;

use tauri::Manager;

use crate::application;
use crate::changes::validate_repo_relative_path;
use crate::error::{AppError, AppErrorCode};
use crate::tooling;

pub(crate) fn app_status() -> &'static str {
    "GitOdile is ready"
}

/// Opens the operating system's file manager with one of the project's files
/// selected.
///
/// The frontend names a repository-relative path and never a place on the disk.
/// `tauri-plugin-opener` exposes a `reveal_item_in_dir` command whose permission
/// carries no scope of its own, so allowing it in `capabilities/default.json`
/// would let the webview reveal anything on the machine — the same reason that
/// file lists every URL the app may open. Calling the plugin's Rust API from
/// behind this command keeps the choice of path here, where it can be checked.
///
/// The check is the one `read_file_lines` and the picture previews already make,
/// for the same reason: `validate_repo_relative_path` rejects `..` and absolute
/// paths but works on the string alone, so a symlink committed inside the
/// repository would still resolve outside it. Both ends are resolved and
/// compared.
pub(crate) fn reveal_project_file(path: String, file_path: String) -> Result<(), AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "reveal_project_file", None)?;
    validate_repo_relative_path(&file_path)?;

    let repo_root = Path::new(&path).canonicalize().map_err(|_| {
        AppError::new(
            AppErrorCode::PathUnusable,
            "This project's folder can't be read.",
        )
        .with_remediation("Open the project again, or choose another folder.")
    })?;
    let full_path = repo_root.join(&file_path).canonicalize().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            AppError::new(AppErrorCode::PathMissing, "This file is no longer there.")
                .with_remediation("Refresh the changes list.")
        } else {
            AppError::new(AppErrorCode::PathUnusable, "This file can't be read.")
                .with_remediation("Check the file's permissions and try again.")
        }
    })?;
    if !full_path.starts_with(&repo_root) {
        return Err(
            AppError::new(AppErrorCode::PathInvalid, "That file path isn't valid.")
                .with_remediation("Refresh the changes list and choose the file again."),
        );
    }

    reveal_in_file_manager(&full_path).map_err(|error| {
        error.with_remediation("Open the project folder yourself to find this file.")
    })
}

/// Opens the project's own folder in the operating system's file manager.
///
/// Only the folder of a project this session has open: the path is
/// authorised as a repository first, so the renderer can name a project but
/// never an arbitrary place on the disk — the same reason
/// `reveal_project_file` keeps the opener's scope-free API behind a command of
/// its own. The authorised root is opened as it is: canonicalising it would
/// hand Windows' file manager a verbatim `\\?\` path, which it does not
/// always open.
pub(crate) fn open_project_folder(path: String) -> Result<(), AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "open_project_folder", None)?;
    let repo_root = Path::new(&path);
    if !repo_root.is_dir() {
        return Err(AppError::new(
            AppErrorCode::PathUnusable,
            "This project's folder can't be read.",
        )
        .with_remediation("Open the project again, or choose another folder."));
    }
    tauri_plugin_opener::open_path(repo_root, None::<&str>).map_err(|_| {
        AppError::new(
            AppErrorCode::PathUnusable,
            "Your file manager couldn't be opened.",
        )
        .with_remediation("Copy the path and open it yourself.")
    })
}

/// Opens the web page of one of the project's remotes in the browser. The
/// renderer names the remote; the address is derived here from the project's
/// own configuration, so the opener never receives a URL the renderer wrote.
pub(crate) fn open_remote_home(path: String, remote: String) -> Result<(), AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "open_remote_home", None)?;
    let page = crate::sync::remote_web_page(&path, &remote)?;
    open_derived_url(&page)
}

/// Shows where Git, or one of its configuration files, lives. The path is the
/// one `tooling` found again for the named place, never one the renderer sent.
pub(crate) fn reveal_git_location(target: String) -> Result<(), AppError> {
    let path = tooling::git_location_path(&target)?;
    reveal_in_file_manager(&path)
        .map_err(|error| error.with_remediation("Copy the path and open it yourself."))
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub(crate) enum DesktopPlatform {
    Windows,
    MacOs,
    Linux,
}

impl DesktopPlatform {
    pub(crate) fn current() -> Self {
        if cfg!(windows) {
            Self::Windows
        } else if cfg!(target_os = "macos") {
            Self::MacOs
        } else {
            Self::Linux
        }
    }
}

/// Types Windows runs, installs, imports or follows rather than opens, on
/// top of whatever `PATHEXT` lists on this machine: shortcuts, installers,
/// registry files, scripts and control-panel items among them.
const WINDOWS_RUNNABLE: &[&str] = &[
    "appref-ms",
    "appx",
    "appxbundle",
    "application",
    "bat",
    "cmd",
    "com",
    "cpl",
    "diagcab",
    "exe",
    "gadget",
    "hta",
    "inf",
    "jar",
    "js",
    "jse",
    "library-ms",
    "lnk",
    "msc",
    "msi",
    "msix",
    "msixbundle",
    "msp",
    "mst",
    "pif",
    "ps1",
    "psm1",
    "reg",
    "scf",
    "scr",
    "search-ms",
    "searchconnector-ms",
    "settingcontent-ms",
    "url",
    "vbe",
    "vbs",
    "website",
    "ws",
    "wsc",
    "wsf",
    "wsh",
    "xbap",
];

/// Types macOS launches, installs or follows rather than opens.
const MACOS_RUNNABLE: &[&str] = &[
    "action", "app", "command", "fileloc", "inetloc", "jar", "mpkg", "pkg", "prefpane", "saver",
    "terminal", "tool", "webloc", "workflow",
];

/// Types a Linux desktop launches rather than opens.
const LINUX_RUNNABLE: &[&str] = &["appimage", "desktop", "jar", "run"];

/// Whether the system's "open" would run `name` as a program (or install,
/// import or follow it) instead of showing it in an application. On macOS
/// and Linux a file with an executable bit is launched as well, so it counts
/// whatever its name. On Windows a name ending in dots or spaces is the name
/// without them, and an alternate data stream (`:`) is never opened.
pub(crate) fn runs_instead_of_opening(
    platform: DesktopPlatform,
    name: &str,
    executable_bit: bool,
    path_ext: Option<&str>,
) -> bool {
    let name = match platform {
        DesktopPlatform::Windows => {
            if name.contains(':') {
                return true;
            }
            name.trim_end_matches(['.', ' '])
        }
        DesktopPlatform::MacOs | DesktopPlatform::Linux => {
            if executable_bit {
                return true;
            }
            name
        }
    };
    let Some((_, extension)) = name.rsplit_once('.') else {
        return false;
    };
    let extension = extension.to_lowercase();
    match platform {
        DesktopPlatform::Windows => {
            WINDOWS_RUNNABLE.contains(&extension.as_str())
                || path_ext.is_some_and(|list| {
                    list.split(';').any(|item| {
                        item.trim()
                            .trim_start_matches('.')
                            .eq_ignore_ascii_case(&extension)
                    })
                })
        }
        DesktopPlatform::MacOs => MACOS_RUNNABLE.contains(&extension.as_str()),
        DesktopPlatform::Linux => LINUX_RUNNABLE.contains(&extension.as_str()),
    }
}

#[cfg(unix)]
pub(crate) fn has_executable_bit(metadata: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o111 != 0
}

#[cfg(not(unix))]
pub(crate) fn has_executable_bit(_metadata: &std::fs::Metadata) -> bool {
    false
}

/// Refuses a file the system would run instead of open, pointing the reader
/// at its folder so they can choose the application themselves. Checked
/// before anything else happens, so a refusal changes nothing.
pub(crate) fn ensure_opens_as_document(
    target: &Path,
    executable_bit: bool,
) -> Result<(), AppError> {
    let name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();
    let path_ext = std::env::var("PATHEXT").ok();
    if runs_instead_of_opening(
        DesktopPlatform::current(),
        name,
        executable_bit,
        path_ext.as_deref(),
    ) {
        return Err(AppError::new(
            AppErrorCode::FileRunsAsProgram,
            "Your system would run this file as a program instead of opening it.",
        )
        .with_remediation("Show it in its folder and open it with an app you choose."));
    }
    Ok(())
}

/// Opens a file the caller has already proved is one of the project's and
/// passed through [`ensure_opens_as_document`], in the application the system
/// uses for its type. Never `GIT_EDITOR` or `core.editor`: those are shell
/// command lines.
pub(crate) fn open_in_default_application(target: &Path) -> Result<(), AppError> {
    // A canonical Windows path is a verbatim `\\?\C:\…` one, which not every
    // application accepts on its command line; the drive form names the same
    // file.
    let shown = target.to_str().and_then(|text| text.strip_prefix(r"\\?\"));
    let target = match shown {
        Some(plain) if !plain.starts_with("UNC\\") => Path::new(plain),
        _ => target,
    };
    tauri_plugin_opener::open_path(target, None::<&str>).map_err(|_| {
        AppError::new(
            AppErrorCode::PathUnusable,
            "No app on this computer opened this file.",
        )
        .with_remediation("Show it in its folder and open it with an app you choose.")
    })
}

fn reveal_in_file_manager(path: &Path) -> Result<(), AppError> {
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|_| {
        AppError::new(
            AppErrorCode::PathUnusable,
            "Your file manager couldn't be opened.",
        )
    })
}

/// Opens a URL the native side derived itself (never one the renderer or a
/// tool supplied); the renderer's opener scope stays a fixed allow-list.
pub(crate) fn open_derived_url(url: &str) -> Result<(), AppError> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|_| {
        AppError::new(
            AppErrorCode::PathUnusable,
            "Your browser couldn't be opened.",
        )
        .with_remediation("Open the address shown in GitOdile in your browser yourself.")
    })
}

/// The main window starts hidden so the OS-level window never appears blank
/// while the webview loads and React mounts.
pub(crate) fn show_main_window(window: tauri::Window) {
    if let Some(main) = window.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn what_the_system_would_run_is_never_opened() {
        use DesktopPlatform::*;
        let path_ext = Some(".COM;.EXE;.BAT;.CMD;.VBS;.JS;.WSF;.MSC;.CUSTOM");
        for (platform, name, executable_bit, runs) in [
            (Windows, "notes.txt", false, false),
            (Windows, "Makefile", false, false),
            (Windows, ".gitattributes", false, false),
            (Windows, "setup.EXE", false, true),
            (Windows, "setup.exe. ", false, true),
            (Windows, "link.lnk", false, true),
            (Windows, "site.url", false, true),
            (Windows, "keys.reg", false, true),
            (Windows, "tool.custom", false, true),
            (Windows, "notes.txt:hidden.exe", false, true),
            // Windows ignores the bit: only the type decides there.
            (Windows, "script.sh", true, false),
            (MacOs, "notes.md", false, false),
            (MacOs, "run.command", false, true),
            (MacOs, "Thing.app", false, true),
            (MacOs, "build", true, true),
            (MacOs, "setup.exe", false, false),
            (Linux, "notes.md", false, false),
            (Linux, "launcher.desktop", false, true),
            (Linux, "Tool.AppImage", false, true),
            (Linux, "script.sh", true, true),
        ] {
            assert_eq!(
                runs_instead_of_opening(platform, name, executable_bit, path_ext),
                runs,
                "{platform:?} {name}"
            );
        }
    }
}
