use crate::test_support::*;
use crate::*;
use crate::{application, recovery::HistoryRecoveryMetadata};
use std::fs;
use std::path::Path;

fn session(label: &str) -> String {
    format!("sync-epoch-{label}")
}

/// The app's own order: a check fetches the remote, then the plan reads it.
fn plan_after_check(repo: &str, label: &str) -> Result<GetTeamChangesPlan, AppError> {
    check_team_changes(repo.to_string(), session(label))?;
    plan_get_team_changes(repo.to_string(), session(label))
}

fn push(repo: &str, branch: &str) {
    assert!(git_command(repo)
        .args(["push", "-q", "origin", branch])
        .status()
        .unwrap()
        .success());
}

fn set_identity(repo: &str) {
    for (key, value) in [
        ("user.name", "GitOdile Test"),
        ("user.email", "test@gitodile.local"),
    ] {
        assert!(git_command(repo)
            .args(["config", key, value])
            .status()
            .unwrap()
            .success());
    }
}

fn head(repo: &str) -> String {
    git_stdout(&test_git(repo, &["rev-parse", "HEAD"]).unwrap())
}

fn read_text(repo: &str, name: &str) -> String {
    String::from_utf8_lossy(&fs::read(Path::new(repo).join(name)).unwrap()).replace("\r\n", "\n")
}

fn clone_remote(remote: &str, label: &str) -> String {
    let other = unique_temp_dir(label);
    let status = base_git_command()
        .args(["clone", "-q", remote, &other])
        .status()
        .expect("clone remote");
    assert!(status.success());
    other
}

