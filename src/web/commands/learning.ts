// Learning on the web: the desktop's learning_* commands over the synced
// rows. Mirrors src-tauri/src/features/learning/service.rs (tallies,
// headings, pace, spaced review, finishing a source) and the pasted-text
// half of outline.rs. Reading chapters out of EPUB/PDF files and YouTube
// playlists stay on the desktop for now.
import { shiftDay } from "../../../site/src/lib/terminal/planner";
import type { SyncRecord } from "../../../site/src/lib/terminal/protocol";
import { newId, rowsOf, save, snapshot, type Edit } from "../runtime";
import type { Handlers } from "./types";

const KINDS = ["book", "course", "video", "other"];
const COLORS = ["blue", "teal", "green", "amber", "orange", "red", "pink", "purple", "slate"];
const REVIEW_DAYS = [3, 7, 30];
const PACE_DAYS = 28;
const HISTORY_DAYS = 14;
const MAX_UNITS_PER_SOURCE = 3000;
const MAX_TITLE = 300;

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const opt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const optS = (v: unknown) => (typeof v === "string" && v ? v : null);
const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const title = (v: unknown) => [...String(v ?? "").trim()].slice(0, MAX_TITLE).join("");
const positive = (v: unknown) => (typeof v === "number" && v > 0 ? Math.round(v) : null);
const now = () => new Date().toISOString();
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const fail = (message: string): never => {
  throw message;
};
const defaultUnitName = (kind: string) => ({ book: "chapter", course: "lecture", video: "video" })[kind] ?? "part";

const skillView = (r: SyncRecord) => ({ id: r.id, name: s(r.data.name), icon: s(r.data.icon), color: s(r.data.color) || "blue", why: s(r.data.why), archived: !!r.data.archived, position: n(r.data.position) });
const sourceView = (r: SyncRecord) => ({
  id: r.id, skillId: s(r.data.skill_id), kind: s(r.data.kind) || "other", title: s(r.data.title), author: s(r.data.author), link: optS(r.data.link),
  coverUrl: optS(r.data.cover_url), unitName: s(r.data.unit_name), finishBy: optS(r.data.finish_by), finishedOn: optS(r.data.finished_on), notes: s(r.data.notes), position: n(r.data.position),
});
const unitView = (r: SyncRecord) => ({
  id: r.id, sourceId: s(r.data.source_id), title: s(r.data.title), level: n(r.data.level), minutes: opt(r.data.minutes), page: opt(r.data.page),
  doneOn: optS(r.data.done_on), reviewStage: n(r.data.review_stage), reviewOn: optS(r.data.review_on), notes: s(r.data.notes), position: n(r.data.position),
});
const sessionView = (r: SyncRecord) => ({ id: r.id, sourceId: s(r.data.source_id), day: s(r.data.day), minutes: n(r.data.minutes), note: s(r.data.note) });
type Unit = ReturnType<typeof unitView>;
type Session = ReturnType<typeof sessionView>;

/** Which units are headings: those with deeper units right after them. */
const headings = (list: Unit[]) => list.map((u, i) => i + 1 < list.length && list[i + 1].level > u.level);

function tally(list: Unit[], spent: Session[], today: string) {
  const heading = headings(list), counted = list.filter((_, i) => !heading[i]);
  const total = counted.length, done = counted.filter((u) => u.doneOn).length, weekAgo = shiftDay(today, -6);
  return {
    done, total, percent: total ? (done / total) * 100 : null,
    reviews: list.filter((u) => u.reviewOn && u.reviewOn <= today).length,
    weekMinutes: spent.filter((x) => x.day >= weekAgo && x.day <= today).reduce((a, x) => a + x.minutes, 0),
    totalMinutes: spent.reduce((a, x) => a + x.minutes, 0),
  };
}

