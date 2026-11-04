use crate::test_support::*;
use crate::*;
use std::fs;
use std::path::Path;

fn commit_all(path: &str, message: &str) {
    git_add_all(path);
    git_commit(path, message);
}

fn head(path: &str) -> String {
    git_stdout(
        &git_command(path)
            .args(["rev-parse", "HEAD"])
            .output()
            .unwrap(),
    )
}

#[test]
fn history_reads_root_and_normal_versions_without_mutating_the_repository() {
    let path = unique_temp_dir("history-linear");
    git_init(&path);
    write_file(&path, "file.txt", "one\n");
    commit_all(&path, "first");
    write_file(&path, "file.txt", "one\ntwo\n");
    commit_all(&path, "second");

    let before_head = head(&path);
    let before_status = git_command(&path)
        .args(["status", "--porcelain=v2", "-z"])
        .output()
        .unwrap()
        .stdout;
    let before_config = fs::read(Path::new(&path).join(".git/config")).unwrap();
    let page =
        read_history_page(path.clone(), None, Some(50), None, None).expect("history should load");

    assert_eq!(page.versions.len(), 2);
    assert_eq!(page.versions[0].subject, "second");
    assert!(!page.versions[0].is_root);
    assert!(page.versions[1].is_root);
    assert_eq!(page.versions[0].publication, PublicationState::Unknown);
    assert_eq!(head(&path), before_head);
    assert_eq!(
        git_command(&path)
            .args(["status", "--porcelain=v2", "-z"])
            .output()
            .unwrap()
            .stdout,
        before_status
    );
    assert_eq!(
        fs::read(Path::new(&path).join(".git/config")).unwrap(),
        before_config
    );

    let _ = fs::remove_dir_all(path);
}

#[test]
fn native_history_cache_reuses_page_context_for_detail_and_file_diff() {
    let path = unique_temp_dir("history-native-cache");
    git_init(&path);
    write_file(&path, "cached.rs", "fn before() {}\n");
    commit_all(&path, "base");
    write_file(&path, "cached.rs", "fn after() {}\n");
    commit_all(&path, "cached detail");

    let cache = HistoryReadCache::default();
    let page = read_history_page_cached(&cache, path.clone(), None, Some(50), None, None).unwrap();
    let commit = page.versions[0].commit.clone();
    let detail = read_saved_version_detail_cached(
        &cache,
        path.clone(),
        page.snapshot_token.clone(),
        commit.clone(),
    )
    .unwrap();
    assert_eq!(detail.version.subject, "cached detail");
    assert_eq!(detail.files.len(), 1);

    let diff = read_saved_version_file_diff_cached(
        &cache,
        path.clone(),
        page.snapshot_token,
        commit,
        "cached.rs".to_string(),
    )
    .unwrap();
    assert!(matches!(diff, FileDiff::Text { .. }));

    let _ = fs::remove_dir_all(path);
}

#[test]
fn pagination_rejects_a_cursor_after_head_changes() {
    let path = unique_temp_dir("history-stale-cursor");
    git_init(&path);
    for index in 0..3 {
        write_file(&path, "file.txt", &format!("{index}\n"));
        commit_all(&path, &format!("version {index}"));
    }
    let first = read_history_page(path.clone(), None, Some(1), None, None).unwrap();
    assert!(first.has_more);
    let cursor = first.next_cursor.expect("continuation");

    write_file(&path, "file.txt", "changed again\n");
    commit_all(&path, "new head");
    let error = read_history_page(path.clone(), Some(cursor), Some(1), None, None).unwrap_err();
    assert_eq!(error.code, AppErrorCode::StaleHistoryCursor);

    let _ = fs::remove_dir_all(path);
}

#[test]
fn pagination_covers_hundreds_of_versions_without_duplicates_or_gaps() {
    let path = unique_temp_dir("history-hundreds");
    git_init(&path);
    let versions: Vec<_> = (0..205)
        .map(|_| ("init".to_string(), String::new()))
        .collect();
    git_commit_series(&path, None, &versions);

    let first = read_history_page(path.clone(), None, Some(100), None, None).unwrap();
    assert_eq!(first.versions.len(), 100);
    assert!(first.has_more);
    let second = read_history_page(path.clone(), first.next_cursor, Some(100), None, None).unwrap();
    assert_eq!(second.versions.len(), 100);
    assert!(second.has_more);
    let third = read_history_page(path.clone(), second.next_cursor, Some(100), None, None).unwrap();
    assert_eq!(third.versions.len(), 5);
    assert!(!third.has_more);

    let commits = first
        .versions
        .into_iter()
        .chain(second.versions)
        .chain(third.versions)
        .map(|version| version.commit)
        .collect::<std::collections::HashSet<_>>();
    assert_eq!(commits.len(), 205);

    let _ = fs::remove_dir_all(path);
}

#[test]
fn messages_preserve_unicode_multiline_and_empty_content() {
    let path = unique_temp_dir("history-messages");
    git_init(&path);
    assert!(git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "commit",
            "--allow-empty",
            "-q",
            "-m",
            "Título ✓",
            "-m",
            "Primera línea\nSegunda línea 🐊",
        ])
        .status()
        .unwrap()
        .success());
    assert!(git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "commit",
            "--allow-empty",
            "--allow-empty-message",
            "-q",
            "-m",
            "",
        ])
        .status()
        .unwrap()
        .success());

    let page = read_history_page(path.clone(), None, Some(50), None, None).unwrap();
    assert_eq!(page.versions[0].subject, "");
    assert_eq!(page.versions[1].subject, "Título ✓");
    assert_eq!(
        page.versions[1].description,
        "Primera línea\nSegunda línea 🐊"
    );

    let _ = fs::remove_dir_all(path);
}

