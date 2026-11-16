// Nexus: the city of AIs. Its districts, roads and solid things, and how to
// walk across it. Plain data and maths (engine.ts draws it), so paths and
// districts are tested without a screen.
//
// World units are metres: x runs east, z south, the Nexus spire at (0, 0).
// The map is big on purpose: room for everyone to wander. Each district is an
// island at its own height over a river of light, joined by named routes
// (routes.ts); levels.ts raises the terraces and stairs on top.

export type DistrictId = "nexus" | "memory" | "computation" | "simulation" | "gardens";

import { makeMap, type Point, type Solid } from "./walkmap.ts";
import { edges, heightAt, type Stair, type Terrace } from "./levels.ts";
import { LIFTS, SPANS, groundAt, islandOf, spanOf, walkable, type Span } from "./routes.ts";

export type { Point, Solid };

export interface District {
  id: DistrictId;
  name: string;
  subtitle: string;
  center: Point;
  radius: number;
  /** Its glow. */
  color: string;
}


export const HALF = 230;

export const DISTRICTS: District[] = [
  { id: "nexus", name: "The Nexus", subtitle: "Intelligence Exchange", center: { x: 0, z: 0 }, radius: 52, color: "#8fc4ff" },
  { id: "memory", name: "Memory District", subtitle: "The Infinite Archives", center: { x: -145, z: -78 }, radius: 62, color: "#ffd89a" },
  { id: "computation", name: "Computation District", subtitle: "Process · Optimise · Evolve", center: { x: 145, z: -78 }, radius: 62, color: "#6fe3ff" },
  { id: "simulation", name: "Simulation Chambers", subtitle: "Worlds Within Worlds", center: { x: 132, z: 120 }, radius: 62, color: "#c58bff" },
  { id: "gardens", name: "Model District", subtitle: "Learn · Generate · Create", center: { x: -132, z: 120 }, radius: 62, color: "#7ff5c9" },
];

export const districtOf = (id: DistrictId) => DISTRICTS.find((d) => d.id === id)!;

/** Where you arrive: on the Nexus, below its grand stairs. */
export const SPAWN: Point = { x: 0, z: 34 };

// ---------- Levels: the islands, the routes between them, the dais and the library's terrace ----------

const nexusIsland = islandOf("nexus"), memoryIsland = islandOf("memory");

/** The Nexus's citadel stands on a round dais; the Great Library on a terrace above the Memory District. */
export const DAIS: Terrace = { id: "dais", kind: "circle", x: 0, z: 0, r: 20, base: nexusIsland.h, h: nexusIsland.h + 2.5 };
export const LIBRARY_TERRACE: Terrace = { id: "library", kind: "box", x: -150, z: -91, w: 52, d: 42, base: memoryIsland.h, h: memoryIsland.h + 4 };
export const TERRACES: Terrace[] = [DAIS, LIBRARY_TERRACE];

const unit = (p: Point): Point => { const l = Math.hypot(p.x, p.z); return { x: p.x / l, z: p.z / l }; };
/** Stairs down from the dais: a grand flight south to where you arrive, and one towards each way off the Nexus. */
const daisWays: Point[] = [
  { x: 0, z: 1 },
  ...SPANS.filter((r) => r.from === "nexus").map((r) => unit(r.points[2])),
  ...LIFTS.filter((l) => l.from === "nexus").map((l) => unit(l.a)),
];
const daisStairs: Stair[] = daisWays.map((dir, i) => ({
  id: `dais-${i}`, top: { x: dir.x * DAIS.r, z: dir.z * DAIS.r }, dir, length: 7, width: i === 0 ? 10 : 8, high: DAIS.h, low: DAIS.base,
}));
export const STAIRS: Stair[] = [
  ...daisStairs,
  // The library's grand staircase, down from its doors towards the Nexus.
  { id: "library", top: { x: -150, z: -70 }, dir: { x: 0, z: 1 }, length: 10, width: 10, high: LIBRARY_TERRACE.h, low: LIBRARY_TERRACE.base },
];

/** How high the ground is anywhere in the city: the island or route you're on, raised by any terrace or stairs. */
export const cityHeight = (p: Point) => heightAt(TERRACES, STAIRS, p, groundAt(p));

// ---------- On the routes ----------

/** A spot `along` (0–1) the crossing part of a route, `off` metres to its side. */
export function alongSpan(r: Span, along: number, off = 0): Point & { y: number; dir: Point } {
  const pts = r.points.slice(1, -1), hs = r.heights.slice(1, -1);
  const lengths = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.z - pts[i].z));
  let left = along * lengths.reduce((a, b) => a + b, 0), i = 0;
  while (i < lengths.length - 1 && left > lengths[i]) left -= lengths[i++];
  const t = Math.min(1, left / lengths[i]), a = pts[i], b = pts[i + 1], dir = unit({ x: b.x - a.x, z: b.z - a.z });
  return { x: a.x + (b.x - a.x) * t - dir.z * off, z: a.z + (b.z - a.z) * t + dir.x * off, y: hs[i] + (hs[i + 1] - hs[i]) * t, dir };
}

/** The Rialto's market stalls, down both sides, and the bench in its middle where people stop. */
const rialto = spanOf("rialto")!;
export const STALLS: (Point & { side: number; dir: Point })[] = Array.from({ length: 9 }, (_, i) => 0.12 + i * 0.095)
  .filter((t) => Math.abs(t - 0.5) > 0.06)
  .flatMap((t) => [-1, 1].map((side) => ({ ...alongSpan(rialto, t, side * 6.6), side })));
export const RIALTO_BENCH: Point = alongSpan(rialto, 0.5);

