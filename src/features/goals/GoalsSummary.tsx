import { useTileLayout } from "../../shell/ui/ResizableTile";
import { iconOf, PACE } from "./api";
import { setGoalsUi, useGoals } from "./goalsUi";
import { ProgressBar } from "./parts";

/** The overview tile: active goals with their bars, as many as fit. */
export function GoalsSummary({ onOpen }: { onOpen: () => void }) {
  const { height } = useTileLayout();
  const { data: goals, error } = useGoals();
  const show = (change: Parameters<typeof setGoalsUi>[0]) => {
    setGoalsUi({ shelf: "active", area: null, ...change });
    onOpen();
  };
  if (!goals) return <button className="gt-status" onClick={() => show({})}>{error ? "Goals unavailable. Open Goals" : "Loading goals…"}</button>;
  const running = goals.filter((g) => g.status === "active");
  if (running.length === 0) {
    return (
      <button className="gt-empty" onClick={() => show({ dialog: { kind: "goal", id: null } })}>
        <span className="gt-empty-emoji">🎯</span>
        <b>Set your first goal</b>
        <span className="dim">See how far you've come, and whether you're on pace.</span>
      </button>
    );
  }
  const behind = running.filter((g) => g.pace === "behind").length;
  const fits = Math.max(1, Math.floor((height - 34) / 50));
  return (
    <div className="gt-summary">
      <div className="gt-list">
        {running.slice(0, fits).map((g) => (
          <button key={g.id} className="gt-goal" onClick={() => show({ goal: g.id })} title={g.title}>
            <span className="gt-goal-top">
              <span aria-hidden="true">{iconOf(g)}</span>
              <span className="gt-name">{g.title}</span>
              {g.pace && !g.reached && <span className={`gt-pace ${PACE[g.pace].tone}`}>{PACE[g.pace].label}</span>}
              <b className="gt-pct">{Math.round(g.percent)}%</b>
            </span>
            <ProgressBar goal={g} size="sm" />
          </button>
        ))}
      </div>
      <footer className="gt-foot">
        <span className="dim">
          {running.length} active{behind > 0 && ` · ${behind} behind`}
        </span>
        {running.length > fits && <button className="rd-link" onClick={() => show({})}>+{running.length - fits} more</button>}
      </footer>
    </div>
  );
}