function sourceCard(src: SyncRecord, list: Unit[], spent: Session[], today: string) {
  const t = tally(list, spent, today), heading = headings(list);
  const next = list.find((u, i) => !heading[i] && !u.doneOn)?.title ?? null;
  const lastStudied = [...spent.map((x) => x.day), ...list.flatMap((u) => (u.doneOn ? [u.doneOn] : []))].sort().at(-1) ?? null;
  const remaining = t.total - t.done, since = shiftDay(today, -(PACE_DAYS - 1));
  const recent = list.filter((u) => u.doneOn && u.doneOn >= since).length;
  const finishBy = optS(src.data.finish_by);
  return {
    ...sourceView(src), tally: t, next, lastStudied,
    expected: remaining > 0 && recent > 0 ? shiftDay(today, Math.ceil(remaining / (recent / PACE_DAYS))) : null,
    neededPerWeek: finishBy && remaining > 0 ? remaining / (Math.max(1, daysBetween(today, finishBy)) / 7) : null,
  };
}

class All {
  constructor(readonly records: SyncRecord[]) {}
  skills = () => rowsOf(this.records, "learning_skills").sort((a, b) => n(a.data.position) - n(b.data.position));
  sources = () => rowsOf(this.records, "learning_sources").sort((a, b) => n(a.data.position) - n(b.data.position));
  unitRows = () => rowsOf(this.records, "learning_units");
  sessionRows = () => rowsOf(this.records, "learning_sessions");
  unitsOf = (sourceId: string) => this.unitRows().filter((u) => u.data.source_id === sourceId).sort((a, b) => n(a.data.position) - n(b.data.position)).map(unitView);
  sessionsOf = (sourceId: string) => this.sessionRows().filter((x) => x.data.source_id === sourceId).map(sessionView);
  card = (src: SyncRecord, today: string) => sourceCard(src, this.unitsOf(src.id), this.sessionsOf(src.id), today);
  skill = (id: unknown) => this.skills().find((x) => x.id === id) ?? fail("That skill isn't there any more.");
  source = (id: unknown) => this.sources().find((x) => x.id === id) ?? fail("That source isn't there any more.");
  unit = (id: unknown) => this.unitRows().find((x) => x.id === id) ?? fail("That isn't there any more.");

  /** Marks a source finished once every unit's done, and unfinished if one's undone. */
  settle(sourceId: string, today: string): Edit[] {
    const src = this.source(sourceId), t = tally(this.unitsOf(sourceId), [], today);
    const finished = t.total > 0 && t.done === t.total;
    return finished === !!src.data.finished_on ? [] : [{ table: src.table, id: src.id, fields: { finished_on: finished ? today : null } }];
  }
}

const everything = async () => new All((await snapshot()).records);
/** Saves `edits`, then whatever settling they lead to, then answers. */
async function then<T>(edits: Edit[], answer: (a: All) => T, settle?: { sourceId: string; today: string }): Promise<T> {
  await save(edits);
  let after = await everything();
  if (settle) {
    const more = after.settle(settle.sourceId, settle.today);
    if (more.length) {
      await save(more);
      after = await everything();
    }
  }
  return answer(after);
}

function checkSkill(f: { name?: string; color?: string }) {
  if (!String(f.name ?? "").trim()) fail("Give the skill a name.");
  if (!COLORS.includes(String(f.color))) fail("Pick one of the colours.");
}
const icon = (text: unknown) => [...String(text ?? "").trim()].slice(0, 8).join("") || "📘";
function checkSource(a: All, f: { skillId?: string; kind?: string; title?: string }) {
  a.skill(f.skillId);
  if (!KINDS.includes(String(f.kind))) fail("Pick what kind of source it is.");
  if (!String(f.title ?? "").trim()) fail("Give it a title.");
}
const unitName = (f: { unitName?: string; kind: string }) => [...(clean(String(f.unitName ?? "").toLowerCase()) ?? defaultUnitName(f.kind))].slice(0, 30).join("");

// ---------- Pasted contents lists (outline.rs, from_text) ----------

