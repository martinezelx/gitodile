# ADR 0043: Archive completed work by delivery version

- Status: accepted
- Date: 2026-10-31
- Amends: [ADR 0039](0039-position-gitodile-for-humans-and-their-agents.md), point 7's completed-work layout only
- Authority: maintainer request to group completed work by version, starting with 0.4.x and 0.5.x

## Context

The completed-task archive was flat. After closing the 0.5.0 implementation
phase, that layout obscures which release delivered a task. Existing rules and
the documentation checker explicitly disallowed version folders inside done.

Dates and the first administrative move into done can disagree with delivery:
207 still belonged to the 0.4.1 plan when 0.5.0 was prepared, and 142/143 closed
0.3.0 despite later paperwork. Task IDs must not be used as release ranges.

## Decision

1. Archive completed tasks in `work/done/<X.Y.Z>/`, flat within each plain
   release version. Each version has a README task index with its assignment
   evidence; `work/done/README.md` indexes the migrated versions.
2. Initially migrate verified 0.4.0, 0.4.1 and 0.5.0 records. Older records
   can remain in the archive root until their version migration is verified. New completed
   tasks use their version folder rather than expanding the legacy root.
3. Prefer explicit task/version scope and version-plan history, backed by the
   first released tag containing the completed delivery. Record exceptions
   for administrative closure lag; do not infer membership from modification
   dates, consecutive IDs, or abandoned provisional version names.
4. Preserve IDs, parents, completion dates, content, deferred criteria and
   assets. Keep assets in their existing location and repair all incoming and
   outgoing links when a task moves. Epics and children may span versions.
5. Keep pending version folders and `after-1.0` flat, with their current status
   and queue rules. The checker permits exactly one version level in done and
   continues checking every nested task's status, date, ID and parent.

This organization neither publishes a release nor claims deferred validation
has run. The 0.5.0 records retain ADR 0042's external qualification obligations.

## Consequences

- Completed work is browsable by release without duplicating task metadata.
- The first migration changes many relative links; documentation checks are
  required, and small regression tests guard the archive/planned boundary.
- The legacy root is intentionally transitional. Missing version evidence is
  visible instead of being replaced by a guessed assignment.

## Alternatives considered

- **Keep done flat and add only a version field.** Rejected by the maintainer's
  explicit preference for version folders.
- **Move all historical records based on dates or numeric ranges.** Rejected:
  releases, delayed closure and epics crossing versions make those ambiguous.
- **Nest tasks by epic inside each version too.** Rejected: one version level
  is sufficient; parent IDs already retain the hierarchy.

## Migration follow-up (2026-10-31)

At the maintainer's request, the remaining 0.1.x, 0.2.x and 0.3.x records were
migrated using the same policy: 82 records at 0.1.0, 46 at 0.2.2 and 26 at
0.3.0. The archive now holds all 248 completed records in version folders.
The legacy-root allowance is no longer needed by any current record.

Historical 0.2.x folder names follow the tag/notes normalization already
accepted in [ADR 0019](0019-publish-updates-through-one-channel.md); old package
metadata and original validation receipts are preserved. The indexes explain
the untagged 0.2.1 preparation, intermediate tags without newly completed task
records, delayed 142/143 paperwork and updater prototypes that did not ship
as originally designed. No release or platform-readiness claim is created by
archiving those completed phases.
