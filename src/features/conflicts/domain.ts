/* The conflict session as `read_conflict_session` reports it (ADR 0041). Rust
   owns every rule here — which operation is paused, its roles, each file's
   shape and state, what is allowed — and the screen only explains it. */

export type PausedOperationKind = "merge" | "rebase" | "cherry-pick" | "revert" | "am" | "unmerged";
export type UnsupportedOperationReason = "not-a-merge" | "several-merge-heads";
export type ConflictOrigin = "gitodile" | "external";

/** One side, named by a real branch, remote branch or tag when one points at
 * it, otherwise by its commit alone. */
export type SideLabel = { name: string | null; commit: string | null };

export type PausedOperation = {
  kind: PausedOperationKind;
  supported: boolean;
  unsupportedReason: UnsupportedOperationReason | null;
  step: { current: number; total: number } | null;
  /** Stage 2: for a rebase, the branch being rebased onto. */
  current: SideLabel;
  /** Stage 3: for a rebase, the user's own version being replayed. */
  incoming: SideLabel;
  operationHeads: string[];
  continueCommand: string | null;
  abortCommand: string | null;
};

export type ConflictStage = { mode: string; objectId: string };
export type ConflictShape =
  | "both-changed"
  | "both-added"
  | "deleted-by-current"
  | "deleted-by-incoming"
  | "deleted-by-both"
  | "added-by-current"
  | "added-by-incoming";
export type ConflictFacet =
  | "mode-change"
  | "symbolic-link"
  | "submodule"
  | "type-change"
  | "file-directory"
  | "case-collision";
export type ConflictFileState = "unresolved" | "editedOutside" | "markedResolved" | "stale" | "unsupported";
export type ConflictAction = "keep-current" | "keep-incoming" | "delete" | "open-in-editor" | "mark-resolved" | "reset-file";
export type WorkingKind = "absent" | "file" | "symbolic-link" | "directory" | "other";
/** The whole side an action wrote, while the file still holds exactly that. */
export type KeptSide = "current" | "incoming" | "deleted";

export type ConflictFile = {
  path: string;
  /** False when the path is not valid UTF-8 and `path` is a lossy name. */
  pathIsExact: boolean;
  shape: ConflictShape;
  facets: ConflictFacet[];
  base: ConflictStage | null;
  current: ConflictStage | null;
  incoming: ConflictStage | null;
  working: WorkingKind;
  state: ConflictFileState;
  kept: KeptSide | null;
  allowedActions: ConflictAction[];
};

export type ConflictSession = {
  sessionId: string;
  stateToken: string;
  origin: ConflictOrigin;
  operation: PausedOperation;
  files: ConflictFile[];
  unresolvedCount: number;
  listingComplete: boolean;
  snapshot: { sessionId: string; createdAtMs: number; complete: boolean; pinReference: string | null } | null;
  allowedActions: ("finish-merge" | "abort-merge")[];
};

export type ConflictSideName = "current" | "incoming";

/** Why a side has no diff to draw, decided from the session alone so the
 * screen never asks Rust a question it cannot answer. `null` means the side
 * can be compared as text against the base. */
export type SideLimitation =
  | "deleted"
  | "symbolic-link"
  | "submodule"
  | "type-change"
  | "inexact-path";

const REGULAR_MODES = new Set(["100644", "100755"]);

export function sideLimitation(file: ConflictFile, side: ConflictSideName): SideLimitation | null {
  const stage = file[side];
  if (!stage) return "deleted";
  if (!file.pathIsExact) return "inexact-path";
  if (file.facets.includes("submodule")) return "submodule";
  if (file.facets.includes("symbolic-link")) return "symbolic-link";
  if (!REGULAR_MODES.has(stage.mode) || (file.base && !REGULAR_MODES.has(file.base.mode))) return "type-change";
  return null;
}

/** Still overlapping first, then what was marked resolved since: the list's
 * two groups, each in the order Git listed them. */
export function groupConflictFiles(files: readonly ConflictFile[]): {
  open: ConflictFile[];
  resolved: ConflictFile[];
} {
  const open: ConflictFile[] = [];
  const resolved: ConflictFile[] = [];
  for (const file of files) {
    (file.state === "markedResolved" ? resolved : open).push(file);
  }
  return { open, resolved };
}

