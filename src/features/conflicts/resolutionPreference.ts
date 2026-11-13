/** Whether the reader has had Mark resolved explained once. Per-app and
 * local to this computer: losing it only means the explanation shows again. */
const KEY = "gitodile.conflicts.markResolvedExplained";

export function hasSeenMarkResolvedExplanation(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberMarkResolvedExplanation(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Unavailable storage: the explanation shows again next time.
  }
}
