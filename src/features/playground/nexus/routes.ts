// How Nexus hangs together: every district is an island at its own height,
// rising out of a river of light nobody can walk on, and the only ways between
// them are the named routes: bridges, a wall walk, a long stair, a rainbow,
// and a gravity lift that floats you up to the Simulation Chambers.
//
//   The Nexus            10 m   the hub, in the middle
//   Memory District      18 m   on the heights (its library higher still)
//   Computation District  6 m   down in the works
//   Simulation Chambers  24 m   a floating island
//   Model District        3 m   gardens down by the river
//
// Plain data and maths (bridges.ts draws them), tested without a screen.
import type { Point } from "./walkmap.ts";

export type IslandId = "nexus" | "memory" | "computation" | "simulation" | "gardens";

export interface Island { id: IslandId; x: number; z: number; r: number; h: number }

export const ISLANDS: Island[] = [
  { id: "nexus", x: 0, z: 0, r: 52, h: 10 },
  { id: "memory", x: -145, z: -78, r: 62, h: 18 },
  { id: "computation", x: 145, z: -78, r: 62, h: 6 },
  { id: "simulation", x: 132, z: 120, r: 62, h: 24 },
  { id: "gardens", x: -132, z: 120, r: 62, h: 3 },
];
export const islandOf = (id: IslandId) => ISLANDS.find((i) => i.id === id)!;

/** What a route is like to cross. */
export type SpanKind = "market" | "suspension" | "wall" | "towers" | "steps" | "rainbow";

export interface Span {
  id: string;
  name: string;
  /** A line about it, for its title card. */
  blurb: string;
  kind: SpanKind;
  from: IslandId;
  to: IslandId;
  /** Its middle line, and how high it is at each point. */
  points: Point[];
  heights: number[];
  /** Where it leaves one island and reaches the other: its height rises evenly between them, by how far along you are. */
  chord: [Point, Point];
  width: number;
  color: string;
}

const unit = (dx: number, dz: number): Point => { const l = Math.hypot(dx, dz); return { x: dx / l, z: dz / l }; };

/**
 * A route from one island to another: a flat landing reaching 4 m into each,
 * then the crossing, through any `bends` (sideways offsets at even steps along
 * it, for a route that winds).
 */
function span(base: Omit<Span, "points" | "heights" | "chord">, bends: number[] = []): Span {
  const a = islandOf(base.from), b = islandOf(base.to);
  const u = unit(b.x - a.x, b.z - a.z), n = { x: -u.z, z: u.x };
  const at = (island: Island, sign: number, inset: number): Point => ({ x: island.x + u.x * sign * (island.r - inset), z: island.z + u.z * sign * (island.r - inset) });
  const startIn = at(a, 1, 4), startEdge = at(a, 1, 0), endEdge = at(b, -1, 0), endIn = at(b, -1, 4);
  const middle = bends.map((off, i) => {
    const t = (i + 1) / (bends.length + 1);
    return { x: startEdge.x + (endEdge.x - startEdge.x) * t + n.x * off, z: startEdge.z + (endEdge.z - startEdge.z) * t + n.z * off };
  });
  const points = [startIn, startEdge, ...middle, endEdge, endIn];
  const chord: [Point, Point] = [startEdge, endEdge];
  const made = { ...base, points, chord, heights: [] as number[] };
  // Rising evenly from one island's height to the other's: by how far along the straight way across you are,
  // so a winding route never jumps where it bends.
  made.heights = points.map((p) => heightOnSpan(made, p));
  return made;
}

export const SPANS: Span[] = [
  span({ id: "rialto", name: "The Rialto of Recall", blurb: "A market bridge up to the Memory District. Stop for a while.", kind: "market", from: "nexus", to: "memory", width: 16, color: "#ffd89a" }),
  span({ id: "golden-gate", name: "The Golden Gate", blurb: "The great suspension bridge down to the Computation District.", kind: "suspension", from: "nexus", to: "computation", width: 10, color: "#ffb347" }),
  span({ id: "firewall", name: "The Great Firewall", blurb: "Walk the wall, tower to tower, down to the Model District.", kind: "wall", from: "nexus", to: "gardens", width: 9, color: "#ff7a45" }, [13, -13]),
  span({ id: "tower-bridge", name: "Tower Bridge", blurb: "Up between the towers, from the works to the Simulation Chambers.", kind: "towers", from: "computation", to: "simulation", width: 9, color: "#6fe3ff" }),
  span({ id: "thousand-steps", name: "The Thousand Steps", blurb: "The long stair down the cliffs, from the archives to the gardens.", kind: "steps", from: "memory", to: "gardens", width: 9, color: "#ffe2b0" }, [-6, 4, -3]),
  span({ id: "bifrost", name: "The Bifröst", blurb: "The rainbow bridge, from the floating Chambers down to the gardens.", kind: "rainbow", from: "simulation", to: "gardens", width: 9, color: "#c58bff" }),
];
export const spanOf = (id: string) => SPANS.find((s) => s.id === id);

