// Nexus, the city of AIs: its districts and finding the way across it. Every
// district reachable from where you arrive, paths that never cut through the
// spire, the library hall or a dome, and quick even across the whole map.
// `node --test tests/nexus-world.mjs`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ISLANDS, LIFTS, SPANS, groundAt, islandOf, spanAt, walkable } from "../src/features/playground/nexus/routes.ts";
import { DISTRICTS, HALF, SOLIDS, SPAWN, blocked, clearLine, districtAt, findPath, nearestOpen } from "../src/features/playground/nexus/world.ts";

const walkableFrom = (from, path) => {
  let at = from;
  for (const p of path) {
    assert.ok(clearLine(at, p), `a leg from ${at.x.toFixed(1)},${at.z.toFixed(1)} to ${p.x.toFixed(1)},${p.z.toFixed(1)} cuts through something`);
    at = p;
  }
  return at;
};

test("you arrive on open ground, in the Nexus", () => {
  assert.equal(blocked(SPAWN), false);
  assert.equal(districtAt(SPAWN)?.id, "nexus");
});

test("every district's heart can be reached from where you arrive", () => {
  for (const d of DISTRICTS) {
    const path = findPath(SPAWN, d.center);
    assert.ok(path.length > 0, `a way to ${d.name}`);
    const end = walkableFrom(SPAWN, path);
    // The heart may be solid (the Nexus spire): then the nearest open spot to it.
    const heart = nearestOpen(d.center);
    assert.ok(Math.hypot(end.x - heart.x, end.z - heart.z) < 1, `ends at ${d.name}'s heart`);
    assert.equal(districtAt(end)?.id, d.id);
  }
});

test("a walk straight through the spire goes round it", () => {
  const from = { x: 0, z: 40 }, to = { x: 0, z: -40 };
  assert.equal(clearLine(from, to), false, "the spire's in the way");
  const path = findPath(from, to);
  assert.ok(path.length >= 2, "via a corner or two");
  const end = walkableFrom(from, path);
  assert.ok(Math.hypot(end.x - to.x, end.z - to.z) < 1);
});

test("a click inside something solid walks to the nearest open spot", () => {
  const inHall = { x: -150, z: -96 };
  assert.equal(blocked(inHall), true);
  const spot = nearestOpen(inHall);
  assert.equal(blocked(spot), false);
  const path = findPath(SPAWN, inHall);
  assert.ok(path.length && !blocked(path[path.length - 1]));
});

test("a spot right beside a dome is reached from across the map", () => {
  const from = nearestOpen({ x: -170, z: -40 }), to = { x: 150, z: 150 };
  assert.equal(blocked(to), true, "just inside the big dome");
  const path = findPath(from, to);
  assert.ok(path.length > 0, "a way there");
  const end = walkableFrom(from, path);
  assert.ok(Math.hypot(end.x - to.x, end.z - to.z) < 6, `ends beside it, at ${end.x.toFixed(1)},${end.z.toFixed(1)}`);
});

test("from one far side of the city to the other is quick", () => {
  // The Memory District's far corner to the Simulation Chambers' far edge.
  const from = nearestOpen({ x: -200, z: -110 }), to = nearestOpen({ x: 190, z: 150 });
  findPath(SPAWN, DISTRICTS[1].center); // the first call works out the grid
  const t = performance.now();
  const path = findPath(from, to);
  const took = performance.now() - t;
  assert.ok(path.length > 0);
  walkableFrom(from, path);
  assert.ok(took < 150, `took ${took.toFixed(1)} ms`);
});