#[test]
fn publication_states_follow_the_configured_upstream_without_network_access() {
    let path = unique_temp_dir("history-publication");
    git_init(&path);
    write_file(&path, "file.txt", "one\n");
    commit_all(&path, "published root");
    write_file(&path, "file.txt", "one\ntwo\n");
    commit_all(&path, "published second");

    let remote = unique_temp_dir("history-publication-remote");
    init_bare_remote(&remote);
    wire_remote(&path, "team", &remote);
    let branch = current_branch(&path);
    assert!(git_command(&path)
        .args(["push", "-u", "team", &branch])
        .status()
        .unwrap()
        .success());

    write_file(&path, "file.txt", "one\ntwo\nlocal\n");
    commit_all(&path, "local only");
    let page = read_history_page(path.clone(), None, Some(50), None, None).unwrap();
    assert_eq!(page.upstream.as_ref().unwrap().remote, "team");
    assert_eq!(page.versions[0].publication, PublicationState::LocalOnly);
    assert!(page.versions[1..]
        .iter()
        .all(|version| version.publication == PublicationState::Published));

    let _ = fs::remove_dir_all(path);
    let _ = fs::remove_dir_all(remote);
}

#[test]
fn merge_tag_and_detached_history_keep_typed_graph_and_decorations() {
    let path = unique_temp_dir("history-merge");
    git_init(&path);
    write_file(&path, "root.txt", "root\n");
    commit_all(&path, "root");
    let main = current_branch(&path);
    assert!(git_command(&path)
        .args(["switch", "-c", "side"])
        .status()
        .unwrap()
        .success());
    write_file(&path, "side.txt", "side\n");
    commit_all(&path, "side version");
    assert!(git_command(&path)
        .args(["switch", &main])
        .status()
        .unwrap()
        .success());
    write_file(&path, "main.txt", "main\n");
    commit_all(&path, "main version");
    assert!(git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "merge",
            "--no-ff",
            "-m",
            "merge version",
            "side",
        ])
        .status()
        .unwrap()
        .success());
    assert!(git_command(&path)
        .args(["tag", "v1.0"])
        .status()
        .unwrap()
        .success());

    let attached = read_history_page(path.clone(), None, Some(50), None, None).unwrap();
    assert!(attached.versions[0].is_merge);
    assert_eq!(attached.versions[0].parents.len(), 2);
    assert!(attached.versions[0]
        .decorations
        .iter()
        .any(|item| item.kind == DecorationKind::Head));
    assert!(attached.versions[0]
        .decorations
        .iter()
        .any(|item| item.kind == DecorationKind::Tag && item.name == "v1.0"));

    assert!(git_command(&path)
        .args(["switch", "--detach"])
        .status()
        .unwrap()
        .success());
    let detached = read_history_page(path.clone(), None, Some(50), None, None).unwrap();
    assert_eq!(detached.head_state, HeadState::Detached);
    assert!(detached.branch.is_none());
    assert!(detached.versions[0].is_merge);

    let _ = fs::remove_dir_all(path);
}

#[test]
fn many_decorations_are_capped_and_reported_without_ambiguous_splitting() {
    let path = unique_temp_dir("history-many-decorations");
    git_init(&path);
    git_commit_empty(&path);
    // One `update-ref --stdin` instead of a `git tag` process per tag.
    let tip = head(&path);
    let tags: String = (0..40)
        .map(|index| format!("create refs/tags/release,{index:02} {tip}\n"))
        .collect();
    let mut update = git_command(&path)
        .args(["update-ref", "--stdin"])
        .stdin(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    std::io::Write::write_all(&mut update.stdin.take().unwrap(), tags.as_bytes()).unwrap();
    assert!(update.wait().unwrap().success());

    let page = read_history_page(path.clone(), None, Some(50), None, None).unwrap();
    assert_eq!(
        page.versions[0].decorations.len(),
        MAX_DECORATIONS_PER_VERSION
    );
    assert!(page.versions[0].decorations_truncated);
    assert!(page.versions[0]
        .decorations
        .iter()
        .any(|item| item.name == "release,00"));
    assert!(page
        .warnings
        .contains(&HistoryWarningCode::DecorationsTruncated));

    let _ = fs::remove_dir_all(path);
}

#[test]
fn details_compare_root_to_empty_tree_and_merge_to_first_parent() {
    let path = unique_temp_dir("history-detail-bases");
    git_init(&path);
    write_file(&path, "root.txt", "root\n");
    commit_all(&path, "root");
    let root = head(&path);
    let main = current_branch(&path);
    assert!(git_command(&path)
        .args(["switch", "-c", "side"])
        .status()
        .unwrap()
        .success());
    write_file(&path, "side.txt", "side\n");
    commit_all(&path, "side");
    assert!(git_command(&path)
        .args(["switch", &main])
        .status()
        .unwrap()
        .success());
    write_file(&path, "main.txt", "main\n");
    commit_all(&path, "main");
    assert!(git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "merge",
            "--no-ff",
            "-m",
            "merge",
            "side",
        ])
        .status()
        .unwrap()
        .success());
    let merge = head(&path);
    let page = read_history_page(path.clone(), None, Some(50), None, None).unwrap();

    let root_detail =
        read_saved_version_detail(path.clone(), page.snapshot_token.clone(), root).unwrap();
    assert!(root_detail.comparison_is_empty_tree);
    assert!(!root_detail.comparison_is_first_parent);
    assert!(root_detail
        .files
        .iter()
        .any(|file| file.path == "root.txt" && file.category == ChangeCategory::New));

    let merge_detail =
        read_saved_version_detail(path.clone(), page.snapshot_token.clone(), merge.clone())
            .unwrap();
    assert!(merge_detail.comparison_is_first_parent);
    assert!(merge_detail
        .files
        .iter()
        .any(|file| file.path == "side.txt"));
    let diff = read_saved_version_file_diff(
        path.clone(),
        page.snapshot_token,
        merge,
        "side.txt".to_string(),
    )
    .unwrap();
    assert!(matches!(
        diff,
        FileDiff::Text {
            change: ChangeCategory::New,
            ..
        }
    ));

    let _ = fs::remove_dir_all(path);
}

