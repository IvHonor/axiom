import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Check, Moon, Plus, Star, Sunrise, X } from "lucide-react";
import { api, MAX_FOCUS, trackedMinutes, type CarryTo, type Day, type DayPlan, type PlanTask } from "./api";
import { Capacity } from "./Capacity";
import { cardStatus, ProjectChip } from "./TaskPanel";
import { addDays, duration, nowMinute, parseDuration, relativeDay } from "./time";

type Act = (change: () => Promise<unknown>) => Promise<void>;

interface RitualProps {
  /** Today's plan, kept fresh by the view after every change. */
  plan: DayPlan;
  today: Day;
  act: Act;
  onClose: () => void;
}

// ---------- The frame both rituals share ----------

interface Step {
  title: string;
  body: ReactNode;
  /** Runs before moving on; may apply the step's choices. */
  onNext?: () => Promise<void>;
}

function RitualFrame({ icon, name, steps, finishLabel, onFinish, onClose }: {
  icon: ReactNode;
  name: string;
  steps: Step[];
  finishLabel: string;
  onFinish: () => Promise<void>;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const next = async () => {
    setBusy(true);
    try {
      await step.onNext?.();
      if (last) await onFinish();
      else setIndex(index + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dp-ritual-backdrop">
      <div className="dp-ritual" role="dialog" aria-label={name}>
        <header className="dp-ritual-head">
          <span className="dp-ritual-icon">{icon}</span>
          <span className="dp-ritual-name">{name}</span>
          <ol className="dp-steps" aria-label="Steps">
            {steps.map((s, i) => (
              <li key={s.title} className={i === index ? "is-current" : i < index ? "is-done" : undefined}>
                {s.title}
              </li>
            ))}
          </ol>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>
        <div className="dp-ritual-body">{step.body}</div>
        <footer className="dp-ritual-foot">
          {index > 0 && (
            <button className="btn btn-ghost" onClick={() => setIndex(index - 1)} disabled={busy}>
              Back
            </button>
          )}
          <button className="btn" onClick={() => void next()} disabled={busy}>
            {last ? finishLabel : "Next"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Today / Inbox / Drop (or Tomorrow / Inbox / Drop), one per task. */
function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <span className="dp-choice" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? "is-on" : undefined} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </span>
  );
}

function QuickAddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const value = text;
    setText("");
    await onAdd(value);
  };
  return (
    <form className="dp-quick-field dp-ritual-add" onSubmit={submit}>
      <Plus size={15} strokeWidth={1.75} />
      <input value={text} placeholder={placeholder} onChange={(e) => setText(e.currentTarget.value)} />
    </form>
  );
}

/** A task with its top-priority star and estimate, for choosing what matters. */
function PriorityRow({ task, focusFull, act }: { task: PlanTask; focusFull: boolean; act: Act }) {
  const starred = task.focusRank !== null;
  const [estimate, setEstimate] = useState(task.estimateMinutes ? duration(task.estimateMinutes) : "");
  useEffect(() => setEstimate(task.estimateMinutes ? duration(task.estimateMinutes) : ""), [task.estimateMinutes]);
  const saveEstimate = () => {
    const minutes = estimate.trim() ? parseDuration(estimate) : null;
    if (estimate.trim() && minutes === null) return;
    if (minutes !== task.estimateMinutes) void act(() => api.updateTask(task.id, { title: task.title, notes: task.notes, estimateMinutes: minutes }));
  };
  return (
    <li className="dp-ritual-row">
      <button
        className={`icon-btn dp-star${starred ? " is-on" : ""}`}
        aria-pressed={starred}
        disabled={!starred && focusFull}
        aria-label={starred ? "Remove from top priorities" : "Make a top priority"}
        onClick={() => act(() => api.setFocus(task.id, !starred))}
      >
        <Star size={15} strokeWidth={1.75} />
      </button>
      {starred && <span className="dp-rank">{task.focusRank}</span>}
      <span className="dp-title">{task.title}</span>
      <input
        className="dp-ritual-estimate"
        value={estimate}
        placeholder="time"
        aria-label={`How long ${task.title} will take`}
        onChange={(e) => setEstimate(e.currentTarget.value)}
        onBlur={saveEstimate}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </li>
  );
}

// ---------- Plan my day ----------

/** The morning ritual: deal with yesterday, choose today's work, pick what
 * matters most, and give it time. */
export function PlanRitual({ plan, today, act, onClose }: RitualProps) {
  const [leftovers, setLeftovers] = useState<Record<string, CarryTo>>(() => Object.fromEntries(plan.earlier.map((t) => [t.id, "today" as CarryTo])));
  const [intention, setIntention] = useState(plan.info.intention);
  // Fixed when the ritual opens: carrying leftovers over empties the list,
  // and the steps mustn't shift under the user.
  const [leftoverTasks] = useState(plan.earlier);
  const [scheduled, setScheduled] = useState<{ scheduled: string[]; leftOver: string[] } | null>(null);
  const focusFull = plan.tasks.filter((t) => t.focusRank !== null).length >= MAX_FOCUS;
  const unscheduled = plan.tasks.filter((t) => !t.doneAt && !plan.blocks.some((b) => b.taskId === t.id));

  const steps: Step[] = [];
  if (leftoverTasks.length > 0) {
    steps.push({
      title: "Yesterday",
      body: (
        <>
          <h3 className="dp-ritual-title">Some things didn't get done</h3>
          <p className="dp-ritual-lead">Bring them into today, park them in the inbox, or let them go.</p>
          <ul className="dp-ritual-list">
            {leftoverTasks.map((t) => (
              <li key={t.id} className="dp-ritual-row">
                <span className="dp-title">{t.title}</span>
                <span className="dp-from">{relativeDay(t.day!, today)}</span>
                <Choice<CarryTo>
                  value={leftovers[t.id] ?? "today"}
                  options={[["today", "Today"], ["inbox", "Inbox"], ["delete", "Drop"]]}
                  onChange={(v) => setLeftovers({ ...leftovers, [t.id]: v })}
                />
              </li>
            ))}
          </ul>
        </>
      ),
      onNext: async () => {
        for (const to of ["today", "inbox", "delete"] as CarryTo[]) {
          const ids = Object.entries(leftovers).filter(([id, v]) => v === to && plan.earlier.some((t) => t.id === id)).map(([id]) => id);
          if (ids.length) await act(() => api.carryOver(ids, to, today));
        }
      },
    });
  }

  steps.push({
    title: "Choose",
    body: (
      <>
        <h3 className="dp-ritual-title">What's on today?</h3>
        <p className="dp-ritual-lead">Pull in what you mean to work on. Leave the rest for another day.</p>
        <QuickAddLine placeholder="Add a task… e.g. Call the bank 20m" onAdd={(text) => act(() => api.quickAdd(text, today, today))} />
        <h4 className="dp-heading">Planned for today</h4>
        {plan.tasks.length ? (
          <ul className="dp-ritual-list">
            {plan.tasks.map((t) => (
              <li key={t.id} className="dp-ritual-row">
                <Check size={14} strokeWidth={2} className="dp-ritual-tick" />
                <span className="dp-title">{t.title}</span>
                {t.estimateMinutes && <span className="dp-chip">{duration(t.estimateMinutes)}</span>}
                <button className="icon-btn" title="Not today: back to the inbox" aria-label={`Move ${t.title} to the inbox`} onClick={() => act(() => api.moveTask(t.id, null))}>
                  <X size={14} strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dp-hint">Nothing yet.</p>
        )}
        {plan.suggestions.length > 0 && (
          <>
            <h4 className="dp-heading">From your boards</h4>
            <ul className="dp-ritual-list">
              {plan.suggestions.map((c) => (
                <li key={c.id} className="dp-ritual-row">
                  <button className="icon-btn dp-add" aria-label={`Add ${c.title}`} onClick={() => act(() => api.planCard(c.id, today))}>
                    <Plus size={14} strokeWidth={2} />
                  </button>
                  <span className="dp-title">{c.title}</span>
                  <ProjectChip card={c} />
                  <span className={cardStatus(c, today).urgent ? "dp-due is-urgent" : "dp-due"}>{cardStatus(c, today).text}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {plan.inbox.length > 0 && (
          <>
            <h4 className="dp-heading">From your inbox</h4>
            <ul className="dp-ritual-list">
              {plan.inbox.map((t) => (
                <li key={t.id} className="dp-ritual-row">
                  <button className="icon-btn dp-add" aria-label={`Add ${t.title}`} onClick={() => act(() => api.moveTask(t.id, today))}>
                    <Plus size={14} strokeWidth={2} />
                  </button>
                  <span className="dp-title">{t.title}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    ),
  });

  steps.push({
    title: "Prioritise",
    body: (
      <>
        <h3 className="dp-ritual-title">What matters most?</h3>
        <p className="dp-ritual-lead">
          Star up to {MAX_FOCUS}: the things that would make today a good day even if nothing else got done. Give tasks a rough length so you can
          see whether the day fits.
        </p>
        <Capacity plan={plan} />
        <ul className="dp-ritual-list">
          {plan.tasks.filter((t) => !t.doneAt).map((t) => (
            <PriorityRow key={t.id} task={t} focusFull={focusFull} act={act} />
          ))}
        </ul>
      </>
    ),
  });

  steps.push({
    title: "Schedule",
    body: (
      <>
        <h3 className="dp-ritual-title">Give it time</h3>
        <p className="dp-ritual-lead">
          {unscheduled.length
            ? `${unscheduled.length} task${unscheduled.length === 1 ? " has" : "s have"} no time yet. Axiom can place them in your free time, top priorities first. You can drag them anywhere afterwards.`
            : "Everything has a time. You can still drag blocks around on the timeline."}
        </p>
        {unscheduled.length > 0 && (
          <button
            className="btn"
            onClick={() =>
              act(async () => setScheduled(await api.fitIntoDay(today, Math.max(nowMinute(), plan.settings.dayStartMinute))))
            }
          >
            Fit into my day
          </button>
        )}
        {scheduled && (
          <p className="dp-ritual-result">
            {scheduled.scheduled.length ? `Scheduled ${scheduled.scheduled.join(", ")}.` : "Nothing more fitted."}
            {scheduled.leftOver.length > 0 && ` No room left for ${scheduled.leftOver.join(", ")}: consider moving ${scheduled.leftOver.length === 1 ? "it" : "them"} to another day.`}
          </p>
        )}
        <label className="dp-ritual-field">
          <span className="field-label">What would make today a success?</span>
          <input value={intention} placeholder="e.g. Send the report and leave on time" onChange={(e) => setIntention(e.currentTarget.value)} />
        </label>
      </>
    ),
  });

  return (
    <RitualFrame
      icon={<Sunrise size={16} strokeWidth={1.75} />}
      name="Plan your day"
      steps={steps}
      finishLabel="Start the day"
      onFinish={() => act(() => api.updateDay(today, { intention, planned: true })).then(onClose)}
      onClose={onClose}
    />
  );
}

// ---------- Shutdown ----------

type Leftover = "tomorrow" | "inbox" | "drop";

/** The evening ritual: close out today, see where the time went, reflect,
 * and set up tomorrow. */
export function ShutdownRitual({ plan, today, act, onClose }: RitualProps) {
  const tomorrow = addDays(today, 1);
  const done = plan.tasks.filter((t) => t.doneAt);
  const open = plan.tasks.filter((t) => !t.doneAt);
  const [choices, setChoices] = useState<Record<string, Leftover>>(() => Object.fromEntries(open.map((t) => [t.id, "tomorrow" as Leftover])));
  const [wentWell, setWentWell] = useState(plan.info.wentWell);
  const [doBetter, setDoBetter] = useState(plan.info.doBetter);
  const [next, setNext] = useState<DayPlan | null>(null);
  const [finished, setFinished] = useState(false);
  // Counted when the ritual opens: unfinished tasks move away along the way.
  const [counts] = useState({ done: done.length, total: plan.tasks.length });
  const loadTomorrow = async () => setNext(await api.getDay(tomorrow, today));

  // Planned against actual, from tasks that have both.
  const timed = plan.tasks.filter((t) => t.estimateMinutes && trackedMinutes(t) >= 1);
  const estimated = timed.reduce((n, t) => n + t.estimateMinutes!, 0);
  const actual = timed.reduce((n, t) => n + trackedMinutes(t), 0);
  const ratio = estimated ? actual / estimated : null;
  const verdict =
    ratio === null
      ? "Start a timer on tasks tomorrow to see how your estimates compare with reality."
      : ratio > 1.1
        ? `Tasks took ${ratio.toFixed(1)}× as long as you estimated. Adding a little to tomorrow's estimates will make the plan more honest.`
        : ratio < 0.9
          ? `Tasks took less time than you estimated (${ratio.toFixed(1)}×). Nice.`
          : "Your estimates were spot on today.";

  if (finished) {
    return (
      <div className="dp-ritual-backdrop">
        <div className="dp-ritual dp-ritual-complete" role="dialog" aria-label="Shutdown complete">
          <span className="dp-complete-mark">
            <Check size={30} strokeWidth={2.5} />
          </span>
          <h3 className="dp-ritual-title">Shutdown complete</h3>
          <p className="dp-ritual-lead">
            {counts.total
              ? `You finished ${counts.done} of ${counts.total} task${counts.total === 1 ? "" : "s"} today. `
              : ""}
            Everything has a place, so you can switch off.
          </p>
          <button className="btn" onClick={onClose}>
            See you tomorrow
          </button>
        </div>
      </div>
    );
  }

  const steps: Step[] = [
    {
      title: "Review",
      body: (
        <>
          <h3 className="dp-ritual-title">How did today go?</h3>
          {done.length > 0 && (
            <>
              <h4 className="dp-heading">Done · {done.length}</h4>
              <ul className="dp-ritual-list">
                {done.map((t) => (
                  <li key={t.id} className="dp-ritual-row is-done">
                    <Check size={14} strokeWidth={2.5} className="dp-ritual-tick" />
                    <span className="dp-title">{t.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {open.length > 0 ? (
            <>
              <h4 className="dp-heading">Not done · {open.length}</h4>
              <p className="dp-ritual-lead">That's normal. Decide where each one goes so nothing's left hanging.</p>
              <ul className="dp-ritual-list">
                {open.map((t) => (
                  <li key={t.id} className="dp-ritual-row">
                    <span className="dp-title">{t.title}</span>
                    <Choice<Leftover>
                      value={choices[t.id] ?? "tomorrow"}
                      options={[["tomorrow", "Tomorrow"], ["inbox", "Inbox"], ["drop", "Drop"]]}
                      onChange={(v) => setChoices({ ...choices, [t.id]: v })}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            plan.tasks.length > 0 && <p className="dp-ritual-lead">Everything you planned is done.</p>
          )}
          {plan.tasks.length === 0 && <p className="dp-ritual-lead">Nothing was planned today.</p>}
        </>
      ),
    },
    {
      title: "Time",
      body: (
        <>
          <h3 className="dp-ritual-title">Where the time went</h3>
          <p className="dp-ritual-lead">{verdict}</p>
          <table className="dp-time-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Estimated</th>
                <th>Tracked</th>
              </tr>
            </thead>
            <tbody>
              {plan.tasks.map((t) => {
                const tracked = trackedMinutes(t);
                return (
                  <tr key={t.id}>
                    <td>{t.title}</td>
                    <td>{t.estimateMinutes ? duration(t.estimateMinutes) : "—"}</td>
                    <td className={t.estimateMinutes && tracked > t.estimateMinutes * 1.1 ? "is-over" : undefined}>{tracked >= 1 ? duration(Math.round(tracked)) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ),
    },
    {
      title: "Reflect",
      body: (
        <>
          <h3 className="dp-ritual-title">Two quick questions</h3>
          <p className="dp-ritual-lead">A sentence each is plenty. Skip them if you like.</p>
          <label className="dp-ritual-field">
            <span className="field-label">What went well?</span>
            <textarea rows={3} value={wentWell} onChange={(e) => setWentWell(e.currentTarget.value)} />
          </label>
          <label className="dp-ritual-field">
            <span className="field-label">What would you do differently?</span>
            <textarea rows={3} value={doBetter} onChange={(e) => setDoBetter(e.currentTarget.value)} />
          </label>
        </>
      ),
      // Leaving reflection: unfinished tasks go where they were sent.
      onNext: async () => {
        const running = plan.running && plan.tasks.some((t) => t.id === plan.running!.id) ? plan.running : null;
        await act(async () => {
          if (running) await api.stopTimer(running.id);
          for (const t of open) {
            const to = choices[t.id] ?? "tomorrow";
            if (to === "tomorrow") await api.moveTask(t.id, tomorrow);
            else if (to === "inbox") await api.moveTask(t.id, null);
            else await api.deleteTask(t.id);
          }
        });
        await loadTomorrow();
      },
    },
    {
      title: "Tomorrow",
      body: (
        <>
          <h3 className="dp-ritual-title">Set up tomorrow</h3>
          <p className="dp-ritual-lead">Star what matters most, so tomorrow starts with a plan instead of a list.</p>
          <QuickAddLine
            placeholder="Add something for tomorrow…"
            onAdd={(text) => act(() => api.quickAdd(text, tomorrow, today)).then(loadTomorrow)}
          />
          {next && next.tasks.length > 0 ? (
            <ul className="dp-ritual-list">
              {next.tasks.map((t) => (
                <PriorityRow
                  key={t.id}
                  task={t}
                  focusFull={next.tasks.filter((x) => x.focusRank !== null).length >= MAX_FOCUS}
                  act={(change) => act(change).then(loadTomorrow)}
                />
              ))}
            </ul>
          ) : (
            <p className="dp-hint">Nothing planned for tomorrow yet.</p>
          )}
        </>
      ),
    },
  ];

  return (
    <RitualFrame
      icon={<Moon size={16} strokeWidth={1.75} />}
      name="Shut down"
      steps={steps}
      finishLabel="Shutdown complete"
      onFinish={() => act(() => api.updateDay(today, { wentWell, doBetter, shutDown: true })).then(() => setFinished(true))}
      onClose={onClose}
    />
  );
}
