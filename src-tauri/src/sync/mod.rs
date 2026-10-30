//! Provider-neutral remote knowledge and team-sync status.
//!
//! This module owns configured remotes, upstream resolution, bounded network
//! Git execution, privacy-safe diagnostics and ancestry classification. It is
//! shared by the explicit team check and Publish; it never chooses an inbound
//! target for a branch without an upstream.
//!
//! [`integrate`] is a submodule rather than more of this file. It holds the
//! history-changing workflows of the domain (Get project changes and Bring in
//! changes, one analysis and one execution) and its safety checks are
//! helpers no other part of sync should be able to call. The read model here
//! reaches it through one door, [`forecast_incoming`], so every status read of
//! a branch with versions waiting can say what getting them would do; splitting
//! it keeps everything else private and leaves this file as the read model.

mod integrate;

pub(crate) use integrate::*;

use crate::application;
use crate::diagnostics;
use crate::error::{AppError, AppErrorCode};
use crate::git;
use crate::git_command::{checked_git_stdout, git_stdout, run_git};
use crate::operation::truncate_detail;
use crate::operation::OperationKind;
use crate::repository::{resolve_head_state, validate_branch_ref_name, HeadState};
use crate::status::read_working_tree_status;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::process::ExitStatus;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub(crate) const NETWORK_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteInfo {
    pub(crate) name: String,
    /// Presentation-only value. The raw configured URL never crosses IPC.
    pub(crate) url: String,
}

