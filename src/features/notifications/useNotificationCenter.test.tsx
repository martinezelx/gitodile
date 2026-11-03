import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useNotificationCenter } from "./useNotificationCenter";

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

const teamChanges = {
  details: { kind: "teamChangesAvailable", behind: 2, remoteCommit: "abc" },
  projectId: "/projects/alpha",
  projectName: "alpha",
} as const;

describe("the notification store", () => {
  it("records nothing while notifications are turned off", () => {
    const { result } = renderHook(() => useNotificationCenter(false));

    act(() => result.current.notify(teamChanges));

    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it("stops recording the moment the preference goes off, without losing the list", () => {
    const { result, rerender } = renderHook(({ enabled }) => useNotificationCenter(enabled), {
      initialProps: { enabled: true },
    });

    act(() => result.current.notify(teamChanges));
    expect(result.current.notifications).toHaveLength(1);

    rerender({ enabled: false });
    act(() =>
      result.current.notify({
        ...teamChanges,
        projectId: "/projects/beta",
        projectName: "beta",
      }),
    );

    // What was already recorded stays readable; only new entries stop arriving.
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]?.projectName).toBe("alpha");
  });

  it("counts unread entries and clears them on read", () => {
    const { result } = renderHook(() => useNotificationCenter(true));

    act(() => result.current.notify(teamChanges));
    expect(result.current.unreadCount).toBe(1);

    act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.notifications).toHaveLength(1);
  });

  it("gives every entry its own id, even for the same event twice", () => {
    const { result } = renderHook(() => useNotificationCenter(true));

    act(() => {
      result.current.notify({
        details: { kind: "changesPublished", versionCount: 1, destination: null },
        projectId: "/projects/alpha",
        projectName: "alpha",
      });
      result.current.notify({
        details: { kind: "changesPublished", versionCount: 1, destination: null },
        projectId: "/projects/alpha",
        projectName: "alpha",
      });
    });

    const [first, second] = result.current.notifications;
    expect(result.current.notifications).toHaveLength(2);
    expect(first?.id).not.toBe(second?.id);
  });

  it("empties the list on clear", () => {
    const { result } = renderHook(() => useNotificationCenter(true));

    act(() => result.current.notify(teamChanges));
    act(() => result.current.clear());

    expect(result.current.notifications).toHaveLength(0);
  });

  it("removes one entry on dismiss and leaves the rest in place", () => {
    const { result } = renderHook(() => useNotificationCenter(true));

    act(() => {
      result.current.notify(teamChanges);
      result.current.notify({
        details: { kind: "changesPublished", versionCount: 1, destination: null },
        projectId: "/projects/beta",
        projectName: "beta",
      });
    });

    const [newest, oldest] = result.current.notifications;
    act(() => result.current.dismiss(newest!.id));

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]?.id).toBe(oldest?.id);
  });
});


describe("deliberate reading and persistent history", () => {
  const update = (version = "0.4.2") => ({ details: { kind: "appUpdateAvailable" as const, version } });

  it("changes one notice, supports unread again, and leaves later arrivals unread after a bulk action", () => {
    const { result } = renderHook(() => useNotificationCenter(true));
    act(() => { result.current.notify(teamChanges); result.current.notify(update()); });
    const id = result.current.notifications[0]!.id;
    act(() => result.current.setRead(id, true));
    expect(result.current.unreadCount).toBe(1);
    act(() => result.current.setRead(id, false));
    expect(result.current.unreadCount).toBe(2);
    act(() => { result.current.markAllRead(); result.current.notify(update("0.4.3")); });
    expect(result.current.unreadCount).toBe(1);
    expect(result.current.notifications[0]?.details).toEqual(update("0.4.3").details);
  });

  it("restores read/unread state even with recording disabled and uses distinct IDs after restart", () => {
    const first = renderHook(() => useNotificationCenter(true));
    act(() => { first.result.current.notify(teamChanges); first.result.current.notify(update()); });
    const updateId = first.result.current.notifications[0]!.id;
    act(() => first.result.current.setRead(updateId, true));
    const saved = first.result.current.notifications;
    first.unmount();
    const second = renderHook(({ enabled }) => useNotificationCenter(enabled), { initialProps: { enabled: false } });
    expect(second.result.current.notifications).toEqual(saved);
    expect(second.result.current.unreadCount).toBe(1);
    second.rerender({ enabled: true });
    act(() => second.result.current.notify({ ...teamChanges, projectId: "/beta" }));
    expect(new Set(second.result.current.notifications.map((entry) => entry.id)).size).toBe(3);
  });

  it.each(["dismiss", "clear", "evict"] as const)("keeps update acknowledgment independent of %s and restart", (operation) => {
    const first = renderHook(() => useNotificationCenter(true));
    act(() => first.result.current.notify(update()));
    const id = first.result.current.notifications[0]!.id;
    act(() => {
      if (operation === "dismiss") first.result.current.dismiss(id);
      else if (operation === "clear") first.result.current.clear();
      else {
        first.result.current.setRead(id, true);
        for (let i = 0; i < 51; i++) first.result.current.notify({
          details: { kind: "changesPublished", versionCount: i, destination: null },
        });
      }
    });
    first.unmount();
    const second = renderHook(() => useNotificationCenter(true));
    act(() => second.result.current.notify(update()));
    expect(second.result.current.notifications.every((entry) => entry.details.kind !== "appUpdateAvailable")).toBe(true);
    expect(second.result.current.unreadCount).toBe(0);
    expect(second.result.current.notifications.length).toBeLessThanOrEqual(50);
    act(() => second.result.current.notify(update("0.4.3")));
    expect(second.result.current.unreadCount).toBe(1);
  });

  it("brings an acknowledged update back once its download is ready", () => {
    const { result } = renderHook(() => useNotificationCenter(true));
    act(() => result.current.notify(update()));
    act(() => result.current.markAllRead());
    act(() => result.current.notify(update()));
    expect(result.current.unreadCount).toBe(0);
    act(() => result.current.notify({ details: { kind: "appUpdateAvailable", version: "0.4.2", ready: true } }));
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.unreadCount).toBe(1);
  });

  it("keeps identical restored failures read without persisting their detailed text", () => {
    const first = renderHook(() => useNotificationCenter(true));
    const failure = { ...teamChanges, details: { kind: "remoteCheckFailed" as const, reason: "Server unavailable" } };
    act(() => first.result.current.notify(failure));
    act(() => first.result.current.markAllRead());
    first.unmount();
    const second = renderHook(() => useNotificationCenter(true));
    act(() => second.result.current.notify(failure));
    expect(second.result.current.unreadCount).toBe(0);
  });

  it("keeps live notices usable if writing storage fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Full"); });
    const { result } = renderHook(() => useNotificationCenter(true));
    act(() => result.current.notify(teamChanges));
    expect(result.current.hasStorageWarning).toBe(true);
    expect(result.current.unreadCount).toBe(1);
    act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
  });

  it("recovers from corrupt or unreadable history without crashing", () => {
    localStorage.setItem("gitodile-notification-history", "{");
    const first = renderHook(() => useNotificationCenter(true));
    expect(first.result.current.hasStorageWarning).toBe(true);
    expect(first.result.current.notifications).toEqual([]);
    first.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Unavailable"); });
    const second = renderHook(() => useNotificationCenter(true));
    expect(second.result.current.hasStorageWarning).toBe(true);
    act(() => second.result.current.notify(update()));
    expect(second.result.current.unreadCount).toBe(1);
  });
});
