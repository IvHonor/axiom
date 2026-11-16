// Achievements: levels, streaks and the whole catalogue. Run with
// `node --test tests/achievements.mjs`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bestStreak, progressOf, tierOf, total, TIERS } from "../src/features/lemma/achievements/progress.ts";
import { ACHIEVEMENTS, AREAS } from "../src/features/lemma/achievements/catalog.ts";

test("progress climbs through the levels and stops at the last", () => {
  const levels = [3, 7, 30];
  assert.deepEqual(progressOf(0, levels), { reached: 0, target: 3, fraction: 0 });
  assert.deepEqual(progressOf(5, levels), { reached: 1, target: 7, fraction: 0.5 }, "halfway from 3 to 7");
  assert.deepEqual(progressOf(7, levels), { reached: 2, target: 30, fraction: 0 });
  assert.deepEqual(progressOf(400, levels), { reached: 3, target: null, fraction: 1 });
});

test("tiers go bronze, silver, gold; a one-off is gold", () => {
  assert.equal(tierOf(0, 3), null);
  assert.equal(tierOf(1, 3), "bronze");
  assert.equal(tierOf(3, 3), "gold");
  assert.equal(tierOf(5, 5), "diamond");
  assert.equal(tierOf(1, 1), "gold");
});

test("the best streak counts consecutive days, across months, and stays once broken", () => {
  assert.equal(bestStreak({}), 0);
  assert.equal(bestStreak({ "2026-10-30": 1, "2026-10-31": 2, "2026-11-01": 1, "2026-11-05": 1 }), 3);
  assert.equal(bestStreak({ "2026-11-01": 1, "2026-11-02": 0, "2026-11-03": 1 }), 1, "a day with nothing breaks it");
  assert.equal(bestStreak({ "2024-02-28": 1, "2024-02-29": 1, "2024-03-01": 1 }), 3, "leap day");
  assert.equal(total({ a: 4, b: 6, c: -2 }), 10);
});

test("every achievement is well formed", () => {
  const ids = new Set();
  for (const a of ACHIEVEMENTS) {
    assert.ok(!ids.has(a.id), `${a.id} is unique`);
    ids.add(a.id);
    assert.ok(AREAS.includes(a.area), `${a.id} is in a known area`);
    assert.ok(a.id.startsWith(`${a.area}.`), `${a.id} starts with its area`);
    assert.ok(a.levels.length >= 1 && a.levels.length <= TIERS.length, `${a.id} has 1 to 5 levels`);
    assert.ok(a.levels.every((l, i) => l > 0 && (i === 0 || l > a.levels[i - 1])), `${a.id}'s levels climb`);
    for (const l of a.levels) assert.match(a.goal(l), /\S/, `${a.id} says what level ${l} takes`);
  }
  for (const area of AREAS) assert.ok(ACHIEVEMENTS.some((a) => a.area === area), `${area} has achievements`);
});

test("counted achievements read the Playground's days", () => {
  const known = { days: { "journal.days": { "2026-11-10": 1, "2026-11-11": 1, "2026-11-12": 1 }, "reading.pages": { "2026-11-12": 400, "2026-11-13": 700 } }, lookChanged: true, friends: undefined, secrets: ["nexus"] };
  const count = (id) => ACHIEVEMENTS.find((a) => a.id === id).count(known);
  assert.equal(count("journal.ink_streak"), 3);
  assert.equal(count("reading.page_turner"), 1100);
  assert.equal(count("reading.bookworm"), 2);
  assert.equal(count("axiom.showing_up"), undefined, "not known here");
  assert.equal(count("axiom.off_the_map"), 1);
  assert.equal(count("lemma.makeover"), 1);
  assert.equal(count("playground.squad"), undefined, "not in the Playground");
  assert.equal(count("playground.blue_flame"), 3, "the longest streak of any area");
});