#[derive(Debug, Clone)]
pub(crate) struct ConfiguredRemote {
    info: RemoteInfo,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteDiscovery {
    pub(crate) remotes: Vec<RemoteInfo>,
    pub(crate) branch: Option<String>,
    pub(crate) upstream: Option<String>,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ConnectRemoteCredentialExpectation {
    None,
    GitCredentialHelper,
    SshAgentOrKey,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectRemotePlan {
    pub(crate) operation_kind: OperationKind,
    pub(crate) requires_confirmation: bool,
    pub(crate) project_id: String,
    pub(crate) session_epoch: String,
    pub(crate) state_token: String,
    pub(crate) remote_name: String,
    /// Rust-redacted display values. User-info, query and fragment never cross IPC.
    pub(crate) fetch_url_display: String,
    pub(crate) push_url_display: String,
    pub(crate) credential_expectation: ConnectRemoteCredentialExpectation,
    pub(crate) contacts_network: bool,
    pub(crate) future_network_access: bool,
    pub(crate) changes_remote: bool,
    pub(crate) preserves_existing_config: bool,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectRemoteResult {
    pub(crate) project_id: String,
    pub(crate) session_epoch: String,
    pub(crate) remote_name: String,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SyncTarget {
    pub(crate) remote: String,
    pub(crate) destination_branch: String,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum TeamSyncState {
    NoRemote,
    NoUpstream,
    Unborn,
    Detached,
    UpToDate,
    Ahead,
    Behind,
    Diverged,
    /// The branch tracks a remote branch that no longer exists: a check found
    /// it missing on the remote, or the tracking ref is gone too (Git's
    /// `[gone]`). The stale tracking ref, when there is one, is kept.
    UpstreamGone,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SyncKnowledge {
    Cached,
    Fresh,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SyncWarning {
    pub(crate) code: String,
    pub(crate) message: String,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SyncNextAction {
    CheckAgain,
    PublishChanges,
    ReviewAndGet,
}

#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TeamSyncStatus {
    pub(crate) state: TeamSyncState,
    pub(crate) local_branch: Option<String>,
    pub(crate) local_commit: Option<String>,
    pub(crate) upstream_remote: Option<String>,
    pub(crate) destination_branch: Option<String>,
    pub(crate) tracking_ref: Option<String>,
    pub(crate) remote_commit: Option<String>,
    pub(crate) ahead: u32,
    pub(crate) behind: u32,
    pub(crate) knowledge: SyncKnowledge,
    /// Unix milliseconds, present only after a successful explicit fetch and
    /// ancestry classification in this application session.
    pub(crate) checked_at: Option<u64>,
    pub(crate) warnings: Vec<SyncWarning>,
    pub(crate) next_actions: Vec<SyncNextAction>,
    pub(crate) state_token: String,
    /// What getting the waiting versions would do, predicted locally. Present
    /// only while the branch is behind or diverged.
    pub(crate) forecast: Option<IncomingForecast>,
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SyncRelation {
    pub(crate) ahead: u32,
    pub(crate) behind: u32,
    pub(crate) diverged: bool,
}

#[derive(Debug)]
pub(crate) struct NetworkOutput {
    pub(crate) status: Option<ExitStatus>,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
    pub(crate) timed_out: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct ResolvedUpstream {
    pub(crate) remote: String,
    pub(crate) destination_branch: String,
    pub(crate) tracking_ref: String,
    fetch_refspec: String,
}

#[derive(Debug, Clone)]
struct NormalizedConnectionUrl {
    persisted: String,
    safe_display: String,
    credential_expectation: ConnectRemoteCredentialExpectation,
    contacts_network: bool,
}

fn connect_remote_error(code: AppErrorCode, message: &str, remediation: &str) -> AppError {
    AppError::new(code, message).with_remediation(remediation)
}

fn normalize_connection_url(raw: &str) -> Result<NormalizedConnectionUrl, AppError> {
    let raw = raw.trim();
    if raw.is_empty() || raw.chars().any(char::is_control) {
        return Err(connect_remote_error(
            AppErrorCode::InvalidRemoteUrl,
            "Enter a complete remote Git URL.",
            "Use an HTTPS, SSH, Git, or file URL.",
        ));
    }
    let without_suffix = raw.split(['?', '#']).next().unwrap_or_default();
    if let Some((raw_scheme, rest)) = without_suffix.split_once("://") {
        let scheme = raw_scheme.to_ascii_lowercase();
        if !matches!(scheme.as_str(), "https" | "ssh" | "git" | "file") {
            return Err(connect_remote_error(
                AppErrorCode::InvalidRemoteUrl,
                "That remote protocol isn't supported.",
                "Use an HTTPS, SSH, Git, or file URL.",
            ));
        }
        let authority_end = rest.find('/').unwrap_or(rest.len());
        let authority = &rest[..authority_end];
        let remote_path = &rest[authority_end..];
        if scheme != "file" && authority.is_empty() {
            return Err(connect_remote_error(
                AppErrorCode::InvalidRemoteUrl,
                "The remote URL has no host.",
                "Enter a complete remote Git URL.",
            ));
        }
        if remote_path.trim_matches('/').is_empty() {
            return Err(connect_remote_error(
                AppErrorCode::InvalidRemoteUrl,
                "The remote URL has no project path.",
                "Enter a URL that identifies a Git repository.",
            ));
        }
        let (safe_authority, persisted_authority) = match authority.rsplit_once('@') {
            Some((userinfo, host)) if !host.is_empty() => {
                let persisted = if scheme == "ssh" {
                    let username = userinfo.split(':').next().unwrap_or_default();
                    if username.is_empty() {
                        host.to_string()
                    } else {
                        format!("{username}@{host}")
                    }
                } else {
                    host.to_string()
                };
                (host.to_string(), persisted)
            }
            Some(_) => {
                return Err(connect_remote_error(
                    AppErrorCode::InvalidRemoteUrl,
                    "The remote URL has no host.",
                    "Enter a complete remote Git URL.",
                ))
            }
            None => (authority.to_string(), authority.to_string()),
        };
        return Ok(NormalizedConnectionUrl {
            persisted: format!("{scheme}://{persisted_authority}{remote_path}"),
            safe_display: format!("{scheme}://{safe_authority}{remote_path}"),
            credential_expectation: match scheme.as_str() {
                "https" => ConnectRemoteCredentialExpectation::GitCredentialHelper,
                "ssh" => ConnectRemoteCredentialExpectation::SshAgentOrKey,
                _ => ConnectRemoteCredentialExpectation::None,
            },
            contacts_network: scheme != "file"
                || (!authority.is_empty() && !authority.eq_ignore_ascii_case("localhost")),
        });
    }

    let looks_like_windows_drive = raw.as_bytes().get(1) == Some(&b':')
        && raw.as_bytes().first().is_some_and(u8::is_ascii_alphabetic);
    if !looks_like_windows_drive {
        if let Some((authority, remote_path)) = without_suffix.split_once(':') {
            let recognizable_ssh_location = authority.contains('@')
                || authority.contains('.')
                || authority.eq_ignore_ascii_case("localhost")
                || remote_path.contains('/');
            if recognizable_ssh_location
                && !authority.is_empty()
                && !remote_path.is_empty()
                && !authority.contains(['/', '\\'])
            {
                let (persisted_authority, host) = authority.rsplit_once('@').map_or_else(
                    || (authority.to_string(), authority),
                    |(userinfo, host)| {
                        let username = userinfo.split(':').next().unwrap_or_default();
                        let persisted = if username.is_empty() {
                            host.to_string()
                        } else {
                            format!("{username}@{host}")
                        };
                        (persisted, host)
                    },
                );
                if host.is_empty() {
                    return Err(connect_remote_error(
                        AppErrorCode::InvalidRemoteUrl,
                        "The SSH remote has no host.",
                        "Enter a complete SSH Git location.",
                    ));
                }
                return Ok(NormalizedConnectionUrl {
                    persisted: format!("{persisted_authority}:{remote_path}"),
                    safe_display: format!("{host}:{remote_path}"),
                    credential_expectation: ConnectRemoteCredentialExpectation::SshAgentOrKey,
                    contacts_network: true,
                });
            }
        }
    }
    Err(connect_remote_error(
        AppErrorCode::InvalidRemoteUrl,
        "That value isn't a supported remote Git URL.",
        "Use an HTTPS, SSH, Git, file, or SCP-like SSH URL.",
    ))
}

/// Removes URL userinfo plus query/fragment components before a configured
/// value can be serialized or copied into an error. SCP-like SSH and local
/// paths remain readable; their raw values are never used as display data.
pub(crate) fn redact_remote_url(url: &str) -> String {
    let without_suffix = url.split(['?', '#']).next().unwrap_or_default();
    let Some(scheme_end) = without_suffix.find("://") else {
        return without_suffix.to_string();
    };
    let authority_start = scheme_end + 3;
    let tail = &without_suffix[authority_start..];
    let authority_end = tail.find('/').unwrap_or(tail.len());
    let authority = &tail[..authority_end];
    match authority.rfind('@') {
        Some(at) => format!("{}{}", &without_suffix[..authority_start], &tail[at + 1..]),
        None => without_suffix.to_string(),
    }
}

pub(crate) fn parse_remote_v_output(output: &str) -> Vec<RemoteInfo> {
    let mut remotes = Vec::new();
    for line in output.lines() {
        let Some((name, rest)) = line.split_once('\t') else {
            continue;
        };
        let Some(url) = rest.strip_suffix(" (fetch)") else {
            continue;
        };
        remotes.push(RemoteInfo {
            name: name.to_string(),
            url: redact_remote_url(url),
        });
    }
    remotes
}

pub(crate) fn list_configured_remotes(path: &str) -> Result<Vec<ConfiguredRemote>, AppError> {
    let output = checked_git_stdout(run_git(path, &["remote", "-v"])?)?;
    Ok(parse_remote_v_output(&output)
        .into_iter()
        .map(|info| ConfiguredRemote { info })
        .collect())
}

pub(crate) fn list_remotes(path: &str) -> Result<Vec<RemoteInfo>, AppError> {
    Ok(list_configured_remotes(path)?
        .into_iter()
        .map(|remote| remote.info)
        .collect())
}

/// A configured remote as the project's own settings need to see it.
///
/// `RemoteInfo` stays the minimal presentation value Publish and project
/// creation share. This carries the two extra facts that only matter when the
/// URL is being *edited*: whether the stored value hides parts the display
/// cannot show, and whether pushing goes somewhere else entirely.
#[derive(serde::Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectRemote {
    pub(crate) name: String,
    /// Redacted fetch URL. The raw configured value never crosses IPC.
    pub(crate) url: String,
    /// Redacted push URL, and only when it differs from the fetch one — so the
    /// panel never implies one field governs both.
    pub(crate) push_url: Option<String>,
    /// True when the stored URL carries userinfo or a query the display drops.
    /// Saving the displayed text would silently delete a password or token, so
    /// the panel has to say so before the user replaces it.
    pub(crate) has_hidden_credentials: bool,
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectRemotes {
    pub(crate) remotes: Vec<ProjectRemote>,
    /// The remote the current branch publishes to, when it has one.
    pub(crate) upstream_remote: Option<String>,
}

fn hides_stored_parts(raw: &str) -> bool {
    redact_remote_url(raw) != raw
}

/// `git remote -v` prints one line per direction. Pairing them is what lets a
/// separate push URL be reported instead of quietly ignored.
pub(crate) fn parse_project_remotes(output: &str) -> Vec<ProjectRemote> {
    let mut remotes: Vec<ProjectRemote> = Vec::new();
    let mut fetch_urls: Vec<String> = Vec::new();
    for line in output.lines() {
        let Some((name, rest)) = line.split_once('\t') else {
            continue;
        };
        let (raw_url, is_fetch) = match rest.rsplit_once(' ') {
            Some((url, "(fetch)")) => (url, true),
            Some((url, "(push)")) => (url, false),
            _ => continue,
        };
        if is_fetch {
            remotes.push(ProjectRemote {
                name: name.to_string(),
                url: redact_remote_url(raw_url),
                push_url: None,
                has_hidden_credentials: hides_stored_parts(raw_url),
            });
            fetch_urls.push(raw_url.to_string());
            continue;
        }
        let Some(index) = remotes.iter().position(|remote| remote.name == name) else {
            continue;
        };
        if fetch_urls[index] != raw_url {
            remotes[index].push_url = Some(redact_remote_url(raw_url));
            remotes[index].has_hidden_credentials |= hides_stored_parts(raw_url);
        }
    }
    remotes
}

/// The remote the checked-out branch publishes to, or `None` when it has
/// no upstream or HEAD is detached. Read from the branch's own configuration
/// rather than guessed from the remote list, which would be wrong the moment a
/// project has two.
fn current_upstream_remote(path: &str) -> Option<String> {
    let head = run_git(path, &["symbolic-ref", "--quiet", "HEAD"]).ok()?;
    if !head.status.success() {
        return None;
    }
    let reference = git_stdout(&head);
    let branch = reference.strip_prefix("refs/heads/")?;
    if branch.is_empty() {
        return None;
    }
    let configured = run_git(
        path,
        &["config", "--get", &format!("branch.{branch}.remote")],
    )
    .ok()?;
    if !configured.status.success() {
        return None;
    }
    let remote = git_stdout(&configured);
    (!remote.is_empty()).then_some(remote)
}

pub(crate) fn project_remotes(path: &str) -> Result<ProjectRemotes, AppError> {
    let output = checked_git_stdout(run_git(path, &["remote", "-v"])?)?;
    let remotes = parse_project_remotes(&output);
    // With no remotes there is nothing for an upstream to point at, so the two
    // processes that would answer the question are not spawned at all — the
    // panel opens on this section, and a local-only project is exactly the one
    // that would have waited for an answer it could not use.
    let upstream_remote = if remotes.is_empty() {
        None
    } else {
        current_upstream_remote(path)
    };
    Ok(ProjectRemotes {
        remotes,
        upstream_remote,
    })
}

pub(crate) fn read_project_remotes(path: String) -> Result<ProjectRemotes, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "read_project_remotes", None)?;
    project_remotes(&path)
}

/// The hosting service a remote's address names, as far as its host says.
#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub(crate) enum RemoteHomeProvider {
    Github,
    Gitlab,
    Bitbucket,
    Azure,
    Other,
}

/// Where the project lives, as Overview's header names it: the service and
/// the `owner/name` path of the remote the current branch publishes to (else
/// `origin`, else the first one). Read from the raw configured address here,
/// so the label and the page `remote_web_page` opens come from one reading;
/// neither carries userinfo, a query or a fragment.
#[derive(serde::Serialize, Debug, PartialEq, Eq, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteHome {
    pub(crate) remote: String,
    pub(crate) provider: RemoteHomeProvider,
    /// `owner/name` (with GitLab's groups), or the folder of a local remote.
    pub(crate) label: String,
    /// Whether a web page can be derived for it and opened.
    pub(crate) has_web_page: bool,
}

/// What a remote address says about where it lives.
#[derive(Debug, PartialEq, Eq)]
struct RemoteAddress {
    provider: RemoteHomeProvider,
    label: String,
    web_page: Option<String>,
}

fn remote_home_provider(host: &str) -> RemoteHomeProvider {
    let host = host.to_ascii_lowercase();
    if host == "github.com" || host == "www.github.com" {
        RemoteHomeProvider::Github
    } else if host == "gitlab.com" || host.starts_with("gitlab.") {
        RemoteHomeProvider::Gitlab
    } else if host == "dev.azure.com" {
        RemoteHomeProvider::Azure
    } else if host == "bitbucket.org" {
        RemoteHomeProvider::Bitbucket
    } else {
        RemoteHomeProvider::Other
    }
}

/// A repository path as hosting services lay it out: plain segments, no
/// empty or dot-only parts, the `.git` suffix dropped.
fn hosted_path(path: &str) -> Option<String> {
    let trimmed = path.trim_matches('/');
    let trimmed = trimmed.strip_suffix(".git").unwrap_or(trimmed);
    let segments: Vec<&str> = trimmed.split('/').collect();
    let valid = segments.iter().all(|segment| {
        !segment.is_empty()
            && *segment != "."
            && *segment != ".."
            && segment
                .chars()
                .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | '~'))
    });
    valid.then(|| segments.join("/"))
}

/// Reads a configured remote address. HTTP(S) pages are the address itself;
/// SSH and SCP-like addresses get a page only on a service whose web address
/// is known to follow its SSH host, never guessed for any other server.
fn remote_address(raw: &str) -> Option<RemoteAddress> {
    let value = raw.trim().split(['?', '#']).next().unwrap_or_default();
    let (scheme, rest) = match value.split_once("://") {
        Some((scheme, rest)) => (Some(scheme.to_ascii_lowercase()), rest),
        None => (None, value),
    };
    let (authority, path, web_scheme) = match scheme.as_deref() {
        Some("https") | Some("http") => {
            let (authority, path) = rest.split_once('/')?;
            let host_port = authority.rsplit('@').next().unwrap_or(authority);
            (host_port.to_string(), path, scheme.clone())
        }
        Some("ssh") | Some("git") | Some("git+ssh") | Some("ssh+git") => {
            let (authority, path) = rest.split_once('/')?;
            let host_port = authority.rsplit('@').next().unwrap_or(authority);
            let host = host_port.split(':').next().unwrap_or(host_port);
            (host.to_string(), path, None)
        }
        Some("file") => return local_remote_address(rest),
        Some(_) => return None,
        None => {
            // SCP-like `[user@]host:path`; a Windows drive or a plain path is a
            // folder on this machine.
            let (authority, path) = match value.split_once(':') {
                Some((authority, path))
                    if authority.len() > 1 && !authority.contains(['/', '\\']) =>
                {
                    (authority, path)
                }
                _ => return local_remote_address(value),
            };
            let host = authority.rsplit('@').next().unwrap_or(authority);
            (host.to_string(), path, None)
        }
    };
    let host = authority.split(':').next().unwrap_or(&authority);
    if host.is_empty() {
        return None;
    }
    let provider = remote_home_provider(host);
    let label = hosted_path(path)?;
    // Only a plain host name (and, over HTTP(S), a numeric port) ever reaches
    // the opener: an address that bends the authority gets no page.
    let plain_host = host
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.'));
    let plain_port = authority
        .split_once(':')
        .is_none_or(|(_, port)| !port.is_empty() && port.chars().all(|c| c.is_ascii_digit()));
    let web_page = match web_scheme {
        _ if !plain_host => None,
        Some(_) if !plain_port => None,
        Some(scheme) => Some(format!(
            "{scheme}://{}/{label}",
            authority.to_ascii_lowercase()
        )),
        None if provider != RemoteHomeProvider::Other => {
            Some(format!("https://{}/{label}", host.to_ascii_lowercase()))
        }
        None => None,
    };
    Some(RemoteAddress {
        provider,
        label,
        web_page,
    })
}

fn local_remote_address(path: &str) -> Option<RemoteAddress> {
    let leaf = path
        .trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default();
    let leaf = leaf.strip_suffix(".git").unwrap_or(leaf);
    (!leaf.is_empty()).then(|| RemoteAddress {
        provider: RemoteHomeProvider::Other,
        label: leaf.to_string(),
        web_page: None,
    })
}

/// Each remote's name and raw fetch address, in `git remote -v` order. The
/// raw values stay on this side of IPC.
fn raw_fetch_urls(output: &str) -> Vec<(String, String)> {
    output
        .lines()
        .filter_map(|line| {
            let (name, rest) = line.split_once('\t')?;
            let url = rest.strip_suffix(" (fetch)")?;
            Some((name.to_string(), url.to_string()))
        })
        .collect()
}

pub(crate) fn read_remote_home(path: String) -> Result<Option<RemoteHome>, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "read_remote_home", None)?;
    let output = checked_git_stdout(run_git(&path, &["remote", "-v"])?)?;
    let remotes = raw_fetch_urls(&output);
    if remotes.is_empty() {
        return Ok(None);
    }
    let upstream = current_upstream_remote(&path);
    let (name, url) = upstream
        .and_then(|name| remotes.iter().find(|(remote, _)| *remote == name))
        .or_else(|| remotes.iter().find(|(remote, _)| remote == "origin"))
        .unwrap_or(&remotes[0]);
    // A remote whose address this cannot read (an unknown scheme, an encoded
    // path) is still a remote: it is named by its own name, with no page,
    // never reported as missing.
    Ok(Some(match remote_address(url) {
        Some(address) => RemoteHome {
            remote: name.clone(),
            provider: address.provider,
            label: address.label,
            has_web_page: address.web_page.is_some(),
        },
        None => RemoteHome {
            remote: name.clone(),
            provider: RemoteHomeProvider::Other,
            label: name.clone(),
            has_web_page: false,
        },
    }))
}

/// The web page of one of the project's remotes, derived from its configured
/// address. The renderer names the remote; it never supplies the address.
pub(crate) fn remote_web_page(path: &str, remote: &str) -> Result<String, AppError> {
    let output = checked_git_stdout(run_git(path, &["remote", "-v"])?)?;
    let no_page = || {
        AppError::new(
            AppErrorCode::RemoteNotFound,
            "This remote has no web page GitOdile can open.",
        )
        .with_remediation("Open the project's settings to see its remotes.")
    };
    let (_, url) = raw_fetch_urls(&output)
        .into_iter()
        .find(|(name, _)| name == remote)
        .ok_or_else(no_page)?;
    remote_address(&url)
        .and_then(|address| address.web_page)
        .ok_or_else(no_page)
}

/// Points an existing remote somewhere else.
///
/// Adding, renaming and removing remotes stay out of this: the first has its
/// own planned flow, and the other two rewrite tracking refs. Changing where an
/// existing one points is the repair a mistyped or moved URL actually needs,
/// and it is verified after the write exactly as connecting one is — Git
/// reporting success is not the same as the configuration saying what GitOdile
/// intended.
pub(crate) fn set_remote_url(
    path: String,
    remote_name: String,
    remote_url: String,
) -> Result<ProjectRemotes, AppError> {
    let (_repository, _access) = application::authorize_repository(&path, "set_remote_url", None)?;
    let remote_name = remote_name.trim().to_string();
    // Membership is the check that belongs here, not the rule for a name the
    // user is inventing: these names come from Git's own listing, and applying
    // `validate_new_remote_name` refused to edit remotes GitOdile had just
    // shown — a name with a slash in it, or one over eighty characters, is
    // unusual but real, and Git made it, not the user.
    if !configured_remote_names(&path)?
        .iter()
        .any(|name| name == &remote_name)
    {
        return Err(connect_remote_error(
            AppErrorCode::RemoteNotFound,
            "This project has no remote with that name.",
            "Reopen the project's settings to see the remotes it has now.",
        ));
    }
    // The one rule membership cannot replace: a leading dash would reach Git as
    // an option rather than as the remote to change.
    if remote_name.starts_with('-') {
        return Err(connect_remote_error(
            AppErrorCode::InvalidRemoteConfiguration,
            "That remote name isn't safe to pass to Git.",
            "Rename the remote in Git before changing its address here.",
        ));
    }
    let url = normalize_connection_url(&remote_url)?;
    let updated = run_git(&path, &["remote", "set-url", &remote_name, &url.persisted])?;
    if !updated.status.success() {
        return Err(connect_remote_error(
            AppErrorCode::RemoteConnectFailed,
            "Git could not change this remote's address.",
            "No network request was made. Check .git/config and try again.",
        ));
    }
    let key = format!("remote.{remote_name}.url");
    let observed = run_git(&path, &["config", "--local", "--get-all", &key])?;
    let observed_text = git_stdout(&observed);
    let observed_urls: Vec<_> = observed_text.lines().collect();
    if !observed.status.success() || observed_urls != [url.persisted.as_str()] {
        return Err(connect_remote_error(
            AppErrorCode::RemoteConnectUncertain,
            "Git changed remote configuration, but GitOdile could not verify its exact URL.",
            "Inspect .git/config before publishing again. GitOdile did not contact the network.",
        ));
    }
    project_remotes(&path)
}

fn validate_new_remote_name(name: &str) -> Result<String, AppError> {
    let name = name.trim();
    if name.is_empty()
        || name.len() > 80
        || name.starts_with(['-', '.'])
        || name.ends_with('.')
        || name == ".."
        || !name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(connect_remote_error(
            AppErrorCode::InvalidRemoteConfiguration,
            "That remote name isn't safe.",
            "Use letters, numbers, dots, dashes, or underscores; origin is the usual name.",
        ));
    }
    Ok(name.to_string())
}

fn local_remote_config_snapshot(path: &str) -> Result<Vec<u8>, AppError> {
    let output = run_git(
        path,
        &["config", "--local", "--null", "--get-regexp", "^remote\\."],
    )?;
    if output.status.success() || output.status.code() == Some(1) {
        Ok(output.stdout)
    } else {
        Err(connect_remote_error(
            AppErrorCode::InvalidRemoteConfiguration,
            "GitOdile couldn't inspect the project's existing remote configuration.",
            "Check .git/config and try again.",
        ))
    }
}

fn configured_remote_names(path: &str) -> Result<Vec<String>, AppError> {
    let output = run_git(path, &["remote"])?;
    if !output.status.success() {
        return Err(connect_remote_error(
            AppErrorCode::InvalidRemoteConfiguration,
            "GitOdile couldn't inspect this project's remotes.",
            "Check the repository configuration and try again.",
        ));
    }
    Ok(git_stdout(&output)
        .lines()
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
        .collect())
}

#[derive(Debug)]
struct ValidatedConnectRemote {
    remote_name: String,
    url: NormalizedConnectionUrl,
    state_token: String,
}

fn validate_connect_remote(
    path: &str,
    session_epoch: &str,
    repository_identity: &str,
    remote_name: &str,
    remote_url: &str,
) -> Result<ValidatedConnectRemote, AppError> {
    let remote_name = validate_new_remote_name(remote_name)?;
    let url = normalize_connection_url(remote_url)?;
    let names = configured_remote_names(path)?;
    if names
        .iter()
        .any(|name| name.eq_ignore_ascii_case(&remote_name))
    {
        return Err(connect_remote_error(
            AppErrorCode::RemoteNameExists,
            "A remote with this name already exists or differs only by letter case.",
            "Keep the existing configuration unchanged or choose another remote name.",
        ));
    }
    let snapshot = local_remote_config_snapshot(path)?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    repository_identity.hash(&mut hasher);
    session_epoch.hash(&mut hasher);
    remote_name.hash(&mut hasher);
    url.persisted.hash(&mut hasher);
    snapshot.hash(&mut hasher);
    Ok(ValidatedConnectRemote {
        remote_name,
        url,
        state_token: format!("{:016x}", hasher.finish()),
    })
}

pub(crate) fn plan_connect_remote(
    path: String,
    session_epoch: String,
    remote_name: String,
    remote_url: String,
) -> Result<ConnectRemotePlan, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "plan_connect_remote", None)?;
    let validated = validate_connect_remote(
        &path,
        &session_epoch,
        repository.common_git_dir.match_key(),
        &remote_name,
        &remote_url,
    )?;
    Ok(ConnectRemotePlan {
        operation_kind: OperationKind::LocalMutation,
        requires_confirmation: true,
        project_id: path,
        session_epoch,
        state_token: validated.state_token,
        remote_name: validated.remote_name,
        fetch_url_display: validated.url.safe_display.clone(),
        push_url_display: validated.url.safe_display,
        credential_expectation: validated.url.credential_expectation,
        contacts_network: false,
        future_network_access: validated.url.contacts_network,
        changes_remote: false,
        preserves_existing_config: true,
    })
}

