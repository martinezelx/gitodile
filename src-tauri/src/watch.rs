//! Typed, session-scoped repository invalidation events.
//!
//! Raw filesystem paths never cross IPC. Backends are normalized into a
//! bounded domain taxonomy, coalesced with a starvation ceiling, sequenced per
//! open incarnation, and checked again when a callback is delivered.

use crate::{application, error::AppError};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const REPOSITORY_CHANGED_EVENT: &str = "repository-changed";
const QUIET_PERIOD: Duration = Duration::from_millis(300);
const MAX_BURST: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Copy, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum RepositoryInvalidationKind {
    Worktree,
    HeadOrRefs,
    SharedRepository,
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepositoryInvalidation {
    pub(crate) project_id: String,
    pub(crate) session_epoch: String,
    pub(crate) sequence: u64,
    pub(crate) kind: RepositoryInvalidationKind,
}

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum BurstStep {
    Wait(Duration),
    Report,
}

pub fn burst_step(elapsed: Duration, quiet: Duration, max: Duration) -> BurstStep {
    if elapsed >= max {
        return BurstStep::Report;
    }
    BurstStep::Wait(quiet.min(max - elapsed))
}

#[derive(Clone, Debug)]
pub(crate) struct WatchPaths {
    pub(crate) worktree: Vec<PathBuf>,
    pub(crate) git_dir: Vec<PathBuf>,
    pub(crate) common_git_dir: Vec<PathBuf>,
}

impl WatchPaths {
    fn all_git_dirs(&self) -> Vec<PathBuf> {
        let mut paths = self.git_dir.clone();
        paths.extend(self.common_git_dir.iter().cloned());
        paths.sort();
        paths.dedup();
        paths
    }
}

fn portable_path_key(path: &Path) -> String {
    let mut value = path.to_string_lossy().replace('\\', "/");
    if let Some(rest) = value.strip_prefix("//?/UNC/") {
        value = format!("//{rest}");
    } else if let Some(rest) = value.strip_prefix("//?/") {
        value = rest.to_string();
    }
    if let Some(rest) = value.strip_prefix("/private/var/") {
        value = format!("/var/{rest}");
    }
    #[cfg(target_os = "windows")]
    {
        value.make_ascii_lowercase();
    }
    value.trim_end_matches('/').to_string()
}

fn relative_to_alias<'a>(path: &Path, aliases: &'a [PathBuf]) -> Option<&'a PathBuf> {
    let key = portable_path_key(path);
    aliases
        .iter()
        .filter(|alias| {
            let alias_key = portable_path_key(alias);
            key == alias_key || key.strip_prefix(&format!("{alias_key}/")).is_some()
        })
        .max_by_key(|alias| portable_path_key(alias).len())
}

fn first_component(path: &Path, base: &Path) -> Option<String> {
    let path_key = portable_path_key(path);
    let base_key = portable_path_key(base);
    path_key
        .strip_prefix(&base_key)
        .and_then(|rest| rest.trim_start_matches('/').split('/').next())
        .filter(|part| !part.is_empty())
        .map(str::to_ascii_lowercase)
}

fn is_lock(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("lock"))
}

pub(crate) fn classify_path(path: &Path, paths: &WatchPaths) -> Option<RepositoryInvalidationKind> {
    let git_match = relative_to_alias(path, &paths.git_dir);
    let common_match = relative_to_alias(path, &paths.common_git_dir);
    let most_specific = [
        git_match.map(|path| (path, false)),
        common_match.map(|path| (path, true)),
    ]
    .into_iter()
    .flatten()
    .max_by_key(|(base, _)| portable_path_key(base).len());

    if let Some((base, is_common)) = most_specific {
        if portable_path_key(path) == portable_path_key(base) || is_lock(path) {
            return None;
        }
        let first = first_component(path, base)?;
        if matches!(first.as_str(), "objects" | "logs" | "hooks" | "modules") {
            return None;
        }
        if is_common && matches!(first.as_str(), "refs" | "packed-refs" | "config") {
            return Some(RepositoryInvalidationKind::SharedRepository);
        }
        return match first.as_str() {
            "head" => Some(RepositoryInvalidationKind::HeadOrRefs),
            "index" | "merge_head" | "cherry_pick_head" | "revert_head" | "rebase_head"
            | "rebase-merge" | "rebase-apply" => Some(RepositoryInvalidationKind::Worktree),
            "refs" | "packed-refs" => Some(RepositoryInvalidationKind::HeadOrRefs),
            _ => None,
        };
    }

    relative_to_alias(path, &paths.worktree).map(|_| RepositoryInvalidationKind::Worktree)
}

