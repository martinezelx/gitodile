import { describe, expect, it } from "vitest";
import { MASCOT_ASCII, MASCOT_ASCII_COVER, MASCOT_ASCII_TONES, mascotEyes, mascotLines, mascotRain } from "./mascotArt";

describe("mascotLines", () => {
  it("fits the compact welcome footprint instead of growing with the source drawing", () => {
    expect(MASCOT_ASCII.length).toBeLessThanOrEqual(34);
    expect(Math.max(...MASCOT_ASCII.map((line) => line.length))).toBeLessThanOrEqual(64);
  });

  it("keeps the art rectangular, printable and toned glyph for glyph", () => {
    expect(new Set(MASCOT_ASCII.map((line) => line.length)).size).toBe(1);
    expect(MASCOT_ASCII.join("")).toMatch(/^[ -~]+$/);
    expect(MASCOT_ASCII_TONES).toHaveLength(MASCOT_ASCII.length);
    expect(MASCOT_ASCII_COVER).toHaveLength(MASCOT_ASCII.length);
    MASCOT_ASCII_TONES.forEach((tones, y) => {
      expect(tones).toMatch(/^[01]+$/);
      expect([...tones].map((tone) => tone === "0")).toEqual([...MASCOT_ASCII[y]].map((glyph) => glyph === " "));
      expect(MASCOT_ASCII_COVER[y]).toMatch(new RegExp(`^[01]{${MASCOT_ASCII[y].length}}$`));
    });
  });

  it("splits each line into runs of one tone and cover that rebuild it", () => {
    expect(mascotLines(["  + @@ "], ["0010110"], ["0111110"])).toEqual([[
      { text: " ", tone: 0, solid: false },
      { text: " ", tone: 0, solid: true },
      { text: "+", tone: 1, solid: true },
      { text: " ", tone: 0, solid: true },
      { text: "@@", tone: 1, solid: true },
      { text: " ", tone: 0, solid: false },
    ]]);
    expect(mascotLines().map((runs) => runs.map((run) => run.text).join(""))).toEqual([...MASCOT_ASCII]);
  });

  it("covers the white belly, which prints as spaces, so the rain passes behind it", () => {
    const holes = MASCOT_ASCII.flatMap((line, y) => [...line].filter((glyph, x) => glyph === " " && MASCOT_ASCII_COVER[y][x] === "1"));
    expect(holes.length).toBeGreaterThan(20);
  });
});

describe("mascotRain", () => {
  it("is seeded, stays inside the art and falls at a calm, varied pace", () => {
    const drops = mascotRain();
    expect(mascotRain()).toEqual(drops);
    expect(mascotRain(64, 1)).not.toEqual(drops);
    expect(drops.length).toBeGreaterThan(20);
    for (const drop of drops) {
      expect(drop.column).toBeGreaterThanOrEqual(0);
      expect(drop.column).toBeLessThan(MASCOT_ASCII[0].length);
      expect(drop.glyphs).toMatch(/^[0-9a-f]{5,13}$/);
      expect(drop.duration).toBeGreaterThanOrEqual(3.2);
      expect(drop.duration).toBeLessThanOrEqual(6.8);
      expect(drop.delay).toBeLessThanOrEqual(0);
      expect(-drop.delay).toBeLessThanOrEqual(drop.duration);
    }
    expect(new Set(drops.map((drop) => drop.column)).size).toBe(drops.length);
  });

  it("reads the project's version ids down the columns without changing the pattern", () => {
    const hashes = "f12143f9e2192d";
    const drops = mascotRain(undefined, undefined, hashes);
    expect(drops.map(({ glyphs: _, ...drop }) => drop)).toEqual(mascotRain().map(({ glyphs: _, ...drop }) => drop));
    const stream = drops.map((drop) => drop.glyphs).join("");
    expect(stream).toBe(hashes.repeat(Math.ceil(stream.length / hashes.length)).slice(0, stream.length));
  });
});

describe("mascotEyes", () => {
  it("keeps both blink patches inside covered eye cells of the generated drawing", () => {
    for (const column of [30, 35]) {
      expect(MASCOT_ASCII.slice(4, 7).every((row) => row.slice(column, column + 2) === "  ")).toBe(true);
      expect(MASCOT_ASCII_COVER.slice(3, 8).every((row) => row.slice(column, column + 3) === "111")).toBe(true);
    }
    for (const frame of ["half", "closed"] as const) {
      const eyes = mascotEyes(frame);
      expect(eyes).toHaveLength(2);
      eyes.forEach((eye) => {
        const rows = eye.split("\n");
        expect(rows).toHaveLength(5);
        expect(rows.every((row) => row.length === 3)).toBe(true);
      });
    }
    expect(mascotEyes("half")[0]).toContain("  -");
    expect(mascotEyes("closed")[0].split("\n")[2]).toBe("---");
  });
});
