# Local work management

GitOdile tracks product and engineering work inside this directory. The repository is the source of truth; external issue trackers are optional mirrors, never required context.

Product names and example keys/paths in completed tasks were normalized to the
current spelling during the naming cleanup. Validation dates, results, and
commit references remain historical; Git history preserves their original text.

## Structure

- `backlog.md` — unrefined ideas and future work. Items here are not approved for implementation.
- `<X.Y.Z>/` — one flat folder per planned version (`0.5.0/`, `0.6.0/`,
  `0.7.0/`, `1.0.0/`) holding its approved tasks, `active` or `blocked`, and a
  `README.md` with the version's goal, queue and exit condition.
- `after-1.0/` — approved tasks deliberately scheduled after `1.0.0`, `planned`
  or `blocked`, with no queue position, and a `README.md` listing them.
- `done/` — completed tasks kept as a lightweight project history. It stays
  flat; it is not split by version.
- `templates/task.md` — template for new task files.

The version plan and the reason for this layout are in
[`docs/ROADMAP.md`](../docs/ROADMAP.md) and
[ADR 0039](../docs/adr/0039-position-gitodile-for-humans-and-their-agents.md).

## Task naming

Use a zero-padded numeric ID and a short kebab-case title:

```text
001-open-local-repository.md
002-detect-git-version.md
```

IDs are permanent and must not be reused, even after a task moves to `done/`.
A narrowly scoped child may append a suffix to its parent's ID (for example,
`010-1-version-title-and-description.md`); that full ID is also permanent and
unique.

An ID is identity, not priority or execution order. Gaps are intentional when a
task was folded into another one, and an older active ID may be implemented
after newer completed IDs. Never renumber history to make the folder look
sequential.

Active leaf tasks carry a two-digit `queue` value (`"01"`, `"02"`, ...) that
defines the ascending implementation order inside their version folder; each
version's queue starts at `01` and is contiguous. Queue positions and version
folders may change when dependencies or priorities change; IDs do not. Epics
have no queue position because their queued children carry the executable
work. An epic lives in the folder of the version that completes it; its
children may be spread across earlier versions.

Tasks belonging to a parent declare `parent: "NNN"`. New epic children must
also use the parent's suffixed ID (`NNN-1`, `NNN-2`, ...). Historical epics 022
and 038 predate that convention, so their already-permanent child IDs remain
023–031 and 039–051 while their `parent` metadata records the hierarchy.

Reserved IDs without their own task file are still burned: `062` was folded
into task 057 and `196` into task 195 by explicit request. The next unused
top-level ID after the current plan is `213`. Epic 206 owns tasks 037-2 and
037-4, which kept their IDs when they moved out of epic 037 on 2026-10-27.

The status bar's project initials and the Markdown change marks (bar and
tint, no sign) are fixed in
[212](done/212-status-bar-avatar-and-markdown-change-signs.md), completed
ahead of the queue at the user's request.

Overlapping wrapped diff lines and the code font the diff never drew in are
fixed in [205](done/205-diff-row-overlap-and-code-font.md), completed ahead of
the queue at the user's request.

Its follow-up, [203](done/203-settings-navigation-and-organization-refinement.md),
refines Navigation, adds Language & region, folds Line endings into Git, groups
the rail and unifies picker selection, completed ahead of the queue at the
user's request.

The Settings visual review, hosting-account wording and development-only
GitOdile demo controls are scoped in
[202](done/202-settings-visual-review-and-demo-account.md), completed ahead of
the queue at the user's request. It records the reference captures, iterative
visual review, final code fixes and passing aggregate validation.

The Markdown document preview in Changes is tracked in
[198](done/198-markdown-preview-in-changes.md), implemented ahead of the queue
at the user's request.

Its rendered before/after comparison follow-up is
[199](done/199-rendered-markdown-changes.md).
The single-document refinement is [200](done/200-unified-rendered-markdown-diff.md).
Navigation and bounded oversized-document excerpts are tracked in
[201](done/201-markdown-change-navigation-and-excerpts.md).

