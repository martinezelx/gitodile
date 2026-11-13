/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_IDS } from "../shared/theme";

const EXPECTED_IMPORTS = [
  "./styles/tokens.css",
  "./styles/themes.css",
  "./styles/base.css",
  "./styles/theme-transition.css",
  "./app/app-shell.css",
  "./shared/ui/primitives.css",
  "./features/overview/overview.css",
  "./features/home/home.css",
  "./features/clone/clone.css",
  "./features/initialize-project/initialize-project.css",
  "./features/status/status.css",
  "./features/changes/changes.css",
  "./features/save-version/save-version.css",
  "./features/publish/publish.css",
  "./features/sync/sync.css",
  "./features/branches/branches.css",
  "./features/console/console.css",
  "./features/history/history.css",
  "./features/workbench/workbench.css",
  "./features/conflicts/conflicts.css",
  "./features/settings/settings.css",
  "./features/accounts/hosting-connections.css",
  "./features/github/github.css",
  "./features/repository-browser/repository-browser.css",
  "./features/accounts/accounts.css",
  "./features/account/account.css",
  "./features/project-settings/project-settings.css",
  "./features/notifications/notifications.css",
  "./features/app-updates/app-updates.css",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), "src", relativePath), "utf8");
}

type CssRule = { selector: string; body: string };

function readRules(relativePath: string): CssRule[] {
  return [...readSource(relativePath).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim().replace(/\s+/g, " "),
    body: match[2],
  }));
}

/** A sheet without its `pointer: coarse` blocks: the touch tier is an
 * accommodation for a pointer, never a size a guard should judge. */
function withoutCoarse(source: string): string {
  let out = source;
  for (let at = out.indexOf("@media (pointer: coarse)"); at !== -1; at = out.indexOf("@media (pointer: coarse)")) {
    let depth = 0;
    let end = out.indexOf("{", at);
    for (; end < out.length; end += 1) {
      if (out[end] === "{") depth += 1;
      if (out[end] === "}" && (depth -= 1) === 0) break;
    }
    out = out.slice(0, at) + out.slice(end + 1);
  }
  return out;
}

function ruleBody(relativePath: string, selector: string): string {
  const rule = readRules(relativePath).find((candidate) => candidate.selector === selector);
  if (!rule) throw new Error(`${relativePath} does not define ${selector}`);
  return rule.body;
}