#[test]
fn detail_reuses_typed_rename_delete_binary_and_too_large_diff_states() {
    let path = unique_temp_dir("history-detail-states");
    git_init(&path);
    write_file(&path, "old.txt", "old\n");
    write_file(&path, "delete.txt", "delete\n");
    fs::write(Path::new(&path).join("binary.bin"), [0_u8, 1, 2]).unwrap();
    commit_all(&path, "base files");

    assert!(git_command(&path)
        .args(["mv", "old.txt", "renamed.txt"])
        .status()
        .unwrap()
        .success());
    fs::remove_file(Path::new(&path).join("delete.txt")).unwrap();
    fs::write(Path::new(&path).join("binary.bin"), [0_u8, 9, 8, 7]).unwrap();
    fs::write(
        Path::new(&path).join("huge.txt"),
        vec![b'x'; MAX_DIFF_OUTPUT_BYTES + 1024],
    )
    .unwrap();
    commit_all(&path, "mixed file states");

    let page = read_history_page(path.clone(), None, Some(50), None, None).unwrap();
    let commit = page.versions[0].commit.clone();
    let detail =
        read_saved_version_detail(path.clone(), page.snapshot_token.clone(), commit.clone())
            .unwrap();
    assert!(detail
        .files
        .iter()
        .any(|file| file.path == "renamed.txt" && file.category == ChangeCategory::Renamed));
    assert!(detail
        .files
        .iter()
        .any(|file| file.path == "delete.txt" && file.category == ChangeCategory::Deleted));
    let binary = read_saved_version_file_diff(
        path.clone(),
        page.snapshot_token.clone(),
        commit.clone(),
        "binary.bin".to_string(),
    )
    .unwrap();
    assert!(matches!(binary, FileDiff::Binary { .. }));
    let huge = read_saved_version_file_diff(
        path.clone(),
        page.snapshot_token,
        commit,
        "huge.txt".to_string(),
    )
    .unwrap();
    assert!(matches!(huge, FileDiff::TooLarge { .. }));

    let _ = fs::remove_dir_all(path);
}

#[test]
fn saved_markdown_reads_both_sides_of_each_kind_of_change() {
    let path = unique_temp_dir("history-markdown");
    git_init(&path);
    write_file(&path, "guide.md", "# First\n");
    write_file(
        &path,
        "old [name].md",
        "# Moved\n\nThe same long paragraph.\n",
    );
    write_file(&path, "gone.md", "# Gone\n");
    write_file(&path, "big.md", "# Small\n");
    commit_all(&path, "root");
    write_file(&path, "guide.md", "# Second\n");
    write_file(&path, "new.md", "# New\n");
    write_file(&path, "big.md", &"x".repeat(129 * 1024));
    fs::rename(
        Path::new(&path).join("old [name].md"),
        Path::new(&path).join("new [name].md"),
    )
    .unwrap();
    fs::remove_file(Path::new(&path).join("gone.md")).unwrap();
    commit_all(&path, "changes");
    // A later edit must not reach the version being read.
    write_file(&path, "guide.md", "# Unsaved\n");

    let page = read_history_page(path.clone(), None, Some(50), None, None).unwrap();
    let cache = HistoryReadCache::default();
    let read = |commit: &str, file: &str| {
        read_saved_version_file_markdown_cached(
            &cache,
            path.clone(),
            page.snapshot_token.clone(),
            commit.to_string(),
            file.to_string(),
        )
    };
    let ready = |before: Option<&str>, content: Option<&str>| MarkdownPreview::Ready {
        content: content.map(str::to_string),
        before_content: before.map(str::to_string),
    };
    let (latest, root) = (&page.versions[0].commit, &page.versions[1].commit);
    assert_eq!(
        read(latest, "guide.md").unwrap(),
        ready(Some("# First\n"), Some("# Second\n"))
    );
    assert_eq!(
        read(latest, "new [name].md").unwrap(),
        ready(
            Some("# Moved\n\nThe same long paragraph.\n"),
            Some("# Moved\n\nThe same long paragraph.\n")
        )
    );
    assert_eq!(
        read(latest, "new.md").unwrap(),
        ready(None, Some("# New\n"))
    );
    assert_eq!(
        read(latest, "gone.md").unwrap(),
        ready(Some("# Gone\n"), None)
    );
    assert_eq!(
        read(root, "guide.md").unwrap(),
        ready(None, Some("# First\n"))
    );
    assert_eq!(
        read(latest, "big.md").unwrap(),
        MarkdownPreview::too_large()
    );
    assert!(read(latest, "unrelated.md").is_err());

    let _ = fs::remove_dir_all(path);
}

