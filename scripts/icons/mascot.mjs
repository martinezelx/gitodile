// The GitOdile mascot, drawn once, and everything generated from it.
//
// The crocodile is the v5 silhouette (ADR 0031): one flat body with its
// white belly, toes and eyes, traced into `mascot-shapes.mjs`. It is the one
// drawing, and every surface shows it whole or cropped:
//
//   body       the whole crocodile: the application icon on the white tile, at
//              every size and on every platform, the in-app mark (welcome,
//              About), the console welcome's ASCII art, the Windows
//              installer's side panel and brand material
//   head       the same drawing cropped to the head, crest to snout tip, cut
//              just under the teeth: the in-app mark where only a head fits,
//              the Windows installer's header and brand material
//
// Everything is written out from here:
//
//   src/assets/gitodile-mascot*.svg    standalone SVGs in the brand colours
//   src/assets/brand/*.svg             the application icon, as shipped and on
//                                      Apple's macOS grid
//   src/shared/ui/mascotArtwork.ts     the same shapes for the in-app React mark,
//                                      whose green body follows the theme
//   src/features/console/mascotAscii.ts
//                                      the whole mascot as the ASCII art the
//                                      console's welcome prints
//   icon sources for `pnpm icons`      1024px squares; `pnpm icons` also renders
//                                      the PNGs under src/assets/brand
//   installer sources for `pnpm icons` the Windows installer's side panel and
//                                      header, on the icon's white
//
//   node scripts/icons/mascot.mjs            rewrite the generated files
//   node scripts/icons/mascot.mjs --check    fail if they drift from this file
//
// Edit the drawing here and regenerate; never edit a generated file by hand.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { asciiArt } from "./ascii-art.mjs";
import { BELLY, BODY_OUTLINE, EYES, TOES } from "./mascot-shapes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const assetsDir = path.join(root, "src", "assets");
export const brandDir = path.join(assetsDir, "brand");

export const colors = {
  /** The body's green. The in-app mark swaps it for the theme's accent outside the GitOdile themes. */
  lime: "#86b640",
  /** The belly, toes and eyes of the green mascot. */
  white: "#ffffff",
  /** The mascot on the white tile (icon and installer): near-black ink... */
  ink: "#0e1512",
  /** ...with warm white eyes, belly and toes. */
  paper: "#fbf8f0",
  /**
   * The icon tile: white lit from above, a soft light-to-dark gradient as
   * Apple advises for light icons, the same on every platform (ADR 0031).
   */
  tileTop: "#ffffff",
  tileBottom: "#e8e8e8",
};
const c = colors;

/**
 * Parts the in-app mark addresses by class: `fill` is the body, recoloured per
 * theme, and `outline` the edges the welcome's entrance traces before the body
 * fills in. (The eyes the mark winks and blinks are its own mask, built in
 * `mascot.tsx` from `eyes`.) The in-app class is `gitodile-mascot__<part>`;
 * standalone SVGs drop it.
 */
const partClass = (part) => `gitodile-mascot__${part}`;

// ---- The drawing ------------------------------------------------------------
//
// Paint order for the standalone SVGs, the icon and the installer: the body's
// silhouette, then the belly (its plates are the body showing through), the
// toes and the eyes in a light colour on top. The in-app mark instead cuts
// them out as holes (`artworkModule`).

/** The whole body in `body` with its white parts in `light`. */
function bodyDrawing(body, light) {
  return [
    ["path", { d: BODY_OUTLINE, fill: body }],
    ["path", { d: BELLY, fill: light }],
    ["g", { fill: light }, [...TOES, ...EYES].map((d) => ["path", { d }])],
  ];
}

/**
 * The welcome's entrance traces the body's every edge, silhouette, belly,
 * toes and eyes, before the colours fill in. It is drawn last so the trace
 * lies over the fill as that fades in, and it is invisible at rest
 * (primitives.css), so the mark shows exactly the drawing everywhere else.
 */
const entranceOutline = ["g", { part: "outline", fill: "none", "stroke-width": 12, "stroke-linejoin": "round" }, [BODY_OUTLINE, BELLY, ...TOES, ...EYES].map((d) => ["path", { d }])];

/**
 * Each variant's crop of the drawing: the whole body with a hair of air, and
 * the head from the crest to the snout tip, cut a little under the teeth so
 * they hang clear and the neck reads as running on below the edge.
 */
