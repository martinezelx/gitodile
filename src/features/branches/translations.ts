import type { BranchNameIssue } from "./branchNames";

export interface BranchesTranslations {
  branchesTitle: string;
  branchesSearchPlaceholder: string;
  branchesSearchAriaLabel: string;
  branchesLoading: string;
  branchesErrorLoading: string;
  branchesRetry: string;
  branchesActiveLabel: string;
  branchesEmptyOthers: string;
  branchesNoSearchMatches: string;
  branchesTruncatedNote: (visible: number, total: number) => string;
  branchesUnreadableNote: (count: number) => string;
  branchesQuickSwitchChangeLabel: (current: string) => string;
  branchesQuickSwitchTitle: string;
  branchesQuickSwitchSearchPlaceholder: string;
  branchesQuickSwitchSearchEmpty: string;
  branchesQuickSwitchFavourite: (name: string) => string;
  branchesQuickSwitchUnfavourite: (name: string) => string;
  branchesQuickSwitchFavouriteHint: string;
  branchesQuickSwitchUnfavouriteHint: string;
  branchesQuickSwitchFavouritesOnly: string;
  branchesQuickSwitchFavouritesOnlyOff: string;
  branchesQuickSwitchFavouritesEmpty: string;
  branchesQuickSwitchEmpty: string;
  branchesQuickSwitchSeeAll: string;
  branchesQuickSwitchNew: string;
  /** The quick switch's offer to make the branch a search named, when no branch
   * has that name, and what pressing it leads to. */
  branchesQuickSwitchCreateNamed: (name: string) => string;
  branchesQuickSwitchCreateHint: string;
  branchesQuickSwitchActions: (name: string) => string;
  branchesQuickSwitchBack: string;
  branchesMergeInto: (name: string) => string;
  branchesRebaseOnto: (name: string) => string;
  branchesCompareWith: (name: string) => string;
  branchesSoon: string;
  branchesActionsSoon: string;
  branchesDetachedTitle: string;
  branchesDetachedDescription: string;
  branchesDetachedRecoverButton: string;
  branchesUnbornTitle: string;
  branchesUnbornDescription: string;
  branchesNoUpstreamLabel: string;
  branchesCheckedOutElsewhere: (path: string) => string;
  branchesUniqueCommits: (count: number, main: string) => string;
  branchesSavedLabel: (date: string) => string;
  createBranchTitle: string;
  createBranchNameLabel: string;
  createBranchNamePlaceholder: string;
  createBranchSwitchLabel: string;
  createBranchDetachedNote: string;
  createBranchStartsAt: (shortCommit: string, subject: string) => string;
  createBranchConfirm: string;
  /** The confirmation step's way back to the form: it does not close. */
  createBranchBack: string;
  createBranchToast: (name: string, switched: boolean) => string;
  createBranchCreating: string;
  /** The quick create box docked under the Branches list — the way this screen
   * starts a branch. Its
   * own strings for the name field, the switch checkbox and the confirm
   * button, distinct from `createBranch*`'s: the box and the full
   * dialog can be on screen together, and sharing an accessible name across
   * two live controls would be as ambiguous to a screen reader as it is to
   * an automated query. */
  branchesQuickCreateNameLabel: string;
  branchesQuickCreateClose: string;
  /** The name field's question, asked the way the save box asks "What
   * changed?" — the name is what the branch is for. */
  branchesQuickCreateNamePlaceholder: string;
  /** Under the open field while it is empty: how a name is written, by
   * example. */
  /** Before the example name; the name itself follows in mono. */
  branchesQuickCreateNameHint: string;
  branchesQuickCreateNameExample: string;
  /** The label before the main/selected capsules — shown only when the
   * default branch and the one highlighted in the list actually differ, so
   * there is a real choice to name. */
  branchesQuickCreateSourceLabel: string;
  branchesQuickCreateSwitchLabel: string;
  /** The box's button, named apart from the dialog's own "Create" for the
   * same reason as the name field above, and saying the consequence: it
   * reads "Create and switch" whenever the press also switches. */
  branchesQuickCreateConfirmLabel: string;
  branchesQuickCreateConfirmAndSwitch: string;
  /** The button at rest, beside the one-row field: a word short enough to
   * leave the field's question whole. Its accessible name stays the
   * consequence. */
  branchesQuickCreateConfirmShort: string;
  branchesQuickCreateSuccess: (name: string, switched: boolean) => string;
  /** The name field's example when the project's own branches share a prefix
   * (`fix/…`), so it teaches the convention the project already has. */
  branchesQuickCreateNameExampleFor: (prefix: string) => string;
  /** Why a typed name would be refused, said under the field before the
   * press — see `checkBranchName`. */
  branchesNameIssue: (issue: BranchNameIssue) => string;
  /** One branch, with no name in it: the target is the subtitle. */
  switchBranchTitle: string;
  switchBranchTarget: (to: string) => string;
  switchBranchLoading: string;
  switchBranchChangedFiles: (count: number) => string;
  switchBranchChangedFilesTruncated: (visible: number, total: number) => string;
  switchBranchDirtyDescription: string;
  switchBranchSaveVersionAction: string;
  switchBranchNewBranchAction: string;
  switchBranchConfirm: string;
  switchBranchDirtySaveTitle: string;
  switchBranchDirtySaveNote: string;
  switchBranchDirtyNewTitle: string;
  switchBranchDirtyNewNote: string;
  switchBranchRecoveryNote: (from: string) => string;
  switchBranchToast: (to: string) => string;
  switchBranchSwitching: string;
  branchesFilterStateGroup: string;
  branchesFilterPrefixGroup: string;
  branchesFilterClear: string;
  branchesGroupInProgress: string;
  branchesGroupCleanUp: string;
  branchesGroupLabel: (name: string, count: number) => string;
  branchesCleanUpHint: string;
  /** The clean-up block's action: verb, count, and an ellipsis for the
   * preview it opens. */
  branchesCleanUpAction: (count: number) => string;
  branchesCleanUpActionNote: string;
  branchesSortRecent: string;
  branchesSortName: string;
  branchesSortUnpublished: string;
  branchesSwitchShort: string;
  branchesSwitchToBranchLabel: (name: string) => string;
  branchesSyncUpToDate: string;
  branchesSyncNoUpstream: string;
  branchesSyncGone: string;
  branchesSyncAhead: (count: number) => string;
  branchesSyncBehind: (count: number) => string;
  branchesSyncAheadBehind: (ahead: number, behind: number) => string;
  /** What each state glyph on a Branches row means, as its tooltip — a sentence,
   * where the short labels above are what a screen reader hears. */
  branchesGlyphActive: string;
  branchesGlyphLocalOnly: string;
  branchesGlyphGone: string;
  branchesGlyphProtected: string;
  branchesDeleteReadyTooltip: (name: string) => string;
  /** Delete on a branch whose work reached the main branch as copies. */
  branchesDeleteCopiedTooltip: (name: string, base: string) => string;
  branchesDeleteBlockedTooltip: (name: string) => string;
  branchesDeleteElsewhereTooltip: (name: string) => string;
  branchesListAriaLabel: string;
  branchesDetailAriaLabel: (name: string) => string;
  branchesBackToList: string;
  branchesFiltersLabel: string;
  branchesFiltersActive: (count: number) => string;
  branchesFiltersActiveCount: (count: number) => string;
  branchesFilterSortGroup: string;
  branchesStateTracking: string;
  branchesLatestSavedLabel: string;
  branchesAuthorYouNamed: (name: string) => string;
  branchesVersionsTitle: string;
  /** The Branches detail's drawing of where the branch left the main branch, and
   * the sentence under it that carries its numbers. */
  branchesRouteTitle: string;
  /** The Branches detail's "What you can do": what the selected branch can do with
   * the active branch, or the active branch with the main branch. */
  branchesActionsTitle: string;
  branchesMergeFrom: (base: string) => string;
  branchesActionUpdateFromDetail: (base: string) => string;
  branchesActionUpdateFromCurrent: (base: string) => string;
  branchesActionUpdateFromNews: (base: string, count: number, formatted: string) => string;
  branchesActionUpToDate: string;
  branchesActionBringIntoBase: (base: string, count: number | null, formatted: string) => string;
  branchesActionBringIntoActive: string;
  branchesActionMoveOntoDetail: string;
  branchesActionCompareTotals: (files: number, filesFormatted: string, additions: string, deletions: string) => string;
  branchesActionCompareDetail: string;
  branchesActionCompareBranchesDetail: string;
  /** The saved-versions list's head over the versions only here, and the
   * remote's mark where its copy begins — History's words. */
  branchesLocalGroup: string;
  branchesBoundaryPublished: string;
  /** The way to publish beside the count waiting and over the versions only
   * here. */
  branchesPublish: string;
  branchesRouteLoading: string;
  branchesRouteSummary: (facts: {
    base: string;
    date: string;
    own: string;
    since: string | null;
  }) => string;
  branchesRouteMerged: (base: string, since: string) => string;
  branchesRouteReturned: (facts: {
    base: string;
    left: string;
    back: string;
    own: string;
    since: string | null;
  }) => string;
  branchesRouteSame: (base: string) => string;
  /** A branch whose work came back as copies — squashed or rebased — so its own
   * versions are still only on it. */
  branchesRouteCopied: (facts: {
    base: string;
    left: string;
    back: string;
    own: string;
    squashed: boolean;
    since: string | null;
  }) => string;
  branchesOpenVersionLabel: (subject: string) => string;
  branchesPublishedPill: string;
  branchesUnpublishedPill: string;
  branchesRelationshipTitle: string;
  branchesRelationshipSyncedDetail: (upstream: string) => string;
  branchesRelationshipAheadDetail: (upstream: string) => string;
  branchesRelationshipBehindDetail: (upstream: string) => string;
  branchesRelationshipDivergedDetail: (upstream: string) => string;
  branchesRelationshipGoneDetail: (upstream: string) => string;
  branchesRelationshipLocalOnlyDetail: string;
  branchesRelationshipActiveTitle: string;
  branchesRelationshipActiveDetail: string;
  branchesRelationshipUniqueDetail: (main: string) => string;
  branchesRelationshipMergedTitle: (main: string) => string;
  branchesRelationshipMergedDetail: (main: string) => string;
  branchesRelationshipElsewhereTitle: string;
  branchesHistoryDescription: string;
  branchesHistoryScopedDescription: (name: string) => string;
  branchesHistoryAction: string;
  /** One branch, with no name in it: the branch is the subtitle. */
  deleteBranchTitle: string;
  deleteBranchTarget: (name: string) => string;
  deleteBranchBlockedTitle: string;
  deleteBranchBlockedUniqueLead: (name: string) => string;
  deleteBranchBlockedUniqueOptionPublish: string;
  deleteBranchBlockedUniqueOptionMerge: string;
  deleteBranchBlockedUniqueOptionKeep: string;
  deleteBranchBlockedElsewhereLead: string;
  deleteBranchBlockedActiveLead: string;
  deleteBranchBlockedDefaultLead: string;
  deleteBranchBlockedOperationLead: (name: string) => string;
  deleteBranchOpenConflictsAction: string;
  deleteBranchSwitchAction: string;
  deleteBranchSafeLead: (branch: string) => string;
  /** A branch whose work reached the main branch only as copies: what is on the
   * main branch already, and the recovery point kept for its originals. */
  deleteBranchCopiedLead: (base: string, squashed: boolean) => string;
  deleteBranchCopiedRecovery: string;
  deleteBranchConfirm: string;
  deleteBranchConflictTitle: string;
  deleteBranchDeletedToast: (name: string, extra: "recovery" | "remote" | "remote-failed" | null) => string;
  deleteBranchDeleting: string;
  deleteBranchRemoteLabel: string;
  deleteBranchRemoteOnNote: string;
  deleteBranchRemoteOffNote: string;
  cleanUpBranchesTitle: string;
  cleanUpBranchesBlockedTitle: string;
  cleanUpBranchesLoading: string;
  cleanUpBranchesLead: string;
  cleanUpBranchesNothing: string;
  cleanUpBranchesListLabel: string;
  cleanUpBranchesSelectAll: (chosen: number, total: number) => string;
  cleanUpBranchesKeptOn: (branch: string, more: number) => string;
  cleanUpBranchesCapped: (shown: number, total: number) => string;
  cleanUpBranchesExcludedHeading: (count: number) => string;
  cleanUpBranchesRemoteLabel: (count: number) => string;
  cleanUpBranchesRemoteOnNote: string;
  cleanUpBranchesRemoteOffNote: string;
  /** Why the published-copies option is held back: no chosen branch has one. */
  cleanUpBranchesRemoteNoneNote: string;
  cleanUpBranchesRecoveryFact: string;
  cleanUpBranchesNoneChosen: string;
  cleanUpBranchesConfirm: (count: number) => string;
  /** The primary held back while the plan is read: no count yet, since the
   * plan may leave some of the asked-for branches out. */
  cleanUpBranchesConfirmPending: string;
  cleanUpBranchesDeleting: string;
  cleanUpBranchesDoneTitle: string;
  cleanUpBranchesSummary: (deleted: number, skipped: number, remoteFailed: number) => string;
  cleanUpBranchesSkippedHeading: string;
  cleanUpBranchesRemoteFailedHeading: string;
  cleanUpBranchesRemoteRefused: string;
  cleanUpBranchesRecoveryKept: string;
  cleanUpBranchesToast: (deleted: number, remote: boolean) => string;
  renameBranchTitle: (name: string) => string;
  /** How a blocked app update names an unfinished rename; the update quotes
   * it, so it carries no quotes of its own. */
  renameBranchInstallBlockerLabel: (name: string) => string;
  renameBranchNote: string;
  renameBranchUpstreamNote: (upstream: string) => string;
  renameBranchConfirm: string;
  /** The branch under the name while it is being edited in the Branches detail
   * strip — the short form of the two notes above, which it carries whole on
   * its tooltip. */
  branchesRenameInlineNote: string;
  branchesRenameInlineUpstreamNote: (upstream: string) => string;
  renameBranchRenaming: string;
  branchesRenameShort: string;
  branchesDeleteShort: string;
  branchesContextMenuLabel: (name: string) => string;
  branchesCopyName: string;
  branchesNameCopied: string;
  branchesCopyFailed: string;
  branchesRenameBranchLabel: (name: string) => string;
  branchesDefaultBranchChip: string;
  branchesDefaultBranchNote: string;
}
