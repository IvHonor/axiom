import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { BarChart3, CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, Moon, Plus, Repeat, RotateCcw, Settings2, Sunrise, X } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { Dropdown } from "../../shell/ui/Dropdown";
import { api, errorMessage, nudgeCalendars, type CalendarSetup, type DayPlan, type PlanTask, type Settings } from "./api";
import { Capacity } from "./Capacity";
import { FocusBar, FocusMode } from "./Focus";
import { Insights } from "./Insights";
import { PlanRitual, ShutdownRitual } from "./Rituals";
import { setPlanUi, usePlanUi, type PlanView } from "./planUi";
import { CalendarsDialog, ProviderButton, RoutinesDialog } from "./Setup";
import { TaskPanel } from "./TaskPanel";
import { Timeline } from "./Timeline";
import { addDays, clock, longDay, mediumDay, mondayOf, nowMinute, parseClock, relativeDay, today as todayNow } from "./time";
import { WeekView } from "./WeekView";

const VIEWS: { id: PlanView; label: string; icon: typeof CalendarDays }[] = [
  { id: "day", label: "Day", icon: CalendarDays },
  { id: "week", label: "Week", icon: CalendarRange },
  { id: "insights", label: "Insights", icon: BarChart3 },
];

/** "Not now" on the connect-a-calendar card, remembered on this computer. */
const CONNECT_HINT_KEY = "axiom.dailyPlan.connectHintDismissed";

/** How often to ask for a calendar update while the planner is open (the
 * backend only re-reads calendars older than 15 minutes). */
const CALENDAR_CHECK_MS = 5 * 60_000;

