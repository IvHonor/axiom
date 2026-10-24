import { Plus, Target } from "lucide-react";
import { today } from "../daily_plan/time";
import { AREAS, type Goal, type GoalFields } from "./api";
import { GoalDialog } from "./GoalDialog";
import { GoalPanel } from "./GoalPanel";
import { setGoalsUi, useGoals, useGoalsUi, type Shelf } from "./goalsUi";
import { GoalCard } from "./parts";
import { VaultLockBanner } from "../../shell/account/Encryption";

const SHELVES: { id: Shelf; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "achieved", label: "Achieved" },
  { id: "all", label: "All" },
];

const yearEnd = () => `${today().slice(0, 4)}-12-31`;

/** Starting points for a first goal, each set up to edit. */
const IDEAS: { label: string; preset: Partial<GoalFields> }[] = [
  { label: "💰 Save £1,000", preset: { title: "Save £1,000", area: "money", kind: "target", targetValue: 1000, unit: "£", measure: "total" } },
  { label: "💪 Run 100 km", preset: { title: "Run 100 km", area: "health", kind: "target", targetValue: 100, unit: "km", measure: "total" } },
  { label: "📚 Read 12 books", preset: { title: "Read 12 books this year", area: "learning", kind: "target", source: "reading_books", targetValue: 12, unit: "books" } },
  { label: "📓 Journal 50 days", preset: { title: "Journal 50 days", area: "personal", kind: "target", source: "journal_entries", targetValue: 50, unit: "days" } },
  { label: "💼 Launch a project", preset: { title: "Launch my side project", area: "career", kind: "milestones" } },
  { label: "🏔️ Climb a mountain", preset: { title: "Climb Snowdon", area: "fun", kind: "once" } },
];

/** Goals: what you're working towards, and whether you're on pace. */
export function GoalsView() {
  const ui = useGoalsUi();
  const { data: goals, error } = useGoals();
  const editing = ui.dialog?.kind === "goal" ? ui.dialog : null;

  const onShelf = (g: Goal) => (ui.shelf === "active" ? g.status === "active" || g.status === "paused" : ui.shelf === "achieved" ? g.status === "done" : true);
  const shown = (goals ?? []).filter(onShelf).filter((g) => !ui.area || g.area === ui.area);
  const active = (goals ?? []).filter((g) => g.status === "active");
  const year = today().slice(0, 4);
  const doneThisYear = (goals ?? []).filter((g) => g.status === "done" && g.completedOn?.startsWith(year)).length;

  return (
    <div className="gl-view">
      <header className="pb-toolbar">
        <nav className="pb-tabs" aria-label="Goals">
          {SHELVES.map((s) => (
            <button key={s.id} className={`pb-tab${ui.shelf === s.id ? " is-active" : ""}`} onClick={() => setGoalsUi({ shelf: s.id })}>
              {s.label}
            </button>
          ))}
        </nav>
        <button className="btn btn-sm" onClick={() => setGoalsUi({ dialog: { kind: "goal", id: null } })}>
          <Plus size={14} strokeWidth={1.75} /> New goal
        </button>
      </header>
      <div className="gl-banner">
        <VaultLockBanner subject="goals" />
      </div>
      {error && <p className="gl-error gl-pad">{error}</p>}
      {goals && (
        <div className={`gl-split${ui.goal ? " has-goal" : ""}`}>
          <main className="gl-main">
            {goals.length === 0 ? (
              <Welcome />
            ) : (
              <div className="gl-page">
                {ui.shelf === "active" && (
                  <div className="gl-stats">
                    <Stat value={active.length} label="Active" />
                    <Stat value={active.filter((g) => g.pace === "on_track" || g.pace === "ahead" || g.reached).length} label="On track" tone="is-on-track" />
                    <Stat value={active.filter((g) => g.pace === "behind").length} label="Behind" tone="is-behind" />
                    <Stat value={doneThisYear} label={`Achieved in ${year}`} tone="is-done" />
                  </div>
                )}
                <div className="gl-chips gl-filter" aria-label="Areas">
                  <button className={!ui.area ? "is-on" : ""} onClick={() => setGoalsUi({ area: null })}>
                    Every area
                  </button>
                  {AREAS.filter((a) => goals.some((g) => g.area === a.id && onShelf(g))).map((a) => (
                    <button key={a.id} className={ui.area === a.id ? "is-on" : ""} style={{ ["--chip" as string]: a.color }} onClick={() => setGoalsUi({ area: ui.area === a.id ? null : a.id })}>
                      {a.emoji} {a.label}
                    </button>
                  ))}
                </div>
                {shown.length === 0 ? (
                  <p className="dim gl-empty">{ui.shelf === "achieved" ? "Goals you achieve land here, to look back on." : "Nothing here."}</p>
                ) : (
                  <div className="gl-cards">
                    {shown.map((g) => (
                      <GoalCard key={g.id} goal={g} open={ui.goal === g.id} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>
          {ui.goal && (
            <aside className="gl-side">
              <GoalPanel key={ui.goal} id={ui.goal} />
            </aside>
          )}
        </div>
      )}
      {editing && <GoalDialog goal={goals?.find((g) => g.id === editing.id) ?? null} preset={editing.preset} />}
    </div>
  );
}

function Stat({ value, label, tone = "" }: { value: number; label: string; tone?: string }) {
  return (
    <div className={`gl-stat ${tone}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function Welcome() {
  return (
    <div className="gl-welcome">
      <Target size={40} strokeWidth={1.25} />
      <h1>What are you working towards?</h1>
      <p className="dim">Set a goal and see how far you've come, and whether you're on pace to get there. Goals can follow your other extensions by themselves: a savings account, the books you finish, the days you journal, a project's cards.</p>
      <div className="gl-ideas">
        {IDEAS.map((i) => (
          <button key={i.label} onClick={() => setGoalsUi({ dialog: { kind: "goal", id: null, preset: { dueDate: yearEnd(), ...i.preset } } })}>
            {i.label}
          </button>
        ))}
      </div>
      <button className="btn" onClick={() => setGoalsUi({ dialog: { kind: "goal", id: null } })}>
        <Plus size={14} strokeWidth={1.75} /> Set your own
      </button>
    </div>
  );
}
