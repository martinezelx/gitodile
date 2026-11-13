import React from "react";
import { DialogCloseButton } from "./dialogCloseButton";

/** DESIGN.md § Dialogs: three sizes, never a width of a dialog's own. */
export type DialogSize = "s" | "m" | "l";
/** The header glyph's ink (DESIGN.md § Glyph tones). The status tones say
 * what kind of message this is before the sentence is read — `danger` for a
 * failure or a confirmation that removes work, `warning` for a block,
 * `success` for done, `neutral` for a plain question or a cancellation — and
 * the glyph tones what kind of thing the flow handles: `remote` the remote's
 * copy, `local` what is saved here and not published, `app` GitOdile itself. */
export type DialogTone = "success" | "warning" | "danger" | "neutral" | "remote" | "local" | "app";

export type DialogProps = {
  size: DialogSize;
  title: React.ReactNode;
  titleId: string;
  subtitle?: React.ReactNode;
  descriptionId?: string;
  /** A lucide icon element. Every dialog leads with its glyph, in a neutral
   * circle beside the title (DESIGN.md § Dialogs): it says what kind of
   * thing this is before the title is read. */
  icon: React.ReactNode;
  tone: DialogTone;
  role?: "dialog" | "alertdialog";
  /** Given, the header carries the close button and the backdrop dismisses. */
  onClose?: () => void;
  closeLabel?: string;
  /** False while work that cannot be interrupted runs: no close button, no
   * backdrop dismissal. */
  dismissible?: boolean;
  dialogRef?: React.Ref<HTMLDivElement>;
  titleRef?: React.Ref<HTMLHeadingElement>;
  className?: string;
  bodyProps?: React.HTMLAttributes<HTMLDivElement>;
  children: React.ReactNode;
};

/** How a dialog backdrop dismisses: only on a press that starts on the backdrop
 * itself. The surface must not swallow `mousedown` instead — a press inside a
 * dialog still has to reach `document`, because the menus and pickers a dialog
 * contains close themselves on an outside press observed there. Settings →
 * Accounts' provider menu is the case that exposed the difference: with the
 * dialog body stopping the press, the menu survived every click inside the
 * dialog and only its trigger could close it. */
export function dialogBackdropProps(
  onDismiss: (() => void) | undefined,
): Pick<React.HTMLAttributes<HTMLDivElement>, "onMouseDown"> {
  return {
    onMouseDown: (event) => {
      if (event.target === event.currentTarget) onDismiss?.();
    },
  };
}

/** The one shell every action dialog wears: backdrop, surface, header and
 * the body the caller supplies. Focus management stays with the caller —
 * dialogs differ in where focus lands — but the shape does not. */
export function Dialog({
  size,
  title,
  titleId,
  subtitle,
  descriptionId,
  icon,
  tone,
  role = "dialog",
  onClose,
  closeLabel = "Close",
  dismissible = true,
  dialogRef,
  titleRef,
  className = "",
  bodyProps,
  children,
}: DialogProps): React.JSX.Element {
  const canClose = Boolean(onClose) && dismissible;
  return (
    <div
      className="app-dialog-backdrop"
      role="presentation"
      {...dialogBackdropProps(canClose ? onClose : undefined)}
    >
      <div
        {...bodyProps}
        ref={dialogRef}
        className={`app-dialog app-dialog--${size} ${className}`.trim()}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        {/* A modal's heading is local to its named dialog, not a second
            application-wide banner when the overlay sits outside main. */}
        <div className="app-dialog__head">
          <span className={`app-dialog__glyph app-dialog__glyph--${tone}`} aria-hidden="true">{icon}</span>
          <div className="app-dialog__titles">
            <h2 id={titleId} ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{title}</h2>
            {subtitle && <p className="app-dialog__subtitle">{subtitle}</p>}
          </div>
          {canClose && <DialogCloseButton label={closeLabel} onClick={() => onClose?.()} />}
        </div>
        {children}
      </div>
    </div>
  );
}

export type DialogFact = { icon: React.ReactNode; text: React.ReactNode; safe?: boolean };

/** "What will happen": two or three lines, the safety line last. */
export function DialogFacts({ facts, label }: { facts: DialogFact[]; label?: string }): React.JSX.Element {
  return (
    <ul className="app-dialog__facts" aria-label={label}>
      {facts.map((fact, index) => (
        <li key={index} className={fact.safe ? "app-dialog__fact app-dialog__fact--safe" : "app-dialog__fact"}>
          <span aria-hidden="true">{fact.icon}</span>
          <span>{fact.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** A problem or a condition inside a dialog, with an optional way out. */
export function DialogBanner({
  tone,
  icon,
  children,
  role,
}: {
  tone: "warning" | "danger" | "info";
  icon: React.ReactNode;
  children: React.ReactNode;
  role?: "alert" | "status";
}): React.JSX.Element {
  return (
    <div className={`app-dialog__banner app-dialog__banner--${tone}`} role={role}>
      <span aria-hidden="true">{icon}</span>
      <div>{children}</div>
    </div>
  );
}
