# Completed work — 0.3.0

26 completed task records. IDs, parents, completion dates and
original qualification/deferment notes are preserved.

## Version evidence

These completed task phases first appear in `v0.3.0` (`df1ddb9`) after the
retained 0.2.x snapshots. The two explicit scope exceptions are 142/143:
they close the one-channel 0.3.0 release, but their administrative move to done
landed afterward in `45115ff`. They belong here, not in 0.4.0.

The updater epic and its late-closed children span development and validation
across 0.2.x. Their first retained *completed-record* snapshot is 0.3.0;
that does not erase the earlier code or 0.2.x validation receipts, or claim
that every historical feature shipped in 0.3.0. In particular, 065-9-12 says
its channel selector was added after 0.2.12 was tagged, and ADR 0019 later
retired that prototype before 0.3.0 shipped. Original records and unchecked
qualification/operational criteria stay intact; receiving task 065-9-13 still
owns the evidence those tasks did not complete.

The unpublished provisional 0.2.13/0.3.0 preview plans do not become additional
release archives. See [ADR 0019](../../../docs/adr/0019-publish-updates-through-one-channel.md)
and [0.3.0 notes](../../../docs/release/notes/v0.3.0.md).

## Tasks

| ID | Completed | Task |
| --- | --- | --- |
| 065-9 | 2026-09-16 | [Update GitOdile safely from signed public releases](065-9-signed-application-updates.md) |
| 065-9-5 | 2026-09-16 | [Build signed release artifacts in protected CI](065-9-5-signed-builds.md) |
| 065-9-6 | 2026-09-16 | [Publish public releases and stable preview feeds](065-9-6-public-release-publishing.md) |
| 065-9-7 | 2026-09-16 | [Qualify signed upgrades and release operations](065-9-7-updater-qualification.md) |
| 065-9-8 | 2026-09-16 | [Qualify controlled Windows and Linux updater delivery](065-9-8-public-windows-linux-qualification.md) |
| 065-9-9 | 2026-09-16 | [Add trusted Windows signing after 1.0.0](065-9-9-authenticode-public-delivery.md) |
| 065-9-10 | 2026-09-16 | [Prepare releases automatically after approved version-branch merges](065-9-10-merge-driven-release-preparation.md) |
| 065-9-11 | 2026-09-16 | [Harden the updater client and publisher after the first public preview updates](065-9-11-updater-client-and-publisher-hardening.md) |
| 065-9-12 | 2026-09-15 | [Let the user choose the update channel, and finish the release-notes automation](065-9-12-update-channel-choice-and-release-notes-automation.md) |
| 102 | 2026-09-26 | [Refine the crocodile mark and its small-size variants](102-refine-crocodile-brand-mark.md) |
| 125 | 2026-09-21 | [History in one view, a shared diff find, and branch actions from the switcher](125-history-single-view-and-branch-actions.md) |
| 126 | 2026-09-21 | [Work is one screen, with Changes and History as its two tabs](126-work-is-one-screen-with-changes-and-history-as-tabs.md) |
| 128 | 2026-09-22 | [About leads with the identity and reports whether the build is current](128-about-leads-with-the-identity-and-reports-whether-the-build-is-current.md) |
| 129 | 2026-09-22 | [The Changes empty state follows the repository state](129-changes-empty-state-follows-the-repo.md) |
| 132 | 2026-09-27 | [Return to the welcome screen while projects are open](132-return-to-the-welcome-screen.md) |
| 133 | 2026-09-27 | [Rework the keyboard-shortcuts sheet](133-keyboard-shortcuts-sheet.md) |
| 134 | 2026-09-27 | [Add a project-scoped Git console for safe read-only shortcuts](134-project-git-console.md) |
| 135 | 2026-09-28 | [Overview wears the project's icon and says each fact once, and History says You](135-overview-header-and-journey-polish.md) |
| 136 | 2026-09-28 | [Publish opens at once, and every first load draws the shape of what is coming](136-publish-opens-at-once-and-loading-draws-the-shape.md) |
| 137 | 2026-09-28 | [Save opens at once, and its plan is cheaper](137-save-opens-at-once-and-plans-faster.md) |
| 138 | 2026-09-29 | [Type Git commands in the console, by permission tier](138-console-git-commands.md) |
| 138-1 | 2026-09-29 | [Type read-only Git commands in the console](138-1-type-read-only-git-commands.md) |
| 138-2 | 2026-09-29 | [Advanced console mode with previewed local and remote changes](138-2-advanced-mode-local-and-remote-changes.md) |
| 141 | 2026-10-01 | [Adopt the v4 mascot, one amber app icon, and its motion and console art](141-v4-mascot-amber-icon-and-console-art.md) |
| 142 | 2026-10-01 | [Publish and update through one release channel](142-single-update-channel.md) |
| 143 | 2026-10-01 | [Turn release/0.3.0-preview.1 into release/0.3.0 and ship it on the single channel](143-ship-0-3-0-on-the-single-channel.md) |

Archive rules and attribution policy are in [work/README.md](../../README.md).
