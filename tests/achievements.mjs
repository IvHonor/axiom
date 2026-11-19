// Achievements: levels, streaks and the whole catalogue. Run with
// `node --test tests/achievements.mjs`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bestStreak, bestWithin, largest, monthsWith, progressOf, tierOf, total, TIERS, weeksWith } from "../src/features/lemma/achievements/progress.ts";
import { isQuietBook, readingDays } from "../src/web/commands/readingDays.ts";
import { ACHIEVEMENTS, AREA_MARK, AREAS, countsToShare, earnedRewards, INTERVIEW_SECRET, mergeSharedCounts, readSharedCounts, REWARD_KINDS, rewardsOf, rewardSource, rewardTarget, SHARED_COUNTS, THEME_MARK } from "../src/features/lemma/achievements/catalog.ts";

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
  const known = { days: { "journal.days": { "2026-11-10": 1, "2026-11-11": 1, "2026-11-12": 1 }, "journal.written": { "2026-11-10": 1, "2026-11-11": 1, "2026-11-12": 1 }, "reading.pages": { "2026-11-12": 400, "2026-11-13": 700 }, "reading.read_pages": { "2026-11-12": 400, "2026-11-13": 700 }, "reading.active_days": { "2026-11-12": 1, "2026-11-13": 1 } }, lookChanged: true, friends: undefined, secrets: ["nexus"] };
  const count = (id) => ACHIEVEMENTS.find((a) => a.id === id).count(known);
  assert.equal(count("journal.ink_streak"), 3);
  assert.equal(count("reading.page_turner"), 1100);
  assert.equal(count("reading.bookworm"), 1, "2026-11-12 and 13 are two days in one week");
  assert.equal(count("axiom.showing_up"), undefined, "not known here");
  assert.equal(count("axiom.off_the_map"), 1);
  assert.equal(count("lemma.makeover"), 1);
  assert.equal(count("playground.squad"), undefined, "not in the Playground");
  assert.equal(count("playground.blue_flame"), 3, "the longest streak of any area");
});

const key = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const run = (length, each = 1, end = 0) => Object.fromEntries(Array.from({ length }, (_, i) => [key(end - i), each]));
const known = (days) => ({ days, lookChanged: false, secrets: [] });

test("each Daily Plan achievement unlocks its clockwork reward at its top level", () => {
  const plan = ACHIEVEMENTS.filter((a) => a.area === "daily_plan");
  assert.deepEqual(plan.map((a) => a.name), ["Creature of Habit", "Task Crusher", "Flawless", "Perfect Week", "Deep Focus", "Clocking Off", "Planner"], "easiest first");
  assert.ok(plan.every((a) => a.levels.length === 3));
  assert.deepEqual(Object.fromEntries(plan.map((a) => [a.reward.id, rewardTarget(a)])), { verdigris: 3, "cog-bolo": 100, loupe: 7, automaton: 5, "gearwright-hat": 1200, skeleton: 20, "long-hour": 21 });
  assert.equal(rewardSource("tie").reward.target, 3, "the tie is still earned at its first level");
  assert.deepEqual(earnedRewards(known({})), [], "nothing counted, nothing earned");
  const justShort = { "daily_plan.done": run(99), "daily_plan.perfect": run(4), "daily_plan.focus": run(1, 1199), "daily_plan.planned": run(20), "daily_plan.shutdown": run(19), "daily_plan.routines": { ...run(2, 1, -7), ...run(5) } };
  assert.deepEqual(earnedRewards(known(justShort)), [], "routines made this week don't count yet");
  const reached = { "daily_plan.done": run(100), "daily_plan.perfect": run(7), "daily_plan.focus": run(1, 1200), "daily_plan.planned": run(21), "daily_plan.shutdown": run(20), "daily_plan.routines": run(3, 1, -7) };
  assert.deepEqual(earnedRewards(known(reached)).sort(), ["automaton", "cog-bolo", "gearwright-hat", "long-hour", "loupe", "skeleton", "verdigris"]);
  // A missed day restarts Planner, but twenty shutdowns with gaps still count.
  const withGaps = { ...run(10), ...run(10, 1, -11) };
  assert.deepEqual(earnedRewards(known({ "daily_plan.planned": withGaps, "daily_plan.shutdown": withGaps })), ["skeleton"]);
});