describe("production style composition", () => {
  it("keeps the eager cascade order explicit and deterministic", () => {
    const styleEntry = readSource("styles.css");
    const imports = [...styleEntry.matchAll(/@import\s+"([^"]+)";/g)].map((match) => match[1]);
    expect(imports).toEqual(EXPECTED_IMPORTS);
    expect(readSource("app/app-shell.css")).toContain(".app-shell");
  });

  it("keeps closed visual contracts with their feature owners", () => {
    expect(readSource("features/overview/overview.css")).toContain(".next-step");
    expect(readSource("features/clone/clone.css")).toContain(".clone-dialog");
    expect(readSource("features/initialize-project/initialize-project.css")).toContain(".initialize-dialog");
    expect(readSource("features/status/status.css")).toContain(".status-breakdown");
    expect(readSource("features/sync/sync.css")).toContain(".get-team-plan");
    expect(readSource("shared/ui/primitives.css")).toContain(".app-dialog");
    expect(readSource("features/app-updates/app-updates.css")).toContain(".app-update-dialog");
    const changes = readSource("features/changes/changes.css");
    expect(changes).toContain(".changes-file-item__type-icon");
    expect(changes).toContain(".diff-code--accessible");
    expect(changes).toContain("background: var(--surface-code)");
    expect(changes).toContain("@media (max-width: 1024px)");

    const branches = readSource("features/branches/branches.css");
    // Branches pairs the same two panels Changes and History do, off the same two
    // tokens and at the same width the other two narrow on.
    expect(branches).toContain("grid-template-columns: var(--panel-column) minmax(0, 1fr)");
    expect(branches).toContain("height: var(--strip-height)");
    expect(branches).toContain("@media (max-width: 1024px)");

    const settings = readSource("features/settings/settings.css");
    expect(settings).toContain("@media (max-width: 800px)");
    // The panel chrome is shared by both settings panels (task 098), so it
    // belongs to the primitives sheet; only one of them may define it.
    expect(settings).not.toContain(".settings-layout {");
    // The tool row is shared by Settings (Git, GitHub) and the app update row,
    // so it lives in the primitives sheet, not in either feature.
    expect(settings).not.toContain(".tool-row");
    const primitiveChrome = readSource("shared/ui/primitives.css");
    expect(primitiveChrome).toContain(".settings-layout {");
    expect(primitiveChrome).toContain(".tool-row__chip");
    // No screen opens on a page row any more: Changes, History and Branches head
    // their list panels instead, so the shared row is gone and must not come
    // back as a private copy either.
    expect(primitiveChrome).not.toContain(".screen-header {");
    expect(changes).not.toContain(".changes-view__header");
    expect(readSource("features/history/history.css")).not.toContain(".history-view__header");
    // Stacked option cards are shared by line endings and the per-project
    // identity, so exactly one sheet may define them.
    expect(primitiveChrome).toContain(".choice-list__option {");
    expect(settings).not.toContain(".choice-list");
    expect(settings).toContain(".line-endings__caveat");
    expect(readSource("features/project-settings/project-settings.css"))
      .toContain(".project-settings-remote");

    // The reference badge is History's vocabulary and Overview renders it
    // inside its own rows, so exactly one sheet may define it — the later one,
    // or the two definitions start racing in the cascade.
    const history = readSource("features/history/history.css");
    const overview = readSource("features/overview/overview.css");
    expect(EXPECTED_IMPORTS.indexOf("./features/history/history.css"))
      .toBeGreaterThan(EXPECTED_IMPORTS.indexOf("./features/overview/overview.css"));
    expect(history).toContain(".history-ref-badge {");
    expect(overview).not.toContain(".history-ref-badge {");

    // The filter surface — the trigger with its count, the panel, the capsule
    // groups, the switches, the footer and the chips — is shared by Changes and
    // History (task 121), so exactly one sheet may define it. A private copy in
    // either feature is the drift this audit exists to stop; what stays with
    // History is only what History alone asks for.
    expect(primitiveChrome).toContain(".filter-panel {");
    expect(primitiveChrome).toContain(".filter-panel__capsule {");
    expect(primitiveChrome).toContain(".filter-chip {");
    expect(history).not.toContain(".history-filter__panel");
    expect(history).not.toContain(".history-filter__range");
    expect(history).not.toContain(".history-filter-chip");
    expect(changes).not.toContain(".changes-filter__panel");
    expect(changes).not.toContain(".changes-filter__trigger");
    expect(changes).not.toContain(".changes-filter__capsule");
    expect(changes).not.toContain(".changes-filter-chip");
    // Branches asks the same question of a third list, and had kept a private
    // copy of the whole surface — down to a `Sort by` legend that had never
    // picked up the shared sheet's fix for a legend not being a grid item.
    expect(branches).not.toContain(".branches-filter__panel");
    expect(branches).not.toContain(".branches-filter__trigger");
    expect(branches).not.toContain(".branches-filter__range");
    expect(branches).not.toContain(".branches-filter__switch");
    // What each feature is still allowed to own: the parts of its own panel
    // that only it has. History's branch picker, and the one group in
    // Changes that grows with the repository and therefore scrolls.
    expect(history).toContain(".history-scope-picker {");
    expect(changes).toContain(".changes-filter__types {");
    expect(branches).toContain(".branches-filter__prefixes {");

    const appShell = readSource("app/app-shell.css");
    expect(appShell).toContain(".settings-dialog");
    expect(appShell).not.toContain(".settings-layout");
    expect(appShell).toContain(".project-settings-dialog__project");
    expect(settings).not.toContain(".settings-dialog");
    // The titlebar carries no brand at any width: no mark and no wordmark
    // (DESIGN.md § Brand). The mascot lives in the welcome screen and About.
    expect(appShell).not.toContain(".window-titlebar__mark");
    expect(appShell).not.toContain(".window-titlebar__name");
  });

  it("loads shared app menus before feature alignment overrides", () => {
    const primitives = readSource("shared/ui/primitives.css");
    const changes = readSource("features/changes/changes.css");
    const history = readSource("features/history/history.css");
    const branches = readSource("features/branches/branches.css");

    expect(primitives).toContain(".app-menu {");
    // A feature override still has to be able to win on equal specificity —
    // the discard menu is one, because its trigger ends the list's search
    // strip and its items name the list under it: it opens rightward, across
    // the diff, so the files it names stay in view.
    expect(changes).toContain(".changes-actions-menu__popup { right: auto; left: 0;");
    expect(branches).not.toMatch(/^\s*\.app-menu(?:\s|,|\{)/m);

    // The shared view picker is not one, in either of its two hosts. Both put
    // it at the right edge of a panel that clips its own overflow, so both
    // take `.app-menu`'s right-anchored default: the Changes rule that forced
    // `left: 0` (from when that picker sat at the left of a toolbar of its
    // own) opened the menu straight off the panel edge, and History's rule
    // existed only to undo it for its own toolbar.
    expect(changes).not.toMatch(/\.changes-view-picker__menu \{[^}]*left: 0/);
    expect(history).not.toMatch(/\.changes-view-picker__menu \{[^}]*(?:left|right): 0/);
  });

  it("retains theme, focus, reduced-motion and forced-color foundations", () => {
    const themes = readSource("styles/themes.css");
    expect(themes).toContain('[data-theme="gitodile-light"]');
    expect(themes).toContain('[data-theme="gitodile-dark"]');
    expect(themes).toContain("@media (prefers-color-scheme: dark)");
    // The theme layers are the only place colour values live; tokens.css keeps
    // the non-colour foundations and the brand identity. See ADR 0012.
    expect(readSource("styles/tokens.css")).not.toContain('[data-theme="');
    expect(readSource("styles/base.css")).toContain("@media (prefers-reduced-motion: reduce)");
    expect(readSource("styles/base.css")).toContain(':root[data-reduced-motion="true"] *');

    // Theme-change choreography is its own sheet: base.css stays the reset,
    // body and focus foundations rather than the larger half of an effect.
    const themeTransition = readSource("styles/theme-transition.css");
    expect(themeTransition).toContain('[data-theme-transition="fade"]::view-transition-new(root)');
    // One animation for every theme control. The titlebar toggle had a second,
    // origin-anchored one; it was withdrawn, and this keeps its geometry from
    // creeping back in beside the fade rather than replacing it.
    expect(themeTransition).not.toContain("theme-reveal");
    expect(readSource("styles/tokens.css")).not.toContain("--duration-theme-reveal");
    expect(readSource("styles/base.css")).not.toContain("view-transition");
    const primitives = readSource("shared/ui/primitives.css");
    expect(primitives).toContain(":focus-visible");
    expect(primitives).toContain("@media (forced-colors: active)");
    expect(primitives).toContain(".gitodile-mascot__fill { fill: var(--mascot-fill); }");
  });

  // ADR 0012: two layers. The identity colours are declared once in
  // tokens.css and every theme block fills only the swap-able layer. A theme
  // that set an avatar colour would recolour every project chip, and a theme
  // without color-scheme would leave native scrollbars on the old scheme.
  it("keeps the brand layer out of every theme block", () => {
    const themes = readSource("styles/themes.css");
    const brandTokens = ["--avatar-", "--tooltip-"];
    const blocks = [...themes.matchAll(/\[data-theme="[^"]+"\]\s*\{([^}]*)\}/g)];
    expect(blocks.length).toBe(THEME_IDS.length);
    for (const [, body] of blocks) {
      for (const token of brandTokens) {
        expect(body, `${token} leaked into a theme block`).not.toContain(token);
      }
      expect(body).toMatch(/color-scheme:\s*(?:light|dark)/);
    }
    // Every registry theme has a block, and no block is left unnamed.
    for (const id of THEME_IDS) {
      expect(themes).toContain(`[data-theme="${id}"]`);
    }

    // ADR 0033: the brand lime is no longer a token. The interface draws the
    // mark in the ink and the actionable accent is --accent-primary; the lime
    // lives only in the app icon's sources. Bringing --accent-brand back into
    // the cascade, declared or painted with, is the regression this guards.
    const brandLime: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        if (!rule.body.includes("--accent-brand")) continue;
        brandLime.push(`${relativePath}: ${rule.selector}`);
      }
    }
    expect(brandLime).toEqual([]);
  });

  // The base default and the OS-dark override duplicate the official pair: the
  // "match device" preference keeps no data-theme attribute and lets the media
  // query follow the operating system. Duplication is only safe while this
  // holds the two copies together.
  it("keeps the default and OS-dark blocks identical to the official themes", () => {
    const rules = readRules("styles/themes.css");
    const roots = rules.filter((rule) => rule.selector === ":root");
    expect(roots).toHaveLength(2);
    const declarations = (body: string): Record<string, string> =>
      Object.fromEntries(
        [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
      );
    const officialLight = declarations(ruleBody("styles/themes.css", '[data-theme="gitodile-light"]'));
    const officialDark = declarations(ruleBody("styles/themes.css", '[data-theme="gitodile-dark"]'));
    const rootLight = declarations(roots[0].body);
    const rootDark = declarations(roots[1].body);
    for (const [name, value] of Object.entries(officialLight)) {
      expect(rootLight[name], `${name} default differs from gitodile-light`).toBe(value);
    }
    for (const [name, value] of Object.entries(officialDark)) {
      expect(rootDark[name], `${name} OS-dark differs from gitodile-dark`).toBe(value);
    }
  });

  // DESIGN.md § Visual character, Friendly Sheet (ADR 0032): inside the sheet
  // only what floats casts a shadow. The screens' panes and bands are regions
  // of the sheet, and an in-screen notice is a card inside a region; either
  // one wearing a shadow, or the raised surface of what floats, is the old
  // card recipe coming back one surface at a time.
  it("keeps the sheet's regions flat and its notices on the inner-card fill", () => {
    const regions: [string, string][] = [
      ["features/changes/changes.css", ".changes-file-list"],
      ["features/changes/changes.css", ".changes-diff"],
      ["features/history/history.css", ".history-detail__card"],
      ["features/branches/branches.css", ".branches-list-panel"],
      ["features/overview/overview.css", ".next-step"],
      ["features/overview/overview.css", ".overview-history"],
      ["features/overview/overview.css", ".overview-detail"],
    ];
    for (const [file, selector] of regions) {
      const body = ruleBody(file, selector);
      expect(body, `${selector} casts a shadow`).not.toMatch(/box-shadow/);
      expect(body, `${selector} wears a surface of its own`).not.toMatch(/background:\s*var\(--surface-(raised|panel)\)/);
    }
    const notices: [string, string][] = [
      ["features/changes/changes.css", ".changes-status-notice"],
      ["features/changes/changes.css", ".changes-notice"],
      ["features/history/history.css", ".history-banner"],
      ["features/branches/branches.css", ".branches-banner"],
      ["shared/ui/primitives.css", ".automatic-updates-notice"],
      ["shared/ui/primitives.css", ".restore-skipped-notice"],
    ];
    for (const [file, selector] of notices) {
      const body = ruleBody(file, selector);
      expect(body, `${selector} is not on the inner-card fill`).toMatch(/background:\s*var\(--surface-card\)/);
      expect(body, `${selector} casts a shadow`).not.toMatch(/box-shadow/);
    }
  });

  // DESIGN.md § Shape: radius states a role, never a size. A raw length here is
  // how buttons ended up spread across three different values before, so the
  // rule is only worth writing down if something keeps new ones from appearing.
  it("expresses every border-radius as a role token", () => {
    // `0`, `inherit` and the 2px underline/highlight are not shape tiers: they
    // are squaring a corner off, following a parent, or drawing a 2px bar.
    const allowedLiterals = new Set(["0", "inherit", "2px", "2px 2px 0 0"]);
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      const source = readSource(relativePath);
      for (const match of source.matchAll(/border-radius:\s*([^;}]+)/g)) {
        const value = match[1].trim();
        if (allowedLiterals.has(value)) continue;
        // Every remaining declaration must be built only from radius tokens,
        // optionally with `0` corners for a shape squared off on one side.
        const withoutTokens = value.replace(/var\(--radius-[a-z]+\)/g, "").replace(/\b0\b/g, "").trim();
        if (withoutTokens !== "") {
          offenders.push(`${relativePath}: border-radius: ${value}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // DESIGN.md § Shape: a square shape must read as clearly rounded or as a
  // circle, never as a failed circle. This caught three real regressions when
  // it was first run — a 32px copy button that had picked up the surface
  // radius from its container's name, and two project avatars left square
  // while the same avatar was round in the rail.
  it("keeps every square shape out of the failed-circle band", () => {
    const scale: Record<string, number> = { item: 10, control: 14, surface: 18 };
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      const source = readSource(relativePath);
      for (const rule of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const [, selector, body] = rule;
        const token = body.match(/border-radius:\s*var\(--radius-(item|control|surface)\)/);
        // Only rules that pin their own box can be judged; the rest depend on
        // content. The lookbehind has to reject any hyphenated prefix, not just
        // min-/max-: `\b` matches between the hyphen and the word, so a bare
        // `\bwidth` also finds `stroke-width` and `\bheight` finds `line-height`.
        const width = body.match(/(?<![\w-])width:\s*(\d+)px/);
        const height = body.match(/(?<![\w-])height:\s*(\d+)px/);
        if (!token || !width || !height) continue;

        const side = Math.min(Number(width[1]), Number(height[1]));
        const ratio = scale[token[1]] / side;
        if (ratio >= 0.43) {
          offenders.push(
            `${relativePath}: ${selector.trim().split("\n").pop()?.trim()} ` +
              `— ${side}px at --radius-${token[1]} is ${ratio.toFixed(2)} of its side`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the radius roles a concentric chain", () => {
    const tokens = readSource("styles/tokens.css");
    const read = (name: string): number => {
      const match = tokens.match(new RegExp(`--radius-${name}:\\s*(\\d+)px`));
      if (!match) throw new Error(`--radius-${name} is not defined`);
      return Number(match[1]);
    };
    const item = read("item");
    const control = read("control");
    const surface = read("surface");

    // The values are only allowed to move together: a container has to stay
    // the radius of the thing it wraps plus that thing's inset, or every
    // toolbar and menu in the app starts pinching at the corners.
    expect(control).toBe(item + 4);
    expect(surface).toBe(item + 8);
    expect(surface).toBe(control + 4);
  });

  // DESIGN.md § Size. The button primitive used to declare padding and radius
  // and nothing else, so its height fell out of `line-height: normal` over the
  // browser's default 16px — a number nobody chose, different per platform.
  // Height and type size are one decision and both belong here.
  it("keeps the labelled button primitive sized from tokens", () => {
    const tokens = readSource("styles/tokens.css");
    const read = (name: string): number => {
      const match = tokens.match(new RegExp(`--control-height-${name}:\\s*(\\d+)px`));
      if (!match) throw new Error(`--control-height-${name} is not defined`);
      return Number(match[1]);
    };
    expect(read("sm")).toBeLessThan(read("md"));
    // `lg` is the coarse-pointer accommodation, so it is the only tier allowed
    // to exceed the house size, and it has to clear the 44px touch target.
    expect(read("lg")).toBeGreaterThanOrEqual(44);
    expect(tokens).toMatch(/--control-font-sm:/);
    expect(tokens).toMatch(/--control-font-md:/);

    const primitive = ruleBody("shared/ui/primitives.css", ".primary-button, .secondary-button");
    expect(primitive).toMatch(/min-height:\s*var\(--control-height-md\)/);
    expect(primitive).toMatch(/font-size:\s*var\(--control-font-md\)/);
  });

  // The drift this replaced: five features had each pinned their own button
  // height (38, 39, 42, 43 and 44px), and four of them shipped the 44px
  // coarse-pointer size to every mouse user by writing it as a fixed
  // `min-height`. A feature may restyle a button; it may not resize one.
  it("keeps feature CSS from resizing the button primitive", () => {
    // No exceptions. The one there was — the History diff pane's footer, whose
    // buttons ran at 30px — went with the footer itself: stepping between
    // changes is the shared arrow pair in the diff header now, the same
    // control Changes uses, and it is not a labelled button at all.
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "shared/ui/primitives.css") continue;
      for (const rule of readRules(relativePath)) {
        // The button itself, not something inside it: `... .secondary-button svg`
        // sizing its own glyph is the feature's business, so only a selector
        // whose final compound *is* the button counts.
        const targetsButton = rule.selector
          .split(",")
          .some((one) => /(?:primary|secondary)-button[\w-]*(?::[\w-]+(?:\([^)]*\))?)*$/.test(one.trim()));
        if (!targetsButton) continue;
        const size = rule.body.match(/(?<![\w-])(min-height|height|font-size):\s*(\d[\d.]*)px/);
        if (size) {
          offenders.push(`${relativePath}: ${rule.selector} — ${size[1]}: ${size[2]}px`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // The drift this replaced: History had reached for 630, 680 and 760 while
  // every other screen sat on 600/650/700, and eight of its surfaces used a
  // bare `<strong>` — which the browser renders at 700, the loudest step the
  // app owns. One screen read as bold throughout and no single rule looked
  // wrong. A weight is a role now, and a role has a token.
  it("keeps font weight on the scale", () => {
    const tokens = readSource("styles/tokens.css");
    for (const step of ["normal", "medium", "strong", "heading", "title"]) {
      expect(tokens).toMatch(new RegExp(`--weight-${step}:\\s*\\d`));
    }
    // `<strong>` is semantic, so it must not inherit the browser's 700.
    expect(readSource("styles/base.css")).toMatch(
      /strong,\s*b\s*\{[^}]*font-weight:\s*var\(--weight-strong\)/,
    );

    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "styles/tokens.css") continue;
      for (const rule of readRules(relativePath)) {
        const literal = rule.body.match(/(?<![\w-])font-weight:\s*(\d[\d.]*)/);
        if (literal) offenders.push(`${relativePath}: ${rule.selector} — font-weight: ${literal[1]}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  // The type scale is the same idea one axis over. It is not yet a guard —
  // most screens still carry sizes that predate it — so this only holds the
  // steps themselves in place for the code that has moved onto them.
  it("keeps the type scale defined", () => {
    const tokens = readSource("styles/tokens.css");
    for (const step of ["display", "title", "subtitle", "lead", "body", "label", "caption", "micro"]) {
      expect(tokens).toMatch(new RegExp(`--text-${step}:\\s*\\d`));
    }
    // DESIGN.md § Size states that a label and the control it names agree, so
    // the two pairs are the same number. Nothing but this stops them drifting
    // apart the next time one of the four is edited on its own.
    const step = (name: string) => tokens.match(new RegExp(`${name}:\\s*([\\d.]+)px`))?.[1];
    expect(step("--control-font-md")).toBe(step("--text-body"));
    expect(step("--control-font-sm")).toBe(step("--text-label"));

    // Whole pixels: every ramp this one was calibrated against (macOS, Fluent,
    // VS Code, GitHub Desktop) uses integers, and the halves we used to carry
    // were the mark of one step too many rather than a decision.
    for (const declaration of tokens.matchAll(/--(?:text|control-font)-[\w-]+:\s*([\d.]+)px/g)) {
      expect(Number(declaration[1]) % 1).toBe(0);
    }
  });

  // Every sheet in the eager cascade is on the scale now, so this is the whole
  // app rather than one screen's guard. The drift it replaced: 248 literal
  // sizes across fourteen sheets, spread over twenty-two distinct values —
  // 14.5, 16, 18, 20 and 21 among them, each reasonable where it was written
  // and none of them agreeing with the next sheet over.
  it("keeps font size on the scale", () => {
    // DESIGN.md § Typography names both: the label inside a miniature drawing
    // of the navigation rail, and the console's ASCII mascot, whose characters
    // are shading. Neither is text anyone reads, and neither fits the floor.
    const documentedExceptions = new Set([
      ".navigation-display__preview small",
      ".console-art",
      ".console-watermark .console-art",
      ".console-welcome .console-art",
    ]);
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        if (documentedExceptions.has(rule.selector)) continue;
        const literal = rule.body.match(/(?<![\w-])font-size:\s*([\d.]+)px/);
        if (literal) offenders.push(`${relativePath}: ${rule.selector} — font-size: ${literal[1]}px`);
        // The `font:` shorthand carries the size and the weight inside itself,
        // so neither this guard nor the weight one could see it: six rules hid
        // there, one of them still on 11.5px after the whole cascade had moved.
        const shorthand = rule.body.match(/(?<![\w-])font:\s*(?!inherit)([^;]*)/);
        if (shorthand && /(?:^|\s)\d[\d.]*(?:px|\/|$)|\/\s*\d|(?:^|\s)[1-9]00(?:\s|$)/.test(shorthand[1])) {
          offenders.push(`${relativePath}: ${rule.selector} — font: ${shorthand[1].trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // `--text-*` used to mean two unrelated things: nine sizes and two colors.
  // The colors carry a `-color` suffix now, which is only worth the rename if
  // something keeps the two halves from leaking back into each other.
  it("keeps --text-* a size and --text-*-color a color", () => {
    const tokens = readSource("styles/tokens.css");
    expect(tokens).not.toMatch(/--text-(?:primary|secondary):/);
    const themes = readSource("styles/themes.css");
    expect(themes).toMatch(/--text-primary-color:/);
    expect(themes).toMatch(/--text-secondary-color:/);

    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "styles/tokens.css") continue;
      for (const rule of readRules(relativePath)) {
        for (const use of rule.body.matchAll(/font-size:\s*var\((--text-[\w-]+)\)/g)) {
          if (use[1].endsWith("-color")) {
            offenders.push(`${relativePath}: ${rule.selector} sizes text with ${use[1]}`);
          }
        }
        for (const use of rule.body.matchAll(/(?<![\w-])color:\s*var\((--text-[\w-]+)\)/g)) {
          if (!use[1].endsWith("-color")) {
            offenders.push(`${relativePath}: ${rule.selector} colors text with ${use[1]}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // The fifth typographic axis, and the last one still repeating itself: the
  // monospace stack was written out verbatim twelve times across the cascade.
  // TypeScript had already named it; CSS was the half that never did.
  it("keeps the font stacks named once", () => {
    const tokens = readSource("styles/tokens.css");
    const step = (name: string) => tokens.match(new RegExp(`${name}:\\s*([\\d.]+)px`))?.[1];
    expect(tokens).toMatch(/--font-sans:\s*\S/);
    expect(tokens).toMatch(/--font-mono:\s*\S/);

    // `diffPreferences.tsx` builds the diff's font preference in TypeScript and
    // has to spell the fallback stack out. The two copies must stay in step.
    const token = tokens.match(/--font-mono:\s*([^;]+);/)?.[1].trim();
    const constant = readSource("features/changes/diffPreferences.tsx")
      .match(/const SYSTEM_MONO_STACK = '([^']+)'/)?.[1];
    expect(constant).toBe(token);

    // The same shape one file over. `DiffResultView` seeds its row-height
    // estimate with `.diff-code`'s line box before the first measurement lands,
    // and it can only spell that out. It said 20 — "matching the CSS's
    // `font: 12.5px/1.6`" — through a move to 13px and then to 12px, so the
    // number and the comment explaining it were both wrong for two scale
    // changes running. It is written as the two factors now, and this is what
    // makes the next one fail loudly.
    const seed = readSource("features/changes/DiffResultView.tsx")
      .match(/const FALLBACK_LINE_HEIGHT = ([\d.]+) \* ([\d.]+);/);
    expect(seed).not.toBeNull();
    const diffCode = ruleBody("features/changes/changes.css", ".diff-code");
    expect(diffCode).toContain("font-size: var(--text-label)");
    expect(diffCode).toContain("line-height: var(--leading-code)");
    expect(seed?.[1]).toBe(step("--text-label"));
    expect(seed?.[2]).toBe(tokens.match(/--leading-code:\s*([\d.]+)/)?.[1]);
    // The lines are inside a `<code>`, whose browser default is the generic
    // `monospace`: the chosen font has to be inherited past it explicitly.
    expect(ruleBody("features/changes/changes.css", ".diff-code > code")).toContain("font-family: inherit");

    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "styles/tokens.css") continue;
      for (const rule of readRules(relativePath)) {
        if (/ui-monospace|ui-sans-serif/.test(rule.body)) {
          offenders.push(`${relativePath}: ${rule.selector} spells out a font stack`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // The two axes the size and weight passes had left alone. Twelve line heights
  // for four roles plus code, and eleven tracking values including −0.005,
  // −0.012 and −0.018em — differences of a fifth of a pixel at the sizes they
  // were written on, which is to say differences nobody could see.
  it("keeps leading and tracking on their scales", () => {
    const tokens = readSource("styles/tokens.css");
    for (const step of ["none", "tight", "snug", "normal", "code"]) {
      expect(tokens).toMatch(new RegExp(`--leading-${step}:\\s*\\d`));
    }
    for (const step of ["hero", "tight", "wide", "caps"]) {
      expect(tokens).toMatch(new RegExp(`--tracking-${step}:\\s*-?[\\d.]`));
    }

    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "styles/tokens.css") continue;
      for (const rule of readRules(relativePath)) {
        const leading = rule.body.match(/(?<![\w-])line-height:\s*([\d.]+)/);
        if (leading) offenders.push(`${relativePath}: ${rule.selector} — line-height: ${leading[1]}`);
        // `letter-spacing: 0` is a reset, not a value someone picked: the
        // tooltip uses it to shed whatever tracking it was rendered inside of.
        const tracking = rule.body.match(/(?<![\w-])letter-spacing:\s*(-?[\d.]*[\d]e?m)/);
        if (tracking) offenders.push(`${relativePath}: ${rule.selector} — letter-spacing: ${tracking[1]}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  // The other way a feature invents a size: not by overriding a button, but by
  // declaring a control-height variable of its own. The Changes toolbar had one
  // at 34px and the History diff workspace overrode it to 32 — one control
  // wearing two heights, invisible to a guard that only watches button rules.
  it("keeps control-height variables derived from the scale", () => {
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "styles/tokens.css") continue;
      for (const declaration of readSource(relativePath).matchAll(
        /(--[\w-]*control-height[\w-]*):\s*([^;}]+)/g,
      )) {
        const [, name, value] = declaration;
        if (!value.includes("var(--control-height-")) {
          offenders.push(`${relativePath}: ${name} is ${value.trim()}, not derived from the scale`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // A control-height variable is scoped to whichever container declares it, so
  // a control shared between two screens depends on each host remembering to.
  // The History diff toolbar reuses `DiffViewSelector` from outside
  // `.changes-layout`; when it stopped declaring the variable, the `height`
  // became invalid at computed-value time and the trigger collapsed from 32px
  // to its text. A fallback makes that failure land on the row tier instead of
  // on nothing.
  it("keeps control-height variable reads fallback-safe", () => {
    // A token on `:root` is always in scope and needs no fallback. Only the
    // feature-scoped variables — the ones a host has to remember to declare —
    // are at risk here.
    const tokens = readSource("styles/tokens.css");
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const use of readSource(relativePath).matchAll(
        /(?<![\w-])(?:min-)?height:\s*var\((--[\w-]*control-height[\w-]*)([^)]*)\)/g,
      )) {
        const [, name, rest] = use;
        if (tokens.includes(`${name}:`)) continue;
        if (!rest.includes(",")) {
          offenders.push(`${relativePath}: height: var(${name}) has no fallback`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps audited shape roles and concentric menu insets explicit", () => {
    const expectedDeclarations = [
      ["app/app-shell.css", ".titlebar-menu__list", "padding: var(--space-2)"],
      ["app/app-shell.css", ".palette-list", "padding: var(--space-2)"],
      ["app/app-shell.css", ".app-menu.project-quick-switch", "padding: var(--space-2)"],
      // A project's chip is the same rounded square wherever it is drawn —
      // one left round is the drift that made "the same project" look like two.
      ["app/app-shell.css", ".status-bar__avatar", "border-radius: var(--radius-identity)"],
      ["app/app-shell.css", ".project-quick-switch__avatar", "border-radius: var(--radius-identity)"],
      ["features/home/home.css", ".home-launcher__avatar", "border-radius: var(--radius-identity)"],
      ["features/settings/settings.css", ".project-icons-card__avatar", "border-radius: var(--radius-identity)"],
      ["features/project-settings/project-settings.css", ".project-icon-preview__avatar", "border-radius: var(--radius-identity)"],
      // A dialog's header glyph and a progress step's dot are atomic marks
      // with no reading direction: circles, in every dialog that shows them.
      ["shared/ui/primitives.css", ".app-dialog__glyph", "border-radius: var(--radius-round)"],
      ["shared/ui/primitives.css", ".app-dialog__step-dot", "border-radius: var(--radius-round)"],
      ["features/overview/overview.css", ".overview-history__node", "border-radius: var(--radius-round)"],
      ["features/overview/overview.css", ".next-step__glyph", "border-radius: var(--radius-round)"],
      ["features/settings/settings.css", ".identity-block__confirm", "border-radius: var(--radius-surface)"],
      // Every project chip carries the neutral brand ring. The fixed palette
      // cannot clear 3:1 on the lighter community dark panels (Nord, Catppuccin
      // Frappé) with white text still at 4.5:1, so the ring is what keeps the
      // chip edged against any surface — dropping it from one avatar is the
      // regression this keeps from returning. See tokens.css and ADR 0012.
      ["app/app-shell.css", ".status-bar__avatar", "box-shadow: var(--avatar-ring)"],
      ["app/app-shell.css", ".project-quick-switch__avatar", "box-shadow: var(--avatar-ring)"],
      ["features/home/home.css", ".home-launcher__avatar", "box-shadow: var(--avatar-ring)"],
      // The shared filter trigger, which Changes and History both wear in the
      // trailing slot of their search box: an affordance attached to the box
      // rather than a control of its own, so it stays rectangular.
      ["shared/ui/primitives.css", ".filter-control__trigger", "border-radius: var(--radius-item)"],
      // The quick switch's two footer actions were rows in the menu and carried
      // the item radius. They are `.ghost-button`s now — they leave the control
      // rather than choose inside it — so their shape comes from the primitive
      // and stating it again here would be the drift this audit exists to stop.
    ] as const;

    for (const [file, selector, declaration] of expectedDeclarations) {
      expect(ruleBody(file, selector), `${file}: ${selector}`).toContain(declaration);
    }
  });

  it("keeps badges and chips capsule-shaped", () => {
    const offenders: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        if (!/(?:badge|chip)/.test(rule.selector) || !/border-radius:/.test(rule.body)) continue;
        if (rule.body.includes("border-radius: var(--radius-pill)")) continue;
        // A chip may hold a control, and the control does not inherit the
        // chip's shape just by carrying its name. DESIGN.md § Shape settles
        // that one: a square box of 22px or under is named a circle, because
        // at that size any radius worth seeing has already closed it into one.
        // Anything wider than it is tall is the chip itself and still has to
        // be a capsule.
        const width = rule.body.match(/(?<![\w-])width:\s*(\d+)px/);
        const height = rule.body.match(/(?<![\w-])height:\s*(\d+)px/);
        const isSmallCircle = rule.body.includes("border-radius: var(--radius-round)")
          && width !== undefined && height !== undefined
          && width !== null && height !== null
          && width[1] === height[1] && Number(width[1]) <= 22;
        // The chip's own remove button takes its size from DESIGN.md § Size.
        const isChipButton = rule.body.includes("border-radius: var(--radius-round)")
          && rule.body.includes("width: var(--icon-button-chip)");
        if (isSmallCircle || isChipButton) continue;
        offenders.push(`${relativePath}: ${rule.selector}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("does not give button-like controls a link cursor", () => {
    const pointerRules: string[] = [];

    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        if (/cursor:\s*pointer/.test(rule.body)) {
          pointerRules.push(`${relativePath}: ${rule.selector}`);
        }
      }
    }

    // DESIGN.md § Pointer cursors reserves the hand for real links and text
    // actions deliberately styled as links, and for nothing else — every
    // ordinary button keeps the platform arrow cursor. Seven controls qualify:
    // the update link and the licence/source pair in About, About's copy
    // control, About's stack credits (they leave the app for another site),
    // Save version's detail toggle, a dialog's inline way out ("Add in
    // Settings", "Save without hooks just this once") and a toast's action.
    // Anything else appearing here is the drift this guard exists to catch.
    expect(pointerRules).toEqual([
      "app/app-shell.css: .about-dialog__update-link",
      "app/app-shell.css: .about-technical__copy",
      "app/app-shell.css: .about-dialog__legal button",
      "app/app-shell.css: .about-stack__item",
      "shared/ui/primitives.css: .app-dialog__link",
      "shared/ui/primitives.css: .app-toast__action",
      "features/save-version/save-version.css: .save-version-detail__toggle",
    ]);
  });

  it("keeps element defaults and layout-property motion out of the cascade", () => {
    const primitives = readSource("shared/ui/primitives.css").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(primitives).not.toMatch(/(?:^|})\s*nav\s*\{/m);

    const offenders: string[] = [];
    const layoutProperty = /\b(?:width|height|top|right|bottom|left|margin|padding|gap|grid-template|flex-basis)\b/;
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        for (const transition of rule.body.matchAll(/transition(?:-property)?:\s*([^;}]+)/g)) {
          if (layoutProperty.test(transition[1])) {
            offenders.push(`${relativePath}: ${rule.selector} — ${transition[1].trim()}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // DESIGN.md § Elevation. Stacking was eleven literal numbers from 1 to 1000
  // with nothing saying which floats over which; a menu opened from a dialog
  // lands above it only because 30 happens to beat 10.
  it("stacks what floats over the window on the layer scale", () => {
    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        const zIndex = rule.body.match(/(?<![\w-])z-index:\s*([^;}]+)/);
        if (!zIndex) continue;
        const value = zIndex[1].trim();
        if (/^var\(--layer-[a-z-]+\)$/.test(value)) continue;
        // A single digit orders things inside one component's own box, which
        // never competes with a surface over the window.
        const local = /^\d$/.test(value) && !/position:\s*fixed/.test(rule.body);
        if (!local) offenders.push(`${relativePath}: ${rule.selector} — z-index: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // DESIGN.md § Elevation: a shadow that casts is one of the theme's
  // `--shadow-*`. Rings (`0 0 0 2px`) and underlines draw an edge, not depth,
  // so a layer with no blur is not a shadow in this sense.
  it("casts every shadow from an elevation token", () => {
    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "styles/tokens.css" || relativePath === "styles/themes.css") continue;
      for (const rule of readRules(relativePath)) {
        for (const shadow of rule.body.matchAll(/(?<![\w-])box-shadow:\s*([^;}]+)/g)) {
          // Each comma-separated layer outside a function's parentheses.
          const layers = shadow[1].split(/,(?![^(]*\))/);
          const casts = layers.some((layer) => {
            const lengths = [...layer.replace(/var\([^)]*\)|color-mix\([^)]*\)/g, "").matchAll(/-?[\d.]+px|\b0\b/g)];
            return lengths.length >= 3 && Number.parseFloat(lengths[2][0]) !== 0;
          });
          if (casts) offenders.push(`${relativePath}: ${rule.selector} — box-shadow: ${shadow[1].trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // DESIGN.md § Motion: something arriving uses `--ease-emphasized`, leaving
  // takes `--duration-exit`, and every transition takes a `--duration-*`. The
  // three curves below are not arrivals and DESIGN.md names each of them.
  it("keeps easing curves and transition lengths on the motion tokens", () => {
    const pendingCurves = new Set([
      // A rail glyph's hover turn eases in and out so a 60° turn reads as one.
      "app/app-shell.css: cubic-bezier(0.45, 0, 0.25, 1)",
      // The mascot's hop is choreography, not an interface transition.
      "shared/ui/primitives.css: cubic-bezier(0.3, 0, 0.3, 1)",
      // A theme change cross-fades the whole window; nothing arrives.
      "styles/theme-transition.css: cubic-bezier(0.4, 0, 0.2, 1)",
    ]);
    const pendingLengths = new Set<string>();
    const curves: string[] = [];
    const lengths: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "styles/tokens.css") continue;
      const source = readSource(relativePath).replace(/\/\*[\s\S]*?\*\//g, "");
      for (const curve of source.matchAll(/cubic-bezier\([^)]*\)/g)) {
        const entry = `${relativePath}: ${curve[0]}`;
        if (!pendingCurves.has(entry)) curves.push(entry);
      }
      for (const transition of source.matchAll(/(?<![\w-])transition(?:-duration)?:\s*([^;}]+)/g)) {
        for (const length of transition[1].matchAll(/(?<![\w-])\d[\d.]*m?s\b/g)) {
          const entry = `${relativePath}: ${length[0]}`;
          if (!pendingLengths.has(entry)) lengths.push(entry);
        }
      }
    }
    expect(curves).toEqual([]);
    expect(lengths).toEqual([]);
  });

  // DESIGN.md § Accessibility: a control that hides the browser's outline must
  // show focus some other way. Each entry names the rule that does, and the
  // ones mapped to `null` are not controls but landing points for focus moved
  // by script, whose own surface already says where focus is.
  it("replaces every removed focus outline", () => {
    const replacements: Record<string, string | null> = {
      ".status-bar__search-input": ".status-bar__search:focus-within",
      ".status-bar__search-input:focus-visible": ".status-bar__search:focus-within",
      ".project-quick-switch__search input": ".project-quick-switch__search:focus-within",
      ".settings-dialog": null,
      ".about-dialog": ".about-dialog:focus-visible",
      ".issue-report-dialog__report-body": ".issue-report-dialog__report:has(.issue-report-dialog__report-body:focus-visible)",
      // Focused when a "What's new" opens Settings › Updates; the scroll is the cue.
      ".app-whats-new:focus": null,
      ".text-field input": ".text-field input:focus-visible",
      ".text-field select": ".text-field select:focus-visible",
      ".search-box__field input": ".search-box:has(.search-box__field input:focus)",
      "input.docked-composer__field": "input.docked-composer__field:focus",
      ".app-dialog": null,
      ".app-dialog__head h2": null,
      // The field exists only while renaming, and draws its own underline.
      "input.branches-rename__field": "input.branches-rename__field",
      ".branches-quick-switch__search input": ".branches-quick-switch__search:focus-within",
      ".changes-quick-commit__desc": ".changes-quick-commit__desc:focus",
      ".console-prompt input": ".console-prompt__line:focus-within .console-prompt__cursor",
      ".console-statusline__search-input": ".console-statusline__search:focus-within",
      ".console-shortcuts__field input": ".console-shortcuts__field input:focus",
      ".console-picker": ".console-picker:focus-visible",
      ".history-scope-picker__search input": ".history-scope-picker__search:focus-within",
      ".history-filter__field input": ".history-filter__field:focus-within",
      ".home-launcher__field input": ".home-launcher__field:focus-within",
      ".home-status__search-input": ".home-status__search:focus-within",
      ".save-version-description textarea": ".save-version-description textarea:focus-visible",
    };
    const selectors = new Set<string>();
    const removals: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        const parts = rule.selector.split(",").map((one) => one.trim());
        for (const part of parts) selectors.add(part);
        if (/(?<![\w-])outline:\s*(?:none|0)\b/.test(rule.body)) removals.push(...parts);
      }
    }
    const unmapped = removals.filter((selector) => !(selector in replacements));
    const missing = removals
      .map((selector) => replacements[selector])
      .filter((target): target is string => typeof target === "string" && !selectors.has(target));
    expect(unmapped).toEqual([]);
    expect(missing).toEqual([]);
  });

  // DESIGN.md § Design tokens: spacing sits on the 4px grid. The 403 values
  // between its steps (6, 10 and 14px above all) moved up onto it; 1px is a
  // hairline and 2px the one optical nudge, neither a step of space.
  it("keeps spacing on the 4px grid", () => {
    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        const body = rule.body.replace(/\/\*[\s\S]*?\*\//g, "");
        for (const spacing of body.matchAll(/(?<![\w-])(?:(?:padding|margin)(?:-[a-z-]+)?|gap|row-gap|column-gap):\s*([^;}]+)/g)) {
          for (const length of spacing[1].matchAll(/(?<![\w.])-?(\d+(?:\.\d+)?)px\b/g)) {
            const value = Number(length[1]);
            if (value > 2 && value % 4 !== 0) offenders.push(`${relativePath}: ${rule.selector} — ${spacing[0].trim()}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // DESIGN.md § Icons. Glyph sizes had spread over fourteen values from 10 to
  // 25px; a glyph is sized by the role of what it sits in now.
  it("sizes every icon by role", () => {
    const tokens = readSource("styles/tokens.css");
    for (const role of ["badge", "meta", "row", "control", "nav", "tile"]) {
      expect(tokens).toMatch(new RegExp(`--icon-${role}:\\s*\\d+px`));
    }
    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        if (!rule.selector.split(",").some((one) => /\bsvg\b[^\s]*$/.test(one.trim()))) continue;
        for (const size of rule.body.matchAll(/(?<![\w-])(?:width|height):\s*(\d+(?:\.\d+)?)px/g)) {
          offenders.push(`${relativePath}: ${rule.selector} — ${size[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // DESIGN.md § Tints. The accent alone was mixed at fourteen strengths, so a
  // selected row was 7% on one screen and 12% on the next. A tint of an
  // interface colour takes its strength from a `--tint-*` role; what stays a
  // literal is not a tint of the interface — a miniature, a search highlight,
  // a progress track, a timeline rail — and is named here.
  it("mixes interface tints at a role's strength", () => {
    const notTints = [
      "theme-preview__line",
      "history-match",
      "diff-search-match",
      "loading-bar__indicator",
      "branches-route__hit",
      "history-boundary[data-rail]",
      "history-row[data-rail",
    ];
    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath.startsWith("styles/")) continue;
      for (const rule of readRules(relativePath)) {
        if (rule.selector.startsWith(":root") || /^(?:[\d%, ]+|to|from)$/.test(rule.selector)) continue;
        if (notTints.some((name) => rule.selector.includes(name))) continue;
        const body = rule.body.replace(/\/\*[\s\S]*?\*\//g, "");
        for (const mix of body.matchAll(/color-mix\(in srgb, var\((--(?:accent-primary|status-[a-z]+|text-primary-color|tone[a-z-]*|diff-(?:added|removed)))\) ([\d.]+%)/g)) {
          offenders.push(`${relativePath}: ${rule.selector} — ${mix[1]} ${mix[2]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // DESIGN.md § Tints: an unavailable control looks equally unavailable
  // everywhere. Seven opacities from 0.35 to 0.6 had said it before.
  it("dims every disabled control by one opacity", () => {
    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        if (!/:disabled|aria-disabled|--disabled/.test(rule.selector)) continue;
        const opacity = rule.body.match(/(?<![\w-])opacity:\s*([^;}]+)/);
        if (opacity && opacity[1].trim() !== "var(--opacity-disabled)" && opacity[1].trim() !== "1") {
          offenders.push(`${relativePath}: ${rule.selector} — opacity: ${opacity[1].trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
  // DESIGN.md § Size: a square icon button's size says where it sits. Nine
  // sizes from 20 to 36px had grown, so a toast's close and a notification's
  // were two different buttons. The touch tier inside `pointer: coarse` is an
  // accommodation, not a size, and the window controls follow the system.
  it("sizes every square icon button by where it sits", () => {
    const iconButton = /button|__(?:clear|dismiss|close|more|favourite|forget|action|step|back|remove|trigger|read|filter|publish)(?![\w-])|-round$/;
    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      const source = withoutCoarse(readSource(relativePath).replace(/\/\*[\s\S]*?\*\//g, ""));
      for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = match[1].trim().replace(/\s+/g, " ");
        if (selector.includes("window-control") || !iconButton.test(selector) || /svg|kbd/.test(selector)) continue;
        const width = match[2].match(/(?<![\w-])width:\s*(\d+)px/);
        const height = match[2].match(/(?<![\w-])height:\s*(\d+)px/);
        if (width && height && width[1] === height[1] && Number(width[1]) >= 20 && Number(width[1]) <= 40) {
          offenders.push(`${relativePath}: ${selector} — ${width[1]}px`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
  // DESIGN.md § Core screens: a screen with nothing to show reuses one block,
  // and a list with nothing to show one line. Three screens had copied the
  // block's glyph tile and eleven lists had their own line, so a feature's
  // empty rule may place the shared pattern but not restyle it.
  it("keeps empty states on the shared block and line", () => {
    // A sentence in place rather than an empty list: a version with no
    // message, a release with no highlights, a settings note, What's new's
    // prose and the branch detail's one line when there are no other branches.
    const prose = new Set([
      ".changelog-release__empty",
      ".branches-detail--empty",
      ".history-details__message--empty",
      ".hosting-accounts__empty",
      ".whatsnew-empty",
    ]);
    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      if (relativePath === "shared/ui/primitives.css") continue;
      for (const rule of readRules(relativePath)) {
        if (/(?:__|-)empty-icon\b/.test(rule.selector)) offenders.push(`${relativePath}: ${rule.selector} — own glyph tile`);
        if (!/(?:__|-)empty$/.test(rule.selector) || prose.has(rule.selector)) continue;
        const restyled = rule.body.match(/(?<![\w-])(?:padding|font-size|color|text-align)\s*:/);
        if (restyled) offenders.push(`${relativePath}: ${rule.selector} — ${restyled[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // DESIGN.md § Motion: a spinner turns one way everywhere. Three identical
  // keyframes at three speeds had grown, one per feature.
  it("turns every spinner on the one keyframe", () => {
    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      const source = readSource(relativePath);
      for (const keyframes of source.matchAll(/@keyframes\s+([\w-]+)\s*\{\s*to\s*\{\s*transform:\s*rotate\(360deg\)/g)) {
        if (!(relativePath === "shared/ui/primitives.css" && keyframes[1] === "spin")) offenders.push(`${relativePath}: @keyframes ${keyframes[1]}`);
      }
      for (const use of source.matchAll(/animation:\s*spin\s+([^\s;]+)/g)) {
        if (use[1] !== "900ms") offenders.push(`${relativePath}: spin ${use[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
  // DESIGN.md § Size: a control that is not square takes its height from a
  // tier too. Nine heights from 24 to 38px had grown in chips, fields, tabs and
  // pickers. The switch has its own geometry, and the select-all box matches
  // the file rows it heads; the touch tier is left to `pointer: coarse`, and
  // below 24px a chip is sized by its text (the compact timeline chip).
  it("takes every control's fixed height from a tier", () => {
    const ownGeometry = new Set([".toggle-switch", ".changes-file-list__select-all .changes-file-row__pick"]);
    const control = /button|input|field|select|trigger|search|picker|control|__tab\b|__seg\b|__block\b|submit|option|toggle|capsule|chip|segment|step|action|textarea/;
    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      const source = withoutCoarse(readSource(relativePath).replace(/\/\*[\s\S]*?\*\//g, ""));
      for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = match[1].trim().replace(/\s+/g, " ");
        if (ownGeometry.has(selector) || !control.test(selector) || /svg|window-control|scrollbar|::(?:before|after)/.test(selector)) continue;
        const height = match[2].match(/(?<![\w-])(?:min-)?height:\s*(\d+)px/);
        if (!height || Number(height[1]) < 24 || Number(height[1]) > 44) continue;
        const width = match[2].match(/(?<![\w-])width:\s*(\d+)px/);
        if (width && width[1] === height[1]) continue;
        offenders.push(`${relativePath}: ${selector} — ${height[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // DESIGN.md § Icons: a glyph sized through its own class rather than an
  // `svg` selector is still an icon, and takes the same roles. Thirty-five had
  // escaped the svg guard at seven sizes. A tile with its own fill or radius is
  // a container, not a glyph, and the window controls follow the system.
  it("sizes icons named by their class by role", () => {
    const glyph = /(?:__|-)(?:icon|chevron|caret|glyph|category|refreshing|indicator|alert|mark)(?:$|[\s.:>[])|__type(?: img)?$/;
    const offenders: string[] = [];
    for (const importPath of EXPECTED_IMPORTS) {
      const relativePath = importPath.replace("./", "");
      for (const rule of readRules(relativePath)) {
        const last = rule.selector.split(",").pop()?.trim() ?? "";
        if (/svg|window-control/.test(last) || !glyph.test(last)) continue;
        if (/border-radius|background/.test(rule.body)) continue;
        const width = rule.body.match(/(?<![\w-])width:\s*(\d+)px/);
        const height = rule.body.match(/(?<![\w-])height:\s*(\d+)px/);
        if (width && height && width[1] === height[1] && Number(width[1]) <= 25) {
          offenders.push(`${relativePath}: ${rule.selector} — ${width[1]}px`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
