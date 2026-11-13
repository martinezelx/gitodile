import { RECENT_REMOTE_CHECK_MS, type IntegrationSource } from "./domain";
import type { BringInPort, TeamSyncQuery } from "./port";

export type BringInController = ReturnType<typeof createBringInController>;

/** Freshness belongs to the exact source, project and incarnation. A check of
 * the current upstream cannot make a different branch fresh. */
export function createBringInController(port: BringInPort) {
  const checks = new Map<string, number>();
  const pending = new Map<string, Promise<void>>();
  const keyOf = (query: TeamSyncQuery, source: IntegrationSource): string =>
    JSON.stringify([query.projectId, query.sessionEpoch, source.kind,
      source.kind === "localBranch" ? source.name : source.remote,
      source.kind === "remoteBranch" ? source.branch : null]);
  return {
    port,
    async checkIfNeeded(query: TeamSyncQuery, source: IntegrationSource): Promise<void> {
      if (source.kind === "localBranch") return;
      const key = keyOf(query, source);
      const checked = checks.get(key);
      if (checked !== undefined && Date.now() - checked < RECENT_REMOTE_CHECK_MS) return;
      const held = pending.get(key);
      if (held) return held;
      const request = port.checkSource({ ...query, source }).then(() => {
        if (pending.get(key) !== request) return;
        checks.set(key, Date.now());
        if (checks.size > 256) checks.delete(checks.keys().next().value!);
      }).finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });
      pending.set(key, request);
      return request;
    },
    close(query: TeamSyncQuery): void {
      for (const key of new Set([...checks.keys(), ...pending.keys()])) {
        const [id, epoch] = JSON.parse(key) as string[];
        if (id === query.projectId && epoch === query.sessionEpoch) {
          checks.delete(key);
          pending.delete(key);
        }
      }
    },
  };
}
