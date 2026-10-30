import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  GitBranch,
  GitBranchPlus,
  GitCommitHorizontal,
  GitCompare,
  GitMerge,
  LoaderCircle,
  Copy,
  Search,
  Star,
  X,
} from "lucide-react";

import { useLanguage } from "../../i18n";
import { autoHideScrollbarProps, copyTextToClipboard, usePortalFlyout } from "../../shared/ui";
import type { Branch, BranchesSnapshot } from "./domain";
import { BranchCreateFields, useBranchCreateFlow, type BranchCreateContext } from "./BranchQuickCreateBox";

export type BranchQuickSwitchProps = {
  snapshot: BranchesSnapshot | null;
  isLoadingSnapshot: boolean;
  currentValue: string;
  /** The words in front of the value, so the strip states the context rather
   * than displaying a value whose meaning the reader has to infer. Purely
   * visual: the trigger's own accessible name already says what it changes. */
  contextLabel?: string;
  /** A caption *inside* the trigger, above the value, with the branch glyph in a
   * neutral circle before both — the label-and-value shape of Overview's band
   * tiles, for a page header that has to say what the name is. Purely visual,
   * like `contextLabel`. */
  label?: string;
  canSwitch: boolean;
  variant?: "control" | "status";
  /** Whether the control variant draws its round "new branch" button beside
   * the trigger. Off where the row has no room to spend on it; the menu's
   * footer carries the same action either way. */
  showCreateControl?: boolean;
  favouriteBranches?: ReadonlySet<string>;
  onToggleFavourite?: (name: string) => void;
  onSwitch: (target: string) => void;
  onBringIn?: (name: string) => void;
  /** Where a branch created from this control is made. With it, "New branch" and
   * a search that names no branch open a create view inside the popup — the
   * Branches composer's fields and flow, in place of the list — rather than a
   * dialog. Without it, the control only chooses. */
  create?: BranchCreateContext;
  onSeeAll: () => void;
  /** Where the menu opens from the trigger. By default the status strip's
   * grows right and the control's backs off its right edge; a trigger at the
   * start of a row, like Overview's breadcrumb, opens rightwards as well. */
  menuAnchor?: "below" | "below-end";
  /** The working tree, worn by the status strip's trigger: a dot after the
   * branch's name while there is unsaved work (in the danger tone when the tree
   * could not be read), the branch glyph turned spinner while it is being read.
   * The sentence joins the trigger's tooltip; the strip keeps it for the
   * screen reader itself, so the trigger's name stays what it changes. */
  workingTree?: { state: "clean" | "unsaved" | "error" | "checking"; description: string };
};

/**
 * Bounded shortcut to the shared branch inventory. It deliberately
 * chooses a target but never performs the mutation: callers route that target
 * through the existing previewed switch flow.
 */