#[test]
fn unborn_and_oversized_messages_return_truthful_bounded_pages() {
    let unborn = unique_temp_dir("history-unborn");
    git_init(&unborn);
    let empty = read_history_page(unborn.clone(), None, Some(50), None, None).unwrap();
    assert_eq!(empty.head_state, HeadState::Unborn);
    assert!(empty.versions.is_empty());

    let path = unique_temp_dir("history-large-message");
    git_init(&path);
    git_commit_empty(&path);
    let message_path = Path::new(&path).join("large-message.txt");
    fs::write(
        &message_path,
        "L".repeat(MAX_PAGE_COMMIT_OBJECT_BYTES + 1024),
    )
    .unwrap();
    assert!(git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "commit",
            "--allow-empty",
            "-q",
            "-F",
        ])
        .arg(&message_path)
        .status()
        .unwrap()
        .success());
    let page = read_history_page(path.clone(), None, Some(50), None, None).unwrap();
    assert_eq!(page.versions.len(), 2);
    assert_eq!(
        page.versions[0].message_unavailable,
        Some(MessageUnavailableReason::TooLarge)
    );
    assert!(page
        .warnings
        .contains(&HistoryWarningCode::MessagesTruncated));

    let _ = fs::remove_dir_all(unborn);
    let _ = fs::remove_dir_all(path);
}

fn commit_as(path: &str, author: &str, message: &str) {
    git_add_all(path);
    let status = git_command(path)
        .args([
            "-c",
            &format!("user.name={author}"),
            "-c",
            "user.email=author@gitodile.local",
            "commit",
            "-q",
            "-m",
            message,
        ])
        .status()
        .expect("run git commit");
    assert!(status.success(), "git commit should succeed");
}

fn subjects(page: &HistoryPage) -> Vec<String> {
    page.versions
        .iter()
        .map(|version| version.subject.clone())
        .collect()
}

fn filters() -> HistoryFilters {
    HistoryFilters::default()
}

/// Every filter is an argument to the same `rev-list` that pages the timeline,
/// so it narrows the whole reachable history. The page size here is 1: each
/// assertion would still pass if the filter ran over the loaded rows, but the
/// pagination assertion below would not.
#[test]
fn filters_narrow_the_whole_history_rather_than_one_page() {
    let path = unique_temp_dir("history-filters");
    git_init(&path);
    write_file(&path, "one.txt", "1\n");
    commit_as(&path, "Ada Lovelace", "ada writes one");
    write_file(&path, "two.txt", "2\n");
    commit_as(&path, "Grace Hopper", "grace writes two");
    write_file(&path, "one.txt", "1\n1\n");
    commit_as(&path, "Ada Lovelace", "ada writes one again");

    let by_author = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            author: Some("Ada".to_string()),
            ..filters()
        }),
        None,
    )
    .unwrap();
    assert_eq!(
        subjects(&by_author),
        vec!["ada writes one again", "ada writes one"]
    );

    let by_path = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            path: Some("two.txt".to_string()),
            ..filters()
        }),
        None,
    )
    .unwrap();
    assert_eq!(subjects(&by_path), vec!["grace writes two"]);

    // The match the filter has to reach lives on the third commit, one page
    // past a page of one. A filter applied to loaded rows could not find it.
    let first = read_history_page(
        path.clone(),
        None,
        Some(1),
        Some(HistoryFilters {
            author: Some("Ada".to_string()),
            ..filters()
        }),
        None,
    )
    .unwrap();
    assert_eq!(subjects(&first), vec!["ada writes one again"]);
    assert!(first.has_more);
    let second = read_history_page(
        path.clone(),
        first.next_cursor,
        Some(1),
        Some(HistoryFilters {
            author: Some("Ada".to_string()),
            ..filters()
        }),
        None,
    )
    .unwrap();
    assert_eq!(subjects(&second), vec!["ada writes one"]);
    assert!(!second.has_more);

    let _ = fs::remove_dir_all(path);
}

/// A name box is not a regular-expression box. Git reads `--author` as one by
/// default, so a bracket typed into it fails the read outright rather than
/// matching nothing — and the screen can only report that as an error.
#[test]
fn author_filter_matches_text_rather_than_a_pattern() {
    let path = unique_temp_dir("history-author-text");
    git_init(&path);
    write_file(
        &path, "one.txt", "1
",
    );
    commit_as(&path, "Ada Lovelace", "ada writes");

    // Regex metacharacters are matched, not interpreted: an unterminated
    // bracket expression used to abort the whole page read.
    let bracket = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            author: Some("a[".to_string()),
            ..filters()
        }),
        None,
    )
    .expect("a bracket in a name is text, not a broken pattern");
    assert!(bracket.versions.is_empty());

    // And the match ignores case, because "ada" is how someone looks for Ada.
    let lowercase = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            author: Some("ada".to_string()),
            ..filters()
        }),
        None,
    )
    .unwrap();
    assert_eq!(subjects(&lowercase), vec!["ada writes"]);

    let _ = fs::remove_dir_all(path);
}

