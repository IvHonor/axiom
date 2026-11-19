// Every achievement, by area. Each has levels (bronze, silver, gold, …) and,
// once Axiom can count it, a `count` worked out from what this computer knows.
// One without a `count` shows as coming soon. Adding an achievement is adding
// an entry here. Pure (no React), so the tests can check the whole list.
import { bestStreak, bestWithin, largest, monthsWith, total, weeksWith, type Days } from "./progress.ts";

/** What achievements are counted from. */
export interface Known {
  /** Each Playground metric's days (see src-tauri/src/playground.rs). A
   *  metric missing here isn't counted on this device (the web can't read
   *  Journal or Goals, which are encrypted). */
  days: Record<string, Days>;
  /** Lemma's look isn't the one it came with. */
  lookChanged: boolean;
  /** Playground friends, or undefined while not in the Playground. */
  friends?: number;
  /** Secrets found (see secrets.ts). */
  secrets: string[];
}

export type RewardId = "tie" | "fedora" | "verdigris" | "cog-bolo" | "loupe" | "gearwright-hat" | "skeleton" | "automaton" | "long-hour"
  | "ribbon-bookmark" | "muse" | "scribe-cap" | "mood-ink" | "living-ink" | "last-word"
  | "griffin-goggles" | "three-realms" | "jekyll" | "deerstalker" | "counts-collar" | "dragon-helm" | "pack-of-cards" | "voyage" | "gyges-ring" | "true-compass"
  | "round-glasses" | "aviators" | "cat-eye" | "tinted-glasses" | "bucket-hat" | "beret" | "flat-cap" | "headband" | "sun-hat" | "scarf" | "bandana" | "chain-necklace" | "lanyard" | "bead-necklace";

/** What kind of thing each reward is, for the icon on its step. */
export type RewardKind = "headwear" | "neckwear" | "facewear" | "holding" | "material" | "glow" | "personality";
export const REWARD_KINDS: Record<RewardId, RewardKind> = {
  tie: "neckwear", "cog-bolo": "neckwear", fedora: "headwear", "gearwright-hat": "headwear", loupe: "facewear",
  "long-hour": "holding", skeleton: "material", verdigris: "glow", automaton: "personality",
  "ribbon-bookmark": "neckwear", "scribe-cap": "headwear", "last-word": "holding", "living-ink": "material", "mood-ink": "glow", muse: "personality",
  "griffin-goggles": "facewear", "three-realms": "facewear", jekyll: "personality", deerstalker: "headwear", "counts-collar": "neckwear",
  "dragon-helm": "headwear", "pack-of-cards": "glow", voyage: "material", "gyges-ring": "holding", "true-compass": "holding",
  "round-glasses": "facewear", aviators: "facewear", "cat-eye": "facewear", "tinted-glasses": "facewear",
  "bucket-hat": "headwear", beret: "headwear", "flat-cap": "headwear", headband: "headwear", "sun-hat": "headwear",
  scarf: "neckwear", bandana: "neckwear", "chain-necklace": "neckwear", lanyard: "neckwear", "bead-necklace": "neckwear",
};

/**
 * Counts only the desktop can work out, shared through the profile so the web
 * shows them too. Journal and Goals stay out: they're end-to-end encrypted, and
 * the profile isn't, so their numbers shouldn't sit there in the clear.
 */
export const SHARED_COUNTS = ["axiom.showing_up", "axiom.regular"];

/** Set once The Interview has been answered. */
export const INTERVIEW_SECRET = "non-drifter";
/** Set once Lemma has given its one quiet hint. */
export const WHISPER_SECRET = "quiet-word";
/** Kept with the secrets, so they sync: "theme:<id>" for each theme tried, "area:<id>" for each area opened. */
export const THEME_MARK = "theme:";
export const AREA_MARK = "area:";

/** Counted for achievements alone: not Playground metrics, and they don't make a day "active". */
export const ACHIEVEMENT_METRICS = ["daily_plan.planned", "daily_plan.shutdown", "daily_plan.routines", "journal.written", "journal.words", "journal.long_entries", "journal.prompted", "journal.moods", "journal.full_pages",
  "reading.read_pages", "reading.active_days", "reading.finished_print", "reading.finished_ebook", "reading.finished_audio", "reading.longest", "reading.rereads", "reading.reviews", "reading.notes", "reading.quiet_started", "reading.quiet_finished"];

