// University on the web: the desktop's uni_* commands over the synced rows.
// Mirrors src-tauri/src/features/uni/service.rs (teaching weeks, behind and
// coming up, timetable generation, stages).
import { shiftDay } from "../../../site/src/lib/terminal/planner";
import type { SyncRecord } from "../../../site/src/lib/terminal/protocol";
import { newId, rowsOf, save, snapshot, type Edit } from "../runtime";
import type { Handlers } from "./types";

const KINDS = ["lecture", "seminar", "lab", "tutorial"];
const COLORS = ["blue", "teal", "green", "amber", "orange", "red", "pink", "purple", "slate"];
const STAGES = ["attended", "caught_up", "reviewed"];
const MAX_WEEKS = 52;
const UPCOMING_DAYS = 7;

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const opt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const optS = (v: unknown) => (typeof v === "string" && v ? v : null);
const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const now = () => new Date().toISOString();
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const fail = (message: string): never => {
  throw message;
};

type Term = { id: string; name: string; startsOn: string; weeks: number };
const termOf = (r: SyncRecord): Term => ({ id: r.id, name: s(r.data.name), startsOn: s(r.data.starts_on), weeks: Math.max(1, n(r.data.weeks)) });
/** The Monday of week 1. */
const weekOne = (t: Term) => shiftDay(t.startsOn, -((new Date(`${t.startsOn}T12:00:00`).getDay() + 6) % 7));
const endsOn = (t: Term) => shiftDay(weekOne(t), Math.max(1, t.weeks) * 7 - 1);
function weekOf(t: Term, day: string) {
  const days = daysBetween(weekOne(t), day), week = Math.floor(days / 7) + 1;
  return days >= 0 && week <= t.weeks ? week : null;
}
const dayInWeek = (t: Term, week: number, weekday: number) => shiftDay(weekOne(t), Math.max(0, week - 1) * 7 + weekday);
const termCard = (t: Term, today: string) => ({ ...t, endsOn: endsOn(t), week: weekOf(t, today) });

const lectureView = (r: SyncRecord) => ({
  id: r.id, moduleId: s(r.data.module_id), title: s(r.data.title), kind: s(r.data.kind) || "lecture", week: opt(r.data.week), day: optS(r.data.day),
  topics: s(r.data.topics), recorded: !!r.data.recorded, attendedOn: optS(r.data.attended_on), caughtUpOn: optS(r.data.caught_up_on),
  reviewedOn: optS(r.data.reviewed_on), confidence: opt(r.data.confidence), notes: s(r.data.notes), position: n(r.data.position),
});
type Lecture = ReturnType<typeof lectureView>;
const moduleView = (r: SyncRecord) => ({ id: r.id, termId: s(r.data.term_id), code: s(r.data.code), name: s(r.data.name), color: s(r.data.color) || "blue", credits: opt(r.data.credits), link: optS(r.data.link), position: n(r.data.position) });

/** When a lecture should be done by: its day, or failing that the Sunday of its week. */
const due = (l: Lecture, t: Term) => l.day ?? (l.week !== null ? dayInWeek(t, l.week, 6) : null);
const isBehind = (l: Lecture, t: Term, today: string) => !l.caughtUpOn && !!due(l, t) && due(l, t)! < today;
const teachingOrder = (a: Lecture, b: Lecture) =>
  (a.week ?? Infinity) - (b.week ?? Infinity) || (a.day ?? "9999").localeCompare(b.day ?? "9999") || a.position - b.position;

function moduleCard(m: SyncRecord, list: Lecture[], t: Term, today: string) {
  const count = (f: (l: Lecture) => boolean) => list.filter(f).length;
  const caughtUp = count((l) => !!l.caughtUpOn);
  const next = list.filter((l) => l.day && l.day >= today).sort((a, b) => a.day!.localeCompare(b.day!) || a.position - b.position)[0] ?? null;
  return {
    ...moduleView(m), lectures: list.length, attended: count((l) => !!l.attendedOn), caughtUp, reviewed: count((l) => !!l.reviewedOn),
    behind: count((l) => isBehind(l, t, today)), shaky: count((l) => l.confidence === 1), percent: list.length ? (caughtUp / list.length) * 100 : null, next,
  };
}