/// The unpublished filter is `--not <upstream>`, and publication for a filtered
/// page is classified per commit rather than by the windowed walk an unfiltered
/// page uses — the two must agree.
#[test]
fn unpublished_filter_and_publication_agree_against_the_upstream() {
    let source = unique_temp_dir("history-unpublished-source");
    git_init(&source);
    write_file(&source, "file.txt", "published\n");
    commit_all(&source, "published version");

    let clone = unique_temp_dir("history-unpublished-clone");
    let file_url = if cfg!(windows) {
        format!("file:///{}", source.replace('\\', "/"))
    } else {
        format!("file://{source}")
    };
    assert!(git_command(&clone)
        .args(["clone", "-q", &file_url, "."])
        .status()
        .unwrap()
        .success());
    write_file(&clone, "file.txt", "local\n");
    commit_all(&clone, "local version");

    let all = read_history_page(clone.clone(), None, Some(50), None, None).unwrap();
    assert_eq!(subjects(&all), vec!["local version", "published version"]);
    assert_eq!(all.versions[0].publication, PublicationState::LocalOnly);
    assert_eq!(all.versions[1].publication, PublicationState::Published);

    let unpublished = read_history_page(
        clone.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            unpublished_only: true,
            ..filters()
        }),
        None,
    )
    .unwrap();
    assert_eq!(subjects(&unpublished), vec!["local version"]);
    assert_eq!(
        unpublished.versions[0].publication,
        PublicationState::LocalOnly
    );

    // A filtered page takes the per-commit classification path; it must reach
    // the same verdict the unfiltered page did.
    let by_author = read_history_page(
        clone.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            author: Some("GitOdile Test".to_string()),
            ..filters()
        }),
        None,
    )
    .unwrap();
    assert_eq!(by_author.versions.len(), 2);
    assert_eq!(
        by_author.versions[0].publication,
        PublicationState::LocalOnly
    );
    assert_eq!(
        by_author.versions[1].publication,
        PublicationState::Published
    );

    let _ = fs::remove_dir_all(source);
    let _ = fs::remove_dir_all(clone);
}

#[test]
fn history_filters_are_validated_before_they_reach_git() {
    let path = unique_temp_dir("history-filter-validation");
    git_init(&path);
    write_file(&path, "file.txt", "one\n");
    commit_all(&path, "first");

    for invalid in [
        HistoryFilters {
            since: Some("last tuesday".to_string()),
            ..filters()
        },
        HistoryFilters {
            until: Some("2026-9-1".to_string()),
            ..filters()
        },
        HistoryFilters {
            path: Some("../outside.txt".to_string()),
            ..filters()
        },
        HistoryFilters {
            author: Some("a\u{7}b".to_string()),
            ..filters()
        },
        HistoryFilters {
            author: Some("a".repeat(201)),
            ..filters()
        },
    ] {
        assert!(
            read_history_page(path.clone(), None, Some(50), Some(invalid), None).is_err(),
            "an invalid filter must be refused rather than passed to Git"
        );
    }

    // Blank is not invalid, it is simply nothing asked for.
    let blank = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            author: Some("   ".to_string()),
            path: Some(String::new()),
            ..filters()
        }),
        None,
    )
    .unwrap();
    assert_eq!(blank.versions.len(), 1);

    let _ = fs::remove_dir_all(path);
}

/// A date filter is a calendar day, and merges can be hidden.
#[test]
fn date_and_merge_filters_narrow_the_timeline() {
    let path = unique_temp_dir("history-date-merge");
    git_init(&path);
    write_file(&path, "file.txt", "one\n");
    commit_all(&path, "first");
    assert!(git_command(&path)
        .args(["checkout", "-q", "-b", "side"])
        .status()
        .unwrap()
        .success());
    write_file(&path, "side.txt", "side\n");
    commit_all(&path, "side work");
    assert!(git_command(&path)
        .args(["checkout", "-q", "-"])
        .status()
        .unwrap()
        .success());
    assert!(git_command(&path)
        .args([
            "-c",
            "user.name=GitOdile Test",
            "-c",
            "user.email=test@gitodile.local",
            "merge",
            "-q",
            "--no-ff",
            "-m",
            "merge side",
            "side",
        ])
        .status()
        .unwrap()
        .success());

    let all = read_history_page(path.clone(), None, Some(50), None, None).unwrap();
    assert!(subjects(&all).contains(&"merge side".to_string()));

    let without_merges = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            no_merges: true,
            ..filters()
        }),
        None,
    )
    .unwrap();
    assert!(!subjects(&without_merges).contains(&"merge side".to_string()));
    assert!(without_merges
        .versions
        .iter()
        .all(|version| !version.is_merge));

    // Everything in this repository was written today, so a window that closed
    // before it started has to come back empty rather than unfiltered.
    let none = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            until: Some("2000-01-01".to_string()),
            ..filters()
        }),
        None,
    )
    .unwrap();
    assert!(none.versions.is_empty());

    let _ = fs::remove_dir_all(path);
}

