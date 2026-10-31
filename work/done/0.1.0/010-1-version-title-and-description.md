---
id: "010-1"
title: "Separate saved-version title and description"
status: done
priority: medium
type: enhancement
areas:
  - rust
  - frontend
created: 2026-07-28
completed: 2026-07-29
parent: "010"
---

# 010-1 — Separate saved-version title and description

## Goal

Let the user give a saved version a concise required title and an optional
longer description when creating it.

This extends task 010's **Save version** flow. Task 011's **Publish changes**
flow may display this information, but must not edit it or rewrite history.

## Product decision

A Git commit message already supports the intended model:

- the first line is the saved-version title;
- a blank line separates it from an optional longer description/body.

Simple mode should call these fields **Version name** and **More details
(optional)**. Exact Git terminology may appear as secondary educational
information where useful.

The title identifies the saved version in compact lists and timelines. The
description provides context when the user opens its details. A description
must never be required merely to publish an existing saved version.

## User value

A user can:

1. give the version a short, scannable name;
2. optionally record why the change was made or anything collaborators should
   know;
3. review both values before saving;
4. see the same information later without changing commit history during
   publication.

## Scope

### Save-version interface

- Replace the current single description field with:
  - **Version name**, required and single-line;
  - **More details (optional)**, multiline.
- Keep the name visually primary and the details clearly optional.
- Preserve entered values if planning or saving returns a recoverable error.
- Keep keyboard order logical and make both fields accessible by label.
- Prevent accidental submission from inserting a newline into the name.
- Show useful length guidance without imposing an arbitrary hard limit that
  rejects valid Git messages.
- Keep all existing file-selection, preview, local-only, and safety behavior
  from task 010 unchanged.

### Commit-message construction

- Trim leading and trailing whitespace from the name.
- Reject an empty or whitespace-only name.
- Preserve intentional internal whitespace and line breaks in the optional
  details while removing meaningless leading/trailing blank space.
- Construct the Git message as:

  ```text
  <version name>

  <optional details>
  ```

- If details are empty, write only the name and do not append an unnecessary
  blank paragraph.
- Pass message data through safe process arguments or a dedicated temporary
  message file; never construct a shell command.
- Continue honoring hooks, signing, templates, and repository policy.

### Typed contracts

Update `SaveVersionPlan`, the execution command, and `SaveVersionResult` so the
frontend and Rust boundary use explicit fields:

- `title: string`;
- `description: string | null`.

Do not keep an ambiguous field named only `description` when it sometimes
means the complete commit message and sometimes only its first line.

Existing saved versions remain compatible:

- their first line is read as the title;
- their remaining message body is read as the optional description;
- commits with only a subject naturally have no description.

### Publish integration

The task 011 preview may show the title and optionally disclose the description
for versions being published.

Publishing must not offer inline editing of either value. Editing an existing
commit message rewrites its identifier and potentially every newer descendant,
so that is a separate future history-editing operation requiring its own
preview and recovery strategy.

## Safety model

Creating the saved version remains a **history mutation** governed by task 010:

1. preview the exact selected content;
2. require confirmation;
3. revalidate the state token;
4. create one additive local commit;
5. refresh status after success.

Splitting the message into two fields must not weaken index restoration,
working-file preservation, stale-plan detection, hook execution, or signing.

## Acceptance criteria

- [x] The save dialog has a required **Version name** field and optional
      **More details** field in English and Spanish.
- [x] Empty or whitespace-only names are rejected in both frontend and Rust.
- [x] Details can contain multiple paragraphs and non-ASCII text.
- [x] A title-only save creates a commit with no empty trailing paragraph.
- [x] A title plus details creates a conventional subject, blank line, and
      body commit message.
- [x] Recoverable planning/execution errors preserve both entered values.
- [x] The success state reports the saved title and can disclose its details.
- [x] Existing title-only commits continue to render correctly.
- [x] Publish previews display the saved title and disclose its optional
      description read-only.
- [x] No existing file-selection, state-token, index-restoration, hook,
      signing, or local-only behavior regresses.
- [x] Keyboard navigation, delayed-plan and success focus, validation, long
      content, and reduced-motion behavior are covered by implementation and
      automated tests. The final hands-on review remains listed below.

## Implementation note (2026-07-29)

`SavedVersionSummary` now carries an explicit `title` and optional
`description`. `git_log_summaries` reads `%s` and `%b` in one bounded process
and separates fields/records with NUL bytes, which cannot occur inside Git
commit messages. Pending-version and publish previews show the title compactly
and disclose the multiline description read-only when expanded.

The Rust execution boundary also rejects multiline titles independently of the
single-line HTML input. The dialog marks the title as required, provides
non-blocking length guidance, focuses it after delayed planning, and moves
focus to an announced success state after saving.

Automated validation after the completed pass: 117 frontend tests and 133 Rust
tests pass, together with TypeScript typechecking, the production frontend
build, `cargo fmt --check`, and Clippy with warnings denied.

## Required tests

### Rust

- Title-only message construction.
- Title and multiline-description construction.
- Whitespace normalization.
- Empty-title rejection.
- Non-ASCII title and description.
- Hook/signing failure behavior remains unchanged.
- State-token and index-restoration tests continue to pass.
- Reading an existing commit separates subject and body correctly.

### Frontend

- Required-name validation.
- Optional details and multiline input.
- Values preserved after recoverable errors.
- Success rendering with and without details.
- Spanish and English copy.
- Publish preview renders details read-only.
- Keyboard-only completion and focus restoration.

### Manual verification

- Save a title-only version in the sandbox repository and inspect its exact
  Git message.
- Save a version with multiline details and inspect its exact Git message.
- Open the publish preview and verify the information is readable but not
  editable.
- Cancel publication; do not mutate the sandbox remote.
- Verify light and dark themes.

## Out of scope

- Editing the message of an existing commit.
- Amend, rebase, squash, or rewriting descendant commits.
- AI-generated titles or descriptions.
- Mandatory templates or conventional-commit enforcement.
- Publishing changes directly from unsaved files.

## Dependencies

- Task 010: save-version planning, execution, and dialog.
- Task 011: read-only display in the publish preview.
- Existing history parsing used by pending-version summaries.

## Relevant files

- `work/done/0.1.0/010-save-version.md`
- `work/done/0.1.0/011-publish-changes.md`
- `src/saveVersion.ts`
- `src/saveVersionDialog.tsx`
- `src/saveVersionDialog.test.tsx`
- `src/publishDialog.tsx`
- `src/i18n.tsx`
- `src-tauri/src/lib.rs`
