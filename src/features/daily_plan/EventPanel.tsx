import { useEffect, useRef, useState, type FormEvent } from "react";
import { ExternalLink, MapPin, Pencil, Repeat, Trash2, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauri } from "@tauri-apps/api/core";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { api, errorMessage, type CalendarEvent, type CalendarSetup, type Day, type EventEdit } from "./api";
import { colorOf } from "./palette";
import { clock, dayOf, duration, parseClock } from "./time";

type Act = (change: () => Promise<unknown>) => Promise<void>;

interface EventPanelProps {
  event: CalendarEvent;
  /** For the calendar's name and whose it is. */
  setup: CalendarSetup | null;
  today: Day;
  act: Act;
  onClose: () => void;
}

/** Notes as plain text: Google keeps them as HTML. */
function plainText(notes: string): string {
  return notes
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const minuteOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

/** The open calendar event, under the inbox: its details, and editing it in its own calendar. */
export function EventPanel({ event, setup, today, act, onClose }: EventPanelProps) {
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    root.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [event.id]);

  const calendar = setup?.calendars.find((c) => c.id === event.calendarId);
  const account = setup?.accounts.find((a) => a.id === calendar?.accountId);
  const provider = !account
    ? "Calendar link"
    : account.provider === "google"
      ? "Google"
      : account.provider === "microsoft"
        ? "Outlook"
        : account.server.includes("icloud.com")
          ? "iCloud"
          : "CalDAV";
  const start = event.startAt ? new Date(event.startAt) : null;
  const end = event.endAt ? new Date(event.endAt) : null;
  const notes = plainText(event.description);

  // Why it can't be changed here, when it can't.
  const readOnly = event.editable
    ? null
    : !calendar?.accountId
      ? "From a calendar link, which is read-only. Connect the account in Calendars to change its events here."
      : account?.provider === "caldav" && event.recurring
        ? "Repeating events from this calendar can only be changed in its own app."
        : !calendar.mine
          ? "This calendar is shared with you to view only."
          : account?.provider === "google"
            ? "To change Google events here, connect Google again in Calendars and allow editing."
            : "This event can't be changed from Axiom.";

  const when = (() => {
    if (!start || !end) return event.allDay ? "All day" : `${clock(event.startMinute)}–${clock(event.startMinute + event.durationMinutes)}`;
    const dateText = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    if (event.allDay) {
      const last = new Date(end.getTime() - 86_400_000);
      return dayOf(start) === dayOf(last) ? `${dateText(start)} · all day` : `${dateText(start)} – ${dateText(last)} · all day`;
    }
    const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
    const endText = dayOf(start) === dayOf(end) ? clock(minuteOf(end)) : `${dateText(end)} ${clock(minuteOf(end))}`;
    return `${dateText(start)} · ${clock(minuteOf(start))}–${endText} (${duration(minutes)})`;
  })();

  return (
    <section className="dp-section dp-event-panel" ref={root} aria-label={`Event: ${event.title}`}>
      <header className="dp-event-head">
        <i className="dp-setup-dot" style={{ background: colorOf(event.color) }} />
        <span className="dp-event-source">
          {calendar?.name ?? "Calendar"} <span className="dim">· {provider}</span>
        </span>
        {event.link && (
          <button className="icon-btn" title={`Open in ${provider}`} aria-label={`Open in ${provider}`} onClick={() => isTauri() ? void openUrl(event.link!) : void window.open(event.link!, "_blank", "noopener,noreferrer")}>
            <ExternalLink size={14} strokeWidth={1.75} />
          </button>
        )}
        <button className="icon-btn" aria-label="Close" title="Close" onClick={onClose}>
          <X size={14} strokeWidth={1.75} />
        </button>
      </header>

      {editing ? (
        <EventForm
          event={event}
          start={start}
          end={end}
          notes={notes}
          onCancel={() => setEditing(false)}
          onSave={async (edit) => {
            setProblem(null);
            try {
              await api.updateEvent(event.id, edit, today);
              setEditing(false);
            } catch (e) {
              setProblem(errorMessage(e));
            }
            await act(async () => {});
          }}
          problem={problem}
        />
      ) : (
        <>
          <h3 className="dp-event-title">{event.title}</h3>
          <p className="dp-event-line">{when}</p>
          {event.recurring && (
            <p className="dp-event-line dim">
              <Repeat size={13} strokeWidth={1.75} /> Repeats
            </p>
          )}
          {event.location && (
            <p className="dp-event-line">
              <MapPin size={13} strokeWidth={1.75} /> {event.location}
            </p>
          )}
          {!event.busy && !event.allDay && <p className="dp-event-line dim">Shown as free</p>}
          {notes && <p className="dp-event-notes">{notes}</p>}
          {problem && <p className="dp-editor-problem">{problem}</p>}
          {readOnly ? (
            <p className="dp-hint dp-event-readonly">{readOnly}</p>
          ) : (
            <div className="row dp-event-actions">
              <button className="btn btn-sm" onClick={() => setEditing(true)}>
                <Pencil size={13} strokeWidth={1.75} /> Edit
              </button>
              <ConfirmButton
                className="btn btn-sm btn-ghost is-danger"
                confirmText={event.recurring ? "Delete this one?" : "Delete event?"}
                onConfirm={async () => {
                  setProblem(null);
                  try {
                    await api.deleteEvent(event.id, today);
                    onClose();
                  } catch (e) {
                    setProblem(errorMessage(e));
                  }
                  await act(async () => {});
                }}
              >
                <Trash2 size={13} strokeWidth={1.75} /> Delete
              </ConfirmButton>
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface EventFormProps {
  event: CalendarEvent;
  start: Date | null;
  end: Date | null;
  notes: string;
  problem: string | null;
  onSave: (edit: EventEdit) => Promise<void>;
  onCancel: () => void;
}

/** Edits an event; only what was changed is sent to the calendar. */
function EventForm({ event, start, end, notes, problem, onSave, onCancel }: EventFormProps) {
  const initialDay = start ? dayOf(start) : event.day;
  const initialStart = clock(start ? minuteOf(start) : event.startMinute);
  const initialEnd = clock(end ? minuteOf(end) : event.startMinute + event.durationMinutes);
  const [title, setTitle] = useState(event.title);
  const [day, setDay] = useState(initialDay);
  const [from, setFrom] = useState(initialStart);
  const [to, setTo] = useState(initialEnd);
  const [location, setLocation] = useState(event.location);
  const [description, setDescription] = useState(notes);
  const [saving, setSaving] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  // A timed event spanning midnight is moved in its calendar, not here.
  const timesEditable = !event.allDay && (!start || !end || dayOf(start) === dayOf(end));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const edit: EventEdit = {};
    if (!title.trim()) return setLocal("Give the event a name.");
    if (title !== event.title) edit.title = title.trim();
    if (location !== event.location) edit.location = location;
    if (description !== notes) edit.description = description;
    if (timesEditable && (day !== initialDay || from !== initialStart || to !== initialEnd)) {
      const startMinute = parseClock(from);
      const endMinute = to === "00:00" ? 24 * 60 : parseClock(to);
      if (startMinute === null || endMinute === null || endMinute <= startMinute) return setLocal("The event has to end after it starts.");
      edit.when = { day, startMinute, endMinute };
    }
    if (!Object.keys(edit).length) return onCancel();
    setLocal(null);
    setSaving(true);
    await onSave(edit);
    setSaving(false);
  };

  return (
    <form className="dp-setup-form dp-event-form" onSubmit={submit}>
      <input className="dp-editor-title" value={title} aria-label="Title" onChange={(e) => setTitle(e.currentTarget.value)} autoFocus />
      {timesEditable && (
        <div className="dp-editor-row">
          <label>
            Day
            <input type="date" value={day} onChange={(e) => setDay(e.currentTarget.value)} />
          </label>
          <label>
            Starts
            <input type="time" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
          </label>
          <label>
            Ends
            <input type="time" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
          </label>
        </div>
      )}
      <input className="dp-editor-title" value={location} placeholder="Location" aria-label="Location" onChange={(e) => setLocation(e.currentTarget.value)} />
      <textarea className="dp-event-notes-input" value={description} placeholder="Notes" aria-label="Notes" rows={4} onChange={(e) => setDescription(e.currentTarget.value)} />
      {event.recurring && <p className="dp-hint">This changes this occurrence only.</p>}
      {(local ?? problem) && <p className="dp-editor-problem">{local ?? problem}</p>}
      <div className="row">
        <button className="btn btn-sm" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="btn btn-sm btn-ghost" type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