test("checking a spot against nearby solids gives the same answer as checking them all", () => {
  const slow = (p) => Math.abs(p.x) > HALF - 2 || Math.abs(p.z) > HALF - 2 || !walkable(p, 0.8) || SOLIDS.some((s) => s.kind === "circle"
    ? Math.hypot(p.x - s.x, p.z - s.z) < s.r + 0.8
    : Math.abs(p.x - s.x) < s.w / 2 + 0.8 && Math.abs(p.z - s.z) < s.d / 2 + 0.8);
  for (let i = 0; i < 20000; i++) {
    const p = { x: (Math.random() * 2 - 1) * HALF, z: (Math.random() * 2 - 1) * HALF };
    assert.equal(blocked(p), slow(p), `at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  }
});

test("the server's districts are the map's districts (it counts who's where)", async () => {
  const { readFile } = await import("node:fs/promises");
  const rust = await readFile(new URL("../crates/protocol/src/hub.rs", import.meta.url), "utf8");
  const listed = rust.slice(rust.indexOf("pub const DISTRICTS"), rust.indexOf("];", rust.indexOf("pub const DISTRICTS")));
  const server = [...listed.matchAll(/\("(\w+)", (-?[\d.]+), (-?[\d.]+), ([\d.]+)\)/g)].map((m) => [m[1], +m[2], +m[3], +m[4]]);
  assert.deepEqual(server, DISTRICTS.map((d) => [d.id, d.center.x, d.center.z, d.radius]));
  assert.match(rust, new RegExp(`pub const HALF: f32 = ${HALF}\\.0;`));
});

// ---------- Inside the buildings ----------

const { INTERIORS, DOOR_REACH } = await import("../src/features/playground/nexus/interiors.ts");

test("every building's way in is on open ground out in the city, and reachable from where you arrive", () => {
  for (const room of INTERIORS) {
    const { door, out } = room.outside;
    assert.ok(!blocked(door), `${room.id}: its door outside is in something`);
    assert.ok(!blocked(out), `${room.id}: where you come back out is in something`);
    assert.ok(Math.hypot(out.x - door.x, out.z - door.z) > DOOR_REACH + 1, `${room.id}: coming out would put you straight back through the door`);
    assert.equal(districtAt(door)?.id, room.district, `${room.id}: its door is in its district`);
    const path = findPath(SPAWN, door);
    assert.ok(path.length, `${room.id}: no way to its door`);
    const end = path[path.length - 1];
    assert.ok(Math.hypot(end.x - door.x, end.z - door.z) < DOOR_REACH, `${room.id}: the walk stops short of the door`);
  }
});

test("inside, you arrive on open ground and can walk to the way out and into every corner", () => {
  for (const room of INTERIORS) {
    const { map } = room;
    assert.ok(!map.blocked(room.spawn), `${room.id}: you arrive inside something`);
    assert.ok(!map.blocked(room.door), `${room.id}: the way out is blocked`);
    assert.ok(Math.hypot(room.spawn.x - room.door.x, room.spawn.z - room.door.z) > DOOR_REACH + 1, `${room.id}: you'd arrive standing on the way out`);
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1]].map(([sx, sz]) => map.nearestOpen({ x: sx * room.halfW * 0.8, z: sz * room.halfD * 0.8 }));
    for (const spot of [room.door, ...corners]) {
      const path = map.findPath(room.spawn, spot);
      assert.ok(path.length, `${room.id}: no way to ${spot.x.toFixed(1)},${spot.z.toFixed(1)}`);
      let at = room.spawn;
      for (const p of path) {
        assert.ok(map.clearLine(at, p), `${room.id}: a leg cuts through something`);
        at = p;
      }
    }
  }
});

test("the library's aisles between the stacks can be walked into", async () => {
  const { STACK_ROWS } = await import("../src/features/playground/nexus/interiors.ts");
  const { map, spawn } = INTERIORS.find((r) => r.id === "library");
  for (let i = 0; i + 1 < STACK_ROWS.length; i++) {
    for (const x of [-19, 19]) {
      const aisle = { x, z: (STACK_ROWS[i] + STACK_ROWS[i + 1]) / 2 };
      assert.ok(!map.blocked(aisle), `the aisle at ${x},${aisle.z} is too narrow`);
      assert.ok(map.findPath(spawn, aisle).length);
    }
  }
});

