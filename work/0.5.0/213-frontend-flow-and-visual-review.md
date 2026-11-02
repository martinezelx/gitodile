---
id: 213
title: Review every 0.5.0 frontend flow and propose visual improvements
status: active
priority: normal
type: task
areas:
  - frontend
  - ux
created: 2026-10-31
completed:
parent:
queue: "01"
---

# Goal

Review the new 0.5.0 frontend flows, explore their presentation, and apply
the maintainer-approved resolver refinements using the existing app's look.
Backend correctness is assumed. This task does not re-audit Git operations,
credentials, publication or platform qualification.

# Context and scope

Requested on 2026-10-31 after the original implementation phase closed. The
[completed inventory](../done/0.5.0/README.md) defines the release boundary:
037 and its children, 065-4 and its children, and 212. Work stays on the existing
`release/0.5.0`; the original closure is historical evidence.

The full review includes resolver entry points in Overview, Work/Changes,
Branches, quick switch and the palette; Bring in changes and Get project
changes; file choices, external editing, Mark/Reset, Finish/Stop and their
cancel/back/error paths; stale, busy, partial, unsupported, binary and unreadable
states; and task 212's initials and Markdown presentation. A three-pane editor,
inline editing, rebase support and a new Recovery screen remain out of scope.

The maintainer prioritized implementing the main resolver screen. Only its
approved refinements, the shared modal disclosure interaction and the reported
background-selection bug were implemented. Other findings remain proposals.

# Design exploration

- Temporary release walkthrough: nine journeys,
  28 states, transition guidance, implementation references and 17 embedded
  historical captures. Historical images are not new runtime validation.
- Temporary current/proposed resolver:
  built comparison with Spanish/English, light/dark, simulated choices,
  confirmations, filters and preserved example state.
- Temporary action alternatives:
  four Keep variants and four Stop/Finish variants, independently combinable,
  with long branches and pending/all-resolved scenarios.
- [Style matrix](../assets/213-frontend-review/style-conformance.md): the initial
  source-based comparison against Changes, History, Save, Publish and Discard.
  It records proposals and limits rather than claiming full visual equivalence.

The HTML files were self-contained review aids, not React implementations or
Git clients, and executed no Git operations. After approval, the maintainer
requested their removal as temporary previews; they are not retained in the
commit. The style matrix remains. The running app and DESIGN.md define the
final behavior.

# Implemented refinements

- Compact header with real merge direction and paused state; unsupported
  operations retain truthful generic descriptions. Back is an accessible icon.
  Pending/resolved groups show progress; the full count remains accessible.
- File identity and actions share one strip. Resolved appears once with the
  file description, not above Reset. Kept/deleted, marker and busy explanations
  belong under the identity, outside the button group. Long notes and branch
  descriptions wrap; branch buttons and confirmations truncate with full
  accessible names/tooltips. Side roles remain visible beside branch names.
- Accepted action option B/B: shared Keep-version-from context, visible branch
  names, short Stop/Finish labels. Stop uses Undo2; Finish uses Flag to distinguish
  it from branch glyphs and the file's resolved check.
- Delete, Open in editor and Reset use small circular secondary controls with
  localized tooltips/accessibility labels; Delete retains danger ink. Reset
  opens its existing confirmation directly. Mark resolved uses a primary check;
  its explanation and marker/permission questions retain visible action text.
- Successful editor opening adds no persistent text to the strip. The existing
  live announcement remains, as do useful failures and marker information.
- Search intersects cached pending/resolved and actual filename-extension
  filters using SearchBox, FilterPanel and removable FilterChips. View memory
  is scoped to the project session. Selected extensions remain removable if
  their last file disappears. Extension options stay virtualized; arrows,
  Home/End and Tab reach options outside the current virtual range.
- No permanent Refresh button while watching normally. Existing repository
  invalidations refresh the conflict cache. Watching-off/unavailable states
  offer AutomaticUpdatesNotice, Update now and Settings, including the loaded
  empty screen. Error/stale cases retain their contextual retry/read actions.
- Modal disclosure headings use the app's default arrow, non-selectable labels
  and primary-text hover feedback. Expanded technical content stays selectable;
  native keyboard toggling and focus outlines remain. The gallery has a specimen.
- Removed the obsolete More-actions translation after replacing its one-item
  menu. No new dependency, token, dialog size or Rust/IPC change was introduced.

Keep, Mark, Reset, Finish and Stop retain their separate consequences and
confirmation/recovery contracts. Filters do not mutate the session, alter its
totals, enable Finish, fetch data or replace repository invalidations.

The separately requested background project-selection fix was committed on
2026-11-01 as `69545e7` (`fix(repository): preserve active project during background
refresh`). Identity reads now use epoch-scoped `refreshProject`, preserving
explicit activation and rejecting closed/old sessions. It is already in HEAD
and is not part of the pending visual-refinement commit.

# Validation

Validation was performed during 2026-10-31 through 2026-11-02. Disposable native
fixtures live outside the repository at
`C:/workspace/gitodile-lab/repaso-visual-0.5.0/`; 03 is the paused-merge fixture.

