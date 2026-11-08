// What Lemma on the desktop mentions from the rest of Axiom: today's
// calendar events (with a Join button for meetings online), birthdays and
// anniversaries today or tomorrow, and bills due today or tomorrow. Each
// only from areas he's allowed to use (Lemma's settings).
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { api as birthdays } from "../../features/birthdays/api";
import { api as plan, type CalendarEvent } from "../../features/daily_plan/api";
import { addDays, today } from "../../features/daily_plan/time";
import { api as finance } from "../../features/finance/api";
import { money } from "../../features/finance/money";
import { useDataChanged } from "../../lib/sync";

/** How often today's events are looked at again (they're imported in the background). */
const EVENTS_MS = 5 * 60_000;

/** A link to join an online meeting (https only: all that Lemma on the desktop may open): Zoom, Google Meet, Teams, Webex, Whereby, Jitsi, GoTo, Chime. */
const MEETING =
  /https:\/\/(?:[a-z0-9-]+\.)*(?:zoom\.us\/(?:j|my|w)\/|meet\.google\.com\/|teams\.microsoft\.com\/(?:l\/meetup-join|meet)|teams\.live\.com\/meet|webex\.com\/|whereby\.com\/|meet\.jit\.si\/|gotomeeting\.com\/join|chime\.aws\/)[^\s"'<>)\]]*/i;

/** The event's meeting link, from where it is, its notes or its own link. */
export function meetingLink(event: Pick<CalendarEvent, "location" | "description" | "link">): string | null {
  for (const text of [event.location, event.description, event.link ?? ""]) {
    const found = text.replace(/&amp;/g, "&").match(MEETING);
    if (found) return found[0];
  }
  return null;
}

/** Today's calendar events at a time (not all-day), kept up to date. */
export function useTodaysEvents(on: boolean): CalendarEvent[] {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [again, setAgain] = useState(0);
  useDataChanged(() => setAgain((n) => n + 1));
  useEffect(() => {
    if (!on || !isTauri()) return setEvents([]);
    let gone = false;
    const load = () =>
      plan.getDay(today(), today()).then(
        (day) => !gone && setEvents(day.events.filter((e) => !e.allDay)),
        () => {},
      );
    void load();
    const every = setInterval(load, EVENTS_MS);
    return () => {
      gone = true;
      clearInterval(every);
    };
  }, [on, again]);
  return events;
}

const when = (days: number) => (days === 0 ? "today" : "tomorrow");

/** Birthdays and bills worth a mention today, as lines for his bubble. */
export async function headsUp(areas: string[]): Promise<string[]> {
  const day = today();
  const lines: string[] = [];
  if (areas.includes("birthdays")) {
    const people = await birthdays.list(day).catch(() => []);
    for (const p of people.filter((p) => p.days <= 1)) {
      const what = p.occasion === "anniversary" ? "anniversary" : "birthday";
      const turning = p.occasion === "birthday" && p.turning ? ` (${p.turning})` : "";
      lines.push(`It's **${p.name}**'s ${what} ${when(p.days)}${turning}.`);
    }
  }
  if (areas.includes("finance")) {
    const month = await finance.month(day.slice(0, 7), day).catch(() => null);
    const next = addDays(day, 1);
    for (const d of month?.due ?? []) {
      // Money going out: a bill. Overdue ones are Finance's to chase.
      if (d.amount >= 0 || (d.day !== day && d.day !== next)) continue;
      lines.push(`**${d.name}** is due ${when(d.day === day ? 0 : 1)} (${money(-d.amount, d.currency)}).`);
    }
  }
  return lines;
}