/** The Daily Plan: the day's tasks beside its timeline, the week, and insights. */
export function DailyPlanView() {
  const { view, dialog, todayAsked } = usePlanUi();
  /** Bumped when calendars or routines change, so every view reloads. */
  const [version, setVersion] = useState(0);
  const [calendars, setCalendars] = useState<CalendarSetup | null>(null);
  const [today, setToday] = useState(todayNow);
  const [day, setDay] = useState(todayNow);
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A one-off message, e.g. what Replan did. */
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  /** The task open in focus mode. */
  const [focusId, setFocusId] = useState<string | null>(null);
  const [ritual, setRitual] = useState<"plan" | "shutdown" | null>(null);
  /** "Not now" on the plan/shutdown prompt, for this session. */
  const [dismissed, setDismissed] = useState(false);
  const quickAdd = useRef<HTMLInputElement>(null);

  // Notice midnight: "today" moves on even if the app stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayNow()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const reload = useCallback(async () => {
    try {
      setPlan(await api.getDay(day, todayNow()));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [day]);

  useEffect(() => void reload(), [reload, today, version]);
  useDataChanged(reload);

  const setView = (next: PlanView) => setPlanUi({ view: next });
  const setDialog = (next: "routines" | "calendars" | null) => setPlanUi({ dialog: next && { kind: next } });
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // "Today" in the sidebar.
  useEffect(() => {
    if (todayAsked) setDay(todayNow());
  }, [todayAsked]);

  // Whether any calendar is connected, for the connect card.
  useEffect(() => {
    api.calendarSetup().then(setCalendars, () => setCalendars(null));
  }, [version]);
  const showError = useCallback((message: string) => setError(message), []);

  // Imported calendars stay fresh while the planner is open.
  useEffect(() => {
    const check = () =>
      api.refreshCalendars(todayNow(), false).then(
        (changed) => changed && bump(),
        () => {
          // A calendar that can't be read records why; the Calendars dialog shows it.
        },
      );
    void check();
    const timer = window.setInterval(check, CALENDAR_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [bump]);

  /** Runs a change, shows any error, then reloads so the view matches the database. */
  const act = useCallback(
    async (change: () => Promise<unknown>) => {
      try {
        await change();
        nudgeCalendars(todayNow());
      } catch (e) {
        setError(errorMessage(e));
      }
      await reload();
    },
    [reload],
  );

  const step = view === "week" ? 7 : 1;
  const unit = view === "week" ? "week" : "day";

  // Keyboard: N or / to add, T for today, arrows for other days (or weeks).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || target.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if (e.key === "n" || e.key === "/") {
        e.preventDefault();
        quickAdd.current?.focus();
      } else if (e.key === "t") setDay(todayNow());
      else if (e.key === "ArrowLeft") setDay((d) => addDays(d, -step));
      else if (e.key === "ArrowRight") setDay((d) => addDays(d, step));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // Timers tick every second while one is running, otherwise twice a minute.
  const ticking = !!plan?.running || focusId !== null;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), ticking ? 1000 : 30_000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  const isToday = day === today;
  const weekStart = mondayOf(day);
  const thisWeek = weekStart === mondayOf(today);
  const minute = nowMinute();
  const all = plan ? [...plan.tasks, ...plan.earlier, ...plan.inbox, ...(plan.running ? [plan.running] : [])] : [];
  const focusTask = all.find((t) => t.id === focusId);
  const missed =
    !!plan && isToday && plan.blocks.some((b) => b.startMinute < minute && plan.tasks.some((t) => t.id === b.taskId && !t.doneAt));
  const endingSoon = !!plan && isToday && minute >= plan.settings.dayEndMinute - 30;
  const prompt =
    !plan || !isToday || dismissed || ritual
      ? null
      : plan.info.shutdownAt
        ? null
        : endingSoon
          ? "shutdown"
          : !plan.info.plannedAt && minute < plan.settings.dayEndMinute
            ? "plan"
            : null;

  const replan = () =>
    act(async () => {
      const result = await api.replan(day, nowMinute());
      setNotice(
        [
          result.scheduled.length ? `Moved ${result.scheduled.join(", ")} to the next free time.` : "Nothing needed moving.",
          result.leftOver.length ? `No room left today for ${result.leftOver.join(", ")}: ${result.leftOver.length === 1 ? "it's" : "they're"} back in your list.` : "",
        ].join(" "),
      );
    });

  const focusOn = (task: PlanTask) => {
    setFocusId(task.id);
    if (!task.timerStartedAt) void act(() => api.startTimer(task.id));
  };

  return (
    <div className="dp-view">
      <header className="dp-toolbar">
        <div className="pb-segmented" role="tablist" aria-label="Planner view">
          {VIEWS.map(({ id, label, icon: Icon }) => (
            <button key={id} role="tab" aria-selected={view === id} className={view === id ? "is-active" : undefined} onClick={() => setView(id)}>
              <Icon size={14} strokeWidth={1.5} /> {label}
            </button>
          ))}
        </div>
        {view === "insights" ? (
          <h2 className="dp-date dp-nav">How your planning is going</h2>
        ) : (
          <div className="dp-nav">
          <button className="icon-btn" aria-label={`Previous ${unit}`} title={`Previous ${unit} (←)`} onClick={() => setDay(addDays(day, -step))}>
            <ChevronLeft size={16} strokeWidth={1.75} />
          </button>
          <button className="btn btn-sm btn-ghost" disabled={view === "week" ? thisWeek : isToday} onClick={() => setDay(today)} title="Today (T)">
            {view === "week" ? "This week" : "Today"}
          </button>
          <button className="icon-btn" aria-label={`Next ${unit}`} title={`Next ${unit} (→)`} onClick={() => setDay(addDays(day, step))}>
            <ChevronRight size={16} strokeWidth={1.75} />
          </button>
          {view === "week" ? (
            <h2 className="dp-date">
              Week of {longDay(weekStart).replace(/^\S+ /, "")}
              {!thisWeek && <span className="dp-date-tag">{weekStart < mondayOf(today) ? "Past" : "Ahead"}</span>}
            </h2>
          ) : (
          <div className="dp-date-block">
            <h2 className="dp-date">
              {mediumDay(day)}
              {!isToday && <span className="dp-date-tag">{relativeDay(day, today)}</span>}
              {plan?.info.shutdownAt && (
                <span className="dp-date-tag is-done">
                  <Check size={11} strokeWidth={2.5} /> Shut down
                </span>
              )}
            </h2>
            {plan?.info.intention && <p className="dp-intention">{plan.info.intention}</p>}
          </div>
          )}
          </div>
        )}
        {view === "day" && isToday && plan && (
          <div className="dp-rituals">
            <button className="btn btn-sm btn-ghost" onClick={() => setRitual("plan")} title="Plan your day">
              <Sunrise size={13} strokeWidth={1.75} /> <span className="dp-btn-label">Plan day</span>
            </button>
            <button className="btn btn-sm btn-ghost" onClick={replan} disabled={!missed} title={missed ? "Move missed work to the next free time" : "Nothing has been missed"}>
              <RotateCcw size={13} strokeWidth={1.75} /> <span className="dp-btn-label">Replan</span>
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setRitual("shutdown")} title="Wrap up the day">
              <Moon size={13} strokeWidth={1.75} /> <span className="dp-btn-label">Shut down</span>
            </button>
          </div>
        )}
        {view === "day" && plan && <Capacity plan={plan} />}
        {plan && (
          <SettingsMenu
            settings={plan.settings}
            onSave={(s) => act(() => api.updateSettings(s))}
            onRoutines={() => setDialog("routines")}
            onCalendars={() => setDialog("calendars")}
          />
        )}
      </header>

      {plan?.running && <FocusBar task={plan.running} now={now} act={act} onOpen={() => setFocusId(plan.running!.id)} />}

      {view === "day" && prompt && (
        <div className="dp-prompt">
          {prompt === "plan" ? <Sunrise size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
          <span>
            {prompt === "plan"
              ? "Start with a plan: a few minutes now saves a scattered day."
              : `Your working day ends at ${clock(plan!.settings.dayEndMinute)}. Close it out so tomorrow starts clean.`}
          </span>
          <button className="btn btn-sm" onClick={() => setRitual(prompt)}>
            {prompt === "plan" ? "Plan my day" : "Shut down"}
          </button>
          <button className="icon-btn" aria-label="Not now" title="Not now" onClick={() => setDismissed(true)}>
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {view === "day" && calendars && <ConnectCard setup={calendars} />}

      {view === "day" && <QuickAdd inputRef={quickAdd} onAdd={(text) => act(() => api.quickAdd(text, day, todayNow()))} />}

      {error && (
        <div className="dp-error" role="alert">
          <span>{error}</span>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setError(null)}>
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
      )}
      {notice && (
        <div className="dp-notice" role="status">
          <span>{notice}</span>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {view === "week" ? (
        <WeekView
          weekStart={weekStart}
          today={today}
          version={version}
          onError={showError}
          onOpenDay={(d) => {
            setDay(d);
            setView("day");
          }}
        />
      ) : view === "insights" ? (
        <Insights today={today} version={version} onError={showError} />
      ) : plan ? (
        <div className="dp-body">
          <TaskPanel plan={plan} today={today} now={now} act={act} onFocus={focusOn} />
          <Timeline plan={plan} today={today} act={act} />
        </div>
      ) : (
        <p className="dim dp-loading">Loading your day…</p>
      )}

      {plan && focusTask && (
        <FocusMode
          task={focusTask}
          card={plan.cards.find((c) => c.id === focusTask.boardTaskId)}
          plan={plan}
          now={now}
          act={act}
          onClose={() => setFocusId(null)}
        />
      )}
      {dialog?.kind === "routines" && <RoutinesDialog onClose={() => setDialog(null)} onChanged={bump} />}
      {dialog?.kind === "calendars" && <CalendarsDialog start={dialog.start} onClose={() => setDialog(null)} onChanged={bump} />}
      {plan && isToday && ritual === "plan" && <PlanRitual plan={plan} today={today} act={act} onClose={() => setRitual(null)} />}
      {plan && isToday && ritual === "shutdown" && <ShutdownRitual plan={plan} today={today} act={act} onClose={() => setRitual(null)} />}
    </div>
  );
}

/** Until a calendar is connected: one click to connect Google, Outlook or iCloud. */
function ConnectCard({ setup }: { setup: CalendarSetup }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(CONNECT_HINT_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (hidden || setup.accounts.length > 0 || setup.calendars.length > 0) return null;
  const start = (provider: "google" | "microsoft" | "caldav") => setPlanUi({ dialog: { kind: "calendars", start: provider } });
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(CONNECT_HINT_KEY, "1");
    } catch {
      // Without storage the card comes back next time; that's all.
    }
  };

  return (
    <div className="dp-connect-card">
      <CalendarDays size={18} strokeWidth={1.75} className="dp-connect-card-icon" />
      <div className="dp-connect-card-text">
        <b>See your meetings here</b>
        <span>Connect your calendar so tasks are planned around meetings, and your plan shows on your phone.</span>
      </div>
      <div className="dp-connect-card-actions">
        <ProviderButton name="Google" available={setup.available.google} disabled={false} onClick={() => start("google")} />
        <ProviderButton name="Outlook" available={setup.available.microsoft} disabled={false} onClick={() => start("microsoft")} />
        <ProviderButton name="iCloud" available disabled={false} onClick={() => start("caldav")} />
      </div>
      <button className="icon-btn" aria-label="Not now" title="Not now (Calendars stays in the sidebar)" onClick={dismiss}>
        <X size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function QuickAdd({ inputRef, onAdd }: { inputRef: React.RefObject<HTMLInputElement | null>; onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const value = text;
    setText("");
    await onAdd(value);
  };

  return (
    <form className="dp-quick" onSubmit={submit}>
      <label className="dp-quick-field">
        <Plus size={15} strokeWidth={1.75} />
        <input
          ref={inputRef}
          value={text}
          placeholder="Add a task… e.g. Write report 45m 2pm !"
          spellCheck={false}
          onChange={(e) => setText(e.currentTarget.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === "Escape" && (setText(""), e.currentTarget.blur())}
        />
        <kbd className="dp-kbd">N</kbd>
      </label>
      {focused && (
        <p className="dp-quick-help">
          <b>45m</b> or <b>1h30</b> for how long · <b>2pm</b> or <b>14:30</b> to schedule it · <b>tomorrow</b> or <b>inbox</b> for when ·{" "}
          <b>!</b> for a top priority
        </p>
      )}
    </form>
  );
}

interface SettingsMenuProps {
  settings: Settings;
  onSave: (s: Settings) => Promise<void>;
  onRoutines: () => void;
  onCalendars: () => void;
}

function SettingsMenu({ settings, onSave, onRoutines, onCalendars }: SettingsMenuProps) {
  const [start, setStart] = useState(clock(settings.dayStartMinute));
  const [end, setEnd] = useState(clock(settings.dayEndMinute));
  const [buffer, setBuffer] = useState(String(settings.bufferPercent));

  return (
    <Dropdown label="Planner settings" icon={<Settings2 size={16} strokeWidth={1.5} />}>
      {(close) => (
        <form
          className="dp-settings"
          onSubmit={(e) => {
            e.preventDefault();
            const dayStartMinute = parseClock(start);
            const dayEndMinute = end === "24:00" ? 24 * 60 : parseClock(end);
            if (dayStartMinute === null || dayEndMinute === null) return;
            close();
            void onSave({ dayStartMinute, dayEndMinute, bufferPercent: Math.round(Number(buffer) || 0) });
          }}
        >
          <p className="menu-heading">Working day</p>
          <div className="dp-settings-row">
            <label>
              Starts
              <input type="time" value={start} onChange={(e) => setStart(e.currentTarget.value)} />
            </label>
            <label>
              Ends
              <input type="time" value={end} onChange={(e) => setEnd(e.currentTarget.value)} />
            </label>
          </div>
          <label className="dp-settings-buffer">
            Keep spare
            <input type="number" min={0} max={60} step={5} value={buffer} onChange={(e) => setBuffer(e.currentTarget.value)} />%
          </label>
          <p className="dp-hint">Plans rarely go exactly to plan. A spare share of the day stops one overrun from wrecking the rest.</p>
          <button className="btn btn-sm" type="submit">
            Save
          </button>
          <div className="dp-settings-links">
            <button type="button" className="menu-item" onClick={() => (close(), onRoutines())}>
              <Repeat size={14} strokeWidth={1.75} /> Routines…
            </button>
            <button type="button" className="menu-item" onClick={() => (close(), onCalendars())}>
              <CalendarDays size={14} strokeWidth={1.75} /> Calendars…
            </button>
          </div>
        </form>
      )}
    </Dropdown>
  );
}