#[test]
fn tagged_only_keeps_the_versions_a_tag_points_at() {
    let path = unique_temp_dir("history-tagged-only");
    git_init(&path);
    for index in 0..4 {
        write_file(
            &path,
            "file.txt",
            &format!(
                "{index}
"
            ),
        );
        commit_all(&path, &format!("version {index}"));
        if index == 1 {
            assert!(git_command(&path)
                .args(["tag", "v1"])
                .status()
                .unwrap()
                .success());
        }
        if index == 2 {
            assert!(git_command(&path)
                .args([
                    "-c",
                    "user.name=GitOdile Test",
                    "-c",
                    "user.email=test@gitodile.local",
                    "tag",
                    "-a",
                    "v2",
                    "-m",
                    "annotated",
                ])
                .status()
                .unwrap()
                .success());
        }
    }

    let tagged = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            tagged_only: true,
            ..filters()
        }),
        None,
    )
    .unwrap();
    // Lightweight and annotated alike; the tip carries only its branch, so it
    // is not a tagged version however decorated it is.
    assert_eq!(subjects(&tagged), vec!["version 2", "version 1"]);
    assert!(tagged.versions.iter().all(|version| version
        .decorations
        .iter()
        .any(|decoration| matches!(decoration.kind, DecorationKind::Tag))));

    // A page of one at a time reaches the same two and no more: the cursor
    // counts what Git walked, so dropping the untagged root after the walk
    // neither repeats a version on the next page nor ends paging early.
    let tagged_only = || {
        Some(HistoryFilters {
            tagged_only: true,
            ..filters()
        })
    };
    let mut paged = Vec::new();
    let mut cursor = None;
    for _ in 0..10 {
        let page = read_history_page(path.clone(), cursor, Some(1), tagged_only(), None).unwrap();
        paged.extend(subjects(&page));
        if !page.has_more {
            break;
        }
        cursor = page.next_cursor;
    }
    assert_eq!(paged, vec!["version 2", "version 1"]);

    let _ = fs::remove_dir_all(path);
}

#[test]
fn shallow_history_is_reported_explicitly() {
    let source = unique_temp_dir("history-shallow-source");
    git_init(&source);
    for index in 0..3 {
        write_file(&source, "file.txt", &format!("{index}\n"));
        commit_all(&source, &format!("version {index}"));
    }
    let clone = unique_temp_dir("history-shallow-clone");
    let file_url = if cfg!(windows) {
        format!("file:///{}", source.replace('\\', "/"))
    } else {
        format!("file://{source}")
    };
    assert!(git_command(&clone)
        .args(["clone", "--depth=1", "-q", &file_url, "."])
        .status()
        .unwrap()
        .success());
    let page = read_history_page(clone.clone(), None, Some(50), None, None).unwrap();
    assert!(page.shallow);
    assert_eq!(page.versions.len(), 1);
    assert!(page
        .warnings
        .contains(&HistoryWarningCode::ShallowRepository));

    let _ = fs::remove_dir_all(source);
    let _ = fs::remove_dir_all(clone);
}

// ---- History scope: which graph is being read ----

fn git(path: &str, args: &[&str]) {
    assert!(
        git_command(path).args(args).status().unwrap().success(),
        "git {args:?} should succeed"
    );
}

/// `main` with two versions, `feature/one` with a third on top of the first,
/// and `feature/two` with a fourth. `HEAD` stays on `main`.
fn repository_with_three_branches(label: &str) -> String {
    let path = unique_temp_dir(label);
    git_init(&path);
    write_file(&path, "file.txt", "one\n");
    commit_all(&path, "first");
    let first = head(&path);
    write_file(&path, "file.txt", "one\ntwo\n");
    commit_all(&path, "second on main");
    git(&path, &["branch", "-M", "main"]);

    git(&path, &["switch", "-q", "-c", "feature/one", &first]);
    write_file(&path, "feature.txt", "a\n");
    commit_all(&path, "third on feature one");

    git(&path, &["switch", "-q", "-c", "feature/two", &first]);
    write_file(&path, "other.txt", "b\n");
    commit_all(&path, "fourth on feature two");

    git(&path, &["switch", "-q", "main"]);
    path
}

#[test]
fn history_scoped_to_a_named_branch_reads_that_branch_without_checking_it_out() {
    let path = repository_with_three_branches("history-scope-named");
    let before_head = head(&path);

    let current = read_history_page(path.clone(), None, Some(50), None, None).unwrap();
    assert_eq!(subjects(&current), vec!["second on main", "first"]);

    let scoped = read_history_page(
        path.clone(),
        None,
        Some(50),
        None,
        Some(HistoryScope::Branch {
            name: "feature/one".to_string(),
        }),
    )
    .unwrap();
    assert_eq!(
        subjects(&scoped),
        vec!["third on feature one", "first"],
        "a named branch is read from its own tip"
    );
    // `branch` stays HEAD's own branch whatever the scope is: the timeline uses
    // it to mark which decoration is the branch being stood on.
    assert_eq!(scoped.branch.as_deref(), Some("main"));
    assert_eq!(
        scoped.scope,
        HistoryScope::Branch {
            name: "feature/one".into()
        }
    );
    assert_eq!(
        head(&path),
        before_head,
        "reading a branch checks nothing out"
    );

    let _ = fs::remove_dir_all(path);
}

