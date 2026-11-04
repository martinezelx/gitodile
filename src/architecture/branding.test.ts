/// <reference types="node" />

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildIssueReportUrl, FEEDBACK_REPOSITORY_URL } from "../app/issueReport";
import { describeStack } from "../app/stack";

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("product identity", () => {
  it("keeps JavaScript, Rust, desktop and browser names aligned", () => {
    const packageJson = JSON.parse(readSource("package.json")) as { name: string };
    const tauri = JSON.parse(readSource("src-tauri/tauri.conf.json")) as {
      productName: string;
      identifier: string;
      app: { windows: Array<{ title: string }> };
    };
    const cargo = readSource("src-tauri/Cargo.toml");

    expect(packageJson.name).toBe("gitodile");
    expect(cargo).toMatch(/\[package\]\s+name = "gitodile"/);
    expect(cargo).toMatch(/\[lib\]\s+name = "gitodile_lib"/);
    expect(readSource("src-tauri/src/main.rs")).toContain("gitodile_lib::run()");
    expect(tauri.productName).toBe("GitOdile");
    expect(tauri.identifier).toBe("app.gitodile.desktop");
    expect(tauri.app.windows.map((window) => window.title)).toEqual(["GitOdile"]);
    expect(readSource("index.html")).toContain("<title>GitOdile</title>");
  });

  it("points issue reporting at the public repository", () => {
    expect(FEEDBACK_REPOSITORY_URL).toBe("https://github.com/martinezelx/gitodile");
    expect(readSource("src/app/issueReport.ts")).not.toContain("project-gitodile");
    expect(readSource("src/app/TitlebarMenu.tsx")).not.toContain("github.com");
  });
});

/** The permission and the URL live in two files that nothing else connects:
 * `opener:allow-open-url` enables the command but ships no scope, so an
 * unlisted destination is refused at the Rust boundary. */
describe("desktop link permissions", () => {
  type Capability = {
    permissions: Array<string | { identifier: string; allow?: Array<{ url?: string }> }>;
  };

  /** `glob::Pattern` with default options, which is what the opener plugin
   * uses: a trailing `*` matches the rest of the string, separators included.
   * Only that one shape is modelled, because only that one shape is used. */
  function scopeAllows(patterns: string[], url: string): boolean {
    return patterns.some((pattern) =>
      pattern.endsWith("*") ? url.startsWith(pattern.slice(0, -1)) : pattern === url,
    );
  }

  function openerScope(): string[] {
    const capability = JSON.parse(readSource("src-tauri/capabilities/default.json")) as Capability;
    const entry = capability.permissions.find(
      (permission) => typeof permission === "object" && permission.identifier === "opener:allow-open-url",
    );
    if (typeof entry !== "object") {
      throw new Error("opener:allow-open-url is listed without a scope, so every URL is refused");
    }
    return (entry.allow ?? []).flatMap((allowed) => (allowed.url === undefined ? [] : [allowed.url]));
  }

  it("lets the app open the issue report it builds", () => {
    const url = buildIssueReportUrl("GitOdile 0.1.0\nSystem: Windows 11");

    expect(scopeAllows(openerScope(), url)).toBe(true);
  });

  it("keeps the prefill reading the headings Rust actually writes", () => {
    // `buildIssueReportUrl` finds the environment by these two literals. Renamed
    // in Rust alone, nothing throws: the prefill quietly falls back to the whole
    // report, and a full session is a 12,000-character address GitHub answers
    // with 414 instead of a form.
    const rust = readSource("src-tauri/src/diagnostics.rs");
    expect(rust).toContain('String::from("Environment\\n-----------\\n")');
    expect(rust).toContain('"\\n\\nSession activity\\n----------------\\n"');

    const url = new URL(buildIssueReportUrl(
      "Environment\n-----------\nGitOdile 0.1.0\n\nSession activity\n----------------\nEvents: 0 retained of 0\n",
    ));
    expect(url.searchParams.get("diagnostics")).toBe("GitOdile 0.1.0");
  });

  it("lets the app open the Git download pages Rust hands it", () => {
    const tooling = readSource("src-tauri/src/tooling.rs");
    const urls = [...tooling.matchAll(/const GIT_\w+_DOWNLOAD_URL: &str = "([^"]+)";/g)].map(
      (match) => match[1],
    );

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(scopeAllows(openerScope(), url), url).toBe(true);
    }
  });

  it("lets Settings open the GitHub CLI instructions from Rust and the repair button", () => {
    const sources = [
      readSource("src-tauri/src/tooling.rs"),
      readSource("src/features/settings/GhToolingSection.tsx"),
    ];
    const urls = sources.flatMap((source) => [...source.matchAll(/"(https:\/\/github\.com\/cli\/cli[^"\s]*)"/g)].map((match) => match[1]));
    expect(new Set(urls).size).toBe(4);
    for (const url of urls) {
      expect(scopeAllows(openerScope(), url), url).toBe(true);
    }
  });

  it("lets About open the home page of every layer it credits", () => {
    // The chips are a claim the reader should be able to check, and an
    // unlisted host fails silently: the scope is where a new credit is most
    // easily forgotten.
    for (const layer of describeStack({ tauri: "1", react: "1", rust: "1" })) {
      expect(scopeAllows(openerScope(), layer.url), layer.name).toBe(true);
    }
  });

  it("lets About open its source repository and licence", () => {
    for (const url of [
      "https://github.com/martinezelx/gitodile",
      "https://github.com/martinezelx/gitodile/blob/main/LICENSE",
    ]) {
      expect(scopeAllows(openerScope(), url), url).toBe(true);
    }
  });

  it("keeps the scope off the open web", () => {
    // Every capability can contribute scopes. Reject extra permissions such
    // as opener:default/allow-default-urls as well as extra allowed hosts.
    const files = readdirSync(resolve(process.cwd(), "src-tauri/capabilities"));
    expect(files).toEqual(["default.json"]);
    const capability = JSON.parse(readSource("src-tauri/capabilities/default.json")) as Capability;
    const openerPermissions = capability.permissions.filter((permission) =>
      (typeof permission === "string" ? permission : permission.identifier).startsWith("opener:"),
    );
    expect(openerPermissions).toEqual([{
      identifier: "opener:allow-open-url",
      allow: [
        { url: "https://github.com/martinezelx/gitodile/*" },
        { url: "https://github.com/martinezelx/gitodile" },
        { url: "https://git-scm.com/install/windows" },
        { url: "https://git-scm.com/install/mac" },
        { url: "https://git-scm.com/install/linux" },
        { url: "https://gitlab.com/gitlab-org/cli#installation" },
        { url: "https://github.com/cli/cli#installation" },
        { url: "https://github.com/login/device" },
        { url: "https://github.com/cli/cli#windows" },
        { url: "https://github.com/cli/cli#macos" },
        { url: "https://github.com/cli/cli/blob/trunk/docs/install_linux.md" },
        { url: "https://tauri.app/*" },
        { url: "https://react.dev/*" },
        { url: "https://www.rust-lang.org/*" },
      ],
    }]);
    for (const url of [
      "https://example.com/", "http://github.com/martinezelx/gitodile/issues/new",
      "https://github.com/other/tracker/issues/new", "file:///C:/private.txt", "mailto:user@example.com",
      "https://github.com/cli/cli/issues/new", "https://git-scm.com/other",
      "https://github.com/login/device/other", "https://github.com/login/device?next=https://example.com",
    ]) {
      expect(scopeAllows(openerScope(), url)).toBe(false);
    }
  });
});
