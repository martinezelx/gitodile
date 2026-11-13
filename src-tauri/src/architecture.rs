use std::{collections::BTreeSet, fs, path::Path};

use syn::{Item, UseTree};

fn parse(path: &Path) -> syn::File {
    let source =
        fs::read_to_string(path).unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
    syn::parse_file(&source).unwrap_or_else(|error| panic!("parse {}: {error}", path.display()))
}

fn use_paths(tree: &UseTree, prefix: &str, paths: &mut Vec<String>) {
    match tree {
        UseTree::Path(path) => {
            let prefix = if prefix.is_empty() {
                path.ident.to_string()
            } else {
                format!("{prefix}::{}", path.ident)
            };
            use_paths(&path.tree, &prefix, paths);
        }
        UseTree::Name(name) => paths.push(format!("{prefix}::{}", name.ident)),
        UseTree::Rename(rename) => paths.push(format!("{prefix}::{}", rename.ident)),
        UseTree::Glob(_) => paths.push(format!("{prefix}::*")),
        UseTree::Group(group) => {
            for item in &group.items {
                use_paths(item, prefix, paths);
            }
        }
    }
}

/// Every file that makes up one owning module: the entry itself, plus the
/// sibling files of a `mod.rs`. A module that outgrew a single file is still
/// one owner, so the direction rules below apply to all of it.
fn module_files(source_dir: &Path, entry: &str) -> Vec<std::path::PathBuf> {
    let path = source_dir.join(entry);
    if path.file_name().and_then(|name| name.to_str()) != Some("mod.rs") {
        return vec![path];
    }
    let directory = path.parent().expect("mod.rs has a parent").to_path_buf();
    let mut files = vec![path];
    let mut siblings = fs::read_dir(&directory)
        .unwrap_or_else(|error| panic!("read {}: {error}", directory.display()))
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.extension().and_then(|extension| extension.to_str()) == Some("rs")
                && path.file_name().and_then(|name| name.to_str()) != Some("mod.rs")
        })
        .collect::<Vec<_>>();
    siblings.sort();
    files.extend(siblings);
    files
}