#[test]
fn history_scoped_to_all_branches_deduplicates_the_union_of_local_tips() {
    let path = repository_with_three_branches("history-scope-all");

    let all = read_history_page(
        path.clone(),
        None,
        Some(50),
        None,
        Some(HistoryScope::AllBranches),
    )
    .unwrap();
    let listed = subjects(&all);
    assert_eq!(
        listed.len(),
        4,
        "every version once, however many branches reach it: {listed:?}"
    );
    for subject in [
        "second on main",
        "third on feature one",
        "fourth on feature two",
        "first",
    ] {
        assert!(listed.contains(&subject.to_string()), "missing {subject}");
    }
    // "first" is reachable from all three branches and appears exactly once.
    assert_eq!(listed.iter().filter(|value| *value == "first").count(), 1);
    // No single upstream can answer publication for a union of branches, so it
    // says unknown rather than measuring every branch against one boundary.
    assert!(all.upstream.is_none());
    assert!(all
        .versions
        .iter()
        .all(|version| version.publication == PublicationState::Unknown));

    let _ = fs::remove_dir_all(path);
}

/// "All branches" has no single upstream, so each version is measured against
/// every remote-tracking branch: published when any of them holds it, local
/// otherwise — the same verdict the branch's own scope gives.
#[test]
fn all_branches_classifies_publication_against_every_remote_branch() {
    let source = unique_temp_dir("history-all-remotes-source");
    git_init(&source);
    write_file(&source, "file.txt", "published\n");
    commit_all(&source, "published version");

    let clone = unique_temp_dir("history-all-remotes-clone");
    let file_url = if cfg!(windows) {
        format!("file:///{}", source.replace('\\', "/"))
    } else {
        format!("file://{source}")
    };
    assert!(git_command(&clone)
        .args(["clone", "-q", &file_url, "."])
        .status()
        .unwrap()
        .success());
    assert!(git_command(&clone)
        .args(["switch", "-q", "-c", "feature/local"])
        .status()
        .unwrap()
        .success());
    write_file(&clone, "file.txt", "only here\n");
    commit_all(&clone, "local on a branch with no remote");

    let all = read_history_page(
        clone.clone(),
        None,
        Some(50),
        None,
        Some(HistoryScope::AllBranches),
    )
    .unwrap();
    assert!(all.upstream.is_none());
    let publication = |subject: &str| {
        all.versions
            .iter()
            .find(|version| version.subject == subject)
            .map(|version| version.publication)
    };
    assert_eq!(
        publication("local on a branch with no remote"),
        Some(PublicationState::LocalOnly)
    );
    assert_eq!(
        publication("published version"),
        Some(PublicationState::Published)
    );

    let local = all.versions[0].clone();
    let detail = read_saved_version_detail(
        clone.clone(),
        all.snapshot_token.clone(),
        local.commit.clone(),
    )
    .unwrap();
    assert_eq!(detail.version.publication, PublicationState::LocalOnly);

    // Publishing moves a remote-tracking branch without moving a local tip: the
    // snapshot is a new one, so nothing cached under the old token answers.
    assert!(git_command(&clone)
        .args(["push", "-q", "origin", "feature/local"])
        .status()
        .unwrap()
        .success());
    let published = read_history_page(
        clone.clone(),
        None,
        Some(50),
        None,
        Some(HistoryScope::AllBranches),
    )
    .unwrap();
    assert_ne!(published.snapshot_token, all.snapshot_token);
    assert!(published
        .versions
        .iter()
        .all(|version| version.publication == PublicationState::Published));

    let _ = fs::remove_dir_all(source);
    let _ = fs::remove_dir_all(clone);
}

/// A filtered page is classified per commit, and Git lists every unpublished
/// version reachable from it, not only the page's own. That list was once
/// capped at the page's size, so a filter over more unpublished work than a
/// page holds failed instead of answering.
#[test]
fn a_filtered_page_classifies_more_unpublished_work_than_it_holds() {
    let source = unique_temp_dir("history-many-unpublished-source");
    git_init(&source);
    write_file(
        &source,
        "file.txt",
        "published
",
    );
    commit_all(&source, "published version");

    let clone = unique_temp_dir("history-many-unpublished-clone");
    let file_url = if cfg!(windows) {
        format!("file:///{}", source.replace('\\', "/"))
    } else {
        format!("file://{source}")
    };
    assert!(git_command(&clone)
        .args(["clone", "-q", &file_url, "."])
        .status()
        .unwrap()
        .success());
    let versions: Vec<_> = (0..140)
        .map(|index| (format!("local {index}"), format!("local {index}\n")))
        .collect();
    git_commit_series(&clone, Some("file.txt"), &versions);

    let page = read_history_page(
        clone.clone(),
        None,
        Some(5),
        Some(HistoryFilters {
            author: Some("GitOdile Test".to_string()),
            ..filters()
        }),
        None,
    )
    .unwrap();
    assert_eq!(page.versions.len(), 5);
    assert!(page
        .versions
        .iter()
        .all(|version| version.publication == PublicationState::LocalOnly));

    let _ = fs::remove_dir_all(source);
    let _ = fs::remove_dir_all(clone);
}