pub(crate) fn connect_remote(
    path: String,
    session_epoch: String,
    remote_name: String,
    remote_url: String,
    state_token: String,
) -> Result<ConnectRemoteResult, AppError> {
    let (repository, _access) = application::authorize_repository(&path, "connect_remote", None)?;
    let validated = validate_connect_remote(
        &path,
        &session_epoch,
        repository.common_git_dir.match_key(),
        &remote_name,
        &remote_url,
    )?;
    if validated.state_token != state_token {
        return Err(connect_remote_error(
            AppErrorCode::StaleConnectRemotePlan,
            "The project, remote name, or URL changed after the preview.",
            "Review the remote connection again.",
        ));
    }
    let added = run_git(
        &path,
        &[
            "remote",
            "add",
            &validated.remote_name,
            &validated.url.persisted,
        ],
    )?;
    if !added.status.success() {
        return Err(connect_remote_error(
            AppErrorCode::RemoteConnectFailed,
            "Git could not add this remote configuration.",
            "No network request was made. Check .git/config and review the connection again.",
        ));
    }
    let key = format!("remote.{}.url", validated.remote_name);
    let observed = run_git(&path, &["config", "--local", "--get-all", &key])?;
    let observed_text = git_stdout(&observed);
    let observed_urls: Vec<_> = observed_text.lines().collect();
    if !observed.status.success() || observed_urls != [validated.url.persisted.as_str()] {
        return Err(connect_remote_error(
            AppErrorCode::RemoteConnectUncertain,
            "Git added remote configuration, but GitOdile could not verify its exact URL.",
            "Inspect .git/config before editing or retrying this remote. GitOdile did not contact the network.",
        ));
    }
    Ok(ConnectRemoteResult {
        project_id: path,
        session_epoch,
        remote_name: validated.remote_name,
    })
}

