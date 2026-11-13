import { memo, useEffect, useMemo, useRef, useState } from "react";
import { isReducedMotionRequested } from "../../shared/ui";
import { mascotEyes, mascotLines, mascotRain, type MascotRun } from "./mascotArt";

const LINES = mascotLines();
const EYES = (["half", "closed"] as const).map((frame) => ({ frame, eyes: mascotEyes(frame) }));
/** One blink a command: half, closed, half, open. Hard cuts, as the idle blink's steps(). */
const NUDGE_MS = 220;
const NUDGE: Record<"half" | "closed", Keyframe[]> = {
  half: [{ opacity: 1 }, { opacity: 1, offset: .28 }, { opacity: 0, offset: .28 }, { opacity: 0, offset: .62 }, { opacity: 1, offset: .62 }, { opacity: 1, offset: .88 }, { opacity: 0, offset: .88 }, { opacity: 0 }],
  closed: [{ opacity: 0 }, { opacity: 0, offset: .28 }, { opacity: 1, offset: .28 }, { opacity: 1, offset: .62 }, { opacity: 0, offset: .62 }, { opacity: 0 }],
};

function runClass(run: MascotRun): string | undefined {
  return [run.tone ? "console-art__tone1" : "", run.solid ? "console-art__solid" : ""].filter(Boolean).join(" ") || undefined;
}

/** CSS owns motion. Only a command/clear that relocates the drawing reveals it;
 * the first screen visit and later navigation show it already complete.
 * `hashes` are the project's short version ids for the rain; `nudge` changes
 * once per command, and each change after the first render blinks once. */
export const ConsoleMascot = memo(function ConsoleMascot({ active, watermark = false, entrance = true, hashes = "", nudge }: {
  active: boolean;
  watermark?: boolean;
  entrance?: boolean;
  hashes?: string;
  nudge?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [revealing, setRevealing] = useState(() => entrance && active && !isReducedMotionRequested());
  // The watermark's rain falls through the whole pane above it, so each column
  // carries a second drop half a cycle behind the first to keep it as dense.
  const rain = useMemo(() => {
    const drops = mascotRain(undefined, undefined, hashes);
    return watermark
      ? [...drops, ...drops].map((drop, index) => ({ ...drop, key: index, duration: drop.duration * 3, delay: drop.delay * 3 - (index < drops.length ? 0 : drop.duration * 1.5) }))
      : drops.map((drop) => ({ ...drop, key: drop.column }));
  }, [hashes, watermark]);
  useEffect(() => {
    if (!active) {
      setRevealing(false);
      return;
    }
    const element = root.current;
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    function reduceMotion() {
      if (motion?.matches) setRevealing(false);
    }
    function finishEntrance(event: AnimationEvent) {
      if (event.target === element && event.animationName === "console-art-settle") setRevealing(false);
    }
    // display:none and a changed motion preference cancel CSS animations.
    // Retire the entrance then too, so making the screen visible cannot replay it.
    element?.addEventListener("animationend", finishEntrance);
    element?.addEventListener("animationcancel", finishEntrance);
    // A preference can change before the browser starts the animation, when
    // there is no running animation to emit a cancellation event yet.
    motion?.addEventListener("change", reduceMotion);
    reduceMotion();
    return () => {
      element?.removeEventListener("animationend", finishEntrance);
      element?.removeEventListener("animationcancel", finishEntrance);
      motion?.removeEventListener("change", reduceMotion);
    };
  }, [active]);
  // The blink plays over the idle one: a script animation outranks a CSS one
  // on the same property, and the CSS cycle carries on when it ends.
  const lastNudge = useRef(nudge);
  useEffect(() => {
    if (nudge === lastNudge.current) return;
    lastNudge.current = nudge;
    if (!active || isReducedMotionRequested()) return;
    for (const { frame } of EYES) {
      const element = root.current?.querySelector<HTMLElement>(`.console-art__eye-frame--${frame}`);
      if (typeof element?.animate === "function") element.animate(NUDGE[frame], { duration: NUDGE_MS, easing: "linear" });
    }
  }, [nudge, active]);
  return (
    <div ref={root} className={`console-art${revealing ? " console-art--reveal" : ""}${watermark ? " console-art--watermark" : ""}`} aria-hidden="true" data-active={active}
      style={{ "--console-art-rows": LINES.length } as React.CSSProperties}>
      <div className="console-art__rain">
        {rain.map((drop) => <span key={drop.key} className="console-art__drop"
          style={{ "--column": drop.column, "--duration": `${drop.duration}s`, "--delay": `${drop.delay}s` } as React.CSSProperties}>
          {drop.glyphs.slice(0, -1)}<b className="console-art__drop-head">{drop.glyphs.slice(-1)}</b>
        </span>)}
      </div>
      <pre className="console-art__mascot">
        {LINES.map((runs, row) => <span className="console-art__row" key={row} style={{ "--row": row } as React.CSSProperties}>
          {runs.map((run, index) => <span key={index} className={runClass(run)}>{run.text}</span>)}
        </span>)}
      </pre>
      <div className="console-art__eyes">
        {EYES.map(({ frame, eyes }) => <span key={frame} className={`console-art__eye-frame console-art__eye-frame--${frame}`}>
          {eyes.map((eye, index) => <span key={index} className="console-art__eye" style={{ left: `${index ? 35 : 30}ch` }}>{eye}</span>)}
        </span>)}
      </div>
    </div>
  );
});