#[test]
fn history_refuses_a_branch_this_project_does_not_have() {
    let path = repository_with_three_branches("history-scope-missing");

    let error = read_history_page(
        path.clone(),
        None,
        Some(50),
        None,
        Some(HistoryScope::Branch {
            name: "feature/gone".to_string(),
        }),
    )
    .unwrap_err();
    assert_eq!(error.code, AppErrorCode::BranchMissing);

    // A name that is not a ref name at all is refused as a selection rather
    // than handed to Git as a revision.
    let invalid = read_history_page(
        path.clone(),
        None,
        Some(50),
        None,
        Some(HistoryScope::Branch {
            name: "--all".to_string(),
        }),
    )
    .unwrap_err();
    assert_eq!(invalid.code, AppErrorCode::InvalidSelection);

    let _ = fs::remove_dir_all(path);
}

#[test]
fn history_filters_still_run_in_git_under_a_named_and_an_all_branches_scope() {
    let path = repository_with_three_branches("history-scope-filters");

    let named = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            path: Some("feature.txt".to_string()),
            ..Default::default()
        }),
        Some(HistoryScope::Branch {
            name: "feature/one".to_string(),
        }),
    )
    .unwrap();
    assert_eq!(subjects(&named), vec!["third on feature one"]);

    let all = read_history_page(
        path.clone(),
        None,
        Some(50),
        Some(HistoryFilters {
            path: Some("other.txt".to_string()),
            ..Default::default()
        }),
        Some(HistoryScope::AllBranches),
    )
    .unwrap();
    assert_eq!(subjects(&all), vec!["fourth on feature two"]);

    let _ = fs::remove_dir_all(path);
}

#[test]
fn a_page_cursor_is_stale_once_the_branch_it_was_taken_from_moves() {
    let path = repository_with_three_branches("history-scope-stale");

    let first = read_history_page(
        path.clone(),
        None,
        Some(1),
        None,
        Some(HistoryScope::Branch {
            name: "feature/one".to_string(),
        }),
    )
    .unwrap();
    let cursor = first.next_cursor.expect("more versions to page through");

    // The scoped branch moves while HEAD stands still — which the old
    // HEAD-only token could not see.
    git(&path, &["switch", "-q", "feature/one"]);
    write_file(&path, "feature.txt", "a\nb\n");
    commit_all(&path, "fifth on feature one");
    git(&path, &["switch", "-q", "main"]);

    let error = read_history_page(
        path.clone(),
        Some(cursor.clone()),
        Some(1),
        None,
        Some(HistoryScope::Branch {
            name: "feature/one".to_string(),
        }),
    )
    .unwrap_err();
    assert_eq!(error.code, AppErrorCode::StaleHistoryCursor);

    // And a deleted branch is a missing branch rather than a page silently
    // answered from HEAD.
    git(&path, &["branch", "-q", "-D", "feature/one"]);
    let after_delete = read_history_page(
        path.clone(),
        Some(cursor),
        Some(1),
        None,
        Some(HistoryScope::Branch {
            name: "feature/one".to_string(),
        }),
    )
    .unwrap_err();
    assert_eq!(after_delete.code, AppErrorCode::BranchMissing);

    let _ = fs::remove_dir_all(path);
}

#[test]
fn a_cursor_taken_under_one_scope_is_not_accepted_under_another() {
    let path = repository_with_three_branches("history-scope-cursor-swap");

    let all = read_history_page(
        path.clone(),
        None,
        Some(1),
        None,
        Some(HistoryScope::AllBranches),
    )
    .unwrap();
    let cursor = all.next_cursor.expect("more versions to page through");

    let error = read_history_page(path.clone(), Some(cursor), Some(1), None, None).unwrap_err();
    assert_eq!(error.code, AppErrorCode::StaleHistoryCursor);

    let _ = fs::remove_dir_all(path);
}

#[test]
fn paging_under_a_scope_walks_that_scope_and_nothing_else() {
    let path = repository_with_three_branches("history-scope-paging");

    let mut seen = Vec::new();
    let mut cursor = None;
    loop {
        let page = read_history_page(
            path.clone(),
            cursor,
            Some(1),
            None,
            Some(HistoryScope::Branch {
                name: "feature/two".to_string(),
            }),
        )
        .unwrap();
        seen.extend(subjects(&page));
        cursor = page.next_cursor;
        if cursor.is_none() {
            break;
        }
    }
    assert_eq!(seen, vec!["fourth on feature two", "first"]);

    let _ = fs::remove_dir_all(path);
}

#[test]
fn a_saved_version_detail_reads_under_the_scope_its_token_names() {
    let path = repository_with_three_branches("history-scope-detail");

    let scoped = read_history_page(
        path.clone(),
        None,
        Some(50),
        None,
        Some(HistoryScope::Branch {
            name: "feature/one".to_string(),
        }),
    )
    .unwrap();
    let tip = scoped.versions[0].commit.clone();
    let detail =
        read_saved_version_detail(path.clone(), scoped.snapshot_token.clone(), tip.clone())
            .expect("a version listed under this scope has a detail");
    assert_eq!(detail.version.subject, "third on feature one");

    // The same commit is not reachable from `main`, so the current-branch token
    // must refuse it rather than answer for a history it is not in.
    let current = read_history_page(path.clone(), None, Some(50), None, None).unwrap();
    let error = read_saved_version_detail(path.clone(), current.snapshot_token, tip).unwrap_err();
    assert_eq!(error.code, AppErrorCode::InvalidSelection);

    let _ = fs::remove_dir_all(path);
}
