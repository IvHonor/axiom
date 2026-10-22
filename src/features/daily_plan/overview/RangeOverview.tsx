import { useEffect, useState } from "react";
import { api, errorMessage, type RangePlan } from "../api";
import { addDays, addMonths, mondayOf, monthName, monthOf, today } from "../time";
import { setPlanUi, showToday, usePlanUi } from "../planUi";
import { useDataChanged } from "../../../lib/sync";

export function RangeOverview({ view, day, onOpen }: { view: "week" | "month"; day: string; onOpen: () => void }) {
  const [data, setData] = useState<RangePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const revision = usePlanUi().revision;
  const from = view === "week" ? mondayOf(day) : monthOf(day);
  const to = view === "week" ? addDays(from, 6) : addDays(addMonths(from, 1), -1);
  useDataChanged(() => setRefresh((n) => n + 1));
  useEffect(() => {
    let cancelled = false;
    const load = () => api.range(from, to, today()).then((value) => {
      if (!cancelled) { setData(value); setError(null); }
    }, (e) => { if (!cancelled) setError(errorMessage(e)); });
    setData(null); void load();
    const timer = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [from, to, revision, refresh]);
  if (error) return <div className="dp-ov-empty" role="alert">{error}<button className="btn" onClick={() => setRefresh((n) => n + 1)}>Retry</button></div>;
  if (!data) return <p className="dp-ov-empty">Loading {view}…</p>;
  const open = () => { showToday(); setPlanUi({ view, event: null }); onOpen(); };
  const days = data.days;
  const offset = (new Date(`${from}T12:00:00`).getDay() + 6) % 7;
  return <div className={`dp-ov-range is-${view}`}>
    <div className="dp-ov-range-heading"><strong>{view === "month" ? monthName(day) : "This week"}</strong><button onClick={open}>Open {view} ↗</button></div>
    <div className="dp-ov-range-grid">
      {view === "month" && ["M", "T", "W", "T", "F", "S", "S"].map((name, i) => <span className="dp-ov-weekday" key={i}>{name}</span>)}
      {view === "month" && Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}
      {days.map((slice) => {
        const events = [...slice.events, ...slice.blocks];
        const tasks = slice.tasks.filter((task) => !task.doneAt).length;
        const details = [...events.map((event) => event.title), ...slice.tasks.map((task) => task.title)].join(" · ") || "Nothing planned";
        return <button key={slice.day} className={`dp-ov-range-day ${slice.day === day ? "is-today" : ""}`} onClick={open}
          title={`${slice.day}: ${details}`} aria-label={`${slice.day}, ${events.length} events, ${tasks} tasks left. Open ${view}`}>
          {view === "week" && <small>{new Date(`${slice.day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" })}</small>}
          <strong>{Number(slice.day.slice(-2))}</strong>
          <span className="dp-ov-day-count">{tasks > 0 ? `${tasks} task${tasks === 1 ? "" : "s"}` : events.length ? `${events.length} event${events.length === 1 ? "" : "s"}` : "—"}</span>
          {view === "week" && <><small>{events.length} events</small>{events.slice(0, 3).map((event, i) => <span className="dp-ov-week-event" key={i}>{event.title}</span>)}{events.length > 3 && <small>+{events.length - 3} more</small>}</>}
        </button>;
      })}
    </div>
  </div>;
}
