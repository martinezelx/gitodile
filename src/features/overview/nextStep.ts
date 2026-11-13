import type { ForecastBlocker } from "../sync";
import type { Journey } from "./journey";

/**
 * The colour a state wears on the next-step card. Each is one of the status
 * tokens every theme already defines, so a theme changes the hue and never the
 * meaning:
 *
 * - `unsaved` — `--status-warning`, the colour the switcher and the rail
 *   already give a project with unsaved changes.
 * - `ready` — the theme's accent: saved work waiting to be published, the step
 *   that closes the loop.
 * - `incoming` — `--status-renamed`, the theme's blue: something new is on the
 *   remote.
 * - `blocked` — `--status-danger`: overlapping changes, or files that could
 *   not be read.
 * - `calm` — no tint: nothing is waiting, or the card only reports.
 */
export type NextStepTone = "unsaved" | "ready" | "incoming" | "blocked" | "calm";

/** What the card offers to press. The panel binds each to its handler. */
export type NextStepAction =
  | "save"
  | "reviewChanges"
  | "resolve"
  | "publish"
  | "openHistory"
  | "getChanges"
  | "checkRemote"
  | "checkLocal"
  | "openSettings"
  | "openBranches"
  /** Opens Get project changes on what stops it: the overlapping files, or
   * what is in the way. */
  | "explainIncoming"
  /** Gets, combines and publishes in one confirmation. */
  | "getAndPublish"
  /** Switches to the project's main branch, the usual way out once this branch's
   * remote branch is gone. */
  | "switchToDefault"
  /** Forgets the remote branch this branch tracked. */
  | "stopTracking";

export type NextStepKind =
  | "loading"
  | "localError"
  | "conflicts"
  | "save"
  | "firstSave"
  | "publish"
  | "unpublished"
  | "behind"
  | "diverged"
  /** Local work and the remote's change the same lines: nothing comes in. */
  | "overlap"
  /** Something of the person's is in the way of the update. */
  | "incomingBlocked"
  | "checking"
  | "notChecked"
  | "unavailable"
  | "noRemote"
  | "noUpstream"
  /** The remote branch this branch tracked was deleted there. */
  | "upstreamGone"
  | "detached"
  | "unborn"
  | "upToDate";

/** What comes after this step, said in the card in a neutral pill so the card
 * keeps one colour: saved work that will still need publishing, or versions
 * waiting on the remote. While saving is the step, the version about to be
 * saved does not exist yet, so `publishWith` counts only the versions already
 * waiting beside it (0 when it would be published alone): a count that stays
 * true however many times the work is saved. */
export type NextStepThen =
  | { kind: "publish"; count: number }
  | { kind: "publishWith"; count: number }
  | { kind: "get"; count: number };

/** One line under the hint saying whether what is waiting on the remote
 * gets in the way of local work — the forecast, in a sentence. `clear` forecasts
 * read as safe, the others as stopped. */
export type NextStepNote =
  | { kind: "clear" }
  | { kind: "canCombine" }
  | { kind: "incomingClear"; count: number }
  | { kind: "incomingCombined"; count: number; files: string[]; fileCount: number }
  | { kind: "overlap" }
  | { kind: "blocked"; blocker: ForecastBlocker };

export type NextStep = {
  kind: NextStepKind;
  tone: NextStepTone;
  /** The one action that is the next step, or `null` when the card only
   * reports. At most one per card: it is the page's one primary button. */
  primary: NextStepAction | null;
  /** Quieter actions beside it, in display order. */
  secondary: NextStepAction[];
  /** A spinner stands in for the glyph while the fact is still being read. */
  isPending: boolean;
  then: NextStepThen | null;
  note: NextStepNote | null;
};

/**
 * Turns the journey — the facts Overview already derives — into the one card
 * that says what to do now. Pure: the card picks its words from `kind` and
 * its buttons from the actions, and this never reads the DOM.
 *
 * Local facts come first, because nothing on the remote side can be acted on
 * while files overlap or are unsaved; what the remote holds is then said as
 * what comes after. Once the working tree is clean, the remote side speaks.
 */
