"use client";

import { useEffect, useRef } from "react";
import { calendarEdits, readCalendar } from "@/lib/terminal/calendar";
import { localDay, shiftDay, type Edit } from "@/lib/terminal/planner";
import type { SyncRecord } from "@/lib/terminal/protocol";
import type { Workspace } from "./useWorkspace";

export async function fetchCalendarFeed(accountId: string, url: string) {
  const response = await fetch("/api/terminal/calendar-feed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, url }), cache: "no-store", signal: AbortSignal.timeout(65000) });
  const answer = await response.json();
  if (!response.ok || answer.accountId !== accountId) throw new Error(answer.message ?? "The calendar feed could not be read.");
  return String(answer.source);
}
export async function refreshFeed(calendar: SyncRecord, workspace: Workspace): Promise<Edit[]> {
  const source = await fetchCalendarFeed(workspace.accountId, String(calendar.data.feed_url)), today = localDay();
  readCalendar(source, calendar.id, String(calendar.data.color), shiftDay(today, -366), shiftDay(today, 366));
  const edits = calendarEdits(calendar, String(calendar.data.name), String(calendar.data.color), source, workspace.records, new Date().toISOString(), () => crypto.randomUUID());
  Object.assign(edits.find(edit => edit.table === "web_plan_calendars")!.fields, { refreshed_at: new Date().toISOString(), problem: null });
  return edits;
}

/** Keep the last successful snapshot when offline or when a feed is unavailable. */
export function useCalendarFeeds(workspace: Workspace) {
  const latest = useRef(workspace), busy = useRef(false), tried = useRef(new Map<string, number>());
  useEffect(() => { latest.current = workspace; }, [workspace]);
  useEffect(() => {
    const refresh = async () => {
      const state = latest.current;
      if (busy.current || !state.ready || document.hidden || !navigator.onLine) return;
      busy.current = true;
      try {
        for (const calendar of state.records.filter(row => row.table === "web_plan_calendars" && row.data.feed_url && row.data.shown !== false)) {
          const last = Math.max(Date.parse(String(calendar.data.refreshed_at)) || 0, tried.current.get(calendar.id) ?? 0);
          if (Date.now() - last < 15 * 60000) continue;
          tried.current.set(calendar.id, Date.now());
          try { await state.save(await refreshFeed(calendar, state)); }
          catch (cause) { if (!latest.current.expired) await state.save([{ table: calendar.table, id: calendar.id, fields: { problem: cause instanceof Error ? cause.message : "Calendar refresh failed." } }]).catch(() => {}); }
        }
      } finally { busy.current = false; }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 60000);
    const visible = () => void refresh(); window.addEventListener("online", visible); document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); window.removeEventListener("online", visible); document.removeEventListener("visibilitychange", visible); };
  }, [workspace.ready]);
}