class Uni {
  constructor(readonly records: SyncRecord[]) {}
  terms = () => rowsOf(this.records, "uni_terms");
  modules = () => rowsOf(this.records, "uni_modules");
  lectures = () => rowsOf(this.records, "uni_lectures");
  term = (id: unknown) => termOf(this.terms().find((t) => t.id === id) ?? fail("That term isn't there any more."));
  module = (id: unknown) => this.modules().find((m) => m.id === id) ?? fail("That module isn't there any more.");
  lecture = (id: unknown) => this.lectures().find((l) => l.id === id) ?? fail("That lecture isn't there any more.");
  lecturesOf = (moduleId: string) => this.lectures().filter((l) => l.data.module_id === moduleId).map(lectureView);
  cards(t: Term, today: string) {
    return this.modules().filter((m) => m.data.term_id === t.id).sort((a, b) => n(a.data.position) - n(b.data.position)).map((m) => moduleCard(m, this.lecturesOf(m.id), t, today));
  }
  card = (moduleId: string, today: string) => {
    const m = this.module(moduleId);
    return moduleCard(m, this.lecturesOf(m.id), this.term(m.data.term_id), today);
  };
  nextLecturePosition = (moduleId: string) => Math.max(0, ...this.lectures().filter((l) => l.data.module_id === moduleId).map((l) => n(l.data.position))) + 1;
}

const uniNow = async () => new Uni((await snapshot()).records);
async function then<T>(edits: Edit[], answer: (u: Uni) => T): Promise<T> {
  await save(edits);
  return answer(await uniNow());
}
const bury = (rows: SyncRecord[], at: string): Edit[] => rows.map((r) => ({ table: r.table, id: r.id, fields: { deleted_at: at } }));

function checkTerm(fields: { name?: string; weeks?: number; startsOn?: string }) {
  const name = String(fields.name ?? "").trim();
  if (!name) fail("Give the term a name.");
  if (!(Number.isInteger(fields.weeks) && fields.weeks! >= 1 && fields.weeks! <= MAX_WEEKS)) fail(`A term has between 1 and ${MAX_WEEKS} weeks.`);
  return name;
}
function checkModule(f: { name?: string; color?: string; credits?: number | null }) {
  if (!String(f.name ?? "").trim()) fail("Give the module a name.");
  if (!COLORS.includes(String(f.color))) fail(`Unknown colour: ${f.color}`);
  if (f.credits !== null && f.credits !== undefined && !(f.credits >= 0 && f.credits <= 1000)) fail("Credits have to be between 0 and 1000.");
}
function checkLecture(f: { title?: string; kind?: string; confidence?: number | null }) {
  const title = String(f.title ?? "").trim();
  if (!title) fail("Give it a title.");
  if (!KINDS.includes(String(f.kind))) fail(`Unknown kind: ${f.kind}`);
  if (f.confidence !== null && f.confidence !== undefined && ![1, 2, 3].includes(f.confidence)) fail("Confidence is shaky, okay or solid.");
  return title;
}
function weekFor(t: Term, week: number | null | undefined, day: string | null | undefined) {
  if (week !== null && week !== undefined && !(week >= 1 && week <= t.weeks)) fail(`${t.name} has weeks 1 to ${t.weeks}.`);
  return (day ? weekOf(t, day) : null) ?? week ?? null;
}

