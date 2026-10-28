import type { SyncTranslations } from "./translations";

export const en: SyncTranslations = {
  syncTitle: "Project changes",
  syncNotCheckedTitle: "Not checked yet",
  syncNotCheckedMessage: "Check the remote project for the latest changes.",
  syncCheckingTitle: "Checking for project changes…",
  syncCheckingMessage: "Only remote information is read, and your files don't change.",
  syncUpToDateTitle: "You're up to date",
  syncUpToDateMessage: "Nothing to publish or get.",
  syncAheadTitle: (count) => `${count} saved ${count === 1 ? "version is" : "versions are"} ready to publish`,
  syncBehindTitle: (count) => `${count} newer ${count === 1 ? "version is" : "versions are"} available`,
  syncBehindMessage: "Review what will change before getting them.",
  syncDivergedTitle: "Both sides have changed",
  syncDivergedMessage: "Your branch and the remote have different work, and nothing is combined automatically.",
  syncNoRemoteTitle: "No remote yet",
  syncNoRemoteMessage: "Add a remote to check for project changes.",
  syncNoUpstreamTitle: "Choose a publish destination first",
  syncNoUpstreamMessage: "Publish this branch to connect it to the remote.",
  syncDetachedTitle: "Switch to a branch to check",
  syncDetachedMessage: "A specific saved version has nothing to compare on the remote.",
  syncUnbornTitle: "Save a version before checking",
  syncUnbornMessage: "There's no saved version to compare yet.",
  syncUnknownTitle: "Comparison unavailable",
  syncUnknownMessage: "Couldn't compare with the remote branch.",
  syncUnavailableTitle: "Couldn't check project changes",
  syncLastChecked: (value) => `Checked ${value}.`,
  syncCheck: "Check for project changes",
  syncChecking: "Checking…",
  syncCheckAgain: "Check again",
  syncPublish: "Publish changes",
  syncReviewAndGet: "Review and get",
  syncComingSoon: "Coming soon",
  syncCurrentBranch: "Current branch",
  syncTeamBranch: "Remote branch",
  syncRelationshipLabel: (local, team) => `Current branch ${local}; remote branch ${team}.`,
  syncTechnicalDetails: "Technical details",
  syncRemote: "Remote",
  syncDestination: "Destination branch",
  syncTrackingRef: "Tracking reference",
  syncLocalCommit: "Local commit",
  syncRemoteCommit: "Remote commit",
  syncAheadCount: "Saved locally",
  syncBehindCount: "Newer on the remote",
  syncNotAvailable: "Not available",
  getTeamDialogTitle: "Get project changes",
  getTeamTitleFastForward: (count, remote) =>
    `Get ${count === 1 ? "1 version" : `${count} versions`} from ${remote}`,
  getTeamTitleMerge: (count) =>
    `Get and combine ${count === 1 ? "1 version" : `${count} versions`}`,
  getTeamTitlePublish: (localCount, remote) =>
    `Publish ${localCount === 1 ? "1 version" : `${localCount} versions`} to ${remote}`,
  getTeamFrom: (authors, authorCount) => {
    if (authors.length === 0) return "";
    const more = authorCount - authors.length;
    if (more > 0) return `From ${authors.join(", ")} and ${more} more`;
    if (authors.length === 1) return `From ${authors[0]}`;
    return `From ${authors.slice(0, -1).join(", ")} and ${authors[authors.length - 1]}`;
  },
  getTeamFileCount: (count) => `${count} ${count === 1 ? "file" : "files"}`,
  getTeamBeforePublish: (count, from) =>
    `First ${count === 1 ? "1 version comes" : `${count} versions come`} in${from ? ` ${from.charAt(0).toLowerCase()}${from.slice(1)}` : ""}.`,
  getTeamNothingOverlaps: "Nothing of yours overlaps.",
  getTeamCarried: (count) =>
    count === 1 ? "Your unsaved file stays as it is." : `Your ${count} unsaved files stay as they are.`,
  getTeamCombined: (files, count) => {
    const named = count === 1 ? files[0] : `${count} files`;
    return `Your unsaved edits to ${named} stay unsaved, on top of the incoming ones.`;
  },
  getTeamMergeFact: (localCount) =>
    `A merge version joins both branches. ${localCount === 1 ? "Your version isn't" : `Your ${localCount} versions aren't`} published yet, so nobody else is affected.`,
  getTeamPublishFact: (localCount, remote) =>
    `Then ${localCount === 1 ? "your version" : `your ${localCount} versions`} and the merge version are published to ${remote}.`,
  getTeamRecoveryFirst: "A recovery point is saved first.",
  getTeamWhatComesIn: "What comes in",
  getTeamVersionMeta: (author, when, files) =>
    [author, when, files > 0 ? `${files} ${files === 1 ? "file" : "files"}` : ""].filter(Boolean).join(" · "),
  getTeamVersionsTruncated: (shown, total) => `Showing ${shown} of ${total} incoming versions.`,
  getTeamCheckingRemote: (remote) => `Checking ${remote} for anything newer…`,
  getTeamRemoteMoved: "Something changed while this was open. This is the updated summary.",
  getTeamConfirmFastForward: "Get",
  getTeamConfirmMerge: "Get and combine",
  getTeamConfirmPublish: "Get and publish",
  getTeamAlsoPublish: "Get, combine and publish",
  getTeamProgressLabel: "Getting project changes",
  getTeamPhase: {
    checkingLocalSafety: "Checking your files…",
    combiningVersions: "Creating the merge version…",
    creatingRecovery: "Saving a recovery point…",
    updatingFilesAndHistory: "Updating your files…",
    verifying: "Checking the result…",
    publishing: "Publishing…",
  },
  getTeamWorking: "Getting…",
  getTeamOverlapTitle: (remote) => `Your changes and ${remote}'s overlap`,
  getTeamOverlapBody: "You both changed the same lines in these files. They can't be combined in GitOdile yet, so nothing comes in.",
  getTeamOverlapSide: { saved: "your saved version", unsaved: "your unsaved changes" },
  getTeamOverlapMore: (count) => `And ${count} more.`,
  getTeamSafeNothingChanged: "Your work is safe and nothing was changed.",
  getTeamUntrackedTitle: "A file of yours would be overwritten",
  getTeamUntrackedBody: (path, remote) =>
    `${remote} adds ${path}, and you have a new file there that isn't saved. Move it or save it, then get the changes.`,
  getTeamPreparedTitle: "Save your changes first",
  getTeamPreparedBody: (path, remote) =>
    `${path} is prepared to save and also changes on ${remote}. Save it, then get the changes.`,
  getTeamCarryFailedBody: "Git can't carry your unsaved changes across this update. Save them, then get the changes.",
  getTeamGitTooOldTitle: "Update Git to combine versions",
  getTeamGitTooOldBody: "This version of Git can't work out a combination safely. Update Git in Settings, then try again.",
  getTeamOperationTitle: "Finish the Git operation in progress",
  getTeamOperationBody: "Another Git operation is in progress in this project. Finish or abort it, then get the changes.",
  getTeamShowInFolder: "Show in folder",
  getTeamReviewConflicts: "Review overlapping changes",
  getTeamSaveVersion: "Save version",
  getTeamBlockedTitle: "The update stopped safely",
  getTeamUpToDateToast: "Everything is up to date. There are no newer versions to bring in.",
  getTeamUncheckedBody: "The remote didn't answer. Check your connection and try again.",
  getTeamUncheckedLocal: "As far as this computer knows, there are no newer versions to bring in.",
  getTeamSuccessToast: (count) => `Project up to date. ${count === 1 ? "1 version came in." : `${count} versions came in.`}`,
  getTeamMergedToast: (count) =>
    `Combined. ${count === 1 ? "1 version came in" : `${count} versions came in`} and a merge version joins ${count === 1 ? "it" : "them"} with yours.`,
  getTeamPublishedToast: (received, published, remote) =>
    `Up to date and published: ${received} came in, ${published} went out to ${remote}.`,
  getTeamPublishFailed: "Your project is up to date, but publishing failed.",
  getTeamRetryPublish: "Try publishing again",
  getTeamReviewUpdatedPlan: "Review again",
  getTeamTryAgain: "Try again",
  getTeamUncertainTitle: "Result not confirmed",
  getTeamUncertainInstructions: "Check your files before going on. Your previous version is safe.",
  getTeamObservedHead: "Current HEAD",
  getTeamRecoveryReference: "Recovery point",
  getTeamUnsavedCopy: "Copy of your unsaved changes",
  getTeamMergeMessage: "Merge message",
  getTeamIntegration: "Update",
  getTeamIntegrationKind: { fastForward: "Fast-forward", merge: "Merge" },
};

