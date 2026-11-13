import { useCallback, useMemo } from "react";

import { localizeAppError } from "../../shared/i18n";
import { useLanguage } from "../../i18n";
import type { BranchesController } from "./controller";
import { useActiveBranchesState } from "./hooks";
import { withActiveBranchGone } from "./domain";
import { BranchesPanel } from "./BranchesPanel";

export type BranchesScreenProps = {
  controller: BranchesController;
  projectPath: string;
  sessionEpoch: string;
  watcherState: "starting" | "watching" | "off" | "unavailable";
  onOpenSettings: () => void;
  onChanged: () => void;
  onSaveVersion: () => void;
  onOpenConflicts?: () => void;
  onBringIn?: (name: string) => void;
  /** Open History reading this branch, and — when a version is named — with that
   * version selected. Branches' own list of saved versions is a preview of the
   * one History draws in full. */
  onOpenHistory?: (name: string, commit?: string) => void;
  /** Opens the publish flow for the active branch. */
  onPublish?: () => void;
  onOperationStart: () => boolean;
  onOperationFinish: () => void;
  onOperationPhaseChange: (phase: "planning" | "executing" | "error" | "success") => void;
  autoOpenCreate?: boolean;
  onAutoOpenCreateHandled?: () => void;
  /** A branch History asked this screen to select. One-shot; see the panel. */
  selectBranchIntent?: string | null;
  onSelectBranchIntentHandled?: () => void;
  /** The current branch, when the sync status says its remote branch was
   * deleted. Git marks a branch `[gone]` only once its tracking ref is gone too,
   * and GitOdile never prunes, so the sync status is what tells this screen in
   * the common case. Named, so a status still about the previous branch cannot
   * mark the one just switched to. */
  upstreamGoneBranch?: string | null;
  /** The user's own Git email: their versions say "You", the name on hover. */
  selfEmail?: string | null;
};

export function BranchesScreen({
  controller,
  projectPath,
  sessionEpoch,
  watcherState,
  onOpenSettings,
  upstreamGoneBranch = null,
  ...callbacks
}: BranchesScreenProps): React.JSX.Element {
  const { t } = useLanguage();
  const query = useMemo(() => ({ projectId: projectPath, sessionEpoch }), [projectPath, sessionEpoch]);
  const state = useActiveBranchesState(controller, query);
  /* Stable identities: the panel's effect depends on these, and a new function
     every render would re-run it — which for a read means asking Git again on
     every keystroke that re-renders the screen. */
  const readHistory = useCallback(
    (name: string, tipCommit: string) => controller.readHistory(query, name, tipCommit),
    [controller, query],
  );
  const prefetchHistory = useCallback(
    (name: string, tipCommit: string) => controller.prefetchHistory(query, name, tipCommit),
    [controller, query],
  );
  const peekHistory = useCallback(
    (name: string, tipCommit: string) => controller.peekHistory(query, name, tipCommit),
    [controller, query],
  );
  const snapshot = useMemo(
    () => withActiveBranchGone(state.snapshot, upstreamGoneBranch),
    [state.snapshot, upstreamGoneBranch],
  );
  return (
    <BranchesPanel
      projectPath={projectPath}
      sessionEpoch={sessionEpoch}
      snapshot={snapshot}
      error={state.error ? localizeAppError(state.error, t, t.branchesErrorLoading) : null}
      isLoading={state.isLoading}
      watcherState={watcherState}
      onOpenSettings={onOpenSettings}
      onRefresh={() => void controller.refresh(query)}
      onSnapshot={(snapshot) => controller.commit(query, snapshot)}
      readHistory={readHistory}
      peekHistory={peekHistory}
      prefetchHistory={prefetchHistory}
      {...callbacks}
    />
  );
}
