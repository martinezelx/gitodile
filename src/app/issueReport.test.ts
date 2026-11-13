import { describe, expect, it } from "vitest";

import { buildIssueReportUrl, FEEDBACK_REPOSITORY_URL, reportWithoutActivity } from "./issueReport";
import { diagnosticReportFileName } from "./issueReportAdapter";

describe("issue report url", () => {
  it("selects the Spanish form without changing its diagnostics field", () => {
    const url = new URL(buildIssueReportUrl("GitOdile 0.1.0\nSession activity", "es"));
    expect(url.searchParams.get("template")).toBe("bug-es.yml");
    expect(url.searchParams.get("diagnostics")).toContain("GitOdile 0.1.0");
  });
  it("opens the dedicated public tracker's bug form, not the source repository", () => {
    const url = new URL(buildIssueReportUrl("reviewed report"));

    expect(`${url.origin}${url.pathname}`).toBe(`${FEEDBACK_REPOSITORY_URL}/issues/new`);
    // The template has to be named: without it GitHub shows the chooser and
    // drops every prefilled value on the way through.
    expect(url.searchParams.get("template")).toBe("bug.yml");
    expect(url.href).not.toContain("project-gitodile");
  });

  it("prefills the environment the user reviewed", () => {
    const report = "Environment\n-----------\nGitOdile 0.1.0\n\nSession activity\n----------------\n+00:00.012  git  read-only  status";
    const url = new URL(buildIssueReportUrl(report));

    expect(url.searchParams.get("diagnostics")).toBe("GitOdile 0.1.0");
  });

  it("encodes the newlines rather than leaking them into the query string", () => {
    // A raw newline in a URL is what makes `openUrl` hand the shell a
    // truncated address, so this is the property that actually has to hold.
    expect(buildIssueReportUrl("GitOdile 0.1.0\nSystem: Windows 11")).not.toMatch(/[\n\r]/);
  });
});

describe("an address GitHub will accept", () => {
  function report(events: number): string {
    const activity = Array.from(
      { length: events },
      (_, index) => `+00:0${index % 10}.000  git  read-only  read_working_tree_status  status  exit 0  12 ms`,
    );
    return `Environment\n-----------\nGitOdile 0.2.1\nSystem: Windows 11 (x86_64)\nGit: 2.55.0.windows.3\n\nSession activity\n----------------\nStarted: 2026-09-04T20:54:10Z\nDuration: 4 min 1 sec\nEvents: ${events} retained of ${events}\n\n${activity.join("\n")}\n`;
  }

  it("prefills the versions alone, without the report's own headings", () => {
    const sent = new URL(buildIssueReportUrl(report(3))).searchParams.get("diagnostics");

    expect(sent).toBe("GitOdile 0.2.1\nSystem: Windows 11 (x86_64)\nGit: 2.55.0.windows.3");
  });

  it.each([
    ["the versions alone", {}],
    ["a full title and the paste reminder", { title: "x".repeat(120), pasteReminder: "Paste the report GitOdile copied below this line." }],
  ])("stays short whatever the session did, with %s", (_, options) => {
    // A full buffer encodes to some twelve thousand characters, and GitHub
    // answers a link that long with 414 instead of a prefilled form. The
    // activity reaches the issue through the clipboard or the attached file.
    const url = buildIssueReportUrl(report(200), "en", options);

    expect(url.length).toBeLessThan(900);
    expect(url).not.toContain("read_working_tree_status");
    expect(url).not.toContain("Session+activity");
  });

  it("asks for the paste where it goes, after the versions", () => {
    const sent = new URL(buildIssueReportUrl(report(3), "en", { pasteReminder: "Paste below." })).searchParams.get("diagnostics");

    expect(sent).toBe("GitOdile 0.2.1\nSystem: Windows 11 (x86_64)\nGit: 2.55.0.windows.3\n\nPaste below.");
  });

  it.each([
    ["  Publishing fails  ", "[Bug]: Publishing fails"],
    ["   ", null],
  ])("keeps the form's prefix on the reader's title %j", (title, expected) => {
    expect(new URL(buildIssueReportUrl(report(1), "en", { title })).searchParams.get("title")).toBe(expected);
  });

  it("leaves the activity out of the text itself, not of a flag beside it", () => {
    expect(reportWithoutActivity(report(3))).toBe("Environment\n-----------\nGitOdile 0.2.1\nSystem: Windows 11 (x86_64)\nGit: 2.55.0.windows.3");
  });

  it("still prefills something when session activity was never rendered", () => {
    const sent = new URL(
      buildIssueReportUrl("Environment\n-----------\nGitOdile test\n\nSession activity\n----------------\nSession activity was unavailable."),
    ).searchParams.get("diagnostics");

    expect(sent).toBe("GitOdile test");
  });
});

describe("saved report file name", () => {
  it("distinguishes each saved report by build and moment, in UTC", () => {
    const name = diagnosticReportFileName(new Date("2026-09-04T14:23:05.412Z"));

    expect(name).toMatch(/^gitodile-report-[\w.-]+-20260904T142305Z\.txt$/);
    expect(name).not.toBe(diagnosticReportFileName(new Date("2026-09-04T14:23:06.000Z")));
  });

  it("carries nothing that identifies the machine or the person", () => {
    // The file is attached by hand to a public issue, so its name is published
    // alongside it. Only the build and the moment may appear there.
    expect(diagnosticReportFileName()).toMatch(/^gitodile-report-[A-Za-z0-9.-]+\.txt$/);
  });
});