test("the Journal's achievements are three steps each, counted from what was really written", () => {
  const journal = ACHIEVEMENTS.filter((a) => a.area === "journal");
  assert.deepEqual(journal.map((a) => [a.name, a.levels]), [
    ["Long Form", [1, 3, 5]], ["Prompted", [3, 10, 20]], ["Full Page", [5, 15, 30]],
    ["Feelings Logged", [7, 21, 45]], ["Wordsmith", [1000, 5000, 15000]], ["Ink Streak", [3, 14, 45]],
  ], "easiest first, and nothing that takes a year");
  const count = (id, days) => ACHIEVEMENTS.find((a) => a.id === `journal.${id}`).count(known(days));
  for (const a of journal) assert.equal(a.count(known({})), undefined, `${a.name} isn't known on the website`);
  assert.equal(count("ink_streak", { "journal.written": run(5), "journal.days": run(30) }), 5, "a mood alone doesn't extend the streak");
  assert.equal(count("ink_streak", { "journal.written": { ...run(4), ...run(9, 1, -5) } }), 9, "a missed day restarts it");
  assert.equal(count("wordsmith", { "journal.words": run(4, 250) }), 1000);
  assert.equal(count("feelings_logged", { "journal.moods": run(6) }), 6);
  assert.equal(count("long_form", { "journal.long_entries": run(2, 2) }), 4);
  assert.equal(count("prompted", { "journal.prompted": run(3) }), 3);
  assert.equal(count("full_page", { "journal.full_pages": run(5, 1, 3) }), 2, "days ahead don't count");
  assert.equal(journal.find((a) => a.name === "Long Form").goal(1), "Write an entry of 1,000+ words");
});

test("each Journal achievement unlocks its Inkwell reward at its top step", () => {
  const journal = ACHIEVEMENTS.filter((a) => a.area === "journal");
  assert.deepEqual(Object.fromEntries(journal.map((a) => [a.reward.id, [rewardTarget(a), REWARD_KINDS[a.reward.id]]])), {
    "ribbon-bookmark": [5, "neckwear"], muse: [20, "personality"], "scribe-cap": [30, "headwear"],
    "mood-ink": [45, "glow"], "living-ink": [15000, "material"], "last-word": [45, "holding"],
  });
  const justShort = { "journal.long_entries": run(4), "journal.prompted": run(19), "journal.full_pages": run(29), "journal.moods": run(44), "journal.words": run(1, 14999), "journal.written": run(44) };
  assert.deepEqual(earnedRewards(known(justShort)), []);
  const reached = { "journal.long_entries": run(5), "journal.prompted": run(20), "journal.full_pages": run(30), "journal.moods": run(45), "journal.words": run(1, 15000), "journal.written": run(45) };
  assert.deepEqual(earnedRewards(known(reached)).sort(), ["last-word", "living-ink", "mood-ink", "muse", "ribbon-bookmark", "scribe-cap"]);
});

test("Axiom's achievements are for beginners, with an everyday item at every step", () => {
  const steps = (id) => rewardsOf(ACHIEVEMENTS.find((a) => a.id === `axiom.${id}`)).map((r) => [r.target, r.id, REWARD_KINDS[r.id]]);
  assert.deepEqual(steps("showing_up"), [[3, "tie", "neckwear"], [7, "round-glasses", "facewear"], [14, "bucket-hat", "headwear"], [21, "scarf", "neckwear"], [31, "aviators", "facewear"]]);
  assert.deepEqual(steps("regular"), [[5, "bandana", "neckwear"], [10, "fedora", "headwear"], [20, "beret", "headwear"], [40, "chain-necklace", "neckwear"], [60, "flat-cap", "headwear"]]);
  assert.deepEqual(steps("explorer"), [[2, "headband", "headwear"], [4, "cat-eye", "facewear"], [6, "lanyard", "neckwear"]]);
  assert.deepEqual(steps("change_of_scene"), [[1, "bead-necklace", "neckwear"], [3, "tinted-glasses", "facewear"], [5, "sun-hat", "headwear"]]);
  assert.deepEqual(earnedRewards(known({ active: run(2) })), []);
  assert.deepEqual(earnedRewards(known({ active: run(7) })).sort(), ["bandana", "round-glasses", "tie"], "each step reached gives its own item");
  assert.deepEqual(earnedRewards(known({ active: { ...run(10), ...run(10, 1, -11) } })).sort(), ["bandana", "beret", "fedora", "round-glasses", "tie"], "a broken streak still counts as total days");
  const ids = ACHIEVEMENTS.flatMap((a) => rewardsOf(a).map((r) => r.id));
  assert.equal(new Set(ids).size, ids.length, "no item is given twice");
});

