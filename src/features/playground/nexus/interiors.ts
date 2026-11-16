// The buildings you can go inside: the Great Library's stacks and reading
// nooks, the Processor Core under the ziggurat, the Observatory in the great
// dome, and the Model Forge in the Model District's great pyramid. Each is its own small map (metres from the middle of the room,
// x east and z south, the way in on the south wall), with a door outside in
// the city that takes you in and a door inside that takes you back out.
// Plain data and maths: insides.ts draws them, and the server knows the same
// ids and sizes (crates/protocol/src/hub.rs, INTERIORS).
import { RIALTO_BENCH, alongSpan, districtOf, type DistrictId } from "./world.ts";
import { spanOf } from "./routes.ts";
import { makeMap, type Point, type Solid, type WalkMap } from "./walkmap.ts";

export type InteriorId = "library" | "core" | "observatory" | "forge";

export interface Interior {
  id: InteriorId;
  name: string;
  subtitle: string;
  district: DistrictId;
  color: string;
  halfW: number;
  halfD: number;
  /** A round room's radius. */
  round?: number;
  solids: Solid[];
  /** Where you arrive inside, facing into the room. */
  spawn: Point;
  /** The way out, on the inside: step on it to leave. */
  door: Point;
  /** Out in the city: the door you step on to come in, where you come back out, and which way you face then. */
  outside: { door: Point; out: Point; heading: number };
  map: WalkMap;
}

/** How near a door you have to be to go through it. */
export const DOOR_REACH = 1.8;

const box = (x: number, z: number, w: number, d: number): Solid => ({ kind: "box", x, z, w, d });
const circle = (x: number, z: number, r: number): Solid => ({ kind: "circle", x, z, r });

// ---------- The Great Library: stacks either side of a nave, nooks at the front ----------

/** The rows of shelves, either side: aisles between them to wander (and hide in). */
export const STACK_ROWS = [-15, -10, -5, 0, 5];
const library: Solid[] = [
  ...STACK_ROWS.flatMap((z) => [box(-19, z, 14, 1.2), box(19, z, 14, 1.2)]),
  // Two long reading tables down the nave.
  box(-5, -2, 2.4, 10), box(5, -2, 2.4, 10),
  // The atlas desk at the far end, under its globe.
  circle(0, -16, 3),
  // Reading nooks in the front corners: armchairs round a low table.
  circle(-24, 15, 1), circle(-20, 17.5, 1), circle(-22, 12, 0.8),
  circle(24, 15, 1), circle(20, 17.5, 1), circle(22, 12, 0.8),
];

// ---------- The Processor Core: racks in banks, round a great glowing core ----------

/** The racks' rows, each bank in two runs with a cross-aisle between. */
export const RACK_COLUMNS = [-21, -17, -13, 13, 17, 21];
export const CORE = { x: 0, z: -4, r: 4.5 };
const core: Solid[] = [
  ...RACK_COLUMNS.flatMap((x) => [box(x, -10, 1.4, 7), box(x, 4, 1.4, 7)]),
  circle(CORE.x, CORE.z, CORE.r),
  // Consoles round the core.
  ...[Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].map((a) => circle(CORE.x + Math.cos(a) * 9, CORE.z + Math.sin(a) * 9, 0.9)),
];

// ---------- The Observatory: under the stars, round an orrery ----------

/** The planet pedestals round the room (none across the way in). */
export const PEDESTALS = [200, 250, 290, 330, 20].map((deg) => ({ x: Math.cos((deg * Math.PI) / 180) * 14, z: Math.sin((deg * Math.PI) / 180) * 14 }));
export const TELESCOPE = { x: -12, z: 8 };
const observatory: Solid[] = [
  circle(0, 0, 3.5),
  ...PEDESTALS.map((p) => circle(p.x, p.z, 1)),
  circle(TELESCOPE.x, TELESCOPE.z, 1.5),
];

// ---------- The Model Forge: a neural network you can walk round, training pods, planters ----------

export const NETWORK = { x: 0, z: -5, r: 6 };
/** The training pods, either side. */
export const PODS = [-12, -2, 8].flatMap((z) => [{ x: -14, z }, { x: 14, z }]);
const forge: Solid[] = [
  circle(NETWORK.x, NETWORK.z, NETWORK.r),
  ...PODS.map((p) => circle(p.x, p.z, 1.3)),
  // Planters along the side walls.
  box(-24, -2, 3, 26), box(24, -2, 3, 26),
];

