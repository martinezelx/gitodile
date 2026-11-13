export type UpdateTarget = "windows-x86_64" | "darwin-aarch64" | "darwin-x86_64" | "linux-x86_64";

export type UpdateCandidate = Readonly<{
  candidateId: string;
  version: string;
  target: UpdateTarget;
  publishedAt: string | null;
  notes: string;
  /** The offered release's What's new lines from the feed, or empty when the
   * feed carries none — then the dialog shows `notes`. `icon` is a name this
   * build may not know; the renderer falls back to a generic glyph. */
  highlights: readonly UpdateHighlight[];
  expectedBytes: number | null;
}>;

export type UpdateHighlight = Readonly<{ id: string; icon: string; en: string; es: string }>;

export type UpdateError = Readonly<{
  code:
    | "offline" | "timeout" | "http_status" | "feed_unavailable"
    | "invalid_manifest" | "invalid_version"
    | "target_unavailable" | "unsupported_installation" | "automatic_update_not_enabled"
    | "read_only_installation"
    | "notes_too_large" | "payload_too_large" | "truncated_download"
    | "signature_invalid" | "insufficient_space" | "install_blocked"
    | "install_handoff_failed" | "post_install_unconfirmed" | "not_configured" | "internal";
  stage: "check" | "download" | "verify" | "admission" | "install" | "startup";
  retryable: boolean;
  httpStatus?: number;
  safeDetail?: string;
  /** Renderer-only: the name of the unfinished edit that blocked an install,
   * written by its owning feature in the reader's language. The native side
   * never sends it. */
  blocker?: string;
}>;

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking"; operationId: string; source: "manual" | "background" }
  | { kind: "current"; checkedAt: string }
  | { kind: "available"; candidate: UpdateCandidate }
  | { kind: "downloading"; candidate: UpdateCandidate; transfer:
      | { length: "known"; receivedBytes: number; totalBytes: number }
      | { length: "unknown"; receivedBytes: number } }
  | { kind: "verifying"; candidate: UpdateCandidate; receivedBytes: number }
  | { kind: "ready"; candidate: UpdateCandidate }
  | { kind: "blocked"; candidate: UpdateCandidate; error: UpdateError }
  | { kind: "installing"; candidateId: string }
  | { kind: "cancelled"; stage: "checking" | "downloading" }
  | { kind: "unavailable"; error: UpdateError }
  | { kind: "failed"; error: UpdateError };

export type UpdateAction = Readonly<{
  operationId: string | null;
  coalesced: boolean;
  state: UpdateState;
}>;

export type StartupUpdateConfirmation =
  | { kind: "none" }
  | { kind: "confirmed"; version: string }
  | { kind: "unconfirmed"; expectedVersion: string; error: UpdateError };

export type NativeDraftPreparation = Readonly<{
  protectedCount: number;
  blockers: readonly string[];
}>;

/** A build without an update key — a development or local build — cannot
 * check by design. Native reports it as "unavailable" from startup, like any
 * dead end, but it is not a problem to fix: it speaks in a neutral tone, and
 * there is nothing to check again, since a build cannot gain a key while it
 * runs. */
export function isDevelopmentBuild(state: UpdateState): boolean {
  return state.kind === "unavailable" && state.error.code === "not_configured";
}

/** A release with a next step the reader takes: one to download, one to
 * install, or one an unfinished edit is holding back. These, and only these,
 * mark the More actions button and the Settings rail; a running transfer has
 * nothing to ask for and a settled check has nothing to offer. */
export function updateNeedsAttention(state: UpdateState): boolean {
  return state.kind === "available" || state.kind === "ready" || state.kind === "blocked";
}

/** The version whose download just finished out of sight, or null. Only a
 * transfer that settles on "ready" while Settings is closed counts: one the
 * reader watched needs no receipt, and a "ready" read at launch or after a
 * closed Settings finished nothing new. */
export function finishedDownloadOutOfSight(
  previous: UpdateState["kind"],
  next: UpdateState,
  isWatching: boolean,
): string | null {
  if (next.kind !== "ready" || isWatching) return null;
  return previous === "downloading" || previous === "verifying" ? next.candidate.version : null;
}

/** Whether a way into Settings › Updates that says "check" may start one.
 * Only a settled state with nothing offered checks: a fresh check replaces the
 * candidate, so from "Ready to install" it would throw away the download the
 * reader came to install, and during a transfer it would do nothing at all. */
export function checksOnOpen(state: UpdateState): boolean {
  switch (state.kind) {
    case "idle":
    case "current":
    case "cancelled":
    case "failed":
      return true;
    case "unavailable":
      return !isDevelopmentBuild(state);
    default:
      return false;
  }
}
