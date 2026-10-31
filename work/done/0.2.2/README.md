# Completed work — 0.2.2

46 completed task records. IDs, parents, completion dates and
original qualification/deferment notes are preserved.

## Version evidence

These completed phases first appear at retained tag `v0.2.2` (`3e8f04f`),
after `v0.1.0`. At that snapshot the package still says
`0.2.0-preview.2`; accepted [ADR 0019](../../../docs/adr/0019-publish-updates-through-one-channel.md)
later normalized the historical tag/notes names to `0.2.N`. The archive uses
those canonical historical names, not new prerelease folders.

[0.2.1](../../../docs/release/notes/v0.2.1.md) was an untagged development
preparation, without a produced package/public release, and was superseded by
0.2.2. [0.2.2](../../../docs/release/notes/v0.2.2.md) was a controlled updater
qualification build, not a supported public release. This folder must not be
read as platform qualification or publication evidence.

Retained tags 0.2.3, 0.2.4, 0.2.5, 0.2.8, 0.2.9, 0.2.10, 0.2.11 and 0.2.12
add no separately completed records from the remaining archive cohort. Their
release history stays in [release notes](../../../docs/release/notes/README.md);
no empty task folders or invented tasks are added for those markers.

## Tasks

| ID | Completed | Task |
| --- | --- | --- |
| 065-9-1 | 2026-09-09 | [Define updater contracts and supported installations](065-9-1-contracts-and-targets.md) |
| 065-9-2 | 2026-09-10 | [Protect operations and drafts before app installation](065-9-2-install-admission-and-drafts.md) |
| 065-9-3 | 2026-09-10 | [Implement the native signed updater lifecycle](065-9-3-native-updater.md) |
| 065-9-4 | 2026-09-10 | [Integrate update controls and preferences](065-9-4-updater-interface.md) |
| 083 | 2026-08-28 | [Make every single-line control a capsule](083-capsule-single-line-controls.md) |
| 084 | 2026-08-28 | [Wire the status bar to real project state](084-wire-real-project-status-bar.md) |
| 085 | 2026-08-28 | [Add a safe status-bar branch switcher and improve legibility](085-status-bar-branch-switcher-and-legibility.md) |
| 086 | 2026-08-28 | [Open local release details from the status bar](086-release-details-from-status-bar.md) |
| 087 | 2026-08-28 | [Add search and favourites to quick branch switching](087-search-and-favourite-branches.md) |
| 087-1 | 2026-08-29 | [Polish quick branch switcher details](087-1-polish-quick-branch-switchers.md) |
| 088 | 2026-08-29 | [Make project refresh contextual instead of repetitive](088-contextual-project-refresh.md) |
| 089 | 2026-08-30 | [Disclose stale Branches and offer automatic remote checks](089-branches-and-automatic-remote-checks.md) |
| 090 | 2026-08-30 | [Give the changelog its own surface and return About to identity](090-changelog-as-its-own-surface.md) |
| 091 | 2026-08-30 | [Turn the no-project screen into a welcome launcher](091-welcome-launcher-for-the-no-project-screen.md) |
| 092 | 2026-08-30 | [Offer recent projects on the welcome screen](092-recent-projects-on-the-welcome-screen.md) |
| 093 | 2026-08-30 | [Open a project by dropping a folder on the window](093-open-a-project-by-dropping-a-folder.md) |
| 094 | 2026-08-30 | [Give History's empty and error states the shared glyph tile](094-history-empty-states-adopt-the-shared-pattern.md) |
| 095 | 2026-08-30 | [Star a recent project to keep it on the welcome screen](095-favourite-recent-projects.md) |
| 096 | 2026-08-30 | [Give message dialogs the app's own shell, and say that folders can be dropped](096-message-dialogs-and-the-drop-hint.md) |
| 097 | 2026-08-30 | [Expand settings with default branch, hooks, fetch cadence and formats](097-expand-settings-with-git-and-format-controls.md) |
| 098 | 2026-08-31 | [Per-project settings for remote, ignore files and identity](098-per-project-settings.md) |
| 099 | 2026-09-01 | [Close the visual-system refactor across the whole app](099-close-the-visual-system-refactor.md) |
| 100 | 2026-09-01 | [Notification centre in the titlebar](100-notification-center.md) |
| 101 | 2026-09-01 | [Anchored popups actually take focus when they open](101-anchored-popups-take-focus.md) |
| 103 | 2026-09-02 | [Rename the product and application to GitOdile](103-rename-product-to-gitodile.md) |
| 104 | 2026-09-02 | [About credits the stack and marks the machine](104-about-credits-the-stack-and-the-machine.md) |
| 105 | 2026-09-03 | [Unify the theme-change animation, ring the bell, fix the tooltip lifecycle](105-theme-change-animation-and-tooltip-lifecycle.md) |
| 106 | 2026-09-03 | [Give controls a size scale and settle every button at 38px](106-control-size-scale.md) |
| 107 | 2026-09-05 | [Give typography a scale the way shape and size have one](107-type-scale.md) |
| 108 | 2026-09-03 | [Report an issue opens a real, prefilled public tracker](108-report-an-issue-opens-a-public-tracker.md) |
| 109 | 2026-09-03 | [Let people turn off interface motion](109-reduce-interface-motion.md) |
| 110 | 2026-09-04 | [A bug report carries what the app did, not only what it runs on](110-diagnostic-log-for-issue-reports.md) |
| 111 | 2026-09-04 | [A changed image is shown as an image, and an SVG as a drawing](111-see-changed-images-and-svgs.md) |
| 112 | 2026-09-06 | [Give Changes its space back, and make discarding truly recoverable](112-changes-screen-density-and-a-recoverable-discard.md) |
| 113 | 2026-09-06 | [Filter saved versions by author, date, and file](113-filter-saved-versions-by-author-date-and-file.md) |
| 114 | 2026-09-07 | [Give History the shape Changes has, and a timeline that holds still](114-history-screen-structure-and-a-quieter-timeline.md) |
| 115 | 2026-09-07 | [Make Changes and History read as one pair, and put History under Changes](115-changes-and-history-read-as-one-pair.md) |
| 116 | 2026-09-07 | [Give the History card one strip, and stop clipping the rail's labels](116-one-strip-on-the-history-card-and-a-label-that-fits.md) |
| 117 | 2026-09-07 | [Make Branches the third panelled screen, and let it manage a branch honestly](117-branches-as-the-third-panelled-screen.md) |
| 118 | 2026-09-08 | [Connect branch context across Changes, History, and Branches](118-connect-branch-context-across-workspace.md) |
| 119 | 2026-09-08 | [Say which branch you are on, and which one you are reading](119-say-which-branch-you-are-on-and-which-one-you-are-reading.md) |
| 120 | 2026-09-08 | [Draw our own calendar](120-draw-our-own-calendar.md) |
| 121 | 2026-09-08 | [Narrow the Changes list](121-narrow-the-changes-list.md) |
| 122 | 2026-09-08 | [Make Branches read like Changes and History](122-branches-read-like-changes-and-history.md) |
| 123 | 2026-09-09 | [Save from the file list, and publish in the same step](123-save-from-the-file-list-and-publish-in-the-same-step.md) |
| 124 | 2026-09-09 | [Create a branch from the list, alongside the full dialog](124-create-a-branch-from-the-list.md) |

Archive rules and attribution policy are in [work/README.md](../../README.md).
