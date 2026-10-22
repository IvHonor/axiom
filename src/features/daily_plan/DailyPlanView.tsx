import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Moon, Plus, RotateCcw, Settings2, Sunrise, X } from "lucide-react";
import { useDataChanged } from "../../lib/sync";
import { Dropdown } from "../../shell/ui/Dropdown";
import { api, errorMessage, type DayPlan, type PlanTask, type Settings } from "./api";
import { FocusBar, FocusMode } from "./Focus";
import { PlanRitual, ShutdownRitual } from "./Rituals";
import { TaskPanel } from "./TaskPanel";
import { Timeline } from "./Timeline";
import { addDays, clock, duration, longDay, nowMinute, parseClock, relativeDay, today as todayNow } from "./time";

/** The Daily Plan: the day's tasks beside its timeline. */
export function DailyPlanView() {
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

  useEffect(() => void reload(), [reload, today]);
  useDataChanged(reload);

  /** Runs a change, shows any error, then reloads so the view matches the database. */
  const act = useCallback(
    async (change: () => Promise<unknown>) => {
      try {
        await change();
      } catch (e) {
        setError(errorMessage(e));
      }
      await reload();
    },
    [reload],
  );

  // Keyboard: N or / to add, T for today, arrows for other days.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || target.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if (e.key === "n" || e.key === "/") {
        e.preventDefault();
        quickAdd.current?.focus();
      } else if (e.key === "t") setDay(todayNow());
      else if (e.key === "ArrowLeft") setDay((d) => addDays(d, -1));
      else if (e.key === "ArrowRight") setDay((d) => addDays(d, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Timers tick every second while one is running, otherwise twice a minute.
  const ticking = !!plan?.running || focusId !== null;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), ticking ? 1000 : 30_000);
    return () => window.clearInterval(timer);
  }, [ticking]);

  const isToday = day === today;
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
        <div className="dp-nav">
          <button className="icon-btn" aria-label="Previous day" title="Previous day (←)" onClick={() => setDay(addDays(day, -1))}>
            <ChevronLeft size={16} strokeWidth={1.75} />
          </button>
          <button className="btn btn-sm btn-ghost" disabled={isToday} onClick={() => setDay(today)} title="Today (T)">
            Today
          </button>
          <button className="icon-btn" aria-label="Next day" title="Next day (→)" onClick={() => setDay(addDays(day, 1))}>
            <ChevronRight size={16} strokeWidth={1.75} />
          </button>
          <div className="dp-date-block">
            <h2 className="dp-date">
              {longDay(day)}
              {!isToday && <span className="dp-date-tag">{relativeDay(day, today)}</span>}
              {plan?.info.shutdownAt && (
                <span className="dp-date-tag is-done">
                  <Check size={11} strokeWidth={2.5} /> Shut down
                </span>
              )}
            </h2>
            {plan?.info.intention && <p className="dp-intention">{plan.info.intention}</p>}
          </div>
        </div>
        {isToday && plan && (
          <div className="dp-rituals">
            <button className="btn btn-sm btn-ghost" onClick={() => setRitual("plan")} title="Plan your day">
              <Sunrise size={13} strokeWidth={1.75} /> Plan day
            </button>
            <button className="btn btn-sm btn-ghost" onClick={replan} disabled={!missed} title={missed ? "Move missed work to the next free time" : "Nothing has been missed"}>
              <RotateCcw size={13} strokeWidth={1.75} /> Replan
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setRitual("shutdown")} title="Wrap up the day">
              <Moon size={13} strokeWidth={1.75} /> Shut down
            </button>
          </div>
        )}
        {plan && <Capacity plan={plan} />}
        {plan && <SettingsMenu settings={plan.settings} onSave={(s) => act(() => api.updateSettings(s))} />}
      </header>

      {plan?.running && <FocusBar task={plan.running} now={now} act={act} onOpen={() => setFocusId(plan.running!.id)} />}

      {prompt && (
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

      <QuickAdd inputRef={quickAdd} onAdd={(text) => act(() => api.quickAdd(text, day, todayNow()))} />

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

      {plan ? (
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
      {plan && isToday && ritual === "plan" && <PlanRitual plan={plan} today={today} act={act} onClose={() => setRitual(null)} />}
      {plan && isToday && ritual === "shutdown" && <ShutdownRitual plan={plan} today={today} act={act} onClose={() => setRitual(null)} />}
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

/** Planned time against the working day, with room left for the unexpected. */
export function Capacity({ plan }: { plan: DayPlan }) {
  const planned = plannedMinutes(plan);
  const available = plan.settings.dayEndMinute - plan.settings.dayStartMinute;
  const comfortable = available * (1 - plan.settings.bufferPercent / 100);
  const state = planned > available ? "over" : planned > comfortable ? "tight" : "ok";
  const unsized = plan.tasks.filter((t) => !t.doneAt && t.estimateMinutes === null && !plan.blocks.some((b) => b.taskId === t.id)).length;
  const note =
    state === "over"
      ? `Over by ${duration(planned - available)}. Move something to another day.`
      : state === "tight"
        ? "Little room left for the unexpected."
        : `${duration(Math.max(0, Math.round(comfortable - planned)))} free, keeping ${plan.settings.bufferPercent}% spare.`;

  return (
    <div className={`dp-capacity is-${state}`} title={`Your day is ${clock(plan.settings.dayStartMinute)}–${clock(plan.settings.dayEndMinute)}.`}>
      <div className="dp-capacity-text">
        <span>
          <b>{duration(planned)}</b> planned of {duration(available)}
        </span>
        <span className="dp-capacity-note">
          {note}
          {unsized > 0 && ` ${unsized} task${unsized === 1 ? "" : "s"} without a time.`}
        </span>
      </div>
      <div className="dp-capacity-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(planned / available, 1) * 100}%` }} />
        <i style={{ left: `${100 - plan.settings.bufferPercent}%` }} />
      </div>
    </div>
  );
}

/** Mirrors `planned_minutes` in service.rs. */
export function plannedMinutes(plan: DayPlan): number {
  const blocksOf = (id: string) => plan.blocks.filter((b) => b.taskId === id).reduce((n, b) => n + b.durationMinutes, 0);
  const forTasks = plan.tasks.reduce((n, t) => n + (t.estimateMinutes ?? blocksOf(t.id)), 0);
  const other = plan.blocks.filter((b) => !b.taskId).reduce((n, b) => n + b.durationMinutes, 0);
  return forTasks + other;
}

function SettingsMenu({ settings, onSave }: { settings: Settings; onSave: (s: Settings) => Promise<void> }) {
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
        </form>
      )}
    </Dropdown>
  );
}