const boxes = {
  body: { x: 50, y: 160, width: 1160, height: 990 },
  head: { x: 290, y: 160, width: 920, height: 470 },
};

/** The variants rendered as standalone SVGs and in the app. */
export const variantNames = ["body", "head"];

function viewBox(name) {
  const { x, y, width, height } = boxes[name];
  return `${x} ${y} ${width} ${height}`;
}

function toSvg(nodes, indent) {
  return nodes
    .map(([tag, attrs, children]) => {
      const text = Object.entries(attrs)
        .filter(([key]) => key !== "part")
        .map(([key, value]) => ` ${key}="${value}"`)
        .join("");
      if (!children) return `${indent}<${tag}${text}/>`;
      return `${indent}<${tag}${text}>\n${toSvg(children, `${indent}  `)}\n${indent}</${tag}>`;
    })
    .join("\n");
}

/** A standalone SVG of one variant in the brand colours, cropped to the drawing. */
export function mascotSvg(name) {
  const { width, height } = boxes[name];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox(name)}">
  <title>GitOdile</title>
${toSvg(bodyDrawing(c.lime, c.white), "  ")}
</svg>
`;
}

const n4 = (value) => Number(value.toFixed(4));

/**
 * The drawing in `body`/`light`, `name`'s box scaled into a `size` square area
 * at (`left`, `top`), centred and clipped to the box, so a crop shows nothing
 * of the body beyond it.
 */
function placed(name, left, top, size, body, light) {
  const { x, y, width, height } = boxes[name];
  const k = size / Math.max(width, height);
  const dx = left + (size - width * k) / 2 - x * k;
  const dy = top + (size - height * k) / 2 - y * k;
  return `<g transform="translate(${n4(dx)} ${n4(dy)}) scale(${n4(k)})">
    <clipPath id="crop-${name}">
      <rect x="${x}" y="${y}" width="${width}" height="${height}"/>
    </clipPath>
    <g clip-path="url(#crop-${name})">
${toSvg(bodyDrawing(body, light), "      ")}
    </g>
  </g>`;
}

const tileGradient = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.tileTop}"/>
      <stop offset="1" stop-color="${c.tileBottom}"/>
    </linearGradient>`;

/** The bounding box of absolute path data: every other number is an x, the rest y. */
function pathBounds(d) {
  const n = d.match(/-?\d*\.?\d+/g).map(Number);
  const xs = n.filter((_, i) => i % 2 === 0);
  const ys = n.filter((_, i) => i % 2 === 1);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/**
 * The application icon on a 1024px canvas: the whole mascot in ink on the
 * white tile. `platform: "default"` fills the canvas the way Windows and Linux
 * icons do; `"macos"` sits on Apple's grid, an 824px tile centred with room
 * for the shadow macOS draws. Both are the same icon at a different margin.
 */
export function iconSourceSvg({ platform }) {
  const mac = platform === "macos";
  const start = mac ? 100 : 24;
  const tile = 1024 - 2 * start;
  const radius = n4(tile * 0.225);
  // The body at 0.8 tile pixels per drawing unit on the 976px tile (scaled
  // with the tile on macOS): big enough that the face reads at 32px. Its
  // height is centred in the tile and the snout tip stops 4% short of the
  // right edge, so the tail tip runs into the tile's rounded corner and is cut
  // there.
  const body = pathBounds(BODY_OUTLINE);
  const k = (tile * 0.8) / 976;
  const dx = start + tile * 0.959 - body.right * k;
  const dy = start + tile / 2 - ((body.top + body.bottom) / 2) * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <title>GitOdile</title>
  <defs>
    ${tileGradient("tile")}
    <clipPath id="tile-shape">
      <rect x="${start}" y="${start}" width="${tile}" height="${tile}" rx="${radius}"/>
    </clipPath>
  </defs>
  <rect x="${start}" y="${start}" width="${tile}" height="${tile}" rx="${radius}" fill="url(#tile)"/>
  <g clip-path="url(#tile-shape)">
  <g transform="translate(${n4(dx)} ${n4(dy)}) scale(${n4(k)})">
${toSvg(bodyDrawing(c.ink, c.paper), "    ")}
  </g>
  </g>
</svg>
`;
}

/**
 * The Windows installer's bitmaps on the icon's white (ADR 0031): `sidebar` is
 * the whole mascot on the Welcome and Finish pages, `header` its head on every
 * other page, both in the icon's ink. The composition is drawn at its exact
 * pixel size in the top-left corner of a square canvas, because `tauri icon`
 * only renders squares; `pnpm icons` crops it back to `width`x`height`.
 */
export function installerSourceSvg(name, { width, height }) {
  const side = Math.max(width, height);
  let art;
  if (name === "sidebar") {
    // The whole crocodile, 12px clear of each side, sitting a little below the
    // middle so it rests in the panel rather than floating in it.
    const size = width - 24;
    art = placed("body", 12, n4(height * 0.56 - size / 2), size, c.ink, c.paper);
  } else if (name === "header") {
    // The head 46px tall, centred across the strip and standing on its bottom
    // edge, so the neck runs off it rather than ending in mid-air.
    const box = boxes.head;
    const size = n4((46 * box.width) / box.height);
    art = placed("head", n4((width - size) / 2), n4(height - 46 - (size - 46) / 2), size, c.ink, c.paper);
  } else {
    throw new Error(`unknown installer image: ${name}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">
  <defs>
    ${tileGradient("tile")}
    <clipPath id="frame">
      <rect width="${width}" height="${height}"/>
    </clipPath>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#tile)"/>
  <g clip-path="url(#frame)">
  ${art}
  </g>
</svg>
`;
}

/** A 1024px transparent square with `name` centred in the brand colours, for rendering brand PNGs. */
export function brandSourceSvg(name) {
  const margin = 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${placed(name, margin, margin, 1024 - 2 * margin, c.lime, c.white)}
</svg>
`;
}

// ---- In-app module -----------------------------------------------------------

const camel = (key) => key.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());

