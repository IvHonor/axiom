"use client";

import { useState } from "react";
import { Download, FileUp, RefreshCw, Trash2 } from "lucide-react";
import { MAX_CALENDAR_BYTES, calendarEdits, exportPlan, readCalendar, removeCalendar } from "@/lib/terminal/calendar";
import { localDay, routinePreview, shiftDay, type PlanTask } from "@/lib/terminal/planner";
import type { SyncRecord } from "@/lib/terminal/protocol";
import type { Workspace } from "./useWorkspace";
import { fetchCalendarFeed, refreshFeed } from "./useCalendarFeeds";
import { colourOf } from "./PlannerCalendar";
import s from "./terminal.module.css";

export function PlannerCalendars({ workspace, tasks, day, from, to }: { workspace: Workspace; tasks: PlanTask[]; day: string; from: string; to: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [method, setMethod] = useState("file");
  const [exportFrom, setExportFrom] = useState(from), [exportTo, setExportTo] = useState(to);
  const calendars = workspace.records.filter(row => row.table === "web_plan_calendars");
  async function act(action: () => Promise<void>) {
    if (busy) return; setBusy(true); setError(null);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The calendar could not be saved."); } finally { setBusy(false); }
  }
  async function readFile(file: File, calendar: SyncRecord | null) {
    if (file.size > MAX_CALENDAR_BYTES) throw new Error("Choose a calendar file smaller than 200 KB.");
    const source = await file.text(); readCalendar(source, calendar?.id ?? "check", String(calendar?.data.color ?? "teal"), shiftDay(day, -366), shiftDay(day, 366));
    return source;
  }
  return <div className={s.stack}><section className={s.panel}><div className={s.heading}><div><h2>Calendars</h2><p>Plan around meetings and appointments.</p></div></div>
    <p className={s.muted}>iCalendar links refresh every 15 minutes while the web terminal is open. Files are snapshots you refresh by importing again. Calendar contents and private feed links sync to your Axiom account without end-to-end encryption.</p>
    {error && <p className={s.error} role="alert">{error}</p>}
    {calendars.map(calendar => <div className={s.task} key={calendar.id}><input type="checkbox" aria-label={`Show ${calendar.data.name}`} checked={calendar.data.shown !== false} disabled={busy} onChange={event => { const shown = event.target.checked; void act(() => workspace.save([{ table: calendar.table, id: calendar.id, fields: { shown } }])); }} /><div><strong style={{ color: colourOf(calendar.data.color) }}>{String(calendar.data.name)}</strong><small>{calendar.data.feed_url ? "Subscribed calendar" : "Imported calendar"} · {calendar.data.shown === false ? "Hidden" : "Included in scheduling and capacity"}{calendar.data.refreshed_at ? " · Updated " + new Date(String(calendar.data.refreshed_at)).toLocaleString() : ""}</small>{calendar.data.problem && <small className={s.error}>{String(calendar.data.problem)}</small>}</div>
      {calendar.data.feed_url ? <button className={s.button} disabled={busy} onClick={() => void act(async () => { await workspace.save(await refreshFeed(calendar, workspace)); })}><RefreshCw size={13} /> Refresh</button> : <label className={s.button}>Refresh<input type="file" accept=".ics,text/calendar" className={s.fileInput} disabled={busy} aria-label={`Refresh calendar ${calendar.data.name}`} onChange={event => { const file = event.target.files?.[0]; if (!file) return; void act(async () => { const source = await readFile(file, calendar); await workspace.save(calendarEdits(calendar, String(calendar.data.name), String(calendar.data.color), source, workspace.records, new Date().toISOString(), () => crypto.randomUUID())); }); event.target.value = ""; }} /></label>}
      <button className={s.iconButton} aria-label={`Remove calendar ${calendar.data.name}`} disabled={busy} onClick={() => void act(() => workspace.save(removeCalendar(calendar, workspace.records, new Date().toISOString())))}><Trash2 size={15} /></button></div>)}
    <form className={s.form} style={{ marginTop: 24 }} onSubmit={async event => {
      event.preventDefault(); const formElement = event.currentTarget, form = new FormData(formElement);
      await act(async () => {
        const file = form.get("file"), url = method === "link" ? new URL(String(form.get("url")).replace(/^webcal:/i, "https:")).href : null;
        if (method === "file" && (!(file instanceof File) || !file.size)) throw new Error("Choose an iCalendar (.ics) file.");
        const source = url ? await fetchCalendarFeed(workspace.accountId, url) : await readFile(file as File, null);
        readCalendar(source, "check", String(form.get("color")), shiftDay(localDay(), -366), shiftDay(localDay(), 366));
        const edits = calendarEdits(null, String(form.get("name")).trim(), String(form.get("color")), source, workspace.records, new Date().toISOString(), () => crypto.randomUUID());
        Object.assign(edits.find(edit => edit.table === "web_plan_calendars")!.fields, { feed_url: url, refreshed_at: new Date().toISOString(), problem: null });
        await workspace.save(edits); formElement.reset();
      });
    }}><h3><FileUp size={17} /> Import calendar</h3><label>Import from<select value={method} onChange={event => setMethod(event.target.value)}><option value="file">iCalendar file</option><option value="link">iCalendar link</option></select></label><div className={s.twoColumns}><label>Calendar name<input name="name" required maxLength={500} placeholder="Work, university, personal…" /></label><label>Colour<select name="color" defaultValue="teal">{["teal", "blue", "purple", "green", "orange", "pink"].map(color => <option key={color}>{color}</option>)}</select></label></div>{method === "file" ? <label>iCalendar file<input name="file" type="file" accept=".ics,text/calendar" required /></label> : <label>Private iCalendar link<input name="url" type="text" maxLength={4096} required placeholder="https://…/calendar.ics" /><small className={s.muted}>Use the iCal subscription link from Google, Outlook, iCloud or your calendar provider.</small></label>}<button className={`${s.button} ${s.primary}`} disabled={busy || !workspace.ready}>Import calendar</button></form>
  </section><section className={s.panel}><h2>Export your plan</h2><form className={s.form} style={{ marginTop: 18 }} onSubmit={event => {
    event.preventDefault(); void act(async () => {
      const count = Math.round((Date.parse(exportTo) - Date.parse(exportFrom)) / 86400000) + 1;
      if (count < 1 || count > 366) throw new Error("Choose a date range of up to one year.");
      const days = Array.from({ length: count }, (_, index) => shiftDay(exportFrom, index));
      const records = routinePreview(workspace.records, workspace.allRecords, days, localDay());
      const source = exportPlan(records, tasks, exportFrom, exportTo), url = URL.createObjectURL(new Blob([source], { type: "text/calendar;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `axiom-plan-${exportFrom}-${exportTo}.ics`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }}><div className={s.twoColumns}><label>Export from<input type="date" value={exportFrom} required onChange={event => setExportFrom(event.target.value)} /></label><label>Export through<input type="date" value={exportTo} required onChange={event => setExportTo(event.target.value)} /></label></div><button className={s.button} disabled={busy}><Download size={15} /> Export plan (.ics)</button></form><p className={s.muted}>Includes scheduled blocks and future routines. Import this file into your calendar app.</p></section>
  <div className={s.notice}>Direct Google/Outlook/iCloud sign-in, editing provider events and automatic publishing still need a hosted calendar account service. iCalendar subscriptions above provide read-only events.</div></div>;
}