pub(crate) fn discover_remotes(path: String) -> Result<RemoteDiscovery, AppError> {
    let (_repository, _access) =
        application::authorize_repository(&path, "discover_remotes", None)?;
    let status = read_working_tree_status(path.clone())?;
    Ok(RemoteDiscovery {
        remotes: list_remotes(&path)?,
        branch: status.upstream.branch,
        upstream: status.upstream.upstream,
    })
}

/// Publish may propose its single configured remote. Team checking never calls
/// this function: inbound sync requires the exact configured upstream below.
pub(crate) fn resolve_remote_selection(
    remotes: &[RemoteInfo],
    upstream: Option<&str>,
    requested: Option<&str>,
) -> Result<String, AppError> {
    if let Some(name) = requested {
        return if remotes.iter().any(|remote| remote.name == name) {
            Ok(name.to_string())
        } else {
            Err(AppError::new(
                AppErrorCode::NoRemoteConfigured,
                "That remote isn't configured for this project anymore.",
            )
            .with_remediation("Refresh and choose a remote again."))
        };
    }
    if let Some(upstream_ref) = upstream {
        if let Some(remote) = remotes
            .iter()
            .filter(|remote| upstream_ref.starts_with(&format!("{}/", remote.name)))
            .max_by_key(|remote| remote.name.len())
        {
            return Ok(remote.name.clone());
        }
    }
    match remotes.len() {
        0 => Err(AppError::new(
            AppErrorCode::NoRemoteConfigured,
            "This project has no remote project configured yet.",
        )
        .with_remediation("Add a remote in Git, then try publishing again.")),
        1 => Ok(remotes[0].name.clone()),
        _ => Err(AppError::new(
            AppErrorCode::RemoteSelectionRequired,
            "This project has more than one remote project. Choose which one to publish to.",
        )),
    }
}

