// What Lemmas say in the garden, in their own personality. Short: they're
// small, and their bubbles are smaller. All written here; no AI is asked.

export interface Line {
  text: string;
  /** Said with it, or on its own when there's no text. */
  emoji: string;
}

type Moment = "arrive" | "gate" | "dizzy" | "cheered" | "yum";

const SOLO: Record<string, Record<Moment, string[]>> = {
  standard: { arrive: ["Hi everyone!", "Nice place!"], gate: ["Can I come in?", "Hello in there!"], dizzy: ["Whoa, whoa…", "Easy there!"], cheered: ["Thanks for the cheer!", "That helps!"], yum: ["Tasty data!", "Mm, nice."] },
  cheerful: { arrive: ["Hiii!! New friends!", "I'm heeere!"], gate: ["Let me in, let me in!", "Pleeease?"], dizzy: ["Wheee… oh no…", "The sky is spinning!"], cheered: ["Yay! Best day!", "Eee, thank you!"], yum: ["Yummy!!", "Sparkly snack!"] },
  calm: { arrive: ["Hello, all.", "What a peaceful garden."], gate: ["I'll wait here.", "Whenever you're ready."], dizzy: ["Let's slow down.", "Breathing…"], cheered: ["That's kind. Thank you.", "Lovely."], yum: ["Mm. Nourishing.", "Thank you."] },
  direct: { arrive: ["Here.", "Arrived."], gate: ["Open up.", "Accept?"], dizzy: ["Stop.", "Enough."], cheered: ["Noted.", "Thanks."], yum: ["Got it.", "Mine."] },
  witty: { arrive: ["Did someone order a Lemma?", "Fashionably on time."], gate: ["I promise I'm house-trained.", "Knock knock."], dizzy: ["I've seen the code of the universe.", "Is this a test?"], cheered: ["Finally, recognition.", "My fans!"], yum: ["Five stars.", "Compliments to the gardener."] },
  coach: { arrive: ["Let's get to work!", "Reporting for training!"], gate: ["Ready when you are, coach!", "Let me on the team!"], dizzy: ["Hydrate! Recover!", "Walk it off…"], cheered: ["That's the spirit!", "Team energy!"], yum: ["Fuel up!", "Protein!"] },
  automaton: { arrive: ["Unit arrived. On time.", "Tick. Tock. Hello."], gate: ["Requesting entry.", "Awaiting gate signal."], dizzy: ["Gyroscope fault.", "Recalibrating…"], cheered: ["Cheer logged.", "Morale: increased."], yum: ["Fuel accepted.", "Oil levels nominal."] },
  muse: { arrive: ["What a lovely opening scene.", "And so we enter…"], gate: ["May I join this chapter?", "Is there room in your story?"], dizzy: ["The words are swimming…", "What a plot twist."], cheered: ["A kind line.", "I'll keep that one."], yum: ["Food for thought.", "Delicious, like a good sentence."] },
  jekyll: { arrive: ["Good day, all.", "Charmed, I'm sure."], gate: ["May I trouble you?", "Do let me in. (Now.)"], dizzy: ["I'm not myself…", "Which one am I?"], cheered: ["Most kind.", "(Finally.) Thank you."], yum: ["Quite delicious.", "(More.) Pardon me."] },
};

/** Two Lemmas talking: an opener and a reply. */
const CHATS: [string, string, string, string][] = [
  ["How many pages today?", "📚", "Twelve! You?", "📖"],
  ["Did you plan your day?", "🗓️", "Top three, done!", "✅"],
  ["Nice hat.", "🎩", "Thanks, it's new!", "✨"],
  ["Race you to the hedge?", "🏁", "You're on!", "💨"],
  ["Our humans are on fire.", "🔥", "Streak gang!", "🔥"],
  ["Studying anything good?", "🧠", "Always.", "🤓"],
  ["Coffee?", "☕", "Always coffee.", "☕"],
  ["Beautiful day for focus.", "🌤️", "Perfect for it.", "🎯"],
  ["Psst… want a seed?", "🌱", "Ooh, yes please!", "😋"],
  ["Who's winning this week?", "🏆", "Not telling!", "🤫"],
];

const FLAVOUR: Record<string, (s: string) => string> = {
  cheerful: (s) => s.replace(/[.?]$/, "!"),
  direct: (s) => s.split(/[,.!?]/)[0] + ".",
  coach: (s) => s.replace(/\?$/, "? Let's go!"),
  automaton: (s) => s.replace(/!/g, "."),
};

const pick = <T,>(list: T[], rand: () => number) => list[Math.floor(rand() * list.length) % list.length];

function solo(personality: string, moment: Moment, rand: () => number): string {
  return pick((SOLO[personality] ?? SOLO.standard)[moment], rand);
}

function pair(first: string, second: string, rand: () => number): [Line, Line] {
  const [a, ea, b, eb] = pick(CHATS, rand);
  const say = (p: string, s: string) => (FLAVOUR[p] ? FLAVOUR[p](s) : s);
  return [{ text: say(first, a), emoji: ea }, { text: say(second, b), emoji: eb }];
}

/** A line for a moment, or (`chatter.pair`) two Lemmas' conversation. */
export const chatter = Object.assign(solo, { pair });

const HELLO: Record<string, string[]> = {
  standard: ["Hi, {you}!", "Hello!", "Oh, hi!"],
  cheerful: ["Hiii {you}!", "Boop!", "Hehe, that tickles!"],
  calm: ["Hello, {you}.", "Oh. Hello.", "Mm?"],
  direct: ["Yes?", "Hi.", "What's up."],
  witty: ["Autographs later.", "You rang?", "Careful, I'm delicate."],
  coach: ["Hey champ!", "Let's go, {you}!", "High five!"],
  automaton: ["Contact detected.", "Greetings, {you}.", "Tick."],
  muse: ["Hello, {you}. What's your story?", "Oh, a visitor.", "Tell me something true."],
  jekyll: ["Good day, {you}.", "(Hands off.) Forgive me.", "At your service."],
};
const EMOJI = ["💖", "✨", "👋", "😊", "🌟"];

/** What a Lemma says when you poke it. Yours knows it's you. */
export function reaction(personality: string, yours: boolean, you: string, rand: () => number): Line {
  const text = yours ? pick(["That's us!", "Hey, it's me!", "Hi, partner!"], rand) : pick(HELLO[personality] ?? HELLO.standard, rand).replace("{you}", you);
  return { text, emoji: pick(EMOJI, rand) };
}