export interface Achievement {
  /** Stable: unlocks are remembered by it. "area.name". */
  id: string;
  /** The extension it belongs to, or "axiom" for Axiom as a whole. */
  area: string;
  name: string;
  /** What reaching `target` takes: "Write 7 days in a row". */
  goal: (target: number) => string;
  /** The count each level needs, lowest first. One level for a one-off. */
  levels: number[];
  /** Something for Lemma, kept for good: earned at the first level, or the last with `atTop`. */
  reward?: { id: RewardId; name: string; atTop?: boolean; from?: string };
  /** Instead of `reward`: one item for each level, in order. */
  stepRewards?: { id: RewardId; name: string }[];
  /** Shown as ??? until earned. */
  secret?: boolean;
  /** The count so far, or undefined when it can't be counted here. Left
   *  out until Axiom counts it. */
  count?: (k: Known) => number | undefined;
  /** Why it can't be counted here, when `count` gives undefined. */
  unknown?: string;
  /** How a count reads: "3h 20m". Plain numbers by default. */
  format?: (n: number) => string;
}

/** Areas in the order the page shows them. */
export const AREAS = ["axiom", "daily_plan", "journal", "reading", "learning", "goals", "project_board", "uni", "finance", "notes", "birthdays", "lemma", "playground"];

const n = (x: number) => Math.round(x).toLocaleString("en-GB");
const s = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;
/** Minutes as hours: "10h", or "4h 20m" on the way there. */
export const hours = (m: number) => {
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
};
const sum = (metric: string) => (k: Known) => (k.days[metric] ? total(k.days[metric]) : undefined);
const streak = (metric: string) => (k: Known) => (k.days[metric] ? bestStreak(k.days[metric]) : undefined);
const DESKTOP = "Counted in the desktop app, where it can read this area.";
const pad = (x: number) => String(x).padStart(2, "0");
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Only days that have happened: a day can be planned ahead, but that isn't a streak yet. */
const soFar = (days: Days) => { const today = localDay(); return Object.fromEntries(Object.entries(days).filter(([day]) => day <= today)); };
const daysTotal = (metric: string) => (k: Known) => (k.days[metric] ? total(soFar(k.days[metric])) : undefined);
const daysStreak = (metric: string) => (k: Known) => (k.days[metric] ? bestStreak(soFar(k.days[metric])) : undefined);
/** A number worked out from a metric's days so far. */
const fromDays = (metric: string, work: (days: Days) => number) => (k: Known) => (k.days[metric] ? work(soFar(k.days[metric])) : undefined);
const FORMAT_METRICS = ["reading.finished_print", "reading.finished_ebook", "reading.finished_audio"];
/** What was made at least a week ago and still exists. */
const keptAWeek = (metric: string) => (k: Known) => {
  if (!k.days[metric]) return undefined;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const latest = localDay(cutoff);
  return total(Object.fromEntries(Object.entries(k.days[metric]).filter(([day]) => day <= latest)));
};