test("steps counted on another device earn their items here too", () => {
  assert.deepEqual(earnedRewards(known({}), { "axiom.showing_up": 12, "axiom.regular": 5 }).sort(), ["bandana", "round-glasses", "tie"]);
});

test("Explorer counts areas opened or used, and Change of Scene counts themes tried", () => {
  const count = (id, k) => ACHIEVEMENTS.find((a) => a.id === `axiom.${id}`).count(k);
  const secrets = [`${AREA_MARK}notes`, `${AREA_MARK}reading`, `${AREA_MARK}not_an_area`, `${THEME_MARK}ocean`, `${THEME_MARK}forest`, "nexus"];
  const k = { days: { active: run(9), "reading.pages": run(2), "learning.minutes": run(1), "goals.checkins": { [key(3)]: 1 }, "uni.caught_up": {} }, lookChanged: false, secrets };
  assert.equal(count("explorer", k), 3, "notes, reading and learning: days ahead and empty areas don't count, and reading only counts once");
  assert.equal(count("change_of_scene", k), 2);
  assert.deepEqual(earnedRewards(k).filter((id) => ["headband", "cat-eye", "bead-necklace", "tinted-glasses"].includes(id)).sort(), ["bead-necklace", "headband"]);
  assert.equal(count("change_of_scene", known({})), 0);
});

test("Reading's achievements take about three months, with no streaks", () => {
  const reading = ACHIEVEMENTS.filter((a) => a.area === "reading");
  assert.deepEqual(reading.map((a) => [a.name, a.levels]), [
    ["Second Time Round", [1]], ["Doorstopper", [200, 350, 500]], ["Every Format", [1, 2, 3]], ["Critic", [1, 2, 4]], ["Annotator", [3, 10, 30]],
    ["Finish Line", [1, 3, 6]], ["Page Turner", [300, 800, 2000]], ["Book a Month", [1, 2, 3]], ["Bookworm", [2, 6, 12]], ["The Non-Drifter", [1]],
  ]);
  assert.ok(reading.every((a) => a.count), "all of them are counted");
  assert.ok(!reading.some((a) => /in a row/.test(a.goal(a.levels[0]))), "none of them is a streak");
});

test("each Reading achievement unlocks its Great Library reward at its top step", () => {
  const reading = ACHIEVEMENTS.filter((a) => a.area === "reading");
  assert.deepEqual(Object.fromEntries(reading.map((a) => [a.reward.id, [rewardTarget(a), REWARD_KINDS[a.reward.id]]])), {
    "griffin-goggles": [1, "facewear"], "three-realms": [500, "facewear"], jekyll: [3, "personality"], deerstalker: [4, "headwear"], "counts-collar": [30, "neckwear"],
    "dragon-helm": [6, "headwear"], "pack-of-cards": [2000, "glow"], voyage: [3, "material"], "gyges-ring": [12, "holding"], "true-compass": [1, "holding"],
  });
  assert.ok(reading.filter((a) => a.reward.id !== "true-compass").every((a) => a.reward.from), "each names the book it comes from");
});

test("The Non-Drifter stays secret until the shadow is answered", () => {
  const a = ACHIEVEMENTS.find((x) => x.id === "reading.non_drifter");
  assert.equal(a.secret, true);
  const finished = { "reading.quiet_started": run(1), "reading.quiet_finished": run(1) };
  assert.equal(a.count(known(finished)), 0, "finishing the book isn't enough");
  assert.deepEqual(earnedRewards(known(finished)).filter((id) => id === "true-compass"), []);
  assert.ok(earnedRewards({ ...known({}), secrets: [INTERVIEW_SECRET] }).includes("true-compass"));
});

