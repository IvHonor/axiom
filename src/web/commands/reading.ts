// Reading on the web: the desktop's reading_* commands over the synced rows.
// Mirrors src-tauri/src/features/reading/service.rs rule for rule (units,
// the day's log adding up, finishing at the end, re-reads, streaks, goals).
import { shiftDay } from "../../../site/src/lib/terminal/planner";
import type { SyncRecord } from "../../../site/src/lib/terminal/protocol";
import { DEMO, newId, rowsOf, save, snapshot, type Edit } from "../runtime";
import type { Handlers } from "./types";

const STATUSES = ["want", "reading", "finished", "dnf"];
const FORMATS = ["print", "ebook", "audio"];
const KINDS = ["note", "quote", "bookmark"];
const PACE_DAYS = 14;
const MAX_PAGES = 100_000;

type Fields = SyncRecord["data"];
const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const opt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const optS = (v: unknown) => (typeof v === "string" && v ? v : null);
const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const now = () => new Date().toISOString();
const fail = (message: string): never => {
  throw message;
};

const pageCount = (b: Fields) => {
  const p = opt(b.pages) ?? opt(b.api_pages);
  return p && p > 0 ? p : null;
};
const totalOf = (b: Fields) => (b.unit === "percent" ? 100 : b.unit === "minutes" ? (n(b.audio_minutes) > 0 ? n(b.audio_minutes) : null) : pageCount(b));
function pagesBetween(b: Fields, start: number, end: number) {
  const gained = Math.max(0, end - start);
  if (b.unit === "pages") return gained;
  if (b.unit === "percent") return pageCount(b) ? Math.round((gained * pageCount(b)!) / 100) : 0;
  return 0;
}
const unitFor = (format: string, unit?: string | null) => (format === "audio" ? "minutes" : format === "ebook" ? (unit === "pages" ? "pages" : "percent") : "pages");
function convert(progress: number, from: string, to: string, pages: number | null) {
  if (from === to) return progress;
  if (from === "pages" && to === "percent" && pages) return Math.min(100, Math.round((progress / pages) * 100));
  if (from === "percent" && to === "pages" && pages) return Math.round((progress * pages) / 100);
  return 0;
}
function checkCount(value: unknown, what: string) {
  if (value === null || value === undefined) return null;
  const v = Number(value);
  if (!Number.isInteger(v) || v < 1 || v > MAX_PAGES) fail(`The ${what} has to be between 1 and ${MAX_PAGES}.`);
  return v;
}

const bookView = (r: SyncRecord) => ({
  id: r.id, title: s(r.data.title), authors: s(r.data.authors), coverUrl: optS(r.data.cover_url), workKey: optS(r.data.work_key), editionKey: optS(r.data.edition_key),
  isbn: optS(r.data.isbn), publishedYear: opt(r.data.published_year), apiPages: opt(r.data.api_pages), pages: opt(r.data.pages), format: s(r.data.format) || "print",
  unit: s(r.data.unit) || "pages", audioMinutes: opt(r.data.audio_minutes), status: s(r.data.status) || "want", progress: n(r.data.progress), rating: opt(r.data.rating),
  review: s(r.data.review), startedOn: optS(r.data.started_on), finishedOn: optS(r.data.finished_on), position: n(r.data.position),
  createdAt: s(r.data.created_at), updatedAt: s(r.data.updated_at),
});
const sessionView = (r: SyncRecord) => ({ id: r.id, bookId: s(r.data.book_id), day: s(r.data.day), startProgress: n(r.data.start_progress), endProgress: n(r.data.end_progress), unit: s(r.data.unit), pages: n(r.data.pages), minutes: n(r.data.minutes) });
const noteView = (r: SyncRecord) => ({ id: r.id, bookId: s(r.data.book_id), kind: s(r.data.kind), page: opt(r.data.page), text: s(r.data.text), createdAt: s(r.data.created_at), updatedAt: s(r.data.updated_at) });
const readView = (r: SyncRecord) => ({ id: r.id, bookId: s(r.data.book_id), startedOn: optS(r.data.started_on), finishedOn: optS(r.data.finished_on), outcome: s(r.data.outcome), rating: opt(r.data.rating) });