export function BranchQuickSwitch({
  snapshot,
  isLoadingSnapshot,
  currentValue,
  contextLabel,
  label,
  canSwitch,
  variant = "control",
  showCreateControl = true,
  favouriteBranches = new Set<string>(),
  onToggleFavourite,
  onSwitch,
  onBringIn,
  create,
  onSeeAll,
  menuAnchor,
  workingTree,
}: BranchQuickSwitchProps): React.JSX.Element {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  /** The branch whose actions are showing inside the popup, if any. The actions
   * replace the list rather than opening a nested menu: the popup clips its own
   * overflow and dismisses on a press outside it, so a second floating surface
   * anchored to a row would be cut off or would close the control that opened
   * it. */
  const [actionBranch, setActionBranch] = useState<Branch | null>(null);
  /** The composer docked at the popup's foot in place of its footer, holding
   * the name it opened with. */
  const [creating, setCreating] = useState<{ initialName: string } | null>(null);
  // Read by the rows, which render in the branch where `actionBranch` is `null`
  // and would therefore be narrowed away if they asked it directly.
  const openActionsName = actionBranch?.name ?? null;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const eligibleBranches: Branch[] | null = snapshot
    ? snapshot.branches.filter(
        (branch) => !branch.isActive && branch.name !== currentValue && !branch.worktreePath,
      )
    : null;
  const needle = query.trim().toLocaleLowerCase();
  const matches = eligibleBranches
    ? eligibleBranches
        .filter((branch) => !favouritesOnly || favouriteBranches.has(branch.name))
        .filter((branch) => !needle || branch.name.toLocaleLowerCase().includes(needle))
        .sort(
          (left, right) =>
            Number(favouriteBranches.has(right.name)) - Number(favouriteBranches.has(left.name)),
        )
    : null;
  const visibleBranches = matches?.slice(0, 9) ?? null;
  /* A branch can be started from here only where there is a commit for it to
     point at — not on an unborn `HEAD`, the case Branches hides its composer for. */
  const canCreate = create !== undefined && snapshot !== null && snapshot.headState !== "unborn";
  /* A search that names no branch — the active one included, which the list
     leaves out — is offered as the name of a new one. */
  const typed = query.trim();
  const offersCreate =
    canCreate && typed !== "" && !snapshot.branches.some((branch) => branch.name === typed);
  const close = (restoreFocus: boolean): void => {
    setIsOpen(false);
    setActionBranch(null);
    setCreating(null);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const choose = (name: string): void => {
    close(false);
    onSwitch(name);
  };
  /** The rows the arrow keys walk: every branch, and the offer to make one. */
  const rowButtons = (): HTMLButtonElement[] =>
    Array.from(popupRef.current?.querySelectorAll<HTMLButtonElement>(".branches-quick-switch__choose") ?? []);
  const startCreate = (initialName: string): void => {
    setActionBranch(null);
    setCreating({ initialName });
  };
  useEffect(() => {
    if (actionBranch) backRef.current?.focus();
  }, [actionBranch]);
  // The status-bar trigger sits at the left of its strip, so its menu grows
  // right; a control at the trailing end of a header backs off the trigger's
  // right edge and grows left over the page instead. A caller whose control
  // starts its row, like Overview's breadcrumb, names `menuAnchor` itself.
  const { popupRef, style } = usePortalFlyout(
    isOpen,
    triggerRef,
    close,
    menuAnchor ?? (variant === "status" ? "below" : "below-end"),
    "none",
  );
  // The search takes focus on opening, although the head's copy button comes
  // first in the popup: choosing a branch is what the popup is opened for. Once
  // the popup is visible — a hidden element cannot take focus — and once per
  // opening. A popup opened straight into the composer leaves it to the field.
  const hasFocused = useRef(false);
  useLayoutEffect(() => {
    if (!isOpen) {
      hasFocused.current = false;
      return;
    }
    if (hasFocused.current || style.visibility === "hidden") return;
    hasFocused.current = true;
    if (!creating) searchRef.current?.focus();
  }, [isOpen, style.visibility, creating]);
  /** The branch the trigger names, from the snapshot, for the popup's head. By
   * name, not by `isActive`: a cached snapshot can still mark the branch the
   * project has just left, and the head would put that branch's latest version
   * under this one's name. */
  const currentBranch = snapshot?.branches.find((branch) => branch.name === currentValue) ?? null;
  const [nameCopied, setNameCopied] = useState(false);
  useEffect(() => {
    if (!nameCopied) return;
    const timer = window.setTimeout(() => setNameCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [nameCopied]);
  const Chevron = variant === "status" ? ChevronUp : ChevronDown;
  const triggerTitle = workingTree ? `${currentValue} · ${workingTree.description}` : currentValue;
  // Unsaved work is a dot, the way an editor marks an unsaved tab; a tree that
  // could not be read takes the alert glyph the project mark and the popup
  // rows use for something to resolve, so the shape says it as well as the
  // tone. Keyed by state so a marker that arrives breathes once.
  const marker = workingTree?.state === "unsaved"
    ? <span key="unsaved" className="branch-selector__marker branch-selector__marker--unsaved attention-breathe" aria-hidden="true" />
    : workingTree?.state === "error"
      ? (
        <span key="error" className="branch-selector__marker branch-selector__marker--error attention-breathe" aria-hidden="true">
          <CircleAlert />
        </span>
      )
      : null;
  const face = label ? (
    <>
      <span className="branch-selector__tile" aria-hidden="true">
        <GitBranch className="branch-selector__icon" />
      </span>
      <span className="branch-selector__copy">
        <span className="branch-selector__label" aria-hidden="true">{label}</span>
        <span className="branch-selector__value">{currentValue}</span>
      </span>
    </>
  ) : (
    <>
      {workingTree?.state === "checking"
        ? <LoaderCircle aria-hidden="true" className="branch-selector__icon icon--spinning" />
        : <GitBranch aria-hidden="true" className="branch-selector__icon" />}
      <span className="branch-selector__value">{currentValue}</span>
      {marker}
    </>
  );

  const toggleOpen = (): void => {
    if (isOpen) {
      close(true);
      return;
    }
    setQuery("");
    setFavouritesOnly(false);
    setActionBranch(null);
    setCreating(null);
    setIsOpen(true);
  };

  return (
    <div className={`branches-quick-switch branches-quick-switch--${variant}`}>
      {contextLabel && (
        <span className="branches-quick-switch__context-label" aria-hidden="true">
          {contextLabel}
        </span>
      )}
      {canSwitch ? (
        <button
          ref={triggerRef}
          className="branch-selector"
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={t.branchesQuickSwitchChangeLabel(currentValue)}
          title={triggerTitle}
          onClick={toggleOpen}
        >
          {face}
          <Chevron aria-hidden="true" className="branch-selector__chevron" />
        </button>
      ) : (
        <span className="branch-selector branch-selector--static" title={triggerTitle}>
          {face}
        </span>
      )}

      {/* Only where the control has room for it. The status strip is 34px of
          chrome across the whole window, and its dropdown now carries the same
          action. */}
      {canCreate && variant === "control" && showCreateControl && (
        <button
          className="secondary-button branches-quick-switch__create"
          type="button"
          onClick={() => {
            setQuery("");
            setFavouritesOnly(false);
            startCreate("");
            setIsOpen(true);
          }}
          aria-label={t.branchesQuickSwitchNew}
          data-tooltip={t.branchesQuickSwitchNew}
        >
          <GitBranchPlus aria-hidden="true" />
        </button>
      )}

      {isOpen && createPortal(
        <div
          ref={popupRef}
          className={`app-menu branches-quick-switch__menu branches-quick-switch__menu--${variant}`}
          role="dialog"
          aria-label={t.branchesQuickSwitchTitle}
          style={style}
        >
          {actionBranch ? (
            <div className="branches-quick-switch__actions">
              <div className="branches-quick-switch__actions-head">
                <button
                  ref={backRef}
                  type="button"
                  className="branches-quick-switch__back"
                  aria-label={t.branchesQuickSwitchBack}
                  onClick={() => setActionBranch(null)}
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <span className="branches-quick-switch__actions-name" title={actionBranch.name}>{actionBranch.name}</span>
              </div>
              {/* Bring in opens its preview; rebase and compare stay Soon. */}
              <button className="app-menu__item" type="button" role="menuitem" disabled={!onBringIn} aria-disabled={!onBringIn} onClick={() => { close(false); onBringIn?.(actionBranch.name); }}>
                <GitMerge aria-hidden="true" />
                <span className="branches-quick-switch__actions-label">{t.branchesMergeInto(currentValue)}</span>
                {!onBringIn && <span className="branches-quick-switch__soon">{t.branchesSoon}</span>}
              </button>
              <button className="app-menu__item" type="button" role="menuitem" disabled aria-disabled="true">
                <GitCommitHorizontal aria-hidden="true" />
                <span className="branches-quick-switch__actions-label">{t.branchesRebaseOnto(currentValue)}</span>
                <span className="branches-quick-switch__soon">{t.branchesSoon}</span>
              </button>
              <button className="app-menu__item" type="button" role="menuitem" disabled aria-disabled="true">
                <GitCompare aria-hidden="true" />
                <span className="branches-quick-switch__actions-label">{t.branchesCompareWith(currentValue)}</span>
                <span className="branches-quick-switch__soon">{t.branchesSoon}</span>
              </button>
              {!onBringIn && <p className="branches-quick-switch__actions-note">{t.branchesActionsSoon}</p>}
            </div>
          ) : (<>
          {/* The branch the project is on, and what is done to it, at the head —
              the project popup's shape (task 189), so both halves of the
              status bar's block open the same way. Making a new branch and
              managing them all stay at the foot, as adding a project and
              going Home do there. */}
          <div className="branches-quick-switch__head">
            <span className="branches-quick-switch__glyph branches-quick-switch__glyph--current" aria-hidden="true">
              <GitBranch />
            </span>
            <span className="branches-quick-switch__copy">
              <span className="branches-quick-switch__name" title={currentValue}>{currentValue}</span>
              {currentBranch && (
                <span className="branches-quick-switch__context" title={currentBranch.tip.subject}>
                  {currentBranch.tip.subject}
                </span>
              )}
            </span>
            {currentBranch && (
              <button
                type="button"
                className="branches-quick-switch__head-action"
                aria-label={nameCopied ? t.branchesNameCopied : t.branchesCopyName}
                data-tooltip={nameCopied ? t.branchesNameCopied : t.branchesCopyName}
                onClick={() => {
                  void copyTextToClipboard(currentBranch.name).then(() => setNameCopied(true), () => undefined);
                }}
              >
                {nameCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              </button>
            )}
          </div>
          <div className="branches-quick-switch__search">
            <Search aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder={t.branchesQuickSwitchSearchPlaceholder}
              aria-label={t.branchesQuickSwitchSearchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  rowButtons()[0]?.focus();
                  return;
                }
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                // Enter chooses the first branch the search left, which is only
                // a choice: the switch it starts is previewed like any other.
                // On a name no branch has, it is the create row's press.
                const first = visibleBranches?.[0];
                if (first) {
                  event.preventDefault();
                  choose(first.name);
                } else if (offersCreate) {
                  event.preventDefault();
                  startCreate(typed);
                }
              }}
            />
            {onToggleFavourite && (
              <button
                type="button"
                className={`branches-quick-switch__filter${favouritesOnly ? " branches-quick-switch__filter--on" : ""}`}
                aria-pressed={favouritesOnly}
                aria-label={
                  favouritesOnly
                    ? t.branchesQuickSwitchFavouritesOnlyOff
                    : t.branchesQuickSwitchFavouritesOnly
                }
                onClick={() => setFavouritesOnly((value) => !value)}
              >
                <Star aria-hidden="true" />
              </button>
            )}
          </div>
          <div
            {...autoHideScrollbarProps<HTMLDivElement>()}
            className="branches-quick-switch__results auto-hide-scrollbar"
          >
          {visibleBranches === null && isLoadingSnapshot ? (
            <div className="branches-quick-switch__status" role="status">
              <LoaderCircle aria-hidden="true" className="icon--spinning" />
              <span className="visually-hidden">{t.branchesLoading}</span>
            </div>
          ) : (visibleBranches === null || visibleBranches.length === 0) && !(offersCreate && !creating) ? (
            <p className="empty-line empty-line--menu branches-quick-switch__empty">
              {favouritesOnly && !needle
                ? t.branchesQuickSwitchFavouritesEmpty
                : needle
                  ? t.branchesQuickSwitchSearchEmpty
                  : t.branchesQuickSwitchEmpty}
            </p>
          ) : (
            <ul
              className="branches-quick-switch__list"
              role="list"
              onKeyDown={(event) => {
                // Up and down walk the rows; up from the first returns to the
                // search, so the list and its filter read as one control.
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                const rows = rowButtons();
                const index = rows.indexOf(event.target as HTMLButtonElement);
                if (index === -1) return;
                event.preventDefault();
                if (event.key === "ArrowUp" && index === 0) searchRef.current?.focus();
                else rows[event.key === "ArrowDown" ? Math.min(index + 1, rows.length - 1) : index - 1]?.focus();
              }}
            >
              {(visibleBranches ?? []).map((branch) => {
                const isFavourite = favouriteBranches.has(branch.name);
                return (
                  <li key={branch.name} className="branches-quick-switch__item">
                    <button
                      type="button"
                      className="branches-quick-switch__choose"
                      aria-label={branch.name}
                      title={branch.name}
                      onClick={() => choose(branch.name)}
                    >
                      <span className="branches-quick-switch__glyph" aria-hidden="true">
                        <GitBranch />
                      </span>
                      <span className="branches-quick-switch__copy">
                        <span className="branches-quick-switch__name">{branch.name}</span>
                        <span className="branches-quick-switch__context">{branch.tip.subject}</span>
                      </span>
                    </button>
                    {onToggleFavourite && (
                      <button
                        type="button"
                        className={`branches-quick-switch__favourite${isFavourite ? " branches-quick-switch__favourite--on" : ""}`}
                        aria-pressed={isFavourite}
                        aria-label={
                          isFavourite
                            ? t.branchesQuickSwitchUnfavourite(branch.name)
                            : t.branchesQuickSwitchFavourite(branch.name)
                        }
                        data-tooltip={
                          isFavourite
                            ? t.branchesQuickSwitchUnfavouriteHint
                            : t.branchesQuickSwitchFavouriteHint
                        }
                        onClick={() => onToggleFavourite(branch.name)}
                      >
                        <Star aria-hidden="true" />
                      </button>
                    )}
                    {/* Always visible, unlike the favourite, and a chevron
                        rather than an ellipsis: it opens the branch's actions in
                        place of the list, not a floating menu over it, and the
                        back control pairs with it. A control that only appears
                        under the pointer is one half the readers never find. */}
                    <button
                      type="button"
                      className="branches-quick-switch__more"
                      aria-label={t.branchesQuickSwitchActions(branch.name)}
                      aria-haspopup="menu"
                      aria-expanded={openActionsName === branch.name}
                      onClick={() => {
                        setQuery("");
                        setActionBranch(branch);
                      }}
                    >
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
              {/* The name typed is no branch's, so it is offered as a new one —
                  last, under whatever the search did match, so choosing an
                  existing branch stays the first thing in reach. It opens the
                  create view with the name in it rather than creating at
                  once: a search is a question, and Enter on it must not make
                  a branch by accident. */}
              {offersCreate && !creating && (
                <li className="branches-quick-switch__item">
                  <button
                    type="button"
                    className="branches-quick-switch__choose branches-quick-switch__offer"
                    title={typed}
                    onClick={() => startCreate(typed)}
                  >
                    <span className="branches-quick-switch__glyph" aria-hidden="true">
                      <GitBranchPlus />
                    </span>
                    <span className="branches-quick-switch__copy">
                      <span className="branches-quick-switch__name">{t.branchesQuickSwitchCreateNamed(typed)}</span>
                      <span className="branches-quick-switch__context">{t.branchesQuickSwitchCreateHint}</span>
                    </span>
                  </button>
                </li>
              )}
            </ul>
          )}
          </div>
          {/* The two things this control cannot answer by choosing from the
              list above it: a branch that does not exist yet, and everything
              about a branch that is not "which one am I on". The first is made
              right here, with the Branches composer's own flow; the second hands
              off to the Branches screen — there is no second one. */}
          {/* One row, not two: these are the two things choosing from the list
              above cannot answer, and a popup that spends two full rows on them
              is a popup with less room for the branches it exists to show. Ghost
              buttons rather than menu rows — they leave this control instead of
              choosing inside it. */}
          {/* A new branch is named at the popup's foot, where "New branch" was —
              the composer docked under the list the way it is under the Branches
              list. The popup keeps its size and its place: it was a view that
              replaced the list, which shrank the popup to the composer's
              height, and a popup measured and placed for the list then hung
              in the air — above the status bar, a gap opened between it and
              its trigger. */}
          {creating && create && snapshot ? (
            <QuickSwitchComposer
              key={creating.initialName}
              snapshot={snapshot}
              context={create}
              initialName={creating.initialName}
              onCancel={() => setCreating(null)}
              onCreated={() => close(false)}
            />
          ) : (
          <div className="branches-quick-switch__footer">
            {canCreate && (
              <button
                type="button"
                className="ghost-button branches-quick-switch__new"
                onClick={() => startCreate(offersCreate ? typed : "")}
              >
                <GitBranchPlus aria-hidden="true" />
                <span>{t.branchesQuickSwitchNew}</span>
              </button>
            )}
            <button
              type="button"
              className="ghost-button branches-quick-switch__see-all"
              onClick={() => {
                close(false);
                onSeeAll();
              }}
            >
              <span>{t.branchesQuickSwitchSeeAll}</span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
          )}
          </>)}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** A new branch, made inside the popup: the Branches composer's fields and the
 * same `useBranchCreateFlow`, docked at the popup's foot under the list — the
 * shape the composer has under the Branches list. Started with the name the
 * search held, if it named no branch. Made, the popup closes — the control it
 * hangs from then names the branch, which is the confirmation — and a failure
 * stays under the field to retry. Escape folds it back into the footer
 * without closing the popup. */
function QuickSwitchComposer({
  snapshot,
  context,
  initialName,
  onCancel,
  onCreated,
}: {
  snapshot: BranchesSnapshot;
  context: BranchCreateContext;
  initialName: string;
  onCancel: () => void;
  onCreated: () => void;
}): React.JSX.Element {
  const { t } = useLanguage();
  const nameRef = useRef<HTMLInputElement>(null);
  const flow = useBranchCreateFlow({
    ...context,
    forceSwitch: snapshot.headState === "detached",
    mainBranch: snapshot.branches.find((branch) => branch.isDefault) ?? null,
    activeBranch: snapshot.branches.find((branch) => branch.isActive) ?? null,
    existingNames: snapshot.branches.map((branch) => branch.name),
    draftKey: `quick-switch-branch:${context.projectPath}`,
    initialName,
    onCreated: (next) => {
      context.onCreated(next);
      onCreated();
    },
  });
  // It opens to be typed in; a frame later than the popup's own
  // first-control focus when the popup opens straight into it.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const field = nameRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className="docked-composer docked-composer--expanded branches-quick-create branches-quick-switch__composer"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || flow.isBusy) return;
        // Folds the composer; the popup, which would otherwise close on the
        // same key, stays open on its list.
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <div className="branches-quick-switch__composer-title">
        <GitBranchPlus aria-hidden="true" />
        <span>{t.branchesQuickSwitchNew}</span>
        <button
          type="button"
          className="branches-quick-switch__composer-close"
          aria-label={t.commonCancel}
          data-tooltip={t.commonCancel}
          disabled={flow.isBusy}
          onClick={onCancel}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <BranchCreateFields flow={flow} nameRef={nameRef} expanded />
    </div>
  );
}
