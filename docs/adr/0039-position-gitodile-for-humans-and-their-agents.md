# ADR 0039: Position GitOdile for humans and their agents

- Status: accepted
- Date: 2026-10-27
- Supersedes: the working promise "Git without the fear" as the product's
  primary line; the `0.x` version markers and single global task queue in
  `docs/ROADMAP.md`.

## Context

Coding agents (Codex, Claude Code, Hermes and similar tools) now create
commits, branches, worktrees, merges and pull requests with little human
interaction. A Git client whose value is executing Git commands through
buttons loses relevance for the people who use those agents.

The agents do not remove the need for version-control understanding; they
move it. The person stops writing every change and starts supervising
changes made at a volume and speed they did not produce: many saved versions
in a short time, destructive commands run with confidence, parallel branches
and worktrees. GitOdile's primary audience, including AI-assisted builders who
do not know Git deeply, is the most exposed to those failures.

The product promise "Git without the fear" described the fear of Git itself
and no longer covers that problem. The roadmap also had no post-`1.0.0`
direction, and pending tasks were spread across `active/`, `blocked/` and
thematic subfolders with one global queue that was hard to read by release.

## Decision

1. **Direction.** GitOdile becomes a next-generation Git client: the control
   tower and safety net of a project for humans and their agents. It
   complements agents and does not become one. The direction has five pillars:
   safety net, review before publishing, understanding agent history, parallel
   work, and working alongside agents.
2. **Brand lines.** The in-app slogan is **"See everything. Undo anything."**
   (About and wherever the app shows its tagline). The website and store
   descriptor is **"The Git client for humans and their agents."**
3. **Sequence.** `1.0.0` keeps its existing scope: the ordinary,
   provider-neutral workflow at the level of GitHub Desktop. No agent-era
   feature is added before it ships. Conflict resolution in `1.0.0` matches
   GitHub Desktop (whole-file choices and the user's editor, with GitOdile's
   snapshots and plans); the three-pane editor moves to epic 206 after
   `1.0.0`. After it: `1.1` safety net, `1.2`
   understand, `1.3` publish with confidence (including pull requests and
   checks), `1.4` parallel work, `2.x` agent integration.
4. **Design seeds.** Without widening `1.0.0`, the recovery center (065-5) must
   not assume GitOdile created every recovery record, the restore planner
   (065-6) must accept a range of saved versions, and the watcher should be
   able to distinguish GitOdile's own changes from other tools'.
5. **Tiers.** The safety net and critical pre-publish alerts are Free. Hosting
   accounts and each project's pull-request and checks screen are Free.
   Sessions, the full review flow, parallel-work management, the cross-project
   inbox, in-app code review and agent integration are Pro. Shared rules and a
   team view of agent activity are Teams. The table lives in
   `docs/BUSINESS_MODEL.md`.
6. **Pull requests later.** Tasks 148-6 and 148-7 move after `1.0.0` and are
   designed as part of `1.3`, not as standalone screens.
7. **Work organization.** Pending tasks live in one flat folder per planned
   version (`work/0.5.0/`, `work/0.6.0/`, `work/0.7.0/`, `work/1.0.0/`) and
   in `work/after-1.0/` for approved but unscheduled tasks. Each folder has a
   README with its goal and exit condition and its own queue starting at `01`.
   Blocked is a task status, not a folder. `work/done/` stays flat.
   `scripts/check-docs.mjs` enforces the layout.

   The completed-work portion of point 7 was amended on 2026-10-31 by
   [ADR 0043](0043-archive-completed-work-by-delivery-version.md): completed
   records now use one folder per delivery version under `work/done/`, with
   a documented migration of older records. Pending-folder/queue rules stay.

## Consequences

- The value proposition no longer depends on executing Git commands for the
  user, which agents now do; it depends on visibility and recovery, which they
  do not provide.
- The beginner audience is kept: "humans and their agents" covers people
  without agents, and the safety net helps them as much as agent users.
- `1.0.0` stays reachable on its existing plan; agent-era work cannot leak into
  it without a new decision.
- Free gets stronger. Pro's value moves from individual advanced Git operations
  and provider integrations toward understanding and speed at volume; the Pro
  price must be revisited when that value ships.
- Moving pending work between versions now moves files. Relative links must be
  kept valid, and `check:docs` catches broken ones.
- The slogan still needs a public-use check before marketing relies on it.

## Alternatives considered

- **Keep competing as a beginner-friendly command client.** Rejected: that is
  the segment agents erode first.
- **Build GitOdile's own coding agent or AI commit flow.** Rejected: it
  competes with far larger products, AI commit messages are a commodity, and
  autonomous repository changes are against the product principles.
- **Put the safety net in Pro.** Rejected: the slogan would be false for Free
  users, the recovery story is the product's growth path, and charging to
  recover lost work contradicts the business model's principles.
- **Add agent features before `1.0.0`.** Rejected: it delays the foundation they
  depend on (recovery center, restore, conflicts).
- **Track the target version as a task field in flat `active/`/`blocked/`
  folders.** It avoids moving files, but the user preferred folders that show
  each version's scope directly.
