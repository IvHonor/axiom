// Colors and names shared by the board's components.
import type { Recurrence } from "./api";

/** Label and project colors. Mid-tone so they read on dark and light themes.
 *  The names must match LABEL_COLORS in service.rs. */
export const COLORS: Record<string, string> = {
  green: "#4bce97",
  yellow: "#e2b203",
  orange: "#fea362",
  red: "#f87168",
  purple: "#9f8fef",
  blue: "#579dff",
  sky: "#6cc3e0",
  lime: "#94c748",
  pink: "#e774bb",
  gray: "#8c9bab",
};

export const colorOf = (name: string) => COLORS[name] ?? COLORS.gray;

export const PRIORITIES = ["None", "Low", "Medium", "High"];

/** Repeat options, in the order the drawer lists them. */
export const RECURRENCES: { value: Recurrence; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

/** A local date as "YYYY-MM-DD", comparable with task dates. */
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const todayISO = () => toISO(new Date());

/** The local date `days` from today, as "YYYY-MM-DD". */
export function daysFromNowISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** "30 Oct" from "2026-10-30". */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export type DueState = "overdue" | "today" | "soon" | "later" | "done";

export function dueState(dueDate: string, completed: boolean, today = todayISO()): DueState {
  if (completed) return "done";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  return dueDate <= daysFromNowISO(3) ? "soon" : "later";
}

/** "3 min ago", "2 h ago", "4 days ago", or a date. */
export function timeAgo(timestamp: string): string {
  const seconds = (Date.now() - new Date(timestamp).getTime()) / 1000;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)} days ago`;
  return new Date(timestamp).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