const ring = (cx: number, cz: number, radius: number, count: number, r: number): Solid[] =>
  Array.from({ length: count }, (_, i) => ({ kind: "circle", x: cx + Math.cos((i / count) * Math.PI * 2) * radius, z: cz + Math.sin((i / count) * Math.PI * 2) * radius, r }));

/** Where the Simulation Chambers' ring track stands, and the gap left for the way in from the lift. */
export const TRACK = { x: 132, z: 120, r: 50 };
const roadAngle = Math.atan2(0 - TRACK.z, 0 - TRACK.x);

/** Everything solid, matching what's drawn. Kept off the routes' middles, so every district stays reachable. */
export const SOLIDS: Solid[] = [
  // The Nexus: the crystal spire cluster, and a ring of pylons round the square.
  { kind: "circle", x: 0, z: 0, r: 11 },
  ...ring(0, 0, 34, 8, 1.6).filter((_, i) => i % 2 === 1),
  // Memory District: the Great Library, its front towers and obelisks, and the archive towers.
  { kind: "box", x: -150, z: -96, w: 46, d: 26 },
  { kind: "circle", x: -170, z: -81, r: 4 },
  { kind: "circle", x: -130, z: -81, r: 4 },
  { kind: "circle", x: -157, z: -74, r: 1.2 },
  { kind: "circle", x: -143, z: -74, r: 1.2 },
  { kind: "circle", x: -186, z: -60, r: 7 },
  { kind: "circle", x: -112, z: -40, r: 5 },
  // Computation District: a grid of compute cubes, and the processor ziggurat.
  ...[-18, 0, 18].flatMap((dx) => [-18, 18].map((dz): Solid => ({ kind: "box", x: 155 + dx, z: -90 + dz, w: 8, d: 8 }))),
  { kind: "box", x: 180, z: -48, w: 16, d: 16 },
  // Simulation Chambers: the domes, and the ring track's pillars (none across the road in).
  { kind: "circle", x: 150, z: 138, r: 13 },
  { kind: "circle", x: 118, z: 150, r: 8 },
  { kind: "circle", x: 160, z: 100, r: 7 },
  ...Array.from({ length: 14 }, (_, i) => (i / 14) * Math.PI * 2)
    .filter((t) => Math.abs(Math.atan2(Math.sin(t - roadAngle), Math.cos(t - roadAngle))) > 0.35)
    .map((t): Solid => ({ kind: "circle", x: TRACK.x + Math.cos(t) * TRACK.r, z: TRACK.z + Math.sin(t) * TRACK.r, r: 1.3 })),
  // Model District: the data pool, its circuit trees, and the fractal pyramids.
  { kind: "circle", x: -150, z: 140, r: 12 },
  ...ring(-118, 104, 14, 5, 2.5),
  { kind: "box", x: -168, z: 94, w: 20, d: 20 },
  { kind: "box", x: -100, z: 152, w: 14, d: 14 },
  // The terraces' balustrades and the stairs' rails.
  ...edges(TERRACES, STAIRS),
  // The Rialto's stalls and its bench.
  ...STALLS.map((p): Solid => ({ kind: "circle", x: p.x, z: p.z, r: 1.4 })),
  { kind: "circle", x: RIALTO_BENCH.x, z: RIALTO_BENCH.z, r: 1.1 },
];

export function districtAt(p: Point): District | null {
  let best: District | null = null, nearest = Infinity;
  for (const d of DISTRICTS) {
    const far = Math.hypot(p.x - d.center.x, p.z - d.center.z);
    if (far <= d.radius && far < nearest) {
      best = d;
      nearest = far;
    }
  }
  return best;
}

/** The city's walkable map. */
export const CITY = makeMap({ solids: SOLIDS, halfW: HALF, halfD: HALF, cell: 2, fallback: SPAWN, height: cityHeight, walkable });
export const { blocked, clearLine, nearestOpen, findPath } = CITY;

/** Walking speed, metres a second. */
export const WALK = 9;

// ---------- Planning a trip: walk, or take the lift ----------

export interface Trip {
  /** Walk this way. */
  path: Point[];
  /** Then ride this lift (`forward`: from its first pad to its second), and walk on to `then`. */
  lift?: { id: string; forward: boolean };
  then?: Point;
}

const lengthOf = (from: Point, path: Point[]) => path.reduce((sum, p, i) => sum + Math.hypot(p.x - (i ? path[i - 1] : from).x, p.z - (i ? path[i - 1] : from).z), 0);
const reaches = (path: Point[], goal: Point) => path.length > 0 && Math.hypot(path[path.length - 1].x - goal.x, path[path.length - 1].z - goal.z) < 3;
/** A lift ride counts as this much walking. */
const RIDE_COST = 30;

/** The best way from one spot to another: walking all the way, or walking to a lift, riding it, and walking on. */
export function planTrip(from: Point, to: Point): Trip {
  const goal = nearestOpen(to);
  const direct = findPath(from, goal);
  let best: (Trip & { cost: number }) | null = reaches(direct, goal) ? { path: direct, cost: lengthOf(from, direct) } : null;
  for (const lift of LIFTS) {
    for (const forward of [true, false]) {
      const pad = forward ? lift.a : lift.b, other = forward ? lift.b : lift.a;
      const toPad = Math.hypot(from.x - pad.x, from.z - pad.z) < 0.5 ? [pad] : findPath(from, pad);
      if (!reaches(toPad, pad)) continue;
      const onward = findPath(other, goal);
      if (!reaches(onward, goal) && Math.hypot(other.x - goal.x, other.z - goal.z) > 3) continue;
      const cost = lengthOf(from, toPad) + RIDE_COST + lengthOf(other, onward);
      if (!best || cost < best.cost) best = { path: toPad, lift: { id: lift.id, forward }, then: goal, cost };
    }
  }
  return best ?? { path: direct };
}