class Library {
  constructor(readonly records: SyncRecord[]) {}
  books = () => rowsOf(this.records, "reading_books");
  sessions = () => rowsOf(this.records, "reading_sessions");
  notes = () => rowsOf(this.records, "reading_notes");
  reads = () => rowsOf(this.records, "reading_reads");
  find(id: unknown) {
    return this.books().find((b) => b.id === id) ?? fail("That book isn't in your library any more.");
  }

  /** When you'll finish at your pace over the last two weeks. */
  estimate(b: Fields, logged: SyncRecord[], today: string) {
    if (b.status !== "reading") return null;
    const total = totalOf(b);
    if (total === null) return null;
    const remaining = total - n(b.progress);
    if (remaining <= 0) return null;
    const since = shiftDay(today, -(PACE_DAYS - 1));
    const recent = logged.filter((x) => s(x.data.day) >= since && s(x.data.day) <= today && x.data.unit === b.unit);
    const gained = recent.reduce((sum, x) => sum + Math.max(0, n(x.data.end_progress) - n(x.data.start_progress)), 0);
    if (!recent.length || gained <= 0) return null;
    const first = recent.map((x) => s(x.data.day)).sort()[0];
    const span = Math.max(1, daysBetween(first, today) + 1);
    return shiftDay(today, Math.min(3650, Math.ceil(remaining / (gained / span))));
  }

  card(r: SyncRecord, today: string) {
    const mine = this.sessions().filter((x) => x.data.book_id === r.id);
    const total = totalOf(r.data);
    return {
      ...bookView(r),
      total,
      percent: total ? Math.min(100, Math.max(0, (n(r.data.progress) / total) * 100)) : null,
      finishEstimate: this.estimate(r.data, mine, today),
      lastRead: mine.map((x) => s(x.data.day)).sort().at(-1) ?? null,
      notes: this.notes().filter((x) => x.data.book_id === r.id).length,
    };
  }

  list(today: string) {
    const rank = (status: string) => Math.min(2, STATUSES.indexOf(status) < 0 ? 9 : STATUSES.indexOf(status));
    return this.books()
      .map((b) => this.card(b, today))
      .sort((a, b) => {
        const byRank = rank(a.status) - rank(b.status);
        if (byRank) return byRank;
        if (a.status === "reading") return (b.lastRead ?? "").localeCompare(a.lastRead ?? "") || b.updatedAt.localeCompare(a.updatedAt);
        if (a.status === "want") return a.position - b.position;
        return (b.finishedOn ?? "").localeCompare(a.finishedOn ?? "") || b.updatedAt.localeCompare(a.updatedAt);
      });
  }

  nextPosition = () => Math.max(0, ...this.books().map((b) => n(b.data.position))) + 1;

  /** Days you read on, from the log. */
  readingDays() {
    return new Set(this.sessions().filter((x) => n(x.data.pages) > 0 || n(x.data.minutes) > 0 || n(x.data.end_progress) > n(x.data.start_progress)).map((x) => s(x.data.day)));
  }

  finishedIn(year: number) {
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const inYear = (d: unknown) => (typeof d === "string" && d >= from && d <= to ? d : null);
    const days = (start: unknown, end: string) => (typeof start === "string" && start ? Math.max(0, daysBetween(start, end)) + 1 : null);
    const books = this.books();
    const done = books
      .filter((b) => b.data.status === "finished" || b.data.status === "dnf")
      .flatMap((b) => {
        const on = inYear(b.data.finished_on);
        return on ? [{ bookId: b.id, title: s(b.data.title), authors: s(b.data.authors), coverUrl: optS(b.data.cover_url), finishedOn: on, rating: opt(b.data.rating), days: days(b.data.started_on, on), outcome: s(b.data.status) }] : [];
      });
    for (const r of this.reads()) {
      const b = books.find((x) => x.id === r.data.book_id), on = inYear(r.data.finished_on);
      if (b && on) done.push({ bookId: b.id, title: s(b.data.title), authors: s(b.data.authors), coverUrl: optS(b.data.cover_url), finishedOn: on, rating: opt(r.data.rating), days: days(r.data.started_on, on), outcome: s(r.data.outcome) });
    }
    return done.sort((a, b) => b.finishedOn.localeCompare(a.finishedOn));
  }

