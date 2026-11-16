// Height in Nexus: raised terraces you climb stairs to reach. A terrace is a
// flat platform (a box or a circle) at some height; a flight of stairs runs
// from a point on its edge down to the ground. Everywhere else is ground
// level. Walking stays on the map (x and z); how high you stand comes from
// here.
//
// A terrace's edge is solid all round (a balustrade), except where stairs
// meet it, and stairs have rails down both sides, so the only way up or down
// is the stairs: no stepping off a ledge, no climbing a wall. Plain maths,
// tested without a screen.
import type { Point, Solid } from "./walkmap.ts";

/** A terrace stands on `base` (the island under it) and its top is at `h`. */
export type Terrace =
  | { id: string; kind: "box"; x: number; z: number; w: number; d: number; base: number; h: number }
  | { id: string; kind: "circle"; x: number; z: number; r: number; base: number; h: number };

export interface Stair {
  id: string;
  /** The middle of the top step, on the terrace's edge. */
  top: Point;
  /** Which way is down: a unit direction on the map. */
  dir: Point;
  length: number;
  width: number;
  /** Heights at the top and the bottom. */
  high: number;
  low: number;
}

/** Where a spot is relative to a flight of stairs: `u` metres down it from the top, `v` across from its middle. */
export function onStair(s: Stair, p: Point): { u: number; v: number } {
  const dx = p.x - s.top.x, dz = p.z - s.top.z;
  return { u: dx * s.dir.x + dz * s.dir.z, v: -dx * s.dir.z + dz * s.dir.x };
}

/** A spot on the stairs' own map, back to the city's. */
export function fromStair(s: Stair, u: number, v: number): Point {
  return { x: s.top.x + s.dir.x * u - s.dir.z * v, z: s.top.z + s.dir.z * u + s.dir.x * v };
}

const onTerrace = (t: Terrace, p: Point) =>
  t.kind === "box" ? Math.abs(p.x - t.x) <= t.w / 2 && Math.abs(p.z - t.z) <= t.d / 2 : Math.hypot(p.x - t.x, p.z - t.z) <= t.r;

/** How high the ground is at a spot. Stairs reach a metre into the terrace above, so there's never a gap where they meet. */
export function heightAt(terraces: Terrace[], stairs: Stair[], p: Point, ground = 0): number {
  let h = ground;
  for (const t of terraces) if (t.h > h && onTerrace(t, p)) h = t.h;
  for (const s of stairs) {
    const { u, v } = onStair(s, p);
    if (u < -1 || u > s.length || Math.abs(v) > s.width / 2) continue;
    const here = s.high + (s.low - s.high) * Math.max(0, u / s.length);
    if (here > h) h = here;
  }
  return h;
}

/** Posts this big, this far apart, make a solid edge you can't squeeze through. */
const POST = 0.45, GAP = 0.9;

/** The balustrades round the terraces (open where stairs meet them) and the rails down the stairs. */
export function edges(terraces: Terrace[], stairs: Stair[]): Solid[] {
  const out: Solid[] = [];
  const mouth = (p: Point) => stairs.some((s) => {
    const { u, v } = onStair(s, p);
    return Math.abs(v) < s.width / 2 + 0.2 && u > -2 && u < 1.5;
  });
  const post = (p: Point) => { if (!mouth(p)) out.push({ kind: "circle", x: p.x, z: p.z, r: POST }); };
  for (const t of terraces) {
    if (t.kind === "circle") {
      const r = t.r - POST, count = Math.ceil((Math.PI * 2 * r) / GAP);
      for (let i = 0; i < count; i++) post({ x: t.x + Math.cos((i / count) * Math.PI * 2) * r, z: t.z + Math.sin((i / count) * Math.PI * 2) * r });
    } else {
      const hw = t.w / 2 - POST, hd = t.d / 2 - POST;
      for (const [ax, az, bx, bz] of [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd]]) {
        const len = Math.hypot(bx - ax, bz - az), count = Math.ceil(len / GAP);
        for (let i = 0; i < count; i++) post({ x: t.x + ax + ((bx - ax) * i) / count, z: t.z + az + ((bz - az) * i) / count });
      }
    }
  }
  for (const s of stairs) {
    for (const side of [-1, 1]) {
      for (let u = -0.5; u <= s.length; u += GAP) out.push({ kind: "circle", ...fromStair(s, u, side * (s.width / 2 + POST)), r: POST });
    }
  }
  return out;
}

/** The steepest the stairs get: height per metre walked. */
export const steepest = (stairs: Stair[]) => Math.max(0, ...stairs.map((s) => (s.high - s.low) / s.length));
