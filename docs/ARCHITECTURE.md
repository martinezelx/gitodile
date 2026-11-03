# Architecture

This document describes the architecture that new code must follow. Decision
rationale lives in [`docs/adr/`](adr/); task files and numbered architecture
records are historical evidence, not the current specification.

## System shape

GitOdile is a modular desktop application with a React/TypeScript frontend in
a Tauri shell and Rust services for Git, filesystem, process, session, and
platform-sensitive behavior.

```text
React feature UI
  -> controller + typed port
    -> feature-owned Tauri adapter
      -> ipc.rs transport adapter
        -> application.rs policy/authorization
          -> product domain
            -> git_command.rs / git.rs / filesystem / watcher
```

The important property is dependency direction: presentation depends inward
on feature contracts; domain behavior does not depend outward on React, Tauri,
or transport types.

## Frontend ownership

The Changes Markdown preview reads full saved/current documents on demand
through `ChangesPort.readFileMarkdown` and the session-validated
`read_file_markdown` command. Rust authorizes a read-only operation, checks the
Markdown extension and canonical project containment, requires a regular UTF-8
file and caps the actual read at 128 KiB per version (plus one byte to detect overflow).
Symlink files and saved symlink blobs are refused: Git stores their destination
path, which must not be compared with dereferenced document content.
The saved side is read from a pinned HEAD object, using the original path from
fresh Git status for a rename. Deleted current files and genuinely new saved
sides are explicit missing versions; Git/encoding failures never become additions.
Oversized content is refused by the native document reader. The frontend can
instead reuse complete hunks from the already-loaded text diff, without another
file read. These independent fragments are explicitly labelled partial and may
lack formatting/reference context. At most 24 hunks, 400 source lines and 32K
source code units enter excerpt preparation, under a shared 250 ms budget.
Incomplete or excessive hunks are omitted with a notice; if none fit, use text.
The preview request is keyed by the selected diff snapshot and project epoch;
hidden views detach listeners and reuse the request on return. The renderer
is the default for supported Markdown files; an explicit reading choice is
persisted locally under `gitodile-markdown-view`, separately from code diffs.
Read/size/comparison failures fall back to text with an explanation without
changing that preference. Reselecting Markdown retries the read.
The renderer
uses CommonMark/GFM without raw HTML, active links or image resource loads.
Line and AST comparisons have time/edit-distance bounds. Full Markdown trees
are merged into one unified document, interleaving removed/added blocks and
retaining shared context once. Compatible lists, quotes and tables merge their
children. Reference links/images resolve within their original full document;
footnotes have version-scoped identifiers. Tree traversal also has a depth bound.
Full preview preserves complete semantic blocks. Excerpt preview parses each
available hunk independently, never joining Markdown syntax across source gaps.
Both representations annotate consecutive changed blocks as navigation groups;
only referenced footnotes contribute stops. Active-screen navigation scrolls to
the requested marker without restarting on reveal or triggering another read.

The frontend is a modular monolith:

```text
src/
  bootstrap.tsx             # renderer entrypoint: mounts React, reveals the window
  styles.css                # eager cascade manifest (tokens -> base -> shell -> features)
  vite-env.d.ts             # build-tool ambient declarations
  raw-icons.d.ts            # `~icons/*` ambient declarations

  app/                      # application shell and composition
    App.tsx                 # composition root and cross-feature orchestration
    screens.tsx             # single screen registry, keep-alive host, prefetch
    project-switcher/       # the status bar's project popup and its rows
    ...                     # overlays, rail nav, titlebar, preferences, branding

  runtime/                  # neutral, product-free runtime contracts
    project/                # runtime store, session state, invalidation acceptance
    screen/                 # screen module and lifecycle contracts

  i18n/                     # translation composition and language runtime
  features/<feature>/       # product owner
  shared/ui/                # proven multi-consumer primitives
  shared/i18n/              # shared copy/error localization
  shared/file-icons/        # deferred file-type icon set
  architecture/             # cross-cutting guard and IPC contract tests
  assets/                   # static artwork
  styles/                   # tokens and base rules
```

The root holds only real entrypoints and ambient declarations. Everything else
has a named owner, and the three neutral owners are deliberately distinct:

- `app/` composes the product. It may import anything; nothing outside it may
  import it.
- `runtime/` holds contracts that are neutral about both product and shell —
  the project store, session reducer, repository-invalidation acceptance and the
  screen lifecycle. Features depend on these; they carry no feature knowledge of
  their own and never hold an ambient current-project singleton.
- `shared/` holds proven multi-consumer primitives behind a public `index.ts`.

There is deliberately no `common/`, `utils/` or shared-types bucket: a module
with no owner is a design question, not a folder.

A feature owns, as applicable:

- domain types and equality rules;
- controller, request generations, caching, and eviction policy;
- typed port and `tauriAdapter.ts`;
- screen descriptor, UI, translations, styles, and tests;
- an explicit `index.ts` public API.

Features may import neutral runtime contracts and another feature's public
`index.ts`; they may not import another feature's internals or app composition.
Only a feature's `tauriAdapter.ts` may import `@tauri-apps/api`. Visual
components receive data and callbacks and never name IPC commands.

Cross-feature orchestration belongs at the composition root. A reusable
primitive moves into `shared/` only after it has multiple real consumers and a
stable, domain-neutral contract.

"As applicable" is load-bearing: a feature that has no transport owns no port
and no `tauriAdapter.ts`. `features/notifications` is the first of those. It is
a domain, a store and a panel; the composition root records into it from the
outcomes it already sees, so there is nothing for it to fetch and no command for
it to name. A feature like that must not grow a read of its own to fill the
gap — the moment a surface fetches to populate itself, it has become one more
thing that runs when the user was doing something else.

The notification feature owns a versioned, bounded localStorage inbox (50
entries, with independently bounded fields and input size). Its persistence
boundary validates unknown data and allowlists stored fields; detailed error
reasons stay in memory only. The store persists read state and one acknowledged
app-update version independently of card retention, so removing or evicting
that card cannot re-alert the same offered release. Storage failure leaves the
live inbox usable with a panel warning. Restoring/opening it triggers no IPC,
network activity or audio. Review callbacks report whether their destination
opened before the panel acknowledges the individual notice; app-update review
always uses the updater's current snapshot rather than a stored candidate.

### Screens and lifecycle

Every screen is registered once in `src/app/screens.tsx`. The descriptor drives
navigation, command-palette entries, project guards, chunk prefetching,
keep-alive mounting, accessibility behavior, and optional performance budgets.
Do not wire any of those separately in `src/app/App.tsx`.

Home and Overview are eager because Home owns first paint and Overview is the
first project screen. Other functional screens use
`createLazyScreenContainer`; the same loader promise serves lazy mounting and
primary preloading. Overlay panels stay eager: an overlay opens from a click
with no navigation in front of it, and `React.lazy` suspends on first render
even when its module is already warmed, so code-splitting one buys a fallback
frame no prefetch can remove.

A popup that closes on a press outside itself listens through
`onDocumentPress` from `shared/ui`, never a bare document `mousedown`. Tauri
stops the bubbling mousedown on the titlebar's drag region, so a bare listener
leaves the popup open when the bar is pressed; `onDocumentPress` observes that
region in the capture phase and everything else while bubbling, which keeps a
nested surface portalled out of its popup (a calendar, an account list) able to
keep its own press with `stopPropagation`.

Visited project screens remain mounted for the active project epoch. Home is an
application-session screen: switching projects does not evict it, and showing
it never clears the underlying active project or changes that project's
`lastView`. It is registered for palette, prefetch and lifecycle but excluded
from the rail and navigation preferences. Its Back/Forward step is app-level;
project screen history remains per-session.

Screen lifecycle states are:

- `active`: subscriptions and active-only effects may run;
- `hidden`: DOM/local UI state is retained, but the subtree is `hidden`,
  `inert`, unsubscribed from project selectors, and silent;
- `evicted`: the screen unmounts when its project epoch closes or changes.

Use `useActiveProjectSelector` and `useActiveScreenEffect` inside screens.
Visibility is not freshness: never fetch, poll, or warm a cache merely because
a screen became visible.

A screen that shows several views in turn — Work, whose Changes and History
tabs were screens of their own until task 126 — hosts each view in a
`KeepAliveViewSlot` from `src/runtime/screen/module.tsx`. The slot mounts a
view on first visit, hides it `hidden` and `inert` afterwards, re-renders the
hidden element by identity, and hands it a lifecycle controller derived from
the screen's: `active` only while the screen is active *and* the view is the
shown one, `hidden` otherwise, evicted with the screen. A feature rendered
inside reads the same hooks it would read as a screen and cannot tell the
difference, so the rule above holds one level down. Which view shows is
session state (`workbenchTab`), not a navigation step: Back and Forward move
between screens, and a deep link from another screen sets the tab and then
navigates.

The complete implementation recipe is in the
[`frontend feature guide`](architecture/frontend-feature-guide.md). Branches remains a concrete
[`reference slice`](architecture/branches-reference-slice.md).

### Project state and freshness

Each open project owns a `ProjectRuntime` with an immutable reducer snapshot
and a distinct session epoch. The canonical worktree path identifies a
project; the epoch identifies one open incarnation. Responses and watcher
events must match both so work started before close cannot populate a reopened
project.

Repository identity refreshes use `refreshProject`, which updates only an
existing session with the same epoch. They never change the active project or
reopen a closed one. `open` is reserved for an explicit project-opening action.

Activating an already-open project also refreshes its branch/HEAD identity and
working-tree facts, so watching being disabled or unavailable cannot leave the
branch label from its previous visit. Startup restore preserves an explicitly
stored null active project and returns to Home while the other projects stay open.
Status invalidations received during a read coalesce into a trailing read; the
older snapshot is not published as fresh, and mutation supersession or close
cancels that follow-up.

Runtime instances are passed explicitly. There is no ambient current-project
store. Selectors are narrow and preserve identity when their selected value is
unchanged.

Repository data refreshes only from these owners:

- project activation;
- explicit refresh;
- successful mutation;
- typed repository invalidation.

`RepositoryReadSubscriber` registrations let features join invalidation
fan-out without Repository importing them. Cache warming is separate,
idle-deferred, cancellable, and limited to `project-activation` or
`repository-invalidation` reasons. Background work never precedes first paint.

Status owns working-tree and unpublished-version snapshots. Changes owns
epoch-scoped diff caches, capped at four epochs and 256 diffs / approximately
40 MiB per epoch. Lists that grow with repository size stay virtualized; the
native 1,000-entry payload cap is not a DOM strategy.

Speculative aggregate diff warming is budgeted in Rust, separately from the
16 MiB emergency ceiling on one combined `git diff`. A changeset over 250
entries is deferred before any diff process runs, and the batch stops at 2 MiB
of Git output plus untracked file bytes. `read_working_tree_diffs` answers with
a typed `completed` / `truncated` / `deferred` outcome so a bounded partial warm
is never mistaken for a full preload — and never triggers a request per changed
file either. Whatever the warm skipped loads on demand through `read_file_diff`
when the user opens it.

### Issue reporting

Issue reporting is an app-shell service. Rust's `diagnostics.rs` owns a bounded,
session-only ring buffer of typed Git-invocation and IPC-command events. Command
events retain the checked operation and success or stable error code; Git events
add only an allowlisted subcommand, exit status and duration. Event construction
accepts no repository path, ref, file content, command result or raw Git
argument, and failure excerpts reuse the product's bounded redaction path. The
report states its UTC start, a readable session duration, the retained event
count and whether older events were omitted; timings read as offsets from that
start rather than raw milliseconds. The buffer is managed as Tauri state and is
never persisted unless the user explicitly saves the reviewed report.

`issueReport.ts` builds a URL from the environment block of that reviewed
snapshot and `issueReportContract.json`. Only the versions travel in the
address: a full session encodes to some twelve thousand characters, which GitHub
answers with 414 rather than a form, so the activity reaches the issue through
the clipboard or the attached file instead. The address may also carry the
reader's optional title, behind the form's `[Bug]: ` prefix, and, when the
activity is included, a last line in the prefilled field asking for the paste.
`useIssueReport.ts` owns the review/copy/save/launch flow through
`issueReportAdapter.ts`. The titlebar receives an action, and one eager dialog
moves through preparing, review, opening, finish and browser-failure states.
Leaving the activity out changes the shown, copied and saved text itself. The
primary action copies that text before opening the form, and a failed copy
still opens it; the finish step then says what is left (the paste) and offers
the copy again. Dismissed attempts cannot restore stale errors or clipboard
state. Opening the form is an explicit external action; the saved text file
must be attached manually. The live tracker/form contract
is checked separately from the offline gate by `pnpm run check:feedback`,
including private vulnerability reporting enablement.

### Styles and translations

`src/styles.css` is the eager cascade manifest: tokens, base, theme transition,
shell, shared primitives, then feature styles. Feature CSS stays beside its
owner but is not lazy-imported, preventing an unstyled first feature frame.
Document-root choreography that no single component owns — the view-transition
pseudo-elements behind a theme change — sits in `styles/`, not in the sheet of
whichever control happens to trigger it.

English and Spanish dictionaries stay beside their owner, one module per
language (`translations.en.ts`, `translations.es.ts`) with the interface in
`translations.ts`, and are composed per language in `src/i18n/en.ts` and
`src/i18n/es.ts`. Each language is its own chunk: the bootstrap awaits only the
active one before the first render, and a language switch keeps the current
copy until the other has loaded. Exact typed locale objects make missing,
extra, or incompatible keys a compile-time error. Shared errors/actions belong
in `shared/i18n`; shell copy belongs in `app/translations.*.ts`.

## Rust ownership

The Rust side uses flat modules until a module genuinely needs internal
submodules. Two do; the rest are one file each, and file size alone is not a
reason to change that:

```text
src-tauri/src/
  lib.rs                  # Tauri builder, plugins, state, handler registration
  ipc.rs                  # argument extraction, session checks, serialization
  application.rs          # execution-policy inventory and authorization entry
  repository_access.rs    # RepositoryContext + fair commonGitDir coordinator
  git_command.rs          # policy-aware domain-facing Git facade
  console/                # project console: catalogue, typed-line tokenizer,
                          #   permission-tier classifier, single-use plans and
                          #   the project's provider with its gh/glab shortcuts
  git.rs                  # bounded process execution and cancellation (Git, and
                          #   other programs through run_program)
  error.rs                # stable structured application errors
  operation.rs            # shared operation kind and safe diagnostic details
  index.rs                # collision-safe temporary-index preparation
  session.rs              # opaque project epochs
  watch.rs                # filtered/debounced typed invalidation
  app_updates.rs          # bounded signed-update lifecycle and install handoff
  desktop.rs              # desktop-shell services
  tooling.rs              # Git/gh/glab diagnostics, install/update; Git identity/line endings
  project_settings.rs     # one project's own identity and ignore files
  repository.rs
  clone.rs                # staged provider-neutral acquisition and verification
  initialize.rs           # local-project planning, ownership, and initialization
  platform.rs             # exclusive no-replace directory publication
  status.rs
  changes.rs
  history.rs              # bounded read-only saved-version timeline/details
  conflicts/              # paused-operation sessions
    mod.rs                # read-only sessions, stage reads and side diffs
    resolve.rs            # keep a side, mark resolved, reset one file
  recovery/               # three recovery owners that share a clock and owner ID
    mod.rs
    discard.rs            # working-tree discard snapshots and safe restore
    history.rs            # pre-rewrite branch tips as hidden refs
    conflict.rs           # a paused operation's stages and content, before a change
  save_version.rs
  publish.rs
  sync/                   # remotes, upstreams, fetch and relation knowledge
    mod.rs                # remote config and the team-sync read model
    integrate.rs          # Get project changes and Bring in changes: one
                          #   analysis, one execution, their safety checks
  branches.rs        # product domains
  test_support.rs         # shared hermetic Git-repository test fixtures
  tests/<domain>_tests.rs # cross-module integration tests grouped by owner
```

The production body of `lib.rs` contains registration only. `ipc.rs` names the
modules it adapts and delegates immediately. Product domains may depend inward on application,
repository access, Git-command, and shared error contracts; they may not depend
on `ipc`, `watch`, or Tauri. Integration tests live under `src/tests/`, grouped
by the product domain whose behavior they verify; reusable repository fixtures
live in `test_support.rs`, never in the crate composition root.

A module becomes a directory only when it holds responsibilities that are
separate owners, not when it grows long. The bar is a cohesive unit whose
helpers stop being visible to its neighbours: `recovery` split because working-
tree discard and history recovery shared nothing but a clock (and had begun
prefixing helpers `history_*` to avoid colliding in one namespace); `sync` split
because the integration workflow's eighteen safety helpers were reachable
from the read model that has no business calling them. `architecture.rs` fails
the build if one submodule imports a sibling — whatever they share belongs in
`mod.rs`.

### Repository identity and access

Never assume the selected folder is the repository root. `RepositoryContext`
retains separate identities for:

- worktree root;
- Git directory;
- common Git directory;
- bare/non-bare state;
- backend path and normalized comparison key.

Windows verbatim and ordinary paths compare together while Git receives a
normal path. macOS selected aliases such as `/var` are retained beside their
canonical spelling so watcher events match either form.

The access coordinator is keyed by canonical common Git directory. Reads may
overlap; mutations are exclusive; a queued writer blocks later readers. Linked
worktrees therefore share mutation exclusion while unrelated projects remain
independent. Lock re-entry is rejected; an authorized nested read inherits its
existing permit.

### Repository acquisition

Cloning is an acquisition workflow owned by `clone.rs`, separate from opening
an existing project and from provider-specific integrations. The frontend
`features/clone` owner supplies an eager dialog, attempt-generation controller,
typed port, and Tauri adapter; only `src/app/App.tsx` hands a verified destination to
the existing repository/session lifecycle.

Rust accepts HTTPS, SSH (including scp-like syntax), Git, file URLs, and local
paths. It strips URL user-info, queries, and fragments before Git invocation,
remote persistence, diagnostics, or IPC-safe display. A plan binds the
normalized source and exact absent destination with a state token. Execution
creates `.gitodile-clone-<operation-id>` under the selected parent, writes an
exact ownership marker, clones without recursive submodules, sanitizes
`origin`, verifies repository identity and worktree usability, and publishes
the `project` child with an OS-specific exclusive no-replace rename. It then
verifies the final path before the composition root may open it.

Cancellation belongs to the exact clone operation rather than to a project
epoch, because no project session exists yet. Frontend generations make late
results inert; Rust kills the bounded Git process and removes only a staging
directory whose exact path, type, name, and ownership marker all match. An
existing destination is never cleanup-eligible. `platform.rs` provides the
Windows `MoveFileExW`, Linux `renameat2(RENAME_NOREPLACE)`, and macOS
`renamex_np(RENAME_EXCL)` publication boundary.

Local creation is a separate acquisition workflow owned by `initialize.rs` and
`features/initialize-project`. Its eager dialog has typed ports and an
attempt-generation controller; only the composition root passes a verified
result into the existing open/session lifecycle. A plan canonicalizes the
parent or existing folder, validates the project and initial branch
names, rejects case/alias collisions, enclosing or descendant repositories,
linked worktrees and existing `.git` metadata, and snapshots the exact path and
README state. Execution repeats that inspection immediately before mutation.

For a new project, execution exclusively creates the requested absent child;
for an existing ordinary folder it creates only an absent `.git` directory.
Both owned paths receive an operation-specific marker before `git init`, and
the result is accepted only after repository-root, initial-branch, and unborn
state verification. Optional README creation uses create-new semantics. Cleanup
may remove only an exact, operation-marked directory that is still empty apart
from its marker; user files, populated Git metadata, and all pre-existing paths
are never cleanup-eligible. Optional first-save work happens after opening and
reuses the normal identity, hook, signing, temporary-index, and stale-session
contracts.

Connecting a remote is a distinct local configuration mutation in `sync.rs`,
with its own preview and state token. It validates the exact remote name and a
provider-neutral HTTPS, SSH, Git, file, or scp-like URL, removes credentials,
queries, and fragments before IPC or persistence, snapshots the current remote
configuration, and revalidates under exclusive repository access. The action
uses `git remote add`, never contacts the network, never replaces existing
configuration, and verifies the stored fetch/push URL before reporting success.
Later checking and publishing continue through the existing sync flows.

### Execution policies and Git processes

Every registered command has exactly one checked `ExecutionPolicy` defining:

- operation class;
- stdout/stderr caps;
- timeout and cancellation behavior;
- prompt behavior;
- concurrency class.

There is no fallback policy. A production Git call without an application
frame returns a structured failure; debug/test builds panic so the programming
error is visible.

All Git launches use argument vectors, an explicit working directory where
applicable, and deterministic locale. User input is never interpolated into a
shell string. Stdout and stderr drain concurrently and retain only their caps.
Diagnostics redact URL credentials, queries, and fragments.
On Windows the runner also passes `-c core.longpaths=true` to each Git process
so valid project roots remain usable without writing to the user's Git config.

The runner rejects an already-cancelled token before spawning when the policy
allows cancellation, so cancelled work cannot launch Git or its descendants.
Policies that disallow cancellation retain their existing execution behavior.
Equivalent reads may cancel an older process token. Mutations never
automatically cancel one another because interruption can leave an uncertain
outcome. Windows requests descendant cleanup before killing/reaping the tracked
child; macOS/Linux currently guarantee only tracked-child cleanup. The release
hardening requirement is recorded in
[`ADR 0006`](adr/0006-defer-macos-and-linux-runtime-validation.md).

### IPC contract and invalidation

The public IPC surface is pinned in
[`025-ipc-contract.json`](architecture/025-ipc-contract.json). Rust and
TypeScript tests verify command names, arguments, responses, error codes, and
representative serialization. Intentional changes update the JSON contract and
both sides in one review.

`run_console_query` accepts a project path, session epoch and one fixed
operation ID. Rust validates all three before running an allowlisted Git
template through the repository-read policy (64 KiB stdout, 8 KiB stderr,
15 seconds). It returns exit status, truncation and sanitized text.

Typed Git commands follow [ADR 0017](adr/0017-console-git-commands-by-permission-tier.md).
The line crosses IPC once, as text, to `plan_console_command`: Rust tokenizes
it without a shell (`console/tokenize.rs`), classifies it from a subcommand
allowlist and a deny list of options that run programs, write files, leave the
project or need a terminal (`console/classify.rs`), and answers with a plan or
a structured refusal; a refused line starts no process. `run_console_plan` runs
a Read plan once, for the project and session epoch it was issued to, under
the same budget as the catalogue, with `--no-ext-diff`, `--no-textconv` and
`--no-show-signature` added where the subcommand takes them. The renderer never
splits the line or chooses an argument.

Local change and Remote plans run for everyone ([ADR 0028](adr/0028-console-runs-changes-without-a-read-only-mode.md)).
Whether they ask first is change confirmations, a GitOdile setting
`console/settings.rs` keeps in the app's local data folder and reads on every
plan and run; the renderer can ask to change it but never passes it with a
command. Their plan comes from a pre-flight read (`console/preview.rs`): plain
facts such as the files `git add` would stage or the versions `git push` would
publish, and a fingerprint of HEAD, every ref and the `status` of the index and
working tree. `run_console_change` runs under the exclusive write policy only
after the person answered yes (or at once when change confirmations were
turned off in Settings and are still off), and only while the fingerprint still
matches; otherwise it answers `stale_preview`.
`pull` runs as `--no-rebase --ff-only`, `revert` with `--no-edit`, and the
Settings hooks switch reaches the plan like the guided flows' `runHooks`: off,
the plan adds `--no-verify` to `commit` and `push` and says so. A completed
change refreshes the project through the guided flows' post-mutation path.
History and Destructive plans stay refused until task 139.

`console/hosting.rs` owns the project's provider and its gh/glab shortcuts
(task 148-12). `read_console_host` reads the remote the current branch publishes
to (else `origin`, else the only one) through `sync::project_remotes`, and
classifies its host as GitHub, GitLab or Bitbucket, a company server registered
in `credentials`, another Git server, local-only or unclear; nothing reaches the
network. The console reads it once per project session, idle, for its welcome.
`run_console_hosting_query` takes one fixed ID and runs a read-only gh or glab
template in the project folder through `git::run_program`, the bounded runner
Git itself uses (output caps, timeout, cancellation, process-tree cleanup) for
a program the caller builds. The CLI keeps its own login; GitOdile pins the
detected host, turns off prompts, pager, colour and update notices, removes
inherited debug and repository overrides, and gives the Git processes the CLI
starts the console's inert Git environment. A missing CLI, a CLI without a
login, and an unsupported provider come back as structured reasons, not errors.

Shortcut names, and the command lines a shortcut may store with the tier Rust
gave them, are an app-wide frontend preference; a stored line is planned again
on every run and is not run when its plan needs a wider tier. App owns an explicit
console session store. Each project epoch retains its transcript (40 entries),
command recall (40 lines), draft and pending/running command state in memory
across screen eviction and project switches. Hidden screens detach their store
subscription; already requested results settle in their originating session.
Closing a project evicts its console state and invalidates late callbacks.

Every command that acts on an already-open repository requires `sessionEpoch`,
reads and mutations alike, and a missing epoch fails with `stale_session`
exactly like a stale one. Optionality is a semantic property, never a
compatibility allowance: the contract lists each exception with its reason, and
today those are `open_repository` (an initial open has no epoch yet, and a
supplied one must still be current) and `get_line_endings` (global when no
project path is given, epoch-checked when one is). `watch_repository` and
`unwatch_repository` are scoped to the exact epoch, so a late request from a
closed incarnation cannot detach a newer one's watcher.

Repository watchers emit only:

```ts
type RepositoryInvalidation = {
  projectId: string;
  sessionEpoch: string;
  sequence: number;
  kind: "worktree" | "head_or_refs" | "shared_repository";
};
```

Events are trailing-debounced for 300 ms with a two-second starvation ceiling.
Sequence numbers come from the watcher registry lifetime, so off/on,
registration replacement and updater suspension never reset the renderer's
per-session ordering. Registration generations still reject detached callbacks.
Raw changed paths and repository content never cross IPC. Shared ref/config
changes fan out once to every related open worktree; objects, logs, hooks,
modules, and lock-file churn are filtered. Explicit refresh remains available
if an OS watcher cannot be established.

### Read-only saved-version history

`history.rs` owns the current-`HEAD` saved-version timeline. It is a read-only
domain service behind three narrow commands: `read_history_page`,
`read_saved_version_detail`, and `read_saved_version_file_diff`. The first
returns a bounded `HistoryPage`; the detail commands require both its snapshot
token and a still-reachable commit. All commands require the active project
session epoch and run under the repository read coordinator. They never fetch,
write configuration, move a ref, touch the index, or modify working files.

Pages follow `rev-list --topo-order --date-order --parents HEAD` and include
merge rows without pretending to render a complete branch graph. The service
uses bounded stdin-driven `cat-file --batch-check`/`--batch` reads for raw
commit objects and one NUL-framed `for-each-ref` pass for decorations. Object
lengths, not message delimiters, frame untrusted messages. Page size defaults
to 50 and is capped at 100; messages, decoration counts, Git output, changed
files, and detail diffs each have explicit limits and typed truncation states.

An opaque continuation cursor binds the offset and publication-boundary
progress to a token derived from repository identity, branch/HEAD, shallow
state, and the configured local upstream tracking ref/commit. A changed token
returns `stale_history_cursor`; the frontend restarts at the newest page rather
than appending inconsistent data. Publication state is derived only from local
reachability against that configured tracking commit. Without a usable
upstream, it is `unknown`; History never guesses from a hosting provider or
contacts the network.

Root details compare with Git's empty tree. Ordinary and merge details compare
with the first parent, and merge responses retain every parent for technical
inspection. NUL-framed changed paths and the selected comparison base feed the
existing `changes.rs` typed diff pipeline, so text, binary, too-large,
unchanged, conflict, rename, and truncation semantics have one owner.

The desktop process keeps a read-through cache of page-proven commit context.
It is bounded to four snapshots, 1,000 commits and eight sub-512 KiB details
per snapshot. A selected detail still verifies the current `HEAD`, then needs
only the bounded changed-file read; its first file diff reuses that exact list
instead of enumerating every changed path again. Cache misses use the complete
snapshot/reachability validation path, so eviction never weakens correctness.

The frontend `features/history` owner supplies the port/adapter, generation-
aware controller, lazy keep-alive screen, virtualized timeline/files, and
localized UI. It keeps at most four session caches, 5,000 loaded rows, 24
details, 64 diffs, and 20 MiB of estimated detail/diff data. Project activation
warms the first page without making screen visibility a fetch signal. Shared
repository invalidations refresh it after save, publish, get-team-changes,
branch changes, watcher events, and explicit repository refresh; project
close evicts the epoch so late results cannot cross incarnations.

## Mutation model

User actions that change history or a remote follow plan, confirm, execute,
and verify phases. Rust revalidates repository state immediately before
execution under the repository-access coordinator.

An operation plan classifies work as read-only, local mutation, history
mutation, remote mutation, or destructive, and carries steps, risks,
confirmation requirements, and recovery information. “Destructive” is a risk
classification, never permission to discard data.

Save-version uses a unique temporary index, restores the real index byte for
byte on failure, and preserves hooks and signing. Publish does not claim
failure after an outcome may have reached the remote; it reports
`publish_uncertain`. Frontend mutation phases supersede stale generations,
coalesce watcher work, and perform one shared follow-up refresh.

Team sync separates local knowledge from explicit network freshness.
`read_team_sync_status` reads only existing remote-tracking refs under a shared
repository-read permit. `check_team_changes`, plus Publish planning/execution
preflights, fetch under an exclusive common-Git-directory permit through the
same `sync.rs` remote, redaction, fetch, and ancestry implementation. Project
activation, screen visibility, watchers, and cache warming never call the
network command.

A branch whose remote branch no longer exists reads as `upstreamGone`, an answer
rather than an error: a check whose exact-refspec fetch reports the ref
missing returns it, and so does a local read whose tracking ref is gone (Git's
`[gone]`). Fetches pass `--no-prune`, so GitOdile never deletes the kept
tracking ref; a local read cannot tell that ref from a live one, so the
frontend sync controller keeps a fresh `upstreamGone` across local reads of
the same branch and kept ref until a check or a publish replaces it. Publishing
such a branch plans `recreatesDeletedBranch` and asks before recreating it; a
destination with no remote branch counts the versions no branch of that remote
holds (the gone ref excluded), never the whole history. `stop_tracking_remote`
unsets only the current branch's `branch.<name>.remote` and `.merge`.

Get-team-changes extends that single sync domain
([ADR 0030](adr/0030-forecast-and-combine-project-changes.md)). One local
analysis serves three callers: the `forecast` every team-sync read carries for
a branch that is behind or diverged, the plan, and the execution that
revalidates it. The analysis never changes files, the index or refs. It
predicts a combination with `git merge-tree --write-tree` (diverged branches) or
takes the remote tree (behind branches), lists every path that changes towards
that tree, and compares local work with all of them; only what crosses IPC is
capped (25 versions, 100 files, 20 forecast paths, with exact totals).
Untracked and ignored paths are compared by complete path components, and a
collision blocks. A prepared change to an incoming path blocks. An unsaved,
unstaged edit to a regular file the remote edits in place is combined line by
line with `merge-tree --merge-base=HEAD`, using a temporary index that holds
the file's working content; any other unsaved overlap, or a saved one, is an
overlap and is refused by the clean execution. Saved overlaps can explicitly
start the paused-merge path below. Separate unsaved changes are carried; the plan
and the execution also prove that with a dry-run two-tree update run against a
copy of the index, so the question never takes `index.lock` beside other
reads. The read model relies on the path comparison alone.

Saved-overlap forecasts still classify local work using the provisional
merge tree's changed paths, rename endpoints and unmerged paths, the same
footprint initiation checks. Prepared work blocks a paused merge even away
from that footprint; affected unsaved work is a mixed overlap requiring Save,
and untracked/ignored collisions block before Resolve is offered.
The bounded overlap evidence lists unsaved overlaps first so truncation cannot
hide a Save-first requirement from either dialog.

The plan reads the remote as of the last check under a shared read permit and
never fetches; the dialog checks the remote in the background only when this
session's last check is older than a minute. The plan token binds repository
identity, session epoch, branch, local and remote commits, upstream
destination/tracking ref, planned recovery ref, the predicted trees and the
complete porcelain-v2 local-safety snapshot, including a fingerprint of the
bytes of every changed tracked file or link. Execution does not fetch either:
it applies exactly the reviewed remote commit, and a moved tracking ref or
changed local state makes the plan stale, which the dialog answers by
re-planning in place.

Execution builds a merge version first when the branch diverged: `commit-tree`
from the predicted tree with the previous tip and the reviewed remote commit
as parents, after the project's `pre-merge-commit`, `prepare-commit-msg` and
`commit-msg` hooks run through `git hook run` against a temporary index of the
merge result (skipped only when hooks are turned off in Settings), and with
`commit.gpgSign` honoured. GitOdile applies no file/history update on a hook,
identity or signing failure. After hooks/signing succeed, execution revalidates
tracked index/worktree evidence, HEAD, exact branch/source refs, operation
markers and untracked/ignored collisions before recovery or file/history writes.
A changed project is stale; unrelated untracked hook output may stay. Combined
unsaved content captured before a hook edited it is never written over that edit.
It then creates and verifies recovery (with a snapshot of combined unsaved
content), hands combined files back to their saved content, runs the narrow
two-tree update `git read-tree -u -m <old> <new>` and the compare-and-swap
branch move `git update-ref refs/heads/<branch> <new> <old>`, writes combined
content back through Git's filters, and verifies HEAD, the carried
porcelain-v2 records and bytes, the combined files, the recovery refs and the
relation to the remote. The clean execution never calls `pull`, `merge`, rebase, reset, stash,
force or conflict resolution. A failure after recovery is conservatively
returned as an uncertain local result with the observed `HEAD`, the recovery
refs and inspection instructions. The authoritative success snapshot is
committed before exactly one coordinated local refresh; coalesced watcher
invalidations never issue a fetch. When Publish meets a remote that moved on,
the same dialog gets, combines and then plans and publishes in one
confirmation.

Bring in changes (`plan_bring_in_changes` / `bring_in_changes`, task
065-4-1) runs the same analysis and execution with another local or
remote-tracking branch as the source, resolved to one exact commit and read
as this computer has it, never fetched. Its plan answers already contained,
fast-forward, merge or an empty merge (a merge version that changes no
file); its token also binds the source's ref and commit. A merge needs a
shared saved version, so unrelated histories and a shallow copy that lacks
it block by name, as does a sparse checkout. Its clean execution still refuses overlaps by name; an explicit
`start_overlapping_merge` starts the paused-merge path below. See the 2026-10-29
amendment to ADR 0030.

Get uses the same sparse-checkout and shared-history guards before analysis
in both planning and execution. A shallow copy is blocked only when it lacks
the common ancestor, not merely because it is shallow. Repository discovery
and current-upstream selection use full symbolic HEAD refs and strip only
`refs/heads/`, so a same-named tag cannot change the branch/configuration key.

The eager `sync/BringInChangesDialog` owns the branch picker and review, with
its own typed `BringInPort` and adapter. `list_integration_sources` reads local
and mapped remote-tracking refs, excludes symbolic refs, the current local
branch and negative refspecs, refuses lossy names, and bounds its answer at
5,000 sources; its lists use the existing virtualizer. A check is remembered
per project epoch and exact source for one minute by `bringInController`.
`check_integration_source` is an explicit local mutation under the common
repository write permit: it fetches only the selected remote branch through
its configured mapping, preserving the force flag and exclusions, without
pruning or substituting the current upstream. A failed check never enables
confirmation of cached knowledge. An old/unknown check runs behind the local
preview and re-plans before confirmation; a stale execution re-plans without
retrying. A verified pause is installed in the conflicts controller before
opening its screen. Uncertain results retain the mutation slot until Close
and never initiate resolution, abort, retry or publish. A failed adoption or
refresh after a verified native update/pause also retains that evidence with
Close only, rather than offering another execution. App only wires the
entry callbacks, mutation slot, coordinated refresh and resolver handoff.

Get project changes also uses `BringInPort.startOverlap` with `{kind: "upstream"}`,
but passes its own Get plan token and `get-team-changes` recovery reference.
Its eager dialog offers this choice for saved overlaps of a diverged upstream;
Overview opens that review. Unsaved/prepared overlaps retain Save/discard
guidance. The upstream check must finish before starting a pause; a failed
check or deleted upstream blocks it. Replans ignore superseded/closed answers;
starting a mutation invalidates pending previews, and upstream prop changes
cannot replace an executing or uncertain outcome.
Clean Get also keeps its native recovery/unsaved-copy evidence if the
post-update refresh fails, even with a stale error; it cannot replan, retry
the integration or enter publishing from that failure.
App adopts the returned session before the coordinated refresh and navigation
to the existing resolver. This path never enters the clean Get/publish chain,
even for Get and publish. A native uncertain result, or an unconfirmed handoff
after a verified pause, offers only Close and preserves evidence.

History-mutation recovery follows
[ADR 0008](adr/0008-store-history-recovery-as-versioned-hidden-refs.md): the
previous commit is protected by a create-only ref under
`refs/gitodile/recovery/v1/get-team-changes/`, paired with versioned metadata
in the common Git directory. Combined unsaved content is kept as a snapshot
commit under the sibling `get-team-changes-unsaved/` namespace, owned by the
same record and removed with it. The newest 20 complete records are retained per
common repository across linked worktrees, and incomplete or unsupported
evidence is never guessed at or deleted.

Deleting a branch whose work reached the main branch only as copies
(squash or rebase, found by `git patch-id --stable`) uses the same protocol
under its own operation — `refs/gitodile/recovery/v1/delete-branch/`,
its own manifest folder and its own limit of 20 — before the branch is removed
([ADR 0016](adr/0016-keep-a-recovery-point-when-deleting-a-copied-branch.md)).
Cleaning up several branches at once (`plan_clean_up_branches` /
`clean_up_branches`) keeps one record per deleted branch under
`refs/gitodile/recovery/v1/clean-up-branches/`, with its own limit of 50,
which is also the most branches one clean-up deletes; each branch is rechecked
against the single delete's rules, and against being finished
(`finished_branches`: its work is on the main branch and was its own), right before
it goes, and one that no longer qualifies is skipped and reported while the
rest continue
([ADR 0034](adr/0034-one-recovery-point-per-branch-in-a-clean-up.md)).
Bringing in a branch keeps its records under
`refs/gitodile/recovery/v1/bring-in-changes/`, with its own limit of 20.
`recovery::HistoryRecoveryOperation` names the operations and their limits;
the protocol is one. See [ADR 0035](adr/0035-use-branches-as-the-product-vocabulary.md)
for the accepted break with older delete/clean-up namespaces.

Discard follows the same plan/revalidate/execute/verify boundary and creates a
persistent record under the selected worktree's Git metadata before mutation.
The record preserves exact target bytes and the real index, can be restored
after restart only while its post-discard state token still matches, and is
defined by [ADR 0007](adr/0007-store-discard-recovery-in-worktree-git-metadata.md).
All retained records are readable, not only the newest: `list_discard_recoveries`
reports each one with whether it can be applied right now, which is what lets
the app offer a choice instead of an undo of exactly one step. That question is
answered per path rather than over the whole tree — a record is applicable while
nothing has been written where it would write — so ordinary work elsewhere no
longer retires every stored record, and several discards can be brought back in
any order. Only a record the whole project still matches also restores the
index; the rest bring their files back and leave the prepared state alone. A new
record that would write exactly what an existing one holds replaces it, so
discarding the same work twice leaves one entry rather than two. The 2026-09-06
amendment to ADR 0007 carries the reasoning, the verification that replaces the
whole-tree comparison in that mode, and the retention rule.

### Conflict sessions

`start_overlapping_merge` in `sync/integrate.rs` owns initiation for either a
branch (Bring's existing token and recovery operation) or the configured
upstream (Get's token and operation), without fetching. It is a history
mutation under the common-directory write permit. It rejects staged work,
unsaved work on affected paths, untracked/ignored collisions, paused operations,
index locks and branch mergeOptions. It publishes a versioned start record
through `recovery/conflict.rs`, verifies history recovery, then runs
`git -c rerere.enabled=false merge --no-ff --no-commit --no-autostash -m
<title> <commit>`. Merge-tree's provisional tree and exact stages are retained
internally and bound in the existing tokens. A verified pause requires matching
HEAD, sole MERGE_HEAD and complete unmerged stages, unchanged carried bytes,
stage-0 entries matching the provisional tree, and a complete conflict
snapshot taken under the same permit (also captured for an unexpected pause). A proven
unchanged refusal is `merge_start_refused`; any other failure is
`merge_outcome_uncertain`, preserving all evidence and Git's state.

Start records live in `<git-dir>/gitodile/conflicts/v1/starts/`, independently
of snapshots. A matching owner and pair of heads establish GitOdile origin
even after a restart before snapshot capture. The unique start ID distinguishes
repeated pauses of the same heads, and start evidence participates in the
session token. Live/interrupted starts protect their history recovery refs
across linked worktrees. Ended records follow the conflict owner's retention;
unknown or uncertain evidence is kept. Explicit ended records cannot
attribute a later external merge to GitOdile. Ignored caches outside the
merge footprint are not scanned or charged to the capture budget. See ADR 0041 §10 for the format,
publication, capture bounds, exact-abort verification and retention protocol.

A paused operation is read by `conflicts.rs`
([ADR 0041](adr/0041-conflict-sessions-and-their-recovery.md)). The index
(`git ls-files -u -z`, bounded at 5,000 paths and 16 MiB) and Git's operation
markers in the worktree's own Git directory are the only truth; conflict
markers in files decide nothing. `read_conflict_session` reports the
operation (merge, rebase, cherry-pick, revert, `am`, or unmerged entries with
no marker), its step, both sides named by real refs rather than `ours`/`theirs`, each file's
shape, facets, state and allowed whole-file actions, and a state token. Only a
merge with one merge head is supported; every other operation is explained
with its files and the exact Git commands, and has no action.
`read_conflict_stage` reads one stage lazily, capped at the diff limit, after
checking that the requested object is still that path's stage.
`read_conflict_side_diff` answers "what did this side change" for one regular
file: it checks both object IDs against the path's stages (once the file is
marked resolved, the stages its snapshot records and pins), runs a blob-to-blob
`git diff` (or builds an all-added hunk when there is no base) and returns the
Changes tab's typed `FileDiff`. All three are read-only and run under a shared
read permit; `git_operation_in_progress` asks the same marker detection, so a
refusal and the resolver never disagree.

`conflicts/resolve.rs` owns the three per-file mutations of ADR 0041 §8,
separate actions that never imply one another or finish the merge:
`resolve_conflict_side` (keep the current or incoming side, or delete the
path, in the working tree only; a submodule's side in the index),
`mark_conflict_resolved` (the exact kept stage through
`update-index --index-info`, otherwise `git add` or `git rm --cached` with
literal pathspecs; markers left in a text file refuse unless confirmed) and
`reset_conflict_file` (the snapshot's stages, proved on a copy of the index
first, and its working bytes). Each runs under the write lock, revalidates the
state token, the path's stages and the action's permission, creates the
snapshot when there is none, records what it replaces in the journal first,
verifies its result and returns the fresh session. A side's content comes
through `cat-file --filters` straight into a temporary file beside its
target (`git_command::run_git_to_file`, so an LFS file is never held in
memory) and is renamed over it; a Windows file held open by another program
fails as `file_locked` with nothing changed, whether it refuses the rename or,
opened without sharing, the journal's copy before it.

`conflicts/mod.rs` also holds what neither mutates nor belongs to one action:
the exact-path check every write and open goes through
(`exact_working_path`: inside the project, spelled on disk as Git spells it,
no folder a link), the marker scan, and the case-collision facet.
`open_conflict_file` opens one file in the system's default application
through `desktop::open_in_default_application`, after
`desktop::ensure_opens_as_document` has refused any type the platform would
run instead (per-platform lists plus `PATHEXT` on Windows and the executable
bit elsewhere) and after the session's snapshot exists; it is a
`repository_write` command for that snapshot alone and never changes the
index or the file. `check_conflict_working_file` is a read that says whether
markers remain, or why it cannot tell.

The frontend owner is `src/features/conflicts/`: a lazy screen registered
with no rail or fixed palette entry, reached from Overview, Changes, the
palette and the refusing dialogs. Its controller caches one session read per
project incarnation and the side diffs by the objects they compare. The
session is read after a status snapshot that lists overlapping files or whose
`pausedOperation` says Git's markers hold an operation open (a merge whose
files are all resolved has only the markers; the flag is read from the marker
files, with no Git process), once more after one that has neither, and on
every entry press; a project with
no overlap costs no Git process, and visibility never reads. The three
mutations go through the controller's `mutate`, which makes the session Rust
answers with the cached one and supersedes any read started before it; the
screen takes the project's mutation slot (`resolve`) for each, and a success
runs the one coordinated refresh after a mutation. A reset whose snapshot
could not keep the working content is refused as `conflict_content_not_kept`,
which is how the screen knows to offer the overlap alone. Opening a file in
its application takes no mutation slot and no refresh: the edit comes back
through the watcher, and when a session read shows the file
`editedOutside` the controller asks for one marker check per state token.

Before a session's first change, `recovery::create_conflict_snapshot` writes
`<git-dir>/gitodile/conflicts/v1/<session-id>/` under the write lock, after
revalidating the token before and after capture: a versioned manifest of every
unmerged stage and each path's working content, published by a rename, with
the stage blobs pinned by a tree under
`refs/gitodile/recovery/v1/conflict/<owner>/<session-id>`. The first snapshot
is the original and is never replaced; missing evidence is recorded as
`unreadable` or `omitted`. Its `journal/` keeps what each resolution action
replaced that the snapshot does not hold, pinned by a sibling
`<session-id>-journal` ref, and what each action left on disk. The session
read folds the snapshot and the journal back in, which is how a file becomes
`markedResolved`, `editedOutside` or `stale`, and how it knows which side was
`kept`.

`conflicts/merge.rs` owns ending the session (ADR 0041 §9): `plan_finish_merge`
and `finish_merge` conclude the paused merge with `git commit` (hooks unless
they are off in Settings, signing as Git is set), and `plan_abort_merge` and
`abort_merge` run `git merge --abort` after the journal has kept what it
replaces and the rest of the index is pinned as an `-abandoned` tree. Each
plan carries a token execution proves again; each outcome is judged from what
Git left (`HEAD`, its parents, `MERGE_HEAD`, unmerged entries, the index
against `HEAD`), not from its exit status, and an outcome that is neither done
nor unchanged is `merge_outcome_uncertain` with nothing repaired. The screen's
header offers both in the project's mutation slot; a success publishes "nothing
paused" as the cached session, runs the one coordinated refresh and returns to
the screen the reader came from, and Finish's result offers Publish without
taking it. The watcher
also invalidates on `rebase-merge/` and `rebase-apply/`; GitOdile's own
`gitodile/` folder never invalidates.

Never silently resolve conflicts, discard untracked files, bypass hooks or
signing, force-push, run `reset --hard`, clean files, or delete a branch without
the confirmation and recovery rules in `AGENTS.md`.

## Application update boundary

[ADR 0010](adr/0010-distribute-signed-app-updates-through-public-github-releases.md)
owns the signed public-release design and
[ADR 0019](adr/0019-publish-updates-through-one-channel.md) its single channel.
The version grammar, candidate
targets, installation-mode fallbacks, native states and errors, immutable
candidate identity, payload limits, credential readiness, and A-to-B
qualification pair are fixed in the
[application update contracts](architecture/app-update-contracts.md). No target
is advertised as automatically supported until its real signed A-to-B evidence
exists. The renderer may request native lifecycle actions using opaque IDs;
it never supplies a feed, URL, public key, installer path, target, or request
headers, and there is no channel for it to choose.

The process-wide operation gate, watcher/background suspension, current command
and draft inventories, rollback order, and extension requirements are defined
in the
[install-admission and draft contract](architecture/install-admission-and-drafts.md).
Every later conflict, integration, stash, helper, timer, or editor owner must
join that contract before it can ship.

`app_updates.rs` is the one process-wide native owner. It compiles the one
feed constant and the updater public-key identity; offers only a plain `X.Y.Z`
release newer than the running build; detects the native target and installation mode; and retains at most one
immutable candidate and one verified payload. The exact `tauri-plugin-updater = 2.11.0` Rust API owns the
single feed request and authoritative check; GitOdile strictly validates its
returned `raw_json` before retaining the candidate. The plugin also owns the
official download, signature verification and platform handoff.
The WebView reaches only six GitOdile commands described by the IPC
contract; no updater/process guest permission or JavaScript updater package
is exposed.

`features/app-updates` owns the renderer controller and eager update dialog.
The controller reads and mirrors the process-wide native snapshot, coalesces
every shell entry point, and polls only while a native check, download, or
verification is active; it never infers a second lifecycle or retains payload
bytes. Changelog mounting remains local-only. General Settings stores the
off-by-default consent switch, while the controller owns the settled-startup
timer and its fixed once-per-24-hours in-process cadence. That timer is an
install participant, so preparation suspends it with the other background
owners. The renderer supplies no project identity or stable installation ID.

Install preparation is ordered across the renderer and native process:
synchronously protect drafts, suspend renderer participants, acquire/drain the
global admission gate, suspend native watchers, revalidate the exact candidate
and installation path, persist a bounded one-shot handoff record, then invoke
the installer. A failure unwinds those owners in reverse order. Windows exits
inside the accepted updater handoff; macOS/Linux restart after replacement.
The next launch reports success only when its compiled running version equals
the recorded expected version. Qualification remains a compile-time deny-by-
default target allowlist, so mocks or compilation cannot advertise a platform.

Release packaging follows the two-workflow trust split documented in the
[signed-build runbook](release/signed-builds.md). Source visibility is not a
security boundary: a default-branch coordinator authorizes only a merged,
same-repository `release/<version>` pull request with the exact required checks
and a release-only diff. It creates the protected tag at the exact merge SHA,
then dispatches the secretless matrix. A later `workflow_run` loaded from the
protected default branch revalidates the Git object and complete enabled matrix
before protected jobs can see signing credentials. Those jobs never execute
candidate-source scripts with secrets.
Updater and OS-trust results remain separate evidence fields, and the final
matrix record is explicitly non-promotable. The enabled matrix is Windows
x86-64 NSIS plus Linux x86-64 AppImage. Both macOS targets remain planned and
disabled under task 065-10 and cannot appear in feeds or release assets.

Public promotion is a third workflow and a separate trust domain, documented
in the [public publishing runbook](release/public-publishing.md). Production is
chained automatically from successful protected signing; only the fixed
validation draft remains manual.
Its unprivileged half consumes and rehashes only the complete protected signed
artifact, runs the public feedback contract and stages a package-only bundle.
Its serialized privileged half receives the destination-scoped credential but
does not check out application source. It reconciles immutable draft
assets, anonymously verifies every finalized download, then writes the one
feed manifest with one compare-and-swap commit. The
publication mode and versioned URLs are derived rather than supplied as
independent operator choices, and no release is a GitHub prerelease. The source-controlled qualification registry is
deny-by-default; validation drafts cannot finalize or write production feeds,
and installed A-to-B qualification/target enablement remain exclusively with
065-9-7 and 065-9-8.

## Enforced checks

`pnpm run check` is the repository gate:

- `check:docs` validates local Markdown links, work-item state/completion
  metadata, unique task IDs, README package metadata, application-version
  consistency across npm, Cargo, and Tauri, and (through `check:icons`) the
  layer order and encoding of the committed Windows `icon.ico`;
- `check:architecture` analyzes production, type-only, dynamic, and test edges,
  rejects forbidden directions/cycles and an eager `shared/file-icons`, and proves its
  rules with seeded violations;
- TypeScript strict checking, Vitest, and the production Vite build;
- `cargo fmt --check`, Clippy with warnings denied, and all Rust tests;
- Rust syntax-based tests pin module ownership, keep `lib.rs` registration-only,
  reject crate-root glob transport imports, keep a split module's submodules from
  reaching sideways into each other, and verify the IPC/policy inventory.

Performance comparison protocol and retained budgets live in the
[`architecture baseline`](architecture/023-performance-baseline.md). Launch
JavaScript size is tracked per release rather than budgeted until 1.0
([ADR 0040](adr/0040-track-launch-javascript-as-a-trend.md)). Enable
`VITE_PROFILE_SCREEN_SWITCHES=true` only while profiling; instrumentation is
absent from normal development and production builds.

## Platform and security constraints

### Optional GitHub CLI tooling

The GitHub block of Settings → Integrations owns machine-level `gh` readiness through its
typed port and adapter. Git configuration stays in the separate Git section.
`tooling.rs` shares fixed platform installation/update plans with Git while
keeping each tool's launch guards and update cache independent. The renderer
cannot provide executable paths, package IDs or command arguments. `gh --version`
is a bounded, cancellable local probe with prompts/update notifications disabled;
it never checks authentication or contacts GitHub. It first uses `PATH`; only
a missing executable permits fixed fallbacks for standard Homebrew/local
installation paths on macOS/Linux. A broken executable on `PATH` remains an
error. No shell startup files are executed and process-wide `PATH` is unchanged.
WinGet queries drain both
output pipes concurrently with bounded retention and a 15-second deadline.
Install/update helpers keep the native app-install blocker until their child
exits. macOS/Linux provide official guidance rather than privileged package
manager execution.

The Settings tooling hook serializes local diagnostics and update checks. A
changed version or unsuccessful local check invalidates its previous update
answer. Manual checks supersede earlier action receipts, including responses
from actions still in flight.

Windows installs, upgrades and update queries pin the exact package to the
`winget` source. Installation and upgrade share a per-tool launch guard until
the helper exits. Git repair instructions remain available even when the
executable is unusable; a browser failure can be retried. The macOS and Linux
plans point to Git's current official installation pages, leaving package
manager and privilege choices to the user.

Machine authentication is separate: `github_auth.rs` owns the saved github.com
accounts, their active selection and one bounded worker for explicit checks,
browser login, switching or targeted local sign-out. Cached
reads never start a process or contact GitHub. Status requires gh's JSON support;
login streams only a validated temporary code. Tokens remain with gh; raw output
and credentials never enter IPC or diagnostics. Checks drain for installation;
login, switching and sign-out block it until their workers exit, including cancellation reaping.
Cancellation can race with session persistence, so its result offers a check.
Sign-out validates the confirmed username against the cached accounts, passes
`--hostname github.com --user <login>` as separate arguments, and clears the
removed identity even when follow-up verification fails. gh can select another
stored account; its actual checked state replaces the previous one. Switching
uses `gh auth switch --hostname github.com --user <login>` and checks the actual
selected identity afterwards. An uncertain mutation requires another check before
switching or removal. Status decodes every github.com JSON entry (at most 32),
retains per-account authorization errors and orders the active account first.
Environment-controlled sessions cannot be changed by these account commands.

Explicit account actions can enrich a verified identity through a bounded gh
`api users/<login>` public profile query with a validated username. Up to four
accounts receive optional avatar enrichment concurrently; a newly activated
account is first, and other cached images remain available. Pictures for every
provider go through `avatar.rs`
([ADR 0038](adr/0038-hosting-account-profile-pictures.md)). It owns:

- the allow-list of picture hosts per provider; github.com uses a fixed CDN URL
  derived from the profile's numeric id;
- a credential-free client with no redirects;
- PNG/JPEG/GIF/WebP sniffing capped at 256 KiB, encoded through `encoding.rs`;
- the per-account disk cache under the app cache directory.

gh, glab and the token connections in `hosting_access.rs` refresh a picture
after each successful verification, and delete it on sign-out or removal.
Token rows read the cache, so a picture renders at launch. The renderer shows
three separate identities:

- `ProjectAvatar` (shared UI) for a project;
- `ProfileAvatar` (`features/account`, initials only) for the GitOdile profile;
- `HostingAvatar` (`features/accounts`, picture plus provider badge) for a
  hosting account.

None of them reads another's source. Renderer
CSP and browser opener scopes remain unchanged; image failure never changes
authentication status. Cached reads and Settings visibility cause no downloads.

`features/github` owns the authentication port, controller and eager account
body. The composition root injects it into Settings without cross-feature
imports. The root retains the memory cache and hidden Settings suspends cached
polling. Shared sessions, environment credentials and plaintext fallback are
disclosed. See [ADR 0021](adr/0021-reuse-github-cli-authentication.md).

Future PRs/Actions need their own feature ports, repository/session authorization,
explicit network consent, bounded responses and permission handling. They must
not extend Settings into generic gh execution or equate authentication with
repository/action access. Discovery stays defined by
[ADR 0020](adr/0020-prepare-optional-github-cli-tooling.md).

### GitLab.com accounts and discovery

`hosting_access.rs` owns the shared native token store lifecycle, verification,
bounded fixed-origin HTTP reads and repository pagination. `github_access.rs`
keeps its existing public adapter surface; `gitlab_access.rs` supplies a distinct
Tauri state type over that owner. GitHub's persisted usernames and secure-store
namespace are unchanged. GitLab metadata stores numeric user IDs and display
usernames separately; `token.<id>` and `cli.<id>` are distinct connection keys.
GitLab tokens live under `GitOdile/GitLab.com/token/v1`, never glab configuration.

`gitlab_auth.rs` owns a single cached GitLab.com CLI identity and serialized
check/login/logout worker. `cli_auth.rs` shares bounded process drainage,
timeouts, cancellation/reaping and wiping with gh. glab 1.120.0+ provides a
native credential receipt; the secret is captured and checked through the fixed
`/api/v4/user` API before GitOdile supplies that same credential. No default-host,
environment-token or identity fallback is allowed. Logout verifies the confirmed
numeric ID immediately before glab's host-level removal. A concurrent external
glab mutation cannot be made atomic; offline/invalid verification fails closed.

`tooling.rs` gives glab separate launch/update state and the fixed WinGet package
`GLab.GLab`. Diagnostics and authentication share PATH-first glab discovery;
only a missing executable permits fallback to standard installation paths.
On Windows these include per-user LocalAppData/Programs and Program Files,
so a completed installer is detectable without refreshing the process environment.
Both readers accept the released `glab X.Y.Z` version output and the labelled
`glab version X.Y.Z` spelling. The neutral tooling hook and grouped Settings rows accept injected
ports/copy. `features/gitlab` owns its typed adapter, cached controller and eager
account/token bodies; hidden Settings suspends polling. Token/browser/tooling
order, permission/storage consent and single CLI identity limitations are explicit.
Visibility never authenticates or fetches projects; saved connections are verified
after launch ([ADR 0027](adr/0027-verify-saved-accounts-after-launch.md)). Identity avatars use a local
fallback. Shared clone discovery dispatches by registered provider and rechecks
`/user` before `/projects?membership=true` with bounded 100-row pages. Nested
namespace URLs must match the fixed provider host before entering the existing
source-access/destination/credential-helper boundary. See
[ADR 0024](adr/0024-connect-gitlab-through-shared-hosting-accounts.md).

### Bitbucket Cloud accounts and discovery

`ProviderKind::Bitbucket` is a third product of `hosting_access.rs` with the
fixed instance `bitbucket` (`bitbucket.org`, `https://api.bitbucket.org/2.0`);
`bitbucket_access.rs` is its distinct Tauri state type. It has no CLI: a
token-only `NoCli` adapter supplies no rows or credentials, and
`ProviderKind::server_kind` keeps it out of the company-server registry. API
tokens are sent as Bearer, stored under `GitOdile/Bitbucket/token/v1`, keyed by
the bare lowercased UUID from `/2.0/user`, with display names kept separately;
Git uses the static `x-bitbucket-api-token-auth` username. Discovery lists
`/2.0/user/workspaces` and then `/2.0/repositories/{workspace}?role=member`,
treating the body's `next` only as a signal and rebuilding each request on the
fixed origin. The service remembers per account and token generation where each
browser page starts. Clone links must point to the same repository on
`bitbucket.org`; the embedded viewer name is dropped. `features/bitbucket` owns
the Settings section (shared Accounts list and token form) and its typed port.
See [ADR 0026](adr/0026-connect-bitbucket-cloud-through-api-tokens.md).

### Company servers

`hosting.rs` owns user-added GitHub Enterprise Server and GitLab Self-Managed
instances (`hosting-servers.json`, at most 8, validated on load by re-deriving
each `ghe-`/`gls-` ID from its normalized authority). Each server composes a
host-scoped `HostingAccessService` (API origin, OS-store namespace, clone-URL
host) with a host-scoped `GitHubAuthService` or `GitLabAuthService`, and
registers with `AccountService`, whose provider list is runtime-mutable. Adding
probes the address without credentials; removing deletes that server's token
secrets and unregisters it while bindings stay saved and unavailable. The Git
helper receives a server's authority as an argument and rebuilds its adapter only
when that authority derives the account's instance ID. Credential scopes, remote
validation and header masking compare host and port. The `hosting-servers`
feature owns the Settings → Integrations composition (`AccountsSettings`: one
connected-accounts list for every provider grouped by host, the provider menu
and connect panels, and a folded block per provider holding its server
inventory and CLI tooling) and its typed port. It composes `accounts`' token
rows and form with the embedded gh/glab account bodies and per-product token
copy from `github`/`gitlab`/`bitbucket`, over one shared catalog read so a
change anywhere in the section shows everywhere in it. Settings renders the
gh/glab tooling rows and hands them to the section through its `accounts`
render slot, which App fills. Native opens
gh's device page for a server because the renderer's opener scope is a fixed
list. See
[ADR 0025](adr/0025-connect-company-servers-as-provider-instances.md).

### Azure Repos Services organization connections

`azure_access.rs` owns organization instances and canonical clone URL validation;
`hosting_access.rs` supplies the native PAT lifecycle and connection-data identity
checks. The shared provider contract has an optional `scopePath`, shown beside
`dev.azure.com` in Settings and used to select one organization instance in clone
and project account pickers. Process-only Git helpers enable `useHttpPath` and
validate that scope before reading the secret. The same identity on two
organizations has separate secure-store namespaces and bindings. Azure's
frontend feature owns its typed port, adapter, organization step and token copy;
`hosting-servers` composes it in Integrations. No Azure discovery source is
registered. Clone offers a URL-only Azure tab; connected Home accounts open it
with their selected connection without calling the repository-browser port.
See [ADR 0036](adr/0036-connect-azure-repos-by-organization-and-pat.md)
for URL normalization, account lifetime, limits and qualification boundaries.

### Shared hosting accounts and Git access

The optional GitOdile identity demo is separate from hosting accounts.
`features/account` owns its controller, scenarios, overlays and `AccountSettings`
body; the development composition injects that body into Settings. Both the
category rail and command palette use `availableSettingsSections` with the same
capability check. A modal account flow temporarily suspends the Settings focus
trap and makes its retained DOM inert, preserving drafts and a live return-focus
target. Closing Settings does not dispose the app-scoped session. Production
omits the demo capability and copy; it introduces no native authentication.

`credentials.rs` owns provider-neutral metadata, bounded persistent project
bindings and the internal Git credential protocol. `hosting.rs` registers
adapters for both the desktop and helper process; `main.rs` dispatches helper
mode before Tauri starts. `github_auth.rs` and `gitlab_auth.rs` supply the CLI adapters;
Bitbucket is token-only.
`features/accounts` owns the typed account port, cached receipt controller and
picker shared by clone and project settings. `useAccounts` keeps the last local
receipt per port, so a remounted section renders it before the next read and
reports `loaded` so an unread catalog is never shown as empty.
`hosting::sync_accounts_after_launch` runs the Check connections action for every
product three seconds after launch; see
[ADR 0027](adr/0027-verify-saved-accounts-after-launch.md). Providers implement adapters rather
than duplicating the selection store, picker or Git access policy.

`git_command.rs` applies process-only HTTPS helper configuration at the policy
facade; the bounded runner in `git.rs` stays independent of hosting. Explicit
account lookup is native-only and exact (saved-user lookup for gh, numeric
identity verification for glab), without switching a CLI session or changing
persistent Git configuration. Local preference reads and
writes retain repository/session authorization. Clone fingerprints include the
selected identity and publish its project binding after destination verification.
Failure to save that binding preserves the completed clone result and reports
manual account setup without a clone retry or automatic opening. A failed account
check retains identities/avatars while marking old verified rows as unchecked.
Verified token rows stay selectable while a background check runs. Checks and
discovery are fenced per connection, so adding or removing one token never
discards another token's result; a GitLab rename found by a check is persisted.
Project settings warns beside the picker when a provider remote stores sign-in
details (shown redacted) or uses HTTP, the cases the transfer guard refuses.
Repository descriptions are display text: line endings are normalized, other
control characters dropped and length bounded, while names, owners and clone
URLs stay strictly validated. The Git helper's glab lookup skips the separate
version probe and still verifies the numeric identity before answering. The
hosting HTTP clients share the updater plugin's Reqwest features (one TLS
provider); the app-update contract check fails if that client stops verifying
against the OS trust store or stops honoring OS proxy settings.
Git helper failure stops fallback to another identity. See
[ADR 0022](adr/0022-share-provider-accounts-and-scope-git-access.md) for the narrow
native-token exception to ADR 0021, scope isolation and platform qualification.

`hosting_access.rs` composes CLI and native OS-stored token connections behind
each provider adapter. Credential-source IDs and HTTP usernames are separate, so
the same person can explicitly choose browser or token. `features/github`,
`features/gitlab` and `features/bitbucket` inject their copy/ports into the shared one-way token form; `features/repository-browser` owns the typed
paginated discovery port/controller and eager clone-overlay browser. Native API
access verifies the exact selected identity and validates every clone URL.
Visibility only reads local receipts; pages require clicks. Saved connections are
verified in the background after launch (ADR 0027).
See [ADR 0023](adr/0023-add-native-github-tokens-and-repository-discovery.md) for
storage, cancellation, limits, caching and platform consequences.

### Canonical product identity

The shipped product, npm/Cargo packages, Rust crate, executable, frontend
assets, and browser preferences use **GitOdile** / `gitodile`:

- Tauri uses the bundle identifier `app.gitodile.desktop`;
- browser preferences use `gitodile-*`, without a brand-compatibility reader;
- recovery schema v1 uses `refs/gitodile/recovery/...` and
  `<git-dir>/gitodile/...`;
- source links target `https://github.com/martinezelx/gitodile-desktop`; user
  feedback, releases and downloads target the public `https://github.com/martinezelx/gitodile`.

The owner explicitly authorized a breaking pre-release identity reset, recorded
in [ADR 0009](adr/0009-use-only-the-canonical-product-identity.md). Previous-brand
preferences and recovery records are no longer read or migrated; no existing
data is deleted. An installation under the new identifier may start with fresh
WebView state and coexist with an earlier installation.

Future changes to state-bearing identifiers require a separately reviewed
migration or explicit reset decision and recovery tests.

- Repository content stays local unless the user explicitly invokes a remote
  feature.
- Tauri capabilities remain minimal; no generic command-execution endpoint is
  permitted.
- Repository content, config, hooks, remote responses, and paths are untrusted.
- Repository content is never rendered as markup. A picture — an SVG
  included — is drawn as an `<img>` with a `data:` URL, a context in which
  the engine runs no script and fetches no external resource. Inlining it
  would hand repository content the application's own document and origin.
- Never log credentials, helper output, private keys, or authenticated remote
  URLs.
- AI features require explicit consent and disclosure of transmitted data.
- Paths, casing, symlinks, line endings, credentials, file locks, prompts, and
  process behavior across Windows/macOS/Linux are correctness concerns.

CI checks Rust on all three platforms and release-compiles macOS/Linux desktop
executables. Actual macOS/Linux WebView behavior, accessibility, memory,
signing, and packaging remain unmeasured release gates, not implied support
claims.

### Application icon and Windows shortcuts

`scripts/icons/mascot.mjs` is the only hand-maintained icon source. It holds
the mascot as one drawing (ADR 0031), built from the traced shapes in
`scripts/icons/mascot-shapes.mjs`, and crops it two ways: the whole body and
the head. `pnpm icons` writes the
standalone SVGs, the element tree the in-app mark renders inline
(`src/shared/ui/mascotArtwork.ts`, so its fill can follow the theme) and the
console welcome's ASCII art (`src/features/console/mascotAscii.ts`, sampled by
the dependency-free `scripts/icons/ascii-art.mjs`), then runs `tauri icon` on two
1024×1024 sources: the whole mascot on the white tile filling the canvas, and the
identical icon on Apple's 824px macOS grid. Every PNG, the
Windows `.ico` and the Store logos come from the first; the macOS `.icns` comes
from the second. There is one icon at every size, with no head variant spliced
into the small layers. The same run renders the brand PNGs under
`src/assets/brand/png` with `tauri icon --png` (the icon at 16–1024px, the macOS
icon, and the mascot and head on transparent squares). The Android/iOS sets
`tauri icon` also emits are discarded because GitOdile does not ship them. Edit
`mascot.mjs` and regenerate; never touch a generated SVG, module or PNG by hand.
`check:icons` fails when the generated text files drift from `mascot.mjs`.

`tauri icon` writes every ICO layer PNG-compressed. Windows guarantees PNG only
for the 256px layer and expects the 16–64px layers as 32-bit DIBs; some shell
paths that extract a shortcut's icon from an executable render a
PNG-compressed small layer as a blank sheet. `scripts/icons/build-windows-ico.mjs`
(the last step of `pnpm icons`) re-encodes those layers as DIBs and keeps
Tauri's layer order (32px first, then 16, 24, 48, 64, 256); `check:icons`
fails the gate when the committed `icon.ico` drifts from that shape.

The Windows installer is dressed from the same drawing. `tauri.windows.conf.json`
points `bundle.windows.nsis` at `icon.ico` for the installer and uninstaller
executables and at two bitmaps under `src-tauri/windows/` that Modern UI 2
draws at fixed sizes: `installer-sidebar.bmp` (164×314, the whole mascot on
the icon's white, shown on the Welcome and Finish pages) and
`installer-header.bmp` (150×57, the mascot's head on the white, shown in the
header of every other page). `mascot.mjs` composes both
(`installerSourceSvg`); `pnpm icons` renders each in the corner of a square,
because `tauri icon` renders only squares, and crops it to
`src/assets/brand/png/gitodile-installer-*.png`.
`scripts/icons/build-nsis-images.mjs` (the last step of `pnpm icons`) encodes
those PNGs as the 24-bit BMPs NSIS needs without resampling; `check:icons`
fails when the committed bitmaps drift from the PNGs. The installer ships English and Spanish (the app's two
locales) and picks the system UI language without a selector dialog.
`bundle.copyright` and `bundle.homepage` in `tauri.conf.json` feed the
installer's branding text, the executables' version resources, and the
"Installed apps" support link. `bundle.publisher` must stay at its default
(`gitodile`, derived from the identifier): NSIS stores the install directory
under `HKCU\Software\<publisher>\GitOdile` and the updater reads that key to run
the previous uninstaller, so renaming the publisher would break updates of
every existing install.

The NSIS shortcuts Tauri creates carry no icon location, so Explorer resolves
their icon from `gitodile.exe` — the file the passive updater overwrites in
place. A shell refresh during that window caches a blank icon that then
persists. `src-tauri/windows/installer-hooks.nsh` (wired through
`bundle.windows.nsis.installerHooks`) runs after every install: it rewrites
the desktop and Start-menu shortcuts that still point at our executable with an
explicit icon location (the executable, index 0), preserves their
AppUserModelId, and raises `SHChangeNotify` for each shortcut and for
`SHCNE_ASSOCCHANGED` so the shell drops what it cached. Shortcuts the user
removed stay removed; on an interactive first install the desktop shortcut is
created by the finish page after the hook and gains the explicit icon on its
first update.

## When an ADR is required

Add an ADR before changing a durable decision such as the Git backend, state
management model, credential storage, updates, telemetry, AI providers, WSL
support, or extension architecture. Small ownership-preserving refactors do
not need an ADR; update this document when the current architecture changes.

## Clone source access and destination preview

The eager clone overlay owns two input screens. Source selection hands the exact
repository/connection to the editable destination. Its local native plan is
refreshed on destination edits; only the matching plan can execute. The existing
state-token, staging, verification, exclusive publication and recovery/error
paths remain the mutation boundary.

`features/clone/sourceAccess.ts` owns debounced source checks and generations.
Editing a complete GitHub/GitLab address/account explicitly starts a read; visibility
does not. A typed clone port invokes `check_clone_source`, which validates the
fixed GitHub/GitLab host, protocol, complete (possibly nested) path and absence of URL secrets before credentials
are read. `clone.rs` executes bounded, cancellable `git ls-remote --quiet -- URL
HEAD` under the same process-scoped credentials as cloning. Success with zero
refs is valid for an empty project. Failure never exposes stderr or tokens in
the response, and lack of access is not labelled a definitely nonexistent repo.
Checks have bounded cancellation tombstones for cancel-before-registration races.
The default Git credential helpers and SSH configuration remain owned by Git;
transient/authentication-tool failures can be checked during the actual clone.

The reference inspected was GitButler's small remote transport representation
(`crates/gitbutler-repo/src/remote.rs`): keep structured source metadata separate
from the workflow. GitOdile keeps its existing system-Git/process policy instead
of adopting GitButler's gix repository implementation. No code was adapted.
