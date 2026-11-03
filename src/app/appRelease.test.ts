import { describe, expect, it } from "vitest";

import HIGHLIGHT_ICON_NAMES from "../../docs/release/highlights/icons.json";
import {
  APP_CHANGELOG,
  CURRENT_APP_RELEASE,
  HIGHLIGHT_ICONS,
  buildAppChangelog,
  compareAppReleaseVersions,
} from "./appRelease";

describe("bundled release model", () => {
  it("draws every glyph the release scripts accept, and no other", () => {
    expect([...HIGHLIGHT_ICONS]).toEqual(HIGHLIGHT_ICON_NAMES);
  });

  it("assembles the changelog from the highlights files, newest first, always listing the running build", () => {
    const files = [
      { version: "0.1.0", date: "2026-08-27", highlights: [{ id: "a", icon: "tag" as const, en: "A", es: "A (es)" }] },
      { version: "0.2.10", date: "2026-09-15", highlights: [] },
      { version: "0.2.9", date: "2026-09-14", highlights: [{ id: "b", icon: "bug" as const, en: "B", es: "B (es)" }] },
    ];
    // A pipeline-only release is left out; the running build never is.
    expect(buildAppChangelog(files, "0.2.9").map((entry) => entry.version)).toEqual(["0.2.9", "0.1.0"]);
    expect(buildAppChangelog(files, "0.2.10").map((entry) => entry.version)).toEqual(["0.2.10", "0.2.9", "0.1.0"]);
    // A checkout between releases has no file yet: listed, undated, empty.
    const between = buildAppChangelog(files, "0.2.11");
    expect(between[0]).toEqual({ version: "0.2.11", date: null, highlights: [] });
    // The tag's date wins over the day the branch was cut; a version whose
    // tag the build did not see keeps the file's date.
    const dated = buildAppChangelog(files, "0.2.9", { "0.2.9": "2026-09-16" });
    expect(dated.map((entry) => [entry.version, entry.date])).toEqual([["0.2.9", "2026-09-16"], ["0.1.0", "2026-08-27"]]);
    for (const entry of APP_CHANGELOG) {
      if (entry.version in __APP_RELEASE_DATES__) expect(entry.date).toBe(__APP_RELEASE_DATES__[entry.version]);
    }
    expect(compareAppReleaseVersions("0.2.9", "0.2.10")).toBeLessThan(0);
    expect(compareAppReleaseVersions("0.2.12", "0.3.0")).toBeLessThan(0);
    expect(compareAppReleaseVersions("0.2.0", "0.1.0")).toBeGreaterThan(0);
    // The bundled changelog reads the real directory.
    expect(APP_CHANGELOG.map((entry) => entry.version)).toContain("0.1.0");
    expect(CURRENT_APP_RELEASE.version).toBe(__APP_VERSION__);
  });
});
