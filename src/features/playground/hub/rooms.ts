// The Hub's rooms: where their doors are, what's in the way, and the special
// spots (the dance floor, the desks, the reading nook). Positions are shares of
// a room's floor: x 0 (left) to 1 (right), y 0 (the back wall) to 1 (the front).
// Plain data and maths, so walking and doors are tested without drawing.

export type RoomId = "plaza" | "library" | "lab" | "terrace" | "arcade";

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

export interface Door extends Rect {
  to: RoomId;
  /** Where you come in on the other side. */
  arrive: Point;
  label: string;
}

/** A place where something happens while you stand in it. */
export interface Spot extends Rect {
  id: "dance" | "desk" | "nook" | "fountain" | "stage" | "pool";
}

export interface Room {
  id: RoomId;
  name: string;
  tagline: string;
  /** Where you appear when you enter the Hub here. */
  spawn: Point;
  doors: Door[];
  blocks: Rect[];
  spots: Spot[];
}

const door = (to: RoomId, label: string, rect: Rect, arrive: Point): Door => ({ to, label, arrive, ...rect });

export const ROOMS: Record<RoomId, Room> = {
  plaza: {
    id: "plaza",
    name: "The Plaza",
    tagline: "The heart of the Hub. Everyone passes through.",
    spawn: { x: 0.5, y: 0.72 },
    doors: [
      door("library", "Library", { x: 0, y: 0.3, w: 0.06, h: 0.3 }, { x: 0.88, y: 0.6 }),
      door("lab", "Focus Lab", { x: 0.94, y: 0.3, w: 0.06, h: 0.3 }, { x: 0.12, y: 0.6 }),
      door("terrace", "Garden Terrace", { x: 0.42, y: 0, w: 0.16, h: 0.08 }, { x: 0.5, y: 0.86 }),
      door("arcade", "Arcade", { x: 0.42, y: 0.93, w: 0.16, h: 0.07 }, { x: 0.5, y: 0.14 }),
    ],
    blocks: [{ x: 0.43, y: 0.3, w: 0.14, h: 0.16 }],
    spots: [{ id: "fountain", x: 0.38, y: 0.24, w: 0.24, h: 0.28 }],
  },
  library: {
    id: "library",
    name: "The Library",
    tagline: "Quiet please. Readers' AIs swap page counts here.",
    spawn: { x: 0.85, y: 0.6 },
    doors: [door("plaza", "Plaza", { x: 0.94, y: 0.4, w: 0.06, h: 0.3 }, { x: 0.12, y: 0.45 })],
    blocks: [{ x: 0.3, y: 0.42, w: 0.18, h: 0.12 }],
    spots: [{ id: "nook", x: 0.05, y: 0.55, w: 0.25, h: 0.35 }],
  },
  lab: {
    id: "lab",
    name: "The Focus Lab",
    tagline: "Heads down. Deep work, deep focus.",
    spawn: { x: 0.15, y: 0.6 },
    doors: [door("plaza", "Plaza", { x: 0, y: 0.4, w: 0.06, h: 0.3 }, { x: 0.88, y: 0.45 })],
    blocks: [{ x: 0.42, y: 0.18, w: 0.16, h: 0.1 }, { x: 0.68, y: 0.18, w: 0.16, h: 0.1 }, { x: 0.42, y: 0.58, w: 0.16, h: 0.1 }, { x: 0.68, y: 0.58, w: 0.16, h: 0.1 }],
    spots: [
      { id: "desk", x: 0.42, y: 0.28, w: 0.16, h: 0.12 },
      { id: "desk", x: 0.68, y: 0.28, w: 0.16, h: 0.12 },
      { id: "desk", x: 0.42, y: 0.68, w: 0.16, h: 0.12 },
      { id: "desk", x: 0.68, y: 0.68, w: 0.16, h: 0.12 },
    ],
  },
  terrace: {
    id: "terrace",
    name: "The Garden Terrace",
    tagline: "Fresh air, circuit trees and the data pool.",
    spawn: { x: 0.5, y: 0.85 },
    doors: [door("plaza", "Plaza", { x: 0.42, y: 0.93, w: 0.16, h: 0.07 }, { x: 0.5, y: 0.14 })],
    blocks: [{ x: 0.04, y: 0.6, w: 0.26, h: 0.18 }],
    spots: [{ id: "pool", x: 0.02, y: 0.55, w: 0.3, h: 0.28 }],
  },
  arcade: {
    id: "arcade",
    name: "The Arcade",
    tagline: "Step onto the floor and your AI can't help but dance.",
    spawn: { x: 0.5, y: 0.15 },
    doors: [door("plaza", "Plaza", { x: 0.42, y: 0, w: 0.16, h: 0.08 }, { x: 0.5, y: 0.86 })],
    blocks: [],
    spots: [{ id: "dance", x: 0.3, y: 0.4, w: 0.4, h: 0.38 }, { id: "stage", x: 0.72, y: 0.08, w: 0.24, h: 0.2 }],
  },
};

