"use client";

import { useState, type FormEvent } from "react";
import { Check, Pencil, Plus, Repeat2, Trash2 } from "lucide-react";
import { applyRoutines, changeRoutine, localDay, planInsights, planSettings, type PlanTask } from "@/lib/terminal/planner";
import type { Fields, SyncRecord } from "@/lib/terminal/protocol";
import type { Workspace } from "./useWorkspace";
import { Dialog } from "./Dialog";
import s from "./terminal.module.css";

export const clockTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const clockMinutes = (clock: FormDataEntryValue | null) => { const [h, m] = String(clock).split(":").map(Number); return h * 60 + m; };
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const message = (cause: unknown) => cause instanceof Error ? cause.message : "Your change could not be saved.";

export function PlannerSettings({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  const settings = planSettings(workspace.records);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  return <Dialog title="Working day" onClose={onClose}><form className={s.form} onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try { await workspace.save([{ table: "daily_plan_settings", id: "settings", fields: { id: "settings", day_start_minute: clockMinutes(form.get("start")), day_end_minute: clockMinutes(form.get("end")), buffer_percent: Number(form.get("buffer")), deleted_at: null } }]); onClose(); } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }}><div className={s.twoColumns}><label>Day starts<input name="start" type="time" required defaultValue={clockTime(settings.start)} /></label><label>Day ends<input name="end" type="text" inputMode="numeric" pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00" title="24-hour time, for example 17:30 or 24:00" required defaultValue={clockTime(settings.end)} /></label></div><label>Room for the unexpected (%)<input name="buffer" type="number" min={0} max={60} required defaultValue={settings.buffer} /></label><p className={s.muted}>Capacity reserves this share of your working day. Automatic scheduling fits tasks around the time blocks on your web planner.</p>{error && <p className={s.error} role="alert">{error}</p>}<div className={s.row}><button className={`${s.button} ${s.primary}`} disabled={busy || !workspace.ready}>Save working day</button><button className={s.button} type="button" onClick={onClose}>Cancel</button></div></form></Dialog>;
}

export function PlannerRoutines({ workspace, day }: { workspace: Workspace; day: string }) {
  const [editing, setEditing] = useState<SyncRecord | "new" | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const routines = workspace.records.filter(row => row.table === "daily_plan_routines").sort((a, b) => Number(a.data.start_minute) - Number(b.data.start_minute));
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try { await action(); } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget), original = editing === "new" ? null : editing;
    const fields: Fields = { title: String(form.get("title") ?? "").trim(), start_minute: clockMinutes(form.get("start")), duration_minutes: Number(form.get("duration")), weekdays: form.getAll("weekday").reduce<number>((mask, day) => mask | (1 << Number(day)), 0), color: String(form.get("color") ?? "purple") };
    await perform(async () => { await workspace.save(changeRoutine(original, fields, workspace.records, localDay(), new Date().toISOString(), crypto.randomUUID())); setEditing(null); });
  }
  return <section className={s.panel}><div className={s.heading}><div><h2><Repeat2 size={18} /> Routines</h2><p>Recurring time blocks for the rhythm of your week.</p></div><div className={s.row}><button className={s.button} disabled={busy || !workspace.ready} onClick={() => void perform(async () => {
    const edits = applyRoutines(workspace.records, workspace.allRecords, day, new Date().toISOString());
    if (edits.length) await workspace.save(edits);
    setNotice(edits.length ? `${edits.length} routine block${edits.length === 1 ? "" : "s"} added for ${day}.` : "This day's routines are already applied, skipped, or not scheduled for this weekday.");
  })}>Apply routines to this day</button><button className={`${s.button} ${s.primary}`} disabled={!workspace.ready} onClick={() => { setError(null); setEditing("new"); }}><Plus size={14} /> New routine</button></div></div>
    <p className={s.muted}>Routines appear automatically from today onwards when you open a day. You can also apply them explicitly. A skipped occurrence stays skipped. Changes affect today and future blocks; past days stay as they were.</p>
    {error && <p className={s.error} role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {routines.map(row => <div className={s.block} key={row.id}><time>{clockTime(Number(row.data.start_minute))}</time><div><strong>{String(row.data.title)}</strong><small>{Number(row.data.duration_minutes)} min · {weekdays.filter((_, day) => Number(row.data.weekdays) & (1 << day)).join(", ")}</small></div><button className={s.iconButton} aria-label={`Edit routine ${row.data.title}`} disabled={busy} onClick={() => { setError(null); setEditing(row); }}><Pencil size={15} /></button></div>)}
    {!routines.length && <div className={s.empty}><Repeat2 size={28} /><h3>A rhythm you can return to.</h3><p>Add study sessions, breaks or a weekly review.</p></div>}
    {editing && <Dialog title={editing === "new" ? "New routine" : "Edit routine"} onClose={() => setEditing(null)}><form className={s.form} onSubmit={save}><label>Name<input name="title" required maxLength={500} autoFocus defaultValue={editing === "new" ? "" : String(editing.data.title)} /></label><div className={s.twoColumns}><label>Starts at<input name="start" type="time" required defaultValue={editing === "new" ? "09:00" : clockTime(Number(editing.data.start_minute))} /></label><label>Duration in minutes<input name="duration" type="number" min={5} max={1440} required defaultValue={editing === "new" ? 30 : Number(editing.data.duration_minutes)} /></label></div><fieldset className={s.weekdays}><legend>Repeat on</legend>{weekdays.map((label, day) => <label key={day}><input name="weekday" type="checkbox" value={day} defaultChecked={editing === "new" ? day < 5 : !!(Number(editing.data.weekdays) & (1 << day))} />{label}</label>)}</fieldset><label>Colour<select name="color" defaultValue={editing === "new" ? "purple" : String(editing.data.color)}>{["purple", "green", "blue", "orange", "pink", "teal"].map(color => <option key={color} value={color}>{color}</option>)}</select></label>{error && <p className={s.error} role="alert">{error}</p>}<div className={s.row}><button className={`${s.button} ${s.primary}`} disabled={busy}>Save routine</button>{editing !== "new" && <button className={s.button} type="button" disabled={busy} onClick={() => void perform(async () => { await workspace.save(changeRoutine(editing, null, workspace.records, localDay(), new Date().toISOString(), "unused")); setEditing(null); })}><Trash2 size={14} /> Delete routine</button>}<button className={s.button} type="button" onClick={() => setEditing(null)}>Cancel</button></div></form></Dialog>}
  </section>;
}

