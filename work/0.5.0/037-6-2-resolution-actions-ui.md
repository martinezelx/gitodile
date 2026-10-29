---
id: 037-6-2
title: Put the resolve actions on the overlapping-changes screen
status: active
priority: high
type: feature
areas:
  - conflicts
  - frontend
  - accessibility
created: 2026-10-29
completed:
parent: "037-6"
queue: "01"
---

# Goal

Let the user keep a side, delete, mark a file resolved and reset it from the
overlapping-changes screen, seeing what a choice discards before making it.

# User outcome

The user resolves a merge's files without a terminal, can change their mind,
and is never surprised by what a button did.

# Context

Uses the commands of [037-6-1](../done/037-6-1-resolution-core.md) on the screen of
[037-3](../done/037-3-read-only-conflict-workspace.md). The look was decided in
the mockup review recorded in the parent [037-6](037-6-resolve-files.md).

# Scope

- An action bar under the file's header strip: Keep each side (named by its
  branch), Delete where a side deleted the path, a `⋯` menu holding Reset, and
  Mark resolved as the primary.
- Choosing a side asks in place, replacing the bar: what the other side loses,
  with its column dimmed and labelled, Cancel and the verb.
- After a choice the row and bar say which side was kept and that the file is
  not marked resolved yet.
- Mark resolved: a plain-language explanation the first time, technical
  details with the exact command, and a confirmation when markers remain.
- Reset: an `s` dialog in the `danger` tone, the safe fact last.
- Loading, running, stale, blocked and error states; the project mutation
  slot; one coordinated refresh; focus returns to the file.
- English and Spanish; `DESIGN.md` § Overlapping changes updated.

# Out of scope

- Opening the user's editor and the classes 037-6-3 blocks.

# Acceptance criteria

- [ ] Every allowed action is reachable with the keyboard and announces its
      result; nothing relies on hover or colour alone.
- [ ] A side choice names what it discards before it runs.
- [ ] Stale, locked and refused outcomes keep the screen honest and offer the
      way out.
- [ ] Both themes, both locales and the narrow layout are checked running.
- [ ] Frontend tests and `pnpm run check` pass.

# Relevant files

- `src/features/conflicts/`
- `DESIGN.md` § Dialogs, § Overlapping changes

# Dependencies

Task 037-6-1.

# Decisions

See the parent's decisions of 2026-10-29.

# Implementation notes

# Validation
