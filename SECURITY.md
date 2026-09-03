# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security vulnerability.

Report it privately through GitHub's
[private vulnerability reporting](https://github.com/martinezelx/gitodile-feedback/security/advisories/new).
The report is private to you and the maintainers. Publishing an advisory is a
separate, coordinated action; shipping a fix does not publish your report automatically.

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

## Español

No abras una incidencia pública para comunicar una vulnerabilidad. Usa el
[formulario privado de seguridad](https://github.com/martinezelx/gitodile-feedback/security/advisories/new).
Necesitas una cuenta de GitHub. El informe es privado para ti y los responsables
del proyecto; publicar un aviso de seguridad es una acción posterior coordinada.

Indica qué puede hacer un atacante, qué necesita para hacerlo, la versión de
GitOdile y del sistema operativo, y los pasos para reproducirlo, si los tienes.
GitOdile está en fase alfa; solo se mantiene la versión más reciente.