export function deriveNextStep(
  journey: Journey,
  { canPublish, defaultBranch = null }: {
    canPublish: boolean;
    /** The project's main branch when it is another branch than this one: where
     * a branch whose remote branch is gone usually goes next. */
    defaultBranch?: string | null;
  },
): NextStep {
  const { changes, publish } = journey;
  const incoming = (publish.state === "behind" || publish.state === "diverged") && publish.behind > 0
    ? publish.behind
    : 0;
  // The card never offers an action the forecast already knows will fail.
  const forecast = incoming > 0 ? publish.forecast : null;

  // Until both sides are read, the card holds its shape rather than guessing
  // a step that changes a moment later.
  if (changes.state === "loading" || (publish.state === "reading" && changes.state !== "error")) {
    return step("loading", "calm", null, [], true);
  }
  if (changes.state === "error") {
    return step("localError", "blocked", "checkLocal", []);
  }
  if (changes.state === "conflicts") {
    return step("conflicts", "blocked", "resolve", []);
  }
  if (changes.state === "dirty") {
    if (publish.state === "unborn") {
      return step("firstSave", "unsaved", "save", []);
    }
    if (forecast?.outcome === "overlap") {
      return step("overlap", "blocked", null, ["explainIncoming", "save"], false, null,
        { kind: "overlap" });
    }
    if (forecast?.outcome === "clear") {
      // Getting first is safe and keeps the branch from diverging; saving is
      // still the step, so it keeps the primary button.
      const note: NextStepNote = forecast.combinedUnsavedCount > 0
        ? { kind: "incomingCombined", count: incoming, files: forecast.combinedUnsaved, fileCount: forecast.combinedUnsavedCount }
        : { kind: "incomingClear", count: incoming };
      return step("save", "unsaved", "save", ["getChanges"], false, null, note);
    }
    if (forecast?.outcome === "blocked" && forecast.blocker) {
      return step("save", "unsaved", "save", ["reviewChanges"], false, null,
        { kind: "blocked", blocker: forecast.blocker });
    }
    // Versions waiting on the remote come before your own unpublished ones:
    // they have to be received before anything can be published. Otherwise
    // what is saved now is published next, with whatever already waits.
    const then: NextStepThen | null = incoming > 0
      ? { kind: "get", count: incoming }
      : publish.pending > 0 || publish.state === "upToDate"
        ? { kind: "publishWith", count: publish.pending }
        : null;
    return step("save", "unsaved", "save", ["reviewChanges"], false, then);
  }

  // Everything on this computer is saved; the remote side decides the rest.
  switch (publish.state) {
    case "ahead":
      return canPublish
        ? step("publish", "ready", "publish", ["openHistory"])
        : step("unpublished", "ready", null, ["openHistory"]);
    case "behind":
    case "diverged": {
      if (forecast?.outcome === "overlap") {
        return step("overlap", "blocked", "explainIncoming", [], false, null,
          { kind: "overlap" });
      }
      if (forecast?.outcome === "blocked") {
        return step("incomingBlocked", "unsaved", null, ["explainIncoming"]);
      }
      if (publish.state === "behind") {
        return step("behind", "incoming", "getChanges", [], false, null,
          forecast ? { kind: "clear" } : null);
      }
      if (forecast) {
        // Both sides moved and nothing overlaps: combine, and publishing can
        // ride along in the same confirmation.
        return step("diverged", "incoming", "getChanges", canPublish ? ["getAndPublish"] : [],
          false, null, { kind: "canCombine" });
      }
      // Unknown: receive first, then publish what is yours.
      return step("diverged", "incoming", "getChanges", [], false,
        publish.pending > 0 ? { kind: "publish", count: publish.pending } : null);
    }
    case "reading":
    case "checking":
      return step("checking", "calm", null, [], true);
    case "notChecked":
      return step("notChecked", "calm", null, ["checkRemote"], publish.isChecking);
    case "unavailable":
      // The work itself is safe; only the remote could not be asked. The card
      // says so calmly and its glyph carries the failure.
      return step("unavailable", "calm", null, ["checkRemote"], publish.isChecking);
    case "noRemote":
      return step("noRemote", "calm", null, ["openSettings"]);
    case "noUpstream":
      // Publishing is how such a branch gets a destination: the card offers it
      // rather than telling the reader to do something it gives no way to do.
      return step("noUpstream", "calm", canPublish ? "publish" : null, []);
    case "upstreamGone":
      // Nothing is lost, but publishing would recreate a branch the remote
      // closed: the card names the three ways on and presses none of them.
      return step(
        "upstreamGone",
        "unsaved",
        defaultBranch ? "switchToDefault" : null,
        [...(canPublish ? (["publish"] as const) : []), "stopTracking"],
      );
    case "detached":
      return step("detached", "calm", null, ["openBranches"]);
    case "unborn":
      return step("unborn", "calm", null, []);
    case "upToDate":
      // Nothing to do: the status bar's cloud is where the remote is checked
      // again, and the card does not offer it twice.
      return step("upToDate", "calm", null, [], publish.isChecking);
  }
}

function step(
  kind: NextStepKind,
  tone: NextStepTone,
  primary: NextStepAction | null,
  secondary: NextStepAction[],
  isPending = false,
  then: NextStepThen | null = null,
  note: NextStepNote | null = null,
): NextStep {
  return { kind, tone, primary, secondary, isPending, then, note };
}