type Draft = { title: string; level: number; minutes: number | null; page: number | null };
const NOISE = ["preview", "start", "play", "resume", "contents", "table of contents", "course content", "expand all sections", "collapse all sections"];
const isNoise = (line: string) => {
  const lower = line.toLowerCase();
  return NOISE.includes(lower) || (lower.includes("•") && lower.split("•").every((p) => !p.trim() || /^\d/.test(p.trim())));
};
function durationOnly(line: string) {
  const parts = line.split(":");
  if (parts.length < 2 || parts.length > 3 || !parts.every((p) => /^\d{1,2}$/.test(p))) return null;
  const v = parts.map(Number), seconds = v.length === 3 ? v[0] * 3600 + v[1] * 60 + v[2] : v[0] * 60 + v[1];
  return Math.ceil(seconds / 60);
}
const cleanEnd = (text: string) => text.replace(/[•·\-–(, ]+$/u, "");
function takeMinutes(line: string): [string, number | null] {
  const words = line.split(/\s+/).filter(Boolean);
  const strip = (w: string) => w.replace(/^[()[\]•·,-]+|[()[\]•·,-]+$/gu, "").toLowerCase();
  if (words.length >= 2) {
    const m = durationOnly(strip(words.at(-1)!));
    if (m !== null) return [cleanEnd(words.slice(0, -1).join(" ")), m];
    const unit = strip(words.at(-1)!), number = strip(words.at(-2)!);
    if (/^\d+$/.test(number) && words.length > 2) {
      const v = Number(number);
      const minutes = ["min", "mins", "minute", "minutes", "m"].includes(unit) ? v : ["hr", "hrs", "hour", "hours", "h"].includes(unit) ? v * 60 : null;
      if (minutes !== null) return [cleanEnd(words.slice(0, -2).join(" ")), minutes];
    }
    const short = /^(\d+)m$/.exec(unit);
    if (short) return [cleanEnd(words.slice(0, -1).join(" ")), Number(short[1])];
  }
  return [line, null];
}
function stripKindPrefix(t: string) {
  for (const prefix of ["Video:", "Reading:", "Lecture:", "Quiz:", "Practice Quiz:", "Graded Assignment:", "Lab:"]) if (t.startsWith(prefix)) return t.slice(prefix.length).trim();
  return t;
}
function trailingPage(line: string): [string, number] | null {
  const match = /^(.*?)([ \t.…])(\d{1,4})$/u.exec(line);
  if (!match) return null;
  const rest = (match[1] + (match[2] === " " || match[2] === "\t" ? "" : match[2])).replace(/[. \t…]+$/u, "").trim();
  const word = (rest.split(/\s+/).at(-1) ?? "").toLowerCase();
  if (!rest || ["chapter", "part", "section", "lecture", "week", "module", "unit", "lesson"].includes(word)) return null;
  return [rest, Number(match[3])];
}
function partHeading(line: string) {
  const [first = "", second = ""] = line.split(/\s+/);
  const sec = second.replace(/[:.\-]+$/, "").toLowerCase();
  return ["part", "book"].includes(first.toLowerCase()) && !!sec && (/^\d+$/.test(sec) || /^[ivxlc]+$/.test(sec) || ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].includes(sec));
}
function courseSection(line: string) {
  const [first = "", second] = line.split(/\s+/);
  return ["section", "week", "module"].includes(first.toLowerCase()) && !!second && /^\d+$/.test(second.replace(/[:.]+$/, ""));
}
function numberingDepth(line: string) {
  const lower = line.toLowerCase();
  for (const prefix of ["chapter ", "lecture ", "lesson "]) if (lower.startsWith(prefix)) return /^[a-z0-9]/.test(lower.slice(prefix.length)) ? 0 : null;
  const words = line.split(/\s+/);
  const first = words[0].replace(/[.:)]+$/, ""), parts = first.split(".");
  const numbered = !!first && parts.every((p) => /^\d{1,3}$/.test(p));
  return numbered && words.length > 1 ? Math.min(4, parts.length - 1) : null;
}
function indentLevel(raw: string) {
  let level = 0, spaces = 0;
  for (const c of raw) {
    if (c === "\t") level++;
    else if (c === " ") spaces++;
    else break;
  }
  return Math.min(4, level + Math.floor(spaces / 2));
}
export function fromText(text: string): Draft[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim());
  const pages = lines.filter((l) => trailingPage(l.trim())).length * 2 > lines.length;
  const hasParts = lines.some((l) => partHeading(l.trim())), hasSections = lines.some((l) => courseSection(l.trim()));
  const out: Draft[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (isNoise(line)) continue;
    const alone = durationOnly(line);
    if (alone !== null) {
      if (out.length && out.at(-1)!.minutes === null) out.at(-1)!.minutes = alone;
      continue;
    }
    let [t, minutes] = takeMinutes(line), page: number | null = null;
    const trailing = pages ? trailingPage(t) : null;
    if (trailing) [t, page] = trailing;
    t = stripKindPrefix(t.replace(/[. \t]+$/, "").trim());
    if (!t) continue;
    const depth = numberingDepth(t);
    const level = partHeading(t) || courseSection(t) ? 0 : depth !== null ? depth + (hasParts ? 1 : 0) : hasSections ? 1 : indentLevel(raw);
    out.push({ title: t, level, minutes, page });
    if (out.length >= 2000) break;
  }
  // No unit more than one level deeper than the one before, the shallowest at 0.
  const lowest = out.length ? Math.min(...out.map((u) => u.level)) : 0;
  let previous = -1;
  for (const u of out) {
    u.level = Math.max(0, Math.min(u.level - lowest, previous + 1));
    previous = u.level;
  }
  return out;
}

