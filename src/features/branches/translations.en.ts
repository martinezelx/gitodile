import type { BranchesTranslations } from "./translations";

export const en: BranchesTranslations = {
  branchesTitle: "Branches",
  branchesSearchPlaceholder: "Search branches…",
  branchesSearchAriaLabel: "Search branches",
  branchesLoading: "Loading branches…",
  branchesErrorLoading: "Couldn't load this project's branches.",
  branchesRetry: "Try again",
  branchesActiveLabel: "Active",
  branchesEmptyOthers: "No other branches yet.",
  branchesNoSearchMatches: "No branches match that search.",
  branchesTruncatedNote: (visible, total) => `Showing the ${visible} most recent of ${total}.`,
  branchesUnreadableNote: (count) =>
    count === 1
      ? "1 branch is hidden because its name can't be read. Rename it with Git."
      : `${count} branches are hidden because their names can't be read. Rename them with Git.`,
  branchesQuickSwitchChangeLabel: (current) => `Change branch (${current})`,
  branchesQuickSwitchTitle: "Switch branch",
  branchesQuickSwitchSearchPlaceholder: "Search branches…",
  branchesQuickSwitchSearchEmpty: "No branches match that search.",
  branchesQuickSwitchFavourite: (name) => `Add ${name} to favorites`,
  branchesQuickSwitchUnfavourite: (name) => `Remove ${name} from favorites`,
  branchesQuickSwitchFavouriteHint: "Add to favorites",
  branchesQuickSwitchUnfavouriteHint: "Remove from favorites",
  branchesQuickSwitchFavouritesOnly: "Show favorites only",
  branchesQuickSwitchFavouritesOnlyOff: "Show all branches",
  branchesQuickSwitchFavouritesEmpty: "No favorites yet. Star a branch to keep it here.",
  branchesQuickSwitchEmpty: "No other branches yet.",
  branchesQuickSwitchSeeAll: "Manage branches",
  branchesQuickSwitchNew: "New branch",
  branchesQuickSwitchCreateNamed: (name) => `Create “${name}”`,
  branchesQuickSwitchCreateHint: "New branch — choose where it starts next",
  branchesQuickSwitchActions: (name) => `What “${name}” can do`,
  branchesQuickSwitchBack: "Back",
  branchesMergeInto: (name) => `Merge into “${name}”`,
  branchesRebaseOnto: (name) => `Rebase “${name}” onto this`,
  branchesCompareWith: (name) => `Compare with “${name}”`,
  branchesSoon: "Soon",
  branchesActionsSoon: "Merge, rebase and compare are coming soon.",
  branchesDetachedTitle: "Not on a branch",
  branchesDetachedDescription: "You're on a specific saved version, so create a branch here to keep this work easy to find.",
  branchesDetachedRecoverButton: "Create a branch here",
  branchesUnbornTitle: "Save a version first",
  branchesUnbornDescription: "This branch has no saved versions yet, so there's nothing to start from.",
  branchesNoUpstreamLabel: "Local only",
  branchesCheckedOutElsewhere: (path) => `Open in another workspace (${path}). Switch to it from there.`,
  branchesUniqueCommits: (count, main) =>
    count === 1 ? `1 version not on ${main}` : `${count} versions not on ${main}`,
  branchesSavedLabel: (date) => `Saved ${date}`,
  createBranchTitle: "New branch",
  createBranchNameLabel: "Name",
  createBranchNamePlaceholder: "e.g. feature/new-onboarding",
  createBranchSwitchLabel: "Switch to the new branch",
  createBranchDetachedNote: "You're not on a branch, so you'll switch to the new one to keep this work easy to find.",
  createBranchStartsAt: (shortCommit, subject) => `Starts at ${shortCommit} — “${subject}”.`,
  createBranchConfirm: "Create branch",
  createBranchBack: "Back",
  createBranchToast: (name, switched) => switched ? `“${name}” created, and you're on it now.` : `“${name}” created.`,
  createBranchCreating: "Creating…",
  branchesQuickCreateNameLabel: "New branch name",
  branchesQuickCreateClose: "Close create branch form",
  branchesQuickCreateNamePlaceholder: "What will you work on?",
  branchesQuickCreateNameHint: "Like",
  branchesQuickCreateNameExample: "feature/new-feature",
  branchesQuickCreateSourceLabel: "Create from",
  branchesQuickCreateSwitchLabel: "Switch to it",
  branchesQuickCreateConfirmLabel: "Create branch",
  branchesQuickCreateConfirmShort: "Create",
  branchesQuickCreateConfirmAndSwitch: "Create and switch",
  branchesQuickCreateSuccess: (name, switched) =>
    switched ? `Created “${name}” and switched to it.` : `Created “${name}”.`,
  branchesQuickCreateNameExampleFor: (prefix) => `${prefix}/short-name`,
  branchesNameIssue: (issue) => {
    switch (issue.kind) {
      case "space":
        return "Use hyphens instead of spaces, like my-branch.";
      case "character":
        return `Names can't contain “${issue.character}”.`;
      case "control":
        return "The name has an invisible character. Retype it.";
      case "sequence":
        return `Names can't contain “${issue.sequence}”.`;
      case "leading":
        return `Names can't start with “${issue.character}”.`;
      case "part-leading-dot":
        return "No part of the name can start with a dot.";
      case "trailing":
        return `Names can't end with “${issue.character}”.`;
      case "lock-suffix":
        return "No part of the name can end with “.lock”.";
      case "reserved":
        return `“${issue.name}” is reserved by Git.`;
      case "taken":
        return `A branch named “${issue.name}” already exists.`;
      case "case-collision":
        return `“${issue.existing}” already exists, and names that differ only in capitals clash on some systems.`;
    }
  },
  switchBranchTitle: "Switch branch",
  switchBranchTarget: (to) => `You'll move to “${to}”.`,
  switchBranchLoading: "Comparing branches…",
  switchBranchChangedFiles: (count) =>
    count === 1 ? "1 file will change." : `${count} files will change.`,
  switchBranchChangedFilesTruncated: (visible, total) => `Showing ${visible} of ${total} changed files.`,
  switchBranchDirtyDescription: "Choose what to do with your unsaved changes.",
  switchBranchSaveVersionAction: "Save version",
  switchBranchNewBranchAction: "New branch with these changes",
  switchBranchConfirm: "Switch branch",
  switchBranchDirtySaveTitle: "Save them as a version",
  switchBranchDirtySaveNote: "They're saved on the current branch, then you switch.",
  switchBranchDirtyNewTitle: "Take them to a new branch",
  switchBranchDirtyNewNote: "The current branch stays as it was.",
  switchBranchRecoveryNote: (from) => `“${from}” stays as it is, and switching back returns these files.`,
  switchBranchToast: (to) => `You're now on “${to}”.`,
  switchBranchSwitching: "Switching…",
  branchesFilterStateGroup: "State",
  branchesFilterPrefixGroup: "Name prefix",
  branchesFilterClear: "Clear filters",
  branchesGroupInProgress: "In progress",
  branchesGroupCleanUp: "Ready to clean up",
  branchesGroupLabel: (name, count) => `${name}, ${count === 1 ? "1 branch" : `${count} branches`}`,
  branchesCleanUpHint: "Safe to delete",
  branchesCleanUpAction: (count) => (count === 1 ? "Clean up 1 branch…" : `Clean up ${count} branches…`),
  branchesCleanUpActionNote: "Finished: their work is on the main branch",
  branchesSortRecent: "Recent",
  branchesSortName: "Name",
  branchesSortUnpublished: "Local first",
  branchesSwitchShort: "Switch",
  branchesSwitchToBranchLabel: (name) => `Switch to “${name}”`,
  branchesSyncUpToDate: "Up to date with the remote",
  branchesSyncNoUpstream: "Not tracking a remote",
  branchesSyncGone: "Remote branch deleted",
  branchesSyncAhead: (count) => (count === 1 ? "1 not published" : `${count} not published`),
  branchesSyncBehind: (count) => (count === 1 ? "1 to get" : `${count} to get`),
  branchesSyncAheadBehind: (ahead, behind) => `${ahead} not published, ${behind} to get`,
  branchesGlyphActive: "Active — the branch you're working on",
  branchesGlyphLocalOnly: "Local only — never published, so it's only on this computer",
  branchesGlyphGone: "Its remote branch was deleted",
  branchesGlyphProtected: "Main branch — it can't be renamed or deleted",
  branchesDeleteCopiedTooltip: (name, base) =>
    `Delete “${name}”. Its work is already on ${base}; GitOdile keeps a recovery point first.`,
  branchesDeleteReadyTooltip: (name) => `Delete “${name}”. Its work is already kept elsewhere.`,
  branchesDeleteBlockedTooltip: (name) =>
    `“${name}” has work that exists nowhere else. Open it to see your options.`,
  branchesDeleteElsewhereTooltip: (name) =>
    `“${name}” is open in another workspace, so it can't be deleted here.`,
  branchesListAriaLabel: "Branches",
  branchesDetailAriaLabel: (name) => `Details for “${name}”`,
  branchesBackToList: "Back to branches",
  branchesFiltersLabel: "Filter and sort",
  branchesFiltersActive: (count) =>
    count === 1 ? "Filter and sort (1 filter on)" : `Filter and sort (${count} filters on)`,
  branchesFiltersActiveCount: (count) => (count === 1 ? "1 filter on" : `${count} filters on`),
  branchesFilterSortGroup: "Sort by",
  branchesStateTracking: "Tracking a remote",
  branchesLatestSavedLabel: "Latest saved",
  branchesAuthorYouNamed: (name) => `You (${name})`,
  branchesVersionsTitle: "Saved versions",
  branchesRouteTitle: "Route",
  branchesActionsTitle: "What you can do",
  branchesMergeFrom: (base) => `Merge “${base}” into this`,
  branchesActionUpdateFromDetail: (base) => `Brings ${base}'s newer versions into this branch.`,
  branchesActionUpdateFromCurrent: (base) => `${base} hasn't moved since this branch left it.`,
  branchesActionUpdateFromNews: (base, count, formatted) =>
    count === 1 ? `${base} has 1 newer version to bring in.` : `${base} has ${formatted} newer versions to bring in.`,
  branchesActionUpToDate: "Up to date",
  branchesActionBringIntoBase: (base, count, formatted) =>
    count === null
      ? `Adds this branch's versions to ${base} as one new saved version.`
      : count === 1
        ? `Adds this branch's version to ${base} as one new saved version.`
        : `Adds this branch's ${formatted} versions to ${base} as one new saved version.`,
  branchesActionBringIntoActive: "Adds its versions to the branch you're working on as one new saved version.",
  branchesActionMoveOntoDetail: "Replays your branch's own versions after this one's latest.",
  branchesActionCompareTotals: (files, filesFormatted, additions, deletions) =>
    `${files === 1 ? "1 file" : `${filesFormatted} files`} changed since it left · +${additions} −${deletions}`,
  branchesActionCompareDetail: "See what changed since it left, file by file.",
  branchesActionCompareBranchesDetail: "See what differs between the two branches, file by file.",
  branchesLocalGroup: "On this computer",
  branchesBoundaryPublished: "Published",
  branchesPublish: "Publish",
  branchesRouteLoading: "Reading where this branch left main…",
  branchesRouteSummary: ({ base, date, own, since }) =>
    `Left ${base}${date ? ` on ${date}` : ""}. ${own === "1" ? "1 version" : `${own} versions`} of its own. ${since ? `${base} has ${since} new ${since === "1" ? "version" : "versions"} since.` : `${base} hasn't moved since.`}`,
  branchesRouteMerged: (base, since) =>
    `All its work is on ${base}, which has ${since} new ${since === "1" ? "version" : "versions"} since.`,
  branchesRouteSame: (base) => `Same point as ${base}. No versions of its own yet.`,
  branchesRouteCopied: ({ base, left, back, own, squashed, since }) =>
    `Left ${base}${left ? ` on ${left}` : ""}. Its work came back${back ? ` on ${back}` : ""} ${
      squashed ? "as one combined version" : "as copies"
    }; the ${own === "1" ? "original is" : `${own} originals are`} only on this branch. ${
      since ? `${base} has ${since} new ${since === "1" ? "version" : "versions"} since.` : `${base} hasn't moved since.`
    }`,
  branchesRouteReturned: ({ base, left, back, own, since }) =>
    `Left ${base}${left ? ` on ${left}` : ""} and came back${back ? ` on ${back}` : ""} with ${
      own === "1" ? "1 version" : `${own} versions`
    }. ${since ? `${base} has ${since} new ${since === "1" ? "version" : "versions"} since.` : `${base} hasn't moved since.`}`,
  branchesOpenVersionLabel: (subject) => `Open “${subject}” in History`,
  branchesPublishedPill: "Published",
  branchesUnpublishedPill: "Not published yet",
  branchesRelationshipTitle: "Relationship",
  branchesRelationshipSyncedDetail: (upstream) => `In sync with ${upstream}.`,
  branchesRelationshipAheadDetail: (upstream) => `Some versions aren't on ${upstream} yet, so publish to send them.`,
  branchesRelationshipBehindDetail: (upstream) => `${upstream} has newer versions, so get project changes to bring them in.`,
  branchesRelationshipDivergedDetail: (upstream) => `This branch and ${upstream} have both moved on.`,
  branchesRelationshipGoneDetail: (upstream) => `${upstream} no longer exists on the remote, but your work here is still safe.`,
  branchesRelationshipLocalOnlyDetail: "Never published, so it's only on this computer.",
  branchesRelationshipActiveTitle: "The branch you're working on",
  branchesRelationshipActiveDetail: "New versions you save go here.",
  branchesRelationshipUniqueDetail: (main) => `Its work isn't on ${main} yet.`,
  branchesRelationshipMergedTitle: (main) => `Already on ${main}`,
  branchesRelationshipMergedDetail: (main) => `Everything saved here is also on ${main}.`,
  branchesRelationshipElsewhereTitle: "Open in another workspace",
  branchesHistoryDescription: "See every version, compare changes and go back to earlier states.",
  branchesHistoryScopedDescription: (name) => `Shows “${name}” in History without switching to it.`,
  branchesHistoryAction: "Open in History",
  deleteBranchTitle: "Delete this branch?",
  deleteBranchTarget: (name) => `“${name}”`,
  deleteBranchBlockedTitle: "Can't delete it yet",
  deleteBranchBlockedUniqueLead:
    (name) => `“${name}” has versions that aren't anywhere else. You can:`,
  deleteBranchBlockedUniqueOptionPublish: "Publish it, so the work is also on the remote.",
  deleteBranchBlockedUniqueOptionMerge: "Bring its work into another branch.",
  deleteBranchBlockedUniqueOptionKeep: "Or keep it — nothing is lost by waiting.",
  deleteBranchBlockedElsewhereLead:
    "This branch is open in another workspace. Close it there or switch that workspace to another branch, then retry.",
  deleteBranchBlockedActiveLead: "This is the branch you're working on. Switch to another one first.",
  deleteBranchBlockedDefaultLead: "This is the project's main branch, where shared work lives, so GitOdile keeps it.",
  deleteBranchBlockedOperationLead:
    (name) => `Finish or cancel it in your Git tool, then come back to delete “${name}”.`,
  deleteBranchOpenConflictsAction: "Review overlapping changes",
  deleteBranchSwitchAction: "Switch to this branch",
  deleteBranchSafeLead: (branch) => `Its work is already on “${branch}”, so nothing is lost.`,
  deleteBranchCopiedLead: (base, squashed) =>
    `Its work is already on “${base}”, ${squashed ? "combined into one version" : "copied version by version"}.`,
  deleteBranchCopiedRecovery:
    "Its original versions are saved as a recovery point first.",
  deleteBranchConfirm: "Delete branch",
  deleteBranchConflictTitle: "A conflict is unfinished",
  deleteBranchDeletedToast: (name, extra) =>
    extra === "remote-failed"
      ? `“${name}” is gone from this computer, but the published copy is still there.`
      : extra === "remote"
        ? `“${name}” deleted, and its published copy too.`
        : extra === "recovery"
          ? `“${name}” deleted. Its original versions are kept in a recovery point.`
          : `“${name}” deleted.`,
  deleteBranchDeleting: "Deleting…",
  deleteBranchRemoteLabel: "Also delete the published copy",
  deleteBranchRemoteOnNote: "Your team won't see it anymore.",
  deleteBranchRemoteOffNote: "It stays, and your team still sees it.",
  cleanUpBranchesTitle: "Delete these branches?",
  cleanUpBranchesBlockedTitle: "Can't delete them yet",
  cleanUpBranchesLoading: "Checking each branch…",
  cleanUpBranchesLead: "They're finished: their work is already on the main branch, so deleting them loses nothing.",
  cleanUpBranchesNothing: "None of these branches can be deleted right now.",
  cleanUpBranchesListLabel: "Branches to delete",
  cleanUpBranchesSelectAll: (chosen, total) => `All branches (${chosen} of ${total})`,
  cleanUpBranchesKeptOn: (branch, more) => (more > 0 ? `Kept on “${branch}” and ${more} more` : `Kept on “${branch}”`),
  cleanUpBranchesCapped: (shown, total) => `The first ${shown} of ${total} branches. Clean up the rest afterwards.`,
  cleanUpBranchesExcludedHeading: (count) => (count === 1 ? "1 branch left out" : `${count} branches left out`),
  cleanUpBranchesRemoteLabel: (count) =>
    count === 0
      ? "Also delete the published copies"
      : count === 1
        ? "Also delete the published copy"
        : `Also delete the ${count} published copies`,
  cleanUpBranchesRemoteOnNote: "Your team won't see them anymore.",
  cleanUpBranchesRemoteOffNote: "They stay, and your team still sees them.",
  cleanUpBranchesRemoteNoneNote: "None of the chosen branches is published.",
  cleanUpBranchesRecoveryFact: "Each branch's name and last version are kept in a recovery point on this computer first.",
  cleanUpBranchesNoneChosen: "Choose at least one branch to delete.",
  cleanUpBranchesConfirm: (count) => (count === 1 ? "Delete 1 branch" : `Delete ${count} branches`),
  cleanUpBranchesConfirmPending: "Delete branches",
  cleanUpBranchesDeleting: "Deleting…",
  cleanUpBranchesDoneTitle: "Clean-up finished",
  cleanUpBranchesSummary: (deleted, skipped, remoteFailed) =>
    [
      deleted === 1 ? "1 branch deleted" : `${deleted} branches deleted`,
      skipped > 0 ? (skipped === 1 ? "1 kept" : `${skipped} kept`) : null,
      remoteFailed > 0
        ? remoteFailed === 1
          ? "1 published copy is still there"
          : `${remoteFailed} published copies are still there`
        : null,
    ]
      .filter(Boolean)
      .join(", ") + ".",
  cleanUpBranchesSkippedHeading: "Not deleted",
  cleanUpBranchesRemoteFailedHeading: "Deleted here, still published",
  cleanUpBranchesRemoteRefused: "The remote refused to delete it; it may be protected there.",
  cleanUpBranchesRecoveryKept: "Each deleted branch's name and last version are kept in a recovery point on this computer.",
  cleanUpBranchesToast: (deleted, remote) =>
    `${deleted === 1 ? "1 branch deleted" : `${deleted} branches deleted`}${remote ? ", and the published copies too" : ""}. Each one is kept in a recovery point.`,
  renameBranchTitle: (name) => `Rename “${name}”`,
  renameBranchInstallBlockerLabel: (name) => `Rename ${name}`,
  renameBranchNote: "Only the name changes, and every saved version stays where it is.",
  renameBranchUpstreamNote: (upstream) =>
    `It keeps tracking ${upstream}, which keeps its own name. Renaming that is a separate step.`,
  renameBranchConfirm: "Rename",
  branchesRenameInlineNote: "Only the name changes",
  branchesRenameInlineUpstreamNote: (upstream) => `Only the name changes — it still tracks ${upstream}`,
  renameBranchRenaming: "Renaming…",
  branchesRenameShort: "Rename",
  branchesDeleteShort: "Delete",
  branchesContextMenuLabel: (name) => `Actions for “${name}”`,
  branchesCopyName: "Copy name",
  branchesNameCopied: "Name copied",
  branchesCopyFailed: "Couldn't copy the name.",
  branchesRenameBranchLabel: (name) => `Rename “${name}”`,
  branchesDefaultBranchChip: "Main branch",
  branchesDefaultBranchNote: "Shared work lives here, so GitOdile doesn't rename or delete it.",
};

