import { useState, type FormEvent } from "react";
import { Archive, CheckCircle2, Flag, Pause, Pencil, Play, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { today } from "../daily_plan/time";
import { amount, api, areaOf, dueText, errorMessage, iconOf, progressText, sourceText, type Goal, type Log, type Milestone, type Status } from "./api";
import { goalsChanged, setGoalsUi, useGoal } from "./goalsUi";
import { PaceBadge, ProgressBar, Ring } from "./parts";

const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** One goal: how it's going and why, check-ins or milestones, and the plan. */
export function GoalPanel({ id }: { id: string }) {
  const { data, error } = useGoal(id);
  const [problem, setProblem] = useState<string | null>(null);
  if (error && !data) return <p className="gl-error gl-pad">{error}</p>;
  if (!data) return <p className="dim gl-pad">Opening…</p>;
  const g = data.goal;
  const area = areaOf(g.area);
  const act = (p: Promise<unknown>) => p.then(() => (setProblem(null), goalsChanged()), (err) => setProblem(errorMessage(err)));
  const status = (s: Status) => act(api.setStatus(g.id, s, today()));
  const source = sourceText(g);

  return (
    <article className="gl-goal" style={{ ["--gl-area" as string]: area.color }}>
      <header className="gl-goal-head">
        <span className="gl-icon is-big">{iconOf(g)}</span>
        <div className="gl-goal-name">
          <h2>{g.title}</h2>
          <p className="dim">
            {area.label}
            {g.dueDate && ` · by ${new Date(`${g.dueDate}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
          </p>
        </div>
        <button className="icon-btn" title="Edit" aria-label="Edit" onClick={() => setGoalsUi({ dialog: { kind: "goal", id: g.id } })}>
          <Pencil size={15} strokeWidth={1.75} />
        </button>
        <button className="icon-btn" title="Close" aria-label="Close" onClick={() => setGoalsUi({ goal: null })}>
          <X size={15} strokeWidth={1.75} />
        </button>
      </header>

      <section className="gl-standing">
        <Ring goal={g} />
        <div className="gl-standing-text">
          <b>{progressText(g)}</b>
          <PaceLine goal={g} />
          {source && <span className="dim gl-small">{source}</span>}
          <PaceBadge goal={g} />
        </div>
      </section>
      <ProgressBar goal={g} size="lg" />

      {g.status === "active" && g.reached && (
        <div className="gl-reached">
          <span>🎉</span>
          <div>
            <b>You've hit your target!</b>
            <span className="dim">Mark it achieved to celebrate and move it to your achievements.</span>
          </div>
          <button className="btn btn-sm" onClick={() => status("done")}>
            <CheckCircle2 size={14} strokeWidth={1.75} /> Achieved
          </button>
        </div>
      )}

      {g.kind === "target" && g.source === "manual" && g.status === "active" && <CheckIn goal={g} act={act} />}
      {g.kind === "target" && g.source === "manual" && data.logs.length > 0 && <Chart goal={g} logs={data.logs} />}
      {g.kind === "milestones" && g.source === "manual" && <Milestones goal={g} milestones={data.milestones} act={act} />}
      {g.kind === "once" && g.status === "active" && (
        <button className="btn gl-once" onClick={() => status("done")}>
          <CheckCircle2 size={15} strokeWidth={1.75} /> I did it
        </button>
      )}

      {(g.why || g.obstacle || g.plan) && (
        <section className="gl-woop">
          {g.why && <WoopLine label="Why it matters" text={g.why} />}
          {g.obstacle && <WoopLine label="What might get in the way" text={g.obstacle} />}
          {g.plan && <WoopLine label="My plan" text={g.plan} />}
        </section>
      )}
      {!g.why && !g.plan && g.status === "active" && (
        <button className="gl-add-woop" onClick={() => setGoalsUi({ dialog: { kind: "goal", id: g.id } })}>
          <Flag size={13} strokeWidth={1.75} /> Add why it matters and an if-then plan: it makes following through likelier
        </button>
      )}

      {data.logs.length > 0 && <History goal={g} logs={data.logs} act={act} />}
      {problem && <p className="gl-error">{problem}</p>}

      <footer className="gl-goal-foot">
        {g.status === "active" && (
          <>
            <button className="btn btn-sm btn-ghost" onClick={() => status("done")}>
              <CheckCircle2 size={13} strokeWidth={1.75} /> Mark achieved
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => status("paused")}>
              <Pause size={13} strokeWidth={1.75} /> Pause
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => status("dropped")} title="Not every goal needs finishing: letting one go is a choice too">
              <Archive size={13} strokeWidth={1.75} /> Let go
            </button>
          </>
        )}
        {g.status !== "active" && (
          <button className="btn btn-sm btn-ghost" onClick={() => status("active")}>
            {g.status === "paused" ? <Play size={13} strokeWidth={1.75} /> : <RotateCcw size={13} strokeWidth={1.75} />} {g.status === "paused" ? "Resume" : "Make active again"}
          </button>
        )}
        <span className="gl-grow" />
        <ConfirmButton
          className="btn btn-sm btn-ghost gl-delete"
          confirmText="Delete for good?"
          onConfirm={() =>
            api.remove(g.id).then(() => {
              setGoalsUi({ goal: null });
              goalsChanged();
            })
          }
        >
          <Trash2 size={13} strokeWidth={1.75} /> Delete
        </ConfirmButton>
      </footer>
    </article>
  );
}

