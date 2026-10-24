// Typed wrappers for University's Tauri commands.
// Mirrors src-tauri/src/features/uni/{entities,types}.rs.
import { invoke } from "@tauri-apps/api/core";

export type Kind = "lecture" | "seminar" | "lab" | "tutorial";
export type Stage = "attended" | "caught_up" | "reviewed";
export type Color = "blue" | "teal" | "green" | "amber" | "orange" | "red" | "pink" | "purple" | "slate";
/** 1 shaky, 2 okay, 3 solid. */
export type Confidence = 1 | 2 | 3;

export interface Term {
  id: string;
  name: string;
  /** Week 1 is the week this falls in. */
  startsOn: string;
  weeks: number;
}

export interface TermCard extends Term {
  /** The Sunday of the last week. */
  endsOn: string;
  /** The teaching week today is in; null before or after the term. */
  week: number | null;
}

export interface Module {
  id: string;
  termId: string;
  code: string;
  name: string;
  color: Color;
  credits: number | null;
  link: string | null;
  position: number;
}

export interface Lecture {
  id: string;
  moduleId: string;
  title: string;
  kind: Kind;
  week: number | null;
  day: string | null;
  topics: string;
  recorded: boolean;
  attendedOn: string | null;
  caughtUpOn: string | null;
  reviewedOn: string | null;
  confidence: Confidence | null;
  notes: string;
  position: number;
}

export interface ModuleCard extends Module {
  lectures: number;
  attended: number;
  caughtUp: number;
  reviewed: number;
  behind: number;
  shaky: number;
  /** Caught up on, 0 to 100. Null while there are no lectures. */
  percent: number | null;
  next: Lecture | null;
}

export interface ModuleDetail {
  card: ModuleCard;
  term: TermCard;
  lectures: Lecture[];
}

export interface LectureHit extends Lecture {
  moduleCode: string;
  moduleName: string;
  moduleColor: Color;
  /** Days since it was on (behind) or until it's on (coming up). */
  days: number;
}

export interface UniSummary {
  terms: TermCard[];
  current: string | null;
  modules: ModuleCard[];
  behind: LectureHit[];
  upcoming: LectureHit[];
}

export interface TermFields {
  name: string;
  startsOn: string;
  weeks: number;
}

export interface ModuleFields {
  termId: string;
  code: string;
  name: string;
  color: Color;
  credits: number | null;
  link: string | null;
}

export interface LectureFields {
  title: string;
  kind: Kind;
  week: number | null;
  day: string | null;
  topics: string;
  recorded: boolean;
  confidence: Confidence | null;
  notes: string;
}

export interface Schedule {
  kind: Kind;
  title: string;
  /** 0 is Monday. */
  weekdays: number[];
  fromWeek: number;
  toWeek: number;
  skipWeeks: number[];
  recorded: boolean;
}

export const api = {
  summary: (today: string) => invoke<UniSummary>("uni_summary", { today }),
  modules: (termId: string, today: string) => invoke<ModuleCard[]>("uni_modules", { termId, today }),
  module: (id: string, today: string) => invoke<ModuleDetail>("uni_module", { id, today }),
  addTerm: (fields: TermFields, today: string) => invoke<TermCard>("uni_add_term", { fields, today }),
  updateTerm: (id: string, fields: TermFields, today: string) => invoke<TermCard>("uni_update_term", { id, fields, today }),
  deleteTerm: (id: string) => invoke<void>("uni_delete_term", { id }),
  addModule: (fields: ModuleFields, today: string) => invoke<ModuleCard>("uni_add_module", { fields, today }),
  updateModule: (id: string, fields: ModuleFields, today: string) => invoke<ModuleCard>("uni_update_module", { id, fields, today }),
  deleteModule: (id: string) => invoke<void>("uni_delete_module", { id }),
  addLecture: (moduleId: string, fields: LectureFields) => invoke<Lecture>("uni_add_lecture", { moduleId, fields }),
  addSchedule: (moduleId: string, schedule: Schedule) => invoke<Lecture[]>("uni_add_schedule", { moduleId, schedule }),
  updateLecture: (id: string, fields: LectureFields) => invoke<Lecture>("uni_update_lecture", { id, fields }),
  setStage: (id: string, stage: Stage, done: boolean, today: string) => invoke<Lecture>("uni_set_stage", { id, stage, done, today }),
  deleteLecture: (id: string) => invoke<void>("uni_delete_lecture", { id }),
};

export function errorMessage(err: unknown): string {
  return typeof err === "string" ? err : err instanceof Error ? err.message : "Something went wrong. Try again.";
}

export const KINDS: { id: Kind; label: string }[] = [
  { id: "lecture", label: "Lecture" },
  { id: "seminar", label: "Seminar" },
  { id: "lab", label: "Lab" },
  { id: "tutorial", label: "Tutorial" },
];

/** Module colours, mid-tones that read on light and dark themes alike. */
export const COLORS: Record<Color, string> = {
  blue: "#4f86f7",
  teal: "#2bb3a3",
  green: "#4caf50",
  amber: "#e0a526",
  orange: "#ee7b30",
  red: "#e05252",
  pink: "#e06aa6",
  purple: "#9a6ce0",
  slate: "#7d8a99",
};

export const CONFIDENCE: Record<Confidence, string> = { 1: "Shaky", 2: "Okay", 3: "Solid" };

export const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: "attended", label: "Attended", hint: "You were there" },
  { id: "caught_up", label: "Caught up", hint: "You've gone through it properly" },
  { id: "reviewed", label: "Reviewed", hint: "You've gone back over it since" },
];

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const moduleLabel = (m: { code: string; name: string }) => (m.code ? `${m.code} ${m.name}` : m.name);

export const lectureFields = (l: Lecture): LectureFields => ({
  title: l.title,
  kind: l.kind,
  week: l.week,
  day: l.day,
  topics: l.topics,
  recorded: l.recorded,
  confidence: l.confidence,
  notes: l.notes,
});

/** "3 days ago", "yesterday", "today", "in 2 days". */
export function daysText(days: number, ago: boolean): string {
  if (days === 0) return "today";
  if (days === 1) return ago ? "yesterday" : "tomorrow";
  return ago ? `${days} days ago` : `in ${days} days`;
}
