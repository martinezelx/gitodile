# AGENTS.md

This file is the primary operating guide for AI coding agents working on GitOdile.

Read [`docs/PRODUCT_STRATEGY.md`](docs/PRODUCT_STRATEGY.md) for the durable
product thesis, audience, positioning, and competitive context. Keep this file
focused on rules agents can apply while making changes.

## Mission

Build a cross-platform desktop Git client that makes version control understandable and safe for beginners, non-developers, students, AI-assisted builders, designers, and developers who prefer a calmer workflow.

GitOdile must not merely map Git commands to buttons. It should translate user intent into safe Git operations.

Examples:

- “Save a version” may create a commit.
- “Publish changes” may push the current branch.
- “Get project changes” may fetch and integrate remote changes.
- “Try this separately” may create a branch.
- “Go back to this moment” may use revert, reset, checkout, or a recovery branch depending on context.

The UI should explain what will happen and preserve a recovery path whenever reasonably possible.

## Product positioning

Working name: **GitOdile**

Slogan (in the app): **See everything. Undo anything.**

Descriptor (website and store listings): **The Git client for humans and their agents.**

Direction: a next-generation Git client that is the control tower and safety
net of a project, whether a person or a coding agent did the work. `1.0.0`
reaches the ordinary workflow first; agent-era features come after it. See
"The agent-era direction" in `docs/PRODUCT_STRATEGY.md` and
[ADR 0039](docs/adr/0039-position-gitodile-for-humans-and-their-agents.md).

The crocodile mascot should feel confident and friendly, not childish. Branding may use small moments of personality, but the product must remain credible for professional work.

## Target users

Primary:

- People who write or modify software without understanding Git deeply.
- AI-assisted builders using tools such as coding agents and app generators.
- Junior developers and students.
- Designers, writers, game developers, and other collaborators working inside repositories.

Secondary:

- Experienced developers who want a fast, focused desktop Git client.
- Small teams that value safe workflows and simple onboarding.

## Core product principles

1. **Use human language by default.**
   Do not lead with commit, rebase, detached HEAD, reflog, upstream, or fast-forward unless advanced mode is enabled or the term is necessary.

2. **Never hide consequences.**
   Simplify terminology, but clearly explain whether an action changes local files, history, a remote repository, or teammates' work.

3. **Safety before cleverness.**
   Before destructive or history-rewriting operations, create or offer a recovery point. Never run a destructive command merely because it produces a cleaner implementation.

4. **Progressive disclosure.**
   The default interface should be approachable. Advanced users must still be able to inspect exact branches, commits, remotes, and commands.

5. **Local-first and privacy-conscious.**
   Repository data stays local unless the user explicitly invokes a remote or cloud feature. AI features must be optional and transparent about transmitted data.

6. **Cross-platform behavior is part of correctness.**
   Handle paths, line endings, credentials, symlinks, filesystem casing, file locks, and process behavior across Windows, macOS, and Linux.

7. **Performance matters, but UX matters more.**
   Rust and Tauri are implementation choices, not the customer-facing value proposition.

## Technical direction

### Frontend

- React + TypeScript + Vite.
- Functional components and hooks.
- Keep domain logic out of visual components.
- Prefer accessible primitives and semantic HTML.
- Use CSS variables as design tokens.
- Avoid a large UI framework until the interaction model stabilizes.
- Register every screen in `src/app/screens.tsx`. Navigation, the command
  palette, idle chunk prefetching, the open-project guard, and keep-alive
  mounting all derive from that table; a screen wired up by hand will silently
  miss them. See "Screen shell and navigation cost" in `docs/ARCHITECTURE.md`.
- Follow `docs/architecture/frontend-feature-guide.md`: feature-owned screen
  descriptors use the neutral runtime/lifecycle contracts, and hidden screens
  must suspend polling, costly effects, subscriptions, and announcements.
- Never fetch merely because a screen became visible. Render the cached
  snapshot; refresh on project activation or an explicit repository
  invalidation, idle-deferred where it is speculative. The one exception is
  the background verification of saved hosting accounts after launch
  ([ADR 0027](docs/adr/0027-verify-saved-accounts-after-launch.md)).
- Visual components do not call `invoke`. A feature reaches Rust through its own
  typed port and `tauriAdapter.ts`. The only direct calls left in
  `src/app/App.tsx` are watcher and session lifecycle wiring, which the
  composition root owns.