export const uni: Handlers = {
  async uni_summary({ today }) {
    const u = await uniNow();
    const all = u.terms().map(termOf).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    const current =
      all.find((t) => weekOf(t, today) !== null) ??
      all.filter((t) => weekOne(t) <= today).sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0] ??
      all[0];
    if (!current) return { terms: [], current: null, modules: [], behind: [], upcoming: [] };
    const cards = u.cards(current, today);
    const behind = [], upcoming = [];
    for (const c of cards) {
      for (const l of u.lecturesOf(c.id)) {
        const hit = { moduleCode: c.code, moduleName: c.name, moduleColor: c.color };
        if (isBehind(l, current, today)) behind.push({ ...l, ...hit, days: daysBetween(due(l, current) ?? today, today) });
        else if (l.day && l.day >= today && !l.caughtUpOn) {
          const days = daysBetween(today, l.day);
          if (days < UPCOMING_DAYS) upcoming.push({ ...l, ...hit, days });
        }
      }
    }
    behind.sort((a, b) => b.days - a.days || teachingOrder(a, b));
    upcoming.sort((a, b) => a.days - b.days || teachingOrder(a, b));
    return { terms: all.map((t) => termCard(t, today)), current: current.id, modules: cards, behind, upcoming };
  },
  uni_modules: async ({ termId, today }) => {
    const u = await uniNow();
    return u.cards(u.term(termId), today);
  },
  async uni_module({ id, today }) {
    const u = await uniNow(), m = u.module(id), t = u.term(m.data.term_id);
    const list = u.lecturesOf(m.id).sort(teachingOrder);
    return { card: moduleCard(m, list, t, today), term: termCard(t, today), lectures: list };
  },

  async uni_add_term({ fields, today }) {
    const name = checkTerm(fields), id = newId();
    return then([{ table: "uni_terms", id, fields: { id, name, starts_on: fields.startsOn, weeks: fields.weeks, created_at: now(), deleted_at: null } }], (u) => termCard(u.term(id), today));
  },
  async uni_update_term({ id, fields, today }) {
    const name = checkTerm(fields), u = await uniNow();
    u.term(id);
    const updated: Term = { id, name, startsOn: fields.startsOn, weeks: fields.weeks };
    const ids = new Set(u.modules().filter((m) => m.data.term_id === id).map((m) => m.id));
    const edits: Edit[] = [{ table: "uni_terms", id, fields: { name, starts_on: fields.startsOn, weeks: fields.weeks } }];
    // Lectures with a date move to the week it now falls in.
    for (const l of u.lectures().filter((l) => ids.has(s(l.data.module_id)) && l.data.day)) {
      const week = weekOf(updated, s(l.data.day));
      if (week !== opt(l.data.week)) edits.push({ table: l.table, id: l.id, fields: { week } });
    }
    return then(edits, (after) => termCard(after.term(id), today));
  },
  async uni_delete_term({ id }) {
    const u = await uniNow(), at = now(), modules = u.modules().filter((m) => m.data.term_id === id), ids = new Set(modules.map((m) => m.id));
    await save([...bury(u.lectures().filter((l) => ids.has(s(l.data.module_id))), at), ...bury(modules, at), ...bury(u.terms().filter((t) => t.id === id), at)]);
  },

  async uni_add_module({ fields, today }) {
    checkModule(fields);
    const u = await uniNow(), t = u.term(fields.termId), id = newId();
    const position = Math.max(0, ...u.modules().filter((m) => m.data.term_id === t.id).map((m) => n(m.data.position))) + 1;
    return then(
      [{ table: "uni_modules", id, fields: { id, term_id: t.id, code: String(fields.code ?? "").trim(), name: String(fields.name).trim(), color: fields.color, credits: fields.credits ?? null, link: clean(fields.link), position, created_at: now(), deleted_at: null } }],
      (after) => after.card(id, today),
    );
  },
  async uni_update_module({ id, fields, today }) {
    checkModule(fields);
    const u = await uniNow(), m = u.module(id), t = u.term(fields.termId);
    const edits: Edit[] = [{ table: "uni_modules", id, fields: { term_id: t.id, code: String(fields.code ?? "").trim(), name: String(fields.name).trim(), color: fields.color, credits: fields.credits ?? null, link: clean(fields.link) } }];
    // Moving to another term keeps the lectures' weeks, not their dates.
    if (m.data.term_id !== t.id) for (const l of u.lectures().filter((l) => l.data.module_id === id)) edits.push({ table: l.table, id: l.id, fields: { day: null } });
    return then(edits, (after) => after.card(id, today));
  },
  async uni_delete_module({ id }) {
    const u = await uniNow(), at = now();
    await save([...bury(u.lectures().filter((l) => l.data.module_id === id), at), ...bury(u.modules().filter((m) => m.id === id), at)]);
  },

  async uni_add_lecture({ moduleId, fields }) {
    const title = checkLecture(fields), u = await uniNow(), m = u.module(moduleId), t = u.term(m.data.term_id), id = newId();
    return then(
      [{ table: "uni_lectures", id, fields: {
        id, module_id: m.id, title, kind: fields.kind, week: weekFor(t, fields.week, fields.day), day: fields.day ?? null, topics: String(fields.topics ?? "").trim(),
        recorded: !!fields.recorded, attended_on: null, caught_up_on: null, reviewed_on: null, confidence: fields.confidence ?? null, notes: String(fields.notes ?? ""),
        position: u.nextLecturePosition(m.id), created_at: now(), deleted_at: null,
      } }],
      (after) => lectureView(after.lecture(id)),
    );
  },
  async uni_add_schedule({ moduleId, schedule }) {
    if (!KINDS.includes(schedule.kind)) fail(`Unknown kind: ${schedule.kind}`);
    const u = await uniNow(), m = u.module(moduleId), t = u.term(m.data.term_id);
    const weekdays: number[] = [...new Set<number>(schedule.weekdays ?? [])].sort((a, b) => a - b);
    if (!weekdays.length || weekdays.some((d) => d > 6 || d < 0)) fail("Pick the days it's on.");
    if (schedule.fromWeek < 1 || schedule.toWeek > t.weeks || schedule.fromWeek > schedule.toWeek) fail(`Pick weeks between 1 and ${t.weeks}.`);
    const title = String(schedule.title ?? "").trim() || schedule.kind.charAt(0).toUpperCase() + schedule.kind.slice(1);
    let number = u.lectures().filter((l) => l.data.module_id === moduleId && l.data.kind === schedule.kind).length;
    let position = u.nextLecturePosition(moduleId);
    const edits: Edit[] = [], at = now();
    for (let week = schedule.fromWeek; week <= schedule.toWeek; week++) {
      if ((schedule.skipWeeks ?? []).includes(week)) continue;
      for (const weekday of weekdays) {
        const id = newId();
        edits.push({ table: "uni_lectures", id, fields: {
          id, module_id: m.id, title: `${title} ${++number}`, kind: schedule.kind, week, day: dayInWeek(t, week, weekday), topics: "", recorded: !!schedule.recorded,
          attended_on: null, caught_up_on: null, reviewed_on: null, confidence: null, notes: "", position: position++, created_at: at, deleted_at: null,
        } });
      }
    }
    const ids = edits.map((e) => e.id);
    return then(edits, (after) => ids.map((id) => lectureView(after.lecture(id))));
  },
  async uni_update_lecture({ id, fields }) {
    const title = checkLecture(fields), u = await uniNow(), l = u.lecture(id), m = u.module(l.data.module_id), t = u.term(m.data.term_id);
    return then(
      [{ table: "uni_lectures", id, fields: { title, kind: fields.kind, week: weekFor(t, fields.week, fields.day), day: fields.day ?? null, topics: String(fields.topics ?? "").trim(), recorded: !!fields.recorded, confidence: fields.confidence ?? null, notes: String(fields.notes ?? "") } }],
      (after) => lectureView(after.lecture(id)),
    );
  },
  async uni_set_stage({ id, stage, done, today }) {
    if (!STAGES.includes(stage)) fail(`Unknown stage: ${stage}`);
    const l = (await uniNow()).lecture(id), on = done ? today : null;
    const fields: SyncRecord["data"] = {};
    if (stage === "attended") fields.attended_on = on;
    else if (stage === "caught_up") {
      fields.caught_up_on = on;
      if (!done) fields.reviewed_on = null;
    } else {
      // Reviewing it means you've caught up on it too.
      fields.reviewed_on = on;
      if (done && !l.data.caught_up_on) fields.caught_up_on = on;
    }
    return then([{ table: "uni_lectures", id, fields }], (after) => lectureView(after.lecture(id)));
  },
  async uni_delete_lecture({ id }) {
    if ((await uniNow()).lectures().some((l) => l.id === id)) await save([{ table: "uni_lectures", id, fields: { deleted_at: now() } }]);
  },

  uni_analytics: () => Promise.reject("University analytics aren't on the web yet."),
};