type Callback = Arc<dyn Fn(RepositoryInvalidation) + Send + Sync>;

struct RepositoryWatch {
    _watcher: RecommendedWatcher,
    epoch: String,
    common_key: String,
    paths: WatchPaths,
    generation: u64,
    callback: Callback,
}

#[derive(Default)]
struct RegistryState {
    watches: HashMap<String, RepositoryWatch>,
    last_shared_report: HashMap<String, Instant>,
}

#[derive(Clone, Default)]
pub struct WatcherRegistry {
    state: Arc<Mutex<RegistryState>>,
    next_generation: Arc<AtomicU64>,
    // Registration lifetimes are shorter than renderer sessions (off/on and
    // updater suspension). A registry-wide sequence never restarts underneath
    // the renderer's per-session high-water mark.
    next_sequence: Arc<AtomicU64>,
}

impl WatcherRegistry {
    pub(crate) fn watch(
        &self,
        app: AppHandle,
        project_id: &str,
        session_epoch: &str,
        common_key: &str,
        paths: WatchPaths,
    ) -> bool {
        self.watch_with(project_id, session_epoch, common_key, paths, move |event| {
            let _ = app.emit(REPOSITORY_CHANGED_EVENT, event);
        })
    }

    pub(crate) fn watch_with<F>(
        &self,
        project_id: &str,
        session_epoch: &str,
        common_key: &str,
        paths: WatchPaths,
        on_change: F,
    ) -> bool
    where
        F: Fn(RepositoryInvalidation) + Send + Sync + 'static,
    {
        self.watch_with_callback(
            project_id,
            session_epoch,
            common_key,
            paths,
            Arc::new(on_change),
        )
    }