- `src/app/App.tsx` is the app composition root and renders no screen body.
  Home and Overview own eager feature containers; the other functional screens own lazy
  containers, and the screen contract has no `host-owned` escape hatch. A new
  screen owns its own container; see the measured footprint table in
  `docs/architecture/frontend-feature-guide.md` §8 before starting one.
- Overlay panels are eager. `React.lazy` attaches to its loader on first
  render, so a warmed module still suspends for a tick, and an overlay opens
  from a click with no navigation to mask that fallback frame. Code-split an
  overlay only against a measured entry-chunk problem, never for tidiness.
- Lists that can grow with repository size must stay virtualized. Rust caps the
  working-tree payload at 1,000 entries and the DOM budget is 400 rendered rows,
  so a cap is not a substitute for virtualization.

### Desktop shell

- Tauri 2.
- Use narrow commands between frontend and Rust.
- Validate all command inputs in Rust.
- Keep Tauri capabilities minimal and explicit.
- Keep the production body of `src-tauri/src/lib.rs` registration-only. It may declare modules,
  configure plugins/state, register handlers, and start Tauri; workflows belong
  to their owning module.
- `ipc.rs` is a transport adapter. It names the modules it adapts, performs
  session/transport validation, and delegates immediately; never restore a
  `use crate::*` facade.
- `git_command.rs` is the policy-aware facade over the bounded process runner
  in `git.rs`. System-Git settings belong in `tooling.rs`, watcher orchestration
  in `watch.rs`, desktop-shell services in `desktop.rs`, shared mutation
  vocabulary in `operation.rs`, and temporary-index preparation in `index.rs`.
- Keep a Rust module in one file until it holds two separate owners, not until
  it gets long. A directory earns its place when the split makes helpers private
  to one owner that the other should never call; whatever they share moves up
  into `mod.rs`, and a submodule importing a sibling fails the build.

### Git integration

Initial strategy:

- Use the system Git executable.
- Detect and report the installed Git version.
- Execute Git through a dedicated Rust service.
- Use machine-readable output where available.
- Set locale/environment explicitly where output parsing depends on it.
- Never construct shell strings from user input; pass arguments as separate process arguments.

Longer-term options may include `gitoxide`, `git2-rs`, or a hybrid implementation. Do not migrate away from system Git without an ADR explaining compatibility, credential, performance, and maintenance trade-offs.

### External references

GitButler is the primary product and engineering reference for complex desktop
Git problems, not a specification for GitOdile. When a task involves repository
watching, asynchronous work, conflicts, recovery, large repositories, packaging,
updates, or Tauri/Rust boundaries:

1. Define the concrete GitOdile problem first.
2. Study the smallest relevant part of GitButler's public implementation.
3. Identify the reason for its design and extract the reusable principle.
4. Implement the smallest independent solution appropriate for GitOdile.

Do not copy its monorepo structure, advanced workflow model, source code, visual
assets, branding, or product language. Check applicable licenses before adapting
any protected material, and record significant architectural conclusions in an
ADR.

### Architecture boundaries

Keep these concerns separated:

- `repository`: repository discovery and metadata.
- `status`: working tree and index state.
- `history`: commits, branches, tags, and timeline.
- `changes`: file changes and diffs.
- `sync`: remotes, fetch, pull/integration, and push.
- `recovery`: snapshots, safety branches, restore operations, and reflog-backed recovery.
- `conflicts`: conflict detection and resolution.
- `platform`: OS-specific behavior.
- `credentials`: authentication and secret storage integration.

See `docs/ARCHITECTURE.md`.

## UX vocabulary

Default simple-mode wording:

| Git concept | Default user-facing wording |
| --- | --- |
| repository | project |
| commit | saved version |
| commit changes | save version |
| push | publish changes |
| fetch/pull | get project changes |
| branch | branch / rama |
| checkout/switch | switch branch / cambiar de rama |
| merge conflict | overlapping changes |
| clean working tree | everything is saved |
| ahead of remote | saved locally, not published |
| behind remote | newer project changes are available |
| stash | set changes aside |

This table is guidance, not a rigid translation layer. Use exact Git terminology in advanced views and educational explanations.