export function filterConflictFiles(files: readonly ConflictFile[], query: string): ConflictFile[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...files];
  return files.filter((file) => file.path.toLocaleLowerCase().includes(needle));
}

/** The name a side is called by in the reader's text: the branch or tag, else
 * its short commit, else nothing (a side Git recorded no commit for). */
export function sideName(label: SideLabel): string | null {
  return label.name ?? (label.commit ? label.commit.slice(0, 7) : null);
}

/** A whole-file choice: one side's version, or the deletion one side made. */
export type SideChoice = "keep-current" | "keep-incoming" | "delete";

/** What the file's action bar offers, from what Rust allows. */
export type FileActions = {
  choices: SideChoice[];
  canOpen: boolean;
  canMarkResolved: boolean;
  canReset: boolean;
};

const CHOICES: readonly SideChoice[] = ["keep-current", "keep-incoming", "delete"];

export function fileActions(file: ConflictFile): FileActions {
  return {
    choices: CHOICES.filter((choice) => file.allowedActions.includes(choice)),
    canOpen: file.allowedActions.includes("open-in-editor"),
    canMarkResolved: file.allowedActions.includes("mark-resolved"),
    canReset: file.allowedActions.includes("reset-file"),
  };
}

/** Why no whole-file choice can be made here, so the screen can say what to
 * do instead: a folder where Git expects the file, a name the disk cannot
 * hold apart from another overlapping one, or a name GitOdile cannot spell
 * exactly. `null` when the file is not blocked. */
export type FileBlock = "folder" | "case" | "inexact-path";

export function fileBlock(file: ConflictFile): FileBlock | null {
  if (!file.pathIsExact) return "inexact-path";
  if (file.facets.includes("file-directory")) return "folder";
  if (file.facets.includes("case-collision")) return "case";
  return null;
}

/** What a check of the working file for conflict markers found
 * (`check_conflict_working_file`). */
export type MarkerScan =
  | { kind: "found"; blocks: number }
  | { kind: "none" }
  | { kind: "unknown"; limit: "binary" | "utf16" | "too-large" | "unreadable" };

export type WorkingFileCheck = { stateToken: string; markers: MarkerScan };

/** Whether the file holds something the reader wrote outside GitOdile that
 * no check has looked at: edited since the snapshot, and not exactly a side
 * an action wrote (that one has no markers to find). */
export function needsMarkerCheck(file: ConflictFile): boolean {
  return file.pathIsExact && file.working === "file" && file.state === "editedOutside" && file.kept === null;
}

/** The side whose version a keep choice writes; `null` for a deletion. */
export function keptSide(choice: SideChoice): ConflictSideName | null {
  return choice === "keep-current" ? "current" : choice === "keep-incoming" ? "incoming" : null;
}

/** The side whose version a choice throws away, so the question can name it
 * before anything runs. A deletion discards the side that kept the file;
 * `null` when no side has a version to lose (both deleted it). */
export function discardedSide(file: ConflictFile, choice: SideChoice): ConflictSideName | null {
  switch (choice) {
    case "keep-current": return "incoming";
    case "keep-incoming": return "current";
    case "delete": return file.current ? "current" : file.incoming ? "incoming" : null;
  }
}

/** The choice whose result the file still holds, so the bar can say which
 * side was kept and leave that button pressed. */
export function keptChoice(file: ConflictFile): SideChoice | null {
  switch (file.kept) {
    case "current": return "keep-current";
    case "incoming": return "keep-incoming";
    case "deleted": return "delete";
    case null: return null;
  }
}

/** Which side runs as a program, for the permission question Mark resolved
 * asks when the sides disagree and the file was edited rather than kept. */
export function executableSide(file: ConflictFile): ConflictSideName | null {
  if (file.current?.mode === "100755" && file.incoming?.mode !== "100755") return "current";
  if (file.incoming?.mode === "100755" && file.current?.mode !== "100755") return "incoming";
  return null;
}
