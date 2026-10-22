import { useCallback, useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Pencil, RefreshCw, Repeat, X } from "lucide-react";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { api, errorMessage, type Calendar, type Routine, type RoutineFields } from "./api";
import { BLOCK_COLORS, colorOf } from "./palette";
import { clock, duration, parseClock, parseDuration, today as todayNow } from "./time";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WORKDAYS = 0b0011111;
const EVERY_DAY = 0b1111111;

/** "Weekdays", "Every day", or "Mon, Wed, Fri". */
export function weekdayText(mask: number): string {
  if (mask === EVERY_DAY) return "Every day";
  if (mask === WORKDAYS) return "Weekdays";
  if (mask === 0b1100000) return "Weekends";
  return WEEKDAYS.filter((_, i) => mask & (1 << i)).join(", ");
}

/** A centred dialog over the planner. */
function Dialog({ icon, title, onClose, children }: { icon: ReactNode; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dp-ritual-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dp-ritual dp-dialog" role="dialog" aria-label={title}>
        <header className="dp-ritual-head">
          <span className="dp-ritual-icon">{icon}</span>
          <span className="dp-ritual-name">{title}</span>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>
        <div className="dp-dialog-body">{children}</div>
      </div>
    </div>
  );
}

function Swatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="dp-swatches" role="radiogroup" aria-label="Colour">
      {BLOCK_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === value}
          aria-label={c}
          className={c === value ? "dp-swatch is-on" : "dp-swatch"}
          style={{ "--block": colorOf(c) } as CSSProperties}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

// ---------- Routines ----------

