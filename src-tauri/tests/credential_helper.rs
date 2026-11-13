//! Real Git's helper protocol against the actual desktop binary, with a fake
//! gh executable. No real account, network, keychain or configuration is used.
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// A helper program from `src-tauri/examples/`, which Cargo builds with this
/// test binary for `cargo test`. The same search as `test_support::example_binary`,
/// which this integration test cannot reach.
fn example_binary(name: &str) -> std::path::PathBuf {
    use std::path::{Path, PathBuf};
    let test_binary = std::env::current_exe().expect("locate the test binary");
    // A plain `cargo test` may also link `<name>` beside the hashed
    // `<name>-<hash>` build; the newest of them is the current source.
    let built = |file: &str| {
        let stem = file.strip_suffix(std::env::consts::EXE_SUFFIX)?;
        let hash = stem.strip_prefix(name)?;
        (hash.is_empty()
            || hash.strip_prefix('-').is_some_and(|hash| {
                hash.len() == 16 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
            }))
        .then_some(())
    };
    // Cargo's original layout keeps examples in `<profile>/examples`; the
    // newer one gives every unit its own `<profile>/build/<package>/<hash>`.
    fn collect(
        directory: &Path,
        depth: usize,
        found: &mut Vec<PathBuf>,
        built: &dyn Fn(&str) -> Option<()>,
    ) {
        for entry in fs::read_dir(directory).into_iter().flatten().flatten() {
            let path = entry.path();
            if path.is_dir() {
                if depth > 0 {
                    collect(&path, depth - 1, found, built);
                }
            } else if built(&entry.file_name().to_string_lossy()).is_some() {
                found.push(path);
            }
        }
    }
    let newest_under = |directory: &Path| {
        let mut found = Vec::new();
        collect(directory, 2, &mut found, &built);
        found.into_iter().max_by_key(|path| {
            fs::metadata(path)
                .and_then(|metadata| metadata.modified())
                .ok()
        })
    };
    test_binary
        .ancestors()
        .skip(1)
        .find_map(newest_under)
        .unwrap_or_else(|| {
            panic!(
                "{name} is not built near {}: run `cargo test` without `--lib`, or `cargo build --examples` first",
                test_binary.display()
            )
        })
}

#[test]
fn azure_binary_refuses_wrong_organization_before_lookup_and_stops_git_fallback() {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(b"contoso");
    let id = format!(
        "azo-{}:token.11111111-1111-1111-1111-111111111111",
        digest
            .iter()
            .take(10)
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    );
    let binary = env!("CARGO_BIN_EXE_gitodile").replace('\\', "/");
    let helper = format!(
        "!{} --gitodile-credential-helper {} dev.azure.com/contoso",
        quote(&binary),
        quote(&id)
    );
    let root = std::env::temp_dir().join(format!("gitodile-azure-helper-{}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    for path in [
        "other/project/_git/repo",
        "contoso-other/project/_git/repo",
        "contoso/%2e%2e/_git/repo",
        "contoso/P/_git/R\npath=other/P/_git/R",
    ] {
        let mut child = Command::new("git")
            .args([
                "-c",
                "credential.helper=",
                "-c",
                &format!("credential.helper={helper}"),
                "-c",
                "credential.helper=!echo username=fallback; echo password=unexpected_fallback",
                "-c",
                "credential.useHttpPath=true",
                "credential",
                "fill",
            ])
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", root.join("empty.gitconfig"))
            .env("GIT_TERMINAL_PROMPT", "0")
            .current_dir(&root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(
                format!("protocol=https\nhost=dev.azure.com\nusername=gitodile\npath={path}\n\n")
                    .as_bytes(),
            )
            .unwrap();
        let output = child.wait_with_output().unwrap();
        assert!(!output.status.success());
        assert!(output.stdout.is_empty());
        assert!(!String::from_utf8_lossy(&output.stderr).contains("unexpected_fallback"));
    }
    fs::remove_dir_all(root).unwrap();
}

fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// A loopback-only Git endpoint that challenges authentication, then advertises an empty
/// repository. It accepts only the fixture account; no real secret is involved.
fn serve_auth_challenge(listener: TcpListener) -> bool {
    listener.set_nonblocking(true).unwrap();
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        let (mut stream, _) = match listener.accept() {
            Ok(connection) => connection,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(10));
                continue;
            }
            Err(_) => return false,
        };
        // Windows accepted sockets inherit the listener's nonblocking mode.
        // Wait for Git's request under the timeout rather than racing its send.
        stream.set_nonblocking(false).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        stream
            .set_write_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let mut request = Vec::new();
        let mut chunk = [0; 1024];
        while request.len() < 8192 && !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
            let count = stream.read(&mut chunk).unwrap();
            if count == 0 {
                return false;
            }
            request.extend_from_slice(&chunk[..count]);
        }
        let authenticated = String::from_utf8_lossy(&request).lines().any(|line| {
            line.split_once(':').is_some_and(|(name, value)| {
                name.eq_ignore_ascii_case("Authorization")
                    && value.trim()
                        == "Basic SW5hY3RpdmVVc2VyOmZpeHR1cmVfc2VjcmV0X2Zvcl9pbmFjdGl2ZV9hY2NvdW50"
            })
        });
        if authenticated {
            let body = "001e# service=git-upload-pack\n00000000";
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/x-git-upload-pack-advertisement\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            return true;
        }
        stream.write_all(b"HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=fixture\r\nWWW-Authenticate: Basic\trealm=second-fixture\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
    }
    false
}

