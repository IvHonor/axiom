// Typed wrappers for the Goals Tauri commands.
// Mirrors src-tauri/src/features/goals/{entities,types}.rs.
import { invoke } from "@tauri-apps/api/core";

export type Area = "health" | "career" | "money" | "learning" | "relationships" | "personal" | "home" | "fun";
export type Kind = "target" | "milestones" | "once";
export type Source = "manual" | "finance_account" | "reading_books" | "reading_pages" | "journal_entries" | "project" | "uni_module";
export type Status = "active" | "paused" | "done" | "dropped";
export type Pace = "ahead" | "on_track" | "behind";

export interface Goal {
  id: string;
  title: string;
  icon: string;
  area: Area;
  kind: Kind;
  source: Source;
  sourceId: string;
  startValue: number;
  targetValue: number;
  unit: string;
  measure: "total" | "latest";
  startDate: string;
  dueDate: string | null;
  why: string;
  obstacle: string;
  plan: string;
  status: Status;
  completedOn: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  /** Worked out from today. */
  current: number;
  target: number;
  percent: number;
  expected: number | null;
  pace: Pace | null;
  perWeek: number | null;
  daysLeft: number | null;
  reached: boolean;
  sourceName: string | null;
  lastProgress: string | null;
}

export interface Log {
  id: string;
  goalId: string;
  day: string;
  value: number;
  note: string;
  createdAt: string;
}

export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  dueDate: string | null;
  doneOn: string | null;
  position: number;
}

export interface GoalDetail {
  goal: Goal;
  logs: Log[];
  milestones: Milestone[];
}

export interface GoalFields {
  title: string;
  icon: string;
  area: Area;
  kind: Kind;
  source: Source;
  sourceId: string;
  startValue: number;
  targetValue: number;
  unit: string;
  measure: "total" | "latest";
  startDate: string;
  dueDate: string | null;
  why: string;
  obstacle: string;
  plan: string;
}

export interface SourceOption {
  id: string;
  name: string;
  unit: string;
}

export interface Sources {
  accounts: SourceOption[];
  projects: SourceOption[];
  modules: SourceOption[];
}

export interface GoalsSummary {
  active: number;
  onTrack: number;
  behind: number;
  doneThisYear: number;
}

export const api = {
  list: (today: string) => invoke<Goal[]>("goals_list", { today }),
  get: (id: string, today: string) => invoke<GoalDetail>("goals_get", { id, today }),
  summary: (today: string) => invoke<GoalsSummary>("goals_summary", { today }),
  sources: (today: string) => invoke<Sources>("goals_sources", { today }),
  create: (fields: GoalFields, today: string) => invoke<Goal>("goals_create", { fields, today }),
  update: (id: string, fields: GoalFields, today: string) => invoke<Goal>("goals_update", { id, fields, today }),
  setStatus: (id: string, status: Status, today: string) => invoke<Goal>("goals_set_status", { id, status, today }),
  move: (id: string, before: string | null) => invoke<void>("goals_move", { id, before }),
  remove: (id: string) => invoke<void>("goals_delete", { id }),
  log: (goalId: string, day: string, value: number, note: string, today: string) => invoke<Goal>("goals_log", { goalId, day, value, note, today }),
  removeLog: (id: string) => invoke<void>("goals_log_delete", { id }),
  addMilestone: (goalId: string, title: string, dueDate: string | null) => invoke<Milestone>("goals_milestone_add", { goalId, title, dueDate }),
  updateMilestone: (id: string, title: string, dueDate: string | null) => invoke<Milestone>("goals_milestone_update", { id, title, dueDate }),
  tickMilestone: (id: string, done: boolean, today: string) => invoke<Milestone>("goals_milestone_tick", { id, done, today }),
  removeMilestone: (id: string) => invoke<void>("goals_milestone_delete", { id }),
};

export function errorMessage(err: unknown): string {
  return typeof err === "string" ? err : err instanceof Error ? err.message : "Something went wrong. Try again.";
}

export const AREAS: { id: Area; label: string; emoji: string; color: string }[] = [
  { id: "health", label: "Health", emoji: "💪", color: "#3f9d6e" },
  { id: "career", label: "Career", emoji: "💼", color: "#3d74c4" },
  { id: "money", label: "Money", emoji: "💰", color: "#c79a1e" },
  { id: "learning", label: "Learning", emoji: "📚", color: "#7a5cc7" },
  { id: "relationships", label: "Relationships", emoji: "❤️", color: "#d4536a" },
  { id: "personal", label: "Personal", emoji: "🌱", color: "#2f9e8f" },
  { id: "home", label: "Home", emoji: "🏡", color: "#c06b2f" },
  { id: "fun", label: "Fun", emoji: "🎉", color: "#c2549d" },
];

export const areaOf = (id: Area) => AREAS.find((a) => a.id === id) ?? AREAS[5];

export const iconOf = (g: Pick<Goal, "icon" | "area">) => g.icon || areaOf(g.area).emoji;

export const PACE: Record<Pace, { label: string; tone: string }> = {
  ahead: { label: "Ahead", tone: "is-ahead" },
  on_track: { label: "On track", tone: "is-on-track" },
  behind: { label: "Behind", tone: "is-behind" },
};

const SIGNS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€", "£": "£", $: "$", "€": "€", "¥": "¥", "₹": "₹" };

/** "£2,300", "12.5 km", "1,200". Matches `amount` in service.rs. */
export function amount(value: number, unit: string): string {
  const number = Math.abs(value).toLocaleString("en-GB", { maximumFractionDigits: 2 });
  const minus = value < 0 ? "-" : "";
  const sign = SIGNS[unit.trim()];
  if (!unit.trim()) return `${minus}${number}`;
  return sign ? `${minus}${sign}${number}` : `${minus}${number} ${unit.trim()}`;
}

/** "£2,300 of £5,000", "3 of 5 milestones". Matches `progress_text`. */
export function progressText(g: Goal): string {
  if (g.kind === "once") return g.status === "done" ? "Done" : "To do";
  if (g.kind === "milestones") {
    const what = g.source === "project" ? "cards" : g.source === "uni_module" ? "lectures" : "milestones";
    return `${g.current} of ${g.target} ${what}`;
  }
  return `${amount(g.current, g.unit)} of ${amount(g.target, g.unit)}`;
}

/** "68 days left", "Due tomorrow", "3 days overdue". */
export function dueText(g: Goal): string | null {
  if (g.daysLeft === null) return null;
  if (g.daysLeft < 0) return `${-g.daysLeft} ${g.daysLeft === -1 ? "day" : "days"} overdue`;
  if (g.daysLeft === 0) return "Due today";
  if (g.daysLeft === 1) return "Due tomorrow";
  if (g.daysLeft < 60) return `${g.daysLeft} days left`;
  return `${Math.round(g.daysLeft / 30.4)} months left`;
}

/** "Follows your Savings account", for goals that keep track by themselves. */
export function sourceText(g: Goal): string | null {
  if (g.source === "manual") return null;
  if (g.sourceName === "No longer there") return "What it followed is no longer there";
  const what: Record<Source, string> = {
    manual: "",
    finance_account: `From Finance · ${g.sourceName}`,
    reading_books: "From Reading · books finished",
    reading_pages: "From Reading · pages read",
    journal_entries: "From Journal · days written",
    project: `From Project Board · ${g.sourceName}`,
    uni_module: `From University · ${g.sourceName}`,
  };
  return what[g.source];
}
