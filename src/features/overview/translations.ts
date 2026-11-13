export interface OverviewTranslations {
  overviewLocalProject: string;
  overviewSeparateWorkspace: string;
  overviewProjectReady: string;
  overviewWorktreeReady: string;
  overviewUnbornReady: string;
  overviewDetachedReady: string;
  overviewOpenAnotherProject: string;
  overviewHomeLoading: string;
  overviewHomeLocal: string;
  overviewHomeLocalHint: string;
  /** Opens `label` on `service` ("GitHub", or "the web" for another server). */
  overviewHomeOpen: (label: string, service: string) => string;
  overviewHomeRemote: (remote: string) => string;
  overviewHomeWeb: string;
  overviewHomeOpenFailedTitle: string;
  overviewHomeOpenFailedMessage: string;
  overviewBranchDescription: string;
  overviewDetachedDescription: string;
  overviewUnbornDescription: string;
  overviewProjectType: string;
  overviewRepositoryTypeDescription: string;
  overviewWorktreeTypeDescription: string;
  overviewTechnicalDetails: string;
  overviewResolvedRoot: string;
  overviewSelectedFolder: string;
  overviewGitDirectory: string;
  overviewCommonGitDirectory: string;
  /** The header's project icon is a button into project settings' icon
   * section. */
  overviewChangeProjectIcon: string;
  /** The header's folder button, and what it says when the file manager will
   * not open. */
  overviewOpenFolder: string;
  overviewOpenFolderFailedTitle: string;
  overviewOpenFolderFailedMessage: string;
  overviewOpeningTitle: string;
  overviewOpeningDescription: string;
  overviewOpenFailedTitle: string;
  overviewReviewChanges: string;
  overviewSaveVersion: string;
  overviewCheckLocalAgain: string;
  overviewChangesPreviewOpenFile: (path: string) => string;
  overviewJourneyResolve: string;
  overviewJourneyReadyToPublish: (count: number) => string;
  overviewJourneyNoUpstream: string;
  overviewJourneyNoteSave: string;
  overviewJourneyNoteAhead: string;
  overviewJourneyNoteIdle: string;
  overviewPublishAll: (count: number) => string;
  /** The next-step card: the words over its title, by what the card asks. */
  /** The card's three-segment progress, read out: "2 of 3 steps done". */
  overviewNextConflictsTitle: (count: number) => string;
  overviewNextPausedTitle: string;
  overviewNextPausedHint: string;
  overviewNextConflictsHint: string;
  overviewNextSaveTitle: (count: number) => string;
  /** "Publish 2 versions to origin"; without a remote name, "Publish 2 versions". */
  overviewNextPublishTitle: (count: number, remote: string | null) => string;
  overviewNextUpToDateTitle: string;
  overviewNextUpToDateHint: (remote: string | null) => string;
  /** The timeline's first node: the working tree, before any saved version. */
  overviewNowLabel: string;
  overviewNowClean: string;
  overviewNowConflicts: (count: number) => string;
  /** The group of versions that have not left this computer. */
  overviewTimelineLocalGroup: string;
  /** The mark above the newest version the remote has: "Published on". */
  overviewTimelinePublished: string;
  /** The row above "now" for versions waiting on the remote. */
  overviewTimelineIncoming: (count: number) => string;
  overviewTimelineGet: string;
  /** Under the last version drawn when older ones exist; History has them. */
  overviewTimelineEndMore: (count: number) => string;
  /** Under the last version of a shallow copy, whose older history was not downloaded. */
  overviewTimelineEndShallow: string;
  /** Under the branch's first version. */
  overviewTimelineEndStart: string;
  /** The side column: what the next step will move, and where you can go
   * back to. */
  overviewDetailSaveTitle: string;
  overviewDetailPublishTitle: string;
  overviewDetailReview: string;
  overviewDetailInHistory: string;
  overviewDetailFiles: (count: number) => string;
  /** When not every unpublished version's files are known: "9+ files". */
  overviewDetailFilesAtLeast: (count: number) => string;
  overviewDetailInNextVersion: string;
  overviewDetailInVersions: (count: number) => string;
  overviewDetailMore: (count: number) => string;
  overviewDetailLines: (added: number, removed: number) => string;
  /** The column's closing line, the consequence in one line that fits the
   * column in every language: where the work stays, or who will see it. */
  /** When the remote branch has another name than the project's branch. */
  overviewDetailLoading: string;
  overviewDetailFilesError: string;
  overviewDetailVersionsError: string;
  overviewSafetyDiscarded: string;
  /** A listed copy's line: its file count, then a few of its file names. */
  overviewSafetyDiscardedHint: (count: number, names: string) => string;
  /** Several restorable copies: how many (the badge on the icon, read out
   * for assistive technology), and when the newest was made. */
  /** The card's other cases: the first save, versions waiting on the remote,
   * both sides moved, a check that failed, no remote, an older version. */
  overviewNextFirstSaveTitle: string;
  overviewNextFirstSaveHint: (count: number) => string;
  overviewNextBehindTitle: (count: number, remote: string | null) => string;
  overviewNextDivergedTitle: (count: number) => string;
  overviewNextDivergedHint: (remote: string | null) => string;
  overviewNextFromHint: (from: string, files: number) => string;
  overviewNextDivergedBoth: (incoming: number, local: number, remote: string | null) => string;
  overviewNextGetCount: (count: number) => string;
  overviewNextGetAndCombine: string;
  overviewNextGetAndPublish: string;
  overviewNextSeeOverlap: string;
  overviewNextSeeWhy: string;
  overviewNextOverlapTitle: (remote: string | null) => string;
  overviewNextOverlapHint: (path: string, more: number) => string;
  overviewNextNoteClear: string;
  overviewNextNoteCanCombine: string;
  overviewNextNoteOverlap: string;
  overviewNextNoteIncomingClear: (count: number, remote: string | null) => string;
  overviewNextNoteIncomingCombined: (count: number, remote: string | null, file: string, fileCount: number) => string;
  overviewNextUnavailableTitle: (remote: string | null) => string;
  overviewNextUnavailableHint: string;
  overviewNextNoRemoteTitle: string;
  overviewNextNoRemoteHint: string;
  overviewNextDetachedTitle: string;
  overviewNextDetachedHint: string;
  overviewNextConnectRemote: string;
  overviewNextOpenBranches: string;
  overviewNextGoneTitle: (branch: string | null, remote: string | null) => string;
  overviewNextGoneHint: (remote: string | null) => string;
  overviewNextSwitchTo: (branch: string) => string;
  overviewNextPublishAgain: string;
  overviewNextStopTracking: string;
  overviewNextPublishBranch: string;
  /** The timeline's boundary for a branch whose remote branch was deleted. */
  overviewTimelineWasPublished: string;
  /** The neutral pill for what comes after this step: "Then: 3 new versions
   * on origin", "Then: publish 2 versions". */
  overviewNextThen: string;
  overviewNextThenGet: (count: number) => string;
  overviewNextThenOn: (remote: string) => string;
  overviewNextThenPublish: (count: number) => string;
  /** While saving is the step: publish what is about to be saved, with the
   * `count` versions already waiting ("publish it along with 4 more"). */
  overviewNextThenPublishWith: (count: number) => string;
  /** The side column's other details. */
  overviewDetailResolveTitle: string;
  overviewDetailResolveSum: string;
  overviewDetailBringTitle: string;
  overviewDetailVersions: (count: number) => string;
  overviewDetailFrom: (remote: string) => string;
  overviewDetailVersionsLoading: string;
  overviewDiscardRestore: string;
  overviewDiscardRestoreCopy: (when: string, count: number) => string;
  /** The remote's name in the timeline when it has none. */
  overviewTimelineRemote: string;
  overviewFactsCheck: string;
  overviewHistoryTitle: string;
  overviewHistoryViewAll: string;
  overviewHistoryLoading: string;
  overviewHistoryErrorTitle: string;
  overviewHistoryError: string;
  overviewHistoryRetry: string;
  overviewHistoryEmptyTitle: string;
  overviewHistoryEmptyDescription: string;
  overviewHistoryListLabel: string;
  overviewHistoryUntitled: string;
  overviewHistoryUnknownAuthor: string;
  overviewHistoryPublished: string;
  overviewHistoryLocalOnly: string;
  /** A version saved under the user's own Git identity. */
  overviewHistoryYou: string;
  /** The badge on the version the project stands on, in place of the branch's
   * name, which the header already says. */
  overviewHistoryCurrentBranch: string;
  overviewHistoryPublicationUnknown: string;
  overviewHistoryOpenVersion: (title: string) => string;
  overviewHistoryRefreshFailed: string;
  overviewPublishChanges: string;
  overviewPendingVersionsError: string;
  /** On an unpublished row of Recent history: publish it and every older
   * version, through the previewed flow. */
  overviewPublishUpTo: string;
  overviewPublishUpToHint: string;
  overviewCloseProject: string;
  overviewOpening: string;
  overviewOpenProject: string;
  overviewOpenDialogTitle: string;
  overviewCouldntOpenFolder: string;
}