/** How high a route is at a spot on it. */
function heightOnSpan(s: Span, p: Point): number {
  const [a, b] = s.chord, dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  const ha = islandOf(s.from).h, hb = islandOf(s.to).h;
  return ha + (hb - ha) * t;
}

/** Where along a route a spot is: which stretch, how far along it (0–1), and how far from its middle line. */
function onSpan(s: Span, p: Point): { i: number; t: number; off: number } {
  let best = { i: 0, t: 0, off: Infinity };
  for (let i = 0; i + 1 < s.points.length; i++) {
    const a = s.points[i], b = s.points[i + 1], dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
    const off = Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
    if (off < best.off) best = { i, t, off };
  }
  return best;
}

/** How far a spot is from a route's middle line. */
export const fromSpan = (s: Span, p: Point) => onSpan(s, p).off;

/** The route a spot's on, if any (landings inside an island count as the island, not the route). */
export function spanAt(p: Point): Span | null {
  for (const s of SPANS) {
    const { i, off } = onSpan(s, p);
    if (off <= s.width / 2 && i > 0 && i < s.points.length - 2) return s;
  }
  return null;
}

/** The island a spot's on, if any. */
export function islandAt(p: Point): Island | null {
  return ISLANDS.find((i) => Math.hypot(p.x - i.x, p.z - i.z) <= i.r) ?? null;
}

/** Somewhere you can stand, `pad` metres clear of the edge: an island or a route. */
export function walkable(p: Point, pad: number): boolean {
  if (ISLANDS.some((i) => Math.hypot(p.x - i.x, p.z - i.z) <= i.r - pad)) return true;
  return SPANS.some((s) => onSpan(s, p).off <= s.width / 2 - pad);
}

/** How high the ground (an island or a route) is at a spot; 0 down in the river. */
export function groundAt(p: Point): number {
  for (const s of SPANS) if (onSpan(s, p).off <= s.width / 2) return heightOnSpan(s, p);
  return islandAt(p)?.h ?? 0;
}

// ---------- The gravity lift ----------

export interface Lift {
  id: string;
  name: string;
  blurb: string;
  /** The pads at either end, and the islands they're on. */
  a: Point;
  b: Point;
  from: IslandId;
  to: IslandId;
  color: string;
  /** How long the ride takes, in seconds. */
  ride: number;
}

export const LIFTS: Lift[] = (() => {
  const a = islandOf("nexus"), b = islandOf("simulation"), u = unit(b.x - a.x, b.z - a.z);
  return [{
    id: "ascension", name: "The Ascension Lift", blurb: "Step on, and float up the gravity stream to the Simulation Chambers.",
    a: { x: a.x + u.x * (a.r - 7), z: a.z + u.z * (a.r - 7) }, b: { x: b.x - u.x * (b.r - 7), z: b.z - u.z * (b.r - 7) },
    from: "nexus", to: "simulation", color: "#c58bff", ride: 4.5,
  }];
})();

/** How near a lift's pad you step to ride it. */
export const PAD_REACH = 2;

/** Where you are `t` (0–1) of the way along a lift's ride, from pad `from` to the other: up and over in an arc. */
export function liftAt(lift: Lift, t: number, forward: boolean): { x: number; y: number; z: number } {
  const s = forward ? t : 1 - t;
  const ha = islandOf(lift.from).h, hb = islandOf(lift.to).h;
  const ease = s * s * (3 - 2 * s);
  return {
    x: lift.a.x + (lift.b.x - lift.a.x) * ease,
    z: lift.a.z + (lift.b.z - lift.a.z) * ease,
    y: ha + (hb - ha) * ease + Math.sin(Math.PI * s) * 22,
  };
}