test("the server knows the same buildings, the same size", async () => {
  const { readFile } = await import("node:fs/promises");
  const rust = await readFile(new URL("../crates/protocol/src/hub.rs", import.meta.url), "utf8");
  const listed = rust.slice(rust.indexOf("pub const INTERIORS"), rust.indexOf("];", rust.indexOf("pub const INTERIORS")));
  const server = [...listed.matchAll(/\("(\w+)", "(\w+)", ([\d.]+), ([\d.]+)\)/g)].map((m) => [m[1], m[2], +m[3], +m[4]]);
  assert.deepEqual(server, INTERIORS.map((r) => [r.id, r.district, r.halfW, r.halfD]));
});

test("every spot can be stood in, and walked to", async () => {
  const { SPOTS, spotAt, interiorOf } = await import("../src/features/playground/nexus/interiors.ts");
  for (const spot of SPOTS) {
    const room = spot.place ? interiorOf(spot.place) : null;
    const map = room ? room.map : { blocked, findPath, nearestOpen };
    const from = room ? room.spawn : SPAWN;
    const target = map.nearestOpen({ x: spot.x, z: spot.z });
    const path = map.findPath(from, target);
    assert.ok(path.length, `${spot.id}: no way there`);
    const end = path[path.length - 1];
    assert.equal(spotAt(spot.place, end)?.id, spot.id, `${spot.id}: walking there doesn't put you in it`);
  }
});

// ---------- Levels: terraces and stairs ----------

const { STAIRS, TERRACES, cityHeight, LIBRARY_TERRACE, DAIS } = await import("../src/features/playground/nexus/world.ts");
const { steepest } = await import("../src/features/playground/nexus/levels.ts");

/** Walks a path in small steps, checking the ground never jumps (no stepping off a ledge or up a wall). */
function smooth(from, path, height, label) {
  const most = steepest(STAIRS) * 0.2 + 0.02;
  let at = from;
  for (const p of path) {
    const steps = Math.ceil(Math.hypot(p.x - at.x, p.z - at.z) / 0.2);
    for (let i = 1; i <= steps; i++) {
      const a = { x: at.x + ((p.x - at.x) * (i - 1)) / steps, z: at.z + ((p.z - at.z) * (i - 1)) / steps };
      const b = { x: at.x + ((p.x - at.x) * i) / steps, z: at.z + ((p.z - at.z) * i) / steps };
      const jump = Math.abs(height(b) - height(a));
      assert.ok(jump <= most, `${label}: the ground jumps ${jump.toFixed(2)} m at ${b.x.toFixed(1)},${b.z.toFixed(1)}`);
    }
    at = p;
  }
}

test("you arrive on the Nexus, and the library and the citadel stand raised above their islands", () => {
  assert.equal(cityHeight(SPAWN), islandOf("nexus").h);
  assert.equal(cityHeight(INTERIORS.find((r) => r.id === "library").outside.door), LIBRARY_TERRACE.h, "the library's door is up its terrace");
  assert.equal(cityHeight(nearestOpen({ x: 0, z: 0 })), DAIS.h, "the spire's foot is on the dais");
  for (const s of STAIRS) assert.equal(cityHeight({ x: s.top.x + s.dir.x * (s.length + 0.5), z: s.top.z + s.dir.z * (s.length + 0.5) }), s.low, `${s.id}: the stairs reach the ground`);
});

test("the only ways up are the stairs: every walk goes smoothly up and down, never off a ledge", () => {
  const places = [
    ...DISTRICTS.map((d) => [d.id, nearestOpen(d.center)]),
    ...INTERIORS.map((r) => [r.id, r.outside.door]),
    ["dais", nearestOpen({ x: 12, z: 12 })],
    ["library terrace corner", nearestOpen({ x: -172, z: -73 })],
  ];
  for (const [label, to] of places) {
    const path = findPath(SPAWN, to);
    assert.ok(path.length, `${label}: no way there`);
    smooth(SPAWN, path, cityHeight, label);
  }
  // And straight across from one raised place to the other.
  const path = findPath(nearestOpen({ x: 0, z: 0 }), INTERIORS.find((r) => r.id === "library").outside.door);
  smooth(nearestOpen({ x: 0, z: 0 }), path, cityHeight, "dais to library");
});