export function PlannerInsights({ workspace, tasks }: { workspace: Workspace; tasks: PlanTask[] }) {
  const insights = planInsights(tasks, workspace.records, localDay());
  const maximum = Math.max(1, ...insights.days.map(day => day.total));
  return <div className={s.stack}><div className={s.grid}><section className={s.panel}><h2>Planning streak</h2><strong className={s.stat}>{insights.plannedStreak} <small>days</small></strong><p>Mark your morning plan complete to keep the habit.</p></section><section className={s.panel}><h2>Shutdown streak</h2><strong className={s.stat}>{insights.shutdownStreak} <small>days</small></strong><p>Mark the day reviewed after reflecting.</p></section><section className={s.panel}><h2>Your pace</h2><strong className={s.stat}>{insights.pace === null ? "—" : `${insights.pace.toFixed(1)}×`}</strong><p>{insights.pace === null ? `Track time on at least three estimated tasks. ${insights.timed} so far.` : `Tracked time compared with estimates across ${insights.timed} tasks in the last 30 days.`}</p></section><section className={s.panel}><h2>Top priorities finished</h2><strong className={s.stat}>{insights.focusDone} / {insights.focus}</strong><p>Across the last 30 days.</p></section></div><section className={s.panel}><h2>Eight weeks of focus</h2><div className={s.weeklyChart}>{insights.weeks.map(week => <div key={week.start} aria-label={`Week of ${week.start}: ${week.tracked} minutes tracked`}><span>{(week.tracked / 60).toFixed(1)} h</span><i style={{ height: `${Math.max(1, week.tracked / Math.max(1, ...insights.weeks.map(item => item.tracked)) * 140)}px` }} /><small>{new Date(week.start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small></div>)}</div></section><section className={s.panel}><h2><Check size={17} /> The last two weeks</h2><div className={s.history}>{insights.days.map(day => <div key={day.day}><span>{new Date(`${day.day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span><span className={s.progress} title={`${day.done} of ${day.total} complete`}><i style={{ width: `${day.done / maximum * 100}%` }} /></span><span>{day.done} / {day.total} · {day.tracked} min</span></div>)}</div></section></div>;
}