/** Pace in words: where you'd be by now, and what it takes from here. */
function PaceLine({ goal: g }: { goal: Goal }) {
  const due = dueText(g);
  if (g.status !== "active") return g.completedOn ? <span className="dim">Achieved on {shortDay(g.completedOn)}</span> : null;
  if (g.reached) return <span className="dim">Target reached{due ? ` · ${due}` : ""}</span>;
  const parts: string[] = [];
  if (g.kind === "target" && g.expected !== null) {
    const gap = g.current - g.expected;
    const up = g.target >= g.startValue;
    const ahead = up ? gap >= 0 : gap <= 0;
    if (Math.abs(gap) > Math.abs(g.target - g.startValue) * 0.005) parts.push(`${amount(Math.abs(gap), g.unit)} ${ahead ? "ahead of" : "behind"} pace`);
    else parts.push("Right on pace");
  }
  if (g.perWeek !== null && g.kind === "target") parts.push(`${amount(Math.abs(g.perWeek), g.unit)} a week from here`);
  if (due) parts.push(due);
  return parts.length ? <span className="dim">{parts.join(" · ")}</span> : null;
}

function WoopLine({ label, text }: { label: string; text: string }) {
  return (
    <div className="gl-woop-line">
      <span className="gl-label">{label}</span>
      <p>{text}</p>
    </div>
  );
}

function CheckIn({ goal, act }: { goal: Goal; act: (p: Promise<unknown>) => void }) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [day, setDay] = useState(today());
  const latest = goal.measure === "latest";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(value.replace(/,/g, ""));
    if (!value.trim() || Number.isNaN(n)) return;
    act(api.log(goal.id, day, n, note, today()).then(() => (setValue(""), setNote(""))));
  };
  return (
    <form className="gl-checkin" onSubmit={submit}>
      <span className="gl-label">{latest ? "Where are you now?" : "Log progress"}</span>
      <div className="gl-checkin-row">
        <input className="gl-checkin-value" inputMode="decimal" value={value} placeholder={latest ? String(goal.current) : "+5"} onChange={(e) => setValue(e.currentTarget.value)} aria-label={latest ? "Where you are" : "How much"} />
        {goal.unit && <span className="dim">{goal.unit}</span>}
        <input className="gl-checkin-note" value={note} placeholder="Note (optional)" onChange={(e) => setNote(e.currentTarget.value)} aria-label="Note" />
        <input className="gl-checkin-day" type="date" value={day} max={today()} onChange={(e) => e.currentTarget.value && setDay(e.currentTarget.value)} aria-label="Day" />
        <button className="btn btn-sm" type="submit" disabled={!value.trim()}>
          <Plus size={13} strokeWidth={2} /> {latest ? "Update" : "Add"}
        </button>
      </div>
    </form>
  );
}