/** Blocks that repeat: the gym on Monday mornings, lunch every weekday. */
export function RoutinesDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  /** The routine being edited; "new" for the add form. */
  const [editing, setEditing] = useState<Routine | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listRoutines().then(setRoutines, (e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const run = async (change: () => Promise<unknown>) => {
    try {
      await change();
      setEditing(null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
    load();
    onChanged();
  };

  return (
    <Dialog icon={<Repeat size={16} strokeWidth={1.75} />} title="Routines" onClose={onClose}>
      <p className="dp-hint">
        Routines put the same block on your plan every week, like a workout or lunch. They're added to each day from today on; past days keep
        what happened. To skip one day, delete that day's block.
      </p>
      {error && <p className="dp-dialog-error">{error}</p>}
      {routines === null ? (
        <p className="dim">Loading…</p>
      ) : (
        <ul className="dp-setup-list">
          {routines.map((r) =>
            editing !== "new" && editing?.id === r.id ? (
              <li key={r.id}>
                <RoutineForm routine={r} onCancel={() => setEditing(null)} onSave={(f) => run(() => api.updateRoutine(r.id, f, todayNow()))} />
              </li>
            ) : (
              <li key={r.id} className="dp-setup-row">
                <i className="dp-setup-dot" style={{ background: colorOf(r.color) }} />
                <span className="dp-setup-main">
                  <b>{r.title}</b>
                  <span className="dim">
                    {clock(r.startMinute)}–{clock(r.startMinute + r.durationMinutes)} · {weekdayText(r.weekdays)}
                  </span>
                </span>
                <button className="icon-btn" aria-label={`Edit ${r.title}`} title="Edit" onClick={() => setEditing(r)}>
                  <Pencil size={14} strokeWidth={1.75} />
                </button>
                <ConfirmButton className="btn btn-sm btn-ghost is-danger" confirmText="Delete?" onConfirm={() => run(() => api.deleteRoutine(r.id, todayNow()))}>
                  Delete
                </ConfirmButton>
              </li>
            ),
          )}
          {routines.length === 0 && editing !== "new" && <li className="dim dp-setup-empty">No routines yet.</li>}
        </ul>
      )}
      {editing === "new" ? (
        <RoutineForm onCancel={() => setEditing(null)} onSave={(f) => run(() => api.createRoutine(f))} />
      ) : (
        <button className="btn btn-sm" onClick={() => setEditing("new")}>
          Add a routine
        </button>
      )}
    </Dialog>
  );
}

function RoutineForm({ routine, onSave, onCancel }: { routine?: Routine; onSave: (fields: RoutineFields) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(routine?.title ?? "");
  const [start, setStart] = useState(clock(routine?.startMinute ?? 12 * 60));
  const [length, setLength] = useState(duration(routine?.durationMinutes ?? 60));
  const [weekdays, setWeekdays] = useState(routine?.weekdays ?? WORKDAYS);
  const [color, setColor] = useState(routine?.color ?? "purple");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const startMinute = parseClock(start);
    const durationMinutes = parseDuration(length);
    if (!title.trim()) return setProblem("Give the routine a name.");
    if (startMinute === null) return setProblem("Enter a start time like 07:30.");
    if (durationMinutes === null || durationMinutes < 5) return setProblem("Enter a length like 45m or 1h.");
    if (startMinute + durationMinutes > 24 * 60) return setProblem("A routine has to end by midnight.");
    if (!weekdays) return setProblem("Pick at least one day.");
    onSave({ title: title.trim(), startMinute, durationMinutes, weekdays, color });
  };

  return (
    <form className="dp-setup-form" onSubmit={submit}>
      <input autoFocus className="dp-editor-title" value={title} placeholder="e.g. Gym, Lunch, Weekly review" onChange={(e) => setTitle(e.currentTarget.value)} />
      <div className="dp-editor-row">
        <label>
          Start
          <input type="time" value={start} onChange={(e) => setStart(e.currentTarget.value)} />
        </label>
        <label>
          Length
          <input value={length} onChange={(e) => setLength(e.currentTarget.value)} />
        </label>
      </div>
      <div className="dp-weekdays" role="group" aria-label="Days">
        {WEEKDAYS.map((name, i) => (
          <button
            key={name}
            type="button"
            aria-pressed={!!(weekdays & (1 << i))}
            className={weekdays & (1 << i) ? "is-on" : undefined}
            onClick={() => setWeekdays(weekdays ^ (1 << i))}
          >
            {name}
          </button>
        ))}
      </div>
      <Swatches value={color} onChange={setColor} />
      {problem && <p className="dp-editor-problem">{problem}</p>}
      <div className="row">
        <button className="btn btn-sm" type="submit">
          {routine ? "Save" : "Add routine"}
        </button>
        <button className="btn btn-sm btn-ghost" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------- Calendars ----------

/** "just now", "5 min ago", "3 h ago". */
function ago(iso: string | null): string {
  if (!iso) return "not read yet";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

/** Calendars imported from private iCal links, shown as busy time. */
export function CalendarsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [calendars, setCalendars] = useState<Calendar[] | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState("gray");
  const [busy, setBusy] = useState<"add" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listCalendars().then(setCalendars, (e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const run = async (kind: "add" | "refresh" | null, change: () => Promise<unknown>) => {
    setBusy(kind);
    try {
      await change();
      setError(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
      load();
      onChanged();
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await run("add", () => api.addCalendar(name, url, color, todayNow()))) {
      setName("");
      setUrl("");
    }
  };

  return (
    <Dialog icon={<CalendarDays size={16} strokeWidth={1.75} />} title="Calendars" onClose={onClose}>
      <p className="dp-hint">
        Show your meetings on the planner as busy time, so tasks are planned around them. Axiom only reads the calendar; it never changes it.
        The link stays on this computer and isn't synced.
      </p>
      {error && <p className="dp-dialog-error">{error}</p>}
      {calendars && calendars.length > 0 && (
        <ul className="dp-setup-list">
          {calendars.map((c) => (
            <li key={c.id} className="dp-setup-row">
              <i className="dp-setup-dot" style={{ background: colorOf(c.color) }} />
              <span className="dp-setup-main">
                <b>{c.name}</b>
                {c.problem ? <span className="dp-setup-problem">{c.problem}</span> : <span className="dim">Updated {ago(c.refreshedAt)}</span>}
              </span>
              <ConfirmButton className="btn btn-sm btn-ghost is-danger" confirmText="Remove?" onConfirm={() => run(null, () => api.removeCalendar(c.id))}>
                Remove
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
      {calendars && calendars.length > 0 && (
        <button className="btn btn-sm btn-ghost dp-setup-refresh" disabled={busy !== null} onClick={() => run("refresh", () => api.refreshCalendars(todayNow(), true))}>
          <RefreshCw size={13} strokeWidth={1.75} className={busy === "refresh" ? "dp-spin" : undefined} /> {busy === "refresh" ? "Updating…" : "Update now"}
        </button>
      )}

      <form className="dp-setup-form" onSubmit={add}>
        <p className="menu-heading">Add a calendar</p>
        <input className="dp-editor-title" value={name} placeholder="Name, e.g. Work" onChange={(e) => setName(e.currentTarget.value)} />
        <input
          className="dp-editor-title"
          value={url}
          placeholder="Secret iCal address (https://… .ics)"
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setUrl(e.currentTarget.value)}
        />
        <Swatches value={color} onChange={setColor} />
        <div className="row">
          <button className="btn btn-sm" type="submit" disabled={busy !== null || !url.trim()}>
            {busy === "add" ? "Checking the link…" : "Add calendar"}
          </button>
        </div>
      </form>

      <details className="dp-setup-help">
        <summary>Where do I find the link?</summary>
        <p>
          <b>Google Calendar:</b> on the web, open Settings, choose your calendar under "Settings for my calendars", then copy{" "}
          <i>Secret address in iCal format</i> from "Integrate calendar".
        </p>
        <p>
          <b>Outlook:</b> on the web, open Settings → Calendar → Shared calendars. Under "Publish a calendar", pick the calendar and{" "}
          <i>Can view all details</i>, select Publish, then copy the ICS link.
        </p>
        <p>
          <b>Apple iCloud:</b> share the calendar as a Public Calendar and copy its webcal:// link.
        </p>
        <p className="dim">Anyone with a secret link can read that calendar, so don't share it. Calendars update every 15 minutes while the planner is open.</p>
      </details>
    </Dialog>
  );
}