    fn watch_with_callback(
        &self,
        project_id: &str,
        session_epoch: &str,
        common_key: &str,
        paths: WatchPaths,
        callback: Callback,
    ) -> bool {
        self.remove_watch(project_id, None);
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed) + 1;
        let (sender, receiver) = channel::<RepositoryInvalidationKind>();
        let filter_paths = paths.clone();
        let watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
            let kinds = match result {
                Err(_) => vec![
                    RepositoryInvalidationKind::Worktree,
                    RepositoryInvalidationKind::SharedRepository,
                ],
                Ok(event) if matches!(event.kind, EventKind::Access(_)) => Vec::new(),
                Ok(event) => event
                    .paths
                    .iter()
                    .filter_map(|path| classify_path(path, &filter_paths))
                    .collect(),
            };
            for kind in kinds {
                let _ = sender.send(kind);
            }
        });
        let Ok(mut watcher) = watcher else {
            return false;
        };
        let Some(root) = paths.worktree.first() else {
            return false;
        };
        if watcher.watch(root, RecursiveMode::Recursive).is_err() {
            return false;
        }
        for git_dir in paths.all_git_dirs() {
            if git_dir.is_dir() && relative_to_alias(&git_dir, &paths.worktree).is_none() {
                let _ = watcher.watch(&git_dir, RecursiveMode::Recursive);
            }
        }

        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .watches
            .insert(
                project_id.to_string(),
                RepositoryWatch {
                    _watcher: watcher,
                    epoch: session_epoch.to_string(),
                    common_key: common_key.to_string(),
                    paths,
                    generation,
                    callback,
                },
            );

        let registry = self.clone();
        let owner = project_id.to_string();
        thread::spawn(move || {
            while let Ok(first) = receiver.recv() {
                let started = Instant::now();
                let mut kinds = BTreeSet::from([first]);
                loop {
                    match burst_step(started.elapsed(), QUIET_PERIOD, MAX_BURST) {
                        BurstStep::Report => break,
                        BurstStep::Wait(wait) => match receiver.recv_timeout(wait) {
                            Ok(kind) => {
                                kinds.insert(kind);
                            }
                            Err(RecvTimeoutError::Timeout) => break,
                            Err(RecvTimeoutError::Disconnected) => return,
                        },
                    }
                }
                registry.dispatch(&owner, generation, &kinds);
            }
        });
        true
    }

    /// Stops every app-owned filesystem watcher by dropping its native
    /// backend. The returned guard recreates the exact registrations on drop,
    /// so failed or postponed installation preparation restores normal
    /// invalidation without asking mounted screens to register again.
    pub(crate) fn suspend_all(&self) -> WatcherSuspension {
        let removed = {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state.last_shared_report.clear();
            std::mem::take(&mut state.watches)
        };
        let registrations = removed
            .into_iter()
            .map(|(project_id, watch)| WatchRegistration {
                project_id,
                epoch: watch.epoch,
                common_key: watch.common_key,
                paths: watch.paths,
                callback: watch.callback,
            })
            .collect();
        WatcherSuspension {
            registry: self.clone(),
            registrations,
        }
    }

    #[cfg(test)]
    pub(crate) fn watch_count(&self) -> usize {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .watches
            .len()
    }

    fn dispatch(&self, owner: &str, generation: u64, kinds: &BTreeSet<RepositoryInvalidationKind>) {
        let mut deliveries: Vec<(Callback, RepositoryInvalidation)> = Vec::new();
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(source) = state.watches.get(owner) else {
            return;
        };
        if source.generation != generation {
            return;
        }
        let common_key = source.common_key.clone();
        let has_shared = kinds.contains(&RepositoryInvalidationKind::SharedRepository);

        for kind in kinds {
            // A shared invalidation already asks the source worktree for the
            // full repository refresh. Collapse lesser kinds from the same
            // burst so a backend overflow or mixed save/ref change produces
            // one renderer event per affected session.
            if has_shared && *kind != RepositoryInvalidationKind::SharedRepository {
                continue;
            }
            if *kind == RepositoryInvalidationKind::SharedRepository {
                let now = Instant::now();
                if state
                    .last_shared_report
                    .get(&common_key)
                    .is_some_and(|last| now.duration_since(*last) < QUIET_PERIOD)
                {
                    continue;
                }
                state.last_shared_report.insert(common_key.clone(), now);
                for (project_id, watch) in state.watches.iter_mut() {
                    if watch.common_key == common_key {
                        deliveries.push((
                            Arc::clone(&watch.callback),
                            RepositoryInvalidation {
                                project_id: project_id.clone(),
                                session_epoch: watch.epoch.clone(),
                                sequence: self.next_sequence.fetch_add(1, Ordering::Relaxed) + 1,
                                kind: *kind,
                            },
                        ));
                    }
                }
            } else if let Some(watch) = state.watches.get_mut(owner) {
                deliveries.push((
                    Arc::clone(&watch.callback),
                    RepositoryInvalidation {
                        project_id: owner.to_string(),
                        session_epoch: watch.epoch.clone(),
                        sequence: self.next_sequence.fetch_add(1, Ordering::Relaxed) + 1,
                        kind: *kind,
                    },
                ));
            }
        }
        drop(state);
        for (callback, event) in deliveries {
            callback(event);
        }
    }

    /// Detaches the watcher registered by exactly `session_epoch`. A late
    /// request from a closed incarnation therefore cannot take down the
    /// watcher a newer one registered for the same project.
    pub(crate) fn unwatch(&self, project_id: &str, session_epoch: &str) {
        self.remove_watch(project_id, Some(session_epoch));
    }

    /// `None` means "whatever is registered for this project", which is only
    /// correct when a new registration is about to replace it.
    fn remove_watch(&self, project_id: &str, session_epoch: Option<&str>) {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let should_remove = state
            .watches
            .get(project_id)
            .is_some_and(|watch| session_epoch.is_none_or(|epoch| watch.epoch == epoch));
        if !should_remove {
            return;
        }
        let removed = state.watches.remove(project_id);
        if let Some(common_key) = removed.as_ref().map(|watch| watch.common_key.clone()) {
            if !state
                .watches
                .values()
                .any(|watch| watch.common_key == common_key)
            {
                state.last_shared_report.remove(&common_key);
            }
        }
        // Dropping a platform watcher may wait for its callback thread. Never
        // do that while holding the registry mutex a late callback needs in
        // order to observe that this generation was removed.
        drop(state);
        drop(removed);
    }

    #[cfg(test)]
    fn inject(&self, owner: &str, generation: u64, kinds: &[RepositoryInvalidationKind]) {
        self.dispatch(owner, generation, &kinds.iter().copied().collect());
    }
}

