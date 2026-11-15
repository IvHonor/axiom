// How each Playground metric reads: its name, its "lab" (what its board is
// called in the Playground), icon, colour and number format. The rules
// (ids, caps, global or friends only) are in rules.ts.
import { Activity, type LucideIcon } from "lucide-react";
import { findExtension } from "../../extensions";
import { duration } from "../daily_plan/time";
import { RULES, type MetricRule } from "./rules";
import type { Period } from "./api";

export interface MetricInfo extends MetricRule {
  /** "Pages read". */
  label: string;
  /** Beside the others from its area: "Pages". */
  short: string;
  /** Its board's name: "Page Turners". */
  lab: string;
  /** "pages", for "212 pages". */
  noun: [one: string, many: string];
  icon: LucideIcon;
  color: string;
}

const COPY: Record<string, Pick<MetricInfo, "short" | "label" | "lab" | "noun">> = {
  active: { short: "Days active", label: "Days active", lab: "Showing Up", noun: ["day", "days"] },
  "reading.pages": { short: "Pages", label: "Pages read", lab: "Page Turners", noun: ["page", "pages"] },
  "reading.books": { short: "Books", label: "Books finished", lab: "Finish Line", noun: ["book", "books"] },
  "learning.minutes": { short: "Time", label: "Time studied", lab: "Study Hall", noun: ["minute", "minutes"] },
  "learning.units": { short: "Chapters", label: "Chapters done", lab: "Chapter Chasers", noun: ["chapter", "chapters"] },
  "daily_plan.focus": { short: "Focus", label: "Focus time", lab: "Deep Focus", noun: ["minute", "minutes"] },
  "daily_plan.perfect": { short: "Perfect days", label: "Perfect days", lab: "Flawless Days", noun: ["perfect day", "perfect days"] },
  "daily_plan.done": { short: "Tasks", label: "Tasks done", lab: "Task Crushers", noun: ["task", "tasks"] },
  "journal.days": { short: "Days written", label: "Days written", lab: "Ink Streak", noun: ["day", "days"] },
  "goals.checkins": { short: "Check-ins", label: "Goal check-ins", lab: "Goal Getters", noun: ["check-in", "check-ins"] },
  "project_board.done": { short: "Cards", label: "Cards completed", lab: "Shipping Dock", noun: ["card", "cards"] },
  "uni.caught_up": { short: "Lectures", label: "Lectures caught up", lab: "Lecture Hall", noun: ["lecture", "lectures"] },
};

/** Areas as the board picker names them, in its order. */
export const AREA_NAMES: Record<string, string> = {
  axiom: "Overall",
  reading: "Reading",
  learning: "Learning",
  daily_plan: "Planning",
  journal: "Journal",
  goals: "Goals",
  project_board: "Projects",
  uni: "Uni",
};

/** What an area's description means for sharing, shown when choosing what to share. */
export const SHARE_HINT: Record<string, string> = {
  active: "Days you did anything in Axiom. Nothing about what.",
  "journal.days": "Only that you wrote. Never what, or how you felt.",
  "project_board.done": "Your own boards only; shared boards are left out.",
};

// The area's icon and colour are looked up when first used: the extension
// list imports the Playground, so it isn't ready while this module loads.
export const METRICS: MetricInfo[] = RULES.map((rule) => {
  const ext = () => (rule.area === "axiom" ? undefined : findExtension(rule.area));
  return {
    ...rule,
    ...COPY[rule.id],
    get icon() { return ext()?.icon ?? Activity; },
    get color() { return ext()?.color ?? "var(--accent)"; },
  };
});

export const metricInfo = (id: string) => METRICS.find((m) => m.id === id) ?? METRICS[0];

/** A metric's number as words: "3h 20m", "212 pages", "4 days". */
export function formatValue(m: MetricInfo, value: number, period: Period, short = false): string {
  if (period === "streak") return short ? `${value}d` : `${value} ${value === 1 ? "day" : "days"} in a row`;
  if (m.unit === "minutes") return value ? duration(Math.round(value)) : "0m";
  const n = Math.round(value).toLocaleString();
  return short ? n : `${n} ${value === 1 ? m.noun[0] : m.noun[1]}`;
}

export const PERIODS: { id: Period; label: string; short: string }[] = [
  { id: "week", label: "This week", short: "Week" },
  { id: "month", label: "This month", short: "Month" },
  { id: "all", label: "All time", short: "All time" },
  { id: "streak", label: "Streaks", short: "Streaks" },
];

/** "last week", for "▲ 20 vs last week". */
export const before = (period: Period) => (period === "week" ? "last week" : "last month");
