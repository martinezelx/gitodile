//! Persistent recovery workflows.
//!
//! Three owners live here, and they are deliberately separate files rather
//! than one flat module. [`discard`] snapshots working-tree changes into the
//! worktree's `.git` directory (ADR 0007); [`history`] preserves a pre-rewrite
//! branch tip as a hidden ref (ADR 0008); [`conflict`] preserves a paused
//! operation's unmerged stages and working content before its first change
//! (ADR 0041). They share the clock and worktree owner ID; this parent also
//! coordinates retention protection for a merge start that names a history
//! recovery ref. Before the split the first two shared a namespace, which is why
//! the history half had to prefix every helper with `history_` to avoid
//! colliding with its neighbour.

mod conflict;
mod discard;
mod history;

pub(crate) use conflict::*;
pub(crate) use discard::*;
pub(crate) use history::*;

use crate::repository_access::RepositoryContext;
use std::time::{SystemTime, UNIX_EPOCH};

/// Cross-owner retention policy stays at the parent boundary: history never
/// reads conflict manifests or imports its sibling's implementation.
fn history_recovery_is_protected(common: &std::path::Path, reference: &str) -> bool {
    conflict::merge_start_protects_history(common, reference)
}

/// Wall-clock milliseconds. Every owner stamps records with it, and all need
/// the same value shape, so it stays here rather than being duplicated.
fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0)
}

fn stable_fnv1a(value: &str) -> u64 {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Names the worktree that owns a hidden recovery ref. Refs live in the
/// common repository, so linked worktrees need distinct segments under it.
fn worktree_owner_id(repository: &RepositoryContext) -> String {
    let common = repository.common_git_dir.backend_path();
    let git_dir = repository.git_dir.backend_path();
    let relative = if git_dir == common {
        "main".to_string()
    } else {
        git_dir
            .strip_prefix(common)
            .unwrap_or(git_dir)
            .to_string_lossy()
            .replace('\\', "/")
    };
    #[cfg(target_os = "windows")]
    let relative = relative.to_lowercase();
    format!("worktree-{:016x}", stable_fnv1a(&relative))
}