// ---------- The doors out in the city ----------

/** In front of the library's grand doorway. */
const libraryDoor = { door: { x: -150, z: -81.4 }, out: { x: -150, z: -76.5 }, heading: 0 };
/** On the ziggurat's west face, where the conduit runs in. */
const coreDoor = { door: { x: 170.6, z: -48 }, out: { x: 166, z: -48 }, heading: -Math.PI / 2 };
/** On the great pyramid's east face, towards the gardens. */
const forgeDoor = { door: { x: -156.6, z: 94 }, out: { x: -152, z: 94 }, heading: Math.PI / 2 };
/** The great dome's door, facing back towards the Nexus. */
const domeOut = (() => {
  const c = { x: 150, z: 138 }, len = Math.hypot(c.x, c.z), u = { x: -c.x / len, z: -c.z / len };
  return { door: { x: c.x + u.x * 14.2, z: c.z + u.z * 14.2 }, out: { x: c.x + u.x * 18, z: c.z + u.z * 18 }, heading: Math.atan2(u.x, u.z) };
})();

function interior(base: Omit<Interior, "map" | "name" | "color"> & { name: string }): Interior {
  const map = makeMap({ solids: base.solids, halfW: base.halfW, halfD: base.halfD, round: base.round, cell: 1, fallback: base.spawn });
  return { ...base, color: districtOf(base.district).color, map };
}

export const INTERIORS: Interior[] = [
  interior({
    id: "library", name: "The Great Library", subtitle: "Stacks · Nooks · Quiet", district: "memory",
    halfW: 32, halfD: 22, solids: library, spawn: { x: 0, z: 16.5 }, door: { x: 0, z: 20.4 }, outside: libraryDoor,
  }),
  interior({
    id: "core", name: "The Processor Core", subtitle: "Where the thinking happens", district: "computation",
    halfW: 26, halfD: 20, solids: core, spawn: { x: 0, z: 14.5 }, door: { x: 0, z: 18.4 }, outside: coreDoor,
  }),
  interior({
    id: "observatory", name: "The Observatory", subtitle: "Every world, overhead", district: "simulation",
    halfW: 24, halfD: 24, round: 24, solids: observatory, spawn: { x: 0, z: 18.5 }, door: { x: 0, z: 22.2 }, outside: domeOut,
  }),
  interior({
    id: "forge", name: "The Model Forge", subtitle: "Learn · Generate · Create", district: "gardens",
    halfW: 26, halfD: 22, solids: forge, spawn: { x: 0, z: 16.5 }, door: { x: 0, z: 20.4 }, outside: forgeDoor,
  }),
];

export const interiorOf = (id: string): Interior | undefined => INTERIORS.find((i) => i.id === id);

// ---------- Spots: places that do something when you stand in them ----------

/** What a spot does: dance (everyone sees), sit down for a read, look up at the stars, or take in the view. */
export type SpotKind = "dance" | "sit" | "stargaze" | "lookout";

export interface Spot {
  id: string;
  kind: SpotKind;
  /** The building it's in, or null for out in the city. */
  place: InteriorId | null;
  x: number;
  z: number;
  r: number;
  /** What it says when you step on. */
  label: string;
}

export const SPOTS: Spot[] = [
  { id: "dancefloor", kind: "dance", place: null, x: 108, z: 104, r: 7, label: "The dance floor" },
  { id: "nook-west", kind: "sit", place: "library", x: -21, z: 15, r: 3.4, label: "A reading nook" },
  { id: "nook-east", kind: "sit", place: "library", x: 21, z: 15, r: 3.4, label: "A reading nook" },
  { id: "telescope", kind: "stargaze", place: "observatory", x: TELESCOPE.x, z: TELESCOPE.z + 2.8, r: 1.8, label: "The telescope" },
  { id: "rialto-bench", kind: "sit", place: null, x: RIALTO_BENCH.x, z: RIALTO_BENCH.z, r: 3.6, label: "The Rialto's bench" },
  (() => { const p = alongSpan(spanOf("golden-gate")!, 0.5); return { id: "gate-lookout", kind: "lookout" as const, place: null, x: p.x, z: p.z, r: 4, label: "Halfway across the Golden Gate" }; })(),
];

/** The spot you're standing in, if any. */
export function spotAt(place: InteriorId | null, p: Point): Spot | null {
  return SPOTS.find((s) => s.place === place && Math.hypot(p.x - s.x, p.z - s.z) <= s.r) ?? null;
}
