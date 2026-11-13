import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_LIMIT,
  markNotificationsRead,
  notificationAction,
  recordNotification,
  unreadNotificationCount,
  type AppNotification,
  type NotificationDetails,
  type NotificationRequest,
} from "./domain";

let nextId = 0;

function request(
  details: NotificationDetails,
  projectId: string | null = "/projects/alpha",
): NotificationRequest {
  nextId += 1;
  return {
    id: `n${nextId}`,
    createdAt: 1_000 * nextId,
    details,
    projectId,
    projectName: projectId === null ? null : "alpha",
  };
}

const teamChanges = (behind: number, remoteCommit = "abc"): NotificationDetails => ({
  kind: "teamChangesAvailable",
  behind,
  remoteCommit,
});

const published = (versionCount: number): NotificationDetails => ({
  kind: "changesPublished",
  versionCount,
  destination: "origin/main",
});

describe("recording notifications", () => {
  it("puts the newest entry first", () => {
    const first = recordNotification([], request(published(1)));
    const both = recordNotification(first, request(teamChanges(2)));

    expect(both.map((entry) => entry.details.kind)).toEqual([
      "teamChangesAvailable",
      "changesPublished",
    ]);
  });

  it("brings a background event in unread and a user's own action in read", () => {
    const list = recordNotification(recordNotification([], request(published(1))), request(teamChanges(1)));

    expect(unreadNotificationCount(list)).toBe(1);
    expect(list.find((entry) => entry.details.kind === "changesPublished")?.read).toBe(true);
    expect(list.find((entry) => entry.details.kind === "teamChangesAvailable")?.read).toBe(false);
  });

  it("collapses a repeated background kind for the same project", () => {
    let list: AppNotification[] = [];
    for (let index = 0; index < 5; index += 1) {
      list = recordNotification(list, request(teamChanges(3)));
    }

    expect(list).toHaveLength(1);
    expect(list[0]?.details).toMatchObject({ behind: 3 });
  });

  it("keeps one entry per project rather than one overall", () => {
    const alpha = recordNotification([], request(teamChanges(1), "/projects/alpha"));
    const both = recordNotification(alpha, request(teamChanges(4), "/projects/beta"));

    expect(both).toHaveLength(2);
    expect(both.map((entry) => entry.projectId)).toEqual(["/projects/beta", "/projects/alpha"]);
  });

  it("keeps repeated news in place with its original identity and arrival time", () => {
    const first = recordNotification([], request(teamChanges(2)));
    const [original] = first;
    const withReceipt = recordNotification(first, request(published(1)));
    const repeated = recordNotification(withReceipt, {
      ...request(teamChanges(2)), projectName: "Renamed project",
    });

    expect(repeated.map((entry) => entry.id)).toEqual(withReceipt.map((entry) => entry.id));
    expect(repeated[1]).toMatchObject({
      id: original!.id, createdAt: original!.createdAt, read: false, projectName: "Renamed project",
    });
    const changed = recordNotification(repeated, request(teamChanges(3, "def")));
    expect(changed[0]?.id).not.toBe(original!.id);
    expect(changed[0]?.read).toBe(false);
    expect(changed[0]?.details).toMatchObject({ behind: 3 });
  });

  it("does not light the badge again when a collapsed entry says the same thing", () => {
    const first = recordNotification([], request(teamChanges(2, "abc")));
    const read = markNotificationsRead(first);
    const again = recordNotification(read, request(teamChanges(2, "abc")));

    expect(again).toHaveLength(1);
    expect(unreadNotificationCount(again)).toBe(0);
  });

  it("lights the badge again when the same kind now says something different", () => {
    const read = markNotificationsRead(recordNotification([], request(teamChanges(2, "abc"))));
    const moved = recordNotification(read, request(teamChanges(5, "def")));

    expect(moved).toHaveLength(1);
    expect(unreadNotificationCount(moved)).toBe(1);
  });

  it("collapses a repeated app update on its version and re-lights the badge for a newer one", () => {
    const update = (version: string): NotificationDetails => ({ kind: "appUpdateAvailable", version });
    const read = markNotificationsRead(recordNotification([], request(update("0.3.0"), null)));
    const same = recordNotification(read, request(update("0.3.0"), null));
    expect(same).toHaveLength(1);
    expect(unreadNotificationCount(same)).toBe(0);

    const newer = recordNotification(same, request(update("0.3.1"), null));
    expect(newer).toHaveLength(1);
    expect(unreadNotificationCount(newer)).toBe(1);
    expect(notificationAction(newer[0]!)).toBe("reviewAppUpdate");

    // A finished download is new news about the same version: one entry, unread.
    const ready = recordNotification(markNotificationsRead(newer), request({ kind: "appUpdateAvailable", version: "0.3.1", ready: true }, null));
    expect(ready).toHaveLength(1);
    expect(unreadNotificationCount(ready)).toBe(1);
  });

  it("does not collapse two publishes: they are two events", () => {
    const list = recordNotification(recordNotification([], request(published(1))), request(published(3)));

    expect(list).toHaveLength(2);
  });

  it("keeps a failed check and an available-changes entry apart", () => {
    const list = recordNotification(
      recordNotification([], request(teamChanges(1))),
      request({ kind: "remoteCheckFailed", reason: "No network" }),
    );

    expect(list).toHaveLength(2);
    expect(unreadNotificationCount(list)).toBe(2);
  });

  it("caps the list and drops the oldest entries", () => {
    let list: AppNotification[] = [];
    for (let index = 0; index < NOTIFICATION_LIMIT + 10; index += 1) {
      list = recordNotification(list, request(published(index)));
    }

    expect(list).toHaveLength(NOTIFICATION_LIMIT);
    expect(list[0]?.details).toMatchObject({ versionCount: NOTIFICATION_LIMIT + 9 });
  });
});

describe("reading notifications", () => {
  it("returns the same array when there was nothing unread", () => {
    const list = recordNotification([], request(published(1)));
    expect(markNotificationsRead(list)).toBe(list);
  });

  it("marks everything read otherwise", () => {
    const list = recordNotification([], request(teamChanges(1)));
    expect(unreadNotificationCount(markNotificationsRead(list))).toBe(0);
  });
});

describe("notification actions", () => {
  it("offers the review flow only for available project changes with a project", () => {
    const [available] = recordNotification([], request(teamChanges(1)));
    const [publishedEntry] = recordNotification([], request(published(1)));
    const [orphan] = recordNotification([], request(teamChanges(1), null));

    expect(available && notificationAction(available)).toBe("reviewTeamChanges");
    expect(publishedEntry && notificationAction(publishedEntry)).toBeNull();
    expect(orphan && notificationAction(orphan)).toBeNull();
  });
});