function toModuleNodes(nodes, inOutline = false) {
  return nodes.map(([tag, attrs, children]) => {
    const props = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "part") props.className = partClass(value);
      else props[camel(key)] = value;
    }
    // The welcome's entrance draws the outline with a dash as long as each
    // path, so every outline path measures 1 whatever its real length.
    if (inOutline && tag === "path") props.pathLength = 1;
    const outline = inOutline || attrs.part === "outline";
    return children ? [tag, props, toModuleNodes(children, outline)] : [tag, props];
  });
}

/**
 * `src/shared/ui/mascotArtwork.ts`: each crop for the in-app mark, the same
 * drawing under a different view box. Inside the app the white parts are
 * holes, so the surface behind the mark shows through them: the belly and toes
 * are cut out of the body's one path, and the eyes are cut by a mask the mark
 * builds from `eyes`, back eye first, so the front one can close by scaling
 * and let the body fill its hole. Only the body carries the entrance outline.
 */
export function artworkModule() {
  const body = toModuleNodes([["path", { part: "fill", d: [BODY_OUTLINE, BELLY, ...TOES].join(" "), "fill-rule": "evenodd", fill: c.lime }]]);
  const crop = (name) => ({ viewBox: viewBox(name), box: { ...boxes[name] }, nodes: body, eyes: EYES });
  const data = {
    body: { ...crop("body"), outline: toModuleNodes([entranceOutline]) },
    head: crop("head"),
  };
  return `// Generated by scripts/icons/mascot.mjs. Do not edit; run \`node scripts/icons/mascot.mjs\`.
//
// The mascot as SVG element nodes with React prop names. \`${partClass("fill")}\`
// is the body the in-app mark recolours per theme, with the belly and toes cut
// out of it; \`eyes\` are the two eye holes, back to front, which the mark cuts
// with a mask so the front one can wink; and, on the body only, \`outline\` is
// \`${partClass("outline")}\`, the edges the welcome's entrance traces (its
// paths measure pathLength 1).

export type MascotNode = readonly [tag: string, props: Readonly<Record<string, string | number>>, children?: readonly MascotNode[]];

export interface MascotArtwork {
  readonly viewBox: string;
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly nodes: readonly MascotNode[];
  readonly outline?: readonly MascotNode[];
  /** The eye holes, back eye first; the front one winks. */
  readonly eyes: readonly [string, string];
}

export const MASCOT_ARTWORK: Readonly<Record<"body" | "head", MascotArtwork>> = ${JSON.stringify(data, null, 2)};
`;
}

