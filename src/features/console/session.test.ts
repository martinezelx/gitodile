import { describe, expect, it } from "vitest";
import { createConsoleSessionStore } from "./session";

describe("console sessions", () => {
  it("keeps projects and incarnations isolated and rejects callbacks after close", () => {
    const store = createConsoleSessionStore();
    const first = store.get("/a", "old");
    first.setInput("git status");
    first.setEntries([{ id: 1, kind: "help", input: "help", branch: "main" }]);
    expect(store.get("/b", "other").getSnapshot().entries).toEqual([]);
    expect(store.get("/a", "old")).toBe(first);
    const request = first.currentRequest.current;
    store.close("/a", "old");
    expect(first.currentRequest.current).toBeGreaterThan(request);
    const reopened = store.get("/a", "new");
    first.setInput("late result");
    first.setEntries([]);
    expect(first.getSnapshot().input).toBe("git status");
    expect(reopened.getSnapshot().input).toBe("");
    expect(reopened.getSnapshot().entries).toEqual([]);
  });
});