/** Progress over time against the straight line to the target. */
function Chart({ goal: g, logs }: { goal: Goal; logs: Log[] }) {
  const ordered = [...logs].sort((a, b) => a.day.localeCompare(b.day) || a.createdAt.localeCompare(b.createdAt));
  let running = g.startValue;
  const points: { day: string; value: number }[] = [{ day: g.startDate, value: g.startValue }];
  for (const l of ordered) {
    running = g.measure === "latest" ? l.value : running + l.value;
    points.push({ day: l.day, value: running });
  }
  const time = (d: string) => new Date(`${d}T12:00:00`).getTime();
  const end = Math.max(time(g.dueDate ?? today()), time(today()), ...points.map((p) => time(p.day)));
  const begin = Math.min(time(g.startDate), ...points.map((p) => time(p.day)));
  const values = [...points.map((p) => p.value), g.startValue, g.targetValue];
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const W = 320;
  const H = 130;
  const x = (d: string) => 8 + ((time(d) - begin) / Math.max(1, end - begin)) * (W - 16);
  const y = (v: number) => H - 14 - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 28);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const color = areaOf(g.area).color;
  return (
    <section className="gl-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Progress from ${amount(g.startValue, g.unit)} towards ${amount(g.targetValue, g.unit)}`}>
        <line x1={8} x2={W - 8} y1={y(g.targetValue)} y2={y(g.targetValue)} className="gl-chart-target" />
        {g.dueDate && <line x1={x(g.startDate)} y1={y(g.startValue)} x2={x(g.dueDate)} y2={y(g.targetValue)} className="gl-chart-pace" />}
        <line x1={x(today())} x2={x(today())} y1={6} y2={H - 10} className="gl-chart-today" />
        <path d={path} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {points.slice(1).map((p, i) => (
          <circle key={i} cx={x(p.day)} cy={y(p.value)} r="2.6" fill={color}>
            <title>
              {shortDay(p.day)}: {amount(p.value, g.unit)}
            </title>
          </circle>
        ))}
        <text x={W - 8} y={y(g.targetValue) - 4} textAnchor="end" className="gl-chart-label">
          Target {amount(g.targetValue, g.unit)}
        </text>
      </svg>
      <div className="gl-chart-key dim">
        <span>
          <i style={{ background: color }} /> You
        </span>
        {g.dueDate && (
          <span>
            <i className="is-pace" /> Steady pace
          </span>
        )}
      </div>
    </section>
  );
}

function History({ goal, logs, act }: { goal: Goal; logs: Log[]; act: (p: Promise<unknown>) => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? logs : logs.slice(0, 5);
  return (
    <section className="gl-history">
      <span className="gl-label">Check-ins</span>
      {shown.map((l) => (
        <div key={l.id} className="gl-log">
          <span className="gl-log-day">{shortDay(l.day)}</span>
          <b>{goal.measure === "latest" ? amount(l.value, goal.unit) : `${l.value >= 0 ? "+" : ""}${amount(l.value, goal.unit)}`}</b>
          <span className="dim gl-log-note">{l.note}</span>
          <button className="icon-btn" aria-label="Remove check-in" title="Remove" onClick={() => act(api.removeLog(l.id))}>
            <X size={12} strokeWidth={1.75} />
          </button>
        </div>
      ))}
      {logs.length > 5 && (
        <button className="rd-link gl-more" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${logs.length}`}
        </button>
      )}
    </section>
  );
}

function Milestones({ goal, milestones, act }: { goal: Goal; milestones: Milestone[]; act: (p: Promise<unknown>) => void }) {
  const [title, setTitle] = useState("");
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) act(api.addMilestone(goal.id, title, null).then(() => setTitle("")));
  };
  return (
    <section className="gl-milestones">
      <span className="gl-label">Milestones</span>
      {milestones.length === 0 && <p className="dim gl-small">Break it into steps you can tick off. The first one small enough to do this week.</p>}
      {milestones.map((m, i) => (
        <label key={m.id} className={`gl-milestone${m.doneOn ? " is-done" : ""}`}>
          <input type="checkbox" checked={!!m.doneOn} onChange={(e) => act(api.tickMilestone(m.id, e.currentTarget.checked, today()))} />
          <span className="gl-milestone-n">{i + 1}</span>
          <span className="gl-milestone-title">{m.title}</span>
          {m.doneOn && <span className="dim gl-small">{shortDay(m.doneOn)}</span>}
          <button type="button" className="icon-btn" aria-label={`Remove ${m.title}`} onClick={(e) => (e.preventDefault(), act(api.removeMilestone(m.id)))}>
            <X size={12} strokeWidth={1.75} />
          </button>
        </label>
      ))}
      {goal.status === "active" && (
        <form className="gl-milestone-add" onSubmit={add}>
          <input value={title} placeholder="Add a milestone…" onChange={(e) => setTitle(e.currentTarget.value)} aria-label="New milestone" />
          <button className="btn btn-sm" type="submit" disabled={!title.trim()}>
            <Plus size={13} strokeWidth={2} /> Add
          </button>
        </form>
      )}
    </section>
  );
}
