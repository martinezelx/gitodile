import { MASCOT_ASCII, MASCOT_ASCII_COVER, MASCOT_ASCII_TONES } from "./mascotAscii";

export { MASCOT_ASCII, MASCOT_ASCII_COVER, MASCOT_ASCII_TONES };

/** Two 3-by-5 eye patches, aligned to columns 30/35 and rows 3–7 of the mark.
 * Keep generated art intact: only these covered cells change while blinking. */
export function mascotEyes(frame: "half" | "closed"): string[] {
  return [30, 35].map((column) => MASCOT_ASCII.slice(3, 8).map((line, row) => {
    if (frame === "closed") return row === 2 ? "---" : "@@@";
    return row === 1 || row === 2 ? line.slice(column, column + 3) : "@@@";
  }).join("\n"));
}

/** 0 plain (spaces), 1 the body — see `mascotAscii.ts`. */
export type MascotTone = 0 | 1;
/** `solid` runs sit on the silhouette, so they hide the rain falling behind the art. */
export type MascotRun = { text: string; tone: MascotTone; solid: boolean };

/**
 * Each line of the ASCII mascot as runs of one tone and cover, so the console
 * prints it as a few spans per line instead of a span per character.
 */
export function mascotLines(
  text: readonly string[] = MASCOT_ASCII,
  tones: readonly string[] = MASCOT_ASCII_TONES,
  cover: readonly string[] = MASCOT_ASCII_COVER,
): MascotRun[][] {
  return text.map((line, y) => {
    const runs: MascotRun[] = [];
    let x = 0;
    while (x < line.length) {
      const tone = tones[y][x];
      const solid = cover[y][x];
      let end = x + 1;
      while (end < line.length && tones[y][end] === tone && cover[y][end] === solid) end += 1;
      runs.push({ text: line.slice(x, end), tone: Number(tone) as MascotTone, solid: solid === "1" });
      x = end;
    }
    return runs;
  });
}

/** One falling column of the rain behind the art, in character cells and seconds. */
export type RainDrop = { column: number; glyphs: string; duration: number; delay: number };

const RAIN_GLYPHS = "0123456789abcdef";

/**
 * The rain behind the console's mascot: short columns of hex digits, like
 * commit hashes, falling at different speeds. Seeded, so it is the same drop
 * pattern on every visit and in every test; CSS does the falling, so a hidden
 * console (display: none) spends nothing on it. About two columns in three
 * get a drop; the silhouette hides the rest, so the rain shows around the
 * mascot, not over it.
 *
 * Given the project's short version ids, the digits are those, read down each
 * column in turn. Only the glyphs change: the same seed draws the same
 * columns, speeds and delays with or without them.
 */
export function mascotRain(columns: number = MASCOT_ASCII[0].length, seed = 0x6117, hashes = ""): RainDrop[] {
  let state = seed >>> 0;
  const random = () => {
    // mulberry32: small, fast and good enough to scatter a few columns.
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const drops: RainDrop[] = [];
  let cursor = 0;
  for (let column = 0; column < columns; column += 1) {
    if (random() < 0.3) continue;
    const length = 5 + Math.floor(random() * 9);
    let glyphs = "";
    for (let i = 0; i < length; i += 1) {
      const glyph = RAIN_GLYPHS[Math.floor(random() * RAIN_GLYPHS.length)];
      glyphs += hashes ? hashes[(cursor + i) % hashes.length] : glyph;
    }
    cursor += length;
    const duration = Math.round((3.2 + random() * 3.6) * 10) / 10;
    drops.push({ column, glyphs, duration, delay: -Math.round(random() * duration * 10) / 10 });
  }
  return drops;
}
