import ICAL from "ical.js";
import type { SyncRecord } from "./protocol";
import { localDay, shiftDay, type BusyEvent, type Edit, type PlanTask } from "./planner.ts";

export interface CalendarEvent extends BusyEvent { id: string; calendarId: string; title: string; color: string; location: string; description: string; link: string | null; recurring: boolean; startAt: string; endAt: string }
export const MAX_CALENDAR_BYTES = 200_000;
const string = (value: unknown) => typeof value === "string" ? value : "";
const safeLink = (value: unknown) => { try { const url = new URL(string(value)); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; } };

/** Timezone definitions travel with a feed. Intl covers IANA zones omitted by exporters. */
function instant(time: ICAL.Time, property: ICAL.Property | null): Date {
  const zone = string(property?.getParameter("tzid"));
  if (time.isDate || !zone || time.zone !== ICAL.Timezone.localTimezone) return time.toJSDate();
  const format = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const wanted = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  let stamp = wanted;
  for (let pass = 0; pass < 4; pass++) {
    const parts = Object.fromEntries(format.formatToParts(new Date(stamp)).map(part => [part.type, part.value]));
    const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const delta = wanted - wall; stamp += delta; if (!delta) break;
  }
  return new Date(stamp);
}

/** Expand RFC 5545 repeats/exceptions and split overnight events into local days. */
export function readCalendar(source: string, calendarId: string, color: string, from: string, to: string): CalendarEvent[] {
  if (new TextEncoder().encode(source).length > MAX_CALENDAR_BYTES) throw new Error("Use a calendar file smaller than 200 KB, or export a shorter date range.");
  const root = new ICAL.Component(ICAL.parse(source));
  if (root.name !== "vcalendar") throw new Error("Choose an iCalendar (.ics) file.");
  const components = root.getAllSubcomponents("vevent"), events: CalendarEvent[] = [];
  if (components.length > 2500) throw new Error("Import up to 2,500 calendar events at a time.");
  let iterations = 0;
  const cutoff = new Date(`${shiftDay(to, 2)}T00:00:00`).getTime();
  for (const component of components) {
    const event = new ICAL.Event(component);
    if (!component.hasProperty("dtstart") || component.getFirstPropertyValue("x-axiom-block")) continue;
    const rules = component.getAllProperties("rrule").map(property => property.getFirstValue() as ICAL.Recur);
    if (rules.some(rule => ["SECONDLY", "MINUTELY", "HOURLY"].includes(rule.freq))) throw new Error("Calendar repeats more frequent than daily are not supported. Export those occurrences as individual events.");
    const recurring = event.isRecurring(), iterator = event.iterator();
    for (;;) {
      if (++iterations > 30000) throw new Error("This calendar expands to too many occurrences. Export a shorter date range.");
      const occurrence = recurring ? iterator.next() : event.startDate; if (!occurrence) break;
      const details = event.getOccurrenceDetails(occurrence), item = details.item;
      const begin = instant(details.startDate, item.component.getFirstProperty("dtstart")), end = instant(details.endDate, item.component.getFirstProperty("dtend") ?? item.component.getFirstProperty("dtstart"));
      if (instant(occurrence, event.component.getFirstProperty("dtstart")).getTime() > cutoff) break;
      // Exceptions are read separately, including occurrences moved into this window from outside it.
      if ((!item.isRecurrenceException() || event.isRecurrenceException()) && item.component.getFirstPropertyValue("status") !== "CANCELLED" && end > begin) {
        let day = localDay(begin);
        const last = localDay(new Date(end.getTime() - 1));
        if (day < from) day = from;
        for (; day <= last && day <= to; day = shiftDay(day, 1)) {
          if (events.length >= 5000) throw new Error("This calendar contains too many occurrences in this view.");
          const allDay = details.startDate.isDate, start = day === localDay(begin) ? begin.getHours() * 60 + begin.getMinutes() : 0;
          const finish = day === localDay(end) ? end.getHours() * 60 + end.getMinutes() : 1440;
          events.push({ id: `${calendarId}/${event.uid}/${occurrence.toString()}/${day}`, calendarId, day, start: allDay ? 0 : start, duration: allDay ? 1440 : Math.max(1, finish - start), allDay, busy: !allDay && item.component.getFirstPropertyValue("transp") !== "TRANSPARENT", title: (item.summary || "Calendar event").slice(0, 500), color, location: string(item.location), description: string(item.description), link: safeLink(item.component.getFirstPropertyValue("url")), recurring: recurring || event.isRecurrenceException(), startAt: begin.toISOString(), endAt: end.toISOString() });
        }
      }
      if (!recurring) break;
    }
  }
  return events.sort((a, b) => a.day.localeCompare(b.day) || Number(b.allDay) - Number(a.allDay) || a.start - b.start);
}

