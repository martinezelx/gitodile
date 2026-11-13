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
- `done/<X.Y.Z>/` — completed tasks grouped by their delivery version, flat
  within each version, with a README index and the version-assignment evidence.
  The `done/README.md` indexes the archive. All currently completed records,
  including 0.1.x through 0.5.x, have been migrated; the archive root holds no
  loose tasks. Do not add new completed records outside their version folder.
- `templates/task.md` — template for new task files.

The version plan and the reason for this layout are in
[`docs/ROADMAP.md`](../docs/ROADMAP.md) and
[ADR 0039](../docs/adr/0039-position-gitodile-for-humans-and-their-agents.md),
with the completed-version archive amendment in
[ADR 0043](../docs/adr/0043-archive-completed-work-by-delivery-version.md).

## Assigning a completed version

Use the task's explicit version scope and retained version README, then the
release tags/history that show its completed delivery. A record's last edit,
completion date or first appearance in `done/` alone is not a release boundary:
207 belongs to 0.4.1 despite a late move after 0.5.0 preparation; 142/143 closed
the 0.3.0 release and do not become 0.4.0 work because their paperwork landed
later. A provisional branch/version that was never released is not a separate
archive for changes ultimately delivered in a later release.

Historical 0.2.x uses the canonical `0.2.N` names retained in tags/notes under
ADR 0019, even when the tagged package still contains `0.2.0-preview.N`.
An untagged preparation or an intermediate tag without a newly completed
record does not require an empty task folder. The version indexes distinguish
completed-phase snapshots from earlier prototypes and validation receipts;
neither an archive folder nor a done phase proves package qualification.

Each archived version's README records the evidence used. IDs, parent IDs,
completion dates, checked/deferred criteria and retained assets are preserved;
assets stay in `work/assets/`, and all incoming/outgoing links are repaired.
An epic belongs to the version that completes it; its children can be archived
under different versions. A candidate's implementation can be complete without
the version having been published, as in 0.5.0 under ADR 0042.

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
top-level ID after the current plan is `227`. Epic 206 owns tasks 037-2 and
037-4, which kept their IDs when they moved out of epic 037 on 2026-10-27.

Overview's line totals wear the diff's capsule and a capsule reads as one shape,
in [223](done/0.5.0/223-overview-totals-as-the-diff-capsule.md). The Markdown
preview is compact and joins its blocks, in
[224](done/0.5.0/224-compact-markdown-preview.md), reaches History, in
[225](done/0.5.0/225-markdown-preview-in-history.md), and marks changed words and
folds unchanged runs with the text diff's own marks, in
[226](done/0.5.0/226-changed-words-and-folds-in-markdown.md), all completed on
2026-11-04 at the user's request.

Every pair of glyph tones stays a clear step apart in all twelve themes, the
empty version ring is one token and an open folder drops its change dots, in
[222](done/0.5.0/222-colour-system-review.md), completed on 2026-11-03 at the
user's request.

Application updates have one home, Settings › Updates, in
[221](done/0.5.0/221-one-home-for-app-updates.md), completed on 2026-11-03 ahead
of the queue at the user's request (ADR 0044).

Text diffs and rendered Markdown mark each change run with one filled or
outlined capsule, joining a removal into its addition, in
[217](done/0.5.0/217-diff-capsules-and-joined-replacements.md), completed on
2026-11-02. Its follow-up [218](done/0.5.0/218-diff-capsule-refinements.md)
aligns the arrival contour and fragment marks with the capsules.

The console mascot moves between the welcome and the watermark, with rain
through its whole column and the project's version ids as digits, in
[219](done/0.5.0/219-console-mascot-motion.md), completed on 2026-11-02.

Project switching freshness, explicit empty startup selection and console-session
retention are complete in [216](done/0.5.0/216-project-switching-freshness-and-console-state.md),
implemented ahead of the queue at the user's request on 2026-11-02.

Exact changed fragments, changed spacing, comparison headings and navigation
cues are complete in [215](done/0.5.0/215-text-diff-detail-and-orientation.md),
reviewed in the running desktop app on 2026-11-02.

All visual text diffs now share Markdown's solid/dashed bars and tint in
[214](done/0.5.0/214-text-diff-bars-and-tint.md), completed on 2026-11-02.

The status bar's project initials and the Markdown change marks (bar and
tint, no sign) are fixed in
[212](done/0.5.0/212-status-bar-avatar-and-markdown-change-signs.md), completed
ahead of the queue at the user's request.

Overlapping wrapped diff lines and the code font the diff never drew in are
fixed in [205](done/0.4.1/205-diff-row-overlap-and-code-font.md), completed ahead of
the queue at the user's request.

Its follow-up, [203](done/0.4.1/203-settings-navigation-and-organization-refinement.md),
refines Navigation, adds Language & region, folds Line endings into Git, groups
the rail and unifies picker selection, completed ahead of the queue at the
user's request.