pub(crate) fn validate_remote_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() || name.starts_with('-') || name.chars().any(char::is_control) {
        return Err(AppError::new(
            AppErrorCode::InvalidSelection,
            "That remote project has an unsafe name.",
        )
        .with_remediation("Rename the remote in Git, then try again."));
    }
    Ok(())
}

pub(crate) fn destination_for_remote(
    upstream: Option<&str>,
    remote: &str,
    local_branch: &str,
) -> String {
    upstream
        .and_then(|upstream| upstream.strip_prefix(&format!("{remote}/")))
        .filter(|branch| !branch.is_empty())
        .unwrap_or(local_branch)
        .to_string()
}

pub(crate) fn run_git_networked(
    repo_path: &str,
    args: &[String],
    timeout: Duration,
) -> Result<NetworkOutput, AppError> {
    let mut policy = application::current_policy()
        .unwrap_or_else(|| git::ExecutionPolicy::repository_read("network_git"));
    policy.timeout = timeout;
    let cancellation = application::current_cancellation();
    let subcommand = diagnostics::safe_git_subcommand(args.first().map(String::as_ref));
    let started = Instant::now();
    let result = git::run_with_env(
        Some(Path::new(repo_path)),
        crate::git_command::prepare_transfer_args(
            Some(Path::new(repo_path)),
            &args
                .iter()
                .map(std::ffi::OsString::from)
                .collect::<Vec<_>>(),
        )?,
        &[("GIT_TERMINAL_PROMPT", "0")],
        policy,
        cancellation.as_ref(),
    );
    match result {
        Ok(output) => {
            diagnostics::record_git(
                policy.class,
                policy.command,
                subcommand,
                output.status.code(),
                started.elapsed().as_millis(),
                Some(&output.stderr),
            );
            Ok(NetworkOutput {
                status: Some(output.status),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                timed_out: false,
            })
        }
        Err(error) if error.message.contains("too long") => {
            diagnostics::record_git(
                policy.class,
                policy.command,
                subcommand,
                None,
                started.elapsed().as_millis(),
                None,
            );
            Ok(NetworkOutput {
                status: None,
                stdout: String::new(),
                stderr: String::new(),
                timed_out: true,
            })
        }
        Err(error) => {
            diagnostics::record_git(
                policy.class,
                policy.command,
                subcommand,
                None,
                started.elapsed().as_millis(),
                None,
            );
            if error.message.contains("cancelled") {
                Err(AppError::new(
                    AppErrorCode::OperationCancelled,
                    "The remote check was cancelled.",
                ))
            } else {
                Err(error)
            }
        }
    }
}

pub(crate) fn looks_like_authentication_failure(stderr_lower: &str) -> bool {
    stderr_lower.contains("authentication failed")
        || stderr_lower.contains("could not read username")
        || stderr_lower.contains("could not read password")
        || stderr_lower.contains("permission denied (publickey")
        || stderr_lower.contains("terminal prompts disabled")
        || stderr_lower.contains("told us to quit")
        || stderr_lower.contains("403")
        || stderr_lower.contains("401")
}

pub(crate) fn looks_like_missing_remote_ref(stderr_lower: &str) -> bool {
    stderr_lower.contains("couldn't find remote ref")
        || stderr_lower.contains("couldn't find remote branch")
}

pub(crate) fn classify_remote_failure(stderr: &str) -> AppError {
    let lower = stderr.to_lowercase();
    if looks_like_missing_remote_ref(&lower) {
        return AppError::new(
            AppErrorCode::RemoteRefMissing,
            "The configured team branch no longer exists on the remote project.",
        )
        .with_remediation("Check the remote setup before trying again.");
    }
    if looks_like_authentication_failure(&lower) {
        return AppError::new(
            AppErrorCode::AuthenticationFailed,
            "GitOdile couldn't sign in to the remote project.",
        )
        .with_remediation(
            "Check the project's selected account or existing Git credentials, then try again.",
        )
        .with_detail(truncate_detail(stderr));
    }
    AppError::new(
        AppErrorCode::GitCommandFailed,
        "GitOdile couldn't check the remote project's latest state.",
    )
    .with_remediation("Check your connection and the remote project, then try again.")
    .with_detail(truncate_detail(stderr))
}

