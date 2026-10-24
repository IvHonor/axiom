import { Archive, CheckCircle2, Plus, Target } from "lucide-react";
import type { AreaSidebarProps } from "../../extensions/types";
import { Section } from "../../shell/ui/Section";
import { AREAS, iconOf } from "./api";
import { setGoalsUi, useGoals, useGoalsUi, type Shelf } from "./goalsUi";
import { ProgressBar } from "./parts";

/** The Goals side panel: shelves, the active goals at a glance, and areas. */
export function GoalsSidebar({ active, onOpen }: AreaSidebarProps) {
  const ui = useGoalsUi();
  const { data: goals } = useGoals();
  const go = (change: Parameters<typeof setGoalsUi>[0]) => {
    setGoalsUi(change);
    onOpen();
  };
  const shelf = (id: Shelf, label: string, Icon: typeof Target, count: number) => (
    <button className={`nav-item${active && ui.shelf === id && !ui.area ? " is-active" : ""}`} onClick={() => go({ shelf: id, area: null })}>
      <Icon size={14} strokeWidth={1.5} />
      <span className="bs-name">{label}</span>
      {count > 0 && <span className="gs-count">{count}</span>}
    </button>
  );
  const all = goals ?? [];
  const running = all.filter((g) => g.status === "active");

  return (
    <>
      <Section title="Goals">
        {shelf("active", "Active", Target, running.length)}
        {shelf("achieved", "Achieved", CheckCircle2, all.filter((g) => g.status === "done").length)}
        {shelf("all", "All goals", Archive, all.length)}
        <button className="nav-item" onClick={() => go({ dialog: { kind: "goal", id: null } })}>
          <Plus size={14} strokeWidth={1.5} />
          <span className="bs-name">New goal</span>
        </button>
      </Section>
      {running.length > 0 && (
        <Section title="In progress" count={running.length}>
          <div className="gs-goals">
            {running.slice(0, 8).map((g) => (
              <button key={g.id} className={`gs-goal${active && ui.goal === g.id ? " is-active" : ""}`} onClick={() => go({ goal: g.id, shelf: "active" })}>
                <span className="gs-goal-top">
                  <span>{iconOf(g)}</span>
                  <span className="gs-goal-name">{g.title}</span>
                  <span className="gs-goal-pct">{Math.round(g.percent)}%</span>
                </span>
                <ProgressBar goal={g} size="sm" />
              </button>
            ))}
          </div>
        </Section>
      )}
      {all.length > 0 && (
        <Section title="Areas">
          {AREAS.filter((a) => all.some((g) => g.area === a.id && g.status !== "dropped")).map((a) => (
            <button key={a.id} className={`nav-item${active && ui.area === a.id ? " is-active" : ""}`} onClick={() => go({ area: a.id, shelf: "all" })}>
              <span aria-hidden="true">{a.emoji}</span>
              <span className="bs-name">{a.label}</span>
              <span className="gs-count">{all.filter((g) => g.area === a.id && g.status === "active").length || ""}</span>
            </button>
          ))}
        </Section>
      )}
    </>
  );
}
