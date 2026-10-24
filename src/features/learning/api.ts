// Typed wrappers for Learning's Tauri commands.
// Mirrors src-tauri/src/features/learning/{entities,types}.rs.
import { invoke } from "@tauri-apps/api/core";
import { COLORS as PALETTE, type Color } from "../uni/api";

export type { Color };
export type Kind = "book" | "course" | "video" | "other";
export type ReviewAction = "later" | "reviewed" | "clear";

export interface Skill {
  id: string;
  name: string;
  /** An emoji. */
  icon: string;
  color: Color;
  why: string;
  archived: boolean;
  position: number;
}

export interface Source {
  id: string;
  skillId: string;
  kind: Kind;
  title: string;
  author: string;
  link: string | null;
  coverUrl: string | null;
  /** What its units are called: "chapter", "lecture"… */
  unitName: string;
  finishBy: string | null;
  finishedOn: string | null;
  notes: string;
  position: number;
}

export interface Unit {
  id: string;
  sourceId: string;
  title: string;
  /** 0 top level, 1 inside it… A unit followed by deeper ones is a heading. */
  level: number;
  minutes: number | null;
  page: number | null;
  doneOn: string | null;
  /** 0 none asked for, 1–3 waiting on the 1st–3rd review. */
  reviewStage: number;
  reviewOn: string | null;
  notes: string;
  position: number;
}

export interface Session {
  id: string;
  sourceId: string;
  day: string;
  minutes: number;
  note: string;
}

export interface Tally {
  done: number;
  total: number;
  /** 0 to 100; null while there's nothing to do. */
  percent: number | null;
  reviews: number;
  weekMinutes: number;
  totalMinutes: number;
}

export interface SourceCard extends Source {
  tally: Tally;
  next: string | null;
  lastStudied: string | null;
  /** When it'll be done at your recent pace. */
  expected: string | null;
  /** Units a week needed to finish by `finishBy`. */
  neededPerWeek: number | null;
}

export interface SkillCard extends Skill {
  tally: Tally;
  sources: SourceCard[];
}

export interface SourceDetail {
  card: SourceCard;
  skill: Skill;
  units: Unit[];
  sessions: Session[];
}

export interface UnitHit extends Unit {
  sourceTitle: string;
  skillName: string;
  skillIcon: string;
  skillColor: Color;
}

export interface SessionHit extends Session {
  sourceTitle: string;
  skillIcon: string;
}

export interface Day {
  day: string;
  minutes: number;
  units: number;
}

export interface LearningSummary {
  skills: SkillCard[];
  reviews: UnitHit[];
  days: Day[];
  streak: number;
  todayMinutes: number;
  weekMinutes: number;
  weekUnits: number;
  recent: SessionHit[];
}

export interface SkillFields {
  name: string;
  icon: string;
  color: Color;
  why: string;
  archived: boolean;
}

export interface SourceFields {
  skillId: string;
  kind: Kind;
  title: string;
  author: string;
  link: string | null;
  coverUrl: string | null;
  unitName: string;
  finishBy: string | null;
  notes: string;
}

/** A unit to add. */
export interface Draft {
  title: string;
  level: number;
  minutes: number | null;
  page: number | null;
}

export interface UnitFields {
  title: string;
  level: number;
  minutes: number | null;
  page: number | null;
  notes: string;
}

/** What an import found. */
export interface Found {
  title: string | null;
  author: string | null;
  units: Draft[];
}

export const api = {
  summary: (today: string) => invoke<LearningSummary>("learning_summary", { today }),
  source: (id: string, today: string) => invoke<SourceDetail>("learning_source", { id, today }),
  addSkill: (fields: SkillFields) => invoke<Skill>("learning_add_skill", { fields }),
  updateSkill: (id: string, fields: SkillFields) => invoke<Skill>("learning_update_skill", { id, fields }),
  deleteSkill: (id: string) => invoke<void>("learning_delete_skill", { id }),
  addSource: (fields: SourceFields) => invoke<Source>("learning_add_source", { fields }),
  updateSource: (id: string, fields: SourceFields) => invoke<Source>("learning_update_source", { id, fields }),
  deleteSource: (id: string) => invoke<void>("learning_delete_source", { id }),
  addUnits: (sourceId: string, units: Draft[], replace: boolean, today: string) => invoke<Unit[]>("learning_add_units", { sourceId, units, replace, today }),
  updateUnit: (id: string, fields: UnitFields) => invoke<Unit>("learning_update_unit", { id, fields }),
  deleteUnit: (id: string, today: string) => invoke<void>("learning_delete_unit", { id, today }),
  setDone: (id: string, done: boolean, today: string) => invoke<Unit>("learning_set_done", { id, done, today }),
  review: (id: string, action: ReviewAction, today: string) => invoke<Unit>("learning_review", { id, action, today }),
  addSession: (fields: { sourceId: string; day: string; minutes: number; note: string }) => invoke<Session>("learning_add_session", { fields }),
  deleteSession: (id: string) => invoke<void>("learning_delete_session", { id }),
  parseText: (text: string) => invoke<Draft[]>("learning_parse_text", { text }),
  /** The file goes as raw bytes, not JSON: textbooks are big. */
  readBook: async (file: File) =>
    invoke<Found>("learning_read_book", new Uint8Array(await file.arrayBuffer()), { headers: { "x-file-name": encodeURIComponent(file.name) } }),
  youtubeAvailable: () => invoke<boolean>("learning_youtube_available"),
  youtube: (link: string) => invoke<Found>("learning_youtube", { link }),
};

export function errorMessage(err: unknown): string {
  return typeof err === "string" ? err : err instanceof Error ? err.message : "Something went wrong.";
}

export const COLORS = PALETTE;

export const KINDS: { id: Kind; label: string; emoji: string; unit: string; hint: string }[] = [
  { id: "book", label: "Book", emoji: "📕", unit: "chapter", hint: "A textbook or any book" },
  { id: "course", label: "Course", emoji: "🎓", unit: "lecture", hint: "Udemy, Coursera, edX…" },
  { id: "video", label: "Videos", emoji: "▶️", unit: "video", hint: "A YouTube playlist or series" },
  { id: "other", label: "Other", emoji: "🧩", unit: "part", hint: "Docs, a project, anything" },
];

export const kindOf = (k: Kind) => KINDS.find((x) => x.id === k) ?? KINDS[3];

/** "chapter" → "chapters". */
export const plural = (word: string, n: number) => (n === 1 ? word : word.endsWith("s") ? word : `${word}s`);

/** Which units are headings: those with deeper ones right after. */
export function headings(units: Unit[]): boolean[] {
  return units.map((u, i) => i + 1 < units.length && units[i + 1].level > u.level);
}

export function minutesText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const unitFields = (u: Unit): UnitFields => ({ title: u.title, level: u.level, minutes: u.minutes, page: u.page, notes: u.notes });

/** The review stage, in words. */
export function reviewText(u: Unit, now: string): string | null {
  if (!u.reviewOn) return null;
  const which = ["", "1st", "2nd", "3rd"][u.reviewStage] ?? "";
  return u.reviewOn <= now ? `${which} review due` : `${which} review on ${u.reviewOn}`;
}
