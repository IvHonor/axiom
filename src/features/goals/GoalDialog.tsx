import { useEffect, useState, type FormEvent } from "react";
import { Target } from "lucide-react";
import { Modal } from "../../shell/ui/Modal";
import { addDays, today } from "../daily_plan/time";
import { AREAS, api, errorMessage, type Goal, type GoalFields, type Kind, type Source, type Sources } from "./api";
import { goalsChanged, setGoalsUi } from "./goalsUi";

const KINDS: { id: Kind; label: string; example: string; emoji: string }[] = [
  { id: "target", label: "A number to reach", example: "Save £5,000 · Run 500 km · Read 24 books", emoji: "📈" },
  { id: "milestones", label: "Milestones", example: "Steps to tick off, or a project's cards", emoji: "🪜" },
  { id: "once", label: "Just do it", example: "Climb Snowdon · Get a driving licence", emoji: "✅" },
];

/** The last day of this month, quarter or year. */
function endOf(span: "month" | "quarter" | "year"): string {
  const [y, m] = today().split("-").map(Number);
  const month = span === "month" ? m : span === "quarter" ? Math.ceil(m / 3) * 3 : 12;
  const last = new Date(y, month, 0, 12);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

const blank = (): GoalFields => ({
  title: "",
  icon: "",
  area: "personal",
  kind: "target",
  source: "manual",
  sourceId: "",
  startValue: 0,
  targetValue: 0,
  unit: "",
  measure: "total",
  startDate: today(),
  dueDate: endOf("year"),
  why: "",
  obstacle: "",
  plan: "",
});

/** Setting a goal up, or changing it. */
export function GoalDialog({ goal, preset }: { goal: Goal | null; preset?: Partial<GoalFields> }) {
  const [fields, setFields] = useState<GoalFields>(() => (goal ? { ...goal } : { ...blank(), ...preset }));
  const [start, setStart] = useState(goal ? String(goal.startValue) : String(preset?.startValue ?? 0));
  const [target, setTarget] = useState(goal && goal.kind === "target" ? String(goal.targetValue) : preset?.targetValue ? String(preset.targetValue) : "");
  const [sources, setSources] = useState<Sources | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (change: Partial<GoalFields>) => setFields((f) => ({ ...f, ...change }));
  const close = () => setGoalsUi({ dialog: null });

  useEffect(() => {
    api.sources(today()).then(setSources, () => setSources({ accounts: [], projects: [], modules: [] }));
  }, []);

  const pickSource = (source: Source) => {
    const units: Partial<Record<Source, string>> = { reading_books: "books", reading_pages: "pages", journal_entries: "days" };
    const first = source === "finance_account" ? sources?.accounts[0] : source === "project" ? sources?.projects[0] : source === "uni_module" ? sources?.modules[0] : undefined;
    set({ source, sourceId: first?.id ?? "", unit: source === "finance_account" ? (first?.unit ?? "") : (units[source] ?? (fields.source === "manual" ? fields.unit : "")) });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const out = { ...fields, startValue: Number(start.replace(/,/g, "")) || 0, targetValue: Number(target.replace(/,/g, "")) || 0 };
    if (fields.kind === "target" && !target.trim()) return setError("What number are you aiming for?");
    setBusy(true);
    try {
      const saved = goal ? await api.update(goal.id, out, today()) : await api.create(out, today());
      setGoalsUi({ dialog: null, goal: saved.id });
      goalsChanged();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const targetSources: { id: Source; label: string; show: boolean }[] = [
    { id: "manual", label: "I'll check in myself", show: true },
    { id: "finance_account", label: "A Finance account's balance", show: !!sources?.accounts.length },
    { id: "reading_books", label: "Books I finish (Reading)", show: true },
    { id: "reading_pages", label: "Pages I read (Reading)", show: true },
    { id: "journal_entries", label: "Days I write (Journal)", show: true },
  ];
  const milestoneSources: { id: Source; label: string; show: boolean }[] = [
    { id: "manual", label: "Milestones I list", show: true },
    { id: "project", label: "A Project Board project's cards", show: !!sources?.projects.length },
    { id: "uni_module", label: "A module's lectures (University)", show: !!sources?.modules.length },
  ];
  const options = fields.kind === "target" ? targetSources : fields.kind === "milestones" ? milestoneSources : [];
  const picks = fields.source === "finance_account" ? sources?.accounts : fields.source === "project" ? sources?.projects : fields.source === "uni_module" ? sources?.modules : undefined;
  const span = (d: string | null) => fields.dueDate === d;

  return (
    <Modal title={goal ? "Edit goal" : "New goal"} icon={<Target size={16} strokeWidth={1.75} />} onClose={close}>
      <form className="gl-form" onSubmit={submit}>
        <section className="gl-step">
          <h3>What do you want to achieve?</h3>
          <div className="gl-title-row">
            <input className="gl-emoji-input" value={fields.icon} placeholder={AREAS.find((a) => a.id === fields.area)?.emoji} maxLength={4} onChange={(e) => set({ icon: e.currentTarget.value })} aria-label="Emoji (optional)" title="An emoji of its own (optional)" />
            <input className="gl-title-input" autoFocus value={fields.title} placeholder="Run a half marathon" onChange={(e) => set({ title: e.currentTarget.value })} aria-label="Goal" />
          </div>
          <div className="gl-chips" role="radiogroup" aria-label="Area of life">
            {AREAS.map((a) => (
              <button type="button" key={a.id} role="radio" aria-checked={fields.area === a.id} className={fields.area === a.id ? "is-on" : ""} style={{ ["--chip" as string]: a.color }} onClick={() => set({ area: a.id })}>
                {a.emoji} {a.label}
              </button>
            ))}
          </div>
        </section>

        <section className="gl-step">
          <h3>How will you know you've done it?</h3>
          <div className="gl-kinds" role="radiogroup" aria-label="Kind of goal">
            {KINDS.map((k) => (
              <button type="button" key={k.id} role="radio" aria-checked={fields.kind === k.id} className={`gl-kind${fields.kind === k.id ? " is-on" : ""}`} onClick={() => set({ kind: k.id, source: "manual", sourceId: "" })}>
                <span className="gl-kind-emoji">{k.emoji}</span>
                <b>{k.label}</b>
                <span className="dim">{k.example}</span>
              </button>
            ))}
          </div>
          {options.length > 0 && (
            <label className="field">
              <span className="field-label">Keep track with</span>
              <select className="gl-select" value={fields.source} onChange={(e) => pickSource(e.currentTarget.value as Source)}>
                {options.filter((o) => o.show || o.id === fields.source).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {fields.source !== "manual" && <span className="field-hint">It updates by itself as you go.</span>}
            </label>
          )}
          {picks && (
            <label className="field">
              <span className="field-label">{fields.source === "finance_account" ? "Account" : fields.source === "project" ? "Project" : "Module"}</span>
              <select className="gl-select" value={fields.sourceId} onChange={(e) => {
                const p = picks.find((x) => x.id === e.currentTarget.value);
                set({ sourceId: e.currentTarget.value, ...(fields.source === "finance_account" && p ? { unit: p.unit } : {}) });
              }}>
                {picks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {fields.kind === "target" && (
            <>
              <div className="gl-numbers">
                <label className="field">
                  <span className="field-label">{fields.source === "finance_account" ? "Starting balance" : "Starting from"}</span>
                  <input inputMode="decimal" value={start} onChange={(e) => setStart(e.currentTarget.value)} />
                </label>
                <span className="gl-arrow" aria-hidden="true">→</span>
                <label className="field">
                  <span className="field-label">Target</span>
                  <input inputMode="decimal" value={target} placeholder="500" onChange={(e) => setTarget(e.currentTarget.value)} />
                </label>
                <label className="field gl-unit">
                  <span className="field-label">Unit</span>
                  <input value={fields.unit} placeholder="km" maxLength={20} disabled={fields.source !== "manual"} onChange={(e) => set({ unit: e.currentTarget.value })} />
                </label>
              </div>
              {fields.source === "manual" && (
                <div className="gl-measure" role="radiogroup" aria-label="Check-ins">
                  <button type="button" role="radio" aria-checked={fields.measure === "total"} className={fields.measure === "total" ? "is-on" : ""} onClick={() => set({ measure: "total" })}>
                    <b>Check-ins add up</b>
                    <span className="dim">Log what you did: 5 km today, £200 saved</span>
                  </button>
                  <button type="button" role="radio" aria-checked={fields.measure === "latest"} className={fields.measure === "latest" ? "is-on" : ""} onClick={() => set({ measure: "latest" })}>
                    <b>Latest check-in counts</b>
                    <span className="dim">Log where you are: 76 kg, 5:20 per km</span>
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section className="gl-step">
          <h3>By when?</h3>
          <div className="gl-chips">
            {([
              ["End of month", endOf("month")],
              ["End of quarter", endOf("quarter")],
              ["End of year", endOf("year")],
              ["In 90 days", addDays(fields.startDate, 90)],
              ["No deadline", null],
            ] as [string, string | null][]).map(([label, d]) => (
              <button type="button" key={label} className={span(d) ? "is-on" : ""} onClick={() => set({ dueDate: d })}>
                {label}
              </button>
            ))}
          </div>
          <div className="gl-dates">
            <label className="field">
              <span className="field-label">Starting</span>
              <input type="date" value={fields.startDate} onChange={(e) => e.currentTarget.value && set({ startDate: e.currentTarget.value })} />
            </label>
            <label className="field">
              <span className="field-label">Deadline</span>
              <input type="date" value={fields.dueDate ?? ""} onChange={(e) => set({ dueDate: e.currentTarget.value || null })} />
            </label>
          </div>
          <p className="field-hint">With a deadline, you'll see whether you're on pace, and how much a week it takes from here.</p>
        </section>

        <section className="gl-step">
          <h3>
            Make it stick <span className="dim">(optional)</span>
          </h3>
          <p className="field-hint gl-woop-hint">Picturing the goal, then what's in the way, then planning for it (WOOP) makes people more likely to follow through.</p>
          <label className="field">
            <span className="field-label">Why it matters to you</span>
            <textarea className="gl-textarea" rows={2} value={fields.why} placeholder="I want to feel strong and have energy for the kids" onChange={(e) => set({ why: e.currentTarget.value })} />
          </label>
          <label className="field">
            <span className="field-label">What might get in the way</span>
            <textarea className="gl-textarea" rows={2} value={fields.obstacle} placeholder="Being tired after work and skipping runs" onChange={(e) => set({ obstacle: e.currentTarget.value })} />
          </label>
          <label className="field">
            <span className="field-label">Your plan for when it does: if… then I'll…</span>
            <textarea className="gl-textarea" rows={2} value={fields.plan} placeholder="If I'm tired after work, then I'll still go for just 10 minutes" onChange={(e) => set({ plan: e.currentTarget.value })} />
          </label>
        </section>

        {error && <p className="gl-error">{error}</p>}
        <div className="gl-form-actions">
          <button type="button" className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn" type="submit" disabled={busy || !fields.title.trim()}>
            {busy ? "Saving…" : goal ? "Save" : "Set goal"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
