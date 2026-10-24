// Typed wrappers for the Journal's Tauri commands.
// Mirrors src-tauri/src/features/journal/{entities,types}.rs.
import { invoke } from "@tauri-apps/api/core";
import type { Edit } from "../../lib/richtext/doc";

export interface Entry {
  id: string;
  day: string;
  title: string;
  /** 1 (awful) to 5 (great). */
  mood: number | null;
  /** 1 (drained) to 5 (buzzing). */
  energy: number | null;
  tags: string;
  prompt: string;
  text: string;
  words: number;
  createdAt: string;
  updatedAt: string;
}

export interface EntryCard {
  id: string;
  day: string;
  title: string;
  mood: number | null;
  energy: number | null;
  tags: string[];
  prompt: string;
  excerpt: string;
  words: number;
  createdAt: string;
  updatedAt: string;
}

export interface EntryDetail {
  entry: Entry;
  tags: string[];
  edits: Edit[];
  plan: { intention: string; wentWell: string; doBetter: string } | null;
}

export interface EntryFields {
  day: string;
  title: string;
  mood: number | null;
  energy: number | null;
  tags: string[];
  prompt: string;
}

export interface EntryFilter {
  search?: string | null;
  tag?: string | null;
  mood?: number | null;
  month?: string | null;
}

export interface JournalStats {
  streak: number;
  longestStreak: number;
  writtenToday: boolean;
  entries: number;
  words: number;
  calendar: { day: string; entries: number; words: number; mood: number | null }[];
  onThisDay: { yearsAgo: number; entry: EntryCard }[];
  averageMood: number | null;
  averageEnergy: number | null;
  tags: { tag: string; count: number }[];
}

export const api = {
  list: (filter: EntryFilter) => invoke<EntryCard[]>("journal_list", { filter }),
  onDay: (day: string) => invoke<EntryCard[]>("journal_on_day", { day }),
  get: (id: string) => invoke<EntryDetail>("journal_get", { id }),
  create: (day: string, prompt: string) => invoke<Entry>("journal_create", { day, prompt }),
  update: (id: string, fields: EntryFields) => invoke<Entry>("journal_update", { id, fields }),
  save: (id: string, update: string | null, text: string, words: number) => invoke<Entry>("journal_save", { id, update, text, words }),
  compact: (id: string, snapshot: string, replaces: string[]) => invoke<void>("journal_compact", { id, snapshot, replaces }),
  remove: (id: string) => invoke<void>("journal_delete", { id }),
  stats: (today: string) => invoke<JournalStats>("journal_stats", { today }),
  exportMarkdown: (markdown: string) => invoke<string>("journal_export", { markdown }),
  prompts: (today: string) => invoke<[string[], string]>("journal_prompts", { today }),
};

export function errorMessage(err: unknown): string {
  return typeof err === "string" ? err : err instanceof Error ? err.message : "Something went wrong. Try again.";
}

export const MOODS: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: "😞", label: "Awful" },
  { value: 2, emoji: "😕", label: "Low" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];

export const ENERGY: { value: number; label: string }[] = [
  { value: 1, label: "Drained" },
  { value: 2, label: "Tired" },
  { value: 3, label: "Steady" },
  { value: 4, label: "Energised" },
  { value: 5, label: "Buzzing" },
];

export const moodOf = (value: number | null) => MOODS.find((m) => m.value === value);

/** An entry's title, or its first line, or the date. */
export function titleOf(e: { title: string; excerpt?: string; text?: string }, fallback: string): string {
  if (e.title.trim()) return e.title.trim();
  const first = (e.excerpt ?? e.text ?? "").split("\n").find((l) => l.trim());
  return first ? first.trim().slice(0, 80) : fallback;
}