Use branch/branches and rama/ramas in simple mode too. Do not introduce
version-line or workspace synonyms for a branch; a linked workspace is a
different concept. See [ADR 0035](docs/adr/0035-use-branches-as-the-product-vocabulary.md).

## Safety rules for Git operations

Agents must follow these rules when implementing operations:

- Classify each operation as read-only, local mutation, history mutation, remote mutation, or destructive.
- Provide a preview/plan for history-changing and remote-changing actions.
- Prefer reversible operations.
- Create a recovery reference before destructive changes when feasible.
- Never use `reset --hard`, `clean -fd`, force push, branch deletion, or equivalent behavior without explicit user confirmation and a recovery strategy.
- Do not silently resolve conflicts.
- Do not silently discard untracked files.
- Surface hooks and signing failures accurately; do not bypass them by default.
  A project's hooks run unless the user has turned them off in Settings, and
  only then does GitOdile pass `--no-verify` on its own commit and push. When
  it does, the failure classifier must not attribute a failure to a hook that
  never ran, and no other operation may quietly widen the bypass. Never disable
  hooks by writing to the user's Git configuration — that would change what
  every other Git tool on the machine does.
- Preserve user Git configuration unless a setting is explicitly scoped to GitOdile.

## UI and visual direction

Read `DESIGN.md` before changing visual styles. Any task that adds or changes
a screen, dialog, panel, menu or notice starts from its "Before designing a
screen, dialog or panel" section: the app's current look is the specification,
so a new surface matches its closest existing equivalent, reuses the
`src/shared/ui` primitives, takes every value from a token, and is checked
running in a light and a dark theme beside that equivalent. A new token,
dialog width, radius, material or pattern is a change to `DESIGN.md` in the
same commit, never a local exception.

In summary:

- Modern desktop interface with rounded, opaque surfaces; translucency only for a transient scrim.
- Dense information areas such as diffs must use solid, highly readable backgrounds.
- Support light and dark themes.
- Use motion sparingly and respect reduced-motion settings.
- Aim for professional friendliness, not cartoon-heavy gamification.

## Development conventions

- There is one release channel and every release is a plain `X.Y.Z` version;
  never prepare a prerelease version (ADR 0019). Start the next version with
  `pnpm run release:prepare <X.Y.Z>` from a clean, current `main` (or from a
  work branch that already contains `origin/main`): it creates
  `release/<X.Y.Z>` with the version bump, notes and highlights. Develop the
  version on that branch, not directly on `main`; merging its pull request
  tags and publishes it to every installation. Do not create extra branches
  or worktrees beyond that unless the user asks.
- Changes to `.github/` or `scripts/release/` never ride on a release branch;
  the release coordinator rejects them. Land them on `main` in their own pull
  request first.
- Never add `Co-Authored-By` (or similar AI-attribution) trailers to commit messages.
- TypeScript strict mode must stay enabled.
- Rust code must pass `cargo fmt` and `cargo clippy`.
- Avoid `any` unless interacting with an untyped boundary and document why.
- Return structured errors from Rust; do not expose raw command output as the primary error message.
- Keep commits focused and use conventional commit prefixes where practical.
- Update documentation when behavior, architecture, or vocabulary changes.

## Tests

A test exists to catch a regression a user would notice. These rules apply to
every test you add or change; review rejects one that breaks them. They came
out of task 207, when 1,759 frontend and 646 Rust tests made the gate slow and
flaky.

When to add a test:

- Add one for a behavior: a Git safety rule (data, history, remote, recovery),
  a parser or operation planner, a contract across a boundary (IPC,
  architecture, screen registration), or a fixed bug whose cause could return.
- Do not add one that only pins copy, CSS classes, DOM order or layout; check
  those in the running app or the browser harness. A class assertion belongs
  in a test only when the class is how the UI exposes a state (selected,
  unread, animating).
- Extend the existing test of the same behavior, or turn it into `it.each`,
  before writing a new one. When a behavior changes or goes away, change or
  delete its tests in the same commit.

Where it goes — the cheapest level that proves the behavior:

1. A pure function in the owning domain or controller (`*.test.ts`).
2. A component with its port mocked (`*.test.tsx`).
3. The `src/app/App*.test.tsx` files, only for what the composition root
   owns: wiring between screens, keep-alive, project activation and the
   shared stores. Feature behavior belongs in the feature's own tests. Add a
   case to the file of its concern (shell, home, projects, navigation); they
   share `src/test-fixtures/appTestHarness.ts`, and a file that grows past
   about 15 s holds back the whole run, so split it rather than let it grow.
