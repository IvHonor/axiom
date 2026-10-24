// Typed wrappers for the Birthdays Tauri commands.
// Mirrors src-tauri/src/features/birthdays/{entities,types}.rs.
import { invoke } from "@tauri-apps/api/core";

export type Occasion = "birthday" | "anniversary";
export type Relation = "family" | "friend" | "partner" | "work" | "other";
export type GiftStatus = "idea" | "bought" | "given";

export interface Person {
  id: string;
  name: string;
  occasion: Occasion;
  month: number;
  day: number;
  year: number | null;
  relation: Relation;
  notes: string;
  remindDays: number;
  /** The next time it comes round ("YYYY-MM-DD"): today, if it's today. */
  next: string;
  /** Days until `next`: 0 for today. */
  days: number;
  age: number | null;
  turning: number | null;
  /** Gift ideas not given yet. */
  ideas: number;
  createdAt: string;
  updatedAt: string;
}

export interface Gift {
  id: string;
  personId: string;
  idea: string;
  url: string;
  status: GiftStatus;
  year: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonDetail {
  person: Person;
  gifts: Gift[];
}

export interface PersonFields {
  name: string;
  occasion: Occasion;
  month: number;
  day: number;
  year: number | null;
  relation: Relation;
  notes: string;
  remindDays: number;
}

export interface GiftFields {
  idea: string;
  url: string;
  status: GiftStatus;
}

export interface ImportReport {
  added: number;
  already: number;
  withoutDate: number;
}

export const api = {
  list: (today: string) => invoke<Person[]>("birthdays_list", { today }),
  get: (id: string, today: string) => invoke<PersonDetail>("birthdays_get", { id, today }),
  create: (fields: PersonFields, today: string) => invoke<Person>("birthdays_create", { fields, today }),
  update: (id: string, fields: PersonFields, today: string) => invoke<Person>("birthdays_update", { id, fields, today }),
  remove: (id: string) => invoke<void>("birthdays_delete", { id }),
  addGift: (personId: string, fields: GiftFields, today: string) => invoke<Gift>("birthdays_gift_add", { personId, fields, today }),
  updateGift: (id: string, fields: GiftFields, today: string) => invoke<Gift>("birthdays_gift_update", { id, fields, today }),
  removeGift: (id: string) => invoke<void>("birthdays_gift_delete", { id }),
  importContacts: (text: string, today: string) => invoke<ImportReport>("birthdays_import", { text, today }),
  exportCalendar: (today: string) => invoke<string>("birthdays_export", { today }),
};

export function errorMessage(err: unknown): string {
  return typeof err === "string" ? err : err instanceof Error ? err.message : "Something went wrong. Try again.";
}

export const RELATIONS: { id: Relation; label: string }[] = [
  { id: "family", label: "Family" },
  { id: "friend", label: "Friends" },
  { id: "partner", label: "Partner" },
  { id: "work", label: "Work" },
  { id: "other", label: "Other" },
];

export const REMINDERS: { days: number; label: string }[] = [
  { days: 0, label: "On the day only" },
  { days: 1, label: "A day before" },
  { days: 2, label: "2 days before" },
  { days: 3, label: "3 days before" },
  { days: 7, label: "A week before" },
  { days: 14, label: "2 weeks before" },
  { days: 30, label: "A month before" },
];

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const daysIn = (month: number) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

/** "12 May", or "12 May 1996". */
export const dateOf = (p: { month: number; day: number; year?: number | null }) => `${p.day} ${MONTHS[p.month - 1]}${p.year ? ` ${p.year}` : ""}`;

/** "Today", "Tomorrow", "In 5 days", "In 3 weeks". */
export function countdown(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 21) return `In ${days} days`;
  if (days < 60) return `In ${Math.round(days / 7)} weeks`;
  return `In ${Math.round(days / 30.4)} months`;
}

/** "turns 30", "25 years", or null. */
export function milestone(p: Pick<Person, "occasion" | "turning">): string | null {
  if (p.turning === null) return null;
  return p.occasion === "anniversary" ? `${p.turning} ${p.turning === 1 ? "year" : "years"}` : `turns ${p.turning}`;
}

export const emojiOf = (occasion: Occasion) => (occasion === "anniversary" ? "💍" : "🎂");

// A colour each, picked from the id so it never changes.
const AVATARS = ["#d9534f", "#e8833a", "#d4a72c", "#5aa55a", "#2f9e8f", "#3d8bd4", "#7a5cc7", "#c2549d"];

export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATARS[Math.abs(h) % AVATARS.length];
}

export function initials(name: string): string {
  const words = name.replace(/[&+]/g, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase() || "?";
}

const SIGNS: [number, number, string, string][] = [
  [1, 20, "♑", "Capricorn"],
  [2, 19, "♒", "Aquarius"],
  [3, 21, "♓", "Pisces"],
  [4, 20, "♈", "Aries"],
  [5, 21, "♉", "Taurus"],
  [6, 21, "♊", "Gemini"],
  [7, 23, "♋", "Cancer"],
  [8, 23, "♌", "Leo"],
  [9, 23, "♍", "Virgo"],
  [10, 23, "♎", "Libra"],
  [11, 22, "♏", "Scorpio"],
  [12, 22, "♐", "Sagittarius"],
];

/** The star sign for a birthday: each entry is the sign up to that day. */
export function starSign(month: number, day: number): { symbol: string; name: string } {
  const [, until, symbol, name] = SIGNS[month - 1];
  if (day < until) return { symbol, name };
  const [, , nextSymbol, nextName] = SIGNS[month % 12];
  return { symbol: nextSymbol, name: nextName };
}

export const BIRTHSTONES = ["Garnet", "Amethyst", "Aquamarine", "Diamond", "Emerald", "Pearl", "Ruby", "Peridot", "Sapphire", "Opal", "Topaz", "Turquoise"];
