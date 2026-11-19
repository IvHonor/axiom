// The Reading Tracker's days on the web, from the synced rows: the same numbers
// as src-tauri/src/features/reading/analytics.rs. No imports from the web
// runtime, so the tests can run it directly.
import { dayKey } from "../../features/playground/stats.ts";

type Days = Record<string, number>;
export interface ReadingRow { id: string; data: Record<string, unknown> }
export interface ReadingRows { books: ReadingRow[]; sessions: ReadingRow[]; notes: ReadingRow[]; reads: ReadingRow[] }

const MINUTES_PER_PAGE = 1.5;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
const localDay = (iso: unknown) => (typeof iso === "string" && !Number.isNaN(Date.parse(iso)) ? dayKey(new Date(iso)) : null);
const add = (days: Days, day: unknown, n: number) => {
  if (isDay(day) && n > 0) days[day.slice(0, 10)] = (days[day.slice(0, 10)] ?? 0) + n;
};
const pageCount = (book: ReadingRow | undefined) => {
  if (!book) return 0;
  const pages = book.data.pages ?? book.data.api_pages;
  return Math.max(0, num(pages));
};

/** Recognises one particular book without spelling its title out here. */
export function isQuietBook(title: unknown) {
  if (typeof title !== "string") return false;
  let hash = 0x811c9dc5;
  for (const c of title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18)) hash = Math.imul(hash ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return hash === 1999055078;
}

export function readingDays({ books, sessions, notes, reads }: ReadingRows): Record<string, Days> {
  const quietStarted: Days = {}, quietFinished: Days = {};
  const pages: Days = {}, finished: Days = {}, readPages: Days = {}, activeDays: Days = {}, longest: Days = {}, rereads: Days = {}, reviews: Days = {}, saved: Days = {};
  const formats: Record<string, Days> = { print: {}, ebook: {}, audio: {} };

  const listened: Days = {};
  for (const s of sessions) {
    const read = num(s.data.pages), heard = s.data.unit === "minutes" ? num(s.data.minutes) : 0;
    add(pages, s.data.day, read);
    add(readPages, s.data.day, read);
    add(listened, s.data.day, heard);
    if (isDay(s.data.day) && (read > 0 || heard > 0)) activeDays[s.data.day.slice(0, 10)] = 1;
  }
  for (const [day, minutes] of Object.entries(listened)) add(readPages, day, Math.round(minutes / MINUTES_PER_PAGE));

  // A book's current finish is on the book; `reads` keeps only its earlier ones.
  const byId = new Map(books.map((book) => [book.id, book]));
  const finishes = [
    ...books.filter((b) => b.data.status === "finished").map((b) => ({ book: b.id, day: b.data.finished_on })),
    ...reads.filter((r) => r.data.outcome === "finished").map((r) => ({ book: String(r.data.book_id), day: r.data.finished_on })),
  ].flatMap((f) => (isDay(f.day) ? [{ book: f.book, day: f.day.slice(0, 10) }] : []));
  const seen = new Set<string>();
  for (const { book, day } of [...finishes].sort((a, b) => a.day.localeCompare(b.day))) {
    add(finished, day, 1);
    if (isQuietBook(byId.get(book)?.data.title)) add(quietFinished, day, 1);
    if (seen.has(book)) add(rereads, day, 1);
    seen.add(book);
    const row = byId.get(book), format = row?.data.format;
    if (typeof format === "string" && formats[format]) add(formats[format], day, 1);
    longest[day] = Math.max(longest[day] ?? 0, pageCount(row));
    if (!longest[day]) delete longest[day];
  }
  for (const b of books) {
    if (isQuietBook(b.data.title) && b.data.status !== "want") add(quietStarted, isDay(b.data.started_on) ? b.data.started_on : localDay(b.data.updated_at), 1);
    if (b.data.rating !== null && b.data.rating !== undefined && typeof b.data.review === "string" && b.data.review.trim()) {
      add(reviews, isDay(b.data.finished_on) ? b.data.finished_on : localDay(b.data.updated_at), 1);
    }
  }
  for (const n of notes) if (n.data.kind === "note" || n.data.kind === "quote") add(saved, localDay(n.data.created_at), 1);

  return {
    "reading.pages": pages, "reading.books": finished, "reading.read_pages": readPages, "reading.active_days": activeDays,
    "reading.finished_print": formats.print, "reading.finished_ebook": formats.ebook, "reading.finished_audio": formats.audio,
    "reading.longest": longest, "reading.rereads": rereads, "reading.reviews": reviews, "reading.notes": saved,
    "reading.quiet_started": quietStarted, "reading.quiet_finished": quietFinished,
  };
}