struct WatchRegistration {
    project_id: String,
    epoch: String,
    common_key: String,
    paths: WatchPaths,
    callback: Callback,
}

pub(crate) struct WatcherSuspension {
    registry: WatcherRegistry,
    registrations: Vec<WatchRegistration>,
}

impl Drop for WatcherSuspension {
    fn drop(&mut self) {
        for registration in self.registrations.drain(..) {
            self.registry.watch_with_callback(
                &registration.project_id,
                &registration.epoch,
                &registration.common_key,
                registration.paths,
                registration.callback,
            );
        }
    }
}

/// Resolves the repository once, then registers only paths that can
/// invalidate user-visible state. Raw filesystem events never cross IPC.
pub(crate) fn watch_repository(
    app: tauri::AppHandle,
    registry: tauri::State<'_, WatcherRegistry>,
    path: String,
    session_epoch: String,
) -> Result<bool, AppError> {
    let (repository, _access) = application::authorize_repository(&path, "watch_repository", None)?;
    let root = repository.worktree_root.backend_path();
    if !root.is_dir() {
        return Err(AppError::new(
            crate::error::AppErrorCode::PathMissing,
            "That folder doesn't exist.",
        )
        .with_remediation("Reopen the project and try again."));
    }

    let mut git_dir = repository.git_dir.watch_paths();
    git_dir.push(root.join(".git"));
    git_dir.sort();
    git_dir.dedup();
    Ok(registry.watch(
        app,
        &path,
        &session_epoch,
        repository.common_git_dir.match_key(),
        WatchPaths {
            worktree: repository.worktree_root.watch_paths(),
            git_dir,
            common_git_dir: repository.common_git_dir.watch_paths(),
        },
    ))
}