#[test]
fn desktop_helper_works_with_real_git_and_an_exact_inactive_account() {
    let root =
        std::env::temp_dir().join(format!("gitodile helper 'quoted' {}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    let fake = root.join(if cfg!(windows) { "gh.exe" } else { "gh" });
    fs::copy(example_binary("test_fake_gh_inactive_account"), &fake).unwrap();
    let executable = root.join(if cfg!(windows) {
        "GitOdile.exe"
    } else {
        "GitOdile"
    });
    fs::copy(env!("CARGO_BIN_EXE_gitodile"), &executable).unwrap();
    let path = std::env::join_paths(
        std::iter::once(root.clone())
            .chain(std::env::split_paths(&std::env::var_os("PATH").unwrap())),
    )
    .unwrap();
    let helper = format!(
        "!{} --gitodile-credential-helper github:InactiveUser",
        quote(&executable.to_string_lossy().replace('\\', "/"))
    );
    let mut child = Command::new("git")
        .args([
            "-c",
            "credential.https://github.com/team.helper=!printf 'username=other-user\\npassword=other_user_secret\\n\\n'",
            "-c",
            "credential.https://github.com.helper=",
            "-c",
            &format!("credential.https://github.com.helper={helper}"),
            "-c", "credential.https://github.com.username=InactiveUser",
            "credential",
            "fill",
        ])
        .env("PATH", &path)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", root.join("empty.gitconfig"))
        .env("GH_TOKEN", "must_not_override_selected_account")
        .env("GH_DEBUG", "api")
        .env("GIT_TERMINAL_PROMPT", "0")
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(b"protocol=https\nhost=github.com\npath=team/repo.git\n\n")
        .unwrap();
    let result = child.wait_with_output().unwrap();
    assert!(
        result.status.success(),
        "Git helper failed: {}",
        String::from_utf8_lossy(&result.stderr)
    );
    assert!(result
        .stdout
        .windows(b"password=fixture_secret_for_inactive_account".len())
        .any(|w| w == b"password=fixture_secret_for_inactive_account"));
    assert!(!root.join("empty.gitconfig").exists());
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = std::thread::spawn(move || serve_auth_challenge(listener));
    // Only this fixture translates loopback HTTP into the adapter's fixed HTTPS
    // host. Real Git generates capabilities and WWW-Authenticate attributes;
    // production's host/protocol checks remain unchanged.
    let http_helper = format!(
        "!sed -e 's/^protocol=http$/protocol=https/' -e 's/^host=127[.]0[.]0[.]1:{port}$/host=github.com/' | {} --gitodile-credential-helper github:InactiveUser",
        quote(&executable.to_string_lossy().replace('\\', "/"))
    );
    let http = Command::new("git")
        .args([
            "-c",
            "credential.helper=",
            "-c",
            &format!("credential.helper={http_helper}"),
            "-c",
            "credential.username=InactiveUser",
            "-c",
            "credential.useHttpPath=true",
            "-c",
            "http.proxy=",
            "ls-remote",
            &format!("http://127.0.0.1:{port}/fixture.git"),
        ])
        .env("PATH", &path)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_GLOBAL", root.join("empty.gitconfig"))
        .env("GIT_TERMINAL_PROMPT", "0")
        .current_dir(&root)
        .stdin(Stdio::null())
        .output()
        .unwrap();
    assert!(
        server.join().unwrap(),
        "Git did not authenticate with the fixture identity"
    );
    assert!(
        http.status.success(),
        "Loopback Git challenge failed: {}",
        String::from_utf8_lossy(&http.stderr)
    );
    // HTTP authentication (unlike a basic `credential fill`) supplies multiple
    // capabilities. Exercise the actual desktop parser with that wire request.
    let mut challenged = Command::new(&executable)
        .args(["--gitodile-credential-helper", "github:InactiveUser", "get"])
        .env("PATH", &path)
        .env("GH_TOKEN", "must_not_override_selected_account")
        .env("GH_DEBUG", "api")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    challenged.stdin.take().unwrap().write_all(
        b"capability[]=authtype\ncapability[]=state\nprotocol=https\nhost=github.com\nusername=InactiveUser\nwwwauth[]=Basic\trealm=GitHub\nfuture=first\nfuture=second\nstate[]=opaque-\xff\n\n",
    ).unwrap();
    let challenged = challenged.wait_with_output().unwrap();
    assert!(challenged.status.success());
    assert_eq!(
        challenged.stdout,
        b"username=InactiveUser\npassword=fixture_secret_for_inactive_account\n\n"
    );
    let fallback = "!printf 'username=other-user\\npassword=other_user_secret\\n\\n'";
    for (denied_helper, input) in [
        (
            helper.clone(),
            "protocol=https\nhost=github.com.evil.test\nusername=InactiveUser\n\n",
        ),
        (
            helper.replace("github:InactiveUser", "github:MissingUser"),
            "protocol=https\nhost=github.com\nusername=MissingUser\n\n",
        ),
        (
            helper.clone(),
            "protocol=https\nhost=github.com\nusername=other-user\n\n",
        ),
    ] {
        let mut denied = Command::new("git")
            .args([
                "-c",
                "credential.helper=",
                "-c",
                &format!("credential.helper={denied_helper}"),
                "-c",
                &format!("credential.helper={fallback}"),
                "credential",
                "fill",
            ])
            .env("PATH", &path)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", root.join("empty.gitconfig"))
            .env("GIT_TERMINAL_PROMPT", "0")
            .current_dir(&root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        denied
            .stdin
            .take()
            .unwrap()
            .write_all(input.as_bytes())
            .unwrap();
        let denied = denied.wait_with_output().unwrap();
        assert!(!denied.status.success());
        assert!(denied.stdout.is_empty());
        assert!(!String::from_utf8_lossy(&denied.stderr).contains("other_user_secret"));
    }
    fs::remove_dir_all(root).unwrap();
}