pub(crate) fn classify_sync(
    path: &str,
    local_sha: &str,
    remote_sha: Option<&str>,
) -> Result<SyncRelation, AppError> {
    let Some(remote_sha) = remote_sha else {
        return Ok(SyncRelation {
            ahead: 0,
            behind: 0,
            diverged: false,
        });
    };
    let range = format!("{local_sha}...{remote_sha}");
    let output = checked_git_stdout(run_git(
        path,
        &["rev-list", "--left-right", "--count", &range],
    )?)?;
    let mut parts = output.split_whitespace();
    let ahead = parts.next().and_then(|value| value.parse().ok());
    let behind = parts.next().and_then(|value| value.parse().ok());
    match (ahead, behind, parts.next()) {
        (Some(ahead), Some(behind), None) => Ok(SyncRelation {
            ahead,
            behind,
            diverged: ahead > 0 && behind > 0,
        }),
        _ => Err(AppError::new(
            AppErrorCode::GitCommandFailed,
            "Git returned an unreadable team-change comparison.",
        )),
    }
}

fn read_config_value(path: &str, key: &str) -> Result<Option<String>, AppError> {
    let output = run_git(path, &["config", "--get", key])?;
    if output.status.success() {
        Ok(Some(git_stdout(&output)))
    } else {
        Ok(None)
    }
}

fn read_config_values(path: &str, key: &str) -> Result<Vec<String>, AppError> {
    let output = run_git(path, &["config", "--get-all", key])?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::to_string)
        .collect())
}

fn map_fetch_refspec(refspec: &str, source_ref: &str) -> Option<String> {
    if refspec.starts_with('^') || refspec.starts_with('-') {
        return None;
    }
    let spec = refspec.strip_prefix('+').unwrap_or(refspec);
    let (source, destination) = spec.split_once(':')?;
    if source == source_ref {
        return Some(destination.to_string());
    }
    let (source_prefix, source_suffix) = source.split_once('*')?;
    let (destination_prefix, destination_suffix) = destination.split_once('*')?;
    let captured = source_ref
        .strip_prefix(source_prefix)?
        .strip_suffix(source_suffix)?;
    Some(format!(
        "{destination_prefix}{captured}{destination_suffix}"
    ))
}

pub(crate) fn resolve_upstream(
    path: &str,
    branch: &str,
    remotes: &[ConfiguredRemote],
) -> Result<Option<ResolvedUpstream>, AppError> {
    let remote_key = format!("branch.{branch}.remote");
    let merge_key = format!("branch.{branch}.merge");
    let (Some(remote), Some(merge_ref)) = (
        read_config_value(path, &remote_key)?,
        read_config_value(path, &merge_key)?,
    ) else {
        return Ok(None);
    };
    if remote == "."
        || !remotes
            .iter()
            .any(|candidate| candidate.info.name == remote)
    {
        return Err(AppError::new(
            AppErrorCode::InvalidRemoteConfiguration,
            "The configured upstream doesn't identify a usable remote project.",
        )
        .with_remediation("Repair this branch's upstream configuration in Git."));
    }
    validate_remote_name(&remote)?;
    let destination_branch = merge_ref
        .strip_prefix("refs/heads/")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AppError::new(
                AppErrorCode::InvalidRemoteConfiguration,
                "The configured upstream branch is invalid.",
            )
            .with_remediation("Repair this branch's upstream configuration in Git.")
        })?
        .to_string();
    validate_branch_ref_name(path, &destination_branch)?;
    let refspecs = read_config_values(path, &format!("remote.{remote}.fetch"))?;
    let (configured_refspec, tracking_ref) = refspecs
        .iter()
        .find_map(|refspec| {
            map_fetch_refspec(refspec, &merge_ref).map(|tracking| (refspec, tracking))
        })
        .ok_or_else(|| {
            AppError::new(
                AppErrorCode::InvalidRemoteConfiguration,
                "The configured upstream isn't covered by this remote's fetch mapping.",
            )
            .with_remediation("Repair this remote's fetch mapping in Git.")
        })?;
    if !tracking_ref.starts_with("refs/") || tracking_ref.chars().any(char::is_control) {
        return Err(AppError::new(
            AppErrorCode::InvalidRemoteConfiguration,
            "The configured tracking reference is invalid.",
        ));
    }
    let exact_fetch_refspec = format!(
        "{}{}:{}",
        if configured_refspec.starts_with('+') {
            "+"
        } else {
            ""
        },
        merge_ref,
        tracking_ref
    );
    Ok(Some(ResolvedUpstream {
        remote,
        destination_branch,
        tracking_ref,
        fetch_refspec: exact_fetch_refspec,
    }))
}

pub(crate) fn resolve_commit(path: &str, reference: &str) -> Result<Option<String>, AppError> {
    let output = run_git(
        path,
        &["rev-parse", "--verify", &format!("{reference}^{{commit}}")],
    )?;
    Ok(output.status.success().then(|| git_stdout(&output)))
}

/// The one shared fetch implementation. An upstream check passes its exact
/// configured fetch refspec so the intended tracking ref is updated. Publish
/// without tracking passes the destination source ref and reads FETCH_HEAD.
pub(crate) fn fetch_remote_target(
    path: &str,
    remote: &str,
    refspec: &str,
) -> Result<String, AppError> {
    validate_remote_name(remote)?;
    if refspec.is_empty() || refspec.starts_with('-') || refspec.chars().any(char::is_control) {
        return Err(AppError::new(
            AppErrorCode::InvalidRemoteConfiguration,
            "The configured remote branch mapping is invalid.",
        ));
    }
    let args = vec![
        "fetch".to_string(),
        "--no-prune".to_string(),
        "--no-prune-tags".to_string(),
        remote.to_string(),
        refspec.to_string(),
    ];
    let output = run_git_networked(path, &args, NETWORK_TIMEOUT)?;
    if output.timed_out {
        return Err(AppError::new(
            AppErrorCode::NetworkTimeout,
            "GitOdile couldn't reach the remote project in time.",
        )
        .with_remediation("Check your connection and try again."));
    }
    let status = output.status.ok_or_else(|| {
        AppError::new(
            AppErrorCode::GitCommandFailed,
            "GitOdile couldn't confirm the remote check.",
        )
    })?;
    if !status.success() {
        return Err(classify_remote_failure(&output.stderr));
    }
    checked_git_stdout(run_git(path, &["rev-parse", "FETCH_HEAD"])?)
}

pub(super) fn relation_state(relation: &SyncRelation) -> TeamSyncState {
    match (relation.ahead, relation.behind) {
        (0, 0) => TeamSyncState::UpToDate,
        (_, 0) => TeamSyncState::Ahead,
        (0, _) => TeamSyncState::Behind,
        _ => TeamSyncState::Diverged,
    }
}

fn actions_for(state: TeamSyncState, knowledge: SyncKnowledge) -> Vec<SyncNextAction> {
    let mut actions = match state {
        TeamSyncState::Ahead => vec![SyncNextAction::PublishChanges],
        TeamSyncState::Behind | TeamSyncState::Diverged => vec![SyncNextAction::ReviewAndGet],
        _ => Vec::new(),
    };
    if knowledge == SyncKnowledge::Cached
        || matches!(
            state,
            TeamSyncState::UpToDate
                | TeamSyncState::UpstreamGone
                | TeamSyncState::NoRemote
                | TeamSyncState::NoUpstream
        )
    {
        actions.push(SyncNextAction::CheckAgain);
    }
    actions
}