4. In Rust, parsers and planners are unit tests with no Git process. A
   temporary repository is for behavior that only Git itself can show
   (`src-tauri/src/tests/<domain>_tests.rs` or the owning module).

How to write it:

- A `.ts` test runs in Node. Add `// @vitest-environment jsdom` only when it
  needs the DOM or `localStorage`.
- Paste long text (`user.click`, then `user.paste`); type it only when each key
  is the behavior under test. Wait for asynchronous results with `findBy*` or
  `waitFor`; never raise a timeout to cover a slow test.
- Rust fixtures come from `src-tauri/src/test_support.rs`: `unique_temp_dir`
  (inside the test run's own temp root), `published_repo_and_remote`, and
  `git_commit_series` for a run of versions. A Git process costs about 50 ms
  on Windows, so spawn as few as the behavior needs. Never write fixtures to
  the shared temp directory, take a process-wide lock, `sleep` while waiting
  for a result, or compile code while a test runs: a fake CLI is a
  `src-tauri/examples/test_fake_*` program declared with `harness = false`,
  found through `test_support::example_binary`.
- New tests under `scripts/` use `node:test`; `check:docs` runs them.

Budgets: a new or changed frontend test that takes over 1 s, or a Rust test
over 5 s when run alone, carries a comment saying why it cannot be cheaper.

While iterating, run only the affected tests (`pnpm vitest run <path>`,
`cargo test --manifest-path src-tauri/Cargo.toml <module>`); `pnpm run check`
remains the completion gate.

## Documentation ownership

Keep durable facts in one place and link to them instead of copying them:

- `README.md`: current capabilities, versions, setup, commands, and orientation.
- `AGENTS.md`: enforceable engineering, safety, and agent-workflow rules.
- `docs/PRODUCT_STRATEGY.md`: durable product thesis and positioning.
- `DESIGN.md`: visual, interaction, content, and accessibility direction.
- `docs/ARCHITECTURE.md`: current architecture and extension rules.
- `docs/adr/`: decision rationale and alternatives.
- `work/`: approved scope and execution history, organized as one folder per
  planned version, `after-1.0/` and completed-version folders under `done/`;
  never the sole home of a durable architecture rule.

`PRODUCT.md` is a compact design-tooling brief; do not expand it into a second
product strategy. Numbered files under `docs/architecture/` are historical
evidence or measurement baselines and must identify themselves as such.

When moving a task, keep its relative links valid. Task IDs are unique and
permanent; a child may use its parent's ID plus a suffix such as `010-1`.
IDs identify work and do not encode current priority. Active non-epic tasks use
the `queue` field, contiguous inside their version folder, for execution order;
epics leave queueing to their suffixed children. Completed tasks go in
`work/done/<X.Y.Z>/`, flat inside their version with a README index, and require
`status: done` and a completion date. Older records not yet migrated may remain
directly in `work/done/`; verify their version rather than guessing from IDs,
modification dates or a late administrative move. See `work/README.md` and
[ADR 0043](docs/adr/0043-archive-completed-work-by-delivery-version.md).

## Agent workflow

Before coding:

1. Read `README.md`, this file, `DESIGN.md`,
   `docs/PRODUCT_STRATEGY.md`, and relevant files under `docs/`.
2. Inspect the existing implementation before proposing architectural changes.
3. Identify platform-specific implications.
4. State assumptions in the PR or commit description.

While coding:

1. Make the smallest coherent change.
2. Preserve safety boundaries.
3. Add or update tests as [Tests](#tests) describes.
4. Check keyboard accessibility and empty/error/loading states.
5. Avoid introducing dependencies for trivial utilities.

Before finishing:

```bash
pnpm run check
```

The aggregate command runs documentation, frontend architecture, TypeScript,
frontend tests/build, Rust formatting, Clippy, and Rust tests. Use the narrower
`check:docs`, `check:architecture`, `check:frontend`, or `check:rust` scripts
while iterating, but the aggregate command is the completion gate.

If a command is not available yet, document that honestly rather than claiming it passed.

## Hermes Agent Workflow

This section applies when the repository is being operated through Hermes Agent.
It supplements the general agent workflow and does not weaken any GitOdile
architecture, testing, documentation, release, or safety rule elsewhere in this
file. Hermes model and provider selection is controlled by the user's Hermes
configuration; never hardcode provider credentials or API configuration here.

### Model roles

The default split, in priority order, is:

- **Strong orchestrator and reviewer:** GPT-5.6 Sol with high reasoning
  (`model.default` + `agent.reasoning_effort: high`).
- **Cheap implementer:** DeepSeek V4.1 Flash, used for all delegated workers
  (`delegation.model` + `delegation.provider`).
- **Independent review:** also GPT-5.6 Sol with high reasoning, pinned separately
  in `auxiliary.review.model` + `auxiliary.review.provider` so the reviewer stays
  on the strong model even when the session itself runs something cheaper.

These are current configuration values, not permanent repository dependencies.
Keep the roles separate: the orchestrator plans, decides, and reviews; workers
implement. A worker must never be the reviewer of its own work, and no review
pass may be delegated to the cheap implementer model.

If the session model is switched away from the strong model with `/model`, the
orchestrator and reviewer roles are no longer satisfied. Restore the strong
model before planning, delegating, or reviewing — or hand that work to a user
who is on it. Do not silently orchestrate or review from a cheap model.

### Main agent role

The Hermes main agent acts as technical lead, planner, orchestrator, and final
reviewer.

The main agent should primarily:

- Understand the user's request and the relevant GitOdile architecture.
- Inspect existing code before deciding how to change it.
- Make architectural and high-level implementation decisions.
- Make the visual decisions of a UI task before delegating it: name the
  existing screen or dialog it must match and the `DESIGN.md` sections that
  apply, so the worker implements a decided look rather than designing one.
- Break larger work into narrowly scoped delegated tasks.
- Delegate routine implementation whenever practical.
- Review delegated work before accepting or integrating it.
- Handle difficult debugging, ambiguous behavior, architectural problems, and
  cases where delegated workers fail.
- Perform the final technical review.

Avoid doing large amounts of routine implementation in the main agent when that
work can reasonably be delegated.

### Delegated worker role

Hermes delegation is configured to use a cheaper worker model, currently
DeepSeek V4.1 Flash (`delegation.model: deepseek/deepseek-v4.1-flash` with
`delegation.provider: nous`). Treat that model name as current configuration, not
a permanent repository dependency.

Delegated workers should normally handle:

- Implementation and focused refactors.
- Test creation and updates.
- Lint, typecheck, build, and straightforward compilation fixes.
- Repository inspection, routine debugging, and repetitive or mechanical
  changes.
- Starting the GitOdile development application.
- Routine UI validation through Hermes Computer Use.
- Straightforward fixes discovered during validation.

Workers must verify their own work before returning results to the main agent.
Worker self-verification is not a review: report what was run and what it
returned, so the main agent can judge it. A worker must not approve, accept, or
sign off on its own change, and must not spawn a review of its own work.

### Configuration map

Set these with `hermes config set <key> <value>`; never hand-edit the YAML and
never place credentials in this file.

- `model.default`, `model.provider` — the orchestrator model.
- `agent.reasoning_effort` — reasoning level for the main agent and the default
  inherited by children.
- `delegation.model`, `delegation.provider` — the implementer model.
- `delegation.reasoning_effort` — reasoning level for *every* child, including
  the reviewer. Leave it empty to inherit the main agent's level; setting it low
  to cheapen implementers also lowers the review pass.
- `delegation.max_concurrent_children` — parallel worker cap. Keep it at the
  smallest number that keeps the pipeline busy.
- `delegation.worktree_isolation` — whether workers run in separate worktrees.
- `auxiliary.review.model`, `auxiliary.review.provider` — the independent
  reviewer route used by `/review`.

### Desktop application validation

GitOdile is a Tauri desktop application. For changes that affect user-facing
behavior or UI, the normal Hermes workflow includes validation against the real
running application. The delegated worker should normally:

1. Determine and use the project's documented development command.
2. Start GitOdile in Tauri development mode.
3. Keep the development process running while validation continues.
4. Use Hermes Computer Use to interact with the running GitOdile application.
5. Prefer accessibility or UI-tree elements over raw screen coordinates when
   available.
6. Exercise the user flow affected by the change.
7. Verify the resulting application state after interactions.
8. Check relevant normal, empty, loading, disabled, and error states when
   applicable.
9. Fix straightforward visual or functional issues it discovers.
10. Repeat the validation after a fix.
11. Cleanly stop temporary development processes when validation is finished,
    if appropriate.
12. Report the validation results to the main agent.

A UI-affecting task should not normally be considered complete merely because
tests pass when the changed behavior can reasonably be validated in the running
GitOdile application. The main agent should normally delegate routine Computer
Use validation rather than spend frontier-model inference on repetitive UI
interaction.

The main agent may use Computer Use directly when delegated validation fails,
behavior is ambiguous, a difficult visual or functional problem needs stronger
reasoning, the worker cannot reliably interpret application state, or an
independent final verification is especially valuable.

### Review workflow

After delegated implementation:

1. The main agent inspects the resulting changes.
2. Review the relevant diff and affected files rather than relying only on the
   worker summary.
3. Run or request appropriate checks when necessary, including the completion
   gate required by the general agent workflow.
4. Check that the implementation follows existing GitOdile architecture and
   conventions.
5. Delegate straightforward corrections back to a worker when practical.
6. Handle complex corrections directly when stronger reasoning is justified.
7. Accept the implementation only after review.

Review is a strong-model activity. Use `/review` for an independent pass when the
change is non-trivial: it runs as a separate reviewer subagent on the
`auxiliary.review` route, which is pinned to GPT-5.6 Sol with high reasoning and
is deliberately independent of the orchestrator session's model. Never accept a
review produced by the cheap implementer model, and never let the worker that
wrote a change review it.

### Worktree isolation

Hermes may run delegated coding workers in isolated Git worktrees when that
isolation is enabled by the user's Hermes configuration. This is an execution
boundary for delegated work, not permission to create arbitrary branches or
worktrees contrary to the development conventions above.

When worktree isolation is enabled:

- Each worker operates only inside its assigned worktree and must not modify the
  main working tree directly.
- Delegated changes remain focused on the assigned task.
- Workers leave their work in a state the main agent can inspect and integrate.
- The main agent reviews the resulting branch and diff before integration.
- Avoid overlapping delegated tasks that edit the same areas unless isolation
  and later reconciliation are intentional.
- Do not discard unrelated user changes or perform destructive Git operations
  merely to simplify integration.

### Git safety

All existing Git safety rules in this file remain in force. In addition, when
using the Hermes workflow:

- Do not force-push unless the user explicitly requests it; retain the required
  recovery strategy and confirmation for destructive or history-rewriting work.
- Do not use destructive reset or clean operations to remove user work.
- Do not discard unrelated changes.
- Do not push to a remote unless the task or user explicitly requires it.
- Inspect repository state before integrating delegated work.

### Cost-aware delegation

Hermes intentionally uses a strong main model and cheaper delegated workers.
Use the main model where stronger reasoning materially improves the result, and
use delegated workers for high-volume routine work. Avoid unnecessary parallel
delegation: do not spawn extra workers when one focused worker is sufficient,
and keep each delegated task narrowly scoped. Escalate failed or ambiguous work
to the main agent rather than allowing an unproductive worker to loop
indefinitely.

The implementer model costs more per token than the previous cheap worker model.
Treat delegation as a volume decision: delegating a large, mechanical, well-specified
change is still the right call, but do not delegate work so small that the
worker's setup and reporting overhead exceeds the tokens it saves, and do not
leave `delegation.reasoning_effort` raised for trivial mechanical work — that
setting also applies to the review pass.

## Early priorities

1. Repository opening and validation.
2. A structured Rust Git command runner.
3. Status parsing with fixtures and tests.
4. The main application shell and repository overview.
5. Plain-language status summaries.
6. Safe save-version flow.
7. Fetch/publish flows.
8. Recovery model.
9. Conflict experience.

## Out of scope for the first MVP

- Interactive rebase.
- Submodule management.
- Full pull-request review suite.
- Built-in terminal.
- Enterprise administration.
- Custom Git hosting server.
- Complex multi-repository workspaces.
- Mandatory cloud accounts.
- Autonomous AI changes to repositories.

## Decision records

For significant architectural decisions, add an ADR under `docs/adr/` using:

- Context
- Decision
- Consequences
- Alternatives considered

Do not overwrite major decisions silently.
