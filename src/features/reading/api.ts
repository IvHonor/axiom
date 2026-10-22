// Typed wrappers for the Reading Tracker's Tauri commands.
// Mirrors src-tauri/src/features/reading/{entities,types,library}.rs.
import { invoke } from "@tauri-apps/api/core";

export type Status = "want" | "reading" | "finished" | "dnf";
export type Format = "print" | "ebook" | "audio";
export type Unit = "pages" | "percent" | "minutes";
export type NoteKind = "note" | "quote" | "bookmark";

export interface Book {
  id: string;
  title: string;
  authors: string;
  coverUrl: string | null;
  workKey: string | null;
  editionKey: string | null;
  isbn: string | null;
  publishedYear: number | null;
  /** Page count from Open Library. */
  apiPages: number | null;
  /** Your own page count, which wins over Open Library's. */
  pages: number | null;
  format: Format;
  unit: Unit;
  audioMinutes: number | null;
  status: Status;
  progress: number;
  /** Half stars: 1 to 10. */
  rating: number | null;
  review: string;
  startedOn: string | null;
  finishedOn: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookCard extends Book {
  total: number | null;
  percent: number | null;
  finishEstimate: string | null;
  lastRead: string | null;
  notes: number;
}

export interface Session {
  id: string;
  bookId: string;
  day: string;
  startProgress: number;
  endProgress: number;
  unit: Unit;
  pages: number;
  minutes: number;
}

export interface Note {
  id: string;
  bookId: string;
  kind: NoteKind;
  page: number | null;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface PastRead {
  id: string;
  bookId: string;
  startedOn: string | null;
  finishedOn: string | null;
  outcome: "finished" | "dnf";
  rating: number | null;
}

export interface BookDetail {
  card: BookCard;
  sessions: Session[];
  notes: Note[];
  reads: PastRead[];
}

export interface Found {
  workKey: string;
  editionKey: string | null;
  title: string;
  authors: string;
  year: number | null;
  pages: number | null;
  coverUrl: string | null;
  isbn: string | null;
  editions: number;
}

export interface Edition {
  key: string;
  title: string;
  pages: number | null;
  coverUrl: string | null;
  publisher: string | null;
  published: string | null;
  format: string | null;
  isbn: string | null;
  language: string | null;
}

export interface NewBook {
  title: string;
  authors: string;
  coverUrl?: string | null;
  workKey?: string | null;
  editionKey?: string | null;
  isbn?: string | null;
  publishedYear?: number | null;
  apiPages?: number | null;
  pages?: number | null;
  format: Format;
  unit?: Unit | null;
  audioMinutes?: number | null;
  status: Status;
}

export interface BookFields {
  title: string;
  authors: string;
  coverUrl: string | null;
  pages: number | null;
  format: Format;
  unit: Unit;
  audioMinutes: number | null;
  rating: number | null;
  review: string;
  startedOn: string | null;
  finishedOn: string | null;
}

export interface NoteFields {
  kind: NoteKind;
  page: number | null;
  text: string;
}

export interface NoteHit extends Note {
  bookTitle: string;
  bookAuthors: string;
}

export interface Goal {
  year: number;
  books: number | null;
  finished: number;
  expected: number;
}

export interface ReadingSummary {
  reading: BookCard[];
  goal: Goal;
  streak: number;
  pagesToday: number;
  shelves: Record<Status, number>;
}

export interface FinishedBook {
  bookId: string;
  title: string;
  authors: string;
  coverUrl: string | null;
  finishedOn: string;
  rating: number | null;
  days: number | null;
  outcome: "finished" | "dnf";
}

export interface ReadingStats {
  goal: Goal;
  pages: number;
  listenedMinutes: number;
  readingMinutes: number;
  months: { month: number; books: number; pages: number; minutes: number }[];
  finished: FinishedBook[];
  streak: number;
  longestStreak: number;
  pagesPerDay: number;
  averageRating: number | null;
  averageDays: number | null;
  readingDays: number;
}

export const api = {
  search: (query: string) => invoke<Found[]>("reading_search", { query }),
  editions: (workKey: string) => invoke<Edition[]>("reading_editions", { workKey }),
  cover: (url: string) => invoke<string>("reading_cover", { url }),
  list: (today: string) => invoke<BookCard[]>("reading_list", { today }),
  get: (id: string, today: string) => invoke<BookDetail>("reading_get", { id, today }),
  add: (book: NewBook, today: string) => invoke<BookCard>("reading_add", { book, today }),
  update: (id: string, fields: BookFields, today: string) => invoke<BookCard>("reading_update", { id, fields, today }),
  chooseEdition: (id: string, edition: { editionKey: string; pages: number | null; coverUrl: string | null; isbn: string | null }, today: string) =>
    invoke<BookCard>("reading_choose_edition", { id, edition, today }),
  setStatus: (id: string, status: Status, today: string) => invoke<BookCard>("reading_set_status", { id, status, today }),
  logProgress: (id: string, progress: number, minutes: number | null, today: string) =>
    invoke<BookCard>("reading_log_progress", { id, progress, minutes, today }),
  readAgain: (id: string, today: string) => invoke<BookCard>("reading_read_again", { id, today }),
  move: (id: string, beforeId: string | null, today: string) => invoke<BookCard>("reading_move", { id, beforeId, today }),
  remove: (id: string) => invoke<void>("reading_delete", { id }),
  deleteSession: (id: string) => invoke<void>("reading_delete_session", { id }),
  addNote: (bookId: string, fields: NoteFields) => invoke<Note>("reading_add_note", { bookId, fields }),
  updateNote: (id: string, fields: NoteFields) => invoke<Note>("reading_update_note", { id, fields }),
  deleteNote: (id: string) => invoke<void>("reading_delete_note", { id }),
  searchNotes: (query: string) => invoke<NoteHit[]>("reading_search_notes", { query }),
  setGoal: (year: number, books: number) => invoke<void>("reading_set_goal", { year, books }),
  summary: (today: string) => invoke<ReadingSummary>("reading_summary", { today }),
  stats: (year: number, today: string) => invoke<ReadingStats>("reading_stats", { year, today }),
};

export function errorMessage(err: unknown): string {
  return typeof err === "string" ? err : err instanceof Error ? err.message : "Something went wrong. Try again.";
}

export const STATUSES: { id: Status; label: string; short: string }[] = [
  { id: "reading", label: "Reading", short: "Reading" },
  { id: "want", label: "Want to read", short: "Want" },
  { id: "finished", label: "Finished", short: "Finished" },
  { id: "dnf", label: "Did not finish", short: "DNF" },
];

export const statusLabel = (s: Status) => STATUSES.find((x) => x.id === s)?.label ?? s;

export const FORMATS: { id: Format; label: string }[] = [
  { id: "print", label: "Print" },
  { id: "ebook", label: "Ebook" },
  { id: "audio", label: "Audiobook" },
];

export const KINDS: { id: NoteKind; label: string }[] = [
  { id: "note", label: "Note" },
  { id: "quote", label: "Quote" },
  { id: "bookmark", label: "Bookmark" },
];

/** "3h 20m" from minutes. */
export function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** Where you are, in the book's own unit: "p. 120 of 496", "45%", "3h 20m of 11h". */
export function progressText(b: BookCard): string {
  if (b.unit === "percent") return `${b.progress}%`;
  if (b.unit === "minutes") return b.total ? `${hours(b.progress)} of ${hours(b.total)}` : hours(b.progress);
  return b.total ? `p. ${b.progress} of ${b.total}` : `p. ${b.progress}`;
}

/** The page count in use, and whether it's your own. */
export function pageCount(b: Book): { pages: number | null; yours: boolean } {
  return { pages: b.pages ?? b.apiPages, yours: b.pages !== null };
}

/** "5 stars", "4.5 stars". */
export const starsText = (rating: number) => `${rating / 2} star${rating === 2 ? "" : "s"}`;