fn compute_team_sync_state_token(
    repository_identity: &str,
    session_epoch: &str,
    branch: Option<&str>,
    local_commit: Option<&str>,
    target: Option<&ResolvedUpstream>,
    remote_commit: Option<&str>,
) -> String {
    use std::hash::{Hash, Hasher};
    let fingerprint = format!(
        "repository:{repository_identity}|epoch:{session_epoch}|branch:{}|local:{}|remote:{}|destination:{}|tracking:{}|remote_commit:{}|",
        branch.unwrap_or("none"),
        local_commit.unwrap_or("none"),
        target.map(|value| value.remote.as_str()).unwrap_or("none"),
        target
            .map(|value| value.destination_branch.as_str())
            .unwrap_or("none"),
        target
            .map(|value| value.tracking_ref.as_str())
            .unwrap_or("none"),
        remote_commit.unwrap_or("none")
    );
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    fingerprint.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn base_status(
    repository_identity: &str,
    session_epoch: &str,
    state: TeamSyncState,
    branch: Option<String>,
    local_commit: Option<String>,
    knowledge: SyncKnowledge,
) -> TeamSyncStatus {
    TeamSyncStatus {
        state,
        local_branch: branch.clone(),
        local_commit: local_commit.clone(),
        upstream_remote: None,
        destination_branch: None,
        tracking_ref: None,
        remote_commit: None,
        ahead: 0,
        behind: 0,
        knowledge,
        checked_at: None,
        warnings: Vec::new(),
        next_actions: actions_for(state, knowledge),
        state_token: compute_team_sync_state_token(
            repository_identity,
            session_epoch,
            branch.as_deref(),
            local_commit.as_deref(),
            None,
            None,
        ),
        forecast: None,
    }
}

pub(super) fn read_team_sync_status_inner(
    path: &str,
    session_epoch: &str,
    knowledge: SyncKnowledge,
    perform_fetch: bool,
    repository_identity: &str,
) -> Result<TeamSyncStatus, AppError> {
    let working = read_working_tree_status(path.to_string())?;
    let branch = working.upstream.branch.clone();
    let (head_state, local_commit) = resolve_head_state(path, branch.clone())?;
    // Until an actual fetch and ancestry comparison succeeds, the answer is
    // local knowledge even when reached from the explicit check command.
    let local_knowledge = SyncKnowledge::Cached;
    if head_state == HeadState::Detached {
        return Ok(base_status(
            repository_identity,
            session_epoch,
            TeamSyncState::Detached,
            None,
            local_commit,
            local_knowledge,
        ));
    }
    if head_state == HeadState::Unborn {
        return Ok(base_status(
            repository_identity,
            session_epoch,
            TeamSyncState::Unborn,
            branch,
            None,
            local_knowledge,
        ));
    }
    let branch = branch.expect("a named non-detached head has a branch");
    let local_commit = local_commit.expect("a non-unborn head has a commit");
    let remotes = list_configured_remotes(path)?;
    if remotes.is_empty() {
        return Ok(base_status(
            repository_identity,
            session_epoch,
            TeamSyncState::NoRemote,
            Some(branch),
            Some(local_commit),
            local_knowledge,
        ));
    }
    let Some(target) = resolve_upstream(path, &branch, &remotes)? else {
        return Ok(base_status(
            repository_identity,
            session_epoch,
            TeamSyncState::NoUpstream,
            Some(branch),
            Some(local_commit),
            local_knowledge,
        ));
    };

    // A remote that no longer has the branch is an answer, not a failure: the
    // branch's upstream is gone. The explicit no-prune policy keeps the last
    // known tracking ref, which is reported but never compared against.
    let (fetched_commit, remote_branch_missing) = if perform_fetch {
        match fetch_remote_target(path, &target.remote, &target.fetch_refspec) {
            Ok(commit) => (Some(commit), false),
            Err(error) if error.code == AppErrorCode::RemoteRefMissing => (None, true),
            Err(error) => return Err(error),
        }
    } else {
        (None, false)
    };
    let remote_commit = resolve_commit(path, &target.tracking_ref)?.or(fetched_commit);
    let (state, relation) = match remote_commit.as_deref() {
        Some(remote_commit) if !remote_branch_missing => {
            let relation = classify_sync(path, &local_commit, Some(remote_commit))?;
            (relation_state(&relation), relation)
        }
        // A configured upstream with no tracking ref is what Git reports as
        // `[gone]`; a check that found the branch missing says the same.
        _ => (
            TeamSyncState::UpstreamGone,
            SyncRelation {
                ahead: 0,
                behind: 0,
                diverged: false,
            },
        ),
    };
    let forecast = match (state, remote_commit.as_deref()) {
        (TeamSyncState::Behind | TeamSyncState::Diverged, Some(remote_commit)) => {
            forecast_incoming(path, &local_commit, remote_commit, &relation)
        }
        _ => None,
    };
    let checked_at = perform_fetch.then(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .min(u128::from(u64::MAX)) as u64
    });
    Ok(TeamSyncStatus {
        state,
        local_branch: Some(branch.clone()),
        local_commit: Some(local_commit.clone()),
        upstream_remote: Some(target.remote.clone()),
        destination_branch: Some(target.destination_branch.clone()),
        tracking_ref: Some(target.tracking_ref.clone()),
        remote_commit: remote_commit.clone(),
        ahead: relation.ahead,
        behind: relation.behind,
        knowledge,
        checked_at,
        warnings: Vec::new(),
        next_actions: actions_for(state, knowledge),
        state_token: compute_team_sync_state_token(
            repository_identity,
            session_epoch,
            Some(&branch),
            Some(&local_commit),
            Some(&target),
            remote_commit.as_deref(),
        ),
        forecast,
    })
}

pub(crate) fn read_team_sync_status(
    path: String,
    session_epoch: String,
) -> Result<TeamSyncStatus, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "read_team_sync_status", None)?;
    let identity = repository.common_git_dir.match_key().to_string();
    read_team_sync_status_inner(
        &path,
        &session_epoch,
        SyncKnowledge::Cached,
        false,
        &identity,
    )
}

pub(crate) fn check_team_changes(
    path: String,
    session_epoch: String,
) -> Result<TeamSyncStatus, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "check_team_changes", None)?;
    let identity = repository.common_git_dir.match_key().to_string();
    read_team_sync_status_inner(&path, &session_epoch, SyncKnowledge::Fresh, true, &identity)
}

