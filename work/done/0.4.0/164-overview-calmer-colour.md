---
id: 164
title: Overview wears one state colour, and the timeline says the rest with node shapes
status: done
priority: normal
type: improvement
areas:
  - frontend
  - design
created: 2026-10-12
completed: 2026-10-12
parent:
queue:
---

# Goal

Calm the Overview's colour so the next-step card is the one surface that wears
a state's colour and its button the one solid accent, while every other state
on the page is told with shape and ink.

# User outcome

With unsaved work and versions waiting to publish, the eye goes to the amber
card and "Save version" first. The timeline still says which versions are
unsaved, saved only here, published or waiting on the remote, but by the
shape of each node rather than by tinted rows and groups.

# Context

Reviewed from a dark-mode screenshot (9 unsaved changes, 2 unpublished
versions). Green meant five things at once — the primary action, brand,
success, saved-but-unpublished, diff added, links — and in the dark theme
`--accent-primary-fill`, `--status-success` and `--diff-added` are the same
`#9bd65a`, with `--surface-active` a 14% wash of it. The "Only on this
computer" group sat on that wash, so pending work read like success and
competed with the card's button. The "Now" row repeated the card's amber as a
second fill right under it.

The analysis, references (Linear, Slack, Vercel/Geist, GitHub Primer/Stripe,
Raycast/Arc, GitHub Desktop/Fork/Tower) and four options are in the review
artifact "Overview color audit". The user chose the recommendation: option A
(node shapes, after Linear) with neutral counts and capsules from Primer.

# Scope

- Node shapes in the Overview timeline: dashed ring for "Now" with unsaved
  work, half-filled for local-only versions, solid neutral disc for published
  ones, dashed blue for incoming (unchanged).
- No fill on the "Only on this computer" group (and its no-remote variant),
  the "Now" row, or the incoming row; their head, label and icon go neutral
  (the no-remote label keeps the unsaved ink).
- The "current" badge is a neutral capsule, on Overview and History alike.
- History's timeline takes the same node shapes (`history-row--local` half
  filled, `history-row--published` a solid neutral disc, an unknown
  publication an empty ring), and both timelines share one hover: the node is
  ringed in the accent rather than filled, so History's selected version stays
  the one green node. Selection keeps the node's shape and only turns it to
  the accent: a selected local version is half filled in the accent, not a
  full disc that would read as published (the user's catch after the first
  pass).
