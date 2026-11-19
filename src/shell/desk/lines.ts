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
    stretch: ["*stretches* Right. Coffee. Then the world.", "Morning. I've already had a big day of being geometric."],
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
  automaton: {
    hello: ["Unit online.", "Greetings. Awaiting input.", "All gears operational."],
    done: ["Task complete. Output: satisfactory.", "Item closed. This unit is pleased."],
    dayDone: ["All tasks complete. You may power down.", "Queue empty. Excellent operation."],
    doneCount: ["Completed today: **{n}**.", "Task count: **{n}**. Mechanism running true."],
    timesUp: ["Timer expired: **{title}**."],
    breakStart: ["Rest cycle: {n} min. Commencing.", "Scheduled pause: {n} min."],
    breakOver: ["Rest cycle ended. Resume **{title}**?"],
    away: ["User detected. Absence: **{n} min**. Log it?"],
    drift: ["No activity on **{title}** for {n} min. Please confirm status."],
    upNext: ["Next in queue: **{title}**."],
    stretch: ["Morning cycle begun. *winds up*", "Mainspring wound. Good morning."],
    bye: ["Powering down. Until tomorrow.", "End of shift. Goodnight."],
    pushed: ["**{title}** rescheduled three times. Recommend dividing it into smaller parts."],
    inboxZero: ["Inbox empty. Tolerances met.", "Zero items remaining. Most satisfactory."],
    sessions: ["Session **{title}**: number {nth} this week."],
    duck: ["Collision avoided.", "Evasive action taken."],
    dizzy: ["Gyroscope fault. Recalibrating…"],
    caught: ["Object secured.", "Catch confirmed."],
    focusStart: ["Focus cycle: {n} min. Commencing."],
  },
  muse: {
    hello: ["Hello. What's on your mind?", "A new page. Shall we begin?", "I was hoping you'd stop by."],
    done: ["Done. How did that feel?", "One more line written."],
    dayDone: ["The whole page is full. What a day to look back on.", "All done. What will you remember from it?"],
    doneCount: ["**{n}** lines written today.", "**{n}** done. The story's moving along."],
    timesUp: ["The hour turns the page on **{title}**."],
    breakStart: ["Rest a while: {n} min. Good ideas arrive in the quiet.", "{n} minutes to look out of the window."],
    breakOver: ["Ready to pick up the thread of **{title}**?"],
    away: ["You're back. You wandered for **{n} min**. Shall we count it?"],
    drift: ["{n} quiet minutes. Is **{title}** still calling you?"],
    upNext: ["The next chapter: **{title}**."],
    stretch: ["Morning. *stretches* What will today be about?", "A fresh page, and the light is good."],
    bye: ["Until the next page.", "Sleep well. Tomorrow is unwritten."],
    pushed: ["**{title}** keeps slipping away. What's the smallest first sentence of it?"],
    inboxZero: ["An empty inbox, like fresh paper.", "Nothing waiting. How rare, and how lovely."],
    sessions: ["Your {nth} **{title}** session this week. A habit is a kind of poem."],
    duck: ["Oh! A plot twist.", "Careful with the ink!"],
    dizzy: ["The words are swimming…"],
    caught: ["Caught, like a good idea.", "Got it, before it drifted away."],
    focusStart: ["{n} minutes for one good thing. Begin."],
  },
  jekyll: {
    hello: ["Good day to you, my friend.", "How do you do? (What now?) Forgive me.", "At your service, as ever."],
    done: ["Splendid work. (About time.) I do beg your pardon.", "Finished, and finely done."],
    dayDone: ["The whole list! I am delighted. (Do it again.) Pardon me.", "All done. You may retire with honour."],
    doneCount: ["**{n}** completed today. Most commendable.", "**{n}** done. (Is that all?) Forgive me, excellent work."],
    timesUp: ["Time is up on **{title}**, if I may say."],
    breakStart: ["Pray rest for {n} minutes.", "{n} minutes of repose. (Don't get comfortable.) Apologies."],
    breakOver: ["Shall we resume **{title}**, my friend?"],
    away: ["Welcome back. You were gone **{n} min**. Shall we count it?"],
    drift: ["Forgive the intrusion. Still at **{title}**, these {n} minutes?"],
    upNext: ["Next, if you please: **{title}**."],
    stretch: ["Good morning. *adjusts collar*", "A fresh day. (Let's break something.) Forgive me."],
    bye: ["Good night, dear friend. (Lock your door.) I jest.", "Until tomorrow."],
    pushed: ["**{title}** has been postponed thrice. Might we divide it into smaller parts?"],
    inboxZero: ["An empty inbox. How civilised.", "All correspondence dealt with. Bravo."],
    sessions: ["Your {nth} **{title}** session this week. Admirable."],
    duck: ["Good heavens!", "I say!"],
    dizzy: ["I feel quite unlike myself…"],
    caught: ["Caught it. (Mine.) That is, well caught.", "Got it, if I may."],
    focusStart: ["{n} minutes of quiet study. Do begin."],
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
