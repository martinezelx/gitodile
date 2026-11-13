/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEME_IDS } from "../shared/theme";

/** ADR 0012: a theme is admitted only if everything the app writes in it stays
 * readable. This reads `styles/themes.css` - the real shipping values - rather
 * than the registry, so a hand-edited colour is what the guard sees.
 *
 * The contract measures every pairing the stylesheets actually paint, not only
 * text on the four base surfaces: text on a control, on a hovered or selected
 * row and on an inner card; accent and status colours used as words; the
 * label of a solid button; diff ink on its own tinted line; and syntax on the
 * code well. Each floor is WCAG AA for what the pairing is: 4.5:1 for text
 * (GitOdile's type tops out at 13px bold, which is never "large text"), 3:1
 * for an icon, a focus ring or a deliberately muted code comment. */

const THEMES_CSS = readFileSync(resolve(process.cwd(), "src", "styles", "themes.css"), "utf8");
const TOKENS_CSS = readFileSync(resolve(process.cwd(), "src", "styles", "tokens.css"), "utf8");

/** Every token a theme must define, so switching leaves no value behind. */
const REQUIRED_TOKENS = [
  "--surface-app",
  "--surface-panel",
  "--surface-raised",
  "--surface-code",
  "--surface-hover",
  "--surface-active",
  "--surface-control",
  "--border-control",
  "--text-primary-color",
  "--text-secondary-color",
  "--border-subtle",
  "--border-divider",
  "--accent-primary",
  "--accent-primary-contrast",
  "--accent-primary-fill",
  "--status-success",
  "--status-warning",
  "--status-danger",
  "--status-danger-contrast",
  "--status-renamed",
  "--tone-local",
  "--accent-heart",
  "--diff-added",
  "--diff-removed",
  "--syntax-comment",
  "--syntax-string",
  "--syntax-number",
  "--syntax-keyword",
  "--syntax-type",
  "--syntax-property",
  "--focus-ring",
  "--overlay",
  "--shadow-sm",
  "--shadow-md",
  "--shadow-lg",
  "--shadow-up",
] as const;

type Rgb = [number, number, number];
type Block = { id: string; scheme: string | undefined; tokens: Record<string, string> };

const TEXT_FLOOR = 4.5;
const NON_TEXT_FLOOR = 3;

/** How much of a diff colour tints its own line: `.diff-line--addition` and
 * friends in `features/changes/changes.css`. */
const DIFF_WASH_STRENGTH = 0.12;

function parseBlock(body: string): Record<string, string> {
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

function readThemeBlocks(): Block[] {
  return [...THEMES_CSS.matchAll(/\[data-theme="([^"]+)"\]\s*\{([^}]*)\}/g)].map((match) => ({
    id: match[1],
    scheme: match[2].match(/color-scheme:\s*(\w+)/)?.[1],
    tokens: parseBlock(match[2]),
  }));
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  const expanded =
    value.length === 3
      ? value
          .split("")
          .map((character) => character + character)
          .join("")
      : value;
  return [
    Number.parseInt(expanded.slice(0, 2), 16),
    Number.parseInt(expanded.slice(2, 4), 16),
    Number.parseInt(expanded.slice(4, 6), 16),
  ];
}

/** `color-mix(in srgb, <top> <weight>, <bottom>)` - and equally an `rgba()`
 * layer composited over an opaque surface - as the browser resolves it: a
 * straight blend of the encoded channels. */
function blend(top: Rgb, weight: number, bottom: Rgb): Rgb {
  return top.map((channel, index) => Math.round(channel * weight + bottom[index] * (1 - weight))) as Rgb;
}

/** A token as an opaque colour: a hex value directly, or an `rgba()` layer
 * composited over `backdrop`. */
function resolveColour(value: string, backdrop: Rgb): Rgb {
  if (/^#[0-9a-fA-F]{3,6}$/.test(value)) return hexToRgb(value);
  const rgba = value.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/);
  if (!rgba) throw new Error(`Cannot resolve colour ${value}`);
  const [, r, g, b, alpha] = rgba;
  return blend([Number(r), Number(g), Number(b)], Number(alpha), backdrop);
}