test("a terrace's edge can't be walked off, except down its stairs", () => {
  // Just inside the library terrace's front edge, away from the stairs: walking straight off is blocked.
  assert.ok(!clearLine({ x: -170, z: -73 }, { x: -170, z: -66 }), "stepped off the library terrace's edge");
  assert.ok(!clearLine({ x: 14, z: 0 }, { x: 24, z: 0 }), "stepped off the dais");
  // Down the library's stairs is fine.
  assert.ok(clearLine({ x: -150, z: -72 }, { x: -150, z: -58 }), "the library's stairs are blocked");
});

// ---------- Islands and the routes between them ----------

const { planTrip } = await import("../src/features/playground/nexus/world.ts");

test("every district is an island at its own height, over a river nobody can walk on", () => {
  const heights = new Set(ISLANDS.map((i) => i.h));
  assert.equal(heights.size, ISLANDS.length, "two islands share a height");
  for (const i of ISLANDS) assert.equal(groundAt({ x: i.x + i.r * 0.5, z: i.z }), i.h, `${i.id}: wrong height`);
  // Between the Nexus and the Simulation Chambers (where only the lift goes) is river.
  const gap = { x: 60, z: 55 };
  assert.ok(blocked(gap), "the river can be walked on");
  assert.ok(!walkable(gap, 0));
  const landed = nearestOpen(gap);
  assert.ok(walkable(landed, 0.8), "a click on the river doesn't land somewhere you can stand");
});

test("every route joins its two islands: walk it end to end, smoothly, without leaving it", () => {
  for (const r of SPANS) {
    const from = r.points[0], to = r.points[r.points.length - 1];
    assert.equal(cityHeight(from), islandOf(r.from).h, `${r.id}: doesn't start level with its island`);
    assert.equal(cityHeight(to), islandOf(r.to).h, `${r.id}: doesn't end level with its island`);
    const path = findPath(from, to);
    assert.ok(path.length, `${r.id}: can't be crossed`);
    smooth(from, path, cityHeight, r.id);
    // Halfway across, you're on it.
    const mid = r.points[Math.floor(r.points.length / 2)];
    assert.equal(spanAt(mid)?.id, r.id, `${r.id}: its middle isn't on it`);
  }
});

test("the routes never cross each other (each is its own way between two places)", () => {
  for (const a of SPANS) for (const b of SPANS) {
    if (a.id >= b.id) continue;
    for (let i = 1; i + 2 < a.points.length; i++) {
      for (let t = 0; t <= 1; t += 0.05) {
        const p = { x: a.points[i].x + (a.points[i + 1].x - a.points[i].x) * t, z: a.points[i].z + (a.points[i + 1].z - a.points[i].z) * t };
        assert.notEqual(spanAt(p)?.id, b.id, `${a.id} crosses ${b.id}`);
      }
    }
  }
});

test("the lift is taken when it's quicker: from the Nexus to the Simulation Chambers", () => {
  const lift = LIFTS[0];
  assert.ok(!blocked(lift.a) && !blocked(lift.b), "a lift pad's in something");
  const trip = planTrip(SPAWN, nearestOpen({ x: 132, z: 120 }));
  assert.equal(trip.lift?.id, lift.id, "walked the long way round instead of riding the lift");
  assert.equal(trip.lift?.forward, true);
  // But not for somewhere close by.
  assert.equal(planTrip(SPAWN, { x: 10, z: 40 }).lift, undefined);
  // And the Chambers can still be walked to, the long way, over the bridges.
  assert.ok(findPath(SPAWN, nearestOpen({ x: 132, z: 120 })).length, "the Chambers can only be reached by the lift");
});