#[test]
fn rust_module_boundaries_keep_composition_and_domains_separate() {
    let source_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let root = parse(&source_dir.join("lib.rs"));
    let modules = root
        .items
        .iter()
        .filter_map(|item| match item {
            Item::Mod(module) => Some(module.ident.to_string()),
            _ => None,
        })
        .collect::<BTreeSet<_>>();
    for required in [
        "application",
        "app_updates",
        "changes",
        "conflicts",
        "credentials",
        "desktop",
        "diagnostics",
        "git",
        "git_command",
        "github_auth",
        "github_access",
        "history",
        "hosting",
        "index",
        "ipc",
        "operation",
        "publish_domain",
        "recovery",
        "repository",
        "repository_access",
        "save_version",
        "status",
        "tooling",
        "branches",
        "watch",
    ] {
        assert!(
            modules.contains(required),
            "lib.rs must register the {required} module"
        );
    }

    let root_functions = root
        .items
        .iter()
        .filter_map(|item| match item {
            Item::Fn(function) => Some(function.sig.ident.to_string()),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(
        root_functions,
        ["run"],
        "lib.rs is the Tauri composition root; workflows belong in owning modules"
    );

    for (owner, entry) in [
        ("repository", "repository.rs"),
        ("github_auth", "github_auth.rs"),
        ("github_access", "github_access.rs"),
        ("credentials", "credentials.rs"),
        ("hosting", "hosting.rs"),
        ("status", "status.rs"),
        ("changes", "changes.rs"),
        ("history", "history.rs"),
        ("branches", "branches.rs"),
        ("save_version", "save_version.rs"),
        ("publish", "publish.rs"),
        ("recovery", "recovery/mod.rs"),
        ("conflicts", "conflicts/mod.rs"),
    ] {
        let mut imports = Vec::new();
        for file in module_files(&source_dir, entry) {
            let feature = parse(&file);
            for item in &feature.items {
                if let Item::Use(import) = item {
                    use_paths(&import.tree, "", &mut imports);
                }
            }
        }
        for forbidden in ["crate::ipc", "crate::watch", "tauri"] {
            assert!(
                imports.iter().all(|path| !path.starts_with(forbidden)),
                "{owner}.rs may not depend on {forbidden}; imports were {imports:?}",
            );
        }
        if owner != "repository" {
            assert!(
                imports
                    .iter()
                    .all(|path| !path.starts_with("crate::session")),
                "{owner}.rs may not depend on session transport state; imports were {imports:?}",
            );
        }
        assert!(
            imports.iter().all(|path| path != "crate::*"),
            "{owner}.rs must name its inward dependencies instead of importing the crate root: {imports:?}",
        );
        for import in &imports {
            let Some(root_name) = import
                .strip_prefix("crate::")
                .and_then(|path| path.split("::").next())
            else {
                continue;
            };
            assert!(
                modules.contains(root_name),
                "{owner}.rs imports `{import}` through a crate-root re-export; import its owning module explicitly",
            );
        }
    }

    let root_source = fs::read_to_string(source_dir.join("lib.rs")).expect("read lib.rs");
    for legacy_marker in [
        "fn parse_branch_refs",
        "fn plan_create_branch",
        "fn switch_branch",
        "fn delete_branch",
        "pub(crate) fn open_repository",
        "pub(crate) fn parse_status_records",
        "pub(crate) fn read_working_tree_status",
        "pub(crate) fn parse_diff_body",
        "pub(crate) fn read_file_diff",
        "pub(crate) fn read_working_tree_diffs",
        "pub(crate) fn list_unpublished_versions",
        "pub(crate) fn read_commit_file_changes",
        "pub(crate) fn read_commit_file_diff",
        "pub(crate) fn read_history_page",
        "pub(crate) fn read_saved_version_detail",
        "pub(crate) fn read_saved_version_file_diff",
        "pub(crate) fn plan_save_version",
        "pub(crate) fn save_version",
        "pub(crate) fn plan_publish",
        "pub(crate) fn publish",
    ] {
        assert!(
            !root_source.contains(legacy_marker),
            "Domain behavior must stay in its owning module: found {legacy_marker} in lib.rs",
        );
    }

    let ipc = parse(&source_dir.join("ipc.rs"));
    let mut ipc_imports = Vec::new();
    for item in &ipc.items {
        if let Item::Use(import) = item {
            use_paths(&import.tree, "", &mut ipc_imports);
        }
    }
    assert!(
        ipc_imports.iter().all(|path| path != "crate::*"),
        "ipc.rs must name the modules it adapts instead of depending on the crate-root facade"
    );
}

/// A module that was split into submodules must have gained something. The
/// property that makes the split worth its extra file is that each submodule is
/// a separate owner: shared code moves *up* into `mod.rs`, it is not reached
/// sideways. Without this, a directory is only a longer path to the same flat
/// namespace.
#[test]
fn split_modules_keep_their_submodules_independent() {
    let source_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut checked = 0;
    for entry in fs::read_dir(&source_dir).expect("read src") {
        let directory = entry.expect("read src entry").path();
        if !directory.is_dir() || !directory.join("mod.rs").is_file() {
            continue;
        }
        let siblings = module_files(
            &source_dir,
            &format!(
                "{}/mod.rs",
                directory
                    .file_name()
                    .and_then(|name| name.to_str())
                    .expect("directory name")
            ),
        )
        .into_iter()
        .skip(1)
        .collect::<Vec<_>>();
        let names = siblings
            .iter()
            .filter_map(|path| path.file_stem().and_then(|stem| stem.to_str()))
            .map(str::to_string)
            .collect::<BTreeSet<_>>();
        for path in &siblings {
            let file = parse(path);
            let mut imports = Vec::new();
            for item in &file.items {
                if let Item::Use(import) = item {
                    use_paths(&import.tree, "", &mut imports);
                }
            }
            let own = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .expect("file stem");
            for import in &imports {
                let Some(target) = import
                    .strip_prefix("super::")
                    .and_then(|rest| rest.split("::").next())
                else {
                    continue;
                };
                assert!(
                    target == own || !names.contains(target),
                    "{} reaches sideways into sibling submodule `{target}`; move what they share up into mod.rs",
                    path.display(),
                );
            }
            checked += 1;
        }
    }
    assert!(
        checked > 0,
        "no split module was inspected; this guard would pass vacuously"
    );
}