export const ROOM_ORDER: RoomId[] = ["plaza", "library", "lab", "terrace", "arcade"];

const inside = (p: Point, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const clamp = (v: number) => Math.min(0.99, Math.max(0.01, v));

/** Floor widths a second. */
export const WALK_SPEED = 0.3;

/** Whether the straight line from `a` to `b` crosses `r`. */
function crosses(a: Point, b: Point, r: Rect): boolean {
  for (let i = 1; i <= 24; i++) {
    const t = i / 24;
    if (inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, r)) return true;
  }
  return false;
}

const far = (a: Point, b: Point) => Math.hypot(a.x - b.x, (a.y - b.y) * 0.7);

/**
 * Where to head next on the way to `target`: straight there when nothing's in
 * the way, or else the first corner of the shortest path round the furniture.
 * The path runs between the corners of every block (a few points a room), so
 * it's cheap enough to work out afresh every step.
 */
export function via(room: Room, from: Point, target: Point): Point {
  const clearLine = (a: Point, b: Point) => !room.blocks.some((r) => crosses(a, b, r));
  if (clearLine(from, target)) return target;
  const m = 0.03;
  const corners = room.blocks
    .flatMap((r) => [
      { x: r.x - m, y: r.y - m }, { x: r.x + r.w + m, y: r.y - m },
      { x: r.x - m, y: r.y + r.h + m }, { x: r.x + r.w + m, y: r.y + r.h + m },
    ])
    .map((c) => ({ x: clamp(c.x), y: clamp(c.y) }))
    .filter((c) => !room.blocks.some((r) => inside(c, r)) && far(from, c) > 0.005);
  // Shortest path from `from` (node 0) to `target` (node 1) through the corners.
  const nodes = [from, target, ...corners];
  const cost = nodes.map(() => Infinity);
  const first = nodes.map((): number => -1);
  const done = nodes.map(() => false);
  cost[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && cost[i] < Infinity && (u < 0 || cost[i] < cost[u])) u = i;
    if (u < 0 || u === 1) break;
    done[u] = true;
    for (let v = 1; v < nodes.length; v++) {
      if (done[v] || !clearLine(nodes[u], nodes[v])) continue;
      const c = cost[u] + far(nodes[u], nodes[v]);
      if (c < cost[v]) {
        cost[v] = c;
        first[v] = u === 0 ? v : first[u];
      }
    }
  }
  return first[1] > 1 ? nodes[first[1]] : target;
}

/**
 * One step towards `target`, going round furniture on the way. Returns where
 * it got to, and whether it's arrived (or can get no closer).
 */
export function walk(room: Room, from: Point, target: Point, dt: number): { at: Point; arrived: boolean } {
  const step = (WALK_SPEED * dt) / 1000;
  if (far(from, target) <= step || far(from, target) < 0.002) return { at: { x: clamp(target.x), y: clamp(target.y) }, arrived: true };
  const goal = via(room, from, target);
  const dx = goal.x - from.x, dy = (goal.y - from.y) * 0.7;
  const dist = Math.hypot(dx, dy) || 1;
  const reach = Math.min(step, dist);
  const next = { x: clamp(from.x + (dx / dist) * reach), y: clamp(from.y + ((dy / dist) * reach) / 0.7) };
  const blocked = (p: Point) => room.blocks.some((b) => inside(p, b));
  if (!blocked(next)) return { at: next, arrived: false };
  // Grazing an edge: slide along it.
  const slideX = { x: next.x, y: from.y }, slideY = { x: from.x, y: next.y };
  if (!blocked(slideX) && Math.abs(dx) > 0.001) return { at: slideX, arrived: false };
  if (!blocked(slideY) && Math.abs(dy) > 0.001) return { at: slideY, arrived: false };
  return { at: from, arrived: true };
}

/** The door you're standing in, if any. */
export const doorAt = (room: Room, p: Point) => room.doors.find((d) => inside(p, d));

/** What you're standing on, if anything. */
export const spotAt = (room: Room, p: Point) => room.spots.find((s) => inside(p, s));

/** Somewhere to stand that isn't in anything's way. */
export function clear(room: Room, p: Point): Point {
  const q = { x: clamp(p.x), y: clamp(p.y) };
  return room.blocks.some((b) => inside(q, b)) ? room.spawn : q;
}
