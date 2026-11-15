// The AI garden's scenery: floating islands with waterfalls of light, drifting
// data clouds, circuit trees with pulsing leaf-nodes, crystal sprouts that ring
// with light when touched, the data pool with glyphs rising out of it, the
// hologram fence and its gate of light, and scanning drones. At night it all
// glows brighter and pixel lights drift up. None of it moves the Lemmas: that's
// engine.ts. Laid out in lawn shares like them (x 0 to 1, y 0 far to 1 near).
import { memo, useState, type CSSProperties } from "react";

export type Time = "dawn" | "day" | "dusk" | "night";

interface Layout {
  width: number;
  height: number;
  horizon: number;
  /** Lawn y (0 far, 1 near) to pixels from the top. */
  lawnY: (y: number) => number;
  big: boolean;
}

/** A tree whose trunk and branches run like circuit traces, with leaf-nodes that pulse. */
function CircuitTree({ size, delay }: { size: number; delay: number }) {
  const nodes: [number, number][] = [[50, 18], [28, 30], [72, 28], [18, 46], [40, 40], [62, 44], [84, 42], [50, 56], [30, 60], [70, 62]];
  return (
    <svg className="gd-tree" viewBox="0 0 100 130" width={size} height={size * 1.3} aria-hidden="true">
      <ellipse className="gd-tree-canopy" cx="50" cy="44" rx="44" ry="34" />
      <path className="gd-tree-trace" d="M50 128V70M50 70H30V60M50 70H70V62M50 86H34V100M50 96H66V106M50 70V56M50 56H40V40H28V30M50 56H62V44H72V28M50 56V18M40 40H18V46M62 44H84V42" />
      {nodes.map(([x, y], i) => <circle key={i} className="gd-tree-node" cx={x} cy={y} r={i % 3 ? 3.2 : 4.4} style={{ animationDelay: `${delay + i * 0.35}s` }} />)}
    </svg>
  );
}

function Island({ size, falls }: { size: number; falls: boolean }) {
  return (
    <svg className="gd-island-shape" viewBox="0 0 120 70" width={size} height={size * 0.58} aria-hidden="true">
      <path className="gd-island-rock" d="M8 22H112L84 52L62 68L40 54Z" />
      <path className="gd-island-top" d="M6 22Q14 10 34 14Q52 4 74 12Q98 8 114 22Z" />
      <path className="gd-island-edge" d="M8 22H112" />
      {falls && <rect className="gd-island-fall" x="74" y="22" width="6" height="48" rx="3" />}
      <circle className="gd-island-spire" cx="40" cy="8" r="2.5" />
      <path className="gd-island-spire-line" d="M40 10V20" />
    </svg>
  );
}

function Crystal({ x, y, layout, hue }: { x: number; y: number; layout: Layout; hue: number }) {
  const [ring, setRing] = useState(0);
  const size = (layout.big ? 26 : 16) * (0.75 + 0.4 * y);
  return (
    <button
      className="gd-crystal"
      style={{ left: x * layout.width - size / 2, top: layout.lawnY(y) - size * 1.4, width: size, height: size * 1.4, zIndex: 10 + Math.round(y * 100), "--hue": hue } as CSSProperties}
      onPointerDown={(e) => { e.stopPropagation(); setRing((r) => r + 1); }}
      aria-label="Crystal sprout"
      tabIndex={-1}
    >
      <svg viewBox="0 0 20 28" aria-hidden="true"><path d="M10 1L17 9V20L10 27L3 20V9Z" /><path className="gd-crystal-shine" d="M10 1V27M3 9L10 13L17 9" /></svg>
      {ring > 0 && <span key={ring} className="gd-crystal-ring" aria-hidden="true" />}
    </button>
  );
}

const GLYPHS = "01λΣ{}<>∆#*";

export const Scenery = memo(function Scenery({ layout, time, seed }: { layout: Layout; time: Time; seed: string }) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) % 10000) / 10000;
  const crystals = Array.from({ length: layout.big ? 5 : 3 }, () => ({ x: 0.1 + rand() * 0.8, y: 0.25 + rand() * 0.65, hue: [190, 280, 160, 320][Math.floor(rand() * 4)] }));
  const { width, horizon, lawnY, big } = layout;
  const tree = big ? 120 : 74;
  const pool = { x: 0.04, y: 0.66, w: big ? 0.24 : 0.28 };

  return (
    <>
      <div className="gd-sky" aria-hidden="true">
        <span className="gd-orb" />
        <div className="gd-island" style={{ left: "8%", top: "12%", animationDelay: "-2s" }}><Island size={big ? 150 : 82} falls /></div>
        <div className="gd-island" style={{ left: "60%", top: "4%", animationDelay: "-5s" }}><Island size={big ? 110 : 60} falls={false} /></div>
        {big && <div className="gd-island is-far" style={{ left: "38%", top: "22%" }}><Island size={70} falls /></div>}
        {Array.from({ length: big ? 4 : 2 }, (_, i) => (
          <svg key={i} className="gd-cloud" viewBox="0 0 80 20" style={{ top: `${10 + i * 22}%`, animationDuration: `${40 + i * 14}s`, animationDelay: `${-i * 13}s` }} aria-hidden="true">
            <path d="M4 14H76M14 8H58M24 2H44" />
          </svg>
        ))}
        {Array.from({ length: big ? 3 : 2 }, (_, i) => (
          <span key={i} className="gd-drone" style={{ top: `${44 + i * 16}%`, animationDuration: `${18 + i * 7}s`, animationDelay: `${-i * 6}s` }}><i /></span>
        ))}
      </div>

      <div className="gd-fence" style={{ top: horizon - 14 }} aria-hidden="true">
        <svg className="gd-gate" viewBox="0 0 40 34" style={{ left: width * 0.93 - (big ? 30 : 20) }} width={big ? 60 : 40} height={big ? 51 : 34}>
          <path d="M4 34V14Q20 -4 36 14V34" />
          <path className="gd-gate-glow" d="M8 34V16Q20 2 32 16V34" />
        </svg>
      </div>

      {[{ x: 0.06, y: 0.0, d: 0 }, { x: 0.44, y: 0.0, d: 1.2, s: 0.7 }, { x: 0.6, y: 0.02, d: 2.1, s: 0.85 }].map((t, i) => (
        <div key={i} className="gd-tree-wrap" style={{ left: t.x * width, top: lawnY(t.y) - tree * (t.s ?? 1) * 1.3 + 6, zIndex: 9 }} aria-hidden="true">
          <CircuitTree size={tree * (t.s ?? 1)} delay={t.d} />
        </div>
      ))}

      <div className="gd-pool" style={{ left: pool.x * width, top: lawnY(pool.y), width: pool.w * width, height: pool.w * width * 0.36, zIndex: 10 + Math.round(pool.y * 100) - 5 }} aria-hidden="true">
        <span className="gd-pool-ripple" />
        {Array.from({ length: big ? 9 : 5 }, (_, i) => (
          <span key={i} className="gd-glyph" style={{ left: `${15 + ((i * 71) % 70)}%`, animationDelay: `${-i * 0.9}s` }}>{GLYPHS[(i * 7) % GLYPHS.length]}</span>
        ))}
      </div>

      {crystals.map((c, i) => <Crystal key={i} x={c.x} y={c.y} hue={c.hue} layout={layout} />)}

      {time === "night" && (
        <div className="gd-pixels" aria-hidden="true">
          {Array.from({ length: big ? 22 : 12 }, (_, i) => <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${-i * 0.8}s`, animationDuration: `${7 + (i % 5)}s` }} />)}
        </div>
      )}
    </>
  );
});
