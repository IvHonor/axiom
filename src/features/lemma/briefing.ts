// Lemma's word on the day: what's worth knowing across the areas that are on,
// put as a few short things it says on the overview tile. Built on this
// computer from each area's summary; nothing is sent anywhere.
import type { Person } from "../birthdays/api";
import type { TodaySummary } from "../daily_plan/api";
import { clock } from "../daily_plan/time";
import type { GoalsSummary } from "../goals/api";
import { minutesText, type LearningSummary } from "../learning/api";
import type { ReadingSummary } from "../reading/api";
import type { UniSummary } from "../uni/api";
import { greeting } from "./parts";
import type { Personality } from "./persona";

/** What each area said, for the areas that are on (and answered). */
export interface Sources {
  daily_plan?: TodaySummary;
  uni?: UniSummary;
  learning?: LearningSummary;
  reading?: ReadingSummary;
  birthdays?: Person[];
  goals?: GoalsSummary;
}

/** One thing Lemma says. `text` marks names and numbers with **bold**. */
export interface Line {
  id: string;
  area: string;
  text: string;
  /** How much it matters right now: the tile says the weightiest first. */
  weight: number;
}

/** A number worth a glance, for the roomier tiles. */
export interface Stat {
  area: string;
  value: string;
  label: string;
}

export interface Briefing {
  greeting: string;
  intro: string;
  lines: Line[];
  stats: Stat[];
  signoff: string;
}

const INTROS: Record<Personality, string> = {
  standard: "Here's what I'd focus on today.",
  cheerful: "Ooh, here's what's on today!",
  calm: "Here's a gentle look at your day.",
  direct: "Today, in short.",
  witty: "Here's the day, minus the small print.",
  coach: "Here's the game plan.",
};

const SIGNOFFS: Record<Personality, [morning: string, day: string, evening: string]> = {
  standard: ["Have a good one. I'm here if you need me.", "You're doing well. I'm here if you need me.", "Go easy on yourself tonight."],
  cheerful: ["Let's make it a great one! ✨", "Keep that energy going! ✨", "What a day. Enjoy your evening! ✨"],
  calm: ["One thing at a time.", "Breathe. There's time.", "Let the day settle."],
  direct: ["That's it.", "That's all.", "Done for now."],
  witty: ["Go on, impress yourself.", "Halfway there. Probably.", "Tomorrow-you will be grateful."],
  coach: ["Let's get after it.", "Keep pushing. You've got this.", "Finish strong, then rest."],
};

