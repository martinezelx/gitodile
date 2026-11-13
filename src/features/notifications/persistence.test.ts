import { describe, expect, it } from "vitest";
import { NOTIFICATION_LIMIT, type AppNotification } from "./domain";
import { parseNotificationHistory, serializeNotificationHistory } from "./persistence";

const entry: AppNotification = {
  id: "persisted-1", createdAt: 1000, read: false, projectId: null, projectName: null,
  details: { kind: "appUpdateAvailable", version: "0.4.2" },
};
const envelope = { version: 1, notifications: [entry], acknowledgedUpdateVersion: null };

describe("bounded local notification history", () => {
  it("round-trips typed notices and independent update acknowledgment", () => {
    const history = { notifications: [entry], acknowledgedUpdateVersion: "0.4.1" };
    expect(parseNotificationHistory(serializeNotificationHistory(history))).toEqual(history);
    const ready = { notifications: [{ ...entry, details: { ...entry.details, ready: true as const } }], acknowledgedUpdateVersion: null };
    expect(parseNotificationHistory(serializeNotificationHistory(ready))).toEqual(ready);
  });

  it("never serializes detailed error reasons or unrecognized entry fields", () => {
    const failure = { ...entry, details: { kind: "remoteCheckFailed" as const,
      reason: "https://user:secret@example.com/private", extra: "private detail" }, commandOutput: "private output" };
    const raw = serializeNotificationHistory({ notifications: [failure], acknowledgedUpdateVersion: null });
    expect(raw).not.toContain("secret");
    expect(raw).not.toContain("private");
    expect(parseNotificationHistory(raw).notifications[0]?.details).toEqual({ kind: "remoteCheckFailed", reason: null });
  });

  it.each([
    null, { ...envelope, version: 2 }, { ...envelope, acknowledgedUpdateVersion: "1.0.0-beta" },
    { ...envelope, notifications: [entry, entry] },
    { ...envelope, notifications: Array.from({ length: NOTIFICATION_LIMIT + 1 }, (_, i) => ({ ...entry, id: `n${i}` })) },
    ...[
      { id: "" }, { read: "false" }, { createdAt: -1 }, { createdAt: 1.5 },
      { projectId: "x".repeat(4097) }, { projectName: "x".repeat(257) },
      { details: { kind: "futureKind" } },
      { projectId: "/project" },
      { details: { kind: "teamChangesAvailable", behind: -1, remoteCommit: null } },
      { details: { kind: "changesPublished", versionCount: "1", destination: null } },
      { details: { kind: "upstreamGone", branch: [], remote: null } },
      { details: { kind: "appUpdateAvailable", version: "0.4.2", ready: false } },
    ].map((change) => ({ ...envelope, notifications: [{ ...entry, ...change }] })),
  ])("rejects unsupported or malformed history %#", (value) => {
    expect(() => parseNotificationHistory(JSON.stringify(value))).toThrow();
  });

  it("bounds input before parsing and rejects broken JSON", () => {
    expect(() => parseNotificationHistory(" ".repeat(512_001))).toThrow();
    expect(() => parseNotificationHistory("{")).toThrow();
  });

  it("restores every supported project event without arbitrary extra fields", () => {
    for (const details of [
      { kind: "teamChangesAvailable", behind: 2, remoteCommit: "abc" },
      { kind: "upstreamGone", branch: "topic", remote: "origin" },
      { kind: "changesPublished", versionCount: 0, destination: "origin/main" },
    ] as const) {
      const value = { ...envelope, notifications: [{ ...entry, projectId: "/project", projectName: "Project", details }] };
      expect(parseNotificationHistory(JSON.stringify(value)).notifications[0]?.details).toEqual(details);
    }
  });
});