function luminance([r, g, b]: Rgb): number {
  const channel = (component: number): number => {
    const value = component / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: Rgb, background: Rgb): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Perceptual distance between two colours: Euclidean distance in OKLab,
 * scaled by 100 so about 2 is the smallest step the eye notices. */
function perceptualDistance(first: Rgb, second: Rgb): number {
  const oklab = (rgb: Rgb): Rgb => {
    const [r, g, b] = rgb.map((component) => {
      const value = component / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const [a, b] = [oklab(first), oklab(second)];
  return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** A theme's colours, resolved to opaque values, plus the surfaces the
 * stylesheets derive from them. */
function paletteOf(block: Block) {
  const hex = (token: string): Rgb => hexToRgb(block.tokens[token]);
  const panel = hex("--surface-panel");
  const raised = hex("--surface-raised");
  const code = hex("--surface-code");
  const surfaces: Record<string, Rgb> = {
    app: hex("--surface-app"),
    panel,
    raised,
    code,
    control: hex("--surface-control"),
    // `--surface-card` in tokens.css.
    card: blend(raised, 0.48, panel),
    hover: resolveColour(block.tokens["--surface-hover"], panel),
    active: resolveColour(block.tokens["--surface-active"], panel),
  };
  return { hex, panel, raised, code, surfaces };
}

function measure(
  failures: string[],
  id: string,
  label: string,
  foreground: Rgb,
  background: Rgb,
  floor: number,
): void {
  const ratio = contrast(foreground, background);
  if (ratio < floor) failures.push(`${id}: ${label} is ${ratio.toFixed(2)}:1 (needs ${floor}:1)`);
}

describe("theme contrast contract", () => {
  const blocks = readThemeBlocks();

  it("covers every registered theme exactly once", () => {
    expect(blocks.map((block) => block.id).sort()).toEqual([...THEME_IDS].sort());
  });

  it("defines every required token in every theme", () => {
    for (const block of blocks) {
      const missing = REQUIRED_TOKENS.filter((token) => block.tokens[token] === undefined);
      expect(missing, `${block.id} is missing ${missing.join(", ")}`).toEqual([]);
    }
  });

  it("keeps body and secondary text at 4.5:1 on every surface text sits on", () => {
    const failures: string[] = [];
    for (const block of blocks) {
      const { hex, surfaces } = paletteOf(block);
      for (const text of ["--text-primary-color", "--text-secondary-color"]) {
        for (const [name, surface] of Object.entries(surfaces)) {
          measure(failures, block.id, `${text} on ${name}`, hex(text), surface, TEXT_FLOOR);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  // Every one of these is written as words somewhere - a link, a "saved
  // locally" label, a status chip, the diff stat in the status bar - so each is
  // text, not an icon, on the surfaces it appears on.
  it("keeps accent and status colours readable as words", () => {
    const failures: string[] = [];
    const inks = [
      "--accent-primary",
      "--status-success",
      "--status-warning",
      "--status-danger",
      "--status-renamed",
      "--tone-local",
      "--diff-added",
      "--diff-removed",
    ];
    for (const block of blocks) {
      const { hex, surfaces } = paletteOf(block);
      for (const ink of inks) {
        for (const name of ["app", "panel", "raised", "card"]) {
          measure(failures, block.id, `${ink} on ${name}`, hex(ink), surfaces[name], TEXT_FLOOR);
        }
      }
      // The selected rail item and the selected chip paint their glyph in the
      // accent on the selection tint.
      measure(failures, block.id, "--accent-primary on active", hex("--accent-primary"), surfaces.active, NON_TEXT_FLOOR);
      for (const name of ["app", "panel", "raised", "control"]) {
        measure(failures, block.id, `--focus-ring on ${name}`, hex("--focus-ring"), surfaces[name], NON_TEXT_FLOOR);
      }
      measure(failures, block.id, "--accent-heart on raised", hex("--accent-heart"), surfaces.raised, NON_TEXT_FLOOR);
    }
    expect(failures).toEqual([]);
  });

  // A primary or destructive button's label is 12-13px bold: normal text, not
  // WCAG "large" text, so the fill carries it at 4.5:1.
  it("keeps a solid button's label at 4.5:1 on its fill", () => {
    const failures: string[] = [];
    for (const block of blocks) {
      const { hex } = paletteOf(block);
      for (const [fill, label] of [
        ["--accent-primary-fill", "--accent-primary-contrast"],
        ["--status-danger", "--status-danger-contrast"],
      ]) {
        measure(failures, block.id, `${label} on ${fill}`, hex(label), hex(fill), TEXT_FLOOR);
      }
    }
    expect(failures).toEqual([]);
  });

  // The diff is the densest reading surface in the app. An added or removed
  // line paints its ink on a 12% tint of that same ink over the code well, and
  // syntax tokens on either kind of line or on a plain one.
  it("keeps diff and syntax colours readable on the code well and its tinted lines", () => {
    const failures: string[] = [];
    const syntax = ["--syntax-string", "--syntax-number", "--syntax-keyword", "--syntax-type", "--syntax-property"];
    for (const block of blocks) {
      const { hex, code } = paletteOf(block);
      const lines: Record<string, Rgb> = {
        "code": code,
        "added line": blend(hex("--diff-added"), DIFF_WASH_STRENGTH, code),
        "removed line": blend(hex("--diff-removed"), DIFF_WASH_STRENGTH, code),
      };
      measure(failures, block.id, "--diff-added on added line", hex("--diff-added"), lines["added line"], TEXT_FLOOR);
      measure(failures, block.id, "--diff-removed on removed line", hex("--diff-removed"), lines["removed line"], TEXT_FLOOR);
      measure(failures, block.id, "--text-primary-color on code", hex("--text-primary-color"), code, TEXT_FLOOR);
      for (const token of syntax) {
        for (const [name, line] of Object.entries(lines)) {
          measure(failures, block.id, `${token} on ${name}`, hex(token), line, TEXT_FLOOR);
        }
      }
      // A comment is muted on purpose - every palette's editor theme does it -
      // but it is still code someone reads, so it keeps the non-text floor.
      for (const [name, line] of Object.entries(lines)) {
        measure(failures, block.id, `--syntax-comment on ${name}`, hex("--syntax-comment"), line, NON_TEXT_FLOOR);
      }
    }
    expect(failures).toEqual([]);
  });

  // Primary and secondary text are two roles; if they measure the same the
  // secondary line of every row reads as a second title.
  it("keeps secondary text visibly quieter than primary text", () => {
    const failures: string[] = [];
    for (const block of blocks) {
      const { hex } = paletteOf(block);
      const ratio = contrast(hex("--text-primary-color"), hex("--text-secondary-color"));
      if (ratio < 1.25) failures.push(`${block.id}: primary and secondary text differ by only ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
  });

  // The version node's filled and half states are `--node-fill` in tokens.css:
  // a 65% mix of the primary ink over the panel. It is a state mark, not text,
  // so it keeps the non-text floor in every theme; the selected/active accent
  // is measured with the accent pairs.
  it("keeps the version node fill at 3:1 over the panel in every theme", () => {
    const definition = TOKENS_CSS.match(
      /--node-fill:\s*color-mix\(in srgb,\s*var\(--text-primary-color\)\s*(\d+(?:\.\d+)?)%,\s*var\(--surface-panel\)\s*\)/,
    );
    expect(definition, "tokens.css defines --node-fill as an ink/panel mix").not.toBeNull();
    if (!definition) return;
    const weight = Number(definition[1]) / 100;
    const failures: string[] = [];
    for (const block of blocks) {
      const { hex, panel } = paletteOf(block);
      const fill = blend(hex("--text-primary-color"), weight, panel);
      measure(failures, block.id, "--node-fill on panel", fill, panel, NON_TEXT_FLOOR);
    }
    expect(failures).toEqual([]);
  });

  // DESIGN.md § Glyph tones: each tone says one kind of thing, so it has to
  // read apart from every other tone, not only from the surface. The lime
  // "saved here" and the green "done" sat 4.3 apart in GitOdile Light, the
  // remote's blue and GitOdile's violet 8.9 in Dark. Normal vision only: under
  // colour blindness red, amber and green meet in any palette, and the glyph's
  // shape carries the meaning there. Community themes once gave local and done
  // one green and the heart danger's red; they now take another of their
  // palette's own hues for each role.
  it("keeps every theme's glyph tones a clear step from one another", () => {
    const toneApp = TOKENS_CSS.match(/--tone-app:\s*light-dark\((#[0-9a-fA-F]{6}),\s*(#[0-9a-fA-F]{6})\)/);
    expect(toneApp, "tokens.css defines --tone-app per scheme").not.toBeNull();
    if (!toneApp) return;
    const failures: string[] = [];
    for (const block of blocks) {
      const { hex } = paletteOf(block);
      const tones: Record<string, Rgb> = {
        remote: hex("--status-renamed"),
        local: hex("--tone-local"),
        done: hex("--status-success"),
        warning: hex("--status-warning"),
        danger: hex("--status-danger"),
        heart: hex("--accent-heart"),
        app: hexToRgb(block.scheme === "dark" ? toneApp[2] : toneApp[1]),
      };
      const names = Object.keys(tones);
      for (const [index, first] of names.entries()) {
        for (const second of names.slice(index + 1)) {
          const distance = perceptualDistance(tones[first], tones[second]);
          if (distance < 10) failures.push(`${block.id}: ${first} and ${second} are only ${distance.toFixed(1)} apart`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  // A popover, menu or dialog is `--surface-raised`. On a dark palette it has
  // to lift off the panel beneath it, or a menu reads as a hole in the page;
  // light palettes lift with a shadow instead, like the official Light theme.
  it("lifts raised surfaces off the panel in dark themes", () => {
    const failures: string[] = [];
    for (const block of blocks) {
      if (block.scheme !== "dark") continue;
      const { panel, raised } = paletteOf(block);
      if (luminance(raised) <= luminance(panel)) failures.push(`${block.id}: --surface-raised is not lighter than the panel`);
    }
    expect(failures).toEqual([]);
  });

  // A control sits *on* a raised card (DESIGN.md § semantic colors). If the two
  // paint the same colour the control has no step of its own and disappears
  // into the card it is part of - Solarized Dark and Catppuccin Frappé both
  // shipped with that collision. The RGB distance is a rough perceptual step;
  // the tightest passing theme (GitOdile Dark) measures about 8.
  it("keeps the control surface a visible step from the raised surface", () => {
    const failures: string[] = [];
    for (const block of blocks) {
      const { hex } = paletteOf(block);
      const raised = hex("--surface-raised");
      const control = hex("--surface-control");
      const step = Math.hypot(raised[0] - control[0], raised[1] - control[1], raised[2] - control[2]);
      if (step < 6) failures.push(`${block.id}: --surface-control is only ${step.toFixed(1)} from --surface-raised`);
    }
    expect(failures).toEqual([]);
  });
});