export const learning: Handlers = {
  async learning_summary({ today }) {
    const a = await everything(), skills = a.skills(), live = new Map(skills.map((x) => [x.id, x]));
    const cards = skills
      .map((sk) => {
        const sources = a.sources().filter((x) => x.data.skill_id === sk.id).map((x) => a.card(x, today));
        const t = { done: 0, total: 0, percent: null as number | null, reviews: 0, weekMinutes: 0, totalMinutes: 0 };
        for (const c of sources) {
          t.done += c.tally.done;
          t.total += c.tally.total;
          t.reviews += c.tally.reviews;
          t.weekMinutes += c.tally.weekMinutes;
          t.totalMinutes += c.tally.totalMinutes;
        }
        t.percent = t.total ? (t.done / t.total) * 100 : null;
        return { ...skillView(sk), tally: t, sources };
      })
      .sort((x, y) => Number(x.archived) - Number(y.archived) || x.position - y.position);
    const sourceOf = new Map(a.sources().filter((x) => live.has(s(x.data.skill_id))).map((x) => [x.id, x]));
    const units = a.unitRows().map(unitView), sessions = a.sessionRows().map(sessionView);
    const reviews = units
      .filter((u) => u.reviewOn && u.reviewOn <= today && sourceOf.has(u.sourceId))
      .sort((x, y) => x.reviewOn!.localeCompare(y.reviewOn!) || x.position - y.position)
      .map((u) => {
        const src = sourceOf.get(u.sourceId)!, sk = live.get(s(src.data.skill_id))!;
        return { ...u, sourceTitle: s(src.data.title), skillName: s(sk.data.name), skillIcon: s(sk.data.icon), skillColor: s(sk.data.color) };
      });
    const minutesOn = (day: string) => sessions.filter((x) => x.day === day).reduce((t, x) => t + x.minutes, 0);
    const days = Array.from({ length: HISTORY_DAYS }, (_, i) => {
      const day = shiftDay(today, i - (HISTORY_DAYS - 1));
      return { day, minutes: minutesOn(day), units: units.filter((u) => u.doneOn === day).length };
    });
    const week = days.slice(-7);
    const studied = new Set([...sessions.filter((x) => x.minutes > 0).map((x) => x.day), ...units.flatMap((u) => (u.doneOn ? [u.doneOn] : []))].filter((d) => d <= today));
    let day = studied.has(today) ? today : shiftDay(today, -1), streak = 0;
    while (studied.has(day)) {
      streak++;
      day = shiftDay(day, -1);
    }
    const recent = a
      .sessionRows()
      .filter((x) => sourceOf.has(s(x.data.source_id)))
      .sort((x, y) => s(y.data.day).localeCompare(s(x.data.day)) || s(y.data.created_at).localeCompare(s(x.data.created_at)))
      .slice(0, 8)
      .map((x) => {
        const src = sourceOf.get(s(x.data.source_id))!;
        return { ...sessionView(x), sourceTitle: s(src.data.title), skillIcon: s(live.get(s(src.data.skill_id))?.data.icon) };
      });
    return { skills: cards, reviews, days, streak, todayMinutes: minutesOn(today), weekMinutes: week.reduce((t, d) => t + d.minutes, 0), weekUnits: week.reduce((t, d) => t + d.units, 0), recent };
  },

  async learning_source({ id, today }) {
    const a = await everything(), src = a.source(id);
    const sessions = a.sessionRows().filter((x) => x.data.source_id === id).sort((x, y) => s(y.data.day).localeCompare(s(x.data.day)) || s(y.data.created_at).localeCompare(s(x.data.created_at))).map(sessionView);
    return { card: sourceCard(src, a.unitsOf(id), sessions, today), skill: skillView(a.skill(src.data.skill_id)), units: a.unitsOf(id), sessions };
  },

  async learning_add_skill({ fields: f }) {
    checkSkill(f);
    const a = await everything(), id = newId();
    const position = Math.max(0, ...a.skills().map((x) => n(x.data.position))) + 1;
    return then([{ table: "learning_skills", id, fields: { id, name: title(f.name), icon: icon(f.icon), color: f.color, why: String(f.why ?? "").trim(), archived: !!f.archived, position, created_at: now(), deleted_at: null } }], (after) => skillView(after.skill(id)));
  },
  async learning_update_skill({ id, fields: f }) {
    checkSkill(f);
    (await everything()).skill(id);
    return then([{ table: "learning_skills", id, fields: { name: title(f.name), icon: icon(f.icon), color: f.color, why: String(f.why ?? "").trim(), archived: !!f.archived } }], (after) => skillView(after.skill(id)));
  },
  async learning_delete_skill({ id }) {
    const a = await everything(), at = now();
    a.skill(id);
    const sources = a.sources().filter((x) => x.data.skill_id === id), ids = new Set(sources.map((x) => x.id));
    const bury = (rows: SyncRecord[]) => rows.map((r) => ({ table: r.table, id: r.id, fields: { deleted_at: at } }));
    await save([...bury(a.unitRows().filter((u) => ids.has(s(u.data.source_id)))), ...bury(a.sessionRows().filter((x) => ids.has(s(x.data.source_id)))), ...bury(sources), ...bury(a.skills().filter((x) => x.id === id))]);
  },

  async learning_add_source({ fields: f }) {
    const a = await everything();
    checkSource(a, f);
    const id = newId(), position = Math.max(0, ...a.sources().filter((x) => x.data.skill_id === f.skillId).map((x) => n(x.data.position))) + 1;
    return then(
      [{ table: "learning_sources", id, fields: { id, unit_name: unitName(f), skill_id: f.skillId, kind: f.kind, title: title(f.title), author: title(f.author), link: clean(f.link), cover_url: clean(f.coverUrl), finish_by: f.finishBy ?? null, finished_on: null, notes: String(f.notes ?? "").trim(), position, created_at: now(), deleted_at: null } }],
      (after) => sourceView(after.source(id)),
    );
  },
  async learning_update_source({ id, fields: f }) {
    const a = await everything();
    checkSource(a, f);
    a.source(id);
    return then(
      [{ table: "learning_sources", id, fields: { unit_name: unitName(f), skill_id: f.skillId, kind: f.kind, title: title(f.title), author: title(f.author), link: clean(f.link), cover_url: clean(f.coverUrl), finish_by: f.finishBy ?? null, notes: String(f.notes ?? "").trim() } }],
      (after) => sourceView(after.source(id)),
    );
  },
  async learning_delete_source({ id }) {
    const a = await everything(), at = now();
    a.source(id);
    const bury = (rows: SyncRecord[]) => rows.map((r) => ({ table: r.table, id: r.id, fields: { deleted_at: at } }));
    await save([...bury(a.unitRows().filter((u) => u.data.source_id === id)), ...bury(a.sessionRows().filter((x) => x.data.source_id === id)), ...bury(a.sources().filter((x) => x.id === id))]);
  },

  async learning_add_units({ sourceId, units, replace, today }) {
    const a = await everything();
    a.source(sourceId);
    const drafts = (units as Draft[]).filter((d) => String(d.title ?? "").trim());
    if (!drafts.length) fail("There's nothing to add.");
    const at = now(), edits: Edit[] = [];
    let existing = a.unitRows().filter((u) => u.data.source_id === sourceId);
    if (replace) {
      edits.push(...existing.map((u) => ({ table: u.table, id: u.id, fields: { deleted_at: at } })));
      existing = [];
    }
    if (existing.length + drafts.length > MAX_UNITS_PER_SOURCE) fail(`A source can have up to ${MAX_UNITS_PER_SOURCE} units.`);
    let position = Math.max(0, ...existing.map((u) => n(u.data.position)));
    const ids: string[] = [];
    for (const d of drafts) {
      const id = newId();
      ids.push(id);
      edits.push({ table: "learning_units", id, fields: { id, source_id: sourceId, title: title(d.title), level: Math.max(0, Math.min(6, Math.round(Number(d.level) || 0))), minutes: positive(d.minutes), page: positive(d.page), done_on: null, review_stage: 0, review_on: null, notes: "", position: ++position, created_at: at, deleted_at: null } });
    }
    return then(edits, (after) => ids.map((id) => unitView(after.unit(id))), { sourceId, today });
  },
  async learning_update_unit({ id, fields: f }) {
    if (!String(f.title ?? "").trim()) fail("Give it a title.");
    (await everything()).unit(id);
    return then([{ table: "learning_units", id, fields: { title: title(f.title), level: Math.max(0, Math.min(6, Math.round(Number(f.level) || 0))), minutes: positive(f.minutes), page: positive(f.page), notes: String(f.notes ?? "").trim() } }], (after) => unitView(after.unit(id)));
  },
  async learning_delete_unit({ id, today }) {
    const u = (await everything()).unit(id);
    await then([{ table: u.table, id, fields: { deleted_at: now() } }], () => undefined, { sourceId: s(u.data.source_id), today });
  },
  async learning_set_done({ id, done, today }) {
    const u = (await everything()).unit(id);
    return then([{ table: u.table, id, fields: { done_on: done ? today : null } }], (after) => unitView(after.unit(id)), { sourceId: s(u.data.source_id), today });
  },
  async learning_review({ id, action, today }) {
    const u = (await everything()).unit(id), stage = n(u.data.review_stage);
    let next: [number, string | null];
    if (action === "later") next = [1, shiftDay(today, REVIEW_DAYS[0])];
    else if (action === "reviewed") next = stage >= 1 && stage <= 2 ? [stage + 1, shiftDay(today, REVIEW_DAYS[stage])] : [0, null];
    else if (action === "clear") next = [0, null];
    else return fail("Unknown review action.");
    return then([{ table: u.table, id, fields: { review_stage: next[0], review_on: next[1] } }], (after) => unitView(after.unit(id)));
  },

  async learning_add_session({ fields: f }) {
    (await everything()).source(f.sourceId);
    const minutes = Math.round(Number(f.minutes));
    if (!(minutes >= 1 && minutes <= 24 * 60)) fail("Log between 1 minute and 24 hours.");
    const id = newId();
    return then([{ table: "learning_sessions", id, fields: { id, source_id: f.sourceId, day: f.day, minutes, note: String(f.note ?? "").trim(), created_at: now(), deleted_at: null } }], (after) => sessionView(after.sessionRows().find((x) => x.id === id)!));
  },
  async learning_delete_session({ id }) {
    if ((await everything()).sessionRows().some((x) => x.id === id)) await save([{ table: "learning_sessions", id, fields: { deleted_at: now() } }]);
  },

  learning_parse_text: ({ text }) => fromText(String(text ?? "")),
  learning_read_book: () => Promise.reject("Reading the chapters out of an EPUB or PDF works in the Axiom desktop app. On the web, paste the book's contents list instead."),
  learning_youtube_available: () => false,
  learning_youtube: () => Promise.reject("Importing a YouTube playlist works in the Axiom desktop app. On the web, paste the list of videos instead."),
  learning_analytics: () => Promise.reject("Learning analytics aren't on the web yet."),
};