Deliberate notification reading and persistent silent history are complete in
[197](done/197-silent-notification-inbox.md), including the compact bulk-read
glyph and aligned row controls. Sound remains deferred by explicit user request.

The development-only GitOdile account sign-in mock is complete in
[140](done/140-account-sign-in-screens-and-mock.md). It preserves the supplied
HTML reference and implementation analysis under `assets/140-account-sign-in/`;
real authentication and browser pages remain separate future work.

The combined screen-entry motion, folder-view defaults and initial-selection
refinement is [195](done/195-calm-screen-entry-motion.md).

The completed branch vocabulary refactor and expanded pre-commit review are recorded in
[194](done/194-use-branches-throughout-project.md), including the bilingual
inventory, current stored format, historical material and validation evidence.

The current GitHub/GitLab epic is [148](after-1.0/148-connect-github-account.md). Its
original browser connection and completed follow-ups remain historical evidence;
the expanded epic tracks shared access, discovery, PRs and Actions separately.
GitHub integration is complete: browser/CLI plus native tokens
([148-9](done/148-9-github-token-connections.md)) and repository discovery
([148-5](done/148-5-provider-repository-browser.md)). GitLab/glab is also complete
([148-4](done/148-4-gitlab-accounts.md)). Corporate hosts (GitHub Enterprise
Server and GitLab Self-Managed) are complete in
[148-10](done/148-10-enterprise-and-self-managed-hosts.md). Bitbucket Cloud token
connections and discovery are implemented in
[148-11](after-1.0/148-11-bitbucket-token-connections.md), which waits only for
real-account qualification in `after-1.0/`. The PR and checks
screens ([148-6](after-1.0/148-6-pull-request-screen.md),
[148-7](after-1.0/148-7-actions-and-ci-screen.md)) and Bitbucket browser
authorization ([148-8](after-1.0/148-8-bitbucket-accounts.md)) wait in
`after-1.0/`.

## Workflow

1. Capture rough ideas in `backlog.md`.
2. Refine an idea into an individual task using `templates/task.md`.
3. Put approved work in the folder of the version that ships it with
   `status: active`, give each non-epic task one unique contiguous `queue`
   position in that folder, and list it in the folder's `README.md`. Approved
   work for after `1.0.0` goes in `after-1.0/` with `status: planned`.
4. Work on the lowest queued task of the earliest unfinished version whose
   dependencies are complete, one at a time unless the user explicitly
   approves parallel work.
5. Keep scope, acceptance criteria, decisions, and notes updated while implementing.
6. If work cannot continue, set `status: blocked`, remove its `queue` value,
   explain why, and leave it in its version folder; renumber that folder's
   queue so it stays contiguous.
7. Before completion, run `pnpm run check` and record the results honestly.
8. When complete, check the acceptance criteria, add implementation notes, set `status: done`, add `completed`, and move the file to `done/`.

## Agent rules

- Read `AGENTS.md`, `DESIGN.md`, relevant files under `docs/`, this file, and the selected active task before coding.
- Do not implement an item from `backlog.md` or `after-1.0/` unless it has been
  scheduled as `active` in a version folder or the user explicitly asks for it.
- Do not silently broaden scope.
- Record material scope changes and decisions in the task.
- Never mark an acceptance criterion complete unless it is actually satisfied.
- Never claim checks passed unless they were executed successfully.
- Keep durable product or architectural knowledge in `docs/`; task files should record execution-specific context.
- Do not delete completed task files. Move them to `done/`.
- Keep relative Markdown links valid after moving a task; `check:docs` enforces
  links, folder/status consistency, a README in every version folder, flat
  folders, completion dates, unique IDs, valid parents, and a unique
  contiguous queue per version folder.

## Status values

Use exactly one of:

- `active` — scheduled in a version folder;
- `blocked` — in a version folder or `after-1.0/`, with the blocker documented;
- `planned` — approved in `after-1.0/`, not scheduled yet;
- `done` — completed, in `done/`.

Backlog ideas do not require frontmatter until promoted into a task.