test("one book is recognised, however it is written, without naming it in the code", () => {
  const quiet = [..."liveD ehT gnittiwtuO"].reverse().join("");
  for (const title of [quiet, quiet.toUpperCase(), `${quiet}: A Subtitle`, quiet.replaceAll(" ", "  ")]) assert.ok(isQuietBook(title), title);
  for (const title of ["Some Other Book", quiet.slice(0, 12), "", null, undefined]) assert.ok(!isQuietBook(title), String(title));
  const row = (id, data) => ({ id, data });
  const days = readingDays({
    books: [
      row("q", { title: quiet, status: "finished", started_on: "2026-11-01", finished_on: "2026-11-08", format: "print", pages: 200, rating: null, review: "" }),
      row("w", { title: quiet, status: "want", started_on: null, finished_on: null, format: "print", pages: 200, rating: null, review: "" }),
      row("o", { title: "Some Other Book", status: "finished", started_on: "2026-11-02", finished_on: "2026-11-09", format: "print", pages: 200, rating: null, review: "" }),
    ], sessions: [], notes: [], reads: [],
  });
  assert.deepEqual(days["reading.quiet_started"], { "2026-11-01": 1 }, "a copy only on the wish list doesn't count");
  assert.deepEqual(days["reading.quiet_finished"], { "2026-11-08": 1 });
});

test("Bookworm counts weeks with two reading days, and gaps lose nothing", () => {
  // Monday 2 and Wednesday 4 November; one lone Monday; then a Sunday and the following Monday.
  assert.equal(weeksWith({ "2026-11-02": 1, "2026-11-04": 1, "2026-11-09": 1 }, 2), 1);
  assert.equal(weeksWith({ "2026-11-08": 1, "2026-11-09": 1 }, 2), 0, "Sunday and Monday are in different weeks");
  assert.equal(weeksWith({ "2026-11-02": 1, "2026-11-08": 1, "2026-12-07": 1, "2026-12-09": 1 }, 2), 2, "weeks needn't be next to each other");
  assert.equal(weeksWith({ "2026-11-02": 1, "2026-11-03": 0 }, 2), 0, "empty days don't count");
  assert.equal(monthsWith({ "2026-10-30": 1, "2026-10-31": 2, "2026-11-01": 1, "2025-11-01": 1 }), 3);
  assert.equal(largest({ a: 200, b: 520, c: 40 }), 520);
  assert.equal(largest({}), 0);
});

test("the website counts reading like the desktop, including first finishes and audiobooks", () => {
  const row = (id, data) => ({ id, data });
  const days = readingDays({
    books: [
      row("print", { status: "finished", finished_on: "2026-11-06", format: "print", pages: null, api_pages: 520, rating: 8, review: "Loved it." }),
      row("heard", { status: "finished", finished_on: "2026-11-09", format: "audio", pages: null, api_pages: null, rating: 7, review: "  " }),
      row("open", { status: "reading", finished_on: null, format: "ebook", pages: 300, rating: null, review: "" }),
    ],
    sessions: [
      row("s1", { day: "2026-11-02", unit: "pages", pages: 40, minutes: 30 }),
      row("s2", { day: "2026-11-08", unit: "minutes", pages: 0, minutes: 90 }),
      row("s3", { day: "2026-11-03", unit: "pages", pages: 0, minutes: 0 }),
    ],
    notes: [row("n1", { kind: "quote", created_at: "2026-11-02T12:00:00Z" }), row("n2", { kind: "bookmark", created_at: "2026-11-02T12:00:00Z" })],
    reads: [row("r1", { book_id: "print", outcome: "finished", finished_on: "2026-11-03" }), row("r2", { book_id: "open", outcome: "dnf", finished_on: "2026-11-01" })],
  });
  assert.deepEqual(days["reading.books"], { "2026-11-03": 1, "2026-11-06": 1, "2026-11-09": 1 }, "first finishes count, and a put-down book doesn't");
  assert.deepEqual(days["reading.pages"], { "2026-11-02": 40 }, "the Playground's pages stay real pages");
  assert.deepEqual(days["reading.read_pages"], { "2026-11-02": 40, "2026-11-08": 60 }, "90 minutes is about 60 pages");
  assert.deepEqual(days["reading.active_days"], { "2026-11-02": 1, "2026-11-08": 1 });
  assert.deepEqual(days["reading.rereads"], { "2026-11-06": 1 });
  assert.equal(total(days["reading.finished_print"]), 2);
  assert.equal(total(days["reading.finished_audio"]), 1);
  assert.deepEqual(days["reading.finished_ebook"], {});
  assert.equal(largest(days["reading.longest"]), 520);
  assert.equal(total(days["reading.reviews"]), 1, "a rating without words isn't a review");
  assert.equal(total(days["reading.notes"]), 1, "bookmarks aren't notes");
  const count = (id) => ACHIEVEMENTS.find((a) => a.id === `reading.${id}`).count(known(days));
  assert.deepEqual([count("finish_line"), count("every_format"), count("doorstopper"), count("second_time_round"), count("page_turner"), count("critic"), count("annotator"), count("book_a_month")], [3, 2, 520, 1, 100, 1, 1, 1]);
});