pub(crate) fn unwatch_repository(
    registry: tauri::State<'_, WatcherRegistry>,
    path: String,
    session_epoch: String,
) {
    registry.unwatch(&path, &session_epoch);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn paths(root: &Path) -> WatchPaths {
        WatchPaths {
            worktree: vec![root.to_path_buf()],
            git_dir: vec![root.join(".git")],
            common_git_dir: vec![root.join(".git")],
        }
    }

    #[test]
    fn taxonomy_filters_git_churn_and_lock_files() {
        let root = Path::new("/repo");
        let paths = paths(root);
        assert_eq!(
            classify_path(&root.join("src/main.rs"), &paths),
            Some(RepositoryInvalidationKind::Worktree)
        );
        assert_eq!(
            classify_path(&root.join(".git/HEAD"), &paths),
            Some(RepositoryInvalidationKind::HeadOrRefs)
        );
        assert_eq!(
            classify_path(&root.join(".git/refs/heads/main"), &paths),
            Some(RepositoryInvalidationKind::SharedRepository)
        );
        assert_eq!(
            classify_path(&root.join(".git/objects/ab/cd"), &paths),
            None
        );
        assert_eq!(classify_path(&root.join(".git/index.lock"), &paths), None);
        // A rebase steps through its own folder; GitOdile's snapshots never
        // invalidate the project they preserve.
        assert_eq!(
            classify_path(&root.join(".git/rebase-merge/msgnum"), &paths),
            Some(RepositoryInvalidationKind::Worktree)
        );
        assert_eq!(
            classify_path(&root.join(".git/gitodile/conflicts/v1/x"), &paths),
            None
        );
    }

    #[test]
    fn windows_and_macos_aliases_keep_git_churn_filtered() {
        let windows = WatchPaths {
            worktree: vec![PathBuf::from(r"C:\repo")],
            git_dir: vec![PathBuf::from(r"C:\repo\.git")],
            common_git_dir: vec![PathBuf::from(r"C:\repo\.git")],
        };
        assert_eq!(
            classify_path(Path::new(r"\\?\C:\repo\.git\objects\ab\cd"), &windows),
            None
        );
        assert_eq!(
            classify_path(Path::new(r"C:\repo\.git\refs\heads\main.lock"), &windows),
            None
        );
        let mac = WatchPaths {
            worktree: vec![PathBuf::from("/var/folders/repo")],
            git_dir: vec![PathBuf::from("/var/folders/repo/.git")],
            common_git_dir: vec![PathBuf::from("/var/folders/repo/.git")],
        };
        assert_eq!(
            classify_path(
                Path::new("/private/var/folders/repo/.git/objects/ab/cd"),
                &mac
            ),
            None
        );
        assert_eq!(
            classify_path(Path::new("/private/var/folders/repo/.git/index.lock"), &mac),
            None
        );
    }

    #[test]
    fn burst_ceiling_prevents_starvation() {
        assert_eq!(
            burst_step(MAX_BURST, QUIET_PERIOD, MAX_BURST),
            BurstStep::Report
        );
        assert_eq!(
            burst_step(
                MAX_BURST - Duration::from_millis(100),
                QUIET_PERIOD,
                MAX_BURST
            ),
            BurstStep::Wait(Duration::from_millis(100))
        );
    }

    #[test]
    fn unavailable_watcher_keeps_manual_refresh_available() {
        let registry = WatcherRegistry::default();
        let missing = crate::test_support::test_temp_root()
            .join(format!("gitodile-missing-watch-{}", std::process::id()));
        let _ = fs::remove_dir_all(&missing);
        assert!(!registry.watch_with("missing", "epoch", "common", paths(&missing), |_| {}));
    }

    fn settled_count(counter: &AtomicUsize, budget: Duration) -> usize {
        let deadline = Instant::now() + budget;
        let mut last = counter.load(Ordering::SeqCst);
        let mut unchanged_since = Instant::now();
        while Instant::now() < deadline {
            thread::sleep(Duration::from_millis(50));
            let current = counter.load(Ordering::SeqCst);
            if current != last {
                last = current;
                unchanged_since = Instant::now();
            } else if current > 0 && unchanged_since.elapsed() >= MAX_BURST + QUIET_PERIOD {
                return current;
            }
        }
        last
    }

    #[test]
    fn real_watcher_coalesces_file_writes_and_filters_git_churn() {
        let registry = WatcherRegistry::default();
        let root = crate::test_support::test_temp_root()
            .join(format!("gitodile-watch-real-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".git/objects")).unwrap();
        let count = Arc::new(AtomicUsize::new(0));
        let reported = Arc::clone(&count);
        if !registry.watch_with("project", "epoch", "common", paths(&root), move |event| {
            assert_eq!(event.project_id, "project");
            assert_eq!(event.session_epoch, "epoch");
            assert_eq!(event.kind, RepositoryInvalidationKind::Worktree);
            reported.fetch_add(1, Ordering::SeqCst);
        }) {
            let _ = fs::remove_dir_all(&root);
            return;
        }

        for index in 0..5 {
            fs::write(root.join("notes.txt"), format!("line {index}")).unwrap();
        }
        let after_write = settled_count(&count, Duration::from_secs(10));
        assert!(after_write >= 1, "a worktree write must be reported");

        fs::write(root.join(".git/objects/abcdef"), "object").unwrap();
        fs::write(root.join(".git/index.lock"), "lock").unwrap();
        let after_churn = settled_count(&count, Duration::from_secs(10));
        assert_eq!(after_churn, after_write, "Git churn must stay filtered");

        registry.unwatch("project", "epoch");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn event_sequences_survive_reregistration_and_suspension() {
        let registry = WatcherRegistry::default();
        let root = PathBuf::from(crate::test_support::unique_temp_dir(
            "watch-sequence-lifetime",
        ));
        fs::create_dir_all(root.join(".git")).unwrap();
        let (sender, receiver) = std::sync::mpsc::channel();
        let register = || {
            let sender = sender.clone();
            assert!(registry.watch_with(
                "project",
                "epoch",
                "common",
                paths(&root),
                move |event| {
                    sender.send(event.sequence).unwrap();
                }
            ));
        };
        register();
        let emit = || {
            let generation = registry.state.lock().unwrap().watches["project"].generation;
            registry.inject(
                "project",
                generation,
                &[RepositoryInvalidationKind::Worktree],
            );
            receiver.recv_timeout(Duration::from_secs(1)).unwrap()
        };
        let first = emit();
        // Off/on keeps the renderer's session epoch, as does updater resume.
        registry.unwatch("project", "epoch");
        register();
        let second = emit();
        assert!(second > first);
        drop(registry.suspend_all());
        assert!(emit() > second);
        registry.unwatch("project", "epoch");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn replacement_and_late_callbacks_cannot_reach_the_new_session() {
        let registry = WatcherRegistry::default();
        let root = crate::test_support::test_temp_root()
            .join(format!("gitodile-watch-replace-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join(".git")).unwrap();
        let old_count = Arc::new(AtomicUsize::new(0));
        let old_reported = Arc::clone(&old_count);
        if !registry.watch_with("project", "old", "common", paths(&root), move |_| {
            old_reported.fetch_add(1, Ordering::SeqCst);
        }) {
            return;
        }
        let old_generation = registry.state.lock().unwrap().watches["project"].generation;
        let new_count = Arc::new(AtomicUsize::new(0));
        let new_reported = Arc::clone(&new_count);
        assert!(
            registry.watch_with("project", "new", "common", paths(&root), move |_| {
                new_reported.fetch_add(1, Ordering::SeqCst);
            })
        );
        registry.inject(
            "project",
            old_generation,
            &[RepositoryInvalidationKind::Worktree],
        );
        assert_eq!(old_count.load(Ordering::SeqCst), 0);
        assert_eq!(new_count.load(Ordering::SeqCst), 0);
        registry.unwatch("project", "old");
        assert!(registry
            .state
            .lock()
            .unwrap()
            .watches
            .contains_key("project"));
        registry.unwatch("project", "new");
        assert!(!registry
            .state
            .lock()
            .unwrap()
            .watches
            .contains_key("project"));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn shared_changes_fan_out_once_and_sequences_are_monotonic() {
        let registry = WatcherRegistry::default();
        let first = crate::test_support::test_temp_root()
            .join(format!("gitodile-watch-a-{}", std::process::id()));
        let second = crate::test_support::test_temp_root()
            .join(format!("gitodile-watch-b-{}", std::process::id()));
        for root in [&first, &second] {
            let _ = fs::remove_dir_all(root);
            fs::create_dir_all(root.join(".git")).unwrap();
        }
        let events = Arc::new(Mutex::new(Vec::new()));
        let a_events = Arc::clone(&events);
        if !registry.watch_with("a", "ea", "shared", paths(&first), move |event| {
            a_events.lock().unwrap().push(event)
        }) {
            return;
        }
        let b_events = Arc::clone(&events);
        assert!(
            registry.watch_with("b", "eb", "shared", paths(&second), move |event| b_events
                .lock()
                .unwrap()
                .push(event))
        );
        let generation = registry.state.lock().unwrap().watches["a"].generation;
        registry.inject(
            "a",
            generation,
            &[
                RepositoryInvalidationKind::Worktree,
                RepositoryInvalidationKind::SharedRepository,
            ],
        );
        registry.inject(
            "a",
            generation,
            &[RepositoryInvalidationKind::SharedRepository],
        );
        registry.inject("a", generation, &[RepositoryInvalidationKind::Worktree]);
        let events = events.lock().unwrap();
        assert_eq!(
            events
                .iter()
                .filter(|event| event.kind == RepositoryInvalidationKind::SharedRepository)
                .count(),
            2
        );
        assert_eq!(
            events
                .iter()
                .filter(|event| event.project_id == "a"
                    && event.kind == RepositoryInvalidationKind::Worktree)
                .count(),
            1
        );
        for project in ["a", "b"] {
            let sequences = events
                .iter()
                .filter(|event| event.project_id == project)
                .map(|event| event.sequence)
                .collect::<Vec<_>>();
            assert!(sequences.windows(2).all(|pair| pair[0] < pair[1]));
        }
        drop(events);
        registry.remove_watch("a", None);
        registry.remove_watch("b", None);
        for root in [&first, &second] {
            let _ = fs::remove_dir_all(root);
        }
    }
}
