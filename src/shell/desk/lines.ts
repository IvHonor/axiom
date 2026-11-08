// What Lemma says on the desktop by himself, in his own way: each line has
// a few wordings, and his personality (Lemma's settings) has its own for
// many of them. One is picked at random each time, so he doesn't sound
// like a recording. `{x}` in a line is filled in (`**` makes it bold).
import type { Personality } from "../../features/lemma/persona";

export type Line =
  | "hello"
  | "done"
  | "dayDone"
  | "doneCount"
  | "timesUp"
  | "breakStart"
  | "breakOver"
  | "away"
  | "drift"
  | "upNext"
  | "stretch"
  | "bye"
  | "pushed"
  | "inboxZero"
  | "sessions"
  | "duck"
  | "dizzy"
  | "caught"
  | "focusStart";

const BASE: Record<Line, string[]> = {
  hello: ["Hi!", "Hey there.", "I'm here.", "Double-click me to talk."],
  done: ["Done! Nice work.", "Done! Well played.", "Done. Lovely."],
  dayDone: ["That's everything for today! Brilliant.", "Whole list, done. Take a bow."],
  doneCount: ["Nice one! That's **{n}** done today.", "**{n}** done today. Keep it rolling."],
  timesUp: ["Time's up on **{title}**!"],
  breakStart: ["Time for a break! Back in {n} min.", "Break time: {n} min. Stretch a little."],
  breakOver: ["Break's over. Back to **{title}**?"],
  away: ["Welcome back! You were away **{n} min**. Count it?"],
  drift: ["Still on **{title}**? It's been quiet for {n} min."],
  upNext: ["Nearly there. Up next: **{title}**."],
  stretch: ["Morning! *stretches*", "*yawns* Right, I'm awake. Morning!"],
  bye: ["Night! See you tomorrow.", "Bye for now!", "See you soon!"],
  pushed: ["That's the third time **{title}** has moved. Want to break it into smaller bits?"],
  inboxZero: ["Inbox zero! 👏", "Empty inbox. Gorgeous."],
  sessions: ["That's your {nth} **{title}** session this week!"],
  duck: ["Whoa!", "Eek!", "Careful!"],
  dizzy: ["Whoa… I'm dizzy.", "The room's spinning…"],
  caught: ["Got it!", "Caught one!"],
  focusStart: ["Focus for {n} min. Go!"],
};