/** Areas opened, plus any with activity from before they were being noted. */
function areasTried(k: Known) {
  const areas = new Set(k.secrets.filter((id) => id.startsWith(AREA_MARK)).map((id) => id.slice(AREA_MARK.length)));
  for (const [metric, days] of Object.entries(k.days)) if (metric.includes(".") && total(soFar(days)) > 0) areas.add(metric.split(".")[0]);
  return [...areas].filter((area) => area !== "axiom" && AREAS.includes(area)).length;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ---------- Axiom ----------
  // Made for beginners: everyday clothes at every step, and nothing longer than a couple of months.
  { id: "axiom.showing_up", area: "axiom", name: "Showing Up", levels: [3, 7, 14, 21, 31], stepRewards: [{ id: "tie", name: "Tie" }, { id: "round-glasses", name: "Round Glasses" }, { id: "bucket-hat", name: "Bucket Hat" }, { id: "scarf", name: "Scarf" }, { id: "aviators", name: "Aviators" }], goal: (t) => `Use Axiom ${s(t, "day")} in a row`, count: streak("active"), unknown: DESKTOP },
  { id: "axiom.regular", area: "axiom", name: "Regular", levels: [5, 10, 20, 40, 60], stepRewards: [{ id: "bandana", name: "Bandana" }, { id: "fedora", name: "Fedora" }, { id: "beret", name: "Beret" }, { id: "chain-necklace", name: "Chain Necklace" }, { id: "flat-cap", name: "Flat Cap" }], goal: (t) => `Use Axiom on ${s(t, "day")}`, count: sum("active"), unknown: DESKTOP },
  { id: "axiom.explorer", area: "axiom", name: "Explorer", levels: [2, 4, 6], stepRewards: [{ id: "headband", name: "Headband" }, { id: "cat-eye", name: "Cat-Eye Glasses" }, { id: "lanyard", name: "Lanyard" }], goal: (t) => `Try ${t} different areas`, count: areasTried },
  { id: "axiom.change_of_scene", area: "axiom", name: "Change of Scene", levels: [1, 3, 5], stepRewards: [{ id: "bead-necklace", name: "Bead Necklace" }, { id: "tinted-glasses", name: "Tinted Glasses" }, { id: "sun-hat", name: "Sun Hat" }], goal: (t) => (t === 1 ? "Switch to a new theme" : `Try ${t} different themes`), count: (k) => k.secrets.filter((id) => id.startsWith(THEME_MARK)).length },
  { id: "axiom.off_the_map", area: "axiom", name: "Off the Map", secret: true, levels: [1], goal: () => "Find the hidden city", count: (k) => (k.secrets.includes("nexus") ? 1 : 0) },

  // ---------- Daily Plan ----------
  // Easiest first; the hardest takes no more than about a month.
  { id: "daily_plan.creature_of_habit", area: "daily_plan", name: "Creature of Habit", levels: [1, 2, 3], reward: { id: "verdigris", name: "Verdigris Glow", atTop: true }, goal: (t) => `Keep ${s(t, "routine")} going for a week`, count: keptAWeek("daily_plan.routines") },
  { id: "daily_plan.task_crusher", area: "daily_plan", name: "Task Crusher", levels: [20, 50, 100], reward: { id: "cog-bolo", name: "Cog Bolo", atTop: true }, goal: (t) => `Finish ${s(t, "task")}`, count: sum("daily_plan.done") },
  { id: "daily_plan.flawless", area: "daily_plan", name: "Flawless", levels: [1, 3, 7], reward: { id: "loupe", name: "Watchmaker's Loupe", atTop: true }, goal: (t) => (t === 1 ? "Plan the day, finish your top priorities and shut down" : `Plan, finish your top priorities and shut down on ${s(t, "day")}`), count: sum("daily_plan.perfect") },
  { id: "daily_plan.perfect_week", area: "daily_plan", name: "Perfect Week", levels: [3, 4, 5], reward: { id: "automaton", name: "Automaton personality", atTop: true }, goal: (t) => `Have ${t} perfect days within 7 days`, count: (k) => (k.days["daily_plan.perfect"] ? bestWithin(soFar(k.days["daily_plan.perfect"]), 7) : undefined) },
  { id: "daily_plan.deep_focus", area: "daily_plan", name: "Deep Focus", levels: [300, 600, 1200], reward: { id: "gearwright-hat", name: "Gearwright's Top Hat", atTop: true }, goal: (t) => `Focus for ${hours(t)} on the timer`, count: sum("daily_plan.focus"), format: hours },
  { id: "daily_plan.clocking_off", area: "daily_plan", name: "Clocking Off", levels: [7, 14, 20], reward: { id: "skeleton", name: "Skeleton material", atTop: true }, goal: (t) => `End ${s(t, "day")} with the shutdown routine`, count: daysTotal("daily_plan.shutdown") },
  { id: "daily_plan.planner", area: "daily_plan", name: "Planner", levels: [7, 14, 21], reward: { id: "long-hour", name: "The Long Hour", atTop: true }, goal: (t) => `Plan your day ${s(t, "day")} in a row`, count: daysStreak("daily_plan.planned") },

  // ---------- Journal ----------
  // Easiest first; the hardest takes about two months. Journal is end-to-end
  // encrypted, so all of these are counted in the desktop app.
  { id: "journal.long_form", area: "journal", name: "Long Form", levels: [1, 3, 5], reward: { id: "ribbon-bookmark", name: "Ribbon Bookmark", atTop: true }, goal: (t) => (t === 1 ? "Write an entry of 1,000+ words" : `Write ${t} entries of 1,000+ words`), count: daysTotal("journal.long_entries"), unknown: DESKTOP },
  { id: "journal.prompted", area: "journal", name: "Prompted", levels: [3, 10, 20], reward: { id: "muse", name: "The Muse personality", atTop: true }, goal: (t) => `Answer ${s(t, "writing prompt")}`, count: daysTotal("journal.prompted"), unknown: DESKTOP },
  { id: "journal.full_page", area: "journal", name: "Full Page", levels: [5, 15, 30], reward: { id: "scribe-cap", name: "Scribe's Cap", atTop: true }, goal: (t) => `Write, log your mood and energy, and add a tag on ${s(t, "day")}`, count: daysTotal("journal.full_pages"), unknown: DESKTOP },
  { id: "journal.feelings_logged", area: "journal", name: "Feelings Logged", levels: [7, 21, 45], reward: { id: "mood-ink", name: "Mood Ink", atTop: true }, goal: (t) => `Record your mood on ${s(t, "day")}`, count: daysTotal("journal.moods"), unknown: DESKTOP },
  { id: "journal.wordsmith", area: "journal", name: "Wordsmith", levels: [1000, 5000, 15000], reward: { id: "living-ink", name: "Living Ink material", atTop: true }, goal: (t) => `Write ${s(t, "word")}`, count: daysTotal("journal.words"), unknown: DESKTOP },
  { id: "journal.ink_streak", area: "journal", name: "Ink Streak", levels: [3, 14, 45], reward: { id: "last-word", name: "The Last Word", atTop: true }, goal: (t) => `Write ${s(t, "day")} in a row`, count: daysStreak("journal.written"), unknown: DESKTOP },

  // ---------- Reading ----------
  // Easiest first; the hardest takes about three months. Audiobooks count too:
  // listening is reading, and about 1.5 minutes of it is worth a page.
  { id: "reading.second_time_round", area: "reading", name: "Second Time Round", levels: [1], reward: { id: "griffin-goggles", name: "Griffin's Goggles", from: "The Invisible Man" }, goal: () => "Finish a book again", count: daysTotal("reading.rereads") },
  { id: "reading.doorstopper", area: "reading", name: "Doorstopper", levels: [200, 350, 500], reward: { id: "three-realms", name: "The Mask of Three Realms", atTop: true, from: "The Divine Comedy" }, goal: (t) => `Finish a book of ${n(t)} pages or more`, count: fromDays("reading.longest", largest) },
  { id: "reading.every_format", area: "reading", name: "Every Format", levels: [1, 2, 3], reward: { id: "jekyll", name: "Jekyll & Hyde personality", atTop: true, from: "Strange Case of Dr Jekyll and Mr Hyde" }, goal: (t) => (t === 1 ? "Finish a book in any format" : t === 2 ? "Finish books in 2 formats" : "Finish a print book, an ebook and an audiobook"), count: (k) => (FORMAT_METRICS.some((m) => k.days[m]) ? FORMAT_METRICS.filter((m) => k.days[m] && total(soFar(k.days[m])) > 0).length : undefined) },
  { id: "reading.critic", area: "reading", name: "Critic", levels: [1, 2, 4], reward: { id: "deerstalker", name: "The Deerstalker", atTop: true, from: "Sherlock Holmes" }, goal: (t) => `Rate and review ${t === 1 ? "a book" : s(t, "book")}`, count: daysTotal("reading.reviews") },
  { id: "reading.annotator", area: "reading", name: "Annotator", levels: [3, 10, 30], reward: { id: "counts-collar", name: "The Count's Collar", atTop: true, from: "Dracula" }, goal: (t) => `Save ${s(t, "note or quote", "notes and quotes")}`, count: daysTotal("reading.notes") },
  { id: "reading.finish_line", area: "reading", name: "Finish Line", levels: [1, 3, 6], reward: { id: "dragon-helm", name: "King Arthur's Dragon Helm", atTop: true, from: "The History of the Kings of Britain" }, goal: (t) => `Finish ${t === 1 ? "a book" : s(t, "book")}`, count: daysTotal("reading.books") },
  { id: "reading.page_turner", area: "reading", name: "Page Turner", levels: [300, 800, 2000], reward: { id: "pack-of-cards", name: "Pack of Cards", atTop: true, from: "Alice's Adventures in Wonderland" }, goal: (t) => `Read ${s(t, "page")}`, count: daysTotal("reading.read_pages") },
  { id: "reading.book_a_month", area: "reading", name: "Book a Month", levels: [1, 2, 3], reward: { id: "voyage", name: "The Voyage of Odysseus", atTop: true, from: "The Odyssey" }, goal: (t) => `Finish a book in ${t === 1 ? "a month" : `${t} different months`}`, count: fromDays("reading.books", monthsWith) },
  { id: "reading.bookworm", area: "reading", name: "Bookworm", levels: [2, 6, 12], reward: { id: "gyges-ring", name: "The Ring of Gyges", atTop: true, from: "Plato's Republic" }, goal: (t) => `Update your reading on 2+ days a week for ${s(t, "week")}`, count: fromDays("reading.active_days", (days) => weeksWith(days, 2)) },
  { id: "reading.non_drifter", area: "reading", name: "The Non-Drifter", secret: true, levels: [1], reward: { id: "true-compass", name: "The True Compass" }, goal: () => "You answered the shadow", count: (k) => (k.secrets.includes(INTERVIEW_SECRET) ? 1 : 0) },

  // ---------- Learning ----------
  { id: "learning.study_hall", area: "learning", name: "Study Hall", levels: [600, 6000, 30000, 60000], goal: (t) => `Study for ${hours(t)}`, count: sum("learning.minutes"), format: hours },
  { id: "learning.study_streak", area: "learning", name: "Study Streak", levels: [7, 30, 100], goal: (t) => `Study ${s(t, "day")} in a row`, count: streak("learning.minutes") },
  { id: "learning.chapter_chaser", area: "learning", name: "Chapter Chaser", levels: [10, 100, 500], goal: (t) => `Finish ${s(t, "chapter")}`, count: sum("learning.units") },
  { id: "learning.graduate", area: "learning", name: "Graduate", levels: [1, 5, 20], goal: (t) => `Finish ${t === 1 ? "a book, course or playlist" : `${t} books, courses or playlists`}` },
  { id: "learning.long_memory", area: "learning", name: "Long Memory", levels: [10, 50], goal: (t) => `Take ${s(t, "chapter")} through the one-month review` },
  { id: "learning.polymath", area: "learning", name: "Polymath", levels: [3, 5], goal: (t) => `Study ${t} different skills` },

  // ---------- Goals ----------
  { id: "goals.goal_getter", area: "goals", name: "Goal Getter", levels: [1, 5, 20], goal: (t) => `Complete ${t === 1 ? "a goal" : s(t, "goal")}` },
  { id: "goals.checking_in", area: "goals", name: "Checking In", levels: [10, 100, 500], goal: (t) => `Check in on your goals ${s(t, "time")}`, count: sum("goals.checkins"), unknown: DESKTOP },
  { id: "goals.stepping_stones", area: "goals", name: "Stepping Stones", levels: [10, 50], goal: (t) => `Reach ${s(t, "milestone")}` },
  { id: "goals.ahead_of_schedule", area: "goals", name: "Ahead of Schedule", levels: [1], goal: () => "Complete a goal before its deadline" },
  { id: "goals.thought_it_through", area: "goals", name: "Thought It Through", levels: [1], goal: () => "Give a goal its why, what's in the way and an if-then plan" },
  { id: "goals.well_rounded", area: "goals", name: "Well Rounded", levels: [4], goal: (t) => `Have goals in ${t} areas of life` },

  // ---------- Project Board ----------
  { id: "project_board.shipping_dock", area: "project_board", name: "Shipping Dock", levels: [10, 100, 1000], goal: (t) => `Complete ${s(t, "card")}`, count: sum("project_board.done") },
  { id: "project_board.shipping_streak", area: "project_board", name: "Shipping Streak", levels: [7, 30], goal: (t) => `Complete a card ${s(t, "day")} in a row`, count: streak("project_board.done") },
  { id: "project_board.ticked_off", area: "project_board", name: "Ticked Off", levels: [100, 1000], goal: (t) => `Tick off ${s(t, "checklist item")}` },
  { id: "project_board.shipped_it", area: "project_board", name: "Shipped It", levels: [1], goal: () => "Finish every card in a project" },
  { id: "project_board.templated", area: "project_board", name: "Templated", levels: [3], goal: (t) => `Make ${t} card templates` },

  // ---------- University ----------
  { id: "uni.front_row", area: "uni", name: "Front Row", levels: [10, 50, 200], goal: (t) => `Attend ${s(t, "lecture")}` },
  { id: "uni.triple_tick", area: "uni", name: "Triple Tick", levels: [1, 50, 200], goal: (t) => `Attend, catch up on and review ${t === 1 ? "a lecture" : s(t, "lecture")}` },
  { id: "uni.lecture_hall", area: "uni", name: "Lecture Hall", levels: [1, 4, 11], goal: (t) => `End ${t === 1 ? "a week" : s(t, "week")} in a row with nothing behind` },
  { id: "uni.perfect_attendance", area: "uni", name: "Perfect Attendance", levels: [1], goal: () => "Attend every lecture in a module" },
  { id: "uni.got_it", area: "uni", name: "Got It", levels: [20, 100], goal: (t) => `Fully understand ${s(t, "lecture")}` },

  // ---------- Finance ----------
  { id: "finance.bookkeeper", area: "finance", name: "Bookkeeper", levels: [100, 1000, 5000], goal: (t) => `Log ${s(t, "transaction")}` },
  { id: "finance.logging_streak", area: "finance", name: "Logging Streak", levels: [7, 30], goal: (t) => `Log something ${s(t, "day")} in a row` },
  { id: "finance.on_budget", area: "finance", name: "On Budget", levels: [1, 3, 12], goal: (t) => `Keep every category under budget for ${t === 1 ? "a month" : s(t, "month")}` },
  { id: "finance.paper_trail", area: "finance", name: "Paper Trail", levels: [1], goal: () => "Import a bank statement" },
  { id: "finance.autopilot", area: "finance", name: "Autopilot", levels: [10], goal: (t) => `Create ${t} sorting rules` },
  { id: "finance.bills_sorted", area: "finance", name: "Bills Sorted", levels: [12], goal: (t) => `Confirm ${t} recurring payments` },

  // ---------- Notes ----------
  { id: "notes.note_taker", area: "notes", name: "Note Taker", levels: [10, 100, 500], goal: (t) => `Write ${s(t, "note")}` },
  { id: "notes.prolific", area: "notes", name: "Prolific", levels: [10000, 100000], goal: (t) => `Write ${s(t, "word")} in notes` },
  { id: "notes.connected", area: "notes", name: "Connected", levels: [10, 100], goal: (t) => `Link notes together ${s(t, "time")}` },
  { id: "notes.architect", area: "notes", name: "Architect", levels: [3], goal: (t) => `Nest folders ${t} levels deep` },
  { id: "notes.full_spectrum", area: "notes", name: "Full Spectrum", levels: [7], goal: () => "Have sticky notes in all seven colours" },

  // ---------- Birthdays ----------
  { id: "birthdays.never_forget", area: "birthdays", name: "Never Forget", levels: [10, 25, 50], goal: (t) => `Add ${s(t, "person", "people")}` },
  { id: "birthdays.gift_guru", area: "birthdays", name: "Gift Guru", levels: [5, 20], goal: (t) => `Give ${s(t, "gift")}` },
  { id: "birthdays.thoughtful", area: "birthdays", name: "Thoughtful", levels: [10], goal: (t) => `Save ${t} gift ideas` },
  { id: "birthdays.every_month", area: "birthdays", name: "Every Month", levels: [12], goal: () => "Have a birthday in all twelve months" },
  { id: "birthdays.contacts_in", area: "birthdays", name: "Contacts In", levels: [1], goal: () => "Import from a contacts file" },

  // ---------- Lemma ----------
  { id: "lemma.first_words", area: "lemma", name: "First Words", levels: [1, 25, 100], goal: (t) => (t === 1 ? "Chat with Lemma" : `Have ${t} chats with Lemma`) },
  { id: "lemma.trusted_hands", area: "lemma", name: "Trusted Hands", levels: [10, 100], goal: (t) => `Confirm ${s(t, "change card")}` },
  { id: "lemma.makeover", area: "lemma", name: "Makeover", levels: [1], goal: () => "Change Lemma's look", count: (k) => (k.lookChanged ? 1 : 0) },
  { id: "lemma.say_it_out_loud", area: "lemma", name: "Say It Out Loud", secret: true, levels: [1], goal: () => "Talk to Lemma out loud" },

  // ---------- Playground ----------
  { id: "playground.squad", area: "playground", name: "Squad", levels: [1, 5, 10], goal: (t) => `Make ${t === 1 ? "a friend" : s(t, "friend")} in the Playground`, count: (k) => k.friends, unknown: "Join the Playground to count your friends." },
  { id: "playground.cheerleader", area: "playground", name: "Cheerleader", levels: [10, 50, 200], goal: (t) => `Cheer friends on ${s(t, "time")}` },
  { id: "playground.podium", area: "playground", name: "Podium", levels: [1], goal: () => "Finish a week in your friends' top three" },
  { id: "playground.champion", area: "playground", name: "Champion", levels: [1], goal: () => "Win a week or a month" },
  { id: "playground.blue_flame", area: "playground", name: "Blue Flame", levels: [30], goal: () => "Keep any streak going for 30 days", count: (k) => longestOfAll(k) },
  { id: "playground.nova", area: "playground", name: "Nova", levels: [100], goal: () => "Keep any streak going for 100 days", count: (k) => longestOfAll(k) },
  { id: "playground.tourist", area: "playground", name: "Tourist", secret: true, levels: [1], goal: () => "Visit every district of the hidden city" },
];

