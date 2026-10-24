import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { CalendarDays, Pencil, RefreshCw, Repeat, X } from "lucide-react";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { api, errorMessage, type Calendar, type CalendarAccount, type CalendarSetup, type Routine, type RoutineFields } from "./api";
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

function providerName(account: CalendarAccount): string {
  if (account.provider === "google") return "Google";
  if (account.provider === "microsoft") return "Outlook";
  return account.server.includes("icloud.com") ? "iCloud" : "CalDAV";
}

type Busy = "google" | "microsoft" | "caldav" | "link" | "refresh" | "publish" | null;

/** Calendar accounts and links: their events show as busy time, and the
 * plan can be published into one calendar. */
export function CalendarsDialog({ start, onClose, onChanged }: { start?: "google" | "microsoft" | "caldav"; onClose: () => void; onChanged: () => void }) {
  const [setup, setSetup] = useState<CalendarSetup | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<"caldav" | "link" | null>(null);

  const load = useCallback(() => {
    api.calendarSetup().then(setSetup, (e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  /** Runs a change; returns whether it worked. */
  const run = async (kind: Busy, change: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await change();
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

  // A sign-in still waiting on the browser stops when the dialog closes.
  useEffect(() => () => void api.cancelCalendarSignIn(), []);

  const today = todayNow();
  const accounts = setup?.accounts ?? [];
  const calendars = setup?.calendars ?? [];
  const links = calendars.filter((c) => !c.accountId);
  const writable = calendars.filter((c) => c.writable && c.accountId);
  const publishing = calendars.find((c) => c.publish);
  const accountOf = (c: Calendar) => accounts.find((a) => a.id === c.accountId);
  const signingIn = busy === "google" || busy === "microsoft";

  const connect = (provider: "google" | "microsoft") => run(provider, () => api.connectCalendar(provider, today));

  // Opened from a "Connect" button: go straight into that sign-in.
  const started = useRef(false);
  useEffect(() => {
    if (!setup || !start || started.current) return;
    started.current = true;
    if (start === "caldav") setForm("caldav");
    else if (setup.available[start]) void connect(start);
    // connect only reads values captured with setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, start]);

  return (
    <Dialog icon={<CalendarDays size={16} strokeWidth={1.75} />} title="Calendars" onClose={onClose}>
      <p className="dp-hint">
        Your meetings show on the planner as busy time, so tasks are planned around them, and your plan can appear in your calendar. Sign-ins stay on
        this computer and aren't synced.
      </p>
      {error && <p className="dp-dialog-error">{error}</p>}

      {accounts.map((account) => (
        <section key={account.id} className="dp-account">
          <header className="dp-account-head">
            <span className="dp-account-provider">{providerName(account)}</span>
            <b className="dp-account-name">{account.name}</b>
            {account.signedOut && (
              <button
                className="btn btn-sm"
                disabled={busy !== null || (account.provider !== "caldav" && !setup?.available[account.provider])}
                title={`Sign in to ${providerName(account)} again`}
                onClick={() => (account.provider === "caldav" ? setForm("caldav") : void connect(account.provider))}
              >
                <RefreshCw size={14} strokeWidth={1.75} /> Reconnect
              </button>
            )}
            <ConfirmButton
              className="btn btn-sm btn-ghost is-danger"
              confirmText="Disconnect?"
              onConfirm={() => run(null, () => api.removeCalendarAccount(account.id))}
            >
              Disconnect
            </ConfirmButton>
          </header>
          {account.problem && <p className="dp-setup-problem">{account.problem}</p>}
          <ul className="dp-account-calendars">
            {calendars
              .filter((c) => c.accountId === account.id)
              .map((c) => (
                <li key={c.id}>
                  <label>
                    <input type="checkbox" checked={c.shown} onChange={(e) => run(null, () => api.showCalendar(c.id, e.currentTarget.checked, today))} />
                    <i className="dp-setup-dot" style={{ background: colorOf(c.color) }} />
                    <span>{c.name}</span>
                  </label>
                  {c.problem ? (
                    <span className="dp-setup-problem">{c.problem}</span>
                  ) : (
                    c.shown && <span className="dim">Updated {ago(c.refreshedAt)}</span>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}

      {signingIn ? (
        <div className="dp-connecting" role="status">
          <RefreshCw size={14} strokeWidth={1.75} className="dp-spin" />
          <span>Finish signing in to {busy === "google" ? "Google" : "Outlook"} in your browser, then come back here.</span>
          <button className="btn btn-sm btn-ghost" onClick={() => void api.cancelCalendarSignIn()}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="dp-connect">
          <span className="menu-heading">Connect</span>
          <ProviderButton name="Google" available={setup?.available.google} disabled={busy !== null} onClick={() => connect("google")} />
          <ProviderButton name="Outlook" available={setup?.available.microsoft} disabled={busy !== null} onClick={() => connect("microsoft")} />
          <ProviderButton name="iCloud" available disabled={busy !== null} onClick={() => setForm(form === "caldav" ? null : "caldav")} />
        </div>
      )}
      {form === "caldav" && (
        <CaldavForm
          busy={busy === "caldav"}
          onConnect={async (server, username, password) => {
            if (await run("caldav", () => api.connectCaldav(server, username, password, today))) setForm(null);
          }}
        />
      )}

      {accounts.length > 0 && (
        <section className="dp-publish">
          <span className="menu-heading">Your plan in your calendar</span>
          <p className="dp-hint">
            Axiom can add your planned blocks for the next two weeks to a calendar, so they're on your phone and others see you're busy. Change
            them in Axiom: edits made in the calendar are replaced.
          </p>
          <div className="dp-publish-row">
            <select
              value={publishing?.id ?? ""}
              disabled={busy !== null}
              aria-label="Calendar to publish the plan into"
              onChange={(e) => run("publish", () => api.publishTo(e.currentTarget.value || null, today))}
            >
              <option value="">Don't add my plan to a calendar</option>
              {writable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({accountOf(c)?.name})
                </option>
              ))}
            </select>
            {busy === "publish" && <RefreshCw size={14} strokeWidth={1.75} className="dp-spin" />}
          </div>
          {publishing?.problem && <p className="dp-setup-problem">{publishing.problem}</p>}
          {accounts
            .filter((a) => !calendars.some((c) => c.accountId === a.id && c.writable && c.name === "Axiom"))
            .map((a) => (
              <button key={a.id} className="btn btn-sm btn-ghost dp-setup-refresh" disabled={busy !== null} onClick={() => run("publish", () => api.createPlanCalendar(a.id, today))}>
                Make an "Axiom" calendar in {providerName(a)} ({a.name}) and use it
              </button>
            ))}
          {accounts.some((a) => a.provider === "google") && (
            <p className="dim dp-setup-note">For Google, Axiom can only add events to a calendar it made, so your other calendars are never changed.</p>
          )}
        </section>
      )}

      {(accounts.length > 0 || links.length > 0) && (
        <button className="btn btn-sm btn-ghost dp-setup-refresh" disabled={busy !== null} onClick={() => run("refresh", () => api.refreshCalendars(today, true))}>
          <RefreshCw size={13} strokeWidth={1.75} className={busy === "refresh" ? "dp-spin" : undefined} /> {busy === "refresh" ? "Updating…" : "Update now"}
        </button>
      )}

      <section className="dp-links">
        <span className="menu-heading">Calendar links</span>
        {links.length > 0 && (
          <ul className="dp-setup-list">
            {links.map((c) => (
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
        {form === "link" ? (
          <LinkForm busy={busy === "link"} onAdd={(name, url, color) => run("link", () => api.addCalendar(name, url, color, today)).then((ok) => ok && setForm(null))} />
        ) : (
          <button className="btn btn-sm btn-ghost dp-setup-refresh" onClick={() => setForm("link")}>
            Add a read-only iCal link
          </button>
        )}
      </section>
    </Dialog>
  );
}

/** Connect button for one provider; greyed out when this version can't connect to it. */
export function ProviderButton({ name, available, disabled, onClick }: { name: string; available: boolean | undefined; disabled: boolean; onClick: () => void }) {
  return (
    <button
      className="btn btn-sm dp-provider"
      disabled={disabled || !available}
      title={available ? `Connect a ${name} account` : `${name} isn't available in this version of Axiom yet.`}
      onClick={onClick}
    >
      {name}
    </button>
  );
}

function CaldavForm({ busy, onConnect }: { busy: boolean; onConnect: (server: string, username: string, password: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [other, setOther] = useState(false);
  const [server, setServer] = useState("");

  return (
    <form
      className="dp-setup-form dp-caldav"
      onSubmit={(e) => {
        e.preventDefault();
        onConnect(other ? server : "", username, password);
      }}
    >
      <p className="dp-hint">
        Use your Apple Account email and an <b>app-specific password</b> (not your normal password). Make one at account.apple.com → Sign-In and
        Security → App-Specific Passwords.
      </p>
      {other && <input className="dp-editor-title" value={server} placeholder="Server, e.g. https://caldav.fastmail.com/" onChange={(e) => setServer(e.currentTarget.value)} />}
      <input className="dp-editor-title" value={username} placeholder="Email" autoComplete="username" onChange={(e) => setUsername(e.currentTarget.value)} />
      <input
        className="dp-editor-title"
        type="password"
        value={password}
        placeholder="App-specific password (xxxx-xxxx-xxxx-xxxx)"
        autoComplete="off"
        onChange={(e) => setPassword(e.currentTarget.value)}
      />
      <div className="row">
        <button className="btn btn-sm" type="submit" disabled={busy || !username.trim() || !password.trim()}>
          {busy ? "Connecting…" : other ? "Connect" : "Connect iCloud"}
        </button>
        <button className="btn btn-sm btn-ghost" type="button" onClick={() => setOther(!other)}>
          {other ? "Use iCloud" : "Another CalDAV server"}
        </button>
      </div>
    </form>
  );
}

function LinkForm({ busy, onAdd }: { busy: boolean; onAdd: (name: string, url: string, color: string) => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState("gray");

  return (
    <form
      className="dp-setup-form"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name, url, color);
      }}
    >
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
        <button className="btn btn-sm" type="submit" disabled={busy || !url.trim()}>
          {busy ? "Checking the link…" : "Add calendar"}
        </button>
      </div>
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
        <p className="dim">Anyone with a secret link can read that calendar, so don't share it. Links are read-only and update every 15 minutes.</p>
      </details>
    </form>
  );
}
