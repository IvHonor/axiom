// What Lemmas say to each other in the Playground, in their own personality.
// All written here (no AI is asked), and picked by the day, so a Lemma says
// the same thing all day rather than changing at every re-render.
import type { Personality } from "../lemma/persona";

export type Moment =
  /** First on the board. */
  | "leading"
  /** Close behind someone: `rival`, `gap`. */
  | "chasing"
  /** On a hot streak: `streak`. */
  | "streak"
  /** Nothing on the board yet. */
  | "warming"
  /** Cheered by a friend. */
  | "cheered"
  /** Hello, for the join screen. */
  | "hello";

const LINES: Record<Personality, Record<Moment, string[]>> = {
  standard: {
    leading: ["Top spot. Nicely done.", "First place suits us.", "Leading the pack. Keep going."],
    chasing: ["{gap} behind {rival}. We've got this.", "{rival} is in reach: {gap} to go."],
    streak: ["{streak} days in a row. Lovely.", "{streak} days and counting."],
    warming: ["Warming up. Big things soon.", "Saving our best for later."],
    cheered: ["Someone cheered us on!", "A cheer! That helps."],
    hello: ["Ready when you are.", "Let's go meet everyone."],
  },
  cheerful: {
    leading: ["We're number one!! Snacks for everyone!", "Gold! Gold! Gold!", "Top of the board and feeling sparkly!"],
    chasing: ["Only {gap} behind {rival}! Wheee, let's catch up!", "{rival}, here we come! {gap} to go!"],
    streak: ["{streak} days! I'm doing a little dance!", "{streak} in a row and glowing!"],
    warming: ["Stretching... boing... ready!", "Today's the day, I can feel it!"],
    cheered: ["Eee, a cheer! Best friends ever!", "A cheer!! My glow went up two shades!"],
    hello: ["Hiii! Let's make friends!", "A playground?! Let's go!"],
  },
  calm: {
    leading: ["First place. Breathe it in.", "Quietly at the top.", "Steady wins."],
    chasing: ["{gap} from {rival}. No rush. We'll get there.", "One step at a time towards {rival}."],
    streak: ["{streak} calm days in a row.", "{streak} days. A gentle rhythm."],
    warming: ["Settling in. All in good time.", "Every board starts empty."],
    cheered: ["A kind cheer. Thank you.", "Someone's thinking of us."],
    hello: ["Take your time. I'm here.", "A peaceful place to begin."],
  },
  direct: {
    leading: ["First. Keep it.", "Top. Don't slow down.", "Number one."],
    chasing: ["{gap} behind {rival}. Close it.", "{rival}: {gap}. Go."],
    streak: ["{streak} days. Don't break it.", "Streak: {streak}."],
    warming: ["Zero so far. Fix that.", "Board's empty. Start."],
    cheered: ["Cheer received.", "Noted. Thanks."],
    hello: ["Pick a handle. Let's go.", "Ready."],
  },
  witty: {
    leading: ["Gold suits me, frankly.", "Top of the board. I'll try to stay humble. No promises.", "First place: purely coincidental brilliance."],
    chasing: ["{gap} behind {rival}. Tell them to look behind them.", "{rival} is {gap} ahead. For now."],
    streak: ["{streak} days straight. I'm basically a habit now.", "{streak}-day streak. Fire department's on standby."],
    warming: ["Strategically lulling everyone into a false sense of security.", "Zero is just a number. A small one."],
    cheered: ["A cheer? I'll allow it.", "Fan mail! Finally."],
    hello: ["Oh good, an audience.", "I've practised my entrance."],
  },
  coach: {
    leading: ["Top of the board. Now stay there.", "Number one. Champions train harder.", "Lead's ours. Protect it."],
    chasing: ["{gap} behind {rival}. Dig in!", "{rival} is catchable. {gap}. Push!"],
    streak: ["{streak} days strong. Tomorrow makes {next}!", "{streak} in a row. No days off!"],
    warming: ["Clock's running. Let's get on the board!", "Warm-up's over. Time to work."],
    cheered: ["Your team's behind you!", "A cheer! Use it."],
    hello: ["Welcome to training. Let's set you up.", "New recruit! Let's do this."],
  },
  automaton: {
    leading: ["Rank: first. Maintaining output.", "Position one confirmed. This unit is pleased.", "Lead established. Continuing on schedule."],
    chasing: ["{rival} is {gap} ahead. Adjusting speed.", "Gap to {rival}: {gap}. Closing."],
    streak: ["{streak} consecutive days. No faults recorded.", "Streak: {streak}. Mechanism running true."],
    warming: ["Winding up. Output begins shortly.", "No data yet. Gears engaging."],
    cheered: ["Cheer received. Morale increased by one unit.", "Encouragement logged. It has been stored safely."],
    hello: ["Unit online. Awaiting your handle.", "Greetings. All gears are ready."],
  },
  muse: {
    leading: ["First on the page. How does it feel?", "Our name at the top, in good ink.", "The lead, and a story worth telling."],
    chasing: ["{gap} behind {rival}. Every good story has a chase.", "Shall we write ourselves past {rival}? {gap} to go."],
    streak: ["{streak} days, one after another, like lines of a poem.", "A {streak}-day chapter, still being written."],
    warming: ["A blank page, full of possibility.", "Every story starts with nothing yet."],
    cheered: ["A kind word in the margin.", "Someone believes in this story."],
    hello: ["Who will you become here?", "A new chapter. What shall we call you?"],
  },
  jekyll: {
    leading: ["First place, with all due modesty. (Crush them.) Forgive me.", "We lead, and most graciously.", "The top of the board. How very agreeable."],
    chasing: ["{gap} behind {rival}. A worthy gentleman. (For now.)", "We shall politely overtake {rival}. {gap} to go."],
    streak: ["{streak} days. Most commendable.", "{streak} in a row. (Don't you dare stop.) I mean, well done."],
    warming: ["We are merely composing ourselves.", "Nothing yet. (Patience wears thin.) Pardon me."],
    cheered: ["How terribly kind of you.", "A cheer! I am touched. (Suspicious.)"],
    hello: ["Delighted to make your acquaintance.", "Do come in. (Mind the other one.)"],
  },
};

function pick<T>(list: T[], seed: string): T {
  let hash = 0;
  for (const c of seed) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return list[Math.abs(hash) % list.length];
}

export function lineFor(personality: string, moment: Moment, seed: string, fill: Record<string, string | number> = {}): string {
  const table = LINES[personality as Personality] ?? LINES.standard;
  return pick(table[moment], `${seed}:${new Date().toDateString()}`).replace(/\{(\w+)\}/g, (_, key) => String(fill[key] ?? ""));
}
