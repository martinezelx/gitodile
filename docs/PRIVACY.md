# Privacy policy

Last updated: 2026-10-24

GitOdile is a local-first desktop Git client. Repository contents, paths,
history, settings and recovery records stay on the user's device unless the
user explicitly starts an operation that communicates with a configured Git
remote or opens an external service.

GitOdile does not require a GitOdile account and does not include product
analytics, advertising trackers or telemetry.

The notification inbox retains up to 50 notices locally, including project
names/paths, event metadata and read states, until removed or displaced by newer
notices. It also retains one acknowledged app-update version to prevent repeated
alerts after its notice is removed. Detailed error reasons are not persisted.
Turning notification recording off preserves the existing inbox and stops new
collection. Nothing in this history is uploaded, and viewing it starts no
network request. Notifications do not play sounds.

The application can contact:

- a user-configured Git remote when the user clones, fetches, pulls or pushes;
- GitHub for a read-only access check after the user edits a complete GitHub
  address or its connection in Clone project, or requests a retry. The check
  uses the chosen credentials, downloads no project contents, is cancellable
  and is never triggered just by opening the overlay;
- the configured GitOdile update feed when update checks are enabled;
- the public GitHub repository when the user chooses to report an
  issue or security problem.
- GitHub when the user explicitly detects/checks GitHub CLI accounts, activates
  a saved account, signs out, or starts browser authorization from Settings.
- A connected account's profile picture host when that connection is made or
  verified (after launch or on Check connections): GitHub's avatar CDN, a GitHub
  Enterprise Server or GitLab instance's own host, or Bitbucket's Atlassian
  avatar CDN. The request carries no credential. Gravatar is never contacted
  ([ADR 0038](adr/0038-hosting-account-profile-pictures.md)).
- GitHub's API when the user connects/checks a personal token, or explicitly
  finds, refreshes or pages through projects in the clone browser.

GitHub browser connections use the shared GitHub CLI session. GitOdile keeps account
metadata for saved accounts and their active selection in memory. Access tokens
never reach the renderer, and GitOdile does not include account
identity, temporary authorization codes or raw authentication output in diagnostic
reports. GitHub CLI owns credential persistence and can fall back to a plaintext
file if its system credential store fails. This is disclosed before connecting
and when a file-backed credential is detected. Opening Settings initiates no
GitHub authentication network check. Public account pictures are fetched by a
bounded native client without an authentication token or redirects. The last good
picture of each connected account is kept in the app cache directory, and is
deleted when that connection is signed out or removed. The renderer displays
inline image data. Sign-out removes only the selected
account's local shared gh credentials, leaving the browser session and GitHub
authorization active. gh may activate another saved account, which is checked
and displayed. Selecting a saved account updates gh's local active-account
configuration and therefore affects other tools using its session. The subsequent
check verifies the selection; opening Settings only displays the cached list. See
[ADR 0021](adr/0021-reuse-github-cli-authentication.md).

Native personal-token connections work without gh. A masked input sends the
token once to Rust and clears immediately; it is never returned to the renderer.
GitOdile verifies the token's
GitHub identity before saving a token in Windows Credential Manager, macOS
Keychain or Linux Secret Service, with no plaintext fallback. Local metadata
contains the login and connection identifier. Tokens never enter renderer
persistence, command arguments, environment variables or diagnostic reports.
Removing a native connection removes only its local token, without revoking it
on GitHub. See [ADR 0023](adr/0023-add-native-github-tokens-and-repository-discovery.md).

Project-specific HTTPS account selections are saved as local metadata under the
native application configuration directory, indexed by a canonical-path digest.
They contain provider/account identifiers, not tokens or raw project paths.
These selections do not switch gh's active account. When Git requests credentials
for a selected account, a bounded native helper reads that exact connection's token
and answers Git through its private credential pipe. Browser connections read gh's
store; optional native token connections read the operating system secure store.
Retrieved tokens do not enter command arguments, environment variables, IPC or
diagnostics. Other hosts and SSH retain their existing setup. See
[ADR 0022](adr/0022-share-provider-accounts-and-scope-git-access.md).

Issue reports are reviewed by the user before submission. GitOdile excludes
project paths, source code and remote URLs from the generated report. GitHub's
own terms and privacy policy apply after the user opens or submits through
GitHub.

The project's build and release services process maintainer credentials and
release artifacts, not end-user repositories. Public release artifacts,
checksums and evidence are retained to keep published versions independently
verifiable. GitHub retains workflow and security records according to the
repository and account settings.

Privacy or security questions may be reported through the private vulnerability
reporting channel in
[martinezelx/gitodile](https://github.com/martinezelx/gitodile/security/advisories/new).
