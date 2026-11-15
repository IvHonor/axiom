// The friends garden's life: Lemmas wander and stay on the lawn, visit and
// chat in pairs, race for seeds, react when poked (dizzy if overdone), and
// arrive or wait at the gate. Run with `node --test tests/playground-garden.mjs`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Garden, random } from "../src/features/playground/garden/engine.ts";

const friends = [
  { id: "me", personality: "witty", you: true },
  { id: "ada", personality: "cheerful" },
  { id: "sam", personality: "coach" },
  { id: "kai", personality: "calm" },
];

const run = (g, ms) => { for (let t = 0; t < ms; t += 33) g.step(33); };

test("Lemmas wander for minutes and never leave the lawn", () => {
  const g = new Garden(random(7));
  g.sync(friends);
  const seen = new Set();
  for (let t = 0; t < 180_000; t += 33) {
    g.step(33);
    for (const s of g.spirits.values()) {
      assert.ok(s.x >= 0.07 && s.x <= 0.86 && s.y >= 0.08 && s.y <= 0.95, `${s.id} at ${s.x},${s.y}`);
      seen.add(s.activity);
    }
  }
  for (const activity of ["walk", "visit", "chat", "idle"]) assert.ok(seen.has(activity), `someone did ${activity}: ${[...seen]}`);
});

test("a chat is two Lemmas facing each other, and both speak", () => {
  const g = new Garden(random(3));
  g.sync(friends);
  let chatted = null, spoke = new Set();
  for (let t = 0; t < 240_000 && spoke.size < 2; t += 33) {
    g.step(33);
    const chatting = [...g.spirits.values()].filter((s) => s.activity === "chat");
    if (chatting.length >= 2) {
      const [a] = chatting;
      const b = g.spirits.get(a.partner);
      assert.equal(b.partner, a.id, "partners both ways");
      assert.equal(b.activity, "chat");
      chatted ??= [a.id, b.id].sort().join();
      for (const s of [a, b]) if (s.say?.text && [a.id, b.id].sort().join() === chatted) spoke.add(s.id);
    }
  }
  assert.equal(spoke.size, 2, "an opener and a reply");
});

test("a seed near Lemmas is raced for and eaten once", () => {
  const g = new Garden(random(11));
  g.sync(friends);
  run(g, 1000);
  const ada = g.spirits.get("ada");
  g.drop(ada.x, ada.y);
  const racing = [...g.spirits.values()].filter((s) => s.activity === "fetch");
  assert.ok(racing.length >= 1 && racing.length <= 2, `the nearest go for it: ${racing.length}`);
  run(g, 12_000);
  assert.equal(g.seeds.length, 0, "eaten");
  assert.equal(g.plants.length, 0, "not grown");
});

test("a seed nobody reaches grows into a plant", () => {
  const g = new Garden(random(4));
  // Everyone in one corner, the seed in the other.
  g.sync([{ id: "a", personality: "calm" }, { id: "b", personality: "calm" }]);
  for (const s of g.spirits.values()) { s.x = s.tx = 0.08; s.y = s.ty = 0.1; s.activity = "sit"; s.left = 60_000; }
  g.drop(0.85, 0.94);
  assert.equal([...g.spirits.values()].filter((s) => s.activity === "fetch").length, 0, "too far to bother");
  run(g, 6000);
  assert.equal(g.seeds.length, 0);
  assert.equal(g.plants.length, 1, "grown");
  assert.equal(g.plantsVersion, 1);
});

test("poking makes a Lemma react, and too much pokes make it dizzy", () => {
  const g = new Garden(random(5));
  g.sync(friends);
  g.poke("ada", "Danial");
  const ada = g.spirits.get("ada");
  assert.equal(ada.activity, "react");
  assert.ok(ada.say.text.length > 0);
  for (let i = 0; i < 3; i++) { g.step(200); g.poke("ada"); }
  assert.equal(ada.activity, "dizzy");
});

test("requests wait at the gate until accepted; new friends arrive", () => {
  const g = new Garden(random(2));
  g.sync([...friends, { id: "mo", personality: "standard", gate: true }]);
  run(g, 30_000);
  assert.equal(g.spirits.get("mo").activity, "gate", "still waiting");
  g.sync([...friends, { id: "mo", personality: "standard", arriving: false }]);
  assert.equal(g.spirits.get("mo").activity, "walk", "in through the gate");
  g.sync([...friends, { id: "lu", personality: "cheerful", arriving: true }]);
  assert.equal(g.spirits.get("lu").activity, "arrive");
  assert.equal(g.spirits.has("mo"), false, "unfriended: gone");
});

test("at night Lemmas rest on the charging pads, one to a pad", () => {
  const g = new Garden(random(13));
  g.sync(friends);
  g.night = true;
  let onPads = 0;
  for (let t = 0; t < 120_000; t += 33) {
    g.step(33);
    const resting = [...g.spirits.values()].filter((s) => s.activity === "sleep" && s.pad !== null);
    const pads = resting.map((s) => s.pad);
    assert.equal(new Set(pads).size, pads.length, "never two on one pad");
    onPads = Math.max(onPads, resting.length);
  }
  assert.ok(onPads >= 2, `resting on pads at once: ${onPads}`);
});

test("at night most Lemmas end up asleep", () => {
  const g = new Garden(random(9));
  g.sync(friends);
  g.night = true;
  let asleep = 0;
  for (let t = 0; t < 120_000; t += 33) {
    g.step(33);
    if (t % 1000 < 33) asleep += [...g.spirits.values()].filter((s) => s.activity === "sleep").length;
  }
  assert.ok(asleep > 60, `asleep-seconds: ${asleep}`);
});
