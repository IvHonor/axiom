// Every achievement, by area. Each has levels (bronze, silver, gold, …) and,
// once Axiom can count it, a `count` worked out from what this computer knows.
// One without a `count` shows as coming soon. Adding an achievement is adding
// an entry here. Pure (no React), so the tests can check the whole list.
import { bestStreak, total, type Days } from "./progress.ts";

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
  /** A cosmetic awarded at the first level. */
  reward?: { id: "tie" | "fedora"; name: string };
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

export const ACHIEVEMENTS: Achievement[] = [
  // ---------- Axiom ----------
  { id: "axiom.showing_up", area: "axiom", name: "Showing Up", levels: [3, 7, 30, 100, 365], reward: { id: "tie", name: "Tie" }, goal: (t) => `Use Axiom ${s(t, "day")} in a row`, count: streak("active"), unknown: DESKTOP },
  { id: "axiom.regular", area: "axiom", name: "Regular", levels: [10, 50, 200, 500], reward: { id: "fedora", name: "Fedora" }, goal: (t) => `Use Axiom on ${s(t, "day")}`, count: sum("active"), unknown: DESKTOP },
  { id: "axiom.explorer", area: "axiom", name: "Explorer", levels: [3, 6, 10], goal: (t) => (t >= 10 ? "Use every area" : `Use ${t} different areas`) },
  { id: "axiom.off_the_map", area: "axiom", name: "Off the Map", secret: true, levels: [1], goal: () => "Find the hidden city", count: (k) => (k.secrets.includes("nexus") ? 1 : 0) },

  // ---------- Daily Plan ----------
  { id: "daily_plan.task_crusher", area: "daily_plan", name: "Task Crusher", levels: [10, 100, 500, 2000], goal: (t) => `Finish ${s(t, "task")}`, count: sum("daily_plan.done") },
  { id: "daily_plan.flawless", area: "daily_plan", name: "Flawless", levels: [1, 10, 50], goal: (t) => `Finish all your top priorities on ${t === 1 ? "a day" : s(t, "day")}`, count: sum("daily_plan.perfect") },
  { id: "daily_plan.flawless_run", area: "daily_plan", name: "Flawless Run", levels: [3, 7], goal: (t) => `Have ${t} perfect days in a row`, count: streak("daily_plan.perfect") },
  { id: "daily_plan.deep_focus", area: "daily_plan", name: "Deep Focus", levels: [600, 3000, 15000], goal: (t) => `Focus for ${hours(t)} on the timer`, count: sum("daily_plan.focus"), format: hours },
  { id: "daily_plan.planner", area: "daily_plan", name: "Planner", levels: [7, 30, 100], goal: (t) => `Plan your day ${s(t, "day")} in a row` },
  { id: "daily_plan.clocking_off", area: "daily_plan", name: "Clocking Off", levels: [7, 30, 100], goal: (t) => `End ${s(t, "day")} with the shutdown routine` },
  { id: "daily_plan.creature_of_habit", area: "daily_plan", name: "Creature of Habit", levels: [3], goal: (t) => `Set up ${t} routines` },

  // ---------- Journal ----------
  { id: "journal.ink_streak", area: "journal", name: "Ink Streak", levels: [3, 7, 30, 100, 365], goal: (t) => `Write ${s(t, "day")} in a row`, count: streak("journal.days"), unknown: DESKTOP },
  { id: "journal.wordsmith", area: "journal", name: "Wordsmith", levels: [1000, 10000, 50000, 250000], goal: (t) => `Write ${s(t, "word")}${t === 50000 ? ", a novel's worth" : ""}` },
  { id: "journal.long_form", area: "journal", name: "Long Form", levels: [1], goal: () => "Write one entry over 1,000 words" },
  { id: "journal.feelings_logged", area: "journal", name: "Feelings Logged", levels: [30, 100], goal: (t) => `Record your mood ${s(t, "time")}` },
  { id: "journal.prompted", area: "journal", name: "Prompted", levels: [10, 50], goal: (t) => `Answer ${s(t, "writing prompt")}` },
  { id: "journal.one_year_on", area: "journal", name: "One Year On", levels: [1], goal: () => "Write on a date you also wrote on a year ago" },

  // ---------- Reading ----------
  { id: "reading.finish_line", area: "reading", name: "Finish Line", levels: [1, 5, 25, 100], goal: (t) => `Finish ${t === 1 ? "a book" : s(t, "book")}`, count: sum("reading.books") },
  { id: "reading.page_turner", area: "reading", name: "Page Turner", levels: [1000, 10000, 50000], goal: (t) => `Read ${s(t, "page")}`, count: sum("reading.pages") },
  { id: "reading.bookworm", area: "reading", name: "Bookworm", levels: [7, 30, 100], goal: (t) => `Read ${s(t, "day")} in a row`, count: streak("reading.pages") },
  { id: "reading.goal_reader", area: "reading", name: "Goal Reader", levels: [1], goal: () => "Reach your yearly reading goal" },
  { id: "reading.doorstopper", area: "reading", name: "Doorstopper", levels: [1], goal: () => "Finish a book of 600 pages or more" },
  { id: "reading.annotator", area: "reading", name: "Annotator", levels: [10, 100], goal: (t) => `Save ${s(t, "note or quote", "notes and quotes")}` },
  { id: "reading.critic", area: "reading", name: "Critic", levels: [10, 50], goal: (t) => `Rate or review ${s(t, "book")}` },
  { id: "reading.every_format", area: "reading", name: "Every Format", levels: [1], goal: () => "Finish a print book, an ebook and an audiobook" },
  { id: "reading.second_time_round", area: "reading", name: "Second Time Round", levels: [1], goal: () => "Finish a book again" },

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
  return Math.max(0, ...Object.values(k.days).map(bestStreak));
}