test("every reward has a kind, for the icon on its step", () => {
  for (const a of ACHIEVEMENTS) {
    for (const reward of rewardsOf(a)) assert.ok(REWARD_KINDS[reward.id], reward.id);
    if (a.stepRewards) assert.equal(a.stepRewards.length, a.levels.length, `${a.id} has an item for every step`);
  }
});

test("counts only the desktop can make are shared, and only ever go up", () => {
  assert.deepEqual(SHARED_COUNTS, ["axiom.showing_up", "axiom.regular"], "nothing from encrypted areas");
  assert.deepEqual(countsToShare(known({ active: run(12), "journal.days": run(30) })), { "axiom.showing_up": 12, "axiom.regular": 12 });
  assert.deepEqual(countsToShare(known({ "journal.days": run(30) })), {}, "the web can't count them, and sends nothing");
  assert.deepEqual(readSharedCounts({ "axiom.showing_up": 7.9, "axiom.regular": -1, "journal.ink_streak": 40 }), { "axiom.showing_up": 7 });
  assert.deepEqual(readSharedCounts("nonsense"), {});
  assert.deepEqual(mergeSharedCounts({ "axiom.showing_up": 9, "axiom.regular": 2 }, { "axiom.showing_up": 4, "axiom.regular": 20 }), { "axiom.showing_up": 9, "axiom.regular": 20 });
});

test("Perfect Week counts perfect days inside any seven days, with days off allowed", () => {
  assert.equal(bestWithin({}, 7), 0);
  assert.equal(bestWithin({ "2026-11-01": 1, "2026-11-02": 1, "2026-11-04": 1, "2026-11-06": 1, "2026-11-07": 1 }, 7), 5);
  assert.equal(bestWithin({ "2026-11-01": 1, "2026-11-02": 1, "2026-11-04": 1, "2026-11-06": 1, "2026-11-08": 1 }, 7), 4, "the eighth is outside the first seven days");
  assert.equal(bestWithin({ "2026-10-30": 1, "2026-10-31": 1, "2026-11-01": 1, "2026-11-02": 0 }, 7), 3, "across a month, and empty days don't count");
  const count = ACHIEVEMENTS.find((a) => a.id === "daily_plan.perfect_week").count;
  const week = Object.fromEntries([0, -1, -3, -5, -6].map((offset) => [key(offset), 1]));
  assert.equal(count(known({ "daily_plan.perfect": week })), 5);
  assert.deepEqual(earnedRewards(known({ "daily_plan.perfect": week })), ["automaton"]);
  assert.equal(count(known({ "daily_plan.perfect": run(5, 1, 2) })), 3, "days ahead don't count");
});

test("Planner needs an unbroken run, Clocking Off doesn't, and days ahead don't count", () => {
  const count = (id, days) => ACHIEVEMENTS.find((a) => a.id === id).count(known(days));
  const broken = { ...run(40), ...run(60, 1, -41) };
  assert.equal(count("daily_plan.planner", { "daily_plan.planned": broken }), 60);
  assert.equal(count("daily_plan.clocking_off", { "daily_plan.shutdown": broken }), 100);
  const ahead = run(10, 1, 9);
  assert.equal(count("daily_plan.planner", { "daily_plan.planned": ahead }), 1, "only today has happened");
  assert.equal(count("daily_plan.clocking_off", { "daily_plan.shutdown": ahead }), 1);
});

test("planning days don't light the Playground's streak flames", () => {
  const count = ACHIEVEMENTS.find((a) => a.id === "playground.blue_flame").count;
  assert.equal(count(known({ "daily_plan.planned": run(40), "reading.pages": run(2) })), 2);
});
