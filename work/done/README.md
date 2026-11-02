# Completed work archive

Completed records are grouped by delivery version. Each version index records
its task list and the evidence used to assign that version.

| Version | Completed records | State |
| --- | --- | --- |
| [0.1.0](0.1.0/README.md) | 82 | Completed-record snapshot retained at v0.1.0 |
| [0.2.2](0.2.2/README.md) | 46 | Canonical historical name under ADR 0019; controlled qualification build |
| [0.3.0](0.3.0/README.md) | 26 | Completed-phase snapshot; includes 142/143's delayed release closure |
| [0.4.0](0.4.0/README.md) | 60 | Released; delivery verified against v0.4.0 |
| [0.4.1](0.4.1/README.md) | 18 | Released; includes 207's delayed administrative closure |
| [0.5.0](0.5.0/README.md) | 19 | Implementation closed; publication not performed, external qualification carried by ADR 0042 |

All 251 current completed records are now in version folders; there are no
loose task records in this archive root. New completed work goes in its
version folder. Assets stay in `work/assets/`.
See the [work rules](../README.md) and
[ADR 0043](../../docs/adr/0043-archive-completed-work-by-delivery-version.md).

## Migration validation

### First batch — 0.4.x and 0.5.x

2026-10-31: 94 records moved; their IDs, done status and original completion
dates were verified. Incoming/outgoing links were repaired and assets stayed
in place. Documentation checks cover 382 Markdown files and the same 271 task
IDs. `pnpm run check` passed with exit 0: four archive-layout regressions,
1,883 frontend tests, production build, Rust formatting/Clippy, 693 Rust
tests and two credential-helper integration tests. The existing explicit
real credential-store qualification remains ignored. `git diff --check`
was clean. No product commit, push or release was performed.

### Historical batch — 0.1.x, 0.2.x and 0.3.x

2026-10-31: the remaining 154 records were classified from retained tag
snapshots and explicit scope. All their frontmatter fields match the original
records (ignoring CRLF/LF representation); IDs, parents, status, dates and
qualification notes are preserved. Relative links were repaired throughout
the repository. Historical Git object paths keep their original meaning.

The 0.2.2 index explains ADR 0019's historical version normalization and the
intermediate tags without additional independently completed records. The
0.3.0 index distinguishes updater prototype/validation history from the later
snapshot retaining its completed phase. This does not claim that every
historical feature shipped or that external qualification passed.

`pnpm run check:docs` passed with exit 0, including the four existing archive
layout regressions and release/icon contracts. The final link/metadata check
covers 385 Markdown files and the same 271 task IDs; `git diff --check` is
clean. This follow-up changes documentation and paths only; no application or
checker code changed, and no product commit, push or release was performed.