| Check | Result and limits |
| --- | --- |
| Native Tauri resolver | Reviewed English/Spanish and light/dark, branch names and roles, cached filters, icon actions, disabled Finish and Keep/cancel. Later inspected the user's already-resolved files in both themes: no duplicate resolved label, Reset remains aligned. No full native Finish/Stop success or full release audit is claimed. |
| Native editor request | Markdown open request reached the Windows application chooser; cancelled it without setting a default. The action bar stayed unchanged in dark/light. No external editor completion or file edit is claimed. |
| Native modal | Expanded Technical details in Stop combining, then cancelled the modal. No merge was abandoned. |
| Actual React layout with mocked port | 120 cases: English/Spanish × light/dark × 320/768/1440 px × pending, resolved, kept, deleted, markers, unknown, none, checking, busy and inline Keep question. Long file/branch names; no page overflow, buttons outside the strip, misplaced status or script errors. This validates presentation, not backend safety. |
| Shared disclosures in running gallery | Four theme/recipe cases cover standard and Get-project-changes disclosures: default cursor, no heading selection on mouse drag, selectable expanded text, Enter/Space, focus ring and token-based hover. Reduced motion checked; generated CSS includes the WebKit-prefixed selection property. |
| HTML aids | Offline walkthrough: 28 states and 17 decoded embedded captures across light/dark and 320/768/1366 px. Comparison/filter follow-up: 24 language/theme/width/version cases. Action alternatives: 192 combinations. Navigation, confirmations, filter intersection/reset, state preservation and Finish gating checked without page overflow, script exceptions or network requests. These results are artifact-only. |
| Regression tests | Domain filter combinations/extensions, cached filtering without rereads, bounded 1,000-extension picker and keyboard reachability, watcher fallback, icon Reset confirmation, and editor opening without persistent strip feedback. Existing mutation/planner/error tests remain. |
| Final-review correction | Empty loaded screen had lost Update now with watching off/unavailable. Two added parameterized cases failed before the fix, then passed and recovered a newly paused session on refresh. Focused screen/controller/domain suite: 65 passed. |
| Background-selection fix | Reproduced the old HEAD/ref invalidation selecting another project; verified two-project and pending-read regressions plus closed/reopened epochs. Native validation required a full dev-window reload because Fast Refresh retained the old controller initializer. Project 03 then stayed active after a non-content HEAD notification. HEAD bytes and original timestamp were preserved. |

Earlier aggregate attempts were blocked by Windows holding the running
`gitodile.exe`, or by the existing cursor guard when the first disclosure draft
used a link cursor. The app was closed normally for successful retries; the
cursor was corrected without weakening the guard. Previous complete gate:
1,902 frontend tests, 693 Rust unit tests and two integration tests; one Rust
test intentionally ignored. The existing Vite chunk-size warning remains.

Final preparation gate (2026-11-02): `pnpm run check` passed after cleanup and
the empty-state regression correction: documentation, architecture, TypeScript,
1,904 frontend tests, production build, Rust formatting, Clippy, 693 Rust unit
tests and two integration tests; one Rust test intentionally ignored. The known
Vite chunk-size warning remains. Before removal, the three temporary HTMLs passed an offline
smoke check at 18 theme/width combinations, with 19 decoded embedded images,
no script errors or network requests, and no new output files.

# Cleanup and commit preparation

At the maintainer's request, removed 36 auxiliary files (2,657,766 bytes):
raw JSON validation receipts, standalone PNG/JPG captures and two redundant
validation reports. Their material results are consolidated above. At the
maintainer's subsequent request, the three temporary HTML previews were also
removed and excluded from the commit. The style matrix remains. Deleted files
were generated during this task, not existing release-closure evidence or
product assets.

The pending commit contains the visual refinements, filters, disclosure changes,
their regression coverage, durable documentation, this task/index update and
the retained style matrix. The maintainer subsequently authorized committing
this reviewed implementation and documentation, excluding temporary HTML.
No push was requested.

# Acceptance and remaining review

- [x] Inventory release journeys and produce offline HTML/style references.
- [x] Apply the maintainer-approved main resolver and modal refinements.
- [x] Preserve safety boundaries and add/update meaningful regression coverage.
- [x] Record bounded native and mocked presentation validation separately.
- [x] Consolidate execution history and remove redundant generated files.
- [x] Pass the final preparation gate and inspect the staged diff; leave it
      ready for a later commit, without committing now.
- [ ] Exercise every release-scoped entry/action/cancel/back path in Tauri,
      using mocks for otherwise unreachable states and labeling them as such.
- [ ] Complete same-condition visual comparisons for all new surfaces and
      their equivalents, including 200% zoom, short windows, accessibility,
      reduced motion and task 212; code reuse alone is not visual proof.
- [ ] Deliver the remaining prioritized frontend findings for maintainer review.

The task stays active: the approved implementation is validated and prepared
for commit, while the broader release-wide visual audit remains open.

# References

- [Design](../../DESIGN.md), [architecture](../../docs/ARCHITECTURE.md),
  [frontend feature guide](../../docs/architecture/frontend-feature-guide.md).
- `src/features/conflicts/`: screen, file resolution, filters, controller,
  domain, translations and tests.
- `src/shared/ui/primitives.css`, `src/dev/gallery/Gallery.tsx`, `src/app/App.tsx`.
- Bring/Get: `src/features/sync/`; main entry points: Overview, Changes, Branches.
