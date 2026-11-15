// The Hub's rooms: every door has a way back, nobody arrives in a doorway
// (they'd bounce straight back) or inside furniture, and walking gets where
// it's going, sliding round what's in the way. `node --test tests/playground-hub.mjs`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ROOMS, ROOM_ORDER, clear, doorAt, spotAt, walk } from "../src/features/playground/hub/rooms.ts";

const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

test("every door leads somewhere with a door back", () => {
  for (const id of ROOM_ORDER) {
    for (const d of ROOMS[id].doors) {
      assert.ok(ROOMS[d.to].doors.some((back) => back.to === id), `${id} → ${d.to} has a way back`);
    }
  }
  // Every room is reachable from the plaza.
  const reachable = new Set(["plaza", ...ROOMS.plaza.doors.map((d) => d.to)]);
  assert.deepEqual([...reachable].sort(), [...ROOM_ORDER].sort());
});

test("arrivals and spawns are on clear floor, not in a doorway", () => {
  for (const id of ROOM_ORDER) {
    const room = ROOMS[id];
    assert.equal(doorAt(room, room.spawn), undefined, `${id} spawn isn't a doorway`);
    assert.ok(!room.blocks.some((b) => inside(room.spawn, b)), `${id} spawn is clear`);
    for (const d of room.doors) {
      const there = ROOMS[d.to];
      assert.equal(doorAt(there, d.arrive), undefined, `arriving in ${d.to} from ${id} isn't in a doorway`);
      assert.ok(!there.blocks.some((b) => inside(d.arrive, b)), `arriving in ${d.to} is clear`);
    }
  }
});

test("walking arrives, and slides round furniture", () => {
  const plaza = ROOMS.plaza;
  let at = { x: 0.1, y: 0.9 }, arrived = false;
  for (let i = 0; i < 400 && !arrived; i++) ({ at, arrived } = walk(plaza, at, { x: 0.9, y: 0.8 }, 16));
  assert.ok(arrived && Math.abs(at.x - 0.9) < 0.01, "got there");
  // Straight through the fountain: never inside it.
  at = { x: 0.5, y: 0.8 };
  for (let i = 0; i < 400; i++) {
    ({ at } = walk(plaza, at, { x: 0.5, y: 0.1 }, 16));
    assert.ok(!plaza.blocks.some((b) => inside(at, b)), `in the fountain at ${at.x},${at.y}`);
  }
  assert.deepEqual(clear(plaza, { x: 0.5, y: 0.38 }), plaza.spawn, "a spot in the fountain moves to clear floor");
});

test("walking straight at the fountain goes round it, from every side", () => {
  const plaza = ROOMS.plaza;
  // Back from the Library, off to the Focus Lab: the fountain's dead ahead.
  for (const [from, to] of [[{ x: 0.12, y: 0.45 }, { x: 0.97, y: 0.45 }], [{ x: 0.88, y: 0.4 }, { x: 0.03, y: 0.4 }], [{ x: 0.5, y: 0.14 }, { x: 0.5, y: 0.96 }], [{ x: 0.5, y: 0.86 }, { x: 0.5, y: 0.04 }]]) {
    let at = from, arrived = false;
    for (let i = 0; i < 1500 && !arrived; i++) {
      ({ at, arrived } = walk(plaza, at, to, 16));
      assert.ok(!plaza.blocks.some((b) => inside(at, b)), "never inside the fountain");
    }
    assert.ok(Math.abs(at.x - to.x) < 0.02 && Math.abs(at.y - to.y) < 0.02, `from ${JSON.stringify(from)} reached ${JSON.stringify(to)}, stopped at ${at.x.toFixed(2)},${at.y.toFixed(2)}`);
  }
});

test("walking weaves between the Focus Lab's desks", () => {
  const lab = ROOMS.lab;
  let at = { x: 0.1, y: 0.62 }, arrived = false;
  const to = { x: 0.95, y: 0.5 };
  for (let i = 0; i < 2000 && !arrived; i++) {
    ({ at, arrived } = walk(lab, at, to, 16));
    assert.ok(!lab.blocks.some((b) => inside(at, b)), "never through a desk");
  }
  assert.ok(Math.abs(at.x - to.x) < 0.02 && Math.abs(at.y - to.y) < 0.02, `stopped at ${at.x.toFixed(2)},${at.y.toFixed(2)}`);
});

test("the dance floor is a spot, the plaza's doors are doors", () => {
  assert.equal(spotAt(ROOMS.arcade, { x: 0.5, y: 0.6 })?.id, "dance");
  assert.equal(doorAt(ROOMS.plaza, { x: 0.02, y: 0.45 })?.to, "library");
});
