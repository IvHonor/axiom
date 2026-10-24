import type { BookCard, Goal } from "../api";

export type View = "glance" | "strip" | "stack" | "continue" | "reading" | "covers" | "goal" | "queue" | "finished" | "library" | "year" | "dashboard";
export interface Preferences {
  view: View | "auto";
  density: "auto" | "comfortable" | "compact";
  sort: "recent" | "position" | "progress" | "title";
  covers: boolean;
}
export const DEFAULTS: Preferences = { view: "auto", density: "auto", sort: "recent", covers: true };
export const VIEWS: { id: View; label: string; description: string; width: number; height: number }[] = [
  { id: "glance", label: "At a glance", description: "One book and the essential numbers", width: 0, height: 0 },
  { id: "strip", label: "Reading strip", description: "Several current books side by side in a shallow tile", width: 420, height: 42 },
  { id: "stack", label: "Compact shelf", description: "Small covers and progress, including tall narrow tiles", width: 54, height: 150 },
  { id: "continue", label: "Continue reading", description: "A featured book, its progress and your reading habit", width: 135, height: 100 },
  { id: "reading", label: "Currently reading", description: "A fitted, paginated list of books on the go", width: 145, height: 138 },
  { id: "covers", label: "Cover shelf", description: "A shelf of covers with titles and progress", width: 230, height: 200 },
  { id: "goal", label: "Yearly goal", description: "Books finished, target and progress against the calendar", width: 145, height: 135 },
  { id: "queue", label: "Want to read", description: "Your next books in the order you chose", width: 145, height: 138 },
  { id: "finished", label: "Recently finished", description: "Recent finishes, ratings and dates", width: 145, height: 138 },
  { id: "library", label: "Library shelves", description: "Shelf counts and a fitted reading list", width: 240, height: 270 },
  { id: "year", label: "Reading year", description: "Monthly finishes and pages, plus your annual goal", width: 310, height: 240 },
  { id: "dashboard", label: "Reading dashboard", description: "Current books, annual goal, habit and next reads", width: 530, height: 335 },
];
export const fits = (view: View, width: number, height: number) => {
  const option = VIEWS.find(option => option.id === view)!;
  return width >= option.width && height >= option.height;
};
export function recommendedView(width: number, height: number): View {
  if (height < 100 && fits("strip", width, height)) return "strip";
  if (fits("dashboard", width, height)) return "dashboard";
  if (width >= 390 && fits("covers", width, height)) return "covers";
  if (fits("library", width, height)) return "library";
  if (fits("reading", width, height) && height >= 190) return "reading";
  if (fits("continue", width, height)) return "continue";
  if (fits("stack", width, height)) return "stack";
  return "glance";
}
export function resolveView(prefs: Preferences, width: number, height: number): View {
  return prefs.view !== "auto" && fits(prefs.view, width, height) ? prefs.view : recommendedView(width, height);
}
export const rowHeight = (prefs: Preferences, height: number) =>
  prefs.density === "compact" || (prefs.density === "auto" && height < 260) ? 52 : 70;
export const percent = (value: number | null) => value === null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value));
export const goalPercent = (goal: Goal) => goal.books && goal.books > 0 ? Math.min(100, goal.finished / goal.books * 100) : 0;
export function goalMessage(goal: Goal): string {
  if (!goal.books || goal.books <= 0) return "Set a goal for your reading year";
  if (goal.finished >= goal.books) return "Yearly goal reached";
  const difference = goal.finished - goal.expected;
  return difference > 0 ? `${difference} book${difference === 1 ? "" : "s"} ahead of pace`
    : difference < 0 ? `${-difference} book${difference === -1 ? "" : "s"} behind pace` : "On track for your goal";
}
export function sortBooks(books: BookCard[], sort: Preferences["sort"]): BookCard[] {
  return [...books].sort((a, b) => {
    const order = sort === "title" ? a.title.localeCompare(b.title)
      : sort === "progress" ? (percent(b.percent) ?? -1) - (percent(a.percent) ?? -1)
      : sort === "recent" ? (b.lastRead ?? "").localeCompare(a.lastRead ?? "") : 0;
    return order || a.position - b.position || a.id.localeCompare(b.id);
  });
}
/** Reserve the pager before allocating rows, so neither a new page nor a resize clips a book. */
export function pageLayout(total: number, height: number, row: number, columns = 1) {
  const fullRows = Math.max(1, Math.floor(height / row));
  const paging = total > fullRows * columns;
  const count = Math.max(1, Math.floor((height - (paging ? 28 : 0)) / row)) * columns;
  return { count, pages: Math.max(1, Math.ceil(total / count)) };
}