  goal(year: number, finished: number, today: string) {
    const row = rowsOf(this.records, "reading_goals").find((g) => g.id === String(year));
    const target = row ? n(row.data.books) : null;
    const from = `${year}-01-01`, to = `${year}-12-31`, length = daysBetween(from, to) + 1;
    const elapsed = today < from ? 0 : today > to ? length : daysBetween(from, today) + 1;
    return { year, books: target, finished, expected: target ? (target * elapsed) / length : 0 };
  }
}

function currentStreak(days: Set<string>, today: string) {
  let day = days.has(today) ? today : shiftDay(today, -1), streak = 0;
  while (days.has(day)) {
    streak++;
    day = shiftDay(day, -1);
  }
  return streak;
}
function longestStreak(days: Set<string>) {
  let best = 0, run = 0, last: string | null = null;
  for (const day of [...days].sort()) {
    run = last && daysBetween(last, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    last = day;
  }
  return best;
}

const library = async () => new Library((await snapshot()).records);
/** Saves, then answers from the library as it now is. */
async function then<T>(edits: Edit[], answer: (l: Library) => T): Promise<T> {
  await save(edits);
  return answer(await library());
}

function checkNote(fields: { kind?: string; page?: number | null; text?: string }) {
  if (!KINDS.includes(String(fields.kind))) fail(`Unknown kind of note: ${fields.kind}`);
  const text = String(fields.text ?? "").trim();
  const page = typeof fields.page === "number" && fields.page > 0 ? fields.page : null;
  if (fields.kind === "bookmark" && page === null) fail("Say which page to bookmark.");
  if (fields.kind !== "bookmark" && !text) fail(fields.kind === "quote" ? "Type the quote first." : "Write the note first.");
  return { text, page };
}

async function books<T>(op: string, body: Record<string, unknown>): Promise<T> {
  if (DEMO) throw "Open Library can't be reached in demo mode.";
  const answer = await fetch("/api/terminal/books", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ op, ...body }) }).catch(() => null);
  if (!answer) throw "Couldn't reach Open Library. Check your internet connection and try again.";
  const result = await answer.json().catch(() => ({}));
  if (!answer.ok) throw result.message ?? "Couldn't reach Open Library. Try again later.";
  return result.data as T;
}

