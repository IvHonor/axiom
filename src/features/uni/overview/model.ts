import type { ModuleCard, TermCard, UniSummary } from "../api";
import { mediumDay, today } from "../../daily_plan/time";

export type View = "glance" | "strip" | "pulse" | "modules" | "cards" | "behind" | "upcoming" | "term" | "progress" | "attention" | "week" | "dashboard";
export interface Preferences {
  view: View | "auto";
  density: "auto" | "comfortable" | "compact";
  sort: "position" | "behind" | "progress" | "name";
  scope: "all" | "behind" | "shaky";
  details: boolean;
}
export const DEFAULTS: Preferences = {view: "auto", density: "auto", sort: "position", scope: "all", details: true};
export const VIEWS: {id: View; label: string; description: string; width: number; height: number}[] = [
  {id: "glance", label: "At a glance", description: "The most useful next action in a tiny tile", width: 0, height: 0},
  {id: "strip", label: "Module strip", description: "Progress side by side in a wide, shallow tile", width: 400, height: 42},
  {id: "pulse", label: "Term pulse", description: "Catch-up progress, overdue lectures and coming up", width: 145, height: 100},
  {id: "modules", label: "Module list", description: "Every module, with fitted rows and pagination", width: 145, height: 138},
  {id: "cards", label: "Module cards", description: "Colour-coded modules with names, progress and backlog", width: 260, height: 235},
  {id: "behind", label: "Catch up", description: "Overdue lectures, longest overdue first", width: 145, height: 138},
  {id: "upcoming", label: "Coming up", description: "Teaching in the next seven days, soonest first", width: 145, height: 138},
  {id: "term", label: "Teaching term", description: "Teaching week, dates and credits", width: 110, height: 150},
  {id: "progress", label: "Study progress", description: "Attendance, catch-up and review totals across your modules", width: 200, height: 180},
  {id: "attention", label: "Needs attention", description: "Modules with overdue lectures or shaky confidence", width: 200, height: 180},
  {id: "week", label: "Coming week", description: "Choose a day to see its upcoming teaching", width: 380, height: 235},
  {id: "dashboard", label: "University dashboard", description: "Module progress, catch-up work and upcoming teaching together", width: 560, height: 360},
];
export const fits = (view: View, width: number, height: number) => {
  const option = VIEWS.find(option => option.id === view)!;
  return width >= option.width && height >= option.height;
};
export function recommendedView(width: number, height: number): View {
  if (height < 100 && fits("strip", width, height)) return "strip";
  if (fits("dashboard", width, height)) return "dashboard";
  if (width >= 420 && fits("cards", width, height)) return "cards";
  if (height >= 290 && fits("week", width, height)) return "week";
  if (height >= 160 && fits("modules", width, height)) return "modules";
  if (fits("pulse", width, height)) return "pulse";
  if (fits("term", width, height)) return "term";
  return "glance";
}
export const resolveView = (prefs: Preferences, width: number, height: number): View =>
  prefs.view !== "auto" && fits(prefs.view, width, height) ? prefs.view : recommendedView(width, height);
export const percent = (value: number | null) => value === null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value));
export const ratio = (count: number, total: number) => total > 0 ? percent(count / total * 100) : null;
export function selectModules(modules: ModuleCard[], prefs: Preferences) {
  return modules.filter(module => prefs.scope === "all" || (prefs.scope === "behind" ? module.behind > 0 : module.shaky > 0)).sort((a, b) => {
    const order = prefs.sort === "behind" ? b.behind - a.behind : prefs.sort === "progress" ? (percent(a.percent) ?? -1) - (percent(b.percent) ?? -1)
      : prefs.sort === "name" ? a.name.localeCompare(b.name) : a.position - b.position;
    return order || a.position - b.position || a.id.localeCompare(b.id);
  });
}
export function totals(modules: ModuleCard[]) {
  return modules.reduce((sum, module) => ({lectures: sum.lectures + module.lectures, attended: sum.attended + module.attended,
    caughtUp: sum.caughtUp + module.caughtUp, reviewed: sum.reviewed + module.reviewed, shaky: sum.shaky + module.shaky,
    credits: sum.credits + (module.credits ?? 0)}), {lectures: 0, attended: 0, caughtUp: 0, reviewed: 0, shaky: 0, credits: 0});
}
export function termStatus(term: TermCard, day = today()) {
  return term.week !== null ? `Week ${term.week} of ${term.weeks}` : day < term.startsOn ? `Starts ${mediumDay(term.startsOn)}` : `Ended ${mediumDay(term.endsOn)}`;
}
export function selectHits(summary: UniSummary, modules: ModuleCard[], kind: "behind" | "upcoming") {
  const ids = new Set(modules.map(module => module.id));
  return summary[kind].filter(hit => ids.has(hit.moduleId)).sort((a, b) => (kind === "behind" ? b.days - a.days : a.days - b.days)
    || (a.day ?? "").localeCompare(b.day ?? "") || a.position - b.position || a.id.localeCompare(b.id));
}
export const rowHeight = (prefs: Preferences, height: number) => prefs.density === "compact" || (prefs.density === "auto" && height < 270) ? 50 : 72;
export function pageLayout(total: number, height: number, row: number, columns = 1) {
  const paging = total > Math.max(1, Math.floor(height / row)) * columns;
  const count = Math.max(1, Math.floor((height - (paging ? 28 : 0)) / row)) * columns;
  return {count, pages: Math.max(1, Math.ceil(total / count))};
}
