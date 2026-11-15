// The Playground's numbers: weeks, months, all time and streaks worked out
// from a metric's days. Run with `node --test tests/playground-stats.mjs`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, allStats, mondayOf, statsFor } from "../src/features/playground/stats.ts";
import { ruleOf } from "../src/features/playground/rules.ts";

const pages = ruleOf("reading.pages");
const today = "2026-11-13"; // a Friday

test("weeks start on Monday and months on the first", () => {
  assert.equal(mondayOf(today), "2026-11-09");
  assert.equal(mondayOf("2026-11-09"), "2026-11-09");
  assert.equal(mondayOf("2026-11-15"), "2026-11-09", "Sunday ends the week");
  const s = statsFor(pages, { "2026-11-08": 10, "2026-11-09": 20, "2026-11-13": 5, "2026-10-31": 7, "2026-11-01": 3 }, today);
  assert.equal(s.weekKey, "2026-11-09");
  assert.equal(s.week, 25);
  assert.equal(s.lastWeek, 10, "Mon 2 to Sun 8 November (the 1st was a Sunday)");
  assert.equal(s.monthKey, "2026-11-01");
  assert.equal(s.month, 38);
  assert.equal(s.lastMonth, 7);
  assert.equal(s.total, 45);
});

test("a streak runs to today, or to yesterday while today's still to come", () => {
  const days = { "2026-11-10": 1, "2026-11-11": 1, "2026-11-12": 1 };
  assert.deepEqual([statsFor(pages, days, today).streak, statsFor(pages, days, today).streakThrough], [3, "2026-11-12"]);
  assert.equal(statsFor(pages, { ...days, [today]: 4 }, today).streak, 4);
  const broken = statsFor(pages, { "2026-11-05": 1, "2026-11-06": 1, "2026-11-07": 1, "2026-11-11": 1 }, today);
  assert.equal(broken.streak, 0, "missed yesterday");
  assert.equal(broken.streakThrough, null);
  assert.equal(broken.bestStreak, 3);
});

test("future days, zeros and impossible days don't count", () => {
  const s = statsFor(pages, { [addDays(today, 1)]: 50, "2026-11-12": 0, [today]: 99999 }, today);
  assert.equal(s.week, 1500, "held to a day's cap");
  assert.equal(s.streak, 1, "yesterday's zero doesn't join it");
  const days = statsFor(ruleOf("journal.days"), { [today]: 3 }, today);
  assert.equal(days.week, 1, "at most a day a day");
});

test("streaks cross months and years", () => {
  const days = {};
  for (let d = "2025-12-20"; d <= "2026-01-05"; d = addDays(d, 1)) days[d] = 1;
  const s = statsFor(pages, days, "2026-01-05");
  assert.equal(s.streak, 17);
  assert.equal(s.lastMonth, 12);
});

test("only known metrics with days are sent", () => {
  const out = allStats({ "reading.pages": { [today]: 3 }, "journal.days": {} }, ["reading.pages", "journal.days", "finance.spent", "goals.checkins"], today);
  assert.deepEqual(out.map((s) => s.metric), ["reading.pages", "journal.days"]);
});