// ---- Console ASCII art --------------------------------------------------------

/** Characters across the body's box: the console prints one per cell. */
export const CONSOLE_ASCII_COLUMNS = 64;

/** Light to dense, as ASCII art shades. */
const ASCII_RAMP = " .:-=+*#%@";

/** `src/features/console/mascotAscii.ts`: the whole mascot as ASCII art and its tones. */
export function consoleAsciiModule() {
  // One console tone, the body (themed in console.css). The body prints at
  // full weight, so its inside is the densest glyph and only its edges shade
  // lighter; the white belly, toes and eyes weigh nothing, so they read as
  // holes the way hand-made ASCII art leaves its highlights.
  const art = asciiArt(bodyDrawing(c.lime, c.white), boxes.body, {
    columns: CONSOLE_ASCII_COLUMNS,
    ramp: ASCII_RAMP,
    tones: {
      [c.lime]: { tone: 1, weight: 1 },
      [c.white]: { tone: 0, weight: 0 },
    },
  });
  const list = (rows) => rows.map((row) => `  ${JSON.stringify(row)},`).join("\n");
  return `// Generated by scripts/icons/mascot.mjs. Do not edit; run \`node scripts/icons/mascot.mjs\`.
//
// The whole mascot as ASCII art, ${CONSOLE_ASCII_COLUMNS} characters across its box, empty
// edges trimmed. MASCOT_ASCII_TONES is 1 on every glyph (the body) and 0 on
// spaces. MASCOT_ASCII_COVER is 1 where the silhouette covers the cell, the
// white belly included, so the rain behind the art passes under it.

export const MASCOT_ASCII: readonly string[] = [
${list(art.text)}
];

export const MASCOT_ASCII_TONES: readonly string[] = [
${list(art.tones)}
];

export const MASCOT_ASCII_COVER: readonly string[] = [
${list(art.cover)}
];
`;
}

/** README artwork uses the Home geometry with transparent belly, toes and eyes. */
export function readmeMascotSvg(ink) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="990" viewBox="${viewBox("body")}">
  <title>GitOdile</title>
  <defs>
    <mask id="eyes" maskUnits="userSpaceOnUse" x="50" y="160" width="1160" height="990" style="mask-type:luminance">
      <rect x="50" y="160" width="1160" height="990" fill="#ffffff" />
      <g fill="#000000">${EYES.map((d) => `<path d="${d}" />`).join("")}</g>
    </mask>
  </defs>
  <path d="${[BODY_OUTLINE, BELLY, ...TOES].join(" ")}" fill="${ink}" fill-rule="evenodd" mask="url(#eyes)" />
</svg>
`;
}

/** Every text file this module generates, keyed by path. */
export function generatedFiles() {
  return {
    [path.join(root, "docs", "readme", "gitodile-mascot-light.svg")]: readmeMascotSvg("#000000"),
    [path.join(root, "docs", "readme", "gitodile-mascot-dark.svg")]: readmeMascotSvg("#ffffff"),
    [path.join(assetsDir, "gitodile-mascot.svg")]: mascotSvg("body"),
    [path.join(assetsDir, "gitodile-mascot-head.svg")]: mascotSvg("head"),
    [path.join(brandDir, "gitodile-icon.svg")]: iconSourceSvg({ platform: "default" }),
    [path.join(brandDir, "gitodile-icon-macos.svg")]: iconSourceSvg({ platform: "macos" }),
    [path.join(root, "src", "shared", "ui", "mascotArtwork.ts")]: artworkModule(),
    [path.join(root, "src", "features", "console", "mascotAscii.ts")]: consoleAsciiModule(),
  };
}

// --- CLI ---------------------------------------------------------------------

function main(argv) {
  const check = argv.includes("--check");
  let drift = false;
  for (const [file, text] of Object.entries(generatedFiles())) {
    const rel = path.relative(root, file).replaceAll("\\", "/");
    if (check) {
      const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replaceAll("\r\n", "\n") : null;
      if (current !== text) {
        console.error(`${rel}: differs from scripts/icons/mascot.mjs; run \`node scripts/icons/mascot.mjs\``);
        drift = true;
      }
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      console.log(`${rel}: written`);
    }
  }
  if (check && !drift) console.log("mascot files match scripts/icons/mascot.mjs");
  if (drift) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