/// Local mutation, chosen by the person for a branch whose remote branch is
/// gone: forget which remote branch the current branch tracks. Only the branch's
/// own `branch.<name>.remote` and `.merge` entries change — the same pair a
/// first publish writes — so publishing again reconnects it. Files, history
/// and the kept tracking ref are untouched.
pub(crate) fn stop_tracking_remote(
    path: String,
    session_epoch: String,
) -> Result<TeamSyncStatus, AppError> {
    let (repository, _access) =
        application::authorize_repository(&path, "stop_tracking_remote", None)?;
    let identity = repository.common_git_dir.match_key().to_string();
    let working = read_working_tree_status(path.clone())?;
    let (head_state, _) = resolve_head_state(&path, working.upstream.branch.clone())?;
    let Some(branch) = working
        .upstream
        .branch
        .filter(|_| head_state == HeadState::Branch)
    else {
        return Err(AppError::new(
            AppErrorCode::DetachedHead,
            "This project isn't on a branch right now.",
        )
        .with_remediation("Switch to a branch first."));
    };
    validate_branch_ref_name(&path, &branch)?;
    if read_config_value(&path, &format!("branch.{branch}.merge"))?.is_none() {
        return Err(AppError::new(
            AppErrorCode::InvalidRemoteConfiguration,
            "This branch doesn't follow a remote branch.",
        ));
    }
    let output = run_git(&path, &["branch", "--unset-upstream", &branch])?;
    if !output.status.success() {
        return Err(AppError::new(
            AppErrorCode::GitConfigWriteFailed,
            "GitOdile couldn't stop this branch from following its remote branch.",
        )
        .with_remediation("Check that the project's Git configuration can be written."));
    }
    read_team_sync_status_inner(
        &path,
        &session_epoch,
        SyncKnowledge::Cached,
        false,
        &identity,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fetch_refspec_mapping_is_exact_and_wildcard_aware() {
        assert_eq!(
            map_fetch_refspec(
                "+refs/heads/*:refs/remotes/team/*",
                "refs/heads/feature/niño"
            ),
            Some("refs/remotes/team/feature/niño".to_string())
        );
        assert_eq!(
            map_fetch_refspec(
                "refs/heads/main:refs/remotes/review/main",
                "refs/heads/main"
            ),
            Some("refs/remotes/review/main".to_string())
        );
        assert_eq!(
            map_fetch_refspec("^refs/heads/private", "refs/heads/private"),
            None
        );
    }

    #[test]
    fn display_redaction_handles_supported_and_malformed_remote_forms() {
        assert_eq!(
            redact_remote_url("https://alice:secret@example.test/repo.git?token=abc#fragment"),
            "https://example.test/repo.git"
        );
        assert_eq!(
            redact_remote_url("ssh://key@example.test/repo.git#private"),
            "ssh://example.test/repo.git"
        );
        assert_eq!(
            redact_remote_url("git@example.test:org/répô.git"),
            "git@example.test:org/répô.git"
        );
        assert_eq!(
            redact_remote_url("file:///tmp/repo.git?credential=hidden"),
            "file:///tmp/repo.git"
        );
        assert_eq!(
            redact_remote_url("C:/repos/local.git#token"),
            "C:/repos/local.git"
        );
    }

    #[test]
    fn remote_failure_classification_is_bounded_and_secret_safe() {
        let auth = classify_remote_failure(
            "fatal: Authentication failed for https://user:secret@example.test/a?token=x",
        );
        assert_eq!(auth.code, AppErrorCode::AuthenticationFailed);
        let detail = auth.detail.unwrap_or_default();
        assert!(!detail.contains("secret"));
        assert!(!detail.contains("token"));
        assert_eq!(
            classify_remote_failure("fatal: couldn't find remote ref main").code,
            AppErrorCode::RemoteRefMissing
        );
    }

    #[test]
    fn relation_state_covers_all_ancestry_outcomes() {
        let state = |ahead, behind| {
            relation_state(&SyncRelation {
                ahead,
                behind,
                diverged: ahead > 0 && behind > 0,
            })
        };
        assert_eq!(state(0, 0), TeamSyncState::UpToDate);
        assert_eq!(state(2, 0), TeamSyncState::Ahead);
        assert_eq!(state(0, 3), TeamSyncState::Behind);
        assert_eq!(state(1, 1), TeamSyncState::Diverged);
    }

    #[test]
    fn a_fresh_up_to_date_result_can_always_be_checked_again() {
        assert_eq!(
            actions_for(TeamSyncState::UpToDate, SyncKnowledge::Fresh),
            vec![SyncNextAction::CheckAgain]
        );
    }

    #[test]
    fn status_token_changes_with_epoch_target_and_observed_remote_commit() {
        let target = ResolvedUpstream {
            remote: "origin".to_string(),
            destination_branch: "main".to_string(),
            tracking_ref: "refs/remotes/origin/main".to_string(),
            fetch_refspec: "+refs/heads/*:refs/remotes/origin/*".to_string(),
        };
        let first = compute_team_sync_state_token(
            "repo",
            "epoch-a",
            Some("main"),
            Some("aaa"),
            Some(&target),
            Some("bbb"),
        );
        assert_ne!(
            first,
            compute_team_sync_state_token(
                "repo",
                "epoch-b",
                Some("main"),
                Some("aaa"),
                Some(&target),
                Some("bbb"),
            )
        );
        assert_ne!(
            first,
            compute_team_sync_state_token(
                "repo",
                "epoch-a",
                Some("main"),
                Some("aaa"),
                Some(&target),
                Some("ccc"),
            )
        );
    }

    #[test]
    fn remote_home_reads_hosted_addresses_and_derives_pages() {
        let github = remote_address("https://alice:secret@github.com/acme/app.git?x=1#y").unwrap();
        assert_eq!(github.provider, RemoteHomeProvider::Github);
        assert_eq!(github.label, "acme/app");
        assert_eq!(
            github.web_page.as_deref(),
            Some("https://github.com/acme/app")
        );

        let scp = remote_address("git@github.com:acme/app.git").unwrap();
        assert_eq!(scp.label, "acme/app");
        assert_eq!(scp.web_page.as_deref(), Some("https://github.com/acme/app"));

        let gitlab = remote_address("ssh://git@gitlab.com:2222/group/sub/app.git").unwrap();
        assert_eq!(gitlab.provider, RemoteHomeProvider::Gitlab);
        assert_eq!(gitlab.label, "group/sub/app");
        assert_eq!(
            gitlab.web_page.as_deref(),
            Some("https://gitlab.com/group/sub/app")
        );

        let bitbucket = remote_address("https://bitbucket.org/team/repo").unwrap();
        assert_eq!(bitbucket.provider, RemoteHomeProvider::Bitbucket);

        // A company server over HTTPS keeps its own address, port included.
        let company = remote_address("https://git.example.test:8443/team/repo.git").unwrap();
        assert_eq!(company.provider, RemoteHomeProvider::Other);
        assert_eq!(
            company.web_page.as_deref(),
            Some("https://git.example.test:8443/team/repo")
        );
    }

    #[test]
    fn remote_home_never_guesses_a_page_for_unknown_ssh_or_local_remotes() {
        let ssh = remote_address("git@git.example.test:team/repo.git").unwrap();
        assert_eq!(ssh.provider, RemoteHomeProvider::Other);
        assert_eq!(ssh.label, "team/repo");
        assert_eq!(ssh.web_page, None);

        let local = remote_address("C:\\work\\shared\\app.git").unwrap();
        assert_eq!(local.label, "app");
        assert_eq!(local.web_page, None);
        let file = remote_address("file:///srv/git/app.git").unwrap();
        assert_eq!(file.label, "app");
        assert_eq!(file.web_page, None);

        assert_eq!(remote_address("https://github.com/acme/../app"), None);
        // An authority that is not a plain host and port gets no page.
        let odd = remote_address("https://git.example.test:80x/team/repo").unwrap();
        assert_eq!(odd.web_page, None);
        let spaced = remote_address("https://git example.test/team/repo").unwrap();
        assert_eq!(spaced.web_page, None);
        assert_eq!(
            remote_address("javascript:alert(1)").and_then(|a| a.web_page),
            None
        );
    }

    #[test]
    fn raw_fetch_urls_pairs_names_with_fetch_addresses_only() {
        let output = "origin\thttps://github.com/acme/app.git (fetch)\norigin\tgit@github.com:acme/app.git (push)\nfork\tgit@github.com:me/app.git (fetch)\n";
        assert_eq!(
            raw_fetch_urls(output),
            vec![
                (
                    "origin".to_string(),
                    "https://github.com/acme/app.git".to_string()
                ),
                ("fork".to_string(), "git@github.com:me/app.git".to_string()),
            ]
        );
    }
}