- History's published/unpublished boundary takes Overview's mark (option C in
  the audit's section 12): a neutral cloud on the rail, "Published on origin",
  the rule, and "☁ Publish N" at its end on the current branch ("N not
  published" elsewhere). Overview's own rail mark goes from the success green
  to the secondary ink, so the two timelines draw one mark and the publish
  cloud beside it is the branch's only green.
- "Publish up to here" on a local node becomes the status bar's sync pill in
  a circle: control surface and hairline, only the cloud in the accent. It
  fades in without growing or breathing, and the half-filled node beneath it
  no longer turns accent under the pointer (the source of the flicker the user
  reported after the first pass).
- The same rule on the other screens that painted state with the accent:
  History's "Only on this computer" publication chip goes to the primary ink,
  History's "publish from here" boundary keeps only its cloud in the accent
  (now `CloudUpload`, as DESIGN.md asks wherever "publish" appears, instead of
  `Upload`; always visible, and under the pointer the capsule takes the control
  surface and hairline of Overview's publish circle),
  and Changes' attention note no longer puts its amber icon on the green
  `--surface-active` wash.
- Links in the primary ink: "Review", the leading "View all", the "Now"
  link and the scene's "Connect".
- Counts neutral: the status bar's changes count and the scene's outgoing
  badge; the scene's outgoing dots in the primary ink.
- The detail's diff bar thinner (3px) and at reduced strength.
- Overview's "Discarded changes" card (added after the first commit, on the
  user's review): no amber wash, the icon in the secondary ink, the count of
  restorable copies a neutral badge like the scene's, and a neutral hover on
  "Restore" instead of `--surface-active`.
- DESIGN.md records the node-shape rule and the one-coloured-surface rule.

# Out of scope

- Splitting the theme tokens that coincide in dark mode
  (`--accent-primary-fill`, `--status-success`, `--diff-added`): it touches
  every theme block in `themes.css` (fourteen, not the four the audit said)
  and deserves its own task (P3 in the audit).
- Accent used for selection and interaction elsewhere (History's selected row
  and rail, node hover, filters, Console and Home pressed states), unread
  notifications, and primary buttons: those are what the accent is for.
- The next-step card, its tones and its button.
- The rail's project badge.

# Acceptance criteria

- [x] Published rows carry `overview-history__item--published` and a solid
      neutral node at rest; local-only rows a half-filled node.
- [x] The local group, the "Now" row and the incoming row have no tinted
      background, at rest or sticky.
- [x] The "Now" node is a dashed ring in the state's colour, solid again when
      quiet.
- [x] Hover and focus still turn a node into the accent, and "Publish up to
      here" still appears on an unpublishable node.
- [x] Counts and links listed in scope no longer use the accent.
- [x] "Publish up to here" appears as a neutral circle with an accent cloud,
      with no scale or breathing animation, and the node under it does not
      change on a publishable row.
- [x] History's boundary draws Overview's rail mark and names the remote,
      with the publish action at the end of the rule.
- [x] A selected local version keeps its half-filled node, in the accent.
- [x] The "Discarded changes" card wears no state colour: no wash, neutral
      icon and badge, neutral hover on "Restore".
- [x] History's nodes use the same shapes as Overview's, and both timelines
      ring the node in the accent on hover without filling it.
- [x] History's "current" badge and local-only chip, its boundary publish
      control, and Changes' attention note follow the same rule.
- [x] Overview and app tests pass.
- [x] Visual check in the running app (see Validation).

# Relevant files

- `src/features/overview/overview.css`
- `src/features/overview/HistorySummarySection.tsx`
- `src/app/app-shell.css`
- `src/features/history/history.css`
- `src/features/overview/OverviewDetail.tsx` (markup unchanged; its card's
  styles are in `overview.css`)
- `src/features/changes/changes.css`
- `DESIGN.md`

# Dependencies

[163](163-status-bar-sync-button.md), whose neutral sync pill set the
direction.

# Decisions

- Shape over colour for a version's state: the timeline is already a rail of
  circles, so the reading costs no new element and survives greyscale and
  colour-vision differences.
- The local group has no contour either: its sticky label and the
  half-filled nodes are enough, and a box would bring back a second surface.
- The "current" badge was first neutralised on Overview only; after the
  hover review the user asked to apply the style everywhere it was used, so
  the base `.history-ref-badge--current` changed and the Overview override was
  removed.
- The user asked for History and Overview nodes to match and chose that
  History adopt Overview's shapes over reverting Overview to rings, which
  would have dropped the state the shapes carry.
- Screens audited for the old style: Overview, History, Changes, Home,
  Console, Notifications, Settings, Clone and the status bar. Only the items
  in scope painted a *state* with the accent; the rest use it for selection,
  pressed states, unread marks or primary actions.
- The diff totals keep the diff's inks; only the bar quiets, because the
  numbers are the fact and the bar is only their proportion.

# Implementation notes

- `--group-fill` is gone, including from the sticky group head under the
  scrolling timeline, which now sits on the raised surface.
- `.overview-now__node` is dashed; `.overview-now--quiet` restores a solid
  border so "everything is saved" is not mistaken for unsaved work.
- The status bar's changes count is the same element the project switcher
  describes as its mark; it is now a neutral capsule with the primary ink.

# Validation

- Follow-up after the first commit: the "Discarded changes" card, reviewed
  from the user's screenshot (its solid amber badge was the second loudest
  mark on a screen whose next step was publishing). Option A of two
  (neutral, over keeping the icon amber) was chosen and added to this task
  rather than a new one, at the user's request.

- `pnpm run check` — passed: docs, architecture, TypeScript, 139 frontend
  test files (1,445 tests), build, `cargo fmt`, Clippy and Rust tests (592
  passed, 1 ignored).
- Visual check: the agent's access to the GitOdile window was declined and the
  Overview cannot open a project in the browser preview, so the user checked
  each pass in the running app. Their reviews drove the later changes (the
  "Publish up to here" hover, History's boundary, the selected half-filled
  node) and they approved the final result.
- Final review of the whole diff before committing found and fixed:
  - History's boundary compared the upstream with the branch stood on rather
    than the scoped branch (`publishedOnLabel`), now covered by a test;
  - the remote's name could not ellipsize inside an inline-flex box;
  - forced-colours mode kept the nodes' gradients in theme colours; they now
    use system colours, and the local group no longer draws an edge there;
  - Overview's incoming row still hovered in blue while resting without fill.