/** The longest streak of any metric: what lights the Playground's flames. */
function longestOfAll(k: Known): number {
  return Math.max(0, ...Object.entries(k.days).filter(([metric]) => !ACHIEVEMENT_METRICS.includes(metric)).map(([, days]) => bestStreak(days)));
}

/** The count that earns an achievement's reward. */
export const rewardTarget = (a: Achievement) => (a.reward?.atTop ? a.levels[a.levels.length - 1] : a.levels[0]);

/** Every item an achievement gives, each with the count that earns it. */
export function rewardsOf(a: Achievement): { id: RewardId; name: string; from?: string; target: number }[] {
  if (a.stepRewards) return a.stepRewards.map((reward, i) => ({ ...reward, target: a.levels[i] }));
  return a.reward ? [{ ...a.reward, target: rewardTarget(a) }] : [];
}

/** Which achievement gives a reward, and at what count. */
export function rewardSource(id: string) {
  for (const achievement of ACHIEVEMENTS) {
    const reward = rewardsOf(achievement).find((item) => item.id === id);
    if (reward) return { achievement, reward };
  }
  return undefined;
}

export type SharedCounts = Record<string, number>;

/** Only known achievements and sensible numbers, from whatever a profile holds. */
export function readSharedCounts(raw: unknown): SharedCounts {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(SHARED_COUNTS.flatMap((id) => {
    const n = (raw as Record<string, unknown>)[id];
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? [[id, Math.floor(n)]] : [];
  }));
}

/** The best each device has seen: these counts only ever go up. */
export function mergeSharedCounts(a: SharedCounts, b: SharedCounts): SharedCounts {
  return Object.fromEntries(SHARED_COUNTS.flatMap((id) => {
    const best = Math.max(a[id] ?? 0, b[id] ?? 0);
    return best > 0 ? [[id, best]] : [];
  }));
}

/** What this device can count of them. */
export function countsToShare(known: Known): SharedCounts {
  return readSharedCounts(Object.fromEntries(SHARED_COUNTS.map((id) => [id, ACHIEVEMENTS.find((a) => a.id === id)?.count?.(known)])));
}

/** Every reward these numbers, and those shared by the person's other devices, have earned. */
export function earnedRewards(known: Known, shared: SharedCounts = {}): RewardId[] {
  return ACHIEVEMENTS.flatMap((a) => {
    const count = Math.max(a.count?.(known) ?? 0, shared[a.id] ?? 0);
    return rewardsOf(a).filter((reward) => count >= reward.target).map((reward) => reward.id);
  });
}