export function calendarEvents(records: SyncRecord[], from: string, to: string) {
  const events: CalendarEvent[] = [], problems: { id: string; message: string }[] = [];
  for (const record of records.filter(row => row.table === "web_plan_calendars" && row.data.shown !== false)) {
    try { events.push(...readCalendar(calendarSource(record, records), record.id, string(record.data.color) || "teal", from, to)); }
    catch (cause) { problems.push({ id: record.id, message: `${record.data.name}: ${cause instanceof Error ? cause.message : "Calendar could not be read."}` }); }
  }
  return { events, problems };
}

export function calendarSource(calendar: SyncRecord, records: SyncRecord[]): string {
  if (!calendar.data.parts) return string(calendar.data.source);
  const parts: unknown = JSON.parse(string(calendar.data.parts));
  if (!Array.isArray(parts) || parts.length > 100 || !parts.every(part => typeof part === "string")) throw new Error("Calendar data could not be read. Reimport this calendar.");
  return parts.map(id => {
    const part = records.find(row => row.table === "web_plan_calendar_chunks" && row.id === id && row.data.calendar_id === calendar.id && !row.data.deleted_at);
    if (!part) throw new Error("Calendar data is still syncing. Retry sync if this continues.");
    return string(part.data.content);
  }).join("");
}

/** The account server caps each record at 64 KiB; files travel as bounded chunks. */
export function calendarEdits(original: SyncRecord | null, name: string, color: string, source: string, records: SyncRecord[], at: string, newId: () => string): Edit[] {
  if (new TextEncoder().encode(source).length > MAX_CALENDAR_BYTES) throw new Error("Use a calendar file smaller than 200 KB.");
  const id = original?.id ?? newId(), parts: string[] = [], edits: Edit[] = [];
  for (let offset = 0; offset < source.length; offset += 8000) {
    const key = newId(); parts.push(key);
    edits.push({ table: "web_plan_calendar_chunks", id: key, fields: { id: key, calendar_id: id, content: source.slice(offset, offset + 8000), deleted_at: null } });
  }
  edits.push({ table: "web_plan_calendars", id, fields: { ...(original ? {} : { id, shown: true, created_at: at, deleted_at: null }), name, color, parts: JSON.stringify(parts), source: "" } });
  for (const row of records.filter(row => row.table === "web_plan_calendar_chunks" && row.data.calendar_id === id && !row.data.deleted_at)) edits.push({ table: row.table, id: row.id, fields: { deleted_at: at } });
  return edits;
}

export function removeCalendar(calendar: SyncRecord, records: SyncRecord[], at: string): Edit[] {
  return [calendar, ...records.filter(row => row.table === "web_plan_calendar_chunks" && row.data.calendar_id === calendar.id)].map(row => ({ table: row.table, id: row.id, fields: { deleted_at: at } }));
}

export function exportPlan(records: SyncRecord[], tasks: PlanTask[], from: string, to: string) {
  const calendar = new ICAL.Component(["vcalendar", [], []]);
  calendar.addPropertyWithValue("version", "2.0"); calendar.addPropertyWithValue("prodid", "-//Axiom//Daily Plan//EN");
  for (const block of records.filter(row => row.table === "daily_plan_blocks" && string(row.data.day) >= from && string(row.data.day) <= to)) {
    const task = tasks.find(task => task.id === block.data.task_id), day = string(block.data.day);
    const start = new Date(`${day}T00:00:00`); start.setMinutes(Number(block.data.start_minute));
    const end = new Date(start.getTime() + Number(block.data.duration_minutes) * 60000);
    const component = new ICAL.Component("vevent"), event = new ICAL.Event(component);
    event.uid = `${block.id}@axiom`; event.summary = task?.title ?? string(block.data.title); event.description = task?.notes ?? "";
    event.startDate = ICAL.Time.fromJSDate(start, true); event.endDate = ICAL.Time.fromJSDate(end, true);
    component.addPropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true));
    component.addPropertyWithValue("x-axiom-block", block.id); calendar.addSubcomponent(component);
  }
  return calendar.toString();
}
