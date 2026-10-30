import { useEffect, useState } from "react";
import { ArrowLeftRight, Copy, GitCommitHorizontal, GitCompare, GitMerge, PenLine, Trash2 } from "lucide-react";

import { useLanguage } from "../../i18n";
import { ContextMenuSurface, copyTextToClipboard, type ContextMenuAnchor } from "../../shared/ui";
import type { Branch } from "./domain";
import { deleteActionLabel, branchActions } from "./branchActions";

/** A right-click on one row, and the branch it landed on. The branch is carried
 * rather than looked up again on each render: a refresh that reorders the list
 * must not silently repoint an open menu at a different branch. */
export type BranchContextMenuState = ContextMenuAnchor & { branch: Branch };

/** What a right-click on a branch offers, grouped the way other Git
 * clients group a branch's menu: going to it; what it can do with the branch
 * the project is on — bring in, rebase, compare;
 * renaming it and taking its name away as text; and, apart and last, the one
 * destructive action.
 *
 * Merge, rebase and compare are the quick switch's own three, in its words —
 * each names both ends so the direction is never inferred. Bring in opens
 * the preview; rebase and compare remain disabled and marked `Soon`. They are offered only for a branch that is not the
 * active one: the active branch has nothing to merge into itself.
 *
 * Availability and the Delete label come from `branchActions`, the one place
 * that decides them — the detail header reads the same functions. A menu that
 * offered a Delete the panel refuses, or called a blocked branch safe, would be
 * two answers to one question. */
export function BranchContextMenu({
  context,
  activeName,
  copiedIntoOf,
  onClose,
  onCopied,
  onSwitch,
  onBringIn,
  onRename,
  onDelete,
}: {
  context: BranchContextMenuState | null;
  /** The branch the project is on, which merge, rebase and compare act with. */
  activeName: string | null;
  /** The main branch's name when a branch's work reached it as copies, if the
   * branch's history has been read — for Delete's label. */
  copiedIntoOf?: (branch: Branch) => string | null;
  onClose: (restoreFocus: boolean) => void;
  onCopied: () => void;
  onSwitch: (name: string) => void;
  onBringIn?: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
}): React.JSX.Element | null {
  const { t } = useLanguage();
  const [copyError, setCopyError] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    setCopyError(false);
    setIsCopying(false);
  }, [context]);

  if (!context) return null;
  const { branch } = context;
  const { canSwitch, canRename, canDelete } = branchActions(branch);
  const soonActions =
    !branch.isActive && activeName !== null
      ? [
          { key: "merge", icon: <GitMerge aria-hidden="true" />, label: t.branchesMergeInto(activeName) },
          {
            key: "rebase",
            icon: <GitCommitHorizontal aria-hidden="true" />,
            label: t.branchesRebaseOnto(activeName),
          },
          { key: "compare", icon: <GitCompare aria-hidden="true" />, label: t.branchesCompareWith(activeName) },
        ]
      : [];

  const copyName = (): void => {
    if (isCopying) return;
    setIsCopying(true);
    void copyTextToClipboard(branch.name)
      .then(() => {
        onCopied();
        onClose(true);
      })
      .catch(() => {
        setIsCopying(false);
        setCopyError(true);
      });
  };

  // Runs an action and closes first: every one of these opens a dialog, and a
  // menu still standing behind it would take the outside click that dismisses
  // the dialog's backdrop.
  const run = (action: (name: string) => void) => (): void => {
    onClose(false);
    action(branch.name);
  };

  return (
    <ContextMenuSurface
      anchor={context}
      ariaLabel={t.branchesContextMenuLabel(branch.name)}
      className="branches-context-menu"
      onClose={onClose}
    >
      {/* Short labels, and the branch's name on the accessible one. The menu is
          already titled after the branch it acts on, so repeating the name in
          every item only makes the menu as wide as the longest branch name in
          the project — and these are the same words the detail header uses,
          with the same glyphs, which is what makes the two read as one set of
          actions. */}
      {canSwitch && (
        <button
          className="app-menu__item"
          role="menuitem"
          type="button"
          aria-label={t.branchesSwitchToBranchLabel(branch.name)}
          onClick={run(onSwitch)}
        >
          <ArrowLeftRight aria-hidden="true" />
          {t.branchesSwitchShort}
        </button>
      )}
      {soonActions.length > 0 && (
        <>
          {canSwitch && <div className="app-menu__divider" role="separator" />}
          {soonActions.map(({ key, icon, label }) => (
            <button
              key={key}
              className="app-menu__item"
              role="menuitem"
              type="button"
              disabled={key !== "merge" || !onBringIn}
              aria-disabled={key !== "merge" || !onBringIn}
              onClick={key === "merge" && onBringIn ? run(onBringIn) : undefined}
            >
              {icon}
              <span className="branches-quick-switch__actions-label">{label}</span>
              {(key !== "merge" || !onBringIn) && <span className="branches-quick-switch__soon">{t.branchesSoon}</span>}
            </button>
          ))}
          <div className="app-menu__divider" role="separator" />
        </>
      )}
      {canRename && (
        <button
          className="app-menu__item"
          role="menuitem"
          type="button"
          aria-label={t.branchesRenameBranchLabel(branch.name)}
          onClick={run(onRename)}
        >
          <PenLine aria-hidden="true" />
          {t.branchesRenameShort}
        </button>
      )}
      <button
        className="app-menu__item"
        role="menuitem"
        type="button"
        disabled={isCopying}
        onClick={copyName}
      >
        <Copy aria-hidden="true" />
        {t.branchesCopyName}
      </button>
      {canDelete && <div className="app-menu__divider" role="separator" />}
      {canDelete && (
        <button
          className="app-menu__item app-menu__item--danger"
          role="menuitem"
          type="button"
          aria-label={deleteActionLabel(branch, t, copiedIntoOf?.(branch) ?? null)}
          onClick={run(onDelete)}
        >
          <Trash2 aria-hidden="true" />
          {t.branchesDeleteShort}
        </button>
      )}
      {copyError && (
        <p className="branches-context-menu__error" role="alert">
          {t.branchesCopyFailed}
        </p>
      )}
    </ContextMenuSurface>
  );
}