export const reading: Handlers = {
  reading_search: ({ query }) => books("search", { query }),
  reading_editions: ({ workKey }) => books("editions", { workKey }),
  reading_cover: ({ url }) => books("cover", { url }),

  reading_list: async ({ today }) => (await library()).list(today),
  async reading_get({ id, today }) {
    const l = await library(), b = l.find(id);
    return {
      card: l.card(b, today),
      sessions: l.sessions().filter((x) => x.data.book_id === id).sort((a, b) => s(b.data.day).localeCompare(s(a.data.day)) || s(b.data.created_at).localeCompare(s(a.data.created_at))).map(sessionView),
      notes: l.notes().filter((x) => x.data.book_id === id).sort((a, b) => s(a.data.created_at).localeCompare(s(b.data.created_at))).sort((a, b) => (opt(a.data.page) ?? Infinity) - (opt(b.data.page) ?? Infinity)).map(noteView),
      reads: l.reads().filter((x) => x.data.book_id === id).sort((a, b) => s(b.data.finished_on).localeCompare(s(a.data.finished_on))).map(readView),
    };
  },

  async reading_add({ book, today }) {
    const l = await library(), title = String(book.title ?? "").trim();
    if (!title) fail("Give the book a title.");
    if (!FORMATS.includes(book.format)) fail(`Unknown format: ${book.format}`);
    if (!STATUSES.includes(book.status)) fail(`Unknown shelf: ${book.status}`);
    const workKey = clean(book.workKey);
    const dup = workKey && l.books().find((b) => b.data.work_key === workKey);
    if (dup) fail(`“${s(dup.data.title)}” is already in your library.`);
    const at = now(), id = newId();
    const fields: Fields = {
      id, title, authors: String(book.authors ?? "").trim(), cover_url: clean(book.coverUrl), work_key: workKey, edition_key: clean(book.editionKey), isbn: clean(book.isbn),
      published_year: book.publishedYear ?? null, api_pages: typeof book.apiPages === "number" && book.apiPages >= 1 && book.apiPages <= MAX_PAGES ? book.apiPages : null,
      pages: checkCount(book.pages, "page count"), format: book.format, unit: unitFor(book.format, book.unit), audio_minutes: checkCount(book.audioMinutes, "length"),
      status: book.status, progress: 0, rating: null, review: "", started_on: book.status !== "want" ? today : null,
      finished_on: book.status === "finished" || book.status === "dnf" ? today : null, position: l.nextPosition(), created_at: at, deleted_at: null,
    };
    if (book.status === "finished") fields.progress = totalOf(fields) ?? 0;
    return then([{ table: "reading_books", id, fields }], (after) => after.card(after.find(id), today));
  },

  async reading_update({ id, fields: f, today }) {
    const title = String(f.title ?? "").trim();
    if (!title) fail("Give the book a title.");
    if (!FORMATS.includes(f.format)) fail(`Unknown format: ${f.format}`);
    if (f.rating !== null && f.rating !== undefined && !(f.rating >= 1 && f.rating <= 10)) fail("Ratings go from half a star to five stars.");
    if (f.startedOn && f.finishedOn && f.finishedOn < f.startedOn) fail("The finish date is before the start date.");
    const b = (await library()).find(id);
    const unit = unitFor(f.format, f.unit), pages = checkCount(f.pages, "page count");
    const next: Fields = {
      title, authors: String(f.authors ?? "").trim(), cover_url: clean(f.coverUrl), pages, format: f.format, unit, audio_minutes: checkCount(f.audioMinutes, "length"),
      rating: f.rating ?? null, review: String(f.review ?? ""), started_on: f.startedOn ?? null, finished_on: f.finishedOn ?? null,
      progress: convert(n(b.data.progress), s(b.data.unit), unit, pages ?? opt(b.data.api_pages)),
    };
    // A shorter page count can't leave you past the end.
    const total = totalOf({ ...b.data, ...next });
    if (total !== null && n(next.progress) > total) next.progress = total;
    return then([{ table: "reading_books", id, fields: next }], (l) => l.card(l.find(id), today));
  },

  async reading_choose_edition({ id, edition, today }) {
    (await library()).find(id);
    const fields: Fields = { edition_key: String(edition.editionKey) };
    if (typeof edition.pages === "number" && edition.pages >= 1 && edition.pages <= MAX_PAGES) fields.api_pages = edition.pages;
    if (clean(edition.coverUrl)) fields.cover_url = clean(edition.coverUrl);
    if (clean(edition.isbn)) fields.isbn = clean(edition.isbn);
    return then([{ table: "reading_books", id, fields }], (l) => l.card(l.find(id), today));
  },

  async reading_set_status({ id, status, today }) {
    if (!STATUSES.includes(status)) fail(`Unknown shelf: ${status}`);
    const l = await library(), b = l.find(id);
    if (b.data.status === status) return l.card(b, today);
    const started = optS(b.data.started_on) ?? today;
    const fields: Fields = { status, position: status === "want" ? l.nextPosition() : n(b.data.position) };
    if (status === "want") Object.assign(fields, { started_on: null, finished_on: null });
    else if (status === "reading") Object.assign(fields, { started_on: started, finished_on: null });
    else {
      Object.assign(fields, { started_on: started, finished_on: today });
      if (status === "finished" && totalOf(b.data) !== null) fields.progress = totalOf(b.data);
    }
    return then([{ table: "reading_books", id, fields }], (after) => after.card(after.find(id), today));
  },

  async reading_log_progress({ id, progress, minutes, today }) {
    const l = await library(), b = l.find(id), total = totalOf(b.data);
    const value = total === null ? Math.max(0, Number(progress) || 0) : Math.min(total, Math.max(0, Number(progress) || 0));
    const spentNow = Math.min(24 * 60, Math.max(0, Number(minutes) || 0));
    if (value === n(b.data.progress) && spentNow === 0) return l.card(b, today);
    const audio = b.data.unit === "minutes", at = now(), edits: Edit[] = [];
    const sameDay = l.sessions().find((x) => x.data.book_id === id && x.data.day === today && x.data.unit === b.data.unit);
    if (sameDay) {
      const start = n(sameDay.data.start_progress);
      edits.push({ table: "reading_sessions", id: sameDay.id, fields: { end_progress: value, pages: pagesBetween(b.data, start, value), minutes: audio ? Math.max(0, value - start) : n(sameDay.data.minutes) + spentNow } });
    } else {
      const sid = newId(), from = n(b.data.progress);
      edits.push({ table: "reading_sessions", id: sid, fields: { id: sid, book_id: id, day: today, start_progress: from, end_progress: value, unit: s(b.data.unit), pages: pagesBetween(b.data, from, value), minutes: audio ? Math.max(0, value - from) : spentNow, created_at: at, deleted_at: null } });
    }
    const reachedEnd = total !== null && value >= total;
    const was = s(b.data.status);
    const status = (was === "want" || was === "reading") && reachedEnd ? "finished" : was === "want" ? "reading" : was;
    edits.push({
      table: "reading_books", id,
      fields: { progress: value, status, started_on: optS(b.data.started_on) ?? (status !== "want" ? today : null), finished_on: status === "finished" && was !== "finished" ? today : optS(b.data.finished_on) },
    });
    return then(edits, (after) => after.card(after.find(id), today));
  },

  async reading_read_again({ id, today }) {
    const b = (await library()).find(id);
    if (b.data.status !== "finished" && b.data.status !== "dnf") fail("Only a finished book can be read again.");
    const rid = newId();
    return then(
      [
        { table: "reading_reads", id: rid, fields: { id: rid, book_id: id, started_on: optS(b.data.started_on), finished_on: optS(b.data.finished_on), outcome: s(b.data.status), rating: opt(b.data.rating), created_at: now(), deleted_at: null } },
        { table: "reading_books", id, fields: { status: "reading", progress: 0, started_on: today, finished_on: null } },
      ],
      (l) => l.card(l.find(id), today),
    );
  },

  async reading_move({ id, beforeId, today }) {
    const l = await library();
    l.find(id);
    const shelf = l.books().filter((b) => b.data.status === "want" && b.id !== id).sort((a, b) => n(a.data.position) - n(b.data.position));
    const at = beforeId ? shelf.findIndex((b) => b.id === beforeId) : -1;
    const position = at === 0 ? n(shelf[0].data.position) - 1 : at > 0 ? (n(shelf[at - 1].data.position) + n(shelf[at].data.position)) / 2 : shelf.length ? n(shelf.at(-1)!.data.position) + 1 : 1;
    return then([{ table: "reading_books", id, fields: { position } }], (after) => after.card(after.find(id), today));
  },

  async reading_delete({ id }) {
    const l = await library(), at = now();
    l.find(id);
    const bury = (rows: SyncRecord[]) => rows.map((r) => ({ table: r.table, id: r.id, fields: { deleted_at: at } }));
    await save([...bury(l.sessions().filter((x) => x.data.book_id === id)), ...bury(l.notes().filter((x) => x.data.book_id === id)), ...bury(l.reads().filter((x) => x.data.book_id === id)), ...bury(l.books().filter((b) => b.id === id))]);
  },
  async reading_delete_session({ id }) {
    if ((await library()).sessions().some((x) => x.id === id)) await save([{ table: "reading_sessions", id, fields: { deleted_at: now() } }]);
  },

  async reading_add_note({ bookId, fields }) {
    (await library()).find(bookId);
    const { text, page } = checkNote(fields), id = newId();
    return then([{ table: "reading_notes", id, fields: { id, book_id: bookId, kind: fields.kind, page, text, created_at: now(), deleted_at: null } }], (l) => noteView(l.notes().find((x) => x.id === id)!));
  },
  async reading_update_note({ id, fields }) {
    const { text, page } = checkNote(fields);
    if (!(await library()).notes().some((x) => x.id === id)) fail("That note isn't there any more.");
    return then([{ table: "reading_notes", id, fields: { kind: fields.kind, page, text } }], (l) => noteView(l.notes().find((x) => x.id === id)!));
  },
  async reading_delete_note({ id }) {
    if ((await library()).notes().some((x) => x.id === id)) await save([{ table: "reading_notes", id, fields: { deleted_at: now() } }]);
  },
  async reading_search_notes({ query }) {
    const l = await library(), words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    return l
      .notes()
      .sort((a, b) => s(b.data.created_at).localeCompare(s(a.data.created_at)))
      .flatMap((x) => {
        const b = l.books().find((book) => book.id === x.data.book_id);
        if (!b) return [];
        const haystack = `${s(x.data.text)} ${s(b.data.title)} ${s(b.data.authors)}`.toLowerCase();
        return words.every((w) => haystack.includes(w)) ? [{ ...noteView(x), bookTitle: s(b.data.title), bookAuthors: s(b.data.authors) }] : [];
      })
      .slice(0, 500);
  },

  async reading_set_goal({ year, books: target }) {
    const id = String(year), found = (await snapshot()).allRecords.find((r) => r.table === "reading_goals" && r.id === id);
    if (Number(target) <= 0) {
      if (found && !found.data.deleted_at) await save([{ table: "reading_goals", id, fields: { deleted_at: now() } }]);
      return;
    }
    const books = Math.min(1000, Math.round(Number(target)));
    await save([{ table: "reading_goals", id, fields: found ? { books, deleted_at: null } : { id, year: Number(year), books, created_at: now(), deleted_at: null } }]);
  },

  async reading_summary({ today }) {
    const l = await library(), all = l.list(today);
    const shelves = { want: 0, reading: 0, finished: 0, dnf: 0 };
    for (const c of all) shelves[(c.status in shelves ? c.status : "dnf") as keyof typeof shelves]++;
    const year = Number(today.slice(0, 4));
    const finished = l.finishedIn(year).filter((f) => f.outcome === "finished").length;
    return {
      reading: all.filter((c) => c.status === "reading"),
      goal: l.goal(year, finished, today),
      streak: currentStreak(l.readingDays(), today),
      pagesToday: l.sessions().filter((x) => x.data.day === today).reduce((sum, x) => sum + n(x.data.pages), 0),
      shelves,
    };
  },

  async reading_stats({ year, today }) {
    const l = await library(), from = `${year}-01-01`, to = `${year}-12-31`;
    const logged = l.sessions().filter((x) => s(x.data.day) >= from && s(x.data.day) <= to);
    const finished = l.finishedIn(year), completed = finished.filter((f) => f.outcome === "finished");
    const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, books: 0, pages: 0, minutes: 0 }));
    for (const x of logged) {
      const m = months[Number(s(x.data.day).slice(5, 7)) - 1];
      m.pages += n(x.data.pages);
      m.minutes += n(x.data.minutes);
    }
    for (const f of completed) months[Number(f.finishedOn.slice(5, 7)) - 1].books++;
    const days = l.readingDays(), monthAgo = shiftDay(today, -29);
    const recentPages = l.sessions().filter((x) => s(x.data.day) >= monthAgo && s(x.data.day) <= today).reduce((sum, x) => sum + n(x.data.pages), 0);
    const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
    return {
      goal: l.goal(year, completed.length, today),
      pages: logged.reduce((sum, x) => sum + n(x.data.pages), 0),
      listenedMinutes: logged.filter((x) => x.data.unit === "minutes").reduce((sum, x) => sum + n(x.data.minutes), 0),
      readingMinutes: logged.filter((x) => x.data.unit !== "minutes").reduce((sum, x) => sum + n(x.data.minutes), 0),
      months,
      streak: currentStreak(days, today),
      longestStreak: longestStreak(days),
      pagesPerDay: recentPages / 30,
      averageRating: avg(completed.flatMap((f) => (f.rating ? [f.rating / 2] : []))),
      averageDays: avg(completed.flatMap((f) => (f.days !== null ? [f.days] : []))),
      readingDays: [...days].filter((d) => d >= from && d <= to).length,
      finished,
    };
  },

  reading_analytics: () => Promise.reject("Reading analytics aren't on the web yet."),
};
