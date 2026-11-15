// The Playground's metrics and their rules, mirroring `METRICS` in
// crates/protocol/src/playground.rs (the server enforces them). No imports,
// so stats.ts and its tests run anywhere.

export type MetricUnit = "count" | "minutes" | "days";

export interface MetricRule {
  id: string;
  /** The extension the numbers come from; "axiom" for every area together. */
  area: string;
  unit: MetricUnit;
  /** Fair to compare with strangers. The rest are for friends only. */
  global: boolean;
  /** The most one day can believably add; days above it count as this much. */
  dailyCap: number;
}

export const RULES: MetricRule[] = [
  { id: "active", area: "axiom", unit: "days", global: true, dailyCap: 1 },
  { id: "reading.pages", area: "reading", unit: "count", global: true, dailyCap: 1500 },
  { id: "reading.books", area: "reading", unit: "count", global: true, dailyCap: 10 },
  { id: "learning.minutes", area: "learning", unit: "minutes", global: true, dailyCap: 16 * 60 },
  { id: "learning.units", area: "learning", unit: "count", global: false, dailyCap: 60 },
  { id: "daily_plan.focus", area: "daily_plan", unit: "minutes", global: true, dailyCap: 16 * 60 },
  { id: "daily_plan.perfect", area: "daily_plan", unit: "days", global: true, dailyCap: 1 },
  { id: "daily_plan.done", area: "daily_plan", unit: "count", global: false, dailyCap: 150 },
  { id: "journal.days", area: "journal", unit: "days", global: true, dailyCap: 1 },
  { id: "goals.checkins", area: "goals", unit: "count", global: true, dailyCap: 50 },
  { id: "project_board.done", area: "project_board", unit: "count", global: false, dailyCap: 200 },
  { id: "uni.caught_up", area: "uni", unit: "count", global: false, dailyCap: 40 },
];

export const MAX_STREAK = 3650;

export const ruleOf = (id: string) => RULES.find((r) => r.id === id);