const QUIET: Record<Personality, string> = {
  standard: "Nothing pressing today. A good day to get ahead on something you care about.",
  cheerful: "Nothing urgent today, so it's a free day to do something fun!",
  calm: "Nothing needs you right now. Enjoy the space.",
  direct: "Nothing urgent today.",
  witty: "Nothing on fire today. Suspicious, but let's enjoy it.",
  coach: "Nothing urgent, so pick one goal and move it forward.",
};

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function brief(sources: Sources, ctx: { name: string | null; personality: Personality; now?: Date }): Briefing {
  const now = ctx.now ?? new Date();
  const hour = now.getHours();
  const evening = hour >= 17;
  const lines: Line[] = [];
  const stats: Stat[] = [];
  const say = (area: string, id: string, weight: number, text: string) => lines.push({ id: `${area}:${id}`, area, text, weight });

  // ---------- The day's plan ----------
  const plan = sources.daily_plan;
  if (plan) {
    const left = plan.focus.filter((t) => !t.doneAt);
    if (plan.running) say("daily_plan", "running", 100, `You're in the middle of **${plan.running.title}**. Keep going, you're on a roll.`);
    if (plan.nextBlock) {
      const b = plan.nextBlock;
      if (b.inProgress) say("daily_plan", "now", 92, `Right now you've got **${b.title}** on.`);
      else say("daily_plan", "next", 90, `Next up at **${clock(b.startMinute)}**: ${b.title}.`);
    }
    if (left.length) {
      const more = left.length > 1 ? `, then ${plural(left.length - 1, "more focus", "more focuses")}` : "";
      say("daily_plan", "focus", 85, `Your top focus today is **${left[0].title}**${more}.`);
    }
    if (plan.total === 0) {
      say("daily_plan", "empty", 62, evening ? "Tomorrow's a blank page. Plan it tonight and you'll wake up ready." : "Nothing's planned yet. Five minutes planning now will make the whole day easier.");
    } else if (plan.done === plan.total) {
      say("daily_plan", "done", 70, `Every task is done today, all **${plan.total}** of them. Lovely work.`);
    } else if (!left.length) {
      say("daily_plan", "left", 52, `**${plan.total - plan.done}** of ${plural(plan.total, "task")} still to go today.`);
    }
    stats.push({ area: "daily_plan", value: plan.total ? `${plan.done}/${plan.total}` : "—", label: plan.total ? "tasks done" : "nothing planned" });
  }

  // ---------- University ----------
  const uni = sources.uni;
  if (uni && (uni.modules.length || uni.behind.length || uni.upcoming.length)) {
    const today = uni.upcoming.filter((l) => l.days === 0);
    const tomorrow = uni.upcoming.find((l) => l.days === 1);
    const module = (l: { moduleCode: string; moduleName: string }) => l.moduleCode || l.moduleName;
    if (today.length) {
      const l = today[0];
      say("uni", "today", 88, `**${l.title}** for ${module(l)} is on today${today.length > 1 ? `, with ${plural(today.length - 1, "more lecture")} after` : ""}.`);
    }
    if (uni.behind.length) {
      const oldest = [...uni.behind].sort((a, b) => b.days - a.days)[0];
      say("uni", "behind", 80 + Math.min(10, uni.behind.length), `You're **${plural(uni.behind.length, "lecture")}** behind. Start with **${oldest.title}** for ${module(oldest)}.`);
    } else if (uni.modules.length) {
      say("uni", "caught-up", 30, "You're all caught up on lectures. Nice and steady.");
    }
    if (tomorrow && !today.length) say("uni", "tomorrow", 48, `Tomorrow: **${tomorrow.title}** for ${module(tomorrow)}.`);
    stats.push({ area: "uni", value: String(uni.behind.length), label: uni.behind.length === 1 ? "lecture behind" : "lectures behind" });
  }

  // ---------- Courses and learning ----------
  const learning = sources.learning;
  if (learning && learning.skills.length) {
    const due = learning.reviews;
    if (due.length) {
      const skills = [...new Set(due.map((u) => u.skillName))];
      const where = skills.length === 1 ? `in ${skills[0]}` : `across ${plural(skills.length, "skill")}`;
      say("learning", "reviews", 76, `**${plural(due.length, "review")}** due ${where}. A quick pass keeps it fresh.`);
    }
    if (learning.todayMinutes > 0) {
      say("learning", "studied", 34, `You've already studied **${minutesText(learning.todayMinutes)}** today.`);
    } else if (learning.streak > 0) {
      say("learning", "streak", 72, `Keep your **${learning.streak}-day** learning streak alive with a short session today.`);
    } else {
      const skill = learning.skills.find((s) => !s.archived && (s.tally.percent ?? 0) < 100);
      if (skill) {
        const through = skill.tally.percent !== null ? ` You're ${Math.round(skill.tally.percent)}% through.` : "";
        say("learning", "nudge", 46, `Fancy some **${skill.name}** today?${through}`);
      }
    }
    stats.push(learning.streak > 0
      ? { area: "learning", value: String(learning.streak), label: "day streak" }
      :{ area: "learning", value: String(due.length), label: due.length === 1 ? "review due" : "reviews due" });
  }

  // ---------- Reading ----------
  const reading = sources.reading;
  if (reading) {
    const book = reading.reading[0];
    if (book) {
      const pct = book.percent !== null ? `**${Math.round(book.percent)}%** through ` : "reading ";
      const nudge = reading.pagesToday > 0 ? " You've already read today, too." : evening ? " A chapter tonight would be a lovely way to wind down." : "";
      say("reading", "book", reading.pagesToday > 0 ? 30 : evening ? 74 : 50, `You're ${pct}**${book.title}**.${nudge}`);
      stats.push({ area: "reading", value: book.percent !== null ? `${Math.round(book.percent)}%` : "—", label: book.title });
    } else if (reading.shelves.want > 0) {
      say("reading", "pick", 36, `**${plural(reading.shelves.want, "book")}** waiting on your shelf. Time to pick the next one?`);
    }
    const g = reading.goal;
    if (g.books && g.finished < Math.floor(g.expected)) {
      const behind = Math.floor(g.expected) - g.finished;
      say("reading", "goal", 40, `You're **${plural(behind, "book")}** behind your goal of ${g.books} for ${g.year}.`);
    }
    if (!book) stats.push({ area: "reading", value: String(g.finished), label: `read in ${g.year}` });
  }

  // ---------- Birthdays ----------
  const people = sources.birthdays ? [...sources.birthdays].sort((a, b) => a.days - b.days) : [];
  const soon = people.filter((p) => p.days <= 7);
  for (const p of soon.slice(0, 2)) {
    const what = p.occasion === "anniversary" ? "anniversary" : "birthday";
    const turning = p.turning && p.occasion === "birthday" ? ` (turning ${p.turning})` : "";
    if (p.days === 0) say("birthdays", p.id, 110, `It's **${p.name}**'s ${what} today${turning}! Don't forget to say happy ${what}. 🎂`);
    else {
      const when = p.days === 1 ? "tomorrow" : `in **${p.days} days**`;
      const gift = p.ideas === 0 && p.occasion === "birthday" ? " No gift ideas saved yet." : "";
      say("birthdays", p.id, 80 - p.days * 3, `**${p.name}**'s ${what} is ${when}${turning}.${gift}`);
    }
  }
  if (people[0]) stats.push({ area: "birthdays", value: people[0].days === 0 ? "Today" : `${people[0].days}d`, label: people[0].name });

  // ---------- Goals ----------
  const goals = sources.goals;
  if (goals && goals.active > 0) {
    if (goals.behind > 0) say("goals", "behind", 44, `**${plural(goals.behind, "goal")}** could use a little push.`);
    else say("goals", "on-track", 24, `All **${plural(goals.active, "goal")}** are on track.`);
    stats.push({ area: "goals", value: `${goals.onTrack}/${goals.active}`, label: "goals on track" });
  }

  lines.sort((a, b) => b.weight - a.weight);
  const p = ctx.personality;
  return {
    greeting: `${greeting(ctx.name, now)}.`.replace("?.", "?"),
    intro: lines.length ? INTROS[p] : QUIET[p],
    lines,
    stats,
    signoff: SIGNOFFS[p][hour < 12 ? 0 : hour < 17 ? 1 : 2],
  };
}

/** The words without the **bold** marks, for reading aloud and measuring. */
export const plain = (text: string) => text.replace(/\*\*/g, "");