const STYLES: Partial<Record<Personality, Partial<Record<Line, string[]>>>> = {
  cheerful: {
    hello: ["Hiya!! 👋", "Ooh, hello!", "Hi hi! What are we up to?"],
    done: ["Done!! You're on fire! 🔥", "Woohoo, done!", "Boom, done! ✨"],
    dayDone: ["EVERYTHING done!! Party time! 🎉", "The whole list! You legend!"],
    doneCount: ["Yay! **{n}** done today! 🎉", "**{n}** down! You're unstoppable!"],
    breakStart: ["Break time!! {n} min of wiggling! 💃", "Breaky break! Back in {n} min!"],
    away: ["You're back!! 🥳 You were gone **{n} min**. Count it?"],
    stretch: ["Gooood morning! ☀️ *big stretch*", "Morning morning! Let's go!"],
    bye: ["Nighty night! 🌙", "Bye bye! Same time tomorrow? 💙"],
    inboxZero: ["INBOX ZERO!! 🎉👏", "Look at that empty inbox! Sparkly!"],
    sessions: ["Ooh, {nth} **{title}** session this week! 🌟"],
    duck: ["Eeeek! 🙈", "Woah there!"],
    dizzy: ["Wheee… oh no, so dizzy 😵‍💫"],
    caught: ["Got it!! ✨", "Yay, caught it!"],
    focusStart: ["{n} minutes, let's goooo! 🚀"],
  },
  calm: {
    hello: ["Hello.", "I'm here whenever you need me.", "Hi. Take your time."],
    done: ["Done. Well done.", "That's finished. Nicely done."],
    dayDone: ["All done for today. Rest well.", "Everything's done. That's enough for today."],
    doneCount: ["**{n}** done today. Steady progress.", "That's **{n}** today. Nice and steady."],
    timesUp: ["Time's up on **{title}**. No rush."],
    breakStart: ["Let's pause for {n} minutes. Breathe.", "A {n}-minute break. Rest your eyes."],
    breakOver: ["Whenever you're ready: **{title}**?"],
    away: ["Welcome back. You were away **{n} min**. Shall I count it?"],
    drift: ["It's been quiet for {n} min. Still with **{title}**?"],
    stretch: ["Good morning. *slow stretch*", "Morning. Let's ease into it."],
    bye: ["Goodnight. Rest well.", "Until tomorrow."],
    pushed: ["**{title}** has moved three times now. Maybe a smaller first step?"],
    inboxZero: ["A clear inbox. Peaceful.", "Inbox empty. Nicely done."],
    focusStart: ["{n} minutes of focus. Settle in."],
  },
  direct: {
    hello: ["Hi.", "Here.", "Ready."],
    done: ["Done.", "Done. Next."],
    dayDone: ["List complete.", "All done today."],
    doneCount: ["**{n}** done.", "**{n}** done today."],
    timesUp: ["Time's up: **{title}**."],
    breakStart: ["Break: {n} min.", "{n} min break."],
    breakOver: ["Break over. **{title}**?"],
    away: ["Away **{n} min**. Count it?"],
    drift: ["No activity for {n} min. Still on **{title}**?"],
    upNext: ["Next: **{title}**."],
    stretch: ["Morning.", "Morning. Let's go."],
    bye: ["Bye.", "See you tomorrow."],
    pushed: ["**{title}** moved three times. Split it?"],
    inboxZero: ["Inbox: zero.", "Inbox clear."],
    sessions: ["{nth} **{title}** session this week."],
    duck: ["Hey.", "Watch it."],
    dizzy: ["Stop. Dizzy."],
    caught: ["Got it."],
    focusStart: ["{n} min. Go."],
  },
  witty: {
    hello: ["Ah, you again. Lovely.", "Reporting for duty. Mostly.", "Hello! I was definitely not napping."],
    done: ["Done! Somebody's been productive.", "Done. I'll alert the press.", "Done. Show-off."],
    dayDone: ["Whole list done. Are you feeling okay?", "Everything's done. I'm almost suspicious."],
    doneCount: ["**{n}** done. At this rate I'll need a bigger halo.", "That's **{n}** today. Who are you?"],
    timesUp: ["Time's up on **{title}**. Time flies when you're… whatever that was."],
    breakStart: ["Break! {n} min of strategically doing nothing.", "{n} min break. Go stare at a wall. Professionally."],
    breakOver: ["Break's over. **{title}** missed you. Probably."],
    away: ["Oh, you're back. I counted **{n} min**. Shall we pretend you were working?"],
    drift: ["It's been {n} min. Are you still on **{title}** or just thinking very hard?"],
    upNext: ["Almost there. Next up, the thrilling sequel: **{title}**."],
    stretch: ["*stretches* Right. Coffee. Then the world.", "Morning. I've already had a big day of being a sphere."],
    bye: ["Off you go. I'll guard the desktop.", "Night! Don't let the bugs bite. The code ones."],
    pushed: ["**{title}** has been moved three times. It's practically on tour.", "Third move for **{title}**. It deserves frequent flyer miles."],
    inboxZero: ["Inbox zero. Frame it.", "An empty inbox. Rarer than a unicorn."],
    sessions: ["{nth} **{title}** session this week. It's becoming a lifestyle."],
    duck: ["Rude!", "Hey! Personal space!"],
    dizzy: ["Round and round… very funny.", "I'm a desktop assistant, not a roundabout."],
    caught: ["Got it! Didn't even need my hands.", "Gotcha. Not that I was trying."],
    focusStart: ["{n} min of focus. No pressure. Some pressure."],
  },
  coach: {
    hello: ["Let's get after it!", "Ready when you are, champ.", "What are we crushing today?"],
    done: ["Done! That's how it's done!", "Yes! Done! Next rep!", "Done. Strong work."],
    dayDone: ["Full list! Outstanding effort!", "Everything done. That's a winning day!"],
    doneCount: ["**{n}** down! Keep the streak alive!", "That's **{n}**! Momentum!"],
    timesUp: ["Time's up on **{title}**! Finish strong or regroup?"],
    breakStart: ["Recovery break: {n} min. You earned it.", "{n} min rest. Hydrate!"],
    breakOver: ["Break's over! Back in the game: **{title}**?"],
    away: ["Back in! You were out **{n} min**. Count it?"],
    drift: ["{n} quiet minutes. Still locked in on **{title}**?"],
    upNext: ["Final stretch! Up next: **{title}**."],
    stretch: ["Morning! Warm-up stretch! 💪", "Rise and grind! *stretches*"],
    bye: ["Great session today. Rest up!", "Recovery time. See you tomorrow!"],
    pushed: ["**{title}** has slipped three times. Let's break it into a first small win."],
    inboxZero: ["Inbox zero! That's discipline! 👏", "Clean inbox. Champion stuff."],
    sessions: ["{nth} **{title}** session this week. Consistency wins!"],
    duck: ["Whoa! Quick hands!", "Dodge!"],
    dizzy: ["Okay, okay, I'm dizzy! Water break!"],
    caught: ["Caught it! Reflexes!", "Got it! Training pays off!"],
    focusStart: ["{n} minutes. Lock in!"],
  },
};

/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(n: number): string {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${tail ?? "th"}`;
}

/** A line in his own words: one of its wordings, with `{x}` filled in from `fill`. */
export function line(personality: Personality, what: Line, fill: Record<string, string | number> = {}): string {
  const ways = STYLES[personality]?.[what] ?? BASE[what];
  const picked = ways[Math.floor(Math.random() * ways.length)];
  return picked.replace(/\{(\w+)\}/g, (_, key: string) => String(fill[key] ?? ""));
}