#[test]
fn local_sync_status_covers_unborn_detached_no_remote_and_no_upstream() {
    let unborn = unique_temp_dir("sync-unborn");
    git_init(&unborn);
    let unborn_status = read_team_sync_status(unborn.clone(), session("unborn")).unwrap();
    assert_eq!(unborn_status.state, TeamSyncState::Unborn);
    assert_eq!(unborn_status.knowledge, SyncKnowledge::Cached);
    assert!(unborn_status.checked_at.is_none());

    let no_remote = unique_temp_dir("sync-no-remote");
    git_init(&no_remote);
    git_commit_empty(&no_remote);
    let no_remote_status = read_team_sync_status(no_remote.clone(), session("no-remote")).unwrap();
    assert_eq!(no_remote_status.state, TeamSyncState::NoRemote);

    let detached = unique_temp_dir("sync-detached");
    git_init(&detached);
    git_commit_empty(&detached);
    assert!(git_command(&detached)
        .args(["checkout", "--detach", "-q"])
        .status()
        .unwrap()
        .success());
    let detached_status = read_team_sync_status(detached.clone(), session("detached")).unwrap();
    assert_eq!(detached_status.state, TeamSyncState::Detached);

    let no_upstream = unique_temp_dir("sync-no-upstream");
    git_init(&no_upstream);
    git_commit_empty(&no_upstream);
    let remote = unique_temp_dir("sync-no-upstream-remote");
    init_bare_remote(&remote);
    wire_remote(&no_upstream, "first", &remote);
    let second = unique_temp_dir("sync-no-upstream-second");
    init_bare_remote(&second);
    wire_remote(&no_upstream, "second", &second);
    let no_upstream_status =
        check_team_changes(no_upstream.clone(), session("no-upstream")).unwrap();
    assert_eq!(no_upstream_status.state, TeamSyncState::NoUpstream);
    assert_eq!(no_upstream_status.knowledge, SyncKnowledge::Cached);
    assert!(no_upstream_status.checked_at.is_none());

    for path in [unborn, no_remote, detached, no_upstream, remote, second] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn explicit_check_reports_fresh_up_to_date_and_preserves_head_index_and_files() {
    let (repo, remote, _branch) = published_repo_and_remote("sync-fresh");
    write_file(&repo, "untracked.txt", "keep me\n");
    let head_before = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());
    let index_path = in_test_frame(|| resolve_index_path(&repo)).unwrap();
    let index_before = fs::read(&index_path).unwrap();
    let file_before = fs::read(Path::new(&repo).join("untracked.txt")).unwrap();

    let cached = read_team_sync_status(repo.clone(), session("fresh")).unwrap();
    assert_eq!(cached.state, TeamSyncState::UpToDate);
    assert_eq!(cached.knowledge, SyncKnowledge::Cached);
    assert!(cached.checked_at.is_none());

    let fresh = check_team_changes(repo.clone(), session("fresh")).unwrap();
    assert_eq!(fresh.state, TeamSyncState::UpToDate);
    assert_eq!(fresh.knowledge, SyncKnowledge::Fresh);
    assert!(fresh.checked_at.is_some());
    assert_eq!(fresh.ahead, 0);
    assert_eq!(fresh.behind, 0);
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap()),
        head_before
    );
    assert_eq!(fs::read(index_path).unwrap(), index_before);
    assert_eq!(
        fs::read(Path::new(&repo).join("untracked.txt")).unwrap(),
        file_before
    );

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn explicit_check_classifies_ahead_behind_and_diverged_from_commit_ancestry() {
    let (ahead_repo, ahead_remote, _) = published_repo_and_remote("sync-ahead");
    write_file(&ahead_repo, "ahead.txt", "local\n");
    git_add_all(&ahead_repo);
    git_commit(&ahead_repo, "ahead");
    let ahead = check_team_changes(ahead_repo.clone(), session("ahead")).unwrap();
    assert_eq!(ahead.state, TeamSyncState::Ahead);
    assert_eq!((ahead.ahead, ahead.behind), (1, 0));

    let (behind_repo, behind_remote, behind_branch) = published_repo_and_remote("sync-behind");
    let behind_other = clone_remote(&behind_remote, "sync-behind-other");
    write_file(&behind_other, "team.txt", "team\n");
    git_add_all(&behind_other);
    git_commit(&behind_other, "team");
    assert!(git_command(&behind_other)
        .args(["push", "-q", "origin", &behind_branch])
        .status()
        .unwrap()
        .success());
    let behind = check_team_changes(behind_repo.clone(), session("behind")).unwrap();
    assert_eq!(behind.state, TeamSyncState::Behind);
    assert_eq!((behind.ahead, behind.behind), (0, 1));

    write_file(&behind_repo, "local.txt", "local\n");
    git_add_all(&behind_repo);
    git_commit(&behind_repo, "local");
    let diverged = check_team_changes(behind_repo.clone(), session("diverged")).unwrap();
    assert_eq!(diverged.state, TeamSyncState::Diverged);
    assert_eq!((diverged.ahead, diverged.behind), (1, 1));

    for path in [
        ahead_repo,
        ahead_remote,
        behind_repo,
        behind_remote,
        behind_other,
    ] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn check_updates_only_the_configured_upstream_tracking_ref() {
    let (repo, remote, branch) = published_repo_and_remote("sync-one-tracking");
    let other_remote = unique_temp_dir("sync-one-tracking-other-remote");
    init_bare_remote(&other_remote);
    wire_remote(&repo, "other", &other_remote);
    assert!(git_command(&repo)
        .args(["update-ref", "refs/remotes/other/sentinel", "HEAD"])
        .status()
        .unwrap()
        .success());
    let sentinel_before =
        git_stdout(&test_git(&repo, &["rev-parse", "refs/remotes/other/sentinel"]).unwrap());

    let other = clone_remote(&remote, "sync-one-tracking-clone");
    write_file(&other, "team.txt", "team\n");
    git_add_all(&other);
    git_commit(&other, "team");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());

    let fresh = check_team_changes(repo.clone(), session("one-tracking")).unwrap();
    assert_eq!(fresh.state, TeamSyncState::Behind);
    assert_eq!(fresh.upstream_remote.as_deref(), Some("origin"));
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", "refs/remotes/other/sentinel"]).unwrap()),
        sentinel_before
    );

    for path in [repo, remote, other_remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

fn delete_remote_branch(remote: &str, branch: &str) {
    assert!(git_command(remote)
        .args(["update-ref", "-d", &format!("refs/heads/{branch}")])
        .status()
        .unwrap()
        .success());
}

fn save_file(repo: &str, name: &str, message: &str) {
    write_file(repo, name, &format!("{message}\n"));
    git_add_all(repo);
    git_commit(repo, message);
}

fn git_succeeds(repo: &str, args: &[&str]) -> bool {
    git_command(repo).args(args).status().unwrap().success()
}

/// The main branch published, then `feature` published with one version, then
/// `feature` deleted on the remote — what a host does after merging a pull
/// request — while this clone keeps its tracking ref.
fn branch_deleted_on_remote(label: &str) -> (String, String) {
    let (repo, remote, main) = published_repo_and_remote(label);
    assert_ne!(main, "feature");
    assert!(git_succeeds(&repo, &["switch", "-q", "-c", "feature"]));
    save_file(&repo, "feature.txt", "feature work");
    assert!(git_succeeds(
        &repo,
        &["push", "-q", "-u", "origin", "feature"]
    ));
    delete_remote_branch(&remote, "feature");
    (repo, remote)
}

#[test]
fn removed_upstream_reads_as_gone_without_pruning_cached_tracking() {
    let (repo, remote, branch) = published_repo_and_remote("sync-removed");
    let tracking = format!("refs/remotes/origin/{branch}");
    let cached_before = git_stdout(&test_git(&repo, &["rev-parse", &tracking]).unwrap());
    delete_remote_branch(&remote, &branch);

    let gone = check_team_changes(repo.clone(), session("removed"))
        .expect("a removed upstream is an answer, not a failure");
    assert_eq!(gone.state, TeamSyncState::UpstreamGone);
    assert_eq!(gone.knowledge, SyncKnowledge::Fresh);
    assert!(gone.checked_at.is_some());
    assert_eq!(gone.remote_commit.as_deref(), Some(cached_before.as_str()));
    assert_eq!(gone.tracking_ref.as_deref(), Some(tracking.as_str()));
    assert_eq!((gone.ahead, gone.behind), (0, 0));
    assert!(gone.forecast.is_none());
    assert_eq!(gone.next_actions, vec![SyncNextAction::CheckAgain]);
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", &tracking]).unwrap()),
        cached_before,
        "the explicit no-prune policy retains the last known tracking ref"
    );
    // A local read cannot tell a kept ref from a live one; the frontend's
    // sync controller is what keeps the fresh answer across it.
    let cached = read_team_sync_status(repo.clone(), session("removed")).unwrap();
    assert_eq!(cached.state, TeamSyncState::UpToDate);

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn a_missing_tracking_ref_reads_as_gone_without_a_check() {
    let (repo, remote, branch) = published_repo_and_remote("sync-gone-cached");
    let tracking = format!("refs/remotes/origin/{branch}");
    assert!(git_succeeds(&repo, &["update-ref", "-d", &tracking]));

    let cached = read_team_sync_status(repo.clone(), session("gone-cached")).unwrap();
    assert_eq!(cached.state, TeamSyncState::UpstreamGone);
    assert_eq!(cached.knowledge, SyncKnowledge::Cached);
    assert!(cached.remote_commit.is_none());
    assert!(cached.warnings.is_empty());
    assert_eq!(cached.destination_branch.as_deref(), Some(branch.as_str()));

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn publishing_a_branch_deleted_on_the_remote_says_it_recreates_and_counts_only_new_versions() {
    let (repo, remote) = branch_deleted_on_remote("sync-recreate");
    save_file(&repo, "more.txt", "more work");

    let plan = plan_publish(repo.clone(), None, None).unwrap();
    assert!(plan.recreates_deleted_branch);
    assert!(!plan.will_create_upstream);
    assert_eq!(plan.target.destination_branch, "feature");
    // The two versions on `feature`, not the main branch's version under them:
    // the remote's main branch already has that one.
    assert_eq!(plan.commit_count, 2);
    assert_eq!(
        plan.commit_summary
            .iter()
            .map(|entry| entry.title.as_str())
            .collect::<Vec<_>>(),
        vec!["more work", "feature work"]
    );

    publish(
        repo.clone(),
        "origin".to_string(),
        plan.state_token,
        None,
        true,
    )
    .unwrap();
    assert!(git_succeeds(
        &remote,
        &["rev-parse", "--verify", "--quiet", "refs/heads/feature"]
    ));

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn a_first_publish_counts_only_what_the_remote_lacks() {
    let (repo, remote, _) = published_repo_and_remote("sync-first-count");
    assert!(git_succeeds(&repo, &["switch", "-q", "-c", "fresh"]));
    save_file(&repo, "fresh.txt", "fresh work");

    let plan = plan_publish(repo.clone(), None, None).unwrap();
    assert!(plan.will_create_upstream);
    assert!(!plan.recreates_deleted_branch);
    assert_eq!(plan.commit_count, 1);
    assert_eq!(plan.commit_summary.len(), 1);
    // Overview's count agrees with the plan: the main branch's version is on
    // the remote already.
    let pending = list_unpublished_versions(repo.clone()).unwrap();
    assert_eq!(pending.total_count, 1);
    assert_eq!(pending.versions[0].title, "fresh work");

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn a_new_branch_with_nothing_new_plans_only_its_branch() {
    let (repo, remote, _) = published_repo_and_remote("sync-empty-branch");
    assert!(git_succeeds(&repo, &["switch", "-q", "-c", "empty"]));

    let plan = plan_publish(repo.clone(), None, None).unwrap();
    assert!(plan.will_create_upstream);
    assert_eq!(plan.commit_count, 0);
    assert!(plan.commit_summary.is_empty());

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn unpublished_versions_still_follow_a_local_upstream() {
    let (repo, remote, main) = published_repo_and_remote("sync-local-upstream");
    assert!(git_succeeds(
        &repo,
        &["switch", "-q", "-c", "topic", "--track", &main]
    ));
    save_file(&repo, "topic.txt", "topic work");

    let pending = list_unpublished_versions(repo.clone()).unwrap();
    assert_eq!(pending.total_count, 1);
    assert_eq!(pending.versions[0].title, "topic work");

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn unpublished_versions_read_past_a_pruned_upstream() {
    let (repo, remote) = branch_deleted_on_remote("sync-pruned-pending");
    assert!(git_succeeds(
        &repo,
        &["update-ref", "-d", "refs/remotes/origin/feature"]
    ));

    let pending = list_unpublished_versions(repo.clone()).unwrap();
    assert_eq!(pending.total_count, 1);
    assert_eq!(pending.versions[0].title, "feature work");
    let cached = read_team_sync_status(repo.clone(), session("pruned-pending")).unwrap();
    assert_eq!(cached.state, TeamSyncState::UpstreamGone);

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn stop_tracking_remote_forgets_the_upstream_and_keeps_everything_else() {
    let (repo, remote) = branch_deleted_on_remote("sync-stop-tracking");
    let head_before = head(&repo);

    let status = stop_tracking_remote(repo.clone(), session("stop-tracking")).unwrap();
    assert_eq!(status.state, TeamSyncState::NoUpstream);
    assert_eq!(head(&repo), head_before);
    for key in ["branch.feature.remote", "branch.feature.merge"] {
        assert!(!git_succeeds(&repo, &["config", "--get", key]));
    }
    assert!(
        git_succeeds(
            &repo,
            &[
                "rev-parse",
                "--verify",
                "--quiet",
                "refs/remotes/origin/feature"
            ]
        ),
        "the kept tracking ref is not deleted"
    );
    let again = stop_tracking_remote(repo.clone(), session("stop-tracking")).unwrap_err();
    assert_eq!(again.code, AppErrorCode::InvalidRemoteConfiguration);

    let _ = fs::remove_dir_all(repo);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn malformed_or_unreachable_upstreams_fail_without_guessing_another_remote() {
    let (repo, remote, branch) = published_repo_and_remote("sync-invalid-config");
    let second = unique_temp_dir("sync-invalid-config-second");
    init_bare_remote(&second);
    wire_remote(&repo, "second", &second);
    assert!(git_command(&repo)
        .args(["config", &format!("branch.{branch}.remote"), "missing"])
        .status()
        .unwrap()
        .success());
    let invalid = check_team_changes(repo.clone(), session("invalid-config")).unwrap_err();
    assert_eq!(invalid.code, AppErrorCode::InvalidRemoteConfiguration);

    assert!(git_command(&repo)
        .args(["config", &format!("branch.{branch}.remote"), "origin"])
        .status()
        .unwrap()
        .success());
    let missing_path = unique_temp_dir("sync-unreachable-placeholder");
    let _ = fs::remove_dir_all(&missing_path);
    assert!(git_command(&repo)
        .args(["remote", "set-url", "origin", &missing_path])
        .status()
        .unwrap()
        .success());
    let unreachable = check_team_changes(repo.clone(), session("unreachable")).unwrap_err();
    assert_eq!(unreachable.code, AppErrorCode::GitCommandFailed);
    assert!(unreachable
        .detail
        .as_deref()
        .is_some_and(|detail| !detail.is_empty()));

    for path in [repo, remote, second] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn rewritten_upstream_is_fetched_through_its_configured_force_mapping() {
    let (repo, remote, branch) = published_repo_and_remote("sync-rewritten");
    let replacement = unique_temp_dir("sync-rewritten-replacement");
    git_init(&replacement);
    assert!(git_command(&replacement)
        .args(["checkout", "--orphan", "replacement-root", "-q"])
        .status()
        .unwrap()
        .success());
    write_file(&replacement, "replacement.txt", "new root\n");
    git_add_all(&replacement);
    git_commit(&replacement, "replacement root");
    wire_remote(&replacement, "origin", &remote);
    assert!(git_command(&replacement)
        .args([
            "push",
            "--force",
            "-q",
            "origin",
            &format!("HEAD:refs/heads/{branch}"),
        ])
        .status()
        .unwrap()
        .success());

    let rewritten = check_team_changes(repo.clone(), session("rewritten")).unwrap();
    assert_eq!(rewritten.state, TeamSyncState::Diverged);
    assert!(rewritten.ahead > 0 && rewritten.behind > 0);
    assert_eq!(rewritten.knowledge, SyncKnowledge::Fresh);

    for path in [repo, remote, replacement] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn remote_failures_are_classified_without_serializing_secrets() {
    let auth = classify_remote_failure(
        "fatal: Authentication failed for 'https://alice:secret@example.test/repo.git?token=abc'",
    );
    assert_eq!(auth.code, AppErrorCode::AuthenticationFailed);
    let detail = auth.detail.unwrap_or_default();
    assert!(!detail.contains("secret"));
    assert!(!detail.contains("token"));

    let missing = classify_remote_failure("fatal: couldn't find remote ref main");
    assert_eq!(missing.code, AppErrorCode::RemoteRefMissing);

    let generic = classify_remote_failure(
        "fatal: unable to access 'https://token@example.test/repo.git?private=yes': offline",
    );
    assert_eq!(generic.code, AppErrorCode::GitCommandFailed);
    let detail = generic.detail.unwrap_or_default();
    assert!(!detail.contains("token@example"));
    assert!(!detail.contains("private"));
}

#[test]
fn get_team_changes_reviews_and_applies_exact_fast_forward_with_recovery() {
    let (repo, remote, branch) = published_repo_and_remote("get-success");
    write_file(&repo, "rename-source.txt", "rename me\n");
    write_file(&repo, "delete-me.txt", "delete me\n");
    git_add_all(&repo);
    git_commit(&repo, "rename baseline");
    assert!(git_command(&repo)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());
    let other = clone_remote(&remote, "get-success-other");
    write_file(&other, "a.txt", "team edit\n");
    write_file(&other, "added.txt", "new\n");
    git_add_all(&other);
    git_commit(&other, "team one");
    assert!(git_command(&other)
        .args(["mv", "rename-source.txt", "renamed.txt"])
        .status()
        .unwrap()
        .success());
    fs::remove_file(Path::new(&other).join("delete-me.txt")).unwrap();
    fs::write(Path::new(&other).join("binary.dat"), [0_u8, 159, 146, 150]).unwrap();
    git_add_all(&other);
    git_commit(&other, "team two");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());
    let remote_head = remote_branch_sha(&remote, &format!("refs/heads/{branch}")).unwrap();
    let previous = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());

    let plan = plan_after_check(&repo, "get-success").unwrap();
    assert_eq!(plan.operation_kind, OperationKind::HistoryMutation);
    assert_eq!(plan.incoming_count, 2);
    assert_eq!(plan.incoming_versions.len(), 2);
    assert!(plan.file_impact.counts.modified >= 1);
    assert!(plan.file_impact.counts.deleted >= 1);
    assert!(plan.file_impact.counts.renamed >= 1);
    assert!(plan.file_impact.counts.binary >= 1);
    assert_eq!(plan.integration, IntegrationKind::FastForward);
    assert_eq!(plan.forecast.outcome, ForecastOutcome::Clear);
    assert_eq!(plan.forecast.authors, vec!["GitOdile Test".to_string()]);

    let recovery_ref = plan.recovery.reference.clone();
    let result = get_team_changes(
        repo.clone(),
        session("get-success"),
        plan.state_token,
        recovery_ref.clone(),
        true,
        |_| {},
    )
    .unwrap();
    assert_eq!(result.outcome, GetTeamChangesOutcome::Completed);
    assert_eq!(
        result.resulting_commit.as_deref(),
        Some(remote_head.as_str())
    );
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap()),
        remote_head
    );
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", &recovery_ref]).unwrap()),
        previous
    );
    let parent_count =
        git_stdout(&test_git(&repo, &["rev-list", "--parents", "-n", "1", "HEAD"]).unwrap())
            .split_whitespace()
            .count();
    assert_eq!(
        parent_count, 2,
        "the resulting commit has one parent; no merge commit was created"
    );
    assert!(result
        .sync_status
        .is_some_and(|status| status.state == TeamSyncState::UpToDate));

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_plan_blocks_up_to_date_and_ahead_and_plans_a_merge_for_diverged() {
    let (current_repo, current_remote, _) = published_repo_and_remote("get-current");
    let current_head = git_stdout(&test_git(&current_repo, &["rev-parse", "HEAD"]).unwrap());
    let current_error = plan_after_check(&current_repo, "current").unwrap_err();
    assert_eq!(current_error.code, AppErrorCode::NothingToGet);
    assert_eq!(
        git_stdout(&test_git(&current_repo, &["rev-parse", "HEAD"]).unwrap()),
        current_head
    );

    let (ahead_repo, ahead_remote, _) = published_repo_and_remote("get-ahead");
    write_file(&ahead_repo, "local.txt", "local\n");
    git_add_all(&ahead_repo);
    git_commit(&ahead_repo, "local ahead");
    let ahead_head = git_stdout(&test_git(&ahead_repo, &["rev-parse", "HEAD"]).unwrap());
    let ahead_error = plan_after_check(&ahead_repo, "ahead").unwrap_err();
    assert_eq!(ahead_error.code, AppErrorCode::NothingToGet);
    assert_eq!(
        git_stdout(&test_git(&ahead_repo, &["rev-parse", "HEAD"]).unwrap()),
        ahead_head
    );

    let (diverged_repo, diverged_remote, diverged_branch) =
        published_repo_and_remote("get-diverged");
    let diverged_other = clone_remote(&diverged_remote, "get-diverged-other");
    write_file(&diverged_other, "team.txt", "team\n");
    git_add_all(&diverged_other);
    git_commit(&diverged_other, "team side");
    assert!(git_command(&diverged_other)
        .args(["push", "-q", "origin", &diverged_branch])
        .status()
        .unwrap()
        .success());
    write_file(&diverged_repo, "local.txt", "local\n");
    git_add_all(&diverged_repo);
    git_commit(&diverged_repo, "local side");
    let diverged_head = git_stdout(&test_git(&diverged_repo, &["rev-parse", "HEAD"]).unwrap());
    let diverged = plan_after_check(&diverged_repo, "diverged").unwrap();
    assert_eq!(diverged.integration, IntegrationKind::Merge);
    assert_eq!(diverged.forecast.outcome, ForecastOutcome::Clear);
    assert_eq!(diverged.local_count, 1);
    assert_eq!(diverged.local_versions.len(), 1);
    assert!(diverged
        .merge_message
        .as_deref()
        .is_some_and(|message| message.starts_with("Merge remote-tracking branch 'origin/")));
    assert_eq!(
        git_stdout(&test_git(&diverged_repo, &["rev-parse", "HEAD"]).unwrap()),
        diverged_head
    );

    for path in [
        current_repo,
        current_remote,
        ahead_repo,
        ahead_remote,
        diverged_repo,
        diverged_remote,
        diverged_other,
    ] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_plan_allows_proven_separate_tracked_and_ignored_content_but_blocks_collisions() {
    let (dirty_repo, dirty_remote, dirty_branch) = published_repo_and_remote("get-dirty");
    let dirty_other = clone_remote(&dirty_remote, "get-dirty-other");
    write_file(&dirty_other, "team.txt", "team\n");
    git_add_all(&dirty_other);
    git_commit(&dirty_other, "team");
    assert!(git_command(&dirty_other)
        .args(["push", "-q", "origin", &dirty_branch])
        .status()
        .unwrap()
        .success());
    write_file(&dirty_repo, "a.txt", "local dirty\n");
    let dirty = plan_after_check(&dirty_repo, "dirty").unwrap();
    assert_eq!(dirty.incoming_count, 1);
    assert_eq!(
        fs::read(Path::new(&dirty_repo).join("a.txt")).unwrap(),
        b"local dirty\n"
    );

    let (collision_repo, collision_remote, collision_branch) =
        published_repo_and_remote("get-collision");
    let collision_other = clone_remote(&collision_remote, "get-collision-other");
    write_file(&collision_other, "local-only.txt", "team\n");
    git_add_all(&collision_other);
    git_commit(&collision_other, "team collision");
    assert!(git_command(&collision_other)
        .args(["push", "-q", "origin", &collision_branch])
        .status()
        .unwrap()
        .success());
    write_file(&collision_repo, "local-only.txt", "keep local\n");
    let collision = plan_after_check(&collision_repo, "collision").unwrap();
    assert_eq!(collision.forecast.outcome, ForecastOutcome::Blocked);
    assert_eq!(
        collision.forecast.blocker,
        Some(ForecastBlocker {
            kind: ForecastBlockerKind::UntrackedCollision,
            path: Some("local-only.txt".to_string()),
        })
    );
    assert_eq!(
        fs::read(Path::new(&collision_repo).join("local-only.txt")).unwrap(),
        b"keep local\n"
    );

    let (safe_repo, safe_remote, safe_branch) = published_repo_and_remote("get-safe-ignored");
    write_file(&safe_repo, ".gitignore", "cache/\n");
    git_add_all(&safe_repo);
    git_commit(&safe_repo, "ignore cache");
    assert!(git_command(&safe_repo)
        .args(["push", "-q", "origin", &safe_branch])
        .status()
        .unwrap()
        .success());
    let safe_other = clone_remote(&safe_remote, "get-safe-ignored-other");
    write_file(&safe_other, "team-safe.txt", "team\n");
    git_add_all(&safe_other);
    git_commit(&safe_other, "safe team");
    assert!(git_command(&safe_other)
        .args(["push", "-q", "origin", &safe_branch])
        .status()
        .unwrap()
        .success());
    fs::create_dir_all(Path::new(&safe_repo).join("cache")).unwrap();
    write_file(&safe_repo, "cache/local.bin", "keep ignored\n");
    let safe = plan_after_check(&safe_repo, "safe").unwrap();
    assert_eq!(safe.incoming_count, 1);

    for path in [
        dirty_repo,
        dirty_remote,
        dirty_other,
        collision_repo,
        collision_remote,
        collision_other,
        safe_repo,
        safe_remote,
        safe_other,
    ] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_plan_allows_separate_staged_changes_and_blocks_ignored_collisions_and_git_operations() {
    let (staged_repo, staged_remote, staged_branch) = published_repo_and_remote("get-staged");
    let staged_other = clone_remote(&staged_remote, "get-staged-other");
    write_file(&staged_other, "team.txt", "team\n");
    git_add_all(&staged_other);
    git_commit(&staged_other, "team");
    assert!(git_command(&staged_other)
        .args(["push", "-q", "origin", &staged_branch])
        .status()
        .unwrap()
        .success());
    write_file(&staged_repo, "staged.txt", "prepared\n");
    git_add_all(&staged_repo);
    let staged_index = in_test_frame(|| resolve_index_path(&staged_repo)).unwrap();
    let staged_index_before = fs::read(&staged_index).unwrap();
    let staged_plan = plan_after_check(&staged_repo, "staged").unwrap();
    assert_eq!(staged_plan.incoming_count, 1);
    assert_eq!(fs::read(&staged_index).unwrap(), staged_index_before);
    assert_eq!(
        fs::read(Path::new(&staged_repo).join("staged.txt")).unwrap(),
        b"prepared\n"
    );

    let (ignored_repo, ignored_remote, ignored_branch) =
        published_repo_and_remote("get-ignored-collision");
    write_file(&ignored_repo, ".gitignore", "cache/\n");
    git_add_all(&ignored_repo);
    git_commit(&ignored_repo, "ignore cache");
    assert!(git_command(&ignored_repo)
        .args(["push", "-q", "origin", &ignored_branch])
        .status()
        .unwrap()
        .success());
    let ignored_other = clone_remote(&ignored_remote, "get-ignored-collision-other");
    fs::create_dir_all(Path::new(&ignored_other).join("cache")).unwrap();
    write_file(&ignored_other, "cache/incoming.txt", "team\n");
    assert!(git_command(&ignored_other)
        .args(["add", "-f", "--", "cache/incoming.txt"])
        .status()
        .unwrap()
        .success());
    git_commit(&ignored_other, "incoming ignored path");
    assert!(git_command(&ignored_other)
        .args(["push", "-q", "origin", &ignored_branch])
        .status()
        .unwrap()
        .success());
    fs::create_dir_all(Path::new(&ignored_repo).join("cache")).unwrap();
    write_file(&ignored_repo, "cache/local.txt", "keep ignored\n");
    let ignored = plan_after_check(&ignored_repo, "ignored").unwrap();
    assert_eq!(
        ignored.forecast.blocker.map(|blocker| blocker.kind),
        Some(ForecastBlockerKind::UntrackedCollision)
    );
    assert_eq!(
        fs::read(Path::new(&ignored_repo).join("cache/local.txt")).unwrap(),
        b"keep ignored\n"
    );

    let (operation_repo, operation_remote, operation_branch) =
        published_repo_and_remote("get-operation");
    let operation_other = clone_remote(&operation_remote, "get-operation-other");
    write_file(&operation_other, "team.txt", "team\n");
    git_add_all(&operation_other);
    git_commit(&operation_other, "team");
    assert!(git_command(&operation_other)
        .args(["push", "-q", "origin", &operation_branch])
        .status()
        .unwrap()
        .success());
    let operation_head = git_stdout(&test_git(&operation_repo, &["rev-parse", "HEAD"]).unwrap());
    let operation_git_dir =
        git_stdout(&test_git(&operation_repo, &["rev-parse", "--absolute-git-dir"]).unwrap());
    fs::write(
        Path::new(&operation_git_dir).join("MERGE_HEAD"),
        &operation_head,
    )
    .unwrap();
    let operation_error = plan_after_check(&operation_repo, "operation").unwrap_err();
    assert_eq!(operation_error.code, AppErrorCode::GitOperationInProgress);
    assert_eq!(
        git_stdout(&test_git(&operation_repo, &["rev-parse", "HEAD"]).unwrap()),
        operation_head
    );

    for path in [
        staged_repo,
        staged_remote,
        staged_other,
        ignored_repo,
        ignored_remote,
        ignored_other,
        operation_repo,
        operation_remote,
        operation_other,
    ] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_plan_blocks_a_prepared_change_to_an_incoming_source_or_destination() {
    let (repo, remote, branch) = published_repo_and_remote("get-tracked-collision");
    let other = clone_remote(&remote, "get-tracked-collision-other");
    write_file(&other, "a.txt", "team edit\n");
    git_add_all(&other);
    git_commit(&other, "team edit");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());

    assert!(git_command(&repo)
        .args(["mv", "a.txt", "local-name.txt"])
        .status()
        .unwrap()
        .success());
    let status_before = test_git(&repo, &["status", "--porcelain=v2", "-z"]).unwrap();
    let plan = plan_after_check(&repo, "tracked-collision").unwrap();
    assert_eq!(
        plan.forecast.blocker,
        Some(ForecastBlocker {
            kind: ForecastBlockerKind::PreparedOverlap,
            path: Some("local-name.txt".to_string()),
        })
    );
    let error = get_team_changes(
        repo.clone(),
        session("tracked-collision"),
        plan.state_token,
        plan.recovery.reference,
        true,
        |_| {},
    )
    .unwrap_err();
    assert_eq!(error.code, AppErrorCode::IncomingTrackedChangeCollision);
    assert_eq!(
        test_git(&repo, &["status", "--porcelain=v2", "-z"])
            .unwrap()
            .stdout,
        status_before.stdout
    );
    assert_eq!(
        fs::read(Path::new(&repo).join("local-name.txt")).unwrap(),
        b"hello\n"
    );

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_team_changes_preserves_separate_staged_unstaged_and_untracked_work() {
    let (repo, remote, branch) = published_repo_and_remote("get-with-local-work");
    let other = clone_remote(&remote, "get-with-local-work-other");
    write_file(&other, "team.txt", "team\n");
    git_add_all(&other);
    git_commit(&other, "team");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());

    write_file(&repo, "a.txt", "local unstaged\n");
    write_file(&repo, "prepared.txt", "local staged\n");
    git_add(&repo, "prepared.txt");
    write_file(&repo, "local-only.txt", "local untracked\n");
    let status_before = test_git(
        &repo,
        &[
            "status",
            "--porcelain=v2",
            "--untracked-files=all",
            "--ignored=matching",
            "--renames",
            "-z",
        ],
    )
    .unwrap();

    let plan = plan_after_check(&repo, "local-work").unwrap();
    let result = get_team_changes(
        repo.clone(),
        session("local-work"),
        plan.state_token,
        plan.recovery.reference,
        true,
        |_| {},
    )
    .unwrap();

    assert_eq!(result.outcome, GetTeamChangesOutcome::Completed);
    assert_eq!(
        test_git(
            &repo,
            &[
                "status",
                "--porcelain=v2",
                "--untracked-files=all",
                "--ignored=matching",
                "--renames",
                "-z",
            ],
        )
        .unwrap()
        .stdout,
        status_before.stdout
    );
    assert_eq!(
        fs::read(Path::new(&repo).join("a.txt")).unwrap(),
        b"local unstaged\n"
    );
    assert_eq!(
        fs::read(Path::new(&repo).join("prepared.txt")).unwrap(),
        b"local staged\n"
    );
    assert_eq!(
        fs::read(Path::new(&repo).join("local-only.txt")).unwrap(),
        b"local untracked\n"
    );
    assert_eq!(
        String::from_utf8_lossy(&fs::read(Path::new(&repo).join("team.txt")).unwrap())
            .replace("\r\n", "\n"),
        "team\n"
    );

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_team_changes_rejects_local_content_changed_after_preview_before_recovery() {
    let (repo, remote, branch) = published_repo_and_remote("get-local-state-stale");
    let other = clone_remote(&remote, "get-local-state-stale-other");
    write_file(&other, "team.txt", "team\n");
    git_add_all(&other);
    git_commit(&other, "team");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());

    write_file(&repo, "a.txt", "first local edit\n");
    let plan = plan_after_check(&repo, "local-state-stale").unwrap();
    let head_before = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());
    write_file(&repo, "a.txt", "newer local edit\n");

    let error = get_team_changes(
        repo.clone(),
        session("local-state-stale"),
        plan.state_token,
        plan.recovery.reference.clone(),
        true,
        |_| {},
    )
    .unwrap_err();
    assert_eq!(error.code, AppErrorCode::StaleGetTeamChangesPlan);
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap()),
        head_before
    );
    assert_eq!(
        fs::read(Path::new(&repo).join("a.txt")).unwrap(),
        b"newer local edit\n"
    );
    assert!(
        !test_git(&repo, &["show-ref", "--verify", &plan.recovery.reference])
            .unwrap()
            .status
            .success()
    );

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn execution_rejects_a_remote_target_that_advanced_after_preview_without_local_mutation() {
    let (repo, remote, branch) = published_repo_and_remote("get-stale");
    let other = clone_remote(&remote, "get-stale-other");
    write_file(&other, "one.txt", "one\n");
    git_add_all(&other);
    git_commit(&other, "one");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());
    let plan = plan_after_check(&repo, "stale").unwrap();
    let head_before = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());
    let index = in_test_frame(|| resolve_index_path(&repo)).unwrap();
    write_file(&other, "two.txt", "two\n");
    git_add_all(&other);
    git_commit(&other, "two");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());
    // Execution never fetches: the newer remote is only seen once a check
    // records it, as the dialog's background check does.
    check_team_changes(repo.clone(), session("stale")).unwrap();
    let index_before = fs::read(&index).unwrap();

    let error = get_team_changes(
        repo.clone(),
        session("stale"),
        plan.state_token,
        plan.recovery.reference,
        true,
        |_| {},
    )
    .unwrap_err();
    assert_eq!(error.code, AppErrorCode::StaleGetTeamChangesPlan);
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap()),
        head_before
    );
    assert_eq!(fs::read(index).unwrap(), index_before);

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn execution_rejects_changed_upstream_and_recovery_creation_lock_before_local_mutation() {
    let (upstream_repo, upstream_remote, upstream_branch) =
        published_repo_and_remote("get-upstream-change");
    let upstream_other = clone_remote(&upstream_remote, "get-upstream-change-other");
    write_file(&upstream_other, "team.txt", "team\n");
    git_add_all(&upstream_other);
    git_commit(&upstream_other, "team");
    assert!(git_command(&upstream_other)
        .args(["push", "-q", "origin", &upstream_branch])
        .status()
        .unwrap()
        .success());
    let upstream_plan = plan_after_check(&upstream_repo, "upstream-change").unwrap();
    let upstream_head = git_stdout(&test_git(&upstream_repo, &["rev-parse", "HEAD"]).unwrap());
    let upstream_index = in_test_frame(|| resolve_index_path(&upstream_repo)).unwrap();
    let upstream_index_before = fs::read(&upstream_index).unwrap();
    assert!(git_command(&upstream_repo)
        .args([
            "config",
            &format!("branch.{upstream_branch}.merge"),
            "refs/heads/missing-after-preview",
        ])
        .status()
        .unwrap()
        .success());
    let upstream_error = get_team_changes(
        upstream_repo.clone(),
        session("upstream-change"),
        upstream_plan.state_token,
        upstream_plan.recovery.reference,
        true,
        |_| {},
    )
    .unwrap_err();
    assert!(matches!(
        upstream_error.code,
        AppErrorCode::RemoteRefMissing | AppErrorCode::StaleGetTeamChangesPlan
    ));
    assert_eq!(
        git_stdout(&test_git(&upstream_repo, &["rev-parse", "HEAD"]).unwrap()),
        upstream_head
    );
    assert_eq!(fs::read(&upstream_index).unwrap(), upstream_index_before);

    let (locked_repo, locked_remote, locked_branch) =
        published_repo_and_remote("get-recovery-lock");
    let locked_other = clone_remote(&locked_remote, "get-recovery-lock-other");
    write_file(&locked_other, "team.txt", "team\n");
    git_add_all(&locked_other);
    git_commit(&locked_other, "team");
    assert!(git_command(&locked_other)
        .args(["push", "-q", "origin", &locked_branch])
        .status()
        .unwrap()
        .success());
    let locked_plan = plan_after_check(&locked_repo, "recovery-lock").unwrap();
    let locked_head = git_stdout(&test_git(&locked_repo, &["rev-parse", "HEAD"]).unwrap());
    let locked_index = in_test_frame(|| resolve_index_path(&locked_repo)).unwrap();
    let locked_index_before = fs::read(&locked_index).unwrap();
    let common_git_dir =
        git_stdout(&test_git(&locked_repo, &["rev-parse", "--git-common-dir"]).unwrap());
    let common_git_dir = if Path::new(&common_git_dir).is_absolute() {
        common_git_dir.into()
    } else {
        Path::new(&locked_repo).join(common_git_dir)
    };
    let recovery_path = common_git_dir.join(&locked_plan.recovery.reference);
    fs::create_dir_all(recovery_path.parent().unwrap()).unwrap();
    let recovery_lock = recovery_path.with_file_name(format!(
        "{}.lock",
        recovery_path.file_name().unwrap().to_string_lossy()
    ));
    fs::write(&recovery_lock, b"external lock").unwrap();
    let locked_error = get_team_changes(
        locked_repo.clone(),
        session("recovery-lock"),
        locked_plan.state_token,
        locked_plan.recovery.reference.clone(),
        true,
        |_| {},
    )
    .unwrap_err();
    assert_eq!(locked_error.code, AppErrorCode::RefLocked);
    assert_eq!(
        git_stdout(&test_git(&locked_repo, &["rev-parse", "HEAD"]).unwrap()),
        locked_head
    );
    assert_eq!(fs::read(&locked_index).unwrap(), locked_index_before);
    assert!(!test_git(
        &locked_repo,
        &["rev-parse", "--verify", &locked_plan.recovery.reference]
    )
    .unwrap()
    .status
    .success());

    let _ = fs::remove_file(recovery_lock);
    for path in [
        upstream_repo,
        upstream_remote,
        upstream_other,
        locked_repo,
        locked_remote,
        locked_other,
    ] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn history_recovery_names_are_create_only_and_retention_survives_reacquisition() {
    let repo = unique_temp_dir("history-recovery-retention");
    git_init(&repo);
    git_commit_empty(&repo);
    let head = git_stdout(&test_git(&repo, &["rev-parse", "HEAD"]).unwrap());
    let mut created = Vec::new();
    {
        let (repository, _access) =
            application::authorize_repository(&repo, "get_team_changes", None).unwrap();
        let preview = plan_history_recovery(&repository);
        let metadata = || HistoryRecoveryMetadata {
            branch: current_branch(&repo),
            previous_commit: head.clone(),
            target_commit: head.clone(),
            remote: "origin".to_string(),
            destination_branch: "main".to_string(),
            tracking_ref: "refs/remotes/origin/main".to_string(),
            state_token: "test-token".to_string(),
            unsaved_snapshot: None,
        };
        let incomplete_preview = plan_history_recovery(&repository);
        let mut incomplete_parts = incomplete_preview.reference.rsplit('/');
        let incomplete_id = incomplete_parts.next().unwrap().to_string();
        let incomplete_owner = incomplete_parts.next().unwrap().to_string();
        assert!(git_command(&repo)
            .args([
                "update-ref",
                &incomplete_preview.reference,
                &head,
                &"0".repeat(40),
            ])
            .status()
            .unwrap()
            .success());
        let incomplete = HistoryRecoveryRecord {
            schema_version: 1,
            recovery_id: incomplete_id.clone(),
            reference: incomplete_preview.reference.clone(),
            created_at_ms: 1,
            operation: "get-team-changes".to_string(),
            owner_id: incomplete_owner.clone(),
            branch: current_branch(&repo),
            previous_commit: head.clone(),
            target_commit: head.clone(),
            remote: "origin".to_string(),
            destination_branch: "main".to_string(),
            tracking_ref: "refs/remotes/origin/main".to_string(),
            state_token: "test-token".to_string(),
            retention_limit: MAX_HISTORY_RECOVERY_RECORDS,
            unsaved_reference: None,
            unsaved_snapshot: None,
        };
        let pending = repository
            .common_git_dir
            .backend_path()
            .join("gitodile")
            .join("history-recovery")
            .join("v1")
            .join("pending")
            .join(format!("{incomplete_owner}-{incomplete_id}.json"));
        fs::create_dir_all(pending.parent().unwrap()).unwrap();
        fs::write(&pending, serde_json::to_vec(&incomplete).unwrap()).unwrap();

        let first = create_history_recovery_for(
            &repository,
            HistoryRecoveryOperation::GetTeamChanges,
            &preview.reference,
            metadata(),
        )
        .unwrap();
        created.push(first.reference.clone());
        assert!(!pending.exists());
        assert!(!test_git(
            &repo,
            &["rev-parse", "--verify", &incomplete_preview.reference]
        )
        .unwrap()
        .status
        .success());
        let duplicate = create_history_recovery_for(
            &repository,
            HistoryRecoveryOperation::GetTeamChanges,
            &preview.reference,
            metadata(),
        )
        .unwrap_err();
        assert_eq!(duplicate.code, AppErrorCode::RefLocked);
        assert_eq!(
            git_stdout(&test_git(&repo, &["rev-parse", &first.reference]).unwrap()),
            head
        );
    }

    // Reacquiring the repository command frame exercises disk/ref discovery
    // rather than relying on process-local retention state.
    {
        let (repository, _access) =
            application::authorize_repository(&repo, "get_team_changes", None).unwrap();
        for _ in 0..MAX_HISTORY_RECOVERY_RECORDS {
            let preview = plan_history_recovery(&repository);
            let record = create_history_recovery_for(
                &repository,
                HistoryRecoveryOperation::GetTeamChanges,
                &preview.reference,
                HistoryRecoveryMetadata {
                    branch: current_branch(&repo),
                    previous_commit: head.clone(),
                    target_commit: head.clone(),
                    remote: "origin".to_string(),
                    destination_branch: "main".to_string(),
                    tracking_ref: "refs/remotes/origin/main".to_string(),
                    state_token: "test-token".to_string(),
                    unsaved_snapshot: None,
                },
            )
            .unwrap();
            created.push(record.reference);
        }
    }
    let refs = git_stdout(
        &test_git(
            &repo,
            &[
                "for-each-ref",
                "--format=%(refname)",
                "refs/gitodile/recovery/v1/get-team-changes",
            ],
        )
        .unwrap(),
    );
    assert_eq!(refs.lines().count(), MAX_HISTORY_RECOVERY_RECORDS);
    assert!(!test_git(&repo, &["rev-parse", "--verify", &created[0]])
        .unwrap()
        .status
        .success());
    assert!(
        test_git(&repo, &["rev-parse", "--verify", created.last().unwrap()])
            .unwrap()
            .status
            .success()
    );

    let _ = fs::remove_dir_all(repo);
}

#[test]
fn a_post_recovery_ref_lock_returns_uncertain_and_keeps_the_recovery() {
    let (repo, remote, branch) = published_repo_and_remote("get-uncertain-lock");
    let other = clone_remote(&remote, "get-uncertain-lock-other");
    write_file(&other, "team.txt", "team\n");
    git_add_all(&other);
    git_commit(&other, "team");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());
    let plan = plan_after_check(&repo, "uncertain-lock").unwrap();
    let git_dir = git_stdout(&test_git(&repo, &["rev-parse", "--absolute-git-dir"]).unwrap());
    let branch_lock = Path::new(&git_dir)
        .join("refs")
        .join("heads")
        .join(format!("{branch}.lock"));
    fs::write(&branch_lock, b"external lock").unwrap();

    let result = get_team_changes(
        repo.clone(),
        session("uncertain-lock"),
        plan.state_token,
        plan.recovery.reference,
        true,
        |_| {},
    )
    .unwrap();
    assert_eq!(result.outcome, GetTeamChangesOutcome::Uncertain);
    assert!(result.inspection_instructions.is_some());
    assert_eq!(
        git_stdout(
            &test_git(
                &repo,
                &["rev-parse", "--verify", &result.recovery.reference]
            )
            .unwrap()
        ),
        result.previous_commit
    );
    assert!(Path::new(&git_dir)
        .join("gitodile")
        .join("history-recovery")
        .join("v1")
        .join("get-team-changes")
        .join(&result.recovery.owner_id)
        .join(format!("{}.json", result.recovery.recovery_id))
        .is_file());

    let _ = fs::remove_file(branch_lock);
    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_plan_caps_many_incoming_versions_without_losing_the_total() {
    let (repo, remote, branch) = published_repo_and_remote("get-many");
    let other = clone_remote(&remote, "get-many-other");
    for index in 0..(MAX_INCOMING_VERSIONS + 5) {
        write_file(&other, "many.txt", &format!("{index}\n"));
        git_add_all(&other);
        git_commit(&other, &format!("incoming {index}"));
    }
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());
    let plan = plan_after_check(&repo, "many").unwrap();
    assert_eq!(plan.incoming_count as usize, MAX_INCOMING_VERSIONS + 5);
    assert_eq!(plan.incoming_versions.len(), MAX_INCOMING_VERSIONS);
    assert!(plan.versions_truncated);

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn get_plan_caps_many_incoming_files_without_losing_categories_or_total() {
    let (repo, remote, branch) = published_repo_and_remote("get-many-files");
    let other = clone_remote(&remote, "get-many-files-other");
    for index in 0..(MAX_INCOMING_FILES + 5) {
        write_file(&other, &format!("incoming-{index:03}.txt"), "team\n");
    }
    git_add_all(&other);
    git_commit(&other, "many incoming files");
    assert!(git_command(&other)
        .args(["push", "-q", "origin", &branch])
        .status()
        .unwrap()
        .success());

    let plan = plan_after_check(&repo, "many-files").unwrap();
    assert_eq!(plan.file_impact.total_count, MAX_INCOMING_FILES + 5);
    assert_eq!(plan.file_impact.files.len(), MAX_INCOMING_FILES);
    assert_eq!(plan.file_impact.counts.added, MAX_INCOMING_FILES + 5);
    assert!(plan.file_impact.is_truncated);

    write_file(
        &repo,
        "a.txt",
        "local work outside the visible incoming sample\n",
    );
    // Local work is compared with every incoming path, not the capped list.
    let dirty = plan_after_check(&repo, "many-files-dirty").unwrap();
    assert_eq!(dirty.forecast.outcome, ForecastOutcome::Clear);
    assert_eq!(dirty.forecast.carried_unsaved_count, 1);
    assert_eq!(
        dirty.forecast.incoming_file_count as usize,
        MAX_INCOMING_FILES + 5
    );

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn project_remotes_report_push_urls_and_hidden_credentials() {
    // Parsed rather than configured, because `git remote -v` is the only place
    // the two directions arrive paired and a stored password is still visible.
    let output = "origin\thttps://user:pw@example.com/repo.git (fetch)\n\
                  origin\thttps://user:pw@example.com/repo.git (push)\n\
                  upstream\tgit@example.com:org/repo.git (fetch)\n\
                  upstream\tssh://example.com/mirror.git (push)\n";
    let remotes = parse_project_remotes(output);
    assert_eq!(remotes.len(), 2);
    assert_eq!(remotes[0].url, "https://example.com/repo.git");
    assert_eq!(remotes[0].push_url, None, "one address is not two");
    assert!(
        remotes[0].has_hidden_credentials,
        "the stored URL carries a password the display drops"
    );
    assert_eq!(remotes[1].url, "git@example.com:org/repo.git");
    assert_eq!(
        remotes[1].push_url.as_deref(),
        Some("ssh://example.com/mirror.git")
    );
    assert!(
        !remotes[1].has_hidden_credentials,
        "an SCP-style username is kept, not hidden"
    );
}

#[test]
fn changing_a_remote_url_validates_names_and_addresses_before_writing() {
    let (repo, remote, _branch) = published_repo_and_remote("set-remote-url");

    let before = read_project_remotes(repo.clone()).unwrap();
    assert_eq!(before.remotes.len(), 1);
    assert_eq!(before.remotes[0].name, "origin");
    assert_eq!(
        before.upstream_remote.as_deref(),
        Some("origin"),
        "the published branch's own remote, read from its configuration"
    );

    assert_eq!(
        set_remote_url(
            repo.clone(),
            "elsewhere".into(),
            "https://example.test/repo.git".into(),
        )
        .unwrap_err()
        .code,
        AppErrorCode::RemoteNotFound
    );
    assert_eq!(
        set_remote_url(repo.clone(), "origin".into(), "not a url".into(),)
            .unwrap_err()
            .code,
        AppErrorCode::InvalidRemoteUrl
    );

    let after = set_remote_url(
        repo.clone(),
        "origin".into(),
        "https://alice:secret@example.test/moved.git".into(),
    )
    .unwrap();
    assert_eq!(after.remotes[0].url, "https://example.test/moved.git");
    assert!(
        !after.remotes[0].has_hidden_credentials,
        "GitOdile stores the address without the password, exactly as connecting one does"
    );
    let configured = git_command(&repo)
        .args(["config", "--local", "--get", "remote.origin.url"])
        .output()
        .unwrap();
    assert_eq!(
        String::from_utf8_lossy(&configured.stdout).trim(),
        "https://example.test/moved.git"
    );

    for path in [repo, remote] {
        let _ = fs::remove_dir_all(path);
    }
}

const EIGHT_LINES: &str = "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n";

/// A published repository whose `lines.txt` has eight lines, and a second
/// clone of its remote to make team changes from.
fn repo_with_lines(label: &str) -> (String, String, String, String) {
    let (repo, remote, branch) = published_repo_and_remote(label);
    set_identity(&repo);
    write_file(&repo, "lines.txt", EIGHT_LINES);
    git_add_all(&repo);
    git_commit(&repo, "eight lines");
    push(&repo, &branch);
    let other = clone_remote(&remote, &format!("{label}-other"));
    (repo, remote, other, branch)
}

fn recovery_ref_exists(repo: &str, reference: &str) -> bool {
    test_git(repo, &["rev-parse", "--verify", reference])
        .unwrap()
        .status
        .success()
}

#[test]
fn diverged_branches_without_overlap_are_combined_with_a_merge_version() {
    let (repo, remote, branch) = published_repo_and_remote("get-merge");
    set_identity(&repo);
    let other = clone_remote(&remote, "get-merge-other");
    write_file(&other, "team.txt", "team\n");
    git_add_all(&other);
    git_commit(&other, "team side");
    push(&other, &branch);
    write_file(&repo, "local.txt", "local\n");
    git_add_all(&repo);
    git_commit(&repo, "local side");
    write_file(&repo, "a.txt", "unsaved and separate\n");
    let previous = head(&repo);
    let remote_head = remote_branch_sha(&remote, &format!("refs/heads/{branch}")).unwrap();

    let status = check_team_changes(repo.clone(), session("merge")).unwrap();
    assert_eq!(status.state, TeamSyncState::Diverged);
    let forecast = status
        .forecast
        .expect("a diverged branch carries a forecast");
    assert_eq!(forecast.outcome, ForecastOutcome::Clear);
    assert_eq!(forecast.integration, IntegrationKind::Merge);
    assert_eq!(forecast.incoming_count, 1);
    assert_eq!(forecast.local_count, 1);
    assert_eq!(forecast.carried_unsaved_count, 1);
    assert!(status.next_actions.contains(&SyncNextAction::ReviewAndGet));

    let plan = plan_get_team_changes(repo.clone(), session("merge")).unwrap();
    let result = get_team_changes(
        repo.clone(),
        session("merge"),
        plan.state_token,
        plan.recovery.reference.clone(),
        true,
        |_| {},
    )
    .unwrap();
    assert_eq!(result.outcome, GetTeamChangesOutcome::Completed);
    assert_eq!(result.integration, IntegrationKind::Merge);
    let parents =
        git_stdout(&test_git(&repo, &["rev-list", "--parents", "-n", "1", "HEAD"]).unwrap());
    let parents = parents.split_whitespace().collect::<Vec<_>>();
    assert_eq!(parents.len(), 3, "a merge version has two parents");
    assert_eq!(parents[1], previous);
    assert_eq!(parents[2], remote_head);
    assert_eq!(
        git_stdout(&test_git(&repo, &["log", "-1", "--format=%s"]).unwrap()),
        format!("Merge remote-tracking branch 'origin/{branch}'")
    );
    assert_eq!(read_text(&repo, "team.txt"), "team\n");
    assert_eq!(read_text(&repo, "local.txt"), "local\n");
    assert_eq!(read_text(&repo, "a.txt"), "unsaved and separate\n");
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", &plan.recovery.reference]).unwrap()),
        previous
    );
    let sync = result
        .sync_status
        .expect("a completed merge reports status");
    assert_eq!(sync.state, TeamSyncState::Ahead);
    assert_eq!(sync.ahead, 2);
    assert!(sync.forecast.is_none());

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn diverged_branches_that_change_the_same_lines_are_refused_with_the_files() {
    let (repo, remote, branch) = published_repo_and_remote("get-merge-overlap");
    set_identity(&repo);
    let other = clone_remote(&remote, "get-merge-overlap-other");
    write_file(&other, "a.txt", "team\n");
    git_add_all(&other);
    git_commit(&other, "team edit");
    push(&other, &branch);
    write_file(&repo, "a.txt", "local\n");
    git_add_all(&repo);
    git_commit(&repo, "local edit");
    let previous = head(&repo);

    let status = check_team_changes(repo.clone(), session("merge-overlap")).unwrap();
    let forecast = status.forecast.unwrap();
    assert_eq!(forecast.outcome, ForecastOutcome::Overlap);
    assert_eq!(
        forecast.overlaps,
        vec![ForecastOverlap {
            path: "a.txt".to_string(),
            side: OverlapSide::Saved,
        }]
    );
    let plan = plan_get_team_changes(repo.clone(), session("merge-overlap")).unwrap();
    assert_eq!(plan.forecast.outcome, ForecastOutcome::Overlap);
    let error = get_team_changes(
        repo.clone(),
        session("merge-overlap"),
        plan.state_token,
        plan.recovery.reference.clone(),
        true,
        |_| {},
    )
    .unwrap_err();
    assert_eq!(error.code, AppErrorCode::IncomingTrackedChangeCollision);
    assert_eq!(head(&repo), previous);
    assert_eq!(read_text(&repo, "a.txt"), "local\n");
    assert!(!recovery_ref_exists(&repo, &plan.recovery.reference));

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn unsaved_edits_on_other_lines_of_an_incoming_file_stay_unsaved_on_top_of_it() {
    let (repo, remote, other, branch) = repo_with_lines("get-combine");
    write_file(&other, "lines.txt", "l1\nl2\nl3\nl4\nl5\nl6\nl7\nTEAM\n");
    git_add_all(&other);
    git_commit(&other, "team edits the last line");
    push(&other, &branch);
    write_file(&repo, "lines.txt", "LOCAL\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n");
    let remote_head = remote_branch_sha(&remote, &format!("refs/heads/{branch}")).unwrap();

    let status = check_team_changes(repo.clone(), session("combine")).unwrap();
    let forecast = status.forecast.unwrap();
    assert_eq!(forecast.outcome, ForecastOutcome::Clear);
    assert_eq!(forecast.combined_unsaved, vec!["lines.txt".to_string()]);
    assert_eq!(forecast.carried_unsaved_count, 0);

    let plan = plan_get_team_changes(repo.clone(), session("combine")).unwrap();
    let result = get_team_changes(
        repo.clone(),
        session("combine"),
        plan.state_token,
        plan.recovery.reference,
        true,
        |_| {},
    )
    .unwrap();
    assert_eq!(result.outcome, GetTeamChangesOutcome::Completed);
    assert_eq!(result.combined_unsaved_count, 1);
    assert_eq!(head(&repo), remote_head);
    assert_eq!(
        read_text(&repo, "lines.txt"),
        "LOCAL\nl2\nl3\nl4\nl5\nl6\nl7\nTEAM\n"
    );
    // The incoming version is saved; the local edit is still only unsaved.
    assert!(test_git(&repo, &["diff", "--cached", "--quiet"])
        .unwrap()
        .status
        .success());
    assert!(!test_git(&repo, &["diff", "--quiet", "--", "lines.txt"])
        .unwrap()
        .status
        .success());
    let unsaved_reference = result
        .recovery
        .unsaved_reference
        .clone()
        .expect("combined unsaved content is kept");
    let kept =
        git_stdout(&test_git(&repo, &["show", &format!("{unsaved_reference}:lines.txt")]).unwrap())
            .replace("\r\n", "\n");
    assert_eq!(kept, "LOCAL\nl2\nl3\nl4\nl5\nl6\nl7\nl8");

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

// More than 5 s on Windows: a published repository, second clone and fetch
// are required to prove both upstream execution paths preserve unsaved overlap.
#[test]
fn unsaved_edits_to_the_same_lines_are_refused_and_left_untouched() {
    let (repo, remote, other, branch) = repo_with_lines("get-unsaved-overlap");
    write_file(&other, "lines.txt", "TEAM\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n");
    git_add_all(&other);
    git_commit(&other, "team edits the first line");
    push(&other, &branch);
    write_file(&repo, "lines.txt", "LOCAL\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n");
    let previous = head(&repo);

    let status = check_team_changes(repo.clone(), session("unsaved-overlap")).unwrap();
    let forecast = status.forecast.unwrap();
    assert_eq!(forecast.outcome, ForecastOutcome::Overlap);
    assert_eq!(
        forecast.overlaps,
        vec![ForecastOverlap {
            path: "lines.txt".to_string(),
            side: OverlapSide::Unsaved,
        }]
    );
    let plan = plan_get_team_changes(repo.clone(), session("unsaved-overlap")).unwrap();
    assert_eq!(
        start_overlapping_merge(
            repo.clone(),
            session("unsaved-overlap"),
            OverlappingMergeSource::Upstream,
            plan.state_token.clone(),
            plan.recovery.reference.clone()
        )
        .unwrap_err()
        .code,
        AppErrorCode::IncomingTrackedChangeCollision
    );
    assert!(!recovery_ref_exists(&repo, &plan.recovery.reference));
    let error = get_team_changes(
        repo.clone(),
        session("unsaved-overlap"),
        plan.state_token,
        plan.recovery.reference,
        true,
        |_| {},
    )
    .unwrap_err();
    assert_eq!(error.code, AppErrorCode::IncomingTrackedChangeCollision);
    assert_eq!(head(&repo), previous);
    assert_eq!(
        read_text(&repo, "lines.txt"),
        "LOCAL\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n"
    );

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn a_prepared_edit_to_an_incoming_file_blocks_even_on_other_lines() {
    let (repo, remote, other, branch) = repo_with_lines("get-prepared-overlap");
    write_file(&other, "lines.txt", "l1\nl2\nl3\nl4\nl5\nl6\nl7\nTEAM\n");
    git_add_all(&other);
    git_commit(&other, "team edits the last line");
    push(&other, &branch);
    write_file(&repo, "lines.txt", "LOCAL\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n");
    git_add(&repo, "lines.txt");

    let status = check_team_changes(repo.clone(), session("prepared-overlap")).unwrap();
    assert_eq!(
        status.forecast.unwrap().blocker,
        Some(ForecastBlocker {
            kind: ForecastBlockerKind::PreparedOverlap,
            path: Some("lines.txt".to_string()),
        })
    );

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn merge_hooks_can_stop_the_merge_version_before_anything_moves() {
    let (repo, remote, branch) = published_repo_and_remote("get-merge-hook");
    set_identity(&repo);
    let other = clone_remote(&remote, "get-merge-hook-other");
    write_file(&other, "team.txt", "team\n");
    git_add_all(&other);
    git_commit(&other, "team side");
    push(&other, &branch);
    write_file(&repo, "local.txt", "local\n");
    git_add_all(&repo);
    git_commit(&repo, "local side");
    let previous = head(&repo);
    let git_dir = git_stdout(&test_git(&repo, &["rev-parse", "--absolute-git-dir"]).unwrap());
    write_failing_hook(Path::new(&git_dir), "pre-merge-commit");

    let plan = plan_after_check(&repo, "merge-hook").unwrap();
    let error = get_team_changes(
        repo.clone(),
        session("merge-hook"),
        plan.state_token,
        plan.recovery.reference.clone(),
        true,
        |_| {},
    )
    .unwrap_err();
    assert_eq!(error.code, AppErrorCode::HookRejected);
    assert_eq!(head(&repo), previous);
    assert!(!Path::new(&repo).join("team.txt").exists());
    assert!(!recovery_ref_exists(&repo, &plan.recovery.reference));

    // With hooks turned off in Settings, the same update goes through.
    let plan = plan_get_team_changes(repo.clone(), session("merge-hook")).unwrap();
    let result = get_team_changes(
        repo.clone(),
        session("merge-hook"),
        plan.state_token,
        plan.recovery.reference,
        false,
        |_| {},
    )
    .unwrap();
    assert_eq!(result.outcome, GetTeamChangesOutcome::Completed);
    assert_eq!(read_text(&repo, "team.txt"), "team\n");

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn a_split_index_still_lets_the_plan_prove_separate_unsaved_work_can_be_carried() {
    let (repo, remote, branch) = published_repo_and_remote("get-split-index");
    let other = clone_remote(&remote, "get-split-index-other");
    write_file(&other, "team.txt", "team\n");
    git_add_all(&other);
    git_commit(&other, "team");
    push(&other, &branch);
    // The dry run reads a copy of the index; with a split index that copy
    // names a sharedindex file Git must still find.
    assert!(git_command(&repo)
        .args(["config", "core.splitIndex", "true"])
        .status()
        .unwrap()
        .success());
    assert!(git_command(&repo)
        .args(["update-index", "--split-index"])
        .status()
        .unwrap()
        .success());
    write_file(&repo, "a.txt", "local unsaved\n");

    let plan = plan_after_check(&repo, "split-index").unwrap();
    assert_eq!(plan.forecast.outcome, ForecastOutcome::Clear);
    let result = get_team_changes(
        repo.clone(),
        session("split-index"),
        plan.state_token,
        plan.recovery.reference,
        true,
        |_| {},
    )
    .unwrap();
    assert_eq!(result.outcome, GetTeamChangesOutcome::Completed);
    assert_eq!(read_text(&repo, "a.txt"), "local unsaved\n");
    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

#[test]
fn remote_home_names_the_published_remote_and_never_reports_one_missing() {
    let (repo, remote, _branch) = published_repo_and_remote("remote-home");
    let leaf = std::path::Path::new(&remote)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap()
        .to_string();

    // The branch publishes to origin, a folder on this machine: named by its
    // folder, with no page to open.
    let home = crate::sync::read_remote_home(repo.clone())
        .unwrap()
        .unwrap();
    assert_eq!(home.remote, "origin");
    assert_eq!(home.provider, crate::sync::RemoteHomeProvider::Other);
    assert_eq!(home.label, leaf);
    assert!(!home.has_web_page);

    // An address this cannot read is still a remote, named by its own name.
    wire_remote(&repo, "mirror", "sso://team/app");
    let status = std::process::Command::new("git")
        .current_dir(&repo)
        .args(["branch", "--unset-upstream"])
        .status()
        .unwrap();
    assert!(status.success());
    let status = std::process::Command::new("git")
        .current_dir(&repo)
        .args(["remote", "rename", "origin", "backup"])
        .status()
        .unwrap();
    assert!(status.success());
    let home = crate::sync::read_remote_home(repo.clone())
        .unwrap()
        .unwrap();
    assert_eq!(home.remote, "backup");
    let status = std::process::Command::new("git")
        .current_dir(&repo)
        .args(["remote", "remove", "backup"])
        .status()
        .unwrap();
    assert!(status.success());
    let home = crate::sync::read_remote_home(repo.clone())
        .unwrap()
        .unwrap();
    assert_eq!(home.remote, "mirror");
    assert_eq!(home.label, "mirror");
    assert!(!home.has_web_page);

    // No page can be opened for a remote that has none, or does not exist.
    // (`open_remote_home` authorizes the project before asking.)
    let access = application::authorize_repository(&repo, "open_remote_home", None).unwrap();
    assert_eq!(
        crate::sync::remote_web_page(&repo, "mirror")
            .unwrap_err()
            .code,
        AppErrorCode::RemoteNotFound
    );
    assert_eq!(
        crate::sync::remote_web_page(&repo, "elsewhere")
            .unwrap_err()
            .code,
        AppErrorCode::RemoteNotFound
    );
    drop(access);

    // With no remote at all, there is none to name.
    let status = std::process::Command::new("git")
        .current_dir(&repo)
        .args(["remote", "remove", "mirror"])
        .status()
        .unwrap();
    assert!(status.success());
    assert_eq!(crate::sync::read_remote_home(repo).unwrap(), None);
}

// Bringing in another branch (task 065-4-1).

fn local_branch(name: &str) -> IntegrationSource {
    IntegrationSource::LocalBranch {
        name: name.to_string(),
    }
}

fn plan_bring_in(
    repo: &str,
    label: &str,
    source: &IntegrationSource,
) -> Result<BringInChangesPlan, AppError> {
    plan_bring_in_changes(repo.to_string(), session(label), source.clone())
}

fn bring_in(
    repo: &str,
    label: &str,
    source: &IntegrationSource,
    plan: &BringInChangesPlan,
) -> Result<BringInChangesResult, AppError> {
    bring_in_changes(
        repo.to_string(),
        session(label),
        source.clone(),
        plan.state_token.clone(),
        plan.recovery.reference.clone(),
        true,
        |_| {},
    )
}

fn parents_of_head(repo: &str) -> Vec<String> {
    git_stdout(&test_git(repo, &["rev-list", "--parents", "-n", "1", "HEAD"]).unwrap())
        .split_whitespace()
        .skip(1)
        .map(str::to_string)
        .collect()
}

fn tree_of(repo: &str, revision: &str) -> String {
    git_stdout(&test_git(repo, &["rev-parse", &format!("{revision}^{{tree}}")]).unwrap())
}

/// Git's merge wording names the destination unless `merge.suppressDest`
/// leaves it out, which by default it does only for `master`.
fn merge_subject(what: &str, into: &str) -> String {
    if into == "master" {
        what.to_string()
    } else {
        format!("{what} into {into}")
    }
}

fn write_hook(repo: &str, name: &str, body: &str) {
    let hooks = Path::new(repo).join(".git").join("hooks");
    fs::create_dir_all(&hooks).unwrap();
    let hook = hooks.join(name);
    fs::write(&hook, format!("#!/bin/sh\n{body}\n")).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&hook, fs::Permissions::from_mode(0o755)).unwrap();
    }
}

// About 9 s alone on Windows, 2.5 s of it the published fixture: three
// integrations of about 30 Git processes each share that fixture, which three
// separate tests would build three times.
#[test]
fn bringing_in_a_local_branch_fast_forwards_merges_and_records_an_empty_merge() {
    let (repo, remote, main) = published_repo_and_remote("bring-in-outcomes");
    set_identity(&repo);
    assert!(git_succeeds(&repo, &["switch", "-q", "-c", "feature"]));
    save_file(&repo, "feature.txt", "feature work");
    let feature = head(&repo);
    assert!(git_succeeds(&repo, &["switch", "-q", &main]));
    let base = head(&repo);
    write_file(&repo, "a.txt", "hello, unsaved\n");

    let source = local_branch("feature");
    let plan = plan_bring_in(&repo, "outcomes", &source).unwrap();
    assert_eq!(plan.kind, BringInKind::FastForward);
    assert_eq!(plan.source.label, "feature");
    assert_eq!(plan.source.reference, "refs/heads/feature");
    assert_eq!(plan.source.commit, feature);
    assert_eq!(plan.incoming_count, 1);
    assert_eq!(plan.file_impact.total_count, 1);
    assert!(plan.merge_message.is_none());
    assert!(plan
        .recovery
        .reference
        .starts_with("refs/gitodile/recovery/v1/bring-in-changes/"));
    let result = bring_in(&repo, "outcomes", &source, &plan).unwrap();
    assert_eq!(result.outcome, GetTeamChangesOutcome::Completed);
    assert_eq!(result.kind, BringInKind::FastForward);
    assert_eq!(head(&repo), feature);
    assert_eq!(read_text(&repo, "a.txt"), "hello, unsaved\n");
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", &plan.recovery.reference]).unwrap()),
        base
    );
    assert_eq!(result.recovery.tracking_ref, "refs/heads/feature");

    let contained = plan_bring_in(&repo, "outcomes", &source).unwrap();
    assert_eq!(contained.kind, BringInKind::AlreadyContained);
    assert!(contained.forecast.is_none());
    assert!(!contained.requires_confirmation);
    assert_eq!(
        bring_in(&repo, "outcomes", &source, &contained)
            .unwrap_err()
            .code,
        AppErrorCode::NothingToGet
    );

    // A branch that parted earlier is joined by a merge version, after the
    // project's merge hook ran.
    write_file(&repo, "a.txt", "hello\n");
    assert!(git_succeeds(&repo, &["switch", "-q", "-c", "topic", &base]));
    save_file(&repo, "topic.txt", "topic work");
    let topic = head(&repo);
    assert!(git_succeeds(&repo, &["switch", "-q", &main]));
    write_hook(&repo, "pre-merge-commit", "touch .git/pre-merge-ran");
    let source = local_branch("topic");
    let plan = plan_bring_in(&repo, "outcomes", &source).unwrap();
    assert_eq!(plan.kind, BringInKind::Merge);
    let subject = merge_subject("Merge branch 'topic'", &main);
    assert_eq!(plan.merge_message.as_deref(), Some(subject.as_str()));
    bring_in(&repo, "outcomes", &source, &plan).unwrap();
    assert_eq!(parents_of_head(&repo), vec![feature.clone(), topic]);
    assert!(Path::new(&repo).join(".git/pre-merge-ran").is_file());
    assert_eq!(
        git_stdout(&test_git(&repo, &["log", "-1", "--format=%s"]).unwrap()),
        subject
    );
    assert_eq!(read_text(&repo, "topic.txt"), "topic work\n");

    // The same change saved on both sides: a merge version records that the
    // branch is included, and no file changes.
    assert!(git_succeeds(
        &repo,
        &["switch", "-q", "-c", "same", &feature]
    ));
    save_file(&repo, "same.txt", "same change");
    assert!(git_succeeds(&repo, &["switch", "-q", &main]));
    save_file(&repo, "same.txt", "same change");
    let before = head(&repo);
    let source = local_branch("same");
    let plan = plan_bring_in(&repo, "outcomes", &source).unwrap();
    assert_eq!(plan.kind, BringInKind::EmptyMerge);
    assert_eq!(plan.file_impact.total_count, 0);
    assert!(plan.merge_message.is_some());
    bring_in(&repo, "outcomes", &source, &plan).unwrap();
    assert_eq!(parents_of_head(&repo).len(), 2);
    assert_eq!(tree_of(&repo, "HEAD"), tree_of(&repo, &before));

    for path in [repo, remote] {
        let _ = fs::remove_dir_all(path);
    }
}

// About 18 s alone on Windows: real Git proves the cached source, merge,
// recovery, exact selected-source fetch, custom mapping and exclusion. The
// published fixture, second clone and commits cannot be replaced by a parser.
#[test]
fn bringing_in_a_remote_branch_reads_its_last_check_and_names_it_like_git() {
    let (repo, remote, main) = published_repo_and_remote("bring-in-remote");
    set_identity(&repo);
    let other = clone_remote(&remote, "bring-in-remote-other");
    set_identity(&other);
    assert!(git_succeeds(&other, &["switch", "-q", "-c", "team"]));
    save_file(&other, "team.txt", "team work");
    assert!(git_succeeds(&other, &["push", "-q", "origin", "team"]));
    assert!(git_succeeds(&repo, &["fetch", "-q", "origin"]));
    let team = remote_branch_sha(&remote, "refs/heads/team").unwrap();
    save_file(&repo, "local.txt", "local work");
    let previous = head(&repo);
    // Exact HEAD refs must survive an ambiguous short name during planning,
    // execution verification and source inventory.
    assert!(git_succeeds(&repo, &["tag", &main]));
    // The remote moves after the last check; nothing here may see it.
    save_file(&other, "later.txt", "later work");
    push(&other, "team");

    let source = IntegrationSource::RemoteBranch {
        remote: "origin".to_string(),
        branch: "team".to_string(),
    };
    // The project's own `merge.suppressDest` decides the title, as for
    // `git merge`.
    assert!(git_succeeds(&repo, &["config", "merge.suppressDest", "*"]));
    let plan = plan_bring_in(&repo, "remote", &source).unwrap();
    assert_eq!(plan.kind, BringInKind::Merge);
    assert_eq!(plan.source.label, "origin/team");
    assert_eq!(plan.source.remote.as_deref(), Some("origin"));
    assert_eq!(plan.source.reference, "refs/remotes/origin/team");
    assert_eq!(plan.source.commit, team);
    assert_eq!(
        plan.merge_message.as_deref(),
        Some("Merge remote-tracking branch 'origin/team'")
    );
    let result = bring_in(&repo, "remote", &source, &plan).unwrap();
    assert_eq!(result.outcome, GetTeamChangesOutcome::Completed);
    assert_eq!(parents_of_head(&repo), vec![previous, team.clone()]);
    assert_eq!(result.recovery.remote, "origin");
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", "refs/remotes/origin/team"]).unwrap()),
        team,
        "bringing in never fetches"
    );

    for (source, code) in [
        (
            IntegrationSource::RemoteBranch {
                remote: "upstream".to_string(),
                branch: "team".to_string(),
            },
            AppErrorCode::InvalidRemoteConfiguration,
        ),
        (
            IntegrationSource::RemoteBranch {
                remote: "origin".to_string(),
                branch: "never-checked".to_string(),
            },
            AppErrorCode::BranchMissing,
        ),
    ] {
        assert_eq!(
            plan_bring_in(&repo, "remote", &source).unwrap_err().code,
            code
        );
    }

    // An explicit check must update only the chosen branch through its
    // configured mapping, never the checked-out branch's upstream.
    assert!(git_succeeds(
        &repo,
        &[
            "config",
            "remote.origin.fetch",
            "+refs/heads/team:refs/remotes/custom/team"
        ]
    ));
    assert!(git_succeeds(
        &repo,
        &["update-ref", "refs/remotes/custom/team", &team]
    ));
    let inventory =
        serde_json::to_value(crate::sync::list_integration_sources(repo.clone()).unwrap()).unwrap();
    assert!(inventory["sources"]
        .as_array()
        .unwrap()
        .iter()
        .any(|value| value["remote"] == "origin" && value["branch"] == "team"));
    assert!(!inventory["sources"]
        .as_array()
        .unwrap()
        .iter()
        .any(|value| value["kind"] == "localBranch" && value["name"] == main));
    let upstream_before = git_stdout(&test_git(&repo, &["rev-parse", "@{upstream}"]).unwrap());
    crate::sync::check_integration_source(repo.clone(), source.clone()).unwrap();
    let checked = plan_bring_in(&repo, "remote", &source).unwrap();
    assert_eq!(checked.source.reference, "refs/remotes/custom/team");
    assert_eq!(checked.source.commit, head(&other));
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", "@{upstream}"]).unwrap()),
        upstream_before
    );
    assert!(git_succeeds(
        &repo,
        &["config", "--add", "remote.origin.fetch", "^refs/heads/team"]
    ));
    assert_eq!(
        crate::sync::check_integration_source(repo.clone(), source.clone())
            .unwrap_err()
            .code,
        AppErrorCode::InvalidRemoteConfiguration
    );

    for path in [repo, remote, other] {
        let _ = fs::remove_dir_all(path);
    }
}

// About 6 s alone on Windows: the published fixture and three plans, one per
// way a reviewed plan goes stale.
#[test]
fn bringing_in_is_stale_when_the_source_the_branch_or_the_work_moved_after_review() {
    let (repo, remote, main) = published_repo_and_remote("bring-in-stale");
    set_identity(&repo);
    assert!(git_succeeds(&repo, &["switch", "-q", "-c", "feature"]));
    save_file(&repo, "feature.txt", "feature work");
    assert!(git_succeeds(&repo, &["switch", "-q", &main]));
    let source = local_branch("feature");
    let mut references = Vec::new();

    let moved_source = plan_bring_in(&repo, "stale", &source).unwrap();
    assert!(git_succeeds(&repo, &["switch", "-q", "feature"]));
    save_file(&repo, "other.txt", "another feature version");
    assert!(git_succeeds(&repo, &["switch", "-q", &main]));
    let before = head(&repo);
    assert_eq!(
        bring_in(&repo, "stale", &source, &moved_source)
            .unwrap_err()
            .code,
        AppErrorCode::StaleBringInPlan
    );
    references.push(moved_source.recovery.reference);

    let changed_work = plan_bring_in(&repo, "stale", &source).unwrap();
    write_file(&repo, "a.txt", "edited after the review\n");
    assert_eq!(
        bring_in(&repo, "stale", &source, &changed_work)
            .unwrap_err()
            .code,
        AppErrorCode::StaleBringInPlan
    );
    references.push(changed_work.recovery.reference);

    let moved_branch = plan_bring_in(&repo, "stale", &source).unwrap();
    save_file(&repo, "main.txt", "main moved");
    let moved = head(&repo);
    assert_ne!(moved, before);
    assert_eq!(
        bring_in(&repo, "stale", &source, &moved_branch)
            .unwrap_err()
            .code,
        AppErrorCode::StaleBringInPlan
    );
    references.push(moved_branch.recovery.reference);

    assert_eq!(head(&repo), moved);
    assert!(!Path::new(&repo).join("other.txt").exists());
    for reference in references {
        assert!(!recovery_ref_exists(&repo, &reference));
    }

    for path in [repo, remote] {
        let _ = fs::remove_dir_all(path);
    }
}

fn file_url(path: &str) -> String {
    let path = path.replace('\\', "/");
    if path.starts_with('/') {
        format!("file://{path}")
    } else {
        format!("file:///{path}")
    }
}

// About 5 s alone on Windows: the published fixture, a shallow clone and one
// plan per blocking state, each refused before any analysis runs.
#[test]
fn bringing_in_refuses_states_it_cannot_combine_safely() {
    let (repo, remote, main) = published_repo_and_remote("bring-in-blocked");
    set_identity(&repo);
    let code = |repo: &str, source: &IntegrationSource| {
        plan_bring_in(repo, "blocked", source).unwrap_err().code
    };
    assert_eq!(
        code(&repo, &local_branch(&main)),
        AppErrorCode::BranchIsActive
    );
    assert_eq!(
        code(&repo, &local_branch("missing")),
        AppErrorCode::BranchMissing
    );

    assert!(git_succeeds(&repo, &["switch", "-q", "--orphan", "lonely"]));
    save_file(&repo, "lonely.txt", "lonely work");
    assert!(git_succeeds(&repo, &["switch", "-q", "-f", &main]));
    let lonely = local_branch("lonely");
    assert_eq!(code(&repo, &lonely), AppErrorCode::NoSharedHistory);

    assert!(git_succeeds(
        &repo,
        &["config", "core.sparseCheckout", "true"]
    ));
    assert_eq!(code(&repo, &lonely), AppErrorCode::UnsupportedMergeSetup);
    assert!(git_succeeds(
        &repo,
        &["config", "--unset", "core.sparseCheckout"]
    ));

    let marker = Path::new(&repo).join(".git").join("CHERRY_PICK_HEAD");
    fs::write(&marker, format!("{}\n", head(&repo))).unwrap();
    assert_eq!(code(&repo, &lonely), AppErrorCode::GitOperationInProgress);
    fs::remove_file(&marker).unwrap();

    assert!(git_succeeds(&repo, &["checkout", "-q", "--detach"]));
    assert_eq!(code(&repo, &lonely), AppErrorCode::DetachedHead);
    assert!(git_succeeds(&repo, &["switch", "-q", &main]));

    let unborn = unique_temp_dir("bring-in-blocked-unborn");
    git_init(&unborn);
    assert_eq!(
        code(&unborn, &local_branch("anything")),
        AppErrorCode::UnbornBranchNoVersion
    );

    // A shallow copy holds neither branch's history back to where they parted.
    assert!(git_succeeds(&repo, &["switch", "-q", "-c", "deep"]));
    save_file(&repo, "deep.txt", "deep work");
    assert!(git_succeeds(&repo, &["switch", "-q", &main]));
    save_file(&repo, "main.txt", "main work");
    assert!(git_succeeds(
        &repo,
        &["push", "-q", "origin", &main, "deep"]
    ));
    let shallow = unique_temp_dir("bring-in-blocked-shallow");
    assert!(base_git_command()
        .args([
            "clone",
            "-q",
            "--depth",
            "1",
            "--no-single-branch",
            &file_url(&remote),
            &shallow,
        ])
        .status()
        .unwrap()
        .success());
    let deep = IntegrationSource::RemoteBranch {
        remote: "origin".to_string(),
        branch: "deep".to_string(),
    };
    assert_eq!(code(&shallow, &deep), AppErrorCode::ShallowHistory);

    for path in [repo, remote, unborn, shallow] {
        let _ = fs::remove_dir_all(path);
    }
}

// About 7 s alone on Windows: the published fixture, three refused merge
// versions against one plan, and an overlapping branch.
#[test]
fn merge_version_failures_and_overlaps_leave_the_project_untouched() {
    let (repo, remote, main) = published_repo_and_remote("bring-in-failures");
    set_identity(&repo);
    assert!(git_succeeds(&repo, &["switch", "-q", "-c", "feature"]));
    save_file(&repo, "feature.txt", "feature work");
    assert!(git_succeeds(&repo, &["switch", "-q", &main]));
    save_file(&repo, "main.txt", "main work");
    let before = head(&repo);
    let source = local_branch("feature");
    let plan = plan_bring_in(&repo, "failures", &source).unwrap();
    assert_eq!(plan.kind, BringInKind::Merge);
    // Each failure changes nothing, so the one reviewed plan stays valid for
    // the next attempt.
    let attempt = || {
        let code = bring_in(&repo, "failures", &source, &plan)
            .unwrap_err()
            .code;
        assert_eq!(head(&repo), before);
        assert!(!Path::new(&repo).join("feature.txt").exists());
        assert!(!recovery_ref_exists(&repo, &plan.recovery.reference));
        code
    };

    write_failing_hook(&Path::new(&repo).join(".git"), "pre-merge-commit");
    assert_eq!(attempt(), AppErrorCode::HookRejected);
    fs::remove_file(Path::new(&repo).join(".git/hooks/pre-merge-commit")).unwrap();

    assert!(git_succeeds(&repo, &["config", "user.name", ""]));
    assert_eq!(attempt(), AppErrorCode::MissingIdentity);
    set_identity(&repo);

    let gpg = write_fake_failing_gpg("bring-in-failures");
    assert!(git_succeeds(&repo, &["config", "commit.gpgSign", "true"]));
    assert!(git_succeeds(&repo, &["config", "gpg.program", &gpg]));
    assert_eq!(attempt(), AppErrorCode::SigningFailed);
    assert!(git_succeeds(
        &repo,
        &["config", "--unset", "commit.gpgSign"]
    ));

    // The same lines changed on both sides: named, and refused until the
    // user chooses to resolve them (task 065-4-2).
    assert!(git_succeeds(
        &repo,
        &["switch", "-q", "-c", "clash", &before]
    ));
    save_file(&repo, "a.txt", "clash side");
    assert!(git_succeeds(&repo, &["switch", "-q", &main]));
    save_file(&repo, "a.txt", "main side");
    let clash = local_branch("clash");
    let plan = plan_bring_in(&repo, "overlap", &clash).unwrap();
    let forecast = plan.forecast.clone().unwrap();
    assert_eq!(forecast.outcome, ForecastOutcome::Overlap);
    assert_eq!(forecast.overlaps[0].path, "a.txt");
    let main_tip = head(&repo);
    assert_eq!(
        bring_in(&repo, "overlap", &clash, &plan).unwrap_err().code,
        AppErrorCode::IncomingTrackedChangeCollision
    );
    assert_eq!(head(&repo), main_tip);
    assert_eq!(read_text(&repo, "a.txt"), "main side\n");

    for path in [repo, remote] {
        let _ = fs::remove_dir_all(path);
    }
}

// About 5 s alone on Windows: the published fixture, a linked worktree and one
// merge in it.
#[test]
fn a_linked_worktree_brings_changes_into_its_own_branch_and_owns_its_recovery() {
    let (repo, remote, main) = published_repo_and_remote("bring-in-worktree");
    set_identity(&repo);
    assert!(git_succeeds(&repo, &["switch", "-q", "-c", "feature"]));
    save_file(&repo, "feature.txt", "feature work");
    let feature = head(&repo);
    assert!(git_succeeds(&repo, &["switch", "-q", &main]));
    let main_tip = head(&repo);
    let linked = unique_temp_dir("bring-in-worktree-linked");
    assert!(git_succeeds(
        &repo,
        &["worktree", "add", "-q", "-b", "side", &linked, &main]
    ));
    save_file(&linked, "side.txt", "side work");
    let side = head(&linked);

    let source = local_branch("feature");
    let owner = |reference: &str| reference.split('/').nth(5).unwrap().to_string();
    let main_plan = plan_bring_in(&repo, "worktree", &source).unwrap();
    let plan = plan_bring_in(&linked, "worktree", &source).unwrap();
    assert_eq!(plan.kind, BringInKind::Merge);
    assert_ne!(
        owner(&plan.recovery.reference),
        owner(&main_plan.recovery.reference)
    );
    bring_in(&linked, "worktree", &source, &plan).unwrap();
    assert_eq!(parents_of_head(&linked), vec![side.clone(), feature]);
    assert_eq!(read_text(&linked, "feature.txt"), "feature work\n");
    // The main worktree's branch and files are untouched; the recovery ref is
    // shared through the common repository.
    assert_eq!(head(&repo), main_tip);
    assert!(!Path::new(&repo).join("feature.txt").exists());
    assert_eq!(
        git_stdout(&test_git(&repo, &["rev-parse", &plan.recovery.reference]).unwrap()),
        side
    );

    for path in [linked, repo, remote] {
        let _ = fs::remove_dir_all(path);
    }
}

/// A local overlap needs no published fixture or fetch. The upstream tests
/// configure an already-known tracking ref in this same small repository.
fn overlapping_project(label: &str) -> String {
    let repo = unique_temp_dir(label);
    assert!(git_succeeds(&repo, &["init", "-q", "-b", "main"]));
    set_identity(&repo);
    assert!(git_succeeds(&repo, &["config", "core.autocrlf", "false"]));
    write_file(&repo, "clash.txt", "base\n");
    write_file(&repo, "shared.txt", "base\n");
    write_file(&repo, "notes.txt", "notes\n");
    git_add_all(&repo);
    git_commit(&repo, "base");
    assert!(git_succeeds(&repo, &["switch", "-q", "-c", "feature"]));
    write_file(&repo, "clash.txt", "incoming\n");
    write_file(&repo, "shared.txt", "same on both sides\n");
    write_file(&repo, "new.txt", "new\n");
    git_add_all(&repo);
    git_commit(&repo, "incoming");
    assert!(git_succeeds(&repo, &["switch", "-q", "main"]));
    write_file(&repo, "clash.txt", "current\n");
    write_file(&repo, "shared.txt", "same on both sides\n");
    git_add_all(&repo);
    git_commit(&repo, "current");
    repo
}

fn start_branch_overlap(
    repo: &str,
    label: &str,
    plan: &BringInChangesPlan,
) -> Result<StartOverlappingMergeResult, AppError> {
    start_overlapping_merge(
        repo.to_string(),
        session(label),
        OverlappingMergeSource::Branch {
            source: local_branch("feature"),
        },
        plan.state_token.clone(),
        plan.recovery.reference.clone(),
    )
}

// More than 5 s on Windows: a real three-version divergence, durable recovery,
// snapshot, and Git's abort are the behavior; a synthetic index cannot prove it.
#[test]
fn a_branch_overlap_pauses_and_aborts_with_carried_work_intact() {
    use crate::conflicts::{self, merge, ConflictOrigin};
    let repo = overlapping_project("start-overlap-branch");
    // Both branches changed this path identically; the merge does not touch
    // it, so its unsaved edit must remain allowed and byte-for-byte intact.
    write_file(&repo, "shared.txt", "unsaved shared work\n");
    write_file(&repo, "notes.txt", "unsaved\n");
    write_file(&repo, "untracked.txt", "keep me\n");
    // A normal dependency/build cache must not consume the conflict capture
    // budget. Its entire folder is outside the merge footprint, and ignored
    // collisions still refuse in the dedicated preflight cases below.
    fs::write(Path::new(&repo).join(".git/info/exclude"), "cache/\n").unwrap();
    fs::create_dir(Path::new(&repo).join("cache")).unwrap();
    for index in 0..=crate::conflicts::MAX_CONFLICT_FILES {
        fs::write(
            Path::new(&repo).join("cache").join(format!("{index}.bin")),
            b"cache",
        )
        .unwrap();
    }
    let before = head(&repo);
    let plan = plan_bring_in(&repo, "start", &local_branch("feature")).unwrap();
    let result = start_branch_overlap(&repo, "start", &plan).unwrap();
    assert_eq!(result.session.origin, ConflictOrigin::Gitodile);
    assert_eq!(
        result.session.operation.current.name.as_deref(),
        Some("main")
    );
    assert_eq!(
        result.session.operation.incoming.name.as_deref(),
        Some("feature")
    );
    assert_eq!(result.session.unresolved_count, 1);
    assert!(result.session.snapshot.as_ref().unwrap().complete);
    assert_eq!(head(&repo), before);
    assert_eq!(read_text(&repo, "notes.txt"), "unsaved\n");
    assert_eq!(read_text(&repo, "new.txt"), "new\n");
    assert!(recovery_ref_exists(&repo, &plan.recovery.reference));
    let abort = merge::plan_abort_merge(repo.clone()).unwrap();
    assert_eq!(abort.restoration, merge::Restoration::Exact);
    merge::abort_merge(repo.clone(), abort.state_token).unwrap();
    assert_eq!(head(&repo), before);
    assert_eq!(read_text(&repo, "clash.txt"), "current\n");
    assert_eq!(read_text(&repo, "notes.txt"), "unsaved\n");
    assert_eq!(read_text(&repo, "untracked.txt"), "keep me\n");
    assert_eq!(read_text(&repo, "shared.txt"), "unsaved shared work\n");
    assert_eq!(read_text(&repo, "cache/5000.bin"), "cache");
    assert!(!Path::new(&repo).join("new.txt").exists());
    assert!(conflicts::read_conflict_session(repo.clone())
        .unwrap()
        .is_none());
    // A terminal merge of the same heads must not inherit GitOdile's ended
    // start, origin or original snapshot (and must not promise exact abort).
    assert!(!git_succeeds(&repo, &["merge", "--no-commit", "feature"]));
    let external = conflicts::read_conflict_session(repo.clone())
        .unwrap()
        .unwrap();
    assert_eq!(external.origin, ConflictOrigin::External);
    assert!(external.snapshot.is_none());
    assert_eq!(
        merge::plan_abort_merge(repo.clone()).unwrap().restoration,
        merge::Restoration::BestEffort
    );
    assert!(git_succeeds(&repo, &["merge", "--abort"]));
    // Repeating the same pair of heads is a new pause, with its own original
    // snapshot; it must not reuse the previous attempt's reset evidence.
    let again = plan_bring_in(&repo, "start", &local_branch("feature")).unwrap();
    let second = start_branch_overlap(&repo, "start", &again).unwrap();
    assert_ne!(second.session.session_id, result.session.session_id);
    let original = Path::new(&repo)
        .join(".git/gitodile/conflicts/v1")
        .join(&result.session.session_id)
        .join("manifest.json");
    assert!(original.is_file());
    let exact = merge::plan_abort_merge(repo.clone()).unwrap();
    write_file(&repo, "notes.txt", "later work\n");
    let later = merge::plan_abort_merge(repo.clone()).unwrap();
    assert_eq!(later.restoration, merge::Restoration::BestEffort);
    assert_eq!(
        merge::abort_merge(repo.clone(), exact.state_token)
            .unwrap_err()
            .code,
        AppErrorCode::StaleConflictSession
    );
    merge::abort_merge(repo.clone(), later.state_token).unwrap();
    assert_eq!(read_text(&repo, "notes.txt"), "later work\n");
    let _ = fs::remove_dir_all(repo);
}

// More than 5 s on Windows: a paused upstream, refused commit hook, and retry
// exercise the real merge parents, commit hooks and durable resolver handoff.
#[test]
fn an_upstream_overlap_uses_gets_token_and_finishes_through_commit_hooks() {
    use crate::conflicts::{self, merge, ConflictOrigin};
    let repo = overlapping_project("start-overlap-upstream");
    for args in [
        vec!["remote", "add", "origin", "."],
        vec!["update-ref", "refs/remotes/origin/main", "feature"],
        vec!["config", "branch.main.remote", "origin"],
        vec!["config", "branch.main.merge", "refs/heads/main"],
    ] {
        assert!(git_succeeds(&repo, &args));
    }
    let before = head(&repo);
    let incoming = git_stdout(&test_git(&repo, &["rev-parse", "feature"]).unwrap());
    let plan = plan_get_team_changes(repo.clone(), session("upstream")).unwrap();
    assert_eq!(
        start_overlapping_merge(
            repo.clone(),
            session("upstream"),
            OverlappingMergeSource::Branch {
                source: local_branch("feature")
            },
            plan.state_token.clone(),
            plan.recovery.reference.clone()
        )
        .unwrap_err()
        .code,
        AppErrorCode::StaleBringInPlan
    );
    let result = start_overlapping_merge(
        repo.clone(),
        session("upstream"),
        OverlappingMergeSource::Upstream,
        plan.state_token,
        plan.recovery.reference.clone(),
    )
    .unwrap();
    assert_eq!(result.session.origin, ConflictOrigin::Gitodile);
    assert_eq!(result.recovery.operation, "get-team-changes");
    write_file(&repo, "clash.txt", "resolved\n");
    assert!(git_succeeds(&repo, &["add", "clash.txt"]));
    write_hook(&repo, "commit-msg", "exit 1");
    let finish = merge::plan_finish_merge(repo.clone()).unwrap();
    assert_eq!(
        merge::finish_merge(repo.clone(), finish.title, None, finish.state_token, true)
            .unwrap_err()
            .code,
        AppErrorCode::HookRejected
    );
    assert_eq!(head(&repo), before);
    assert!(conflicts::read_conflict_session(repo.clone())
        .unwrap()
        .is_some());
    for name in [
        "pre-commit",
        "prepare-commit-msg",
        "commit-msg",
        "post-commit",
    ] {
        write_hook(&repo, name, &format!("echo {name} >> hook-ran"));
    }
    write_hook(&repo, "pre-merge-commit", "echo should-not-run >> hook-ran");
    let finish = merge::plan_finish_merge(repo.clone()).unwrap();
    merge::finish_merge(repo.clone(), finish.title, None, finish.state_token, true).unwrap();
    assert_eq!(parents_of_head(&repo), [before, incoming]);
    assert_eq!(
        read_text(&repo, "hook-ran"),
        "pre-commit\nprepare-commit-msg\ncommit-msg\npost-commit\n"
    );
    assert!(recovery_ref_exists(&repo, &plan.recovery.reference));
    let _ = fs::remove_dir_all(repo);
}

// More than 5 s on Windows: reuse one real divergent repository to prove each
// preflight refuses before start/recovery, with no extra fixture commits.
#[test]
fn starting_an_overlap_refuses_unsafe_work_and_custom_merge_options() {
    let repo = overlapping_project("start-overlap-refusals");
    let before = head(&repo);
    let source = local_branch("feature");
    let attempt = |expected| {
        let plan = plan_bring_in(&repo, "refuse", &source).unwrap();
        assert_eq!(
            start_branch_overlap(&repo, "refuse", &plan)
                .unwrap_err()
                .code,
            expected
        );
        assert!(!Path::new(&repo)
            .join(".git/gitodile/conflicts/v1/starts")
            .exists());
        assert!(!recovery_ref_exists(&repo, &plan.recovery.reference));
        assert_eq!(head(&repo), before);
    };
    write_file(&repo, "notes.txt", "prepared\n");
    assert!(git_succeeds(&repo, &["add", "notes.txt"]));
    attempt(AppErrorCode::IncomingTrackedChangeCollision);
    assert!(git_succeeds(&repo, &["restore", "--staged", "notes.txt"]));
    write_file(&repo, "notes.txt", "notes\n");
    write_file(&repo, "clash.txt", "unsaved conflict\n");
    attempt(AppErrorCode::IncomingTrackedChangeCollision);
    write_file(&repo, "clash.txt", "current\n");
    write_file(&repo, "new.txt", "untracked collision\n");
    attempt(AppErrorCode::IncomingTrackedChangeCollision);
    // Ignored content must not be overwritten either.
    fs::write(Path::new(&repo).join(".git/info/exclude"), "new.txt\n").unwrap();
    attempt(AppErrorCode::IncomingTrackedChangeCollision);
    fs::remove_file(Path::new(&repo).join("new.txt")).unwrap();
    for options in ["--squash", "--strategy=ours", ""] {
        assert!(git_succeeds(
            &repo,
            &["config", "branch.main.mergeOptions", options]
        ));
        attempt(AppErrorCode::UnsupportedMergeSetup);
    }
    assert!(git_succeeds(
        &repo,
        &["config", "--unset", "branch.main.mergeOptions"]
    ));
    fs::write(Path::new(&repo).join(".git/index.lock"), "busy").unwrap();
    attempt(AppErrorCode::RefLocked);
    fs::remove_file(Path::new(&repo).join(".git/index.lock")).unwrap();
    let plan = plan_bring_in(&repo, "refuse", &source).unwrap();
    // A pending operation is rejected even when no index entry is unmerged.
    fs::write(Path::new(&repo).join(".git/MERGE_HEAD"), &before).unwrap();
    assert_eq!(
        start_branch_overlap(&repo, "refuse", &plan)
            .unwrap_err()
            .code,
        AppErrorCode::GitOperationInProgress
    );
    fs::remove_file(Path::new(&repo).join(".git/MERGE_HEAD")).unwrap();
    write_file(&repo, "notes.txt", "changed after review\n");
    assert_eq!(
        start_branch_overlap(&repo, "refuse", &plan)
            .unwrap_err()
            .code,
        AppErrorCode::StaleBringInPlan
    );
    write_file(&repo, "notes.txt", "notes\n");
    assert!(git_succeeds(
        &repo,
        &["config", "merge.suppressDest", "main"]
    ));
    assert_eq!(
        start_branch_overlap(&repo, "refuse", &plan)
            .unwrap_err()
            .code,
        AppErrorCode::StaleBringInPlan
    );
    assert!(git_succeeds(
        &repo,
        &["config", "--unset", "merge.suppressDest"]
    ));
    assert!(git_succeeds(
        &repo,
        &["update-ref", "refs/heads/feature", "HEAD"]
    ));
    assert_eq!(
        start_branch_overlap(&repo, "refuse", &plan)
            .unwrap_err()
            .code,
        AppErrorCode::StaleBringInPlan
    );
    let _ = fs::remove_dir_all(repo);
}

// More than 5 s on Windows: train Git's actual rerere cache and reuse the same
// conflict, proving GitOdile neither applies it nor changes user configuration.
#[test]
fn a_paused_overlap_disables_rerere_for_that_invocation_only() {
    let repo = overlapping_project("start-overlap-rerere");
    assert!(git_succeeds(&repo, &["config", "rerere.enabled", "true"]));
    assert!(git_succeeds(
        &repo,
        &["config", "rerere.autoupdate", "true"]
    ));
    assert!(!git_succeeds(&repo, &["merge", "--no-commit", "feature"]));
    write_file(&repo, "clash.txt", "trained resolution\n");
    assert!(git_succeeds(&repo, &["rerere"]));
    assert!(git_succeeds(&repo, &["merge", "--abort"]));
    // Prove the cache can resolve this exact conflict before testing the opt-out.
    let _ = test_git(&repo, &["merge", "--no-commit", "feature"]).unwrap();
    assert_eq!(read_text(&repo, "clash.txt"), "trained resolution\n");
    assert!(git_succeeds(&repo, &["merge", "--abort"]));
    let plan = plan_bring_in(&repo, "rerere", &local_branch("feature")).unwrap();
    let started = start_branch_overlap(&repo, "rerere", &plan).unwrap();
    assert_eq!(started.session.unresolved_count, 1);
    assert!(read_text(&repo, "clash.txt").contains("<<<<<<<"));
    for key in ["rerere.enabled", "rerere.autoupdate"] {
        assert_eq!(
            git_stdout(&test_git(&repo, &["config", "--get", key]).unwrap()),
            "true"
        );
    }
    let _ = fs::remove_dir_all(repo);
}

// More than 5 s on Windows: real Git refusal and snapshot-ref failure must
// retain history recovery and origin evidence rather than trigger repair.
// A third real merge injects clean-index drift after Git releases its lock.
#[test]
fn a_refused_or_uncertain_overlap_keeps_its_start_and_history_recovery() {
    use crate::conflicts::{self, ConflictOrigin};
    let repo = overlapping_project("start-overlap-outcomes");
    let before = head(&repo);
    assert!(git_succeeds(&repo, &["update-ref", "ORIG_HEAD", &before]));
    assert!(git_succeeds(&repo, &["config", "user.name", ""]));
    let plan = plan_bring_in(&repo, "outcomes", &local_branch("feature")).unwrap();
    let error = start_branch_overlap(&repo, "outcomes", &plan).unwrap_err();
    assert_eq!(error.code, AppErrorCode::MergeStartRefused, "{error:?}");
    assert_eq!(head(&repo), before);
    assert_eq!(read_text(&repo, "clash.txt"), "current\n");
    assert!(!Path::new(&repo).join(".git/MERGE_HEAD").exists());
    assert!(recovery_ref_exists(&repo, &plan.recovery.reference));
    set_identity(&repo);
    let plan = plan_bring_in(&repo, "outcomes", &local_branch("feature")).unwrap();
    // This file blocks only the conflict pin namespace, after history recovery
    // has succeeded. Git's merge is left intact and the partial snapshot kept.
    let blocked = Path::new(&repo).join(".git/refs/gitodile/recovery/v1/conflict");
    fs::write(&blocked, "blocked").unwrap();
    let error = start_branch_overlap(&repo, "outcomes", &plan).unwrap_err();
    assert_eq!(error.code, AppErrorCode::MergeOutcomeUncertain);
    assert!(error.detail.unwrap().contains(&plan.recovery.reference));
    let paused_session = conflicts::read_conflict_session(repo.clone())
        .unwrap()
        .unwrap();
    assert_eq!(paused_session.origin, ConflictOrigin::Gitodile);
    assert!(!paused_session.snapshot.unwrap().complete);
    assert!(recovery_ref_exists(&repo, &plan.recovery.reference));
    assert_eq!(head(&repo), before);
    assert!(Path::new(&repo).join(".git/MERGE_HEAD").is_file());
    fs::remove_file(blocked).unwrap();
    assert!(git_succeeds(&repo, &["merge", "--abort"]));
    let plan = plan_bring_in(&repo, "outcomes", &local_branch("feature")).unwrap();
    let error = start_overlapping_merge_with(
        repo.clone(),
        session("outcomes"),
        OverlappingMergeSource::Branch {
            source: local_branch("feature"),
        },
        plan.state_token,
        plan.recovery.reference.clone(),
        |path, args| {
            let output = run_git(path, args)?;
            // Deterministic external index drift, after real Git's index.lock
            // was released, before the application verifies the actual pause.
            assert!(
                run_git(path, &["update-index", "--force-remove", "--", "new.txt"])?
                    .status
                    .success()
            );
            Ok(output)
        },
    )
    .unwrap_err();
    assert_eq!(error.code, AppErrorCode::MergeOutcomeUncertain);
    let observed = conflicts::read_conflict_session(repo.clone())
        .unwrap()
        .unwrap();
    assert_eq!(observed.origin, ConflictOrigin::Gitodile);
    assert!(observed.snapshot.unwrap().complete);
    assert!(read_text(&repo, "clash.txt").contains("<<<<<<<"));
    assert_eq!(head(&repo), before);
    assert!(recovery_ref_exists(&repo, &plan.recovery.reference));
    let _ = fs::remove_dir_all(repo);
}

// More than 5 s on Windows: crash boundary is represented by the actual durable
// prefix (start, history ref, Git merge) and a fresh read, without a snapshot.
#[test]
fn an_interrupted_overlap_is_still_gitodiles_session_before_any_snapshot() {
    use crate::conflicts::{self, ConflictOrigin};
    use crate::recovery::{MergeStartOutcome, MergeStartRecord};
    let repo = overlapping_project("start-overlap-restart");
    write_file(&repo, "notes.txt", "carried\n");
    let plan = plan_bring_in(&repo, "restart", &local_branch("feature")).unwrap();
    let owner;
    {
        let (repository, _permit) =
            application::authorize_repository(&repo, "start_overlapping_merge", None).unwrap();
        let record = new_merge_start(
            &repository,
            MergeStartRecord {
                schema_version: 1,
                id: plan.recovery.reference.rsplit('/').next().unwrap().into(),
                owner_id: String::new(),
                created_at_ms: 0,
                branch: plan.branch.clone(),
                head: plan.local_commit.clone(),
                incoming: plan.source.commit.clone(),
                source_ref: plan.source.reference.clone(),
                title: plan.merge_message.clone().unwrap(),
                state_token: plan.state_token.clone(),
                recovery_reference: plan.recovery.reference.clone(),
                overlapping_paths: vec!["clash.txt".into()],
                carried: vec![merge_carried_path(Path::new(&repo), "notes.txt").unwrap()],
                outcome: MergeStartOutcome::Pending,
            },
        )
        .unwrap();
        owner = record.owner_id;
        create_history_recovery_for(
            &repository,
            HistoryRecoveryOperation::BringInChanges,
            &plan.recovery.reference,
            HistoryRecoveryMetadata {
                branch: plan.branch.clone(),
                previous_commit: plan.local_commit.clone(),
                target_commit: plan.source.commit.clone(),
                remote: String::new(),
                destination_branch: "feature".into(),
                tracking_ref: plan.source.reference.clone(),
                state_token: plan.state_token,
                unsaved_snapshot: None,
            },
        )
        .unwrap();
        let output = run_git(
            &repo,
            &[
                "-c",
                "rerere.enabled=false",
                "merge",
                "--no-ff",
                "--no-commit",
                "--no-autostash",
                "-m",
                &record.title,
                &plan.source.commit,
            ],
        )
        .unwrap();
        assert!(!output.status.success());
        // The application stops here: no snapshot creation or outcome update.
    }
    let paused = conflicts::read_conflict_session(repo.clone())
        .unwrap()
        .unwrap();
    assert_eq!(paused.origin, ConflictOrigin::Gitodile);
    assert!(paused.snapshot.is_none());
    assert_eq!(read_text(&repo, "notes.txt"), "carried\n");
    assert!(recovery_ref_exists(&repo, &plan.recovery.reference));
    // Reading origin never writes a snapshot. A mismatched head or worktree
    // owner must not borrow the recorded origin.
    let incoming_marker = Path::new(&repo).join(".git/MERGE_HEAD");
    fs::write(&incoming_marker, &plan.local_commit).unwrap();
    assert_eq!(
        conflicts::read_conflict_session(repo.clone())
            .unwrap()
            .unwrap()
            .origin,
        ConflictOrigin::External
    );
    fs::write(&incoming_marker, &plan.source.commit).unwrap();
    let start_path = Path::new(&repo)
        .join(".git/gitodile/conflicts/v1/starts")
        .join(format!(
            "{}.json",
            plan.recovery.reference.rsplit('/').next().unwrap()
        ));
    let bytes = fs::read(&start_path).unwrap();
    fs::write(
        &start_path,
        String::from_utf8(bytes)
            .unwrap()
            .replace(&owner, "worktree-other"),
    )
    .unwrap();
    assert_eq!(
        conflicts::read_conflict_session(repo.clone())
            .unwrap()
            .unwrap()
            .origin,
        ConflictOrigin::External
    );
    let _ = fs::remove_dir_all(repo);
}

// More than 5 s on Windows: a linked Git worktree has separate markers,
// snapshot/start folders and recovery ownership while sharing objects/refs.
#[test]
fn a_linked_worktree_owns_its_overlap_without_changing_the_main_worktree() {
    let repo = overlapping_project("start-overlap-linked");
    let before = head(&repo);
    let linked = unique_temp_dir("start-overlap-linked-tree");
    assert!(git_succeeds(
        &repo,
        &["worktree", "add", "-q", "-b", "linked", &linked, "main"]
    ));
    let main_plan = plan_bring_in(&repo, "linked", &local_branch("feature")).unwrap();
    let plan = plan_bring_in(&linked, "linked", &local_branch("feature")).unwrap();
    let result = start_branch_overlap(&linked, "linked", &plan).unwrap();
    assert_ne!(
        plan.recovery.reference.split('/').nth(5),
        main_plan.recovery.reference.split('/').nth(5)
    );
    assert_eq!(
        result.session.operation.current.name.as_deref(),
        Some("linked")
    );
    assert_eq!(head(&repo), before);
    assert_eq!(read_text(&repo, "clash.txt"), "current\n");
    assert!(!Path::new(&repo).join("new.txt").exists());
    assert!(!Path::new(&repo).join(".git/MERGE_HEAD").exists());
    assert!(!Path::new(&repo)
        .join(".git/gitodile/conflicts/v1/starts")
        .exists());
    assert!(recovery_ref_exists(&repo, &plan.recovery.reference));
    for path in [linked, repo] {
        let _ = fs::remove_dir_all(path);
    }
}