The Settings visual review, hosting-account wording and development-only
GitOdile demo controls are scoped in
[202](done/0.4.1/202-settings-visual-review-and-demo-account.md), completed ahead of
the queue at the user's request. It records the reference captures, iterative
visual review, final code fixes and passing aggregate validation.

The Markdown document preview in Changes is tracked in
[198](done/0.4.1/198-markdown-preview-in-changes.md), implemented ahead of the queue
at the user's request.

Its rendered before/after comparison follow-up is
[199](done/0.4.1/199-rendered-markdown-changes.md).
The single-document refinement is [200](done/0.4.1/200-unified-rendered-markdown-diff.md).
Navigation and bounded oversized-document excerpts are tracked in
[201](done/0.4.1/201-markdown-change-navigation-and-excerpts.md).

Deliberate notification reading and persistent silent history are complete in
[197](done/0.4.1/197-silent-notification-inbox.md), including the compact bulk-read
glyph and aligned row controls. Sound remains deferred by explicit user request.

The development-only GitOdile account sign-in mock is complete in
[140](done/0.4.1/140-account-sign-in-screens-and-mock.md). It preserves the supplied
HTML reference and implementation analysis under `assets/140-account-sign-in/`;
real authentication and browser pages remain separate future work.

The combined screen-entry motion, folder-view defaults and initial-selection
refinement is [195](done/0.4.1/195-calm-screen-entry-motion.md).

The completed branch vocabulary refactor and expanded pre-commit review are recorded in
[194](done/0.4.0/194-use-branches-throughout-project.md), including the bilingual
inventory, current stored format, historical material and validation evidence.

The current GitHub/GitLab epic is [148](after-1.0/148-connect-github-account.md). Its
original browser connection and completed follow-ups remain historical evidence;
the expanded epic tracks shared access, discovery, PRs and Actions separately.
GitHub integration is complete: browser/CLI plus native tokens
([148-9](done/0.4.0/148-9-github-token-connections.md)) and repository discovery
([148-5](done/0.4.0/148-5-provider-repository-browser.md)). GitLab/glab is also complete
([148-4](done/0.4.0/148-4-gitlab-accounts.md)). Corporate hosts (GitHub Enterprise
Server and GitLab Self-Managed) are complete in
[148-10](done/0.4.0/148-10-enterprise-and-self-managed-hosts.md). Bitbucket Cloud token
connections and discovery are implemented in
[148-11](after-1.0/148-11-bitbucket-token-connections.md), which waits only for
real-account qualification in `after-1.0/`. The PR and checks
screens ([148-6](after-1.0/148-6-pull-request-screen.md),
[148-7](after-1.0/148-7-actions-and-ci-screen.md)) and Bitbucket browser
authorization ([148-8](after-1.0/148-8-bitbucket-accounts.md)) wait in
`after-1.0/`.

The additional frontend-only review of the completed 0.5.0 implementation is
[213](0.5.1/213-frontend-flow-and-visual-review.md). It treats the backend as
correct and keeps new runtime evidence separate from historical captures.
Its temporary HTML previews were removed after design approval; the task
retains the implementation and validation record.

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
8. When complete, check satisfied acceptance criteria, add implementation notes,
   set `status: done`, add `completed`, and move the file to `done/<X.Y.Z>/`.
   Add it to that version's README, preserving any explicitly accepted deferred
   criteria as unchecked with their receiving owner and ADR.

## Agent rules

- Read `AGENTS.md`, `DESIGN.md`, relevant files under `docs/`, this file, and the selected active task before coding.
- Do not implement an item from `backlog.md` or `after-1.0/` unless it has been
  scheduled as `active` in a version folder or the user explicitly asks for it.
- Do not silently broaden scope.
- Record material scope changes and decisions in the task.
- Never mark an acceptance criterion complete unless it is actually satisfied.
- Never claim checks passed unless they were executed successfully.
- Keep durable product or architectural knowledge in `docs/`; task files should record execution-specific context.
- Do not delete completed task files. Move them to `done/<X.Y.Z>/`.
- Keep relative Markdown links valid after moving a task; `check:docs` enforces
  links, folder/status consistency, a README in every version folder, flat
  planned folders and completed-version folders, completion dates, unique IDs,
  valid parents, and a unique
  contiguous queue per version folder.

## Status values

Use exactly one of:

- `active` — scheduled in a version folder;
- `blocked` — in a version folder or `after-1.0/`, with the blocker documented;
- `planned` — approved in `after-1.0/`, not scheduled yet;
- `done` — completed, in `done/<X.Y.Z>/` (or the legacy `done/` root pending migration).

Backlog ideas do not require frontmatter until promoted into a task.
