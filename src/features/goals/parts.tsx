import { CheckCircle2, Link2, PauseCircle } from "lucide-react";
import { PACE, areaOf, dueText, iconOf, progressText, sourceText, type Goal } from "./api";
import { setGoalsUi } from "./goalsUi";

/** Where where you should be by now falls on the bar, 0 to 100. */
export function expectedPercent(g: Goal): number | null {
  if (g.expected === null) return null;
  const start = g.kind === "target" ? g.startValue : 0;
  const span = g.target - start;
  return span ? Math.max(0, Math.min(100, ((g.expected - start) / span) * 100)) : null;
}

/** The bar, filled to where it is, with a tick where it should be by now. */
export function ProgressBar({ goal, size = "md" }: { goal: Goal; size?: "sm" | "md" | "lg" }) {
  const mark = goal.status === "active" ? expectedPercent(goal) : null;
  const tone = goal.reached || goal.status === "done" ? "is-done" : goal.pace ? PACE[goal.pace].tone : "";
  return (
    <span className={`gl-bar is-${size} ${tone}`} role="progressbar" aria-valuenow={Math.round(goal.percent)} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.title}: ${Math.round(goal.percent)}%`}>
      <span className="gl-bar-fill" style={{ width: `${goal.percent}%`, background: goal.pace === "behind" ? undefined : areaOf(goal.area).color }} />
      {mark !== null && mark > 0 && mark < 100 && <span className="gl-bar-mark" style={{ left: `${mark}%` }} title="Where you'd be at a steady pace" />}
    </span>
  );
}

export function PaceBadge({ goal }: { goal: Goal }) {
  if (goal.status === "done") return <span className="gl-badge is-done"><CheckCircle2 size={12} strokeWidth={2} /> Achieved</span>;
  if (goal.status === "paused") return <span className="gl-badge is-paused"><PauseCircle size={12} strokeWidth={2} /> Paused</span>;
  if (goal.status === "dropped") return <span className="gl-badge is-paused">Let go</span>;
  if (goal.reached) return <span className="gl-badge is-done">🎉 Reached</span>;
  if (!goal.pace) return null;
  return <span className={`gl-badge ${PACE[goal.pace].tone}`}>{PACE[goal.pace].label}</span>;
}

export function GoalCard({ goal, open }: { goal: Goal; open: boolean }) {
  const area = areaOf(goal.area);
  const source = sourceText(goal);
  const due = goal.status === "active" ? dueText(goal) : goal.completedOn ? `Achieved ${new Date(goal.completedOn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : null;
  return (
    <button className={`gl-card${open ? " is-active" : ""}${goal.status !== "active" ? ` is-${goal.status}` : ""}`} style={{ ["--gl-area" as string]: area.color }} onClick={() => setGoalsUi({ goal: goal.id })}>
      <span className="gl-card-top">
        <span className="gl-icon" aria-hidden="true">
          {iconOf(goal)}
        </span>
        <span className="gl-card-title">
          <b>{goal.title}</b>
          <span className="dim">{area.label}</span>
        </span>
        <PaceBadge goal={goal} />
      </span>
      <span className="gl-card-progress">
        <span className="gl-card-numbers">
          <b>{Math.round(goal.percent)}%</b>
          <span className="dim">{progressText(goal)}</span>
        </span>
        <ProgressBar goal={goal} />
      </span>
      <span className="gl-card-foot dim">
        {due && <span>{due}</span>}
        {source && (
          <span className="gl-linked" title={source}>
            <Link2 size={11} strokeWidth={2} /> {source}
          </span>
        )}
      </span>
    </button>
  );
}

/** A ring of progress, for the goal page. */
export function Ring({ goal, size = 88 }: { goal: Goal; size?: number }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const color = goal.pace === "behind" ? "var(--danger)" : areaOf(goal.area).color;
  return (
    <span className="gl-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hover)" strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(goal.percent / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="gl-ring-text">
        <b>{Math.round(goal.percent)}%</b>
      </span>
    </span>
  );
}
