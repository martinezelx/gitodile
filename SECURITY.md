# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security vulnerability.

Report it privately through GitHub's
[private vulnerability reporting](https://github.com/martinezelx/gitodile-feedback/security/advisories/new).
The report stays visible only to you and the maintainers until a fix ships.

Useful things to include:

- What an attacker can do, and what they need in order to do it.
- The GitOdile version and operating system you observed it on.
- Reproduction steps, if you have them.

GitOdile runs local Git operations against a user's own repositories and holds
repository paths, remote URLs and credential-helper interactions, so reports
touching credential handling, process execution or path handling are especially
welcome.

## Supported versions

GitOdile is in alpha. Only the most recent release is supported.
